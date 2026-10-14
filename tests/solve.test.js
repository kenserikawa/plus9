const test = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const path = require('node:path')
const R = require('../rules.js')
const { solve, won } = require('../tools/solve.js')

test('a level with every tile frozen has no win, and the tool says so', () => {
    const def = R.journeyLevel(83)
    def.setup = Array.from({ length: 8 }, (_, index) => ({ index, ice: 99 }))
    const out = solve(83, def)
    assert.match(out, /NO WIN/)
    assert.equal(won(out), false)
})

test('a winnable level is a win', () => {
    assert.equal(won(solve(83)), true)
})

test('the command exits 0 when every level is won', () => {
    execFileSync('node', [path.join(__dirname, '../tools/solve.js'), '81-82'], { stdio: 'pipe' })
})
