// Synthesised sound effects and background music (Web Audio, no asset files).
// Everything is in C major (effects on its pentatonic scale) so effects and music fit together.

const sfx = (() => {
    const MUTE_KEY = 'plus9.muted'
    const MUSIC_KEY = 'plus9.music'
    const MUSIC_VOLUME = 0.55 // music bus level relative to the effects
    const SCALE = [0, 2, 4, 7, 9] // pentatonic steps in semitones
    const BASE = 523.25            // C5

    let ctx = null
    let master = null
    let noise = null
    let muted = false
    let musicOn = true
    try {
        muted = localStorage.getItem(MUTE_KEY) === '1'
        musicOn = localStorage.getItem(MUSIC_KEY) !== '0'
    } catch { /* storage unavailable */ }

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
            // the music runs through its own soft low-pass bus so it sits under the effects
            musicBus = ctx.createGain()
            musicBus.gain.value = 0
            const soften = ctx.createBiquadFilter()
            soften.type = 'lowpass'
            soften.frequency.value = 2600
            musicBus.connect(soften).connect(master)
        }
        if (ctx.state === 'suspended') ctx.resume()
        return ctx
    }

    // frequency of the nth note of the pentatonic scale above BASE
    function note(n) {
        n = Math.round(n)
        return BASE * 2 ** ((Math.floor(n / 5) * 12 + SCALE[((n % 5) + 5) % 5]) / 12)
    }

    function tone(freq, { type = 'triangle', dur = 0.15, vol = 0.3, at = 0, attack = 0.005, slide = null, dest = master } = {}) {
        const t = ctx.currentTime + at
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = type
        osc.frequency.setValueAtTime(freq, t)
        if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + dur)
        gain.gain.setValueAtTime(0.0001, t)
        gain.gain.exponentialRampToValueAtTime(vol, t + attack)
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
        osc.connect(gain).connect(dest)
        osc.start(t)
        osc.stop(t + dur + 0.05)
    }

    function hiss({ dur = 0.3, vol = 0.25, at = 0, from = 600, to = 4000, dest = master } = {}) {
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
        src.connect(filter).connect(gain).connect(dest)
        src.start(t)
        src.stop(t + dur + 0.05)
    }

    // ---------- background music ----------
    // A two-part loop at 100 bpm, scheduled a little ahead with the audio clock so it never
    // drifts. Part A: C Am F G, part B: Am F C G; each lasts 4 bars and they alternate.
    // Layers: a soft pad, a bass, a plucked arpeggio that varies from bar to bar, a light hat.

    let musicBus = null
    let musicTimer = null
    let nextStep = 0 // audio time of the next eighth note
    let step = 0     // eighth notes since the music started

    const BPM = 100
    const EIGHTH = 60 / BPM / 2
    const midi = n => 440 * 2 ** ((n - 69) / 12)
    const CHORDS = { C: [60, 64, 67], Am: [57, 60, 64], F: [53, 57, 60], G: [55, 59, 62] }
    const PARTS = [['C', 'Am', 'F', 'G'], ['Am', 'F', 'C', 'G']]
    // which chord tone (0-2, +3 = an octave up) the arpeggio plays on each eighth; null = rest
    const ARPS = [
        [0, 1, 2, 4, 2, 1, 3, null],
        [0, 2, 4, 2, 5, 4, 2, 1],
        [3, null, 2, 1, 2, null, 4, 2],
        [0, 1, 2, 1, 3, 2, 4, 5],
    ]

    function scheduleStep(when) {
        const bar = Math.floor(step / 8)
        const pos = step % 8
        const part = PARTS[Math.floor(bar / 4) % 2]
        const chord = CHORDS[part[bar % 4]]
        const at = Math.max(0, when - ctx.currentTime)
        const bus = musicBus

        if (pos === 0) {
            // pad: the chord, held for the bar, gentle attack
            for (const n of chord) tone(midi(n), { type: 'triangle', dur: EIGHTH * 8, vol: 0.035, attack: 0.25, at, dest: bus })
        }
        // bass on beats 1 and 3, a pickup on the last eighth
        if (pos === 0 || pos === 4) tone(midi(chord[0] - 24), { type: 'sine', dur: EIGHTH * 3.5, vol: 0.16, attack: 0.01, at, dest: bus })
        if (pos === 7) tone(midi(chord[2] - 24), { type: 'sine', dur: EIGHTH * 0.9, vol: 0.09, at, dest: bus })

        // arpeggio: pattern changes every bar; part B sits an octave higher
        const idx = ARPS[(bar * 7 + Math.floor(bar / 4)) % ARPS.length][pos]
        if (idx !== null) {
            const n = chord[idx % 3] + 12 * Math.floor(idx / 3) + (part === PARTS[1] ? 12 : 0)
            tone(midi(n), { type: 'square', dur: EIGHTH * 0.8, vol: 0.022, at, dest: bus })
        }

        // a light hat on the off-beats
        if (pos % 2 === 1) hiss({ dur: 0.05, vol: 0.05, at, from: 7000, to: 9000, dest: bus })
    }

    function musicTick() {
        if (!ctx || ctx.state !== 'running') return
        // after a pause (ad, hidden tab) pick up from now instead of rushing to catch up
        if (nextStep < ctx.currentTime) nextStep = ctx.currentTime + 0.05
        while (nextStep < ctx.currentTime + 0.2) {
            scheduleStep(nextStep)
            nextStep += EIGHTH
            step++
        }
    }

    function startMusic() {
        if (musicTimer || muted || !musicOn || !audio()) return
        step = 0
        nextStep = ctx.currentTime + 0.1
        musicBus.gain.cancelScheduledValues(ctx.currentTime)
        musicBus.gain.setValueAtTime(0, ctx.currentTime)
        musicBus.gain.linearRampToValueAtTime(MUSIC_VOLUME, ctx.currentTime + 1.5) // fade in
        musicTimer = setInterval(musicTick, 50)
        musicTick()
    }

    function stopMusic() {
        if (!musicTimer) return
        clearInterval(musicTimer)
        musicTimer = null
        if (ctx) {
            musicBus.gain.cancelScheduledValues(ctx.currentTime)
            musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.15) // short fade out
        }
    }

    // lower the music for a moment so a fanfare comes through
    function duck(seconds) {
        if (!musicTimer || !ctx) return
        const t = ctx.currentTime
        musicBus.gain.cancelScheduledValues(t)
        musicBus.gain.setTargetAtTime(MUSIC_VOLUME * 0.25, t, 0.05)
        musicBus.gain.setTargetAtTime(MUSIC_VOLUME, t + seconds, 0.4)
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
            if (muted) stopMusic()
            else startMusic()
        },
        get musicOn() { return musicOn },
        setMusic(value) {
            musicOn = value
            try { localStorage.setItem(MUSIC_KEY, value ? '1' : '0') } catch { /* storage unavailable */ }
            if (musicOn) startMusic()
            else stopMusic()
        },
        // first user gesture: audio may start now, music included
        unlock() {
            if (muted) return
            audio()
            startMusic()
        },
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
            duck(1.6)
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
            duck(1.2)
            for (let i = 0; i < 6; i++) {
                tone(988 + i * 60, { type: 'square', dur: 0.07, vol: 0.1, at: i * 0.08 })
                tone(1319 + i * 60, { type: 'square', dur: 0.18, vol: 0.1, at: i * 0.08 + 0.05 })
            }
            tone(note(12), { type: 'triangle', dur: 0.6, vol: 0.25, at: 0.55 })
        }),

        tick: effect(last => tone(last ? 1320 : 880, { type: 'sine', dur: 0.05, vol: 0.18 })),

        gameOver: effect(() => {
            duck(2.4)
            ;[392, 370, 349].forEach((f, i) => tone(f, { type: 'triangle', dur: 0.32, vol: 0.25, at: 0.3 + i * 0.3 }))
            tone(330, { type: 'triangle', dur: 0.9, vol: 0.25, at: 1.2, slide: 300 })
        }),

        ui: effect(() => tone(note(4), { type: 'sine', dur: 0.06, vol: 0.12 })),
    }
})()
