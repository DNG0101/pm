/* ============================================================
   POSTMANWEB — Complete Application Logic
   Worker URL: https://square-credit-8186.donthulanithish53.workers.dev
   ============================================================ */

// ============================================================
// STATE
// ============================================================
const S = {
  tabs: [],
  activeId: null,
  collections: load('pw_colls', []),
  envs: load('pw_envs', []),
  activeEnv: load('pw_aenv', null),
  history: load('pw_hist', []),
  globals: load('pw_globals', {}),
  cookies: load('pw_cookies', {}),
  settings: load('pw_settings', {
    corsEnabled: false,
    proxyUrl: 'https://square-credit-8186.donthulanithish53.workers.dev/?url=',
    historyOn: true
  }),
};

let _bodyType = 'none';
let _testResults = [];
let _consoleLogs = [];
let _abortCtrl = null;
let _wsConn = null;

// ============================================================
// STORAGE
// ============================================================
function load(k, def) {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; }
}
function save() {
  try {
    localStorage.setItem('pw_colls', JSON.stringify(S.collections));
    localStorage.setItem('pw_envs', JSON.stringify(S.envs));
    localStorage.setItem('pw_aenv', JSON.stringify(S.activeEnv));
    localStorage.setItem('pw_hist', JSON.stringify(S.history.slice(0, 500)));
    localStorage.setItem('pw_globals', JSON.stringify(S.globals));
    localStorage.setItem('pw_cookies', JSON.stringify(S.cookies));
    localStorage.setItem('pw_settings', JSON.stringify(S.settings));
  } catch(e) { console.error('Save failed', e); }
}

// ============================================================
// HELPERS
// ============================================================
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function notify(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `notif ${type}`;
  el.textContent = msg;
  document.getElementById('notifs').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
function openModal(html) {
  const c = document.getElementById('modals');
  c.innerHTML = html;
  c.querySelector('.modal-bg')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
}
function closeModal() { document.getElementById('modals').innerHTML = ''; }

// ============================================================
// VARIABLE RESOLUTION
// ============================================================
function getEnv() { return S.envs.find(e => e.id === S.activeEnv) || null; }
function resolveVars(str) {
  if (!str) return str;
  const env = getEnv();
  const ev = env?.variables || {};
  // Dynamic vars
  const dyn = {
    '{{$timestamp}}': () => Date.now().toString(),
    '{{$isoTimestamp}}': () => new Date().toISOString(),
    '{{$randomInt}}': () => Math.floor(Math.random() * 1000).toString(),
    '{{$randomFloat}}': () => (Math.random() * 100).toFixed(2),
    '{{$guid}}': () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c==='x'?r:(r&0x3|0x8)).toString(16); }),
    '{{$randomFirstName}}': () => ['Alice','Bob','Charlie','Diana','Eve','Frank','Grace','Hank'][Math.floor(Math.random()*8)],
    '{{$randomLastName}}': () => ['Smith','Jones','Williams','Brown','Davis'][Math.floor(Math.random()*5)],
    '{{$randomEmail}}': () => `user${Math.floor(Math.random()*9000+1000)}@example.com`,
    '{{$randomBoolean}}': () => Math.random() > .5 ? 'true' : 'false',
    '{{$randomAlphaNumeric}}': () => Math.random().toString(36).slice(2, 10),
    '{{$randomPassword}}': () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2).toUpperCase(),
  };
  for (const [k, fn] of Object.entries(dyn)) str = str.split(k).join(fn());
  str = str.replace(/\{\{([^}]+)\}\}/g, (m, key) => {
    const tab = getActiveTab();
    return ev[key] ?? S.globals[key] ?? tab?.collVars?.[key] ?? m;
  });
  return str;
}

// ============================================================
// PM SANDBOX
// ============================================================
function buildPM(response) {
  _testResults = [];
  _consoleLogs = [];
  const env = getEnv();
  const tab = getActiveTab();

  const chai = (val) => {
    const self = {
      _val: val,
      equal: (x) => { if (val !== x) throw new Error(`Expected ${JSON.stringify(x)}, got ${JSON.stringify(val)}`); return self; },
      eql: (x) => { if (JSON.stringify(val) !== JSON.stringify(x)) throw new Error('Deep equal failed'); return self; },
      include: (x) => { if (!String(val).includes(x)) throw new Error(`Expected to include "${x}"`); return self; },
      not: { equal: (x) => { if (val === x) throw new Error(`Expected not ${JSON.stringify(x)}`); } },
      be: {
        below: (x) => { if (!(val < x)) throw new Error(`Expected ${val} to be below ${x}`); return self; },
        above: (x) => { if (!(val > x)) throw new Error(`Expected ${val} to be above ${x}`); return self; },
        ok: () => { if (!val) throw new Error('Expected truthy value'); return self; },
        a: (t) => { if (typeof val !== t) throw new Error(`Expected type ${t}, got ${typeof val}`); return self; },
        an: (t) => { if (typeof val !== t) throw new Error(`Expected type ${t}, got ${typeof val}`); return self; },
        empty: () => { if (val && val.length > 0) throw new Error('Expected empty'); return self; },
        true: () => { if (val !== true) throw new Error('Expected true'); return self; },
        false: () => { if (val !== false) throw new Error('Expected false'); return self; },
        null: () => { if (val !== null) throw new Error('Expected null'); return self; },
      },
      have: {
        property: (p) => { if (typeof val !== 'object' || !(p in val)) throw new Error(`Expected property "${p}"`); return self; },
        length: (n) => { if (!val || val.length !== n) throw new Error(`Expected length ${n}, got ${val?.length}`); return self; },
        lengthOf: (n) => { if (!val || val.length !== n) throw new Error(`Expected length ${n}`); return self; },
      },
      to: null,
    };
    self.to = self;
    return self;
  };

  const pm = {
    test: (name, fn) => {
      try { fn(); _testResults.push({ name, pass: true }); }
      catch(e) { _testResults.push({ name, pass: false, error: e.message }); }
    },
    expect: chai,
    response: response ? {
      code: response.status,
      status: response.statusText,
      responseTime: response._time || 0,
      size: response._size || 0,
      json: () => { try { return JSON.parse(response._body); } catch { throw new Error('Response is not valid JSON'); } },
      text: () => response._body,
      headers: {
        get: (k) => response._headers?.[k.toLowerCase()],
        has: (k) => !!response._headers?.[k.toLowerCase()],
        toObject: () => ({ ...response._headers }),
      },
      to: {
        have: {
          status: (code) => { if (response.status !== code) throw new Error(`Expected status ${code}, got ${response.status}`); },
          header: (key) => { if (!response._headers?.[key.toLowerCase()]) throw new Error(`Missing header: ${key}`); },
          jsonBody: (path) => {
            const body = JSON.parse(response._body);
            const parts = path.split('.');
            let v = body;
            for (const p of parts) v = v?.[p];
            if (v === undefined) throw new Error(`JSON path "${path}" not found`);
          },
          body: { that: { includes: (s) => { if (!response._body.includes(s)) throw new Error(`Body doesn't include: ${s}`); } } }
        }
      },
      statusCode: response.status,
    } : {},
    request: {
      url: { toString: () => document.getElementById('url-in').value },
      method: document.getElementById('method-sel').value,
      headers: { add: () => {}, get: () => {} },
      body: { raw: document.getElementById('code-raw')?.value || '' }
    },
    environment: {
      get: (k) => env?.variables?.[k],
      set: (k, v) => { if (env) { env.variables[k] = String(v); save(); } },
      unset: (k) => { if (env) { delete env.variables[k]; save(); } },
      has: (k) => !!(env?.variables?.[k]),
      clear: () => { if (env) { env.variables = {}; save(); } },
      toObject: () => ({ ...env?.variables }),
    },
    globals: {
      get: (k) => S.globals[k],
      set: (k, v) => { S.globals[k] = String(v); save(); },
      unset: (k) => { delete S.globals[k]; save(); },
      has: (k) => k in S.globals,
      clear: () => { S.globals = {}; save(); },
      toObject: () => ({ ...S.globals }),
    },
    variables: {
      get: (k) => env?.variables?.[k] ?? S.globals[k] ?? tab?.collVars?.[k],
      set: (k, v) => { if (env) { env.variables[k] = String(v); save(); } else { S.globals[k] = String(v); save(); } },
      has: (k) => !!(env?.variables?.[k] ?? S.globals[k]),
    },
    collectionVariables: {
      get: (k) => tab?.collVars?.[k],
      set: (k, v) => { if (tab) { tab.collVars = tab.collVars || {}; tab.collVars[k] = String(v); } },
      has: (k) => !!(tab?.collVars?.[k]),
    },
    cookies: { get: (url, name) => S.cookies?.[url]?.[name] },
    sendRequest: (opts, cb) => {
      const proxyUrl = S.settings.proxyUrl;
      const useProxy = S.settings.corsEnabled;
      const fetchUrl = useProxy ? proxyUrl + encodeURIComponent(opts.url) : opts.url;
      fetch(fetchUrl, { method: opts.method || 'GET', headers: opts.headers || {} })
        .then(r => r.text().then(body => cb && cb(null, { code: r.status, body })))
        .catch(e => cb && cb(e));
    },
    info: { requestId: uid(), iteration: 0, eventName: 'prerequest' },
    iterationData: { get: () => undefined },
  };
  return { pm, expect: chai };
}

function runScript(code, pmObj) {
  if (!code?.trim()) return;
  const con = {
    log: (...a) => _consoleLogs.push({ type: 'log', msg: a.map(x => typeof x === 'object' ? JSON.stringify(x, null, 2) : String(x)).join(' ') }),
    warn: (...a) => _consoleLogs.push({ type: 'warn', msg: a.map(String).join(' ') }),
    error: (...a) => _consoleLogs.push({ type: 'error', msg: a.map(String).join(' ') }),
    info: (...a) => _consoleLogs.push({ type: 'info', msg: a.map(String).join(' ') }),
  };
  try { new Function('pm', 'console', 'expect', code)(pmObj.pm, con, pmObj.expect); }
  catch(e) { _consoleLogs.push({ type: 'error', msg: 'Script error: ' + e.message }); }
}

// ============================================================
// TABS
// ============================================================
function mkTab(d = {}) {
  return {
    id: uid(),
    name: d.name || 'New Request',
    method: d.method || 'GET',
    url: d.url || '',
    params: d.params || [{ id: uid(), on: true, k: '', v: '', desc: '' }],
    headers: d.headers || [{ id: uid(), on: true, k: '', v: '', desc: '' }],
    bodyType: d.bodyType || 'none',
    rawFmt: d.rawFmt || 'json',
    rawBody: d.rawBody || '',
    formData: d.formData || [],
    urlEncoded: d.urlEncoded || [],
    gqlQ: d.gqlQ || '',
    gqlV: d.gqlV || '',
    authType: d.authType || 'none',
    authData: d.authData || {},
    preScript: d.preScript || '',
    testScript: d.testScript || '',
    response: null,
    collVars: {},
  };
}

function getActiveTab() { return S.tabs.find(t => t.id === S.activeId); }

function newTab(d) {
  const t = mkTab(d);
  S.tabs.push(t);
  S.activeId = t.id;
  renderTabs();
  loadTabUI(t);
  showResponse(null);
}

function switchTab(id) {
  saveTabUI();
  S.activeId = id;
  const t = S.tabs.find(t => t.id === id);
  loadTabUI(t);
  renderTabs();
  showResponse(t?.response);
}

function closeTab(id, e) {
  if (e) e.stopPropagation();
  const idx = S.tabs.findIndex(t => t.id === id);
  if (idx === -1) return;
  S.tabs.splice(idx, 1);
  if (!S.tabs.length) newTab();
  else {
    S.activeId = S.tabs[Math.min(idx, S.tabs.length - 1)].id;
    const t = S.tabs.find(t => t.id === S.activeId);
    loadTabUI(t);
    showResponse(t?.response);
  }
  renderTabs();
}

function renderTabs() {
  const mc = { GET: 'var(--get)', POST: 'var(--post)', PUT: 'var(--put)', PATCH: 'var(--patch)', DELETE: 'var(--delete)', HEAD: 'var(--head)', OPTIONS: 'var(--options)' };
  document.getElementById('tabs').innerHTML = S.tabs.map(t =>
    `<div class="tab-item${t.id === S.activeId ? ' active' : ''}" onclick="switchTab('${t.id}')">
      <span class="tab-method" style="color:${mc[t.method] || 'var(--text2)'}">${t.method}</span>
      <span class="tab-name">${esc(t.name)}</span>
      <span class="tab-dot"></span>
      <button class="tab-close" onclick="closeTab('${t.id}',event)">✕</button>
    </div>`
  ).join('');
}

function saveTabUI() {
  const t = getActiveTab();
  if (!t) return;
  t.method = document.getElementById('method-sel').value;
  t.url = document.getElementById('url-in').value;
  t.bodyType = _bodyType;
  t.rawBody = document.getElementById('code-raw')?.value || '';
  t.rawFmt = document.getElementById('raw-fmt')?.value || 'json';
  t.gqlQ = document.getElementById('gql-q')?.value || '';
  t.gqlV = document.getElementById('gql-v')?.value || '';
  t.authType = document.getElementById('auth-sel')?.value || 'none';
  t.authData = readAuthData();
  t.preScript = document.getElementById('pre-script')?.value || '';
  t.testScript = document.getElementById('test-script')?.value || '';
  t.params = readKV('params');
  t.headers = readKV('headers');
  t.urlEncoded = readKV('urlenc');
}

function loadTabUI(t) {
  if (!t) return;
  document.getElementById('method-sel').value = t.method;
  document.getElementById('url-in').value = t.url;
  loadKV('params', t.params);
  loadKV('headers', t.headers);
  loadKV('urlenc', t.urlEncoded || []);
  setBody(t.bodyType || 'none');
  document.getElementById('code-raw').value = t.rawBody || '';
  document.getElementById('raw-fmt').value = t.rawFmt || 'json';
  document.getElementById('gql-q').value = t.gqlQ || '';
  document.getElementById('gql-v').value = t.gqlV || '';
  document.getElementById('auth-sel').value = t.authType || 'none';
  document.getElementById('pre-script').value = t.preScript || '';
  document.getElementById('test-script').value = t.testScript || '';
  renderAuthFields(t.authData || {});
  colorMethod();
}

// ============================================================
// KV TABLES
// ============================================================
function addKVRow(type, k = '', v = '', desc = '', on = true) {
  const tbody = document.getElementById(`kv-${type}`);
  const tr = document.createElement('tr');
  tr.dataset.id = uid();
  tr.innerHTML = `
    <td><input type="checkbox" class="kv-chk" ${on ? 'checked' : ''}></td>
    <td><input type="text" placeholder="Key" value="${esc(k)}"></td>
    <td><input type="text" placeholder="Value" value="${esc(v)}"></td>
    <td><input type="text" placeholder="Description" value="${esc(desc)}"></td>
    <td><button class="kv-del" onclick="this.closest('tr').remove()">✕</button></td>`;
  tbody.appendChild(tr);
}

function readKV(type) {
  const rows = [];
  document.querySelectorAll(`#kv-${type} tr`).forEach(tr => {
    const cells = tr.querySelectorAll('input');
    if (cells.length >= 3) rows.push({ id: tr.dataset.id || uid(), on: cells[0].checked, k: cells[1].value, v: cells[2].value, desc: cells[3]?.value || '' });
  });
  return rows;
}

function loadKV(type, rows = []) {
  document.getElementById(`kv-${type}`).innerHTML = '';
  rows.forEach(r => addKVRow(type, r.k || r.key || '', r.v || r.value || '', r.desc || '', r.on !== false && r.enabled !== false));
  if (!rows.length) addKVRow(type);
}

function addFormRow(k = '', v = '', t = 'text') {
  const tbody = document.getElementById('kv-form');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="checkbox" class="kv-chk" checked></td>
    <td><input type="text" placeholder="Key" value="${esc(k)}"></td>
    <td><input type="text" placeholder="Value" value="${esc(v)}"></td>
    <td><select><option value="text" ${t==='text'?'selected':''}>Text</option><option value="file" ${t==='file'?'selected':''}>File</option></select></td>
    <td><button class="kv-del" onclick="this.closest('tr').remove()">✕</button></td>`;
  tbody.appendChild(tr);
}

// ============================================================
// BODY
// ============================================================
function setBody(type) {
  _bodyType = type;
  document.querySelectorAll('.btype-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  ['none','form','urlenc','raw','binary','graphql'].forEach(t => {
    const el = document.getElementById(`body-${t}`);
    if (el) el.style.display = t === type ? 'block' : 'none';
  });
}

// ============================================================
// AUTH
// ============================================================
const AUTH_HTML = {
  none: '<p style="color:var(--text3);font-size:12px;">This request has no authorization.</p>',
  bearer: `<div class="af"><label>TOKEN</label><input type="text" id="a-token" placeholder="Bearer token..."></div>`,
  apikey: `<div class="af"><label>KEY NAME</label><input type="text" id="a-key" placeholder="X-API-Key"></div><div class="af"><label>KEY VALUE</label><input type="text" id="a-key-val" placeholder="your-api-key"></div><div class="af"><label>ADD TO</label><select id="a-key-in"><option value="header">Header</option><option value="query">Query Params</option></select></div>`,
  basic: `<div class="af"><label>USERNAME</label><input type="text" id="a-user" placeholder="username"></div><div class="af"><label>PASSWORD</label><input type="password" id="a-pass" placeholder="password"></div>`,
  digest: `<div class="af"><label>USERNAME</label><input type="text" id="a-du" placeholder="username"></div><div class="af"><label>PASSWORD</label><input type="password" id="a-dp" placeholder="password"></div><div class="af"><label>REALM</label><input type="text" id="a-realm" placeholder="optional"></div>`,
  oauth1: `<div class="af"><label>CONSUMER KEY</label><input type="text" id="a-ck" placeholder="Consumer Key"></div><div class="af"><label>CONSUMER SECRET</label><input type="text" id="a-cs" placeholder="Consumer Secret"></div><div class="af"><label>ACCESS TOKEN</label><input type="text" id="a-at" placeholder="Access Token"></div><div class="af"><label>TOKEN SECRET</label><input type="text" id="a-ts" placeholder="Token Secret"></div>`,
  oauth2: `<div class="af"><label>ACCESS TOKEN</label><input type="text" id="a-o2" placeholder="Paste your access token here"></div><div class="af"><label>HEADER PREFIX</label><input type="text" id="a-o2p" value="Bearer" placeholder="Bearer"></div><button class="btn s secondary" style="margin-top:8px" onclick="notify('Copy token from your OAuth provider and paste above.','info')">ℹ How to get token</button>`,
  hawk: `<div class="af"><label>HAWK AUTH ID</label><input type="text" id="a-hid" placeholder="Hawk Auth ID"></div><div class="af"><label>HAWK AUTH KEY</label><input type="text" id="a-hkey" placeholder="Hawk Auth Key"></div><div class="af"><label>ALGORITHM</label><select id="a-halg"><option>sha256</option><option>sha1</option></select></div>`,
  aws: `<div class="af"><label>ACCESS KEY ID</label><input type="text" id="a-ak" placeholder="AWS Access Key ID"></div><div class="af"><label>SECRET ACCESS KEY</label><input type="password" id="a-sk" placeholder="AWS Secret Access Key"></div><div class="af"><label>REGION</label><input type="text" id="a-region" placeholder="us-east-1"></div><div class="af"><label>SERVICE</label><input type="text" id="a-svc" placeholder="execute-api"></div><div class="af"><label>SESSION TOKEN (optional)</label><input type="text" id="a-sess" placeholder="optional"></div>`,
  ntlm: `<div class="af"><label>USERNAME</label><input type="text" id="a-nu" placeholder="username"></div><div class="af"><label>PASSWORD</label><input type="password" id="a-np" placeholder="password"></div><div class="af"><label>DOMAIN</label><input type="text" id="a-nd" placeholder="DOMAIN"></div><div class="af"><label>WORKSTATION</label><input type="text" id="a-nw" placeholder="optional"></div>`,
};

function renderAuthFields(data = {}) {
  const type = document.getElementById('auth-sel').value;
  document.getElementById('auth-fields').innerHTML = AUTH_HTML[type] || '';
  // Restore saved values
  const tab = getActiveTab();
  const ad = data || tab?.authData || {};
  const fields = { bearer:['a-token'], basic:['a-user','a-pass'], apikey:['a-key','a-key-val'], oauth2:['a-o2','a-o2p'], aws:['a-ak','a-sk','a-region','a-svc','a-sess'] };
  (fields[type] || []).forEach(id => { const el = document.getElementById(id); if (el && ad[id]) el.value = ad[id]; });
}

function readAuthData() {
  const d = {};
  document.querySelectorAll('#auth-fields input, #auth-fields select').forEach(el => { if (el.id) d[el.id] = el.value; });
  return d;
}

function getAuthHeaders() {
  const type = document.getElementById('auth-sel')?.value;
  const h = {};
  if (type === 'bearer') { const t = document.getElementById('a-token')?.value; if (t) h['Authorization'] = `Bearer ${t}`; }
  else if (type === 'basic') { const u = document.getElementById('a-user')?.value || ''; const p = document.getElementById('a-pass')?.value || ''; h['Authorization'] = 'Basic ' + btoa(`${u}:${p}`); }
  else if (type === 'apikey') { const w = document.getElementById('a-key-in')?.value; if (w === 'header') { const k = document.getElementById('a-key')?.value; const v = document.getElementById('a-key-val')?.value; if (k && v) h[k] = v; } }
  else if (type === 'oauth2') { const t = document.getElementById('a-o2')?.value; const p = document.getElementById('a-o2p')?.value || 'Bearer'; if (t) h['Authorization'] = `${p} ${t}`; }
  return h;
}

function getAuthQP() {
  const type = document.getElementById('auth-sel')?.value;
  const p = {};
  if (type === 'apikey') { const w = document.getElementById('a-key-in')?.value; if (w === 'query') { const k = document.getElementById('a-key')?.value; const v = document.getElementById('a-key-val')?.value; if (k && v) p[k] = v; } }
  return p;
}

function colorMethod() {
  const sel = document.getElementById('method-sel');
  const colors = { GET:'var(--get)', POST:'var(--post)', PUT:'var(--put)', PATCH:'var(--patch)', DELETE:'var(--delete)', HEAD:'var(--head)', OPTIONS:'var(--options)' };
  sel.style.color = colors[sel.value] || 'var(--text1)';
  const t = getActiveTab();
  if (t) { t.method = sel.value; renderTabs(); }
}

// ============================================================
// CORS BUTTON
// ============================================================
function toggleCORS() {
  S.settings.corsEnabled = !S.settings.corsEnabled;
  if (!S.settings.proxyUrl) S.settings.proxyUrl = 'https://square-credit-8186.donthulanithish53.workers.dev/?url=';
  save();
  refreshCORSBtn();
  notify(S.settings.corsEnabled ? '⚡ CORS Proxy ENABLED — all requests will work!' : '🔴 CORS Proxy disabled', S.settings.corsEnabled ? 'success' : 'info');
}

function refreshCORSBtn() {
  const btn = document.getElementById('cors-btn');
  if (!btn) return;
  if (S.settings.corsEnabled) { btn.textContent = '⚡ CORS: ON'; btn.className = 'on'; btn.id = 'cors-btn'; }
  else { btn.textContent = '⚡ CORS: OFF'; btn.className = ''; btn.id = 'cors-btn'; }
}

// ============================================================
// SEND REQUEST
// ============================================================
function cancelReq() {
  _abortCtrl?.abort();
  document.getElementById('cancel-btn').style.display = 'none';
  document.getElementById('send-btn').disabled = false;
  document.getElementById('send-btn').textContent = 'Send ➤';
}

async function sendRequest() {
  saveTabUI();
  const tab = getActiveTab();
  const method = document.getElementById('method-sel').value;
  const rawUrl = document.getElementById('url-in').value.trim();
  if (!rawUrl) { notify('Enter a URL first', 'error'); return; }

  // Pre-request script
  const preScript = document.getElementById('pre-script').value;
  if (preScript.trim()) { const pmObj = buildPM(null); runScript(preScript, pmObj); flushConsole(); }

  const url = resolveVars(rawUrl);
  const paramRows = readKV('params').filter(r => r.on && r.k);
  const hdrRows = readKV('headers').filter(r => r.on && r.k);
  const authH = getAuthHeaders();
  const authQP = getAuthQP();

  // Build URL
  let finalUrl = url;
  const qpObj = { ...Object.fromEntries(paramRows.map(r => [resolveVars(r.k), resolveVars(r.v)])), ...authQP };
  const qpStr = new URLSearchParams(qpObj).toString();
  if (qpStr) finalUrl += (url.includes('?') ? '&' : '?') + qpStr;

  // Build headers
  const headers = {};
  hdrRows.forEach(h => { headers[resolveVars(h.k)] = resolveVars(h.v); });
  Object.assign(headers, authH);

  // Build body
  let body = null;
  if (_bodyType === 'raw') {
    body = resolveVars(document.getElementById('code-raw').value);
    if (!headers['Content-Type']) {
      const fmt = document.getElementById('raw-fmt').value;
      const ctm = { json: 'application/json', xml: 'application/xml', html: 'text/html', text: 'text/plain', javascript: 'application/javascript' };
      headers['Content-Type'] = ctm[fmt] || 'text/plain';
    }
  } else if (_bodyType === 'urlenc') {
    const rows = readKV('urlenc').filter(r => r.on && r.k);
    body = rows.map(r => `${encodeURIComponent(resolveVars(r.k))}=${encodeURIComponent(resolveVars(r.v))}`).join('&');
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  } else if (_bodyType === 'form') {
    const fd = new FormData();
    document.querySelectorAll('#kv-form tr').forEach(tr => {
      const inp = tr.querySelectorAll('input, select');
      if (inp[0]?.checked && inp[1]?.value) {
        if (inp[3]?.value === 'file' && inp[2]?.files?.[0]) fd.append(inp[1].value, inp[2].files[0]);
        else fd.append(inp[1].value, inp[2]?.value || '');
      }
    });
    body = fd;
  } else if (_bodyType === 'graphql') {
    let vars = {};
    try { vars = JSON.parse(document.getElementById('gql-v').value || '{}'); } catch {}
    body = JSON.stringify({ query: document.getElementById('gql-q').value, variables: vars });
    headers['Content-Type'] = 'application/json';
  } else if (_bodyType === 'binary') {
    const f = document.getElementById('bin-file')?.files[0];
    if (f) { body = f; headers['Content-Type'] = f.type || 'application/octet-stream'; }
  }

  // Proxy
  const useProxy = S.settings.corsEnabled;
  const proxyUrl = S.settings.proxyUrl || 'https://square-credit-8186.donthulanithish53.workers.dev/?url=';
  const fetchUrl = useProxy ? proxyUrl + encodeURIComponent(finalUrl) : finalUrl;

  const sendBtn = document.getElementById('send-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending…';
  cancelBtn.style.display = '';
  const t0 = Date.now();
  _abortCtrl = new AbortController();

  try {
    const opts = { method, headers, signal: _abortCtrl.signal };
    if (body && !['GET', 'HEAD'].includes(method)) opts.body = body;

    const resp = await fetch(fetchUrl, opts);
    const elapsed = Date.now() - t0;
    const respText = await resp.text();
    const respHdrs = {};
    resp.headers.forEach((v, k) => { respHdrs[k] = v; });
    const size = new Blob([respText]).size;

    // Parse cookies
    try {
      const domain = new URL(finalUrl).hostname;
      const sc = resp.headers.get('set-cookie');
      if (sc) {
        if (!S.cookies[domain]) S.cookies[domain] = {};
        sc.split(',').forEach(c => {
          const [kv] = c.trim().split(';');
          const [k, ...vp] = kv.split('=');
          if (k) S.cookies[domain][k.trim()] = vp.join('=').trim();
        });
        save();
      }
    } catch {}

    const responseObj = { status: resp.status, statusText: resp.statusText, _body: respText, _headers: respHdrs, _time: elapsed, _size: size };
    if (tab) tab.response = responseObj;

    // Test script
    _testResults = [];
    const testScript = document.getElementById('test-script').value;
    if (testScript.trim()) { const pmObj = buildPM(responseObj); runScript(testScript, pmObj); }

    addHistory({ method, url: rawUrl, status: resp.status, time: elapsed });
    showResponse(responseObj);
    flushConsole();
    renderTests();
    notify(`${resp.status} ${resp.statusText}`, resp.status < 400 ? 'success' : 'error');

  } catch(e) {
    if (e.name === 'AbortError') { notify('Request cancelled', 'info'); }
    else {
      const msg = useProxy ? e.message : `${e.message}\n💡 Click ⚡ CORS: OFF to enable CORS Proxy`;
      showErrorResp(msg, Date.now() - t0);
      notify('Request failed — ' + (useProxy ? e.message : 'Try enabling CORS Proxy'), 'error');
    }
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send ➤';
    cancelBtn.style.display = 'none';
    _abortCtrl = null;
  }
}

// ============================================================
// RESPONSE
// ============================================================
function jsonHL(json) {
  let s = JSON.stringify(json, null, 2);
  s = s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return s.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, m => {
    let c = 'jn';
    if (/^"/.test(m)) c = /:$/.test(m) ? 'jk' : 'js';
    else if (/true|false/.test(m)) c = 'jb';
    else if (/null/.test(m)) c = 'jl';
    return `<span class="${c}">${m}</span>`;
  });
}

function formatBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n/1024).toFixed(1) + ' KB';
  return (n/1048576).toFixed(1) + ' MB';
}

function showResponse(r) {
  const pill = document.getElementById('r-pill');
  const rtime = document.getElementById('r-time');
  const rsize = document.getElementById('r-size');
  const hint = document.getElementById('r-hint');
  const acts = document.getElementById('r-acts');

  if (!r) {
    pill.style.display = 'none';
    rtime.style.display = 'none';
    rsize.style.display = 'none';
    hint.style.display = '';
    acts.style.display = 'none';
    document.getElementById('resp-pretty').innerHTML = '';
    document.getElementById('resp-raw').textContent = '';
    return;
  }

  pill.style.display = '';
  pill.textContent = `${r.status} ${r.statusText}`;
  const sc = Math.floor(r.status / 100);
  pill.className = `spill s${sc}`;

  rtime.style.display = '';
  rtime.innerHTML = `Time: <b>${r._time}ms</b>`;
  if (r._time > 1000) rtime.querySelector('b').style.color = 'var(--warn)';

  rsize.style.display = '';
  rsize.innerHTML = `Size: <b>${formatBytes(r._size)}</b>`;

  hint.style.display = 'none';
  acts.style.display = '';

  // Pretty
  let pretty = r._body;
  try { pretty = jsonHL(JSON.parse(r._body)); }
  catch { pretty = esc(r._body); }
  document.getElementById('resp-pretty').innerHTML = pretty;
  document.getElementById('resp-raw').textContent = r._body;

  // Preview
  const ct = r._headers?.['content-type'] || '';
  if (ct.includes('html')) document.getElementById('resp-preview').srcdoc = r._body;

  // Headers table
  document.getElementById('r-headers-tbl').innerHTML =
    Object.entries(r._headers || {}).map(([k, v]) =>
      `<tr><td>${esc(k)}</td><td style="color:var(--text2)">${esc(v)}</td></tr>`
    ).join('');

  // Cookies
  renderCookiesPanel();
}

function showErrorResp(msg, time) {
  const pill = document.getElementById('r-pill');
  pill.style.display = '';
  pill.className = 'spill serr';
  pill.textContent = 'Error';
  document.getElementById('r-time').style.display = '';
  document.getElementById('r-time').innerHTML = `Time: <b class="e">${time}ms</b>`;
  document.getElementById('r-size').style.display = 'none';
  document.getElementById('r-hint').style.display = 'none';
  document.getElementById('r-acts').style.display = 'none';
  document.getElementById('resp-pretty').innerHTML = `<span style="color:var(--err);white-space:pre-wrap">${esc(msg)}</span>`;
  document.getElementById('resp-raw').textContent = msg;
}

function renderTests() {
  const c = document.getElementById('test-output');
  const badge = document.getElementById('test-badge');
  if (!_testResults.length) {
    c.innerHTML = '<div class="empty"><p>No tests ran. Write tests in the Tests tab.</p></div>';
    badge.style.display = 'none';
    return;
  }
  const pass = _testResults.filter(t => t.pass).length;
  badge.textContent = `${pass}/${_testResults.length}`;
  badge.style.display = '';
  c.innerHTML = `<div style="margin-bottom:12px;font-size:12px;color:var(--text2);font-weight:600">${pass} / ${_testResults.length} passed</div>` +
    _testResults.map(t =>
      `<div class="tr-item ${t.pass ? 'tr-pass' : 'tr-fail'}">
        <span style="font-size:16px">${t.pass ? '✅' : '❌'}</span>
        <div><div class="tr-name">${esc(t.name)}</div>${t.error ? `<div class="tr-err">${esc(t.error)}</div>` : ''}</div>
      </div>`
    ).join('');
}

function flushConsole() {
  document.getElementById('console-out').innerHTML = _consoleLogs.map(l =>
    `<div class="con-row ${l.type}"><span class="ct">${l.type.toUpperCase()}</span><span class="cm">${esc(l.msg)}</span></div>`
  ).join('');
}

function clearConsole() { _consoleLogs = []; flushConsole(); }

function renderCookiesPanel() {
  const panel = document.getElementById('cookies-out');
  const domains = Object.keys(S.cookies);
  if (!domains.length) { panel.innerHTML = '<div class="empty"><div class="ei">🍪</div><p>No cookies stored.</p></div>'; return; }
  panel.innerHTML = domains.map(d =>
    `<div class="ck-domain"><div class="ck-domain-nm">${esc(d)}</div>` +
    Object.entries(S.cookies[d]).map(([k, v]) =>
      `<div class="ck-row"><span class="ck-name">${esc(k)}</span><span class="ck-val">${esc(v)}</span></div>`
    ).join('') + '</div>'
  ).join('');
}

function copyResponse() {
  navigator.clipboard.writeText(document.getElementById('resp-raw').textContent)
    .then(() => notify('Copied!', 'success'));
}

function saveRespFile() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([document.getElementById('resp-raw').textContent], { type: 'text/plain' }));
  a.download = 'response.json'; a.click();
}

// ============================================================
// PANEL SWITCHING
// ============================================================
function switchReqPanel(id) {
  document.querySelectorAll('.ptab').forEach(t => t.classList.toggle('active', t.dataset.panel === id));
  document.querySelectorAll('.tpanel').forEach(p => p.classList.toggle('active', p.id === `rp-${id}`));
}

function switchRespPanel(id) {
  document.querySelectorAll('.rptab').forEach(t => t.classList.toggle('active', t.dataset.panel === id));
  document.querySelectorAll('.rtpanel').forEach(p => p.classList.toggle('active', p.id === `rsp-${id}`));
}

function switchRespBody(id) {
  document.querySelectorAll('.rbview').forEach(b => b.classList.toggle('active', b.dataset.view === id));
  document.querySelectorAll('.rbpanel').forEach(p => p.classList.toggle('active', p.id === `rbp-${id}`));
}

function switchSB(id) {
  document.querySelectorAll('.sb-tab').forEach(t => t.classList.toggle('active', t.dataset.sb === id));
  document.querySelectorAll('.sb-panel').forEach(p => p.classList.toggle('active', p.id === `sbp-${id}`));
}

function toggleSB() { document.getElementById('sidebar').classList.toggle('hidden'); }

// ============================================================
// HISTORY
// ============================================================
function toggleHistRec() {
  S.settings.historyOn = document.getElementById('hist-toggle').checked;
  save();
  refreshHistDot();
  notify(S.settings.historyOn ? '✅ History recording ON' : '🔴 History recording OFF', 'info');
}

function refreshHistDot() {
  const dot = document.getElementById('hist-dot');
  if (dot) dot.className = `hrec-dot${S.settings.historyOn ? '' : ' off'}`;
  const tog = document.getElementById('hist-toggle');
  if (tog) tog.checked = S.settings.historyOn !== false;
}

function addHistory(entry) {
  if (S.settings.historyOn === false) return;
  S.history.unshift({ id: uid(), ...entry, at: new Date().toLocaleTimeString(), pinned: false });
  if (S.history.length > 500) S.history.pop();
  save();
  renderHistory();
}

function renderHistory() {
  const list = document.getElementById('hist-list');
  refreshHistDot();
  if (!S.history.length) { list.innerHTML = '<div class="empty"><div class="ei">📭</div><p>No history yet.</p></div>'; return; }
  const pinned = S.history.filter(h => h.pinned);
  const recent = S.history.filter(h => !h.pinned);
  const mc = { GET:'var(--get)', POST:'var(--post)', PUT:'var(--put)', PATCH:'var(--patch)', DELETE:'var(--delete)', HEAD:'var(--head)', OPTIONS:'var(--options)' };
  const row = h =>
    `<div class="hist-row${h.pinned ? ' pinned' : ''}" onclick="loadHist('${h.id}')">
      <span class="mbadge ${h.method}" style="color:${mc[h.method] || 'var(--text2)'}">${h.method}</span>
      <span class="hist-url" title="${esc(h.url)}">${esc(h.url)}</span>
      <span class="hist-time">${h.at}</span>
      <div class="hist-acts" onclick="event.stopPropagation()">
        <button class="icon-btn${h.pinned ? '' : ''}" title="${h.pinned ? 'Unpin' : 'Pin'}" onclick="pinHist('${h.id}')">${h.pinned ? '📌' : '📍'}</button>
        <button class="icon-btn del" title="Delete" onclick="delHist('${h.id}')">🗑</button>
      </div>
    </div>`;
  let html = '';
  if (pinned.length) html += `<div class="hist-sec pin">📌 PINNED</div>${pinned.map(row).join('')}`;
  if (recent.length) { if (pinned.length) html += `<div class="hist-sec rec">🕐 RECENT</div>`; html += recent.map(row).join(''); }
  list.innerHTML = html;
}

function pinHist(id) {
  const h = S.history.find(x => x.id === id);
  if (!h) return;
  h.pinned = !h.pinned;
  S.history.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  save(); renderHistory();
  notify(h.pinned ? '📌 Pinned!' : 'Unpinned', 'info');
}

function delHist(id) {
  S.history = S.history.filter(x => x.id !== id);
  save(); renderHistory();
}

function loadHist(id) {
  const h = S.history.find(x => x.id === id);
  if (!h) return;
  newTab({ method: h.method, url: h.url, name: h.url });
}

function clearHistory() {
  if (!confirm('Delete ALL history including pinned?')) return;
  S.history = []; save(); renderHistory();
  notify('History cleared', 'info');
}

function unpinAll() {
  S.history.forEach(h => h.pinned = false);
  save(); renderHistory();
  notify('All unpinned', 'info');
}

// ============================================================
// COLLECTIONS
// ============================================================
function renderCollections() {
  const q = document.getElementById('coll-search').value.toLowerCase();
  const list = document.getElementById('coll-list');
  const filtered = S.collections.filter(c => c.name.toLowerCase().includes(q));
  if (!filtered.length) { list.innerHTML = '<div class="empty"><div class="ei">📂</div><p>No collections yet.<br>Create or import one.</p></div>'; return; }
  const mc = { GET:'var(--get)', POST:'var(--post)', PUT:'var(--put)', PATCH:'var(--patch)', DELETE:'var(--delete)', HEAD:'var(--head)', OPTIONS:'var(--options)' };
  list.innerHTML = filtered.map(c =>
    `<div class="coll-item" id="coll-${c.id}">
      <div class="coll-header" onclick="toggleColl('${c.id}')">
        <span class="coll-arrow" id="ca-${c.id}">▶</span>
        <span class="coll-name">${esc(c.name)}</span>
        <div class="coll-btns">
          <button class="icon-btn" title="Run collection" onclick="runColl(event,'${c.id}')">▶</button>
          <button class="icon-btn" title="Add current request" onclick="addToColl(event,'${c.id}')">+</button>
          <button class="icon-btn" title="Export" onclick="exportColl(event,'${c.id}')">⬇</button>
          <button class="icon-btn del" title="Delete" onclick="delColl(event,'${c.id}')">🗑</button>
        </div>
      </div>
      <div class="coll-reqs" id="cr-${c.id}">
        ${(c.requests || []).map(r =>
          `<div class="req-row" onclick="loadCollReq('${c.id}','${r.id}')">
            <span class="mbadge ${r.method}" style="color:${mc[r.method]||'var(--text2)'}">${r.method}</span>
            <span class="req-name">${esc(r.name)}</span>
            <div class="req-btns">
              <button class="icon-btn" title="Duplicate" onclick="dupReq(event,'${c.id}','${r.id}')">⧉</button>
              <button class="icon-btn del" title="Delete" onclick="delReq(event,'${c.id}','${r.id}')">✕</button>
            </div>
          </div>`
        ).join('')}
        ${!(c.requests?.length) ? '<div style="padding:8px;color:var(--text3);font-size:11px">Empty collection</div>' : ''}
      </div>
    </div>`
  ).join('');
}

function toggleColl(id) {
  document.getElementById(`cr-${id}`)?.classList.toggle('open');
  document.getElementById(`ca-${id}`)?.classList.toggle('open');
}

async function runColl(e, id) {
  e.stopPropagation();
  const coll = S.collections.find(c => c.id === id);
  if (!coll?.requests?.length) { notify('Collection is empty', 'error'); return; }
  notify(`Running ${coll.requests.length} requests...`, 'info');
  let ok = 0, fail = 0;
  for (const req of coll.requests) {
    try {
      const url = resolveVars(req.url);
      const useProxy = S.settings.corsEnabled;
      const proxyUrl = S.settings.proxyUrl;
      const fetchUrl = useProxy ? proxyUrl + encodeURIComponent(url) : url;
      const h = {};
      (req.headers || []).filter(x => x.on !== false && (x.k || x.key)).forEach(x => { h[x.k || x.key] = x.v || x.value; });
      const opts = { method: req.method || 'GET', headers: h };
      if (req.rawBody && !['GET','HEAD'].includes(req.method)) opts.body = req.rawBody;
      const r = await fetch(fetchUrl, opts);
      r.ok ? ok++ : fail++;
    } catch { fail++; }
  }
  notify(`Done: ✅ ${ok} passed  ❌ ${fail} failed`, ok === coll.requests.length ? 'success' : 'warn');
}

function openNewColl() {
  openModal(`<div class="modal-bg"><div class="modal sm">
    <div class="mh"><span class="mh-title">New Collection</span><button class="m-close" onclick="closeModal()">✕</button></div>
    <div class="mb">
      <div class="fg"><label>NAME</label><input id="nc-name" placeholder="My Collection" autofocus></div>
      <div class="fg"><label>DESCRIPTION</label><textarea id="nc-desc" rows="2" placeholder="Optional description" style="width:100%;resize:none;"></textarea></div>
    </div>
    <div class="mf"><button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="createColl()">Create</button></div>
  </div></div>`);
  setTimeout(() => document.getElementById('nc-name')?.focus(), 50);
}

function createColl() {
  const name = document.getElementById('nc-name').value.trim();
  if (!name) { notify('Name required', 'error'); return; }
  S.collections.push({ id: uid(), name, desc: document.getElementById('nc-desc').value, requests: [], created: Date.now() });
  save(); renderCollections(); closeModal();
  notify('Collection created!', 'success');
}

function delColl(e, id) {
  e.stopPropagation();
  if (!confirm('Delete this collection and all its requests?')) return;
  S.collections = S.collections.filter(c => c.id !== id);
  save(); renderCollections();
}

function addToColl(e, id) {
  e.stopPropagation();
  saveTabUI();
  const tab = getActiveTab();
  const coll = S.collections.find(c => c.id === id);
  if (!coll) return;
  const name = prompt('Request name:', tab?.name || 'New Request');
  if (!name) return;
  if (!coll.requests) coll.requests = [];
  coll.requests.push({ id: uid(), name, method: tab?.method || 'GET', url: tab?.url || '', ...tab });
  save(); renderCollections();
  notify('Saved to collection!', 'success');
}

function saveToCollection() {
  saveTabUI();
  const tab = getActiveTab();
  if (!S.collections.length) { openNewColl(); return; }
  openModal(`<div class="modal-bg"><div class="modal sm">
    <div class="mh"><span class="mh-title">Save Request</span><button class="m-close" onclick="closeModal()">✕</button></div>
    <div class="mb">
      <div class="fg"><label>REQUEST NAME</label><input id="sr-name" value="${esc(tab?.name || 'New Request')}"></div>
      <div class="fg"><label>COLLECTION</label>
        <select id="sr-coll" style="width:100%">${S.collections.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
      </div>
    </div>
    <div class="mf"><button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="doSave()">Save</button></div>
  </div></div>`);
}

function doSave() {
  const name = document.getElementById('sr-name').value.trim();
  const id = document.getElementById('sr-coll').value;
  const coll = S.collections.find(c => c.id === id);
  const tab = getActiveTab();
  if (!coll || !name) return;
  if (!coll.requests) coll.requests = [];
  coll.requests.push({ id: uid(), name, method: tab?.method || 'GET', url: tab?.url || '', ...tab });
  if (tab) tab.name = name;
  save(); renderCollections(); renderTabs(); closeModal();
  notify('Saved!', 'success');
}

function loadCollReq(collId, reqId) {
  const coll = S.collections.find(c => c.id === collId);
  const req = coll?.requests?.find(r => r.id === reqId);
  if (!req) return;
  newTab({ ...req });
}

function dupReq(e, collId, reqId) {
  e.stopPropagation();
  const coll = S.collections.find(c => c.id === collId);
  const req = coll?.requests?.find(r => r.id === reqId);
  if (!req) return;
  coll.requests.push({ ...req, id: uid(), name: req.name + ' (copy)' });
  save(); renderCollections();
  notify('Duplicated!', 'success');
}

function delReq(e, collId, reqId) {
  e.stopPropagation();
  const coll = S.collections.find(c => c.id === collId);
  if (!coll) return;
  coll.requests = coll.requests.filter(r => r.id !== reqId);
  save(); renderCollections();
}

function exportColl(e, id) {
  e.stopPropagation();
  const coll = S.collections.find(c => c.id === id);
  if (!coll) return;
  const data = { info: { name: coll.name, schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' }, item: coll.requests };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = `${coll.name.replace(/\s+/g,'_')}.postman_collection.json`;
  a.click(); notify('Exported!', 'success');
}

function exportAllColls() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(S.collections, null, 2)], { type: 'application/json' }));
  a.download = 'postmanweb_collections.json'; a.click();
}

// ============================================================
// ENVIRONMENTS
// ============================================================
function renderEnvs() {
  const list = document.getElementById('env-list');
  if (!S.envs.length) { list.innerHTML = '<div class="empty"><div class="ei">🌍</div><p>No environments.<br>Create one to use variables.</p></div>'; return; }
  list.innerHTML = S.envs.map(e =>
    `<div class="env-row${e.id === S.activeEnv ? ' active-env' : ''}" onclick="setEnv('${e.id}')">
      <div class="env-dot-indicator${e.id === S.activeEnv ? ' on' : ''}"></div>
      <span class="env-nm">${esc(e.name)}</span>
      <button class="btn-s" onclick="editEnv(event,'${e.id}')">Edit</button>
      <button class="btn-s" onclick="delEnv(event,'${e.id}')">🗑</button>
    </div>`
  ).join('');
}

function setEnv(id) {
  S.activeEnv = S.activeEnv === id ? null : id;
  save(); renderEnvs();
  const env = S.envs.find(e => e.id === S.activeEnv);
  notify(S.activeEnv ? `Env: ${env?.name}` : 'No environment active', 'info');
}

function openNewEnv() {
  openModal(`<div class="modal-bg"><div class="modal sm">
    <div class="mh"><span class="mh-title">New Environment</span><button class="m-close" onclick="closeModal()">✕</button></div>
    <div class="mb"><div class="fg"><label>NAME</label><input id="ne-name" placeholder="Production" autofocus></div></div>
    <div class="mf"><button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="createEnv()">Create</button></div>
  </div></div>`);
  setTimeout(() => document.getElementById('ne-name')?.focus(), 50);
}

function createEnv() {
  const name = document.getElementById('ne-name').value.trim();
  if (!name) return;
  const env = { id: uid(), name, variables: {} };
  S.envs.push(env);
  save(); renderEnvs(); closeModal();
  editEnv(null, env.id);
}

function editEnv(e, id) {
  if (e) e.stopPropagation();
  const env = S.envs.find(x => x.id === id);
  if (!env) return;
  const vars = Object.entries(env.variables || {});
  openModal(`<div class="modal-bg"><div class="modal lg">
    <div class="mh"><span class="mh-title">Edit: ${esc(env.name)}</span><button class="m-close" onclick="closeModal()">✕</button></div>
    <div class="mb">
      <div id="ev-list">${vars.map(([k, v]) =>
        `<div class="ev-row"><input placeholder="Variable" value="${esc(k)}"><input placeholder="Value" value="${esc(v)}"><button class="ev-del" onclick="this.parentElement.remove()">✕</button></div>`
      ).join('')}</div>
      <button class="add-row-btn" onclick="addEvRow()" style="margin-top:8px">+ Add Variable</button>
    </div>
    <div class="mf"><button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveEnv('${id}')">Save</button></div>
  </div></div>`);
}

function addEvRow() {
  const div = document.createElement('div'); div.className = 'ev-row';
  div.innerHTML = '<input placeholder="Variable"><input placeholder="Value"><button class="ev-del" onclick="this.parentElement.remove()">✕</button>';
  document.getElementById('ev-list').appendChild(div);
}

function saveEnv(id) {
  const env = S.envs.find(x => x.id === id);
  if (!env) return;
  env.variables = {};
  document.querySelectorAll('#ev-list .ev-row').forEach(row => {
    const [k, v] = row.querySelectorAll('input');
    if (k.value.trim()) env.variables[k.value.trim()] = v.value;
  });
  save(); renderEnvs(); closeModal();
  notify('Environment saved!', 'success');
}

function delEnv(e, id) {
  e.stopPropagation();
  if (!confirm('Delete this environment?')) return;
  S.envs = S.envs.filter(x => x.id !== id);
  if (S.activeEnv === id) S.activeEnv = null;
  save(); renderEnvs();
}

function openEnvSB() { switchSB('envs'); document.getElementById('sidebar').classList.remove('hidden'); }

// ============================================================
// GLOBALS
// ============================================================
function openGlobals() {
  const vars = Object.entries(S.globals);
  openModal(`<div class="modal-bg"><div class="modal lg">
    <div class="mh"><span class="mh-title">🌐 Global Variables</span><button class="m-close" onclick="closeModal()">✕</button></div>
    <div class="mb">
      <div id="gv-list">${vars.map(([k, v]) =>
        `<div class="ev-row"><input placeholder="Variable" value="${esc(k)}"><input placeholder="Value" value="${esc(v)}"><button class="ev-del" onclick="this.parentElement.remove()">✕</button></div>`
      ).join('')}</div>
      <button class="add-row-btn" onclick="addGVRow()" style="margin-top:8px">+ Add Variable</button>
    </div>
    <div class="mf"><button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveGlobals()">Save</button></div>
  </div></div>`);
}

function addGVRow() {
  const div = document.createElement('div'); div.className = 'ev-row';
  div.innerHTML = '<input placeholder="Variable"><input placeholder="Value"><button class="ev-del" onclick="this.parentElement.remove()">✕</button>';
  document.getElementById('gv-list').appendChild(div);
}

function saveGlobals() {
  S.globals = {};
  document.querySelectorAll('#gv-list .ev-row').forEach(row => {
    const [k, v] = row.querySelectorAll('input');
    if (k.value.trim()) S.globals[k.value.trim()] = v.value;
  });
  save(); closeModal();
  notify('Globals saved!', 'success');
}

// ============================================================
// CODE GENERATION
// ============================================================
function openCodegen() {
  saveTabUI();
  openModal(`<div class="modal-bg"><div class="modal xl">
    <div class="mh"><span class="mh-title">{ } Code Snippet</span><button class="m-close" onclick="closeModal()">✕</button></div>
    <div class="mb">
      <div class="lang-tabs">${['cURL','JavaScript (Fetch)','JavaScript (Axios)','Python (requests)','Java (OkHttp)','C# (RestSharp)','Go (net/http)','PHP (Guzzle)','Ruby','Swift','Kotlin','Rust'].map(l =>
        `<button class="lang-tab${l==='cURL'?' active':''}" onclick="switchLang('${esc(l)}',this)">${l}</button>`
      ).join('')}</div>
      <textarea id="cg-out" readonly></textarea>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn primary" onclick="copyCG()">📋 Copy Code</button>
      </div>
    </div>
  </div></div>`);
  genCode('cURL');
}

function switchLang(lang, btn) {
  document.querySelectorAll('.lang-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  genCode(lang);
}

function genCode(lang) {
  const method = document.getElementById('method-sel').value;
  const url = document.getElementById('url-in').value;
  const hRows = readKV('headers').filter(h => h.on !== false && h.k);
  const authH = getAuthHeaders();
  const body = document.getElementById('code-raw')?.value || '';
  const bodyType = _bodyType;
  const allH = { ...Object.fromEntries(hRows.map(h => [h.k, h.v])), ...authH };
  const hj = JSON.stringify(allH, null, 2);
  const hj4 = JSON.stringify(allH, null, 4);

  const codes = {
    'cURL': () => {
      let c = `curl --location --request ${method} '${url}'`;
      Object.entries(allH).forEach(([k, v]) => { c += ` \\\n--header '${k}: ${v}'`; });
      if (bodyType === 'raw' && body) c += ` \\\n--data-raw '${body.replace(/'/g, "'\\''")}'`;
      return c;
    },
    'JavaScript (Fetch)': () => {
      const o = { method, headers: allH };
      if (bodyType === 'raw' && body) o.body = body;
      return `const myHeaders = new Headers(${hj});\n\nconst requestOptions = ${JSON.stringify({ method, headers: 'myHeaders', body: bodyType === 'raw' ? body : undefined, redirect: 'follow' }, null, 2)};\n\nfetch("${url}", requestOptions)\n  .then(response => response.text())\n  .then(result => console.log(result))\n  .catch(error => console.error('Error:', error));`;
    },
    'JavaScript (Axios)': () => {
      const cfg = { method: method.toLowerCase(), url, headers: allH };
      if (bodyType === 'raw' && body) try { cfg.data = JSON.parse(body); } catch { cfg.data = body; }
      return `import axios from 'axios';\n\nconst config = ${JSON.stringify(cfg, null, 2)};\n\naxios(config)\n  .then(response => console.log(JSON.stringify(response.data)))\n  .catch(error => console.error(error));`;
    },
    'Python (requests)': () => {
      let c = `import requests\n\nurl = "${url}"\n\nheaders = ${hj4}\n`;
      if (bodyType === 'raw' && body) c += `\npayload = ${body}\n\nresponse = requests.request("${method}", url, headers=headers, data=payload)`;
      else c += `\nresponse = requests.request("${method}", url, headers=headers)`;
      return c + '\n\nprint(response.text)';
    },
    'Java (OkHttp)': () => {
      const hStr = Object.entries(allH).map(([k, v]) => `.addHeader("${k}", "${v}")`).join('\n    ');
      return `OkHttpClient client = new OkHttpClient().newBuilder().build();\n${bodyType === 'raw' && body ? `MediaType mediaType = MediaType.parse("application/json");\nRequestBody body = RequestBody.create(mediaType, ${JSON.stringify(body)});\n` : ''}\nRequest request = new Request.Builder()\n    .url("${url}")\n    .method("${method}", ${bodyType === 'raw' && body ? 'body' : 'null'})\n    ${hStr}\n    .build();\n\nResponse response = client.newCall(request).execute();`;
    },
    'C# (RestSharp)': () => {
      const hStr = Object.entries(allH).map(([k, v]) => `request.AddHeader("${k}", "${v}");`).join('\n');
      return `var client = new RestClient("${url}");\nclient.Timeout = -1;\nvar request = new RestRequest(Method.${method});\n${hStr}\n${bodyType === 'raw' && body ? `request.AddParameter("application/json", ${JSON.stringify(body)}, ParameterType.RequestBody);` : ''}\nIRestResponse response = client.Execute(request);\nConsole.WriteLine(response.Content);`;
    },
    'Go (net/http)': () => {
      const bodyLine = bodyType === 'raw' && body ? `strings.NewReader(${JSON.stringify(body)})` : 'nil';
      const hStr = Object.entries(allH).map(([k, v]) => `  req.Header.Add("${k}", "${v}")`).join('\n');
      return `package main\n\nimport (\n  "fmt"\n  "net/http"\n  "io/ioutil"\n  "strings"\n)\n\nfunc main() {\n  url := "${url}"\n  method := "${method}"\n\n  payload := ${bodyLine}\n\n  client := &http.Client{}\n  req, err := http.NewRequest(method, url, payload)\n  if err != nil { fmt.Println(err); return }\n${hStr}\n\n  res, err := client.Do(req)\n  if err != nil { fmt.Println(err); return }\n  defer res.Body.Close()\n\n  body, err := ioutil.ReadAll(res.Body)\n  fmt.Println(string(body))\n}`;
    },
    'PHP (Guzzle)': () => {
      const hStr = Object.entries(allH).map(([k, v]) => `    '${k}' => '${v}'`).join(',\n');
      return `<?php\n$client = new \\GuzzleHttp\\Client();\n\n$headers = [\n${hStr}\n];\n${bodyType === 'raw' && body ? `\n$body = '${body}';\n` : ''}\n$request = new Request('${method}', '${url}', $headers${bodyType === 'raw' && body ? ', $body' : ''});\n$res = $client->sendAsync($request)->wait();\necho $res->getBody();`;
    },
    'Ruby': () => {
      const hStr = Object.entries(allH).map(([k, v]) => `"${k}" => "${v}"`).join(', ');
      return `require "uri"\nrequire "net/http"\n\nurl = URI("${url}")\nhttps = Net::HTTP.new(url.host, url.port);\nhttps.use_ssl = true\n\nrequest = Net::HTTP::${method.charAt(0)+method.slice(1).toLowerCase()}.new(url)\n${Object.entries(allH).map(([k,v])=>`request["${k}"] = "${v}"`).join('\n')}\n${bodyType === 'raw' && body ? `request.body = ${JSON.stringify(body)}\n` : ''}\nresponse = https.request(request)\nputs response.read_body`;
    },
    'Swift': () => {
      const hStr = Object.entries(allH).map(([k, v]) => `request.addValue("${v}", forHTTPHeaderField: "${k}")`).join('\n');
      return `import Foundation\n#if canImport(FoundationNetworking)\nimport FoundationNetworking\n#endif\n\nvar semaphore = DispatchSemaphore(value: 0)\n\nvar request = URLRequest(url: URL(string: "${url}")!, timeoutInterval: Double.infinity)\n${hStr}\nrequest.httpMethod = "${method}"\n${bodyType === 'raw' && body ? `request.httpBody = Data(${JSON.stringify(body)}.utf8)\n` : ''}\nURLSession.shared.dataTask(with: request) { data, response, error in\n  guard let data = data else { print(error!); return }\n  print(String(data: data, encoding: .utf8)!)\n  semaphore.signal()\n}.resume()\nsemaphore.wait()`;
    },
    'Kotlin': () => {
      const hStr = Object.entries(allH).map(([k, v]) => `.addHeader("${k}", "${v}")`).join('\n  ');
      return `import okhttp3.OkHttpClient\nimport okhttp3.Request\n${bodyType === 'raw' && body ? 'import okhttp3.RequestBody.Companion.toRequestBody\nimport okhttp3.MediaType.Companion.toMediaType\n' : ''}\nval client = OkHttpClient()\n${bodyType === 'raw' && body ? `val body = ${JSON.stringify(body)}.toRequestBody("application/json".toMediaType())\n` : ''}\nval request = Request.Builder()\n  .url("${url}")\n  ${bodyType === 'raw' && body ? `.${method.toLowerCase()}(body)` : `.method("${method}", null)`}\n  ${hStr}\n  .build()\n\nval response = client.newCall(request).execute()\nprintln(response.body!!.string())`;
    },
    'Rust': () => {
      const hStr = Object.entries(allH).map(([k, v]) => `.header("${k}", "${v}")`).join('\n    ');
      return `use reqwest::header;\n\n#[tokio::main]\nasync fn main() -> Result<(), Box<dyn std::error::Error>> {\n    let client = reqwest::Client::builder().build()?;\n    let res = client.request(reqwest::Method::${method}, "${url}")\n    ${hStr}\n    ${bodyType === 'raw' && body ? `.body(${JSON.stringify(body)})\n    ` : ''}.send().await?;\n    let body = res.text().await?;\n    println!("{}", body);\n    Ok(())\n}`;
    },
  };
  document.getElementById('cg-out').value = (codes[lang] || codes['cURL'])();
}

function copyCG() {
  navigator.clipboard.writeText(document.getElementById('cg-out').value)
    .then(() => notify('Copied!', 'success'));
}

// ============================================================
// WEBSOCKET
// ============================================================
function openWS() {
  openModal(`<div class="modal-bg"><div class="modal lg">
    <div class="mh"><span class="mh-title">⚡ WebSocket Client</span><button class="m-close" onclick="closeWS()">✕</button></div>
    <div class="mb">
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <input id="ws-url" type="text" placeholder="wss://echo.websocket.org" style="flex:1;font-family:monospace;font-size:13px" value="wss://echo.websocket.org">
        <button id="ws-btn" onclick="wsToggle()" style="padding:7px 20px;border-radius:6px;font-weight:700;background:var(--ok);color:#fff;border:none;cursor:pointer;font-size:13px">Connect</button>
      </div>
      <div id="ws-msgs"></div>
      <div style="display:flex;gap:8px">
        <input id="ws-msg" placeholder="Type message and press Enter..." style="flex:1;font-family:monospace" onkeydown="if(event.key==='Enter')wsSend()">
        <button onclick="wsSend()" style="padding:7px 16px;background:var(--accent);color:#fff;border-radius:6px;font-weight:700;border:none;cursor:pointer">Send</button>
      </div>
    </div>
  </div></div>`);
}

function closeWS() { if (_wsConn) { _wsConn.close(); _wsConn = null; } closeModal(); }

function wsToggle() {
  if (_wsConn && _wsConn.readyState === WebSocket.OPEN) {
    _wsConn.close(); _wsConn = null;
    document.getElementById('ws-btn').textContent = 'Connect';
    document.getElementById('ws-btn').style.background = 'var(--ok)';
    wsLog('• Disconnected', 'sys');
  } else {
    const url = document.getElementById('ws-url').value;
    try {
      _wsConn = new WebSocket(url);
      wsLog(`• Connecting to ${url}...`, 'sys');
      _wsConn.onopen = () => { wsLog('✅ Connected!', 'sys'); document.getElementById('ws-btn').textContent = 'Disconnect'; document.getElementById('ws-btn').style.background = 'var(--err)'; };
      _wsConn.onmessage = e => wsLog('← ' + e.data, 'recv');
      _wsConn.onerror = () => wsLog('❌ Error', 'sys');
      _wsConn.onclose = () => wsLog('• Connection closed', 'sys');
    } catch(e) { wsLog('❌ ' + e.message, 'sys'); }
  }
}

function wsSend() {
  const msg = document.getElementById('ws-msg').value;
  if (!msg) return;
  if (!_wsConn || _wsConn.readyState !== WebSocket.OPEN) { notify('Not connected', 'error'); return; }
  _wsConn.send(msg);
  wsLog('→ ' + msg, 'sent');
  document.getElementById('ws-msg').value = '';
}

function wsLog(msg, cls) {
  const d = document.getElementById('ws-msgs');
  if (!d) return;
  const div = document.createElement('div');
  div.className = 'ws-line ' + cls;
  div.textContent = msg;
  d.appendChild(div);
  d.scrollTop = d.scrollHeight;
}

// ============================================================
// IMPORT / EXPORT
// ============================================================
function openImport() {
  openModal(`<div class="modal-bg"><div class="modal">
    <div class="mh"><span class="mh-title">⬆ Import</span><button class="m-close" onclick="closeModal()">✕</button></div>
    <div class="mb">
      <div class="fg"><label>PASTE POSTMAN COLLECTION JSON OR cURL COMMAND</label>
        <textarea id="imp-txt" style="width:100%;min-height:180px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:12px;color:var(--text1);resize:vertical;font-family:'JetBrains Mono',monospace;font-size:12px;line-height:1.6" placeholder="Paste Postman v2.1 collection JSON or curl command here..."></textarea>
      </div>
      <div class="fg"><label>OR UPLOAD FILE</label><input type="file" id="imp-file" accept=".json,.yaml,.yml" onchange="loadFile(this)"></div>
    </div>
    <div class="mf"><button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="doImport()">Import</button></div>
  </div></div>`);
}

function loadFile(input) {
  const f = input.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = e => { document.getElementById('imp-txt').value = e.target.result; };
  r.readAsText(f);
}

function doImport() {
  const text = document.getElementById('imp-txt').value.trim();
  if (!text) { notify('Nothing to import', 'error'); return; }
  if (text.toLowerCase().startsWith('curl')) { importCurl(text); closeModal(); return; }
  try {
    const data = JSON.parse(text);
    if (data.info && data.item) {
      const coll = { id: uid(), name: data.info.name || 'Imported', requests: [], desc: data.info.description || '' };
      const flat = items => items?.forEach(item => {
        if (item.request) {
          coll.requests.push({
            id: uid(), name: item.name, method: item.request.method || 'GET',
            url: typeof item.request.url === 'string' ? item.request.url : (item.request.url?.raw || ''),
            headers: (item.request.header || []).map(h => ({ id: uid(), on: !h.disabled, k: h.key, v: h.value, desc: h.description || '' })),
            rawBody: item.request.body?.raw || '',
            bodyType: item.request.body?.mode || 'none',
            preScript: item.event?.find(e => e.listen === 'prerequest')?.script?.exec?.join('\n') || '',
            testScript: item.event?.find(e => e.listen === 'test')?.script?.exec?.join('\n') || '',
          });
        }
        if (item.item) flat(item.item);
      });
      flat(data.item);
      S.collections.push(coll); save(); renderCollections(); closeModal();
      notify(`✅ Imported "${coll.name}" — ${coll.requests.length} requests`, 'success');
      return;
    }
    if (Array.isArray(data) && data[0]?.requests) {
      S.collections.push(...data); save(); renderCollections(); closeModal();
      notify(`Imported ${data.length} collections`, 'success'); return;
    }
    notify('Unrecognized format — expected Postman Collection v2.1 JSON', 'error');
  } catch(e) { notify('Invalid JSON: ' + e.message, 'error'); }
}

function importCurl(curl) {
  try {
    const mm = curl.match(/-X\s+(\w+)/i) || curl.match(/curl\s+(-[^\s]+\s+)*--request\s+(\w+)/i);
    const um = curl.match(/curl\s+(?:-[^\s]+\s+)*['"]?([^\s'"]+)['"]?/);
    const hm = [...curl.matchAll(/-H\s+['"]([^'"]+)['"]/gi)];
    const dm = curl.match(/(?:--data(?:-raw)?|-d)\s+['"]([^'"]*)['"]/i);
    const method = (mm?.[1] || 'GET').toUpperCase();
    const url = um?.[1] || '';
    const headers = hm.map(m => { const [k, ...v] = m[1].split(':'); return { id: uid(), on: true, k: k.trim(), v: v.join(':').trim(), desc: '' }; });
    const body = dm?.[1] || '';
    newTab({ method, url, name: url.substring(0, 40), headers, rawBody: body, bodyType: body ? 'raw' : 'none' });
    notify('Imported from cURL!', 'success');
  } catch(e) { notify('cURL parse error: ' + e.message, 'error'); }
}

// ============================================================
// COOKIE MANAGER
// ============================================================
function openCookies() {
  openModal(`<div class="modal-bg"><div class="modal lg">
    <div class="mh"><span class="mh-title">🍪 Cookie Manager</span><button class="m-close" onclick="closeModal()">✕</button></div>
    <div class="mb">
      <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
        <input id="ck-d" placeholder="Domain (e.g. api.example.com)" style="flex:1;min-width:160px">
        <input id="ck-n" placeholder="Name" style="width:130px">
        <input id="ck-v" placeholder="Value" style="flex:1;min-width:100px">
        <button class="btn primary" onclick="addCK()">+ Add</button>
      </div>
      <div id="ck-list">${renderCKList()}</div>
    </div>
    <div class="mf"><button class="btn danger" onclick="clearAllCK()">🗑 Clear All</button><button class="btn secondary" onclick="closeModal()">Close</button></div>
  </div></div>`);
}

function renderCKList() {
  const domains = Object.keys(S.cookies);
  if (!domains.length) return '<div class="empty"><div class="ei">🍪</div><p>No cookies stored.</p></div>';
  return domains.map(d =>
    `<div class="ck-domain"><div class="ck-domain-nm">${esc(d)}</div>` +
    Object.entries(S.cookies[d]).map(([k, v]) =>
      `<div class="ck-row"><span class="ck-name">${esc(k)}</span><span class="ck-val">${esc(v)}</span>
      <button onclick="delCK('${esc(d)}','${esc(k)}')" style="color:var(--err);margin-left:auto;background:none;border:none;cursor:pointer;font-size:12px">✕</button></div>`
    ).join('') + '</div>'
  ).join('');
}

function addCK() {
  const d = document.getElementById('ck-d').value.trim();
  const n = document.getElementById('ck-n').value.trim();
  const v = document.getElementById('ck-v').value;
  if (!d || !n) { notify('Domain and name required', 'error'); return; }
  if (!S.cookies[d]) S.cookies[d] = {};
  S.cookies[d][n] = v;
  save();
  document.getElementById('ck-list').innerHTML = renderCKList();
  notify('Cookie added!', 'success');
}

function delCK(d, n) {
  if (S.cookies[d]) { delete S.cookies[d][n]; if (!Object.keys(S.cookies[d]).length) delete S.cookies[d]; }
  save();
  document.getElementById('ck-list').innerHTML = renderCKList();
}

function clearAllCK() {
  if (!confirm('Clear all cookies?')) return;
  S.cookies = {}; save();
  document.getElementById('ck-list').innerHTML = renderCKList();
}

// ============================================================
// SETTINGS
// ============================================================
function openSettings() {
  const s = S.settings;
  openModal(`<div class="modal-bg"><div class="modal lg">
    <div class="mh"><span class="mh-title">⚙ Settings</span><button class="m-close" onclick="closeModal()">✕</button></div>
    <div class="mb">
      <div class="s-sec">
        <div class="s-sec-title">CORS PROXY</div>
        <div class="s-row">
          <div><div class="s-label">Enable CORS Proxy</div><div class="s-desc">Route requests through Cloudflare Worker to bypass browser CORS restrictions</div></div>
          <label class="toggle"><input type="checkbox" id="set-cors" ${s.corsEnabled ? 'checked' : ''} onchange="toggleCORSFromSettings()"><span class="t-slider"></span></label>
        </div>
        <div class="fg" style="margin-top:10px"><label>PROXY URL</label><input id="set-proxy" value="${esc(s.proxyUrl || 'https://square-credit-8186.donthulanithish53.workers.dev/?url=')}"></div>
        <button class="btn-s" style="margin-top:6px" onclick="testProxy()">🔍 Test Worker Connection</button>
        <span id="proxy-test-res" style="font-size:11px;margin-left:10px;color:var(--text3)"></span>
      </div>
      <div class="s-sec">
        <div class="s-sec-title">TOOLS</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn-s accent" onclick="closeModal();openGlobals()">🌐 Global Variables</button>
          <button class="btn-s accent" onclick="closeModal();openCookies()">🍪 Cookie Manager</button>
        </div>
      </div>
      <div class="s-sec">
        <div class="s-sec-title">DATA MANAGEMENT</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn-s" onclick="exportAll()">⬇ Export All Data</button>
          <button class="btn-s" onclick="importAll()">⬆ Import All Data</button>
          <button class="btn-s danger" onclick="resetAll()">🗑 Reset Everything</button>
        </div>
      </div>
      <div class="s-sec">
        <div class="s-sec-title">KEYBOARD SHORTCUTS</div>
        <div style="font-size:11px;color:var(--text3);line-height:2.2">
          <b style="color:var(--text2)">Ctrl+Enter</b> — Send &nbsp;&nbsp; <b style="color:var(--text2)">Ctrl+T</b> — New Tab &nbsp;&nbsp; <b style="color:var(--text2)">Ctrl+W</b> — Close Tab<br>
          <b style="color:var(--text2)">Ctrl+S</b> — Save &nbsp;&nbsp; <b style="color:var(--text2)">Ctrl+\\</b> — Toggle Sidebar &nbsp;&nbsp; <b style="color:var(--text2)">Esc</b> — Cancel Request
        </div>
      </div>
      <div class="s-sec">
        <div class="s-sec-title">ABOUT</div>
        <p style="font-size:12px;color:var(--text3);line-height:1.8">PostmanWeb v3.0 — Full API Platform in your browser.<br>
        All data stored locally in your browser. No server. No login required.<br>
        Worker: <span style="color:var(--accent)">square-credit-8186.donthulanithish53.workers.dev</span></p>
      </div>
    </div>
    <div class="mf"><button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveSettings()">Save Settings</button></div>
  </div></div>`);
}

function toggleCORSFromSettings() {
  const cb = document.getElementById('set-cors');
  if (cb) { S.settings.corsEnabled = cb.checked; save(); refreshCORSBtn(); }
}

async function testProxy() {
  const purl = document.getElementById('set-proxy').value.trim();
  const res = document.getElementById('proxy-test-res');
  res.textContent = '⏳ Testing...'; res.style.color = 'var(--text3)';
  try {
    const r = await fetch(purl + encodeURIComponent('https://httpbin.org/get'), { signal: AbortSignal.timeout(8000) });
    if (r.ok) { res.textContent = '✅ Worker is working!'; res.style.color = 'var(--ok)'; }
    else { res.textContent = `⚠ Worker replied: ${r.status}`; res.style.color = 'var(--warn)'; }
  } catch(e) { res.textContent = '❌ ' + e.message; res.style.color = 'var(--err)'; }
}

function saveSettings() {
  S.settings.corsEnabled = document.getElementById('set-cors').checked;
  S.settings.proxyUrl = document.getElementById('set-proxy').value.trim();
  save(); refreshCORSBtn(); closeModal();
  notify('Settings saved!', 'success');
}

function exportAll() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ collections: S.collections, envs: S.envs, globals: S.globals, history: S.history, settings: S.settings }, null, 2)], { type: 'application/json' }));
  a.download = 'postmanweb_backup.json'; a.click();
}

function importAll() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
  inp.onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
      try {
        const d = JSON.parse(ev.target.result);
        if (d.collections) S.collections = d.collections;
        if (d.envs) S.envs = d.envs;
        if (d.globals) S.globals = d.globals;
        if (d.history) S.history = d.history;
        if (d.settings) S.settings = d.settings;
        save(); renderAll();
        notify('Data imported!', 'success');
      } catch(e) { notify('Invalid file: ' + e.message, 'error'); }
    };
    r.readAsText(f);
  };
  inp.click();
}

function resetAll() {
  if (!confirm('This will permanently delete ALL your data. Are you sure?')) return;
  localStorage.clear(); location.reload();
}

// ============================================================
// RESIZE
// ============================================================
function initResize() {
  const handle = document.getElementById('resizer');
  const wrap = document.getElementById('split');
  let dragging = false, sy = 0, sh = 0;
  handle.addEventListener('mousedown', e => { dragging = true; sy = e.clientY; sh = document.getElementById('req-area').offsetHeight; document.body.style.userSelect = 'none'; });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const nh = Math.max(100, Math.min(wrap.offsetHeight - 100, sh + (e.clientY - sy)));
    document.getElementById('req-area').style.height = nh + 'px';
  });
  document.addEventListener('mouseup', () => { dragging = false; document.body.style.userSelect = ''; });
}

// ============================================================
// RENDER ALL
// ============================================================
function renderAll() { renderTabs(); renderCollections(); renderHistory(); renderEnvs(); }

// ============================================================
// INIT
// ============================================================
function init() {
  newTab();
  renderAll();
  initResize();
  refreshCORSBtn();
  refreshHistDot();

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); sendRequest(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 't') { e.preventDefault(); newTab(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'w') { e.preventDefault(); closeTab(S.activeId); }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveToCollection(); }
    if ((e.ctrlKey || e.metaKey) && e.key === '\\') { e.preventDefault(); toggleSB(); }
    if (e.key === 'Escape' && _abortCtrl) cancelReq();
  });

  // Auto-name tab from URL
  document.getElementById('url-in').addEventListener('input', e => {
    const tab = getActiveTab();
    if (tab && e.target.value) {
      tab.url = e.target.value;
      tab.name = e.target.value.replace(/^https?:\/\//, '').slice(0, 35) || 'New Request';
      renderTabs();
    }
  });

  document.getElementById('method-sel').addEventListener('change', colorMethod);
}

init();
