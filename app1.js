/* ============================================================
   POSTMANWEB v4 — app1.js  (Module 1 of 2)
   State · Storage · Helpers · Crypto · Variables · Tabs ·
   KV Tables · Body · Auth · CORS · Mock · Send Request
   ============================================================ */
'use strict';

// ─────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────
const S = {
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
};

function fixHistory(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(h => ({ ...h, pinned: h.pinned === true }));
}

let _bodyType    = 'none';
let _testResults = [];
let _consoleLogs = [];
let _abortCtrl   = null;
let _wsConn      = null;
let _localVars   = {};
let _iterInfo    = { iteration:0, iterationCount:1, dataRow:{} };

// Current response — needed by enlarge / binary download
let _lastResponse = null;

// Advanced repeat state
let _advEntry   = null;
let _advRunning = false;

// ─────────────────────────────────────────────────────────────
// STORAGE
// ─────────────────────────────────────────────────────────────
function load(k, def) {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; }
  catch { return def; }
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
  } catch(e) { console.error('Save error', e); }
}

// ─────────────────────────────────────────────────────────────
// PRIVATE IP DETECTION
// ─────────────────────────────────────────────────────────────
const PRIV = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^169\.254\.\d+\.\d+$/,
  /^::1$/, /^0\.0\.0\.0$/,
];
function isPrivate(urlStr) {
  try { return PRIV.some(p => p.test(new URL(urlStr).hostname)); }
  catch { return false; }
}
function refreshDirectBadge(urlStr) {
  const b = document.getElementById('direct-badge');
  if (b) b.classList.toggle('visible', isPrivate(urlStr || ''));
}

// ─────────────────────────────────────────────────────────────
// CONTENT TYPE HELPERS
// ─────────────────────────────────────────────────────────────
function getContentType(r) {
  return (r?._headers?.['content-type'] || r?._headers?.['Content-Type'] || '').toLowerCase();
}
function isJsonResponse(r) {
  const ct = getContentType(r);
  return ct.includes('json') || /^\s*[\[{]/.test(r?._body || '');
}
function isHtmlResponse(r) {
  if (!r) return false;
  const ct = getContentType(r);
  if (ct.includes('text/html') || ct.includes('application/xhtml')) return true;
  const body = (r._body || '').trimStart().toLowerCase();
  return body.startsWith('<!doctype') || body.startsWith('<html') ||
         body.startsWith('<head') || body.startsWith('<body');
}
function isXmlResponse(r) {
  const ct = getContentType(r);
  return ct.includes('xml');
}
function isImageResponse(r) {
  const ct = getContentType(r);
  return ct.startsWith('image/');
}
function isBinaryResponse(r) {
  const ct = getContentType(r);
  const binaryTypes = [
    'application/octet-stream','application/pdf','application/zip',
    'application/gzip','application/x-tar','application/x-7z',
    'application/x-rar','application/vnd.','application/msword',
    'application/x-download','font/','audio/','video/'
  ];
  return binaryTypes.some(t => ct.startsWith(t)) || r?._isBinary === true;
}
function getResponseLabel(r) {
  const ct = getContentType(r);
  if (!ct) return '';
  if (ct.includes('json'))       return 'JSON';
  if (ct.includes('text/html'))  return 'HTML';
  if (ct.includes('xml'))        return 'XML';
  if (ct.includes('text/plain')) return 'TEXT';
  if (ct.startsWith('image/'))   return 'IMAGE';
  if (ct.includes('pdf'))        return 'PDF';
  if (ct.includes('csv'))        return 'CSV';
  return ct.split(';')[0].split('/')[1]?.toUpperCase() || 'BINARY';
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
function uid()  { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function notify(msg, type='info') {
  const el = document.createElement('div');
  el.className = 'notif ' + type;
  el.textContent = msg;
  document.getElementById('notifs').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
function openModal(html) {
  const c = document.getElementById('modals');
  c.innerHTML = html;
  c.querySelector('.modal-bg')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
}
function closeModal() { document.getElementById('modals').innerHTML = ''; }
function dl(content, filename, type='application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
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
  const enc = new TextEncoder();
  const kd  = typeof key === 'string' ? enc.encode(key) : key;
  const ck  = await crypto.subtle.importKey('raw', kd, { name:'HMAC', hash:algo }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', ck, enc.encode(data)));
}
async function hmacB64(algo, key, data) {
  const b = await _hmac(algo, key, data);
  return btoa(String.fromCharCode(...b));
}
async function sha256hex(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2,'0')).join('');
}
function pct(s) {
  return encodeURIComponent(String(s ?? '')).replace(/[!'()*]/g, c =>
    '%' + c.charCodeAt(0).toString(16).toUpperCase());
}
function md5(str) {
  function safe(x,y){const m=(65535&x)+(65535&y);return(x>>16)+(y>>16)+(m>>16)<<16|65535&m}
  function rot(x,n){return x<<n|x>>>32-n}
  const enc=s=>{const a=[];for(let i=0;i<s.length*8;i+=8)a[i>>5]|=(255&s.charCodeAt(i/8))<<i%32;return a};
  const core=(x,l)=>{
    x[l>>5]|=128<<l%32;x[14+(l+64>>>9<<4)]=l;
    let a=1732584193,b=-271733879,c=-1732584194,d=271733878;
    const ff=(a,b,c,d,x,s,t)=>safe(rot(safe(safe(a,b&c|~b&d),safe(x,t)),s),b);
    const gg=(a,b,c,d,x,s,t)=>safe(rot(safe(safe(a,b&d|c&~d),safe(x,t)),s),b);
    const hh=(a,b,c,d,x,s,t)=>safe(rot(safe(safe(a,b^c^d),safe(x,t)),s),b);
    const ii=(a,b,c,d,x,s,t)=>safe(rot(safe(safe(a,c^(b|~d)),safe(x,t)),s),b);
    for(let k=0;k<x.length;k+=16){
      const[A,B,C,D]=[a,b,c,d];
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
  const arr=enc(str),r=core(arr,str.length*8);
  let h='';for(const n of r)for(let j=0;j<4;j++)h+=(n>>>j*8&255).toString(16).padStart(2,'0');
  return h;
}

// ─────────────────────────────────────────────────────────────
// VARIABLE RESOLUTION
// ─────────────────────────────────────────────────────────────
function getEnv()       { return S.envs.find(e => e.id === S.activeEnv) || null; }
function getActiveTab() { return S.tabs.find(t => t.id === S.activeId); }

const DYN = {
  '$timestamp':          ()=>String(Date.now()),
  '$isoTimestamp':       ()=>new Date().toISOString(),
  '$randomInt':          ()=>String(Math.floor(Math.random()*1000)),
  '$randomFloat':        ()=>(Math.random()*100).toFixed(2),
  '$guid':               ()=>'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:r&0x3|0x8).toString(16);}),
  '$randomUUID':         ()=>DYN['$guid'](),
  '$randomAlphaNumeric': ()=>Math.random().toString(36).slice(2,10),
  '$randomBoolean':      ()=>String(Math.random()>.5),
  '$randomFirstName':    ()=>['Alice','Bob','Charlie','Diana','Eve','Frank','Grace','Hank','Ivy','Jack'][Math.floor(Math.random()*10)],
  '$randomLastName':     ()=>['Smith','Jones','Williams','Brown','Davis','Miller','Wilson','Taylor','Clark','Lee'][Math.floor(Math.random()*10)],
  '$randomFullName':     ()=>DYN['$randomFirstName']()+' '+DYN['$randomLastName'](),
  '$randomEmail':        ()=>`user${Math.floor(Math.random()*90000+10000)}@example.com`,
  '$randomUrl':          ()=>`https://example${Math.floor(Math.random()*100)}.com`,
  '$randomIP':           ()=>[1,2,3,4].map(()=>Math.floor(Math.random()*255)).join('.'),
  '$randomColor':        ()=>['red','green','blue','yellow','pink','purple','orange'][Math.floor(Math.random()*7)],
  '$randomHexColor':     ()=>'#'+Math.floor(Math.random()*16777215).toString(16).padStart(6,'0'),
  '$randomCountry':      ()=>['India','USA','UK','Germany','France','Japan','Brazil','Canada'][Math.floor(Math.random()*8)],
  '$randomCity':         ()=>['Mumbai','New York','London','Berlin','Paris','Tokyo','Sydney','Toronto'][Math.floor(Math.random()*8)],
  '$randomJobTitle':     ()=>['Engineer','Manager','Designer','Analyst','Director','Developer'][Math.floor(Math.random()*6)],
  '$randomCompanyName':  ()=>['Acme Corp','Tech Inc','Global Ltd','Prime Co','NextGen LLC'][Math.floor(Math.random()*5)],
  '$randomPrice':        ()=>(Math.random()*999+1).toFixed(2),
  '$randomCurrencyCode': ()=>['USD','EUR','GBP','JPY','INR','AUD','CAD'][Math.floor(Math.random()*7)],
  '$randomDateFuture':   ()=>new Date(Date.now()+Math.random()*365*86400000).toISOString().slice(0,10),
  '$randomDatePast':     ()=>new Date(Date.now()-Math.random()*365*86400000).toISOString().slice(0,10),
  '$randomSemver':       ()=>`${Math.floor(Math.random()*10)}.${Math.floor(Math.random()*10)}.${Math.floor(Math.random()*100)}`,
};

function resolveVars(str, extra={}) {
  if (str===null||str===undefined) return str;
  str=String(str);
  const env=getEnv(), ev=env?.variables||{}, tab=getActiveTab(), cv=tab?.collVars||{};
  str=str.replace(/\{\{\s*(\$[a-zA-Z]+)\s*\}\}/g,(m,k)=>{ const fn=DYN[k]||DYN[k.slice(1)]; return fn?fn():m; });
  str=str.replace(/\{\{([^}]+?)\}\}/g,(m,k)=>{ k=k.trim(); return _localVars[k]??cv[k]??ev[k]??S.globals[k]??_iterInfo.dataRow[k]??extra[k]??m; });
  return str;
}

// ─────────────────────────────────────────────────────────────
// JSON SCHEMA VALIDATOR
// ─────────────────────────────────────────────────────────────
function validateSchema(data, schema) {
  const errors=[];
  function chk(d,s,p){
    if(!s||s===true)return;
    if(s===false){errors.push(`${p}: schema is false`);return;}
    if(s.type){const types=Array.isArray(s.type)?s.type:[s.type];const actual=d===null?'null':Array.isArray(d)?'array':typeof d;if(!types.includes(actual))errors.push(`${p}: expected [${types}], got ${actual}`);}
    if('const'in s&&JSON.stringify(d)!==JSON.stringify(s.const))errors.push(`${p}: expected const`);
    if(s.enum&&!s.enum.some(v=>JSON.stringify(v)===JSON.stringify(d)))errors.push(`${p}: not in enum`);
    if(typeof d==='string'){if(s.minLength!==undefined&&d.length<s.minLength)errors.push(`${p}: minLength ${s.minLength}`);if(s.maxLength!==undefined&&d.length>s.maxLength)errors.push(`${p}: maxLength`);if(s.pattern&&!new RegExp(s.pattern).test(d))errors.push(`${p}: pattern failed`);}
    if(typeof d==='number'){if(s.minimum!==undefined&&d<s.minimum)errors.push(`${p}: min ${s.minimum}`);if(s.maximum!==undefined&&d>s.maximum)errors.push(`${p}: max ${s.maximum}`);}
    if(Array.isArray(d)){if(s.minItems!==undefined&&d.length<s.minItems)errors.push(`${p}: minItems`);if(s.maxItems!==undefined&&d.length>s.maxItems)errors.push(`${p}: maxItems`);if(s.items)d.forEach((x,i)=>chk(x,s.items,`${p}[${i}]`));}
    if(d!==null&&typeof d==='object'&&!Array.isArray(d)){(s.required||[]).forEach(k=>{if(!(k in d))errors.push(`${p}: missing '${k}'`);});if(s.properties)Object.entries(s.properties).forEach(([k,ps])=>{if(k in d)chk(d[k],ps,`${p}.${k}`);});}
    if(s.allOf)s.allOf.forEach((sub,i)=>chk(d,sub,`${p}/allOf[${i}]`));
  }
  chk(data,schema,'#');
  if(errors.length)throw new Error('Schema validation failed:\n'+errors.join('\n'));
}

// ─────────────────────────────────────────────────────────────
// PM SANDBOX
// ─────────────────────────────────────────────────────────────
function buildPM(response, collVars={}) {
  _testResults=[]; _consoleLogs=[]; _localVars={};
  const env=getEnv(), tab=getActiveTab();

  const chai=(val)=>{
    const self={
      equal:      x=>{if(val!==x)throw new Error(`Expected ${JSON.stringify(x)}, got ${JSON.stringify(val)}`);return self;},
      eql:        x=>{if(JSON.stringify(val)!==JSON.stringify(x))throw new Error(`Deep equal failed`);return self;},
      include:    x=>{const s=typeof val==='string'?val:JSON.stringify(val);if(!s.includes(x))throw new Error(`Expected to include "${x}"`);return self;},
      match:      r=>{if(!r.test(String(val)))throw new Error(`Expected to match ${r}`);return self;},
      matchSchema:s=>{validateSchema(val,s);return self;},
      keys:       a=>{a.forEach(k=>{if(typeof val!=='object'||!(k in val))throw new Error(`Missing key: ${k}`);});return self;},
      deep:{equal:x=>{if(JSON.stringify(val)!==JSON.stringify(x))throw new Error('Deep equal failed');return self;}},
      not:{
        equal:  x=>{if(val===x)throw new Error(`Expected NOT ${JSON.stringify(x)}`);return self;},
        include:x=>{if(String(val).includes(x))throw new Error(`Expected NOT to include "${x}"`);return self;},
        empty:  ()=>{if(!val||val.length===0)throw new Error('Expected non-empty');return self;},
        ok:     ()=>{if(val)throw new Error('Expected falsy');return self;},
        have:{property:p=>{if(typeof val==='object'&&val!==null&&p in val)throw new Error(`Expected NOT to have "${p}"`);return self;}},
        be:{above:x=>{if(val>x)throw new Error(`Expected <= ${x}`);return self;},below:x=>{if(val<x)throw new Error(`Expected >= ${x}`);return self;}},
      },
      be:{
        below:  x=>{if(!(val<x))throw new Error(`Expected ${val} < ${x}`);return self;},
        above:  x=>{if(!(val>x))throw new Error(`Expected ${val} > ${x}`);return self;},
        at:{least:x=>{if(!(val>=x))throw new Error(`Expected >= ${x}`);return self;},most:x=>{if(!(val<=x))throw new Error(`Expected <= ${x}`);return self;}},
        ok:()=>{if(!val)throw new Error('Expected truthy');return self;},
        true:()=>{if(val!==true)throw new Error('Expected true');return self;},
        false:()=>{if(val!==false)throw new Error('Expected false');return self;},
        null:()=>{if(val!==null)throw new Error('Expected null');return self;},
        undefined:()=>{if(val!==undefined)throw new Error('Expected undefined');return self;},
        a:t=>{const at=Array.isArray(val)?'array':typeof val;if(at!==t)throw new Error(`Expected type ${t}, got ${at}`);return self;},
        an:t=>{const at=Array.isArray(val)?'array':typeof val;if(at!==t)throw new Error(`Expected type ${t}, got ${at}`);return self;},
        empty:()=>{if(val&&val.length>0)throw new Error('Expected empty');return self;},
        json:()=>{try{JSON.parse(response?._body||'null');}catch{throw new Error('Not JSON');}return self;},
        string:()=>{if(typeof val!=='string')throw new Error('Expected string');return self;},
        number:()=>{if(typeof val!=='number')throw new Error('Expected number');return self;},
        array:()=>{if(!Array.isArray(val))throw new Error('Expected array');return self;},
        object:()=>{if(typeof val!=='object'||Array.isArray(val))throw new Error('Expected object');return self;},
        oneOf:a=>{if(!a.includes(val))throw new Error(`Expected one of [${a}]`);return self;},
        closeTo:(x,d=2)=>{if(Math.abs(val-x)>d)throw new Error(`Expected ${val} ≈ ${x}`);return self;},
      },
      have:{
        property:(p,v)=>{if(typeof val!=='object'||val===null||!(p in val))throw new Error(`Expected property "${p}"`);if(v!==undefined&&val[p]!==v)throw new Error(`Property "${p}" expected ${JSON.stringify(v)}`);return self;},
        length:n=>{if(!val||val.length!==n)throw new Error(`Expected length ${n}, got ${val?.length}`);return self;},
        lengthOf:n=>{if(!val||val.length!==n)throw new Error(`Expected length ${n}`);return self;},
        members:a=>{if(!Array.isArray(val))throw new Error('Expected array');a.forEach(m=>{if(!val.includes(m))throw new Error(`Missing member: ${m}`);});return self;},
        status:code=>{if(!response)throw new Error('No response');if(response.status!==code)throw new Error(`Expected status ${code}, got ${response.status}`);return self;},
        header:(key,value)=>{if(!response)throw new Error('No response');const hv=response._headers?.[key.toLowerCase()];if(!hv)throw new Error(`Missing header: ${key}`);if(value!==undefined&&hv!==String(value))throw new Error(`Header "${key}" expected "${value}"`);return self;},
        jsonBody:path=>{const body=JSON.parse(response._body);const v=path.split('.').reduce((o,k)=>o?.[k],body);if(v===undefined)throw new Error(`JSON path "${path}" not found`);return self;},
        body:{that:{includes:s=>{if(!response._body.includes(s))throw new Error(`Body missing: "${s}"`);return self;}}},
      },
    };
    self.to=self;self.and=self;self.is=self;self.that=self;
    return self;
  };

  const pmResp=response?{
    code:response.status,status:response.statusText,statusCode:response.status,
    responseTime:response._time||0,size:response._size||0,
    json:()=>{try{return JSON.parse(response._body);}catch{throw new Error('Response is not valid JSON. Preview: '+String(response._body).slice(0,80));}},
    text:()=>response._body||'',
    cookies:response._cookies||{},
    headers:{get:k=>response._headers?.[k.toLowerCase()],has:k=>!!(response._headers?.[k.toLowerCase()]),toObject:()=>({...response._headers}),all:()=>({...response._headers})},
    to:{
      have:{
        status:code=>{if(response.status!==code)throw new Error(`Expected status ${code}, got ${response.status}`);},
        header:(k,v)=>{const hv=response._headers?.[k.toLowerCase()];if(!hv)throw new Error(`Missing header: ${k}`);if(v!==undefined&&hv!==String(v))throw new Error(`Header "${k}" expected "${v}"`);},
        jsonBody:path=>{const body=JSON.parse(response._body);const v=path.split('.').reduce((o,k)=>o?.[k],body);if(v===undefined)throw new Error(`JSON path "${path}" not found`);},
        body:{that:{includes:s=>{if(!response._body.includes(s))throw new Error(`Body missing: "${s}"`);}}},
      },
      be:{
        ok:()=>{if(response.status<200||response.status>=300)throw new Error(`Not OK: ${response.status}`);},
        json:()=>{try{JSON.parse(response._body);}catch{throw new Error('Not JSON');}},
        success:()=>{if(response.status<200||response.status>=300)throw new Error(`Not 2xx: ${response.status}`);},
        error:()=>{if(response.status<400)throw new Error(`Not 4xx/5xx: ${response.status}`);},
        serverError:()=>{if(response.status<500)throw new Error(`Not 5xx: ${response.status}`);},
        clientError:()=>{if(response.status<400||response.status>=500)throw new Error(`Not 4xx: ${response.status}`);},
        notFound:()=>{if(response.status!==404)throw new Error(`Not 404`);},
        created:()=>{if(response.status!==201)throw new Error(`Not 201`);},
      },
      not:{have:{status:code=>{if(response.status===code)throw new Error(`Status should NOT be ${code}`);}}},
    },
  }:{code:0,status:'',responseTime:0,size:0,json:()=>({}),text:()=>'',cookies:{},headers:{get:()=>null,has:()=>false,toObject:()=>({}),all:()=>({})},to:{have:{status:()=>{},header:()=>{},jsonBody:()=>{}},be:{ok:()=>{},json:()=>{},success:()=>{},error:()=>{}},not:{have:{status:()=>{}}}}};

  const pm={
    test:(name,fn)=>{ try{fn();_testResults.push({name,pass:true});}catch(e){_testResults.push({name,pass:false,error:e.message});} },
    expect:chai,
    response:pmResp,
    request:{
      url:{
        toString:()=>resolveVars(document.getElementById('url-in')?.value||''),
        getHost:()=>{try{return new URL(resolveVars(document.getElementById('url-in')?.value||'')).hostname;}catch{return '';}},
        getPath:()=>{try{return new URL(resolveVars(document.getElementById('url-in')?.value||'')).pathname;}catch{return '';}},
      },
      method:document.getElementById('method-sel')?.value||'GET',
      headers:{
        add:(k,v)=>{const t=getActiveTab();if(t){t.headers.push({id:uid(),on:true,k,v,desc:''});loadKV('headers',t.headers);}},
        remove:k=>{const t=getActiveTab();if(t){t.headers=t.headers.filter(h=>h.k!==k);loadKV('headers',t.headers);}},
        get:k=>readKV('headers').find(h=>h.k?.toLowerCase()===k.toLowerCase())?.v,
        has:k=>!!readKV('headers').find(h=>h.k?.toLowerCase()===k.toLowerCase()),
        toObject:()=>Object.fromEntries(readKV('headers').filter(h=>h.on&&h.k).map(h=>[h.k,h.v])),
      },
      body:{raw:document.getElementById('code-raw')?.value||'',mode:_bodyType},
    },
    environment:{
      get:k=>env?.variables?.[k],
      set:(k,v)=>{if(env){if(!env.variables)env.variables={};env.variables[k]=String(v??'');save();}},
      unset:k=>{if(env?.variables){delete env.variables[k];save();}},
      has:k=>env?.variables!==undefined&&k in(env.variables||{}),
      clear:()=>{if(env){env.variables={};save();}},
      toObject:()=>({...(env?.variables||{})}),
    },
    globals:{
      get:k=>S.globals[k],
      set:(k,v)=>{S.globals[k]=String(v??'');save();},
      unset:k=>{delete S.globals[k];save();},
      has:k=>k in S.globals,
      clear:()=>{S.globals={};save();},
      toObject:()=>({...S.globals}),
    },
    variables:{
      get:k=>_localVars[k]??env?.variables?.[k]??S.globals[k],
      set:(k,v)=>{_localVars[k]=String(v??'');},
      unset:k=>{delete _localVars[k];},
      has:k=>k in _localVars,
      toObject:()=>({..._localVars}),
      replaceIn:s=>resolveVars(s),
    },
    collectionVariables:{
      get:k=>collVars[k]??tab?.collVars?.[k],
      set:(k,v)=>{collVars[k]=String(v??'');if(tab){if(!tab.collVars)tab.collVars={};tab.collVars[k]=String(v??'');}},
      unset:k=>{delete collVars[k];if(tab?.collVars)delete tab.collVars[k];},
      has:k=>k in(collVars||{}),
      clear:()=>{Object.keys(collVars).forEach(k=>delete collVars[k]);},
      toObject:()=>({...collVars}),
    },
    info:{iteration:_iterInfo.iteration,iterationCount:_iterInfo.iterationCount,requestName:tab?.name||'',requestId:tab?.id||''},
    sendRequest:(opts,cb)=>{
      if(typeof opts==='string')opts={url:opts,method:'GET'};
      const url=resolveVars(opts.url||'');
      const direct=isPrivate(url);
      const fu=(!direct&&S.settings.corsEnabled)?S.settings.proxyUrl+encodeURIComponent(url):url;
      const h={};
      if(opts.header){if(Array.isArray(opts.header))opts.header.forEach(x=>{h[x.key]=x.value;});else Object.assign(h,opts.header);}
      if(opts.headers)Object.assign(h,opts.headers);
      const fo={method:(opts.method||'GET').toUpperCase(),headers:h};
      if(opts.body)fo.body=typeof opts.body==='string'?opts.body:opts.body?.raw?opts.body.raw:JSON.stringify(opts.body);
      fetch(fu,fo).then(async r=>{
        const body=await r.text(),hdrs={};
        r.headers.forEach((v,k)=>{hdrs[k]=v;});
        const res={code:r.status,status:r.statusText,_body:body,_headers:hdrs,json:()=>JSON.parse(body),text:()=>body,headers:{get:k=>hdrs[k.toLowerCase()],has:k=>!!(hdrs[k.toLowerCase()]),toObject:()=>({...hdrs})},to:{have:{status:code=>{if(r.status!==code)throw new Error(`${r.status}!=${code}`);}}}};
        if(cb)cb(null,res);
      }).catch(e=>{if(cb)cb(e,null);});
    },
  };
  return{pm,expect:chai};
}

function runScript(code,pmObj){
  if(!code?.trim())return;
  const con={
    log:(...a)=>_consoleLogs.push({type:'log',msg:a.map(x=>typeof x==='object'?JSON.stringify(x,null,2):String(x)).join(' ')}),
    warn:(...a)=>_consoleLogs.push({type:'warn',msg:a.map(x=>typeof x==='object'?JSON.stringify(x):String(x)).join(' ')}),
    error:(...a)=>_consoleLogs.push({type:'error',msg:a.map(x=>typeof x==='object'?JSON.stringify(x):String(x)).join(' ')}),
    info:(...a)=>_consoleLogs.push({type:'info',msg:a.map(x=>typeof x==='object'?JSON.stringify(x):String(x)).join(' ')}),
    table:d=>_consoleLogs.push({type:'log',msg:JSON.stringify(d,null,2)}),
    dir:d=>_consoleLogs.push({type:'log',msg:JSON.stringify(d,null,2)}),
    assert:(c,m)=>{if(!c)_consoleLogs.push({type:'error',msg:'Assertion failed: '+(m||'')});},
    group:()=>{},groupEnd:()=>{},time:()=>{},timeEnd:()=>{},clear:()=>{_consoleLogs=[];},
  };
  try{new Function('pm','console','expect','require',code)(pmObj.pm,con,pmObj.expect,mod=>{_consoleLogs.push({type:'warn',msg:`require('${mod}') not supported`});return{};});}
  catch(e){_consoleLogs.push({type:'error',msg:'Script error: '+e.message});}
}

// ─────────────────────────────────────────────────────────────
// TABS
// ─────────────────────────────────────────────────────────────
const MC={GET:'var(--get)',POST:'var(--post)',PUT:'var(--put)',PATCH:'var(--patch)',DELETE:'var(--delete)',HEAD:'var(--head)',OPTIONS:'var(--options)'};

function mkTab(d={}){
  return{
    id:uid(),name:d.name||'New Request',method:d.method||'GET',url:d.url||'',
    params:d.params||[{id:uid(),on:true,k:'',v:'',desc:''}],
    pathVars:d.pathVars||[],
    headers:d.headers||[{id:uid(),on:true,k:'',v:'',desc:''}],
    bodyType:d.bodyType||'none',rawFmt:d.rawFmt||'json',rawBody:d.rawBody||'',
    formData:d.formData||[],urlEncoded:d.urlEncoded||[],
    gqlQ:d.gqlQ||'',gqlV:d.gqlV||'',
    authType:d.authType||'none',authData:d.authData||{},
    preScript:d.preScript||'',testScript:d.testScript||'',
    response:null,collVars:d.collVars||{},collId:d.collId||null,
  };
}
function newTab(d){const t=mkTab(d);S.tabs.push(t);S.activeId=t.id;renderTabs();loadTabUI(t);showResponse(null);}
function switchTab(id){saveTabUI();S.activeId=id;const t=S.tabs.find(t=>t.id===id);loadTabUI(t);renderTabs();showResponse(t?.response);}
function closeTab(id,e){
  if(e)e.stopPropagation();
  const idx=S.tabs.findIndex(t=>t.id===id);if(idx===-1)return;
  S.tabs.splice(idx,1);
  if(!S.tabs.length){newTab();return;}
  S.activeId=S.tabs[Math.min(idx,S.tabs.length-1)].id;
  const t=S.tabs.find(t=>t.id===S.activeId);loadTabUI(t);showResponse(t?.response);renderTabs();
}
function renderTabs(){
  document.getElementById('tabs').innerHTML=S.tabs.map(t=>
    `<div class="tab-item${t.id===S.activeId?' active':''}" onclick="switchTab('${t.id}')">
       <span class="tab-method" style="color:${MC[t.method]||'var(--text2)'}">${t.method}</span>
       <span class="tab-name">${esc(t.name)}</span>
       <button class="tab-close" onclick="closeTab('${t.id}',event)">✕</button>
     </div>`
  ).join('');
}
function saveTabUI(){
  const t=getActiveTab();if(!t)return;
  t.method=document.getElementById('method-sel').value;
  t.url=document.getElementById('url-in').value;
  t.bodyType=_bodyType;
  t.rawBody=document.getElementById('code-raw')?.value||'';
  t.rawFmt=document.getElementById('raw-fmt')?.value||'json';
  t.gqlQ=document.getElementById('gql-q')?.value||'';
  t.gqlV=document.getElementById('gql-v')?.value||'';
  t.authType=document.getElementById('auth-sel')?.value||'none';
  t.authData=readAuthData();
  t.preScript=document.getElementById('pre-script')?.value||'';
  t.testScript=document.getElementById('test-script')?.value||'';
  t.params=readKV('params');t.pathVars=readPathVars();
  t.headers=readKV('headers');t.urlEncoded=readKV('urlenc');t.formData=readFormData();
}
function loadTabUI(t){
  if(!t)return;
  document.getElementById('method-sel').value=t.method;
  document.getElementById('url-in').value=t.url;
  document.getElementById('code-raw').value=t.rawBody||'';
  document.getElementById('raw-fmt').value=t.rawFmt||'json';
  document.getElementById('gql-q').value=t.gqlQ||'';
  document.getElementById('gql-v').value=t.gqlV||'';
  document.getElementById('auth-sel').value=t.authType||'none';
  document.getElementById('pre-script').value=t.preScript||'';
  document.getElementById('test-script').value=t.testScript||'';
  loadKV('params',t.params);loadKV('headers',t.headers);loadKV('urlenc',t.urlEncoded||[]);
  loadFormData(t.formData||[]);setBody(t.bodyType||'none');
  renderAuthFields(t.authData||{});colorMethod();
  updatePathVars(t.url,t.pathVars||[]);refreshDirectBadge(t.url);
}

// ─────────────────────────────────────────────────────────────
// KV TABLES
// ─────────────────────────────────────────────────────────────
function addKVRow(type,k='',v='',desc='',on=true){
  const tbody=document.getElementById('kv-'+type);if(!tbody)return;
  const tr=document.createElement('tr');tr.dataset.id=uid();
  tr.innerHTML=`<td><input type="checkbox" class="kv-chk"${on?' checked':''}></td><td><input type="text" placeholder="Key" value="${esc(k)}"></td><td><input type="text" placeholder="Value" value="${esc(v)}"></td><td><input type="text" placeholder="Description" value="${esc(desc)}"></td><td><button class="kv-del" onclick="this.closest('tr').remove()">✕</button></td>`;
  tbody.appendChild(tr);
}
function readKV(type){
  const rows=[];
  document.querySelectorAll('#kv-'+type+' tr').forEach(tr=>{
    const inp=tr.querySelectorAll('input');
    if(inp.length>=3)rows.push({id:tr.dataset.id||uid(),on:inp[0].type==='checkbox'?inp[0].checked:true,k:inp[1]?.value||'',v:inp[2]?.value||'',desc:inp[3]?.value||''});
  });
  return rows;
}
function loadKV(type,rows=[]){
  const tbody=document.getElementById('kv-'+type);if(!tbody)return;
  tbody.innerHTML='';
  rows.forEach(r=>addKVRow(type,r.k||r.key||'',r.v||r.value||'',r.desc||'',r.on!==false&&r.enabled!==false));
  if(!rows.length)addKVRow(type);
}
function addFormRow(k='',v='',type='text'){
  const tbody=document.getElementById('kv-form');if(!tbody)return;
  const tr=document.createElement('tr');const isFile=type==='file';
  tr.innerHTML=`<td><input type="checkbox" class="kv-chk" checked></td><td><input type="text" placeholder="Key" value="${esc(k)}"></td><td class="fv-cell"><div class="fv-text"${isFile?' style="display:none"':''}><input type="text" placeholder="Value" value="${esc(v)}"></div><div class="fv-file"${!isFile?' style="display:none"':''}><input type="file"></div></td><td><select class="fv-type-sel" onchange="toggleFormType(this)"><option value="text"${!isFile?' selected':''}>Text</option><option value="file"${isFile?' selected':''}>File</option></select></td><td><button class="kv-del" onclick="this.closest('tr').remove()">✕</button></td>`;
  tbody.appendChild(tr);
}
function toggleFormType(sel){const tr=sel.closest('tr'),file=sel.value==='file';tr.querySelector('.fv-text').style.display=file?'none':'';tr.querySelector('.fv-file').style.display=file?'':'none';}
function readFormData(){
  const rows=[];
  document.querySelectorAll('#kv-form tr').forEach(tr=>{
    const chk=tr.querySelector('.kv-chk'),key=tr.querySelectorAll('input[type=text]')[0]?.value||'',type=tr.querySelector('.fv-type-sel')?.value||'text';
    if(!chk?.checked||!key)return;
    if(type==='file'){const f=tr.querySelector('.fv-file input[type=file]')?.files?.[0];rows.push({on:true,k:key,v:'',type:'file',file:f});}
    else rows.push({on:true,k:key,v:tr.querySelector('.fv-text input')?.value||'',type:'text'});
  });
  return rows;
}
function loadFormData(rows=[]){
  const tbody=document.getElementById('kv-form');if(!tbody)return;
  tbody.innerHTML='';rows.forEach(r=>addFormRow(r.k||'',r.v||'',r.type||'text'));
  if(!rows.length)addFormRow();
}

// ─────────────────────────────────────────────────────────────
// PATH VARIABLES
// ─────────────────────────────────────────────────────────────
function updatePathVars(url='',saved=[]){
  const tbody=document.getElementById('kv-pathvars'),el=document.getElementById('pv-empty');if(!tbody)return;
  const found=[];
  [/:([a-zA-Z_][a-zA-Z0-9_]*)(?=\/|$|\?|#)/g,/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g].forEach(re=>{let m;while((m=re.exec(url))!==null)if(!found.includes(m[1]))found.push(m[1]);});
  tbody.innerHTML='';
  const sm=Object.fromEntries(saved.map(r=>[r.k,r]));
  found.forEach(p=>{
    const sv=sm[p]||{};const tr=document.createElement('tr');tr.dataset.key=p;
    tr.innerHTML=`<td style="padding:3px 6px;font-family:var(--mono);font-size:12px;color:var(--accent);white-space:nowrap">:${esc(p)}</td><td><input type="text" placeholder="value or {{variable}}" value="${esc(sv.v||'')}"></td><td><input type="text" placeholder="Description" value="${esc(sv.desc||'')}"></td><td></td>`;
    tbody.appendChild(tr);
  });
  if(el)el.style.display=found.length?'none':'';
}
function readPathVars(){
  const rows=[];
  document.querySelectorAll('#kv-pathvars tr').forEach(tr=>{const k=tr.dataset.key||'';if(!k)return;const inp=tr.querySelectorAll('input');rows.push({k,v:inp[0]?.value||'',desc:inp[1]?.value||''});});
  return rows;
}
function resolvePathInUrl(url){
  readPathVars().forEach(row=>{
    if(!row.k)return;const val=encodeURIComponent(resolveVars(row.v));
    url=url.replace(new RegExp(':'+row.k+'(?=/|$|\\?|#)','g'),val);
    url=url.replace(new RegExp('\\{'+row.k+'\\}','g'),val);
  });
  return url;
}

// ─────────────────────────────────────────────────────────────
// BODY
// ─────────────────────────────────────────────────────────────
function setBody(type){
  _bodyType=type;
  document.querySelectorAll('.btype-btn').forEach(b=>b.classList.toggle('active',b.dataset.type===type));
  ['none','form','urlenc','raw','binary','graphql'].forEach(t=>{const el=document.getElementById('body-'+t);if(el)el.style.display=t===type?'block':'none';});
}
function beautifyRaw(){
  const ta=document.getElementById('code-raw'),fmt=document.getElementById('raw-fmt')?.value;
  if(!ta?.value.trim())return;
  if(fmt==='json'){try{ta.value=JSON.stringify(JSON.parse(ta.value),null,2);notify('Beautified ✨','success');}catch(e){notify('Invalid JSON: '+e.message,'error');}}
  else notify('Beautify only supported for JSON','info');
}
function onRawFmtChange(){const fmt=document.getElementById('raw-fmt')?.value,ta=document.getElementById('code-raw');if(!ta||ta.value.trim())return;const h={json:'{"key":"value"}',xml:'<root>\n  <el>value</el>\n</root>',html:'<h1>Hello</h1>',text:'text here',javascript:'console.log("hi")'};ta.placeholder=h[fmt]||'';}
function showBinFile(input){const f=input.files?.[0];if(f)document.getElementById('bin-label').textContent=`📎 ${f.name} (${formatBytes(f.size)})`;}
function handleBinDrop(e){e.preventDefault();document.getElementById('bin-drop').classList.remove('dov');const f=e.dataTransfer?.files?.[0];if(!f)return;const dt=new DataTransfer();dt.items.add(f);document.getElementById('bin-file').files=dt.files;document.getElementById('bin-label').textContent=`📎 ${f.name} (${formatBytes(f.size)})`;}

// ─────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────
const AUTH_HTML={
  none:`<p class="auth-info">No authorization will be sent with this request.</p>`,
  bearer:`<div class="af"><label>TOKEN</label><input type="text" id="a-token" placeholder="Bearer token (supports {{variable}})"></div><p class="auth-info">Adds <code>Authorization: Bearer &lt;token&gt;</code> automatically.</p>`,
  apikey:`<div class="af"><label>KEY NAME</label><input type="text" id="a-key" placeholder="e.g. X-API-Key"></div><div class="af"><label>KEY VALUE</label><input type="text" id="a-key-val" placeholder="your-api-key"></div><div class="af"><label>ADD TO</label><select id="a-key-in"><option value="header">Header</option><option value="query">Query Params</option></select></div>`,
  basic:`<div class="af"><label>USERNAME</label><input type="text" id="a-user" placeholder="username"></div><div class="af"><label>PASSWORD</label><input type="password" id="a-pass" placeholder="password"></div><p class="auth-info">Encodes as Base64 → <code>Authorization: Basic &lt;base64(user:pass)&gt;</code></p>`,
  digest:`<div class="af"><label>USERNAME</label><input type="text" id="a-du" placeholder="username"></div><div class="af"><label>PASSWORD</label><input type="password" id="a-dp" placeholder="password"></div><div class="af"><label>REALM (auto from 401)</label><input type="text" id="a-realm" placeholder="leave blank for auto-detect"></div><div class="af"><label>NONCE (auto from 401)</label><input type="text" id="a-nonce" placeholder="leave blank for auto-detect"></div><div class="af"><label>QOP</label><input type="text" id="a-qop" placeholder="auth"></div>`,
  oauth1:`<div class="af"><label>CONSUMER KEY</label><input type="text" id="a-ck" placeholder="Consumer Key"></div><div class="af"><label>CONSUMER SECRET</label><input type="text" id="a-cs" placeholder="Consumer Secret"></div><div class="af"><label>ACCESS TOKEN</label><input type="text" id="a-at" placeholder="Access Token (optional)"></div><div class="af"><label>TOKEN SECRET</label><input type="text" id="a-ts" placeholder="Token Secret (optional)"></div><div class="af"><label>SIGNATURE METHOD</label><select id="a-sm"><option value="HMAC-SHA1">HMAC-SHA1</option><option value="HMAC-SHA256">HMAC-SHA256</option></select></div>`,
  oauth2:`<div class="af"><label>ACCESS TOKEN</label><input type="text" id="a-o2" placeholder="Paste your OAuth 2.0 access token"></div><div class="af"><label>HEADER PREFIX</label><input type="text" id="a-o2p" value="Bearer" placeholder="Bearer"></div>`,
  hawk:`<div class="af"><label>HAWK AUTH ID</label><input type="text" id="a-hid" placeholder="Hawk Auth ID"></div><div class="af"><label>HAWK AUTH KEY</label><input type="text" id="a-hkey" placeholder="Hawk Auth Key"></div><div class="af"><label>ALGORITHM</label><select id="a-halg"><option value="sha256">sha256</option><option value="sha1">sha1</option></select></div>`,
  aws:`<div class="af"><label>ACCESS KEY ID</label><input type="text" id="a-ak" placeholder="AKIAIOSFODNN7EXAMPLE"></div><div class="af"><label>SECRET ACCESS KEY</label><input type="password" id="a-sk" placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"></div><div class="af"><label>AWS REGION</label><input type="text" id="a-region" placeholder="us-east-1"></div><div class="af"><label>SERVICE</label><input type="text" id="a-svc" placeholder="execute-api"></div><div class="af"><label>SESSION TOKEN (optional)</label><input type="text" id="a-sess" placeholder="For temporary credentials"></div>`,
  ntlm:`<div class="af"><label>USERNAME</label><input type="text" id="a-nu" placeholder="username or DOMAIN\\username"></div><div class="af"><label>PASSWORD</label><input type="password" id="a-np" placeholder="password"></div><div class="af"><label>DOMAIN</label><input type="text" id="a-nd" placeholder="DOMAIN (optional)"></div><div class="af"><label>WORKSTATION</label><input type="text" id="a-nw" placeholder="optional"></div>`,
};
function renderAuthFields(data={}){
  const type=document.getElementById('auth-sel')?.value||'none';
  document.getElementById('auth-fields').innerHTML=AUTH_HTML[type]||'';
  const tab=getActiveTab();const ad=(data&&Object.keys(data).length>0)?data:(tab?.authData||{});
  document.querySelectorAll('#auth-fields input, #auth-fields select').forEach(el=>{if(el.id&&ad[el.id]!==undefined)el.value=ad[el.id];});
}
function readAuthData(){const d={};document.querySelectorAll('#auth-fields input, #auth-fields select').forEach(el=>{if(el.id)d[el.id]=el.value;});return d;}

async function computeAuth(method,url){
  const type=document.getElementById('auth-sel')?.value||'none';
  const headers={},queryParams={};
  if(type==='bearer'){const t=resolveVars(document.getElementById('a-token')?.value?.trim()||'');if(t)headers['Authorization']='Bearer '+t;}
  else if(type==='basic'){const u=resolveVars(document.getElementById('a-user')?.value||''),p=resolveVars(document.getElementById('a-pass')?.value||'');headers['Authorization']='Basic '+btoa(unescape(encodeURIComponent(u+':'+p)));}
  else if(type==='apikey'){const loc=document.getElementById('a-key-in')?.value,k=resolveVars(document.getElementById('a-key')?.value?.trim()||''),v=resolveVars(document.getElementById('a-key-val')?.value||'');if(k&&v){if(loc==='query')queryParams[k]=v;else headers[k]=v;}}
  else if(type==='oauth2'){const t=resolveVars(document.getElementById('a-o2')?.value?.trim()||''),p=document.getElementById('a-o2p')?.value||'Bearer';if(t)headers['Authorization']=p+' '+t;}
  else if(type==='oauth1'){const ck=document.getElementById('a-ck')?.value?.trim()||'',cs=document.getElementById('a-cs')?.value?.trim()||'',at=document.getElementById('a-at')?.value?.trim()||'',ts=document.getElementById('a-ts')?.value?.trim()||'',sm=document.getElementById('a-sm')?.value||'HMAC-SHA1';if(ck&&cs){try{headers['Authorization']=await signOAuth1(method,url,ck,cs,at,ts,sm);}catch(e){console.error('OAuth1',e);}}}
  else if(type==='hawk'){const id=document.getElementById('a-hid')?.value?.trim()||'',key=document.getElementById('a-hkey')?.value?.trim()||'',alg=document.getElementById('a-halg')?.value||'sha256';if(id&&key){try{headers['Authorization']=await signHawk(method,url,id,key,alg);}catch(e){console.error('Hawk',e);}}}
  else if(type==='aws'){const ak=document.getElementById('a-ak')?.value?.trim()||'',sk=document.getElementById('a-sk')?.value?.trim()||'',reg=document.getElementById('a-region')?.value?.trim()||'us-east-1',svc=document.getElementById('a-svc')?.value?.trim()||'execute-api',ses=document.getElementById('a-sess')?.value?.trim()||'';if(ak&&sk){try{Object.assign(headers,await signAWSv4(method,url,null,ak,sk,reg,svc,ses));}catch(e){console.error('AWS',e);}}}
  return{headers,queryParams};
}

async function signOAuth1(method,url,ck,cs,at,ts,sm='HMAC-SHA1'){
  let uo;try{uo=new URL(url);}catch{uo=new URL('https://example.com');}
  const bu=uo.protocol+'//'+uo.host+uo.pathname,qp={};uo.searchParams.forEach((v,k)=>{qp[k]=v;});
  const nonce=Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2),ts2=String(Math.floor(Date.now()/1000));
  const op={oauth_consumer_key:ck,oauth_nonce:nonce,oauth_signature_method:sm,oauth_timestamp:ts2,oauth_version:'1.0',...(at?{oauth_token:at}:{})};
  const allP={...qp,...op};
  const pStr=Object.keys(allP).sort().map(k=>`${pct(k)}=${pct(allP[k])}`).join('&');
  const base=[method.toUpperCase(),pct(bu),pct(pStr)].join('&');
  const sigKey=`${pct(cs)}&${pct(ts||'')}`;
  const sig=await hmacB64(sm.includes('256')?'SHA-256':'SHA-1',sigKey,base);
  op.oauth_signature=sig;
  return 'OAuth '+Object.keys(op).sort().map(k=>`${k}="${pct(op[k])}"`).join(', ');
}
async function signHawk(method,url,id,key,algo='sha256'){
  const ts=Math.floor(Date.now()/1000),nonce=Math.random().toString(36).slice(2,8);
  let p;try{p=new URL(url);}catch{p=new URL('https://example.com');}
  const resource=p.pathname+(p.search||''),host=p.hostname,port=p.port||(p.protocol==='https:'?'443':'80');
  const norm=['hawk.1.header',ts,nonce,method.toUpperCase(),resource,host,port,'','','',''].join('\n')+'\n';
  const mac=await hmacB64(algo==='sha1'?'SHA-1':'SHA-256',key,norm);
  return `Hawk id="${id}", ts="${ts}", nonce="${nonce}", mac="${mac}"`;
}
async function signAWSv4(method,url,body,ak,sk,region,service,session){
  let u;try{u=new URL(url);}catch{return{};}
  const now=new Date(),date=now.toISOString().slice(0,10).replace(/-/g,''),dt=now.toISOString().replace(/[:\-]|\.\d{3}/g,'').slice(0,15)+'Z';
  const bHash=await sha256hex(body||'');
  const sH={'host':u.hostname+(u.port?':'+u.port:''),'x-amz-date':dt,'x-amz-content-sha256':bHash,...(session?{'x-amz-security-token':session}:{})};
  const sN=Object.keys(sH).sort(),cH=sN.map(k=>`${k}:${sH[k]}`).join('\n')+'\n',sHStr=sN.join(';');
  const qa=[];u.searchParams.forEach((v,k)=>qa.push([encodeURIComponent(k),encodeURIComponent(v)]));qa.sort(([a],[b])=>a<b?-1:a>b?1:0);
  const cQ=qa.map(([k,v])=>`${k}=${v}`).join('&');
  const cR=[method.toUpperCase(),u.pathname||'/',cQ,cH,sHStr,bHash].join('\n');
  const scope=`${date}/${region}/${service}/aws4_request`;
  const sts=['AWS4-HMAC-SHA256',dt,scope,await sha256hex(cR)].join('\n');
  const kD=await _hmac('SHA-256','AWS4'+sk,date),kR=await _hmac('SHA-256',kD,region),kS=await _hmac('SHA-256',kR,service),kSn=await _hmac('SHA-256',kS,'aws4_request');
  const sigB=await _hmac('SHA-256',kSn,sts);
  const sig=[...sigB].map(b=>b.toString(16).padStart(2,'0')).join('');
  return{'Authorization':`AWS4-HMAC-SHA256 Credential=${ak}/${scope}, SignedHeaders=${sHStr}, Signature=${sig}`,'x-amz-date':dt,'x-amz-content-sha256':bHash,...(session?{'x-amz-security-token':session}:{})};
}

function colorMethod(){
  const sel=document.getElementById('method-sel');if(!sel)return;
  sel.style.color=MC[sel.value]||'var(--text1)';
  const t=getActiveTab();if(t){t.method=sel.value;renderTabs();}
}

// ─────────────────────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────────────────────
function toggleCORS(){
  S.settings.corsEnabled=!S.settings.corsEnabled;
  if(!S.settings.proxyUrl)S.settings.proxyUrl='https://square-credit-8186.donthulanithish53.workers.dev/?url=';
  save();refreshCORSBtn();
  notify(S.settings.corsEnabled?'⚡ CORS Proxy ENABLED':'🔴 CORS Proxy disabled',S.settings.corsEnabled?'success':'info');
}
function refreshCORSBtn(){
  const btn=document.getElementById('cors-btn');if(!btn)return;
  btn.textContent=S.settings.corsEnabled?'⚡ CORS: ON':'⚡ CORS: OFF';
  btn.className=S.settings.corsEnabled?'on':'';btn.id='cors-btn';
}

// ─────────────────────────────────────────────────────────────
// MOCK
// ─────────────────────────────────────────────────────────────
function checkMock(method,url){
  if(!document.getElementById('opt-mock')?.checked)return null;
  for(const m of S.mocks){if(!m.enabled)continue;if(m.method!=='*'&&m.method!==method)continue;const rx=new RegExp('^'+m.path.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\\\*/g,'.*')+'$');if(rx.test(url)||url.includes(m.path))return m;}
  return null;
}

// ─────────────────────────────────────────────────────────────
// COLLECT FULL HISTORY ENTRY (captures all request details)
// ─────────────────────────────────────────────────────────────
function collectHistoryEntry(method, rawUrl, status, elapsed) {
  const tab = getActiveTab();

  // Params
  const params = readKV('params').filter(r => r.k);
  // Headers (non-empty keys)
  const headers = readKV('headers').filter(r => r.k);
  // Auth
  const authType = document.getElementById('auth-sel')?.value || 'none';
  const authData = readAuthData();
  // Body
  const bodyType = _bodyType;
  let rawBody = '';
  let urlEncoded = [];
  let formFields = [];
  let gqlQ = '', gqlV = '';

  if (bodyType === 'raw')    rawBody     = document.getElementById('code-raw')?.value || '';
  if (bodyType === 'urlenc') urlEncoded  = readKV('urlenc').filter(r => r.k);
  if (bodyType === 'form')   formFields  = readFormData().map(r => ({ k: r.k, v: r.v, type: r.type }));
  if (bodyType === 'graphql'){
    gqlQ = document.getElementById('gql-q')?.value || '';
    gqlV = document.getElementById('gql-v')?.value || '';
  }

  const rawFmt = document.getElementById('raw-fmt')?.value || 'json';

  return {
    id:       uid(),
    method,
    url:      rawUrl,
    status,
    time:     elapsed,
    at:       new Date().toLocaleTimeString(),
    pinned:   false,
    // ── Full request snapshot ──
    params,
    headers,
    authType,
    authData,
    bodyType,
    rawBody,
    rawFmt,
    urlEncoded,
    formFields,
    gqlQ,
    gqlV,
    preScript:  document.getElementById('pre-script')?.value  || '',
    testScript: document.getElementById('test-script')?.value || '',
    pathVars:   readPathVars(),
    name:       tab?.name || rawUrl.replace(/^https?:\/\//,'').slice(0,40) || 'Request',
  };
}

// ─────────────────────────────────────────────────────────────
// SEND REQUEST
// ─────────────────────────────────────────────────────────────
function cancelReq(){
  _abortCtrl?.abort();
  document.getElementById('cancel-btn').style.display='none';
  document.getElementById('send-btn').disabled=false;
  document.getElementById('send-btn').textContent='Send ➤';
}

async function sendRequest(){
  saveTabUI();
  const tab=getActiveTab(),method=document.getElementById('method-sel').value,rawUrl=document.getElementById('url-in').value.trim();
  if(!rawUrl){notify('Enter a URL first','error');return;}

  const preCode=document.getElementById('pre-script').value;
  if(preCode.trim()){const pmObj=buildPM(null,tab?.collVars||{});runScript(preCode,pmObj);flushConsole();}

  let url=resolveVars(rawUrl);url=resolvePathInUrl(url);
  const paramRows=readKV('params').filter(r=>r.on&&r.k);
  const hdrRows=readKV('headers').filter(r=>r.on&&r.k);
  const{headers:authH,queryParams:authQP}=await computeAuth(method,url);

  let finalUrl=url;
  const qpAll={...Object.fromEntries(paramRows.map(r=>[resolveVars(r.k),resolveVars(r.v)])),...authQP};
  const qpStr=new URLSearchParams(qpAll).toString();
  if(qpStr)finalUrl+=(url.includes('?')?'&':'?')+qpStr;

  const headers={};hdrRows.forEach(h=>{headers[resolveVars(h.k)]=resolveVars(h.v);});Object.assign(headers,authH);

  const disableBody=document.getElementById('opt-nobody')?.checked;
  let body=null;
  if(!disableBody&&!['GET','HEAD'].includes(method)){
    if(_bodyType==='raw'){
      body=resolveVars(document.getElementById('code-raw').value);
      if(!headers['Content-Type']&&!headers['content-type']){
        const ctMap={json:'application/json',xml:'application/xml',html:'text/html',text:'text/plain',javascript:'application/javascript'};
        headers['Content-Type']=ctMap[document.getElementById('raw-fmt').value]||'text/plain';
      }
    }
    else if(_bodyType==='urlenc'){
      const rows=readKV('urlenc').filter(r=>r.on&&r.k);
      body=rows.map(r=>`${encodeURIComponent(resolveVars(r.k))}=${encodeURIComponent(resolveVars(r.v))}`).join('&');
      headers['Content-Type']='application/x-www-form-urlencoded';
    }
    else if(_bodyType==='form'){
      const fd=new FormData();
      document.querySelectorAll('#kv-form tr').forEach(tr=>{
        const chk=tr.querySelector('.kv-chk'),key=tr.querySelectorAll('input[type=text]')[0]?.value,typ=tr.querySelector('.fv-type-sel')?.value||'text';
        if(!chk?.checked||!key)return;
        if(typ==='file'){const f=tr.querySelector('.fv-file input[type=file]')?.files?.[0];if(f)fd.append(key,f);}
        else fd.append(key,resolveVars(tr.querySelector('.fv-text input')?.value||''));
      });
      body=fd;
    }
    else if(_bodyType==='graphql'){
      let vars={};try{vars=JSON.parse(resolveVars(document.getElementById('gql-v').value||'{}'));}catch{}
      body=JSON.stringify({query:resolveVars(document.getElementById('gql-q').value),variables:vars});
      if(!headers['Content-Type'])headers['Content-Type']='application/json';
    }
    else if(_bodyType==='binary'){
      const f=document.getElementById('bin-file')?.files?.[0];
      if(f){body=f;if(!headers['Content-Type'])headers['Content-Type']=f.type||'application/octet-stream';}
    }
  }

  const mock=checkMock(method,finalUrl);
  if(mock){
    await sleep(mock.delay||0);
    const fr={status:mock.statusCode||200,statusText:'OK (Mock)',_body:resolveVars(mock.body||'{}'),
      _headers:{'content-type':mock.contentType||'application/json',...Object.fromEntries((mock.headers||[]).filter(h=>h.k).map(h=>[h.k.toLowerCase(),h.v]))},
      _time:mock.delay||0,_size:new Blob([mock.body||'']).size,_mock:true};
    if(tab)tab.response=fr;_lastResponse=fr;
    const pmObj=buildPM(fr,tab?.collVars||{});
    const testCode=document.getElementById('test-script').value;
    if(testCode.trim())runScript(testCode,pmObj);
    showResponse(fr);renderTests();flushConsole();notify('🎭 Mock '+fr.status,'info');
    // Save to history with full body
    addHistory(collectHistoryEntry(method,rawUrl,fr.status,fr._time));
    return;
  }

  const isDirect=isPrivate(finalUrl);
  const fetchUrl=isDirect?finalUrl:(S.settings.corsEnabled?S.settings.proxyUrl+encodeURIComponent(finalUrl):finalUrl);
  const sendBtn=document.getElementById('send-btn'),cancelBtn=document.getElementById('cancel-btn');
  sendBtn.disabled=true;sendBtn.textContent='Sending…';cancelBtn.style.display='';
  const timeout=parseInt(document.getElementById('opt-timeout')?.value)||30000;
  _abortCtrl=new AbortController();
  const tId=setTimeout(()=>_abortCtrl?.abort(),timeout);
  const t0=Date.now();

  try{
    const opts={method,headers,signal:_abortCtrl.signal};if(body)opts.body=body;

    // Digest auth retry
    if(document.getElementById('auth-sel')?.value==='digest'){
      const r0=await fetch(fetchUrl,{...opts,headers:{...headers}}).catch(()=>null);
      if(r0?.status===401){
        const wa=r0.headers.get('www-authenticate')||'';
        const realm=wa.match(/realm="([^"]+)"/i)?.[1]||document.getElementById('a-realm')?.value||'';
        const nonce=wa.match(/nonce="([^"]+)"/i)?.[1]||document.getElementById('a-nonce')?.value||'';
        const qop=wa.match(/qop="?([^",]+)/i)?.[1]?.trim()||'auth';
        const u2=document.getElementById('a-du')?.value||'',p2=document.getElementById('a-dp')?.value||'';
        if(realm&&nonce){
          const nc='00000001',cnonce=Math.random().toString(36).slice(2,10);
          let uri;try{uri=new URL(finalUrl).pathname;}catch{uri='/';}
          const ha1=md5(`${u2}:${realm}:${p2}`),ha2=md5(`${method}:${uri}`),res=md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`);
          headers['Authorization']=`Digest username="${u2}", realm="${realm}", nonce="${nonce}", uri="${uri}", nc=${nc}, cnonce="${cnonce}", qop=${qop}, response="${res}"`;
          opts.headers=headers;
        }
      }
    }

    // ── Fetch and handle binary/image/text responses ──────────
    const resp = await fetch(fetchUrl, opts);
    clearTimeout(tId);
    const elapsed = Date.now() - t0;

    const respH = {};
    resp.headers.forEach((v, k) => { respH[k] = v; });
    const ct = (respH['content-type'] || '').toLowerCase();

    // Determine if binary/image
    const isBin = ct.startsWith('image/') ||
      ct.includes('application/octet-stream') ||
      ct.includes('application/pdf') ||
      ct.includes('application/zip') ||
      ct.includes('audio/') ||
      ct.includes('video/') ||
      ct.includes('font/');

    let respTxt = '';
    let binaryDataUrl = null;
    let arrayBuf = null;

    if (isBin) {
      // Read as ArrayBuffer → base64 data URL for display
      arrayBuf = await resp.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuf);
      // Build base64
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < uint8.length; i += chunkSize) {
        binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
      }
      const b64 = btoa(binary);
      binaryDataUrl = `data:${ct.split(';')[0]};base64,${b64}`;
      respTxt = `[Binary data — ${formatBytes(arrayBuf.byteLength)}]`;
    } else {
      respTxt = await resp.text();
    }

    const size = arrayBuf ? arrayBuf.byteLength : new Blob([respTxt]).size;

    // Cookie extraction
    try{
      const domain=new URL(finalUrl).hostname,sc=resp.headers.get('set-cookie')||respH['set-cookie']||'';
      if(sc){if(!S.cookies[domain])S.cookies[domain]={};sc.split(/,(?=[^;]+=[^;]+)/).forEach(c=>{const[kv]=c.trim().split(';');const[ck,...cv]=kv.split('=');if(ck?.trim())S.cookies[domain][ck.trim()]=cv.join('=').trim();});save();}
    }catch{}

    const ro = {
      status:     resp.status,
      statusText: resp.statusText,
      _body:      respTxt,
      _headers:   respH,
      _time:      elapsed,
      _size:      size,
      _isBinary:  isBin,
      _dataUrl:   binaryDataUrl,   // data URL for image/binary preview
      _arrayBuf:  arrayBuf,        // raw buffer for download
    };

    if(tab)tab.response=ro;
    _lastResponse=ro;

    _testResults=[];
    const testCode=document.getElementById('test-script').value;
    if(testCode.trim()){const pmObj=buildPM(ro,tab?.collVars||{});runScript(testCode,pmObj);}

    // ── Save full history entry ───────────────────────────────
    addHistory(collectHistoryEntry(method, rawUrl, resp.status, elapsed));

    showResponse(ro);flushConsole();renderTests();
    notify(`${resp.status} ${resp.statusText} — ${elapsed}ms`,resp.status>=500?'error':resp.status>=400?'warn':'success');

  }catch(e){
    clearTimeout(tId);
    if(e.name==='AbortError'){notify('Request cancelled / timed out','info');}
    else{
      const hint=isDirect
        ?`${e.message}\n\n💡 Private/internal IP — ensure server is reachable from your browser network.`
        :S.settings.corsEnabled?e.message:`${e.message}\n\n💡 Enable ⚡ CORS Proxy to bypass browser CORS restrictions.`;
      showErrorResp(hint,Date.now()-t0);
      notify('Request failed — '+e.message,'error');
    }
  }finally{
    sendBtn.disabled=false;sendBtn.textContent='Send ➤';cancelBtn.style.display='none';_abortCtrl=null;
  }
}

// Helper for advanced repeat / collection runner
async function fetchDirect(url, method, headers={}, body=null) {
  const isDirect=isPrivate(url);
  const fu=isDirect?url:(S.settings.corsEnabled?S.settings.proxyUrl+encodeURIComponent(url):url);
  const opts={method:method||'GET',headers};
  if(body&&!['GET','HEAD'].includes((method||'GET').toUpperCase()))opts.body=body;
  const t0=Date.now();
  const resp=await fetch(fu,opts);
  const txt=await resp.text();
  const hdrs={};resp.headers.forEach((v,k)=>{hdrs[k]=v;});
  return{status:resp.status,statusText:resp.statusText,_body:txt,_headers:hdrs,_time:Date.now()-t0,_size:new Blob([txt]).size};
}
