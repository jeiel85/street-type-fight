// 봇 = "가상의 타자수". 타속(초당 키)·정확도·반응 시간으로 실력이 정해지고,
// 플레이어와 똑같이 sim.pressKey로 한 키씩 친다. 그래서 봇과 붙어 보면 타자 실력 차이가 그대로 드러난다.

import { ALL_JAMO_TOKENS } from '../typing/dubeolsik';
import type { Candidate } from '../typing/matcher';
import type { Fighter, Sim } from './sim';
import { BRIDGE_Z, PLAZA, STREAMS, villageOf } from './world';

export interface BotProfile {
  /** 초당 키 수. 3.3 ≈ 200타/분, 6 ≈ 360타/분. */
  kps: number;
  accuracy: number;
  /** 방어 단어가 뜨고 첫 키를 누르기까지(초). */
  reaction: number;
  defendChance: number;
  skillChance: number;
  /** 선호 교전 거리: 근접형 ≈ 1.8, 견제형 ≈ 4.5. */
  preferRange: number;
}

/** level 0(초보) ~ 1(고수). */
export function makeProfile(rng: () => number, level: number): BotProfile {
  return {
    kps: 3.0 + level * 3.2 + rng() * 0.5,
    accuracy: 0.88 + level * 0.09,
    reaction: 0.6 - level * 0.3 + rng() * 0.1,
    defendChance: 0.5 + level * 0.45,
    skillChance: 0.3 + rng() * 0.3,
    preferRange: rng() < 0.65 ? 1.8 : 4.5,
  };
}

export class BotBrain {
  private plan: { candId: string; nextAt: number } | null = null;
  private idleUntil = 0;
  private thinkAt = 0;
  private retreating = false;
  private readonly decided = new Set<number>();
  private last = { x: 0, z: 0 };
  private unstickUntil = 0;
  private unstickDir = { x: 0, z: 0 };

  constructor(readonly fighterId: string, readonly profile: BotProfile) {}

  update(sim: Sim): void {
    const f = sim.fighters.get(this.fighterId);
    if (!f) return;
    if (!f.alive || sim.winner) {
      this.plan = null;
      this.retreating = false;
      sim.setMove(f.id, 0, 0);
      return;
    }
    if (sim.time >= this.thinkAt) {
      this.thinkAt = sim.time + 0.2 + sim.rng() * 0.15;
      this.steer(sim, f);
    }
    this.type(sim, f);
  }

  // ───────── 이동 ─────────

  private steer(sim: Sim, f: Fighter): void {
    const moved = Math.hypot(f.x - this.last.x, f.z - this.last.z);
    const wasMoving = f.moveX !== 0 || f.moveZ !== 0;
    this.last = { x: f.x, z: f.z };
    if (wasMoving && moved < 0.15 && sim.time > this.unstickUntil) {
      // 집 모서리나 나무에 걸리면 잠깐 옆으로 비켜선다.
      const side = sim.rng() < 0.5 ? 1 : -1;
      this.unstickDir = { x: -f.moveZ * side, z: f.moveX * side };
      this.unstickUntil = sim.time + 0.6;
    }
    if (sim.time < this.unstickUntil) {
      sim.setMove(f.id, this.unstickDir.x, this.unstickDir.z);
      return;
    }

    const hp = f.hp / f.maxHp;
    if (!this.retreating && hp < 0.3 && sim.rng() < 0.5) this.retreating = true;
    if (this.retreating && hp > 0.85) this.retreating = false;
    const home = villageOf(f.team);
    if (this.retreating && home) return this.goTo(sim, f, home.x, home.z);

    const t = sim.target(f);
    if (t) {
      const d = sim.dist(f, t);
      const want = this.profile.preferRange;
      if (d > want + 0.6) return this.goTo(sim, f, t.x, t.z);
      if (d < want - 1.0) return this.head(sim, f, f.x - t.x, f.z - t.z);
      // 적정 거리에선 옆걸음으로 흔든다.
      const s = sim.rng() < 0.5 ? 0.5 : -0.5;
      return sim.setMove(f.id, -(t.z - f.z) * s / d, (t.x - f.x) * s / d);
    }

    let best: Fighter | null = null;
    let bd = Infinity;
    for (const e of sim.fighters.values()) {
      if (!e.alive || !sim.isEnemy(f, e) || e.team === 'neutral' || sim.inSafeZone(e)) continue;
      const d = sim.dist(f, e);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) return this.goTo(sim, f, best.x, best.z);
    this.goTo(sim, f, PLAZA.x + (sim.rng() - 0.5) * 6, PLAZA.z + (sim.rng() - 0.5) * 6);
  }

  /** 개울은 다리로만 건널 수 있으므로, 개울을 사이에 두면 가까운 다리를 경유지로 삼는다. */
  private goTo(sim: Sim, f: Fighter, gx: number, gz: number): void {
    const streams = [...STREAMS].sort((a, b) => Math.abs(f.x - a.x) - Math.abs(f.x - b.x));
    for (const s of streams) {
      const sideF = Math.sign(f.x - s.x);
      if (sideF === Math.sign(gx - s.x) || sideF === 0) continue;
      const bz = BRIDGE_Z.reduce((a, b) => (Math.abs(b - (f.z + gz) / 2) < Math.abs(a - (f.z + gz) / 2) ? b : a));
      const onBridgeLane = Math.abs(f.z - bz) < 1.0;
      const wx = onBridgeLane ? s.x - sideF * (s.hw + 1.5) : s.x + sideF * (s.hw + 1.2);
      return this.head(sim, f, wx - f.x, bz - f.z);
    }
    if (Math.hypot(gx - f.x, gz - f.z) < 0.5) return sim.setMove(f.id, 0, 0);
    this.head(sim, f, gx - f.x, gz - f.z);
  }

  private head(sim: Sim, f: Fighter, dx: number, dz: number): void {
    const d = Math.hypot(dx, dz);
    sim.setMove(f.id, d > 0 ? dx / d : 0, d > 0 ? dz / d : 0);
  }

  // ───────── 타자 ─────────

  private type(sim: Sim, f: Fighter): void {
    const p = this.profile;
    const cands = sim.candidatesFor(f);

    for (const c of cands) {
      if (c.kind !== 'defense') continue;
      const tid = Number(c.id.slice(4));
      if (this.decided.has(tid)) continue;
      this.decided.add(tid);
      const alreadyDefending = this.plan?.candId.startsWith('def:');
      if (!alreadyDefending && sim.rng() < p.defendChance) {
        this.plan = { candId: c.id, nextAt: sim.time + p.reaction * (0.8 + sim.rng() * 0.4) };
      }
    }
    if (this.decided.size > 64) {
      const live = new Set(sim.threats.map((t) => t.id));
      for (const id of this.decided) if (!live.has(id)) this.decided.delete(id);
    }

    if (this.plan && !cands.some((c) => c.id === this.plan!.candId && c.ready)) this.plan = null;
    if (!this.plan && sim.time >= this.idleUntil) {
      this.plan = this.choose(sim, f, cands);
      if (this.plan && f.lock && f.lock.candId !== this.plan.candId) sim.cancelLock(f.id);
    }
    if (!this.plan || sim.time < this.plan.nextAt) return;

    const cand = cands.find((c) => c.id === this.plan!.candId)!;
    const progress = f.lock?.candId === cand.id ? f.lock.progress : 0;
    const expected = cand.word.keys[progress]!;
    const correct = sim.rng() < p.accuracy;
    sim.pressKey(f.id, correct ? expected : this.wrongToken(sim, expected, cands));
    const interval = (1 / p.kps) * (0.55 + sim.rng() * 0.9);

    if (!correct) {
      this.plan.nextAt = sim.time + interval + 0.25; // 오타를 알아차리는 시간
    } else if (f.lock?.candId === cand.id) {
      this.plan.nextAt = sim.time + interval;
    } else {
      this.plan = null;
      this.idleUntil = sim.time + 0.05 + sim.rng() * 0.25;
    }
  }

  private choose(sim: Sim, f: Fighter, cands: Candidate[]): { candId: string; nextAt: number } | null {
    const ready = (id: string) => cands.some((c) => c.id === id && c.ready);
    const start = (candId: string) => ({ candId, nextAt: sim.time + 0.08 + sim.rng() * 0.15 });
    if (ready('ult')) return start('ult');

    if (sim.rng() < this.profile.skillChance) {
      const t = sim.target(f);
      const d = t ? sim.dist(f, t) : Infinity;
      const near = sim.enemiesInRange(f, 3.4, false).length;
      const hunted = [...sim.fighters.values()].some((e) => e.alive && e.targetId === f.id && sim.isEnemy(f, e));
      const options = f.skills
        .map((s, i) => ({ s, id: `skill:${i}` }))
        .filter(({ s, id }) => {
          if (!ready(id)) return false;
          switch (s.def.id) {
            case 'jangpung': return d > 3;
            case 'kick': return d <= 5;
            case 'wall': return hunted && f.hp < f.maxHp * 0.6;
            case 'whirl': return near >= 2 || (near === 1 && sim.rng() < 0.25);
            default: return true;
          }
        });
      const pick = options[Math.floor(sim.rng() * options.length)];
      if (pick) return start(pick.id);
    }
    return ready('atk') ? start('atk') : null;
  }

  /** 오타는 다른 후보의 첫 키와 겹치지 않게 골라, 엉뚱한 단어를 잠그는 일이 없게 한다. */
  private wrongToken(sim: Sim, expected: string, cands: Candidate[]): string {
    const firsts = new Set(cands.map((c) => c.word.keys[0]));
    const pool = ALL_JAMO_TOKENS.filter((t) => t !== expected && !firsts.has(t));
    return pool[Math.floor(sim.rng() * pool.length)] ?? expected;
  }
}
