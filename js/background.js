/**
 * Schatten - background.js
 * The service worker. Its only job is the daily review reminder:
 * an alarm fires once a day and shows a notification; clicking it opens
 * the library page at the flashcards.
 */

"use strict";

importScripts("i18n.js", "store.js");

const ALARM_NAME = "schatten-taegliche-erinnerung";

// Create the daily alarm when the extension is installed or updated.
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, {
    // First reminder tomorrow at 18:00 local time, then every 24 hours.
    when: nextEvening().getTime(),
    periodInMinutes: 24 * 60,
  });
});

function nextEvening() {
  const date = new Date();
  date.setHours(18, 0, 0, 0);
  if (date.getTime() <= Date.now()) {
    date.setDate(date.getDate() + 1);
  }
  return date;
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  const lang = await dblStore.get("dbl:language", "en");
  chrome.notifications.create(ALARM_NAME, {
    type: "basic",
    iconUrl: "icons/book128.png",
    title: dblT(lang, "reminderTitle"),
    message: dblT(lang, "reminderBody"),
  });
});

chrome.notifications.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("library.html") });
});
