const test = require('node:test')
const assert = require('node:assert/strict')
Object.assign(globalThis, require('../rules.js'))

// a localStorage that lives in a Map; each test starts empty
const store = new Map()
globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
}
const { meta } = require('../meta.js')
const stars = n => store.set('plus9.wallet', JSON.stringify({ missionStars: n }))
test.beforeEach(() => store.clear())

test('colors unlock at their star totals; gold is always there', () => {
    const c = id => meta.NINE_COLORS.find(x => x.id === id)
    assert.deepEqual(meta.NINE_COLORS.map(x => [x.id, x.stars]), [['gold', 0], ['mint', 10], ['sky', 25], ['coral', 45], ['violet', 70], ['chrome', 110], ['rainbow', 150]])
    assert.equal(meta.colorUnlocked(c('gold')), true)
    stars(9)
    assert.equal(meta.colorUnlocked(c('mint')), false)
    stars(10)
    assert.equal(meta.colorUnlocked(c('mint')), true)
})

test('a saved color that is locked falls back to gold', () => {
    meta.setNineColor('chrome')
    stars(50)
    assert.equal(meta.nineColor(), 'gold')
    stars(110)
    assert.equal(meta.nineColor(), 'chrome')
    store.set('plus9.nineColor', JSON.stringify('purple-ish'))
    assert.equal(meta.nineColor(), 'gold')
})

test('star themes unlock by stars, world themes by reaching the world', () => {
    const t = id => meta.THEMES.find(x => x.id === id)
    assert.deepEqual(meta.THEMES.filter(x => x.stars).map(x => [x.id, x.stars]), [['lofi', 20], ['jazz', 50], ['arcade', 90], ['fiesta', 130]])
    meta.setTheme('jazz')
    stars(49)
    assert.equal(meta.theme(), 'grape')
    stars(50)
    assert.equal(meta.theme(), 'jazz')
    assert.equal(meta.themeUnlocked(t('sunset')), false)
    for (let n = 1; n <= 10; n++) meta.journeyRecord(n, 1)
    assert.equal(meta.themeUnlocked(t('sunset')), true)
})

test('the next reward walks the ladder across items, colors and themes', () => {
    const at = n => { stars(n); const r = meta.nextReward(); return r && `${r.kind}:${r.id}:${r.stars}` }
    assert.equal(at(0), 'color:mint:10')
    assert.equal(at(10), 'item:cap:15')
    assert.equal(at(15), 'theme:lofi:20')
    assert.equal(at(59), 'item:crown:60')
    assert.equal(at(149), 'color:rainbow:150')
    assert.equal(at(150), null)
})

test('old saves see nothing new until something unlocks after the update', () => {
    stars(12)
    assert.equal(meta.seenUnlocks(), null, 'no record yet')
    meta.markUnlocksSeen()
    assert.equal(meta.hasUnseenUnlocks(), false)
    assert.ok(meta.unlockedRewards().includes('color:mint'))
    assert.ok(!meta.unlockedRewards().includes('color:gold'), 'gold is not a reward')
    stars(15)
    assert.equal(meta.hasUnseenUnlocks(), true, 'the cap is new')
    meta.markUnlocksSeen()
    assert.equal(meta.hasUnseenUnlocks(), false)
})

test('the New! dot never sticks when storage fails or holds something odd', () => {
    store.set('plus9.seenUnlocks', JSON.stringify({ not: 'an array' }))
    assert.doesNotThrow(() => meta.hasUnseenUnlocks())
    assert.equal(meta.hasUnseenUnlocks(), false)
    const real = globalThis.localStorage
    globalThis.localStorage = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    try {
        assert.equal(meta.hasUnseenUnlocks(), false, 'no record can be kept, so nothing is shown as new')
    } finally {
        globalThis.localStorage = real
    }
})
