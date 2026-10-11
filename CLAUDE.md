# Plus 9

Tiny vanilla HTML/CSS/JS puzzle game. No build step, no dependencies, no package.json. Open `index.html` directly in a browser (file:// works).

## Files

- `index.html` – static shell: header (help `?` button, title, sound toggle), mode switch, HUD (score/level/best), the 3x3 board with the centre "well", the actions row (next tile, clock, shuffle), the game-over `<dialog>`, and the how-to-play `<dialog id="help">` (opens automatically on the first visit, `plus9.seenHelp`).
- `sound.js` – synthesised sound effects (Web Audio, no asset files), exposed as the global `sfx` (`sfx.add(progress)`, `sfx.complete(chain)`, …). Notes come from a C major pentatonic scale so effects harmonise. Mute state is `plus9.muted`. Loaded before `app.js`.
- `app.js` – all game logic. Tiles are created at runtime (`buildTiles`), so the 8 tile `<button>`s are not in the HTML.
- `styles.css` – design tokens on `:root`, sticker/cartoon look (Ranchers display font + Baloo 2 body from Google Fonts).

## Rules (as implemented)

- 8 tiles show random numbers from 1 to `target - 1`. Playing a tile adds its value to the well and the tile takes the **Next** value shown under the board.
- Reaching the target exactly scores `tiles used × level`, so longer chains are worth more. The well resets after a short animation (`resolving` blocks input meanwhile).
- Every `SUMS_PER_LEVEL` (4) sums the level rises: the target follows `TARGETS` (9, 10, 12 … 20), tiles can roll bigger, and you gain a shuffle (max 3).
- **Shuffle** rerolls all 8 tiles. Free shuffles: start with 1, +1 per level (max 3). With none free, a shuffle costs `SHUFFLE_COST × level × (paid so far + 1)` points; the button badge shows the free count or the price. Key: `S`.
- Going over the target ends the game. Being stuck (sum above 0 and no tile ≤ what's needed) pauses play until you shuffle; if you have no free shuffle and can't afford one, the game ends.
- Modes: Classic, or 60 seconds (clock starts on the first move, +2s per sum). The record is the **final** score (saved at game over, on mode switch and on `pagehide`), so points spent on shuffles count against it. Each mode keeps its own best in `localStorage` (`plus9.best.classic`, `plus9.best.timed`; the old `plus9.best` key is read as the classic record). The chosen mode is saved as `plus9.mode`.
- Opening help pauses the 60-second clock (`pauseClock`/`resumeClock`). Keys: `H`/`?` help, `M` mute, `S` shuffle.
- The difficulty constants at the top of `app.js` were tuned with a simulation: careless play scores ~6 sums, careful lookahead ~57 (paying for ~3–4 shuffles). Re-simulate before changing them: a growing target with small tiles, or a flat shuffle cost, makes careful play endless.

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
