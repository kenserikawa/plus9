# Plus9

## A little game made with vanilla js

Drag or tap numbers into the middle circle until they add up to exactly the target.

### How to play

- **Score**: each sum is worth the tiles you used times your level, so 2 + 3 + 4 beats 8 + 1. If every tile in a sum has the same color, it's a **combo**: double points.
- **Next** shows the number that will replace the tile you play.
- **Don't go over** the target. If no tile fits, shuffle: your free shuffles first, then you pay points (each paid one costs more). You can also bank your points and stop, or, on a game portal, watch an ad for a free shuffle 🎬.

### Modes

- **Journey**: a route of levels, each a fixed board with a goal and up to 3 stars. The first levels teach the game as you play.
- **Daily**: the same tiles for everyone each day. 12 sums, one try, a par to beat, a result grid to share and a streak to keep.
- **Classic**: play as long as you can; the target grows every 4 sums.
- **60 seconds**: race the clock; every sum adds 2 seconds.

Three **daily missions** give extra stars, and stars unlock color **themes**.

### Controls

Mouse, touch or keyboard: Tab + Enter plays a tile, **S** shuffle, **B** bank, **M** sound, **Esc** pause.

## Running it

Open `index.html` in a browser. No install, no build, no server: progress is saved in the browser.

- `index.html?testads`: simulates ads locally, to check that the game pauses and mutes during them.
- `node tools/balance.js`: simulates players to check the difficulty curve.
- `node tools/journey.js`: re-picks the journey boards so each level has the intended difficulty.

## Project layout

```
index.html      screens and dialogs
app.js          game engine, screens and modes
rules.js        game rules shared by the game, the simulated player and the tools
bot.js          simulated players (daily par, journey star goals)
meta.js         journey stars, missions, themes
platform.js     web-portal adapter (Poki, later CrazyGames)
sound.js        synthesised sound effects and vibration
styles.css      look and layout (portrait and 16:9 landscape)
fonts/          bundled fonts and their licences
tools/          balance and journey simulators
```

`CLAUDE.md` has the full technical notes: rules, saving, balance, portal requirements and conventions.

## Credits

Fonts: [Ranchers](https://fonts.google.com/specimen/Ranchers) and [Baloo 2](https://fonts.google.com/specimen/Baloo+2), bundled under the SIL Open Font License (see `fonts/`).
