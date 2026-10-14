const test = require('node:test')
const assert = require('node:assert/strict')
const R = require('../rules.js')
const B = require('../bot.js')
const before = require('./fixtures/before-mechanics.json')

test('levels 1–80: star thresholds unchanged', () => {
    const now = Array.from({ length: 80 }, (_, i) => B.journeyStars(R.journeyLevel(i + 1)))
    assert.deepEqual(now, before.stars)
})

test('daily par unchanged', () => {
    const dates = ['2026-10-14', '2026-10-15', '2026-11-01', '2027-01-01', '2027-06-30']
    assert.deepEqual(dates.map(d => B.dailyPar(R.hashSeed(d))), before.par)
})

test('classic runs unchanged', () => {
    const now = []
    for (const seed of [7, 99, 12345]) for (const player of ['careful', 'normal']) for (const bankAt of [null, 3]) {
        now.push(B.simulateRun({ seed, sums: 60, levelUps: true, player, playerSeed: seed + 1, bankAt }))
    }
    assert.deepEqual(now, before.classic)
})

const red = R.COLORS[0]
const t = (value, extra = {}) => ({ value, color: red, ...extra })
const state = (tiles, sum, target = 38, parts = []) => {
    const need = target - sum
    return {
        tiles, next: t(4), parts, sum, need, target,
        plays: tiles.map((x, i) => i).filter(i => R.canPlay(tiles[i], need, sum)),
        // [coupler, tile] pairs in the same order simulateRun builds them (coupler index outer)
        fusions: tiles.flatMap((c, i) => tiles.map((x, j) => [i, j])).filter(([a, b]) => a !== b && R.canFuse(tiles[a], tiles[b], target)),
    }
}

test('careful: exact tile first, then a fusion that makes one, then a minus tile that opens one', () => {
    // need 8: an 8 is there
    assert.deepEqual(B.carefulPick(state([t(12), t(8), t(3, { special: 'coupler' }), t(5)], 30)), { play: 1 })
    // need 8: no 8, but coupler +3 onto the 5 makes one
    assert.deepEqual(B.carefulPick(state([t(12), t(9), t(3, { special: 'coupler' }), t(5)], 30)), { fuse: [2, 3] })
    // need 3: no 3, no coupler; −2 then a 5 fits
    assert.deepEqual(B.carefulPick(state([t(12), t(5), t(2, { special: 'minus' })], 35)), { play: 2 })
})

test('normal: finishes exactly, and spots a finishing fusion only sometimes', () => {
    assert.deepEqual(B.normalPick(state([t(12), t(8)], 30), () => 0.9), { play: 1 })
    const s = state([t(12), t(9), t(3, { special: 'coupler' }), t(5)], 30)
    assert.deepEqual(B.normalPick(s, () => 0.1), { fuse: [2, 3] })
    const other = B.normalPick(s, () => 0.9)
    assert.ok(other.play !== undefined, 'missed the fusion: plays a fitting tile instead')
})

test('runs with mechanics finish and use the new tiles', () => {
    let finished = 0, differ = 0
    for (let n = 81; n <= 100; n++) {
        const d = R.journeyLevel(n)
        const base = { seed: d.seed, lv: d.lv, sums: d.sums, specials: d.specials, setup: d.setup, player: 'careful' }
        const run = B.simulateRun({ ...base, mechanics: d.mechanics })
        if (run.completed) finished++
        // the new tiles are drawn and played: the same board without them goes differently
        if (JSON.stringify(run) !== JSON.stringify(B.simulateRun({ ...base, mechanics: 0 }))) differ++
    }
    assert.ok(finished >= 10, `careful bot finished ${finished} of levels 81–100`)
    assert.ok(differ >= 10, `only ${differ} of levels 81–100 changed with the new tiles`)
})
