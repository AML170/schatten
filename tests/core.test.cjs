// Regressionstests für die reine Logik in js/core.js.
// Regression tests for the pure logic in js/core.js.
// Ohne Pakete: node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../js/core.js");
const { dblT, dblDir, TRANSLATIONS } = require("../js/i18n.js");

// Deterministic random numbers for repeatable tests.
function seeded(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

test("tokenize splits words and separators, keeping order", () => {
  const tokens = core.tokenize("Hallo, Welt!");
  assert.deepEqual(
    tokens.map((t) => t.text),
    ["Hallo", ",", " ", "Welt", "!"]
  );
  assert.equal(tokens[0].word, true);
  assert.equal(tokens[1].word, false);
});

test("normalizeWord lowercases and strips punctuation", () => {
  assert.equal(core.normalizeWord("Haus."), "haus");
  assert.equal(core.normalizeWord("„Wort“"), "wort");
  assert.equal(core.normalizeWord("(schön)"), "schön");
});

test("lookupWord finds exact forms and simple stems", () => {
  const dict = { haus: ["house", "بيت"], lernen: ["to learn", "يتعلم"] };
  assert.equal(core.lookupWord(dict, "Haus").en, "house");
  assert.equal(core.lookupWord(dict, "lernen").ar, "يتعلم");
  // A plural form falls back to its stem (frauen -> frau).
  const withFrau = { frau: ["woman", "امرأة"] };
  const stem = core.lookupWord(withFrau, "Frauen");
  assert.equal(stem.en, "woman");
  assert.equal(stem.stem, true);
});

test("lookupWord returns entry with null meanings for unknown words", () => {
  const dict = { haus: ["house", "بيت"] };
  const unknown = core.lookupWord(dict, "Donaudampfschifffahrt");
  assert.equal(unknown.en, null);
  assert.equal(unknown.key, "donaudampfschifffahrt");
  const plural = core.lookupWord(dict, "hause");
  assert.equal(plural.key, "haus"); // -e ending falls back to the stem
  assert.equal(plural.en, "house");
});

test("json3ToLines builds clean lines and merges segments", () => {
  const json = {
    events: [
      { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: "Hallo " }, { utf8: "Welt" }] },
      { tStartMs: 2000, dDurationMs: 1000, segs: [{ utf8: "\n" }] }, // no real text
      { tStartMs: 2000, dDurationMs: 1500, segs: [{ utf8: "Wie geht es dir?" }] },
      { tStartMs: 3500, dDurationMs: 1000, segs: [{ utf8: "Wie geht es dir?" }] }, // repeat
    ],
  };
  const lines = core.json3ToLines(json);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].text, "Hallo Welt");
  assert.equal(lines[0].start, 0);
  assert.equal(lines[1].start, 2);
});

test("findLineIndex returns the last line that already started", () => {
  const lines = [
    { start: 0, end: 2, text: "a" },
    { start: 2, end: 4, text: "b" },
    { start: 5, end: 7, text: "c" },
  ];
  assert.equal(core.findLineIndex(lines, 0), 0);
  assert.equal(core.findLineIndex(lines, 3), 1);
  assert.equal(core.findLineIndex(lines, 4.7), 1);
  assert.equal(core.findLineIndex(lines, 4.9), 2); // 0.15s lookahead
  assert.equal(core.findLineIndex(lines, 6), 2);
});

test("addCard adds once and never duplicates a key", () => {
  const first = core.addCard([], { key: "haus", word: "Haus", en: "house", ar: "بيت" }, "2026-11-24T10:00:00Z");
  assert.equal(first.added, true);
  assert.equal(first.cards.length, 1);
  const again = core.addCard(first.cards, { key: "haus", word: "haus", en: "house", ar: "بيت" });
  assert.equal(again.added, false);
  assert.equal(again.cards.length, 1);
});

test("removeCard and markCard update the deck", () => {
  const { cards } = core.addCard([], { key: "haus", word: "Haus", en: "house", ar: "بيت" });
  const marked = core.markCard(cards, "haus", true);
  assert.equal(marked[0].known, 1);
  const reset = core.markCard(marked, "haus", false);
  assert.equal(reset[0].known, 0);
  assert.equal(core.removeCard(reset, "haus").length, 0);
});

test("cardMeaning prefers Arabic in Arabic UI, falls back to English", () => {
  const card = { word: "Haus", en: "house", ar: "بيت" };
  assert.equal(core.cardMeaning(card, "ar"), "بيت");
  assert.equal(core.cardMeaning(card, "de"), "house");
  assert.equal(core.cardMeaning({ word: "x", en: "", ar: "شيء" }, "en"), "شيء");
});

test("buildQuizQuestion needs 4 cards with meanings and marks the answer", () => {
  const cards = [
    { key: "a", word: "Haus", en: "house", ar: "بيت" },
    { key: "b", word: "Baum", en: "tree", ar: "شجرة" },
    { key: "c", word: "Buch", en: "book", ar: "كتاب" },
  ];
  assert.equal(core.buildQuizQuestion(cards, "en", seeded([0.1])), null);
  cards.push({ key: "d", word: "Hund", en: "dog", ar: "كلب" });
  const question = core.buildQuizQuestion(cards, "en", seeded([0.0, 0.5, 0.2, 0.7, 0.3]));
  assert.equal(question.options.length, 4);
  assert.equal(question.options[question.answerIndex], "house");
  assert.equal(question.word, "Haus");
});

test("buildMatchingDeck creates pairs of word and meaning tiles", () => {
  const cards = [
    { key: "a", word: "Haus", en: "house", ar: "بيت" },
    { key: "b", word: "Baum", en: "tree", ar: "شجرة" },
    { key: "c", word: "Buch", en: "book", ar: "كتاب" },
  ];
  const tiles = core.buildMatchingDeck(cards, "en", seeded([0.4, 0.1, 0.8, 0.3, 0.6]), 3);
  assert.equal(tiles.length, 6);
  const pairs = {};
  for (const tile of tiles) {
    pairs[tile.match] = pairs[tile.match] || [];
    pairs[tile.match].push(tile);
  }
  assert.equal(Object.keys(pairs).length, 3);
  for (const pair of Object.values(pairs)) {
    assert.equal(pair.length, 2);
    assert.notEqual(pair[0].kind, pair[1].kind);
  }
});

test("safeParse survives broken JSON", () => {
  assert.deepEqual(core.safeParse("not json", []), []);
  assert.deepEqual(core.safeParse('{"a":1}', {}), { a: 1 });
});

test("streak grows on consecutive days and restarts after a gap", () => {
  let stats = core.emptyStats();
  stats = core.recordActivity(stats, new Date("2026-11-22T10:00:00"));
  assert.equal(stats.streak, 1);
  stats = core.recordActivity(stats, new Date("2026-11-23T10:00:00"));
  assert.equal(stats.streak, 2);
  // Same day again: streak unchanged.
  stats = core.recordActivity(stats, new Date("2026-11-23T18:00:00"));
  assert.equal(stats.streak, 2);
  // A missed day restarts the streak.
  stats = core.recordActivity(stats, new Date("2026-11-25T10:00:00"));
  assert.equal(stats.streak, 1);
});

test("recordWord and recordSeconds feed the weekly summary", () => {
  let stats = core.emptyStats();
  stats = core.recordWord(stats, new Date("2026-11-24T10:00:00"));
  stats = core.recordWord(stats, new Date("2026-11-24T11:00:00"));
  stats = core.recordSeconds(stats, 120, new Date("2026-11-24T12:00:00"));
  stats = core.recordWord(stats, new Date("2026-11-20T10:00:00")); // still within 7 days
  const week = core.weeklySummary(stats, new Date("2026-11-24T23:00:00"));
  assert.equal(week.words, 3);
  assert.equal(week.minutes, 2);
});

test("scriptDifficulty rates vocabulary and counts uncollected words", () => {
  const dict = { hallo: ["hello", "مرحبا"], welt: ["world", "الدنيا"] };
  const lines = [
    { start: 0, end: 1, text: "Hallo Welt" },
    { start: 1, end: 2, text: "Hallo Donaudampfschifffahrt" },
  ];
  const nobody = core.scriptDifficulty(lines, dict, []);
  assert.equal(nobody.uniqueWords, 3);
  assert.equal(nobody.notCollected, 3);
  assert.ok(["medium", "hard"].includes(nobody.level)); // 1 of 3 beyond basic
  const collected = core.scriptDifficulty(lines, dict, [{ key: "hallo" }]);
  assert.equal(collected.notCollected, 2);
  assert.equal(core.scriptDifficulty([], dict, []), null);
});

test("every translation key exists in all three languages", () => {
  for (const key of Object.keys(TRANSLATIONS.en)) {
    assert.ok(TRANSLATIONS.de[key] !== undefined, "de fehlt: " + key);
    assert.ok(TRANSLATIONS.ar[key] !== undefined, "ar fehlt: " + key);
  }
  for (const key of Object.keys(TRANSLATIONS.de)) {
    assert.ok(TRANSLATIONS.en[key] !== undefined, "en fehlt: " + key);
  }
});

test("Arabic is RTL, English and German are LTR", () => {
  assert.equal(dblDir("ar"), "rtl");
  assert.equal(dblDir("en"), "ltr");
  assert.equal(dblDir("de"), "ltr");
  assert.equal(dblT("ar", "navCards"), "الكروت");
  assert.equal(dblT("xx", "navCards"), "Flashcards"); // unknown language falls back
});
