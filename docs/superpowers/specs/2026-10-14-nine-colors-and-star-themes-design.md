# Nine's colors and star themes

Date: 2026-10-14. Status: approved in conversation, awaiting review of this document.

## Why

Rewards come in long gaps today: one wardrobe item per world (every 10 levels) and three items
bought with total stars (cap 15, scarf 30, crown 60). Nine is always gold, and there is one
theme per world. This adds a steady ladder of things to unlock with stars: six colors for Nine
and four themes with their own background and music, and keeps the next one in view.

## Decisions

| Topic | Decision |
|---|---|
| What unlocks them | **Total stars** (`meta.totalStars()`: journey + missions + bonus), as thresholds. Stars are never spent; the total only grows. |
| Nine's colors | Gold (default, always available) plus **mint 10★, sky 25★, coral 45★, violet 70★, chrome 110★** (metallic gradient), **rainbow 150★** (fixed gradient, no motion). The body changes; face, outline and items stay. |
| Star themes | **Lo-fi 20★, Jazz 50★, Arcade 90★, Fiesta 130★**, each with its own background and its own music. |
| Ladder | 10 mint · 15 cap · 20 Lo-fi · 25 sky · 30 scarf · 45 coral · 50 Jazz · 60 crown · 70 violet · 90 Arcade · 110 chrome · 130 Fiesta · 150 rainbow. Never more than 20 stars between rewards; a typical player reaches the last around journey level 70–75. Prices are a first pass, to be tuned later. |
| Model | Thresholds, like the star items today (not a shop). |

## 1. Content and rules (meta.js)

- `NINE_COLORS`: `[{ id: 'gold', stars: 0 }, { id: 'mint', stars: 10 }, { id: 'sky', stars: 25 }, { id: 'coral', stars: 45 }, { id: 'violet', stars: 70 }, { id: 'chrome', stars: 110 }, { id: 'rainbow', stars: 150 }]`.
- `colorUnlocked(c)`: `totalStars() >= c.stars`.
- `nineColor()`: the saved `plus9.nineColor` if it exists and is unlocked, else `'gold'` (as `theme()` falls back to grape). `setNineColor(id)` saves it.
- `THEMES` keeps one entry per world (`{ id, world }`) and adds `{ id: 'lofi', stars: 20 }`, `{ id: 'jazz', stars: 50 }`, `{ id: 'arcade', stars: 90 }`, `{ id: 'fiesta', stars: 130 }`.
- `themeUnlocked(t)`: a world theme when its world is reached (`worldReached(t.world)`, as today), a star theme when `totalStars() >= t.stars`. `theme()` validates with it.
- `nextReward()`: the cheapest star-priced unlock still locked across wardrobe star items, colors and star themes, as `{ kind: 'item' | 'color' | 'theme', id, stars }`, or `null` when everything is unlocked.
- `meta.js` gets a Node export (`module.exports = { meta }`) so it can be tested with a fake `localStorage`.

## 2. Customize, home and onboarding (app.js, index.html, styles.css)

- **Customize** (`#style`), top to bottom: Nine's preview, Wardrobe, **Nine's color** (new), Themes.
  - Color row: seven round swatches. The chosen one has the selection ring; Nine's preview changes at once. Locked ones are grey with "45 ★".
  - Themes: fourteen chips (ten worlds, four star themes). A locked star theme shows "50 ★" instead of "World n".
- **Home Customize card**: its subtitle becomes the next reward, "Next: Jazz · 50 ★"; with nothing left it keeps today's text.
- **Unlock toasts**: reaching a threshold shows a toast, as items do today ("New color for Nine: Mint", "New theme: Jazz"); `announceNewItems` is generalized to colors and themes.
- **New! badge**: the home Customize card shows **New!** while something unlocked has not been seen in Customize (`plus9.seenUnlocks`, ids seen when the sheet was last opened).
- **Onboarding** (CLAUDE.md rule): the home tour's third step says stars give outfits, colors and themes for Nine in Customize.
- **Applying the color**: `document.body.dataset.nine` holds the color id; `.mascot { --m-fill: var(--nine, var(--gold)) }` and one rule per color sets `--nine` (chrome and rainbow point at SVG gradients `#nine-chrome`, `#nine-rainbow` defined once in `index.html`). The inline script at the start of `<body>`, which already applies the theme before the first paint, also applies `plus9.nineColor`, so the loading screen's Nine has its color. All Nines follow: title, game, Customize, tour, loader.
- **Accessibility**: each swatch is a button with its name and state ("Mint, chosen" / "Coral, unlocks at 45 stars").

## 3. The four star themes (styles.css, sound.js)

All music in C major / A minor, as `sound.js` asks; each a `STYLES` entry with its own `step`, `bpm`, `cutoff` and `level`. Backgrounds are static CSS gradients (no images, no motion).

- **Lo-fi** (~78 bpm): background a city dusk, muted mauve and orange with a darker skyline band; music electric-piano seventh chords, soft swung kick and snare, a very quiet vinyl crackle.
- **Jazz** (~120 bpm, swing): deep blue club with a warm spotlight at the top; walking bass, ride cymbal in triplets, piano comping ii-V-I.
- **Arcade** (~144 bpm): blue-black with a neon perspective grid (repeating gradients); fast chiptune: square lead, triangle bass, noise drums (faster and higher than grape).
- **Fiesta** (~108 bpm): bright colors with fixed round confetti; Latin feel: 3-2 clave and congas, montuno piano, synth brass stabs.

A star theme behaves like a world theme: background on every screen (the loader included) and its music.

## 4. Saving, compatibility, tests, docs

- New keys: `plus9.nineColor`, `plus9.seenUnlocks`. Old saves stay gold and keep their theme. On Poki they sync like the other keys and stay small.
- **Tests** (`node --test tests/*.test.js`): a new `tests/meta.test.js` loads `meta.js` with a fake `localStorage` and checks thresholds, `nextReward()` across the three kinds and its `null` end, `nineColor()` / `theme()` falling back when the saved choice is locked, world vs star themes. The existing tests (levels 1–80, Daily, Classic) must still pass; nothing here touches rules or bots.
- **Browser checks**: Customize (swatches, preview, locked labels, fourteen themes), the home card's next reward and New! badge, the toasts, loading with a saved color and theme, the four themes' look and music switch, the six languages (de, fr longest) and the five layout sizes with no page scroll, reduced motion.
- **Docs**: CLAUDE.md (Customize, saving keys, sound.js styles, onboarding), README, store listing.

## Out of scope

- Spending stars (a shop) and re-pricing the existing star items.
- Tuning the prices beyond this first pass.
- Theme-specific tile looks.
