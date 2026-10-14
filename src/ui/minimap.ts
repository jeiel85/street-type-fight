// 미니맵: 지형은 한 번만 그려 두고, 매 프레임 파이터 점만 덧그린다.

import type { Sim } from '../sim/sim';
import { BOUNDS, HOUSES, PLAZA, ROADS, STREAMS, TRAINING_GROUND, TREES, VILLAGES } from '../sim/world';

const W = 220;
const H = Math.round((W * (BOUNDS.maxZ - BOUNDS.minZ)) / (BOUNDS.maxX - BOUNDS.minX));
const S = W / (BOUNDS.maxX - BOUNDS.minX);
const px = (x: number) => (x - BOUNDS.minX) * S;
const pz = (z: number) => (z - BOUNDS.minZ) * S;

export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly bg: HTMLCanvasElement;

  constructor(host: HTMLElement) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas = document.createElement('canvas');
    this.canvas.width = W * dpr;
    this.canvas.height = H * dpr;
    this.canvas.style.width = `${W}px`;
    this.canvas.style.height = `${H}px`;
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.scale(dpr, dpr);
    this.bg = document.createElement('canvas');
    this.bg.width = W * dpr;
    this.bg.height = H * dpr;
    const b = this.bg.getContext('2d')!;
    b.scale(dpr, dpr);
    this.drawTerrain(b);
  }

  private drawTerrain(c: CanvasRenderingContext2D): void {
    c.fillStyle = '#86b955';
    c.fillRect(0, 0, W, H);
    c.strokeStyle = '#d2b07a';
    c.lineWidth = 2.4 * S;
    c.lineCap = 'round';
    for (const s of ROADS) { c.beginPath(); c.moveTo(px(s.ax), pz(s.az)); c.lineTo(px(s.bx), pz(s.bz)); c.stroke(); }
    c.fillStyle = '#4aa3d8';
    for (const s of STREAMS) c.fillRect(px(s.x - s.hw), 0, s.hw * 2 * S, H);
    c.fillStyle = '#5b9a3c';
    for (const t of TREES) { c.beginPath(); c.arc(px(t.x), pz(t.z), 0.9, 0, Math.PI * 2); c.fill(); }
    for (const v of VILLAGES) {
      c.fillStyle = 'rgba(232,214,170,0.9)';
      c.beginPath(); c.arc(px(v.x), pz(v.z), v.r * S, 0, Math.PI * 2); c.fill();
      c.strokeStyle = v.team === 'blue' ? '#3f74c9' : '#d24a3a';
      c.lineWidth = 2;
      c.stroke();
    }
    c.fillStyle = '#6a5a4a';
    for (const h of HOUSES) c.fillRect(px(h.x - h.hw), pz(h.z - h.hd), h.hw * 2 * S, h.hd * 2 * S);
    c.fillStyle = '#b9b2a4';
    c.beginPath(); c.arc(px(PLAZA.x), pz(PLAZA.z), PLAZA.r * S, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#c9a46b';
    c.beginPath(); c.arc(px(TRAINING_GROUND.x), pz(TRAINING_GROUND.z), TRAINING_GROUND.r * S, 0, Math.PI * 2); c.fill();
  }

  draw(sim: Sim, meId: string | null): void {
    const c = this.ctx;
    c.clearRect(0, 0, W, H);
    c.drawImage(this.bg, 0, 0, W, H);
    const me = meId ? sim.fighters.get(meId) : undefined;
    for (const f of sim.fighters.values()) {
      if (!f.alive || f.isDummy || f === me) continue;
      c.fillStyle = f.team === 'blue' ? '#2f63c9' : '#e0402f';
      c.beginPath(); c.arc(px(f.x), pz(f.z), 3, 0, Math.PI * 2); c.fill();
      if (me && me.targetId === f.id) {
        c.strokeStyle = '#ff2a2a';
        c.lineWidth = 1.5;
        c.beginPath(); c.arc(px(f.x), pz(f.z), 5.5, 0, Math.PI * 2); c.stroke();
      }
    }
    if (me && me.alive) {
      c.fillStyle = '#ffd34d';
      c.strokeStyle = '#2b2233';
      c.lineWidth = 2;
      c.beginPath(); c.arc(px(me.x), pz(me.z), 4.2, 0, Math.PI * 2); c.fill(); c.stroke();
    }
  }
}
