// node --test tests/*.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const R = require('../rules.js')
const before = require('./fixtures/before-mechanics.json')

const red = R.COLORS[0], blue = R.COLORS[1]
const tile = (value, extra = {}) => ({ value, color: red, ...extra })

test('draws without mechanics are unchanged', () => {
    for (const [key, list] of Object.entries(before.draws)) {
        const [seed, lv, specials] = key.split(':')
        const rnd = R.createRng(+seed).random
        const now = Array.from({ length: list.length }, () => R.drawTile(+lv, rnd, specials === 'true'))
        assert.deepEqual(now, list, key)
    }
})

test('mechanics 1 draws minus tiles worth 1..5 and never couplers; 2 draws both', () => {
    for (const mechanics of [1, 2]) {
        const rnd = R.createRng(7).random
        const tiles = Array.from({ length: 4000 }, () => R.drawTile(15, rnd, true, mechanics))
        const minus = tiles.filter(t => t.special === 'minus')
        const couplers = tiles.filter(t => t.special === 'coupler')
        assert.ok(minus.length > 100, `minus tiles drawn with mechanics ${mechanics}`)
        assert.ok(minus.every(t => t.value >= 1 && t.value <= 5))
        if (mechanics === 1) assert.equal(couplers.length, 0)
        else {
            assert.ok(couplers.length > 100)
            assert.ok(couplers.every(t => t.value >= 1 && t.value <= 5))
        }
    }
})

test('no specials means no minus or coupler tiles either', () => {
    const rnd = R.createRng(3).random
    const tiles = Array.from({ length: 2000 }, () => R.drawTile(15, rnd, false, 2))
    assert.ok(tiles.every(t => !t.special))
})

test('a minus tile subtracts and needs the sum to afford it', () => {
    const m = tile(3, { special: 'minus' })
    assert.equal(R.tileValue(m, 10), -3)
    assert.equal(R.canPlay(m, 38, 0), false, 'empty centre')
    assert.equal(R.canPlay(m, 36, 2), false, 'sum 2 < 3')
    assert.equal(R.canPlay(m, 35, 3), true, 'sum 3')
    assert.equal(R.canPlay({ ...m, ice: 2 }, 30, 8), false, 'frozen')
})

test('a coupler never goes to the centre; number tiles still follow need', () => {
    assert.equal(R.canPlay(tile(2, { special: 'coupler' }), 30, 8), false)
    assert.equal(R.canPlay(tile(5), 5), true)
    assert.equal(R.canPlay(tile(6), 5), false)
    assert.equal(R.canPlay(tile(9, { special: 'wild' }), 1), true)
})

test('minus tiles do not count as tiles or colors', () => {
    const parts = [tile(20), tile(-3, { special: 'minus', color: blue }), tile(21)]
    assert.equal(R.tilesUsed(parts), 2)
    const { points, combo } = R.sumPoints(parts, 15)
    assert.equal(combo, true, 'two red tiles: the blue minus tile does not break the combo')
    assert.equal(points, 2 * 16 * R.COMBO_MULTIPLIER)
    assert.equal(R.keepsCombo([tile(5)], tile(2, { special: 'minus', color: blue })), true)
})

test('couplers fuse onto number, ×2 and rainbow tiles within the target', () => {
    const c = tile(3, { special: 'coupler' })
    assert.equal(R.canFuse(c, tile(5), 38), true)
    assert.equal(R.canFuse(c, tile(5, { special: 'double' }), 38), true)
    assert.equal(R.canFuse(c, tile(5, { special: 'rainbow' }), 38), true)
    assert.equal(R.canFuse(c, tile(35), 38), true, '35 + 3 = 38 is fine')
    assert.equal(R.canFuse(c, tile(36), 38), false, 'past the target')
    for (const special of ['wild', 'minus', 'coupler']) assert.equal(R.canFuse(c, tile(5, { special }), 38), false, special)
    assert.equal(R.canFuse(c, tile(5, { ice: 2 }), 38), false, 'frozen')
    assert.equal(R.canFuse(tile(3), tile(5), 38), false, 'only couplers fuse')
    assert.deepEqual(R.fuse(tile(5, { special: 'double', color: blue }), c), { value: 8, color: blue, special: 'double' })
})

test('stuck: something in the centre, no tile can go in and no fusion is possible', () => {
    const target = 38
    // sum 30, need 8: tiles too big, nothing to fuse → stuck
    assert.equal(R.isStuck([tile(9), tile(12)], 30, target), true)
    // a legal fusion is a move: the coupler's slot takes Next, which may fit → not stuck
    assert.equal(R.isStuck([tile(9), tile(12), tile(3, { special: 'coupler' })], 30, target), false)
    // a coupler with nowhere to go (the other tiles frozen, or pushed past the target) → stuck
    assert.equal(R.isStuck([tile(5, { ice: 2 }), tile(36), tile(3, { special: 'coupler' })], 37, target), true)
    // a tile that fits → not stuck
    assert.equal(R.isStuck([tile(9), tile(5), tile(3, { special: 'coupler' })], 30, target), false)
    // a minus tile the sum can afford → not stuck
    assert.equal(R.isStuck([tile(9), tile(2, { special: 'minus' })], 30, target), false)
    // empty centre is never stuck
    assert.equal(R.isStuck([tile(40)], 0, target), false)
})

test('setup can set a value; levels 81 and 91 hand out their tile; mechanics by level', () => {
    const dealt = [tile(10), tile(11), tile(12), tile(13)]
    R.applySetup(dealt, [{ index: 3, special: 'minus', value: 3 }])
    assert.deepEqual(dealt[3], { value: 3, color: red, special: 'minus' })
    assert.equal(R.journeyLevel(80).mechanics, 0)
    assert.equal(R.journeyLevel(81).mechanics, 1)
    assert.equal(R.journeyLevel(90).mechanics, 1)
    assert.equal(R.journeyLevel(91).mechanics, 2)
    assert.equal(R.journeyLevel(250).mechanics, 2)
    assert.ok(R.journeyLevel(81).setup.some(s => s.special === 'minus' && s.value === 3))
    assert.ok(R.journeyLevel(91).setup.some(s => s.special === 'coupler' && s.value === 3))
    assert.ok(R.journeyLevel(81).setup.some(s => s.ice), 'level 81 still starts with ice')
})
