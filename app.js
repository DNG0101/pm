/* PostmanWeb v4.0 — Complete Application
   Worker: https://square-credit-8186.donthulanithish53.workers.dev
*/
'use strict';

// ═══════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════
const APP = {
  tabs: [],
  activeId: null,
  colls: lsGet('pw4_colls', []),
  envs: lsGet('pw4_envs', []),
  activeEnv: lsGet('pw4_aenv', null),
  history: lsGet('pw4_hist', []),
  globals: lsGet('pw4_globals', {}),
  cookies: lsGet('pw4_cookies', {}),
  mocks: lsGet('pw4_mocks', []),
  settings: lsGet('pw4_settings', {
    corsEnabled: false,
    proxyUrl: 'https://square-credit-8186.donthulanithish53.workers.dev/?url=',
    histOn: true,
    theme: 'dark',
    reqTimeout: 30000
  }),
};

let _bt = 'none';          // current body type
let _tests = [];           // test results
let _logs = [];            // console logs
let _abort = null;         // abort controller
let _ws = null;            // websocket
let _runnerActive = false; // collection runner flag

// ═══════════════════════════════════════════
// LOCAL STORAGE
// ═══════════════════════════════════════════
function lsGet(k, def) {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; }
}
function lsSave() {
  try {
    localStorage.setItem('pw4_colls', JSON.stringify(APP.colls));
    localStorage.setItem('pw4_envs', JSON.stringify(APP.envs));
    localStorage.setItem('pw4_aenv', JSON.stringify(APP.activeEnv));
    localStorage.setItem('pw4_hist', JSON.stringify(APP.history.slice(0, 500)));
    localStorage.setItem('pw4_globals', JSON.stringify(APP.globals));
    localStorage.setItem('pw4_cookies', JSON.stringify(APP.cookies));
    localStorage.setItem('pw4_mocks', JSON.stringify(APP.mocks));
    localStorage.setItem('pw4_settings', JSON.stringify(APP.settings));
  } catch (e) { console.warn('Save error', e); }
}

// ═══════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function notify(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `notif ${type}`;
  el.textContent = msg;
  document.getElementById('notifs').appendChild(el);
  setTimeout(() => el.remove(), 3800);
}
function openModal(html) {
  const c = document.getElementById('modals');
  c.innerHTML = html;
  c.querySelector('.mbg')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
}
function closeModal() { document.getElementById('modals').innerHTML = ''; }

// ═══════════════════════════════════════════
// VARIABLE RESOLUTION
// ═══════════════════════════════════════════
function getEnv() { return APP.envs.find(e => e.id === APP.activeEnv) || null; }
function getEnvVars() { return getEnv()?.variables || {}; }

const DYNAMIC_VARS = {
  '$timestamp':       () => Date.now().toString(),
  '$isoTimestamp':    () => new Date().toISOString(),
  '$randomInt':       () => Math.floor(Math.random() * 1000).toString(),
  '$randomFloat':     () => (Math.random() * 100).toFixed(4),
  '$guid':            () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c==='x'?r:(r&0x3|0x8)).toString(16); }),
  '$randomBoolean':   () => (Math.random() > .5).toString(),
  '$randomAlphaNumeric': () => Math.random().toString(36).slice(2, 10),
  '$randomFirstName': () => ['Alice','Bob','Charlie','Diana','Eve','Frank','Grace','Hank','Ivy','Jack'][Math.floor(Math.random()*10)],
  '$randomLastName':  () => ['Smith','Jones','Williams','Brown','Davis','Taylor','Wilson','Moore'][Math.floor(Math.random()*8)],
  '$randomFullName':  () => `${DYNAMIC_VARS['$randomFirstName']()} ${DYNAMIC_VARS['$randomLastName']()}`,
  '$randomEmail':     () => `${Math.random().toString(36).slice(2,8)}@example.com`,
  '$randomPassword':  () => btoa(Math.random().toString()).slice(0, 12),
  '$randomPhoneNumber': () => `+1-${Math.floor(Math.random()*900+100)}-${Math.floor(Math.random()*900+100)}-${Math.floor(Math.random()*9000+1000)}`,
  '$randomUrl':       () => `https://example-${Math.random().toString(36).slice(2,7)}.com`,
  '$randomUserName':  () => `user_${Math.random().toString(36).slice(2,8)}`,
  '$randomWord':      () => ['apple','brave','cloud','delta','eagle','forge','giant','honor'][Math.floor(Math.random()*8)],
  '$randomLoremWord': () => ['Lorem','ipsum','dolor','sit','amet','consectetur'][Math.floor(Math.random()*6)],
  '$randomColor':     () => `#${Math.floor(Math.random()*0xFFFFFF).toString(16).padStart(6,'0')}`,
  '$randomHexColor':  () => `#${Math.floor(Math.random()*0xFFFFFF).toString(16).padStart(6,'0')}`,
};

function resolveStr(str) {
  if (!str) return str;
  const env = getEnvVars();
  const tab = getTab();
  // Dynamic vars
  str = str.replace(/\{\{\s*(\$[^}\s]+)\s*\}\}/g, (m, k) => {
    const fn = DYNAMIC_VARS[k];
    return fn ? fn() : m;
  });
  // Named vars
  str = str.replace(/\{\{([^}]+)\}\}/g, (m, k) => {
    k = k.trim();
    return env[k] ?? APP.globals[k] ?? tab?.collVars?.[k] ?? m;
  });
  return str;
}

// ═══════════════════════════════════════════
// PM SANDBOX (full pm.* API)
// ═══════════════════════════════════════════
function buildPM(resp) {
  _tests = [];
  _logs = [];
  const env = getEnv();
  const tab = getTab();

  // Chai-like expect
  function expect(val) {
    const A = {
      _v: val,
      not: null,
      to: null,
      equal: x => { if (val !== x) throw new Error(`Expected ${JSON.stringify(x)}, got ${JSON.stringify(val)}`); return A; },
      eql: x => { if (JSON.stringify(val) !== JSON.stringify(x)) throw new Error(`Deep equal failed: expected ${JSON.stringify(x)}`); return A; },
      include: x => { if (!String(val).includes(String(x))) throw new Error(`Expected "${val}" to include "${x}"`); return A; },
      match: r => { if (!r.test(String(val))) throw new Error(`Expected "${val}" to match ${r}`); return A; },
      be: {
        ok: () => { if (!val) throw new Error('Expected truthy'); return A; },
        a: t => { if (typeof val !== t) throw new Error(`Expected type "${t}", got "${typeof val}"`); return A; },
        an: t => { if (typeof val !== t) throw new Error(`Expected type "${t}", got "${typeof val}"`); return A; },
        true: () => { if (val !== true) throw new Error(`Expected true, got ${JSON.stringify(val)}`); return A; },
        false: () => { if (val !== false) throw new Error(`Expected false, got ${JSON.stringify(val)}`); return A; },
        null: () => { if (val !== null) throw new Error(`Expected null`); return A; },
        undefined: () => { if (val !== undefined) throw new Error(`Expected undefined`); return A; },
        below: n => { if (!(val < n)) throw new Error(`Expected ${val} to be below ${n}`); return A; },
        above: n => { if (!(val > n)) throw new Error(`Expected ${val} to be above ${n}`); return A; },
        least: n => { if (!(val >= n)) throw new Error(`Expected ${val} >= ${n}`); return A; },
        most: n => { if (!(val <= n)) throw new Error(`Expected ${val} <= ${n}`); return A; },
        empty: () => { if (val && val.length > 0) throw new Error('Expected empty'); return A; },
        within: (lo, hi) => { if (val < lo || val > hi) throw new Error(`Expected ${val} within [${lo}, ${hi}]`); return A; },
        instanceof: cls => { if (!(val instanceof cls)) throw new Error(`Expected instanceof ${cls.name}`); return A; },
      },
      have: {
        property: (p, v) => {
          if (typeof val !== 'object' || !(p in val)) throw new Error(`Expected property "${p}"`);
          if (v !== undefined && val[p] !== v) throw new Error(`Expected .${p} = ${JSON.stringify(v)}, got ${JSON.stringify(val[p])}`);
          return A;
        },
        length: n => { if (!val || val.length !== n) throw new Error(`Expected length ${n}, got ${val?.length}`); return A; },
        lengthOf: n => { if (!val || val.length !== n) throw new Error(`Expected length ${n}`); return A; },
        status: code => { if (resp?.status !== code) throw new Error(`Expected status ${code}, got ${resp?.status}`); return A; },
        header: (k, v) => {
          const hv = resp?._headers?.[k.toLowerCase()];
          if (!hv) throw new Error(`Expected header "${k}"`);
          if (v && !hv.includes(v)) throw new Error(`Expected header "${k}" to include "${v}"`);
          return A;
        },
        jsonBody: path => {
          let body; try { body = JSON.parse(resp?._body); } catch { throw new Error('Response is not JSON'); }
          const parts = path.split('.');
          let v = body;
          for (const p of parts) { v = v?.[p]; if (v === undefined) throw new Error(`Path "${path}" not found`); }
          return A;
        },
        body: {
          that: {
            includes: s => { if (!resp?._body?.includes(s)) throw new Error(`Body doesn't include "${s}"`); return A; },
          }
        },
        members: arr => {
          if (!Array.isArray(val)) throw new Error('Expected array');
          for (const m of arr) { if (!val.includes(m)) throw new Error(`Expected member ${JSON.stringify(m)}`); }
          return A;
        },
        keys: (...ks) => {
          const keys = Array.isArray(ks[0]) ? ks[0] : ks;
          for (const k of keys) { if (typeof val !== 'object' || !(k in val)) throw new Error(`Expected key "${k}"`); }
          return A;
        },
      },
      deep: {
        equal: x => { if (JSON.stringify(val) !== JSON.stringify(x)) throw new Error('Deep equal failed'); return A; },
        include: x => {
          if (typeof val === 'object' && val !== null) {
            for (const [k, v] of Object.entries(x)) { if (JSON.stringify(val[k]) !== JSON.stringify(v)) throw new Error(`Expected .${k} = ${JSON.stringify(v)}`); }
          } else throw new Error('deep.include requires object');
          return A;
        },
      },
    };
    A.not = new Proxy({}, { get: (_, p) => {
      const orig = A[p];
      if (typeof orig === 'function') return (...args) => { let threw = false; try { orig(...args); } catch { threw = true; } if (!threw) throw new Error(`Expected NOT to pass: ${p}(${args.map(JSON.stringify).join(',')})`); return A; };
      if (typeof orig === 'object' && orig !== null) return new Proxy(orig, { get: (_, p2) => {
        const fn = orig[p2];
        if (typeof fn === 'function') return (...args) => { let threw = false; try { fn(...args); } catch { threw = true; } if (!threw) throw new Error(`Expected NOT ${p}.${p2}(${args.map(JSON.stringify).join(',')})`); return A; };
      }});
      return orig;
    }});
    A.to = A;
    A.and = A;
    return A;
  }

  const pm = {
    // Test runner
    test: (name, fn) => {
      try { fn(); _tests.push({ name, pass: true }); }
      catch (e) { _tests.push({ name, pass: false, error: e.message }); }
    },
    expect,

    // Response object
    response: resp ? (() => {
      const r = {
        code: resp.status,
        status: resp.statusText,
        responseTime: resp._time || 0,
        size: resp._size || 0,
        json: () => {
          try { return JSON.parse(resp._body); }
          catch (e) { throw new Error('Response is not valid JSON: ' + e.message); }
        },
        text: () => resp._body,
        headers: {
          get: k => resp._headers?.[k.toLowerCase()] || null,
          has: k => !!resp._headers?.[k.toLowerCase()],
          toObject: () => ({ ...resp._headers }),
        },
        cookies: {
          get: k => {
            try { const domain = new URL(document.getElementById('urlin').value).hostname; return APP.cookies[domain]?.[k] || null; } catch { return null; }
          }
        },
        to: {
          have: {
            status: code => { if (resp.status !== code) throw new Error(`Expected status ${code}, got ${resp.status}`); },
            header: (k, v) => {
              const hv = resp._headers?.[k.toLowerCase()];
              if (!hv) throw new Error(`Missing header: ${k}`);
              if (v && !hv.includes(v)) throw new Error(`Header "${k}" does not match "${v}"`);
            },
            body: { that: { includes: s => { if (!resp._body.includes(s)) throw new Error(`Body doesn't include: ${s}`); } } },
            jsonBody: path => {
              const body = JSON.parse(resp._body);
              const parts = path.split('.');
              let v = body;
              for (const p of parts) { v = v?.[p]; if (v === undefined) throw new Error(`Path "${path}" not found`); }
            },
          },
          be: {
            ok: () => { if (resp.status < 200 || resp.status >= 300) throw new Error(`Expected 2xx, got ${resp.status}`); }
          },
          not: {
            have: {
              status: code => { if (resp.status === code) throw new Error(`Expected status NOT ${code}`); }
            }
          }
        },
      };
      // pm.response.to.have.status can also be called directly
      r.to.have.status = (code) => { if (resp.status !== code) throw new Error(`Expected status ${code}, got ${resp.status}`); };
      return r;
    })() : {},

    // Request object
    request: {
      url: {
        toString: () => document.getElementById('urlin')?.value || '',
        getHost: () => { try { return new URL(document.getElementById('urlin').value).hostname; } catch { return ''; } },
        getPath: () => { try { return new URL(document.getElementById('urlin').value).pathname; } catch { return ''; } },
        getQueryString: () => { try { return new URL(document.getElementById('urlin').value).search.slice(1); } catch { return ''; } },
      },
      method: document.getElementById('msel')?.value || 'GET',
      headers: {
        add: (h) => addKVToTable('headers', h.key||'', h.value||'', h.description||''),
        remove: (k) => { /* TODO: remove from headers table */ },
        get: (k) => { const rows = readKV('headers'); const r = rows.find(r => r.k.toLowerCase() === k.toLowerCase()); return r?.v || null; },
        has: (k) => readKV('headers').some(r => r.k.toLowerCase() === k.toLowerCase()),
        upsert: (h) => addKVToTable('headers', h.key, h.value, ''),
        toObject: () => Object.fromEntries(readKV('headers').filter(r=>r.on && r.k).map(r=>[r.k, r.v])),
      },
      body: {
        raw: document.getElementById('coderaw')?.value || '',
        urlencoded: readKV('urlenc'),
        formData: readKV('form'),
        get mode() { return _bt; },
      },
      auth: { type: document.getElementById('authsel')?.value || 'none' },
    },

    // Environment
    environment: {
      get: k => env?.variables?.[k] ?? null,
      set: (k, v) => { if (!env) return; env.variables[k] = String(v); lsSave(); },
      unset: k => { if (env) { delete env.variables[k]; lsSave(); } },
      has: k => !!env?.variables?.[k],
      clear: () => { if (env) { env.variables = {}; lsSave(); } },
      toObject: () => ({ ...env?.variables }),
      replaceIn: s => resolveStr(s),
    },

    // Globals
    globals: {
      get: k => APP.globals[k] ?? null,
      set: (k, v) => { APP.globals[k] = String(v); lsSave(); },
      unset: k => { delete APP.globals[k]; lsSave(); },
      has: k => k in APP.globals,
      clear: () => { APP.globals = {}; lsSave(); },
      toObject: () => ({ ...APP.globals }),
    },

    // Variables (unified)
    variables: {
      get: k => env?.variables?.[k] ?? APP.globals[k] ?? tab?.collVars?.[k] ?? null,
      set: (k, v) => {
        if (env) { env.variables[k] = String(v); lsSave(); }
        else { APP.globals[k] = String(v); lsSave(); }
      },
      has: k => !!(env?.variables?.[k] ?? APP.globals[k]),
      replaceIn: s => resolveStr(s),
    },

    // Collection variables
    collectionVariables: {
      get: k => tab?.collVars?.[k] ?? null,
      set: (k, v) => { if (tab) { tab.collVars = tab.collVars || {}; tab.collVars[k] = String(v); } },
      unset: k => { if (tab?.collVars) delete tab.collVars[k]; },
      has: k => !!(tab?.collVars?.[k]),
      clear: () => { if (tab) tab.collVars = {}; },
      toObject: () => ({ ...tab?.collVars }),
    },

    // Cookies
    cookies: {
      get: (url, name) => {
        try { const d = new URL(url).hostname; return APP.cookies[d]?.[name] || null; } catch { return null; }
      },
      jar: () => ({ ...APP.cookies }),
    },

    // sendRequest
    sendRequest: (reqOpts, cb) => {
      const useProxy = APP.settings.corsEnabled;
      const purl = APP.settings.proxyUrl;
      const target = useProxy ? purl + encodeURIComponent(reqOpts.url) : reqOpts.url;
      const opts = { method: reqOpts.method || 'GET', headers: reqOpts.header || reqOpts.headers || {} };
      if (reqOpts.body) opts.body = typeof reqOpts.body === 'string' ? reqOpts.body : JSON.stringify(reqOpts.body);
      fetch(target, opts)
        .then(r => r.text().then(body => cb && cb(null, { code: r.status, status: r.statusText, body, json: () => JSON.parse(body), text: () => body })))
        .catch(e => cb && cb(e));
    },

    // Info
    info: {
      get requestId() { return uid(); },
      get iteration() { return 0; },
      get eventName() { return 'test'; },
    },

    // Iterationdata (for collection runner)
    iterationData: {
      get: k => tab?._runData?.[k] ?? null,
      has: k => !!(tab?._runData?.[k]),
      toObject: () => ({ ...tab?._runData }),
    },

    // Visualizer (stub)
    visualizer: {
      set: (template, data) => { _logs.push({ type: 'info', msg: '[Visualizer] Template set' }); },
      clear: () => {},
    },

    // Execution (stub)
    execution: {
      skip: () => { throw Object.assign(new Error('skip'), { skip: true }); },
      abort: msg => { throw Object.assign(new Error(msg || 'abort'), { abort: true }); },
    },
  };

  return { pm, expect };
}

function runScript(code, pmObj) {
  if (!code?.trim()) return;
  const con = {
    log: (...a) => _logs.push({ type: 'log', msg: a.map(x => typeof x === 'object' ? JSON.stringify(x, null, 2) : String(x)).join(' ') }),
    warn: (...a) => _logs.push({ type: 'warn', msg: a.map(String).join(' ') }),
    error: (...a) => _logs.push({ type: 'error', msg: a.map(String).join(' ') }),
    info: (...a) => _logs.push({ type: 'info', msg: a.map(String).join(' ') }),
    table: data => _logs.push({ type: 'log', msg: '[Table]\n' + (Array.isArray(data) ? data.map(JSON.stringify).join('\n') : JSON.stringify(data, null, 2)) }),
    group: label => _logs.push({ type: 'info', msg: `▼ ${label}` }),
    groupEnd: () => {},
    time: label => _logs.push({ type: 'info', msg: `⏱ ${label}` }),
    timeEnd: label => _logs.push({ type: 'info', msg: `⏱ ${label} end` }),
  };
  try {
    new Function('pm', 'console', 'expect', 'require', code)(
      pmObj.pm, con, pmObj.expect,
      name => { _logs.push({ type: 'warn', msg: `require('${name}') is not supported in browser` }); return {}; }
    );
  } catch (e) {
    if (e.skip || e.abort) return;
    _logs.push({ type: 'error', msg: `Script error: ${e.message}` });
  }
}

// ═══════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════
function mkTab(d = {}) {
  return {
    id: uid(),
    name: d.name || 'New Request',
    method: d.method || 'GET',
    url: d.url || '',
    params: d.params || [],
    headers: d.headers || [],
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
    description: d.description || '',
    docs: d.docs || '',
  };
}

function getTab() { return APP.tabs.find(t => t.id === APP.activeId); }

function newTab(d) {
  const t = mkTab(d);
  APP.tabs.push(t);
  APP.activeId = t.id;
  renderTabs();
  loadTabUI(t);
  showResp(null);
}

function switchTab(id) {
  saveTabUI();
  APP.activeId = id;
  const t = APP.tabs.find(t => t.id === id);
  loadTabUI(t);
  renderTabs();
  showResp(t?.response);
}

function closeTab(id, e) {
  if (e) e.stopPropagation();
  const idx = APP.tabs.findIndex(t => t.id === id);
  if (idx === -1) return;
  APP.tabs.splice(idx, 1);
  if (!APP.tabs.length) { newTab(); return; }
  APP.activeId = APP.tabs[Math.min(idx, APP.tabs.length - 1)].id;
  const t = APP.tabs.find(t => t.id === APP.activeId);
  loadTabUI(t);
  showResp(t?.response);
  renderTabs();
}

function renderTabs() {
  const mc = { GET:'var(--get)', POST:'var(--post)', PUT:'var(--put)', PATCH:'var(--patch)', DELETE:'var(--delete)', HEAD:'var(--head)', OPTIONS:'var(--options)' };
  document.getElementById('tabsbar').innerHTML = APP.tabs.map(t =>
    `<div class="ti${t.id===APP.activeId?' act':''}" onclick="switchTab('${t.id}')">
      <span class="tm" style="color:${mc[t.method]||'var(--t2)'}">${t.method}</span>
      <span class="tn">${esc(t.name)}</span>
      <button class="tc" onclick="closeTab('${t.id}',event)">✕</button>
    </div>`
  ).join('');
}

function saveTabUI() {
  const t = getTab();
  if (!t) return;
  t.method = document.getElementById('msel').value;
  t.url = document.getElementById('urlin').value;
  t.bodyType = _bt;
  t.rawBody = document.getElementById('coderaw')?.value || '';
  t.rawFmt = document.getElementById('rawfmt')?.value || 'json';
  t.gqlQ = document.getElementById('gqlq')?.value || '';
  t.gqlV = document.getElementById('gqlv')?.value || '';
  t.authType = document.getElementById('authsel')?.value || 'none';
  t.authData = readAuthData();
  t.preScript = document.getElementById('prescr')?.value || '';
  t.testScript = document.getElementById('testscr')?.value || '';
  t.params = readKV('params');
  t.headers = readKV('headers');
  t.urlEncoded = readKV('urlenc');
  t.formData = readFormData();
  t.description = document.getElementById('req-desc')?.value || '';
}

function loadTabUI(t) {
  if (!t) return;
  document.getElementById('msel').value = t.method;
  document.getElementById('urlin').value = t.url;
  loadKV('params', t.params);
  loadKV('headers', t.headers);
  loadKV('urlenc', t.urlEncoded || []);
  loadFormData(t.formData || []);
  setBodyType(t.bodyType || 'none');
  document.getElementById('coderaw').value = t.rawBody || '';
  document.getElementById('rawfmt').value = t.rawFmt || 'json';
  document.getElementById('gqlq').value = t.gqlQ || '';
  document.getElementById('gqlv').value = t.gqlV || '';
  document.getElementById('authsel').value = t.authType || 'none';
  document.getElementById('prescr').value = t.preScript || '';
  document.getElementById('testscr').value = t.testScript || '';
  if (document.getElementById('req-desc')) document.getElementById('req-desc').value = t.description || '';
  renderAuthFields(t.authData || {});
  colorMethod();
}

// ═══════════════════════════════════════════
// KV TABLES
// ═══════════════════════════════════════════
function addKVRow(type, k = '', v = '', desc = '', on = true) {
  const tbody = document.getElementById(`kv-${type}`);
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.dataset.id = uid();
  tr.innerHTML = `
    <td><input type="checkbox" class="kvc" ${on?'checked':''}></td>
    <td><input type="text" placeholder="Key" value="${esc(k)}"></td>
    <td><input type="text" placeholder="Value" value="${esc(v)}"></td>
    <td><input type="text" placeholder="Description" value="${esc(desc)}"></td>
    <td><button class="kvd" onclick="this.closest('tr').remove()">✕</button></td>`;
  tbody.appendChild(tr);
}

function addKVToTable(type, k, v, desc = '') {
  addKVRow(type, k, v, desc, true);
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
  const tbody = document.getElementById(`kv-${type}`);
  if (!tbody) return;
  tbody.innerHTML = '';
  rows.forEach(r => addKVRow(type, r.k || r.key || '', r.v || r.value || '', r.desc || r.description || '', r.on !== false && r.enabled !== false));
  if (!rows.length) addKVRow(type);
}

function addFormRow(k = '', v = '', t2 = 'text') {
  const tbody = document.getElementById('kv-form');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="checkbox" class="kvc" checked></td>
    <td><input type="text" placeholder="Key" value="${esc(k)}"></td>
    <td><input type="text" placeholder="Value or file" value="${esc(v)}"></td>
    <td><select><option value="text"${t2==='text'?' selected':''}>Text</option><option value="file"${t2==='file'?' selected':''}>File</option></select></td>
    <td><button class="kvd" onclick="this.closest('tr').remove()">✕</button></td>`;
  tbody.appendChild(tr);
}

function readFormData() {
  const rows = [];
  document.querySelectorAll('#kv-form tr').forEach(tr => {
    const inp = tr.querySelectorAll('input, select');
    if (inp.length >= 4) rows.push({ on: inp[0].checked, k: inp[1].value, v: inp[2].value, type: inp[3].value });
  });
  return rows;
}

function loadFormData(rows = []) {
  const tbody = document.getElementById('kv-form');
  if (!tbody) return;
  tbody.innerHTML = '';
  rows.forEach(r => addFormRow(r.k, r.v, r.type));
  if (!rows.length) addFormRow();
}

// ═══════════════════════════════════════════
// BODY TYPE
// ═══════════════════════════════════════════
function setBodyType(type) {
  _bt = type;
  document.querySelectorAll('.bbtn').forEach(b => b.classList.toggle('act', b.dataset.type === type));
  ['none','form','urlenc','raw','binary','graphql','grpc'].forEach(t => {
    const el = document.getElementById(`body-${t}`);
    if (el) el.style.display = t === type ? 'block' : 'none';
  });
}

// ═══════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════
const AUTH_HTML = {
  none: '<p style="color:var(--t3);font-size:12px">This request uses no authorization.</p>',
  bearer: `<div class="af2"><label>TOKEN</label><input id="a-tok" type="text" placeholder="Enter bearer token..."></div>`,
  apikey: `<div class="af2"><label>KEY NAME</label><input id="a-kname" type="text" placeholder="X-API-Key"></div><div class="af2"><label>KEY VALUE</label><input id="a-kval" type="text" placeholder="your-api-key-value"></div><div class="af2"><label>ADD TO</label><select id="a-kin"><option value="header">Header</option><option value="query">Query Params</option></select></div>`,
  basic: `<div class="af2"><label>USERNAME</label><input id="a-bu" type="text" placeholder="username"></div><div class="af2"><label>PASSWORD</label><input id="a-bp" type="password" placeholder="password"></div>`,
  digest: `<div class="af2"><label>USERNAME</label><input id="a-du" type="text" placeholder="username"></div><div class="af2"><label>PASSWORD</label><input id="a-dp" type="password" placeholder="password"></div><div class="af2"><label>REALM</label><input id="a-drealm" type="text" placeholder="optional realm"></div><div class="af2"><label>NONCE</label><input id="a-dnonce" type="text" placeholder="optional nonce"></div>`,
  oauth1: `<div class="af2"><label>CONSUMER KEY</label><input id="a-o1ck" type="text" placeholder="Consumer Key"></div><div class="af2"><label>CONSUMER SECRET</label><input id="a-o1cs" type="text" placeholder="Consumer Secret"></div><div class="af2"><label>ACCESS TOKEN</label><input id="a-o1at" type="text" placeholder="Access Token"></div><div class="af2"><label>TOKEN SECRET</label><input id="a-o1ts" type="text" placeholder="Token Secret"></div><div class="af2"><label>SIGNATURE METHOD</label><select id="a-o1sig"><option>HMAC-SHA1</option><option>HMAC-SHA256</option><option>RSA-SHA1</option><option>PLAINTEXT</option></select></div>`,
  oauth2: `<div class="af2"><label>ACCESS TOKEN</label><input id="a-o2tok" type="text" placeholder="Paste access token here"></div><div class="af2"><label>TOKEN TYPE / PREFIX</label><input id="a-o2pre" type="text" value="Bearer" placeholder="Bearer"></div><div style="margin-top:10px;padding:10px;background:var(--bg3);border-radius:var(--r);font-size:11px;color:var(--t3)">For OAuth 2.0, obtain a token from your authorization server, then paste it above.</div>`,
  hawk: `<div class="af2"><label>HAWK AUTH ID</label><input id="a-hid" type="text" placeholder="Hawk Auth ID"></div><div class="af2"><label>HAWK AUTH KEY</label><input id="a-hkey" type="text" placeholder="Hawk Auth Key"></div><div class="af2"><label>ALGORITHM</label><select id="a-halg"><option value="sha256">SHA-256</option><option value="sha1">SHA-1</option></select></div><div class="af2"><label>EXT DATA</label><input id="a-hext" type="text" placeholder="Optional ext data"></div>`,
  aws: `<div class="af2"><label>ACCESS KEY ID</label><input id="a-awsak" type="text" placeholder="AWS Access Key ID"></div><div class="af2"><label>SECRET ACCESS KEY</label><input id="a-awssk" type="password" placeholder="AWS Secret Access Key"></div><div class="af2"><label>AWS REGION</label><input id="a-awsr" type="text" value="us-east-1" placeholder="us-east-1"></div><div class="af2"><label>SERVICE NAME</label><input id="a-awssvc" type="text" value="execute-api" placeholder="execute-api"></div><div class="af2"><label>SESSION TOKEN (optional)</label><input id="a-awssess" type="text" placeholder="Session token if using STS"></div>`,
  ntlm: `<div class="af2"><label>USERNAME</label><input id="a-nu" type="text" placeholder="DOMAIN\\username or username"></div><div class="af2"><label>PASSWORD</label><input id="a-np" type="password" placeholder="password"></div><div class="af2"><label>DOMAIN</label><input id="a-nd" type="text" placeholder="DOMAIN (optional)"></div><div class="af2"><label>WORKSTATION</label><input id="a-nw" type="text" placeholder="Workstation (optional)"></div>`,
};

function renderAuthFields(data = {}) {
  const type = document.getElementById('authsel')?.value || 'none';
  document.getElementById('authfields').innerHTML = AUTH_HTML[type] || '';
  // Restore saved values
  const t = getTab();
  const ad = data || t?.authData || {};
  const map = {
    bearer: ['a-tok'],
    basic: ['a-bu', 'a-bp'],
    apikey: ['a-kname', 'a-kval'],
    oauth2: ['a-o2tok', 'a-o2pre'],
    aws: ['a-awsak', 'a-awssk', 'a-awsr', 'a-awssvc', 'a-awssess'],
    oauth1: ['a-o1ck', 'a-o1cs', 'a-o1at', 'a-o1ts'],
    hawk: ['a-hid', 'a-hkey', 'a-hext'],
    ntlm: ['a-nu', 'a-np', 'a-nd', 'a-nw'],
    digest: ['a-du', 'a-dp', 'a-drealm', 'a-dnonce'],
  };
  for (const id of (map[type] || [])) {
    const el = document.getElementById(id);
    if (el && ad[id] !== undefined) el.value = ad[id];
  }
}

function readAuthData() {
  const d = {};
  document.querySelectorAll('#authfields input, #authfields select').forEach(el => { if (el.id) d[el.id] = el.value; });
  return d;
}

function getAuthHeaders() {
  const type = document.getElementById('authsel')?.value;
  const h = {};
  if (type === 'bearer') {
    const tok = document.getElementById('a-tok')?.value;
    if (tok) h['Authorization'] = `Bearer ${tok}`;
  } else if (type === 'basic') {
    const u = document.getElementById('a-bu')?.value || '';
    const p = document.getElementById('a-bp')?.value || '';
    if (u) h['Authorization'] = 'Basic ' + btoa(`${u}:${p}`);
  } else if (type === 'apikey') {
    const where = document.getElementById('a-kin')?.value;
    if (where === 'header') {
      const k = document.getElementById('a-kname')?.value;
      const v = document.getElementById('a-kval')?.value;
      if (k && v) h[k] = v;
    }
  } else if (type === 'oauth2') {
    const tok = document.getElementById('a-o2tok')?.value;
    const pre = document.getElementById('a-o2pre')?.value || 'Bearer';
    if (tok) h['Authorization'] = `${pre} ${tok}`;
  } else if (type === 'hawk') {
    // Hawk signing is complex — provide header hint
    const id = document.getElementById('a-hid')?.value;
    const key = document.getElementById('a-hkey')?.value;
    if (id && key) {
      // Simplified Hawk — in real Postman this is server-signed
      const ts = Math.floor(Date.now() / 1000);
      const nonce = Math.random().toString(36).slice(2, 8);
      h['Authorization'] = `Hawk id="${id}", ts="${ts}", nonce="${nonce}", mac="[computed]"`;
    }
  }
  return h;
}

function getAuthQP() {
  const type = document.getElementById('authsel')?.value;
  const p = {};
  if (type === 'apikey') {
    const where = document.getElementById('a-kin')?.value;
    if (where === 'query') {
      const k = document.getElementById('a-kname')?.value;
      const v = document.getElementById('a-kval')?.value;
      if (k && v) p[k] = v;
    }
  }
  return p;
}

function colorMethod() {
  const sel = document.getElementById('msel');
  const colors = { GET:'var(--get)', POST:'var(--post)', PUT:'var(--put)', PATCH:'var(--patch)', DELETE:'var(--delete)', HEAD:'var(--head)', OPTIONS:'var(--options)' };
  sel.style.color = colors[sel.value] || 'var(--t1)';
  const t = getTab();
  if (t) { t.method = sel.value; renderTabs(); }
}

// ═══════════════════════════════════════════
// CORS BUTTON
// ═══════════════════════════════════════════
function toggleCORS() {
  APP.settings.corsEnabled = !APP.settings.corsEnabled;
  if (!APP.settings.proxyUrl) APP.settings.proxyUrl = 'https://square-credit-8186.donthulanithish53.workers.dev/?url=';
  lsSave();
  refreshCORSBtn();
  notify(APP.settings.corsEnabled ? '⚡ CORS Proxy ON — requests now work!' : '🔴 CORS Proxy OFF', APP.settings.corsEnabled ? 'success' : 'info');
}

function refreshCORSBtn() {
  const btn = document.getElementById('cors-btn');
  if (!btn) return;
  btn.textContent = APP.settings.corsEnabled ? '⚡ CORS: ON' : '⚡ CORS: OFF';
  btn.classList.toggle('on', APP.settings.corsEnabled);
}

// ═══════════════════════════════════════════
// SEND REQUEST
// ═══════════════════════════════════════════
function cancelReq() {
  _abort?.abort();
  document.getElementById('cancelbtn').style.display = 'none';
  const btn = document.getElementById('sbtn');
  btn.disabled = false;
  btn.textContent = 'Send ➤';
}

async function sendRequest() {
  saveTabUI();
  const tab = getTab();
  const method = document.getElementById('msel').value;
  const rawUrl = document.getElementById('urlin').value.trim();
  if (!rawUrl) { notify('Please enter a URL', 'error'); return; }

  // Pre-request script
  const preCode = document.getElementById('prescr').value;
  if (preCode.trim()) {
    const pmObj = buildPM(null);
    runScript(preCode, pmObj);
    flushConsole();
  }

  // Resolve variables
  const url = resolveStr(rawUrl);
  const paramRows = readKV('params').filter(r => r.on && r.k);
  const hdrRows = readKV('headers').filter(r => r.on && r.k);
  const authH = getAuthHeaders();
  const authQP = getAuthQP();

  // Build final URL
  let finalUrl = url;
  const qpMap = {};
  paramRows.forEach(r => { qpMap[resolveStr(r.k)] = resolveStr(r.v); });
  Object.assign(qpMap, authQP);
  const qpStr = new URLSearchParams(qpMap).toString();
  if (qpStr) finalUrl += (url.includes('?') ? '&' : '?') + qpStr;

  // Headers
  const headers = {};
  hdrRows.forEach(r => { headers[resolveStr(r.k)] = resolveStr(r.v); });
  Object.assign(headers, authH);

  // Body
  let body = null;
  if (_bt === 'raw') {
    body = resolveStr(document.getElementById('coderaw').value);
    if (!headers['Content-Type']) {
      const fmtMap = { json:'application/json', xml:'application/xml', html:'text/html', text:'text/plain', javascript:'application/javascript' };
      headers['Content-Type'] = fmtMap[document.getElementById('rawfmt').value] || 'text/plain';
    }
  } else if (_bt === 'urlenc') {
    const rows = readKV('urlenc').filter(r => r.on && r.k);
    body = rows.map(r => `${encodeURIComponent(resolveStr(r.k))}=${encodeURIComponent(resolveStr(r.v))}`).join('&');
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  } else if (_bt === 'form') {
    const fd = new FormData();
    document.querySelectorAll('#kv-form tr').forEach(tr => {
      const inp = tr.querySelectorAll('input, select');
      if (!inp[0]?.checked || !inp[1]?.value) return;
      if (inp[3]?.value === 'file') {
        const fileInput = inp[2];
        if (fileInput?.files?.[0]) fd.append(inp[1].value, fileInput.files[0]);
      } else {
        fd.append(inp[1].value, inp[2]?.value || '');
      }
    });
    body = fd;
    // Don't set Content-Type for FormData — browser sets it with boundary
    delete headers['Content-Type'];
  } else if (_bt === 'graphql') {
    let vars = {};
    try { vars = JSON.parse(document.getElementById('gqlv').value || '{}'); } catch {}
    body = JSON.stringify({ query: document.getElementById('gqlq').value, variables: vars });
    if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
  } else if (_bt === 'binary') {
    const f = document.getElementById('binfile')?.files?.[0];
    if (f) { body = f; headers['Content-Type'] = f.type || 'application/octet-stream'; }
  }

  // Proxy settings
  const useProxy = APP.settings.corsEnabled;
  const proxyUrl = APP.settings.proxyUrl || 'https://square-credit-8186.donthulanithish53.workers.dev/?url=';
  const fetchUrl = useProxy ? proxyUrl + encodeURIComponent(finalUrl) : finalUrl;

  // UI
  const sbtn = document.getElementById('sbtn');
  sbtn.disabled = true;
  sbtn.textContent = 'Sending…';
  document.getElementById('cancelbtn').style.display = '';
  const t0 = Date.now();
  _abort = new AbortController();

  try {
    const fetchOpts = { method, headers, signal: _abort.signal, redirect: 'follow' };
    if (body !== null && !['GET', 'HEAD'].includes(method)) fetchOpts.body = body;

    const resp = await fetch(fetchUrl, fetchOpts);
    const elapsed = Date.now() - t0;
    const respText = await resp.text();
    const respHdrs = {};
    resp.headers.forEach((v, k) => { respHdrs[k.toLowerCase()] = v; });
    const size = new Blob([respText]).size;

    // Store cookies
    try {
      const domain = new URL(finalUrl).hostname;
      const sc = resp.headers.get('set-cookie');
      if (sc) {
        if (!APP.cookies[domain]) APP.cookies[domain] = {};
        // Parse multiple cookies
        sc.split(',').forEach(c => {
          const [kv] = c.trim().split(';');
          const eqIdx = kv.indexOf('=');
          if (eqIdx > 0) {
            const k = kv.slice(0, eqIdx).trim();
            const v = kv.slice(eqIdx + 1).trim();
            APP.cookies[domain][k] = v;
          }
        });
        lsSave();
      }
    } catch {}

    const responseObj = { status: resp.status, statusText: resp.statusText, _body: respText, _headers: respHdrs, _time: elapsed, _size: size };
    if (tab) tab.response = responseObj;

    // Test script
    _tests = [];
    const testCode = document.getElementById('testscr').value;
    if (testCode.trim()) {
      const pmObj = buildPM(responseObj);
      runScript(testCode, pmObj);
    }

    addHistory({ method, url: rawUrl, status: resp.status, time: elapsed });
    showResp(responseObj);
    flushConsole();
    renderTests();

    const typeOk = resp.status < 400 ? 'success' : 'error';
    notify(`${resp.status} ${resp.statusText} — ${elapsed}ms`, typeOk);

  } catch (e) {
    const elapsed = Date.now() - t0;
    if (e.name === 'AbortError') {
      notify('Request cancelled', 'info');
    } else {
      const msg = useProxy
        ? `Error: ${e.message}`
        : `Failed to fetch — Enable CORS Proxy (⚡ button) or check URL\n\nError: ${e.message}`;
      showErrResp(msg, elapsed);
      notify('Request failed', 'error');
    }
  } finally {
    sbtn.disabled = false;
    sbtn.textContent = 'Send ➤';
    document.getElementById('cancelbtn').style.display = 'none';
    _abort = null;
  }
}

// ═══════════════════════════════════════════
// RESPONSE RENDERING
// ═══════════════════════════════════════════
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

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n/1024).toFixed(1)} KB`;
  return `${(n/1048576).toFixed(1)} MB`;
}

function showResp(r) {
  const pill = document.getElementById('rpill');
  const rtime = document.getElementById('rtime');
  const rsize = document.getElementById('rsize');
  const hint = document.getElementById('rhint');
  const acts = document.getElementById('racts');

  if (!r) {
    pill.style.display = rtime.style.display = rsize.style.display = 'none';
    acts.style.display = 'none';
    hint.style.display = '';
    document.getElementById('rpretty').innerHTML = '';
    document.getElementById('rraw').textContent = '';
    document.getElementById('rhdrtbl').innerHTML = '';
    return;
  }

  pill.style.display = '';
  pill.textContent = `${r.status} ${r.statusText}`;
  const sc = Math.floor(r.status / 100);
  pill.className = `spill s${sc}`;

  rtime.style.display = '';
  const timeColor = r._time > 1000 ? 'var(--warn)' : r._time > 3000 ? 'var(--err)' : 'var(--ok)';
  rtime.innerHTML = `Time: <b style="color:${timeColor}">${r._time}ms</b>`;

  rsize.style.display = '';
  rsize.innerHTML = `Size: <b>${fmtBytes(r._size)}</b>`;

  hint.style.display = 'none';
  acts.style.display = '';

  // Body - Pretty
  const ct = r._headers?.['content-type'] || '';
  let pretty = '';
  if (ct.includes('json') || r._body.trimStart().startsWith('{') || r._body.trimStart().startsWith('[')) {
    try { pretty = jsonHL(JSON.parse(r._body)); }
    catch { pretty = esc(r._body); }
  } else if (ct.includes('html')) {
    pretty = `<span style="color:var(--t2);font-size:11px">[HTML Response — see Preview tab]</span>\n\n${esc(r._body.slice(0, 2000))}`;
  } else if (ct.includes('xml')) {
    pretty = esc(r._body);
  } else {
    pretty = esc(r._body);
  }
  document.getElementById('rpretty').innerHTML = pretty;
  document.getElementById('rraw').textContent = r._body;

  // Preview
  if (ct.includes('html')) document.getElementById('rpreview').srcdoc = r._body;
  else document.getElementById('rpreview').srcdoc = `<pre style="font-family:monospace;font-size:12px;padding:10px">${r._body.replace(/</g,'&lt;')}</pre>`;

  // Headers
  document.getElementById('rhdrtbl').innerHTML =
    Object.entries(r._headers).map(([k, v]) =>
      `<tr><td>${esc(k)}</td><td style="color:var(--t2)">${esc(v)}</td></tr>`
    ).join('');

  // Cookies panel
  renderCookiesPanel();
}

function showErrResp(msg, time) {
  const pill = document.getElementById('rpill');
  pill.style.display = '';
  pill.textContent = 'Error';
  pill.className = 'spill se';
  document.getElementById('rtime').style.display = '';
  document.getElementById('rtime').innerHTML = `Time: <b style="color:var(--err)">${time}ms</b>`;
  document.getElementById('rsize').style.display = 'none';
  document.getElementById('rhint').style.display = 'none';
  document.getElementById('racts').style.display = 'none';
  document.getElementById('rpretty').innerHTML = `<span style="color:var(--err);white-space:pre-wrap">${esc(msg)}</span>`;
  document.getElementById('rraw').textContent = msg;
}

function renderTests() {
  const c = document.getElementById('testout');
  const badge = document.getElementById('tbadge');
  if (!_tests.length) {
    c.innerHTML = '<div class="empty"><p>No tests ran. Add test scripts in the Tests tab.</p></div>';
    badge.style.display = 'none';
    return;
  }
  const pass = _tests.filter(t => t.pass).length;
  const pct = Math.round(pass/_tests.length*100);
  badge.textContent = `${pass}/${_tests.length}`;
  badge.style.display = '';
  c.innerHTML = `
    <div style="margin-bottom:12px">
      <div style="font-size:13px;font-weight:700;color:${pass===_tests.length?'var(--ok)':'var(--warn)'}">
        ${pass} / ${_tests.length} tests passed (${pct}%)
      </div>
      <div class="run-prog" style="margin-top:6px"><div class="run-bar" style="width:${pct}%;background:${pass===_tests.length?'var(--ok)':'var(--warn)'}"></div></div>
    </div>` +
    _tests.map(t =>
      `<div class="tritem ${t.pass?'trp':'trf'}">
        <span style="font-size:16px">${t.pass?'✅':'❌'}</span>
        <div><div class="trnm">${esc(t.name)}</div>${t.error?`<div class="trer">${esc(t.error)}</div>`:''}</div>
      </div>`
    ).join('');
}

function flushConsole() {
  document.getElementById('consout').innerHTML = _logs.map(l =>
    `<div class="crow ${l.type}"><span class="ct">${l.type.toUpperCase()}</span><span class="cm">${esc(String(l.msg))}</span></div>`
  ).join('');
  const el = document.getElementById('consout');
  el.scrollTop = el.scrollHeight;
}

function clearConsole() { _logs = []; flushConsole(); }

function renderCookiesPanel() {
  const p = document.getElementById('cookiepanel');
  if (!p) return;
  const domains = Object.keys(APP.cookies);
  if (!domains.length) { p.innerHTML = '<div class="empty"><div class="ei">🍪</div><p>No cookies stored.</p></div>'; return; }
  p.innerHTML = domains.map(d =>
    `<div class="ckdom"><div class="ckdomnm">${esc(d)}</div>` +
    Object.entries(APP.cookies[d]).map(([k, v]) =>
      `<div class="ckrow"><span class="cknm">${esc(k)}</span><span class="ckval">${esc(v)}</span></div>`
    ).join('') + '</div>'
  ).join('');
}

function copyResp() { navigator.clipboard.writeText(document.getElementById('rraw').textContent).then(() => notify('Copied!','success')); }
function saveRespFile() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([document.getElementById('rraw').textContent], { type: 'text/plain' }));
  a.download = `response_${Date.now()}.json`; a.click();
}

// ═══════════════════════════════════════════
// PANEL SWITCHING
// ═══════════════════════════════════════════
function switchReqPanel(id) {
  document.querySelectorAll('.reqptab').forEach(t => t.classList.toggle('act', t.dataset.rp === id));
  document.querySelectorAll('.reqtp').forEach(p => p.classList.toggle('act', p.id === `rp-${id}`));
}
function switchRespPanel(id) {
  document.querySelectorAll('.resptab').forEach(t => t.classList.toggle('act', t.dataset.rs === id));
  document.querySelectorAll('.rtpanel').forEach(p => p.classList.toggle('act', p.id === `rs-${id}`));
}
function switchRespBody(id) {
  document.querySelectorAll('.rbview').forEach(b => b.classList.toggle('act', b.dataset.rb === id));
  document.querySelectorAll('.rbpanel').forEach(p => p.classList.toggle('act', p.dataset.rbp === id));
}
function switchSB(id) {
  document.querySelectorAll('.sbtab').forEach(t => t.classList.toggle('act', t.dataset.sb === id));
  document.querySelectorAll('.sbpanel').forEach(p => p.classList.toggle('act', p.id === `sbp-${id}`));
}
function toggleSB() { document.getElementById('sb').classList.toggle('off'); }

// ═══════════════════════════════════════════
// HISTORY
// ═══════════════════════════════════════════
function toggleHist() {
  APP.settings.histOn = document.getElementById('histtog').checked;
  lsSave();
  refreshHistDot();
  notify(APP.settings.histOn ? '✅ History recording ON' : '🔴 History recording OFF', 'info');
}
function refreshHistDot() {
  const dot = document.getElementById('hdot');
  if (dot) dot.className = `hdot${APP.settings.histOn ? '' : ' off'}`;
  const tog = document.getElementById('histtog');
  if (tog) tog.checked = APP.settings.histOn !== false;
}
function addHistory(entry) {
  if (!APP.settings.histOn) return;
  APP.history.unshift({ id: uid(), ...entry, at: new Date().toLocaleTimeString(), pinned: false });
  if (APP.history.length > 500) APP.history.pop();
  lsSave();
  renderHistory();
}
function renderHistory() {
  const list = document.getElementById('histlist');
  if (!list) return;
  refreshHistDot();
  if (!APP.history.length) { list.innerHTML = '<div class="empty"><div class="ei">📭</div><p>No history yet.<br>Send a request to begin.</p></div>'; return; }
  const pinned = APP.history.filter(h => h.pinned);
  const recent = APP.history.filter(h => !h.pinned);
  const mc = { GET:'var(--get)', POST:'var(--post)', PUT:'var(--put)', PATCH:'var(--patch)', DELETE:'var(--delete)', HEAD:'var(--head)', OPTIONS:'var(--options)' };
  const row = h => `
    <div class="hrow${h.pinned?' pin':''}" onclick="loadHist('${h.id}')">
      <span class="mb ${h.method}" style="color:${mc[h.method]||'var(--t2)'}">${h.method}</span>
      <span class="hurl" title="${esc(h.url)}">${esc(h.url)}</span>
      <span class="hat">${h.at}</span>
      <div class="hact" onclick="event.stopPropagation()">
        <button class="ib" title="${h.pinned?'Unpin':'Pin'}" onclick="pinHist('${h.id}')">${h.pinned?'📌':'📍'}</button>
        <button class="ib dl" title="Delete" onclick="delHist('${h.id}')">🗑</button>
      </div>
    </div>`;
  let html = '';
  if (pinned.length) html += `<div class="hsec p">📌 PINNED</div>${pinned.map(row).join('')}`;
  if (recent.length) { if (pinned.length) html += `<div class="hsec r">🕐 RECENT</div>`; html += recent.map(row).join(''); }
  list.innerHTML = html;
}
function pinHist(id) {
  const h = APP.history.find(x => x.id === id);
  if (!h) return;
  h.pinned = !h.pinned;
  APP.history.sort((a, b) => (b.pinned?1:0) - (a.pinned?1:0));
  lsSave(); renderHistory();
  notify(h.pinned ? '📌 Pinned!' : 'Unpinned', 'info');
}
function delHist(id) { APP.history = APP.history.filter(x => x.id !== id); lsSave(); renderHistory(); }
function loadHist(id) { const h = APP.history.find(x => x.id === id); if (h) newTab({ method: h.method, url: h.url, name: h.url }); }
function clearHistory() { if (!confirm('Delete ALL history including pinned?')) return; APP.history = []; lsSave(); renderHistory(); notify('History cleared','info'); }
function unpinAll() { APP.history.forEach(h => h.pinned = false); lsSave(); renderHistory(); notify('All unpinned','info'); }

// ═══════════════════════════════════════════
// COLLECTIONS
// ═══════════════════════════════════════════
function renderColls() {
  const q = (document.getElementById('collsearch')?.value || '').toLowerCase();
  const list = document.getElementById('colllist');
  if (!list) return;
  const filtered = APP.colls.filter(c => c.name.toLowerCase().includes(q));
  if (!filtered.length) { list.innerHTML = '<div class="empty"><div class="ei">📂</div><p>No collections.<br>Create or import one.</p></div>'; return; }
  const mc = { GET:'var(--get)', POST:'var(--post)', PUT:'var(--put)', PATCH:'var(--patch)', DELETE:'var(--delete)', HEAD:'var(--head)', OPTIONS:'var(--options)' };
  list.innerHTML = filtered.map(c =>
    `<div class="ci" id="ci-${c.id}">
      <div class="ch" onclick="toggleColl('${c.id}')">
        <span class="ca" id="ca-${c.id}">▶</span>
        <span class="cn">${esc(c.name)}</span>
        <div class="cbtns">
          <button class="ib" title="Run collection" onclick="openRunner('${c.id}',event)">▶</button>
          <button class="ib" title="Add current request" onclick="addToColl(event,'${c.id}')">+</button>
          <button class="ib" title="Export" onclick="exportColl(event,'${c.id}')">⬇</button>
          <button class="ib" title="Documentation" onclick="openDocs(event,'${c.id}')">📄</button>
          <button class="ib dl" title="Delete" onclick="delColl(event,'${c.id}')">🗑</button>
        </div>
      </div>
      <div class="creqs" id="cr-${c.id}">${renderCollRequests(c, mc)}</div>
    </div>`
  ).join('');
}

function renderCollRequests(c, mc) {
  if (!c.requests?.length) return '<div style="padding:7px 8px;color:var(--t3);font-size:11px">Empty collection</div>';
  // Group by folder
  const folders = {};
  const noFolder = [];
  c.requests.forEach(r => {
    if (r.folder) { if (!folders[r.folder]) folders[r.folder] = []; folders[r.folder].push(r); }
    else noFolder.push(r);
  });
  const reqHtml = arr => arr.map(r =>
    `<div class="rrow" onclick="loadCollReq('${c.id}','${r.id}')">
      <span class="mb ${r.method}" style="color:${mc[r.method]||'var(--t2)'}">${r.method}</span>
      <span class="rn">${esc(r.name)}</span>
      <div class="rbtns">
        <button class="ib" title="Duplicate" onclick="dupReq(event,'${c.id}','${r.id}')">⧉</button>
        <button class="ib dl" title="Delete" onclick="delReq(event,'${c.id}','${r.id}')">✕</button>
      </div>
    </div>`
  ).join('');
  const folderHtml = Object.entries(folders).map(([name, reqs]) =>
    `<div class="folder-item">
      <div class="folder-header" onclick="this.nextElementSibling.classList.toggle('op')">
        <span style="font-size:9px;margin-right:4px">📁</span>
        <span class="folder-name">${esc(name)}</span>
      </div>
      <div class="folder-reqs">${reqHtml(reqs)}</div>
    </div>`
  ).join('');
  return folderHtml + reqHtml(noFolder);
}

function toggleColl(id) {
  document.getElementById(`cr-${id}`)?.classList.toggle('op');
  document.getElementById(`ca-${id}`)?.classList.toggle('op');
}

function openNewColl() {
  openModal(`<div class="mbg"><div class="modal sm">
    <div class="mhd"><span class="mht">New Collection</span><button class="mclose" onclick="closeModal()">✕</button></div>
    <div class="mbody">
      <div class="fg"><label>NAME *</label><input id="nc-name" placeholder="My API Collection" autofocus></div>
      <div class="fg"><label>DESCRIPTION</label><textarea id="nc-desc" rows="2" style="width:100%;resize:none" placeholder="Describe this collection..."></textarea></div>
      <div class="fg"><label>BASE URL (optional)</label><input id="nc-base" placeholder="https://api.example.com"></div>
    </div>
    <div class="mfoot"><button class="btn s" onclick="closeModal()">Cancel</button><button class="btn p" onclick="createColl()">Create</button></div>
  </div></div>`);
  setTimeout(() => document.getElementById('nc-name')?.focus(), 50);
}

function createColl() {
  const name = document.getElementById('nc-name').value.trim();
  if (!name) { notify('Name required', 'error'); return; }
  APP.colls.push({ id: uid(), name, desc: document.getElementById('nc-desc').value, baseUrl: document.getElementById('nc-base').value, requests: [], variables: {}, created: Date.now() });
  lsSave(); renderColls(); closeModal();
  notify('Collection created!', 'success');
}

function delColl(e, id) {
  e.stopPropagation();
  if (!confirm('Delete this collection and all requests?')) return;
  APP.colls = APP.colls.filter(c => c.id !== id);
  lsSave(); renderColls();
}

function addToColl(e, id) {
  e.stopPropagation();
  saveTabUI();
  const tab = getTab();
  const coll = APP.colls.find(c => c.id === id);
  if (!coll) return;
  const name = prompt('Request name:', tab?.name || 'New Request');
  if (!name) return;
  coll.requests = coll.requests || [];
  coll.requests.push({ id: uid(), name, method: tab?.method || 'GET', url: tab?.url || '', ...tab });
  lsSave(); renderColls();
  notify('Saved to collection!', 'success');
}

function saveToColl() {
  saveTabUI();
  const tab = getTab();
  if (!APP.colls.length) { openNewColl(); return; }
  openModal(`<div class="mbg"><div class="modal sm">
    <div class="mhd"><span class="mht">Save Request</span><button class="mclose" onclick="closeModal()">✕</button></div>
    <div class="mbody">
      <div class="fg"><label>REQUEST NAME</label><input id="sr-name" value="${esc(tab?.name||'New Request')}"></div>
      <div class="fg"><label>COLLECTION</label><select id="sr-coll" style="width:100%">${APP.colls.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
      <div class="fg"><label>FOLDER (optional)</label><input id="sr-folder" placeholder="Folder name (leave empty for root)"></div>
    </div>
    <div class="mfoot"><button class="btn s" onclick="closeModal()">Cancel</button><button class="btn p" onclick="doSaveToColl()">Save</button></div>
  </div></div>`);
}

function doSaveToColl() {
  const name = document.getElementById('sr-name').value.trim();
  const id = document.getElementById('sr-coll').value;
  const folder = document.getElementById('sr-folder').value.trim();
  const coll = APP.colls.find(c => c.id === id);
  const tab = getTab();
  if (!coll || !name) return;
  coll.requests = coll.requests || [];
  const req = { id: uid(), name, method: tab?.method||'GET', url: tab?.url||'', folder: folder||'', ...tab };
  coll.requests.push(req);
  if (tab) tab.name = name;
  lsSave(); renderColls(); renderTabs(); closeModal();
  notify('Saved!', 'success');
}

function loadCollReq(collId, reqId) {
  const coll = APP.colls.find(c => c.id === collId);
  const req = coll?.requests?.find(r => r.id === reqId);
  if (req) newTab({ ...req });
}

function dupReq(e, collId, reqId) {
  e.stopPropagation();
  const coll = APP.colls.find(c => c.id === collId);
  const req = coll?.requests?.find(r => r.id === reqId);
  if (!req) return;
  coll.requests.push({ ...req, id: uid(), name: req.name + ' (copy)' });
  lsSave(); renderColls();
  notify('Duplicated!', 'success');
}

function delReq(e, collId, reqId) {
  e.stopPropagation();
  const coll = APP.colls.find(c => c.id === collId);
  if (coll) { coll.requests = coll.requests.filter(r => r.id !== reqId); lsSave(); renderColls(); }
}

function exportColl(e, id) {
  e.stopPropagation();
  const coll = APP.colls.find(c => c.id === id);
  if (!coll) return;
  const data = {
    info: { name: coll.name, description: coll.desc || '', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json', version: { major: 2, minor: 1, patch: 0 } },
    item: (coll.requests || []).map(r => ({
      name: r.name,
      request: {
        method: r.method, url: { raw: r.url, host: [r.url.split('/')[2] || ''] },
        header: (r.headers || []).map(h => ({ key: h.k||h.key||'', value: h.v||h.value||'', disabled: !h.on })),
        body: r.rawBody ? { mode: 'raw', raw: r.rawBody } : undefined,
        auth: r.authType !== 'none' ? { type: r.authType } : undefined,
        description: r.description || '',
      },
      event: [
        ...(r.preScript ? [{ listen: 'prerequest', script: { exec: r.preScript.split('\n'), type: 'text/javascript' } }] : []),
        ...(r.testScript ? [{ listen: 'test', script: { exec: r.testScript.split('\n'), type: 'text/javascript' } }] : []),
      ],
    })),
    variable: Object.entries(coll.variables || {}).map(([k, v]) => ({ key: k, value: v })),
  };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = `${coll.name.replace(/\s+/g,'_')}.postman_collection.json`;
  a.click();
  notify('Exported!', 'success');
}

function exportAllColls() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(APP.colls, null, 2)], { type: 'application/json' }));
  a.download = 'postmanweb_all_collections.json';
  a.click();
}

// ═══════════════════════════════════════════
// COLLECTION RUNNER
// ═══════════════════════════════════════════
function openRunner(id, e) {
  if (e) e.stopPropagation();
  const coll = APP.colls.find(c => c.id === id);
  if (!coll) return;
  openModal(`<div class="mbg"><div class="modal lg">
    <div class="mhd"><span class="mht">▶ Collection Runner: ${esc(coll.name)}</span><button class="mclose" onclick="closeModal()">✕</button></div>
    <div class="mbody">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px">
        <div class="fg"><label>ITERATIONS</label><input id="run-iter" type="number" value="1" min="1" max="999"></div>
        <div class="fg"><label>DELAY (ms)</label><input id="run-delay" type="number" value="0" min="0"></div>
      </div>
      <div class="fg"><label>DATA FILE (CSV/JSON — optional)</label><input type="file" id="run-data" accept=".csv,.json"></div>
      <div class="fg" style="display:flex;align-items:center;gap:10px;margin-bottom:0">
        <label class="tog"><input type="checkbox" id="run-stoponerr"><span class="tsl"></span></label>
        <span style="font-size:12px;color:var(--t2)">Stop on first error</span>
      </div>
      <div id="runner-output" style="margin-top:16px;min-height:80px"></div>
    </div>
    <div class="mfoot">
      <button class="btn s" onclick="closeModal()">Close</button>
      <button class="btn p" id="run-btn" onclick="runColl('${id}')">▶ Run Collection</button>
    </div>
  </div></div>`);
}

async function runColl(id) {
  const coll = APP.colls.find(c => c.id === id);
  if (!coll?.requests?.length) { notify('Collection is empty', 'error'); return; }
  if (_runnerActive) { notify('Runner already active', 'warn'); return; }
  _runnerActive = true;

  const iters = parseInt(document.getElementById('run-iter').value) || 1;
  const delay = parseInt(document.getElementById('run-delay').value) || 0;
  const stopOnErr = document.getElementById('run-stoponerr').checked;
  const out = document.getElementById('runner-output');
  const btn = document.getElementById('run-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Running...';

  // Load data file
  let dataRows = [{}];
  const dataFile = document.getElementById('run-data')?.files?.[0];
  if (dataFile) {
    try {
      const text = await dataFile.text();
      if (dataFile.name.endsWith('.json')) {
        const parsed = JSON.parse(text);
        dataRows = Array.isArray(parsed) ? parsed : [parsed];
      } else {
        // CSV parse
        const lines = text.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g,''));
        dataRows = lines.slice(1).map(line => {
          const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g,''));
          const obj = {};
          headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
          return obj;
        });
      }
    } catch (e) { notify('Data file error: ' + e.message, 'warn'); }
  }

  const totalRuns = iters * coll.requests.length;
  let passTotal = 0, failTotal = 0, runCount = 0;
  let aborted = false;

  out.innerHTML = `<div class="run-prog"><div class="run-bar" id="runbar" style="width:0"></div></div><div id="run-log"></div>`;

  for (let iter = 0; iter < iters && !aborted; iter++) {
    const rowData = dataRows[iter % dataRows.length] || {};
    for (const req of coll.requests) {
      if (aborted) break;
      runCount++;
      const pct = Math.round(runCount / totalRuns * 100);
      document.getElementById('runbar').style.width = pct + '%';

      try {
        const url = resolveStr(req.url);
        const useProxy = APP.settings.corsEnabled;
        const purl = APP.settings.proxyUrl;
        const fetchUrl = useProxy ? purl + encodeURIComponent(url) : url;
        const h = {};
        (req.headers || []).filter(x => x.on !== false && (x.k || x.key)).forEach(x => { h[x.k||x.key] = x.v||x.value; });

        // Run pre-script if any
        if (req.preScript) {
          const pmObj = buildPM(null);
          if (pmObj.pm.iterationData) pmObj.pm.iterationData.get = k => rowData[k] ?? null;
          runScript(req.preScript, pmObj);
        }

        const opts = { method: req.method || 'GET', headers: h };
        if (req.rawBody && !['GET','HEAD'].includes(req.method)) {
          opts.body = req.rawBody;
          if (!h['Content-Type']) h['Content-Type'] = 'application/json';
        }

        const t0 = Date.now();
        const resp = await fetch(fetchUrl, opts);
        const elapsed = Date.now() - t0;
        const body = await resp.text();
        const respObj = { status: resp.status, statusText: resp.statusText, _body: body, _headers: {}, _time: elapsed, _size: new Blob([body]).size };
        resp.headers.forEach((v, k) => { respObj._headers[k.toLowerCase()] = v; });

        // Run test script
        _tests = [];
        if (req.testScript) {
          const pmObj = buildPM(respObj);
          if (pmObj.pm.iterationData) pmObj.pm.iterationData.get = k => rowData[k] ?? null;
          runScript(req.testScript, pmObj);
        }
        const localPass = _tests.filter(t => t.pass).length;
        const localFail = _tests.filter(t => !t.pass).length;
        passTotal += localPass;
        failTotal += localFail;

        const statusClass = resp.ok ? 'run-pass' : 'run-fail';
        const log = document.getElementById('run-log');
        log.innerHTML += `<div class="run-row ${statusClass}">
          <span style="color:${resp.ok?'var(--ok)':'var(--err)'}">●</span>
          <span class="mb ${req.method}" style="color:var(--${['GET','HEAD','OPTIONS'].includes(req.method)?'get':['POST'].includes(req.method)?'post':'put'})">${req.method}</span>
          <span style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis">${esc(req.name)}</span>
          <span class="spill ${resp.ok?'s2':'s4'}" style="font-size:10px">${resp.status}</span>
          <span style="font-size:11px;color:var(--t3)">${elapsed}ms</span>
          <span style="font-size:11px;color:var(--t2)">${_tests.length?`${localPass}/${_tests.length} tests`:''}</span>
        </div>`;
        log.scrollTop = log.scrollHeight;

        if (stopOnErr && !resp.ok) { aborted = true; notify('Stopped on error', 'warn'); break; }
        if (delay > 0) await new Promise(r => setTimeout(r, delay));

      } catch (e) {
        failTotal++;
        const log = document.getElementById('run-log');
        log.innerHTML += `<div class="run-row run-fail"><span style="color:var(--err)">●</span><span style="flex:1;font-size:12px">${esc(req.name)}</span><span style="font-size:11px;color:var(--err)">${esc(e.message)}</span></div>`;
        if (stopOnErr) { aborted = true; break; }
      }
    }
  }

  btn.disabled = false;
  btn.textContent = '▶ Run Again';
  _runnerActive = false;
  notify(`Run complete: ✅ ${passTotal} passed  ❌ ${failTotal} failed`, failTotal === 0 ? 'success' : 'warn');
}

// ═══════════════════════════════════════════
// ENVIRONMENTS
// ═══════════════════════════════════════════
function renderEnvs() {
  const list = document.getElementById('envlist');
  if (!list) return;
  if (!APP.envs.length) { list.innerHTML = '<div class="empty"><div class="ei">🌍</div><p>No environments yet.</p></div>'; return; }
  list.innerHTML = APP.envs.map(e =>
    `<div class="erow${e.id===APP.activeEnv?' aev':''}" onclick="setEnv('${e.id}')">
      <div class="edot${e.id===APP.activeEnv?' on':''}"></div>
      <span class="enm">${esc(e.name)}</span>
      <button class="bs" onclick="editEnv(event,'${e.id}')">Edit</button>
      <button class="bs" onclick="delEnv(event,'${e.id}')">🗑</button>
    </div>`
  ).join('');
}

function setEnv(id) {
  APP.activeEnv = APP.activeEnv === id ? null : id;
  lsSave(); renderEnvs();
  const e = APP.envs.find(x => x.id === APP.activeEnv);
  notify(APP.activeEnv ? `Active env: ${e?.name}` : 'No environment active', 'info');
}

function openNewEnv() {
  openModal(`<div class="mbg"><div class="modal sm">
    <div class="mhd"><span class="mht">New Environment</span><button class="mclose" onclick="closeModal()">✕</button></div>
    <div class="mbody"><div class="fg"><label>NAME</label><input id="ne-name" placeholder="Production" autofocus></div></div>
    <div class="mfoot"><button class="btn s" onclick="closeModal()">Cancel</button><button class="btn p" onclick="createEnv()">Create</button></div>
  </div></div>`);
  setTimeout(() => document.getElementById('ne-name')?.focus(), 50);
}

function createEnv() {
  const name = document.getElementById('ne-name').value.trim();
  if (!name) return;
  const env = { id: uid(), name, variables: {}, created: Date.now() };
  APP.envs.push(env);
  lsSave(); renderEnvs(); closeModal();
  editEnv(null, env.id);
}

function editEnv(e, id) {
  if (e) e.stopPropagation();
  const env = APP.envs.find(x => x.id === id);
  if (!env) return;
  const vars = Object.entries(env.variables || {});
  openModal(`<div class="mbg"><div class="modal lg">
    <div class="mhd"><span class="mht">Edit: ${esc(env.name)}</span><button class="mclose" onclick="closeModal()">✕</button></div>
    <div class="mbody">
      <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:7px;margin-bottom:8px;font-size:10px;font-weight:700;color:var(--t3);letter-spacing:.5px">
        <div>VARIABLE</div><div>VALUE</div><div style="width:28px"></div>
      </div>
      <div id="ev-list">${vars.map(([k,v])=>
        `<div class="evrow"><input placeholder="Variable" value="${esc(k)}"><input placeholder="Value" value="${esc(v)}"><button class="evdel" onclick="this.parentElement.remove()">✕</button></div>`
      ).join('')}</div>
      <button class="arow" onclick="addEvRow()" style="margin-top:8px">+ Add Variable</button>
    </div>
    <div class="mfoot"><button class="btn s" onclick="closeModal()">Cancel</button><button class="btn p" onclick="saveEnv('${id}')">Save</button></div>
  </div></div>`);
}

function addEvRow() {
  const div = document.createElement('div'); div.className = 'evrow';
  div.innerHTML = '<input placeholder="Variable"><input placeholder="Value"><button class="evdel" onclick="this.parentElement.remove()">✕</button>';
  document.getElementById('ev-list').appendChild(div);
}

function saveEnv(id) {
  const env = APP.envs.find(x => x.id === id);
  if (!env) return;
  env.variables = {};
  document.querySelectorAll('#ev-list .evrow').forEach(row => {
    const [k, v] = row.querySelectorAll('input');
    if (k.value.trim()) env.variables[k.value.trim()] = v.value;
  });
  lsSave(); renderEnvs(); closeModal();
  notify('Environment saved!', 'success');
}

function delEnv(e, id) {
  e.stopPropagation();
  if (!confirm('Delete this environment?')) return;
  APP.envs = APP.envs.filter(x => x.id !== id);
  if (APP.activeEnv === id) APP.activeEnv = null;
  lsSave(); renderEnvs();
}

function openEnvSB() { switchSB('envs'); document.getElementById('sb').classList.remove('off'); }

// ═══════════════════════════════════════════
// GLOBALS
// ═══════════════════════════════════════════
function openGlobals() {
  const vars = Object.entries(APP.globals);
  openModal(`<div class="mbg"><div class="modal lg">
    <div class="mhd"><span class="mht">🌐 Global Variables</span><button class="mclose" onclick="closeModal()">✕</button></div>
    <div class="mbody">
      <div id="gv-list">${vars.map(([k,v])=>
        `<div class="evrow"><input placeholder="Variable" value="${esc(k)}"><input placeholder="Value" value="${esc(v)}"><button class="evdel" onclick="this.parentElement.remove()">✕</button></div>`
      ).join('')}</div>
      <button class="arow" onclick="addGVRow()" style="margin-top:8px">+ Add Variable</button>
    </div>
    <div class="mfoot"><button class="btn s" onclick="closeModal()">Cancel</button><button class="btn p" onclick="saveGlobals()">Save</button></div>
  </div></div>`);
}

function addGVRow() {
  const div = document.createElement('div'); div.className = 'evrow';
  div.innerHTML = '<input placeholder="Variable"><input placeholder="Value"><button class="evdel" onclick="this.parentElement.remove()">✕</button>';
  document.getElementById('gv-list').appendChild(div);
}

function saveGlobals() {
  APP.globals = {};
  document.querySelectorAll('#gv-list .evrow').forEach(row => {
    const [k, v] = row.querySelectorAll('input');
    if (k.value.trim()) APP.globals[k.value.trim()] = v.value;
  });
  lsSave(); closeModal();
  notify('Globals saved!', 'success');
}

// ═══════════════════════════════════════════
// CODE GENERATION
// ═══════════════════════════════════════════
function openCodegen() {
  saveTabUI();
  openModal(`<div class="mbg"><div class="modal xl">
    <div class="mhd"><span class="mht">{ } Code Snippet</span><button class="mclose" onclick="closeModal()">✕</button></div>
    <div class="mbody">
      <div class="ltabs">${['cURL','JavaScript (Fetch)','JavaScript (Axios)','Python (requests)','Python (http.client)','Node.js','Java (OkHttp)','Java (Unirest)','C# (RestSharp)','Go','PHP (Guzzle)','PHP (cURL)','Ruby','Swift','Kotlin','Rust','Dart','R','PowerShell'].map(l=>
        `<button class="ltab${l==='cURL'?' act':''}" onclick="switchLang('${esc(l)}',this)">${l}</button>`
      ).join('')}</div>
      <textarea id="cgout" readonly></textarea>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn p" onclick="copyCG()">📋 Copy</button>
      </div>
    </div>
  </div></div>`);
  genCode('cURL');
}

function switchLang(l, btn) {
  document.querySelectorAll('.ltab').forEach(b => b.classList.remove('act'));
  btn.classList.add('act');
  genCode(l);
}

function genCode(lang) {
  const method = document.getElementById('msel').value;
  const url = document.getElementById('urlin').value;
  const hRows = readKV('headers').filter(h => h.on && h.k);
  const authH = getAuthHeaders();
  const rawBody = document.getElementById('coderaw')?.value || '';
  const bodyType = _bt;
  const allH = { ...Object.fromEntries(hRows.map(h => [h.k, h.v])), ...authH };
  const hj2 = JSON.stringify(allH, null, 2);
  const hj4 = JSON.stringify(allH, null, 4);
  const hasBody = bodyType === 'raw' && rawBody;

  const codes = {
    'cURL': () => {
      let c = `curl --location '${url}'`;
      if (method !== 'GET') c = `curl --location --request ${method} '${url}'`;
      Object.entries(allH).forEach(([k, v]) => { c += ` \\\n--header '${k}: ${v}'`; });
      if (hasBody) c += ` \\\n--data-raw '${rawBody.replace(/'/g,"'\\''")}'`;
      return c;
    },
    'JavaScript (Fetch)': () => {
      const opts = { method, headers: allH };
      if (hasBody) opts.body = rawBody;
      return `const response = await fetch('${url}', ${JSON.stringify(opts, null, 2)});\nconst data = await response.json();\nconsole.log(data);`;
    },
    'JavaScript (Axios)': () => {
      const cfg = { method: method.toLowerCase(), url, headers: allH };
      if (hasBody) { try { cfg.data = JSON.parse(rawBody); } catch { cfg.data = rawBody; } }
      return `import axios from 'axios';\n\nconst config = ${JSON.stringify(cfg, null, 2)};\n\nconst response = await axios(config);\nconsole.log(response.data);`;
    },
    'Python (requests)': () =>
      `import requests\nimport json\n\nurl = "${url}"\nheaders = ${hj4}\n${hasBody ? `\npayload = json.dumps(${rawBody})\n\nresponse = requests.request("${method}", url, headers=headers, data=payload)` : `\nresponse = requests.request("${method}", url, headers=headers)`}\n\nprint(response.status_code)\nprint(response.json())`,
    'Python (http.client)': () =>
      `import http.client\nimport json\n\nconn = http.client.HTTPSConnection("${new URL(url.startsWith('http')?url:'https://'+url).hostname}")\nheaders = ${hj2}${hasBody?`\npayload = '${rawBody.replace(/'/g,"\\'")}'\nconn.request("${method}", "${new URL(url.startsWith('http')?url:'https://'+url).pathname||'/'}", payload, headers)`:`\nconn.request("${method}", "${new URL(url.startsWith('http')?url:'https://'+url).pathname||'/'}", headers=headers)`}\nres = conn.getresponse()\ndata = res.read()\nprint(data.decode("utf-8"))`,
    'Node.js': () =>
      `const https = require('https');\n\nconst options = {\n  hostname: '${new URL(url.startsWith('http')?url:'https://'+url).hostname}',\n  path: '${new URL(url.startsWith('http')?url:'https://'+url).pathname||'/'}',\n  method: '${method}',\n  headers: ${hj2}\n};\n\nconst req = https.request(options, res => {\n  let data = '';\n  res.on('data', chunk => data += chunk);\n  res.on('end', () => console.log(JSON.parse(data)));\n});\n${hasBody?`req.write(${JSON.stringify(rawBody)});\n`:''}req.end();`,
    'Java (OkHttp)': () =>
      `import okhttp3.*;\n\nOkHttpClient client = new OkHttpClient();\n${hasBody?`MediaType mediaType = MediaType.parse("application/json");\nRequestBody body = RequestBody.create(mediaType, ${JSON.stringify(rawBody)});\n`:''}\nRequest request = new Request.Builder()\n  .url("${url}")\n  .method("${method}", ${hasBody?'body':'null'})\n${Object.entries(allH).map(([k,v])=>`  .addHeader("${k}", "${v}")`).join('\n')}\n  .build();\n\nResponse response = client.newCall(request).execute();\nSystem.out.println(response.body().string());`,
    'Java (Unirest)': () =>
      `import kong.unirest.Unirest;\n\nvar response = Unirest.${method.toLowerCase()}("${url}")\n${Object.entries(allH).map(([k,v])=>`  .header("${k}", "${v}")`).join('\n')}${hasBody?`\n  .body(${JSON.stringify(rawBody)})`:''}\n  .asString();\n\nSystem.out.println(response.getBody());`,
    'C# (RestSharp)': () =>
      `using RestSharp;\n\nvar client = new RestClient("${url}");\nvar request = new RestRequest(Method.${method});\n${Object.entries(allH).map(([k,v])=>`request.AddHeader("${k}", "${v}");`).join('\n')}${hasBody?`\nrequest.AddParameter("application/json", ${JSON.stringify(rawBody)}, ParameterType.RequestBody);`:''}\nIRestResponse response = client.Execute(request);\nConsole.WriteLine(response.Content);`,
    'Go': () =>
      `package main\n\nimport (\n  "fmt"\n  "io/ioutil"\n  "net/http"\n  "strings"\n)\n\nfunc main() {\n  url := "${url}"\n  ${hasBody?`payload := strings.NewReader(${JSON.stringify(rawBody)})\n  client := &http.Client{}\n  req, _ := http.NewRequest("${method}", url, payload)`:`client := &http.Client{}\n  req, _ := http.NewRequest("${method}", url, nil)`}\n${Object.entries(allH).map(([k,v])=>`  req.Header.Add("${k}", "${v}")`).join('\n')}\n  res, _ := client.Do(req)\n  defer res.Body.Close()\n  body, _ := ioutil.ReadAll(res.Body)\n  fmt.Println(string(body))\n}`,
    'PHP (Guzzle)': () =>
      `<?php\nrequire_once 'vendor/autoload.php';\nuse GuzzleHttp\\Client;\n\n$client = new Client();\n$response = $client->request('${method}', '${url}', [\n  'headers' => ${JSON.stringify(allH, null, 4)}${hasBody?`,\n  'body' => '${rawBody.replace(/'/g,"\\'")}'`:''}\n]);\necho $response->getBody();`,
    'PHP (cURL)': () =>
      `<?php\n$curl = curl_init();\ncurl_setopt_array($curl, [\n  CURLOPT_URL => "${url}",\n  CURLOPT_RETURNTRANSFER => true,\n  CURLOPT_CUSTOMREQUEST => "${method}",\n  CURLOPT_HTTPHEADER => [${Object.entries(allH).map(([k,v])=>`"${k}: ${v}"`).join(', ')}],${hasBody?`\n  CURLOPT_POSTFIELDS => '${rawBody.replace(/'/g,"\\'")}'`:''}\n]);\n$response = curl_exec($curl);\ncurl_close($curl);\necho $response;`,
    'Ruby': () =>
      `require "uri"\nrequire "net/http"\nrequire "json"\n\nuri = URI("${url}")\nhttp = Net::HTTP.new(uri.host, uri.port)\nhttp.use_ssl = true\nrequest = Net::HTTP::${method.charAt(0)+method.slice(1).toLowerCase()}.new(uri)\n${Object.entries(allH).map(([k,v])=>`request["${k}"] = "${v}"`).join('\n')}${hasBody?`\nrequest.body = ${JSON.stringify(rawBody)}`:''}\nresponse = http.request(request)\nputs response.read_body`,
    'Swift': () =>
      `import Foundation\n\nlet semaphore = DispatchSemaphore(value: 0)\nvar request = URLRequest(url: URL(string: "${url}")!, timeoutInterval: Double.infinity)\nrequest.httpMethod = "${method}"\n${Object.entries(allH).map(([k,v])=>`request.addValue("${v}", forHTTPHeaderField: "${k}")`).join('\n')}${hasBody?`\nrequest.httpBody = Data("${rawBody.replace(/"/g,'\\"')}".utf8)`:''}\nURLSession.shared.dataTask(with: request) { data, response, error in\n  guard let data = data else { return }\n  print(String(data: data, encoding: .utf8)!)\n  semaphore.signal()\n}.resume()\nsemaphore.wait()`,
    'Kotlin': () =>
      `import okhttp3.OkHttpClient\nimport okhttp3.Request${hasBody?'\nimport okhttp3.RequestBody.Companion.toRequestBody\nimport okhttp3.MediaType.Companion.toMediaType':''}\n\nval client = OkHttpClient()\n${hasBody?`val body = ${JSON.stringify(rawBody)}.toRequestBody("application/json".toMediaType())\n`:''}\nval request = Request.Builder()\n  .url("${url}")\n  ${hasBody?`.${method.toLowerCase()}(body)`:`method("${method}", null)`}\n${Object.entries(allH).map(([k,v])=>`  .addHeader("${k}", "${v}")`).join('\n')}\n  .build()\n\nval response = client.newCall(request).execute()\nprintln(response.body!!.string())`,
    'Rust': () =>
      `use reqwest;\n\n#[tokio::main]\nasync fn main() -> Result<(), reqwest::Error> {\n  let client = reqwest::Client::new();\n  let res = client\n    .${method.toLowerCase()}("${url}")\n${Object.entries(allH).map(([k,v])=>`    .header("${k}", "${v}")`).join('\n')}${hasBody?`\n    .body(${JSON.stringify(rawBody)})`:''}\n    .send().await?;\n  println!("{}", res.text().await?);\n  Ok(())\n}`,
    'Dart': () =>
      `import 'package:http/http.dart' as http;\n\nvoid main() async {\n  var url = Uri.parse('${url}');\n  var headers = ${JSON.stringify(allH)};\n  var response = await http.${method.toLowerCase()}(url, headers: headers${hasBody?`, body: ${JSON.stringify(rawBody)}`:''}});\n  print(response.body);\n}`,
    'R': () =>
      `library(httr)\n\nresponse <- ${method === 'GET' ? 'GET' : method === 'POST' ? 'POST' : 'VERB'}(${method !== 'GET' && method !== 'POST' ? `"${method}", ` : ''}"${url}",\n  add_headers(.headers = ${JSON.stringify(allH)})${hasBody?`,\n  body = ${JSON.stringify(rawBody)}`:''}\n)\ncat(content(response, "text"))`,
    'PowerShell': () =>
      `$headers = ${JSON.stringify(allH)}\n${hasBody?`$body = ${JSON.stringify(rawBody)}\n\n`:'\n'}$response = Invoke-RestMethod -Uri '${url}' -Method '${method}' -Headers $headers${hasBody?' -Body $body -ContentType "application/json"':''}\n$response | ConvertTo-Json`,
  };

  document.getElementById('cgout').value = (codes[lang] || codes['cURL'])();
}

function copyCG() { navigator.clipboard.writeText(document.getElementById('cgout').value).then(() => notify('Copied!', 'success')); }

// ═══════════════════════════════════════════
// WEBSOCKET
// ═══════════════════════════════════════════
function openWS() {
  openModal(`<div class="mbg"><div class="modal lg">
    <div class="mhd"><span class="mht">🔌 WebSocket Client</span><button class="mclose" onclick="closeWS()">✕</button></div>
    <div class="mbody">
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <input id="ws-url" type="text" style="flex:1;font-family:'JetBrains Mono',monospace" placeholder="wss://echo.websocket.org" value="wss://echo.websocket.org">
        <button id="wsbtn" onclick="wsToggle()" style="padding:7px 18px;border-radius:6px;font-weight:700;background:var(--ok);color:#fff;border:none;cursor:pointer">Connect</button>
      </div>
      <div style="margin-bottom:8px">
        <label style="font-size:10px;font-weight:700;color:var(--t3);letter-spacing:.5px;display:block;margin-bottom:4px">HEADERS (one per line, key: value)</label>
        <textarea id="ws-hdrs" style="width:100%;height:60px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:8px;color:var(--t1);font-family:monospace;font-size:11px;resize:none" placeholder="Authorization: Bearer token123"></textarea>
      </div>
      <div id="wsmsgs"></div>
      <div style="display:flex;gap:7px">
        <input id="ws-msg" placeholder="Type message and press Enter or click Send..." style="flex:1;font-family:monospace" onkeydown="if(event.key==='Enter')wsSend()">
        <button onclick="wsSend()" style="padding:7px 14px;background:var(--accent);color:#fff;border-radius:6px;font-weight:700;border:none;cursor:pointer">Send</button>
      </div>
    </div>
  </div></div>`);
}

function closeWS() { if (_ws) { _ws.close(); _ws = null; } closeModal(); }

function wsToggle() {
  if (_ws && _ws.readyState === WebSocket.OPEN) {
    _ws.close(); _ws = null;
    document.getElementById('wsbtn').textContent = 'Connect';
    document.getElementById('wsbtn').style.background = 'var(--ok)';
    wsLog('• Disconnected', 'sys');
  } else {
    const url = document.getElementById('ws-url').value.trim();
    if (!url) return;
    try {
      _ws = new WebSocket(url);
      wsLog(`• Connecting to ${url}...`, 'sys');
      _ws.onopen = () => { wsLog('✅ Connected!', 'sys'); document.getElementById('wsbtn').textContent = 'Disconnect'; document.getElementById('wsbtn').style.background = 'var(--err)'; };
      _ws.onmessage = e => wsLog(`← ${e.data}`, 'recv');
      _ws.onerror = () => wsLog('❌ Connection error', 'sys');
      _ws.onclose = e => wsLog(`• Closed (code: ${e.code})`, 'sys');
    } catch (e) { wsLog(`❌ ${e.message}`, 'sys'); }
  }
}

function wsSend() {
  const msg = document.getElementById('ws-msg').value.trim();
  if (!msg) return;
  if (!_ws || _ws.readyState !== WebSocket.OPEN) { notify('Not connected', 'error'); return; }
  _ws.send(msg);
  wsLog(`→ ${msg}`, 'sent');
  document.getElementById('ws-msg').value = '';
}

function wsLog(msg, cls) {
  const d = document.getElementById('wsmsgs');
  if (!d) return;
  const div = document.createElement('div');
  div.className = `wsl ${cls}`;
  div.textContent = msg;
  d.appendChild(div);
  d.scrollTop = d.scrollHeight;
}

// ═══════════════════════════════════════════
// IMPORT
// ═══════════════════════════════════════════
function openImport() {
  openModal(`<div class="mbg"><div class="modal">
    <div class="mhd"><span class="mht">📥 Import</span><button class="mclose" onclick="closeModal()">✕</button></div>
    <div class="mbody">
      <div class="fg"><label>PASTE — Postman v2.1 JSON / OpenAPI JSON / cURL command</label>
        <textarea id="imp-txt" style="width:100%;min-height:180px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:11px;color:var(--t1);resize:vertical;font-family:'JetBrains Mono',monospace;font-size:12px;line-height:1.6" placeholder="Paste Postman collection, OpenAPI spec, or curl command here..."></textarea>
      </div>
      <div class="fg"><label>OR UPLOAD FILE</label><input type="file" id="imp-file" accept=".json,.yaml,.yml,.har" onchange="loadImpFile(this)"></div>
    </div>
    <div class="mfoot"><button class="btn s" onclick="closeModal()">Cancel</button><button class="btn p" onclick="doImport()">Import</button></div>
  </div></div>`);
}

function loadImpFile(input) {
  const f = input.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = e => { document.getElementById('imp-txt').value = e.target.result; };
  r.readAsText(f);
}

function doImport() {
  const text = document.getElementById('imp-txt').value.trim();
  if (!text) { notify('Nothing to import', 'error'); return; }

  // cURL
  if (/^curl\b/i.test(text)) { importCurl(text); closeModal(); return; }

  try {
    const data = JSON.parse(text);

    // Postman v2.1
    if (data.info?.schema?.includes('v2.1') || data.info?.schema?.includes('v2.0') || (data.info && data.item)) {
      const coll = {
        id: uid(),
        name: data.info.name || 'Imported Collection',
        desc: data.info.description || '',
        requests: [],
        variables: Object.fromEntries((data.variable || []).map(v => [v.key, v.value || ''])),
      };
      const flatItems = (items, folder = '') => {
        if (!items) return;
        items.forEach(item => {
          if (item.item) { flatItems(item.item, item.name); return; }
          if (!item.request) return;
          const req = item.request;
          const rawUrl = typeof req.url === 'string' ? req.url : (req.url?.raw || '');
          const headers = (req.header || []).map(h => ({ id: uid(), on: !h.disabled, k: h.key || '', v: h.value || '', desc: h.description || '' }));
          const params = (req.url?.query || []).map(q => ({ id: uid(), on: !q.disabled, k: q.key || '', v: q.value || '', desc: q.description || '' }));
          const preScript = item.event?.find(e => e.listen === 'prerequest')?.script?.exec?.join('\n') || '';
          const testScript = item.event?.find(e => e.listen === 'test')?.script?.exec?.join('\n') || '';
          let bodyType = 'none', rawBody = '', rawFmt = 'json';
          if (req.body) {
            bodyType = req.body.mode || 'none';
            if (bodyType === 'raw') { rawBody = req.body.raw || ''; rawFmt = req.body.options?.raw?.language || 'json'; }
          }
          coll.requests.push({ id: uid(), name: item.name, method: req.method || 'GET', url: rawUrl, headers, params, bodyType, rawBody, rawFmt, preScript, testScript, folder, description: req.description || '', authType: req.auth?.type || 'none' });
        });
      };
      flatItems(data.item);
      APP.colls.push(coll);
      lsSave(); renderColls(); closeModal();
      notify(`✅ Imported "${coll.name}" — ${coll.requests.length} requests`, 'success');
      return;
    }

    // OpenAPI 3.x / Swagger 2.x
    if (data.openapi || data.swagger) {
      importOpenAPI(data); closeModal(); return;
    }

    // HAR
    if (data.log?.entries) {
      importHAR(data); closeModal(); return;
    }

    // Raw collection array
    if (Array.isArray(data) && data[0]?.requests) {
      APP.colls.push(...data); lsSave(); renderColls(); closeModal();
      notify(`Imported ${data.length} collections`, 'success'); return;
    }

    notify('Unrecognized format', 'error');
  } catch (e) { notify('Parse error: ' + e.message, 'error'); }
}

function importCurl(curl) {
  try {
    const mm = curl.match(/-X\s+(\w+)/i);
    const um = curl.match(/curl\s+(?:--[^\s]+\s+|-[a-zA-Z]\s+)*['"]?(https?:\/\/[^\s'"]+)['"]?/);
    const hm = [...curl.matchAll(/-H\s+['"]([^'"]+)['"]/gi)];
    const dm = curl.match(/(?:--data(?:-raw|-binary)?|-d)\s+['"]?((?:[^'"\\]|\\.)*)['"]?/i);
    const method = (mm?.[1] || (dm ? 'POST' : 'GET')).toUpperCase();
    const url = um?.[1] || '';
    const headers = hm.map(m => { const [k, ...v] = m[1].split(':'); return { id: uid(), on: true, k: k.trim(), v: v.join(':').trim(), desc: '' }; });
    const body = dm?.[1] || '';
    newTab({ method, url, name: url.replace(/^https?:\/\//, '').slice(0, 40) || 'Imported', headers, rawBody: body, bodyType: body ? 'raw' : 'none' });
    notify('✅ Imported from cURL!', 'success');
  } catch (e) { notify('cURL parse error: ' + e.message, 'error'); }
}

function importOpenAPI(spec) {
  const coll = { id: uid(), name: (spec.info?.title || 'OpenAPI Import'), desc: spec.info?.description || '', requests: [], variables: {} };
  const baseUrl = spec.servers?.[0]?.url || (spec.host ? `${spec.schemes?.[0]||'https'}://${spec.host}${spec.basePath||''}` : '');
  const paths = spec.paths || {};
  Object.entries(paths).forEach(([path, methods]) => {
    Object.entries(methods).forEach(([method, op]) => {
      if (['get','post','put','patch','delete','head','options'].includes(method)) {
        const headers = (op.parameters || []).filter(p => p.in === 'header').map(p => ({ id: uid(), on: true, k: p.name, v: p.example || '', desc: p.description || '' }));
        const params = (op.parameters || []).filter(p => p.in === 'query').map(p => ({ id: uid(), on: true, k: p.name, v: p.example || '', desc: p.description || '' }));
        let rawBody = '';
        if (op.requestBody?.content?.['application/json']?.example) {
          rawBody = JSON.stringify(op.requestBody.content['application/json'].example, null, 2);
        }
        coll.requests.push({ id: uid(), name: op.summary || op.operationId || `${method.toUpperCase()} ${path}`, method: method.toUpperCase(), url: baseUrl + path, headers, params, bodyType: rawBody ? 'raw' : 'none', rawBody, rawFmt: 'json' });
      }
    });
  });
  APP.colls.push(coll);
  lsSave(); renderColls();
  notify(`✅ Imported OpenAPI: "${coll.name}" — ${coll.requests.length} endpoints`, 'success');
}

function importHAR(har) {
  const coll = { id: uid(), name: 'HAR Import', desc: '', requests: [] };
  (har.log?.entries || []).forEach(entry => {
    const req = entry.request;
    const headers = (req.headers || []).filter(h => !['host','connection','content-length'].includes(h.name.toLowerCase())).map(h => ({ id: uid(), on: true, k: h.name, v: h.value, desc: '' }));
    let rawBody = '', bodyType = 'none';
    if (req.postData?.text) { rawBody = req.postData.text; bodyType = 'raw'; }
    coll.requests.push({ id: uid(), name: req.url.replace(/^https?:\/\/[^/]+/, '').slice(0, 40) || req.method, method: req.method, url: req.url, headers, bodyType, rawBody });
  });
  APP.colls.push(coll);
  lsSave(); renderColls();
  notify(`✅ Imported HAR — ${coll.requests.length} requests`, 'success');
}

// ═══════════════════════════════════════════
// MOCK SERVER
// ═══════════════════════════════════════════
function openMocks() {
  openModal(`<div class="mbg"><div class="modal lg">
    <div class="mhd"><span class="mht">🎭 Mock Server</span><button class="mclose" onclick="closeModal()">✕</button></div>
    <div class="mbody">
      <p style="font-size:12px;color:var(--t2);margin-bottom:14px;line-height:1.7">Define mock endpoints. When CORS proxy is enabled, requests matching these paths will return mock responses.</p>
      <div id="mock-list">${renderMockList()}</div>
      <button class="arow" onclick="addMock()" style="margin-top:8px">+ Add Mock Endpoint</button>
    </div>
    <div class="mfoot"><button class="btn s" onclick="closeModal()">Close</button><button class="btn p" onclick="saveMocks()">Save Mocks</button></div>
  </div></div>`);
}

function renderMockList() {
  if (!APP.mocks.length) return '<div class="empty"><p>No mock endpoints defined.</p></div>';
  return APP.mocks.map((m, i) => `
    <div class="mock-row" id="mock-${i}">
      <input class="mock-status" type="number" value="${m.status||200}" min="100" max="599" placeholder="200" title="Status code">
      <select style="width:90px;font-size:12px" title="Method">${['GET','POST','PUT','PATCH','DELETE','*'].map(mt=>`<option${m.method===mt?' selected':''}>${mt}</option>`).join('')}</select>
      <input style="flex:1;font-size:12px" type="text" value="${esc(m.path||'')}" placeholder="/api/endpoint">
      <input style="flex:2;font-size:11px;font-family:monospace" type="text" value="${esc(m.body||'')}" placeholder='{"mock": "response"}'>
      <button class="ib dl" onclick="APP.mocks.splice(${i},1);document.getElementById('mock-list').innerHTML=renderMockList()">✕</button>
    </div>`).join('');
}

function addMock() {
  APP.mocks.push({ status: 200, method: 'GET', path: '/api/example', body: '{"data": "mock response"}' });
  document.getElementById('mock-list').innerHTML = renderMockList();
}

function saveMocks() {
  const rows = document.querySelectorAll('.mock-row');
  APP.mocks = [...rows].map((row, i) => {
    const inputs = row.querySelectorAll('input, select');
    return { status: parseInt(inputs[0].value)||200, method: inputs[1].value, path: inputs[2].value, body: inputs[3].value };
  });
  lsSave(); closeModal();
  notify('Mocks saved!', 'success');
}

// ═══════════════════════════════════════════
// DOCUMENTATION
// ═══════════════════════════════════════════
function openDocs(e, collId) {
  if (e) e.stopPropagation();
  const coll = APP.colls.find(c => c.id === collId);
  if (!coll) return;
  const mc = { GET:'var(--get)', POST:'var(--post)', PUT:'var(--put)', PATCH:'var(--patch)', DELETE:'var(--delete)', HEAD:'var(--head)', OPTIONS:'var(--options)' };
  openModal(`<div class="mbg"><div class="modal xl">
    <div class="mhd"><span class="mht">📄 ${esc(coll.name)} — Documentation</span><button class="mclose" onclick="closeModal()">✕</button></div>
    <div class="mbody">
      ${coll.desc ? `<p style="color:var(--t2);font-size:13px;margin-bottom:16px;line-height:1.7">${esc(coll.desc)}</p>` : ''}
      ${(coll.requests || []).map(r => `
        <div class="doc-section">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
            <span class="mb ${r.method}" style="color:${mc[r.method]||'var(--t2)'};font-size:11px;padding:3px 8px;border-radius:4px;background:rgba(255,255,255,.05)">${r.method}</span>
            <span style="font-size:14px;font-weight:700">${esc(r.name)}</span>
          </div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--t3);margin-bottom:8px;padding:6px 10px;background:var(--bg1);border-radius:var(--r)">${esc(r.url)}</div>
          ${r.description ? `<p style="font-size:12px;color:var(--t2);margin-bottom:8px;line-height:1.7">${esc(r.description)}</p>` : ''}
          ${r.headers?.filter(h => h.on && h.k).length ? `
            <div style="font-size:10px;font-weight:700;color:var(--t3);letter-spacing:.5px;margin-bottom:5px">HEADERS</div>
            <table style="width:100%;border-collapse:collapse;margin-bottom:10px">
              ${r.headers.filter(h=>h.on&&h.k).map(h=>`<tr><td style="padding:4px 8px;font-family:monospace;font-size:11px;color:var(--info);width:35%">${esc(h.k)}</td><td style="padding:4px 8px;font-size:11px;color:var(--t2)">${esc(h.v)}</td><td style="padding:4px 8px;font-size:11px;color:var(--t3)">${esc(h.desc)}</td></tr>`).join('')}
            </table>` : ''}
          ${r.rawBody ? `<div style="font-size:10px;font-weight:700;color:var(--t3);letter-spacing:.5px;margin-bottom:5px">BODY</div><pre style="font-size:11px;background:var(--bg1);padding:10px;border-radius:var(--r);overflow-x:auto;color:var(--t2)">${esc(r.rawBody.slice(0,500))}</pre>` : ''}
        </div>`).join('')}
    </div>
  </div></div>`);
}

// ═══════════════════════════════════════════
// COOKIES
// ═══════════════════════════════════════════
function openCookies() {
  openModal(`<div class="mbg"><div class="modal lg">
    <div class="mhd"><span class="mht">🍪 Cookie Manager</span><button class="mclose" onclick="closeModal()">✕</button></div>
    <div class="mbody">
      <div style="display:flex;gap:7px;margin-bottom:14px;flex-wrap:wrap">
        <input id="ck-d" placeholder="Domain" style="width:170px">
        <input id="ck-n" placeholder="Cookie Name" style="width:150px">
        <input id="ck-v" placeholder="Value" style="flex:1;min-width:100px">
        <button class="btn p" onclick="addCK()">+ Add</button>
      </div>
      <div id="ck-list">${renderCKList()}</div>
    </div>
    <div class="mfoot">
      <button class="btn d" onclick="clearAllCK()">🗑 Clear All</button>
      <button class="btn s" onclick="closeModal()">Close</button>
    </div>
  </div></div>`);
}

function renderCKList() {
  const doms = Object.keys(APP.cookies);
  if (!doms.length) return '<div class="empty"><div class="ei">🍪</div><p>No cookies.</p></div>';
  return doms.map(d =>
    `<div class="ckdom"><div class="ckdomnm">🌐 ${esc(d)}</div>` +
    Object.entries(APP.cookies[d]).map(([k, v]) =>
      `<div class="ckrow"><span class="cknm">${esc(k)}</span><span class="ckval">${esc(v)}</span>
      <button onclick="delCK('${esc(d)}','${esc(k)}')" style="margin-left:auto;color:var(--err);background:none;border:none;cursor:pointer;font-size:12px">✕</button></div>`
    ).join('') + '</div>'
  ).join('');
}

function addCK() {
  const d = document.getElementById('ck-d').value.trim();
  const n = document.getElementById('ck-n').value.trim();
  const v = document.getElementById('ck-v').value;
  if (!d || !n) { notify('Domain and name required', 'error'); return; }
  if (!APP.cookies[d]) APP.cookies[d] = {};
  APP.cookies[d][n] = v;
  lsSave();
  document.getElementById('ck-list').innerHTML = renderCKList();
  notify('Cookie added!', 'success');
}

function delCK(d, n) {
  if (APP.cookies[d]) { delete APP.cookies[d][n]; if (!Object.keys(APP.cookies[d]).length) delete APP.cookies[d]; }
  lsSave();
  document.getElementById('ck-list').innerHTML = renderCKList();
}

function clearAllCK() {
  if (!confirm('Clear all cookies?')) return;
  APP.cookies = {}; lsSave();
  document.getElementById('ck-list').innerHTML = renderCKList();
}

// ═══════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════
function openSettings() {
  const s = APP.settings;
  openModal(`<div class="mbg"><div class="modal lg">
    <div class="mhd"><span class="mht">⚙ Settings</span><button class="mclose" onclick="closeModal()">✕</button></div>
    <div class="mbody">
      <div class="ssec">
        <div class="sstit">CORS PROXY</div>
        <div class="srow">
          <div><div class="slbl">Enable CORS Proxy</div><div class="sdesc">Route requests via Cloudflare Worker to fix browser CORS restrictions</div></div>
          <label class="tog"><input type="checkbox" id="set-cors" ${s.corsEnabled?'checked':''} onchange="syncCORSFromSettings()"><span class="tsl"></span></label>
        </div>
        <div class="fg" style="margin-top:10px"><label>PROXY URL</label><input id="set-proxy" value="${esc(s.proxyUrl||'https://square-credit-8186.donthulanithish53.workers.dev/?url=')}"></div>
        <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
          <button class="btn s" onclick="testProxy()">🔍 Test Connection</button>
          <span id="proxytestres" style="font-size:11px;color:var(--t3)"></span>
        </div>
      </div>
      <div class="ssec">
        <div class="sstit">REQUEST DEFAULTS</div>
        <div class="fg"><label>DEFAULT TIMEOUT (ms)</label><input id="set-timeout" type="number" value="${s.reqTimeout||30000}" style="width:150px"></div>
        <div class="srow">
          <div><div class="slbl">Automatically Follow Redirects</div></div>
          <label class="tog"><input type="checkbox" id="set-redir" ${s.followRedirects!==false?'checked':''}><span class="tsl"></span></label>
        </div>
      </div>
      <div class="ssec">
        <div class="sstit">TOOLS</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn s" style="background:var(--accent-bg);color:var(--accent)" onclick="closeModal();openGlobals()">🌐 Global Variables</button>
          <button class="btn s" style="background:var(--accent-bg);color:var(--accent)" onclick="closeModal();openCookies()">🍪 Cookie Manager</button>
          <button class="btn s" style="background:var(--accent-bg);color:var(--accent)" onclick="closeModal();openMocks()">🎭 Mock Server</button>
        </div>
      </div>
      <div class="ssec">
        <div class="sstit">DATA MANAGEMENT</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn s" onclick="exportAll()">⬇ Export All Data</button>
          <button class="btn s" onclick="importAll()">⬆ Import Backup</button>
          <button class="btn d" onclick="resetAll()">🗑 Reset Everything</button>
        </div>
      </div>
      <div class="ssec">
        <div class="sstit">KEYBOARD SHORTCUTS</div>
        <div style="font-size:11px;color:var(--t3);line-height:2.4">
          <b style="color:var(--t2)">Ctrl+Enter</b> — Send &nbsp;•&nbsp; <b style="color:var(--t2)">Ctrl+T</b> — New Tab &nbsp;•&nbsp; <b style="color:var(--t2)">Ctrl+W</b> — Close Tab<br>
          <b style="color:var(--t2)">Ctrl+S</b> — Save &nbsp;•&nbsp; <b style="color:var(--t2)">Ctrl+\\</b> — Toggle Sidebar &nbsp;•&nbsp; <b style="color:var(--t2)">Esc</b> — Cancel Request
        </div>
      </div>
      <div class="ssec">
        <div class="sstit">ABOUT</div>
        <p style="font-size:12px;color:var(--t3);line-height:1.8">PostmanWeb v4.0 — Complete API Platform in your browser.<br>
        All data stored locally. No server. No account needed.<br>
        Worker: <span style="color:var(--accent)">square-credit-8186.donthulanithish53.workers.dev</span></p>
      </div>
    </div>
    <div class="mfoot"><button class="btn s" onclick="closeModal()">Cancel</button><button class="btn p" onclick="saveSettings()">Save Settings</button></div>
  </div></div>`);
}

function syncCORSFromSettings() {
  const cb = document.getElementById('set-cors');
  if (cb) { APP.settings.corsEnabled = cb.checked; lsSave(); refreshCORSBtn(); }
}

async function testProxy() {
  const purl = document.getElementById('set-proxy').value.trim();
  const res = document.getElementById('proxytestres');
  res.textContent = '⏳ Testing...'; res.style.color = 'var(--t3)';
  try {
    const r = await fetch(purl + encodeURIComponent('https://httpbin.org/get'), { signal: AbortSignal.timeout(8000) });
    if (r.ok) { res.textContent = '✅ Worker is working!'; res.style.color = 'var(--ok)'; }
    else { res.textContent = `⚠ Worker replied: ${r.status}`; res.style.color = 'var(--warn)'; }
  } catch (e) { res.textContent = `❌ ${e.message}`; res.style.color = 'var(--err)'; }
}

function saveSettings() {
  APP.settings.corsEnabled = document.getElementById('set-cors').checked;
  APP.settings.proxyUrl = document.getElementById('set-proxy').value.trim();
  APP.settings.reqTimeout = parseInt(document.getElementById('set-timeout').value) || 30000;
  APP.settings.followRedirects = document.getElementById('set-redir').checked;
  lsSave(); refreshCORSBtn(); closeModal();
  notify('Settings saved!', 'success');
}

function exportAll() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ colls: APP.colls, envs: APP.envs, globals: APP.globals, history: APP.history, settings: APP.settings, cookies: APP.cookies, mocks: APP.mocks, version: '4.0', exported: new Date().toISOString() }, null, 2)], { type: 'application/json' }));
  a.download = `postmanweb_backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
}

function importAll() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
  inp.onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
      try {
        const d = JSON.parse(ev.target.result);
        if (d.colls) APP.colls = d.colls;
        if (d.envs) APP.envs = d.envs;
        if (d.globals) APP.globals = d.globals;
        if (d.history) APP.history = d.history;
        if (d.settings) APP.settings = d.settings;
        if (d.cookies) APP.cookies = d.cookies;
        if (d.mocks) APP.mocks = d.mocks;
        lsSave(); renderAll();
        notify('✅ Data imported!', 'success');
      } catch (e) { notify('Import error: ' + e.message, 'error'); }
    };
    r.readAsText(f);
  };
  inp.click();
}

function resetAll() {
  if (!confirm('This will permanently delete ALL data. Continue?')) return;
  if (!confirm('Last chance — really delete everything?')) return;
  localStorage.clear(); location.reload();
}

// ═══════════════════════════════════════════
// RESIZE HANDLE
// ═══════════════════════════════════════════
function initResize() {
  const h = document.getElementById('rizer');
  const wrap = document.getElementById('split');
  let drag = false, sy = 0, sh = 0;
  h.addEventListener('mousedown', e => { drag = true; sy = e.clientY; sh = document.getElementById('reqarea').offsetHeight; document.body.style.userSelect = 'none'; });
  document.addEventListener('mousemove', e => {
    if (!drag) return;
    const nh = Math.max(90, Math.min(wrap.offsetHeight - 90, sh + (e.clientY - sy)));
    document.getElementById('reqarea').style.height = nh + 'px';
  });
  document.addEventListener('mouseup', () => { drag = false; document.body.style.userSelect = ''; });
}

// ═══════════════════════════════════════════
// RENDER ALL
// ═══════════════════════════════════════════
function renderAll() { renderTabs(); renderColls(); renderHistory(); renderEnvs(); }

// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════
function init() {
  newTab();
  renderAll();
  initResize();
  refreshCORSBtn();
  refreshHistDot();
  renderCookiesPanel();

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key === 'Enter') { e.preventDefault(); sendRequest(); }
    if (ctrl && e.key === 't') { e.preventDefault(); newTab(); }
    if (ctrl && e.key === 'w') { e.preventDefault(); closeTab(APP.activeId); }
    if (ctrl && e.key === 's') { e.preventDefault(); saveToColl(); }
    if (ctrl && e.key === '\\') { e.preventDefault(); toggleSB(); }
    if (e.key === 'Escape' && _abort) cancelReq();
  });

  // Auto-update tab name from URL
  document.getElementById('urlin').addEventListener('input', e => {
    const t = getTab();
    if (t && e.target.value) {
      t.url = e.target.value;
      t.name = e.target.value.replace(/^https?:\/\//, '').split('?')[0].slice(0, 35) || 'New Request';
      renderTabs();
    }
  });

  document.getElementById('msel').addEventListener('change', colorMethod);
}

init();
