(() => {
  'use strict';

  const THEME_KEY = 'apiTester.theme';

  chrome.storage.local.get(THEME_KEY, (res) => {
    const mode = res[THEME_KEY];
    if (mode && mode !== 'auto') document.documentElement.dataset.theme = mode;
  });

  document.getElementById('open-tab').addEventListener('click', async () => {
    const targetUrl = chrome.runtime.getURL('src/index.html?context=tab');
    const tabs = await chrome.tabs.query({ url: chrome.runtime.getURL('src/index.html*') });
    const existing = tabs.find((t) => {
      try { return new URL(t.url).searchParams.get('context') === 'tab'; }
      catch { return false; }
    });
    if (existing) {
      await chrome.tabs.update(existing.id, { active: true });
      await chrome.windows.update(existing.windowId, { focused: true });
    } else {
      await chrome.tabs.create({ url: targetUrl });
    }
    window.close();
  });

  document.getElementById('open-sidebar').addEventListener('click', async () => {
    const win = await chrome.windows.getCurrent();
    await chrome.sidePanel.open({ windowId: win.id });
    window.close();
  });
})();
