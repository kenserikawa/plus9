// in Node (tools/balance.js) the rules come from require; in the page they are globals
if (typeof module !== 'undefined') Object.assign(globalThis, require('./rules.js'))

// Simulated players, used for the daily "par" and the journey star thresholds.
// They follow exactly the same draw order as app.js, so a seeded run sees the same board
// a person does. Pure functions on top of rules.js.

// careful: finish the sum if a tile fits exactly (preferring a color combo), otherwise
// play the tile that leaves the most ways to finish, counting the Next tile
function carefulPick(fits, need, tiles, next, parts) {
    const exact = fits.filter(([t]) => t.value === need)
    if (exact.length) {
        const combo = exact.find(([t]) => parts.every(p => p.color === t.color))
        return combo || exact[0]
    }
    let best, bestScore = -1
    for (const [t, i] of fits) {
        const rest = need - t.value
        const others = tiles.map((o, j) => (j === i ? next : o))
        const s = others.filter(o => o.value === rest).length * 10 + others.filter(o => o.value <= rest).length
        if (s > bestScore) { bestScore = s; best = [t, i] }
    }
    return best
}

// normal: finish if possible, otherwise any tile that fits
function normalPick(fits, need, tiles, next, parts, rnd) {
    return fits.find(([t]) => t.value === need) || fits[Math.floor(rnd() * fits.length)]
}

const PLAYERS = { careful: carefulPick, normal: normalPick }

// Plays one run and returns { score, sums, completed }.
//   seed       board seed (same as the game's)
//   lv         starting difficulty (0-based)
//   sums       how many sums finish the run (Infinity for an open game)
//   levelUps   whether the difficulty rises every SUMS_PER_LEVEL sums (daily) or stays (journey)
//   initial    optional hand-picked { tiles, next } (journey level 1)
//   player     'careful' | 'normal'; `playerSeed` seeds the normal player's choices
// When stuck with no free shuffle the bot pays only if the shuffle costs under a third
// of its score, otherwise it stops (banks, or fails a journey level).
function simulateRun({ seed, lv = 0, sums = Infinity, levelUps = false, initial = null, player = 'careful', playerSeed = 1 }) {
    const board = createRng(seed).random
    const choice = createRng(playerSeed).random
    const pick = PLAYERS[player]
    let level = lv
    let tiles = initial ? initial.tiles.map(t => ({ ...t })) : Array.from({ length: 8 }, () => drawTile(level, board))
    let next = initial ? { ...initial.next } : drawTile(level, board)
    let sum = 0, parts = [], score = 0, done = 0, free = 1, paid = 0

    for (let moves = 0; moves < 5000 && done < sums; moves++) {
        const need = targetFor(level) - sum
        const fits = tiles.map((t, i) => [t, i]).filter(([t]) => t.value <= need)
        if (!fits.length) {
            const cost = shuffleCostFor(level, paid)
            if (free > 0) free--
            else if (score >= cost && cost < score / 3) { score -= cost; paid++ }
            else return { score, sums: done, completed: false }
            tiles = tiles.map(() => drawTile(level, board))
            continue
        }
        const [t, i] = pick(fits, need, tiles, next, parts, choice)
        sum += t.value
        parts.push(t)
        tiles[i] = next
        next = drawTile(level, board)
        if (sum < targetFor(level)) continue

        score += sumPoints(parts, level).points
        done++
        sum = 0
        parts = []
        if (levelUps && done < sums && done % SUMS_PER_LEVEL === 0) {
            level++
            if (free < MAX_FREE_SHUFFLES) free++
            next = drawTile(level, board)
        }
    }
    return { score, sums: done, completed: done >= sums }
}

// round to a friendly number, never below 1
const friendly = x => Math.max(1, x >= 50 ? Math.round(x / 5) * 5 : Math.round(x))

// Star thresholds for a journey level: 1★ for finishing, 2★ around what a typical player
// scores when they finish, 3★ what the careful player scores. Deterministic per level.
function journeyStars(def) {
    const base = { seed: def.seed, lv: def.lv, sums: def.sums, initial: def.initial }
    const normals = []
    for (let k = 0; k < 15; k++) {
        const run = simulateRun({ ...base, player: 'normal', playerSeed: hashSeed(`journey-bot:${def.n}:${k}`) })
        if (run.completed) normals.push(run.score)
    }
    normals.sort((a, b) => a - b)
    const typical = normals.length ? normals[Math.floor(normals.length / 2)] : def.sums * 2 * (def.lv + 1)
    const careful = simulateRun({ ...base, player: 'careful' })
    const two = friendly(typical)
    const three = Math.max(friendly(careful.completed ? careful.score : 0), two + friendly(def.sums * (def.lv + 1)))
    return [0, two, three] // score needed for 1★ (finish), 2★, 3★
}

// the daily par: what the careful player scores on today's board
function dailyPar(seed) {
    return simulateRun({ seed, sums: DAILY_SUMS, levelUps: true, player: 'careful' }).score
}

if (typeof module !== 'undefined') {
    module.exports = { simulateRun, journeyStars, dailyPar }
}
