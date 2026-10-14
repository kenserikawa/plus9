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
// color; a double tile (×2) doubles the points of the sum it joins (stacks with combos);
// a rainbow tile keeps its number but matches any color, so it never breaks a combo
const WILD_CHANCE = 0.03
const DOUBLE_CHANCE = 0.06
const RAINBOW_CHANCE = 0.04
// journey worlds 9 and 10 (levels 81+ and 91+): minus tiles subtract from the sum, couplers
// fuse onto a board tile; both are worth 1…MECHANIC_SIZE
const MINUS_CHANCE = 0.05
const COUPLER_CHANCE = 0.05
const MECHANIC_SIZE = 5
// a frozen tile can't be played until ICE_SUMS more sums are completed (journey obstacle)
const ICE_SUMS = 2
const DAILY_SUMS = 12 // a daily challenge is levels 1–3: short and comparable
// Classic streak: completed sums go into a pot instead of the score, the k-th sum in a row
// worth k times its points (up to STREAK_MAX). Cashing in moves the pot to the score and
// restarts the streak; getting stuck loses the pot. Tuned with tools/balance.js: banking at
// ×3–×5 beats both cashing every sum and never cashing.
const STREAK_MAX = 5

const targetFor = lv => (lv < TARGETS.length ? TARGETS[lv] : TARGETS[TARGETS.length - 1] + 2 * (lv - TARGETS.length + 1))
const lambdaFor = lv => (lv < TILE_LAMBDA.length ? TILE_LAMBDA[lv] : 0.78 * targetFor(lv))
const shuffleCostFor = (lv, paid) => SHUFFLE_COST * (lv + 1) * (paid + 1)
// multiplier of the `chain`-th sum in a row (1-based)
const streakMultiplier = chain => Math.min(Math.max(chain, 1), STREAK_MAX)

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

// what a tile adds to the sum: a wild tile fills exactly what is missing, a minus tile takes away
const tileValue = (tile, need) => (tile.special === 'wild' ? need : tile.special === 'minus' ? -tile.value : tile.value)
// can it go into the centre now? A coupler never does; a minus tile only while the sum stays at 0 or more
const canPlay = (tile, need, sum = 0) => !tile.ice && tile.special !== 'coupler'
    && (tile.special === 'wild' || (tile.special === 'minus' ? tile.value <= sum : tile.value <= need))

// wild and rainbow tiles take on any color
const anyColor = tile => tile.special === 'wild' || tile.special === 'rainbow'
// whether `tile` keeps the parts so far a one-color combo (minus tiles have no color)
const keepsCombo = (parts, tile) => anyColor(tile) || tile.special === 'minus'
    || parts.every(p => anyColor(p) || p.special === 'minus' || p.color === tile.color)

// a minus tile is a tool, not a tile that scores: it adds no count and has no color
const tilesUsed = parts => parts.filter(p => p.special !== 'minus').length
// points for a completed sum: tiles used × level, doubled when every tile shares a color
// (wild and rainbow tiles match any color) and doubled again for each ×2 tile in it
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

// stuck: something is in the centre, no tile can go in and no fusion is possible. Any legal
// fusion counts as a move: the fused tile only grows, but the coupler's slot takes Next, which
// may be the tile that fits
function isStuck(tiles, sum, target) {
    if (sum === 0) return false
    if (tiles.some(t => canPlay(t, target - sum, sum))) return false
    return !tiles.some(c => tiles.some(t => t !== c && canFuse(c, t, target)))
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

// Board seeds for journey levels 1–200, chosen by tools/journey.js so the share of typical
// players who finish falls smoothly from 95% (level 1) to 40% (bosses a notch lower, down to
// 33%), then stays there (levels 81+ share one difficulty, see JOURNEY_PEAK_TIER).
// Past the last one, levels reuse the seeds from 81 on in a cycle (journeySeedIndex).
const JOURNEY_SEEDS = [
    -379896306, 180182684, -2121801329, 573878263, -1846710963, -534442939,
    1321658012, 505803635, -1763492830, 595326767, 1884198763, -745356091,
    1893195087, 2138459205, 970594561, 1837064158, -2090012157, 1203587240,
    -1987899275, -816915529, -1287550635, 2023935127, 1529889490, 2143558191,
    -225536298, -1192084894, -1564676465, -534140330, -712845400, -687045234,
    1884689658, 2029929591, -400925218, 1583288150, 1872010784, -152537883,
    821495000, 740952252, 1299623127, 489368339, -1741297103, 778195952,
    671315480, 98943072, -2137092345, -1884233377, -1826299123, 44039830,
    -391108722, -1053554025, 297051319, 514201628, 966836814, -891080828,
    -1518673698, 320179099, -1470457971, -1672175794, -914875249, -1686491797,
    -24605530, 105828790, 652400382, 1069961922, -1675282448, -1495353914,
    546800346, -1540375965, -1791665936, -1347920353, -1252477915, -1148025569,
    -470205028, -2068712347, -1918348772, 285086755, -1391042929, -672549404,
    1415370038, 1861286507, 1433808361, 928230371, -190474566, 464427210,
    -613316801, -1182405896, 123182055, 1490462157, 863656844, -126458664,
    187799115, -181914806, 125091784, -1676954901, 1562203642, -2005511480,
    331507695, 1570187241, 1106327871, 1872494218, 962795345, 121178395,
    2046167372, 1949073414, 736322615, -1925794468, 1053059312, -1446370152,
    265084149, -585645407, 299022111, 1391954600, -2135447136, -1636302556,
    1608326398, -1860074327, 283039837, 2097358974, 1274405210, -476523150,
    171139457, 1648904663, -427790573, 332260822, -1417501575, 1754042626,
    -1914702034, -1330236077, 813238519, 1540409688, 1049540837, 1676583208,
    1293223583, -1292328184, -484384296, -1597962992, -2028758692, 2002204159,
    -1996676978, -670963263, 1563428103, 1165243427, -1731362721, 726552414,
    -1165589013, -1395997499, -85083582, -927701661, 1884793004, 1931075009,
    1581297402, 2015192774, -2117295815, -1671987866, -879799365, 950605843,
    -1503832811, -1128960125, 1975997280, -675840518, -744292674, 1762605956,
    1568097124, 963055252, 1690140710, 685964363, -1373261706, 1460974393,
    -313909129, -1120634321, -1684268956, 1497119644, 707934760, 260500571,
    -2143458131, 236628408, 507539051, 840860568, -1135263652, -1388978210,
    -2136355492, -1380476320, -139460121, 739313493, -1906292776, -587308883,
    -1989766003, -1208987296, 1313106287, -69887821, -901503186, 1309570766,
    -1499589426, 646594640, -1117837871, 598546357, 560820314, -506361371,
    -1765303304, 1138766689,
]

// Past the last seed, level n reuses one from 81 on: the cycle is a multiple of 10 levels, so
// the reused level sits at the same place in its world (same sums, boss and frozen tiles).
const JOURNEY_CYCLE_START = 81
function journeySeedIndex(n) {
    if (n <= JOURNEY_SEEDS.length) return n - 1
    const cycle = Math.floor((JOURNEY_SEEDS.length - JOURNEY_CYCLE_START + 1) / 10) * 10
    return JOURNEY_CYCLE_START - 1 + ((n - JOURNEY_CYCLE_START) % cycle)
}

// The journey is split into worlds of WORLD_SIZE levels. Reaching a world unlocks its theme
// (background and music); finishing it (its last level is a boss) gives Nine an accessory.
// Past the last world the journey goes on in it.
const WORLD_SIZE = 10
const WORLDS = [
    { id: 'grape', reward: 'party' },
    { id: 'sunset', reward: 'shades' },
    { id: 'ocean', reward: 'goggles' },
    { id: 'night', reward: 'wizard' },
    { id: 'candy', reward: 'bowtie' },
    { id: 'forest', reward: 'explorer' },
    { id: 'space', reward: 'antennae' },
    { id: 'neon', reward: 'headphones' },
    { id: 'chrome', reward: 'welder' },
    { id: 'gears', reward: 'tophat' },
]
// world index (0-based) of journey level n
const worldOf = n => Math.min(Math.floor((n - 1) / WORLD_SIZE), WORLDS.length - 1)
const isBoss = n => n % WORLD_SIZE === 0

// The journey's numbers stop growing after level 80 (tier 15, target 38): to finish a sum a
// tile must be exactly what is missing, and the bigger the target the less likely that is, so
// past here a bigger target only adds luck. The rest keeps cycling (sums, bosses, ice).
const JOURNEY_PEAK_TIER = 15

// Level n (1-based) is a fixed, seeded board: make the target `sums` times at a fixed
// difficulty. Difficulty rises every 5 levels up to JOURNEY_PEAK_TIER; within a tier the
// number of sums grows.
// Levels 1–4 teach the basics (level 1 starts from a hand-picked board). Special tiles
// appear from level 6, which hands out a wild tile; level 7 hands out a ×2 tile and level 8
// a rainbow tile. Level 81 hands out a minus tile and level 91 a coupler; `mechanics` says which
// of them can be drawn. From level 11, some levels start with frozen tiles; level 11 introduces
// them. The last level of each world is a boss: 8 sums, and three frozen tiles from level 20.
// `setup` changes tiles after the deal: { index, special } or { index, ice }.
function journeyLevel(n) {
    const tier = Math.min(Math.floor((n - 1) / 5), JOURNEY_PEAK_TIER)
    const level = {
        n,
        lv: tier,
        target: targetFor(tier),
        sums: isBoss(n) ? 8 : 3 + ((n - 1) % 5),
        seed: JOURNEY_SEEDS[journeySeedIndex(n)],
        initial: null,
        specials: n >= 6,
        mechanics: n >= 91 ? 2 : n >= 81 ? 1 : 0, // minus tiles from 81, couplers from 91
        setup: [],
        world: worldOf(n),
        boss: isBoss(n),
    }
    if (n === 6) level.setup = [{ index: 3, special: 'wild' }]
    if (n === 7) level.setup = [{ index: 1, special: 'double' }]
    if (n === 8) level.setup = [{ index: 5, special: 'rainbow' }]
    // frozen tiles: two on the 1st, 3rd and 5th level of every tier from level 11
    if (n >= 11 && [0, 2, 4].includes((n - 1) % 5)) level.setup = [{ index: 0, ice: ICE_SUMS }, { index: 7, ice: ICE_SUMS }]
    // bosses add a third frozen tile once ice has been introduced (the first boss is just longer)
    if (level.boss && n > 10) level.setup = [{ index: 0, ice: ICE_SUMS }, { index: 3, ice: ICE_SUMS }, { index: 7, ice: ICE_SUMS }]
    // worlds 9 and 10 each open by handing out their new tile, as levels 6–8 do
    if (n === 81) level.setup.push({ index: 3, special: 'minus', value: 3 })
    if (n === 91) level.setup.push({ index: 3, special: 'coupler', value: 3 })
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
        if (s.value) tiles[s.index] = { ...tiles[s.index], value: s.value }
        if (s.ice) tiles[s.index] = { ...tiles[s.index], ice: s.ice }
    }
}

if (typeof module !== 'undefined') {
    module.exports = {
        JOURNEY_SEEDS, COLORS, TARGETS, SUMS_PER_LEVEL, TILE_LAMBDA, MAX_FREE_SHUFFLES, SHUFFLE_COST, COMBO_MULTIPLIER, DAILY_SUMS,
        WILD_CHANCE, DOUBLE_CHANCE, RAINBOW_CHANCE, MINUS_CHANCE, COUPLER_CHANCE, MECHANIC_SIZE, tilesUsed, canFuse, fuse, isStuck, ICE_SUMS, STREAK_MAX, streakMultiplier, anyColor, keepsCombo,
        targetFor, lambdaFor, shuffleCostFor, drawValue, drawColor, drawTile, tileValue, canPlay, sumPoints, hashSeed, createRng,
        journeyLevel, applySetup, WORLD_SIZE, WORLDS, worldOf, isBoss,
    }
}
