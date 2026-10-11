# Plus9

## A little game made with vanilla js

Drag or tap numbers into the middle circle to add up to exactly the target (it starts at 9). Each sum scores the number of tiles you used times your level, so longer chains are worth more.

- **Next** shows the number that will replace the tile you play.
- **Shuffle** rerolls the whole board. You start with one free shuffle and earn another each level. With none left, a shuffle costs points, and each paid one costs more (S on the keyboard).
- Every 4 sums you level up. There's no top level: the target keeps growing, and bigger numbers appear little by little.
- Go over the target and it's game over. If you get stuck with no free shuffle, choose: pay for a shuffle, or **bank** your points and end the game (B on the keyboard).
- **60 seconds** mode: race the clock; every sum adds 2 seconds. Each mode keeps its own best score.
- **Daily** challenge: the same tiles for everyone each day. Play 12 sums once, share your result grid and keep your streak going.

Tap **?** for the rules any time, and the speaker to mute (M).

Open `index.html` in a browser to play. To check the difficulty curve after changing the rules, run `node tools/balance.js`.

Works with mouse, touch and keyboard (Tab + Enter).

Fonts: [Ranchers](https://fonts.google.com/specimen/Ranchers) and [Baloo 2](https://fonts.google.com/specimen/Baloo+2), bundled under the SIL Open Font License (see `fonts/`).
