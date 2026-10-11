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
            musicBus.gain.value = MUSIC_VOLUME
            soften = ctx.createBiquadFilter()
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

    function hiss({ dur = 0.3, vol = 0.25, at = 0, from = 600, to = 4000, attack = 0, dest = master } = {}) {
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
        src.loop = true // the buffer is one second; long washes loop it
        filter.type = 'bandpass'
        filter.Q.value = 1.5
        filter.frequency.setValueAtTime(from, t)
        filter.frequency.exponentialRampToValueAtTime(to, t + dur)
        if (attack) {
            gain.gain.setValueAtTime(0.0001, t)
            gain.gain.exponentialRampToValueAtTime(vol, t + attack)
        } else {
            gain.gain.setValueAtTime(vol, t)
        }
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
        src.connect(filter).connect(gain).connect(dest)
        src.start(t)
        src.stop(t + dur + 0.05)
    }

    // ---------- background music ----------
    // One loop per theme, all in C major / A minor so they sit with the effects. Each loop is
    // a `step(at, bar, pos, out, eighth)` function called for every eighth note, scheduled a
    // little ahead on the audio clock so it never drifts. Every start gets its own `session`
    // gain, so switching style fades the old loop out while its long tails die away unheard.

    let musicBus = null // master music level; duck() works on it
    let soften = null   // low-pass on the music bus, set per style
    let session = null  // the running loop's own fader
    let musicTimer = null
    let nextStep = 0    // audio time of the next eighth note
    let step = 0        // eighth notes since this loop started
    let style = 'grape'

    const midi = n => 440 * 2 ** ((n - 69) / 12)

    // a sustained voice with linear attack and release; optional detuned pair and slow vibrato
    function pad(freq, { type = 'sine', at = 0, dur = 2, vol = 0.04, attack = 0.5, release = 1, detune = 0, wobble = 0, dest }) {
        const t = ctx.currentTime + at
        const g = ctx.createGain()
        g.gain.setValueAtTime(0, t)
        g.gain.linearRampToValueAtTime(vol, t + attack)
        g.gain.setValueAtTime(vol, t + Math.max(attack, dur - release))
        g.gain.linearRampToValueAtTime(0, t + dur)
        g.connect(dest)
        let lfoGain = null
        if (wobble) {
            // a slow pitch drift, like a warped tape
            const lfo = ctx.createOscillator()
            lfo.frequency.value = 0.35 + Math.random() * 0.3
            lfoGain = ctx.createGain()
            lfoGain.gain.value = wobble
            lfo.connect(lfoGain)
            lfo.start(t)
            lfo.stop(t + dur + 0.05)
        }
        for (const d of detune ? [-detune, detune] : [0]) {
            const o = ctx.createOscillator()
            o.type = type
            o.frequency.value = freq
            o.detune.value = d
            if (lfoGain) lfoGain.connect(o.detune)
            o.connect(g)
            o.start(t)
            o.stop(t + dur + 0.05)
        }
    }

    // a soft kick: a sine that drops in pitch
    const kick = (at, vol, dest) => tone(120, { type: 'sine', dur: 0.28, vol, at, slide: 42, dest })

    const CHORDS = {
        C: [60, 64, 67], Am: [57, 60, 64], F: [53, 57, 60], G: [55, 59, 62], Em: [52, 55, 59], Dm: [50, 53, 57],
        Fmaj7: [53, 57, 60, 64], Em7: [52, 55, 59, 62], Dm7: [50, 53, 57, 60], Cmaj7: [48, 52, 55, 59],
        Cadd9: [48, 55, 62, 64], Am9: [45, 52, 59, 60], Fmaj9: [41, 48, 55, 57, 64], Gsus: [43, 50, 55, 62],
    }
    const chordAt = (parts, bar) => CHORDS[parts[Math.floor(bar / 4) % parts.length][bar % 4]]

    const STYLES = {
        // Grape: bright and bouncy. Pad, bass, a chiptune arpeggio that varies by bar, a light hat.
        grape: {
            bpm: 100, cutoff: 2600, level: 1,
            parts: [['C', 'Am', 'F', 'G'], ['Am', 'F', 'C', 'G']],
            arps: [[0, 1, 2, 4, 2, 1, 3, null], [0, 2, 4, 2, 5, 4, 2, 1], [3, null, 2, 1, 2, null, 4, 2], [0, 1, 2, 1, 3, 2, 4, 5]],
            step(at, bar, pos, out, e) {
                const chord = chordAt(this.parts, bar)
                if (pos === 0) for (const n of chord) tone(midi(n), { type: 'triangle', dur: e * 8, vol: 0.035, attack: 0.25, at, dest: out })
                if (pos === 0 || pos === 4) tone(midi(chord[0] - 24), { type: 'sine', dur: e * 3.5, vol: 0.16, attack: 0.01, at, dest: out })
                if (pos === 7) tone(midi(chord[2] - 24), { type: 'sine', dur: e * 0.9, vol: 0.09, at, dest: out })
                const idx = this.arps[(bar * 7 + Math.floor(bar / 4)) % this.arps.length][pos]
                if (idx !== null) {
                    const up = Math.floor(bar / 4) % 2 ? 12 : 0 // part B an octave higher
                    tone(midi(chord[idx % 3] + 12 * Math.floor(idx / 3) + up), { type: 'square', dur: e * 0.8, vol: 0.022, at, dest: out })
                }
                if (pos % 2 === 1) hiss({ dur: 0.05, vol: 0.05, at, from: 7000, to: 9000, dest: out })
            },
        },

        // Sunset: vaporwave. Slow, lush seventh chords on a warped detuned pad, electric-piano
        // stabs, round bass, a soft kick and a long, washy snare on 2 and 4.
        sunset: {
            bpm: 76, cutoff: 1800, level: 1,
            parts: [['Fmaj7', 'Em7', 'Dm7', 'Cmaj7']],
            step(at, bar, pos, out, e) {
                const chord = chordAt(this.parts, bar)
                if (pos === 0) for (const n of chord) pad(midi(n), { type: 'sawtooth', dur: e * 8.5, vol: 0.011, attack: 0.6, release: 0.8, detune: 14, wobble: 18, at, dest: out })
                // electric piano: chord stabs on 1, the "and" of 2 and 4
                if (pos === 0 || pos === 3 || pos === 6) {
                    for (const n of chord) {
                        tone(midi(n + 12), { type: 'sine', dur: e * 2.2, vol: 0.022, attack: 0.01, at, dest: out })
                        tone(midi(n + 24), { type: 'triangle', dur: e * 0.6, vol: 0.006, attack: 0.005, at, dest: out })
                    }
                }
                if (pos === 0 || pos === 5) tone(midi(chord[0] - 24), { type: 'sine', dur: e * 2.5, vol: 0.17, attack: 0.02, at, dest: out })
                if (pos === 0 || pos === 4) kick(at, 0.2, out)
                if (pos === 2 || pos === 6) hiss({ dur: 0.7, vol: 0.06, at, from: 1800, to: 700, dest: out })
                if (pos % 2 === 1) hiss({ dur: 0.04, vol: 0.025, at, from: 8000, to: 9000, dest: out })
            },
        },

        // Ocean: aquatic ambient. No drums: chord swells like tides, a low drone, a wash of
        // waves every two bars and bubbles rising at random.
        ocean: {
            bpm: 60, cutoff: 1500, level: 1.1,
            parts: [['Cadd9', 'Am9', 'Fmaj9', 'Gsus']],
            bubbles: [72, 74, 76, 79, 81, 84, 86, 88, 91],
            step(at, bar, pos, out, e) {
                const chord = chordAt(this.parts, bar)
                if (pos === 0) {
                    for (const n of chord) pad(midi(n), { type: 'sine', dur: e * 10, vol: 0.04, attack: 1.8, release: 2.2, wobble: 6, at, dest: out })
                    pad(midi(chord[chord.length - 1] + 12), { type: 'triangle', dur: e * 9, vol: 0.008, attack: 2.5, release: 2.5, detune: 8, at, dest: out })
                }
                if (pos === 0 && bar % 2 === 0) {
                    pad(midi(chord[0] - 12), { type: 'sine', dur: e * 16, vol: 0.06, attack: 3, release: 3, at, dest: out })
                    hiss({ dur: 7, vol: 0.05, attack: 2.8, at, from: 320, to: 1000, dest: out }) // a wave rolling in
                }
                // bubbles: short sine blips sliding up, a few per bar
                if (Math.random() < 0.3) {
                    const f = midi(this.bubbles[Math.floor(Math.random() * this.bubbles.length)])
                    tone(f, { type: 'sine', dur: 0.16, vol: 0.03, attack: 0.01, slide: f * 1.6, at: at + Math.random() * e * 0.5, dest: out })
                }
            },
        },

        // Night: inspiring and mysterious, in A minor. A low drone, a misty pad, a heartbeat
        // kick, a rising bell arpeggio and an answering melody in the second part.
        night: {
            bpm: 84, cutoff: 2400, level: 1,
            parts: [['Am', 'F', 'G', 'Em'], ['Dm', 'Am', 'F', 'G']],
            arp: [0, 1, 2, 3, 4, 5, 4, 2],
            melody: [76, null, 72, 74, 79, null, 76, 74, 72, null, 69, 72, 74, null, 76, null],
            step(at, bar, pos, out, e) {
                const chord = chordAt(this.parts, bar)
                if (pos === 0 && bar % 4 === 0) {
                    pad(midi(45), { type: 'sine', dur: e * 32, vol: 0.07, attack: 2, release: 3, at, dest: out })
                    pad(midi(52), { type: 'sine', dur: e * 32, vol: 0.025, attack: 3, release: 3, at, dest: out })
                }
                if (pos === 0) for (const n of chord) pad(midi(n), { type: 'triangle', dur: e * 8.5, vol: 0.02, attack: 0.7, release: 0.9, wobble: 5, at, dest: out })
                // bells: a rising arpeggio across two octaves, with a faint high harmonic
                const i = this.arp[pos]
                const n = chord[i % 3] + 12 * Math.floor(i / 3) + 12
                tone(midi(n), { type: 'sine', dur: e * 3, vol: 0.026, attack: 0.005, at, dest: out })
                tone(midi(n) * 3, { type: 'sine', dur: e * 0.8, vol: 0.006, attack: 0.005, at, dest: out })
                if (pos === 0 || pos === 3) kick(at, 0.16, out)
                // the answering melody, only in part B
                if (Math.floor(bar / 4) % 2 === 1 && pos % 2 === 0) {
                    const m = this.melody[((bar % 4) * 4 + pos / 2) % this.melody.length]
                    // an octave below the written notes, under the bells
                    if (m) pad(midi(m - 12), { type: 'triangle', dur: e * 3, vol: 0.034, attack: 0.08, release: 1.2, wobble: 3, at, dest: out })
                }
            },
        },

        // Candy: a bouncy music box. Twinkling bell arpeggios, pizzicato bass, shaker and claps.
        candy: {
            bpm: 112, cutoff: 3400, level: 0.95,
            parts: [['C', 'F', 'G', 'C'], ['Am', 'F', 'G', 'C']],
            arp: [0, 2, 1, 2, 3, 2, 4, 2],
            step(at, bar, pos, out, e) {
                const chord = chordAt(this.parts, bar)
                const i = this.arp[pos]
                const n = chord[i % 3] + 12 * Math.floor(i / 3) + 12
                tone(midi(n), { type: 'sine', dur: e * 1.6, vol: 0.03, attack: 0.004, at, dest: out })
                tone(midi(n) * 4, { type: 'sine', dur: e * 0.3, vol: 0.004, attack: 0.002, at, dest: out })
                if (pos % 2 === 0) tone(midi(chord[pos % 4 === 0 ? 0 : 2] - 12), { type: 'triangle', dur: e * 0.6, vol: 0.09, attack: 0.004, at, dest: out })
                hiss({ dur: 0.04, vol: 0.018, at, from: 6000, to: 7000, dest: out })
                if (pos === 2 || pos === 6) hiss({ dur: 0.12, vol: 0.05, at, from: 1400, to: 2600, dest: out })
            },
        },

        // Forest: a wooden walk. A breathy flute melody, marimba, woodblocks and a soft bass.
        forest: {
            bpm: 88, cutoff: 2300, level: 1,
            parts: [['Am', 'C', 'G', 'F'], ['F', 'C', 'G', 'Am']],
            melody: [69, 72, 76, 74, 72, 74, 71, 67, 65, 69, 72, 69, 69, null, 64, 67],
            step(at, bar, pos, out, e) {
                const chord = chordAt(this.parts, bar)
                if (pos === 0) tone(midi(chord[0] - 24), { type: 'sine', dur: e * 6, vol: 0.13, attack: 0.03, at, dest: out })
                // marimba on the off-beats
                if (pos % 2 === 1) tone(midi(chord[(pos >> 1) % 3]), { type: 'sine', dur: e * 1.1, vol: 0.05, attack: 0.003, at, dest: out })
                // flute: two eighths per note, with breathy vibrato
                if (pos % 2 === 0) {
                    const m = this.melody[((bar % 4) * 4 + pos / 2) % this.melody.length]
                    if (m) pad(midi(m), { type: 'triangle', dur: e * 1.9, vol: 0.035, attack: 0.06, release: 0.3, wobble: 14, at, dest: out })
                }
                // woodblocks
                if (pos === 0 || pos === 3 || pos === 6) tone(1150, { type: 'sine', dur: 0.05, vol: 0.06, attack: 0.002, at, dest: out })
                if (pos === 4) tone(760, { type: 'sine', dur: 0.06, vol: 0.06, attack: 0.002, at, dest: out })
            },
        },

        // Space: slow and wide. A sub bass, a shimmering pad, an arpeggio with echoes and
        // distant star pings.
        space: {
            bpm: 70, cutoff: 2100, level: 1,
            parts: [['Fmaj7', 'Cmaj7', 'Am9', 'Gsus']],
            arp: [0, 1, 2, 3, 2, 1, 3, 2],
            step(at, bar, pos, out, e) {
                const chord = chordAt(this.parts, bar)
                if (pos === 0) {
                    pad(midi(chord[0] - 12), { type: 'sine', dur: e * 8.5, vol: 0.09, attack: 0.6, release: 1.2, at, dest: out })
                    for (const n of chord) pad(midi(n + 12), { type: 'sawtooth', dur: e * 9, vol: 0.006, attack: 1.4, release: 1.6, detune: 20, wobble: 8, at, dest: out })
                }
                // the arpeggio and two fading echoes
                const n = chord[this.arp[pos] % chord.length] + 12
                for (const [delay, vol] of [[0, 0.024], [1.5, 0.012], [3, 0.006]]) {
                    tone(midi(n), { type: 'square', dur: e * 0.7, vol, attack: 0.004, at: at + delay * e, dest: out })
                }
                if (Math.random() < 0.12) tone(midi(88 + 2 * Math.floor(Math.random() * 4)), { type: 'sine', dur: 0.9, vol: 0.015, attack: 0.01, at, dest: out })
            },
        },

        // Neon: synthwave. A pumping octave bass, a wide saw pad, punchy kick and snare, a lead.
        neon: {
            bpm: 108, cutoff: 3000, level: 0.9,
            parts: [['Am', 'F', 'C', 'G']],
            lead: [0, 2, 1, 2, 3, 2, 1, 4],
            step(at, bar, pos, out, e) {
                const chord = chordAt(this.parts, bar)
                if (pos === 0) for (const n of chord) pad(midi(n), { type: 'sawtooth', dur: e * 8, vol: 0.009, attack: 0.15, release: 0.6, detune: 10, at, dest: out })
                tone(midi(chord[0] - (pos % 2 ? 12 : 24)), { type: 'sawtooth', dur: e * 0.85, vol: 0.045, attack: 0.005, at, dest: out })
                if (pos === 0 || pos === 4) kick(at, 0.24, out)
                if (pos === 2 || pos === 6) {
                    hiss({ dur: 0.32, vol: 0.09, at, from: 2200, to: 1200, dest: out })
                    tone(190, { type: 'triangle', dur: 0.1, vol: 0.06, at, dest: out })
                }
                hiss({ dur: 0.03, vol: 0.025, at, from: 8000, to: 9500, dest: out })
                const i = this.lead[pos]
                tone(midi(chord[i % 3] + 12 * Math.floor(i / 3) + 12), { type: 'square', dur: e * 0.7, vol: 0.016, attack: 0.004, at, dest: out })
            },
        },
    }

    function musicTick() {
        if (!ctx || ctx.state !== 'running' || !session) return
        const st = STYLES[style]
        const eighth = 60 / st.bpm / 2
        // after a pause (ad, hidden tab) pick up from now instead of rushing to catch up
        if (nextStep < ctx.currentTime) nextStep = ctx.currentTime + 0.05
        while (nextStep < ctx.currentTime + 0.25) {
            st.step(Math.max(0, nextStep - ctx.currentTime), Math.floor(step / 8), step % 8, session, eighth)
            nextStep += eighth
            step++
        }
    }

    function startMusic() {
        if (musicTimer || muted || !musicOn || !audio()) return
        const t = ctx.currentTime
        step = 0
        nextStep = t + 0.1
        soften.frequency.setTargetAtTime(STYLES[style].cutoff, t, 0.3)
        session = ctx.createGain()
        session.gain.setValueAtTime(0, t)
        session.gain.linearRampToValueAtTime(STYLES[style].level, t + 1.5) // fade in
        session.connect(musicBus)
        musicTimer = setInterval(musicTick, 50)
        musicTick()
    }

    function stopMusic() {
        if (!musicTimer) return
        clearInterval(musicTimer)
        musicTimer = null
        const old = session
        session = null
        if (!ctx || !old) return
        const t = ctx.currentTime
        old.gain.cancelScheduledValues(t)
        old.gain.setValueAtTime(old.gain.value, t)
        old.gain.linearRampToValueAtTime(0, t + 0.6) // fade out; scheduled tails die away unheard
        setTimeout(() => old.disconnect(), 10000)
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
        // each theme has its own loop; switching restarts the music with the new one
        setStyle(id) {
            if (!(id in STYLES) || id === style) return
            style = id
            if (musicTimer) {
                stopMusic()
                startMusic()
            }
        },
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
