/**
 * Schatten - content.js
 * Runs on YouTube watch pages. Builds the side panel with the video's
 * script for shadowing, the click-a-word dictionary and the progress bar.
 *
 * Files it relies on (loaded before it by manifest.json):
 *   i18n.js  - texts and language switching (TRANSLATIONS, dblT, dblApply)
 *   data.js  - DICTIONARY
 *   core.js  - pure logic (tokenize, lookupWord, json3ToLines, cards, stats)
 *   store.js - dblStore (chrome.storage.local / localStorage)
 */

"use strict";

const LANG_KEY = "dbl:language";
const CARDS_KEY = "dbl:cards";
const STATS_KEY = "dbl:stats";
const SOURCES_KEY = "dbl:sources";

// --- State ---------------------------------------------------------------
let lang = "en";
let cards = [];
let stats = emptyStats();
let lines = [];
let currentLine = -1;
let videoId = null;
let videoTitle = "";
let video = null;
let panel = null;
let pendingTracks = null; // tracks that arrived before the panel existed
let replaying = false;
let mediaStream = null;
let recorder = null;
const recordings = {}; // line index -> object URL (session only)

// --- Small DOM helper ------------------------------------------------------
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// --- Panel skeleton ---------------------------------------------------------
function buildPanel() {
  panel = el("aside", "dbl-panel");
  panel.id = "dbl-panel";
  panel.innerHTML = `
    <header class="dbl-panel__kopf">
      <strong data-i18n="panelTitle">Schatten</strong>
      <span class="language">
        <button class="language__button ist-aktiv" data-lang="en">EN</button>
        <button class="language__button" data-lang="de">DE</button>
        <button class="language__button" data-lang="ar">ع</button>
      </span>
      <button id="dbl-collapse" class="dbl-iconknopf" title="–">–</button>
    </header>
    <div class="dbl-panel__koerper">
      <p class="dbl-stats">
        <span><b id="dbl-stat-words">0</b> <span data-i18n="statWords">words collected</span></span>
        <span><b id="dbl-stat-streak">0</b> <span data-i18n="statStreak">day streak</span></span>
      </p>
      <p id="dbl-difficulty" class="dbl-difficulty"></p>
      <p id="dbl-status" class="dbl-status" data-i18n="loading">Loading the script...</p>
      <div id="dbl-shadow" class="dbl-shadow versteckt">
        <p id="dbl-shadow-line" class="dbl-shadow__zeile"></p>
        <div class="dbl-shadow__knöpfe">
          <button id="dbl-prev" class="dbl-knopf" data-i18n="shadowPrev">Previous line</button>
          <button id="dbl-play" class="dbl-knopf" data-i18n="shadowPlay">Play this line</button>
          <button id="dbl-next" class="dbl-knopf" data-i18n="shadowNext">Next line</button>
        </div>
        <label class="dbl-folgen">
          <input type="checkbox" id="dbl-follow" checked>
          <span data-i18n="follow">Follow the video</span>
        </label>
      </div>
      <div id="dbl-lines" class="dbl-lines"></div>
      <a id="dbl-open-library" class="dbl-knopf dbl-knopf--link" href="#" target="_blank" rel="noopener" data-i18n="popupOpen">Open my library</a>
    </div>
    <div id="dbl-popup" class="dbl-popup versteckt">
      <button id="dbl-popup-close" class="dbl-popup__schliessen">×</button>
      <p id="dbl-popup-word" class="dbl-popup__wort"></p>
      <p id="dbl-popup-en" class="dbl-popup__bedeutung"></p>
      <p id="dbl-popup-ar" class="dbl-popup__bedeutung dbl-popup__bedeutung--ar"></p>
      <p id="dbl-popup-hint" class="dbl-popup__hinweis"></p>
      <p id="dbl-popup-saved" class="dbl-popup__gespeichert" data-i18n="dictSaved">Saved to your flashcards</p>
    </div>`;
  document.body.appendChild(panel);

  // Floating button that opens the panel again after it was collapsed.
  const toggle = el("button", "dbl-aufklapp", "📖");
  toggle.id = "dbl-aufklapp";
  toggle.title = dblT(lang, "panelToggle");
  document.body.appendChild(toggle);

  document.getElementById("dbl-open-library").href =
    chrome.runtime.getURL("library.html");

  toggle.addEventListener("click", () => {
    panel.classList.toggle("versteckt");
  });
  document.getElementById("dbl-collapse").addEventListener("click", () => {
    panel.classList.add("versteckt");
  });
  panel.querySelectorAll(".language__button").forEach((button) => {
    button.addEventListener("click", () => setLanguage(button.dataset.lang));
  });
  document.getElementById("dbl-prev").addEventListener("click", () => stepLine(-1));
  document.getElementById("dbl-next").addEventListener("click", () => stepLine(1));
  document.getElementById("dbl-play").addEventListener("click", () => playLine(currentLine, 1));
  document.getElementById("dbl-popup-close").addEventListener("click", hidePopup);
  dblApply(panel, lang);
}

function setLanguage(next) {
  lang = next;
  dblStore.set(LANG_KEY, next);
  dblApply(panel, lang);
  renderStats();
  renderDifficulty();
}

// --- Stats bar ---------------------------------------------------------------
function renderStats() {
  document.getElementById("dbl-stat-words").textContent = cards.length;
  document.getElementById("dbl-stat-streak").textContent = stats.streak;
}

// Difficulty: share of words beyond the built-in basic dictionary,
// plus how many words she has not collected yet.
function renderDifficulty() {
  const box = document.getElementById("dbl-difficulty");
  if (!lines.length) {
    box.textContent = "";
    return;
  }
  const diff = scriptDifficulty(lines, DICTIONARY, cards);
  if (!diff) {
    box.textContent = "";
    return;
  }
  const label = dblT(lang, "difficulty." + diff.level);
  const newWords = dblT(lang, "difficultyNew")(diff.notCollected);
  box.textContent = label + " · " + newWords;
}

// --- Captions ------------------------------------------------------------------
function requestCaptions(info) {
  const status = document.getElementById("dbl-status");
  if (!info || !info.tracks || info.tracks.length === 0) {
    if (info && info.videoId === videoId && lines.length > 0) return; // already loaded
    lines = [];
    status.textContent = dblT(lang, "noCaptions");
    status.classList.remove("versteckt");
    document.getElementById("dbl-shadow").classList.add("versteckt");
    document.getElementById("dbl-lines").innerHTML = "";
    renderDifficulty();
    return;
  }
  if (info.videoId === videoId && lines.length > 0) return; // same video, already loaded
  videoId = info.videoId;
  videoTitle = info.title || "";
  rememberSource();
  // Prefer a German track, otherwise take the first available one.
  const track =
    info.tracks.find((t) => (t.languageCode || "").startsWith("de")) ||
    info.tracks[0];
  status.textContent = dblT(lang, "loading");
  status.classList.remove("versteckt");
  window.postMessage(
    { type: "dbl-fetch-captions", baseUrl: track.baseUrl, nonce: String(Date.now()) },
    "*"
  );
}

// Remember which videos she watched; the quiz can filter by them.
function rememberSource() {
  if (!videoId) return;
  dblStore.get(SOURCES_KEY, []).then((sources) => {
    if (!sources.some((s) => s.id === videoId)) {
      sources.unshift({ id: videoId, title: videoTitle });
      dblStore.set(SOURCES_KEY, sources.slice(0, 50));
    }
  });
}

function onCaptionBody(json) {
  lines = json ? json3ToLines(json) : [];
  const status = document.getElementById("dbl-status");
  if (lines.length === 0) {
    status.textContent = dblT(lang, "noCaptions");
    return;
  }
  status.classList.add("versteckt");
  document.getElementById("dbl-shadow").classList.remove("versteckt");
  renderLines();
  renderDifficulty();
  currentLine = -1;
  syncToVideo();
}

// --- Script rendering -------------------------------------------------------------
function renderLines() {
  const container = document.getElementById("dbl-lines");
  container.innerHTML = "";
  const known = new Set(cards.map((card) => card.key));
  lines.forEach((line, index) => {
    const row = el("div", "dbl-zeile");
    row.dataset.index = index;
    const time = el("span", "dbl-zeit", formatTime(line.start));
    row.appendChild(time);
    const text = el("span", "dbl-text");
    for (const token of tokenize(line.text)) {
      if (!token.word) {
        text.appendChild(document.createTextNode(token.text));
      } else {
        const span = el("span", "dbl-w", token.text);
        const key = normalizeWord(token.text);
        span.dataset.key = key;
        if (known.has(key)) span.classList.add("dbl-w--bekannt");
        span.addEventListener("click", (event) => {
          event.stopPropagation();
          showWord(token.text, "video:" + (videoId || ""));
        });
        text.appendChild(span);
      }
    }
    row.appendChild(text);
    const actions = el("span", "dbl-aktionen");
    const replay = el("button", "dbl-iconknopf", "🔁");
    replay.title = dblT(lang, "replay");
    replay.addEventListener("click", (event) => {
      event.stopPropagation();
      playLine(index, 0.75);
    });
    const record = el("button", "dbl-iconknopf", "🎙️");
    record.title = dblT(lang, "record");
    record.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleRecording(index, record);
    });
    actions.appendChild(replay);
    actions.appendChild(record);
    row.appendChild(actions);
    row.addEventListener("click", () => {
      if (video) video.currentTime = line.start + 0.01;
    });
    container.appendChild(row);
  });
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m + ":" + String(s).padStart(2, "0");
}

// --- Shadowing ---------------------------------------------------------------
function syncToVideo() {
  if (!video) video = document.querySelector("video");
  if (!video || !lines.length) return;
  const index = findLineIndex(lines, video.currentTime);
  if (index === currentLine) return;
  currentLine = index;
  const follow = document.getElementById("dbl-follow");
  highlightLine(index, follow && follow.checked);
}

function highlightLine(index, scroll) {
  document.querySelectorAll("#dbl-lines .dbl-zeile").forEach((row) => {
    row.classList.toggle("dbl-zeile--aktiv", Number(row.dataset.index) === index);
  });
  const line = lines[index];
  const box = document.getElementById("dbl-shadow-line");
  if (line && box) {
    box.innerHTML = "";
    for (const token of tokenize(line.text)) {
      if (!token.word) {
        box.appendChild(document.createTextNode(token.text));
      } else {
        const span = el("span", "dbl-w", token.text);
        span.addEventListener("click", () => showWord(token.text, "video:" + (videoId || "")));
        box.appendChild(span);
      }
    }
    if (scroll) {
      const row = document.querySelector(
        '#dbl-lines .dbl-zeile[data-index="' + index + '"]'
      );
      if (row) row.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }
}

function stepLine(direction) {
  const next = Math.min(Math.max(currentLine + direction, 0), lines.length - 1);
  playLine(next, 1);
}

// Play exactly one line. speed 0.75 is the slow replay for shadowing.
function playLine(index, speed) {
  if (!video) video = document.querySelector("video");
  const line = lines[index];
  if (!video || !line) return;
  currentLine = index;
  highlightLine(index, true);
  replaying = true;
  video.playbackRate = speed;
  video.currentTime = line.start + 0.01;
  video.play();
}

// Stop the slow replay at the end of the line and restore normal speed.
function maybeEndReplay() {
  if (!replaying || !video || currentLine < 0) return;
  const line = lines[currentLine];
  if (line && video.currentTime >= line.end - 0.05) {
    video.pause();
    video.playbackRate = 1;
    replaying = false;
  }
}

// --- Voice recording (best effort) -------------------------------------------
async function toggleRecording(index, button) {
  if (recorder && recorder.state === "recording") {
    recorder.stop();
    return;
  }
  try {
    if (!mediaStream) {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    recorder = new MediaRecorder(mediaStream);
    const chunks = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType });
      if (recordings[index]) URL.revokeObjectURL(recordings[index]);
      recordings[index] = URL.createObjectURL(blob);
      button.textContent = "▶️";
      button.title = dblT(lang, "recordPlay");
      button.onclick = () => new Audio(recordings[index]).play();
      if (video) {
        video.pause();
        video.playbackRate = 1;
      }
      replaying = false;
    };
    recorder.start();
    button.textContent = "⏹️";
    button.title = dblT(lang, "recordStop");
    playLine(index, 0.75);
    // Stop recording at the end of the line.
    const line = lines[index];
    setTimeout(() => {
      if (recorder && recorder.state === "recording") recorder.stop();
    }, Math.max((line.end - line.start) / 0.75, 1) * 1000 + 500);
  } catch (error) {
    alert(dblT(lang, "recordError"));
  }
}

// --- Dictionary popup ---------------------------------------------------------
function showWord(rawWord, source) {
  const entry = lookupWord(DICTIONARY, rawWord);
  if (!entry) return;
  const popup = document.getElementById("dbl-popup");
  document.getElementById("dbl-popup-word").textContent = entry.word;
  document.getElementById("dbl-popup-en").textContent = entry.en || "";
  document.getElementById("dbl-popup-ar").textContent = entry.ar || "";
  const hint = document.getElementById("dbl-popup-hint");
  if (entry.en) {
    hint.textContent = "";
  } else {
    // Unknown word: honest fallback is the full dictionary at dict.cc.
    hint.innerHTML = "";
    hint.appendChild(document.createTextNode(dblT(lang, "dictNoMeaning") + " "));
    const link = el("a", "", "dict.cc");
    link.href = "https://www.dict.cc/?s=" + encodeURIComponent(entry.key);
    link.target = "_blank";
    link.rel = "noopener";
    hint.appendChild(link);
  }
  popup.classList.remove("versteckt");
  saveWord(entry, source);
}

function hidePopup() {
  document.getElementById("dbl-popup").classList.add("versteckt");
}

// Looking a word up saves it automatically - that is the point of the app.
async function saveWord(entry, source) {
  const result = addCard(cards, {
    key: entry.key,
    word: entry.word,
    en: entry.en,
    ar: entry.ar,
    source,
  });
  if (result.added) {
    cards = result.cards;
    stats = recordWord(stats);
    await dblStore.set(CARDS_KEY, cards);
    await dblStore.set(STATS_KEY, stats);
    renderStats();
    markKnown(entry.key);
    renderDifficulty();
  }
  document.getElementById("dbl-popup-saved").classList.remove("versteckt");
}

// Colour the word everywhere it appears in the script.
function markKnown(key) {
  document
    .querySelectorAll('#dbl-lines .dbl-w[data-key="' + key + '"]')
    .forEach((span) => span.classList.add("dbl-w--bekannt"));
}

// --- Shadowing time tracking -----------------------------------------------------
let lastTick = Date.now();
function trackTime() {
  const now = Date.now();
  if (video && !video.paused && !panel.classList.contains("versteckt")) {
    stats = recordSeconds(stats, (now - lastTick) / 1000);
    dblStore.set(STATS_KEY, stats);
  }
  lastTick = now;
}

// --- Start ----------------------------------------------------------------------
window.addEventListener("message", (event) => {
  if (!event.data) return;
  if (event.data.type === "dbl-tracks") {
    currentLine = -1;
    if (!panel) {
      pendingTracks = event.data.info;
    } else {
      requestCaptions(event.data.info);
    }
  }
  if (event.data.type === "dbl-caption-body") {
    onCaptionBody(event.data.json);
  }
});

window.addEventListener("yt-navigate-finish", () => {
  lines = [];
  recordings && Object.keys(recordings).forEach((k) => delete recordings[k]);
});

// Tell the page-world script that our listener is up (it announces the
// caption tracks on page load, possibly before we were ready).
window.postMessage({ type: "dbl-ready" }, "*");

Promise.all([
  dblStore.get(LANG_KEY, "en"),
  dblStore.get(CARDS_KEY, []),
  dblStore.get(STATS_KEY, emptyStats()),
]).then(([savedLang, savedCards, savedStats]) => {
  lang = savedLang;
  cards = savedCards;
  stats = savedStats;
  buildPanel();
  renderStats();
  // Captions may have been announced while the panel was still building.
  if (pendingTracks) {
    requestCaptions(pendingTracks);
    pendingTracks = null;
  }
  video = document.querySelector("video");
  if (video) {
    video.addEventListener("timeupdate", () => {
      syncToVideo();
      maybeEndReplay();
    });
  }
  // Track shadowing time twice a minute.
  setInterval(trackTime, 30000);
});
