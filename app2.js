/* ============================================================
   POSTMANWEB v4 — app2.js  (Module 2 of 2)
   ============================================================ */
'use strict';

// ─────────────────────────────────────────────────────────────
// IFRAME HELPER
// ─────────────────────────────────────────────────────────────
function writeIframe(iframe, html) {
  if (!iframe) return;
  if (iframe._blobUrl) { URL.revokeObjectURL(iframe._blobUrl); iframe._blobUrl = null; }
  var blob = new Blob([html], { type: 'text/html; charset=utf-8' });
  var blobUrl = URL.createObjectURL(blob);
  iframe._blobUrl = blobUrl;
  iframe.src = blobUrl;
}

// ─────────────────────────────────────────────────────────────
// JSON / XML HIGHLIGHT
// ─────────────────────────────────────────────────────────────
function jsonHL(json) {
  var s = JSON.stringify(json, null, 2);
  s = s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return s.replace(/("(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function(m) {
    var c = 'jn';
    if (/^"/.test(m)) c = /:$/.test(m) ? 'jk' : 'js';
    else if (/true|false/.test(m)) c = 'jb';
    else if (/null/.test(m)) c = 'jl';
    return '<span class="' + c + '">' + m + '</span>';
  });
}
function xmlHL(xml) {
  return esc(xml)
    .replace(/(&lt;\/?)([\w:-]+)/g, '$1<span class="jk">$2</span>')
    .replace(/([\w:-]+=)(&quot;[^&]*&quot;)/g, '<span class="jn">$1</span><span class="js">$2</span>');
}

// ─────────────────────────────────────────────────────────────
// PRETTY BODY BUILDER
// ─────────────────────────────────────────────────────────────
function buildPrettyContent(r) {
  if (!r) return '';
  if (r._isBinary && r._dataUrl) {
    var ct = getContentType(r);
    if (ct.indexOf('image/') === 0) {
      return '<div style="padding:12px;text-align:center">' +
        '<img src="' + r._dataUrl + '" alt="Image response" style="max-width:100%;max-height:60vh;border-radius:6px;box-shadow:0 2px 12px rgba(0,0,0,.3)">' +
        '<div style="margin-top:8px;font-size:11px;color:var(--text3)">' + esc(ct) + ' — ' + formatBytes(r._size) + '</div>' +
        '</div>';
    }
    return '<div style="padding:20px;text-align:center;color:var(--text3)">' +
      '<div style="font-size:40px;margin-bottom:8px">📦</div>' +
      '<div style="font-weight:600;margin-bottom:4px">Binary Response</div>' +
      '<div style="font-size:12px">Content-Type: <code>' + esc(ct) + '</code></div>' +
      '<div style="font-size:12px;margin-top:4px">Size: ' + formatBytes(r._size) + '</div>' +
      '<div style="margin-top:12px;font-size:12px;color:var(--accent)">Use ⬇ Download button to save this file.</div>' +
      '</div>';
  }
  if (isJsonResponse(r)) {
    try { return jsonHL(JSON.parse(r._body)); } catch(e) { return esc(r._body); }
  }
  if (isXmlResponse(r)) { return xmlHL(r._body); }
  return esc(r._body);
}

// ─────────────────────────────────────────────────────────────
// RESPONSE DISPLAY
// ─────────────────────────────────────────────────────────────
function showResponse(r) {
  var pill    = document.getElementById('r-pill');
  var rtime   = document.getElementById('r-time');
  var rsize   = document.getElementById('r-size');
  var hint    = document.getElementById('r-hint');
  var acts    = document.getElementById('r-acts');
  var dlBtn   = document.getElementById('r-download-btn');
  var ctBadge = document.getElementById('resp-ct-badge');

  if (!r) {
    [pill,rtime,rsize,acts].forEach(function(el){ if(el) el.style.display='none'; });
    if (hint)    hint.style.display = '';
    if (ctBadge) ctBadge.style.display = 'none';
    if (dlBtn)   dlBtn.style.display = 'none';
    document.getElementById('resp-pretty').innerHTML = '';
    document.getElementById('resp-raw').textContent  = '';
    var iframe = document.getElementById('resp-preview');
    if (iframe) {
      if (iframe._blobUrl) { URL.revokeObjectURL(iframe._blobUrl); iframe._blobUrl = null; }
      iframe.src = 'about:blank';
    }
    return;
  }

  pill.style.display = '';
  pill.textContent   = r.status + ' ' + r.statusText;
  pill.className     = 'spill ' + (r._mock ? 'smock' : 's' + Math.floor(r.status / 100));

  rtime.style.display = '';
  rtime.innerHTML = 'Time: <b' + (r._time > 2000 ? ' class="slow"' : '') + '>' + r._time + 'ms</b>';

  rsize.style.display = '';
  rsize.innerHTML = 'Size: <b>' + formatBytes(r._size) + '</b>';

  hint.style.display = 'none';
  acts.style.display = '';

  var label = getResponseLabel(r);
  if (ctBadge) { ctBadge.textContent = label; ctBadge.style.display = label ? '' : 'none'; }
  if (dlBtn) dlBtn.style.display = (r._isBinary && r._dataUrl) ? '' : 'none';

  document.getElementById('resp-pretty').innerHTML = buildPrettyContent(r);
  document.getElementById('resp-raw').textContent  = r._body || '';

  var iframeEl = document.getElementById('resp-preview');
  if (r._isBinary && r._dataUrl) {
    var ct2 = getContentType(r);
    if (ct2.indexOf('image/') === 0) {
      writeIframe(iframeEl, '<html><body style="margin:0;background:#1a1a2e;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="' + r._dataUrl + '" style="max-width:100%;max-height:100vh;object-fit:contain"></body></html>');
    } else {
      writeIframe(iframeEl, '<html><body style="font-family:sans-serif;padding:30px;color:#888;background:#111;text-align:center"><div style="font-size:48px">📦</div><p>Binary file — use ⬇ Download to save.</p></body></html>');
    }
  } else if (isHtmlResponse(r)) {
    writeIframe(iframeEl, r._body);
  } else {
    writeIframe(iframeEl, '<html><body style="font-family:sans-serif;padding:20px;color:#666;background:#f9f9f9"><p style="font-size:14px">Preview available for HTML responses only.</p><p style="font-size:12px;margin-top:8px">Content-Type: <code>' + esc(getContentType(r)||'unknown') + '</code></p></body></html>');
  }

  document.getElementById('r-headers-tbl').innerHTML =
    Object.keys(r._headers || {}).map(function(k){
      return '<tr><td>' + esc(k) + '</td><td>' + esc(r._headers[k]) + '</td></tr>';
    }).join('') || '<tr><td colspan="2" style="color:var(--text3);padding:10px">No headers</td></tr>';

  renderCookiesPanel();
}

function showErrorResp(msg, time) {
  var pill = document.getElementById('r-pill');
  pill.style.display = ''; pill.className = 'spill serr'; pill.textContent = 'Error';
  document.getElementById('r-time').style.display = '';
  document.getElementById('r-time').innerHTML = 'Time: <b class="e">' + time + 'ms</b>';
  document.getElementById('r-size').style.display  = 'none';
  document.getElementById('r-hint').style.display  = 'none';
  document.getElementById('r-acts').style.display  = 'none';
  document.getElementById('resp-pretty').innerHTML = '<span style="color:var(--err);white-space:pre-wrap">' + esc(msg) + '</span>';
  document.getElementById('resp-raw').textContent  = msg;
}

// ─────────────────────────────────────────────────────────────
// DOWNLOAD BINARY
// ─────────────────────────────────────────────────────────────
function downloadBinaryResp() {
  if (!_lastResponse || !_lastResponse._dataUrl) return;
  var ct  = getContentType(_lastResponse);
  var ext = ct.split('/')[1] ? ct.split('/')[1].split(';')[0] : 'bin';
  var a   = document.createElement('a');
  a.href = _lastResponse._dataUrl; a.download = 'response.' + ext; a.click();
}
function copyResponse() {
  navigator.clipboard.writeText(document.getElementById('resp-raw').textContent).then(function(){ notify('Copied!','success'); });
}
function saveRespFile() {
  if (_lastResponse && _lastResponse._isBinary && _lastResponse._dataUrl) { downloadBinaryResp(); return; }
  var content = document.getElementById('resp-raw').textContent;
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content],{type:'text/plain'}));
  a.download = 'response.txt'; a.click();
}

// ─────────────────────────────────────────────────────────────
// TEST RESULTS
// ─────────────────────────────────────────────────────────────
function renderTests() {
  var c = document.getElementById('test-output'), badge = document.getElementById('test-badge');
  if (!_testResults.length) {
    c.innerHTML = '<div class="empty-state"><div class="ei">🧪</div><p>No tests ran.</p></div>';
    badge.style.display = 'none'; return;
  }
  var pass = _testResults.filter(function(t){ return t.pass; }).length;
  badge.textContent = pass + '/' + _testResults.length; badge.style.display = '';
  badge.style.background = pass===_testResults.length?'var(--ok)':pass===0?'var(--err)':'var(--warn)';
  badge.style.color = '#000';
  c.innerHTML =
    '<div class="test-summary">' +
      '<span style="font-size:20px">'+(pass===_testResults.length?'✅':pass===0?'❌':'⚠️')+'</span>' +
      '<span style="font-weight:700">'+pass+' / '+_testResults.length+' passed</span>' +
      '<span style="color:var(--text3);font-size:11px">'+(_testResults.length-pass)+' failed</span>' +
    '</div>' +
    _testResults.map(function(t){
      return '<div class="tr-item '+(t.pass?'tr-pass':'tr-fail')+'">' +
        '<span class="tr-icon">'+(t.pass?'✅':'❌')+'</span>' +
        '<div><div class="tr-name">'+esc(t.name)+'</div>'+(t.error?'<div class="tr-err">'+esc(t.error)+'</div>':'')+'</div>' +
        '</div>';
    }).join('');
}

function flushConsole() {
  document.getElementById('console-out').innerHTML =
    _consoleLogs.map(function(l){
      return '<div class="con-row '+l.type+'"><span class="ct">'+l.type+'</span><span class="cm">'+esc(l.msg)+'</span></div>';
    }).join('');
}
function clearConsole() { _consoleLogs = []; flushConsole(); }

function renderCookiesPanel() {
  var p = document.getElementById('cookies-out'), domains = Object.keys(S.cookies);
  if (!domains.length) { p.innerHTML = '<div class="empty-state"><div class="ei">🍪</div><p>No cookies stored.</p></div>'; return; }
  p.innerHTML = domains.map(function(d){
    return '<div class="ck-domain"><div class="ck-domain-nm">'+esc(d)+'</div>'+
      Object.keys(S.cookies[d]).map(function(k){
        return '<div class="ck-row"><span class="ck-name">'+esc(k)+'</span><span class="ck-val" title="'+esc(S.cookies[d][k])+'">'+esc(S.cookies[d][k])+'</span></div>';
      }).join('')+'</div>';
  }).join('');
}

// ─────────────────────────────────────────────────────────────
// FULLSCREEN OVERLAY
// ─────────────────────────────────────────────────────────────
var _fsCurrentView = 'pretty';
var _fsPanel       = 'body';

function openEnlargeResp() {
  _fsPanel = 'body';
  var overlay=document.getElementById('fs-overlay'),title=document.getElementById('fs-title'),toolbar=document.getElementById('fs-toolbar'),fsBody=document.getElementById('fs-body'),copyBtn=document.getElementById('fs-copy-btn'),saveBtn=document.getElementById('fs-save-btn');
  title.textContent='Response Body'; copyBtn.style.display=''; saveBtn.style.display='';
  toolbar.innerHTML=
    '<button class="fs-tab'+(_fsCurrentView==='pretty'?' active':'')+'" onclick="fsSwitchView(\'pretty\')">Pretty</button>'+
    '<button class="fs-tab'+(_fsCurrentView==='raw'?' active':'')+'" onclick="fsSwitchView(\'raw\')">Raw</button>'+
    '<button class="fs-tab'+(_fsCurrentView==='preview'?' active':'')+'" onclick="fsSwitchView(\'preview\')">Preview</button>';
  fsBuildBodyContent(_fsCurrentView,fsBody);
  overlay.style.display='flex';
}
function fsSwitchView(view) {
  _fsCurrentView=view;
  document.querySelectorAll('.fs-tab').forEach(function(b){ b.classList.toggle('active',b.textContent.toLowerCase()===view); });
  fsBuildBodyContent(view,document.getElementById('fs-body'));
}
function fsBuildBodyContent(view,container) {
  var r=_lastResponse;
  if(!r){container.innerHTML='<p style="padding:20px;color:var(--text3)">No response yet.</p>';return;}
  container.innerHTML='';
  if(view==='pretty'){var pre=document.createElement('pre');pre.innerHTML=buildPrettyContent(r);container.appendChild(pre);}
  else if(view==='raw'){var pre2=document.createElement('pre');pre2.textContent=r._body||'';container.appendChild(pre2);}
  else if(view==='preview'){
    var iframe=document.createElement('iframe');
    iframe.sandbox='allow-scripts allow-same-origin allow-forms allow-popups allow-modals';
    iframe.referrerPolicy='no-referrer';
    iframe.style.cssText='position:absolute;inset:0;width:100%;height:100%;border:none;background:#fff;';
    container.appendChild(iframe);
    if(r._isBinary&&r._dataUrl&&getContentType(r).indexOf('image/')===0){
      writeIframe(iframe,'<html><body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="'+r._dataUrl+'" style="max-width:100%;max-height:100vh;object-fit:contain"></body></html>');
    }else{
      writeIframe(iframe,isHtmlResponse(r)?r._body:'<html><body style="font-family:sans-serif;padding:20px;color:#666">Preview only available for HTML responses.</body></html>');
    }
  }
}
function openEnlargePanel(panel) {
  _fsPanel=panel;
  var overlay=document.getElementById('fs-overlay'),title=document.getElementById('fs-title'),toolbar=document.getElementById('fs-toolbar'),fsBody=document.getElementById('fs-body'),copyBtn=document.getElementById('fs-copy-btn'),saveBtn=document.getElementById('fs-save-btn');
  toolbar.innerHTML='';
  if(panel==='headers'){
    title.textContent='Response Headers';copyBtn.style.display='';saveBtn.style.display='';
    var table=document.createElement('table');table.className='rh-tbl';
    table.innerHTML=Object.keys((_lastResponse&&_lastResponse._headers)||{}).map(function(k){return'<tr><td>'+esc(k)+'</td><td>'+esc(_lastResponse._headers[k])+'</td></tr>';}).join('')||'<tr><td colspan="2" style="color:var(--text3);padding:14px">No headers</td></tr>';
    fsBody.innerHTML='';fsBody.appendChild(table);
  }else if(panel==='cookies'){
    title.textContent='Cookies';copyBtn.style.display='none';saveBtn.style.display='none';
    var clone=document.getElementById('cookies-out').cloneNode(true);clone.style.padding='14px';fsBody.innerHTML='';fsBody.appendChild(clone);
  }else if(panel==='tests'){
    title.textContent='Test Results';copyBtn.style.display='none';saveBtn.style.display='none';
    var clone2=document.getElementById('test-output').cloneNode(true);clone2.style.padding='14px';fsBody.innerHTML='';fsBody.appendChild(clone2);
  }else if(panel==='console'){
    title.textContent='Console';copyBtn.style.display='none';saveBtn.style.display='none';
    var clone3=document.getElementById('console-out').cloneNode(true);clone3.style.padding='0';fsBody.innerHTML='';fsBody.appendChild(clone3);
  }
  overlay.style.display='flex';
}
function closeEnlarge() {
  document.getElementById('fs-overlay').style.display='none';
  document.querySelectorAll('#fs-body iframe').forEach(function(iframe){
    if(iframe._blobUrl){URL.revokeObjectURL(iframe._blobUrl);iframe._blobUrl=null;}
    iframe.src='about:blank';
  });
  document.getElementById('fs-body').innerHTML='';
}
function fsAction(action) {
  if(action==='copy'){
    var text=_fsPanel==='body'?(_lastResponse&&_lastResponse._body||''):_fsPanel==='headers'?Object.keys((_lastResponse&&_lastResponse._headers)||{}).map(function(k){return k+': '+_lastResponse._headers[k];}).join('\n'):'';
    navigator.clipboard.writeText(text).then(function(){notify('Copied!','success');});
  }else if(action==='save'){
    if(_lastResponse&&_lastResponse._isBinary&&_lastResponse._dataUrl){downloadBinaryResp();return;}
    var content=(_lastResponse&&_lastResponse._body)||'';
    var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type:'text/plain'}));a.download='response.txt';a.click();
  }
}

// ─────────────────────────────────────────────────────────────
// PANEL SWITCHING
// ─────────────────────────────────────────────────────────────
function switchReqPanel(id) {
  document.querySelectorAll('#req-ptabs .ptab').forEach(function(t){t.classList.toggle('active',t.dataset.panel===id);});
  document.querySelectorAll('.tpanel').forEach(function(p){p.classList.toggle('active',p.id==='rp-'+id);});
}
function switchRespPanel(id) {
  document.querySelectorAll('.rptab').forEach(function(t){t.classList.toggle('active',t.dataset.panel===id);});
  document.querySelectorAll('.rtpanel').forEach(function(p){p.classList.toggle('active',p.id==='rsp-'+id);});
}
function switchRespBody(id) {
  document.querySelectorAll('.rbview').forEach(function(b){b.classList.toggle('active',b.dataset.view===id);});
  document.querySelectorAll('.rbpanel').forEach(function(p){p.classList.toggle('active',p.id==='rbp-'+id);});
  if(id==='preview'&&_lastResponse){
    var iframe=document.getElementById('resp-preview');
    if(!iframe.src||iframe.src==='about:blank'||!iframe._blobUrl){
      if(_lastResponse._isBinary&&_lastResponse._dataUrl&&getContentType(_lastResponse).indexOf('image/')===0){
        writeIframe(iframe,'<html><body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="'+_lastResponse._dataUrl+'" style="max-width:100%;max-height:100vh;object-fit:contain"></body></html>');
      }else if(isHtmlResponse(_lastResponse)){writeIframe(iframe,_lastResponse._body);}
    }
  }
}
function switchSB(id) {
  document.querySelectorAll('.sb-tab').forEach(function(t){t.classList.toggle('active',t.dataset.sb===id);});
  document.querySelectorAll('.sb-panel').forEach(function(p){p.classList.toggle('active',p.id==='sbp-'+id);});
}
function toggleSB() { document.getElementById('sidebar').classList.toggle('hidden'); }

// ─────────────────────────────────────────────────────────────
// HISTORY
// ─────────────────────────────────────────────────────────────
function toggleHistRec() {
  S.settings.historyOn=document.getElementById('hist-toggle').checked;
  save();refreshHistDot();
  notify(S.settings.historyOn?'History ON':'History OFF','info');
}
function refreshHistDot() {
  var d=document.getElementById('hist-dot'),t=document.getElementById('hist-toggle');
  if(d)d.className='hrec-dot'+(S.settings.historyOn===false?' off':'');
  if(t)t.checked=S.settings.historyOn!==false;
}
function addHistory(entry) {
  if(S.settings.historyOn===false)return;
  S.history.unshift(entry);
  if(S.history.length>500)S.history.pop();
  save();renderHistory();
}

// ─────────────────────────────────────────────────────────────
// RENDER HISTORY — shows URL + body preview + status + 👁 button
// ─────────────────────────────────────────────────────────────
function renderHistory() {
  var list=document.getElementById('hist-list');
  refreshHistDot();
  if(!S.history.length){list.innerHTML='<div class="empty-state"><div class="ei">📭</div><p>No history yet.</p></div>';return;}
  var pinned=S.history.filter(function(h){return h.pinned===true;});
  var recent=S.history.filter(function(h){return h.pinned!==true;});

  function row(h) {
    var p=h.pinned===true;
    var bp='';
    if     (h.bodyType==='raw'    &&h.rawBody)                           bp=h.rawBody.slice(0,50);
    else if(h.bodyType==='urlenc' &&h.urlEncoded&&h.urlEncoded.length)   bp=h.urlEncoded.map(function(r){return r.k+'='+r.v;}).join('&').slice(0,50);
    else if(h.bodyType==='form'   &&h.formFields&&h.formFields.length)   bp=h.formFields.map(function(r){return r.k;}).join(', ').slice(0,50);
    else if(h.bodyType==='graphql'&&h.gqlQ)                              bp=h.gqlQ.slice(0,50);
    var statusCls=h.status>=500?'serr':h.status>=400?'swarn':h.status>=200?'sok':'';
    return '<div class="hist-row'+(p?' pinned':'')+'" data-hid="'+h.id+'">' +
      '<span class="mbadge '+h.method+'" style="color:'+(MC[h.method]||'var(--text2)')+'">'+h.method+'</span>' +
      '<div class="hist-main">' +
        '<span class="hist-url" title="'+esc(h.url)+'">'+esc(h.url)+'</span>' +
        (bp?'<span class="hist-body-preview" title="'+esc(bp)+'">'+esc(bp.length>=50?bp+'…':bp)+'</span>':'') +
      '</div>' +
      '<span class="hist-status '+statusCls+'">'+(h.status||'')+'</span>' +
      '<span class="hist-time">'+(h.at||'')+'</span>' +
      '<div class="hist-acts">' +
        '<button class="hist-view-btn" data-action="view" data-hid="'+h.id+'" title="View full request details">👁</button>' +
        '<button class="hist-adv-btn"  data-action="adv"  data-hid="'+h.id+'" title="Repeat N times">Adv</button>' +
        '<button class="hist-pin-btn"  data-action="pin"  data-hid="'+h.id+'" title="'+(p?'Unpin':'Pin')+'">'+(p?'📌':'📍')+'</button>' +
        '<button class="hist-del-btn"  data-action="del"  data-hid="'+h.id+'" title="Delete">🗑</button>' +
      '</div>' +
    '</div>';
  }

  var html='';
  if(pinned.length)html+='<div class="hist-sec">📌 PINNED</div>'+pinned.map(row).join('');
  if(recent.length){if(pinned.length)html+='<div class="hist-sec">🕐 RECENT</div>';html+=recent.map(row).join('');}
  list.innerHTML=html;
}

// ─────────────────────────────────────────────────────────────
// HISTORY DETAIL MODAL — shows ALL 8 sub-sections
// ─────────────────────────────────────────────────────────────
function openHistoryDetail(id) {
  var h=S.history.find(function(x){return x.id===id;});
  if(!h)return;

  // KV table helper
  function kvRows(arr) {
    if(!arr||!arr.length)return '<span class="hd-empty">—</span>';
    return '<table class="hd-tbl">'+
      arr.map(function(r){
        return '<tr>'+
          '<td class="hd-chk">'+(r.on!==false?'<span style="color:var(--ok)">✓</span>':'<span style="color:var(--text3)">✗</span>')+'</td>'+
          '<td class="hd-key">'+esc(r.k||r.key||'')+'</td>'+
          '<td class="hd-val">'+esc(r.v||r.value||'')+'</td>'+
          '<td class="hd-desc">'+esc(r.desc||'')+'</td>'+
        '</tr>';
      }).join('')+
    '</table>';
  }

  // Path vars helper
  function pvRows(arr) {
    if(!arr||!arr.length)return '<span class="hd-empty">—</span>';
    return '<table class="hd-tbl">'+
      arr.map(function(r){
        return '<tr>'+
          '<td class="hd-key" style="color:var(--accent)">:'+esc(r.k)+'</td>'+
          '<td class="hd-val">'+esc(r.v||'')+'</td>'+
          '<td class="hd-desc">'+esc(r.desc||'')+'</td>'+
        '</tr>';
      }).join('')+
    '</table>';
  }

  // Auth helper — shows type + all field values (passwords masked)
  function authBlock() {
    if(!h.authType||h.authType==='none')return '<span class="hd-empty">No Auth</span>';
    var ad=h.authData||{};
    var labelMap={
      'a-token':'Token','a-key':'Key Name','a-key-val':'Key Value','a-key-in':'Add To',
      'a-user':'Username','a-pass':'Password',
      'a-du':'Username','a-dp':'Password','a-realm':'Realm','a-nonce':'Nonce','a-qop':'QOP',
      'a-ck':'Consumer Key','a-cs':'Consumer Secret','a-at':'Access Token','a-ts':'Token Secret','a-sm':'Sig Method',
      'a-o2':'Access Token','a-o2p':'Prefix',
      'a-hid':'Hawk ID','a-hkey':'Hawk Key','a-halg':'Algorithm',
      'a-ak':'Access Key ID','a-sk':'Secret Key','a-region':'Region','a-svc':'Service','a-sess':'Session Token',
      'a-nu':'Username','a-np':'Password','a-nd':'Domain','a-nw':'Workstation'
    };
    var maskFields={'a-pass':1,'a-dp':1,'a-np':1,'a-sk':1,'a-cs':1,'a-ts':1};
    var rows=Object.keys(ad).filter(function(k){return ad[k];}).map(function(k){
      var lbl=labelMap[k]||k;
      var val=maskFields[k]?'••••••••':esc(ad[k]);
      return '<tr><td class="hd-key">'+esc(lbl)+'</td><td class="hd-val">'+val+'</td></tr>';
    }).join('');
    return '<div class="hd-body-type">'+esc(h.authType)+'</div>'+
      (rows?'<table class="hd-tbl">'+rows+'</table>':'');
  }

  // Body helper — handles all 6 body types
  function bodyBlock() {
    var bt=h.bodyType||'none';
    var badge='<div class="hd-body-type">'+esc(bt)+'</div>';
    if(bt==='none')return '<span class="hd-empty">none — no body sent</span>';
    if(bt==='raw'){
      var fmt=h.rawFmt?'<span style="font-size:10px;color:var(--text3);margin-left:6px">'+esc(h.rawFmt)+'</span>':'';
      return badge+fmt+(h.rawBody
        ?'<pre class="hd-code">'+esc(h.rawBody.slice(0,3000))+(h.rawBody.length>3000?'\n…[truncated]':'')+'</pre>'
        :'<span class="hd-empty">empty</span>');
    }
    if(bt==='urlenc'){
      return badge+(h.urlEncoded&&h.urlEncoded.length
        ?kvRows(h.urlEncoded)
        :'<span class="hd-empty">no fields</span>');
    }
    if(bt==='form'){
      if(!h.formFields||!h.formFields.length)return badge+'<span class="hd-empty">no fields</span>';
      return badge+'<table class="hd-tbl">'+
        h.formFields.map(function(r){
          return '<tr>'+
            '<td class="hd-key">'+esc(r.k)+'</td>'+
            '<td class="hd-val">'+esc(r.v||'')+'</td>'+
            '<td class="hd-desc">'+esc(r.type||'text')+'</td>'+
          '</tr>';
        }).join('')+
      '</table>';
    }
    if(bt==='graphql'){
      return badge+
        '<div class="hd-sub-label">QUERY</div>'+
        '<pre class="hd-code">'+esc((h.gqlQ||'').slice(0,2000))+'</pre>'+
        (h.gqlV?'<div class="hd-sub-label">VARIABLES</div><pre class="hd-code">'+esc(h.gqlV.slice(0,1000))+'</pre>':'');
    }
    if(bt==='binary')return badge+'<span class="hd-empty">binary file (not stored)</span>';
    return badge;
  }

  // Script helper
  function scriptBlock(code) {
    if(!code||!code.trim())return '<span class="hd-empty">—</span>';
    return '<pre class="hd-code">'+esc(code.slice(0,3000))+(code.length>3000?'\n…[truncated]':'')+'</pre>';
  }

  // Settings helper
  function settingsBlock() {
    if(!h.reqSettings)return '<span class="hd-empty">—</span>';
    var s=h.reqSettings;
    return '<table class="hd-tbl">'+
      '<tr><td class="hd-key">Follow Redirects</td><td class="hd-val">'+(s.followRedirects!==false?'<span style="color:var(--ok)">✓ Yes</span>':'<span style="color:var(--text3)">✗ No</span>')+'</td></tr>'+
      '<tr><td class="hd-key">Disable Body</td><td class="hd-val">'+(s.disableBody?'<span style="color:var(--warn)">✓ Yes</span>':'<span style="color:var(--text3)">✗ No</span>')+'</td></tr>'+
      '<tr><td class="hd-key">Use Mock Response</td><td class="hd-val">'+(s.useMock?'<span style="color:var(--warn)">✓ Yes</span>':'<span style="color:var(--text3)">✗ No</span>')+'</td></tr>'+
      '<tr><td class="hd-key">Timeout (ms)</td><td class="hd-val"><span style="color:var(--text1)">'+esc(String(s.timeout||30000))+'</span></td></tr>'+
    '</table>';
  }

  // Count helpers
  function cnt(arr,key) {
    if(!arr)return 0;
    return key?arr.filter(function(r){return r[key];}).length:arr.length;
  }

  var html=
    '<div class="modal-bg"><div class="modal lg" style="max-height:90vh">' +

    // Header
    '<div class="mh">' +
      '<span class="tab-method" style="color:'+(MC[h.method]||'var(--text2)')+';font-size:13px;margin-right:8px;flex-shrink:0">'+h.method+'</span>' +
      '<span class="mh-title" style="font-size:12px;font-family:var(--mono);word-break:break-all;font-weight:400">'+esc(h.url)+'</span>' +
      '<button class="m-close" onclick="closeModal()">✕</button>' +
    '</div>' +

    // Meta bar
    '<div style="display:flex;gap:10px;align-items:center;padding:7px 16px;background:var(--bg3);border-bottom:1px solid var(--border);font-size:11px;flex-wrap:wrap">' +
      (h.status?'<span class="spill s'+Math.floor(h.status/100)+'">'+h.status+'</span>':'') +
      '<span style="color:var(--text3)">⏱ '+esc(String(h.time||0))+'ms</span>' +
      '<span style="color:var(--text3)">🕐 '+esc(h.at||'')+'</span>' +
      '<span style="color:var(--text3)" title="Request name">📛 '+esc(h.name||'')+'</span>' +
      '<button class="btn-s accent" style="margin-left:auto" onclick="(function(){var hh=S.history.find(function(x){return x.id===\''+h.id+'\';});if(hh){replayHistoryEntry(hh);closeModal();}})()">↩ Replay in New Tab</button>' +
    '</div>' +

    // Sections
    '<div class="mb" style="padding:0;overflow-y:auto">' +

      // 1. PARAMS
      '<div class="hd-section">' +
        '<div class="hd-section-title">① PARAMS <span class="hd-count">'+cnt(h.params,'k')+'</span></div>' +
        '<div class="hd-section-body">'+kvRows(h.params&&h.params.filter(function(r){return r.k;}))+'</div>' +
      '</div>' +

      // 2. PATH VARIABLES
      '<div class="hd-section">' +
        '<div class="hd-section-title">② PATH VARIABLES <span class="hd-count">'+cnt(h.pathVars)+'</span></div>' +
        '<div class="hd-section-body">'+pvRows(h.pathVars)+'</div>' +
      '</div>' +

      // 3. HEADERS
      '<div class="hd-section">' +
        '<div class="hd-section-title">③ HEADERS <span class="hd-count">'+cnt(h.headers,'k')+'</span></div>' +
        '<div class="hd-section-body">'+kvRows(h.headers&&h.headers.filter(function(r){return r.k;}))+'</div>' +
      '</div>' +

      // 4. BODY
      '<div class="hd-section">' +
        '<div class="hd-section-title">④ BODY <span class="hd-count">'+esc(h.bodyType||'none')+'</span></div>' +
        '<div class="hd-section-body">'+bodyBlock()+'</div>' +
      '</div>' +

      // 5. AUTH
      '<div class="hd-section">' +
        '<div class="hd-section-title">⑤ AUTH <span class="hd-count">'+esc(h.authType||'none')+'</span></div>' +
        '<div class="hd-section-body">'+authBlock()+'</div>' +
      '</div>' +

      // 6. PRE-REQ SCRIPT
      '<div class="hd-section">' +
        '<div class="hd-section-title">⑥ PRE-REQ SCRIPT <span class="hd-count">'+(h.preScript&&h.preScript.trim()?h.preScript.trim().split('\n').length+' lines':'empty')+'</span></div>' +
        '<div class="hd-section-body">'+scriptBlock(h.preScript)+'</div>' +
      '</div>' +

      // 7. TESTS
      '<div class="hd-section">' +
        '<div class="hd-section-title">⑦ TESTS <span class="hd-count">'+(h.testScript&&h.testScript.trim()?h.testScript.trim().split('\n').length+' lines':'empty')+'</span></div>' +
        '<div class="hd-section-body">'+scriptBlock(h.testScript)+'</div>' +
      '</div>' +

      // 8. SETTINGS
      '<div class="hd-section" style="border-bottom:none">' +
        '<div class="hd-section-title">⑧ SETTINGS</div>' +
        '<div class="hd-section-body">'+settingsBlock()+'</div>' +
      '</div>' +

    '</div>' +
    '<div class="mf"><button class="btn secondary" onclick="closeModal()">Close</button></div>' +
    '</div></div>';

  openModal(html);
}

// ─────────────────────────────────────────────────────────────
// HISTORY EVENTS — click delegation
// ─────────────────────────────────────────────────────────────
function initHistoryEvents() {
  var list=document.getElementById('hist-list');
  list.addEventListener('click',function(e){

    // 👁 VIEW — open detail modal
    var viewBtn=e.target.closest('[data-action="view"]');
    if(viewBtn){e.stopPropagation();openHistoryDetail(viewBtn.dataset.hid);return;}

    // Adv — open repeat popover
    var advBtn=e.target.closest('[data-action="adv"]');
    if(advBtn){e.stopPropagation();var h=S.history.find(function(x){return x.id===advBtn.dataset.hid;});if(h)openAdvPopover(h,advBtn);return;}

    // Pin / Unpin
    var pinBtn=e.target.closest('[data-action="pin"]');
    if(pinBtn){
      e.stopPropagation();
      var h2=S.history.find(function(x){return x.id===pinBtn.dataset.hid;});if(!h2)return;
      h2.pinned=!h2.pinned;
      S.history.sort(function(a,b){return(b.pinned===true?1:0)-(a.pinned===true?1:0);});
      save();renderHistory();notify(h2.pinned?'📌 Pinned':'Unpinned','info');return;
    }

    // Delete
    var delBtn=e.target.closest('[data-action="del"]');
    if(delBtn){
      e.stopPropagation();
      S.history=S.history.filter(function(x){return x.id!==delBtn.dataset.hid;});
      save();renderHistory();return;
    }

    // Row click — replay
    var rowEl=e.target.closest('.hist-row');
    if(rowEl){
      var h3=S.history.find(function(x){return x.id===rowEl.dataset.hid;});
      if(h3)replayHistoryEntry(h3);
    }
  });
}

// Replay — restores ALL 8 sections into a new tab
function replayHistoryEntry(h) {
  newTab({
    method:     h.method     || 'GET',
    url:        h.url        || '',
    name:       h.name       || (h.url||'').replace(/^https?:\/\//,'').slice(0,40)||'Request',
    params:     h.params     || [],
    pathVars:   h.pathVars   || [],
    headers:    h.headers    || [],
    bodyType:   h.bodyType   || 'none',
    rawBody:    h.rawBody    || '',
    rawFmt:     h.rawFmt     || 'json',
    urlEncoded: h.urlEncoded || [],
    formData:   h.formFields || [],
    gqlQ:       h.gqlQ       || '',
    gqlV:       h.gqlV       || '',
    authType:   h.authType   || 'none',
    authData:   h.authData   || {},
    preScript:  h.preScript  || '',
    testScript: h.testScript || '',
  });
}

function clearHistory(){if(!confirm('Delete ALL history including pinned?'))return;S.history=[];save();renderHistory();notify('History cleared','info');}
function unpinAllHistory(){var n=S.history.filter(function(h){return h.pinned===true;}).length;if(!n){notify('Nothing is pinned','info');return;}S.history.forEach(function(h){h.pinned=false;});save();renderHistory();notify('Unpinned '+n+' item'+(n!==1?'s':'')+' ✓','success');}

// ─────────────────────────────────────────────────────────────
// ADVANCED REPEAT POPOVER
// ─────────────────────────────────────────────────────────────
function openAdvPopover(histEntry,anchorEl){
  _advEntry=histEntry;
  var pop=document.getElementById('adv-popover');
  document.getElementById('adv-count').value='5';document.getElementById('adv-delay').value='0';
  document.getElementById('adv-results').innerHTML='';document.getElementById('adv-pw').style.display='none';
  document.getElementById('adv-pb').style.width='0';document.getElementById('adv-pt').textContent='0 / 0';
  document.getElementById('adv-run-btn').disabled=false;document.getElementById('adv-run-btn').textContent='▶ Run';
  _advRunning=false;
  var rect=anchorEl.getBoundingClientRect();
  pop.style.top=Math.min(rect.bottom+6,window.innerHeight-420)+'px';
  pop.style.left=Math.max(4,Math.min(rect.left-100,window.innerWidth-292))+'px';
  pop.style.display='block';
}
function closeAdvPopover(){_advRunning=false;document.getElementById('adv-popover').style.display='none';_advEntry=null;}
async function runAdvRepeat(){
  if(!_advEntry||_advRunning)return;
  var count=Math.max(1,Math.min(100000,parseInt(document.getElementById('adv-count').value)||5));
  var delay=Math.max(0,parseInt(document.getElementById('adv-delay').value)||0);
  var resultsEl=document.getElementById('adv-results'),pbWrap=document.getElementById('adv-pw'),pb=document.getElementById('adv-pb'),pt=document.getElementById('adv-pt'),runBtn=document.getElementById('adv-run-btn');
  _advRunning=true;runBtn.disabled=true;runBtn.textContent='⏳ Running…';
  resultsEl.innerHTML='';pbWrap.style.display='block';pb.style.width='0';pt.textContent='0 / '+count;
  var h=_advEntry,passed=0,failed=0;
  for(var i=0;i<count;i++){
    if(!_advRunning)break;
    var num=i+1;
    try{
      var resp=await executeRequestObject(h,{});
      var ok=resp.status>=200&&resp.status<300;if(ok)passed++;else failed++;
      var rowEl=document.createElement('div');rowEl.className='adv-result-row';
      rowEl.innerHTML='<span class="adv-result-num">#'+num+'</span><span class="adv-result-stat '+(ok?'ok':'err')+'">'+resp.status+' '+resp.statusText+'</span><span class="adv-result-time">'+resp._time+'ms</span>';
      resultsEl.appendChild(rowEl);resultsEl.scrollTop=resultsEl.scrollHeight;
    }catch(e2){
      failed++;var rowEl2=document.createElement('div');rowEl2.className='adv-result-row';
      rowEl2.innerHTML='<span class="adv-result-num">#'+num+'</span><span class="adv-result-stat err">Error</span><span class="adv-result-time" style="color:var(--err)">'+esc(e2.message)+'</span>';
      resultsEl.appendChild(rowEl2);resultsEl.scrollTop=resultsEl.scrollHeight;
    }
    pb.style.width=Math.round(num/count*100)+'%';pt.textContent=num+' / '+count;
    pb.style.background=failed>0?'var(--warn)':'var(--ok)';
    if(delay>0&&i<count-1)await sleep(delay);
  }
  _advRunning=false;runBtn.disabled=false;runBtn.textContent='▶ Run Again';
  notify('Repeat done: ✅ '+passed+'  ❌ '+failed,failed===0?'success':'warn');
}

// ─────────────────────────────────────────────────────────────
// COLLECTIONS
// ─────────────────────────────────────────────────────────────
function renderCollections(){var q=document.getElementById('coll-search').value.toLowerCase(),list=document.getElementById('coll-list');var filtered=S.collections.filter(function(c){return c.name.toLowerCase().indexOf(q)!==-1;});if(!filtered.length){list.innerHTML='<div class="empty-state"><div class="ei">📂</div><p>No collections yet.</p></div>';return;}list.innerHTML=filtered.map(function(c){return renderCollItem(c);}).join('');}
function renderCollItem(c){var items=(c.requests||[]).map(function(item){return item._isFolder?'<div class="coll-folder"><div class="folder-header" onclick="toggleFolder(\''+c.id+'\',\''+item.id+'\')"><span class="folder-arrow" id="fa-'+item.id+'">▶</span>📁 '+esc(item.name)+'</div><div class="folder-reqs" id="fr-'+item.id+'">'+(item.requests||[]).map(function(r){return reqRowHtml(c.id,r,true);}).join('')+'</div></div>':reqRowHtml(c.id,item,false);}).join('');return'<div class="coll-item" id="coll-'+c.id+'"><div class="coll-header" onclick="toggleColl(\''+c.id+'\')"><span class="coll-arrow" id="ca-'+c.id+'">▶</span><span class="coll-name" title="'+esc(c.name)+'">'+esc(c.name)+'</span><div class="coll-btns"><button class="icon-btn" title="Run" onclick="runCollModal(event,\''+c.id+'\')">▶</button><button class="icon-btn" title="Add folder" onclick="addFolder(event,\''+c.id+'\')">📁</button><button class="icon-btn" title="Add request" onclick="addToColl(event,\''+c.id+'\')">+</button><button class="icon-btn" title="Export" onclick="exportColl(event,\''+c.id+'\')">⬇</button><button class="icon-btn del" title="Delete" onclick="delColl(event,\''+c.id+'\')">🗑</button></div></div><div class="coll-reqs" id="cr-'+c.id+'">'+(items||'<div style="padding:8px;color:var(--text3);font-size:11px">Empty collection</div>')+'</div></div>';}
function reqRowHtml(collId,r,inFolder){return'<div class="req-row'+(inFolder?' folder-req-row':'')+'" onclick="loadCollReq(\''+collId+'\',\''+r.id+'\')"><span class="mbadge '+r.method+'" style="color:'+(MC[r.method]||'var(--text2)')+'">'+r.method+'</span><span class="req-name" title="'+esc(r.name)+'">'+esc(r.name)+'</span><div class="req-btns"><button class="icon-btn" title="Duplicate" onclick="dupReq(event,\''+collId+'\',\''+r.id+'\')">⧉</button><button class="icon-btn del" title="Delete" onclick="delReq(event,\''+collId+'\',\''+r.id+'\')">✕</button></div></div>';}
function toggleColl(id){document.getElementById('cr-'+id)&&document.getElementById('cr-'+id).classList.toggle('open');document.getElementById('ca-'+id)&&document.getElementById('ca-'+id).classList.toggle('open');}
function toggleFolder(cid,fid){document.getElementById('fr-'+fid)&&document.getElementById('fr-'+fid).classList.toggle('open');document.getElementById('fa-'+fid)&&document.getElementById('fa-'+fid).classList.toggle('open');}
function addFolder(e,collId){e.stopPropagation();var name=prompt('Folder name:');if(!name)return;var coll=S.collections.find(function(c){return c.id===collId;});if(!coll)return;if(!coll.requests)coll.requests=[];coll.requests.push({id:uid(),name:name,_isFolder:true,requests:[]});save();renderCollections();}
function runCollModal(e,id){e.stopPropagation();var coll=S.collections.find(function(c){return c.id===id;});if(!coll||!coll.requests||!coll.requests.length){notify('Collection is empty','error');return;}var reqs=(coll.requests||[]).filter(function(r){return!r._isFolder;});openModal('<div class="modal-bg"><div class="modal lg"><div class="mh"><span class="mh-title">▶ Runner — '+esc(coll.name)+'</span><button class="m-close" onclick="closeModal()">✕</button></div><div class="mb"><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px"><div class="fg"><label>ITERATIONS</label><input type="number" id="cr-iter" value="1" min="1" max="1000"></div><div class="fg"><label>DELAY (ms)</label><input type="number" id="cr-delay" value="0" min="0"></div><div class="fg"><label>STOP ON ERROR</label><label class="toggle" style="margin-top:6px"><input type="checkbox" id="cr-stop"><span class="t-slider"></span></label></div></div><div class="fg"><label>DATA FILE (CSV/JSON)</label><input type="file" id="cr-data" accept=".json,.csv"></div><div style="margin-bottom:10px"><div class="field-label">SELECT REQUESTS</div>'+reqs.map(function(r){return'<div class="cr-req-item"><input type="checkbox" class="cr-req-chk kv-chk" data-rid="'+r.id+'" checked><span class="mbadge '+r.method+'" style="color:'+(MC[r.method]||'var(--text2)')+'">'+r.method+'</span><span>'+esc(r.name)+'</span></div>';}).join('')+'</div><div class="cr-progress-wrap"><div class="cr-progress-bar" id="cr-bar"></div></div><div id="cr-results" style="max-height:280px;overflow-y:auto;"></div></div><div class="mf"><button class="btn secondary" onclick="closeModal()">Close</button><button class="btn primary" onclick="doRunColl(\''+id+'\')">▶ Run</button></div></div></div>');}
async function doRunColl(id){var coll=S.collections.find(function(c){return c.id===id;});if(!coll)return;var iters=parseInt(document.getElementById('cr-iter').value)||1,delay=parseInt(document.getElementById('cr-delay').value)||0,stop=document.getElementById('cr-stop').checked;var checkedIds=new Set(Array.from(document.querySelectorAll('.cr-req-chk:checked')).map(function(el){return el.dataset.rid;}));var reqs=(coll.requests||[]).filter(function(r){return!r._isFolder&&checkedIds.has(r.id);});if(!reqs.length){notify('No requests selected','error');return;}var dataRows=[{}];var dataFile=document.getElementById('cr-data')&&document.getElementById('cr-data').files&&document.getElementById('cr-data').files[0];if(dataFile){try{var txt=await dataFile.text();if(dataFile.name.endsWith('.json')){dataRows=JSON.parse(txt);if(!Array.isArray(dataRows))dataRows=[dataRows];}else{var lines=txt.trim().split('\n'),hdrs=lines[0].split(',').map(function(h){return h.trim().replace(/^"|"$/g,'');});dataRows=lines.slice(1).map(function(line){var vals=line.split(',').map(function(v){return v.trim().replace(/^"|"$/g,'');});return Object.fromEntries(hdrs.map(function(h,i){return[h,vals[i]||''];}));});}}catch(e){notify('Data file error: '+e.message,'error');return;}}var total=iters*dataRows.length*reqs.length,done=0,passed=0,failed=0;var resultEl=document.getElementById('cr-results');resultEl.innerHTML='';for(var iter=0;iter<iters;iter++){for(var di=0;di<dataRows.length;di++){_iterInfo={iteration:iter,iterationCount:iters,dataRow:dataRows[di]};for(var ri=0;ri<reqs.length;ri++){var req=reqs[ri];try{if(req.preScript&&req.preScript.trim()){var pm2=buildPM(null,coll.variables||{});runScript(req.preScript,pm2);}var ro=await executeRequestObject(req,dataRows[di]);_testResults=[];if(req.testScript&&req.testScript.trim()){var pm3=buildPM(ro,coll.variables||{});runScript(req.testScript,pm3);}var pt2=_testResults.filter(function(t){return t.pass;}).length,isOk=ro.status>=200&&ro.status<300&&(!_testResults.length||pt2===_testResults.length);if(isOk)passed++;else failed++;resultEl.innerHTML+='<div class="cr-result-item '+(isOk?'pass':'fail')+'"><span>'+(isOk?'✅':'❌')+'</span><div><div style="font-weight:600;font-size:12px">['+(iter+1)+'/'+iters+'] '+esc(req.name)+' — '+ro.status+' '+ro.statusText+'</div>'+_testResults.map(function(t){return'<div style="font-size:11px;color:'+(t.pass?'var(--ok)':'var(--err)')+';margin-top:2px">'+(t.pass?'✓':'✗')+' '+esc(t.name)+(t.error?' — '+esc(t.error):'')+'</div>';}).join('')+'</div></div>';if(!isOk&&stop){notify('Stopped on error','warn');return;}}catch(err){failed++;resultEl.innerHTML+='<div class="cr-result-item fail"><span>❌</span><div><div style="font-weight:600;font-size:12px">'+esc(req.name)+'</div><div style="font-size:11px;color:var(--err)">'+esc(err.message)+'</div></div></div>';if(stop){notify('Stopped on error','warn');return;}}done++;var bar=document.getElementById('cr-bar');if(bar)bar.style.width=Math.round(done/total*100)+'%';resultEl.scrollTop=resultEl.scrollHeight;if(delay>0)await sleep(delay);}}}notify('Runner done: ✅ '+passed+' passed  ❌ '+failed+' failed',failed===0?'success':'warn');}
function openNewColl(){openModal('<div class="modal-bg"><div class="modal sm"><div class="mh"><span class="mh-title">New Collection</span><button class="m-close" onclick="closeModal()">✕</button></div><div class="mb"><div class="fg"><label>NAME</label><input id="nc-name" placeholder="My Collection" autofocus></div><div class="fg"><label>DESCRIPTION</label><textarea id="nc-desc" rows="2" style="width:100%;resize:none" placeholder="Optional"></textarea></div></div><div class="mf"><button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="createColl()">Create</button></div></div></div>');setTimeout(function(){var el=document.getElementById('nc-name');if(el)el.focus();},50);}
function createColl(){var name=document.getElementById('nc-name').value.trim();if(!name){notify('Name required','error');return;}S.collections.push({id:uid(),name:name,desc:document.getElementById('nc-desc').value,requests:[],variables:{},created:Date.now()});save();renderCollections();closeModal();notify('Collection created!','success');}
function delColl(e,id){e.stopPropagation();if(!confirm('Delete this collection?'))return;S.collections=S.collections.filter(function(c){return c.id!==id;});save();renderCollections();}
function addToColl(e,id){e.stopPropagation();saveTabUI();var tab=getActiveTab(),coll=S.collections.find(function(c){return c.id===id;});if(!coll||!tab)return;var name=prompt('Request name:',tab.name||'New Request');if(!name)return;if(!coll.requests)coll.requests=[];coll.requests.push({id:uid(),name:name,method:tab.method||'GET',url:tab.url||'',headers:tab.headers||[],params:tab.params||[],pathVars:tab.pathVars||[],urlEncoded:tab.urlEncoded||[],formData:tab.formData||[],rawBody:tab.rawBody||'',bodyType:tab.bodyType||'none',rawFmt:tab.rawFmt||'json',gqlQ:tab.gqlQ||'',gqlV:tab.gqlV||'',authType:tab.authType||'none',authData:tab.authData||{},preScript:tab.preScript||'',testScript:tab.testScript||''});save();renderCollections();notify('Saved to collection!','success');}
function saveToCollection(){saveTabUI();var tab=getActiveTab();if(!S.collections.length){openNewColl();return;}openModal('<div class="modal-bg"><div class="modal sm"><div class="mh"><span class="mh-title">💾 Save Request</span><button class="m-close" onclick="closeModal()">✕</button></div><div class="mb"><div class="fg"><label>REQUEST NAME</label><input id="sr-name" value="'+esc(tab&&tab.name||'New Request')+'"></div><div class="fg"><label>COLLECTION</label><select id="sr-coll" style="width:100%">'+S.collections.map(function(c){return'<option value="'+c.id+'">'+esc(c.name)+'</option>';}).join('')+'</select></div></div><div class="mf"><button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="doSave()">Save</button></div></div></div>');}
function doSave(){var name=document.getElementById('sr-name').value.trim(),id=document.getElementById('sr-coll').value;var coll=S.collections.find(function(c){return c.id===id;}),tab=getActiveTab();if(!coll||!name)return;if(!coll.requests)coll.requests=[];coll.requests.push({id:uid(),name:name,method:(tab&&tab.method)||'GET',url:(tab&&tab.url)||'',headers:(tab&&tab.headers)||[],params:(tab&&tab.params)||[],pathVars:(tab&&tab.pathVars)||[],urlEncoded:(tab&&tab.urlEncoded)||[],formData:(tab&&tab.formData)||[],rawBody:(tab&&tab.rawBody)||'',bodyType:(tab&&tab.bodyType)||'none',rawFmt:(tab&&tab.rawFmt)||'json',gqlQ:(tab&&tab.gqlQ)||'',gqlV:(tab&&tab.gqlV)||'',authType:(tab&&tab.authType)||'none',authData:(tab&&tab.authData)||{},preScript:(tab&&tab.preScript)||'',testScript:(tab&&tab.testScript)||''});if(tab)tab.name=name;save();renderCollections();renderTabs();closeModal();notify('Saved!','success');}
function loadCollReq(cid,rid){var coll=S.collections.find(function(c){return c.id===cid;});var req=coll&&coll.requests&&coll.requests.find(function(r){return r.id===rid;});if(!req){for(var i=0;i<(coll&&coll.requests||[]).length;i++){var item=coll.requests[i];if(item._isFolder){req=item.requests&&item.requests.find(function(r){return r.id===rid;});if(req)break;}}}if(!req)return;newTab(Object.assign({},req));}
function dupReq(e,cid,rid){e.stopPropagation();var coll=S.collections.find(function(c){return c.id===cid;}),req=coll&&coll.requests&&coll.requests.find(function(r){return r.id===rid;});if(!req||!coll)return;coll.requests.push(Object.assign({},req,{id:uid(),name:req.name+' (copy)'}));save();renderCollections();notify('Duplicated!','success');}
function delReq(e,cid,rid){e.stopPropagation();var coll=S.collections.find(function(c){return c.id===cid;});if(!coll)return;coll.requests=coll.requests.filter(function(r){return r.id!==rid;});save();renderCollections();}
function mapToPostman(r){return{name:r.name,request:{method:r.method||'GET',url:{raw:r.url||'',host:[],path:[],query:[],variable:[]},header:(r.headers||[]).filter(function(h){return h.k;}).map(function(h){return{key:h.k,value:h.v,disabled:!h.on};}),body:r.bodyType!=='none'?{mode:r.bodyType==='raw'?'raw':r.bodyType,raw:r.rawBody||''}:undefined,auth:r.authType!=='none'?{type:r.authType}:undefined},event:[].concat(r.preScript?[{listen:'prerequest',script:{exec:r.preScript.split('\n'),type:'text/javascript'}}]:[],r.testScript?[{listen:'test',script:{exec:r.testScript.split('\n'),type:'text/javascript'}}]:[])};}
function exportColl(e,id){e.stopPropagation();var coll=S.collections.find(function(c){return c.id===id;});if(!coll)return;dl(JSON.stringify({info:{name:coll.name,description:coll.desc||'',schema:'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'},variable:Object.keys(coll.variables||{}).map(function(k){return{key:k,value:coll.variables[k]};}),item:(coll.requests||[]).map(function(r){return r._isFolder?{name:r.name,item:(r.requests||[]).map(mapToPostman)}:mapToPostman(r);})},null,2),coll.name.replace(/\s+/g,'_')+'.postman_collection.json');notify('Exported!','success');}
function exportAllColls(){dl(JSON.stringify(S.collections,null,2),'postmanweb_collections.json');notify('All collections exported!','success');}

// ─────────────────────────────────────────────────────────────
// ENVIRONMENTS
// ─────────────────────────────────────────────────────────────
function renderEnvs(){var list=document.getElementById('env-list');if(!S.envs.length){list.innerHTML='<div class="empty-state"><div class="ei">🌍</div><p>No environments.</p></div>';return;}list.innerHTML=S.envs.map(function(e){return'<div class="env-row'+(e.id===S.activeEnv?' active-env':'')+'" onclick="setEnv(\''+e.id+'\')"><div class="env-dot'+(e.id===S.activeEnv?' on':'')+'"></div><span class="env-nm">'+esc(e.name)+'</span><button class="btn-s" onclick="editEnv(event,\''+e.id+'\')">Edit</button><button class="btn-s" onclick="exportEnv(event,\''+e.id+'\')">⬇</button><button class="btn-s" onclick="delEnv(event,\''+e.id+'\')">🗑</button></div>';}).join('');refreshEnvQuick();}
function refreshEnvQuick(){var sel=document.getElementById('env-quick');if(!sel)return;sel.innerHTML='<option value="">No Environment</option>'+S.envs.map(function(e){return'<option value="'+e.id+'"'+(e.id===S.activeEnv?' selected':'')+'>'+esc(e.name)+'</option>';}).join('');}
function quickEnvSwitch(id){S.activeEnv=id||null;save();renderEnvs();notify(id?'Env: '+(S.envs.find(function(e){return e.id===id;})||{}).name:'No environment','info');}
function setEnv(id){S.activeEnv=S.activeEnv===id?null:id;save();renderEnvs();var e2=S.envs.find(function(e){return e.id===S.activeEnv;});notify(S.activeEnv?'Env: '+e2.name:'No environment','info');}
function openNewEnv(){openModal('<div class="modal-bg"><div class="modal sm"><div class="mh"><span class="mh-title">New Environment</span><button class="m-close" onclick="closeModal()">✕</button></div><div class="mb"><div class="fg"><label>NAME</label><input id="ne-name" placeholder="Production" autofocus></div></div><div class="mf"><button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="createEnv()">Create</button></div></div></div>');setTimeout(function(){var el=document.getElementById('ne-name');if(el)el.focus();},50);}
function createEnv(){var name=document.getElementById('ne-name').value.trim();if(!name)return;var env={id:uid(),name:name,variables:{}};S.envs.push(env);save();renderEnvs();closeModal();editEnv(null,env.id);}
function editEnv(e,id){if(e)e.stopPropagation();var env=S.envs.find(function(x){return x.id===id;});if(!env)return;openModal('<div class="modal-bg"><div class="modal lg"><div class="mh"><span class="mh-title">Edit: '+esc(env.name)+'</span><button class="m-close" onclick="closeModal()">✕</button></div><div class="mb"><div id="ev-list">'+Object.keys(env.variables||{}).map(function(k){return'<div class="ev-row"><input placeholder="Variable" value="'+esc(k)+'"><input placeholder="Value" value="'+esc(env.variables[k])+'"><button class="ev-del" onclick="this.parentElement.remove()">✕</button></div>';}).join('')+'</div><button class="add-row-btn" onclick="addEvRow()" style="margin-top:8px">+ Add Variable</button></div><div class="mf"><button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveEnv(\''+id+'\')">Save</button></div></div></div>');}
function addEvRow(){var div=document.createElement('div');div.className='ev-row';div.innerHTML='<input placeholder="Variable"><input placeholder="Value"><button class="ev-del" onclick="this.parentElement.remove()">✕</button>';document.getElementById('ev-list').appendChild(div);}
function saveEnv(id){var env=S.envs.find(function(x){return x.id===id;});if(!env)return;env.variables={};document.querySelectorAll('#ev-list .ev-row').forEach(function(row){var inp=row.querySelectorAll('input');if(inp[0]&&inp[0].value.trim())env.variables[inp[0].value.trim()]=inp[1]&&inp[1].value||'';});save();renderEnvs();closeModal();notify('Environment saved!','success');}
function delEnv(e,id){e.stopPropagation();if(!confirm('Delete this environment?'))return;S.envs=S.envs.filter(function(x){return x.id!==id;});if(S.activeEnv===id)S.activeEnv=null;save();renderEnvs();}
function exportEnv(e,id){e.stopPropagation();var env=S.envs.find(function(x){return x.id===id;});if(!env)return;dl(JSON.stringify({id:env.id,name:env.name,values:Object.keys(env.variables||{}).map(function(k){return{key:k,value:env.variables[k],enabled:true};})},null,2),env.name.replace(/\s+/g,'_')+'.postman_environment.json');}

// ─────────────────────────────────────────────────────────────
// GLOBALS
// ─────────────────────────────────────────────────────────────
function openGlobals(){openModal('<div class="modal-bg"><div class="modal lg"><div class="mh"><span class="mh-title">🌐 Global Variables</span><button class="m-close" onclick="closeModal()">✕</button></div><div class="mb"><div id="gv-list">'+Object.keys(S.globals).map(function(k){return'<div class="ev-row"><input placeholder="Variable" value="'+esc(k)+'"><input placeholder="Value" value="'+esc(S.globals[k])+'"><button class="ev-del" onclick="this.parentElement.remove()">✕</button></div>';}).join('')+'</div><button class="add-row-btn" onclick="addGVRow()" style="margin-top:8px">+ Add Variable</button></div><div class="mf"><button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveGlobals()">Save</button></div></div></div>');}
function addGVRow(){var div=document.createElement('div');div.className='ev-row';div.innerHTML='<input placeholder="Variable"><input placeholder="Value"><button class="ev-del" onclick="this.parentElement.remove()">✕</button>';document.getElementById('gv-list').appendChild(div);}
function saveGlobals(){S.globals={};document.querySelectorAll('#gv-list .ev-row').forEach(function(row){var inp=row.querySelectorAll('input');if(inp[0]&&inp[0].value.trim())S.globals[inp[0].value.trim()]=inp[1]&&inp[1].value||'';});save();closeModal();notify('Globals saved!','success');}

// ─────────────────────────────────────────────────────────────
// CODE GENERATION
// ─────────────────────────────────────────────────────────────
function openCodegen(){saveTabUI();openModal('<div class="modal-bg"><div class="modal xl"><div class="mh"><span class="mh-title">{ } Code Snippet</span><button class="m-close" onclick="closeModal()">✕</button></div><div class="mb"><div class="lang-tabs">'+['cURL','JavaScript (Fetch)','JavaScript (Axios)','Python (requests)','Java (OkHttp)','C# (HttpClient)','Go (net/http)','PHP (Guzzle)','Ruby','Swift','Kotlin','Rust','Node.js','PowerShell'].map(function(l){return'<button class="lang-tab'+(l==='cURL'?' active':'')+'" onclick="switchLang(\''+esc(l)+'\',this)">'+l+'</button>';}).join('')+'</div><textarea id="cg-out" readonly spellcheck="false"></textarea><div style="display:flex;gap:8px;margin-top:10px"><button class="btn primary" onclick="copyCG()">📋 Copy Code</button></div></div></div></div>');genCode('cURL');}
function switchLang(lang,btn){document.querySelectorAll('.lang-tab').forEach(function(b){b.classList.remove('active');});btn.classList.add('active');genCode(lang);}
function copyCG(){navigator.clipboard.writeText(document.getElementById('cg-out').value).then(function(){notify('Copied!','success');});}
function genCode(lang){
  var method=document.getElementById('method-sel').value,url=document.getElementById('url-in').value;
  var hRows=readKV('headers').filter(function(h){return h.on!==false&&h.k;});
  var authType=(document.getElementById('auth-sel')||{}).value;var authH={};
  if(authType==='bearer'){var t=(document.getElementById('a-token')||{}).value;if(t)authH['Authorization']='Bearer '+t;}
  else if(authType==='basic'){var u=(document.getElementById('a-user')||{}).value||'',p=(document.getElementById('a-pass')||{}).value||'';authH['Authorization']='Basic '+btoa(u+':'+p);}
  else if(authType==='apikey'&&(document.getElementById('a-key-in')||{}).value==='header'){var k=(document.getElementById('a-key')||{}).value,v2=(document.getElementById('a-key-val')||{}).value;if(k&&v2)authH[k]=v2;}
  else if(authType==='oauth2'){var t2=(document.getElementById('a-o2')||{}).value;if(t2)authH['Authorization']=((document.getElementById('a-o2p')||{}).value||'Bearer')+' '+t2;}
  var rawBody=(document.getElementById('code-raw')||{}).value||'';
  var allH={};hRows.forEach(function(h){allH[h.k]=h.v;});Object.assign(allH,authH);
  var hasBody=_bodyType==='raw'&&rawBody;
  var hJ=JSON.stringify(allH,null,2),hJ4=JSON.stringify(allH,null,4);
  var codes={
    'cURL':function(){var c='curl --location --request '+method+' \''+url+'\'';Object.keys(allH).forEach(function(k){c+=' \\\n  --header \''+k+': '+allH[k]+'\'';});if(hasBody)c+=' \\\n  --data-raw \''+rawBody.replace(/'/g,"'\\''")+'\'';return c;},
    'JavaScript (Fetch)':function(){return'const myHeaders = new Headers('+hJ+');\n\nconst requestOptions = {\n  method: "'+method+'",\n  headers: myHeaders,\n  '+(hasBody?'body: '+JSON.stringify(rawBody)+',\n  ':'')+'redirect: "follow"\n};\n\nfetch("'+url+'", requestOptions)\n  .then(response => response.json())\n  .then(result => console.log(result))\n  .catch(error => console.error("Error:", error));';},
    'Python (requests)':function(){var c='import requests\nimport json\n\nurl = "'+url+'"\n\nheaders = '+hJ4+'\n';if(hasBody)c+='\npayload = json.dumps('+rawBody+')\n\nresponse = requests.request("'+method+'", url, headers=headers, data=payload)';else c+='\nresponse = requests.request("'+method+'", url, headers=headers)';return c+'\n\nprint(response.status_code)\nprint(response.json())';},
    'Node.js':function(){return'const https = require(\'https\');\nconst url = new URL(\''+url+'\');\n\nconst options = {\n  hostname: url.hostname,\n  port: url.port || 443,\n  path: url.pathname + url.search,\n  method: \''+method+'\',\n  headers: '+hJ+'\n};\n\nconst req = https.request(options, res => {\n  let data = \'\';\n  res.on(\'data\', chunk => data += chunk);\n  res.on(\'end\', () => console.log(data));\n});\n'+(hasBody?'req.write('+JSON.stringify(rawBody)+');\n':'')+'req.on(\'error\', console.error);\nreq.end();'},
  };
  var out=document.getElementById('cg-out');if(out)out.value=(codes[lang]||(function(){return codes['cURL']();}))();
}

// ─────────────────────────────────────────────────────────────
// WEBSOCKET
// ─────────────────────────────────────────────────────────────
function openWS(){openModal('<div class="modal-bg"><div class="modal lg"><div class="mh"><span class="mh-title">🔌 WebSocket Client</span><button class="m-close" onclick="closeModal();wsDisconnect()">✕</button></div><div class="mb"><div style="display:flex;gap:8px;margin-bottom:10px"><input id="ws-url" type="text" placeholder="wss://echo.websocket.org" style="flex:1"><button class="btn primary" id="ws-btn" onclick="wsToggle()">Connect</button></div><div style="display:flex;gap:8px;margin-bottom:10px"><input id="ws-msg" type="text" placeholder=\'{"type":"ping"}\' style="flex:1"><button class="btn secondary" onclick="wsSend()">Send</button></div><div id="ws-msgs" style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);min-height:200px;max-height:350px;overflow-y:auto;padding:4px"></div></div><div class="mf"><button class="btn secondary" onclick="closeModal();wsDisconnect()">Close</button></div></div></div>');}
function wsToggle(){if(_wsConn&&_wsConn.readyState===WebSocket.OPEN)wsDisconnect();else wsConnect();}
function wsConnect(){var url=(document.getElementById('ws-url')||{}).value||'';if(!url){notify('Enter WebSocket URL','error');return;}try{_wsConn=new WebSocket(url);wsLog('• Connecting to '+url+'...','sys');_wsConn.onopen=function(){wsLog('✅ Connected!','sys');var b=document.getElementById('ws-btn');if(b){b.textContent='Disconnect';b.style.background='var(--err)';}};_wsConn.onmessage=function(e){wsLog('← '+e.data,'recv');};_wsConn.onerror=function(){wsLog('❌ Error','sys');};_wsConn.onclose=function(){wsLog('• Closed','sys');var b=document.getElementById('ws-btn');if(b){b.textContent='Connect';b.style.background='';}}}catch(e){wsLog('❌ '+e.message,'sys');}}
function wsDisconnect(){if(_wsConn){_wsConn.close();_wsConn=null;}}
function wsSend(){var msg=(document.getElementById('ws-msg')||{}).value||'';if(!msg)return;if(!_wsConn||_wsConn.readyState!==WebSocket.OPEN){notify('Not connected','error');return;}_wsConn.send(msg);wsLog('→ '+msg,'sent');document.getElementById('ws-msg').value='';}
function wsLog(msg,cls){var d=document.getElementById('ws-msgs');if(!d)return;var div=document.createElement('div');div.className='ws-line '+cls;div.textContent=msg;d.appendChild(div);d.scrollTop=d.scrollHeight;}

// ─────────────────────────────────────────────────────────────
// gRPC
// ─────────────────────────────────────────────────────────────
function openGRPC(){openModal('<div class="modal-bg"><div class="modal lg"><div class="mh"><span class="mh-title">gRPC Client</span><button class="m-close" onclick="closeModal()">✕</button></div><div class="mb"><div class="fg"><label>SERVER URL</label><input id="grpc-url" placeholder="https://grpc.example.com"></div><div class="fg"><label>SERVICE METHOD</label><input id="grpc-method" placeholder="package.Service/Method"></div><div class="fg"><label>REQUEST BODY (JSON)</label><textarea id="grpc-body" rows="6" class="code-area" placeholder=\'{"key":"value"}\'></textarea></div><div class="fg"><label>METADATA (JSON)</label><textarea id="grpc-meta" rows="3" class="code-area" placeholder=\'{"authorization":"Bearer token"}\'></textarea></div><div id="grpc-resp" style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);min-height:80px;max-height:200px;overflow-y:auto;padding:10px;font-family:var(--mono);font-size:12px;color:var(--text3);margin-top:8px">gRPC response will appear here...</div></div><div class="mf"><button class="btn secondary" onclick="closeModal()">Close</button><button class="btn primary" onclick="invokeGRPC()">Invoke</button></div></div></div>');}
async function invokeGRPC(){var url=(document.getElementById('grpc-url')||{}).value||'',method=(document.getElementById('grpc-method')||{}).value||'',body=(document.getElementById('grpc-body')||{}).value||'',meta=(document.getElementById('grpc-meta')||{}).value||'',respEl=document.getElementById('grpc-resp');if(!url||!method){notify('URL and method required','error');return;}respEl.innerHTML='<span style="color:var(--text3)">⏳ Invoking...</span>';var direct=isPrivate(url);var proxyUrl=(!direct&&S.settings.corsEnabled)?S.settings.proxyUrl+encodeURIComponent(url+'/'+method):url+'/'+method;var h={'Content-Type':'application/grpc-web+json','x-grpc-web':'1'};if(meta){try{Object.assign(h,JSON.parse(meta));}catch(e){}}try{var r=await fetch(proxyUrl,{method:'POST',headers:h,body:body||'{}'});var txt=await r.text();var p;try{p=JSON.parse(txt);}catch(e){p=txt;}respEl.innerHTML='<span style="color:var(--ok)">Status: '+r.status+' '+r.statusText+'</span>\n\n'+esc(typeof p==='string'?p:JSON.stringify(p,null,2));notify('gRPC: '+r.status,r.ok?'success':'error');}catch(e){respEl.innerHTML='<span style="color:var(--err)">'+esc(e.message)+'</span>';notify('gRPC error: '+e.message,'error');}}

// ─────────────────────────────────────────────────────────────
// MOCK SERVER
// ─────────────────────────────────────────────────────────────
function openMockServer(){openModal('<div class="modal-bg"><div class="modal lg"><div class="mh"><span class="mh-title">🎭 Mock Server</span><button class="m-close" onclick="closeModal()">✕</button></div><div class="mb"><p style="font-size:12px;color:var(--text3);margin-bottom:12px">Enable "Use Mock Response" in Request Settings to intercept matching requests.</p><div id="mock-rules">'+(S.mocks.length?S.mocks.map(function(m,i){return mockRuleHtml(m,i);}).join(''):'<p style="color:var(--text3);font-size:12px">No mock rules yet.</p>')+'</div><button class="add-row-btn" style="margin-top:10px" onclick="addMockRule()">+ Add Mock Rule</button></div><div class="mf"><button class="btn secondary" onclick="closeModal()">Close</button><button class="btn primary" onclick="saveMockRules()">Save Rules</button></div></div></div>');}
function mockRuleHtml(m,i){return'<div class="mock-rule" id="mock-rule-'+i+'"><div class="mock-rule-hdr" style="margin-bottom:8px"><select style="width:90px" id="mr-method-'+i+'">'+['*','GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].map(function(x){return'<option'+(x===m.method?' selected':'')+'>'+x+'</option>';}).join('')+'</select><input type="text" id="mr-path-'+i+'" value="'+esc(m.path||'')+'" placeholder="/api/users" style="flex:1"><select id="mr-status-'+i+'" style="width:80px">'+[200,201,204,400,401,403,404,422,500,502,503].map(function(s){return'<option'+(s===m.statusCode?' selected':'')+'>'+s+'</option>';}).join('')+'</select><input type="number" id="mr-delay-'+i+'" value="'+(m.delay||0)+'" style="width:70px"><label class="toggle"><input type="checkbox" id="mr-en-'+i+'"'+(m.enabled!==false?' checked':'')+'><span class="t-slider"></span></label><button class="icon-btn del" onclick="removeMockRule('+i+')">🗑</button></div><div class="fg"><label>RESPONSE BODY</label><textarea id="mr-body-'+i+'" class="code-area" rows="4">'+esc(m.body||'{}')+'</textarea></div><div class="fg"><label>CONTENT TYPE</label><input type="text" id="mr-ct-'+i+'" value="'+esc(m.contentType||'application/json')+'"></div></div>';}
function addMockRule(){S.mocks.push({id:uid(),method:'GET',path:'',statusCode:200,body:'{}',contentType:'application/json',delay:0,enabled:true});document.getElementById('mock-rules').innerHTML=S.mocks.map(function(m,i){return mockRuleHtml(m,i);}).join('');}
function removeMockRule(i){S.mocks.splice(i,1);save();openMockServer();}
function saveMockRules(){S.mocks=S.mocks.map(function(_,i){return{id:S.mocks[i].id||uid(),method:(document.getElementById('mr-method-'+i)||{}).value||'GET',path:(document.getElementById('mr-path-'+i)||{}).value||'',statusCode:parseInt((document.getElementById('mr-status-'+i)||{}).value)||200,body:(document.getElementById('mr-body-'+i)||{}).value||'{}',contentType:(document.getElementById('mr-ct-'+i)||{}).value||'application/json',delay:parseInt((document.getElementById('mr-delay-'+i)||{}).value)||0,enabled:(document.getElementById('mr-en-'+i)||{}).checked!==false};});save();closeModal();notify('Mock rules saved!','success');}

// ─────────────────────────────────────────────────────────────
// IMPORT
// ─────────────────────────────────────────────────────────────
function openImport(){openModal('<div class="modal-bg"><div class="modal md"><div class="mh"><span class="mh-title">📥 Import</span><button class="m-close" onclick="closeModal()">✕</button></div><div class="mb"><div class="fg"><label>PASTE JSON (Postman Collection v2.1, Environment, OpenAPI) OR cURL COMMAND</label><textarea id="imp-txt" rows="10" style="width:100%;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:10px;color:var(--text1);font-family:var(--mono);font-size:12px;resize:vertical" placeholder="Paste here..."></textarea></div><div class="fg"><label>OR UPLOAD FILE</label><input type="file" id="imp-file" accept=".json,.yaml,.yml" onchange="loadImpFile(this)"></div></div><div class="mf"><button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="doImport()">Import</button></div></div></div>');}
function loadImpFile(inp){var f=inp.files&&inp.files[0];if(!f)return;var r=new FileReader();r.onload=function(e){document.getElementById('imp-txt').value=e.target.result;};r.readAsText(f);}
function doImport(){var text=document.getElementById('imp-txt').value.trim();if(!text){notify('Nothing to import','error');return;}if(text.toLowerCase().indexOf('curl')===0){importCurl(text);closeModal();return;}try{var data=JSON.parse(text);if(data.info&&data.item){var coll={id:uid(),name:data.info.name||'Imported',desc:data.info.description||'',requests:[],variables:{}};if(data.variable)data.variable.forEach(function(v){coll.variables[v.key]=v.value;});function flat(items,target){items&&items.forEach(function(item){if(item.item){var folder={id:uid(),name:item.name,_isFolder:true,requests:[]};flat(item.item,folder.requests);target.push(folder);}else if(item.request){target.push({id:uid(),name:item.name||'Request',method:item.request.method||'GET',url:typeof item.request.url==='string'?item.request.url:(item.request.url&&item.request.url.raw||''),headers:(item.request.header||[]).map(function(h){return{id:uid(),on:!h.disabled,k:h.key,v:h.value,desc:h.description||''};}),rawBody:(item.request.body&&item.request.body.raw)||'',bodyType:(item.request.body&&item.request.body.mode==='raw')?'raw':(item.request.body&&item.request.body.mode)||'none',rawFmt:'json',authType:(item.request.auth&&item.request.auth.type)||'none',authData:{},preScript:((item.event&&item.event.find(function(e){return e.listen==='prerequest';}))||{script:{exec:[]}}).script.exec.join('\n')||'',testScript:((item.event&&item.event.find(function(e){return e.listen==='test';}))||{script:{exec:[]}}).script.exec.join('\n')||''});}});}flat(data.item,coll.requests);S.collections.push(coll);save();renderCollections();closeModal();notify('✅ Imported "'+coll.name+'" — '+coll.requests.length+' items','success');return;}if(data.values&&(data.name||data.id)){var env={id:uid(),name:data.name||'Imported Env',variables:{}};(data.values||[]).forEach(function(v){env.variables[v.key]=v.value;});S.envs.push(env);save();renderEnvs();closeModal();notify('✅ Env "'+env.name+'" imported','success');return;}if(Array.isArray(data)&&data[0]&&data[0].requests){S.collections.push.apply(S.collections,data);save();renderCollections();closeModal();notify('Imported '+data.length+' collections','success');return;}if(data.openapi||data.swagger){importOpenAPI(data);closeModal();return;}notify('Unrecognized format','error');}catch(e){notify('Invalid JSON: '+e.message,'error');}}
function importCurl(curl){try{var mm=curl.match(/-X\s+(\w+)/i)||curl.match(/--request\s+(\w+)/i);var um=curl.match(/curl\s+(?:-[^\s]+\s+)*['"]?([^\s'"]+)['"]?/);var hm=Array.from(curl.matchAll(/-H\s+['"]([^'"]+)['"]/gi));var dm=curl.match(/(?:--data(?:-raw|-binary)?|-d)\s+['"]([^'"]*)['"]/i)||curl.match(/--data '([^']*)'/i);var method=((mm&&mm[1])||'GET').toUpperCase(),url=(um&&um[1])||'';var headers=hm.map(function(m){var parts=m[1].split(':');var k=parts.shift();return{id:uid(),on:true,k:k.trim(),v:parts.join(':').trim(),desc:''};});var body=(dm&&dm[1])||'';newTab({method:method,url:url,name:url.replace(/^https?:\/\//,'').slice(0,40)||'Imported',headers:headers,rawBody:body,bodyType:body?'raw':'none',rawFmt:'json'});notify('Imported from cURL!','success');}catch(e){notify('cURL parse error: '+e.message,'error');}}
function importOpenAPI(spec){var coll={id:uid(),name:(spec.info&&spec.info.title)||'OpenAPI Import',desc:(spec.info&&spec.info.description)||'',requests:[],variables:{}};var base=((spec.servers&&spec.servers[0]&&spec.servers[0].url)||'')+(spec.basePath||'');Object.keys(spec.paths||{}).forEach(function(path){['get','post','put','patch','delete','head','options'].forEach(function(m){var pathItem=spec.paths[path];if(!pathItem[m])return;var op=pathItem[m];var hdrs=[],params=[];(op.parameters||[]).forEach(function(p){if(p.in==='header')hdrs.push({id:uid(),on:true,k:p.name,v:p.example||'',desc:p.description||''});else if(p.in==='query')params.push({id:uid(),on:true,k:p.name,v:p.example||'',desc:p.description||''});});var rawBody='',bodyType='none';if(op.requestBody){var ct=op.requestBody.content||{};var j=ct['application/json'];if(j&&j.example){rawBody=JSON.stringify(j.example,null,2);bodyType='raw';}}coll.requests.push({id:uid(),name:op.summary||op.operationId||(m.toUpperCase()+' '+path),method:m.toUpperCase(),url:base+path,headers:hdrs,params:params,rawBody:rawBody,bodyType:bodyType,rawFmt:'json',authType:'none',authData:{},preScript:'',testScript:''});});});S.collections.push(coll);save();renderCollections();notify('✅ OpenAPI imported — '+coll.requests.length+' endpoints','success');}

// ─────────────────────────────────────────────────────────────
// COOKIE MANAGER
// ─────────────────────────────────────────────────────────────
function openCookies(){openModal('<div class="modal-bg"><div class="modal lg"><div class="mh"><span class="mh-title">🍪 Cookie Manager</span><button class="m-close" onclick="closeModal()">✕</button></div><div class="mb"><div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap"><input id="ck-d" placeholder="Domain" style="flex:1;min-width:140px"><input id="ck-n" placeholder="Name" style="width:120px"><input id="ck-v" placeholder="Value" style="flex:1;min-width:100px"><button class="btn primary" onclick="addCK()">+ Add</button></div><div id="ck-list">'+renderCKList()+'</div></div><div class="mf"><button class="btn danger" onclick="clearAllCK()">🗑 Clear All</button><button class="btn secondary" onclick="closeModal()">Close</button></div></div></div>');}
function renderCKList(){var d=Object.keys(S.cookies);if(!d.length)return'<div class="empty-state"><div class="ei">🍪</div><p>No cookies stored.</p></div>';return d.map(function(domain){return'<div class="ck-domain"><div class="ck-domain-nm">'+esc(domain)+'</div>'+Object.keys(S.cookies[domain]).map(function(k){return'<div class="ck-row"><span class="ck-name">'+esc(k)+'</span><span class="ck-val">'+esc(S.cookies[domain][k])+'</span><button onclick="delCK(\''+esc(domain)+'\',\''+esc(k)+'\')" style="color:var(--err);background:none;border:none;cursor:pointer;margin-left:auto">✕</button></div>';}).join('')+'</div>';}).join('');}
function addCK(){var d=document.getElementById('ck-d').value.trim(),n=document.getElementById('ck-n').value.trim(),v=document.getElementById('ck-v').value;if(!d||!n){notify('Domain and name required','error');return;}if(!S.cookies[d])S.cookies[d]={};S.cookies[d][n]=v;save();document.getElementById('ck-list').innerHTML=renderCKList();notify('Cookie added!','success');}
function delCK(d,n){if(S.cookies[d]){delete S.cookies[d][n];if(!Object.keys(S.cookies[d]).length)delete S.cookies[d];}save();document.getElementById('ck-list').innerHTML=renderCKList();}
function clearAllCK(){if(!confirm('Clear all cookies?'))return;S.cookies={};save();document.getElementById('ck-list').innerHTML=renderCKList();}

// ─────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────
function openSettings(){var s=S.settings;openModal('<div class="modal-bg"><div class="modal lg"><div class="mh"><span class="mh-title">⚙ Settings</span><button class="m-close" onclick="closeModal()">✕</button></div><div class="mb"><div class="s-sec"><div class="s-sec-title">CORS PROXY</div><div class="s-row"><div><div class="s-label">Enable CORS Proxy</div><div class="s-desc">Route public API requests through Cloudflare Worker. Private IPs always go DIRECT.</div></div><label class="toggle"><input type="checkbox" id="set-cors"'+(s.corsEnabled?' checked':'')+' onchange="toggleCORSFromSettings()"><span class="t-slider"></span></label></div><div class="fg" style="margin-top:10px"><label>PROXY URL</label><input id="set-proxy" value="'+esc(s.proxyUrl||'https://square-credit-8186.donthulanithish53.workers.dev/?url=')+'"></div><button class="btn-s" style="margin-top:6px" onclick="testProxy()">🔍 Test Worker</button><span id="proxy-test-res" style="font-size:11px;margin-left:10px;color:var(--text3)"></span></div><div class="s-sec"><div class="s-sec-title">THEME</div><div class="s-row"><div><div class="s-label">Dark Mode</div><div class="s-desc">Toggle dark/light theme</div></div><label class="toggle"><input type="checkbox" id="set-dark"'+(s.theme!=='light'?' checked':'')+' onchange="toggleThemeFromSettings(this)"><span class="t-slider"></span></label></div></div><div class="s-sec"><div class="s-sec-title">TOOLS</div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn-s accent" onclick="closeModal();openGlobals()">🌐 Global Variables</button><button class="btn-s accent" onclick="closeModal();openCookies()">🍪 Cookie Manager</button><button class="btn-s accent" onclick="closeModal();openMockServer()">🎭 Mock Server</button></div></div><div class="s-sec"><div class="s-sec-title">DATA MANAGEMENT</div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn-s" onclick="exportAll()">⬇ Export All Data</button><button class="btn-s" onclick="importAll()">⬆ Import Backup</button><button class="btn-s danger" onclick="resetAll()">🗑 Reset Everything</button></div></div><div class="s-sec"><div class="s-sec-title">KEYBOARD SHORTCUTS</div><div style="font-size:11px;color:var(--text2);line-height:2.2;font-family:var(--mono)"><b>Ctrl+Enter</b> Send &nbsp; <b>Ctrl+T</b> New Tab &nbsp; <b>Ctrl+W</b> Close Tab<br><b>Ctrl+S</b> Save &nbsp; <b>Ctrl+\\</b> Toggle Sidebar &nbsp; <b>Esc</b> Cancel / Close</div></div><div class="s-sec"><div class="s-sec-title">ABOUT</div><p style="font-size:12px;color:var(--text3);line-height:1.8">PostmanWeb v4 — Full API Testing Platform.<br>Worker: <span style="color:var(--accent)">square-credit-8186.donthulanithish53.workers.dev</span></p></div></div><div class="mf"><button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveSettings()">Save Settings</button></div></div></div>');}
function toggleCORSFromSettings(){var c=document.getElementById('set-cors');if(c){S.settings.corsEnabled=c.checked;save();refreshCORSBtn();}}
function toggleThemeFromSettings(el){S.settings.theme=el.checked?'dark':'light';save();applyTheme();}
async function testProxy(){var purl=(document.getElementById('set-proxy')||{}).value||'',res=document.getElementById('proxy-test-res');res.textContent='⏳ Testing...';res.style.color='var(--text3)';try{var r=await fetch(purl+encodeURIComponent('https://httpbin.org/get'),{signal:AbortSignal.timeout(8000)});if(r.ok){res.textContent='✅ Worker is working!';res.style.color='var(--ok)';}else{res.textContent='⚠ Worker: '+r.status;res.style.color='var(--warn)';}}catch(e){res.textContent='❌ '+e.message;res.style.color='var(--err)';}}
function saveSettings(){S.settings.corsEnabled=(document.getElementById('set-cors')||{}).checked;S.settings.proxyUrl=(document.getElementById('set-proxy')||{}).value||'';save();refreshCORSBtn();closeModal();notify('Settings saved!','success');}
function exportAll(){dl(JSON.stringify({collections:S.collections,envs:S.envs,globals:S.globals,history:S.history,settings:S.settings,mocks:S.mocks,buckets:S.buckets||[]},null,2),'postmanweb_backup.json');notify('Backup exported!','success');}
function importAll(){var inp=document.createElement('input');inp.type='file';inp.accept='.json';inp.onchange=function(e){var f=e.target.files[0];if(!f)return;var r=new FileReader();r.onload=function(ev){try{var d=JSON.parse(ev.target.result);if(d.collections)S.collections=d.collections;if(d.envs)S.envs=d.envs;if(d.globals)S.globals=d.globals;if(d.history)S.history=fixHistory(d.history);if(d.settings)S.settings=d.settings;if(d.mocks)S.mocks=d.mocks;if(d.buckets)S.buckets=d.buckets;save();renderAll();notify('Backup imported!','success');}catch(e2){notify('Invalid file: '+e2.message,'error');};};r.readAsText(f);};inp.click();}
function resetAll(){if(!confirm('⚠ This will permanently delete ALL your data. Are you sure?'))return;localStorage.clear();location.reload();}

// ─────────────────────────────────────────────────────────────
// WORKSPACES + THEME
// ─────────────────────────────────────────────────────────────
function renderWorkspaces(){var sel=document.getElementById('ws-sel');if(!sel)return;sel.innerHTML=S.workspaces.map(function(w){return'<option value="'+w.id+'"'+(w.id===S.activeWS?' selected':'')+'>'+esc(w.name)+'</option>';}).join('');}
function switchWorkspace(id){S.activeWS=id;save();notify('Workspace switched','info');}
function openNewWorkspace(){var name=prompt('Workspace name:');if(!name)return;var ws={id:uid(),name:name};S.workspaces.push(ws);S.activeWS=ws.id;save();renderWorkspaces();notify('Workspace created!','success');}
function applyTheme(){document.documentElement.setAttribute('data-theme',S.settings.theme||'dark');var btn=document.getElementById('theme-btn');if(btn)btn.textContent=S.settings.theme==='light'?'🌙':'☀️';}
function toggleTheme(){S.settings.theme=S.settings.theme==='light'?'dark':'light';save();applyTheme();}

// ─────────────────────────────────────────────────────────────
// RESIZE
// ─────────────────────────────────────────────────────────────
function initResize(){
  var handle=document.getElementById('resizer'),wrap=document.getElementById('split');
  var drag=false,sy=0,sh=0;
  handle.addEventListener('mousedown',function(e){drag=true;sy=e.clientY;sh=document.getElementById('req-area').offsetHeight;document.body.style.userSelect='none';document.body.style.cursor='ns-resize';});
  document.addEventListener('mousemove',function(e){if(!drag)return;var nh=Math.max(80,Math.min(wrap.offsetHeight-80,sh+(e.clientY-sy)));document.getElementById('req-area').style.height=nh+'px';});
  document.addEventListener('mouseup',function(){drag=false;document.body.style.userSelect='';document.body.style.cursor='';});
}

// ─────────────────────────────────────────────────────────────
// RENDER ALL + INIT
// ─────────────────────────────────────────────────────────────
function renderAll(){renderTabs();renderCollections();renderHistory();renderEnvs();renderWorkspaces();renderBuckets();}

function snapshotFromTab(){
  saveTabUI();
  var t=getActiveTab();
  if(!t)return null;
  return{
    method:t.method||'GET',url:t.url||'',name:t.name||'Request',
    params:t.params||[],pathVars:t.pathVars||[],headers:t.headers||[],
    bodyType:t.bodyType||'none',rawBody:t.rawBody||'',rawFmt:t.rawFmt||'json',
    urlEncoded:t.urlEncoded||[],formData:t.formData||[],
    gqlQ:t.gqlQ||'',gqlV:t.gqlV||'',
    authType:t.authType||'none',authData:t.authData||{},
    preScript:t.preScript||'',testScript:t.testScript||'',
    reqSettings:{
      followRedirects:(document.getElementById('opt-redirect')||{}).checked!==false,
      disableBody:!!(document.getElementById('opt-nobody')||{}).checked,
      useMock:!!(document.getElementById('opt-mock')||{}).checked,
      timeout:parseInt((document.getElementById('opt-timeout')||{}).value)||30000
    }
  };
}
function addCurrentToBucket(){
  var snap=snapshotFromTab();
  if(!snap||!snap.url.trim()){notify('Enter a URL first','error');return;}
  var name=prompt('Bucket name (new or existing):','My bucket');
  if(!name)return;
  if(!S.buckets)S.buckets=[];
  var b=S.buckets.find(function(x){return x.name===name;});
  if(!b){b={id:uid(),name:name,loop:1,delay:0,requests:[]};S.buckets.push(b);}
  b.requests.push(snap);
  save();renderBuckets();notify('Added to bucket “'+name+'” ('+b.requests.length+' steps)','success');
}
function updateBucketLoop(id){var b=S.buckets&&S.buckets.find(function(x){return x.id===id;});if(!b)return;b.loop=Math.max(1,parseInt(document.getElementById('b-loop-'+id).value)||1);save();}
function updateBucketDelay(id){var b=S.buckets&&S.buckets.find(function(x){return x.id===id;});if(!b)return;b.delay=Math.max(0,parseInt(document.getElementById('b-delay-'+id).value)||0);save();}
function delBucket(id){if(!confirm('Delete this bucket?'))return;S.buckets=(S.buckets||[]).filter(function(x){return x.id!==id;});save();renderBuckets();}
async function runBucket(bid){
  var b=S.buckets&&S.buckets.find(function(x){return x.id===bid;});
  if(!b||!b.requests||!b.requests.length){notify('Bucket is empty','error');return;}
  var loops=Math.max(1,parseInt(b.loop)||1),delay=Math.max(0,parseInt(b.delay)||0);
  notify('Running bucket… (max 900 req/s queued)','info');
  try{
    for(var L=0;L<loops;L++){
      for(var i=0;i<b.requests.length;i++){
        var req=b.requests[i];
        if(req.preScript&&req.preScript.trim()){var pm0=buildPM(null,{});runScript(req.preScript,pm0);}
        await executeRequestObject(req,{});
        if(delay>0&&!(L===loops-1&&i===b.requests.length-1))await sleep(delay);
      }
    }
    notify('Bucket finished ✓','success');
  }catch(err){notify('Bucket error: '+err.message,'error');}
}
function renderBuckets(){
  var list=document.getElementById('bucket-list');
  if(!list)return;
  if(!S.buckets||!S.buckets.length){list.innerHTML='<div class="empty-state"><div class="ei">🪣</div><p>No buckets — use “Current → bucket”.</p></div>';return;}
  list.innerHTML=S.buckets.map(function(b){
    return '<div class="bucket-item" style="border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:10px">'+
      '<div style="display:flex;justify-content:space-between;align-items:center"><strong>'+esc(b.name)+'</strong><button class="btn-s del" onclick="delBucket(\''+b.id+'\')">🗑</button></div>'+
      '<div style="font-size:11px;color:var(--text3);margin:4px 0">'+(b.requests||[]).length+' request(s) · loops <input type="number" id="b-loop-'+b.id+'" value="'+(b.loop||1)+'" min="1" max="99999" style="width:64px" onchange="updateBucketLoop(\''+b.id+'\')"> · delay <input type="number" id="b-delay-'+b.id+'" value="'+(b.delay||0)+'" min="0" style="width:64px" onchange="updateBucketDelay(\''+b.id+'\')"> ms</div>'+
      '<button class="btn-s accent" onclick="runBucket(\''+b.id+'\')">▶ Run bucket</button></div>';
  }).join('');
}

function init(){
  applyTheme();newTab();renderAll();initResize();initHistoryEvents();refreshCORSBtn();refreshHistDot();
  document.addEventListener('keydown',function(e){
    var mod=e.ctrlKey||e.metaKey;
    if(e.key==='Escape'){if(document.getElementById('fs-overlay').style.display!=='none'){closeEnlarge();return;}if(document.getElementById('adv-popover').style.display!=='none'){closeAdvPopover();return;}if(_abortCtrl)cancelReq();}
    if(mod&&e.key==='Enter'){e.preventDefault();sendRequest();}
    if(mod&&e.key==='t'){e.preventDefault();newTab();}
    if(mod&&e.key==='w'){e.preventDefault();closeTab(S.activeId);}
    if(mod&&e.key==='s'){e.preventDefault();saveToCollection();}
    if(mod&&e.key==='\\'){e.preventDefault();toggleSB();}
  });
  document.addEventListener('click',function(e){
    var pop=document.getElementById('adv-popover');
    if(pop.style.display!=='none'&&!pop.contains(e.target)&&!e.target.closest('[data-action="adv"]')){closeAdvPopover();}
  });
  document.getElementById('url-in').addEventListener('input',function(e){
    var tab=getActiveTab();
    if(tab&&e.target.value){tab.url=e.target.value;tab.name=e.target.value.replace(/^https?:\/\//,'').replace(/\?.*$/,'').slice(0,40)||'New Request';renderTabs();updatePathVars(e.target.value,tab.pathVars||[]);refreshDirectBadge(e.target.value);}
  });
  document.getElementById('method-sel').addEventListener('change',colorMethod);
}

init();
