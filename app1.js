/* ============================================================
   POSTMANWEB v4 — app1.js  (Module 1 of 2)
   ============================================================ */
'use strict';

// ─────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────
var S = {
  tabs:        [],
  activeId:    null,
  workspaces:  load('pw_ws',      [{ id:'ws_default', name:'My Workspace' }]),
  activeWS:    load('pw_aws',     'ws_default'),
  collections: load('pw_colls',   []),
  envs:        load('pw_envs',    []),
  activeEnv:   load('pw_aenv',    null),
  history:     fixHistory(load('pw_hist', [])),
  globals:     load('pw_globals', {}),
  cookies:     load('pw_cookies', {}),
  mocks:       load('pw_mocks',   []),
  settings:    load('pw_settings', {
    corsEnabled: false,
    proxyUrl:    'https://square-credit-8186.donthulanithish53.workers.dev/?url=',
    historyOn:   true,
    theme:       'dark',
  }),
  /** Named buckets of request snapshots for looped runs */
  buckets:     load('pw_buckets', []),
};

function fixHistory(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(function(h){ return Object.assign({}, h, { pinned: h.pinned === true }); });
}

var _bodyType    = 'none';
/** form-data: false = table, true = bulk textarea. Same for urlencoded. */
var _formBulkMode = false;
var _urlencBulkMode = false;
var _testResults = [];
var _consoleLogs = [];
var _abortCtrl   = null;
var _wsConn      = null;
var _localVars   = {};
var _iterInfo    = { iteration:0, iterationCount:1, dataRow:{} };
var _lastResponse = null;
var _advEntry    = null;
var _advRunning  = false;
/** Persisted multi-send job for resume after tab close/reload (best-effort; true background needs a server). */
var REPEAT_JOB_KEY = 'pw_repeat_job';

// ─────────────────────────────────────────────────────────────
// STORAGE
// ─────────────────────────────────────────────────────────────
function load(k, def) {
  try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; }
  catch(e) { return def; }
}
function save() {
  try {
    localStorage.setItem('pw_colls',    JSON.stringify(S.collections));
    localStorage.setItem('pw_envs',     JSON.stringify(S.envs));
    localStorage.setItem('pw_aenv',     JSON.stringify(S.activeEnv));
    localStorage.setItem('pw_hist',     JSON.stringify(S.history.slice(0, 500)));
    localStorage.setItem('pw_globals',  JSON.stringify(S.globals));
    localStorage.setItem('pw_cookies',  JSON.stringify(S.cookies));
    localStorage.setItem('pw_mocks',    JSON.stringify(S.mocks));
    localStorage.setItem('pw_settings', JSON.stringify(S.settings));
    localStorage.setItem('pw_ws',       JSON.stringify(S.workspaces));
    localStorage.setItem('pw_aws',      JSON.stringify(S.activeWS));
    localStorage.setItem('pw_buckets',   JSON.stringify(S.buckets || []));
  } catch(e) { console.error('Save error', e); }
}

// ─────────────────────────────────────────────────────────────
// PRIVATE IP DETECTION
// ─────────────────────────────────────────────────────────────
var PRIV = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^169\.254\.\d+\.\d+$/,
  /^::1$/, /^0\.0\.0\.0$/,
];
function isPrivate(urlStr) {
  try { return PRIV.some(function(p){ return p.test(new URL(urlStr).hostname); }); }
  catch(e) { return false; }
}
function refreshDirectBadge(urlStr) {
  var b = document.getElementById('direct-badge');
  if (b) b.classList.toggle('visible', isPrivate(urlStr || ''));
}

// ─────────────────────────────────────────────────────────────
// CONTENT TYPE HELPERS
// ─────────────────────────────────────────────────────────────
function getContentType(r) {
  return ((r && r._headers && (r._headers['content-type'] || r._headers['Content-Type'])) || '').toLowerCase();
}
function isJsonResponse(r) {
  var ct = getContentType(r);
  return ct.indexOf('json') !== -1 || /^\s*[\[{]/.test((r && r._body) || '');
}
function isHtmlResponse(r) {
  if (!r) return false;
  var ct = getContentType(r);
  if (ct.indexOf('text/html') !== -1 || ct.indexOf('application/xhtml') !== -1) return true;
  var body = ((r._body || '').trimLeft()).toLowerCase();
  return body.indexOf('<!doctype') === 0 || body.indexOf('<html') === 0 || body.indexOf('<head') === 0 || body.indexOf('<body') === 0;
}
function isXmlResponse(r) {
  return getContentType(r).indexOf('xml') !== -1;
}
function isImageResponse(r) {
  return getContentType(r).indexOf('image/') === 0;
}
function isBinaryResponse(r) {
  var ct = getContentType(r);
  var bins = ['application/octet-stream','application/pdf','application/zip','application/gzip','audio/','video/','font/'];
  return bins.some(function(t){ return ct.indexOf(t) === 0; }) || (r && r._isBinary === true);
}
function getResponseLabel(r) {
  var ct = getContentType(r);
  if (!ct) return '';
  if (ct.indexOf('json')       !== -1) return 'JSON';
  if (ct.indexOf('text/html')  !== -1) return 'HTML';
  if (ct.indexOf('xml')        !== -1) return 'XML';
  if (ct.indexOf('text/plain') !== -1) return 'TEXT';
  if (ct.indexOf('image/')     === 0)  return 'IMAGE';
  if (ct.indexOf('pdf')        !== -1) return 'PDF';
  if (ct.indexOf('csv')        !== -1) return 'CSV';
  var parts = ct.split(';')[0].split('/');
  return parts[1] ? parts[1].toUpperCase() : 'BINARY';
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function sleep(ms) { return new Promise(function(r){ setTimeout(r, ms); }); }

/**
 * Global throttle: at most 900 outbound HTTP calls per rolling 1-second window.
 * Example: 9000 “Attack” repeats → ~900 run as fast as the network allows, then the rest
 * wait in a queue until older calls fall outside the 1s window — effectively ~900 per second,
 * never more than 900 in any 1000ms slice. Applies to Send, Attack, Collection runner, Buckets, pm.sendRequest.
 */
var MAX_REQUESTS_PER_SECOND = 900;
var _rateWindow = [];
async function acquireRateSlot() {
  for (;;) {
    var now = Date.now();
    while (_rateWindow.length && now - _rateWindow[0] >= 1000) _rateWindow.shift();
    if (_rateWindow.length < MAX_REQUESTS_PER_SECOND) {
      _rateWindow.push(now);
      return;
    }
    var wait = Math.max(0, 1000 - (now - _rateWindow[0])) + 1;
    await sleep(wait);
  }
}
async function rateLimitedFetch(url, opts) {
  await acquireRateSlot();
  return fetch(url, opts);
}

function backoffAttempt(n) {
  return Math.min(8000, 80 * Math.pow(2, Math.min(n, 12)));
}

/**
 * Runs executeRequestObject until 2xx success or maxRetries; retries network errors and non-2xx ("rejected") responses.
 */
async function executeRequestWithRetry(snapshot, dataRow, opts) {
  dataRow = dataRow || {};
  opts = opts || {};
  var signal = opts.signal;
  var maxRetries = opts.maxRetries !== undefined ? opts.maxRetries : 999;
  var retryTotal = opts.retryTotal;
  var onRetry = opts.onRetry;
  var n = 0;
  while (true) {
    if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
    var ro;
    try {
      ro = await executeRequestObject(snapshot, dataRow, { signal: signal });
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      n++;
      if (retryTotal) retryTotal.v++;
      if (onRetry) onRetry(n);
      if (n > maxRetries) throw e;
      await sleep(backoffAttempt(n));
      continue;
    }
    if (ro.status >= 200 && ro.status < 300) return ro;
    n++;
    if (retryTotal) retryTotal.v++;
    if (onRetry) onRetry(n);
    if (n > maxRetries) return ro;
    await sleep(backoffAttempt(n));
  }
}

function readRepeatJob() {
  try {
    var j = localStorage.getItem(REPEAT_JOB_KEY);
    return j ? JSON.parse(j) : null;
  } catch (e) { return null; }
}
function writeRepeatJob(job) {
  try {
    if (!job) localStorage.removeItem(REPEAT_JOB_KEY);
    else localStorage.setItem(REPEAT_JOB_KEY, JSON.stringify(job));
  } catch (e) { /* quota */ }
}
function clearRepeatJob() {
  writeRepeatJob(null);
}

function updateRepeatStatsBar(o) {
  var bar = document.getElementById('repeat-stats-bar');
  if (!bar) return;
  var sent = document.getElementById('repeat-st-sent');
  var ok = document.getElementById('repeat-st-ok');
  var fail = document.getElementById('repeat-st-fail');
  var ret = document.getElementById('repeat-st-retry');
  var q = document.getElementById('repeat-st-q');
  if (sent) sent.textContent = 'Sent: ' + (o.sent != null ? o.sent : 0) + ' / ' + (o.total != null ? o.total : '—');
  if (ok) ok.textContent = 'OK: ' + (o.success != null ? o.success : 0);
  if (fail) fail.textContent = 'Fail: ' + (o.failed != null ? o.failed : 0);
  if (ret) ret.textContent = 'Retries: ' + (o.retries != null ? o.retries : 0);
  if (q) q.textContent = 'Queued: ' + (o.queued != null ? o.queued : 0);
}

function emitRepeatStats(config, o) {
  if (config && typeof config.onStats === 'function') try { config.onStats(o); } catch (e) {}
  updateRepeatStatsBar(o);
}

/**
 * Shared runner: queue = strict sequential; burst = up to 900 concurrent starts per wave (900/s cap via limiter).
 */
async function runRepeatBatch(config) {
  var snapshot = config.snapshot;
  var total = config.total;
  var mode = config.mode === 'burst' ? 'burst' : 'queue';
  var delayMs = Math.max(0, config.delayMs || 0);
  var signal = config.signal;
  var startIndex = Math.max(0, config.startIndex || 0);
  var rawUrl = config.rawUrl || '';
  var method = config.method || 'GET';
  var tab = config.tab;
  var retryTotal = { v: config.initialRetries || 0 };
  var success = config.initialSuccess || 0;
  var failed = config.initialFailed || 0;
  var persist = config.persist !== false;

  function persistState(done) {
    if (!persist) return;
    writeRepeatJob({
      v: 1,
      total: total,
      done: done,
      success: success,
      failed: failed,
      retries: retryTotal.v,
      mode: mode,
      snapshot: snapshot,
      rawUrl: rawUrl,
      method: method,
      active: done < total
    });
  }

  var lastRo = null;
  var i = startIndex;

  if (mode === 'queue') {
    for (; i < total; i++) {
      if (signal && signal.aborted) break;
      var ro = await executeRequestWithRetry(snapshot, {}, {
        signal: signal,
        retryTotal: retryTotal,
        onRetry: function() { emitRepeatStats(config, { total: total, sent: i, success: success, failed: failed, retries: retryTotal.v, queued: total - i }); persistState(i); }
      });
      lastRo = ro;
      if (ro.status >= 200 && ro.status < 300) success++;
      else failed++;
      emitRepeatStats(config, { total: total, sent: i + 1, success: success, failed: failed, retries: retryTotal.v, queued: total - i - 1 });
      persistState(i + 1);
      if (delayMs > 0 && i < total - 1) await sleep(delayMs);
    }
  } else {
    while (i < total) {
      if (signal && signal.aborted) break;
      var wave = Math.min(MAX_REQUESTS_PER_SECOND, total - i);
      var slice = [];
      for (var w = 0; w < wave; w++) slice.push(i + w);
      var results = await Promise.all(slice.map(function(idx) {
        return executeRequestWithRetry(snapshot, {}, {
          signal: signal,
          retryTotal: retryTotal,
          onRetry: function() {
            emitRepeatStats(config, { total: total, sent: idx, success: success, failed: failed, retries: retryTotal.v, queued: total - idx - 1 });
            persistState(idx);
          }
        }).then(function(ro) { return { idx: idx, ro: ro }; });
      }));
      for (var r = 0; r < results.length; r++) {
        var item = results[r];
        lastRo = item.ro;
        if (item.ro.status >= 200 && item.ro.status < 300) success++;
        else failed++;
      }
      i += wave;
      emitRepeatStats(config, { total: total, sent: i, success: success, failed: failed, retries: retryTotal.v, queued: total - i });
      persistState(i);
      if (delayMs > 0 && i < total) await sleep(delayMs);
    }
  }

  return { lastRo: lastRo, success: success, failed: failed, retries: retryTotal.v, aborted: signal && signal.aborted };
}
function notify(msg, type) {
  type = type || 'info';
  var el = document.createElement('div');
  el.className = 'notif ' + type;
  el.textContent = msg;
  document.getElementById('notifs').appendChild(el);
  setTimeout(function(){ el.remove(); }, 3500);
}
function openModal(html) {
  var c = document.getElementById('modals');
  c.innerHTML = html;
  var bg = c.querySelector('.modal-bg');
  if (bg) bg.addEventListener('click', function(e){ if (e.target === e.currentTarget) closeModal(); });
}
function closeModal() { document.getElementById('modals').innerHTML = ''; }
function dl(content, filename, type) {
  type = type || 'application/json';
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: type }));
  a.download = filename; a.click(); URL.revokeObjectURL(a.href);
}
function formatBytes(n) {
  if (!n) return '0 B';
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n/1024).toFixed(1) + ' KB';
  return (n/1048576).toFixed(1) + ' MB';
}

// ─────────────────────────────────────────────────────────────
// CRYPTO
// ─────────────────────────────────────────────────────────────
async function _hmac(algo, key, data) {
  var enc = new TextEncoder();
  var kd  = typeof key === 'string' ? enc.encode(key) : key;
  var ck  = await crypto.subtle.importKey('raw', kd, { name:'HMAC', hash:algo }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', ck, enc.encode(data)));
}
async function hmacB64(algo, key, data) {
  var b = await _hmac(algo, key, data);
  return btoa(String.fromCharCode.apply(null, b));
}
async function sha256hex(s) {
  var b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map(function(x){ return x.toString(16).padStart(2,'0'); }).join('');
}
function pct(s) {
  return encodeURIComponent(String(s == null ? ''  : s)).replace(/[!'()*]/g, function(c){
    return '%' + c.charCodeAt(0).toString(16).toUpperCase();
  });
}
function md5(str) {
  function safe(x,y){var m=(65535&x)+(65535&y);return(x>>16)+(y>>16)+(m>>16)<<16|65535&m}
  function rot(x,n){return x<<n|x>>>32-n}
  var enc=function(s){var a=[];for(var i=0;i<s.length*8;i+=8)a[i>>5]|=(255&s.charCodeAt(i/8))<<i%32;return a};
  var core=function(x,l){
    x[l>>5]|=128<<l%32;x[14+(l+64>>>9<<4)]=l;
    var a=1732584193,b=-271733879,c=-1732584194,d=271733878;
    var ff=function(a,b,c,d,x,s,t){return safe(rot(safe(safe(a,b&c|~b&d),safe(x,t)),s),b)};
    var gg=function(a,b,c,d,x,s,t){return safe(rot(safe(safe(a,b&d|c&~d),safe(x,t)),s),b)};
    var hh=function(a,b,c,d,x,s,t){return safe(rot(safe(safe(a,b^c^d),safe(x,t)),s),b)};
    var ii=function(a,b,c,d,x,s,t){return safe(rot(safe(safe(a,c^(b|~d)),safe(x,t)),s),b)};
    for(var k=0;k<x.length;k+=16){
      var A=a,B=b,C=c,D=d;
      a=ff(a,b,c,d,x[k],7,-680876936);d=ff(d,a,b,c,x[k+1],12,-389564586);c=ff(c,d,a,b,x[k+2],17,606105819);b=ff(b,c,d,a,x[k+3],22,-1044525330);
      a=ff(a,b,c,d,x[k+4],7,-176418897);d=ff(d,a,b,c,x[k+5],12,1200080426);c=ff(c,d,a,b,x[k+6],17,-1473231341);b=ff(b,c,d,a,x[k+7],22,-45705983);
      a=ff(a,b,c,d,x[k+8],7,1770035416);d=ff(d,a,b,c,x[k+9],12,-1958414417);c=ff(c,d,a,b,x[k+10],17,-42063);b=ff(b,c,d,a,x[k+11],22,-1990404162);
      a=ff(a,b,c,d,x[k+12],7,1804603682);d=ff(d,a,b,c,x[k+13],12,-40341101);c=ff(c,d,a,b,x[k+14],17,-1502002290);b=ff(b,c,d,a,x[k+15],22,1236535329);
      a=gg(a,b,c,d,x[k+1],5,-165796510);d=gg(d,a,b,c,x[k+6],9,-1069501632);c=gg(c,d,a,b,x[k+11],14,643717713);b=gg(b,c,d,a,x[k],20,-373897302);
      a=gg(a,b,c,d,x[k+5],5,-701558691);d=gg(d,a,b,c,x[k+10],9,38016083);c=gg(c,d,a,b,x[k+15],14,-660478335);b=gg(b,c,d,a,x[k+4],20,-405537848);
      a=gg(a,b,c,d,x[k+9],5,568446438);d=gg(d,a,b,c,x[k+14],9,-1019803690);c=gg(c,d,a,b,x[k+3],14,-187363961);b=gg(b,c,d,a,x[k+8],20,1163531501);
      a=gg(a,b,c,d,x[k+13],5,-1444681467);d=gg(d,a,b,c,x[k+2],9,-51403784);c=gg(c,d,a,b,x[k+7],14,1735328473);b=gg(b,c,d,a,x[k+12],20,-1926607734);
      a=hh(a,b,c,d,x[k+5],4,-378558);d=hh(d,a,b,c,x[k+8],11,-2022574463);c=hh(c,d,a,b,x[k+11],16,1839030562);b=hh(b,c,d,a,x[k+14],23,-35309556);
      a=hh(a,b,c,d,x[k+1],4,-1530992060);d=hh(d,a,b,c,x[k+4],11,1272893353);c=hh(c,d,a,b,x[k+7],16,-155497632);b=hh(b,c,d,a,x[k+10],23,-1094730640);
      a=hh(a,b,c,d,x[k+13],4,681279174);d=hh(d,a,b,c,x[k],11,-358537222);c=hh(c,d,a,b,x[k+3],16,-722521979);b=hh(b,c,d,a,x[k+6],23,76029189);
      a=hh(a,b,c,d,x[k+9],4,-640364487);d=hh(d,a,b,c,x[k+12],11,-421815835);c=hh(c,d,a,b,x[k+15],16,530742520);b=hh(b,c,d,a,x[k+2],23,-995338651);
      a=ii(a,b,c,d,x[k],6,-198630844);d=ii(d,a,b,c,x[k+7],10,1126891415);c=ii(c,d,a,b,x[k+14],15,-1416354905);b=ii(b,c,d,a,x[k+5],21,-57434055);
      a=ii(a,b,c,d,x[k+12],6,1700485571);d=ii(d,a,b,c,x[k+3],10,-1894986606);c=ii(c,d,a,b,x[k+10],15,-1051523);b=ii(b,c,d,a,x[k+1],21,-2054922799);
      a=ii(a,b,c,d,x[k+8],6,1873313359);d=ii(d,a,b,c,x[k+15],10,-30611744);c=ii(c,d,a,b,x[k+6],15,-1560198380);b=ii(b,c,d,a,x[k+13],21,1309151649);
      a=ii(a,b,c,d,x[k+4],6,-145523070);d=ii(d,a,b,c,x[k+11],10,-1120210379);c=ii(c,d,a,b,x[k+2],15,718787259);b=ii(b,c,d,a,x[k+9],21,-343485551);
      a=safe(a,A);b=safe(b,B);c=safe(c,C);d=safe(d,D);
    }
    return[a,b,c,d];
  };
  var arr=enc(str),r=core(arr,str.length*8);
  var h='';for(var i=0;i<r.length;i++)for(var j=0;j<4;j++)h+=(r[i]>>>j*8&255).toString(16).padStart(2,'0');
  return h;
}

// ─────────────────────────────────────────────────────────────
// VARIABLE RESOLUTION
// ─────────────────────────────────────────────────────────────
function getEnv()       { return S.envs.find(function(e){ return e.id === S.activeEnv; }) || null; }
function getActiveTab() { return S.tabs.find(function(t){ return t.id === S.activeId; }); }

var DYN = {
  '$timestamp':          function(){ return String(Date.now()); },
  '$isoTimestamp':       function(){ return new Date().toISOString(); },
  '$randomInt':          function(){ return String(Math.floor(Math.random()*1000)); },
  '$randomFloat':        function(){ return (Math.random()*100).toFixed(2); },
  '$guid':               function(){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){var r=Math.random()*16|0;return(c==='x'?r:r&0x3|0x8).toString(16);}); },
  '$randomUUID':         function(){ return DYN['$guid'](); },
  '$randomAlphaNumeric': function(){ return Math.random().toString(36).slice(2,10); },
  '$randomBoolean':      function(){ return String(Math.random()>.5); },
  '$randomFirstName':    function(){ return ['Alice','Bob','Charlie','Diana','Eve','Frank','Grace','Hank','Ivy','Jack'][Math.floor(Math.random()*10)]; },
  '$randomLastName':     function(){ return ['Smith','Jones','Williams','Brown','Davis','Miller','Wilson','Taylor','Clark','Lee'][Math.floor(Math.random()*10)]; },
  '$randomFullName':     function(){ return DYN['$randomFirstName']()+' '+DYN['$randomLastName'](); },
  '$randomEmail':        function(){ return 'user'+Math.floor(Math.random()*90000+10000)+'@example.com'; },
  '$randomUrl':          function(){ return 'https://example'+Math.floor(Math.random()*100)+'.com'; },
  '$randomIP':           function(){ return [1,2,3,4].map(function(){ return Math.floor(Math.random()*255); }).join('.'); },
  '$randomColor':        function(){ return ['red','green','blue','yellow','pink','purple','orange'][Math.floor(Math.random()*7)]; },
  '$randomHexColor':     function(){ return '#'+Math.floor(Math.random()*16777215).toString(16).padStart(6,'0'); },
  '$randomCountry':      function(){ return ['India','USA','UK','Germany','France','Japan','Brazil','Canada'][Math.floor(Math.random()*8)]; },
  '$randomCity':         function(){ return ['Mumbai','New York','London','Berlin','Paris','Tokyo','Sydney','Toronto'][Math.floor(Math.random()*8)]; },
  '$randomJobTitle':     function(){ return ['Engineer','Manager','Designer','Analyst','Director','Developer'][Math.floor(Math.random()*6)]; },
  '$randomCompanyName':  function(){ return ['Acme Corp','Tech Inc','Global Ltd','Prime Co','NextGen LLC'][Math.floor(Math.random()*5)]; },
  '$randomPrice':        function(){ return (Math.random()*999+1).toFixed(2); },
  '$randomCurrencyCode': function(){ return ['USD','EUR','GBP','JPY','INR','AUD','CAD'][Math.floor(Math.random()*7)]; },
  '$randomDateFuture':   function(){ return new Date(Date.now()+Math.random()*365*86400000).toISOString().slice(0,10); },
  '$randomDatePast':     function(){ return new Date(Date.now()-Math.random()*365*86400000).toISOString().slice(0,10); },
  '$randomSemver':       function(){ return Math.floor(Math.random()*10)+'.'+Math.floor(Math.random()*10)+'.'+Math.floor(Math.random()*100); },
};

function resolveVars(str, extra) {
  extra = extra || {};
  if (str === null || str === undefined) return str;
  str = String(str);
  var env = getEnv(), ev = (env && env.variables) || {}, tab = getActiveTab(), cv = (tab && tab.collVars) || {};
  str = str.replace(/\{\{\s*(\$[a-zA-Z]+)\s*\}\}/g, function(m, k){ var fn = DYN[k] || DYN[k.slice(1)]; return fn ? fn() : m; });
  str = str.replace(/\{\{([^}]+?)\}\}/g, function(m, k){ k = k.trim(); return _localVars[k] !== undefined ? _localVars[k] : cv[k] !== undefined ? cv[k] : ev[k] !== undefined ? ev[k] : S.globals[k] !== undefined ? S.globals[k] : _iterInfo.dataRow[k] !== undefined ? _iterInfo.dataRow[k] : extra[k] !== undefined ? extra[k] : m; });
  return str;
}

// ─────────────────────────────────────────────────────────────
// JSON SCHEMA VALIDATOR
// ─────────────────────────────────────────────────────────────
function validateSchema(data, schema) {
  var errors = [];
  function chk(d,s,p){
    if(!s||s===true)return;
    if(s===false){errors.push(p+': schema is false');return;}
    if(s.type){var types=Array.isArray(s.type)?s.type:[s.type];var actual=d===null?'null':Array.isArray(d)?'array':typeof d;if(types.indexOf(actual)===-1)errors.push(p+': expected ['+types+'], got '+actual);}
    if('const'in s&&JSON.stringify(d)!==JSON.stringify(s.const))errors.push(p+': expected const');
    if(s.enum&&!s.enum.some(function(v){return JSON.stringify(v)===JSON.stringify(d);}))errors.push(p+': not in enum');
    if(typeof d==='string'){if(s.minLength!==undefined&&d.length<s.minLength)errors.push(p+': minLength '+s.minLength);if(s.maxLength!==undefined&&d.length>s.maxLength)errors.push(p+': maxLength');if(s.pattern&&!new RegExp(s.pattern).test(d))errors.push(p+': pattern failed');}
    if(typeof d==='number'){if(s.minimum!==undefined&&d<s.minimum)errors.push(p+': min '+s.minimum);if(s.maximum!==undefined&&d>s.maximum)errors.push(p+': max '+s.maximum);}
    if(Array.isArray(d)){if(s.minItems!==undefined&&d.length<s.minItems)errors.push(p+': minItems');if(s.maxItems!==undefined&&d.length>s.maxItems)errors.push(p+': maxItems');if(s.items)d.forEach(function(x,i){chk(x,s.items,p+'['+i+']');});}
    if(d!==null&&typeof d==='object'&&!Array.isArray(d)){(s.required||[]).forEach(function(k){if(!(k in d))errors.push(p+': missing \''+k+'\'');});if(s.properties)Object.keys(s.properties).forEach(function(k){if(k in d)chk(d[k],s.properties[k],p+'.'+k);});}
    if(s.allOf)s.allOf.forEach(function(sub,i){chk(d,sub,p+'/allOf['+i+']');});
  }
  chk(data,schema,'#');
  if(errors.length)throw new Error('Schema validation failed:\n'+errors.join('\n'));
}

// ─────────────────────────────────────────────────────────────
// PM SANDBOX
// ─────────────────────────────────────────────────────────────
function buildPM(response, collVars) {
  collVars = collVars || {};
  _testResults = []; _consoleLogs = []; _localVars = {};
  var env = getEnv(), tab = getActiveTab();

  function chai(val) {
    var self = {
      equal:      function(x){if(val!==x)throw new Error('Expected '+JSON.stringify(x)+', got '+JSON.stringify(val));return self;},
      eql:        function(x){if(JSON.stringify(val)!==JSON.stringify(x))throw new Error('Deep equal failed');return self;},
      include:    function(x){var s=typeof val==='string'?val:JSON.stringify(val);if(s.indexOf(x)===-1)throw new Error('Expected to include "'+x+'"');return self;},
      match:      function(r){if(!r.test(String(val)))throw new Error('Expected to match '+r);return self;},
      matchSchema:function(s){validateSchema(val,s);return self;},
      keys:       function(a){a.forEach(function(k){if(typeof val!=='object'||!(k in val))throw new Error('Missing key: '+k);});return self;},
      deep:       {equal:function(x){if(JSON.stringify(val)!==JSON.stringify(x))throw new Error('Deep equal failed');return self;}},
      not: {
        equal:  function(x){if(val===x)throw new Error('Expected NOT '+JSON.stringify(x));return self;},
        include:function(x){if(String(val).indexOf(x)!==-1)throw new Error('Expected NOT to include "'+x+'"');return self;},
        empty:  function(){if(!val||val.length===0)throw new Error('Expected non-empty');return self;},
        ok:     function(){if(val)throw new Error('Expected falsy');return self;},
        have:   {property:function(p){if(typeof val==='object'&&val!==null&&p in val)throw new Error('Expected NOT to have "'+p+'"');return self;}},
        be:     {above:function(x){if(val>x)throw new Error('Expected <= '+x);return self;},below:function(x){if(val<x)throw new Error('Expected >= '+x);return self;}}
      },
      be: {
        below:  function(x){if(!(val<x))throw new Error('Expected '+val+' < '+x);return self;},
        above:  function(x){if(!(val>x))throw new Error('Expected '+val+' > '+x);return self;},
        at:     {least:function(x){if(!(val>=x))throw new Error('Expected >= '+x);return self;},most:function(x){if(!(val<=x))throw new Error('Expected <= '+x);return self;}},
        ok:     function(){if(!val)throw new Error('Expected truthy');return self;},
        true:   function(){if(val!==true)throw new Error('Expected true');return self;},
        false:  function(){if(val!==false)throw new Error('Expected false');return self;},
        null:   function(){if(val!==null)throw new Error('Expected null');return self;},
        a:      function(t){var at=Array.isArray(val)?'array':typeof val;if(at!==t)throw new Error('Expected type '+t+', got '+at);return self;},
        an:     function(t){var at=Array.isArray(val)?'array':typeof val;if(at!==t)throw new Error('Expected type '+t+', got '+at);return self;},
        empty:  function(){if(val&&val.length>0)throw new Error('Expected empty');return self;},
        json:   function(){try{JSON.parse((response&&response._body)||'null');}catch(e){throw new Error('Not JSON');}return self;},
        string: function(){if(typeof val!=='string')throw new Error('Expected string');return self;},
        number: function(){if(typeof val!=='number')throw new Error('Expected number');return self;},
        array:  function(){if(!Array.isArray(val))throw new Error('Expected array');return self;},
        object: function(){if(typeof val!=='object'||Array.isArray(val))throw new Error('Expected object');return self;},
        oneOf:  function(a){if(a.indexOf(val)===-1)throw new Error('Expected one of ['+a+']');return self;},
        closeTo:function(x,dd){dd=dd||2;if(Math.abs(val-x)>dd)throw new Error('Expected '+val+' ≈ '+x);return self;}
      },
      have: {
        property:function(p,v){if(typeof val!=='object'||val===null||!(p in val))throw new Error('Expected property "'+p+'"');if(v!==undefined&&val[p]!==v)throw new Error('Property "'+p+'" expected '+JSON.stringify(v));return self;},
        length:  function(n){if(!val||val.length!==n)throw new Error('Expected length '+n+', got '+(val&&val.length));return self;},
        lengthOf:function(n){if(!val||val.length!==n)throw new Error('Expected length '+n);return self;},
        members: function(a){if(!Array.isArray(val))throw new Error('Expected array');a.forEach(function(m){if(val.indexOf(m)===-1)throw new Error('Missing member: '+m);});return self;},
        status:  function(code){if(!response)throw new Error('No response');if(response.status!==code)throw new Error('Expected status '+code+', got '+response.status);return self;},
        header:  function(key,value){if(!response)throw new Error('No response');var hv=response._headers&&response._headers[key.toLowerCase()];if(!hv)throw new Error('Missing header: '+key);if(value!==undefined&&hv!==String(value))throw new Error('Header "'+key+'" expected "'+value+'"');return self;},
        jsonBody:function(path){var body=JSON.parse(response._body);var v=path.split('.').reduce(function(o,k){return o&&o[k];},body);if(v===undefined)throw new Error('JSON path "'+path+'" not found');return self;},
        body:    {that:{includes:function(s){if(response._body.indexOf(s)===-1)throw new Error('Body missing: "'+s+'"');return self;}}}
      }
    };
    self.to=self;self.and=self;self.is=self;self.that=self;
    return self;
  }

  var pmResp = response ? {
    code: response.status, status: response.statusText, statusCode: response.status,
    responseTime: response._time||0, size: response._size||0,
    json: function(){ try{ return JSON.parse(response._body); } catch(e){ throw new Error('Response is not valid JSON: '+String(response._body).slice(0,80)); } },
    text: function(){ return response._body||''; },
    cookies: response._cookies||{},
    headers: { get:function(k){return response._headers&&response._headers[k.toLowerCase()];}, has:function(k){return !!(response._headers&&response._headers[k.toLowerCase()]);}, toObject:function(){return Object.assign({},response._headers);}, all:function(){return Object.assign({},response._headers);} },
    to: {
      have: {
        status: function(code){ if(response.status!==code)throw new Error('Expected status '+code+', got '+response.status); },
        header: function(k,v){ var hv=response._headers&&response._headers[k.toLowerCase()]; if(!hv)throw new Error('Missing header: '+k); if(v!==undefined&&hv!==String(v))throw new Error('Header "'+k+'" expected "'+v+'"'); },
        jsonBody: function(path){ var body=JSON.parse(response._body); var v=path.split('.').reduce(function(o,k){return o&&o[k];},body); if(v===undefined)throw new Error('JSON path "'+path+'" not found'); },
        body: {that:{includes:function(s){if(response._body.indexOf(s)===-1)throw new Error('Body missing: "'+s+'"');}}}
      },
      be: {
        ok:          function(){ if(response.status<200||response.status>=300)throw new Error('Not OK: '+response.status); },
        json:        function(){ try{JSON.parse(response._body);}catch(e){throw new Error('Not JSON');} },
        success:     function(){ if(response.status<200||response.status>=300)throw new Error('Not 2xx: '+response.status); },
        error:       function(){ if(response.status<400)throw new Error('Not 4xx/5xx: '+response.status); },
        serverError: function(){ if(response.status<500)throw new Error('Not 5xx: '+response.status); },
        clientError: function(){ if(response.status<400||response.status>=500)throw new Error('Not 4xx: '+response.status); },
        notFound:    function(){ if(response.status!==404)throw new Error('Not 404'); },
        created:     function(){ if(response.status!==201)throw new Error('Not 201'); }
      },
      not: { have: { status: function(code){ if(response.status===code)throw new Error('Status should NOT be '+code); } } }
    }
  } : { code:0, status:'', responseTime:0, size:0, json:function(){return{};}, text:function(){return'';}, cookies:{}, headers:{get:function(){return null;},has:function(){return false;},toObject:function(){return{};},all:function(){return{};}}, to:{have:{status:function(){},header:function(){},jsonBody:function(){}},be:{ok:function(){},json:function(){},success:function(){},error:function(){}},not:{have:{status:function(){}}}} };

  var pm = {
    test: function(name,fn){ try{fn();_testResults.push({name:name,pass:true});}catch(e){_testResults.push({name:name,pass:false,error:e.message});} },
    expect: chai,
    response: pmResp,
    request: {
      url: {
        toString: function(){ return resolveVars(document.getElementById('url-in').value||''); },
        getHost:  function(){ try{return new URL(resolveVars(document.getElementById('url-in').value||'')).hostname;}catch(e){return'';} },
        getPath:  function(){ try{return new URL(resolveVars(document.getElementById('url-in').value||'')).pathname;}catch(e){return'';} }
      },
      method: document.getElementById('method-sel').value||'GET',
      headers: {
        add:      function(k,v){ var t=getActiveTab(); if(t){ t.headers.push({id:uid(),on:true,k:k,v:v,desc:''}); loadKV('headers',t.headers); } },
        remove:   function(k){ var t=getActiveTab(); if(t){ t.headers=t.headers.filter(function(h){return h.k!==k;}); loadKV('headers',t.headers); } },
        get:      function(k){ return (readKV('headers').find(function(h){return h.k&&h.k.toLowerCase()===k.toLowerCase();})||{}).v; },
        has:      function(k){ return !!readKV('headers').find(function(h){return h.k&&h.k.toLowerCase()===k.toLowerCase();}); },
        toObject: function(){ return Object.fromEntries(readKV('headers').filter(function(h){return h.on&&h.k;}).map(function(h){return[h.k,h.v];})); }
      },
      body: { raw: (document.getElementById('code-raw')||{}).value||'', mode: _bodyType }
    },
    environment: {
      get:    function(k){ return env&&env.variables&&env.variables[k]; },
      set:    function(k,v){ if(env){if(!env.variables)env.variables={};env.variables[k]=String(v==null?'':v);save();} },
      unset:  function(k){ if(env&&env.variables){delete env.variables[k];save();} },
      has:    function(k){ return env&&env.variables!==undefined&&k in(env.variables||{}); },
      clear:  function(){ if(env){env.variables={};save();} },
      toObject:function(){ return Object.assign({},(env&&env.variables)||{}); }
    },
    globals: {
      get:    function(k){ return S.globals[k]; },
      set:    function(k,v){ S.globals[k]=String(v==null?'':v);save(); },
      unset:  function(k){ delete S.globals[k];save(); },
      has:    function(k){ return k in S.globals; },
      clear:  function(){ S.globals={};save(); },
      toObject:function(){ return Object.assign({},S.globals); }
    },
    variables: {
      get:      function(k){ return _localVars[k]!==undefined?_localVars[k]:env&&env.variables&&env.variables[k]!==undefined?env.variables[k]:S.globals[k]; },
      set:      function(k,v){ _localVars[k]=String(v==null?'':v); },
      unset:    function(k){ delete _localVars[k]; },
      has:      function(k){ return k in _localVars; },
      toObject: function(){ return Object.assign({},_localVars); },
      replaceIn:function(s){ return resolveVars(s); }
    },
    collectionVariables: {
      get:    function(k){ return collVars[k]!==undefined?collVars[k]:tab&&tab.collVars&&tab.collVars[k]; },
      set:    function(k,v){ collVars[k]=String(v==null?'':v); if(tab){if(!tab.collVars)tab.collVars={};tab.collVars[k]=String(v==null?'':v);} },
      unset:  function(k){ delete collVars[k]; if(tab&&tab.collVars)delete tab.collVars[k]; },
      has:    function(k){ return k in(collVars||{}); },
      clear:  function(){ Object.keys(collVars).forEach(function(k){delete collVars[k];}); },
      toObject:function(){ return Object.assign({},collVars); }
    },
    info: { iteration:_iterInfo.iteration, iterationCount:_iterInfo.iterationCount, requestName:(tab&&tab.name)||'', requestId:(tab&&tab.id)||'' },
    sendRequest: function(opts, cb) {
      if(typeof opts==='string') opts={url:opts,method:'GET'};
      var url=resolveVars(opts.url||'');
      var direct=isPrivate(url);
      var fu=(!direct&&S.settings.corsEnabled)?S.settings.proxyUrl+encodeURIComponent(url):url;
      var h={};
      if(opts.header){if(Array.isArray(opts.header))opts.header.forEach(function(x){h[x.key]=x.value;});else Object.assign(h,opts.header);}
      if(opts.headers)Object.assign(h,opts.headers);
      var fo={method:(opts.method||'GET').toUpperCase(),headers:h};
      if(opts.body)fo.body=typeof opts.body==='string'?opts.body:opts.body&&opts.body.raw?opts.body.raw:JSON.stringify(opts.body);
      rateLimitedFetch(fu, fo).then(function(r){
        return r.text().then(function(body){
          var hdrs={};r.headers.forEach(function(v,k){hdrs[k]=v;});
          var res={code:r.status,status:r.statusText,_body:body,_headers:hdrs,json:function(){return JSON.parse(body);},text:function(){return body;},headers:{get:function(k){return hdrs[k.toLowerCase()];},has:function(k){return !!(hdrs[k.toLowerCase()]);},toObject:function(){return Object.assign({},hdrs);}},to:{have:{status:function(code){if(r.status!==code)throw new Error(r.status+'!='+code);}}}};
          if(cb)cb(null,res);
        });
      }).catch(function(e){if(cb)cb(e,null);});
    }
  };
  return { pm:pm, expect:chai };
}

function runScript(code, pmObj) {
  if(!code||!code.trim()) return;
  var con = {
    log:   function(){ var a=Array.from(arguments); _consoleLogs.push({type:'log',  msg:a.map(function(x){return typeof x==='object'?JSON.stringify(x,null,2):String(x);}).join(' ')}); },
    warn:  function(){ var a=Array.from(arguments); _consoleLogs.push({type:'warn', msg:a.map(function(x){return typeof x==='object'?JSON.stringify(x):String(x);}).join(' ')}); },
    error: function(){ var a=Array.from(arguments); _consoleLogs.push({type:'error',msg:a.map(function(x){return typeof x==='object'?JSON.stringify(x):String(x);}).join(' ')}); },
    info:  function(){ var a=Array.from(arguments); _consoleLogs.push({type:'info', msg:a.map(function(x){return typeof x==='object'?JSON.stringify(x):String(x);}).join(' ')}); },
    table: function(d){ _consoleLogs.push({type:'log',msg:JSON.stringify(d,null,2)}); },
    dir:   function(d){ _consoleLogs.push({type:'log',msg:JSON.stringify(d,null,2)}); },
    assert:function(c,m){ if(!c)_consoleLogs.push({type:'error',msg:'Assertion failed: '+(m||'')}); },
    group:function(){},groupEnd:function(){},time:function(){},timeEnd:function(){},clear:function(){_consoleLogs=[];}
  };
  try {
    new Function('pm','console','expect','require',code)(
      pmObj.pm, con, pmObj.expect,
      function(mod){ _consoleLogs.push({type:'warn',msg:"require('"+mod+"') not supported"}); return {}; }
    );
  } catch(e) { _consoleLogs.push({type:'error',msg:'Script error: '+e.message}); }
}

// ─────────────────────────────────────────────────────────────
// TABS
// ─────────────────────────────────────────────────────────────
var MC = {GET:'var(--get)',POST:'var(--post)',PUT:'var(--put)',PATCH:'var(--patch)',DELETE:'var(--delete)',HEAD:'var(--head)',OPTIONS:'var(--options)'};

function mkTab(d) {
  d = d || {};
  return {
    id:uid(), name:d.name||'New Request', method:d.method||'GET', url:d.url||'',
    params:d.params||[{id:uid(),on:true,k:'',v:'',desc:''}],
    pathVars:d.pathVars||[],
    headers:d.headers||[{id:uid(),on:true,k:'',v:'',desc:''}],
    bodyType:d.bodyType||'none', rawFmt:d.rawFmt||'json', rawBody:d.rawBody||'',
    formData:d.formData||[], urlEncoded:d.urlEncoded||[],
    gqlQ:d.gqlQ||'', gqlV:d.gqlV||'',
    authType:d.authType||'none', authData:d.authData||{},
    preScript:d.preScript||'', testScript:d.testScript||'',
    response:null, collVars:d.collVars||{}, collId:d.collId||null
  };
}
function newTab(d) { var t=mkTab(d); S.tabs.push(t); S.activeId=t.id; renderTabs(); loadTabUI(t); showResponse(null); }
function switchTab(id) { saveTabUI(); S.activeId=id; var t=S.tabs.find(function(t){return t.id===id;}); loadTabUI(t); renderTabs(); showResponse(t&&t.response); }
function closeTab(id, e) {
  if(e) e.stopPropagation();
  var idx=S.tabs.findIndex(function(t){return t.id===id;}); if(idx===-1)return;
  S.tabs.splice(idx,1);
  if(!S.tabs.length){newTab();return;}
  S.activeId=S.tabs[Math.min(idx,S.tabs.length-1)].id;
  var t=S.tabs.find(function(t){return t.id===S.activeId;}); loadTabUI(t); showResponse(t&&t.response); renderTabs();
}
function renderTabs() {
  document.getElementById('tabs').innerHTML = S.tabs.map(function(t){
    return '<div class="tab-item'+(t.id===S.activeId?' active':'')+'" onclick="switchTab(\''+t.id+'\')">'+
      '<span class="tab-method" style="color:'+(MC[t.method]||'var(--text2)')+'">'+t.method+'</span>'+
      '<span class="tab-name">'+esc(t.name)+'</span>'+
      '<button class="tab-close" onclick="closeTab(\''+t.id+'\',event)">✕</button>'+
      '</div>';
  }).join('');
}
function saveTabUI() {
  var t=getActiveTab(); if(!t)return;
  t.method    = document.getElementById('method-sel').value;
  t.url       = document.getElementById('url-in').value;
  t.bodyType  = _bodyType;
  t.rawBody   = (document.getElementById('code-raw')||{}).value||'';
  t.rawFmt    = (document.getElementById('raw-fmt')||{}).value||'json';
  t.gqlQ      = (document.getElementById('gql-q')||{}).value||'';
  t.gqlV      = (document.getElementById('gql-v')||{}).value||'';
  t.authType  = (document.getElementById('auth-sel')||{}).value||'none';
  t.authData  = readAuthData();
  t.preScript = (document.getElementById('pre-script')||{}).value||'';
  t.testScript= (document.getElementById('test-script')||{}).value||'';
  t.params    = readKV('params');
  t.pathVars  = readPathVars();
  t.headers   = readKV('headers');
  t.urlEncoded= readKV('urlenc');
  t.formData  = readFormData();
}
function loadTabUI(t) {
  if(!t) return;
  document.getElementById('method-sel').value = t.method;
  document.getElementById('url-in').value     = t.url;
  document.getElementById('code-raw').value   = t.rawBody||'';
  document.getElementById('raw-fmt').value    = t.rawFmt||'json';
  document.getElementById('gql-q').value      = t.gqlQ||'';
  document.getElementById('gql-v').value      = t.gqlV||'';
  document.getElementById('auth-sel').value   = t.authType||'none';
  document.getElementById('pre-script').value = t.preScript||'';
  document.getElementById('test-script').value= t.testScript||'';
  loadKV('params',  t.params);
  loadKV('headers', t.headers);
  loadKV('urlenc',  t.urlEncoded||[]);
  loadFormData(t.formData||[]);
  setBody(t.bodyType||'none');
  renderAuthFields(t.authData||{});
  colorMethod();
  updatePathVars(t.url, t.pathVars||[]);
  refreshDirectBadge(t.url);
  _formBulkMode = false;
  _urlencBulkMode = false;
  applyFormBulkVisual();
  applyUrlencBulkVisual();
}

// ─────────────────────────────────────────────────────────────
// KV TABLES
// ─────────────────────────────────────────────────────────────
function addKVRow(type, k, v, desc, on) {
  k=k||''; v=v||''; desc=desc||''; if(on===undefined)on=true;
  var tbody=document.getElementById('kv-'+type); if(!tbody)return;
  var tr=document.createElement('tr'); tr.dataset.id=uid();
  tr.innerHTML='<td><input type="checkbox" class="kv-chk"'+(on?' checked':'')+'></td>'+
    '<td><input type="text" placeholder="Key" value="'+esc(k)+'"></td>'+
    '<td><input type="text" placeholder="Value" value="'+esc(v)+'"></td>'+
    '<td><input type="text" placeholder="Description" value="'+esc(desc)+'"></td>'+
    '<td><button class="kv-del" onclick="this.closest(\'tr\').remove()">✕</button></td>';
  tbody.appendChild(tr);
}
function readKV(type) {
  var rows=[];
  document.querySelectorAll('#kv-'+type+' tr').forEach(function(tr){
    var inp=tr.querySelectorAll('input');
    if(inp.length>=3) rows.push({id:tr.dataset.id||uid(),on:inp[0].type==='checkbox'?inp[0].checked:true,k:inp[1]&&inp[1].value||'',v:inp[2]&&inp[2].value||'',desc:inp[3]&&inp[3].value||''});
  });
  return rows;
}
function loadKV(type, rows) {
  rows=rows||[];
  var tbody=document.getElementById('kv-'+type); if(!tbody)return;
  tbody.innerHTML='';
  rows.forEach(function(r){ addKVRow(type,r.k||r.key||'',r.v||r.value||'',r.desc||'',r.on!==false&&r.enabled!==false); });
  if(!rows.length) addKVRow(type);
}
function addFormRow(k, v, type) {
  k=k||''; v=v||''; type=type||'text';
  var tbody=document.getElementById('kv-form'); if(!tbody)return;
  var tr=document.createElement('tr'); var isFile=type==='file';
  tr.innerHTML='<td><input type="checkbox" class="kv-chk" checked></td>'+
    '<td><input type="text" placeholder="Key" value="'+esc(k)+'"></td>'+
    '<td class="fv-cell">'+
      '<div class="fv-text"'+(isFile?' style="display:none"':'')+'><input type="text" placeholder="Value" value="'+esc(v)+'"></div>'+
      '<div class="fv-file"'+(!isFile?' style="display:none"':'')+'><input type="file"></div>'+
    '</td>'+
    '<td><select class="fv-type-sel" onchange="toggleFormType(this)">'+
      '<option value="text"'+(!isFile?' selected':'')+'> Text</option>'+
      '<option value="file"'+(isFile?' selected':'')+'> File</option>'+
    '</select></td>'+
    '<td><button class="kv-del" onclick="this.closest(\'tr\').remove()">✕</button></td>';
  tbody.appendChild(tr);
}
function toggleFormType(sel) {
  var tr=sel.closest('tr'), isFile=sel.value==='file';
  tr.querySelector('.fv-text').style.display=isFile?'none':'';
  tr.querySelector('.fv-file').style.display=isFile?'':'none';
}
function readFormData() {
  var rows=[];
  document.querySelectorAll('#kv-form tr').forEach(function(tr){
    var chk=tr.querySelector('.kv-chk'), key=(tr.querySelectorAll('input[type=text]')[0]||{}).value||'', type=(tr.querySelector('.fv-type-sel')||{}).value||'text';
    if(!chk||!chk.checked||!key) return;
    if(type==='file'){ var f=(tr.querySelector('.fv-file input[type=file]')||{}).files&&tr.querySelector('.fv-file input[type=file]').files[0]; rows.push({on:true,k:key,v:'',type:'file',file:f}); }
    else rows.push({on:true,k:key,v:(tr.querySelector('.fv-text input')||{}).value||'',type:'text'});
  });
  return rows;
}
function loadFormData(rows) {
  rows=rows||[];
  var tbody=document.getElementById('kv-form'); if(!tbody)return;
  tbody.innerHTML='';
  rows.forEach(function(r){ addFormRow(r.k||'',r.v||'',r.type||'text'); });
  if(!rows.length) addFormRow();
}

// ─────────────────────────────────────────────────────────────
// BULK EDIT (form-data & x-www-form-urlencoded) — Postman-style
// ─────────────────────────────────────────────────────────────
function parseBulkKVLine(line) {
  line = String(line || '').trim();
  if (!line || line.charAt(0) === '#') return null;
  var eq = line.indexOf('=');
  var col = line.indexOf(':');
  var sep = -1;
  if (eq >= 0 && (col < 0 || eq <= col)) sep = eq;
  else if (col >= 0) sep = col;
  if (sep < 0) return null;
  var k = line.slice(0, sep).trim();
  var v = line.slice(sep + 1).trim();
  if (!k) return null;
  return { k: k, v: v };
}
function syncFormBulkFromTable() {
  var ta = document.getElementById('bulk-form');
  if (!ta) return;
  var lines = [];
  document.querySelectorAll('#kv-form tr').forEach(function(tr) {
    var chk = tr.querySelector('.kv-chk');
    if (chk && !chk.checked) return;
    var key = (tr.querySelectorAll('input[type=text]')[0] || {}).value || '';
    var typ = (tr.querySelector('.fv-type-sel') || {}).value || 'text';
    if (typ === 'file') {
      if (key) lines.push('# file field: ' + key + ' (set file in Key-Value table)');
      return;
    }
    var val = (tr.querySelector('.fv-text input') || {}).value || '';
    if (!key && !val) return;
    lines.push(key + '=' + val);
  });
  ta.value = lines.join('\n');
}
function syncFormTableFromBulk() {
  var ta = document.getElementById('bulk-form');
  if (!ta) return;
  var tbody = document.getElementById('kv-form');
  if (!tbody) return;
  tbody.innerHTML = '';
  var lines = ta.value.split(/\r?\n/);
  var any = false;
  lines.forEach(function(line) {
    var p = parseBulkKVLine(line);
    if (p) { addFormRow(p.k, p.v, 'text'); any = true; }
  });
  if (!any) addFormRow();
}
function applyFormBulkVisual() {
  var kv = document.getElementById('form-kv-wrap');
  var bulk = document.getElementById('form-bulk-wrap');
  var b1 = document.getElementById('btn-form-kv');
  var b2 = document.getElementById('btn-form-bulk');
  if (!kv || !bulk) return;
  if (_formBulkMode) {
    kv.style.display = 'none';
    bulk.style.display = 'block';
    if (b1) b1.classList.remove('active');
    if (b2) b2.classList.add('active');
  } else {
    kv.style.display = 'block';
    bulk.style.display = 'none';
    if (b1) b1.classList.add('active');
    if (b2) b2.classList.remove('active');
  }
}
function setFormBulkMode(isBulk) {
  if (isBulk) syncFormBulkFromTable();
  else syncFormTableFromBulk();
  _formBulkMode = !!isBulk;
  applyFormBulkVisual();
}
function syncUrlencBulkFromTable() {
  var ta = document.getElementById('bulk-urlenc');
  if (!ta) return;
  var lines = [];
  document.querySelectorAll('#kv-urlenc tr').forEach(function(tr) {
    var inp = tr.querySelectorAll('input');
    if (inp.length < 3) return;
    if (inp[0].type === 'checkbox' && !inp[0].checked) return;
    var k = inp[1] && inp[1].value || '';
    var v = inp[2] && inp[2].value || '';
    if (!k && !v) return;
    lines.push(k + '=' + v);
  });
  ta.value = lines.join('\n');
}
function syncUrlencTableFromBulk() {
  var ta = document.getElementById('bulk-urlenc');
  if (!ta) return;
  var lines = ta.value.split(/\r?\n/);
  var rows = [];
  lines.forEach(function(line) {
    var p = parseBulkKVLine(line);
    if (p) rows.push({ id: uid(), on: true, k: p.k, v: p.v, desc: '' });
  });
  loadKV('urlenc', rows);
}
function applyUrlencBulkVisual() {
  var kv = document.getElementById('urlenc-kv-wrap');
  var bulk = document.getElementById('urlenc-bulk-wrap');
  var b1 = document.getElementById('btn-urlenc-kv');
  var b2 = document.getElementById('btn-urlenc-bulk');
  if (!kv || !bulk) return;
  if (_urlencBulkMode) {
    kv.style.display = 'none';
    bulk.style.display = 'block';
    if (b1) b1.classList.remove('active');
    if (b2) b2.classList.add('active');
  } else {
    kv.style.display = 'block';
    bulk.style.display = 'none';
    if (b1) b1.classList.add('active');
    if (b2) b2.classList.remove('active');
  }
}
function setUrlencBulkMode(isBulk) {
  if (isBulk) syncUrlencBulkFromTable();
  else syncUrlencTableFromBulk();
  _urlencBulkMode = !!isBulk;
  applyUrlencBulkVisual();
}

// ─────────────────────────────────────────────────────────────
// PATH VARIABLES
// ─────────────────────────────────────────────────────────────
function updatePathVars(url, saved) {
  url=url||''; saved=saved||[];
  var tbody=document.getElementById('kv-pathvars'), el=document.getElementById('pv-empty'); if(!tbody)return;
  var found=[];
  [/:([a-zA-Z_][a-zA-Z0-9_]*)(?=\/|$|\?|#)/g, /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g].forEach(function(re){
    var m; while((m=re.exec(url))!==null) if(found.indexOf(m[1])===-1) found.push(m[1]);
  });
  tbody.innerHTML='';
  var sm={};
  saved.forEach(function(r){ sm[r.k]=r; });
  found.forEach(function(p){
    var sv=sm[p]||{}; var tr=document.createElement('tr'); tr.dataset.key=p;
    tr.innerHTML='<td style="padding:3px 6px;font-family:var(--mono);font-size:12px;color:var(--accent);white-space:nowrap">:'+esc(p)+'</td>'+
      '<td><input type="text" placeholder="value or {{variable}}" value="'+esc(sv.v||'')+'"></td>'+
      '<td><input type="text" placeholder="Description" value="'+esc(sv.desc||'')+'"></td><td></td>';
    tbody.appendChild(tr);
  });
  if(el) el.style.display=found.length?'none':'';
}
function readPathVars() {
  var rows=[];
  document.querySelectorAll('#kv-pathvars tr').forEach(function(tr){
    var k=tr.dataset.key||''; if(!k)return;
    var inp=tr.querySelectorAll('input');
    rows.push({k:k,v:(inp[0]&&inp[0].value)||'',desc:(inp[1]&&inp[1].value)||''});
  });
  return rows;
}
function resolvePathInUrl(url) {
  readPathVars().forEach(function(row){
    if(!row.k)return;
    var val=encodeURIComponent(resolveVars(row.v));
    url=url.replace(new RegExp(':'+row.k+'(?=/|$|\\?|#)','g'),val);
    url=url.replace(new RegExp('\\{'+row.k+'\\}','g'),val);
  });
  return url;
}

// ─────────────────────────────────────────────────────────────
// BODY
// ─────────────────────────────────────────────────────────────
function setBody(type) {
  _bodyType=type;
  document.querySelectorAll('.btype-btn').forEach(function(b){ b.classList.toggle('active',b.dataset.type===type); });
  ['none','form','urlenc','raw','binary','graphql'].forEach(function(t){
    var el=document.getElementById('body-'+t); if(el) el.style.display=t===type?'block':'none';
  });
  if (type === 'form') applyFormBulkVisual();
  if (type === 'urlenc') applyUrlencBulkVisual();
}
function beautifyRaw() {
  var ta=document.getElementById('code-raw'), fmt=(document.getElementById('raw-fmt')||{}).value;
  if(!ta||!ta.value.trim())return;
  if(fmt==='json'){ try{ta.value=JSON.stringify(JSON.parse(ta.value),null,2);notify('Beautified ✨','success');}catch(e){notify('Invalid JSON: '+e.message,'error');} }
  else notify('Beautify only supported for JSON','info');
}
function onRawFmtChange() {
  var fmt=(document.getElementById('raw-fmt')||{}).value, ta=document.getElementById('code-raw');
  if(!ta||ta.value.trim())return;
  var h={json:'{"key":"value"}',xml:'<root>\n  <el>value</el>\n</root>',html:'<h1>Hello</h1>',text:'text here',javascript:'console.log("hi")'};
  ta.placeholder=h[fmt]||'';
}
function showBinFile(input) { var f=input.files&&input.files[0]; if(f) document.getElementById('bin-label').textContent='📎 '+f.name+' ('+formatBytes(f.size)+')'; }
function handleBinDrop(e) {
  e.preventDefault(); document.getElementById('bin-drop').classList.remove('dov');
  var f=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0]; if(!f)return;
  var dt=new DataTransfer(); dt.items.add(f); document.getElementById('bin-file').files=dt.files;
  document.getElementById('bin-label').textContent='📎 '+f.name+' ('+formatBytes(f.size)+')';
}

// ─────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────
var AUTH_HTML = {
  none:    '<p class="auth-info">No authorization will be sent with this request.</p>',
  bearer:  '<div class="af"><label>TOKEN</label><input type="text" id="a-token" placeholder="Bearer token (supports {{variable}})"></div><p class="auth-info">Adds <code>Authorization: Bearer &lt;token&gt;</code> automatically.</p>',
  apikey:  '<div class="af"><label>KEY NAME</label><input type="text" id="a-key" placeholder="e.g. X-API-Key"></div><div class="af"><label>KEY VALUE</label><input type="text" id="a-key-val" placeholder="your-api-key"></div><div class="af"><label>ADD TO</label><select id="a-key-in"><option value="header">Header</option><option value="query">Query Params</option></select></div>',
  basic:   '<div class="af"><label>USERNAME</label><input type="text" id="a-user" placeholder="username"></div><div class="af"><label>PASSWORD</label><input type="password" id="a-pass" placeholder="password"></div><p class="auth-info">Encodes as Base64 → <code>Authorization: Basic &lt;base64(user:pass)&gt;</code></p>',
  digest:  '<div class="af"><label>USERNAME</label><input type="text" id="a-du" placeholder="username"></div><div class="af"><label>PASSWORD</label><input type="password" id="a-dp" placeholder="password"></div><div class="af"><label>REALM (auto from 401)</label><input type="text" id="a-realm" placeholder="leave blank for auto-detect"></div><div class="af"><label>NONCE (auto from 401)</label><input type="text" id="a-nonce" placeholder="leave blank for auto-detect"></div><div class="af"><label>QOP</label><input type="text" id="a-qop" placeholder="auth"></div>',
  oauth1:  '<div class="af"><label>CONSUMER KEY</label><input type="text" id="a-ck" placeholder="Consumer Key"></div><div class="af"><label>CONSUMER SECRET</label><input type="text" id="a-cs" placeholder="Consumer Secret"></div><div class="af"><label>ACCESS TOKEN</label><input type="text" id="a-at" placeholder="Access Token (optional)"></div><div class="af"><label>TOKEN SECRET</label><input type="text" id="a-ts" placeholder="Token Secret (optional)"></div><div class="af"><label>SIGNATURE METHOD</label><select id="a-sm"><option value="HMAC-SHA1">HMAC-SHA1</option><option value="HMAC-SHA256">HMAC-SHA256</option></select></div>',
  oauth2:  '<div class="af"><label>ACCESS TOKEN</label><input type="text" id="a-o2" placeholder="Paste your OAuth 2.0 access token"></div><div class="af"><label>HEADER PREFIX</label><input type="text" id="a-o2p" value="Bearer" placeholder="Bearer"></div>',
  hawk:    '<div class="af"><label>HAWK AUTH ID</label><input type="text" id="a-hid" placeholder="Hawk Auth ID"></div><div class="af"><label>HAWK AUTH KEY</label><input type="text" id="a-hkey" placeholder="Hawk Auth Key"></div><div class="af"><label>ALGORITHM</label><select id="a-halg"><option value="sha256">sha256</option><option value="sha1">sha1</option></select></div>',
  aws:     '<div class="af"><label>ACCESS KEY ID</label><input type="text" id="a-ak" placeholder="AKIAIOSFODNN7EXAMPLE"></div><div class="af"><label>SECRET ACCESS KEY</label><input type="password" id="a-sk" placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"></div><div class="af"><label>AWS REGION</label><input type="text" id="a-region" placeholder="us-east-1"></div><div class="af"><label>SERVICE</label><input type="text" id="a-svc" placeholder="execute-api"></div><div class="af"><label>SESSION TOKEN (optional)</label><input type="text" id="a-sess" placeholder="For temporary credentials"></div>',
  ntlm:    '<div class="af"><label>USERNAME</label><input type="text" id="a-nu" placeholder="username or DOMAIN\\username"></div><div class="af"><label>PASSWORD</label><input type="password" id="a-np" placeholder="password"></div><div class="af"><label>DOMAIN</label><input type="text" id="a-nd" placeholder="DOMAIN (optional)"></div><div class="af"><label>WORKSTATION</label><input type="text" id="a-nw" placeholder="optional"></div>',
};
function renderAuthFields(data) {
  data=data||{};
  var type=(document.getElementById('auth-sel')||{}).value||'none';
  document.getElementById('auth-fields').innerHTML=AUTH_HTML[type]||'';
  var tab=getActiveTab(); var ad=Object.keys(data).length>0?data:(tab&&tab.authData)||{};
  document.querySelectorAll('#auth-fields input, #auth-fields select').forEach(function(el){
    if(el.id&&ad[el.id]!==undefined) el.value=ad[el.id];
  });
}
function readAuthData() {
  var d={};
  document.querySelectorAll('#auth-fields input, #auth-fields select').forEach(function(el){ if(el.id)d[el.id]=el.value; });
  return d;
}

async function computeAuth(method, url) {
  var type=(document.getElementById('auth-sel')||{}).value||'none';
  var headers={}, queryParams={};
  if(type==='bearer'){ var t=resolveVars((document.getElementById('a-token')||{}).value||''); if(t)headers['Authorization']='Bearer '+t; }
  else if(type==='basic'){ var u=resolveVars((document.getElementById('a-user')||{}).value||''), p=resolveVars((document.getElementById('a-pass')||{}).value||''); headers['Authorization']='Basic '+btoa(unescape(encodeURIComponent(u+':'+p))); }
  else if(type==='apikey'){ var loc=(document.getElementById('a-key-in')||{}).value, k=resolveVars((document.getElementById('a-key')||{}).value||''), v=resolveVars((document.getElementById('a-key-val')||{}).value||''); if(k&&v){ if(loc==='query')queryParams[k]=v; else headers[k]=v; } }
  else if(type==='oauth2'){ var t2=resolveVars((document.getElementById('a-o2')||{}).value||''), pr=(document.getElementById('a-o2p')||{}).value||'Bearer'; if(t2)headers['Authorization']=pr+' '+t2; }
  else if(type==='oauth1'){ var ck=(document.getElementById('a-ck')||{}).value||'', cs=(document.getElementById('a-cs')||{}).value||'', at=(document.getElementById('a-at')||{}).value||'', ts=(document.getElementById('a-ts')||{}).value||'', sm=(document.getElementById('a-sm')||{}).value||'HMAC-SHA1'; if(ck&&cs){ try{ headers['Authorization']=await signOAuth1(method,url,ck,cs,at,ts,sm); }catch(e){ console.error('OAuth1',e); } } }
  else if(type==='hawk'){ var hid=(document.getElementById('a-hid')||{}).value||'', hkey=(document.getElementById('a-hkey')||{}).value||'', halg=(document.getElementById('a-halg')||{}).value||'sha256'; if(hid&&hkey){ try{ headers['Authorization']=await signHawk(method,url,hid,hkey,halg); }catch(e){ console.error('Hawk',e); } } }
  else if(type==='aws'){ var ak=(document.getElementById('a-ak')||{}).value||'', sk=(document.getElementById('a-sk')||{}).value||'', reg=(document.getElementById('a-region')||{}).value||'us-east-1', svc=(document.getElementById('a-svc')||{}).value||'execute-api', ses=(document.getElementById('a-sess')||{}).value||''; if(ak&&sk){ try{ Object.assign(headers,await signAWSv4(method,url,null,ak,sk,reg,svc,ses)); }catch(e){ console.error('AWS',e); } } }
  return { headers:headers, queryParams:queryParams };
}

/** Same auth logic as computeAuth, using a saved authData map (history / collections / buckets). */
async function computeAuthFromSnapshot(authType, authData, method, url, dataRow) {
  authData = authData || {};
  dataRow = dataRow || {};
  var rv = function(id){ return resolveVars(authData[id] != null ? String(authData[id]) : '', dataRow); };
  var headers = {}, queryParams = {};
  if (authType === 'bearer') { var t = rv('a-token'); if (t) headers['Authorization'] = 'Bearer ' + t; }
  else if (authType === 'basic') { var u = rv('a-user'), p = rv('a-pass'); headers['Authorization'] = 'Basic ' + btoa(unescape(encodeURIComponent(u + ':' + p))); }
  else if (authType === 'apikey') {
    var loc = authData['a-key-in'] || 'header', k = rv('a-key'), v = rv('a-key-val');
    if (k && v) { if (loc === 'query') queryParams[k] = v; else headers[k] = v; }
  }
  else if (authType === 'oauth2') { var t2 = rv('a-o2'), pr = authData['a-o2p'] || 'Bearer'; if (t2) headers['Authorization'] = pr + ' ' + t2; }
  else if (authType === 'oauth1') {
    var ck = rv('a-ck'), cs = rv('a-cs'), at = rv('a-at'), ts = rv('a-ts'), sm = authData['a-sm'] || 'HMAC-SHA1';
    if (ck && cs) { try { headers['Authorization'] = await signOAuth1(method, url, ck, cs, at, ts, sm); } catch (e) { console.error('OAuth1', e); } }
  }
  else if (authType === 'hawk') {
    var hid = rv('a-hid'), hkey = rv('a-hkey'), halg = authData['a-halg'] || 'sha256';
    if (hid && hkey) { try { headers['Authorization'] = await signHawk(method, url, hid, hkey, halg); } catch (e) { console.error('Hawk', e); } }
  }
  else if (authType === 'aws') {
    var ak = rv('a-ak'), sk = rv('a-sk'), reg = rv('a-region') || 'us-east-1', svc = rv('a-svc') || 'execute-api', ses = rv('a-sess');
    if (ak && sk) { try { Object.assign(headers, await signAWSv4(method, url, null, ak, sk, reg, svc, ses)); } catch (e) { console.error('AWS', e); } }
  }
  return { headers: headers, queryParams: queryParams };
}

function applyPathVarsToUrlString(url, pathVars, dataRow) {
  dataRow = dataRow || {};
  var out = resolveVars(url || '', dataRow);
  (pathVars || []).forEach(function(row) {
    if (!row.k) return;
    var val = encodeURIComponent(resolveVars(row.v, dataRow));
    out = out.replace(new RegExp(':' + row.k + '(?=/|$|\\?|#)', 'g'), val);
    out = out.replace(new RegExp('\\{' + row.k + '\\}', 'g'), val);
  });
  return out;
}

/**
 * Full request execution for history entries, collection items, and bucket snapshots
 * (all body modes except binary file replay).
 */
async function executeRequestObject(req, dataRow, execOpts) {
  dataRow = dataRow || {};
  execOpts = execOpts || {};
  var method = (req.method || 'GET').toUpperCase();
  var rawUrl = resolveVars(req.url || '', dataRow);
  var url = applyPathVarsToUrlString(rawUrl, req.pathVars, dataRow);
  var paramRows = (req.params || []).filter(function(r){ return r.on !== false && (r.k || r.key); });
  var qpAll = {};
  paramRows.forEach(function(r){ qpAll[resolveVars(r.k || r.key, dataRow)] = resolveVars(r.v || r.value || '', dataRow); });
  var authR = await computeAuthFromSnapshot(req.authType || 'none', req.authData || {}, method, url, dataRow);
  Object.assign(qpAll, authR.queryParams);
  var qpStr = new URLSearchParams(qpAll).toString();
  var finalUrl = url;
  if (qpStr) finalUrl += (url.indexOf('?') !== -1 ? '&' : '?') + qpStr;

  var headers = {};
  (req.headers || []).filter(function(x){ return x.on !== false && (x.k || x.key); }).forEach(function(x){
    headers[resolveVars(x.k || x.key, dataRow)] = resolveVars(x.v || x.value || '', dataRow);
  });
  Object.assign(headers, authR.headers);

  var body = null;
  var bt = req.bodyType || 'none';
  var rs = req.reqSettings || {};
  if (['GET', 'HEAD'].indexOf(method) === -1 && !rs.disableBody) {
    if (bt === 'raw') {
      body = resolveVars(req.rawBody || '', dataRow);
      var ctMap = { json: 'application/json', xml: 'application/xml', html: 'text/html', text: 'text/plain', javascript: 'application/javascript' };
      var rf = req.rawFmt || 'json';
      if (!headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = ctMap[rf] || 'text/plain';
    } else if (bt === 'urlenc') {
      var urows = (req.urlEncoded || []).filter(function(r){ return r.on !== false && (r.k || r.key); });
      body = urows.map(function(r){
        return encodeURIComponent(resolveVars(r.k || r.key, dataRow)) + '=' + encodeURIComponent(resolveVars(r.v || r.value || '', dataRow));
      }).join('&');
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    } else if (bt === 'form') {
      var fd = new FormData();
      var formRows = req.formData || req.formFields || [];
      formRows.forEach(function(r){
        var key = r.k || r.key;
        if (!key || r.on === false) return;
        if (r.type === 'file') return;
        fd.append(key, resolveVars(r.v || r.value || '', dataRow));
      });
      body = fd;
      var nh = {};
      Object.keys(headers).forEach(function(k){ if (k.toLowerCase() !== 'content-type') nh[k] = headers[k]; });
      headers = nh;
    } else if (bt === 'graphql') {
      var vars = {};
      try { vars = JSON.parse(resolveVars(req.gqlV || '{}', dataRow)); } catch (e) {}
      body = JSON.stringify({ query: resolveVars(req.gqlQ || '', dataRow), variables: vars });
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
    }
  }

  return fetchDirect(finalUrl, method, headers, body, execOpts && execOpts.signal);
}

async function signOAuth1(method,url,ck,cs,at,ts,sm){
  sm=sm||'HMAC-SHA1';
  var uo;try{uo=new URL(url);}catch(e){uo=new URL('https://example.com');}
  var bu=uo.protocol+'//'+uo.host+uo.pathname, qp={};
  uo.searchParams.forEach(function(v,k){qp[k]=v;});
  var nonce=Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2), ts2=String(Math.floor(Date.now()/1000));
  var op={oauth_consumer_key:ck,oauth_nonce:nonce,oauth_signature_method:sm,oauth_timestamp:ts2,oauth_version:'1.0'};
  if(at)op.oauth_token=at;
  var allP=Object.assign({},qp,op);
  var pStr=Object.keys(allP).sort().map(function(k){return pct(k)+'='+pct(allP[k]);}).join('&');
  var base=[method.toUpperCase(),pct(bu),pct(pStr)].join('&');
  var sigKey=pct(cs)+'&'+pct(ts||'');
  var sig=await hmacB64(sm.indexOf('256')!==-1?'SHA-256':'SHA-1',sigKey,base);
  op.oauth_signature=sig;
  return 'OAuth '+Object.keys(op).sort().map(function(k){return k+'="'+pct(op[k])+'"';}).join(', ');
}
async function signHawk(method,url,id,key,algo){
  algo=algo||'sha256';
  var ts=Math.floor(Date.now()/1000), nonce=Math.random().toString(36).slice(2,8);
  var p;try{p=new URL(url);}catch(e){p=new URL('https://example.com');}
  var resource=p.pathname+(p.search||''), host=p.hostname, port=p.port||(p.protocol==='https:'?'443':'80');
  var norm=['hawk.1.header',ts,nonce,method.toUpperCase(),resource,host,port,'','','',''].join('\n')+'\n';
  var mac=await hmacB64(algo==='sha1'?'SHA-1':'SHA-256',key,norm);
  return 'Hawk id="'+id+'", ts="'+ts+'", nonce="'+nonce+'", mac="'+mac+'"';
}
async function signAWSv4(method,url,body,ak,sk,region,service,session){
  var u;try{u=new URL(url);}catch(e){return{};}
  var now=new Date(), date=now.toISOString().slice(0,10).replace(/-/g,''), dt=now.toISOString().replace(/[:\-]|\.\d{3}/g,'').slice(0,15)+'Z';
  var bHash=await sha256hex(body||'');
  var sH={'host':u.hostname+(u.port?':'+u.port:''),'x-amz-date':dt,'x-amz-content-sha256':bHash};
  if(session)sH['x-amz-security-token']=session;
  var sN=Object.keys(sH).sort(), cH=sN.map(function(k){return k+':'+sH[k];}).join('\n')+'\n', sHStr=sN.join(';');
  var qa=[];u.searchParams.forEach(function(v,k){qa.push([encodeURIComponent(k),encodeURIComponent(v)]);});qa.sort(function(a,b){return a[0]<b[0]?-1:a[0]>b[0]?1:0;});
  var cQ=qa.map(function(p){return p[0]+'='+p[1];}).join('&');
  var cR=[method.toUpperCase(),u.pathname||'/',cQ,cH,sHStr,bHash].join('\n');
  var scope=date+'/'+region+'/'+service+'/aws4_request';
  var sts=['AWS4-HMAC-SHA256',dt,scope,await sha256hex(cR)].join('\n');
  var kD=await _hmac('SHA-256','AWS4'+sk,date), kR=await _hmac('SHA-256',kD,region), kS=await _hmac('SHA-256',kR,service), kSn=await _hmac('SHA-256',kS,'aws4_request');
  var sigB=await _hmac('SHA-256',kSn,sts);
  var sig=Array.from(sigB).map(function(b){return b.toString(16).padStart(2,'0');}).join('');
  var result={'Authorization':'AWS4-HMAC-SHA256 Credential='+ak+'/'+scope+', SignedHeaders='+sHStr+', Signature='+sig,'x-amz-date':dt,'x-amz-content-sha256':bHash};
  if(session)result['x-amz-security-token']=session;
  return result;
}

function colorMethod() {
  var sel=document.getElementById('method-sel'); if(!sel)return;
  sel.style.color=MC[sel.value]||'var(--text1)';
  var t=getActiveTab(); if(t){ t.method=sel.value; renderTabs(); }
}

// ─────────────────────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────────────────────
function toggleCORS() {
  S.settings.corsEnabled=!S.settings.corsEnabled;
  if(!S.settings.proxyUrl) S.settings.proxyUrl='https://square-credit-8186.donthulanithish53.workers.dev/?url=';
  save(); refreshCORSBtn();
  notify(S.settings.corsEnabled?'⚡ CORS Proxy ENABLED':'🔴 CORS Proxy disabled', S.settings.corsEnabled?'success':'info');
}
function refreshCORSBtn() {
  var btn=document.getElementById('cors-btn'); if(!btn)return;
  btn.textContent=S.settings.corsEnabled?'⚡ CORS: ON':'⚡ CORS: OFF';
  btn.className=S.settings.corsEnabled?'on':''; btn.id='cors-btn';
}

// ─────────────────────────────────────────────────────────────
// MOCK
// ─────────────────────────────────────────────────────────────
function checkMock(method, url) {
  if(!(document.getElementById('opt-mock')||{}).checked) return null;
  for(var i=0;i<S.mocks.length;i++){
    var m=S.mocks[i]; if(!m.enabled)continue;
    if(m.method!=='*'&&m.method!==method)continue;
    var rx=new RegExp('^'+m.path.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\\\*/g,'.*')+'$');
    if(rx.test(url)||url.indexOf(m.path)!==-1) return m;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// COLLECT FULL HISTORY ENTRY — captures ALL 8 input sections
// ─────────────────────────────────────────────────────────────
function collectHistoryEntry(method, rawUrl, status, elapsed) {
  var tab = getActiveTab();
  // 1. Params
  var params = readKV('params').filter(function(r){ return r.k; });
  // 2. Path Variables
  var pathVars = readPathVars();
  // 3. Headers
  var headers = readKV('headers').filter(function(r){ return r.k; });
  // 4. Body (all types)
  var bodyType   = _bodyType;
  var rawBody    = '';
  var rawFmt     = (document.getElementById('raw-fmt')||{}).value||'json';
  var urlEncoded = [];
  var formFields = [];
  var gqlQ = '', gqlV = '';
  if(bodyType==='raw')     rawBody     = (document.getElementById('code-raw')||{}).value||'';
  if(bodyType==='urlenc')  urlEncoded  = readKV('urlenc').filter(function(r){ return r.k; });
  if(bodyType==='form')    formFields  = readFormData().map(function(r){ return {k:r.k, v:r.v, type:r.type}; });
  if(bodyType==='graphql'){ gqlQ=(document.getElementById('gql-q')||{}).value||''; gqlV=(document.getElementById('gql-v')||{}).value||''; }
  // 5. Auth
  var authType = (document.getElementById('auth-sel')||{}).value||'none';
  var authData = readAuthData();
  // 6. Pre-req Script
  var preScript = (document.getElementById('pre-script')||{}).value||'';
  // 7. Test Script
  var testScript = (document.getElementById('test-script')||{}).value||'';
  // 8. Settings
  var reqSettings = {
    followRedirects: (document.getElementById('opt-redirect')||{}).checked !== false,
    disableBody:     !!(document.getElementById('opt-nobody')||{}).checked,
    useMock:         !!(document.getElementById('opt-mock')||{}).checked,
    timeout:         parseInt((document.getElementById('opt-timeout')||{}).value)||30000
  };
  return {
    id:         uid(),
    method:     method,
    url:        rawUrl,
    name:       (tab&&tab.name)||rawUrl.replace(/^https?:\/\//,'').slice(0,40)||'Request',
    status:     status,
    time:       elapsed,
    at:         new Date().toLocaleTimeString(),
    pinned:     false,
    // All 8 sections:
    params:     params,
    pathVars:   pathVars,
    headers:    headers,
    bodyType:   bodyType,
    rawBody:    rawBody,
    rawFmt:     rawFmt,
    urlEncoded: urlEncoded,
    formFields: formFields,
    gqlQ:       gqlQ,
    gqlV:       gqlV,
    authType:   authType,
    authData:   authData,
    preScript:  preScript,
    testScript: testScript,
    reqSettings:reqSettings
  };
}

// ─────────────────────────────────────────────────────────────
// SEND REQUEST
// ─────────────────────────────────────────────────────────────
/** Snapshot of active tab for executeRequestObject (repeat attack, etc.) */
function buildSnapshotFromActiveTab() {
  var t = getActiveTab();
  if (!t) return { url: '', method: 'GET', bodyType: 'none' };
  return {
    method: t.method || 'GET',
    url: t.url || '',
    params: t.params || [],
    pathVars: t.pathVars || [],
    headers: t.headers || [],
    bodyType: t.bodyType || 'none',
    rawBody: t.rawBody || '',
    rawFmt: t.rawFmt || 'json',
    urlEncoded: t.urlEncoded || [],
    formData: t.formData || [],
    gqlQ: t.gqlQ || '',
    gqlV: t.gqlV || '',
    authType: t.authType || 'none',
    authData: t.authData || {},
    reqSettings: {
      followRedirects: (document.getElementById('opt-redirect') || {}).checked !== false,
      disableBody: !!(document.getElementById('opt-nobody') || {}).checked,
      useMock: !!(document.getElementById('opt-mock') || {}).checked,
      timeout: parseInt((document.getElementById('opt-timeout') || {}).value, 10) || 30000
    }
  };
}

/** Main bar: Send ×N — queue (sequential) or at-a-time (waves of up to 900/s). Live stats + retries + resume. */
async function sendRequestRepeatAttack(repeatN, rawUrl, method, tab) {
  var sendBtn = document.getElementById('send-btn'), cancelBtn = document.getElementById('cancel-btn');
  var statsBar = document.getElementById('repeat-stats-bar');
  var modeEl = document.getElementById('send-repeat-mode');
  var mode = (modeEl && modeEl.value === 'burst') ? 'burst' : 'queue';
  sendBtn.disabled = true;
  sendBtn.textContent = '×' + repeatN + '…';
  cancelBtn.style.display = '';
  if (statsBar) statsBar.style.display = 'flex';
  updateRepeatStatsBar({ total: repeatN, sent: 0, success: 0, failed: 0, retries: 0, queued: repeatN });
  _abortCtrl = new AbortController();
  try {
    var snapshot = buildSnapshotFromActiveTab();
    if (!snapshot.url || !String(snapshot.url).trim()) {
      notify('Enter a URL first', 'error');
      if (statsBar) statsBar.style.display = 'none';
      return;
    }
    var batchResult = await runRepeatBatch({
      snapshot: snapshot,
      total: repeatN,
      mode: mode,
      delayMs: 0,
      signal: _abortCtrl.signal,
      startIndex: 0,
      rawUrl: rawUrl,
      method: method,
      tab: tab,
      persist: true
    });
    var lastRo = batchResult.lastRo;
    if (!lastRo) {
      notify(batchResult.aborted ? 'Stopped' : 'No response', batchResult.aborted ? 'info' : 'error');
      return;
    }
    var fr = {
      status: lastRo.status,
      statusText: lastRo.statusText,
      _body: lastRo._body,
      _headers: lastRo._headers,
      _time: lastRo._time,
      _size: lastRo._size
    };
    if (tab) tab.response = fr;
    _lastResponse = fr;
    var pmObj2 = buildPM(fr, (tab && tab.collVars) || {});
    var tc1 = (document.getElementById('test-script') || {}).value || '';
    if (tc1.trim()) runScript(tc1, pmObj2);
    addHistory(collectHistoryEntry(method, rawUrl, lastRo.status, lastRo._time));
    showResponse(fr);
    renderTests();
    flushConsole();
    clearRepeatJob();
    notify('Done · sent ' + repeatN + ' · OK ' + batchResult.success + ' · fail ' + batchResult.failed + ' · retries ' + batchResult.retries, batchResult.failed ? 'warn' : 'success');
  } catch (e) {
    if (e && e.name === 'AbortError') notify('Stopped', 'info');
    else notify('Repeat failed: ' + (e && e.message ? e.message : String(e)), 'error');
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send ➤';
    cancelBtn.style.display = 'none';
    if (statsBar) statsBar.style.display = 'none';
    _abortCtrl = null;
  }
}

/** Resume an interrupted ×N run after reload (same tab / new session). */
async function resumeRepeatJobFromStorage() {
  var job = readRepeatJob();
  if (!job || !job.active || !job.snapshot || job.done >= job.total) { clearRepeatJob(); return; }
  var remain = job.total - job.done;
  if (!confirm('Resume incomplete batch: ' + job.done + ' / ' + job.total + ' done (' + remain + ' left)?')) {
    clearRepeatJob();
    return;
  }
  var sendBtn = document.getElementById('send-btn'), cancelBtn = document.getElementById('cancel-btn');
  var statsBar = document.getElementById('repeat-stats-bar');
  if (statsBar) statsBar.style.display = 'flex';
  sendBtn.disabled = true;
  cancelBtn.style.display = '';
  _abortCtrl = new AbortController();
  var method = job.method || 'GET';
  var rawUrl = job.rawUrl || '';
  var tab = getActiveTab();
  updateRepeatStatsBar({ total: job.total, sent: job.done, success: job.success || 0, failed: job.failed || 0, retries: job.retries || 0, queued: job.total - job.done });
  try {
    var batchResult = await runRepeatBatch({
      snapshot: job.snapshot,
      total: job.total,
      mode: job.mode === 'burst' ? 'burst' : 'queue',
      delayMs: 0,
      signal: _abortCtrl.signal,
      startIndex: job.done,
      rawUrl: rawUrl,
      method: method,
      tab: tab,
      initialSuccess: job.success || 0,
      initialFailed: job.failed || 0,
      initialRetries: job.retries || 0,
      persist: true
    });
    var lastRo = batchResult.lastRo;
    if (lastRo) {
      var fr = {
        status: lastRo.status,
        statusText: lastRo.statusText,
        _body: lastRo._body,
        _headers: lastRo._headers,
        _time: lastRo._time,
        _size: lastRo._size
      };
      if (tab) tab.response = fr;
      _lastResponse = fr;
      var pmObj2 = buildPM(fr, (tab && tab.collVars) || {});
      var tc1 = (document.getElementById('test-script') || {}).value || '';
      if (tc1.trim()) runScript(tc1, pmObj2);
      showResponse(fr);
      renderTests();
      flushConsole();
    }
    clearRepeatJob();
    notify('Resume finished · OK ' + batchResult.success + ' · fail ' + batchResult.failed, batchResult.failed ? 'warn' : 'success');
  } catch (e) {
    if (e && e.name === 'AbortError') notify('Stopped', 'info');
    else notify('Resume failed: ' + (e && e.message ? e.message : String(e)), 'error');
  } finally {
    sendBtn.disabled = false;
    cancelBtn.style.display = 'none';
    if (statsBar) statsBar.style.display = 'none';
    _abortCtrl = null;
  }
}

function cancelReq() {
  if(_abortCtrl) _abortCtrl.abort();
  if(typeof _advRunning!=='undefined') _advRunning=false;
  var statsBar=document.getElementById('repeat-stats-bar');
  if(statsBar)statsBar.style.display='none';
  document.getElementById('cancel-btn').style.display='none';
  document.getElementById('send-btn').disabled=false;
  document.getElementById('send-btn').textContent='Send ➤';
}

async function sendRequest() {
  if (_formBulkMode) syncFormTableFromBulk();
  if (_urlencBulkMode) syncUrlencTableFromBulk();
  saveTabUI();
  var tab=getActiveTab(), method=document.getElementById('method-sel').value, rawUrl=document.getElementById('url-in').value.trim();
  if(!rawUrl){ notify('Enter a URL first','error'); return; }

  var repeatEl=document.getElementById('send-repeat');
  var repeatN=repeatEl?Math.max(1,Math.min(100000,parseInt(repeatEl.value,10)||1)):1;

  var preCode=(document.getElementById('pre-script')||{}).value||'';
  if(preCode.trim()){ var pmObj0=buildPM(null,(tab&&tab.collVars)||{}); runScript(preCode,pmObj0); flushConsole(); }

  if(repeatN>1){
    await sendRequestRepeatAttack(repeatN,rawUrl,method,tab);
    return;
  }

  var url=resolveVars(rawUrl); url=resolvePathInUrl(url);
  var paramRows=readKV('params').filter(function(r){return r.on&&r.k;});
  var hdrRows=readKV('headers').filter(function(r){return r.on&&r.k;});
  var authResult=await computeAuth(method,url);
  var authH=authResult.headers, authQP=authResult.queryParams;

  var finalUrl=url;
  var qpAll={};
  paramRows.forEach(function(r){ qpAll[resolveVars(r.k)]=resolveVars(r.v); });
  Object.assign(qpAll,authQP);
  var qpStr=new URLSearchParams(qpAll).toString();
  if(qpStr) finalUrl+=(url.indexOf('?')!==-1?'&':'?')+qpStr;

  var headers={};
  hdrRows.forEach(function(h){ headers[resolveVars(h.k)]=resolveVars(h.v); });
  Object.assign(headers,authH);

  var disableBody=(document.getElementById('opt-nobody')||{}).checked;
  var body=null;
  if(!disableBody && ['GET','HEAD'].indexOf(method)===-1) {
    if(_bodyType==='raw'){
      body=resolveVars((document.getElementById('code-raw')||{}).value||'');
      if(!headers['Content-Type']&&!headers['content-type']){
        var ctMap={json:'application/json',xml:'application/xml',html:'text/html',text:'text/plain',javascript:'application/javascript'};
        headers['Content-Type']=ctMap[(document.getElementById('raw-fmt')||{}).value]||'text/plain';
      }
    } else if(_bodyType==='urlenc'){
      var rows=readKV('urlenc').filter(function(r){return r.on&&r.k;});
      body=rows.map(function(r){return encodeURIComponent(resolveVars(r.k))+'='+encodeURIComponent(resolveVars(r.v));}).join('&');
      headers['Content-Type']='application/x-www-form-urlencoded';
    } else if(_bodyType==='form'){
      var fd=new FormData();
      document.querySelectorAll('#kv-form tr').forEach(function(tr){
        var chk=tr.querySelector('.kv-chk'), key=(tr.querySelectorAll('input[type=text]')[0]||{}).value, typ=(tr.querySelector('.fv-type-sel')||{}).value||'text';
        if(!chk||!chk.checked||!key)return;
        if(typ==='file'){ var f=tr.querySelector('.fv-file input[type=file]'); if(f&&f.files&&f.files[0])fd.append(key,f.files[0]); }
        else fd.append(key,resolveVars((tr.querySelector('.fv-text input')||{}).value||''));
      });
      body=fd;
    } else if(_bodyType==='graphql'){
      var vars={};
      try{ vars=JSON.parse(resolveVars((document.getElementById('gql-v')||{}).value||'{}')); }catch(e){}
      body=JSON.stringify({query:resolveVars((document.getElementById('gql-q')||{}).value||''),variables:vars});
      if(!headers['Content-Type']) headers['Content-Type']='application/json';
    } else if(_bodyType==='binary'){
      var binFile=document.getElementById('bin-file');
      var f=binFile&&binFile.files&&binFile.files[0];
      if(f){ body=f; if(!headers['Content-Type'])headers['Content-Type']=f.type||'application/octet-stream'; }
    }
  }

  var mock=checkMock(method,finalUrl);
  if(mock){
    await sleep(mock.delay||0);
    var fr={status:mock.statusCode||200,statusText:'OK (Mock)',_body:resolveVars(mock.body||'{}'),
      _headers:{'content-type':mock.contentType||'application/json'},_time:mock.delay||0,_size:new Blob([mock.body||'']).size,_mock:true};
    if(mock.headers) mock.headers.filter(function(h){return h.k;}).forEach(function(h){fr._headers[h.k.toLowerCase()]=h.v;});
    if(tab)tab.response=fr; _lastResponse=fr;
    var pmObj1=buildPM(fr,(tab&&tab.collVars)||{});
    var tc1=(document.getElementById('test-script')||{}).value||'';
    if(tc1.trim()) runScript(tc1,pmObj1);
    addHistory(collectHistoryEntry(method,rawUrl,fr.status,fr._time));
    showResponse(fr); renderTests(); flushConsole();
    notify('🎭 Mock '+fr.status,'info'); return;
  }

  var isDirect=isPrivate(finalUrl);
  var fetchUrl=isDirect?finalUrl:(S.settings.corsEnabled?S.settings.proxyUrl+encodeURIComponent(finalUrl):finalUrl);
  var sendBtn=document.getElementById('send-btn'), cancelBtn=document.getElementById('cancel-btn');
  sendBtn.disabled=true; sendBtn.textContent='Sending…'; cancelBtn.style.display='';
  var timeout=parseInt((document.getElementById('opt-timeout')||{}).value)||30000;
  _abortCtrl=new AbortController();
  var tId=setTimeout(function(){if(_abortCtrl)_abortCtrl.abort();},timeout);
  var t0=Date.now();

  try {
    var opts={method:method,headers:headers,signal:_abortCtrl.signal};
    if(body) opts.body=body;

    // Digest auth retry
    if((document.getElementById('auth-sel')||{}).value==='digest'){
      var r0=await rateLimitedFetch(fetchUrl,Object.assign({},opts,{headers:Object.assign({},headers)})).catch(function(){return null;});
      if(r0&&r0.status===401){
        var wa=r0.headers.get('www-authenticate')||'';
        var realm=(wa.match(/realm="([^"]+)"/i)||[])[1]||(document.getElementById('a-realm')||{}).value||'';
        var nonce=(wa.match(/nonce="([^"]+)"/i)||[])[1]||(document.getElementById('a-nonce')||{}).value||'';
        var qop=((wa.match(/qop="?([^",]+)/i)||[])[1]||'auth').trim();
        var u2=(document.getElementById('a-du')||{}).value||'', p2=(document.getElementById('a-dp')||{}).value||'';
        if(realm&&nonce){
          var nc='00000001', cnonce=Math.random().toString(36).slice(2,10);
          var uri; try{uri=new URL(finalUrl).pathname;}catch(e){uri='/';}
          var ha1=md5(u2+':'+realm+':'+p2), ha2=md5(method+':'+uri), dres=md5(ha1+':'+nonce+':'+nc+':'+cnonce+':'+qop+':'+ha2);
          headers['Authorization']='Digest username="'+u2+'", realm="'+realm+'", nonce="'+nonce+'", uri="'+uri+'", nc='+nc+', cnonce="'+cnonce+'", qop='+qop+', response="'+dres+'"';
          opts.headers=headers;
        }
      }
    }

    var resp=await rateLimitedFetch(fetchUrl,opts);
    clearTimeout(tId);
    var elapsed=Date.now()-t0;
    var respH={};
    resp.headers.forEach(function(v,k){ respH[k]=v; });
    var ct=(respH['content-type']||'').toLowerCase();

    // Detect binary/image
    var isBin=ct.indexOf('image/')===0||ct.indexOf('application/octet-stream')===0||ct.indexOf('application/pdf')===0||ct.indexOf('application/zip')===0||ct.indexOf('audio/')===0||ct.indexOf('video/')===0||ct.indexOf('font/')===0;

    var respTxt='', binaryDataUrl=null, arrayBuf=null;
    if(isBin){
      arrayBuf=await resp.arrayBuffer();
      var uint8=new Uint8Array(arrayBuf);
      var binary='';
      var chunkSize=8192;
      for(var ci=0;ci<uint8.length;ci+=chunkSize){
        binary+=String.fromCharCode.apply(null,uint8.subarray(ci,ci+chunkSize));
      }
      var b64=btoa(binary);
      binaryDataUrl='data:'+ct.split(';')[0]+';base64,'+b64;
      respTxt='[Binary data — '+formatBytes(arrayBuf.byteLength)+']';
    } else {
      respTxt=await resp.text();
    }

    var size=arrayBuf?arrayBuf.byteLength:new Blob([respTxt]).size;

    // Cookie extraction
    try{
      var domain=new URL(finalUrl).hostname, sc=resp.headers.get('set-cookie')||respH['set-cookie']||'';
      if(sc){
        if(!S.cookies[domain])S.cookies[domain]={};
        sc.split(/,(?=[^;]+=[^;]+)/).forEach(function(c){
          var kv=c.trim().split(';')[0]; var parts=kv.split('='); var ck=parts.shift();
          if(ck&&ck.trim())S.cookies[domain][ck.trim()]=parts.join('=').trim();
        });
        save();
      }
    }catch(e){}

    var ro={
      status:resp.status, statusText:resp.statusText,
      _body:respTxt, _headers:respH, _time:elapsed, _size:size,
      _isBinary:isBin, _dataUrl:binaryDataUrl, _arrayBuf:arrayBuf
    };
    if(tab) tab.response=ro;
    _lastResponse=ro;

    _testResults=[];
    var testCode=(document.getElementById('test-script')||{}).value||'';
    if(testCode.trim()){ var pmObj2=buildPM(ro,(tab&&tab.collVars)||{}); runScript(testCode,pmObj2); }

    // Save FULL history with all 8 sections
    addHistory(collectHistoryEntry(method,rawUrl,resp.status,elapsed));

    showResponse(ro); flushConsole(); renderTests();
    notify(resp.status+' '+resp.statusText+' — '+elapsed+'ms', resp.status>=500?'error':resp.status>=400?'warn':'success');

  } catch(e) {
    clearTimeout(tId);
    if(e.name==='AbortError'){ notify('Request cancelled / timed out','info'); }
    else {
      var hint=isDirect
        ? e.message+'\n\n💡 Private/internal IP — ensure server is reachable from your browser network.'
        : S.settings.corsEnabled ? e.message : e.message+'\n\n💡 Enable ⚡ CORS Proxy to bypass browser CORS restrictions.';
      showErrorResp(hint, Date.now()-t0);
      notify('Request failed — '+e.message,'error');
    }
  } finally {
    sendBtn.disabled=false; sendBtn.textContent='Send ➤'; cancelBtn.style.display='none'; _abortCtrl=null;
  }
}

// Helper for collection runner / advanced repeat / buckets
async function fetchDirect(url, method, headers, body, signal) {
  headers=headers||{}; body=body||null;
  var isDirect=isPrivate(url);
  var fu=isDirect?url:(S.settings.corsEnabled?S.settings.proxyUrl+encodeURIComponent(url):url);
  var opts={method:method||'GET',headers:headers};
  if (signal) opts.signal = signal;
  if(body&&['GET','HEAD'].indexOf((method||'GET').toUpperCase())===-1) opts.body=body;
  if (body instanceof FormData) {
    var nh = {};
    Object.keys(headers).forEach(function(k){ if (k.toLowerCase() !== 'content-type') nh[k] = headers[k]; });
    opts.headers = nh;
  }
  var t0=Date.now();
  var resp=await rateLimitedFetch(fu,opts);
  var txt=await resp.text();
  var hdrs={};resp.headers.forEach(function(v,k){hdrs[k]=v;});
  return {status:resp.status,statusText:resp.statusText,_body:txt,_headers:hdrs,_time:Date.now()-t0,_size:new Blob([txt]).size};
}
