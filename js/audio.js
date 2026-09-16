// 不帶音檔，全部用 WebAudio 現合成
export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  // 必須由使用者手勢觸發才建得起來
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  toggle() {
    this.muted = !this.muted;
    return this.muted;
  }

  tone(freq, dur, type = 'square', gain = 0.06) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur);
  }

  noise(dur, gain = 0.18) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1800, t);
    src.buffer = buf;
    g.gain.setValueAtTime(gain, t);
    src.connect(f).connect(g).connect(this.ctx.destination);
    src.start(t);
  }

  move() { this.tone(340, 0.04, 'square', 0.03); }
  rotate() { this.tone(520, 0.05, 'square', 0.035); }
  lock() { this.tone(180, 0.08, 'triangle', 0.05); }
  clearRows(n) {
    this.noise(0.35 + n * 0.05, 0.22);
    this.tone(440 + n * 110, 0.22, 'sawtooth', 0.05);
  }
  rise() { this.tone(110, 0.1, 'triangle', 0.035); }
  crack() {
    this.noise(0.18, 0.12);
    this.tone(240, 0.12, 'triangle', 0.04);
  }
  over() { this.tone(160, 0.5, 'sawtooth', 0.06); }
}
