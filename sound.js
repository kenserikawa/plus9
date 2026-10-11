// Synthesised sound effects (Web Audio, no asset files).
// Everything is tuned to a C major pentatonic scale so effects sound good together.

const sfx = (() => {
    const MUTE_KEY = 'plus9.muted'
    const SCALE = [0, 2, 4, 7, 9] // pentatonic steps in semitones
    const BASE = 523.25            // C5

    let ctx = null
    let master = null
    let noise = null
    let muted = false
    try { muted = localStorage.getItem(MUTE_KEY) === '1' } catch { /* storage unavailable */ }

    // browsers only allow audio after a user gesture, so the context is created lazily
    function audio() {
        if (!ctx) {
            const AC = window.AudioContext || window.webkitAudioContext
            if (!AC) return null
            ctx = new AC()
            const comp = ctx.createDynamicsCompressor()
            comp.connect(ctx.destination)
            master = ctx.createGain()
            master.gain.value = 0.5
            master.connect(comp)
        }
        if (ctx.state === 'suspended') ctx.resume()
        return ctx
    }

    // frequency of the nth note of the pentatonic scale above BASE
    function note(n) {
        n = Math.round(n)
        return BASE * 2 ** ((Math.floor(n / 5) * 12 + SCALE[((n % 5) + 5) % 5]) / 12)
    }

    function tone(freq, { type = 'triangle', dur = 0.15, vol = 0.3, at = 0, attack = 0.005, slide = null } = {}) {
        const t = ctx.currentTime + at
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = type
        osc.frequency.setValueAtTime(freq, t)
        if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + dur)
        gain.gain.setValueAtTime(0.0001, t)
        gain.gain.exponentialRampToValueAtTime(vol, t + attack)
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
        osc.connect(gain).connect(master)
        osc.start(t)
        osc.stop(t + dur + 0.05)
    }

    function hiss({ dur = 0.3, vol = 0.25, at = 0, from = 600, to = 4000 } = {}) {
        if (!noise) {
            noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
            const data = noise.getChannelData(0)
            for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
        }
        const t = ctx.currentTime + at
        const src = ctx.createBufferSource()
        const filter = ctx.createBiquadFilter()
        const gain = ctx.createGain()
        src.buffer = noise
        filter.type = 'bandpass'
        filter.Q.value = 1.5
        filter.frequency.setValueAtTime(from, t)
        filter.frequency.exponentialRampToValueAtTime(to, t + dur)
        gain.gain.setValueAtTime(vol, t)
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
        src.connect(filter).connect(gain).connect(master)
        src.start(t)
        src.stop(t + dur + 0.05)
    }

    // short vibrations on phones that support it; muting the game silences them too
    function buzz(pattern) {
        try { if (navigator.vibrate) navigator.vibrate(pattern) } catch { /* not allowed here */ }
    }

    // wrap each effect so it is a no-op while muted or without Web Audio
    const effect = fn => (...args) => { if (!muted && audio()) fn(...args) }

    return {
        get muted() { return muted },
        setMuted(value) {
            muted = value
            try { localStorage.setItem(MUTE_KEY, value ? '1' : '0') } catch { /* storage unavailable */ }
        },
        unlock() { if (!muted) audio() },
        // silence everything while the page is hidden (tab switch, app in background)
        suspend() { if (ctx && ctx.state === 'running') ctx.suspend() },
        resume() { if (ctx && !muted && ctx.state === 'suspended') ctx.resume() },

        // tile lifted for dragging
        lift: effect(() => tone(note(7), { type: 'sine', dur: 0.08, vol: 0.15, slide: note(9) })),

        // tile dropped in; pitch climbs as the sum approaches the target (progress 0..1)
        add: effect(progress => {
            const n = Math.round(progress * 9)
            tone(note(n), { type: 'triangle', dur: 0.16, vol: 0.35 })
            tone(note(n) * 2, { type: 'sine', dur: 0.06, vol: 0.12 })
            buzz(8)
        }),

        // target reached; longer chains get a longer arpeggio
        complete: effect(chain => {
            const steps = Math.min(3 + chain, 9)
            for (let i = 0; i < steps; i++) tone(note(5 + i), { type: 'triangle', dur: 0.22, vol: 0.28, at: i * 0.055 })
            tone(note(5 + steps) * 2, { type: 'sine', dur: 0.5, vol: 0.12, at: steps * 0.055 })
            buzz([15, 40, 25])
        }),

        levelUp: effect(() => {
            ;[0, 2, 4, 5].forEach((n, i) => tone(note(10 + n), { type: 'square', dur: 0.18, vol: 0.12, at: 0.35 + i * 0.1 }))
            tone(note(15), { type: 'triangle', dur: 0.7, vol: 0.3, at: 0.75 })
            hiss({ dur: 0.6, vol: 0.08, at: 0.75, from: 3000, to: 9000 })
            buzz([20, 30, 20, 30, 40])
        }),

        // went over the target
        overshoot: effect(() => {
            tone(220, { type: 'sawtooth', dur: 0.45, vol: 0.18, slide: 90 })
            tone(233, { type: 'sawtooth', dur: 0.45, vol: 0.12, slide: 95 })
            buzz([60, 40, 60])
        }),

        stuck: effect(() => {
            tone(note(-5), { type: 'square', dur: 0.12, vol: 0.12 })
            tone(note(-7), { type: 'square', dur: 0.2, vol: 0.12, at: 0.14 })
        }),

        shuffle: effect(paid => {
            hiss({ dur: 0.35, vol: 0.3 })
            for (let i = 0; i < 6; i++) tone(1800 + Math.random() * 1600, { type: 'square', dur: 0.02, vol: 0.05, at: 0.03 + i * 0.045 })
            if (paid) {
                // coin: two quick bright notes
                tone(988, { type: 'square', dur: 0.08, vol: 0.12, at: 0.05 })
                tone(1319, { type: 'square', dur: 0.3, vol: 0.12, at: 0.12 })
            }
        }),

        // banked: a cascade of coins
        bank: effect(() => {
            for (let i = 0; i < 6; i++) {
                tone(988 + i * 60, { type: 'square', dur: 0.07, vol: 0.1, at: i * 0.08 })
                tone(1319 + i * 60, { type: 'square', dur: 0.18, vol: 0.1, at: i * 0.08 + 0.05 })
            }
            tone(note(12), { type: 'triangle', dur: 0.6, vol: 0.25, at: 0.55 })
        }),

        tick: effect(last => tone(last ? 1320 : 880, { type: 'sine', dur: 0.05, vol: 0.18 })),

        gameOver: effect(() => {
            ;[392, 370, 349].forEach((f, i) => tone(f, { type: 'triangle', dur: 0.32, vol: 0.25, at: 0.3 + i * 0.3 }))
            tone(330, { type: 'triangle', dur: 0.9, vol: 0.25, at: 1.2, slide: 300 })
        }),

        ui: effect(() => tone(note(4), { type: 'sine', dur: 0.06, vol: 0.12 })),
    }
})()
