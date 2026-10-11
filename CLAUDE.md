# Plus 9

Vanilla HTML/CSS/JS number puzzle: drag or tap tiles into the centre until they add up to the target exactly. No build step for local play, no dependencies, no package.json. Open `index.html` directly (file:// works). The page makes **no external requests** (fonts are bundled); web portals require this, so keep it that way. There is **no server**: all progress lives in `localStorage` (see *Saving*).

## Files

Scripts load in this order (plain globals, no modules):

| File | What it is |
|---|---|
| `platform.js` | Web-portal adapter, global `platform`. See *Portals*. |
| `rules.js` | Pure rules shared by the game, the bot and the tools: constants, `targetFor`, `drawTile(lv, rnd)`, `sumPoints(parts, lv)`, `shuffleCostFor`, `createRng`/`hashSeed`, `journeyLevel(n)` and `JOURNEY_SEEDS`. Also exported for Node. |
| `bot.js` | Simulated players on top of `rules.js`: `simulateRun`, `journeyStars(def)` (star thresholds) and `dailyPar(seed)`. Same draw order as the game, so a seeded run sees the player's board. Also exported for Node. |
| `meta.js` | Long-term progress, global `meta`: journey stars, daily missions, the star wallet and themes. |
| `sound.js` | Synthesised Web Audio effects and haptics, global `sfx`. C major pentatonic. Mute (`plus9.muted`) also silences vibration. |
| `app.js` | Game engine, the three screens (home, journey map, game), modes, dialogs, input. Tiles are created at runtime (`buildTiles`). State lives in top-level `let`s. |
| `index.html` | Icon `<symbol>`s, the three `.screen`s, the toast, and the dialogs: result `#over`, journey intro `#intro`, help/pause `#help`. |
| `styles.css` | `@font-face`, tokens and themes, screens, board, dialogs, then the landscape layout and reduced-motion overrides at the end. |
| `fonts/`, `icon.svg` | Bundled Ranchers + Baloo 2 (OFL licences included) and the favicon. |
| `tools/balance.js` | `node tools/balance.js`: dead-end rates per level and whole-game lengths. |
| `tools/build.js` | `node tools/build.js poki`: copies the game into `dist/poki/`, injects the Poki SDK and `PLUS9_PLATFORM`, and writes `dist/plus9-poki.zip` (no dependencies). `dist/` is git-ignored. |
| `promo/` | Store assets: `thumbnail.html` (scene, screenshot at 628×628 ×2) and `thumbnail.png` (1256×1256, no text, full-bleed, as Poki asks). |
| `tools/journey.js` | `node tools/journey.js`: picks a seed per journey level so difficulty follows a curve; paste its output over `JOURNEY_SEEDS` in `rules.js`. |

## Screens and modes

- **Home** (`#home`): Journey card (next level, total stars), Daily / Classic / 60 seconds cards, today's missions, themes. A first-time player skips it and lands in Journey level 1 (`plus9.onboarded` is set when they win it).
- **Journey map** (`#map`): a winding route of levels (`renderMap`); finished levels show their stars, the next one is gold, later ones locked. `drawRoad()` draws an SVG under the nodes with an S-curve from each node's centre to the next: stretches after a level with a star are an ink-cased rainbow that slides along (SMIL `animateTransform`, off with reduced motion); the rest are dotted. It measures the nodes, so it reruns on resize. A level opens the `#intro` sheet (goal and star thresholds) before playing.
- **Game** (`#game`): bar (home, title, pause, sound), HUD, coach tip, board, actions. The HUD's 2nd and 3rd pills change with the mode (`renderHud`): Level/Best (Classic, 60 s), Sums/Par (Daily), Stars/Sums (Journey).
- Starting any game calls `platform.commercialBreak()` first; `goHome()` abandons the current game (Classic/60 s records are kept, the daily keeps its own saved progress).

## Rules (as implemented)

- **Tiles**: 8 tiles, values 1…`target − 1`, weighted towards small numbers: P(v) ∝ exp(−v / λ), λ per level from `TILE_LAMBDA`. Playing a tile adds it to the well and the tile becomes the **Next** value. Four random colors.
- **Scoring**: a completed sum scores `tiles used × level`, **×2 when every tile has the same color** (a combo, at least 2 tiles).
- **Levels** (Classic, 60 s, Daily): every `SUMS_PER_LEVEL` (4) sums, no top level. Target follows `TARGETS` (9 … 20), then +2 per level. The `#levelup` card shows the old target struck through and the new one.
- **Shuffle** rerolls all 8 tiles (key `S`). Free shuffles: 1 at the start, +1 per level-up while under 3. Otherwise it costs `SHUFFLE_COST × level × (paid so far + 1)` points.
- **Losing**: going over the target ends the game. **Stuck** (sum above 0, no tile fits) blocks play until the player acts: free shuffle, pay, **Bank** (key `B`: end and keep the points; in the Journey it reads **Give up**) or **🎬 Free shuffle** when `platform.hasRewarded`. With none of those available the game ends.
- **Records**: the final score, per mode (`plus9.best.classic`, `plus9.best.timed`), so points spent on shuffles count against it. The result sheet compares the score with the previous record.
- **Journey** (`journeyLevel(n)`): a fixed seeded board; make the target `sums` times at a fixed difficulty (no level-ups). Tier = every 5 levels (target 9, 10, 12, 14 …); within a tier sums go 3 → 7. Stars: 1★ finishing, 2★ and 3★ at score thresholds from `journeyStars` (2★ ≈ a typical player, 3★ ≈ the careful bot). Level 1 starts from a hand-picked board. Levels 1–4 show coach tips (`tutorial()`): level 1 walks through the first sum with a highlighted tile; 2 = Next, 3 = color combos, 4 = shuffle. `JOURNEY_SEEDS` (levels 1–60) were chosen by `tools/journey.js` so typical players win ~95 % at level 1 down to 40 %; past 60 the seed is unchecked.
- **Daily** (`mode === 'daily'`): same tiles for everyone on a local date (`createRng(hashSeed(todayKey()))`). **All randomness goes through `rng`; never call `Math.random` directly for game draws.** `DAILY_SUMS` (12) sums, one attempt. Progress is saved on every `render()` (`plus9.daily`), so reloading resumes instead of rerolling. **Par** = what the careful bot scores on today's board (`todaysPar()`); shown when the daily starts, in the HUD and in the result and share text. Result: 2×6 emoji grid (🟦 2 tiles, 🟪 3, 🟨 4+, 💥 bust, ⬜ unplayed), streak (`plus9.streak`), countdown, Share (`navigator.share` or clipboard, URL from `platform.shareURL()`). Daily #1 is `DAILY_EPOCH`: **set it to the launch date before publishing**.
- **Missions** (`meta.MISSIONS`): 3 a day, the same for everyone (seeded by the date). Events from `app.js` (`meta.missionEvent`) advance them; each completed mission adds a star to `plus9.wallet` and shows a toast.
- **Stars and themes**: total stars = journey stars + mission stars. Themes (`meta.THEMES`: Grape 0, Sunset 10, Ocean 25, Night 45) are cosmetic and set `body[data-theme]`, which defines `--bg`.
- **Pause**: the help sheet is the pause menu (`Esc`, the pause button; `H`/`?` too). It pauses the 60-second clock, and so does hiding the page. `M` mutes.

## Saving

Everything is `localStorage` under `plus9.*` (each access in try/catch): `best.classic`, `best.timed`, `daily`, `streak`, `journey`, `missions`, `wallet`, `theme`, `muted`, `onboarded`. No backend. On Poki, a logged-in player's `localStorage` is synced to their account automatically by the SDK (restored across devices, 1 MB limit); keys starting with `poki_ignore` are excluded. Keep saves small and in `localStorage` so that keeps working.

## Balance

`node tools/balance.js` (rules.js + bot.js): normal player's dead-end rate ≈16 % at level 1 rising ~2 points per level; whole Classic games: normal ≈15 sums, careful ≈90, none endless. Run it before and after touching `TARGETS`, `TILE_LAMBDA`, `SUMS_PER_LEVEL`, `MAX_FREE_SHUFFLES`, `SHUFFLE_COST` or `COMBO_MULTIPLIER`. If the journey's rules change, rerun `node tools/journey.js` and update `JOURNEY_SEEDS`.

## Portals (Poki first, CrazyGames later)

`platform.js` hides each SDK behind `init`, `loadingFinished`, `gameplayStart`, `gameplayStop`, `commercialBreak()` → Promise, `rewardedBreak()` → Promise<boolean>, `shareURL()`, `hasRewarded`, `adShowing`. `window.PLUS9_PLATFORM` picks the SDK (`'poki'`); unset means `'none'`: no-ops and **no rewarded ads** (a self-hosted copy would otherwise hand out unlimited free shuffles). `?testads` simulates 1.2 s ads locally.

The adapter enforces Poki's rules (no repeated start/stop, no events during ads, ad promises always resolve). `app.js` calls `gameplayStart()` on the first input; `gameplayStop()` on game over, level-up, pause and leaving; `commercialBreak()` when starting a game, after the level-up card and when unpausing mid-game; `rewardedBreak()` only from 🎬. During an ad: audio suspended, clock paused, `body.is-ad` blocks input.

Poki UI rules followed: 16:9 frames (640×360, 836×470, 1031×580) use the landscape layout; the 🎬 button is never green, sits beside or after the standard choices and is never larger or animated; no external links or requests; arrow keys, space and the wheel don't scroll the host page except inside `.sheet` and `.scroll` (the map).

**Build**: `node tools/build.js poki` adds `<script src="https://game-cdn.poki.com/scripts/v2/poki-sdk.js">` (no SRI: Poki updates that file in place) and zips the package. Verified over HTTP with the real SDK: it loads, and the event order is start → stop (level end) → commercialBreak (next start) → start → stop (pause) → commercialBreak (resume). **Still to do**: upload to Poki for Developers, run Poki Inspector, the animated thumbnail (needed for Soft Release), set `DAILY_EPOCH` to the launch date.

## Conventions

- **Input** goes through `play(tile)`: `click` for tap/keyboard, Pointer Events with a `.ghost` clone for drag; the click after a drag is suppressed.
- **Ring**: one SVG segment per unit of the target, coloured by the tile that filled it.
- **Motion** only answers the player (pop-in, match, shake, bump, floating points, level-up card, result stars). The only loop is the Shuffle `nudge` while stuck and payable. Tutorial hints are a steady gold ring, not an animation. `prefers-reduced-motion` turns motion off.
- **Numbers** on tiles, Next and help icons are outlined with 16 unblurred `text-shadow`s (radius `--o`), not `-webkit-text-stroke`.
- **The target is always prominent**: an empty well shows it big in gold under "Make".
- **Labels** on pills and buttons use `--label-font`/`--label-size` (Ranchers 400), ink on white. Baloo 2 is for running text.
- **Icons** are `<symbol>`s in `index.html` used via `<use>`; CSS can't reach inside them, so state changes swap the symbol (`#i-sound-on` / `#i-sound-off`) instead of styling inner paths.
- **Layout**: `--cell` sizes the board. Portrait is one column (max 460 px); landscape-and-short switches the game to three columns (info | board | actions) and home to two. Check 375×667, ~1000×780, 640×360, 836×470 and 1031×580 after layout changes; none may scroll except the map route.
- **Style**: 4-space indent, no semicolons, `const`/`let`, no implicit globals; `localStorage` always in try/catch; set user-facing text with `textContent`.

## Testing

No test suite. In a browser: first visit (clear storage) → tutorial level 1 → result → next level intro → map → home; each mode to the end; stuck → shuffle/pay/bank/🎬 with `?testads`; daily reload mid-sum; missions completing (toast, stars); themes unlocking; every layout size above. State is in top-level `let`s, so DevTools can force situations, e.g. `freeShuffles = 0; score = 5; setTile(tiles[0], { value: 7, color: '#ff31cc' }); checkStuck()`, or `meta.journeyRecord(5, 3)` to unlock levels.
