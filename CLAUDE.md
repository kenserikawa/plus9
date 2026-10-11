# Plus 9

Tiny vanilla HTML/CSS/JS puzzle game. No build step, no dependencies, no package.json. Open `index.html` directly in a browser (file:// works). The page makes **no external requests** (fonts are bundled), which web portals expect; keep it that way.

## Files

- `index.html` – static shell: header (help `?` button, title, sound toggle), mode switch, HUD (score/level/best), the 3x3 board with the centre "well", the actions row (next tile, clock, shuffle), the game-over `<dialog>`, and the how-to-play `<dialog id="help">` (opens automatically on the first visit, `plus9.seenHelp`).
- `sound.js` – synthesised sound effects (Web Audio, no asset files), exposed as the global `sfx` (`sfx.add(progress)`, `sfx.complete(chain)`, …). Notes come from a C major pentatonic scale so effects harmonise. Mute state is `plus9.muted`. Loaded before `app.js`.
- `app.js` – all game logic. Tiles are created at runtime (`buildTiles`), so the 8 tile `<button>`s are not in the HTML.
- `tools/balance.js` – Node balance simulator (not loaded by the page).
- `fonts/` – Ranchers and Baloo 2 (variable, 500–700) as latin + latin-ext `woff2`, with their OFL licences. Declared with `@font-face` at the top of `styles.css`.
- `icon.svg` – favicon.
- `styles.css` – design tokens on `:root`, sticker/cartoon look (Ranchers display font + Baloo 2 body from Google Fonts).

## Rules (as implemented)

- 8 tiles show numbers from 1 to `target - 1`, weighted towards small ones: P(v) ∝ exp(-v / λ), with λ per level from `TILE_LAMBDA` (≈ 0.78 × target past the table; `Infinity` = uniform). Playing a tile adds its value to the well and the tile takes the **Next** value shown under the board.
- Reaching the target exactly scores `tiles used × level`, so longer chains are worth more. The well resets after a short animation (`resolving` blocks input meanwhile).
- Every `SUMS_PER_LEVEL` (4) sums the level rises with **no top level**: the target follows `TARGETS` (9, 10, 12 … 20), then +2 per level (`targetFor`). You gain a free shuffle if you have fewer than 3.
- **Shuffle** rerolls all 8 tiles. Free shuffles: start with 1, +1 per level (max 3). With none free, a shuffle costs `SHUFFLE_COST × level × (paid so far + 1)` points; the button badge shows the free count or the price. Key: `S`.
- Going over the target ends the game. Being stuck (sum above 0 and no tile ≤ what's needed) pauses play until you shuffle. With no free shuffle the player chooses: pay, or **Bank** (`bank()`, key `B`) to end the game keeping every point. The Bank button replaces the Next pill while it shows. If they can't afford a shuffle, the game ends.
- Modes: Classic, 60 seconds (clock starts on the first move, +2s per sum), or Daily (below). The record is the **final** score (saved at game over, on mode switch and on `pagehide`), so points spent on shuffles count against it. Banking is how a player protects it. Each mode keeps its own best in `localStorage` (`plus9.best.classic`, `plus9.best.timed`; the old `plus9.best` key is read as the classic record). The chosen mode is saved as `plus9.mode`.
- **Daily challenge** (`mode === 'daily'`): the same tiles for everyone on a given local date. All randomness goes through `rng`, which is `seededRandom` (mulberry32, seed from `hashSeed(todayKey())`) in the daily and `Math.random` otherwise. Never call `Math.random` directly for game draws. A daily is `DAILY_SUMS` (12) sums with the normal rules; it ends on completion, bust, can't-afford or bank. Progress is saved on every `render()` (`plus9.daily`: seed state, tiles, next, sum, score, …), so reloading resumes instead of rerolling, and a finished daily can't be replayed. The result dialog shows a 2×6 emoji grid (🟦 2 tiles, 🟪 3, 🟨 4+, 💥 bust, ⬜ unplayed), the streak (`plus9.streak`: consecutive days with a finished daily) and a countdown; **Share** uses `navigator.share` or the clipboard. Daily #1 is `DAILY_EPOCH` (2026-10-11). The Daily tab shows a gold dot until today's daily is done. In daily mode the third HUD pill shows `sums/12` instead of Best.
- Opening help pauses the 60-second clock (`pauseClock`/`resumeClock`), and so does hiding the page (`visibilitychange`), which also suspends audio. Keys: `H`/`?` help, `M` mute, `S` shuffle, `B` bank.
- Difficulty is tuned with `node tools/balance.js`, which reads the constants from `app.js` and simulates careless, normal and careful players. Current design target: the normal player's dead-end rate rises ~2 points per level (≈16% at level 1, ≈28% at level 7). Whole games: normal ≈22 sums, careful ≈95, none endless. Run it before and after touching `TARGETS`, `TILE_LAMBDA`, `SUMS_PER_LEVEL`, `MAX_FREE_SHUFFLES` or `SHUFFLE_COST`: uniform big tiles spike the difficulty, while small tiles with a flat shuffle cost make careful play endless.

## Conventions

- Input goes through one path: `play(tile)`. Tap/click and keyboard (Enter/Space on the focused button) use the `click` event; drag uses Pointer Events with a floating `.ghost` clone, so it works on touch. The click that follows a drag is suppressed via `suppressClick`.
- The centre ring is an SVG with one dashed circle segment per unit of the target (rebuilt by `buildRing` on level up); each segment is coloured by the tile that filled it (`parts`).
- Motion only responds to the player (pop-in on reroll, `match`, `shake`, `bump`, floating `+points`; the shuffle `nudge` only loops while stuck); `prefers-reduced-motion` disables it. Avoid adding idle/looping animations to game elements.
- Numbers on tiles (board, Next, help icons) are **outlined only**, with no offset shadow. The outline is 16 unblurred `text-shadow`s on a circle of radius `--o` (set per element), not `-webkit-text-stroke`, whose mitred joins make spiky corners. The hard offset shadow is for buttons and pills, not for digits.
- The target must always be prominent: an empty well shows it as a big gold number under "Make". Levelling up (`levelUp()`) shows the `#levelup` card (old target struck through → new one) for `LEVEL_UP_MS`, blocking input and pausing the 60-second clock, then rebuilds the ring with a staggered `.seg.intro` sweep. Delayed callbacks check `gameId` so a new game started mid-animation isn't disturbed.
- Every pill/button label (Score, Level, Best, mode switch, Next, Shuffle) uses the Shuffle button's type via `--label-font`/`--label-size` (Ranchers, weight 400). Labels are ink on white; the inactive mode is white on the translucent track. Baloo 2 is for running text (help sheet, dialogs, well labels).
- Board size is driven by `--cell` so it fits both phone and desktop viewports without scrolling. Check a 375×667 phone and ~1000×780 desktop after layout changes.
- Code style: 4-space indent, no semicolons, `const`/`let` (no implicit globals).

## Testing

No test suite. Verify in a browser: play to 9, overshoot, get stuck and shuffle, level up, timed mode running out, drag with mouse and touch, reload to check best scores persist. Game state lives in top-level `let`s, so DevTools can force states (e.g. `setTile(tiles[0], { value: 7, color: '#ff31cc' }); checkStuck()`).
