# Journey worlds 9 and 10 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add minus tiles (world 9 "Chrome", levels 81–90) and coupler tiles (world 10 "Gears", 91+) to the journey, with their worlds' themes, music, Nine items, bots, tools and balanced boards.

**Architecture:** The rules stay pure in `rules.js` (drawing, playing, fusing, stuck), shared by the game (`app.js`), the simulated players (`bot.js`) and the tools. The bots must play exactly as before when no new tile is on the board, because they set the star thresholds of levels 1–80 and the daily par at runtime, and levels 1–80 were seeded with them. A fixture taken before any change pins that.

**Tech Stack:** Vanilla JS (plain globals in the page, `module.exports` for Node), Node's built-in test runner (`node --test`, no dependencies), Chrome DevTools for browser checks. No build step, no package.json.

**Spec:** `docs/superpowers/specs/2026-10-14-journey-worlds-9-10-design.md`

## Global Constraints

- No external requests and no dependencies: no npm packages; tests use `node:test` and `node:assert`.
- Style: 4-space indent, no semicolons, `const`/`let`, no implicit globals; `localStorage` always in try/catch; user-facing text via `textContent`.
- Every player-facing word goes in `i18n.js` in all six languages (en, es, pt, fr, de, tr); French uses a no-break space (U+00A0) before ! ? : ;. Keys must stay identical across the six dictionaries.
- All game randomness goes through the seeded `rng`; never `Math.random` for game draws.
- Levels 1–80, Classic, 60 seconds and the Daily must not change: same boards, same star thresholds, same par.
- Minus tiles: worth −1…−5; never take the sum below 0; no tile count, no color. Couplers: worth +1…+5; never go to the centre; fuse onto a normal, ×2 or rainbow tile that is not frozen, only if tile + coupler ≤ target; the result keeps color and special; fusing is allowed at any time while playing (not while stuck, resolving or during an ad).
- Mechanics accumulate: minus tiles from level 81, couplers from 91. Journey only.
- Rewards: boss 90 `welder` (face), boss 100 `tophat` (head). The id `goggles` is already the ocean diving mask.
- Layouts to check after UI changes: 375×667, ~1000×780, 640×360, 836×470, 1031×580; none may scroll except the map route and sheets.
- `prefers-reduced-motion` turns motion off; the only looping animation on a tile stays the rainbow shimmer.

## Review Focus

1. **Levels 1–80, Classic, 60 s, Daily unchanged**: boards, `journeyStars` for 1–80, `dailyPar` and Classic bot runs must equal the pre-change fixture (Task 1 takes it, Task 2 asserts it).
2. **A minus tile that the centre can't afford** (empty centre, or sum smaller than its value): refused with a tip, nothing changes (Task 1 `canPlay` tests; Task 5 browser check).
3. **A coupler on the wrong place** (the well, a wild, frozen, minus or coupler tile, or a tile it would push past the target): refused, the coupler goes home, nothing changes (Task 1 `canFuse` tests; Task 6 browser checks).
4. **Stuck with couplers on the board**: couplers never rescue (any tile a fusion could make fit already fits), so stuck means no tile fits; while stuck, tapping or dragging a coupler does nothing and the stuck choices (shuffle, pay, give up, 🎬) work as before (Task 1 `isStuck` tests; Task 6 browser check).
5. **A held coupler while the game moves on** (sum completes, shuffle, pause, leaving, new game, stuck): the selection is dropped, no stale rings or dimmed tiles (Task 6 browser check).

---

## File map

| File | Responsibility in this plan |
|---|---|
| `rules.js` | `drawTile(…, mechanics)`, `tileValue`, `canPlay(tile, need, sum)`, `tilesUsed`, `sumPoints`, `keepsCombo`, `canFuse`, `fuse`, `isStuck`, `applySetup` (`value`), `journeyLevel` (`mechanics`, handouts), `WORLDS` (Task 8), new constants |
| `bot.js` | Action-based players (`{ play: i }` / `{ fuse: [c, t] }`), `simulateRun({ mechanics })`, `journeyStars` passes `mechanics` |
| `tests/fixtures/before-mechanics.json` (new) | Snapshot of bot results and draws before any change |
| `tests/rules.test.js`, `tests/bot.test.js` (new) | Unit and regression tests (`node --test tests/*.test.js`) |
| `tools/solve.js` (new) | Exhaustive winnability check for journey levels |
| `tools/journey.js` | Passes `mechanics` to the bot |
| `app.js` | Minus play, coupler hold/drag/fuse, stuck via `isStuck`, faces/labels, tutorial tips, help lines |
| `styles.css` | Minus and coupler tiles, fusion rings, Chrome and Gears themes |
| `sound.js` | `sfx.minus`, `sfx.fuse`, music styles `chrome` and `gears` |
| `mascot.js`, `meta.js` | `welder` and `tophat` items and their slots |
| `index.html` | Plug icon symbol, two help lines |
| `i18n.js` | All new texts in six languages |
| `CLAUDE.md`, `README.md`, `promo/store-listing.md` | Docs |

---

### Task 1: Rules for minus and coupler tiles (rules.js), with a pre-change fixture

**Files:**
- Create: `tests/fixtures/before-mechanics.json`, `tests/rules.test.js`
- Modify: `rules.js` (constants near `RAINBOW_CHANCE`; `drawTile`; `tileValue`; `canPlay`; `keepsCombo`; `sumPoints`; `applySetup`; `journeyLevel`; `module.exports`)

**Interfaces:**
- Produces:
  - `MINUS_CHANCE = 0.05`, `COUPLER_CHANCE = 0.05`, `MECHANIC_SIZE = 5`
  - `drawTile(lv, rnd, specials = true, mechanics = 0)` → `{ value, color, special? }`; minus/coupler tiles are `{ value: 1..5, color, special: 'minus' | 'coupler' }`
  - `tileValue(tile, need)` → number (−value for minus)
  - `canPlay(tile, need, sum = 0)` → boolean (couplers never; minus only if `value <= sum`)
  - `tilesUsed(parts)` → number of parts that are not minus tiles
  - `sumPoints(parts, lv)` → `{ points, combo, doubles }` (minus parts ignored)
  - `canFuse(coupler, tile, target)` → boolean; `fuse(tile, coupler)` → new tile object `{ ...tile, value: tile.value + coupler.value }`
  - `isStuck(tiles, sum, target)` → boolean (sum > 0 and no tile can go in)
  - `applySetup(tiles, setup)` accepts `{ index, special?, value?, ice? }`
  - `journeyLevel(n).mechanics` → 0 | 1 | 2; level 81 hands out `{ index: 3, special: 'minus', value: 3 }`, level 91 `{ index: 3, special: 'coupler', value: 3 }`

- [ ] **Step 1: Take the fixture with the current code (before touching rules.js or bot.js)**

Run from the repo root:

```bash
mkdir -p tests/fixtures && node -e "
const R = require('./rules.js')
const B = require('./bot.js')
const draws = {}
for (const seed of [1, 42, 2026, -379896306]) for (const lv of [0, 3, 8, 15]) for (const specials of [true, false]) {
    const rnd = R.createRng(seed).random
    draws[seed + ':' + lv + ':' + specials] = Array.from({ length: 40 }, () => R.drawTile(lv, rnd, specials))
}
const stars = Array.from({ length: 80 }, (_, i) => B.journeyStars(R.journeyLevel(i + 1)))
const par = ['2026-10-14', '2026-10-15', '2026-11-01', '2027-01-01', '2027-06-30'].map(d => B.dailyPar(R.hashSeed(d)))
const classic = []
for (const seed of [7, 99, 12345]) for (const player of ['careful', 'normal']) for (const bankAt of [null, 3]) {
    classic.push(B.simulateRun({ seed, sums: 60, levelUps: true, player, playerSeed: seed + 1, bankAt }))
}
require('fs').writeFileSync('tests/fixtures/before-mechanics.json', JSON.stringify({ draws, stars, par, classic }))
console.log('stars', stars.length, 'par', par, 'classic', classic.length)
"
```

Expected: prints `stars 80 par [ … five numbers … ] classic 12` and creates the file.

- [ ] **Step 2: Write the failing rules tests**

Create `tests/rules.test.js`:

```js
// node --test tests/*.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const R = require('../rules.js')
const before = require('./fixtures/before-mechanics.json')

const red = R.COLORS[0], blue = R.COLORS[1]
const tile = (value, extra = {}) => ({ value, color: red, ...extra })

test('draws without mechanics are unchanged', () => {
    for (const [key, list] of Object.entries(before.draws)) {
        const [seed, lv, specials] = key.split(':')
        const rnd = R.createRng(+seed).random
        const now = Array.from({ length: list.length }, () => R.drawTile(+lv, rnd, specials === 'true'))
        assert.deepEqual(now, list, key)
    }
})

test('mechanics 1 draws minus tiles worth 1..5 and never couplers; 2 draws both', () => {
    for (const mechanics of [1, 2]) {
        const rnd = R.createRng(7).random
        const tiles = Array.from({ length: 4000 }, () => R.drawTile(15, rnd, true, mechanics))
        const minus = tiles.filter(t => t.special === 'minus')
        const couplers = tiles.filter(t => t.special === 'coupler')
        assert.ok(minus.length > 100, `minus tiles drawn with mechanics ${mechanics}`)
        assert.ok(minus.every(t => t.value >= 1 && t.value <= 5))
        if (mechanics === 1) assert.equal(couplers.length, 0)
        else {
            assert.ok(couplers.length > 100)
            assert.ok(couplers.every(t => t.value >= 1 && t.value <= 5))
        }
    }
})

test('no specials means no minus or coupler tiles either', () => {
    const rnd = R.createRng(3).random
    const tiles = Array.from({ length: 2000 }, () => R.drawTile(15, rnd, false, 2))
    assert.ok(tiles.every(t => !t.special))
})

test('a minus tile subtracts and needs the sum to afford it', () => {
    const m = tile(3, { special: 'minus' })
    assert.equal(R.tileValue(m, 10), -3)
    assert.equal(R.canPlay(m, 38, 0), false, 'empty centre')
    assert.equal(R.canPlay(m, 36, 2), false, 'sum 2 < 3')
    assert.equal(R.canPlay(m, 35, 3), true, 'sum 3')
    assert.equal(R.canPlay({ ...m, ice: 2 }, 30, 8), false, 'frozen')
})

test('a coupler never goes to the centre; number tiles still follow need', () => {
    assert.equal(R.canPlay(tile(2, { special: 'coupler' }), 30, 8), false)
    assert.equal(R.canPlay(tile(5), 5), true)
    assert.equal(R.canPlay(tile(6), 5), false)
    assert.equal(R.canPlay(tile(9, { special: 'wild' }), 1), true)
})

test('minus tiles do not count as tiles or colors', () => {
    const parts = [tile(20), tile(-3, { special: 'minus', color: blue }), tile(21)]
    assert.equal(R.tilesUsed(parts), 2)
    const { points, combo } = R.sumPoints(parts, 15)
    assert.equal(combo, true, 'two red tiles: the blue minus tile does not break the combo')
    assert.equal(points, 2 * 16 * R.COMBO_MULTIPLIER)
    assert.equal(R.keepsCombo([tile(5)], tile(2, { special: 'minus', color: blue })), true)
})

test('couplers fuse onto number, ×2 and rainbow tiles within the target', () => {
    const c = tile(3, { special: 'coupler' })
    assert.equal(R.canFuse(c, tile(5), 38), true)
    assert.equal(R.canFuse(c, tile(5, { special: 'double' }), 38), true)
    assert.equal(R.canFuse(c, tile(5, { special: 'rainbow' }), 38), true)
    assert.equal(R.canFuse(c, tile(35), 38), true, '35 + 3 = 38 is fine')
    assert.equal(R.canFuse(c, tile(36), 38), false, 'past the target')
    for (const special of ['wild', 'minus', 'coupler']) assert.equal(R.canFuse(c, tile(5, { special }), 38), false, special)
    assert.equal(R.canFuse(c, tile(5, { ice: 2 }), 38), false, 'frozen')
    assert.equal(R.canFuse(tile(3), tile(5), 38), false, 'only couplers fuse')
    assert.deepEqual(R.fuse(tile(5, { special: 'double', color: blue }), c), { value: 8, color: blue, special: 'double' })
})

test('stuck: something in the centre and no tile can go in; couplers never rescue', () => {
    const target = 38
    // sum 30, need 8: tiles too big → stuck, with or without a coupler on the board
    assert.equal(R.isStuck([tile(9), tile(12)], 30, target), true)
    assert.equal(R.isStuck([tile(9), tile(12), tile(3, { special: 'coupler' })], 30, target), true)
    // a tile that fits → not stuck
    assert.equal(R.isStuck([tile(9), tile(5), tile(3, { special: 'coupler' })], 30, target), false)
    // a minus tile the sum can afford → not stuck
    assert.equal(R.isStuck([tile(9), tile(2, { special: 'minus' })], 30, target), false)
    // empty centre is never stuck
    assert.equal(R.isStuck([tile(40)], 0, target), false)
})

test('setup can set a value; levels 81 and 91 hand out their tile; mechanics by level', () => {
    const dealt = [tile(10), tile(11), tile(12), tile(13)]
    R.applySetup(dealt, [{ index: 3, special: 'minus', value: 3 }])
    assert.deepEqual(dealt[3], { value: 3, color: red, special: 'minus' })
    assert.equal(R.journeyLevel(80).mechanics, 0)
    assert.equal(R.journeyLevel(81).mechanics, 1)
    assert.equal(R.journeyLevel(90).mechanics, 1)
    assert.equal(R.journeyLevel(91).mechanics, 2)
    assert.equal(R.journeyLevel(250).mechanics, 2)
    assert.ok(R.journeyLevel(81).setup.some(s => s.special === 'minus' && s.value === 3))
    assert.ok(R.journeyLevel(91).setup.some(s => s.special === 'coupler' && s.value === 3))
    assert.ok(R.journeyLevel(81).setup.some(s => s.ice), 'level 81 still starts with ice')
})
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `node --test tests/rules.test.js`
Expected: the "unchanged" test passes; the others FAIL (`R.tilesUsed is not a function`, `canFuse` undefined, wrong `canPlay` results, `mechanics` undefined).

- [ ] **Step 4: Implement the rules**

In `rules.js`, after the `RAINBOW_CHANCE` line add:

```js
// journey worlds 9 and 10 (levels 81+ and 91+): minus tiles subtract from the sum, couplers
// fuse onto a board tile; both are worth 1…MECHANIC_SIZE
const MINUS_CHANCE = 0.05
const COUPLER_CHANCE = 0.05
const MECHANIC_SIZE = 5
```

Replace `drawTile` with:

```js
// mechanics: 0 none, 1 minus tiles (journey 81+), 2 minus and coupler tiles (journey 91+).
// With mechanics on, every draw also rolls a size, so the stream never depends on what came out;
// with them off the draws are exactly as before.
function drawTile(lv, rnd, specials = true, mechanics = 0) {
    const value = drawValue(lv, rnd)
    const color = drawColor(rnd)
    const roll = rnd()
    const size = mechanics ? 1 + Math.floor(rnd() * MECHANIC_SIZE) : 0
    const base = WILD_CHANCE + DOUBLE_CHANCE + RAINBOW_CHANCE
    const special = !specials ? null
        : roll < WILD_CHANCE ? 'wild'
        : roll < WILD_CHANCE + DOUBLE_CHANCE ? 'double'
        : roll < base ? 'rainbow'
        : mechanics >= 1 && roll < base + MINUS_CHANCE ? 'minus'
        : mechanics >= 2 && roll < base + MINUS_CHANCE + COUPLER_CHANCE ? 'coupler'
        : null
    if (special === 'minus' || special === 'coupler') return { value: size, color, special }
    return special ? { value, color, special } : { value, color }
}
```

Replace `tileValue` and `canPlay` with:

```js
const tileValue = (tile, need) => (tile.special === 'wild' ? need : tile.special === 'minus' ? -tile.value : tile.value)
// can it go into the centre? A coupler never does; a minus tile only while the sum stays at 0 or more
const canPlay = (tile, need, sum = 0) => !tile.ice && tile.special !== 'coupler'
    && (tile.special === 'wild' || (tile.special === 'minus' ? tile.value <= sum : tile.value <= need))
```

Replace `keepsCombo` with (minus tiles have no color):

```js
const keepsCombo = (parts, tile) => anyColor(tile) || tile.special === 'minus'
    || parts.every(p => anyColor(p) || p.special === 'minus' || p.color === tile.color)
```

Replace `sumPoints` with:

```js
// a minus tile is a tool, not a tile that scores: it adds no count and has no color
const tilesUsed = parts => parts.filter(p => p.special !== 'minus').length
function sumPoints(parts, lv) {
    const scored = parts.filter(p => p.special !== 'minus')
    const colored = scored.filter(p => !anyColor(p))
    const combo = scored.length >= 2 && colored.every(p => p.color === (colored[0] || p).color)
    const doubles = scored.filter(p => p.special === 'double').length
    const points = scored.length * (lv + 1) * (combo ? COMBO_MULTIPLIER : 1) * 2 ** doubles
    return { points, combo, doubles }
}

// a coupler fuses onto a number tile on the board (plain, ×2 or rainbow, not frozen) if the
// result stays within the target; the fused tile keeps its color and special
const canFuse = (coupler, tile, target) => coupler.special === 'coupler' && !coupler.ice && !tile.ice
    && (!tile.special || tile.special === 'double' || tile.special === 'rainbow')
    && tile.value + coupler.value <= target
const fuse = (tile, coupler) => ({ ...tile, value: tile.value + coupler.value })

// stuck: something is in the centre and no tile can go in. A fusion never helps here: for it to
// make a tile that fits, the tile it fuses onto would already fit (fusing only adds), so
// "no fusion makes one that can" (the design's wording) is implied
function isStuck(tiles, sum, target) {
    if (sum === 0) return false
    return !tiles.some(t => canPlay(t, target - sum, sum))
}
```

Replace `applySetup` with:

```js
function applySetup(tiles, setup) {
    for (const s of setup) {
        if (s.special) tiles[s.index] = { ...tiles[s.index], special: s.special }
        if (s.value) tiles[s.index] = { ...tiles[s.index], value: s.value }
        if (s.ice) tiles[s.index] = { ...tiles[s.index], ice: s.ice }
    }
}
```

In `journeyLevel(n)`, add to the `level` object after `specials: n >= 6,`:

```js
        mechanics: n >= 91 ? 2 : n >= 81 ? 1 : 0, // minus tiles from 81, couplers from 91
```

and, just before `if (n === 1) {`, add:

```js
    // worlds 9 and 10 each open by handing out their new tile, as levels 6–8 do
    if (n === 81) level.setup.push({ index: 3, special: 'minus', value: 3 })
    if (n === 91) level.setup.push({ index: 3, special: 'coupler', value: 3 })
```

Add to `module.exports`: `MINUS_CHANCE, COUPLER_CHANCE, MECHANIC_SIZE, tilesUsed, canFuse, fuse, isStuck,`.

Update the comment above `journeyLevel` to mention: "Level 81 hands out a minus tile and level 91 a coupler; `mechanics` says which of them can be drawn."

- [ ] **Step 5: Run the tests**

Run: `node --test tests/rules.test.js`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add rules.js tests/rules.test.js tests/fixtures/before-mechanics.json
git commit -m "Rules for minus and coupler tiles, with a fixture of the bots before them"
```

---

### Task 2: Bots that play minus tiles and fuse (bot.js), unchanged without them

**Files:**
- Create: `tests/bot.test.js`
- Modify: `bot.js` (whole file below `PLAYERS`), `tools/journey.js` (`winRate`)

**Interfaces:**
- Consumes: Task 1's `canPlay(tile, need, sum)`, `canFuse`, `fuse`, `isStuck`, `tileValue`, `keepsCombo`, `drawTile(…, mechanics)`.
- Produces:
  - `carefulPick(state)` / `normalPick(state, rnd)` → `{ play: index }` | `{ fuse: [couplerIndex, tileIndex] }` | `null`, where `state = { tiles, next, parts, sum, need, target, plays, fusions }` (`plays`: indices of tiles that can go in; `fusions`: `[c, t]` index pairs that can fuse)
  - `simulateRun({ …, mechanics = 0 })` → `{ score, sums, completed, busts }` (same as before)
  - `journeyStars(def)` passes `def.mechanics`

- [ ] **Step 1: Write the failing bot tests**

Create `tests/bot.test.js`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const R = require('../rules.js')
const B = require('../bot.js')
const before = require('./fixtures/before-mechanics.json')

test('levels 1–80: star thresholds unchanged', () => {
    const now = Array.from({ length: 80 }, (_, i) => B.journeyStars(R.journeyLevel(i + 1)))
    assert.deepEqual(now, before.stars)
})

test('daily par unchanged', () => {
    const dates = ['2026-10-14', '2026-10-15', '2026-11-01', '2027-01-01', '2027-06-30']
    assert.deepEqual(dates.map(d => B.dailyPar(R.hashSeed(d))), before.par)
})

test('classic runs unchanged', () => {
    const now = []
    for (const seed of [7, 99, 12345]) for (const player of ['careful', 'normal']) for (const bankAt of [null, 3]) {
        now.push(B.simulateRun({ seed, sums: 60, levelUps: true, player, playerSeed: seed + 1, bankAt }))
    }
    assert.deepEqual(now, before.classic)
})

const red = R.COLORS[0]
const t = (value, extra = {}) => ({ value, color: red, ...extra })
const state = (tiles, sum, target = 38, parts = []) => {
    const need = target - sum
    return {
        tiles, next: t(4), parts, sum, need, target,
        plays: tiles.map((x, i) => i).filter(i => R.canPlay(tiles[i], need, sum)),
        // [coupler, tile] pairs in the same order simulateRun builds them (coupler index outer)
        fusions: tiles.flatMap((c, i) => tiles.map((x, j) => [i, j])).filter(([a, b]) => a !== b && R.canFuse(tiles[a], tiles[b], target)),
    }
}

test('careful: exact tile first, then a fusion that makes one, then a minus tile that opens one', () => {
    // need 8: an 8 is there
    assert.deepEqual(B.carefulPick(state([t(12), t(8), t(3, { special: 'coupler' }), t(5)], 30)), { play: 1 })
    // need 8: no 8, but coupler +3 onto the 5 makes one
    assert.deepEqual(B.carefulPick(state([t(12), t(9), t(3, { special: 'coupler' }), t(5)], 30)), { fuse: [2, 3] })
    // need 3: no 3, no coupler; −2 then a 5 fits
    assert.deepEqual(B.carefulPick(state([t(12), t(5), t(2, { special: 'minus' })], 35)), { play: 2 })
})

test('normal: finishes exactly, and spots a finishing fusion only sometimes', () => {
    assert.deepEqual(B.normalPick(state([t(12), t(8)], 30), () => 0.9), { play: 1 })
    const s = state([t(12), t(9), t(3, { special: 'coupler' }), t(5)], 30)
    assert.deepEqual(B.normalPick(s, () => 0.1), { fuse: [2, 3] })
    const other = B.normalPick(s, () => 0.9)
    assert.ok(other.play !== undefined, 'missed the fusion: plays a fitting tile instead')
})

test('runs with mechanics finish and use the new tiles', () => {
    let finished = 0
    for (let n = 81; n <= 100; n++) {
        const d = R.journeyLevel(n)
        const run = B.simulateRun({ seed: d.seed, lv: d.lv, sums: d.sums, specials: d.specials, mechanics: d.mechanics, setup: d.setup, player: 'careful' })
        if (run.completed) finished++
    }
    assert.ok(finished >= 10, `careful bot finished ${finished} of levels 81–100`)
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/bot.test.js`
Expected: the three "unchanged" tests PASS (nothing changed yet); `carefulPick`/`normalPick` tests FAIL (`B.carefulPick is not a function`).

- [ ] **Step 3: Rewrite the players and the run loop**

In `bot.js`, replace everything from `// careful: finish the sum …` down to the end of `simulateRun` with:

```js
// The players choose an action from `state` = { tiles, next, parts, sum, need, target, plays,
// fusions }: `plays` are the indices of tiles that can go into the centre, `fusions` the
// [coupler, tile] index pairs that can fuse. They return { play: i }, { fuse: [c, t] } or null.
// With no minus or coupler tiles on the board they play exactly as they did before those
// existed (the star thresholds of levels 1–80 and the daily par depend on it).

// careful: finish with a number tile if one fits exactly (preferring a color combo); else fuse a
// coupler into a tile that fits exactly; use a wild tile to finish a chain of 2+ tiles or when
// nothing else fits; else a minus tile that leaves a tile fitting exactly; otherwise play the
// tile that leaves the most ways to finish, counting the Next tile (minus tiles last)
function carefulPick({ tiles, next, parts, need, plays, fusions }) {
    const numbers = plays.filter(i => tiles[i].special !== 'wild')
    const wild = plays.find(i => tiles[i].special === 'wild')
    const exact = numbers.filter(i => tileValue(tiles[i], need) === need)
    if (exact.length) return { play: exact.find(i => keepsCombo(parts, tiles[i])) ?? exact[0] }
    const finishing = fusions.find(([c, t]) => tiles[t].value + tiles[c].value === need)
    if (finishing) return { fuse: finishing }
    if (wild !== undefined && (parts.length >= 2 || !numbers.length)) return { play: wild }
    const isNumber = o => !o.ice && o.special !== 'minus' && o.special !== 'coupler'
    const opener = numbers.find(i => tiles[i].special === 'minus'
        && tiles.some((o, j) => j !== i && isNumber(o) && o.special !== 'wild' && o.value === need + tiles[i].value))
    if (opener !== undefined) return { play: opener }
    let best, bestScore = -Infinity
    for (const i of numbers) {
        const t = tiles[i]
        const rest = need - tileValue(t, need)
        const others = tiles.map((o, j) => (j === i ? next : o)).filter(o => !o.ice && o.special !== 'coupler')
        const s = others.filter(o => o.special === 'wild' || (o.special !== 'minus' && o.value === rest)).length * 10
            + others.filter(o => o.special !== 'minus' && o.value <= rest).length
            - (t.special === 'minus' ? 1000 : 0)
        if (s > bestScore) { bestScore = s; best = i }
    }
    if (best !== undefined) return { play: best }
    return fusions.length ? { fuse: fusions[0] } : null
}

// normal: finish if a number fits exactly, else a wild tile if there is one, else (half the
// time) a fusion that makes a tile fitting exactly, else any tile that fits, else any fusion
function normalPick({ tiles, need, plays, fusions }, rnd) {
    const exact = plays.find(i => tiles[i].special !== 'wild' && tileValue(tiles[i], need) === need)
    if (exact !== undefined) return { play: exact }
    const wild = plays.find(i => tiles[i].special === 'wild')
    if (wild !== undefined) return { play: wild }
    const finishing = fusions.find(([c, t]) => tiles[t].value + tiles[c].value === need)
    if (finishing && rnd() < 0.5) return { fuse: finishing }
    if (plays.length) return { play: plays[Math.floor(rnd() * plays.length)] }
    return fusions.length ? { fuse: fusions[Math.floor(rnd() * fusions.length)] } : null
}

const PLAYERS = { careful: carefulPick, normal: normalPick }

// Plays one run and returns { score, sums, completed }.
//   seed       board seed (same as the game's)
//   lv         starting difficulty (0-based)
//   sums       how many sums finish the run (Infinity for an open game)
//   levelUps   whether the difficulty rises every SUMS_PER_LEVEL sums (daily) or stays (journey)
//   initial    optional hand-picked { tiles, next } (journey level 1)
//   mechanics  0 none, 1 minus tiles, 2 minus and coupler tiles (journey 81+ / 91+)
//   player     'careful' | 'normal'; `playerSeed` seeds the normal player's choices
//   bankAt     Classic streak rules: sums go into a pot (×1, ×2 … up to STREAK_MAX) that the
//              bot cashes in after `bankAt` sums in a row; getting stuck loses the pot, and
//              a pot still open when the run ends is lost. null = points go straight to the score
// When stuck (or with nothing to do) and no free shuffle, the bot pays only if the shuffle
// costs under a third of its score, otherwise it stops (banks, or fails a journey level).
function simulateRun({ seed, lv = 0, sums = Infinity, levelUps = false, initial = null, specials = true, mechanics = 0, setup = [], player = 'careful', playerSeed = 1, bankAt = null }) {
    const board = createRng(seed).random
    const choice = createRng(playerSeed).random
    const pick = PLAYERS[player]
    const draw = () => drawTile(level, board, specials, mechanics)
    let level = lv
    let tiles = initial ? initial.tiles.map(t => ({ ...t })) : Array.from({ length: 8 }, draw)
    let next = initial ? { ...initial.next } : draw()
    applySetup(tiles, setup)
    let sum = 0, parts = [], score = 0, done = 0, free = 1, paid = 0
    let pot = 0, chain = 0, busts = 0

    for (let moves = 0; moves < 5000 && done < sums; moves++) {
        const target = targetFor(level)
        const need = target - sum
        const plays = tiles.map((t, i) => i).filter(i => canPlay(tiles[i], need, sum))
        const fusions = []
        tiles.forEach((c, i) => tiles.forEach((t, j) => { if (i !== j && canFuse(c, t, target)) fusions.push([i, j]) }))
        const action = isStuck(tiles, sum, target) ? null : pick({ tiles, next, parts, sum, need, target, plays, fusions }, choice)
        if (!action) {
            if (pot) busts++
            pot = 0
            chain = 0
            const cost = shuffleCostFor(level, paid)
            if (free > 0) free--
            else if (score >= cost && cost < score / 3) { score -= cost; paid++ }
            else return { score, sums: done, completed: false, busts }
            tiles = tiles.map(t => (t.ice ? t : draw())) // frozen tiles stay put
            continue
        }
        if (action.fuse) {
            const [c, t] = action.fuse
            tiles[t] = fuse(tiles[t], tiles[c])
            tiles[c] = next
            next = draw()
            continue
        }
        const i = action.play
        const t = tiles[i]
        sum += tileValue(t, need)
        parts.push(t)
        tiles[i] = next
        next = draw()
        if (sum < target) continue

        const { points } = sumPoints(parts, level)
        if (bankAt) {
            chain++
            pot += points * streakMultiplier(chain)
            if (chain >= bankAt) {
                score += pot
                pot = 0
                chain = 0
            }
        } else score += points
        done++
        sum = 0
        parts = []
        tiles = tiles.map(x => (x.ice ? { ...x, ice: x.ice - 1 || undefined } : x)) // each sum thaws the ice a little
        if (levelUps && done < sums && done % SUMS_PER_LEVEL === 0) {
            level++
            if (free < MAX_FREE_SHUFFLES) free++
            next = draw()
        }
    }
    return { score, sums: done, completed: done >= sums, busts }
}
```

In `journeyStars`, change the `base` line to:

```js
    const base = { seed: def.seed, lv: def.lv, sums: def.sums, initial: def.initial, specials: def.specials, mechanics: def.mechanics, setup: def.setup }
```

Change the Node export at the bottom to `module.exports = { simulateRun, journeyStars, dailyPar, carefulPick, normalPick }`.

In `tools/journey.js`, `winRate`: add `mechanics: def.mechanics,` to the `simulateRun({ … })` options.

- [ ] **Step 4: Run all tests**

Run: `node --test tests/*.test.js`
Expected: all PASS, including the three "unchanged" tests. If an "unchanged" test fails, the no-mechanics path differs from the old bot: compare action order (tile index order, first maximum wins) and when `rnd()` is consumed (only in the random-play branch and, with a finishing fusion present, the 50 % roll).

- [ ] **Step 5: Commit**

```bash
git add bot.js tools/journey.js tests/bot.test.js
git commit -m "Bots play minus tiles and fuse couplers, and play as before without them"
```

---

### Task 3: tools/solve.js, the winnability check

**Files:**
- Create: `tools/solve.js`

**Interfaces:**
- Consumes: `journeyLevel`, `drawTile`, `applySetup`, `canPlay`, `canFuse`, `fuse`, `isStuck`, `tileValue`, `sumPoints`, `shuffleCostFor`, `targetFor`, `createRng`, `JOURNEY_SEEDS`, `COLORS`, `anyColor` (rules.js); `simulateRun` (bot.js).
- Produces: CLI `node tools/solve.js <n | from-to> [nodes]`; one line per level: `<n>: WIN (score S) <line>` or `<n>: NO WIN (exhaustive)` or `<n>: unknown after N nodes`; exit code 1 if any level has no win.

- [ ] **Step 1: Write the tool**

Create `tools/solve.js`:

```js
// Can a journey level be won? Exhaustive search over every play, fusion and shuffle.
// Run with: node tools/solve.js 83   or   node tools/solve.js 81-200 [nodes per level]
// A journey board is fixed: every tile comes from the level's seed in a fixed order whatever
// the player does, so the draws are a precomputed stream. Prints a winning line per level;
// exits with 1 if some level has none.
const R = require('../rules.js')
Object.assign(globalThis, R)

const [from, to] = (process.argv[2] || '').split('-').map(Number)
const budget = +(process.argv[3] || 300000)
if (!from) {
    console.log('usage: node tools/solve.js <level | from-to> [nodes]')
    process.exit(2)
}

function solve(n) {
    const def = journeyLevel(n)
    const lv = def.lv
    const target = targetFor(lv)
    const rnd = createRng(def.seed).random
    const stream = []
    const draw = k => { while (stream.length <= k) stream.push(drawTile(lv, rnd, def.specials, def.mechanics)); return { ...stream[k] } }
    const tiles0 = def.initial ? def.initial.tiles.map(t => ({ ...t })) : Array.from({ length: 8 }, (_, i) => draw(i))
    let idx0 = def.initial ? 0 : 8
    const next0 = def.initial ? { ...def.initial.next } : draw(idx0++)
    applySetup(tiles0, def.setup)

    const face = t => (t.special === 'wild' ? '★' : t.special === 'minus' ? `−${t.value}` : t.special === 'coupler' ? `+${t.value}` : `${t.value}`)
    const key = s => s.tiles.map(t => `${face(t)}${t.special ? t.special[0] : ''}${t.ice || ''}${COLORS.indexOf(t.color)}`).join(',')
        + `|${face(s.next)}|${s.idx}|${s.sum}|${s.done}|${s.free}|${s.paid}|${s.score}|${s.parts.map(p => (anyColor(p) || p.special === 'minus' ? '*' : COLORS.indexOf(p.color))).join('')}`
    const seen = new Set()
    let nodes = 0, win = null

    function search(s, line) {
        if (win || nodes++ > budget) return
        if (s.done >= def.sums) { win = { score: s.score, line }; return }
        const k = key(s)
        if (seen.has(k)) return
        seen.add(k)
        const need = target - s.sum
        if (!isStuck(s.tiles, s.sum, target)) {
            // plays, finishing ones first
            const plays = s.tiles.map((t, i) => i).filter(i => canPlay(s.tiles[i], need, s.sum))
                .sort((a, b) => (tileValue(s.tiles[b], need) === need) - (tileValue(s.tiles[a], need) === need))
            for (const i of plays) {
                const t = s.tiles[i]
                const tiles = s.tiles.slice()
                tiles[i] = s.next
                const parts = [...s.parts, t]
                const sum = s.sum + tileValue(t, need)
                const out = { tiles, next: draw(s.idx), idx: s.idx + 1, sum, parts, score: s.score, done: s.done, free: s.free, paid: s.paid }
                if (sum === target) {
                    out.score += sumPoints(parts, lv).points
                    out.done++
                    out.sum = 0
                    out.parts = []
                    out.tiles = tiles.map(x => (x.ice ? { ...x, ice: x.ice - 1 || undefined } : x))
                }
                search(out, [...line, `${face(t)}${sum === target ? ' =' : ''}`])
                if (win) return
            }
            // fusions
            for (let c = 0; c < 8; c++) for (let j = 0; j < 8; j++) {
                if (c === j || !canFuse(s.tiles[c], s.tiles[j], target)) continue
                const tiles = s.tiles.slice()
                tiles[j] = fuse(tiles[j], tiles[c])
                tiles[c] = s.next
                search({ ...s, tiles, next: draw(s.idx), idx: s.idx + 1 }, [...line, `${face(s.tiles[c])}→${face(s.tiles[j])}`])
                if (win) return
            }
        }
        // shuffle: free first, then paid if affordable
        const cost = shuffleCostFor(lv, s.paid)
        if (s.free > 0 || s.score >= cost) {
            let idx = s.idx
            const tiles = s.tiles.map(t => (t.ice ? t : draw(idx++)))
            const paid = s.free === 0
            search({ ...s, tiles, idx, free: paid ? 0 : s.free - 1, paid: paid ? s.paid + 1 : s.paid, score: paid ? s.score - cost : s.score }, [...line, paid ? `shuffle(−${cost})` : 'shuffle'])
        }
    }

    search({ tiles: tiles0, next: next0, idx: idx0, sum: 0, parts: [], score: 0, done: 0, free: 1, paid: 0 }, [])
    return win ? `${n}: WIN (score ${win.score}) ${win.line.join(' ')}`
        : nodes > budget ? `${n}: unknown after ${budget} nodes`
        : `${n}: NO WIN (exhaustive)`
}

let failed = false
for (let n = from; n <= (to || from); n++) {
    const out = solve(n)
    if (!out.includes('WIN (')) failed = true
    console.log(out)
}
process.exit(failed ? 1 : 0)
```

- [ ] **Step 2: Run it on known levels**

Run: `node tools/solve.js 1-5 && node tools/solve.js 83`
Expected: five `WIN` lines for 1–5 and a `WIN` line for 83 (moves like `12 26 =`; fusions show as `+3→5`), exit code 0.

Run: `node tools/solve.js 91`
Expected: a `WIN` line; often it contains a fusion such as `+3→…`.

- [ ] **Step 3: Commit**

```bash
git add tools/solve.js
git commit -m "Add tools/solve.js: is a journey level winnable, with minus tiles and couplers"
```

---

### Task 4: Tune the chances and re-pick boards 81–200

**Files:**
- Modify: `rules.js` (`MINUS_CHANCE`, `COUPLER_CHANCE` only if the measurement asks for it; `JOURNEY_SEEDS` 81–200)

- [ ] **Step 1: Measure how often the new tiles show up and get used**

Run:

```bash
node -e "
Object.assign(globalThis, require('./rules.js'))
for (const [from, to] of [[81, 90], [91, 100]]) {
    let minus = 0, coupler = 0, draws = 0
    for (let n = from; n <= to; n++) {
        const d = journeyLevel(n), rnd = createRng(d.seed).random
        for (let k = 0; k < 30; k++) { const t = drawTile(d.lv, rnd, d.specials, d.mechanics); draws++; if (t.special === 'minus') minus++; if (t.special === 'coupler') coupler++ }
    }
    console.log(from + '-' + to, 'per 30 draws: minus', (minus / 10).toFixed(2), 'coupler', (coupler / 10).toFixed(2))
}"
```

Expected: about 1.5 minus tiles per 30 draws in 81–90, and about 1.5 of each in 91–100. Keep 0.05 if each is between 1 and 2.5; otherwise adjust the constant by steps of 0.01 and rerun. If a constant changes, run `node --test tests/*.test.js` again (the draws-without-mechanics test must still pass).

- [ ] **Step 2: Re-pick the boards**

Run: `node tools/journey.js 200 > /tmp/journey200.txt` (takes a few minutes).
Then check that 1–80 are unchanged and 81–200 hit their goal:

```bash
node -e "
const R = require('./rules.js')
const txt = require('fs').readFileSync('/tmp/journey200.txt', 'utf8')
const seeds = JSON.parse(txt.match(/const JOURNEY_SEEDS = (\[.*\])/)[1])
console.log('1-80 unchanged:', seeds.slice(0, 80).every((s, i) => s === R.JOURNEY_SEEDS[i]))
const rows = [...txt.matchAll(/│\s*\d+\s*│\s*(\d+)\s*│\s*\d+\s*│\s*\d+\s*│\s*'(\d+)%'\s*│\s*'(\d+)%'/g)].map(m => ({ n: +m[1], goal: +m[2], got: +m[3] }))
console.log('81-200 more than 6 points off:', rows.filter(r => r.n > 80 && Math.abs(r.got - r.goal) > 6).map(r => r.n + ':' + r.got + '/' + r.goal).join(' ') || 'none')
require('fs').writeFileSync('/tmp/seeds200.json', JSON.stringify(seeds))"
```

Expected: `1-80 unchanged: true` and at most a handful of levels more than 6 points off.

- [ ] **Step 3: Paste the seeds**

```bash
python3 - <<'EOF'
import json
seeds = json.load(open('/tmp/seeds200.json'))
p = 'rules.js'; s = open(p, encoding='utf-8').read()
start = s.index('const JOURNEY_SEEDS = [')
end = s.index(']', start) + 1
lines = ['    ' + ', '.join(str(x) for x in seeds[i:i + 6]) + ',' for i in range(0, len(seeds), 6)]
s = s[:start] + 'const JOURNEY_SEEDS = [\n' + '\n'.join(lines) + '\n]' + s[end:]
open(p, 'w', encoding='utf-8').write(s)
EOF
```

- [ ] **Step 4: Every level must be winnable**

Run: `node tools/solve.js 81-200 > /tmp/solve.txt; echo exit $?; grep -v 'WIN (' /tmp/solve.txt`
Expected: `exit 0` and no output from the grep. For any `unknown` line, rerun that level with a bigger budget (`node tools/solve.js <n> 3000000`). For a `NO WIN` at level L: in `tools/journey.js` temporarily change `candidatesFor` to `n => (n <= 80 ? 40 : n === L ? 400 : 160)`, rerun Step 2 and Step 3 (only level L's seed changes), check L again with `tools/solve.js`, and commit `tools/journey.js` with that exception and a comment saying why, so a later rerun reproduces the same seeds.

- [ ] **Step 5: Run the tests and commit**

Run: `node --test tests/*.test.js` → all PASS.

```bash
git add rules.js tools/journey.js
git commit -m "Re-pick journey boards 81-200 with minus tiles and couplers"
```

---

### Task 5: Minus tiles in the game

**Files:**
- Modify: `app.js` (`randomTile`, new `mechanicsOn`, new `faceOf`, `renderTile`, `paintNext`, queue label in `render`, ring colors in `render`, `play`, `completeSum`, `checkStuck`, `tutorial`)
- Modify: `styles.css` (minus tile look), `sound.js` (`sfx.minus`), `i18n.js` (6 languages)

**Interfaces:**
- Consumes: Task 1 (`canPlay(tile, need, sum)`, `tileValue`, `tilesUsed`, `isStuck`, `journeyLevel(n).mechanics`).
- Produces: `mechanicsOn()` → 0 | 1 | 2; `faceOf(tile)` → string (`'★'`, `'−3'`, `'+3'` or the number); CSS classes `.is-minus`, `.is-coupler` (set by `renderTile`/`paintNext`); `sfx.minus()`; i18n keys `tile.minus`, `tut.minus`, `coach.minusEmpty`, `tile.coupler`. A coupler tapped in the centre only shakes until Task 6.

- [ ] **Step 1: Draws follow the level's mechanics**

In `app.js` replace the `randomTile` line with:

```js
const mechanicsOn = () => (mode === 'journey' ? journeyDef.mechanics : 0)
const randomTile = () => drawTile(level, rng, specialsOn(), mechanicsOn())
```

- [ ] **Step 2: Faces and labels**

Add above `renderTile`:

```js
// what a tile shows: its number, ★ for a wild tile, −n / +n for minus and coupler tiles
const faceOf = t => (t.special === 'wild' ? '★' : t.special === 'minus' ? `−${t.value}` : t.special === 'coupler' ? `+${t.value}` : String(t.value))
```

In `renderTile`, replace `el.textContent = wild ? '★' : tile.value` with `el.textContent = faceOf(tile)`; add after the `is-rainbow` toggle:

```js
    el.classList.toggle('is-minus', tile.special === 'minus')
    el.classList.toggle('is-coupler', tile.special === 'coupler')
```

replace the `colored` line with:

```js
    const colored = id && !wild && !['rainbow', 'minus', 'coupler'].includes(tile.special) && !(tile.ice > 0)
```

and in the `aria-label` chain, insert before `: tile.special === 'double'`:

```js
        : tile.special === 'minus' ? tr('tile.minus', { n: tile.value })
        : tile.special === 'coupler' ? tr('tile.coupler', { n: tile.value })
```

In `paintNext`, replace the body with:

```js
function paintNext(el, t) {
    const wild = t.special === 'wild'
    el.textContent = faceOf(t)
    el.dataset.n = el.textContent
    el.classList.toggle('is-wild', wild)
    el.classList.toggle('is-rainbow', t.special === 'rainbow')
    el.classList.toggle('is-minus', t.special === 'minus')
    el.classList.toggle('is-coupler', t.special === 'coupler')
    el.style.setProperty('--tile', wild ? WILD_COLOR : t.color)
    const id = colorId(t.color)
    if (id && !wild && !['rainbow', 'minus', 'coupler'].includes(t.special)) el.insertAdjacentHTML('beforeend', markSvg(id))
}
```

In `render`, replace the queue label line with:

```js
    queueEl.setAttribute('aria-label', tr('aria.queue', { list: queue.map(faceOf).join(', ') }))
```

- [ ] **Step 3: The ring takes a minus tile's points back off the end**

In `render`, replace the `const colors = parts.flatMap(…)` line and its comment with:

```js
    // one ring segment per point, coloured by the tile that supplied it (a rainbow tile cycles
    // colours); a minus tile takes its points back off the end
    const colors = []
    for (const p of parts) {
        if (p.special === 'minus') colors.length = Math.max(0, colors.length + p.value)
        else for (let i = 0; i < p.value; i++) colors.push(p.special === 'rainbow' ? COLORS[i % COLORS.length] : p.color)
    }
```

(`parts` stores a minus tile with its negative `tileValue`, see Step 4.)

- [ ] **Step 4: Playing a minus tile**

In `play(tile)`, right after the `if (tile.ice) { … }` block, add:

```js
    // couplers never go to the centre (Task 6 replaces this with picking them up)
    if (tile.special === 'coupler') {
        bump(tile.el, 'shake')
        return
    }
    // a minus tile needs a sum that can afford it
    if (tile.special === 'minus' && tile.value > sum) {
        bump(tile.el, 'shake')
        sfx.stuck()
        coachSay(tr('coach.minusEmpty', { n: tile.value }), 3500)
        return
    }
```

Then replace from `if (tile.special === 'wild') floatText(…)` down to `sfx.add(sum / goal)` with:

```js
    if (tile.special === 'wild') floatText(well, tr('float.wild'), 'is-combo')
    const minus = tile.special === 'minus'
    if (minus) floatText(well, faceOf(tile))
    setTile(tile, takeNext())

    if (sum === goal) return completeSum()

    if (minus) sfx.minus()
    else sfx.add(sum / goal)
```

- [ ] **Step 5: Sums count only scoring tiles; stuck uses the shared rule**

In `completeSum`, add `const used = tilesUsed(parts)` after the `sumPoints` line and replace the four uses of `parts.length` (`chainLog.push`, `bestChain`, the `chains4` mission, `sfx.complete`) with `used`.

In `checkStuck`, replace `stuck = !tiles.some(t => canPlay(t, need))` with:

```js
    stuck = isStuck(tiles, sum, target())
```

- [ ] **Step 6: The lesson at level 81**

In `tutorial(event)`, extend the two maps:

```js
    const later = { 6: 'tut.wild', 7: 'tut.double', 8: 'tut.rainbow', 11: 'tut.ice', 81: 'tut.minus' }
```

```js
            const special = { 6: t => t.special === 'wild', 7: t => t.special === 'double', 8: t => t.special === 'rainbow', 11: t => t.ice > 0, 81: t => t.special === 'minus' }[n]
```

- [ ] **Step 7: Look and sound**

In `styles.css`, after the `.tile.is-rainbow { box-shadow: … }` rule, add:

```css
/* minus: muted silver with a fixed metallic sheen (no motion), the number in dark steel */
.tile.is-minus, .next-tile.is-minus {
    --tile: #4f5a6e;
    background: linear-gradient(155deg, #f6f8fb 0%, #c8cfda 42%, #eef2f6 52%, #a9b2c1 100%);
}
.tile.is-minus { box-shadow: -4px 6px 0 var(--ink), inset 0 0 0 5px rgba(255, 255, 255, 0.55); }
```

In `sound.js`, after the `add: effect(…)` entry, add:

```js
        // a minus tile takes from the sum: a short falling step
        minus: effect(() => {
            tone(note(6), { type: 'triangle', dur: 0.1, vol: 0.25 })
            tone(note(4), { type: 'triangle', dur: 0.14, vol: 0.22, at: 0.07 })
            buzz(8)
        }),
```

- [ ] **Step 8: Texts (six languages)**

Run this to add the keys after each dictionary's `'tile.add'` line (dictionaries are in the order en, es, pt, fr, de, tr):

```bash
python3 - <<'EOF'
NB = ' '
T = [
    ('Subtract {n}', 'Minus tiles take away from the sum: use one to make room when nothing fits.', 'A minus tile needs at least {n} in the middle.', 'Coupler +{n}: drop it on a tile'),
    ('Restar {n}', 'Las fichas que restan quitan de la suma: úsalas para hacer hueco cuando nada encaja.', 'Una ficha que resta necesita al menos {n} en el centro.', 'Acople +{n}: suéltalo sobre una ficha'),
    ('Subtrair {n}', 'As peças que subtraem tiram da soma: use uma para abrir espaço quando nada encaixa.', 'Uma peça que subtrai precisa de pelo menos {n} no centro.', 'Acoplador +{n}: solte sobre uma peça'),
    ('Retirer {n}', f'Les tuiles qui retirent enlèvent de la somme{NB}: sers-t’en pour faire de la place quand rien ne va.', 'Une tuile qui retire a besoin d’au moins {n} au centre.', f'Raccord +{{n}}{NB}: pose-le sur une tuile'),
    ('{n} abziehen', 'Minus-Steine ziehen von der Summe ab: Nutze sie, um Platz zu schaffen, wenn nichts passt.', 'Ein Minus-Stein braucht mindestens {n} in der Mitte.', 'Kupplung +{n}: auf einen Stein legen'),
    ('{n} çıkar', 'Eksi taşlar toplamdan düşer: hiçbir taş uymadığında yer açmak için kullan.', 'Eksi taş için ortada en az {n} olmalı.', 'Bağlantı +{n}: bir taşın üstüne bırak'),
]
p = 'i18n.js'; lines = open(p, encoding='utf-8').read().split('\n'); out = []; k = 0
for line in lines:
    out.append(line)
    if "'tile.add': " in line:
        ind = line[:len(line) - len(line.lstrip())]
        a, b, c, d = T[k]; k += 1
        out.append(f'{ind}\'tile.minus\': "{a}", \'tut.minus\': "{b}", \'coach.minusEmpty\': "{c}", \'tile.coupler\': "{d}",')
assert k == 6, k
open(p, 'w', encoding='utf-8').write('\n'.join(out))
EOF
```

Check the dictionaries still match:

```bash
node -e "
const src = require('fs').readFileSync('i18n.js', 'utf8')
const S = eval('(' + src.match(/const STRINGS = (\{[\s\S]*?\n    \})\n/)[1] + ')')
const en = Object.keys(S.en)
for (const l of Object.keys(S)) { const k = Object.keys(S[l]); console.log(l, k.length, en.filter(x => !k.includes(x)).join(',') || '-', k.filter(x => !en.includes(x)).join(',') || '-') }"
```

Expected: six lines with the same count and `- -`.

- [ ] **Step 9: Check in the browser**

Open `index.html` (file:// is fine) with DevTools at 375×667 and run in the console:

```js
localStorage.setItem('plus9.onboarded', '1'); localStorage.setItem('plus9.tour', '1')
await startGame('journey', 81)
```

Expected: tile 4 (index 3) shows "−3" in silver with a gold ring and the coach says the minus lesson; no color shape on it even with Color shapes on.

Then:

```js
const m = tiles.find(t => t.special === 'minus'); play(m); [sum, m.el.classList.contains('shake') || 'refused']
```

Expected: `[0, …]`: refused on an empty centre, with the "needs at least 3" tip.

```js
play(tiles.find(t => !t.special && !t.ice && t.value >= 5 && t.value < 38)); const s0 = sum; play(tiles.find(t => t.special === 'minus')); [s0, sum]
```

Expected: `sum` is `s0 − 3`; the ring loses its last 3 segments; a "−3" floats; the falling sound plays.

Also confirm with `startGame('classic')` that no minus tile ever appears (`tiles.some(t => t.special === 'minus')` is `false` after a few shuffles), and that the console shows no errors.

- [ ] **Step 10: Commit**

```bash
git add app.js styles.css sound.js i18n.js
git commit -m "Minus tiles in the journey from level 81"
```

---

### Task 6: Couplers in the game (hold, drag, fuse)

**Files:**
- Modify: `app.js` (new state `holding`; new `fusionTargets`, `holdCoupler`, `dropHold`, `fuseInto`; `play`; `attachInput`; `newGame`; `shuffle`; `checkStuck`; `completeSum`; `leaveGame`; `openSettings`; keydown handler; `tutorial`)
- Modify: `index.html` (plug icon), `styles.css` (coupler look, rings, dimming), `sound.js` (`sfx.fuse`), `i18n.js` (6 languages)

**Interfaces:**
- Consumes: Task 1 `canFuse`, `fuse`, `isStuck`; Task 5 `faceOf`, `.is-coupler` class (set by `renderTile`), `tile.coupler` label key (added here).
- Produces: `holding` (tile | null); `holdCoupler(tile)`, `dropHold()`, `fuseInto(coupler, tile)`, `markFusion(coupler, on)`, `zoneOf(el)`; CSS classes `.is-held`, `.is-fuse-target`, `.is-dimmed`; `sfx.fuse()`; i18n keys `tut.coupler`, `coach.couplerWhere`, `coach.couplerPick`, `coach.couplerNone`.

- [ ] **Step 1: Hold and fuse**

Add after `let bestCash = 0`:

```js
let holding = null    // the coupler picked up by tap or keyboard, waiting for a tile to fuse onto
```

Add after `function checkStuck() { … }`:

```js
// ---------- couplers ----------

const fusionTargets = coupler => tiles.filter(t => t !== coupler && canFuse(coupler, t, target()))

function markFusion(coupler, on) {
    const targets = on ? fusionTargets(coupler) : []
    for (const t of tiles) {
        t.el.classList.toggle('is-held', on && t === coupler)
        t.el.classList.toggle('is-fuse-target', targets.includes(t))
        t.el.classList.toggle('is-dimmed', on && t !== coupler && !targets.includes(t))
    }
    return targets
}

// tap or Enter on a coupler picks it up; the tiles it can fuse onto are ringed
function holdCoupler(tile) {
    if (holding === tile) return dropHold()
    dropHold()
    if (!markFusion(tile, true).length) {
        markFusion(tile, false)
        bump(tile.el, 'shake')
        sfx.stuck()
        coachSay(tr('coach.couplerNone', { n: tile.value, target: target() }), 3500)
        return
    }
    holding = tile
    sfx.lift()
    coachSay(tr('coach.couplerPick'), 4000)
}

function dropHold() {
    if (!holding) return
    markFusion(holding, false)
    holding = null
}

// the coupler fuses onto the tile; its slot takes Next, like playing a tile
function fuseInto(coupler, tile) {
    if (!canFuse(coupler, tile, target())) {
        bump(tile.el, 'shake')
        sfx.stuck()
        return
    }
    dropHold()
    platform.gameplayStart()
    const a = tile.value, b = coupler.value
    setTile(tile, fuse(tile, coupler))
    setTile(coupler, takeNext())
    coachSay(`${a} + ${b} = ${a + b}`, 1500) // the coach is a status region: read out too
    sfx.fuse()
    mascot.hop()
    render()
    checkStuck()
}
```

In `play(tile)`, right after the first guard line (`if (!playing || resolving || stuck || platform.adShowing) return`), add:

```js
    if (holding) return tile === holding ? dropHold() : fuseInto(holding, tile)
    if (tile.special === 'coupler') return holdCoupler(tile)
```

and delete Task 5's temporary guard (`// couplers never go to the centre (Task 6 replaces this …)` and its `if` block).

Drop a held coupler whenever the game moves on: add `dropHold()` as the first line of `newGame()`, `shuffle()` (after its guard), `completeSum()`, `leaveGame()` and `openSettings()` (after its guard), and in `checkStuck()` right after `if (!stuck) return`.

In the keydown handler, before the line that opens the pause menu on Escape, add:

```js
    if (key === 'escape' && holding) {
        ev.preventDefault()
        return dropHold()
    }
```

- [ ] **Step 2: Drag a coupler onto a tile**

In `attachInput(tile)`, change `lift()` so a coupler measures its targets instead of the well, `place()` and `end` so they use them, and `land()` so a fusion slides onto the tile:

```js
    function lift() {
        dropHold() // a coupler picked up by tap gives way to the tile being dragged
        const rect = el.getBoundingClientRect()
        const ghost = el.cloneNode(true)
        ghost.classList.add('ghost')
        ghost.classList.remove('pop-in', 'hint', 'is-held')
        ghost.removeAttribute('aria-label')
        ghost.setAttribute('aria-hidden', 'true')
        Object.assign(ghost.style, { width: `${rect.width}px`, height: `${rect.height}px`, left: `${rect.left}px`, top: `${rect.top}px` })
        drag.ghost = ghost
        drag.tilt = 0
        drag.lastX = drag.x
        drag.zone = dropZone()
        // a coupler goes onto a tile: measure the ones it can fuse onto, at drag start
        drag.targets = tile.special === 'coupler' ? markFusion(tile, true).map(t => ({ tile: t, zone: zoneOf(t.el) })) : null
        place() // born under the pointer, not one frame late at the tile's spot
        document.body.appendChild(ghost)
        el.classList.add('lifted')
        sfx.lift()
    }

    // the fusion target under the pointer, if any
    const targetAt = (d, x, y) => (d.targets || []).find(o => inZone(o.zone, x, y)) || null

    // put the floating tile under the pointer, tilted towards the motion
    function place() {
        const dx = drag.x - drag.startX, dy = drag.y - drag.startY
        const hit = drag.targets ? targetAt(drag, drag.x, drag.y) : null
        const over = drag.targets ? !!hit : inZone(drag.zone, drag.x, drag.y)
        drag.ghost.style.transform = `translate3d(${dx}px, ${dy}px, 0) rotate(${drag.tilt.toFixed(2)}deg) scale(${over ? 0.92 : 1.08})`
        if (drag.targets) for (const o of drag.targets) o.tile.el.classList.toggle('is-target', o === hit)
        else well.classList.toggle('is-target', over)
    }
```

Replace `end` with:

```js
    const end = ev => {
        if (!drag) return
        const d = drag
        drag = null
        cancelAnimationFrame(d.frame)
        if (!d.ghost) return
        suppressClick = true // the click that follows a drag is not a tap
        if (ev.type === 'pointerup') { d.x = ev.clientX; d.y = ev.clientY }
        well.classList.remove('is-target')
        if (d.targets) {
            const hit = ev.type === 'pointerup' ? targetAt(d, d.x, d.y) : null
            for (const o of d.targets) o.tile.el.classList.remove('is-target')
            markFusion(tile, false)
            if (hit) d.zone = hit.zone // slide onto the tile
            land(d, !!hit)
            if (hit) fuseInto(tile, hit.tile)
            else if (ev.type === 'pointerup' && inZone(d.zone, d.x, d.y)) {
                bump(el, 'shake')
                coachSay(tr('coach.couplerWhere'), 3500)
            }
            return
        }
        const dropped = ev.type === 'pointerup' && inZone(d.zone, d.x, d.y)
        land(d, dropped)
        if (dropped) play(tile)
    }
```

(`land` already slides the ghost to `d.zone` when dropped, so pointing `d.zone` at the target tile makes it settle on that tile.)

Add after `dropZone()`:

```js
// a tile's drop area for a coupler: the tile's own circle, measured at drag start
function zoneOf(el) {
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 }
}
```

In `pointerdown`, also bail out while the game is stuck or resolving so a drag can't start a fusion then: change `if (!playing || ev.button !== 0 || drag) return` to `if (!playing || resolving || stuck || ev.button !== 0 || drag) return`.

- [ ] **Step 3: The lesson at level 91**

In `tutorial(event)`, extend both maps with `91: 'tut.coupler'` and `91: t => t.special === 'coupler'`.

- [ ] **Step 4: Look and sound**

In `index.html`, add to the icon sprite (after `#i-back`):

```html
        <symbol id="i-plug" viewBox="0 0 24 24"><path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4" /></symbol>
```

In `renderTile`, after the ×2 badge line, add:

```js
    if (tile.special === 'coupler') el.insertAdjacentHTML('beforeend', '<span class="tile-badge is-plug" aria-hidden="true"><svg><use href="#i-plug" /></svg></span>')
```

In `styles.css`, after the minus tile rules, add:

```css
/* coupler: bronze with a fixed sheen and a plug badge; it never goes to the centre */
.tile.is-coupler, .next-tile.is-coupler {
    --tile: #6e3f16;
    background: linear-gradient(155deg, #ffe6c2 0%, #dca061 42%, #ffdcab 52%, #b9752f 100%);
}
.tile.is-coupler { box-shadow: -4px 6px 0 var(--ink), inset 0 0 0 5px rgba(255, 236, 205, 0.6); }
.tile-badge.is-plug { display: grid; place-items: center; padding: 0.15em; background: #b9752f; transform: none; }
.tile-badge.is-plug svg { width: 1em; height: 1em; fill: none; stroke: var(--paper); stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
/* fusing: the picked-up coupler lifts, the tiles it can fuse onto are ringed, the rest dim */
.tile.is-held { transform: translate(1px, -6px) scale(1.06); box-shadow: -6px 12px 0 var(--ink); }
.tile.is-fuse-target { box-shadow: 0 0 0 6px var(--gold), -4px 6px 0 6px var(--ink); }
.tile.is-fuse-target.is-target { transform: scale(1.08); }
.tile.is-dimmed { opacity: 0.45; }
```

In `sound.js`, after the `minus` effect, add:

```js
        // a coupler snaps onto a tile: a metallic click and a bright ping
        fuse: effect(() => {
            tone(note(12), { type: 'square', dur: 0.03, vol: 0.12 })
            tone(note(14) * 2, { type: 'sine', dur: 0.18, vol: 0.14, at: 0.03 })
            buzz([10, 20, 10])
        }),
```

- [ ] **Step 5: Texts (six languages)**

```bash
python3 - <<'EOF'
NB = ' '
T = [
    ('Couplers never go in the middle: drop one on a tile to add to it.', 'Couplers go onto a tile, not in the middle.', 'Now tap the tile to add it to.', 'No tile can take +{n} without going over {target}.'),
    ('Las fichas acople nunca van al centro: suelta una sobre otra ficha para sumársela.', 'Las fichas acople van sobre una ficha, no al centro.', 'Ahora toca la ficha a la que sumarla.', 'Ninguna ficha admite +{n} sin pasar de {target}.'),
    ('As peças acopladoras nunca vão para o centro: solte uma sobre outra peça para somar.', 'As peças acopladoras vão sobre uma peça, não no centro.', 'Agora toque na peça para somar.', 'Nenhuma peça aceita +{n} sem passar de {target}.'),
    (f'Les raccords ne vont jamais au centre{NB}: pose-en un sur une tuile pour l’ajouter.', 'Un raccord se pose sur une tuile, pas au centre.', 'Touche maintenant la tuile à laquelle l’ajouter.', 'Aucune tuile ne peut prendre +{n} sans dépasser {target}.'),
    ('Kupplungen kommen nie in die Mitte: Leg eine auf einen Stein, um sie dazuzuzählen.', 'Kupplungen gehören auf einen Stein, nicht in die Mitte.', 'Tippe jetzt den Stein an, zu dem sie dazukommt.', 'Kein Stein verträgt +{n}, ohne über {target} zu kommen.'),
    ('Bağlantılar asla ortaya gitmez: eklemek için birini bir taşın üstüne bırak.', 'Bağlantılar ortaya değil, bir taşın üstüne gider.', 'Şimdi ekleyeceğin taşa dokun.', 'Hiçbir taş {target} sayısını aşmadan +{n} alamaz.'),
]
p = 'i18n.js'; lines = open(p, encoding='utf-8').read().split('\n'); out = []; k = 0
for line in lines:
    out.append(line)
    if "'tile.minus': " in line:
        ind = line[:len(line) - len(line.lstrip())]
        b, c, d, e = T[k]; k += 1
        out.append(f'{ind}\'tut.coupler\': "{b}", \'coach.couplerWhere\': "{c}", \'coach.couplerPick\': "{d}", \'coach.couplerNone\': "{e}",')
assert k == 6, k
open(p, 'w', encoding='utf-8').write('\n'.join(out))
EOF
```

Then rerun the dictionary check from Task 5 Step 8 (six equal counts, `- -`).

- [ ] **Step 6: Check in the browser**

With DevTools at 375×667 (`file://…/index.html`), console:

```js
localStorage.setItem('plus9.onboarded', '1'); localStorage.setItem('plus9.tour', '1')
await startGame('journey', 91)
const c = tiles.find(t => t.special === 'coupler'); [c.el.textContent, c.el.getAttribute('aria-label')]
```

Expected: "+3" in bronze with a plug badge and a gold ring; label "Coupler +3: drop it on a tile"; the lesson tip shows.

Tap path:

```js
play(c); [holding === c, tiles.filter(t => t.el.classList.contains('is-fuse-target')).length]
const target = tiles.find(t => t.el.classList.contains('is-fuse-target')); const before = target.value
play(target); [target.value === before + 3, holding, tiles.some(t => t.el.classList.contains('is-dimmed'))]
```

Expected: `[true, n>0]`, then `[true, null, false]`; the coach reads "a + 3 = b"; the fuse sound plays; the coupler's slot shows what Next was.

Refusals (Review Focus 3): hold a coupler and `play()` a wild, a frozen, a minus tile and another coupler: each target shakes, nothing changes and the coupler stays held; tapping the well does nothing; `Escape` drops the hold. Drag a coupler onto the well with the mouse: it returns home with a shake and the "goes onto a tile" tip. Drag it onto a ringed tile: it slides onto it and fuses.

Stuck (Review Focus 4):

```js
setTile(tiles[0], { value: 30, color: COLORS[0] }); play(tiles[0])
tiles.slice(1).forEach((t, i) => setTile(t, i === 0 ? { value: 3, color: COLORS[1], special: 'coupler' } : { value: 20, color: COLORS[3] }))
checkStuck(); [stuck, freeShuffles]
```

Expected: `[true, 1]` (need 8, only 20s and a coupler): the stuck state shows (worried Nine, the Shuffle nudge); `play(tiles[1])` (the coupler) does nothing and a drag on it does not start; Shuffle works as before.

Held coupler while the game moves on (Review Focus 5): hold a coupler, then press `S` (shuffle), `Esc` (pause), the back arrow, and complete a sum: after each, `holding` is `null` and no tile has `is-fuse-target`, `is-dimmed` or `is-held`.

Keyboard: Tab to the coupler, Enter, Tab to a ringed tile, Enter → fused. Reduced motion (DevTools rendering: emulate `prefers-reduced-motion: reduce`): no slides, the fusion still happens. No console errors.

- [ ] **Step 7: Commit**

```bash
git add app.js index.html styles.css sound.js i18n.js
git commit -m "Couplers in the journey from level 91: hold, drag and fuse onto a tile"
```

---

### Task 7: Worlds Chrome and Gears (themes, music, Nine's items, help lines, texts)

**Files:**
- Modify: `rules.js` (`WORLDS`), `meta.js` (`SLOTS`), `mascot.js` (`ITEMS`), `styles.css` (two themes), `sound.js` (two `STYLES`), `index.html` (two help lines), `app.js` (`openHelp` shows them), `i18n.js` (6 languages)

**Interfaces:**
- Consumes: `meta.worldReached(w)`, `completeWorld`, `applyTheme`, `sfx.setStyle` (existing).
- Produces: worlds `chrome` (index 8, reward `welder`) and `gears` (index 9, reward `tophat`); help lines `#rule-minus`, `#rule-coupler`; i18n keys `theme.chrome`, `theme.gears`, `item.welder`, `item.tophat`, `help.r9.t`, `help.r9.b`, `help.r10.t`, `help.r10.b`.

- [ ] **Step 1: Worlds, slots and items**

In `rules.js`, add to `WORLDS` after neon:

```js
    { id: 'chrome', reward: 'welder' },
    { id: 'gears', reward: 'tophat' },
```

In `meta.js` `SLOTS`, add `tophat: 'head'` to the head list and `welder: 'face'` to the face list.

In `mascot.js` `ITEMS`, add:

```js
        welder: `<g ${W}><path d="M8 40 H20 M80 40 H92" stroke-width="6"/><circle cx="34" cy="40" r="14" fill="#3d5a4a"/><circle cx="66" cy="40" r="14" fill="#3d5a4a"/><path d="M48 40 H52" stroke-width="6"/><circle cx="34" cy="40" r="8" fill="#5fe08a" fill-opacity="0.35" stroke-width="2"/><circle cx="66" cy="40" r="8" fill="#5fe08a" fill-opacity="0.35" stroke-width="2"/><path d="M27 34 L32 31 M59 34 L64 31" stroke="#fff" stroke-width="3" stroke-linecap="round"/></g>`,
        tophat: `<g ${W}><rect x="30" y="-36" width="40" height="46" rx="4" fill="#2b1a50"/><path d="M31 -2 H69" stroke="#dca061" stroke-width="8"/><ellipse cx="50" cy="12" rx="40" ry="8" fill="#2b1a50"/></g>`,
```

- [ ] **Step 2: Themes**

In `styles.css`, after the neon theme rule, add:

```css
/* chrome: brushed steel, dark at the top */
[data-theme="chrome"], .theme-chrome { --bg: linear-gradient(180deg, #232a36 0%, #4b5568 45%, #7f8ba1 80%, #a9b4c6 100%); }
/* gears: copper and bronze */
[data-theme="gears"], .theme-gears { --bg: linear-gradient(180deg, #2e1a10 0%, #6a3618 45%, #a5642a 80%, #d39552 100%); }
```

- [ ] **Step 3: Music**

In `sound.js` `STYLES`, after `neon`, add:

```js
        // Chrome: robotic synth-pop. Clipped square arpeggios, a dry octave bass, kick and a
        // metallic clap.
        chrome: {
            bpm: 112, cutoff: 3200, level: 0.9,
            parts: [['Am', 'F', 'C', 'G'], ['F', 'G', 'Em', 'Am']],
            arp: [0, 2, 1, 3, 0, 2, 4, 2],
            step(at, bar, pos, out, e) {
                const chord = chordAt(this.parts, bar)
                const i = this.arp[pos]
                tone(midi(chord[i % 3] + 12 * Math.floor(i / 3) + 12), { type: 'square', dur: e * 0.45, vol: 0.02, attack: 0.002, at, dest: out })
                if (pos % 2 === 0) tone(midi(chord[0] - (pos % 4 ? 12 : 24)), { type: 'square', dur: e * 0.5, vol: 0.045, attack: 0.003, at, dest: out })
                if (pos === 0 || pos === 4) kick(at, 0.2, out)
                if (pos === 2 || pos === 6) {
                    hiss({ dur: 0.08, vol: 0.06, at, from: 2600, to: 3400, dest: out })
                    tone(1800, { type: 'square', dur: 0.03, vol: 0.025, at, dest: out })
                }
                hiss({ dur: 0.02, vol: 0.025, at, from: 9000, to: 10000, dest: out })
            },
        },

        // Gears: a clockwork music box. Bell notes with a lilt, a tick-tock woodblock clock and a
        // soft low bass.
        gears: {
            bpm: 96, cutoff: 2800, level: 1,
            parts: [['C', 'G', 'Am', 'F'], ['F', 'C', 'Dm', 'G']],
            melody: [0, 2, 4, 2, 3, 2, 1, null],
            step(at, bar, pos, out, e) {
                const chord = chordAt(this.parts, bar)
                const swing = pos % 2 ? e * 0.18 : 0 // late off-beats
                const i = this.melody[pos]
                if (i !== null) {
                    const n = chord[i % 3] + 12 * Math.floor(i / 3) + 12
                    tone(midi(n), { type: 'sine', dur: e * 1.4, vol: 0.032, attack: 0.003, at: at + swing, dest: out })
                    tone(midi(n) * 3, { type: 'sine', dur: e * 0.25, vol: 0.005, attack: 0.002, at: at + swing, dest: out })
                }
                if (pos === 0) tone(midi(chord[0] - 24), { type: 'sine', dur: e * 3, vol: 0.11, attack: 0.02, at, dest: out })
                if (pos % 2 === 0) tone(2100, { type: 'sine', dur: 0.025, vol: 0.05, attack: 0.001, at, dest: out })
                else tone(1400, { type: 'sine', dur: 0.025, vol: 0.035, attack: 0.001, at: at + swing, dest: out })
            },
        },
```

Update the `sound.js` row of `CLAUDE.md` later (Task 8) with the two styles.

- [ ] **Step 4: Help lines shown once the world is reached**

In `index.html`, in `<ul class="rules">` after the special tiles `<li>` (help.r3), add:

```html
            <li id="rule-minus" hidden>
                <span class="rule-icon" aria-hidden="true"><span class="mini-tile is-minus">−3</span></span>
                <p><strong data-i18n="help.r9.t">Minus tiles.</strong> <span data-i18n="help.r9.b">Worth −1 to −5: they take away from the sum, never below 0. They don't count as tiles or colors.</span></p>
            </li>
            <li id="rule-coupler" hidden>
                <span class="rule-icon" aria-hidden="true"><span class="mini-tile is-coupler">+3</span></span>
                <p><strong data-i18n="help.r10.t">Couplers.</strong> <span data-i18n="help.r10.b">Worth +1 to +5: drop one on a tile to add to it (never past the target). The tile keeps its color.</span></p>
            </li>
```

In `styles.css`, after the `.mini-tile.is-next` rule, add:

```css
/* help icons for the later worlds' tiles: the round icon takes the tile's metal */
.rule-icon:has(.mini-tile.is-minus) { background: linear-gradient(155deg, #f6f8fb 0%, #c8cfda 42%, #eef2f6 52%, #a9b2c1 100%); }
.rule-icon:has(.mini-tile.is-coupler) { background: linear-gradient(155deg, #ffe6c2 0%, #dca061 42%, #ffdcab 52%, #b9752f 100%); }
.mini-tile.is-minus { color: #4f5a6e; }
.mini-tile.is-coupler { color: #6e3f16; }
```

In `app.js` `openHelp()`, before `help.showModal()`, add:

```js
    // the later worlds' tiles are explained once the player gets there, not before
    $('rule-minus').hidden = !meta.worldReached(8)
    $('rule-coupler').hidden = !meta.worldReached(9)
```

- [ ] **Step 5: Texts (six languages)**

```bash
python3 - <<'EOF'
NB = ' '
T = [
    ('Chrome', 'Gears', 'Welding goggles', 'Top hat', 'Minus tiles.', "Worth −1 to −5: they take away from the sum, never below 0. They don't count as tiles or colors.", 'Couplers.', 'Worth +1 to +5: drop one on a tile to add to it (never past the target). The tile keeps its color.'),
    ('Cromo', 'Engranajes', 'Gafas de soldador', 'Sombrero de copa', 'Fichas que restan.', 'Valen de −1 a −5: quitan de la suma, nunca por debajo de 0. No cuentan como ficha ni como color.', 'Fichas acople.', 'Valen de +1 a +5: suelta una sobre otra ficha para sumársela (nunca por encima del objetivo). La ficha conserva su color.'),
    ('Cromo', 'Engrenagens', 'Óculos de solda', 'Cartola', 'Peças que subtraem.', 'Valem de −1 a −5: tiram da soma, nunca abaixo de 0. Não contam como peça nem como cor.', 'Peças acopladoras.', 'Valem de +1 a +5: solte uma sobre outra peça para somar (nunca acima do alvo). A peça mantém a cor.'),
    ('Chrome', 'Engrenages', 'Lunettes de soudeur', 'Haut-de-forme', 'Tuiles qui retirent.', f'De −1 à −5{NB}: elles retirent de la somme, jamais sous 0. Elles ne comptent ni comme tuile ni comme couleur.', 'Raccords.', f'De +1 à +5{NB}: pose-en un sur une tuile pour l’ajouter (jamais au-delà du but). La tuile garde sa couleur.'),
    ('Chrom', 'Zahnräder', 'Schweißerbrille', 'Zylinder', 'Minus-Steine.', '−1 bis −5: Sie ziehen von der Summe ab, nie unter 0. Sie zählen weder als Stein noch als Farbe.', 'Kupplungen.', '+1 bis +5: Leg eine auf einen Stein, um sie dazuzuzählen (nie über das Ziel). Der Stein behält seine Farbe.'),
    ('Krom', 'Dişliler', 'Kaynakçı gözlüğü', 'Silindir şapka', 'Eksi taşlar.', '−1 ile −5 arası: toplamdan düşer, asla 0’ın altına inmez. Taş ya da renk sayılmaz.', 'Bağlantılar.', '+1 ile +5 arası: eklemek için birini bir taşın üstüne bırak (hedefi asla aşmaz). Taş rengini korur.'),
]
p = 'i18n.js'; lines = open(p, encoding='utf-8').read().split('\n'); out = []; k = 0
for line in lines:
    out.append(line)
    if "'tile.coupler': " in line:
        ind = line[:len(line) - len(line.lstrip())]
        a, b, c, d, e, f, g, h = T[k]; k += 1
        out.append(f'{ind}\'theme.chrome\': "{a}", \'theme.gears\': "{b}", \'item.welder\': "{c}", \'item.tophat\': "{d}",')
        out.append(f'{ind}\'help.r9.t\': "{e}", \'help.r9.b\': "{f}", \'help.r10.t\': "{g}", \'help.r10.b\': "{h}",')
assert k == 6, k
open(p, 'w', encoding='utf-8').write('\n'.join(out))
EOF
```

Then update the home tour's count in all six `tour.journey` strings ("80 … 8" → "100 … 10"):

```bash
python3 - <<'EOF'
p = 'i18n.js'; s = open(p, encoding='utf-8').read()
rep = [('80 levels in 8 worlds', '100 levels in 10 worlds'), ('80 niveles en 8 mundos', '100 niveles en 10 mundos'),
       ('80 níveis em 8 mundos', '100 níveis em 10 mundos'), ('80 niveaux dans 8 mondes', '100 niveaux dans 10 mondes'),
       ('80 Level in 8 Welten', '100 Level in 10 Welten'), ('8 dünyada 80 seviye', '10 dünyada 100 seviye')]
for a, b in rep:
    assert s.count(a) == 1, a
    s = s.replace(a, b)
open(p, 'w', encoding='utf-8').write(s)
EOF
```

Rerun the dictionary check (six equal counts, `- -`).

- [ ] **Step 6: Check in the browser**

Console, at 375×667:

```js
localStorage.setItem('plus9.onboarded', '1'); localStorage.setItem('plus9.tour', '1')
for (let n = 1; n <= 89; n++) meta.journeyRecord(n, 1)
await startGame('journey', 90); finishJourney(true)
```

Expected: the result shows the world prize "Welding goggles" with Nine wearing them; the theme switches to Gears (copper background) and the music to the music box; the map shows a "World 10 · Gears" banner at 91. Repeat with levels up to 99 and `startGame('journey', 100); finishJourney(true)`: prize "Top hat", theme stays Gears.

Open Customize: both items and both themes are there and the sheet scrolls inside without page scroll. Pick Chrome: steel background, robotic music. Open How to play: the minus and coupler lines show (they are hidden on a fresh save: check with `localStorage.clear()` + reload). Check the six languages at 375 px and 640×360 for the new help lines and item names (de, fr longest). No console errors.

- [ ] **Step 7: Commit**

```bash
git add rules.js meta.js mascot.js styles.css sound.js index.html app.js i18n.js
git commit -m "Worlds 9 Chrome and 10 Gears: themes, music, Nine's goggles and top hat"
```

---

### Task 8: Docs and the final pass

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `promo/store-listing.md`

- [ ] **Step 1: CLAUDE.md**

Update, keeping the file's style:
- **Rules → Special tiles**: add minus tiles and couplers (values, rules, look, from which level, `canPlay(tile, need, sum)`, `canFuse`, `fuse`, `isStuck`, `tilesUsed`).
- **Rules → Journey**: levels 81 and 91 hand out their tile (`setup` with `value`), coach tips at 81 and 91, `mechanics` per level, boards 81–200 re-picked with them.
- **Worlds**: ten worlds (…, neon, chrome, gears); past level 100 the journey stays in Gears; rewards `welder`, `tophat`.
- **Files table**: `sound.js` styles add **chrome** robotic synth-pop and **gears** clockwork music box; `bot.js` players return actions and handle `mechanics`; new rows for `tools/solve.js` (`node tools/solve.js <n | from-to> [nodes]`) and `tests/` (`node --test tests/*.test.js`, the fixture pins levels 1–80, Classic and the Daily).
- **Input**: holding a coupler (`holding`, `holdCoupler`, `dropHold`, `fuseInto`), dragging onto tiles (`zoneOf`, `markFusion`), Esc cancels.
- **Testing**: run `node --test tests/*.test.js` before committing rules or bot changes; `tools/solve.js` after re-picking seeds.
- **Onboarding** list: where minus tiles and couplers are taught (levels 81 and 91 tips, help lines once reached, the wrong-drop tip).

- [ ] **Step 2: README and store listing**

In `README.md`: Journey line "eight worlds of ten levels (Grape, … Neon)" → "ten worlds of ten levels (Grape, Sunset, Ocean, Night, Candy, Forest, Space, Neon, Chrome, Gears)"; add minus tiles and couplers to **Special tiles**; add `node tools/solve.js` and `node --test tests/*.test.js` to "Running it".

In `promo/store-listing.md`: "80 hand-tuned levels across 8 worlds" → "100 hand-tuned levels across 10 worlds", and the Spanish line likewise ("100 niveles en 10 mundos"); mention minus tiles and couplers in the special tiles sentence of both languages.

- [ ] **Step 3: Full pass**

Run: `node --test tests/*.test.js` → all PASS. `node tools/solve.js 81-200` → exit 0. `node tools/balance.js` → same numbers as before this plan (Classic is untouched). `node tools/build.js web` and `node tools/build.js poki` → both succeed.

In the browser, at 375×667, ~1000×780, 640×360, 836×470 and 1031×580: a journey level 85 and 95 (new tiles visible and playable), the pause menu, the result sheet, Customize; no page scroll; reduced motion; Color shapes on; no console errors. In de and fr at 375 px: tile labels, tips and help lines fit.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md promo/store-listing.md
git commit -m "Document minus tiles, couplers and worlds 9-10"
```
