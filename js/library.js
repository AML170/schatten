/**
 * Schatten - library.js
 * The extension's own page: graded texts, own texts, the reader with the
 * click-a-word dictionary, flashcards (review + quiz), the matching game
 * and the weekly achievement card.
 *
 * Pure logic lives in core.js; this file only wires it to the page.
 */

"use strict";

const LANG_KEY = "dbl:language";
const CARDS_KEY = "dbl:cards";
const STATS_KEY = "dbl:stats";
const OWN_KEY = "dbl:owntexts";
const SOURCES_KEY = "dbl:sources";

let lang = "en";
let cards = [];
let stats = emptyStats();
let ownTexts = [];
let sources = [];

let reviewIndex = 0;
let flipped = false;
let quizState = null; // { right, total, question }
let gameState = null; // { tiles, open, matched, moves }

// --- Small helpers ---------------------------------------------------------
function $(id) {
  return document.getElementById(id);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function saveAll() {
  await dblStore.set(CARDS_KEY, cards);
  await dblStore.set(STATS_KEY, stats);
}

// --- Language --------------------------------------------------------------
function setLanguage(next) {
  lang = next;
  dblStore.set(LANG_KEY, next);
  dblApply(document.documentElement, lang);
  renderStats();
  renderLibrary();
  renderOwnTexts();
  renderCard();
  renderQuizScore();
  renderWeek();
  renderSearch();
}

function renderStats() {
  $("stat-words").textContent = cards.length;
  $("stat-streak").textContent = stats.streak;
  $("cards-count").textContent = cards.length;
}

// --- Navigation --------------------------------------------------------------
function showView(name) {
  document.querySelectorAll(".nav .nav__button").forEach((button) => {
    const active = button.dataset.view === name;
    button.classList.toggle("ist-aktiv", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("versteckt", view.id !== "view-" + name);
  });
}

// --- Library: graded texts ------------------------------------------------------
function renderLibrary() {
  const list = $("text-list");
  list.innerHTML = "";
  for (const level of ["A1", "A2", "B1", "B2"]) {
    const group = TEXTS.filter((text) => text.level === level);
    if (!group.length) continue;
    const heading = el("h3", "textliste__ebene", level);
    list.appendChild(heading);
    for (const text of group) {
      const button = el("button", "textliste__eintrag", text.title[lang] || text.title.en);
      button.addEventListener("click", () => openText(text, "text:" + text.id));
      list.appendChild(button);
    }
  }
}


// --- Search: across graded texts (title, level, topic words) and the dictionary ---
function renderSearch() {
  const input = $("search-input");
  const box = $("search-results");
  if (!input || !box) return;
  const q = input.value.trim().toLowerCase();
  const list = $("text-list");
  if (!q) {
    box.classList.add("versteckt");
    box.innerHTML = "";
    if (list) list.classList.remove("versteckt");
    return;
  }
  const texts = TEXTS.filter((text) => {
    const hay = [
      text.level,
      text.title.en,
      text.title.de,
      text.title.ar,
      text.text,
    ].join(" ").toLowerCase();
    return hay.includes(q);
  });
  const words = Object.entries(DICTIONARY)
    .filter(([key, [en, ar]]) =>
      key.includes(q) || en.toLowerCase().includes(q) || ar.includes(q)
    )
    .slice(0, 24);
  if (list) list.classList.add("versteckt");
  box.classList.remove("versteckt");
  box.innerHTML = "";
  if (!texts.length && !words.length) {
    box.appendChild(el("p", "hinweis", dblT(lang, "searchNone")));
    return;
  }
  if (texts.length) {
    box.appendChild(el("h3", "textliste__ebene", dblT(lang, "searchTexts")));
    const wrap = el("div", "textliste");
    for (const text of texts) {
      const button = el(
        "button",
        "textliste__eintrag",
        text.level + " · " + (text.title[lang] || text.title.en)
      );
      button.addEventListener("click", () => openText(text, "text:" + text.id));
      wrap.appendChild(button);
    }
    box.appendChild(wrap);
  }
  if (words.length) {
    box.appendChild(el("h3", "textliste__ebene", dblT(lang, "searchWords")));
    const wrap = el("div", "wortliste");
    for (const [key, [en, ar]] of words) {
      wrap.appendChild(el("div", "wortliste__eintrag", key + " — " + en + " — " + ar));
    }
    box.appendChild(wrap);
  }
}

// --- Own texts -------------------------------------------------------------------
function renderOwnTexts() {
  const list = $("own-list");
  list.innerHTML = "";
  ownTexts.forEach((own) => {
    const row = el("div", "textliste__eintrag textliste__eintrag--eigen");
    const open = el("button", "textliste__titel", own.title);
    open.addEventListener("click", () => openText(own, "text:own-" + own.id));
    const del = el("button", "knopf knopf--klein knopf--gefahr", dblT(lang, "ownDelete"));
    del.addEventListener("click", async () => {
      ownTexts = ownTexts.filter((item) => item.id !== own.id);
      await dblStore.set(OWN_KEY, ownTexts);
      renderOwnTexts();
    });
    row.appendChild(open);
    row.appendChild(del);
    list.appendChild(row);
  });
}

// --- Reader -----------------------------------------------------------------------
let currentSource = "";
function openText(textObj, source) {
  currentSource = source;
  $("reader-title").textContent = textObj.title[lang] || textObj.title.en || textObj.title;
  const article = $("reader-content");
  article.innerHTML = "";
  const known = new Set(cards.map((card) => card.key));
  for (const token of tokenize(textObj.text)) {
    if (!token.word) {
      article.appendChild(document.createTextNode(token.text));
    } else {
      const span = el("span", "wort", token.text);
      const key = normalizeWord(token.text);
      if (known.has(key)) span.classList.add("wort--bekannt");
      span.addEventListener("click", () => showWord(token.text, span));
      article.appendChild(span);
    }
  }
  showView("reader");
}

// --- Dictionary popup (shared look with the YouTube panel) --------------------------
function showWord(rawWord, span) {
  const entry = lookupWord(DICTIONARY, rawWord);
  if (!entry) return;
  $("dict-word").textContent = entry.word;
  $("dict-en").textContent = entry.en || "";
  $("dict-ar").textContent = entry.ar || "";
  const hint = $("dict-hint");
  hint.innerHTML = "";
  if (!entry.en) {
    hint.appendChild(document.createTextNode(dblT(lang, "dictNoMeaning") + " "));
    const link = el("a", "", "dict.cc");
    link.href = "https://www.dict.cc/?s=" + encodeURIComponent(entry.key);
    link.target = "_blank";
    link.rel = "noopener";
    hint.appendChild(link);
  }
  $("dict-panel").classList.remove("versteckt");
  saveWord(entry, span);
}

// Looking a word up saves it automatically to the flashcards.
async function saveWord(entry, span) {
  const result = addCard(cards, {
    key: entry.key,
    word: entry.word,
    en: entry.en,
    ar: entry.ar,
    source: currentSource,
  });
  if (result.added) {
    cards = result.cards;
    stats = recordWord(stats);
    await saveAll();
    renderStats();
    if (span) span.classList.add("wort--bekannt");
    renderQuizSources();
  }
}

// --- Flashcards: review -------------------------------------------------------------
function renderCard() {
  const empty = cards.length === 0;
  $("cards-empty").classList.toggle("versteckt", !empty);
  $("karte").classList.toggle("versteckt", empty);
  document.querySelector(".karten-knöpfe").classList.toggle("versteckt", empty);
  if (empty) return;
  reviewIndex = Math.min(reviewIndex, cards.length - 1);
  const card = cards[reviewIndex];
  $("karte-front").textContent = card.word;
  $("karte-back").textContent = cardMeaning(card, lang) || "—";
  $("karte-back").classList.add("versteckt");
  $("karte-quelle").textContent = sourceLabel(card.source);
  flipped = false;
}

function sourceLabel(source) {
  if (!source) return "";
  if (source.startsWith("video:")) {
    const id = source.slice(6);
    const found = sources.find((s) => s.id === id);
    return "▶ " + (found ? found.title : id);
  }
  if (source.startsWith("text:")) {
    const id = source.slice(5);
    const found = TEXTS.find((t) => t.id === id);
    return "📖 " + (found ? found.title[lang] || found.title.en : id);
  }
  return source;
}

function nextCard() {
  reviewIndex = (reviewIndex + 1) % Math.max(cards.length, 1);
  renderCard();
}

async function markCurrent(knewIt) {
  const card = cards[reviewIndex];
  if (!card) return;
  cards = markCard(cards, card.key, knewIt);
  stats = recordActivity(stats);
  await saveAll();
  nextCard();
}

// --- Flashcards: quiz ------------------------------------------------------------------
// The quiz can use all words or only the words from one video or text.
function renderQuizSources() {
  const select = $("quiz-source");
  const previous = select.value;
  select.innerHTML = "";
  const all = el("option", "", dblT(lang, "quizScopeAll"));
  all.value = "";
  select.appendChild(all);
  const seen = new Set();
  for (const card of cards) {
    if (!card.source || seen.has(card.source)) continue;
    seen.add(card.source);
    const option = el("option", "", sourceLabel(card.source));
    option.value = card.source;
    select.appendChild(option);
  }
  select.value = previous || "";
}

function quizPool() {
  const source = $("quiz-source").value;
  return source ? cards.filter((card) => card.source === source) : cards;
}

function renderQuizScore() {
  if (!quizState) {
    $("quiz-score").textContent = "";
    return;
  }
  $("quiz-score").textContent = dblT(lang, "quizScore")(quizState.right, quizState.total);
}

function startQuiz() {
  const question = buildQuizQuestion(quizPool(), lang);
  if (!question) {
    $("quiz-hint").classList.remove("versteckt");
    $("quiz-question").textContent = "";
    $("quiz-options").innerHTML = "";
    return;
  }
  $("quiz-hint").classList.add("versteckt");
  quizState = { right: 0, total: 0 };
  askQuiz(question);
}

function askQuiz(question) {
  quizState.question = question;
  $("quiz-question").textContent = question.word;
  $("quiz-feedback").textContent = "";
  $("quiz-next").classList.add("versteckt");
  const box = $("quiz-options");
  box.innerHTML = "";
  question.options.forEach((option, index) => {
    const button = el("button", "quiz__option", option);
    button.addEventListener("click", () => answerQuiz(index));
    box.appendChild(button);
  });
  renderQuizScore();
}

async function answerQuiz(index) {
  const question = quizState.question;
  quizState.total += 1;
  const right = index === question.answerIndex;
  if (right) {
    quizState.right += 1;
    $("quiz-feedback").textContent = dblT(lang, "quizCorrect");
    cards = markCard(cards, question.key, true);
  } else {
    $("quiz-feedback").textContent =
      dblT(lang, "quizWrong") + " " + question.options[question.answerIndex];
    cards = markCard(cards, question.key, false);
  }
  stats = recordActivity(stats);
  await saveAll();
  renderStats();
  renderQuizScore();
  $("quiz-next").classList.remove("versteckt");
}

// --- Word game: matching pairs -----------------------------------------------------------
function startGame() {
  const tiles = buildMatchingDeck(cards, lang, null, 6);
  if (tiles.length < 6) {
    $("game-info").textContent = dblT(lang, "gameNeedCards");
    $("game-grid").innerHTML = "";
    return;
  }
  gameState = { tiles, open: [], matched: 0, moves: 0 };
  const grid = $("game-grid");
  grid.innerHTML = "";
  $("game-info").textContent = dblT(lang, "gameMoves")(0);
  tiles.forEach((tile) => {
    const button = el("button", "spielfeld__karte", "?");
    button.addEventListener("click", () => flipTile(tile, button));
    grid.appendChild(button);
  });
}

function flipTile(tile, button) {
  if (!gameState || tile.done || gameState.open.includes(tile)) return;
  tile.faceUp = true;
  button.textContent = tile.text;
  button.classList.add("spielfeld__karte--offen");
  gameState.open.push(tile);
  if (gameState.open.length < 2) return;
  gameState.moves += 1;
  $("game-info").textContent = dblT(lang, "gameMoves")(gameState.moves);
  const [first, second] = gameState.open;
  gameState.open = [];
  if (first.match === second.match) {
    first.done = true;
    second.done = true;
    gameState.matched += 1;
    document.querySelectorAll(".spielfeld__karte--offen").forEach((b) => {
      if (b.textContent === first.text || b.textContent === second.text) {
        b.classList.remove("spielfeld__karte--offen");
        b.classList.add("spielfeld__karte--gefunden");
      }
    });
    if (gameState.matched === gameState.tiles.length / 2) {
      $("game-info").textContent = dblT(lang, "gameWon")(gameState.moves);
      stats = recordActivity(stats);
      saveAll().then(renderStats);
    }
  } else {
    first.faceUp = false;
    second.faceUp = false;
    const buttons = document.querySelectorAll(".spielfeld__karte--offen");
    setTimeout(() => {
      buttons.forEach((b) => {
        b.textContent = "?";
        b.classList.remove("spielfeld__karte--offen");
      });
    }, 900);
  }
}

// --- Weekly achievement card ---------------------------------------------------------------
function renderWeek() {
  const canvas = $("week-canvas");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  const week = weeklySummary(stats);
  ctx.fillStyle = "#4f46e5";
  ctx.fillRect(0, 0, 800, 420);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 44px Arial";
  ctx.textAlign = "center";
  ctx.fillText(dblT(lang, "weekTitle"), 400, 90);
  ctx.font = "bold 90px Arial";
  ctx.fillText(String(week.words), 250, 220);
  ctx.fillText(String(week.minutes), 550, 220);
  ctx.font = "26px Arial";
  ctx.fillText(dblT(lang, "weekWords"), 250, 270);
  ctx.fillText(dblT(lang, "weekMinutes"), 550, 270);
  ctx.font = "bold 34px Arial";
  ctx.fillText("🔥 " + stats.streak + " " + dblT(lang, "statStreak"), 400, 350);
}

function downloadWeek() {
  const link = document.createElement("a");
  link.download = "schatten-woche.png";
  link.href = $("week-canvas").toDataURL("image/png");
  link.click();
}

// --- Wire everything up -------------------------------------------------------------------
document.querySelectorAll(".nav .nav__button").forEach((button) => {
  button.addEventListener("click", () => {
    showView(button.dataset.view);
    if (button.dataset.view === "week") renderWeek();
  });
});

document.querySelectorAll(".language__button").forEach((button) => {
  button.addEventListener("click", () => setLanguage(button.dataset.lang));
});

$("own-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = $("own-title").value.trim();
  const text = $("own-text").value.trim();
  if (!title || !text) return;
  ownTexts.unshift({ id: String(Date.now()), title, text });
  await dblStore.set(OWN_KEY, ownTexts);
  $("own-title").value = "";
  $("own-text").value = "";
  renderOwnTexts();
});

$("reader-back").addEventListener("click", () => showView("library"));
$("search-input").addEventListener("input", renderSearch);
$("dict-close").addEventListener("click", () =>
  $("dict-panel").classList.add("versteckt")
);

$("mode-review").addEventListener("click", () => {
  $("review-box").classList.remove("versteckt");
  $("quiz-box").classList.add("versteckt");
  $("mode-review").classList.add("ist-aktiv");
  $("mode-quiz").classList.remove("ist-aktiv");
});
$("mode-quiz").addEventListener("click", () => {
  $("review-box").classList.add("versteckt");
  $("quiz-box").classList.remove("versteckt");
  $("mode-quiz").classList.add("ist-aktiv");
  $("mode-review").classList.remove("ist-aktiv");
  renderQuizSources();
});

$("card-flip").addEventListener("click", () => {
  flipped = !flipped;
  $("karte-back").classList.toggle("versteckt", !flipped);
});
$("card-know").addEventListener("click", () => markCurrent(true));
$("card-again").addEventListener("click", () => markCurrent(false));
$("card-delete").addEventListener("click", async () => {
  const card = cards[reviewIndex];
  if (!card) return;
  cards = removeCard(cards, card.key);
  await saveAll();
  renderStats();
  renderCard();
  renderQuizSources();
});

$("quiz-start").addEventListener("click", startQuiz);
$("quiz-next").addEventListener("click", () => {
  const question = buildQuizQuestion(quizPool(), lang);
  if (question) askQuiz(question);
});
$("game-start").addEventListener("click", startGame);
$("week-download").addEventListener("click", downloadWeek);

// --- Start -----------------------------------------------------------------------------
Promise.all([
  dblStore.get(LANG_KEY, "en"),
  dblStore.get(CARDS_KEY, []),
  dblStore.get(STATS_KEY, emptyStats()),
  dblStore.get(OWN_KEY, []),
  dblStore.get(SOURCES_KEY, []),
]).then(([savedLang, savedCards, savedStats, savedOwn, savedSources]) => {
  lang = savedLang;
  cards = savedCards;
  stats = savedStats;
  ownTexts = savedOwn;
  sources = savedSources;
  setLanguage(lang);
  renderQuizSources();
  showView("library");
});

// "Full version" download button: GitHub serves the repo as a zip.
// The repo name comes from the page path, so this survives any rename.
(function () {
  const link = document.getElementById("full-download");
  if (!link) return;
  const repo = location.pathname.split("/").filter(Boolean)[0] || "schatten";
  link.href =
    "https://github.com/AML170/" + repo + "/archive/refs/heads/main.zip";
})();
