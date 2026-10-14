# Plus9

## A little game made with vanilla js

Drag or tap numbers into the middle circle until they add up to exactly the target.

### How to play

- **Score**: each sum is worth the tiles you used times your level, so 2 + 3 + 4 beats 8 + 1. If every tile in a sum has the same color, it's a **combo**: double points.
- **Special tiles**: a ★ wild tile finishes any sum, a ×2 tile doubles its sum's points, a rainbow tile matches every color so it never breaks a combo, and in later Journey levels some tiles start frozen and thaw after 2 sums. From level 81, minus tiles (−1 to −5) take away from the sum, and from level 91 couplers (+1 to +5) are dropped onto a tile to add to it.
- **Next** shows the number that will replace the tile you play.
- **Don't go over** the target. If no tile fits, shuffle: your free shuffles first, then you pay points (each paid one costs more). You can also bank your points and stop, or, on a game portal, watch an ad for a free shuffle 🎬.

### Modes

- **Journey**: ten worlds of ten levels (Grape, Sunset, Ocean, Night, Candy, Forest, Space, Neon, Chrome, Gears), each a fixed board with a goal and up to 3 stars. The first levels teach the game as you play. Each world ends with a boss; beat it to reach the next world, with its own look and music, and to win an outfit for Nine.
- **Daily**: the same tiles for everyone each day. 12 sums, one try, a par to beat, a result grid to share and a streak to keep.
- **Classic**: play as long as you can; the target grows every 4 sums. Sums in a row go into a **pot**, the k-th worth k times its points (up to ×5): cash it in to keep it, or push your luck, because getting stuck loses the pot.
- **60 seconds**: race the clock; every sum adds 2 seconds.

Three **daily missions** give extra stars. In **Customize** you pick the theme (colors and music) of any world you have reached and dress Nine: one outfit per world, plus a cap, a scarf and a crown bought with stars.

### Controls

Mouse, touch or keyboard: Tab + Enter plays a tile, **S** shuffle, **C** cash in (Classic), **B** bank, **M** sound, **H** or **?** how to play, **Esc** pause. Sound effects and music can be switched off separately in Settings (the gear on the home screen, or the pause menu). **Color shapes**, also in Settings, adds a shape to each tile color for players who can't tell the colors apart.

### Languages

English, Spanish, Portuguese, French, German and Turkish. The game picks the player's language automatically; it can be changed in Settings.

## Running it

Open `index.html` in a browser. No install, no build, no server: progress is saved in the browser.

- `index.html?testads`: simulates ads locally, to check that the game pauses and mutes during them.
- `index.html?lang=de`: opens the game in a given language (en, es, pt, fr, de, tr).
- `node tools/balance.js`: simulates players to check the difficulty curve.
- `node tools/journey.js [levels]`: re-picks the journey boards so each level has the intended difficulty.
- `node tools/solve.js 81-200`: checks that every journey level can be won.
- `node --test tests/*.test.js`: tests for the rules and the simulated players.
- `node tools/build.js poki`: the Poki package in `dist/poki/` and `dist/plus9-poki.zip`; `node tools/build.js web`: the plain copy published on GitHub Pages.

## Project layout

```
index.html      screens and dialogs
app.js          game engine, screens and modes
rules.js        game rules shared by the game, the simulated player and the tools
bot.js          simulated players (daily par, journey star goals)
meta.js         journey stars, missions, themes, Nine's wardrobe
platform.js     web-portal adapter (Poki, later CrazyGames)
i18n.js         translations
sound.js        synthesised sound effects, music and vibration
mascot.js       Nine the mascot and confetti
loader.js       loading screen: Nine fills the ring while the game loads
styles.css      look and layout (portrait and 16:9 landscape)
fonts/          bundled fonts and their licences
tools/          balance and journey simulators, portal build
promo/          store thumbnail, screenshots and listing texts
```

`CLAUDE.md` has the full technical notes: rules, saving, balance, portal requirements and conventions.

## Credits

Fonts: [Ranchers](https://fonts.google.com/specimen/Ranchers) and [Baloo 2](https://fonts.google.com/specimen/Baloo+2), bundled under the SIL Open Font License (see `fonts/`).
