// 이펙트: 파티클 풀(스프라이트), 스킬 시전 중 연출(장풍 구슬·회오리·필살 마법진), 착탄 결과 연출.
// 모든 텍스처는 캔버스로 그린다.

import {
  AdditiveBlending, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, NormalBlending, PlaneGeometry,
  RepeatWrapping, RingGeometry, Sprite, SpriteMaterial, Vector3, type Scene, type Texture,
} from 'three';
import type { Fighter, Sim, Threat, ThreatOutcome } from '../sim/sim';
import { KOREAN_FONT, drawTexture } from './canvas';

type TexName = 'spark' | 'dot' | 'puff' | 'star' | 'hex' | 'ring';

function makeTextures(): Record<TexName, Texture> {
  const radial = (ctx: CanvasRenderingContext2D, s: number, stops: [number, string][]) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    for (const [o, c] of stops) g.addColorStop(o, c);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  };
  return {
    spark: drawTexture(64, 64, (ctx) => {
      radial(ctx, 64, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']]);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = i % 2 ? 7 : 31;
        ctx.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
      }
      ctx.fill();
    }),
    dot: drawTexture(32, 32, (ctx) => radial(ctx, 32, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']])),
    puff: drawTexture(64, 64, (ctx) => {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (const [x, y, r] of [[32, 36, 18], [20, 30, 13], [44, 28, 14], [30, 22, 12]] as const) {
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
    }),
    star: drawTexture(64, 64, (ctx) => {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#2b2233';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 ? 12 : 28;
        ctx.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }),
    hex: drawTexture(128, 128, (ctx) => {
      ctx.strokeStyle = 'rgba(255,255,255,1)';
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 7;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        ctx.lineTo(64 + Math.cos(a) * 56, 64 + Math.sin(a) * 56);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        ctx.lineTo(64 + Math.cos(a) * 34, 64 + Math.sin(a) * 34);
      }
      ctx.closePath(); ctx.stroke();
    }),
    ring: drawTexture(128, 128, (ctx) => {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 10;
      ctx.beginPath(); ctx.arc(64, 64, 54, 0, Math.PI * 2); ctx.stroke();
    }),
  };
}

function swirlTexture(): Texture {
  const t = drawTexture(256, 128, (ctx) => {
    ctx.clearRect(0, 0, 256, 128);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      ctx.lineWidth = 3 + (i % 3) * 2;
      const y = 10 + i * 13;
      ctx.beginPath();
      ctx.moveTo((i * 53) % 256, y);
      ctx.bezierCurveTo((i * 53 + 40) % 256, y - 8, (i * 53 + 80) % 256, y + 8, (i * 53 + 120) % 256, y);
      ctx.stroke();
    }
  });
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

function runeTexture(): Texture {
  return drawTexture(256, 256, (ctx) => {
    ctx.translate(128, 128);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(0, 0, 118, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 92, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i <= 5; i++) {
      const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      ctx.lineTo(Math.cos(a) * 92, Math.sin(a) * 92);
    }
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `bold 22px ${KOREAN_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const ring = '필살필살필살필살필살필살';
    [...ring].forEach((ch, i) => {
      const a = (i / ring.length) * Math.PI * 2;
      ctx.save();
      ctx.rotate(a);
      ctx.fillText(ch, 0, -105);
      ctx.restore();
    });
  });
}

function boltTexture(): Texture {
  return drawTexture(64, 512, (ctx) => {
    const pts: [number, number][] = [[32, 0]];
    for (let y = 30; y < 512; y += 30) pts.push([32 + (Math.sin(y * 12.9898) * 43758.5453 % 1) * 22, y]);
    for (const [w, c] of [[16, 'rgba(160,200,255,0.5)'], [7, '#fff']] as const) {
      ctx.strokeStyle = c;
      ctx.lineWidth = w;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (const [x, y] of pts) ctx.lineTo(x, y);
      ctx.stroke();
    }
  });
}

/** 장면에서 빼면서 GPU 자원도 놓는다(공유 텍스처는 남긴다). */
function discard(obj: Sprite | Mesh | Group): void {
  obj.removeFromParent();
  if (obj instanceof Mesh) {
    obj.geometry.dispose();
    (obj.material as MeshBasicMaterial).dispose();
  } else if (obj instanceof Sprite) {
    obj.material.dispose();
  }
}

interface Particle {
  sprite: Sprite;
  vel: Vector3;
  life: number;
  maxLife: number;
  size0: number;
  size1: number;
  gravity: number;
  spin: number;
}

interface BurstOpts {
  tex?: TexName;
  color?: number;
  count?: number;
  speed?: number;
  life?: number;
  size?: number;
  grow?: number;
  gravity?: number;
  up?: number;
  additive?: boolean;
}

interface ThreatFx {
  threat: Threat;
  objects: (Sprite | Mesh | Group)[];
  orb?: Sprite;
  marker?: Mesh;
  rune?: Mesh;
  pillar?: Mesh;
}

export class Fx {
  private readonly tex = makeTextures();
  private readonly swirl = swirlTexture();
  private readonly rune = runeTexture();
  private readonly bolt = boltTexture();
  private readonly pool: Particle[] = [];
  private readonly live: Particle[] = [];
  private readonly threatFx = new Map<number, ThreatFx>();
  private readonly whirls: { mesh: Mesh; fighterId: string; start: number; end: number; radius: number }[] = [];
  private readonly shields = new Map<string, Sprite>();
  private readonly auras = new Map<string, number>();
  private readonly flashes: { obj: Sprite | Mesh; life: number; max: number; grow: number }[] = [];
  private readonly tmp = new Vector3();

  constructor(private readonly scene: Scene, private readonly tilt: number) {
    for (let i = 0; i < 500; i++) {
      const sprite = new Sprite(new SpriteMaterial({ map: this.tex.dot, transparent: true, depthWrite: false }));
      sprite.visible = false;
      sprite.renderOrder = 5;
      scene.add(sprite);
      this.pool.push({ sprite, vel: new Vector3(), life: 0, maxLife: 1, size0: 1, size1: 1, gravity: 0, spin: 0 });
    }
  }

  /** 판이 바뀔 때 이전 판의 연출을 모두 걷어 낸다(파이터 id가 다음 판에서 재사용되므로). */
  reset(): void {
    for (const p of this.live) {
      p.sprite.visible = false;
      this.pool.push(p);
    }
    this.live.length = 0;
    for (const fx of this.threatFx.values()) for (const o of fx.objects) discard(o);
    this.threatFx.clear();
    for (const w of this.whirls) {
      (w.mesh.material as MeshBasicMaterial).map?.dispose();
      discard(w.mesh);
    }
    this.whirls.length = 0;
    for (const s of this.shields.values()) discard(s);
    this.shields.clear();
    this.auras.clear();
    for (const f of this.flashes) discard(f.obj);
    this.flashes.length = 0;
  }

  burst(pos: Vector3, o: BurstOpts = {}): void {
    const count = o.count ?? 8;
    for (let i = 0; i < count; i++) {
      const p = this.pool.pop();
      if (!p) return;
      const mat = p.sprite.material;
      mat.map = this.tex[o.tex ?? 'dot'];
      mat.color.setHex(o.color ?? 0xffffff);
      mat.blending = o.additive === false ? NormalBlending : AdditiveBlending;
      mat.opacity = 1;
      mat.rotation = Math.random() * Math.PI * 2;
      const speed = (o.speed ?? 4) * (0.4 + Math.random() * 0.8);
      const a = Math.random() * Math.PI * 2;
      const e = (Math.random() - 0.3) * Math.PI * 0.5;
      p.vel.set(Math.cos(a) * Math.cos(e) * speed, Math.sin(e) * speed + (o.up ?? 1), Math.sin(a) * Math.cos(e) * speed);
      p.sprite.position.copy(pos);
      p.life = p.maxLife = (o.life ?? 0.4) * (0.7 + Math.random() * 0.6);
      p.size0 = o.size ?? 0.35;
      p.size1 = p.size0 * (o.grow ?? 0.2);
      p.gravity = o.gravity ?? 6;
      p.spin = (Math.random() - 0.5) * 8;
      p.sprite.scale.setScalar(p.size0);
      p.sprite.visible = true;
      this.live.push(p);
    }
  }

  /** 바닥에 퍼지는 충격파 고리. */
  ring(x: number, z: number, color: number, radius: number, life = 0.35): void {
    const m = new Mesh(new RingGeometry(0.75, 1, 40).rotateX(-Math.PI / 2), new MeshBasicMaterial({
      color, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
    }));
    m.position.set(x, 0.08, z);
    m.scale.setScalar(0.2);
    this.scene.add(m);
    this.flashes.push({ obj: m, life, max: life, grow: radius });
  }

  /** 한 장짜리 번쩍임(방패, 별 등). */
  pop(pos: Vector3, tex: TexName, color: number, size: number, life = 0.3): void {
    const s = new Sprite(new SpriteMaterial({ map: this.tex[tex], color, transparent: true, depthWrite: false, blending: AdditiveBlending }));
    s.position.copy(pos);
    s.scale.setScalar(size);
    s.renderOrder = 6;
    this.scene.add(s);
    this.flashes.push({ obj: s, life, max: life, grow: 1.3 });
  }

  chest(f: Fighter, out = this.tmp): Vector3 {
    return out.set(f.x, 0.95, f.z);
  }

  // ───────── 사건별 연출 ─────────

  jab(attacker: Fighter, target: Fighter, close: boolean, guarded: boolean): void {
    const p = this.chest(target).clone();
    p.x += (Math.random() - 0.5) * 0.3 - attacker.facing * 0.15;
    p.y += (Math.random() - 0.5) * 0.3;
    if (guarded) {
      this.pop(p, 'hex', 0x7fc4ff, 0.7, 0.15);
      return;
    }
    this.burst(p, { tex: 'spark', color: close ? 0xfff2a8 : 0xffffff, count: close ? 4 : 2, speed: 3, life: 0.18, size: close ? 0.45 : 0.32 });
  }

  finisher(target: Fighter): void {
    const p = this.chest(target).clone();
    this.burst(p, { tex: 'spark', color: 0xffb347, count: 10, speed: 6, life: 0.3, size: 0.6 });
    this.pop(p, 'star', 0xffe066, 1.2, 0.22);
    this.ring(target.x, target.z, 0xffc870, 2.2);
  }

  ko(f: Fighter): void {
    const p = this.chest(f).clone();
    this.burst(p, { tex: 'star', color: 0xfff1a0, count: 12, speed: 7, life: 0.7, size: 0.4, grow: 0.5, gravity: 4, additive: false });
    this.burst(p, { tex: 'spark', color: 0xff7a4a, count: 14, speed: 8, life: 0.4, size: 0.8 });
    this.ring(f.x, f.z, 0xff9a6a, 3.5, 0.5);
  }

  respawn(f: Fighter): void {
    this.burst(new Vector3(f.x, 0.3, f.z), { tex: 'puff', color: 0xffffff, count: 10, speed: 2.5, life: 0.5, size: 0.7, grow: 1.6, gravity: -1, additive: false });
    this.ring(f.x, f.z, 0x9fe6ff, 1.8, 0.4);
  }

  fumble(f: Fighter): void {
    this.burst(new Vector3(f.x, 1.9, f.z), { tex: 'star', color: 0xfff1a0, count: 3, speed: 1.5, life: 0.5, size: 0.25, gravity: 2, up: 1.5, additive: false });
  }

  guardUp(f: Fighter): void {
    this.pop(this.chest(f).clone(), 'hex', 0x7fc4ff, 1.8, 0.35);
  }

  /** 스킬이 완성되어 착탄 대기 중인 동안의 연출을 만든다. */
  startThreat(th: Threat, sim: Sim): void {
    const a = sim.fighters.get(th.attackerId);
    const t = sim.fighters.get(th.targetId);
    if (!a || !t) return;
    const fx: ThreatFx = { threat: th, objects: [] };

    // 공통: 대상 발밑의 빨간 경고 고리가 착탄 시각까지 조여 든다.
    const marker = new Mesh(new RingGeometry(0.82, 1, 36).rotateX(-Math.PI / 2), new MeshBasicMaterial({
      color: th.kind === 'ultimate' ? 0xffd34d : 0xff4a4a, transparent: true, opacity: 0.85, depthWrite: false, side: DoubleSide,
    }));
    marker.renderOrder = 2;
    this.scene.add(marker);
    fx.marker = marker;
    fx.objects.push(marker);

    if (th.kind === 'projectile') {
      const orb = new Sprite(new SpriteMaterial({ map: this.tex.dot, color: 0x9fe6ff, transparent: true, depthWrite: false, blending: AdditiveBlending }));
      orb.scale.setScalar(0.9);
      orb.renderOrder = 6;
      this.scene.add(orb);
      fx.orb = orb;
      fx.objects.push(orb);
    }
    if (th.kind === 'ultimate') {
      const rune = new Mesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new MeshBasicMaterial({
        map: this.rune, color: 0xffd34d, transparent: true, depthWrite: false, blending: AdditiveBlending,
      }));
      rune.renderOrder = 3;
      const pillar = new Mesh(new CylinderGeometry(0.9, 0.9, 14, 24, 1, true), new MeshBasicMaterial({
        color: 0xffe8a0, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
      }));
      this.scene.add(rune, pillar);
      fx.rune = rune;
      fx.pillar = pillar;
      fx.objects.push(rune, pillar);
    }
    this.threatFx.set(th.id, fx);
  }

  startWhirl(f: Fighter, radius: number, windup: number, now: number): void {
    const tex = this.swirl.clone();
    tex.needsUpdate = true;
    const mesh = new Mesh(new CylinderGeometry(1, 0.7, 1.8, 32, 1, true), new MeshBasicMaterial({
      map: tex, color: 0xc8ffe0, transparent: true, opacity: 0.8, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
    }));
    mesh.renderOrder = 4;
    this.scene.add(mesh);
    this.whirls.push({ mesh, fighterId: f.id, start: now, end: now + windup + 0.15, radius });
  }

  endThreat(th: Threat, outcome: ThreatOutcome, sim: Sim): void {
    const fx = this.threatFx.get(th.id);
    if (fx) {
      for (const o of fx.objects) discard(o);
      this.threatFx.delete(th.id);
    }
    const a = sim.fighters.get(th.attackerId);
    const t = sim.fighters.get(th.targetId);
    if (!t) return;
    const p = this.chest(t).clone();
    switch (outcome) {
      case 'hit':
        if (th.kind === 'ultimate') {
          const bolt = new Mesh(new PlaneGeometry(1.4, 14), new MeshBasicMaterial({
            map: this.bolt, color: 0xfff6c8, transparent: true, depthWrite: false, blending: AdditiveBlending,
          }));
          bolt.rotation.x = -this.tilt;
          bolt.position.set(t.x, 7, t.z);
          this.scene.add(bolt);
          this.flashes.push({ obj: bolt, life: 0.35, max: 0.35, grow: 1 });
          this.ring(t.x, t.z, 0xffe066, 6, 0.6);
          this.burst(p, { tex: 'spark', color: 0xfff2a8, count: 24, speed: 10, life: 0.5, size: 0.9 });
        } else {
          this.burst(p, { tex: 'spark', color: th.kind === 'projectile' ? 0x9fe6ff : 0xffb347, count: 12, speed: 6, life: 0.35, size: 0.7 });
          this.ring(t.x, t.z, 0xffffff, 2.4);
        }
        break;
      case 'block':
        this.pop(p.clone().setX(p.x + (a ? Math.sign(a.x - t.x) * 0.4 : 0)), 'hex', 0x7fc4ff, 1.4, 0.3);
        this.burst(p, { tex: 'spark', color: 0xbfe6ff, count: 6, speed: 4, life: 0.25, size: 0.4 });
        break;
      case 'parry':
        this.pop(p, 'hex', 0xffd34d, 1.8, 0.4);
        this.burst(p, { tex: 'spark', color: 0xffe066, count: 16, speed: 8, life: 0.4, size: 0.6 });
        if (a) {
          this.burst(this.chest(a).clone(), { tex: 'spark', color: 0xffe066, count: 8, speed: 5, life: 0.3, size: 0.5 });
          this.ring(a.x, a.z, 0xffd34d, 2);
        }
        break;
      case 'dodge':
        this.burst(new Vector3(t.x, 0.2, t.z), { tex: 'puff', color: 0xffffff, count: 6, speed: 2, life: 0.4, size: 0.5, grow: 1.5, gravity: 0, additive: false });
        break;
      case 'cancel':
        break;
    }
  }

  /** 필살기 범위 피해를 받은 대상. */
  splash(t: Fighter): void {
    this.burst(this.chest(t).clone(), { tex: 'spark', color: 0xffe066, count: 6, speed: 5, life: 0.3, size: 0.5 });
  }

  // ───────── 매 프레임 ─────────

  update(dt: number, sim: Sim): void {
    const now = sim.time;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.visible = false;
        this.live.splice(i, 1);
        this.pool.push(p);
        continue;
      }
      const k = 1 - p.life / p.maxLife;
      p.vel.y -= p.gravity * dt;
      p.sprite.position.addScaledVector(p.vel, dt);
      p.sprite.scale.setScalar(p.size0 + (p.size1 - p.size0) * k);
      p.sprite.material.opacity = 1 - k * k;
      p.sprite.material.rotation += p.spin * dt;
    }

    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i]!;
      f.life -= dt;
      const k = 1 - Math.max(0, f.life) / f.max;
      const mat = f.obj.material as MeshBasicMaterial | SpriteMaterial;
      mat.opacity = 1 - k;
      if (f.obj instanceof Mesh && f.grow > 1.01) f.obj.scale.setScalar(0.2 + (f.grow - 0.2) * Math.sqrt(k));
      else if (f.obj instanceof Sprite) f.obj.scale.multiplyScalar(1 + dt * f.grow);
      if (f.life <= 0) {
        discard(f.obj);
        this.flashes.splice(i, 1);
      }
    }

    for (const fx of this.threatFx.values()) {
      const th = fx.threat;
      const a = sim.fighters.get(th.attackerId);
      const t = sim.fighters.get(th.targetId);
      if (!a || !t) continue;
      const k = Math.max(0, Math.min(1, (now - th.start) / (th.deadline - th.start)));
      if (fx.marker) {
        fx.marker.position.set(t.x, 0.07, t.z);
        fx.marker.scale.setScalar(1.7 - k * 1.1);
        (fx.marker.material as MeshBasicMaterial).opacity = 0.5 + 0.4 * Math.abs(Math.sin(now * (6 + k * 18)));
      }
      if (fx.orb) {
        const from = new Vector3(a.x + a.facing * 0.5, 1.0, a.z);
        const to = this.chest(t).clone();
        // 처음엔 손끝에서 모이다가 날아간다.
        const fly = Math.max(0, (k - 0.25) / 0.75);
        fx.orb.position.lerpVectors(from, to, fly * fly);
        fx.orb.position.y += Math.sin(fly * Math.PI) * 0.8;
        fx.orb.scale.setScalar(0.5 + Math.min(1, k * 4) * 0.5 + Math.sin(now * 30) * 0.06);
        if (Math.random() < 0.6) this.burst(fx.orb.position, { color: 0x9fe6ff, count: 1, speed: 0.4, life: 0.3, size: 0.35, gravity: 0, up: 0 });
      }
      if (fx.rune && fx.pillar) {
        fx.rune.position.set(t.x, 0.09, t.z);
        fx.rune.scale.setScalar(1 + k * 3);
        fx.rune.rotation.y = now * 1.5;
        fx.pillar.position.set(t.x, 7, t.z);
        fx.pillar.scale.set(0.3 + k * 0.7, 1, 0.3 + k * 0.7);
        (fx.pillar.material as MeshBasicMaterial).opacity = k * 0.35;
        if (Math.random() < 0.5) {
          this.burst(new Vector3(a.x, 1.0, a.z), { color: 0xffe066, count: 1, speed: 1.5, life: 0.4, size: 0.3, gravity: -2, up: 1 });
        }
      }
    }

    for (let i = this.whirls.length - 1; i >= 0; i--) {
      const w = this.whirls[i]!;
      const f = sim.fighters.get(w.fighterId);
      const k = (now - w.start) / (w.end - w.start);
      if (!f || !f.alive || k >= 1) {
        (w.mesh.material as MeshBasicMaterial).map?.dispose();
        discard(w.mesh);
        this.whirls.splice(i, 1);
        continue;
      }
      const r = 0.6 + (w.radius - 0.6) * Math.min(1, k * 1.2);
      w.mesh.position.set(f.x, 0.9, f.z);
      w.mesh.scale.set(r, 1 + k * 0.4, r);
      w.mesh.rotation.y = now * 14;
      const mat = w.mesh.material as MeshBasicMaterial;
      mat.opacity = 0.75 * (k > 0.85 ? (1 - k) / 0.15 : 1);
      if (mat.map) mat.map.offset.x = now * 2;
      if (Math.random() < 0.5) this.burst(new Vector3(f.x + (Math.random() - 0.5) * r * 2, 0.2, f.z + (Math.random() - 0.5) * r * 2), { tex: 'puff', color: 0xe8ffe0, count: 1, speed: 1, life: 0.4, size: 0.4, grow: 1.5, gravity: -1, additive: false });
    }

    // 철벽 방패와 필살기 준비 오라
    for (const f of sim.fighters.values()) {
      const guarding = f.alive && f.guardUntil > now;
      let s = this.shields.get(f.id);
      if (guarding && !s) {
        s = new Sprite(new SpriteMaterial({ map: this.tex.hex, color: 0x7fc4ff, transparent: true, opacity: 0.45, depthWrite: false, blending: AdditiveBlending }));
        s.renderOrder = 6;
        this.scene.add(s);
        this.shields.set(f.id, s);
      } else if (!guarding && s) {
        discard(s);
        this.shields.delete(f.id);
        s = undefined;
      }
      if (s) {
        s.position.set(f.x, 0.95, f.z);
        s.scale.setScalar(1.9 + Math.sin(now * 8) * 0.06);
      }

      if (f.alive && f.ultimateWord) {
        const acc = (this.auras.get(f.id) ?? 0) + dt;
        if (acc > 0.06) {
          this.burst(new Vector3(f.x + (Math.random() - 0.5) * 0.7, 0.2, f.z + (Math.random() - 0.5) * 0.3), {
            color: 0xffd34d, count: 1, speed: 0.3, life: 0.6, size: 0.25, gravity: -3, up: 0.5,
          });
          this.auras.set(f.id, 0);
        } else this.auras.set(f.id, acc);
      }
    }
  }
}
