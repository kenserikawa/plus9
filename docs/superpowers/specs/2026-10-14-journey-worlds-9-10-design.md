# Journey worlds 9 and 10: minus tiles and coupler tiles

Date: 2026-10-14. Status: approved in conversation, awaiting review of this document.

## Why

Up to level 80 the journey grew harder by raising the target (+2 every 5 levels). Past that it
stopped working: a sum needs a tile worth exactly what is missing, and the bigger the target,
the less likely that is, so levels turned into luck (level 83 was won by 0 of 200 simulated
typical players; beyond ~95 no board came near the intended win rate). Commit 5589f00 holds the
numbers at level 80's difficulty (tier 15, target 38) from level 81 on.

From here, difficulty comes from **planning, not bigger numbers**: each new world brings a tile
mechanic that gives more ways to make a number exactly, but asks the player to think ahead.

## Decisions

| Topic | Decision |
|---|---|
| Where | Two new worlds right after neon: **world 9 "Chrome"** (levels 81–90) and **world 10 "Gears"** (91–100). From 101 the journey stays in Gears. |
| World 9 mechanic | **Minus tiles**: worth −1…−5, subtract from the centre's sum. |
| World 10 mechanic | **Coupler tiles**: worth +1…+5, never go to the centre; dropped onto a board tile they fuse into it. |
| After their world | They **accumulate**, like the special tiles: minus tiles from 81 on, couplers from 91 on. |
| Other modes | Journey only. Classic, 60 seconds and the Daily are unchanged. |
| Look | Minus: muted silver, metallic, static sheen. Coupler: bronze, metallic, static sheen, a small plug badge. Neither has a color. |
| Rewards | Boss 90: welding goggles (`welder`, face slot). Boss 100: top hat (`tophat`, head slot). |
| Themes and music | Chrome: steel grey-blue to silver, robotic synth-pop (~112 bpm). Gears: copper to bronze, a music box with a ticking clock and swing (~96 bpm). |

## 1. Rules (rules.js)

### Drawing

- `drawTile(lv, rnd, specials, mechanics)` gains a `mechanics` level: 0 = none (levels 1–80 and
  every other mode), 1 = minus tiles (81–90), 2 = minus and coupler tiles (91+).
- `journeyLevel(n)` sets `mechanics` from `n`. Classic, 60 s, the Daily and levels 1–80 pass 0,
  so their draws, boards and seeds do not change.
- With `mechanics` > 0, every draw consumes the same rolls whatever it produces (as the special
  tiles do today), so a seeded board is the same for the game and the bots. The magnitude of a
  minus or coupler tile (1–5) comes from its own roll.
- Chances (`MINUS_CHANCE`, `COUPLER_CHANCE`) start around 5 % each and are tuned with the bots
  (section 4) to roughly one of each per board on average.

### Tiles

A minus tile is `{ value: 3, color, special: 'minus' }` (`value` is the magnitude); a coupler is
`{ value: 3, color, special: 'coupler' }`. Their `color` is drawn (keeps the roll count) but
ignored.

- **Minus tile, played to the centre**: `tileValue` is −value. It can be played only if the sum
  stays at or above 0 (so never on an empty centre). It is in the sum's parts but does not count
  as a tile for points and has no color: it neither breaks nor makes a combo (`sumPoints`,
  `keepsCombo`). Going over the target still loses (a minus tile can't cause that).
- **Coupler, fused onto a board tile**: allowed onto a normal, ×2 or rainbow tile that is not
  frozen; never onto a wild, minus, coupler or frozen tile; and only if tile + coupler ≤ target.
  The fused tile keeps its color and special and is worth tile + coupler; played later, it
  counts as one tile for points. The coupler's slot takes Next (and a new Next is drawn), like
  playing a tile. Fusing is allowed at any time during play (also with an empty centre) and does
  not change the sum. A coupler never goes to the centre. New pure helpers: `canFuse(coupler, tile, target)` and
  `fuse(tile, coupler)`.
- **Stuck** (sum above 0): no tile can be played *and* no fusion produces a tile that fits what
  is missing. A minus tile that can be played means not stuck. Shuffle, Bank / Give up and 🎬
  work as today; shuffling rerolls minus and coupler tiles like any unfrozen tile.

### Levels and worlds

- `WORLDS` gains `{ id: 'chrome', reward: 'welder' }` and `{ id: 'gears', reward: 'tophat' }`.
  `worldOf` already caps at the last world, so 101+ stays in Gears; bosses 90 and 100 complete
  their worlds through `completeWorld` as today.
- Introductions, like levels 6–8 do for special tiles: level 81 hands out a minus tile and
  level 91 a coupler through `setup`, which gains an optional `value` (e.g.
  `{ index: 3, special: 'minus', value: 3 }`), so the handed-out tile is a sensible one.
- The difficulty plateau, the sums cycle, bosses and ice stay as they are.

## 2. Interaction and look (app.js, styles.css, sound.js, index.html)

- **Minus tile**: plays like any tile (tap, keyboard or drag to the well). Silver tile, "−3"
  with the usual ink outline. In the ring the last segments empty; a floating "−3"; the
  well's "needs N" updates.
- **Coupler by drag**: picking it up rings valid targets in gold and dims the rest. Dropping on a
  valid tile slides the coupler onto it, and the fused tile pops in with its new number.
  Dropping on the well or an invalid tile sends it home with a shake, and a coach tip says it
  goes onto a tile. Target tiles are measured at drag start (as `dropZone` is for the well).
- **Coupler by tap or keyboard**: tapping it (or Enter) picks it up (lifted look, targets ringed);
  tapping a target (or Tab to it, Enter) fuses; tapping the coupler again or Esc cancels.
- **Sound and Nine**: new `sfx.fuse()` (a metallic click in the C major pentatonic) and
  `sfx.minus()`; Nine hops on a fusion. Reduced motion drops the slides.
- **Accessibility**: labels "Subtract 3" and "Coupler +3: drop it on a tile"; a status message
  announces a fusion ("5 + 3 = 8"); the well keeps announcing the sum. Color shapes give neither
  tile a shape (they have no color).
- **How to play** gets one line per mechanic, shown only once the player has reached its world,
  so the end of the journey is not spoiled.
- **Onboarding** (CLAUDE.md rule): coach tips with the gold ring at levels 81 and 91 (`tutorial`,
  as levels 6, 7, 8 and 11), the help lines above, and the coach tip for a wrong drop.

## 3. World content (rules.js, meta.js, mascot.js, sound.js, styles.css, i18n.js)

- **Themes** `chrome` and `gears` in `meta.THEMES` and the CSS: their `--bg`; they unlock on
  reaching the world and are picked in Customize like the others. Map banners and boss crowns
  come from `WORLDS`.
- **Music**: two `STYLES` with their own `step`, `bpm`, `cutoff` and `level`, like the eight
  existing ones.
- **Wardrobe**: `welder` (face) and `tophat` (head) in `meta.WARDROBE` and as SVG in Nine's
  coordinates in `mascot.js` `ITEMS`; the new-item toast and the result's prize work as today.
- **Texts, all six languages**: theme and item names, the two lesson tips, the wrong-drop tip,
  the fusion announcement, tile labels, the two help lines. "80 levels in 8 worlds" becomes
  "100 levels in 10 worlds" in the home tour (`tour.journey`), the README and the store listing.
- Check that the Customize sheet still fits with two more items and two more themes.

## 4. Bots, balance and testing

- **Bots** (`bot.js`, same draw order as the game):
  - careful: finish with an exact tile; else a fusion that makes an exact tile; else a minus
    tile that opens a fit; else the tile that leaves the most ways to finish (today's rule).
  - normal: finish exactly if it can; else a wild tile; else a finishing fusion, seen half the
    time (it should not play like an expert); else any tile that fits, minus tiles included.
  - Star thresholds (`journeyStars`) follow from the bots, as today.
- **`tools/solve.js <level | from-to>`**: the exhaustive search used to check level 83 becomes a
  tool, extended with minus tiles and fusions. It answers whether a journey board can be won and
  prints a winning line. Documented in CLAUDE.md.
- **Seeds**: `node tools/journey.js 200` re-picks levels 81–200 (1–80 unchanged), still aiming
  for 40 % of typical players (bosses 33 %). Then `tools/solve.js 81-200` must find a win for
  every level.
- **Tuning**: `MINUS_CHANCE` and `COUPLER_CHANCE` so that each mechanic shows up enough to matter
  without taking over the board.
- **Browser checks**: levels 81 and 91 (handed-out tile, tip, gold ring); fusing by drag, tap
  and keyboard, cancelling; dropping in the wrong place; a minus tile on an empty centre (not
  playable); stuck with and without a possible fusion; bosses 90 and 100 (item, theme and music
  switch); Color shapes on; the six languages at 375 px and the four landscape frames; reduced
  motion; no console errors.
- **Docs**: CLAUDE.md (rules, worlds, tools, onboarding locations), README, store listing.

## Out of scope

- The new mechanics in Classic, 60 seconds or the Daily.
- More worlds after Gears.
- More Nine customization (Nine's own color) and themes unlocked by level: a separate feature,
  noted for later.
