// Nine, the mascot: a gold "9" with a face in its loop. Inline SVG (not <use>) so CSS can
// switch its expression with data-mood. Moods: idle, happy, cheer, worried, sad.
// It only moves in answer to the player, plus an occasional blink.
// Nine can wear one accessory per slot (head, face, neck), drawn in its own coordinates
// (viewBox 0 0 100 124; hats rise above y = 0, the SVG shows overflow).

const mascot = (() => {
    const INK = '#1d0f38'
    // the stem drops straight down the loop's right side, then curls left at the bottom
    const TAIL = 'M79 46 L79 80 Q79 110 42 110'

    // accessories, in the sticker style: ink outline, game colors
    const W = 'stroke="#1d0f38" stroke-width="4" stroke-linejoin="round"'
    const ITEMS = {
        party: `<g ${W}><path d="M30 12 L50 -32 L66 8 Z" fill="#ff31cc"/><path d="M38 -6 L58 -2 M44 -20 L55 -17" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/><circle cx="50" cy="-33" r="7" fill="#ffd23f"/></g>`,
        wizard: `<g ${W}><path d="M24 10 C34 -6 44 -30 62 -48 C60 -26 66 -6 76 10 Z" fill="#8746ff"/><ellipse cx="50" cy="10" rx="36" ry="8" fill="#6a2fe0"/><path d="M47 -14 l2.5 5 5.5 .8 -4 3.9 1 5.5 -5 -2.6 -5 2.6 1 -5.5 -4 -3.9 5.5 -.8z" fill="#ffd23f" stroke-width="2"/></g>`,
        explorer: `<g ${W}><path d="M24 12 C24 -20 76 -20 76 12 Z" fill="#d9b27a"/><path d="M25 3 L75 3" stroke="#6b4f2a" stroke-width="8"/><ellipse cx="50" cy="12" rx="46" ry="9" fill="#c89a5c"/></g>`,
        antennae: `<g ${W} fill="none"><path d="M38 8 Q32 -10 24 -24 M62 8 Q68 -10 76 -24" stroke-linecap="round"/><circle cx="24" cy="-26" r="7" fill="#5fe08a"/><circle cx="76" cy="-26" r="7" fill="#ff31cc"/></g>`,
        headphones: `<g><path d="M14 46 C12 -16 88 -16 86 46" fill="none" stroke="#1d0f38" stroke-width="11" stroke-linecap="round"/><path d="M14 46 C12 -16 88 -16 86 46" fill="none" stroke="#37afff" stroke-width="5" stroke-linecap="round"/><rect x="2" y="32" width="17" height="28" rx="7" fill="#37afff" ${W}/><rect x="81" y="32" width="17" height="28" rx="7" fill="#37afff" ${W}/></g>`,
        cap: `<g ${W}><path d="M14 24 C14 -14 86 -14 86 24 Z" fill="#ff623a"/><path d="M14 24 C30 18 70 18 86 24" fill="none"/><path d="M60 22 C78 14 104 16 108 24 C96 30 76 30 62 28 Z" fill="#ff623a"/><circle cx="50" cy="-3" r="5" fill="#ffd23f" stroke-width="3"/></g>`,
        crown: `<g ${W}><path d="M24 14 L22 -18 L37 -4 L50 -26 L63 -4 L78 -18 L76 14 Z" fill="#ffd23f"/><circle cx="50" cy="2" r="5" fill="#ff31cc" stroke-width="3"/><circle cx="33" cy="6" r="3.5" fill="#37afff" stroke-width="2.5"/><circle cx="67" cy="6" r="3.5" fill="#37afff" stroke-width="2.5"/></g>`,
        shades: `<g ${W}><path d="M20 32 H46 V40 C46 50 38 54 31 54 C24 54 20 48 20 40 Z M54 32 H80 V40 C80 50 76 54 69 54 C62 54 54 50 54 40 Z" fill="#1d0f38"/><path d="M46 36 H54" stroke-width="5"/><path d="M26 38 L32 36 M60 38 L66 36" stroke="#fff" stroke-width="3" stroke-linecap="round"/></g>`,
        goggles: `<g ${W}><path d="M10 40 H18 M82 40 H90" stroke-width="6"/><rect x="18" y="26" width="64" height="28" rx="12" fill="#bfe3ff" fill-opacity="0.75"/><path d="M50 26 V54" stroke-width="3"/><path d="M90 42 V-2 C90 -10 98 -10 98 -2" fill="none" stroke="#ff623a" stroke-width="7" stroke-linecap="round"/></g>`,
        bowtie: `<g ${W}><path d="M50 84 L30 72 L30 96 Z M50 84 L70 72 L70 96 Z" fill="#ff31cc"/><circle cx="50" cy="84" r="6" fill="#ff8fd8"/></g>`,
        scarf: `<g ${W}><path d="M16 66 Q50 92 84 66 L86 78 Q50 106 14 78 Z" fill="#37afff"/><path d="M58 90 L56 118 L70 116 L68 88 Z" fill="#37afff"/><path d="M22 74 Q50 96 78 74" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="6 6"/></g>`,
    }

    // the SVG for one outfit, layered neck, face, head so hats sit on top
    const accessories = (worn = {}) => ['neck', 'face', 'head'].map(slot => (worn[slot] ? ITEMS[worn[slot]] || '' : '')).join('')

    const svg = (worn = {}) => `
<svg class="mascot-art" viewBox="0 0 100 124" aria-hidden="true">
    <g class="m-body">
        <!-- one silhouette: all the ink first, then all the gold on top, so the outline
             runs unbroken around the loop and the stem with no seam where they meet -->
        <circle cx="50" cy="44" r="41.5" fill="${INK}" />
        <path d="${TAIL}" fill="none" stroke="${INK}" stroke-width="27" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="50" cy="44" r="38" fill="var(--m-fill)" />
        <path d="${TAIL}" fill="none" stroke="var(--m-fill)" stroke-width="20" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M20 30 Q24 16 38 11" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity="0.7" />
    </g>
    <g class="m-face" fill="${INK}" stroke="${INK}" stroke-linecap="round" stroke-linejoin="round">
        <g class="m-eyes-open" stroke="none">
            <ellipse cx="38" cy="40" rx="5" ry="7" /><ellipse cx="62" cy="40" rx="5" ry="7" />
            <circle cx="40" cy="37" r="1.8" fill="#fff" /><circle cx="64" cy="37" r="1.8" fill="#fff" />
        </g>
        <g class="m-eyes-blink" fill="none" stroke-width="4"><path d="M33 41 H43 M57 41 H67" /></g>
        <g class="m-eyes-wink"><ellipse cx="38" cy="40" rx="5" ry="7" stroke="none" /><circle cx="40" cy="37" r="1.8" fill="#fff" stroke="none" /><path d="M56 42 Q62 34 68 42" fill="none" stroke-width="4.5" /></g>
        <g class="m-eyes-dizzy" fill="none" stroke-width="3"><path d="M38 40 m-1 0 a1 1 0 1 1 2 0 a3 3 0 1 1 -5 -1 a5 5 0 1 1 9 2" /><path d="M62 40 m-1 0 a1 1 0 1 1 2 0 a3 3 0 1 1 -5 -1 a5 5 0 1 1 9 2" /></g>
        <g class="m-eyes-happy" fill="none" stroke-width="4.5"><path d="M32 43 Q38 33 44 43 M56 43 Q62 33 68 43" /></g>
        <g class="m-eyes-sad" fill="none" stroke-width="4.5"><path d="M32 38 Q38 46 44 38 M56 38 Q62 46 68 38" /></g>
        <g class="m-brows" fill="none" stroke-width="4"><path d="M31 29 L43 25 M57 25 L69 29" /></g>
        <g class="m-cheeks" fill="#ff8fd8" stroke="none" opacity="0.8"><circle cx="28" cy="53" r="5" /><circle cx="72" cy="53" r="5" /></g>
        <path class="m-mouth-smile" d="M42 56 Q50 63 58 56" fill="none" stroke-width="4" />
        <path class="m-mouth-big" d="M38 54 Q50 68 62 54" fill="none" stroke-width="4.5" />
        <path class="m-mouth-open" d="M38 53 Q50 52 62 53 Q60 70 50 70 Q40 70 38 53 Z" stroke-width="3" />
        <path class="m-mouth-wavy" d="M39 60 Q44 55 50 60 Q56 65 61 60" fill="none" stroke-width="4" />
        <path class="m-mouth-frown" d="M41 63 Q50 55 59 63" fill="none" stroke-width="4" />
    </g>
    <g class="m-acc">${accessories(worn)}</g>
</svg>`

    let els = []
    let worn = {}
    const solo = new Map() // per-element revert timers for emotes
    let revertTimer = null
    let blinkTimer = null

    function mount() {
        els = [...document.querySelectorAll('.mascot')]
        for (const el of els) {
            el.innerHTML = svg(worn)
            el.classList.toggle('has-hat', !!worn.head)
            el.dataset.mood = 'idle'
        }
        scheduleBlink()
    }

    // set a mood; transient moods fall back to idle, `hold` keeps it until the next change
    function mood(name, { hold = false, ms = 1400 } = {}) {
        clearTimeout(revertTimer)
        for (const el of els) {
            el.dataset.mood = name
            const motion = { happy: 'm-hop', cheer: 'm-cheer', sad: 'm-droop', worried: 'm-shiver' }[name]
            if (motion) {
                el.classList.remove(motion)
                void el.offsetWidth
                el.classList.add(motion)
            }
        }
        if (!hold && name !== 'idle') revertTimer = setTimeout(() => mood('idle'), ms)
    }

    // One mascot reacts on its own (a poke on the home screen): a face and a motion, then idle.
    // Kinds: love, spin, wink, boing, dizzy.
    function emote(el, kind) {
        const face = { love: 'happy', spin: 'cheer', wink: 'wink', boing: 'cheer', dizzy: 'dizzy' }[kind]
        const motion = { love: 'm-hop', spin: 'm-spin', wink: 'm-tilt', boing: 'm-boing', dizzy: 'm-wobble' }[kind]
        clearTimeout(solo.get(el))
        el.dataset.mood = face
        el.classList.remove('m-hop', 'm-spin', 'm-tilt', 'm-boing', 'm-wobble')
        void el.offsetWidth
        el.classList.add(motion)
        solo.set(el, setTimeout(() => { el.dataset.mood = 'idle' }, kind === 'dizzy' ? 1800 : 1200))
    }

    // Eyes follow a point on screen (the pointer): the open pupils shift a little towards it.
    // Only for mascots on screen; `null` recentres them.
    function look(x, y) {
        for (const el of els) {
            const eyes = el.querySelector('.m-eyes-open')
            if (!eyes) continue
            if (x === null || !el.offsetParent) {
                eyes.removeAttribute('transform')
                continue
            }
            const r = el.getBoundingClientRect()
            // the eyes sit at (50, 40) of Nine's 100 × 124 box
            const dx = x - (r.left + r.width * 0.5)
            const dy = y - (r.top + r.height * (40 / 124))
            const dist = Math.hypot(dx, dy) || 1
            const reach = 3.5 * Math.min(1, dist / 160) // up to 3.5 units, less when the point is close
            eyes.setAttribute('transform', `translate(${((dx / dist) * reach).toFixed(2)} ${((dy / dist) * reach).toFixed(2)})`)
        }
    }

    // a small hop without changing the face (each tile played)
    function hop() {
        for (const el of els) {
            el.classList.remove('m-hop')
            void el.offsetWidth
            el.classList.add('m-hop')
        }
    }

    // blink every few seconds, only with open eyes
    function scheduleBlink() {
        clearTimeout(blinkTimer)
        blinkTimer = setTimeout(() => {
            for (const el of els) if (['idle', 'worried'].includes(el.dataset.mood)) el.classList.add('m-blink')
            setTimeout(() => els.forEach(el => el.classList.remove('m-blink')), 140)
            scheduleBlink()
        }, 3000 + Math.random() * 3000)
    }

    const current = () => (els[0] ? els[0].dataset.mood : 'idle')

    // dress every mascot on the page
    function dress(outfit) {
        worn = outfit || {}
        for (const el of els) {
            el.classList.toggle('has-hat', !!worn.head) // CSS makes room above for the hat
            const g = el.querySelector('.m-acc')
            if (g) g.innerHTML = accessories(worn)
        }
    }

    // the SVG of Nine wearing just one item, for the wardrobe (its face follows the
    // container's data-mood like any other mascot)
    const preview = id => svg().replace('<g class="m-acc"></g>', `<g class="m-acc">${ITEMS[id] || ''}</g>`)

    return { mount, mood, hop, current, dress, preview, emote, look }
})()

// confetti from a point on screen; skipped when the player prefers reduced motion
function confetti(x, y, count = 28) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const colors = ['#ff623a', '#37afff', '#8746ff', '#ff31cc', '#ffd23f', '#ffffff']
    for (let i = 0; i < count; i++) {
        const bit = document.createElement('span')
        bit.className = 'confetti'
        const angle = Math.random() * Math.PI * 2
        const dist = 80 + Math.random() * 160
        bit.style.left = x + 'px'
        bit.style.top = y + 'px'
        bit.style.setProperty('--dx', `${Math.cos(angle) * dist}px`)
        bit.style.setProperty('--dy', `${Math.sin(angle) * dist - 60}px`)
        bit.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`)
        bit.style.background = colors[i % colors.length]
        bit.style.animationDuration = `${700 + Math.random() * 500}ms`
        if (i % 3 === 0) bit.style.borderRadius = '50%'
        document.body.appendChild(bit)
        bit.addEventListener('animationend', () => bit.remove())
    }
}

function confettiFrom(el, count) {
    const r = el.getBoundingClientRect()
    confetti(r.left + r.width / 2, r.top + r.height / 2, count)
}
