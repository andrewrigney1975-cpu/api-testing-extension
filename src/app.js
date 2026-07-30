(() => {
  'use strict';

  const HISTORY_KEY = 'apiTester.history';
  const THEME_KEY = 'apiTester.theme';
  const MAX_HISTORY = 300;
  const MAX_STORED_BODY = 20000; // chars kept per stored response body

  const els = {
    themeToggle: document.getElementById('theme-toggle'),
    layoutToggle: document.getElementById('layout-toggle'),
    historySearch: document.getElementById('history-search'),
    newRequestBtn: document.getElementById('new-request-btn'),
    clearHistoryBtn: document.getElementById('clear-history-btn'),
    historyList: document.getElementById('history-list'),
    methodSelect: document.getElementById('method-select'),
    urlInput: document.getElementById('url-input'),
    sendBtn: document.getElementById('send-btn'),
    paramsEditor: document.getElementById('params-editor'),
    headersEditor: document.getElementById('headers-editor'),
    bodyForm: document.getElementById('body-form'),
    bodyJson: document.getElementById('body-json'),
    bodyText: document.getElementById('body-text'),
    bodyFormAdd: document.getElementById('body-form-add'),
    paramsCount: document.getElementById('params-count'),
    headersCount: document.getElementById('headers-count'),
    responseEmpty: document.getElementById('response-empty'),
    responseBodyWrap: document.getElementById('response-body-wrap'),
    responseMeta: document.getElementById('response-meta'),
    responseBody: document.getElementById('response-body'),
    responseHeaders: document.getElementById('response-headers'),
    authTypeSelect: document.getElementById('auth-type-select'),
    authBadge: document.getElementById('auth-badge'),
    authBearerToken: document.getElementById('auth-bearer-token'),
    authBasicUsername: document.getElementById('auth-basic-username'),
    authBasicPassword: document.getElementById('auth-basic-password'),
    authApikeyKey: document.getElementById('auth-apikey-key'),
    authApikeyValue: document.getElementById('auth-apikey-value'),
    authApikeyTarget: document.getElementById('auth-apikey-target'),
  };

  let history = [];
  let activeHistoryId = null;
  let suppressUrlSync = false;

  // ---------------- Theme ----------------

  async function initTheme() {
    const stored = await storageGet(THEME_KEY);
    applyTheme(stored || 'auto');
  }

  function applyTheme(mode) {
    if (mode === 'auto') {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = mode;
    }
    els.themeToggle.title = `Theme: ${mode} (click to change)`;
  }

  els.themeToggle.addEventListener('click', async () => {
    const current = document.documentElement.dataset.theme || 'auto';
    const next = current === 'auto' ? 'light' : current === 'light' ? 'dark' : 'auto';
    applyTheme(next);
    await storageSet(THEME_KEY, next);
  });

  // ---------------- Storage helpers ----------------

  function storageGet(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (res) => resolve(res[key]));
    });
  }

  function storageSet(key, value) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, resolve);
    });
  }

  // ---------------- Layout (tab vs sidebar) ----------------

  const viewContext = new URLSearchParams(location.search).get('context') === 'sidepanel' ? 'sidepanel' : 'tab';

  const TAB_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M3 9h18"></path>
    </svg>`;
  const SIDEBAR_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M15 4v16"></path>
    </svg>`;

  function initLayoutToggle() {
    if (viewContext === 'sidepanel') {
      els.layoutToggle.innerHTML = TAB_ICON;
      els.layoutToggle.title = 'Open full screen';
    } else {
      els.layoutToggle.innerHTML = SIDEBAR_ICON;
      els.layoutToggle.title = 'Open in sidebar';
    }
  }

  els.layoutToggle.addEventListener('click', async () => {
    if (viewContext === 'sidepanel') {
      await chrome.tabs.create({ url: chrome.runtime.getURL('src/index.html?context=tab') });
      try { window.close(); } catch { /* side panel may not support self-close on this Chrome version */ }
    } else {
      const win = await chrome.windows.getCurrent();
      await chrome.sidePanel.open({ windowId: win.id });
      try {
        const tab = await chrome.tabs.getCurrent();
        if (tab) chrome.tabs.remove(tab.id);
      } catch { /* not running inside a closable tab context */ }
    }
  });

  // ---------------- Tabs ----------------

  document.querySelectorAll('.tabs').forEach((tabsEl) => {
    const targetId = tabsEl.dataset.target;
    const targetRoot = document.getElementById(targetId);
    tabsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab');
      if (!btn) return;
      tabsEl.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      btn.classList.add('active');
      const panelId = 'panel-' + btn.dataset.tab;
      targetRoot.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
      document.getElementById(panelId).classList.add('active');
    });
  });

  // ---------------- Key/Value editors ----------------

  function createKvEditor(container, { onChange, keyPlaceholder = 'Key', valuePlaceholder = 'Value' } = {}) {
    let rows = [{ key: '', value: '', enabled: true }];

    function render() {
      container.innerHTML = '';
      rows.forEach((row, i) => {
        const el = document.createElement('div');
        el.className = 'kv-row';
        el.innerHTML = `
          <input type="checkbox" ${row.enabled ? 'checked' : ''} />
          <input type="text" placeholder="${keyPlaceholder}" value="${escapeAttr(row.key)}" />
          <input type="text" placeholder="${valuePlaceholder}" value="${escapeAttr(row.value)}" />
          <button type="button" class="kv-remove" title="Remove">✕</button>
        `;
        const [checkbox, keyInput, valInput] = el.querySelectorAll('input');
        const removeBtn = el.querySelector('.kv-remove');

        checkbox.addEventListener('change', () => {
          rows[i].enabled = checkbox.checked;
          onChange && onChange(rows);
        });
        keyInput.addEventListener('input', () => {
          rows[i].key = keyInput.value;
          ensureTrailingRow();
          onChange && onChange(rows);
        });
        valInput.addEventListener('input', () => {
          rows[i].value = valInput.value;
          ensureTrailingRow();
          onChange && onChange(rows);
        });
        removeBtn.addEventListener('click', () => {
          rows.splice(i, 1);
          if (rows.length === 0) rows.push({ key: '', value: '', enabled: true });
          render();
          onChange && onChange(rows);
        });

        container.appendChild(el);
      });
    }

    function ensureTrailingRow() {
      const last = rows[rows.length - 1];
      if (last.key !== '' || last.value !== '') {
        rows.push({ key: '', value: '', enabled: true });
        render();
      }
    }

    function setRows(newRows) {
      rows = newRows && newRows.length ? newRows.map((r) => ({ ...r })) : [{ key: '', value: '', enabled: true }];
      const last = rows[rows.length - 1];
      if (last.key !== '' || last.value !== '') rows.push({ key: '', value: '', enabled: true });
      render();
    }

    function getRows() {
      return rows.filter((r) => r.key !== '' || r.value !== '');
    }

    render();
    return { setRows, getRows, render };
  }

  const paramsKv = createKvEditor(els.paramsEditor, {
    onChange: () => {
      updateCounts();
      syncUrlFromParams();
    },
  });

  const headersKv = createKvEditor(els.headersEditor, {
    onChange: () => updateCounts(),
  });

  const bodyFormKv = createKvEditor(els.bodyForm);

  document.querySelectorAll('.add-row-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.editor;
      const editor = target === 'params-editor' ? paramsKv : target === 'headers-editor' ? headersKv : bodyFormKv;
      editor.render();
      const inputs = document.getElementById(target).querySelectorAll('.kv-row:last-child input[type="text"]');
      if (inputs[0]) inputs[0].focus();
    });
  });

  function updateCounts() {
    const p = paramsKv.getRows().filter((r) => r.enabled).length;
    const h = headersKv.getRows().filter((r) => r.enabled).length;
    setBadge(els.paramsCount, p);
    setBadge(els.headersCount, h);
  }

  function setBadge(el, n) {
    el.textContent = n;
    el.classList.toggle('hidden', n === 0);
  }

  // ---------------- URL <-> params sync ----------------

  function syncParamsFromUrl() {
    if (suppressUrlSync) return;
    const raw = els.urlInput.value;
    const qIndex = raw.indexOf('?');
    if (qIndex === -1) return;
    const query = raw.slice(qIndex + 1);
    if (!query) return;
    const rows = query.split('&').filter(Boolean).map((pair) => {
      const eq = pair.indexOf('=');
      const key = eq === -1 ? pair : pair.slice(0, eq);
      const value = eq === -1 ? '' : pair.slice(eq + 1);
      return { key: decodeURIComponentSafe(key), value: decodeURIComponentSafe(value), enabled: true };
    });
    suppressUrlSync = true;
    paramsKv.setRows(rows);
    updateCounts();
    suppressUrlSync = false;
  }

  function syncUrlFromParams() {
    if (suppressUrlSync) return;
    const rows = paramsKv.getRows();
    const base = els.urlInput.value.split('?')[0];
    suppressUrlSync = true;
    if (rows.length === 0) {
      els.urlInput.value = base;
    } else {
      const query = rows
        .filter((r) => r.enabled)
        .map((r) => `${encodeURIComponent(r.key)}=${encodeURIComponent(r.value)}`)
        .join('&');
      els.urlInput.value = query ? `${base}?${query}` : base;
    }
    suppressUrlSync = false;
  }

  function decodeURIComponentSafe(s) {
    try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch { return s; }
  }

  els.urlInput.addEventListener('input', syncParamsFromUrl);

  // ---------------- Body type ----------------

  document.querySelectorAll('input[name="body-type"]').forEach((radio) => {
    radio.addEventListener('change', () => updateBodyVisibility());
  });

  function updateBodyVisibility() {
    const type = document.querySelector('input[name="body-type"]:checked').value;
    els.bodyJson.classList.toggle('hidden', type !== 'json');
    els.bodyText.classList.toggle('hidden', type !== 'text');
    els.bodyForm.classList.toggle('hidden', type !== 'form');
    els.bodyFormAdd.classList.toggle('hidden', type !== 'form');
  }

  function getBodyType() {
    return document.querySelector('input[name="body-type"]:checked').value;
  }

  function setBodyType(type) {
    const radio = document.querySelector(`input[name="body-type"][value="${type}"]`);
    if (radio) radio.checked = true;
    updateBodyVisibility();
  }

  // ---------------- Authorisation ----------------

  els.authTypeSelect.addEventListener('change', () => updateAuthVisibility());
  [els.authBearerToken, els.authBasicUsername, els.authBasicPassword, els.authApikeyKey, els.authApikeyValue].forEach((input) => {
    input.addEventListener('input', () => updateAuthBadge());
  });
  els.authApikeyTarget.addEventListener('change', () => updateAuthBadge());

  function updateAuthVisibility() {
    const type = els.authTypeSelect.value;
    ['none', 'bearer', 'basic', 'apikey'].forEach((t) => {
      document.getElementById(`auth-${t}`).classList.toggle('hidden', t !== type);
    });
    updateAuthBadge();
  }

  function updateAuthBadge() {
    const type = els.authTypeSelect.value;
    const labels = { bearer: 'Bearer', basic: 'Basic', apikey: 'API Key' };
    if (type !== 'none' && labels[type]) {
      els.authBadge.textContent = labels[type];
      els.authBadge.classList.remove('hidden');
    } else {
      els.authBadge.classList.add('hidden');
    }
  }

  function getAuthConfig() {
    return {
      type: els.authTypeSelect.value,
      bearerToken: els.authBearerToken.value,
      basicUsername: els.authBasicUsername.value,
      basicPassword: els.authBasicPassword.value,
      apikeyKey: els.authApikeyKey.value,
      apikeyValue: els.authApikeyValue.value,
      apikeyTarget: els.authApikeyTarget.value,
    };
  }

  function setAuthConfig(cfg) {
    cfg = cfg || {};
    els.authTypeSelect.value = cfg.type || 'none';
    els.authBearerToken.value = cfg.bearerToken || '';
    els.authBasicUsername.value = cfg.basicUsername || '';
    els.authBasicPassword.value = cfg.basicPassword || '';
    els.authApikeyKey.value = cfg.apikeyKey || '';
    els.authApikeyValue.value = cfg.apikeyValue || '';
    els.authApikeyTarget.value = cfg.apikeyTarget || 'header';
    updateAuthVisibility();
  }

  function toBase64Utf8(str) {
    return btoa(String.fromCharCode(...new TextEncoder().encode(str)));
  }

  // Applies the Authorisation tab's settings on top of manual headers/URL at
  // send time, without touching what's shown in the Headers/Params tabs —
  // mirrors how Postman keeps "Authorization" separate from raw headers.
  function applyAuth(headers, url) {
    const auth = getAuthConfig();
    let finalUrl = url;
    if (auth.type === 'bearer' && auth.bearerToken) {
      headers['Authorization'] = `Bearer ${auth.bearerToken}`;
    } else if (auth.type === 'basic' && (auth.basicUsername || auth.basicPassword)) {
      headers['Authorization'] = `Basic ${toBase64Utf8(`${auth.basicUsername}:${auth.basicPassword}`)}`;
    } else if (auth.type === 'apikey' && auth.apikeyKey) {
      if (auth.apikeyTarget === 'query') {
        const sep = finalUrl.includes('?') ? '&' : '?';
        finalUrl += `${sep}${encodeURIComponent(auth.apikeyKey)}=${encodeURIComponent(auth.apikeyValue)}`;
      } else {
        headers[auth.apikeyKey] = auth.apikeyValue;
      }
    }
    return finalUrl;
  }

  // ---------------- Send request ----------------

  els.sendBtn.addEventListener('click', sendRequest);
  els.urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendRequest();
  });

  async function sendRequest() {
    const method = els.methodSelect.value;
    const url = els.urlInput.value.trim();
    if (!url) { els.urlInput.focus(); return; }

    const headerRows = headersKv.getRows().filter((r) => r.enabled && r.key);
    const headers = {};
    headerRows.forEach((r) => { headers[r.key] = r.value; });

    const bodyType = getBodyType();
    let body;
    let bodyError = null;

    if (bodyType === 'json') {
      const text = els.bodyJson.value.trim();
      if (text) {
        body = text;
        if (!hasHeader(headers, 'content-type')) headers['Content-Type'] = 'application/json';
        try { JSON.parse(text); } catch { bodyError = 'Body is not valid JSON — sending as-is.'; }
      }
    } else if (bodyType === 'text') {
      const text = els.bodyText.value;
      if (text) {
        body = text;
        if (!hasHeader(headers, 'content-type')) headers['Content-Type'] = 'text/plain';
      }
    } else if (bodyType === 'form') {
      const rows = bodyFormKv.getRows().filter((r) => r.enabled && r.key);
      if (rows.length) {
        body = rows.map((r) => `${encodeURIComponent(r.key)}=${encodeURIComponent(r.value)}`).join('&');
        if (!hasHeader(headers, 'content-type')) headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    }

    const finalUrl = applyAuth(headers, url);

    setSending(true);
    const startTime = performance.now();
    const requestSnapshot = {
      method,
      url,
      headers: headerRows,
      bodyType,
      bodyJson: els.bodyJson.value,
      bodyText: els.bodyText.value,
      bodyForm: bodyFormKv.getRows(),
      params: paramsKv.getRows(),
      auth: getAuthConfig(),
    };

    let result;
    try {
      const fetchOptions = { method, headers };
      if (body !== undefined && method !== 'GET' && method !== 'HEAD') fetchOptions.body = body;
      const resp = await fetch(finalUrl, fetchOptions);
      const text = await resp.text();
      const elapsed = Math.round(performance.now() - startTime);
      const respHeaders = [];
      resp.headers.forEach((v, k) => respHeaders.push([k, v]));
      result = {
        ok: true,
        status: resp.status,
        statusText: resp.statusText,
        headers: respHeaders,
        body: text,
        time: elapsed,
        size: new Blob([text]).size,
      };
    } catch (err) {
      const elapsed = Math.round(performance.now() - startTime);
      result = { ok: false, error: err.message || String(err), time: elapsed };
    }

    setSending(false);
    renderResponse(result, bodyError);
    await saveHistoryEntry(requestSnapshot, result);
  }

  function hasHeader(headersObj, name) {
    return Object.keys(headersObj).some((k) => k.toLowerCase() === name);
  }

  function setSending(isSending) {
    els.sendBtn.disabled = isSending;
    els.sendBtn.textContent = isSending ? 'Sending…' : 'Send';
  }

  // ---------------- Response rendering ----------------

  function renderResponse(result, bodyWarning) {
    els.responseEmpty.classList.add('hidden');
    els.responseBodyWrap.classList.remove('hidden');

    if (!result.ok) {
      els.responseMeta.innerHTML = `<span class="status-err">Error</span><span>${result.time} ms</span>`;
      els.responseBody.innerHTML = escapeHtml(result.error);
      els.responseHeaders.innerHTML = '';
      return;
    }

    const statusClass = statusClassFor(result.status);
    let meta = `<span class="${statusClass}">${result.status} ${escapeHtml(result.statusText || '')}</span>`;
    meta += `<span>${result.time} ms</span>`;
    meta += `<span>${formatSize(result.size)}</span>`;
    if (bodyWarning) meta += `<span class="status-4xx">${escapeHtml(bodyWarning)}</span>`;
    els.responseMeta.innerHTML = meta;

    els.responseBody.innerHTML = renderBody(result.body, result.headers);

    els.responseHeaders.innerHTML = result.headers
      .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`)
      .join('') || '<tr><td colspan="2">No headers</td></tr>';
  }

  function statusClassFor(status) {
    if (status >= 200 && status < 300) return 'status-2xx';
    if (status >= 300 && status < 400) return 'status-3xx';
    if (status >= 400 && status < 500) return 'status-4xx';
    return 'status-5xx';
  }

  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function renderBody(text, headers) {
    const contentType = (headers.find(([k]) => k.toLowerCase() === 'content-type') || [])[1] || '';
    if (contentType.includes('json') || looksLikeJson(text)) {
      try {
        const parsed = JSON.parse(text);
        return highlightJson(JSON.stringify(parsed, null, 2));
      } catch {
        // fall through to plain text
      }
    }
    return escapeHtml(text) || '<span class="json-null">(empty body)</span>';
  }

  function looksLikeJson(text) {
    const t = text.trim();
    return t.startsWith('{') || t.startsWith('[');
  }

  function highlightJson(json) {
    const escaped = escapeHtml(json);
    return escaped.replace(
      /("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
      (match) => {
        if (/^"/.test(match)) {
          return /:$/.test(match) ? `<span class="json-key">${match}</span>` : `<span class="json-string">${match}</span>`;
        }
        if (/true|false/.test(match)) return `<span class="json-boolean">${match}</span>`;
        if (/null/.test(match)) return `<span class="json-null">${match}</span>`;
        return `<span class="json-number">${match}</span>`;
      }
    );
  }

  function escapeHtml(str) {
    if (str === undefined || str === null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, '&quot;');
  }

  // ---------------- History ----------------

  async function loadHistory() {
    history = (await storageGet(HISTORY_KEY)) || [];
    renderHistoryList();
  }

  async function saveHistoryEntry(request, result) {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      request,
      response: truncateResponse(result),
    };
    history.unshift(entry);
    if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
    activeHistoryId = entry.id;
    await storageSet(HISTORY_KEY, history);
    renderHistoryList();
  }

  function truncateResponse(result) {
    if (!result.ok) return result;
    if (result.body && result.body.length > MAX_STORED_BODY) {
      return { ...result, body: result.body.slice(0, MAX_STORED_BODY), truncated: true };
    }
    return result;
  }

  function renderHistoryList() {
    const query = els.historySearch.value.trim().toLowerCase();
    const filtered = query
      ? history.filter((e) => e.request.url.toLowerCase().includes(query) || e.request.method.toLowerCase().includes(query))
      : history;

    if (filtered.length === 0) {
      els.historyList.innerHTML = `<div class="history-empty">${
        history.length === 0 ? 'No requests yet. Send one to see it here.' : 'No matches.'
      }</div>`;
      return;
    }

    const groups = groupByDate(filtered);
    let html = '';
    for (const [label, entries] of groups) {
      html += `<div class="history-group-label">${escapeHtml(label)}</div>`;
      for (const entry of entries) {
        const status = entry.response && entry.response.ok ? entry.response.status : null;
        const dotColor = !entry.response || !entry.response.ok
          ? 'var(--delete)'
          : status < 300 ? 'var(--get)' : status < 400 ? 'var(--put)' : 'var(--delete)';
        html += `
          <div class="history-item ${entry.id === activeHistoryId ? 'active' : ''}" data-id="${entry.id}">
            <span class="method method-${entry.request.method}">${entry.request.method}</span>
            <span class="url" title="${escapeAttr(entry.request.url)}">${escapeHtml(entry.request.url)}</span>
            <span class="status-dot" style="background:${dotColor}"></span>
            <button class="delete-item" title="Delete" data-id="${entry.id}">✕</button>
          </div>`;
      }
    }
    els.historyList.innerHTML = html;
  }

  function groupByDate(entries) {
    const now = new Date();
    const todayStr = now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();

    const map = new Map();
    for (const entry of entries) {
      const d = new Date(entry.timestamp);
      const label = d.toDateString() === todayStr ? 'Today' : d.toDateString() === yesterdayStr ? 'Yesterday' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(entry);
    }
    return map;
  }

  els.historyList.addEventListener('click', async (e) => {
    const delBtn = e.target.closest('.delete-item');
    if (delBtn) {
      e.stopPropagation();
      history = history.filter((h) => h.id !== delBtn.dataset.id);
      await storageSet(HISTORY_KEY, history);
      renderHistoryList();
      return;
    }
    const item = e.target.closest('.history-item');
    if (item) loadHistoryEntry(item.dataset.id);
  });

  function loadHistoryEntry(id) {
    const entry = history.find((h) => h.id === id);
    if (!entry) return;
    activeHistoryId = id;
    const req = entry.request;

    els.methodSelect.value = req.method;
    els.urlInput.value = req.url;
    paramsKv.setRows(req.params || []);
    headersKv.setRows(req.headers || []);
    setBodyType(req.bodyType || 'none');
    els.bodyJson.value = req.bodyJson || '';
    els.bodyText.value = req.bodyText || '';
    bodyFormKv.setRows(req.bodyForm || []);
    setAuthConfig(req.auth);
    updateCounts();
    renderHistoryList();

    if (entry.response) {
      renderResponse(entry.response, entry.response.truncated ? 'Response truncated for storage.' : null);
    } else {
      els.responseEmpty.classList.remove('hidden');
      els.responseBodyWrap.classList.add('hidden');
    }
  }

  els.historySearch.addEventListener('input', renderHistoryList);

  els.clearHistoryBtn.addEventListener('click', async () => {
    if (history.length === 0) return;
    if (!confirm('Clear all request history? This cannot be undone.')) return;
    history = [];
    activeHistoryId = null;
    await storageSet(HISTORY_KEY, history);
    renderHistoryList();
  });

  els.newRequestBtn.addEventListener('click', () => {
    activeHistoryId = null;
    els.methodSelect.value = 'GET';
    els.urlInput.value = '';
    paramsKv.setRows([]);
    headersKv.setRows([]);
    setBodyType('none');
    els.bodyJson.value = '';
    els.bodyText.value = '';
    bodyFormKv.setRows([]);
    setAuthConfig(null);
    updateCounts();
    renderHistoryList();
    els.responseEmpty.classList.remove('hidden');
    els.responseBodyWrap.classList.add('hidden');
    els.urlInput.focus();
  });

  // ---------------- Init ----------------

  (async function init() {
    await initTheme();
    initLayoutToggle();
    updateBodyVisibility();
    updateAuthVisibility();
    updateCounts();
    await loadHistory();
    els.urlInput.focus();
  })();
})();
