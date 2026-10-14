// Progress that lives outside a single game: journey stars, daily missions, the star wallet,
// and what it unlocks: themes, Nine's wardrobe and colors. Plain data on top of localStorage (always try/catch).

const meta = (() => {
    const load = (key, fallback) => {
        try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
    }
    const save = (key, value) => {
        try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage unavailable */ }
    }

    const dayKey = (date = new Date()) => {
        const pad = n => String(n).padStart(2, '0')
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    }

    // ---------- journey ----------

    // { stars: { [level]: 0..3 } } — a level is unlocked when the previous one has a star
    const journey = () => load('plus9.journey', { stars: {} })

    function journeyRecord(n, stars) {
        const data = journey()
        const before = data.stars[n] || 0
        data.stars[n] = Math.max(before, stars)
        save('plus9.journey', data)
        return data.stars[n] - before // stars newly earned
    }

    const journeyStarsOf = n => journey().stars[n] || 0
    const journeyStarTotal = () => Object.values(journey().stars).reduce((a, b) => a + b, 0)
    // the next level to play: one past the furthest level with at least one star
    function journeyFrontier() {
        const stars = journey().stars
        let n = 1
        while (stars[n] > 0) n++
        return n
    }

    // ---------- daily missions ----------

    // `count` missions add up over the day; `max` missions take the best single game.
    // Their text is in i18n.js as mission.<id>.
    const MISSIONS = [
        { id: 'chains4', goal: 3, count: true },
        { id: 'combos', goal: 2, count: true },
        { id: 'score80', goal: 80 },
        { id: 'sums15', goal: 15, count: true },
        { id: 'daily', goal: 1, count: true },
        { id: 'journey2', goal: 2, count: true },
        { id: 'level4', goal: 4 },
    ]

    // three missions a day, the same for everyone (seeded by the date)
    function todaysMissions() {
        const key = dayKey()
        const saved = load('plus9.missions', null)
        if (saved && saved.date === key) return saved
        const rnd = createRng(hashSeed(`missions:${key}`)).random
        const pool = [...MISSIONS]
        const items = []
        while (items.length < 3) items.push({ id: pool.splice(Math.floor(rnd() * pool.length), 1)[0].id, progress: 0, done: false })
        const fresh = { date: key, items }
        save('plus9.missions', fresh)
        return fresh
    }

    // returns the missions completed by this event, so the UI can celebrate them
    function missionEvent(id, amount) {
        const data = todaysMissions()
        const completed = []
        for (const item of data.items) {
            const def = MISSIONS.find(m => m.id === item.id)
            if (item.id !== id || item.done) continue
            item.progress = def.count ? item.progress + amount : Math.max(item.progress, amount)
            if (item.progress >= def.goal) {
                item.progress = def.goal
                item.done = true
                completed.push(def)
                const wallet = load('plus9.wallet', { missionStars: 0 })
                wallet.missionStars++
                save('plus9.wallet', wallet)
            }
        }
        save('plus9.missions', data)
        return completed
    }

    // stars won by watching a 🎬 ad on a journey result; they share the wallet with mission stars
    function addBonusStars(n) {
        const wallet = load('plus9.wallet', { missionStars: 0 })
        wallet.bonusStars = (wallet.bonusStars || 0) + n
        save('plus9.wallet', wallet)
    }

    const missionList = () => todaysMissions().items.map(item => ({ ...MISSIONS.find(m => m.id === item.id), ...item }))

    // ---------- stars and themes ----------

    function totalStars() {
        const wallet = load('plus9.wallet', { missionStars: 0 })
        return journeyStarTotal() + wallet.missionStars + (wallet.bonusStars || 0)
    }

    // ---------- worlds, themes and Nine's wardrobe ----------
    // Themes: one per journey world (WORLDS in rules.js), unlocked when the player reaches it,
    // then four bought with total stars, each with its own background and music.
    // Names are in i18n.js as theme.<id>.
    const THEMES = [
        ...WORLDS.map((w, i) => ({ id: w.id, world: i })),
        { id: 'lofi', stars: 20 },
        { id: 'jazz', stars: 50 },
        { id: 'arcade', stars: 90 },
        { id: 'fiesta', stars: 130 },
    ]

    // a world is reached once the previous world's boss has a star
    const worldReached = w => journeyFrontier() > w * WORLD_SIZE
    // a world is complete once its boss has a star
    const worldComplete = w => journeyStarsOf((w + 1) * WORLD_SIZE) > 0

    const themeUnlocked = t => (t.world !== undefined ? worldReached(t.world) : totalStars() >= t.stars)

    function theme() {
        const id = load('plus9.theme', 'grape')
        const t = THEMES.find(x => x.id === id)
        return t && themeUnlocked(t) ? t.id : 'grape'
    }

    const setTheme = id => save('plus9.theme', id)

    // Nine's wardrobe: one item per completed world, plus a few bought with total stars.
    // One item per slot can be worn. Names are in i18n.js as item.<id>.
    const WARDROBE = [
        ...WORLDS.map((w, i) => ({ id: w.reward, world: i })),
        { id: 'cap', stars: 15 },
        { id: 'scarf', stars: 30 },
        { id: 'crown', stars: 60 },
    ]
    const SLOTS = {
        party: 'head', wizard: 'head', explorer: 'head', antennae: 'head', headphones: 'head', tophat: 'head', cap: 'head', crown: 'head',
        shades: 'face', goggles: 'face', welder: 'face',
        bowtie: 'neck', scarf: 'neck',
    }
    WARDROBE.forEach(item => { item.slot = SLOTS[item.id] })

    const itemUnlocked = item => (item.world !== undefined ? worldComplete(item.world) : totalStars() >= item.stars)

    // what Nine wears: { head, face, neck } of unlocked item ids
    function outfit() {
        const saved = load('plus9.outfit', {})
        const worn = {}
        for (const [slot, id] of Object.entries(saved)) {
            const item = WARDROBE.find(x => x.id === id)
            if (item && item.slot === slot && itemUnlocked(item)) worn[slot] = id
        }
        return worn
    }

    // put an item on, or take it off if it is already worn
    function toggleItem(id) {
        const item = WARDROBE.find(x => x.id === id)
        if (!item || !itemUnlocked(item)) return outfit()
        const worn = outfit()
        if (worn[item.slot] === id) delete worn[item.slot]
        else worn[item.slot] = id
        save('plus9.outfit', worn)
        return worn
    }

    function wear(id) {
        const item = WARDROBE.find(x => x.id === id)
        if (!item || !itemUnlocked(item)) return
        save('plus9.outfit', { ...outfit(), [item.slot]: id })
    }

    // ---------- Nine's colors and the star ladder ----------
    // Rewards for total stars are thresholds: stars are never spent. Nine's colors: gold is
    // the default, the rest unlock with stars (names in i18n.js as nine.<id>); chrome and
    // rainbow are gradients (styles.css [data-nine]).
    const NINE_COLORS = [
        { id: 'gold', stars: 0 },
        { id: 'mint', stars: 10 },
        { id: 'sky', stars: 25 },
        { id: 'coral', stars: 45 },
        { id: 'violet', stars: 70 },
        { id: 'chrome', stars: 110 },
        { id: 'rainbow', stars: 150 },
    ]
    const colorUnlocked = c => totalStars() >= c.stars

    function nineColor() {
        const id = load('plus9.nineColor', 'gold')
        const c = NINE_COLORS.find(x => x.id === id)
        return c && colorUnlocked(c) ? c.id : 'gold'
    }

    const setNineColor = id => save('plus9.nineColor', id)

    // every star-priced reward: wardrobe star items, colors and star themes
    const starRewards = () => [
        ...WARDROBE.filter(i => i.stars !== undefined).map(i => ({ kind: 'item', id: i.id, stars: i.stars })),
        ...NINE_COLORS.filter(c => c.stars > 0).map(c => ({ kind: 'color', id: c.id, stars: c.stars })),
        ...THEMES.filter(t => t.stars !== undefined).map(t => ({ kind: 'theme', id: t.id, stars: t.stars })),
    ]

    // the cheapest one still locked, for the home card; null when all are unlocked
    function nextReward() {
        const have = totalStars()
        return starRewards().filter(r => r.stars > have).sort((a, b) => a.stars - b.stars)[0] || null
    }

    // everything unlocked now, as 'kind:id' (wardrobe items, colors past gold, themes)
    const unlockedRewards = () => [
        ...WARDROBE.filter(itemUnlocked).map(i => `item:${i.id}`),
        ...NINE_COLORS.filter(c => c.stars > 0 && colorUnlocked(c)).map(c => `color:${c.id}`),
        ...THEMES.filter(themeUnlocked).map(t => `theme:${t.id}`),
    ]

    // what the player has seen in Customize (null before the first record: app.js records the
    // current unlocks at boot, so an old save doesn't show New! for things it already had)
    const seenUnlocks = () => load('plus9.seenUnlocks', null)
    const markUnlocksSeen = () => save('plus9.seenUnlocks', unlockedRewards())
    const hasUnseenUnlocks = () => {
        const seen = seenUnlocks() || []
        return unlockedRewards().some(id => !seen.includes(id))
    }

    return {
        dayKey, journeyRecord, journeyStarsOf, journeyStarTotal, journeyFrontier,
        todaysMissions, missionEvent, missionList, addBonusStars, totalStars, THEMES, theme, setTheme,
        worldReached, worldComplete, WARDROBE, itemUnlocked, outfit, toggleItem, wear,
        themeUnlocked, NINE_COLORS, colorUnlocked, nineColor, setNineColor, nextReward, unlockedRewards,
        seenUnlocks, markUnlocksSeen, hasUnseenUnlocks,
    }
})()

if (typeof module !== 'undefined') module.exports = { meta }
