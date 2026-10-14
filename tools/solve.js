// Can a journey level be won? Exhaustive search over every play, fusion and shuffle.
// Run with: node tools/solve.js 83   or   node tools/solve.js 81-200 [nodes per level]
// A journey board is fixed: every tile comes from the level's seed in a fixed order whatever
// the player does, so the draws are a precomputed stream. Prints a winning line per level;
// exits with 1 if some level has none.
const R = require('../rules.js')
Object.assign(globalThis, R)

const [from, to] = (process.argv[2] || '').split('-').map(Number)
const budget = +(process.argv[3] || 300000)
if (!from) {
    console.log('usage: node tools/solve.js <level | from-to> [nodes]')
    process.exit(2)
}

function solve(n) {
    const def = journeyLevel(n)
    const lv = def.lv
    const target = targetFor(lv)
    const rnd = createRng(def.seed).random
    const stream = []
    const draw = k => { while (stream.length <= k) stream.push(drawTile(lv, rnd, def.specials, def.mechanics)); return { ...stream[k] } }
    const tiles0 = def.initial ? def.initial.tiles.map(t => ({ ...t })) : Array.from({ length: 8 }, (_, i) => draw(i))
    let idx0 = def.initial ? 0 : 8
    const next0 = def.initial ? { ...def.initial.next } : draw(idx0++)
    applySetup(tiles0, def.setup)

    const face = t => (t.special === 'wild' ? '★' : t.special === 'minus' ? `−${t.value}` : t.special === 'coupler' ? `+${t.value}` : `${t.value}`)
    const key = s => s.tiles.map(t => `${face(t)}${t.special ? t.special[0] : ''}${t.ice || ''}${COLORS.indexOf(t.color)}`).join(',')
        + `|${face(s.next)}|${s.idx}|${s.sum}|${s.done}|${s.free}|${s.paid}|${s.score}|${s.parts.map(p => (anyColor(p) || p.special === 'minus' ? '*' : COLORS.indexOf(p.color))).join('')}`
    const seen = new Set()
    let nodes = 0, win = null

    function search(s, line) {
        if (win || nodes++ > budget) return
        if (s.done >= def.sums) { win = { score: s.score, line }; return }
        const k = key(s)
        if (seen.has(k)) return
        seen.add(k)
        const need = target - s.sum
        if (!isStuck(s.tiles, s.sum, target)) {
            // plays, finishing ones first
            const plays = s.tiles.map((t, i) => i).filter(i => canPlay(s.tiles[i], need, s.sum))
                .sort((a, b) => (tileValue(s.tiles[b], need) === need) - (tileValue(s.tiles[a], need) === need))
            for (const i of plays) {
                const t = s.tiles[i]
                const tiles = s.tiles.slice()
                tiles[i] = s.next
                const parts = [...s.parts, t]
                const sum = s.sum + tileValue(t, need)
                const out = { tiles, next: draw(s.idx), idx: s.idx + 1, sum, parts, score: s.score, done: s.done, free: s.free, paid: s.paid }
                if (sum === target) {
                    out.score += sumPoints(parts, lv).points
                    out.done++
                    out.sum = 0
                    out.parts = []
                    out.tiles = tiles.map(x => (x.ice ? { ...x, ice: x.ice - 1 || undefined } : x))
                }
                search(out, [...line, `${face(t)}${sum === target ? ' =' : ''}`])
                if (win) return
            }
            // fusions
            for (let c = 0; c < 8; c++) for (let j = 0; j < 8; j++) {
                if (c === j || !canFuse(s.tiles[c], s.tiles[j], target)) continue
                const tiles = s.tiles.slice()
                tiles[j] = fuse(tiles[j], tiles[c])
                tiles[c] = s.next
                search({ ...s, tiles, next: draw(s.idx), idx: s.idx + 1 }, [...line, `${face(s.tiles[c])}→${face(s.tiles[j])}`])
                if (win) return
            }
        }
        // shuffle: free first, then paid if affordable
        const cost = shuffleCostFor(lv, s.paid)
        if (s.free > 0 || s.score >= cost) {
            let idx = s.idx
            const tiles = s.tiles.map(t => (t.ice ? t : draw(idx++)))
            const paid = s.free === 0
            search({ ...s, tiles, idx, free: paid ? 0 : s.free - 1, paid: paid ? s.paid + 1 : s.paid, score: paid ? s.score - cost : s.score }, [...line, paid ? `shuffle(−${cost})` : 'shuffle'])
        }
    }

    search({ tiles: tiles0, next: next0, idx: idx0, sum: 0, parts: [], score: 0, done: 0, free: 1, paid: 0 }, [])
    return win ? `${n}: WIN (score ${win.score}) ${win.line.join(' ')}`
        : nodes > budget ? `${n}: unknown after ${budget} nodes`
        : `${n}: NO WIN (exhaustive)`
}

let failed = false
for (let n = from; n <= (to || from); n++) {
    const out = solve(n)
    if (!out.includes('WIN (')) failed = true
    console.log(out)
}
process.exit(failed ? 1 : 0)
