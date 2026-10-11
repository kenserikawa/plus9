// Pure game rules, shared by the game (app.js), the simulated player (bot.js) and the
// balance tool (tools/balance.js). No DOM, no state: everything random takes a `rnd`
// function so seeded and unseeded play draw exactly the same way.

const COLORS = ['#ff623a', '#37afff', '#8746ff', '#ff31cc']

// Difficulty curve (tuned by simulation). Every SUMS_PER_LEVEL completed sums the level
// rises with no cap: the target follows TARGETS, then grows by 2 per level.
const TARGETS = [9, 10, 12, 14, 16, 18, 20]
const SUMS_PER_LEVEL = 4
// Tiles roll 1..target-1 with P(v) ∝ exp(-v / λ), so small numbers are more common.
// λ per level was fitted so a typical player's chance of a dead end rises by ~2 points
// per level (17% at level 1). Past the table, λ ≈ 0.78 × target keeps the same slope.
// Infinity = uniform. Re-run tools/balance.js before changing these.
const TILE_LAMBDA = [Infinity, 189, 40, 26, 24, 21, 20, 20, 21.5, 21, 22.7, 22.7, 24.4, 26.1, 27.2, 30]
const MAX_FREE_SHUFFLES = 3
// with no free shuffles left, a shuffle costs SHUFFLE_COST × level × (paid shuffles so far + 1).
// A flat cost made careful play endless in simulation; the growing cost keeps games finite.
const SHUFFLE_COST = 10
// a sum made entirely of one color scores double
const COMBO_MULTIPLIER = 2
// special tiles: a wild tile (★) is worth exactly what the sum still needs and matches any
// color; a double tile (×2) doubles the points of the sum it joins (stacks with combos)
const WILD_CHANCE = 0.03
const DOUBLE_CHANCE = 0.06
// a frozen tile can't be played until ICE_SUMS more sums are completed (journey obstacle)
const ICE_SUMS = 2
const DAILY_SUMS = 12 // a daily challenge is levels 1–3: short and comparable

const targetFor = lv => (lv < TARGETS.length ? TARGETS[lv] : TARGETS[TARGETS.length - 1] + 2 * (lv - TARGETS.length + 1))
const lambdaFor = lv => (lv < TILE_LAMBDA.length ? TILE_LAMBDA[lv] : 0.78 * targetFor(lv))
const shuffleCostFor = (lv, paid) => SHUFFLE_COST * (lv + 1) * (paid + 1)

function drawValue(lv, rnd) {
    const max = targetFor(lv) - 1
    const lambda = lambdaFor(lv)
    if (lambda === Infinity) return Math.floor(rnd() * max) + 1
    // weighted pick: weight of v is exp(-v / λ)
    let total = 0
    for (let v = 1; v <= max; v++) total += Math.exp(-v / lambda)
    let r = rnd() * total
    for (let v = 1; v <= max; v++) {
        r -= Math.exp(-v / lambda)
        if (r <= 0) return v
    }
    return max
}

const drawColor = rnd => COLORS[Math.floor(rnd() * COLORS.length)]

// value, color, then the special roll: the order matters for seeded sequences. The special
// roll is always drawn, even when specials are off, so both cases consume the same numbers.
function drawTile(lv, rnd, specials = true) {
    const value = drawValue(lv, rnd)
    const color = drawColor(rnd)
    const roll = rnd()
    const special = !specials ? null : roll < WILD_CHANCE ? 'wild' : roll < WILD_CHANCE + DOUBLE_CHANCE ? 'double' : null
    return special ? { value, color, special } : { value, color }
}

// what a tile adds to the sum: a wild tile fills exactly what is missing
const tileValue = (tile, need) => (tile.special === 'wild' ? need : tile.value)
// whether a tile can be played now
const canPlay = (tile, need) => !tile.ice && (tile.special === 'wild' || tile.value <= need)

// points for a completed sum: tiles used × level, doubled when every tile shares a color
// (wild tiles match any color) and doubled again for each ×2 tile in it
function sumPoints(parts, lv) {
    const colored = parts.filter(p => p.special !== 'wild')
    const combo = parts.length >= 2 && colored.every(p => p.color === (colored[0] || p).color)
    const doubles = parts.filter(p => p.special === 'double').length
    const points = parts.length * (lv + 1) * (combo ? COMBO_MULTIPLIER : 1) * 2 ** doubles
    return { points, combo, doubles }
}

// ---------- seeded randomness ----------

function hashSeed(text) {
    let h = 2166136261 // FNV-1a
    for (const ch of `plus9:${text}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
    return h | 0
}

// mulberry32; `state` can be saved and restored to resume a sequence exactly
function createRng(seed) {
    const gen = {
        state: seed | 0,
        random() {
            let t = (gen.state = (gen.state + 0x6D2B79F5) | 0)
            t = Math.imul(t ^ (t >>> 15), t | 1)
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296
        },
    }
    return gen
}

// ---------- journey ----------

// Board seeds for journey levels 1–60, chosen by tools/journey.js so the share of typical
// players who finish falls smoothly from 95% (level 1) to 40%. Past 60, seeds are unchecked.
const JOURNEY_SEEDS = [
    -379896306, 180182684, -2121801329, 573878263, -1846710963, -534442939,
    1321658012, 2109272321, -1763492830, -215909369, 1884198763, -745356091,
    1893195087, 2138459205, 970594561, 1837064158, -2090012157, 1203587240,
    -1987899275, -816915529, -1287550635, 2023935127, 1529889490, 2143558191,
    -225536298, -1192084894, -1564676465, -534140330, -712845400, 1234602441,
    1884689658, 2029929591, -400925218, 1583288150, 1872010784, -152537883,
    821495000, 740952252, 1299623127, 590034053, -1741297103, 778195952,
    671315480, 98943072, -2137092345, -1884233377, -1826299123, 44039830,
    -391108722, 808364326, 297051319, 514201628, 966836814, -891080828,
    -1518673698, 320179099, -1470457971, -1672175794, -914875249, 476344523,
]

// Level n (1-based) is a fixed, seeded board: make the target `sums` times at a fixed
// difficulty. Difficulty rises every 5 levels; within a tier the number of sums grows.
// Levels 1–4 teach the basics (level 1 starts from a hand-picked board). Special tiles
// appear from level 6, which hands out a wild tile; level 7 hands out a ×2 tile. From
// level 11, some levels start with frozen tiles; level 11 introduces them.
// `setup` changes tiles after the deal: { index, special } or { index, ice }.
function journeyLevel(n) {
    const tier = Math.floor((n - 1) / 5)
    const level = {
        n,
        lv: tier,
        target: targetFor(tier),
        sums: 3 + ((n - 1) % 5),
        seed: n <= JOURNEY_SEEDS.length ? JOURNEY_SEEDS[n - 1] : hashSeed(`journey:${n}`),
        initial: null,
        specials: n >= 6,
        setup: [],
    }
    if (n === 6) level.setup = [{ index: 3, special: 'wild' }]
    if (n === 7) level.setup = [{ index: 1, special: 'double' }]
    // frozen tiles: two on the 1st, 3rd and 5th level of every tier from level 11
    if (n >= 11 && [0, 2, 4].includes((n - 1) % 5)) level.setup = [{ index: 0, ice: ICE_SUMS }, { index: 7, ice: ICE_SUMS }]
    if (n === 1) {
        level.initial = {
            tiles: [4, 5, 2, 7, 3, 6, 1, 8].map((value, i) => ({ value, color: COLORS[i % COLORS.length] })),
            next: { value: 4, color: COLORS[2] },
        }
    }
    return level
}

// apply a journey level's setup to freshly dealt tiles (same in the game and the bot)
function applySetup(tiles, setup) {
    for (const s of setup) {
        if (s.special) tiles[s.index] = { ...tiles[s.index], special: s.special }
        if (s.ice) tiles[s.index] = { ...tiles[s.index], ice: s.ice }
    }
}

if (typeof module !== 'undefined') {
    module.exports = {
        JOURNEY_SEEDS, COLORS, TARGETS, SUMS_PER_LEVEL, TILE_LAMBDA, MAX_FREE_SHUFFLES, SHUFFLE_COST, COMBO_MULTIPLIER, DAILY_SUMS,
        WILD_CHANCE, DOUBLE_CHANCE, ICE_SUMS,
        targetFor, lambdaFor, shuffleCostFor, drawValue, drawColor, drawTile, tileValue, canPlay, sumPoints, hashSeed, createRng,
        journeyLevel, applySetup,
    }
}
