/**
 * Schatten - popup.js
 * The small popup behind the toolbar icon: one button that opens the
 * library page in a full tab.
 */

"use strict";

dblStore.get("dbl:language", "en").then((lang) => {
  dblApply(document.documentElement, lang);
});

document.getElementById("oeffnen").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("library.html") });
  window.close();
});
