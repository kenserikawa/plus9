// Balance simulator for Plus 9. Run with: node tools/balance.js
// Uses rules.js and bot.js directly, so the numbers always match the game.
//
// 1. Per level: how often a sum hits a dead end (no tile fits) for three kinds of player.
// 2. Whole open games (Classic rules: level-ups, free + paid shuffles, never banking).
//
// Players: careless = biggest tile that fits; normal = finish if a tile fits exactly,
// else any tile that fits; careful = bot.js lookahead player.

const R = require('../rules.js')
const B = require('../bot.js')

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
    const t = R.targetFor(lv), draw = () => R.drawValue(lv, Math.random)
    let tiles = Array.from({ length: 8 }, draw), next = draw(), dead = 0, moves = 0
    for (let k = 0; k < n; k++) {
        let sum = 0, hit = false
        while (sum < t) {
            const need = t - sum, fits = tiles.map((v, i) => [v, i]).filter(([v]) => v <= need)
            if (!fits.length) { hit = true; tiles = tiles.map(draw); continue }
            const [v, i] = pick(fits, need, tiles, next)
            sum += v; tiles[i] = next; next = draw(); moves++
        }
        if (hit) dead++
    }
    return { dead: (100 * dead / n).toFixed(1) + '%', tilesPerSum: (moves / n).toFixed(2) }
}

console.log('Dead-end rate per level (% of sums where no tile fits at some point)')
console.table(Array.from({ length: 12 }, (_, lv) => {
    const row = { level: lv + 1, target: R.targetFor(lv) }
    for (const [name, pick] of Object.entries(players)) row[name] = deadEndRate(lv, pick).dead
    row.tilesPerSum = deadEndRate(lv, players.normal).tilesPerSum
    return row
}))

// whole games use bot.js, which also plays colors (combos ×2) and the shuffle economy
console.log('Whole Classic games (1000 each; bot pays for a shuffle while it costs under a third of its score)')
console.table(['normal', 'careful'].map(player => {
    const res = Array.from({ length: 1000 }, (_, k) =>
        B.simulateRun({ seed: R.hashSeed(`balance:${k}`), levelUps: true, player, playerSeed: k + 1 }))
        .sort((a, b) => a.sums - b.sums)
    const q = p => res[Math.floor(res.length * p)]
    return {
        player,
        'sums p10': q(0.1).sums, 'sums p50': q(0.5).sums, 'sums p90': q(0.9).sums,
        'score p50': q(0.5).score,
        endless: res.filter(r => r.sums >= 1000).length,
    }
}))
