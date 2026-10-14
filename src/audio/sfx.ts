// 효과음은 모두 Web Audio로 즉석 합성한다(외부 음원 없음).
// 브라우저 정책상 첫 사용자 입력(Enter) 이후에만 소리를 낼 수 있어 unlock()을 그때 부른다.

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  // exponentialRamp는 0을 목표로 받지 않으므로, 들리지 않을 만큼 작은 소리는 아예 만들지 않는다.
  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0): void {
    const c = this.ctx;
    if (!c || !this.master || !(vol > 0.001)) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private hiss(filter: BiquadFilterType, freq: number, dur: number, vol: number, sweepTo?: number, delay = 0): void {
    const c = this.ctx;
    if (!c || !this.master || !this.noise || !(vol > 0.001)) return;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  /** 기계식 키보드 같은 타건음. */
  key(v = 1): void {
    this.hiss('bandpass', 2600 + Math.random() * 1400, 0.03, 0.25 * v);
    this.tone('triangle', 900 + Math.random() * 200, 500, 0.025, 0.08 * v);
  }

  jab(close: boolean, v = 1): void {
    this.tone('sine', close ? 180 : 150, 60, 0.09, (close ? 0.45 : 0.3) * v);
    this.hiss('lowpass', 1800, 0.05, 0.25 * v);
  }

  finisher(v = 1): void {
    this.tone('sine', 140, 40, 0.22, 0.7 * v);
    this.hiss('highpass', 1500, 0.12, 0.4 * v);
    this.hiss('bandpass', 600, 0.2, 0.3 * v, 200);
  }

  fumble(): void {
    this.tone('square', 220, 150, 0.14, 0.12);
    this.tone('square', 233, 140, 0.14, 0.08);
  }

  reject(): void {
    this.tone('square', 120, 100, 0.04, 0.05);
  }

  notReady(): void {
    this.tone('triangle', 420, 400, 0.05, 0.12);
    this.tone('triangle', 330, 320, 0.06, 0.1, 0.06);
  }

  cast(kind: string, v = 1): void {
    this.hiss('bandpass', 400, 0.35, 0.35 * v, 3000);
    if (kind === 'projectile') this.tone('sine', 300, 900, 0.3, 0.15 * v);
    if (kind === 'ultimate') { this.tone('sawtooth', 110, 220, 0.8, 0.12 * v); this.hiss('lowpass', 300, 1.2, 0.3 * v, 1200); }
  }

  warn(): void {
    this.tone('square', 1320, 1320, 0.05, 0.12);
    this.tone('square', 1320, 1320, 0.05, 0.12, 0.08);
  }

  hit(v = 1): void {
    this.tone('sine', 120, 35, 0.3, 0.8 * v);
    this.hiss('lowpass', 2500, 0.18, 0.5 * v);
  }

  block(v = 1): void {
    this.tone('triangle', 900, 860, 0.18, 0.3 * v);
    this.tone('triangle', 1370, 1300, 0.14, 0.2 * v);
    this.hiss('highpass', 4000, 0.08, 0.2 * v);
  }

  parry(v = 1): void {
    this.tone('sine', 1320, 1320, 0.4, 0.3 * v);
    this.tone('sine', 1980, 1980, 0.5, 0.2 * v, 0.03);
    this.tone('triangle', 2640, 2640, 0.3, 0.12 * v, 0.06);
    this.hiss('highpass', 5000, 0.15, 0.25 * v);
  }

  guard(): void {
    this.tone('sine', 500, 800, 0.25, 0.2);
  }

  ko(v = 1): void {
    this.tone('sine', 90, 30, 0.5, 0.9 * v);
    this.hiss('lowpass', 900, 0.6, 0.5 * v, 150);
    this.tone('sine', 1500, 300, 0.6, 0.12 * v, 0.1);
  }

  ultimateReady(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.18, 0.18, i * 0.07));
  }

  thunder(v = 1): void {
    this.hiss('lowpass', 2000, 1.4, 0.8 * v, 80);
    this.tone('sine', 70, 25, 0.8, 0.9 * v);
  }

  fanfare(win: boolean): void {
    const notes = win ? [523, 659, 784, 1047, 1319] : [392, 349, 311, 262];
    notes.forEach((f, i) => this.tone('triangle', f, f, 0.3, 0.22, i * (win ? 0.12 : 0.2)));
  }
}
