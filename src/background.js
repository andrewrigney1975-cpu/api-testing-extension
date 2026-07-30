// The toolbar icon shows a chooser popup (src/popup.html) that lets the user
// open the app as a full tab or as a side panel, so there's nothing to do
// here on action click. This just seeds the very first tab on install.

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/index.html?context=tab') });
  }
});
