// in Node (tools/balance.js) the rules come from require; in the page they are globals
if (typeof module !== 'undefined') Object.assign(globalThis, require('./rules.js'))

// Simulated players, used for the daily "par" and the journey star thresholds.
// They follow exactly the same draw order as app.js, so a seeded run sees the same board
// a person does. Pure functions on top of rules.js.

// The players choose an action from `state` = { tiles, next, parts, sum, need, target, plays,
// fusions }: `plays` are the indices of tiles that can go into the centre, `fusions` the
// [coupler, tile] index pairs that can fuse. They return { play: i }, { fuse: [c, t] } or null.
// With no minus or coupler tiles on the board they play exactly as they did before those
// existed (the star thresholds of levels 1–80 and the daily par depend on it).

// careful: finish with a number tile if one fits exactly (preferring a color combo); else fuse a
// coupler into a tile that fits exactly; use a wild tile to finish a chain of 2+ tiles or when
// nothing else fits; else a minus tile that leaves a tile fitting exactly; otherwise play the
// tile that leaves the most ways to finish, counting the Next tile (minus tiles last)
function carefulPick({ tiles, next, parts, need, plays, fusions }) {
    const numbers = plays.filter(i => tiles[i].special !== 'wild')
    const wild = plays.find(i => tiles[i].special === 'wild')
    const exact = numbers.filter(i => tileValue(tiles[i], need) === need)
    if (exact.length) return { play: exact.find(i => keepsCombo(parts, tiles[i])) ?? exact[0] }
    const finishing = fusions.find(([c, t]) => tiles[t].value + tiles[c].value === need)
    if (finishing) return { fuse: finishing }
    if (wild !== undefined && (parts.length >= 2 || !numbers.length)) return { play: wild }
    const isNumber = o => !o.ice && o.special !== 'minus' && o.special !== 'coupler'
    const opener = numbers.find(i => tiles[i].special === 'minus'
        && tiles.some((o, j) => j !== i && isNumber(o) && o.special !== 'wild' && o.value === need + tiles[i].value))
    if (opener !== undefined) return { play: opener }
    let best, bestScore = -Infinity
    for (const i of numbers) {
        const t = tiles[i]
        const rest = need - tileValue(t, need)
        const others = tiles.map((o, j) => (j === i ? next : o)).filter(o => !o.ice && o.special !== 'coupler')
        const s = others.filter(o => o.special === 'wild' || (o.special !== 'minus' && o.value === rest)).length * 10
            + others.filter(o => o.special !== 'minus' && o.value <= rest).length
            - (t.special === 'minus' ? 1000 : 0)
        if (s > bestScore) { bestScore = s; best = i }
    }
    if (best !== undefined) return { play: best }
    return fusions.length ? { fuse: fusions[0] } : null
}

// normal: finish if a number fits exactly, else a wild tile if there is one, else (half the
// time) a fusion that makes a tile fitting exactly, else any tile that fits, else any fusion
function normalPick({ tiles, need, plays, fusions }, rnd) {
    const exact = plays.find(i => tiles[i].special !== 'wild' && tileValue(tiles[i], need) === need)
    if (exact !== undefined) return { play: exact }
    const wild = plays.find(i => tiles[i].special === 'wild')
    if (wild !== undefined) return { play: wild }
    const finishing = fusions.find(([c, t]) => tiles[t].value + tiles[c].value === need)
    if (finishing && rnd() < 0.5) return { fuse: finishing }
    if (plays.length) return { play: plays[Math.floor(rnd() * plays.length)] }
    return fusions.length ? { fuse: fusions[Math.floor(rnd() * fusions.length)] } : null
}

const PLAYERS = { careful: carefulPick, normal: normalPick }

// Plays one run and returns { score, sums, completed }.
//   seed       board seed (same as the game's)
//   lv         starting difficulty (0-based)
//   sums       how many sums finish the run (Infinity for an open game)
//   levelUps   whether the difficulty rises every SUMS_PER_LEVEL sums (daily) or stays (journey)
//   initial    optional hand-picked { tiles, next } (journey level 1)
//   mechanics  0 none, 1 minus tiles, 2 minus and coupler tiles (journey 81+ / 91+)
//   player     'careful' | 'normal'; `playerSeed` seeds the normal player's choices
//   bankAt     Classic streak rules: sums go into a pot (×1, ×2 … up to STREAK_MAX) that the
//              bot cashes in after `bankAt` sums in a row; getting stuck loses the pot, and
//              a pot still open when the run ends is lost. null = points go straight to the score
// When stuck (or with nothing to do) and no free shuffle, the bot pays only if the shuffle
// costs under a third of its score, otherwise it stops (banks, or fails a journey level).
function simulateRun({ seed, lv = 0, sums = Infinity, levelUps = false, initial = null, specials = true, mechanics = 0, setup = [], player = 'careful', playerSeed = 1, bankAt = null }) {
    const board = createRng(seed).random
    const choice = createRng(playerSeed).random
    const pick = PLAYERS[player]
    const draw = () => drawTile(level, board, specials, mechanics)
    let level = lv
    let tiles = initial ? initial.tiles.map(t => ({ ...t })) : Array.from({ length: 8 }, draw)
    let next = initial ? { ...initial.next } : draw()
    applySetup(tiles, setup)
    let sum = 0, parts = [], score = 0, done = 0, free = 1, paid = 0
    let pot = 0, chain = 0, busts = 0

    for (let moves = 0; moves < 5000 && done < sums; moves++) {
        const target = targetFor(level)
        const need = target - sum
        const plays = tiles.map((t, i) => i).filter(i => canPlay(tiles[i], need, sum))
        const fusions = []
        tiles.forEach((c, i) => tiles.forEach((t, j) => { if (i !== j && canFuse(c, t, target)) fusions.push([i, j]) }))
        const action = isStuck(tiles, sum, target) ? null : pick({ tiles, next, parts, sum, need, target, plays, fusions }, choice)
        if (!action) {
            if (pot) busts++
            pot = 0
            chain = 0
            const cost = shuffleCostFor(level, paid)
            if (free > 0) free--
            else if (score >= cost && cost < score / 3) { score -= cost; paid++ }
            else return { score, sums: done, completed: false, busts }
            tiles = tiles.map(t => (t.ice ? t : draw())) // frozen tiles stay put
            continue
        }
        if (action.fuse) {
            const [c, t] = action.fuse
            tiles[t] = fuse(tiles[t], tiles[c])
            tiles[c] = next
            next = draw()
            continue
        }
        const i = action.play
        const t = tiles[i]
        sum += tileValue(t, need)
        parts.push(t)
        tiles[i] = next
        next = draw()
        if (sum < target) continue

        const { points } = sumPoints(parts, level)
        if (bankAt) {
            chain++
            pot += points * streakMultiplier(chain)
            if (chain >= bankAt) {
                score += pot
                pot = 0
                chain = 0
            }
        } else score += points
        done++
        sum = 0
        parts = []
        tiles = tiles.map(x => (x.ice ? { ...x, ice: x.ice - 1 || undefined } : x)) // each sum thaws the ice a little
        if (levelUps && done < sums && done % SUMS_PER_LEVEL === 0) {
            level++
            if (free < MAX_FREE_SHUFFLES) free++
            next = draw()
        }
    }
    return { score, sums: done, completed: done >= sums, busts }
}

// round to a friendly number, never below 1
const friendly = x => Math.max(1, x >= 50 ? Math.round(x / 5) * 5 : Math.round(x))

// Star thresholds for a journey level: 1★ for finishing, 2★ around what a typical player
// scores when they finish, 3★ what the careful player scores. Deterministic per level.
function journeyStars(def) {
    const base = { seed: def.seed, lv: def.lv, sums: def.sums, initial: def.initial, specials: def.specials, mechanics: def.mechanics, setup: def.setup }
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
    module.exports = { simulateRun, journeyStars, dailyPar, carefulPick, normalPick }
}
