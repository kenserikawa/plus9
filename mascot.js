// Nine, the mascot: a gold "9" with a face in its loop. Inline SVG (not <use>) so CSS can
// switch its expression with data-mood. Moods: idle, happy, cheer, worried, sad.
// It only moves in answer to the player, plus an occasional blink.

const mascot = (() => {
    const INK = '#1d0f38'
    const TAIL = 'M80 54 C84 90 64 111 30 108'

    const svg = () => `
<svg class="mascot-art" viewBox="0 0 100 124" aria-hidden="true">
    <g class="m-body">
        <path d="${TAIL}" fill="none" stroke="${INK}" stroke-width="31" stroke-linecap="round" />
        <circle cx="50" cy="44" r="38" fill="var(--m-fill)" stroke="${INK}" stroke-width="6" />
        <path d="${TAIL}" fill="none" stroke="var(--m-fill)" stroke-width="19" stroke-linecap="round" />
        <path d="M20 30 Q24 16 38 11" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity="0.7" />
    </g>
    <g class="m-face" fill="${INK}" stroke="${INK}" stroke-linecap="round" stroke-linejoin="round">
        <g class="m-eyes-open" stroke="none">
            <ellipse cx="38" cy="40" rx="5" ry="7" /><ellipse cx="62" cy="40" rx="5" ry="7" />
            <circle cx="40" cy="37" r="1.8" fill="#fff" /><circle cx="64" cy="37" r="1.8" fill="#fff" />
        </g>
        <g class="m-eyes-blink" fill="none" stroke-width="4"><path d="M33 41 H43 M57 41 H67" /></g>
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
</svg>`

    let els = []
    let revertTimer = null
    let blinkTimer = null

    function mount() {
        els = [...document.querySelectorAll('.mascot')]
        for (const el of els) {
            el.innerHTML = svg()
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

    return { mount, mood, hop, current }
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
