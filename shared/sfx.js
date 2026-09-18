// Shared synthesized sound-effect engine, used by every game in the hub.
// Everything is generated on the fly with the WebAudio API — no audio files
// to fetch, license, or go stale. Call SFX.play('shoot') etc. Safe to call
// before any user gesture (it silently no-ops until the AudioContext unlocks
// on the first click/keypress, which every game's start screen provides).
const SFX = (function () {
    let ctx = null;
    let muted = localStorage.getItem('sfx-muted') === '1';
    let masterGain = null;

    function ensureCtx() {
        if (ctx) return ctx;
        try {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
            masterGain = ctx.createGain();
            masterGain.gain.value = 0.35;
            masterGain.connect(ctx.destination);
        } catch (e) {
            ctx = null;
        }
        return ctx;
    }

    function unlock() {
        const c = ensureCtx();
        if (c && c.state === 'suspended') c.resume();
    }
    ['click', 'keydown', 'touchstart'].forEach(evt =>
        window.addEventListener(evt, unlock, { once: true, passive: true })
    );

    function isMuted() { return muted; }
    function setMuted(v) {
        muted = v;
        localStorage.setItem('sfx-muted', v ? '1' : '0');
    }
    function toggleMuted() { setMuted(!muted); return muted; }

    function tone(freq, dur, opts) {
        const c = ensureCtx();
        if (!c || muted) return;
        opts = opts || {};
        const type = opts.type || 'sine';
        const startGain = opts.gain != null ? opts.gain : 1;
        const glideTo = opts.glideTo;
        const now = c.currentTime + (opts.delay || 0);

        const osc = c.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        if (glideTo != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), now + dur);

        const gain = c.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(startGain, now + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + dur + 0.02);
    }

    function noiseBurst(dur, opts) {
        const c = ensureCtx();
        if (!c || muted) return;
        opts = opts || {};
        const now = c.currentTime + (opts.delay || 0);
        const bufferSize = Math.max(1, Math.floor(c.sampleRate * dur));
        const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        }
        const src = c.createBufferSource();
        src.buffer = buffer;

        const filter = c.createBiquadFilter();
        filter.type = opts.filterType || 'bandpass';
        filter.frequency.value = opts.filterFreq || 1500;
        filter.Q.value = opts.q || 0.8;

        const gain = c.createGain();
        gain.gain.setValueAtTime((opts.gain != null ? opts.gain : 0.6), now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

        src.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);
        src.start(now);
        src.stop(now + dur + 0.02);
    }

    const RECIPES = {
        click:    () => tone(880, 0.05, { type: 'square', gain: 0.5 }),
        select:   () => tone(660, 0.06, { type: 'triangle', gain: 0.5, glideTo: 880 }),
        move:     () => tone(320, 0.04, { type: 'square', gain: 0.3 }),
        shoot:    () => { tone(900, 0.09, { type: 'sawtooth', gain: 0.5, glideTo: 140 }); noiseBurst(0.07, { gain: 0.25, filterFreq: 2500 }); },
        bowshot:  () => { tone(500, 0.12, { type: 'triangle', gain: 0.4, glideTo: 1400 }); noiseBurst(0.08, { gain: 0.2, filterFreq: 3200 }); },
        hit:      () => tone(220, 0.08, { type: 'square', gain: 0.5, glideTo: 90 }),
        break:    () => { noiseBurst(0.22, { gain: 0.55, filterFreq: 1800, q: 0.5 }); tone(180, 0.18, { type: 'square', gain: 0.35, glideTo: 60, delay: 0.02 }); },
        smash:    () => { noiseBurst(0.28, { gain: 0.6, filterFreq: 2600, q: 0.4 }); noiseBurst(0.16, { gain: 0.35, filterFreq: 900, q: 0.6, delay: 0.03 }); },
        miss:     () => tone(180, 0.15, { type: 'sine', gain: 0.3, glideTo: 80 }),
        bounce:   () => tone(500, 0.05, { type: 'triangle', gain: 0.35, glideTo: 700 }),
        powerup:  () => { tone(440, 0.09, { type: 'triangle', gain: 0.4, glideTo: 880 }); tone(660, 0.12, { type: 'triangle', gain: 0.35, glideTo: 1320, delay: 0.08 }); },
        coin:     () => { tone(988, 0.06, { type: 'square', gain: 0.35 }); tone(1318, 0.12, { type: 'square', gain: 0.3, delay: 0.06 }); },
        countdown:() => tone(523, 0.12, { type: 'triangle', gain: 0.45 }),
        go:       () => { tone(523, 0.08, { type: 'triangle', gain: 0.45 }); tone(784, 0.16, { type: 'triangle', gain: 0.45, delay: 0.09 }); },
        win:      () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, { type: 'triangle', gain: 0.4, delay: i * 0.1 })); },
        lose:     () => { [392, 349, 311, 261].forEach((f, i) => tone(f, 0.22, { type: 'sawtooth', gain: 0.35, delay: i * 0.12 })); },
        record:   () => { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.22, { type: 'triangle', gain: 0.42, delay: i * 0.09 })); },
        check:    () => tone(1046, 0.1, { type: 'square', gain: 0.4 }),
        capture:  () => { tone(300, 0.07, { type: 'square', gain: 0.4, glideTo: 150 }); noiseBurst(0.05, { gain: 0.2, filterFreq: 2000 }); },
        pause:    () => tone(440, 0.08, { type: 'sine', gain: 0.35 }),
        error:    () => tone(160, 0.15, { type: 'sawtooth', gain: 0.35 }),
        line:     () => { [660, 880, 1100, 1320].forEach((f, i) => tone(f, 0.1, { type: 'square', gain: 0.4, delay: i * 0.05 })); },
        drop:     () => tone(200, 0.06, { type: 'square', gain: 0.4, glideTo: 60 }),
        rotate:   () => tone(500, 0.04, { type: 'square', gain: 0.25, glideTo: 650 }),
    };

    function play(name) {
        const fn = RECIPES[name];
        if (fn) fn();
    }

    return { play, unlock, isMuted, setMuted, toggleMuted };
})();
