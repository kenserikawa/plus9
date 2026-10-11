// Balance simulator for Plus 9. Run with: node tools/balance.js
// Reads the difficulty constants from app.js so the numbers always match the game.
//
// 1. Per level: how often a sum hits a dead end (no tile fits) for three kinds of player.
// 2. Whole games (free + paid shuffles, never banking): how long they last.
//
// Players: careless = biggest tile that fits; normal = finish if a tile fits exactly,
// else any tile that fits; careful = finish if possible, else the tile that leaves the
// most options (looking at the Next tile too).

const fs = require('fs')
const path = require('path')

const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8')
// constants are plain numbers or arrays of numbers; JSON has no Infinity, so it travels as null
const constant = name => {
    const raw = src.match(new RegExp(`const ${name} = ([^\\n/]+)`))[1].trim()
    return JSON.parse(raw.replace(/Infinity/g, 'null'), (k, v) => (v === null ? Infinity : v))
}
const TARGETS = constant('TARGETS')
const TILE_LAMBDA = constant('TILE_LAMBDA')
const SUMS_PER_LEVEL = constant('SUMS_PER_LEVEL')
const MAX_FREE_SHUFFLES = constant('MAX_FREE_SHUFFLES')
const SHUFFLE_COST = constant('SHUFFLE_COST')

// same rules as app.js
const targetFor = lv => lv < TARGETS.length ? TARGETS[lv] : TARGETS[TARGETS.length - 1] + 2 * (lv - TARGETS.length + 1)
const lambdaFor = lv => lv < TILE_LAMBDA.length ? TILE_LAMBDA[lv] : 0.78 * targetFor(lv)

const samplers = {}
function draw(lv) {
    if (!samplers[lv]) {
        const max = targetFor(lv) - 1, l = lambdaFor(lv), w = []
        for (let v = 1; v <= max; v++) w.push(l === Infinity ? 1 : Math.exp(-v / l))
        const total = w.reduce((a, b) => a + b)
        let acc = 0
        const cum = w.map(x => (acc += x / total))
        samplers[lv] = () => {
            const r = Math.random(), i = cum.findIndex(c => r <= c)
            return (i < 0 ? max - 1 : i) + 1
        }
    }
    return samplers[lv]()
}

const players = {
    careless: fits => fits.sort((a, b) => b[0] - a[0])[0],
    normal: (fits, need) => fits.find(([v]) => v === need) || fits[Math.floor(Math.random() * fits.length)],
    careful: (fits, need, tiles, next) => {
        const exact = fits.find(([v]) => v === need)
        if (exact) return exact
        let best, bestScore = -1
        for (const [v, i] of fits) {
            const rest = need - v, others = tiles.map((o, j) => (j === i ? next : o))
            const s = others.filter(o => o === rest).length * 10 + others.filter(o => o <= rest).length
            if (s > bestScore) { bestScore = s; best = [v, i] }
        }
        return best
    },
}

function deadEndRate(lv, pick, n = 15000) {
    const t = targetFor(lv)
    let tiles = Array.from({ length: 8 }, () => draw(lv)), next = draw(lv), dead = 0, moves = 0
    for (let k = 0; k < n; k++) {
        let sum = 0, hit = false
        while (sum < t) {
            const need = t - sum, fits = tiles.map((v, i) => [v, i]).filter(([v]) => v <= need)
            if (!fits.length) { hit = true; tiles = tiles.map(() => draw(lv)); continue }
            const [v, i] = pick(fits, need, tiles, next)
            sum += v; tiles[i] = next; next = draw(lv); moves++
        }
        if (hit) dead++
    }
    return { dead: (100 * dead / n).toFixed(1) + '%', tilesPerSum: (moves / n).toFixed(2) }
}

function game(pick) {
    let lv = 0, tiles = Array.from({ length: 8 }, () => draw(0)), next = draw(0)
    let sum = 0, sums = 0, free = 1, paid = 0, score = 0, used = 0
    for (let m = 0; m < 60000; m++) {
        lv = Math.floor(sums / SUMS_PER_LEVEL)
        const t = targetFor(lv), need = t - sum
        const fits = tiles.map((v, i) => [v, i]).filter(([v]) => v <= need)
        if (!fits.length) {
            const cost = SHUFFLE_COST * (lv + 1) * (paid + 1)
            if (free > 0) free--
            else if (score >= cost) { score -= cost; paid++ }
            else return { sums, level: lv + 1 }
            tiles = tiles.map(() => draw(lv))
            continue
        }
        const [v, i] = pick(fits, need, tiles, next)
        sum += v; tiles[i] = next; next = draw(lv); used++
        if (sum === t) {
            score += used * (lv + 1); sums++; sum = 0; used = 0
            if (sums % SUMS_PER_LEVEL === 0) free = Math.min(MAX_FREE_SHUFFLES, free + 1)
        }
    }
    return { sums: Infinity, level: Infinity }
}

console.log('Dead-end rate per level (% of sums where no tile fits at some point)')
console.table(Array.from({ length: 12 }, (_, lv) => {
    const row = { level: lv + 1, target: targetFor(lv) }
    for (const [name, pick] of Object.entries(players)) row[name] = deadEndRate(lv, pick).dead
    row.tilesPerSum = deadEndRate(lv, players.normal).tilesPerSum
    return row
}))

console.log('Whole games, always paying for shuffles while affordable (1000 games each)')
console.table(Object.entries(players).map(([name, pick]) => {
    const res = Array.from({ length: 1000 }, () => game(pick)).sort((a, b) => a.sums - b.sums)
    const q = p => res[Math.floor(res.length * p)]
    return {
        player: name,
        'sums p10': q(0.1).sums, 'sums p50': q(0.5).sums, 'sums p90': q(0.9).sums,
        'level p50': q(0.5).level, 'level p90': q(0.9).level,
        endless: res.filter(r => r.sums === Infinity).length,
    }
}))
