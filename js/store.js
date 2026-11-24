/**
 * Schatten - store.js
 * One small storage wrapper used everywhere.
 * Inside the extension it uses chrome.storage.local (shared between the
 * YouTube panel and the library page). Opened as a plain file it falls
 * back to localStorage, which also makes demos and tests easy.
 */

"use strict";

const dblStore = {
  hasChrome() {
    return (
      typeof chrome !== "undefined" &&
      chrome.storage &&
      chrome.storage.local !== undefined
    );
  },

  // Read one key; returns fallback when nothing is stored or reading fails.
  async get(key, fallback) {
    try {
      if (this.hasChrome()) {
        const obj = await chrome.storage.local.get(key);
        return obj[key] !== undefined ? obj[key] : fallback;
      }
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (error) {
      return fallback;
    }
  },

  // Write one key; returns false when saving was not possible.
  async set(key, value) {
    try {
      if (this.hasChrome()) {
        await chrome.storage.local.set({ [key]: value });
      } else {
        localStorage.setItem(key, JSON.stringify(value));
      }
      return true;
    } catch (error) {
      return false;
    }
  },
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = { dblStore };
}
