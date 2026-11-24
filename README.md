# Schatten

Eine Chrome-Erweiterung (Manifest V3) zum Deutschlernen mit YouTube - im Stil von Language Reactor, aber selbst gebaut und ohne Frameworks. Der Name kommt von der Lernmethode **Shadowing**: Man spricht einen Text wie einen Schatten Satz für Satz nach.

Die Oberfläche startet auf Englisch und lässt sich umschalten: **English, Deutsch und العربية** (mit Rechts-nach-links-Darstellung für Arabisch). Die Sprachwahl wird gespeichert.

## Was die Erweiterung macht

**Auf YouTube (Videoseiten):**

- Das Skript eines Videos erscheint automatisch in einem Panel neben dem Video - Zeile für Zeile, mit Zeitmarken.
- **Shadowing-Modus:** Die aktuelle Zeile steht groß im Panel und folgt dem Video automatisch. Tasten für Zeile vor / zurück, "Zeile abspielen" und eine langsame Wiederholung (0,75-fache Geschwindigkeit) pro Zeile.
- **Aufnahme:** Pro Zeile kannst du deine eigene Stimme aufnehmen und dich neben dem Original anhören.
- **Klick auf ein Wort:** zeigt die Bedeutung auf Englisch und Arabisch aus dem eingebauten Mini-Wörterbuch. Das Wort wird automatisch in den Karteikarten gespeichert - Wörter, die man nachschlägt, sind genau die Wörter, die man noch nicht kennt.
- **Bekannte Wörter werden grün markiert**, überall im Skript, auch bei neuen Videos.
- **Schwierigkeitsanzeige:** Wie viele Wörter des Skripts über das Grundvokabular hinausgehen und wie viele du noch nicht gesammelt hast.

**Auf der eigenen Bibliotheksseite:**

- **Textbibliothek** mit acht eigens geschriebenen Texten nach Niveau (A1 bis B2) plus eigene Texte zum Einfügen. Beim Lesen funktioniert das Wörterbuch genauso wie auf YouTube.
- **Karteikarten** mit Wiederholmodus (Umdrehen, "Gewusst" / "Nochmal") und **Quiz** (Multiple Choice, wahlweise aus allen Wörtern oder nur aus den Wörtern eines bestimmten Videos).
- **Wortspiel:** Zuordnungsspiel (deutsches Wort ↔ Bedeutung) aus den eigenen Karteikarten.
- **Fortschritt:** Zähler für gesammelte Wörter, Tages-Streak und eine **Wochenkarte** ("Meine Deutsch-Woche"), die sich als Bild herunterladen und teilen lässt.
- **Tägliche Erinnerung** an die Karteikarten-Wiederholung (Browser-Benachrichtigung, 18 Uhr).

## Installation (Entwicklermodus)

1. Dieses Repository herunterladen oder klonen.
2. In Chrome `chrome://extensions` öffnen.
3. Oben rechts den **Entwicklermodus** aktivieren.
4. **"Entpackte Erweiterung laden"** wählen und den Projektordner auswählen.
5. Ein YouTube-Video mit Untertiteln öffnen - das Skript-Panel erscheint von selbst. Über das Puzzle-Symbol oben rechts öffnet sich die Bibliotheksseite.

Kein Build-Schritt, kein Server, keine Abhängigkeiten.

## Wichtige technische Entscheidungen

- **Untertitel automatisch lesen:** Die Datei `js/injected.js` läuft in der eigenen JavaScript-Welt der YouTube-Seite (`"world": "MAIN"` im Manifest), denn nur dort ist `window.ytInitialPlayerResponse` sichtbar - das Objekt, in dem YouTube die Untertitel-Spuren des Videos auflistet. Die Untertitel-Datei selbst wird als normale Same-Origin-Anfrage auf youtube.com geladen (`fmt=json3`) und per `postMessage` an das Content-Skript gegeben. YouTube ist eine Single-Page-App, deshalb lauscht die Erweiterung auf das `yt-navigate-finish`-Ereignis, um beim Video-Wechsel das neue Skript zu laden.
- **Warum ein Mini-Wörterbuch statt eines Online-Wörterbuchs:** Eine rein lokale Erweiterung ohne Server kann kein großes Wörterbuch befragen, ohne Nutzerdaten an Dritte zu senden. Deshalb ist ein Wörterbuch mit rund 300 häufigen Wörtern (Englisch + Arabisch) eingebaut (`js/data.js`), das alle Wörter der mitgelieferten Texte abdeckt. Für jedes unbekannte Wort verlinkt das Pop-up ehrlich auf dict.cc. Diese Abwägung - Datenschutz und Unabhängigkeit gegen Vollständigkeit - ist bewusst so gewählt.
- **Trennung von Logik und Seite:** Alles Prüfbare (Wörter zerlegen, Untertitel parsen, Karteikarten, Quiz, Streak, Schwierigkeit) liegt in `js/core.js` ganz ohne DOM. Dadurch läuft dieselbe Datei im Browser und in den Node.js-Tests.
- **Speicher:** `js/store.js` kapselt `chrome.storage.local` (geteilt zwischen YouTube-Panel und Bibliotheksseite) mit einem `localStorage`-Fallback, damit die Seiten auch ohne Erweiterung funktionieren.
- **RTL:** Arabisch schaltet `dir="rtl"` und passende Texte in einem Schritt um (`js/i18n.js`).

## Projektstruktur

```
schatten/
├── manifest.json       Manifest V3: Rechte, Content-Skripte, Hintergrund
├── popup.html          Kleines Popup hinter dem Erweiterungs-Symbol
├── library.html        Die Bibliotheksseite (Texte, Karteikarten, Spiel, Woche)
├── LICENSE             MIT-Lizenz
├── css/
│   ├── style.css       Stile der eigenen Seiten
│   └── panel.css       Stile des YouTube-Panels (gekapselt, .dbl-*)
├── js/
│   ├── injected.js     Läuft in der Seitenwelt, liest die Untertitel-Spuren
│   ├── content.js      Baut das Panel auf YouTube (Shadowing, Wörterbuch)
│   ├── library.js      Steuerung der Bibliotheksseite
│   ├── core.js         Reine Logik ohne DOM (hier greifen die Tests)
│   ├── i18n.js         Alle Texte in Englisch, Deutsch, Arabisch
│   ├── data.js         Lesetexte (A1-B2) und das Mini-Wörterbuch
│   ├── store.js        Speicher-Wrapper
│   ├── background.js   Tägliche Erinnerung (Service Worker)
│   └── popup.js        Öffnet die Bibliotheksseite
└── tests/
    └── core.test.cjs   Regressionstests (node --test)
```

## Tests

Kleine Regressionstests für die Kernlogik liegen in `tests/core.test.cjs` und laufen mit dem eingebauten Test-Runner von Node.js, ohne zusätzliche Pakete:

```bash
node --test
```

Die Tests prüfen unter anderem das Zerlegen von Wörtern, das Parsen des Untertitel-Formats (json3), die Zeilen-Synchronisation beim Shadowing, das Speichern von Karteikarten ohne Duplikate, Quiz- und Spielaufbau, die Streak- und Wochenberechnung, die Schwierigkeitsanzeige und die Vollständigkeit der Übersetzungen in allen drei Sprachen.

## Hinweise und Grenzen

- Die Erweiterung erscheint bewusst **nicht im Chrome Web Store** (dort wären eine einmalige Gebühr und eine Prüfung nötig); die Installation im Entwicklermodus genügt für den eigenen Gebrauch.
- **Aufnahmen** werden nur für die Sitzung im Speicher gehalten und nicht dauerhaft gespeichert.
- Videos ohne Untertitel zeigen einen freundlichen Hinweis statt eines Skripts.
- Die Spracherkennung des Mini-Wörterbuchs deckt Grundformen und einfache Endungen ab; unbekannte Wörter gehen ehrlich zu dict.cc.

## Autorin

**AML Ashraf** - [github.com/AML170](https://github.com/AML170)

Lizenz: [MIT](LICENSE)

---
---

# Schatten (English)

A Chrome extension (Manifest V3) for learning German with YouTube - Language-Reactor style, but self-built with plain HTML, CSS and JavaScript, no frameworks. The name comes from the **shadowing** method: you repeat a text line by line, like a shadow.

The UI starts in English and switches in-app: **English, Deutsch, العربية** (with right-to-left layout for Arabic). The choice is saved.

## What it does

**On YouTube (watch pages):**

- The video's script appears automatically in a side panel, line by line with timestamps.
- **Shadowing mode:** the current line is shown large and follows the video. Buttons for previous/next line, "play this line", and a slow replay (0.75x) per line.
- **Recording:** record your own voice per line and listen to yourself next to the original.
- **Click any word:** its meaning pops up in English and Arabic from the built-in mini dictionary, and the word is saved to your flashcards automatically - the words you look up are exactly the words you do not know yet.
- **Known words are tinted green** everywhere in the script, including new videos.
- **Difficulty indicator:** how many words go beyond basic vocabulary and how many you have not collected yet.

**On the library page:**

- **Text library** with eight original graded texts (A1 to B2) plus your own pasted texts. The dictionary works the same while reading.
- **Flashcards** with a review mode (flip, "I knew it" / "Again") and a **quiz** (multiple choice, from all words or from one video's words).
- **Word game:** matching pairs (German word ↔ meaning) built from your own flashcards.
- **Progress:** collected-words counter, daily streak, and a downloadable, shareable **weekly card** ("My German week").
- **Daily reminder** to review flashcards (browser notification, 6 pm).

## Install (developer mode)

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (top right).
4. Click **"Load unpacked"** and select the project folder.
5. Open any YouTube video with subtitles - the script panel appears by itself. The puzzle icon in the toolbar opens the library page.

No build step, no server, no dependencies.

## Key technical decisions

- **Reading captions automatically:** `js/injected.js` runs in the page's own JavaScript world (`"world": "MAIN"` in the manifest), because only there `window.ytInitialPlayerResponse` is visible - the object where YouTube lists the video's caption tracks. The caption file itself is fetched as a plain same-origin request on youtube.com (`fmt=json3`) and passed to the content script via `postMessage`. Since YouTube is a single-page app, the extension listens for `yt-navigate-finish` to load the new script on every video change.
- **Why a bundled mini dictionary:** a fully local extension without a server cannot query a large online dictionary without sending user data to third parties. So a dictionary of about 300 common words (English + Arabic) is bundled in `js/data.js`, covering every word in the included texts. Unknown words link honestly to dict.cc. This trade-off - privacy and independence over completeness - is deliberate.
- **Logic separated from the page:** everything testable (tokenizing, caption parsing, flashcards, quiz, streak, difficulty) lives in `js/core.js` with no DOM at all, so the same file runs in the browser and in the Node.js tests.
- **Storage:** `js/store.js` wraps `chrome.storage.local` (shared between the YouTube panel and the library page) with a `localStorage` fallback.
- **RTL:** Arabic switches `dir="rtl"` and all texts in one step (`js/i18n.js`).

## Tests

Small regression tests for the core logic live in `tests/core.test.cjs` and run with Node's built-in test runner, no extra packages:

```bash
node --test
```

They cover word tokenizing, caption (json3) parsing, shadowing line sync, duplicate-free flashcards, quiz and game builders, streak and weekly math, the difficulty indicator, and translation completeness across all three languages.

## Notes and limits

- The extension is deliberately **not on the Chrome Web Store** (that would need a one-time fee and review); local developer-mode install is enough for personal use.
- **Voice recordings** are kept in memory for the session only, not stored permanently.
- Videos without captions show a friendly note instead of a script.
- The mini dictionary covers base forms and simple endings; unknown words go honestly to dict.cc.

## Author

**AML Ashraf** - [github.com/AML170](https://github.com/AML170)

License: [MIT](LICENSE)
