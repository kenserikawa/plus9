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

// value first, then color: the order matters for seeded sequences
function drawTile(lv, rnd) {
    const value = drawValue(lv, rnd)
    return { value, color: drawColor(rnd) }
}

// points for a completed sum: tiles used × level, doubled when every tile shares a color
function sumPoints(parts, lv) {
    const combo = parts.length >= 2 && parts.every(p => p.color === parts[0].color)
    return { points: parts.length * (lv + 1) * (combo ? COMBO_MULTIPLIER : 1), combo }
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
    1078087420, -1227249521, 244284235, 372546835, -17656302, 1565009117,
    -1424156040, 556283587, -1746715211, -215909369, 1800310668, 1435881474,
    1943527944, 1542357490, 852857038, -1914825555, -2022754586, 16827163,
    -2054862656, -783360291, -1388216349, 406746420, 1529889490, -104789850,
    -2020197078, 2069107705, -748756935, -399919378, -679290162, 1342649307,
    -548506382, 2013151972, -1322398785, -463184010, 1872010784, -464020038,
    888311286, 690472300, 1053277129, 539701196, -1875665150, -924470263,
    730092427, 216386405, -1706920290, -1632863282, -1943742456, 1172765115,
    1839917247, -2091482169, -430621527, 598236818, 1134907194, -907858447,
    -1803746126, 353587242, -1571270780, -1672028699, -981985725, 325198857,
]

// Level n (1-based) is a fixed, seeded board: make the target `sums` times at a fixed
// difficulty. Difficulty rises every 5 levels; within a tier the number of sums grows.
// Levels 1–4 teach the game; level 1 starts from a hand-picked board.
function journeyLevel(n) {
    const tier = Math.floor((n - 1) / 5)
    const level = {
        n,
        lv: tier,
        target: targetFor(tier),
        sums: 3 + ((n - 1) % 5),
        seed: n <= JOURNEY_SEEDS.length ? JOURNEY_SEEDS[n - 1] : hashSeed(`journey:${n}`),
        initial: null,
    }
    if (n === 1) {
        level.initial = {
            tiles: [4, 5, 2, 7, 3, 6, 1, 8].map((value, i) => ({ value, color: COLORS[i % COLORS.length] })),
            next: { value: 4, color: COLORS[2] },
        }
    }
    return level
}

if (typeof module !== 'undefined') {
    module.exports = {
        JOURNEY_SEEDS, COLORS, TARGETS, SUMS_PER_LEVEL, TILE_LAMBDA, MAX_FREE_SHUFFLES, SHUFFLE_COST, COMBO_MULTIPLIER, DAILY_SUMS,
        targetFor, lambdaFor, shuffleCostFor, drawValue, drawColor, drawTile, sumPoints, hashSeed, createRng, journeyLevel,
    }
}
