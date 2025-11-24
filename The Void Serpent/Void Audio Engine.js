/**
 * 🔊 虚空音频引擎 V4 - 可控混音版
 * 更新：支持独立通道音量控制 (Ambient, Spawn, Eat)
 */
class AudioEngine {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.reverbNode = null;
        this.delayNode = null;
        this.feedbackNode = null;
        this.isInitialized = false;
        this.isPlaying = false;

        this.currentStage = 0;
        this.timerID = null;

        // ★★★ 新增：独立音量控制状态 (0.0 ~ 1.0) ★★★
        this.volumes = {
            ambient: 0.8, // 背景音乐
            spawn: 0.5,   // 放置食物
            eat: 0.5      // 吃食物
        };

        this.scales = [
            [523.25, 587.33, 659.25, 783.99, 880.00],
            [261.63, 293.66, 329.63, 392.00, 440.00],
            [196.00, 233.08, 261.63, 311.13, 349.23],
            [130.81, 155.56, 185.00, 196.00, 233.08],
            [110.00, 123.47, 130.81, 146.83, 164.81, 196.00],
            [55.00, 65.41, 69.30, 82.41, 87.31, 98.00],
            [40.00, 42.00, 45.00, 48.00, 1000.00]
        ];
    }

    // ★★★ 新增：外部设置音量接口 ★★★
    setVolume(type, value) {
        if (this.volumes.hasOwnProperty(type)) {
            this.volumes[type] = parseFloat(value);
        }
    }

    init() {
        if (this.isInitialized) return;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.5;
        const compressor = this.ctx.createDynamicsCompressor();
        compressor.threshold.value = -12;
        compressor.ratio.value = 12;

        this.reverbNode = this.ctx.createConvolver();
        this.reverbNode.buffer = this.createImpulseResponse(3.0, 2.0);
        const reverbGain = this.ctx.createGain();
        reverbGain.gain.value = 0.6;

        this.delayNode = this.ctx.createDelay();
        this.delayNode.delayTime.value = 0.4;
        this.feedbackNode = this.ctx.createGain();
        this.feedbackNode.gain.value = 0.4;

        this.delayNode.connect(this.feedbackNode);
        this.feedbackNode.connect(this.delayNode);

        this.masterGain.connect(compressor);
        compressor.connect(this.ctx.destination);
        compressor.connect(reverbGain);
        reverbGain.connect(this.reverbNode);
        this.reverbNode.connect(this.ctx.destination);
        this.delayNode.connect(this.masterGain);

        this.isInitialized = true;
        this.isPlaying = true;

        this.scheduleNextNote();
        console.log("Void Audio: Mixer Ready.");
    }

    createImpulseResponse(duration, decay) {
        const rate = this.ctx.sampleRate;
        const length = rate * duration;
        const impulse = this.ctx.createBuffer(2, length, rate);
        const left = impulse.getChannelData(0);
        const right = impulse.getChannelData(1);
        for (let i = 0; i < length; i++) {
            const n = i / length;
            const vol = Math.pow(1 - n, decay);
            left[i] = (Math.random() * 2 - 1) * vol;
            right[i] = (Math.random() * 2 - 1) * vol;
        }
        return impulse;
    }

    scheduleNextNote() {
        if (!this.isPlaying) return;
        let minTime = 2000 - (this.currentStage * 300);
        let maxTime = 4000 - (this.currentStage * 500);
        if (minTime < 200) minTime = 200;
        let delay = Math.random() * (maxTime - minTime) + minTime;

        // 如果音量不为0才触发
        if (this.volumes.ambient > 0.01) {
            this.triggerAmbientSound();
        }
        this.timerID = setTimeout(() => this.scheduleNextNote(), delay);
    }

    triggerAmbientSound() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const scale = this.scales[this.currentStage] || this.scales[0];
        const freq = scale[Math.floor(Math.random() * scale.length)];

        const osc = this.ctx.createOscillator();
        const env = this.ctx.createGain();
        const panner = this.ctx.createPanner();
        panner.panningModel = 'HRTF';
        panner.setPosition((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 15);

        // ★★★ 应用 Ambient 音量系数 ★★★
        const vol = this.volumes.ambient;

        if (this.currentStage < 2) {
            osc.type = 'sine';
            env.gain.setValueAtTime(0, t);
            // 原来是 0.3，现在乘以 vol
            env.gain.linearRampToValueAtTime(0.3 * vol, t + 0.05);
            env.gain.exponentialRampToValueAtTime(0.001, t + 2.0);
        } else if (this.currentStage < 5) {
            osc.type = 'triangle';
            const modulator = this.ctx.createOscillator();
            const modGain = this.ctx.createGain();
            modulator.frequency.value = freq * 1.5;
            modulator.type = 'sawtooth';
            modGain.gain.value = 200;
            modulator.connect(modGain);
            modGain.connect(osc.frequency);
            modulator.start(t);
            modulator.stop(t + 3);
            env.gain.setValueAtTime(0, t);
            env.gain.linearRampToValueAtTime(0.2 * vol, t + 0.1);
            env.gain.exponentialRampToValueAtTime(0.001, t + 3.0);
        } else {
            osc.type = Math.random() > 0.5 ? 'sawtooth' : 'square';
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 200 + Math.random() * 500;
            osc.connect(filter);
            filter.connect(env);
            env.gain.setValueAtTime(0, t);
            env.gain.linearRampToValueAtTime(0.15 * vol, t + 2);
            env.gain.linearRampToValueAtTime(0, t + 6);
            if (Math.random() < 0.2) osc.frequency.setValueAtTime(freq * 10, t + 1);
        }

        if (this.currentStage < 5) osc.connect(env);

        env.connect(panner);
        panner.connect(this.masterGain);
        panner.connect(this.delayNode);

        osc.frequency.value = freq;
        osc.detune.value = (Math.random() - 0.5) * 20;
        osc.start(t);
        osc.stop(t + 7);
    }

    setStage(idx) {
        this.currentStage = idx;
        if(this.delayNode) {
            const newDelay = 0.3 + (idx * 0.05);
            this.delayNode.delayTime.linearRampToValueAtTime(newDelay, this.ctx.currentTime + 1);
        }
    }

    playSpawn() {
        if (!this.ctx || this.volumes.spawn < 0.01) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const panner = this.ctx.createPanner();
        panner.panningModel = 'HRTF';
        panner.setPosition((Math.random()-0.5)*5, 0, 0);

        osc.connect(gain);
        gain.connect(panner);
        panner.connect(this.masterGain);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, t);
        osc.frequency.exponentialRampToValueAtTime(1200, t + 0.1);

        // ★★★ 应用 Spawn 音量系数 ★★★
        const vol = this.volumes.spawn;
        gain.gain.setValueAtTime(0.1 * vol, t);
        gain.gain.exponentialRampToValueAtTime(0.01 * vol, t + 0.1);

        osc.start(t);
        osc.stop(t + 0.15);
    }

    playEat() {
        if (!this.ctx || this.volumes.eat < 0.01) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.masterGain);
        gain.connect(this.delayNode);

        osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(50, t + 0.2);

        // ★★★ 应用 Eat 音量系数 ★★★
        const vol = this.volumes.eat;
        gain.gain.setValueAtTime(0.2 * vol, t);
        gain.gain.exponentialRampToValueAtTime(0.01 * vol, t + 0.2);

        osc.start(t);
        osc.stop(t + 0.25);
    }

    playDescent() {
        if (!this.ctx) return;
        // Descent 这种大事件声音通常不跟随普通音量，或者跟随 Ambient
        // 这里暂时设为最大音量以保持震撼感
        const t = this.ctx.currentTime;

        const oscLow = this.ctx.createOscillator();
        const gainLow = this.ctx.createGain();
        oscLow.type = 'triangle';
        oscLow.frequency.setValueAtTime(120, t);
        oscLow.frequency.exponentialRampToValueAtTime(10, t + 3);
        gainLow.gain.setValueAtTime(1.0, t);
        gainLow.gain.exponentialRampToValueAtTime(0.01, t + 4);

        const oscHigh = this.ctx.createOscillator();
        const gainHigh = this.ctx.createGain();
        oscHigh.type = 'sawtooth';
        oscHigh.frequency.setValueAtTime(800, t);
        oscHigh.frequency.exponentialRampToValueAtTime(100, t + 0.5);
        gainHigh.gain.setValueAtTime(0.3, t);
        gainHigh.gain.linearRampToValueAtTime(0, t + 0.5);

        oscLow.connect(gainLow);
        gainLow.connect(this.masterGain);
        if(this.reverbNode) gainLow.connect(this.reverbNode);

        oscHigh.connect(gainHigh);
        gainHigh.connect(this.masterGain);
        if(this.delayNode) gainHigh.connect(this.delayNode);

        oscLow.start(t);
        oscLow.stop(t + 5);
        oscHigh.start(t);
        oscHigh.stop(t + 1);
    }
}
