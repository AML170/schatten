/**
 * Schatten - core.js
 * Pure logic with no DOM and no browser APIs: word handling, caption
 * parsing, flashcards, quiz and game builders.
 *
 * Because this file never touches the page, it runs both in the browser
 * (loaded by manifest.json / library.html) and in Node.js for the
 * regression tests in tests/core.test.cjs.
 */

"use strict";

// --- Words ---------------------------------------------------------------

// Split a text into word and non-word parts, keeping the original order.
// The reader and the script panel use this to make every word clickable.
function tokenize(text) {
  const parts = text.split(/(\s+|[.,!?;:„“”"«»()\[\]…–—]+)/u);
  return parts
    .filter((part) => part.length > 0)
    .map((part) => ({ word: /[\p{L}]/u.test(part), text: part }));
}

// Lowercase and strip punctuation from the edges, so "Haus." -> "haus".
function normalizeWord(raw) {
  return raw
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/[^\p{L}\p{N}]+$/u, "");
}

// Look up a word in the bundled dictionary.
// First the exact form, then simple endings (German plurals/conjugations).
// Returns an entry object; en/ar are null when the word is unknown.
function lookupWord(dict, raw) {
  const key = normalizeWord(raw);
  if (!key) return null;
  if (dict[key]) return { word: raw, key, en: dict[key][0], ar: dict[key][1] };
  const endings = ["en", "er", "es", "em", "st", "e", "s", "n", "t"];
  for (const ending of endings) {
    if (key.endsWith(ending) && key.length - ending.length >= 3) {
      const stem = key.slice(0, key.length - ending.length);
      if (dict[stem]) {
        return { word: raw, key: stem, en: dict[stem][0], ar: dict[stem][1], stem: true };
      }
    }
  }
  return { word: raw, key, en: null, ar: null };
}

// --- Captions --------------------------------------------------------------

// Convert YouTube's json3 caption format into clean lines.
// json3: { events: [ { tStartMs, dDurationMs, segs: [ { utf8 } ] } ] }
function json3ToLines(json) {
  const events = json && Array.isArray(json.events) ? json.events : [];
  const lines = [];
  for (const event of events) {
    if (!Array.isArray(event.segs)) continue;
    const text = event.segs
      .map((seg) => seg.utf8 || "")
      .join("")
      .replace(/\s*\n\s*/g, " ")
      .trim();
    if (!text) continue;
    const start = (event.tStartMs || 0) / 1000;
    const end = ((event.tStartMs || 0) + (event.dDurationMs || 0)) / 1000;
    // Auto captions sometimes repeat the same text twice in a row.
    if (lines.length > 0 && lines[lines.length - 1].text === text) continue;
    lines.push({ start, end, text });
  }
  return lines;
}

// Which line is spoken at second t? The last line that already started.
function findLineIndex(lines, t) {
  let index = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].start <= t + 0.15) index = i;
    else break;
  }
  return index;
}

// --- Flashcards ------------------------------------------------------------

// Add a word to the deck. Duplicates (same key) are not added twice.
function addCard(cards, entry, now) {
  if (cards.some((card) => card.key === entry.key)) {
    return { cards, added: false };
  }
  const card = {
    key: entry.key,
    word: entry.word,
    en: entry.en || "",
    ar: entry.ar || "",
    source: entry.source || "",
    known: 0,
    addedAt: now || new Date().toISOString(),
  };
  return { cards: [card].concat(cards), added: true };
}

function removeCard(cards, key) {
  return cards.filter((card) => card.key !== key);
}

// "I knew it" raises the counter, "Again" resets it.
function markCard(cards, key, knewIt) {
  return cards.map((card) =>
    card.key === key
      ? Object.assign({}, card, { known: knewIt ? card.known + 1 : 0 })
      : card
  );
}

// The meaning shown depends on the UI language: Arabic when available.
function cardMeaning(card, lang) {
  if (lang === "ar" && card.ar) return card.ar;
  return card.en || card.ar || "";
}

// --- Quiz and game ----------------------------------------------------------

// Fisher-Yates shuffle; rng is passed in so tests can make it repeatable.
function shuffle(items, rng) {
  const random = rng || Math.random;
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

// One multiple-choice question: a word plus 4 possible meanings.
// Needs at least 4 cards that have a meaning; otherwise returns null.
function buildQuizQuestion(cards, lang, rng) {
  const random = rng || Math.random;
  const pool = cards.filter((card) => cardMeaning(card, lang) !== "");
  if (pool.length < 4) return null;
  const answer = pool[Math.floor(random() * pool.length)];
  const distractors = shuffle(
    pool.filter((card) => card.key !== answer.key),
    random
  ).slice(0, 3);
  const options = shuffle([answer].concat(distractors), random);
  return {
    key: answer.key,
    word: answer.word,
    options: options.map((card) => cardMeaning(card, lang)),
    answerIndex: options.findIndex((card) => card.key === answer.key),
  };
}

// Tiles for the matching game: each pair is a German word + its meaning.
function buildMatchingDeck(cards, lang, rng, pairCount) {
  const random = rng || Math.random;
  const count = pairCount || 6;
  const pool = shuffle(
    cards.filter((card) => cardMeaning(card, lang) !== ""),
    random
  ).slice(0, count);
  const tiles = [];
  pool.forEach((card, index) => {
    tiles.push({ id: index * 2, text: card.word, match: index, kind: "word" });
    tiles.push({ id: index * 2 + 1, text: cardMeaning(card, lang), match: index, kind: "meaning" });
  });
  return shuffle(tiles, random);
}

// --- Helpers -----------------------------------------------------------------

// JSON.parse without throwing; broken stored data becomes the fallback.
function safeParse(json, fallback) {
  try {
    const value = JSON.parse(json);
    return value === null || value === undefined ? fallback : value;
  } catch (error) {
    return fallback;
  }
}

// Export for the Node.js regression tests; the browser uses the globals.
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    tokenize,
    normalizeWord,
    lookupWord,
    json3ToLines,
    findLineIndex,
    addCard,
    removeCard,
    markCard,
    cardMeaning,
    shuffle,
    buildQuizQuestion,
    buildMatchingDeck,
    safeParse,
  };
}

// --- Progress: streak, shadowing time and difficulty -----------------------

// One stats object tracks everything:
// { streak, lastDay, days: { "2026-11-24": { words: 3, seconds: 120 } } }
function emptyStats() {
  return { streak: 0, lastDay: null, days: {} };
}

function dayKey(date) {
  const d = date || new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + "-" + month + "-" + day;
}

// Record activity on a day and update the streak.
// The streak grows when yesterday already had activity, otherwise restarts.
function recordActivity(stats, date) {
  const next = Object.assign({}, stats, { days: Object.assign({}, stats.days) });
  const key = dayKey(date);
  if (!next.days[key]) next.days[key] = { words: 0, seconds: 0 };
  if (next.lastDay !== key) {
    const yesterday = dayKey(new Date(new Date(key).getTime() - 86400000));
    next.streak = next.lastDay === yesterday ? next.streak + 1 : 1;
    next.lastDay = key;
  }
  return next;
}

function recordWord(stats, date) {
  const next = recordActivity(stats, date);
  next.days = Object.assign({}, next.days);
  const key = dayKey(date);
  next.days[key] = Object.assign({}, next.days[key], {
    words: next.days[key].words + 1,
  });
  return next;
}

function recordSeconds(stats, seconds, date) {
  const next = recordActivity(stats, date);
  next.days = Object.assign({}, next.days);
  const key = dayKey(date);
  next.days[key] = Object.assign({}, next.days[key], {
    seconds: next.days[key].seconds + Math.round(seconds),
  });
  return next;
}

// Sum the last 7 days (including today) for the weekly achievement card.
function weeklySummary(stats, date) {
  let words = 0;
  let seconds = 0;
  const today = new Date(dayKey(date));
  for (let i = 0; i < 7; i++) {
    const key = dayKey(new Date(today.getTime() - i * 86400000));
    const entry = stats.days[key];
    if (entry) {
      words += entry.words;
      seconds += entry.seconds;
    }
  }
  return { words, minutes: Math.round(seconds / 60) };
}

// --- Video difficulty -------------------------------------------------------

// How hard is this script for her? We count the share of unique words that
// are NOT in the built-in common-word dictionary (harder vocabulary) and
// how many unique words she has not collected yet.
function scriptDifficulty(lines, dict, cards) {
  const unique = new Set();
  for (const line of lines) {
    for (const token of tokenize(line.text)) {
      if (token.word) {
        const key = normalizeWord(token.text);
        if (key.length >= 2) unique.add(key);
      }
    }
  }
  if (unique.size === 0) return null;
  let beyondBasic = 0;
  let notCollected = 0;
  const collected = new Set(cards.map((card) => card.key));
  for (const key of unique) {
    if (!dict[key] && !lookupWord(dict, key).en) beyondBasic++;
    if (!collected.has(key)) notCollected++;
  }
  const ratio = beyondBasic / unique.size;
  const level = ratio < 0.08 ? "easy" : ratio < 0.2 ? "medium" : "hard";
  return { level, uniqueWords: unique.size, beyondBasic, notCollected };
}

if (typeof module !== "undefined" && module.exports) {
  Object.assign(module.exports, {
    emptyStats,
    dayKey,
    recordActivity,
    recordWord,
    recordSeconds,
    weeklySummary,
    scriptDifficulty,
  });
}
