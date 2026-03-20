/* ============================================================
   POSTMANWEB v4 — app2.js  (Module 2 of 2)
   Response Display · History · Collections · Environments ·
   Globals · Code Gen · WebSocket · gRPC · Mock · Import ·
   Settings · Workspaces · Theme · Resize · Init
   ============================================================ */
'use strict';

// ─────────────────────────────────────────────────────────────
// IFRAME HELPERS
// ─────────────────────────────────────────────────────────────
function writeIframe(iframe, html) {
  if (!iframe) return;
  if (iframe._blobUrl) { URL.revokeObjectURL(iframe._blobUrl); iframe._blobUrl = null; }
  const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);
  iframe._blobUrl = blobUrl;
  iframe.src = blobUrl;
}

// ─────────────────────────────────────────────────────────────
// JSON HIGHLIGHT
// ─────────────────────────────────────────────────────────────
function jsonHL(json) {
  let s = JSON.stringify(json, null, 2);
  s = s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return s.replace(/("(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, m => {
    let c = 'jn';
    if (/^"/.test(m)) c = /:$/.test(m) ? 'jk' : 'js';
    else if (/true|false/.test(m)) c = 'jb';
    else if (/null/.test(m)) c = 'jl';
    return `<span class="${c}">${m}</span>`;
  });
}

function xmlHL(xml) {
  return esc(xml)
    .replace(/(&lt;\/?)([\w:-]+)/g, '$1<span class="jk">$2</span>')
    .replace(/([\w:-]+=)(&quot;[^&]*&quot;)/g, '<span class="jn">$1</span><span class="js">$2</span>');
}

// ─────────────────────────────────────────────────────────────
// PRETTY BODY RENDERER
// ─────────────────────────────────────────────────────────────
function buildPrettyContent(r) {
  if (!r) return '';
  if (r._isBinary && r._dataUrl) {
    const ct = getContentType(r);
    if (ct.startsWith('image/')) {
      return `<div style="padding:12px;text-align:center">
        <img src="${r._dataUrl}" alt="Image response"
          style="max-width:100%;max-height:60vh;border-radius:6px;box-shadow:0 2px 12px rgba(0,0,0,.3)">
        <div style="margin-top:8px;font-size:11px;color:var(--text3)">${esc(ct)} — ${formatBytes(r._size)}</div>
      </div>`;
    }
    return `<div style="padding:20px;color:var(--text3)">
      <div style="font-size:32px;margin-bottom:8px">📦</div>
      <div style="font-weight:600;margin-bottom:4px">Binary Response</div>
      <div style="font-size:12px">Content-Type: <code>${esc(ct)}</code></div>
      <div style="font-size:12px;margin-top:4px">Size: ${formatBytes(r._size)}</div>
      <div style="margin-top:12px;font-size:12px;color:var(--accent)">Use the ⬇ Download button to save this file.</div>
    </div>`;
  }
  if (isJsonResponse(r)) {
    try { return jsonHL(JSON.parse(r._body)); } catch { return esc(r._body); }
  }
  if (isXmlResponse(r)) {
    return xmlHL(r._body);
  }
  return esc(r._body);
}

// ─────────────────────────────────────────────────────────────
// RESPONSE DISPLAY
// ─────────────────────────────────────────────────────────────
function showResponse(r) {
  const pill   = document.getElementById('r-pill');
  const rtime  = document.getElementById('r-time');
  const rsize  = document.getElementById('r-size');
  const hint   = document.getElementById('r-hint');
  const acts   = document.getElementById('r-acts');
  const dlBtn  = document.getElementById('r-download-btn');
  const ctBadge= document.getElementById('resp-ct-badge');

  if (!r) {
    [pill,rtime,rsize,acts].forEach(el => { if(el) el.style.display='none'; });
    if (hint)    hint.style.display = '';
    if (ctBadge) ctBadge.style.display = 'none';
    if (dlBtn)   dlBtn.style.display = 'none';
    document.getElementById('resp-pretty').innerHTML = '';
    document.getElementById('resp-raw').textContent  = '';
    const iframe = document.getElementById('resp-preview');
    if (iframe) {
      if (iframe._blobUrl) { URL.revokeObjectURL(iframe._blobUrl); iframe._blobUrl = null; }
      iframe.src = 'about:blank';
    }
    return;
  }

  // Status pill
  pill.style.display = '';
  pill.textContent   = `${r.status} ${r.statusText}`;
  pill.className     = `spill ${r._mock ? 'smock' : 's' + Math.floor(r.status / 100)}`;

  // Time
  rtime.style.display = '';
  rtime.innerHTML = `Time: <b${r._time > 2000 ? ' class="slow"' : ''}>${r._time}ms</b>`;

  // Size
  rsize.style.display = '';
  rsize.innerHTML = `Size: <b>${formatBytes(r._size)}</b>`;

  hint.style.display = 'none';
  acts.style.display = '';

  // Content-type badge
  const label = getResponseLabel(r);
  if (label && ctBadge) {
    ctBadge.textContent = label;
    ctBadge.style.display = '';
  } else if (ctBadge) {
    ctBadge.style.display = 'none';
  }

  // Download button — show for binary/image
  if (dlBtn) {
    dlBtn.style.display = (r._isBinary && r._dataUrl) ? '' : 'none';
  }

  // ── Pretty panel ─────────────────────────────────────────
  document.getElementById('resp-pretty').innerHTML = buildPrettyContent(r);

  // ── Raw panel ────────────────────────────────────────────
  document.getElementById('resp-raw').textContent = r._body || '';

  // ── Preview panel ────────────────────────────────────────
  const iframe = document.getElementById('resp-preview');
  if (r._isBinary && r._dataUrl) {
    const ct = getContentType(r);
    if (ct.startsWith('image/')) {
      writeIframe(iframe,
        `<html><body style="margin:0;background:#1a1a2e;display:flex;align-items:center;justify-content:center;min-height:100vh">
          <img src="${r._dataUrl}" style="max-width:100%;max-height:100vh;object-fit:contain">
        </body></html>`);
    } else {
      writeIframe(iframe,
        `<html><body style="font-family:sans-serif;padding:30px;color:#888;background:#111;text-align:center">
          <div style="font-size:48px">📦</div>
          <p>Binary file — use ⬇ Download to save.</p>
          <p style="font-size:12px">Type: <code>${esc(ct)}</code> &nbsp; Size: ${formatBytes(r._size)}</p>
        </body></html>`);
    }
  } else if (isHtmlResponse(r)) {
    writeIframe(iframe, r._body);
  } else {
    writeIframe(iframe,
      `<html><body style="font-family:sans-serif;padding:20px;color:#666;background:#f9f9f9">
        <p style="font-size:14px">Preview available for HTML responses only.</p>
        <p style="font-size:12px;margin-top:8px">Content-Type: <code>${esc(getContentType(r) || 'unknown')}</code></p>
        <p style="font-size:12px">Use <strong>Pretty</strong> or <strong>Raw</strong> tab to view.</p>
      </body></html>`);
  }

  // ── Headers table ────────────────────────────────────────
  document.getElementById('r-headers-tbl').innerHTML =
    Object.entries(r._headers || {})
      .map(([k,v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('') ||
    `<tr><td colspan="2" style="color:var(--text3);padding:10px">No headers</td></tr>`;

  renderCookiesPanel();
}

function showErrorResp(msg, time) {
  const pill = document.getElementById('r-pill');
  pill.style.display = ''; pill.className = 'spill serr'; pill.textContent = 'Error';
  document.getElementById('r-time').style.display = '';
  document.getElementById('r-time').innerHTML = `Time: <b class="e">${time}ms</b>`;
  document.getElementById('r-size').style.display   = 'none';
  document.getElementById('r-hint').style.display   = 'none';
  document.getElementById('r-acts').style.display   = 'none';
  document.getElementById('resp-pretty').innerHTML  =
    `<span style="color:var(--err);white-space:pre-wrap">${esc(msg)}</span>`;
  document.getElementById('resp-raw').textContent = msg;
}

// ─────────────────────────────────────────────────────────────
// DOWNLOAD BINARY
// ─────────────────────────────────────────────────────────────
function downloadBinaryResp() {
  if (!_lastResponse?._dataUrl) return;
  const ct  = getContentType(_lastResponse);
  const ext = ct.split('/')[1]?.split(';')[0] || 'bin';
  const a   = document.createElement('a');
  a.href     = _lastResponse._dataUrl;
  a.download = `response.${ext}`;
  a.click();
}

// ─────────────────────────────────────────────────────────────
// COPY / SAVE RESPONSE
// ─────────────────────────────────────────────────────────────
function copyResponse() {
  const text = document.getElementById('resp-raw').textContent;
  navigator.clipboard.writeText(text).then(() => notify('Copied!','success'));
}
function saveRespFile() {
  if (_lastResponse?._isBinary && _lastResponse._dataUrl) {
    downloadBinaryResp(); return;
  }
  const content = document.getElementById('resp-raw').textContent;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type:'text/plain' }));
  a.download = 'response.txt'; a.click();
}

// ─────────────────────────────────────────────────────────────
// TEST RESULTS
// ─────────────────────────────────────────────────────────────
function renderTests() {
  const c = document.getElementById('test-output'), badge = document.getElementById('test-badge');
  if (!_testResults.length) {
    c.innerHTML = '<div class="empty-state"><div class="ei">🧪</div><p>No tests ran.</p></div>';
    badge.style.display = 'none'; return;
  }
  const pass = _testResults.filter(t => t.pass).length;
  badge.textContent = `${pass}/${_testResults.length}`; badge.style.display = '';
  badge.style.background = pass === _testResults.length ? 'var(--ok)' : pass === 0 ? 'var(--err)' : 'var(--warn)';
  badge.style.color = '#000';
  c.innerHTML =
    `<div class="test-summary">
       <span style="font-size:20px">${pass===_testResults.length?'✅':pass===0?'❌':'⚠️'}</span>
       <span style="font-weight:700">${pass} / ${_testResults.length} passed</span>
       <span style="color:var(--text3);font-size:11px">${_testResults.length-pass} failed</span>
     </div>` +
    _testResults.map(t =>
      `<div class="tr-item ${t.pass?'tr-pass':'tr-fail'}">
         <span class="tr-icon">${t.pass?'✅':'❌'}</span>
         <div>
           <div class="tr-name">${esc(t.name)}</div>
           ${t.error ? `<div class="tr-err">${esc(t.error)}</div>` : ''}
         </div>
       </div>`).join('');
}

function flushConsole() {
  document.getElementById('console-out').innerHTML =
    _consoleLogs.map(l =>
      `<div class="con-row ${l.type}"><span class="ct">${l.type}</span><span class="cm">${esc(l.msg)}</span></div>`
    ).join('');
}
function clearConsole() { _consoleLogs = []; flushConsole(); }

function renderCookiesPanel() {
  const p = document.getElementById('cookies-out'), domains = Object.keys(S.cookies);
  if (!domains.length) {
    p.innerHTML = '<div class="empty-state"><div class="ei">🍪</div><p>No cookies stored.</p></div>'; return;
  }
  p.innerHTML = domains.map(d =>
    `<div class="ck-domain">
       <div class="ck-domain-nm">${esc(d)}</div>
       ${Object.entries(S.cookies[d]).map(([k,v]) =>
         `<div class="ck-row"><span class="ck-name">${esc(k)}</span><span class="ck-val" title="${esc(v)}">${esc(v)}</span></div>`
       ).join('')}
     </div>`).join('');
}

// ─────────────────────────────────────────────────────────────
// ENLARGE / FULLSCREEN OVERLAY
// ─────────────────────────────────────────────────────────────
let _fsCurrentView = 'pretty';
let _fsPanel       = 'body';

function openEnlargeResp() {
  _fsPanel = 'body';
  const overlay = document.getElementById('fs-overlay');
  const title   = document.getElementById('fs-title');
  const toolbar = document.getElementById('fs-toolbar');
  const fsBody  = document.getElementById('fs-body');
  const copyBtn = document.getElementById('fs-copy-btn');
  const saveBtn = document.getElementById('fs-save-btn');

  title.textContent = 'Response Body';
  copyBtn.style.display = '';
  saveBtn.style.display = '';

  toolbar.innerHTML =
    `<button class="fs-tab${_fsCurrentView==='pretty'?' active':''}" onclick="fsSwitchView('pretty')">Pretty</button>
     <button class="fs-tab${_fsCurrentView==='raw'?' active':''}"    onclick="fsSwitchView('raw')">Raw</button>
     <button class="fs-tab${_fsCurrentView==='preview'?' active':''}" onclick="fsSwitchView('preview')">Preview</button>`;

  fsBuildBodyContent(_fsCurrentView, fsBody);
  overlay.style.display = 'flex';
}

function fsSwitchView(view) {
  _fsCurrentView = view;
  document.querySelectorAll('.fs-tab').forEach(b =>
    b.classList.toggle('active', b.textContent.toLowerCase() === view));
  fsBuildBodyContent(view, document.getElementById('fs-body'));
}

function fsBuildBodyContent(view, container) {
  const r = _lastResponse;
  if (!r) { container.innerHTML = '<p style="padding:20px;color:var(--text3)">No response yet.</p>'; return; }
  container.innerHTML = '';

  if (view === 'pretty') {
    const pre = document.createElement('pre');
    pre.innerHTML = buildPrettyContent(r);
    container.appendChild(pre);
  } else if (view === 'raw') {
    const pre = document.createElement('pre');
    pre.textContent = r._body || '';
    container.appendChild(pre);
  } else if (view === 'preview') {
    const iframe = document.createElement('iframe');
    iframe.sandbox = 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals';
    iframe.referrerPolicy = 'no-referrer';
    iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:none;background:#fff;';
    container.appendChild(iframe);
    if (r._isBinary && r._dataUrl) {
      const ct = getContentType(r);
      if (ct.startsWith('image/')) {
        writeIframe(iframe, `<html><body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="${r._dataUrl}" style="max-width:100%;max-height:100vh;object-fit:contain"></body></html>`);
      } else {
        writeIframe(iframe, `<html><body style="font-family:sans-serif;padding:30px;color:#888;text-align:center"><p>Binary — use ⬇ Download.</p></body></html>`);
      }
    } else {
      writeIframe(iframe, isHtmlResponse(r) ? r._body :
        `<html><body style="font-family:sans-serif;padding:20px;color:#666">Preview only available for HTML responses.</body></html>`);
    }
  }
}

function openEnlargePanel(panel) {
  _fsPanel = panel;
  const overlay = document.getElementById('fs-overlay');
  const title   = document.getElementById('fs-title');
  const toolbar = document.getElementById('fs-toolbar');
  const fsBody  = document.getElementById('fs-body');
  const copyBtn = document.getElementById('fs-copy-btn');
  const saveBtn = document.getElementById('fs-save-btn');
  toolbar.innerHTML = '';

  if (panel === 'headers') {
    title.textContent = 'Response Headers';
    copyBtn.style.display = ''; saveBtn.style.display = '';
    const r = _lastResponse;
    const table = document.createElement('table');
    table.className = 'rh-tbl';
    table.innerHTML = Object.entries(r?._headers || {})
      .map(([k,v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('') ||
      '<tr><td colspan="2" style="color:var(--text3);padding:14px">No headers</td></tr>';
    fsBody.innerHTML = ''; fsBody.appendChild(table);

  } else if (panel === 'cookies') {
    title.textContent = 'Cookies';
    copyBtn.style.display = 'none'; saveBtn.style.display = 'none';
    const clone = document.getElementById('cookies-out').cloneNode(true);
    clone.style.padding = '14px';
    fsBody.innerHTML = ''; fsBody.appendChild(clone);

  } else if (panel === 'tests') {
    title.textContent = 'Test Results';
    copyBtn.style.display = 'none'; saveBtn.style.display = 'none';
    const clone = document.getElementById('test-output').cloneNode(true);
    clone.style.padding = '14px';
    fsBody.innerHTML = ''; fsBody.appendChild(clone);

  } else if (panel === 'console') {
    title.textContent = 'Console';
    copyBtn.style.display = 'none'; saveBtn.style.display = 'none';
    const clone = document.getElementById('console-out').cloneNode(true);
    clone.style.padding = '0';
    fsBody.innerHTML = ''; fsBody.appendChild(clone);
  }

  overlay.style.display = 'flex';
}

function closeEnlarge() {
  document.getElementById('fs-overlay').style.display = 'none';
  document.querySelectorAll('#fs-body iframe').forEach(iframe => {
    if (iframe._blobUrl) { URL.revokeObjectURL(iframe._blobUrl); iframe._blobUrl = null; }
    iframe.src = 'about:blank';
  });
  document.getElementById('fs-body').innerHTML = '';
}

function fsAction(action) {
  if (action === 'copy') {
    let text = '';
    if (_fsPanel === 'body')    text = _lastResponse?._body || '';
    else if (_fsPanel === 'headers') text = Object.entries(_lastResponse?._headers||{}).map(([k,v])=>`${k}: ${v}`).join('\n');
    navigator.clipboard.writeText(text).then(() => notify('Copied!','success'));
  } else if (action === 'save') {
    if (_lastResponse?._isBinary && _lastResponse._dataUrl) { downloadBinaryResp(); return; }
    const content = _lastResponse?._body || '';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content],{type:'text/plain'}));
    a.download = 'response.txt'; a.click();
  }
}

// ─────────────────────────────────────────────────────────────
// PANEL SWITCHING
// ─────────────────────────────────────────────────────────────
function switchReqPanel(id) {
  document.querySelectorAll('#req-ptabs .ptab').forEach(t => t.classList.toggle('active', t.dataset.panel === id));
  document.querySelectorAll('.tpanel').forEach(p => p.classList.toggle('active', p.id === 'rp-' + id));
}
function switchRespPanel(id) {
  document.querySelectorAll('.rptab').forEach(t => t.classList.toggle('active', t.dataset.panel === id));
  document.querySelectorAll('.rtpanel').forEach(p => p.classList.toggle('active', p.id === 'rsp-' + id));
}
function switchRespBody(id) {
  document.querySelectorAll('.rbview').forEach(b => b.classList.toggle('active', b.dataset.view === id));
  document.querySelectorAll('.rbpanel').forEach(p => p.classList.toggle('active', p.id === 'rbp-' + id));
  if (id === 'preview' && _lastResponse) {
    const iframe = document.getElementById('resp-preview');
    if (!iframe.src || iframe.src === 'about:blank' || !iframe._blobUrl) {
      if (_lastResponse._isBinary && _lastResponse._dataUrl) {
        const ct = getContentType(_lastResponse);
        if (ct.startsWith('image/')) {
          writeIframe(iframe, `<html><body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="${_lastResponse._dataUrl}" style="max-width:100%;max-height:100vh;object-fit:contain"></body></html>`);
        }
      } else if (isHtmlResponse(_lastResponse)) {
        writeIframe(iframe, _lastResponse._body);
      }
    }
  }
}
function switchSB(id) {
  document.querySelectorAll('.sb-tab').forEach(t => t.classList.toggle('active', t.dataset.sb === id));
  document.querySelectorAll('.sb-panel').forEach(p => p.classList.toggle('active', p.id === 'sbp-' + id));
}
function toggleSB() { document.getElementById('sidebar').classList.toggle('hidden'); }

// ─────────────────────────────────────────────────────────────
// HISTORY  — stores full request body, replays on click
// ─────────────────────────────────────────────────────────────
function toggleHistRec() {
  S.settings.historyOn = document.getElementById('hist-toggle').checked;
  save(); refreshHistDot();
  notify(S.settings.historyOn ? 'History ON' : 'History OFF', 'info');
}
function refreshHistDot() {
  const d = document.getElementById('hist-dot'), t = document.getElementById('hist-toggle');
  if (d) d.className = 'hrec-dot' + (S.settings.historyOn === false ? ' off' : '');
  if (t) t.checked = S.settings.historyOn !== false;
}

function addHistory(entry) {
  if (S.settings.historyOn === false) return;
  S.history.unshift(entry);
  if (S.history.length > 500) S.history.pop();
  save(); renderHistory();
}

function renderHistory() {
  const list = document.getElementById('hist-list');
  refreshHistDot();
  if (!S.history.length) {
    list.innerHTML = '<div class="empty-state"><div class="ei">📭</div><p>No history yet.</p></div>'; return;
  }
  const pinned = S.history.filter(h => h.pinned === true);
  const recent  = S.history.filter(h => h.pinned !== true);

  const row = h => {
    const p = h.pinned === true;
    // Build a compact body preview for the tooltip
    let bodyPreview = '';
    if (h.bodyType === 'raw' && h.rawBody)       bodyPreview = h.rawBody.slice(0, 60);
    else if (h.bodyType === 'urlenc' && h.urlEncoded?.length) bodyPreview = h.urlEncoded.map(r=>`${r.k}=${r.v}`).join('&').slice(0,60);
    else if (h.bodyType === 'form' && h.formFields?.length)   bodyPreview = h.formFields.map(r=>r.k).join(', ').slice(0,60);
    else if (h.bodyType === 'graphql' && h.gqlQ)  bodyPreview = h.gqlQ.slice(0, 60);

    const statusClass = h.status >= 500 ? 'serr' : h.status >= 400 ? 'swarn' : h.status >= 200 ? 'sok' : '';

    return `<div class="hist-row${p?' pinned':''}" data-hid="${h.id}">
      <span class="mbadge ${h.method}" style="color:${MC[h.method]||'var(--text2)'}">${h.method}</span>
      <div class="hist-main">
        <span class="hist-url" title="${esc(h.url)}">${esc(h.url)}</span>
        ${bodyPreview ? `<span class="hist-body-preview" title="${esc(bodyPreview)}">${esc(bodyPreview.length >= 60 ? bodyPreview+'…' : bodyPreview)}</span>` : ''}
      </div>
      <span class="hist-status ${statusClass}">${h.status||''}</span>
      <span class="hist-time">${h.at||''}</span>
      <div class="hist-acts">
        <button class="hist-adv-btn" data-action="adv" data-hid="${h.id}" title="Advanced: repeat this request N times">Adv</button>
        <button class="hist-pin-btn" data-action="pin" data-hid="${h.id}" title="${p?'Unpin':'Pin'}">${p?'📌':'📍'}</button>
        <button class="hist-del-btn" data-action="del" data-hid="${h.id}" title="Delete">🗑</button>
      </div>
    </div>`;
  };

  let html = '';
  if (pinned.length) html += `<div class="hist-sec">📌 PINNED</div>` + pinned.map(row).join('');
  if (recent.length) { if(pinned.length) html += `<div class="hist-sec">🕐 RECENT</div>`; html += recent.map(row).join(''); }
  list.innerHTML = html;
}

function initHistoryEvents() {
  const list = document.getElementById('hist-list');
  list.addEventListener('click', function(e) {
    const advBtn = e.target.closest('[data-action="adv"]');
    if (advBtn) { e.stopPropagation(); e.preventDefault(); const h=S.history.find(x=>x.id===advBtn.dataset.hid); if(h)openAdvPopover(h,advBtn); return; }

    const pinBtn = e.target.closest('[data-action="pin"]');
    if (pinBtn) {
      e.stopPropagation(); e.preventDefault();
      const h = S.history.find(x => x.id === pinBtn.dataset.hid); if(!h)return;
      h.pinned = !h.pinned;
      S.history.sort((a,b) => (b.pinned===true?1:0)-(a.pinned===true?1:0));
      save(); renderHistory(); notify(h.pinned?'📌 Pinned':'Unpinned','info'); return;
    }

    const delBtn = e.target.closest('[data-action="del"]');
    if (delBtn) {
      e.stopPropagation(); e.preventDefault();
      S.history = S.history.filter(x => x.id !== delBtn.dataset.hid);
      save(); renderHistory(); return;
    }

    const row = e.target.closest('.hist-row');
    if (row) {
      const h = S.history.find(x => x.id === row.dataset.hid);
      if (h) replayHistoryEntry(h);
    }
  });
}

// Replay a history entry — restores full request including body
function replayHistoryEntry(h) {
  newTab({
    method:     h.method     || 'GET',
    url:        h.url        || '',
    name:       h.name       || h.url?.replace(/^https?:\/\//,'').slice(0,40) || 'Request',
    params:     h.params     || [],
    headers:    h.headers    || [],
    pathVars:   h.pathVars   || [],
    authType:   h.authType   || 'none',
    authData:   h.authData   || {},
    bodyType:   h.bodyType   || 'none',
    rawBody:    h.rawBody    || '',
    rawFmt:     h.rawFmt     || 'json',
    urlEncoded: h.urlEncoded || [],
    formData:   h.formFields || [],
    gqlQ:       h.gqlQ       || '',
    gqlV:       h.gqlV       || '',
    preScript:  h.preScript  || '',
    testScript: h.testScript || '',
  });
}

function clearHistory() {
  if (!confirm('Delete ALL history including pinned?')) return;
  S.history = []; save(); renderHistory(); notify('History cleared','info');
}
function unpinAllHistory() {
  const n = S.history.filter(h => h.pinned === true).length;
  if (!n) { notify('Nothing is pinned','info'); return; }
  S.history.forEach(h => { h.pinned = false; });
  save(); renderHistory(); notify(`Unpinned ${n} item${n!==1?'s':''} ✓`,'success');
}

// ─────────────────────────────────────────────────────────────
// ADVANCED REPEAT POPOVER
// ─────────────────────────────────────────────────────────────
function openAdvPopover(histEntry, anchorEl) {
  _advEntry = histEntry;
  const pop = document.getElementById('adv-popover');
  document.getElementById('adv-count').value   = '5';
  document.getElementById('adv-delay').value   = '0';
  document.getElementById('adv-results').innerHTML = '';
  document.getElementById('adv-pw').style.display  = 'none';
  document.getElementById('adv-pb').style.width    = '0';
  document.getElementById('adv-pt').textContent    = '0 / 0';
  document.getElementById('adv-run-btn').disabled  = false;
  document.getElementById('adv-run-btn').textContent = '▶ Run';
  _advRunning = false;

  const rect = anchorEl.getBoundingClientRect();
  pop.style.top  = Math.min(rect.bottom + 6, window.innerHeight - 420) + 'px';
  pop.style.left = Math.max(4, Math.min(rect.left - 100, window.innerWidth - 292)) + 'px';
  pop.style.display = 'block';
}

function closeAdvPopover() {
  _advRunning = false;
  document.getElementById('adv-popover').style.display = 'none';
  _advEntry = null;
}

async function runAdvRepeat() {
  if (!_advEntry || _advRunning) return;
  const count   = Math.max(1, Math.min(500, parseInt(document.getElementById('adv-count').value) || 5));
  const delay   = Math.max(0, parseInt(document.getElementById('adv-delay').value) || 0);
  const resultsEl = document.getElementById('adv-results');
  const pbWrap    = document.getElementById('adv-pw');
  const pb        = document.getElementById('adv-pb');
  const pt        = document.getElementById('adv-pt');
  const runBtn    = document.getElementById('adv-run-btn');

  _advRunning = true;
  runBtn.disabled = true; runBtn.textContent = '⏳ Running…';
  resultsEl.innerHTML = ''; pbWrap.style.display = 'block';
  pb.style.width = '0'; pt.textContent = `0 / ${count}`;

  const h = _advEntry;
  let passed = 0, failed = 0;

  for (let i = 0; i < count; i++) {
    if (!_advRunning) break;
    const num = i + 1;
    try {
      const url = resolveVars(h.url || '');
      const fHeaders = {};
      (h.headers || []).filter(x => x.on !== false && x.k).forEach(x => { fHeaders[x.k] = x.v; });
      const resp = await fetchDirect(url, h.method || 'GET', fHeaders, h.rawBody && h.bodyType==='raw' ? h.rawBody : null);
      const ok = resp.status >= 200 && resp.status < 300;
      if (ok) passed++; else failed++;
      const row = document.createElement('div');
      row.className = 'adv-result-row';
      row.innerHTML = `<span class="adv-result-num">#${num}</span>
        <span class="adv-result-stat ${ok?'ok':'err'}">${resp.status} ${resp.statusText}</span>
        <span class="adv-result-time">${resp._time}ms</span>`;
      resultsEl.appendChild(row);
      resultsEl.scrollTop = resultsEl.scrollHeight;
    } catch(e) {
      failed++;
      const row = document.createElement('div');
      row.className = 'adv-result-row';
      row.innerHTML = `<span class="adv-result-num">#${num}</span>
        <span class="adv-result-stat err">Error</span>
        <span class="adv-result-time" style="color:var(--err);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.message)}</span>`;
      resultsEl.appendChild(row);
      resultsEl.scrollTop = resultsEl.scrollHeight;
    }
    pb.style.width   = Math.round(num / count * 100) + '%';
    pt.textContent   = `${num} / ${count}`;
    pb.style.background = failed > 0 ? 'var(--warn)' : 'var(--ok)';
    if (delay > 0 && i < count - 1) await sleep(delay);
  }
  _advRunning = false;
  runBtn.disabled = false; runBtn.textContent = '▶ Run Again';
  notify(`Repeat done: ✅ ${passed}  ❌ ${failed}`, failed === 0 ? 'success' : 'warn');
}

// ─────────────────────────────────────────────────────────────
// COLLECTIONS
// ─────────────────────────────────────────────────────────────
function renderCollections() {
  const q = document.getElementById('coll-search').value.toLowerCase(), list = document.getElementById('coll-list');
  const filtered = S.collections.filter(c => c.name.toLowerCase().includes(q));
  if (!filtered.length) { list.innerHTML = '<div class="empty-state"><div class="ei">📂</div><p>No collections yet.</p></div>'; return; }
  list.innerHTML = filtered.map(c => renderCollItem(c)).join('');
}
function renderCollItem(c) {
  const items = (c.requests||[]).map(item => item._isFolder
    ? `<div class="coll-folder"><div class="folder-header" onclick="toggleFolder('${c.id}','${item.id}')"><span class="folder-arrow" id="fa-${item.id}">▶</span>📁 ${esc(item.name)}</div><div class="folder-reqs" id="fr-${item.id}">${(item.requests||[]).map(r=>reqRowHtml(c.id,r,true)).join('')}</div></div>`
    : reqRowHtml(c.id,item,false)).join('');
  return `<div class="coll-item" id="coll-${c.id}">
    <div class="coll-header" onclick="toggleColl('${c.id}')">
      <span class="coll-arrow" id="ca-${c.id}">▶</span>
      <span class="coll-name" title="${esc(c.name)}">${esc(c.name)}</span>
      <div class="coll-btns">
        <button class="icon-btn" title="Run"         onclick="runCollModal(event,'${c.id}')">▶</button>
        <button class="icon-btn" title="Add folder"  onclick="addFolder(event,'${c.id}')">📁</button>
        <button class="icon-btn" title="Add request" onclick="addToColl(event,'${c.id}')">+</button>
        <button class="icon-btn" title="Export"      onclick="exportColl(event,'${c.id}')">⬇</button>
        <button class="icon-btn del" title="Delete"  onclick="delColl(event,'${c.id}')">🗑</button>
      </div>
    </div>
    <div class="coll-reqs" id="cr-${c.id}">${items||'<div style="padding:8px;color:var(--text3);font-size:11px">Empty collection</div>'}</div>
  </div>`;
}
function reqRowHtml(collId, r, inFolder=false) {
  return `<div class="req-row${inFolder?' folder-req-row':''}" onclick="loadCollReq('${collId}','${r.id}')">
    <span class="mbadge ${r.method}" style="color:${MC[r.method]||'var(--text2)'}">${r.method}</span>
    <span class="req-name" title="${esc(r.name)}">${esc(r.name)}</span>
    <div class="req-btns">
      <button class="icon-btn" title="Duplicate" onclick="dupReq(event,'${collId}','${r.id}')">⧉</button>
      <button class="icon-btn del" title="Delete" onclick="delReq(event,'${collId}','${r.id}')">✕</button>
    </div>
  </div>`;
}
function toggleColl(id)        { document.getElementById('cr-'+id)?.classList.toggle('open'); document.getElementById('ca-'+id)?.classList.toggle('open'); }
function toggleFolder(cid,fid) { document.getElementById('fr-'+fid)?.classList.toggle('open'); document.getElementById('fa-'+fid)?.classList.toggle('open'); }
function addFolder(e,collId) {
  e.stopPropagation(); const name=prompt('Folder name:'); if(!name)return;
  const coll=S.collections.find(c=>c.id===collId); if(!coll)return;
  if(!coll.requests)coll.requests=[];
  coll.requests.push({id:uid(),name,_isFolder:true,requests:[]});
  save(); renderCollections();
}

function runCollModal(e, id) {
  e.stopPropagation();
  const coll = S.collections.find(c=>c.id===id);
  if (!coll?.requests?.length) { notify('Collection is empty','error'); return; }
  const reqs = (coll.requests||[]).filter(r=>!r._isFolder);
  openModal(`<div class="modal-bg"><div class="modal lg"><div class="mh"><span class="mh-title">▶ Collection Runner — ${esc(coll.name)}</span><button class="m-close" onclick="closeModal()">✕</button></div><div class="mb">
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px">
      <div class="fg"><label>ITERATIONS</label><input type="number" id="cr-iter" value="1" min="1" max="1000"></div>
      <div class="fg"><label>DELAY (ms)</label><input type="number" id="cr-delay" value="0" min="0"></div>
      <div class="fg"><label>STOP ON ERROR</label><label class="toggle" style="margin-top:6px"><input type="checkbox" id="cr-stop"><span class="t-slider"></span></label></div>
    </div>
    <div class="fg"><label>DATA FILE (CSV/JSON)</label><input type="file" id="cr-data" accept=".json,.csv"></div>
    <div style="margin-bottom:10px"><div class="field-label">SELECT REQUESTS</div>
      ${reqs.map(r=>`<div class="cr-req-item"><input type="checkbox" class="cr-req-chk kv-chk" data-rid="${r.id}" checked><span class="mbadge ${r.method}" style="color:${MC[r.method]||'var(--text2)'}">${r.method}</span><span>${esc(r.name)}</span></div>`).join('')}
    </div>
    <div class="cr-progress-wrap"><div class="cr-progress-bar" id="cr-bar"></div></div>
    <div id="cr-results" style="max-height:280px;overflow-y:auto;"></div>
  </div><div class="mf"><button class="btn secondary" onclick="closeModal()">Close</button><button class="btn primary" onclick="doRunColl('${id}')">▶ Run</button></div></div></div>`);
}
async function doRunColl(id) {
  const coll=S.collections.find(c=>c.id===id);if(!coll)return;
  const iters=parseInt(document.getElementById('cr-iter')?.value)||1,delay=parseInt(document.getElementById('cr-delay')?.value)||0,stop=document.getElementById('cr-stop')?.checked;
  const checkedIds=new Set([...document.querySelectorAll('.cr-req-chk:checked')].map(el=>el.dataset.rid));
  const reqs=(coll.requests||[]).filter(r=>!r._isFolder&&checkedIds.has(r.id));
  if(!reqs.length){notify('No requests selected','error');return;}
  let dataRows=[{}];const dataFile=document.getElementById('cr-data')?.files?.[0];
  if(dataFile){try{const txt=await dataFile.text();if(dataFile.name.endsWith('.json')){dataRows=JSON.parse(txt);if(!Array.isArray(dataRows))dataRows=[dataRows];}else{const lines=txt.trim().split('\n'),hdrs=lines[0].split(',').map(h=>h.trim().replace(/^"|"$/g,''));dataRows=lines.slice(1).map(line=>{const vals=line.split(',').map(v=>v.trim().replace(/^"|"$/g,''));return Object.fromEntries(hdrs.map((h,i)=>[h,vals[i]||'']));});}}catch(e){notify('Data file error: '+e.message,'error');return;}}
  const total=iters*dataRows.length*reqs.length;let done=0,passed=0,failed=0;
  const resultEl=document.getElementById('cr-results');resultEl.innerHTML='';
  for(let iter=0;iter<iters;iter++){for(const dataRow of dataRows){_iterInfo={iteration:iter,iterationCount:iters,dataRow};for(const req of reqs){
    try{
      const url=resolveVars(req.url||'',dataRow);const h={};
      (req.headers||[]).filter(x=>x.on!==false&&(x.k||x.key)).forEach(x=>{h[resolveVars(x.k||x.key,dataRow)]=resolveVars(x.v||x.value||'',dataRow);});
      if(req.preScript?.trim()){const pm=buildPM(null,coll.variables||{});runScript(req.preScript,pm);}
      const ro=await fetchDirect(url,req.method||'GET',h,req.rawBody&&!['GET','HEAD'].includes(req.method)?resolveVars(req.rawBody,dataRow):null);
      _testResults=[];if(req.testScript?.trim()){const pm=buildPM(ro,coll.variables||{});runScript(req.testScript,pm);}
      const pt2=_testResults.filter(t=>t.pass).length,isOk=ro.status>=200&&ro.status<300&&(!_testResults.length||pt2===_testResults.length);
      if(isOk)passed++;else failed++;
      resultEl.innerHTML+=`<div class="cr-result-item ${isOk?'pass':'fail'}"><span>${isOk?'✅':'❌'}</span><div><div style="font-weight:600;font-size:12px">[${iter+1}/${iters}] ${esc(req.name)} — ${ro.status} ${ro.statusText}</div>${_testResults.map(t=>`<div style="font-size:11px;color:${t.pass?'var(--ok)':'var(--err)'};margin-top:2px">${t.pass?'✓':'✗'} ${esc(t.name)}${t.error?' — '+esc(t.error):''}</div>`).join('')}</div></div>`;
      if(!isOk&&stop){notify('Stopped on error','warn');return;}
    }catch(err){failed++;resultEl.innerHTML+=`<div class="cr-result-item fail"><span>❌</span><div><div style="font-weight:600;font-size:12px">${esc(req.name)}</div><div style="font-size:11px;color:var(--err)">${esc(err.message)}</div></div></div>`;if(stop){notify('Stopped on error','warn');return;}}
    done++;const bar=document.getElementById('cr-bar');if(bar)bar.style.width=Math.round(done/total*100)+'%';resultEl.scrollTop=resultEl.scrollHeight;if(delay>0)await sleep(delay);
  }}}
  notify(`Runner done: ✅ ${passed} passed  ❌ ${failed} failed`,failed===0?'success':'warn');
}

function openNewColl(){openModal(`<div class="modal-bg"><div class="modal sm"><div class="mh"><span class="mh-title">New Collection</span><button class="m-close" onclick="closeModal()">✕</button></div><div class="mb"><div class="fg"><label>NAME</label><input id="nc-name" placeholder="My Collection" autofocus></div><div class="fg"><label>DESCRIPTION</label><textarea id="nc-desc" rows="2" style="width:100%;resize:none" placeholder="Optional"></textarea></div></div><div class="mf"><button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="createColl()">Create</button></div></div></div>`);setTimeout(()=>document.getElementById('nc-name')?.focus(),50);}
function createColl(){const name=document.getElementById('nc-name').value.trim();if(!name){notify('Name required','error');return;}S.collections.push({id:uid(),name,desc:document.getElementById('nc-desc').value,requests:[],variables:{},created:Date.now()});save();renderCollections();closeModal();notify('Collection created!','success');}
function delColl(e,id){e.stopPropagation();if(!confirm('Delete this collection?'))return;S.collections=S.collections.filter(c=>c.id!==id);save();renderCollections();}
function addToColl(e,id){e.stopPropagation();saveTabUI();const tab=getActiveTab(),coll=S.collections.find(c=>c.id===id);if(!coll||!tab)return;const name=prompt('Request name:',tab.name||'New Request');if(!name)return;if(!coll.requests)coll.requests=[];coll.requests.push({id:uid(),name,method:tab.method||'GET',url:tab.url||'',headers:tab.headers||[],params:tab.params||[],rawBody:tab.rawBody||'',bodyType:tab.bodyType||'none',rawFmt:tab.rawFmt||'json',authType:tab.authType||'none',authData:tab.authData||{},preScript:tab.preScript||'',testScript:tab.testScript||''});save();renderCollections();notify('Saved to collection!','success');}
function saveToCollection(){saveTabUI();const tab=getActiveTab();if(!S.collections.length){openNewColl();return;}openModal(`<div class="modal-bg"><div class="modal sm"><div class="mh"><span class="mh-title">💾 Save Request</span><button class="m-close" onclick="closeModal()">✕</button></div><div class="mb"><div class="fg"><label>REQUEST NAME</label><input id="sr-name" value="${esc(tab?.name||'New Request')}"></div><div class="fg"><label>COLLECTION</label><select id="sr-coll" style="width:100%">${S.collections.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div></div><div class="mf"><button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="doSave()">Save</button></div></div></div>`);}
function doSave(){const name=document.getElementById('sr-name').value.trim(),id=document.getElementById('sr-coll').value;const coll=S.collections.find(c=>c.id===id),tab=getActiveTab();if(!coll||!name)return;if(!coll.requests)coll.requests=[];coll.requests.push({id:uid(),name,method:tab?.method||'GET',url:tab?.url||'',headers:tab?.headers||[],params:tab?.params||[],rawBody:tab?.rawBody||'',bodyType:tab?.bodyType||'none',rawFmt:tab?.rawFmt||'json',authType:tab?.authType||'none',authData:tab?.authData||{},preScript:tab?.preScript||'',testScript:tab?.testScript||''});if(tab)tab.name=name;save();renderCollections();renderTabs();closeModal();notify('Saved!','success');}
function loadCollReq(cid,rid){const coll=S.collections.find(c=>c.id===cid);let req=coll?.requests?.find(r=>r.id===rid);if(!req){for(const item of coll?.requests||[]){if(item._isFolder){req=item.requests?.find(r=>r.id===rid);if(req)break;}}}if(!req)return;newTab({...req});}
function dupReq(e,cid,rid){e.stopPropagation();const coll=S.collections.find(c=>c.id===cid),req=coll?.requests?.find(r=>r.id===rid);if(!req||!coll)return;coll.requests.push({...req,id:uid(),name:req.name+' (copy)'});save();renderCollections();notify('Duplicated!','success');}
function delReq(e,cid,rid){e.stopPropagation();const coll=S.collections.find(c=>c.id===cid);if(!coll)return;coll.requests=coll.requests.filter(r=>r.id!==rid);save();renderCollections();}

function mapToPostman(r){return{name:r.name,request:{method:r.method||'GET',url:{raw:r.url||'',host:[],path:[],query:[],variable:[]},header:(r.headers||[]).filter(h=>h.k).map(h=>({key:h.k,value:h.v,disabled:!h.on})),body:r.bodyType!=='none'?{mode:r.bodyType==='raw'?'raw':r.bodyType,raw:r.rawBody||''}:undefined,auth:r.authType!=='none'?{type:r.authType}:undefined},event:[...(r.preScript?[{listen:'prerequest',script:{exec:r.preScript.split('\n'),type:'text/javascript'}}]:[]),...(r.testScript?[{listen:'test',script:{exec:r.testScript.split('\n'),type:'text/javascript'}}]:[])]}}
function exportColl(e,id){e.stopPropagation();const coll=S.collections.find(c=>c.id===id);if(!coll)return;dl(JSON.stringify({info:{name:coll.name,description:coll.desc||'',schema:'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'},variable:Object.entries(coll.variables||{}).map(([k,v])=>({key:k,value:v})),item:(coll.requests||[]).map(r=>r._isFolder?{name:r.name,item:(r.requests||[]).map(mapToPostman)}:mapToPostman(r))},null,2),coll.name.replace(/\s+/g,'_')+'.postman_collection.json');notify('Exported!','success');}
function exportAllColls(){dl(JSON.stringify(S.collections,null,2),'postmanweb_collections.json');notify('All collections exported!','success');}

// ─────────────────────────────────────────────────────────────
// ENVIRONMENTS
// ─────────────────────────────────────────────────────────────
function renderEnvs(){const list=document.getElementById('env-list');if(!S.envs.length){list.innerHTML='<div class="empty-state"><div class="ei">🌍</div><p>No environments.</p></div>';return;}list.innerHTML=S.envs.map(e=>`<div class="env-row${e.id===S.activeEnv?' active-env':''}" onclick="setEnv('${e.id}')"><div class="env-dot${e.id===S.activeEnv?' on':''}"></div><span class="env-nm">${esc(e.name)}</span><button class="btn-s" onclick="editEnv(event,'${e.id}')">Edit</button><button class="btn-s" onclick="exportEnv(event,'${e.id}')">⬇</button><button class="btn-s" onclick="delEnv(event,'${e.id}')">🗑</button></div>`).join('');refreshEnvQuick();}
function refreshEnvQuick(){const sel=document.getElementById('env-quick');if(!sel)return;sel.innerHTML='<option value="">No Environment</option>'+S.envs.map(e=>`<option value="${e.id}"${e.id===S.activeEnv?' selected':''}>${esc(e.name)}</option>`).join('');}
function quickEnvSwitch(id){S.activeEnv=id||null;save();renderEnvs();notify(id?`Env: ${S.envs.find(e=>e.id===id)?.name}`:'No environment','info');}
function setEnv(id){S.activeEnv=S.activeEnv===id?null:id;save();renderEnvs();const e=S.envs.find(e=>e.id===S.activeEnv);notify(S.activeEnv?`Env: ${e?.name}`:'No environment','info');}
function openNewEnv(){openModal(`<div class="modal-bg"><div class="modal sm"><div class="mh"><span class="mh-title">New Environment</span><button class="m-close" onclick="closeModal()">✕</button></div><div class="mb"><div class="fg"><label>NAME</label><input id="ne-name" placeholder="Production" autofocus></div></div><div class="mf"><button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="createEnv()">Create</button></div></div></div>`);setTimeout(()=>document.getElementById('ne-name')?.focus(),50);}
function createEnv(){const name=document.getElementById('ne-name').value.trim();if(!name)return;const env={id:uid(),name,variables:{}};S.envs.push(env);save();renderEnvs();closeModal();editEnv(null,env.id);}
function editEnv(e,id){if(e)e.stopPropagation();const env=S.envs.find(x=>x.id===id);if(!env)return;openModal(`<div class="modal-bg"><div class="modal lg"><div class="mh"><span class="mh-title">Edit: ${esc(env.name)}</span><button class="m-close" onclick="closeModal()">✕</button></div><div class="mb"><div id="ev-list">${Object.entries(env.variables||{}).map(([k,v])=>`<div class="ev-row"><input placeholder="Variable" value="${esc(k)}"><input placeholder="Value" value="${esc(v)}"><button class="ev-del" onclick="this.parentElement.remove()">✕</button></div>`).join('')}</div><button class="add-row-btn" onclick="addEvRow()" style="margin-top:8px">+ Add Variable</button></div><div class="mf"><button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveEnv('${id}')">Save</button></div></div></div>`);}
function addEvRow(){const div=document.createElement('div');div.className='ev-row';div.innerHTML='<input placeholder="Variable"><input placeholder="Value"><button class="ev-del" onclick="this.parentElement.remove()">✕</button>';document.getElementById('ev-list').appendChild(div);}
function saveEnv(id){const env=S.envs.find(x=>x.id===id);if(!env)return;env.variables={};document.querySelectorAll('#ev-list .ev-row').forEach(row=>{const[k,v]=row.querySelectorAll('input');if(k.value.trim())env.variables[k.value.trim()]=v.value;});save();renderEnvs();closeModal();notify('Environment saved!','success');}
function delEnv(e,id){e.stopPropagation();if(!confirm('Delete this environment?'))return;S.envs=S.envs.filter(x=>x.id!==id);if(S.activeEnv===id)S.activeEnv=null;save();renderEnvs();}
function exportEnv(e,id){e.stopPropagation();const env=S.envs.find(x=>x.id===id);if(!env)return;dl(JSON.stringify({id:env.id,name:env.name,values:Object.entries(env.variables||{}).map(([k,v])=>({key:k,value:v,enabled:true}))},null,2),env.name.replace(/\s+/g,'_')+'.postman_environment.json');}

// ─────────────────────────────────────────────────────────────
// GLOBALS
// ─────────────────────────────────────────────────────────────
function openGlobals(){openModal(`<div class="modal-bg"><div class="modal lg"><div class="mh"><span class="mh-title">🌐 Global Variables</span><button class="m-close" onclick="closeModal()">✕</button></div><div class="mb"><div id="gv-list">${Object.entries(S.globals).map(([k,v])=>`<div class="ev-row"><input placeholder="Variable" value="${esc(k)}"><input placeholder="Value" value="${esc(v)}"><button class="ev-del" onclick="this.parentElement.remove()">✕</button></div>`).join('')}</div><button class="add-row-btn" onclick="addGVRow()" style="margin-top:8px">+ Add Variable</button></div><div class="mf"><button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveGlobals()">Save</button></div></div></div>`);}
function addGVRow(){const div=document.createElement('div');div.className='ev-row';div.innerHTML='<input placeholder="Variable"><input placeholder="Value"><button class="ev-del" onclick="this.parentElement.remove()">✕</button>';document.getElementById('gv-list').appendChild(div);}
function saveGlobals(){S.globals={};document.querySelectorAll('#gv-list .ev-row').forEach(row=>{const[k,v]=row.querySelectorAll('input');if(k.value.trim())S.globals[k.value.trim()]=v.value;});save();closeModal();notify('Globals saved!','success');}

// ─────────────────────────────────────────────────────────────
// CODE GENERATION
// ─────────────────────────────────────────────────────────────
function openCodegen(){
  saveTabUI();
  openModal(`<div class="modal-bg"><div class="modal xl"><div class="mh"><span class="mh-title">{ } Code Snippet</span><button class="m-close" onclick="closeModal()">✕</button></div><div class="mb"><div class="lang-tabs">${['cURL','JavaScript (Fetch)','JavaScript (Axios)','Python (requests)','Java (OkHttp)','C# (HttpClient)','Go (net/http)','PHP (Guzzle)','Ruby','Swift','Kotlin','Rust','Node.js','PowerShell'].map(l=>`<button class="lang-tab${l==='cURL'?' active':''}" onclick="switchLang('${esc(l)}',this)">${l}</button>`).join('')}</div><textarea id="cg-out" readonly spellcheck="false"></textarea><div style="display:flex;gap:8px;margin-top:10px"><button class="btn primary" onclick="copyCG()">📋 Copy Code</button></div></div></div></div>`);
  genCode('cURL');
}
function switchLang(lang,btn){document.querySelectorAll('.lang-tab').forEach(b=>b.classList.remove('active'));btn.classList.add('active');genCode(lang);}
function copyCG(){navigator.clipboard.writeText(document.getElementById('cg-out').value).then(()=>notify('Copied!','success'));}
function genCode(lang){
  const method=document.getElementById('method-sel').value,url=document.getElementById('url-in').value;
  const hRows=readKV('headers').filter(h=>h.on!==false&&h.k);
  const authType=document.getElementById('auth-sel')?.value;const authH={};
  if(authType==='bearer'){const t=document.getElementById('a-token')?.value;if(t)authH['Authorization']='Bearer '+t;}
  else if(authType==='basic'){const u=document.getElementById('a-user')?.value||'',p=document.getElementById('a-pass')?.value||'';authH['Authorization']='Basic '+btoa(u+':'+p);}
  else if(authType==='apikey'&&document.getElementById('a-key-in')?.value==='header'){const k=document.getElementById('a-key')?.value,v=document.getElementById('a-key-val')?.value;if(k&&v)authH[k]=v;}
  else if(authType==='oauth2'){const t=document.getElementById('a-o2')?.value;if(t)authH['Authorization']=(document.getElementById('a-o2p')?.value||'Bearer')+' '+t;}
  const rawBody=document.getElementById('code-raw')?.value||'';
  const allH={...Object.fromEntries(hRows.map(h=>[h.k,h.v])),...authH};
  const hasBody=_bodyType==='raw'&&rawBody;
  const hJ=JSON.stringify(allH,null,2),hJ4=JSON.stringify(allH,null,4);
  const codes={
    'cURL':()=>{let c=`curl --location --request ${method} '${url}'`;Object.entries(allH).forEach(([k,v])=>{c+=` \\\n  --header '${k}: ${v}'`;});if(hasBody)c+=` \\\n  --data-raw '${rawBody.replace(/'/g,"'\\''")}'`;return c;},
    'JavaScript (Fetch)':()=>`const myHeaders = new Headers(${hJ});\n\nconst requestOptions = {\n  method: "${method}",\n  headers: myHeaders,\n  ${hasBody?`body: ${JSON.stringify(rawBody)},\n  `:''}redirect: "follow"\n};\n\nfetch("${url}", requestOptions)\n  .then(response => response.json())\n  .then(result => console.log(result))\n  .catch(error => console.error("Error:", error));`,
    'JavaScript (Axios)':()=>{const cfg={method:method.toLowerCase(),url,headers:allH};if(hasBody){try{cfg.data=JSON.parse(rawBody);}catch{cfg.data=rawBody;}}return`import axios from 'axios';\n\nconst config = ${JSON.stringify(cfg,null,2)};\n\naxios(config)\n  .then(response => console.log(JSON.stringify(response.data)))\n  .catch(error => console.error(error));`;},
    'Python (requests)':()=>{let c=`import requests\nimport json\n\nurl = "${url}"\n\nheaders = ${hJ4}\n`;if(hasBody)c+=`\npayload = json.dumps(${rawBody})\n\nresponse = requests.request("${method}", url, headers=headers, data=payload)`;else c+=`\nresponse = requests.request("${method}", url, headers=headers)`;return c+'\n\nprint(response.status_code)\nprint(response.json())';},
    'Java (OkHttp)':()=>{const hStr=Object.entries(allH).map(([k,v])=>`.addHeader("${k}", "${v}")`).join('\n    ');return`OkHttpClient client = new OkHttpClient().newBuilder().build();\n${hasBody?`MediaType mediaType = MediaType.parse("application/json");\nRequestBody body = RequestBody.create(mediaType, ${JSON.stringify(rawBody)});\n`:''}\nRequest request = new Request.Builder()\n    .url("${url}")\n    .method("${method}", ${hasBody?'body':'null'})\n    ${hStr}\n    .build();\n\nResponse response = client.newCall(request).execute();\nSystem.out.println(response.body().string());`;},
    'C# (HttpClient)':()=>{const hStr=Object.entries(allH).map(([k,v])=>`client.DefaultRequestHeaders.Add("${k}", "${v}");`).join('\n');return`using System.Net.Http;\nusing System.Text;\n\nvar client = new HttpClient();\n${hStr}\n${hasBody?`var content = new StringContent(${JSON.stringify(rawBody)}, Encoding.UTF8, "application/json");\nvar response = await client.${method[0]+method.slice(1).toLowerCase()}Async("${url}", content);`:`var response = await client.${method[0]+method.slice(1).toLowerCase()}Async("${url}");`}\nvar body = await response.Content.ReadAsStringAsync();\nConsole.WriteLine(body);`;},
    'Go (net/http)':()=>{const bl=hasBody?`strings.NewReader(${JSON.stringify(rawBody)})`:'nil';const hStr=Object.entries(allH).map(([k,v])=>`  req.Header.Add("${k}", "${v}")`).join('\n');return`package main\n\nimport (\n  "fmt"\n  "net/http"\n  "io/ioutil"\n  "strings"\n)\n\nfunc main() {\n  client := &http.Client{}\n  payload := ${bl}\n  req, _ := http.NewRequest("${method}", "${url}", payload)\n${hStr}\n  res, _ := client.Do(req)\n  defer res.Body.Close()\n  body, _ := ioutil.ReadAll(res.Body)\n  fmt.Println(string(body))\n}`;},
    'PHP (Guzzle)':()=>{const hStr=Object.entries(allH).map(([k,v])=>`    '${k}' => '${v}'`).join(',\n');return`<?php\n\n$client = new \\GuzzleHttp\\Client();\n\n$response = $client->request('${method}', '${url}', [\n  'headers' => [\n${hStr}\n  ],\n${hasBody?`  'body' => ${JSON.stringify(rawBody)},\n`:''}]);\n\necho $response->getBody()->getContents();`;},
    'Ruby':()=>`require 'net/http'\nrequire 'json'\n\nuri = URI('${url}')\nhttp = Net::HTTP.new(uri.host, uri.port)\nhttp.use_ssl = uri.scheme == 'https'\n\nrequest = Net::HTTP::${method[0]+method.slice(1).toLowerCase()}.new(uri)\n${Object.entries(allH).map(([k,v])=>`request['${k}'] = '${v}'`).join('\n')}\n${hasBody?`request.body = ${JSON.stringify(rawBody)}\n`:''}\nresponse = http.request(request)\nputs response.body`,
    'Swift':()=>{const hStr=Object.entries(allH).map(([k,v])=>`request.setValue("${v}", forHTTPHeaderField: "${k}")`).join('\n');return`import Foundation\n\nvar request = URLRequest(url: URL(string: "${url}")!)\nrequest.httpMethod = "${method}"\n${hStr}\n${hasBody?`request.httpBody = Data(${JSON.stringify(rawBody)}.utf8)\n`:''}\nURLSession.shared.dataTask(with: request) { data, response, error in\n    if let data = data { print(String(data: data, encoding: .utf8)!) }\n}.resume()`;},
    'Kotlin':()=>{const hStr=Object.entries(allH).map(([k,v])=>`.addHeader("${k}", "${v}")`).join('\n    ');return`import okhttp3.*\n\nval client = OkHttpClient()\n${hasBody?`val body = "${rawBody}".toRequestBody("application/json".toMediaType())\n`:''}\nval request = Request.Builder()\n    .url("${url}")\n    ${hasBody?`.${method.toLowerCase()}(body)`:`.${method.toLowerCase()}()`}\n    ${hStr}\n    .build()\n\nval response = client.newCall(request).execute()\nprintln(response.body?.string())`;},
    'Rust':()=>{const hStr=Object.entries(allH).map(([k,v])=>`.header("${k}", "${v}")`).join('\n    ');return`use reqwest;\n\n#[tokio::main]\nasync fn main() -> Result<(), Box<dyn std::error::Error>> {\n    let client = reqwest::Client::new();\n    let res = client.${method.toLowerCase()}("${url}")\n    ${hStr}\n    ${hasBody?`.body(${JSON.stringify(rawBody)})\n    `:''}.send().await?;\n    println!("{}", res.text().await?);\n    Ok(())\n}`;},
    'Node.js':()=>`const https = require('https');\nconst url = new URL('${url}');\n\nconst options = {\n  hostname: url.hostname,\n  port: url.port || 443,\n  path: url.pathname + url.search,\n  method: '${method}',\n  headers: ${hJ}\n};\n\nconst req = https.request(options, res => {\n  let data = '';\n  res.on('data', chunk => data += chunk);\n  res.on('end', () => console.log(data));\n});\n${hasBody?`req.write(${JSON.stringify(rawBody)});\n`:''}req.on('error', console.error);\nreq.end();`,
    'PowerShell':()=>{const hStr=Object.entries(allH).map(([k,v])=>`  '${k}' = '${v}'`).join('\n');return`$headers = @{\n${hStr}\n}\n\n${hasBody?`$body = ${JSON.stringify(rawBody)}\n\n`:''}$response = Invoke-RestMethod -Method ${method} -Uri '${url}' -Headers $headers${hasBody?' -Body $body -ContentType "application/json"':''}\n$response | ConvertTo-Json`;},
  };
  const out=document.getElementById('cg-out');if(out)out.value=(codes[lang]||codes['cURL'])();
}

// ─────────────────────────────────────────────────────────────
// WEBSOCKET
// ─────────────────────────────────────────────────────────────
function openWS(){openModal(`<div class="modal-bg"><div class="modal lg"><div class="mh"><span class="mh-title">🔌 WebSocket Client</span><button class="m-close" onclick="closeModal();wsDisconnect()">✕</button></div><div class="mb"><div style="display:flex;gap:8px;margin-bottom:10px"><input id="ws-url" type="text" placeholder="wss://echo.websocket.org" style="flex:1"><button class="btn primary" id="ws-btn" onclick="wsToggle()">Connect</button></div><div style="display:flex;gap:8px;margin-bottom:10px"><input id="ws-msg" type="text" placeholder='{"type":"ping"}' style="flex:1"><button class="btn secondary" onclick="wsSend()">Send</button></div><div id="ws-msgs" style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);min-height:200px;max-height:350px;overflow-y:auto;padding:4px"></div></div><div class="mf"><button class="btn secondary" onclick="closeModal();wsDisconnect()">Close</button></div></div></div>`);}
function wsToggle(){if(_wsConn&&_wsConn.readyState===WebSocket.OPEN)wsDisconnect();else wsConnect();}
function wsConnect(){const url=document.getElementById('ws-url')?.value?.trim();if(!url){notify('Enter WebSocket URL','error');return;}try{_wsConn=new WebSocket(url);wsLog(`• Connecting to ${url}...`,'sys');_wsConn.onopen=()=>{wsLog('✅ Connected!','sys');const b=document.getElementById('ws-btn');if(b){b.textContent='Disconnect';b.style.background='var(--err)';}};_wsConn.onmessage=e=>wsLog('← '+e.data,'recv');_wsConn.onerror=()=>wsLog('❌ Error','sys');_wsConn.onclose=()=>{wsLog('• Closed','sys');const b=document.getElementById('ws-btn');if(b){b.textContent='Connect';b.style.background='';}}}catch(e){wsLog('❌ '+e.message,'sys');}}
function wsDisconnect(){if(_wsConn){_wsConn.close();_wsConn=null;}}
function wsSend(){const msg=document.getElementById('ws-msg')?.value?.trim();if(!msg)return;if(!_wsConn||_wsConn.readyState!==WebSocket.OPEN){notify('Not connected','error');return;}_wsConn.send(msg);wsLog('→ '+msg,'sent');document.getElementById('ws-msg').value='';}
function wsLog(msg,cls){const d=document.getElementById('ws-msgs');if(!d)return;const div=document.createElement('div');div.className='ws-line '+cls;div.textContent=msg;d.appendChild(div);d.scrollTop=d.scrollHeight;}

// ─────────────────────────────────────────────────────────────
// gRPC
// ─────────────────────────────────────────────────────────────
function openGRPC(){openModal(`<div class="modal-bg"><div class="modal lg"><div class="mh"><span class="mh-title">gRPC Client</span><button class="m-close" onclick="closeModal()">✕</button></div><div class="mb"><div class="fg"><label>SERVER URL</label><input id="grpc-url" placeholder="https://grpc.example.com"></div><div class="fg"><label>SERVICE METHOD</label><input id="grpc-method" placeholder="package.Service/Method"></div><div class="fg"><label>REQUEST BODY (JSON)</label><textarea id="grpc-body" rows="6" class="code-area" placeholder='{"key":"value"}'></textarea></div><div class="fg"><label>METADATA (JSON)</label><textarea id="grpc-meta" rows="3" class="code-area" placeholder='{"authorization":"Bearer token"}'></textarea></div><div id="grpc-resp" style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);min-height:80px;max-height:200px;overflow-y:auto;padding:10px;font-family:var(--mono);font-size:12px;color:var(--text3);margin-top:8px">gRPC response will appear here...</div></div><div class="mf"><button class="btn secondary" onclick="closeModal()">Close</button><button class="btn primary" onclick="invokeGRPC()">Invoke</button></div></div></div>`);}
async function invokeGRPC(){const url=document.getElementById('grpc-url')?.value?.trim(),method=document.getElementById('grpc-method')?.value?.trim(),body=document.getElementById('grpc-body')?.value?.trim(),meta=document.getElementById('grpc-meta')?.value?.trim(),respEl=document.getElementById('grpc-resp');if(!url||!method){notify('URL and method required','error');return;}respEl.innerHTML='<span style="color:var(--text3)">⏳ Invoking...</span>';const direct=isPrivate(url);const proxyUrl=(!direct&&S.settings.corsEnabled)?S.settings.proxyUrl+encodeURIComponent(url+'/'+method):url+'/'+method;const h={'Content-Type':'application/grpc-web+json','x-grpc-web':'1'};if(meta){try{Object.assign(h,JSON.parse(meta));}catch{}}try{const r=await fetch(proxyUrl,{method:'POST',headers:h,body:body||'{}'});const txt=await r.text();let p;try{p=JSON.parse(txt);}catch{p=txt;}respEl.innerHTML=`<span style="color:var(--ok)">Status: ${r.status} ${r.statusText}</span>\n\n${esc(typeof p==='string'?p:JSON.stringify(p,null,2))}`;notify('gRPC: '+r.status,r.ok?'success':'error');}catch(e){respEl.innerHTML=`<span style="color:var(--err)">${esc(e.message)}</span>`;notify('gRPC error: '+e.message,'error');}}

// ─────────────────────────────────────────────────────────────
// MOCK SERVER
// ─────────────────────────────────────────────────────────────
function openMockServer(){openModal(`<div class="modal-bg"><div class="modal lg"><div class="mh"><span class="mh-title">🎭 Mock Server</span><button class="m-close" onclick="closeModal()">✕</button></div><div class="mb"><p style="font-size:12px;color:var(--text3);margin-bottom:12px">Enable "Use Mock Response" in Request Settings to intercept matching requests.</p><div id="mock-rules">${S.mocks.length?S.mocks.map((m,i)=>mockRuleHtml(m,i)).join(''):'<p style="color:var(--text3);font-size:12px">No mock rules yet.</p>'}</div><button class="add-row-btn" style="margin-top:10px" onclick="addMockRule()">+ Add Mock Rule</button></div><div class="mf"><button class="btn secondary" onclick="closeModal()">Close</button><button class="btn primary" onclick="saveMockRules()">Save Rules</button></div></div></div>`);}
function mockRuleHtml(m,i){return`<div class="mock-rule" id="mock-rule-${i}"><div class="mock-rule-hdr" style="margin-bottom:8px"><select style="width:90px" id="mr-method-${i}">${['*','GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].map(x=>`<option${x===m.method?' selected':''}>${x}</option>`).join('')}</select><input type="text" id="mr-path-${i}" value="${esc(m.path||'')}" placeholder="/api/users" style="flex:1"><select id="mr-status-${i}" style="width:80px">${[200,201,204,400,401,403,404,422,500,502,503].map(s=>`<option${s===m.statusCode?' selected':''}>${s}</option>`).join('')}</select><input type="number" id="mr-delay-${i}" value="${m.delay||0}" style="width:70px"><label class="toggle"><input type="checkbox" id="mr-en-${i}"${m.enabled!==false?' checked':''}><span class="t-slider"></span></label><button class="icon-btn del" onclick="removeMockRule(${i})">🗑</button></div><div class="fg"><label>RESPONSE BODY</label><textarea id="mr-body-${i}" class="code-area" rows="4">${esc(m.body||'{}')}</textarea></div><div class="fg"><label>CONTENT TYPE</label><input type="text" id="mr-ct-${i}" value="${esc(m.contentType||'application/json')}"></div></div>`;}
function addMockRule(){S.mocks.push({id:uid(),method:'GET',path:'',statusCode:200,body:'{}',contentType:'application/json',delay:0,enabled:true});document.getElementById('mock-rules').innerHTML=S.mocks.map((m,i)=>mockRuleHtml(m,i)).join('');}
function removeMockRule(i){S.mocks.splice(i,1);save();openMockServer();}
function saveMockRules(){S.mocks=S.mocks.map((_,i)=>({id:S.mocks[i].id||uid(),method:document.getElementById('mr-method-'+i)?.value||'GET',path:document.getElementById('mr-path-'+i)?.value||'',statusCode:parseInt(document.getElementById('mr-status-'+i)?.value)||200,body:document.getElementById('mr-body-'+i)?.value||'{}',contentType:document.getElementById('mr-ct-'+i)?.value||'application/json',delay:parseInt(document.getElementById('mr-delay-'+i)?.value)||0,enabled:document.getElementById('mr-en-'+i)?.checked!==false}));save();closeModal();notify('Mock rules saved!','success');}

// ─────────────────────────────────────────────────────────────
// IMPORT
// ─────────────────────────────────────────────────────────────
function openImport(){openModal(`<div class="modal-bg"><div class="modal md"><div class="mh"><span class="mh-title">📥 Import</span><button class="m-close" onclick="closeModal()">✕</button></div><div class="mb"><div class="fg"><label>PASTE JSON (Postman Collection v2.1, Environment, OpenAPI) OR cURL COMMAND</label><textarea id="imp-txt" rows="10" style="width:100%;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:10px;color:var(--text1);font-family:var(--mono);font-size:12px;resize:vertical" placeholder="Paste here..."></textarea></div><div class="fg"><label>OR UPLOAD FILE</label><input type="file" id="imp-file" accept=".json,.yaml,.yml" onchange="loadImpFile(this)"></div></div><div class="mf"><button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="doImport()">Import</button></div></div></div>`);}
function loadImpFile(inp){const f=inp.files?.[0];if(!f)return;const r=new FileReader();r.onload=e=>{document.getElementById('imp-txt').value=e.target.result;};r.readAsText(f);}
function doImport(){
  const text=document.getElementById('imp-txt').value.trim();if(!text){notify('Nothing to import','error');return;}
  if(text.toLowerCase().startsWith('curl')){importCurl(text);closeModal();return;}
  try{
    const data=JSON.parse(text);
    if(data.info&&data.item){
      const coll={id:uid(),name:data.info.name||'Imported',desc:data.info.description||'',requests:[],variables:{}};
      if(data.variable)data.variable.forEach(v=>{coll.variables[v.key]=v.value;});
      const flat=(items,target)=>items?.forEach(item=>{if(item.item){const folder={id:uid(),name:item.name,_isFolder:true,requests:[]};flat(item.item,folder.requests);target.push(folder);}else if(item.request){target.push({id:uid(),name:item.name||'Request',method:item.request.method||'GET',url:typeof item.request.url==='string'?item.request.url:(item.request.url?.raw||''),headers:(item.request.header||[]).map(h=>({id:uid(),on:!h.disabled,k:h.key,v:h.value,desc:h.description||''})),rawBody:item.request.body?.raw||'',bodyType:item.request.body?.mode==='raw'?'raw':item.request.body?.mode||'none',rawFmt:'json',authType:item.request.auth?.type||'none',authData:{},preScript:item.event?.find(e=>e.listen==='prerequest')?.script?.exec?.join('\n')||'',testScript:item.event?.find(e=>e.listen==='test')?.script?.exec?.join('\n')||''});}});
      flat(data.item,coll.requests);S.collections.push(coll);save();renderCollections();closeModal();notify(`✅ Imported "${coll.name}" — ${coll.requests.length} items`,'success');return;
    }
    if(data.values&&(data.name||data.id)){const env={id:uid(),name:data.name||'Imported Env',variables:{}};(data.values||[]).forEach(v=>{env.variables[v.key]=v.value;});S.envs.push(env);save();renderEnvs();closeModal();notify(`✅ Env "${env.name}" imported`,'success');return;}
    if(Array.isArray(data)&&data[0]?.requests){S.collections.push(...data);save();renderCollections();closeModal();notify(`Imported ${data.length} collections`,'success');return;}
    if(data.openapi||data.swagger){importOpenAPI(data);closeModal();return;}
    notify('Unrecognized format','error');
  }catch(e){notify('Invalid JSON: '+e.message,'error');}
}
function importCurl(curl){
  try{
    const mm=curl.match(/-X\s+(\w+)/i)||curl.match(/--request\s+(\w+)/i);
    const um=curl.match(/curl\s+(?:-[^\s]+\s+)*['"]?([^\s'"]+)['"]?/);
    const hm=[...curl.matchAll(/-H\s+['"]([^'"]+)['"]/gi)];
    const dm=curl.match(/(?:--data(?:-raw|-binary)?|-d)\s+['"]([^'"]*)['"]/i)||curl.match(/--data '([^']*)'/i);
    const method=(mm?.[1]||'GET').toUpperCase(),url=um?.[1]||'';
    const headers=hm.map(m=>{const[k,...v]=m[1].split(':');return{id:uid(),on:true,k:k.trim(),v:v.join(':').trim(),desc:''};});
    const body=dm?.[1]||'';
    newTab({method,url,name:url.replace(/^https?:\/\//,'').slice(0,40)||'Imported',headers,rawBody:body,bodyType:body?'raw':'none',rawFmt:'json'});
    notify('Imported from cURL!','success');
  }catch(e){notify('cURL parse error: '+e.message,'error');}
}
function importOpenAPI(spec){
  const coll={id:uid(),name:spec.info?.title||'OpenAPI Import',desc:spec.info?.description||'',requests:[],variables:{}};
  const base=(spec.servers?.[0]?.url||'')+(spec.basePath||'');
  Object.entries(spec.paths||{}).forEach(([path,pathItem])=>{
    ['get','post','put','patch','delete','head','options'].forEach(m=>{
      if(!pathItem[m])return;const op=pathItem[m];
      const headers=[],params=[];
      (op.parameters||[]).forEach(p=>{if(p.in==='header')headers.push({id:uid(),on:true,k:p.name,v:p.example||'',desc:p.description||''});else if(p.in==='query')params.push({id:uid(),on:true,k:p.name,v:p.example||'',desc:p.description||''});});
      let rawBody='',bodyType='none';
      if(op.requestBody){const ct=op.requestBody.content||{};const j=ct['application/json'];if(j?.example){rawBody=JSON.stringify(j.example,null,2);bodyType='raw';}}
      coll.requests.push({id:uid(),name:op.summary||op.operationId||(m.toUpperCase()+' '+path),method:m.toUpperCase(),url:base+path,headers,params,rawBody,bodyType,rawFmt:'json',authType:'none',authData:{},preScript:'',testScript:''});
    });
  });
  S.collections.push(coll);save();renderCollections();notify(`✅ OpenAPI imported — ${coll.requests.length} endpoints`,'success');
}

// ─────────────────────────────────────────────────────────────
// COOKIE MANAGER
// ─────────────────────────────────────────────────────────────
function openCookies(){openModal(`<div class="modal-bg"><div class="modal lg"><div class="mh"><span class="mh-title">🍪 Cookie Manager</span><button class="m-close" onclick="closeModal()">✕</button></div><div class="mb"><div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap"><input id="ck-d" placeholder="Domain (api.example.com)" style="flex:1;min-width:140px"><input id="ck-n" placeholder="Name" style="width:120px"><input id="ck-v" placeholder="Value" style="flex:1;min-width:100px"><button class="btn primary" onclick="addCK()">+ Add</button></div><div id="ck-list">${renderCKList()}</div></div><div class="mf"><button class="btn danger" onclick="clearAllCK()">🗑 Clear All</button><button class="btn secondary" onclick="closeModal()">Close</button></div></div></div>`);}
function renderCKList(){const d=Object.keys(S.cookies);if(!d.length)return'<div class="empty-state"><div class="ei">🍪</div><p>No cookies stored.</p></div>';return d.map(domain=>`<div class="ck-domain"><div class="ck-domain-nm">${esc(domain)}</div>${Object.entries(S.cookies[domain]).map(([k,v])=>`<div class="ck-row"><span class="ck-name">${esc(k)}</span><span class="ck-val">${esc(v)}</span><button onclick="delCK('${esc(domain)}','${esc(k)}')" style="color:var(--err);background:none;border:none;cursor:pointer;margin-left:auto">✕</button></div>`).join('')}</div>`).join('');}
function addCK(){const d=document.getElementById('ck-d').value.trim(),n=document.getElementById('ck-n').value.trim(),v=document.getElementById('ck-v').value;if(!d||!n){notify('Domain and name required','error');return;}if(!S.cookies[d])S.cookies[d]={};S.cookies[d][n]=v;save();document.getElementById('ck-list').innerHTML=renderCKList();notify('Cookie added!','success');}
function delCK(d,n){if(S.cookies[d]){delete S.cookies[d][n];if(!Object.keys(S.cookies[d]).length)delete S.cookies[d];}save();document.getElementById('ck-list').innerHTML=renderCKList();}
function clearAllCK(){if(!confirm('Clear all cookies?'))return;S.cookies={};save();document.getElementById('ck-list').innerHTML=renderCKList();}

// ─────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────
function openSettings(){
  const s=S.settings;
  openModal(`<div class="modal-bg"><div class="modal lg"><div class="mh"><span class="mh-title">⚙ Settings</span><button class="m-close" onclick="closeModal()">✕</button></div><div class="mb">
    <div class="s-sec"><div class="s-sec-title">CORS PROXY</div>
      <div class="s-row"><div><div class="s-label">Enable CORS Proxy</div><div class="s-desc">Route public API requests through Cloudflare Worker. Private IPs always go DIRECT.</div></div><label class="toggle"><input type="checkbox" id="set-cors"${s.corsEnabled?' checked':''} onchange="toggleCORSFromSettings()"><span class="t-slider"></span></label></div>
      <div class="fg" style="margin-top:10px"><label>PROXY URL</label><input id="set-proxy" value="${esc(s.proxyUrl||'https://square-credit-8186.donthulanithish53.workers.dev/?url=')}"></div>
      <button class="btn-s" style="margin-top:6px" onclick="testProxy()">🔍 Test Worker</button>
      <span id="proxy-test-res" style="font-size:11px;margin-left:10px;color:var(--text3)"></span>
    </div>
    <div class="s-sec"><div class="s-sec-title">THEME</div>
      <div class="s-row"><div><div class="s-label">Dark Mode</div><div class="s-desc">Toggle dark/light theme</div></div><label class="toggle"><input type="checkbox" id="set-dark"${s.theme!=='light'?' checked':''} onchange="toggleThemeFromSettings(this)"><span class="t-slider"></span></label></div>
    </div>
    <div class="s-sec"><div class="s-sec-title">TOOLS</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-s accent" onclick="closeModal();openGlobals()">🌐 Global Variables</button>
        <button class="btn-s accent" onclick="closeModal();openCookies()">🍪 Cookie Manager</button>
        <button class="btn-s accent" onclick="closeModal();openMockServer()">🎭 Mock Server</button>
      </div>
    </div>
    <div class="s-sec"><div class="s-sec-title">DATA MANAGEMENT</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-s" onclick="exportAll()">⬇ Export All Data</button>
        <button class="btn-s" onclick="importAll()">⬆ Import Backup</button>
        <button class="btn-s danger" onclick="resetAll()">🗑 Reset Everything</button>
      </div>
    </div>
    <div class="s-sec"><div class="s-sec-title">KEYBOARD SHORTCUTS</div>
      <div style="font-size:11px;color:var(--text2);line-height:2.2;font-family:var(--mono)">
        <b>Ctrl+Enter</b> Send &nbsp; <b>Ctrl+T</b> New Tab &nbsp; <b>Ctrl+W</b> Close Tab<br>
        <b>Ctrl+S</b> Save &nbsp; <b>Ctrl+\\</b> Toggle Sidebar &nbsp; <b>Esc</b> Cancel / Close
      </div>
    </div>
    <div class="s-sec"><div class="s-sec-title">ABOUT</div>
      <p style="font-size:12px;color:var(--text3);line-height:1.8">PostmanWeb v4 — Full API Testing Platform.<br>
      All data stored locally. Private IPs always called DIRECTLY.<br>
      Worker: <span style="color:var(--accent)">square-credit-8186.donthulanithish53.workers.dev</span></p>
    </div>
  </div><div class="mf"><button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveSettings()">Save Settings</button></div></div></div>`);
}
function toggleCORSFromSettings(){const c=document.getElementById('set-cors');if(c){S.settings.corsEnabled=c.checked;save();refreshCORSBtn();}}
function toggleThemeFromSettings(el){S.settings.theme=el.checked?'dark':'light';save();applyTheme();}
async function testProxy(){const purl=document.getElementById('set-proxy').value.trim(),res=document.getElementById('proxy-test-res');res.textContent='⏳ Testing...';res.style.color='var(--text3)';try{const r=await fetch(purl+encodeURIComponent('https://httpbin.org/get'),{signal:AbortSignal.timeout(8000)});if(r.ok){res.textContent='✅ Worker is working!';res.style.color='var(--ok)';}else{res.textContent=`⚠ Worker: ${r.status}`;res.style.color='var(--warn)';}}catch(e){res.textContent='❌ '+e.message;res.style.color='var(--err)';}}
function saveSettings(){S.settings.corsEnabled=document.getElementById('set-cors').checked;S.settings.proxyUrl=document.getElementById('set-proxy').value.trim();save();refreshCORSBtn();closeModal();notify('Settings saved!','success');}
function exportAll(){dl(JSON.stringify({collections:S.collections,envs:S.envs,globals:S.globals,history:S.history,settings:S.settings,mocks:S.mocks},null,2),'postmanweb_backup.json');notify('Backup exported!','success');}
function importAll(){const inp=document.createElement('input');inp.type='file';inp.accept='.json';inp.onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{try{const d=JSON.parse(ev.target.result);if(d.collections)S.collections=d.collections;if(d.envs)S.envs=d.envs;if(d.globals)S.globals=d.globals;if(d.history)S.history=fixHistory(d.history);if(d.settings)S.settings=d.settings;if(d.mocks)S.mocks=d.mocks;save();renderAll();notify('Backup imported!','success');}catch(e){notify('Invalid file: '+e.message,'error');};};r.readAsText(f);};inp.click();}
function resetAll(){if(!confirm('⚠ This will permanently delete ALL your data. Are you sure?'))return;localStorage.clear();location.reload();}

// ─────────────────────────────────────────────────────────────
// WORKSPACES + THEME
// ─────────────────────────────────────────────────────────────
function renderWorkspaces(){const sel=document.getElementById('ws-sel');if(!sel)return;sel.innerHTML=S.workspaces.map(w=>`<option value="${w.id}"${w.id===S.activeWS?' selected':''}>${esc(w.name)}</option>`).join('');}
function switchWorkspace(id){S.activeWS=id;save();notify('Workspace switched','info');}
function openNewWorkspace(){const name=prompt('Workspace name:');if(!name)return;const ws={id:uid(),name};S.workspaces.push(ws);S.activeWS=ws.id;save();renderWorkspaces();notify('Workspace created!','success');}
function applyTheme(){document.documentElement.setAttribute('data-theme',S.settings.theme||'dark');const btn=document.getElementById('theme-btn');if(btn)btn.textContent=S.settings.theme==='light'?'🌙':'☀️';}
function toggleTheme(){S.settings.theme=S.settings.theme==='light'?'dark':'light';save();applyTheme();}

// ─────────────────────────────────────────────────────────────
// RESIZE
// ─────────────────────────────────────────────────────────────
function initResize(){
  const handle=document.getElementById('resizer'),wrap=document.getElementById('split');
  let drag=false,sy=0,sh=0;
  handle.addEventListener('mousedown',e=>{drag=true;sy=e.clientY;sh=document.getElementById('req-area').offsetHeight;document.body.style.userSelect='none';document.body.style.cursor='ns-resize';});
  document.addEventListener('mousemove',e=>{if(!drag)return;const nh=Math.max(80,Math.min(wrap.offsetHeight-80,sh+(e.clientY-sy)));document.getElementById('req-area').style.height=nh+'px';});
  document.addEventListener('mouseup',()=>{drag=false;document.body.style.userSelect='';document.body.style.cursor='';});
}

// ─────────────────────────────────────────────────────────────
// RENDER ALL + INIT
// ─────────────────────────────────────────────────────────────
function renderAll(){renderTabs();renderCollections();renderHistory();renderEnvs();renderWorkspaces();}

function init(){
  applyTheme();
  newTab();
  renderAll();
  initResize();
  initHistoryEvents();
  refreshCORSBtn();
  refreshHistDot();

  // Close fullscreen / adv popover on Escape
  document.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') {
      if (document.getElementById('fs-overlay').style.display !== 'none') { closeEnlarge(); return; }
      if (document.getElementById('adv-popover').style.display !== 'none') { closeAdvPopover(); return; }
      if (_abortCtrl) cancelReq();
    }
    if (mod && e.key === 'Enter') { e.preventDefault(); sendRequest(); }
    if (mod && e.key === 't')     { e.preventDefault(); newTab(); }
    if (mod && e.key === 'w')     { e.preventDefault(); closeTab(S.activeId); }
    if (mod && e.key === 's')     { e.preventDefault(); saveToCollection(); }
    if (mod && e.key === '\\')    { e.preventDefault(); toggleSB(); }
  });

  // Close adv popover when clicking outside
  document.addEventListener('click', e => {
    const pop = document.getElementById('adv-popover');
    if (pop.style.display !== 'none' && !pop.contains(e.target) && !e.target.closest('[data-action="adv"]')) {
      closeAdvPopover();
    }
  });

  // URL input: auto-name, path vars, direct badge
  document.getElementById('url-in').addEventListener('input', e => {
    const tab = getActiveTab();
    if (tab && e.target.value) {
      tab.url  = e.target.value;
      tab.name = e.target.value.replace(/^https?:\/\//,'').replace(/\?.*$/,'').slice(0,40) || 'New Request';
      renderTabs();
      updatePathVars(e.target.value, tab.pathVars || []);
      refreshDirectBadge(e.target.value);
    }
  });

  document.getElementById('method-sel').addEventListener('change', colorMethod);
}

init();
