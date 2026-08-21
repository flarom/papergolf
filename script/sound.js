(function () {
    let ctx = null;

    function getCtx() {
        if (typeof window === 'undefined') return null;
        if (!ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            ctx = new AC();
        }
        if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
        return ctx;
    }

    function blip(from, to, dur, type, gain, delay) {
        const ac = getCtx();
        if (!ac) return;
        const t0 = ac.currentTime + (delay || 0);
        const osc = ac.createOscillator();
        const g = ac.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(from, t0);
        if (to !== undefined && to !== from) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
        }
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(g);
        g.connect(ac.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
    }

    window.sounds = {
        dirChange() {
            blip(660, 880, 0.06, 'triangle', 0.12);
        },
        strengthTick() {
            blip(1100, 1400, 0.04, 'square', 0.08);
        },
        hit() {
            blip(200, 70, 0.18, 'sine', 0.4);
            blip(3000, 2000, 0.05, 'triangle', 0.1, 0.02);
        },
        smallHit() {
            blip(260, 130, 0.1, 'sine', 0.3);
        },
        buttonPop(delay) {
            blip(100, 300, 0.09, 'triangle', 0.1, delay || 0);
        },
    };

    const bufferCache = new Map();
    let nextId = 1;
    const activeLoops = new Map();
    const activeAudio = new Map();

    async function loadBuffer(url) {
        if (bufferCache.has(url)) return bufferCache.get(url);
        const ac = getCtx();
        if (!ac) return null;
        const res = await fetch(url);
        const buf = await res.arrayBuffer();
        const decoded = await ac.decodeAudioData(buf);
        bufferCache.set(url, decoded);
        return decoded;
    }

    function playLoop(url, opts) {
        opts = opts || {};
        const id = 'loop_' + (nextId++);
        const targetVolume = opts.volume != null ? opts.volume / 100 : 1;
        const pitch = opts.pitch != null ? opts.pitch : 1;
        const fadeIn = opts.fadeIn || 0;

        loadBuffer(url).then(function (buffer) {
            if (!buffer) return;
            const ac = getCtx();
            if (!ac) return;

            const source = ac.createBufferSource();
            const gain = ac.createGain();
            source.buffer = buffer;
            source.loop = true;
            source.playbackRate.value = pitch;

            if (fadeIn > 0) {
                gain.gain.setValueAtTime(0.0001, ac.currentTime);
                gain.gain.exponentialRampToValueAtTime(targetVolume, ac.currentTime + fadeIn);
            } else {
                gain.gain.value = targetVolume;
            }

            source.connect(gain);
            gain.connect(ac.destination);
            source.start(0);

            activeLoops.set(id, { source: source, gain: gain, volume: targetVolume, pitch: pitch, startTime: ac.currentTime, buffer: buffer });
        });

        return id;
    }

    function stopLoop(id, opts) {
        const loop = activeLoops.get(id);
        if (!loop) return;

        var stopOnLoopEnd = false;
        var fadeOut = 0;

        if (typeof opts === 'boolean') {
            stopOnLoopEnd = opts;
        } else if (opts && typeof opts === 'object') {
            stopOnLoopEnd = !!opts.loopEnd;
            fadeOut = opts.fadeOut || 0;
        }

        if (stopOnLoopEnd) {
            const ac = getCtx();
            if (!ac) return;
            var elapsed = ac.currentTime - loop.startTime;
            var loopDur = loop.buffer.duration / loop.pitch;
            var remaining = loopDur - (elapsed % loopDur);

            loop.source.loop = false;

            if (fadeOut > 0) {
                var fadeStart = Math.max(ac.currentTime, ac.currentTime + remaining - fadeOut);
                loop.gain.gain.setValueAtTime(loop.volume, fadeStart);
                loop.gain.gain.exponentialRampToValueAtTime(0.0001, fadeStart + fadeOut);
            }

            loop.source.stop(ac.currentTime + remaining);
            setTimeout(function () { activeLoops.delete(id); }, remaining * 1000 + 50);
        } else if (fadeOut > 0) {
            const ac = getCtx();
            if (!ac) return;
            loop.gain.gain.setValueAtTime(loop.volume, ac.currentTime);
            loop.gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + fadeOut);
            loop.source.stop(ac.currentTime + fadeOut + 0.05);
            setTimeout(function () { activeLoops.delete(id); }, fadeOut * 1000 + 100);
        } else {
            loop.source.stop();
            activeLoops.delete(id);
        }
    }

    function updateLoop(id, opts) {
        opts = opts || {};
        var loop = activeLoops.get(id);
        if (!loop) return;

        if (opts.volume != null) {
            loop.volume = opts.volume / 100;
            loop.gain.gain.value = loop.volume;
        }
        if (opts.pitch != null) {
            loop.pitch = opts.pitch;
            loop.source.playbackRate.value = loop.pitch;
        }
    }

    function playAudio(url, opts) {
        opts = opts || {};
        var id = 'audio_' + (nextId++);
        var volume = opts.volume != null ? opts.volume / 100 : 1;
        var pitch = opts.pitch != null ? opts.pitch : 1;
        var fadeIn = opts.fadeIn || 0;

        loadBuffer(url).then(function (buffer) {
            if (!buffer) return;
            var ac = getCtx();
            if (!ac) return;

            var source = ac.createBufferSource();
            var gain = ac.createGain();
            source.buffer = buffer;
            source.loop = false;
            source.playbackRate.value = pitch;

            if (fadeIn > 0) {
                gain.gain.setValueAtTime(0.0001, ac.currentTime);
                gain.gain.exponentialRampToValueAtTime(volume, ac.currentTime + fadeIn);
            } else {
                gain.gain.value = volume;
            }

            source.connect(gain);
            gain.connect(ac.destination);
            source.start(0);

            activeAudio.set(id, { source: source, gain: gain, volume: volume });

            source.onended = function () {
                activeAudio.delete(id);
            };
        });

        return id;
    }

    function stopAudio(id, fadeOut) {
        var a = activeAudio.get(id);
        if (!a) return;

        fadeOut = typeof fadeOut === 'number' ? fadeOut : 0;

        if (fadeOut > 0) {
            var ac = getCtx();
            if (!ac) return;
            a.gain.gain.setValueAtTime(a.volume, ac.currentTime);
            a.gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + fadeOut);
            a.source.stop(ac.currentTime + fadeOut + 0.05);
            setTimeout(function () { activeAudio.delete(id); }, fadeOut * 1000 + 100);
        } else {
            a.source.stop();
            activeAudio.delete(id);
        }
    }

    window.audio = {
        playLoop: playLoop,
        stopLoop: stopLoop,
        updateLoop: updateLoop,
        playAudio: playAudio,
        stopAudio: stopAudio,
    };
})();
