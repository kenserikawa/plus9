// Game engine and screens. Rules come from rules.js, simulated players from bot.js,
// long-term progress (journey stars, missions, themes) from meta.js.

const DAILY_EPOCH = '2026-10-11' // daily #1 — set to the launch date before publishing
const TIMED_SECONDS = 60
const TIME_BONUS = 2      // seconds added per completed sum in timed mode
const LEVEL_UP_MS = 1700  // how long the level-up card stays on screen

const $ = id => document.getElementById(id)
const screens = { home: $('home'), map: $('map'), game: $('game') }
const board = $('board')
const well = $('well')
const ring = $('ring')
const sumEl = $('sum')
const needEl = $('need')
const scoreEl = $('score')
const hud2El = $('hud2')
const hud3El = $('hud3')
const nextEl = $('next')
const nextPill = document.querySelector('.next')
const shuffleBtn = $('shuffle')
const shuffleBadge = $('shuffle-badge')
const bankBtn = $('bank')
const bankBadge = $('bank-badge')
const rewardBtn = $('reward')
const clockEl = $('clock')
const clockTimeEl = $('clock-time')
const levelUpEl = $('levelup')
const coachEl = $('coach')
const dialog = $('over')
const againBtn = $('again')
const secondaryBtn = $('over-secondary')
const shareBtn = $('share')
const reviveBtn = $('over-reward')
const help = $('help')

// ---------- state ----------

let tiles = []      // [{ value, color, el }]
let next = null     // { value, color } that replaces the next tile played
let parts = []      // [{ value, color }] of the tiles currently in the well
let sum = 0
let score = 0
let sums = 0        // completed sums this game
let level = 0       // 0-based difficulty; shown to the player as level + 1
let freeShuffles = 1
let paidShuffles = 0
let stuck = false
let revived = false  // the one 🎬 take-back per game has been used
let playing = false
let resolving = false // a completed sum (or the level-up card) is still on show
let mode = 'classic'  // classic | timed | daily | journey
let best = 0
let deadline = 0
let timer = null
let pausedLeft = null // ms left on the clock while paused
let lastSecond = null
let gameId = 0        // bumps on every new game so stale timeouts can bail out
let chainLog = []     // tiles used per completed sum (daily share grid)
let combos = 0        // one-color sums this game
let bestChain = 0
let journeyDef = null // rules.journeyLevel(n) while playing the journey
let journeyGoals = [0, 0, 0] // score for 1★ (finish), 2★, 3★
let tutorialStep = 0

// every random draw goes through rng: Math.random normally, a seeded generator in the
// daily and the journey so the board is the same for everyone
let gen = null
let rng = Math.random

const target = () => targetFor(level)
const specialsOn = () => mode !== 'journey' || journeyDef.specials
const randomTile = () => drawTile(level, rng, specialsOn())
const WILD_COLOR = '#ffd23f' // ring color for the part a wild tile fills
const shuffleCost = () => shuffleCostFor(level, paidShuffles)
const canShuffle = () => freeShuffles > 0 || score >= shuffleCost()
// the daily is one attempt for everyone, so it never offers a take-back
const canRevive = () => platform.hasRewarded && !revived && mode !== 'daily'

// ---------- board setup ----------

function buildRing(intro = false) {
    // one arc segment per unit of the current target
    const n = target(), r = 44, c = 2 * Math.PI * r
    const gap = Math.min(2.2, (c / n) * 0.35), seg = c / n - gap // thinner gaps for big targets
    ring.replaceChildren()
    for (let i = 0; i < n; i++) {
        const arc = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
        arc.setAttribute('cx', 50)
        arc.setAttribute('cy', 50)
        arc.setAttribute('r', r)
        arc.setAttribute('stroke-dasharray', `${seg} ${c - seg}`)
        arc.setAttribute('stroke-dashoffset', -(i * c / n) + c / 4 - gap / 2)
        arc.classList.add('seg')
        if (intro) {
            // segments light up one after another, so the new size of the target is felt
            arc.classList.add('intro')
            arc.style.animationDelay = `${i * 35}ms`
        }
        ring.appendChild(arc)
    }
}

function buildTiles() {
    for (let i = 0; i < 8; i++) {
        const el = document.createElement('button')
        el.className = 'tile'
        el.type = 'button'
        // keep the well in the middle cell of the 3x3 grid
        if (i < 4) board.insertBefore(el, well)
        else board.appendChild(el)
        const tile = { el }
        tiles.push(tile)
        attachInput(tile)
    }
}

function setTile(tile, { value, color, special = null, ice = 0 }) {
    tile.value = value
    tile.color = color
    tile.special = special
    tile.ice = ice || 0
    renderTile(tile)
    bump(tile.el, 'pop-in')
}

// a tile's face: a number, ★ for a wild tile, a ×2 badge, or ice with the sums left to thaw
function renderTile(tile) {
    const el = tile.el
    const wild = tile.special === 'wild'
    el.textContent = wild ? '★' : tile.value
    el.classList.toggle('is-wide', !wild && tile.value >= 10)
    el.classList.toggle('is-wild', wild)
    el.classList.toggle('is-double', tile.special === 'double')
    el.classList.toggle('is-rainbow', tile.special === 'rainbow')
    el.dataset.n = tile.value // the rainbow fill is drawn over the outlined number from this
    el.classList.toggle('is-frozen', tile.ice > 0)
    el.classList.remove('hint')
    el.style.setProperty('--tile', wild ? WILD_COLOR : tile.color)
    if (tile.special === 'double') el.insertAdjacentHTML('beforeend', '<span class="tile-badge" aria-hidden="true">×2</span>')
    if (tile.ice > 0) el.insertAdjacentHTML('beforeend', `<span class="tile-ice" aria-hidden="true">${tile.ice}</span>`)
    el.setAttribute('aria-label',
        tile.ice > 0 ? tr('tile.frozen', { n: tile.value, k: tile.ice })
        : wild ? tr('tile.wild')
        : tile.special === 'double' ? tr('tile.double', { n: tile.value })
        : tile.special === 'rainbow' ? tr('tile.rainbow', { n: tile.value })
        : tr('tile.add', { n: tile.value }))
}

function takeNext() {
    const tile = next
    next = randomTile()
    return tile
}

// ---------- game rules ----------

function play(tile) {
    if (!playing || resolving || stuck || platform.adShowing) return
    platform.gameplayStart()
    if (mode === 'timed' && !timer) startClock(TIMED_SECONDS * 1000)

    if (tile.ice) {
        bump(tile.el, 'shake')
        sfx.stuck()
        return
    }

    const goal = target()
    const value = tileValue(tile, goal - sum) // a wild tile fills exactly what is missing
    const total = sum + value

    if (total > goal) {
        sum = total
        render()
        bump(well, 'shake')
        sfx.overshoot()
        const reason = { k: 'reason.over', v: { a: total - value, b: value, total, goal } }
        return canRevive() ? offerRevive(value, reason) : gameOver(reason)
    }

    sum = total
    parts.push({ value, color: tile.special === 'wild' ? WILD_COLOR : tile.color, special: tile.special })
    if (tile.special === 'rainbow' && parts.length > 1 && keepsCombo(parts.slice(0, -1), tile)) bump(well, 'match')
    if (tile.special === 'wild') floatText(well, tr('float.wild'), 'is-combo')
    setTile(tile, takeNext())

    if (sum === goal) return completeSum()

    sfx.add(sum / goal)
    mascot.hop()
    render()
    tutorial('added')
    checkStuck()
}

function completeSum() {
    const { points, combo, doubles } = sumPoints(parts, level)
    score += points
    sums++
    chainLog.push(parts.length)
    bestChain = Math.max(bestChain, parts.length)
    if (combo) combos++

    celebrate(meta.missionEvent('sums15', 1))
    if (parts.length >= 4) celebrate(meta.missionEvent('chains4', 1))
    if (combo) celebrate(meta.missionEvent('combos', 1))

    resolving = true
    render()
    bump(well, 'match')
    bump(scoreEl, 'bump')
    const bonus = [combo && tr('float.combo'), doubles && `×${2 ** doubles}`].filter(Boolean).join(' ')
    floatText(well, bonus ? `+${points} ${bonus}!` : `+${points}`, bonus ? 'is-combo' : '')
    thawIce()
    sfx.complete(parts.length)
    if (bonus) {
        mascot.mood('cheer')
        confettiFrom(well, 24)
    } else {
        mascot.mood('happy')
    }
    tutorial('completed')
    if (mode === 'timed') {
        deadline += TIME_BONUS * 1000
        floatText(clockEl, `+${TIME_BONUS}s`)
    }

    const id = gameId
    setTimeout(() => {
        if (id !== gameId) return
        sum = 0
        parts = []
        if (mode === 'journey' && sums === journeyDef.sums) return finishJourney(true)
        if (mode === 'daily' && sums === DAILY_SUMS) return gameOver({ k: 'reason.dailyDone', v: { n: DAILY_SUMS } }, false, true)
        if (mode !== 'journey' && sums % SUMS_PER_LEVEL === 0) return levelUp()
        resolving = false
        render()
        checkStuck()
    }, 450)
}

function levelUp() {
    const from = target()
    const gainsShuffle = freeShuffles < MAX_FREE_SHUFFLES
    level++
    if (gainsShuffle) freeShuffles++
    next = randomTile()

    // the new target gets its own moment: a card over the board, then the well shows it big
    $('lu-title').textContent = tr('lu.title', { n: level + 1 })
    $('lu-old').textContent = from
    $('lu-new').textContent = target()
    $('lu-note').textContent = tr(gainsShuffle ? 'lu.noteShuffle' : 'lu.note')
    levelUpEl.hidden = false
    bump(levelUpEl, 'is-showing')
    platform.gameplayStop()
    pauseClock()
    sfx.levelUp()
    mascot.mood('cheer', { ms: 2200 })
    confettiFrom(levelUpEl, 36)
    render()
    bump(hud2El, 'bump')

    const id = gameId
    setTimeout(async () => {
        if (id !== gameId) return
        levelUpEl.hidden = true
        // between levels is a natural break: the portal may show an ad before play resumes
        await platform.commercialBreak()
        if (id !== gameId) return
        resolving = false
        buildRing(true)
        render()
        bump(well, 'target-pop')
        bump(shuffleBtn, 'bump')
        if (!help.open) resumeClock()
        checkStuck()
    }, LEVEL_UP_MS)
}

function checkStuck() {
    if (!playing || sum === 0) return
    const need = target() - sum
    stuck = !tiles.some(t => canPlay(t, need))
    if (!stuck) return
    sfx.stuck()
    mascot.mood('worried', { hold: true })
    tutorial('stuck')
    // with rewarded ads the player can still watch one for a free shuffle, or give up / bank
    if (canShuffle() || platform.hasRewarded) return render()
    gameOver({ k: 'reason.stuck', v: { need, cost: shuffleCost() } })
}

// 🎬 watch an ad for a free shuffle; offered only when stuck with no free shuffle
async function rewardShuffle() {
    if (!playing || !stuck || freeShuffles > 0 || platform.adShowing) return
    rewardBtn.disabled = true
    const watched = await platform.rewardedBreak()
    rewardBtn.disabled = false
    if (!watched || !playing || !stuck) return render()
    freeShuffles++
    floatText(shuffleBtn, tr('float.free'))
    shuffle()
}

// going over the target: before the game ends, offer one 🎬 ad to take the tile back.
// The tile never left the board, so taking it back only lowers the sum again.
function offerRevive(value, reason) {
    resolving = true // blocks the board while the offer is up
    platform.gameplayStop()
    pauseClock()
    mascot.mood('worried', { hold: true })
    const end = () => {
        resolving = false
        gameOver(reason)
    }
    showResult({
        title: tr('rev.title'),
        happy: false,
        reason: say(reason),
        stats: tr('rev.offer'),
        primary: { label: tr('rev.end'), action: end },
        reward: {
            label: tr('rev.btn'),
            action: async () => {
                revived = true
                const id = gameId
                // the ad goes up after the sheet closes: a modal dialog would sit above it
                const watched = await platform.rewardedBreak()
                if (id !== gameId) return
                if (!watched) return end()
                resolving = false
                sum -= value
                render()
                bump(well, 'pop-in')
                floatText(well, tr('float.revive'), 'is-combo')
                mascot.mood('happy')
                if (!help.open) resumeClock()
                checkStuck()
            },
        },
    })
    setTimeout(() => {
        if (playing && resolving && !dialog.open) dialog.showModal()
    }, 500)
}

// stuck with no free shuffle: stop now instead of paying (in the journey this gives up the level)
function bank() {
    if (!playing || !stuck || freeShuffles > 0 || platform.adShowing) return
    if (mode === 'journey') return finishJourney(false, { k: 'reason.gaveUp' })
    gameOver(canShuffle()
        ? { k: 'reason.bankPaid', v: { cost: shuffleCost() } }
        : { k: 'reason.bankStuck' }, true)
}

function shuffle() {
    if (!playing || resolving || !canShuffle() || platform.adShowing) return
    platform.gameplayStart()
    const paid = freeShuffles === 0
    if (paid) {
        const cost = shuffleCost()
        score -= cost
        paidShuffles++
        floatText(scoreEl, `-${cost}`, 'is-cost')
        bump(scoreEl, 'shake')
    } else {
        freeShuffles--
    }
    sfx.shuffle(paid)
    if (mascot.current() === 'worried') mascot.mood('idle')
    stuck = false
    tiles.forEach(t => { if (!t.ice) setTile(t, randomTile()) }) // frozen tiles stay put
    render()
    checkStuck()
}

// every completed sum melts the ice a little; a tile that thaws becomes playable again
function thawIce() {
    for (const t of tiles) {
        if (!t.ice) continue
        t.ice--
        renderTile(t)
        bump(t.el, t.ice ? 'shake' : 'pop-in')
    }
}

function endGame() {
    platform.gameplayStop()
    playing = false
    stuck = false
    stopClock()
    hideCoach()
    celebrate(meta.missionEvent('score80', score))
    if (mode === 'classic') celebrate(meta.missionEvent('level4', level + 1))
}

function gameOver(reason, banked = false, completed = false) {
    if (mode === 'journey') return finishJourney(false, reason)
    endGame()
    if (banked || completed) sfx.bank()
    else sfx.gameOver()
    if (completed) {
        mascot.mood('cheer', { hold: true })
        confettiFrom(well, 40)
    } else mascot.mood(banked ? 'happy' : 'sad', { hold: true })

    if (mode === 'daily') {
        const result = finishDaily(completed ? 'complete' : banked ? 'banked' : 'bust', reason)
        render()
        setTimeout(() => showDailyResult(result), 500)
        return
    }

    // the record is the final score, so points spent on shuffles count against it
    const previous = best
    if (score > best) {
        saveBest(score)
        if (previous > 0) {
            mascot.mood('cheer', { hold: true })
            confettiFrom(well, 40)
        }
    }
    render()
    showResult({
        title: tr(banked ? 'res.banked' : 'res.over'),
        happy: banked,
        reason: say(reason),
        stats: gameStats(),
        compare: { score, best: previous },
        primary: { label: tr('res.again'), action: () => startGame(mode) },
        secondary: { label: tr('nav.home'), action: goHome },
    })
    setTimeout(() => dialog.showModal(), 500)
}

// a reason is a translation key with values, or (older saved dailies) a ready string
const say = reason => (typeof reason === 'string' ? reason : tr(reason.k, reason.v))

function gameStats() {
    // a journey level has one fixed target, so its level number adds nothing
    return tr('stats', { sums, lv: mode === 'journey' ? 0 : level + 1, chain: bestChain, combos })
}

// ---------- journey ----------

const starsFor = (finished, s) => (finished ? 1 + (s >= journeyGoals[1]) + (s >= journeyGoals[2]) : 0)
const starText = n => '★'.repeat(n) + '☆'.repeat(3 - n)

function finishJourney(won, reason) {
    endGame()
    const n = journeyDef.n
    const stars = starsFor(won, score)
    let gained = 0 // stars this level had never earned before
    let prize = null // set when this win completes a world for the first time
    if (won) {
        const firstWin = meta.journeyStarsOf(n) === 0
        gained = meta.journeyRecord(n, stars)
        if (journeyDef.boss && firstWin) prize = completeWorld(journeyDef.world)
        celebrate(meta.missionEvent('journey2', 1))
        if (n === 1) markOnboarded()
        sfx.bank()
        mascot.mood('cheer', { hold: true })
        setTimeout(() => confetti(innerWidth / 2, innerHeight * 0.35, 20 + stars * 15), 600)
    } else {
        sfx.gameOver()
        mascot.mood('sad', { hold: true })
    }
    render()
    announceNewItems(prize && prize.item)
    showResult({
        title: tr(prize ? 'res.worldDone' : won ? (stars === 3 ? 'res.perfect' : 'res.complete') : 'res.tryAgain'),
        prize,
        happy: won,
        stars: won ? stars : null,
        reason: won ? starReason(stars) : say(reason),
        stats: gameStats(),
        // straight into the next level: its goal shows as a coach tip, no extra screen
        primary: won
            ? { label: tr('res.next'), action: () => startGame('journey', n + 1) }
            : { label: tr('res.retry'), action: () => startGame('journey', n) },
        secondary: won
            ? { label: tr(stars < 3 ? 'res.retry' : 'res.map'), action: stars < 3 ? () => startGame('journey', n) : openMap }
            : { label: tr('res.map'), action: openMap },
        // 🎬 doubles only stars that are new, so replaying a finished level can't farm them
        reward: gained > 0 && platform.hasRewarded ? { label: tr('res.doubleStars', { n: gained }), aria: tr('aria.doubleStars', { n: gained }), action: () => doubleStars(gained) } : null,
    })
    setTimeout(() => dialog.showModal(), 500)
}

// A world's boss beaten for the first time: Nine gets the world's item (and wears it), and
// the next world's theme and music switch on, so the journey feels like moving on.
function completeWorld(w) {
    const item = WORLDS[w].reward
    meta.wear(item)
    const next = WORLDS[w + 1] || null
    if (next) {
        meta.setTheme(next.id)
        applyTheme()
    }
    mascot.dress(meta.outfit())
    return { item, next: next && next.id }
}

const unlockedItems = () => meta.WARDROBE.filter(meta.itemUnlocked).map(i => i.id)
let knownItems = null // items already unlocked when last checked; set at boot

// toast items unlocked since the last check (`except` is announced by the result sheet)
function announceNewItems(except = null) {
    const now = unlockedItems()
    for (const id of now) {
        if (knownItems.includes(id) || id === except) continue
        toast(tr('toast.item', { item: tr(`item.${id}`) }))
    }
    knownItems = now
}

async function doubleStars(n) {
    const id = gameId
    // the sheet is closed while the ad runs (a modal dialog would sit above it), then comes back
    const watched = await platform.rewardedBreak()
    if (id !== gameId || screen !== 'game') return
    reviveBtn.hidden = true
    if (watched) {
        meta.addBonusStars(n)
        toast(tr('toast.bonusStars', { n }))
        announceNewItems()
        sfx.bank()
        mascot.mood('cheer', { hold: true })
        confetti(innerWidth / 2, innerHeight * 0.35, 20 + n * 15)
    }
    dialog.showModal()
}

function starReason(stars) {
    if (stars === 3) return tr('res.allStars')
    return tr('res.scoreFor', { n: journeyGoals[stars], stars: '★'.repeat(stars + 1) })
}

function openMap() {
    showScreen('map')
}


// coach tips: level 1 walks through a first sum, levels 2–4 introduce one idea each
function tutorial(event) {
    if (mode !== 'journey') return
    const n = journeyDef.n
    const later = { 6: 'tut.wild', 7: 'tut.double', 8: 'tut.rainbow', 11: 'tut.ice' }
    if (later[n]) {
        if (event === 'start') {
            coachSay(tr(later[n]), 6000)
            const special = { 6: t => t.special === 'wild', 7: t => t.special === 'double', 8: t => t.special === 'rainbow', 11: t => t.ice > 0 }[n]
            tiles.forEach(t => t.el.classList.toggle('hint', special(t)))
        }
        return
    }
    if (n > 4) {
        // no lesson on this level: say what it asks for, since there is no intro screen
        if (event === 'start') coachSay(tr(journeyDef.boss ? 'coach.boss' : 'coach.goal', { target: journeyDef.target, sums: journeyDef.sums, two: journeyGoals[1], three: journeyGoals[2] }), 5000)
        return
    }
    if (n === 1) {
        if (event === 'start') {
            tutorialStep = 1
            coachSay(tr('tut.drag'))
            hintTile(4)
        } else if (event === 'added' && tutorialStep === 1) {
            tutorialStep = 2
            const need = target() - sum
            coachSay(tr('tut.add', { need, target: target() }))
            hintTile(need)
        } else if (event === 'completed' && tutorialStep === 2) {
            tutorialStep = 3
            coachSay(tr('tut.yes'), 5000)
            hintTile(null)
            mascot.mood('cheer', { ms: 2000 })
            confettiFrom(well, 48)
        }
        return
    }
    if (event !== 'start' && !(n === 4 && event === 'stuck')) return
    const tips = { 2: 'tut.next', 3: 'tut.combo', 4: 'tut.shuffle' }
    coachSay(tr(tips[n]), 6000)
}

function hintTile(value) {
    tiles.forEach(t => t.el.classList.remove('hint'))
    const t = value && tiles.find(x => x.value === value)
    if (t) t.el.classList.add('hint')
}

let coachTimer = null
function coachSay(text, ms = 0) {
    coachEl.textContent = text
    coachEl.hidden = false
    bump(coachEl, 'pop-in')
    clearTimeout(coachTimer)
    if (ms) coachTimer = setTimeout(hideCoach, ms)
}

function hideCoach() {
    clearTimeout(coachTimer)
    coachEl.hidden = true
}

// ---------- starting and leaving games ----------

async function startGame(m, n = 1) {
    if (dialog.open) dialog.close()
    mode = m
    if (m === 'journey') {
        journeyDef = journeyLevel(n)
        journeyGoals = journeyStars(journeyDef)
    }
    // the player chose to play: a natural moment for the portal to show an ad first
    await platform.commercialBreak()
    showScreen('game')
    newGame()
}

function goHome() {
    // leaving abandons the game: keep a Classic/60 s record, the daily keeps its own progress
    if (playing && mode !== 'daily' && mode !== 'journey' && score > best) saveBest(score)
    platform.gameplayStop()
    stopClock()
    gameId++
    playing = false
    hideCoach()
    for (const d of [dialog, help]) if (d.open) d.close()
    showScreen('home')
}

function newGame() {
    stopClock()
    gameId++
    levelUpEl.hidden = true
    hideCoach()
    sum = 0
    parts = []
    score = 0
    sums = 0
    level = mode === 'journey' ? journeyDef.lv : 0
    freeShuffles = 1
    paidShuffles = 0
    stuck = false
    revived = false
    resolving = false
    playing = true
    deadline = 0
    pausedLeft = null
    lastSecond = null
    chainLog = []
    combos = 0
    bestChain = 0
    tutorialStep = 0
    mascot.mood('idle')
    best = readBest(mode)
    gen = null
    rng = Math.random
    clockEl.hidden = mode !== 'timed'
    $('game-title').textContent = gameTitle()

    if (mode === 'daily') {
        const saved = readDaily()
        gen = createRng(hashSeed(todayKey()))
        rng = gen.random
        if (saved && saved.done) {
            // today's daily is already played: show the board it was seeded with, then the result
            playing = false
            score = saved.score
            sums = saved.sums
            dealBoard()
            setTimeout(() => showDailyResult(saved), 300)
            return
        }
        if (saved && saved.state) return restoreDaily(saved.state)
        coachSay(tr('coach.par', { par: todaysPar() }), 4500)
    }

    if (mode === 'journey') {
        gen = createRng(journeyDef.seed)
        rng = gen.random
    }

    dealBoard(mode === 'journey' ? journeyDef.initial : null)
    if (mode === 'journey' && journeyDef.setup.length) {
        // the level's special tiles and frozen obstacles, exactly as the bot plays them
        const dealt = tiles.map(t => ({ value: t.value, color: t.color, special: t.special, ice: t.ice }))
        applySetup(dealt, journeyDef.setup)
        tiles.forEach((t, i) => setTile(t, dealt[i]))
        render()
    }
    tutorial('start')
}

function gameTitle() {
    if (mode === 'journey') return tr(journeyDef.boss ? 'title.boss' : 'home.level', { n: journeyDef.n })
    if (mode === 'daily') return tr('daily.title', { n: dailyNumber() })
    return tr(`mode.${mode}`)
}

function dealBoard(initial = null) {
    buildRing()
    if (initial) {
        tiles.forEach((t, i) => setTile(t, initial.tiles[i]))
        next = { ...initial.next }
    } else {
        tiles.forEach(t => setTile(t, randomTile()))
        next = randomTile()
    }
    renderClock(TIMED_SECONDS * 1000)
    render()
}

// ---------- timed mode ----------

function startClock(ms) {
    deadline = Date.now() + ms
    timer = setInterval(() => {
        const left = deadline - Date.now()
        renderClock(left)
        const second = Math.ceil(left / 1000)
        if (second !== lastSecond && second <= 10 && second > 0) sfx.tick(second <= 3)
        lastSecond = second
        if (left <= 0) gameOver({ k: 'reason.time' })
    }, 100)
}

function pauseClock() {
    if (!timer) return
    pausedLeft = deadline - Date.now()
    stopClock()
}

function resumeClock() {
    if (pausedLeft === null || !playing) return
    startClock(pausedLeft)
    pausedLeft = null
}

function stopClock() {
    clearInterval(timer)
    timer = null
}

function renderClock(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000))
    clockTimeEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
    clockEl.classList.toggle('is-low', s <= 10 && timer !== null)
}

// ---------- rendering ----------

function render() {
    if (!next) return
    const goal = target()
    const need = goal - sum
    const empty = sum === 0
    // an empty well shows the target itself, big, so it is always in view
    sumEl.textContent = empty ? goal : sum
    needEl.textContent =
        sum > goal ? tr('well.over')
        : sum === goal ? tr('well.done')
        : stuck ? tr('well.stuck')
        : empty ? tr('well.make')
        : tr('well.needs', { n: need })
    well.classList.toggle('is-over', sum > goal)
    well.classList.toggle('is-stuck', stuck)
    well.classList.toggle('is-empty', empty)
    well.setAttribute('aria-label', tr(empty ? 'aria.wellEmpty' : 'aria.wellSum', { goal, sum }))

    // fill one ring segment per point, coloured by the tile that supplied it (a rainbow tile cycles colours)
    const colors = parts.flatMap(p => Array.from({ length: p.value }, (_, i) => (p.special === 'rainbow' ? COLORS[i % COLORS.length] : p.color)))
    ring.querySelectorAll('.seg').forEach((seg, i) => {
        seg.style.stroke = i < Math.min(sum, goal) ? (colors[i] || '') : ''
        seg.classList.toggle('on', i < sum)
    })

    nextEl.textContent = next.special === 'wild' ? '★' : next.value
    nextEl.dataset.n = nextEl.textContent
    nextEl.classList.toggle('is-wild', next.special === 'wild')
    nextEl.classList.toggle('is-rainbow', next.special === 'rainbow')
    nextEl.style.setProperty('--tile', next.special === 'wild' ? WILD_COLOR : next.color)

    const cost = shuffleCost()
    shuffleBadge.textContent = freeShuffles > 0 ? freeShuffles : `-${cost}`
    shuffleBadge.classList.toggle('is-cost', freeShuffles === 0)
    shuffleBtn.disabled = !playing || !canShuffle()
    shuffleBtn.classList.toggle('nudge', stuck && canShuffle())
    shuffleBtn.setAttribute('aria-label', freeShuffles > 0
        ? tr('aria.shuffleFree', { n: freeShuffles })
        : tr('aria.shufflePaid', { n: cost }))

    // stuck with no free shuffle: the choices replace the Next pill
    const choosing = playing && stuck && freeShuffles === 0
    nextPill.hidden = choosing
    bankBtn.hidden = !choosing
    rewardBtn.hidden = !(choosing && platform.hasRewarded)
    const giveUp = mode === 'journey'
    $('bank-label').textContent = tr(giveUp ? 'act.giveUp' : 'act.bank')
    bankBadge.hidden = giveUp
    bankBadge.textContent = score
    bankBtn.setAttribute('aria-label', giveUp ? tr('aria.giveUp') : tr('aria.bank', { n: score }))

    scoreEl.textContent = score
    renderHud()
    if (mode === 'daily' && playing) saveDailyProgress()
}

// the second and third HUD pills change meaning with the mode
function renderHud() {
    const set = (label, value, labelText, valueText) => {
        $(label).textContent = labelText
        $(value).textContent = valueText
    }
    if (mode === 'journey') {
        const earned = starsFor(sums >= journeyDef.sums, score)
        set('hud2-label', 'hud2', tr('hud.stars'), '')
        // solid stars like the result sheet: gold when earned, pale when not
        hud2El.replaceChildren(...[0, 1, 2].map(i => {
            const star = document.createElement('span')
            star.className = i < earned ? 'hud-star is-on' : 'hud-star'
            star.textContent = '★'
            return star
        }))
        hud2El.setAttribute('aria-label', tr('aria.stars', { n: earned }))
        set('hud3-label', 'hud3', tr('hud.sums'), `${sums}/${journeyDef.sums}`)
    } else if (mode === 'daily') {
        hud2El.removeAttribute('aria-label')
        set('hud2-label', 'hud2', tr('hud.sums'), `${sums}/${DAILY_SUMS}`)
        set('hud3-label', 'hud3', tr('hud.par'), todaysPar())
    } else {
        set('hud2-label', 'hud2', tr('hud.level'), level + 1)
        hud2El.removeAttribute('aria-label')
        set('hud3-label', 'hud3', tr('hud.best'), Math.max(best, score))
    }
}

function bump(el, cls) {
    el.classList.remove(cls)
    void el.offsetWidth // restart animation
    el.classList.add(cls)
}

function floatText(anchor, text, cls = '') {
    const r = anchor.getBoundingClientRect()
    const el = document.createElement('span')
    el.className = `float outline ${cls}`
    el.textContent = text
    el.style.left = r.left + r.width / 2 + 'px'
    el.style.top = r.top + 'px'
    document.body.appendChild(el)
    el.addEventListener('animationend', () => el.remove())
}

let toastTimer = null
function toast(text) {
    const el = $('toast')
    el.textContent = text
    el.hidden = false
    bump(el, 'pop-in')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { el.hidden = true }, 2800)
}

// completed missions earn a star
function celebrate(completed) {
    for (const m of completed) {
        toast(tr('toast.mission', { text: tr(`mission.${m.id}`) }))
        sfx.bank()
    }
    // a mission star can push the total past a wardrobe item's price
    if (completed.length) setTimeout(() => announceNewItems(), 1500)
}

// ---------- result sheet ----------

let resultActions = {}

function showResult({ title, happy, reason, stats, stars = null, compare = null, primary, secondary = null, reward = null, prize = null }) {
    $('over-prize').hidden = !prize
    if (prize) {
        $('over-prize-text').textContent = tr(prize.next ? 'res.reward' : 'res.rewardLast', {
            item: tr(`item.${prize.item}`),
            world: prize.next ? tr(`theme.${prize.next}`) : '',
        })
    }
    const titleEl = $('over-title')
    titleEl.textContent = title
    titleEl.classList.toggle('is-banked', happy)
    $('over-reason').textContent = reason
    $('over-score').textContent = score
    $('over-stats').textContent = stats

    const starsEl = $('over-stars')
    starsEl.hidden = stars === null
    if (stars !== null) {
        starsEl.replaceChildren(...[0, 1, 2].map(i => {
            const s = document.createElement('span')
            s.textContent = '★'
            s.className = i < stars ? 'is-on' : ''
            s.style.animationDelay = `${300 + i * 220}ms`
            return s
        }))
        starsEl.setAttribute('aria-label', tr('aria.stars', { n: stars }))
    }

    // how this game compares with the record
    const compareEl = $('over-compare')
    compareEl.hidden = !compare || compare.best === 0
    if (compare && compare.best > 0) {
        $('compare-fill').style.width = `${Math.min(100, (100 * compare.score) / compare.best)}%`
        $('compare-text').textContent = tr(compare.score > compare.best ? 'res.newBest' : 'res.yourBest', { n: compare.best })
        compareEl.classList.toggle('is-record', compare.score > compare.best)
    }

    $('daily-result').hidden = mode !== 'daily'
    againBtn.textContent = primary.label
    secondaryBtn.hidden = !secondary
    if (secondary) secondaryBtn.textContent = secondary.label
    reviveBtn.hidden = !reward
    if (reward) {
        $('over-reward-label').textContent = reward.label
        reviveBtn.setAttribute('aria-label', reward.aria || reward.label)
    }
    resultActions = { primary: primary.action, secondary: secondary && secondary.action, reward: reward && reward.action }
}

// ---------- input: tap, keyboard and pointer drag ----------

function attachInput(tile) {
    const el = tile.el
    let start = null, ghost = null, suppressClick = false

    el.addEventListener('click', () => {
        if (suppressClick) { suppressClick = false; return }
        play(tile)
    })

    el.addEventListener('keydown', () => { suppressClick = false })

    el.addEventListener('pointerdown', ev => {
        suppressClick = false
        if (!playing || ev.button !== 0) return
        start = { x: ev.clientX, y: ev.clientY }
        el.setPointerCapture(ev.pointerId)
    })

    el.addEventListener('pointermove', ev => {
        if (!start) return
        const dx = ev.clientX - start.x, dy = ev.clientY - start.y
        if (!ghost && Math.hypot(dx, dy) < 8) return
        if (!ghost) {
            ghost = el.cloneNode(true)
            ghost.classList.add('ghost')
            ghost.classList.remove('pop-in', 'hint')
            const rect = el.getBoundingClientRect()
            ghost.style.width = rect.width + 'px'
            ghost.style.height = rect.height + 'px'
            ghost.style.left = rect.left + 'px'
            ghost.style.top = rect.top + 'px'
            document.body.appendChild(ghost)
            el.classList.add('lifted')
            sfx.lift()
        }
        ghost.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 30}deg) scale(1.08)`
        well.classList.toggle('is-target', overWell(ev))
    })

    const end = ev => {
        if (!start) return
        start = null
        if (!ghost) return
        suppressClick = true // the click that follows a drag is not a tap
        const dropped = ev.type === 'pointerup' && overWell(ev)
        ghost.remove()
        ghost = null
        el.classList.remove('lifted')
        well.classList.remove('is-target')
        if (dropped) play(tile)
    }
    el.addEventListener('pointerup', end)
    el.addEventListener('pointercancel', end)
}

function overWell(ev) {
    const r = well.getBoundingClientRect()
    return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom
}

// ---------- daily challenge ----------

const todayKey = meta.dayKey

function dailyNumber() {
    const day = key => Date.UTC(...key.split('-').map((n, i) => +n - (i === 1 ? 1 : 0)))
    return Math.round((day(todayKey()) - day(DAILY_EPOCH)) / 86400000) + 1
}

// the par is what the careful simulated player scores on today's board
let parCache = null
function todaysPar() {
    if (!parCache || parCache.key !== todayKey()) parCache = { key: todayKey(), par: dailyPar(hashSeed(todayKey())) }
    return parCache.par
}

function readDaily() {
    try {
        const saved = JSON.parse(localStorage.getItem('plus9.daily'))
        return saved && saved.date === todayKey() ? saved : null
    } catch { return null }
}

function writeDaily(data) {
    try { localStorage.setItem('plus9.daily', JSON.stringify({ date: todayKey(), ...data })) } catch { /* storage unavailable */ }
}

// progress is saved on every render, so reloading neither loses the run nor rerolls it
function saveDailyProgress() {
    const done = resolving && sum === target() // a finished sum still on show counts as banked into the score
    writeDaily({
        done: false,
        state: {
            seedState: gen.state,
            tiles: tiles.map(t => ({ value: t.value, color: t.color, special: t.special, ice: t.ice })),
            next,
            sum: done ? 0 : sum,
            parts: done ? [] : parts,
            score, sums, level, freeShuffles, paidShuffles, chainLog, combos, bestChain,
        },
    })
}

function restoreDaily(state) {
    gen.state = state.seedState
    sum = state.sum
    parts = state.parts
    score = state.score
    sums = state.sums
    chainLog = state.chainLog
    combos = state.combos || 0
    bestChain = state.bestChain || 0
    paidShuffles = state.paidShuffles
    freeShuffles = state.freeShuffles
    // a reload during the level-up card can save before levelUp() ran; levels follow sums
    const lv = Math.floor(sums / SUMS_PER_LEVEL)
    if (lv > state.level) freeShuffles = Math.min(MAX_FREE_SHUFFLES, freeShuffles + 1)
    level = lv
    next = state.next
    buildRing()
    tiles.forEach((t, i) => setTile(t, state.tiles[i]))
    renderClock(TIMED_SECONDS * 1000)
    render()
    checkStuck()
}

function finishDaily(outcome, reason) {
    const result = { done: true, number: dailyNumber(), outcome, reason, score, sums, chainLog, par: todaysPar() }
    writeDaily(result)
    celebrate(meta.missionEvent('daily', 1))

    // streak: consecutive days with a finished daily
    let streak = { last: null, count: 0, best: 0 }
    try { streak = JSON.parse(localStorage.getItem('plus9.streak')) || streak } catch { /* storage unavailable */ }
    const yesterday = todayKey(new Date(Date.now() - 86400000))
    if (streak.last !== todayKey()) {
        streak.count = streak.last === yesterday ? streak.count + 1 : 1
        streak.last = todayKey()
        streak.best = Math.max(streak.best, streak.count)
        try { localStorage.setItem('plus9.streak', JSON.stringify(streak)) } catch { /* storage unavailable */ }
    }
    return result
}

function readStreak() {
    try {
        const streak = JSON.parse(localStorage.getItem('plus9.streak'))
        const alive = streak && (streak.last === todayKey() || streak.last === todayKey(new Date(Date.now() - 86400000)))
        return { count: alive ? streak.count : 0, best: streak ? streak.best : 0 }
    } catch { return { count: 0, best: 0 } }
}

// one square per sum: chain length 2 / 3 / 4+, a burst where it ended badly, blanks for the rest
function dailyGrid(result) {
    const squares = result.chainLog.map(n => (n >= 4 ? '🟨' : n === 3 ? '🟪' : '🟦'))
    if (result.outcome === 'bust') squares.push('💥')
    while (squares.length < DAILY_SUMS) squares.push('⬜')
    const row = DAILY_SUMS / 2
    return `${squares.slice(0, row).join('')}\n${squares.slice(row, DAILY_SUMS).join('')}`
}

function shareText(result, url) {
    const head = tr('share.text', { num: result.number, score: result.score, par: result.par })
    return `${head}\n${dailyGrid(result)}${url ? `\n${url}` : ''}`
}

let countdownTimer = null

function showDailyResult(result) {
    score = result.score
    const par = result.par || todaysPar()
    showResult({
        title: tr(result.outcome === 'complete' ? 'res.dailyDone' : result.outcome === 'banked' ? 'res.banked' : 'res.over'),
        happy: result.outcome !== 'bust',
        reason: say(result.reason),
        stats: tr('daily.stats', { num: result.number, sums: result.sums, total: DAILY_SUMS }),
        primary: { label: tr('nav.home'), action: goHome },
    })
    $('daily-grid').textContent = dailyGrid(result)
    $('daily-par').textContent = result.score >= par
        ? tr('daily.beat', { par })
        : tr('daily.toGo', { par, left: par - result.score })
    $('daily-par').classList.toggle('is-beaten', result.score >= par)
    const streak = readStreak()
    $('daily-streak').textContent = tr('daily.streak', { n: streak.count, best: streak.best })
    const tick = () => {
        const midnight = new Date()
        midnight.setHours(24, 0, 0, 0)
        const mins = Math.max(0, Math.ceil((midnight - Date.now()) / 60000))
        $('daily-next').textContent = tr('daily.next', { h: Math.floor(mins / 60), m: mins % 60 })
    }
    tick()
    clearInterval(countdownTimer)
    countdownTimer = setInterval(tick, 30000)
    const withPar = { ...result, par }
    shareBtn.dataset.text = shareText(withPar)
    // the portal knows the public URL of the game (the page itself may be an iframe)
    platform.shareURL().then(url => { if (url) shareBtn.dataset.text = shareText(withPar, url) })
    shareBtn.textContent = tr('share.btn')
    if (!dialog.open) dialog.showModal()
}

async function shareDaily() {
    const text = shareBtn.dataset.text
    sfx.ui()
    try {
        if (navigator.share) return await navigator.share({ text })
        await navigator.clipboard.writeText(text)
        shareBtn.textContent = tr('share.copied')
    } catch (err) {
        if (err && err.name === 'AbortError') return // the player closed the share sheet
        shareBtn.textContent = tr('share.failed')
    }
}

// ---------- screens: home and journey map ----------

let screen = 'home'

function showScreen(name) {
    screen = name
    for (const [key, el] of Object.entries(screens)) el.hidden = key !== name
    document.body.dataset.screen = name
    if (name === 'home') renderHome()
    if (name === 'map') renderMap()
}

function renderHome() {
    const frontier = meta.journeyFrontier()
    $('journey-sub').textContent = frontier === 1 ? tr('home.start')
        : tr('home.worldLevel', { world: tr(`theme.${WORLDS[worldOf(frontier)].id}`), n: frontier })
    $('star-total').textContent = meta.totalStars()

    const daily = readDaily()
    const done = !!(daily && daily.done)
    const dailyCard = document.querySelector('[data-start="daily"]')
    dailyCard.classList.toggle('is-new', !done)
    const streak = readStreak().count
    $('info-daily').textContent = done ? tr('home.done', { streak }) : tr('home.new', { par: todaysPar() })
    $('info-classic').textContent = tr('home.best', { n: readBest('classic') })
    $('info-timed').textContent = tr('home.best', { n: readBest('timed') })

    $('missions').replaceChildren(...meta.missionList().map(m => {
        const li = document.createElement('li')
        li.className = 'mission'
        li.classList.toggle('is-done', m.done)
        const pct = Math.round((100 * m.progress) / m.goal)
        li.innerHTML = `<span class="mission-text"></span>
            <span class="mission-count">${m.done ? '★' : `${m.progress}/${m.goal}`}</span>
            <span class="mission-bar" aria-hidden="true"><span style="width:${pct}%"></span></span>`
        const text = tr(`mission.${m.id}`)
        li.querySelector('.mission-text').textContent = text
        li.setAttribute('aria-label', `${text}: ${m.done ? tr('mission.doneAria') : tr('mission.progress', { a: m.progress, b: m.goal })}`)
        return li
    }))

}

// ---------- customize: Nine's wardrobe and the themes ----------

const styleSheet = $('style')

function openStyle() {
    sfx.ui()
    renderStyle()
    styleSheet.showModal()
}

function renderStyle() {
    const worn = meta.outfit()
    $('wardrobe').replaceChildren(...meta.WARDROBE.map(item => {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'wear-chip'
        const unlocked = meta.itemUnlocked(item)
        const name = tr(`item.${item.id}`)
        const how = item.world !== undefined ? tr('item.lockWorld', { n: item.world + 1 }) : tr('item.lockStars', { n: item.stars })
        b.disabled = !unlocked
        b.setAttribute('aria-pressed', worn[item.slot] === item.id)
        b.setAttribute('aria-label', unlocked ? name : tr('item.lockedAria', { name, how }))
        b.innerHTML = `<span class="mascot wear-art" data-mood="happy" aria-hidden="true">${mascot.preview(item.id)}</span><span class="wear-name"></span>`
        b.querySelector('.wear-name').textContent = unlocked ? name : how
        b.addEventListener('click', () => {
            meta.toggleItem(item.id)
            mascot.dress(meta.outfit())
            mascot.mood('happy')
            sfx.ui()
            renderStyle()
        })
        return b
    }))

    const current = meta.theme()
    $('themes').replaceChildren(...meta.THEMES.map(t => {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = `theme-chip theme-${t.id}`
        const locked = !meta.worldReached(t.world)
        b.disabled = locked
        b.setAttribute('aria-pressed', t.id === current)
        b.innerHTML = `<span class="theme-swatch" aria-hidden="true"></span><span class="theme-name"></span>`
        const name = tr(`theme.${t.id}`)
        b.querySelector('.theme-name').textContent = locked ? tr('world.short', { n: t.world + 1 }) : name
        b.setAttribute('aria-label', locked ? tr('theme.lockedWorld', { name, n: t.world + 1 }) : tr('theme.aria', { name }))
        b.addEventListener('click', () => {
            meta.setTheme(t.id)
            applyTheme()
            sfx.ui()
            renderStyle()
        })
        return b
    }))
}

function renderMap() {
    const frontier = meta.journeyFrontier()
    const last = Math.max(frontier + 7, 12)
    $('map-stars').textContent = meta.journeyStarTotal()
    const route = $('route')
    route.replaceChildren(...Array.from({ length: last }, (_, i) => {
        const n = i + 1
        const stars = meta.journeyStarsOf(n)
        const locked = n > frontier
        const li = document.createElement('li')
        li.className = 'stop'
        li.classList.toggle('is-boss', isBoss(n))
        li.style.setProperty('--x', ['0px', '64px', '0px', '-64px'][i % 4]) // a winding road
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'node'
        b.classList.toggle('is-done', stars > 0)
        b.classList.toggle('is-current', n === frontier)
        b.disabled = locked
        b.classList.toggle('is-boss', isBoss(n))
        b.innerHTML = locked ? '<svg aria-hidden="true"><use href="#i-lock" /></svg>' : `<span class="outline">${n}</span>`
        if (isBoss(n)) b.insertAdjacentHTML('beforeend', '<span class="boss-crown" aria-hidden="true">♛</span>')
        b.setAttribute('aria-label', locked ? tr('map.locked', { n }) : tr(isBoss(n) ? 'map.boss' : 'map.level', { n, s: stars }))
        b.addEventListener('click', () => startGame('journey', n))
        const s = document.createElement('span')
        s.className = 'node-stars'
        s.setAttribute('aria-hidden', 'true')
        s.textContent = locked ? '' : starText(stars)
        li.append(b, s)
        // a banner where each world begins
        if ((n - 1) % WORLD_SIZE === 0 && worldOf(n) === (n - 1) / WORLD_SIZE) {
            const w = worldOf(n)
            const banner = document.createElement('li')
            banner.className = `world-banner theme-${WORLDS[w].id}`
            banner.classList.toggle('is-locked', !meta.worldReached(w))
            banner.textContent = tr('world.banner', { n: w + 1, name: tr(`theme.${WORLDS[w].id}`) })
            return [banner, li]
        }
        return li
    }).flat())
    drawRoad()
    const current = route.querySelector('.is-current')
    if (current) current.scrollIntoView({ block: 'center' })
}

// The road between levels: one S-curve from each node's centre to the next. Stretches
// already travelled (level n has a star) are a flowing rainbow; the rest are dashed.
function drawRoad() {
    const route = $('route')
    const nodes = [...route.querySelectorAll('.node')]
    if (!nodes.length) return
    const box = route.getBoundingClientRect()
    const centre = el => {
        const r = el.getBoundingClientRect()
        return [r.left - box.left + r.width / 2, r.top - box.top + route.scrollTop + r.height / 2]
    }
    const points = nodes.map(centre)
    const curve = ([x1, y1], [x2, y2]) => {
        const mid = (y1 + y2) / 2
        return `M${x1} ${y1} C${x1} ${mid} ${x2} ${mid} ${x2} ${y2}`
    }
    let done = '', todo = ''
    for (let i = 0; i < points.length - 1; i++) {
        if (meta.journeyStarsOf(i + 1) > 0) done += curve(points[i], points[i + 1])
        else todo += curve(points[i], points[i + 1])
    }
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    const ns = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(ns, 'svg')
    svg.classList.add('road')
    svg.setAttribute('aria-hidden', 'true')
    svg.setAttribute('width', route.scrollWidth)
    svg.setAttribute('height', route.scrollHeight)
    // the rainbow repeats every 240px and slides along the road (SMIL, so it needs no JS loop)
    svg.innerHTML = `
        <defs>
            <linearGradient id="rainbow" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="240" spreadMethod="repeat">
                <stop offset="0" stop-color="#ff623a" />
                <stop offset="0.2" stop-color="#ffd23f" />
                <stop offset="0.4" stop-color="#37afff" />
                <stop offset="0.6" stop-color="#8746ff" />
                <stop offset="0.8" stop-color="#ff31cc" />
                <stop offset="1" stop-color="#ff623a" />
                ${still ? '' : '<animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="0 240" dur="2.4s" repeatCount="indefinite" />'}
            </linearGradient>
        </defs>
        <path class="road-todo" d="${todo}" />
        <path class="road-casing" d="${done}" />
        <path class="road-done" d="${done}" />`
    route.querySelector('.road')?.remove()
    route.prepend(svg)
}

addEventListener('resize', () => { if (screen === 'map') drawRoad() })

function applyTheme() {
    document.body.dataset.theme = meta.theme()
    sfx.setStyle(meta.theme()) // each theme has its own music
}

// ---------- persistence ----------

function readBest(m) {
    try {
        // 'plus9.best' is the pre-modes key, kept as the classic record
        const raw = localStorage.getItem(`plus9.best.${m}`) ?? (m === 'classic' ? localStorage.getItem('plus9.best') : null)
        return parseInt(raw, 10) || 0
    } catch { return 0 }
}

function saveBest(value) {
    best = value
    try { localStorage.setItem(`plus9.best.${mode}`, value) } catch { /* storage unavailable */ }
}

function onboarded() {
    try { return localStorage.getItem('plus9.onboarded') === '1' } catch { return true }
}

function markOnboarded() {
    try { localStorage.setItem('plus9.onboarded', '1') } catch { /* storage unavailable */ }
}

// ---------- help (doubles as the pause menu) and sound ----------

function openHelp() {
    if (help.open || dialog.open || platform.adShowing) return
    const inGame = screen === 'game' && playing
    if (inGame) {
        platform.gameplayStop()
        pauseClock()
    }
    $('help-close').textContent = tr(inGame ? 'help.resume' : 'help.gotIt')
    $('help-home').hidden = !inGame
    sfx.ui()
    help.showModal()
}

function toggleSound() {
    sfx.setMuted(!sfx.muted)
    renderSound()
    sfx.ui()
}

function toggleMusic() {
    sfx.setMusic(!sfx.musicOn)
    renderMusic()
    sfx.ui()
}

function renderMusic() {
    const btn = $('music-btn')
    btn.setAttribute('aria-pressed', sfx.musicOn)
    $('music-state').textContent = tr(sfx.musicOn ? 'music.on' : 'music.off')
}

function renderSound() {
    document.querySelectorAll('.sound-btn').forEach(b => {
        b.setAttribute('aria-pressed', !sfx.muted)
        b.setAttribute('aria-label', tr(sfx.muted ? 'sound.off' : 'sound.on'))
        b.querySelector('use').setAttribute('href', sfx.muted ? '#i-sound-off' : '#i-sound-on')
    })
}

// ---------- wiring ----------

againBtn.addEventListener('click', () => {
    const action = resultActions.primary
    dialog.close()
    if (action) action()
})
secondaryBtn.addEventListener('click', () => {
    const action = resultActions.secondary
    dialog.close()
    if (action) action()
})
reviveBtn.addEventListener('click', () => {
    const action = resultActions.reward
    dialog.close()
    if (action) action()
})
shareBtn.addEventListener('click', shareDaily)
dialog.addEventListener('close', () => clearInterval(countdownTimer))
dialog.addEventListener('cancel', ev => ev.preventDefault())
shuffleBtn.addEventListener('click', shuffle)
bankBtn.addEventListener('click', bank)
rewardBtn.addEventListener('click', rewardShuffle)

$('go-style').addEventListener('click', openStyle)
$('style-close').addEventListener('click', () => styleSheet.close())
styleSheet.addEventListener('close', () => { if (screen === 'home') renderHome() })

$('go-journey').addEventListener('click', () => {
    sfx.ui()
    openMap()
})
document.querySelectorAll('[data-start]').forEach(b => b.addEventListener('click', () => startGame(b.dataset.start)))
document.querySelectorAll('.home-btn').forEach(b => b.addEventListener('click', () => {
    sfx.ui()
    goHome()
}))
document.querySelectorAll('.help-btn, .pause-btn').forEach(b => b.addEventListener('click', openHelp))
document.querySelectorAll('.sound-btn').forEach(b => b.addEventListener('click', toggleSound))
$('music-btn').addEventListener('click', toggleMusic)

$('help-close').addEventListener('click', () => help.close())
$('help-home').addEventListener('click', goHome)
help.addEventListener('close', async () => {
    if (screen !== 'game' || !playing || !levelUpEl.hidden) return // the level-up card resumes play itself
    if (sum > 0 || sums > 0) await platform.commercialBreak() // unpausing a game in progress
    resumeClock()
})

document.addEventListener('keydown', ev => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return
    // keep the host page from scrolling when the game runs inside a portal iframe;
    // an open sheet and the journey map still scroll with the arrow keys
    const scrollable = help.open || dialog.open || styleSheet.open || screen !== 'game'
    if (!scrollable && (ev.key.startsWith('Arrow') || (ev.key === ' ' && ev.target === document.body))) ev.preventDefault()
    if (platform.adShowing) return
    const key = ev.key.toLowerCase()
    if (key === 'escape' && screen === 'game' && !help.open && !dialog.open) return openHelp() // open dialogs close themselves on ESC
    if (key === 'h' || key === '?') return help.open ? help.close() : openHelp()
    if (key === 'm') return toggleSound()
    if (screen !== 'game' || dialog.open || help.open) return
    if (key === 's') shuffle()
    if (key === 'b') bank()
})

// leaving the tab or app pauses the 60-second clock and the audio
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        pauseClock()
        sfx.suspend()
        return
    }
    if (platform.adShowing) return // the ad's end restores audio and the flow that started it resumes play
    sfx.resume()
    // the help sheet and the level-up card resume the clock themselves when they close
    if (!help.open && !dialog.open && levelUpEl.hidden) resumeClock()
})

// keep the record if the tab is closed mid-game
addEventListener('pagehide', () => {
    if (playing && (mode === 'classic' || mode === 'timed') && score > best) saveBest(score)
})

// the wheel only scrolls inside sheets and the map; anywhere else it would scroll the portal's page
addEventListener('wheel', ev => { if (!ev.target.closest('.sheet, .scroll')) ev.preventDefault() }, { passive: false })

// browsers only start audio after a user gesture
const unlock = () => sfx.unlock()
document.addEventListener('pointerdown', unlock, { once: true })
document.addEventListener('keydown', unlock, { once: true })

// ---------- Nine on the home screen: looks at the pointer, reacts when poked ----------

const POKES = ['love', 'spin', 'wink', 'boing']
let pokeTurn = 0
let pokeTimes = [] // recent pokes, for the dizzy easter egg

function pokeNine(button) {
    const el = button.querySelector('.mascot')
    const now = Date.now()
    pokeTimes = pokeTimes.filter(t => now - t < 2000).concat(now)
    // five pokes within two seconds make Nine dizzy
    const kind = pokeTimes.length >= 5 ? 'dizzy' : POKES[pokeTurn++ % POKES.length]
    if (kind === 'dizzy') pokeTimes = []
    mascot.emote(el, kind)
    sfx.poke(kind)
    const bits = { love: ['♥', 5, '#ff4fa0'], spin: ['✦', 4, '#ffffff'], wink: ['★', 2, '#ffd23f'], boing: ['!', 1, '#ffffff'], dizzy: ['★', 6, '#ffd23f'] }[kind]
    pokeBits(el, ...bits)
}

// small symbols that float up from Nine
function pokeBits(el, char, count, color) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const r = el.getBoundingClientRect()
    for (let i = 0; i < count; i++) {
        const bit = document.createElement('span')
        bit.className = 'poke-bit'
        bit.textContent = char
        bit.style.color = color
        bit.style.left = `${r.left + r.width * (0.25 + Math.random() * 0.5)}px`
        bit.style.top = `${r.top + r.height * 0.3}px`
        bit.style.setProperty('--dx', `${(Math.random() - 0.5) * 70}px`)
        bit.style.animationDelay = `${i * 70}ms`
        document.body.appendChild(bit)
        bit.addEventListener('animationend', () => bit.remove())
    }
}

document.querySelectorAll('.nine-poke').forEach(b => b.addEventListener('click', () => pokeNine(b)))

// eyes follow the pointer (or the last touch) on the home screen and in Customize
let lookFrame = 0
function followPointer(ev) {
    if (screen !== 'home' && !styleSheet.open) return
    cancelAnimationFrame(lookFrame)
    lookFrame = requestAnimationFrame(() => mascot.look(ev.clientX, ev.clientY))
}
document.addEventListener('pointermove', followPointer)
document.addEventListener('pointerdown', followPointer)
document.addEventListener('pointerleave', () => mascot.look(null))
addEventListener('blur', () => mascot.look(null))

// ---------- language ----------

// re-render everything that holds translated text after a language change
function relocalize() {
    i18n.apply()
    renderSound()
    renderMusic()
    if (screen === 'home') renderHome()
    if (screen === 'map') renderMap()
    if (styleSheet.open) renderStyle()
    if (screen === 'game' && next) {
        $('game-title').textContent = gameTitle()
        tiles.forEach(renderTile)
        render()
    }
    if (help.open) $('help-close').textContent = tr(screen === 'game' && playing ? 'help.resume' : 'help.gotIt')
}

const langSelect = $('lang')
langSelect.replaceChildren(...Object.entries(i18n.LANGS).map(([code, name]) => new Option(name, code)))
langSelect.addEventListener('change', () => {
    i18n.set(langSelect.value, { save: true })
    relocalize()
    sfx.ui()
})

// ---------- boot ----------

i18n.set(i18n.detect(platform.language()))
langSelect.value = i18n.lang
applyTheme()
mascot.mount()
mascot.dress(meta.outfit())
knownItems = unlockedItems()
buildTiles()
renderSound()
renderMusic()
// first visit: straight into the tutorial level instead of a menu
if (onboarded()) showScreen('home')
else {
    mode = 'journey'
    journeyDef = journeyLevel(1)
    journeyGoals = journeyStars(journeyDef)
    showScreen('game')
    newGame()
}

platform.init({
    // during an ad: silence the game, freeze the clock and block input (platform.adShowing)
    onAdStarted() {
        sfx.suspend()
        pauseClock()
        document.body.classList.add('is-ad')
    },
    onAdFinished() {
        document.body.classList.remove('is-ad')
        if (!document.hidden) sfx.resume()
    },
}).then(() => {
    // the portal may only know the player's language once its SDK is ready
    const lang = i18n.detect(platform.language())
    if (lang !== i18n.lang) {
        i18n.set(lang)
        langSelect.value = lang
        relocalize()
    }
    return document.fonts.ready
}).then(() => platform.loadingFinished())
