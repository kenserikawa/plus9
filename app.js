const COLORS = ['#ff623a', '#37afff', '#8746ff', '#ff31cc']

// Difficulty curve (tuned by simulation): every SUMS_PER_LEVEL completed sums the
// target grows and tiles can roll up to target - 1
const TARGETS = [9, 10, 12, 14, 16, 18, 20]
const SUMS_PER_LEVEL = 4
const MAX_FREE_SHUFFLES = 3
// with no free shuffles left, a shuffle costs SHUFFLE_COST × level × (paid shuffles so far + 1).
// A flat cost made careful play endless in simulation; the growing cost keeps games finite.
const SHUFFLE_COST = 10
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
const clockEl = document.getElementById('clock')
const clockTimeEl = document.getElementById('clock-time')
const dialog = document.getElementById('over')
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
let level = 0       // index into TARGETS
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

const target = () => TARGETS[level]
const randomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)]
const shuffleCost = () => SHUFFLE_COST * (level + 1) * (paidShuffles + 1)
const canShuffle = () => freeShuffles > 0 || score >= shuffleCost()
const randomTile = () => ({ value: Math.floor(Math.random() * (target() - 1)) + 1, color: randomColor() })

// ---------- setup ----------

function buildRing(intro = false) {
    // one arc segment per unit of the current target
    const n = target(), r = 44, c = 2 * Math.PI * r, gap = 2.2, seg = c / n - gap
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
        if (sums % SUMS_PER_LEVEL === 0 && level < TARGETS.length - 1) return levelUp()
        resolving = false
        render()
        checkStuck()
    }, 450)
}

function levelUp() {
    const from = target()
    level++
    freeShuffles = Math.min(MAX_FREE_SHUFFLES, freeShuffles + 1)
    next = randomTile()

    // the new target gets its own moment: a card over the board, then the well shows it big
    document.getElementById('lu-level').textContent = level + 1
    document.getElementById('lu-old').textContent = from
    document.getElementById('lu-new').textContent = target()
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

function gameOver(reason) {
    playing = false
    stuck = false
    stopClock()
    sfx.gameOver()
    document.getElementById('over-reason').textContent = reason
    document.getElementById('over-score').textContent = score
    // the record is the final score, so points spent on shuffles count against it
    const record = score > best ? ' New best!' : ''
    if (score > best) saveBest(score)
    document.getElementById('over-stats').textContent =
        `${sums} ${sums === 1 ? 'sum' : 'sums'}, reached level ${level + 1}.${record}`
    render()
    setTimeout(() => dialog.showModal(), 500)
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
    buildRing()
    tiles.forEach(t => setTile(t, randomTile()))
    next = randomTile()
    clockEl.hidden = mode !== 'timed'
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
    shuffleBtn.setAttribute('aria-label', freeShuffles > 0
        ? `Shuffle all tiles, ${freeShuffles} free left`
        : `Shuffle all tiles for ${cost} points`)

    scoreEl.textContent = score
    levelEl.textContent = level + 1
    bestEl.textContent = Math.max(best, score)

    document.querySelectorAll('.mode').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === mode))
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

// ---------- persistence ----------

function readMode() {
    try { return localStorage.getItem('plus9.mode') === 'timed' ? 'timed' : 'classic' } catch { return 'classic' }
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

document.getElementById('again').addEventListener('click', () => {
    dialog.close()
    newGame()
})
dialog.addEventListener('cancel', ev => ev.preventDefault())
shuffleBtn.addEventListener('click', shuffle)
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
})

// browsers only start audio after a user gesture
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
