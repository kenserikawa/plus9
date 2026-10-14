// The loading screen: Nine in the well while the game loads behind it, then a flight to its
// place on the first screen. The loader adds the game's scripts to the page itself (SCRIPTS),
// so their downloads start after its own and it can count them; the fonts are one more step,
// and the game's own start (portal SDK, language) the last one, reported by finish(). The ring
// lights its 9 segments one at a time as steps finish, so even an instant load reads as Nine
// making 9.

const loader = (() => {
    const el = document.getElementById('loader')
    const ring = el.querySelector('.ring')
    const nine = el.querySelector('.mascot')
    // the game's scripts, in the order they run (tools/build.js versions these names)
    const SCRIPTS = ['platform.js', 'i18n.js', 'rules.js', 'bot.js', 'meta.js', 'sound.js', 'app.js']
    const SEGMENTS = 9
    const STEP_MS = 60 // at most one segment per step, so the ring always fills visibly
    const segs = []
    const blocked = [] // the page under the loading screen: inert until it leaves
    let total = 1 // the game's own start, reported by finish()
    let done = 0
    let shown = 0
    let timer = null
    let onFull = null
    let active = true

    const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

    // the same geometry as the game's ring (buildRing in app.js)
    function buildRing() {
        const r = 44, c = 2 * Math.PI * r, gap = 2.2, seg = c / SEGMENTS - gap
        for (let i = 0; i < SEGMENTS; i++) {
            const arc = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
            arc.setAttribute('cx', 50)
            arc.setAttribute('cy', 50)
            arc.setAttribute('r', r)
            arc.setAttribute('stroke-dasharray', `${seg} ${c - seg}`)
            arc.setAttribute('stroke-dashoffset', -(i * c) / SEGMENTS + c / 4 - gap / 2)
            arc.classList.add('seg')
            ring.appendChild(arc)
            segs.push(arc)
        }
    }

    // what Nine wears, read straight from the save (meta.outfit() checks it again once loaded)
    function savedOutfit() {
        try { return JSON.parse(localStorage.getItem('plus9.outfit')) || {} } catch { return {} }
    }

    function track(promise) {
        total++
        promise.then(step, step) // a font or a script that fails must not stall the ring
    }

    function step() {
        done++
        tick()
    }

    // light the share of segments that matches the finished steps, one per STEP_MS
    function tick() {
        if (timer || shown >= Math.floor((SEGMENTS * done) / total)) return
        light(shown++)
        if (shown === SEGMENTS && onFull) onFull()
        if (document.hidden) return tick() // a hidden page throttles timers: catch up at once
        timer = setTimeout(() => {
            timer = null
            tick()
        }, STEP_MS)
    }

    // a segment lights up in a tile color, and Nine looks at it
    function light(i) {
        segs[i].classList.add('is-on')
        el.setAttribute('aria-valuenow', i + 1)
        const r = ring.getBoundingClientRect()
        const angle = ((i + 0.5) / SEGMENTS) * 2 * Math.PI - Math.PI / 2 // segment 0 starts at the top
        mascot.look(r.left + r.width * (0.5 + 0.44 * Math.cos(angle)), r.top + r.height * (0.5 + 0.44 * Math.sin(angle)))
    }

    function loadScripts() {
        for (const src of SCRIPTS) {
            const script = document.createElement('script')
            script.src = src
            script.async = false // downloads start at once, but they run in the listed order
            track(new Promise((resolve, reject) => {
                script.onload = resolve
                script.onerror = reject
            }))
            document.body.appendChild(script)
        }
    }

    // The game is ready: fill the ring, cheer, then fly Nine to `target` (the mascot on the
    // first screen) while the loading screen fades out. Resolves once the page can be played.
    async function finish(target) {
        await new Promise(resolve => {
            onFull = resolve
            step()
        })
        mascot.look(null)
        mascot.emote(nine, 'cheer')
        const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
        if (document.hidden) {
            // nobody is watching: no show
        } else if (reduce) {
            // reduced motion cuts the CSS transitions short: the whole screen fades instead
            await el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).finished
        } else if (target && target.getClientRects().length) {
            await wait(300) // a moment of cheer before take-off
            el.classList.add('is-leaving')
            const from = nine.getBoundingClientRect()
            const to = target.getBoundingClientRect()
            const dx = to.left + to.width / 2 - (from.left + from.width / 2)
            const dy = to.top + to.height / 2 - (from.top + from.height / 2)
            const s = to.width / from.width
            const lift = Math.min(80, Math.abs(dy) * 0.3) // a little arc on the way
            target.style.visibility = 'hidden' // the flying Nine stands in for it until it lands
            await nine.animate([
                { transform: 'none', easing: 'cubic-bezier(.3, 0, .6, 1)' },
                { offset: 0.45, transform: `translate(${dx * 0.4}px, ${dy * 0.4 - lift}px) scale(${1 + (s - 1) * 0.4})`, easing: 'cubic-bezier(.4, 0, .2, 1)' },
                { transform: `translate(${dx}px, ${dy}px) scale(${s})` },
            ], { duration: 650, fill: 'forwards' }).finished
            target.style.visibility = ''
            mascot.emote(target, 'love') // a happy hop on landing
        } else {
            el.classList.add('is-leaving')
            await wait(450) // the fade (styles.css)
        }
        el.remove()
        blocked.forEach(child => { child.inert = false })
        active = false
    }

    for (const child of document.body.children) {
        if (child === el || child.tagName === 'SCRIPT') continue
        child.inert = true
        blocked.push(child)
    }
    buildRing()
    mascot.dress(savedOutfit())
    mascot.mount()
    el.classList.add('is-ready')
    loadScripts()
    // the fonts only download once something on screen uses them: ask for them now
    if (document.fonts) track(Promise.all(['1em Ranchers', '600 1em "Baloo 2"'].map(font => document.fonts.load(font))))

    return {
        finish,
        // the loading screen is up: the page under it ignores the keyboard and the pointer
        get active() { return active },
    }
})()
