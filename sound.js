// Synthesised sound effects and background music (Web Audio, no asset files).
// Everything is in C major (effects on its pentatonic scale) so effects and music fit together.

const sfx = (() => {
    const MUTE_KEY = 'plus9.muted' // old save: one switch for everything
    const EFFECTS_KEY = 'plus9.effects'
    const MUSIC_KEY = 'plus9.music'
    const MUSIC_VOLUME = 0.55 // music bus level relative to the effects
    const SCALE = [0, 2, 4, 7, 9] // pentatonic steps in semitones
    const BASE = 523.25            // C5

    let ctx = null
    let master = null
    let noise = null
    // effects and music switch on and off separately; "muted" is both off
    let effectsOn = true
    let musicOn = true
    try {
        const oldMute = localStorage.getItem(MUTE_KEY) === '1'
        const effects = localStorage.getItem(EFFECTS_KEY)
        effectsOn = effects === null ? !oldMute : effects !== '0'
        musicOn = localStorage.getItem(MUSIC_KEY) !== '0' && !(effects === null && oldMute)
    } catch { /* storage unavailable */ }
    const silent = () => !effectsOn && !musicOn

    function saveSwitches() {
        try {
            localStorage.setItem(EFFECTS_KEY, effectsOn ? '1' : '0')
            localStorage.setItem(MUSIC_KEY, musicOn ? '1' : '0')
            localStorage.removeItem(MUTE_KEY)
        } catch { /* storage unavailable */ }
    }

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
        G7: [55, 59, 62, 65], Am7: [57, 60, 64, 67],
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

        // Chrome: robotic synth-pop. Clipped square arpeggios, a dry octave bass, kick and a
        // metallic clap.
        chrome: {
            bpm: 112, cutoff: 3200, level: 0.9,
            parts: [['Am', 'F', 'C', 'G'], ['F', 'G', 'Em', 'Am']],
            arp: [0, 2, 1, 3, 0, 2, 4, 2],
            step(at, bar, pos, out, e) {
                const chord = chordAt(this.parts, bar)
                const i = this.arp[pos]
                tone(midi(chord[i % 3] + 12 * Math.floor(i / 3) + 12), { type: 'square', dur: e * 0.45, vol: 0.02, attack: 0.002, at, dest: out })
                if (pos % 2 === 0) tone(midi(chord[0] - (pos % 4 ? 12 : 24)), { type: 'square', dur: e * 0.5, vol: 0.045, attack: 0.003, at, dest: out })
                if (pos === 0 || pos === 4) kick(at, 0.2, out)
                if (pos === 2 || pos === 6) {
                    hiss({ dur: 0.08, vol: 0.06, at, from: 2600, to: 3400, dest: out })
                    tone(1800, { type: 'square', dur: 0.03, vol: 0.025, at, dest: out })
                }
                hiss({ dur: 0.02, vol: 0.025, at, from: 9000, to: 10000, dest: out })
            },
        },

        // Gears: a clockwork music box. Bell notes with a lilt, a tick-tock woodblock clock and a
        // soft low bass.
        gears: {
            bpm: 96, cutoff: 2800, level: 1,
            parts: [['C', 'G', 'Am', 'F'], ['F', 'C', 'Dm', 'G']],
            melody: [0, 2, 4, 2, 3, 2, 1, null],
            step(at, bar, pos, out, e) {
                const chord = chordAt(this.parts, bar)
                const swing = pos % 2 ? e * 0.18 : 0 // late off-beats
                const i = this.melody[pos]
                if (i !== null) {
                    const n = chord[i % 3] + 12 * Math.floor(i / 3) + 12
                    tone(midi(n), { type: 'sine', dur: e * 1.4, vol: 0.032, attack: 0.003, at: at + swing, dest: out })
                    tone(midi(n) * 3, { type: 'sine', dur: e * 0.25, vol: 0.005, attack: 0.002, at: at + swing, dest: out })
                }
                if (pos === 0) tone(midi(chord[0] - 24), { type: 'sine', dur: e * 3, vol: 0.11, attack: 0.02, at, dest: out })
                if (pos % 2 === 0) tone(2100, { type: 'sine', dur: 0.025, vol: 0.05, attack: 0.001, at, dest: out })
                else tone(1400, { type: 'sine', dur: 0.025, vol: 0.035, attack: 0.001, at: at + swing, dest: out })
            },
        },

        // Lo-fi: a dusty evening. Electric-piano seventh chords, a soft swung beat and a quiet
        // vinyl crackle.
        lofi: {
            bpm: 78, cutoff: 1900, level: 1,
            parts: [['Fmaj7', 'Em7', 'Dm7', 'Cmaj7']],
            step(at, bar, pos, out, e) {
                const chord = chordAt(this.parts, bar)
                const swing = pos % 2 ? e * 0.22 : 0
                if (pos === 0 || pos === 5) for (const n of chord) tone(midi(n), { type: 'sine', dur: e * (pos ? 2.5 : 4.5), vol: 0.03, attack: 0.02, at: at + swing, dest: out })
                if (pos === 0 || pos === 3) tone(midi(chord[0] - 24), { type: 'sine', dur: e * 2, vol: 0.12, attack: 0.02, at: at + swing, dest: out })
                if (pos === 0 || pos === 5) kick(at + swing, 0.16, out)
                if (pos === 2 || pos === 6) hiss({ dur: 0.09, vol: 0.045, at, from: 1800, to: 2600, dest: out })
                if (pos % 2 === 1) hiss({ dur: 0.03, vol: 0.015, at: at + swing, from: 7000, to: 8000, dest: out })
                if (Math.random() < 0.35) hiss({ dur: 0.01, vol: 0.012, at: at + Math.random() * e, from: 3000, to: 6000, dest: out }) // vinyl crackle
            },
        },

        // Jazz: a late club. A walking bass on every beat, a swinging ride cymbal, and piano
        // comping a ii-V-I.
        jazz: {
            bpm: 120, cutoff: 2600, level: 1,
            parts: [['Dm7', 'G7', 'Cmaj7', 'Am7']],
            walk: [0, 1, 2, 1], // chord tones, one per beat
            step(at, bar, pos, out, e) {
                const chord = chordAt(this.parts, bar)
                const swing = pos % 2 ? e * 0.33 : 0 // triplet feel
                if (pos % 2 === 0) tone(midi(chord[this.walk[pos / 2]] - 12), { type: 'triangle', dur: e * 1.8, vol: 0.11, attack: 0.01, at, dest: out })
                if (pos % 2 === 0 || pos === 3 || pos === 7) hiss({ dur: 0.12, vol: 0.03, at: at + swing, from: 6000, to: 9000, dest: out })
                if (pos === 1 || pos === 4) for (const n of chord) tone(midi(n + 12), { type: 'triangle', dur: e * 0.9, vol: 0.022, attack: 0.005, at: at + swing, dest: out })
            },
        },

        // Arcade: fast chiptune. A square-wave lead, a triangle bass jumping octaves and noise drums.
        arcade: {
            bpm: 144, cutoff: 4200, level: 0.85,
            parts: [['Am', 'F', 'C', 'G'], ['Am', 'G', 'F', 'G']],
            lead: [4, 2, 0, 2, 4, 4, 4, null],
            step(at, bar, pos, out, e) {
                const chord = chordAt(this.parts, bar)
                tone(midi(chord[0] - (pos % 2 ? 12 : 24)), { type: 'triangle', dur: e * 0.8, vol: 0.09, attack: 0.002, at, dest: out })
                const i = this.lead[(pos + bar) % 8]
                if (i !== null) tone(midi(chord[i % 3] + 12 * Math.floor(i / 3) + 12), { type: 'square', dur: e * 0.6, vol: 0.02, attack: 0.002, at, dest: out })
                if (pos === 0 || pos === 4) hiss({ dur: 0.05, vol: 0.08, at, from: 200, to: 900, dest: out })
                if (pos === 2 || pos === 6) hiss({ dur: 0.08, vol: 0.07, at, from: 2500, to: 5000, dest: out })
                hiss({ dur: 0.015, vol: 0.02, at, from: 9000, to: 11000, dest: out })
            },
        },

        // Fiesta: a Latin party. A 3-2 clave, congas, a montuno piano and bright brass stabs.
        fiesta: {
            bpm: 108, cutoff: 3600, level: 0.95,
            parts: [['C', 'F', 'G', 'C'], ['Am', 'Dm', 'G', 'C']],
            clave: [[0, 3, 6], [2, 4]], // the 3 side, then the 2 side
            montuno: [0, 2, 1, 2, 0, 2, 1, 2],
            step(at, bar, pos, out, e) {
                const chord = chordAt(this.parts, bar)
                if (this.clave[bar % 2].includes(pos)) tone(2500, { type: 'sine', dur: 0.04, vol: 0.06, attack: 0.001, at, dest: out })
                if (pos === 3 || pos === 7) tone(190, { type: 'sine', dur: 0.12, vol: 0.09, attack: 0.002, at, dest: out })
                if (pos === 2 || pos === 6) tone(330, { type: 'sine', dur: 0.06, vol: 0.06, attack: 0.002, at, dest: out })
                tone(midi(chord[this.montuno[pos]] + 12), { type: 'triangle', dur: e * 0.6, vol: 0.025, attack: 0.003, at, dest: out })
                if (pos === 0 || pos === 4) tone(midi(chord[0] - 24), { type: 'sine', dur: e * 2.5, vol: 0.12, attack: 0.01, at, dest: out })
                if (pos === 6 || pos === 7) for (const m of chord) tone(midi(m + 12), { type: 'sawtooth', dur: e * 0.45, vol: 0.008, attack: 0.01, at, dest: out })
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
        if (musicTimer || !musicOn || !audio()) return
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

    // wrap each effect so it is a no-op with effects off or without Web Audio
    const effect = fn => (...args) => { if (effectsOn && audio()) fn(...args) }

    return {
        // the speaker button: everything off, or everything back on
        get muted() { return silent() },
        setMuted(value) {
            this.setEffects(!value)
            this.setMusic(!value)
        },
        get effectsOn() { return effectsOn },
        setEffects(value) {
            effectsOn = value
            saveSwitches()
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
            saveSwitches()
            if (musicOn) startMusic()
            else stopMusic()
        },
        // first user gesture: audio may start now, music included
        unlock() {
            if (silent()) return
            audio()
            startMusic()
        },
        // silence everything while the page is hidden (tab switch, app in background)
        suspend() { if (ctx && ctx.state === 'running') ctx.suspend() },
        resume() { if (ctx && !silent() && ctx.state === 'suspended') ctx.resume() },

        // tile lifted for dragging
        lift: effect(() => tone(note(7), { type: 'sine', dur: 0.08, vol: 0.15, slide: note(9) })),

        // tile dropped in; pitch climbs as the sum approaches the target (progress 0..1)
        add: effect(progress => {
            const n = Math.round(progress * 9)
            tone(note(n), { type: 'triangle', dur: 0.16, vol: 0.35 })
            tone(note(n) * 2, { type: 'sine', dur: 0.06, vol: 0.12 })
            buzz(8)
        }),

        // a minus tile takes from the sum: a short falling step
        minus: effect(() => {
            tone(note(6), { type: 'triangle', dur: 0.1, vol: 0.25 })
            tone(note(4), { type: 'triangle', dur: 0.14, vol: 0.22, at: 0.07 })
            buzz(8)
        }),

        // a coupler snaps onto a tile: a metallic click and a bright ping
        fuse: effect(() => {
            tone(note(12), { type: 'square', dur: 0.03, vol: 0.12 })
            tone(note(14) * 2, { type: 'sine', dur: 0.18, vol: 0.14, at: 0.03 })
            buzz([10, 20, 10])
        }),

        // target reached; longer chains get a longer arpeggio, and each step of a Classic
        // streak (`lift` = multiplier − 1) starts it higher, so the streak is heard climbing
        complete: effect((chain, lift = 0) => {
            const steps = Math.min(3 + chain, 9)
            const from = 5 + 2 * lift
            for (let i = 0; i < steps; i++) tone(note(from + i), { type: 'triangle', dur: 0.22, vol: 0.28, at: i * 0.055 })
            tone(note(from + steps) * 2, { type: 'sine', dur: 0.5, vol: 0.12, at: steps * 0.055 })
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

        // streak pot cashed in: more coins and a higher last note for a bigger multiplier
        cash: effect(mult => {
            duck(1.2)
            const coins = 2 + 2 * mult
            for (let i = 0; i < coins; i++) {
                tone(988 + i * 50, { type: 'square', dur: 0.06, vol: 0.09, at: i * 0.06 })
                tone(1319 + i * 50, { type: 'square', dur: 0.14, vol: 0.09, at: i * 0.06 + 0.04 })
            }
            tone(note(10 + 2 * mult), { type: 'triangle', dur: 0.6, vol: 0.25, at: coins * 0.06 + 0.05 })
            buzz([15, 30, 15, 30, 40])
        }),

        // streak pot lost: everything slides down
        bust: effect(() => {
            tone(note(10), { type: 'sawtooth', dur: 0.6, vol: 0.12, slide: note(-5) })
            hiss({ dur: 0.5, vol: 0.12, from: 4000, to: 300 })
            buzz([80, 40, 80])
        }),

        tick: effect(last => tone(last ? 1320 : 880, { type: 'sine', dur: 0.05, vol: 0.18 })),

        gameOver: effect(() => {
            duck(2.4)
            ;[392, 370, 349].forEach((f, i) => tone(f, { type: 'triangle', dur: 0.32, vol: 0.25, at: 0.3 + i * 0.3 }))
            tone(330, { type: 'triangle', dur: 0.9, vol: 0.25, at: 1.2, slide: 300 })
        }),

        ui: effect(() => tone(note(4), { type: 'sine', dur: 0.06, vol: 0.12 })),

        // Nine poked on the home screen: a little voice per reaction
        poke: effect(kind => {
            if (kind === 'love') {
                tone(note(7), { type: 'sine', dur: 0.14, vol: 0.18 })
                tone(note(9), { type: 'sine', dur: 0.3, vol: 0.18, at: 0.13 })
            } else if (kind === 'spin') {
                hiss({ dur: 0.5, vol: 0.12, from: 500, to: 3000 })
                tone(note(5), { type: 'triangle', dur: 0.5, vol: 0.14, slide: note(12) })
            } else if (kind === 'wink') {
                tone(note(10), { type: 'sine', dur: 0.06, vol: 0.12 })
                tone(note(14), { type: 'sine', dur: 0.25, vol: 0.1, at: 0.07 })
            } else if (kind === 'boing') {
                tone(160, { type: 'sine', dur: 0.18, vol: 0.25, slide: 520 })
                tone(520, { type: 'sine', dur: 0.35, vol: 0.18, at: 0.17, slide: 240 })
            } else if (kind === 'dizzy') {
                for (let i = 0; i < 6; i++) tone(note(8 - i), { type: 'triangle', dur: 0.12, vol: 0.12, at: i * 0.09 })
                hiss({ dur: 0.6, vol: 0.06, at: 0.1, from: 2000, to: 600 })
            }
        }),
    }
})()
