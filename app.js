const COLORS = ['#ff623a', '#37afff', '#8746ff', '#ff31cc']

// Difficulty curve (tuned by simulation). Every SUMS_PER_LEVEL completed sums the level
// rises with no cap: the target follows TARGETS, then grows by 2 per level.
const TARGETS = [9, 10, 12, 14, 16, 18, 20]
const SUMS_PER_LEVEL = 4
// Tiles roll 1..target-1 with P(v) ∝ exp(-v / λ), so small numbers are more common.
// λ per level was fitted so a typical player's chance of a dead end rises by ~2 points
// per level (17% at level 1). Past the table, λ ≈ 0.78 × target keeps the same slope.
// Infinity = uniform. Re-run the simulation before changing these.
const TILE_LAMBDA = [Infinity, 189, 40, 26, 24, 21, 20, 20, 21.5, 21, 22.7, 22.7, 24.4, 26.1, 27.2, 30]
const MAX_FREE_SHUFFLES = 3
// with no free shuffles left, a shuffle costs SHUFFLE_COST × level × (paid shuffles so far + 1).
// A flat cost made careful play endless in simulation; the growing cost keeps games finite.
const SHUFFLE_COST = 10
const DAILY_SUMS = 12          // a daily challenge is levels 1–3: short and comparable
const DAILY_EPOCH = '2026-10-11' // daily #1
const TIMED_SECONDS = 60
const TIME_BONUS = 2 // seconds added per completed sum in timed mode

const board = document.getElementById('board')
const well = document.getElementById('well')
const ring = document.getElementById('ring')
const sumEl = document.getElementById('sum')
const needEl = document.getElementById('need')
const scoreEl = document.getElementById('score')
const levelEl = document.getElementById('level')
const bestEl = document.getElementById('best')
const nextEl = document.getElementById('next')
const shuffleBtn = document.getElementById('shuffle')
const shuffleBadge = document.getElementById('shuffle-badge')
const bankBtn = document.getElementById('bank')
const bankBadge = document.getElementById('bank-badge')
const nextPill = document.querySelector('.next')
const clockEl = document.getElementById('clock')
const clockTimeEl = document.getElementById('clock-time')
const dialog = document.getElementById('over')
const againBtn = document.getElementById('again')
const dailyResultEl = document.getElementById('daily-result')
const bestLabelEl = document.getElementById('best-label')
const dailyTab = document.querySelector('[data-mode="daily"]')
const shareBtn = document.getElementById('share')
const levelUpEl = document.getElementById('levelup')
const LEVEL_UP_MS = 1700 // how long the level-up card stays on screen
const help = document.getElementById('help')
const soundBtn = document.getElementById('sound-btn')

let tiles = []      // [{ value, color, el }]
let next = null     // { value, color } that replaces the next tile played
let parts = []      // [{ value, color }] of the tiles currently in the well
let sum = 0
let score = 0
let sums = 0        // completed sums this game
let level = 0       // 0-based; shown to the player as level + 1
let freeShuffles = 1
let paidShuffles = 0
let stuck = false
let playing = true
let resolving = false // a completed sum is still on show
let mode = readMode()
let best = readBest(mode)
let deadline = 0
let timer = null
let pausedLeft = null // ms left on the clock while the help sheet is open
let lastSecond = null
let gameId = 0 // bumps on every new game so stale timeouts can bail out
let chainLog = []  // tiles used per completed sum, for the daily share grid

const targetFor = lv => lv < TARGETS.length ? TARGETS[lv] : TARGETS[TARGETS.length - 1] + 2 * (lv - TARGETS.length + 1)
const target = () => targetFor(level)
// every random draw goes through rng: Math.random normally, a seeded generator in the
// daily challenge so everyone gets the same tiles on the same day
let rng = Math.random
let seedState = 0
function seededRandom() {
    // mulberry32; seedState is saved with the daily progress so a reload resumes the sequence
    let t = (seedState = (seedState + 0x6D2B79F5) | 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const randomColor = () => COLORS[Math.floor(rng() * COLORS.length)]
const shuffleCost = () => SHUFFLE_COST * (level + 1) * (paidShuffles + 1)
const canShuffle = () => freeShuffles > 0 || score >= shuffleCost()
const randomTile = () => ({ value: randomValue(), color: randomColor() })

function randomValue() {
    const max = target() - 1
    const lambda = level < TILE_LAMBDA.length ? TILE_LAMBDA[level] : 0.78 * target()
    if (lambda === Infinity) return Math.floor(rng() * max) + 1
    // weighted pick: weight of v is exp(-v / λ)
    let total = 0
    for (let v = 1; v <= max; v++) total += Math.exp(-v / lambda)
    let r = rng() * total
    for (let v = 1; v <= max; v++) {
        r -= Math.exp(-v / lambda)
        if (r <= 0) return v
    }
    return max
}

// ---------- setup ----------

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

function setTile(tile, { value, color }) {
    tile.value = value
    tile.color = color
    tile.el.textContent = value
    tile.el.classList.toggle('is-wide', value >= 10)
    tile.el.style.setProperty('--tile', color)
    tile.el.setAttribute('aria-label', `Add ${value}`)
    bump(tile.el, 'pop-in')
}

function takeNext() {
    const tile = next
    next = randomTile()
    return tile
}

// ---------- game rules ----------

function play(tile) {
    if (!playing || resolving || stuck) return
    if (mode === 'timed' && !timer) startClock(TIMED_SECONDS * 1000)

    const goal = target()
    const total = sum + tile.value

    if (total > goal) {
        sum = total
        render()
        bump(well, 'shake')
        sfx.overshoot()
        return gameOver(`${total - tile.value} + ${tile.value} = ${total}. That's over ${goal}.`)
    }

    sum = total
    parts.push({ value: tile.value, color: tile.color })
    setTile(tile, takeNext())

    if (sum === goal) return completeSum()

    sfx.add(sum / goal)
    render()
    checkStuck()
}

function completeSum() {
    // longer chains score more, and every level multiplies the reward
    const points = parts.length * (level + 1)
    score += points
    sums++
    chainLog.push(parts.length)

    resolving = true
    render()
    bump(well, 'match')
    bump(scoreEl, 'bump')
    floatText(well, `+${points}`)
    sfx.complete(parts.length)
    if (mode === 'timed') {
        deadline += TIME_BONUS * 1000
        floatText(clockEl, `+${TIME_BONUS}s`)
    }

    const id = gameId
    setTimeout(() => {
        if (id !== gameId) return
        sum = 0
        parts = []
        if (mode === 'daily' && sums === DAILY_SUMS) return gameOver(`You finished all ${DAILY_SUMS} sums.`, false, true)
        if (sums % SUMS_PER_LEVEL === 0) return levelUp()
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
    document.getElementById('lu-level').textContent = level + 1
    document.getElementById('lu-old').textContent = from
    document.getElementById('lu-new').textContent = target()
    document.getElementById('lu-note').textContent = gainsShuffle ? 'New target. +1 free shuffle' : 'New target'
    levelUpEl.hidden = false
    bump(levelUpEl, 'is-showing')
    pauseClock()
    sfx.levelUp()
    render()
    bump(levelEl, 'bump')

    const id = gameId
    setTimeout(() => {
        if (id !== gameId) return
        levelUpEl.hidden = true
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
    stuck = !tiles.some(t => t.value <= need)
    if (!stuck) return
    if (canShuffle()) {
        sfx.stuck()
        render()
        return
    }
    sfx.stuck()
    gameOver(`You needed ${need} or less, every tile is bigger, and a shuffle costs ${shuffleCost()} points.`)
}

// stuck with no free shuffle: end the game now and keep every point instead of paying
function bank() {
    if (!playing || !stuck || freeShuffles > 0) return
    gameOver(`You banked your points instead of paying ${shuffleCost()} for a shuffle.`, true)
}

function shuffle() {
    if (!playing || resolving || !canShuffle()) return
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
    stuck = false
    tiles.forEach(t => setTile(t, randomTile()))
    render()
    checkStuck()
}

function gameOver(reason, banked = false, completed = false) {
    playing = false
    stuck = false
    stopClock()
    if (banked || completed) sfx.bank()
    else sfx.gameOver()

    if (mode === 'daily') {
        const result = finishDaily(completed ? 'complete' : banked ? 'banked' : 'bust', reason)
        render()
        setTimeout(() => showDailyResult(result), 500)
        return
    }

    showResult({
        title: banked ? 'Banked!' : 'Game over',
        happy: banked,
        reason,
        // the record is the final score, so points spent on shuffles count against it
        stats: `${sums} ${sums === 1 ? 'sum' : 'sums'}, reached level ${level + 1}.${score > best ? ' New best!' : ''}`,
    })
    if (score > best) saveBest(score)
    render()
    setTimeout(() => dialog.showModal(), 500)
}

function showResult({ title, happy, reason, stats }) {
    const titleEl = document.getElementById('over-title')
    titleEl.textContent = title
    titleEl.classList.toggle('is-banked', happy)
    document.getElementById('over-reason').textContent = reason
    document.getElementById('over-score').textContent = score
    document.getElementById('over-stats').textContent = stats
    dailyResultEl.hidden = mode !== 'daily'
    againBtn.textContent = mode === 'daily' ? 'Play Classic' : 'Play again'
}

function newGame() {
    stopClock()
    gameId++
    levelUpEl.hidden = true
    sum = 0
    parts = []
    score = 0
    sums = 0
    level = 0
    freeShuffles = 1
    paidShuffles = 0
    stuck = false
    resolving = false
    playing = true
    deadline = 0
    pausedLeft = null
    lastSecond = null
    best = readBest(mode)
    chainLog = []
    rng = Math.random
    clockEl.hidden = mode !== 'timed'

    if (mode === 'daily') {
        rng = seededRandom
        const saved = readDaily()
        if (saved && saved.done) {
            // today's daily is already played: show the board it was seeded with, then the result
            seedState = hashSeed(todayKey())
            playing = false
            score = saved.score
            sums = saved.sums
            buildRing()
            tiles.forEach(t => setTile(t, randomTile()))
            next = randomTile()
            renderClock(TIMED_SECONDS * 1000)
            render()
            setTimeout(() => showDailyResult(saved), 300)
            return
        }
        if (saved && saved.state) return restoreDaily(saved.state)
        seedState = hashSeed(todayKey())
    }

    buildRing()
    tiles.forEach(t => setTile(t, randomTile()))
    next = randomTile()
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
        if (left <= 0) gameOver("Time's up.")
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
    const goal = target()
    const need = goal - sum
    const empty = sum === 0
    // an empty well shows the target itself, big, so it is always in view
    sumEl.textContent = empty ? goal : sum
    needEl.textContent =
        sum > goal ? 'Too much'
        : sum === goal ? 'Got it!'
        : stuck ? 'No moves'
        : empty ? 'Make'
        : `needs ${need}`
    well.classList.toggle('is-over', sum > goal)
    well.classList.toggle('is-stuck', stuck)
    well.classList.toggle('is-empty', empty)
    well.setAttribute('aria-label', empty ? `Make ${goal}` : `${sum} of ${goal}`)

    // fill one ring segment per point, coloured by the tile that supplied it
    const colors = parts.flatMap(p => Array(p.value).fill(p.color))
    ring.querySelectorAll('.seg').forEach((seg, i) => {
        seg.style.stroke = i < Math.min(sum, goal) ? (colors[i] || '') : ''
        seg.classList.toggle('on', i < sum)
    })

    nextEl.textContent = next.value
    nextEl.style.setProperty('--tile', next.color)

    const cost = shuffleCost()
    shuffleBadge.textContent = freeShuffles > 0 ? freeShuffles : `-${cost}`
    shuffleBadge.classList.toggle('is-cost', freeShuffles === 0)
    shuffleBtn.disabled = !playing || !canShuffle()
    shuffleBtn.classList.toggle('nudge', stuck)
    const offerBank = playing && stuck && freeShuffles === 0
    bankBtn.hidden = !offerBank
    nextPill.hidden = offerBank // Next is irrelevant while stuck; this keeps the row short
    bankBadge.textContent = score
    bankBtn.setAttribute('aria-label', `End the game and keep ${score} points`)
    shuffleBtn.setAttribute('aria-label', freeShuffles > 0
        ? `Shuffle all tiles, ${freeShuffles} free left`
        : `Shuffle all tiles for ${cost} points`)

    scoreEl.textContent = score
    levelEl.textContent = level + 1
    // in the daily the third pill tracks progress instead of a record
    bestLabelEl.textContent = mode === 'daily' ? 'Sums' : 'Best'
    bestEl.textContent = mode === 'daily' ? `${sums}/${DAILY_SUMS}` : Math.max(best, score)
    if (mode === 'daily' && playing) saveDailyProgress()

    document.querySelectorAll('.mode').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === mode))
    // a dot on the Daily tab until today's challenge is finished
    const dailyDone = !!(readDaily() || {}).done
    dailyTab.classList.toggle('is-new', !dailyDone)
    dailyTab.setAttribute('aria-label', dailyDone ? 'Daily' : "Daily, today's challenge not played yet")
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
            ghost.classList.remove('pop-in')
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

function todayKey(date = new Date()) {
    const pad = n => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function dailyNumber() {
    const day = key => Date.UTC(...key.split('-').map((n, i) => +n - (i === 1 ? 1 : 0)))
    return Math.round((day(todayKey()) - day(DAILY_EPOCH)) / 86400000) + 1
}

function hashSeed(text) {
    let h = 2166136261 // FNV-1a
    for (const ch of `plus9:${text}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
    return h | 0
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
            seedState,
            tiles: tiles.map(t => ({ value: t.value, color: t.color })),
            next,
            sum: done ? 0 : sum,
            parts: done ? [] : parts,
            score, sums, level, freeShuffles, paidShuffles, chainLog,
        },
    })
}

function restoreDaily(state) {
    seedState = state.seedState
    sum = state.sum
    parts = state.parts
    score = state.score
    sums = state.sums
    chainLog = state.chainLog
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
    const result = { done: true, number: dailyNumber(), outcome, reason, score, sums, chainLog }
    writeDaily(result)

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

function shareText(result) {
    const link = /^https?:/.test(location.protocol) ? `\n${location.origin}${location.pathname}` : ''
    return `Plus 9 Daily #${result.number}: ${result.score} points\n${dailyGrid(result)}${link}`
}

let countdownTimer = null

function showDailyResult(result) {
    score = result.score
    showResult({
        title: result.outcome === 'complete' ? 'Daily done!' : result.outcome === 'banked' ? 'Banked!' : 'Game over',
        happy: result.outcome !== 'bust',
        reason: result.reason,
        stats: `Daily #${result.number}, ${result.sums} of ${DAILY_SUMS} sums.`,
    })
    document.getElementById('daily-grid').textContent = dailyGrid(result)
    const streak = readStreak()
    document.getElementById('daily-streak').textContent =
        `Streak: ${streak.count} ${streak.count === 1 ? 'day' : 'days'} (best ${streak.best})`
    const tick = () => {
        const midnight = new Date()
        midnight.setHours(24, 0, 0, 0)
        const mins = Math.max(0, Math.ceil((midnight - Date.now()) / 60000))
        document.getElementById('daily-next').textContent = `Next daily in ${Math.floor(mins / 60)}h ${mins % 60}m`
    }
    tick()
    clearInterval(countdownTimer)
    countdownTimer = setInterval(tick, 30000)
    shareBtn.dataset.text = shareText(result)
    shareBtn.textContent = 'Share result'
    if (!dialog.open) dialog.showModal()
}

async function shareDaily() {
    const text = shareBtn.dataset.text
    sfx.ui()
    try {
        if (navigator.share) return await navigator.share({ text })
        await navigator.clipboard.writeText(text)
        shareBtn.textContent = 'Copied!'
    } catch (err) {
        if (err && err.name === 'AbortError') return // the player closed the share sheet
        shareBtn.textContent = 'Copy failed'
    }
}

// ---------- persistence ----------

function readMode() {
    try {
        const m = localStorage.getItem('plus9.mode')
        return m === 'timed' || m === 'daily' ? m : 'classic'
    } catch { return 'classic' }
}

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

function setMode(m) {
    if (m === mode) return
    if (playing && score > best) saveBest(score) // switching abandons the current game
    mode = m
    sfx.ui()
    try { localStorage.setItem('plus9.mode', m) } catch { /* storage unavailable */ }
    newGame()
}

// ---------- boot ----------

againBtn.addEventListener('click', () => {
    dialog.close()
    if (mode === 'daily') return setMode('classic')
    newGame()
})
shareBtn.addEventListener('click', shareDaily)
dialog.addEventListener('close', () => clearInterval(countdownTimer))
dialog.addEventListener('cancel', ev => ev.preventDefault())
shuffleBtn.addEventListener('click', shuffle)
bankBtn.addEventListener('click', bank)
document.querySelectorAll('.mode').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)))

// ---------- help sheet and sound toggle ----------

function openHelp() {
    if (help.open || dialog.open) return
    pauseClock()
    sfx.ui()
    help.showModal()
}

function toggleSound() {
    sfx.setMuted(!sfx.muted)
    renderSound()
    sfx.ui()
}

function renderSound() {
    soundBtn.setAttribute('aria-pressed', !sfx.muted)
    soundBtn.setAttribute('aria-label', sfx.muted ? 'Sound off' : 'Sound on')
}

document.getElementById('help-btn').addEventListener('click', openHelp)
document.getElementById('help-close').addEventListener('click', () => help.close())
help.addEventListener('close', () => {
    try { localStorage.setItem('plus9.seenHelp', '1') } catch { /* storage unavailable */ }
    if (levelUpEl.hidden) resumeClock() // otherwise the level-up card resumes it
})
soundBtn.addEventListener('click', toggleSound)

document.addEventListener('keydown', ev => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return
    const key = ev.key.toLowerCase()
    if (key === 'h' || key === '?') return help.open ? help.close() : openHelp()
    if (key === 'm') return toggleSound()
    if (key === 's' && !dialog.open && !help.open) shuffle()
    if (key === 'b' && !dialog.open && !help.open) bank()
})

// browsers only start audio after a user gesture
// leaving the tab or app pauses the 60-second clock and the audio
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        pauseClock()
        sfx.suspend()
        return
    }
    sfx.resume()
    // the help sheet and the level-up card resume the clock themselves when they close
    if (!help.open && levelUpEl.hidden) resumeClock()
})

// keep the record if the tab is closed mid-game
addEventListener('pagehide', () => { if (playing && score > best) saveBest(score) })

const unlock = () => sfx.unlock()
document.addEventListener('pointerdown', unlock, { once: true })
document.addEventListener('keydown', unlock, { once: true })

buildTiles()
newGame()
renderSound()

let seenHelp = false
try { seenHelp = localStorage.getItem('plus9.seenHelp') === '1' } catch { /* storage unavailable */ }
if (!seenHelp) help.showModal()
