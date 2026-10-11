// Picks a board seed for every journey level so difficulty follows a smooth curve.
// Run with: node tools/journey.js   (prints JOURNEY_SEEDS for rules.js)
//
// Fixed boards vary a lot: two seeds of the same level can be won by 90% or 10% of typical
// players. For each level this tries candidate seeds, estimates how many "normal" simulated
// players finish it, and keeps the seed closest to the target win rate.

const R = require('../rules.js')
const B = require('../bot.js')

const LEVELS = 60
const CANDIDATES = 40
const RUNS = 150
// share of typical players who should finish level n
const winGoal = n => Math.max(0.4, 0.95 - 0.015 * (n - 1))

function winRate(def, seed) {
    let wins = 0
    for (let k = 0; k < RUNS; k++) {
        const run = B.simulateRun({ seed, lv: def.lv, sums: def.sums, initial: def.initial, specials: def.specials, setup: def.setup, player: 'normal', playerSeed: 7919 * k + 1 })
        if (run.completed) wins++
    }
    return wins / RUNS
}

const seeds = []
const report = []
for (let n = 1; n <= LEVELS; n++) {
    const def = R.journeyLevel(n)
    const goal = winGoal(n)
    let best = null
    for (let k = 0; k < CANDIDATES; k++) {
        const seed = R.hashSeed(`journey:${n}:${k}`)
        const rate = winRate(def, seed)
        const miss = Math.abs(rate - goal)
        if (!best || miss < best.miss) best = { seed, rate, miss }
    }
    seeds.push(best.seed)
    report.push({ level: n, target: def.target, sums: def.sums, goal: Math.round(goal * 100) + '%', got: Math.round(best.rate * 100) + '%' })
}

console.table(report)
console.log(`const JOURNEY_SEEDS = [${seeds.join(', ')}]`)
