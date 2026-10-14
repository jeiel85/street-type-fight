// 전투 시뮬레이션. 렌더링·DOM과 분리되어 있어 나중에 권위 서버에서 그대로 돌릴 수 있다.
// 입력은 "누가 어떤 키 토큰을 눌렀나"와 "이동 방향"뿐이다. 플레이어와 봇이 같은 입력 경로를 쓴다.

import { CONFIG } from '../config';
import { makeWord, type Word } from '../typing/hangul';
import { pressKey as matchKey, type Candidate, type LockState } from '../typing/matcher';
import { NOUN_WORDS, PROVERB_WORDS, pickWord } from '../typing/words';
import { mulberry32 } from './rng';
import { BRAWLER_KIT, type SkillDef, type SkillShape } from './skills';
import { BOUNDS, SOLID_BOXES, SOLID_CIRCLES, safeZoneAt, villageOf, type Team } from './world';

export type { Team } from './world';

export type AnimState =
  | 'idle' | 'walk' | 'jab' | 'finisher' | 'cast' | 'dash' | 'whirl' | 'guard' | 'hit' | 'block' | 'fumble' | 'ko';

export type TargetStrategy = 'nearest' | 'revenge' | 'finish';

export interface FighterStats {
  correct: number;
  wrong: number;
  kos: number;
  deaths: number;
  blocks: number;
  parries: number;
  hitsTaken: number;
  damageDealt: number;
  maxCombo: number;
}

export interface Fighter {
  readonly id: string;
  readonly name: string;
  readonly team: Team;
  readonly isBot: boolean;
  readonly isDummy: boolean;
  readonly look: number;
  x: number;
  z: number;
  prevX: number;
  prevZ: number;
  vx: number;
  vz: number;
  facing: 1 | -1;
  moving: boolean;
  hp: number;
  readonly maxHp: number;
  alive: boolean;
  respawnAt: number;
  readonly spawn: { x: number; z: number };
  moveX: number;
  moveZ: number;
  targetId: string | null;
  manualTarget: boolean;
  strategy: TargetStrategy;
  attackWord: Word;
  readonly skills: { def: SkillDef; readyAt: number }[];
  ultimateWord: Word | null;
  gauge: number;
  combo: number;
  lock: LockState | null;
  fumbleUntil: number;
  guardUntil: number;
  anim: AnimState;
  animAt: number;
  jabSide: 0 | 1;
  dash: { fromX: number; fromZ: number; toX: number; toZ: number; start: number; end: number } | null;
  lastHitBy: string | null;
  lastHitAt: number;
  readonly stats: FighterStats;
}

export interface Threat {
  readonly id: number;
  readonly attackerId: string;
  readonly targetId: string;
  readonly kind: SkillShape | 'ultimate';
  readonly skillId: string;
  readonly word: Word;
  readonly start: number;
  readonly deadline: number;
  readonly damage: number;
  readonly knock: number;
  readonly radius: number;
}

export type ThreatOutcome = 'hit' | 'block' | 'parry' | 'dodge' | 'cancel';

export type SimEvent =
  | { t: 'key'; id: string; kind: Candidate['kind'] }
  | { t: 'jab'; attacker: string; target: string; dmg: number; close: boolean; guarded: boolean }
  | { t: 'whiff'; id: string }
  | { t: 'finisher'; attacker: string; target: string; dmg: number }
  | { t: 'fumble'; id: string; expected: string | null }
  | { t: 'reject'; id: string }
  | { t: 'notReady'; id: string; reason: string }
  | { t: 'guard'; id: string }
  | { t: 'cast'; id: string; skillId: string; kind: SkillShape | 'ultimate'; threatIds: number[] }
  | { t: 'threat'; threat: Threat }
  | { t: 'resolve'; threat: Threat; outcome: ThreatOutcome; dmg: number }
  | { t: 'splash'; attacker: string; target: string; dmg: number }
  | { t: 'ultimateReady'; id: string }
  | { t: 'ko'; victim: string; killer: string | null }
  | { t: 'respawn'; id: string }
  | { t: 'matchEnd'; winner: Team };

export interface FighterInit {
  id: string;
  name: string;
  team: Team;
  isBot?: boolean;
  isDummy?: boolean;
  look?: number;
  spawn: { x: number; z: number };
  strategy?: TargetStrategy;
}

const ANIM_DURATION: Partial<Record<AnimState, number>> = {
  jab: 0.14, finisher: 0.3, cast: 0.5, guard: 0.5, hit: 0.3, block: 0.3, fumble: 0.3, whirl: 0.6, dash: 0.6,
};

export class Sim {
  time = 0;
  readonly fighters = new Map<string, Fighter>();
  readonly threats: Threat[] = [];
  readonly score: Record<'blue' | 'red', number> = { blue: 0, red: 0 };
  winner: Team | null = null;
  readonly rng: () => number;
  private events: SimEvent[] = [];
  private nextThreatId = 1;
  private readonly rngObj: { next: () => number };

  constructor(seed: number) {
    this.rng = mulberry32(seed);
    this.rngObj = { next: this.rng };
  }

  // ───────── 입력 ─────────

  addFighter(init: FighterInit): Fighter {
    const f: Fighter = {
      id: init.id,
      name: init.name,
      team: init.team,
      isBot: init.isBot ?? false,
      isDummy: init.isDummy ?? false,
      look: init.look ?? 0,
      x: init.spawn.x,
      z: init.spawn.z,
      prevX: init.spawn.x,
      prevZ: init.spawn.z,
      vx: 0,
      vz: 0,
      facing: init.team === 'red' ? -1 : 1,
      moving: false,
      hp: CONFIG.fighter.maxHp,
      maxHp: CONFIG.fighter.maxHp,
      alive: true,
      respawnAt: 0,
      spawn: { ...init.spawn },
      moveX: 0,
      moveZ: 0,
      targetId: null,
      manualTarget: false,
      strategy: init.strategy ?? 'nearest',
      attackWord: makeWord('가'),
      skills: init.isDummy ? [] : BRAWLER_KIT.map((def) => ({ def, readyAt: 0 })),
      ultimateWord: null,
      gauge: 0,
      combo: 0,
      lock: null,
      fumbleUntil: 0,
      guardUntil: 0,
      anim: 'idle',
      animAt: 0,
      jabSide: 0,
      dash: null,
      lastHitBy: null,
      lastHitAt: -999,
      stats: { correct: 0, wrong: 0, kos: 0, deaths: 0, blocks: 0, parries: 0, hitsTaken: 0, damageDealt: 0, maxCombo: 0 },
    };
    this.fighters.set(f.id, f);
    if (!f.isDummy) f.attackWord = this.newAttackWord(f);
    return f;
  }

  setMove(id: string, x: number, z: number): void {
    const f = this.fighters.get(id);
    if (!f) return;
    const len = Math.hypot(x, z);
    f.moveX = len > 1 ? x / len : x;
    f.moveZ = len > 1 ? z / len : z;
  }

  setStrategy(id: string, s: TargetStrategy): void {
    const f = this.fighters.get(id);
    if (!f) return;
    f.strategy = s;
    f.manualTarget = false;
    f.targetId = this.pickTarget(f);
  }

  /** Tab: 교전 거리 안의 적을 가까운 순으로 돌아가며 지정. */
  cycleTarget(id: string): void {
    const f = this.fighters.get(id);
    if (!f || !f.alive) return;
    const list = this.enemiesInRange(f, CONFIG.combat.engageRange, true).sort((a, b) => this.dist(f, a) - this.dist(f, b));
    if (list.length === 0) return;
    const idx = list.findIndex((e) => e.id === f.targetId);
    f.targetId = list[(idx + 1) % list.length]!.id;
    f.manualTarget = true;
    if (f.lock?.candId === 'atk') f.lock = null;
  }

  cancelLock(id: string): void {
    const f = this.fighters.get(id);
    if (f) f.lock = null;
  }

  pressKey(id: string, token: string): void {
    const f = this.fighters.get(id);
    if (!f || !f.alive || f.isDummy || this.winner) return;
    const cands = this.candidatesFor(f);
    const { lock, result } = matchKey(f.lock, cands, token);
    f.lock = lock;

    switch (result.type) {
      case 'progress':
        this.onCorrectKey(f);
        this.emit({ t: 'key', id, kind: result.cand.kind });
        if (result.cand.kind === 'attack') this.jab(f);
        break;
      case 'complete':
        this.onCorrectKey(f);
        this.emit({ t: 'key', id, kind: result.cand.kind });
        this.complete(f, result.cand);
        break;
      case 'notReady':
        this.emit({ t: 'notReady', id, reason: result.cand.reason ?? '준비 안 됨' });
        break;
      case 'fumble':
        f.stats.wrong++;
        // 유예는 벌칙을 준 첫 오타 기준으로만 잡는다(연타로 유예가 끝없이 늘어나지 않게).
        if (this.time >= f.fumbleUntil) {
          f.combo = 0;
          this.addGauge(f, CONFIG.gauge.fumble);
          this.setAnim(f, 'fumble');
          this.emit({ t: 'fumble', id, expected: result.expected });
          f.fumbleUntil = this.time + CONFIG.combat.fumbleWindow;
        } else {
          this.emit({ t: 'reject', id });
        }
        break;
    }
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ───────── 질의 ─────────

  /** 지금 이 파이터가 칠 수 있는(또는 첫 키가 예약된) 모든 단어. */
  candidatesFor(f: Fighter): Candidate[] {
    const out: Candidate[] = [];
    if (f.isDummy) return out;
    for (const th of this.threats) {
      if (th.targetId === f.id) out.push({ id: `def:${th.id}`, kind: 'defense', word: th.word, ready: true });
    }
    if (f.ultimateWord) {
      const why = this.targetProblem(f, CONFIG.ultimate.range);
      out.push({ id: 'ult', kind: 'ultimate', word: f.ultimateWord, ready: !why, reason: why ?? undefined });
    }
    f.skills.forEach((s, i) => {
      const why = this.time < s.readyAt ? '쿨타임' : this.skillProblem(f, s.def);
      out.push({ id: `skill:${i}`, kind: 'skill', word: s.def.word, ready: !why, reason: why ?? undefined });
    });
    const why = this.targetProblem(f, CONFIG.combat.engageRange);
    out.push({ id: 'atk', kind: 'attack', word: f.attackWord, ready: !why, reason: why ?? undefined });
    return out;
  }

  target(f: Fighter): Fighter | null {
    const t = f.targetId ? this.fighters.get(f.targetId) : undefined;
    return t && t.alive ? t : null;
  }

  dist(a: { x: number; z: number }, b: { x: number; z: number }): number {
    return Math.hypot(a.x - b.x, a.z - b.z);
  }

  isEnemy(a: Fighter, b: Fighter): boolean {
    return a.id !== b.id && a.team !== b.team;
  }

  inSafeZone(f: Fighter): boolean {
    return safeZoneAt(f.x, f.z) !== null;
  }

  enemiesInRange(f: Fighter, range: number, includeNeutral: boolean): Fighter[] {
    const out: Fighter[] = [];
    for (const e of this.fighters.values()) {
      if (!e.alive || !this.isEnemy(f, e)) continue;
      if (!includeNeutral && e.team === 'neutral') continue;
      if (this.inSafeZone(e)) continue;
      if (this.dist(f, e) <= range) out.push(e);
    }
    return out;
  }

  // ───────── 진행 ─────────

  step(dt: number): void {
    this.time += dt;
    for (const f of this.fighters.values()) {
      f.prevX = f.x;
      f.prevZ = f.z;
      if (!f.alive) {
        if (this.time >= f.respawnAt) this.respawn(f);
        continue;
      }
      this.updateTarget(f);
      this.move(f, dt);
      if (this.inSafeZone(f) && f.hp < f.maxHp) f.hp = Math.min(f.maxHp, f.hp + CONFIG.combat.safeZoneHealPerSec * dt);
      // 허수아비는 3초간 안 맞으면 빠르게 회복해 연습을 이어 갈 수 있다.
      if (f.isDummy && this.time - f.lastHitAt > 3) f.hp = Math.min(f.maxHp, f.hp + 60 * dt);
      this.settleAnim(f);
    }
    this.separate();
    this.resolveThreats();
  }

  // ───────── 내부: 타자 결과 ─────────

  private onCorrectKey(f: Fighter): void {
    f.stats.correct++;
    f.combo++;
    f.stats.maxCombo = Math.max(f.stats.maxCombo, f.combo);
    this.addGauge(f, CONFIG.gauge.perKey);
  }

  private addGauge(f: Fighter, amount: number): void {
    if (f.ultimateWord) return; // 필살기를 쓸 때까지 게이지는 가득 찬 상태로 고정
    f.gauge = Math.max(0, Math.min(CONFIG.gauge.max, f.gauge + amount));
    if (f.gauge >= CONFIG.gauge.max) {
      f.ultimateWord = pickWord(this.rngObj, PROVERB_WORDS, 0, 999, this.reservedKeys(f, 'ult'));
      if (f.ultimateWord) this.emit({ t: 'ultimateReady', id: f.id });
    }
  }

  private comboMult(f: Fighter): number {
    const c = CONFIG.combat;
    return 1 + (Math.min(f.combo, c.comboCap) / c.comboCap) * c.comboMaxBonus;
  }

  private jab(f: Fighter): void {
    const t = this.target(f);
    f.jabSide = f.jabSide === 0 ? 1 : 0;
    this.setAnim(f, 'jab');
    if (!t) {
      this.emit({ t: 'whiff', id: f.id });
      return;
    }
    const close = this.dist(f, t) <= CONFIG.combat.meleeRange;
    const guarded = t.guardUntil > this.time;
    const dmg = guarded ? 0 : CONFIG.combat.jabDamage * this.comboMult(f) * (close ? CONFIG.combat.closeBonus : 1);
    this.emit({ t: 'jab', attacker: f.id, target: t.id, dmg, close, guarded });
    if (dmg > 0) {
      this.knockFrom(t, f, CONFIG.combat.jabKnock);
      this.damage(t, dmg, f);
    }
  }

  private complete(f: Fighter, cand: Candidate): void {
    if (cand.kind === 'attack') return this.finisher(f);
    if (cand.kind === 'defense') return this.defend(f, Number(cand.id.slice(4)));
    if (cand.kind === 'ultimate') return this.castUltimate(f);
    const slot = f.skills[Number(cand.id.slice(6))];
    if (slot) this.castSkill(f, slot);
  }

  private finisher(f: Fighter): void {
    const t = this.target(f);
    const word = f.attackWord;
    f.attackWord = this.newAttackWord(f, word.text);
    this.setAnim(f, 'finisher');
    if (!t) return;
    const c = CONFIG.combat;
    const close = this.dist(f, t) <= c.meleeRange;
    let dmg = (c.finisherBase + c.finisherPerKey * word.keys.length) * this.comboMult(f) * (close ? c.closeBonus : 1);
    if (t.guardUntil > this.time) dmg *= c.guardSkillReduction;
    this.addGauge(f, CONFIG.gauge.finisher);
    this.emit({ t: 'finisher', attacker: f.id, target: t.id, dmg });
    this.knockFrom(t, f, c.finisherKnock);
    this.setAnim(t, 'hit');
    this.damage(t, dmg, f);
  }

  private castSkill(f: Fighter, slot: { def: SkillDef; readyAt: number }): void {
    const def = slot.def;
    slot.readyAt = this.time + def.cooldown;
    const threatIds: number[] = [];

    if (def.shape === 'guard') {
      f.guardUntil = this.time + def.guardDuration;
      this.setAnim(f, 'guard');
      this.emit({ t: 'guard', id: f.id });
      this.emit({ t: 'cast', id: f.id, skillId: def.id, kind: def.shape, threatIds });
      return;
    }

    const targets = def.shape === 'aoe' ? this.enemiesInRange(f, def.radius, true) : [this.target(f)!];
    for (const t of targets) {
      threatIds.push(this.createThreat(f, t, def.shape, def.id, def.windup, def.damage, def.knock, def.radius, def.defenseKeys).id);
    }
    if (def.shape === 'dash') {
      const t = targets[0]!;
      const d = Math.max(0.001, this.dist(f, t));
      const stop = Math.max(0, d - 1.1);
      f.dash = {
        fromX: f.x, fromZ: f.z,
        toX: f.x + ((t.x - f.x) / d) * stop, toZ: f.z + ((t.z - f.z) / d) * stop,
        start: this.time, end: this.time + Math.min(0.35, def.windup * 0.5),
      };
    }
    this.setAnim(f, def.shape === 'aoe' ? 'whirl' : def.shape === 'dash' ? 'dash' : 'cast');
    this.emit({ t: 'cast', id: f.id, skillId: def.id, kind: def.shape, threatIds });
  }

  private castUltimate(f: Fighter): void {
    const t = this.target(f)!;
    const u = CONFIG.ultimate;
    f.ultimateWord = null;
    f.gauge = 0;
    const th = this.createThreat(f, t, 'ultimate', 'ultimate', u.windup, u.damage, u.knock, u.splashRadius, u.defenseKeys);
    this.setAnim(f, 'cast');
    this.emit({ t: 'cast', id: f.id, skillId: 'ultimate', kind: 'ultimate', threatIds: [th.id] });
  }

  private createThreat(
    f: Fighter, t: Fighter, kind: Threat['kind'], skillId: string,
    windup: number, damage: number, knock: number, radius: number, keys: readonly [number, number],
  ): Threat {
    const word = pickWord(this.rngObj, NOUN_WORDS, keys[0], keys[1], this.reservedKeys(t)) ?? makeWord('막');
    const th: Threat = {
      id: this.nextThreatId++, attackerId: f.id, targetId: t.id, kind, skillId, word,
      start: this.time, deadline: this.time + windup, damage, knock, radius,
    };
    this.threats.push(th);
    this.emit({ t: 'threat', threat: th });
    return th;
  }

  private defend(f: Fighter, threatId: number): void {
    const i = this.threats.findIndex((th) => th.id === threatId);
    if (i < 0) return;
    const th = this.threats[i]!;
    this.threats.splice(i, 1);
    if (this.inSafeZone(f)) {
      // 마을에서는 싸움이 없다: 반격 피해 없이 그 공격을 없던 일로 한다.
      this.emit({ t: 'resolve', threat: th, outcome: 'cancel', dmg: 0 });
      return;
    }
    const remaining = (th.deadline - this.time) / (th.deadline - th.start);
    const attacker = this.fighters.get(th.attackerId);
    if (remaining >= CONFIG.combat.parryRatio && attacker?.alive) {
      f.stats.parries++;
      this.addGauge(f, CONFIG.gauge.parry);
      const dmg = th.damage * CONFIG.combat.parryReflect;
      attacker.lock = null;
      attacker.combo = 0;
      this.setAnim(f, 'block');
      this.setAnim(attacker, 'hit');
      this.knockFrom(attacker, f, th.knock * 0.5);
      this.emit({ t: 'resolve', threat: th, outcome: 'parry', dmg });
      this.damage(attacker, dmg, f);
    } else {
      f.stats.blocks++;
      this.addGauge(f, CONFIG.gauge.block);
      this.setAnim(f, 'block');
      this.emit({ t: 'resolve', threat: th, outcome: 'block', dmg: 0 });
    }
  }

  private resolveThreats(): void {
    // 착탄 피해로 KO가 나면 ko()가 관련 위협을 목록에서 지우므로, 미리 뽑아 둔 목록을 돌며 남아 있는지 확인한다.
    const due = this.threats.filter((th) => this.time >= th.deadline);
    for (const th of due) {
      const i = this.threats.indexOf(th);
      if (i < 0) continue;
      this.threats.splice(i, 1);
      const a = this.fighters.get(th.attackerId);
      const t = this.fighters.get(th.targetId);
      if (!a || !t || !a.alive || !t.alive || this.inSafeZone(t)) {
        this.emit({ t: 'resolve', threat: th, outcome: 'cancel', dmg: 0 });
        continue;
      }
      if (th.kind === 'aoe' && this.dist(a, t) > th.radius * CONFIG.combat.aoeDodgeSlack) {
        this.emit({ t: 'resolve', threat: th, outcome: 'dodge', dmg: 0 });
        continue;
      }
      const dmg = th.damage * (t.guardUntil > this.time ? CONFIG.combat.guardSkillReduction : 1);
      t.combo = 0;
      t.stats.hitsTaken++;
      this.setAnim(t, 'hit');
      this.knockFrom(t, a, th.knock);
      this.emit({ t: 'resolve', threat: th, outcome: 'hit', dmg });
      this.damage(t, dmg, a);
      if (th.kind === 'ultimate') this.splash(a, t, th.radius);
    }
  }

  private splash(a: Fighter, center: Fighter, radius: number): void {
    for (const e of this.fighters.values()) {
      if (e === center || !e.alive || !this.isEnemy(a, e) || this.inSafeZone(e)) continue;
      if (this.dist(center, e) > radius) continue;
      const dmg = CONFIG.ultimate.splashDamage;
      this.knockFrom(e, center, CONFIG.ultimate.knock * 0.5);
      this.setAnim(e, 'hit');
      this.emit({ t: 'splash', attacker: a.id, target: e.id, dmg });
      this.damage(e, dmg, a);
    }
  }

  private damage(t: Fighter, dmg: number, src: Fighter): void {
    if (!t.alive || dmg <= 0) return;
    t.hp -= dmg;
    t.lastHitBy = src.id;
    t.lastHitAt = this.time;
    src.stats.damageDealt += dmg;
    if (t.hp <= 0) this.ko(t, src);
  }

  private ko(t: Fighter, killer: Fighter | null): void {
    t.hp = 0;
    t.alive = false;
    t.respawnAt = this.time + (t.isDummy ? CONFIG.combat.dummyRespawnDelay : CONFIG.combat.respawnDelay);
    t.lock = null;
    t.combo = 0;
    t.gauge = 0;
    t.ultimateWord = null;
    t.dash = null;
    t.anim = 'ko';
    t.animAt = this.time;
    t.stats.deaths++;
    for (let i = this.threats.length - 1; i >= 0; i--) {
      const th = this.threats[i]!;
      if (th.attackerId === t.id || th.targetId === t.id) {
        this.threats.splice(i, 1);
        this.emit({ t: 'resolve', threat: th, outcome: 'cancel', dmg: 0 });
      }
    }
    if (killer && !t.isDummy) {
      killer.stats.kos++;
      if (killer.team !== 'neutral' && killer.team !== t.team) this.score[killer.team]++;
    }
    this.emit({ t: 'ko', victim: t.id, killer: killer?.id ?? null });
    for (const team of ['blue', 'red'] as const) {
      if (!this.winner && this.score[team] >= CONFIG.match.killsToWin) {
        this.winner = team;
        for (const th of this.threats.splice(0)) this.emit({ t: 'resolve', threat: th, outcome: 'cancel', dmg: 0 });
        this.emit({ t: 'matchEnd', winner: team });
      }
    }
  }

  private respawn(f: Fighter): void {
    f.alive = true;
    f.hp = f.maxHp;
    f.x = f.prevX = f.spawn.x;
    f.z = f.prevZ = f.spawn.z;
    f.vx = f.vz = 0;
    f.targetId = null;
    f.manualTarget = false;
    f.lastHitBy = null;
    f.anim = 'idle';
    f.animAt = this.time;
    this.emit({ t: 'respawn', id: f.id });
  }

  // ───────── 내부: 대상·이동 ─────────

  private targetProblem(f: Fighter, range: number): string | null {
    const t = this.target(f);
    if (!t) return '대상 없음';
    if (this.inSafeZone(f) || this.inSafeZone(t)) return '안전지대';
    if (this.dist(f, t) > range) return '사거리 밖';
    return null;
  }

  private skillProblem(f: Fighter, def: SkillDef): string | null {
    if (def.shape === 'guard') return null;
    if (def.shape === 'aoe') {
      if (this.inSafeZone(f)) return '안전지대';
      return this.enemiesInRange(f, def.radius, true).length > 0 ? null : '주변에 적 없음';
    }
    return this.targetProblem(f, def.range);
  }

  private updateTarget(f: Fighter): void {
    if (f.isDummy) return;
    const t = this.target(f);
    const valid = t && !this.inSafeZone(t) && this.dist(f, t) <= CONFIG.combat.engageRange * 1.25;
    if (valid) return;
    f.manualTarget = false;
    const next = this.pickTarget(f);
    if (next !== f.targetId && f.lock?.candId === 'atk') f.lock = null;
    f.targetId = next;
  }

  /** 테트리스 99의 공격 대상 전략을 빌려 왔다: 가까운 적 / 나를 노리는 적 / 빈사 상태의 적. */
  private pickTarget(f: Fighter): string | null {
    const range = CONFIG.combat.engageRange;
    // 진짜 적이 있으면 허수아비보다 우선한다. 봇은 허수아비를 노리지 않는다.
    let pool = this.enemiesInRange(f, range, false);
    if (pool.length === 0 && !f.isBot) pool = this.enemiesInRange(f, range, true);
    if (pool.length === 0) return null;
    const byDist = (a: Fighter, b: Fighter) => this.dist(f, a) - this.dist(f, b);
    if (f.strategy === 'revenge') {
      const hunters = pool.filter((e) => e.targetId === f.id).sort(byDist);
      if (hunters[0]) return hunters[0].id;
    } else if (f.strategy === 'finish') {
      return [...pool].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || byDist(a, b))[0]!.id;
    }
    return pool.sort(byDist)[0]!.id;
  }

  private move(f: Fighter, dt: number): void {
    if (f.isDummy) return;
    const fc = CONFIG.fighter;
    let mx = f.moveX * fc.moveSpeed;
    let mz = f.moveZ * fc.moveSpeed;
    const t = this.target(f);

    if (f.dash) {
      const k = Math.min(1, (this.time - f.dash.start) / (f.dash.end - f.dash.start));
      f.x = f.dash.fromX + (f.dash.toX - f.dash.fromX) * k;
      f.z = f.dash.fromZ + (f.dash.toZ - f.dash.fromZ) * k;
      if (k >= 1) f.dash = null;
      mx = mz = 0;
    } else if (mx === 0 && mz === 0 && t && f.lock && (f.lock.candId === 'atk' || f.lock.candId === 'ult')) {
      // 공격 단어를 치는 동안엔 손을 방향키로 옮기지 않아도 대상에게 밀고 들어간다.
      const d = this.dist(f, t);
      if (d > CONFIG.combat.meleeRange * 0.8 && !this.inSafeZone(t)) {
        mx = ((t.x - f.x) / d) * fc.advanceSpeed;
        mz = ((t.z - f.z) / d) * fc.advanceSpeed;
      }
    }

    const decay = Math.exp(-fc.knockFriction * dt);
    f.vx *= decay;
    f.vz *= decay;
    f.x += (mx + f.vx) * dt;
    f.z += (mz + f.vz) * dt;
    f.moving = mx !== 0 || mz !== 0;

    if (t && this.dist(f, t) <= CONFIG.combat.engageRange) f.facing = t.x >= f.x ? 1 : -1;
    else if (Math.abs(mx) > 0.01) f.facing = mx > 0 ? 1 : -1;

    this.collideStatic(f);
  }

  private collideStatic(f: Fighter): void {
    const r = CONFIG.fighter.radius;
    for (const b of SOLID_BOXES) {
      const dx = f.x - b.x;
      const dz = f.z - b.z;
      const px = b.hw + r - Math.abs(dx);
      const pz = b.hd + r - Math.abs(dz);
      if (px <= 0 || pz <= 0) continue;
      if (px < pz) f.x += Math.sign(dx || 1) * px;
      else f.z += Math.sign(dz || 1) * pz;
    }
    for (const c of SOLID_CIRCLES) {
      const dx = f.x - c.x;
      const dz = f.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + r;
      if (d >= min || d === 0) continue;
      f.x = c.x + (dx / d) * min;
      f.z = c.z + (dz / d) * min;
    }
    f.x = Math.max(BOUNDS.minX + 2, Math.min(BOUNDS.maxX - 2, f.x));
    f.z = Math.max(BOUNDS.minZ + 2, Math.min(BOUNDS.maxZ - 2, f.z));
  }

  private separate(): void {
    const list = [...this.fighters.values()].filter((f) => f.alive);
    const min = CONFIG.fighter.radius * 2;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d >= min || d === 0) continue;
        const push = (min - d) / 2;
        const wa = a.isDummy ? 0 : b.isDummy ? 2 : 1;
        const wb = b.isDummy ? 0 : a.isDummy ? 2 : 1;
        a.x -= (dx / d) * push * wa;
        a.z -= (dz / d) * push * wa;
        b.x += (dx / d) * push * wb;
        b.z += (dz / d) * push * wb;
      }
    }
  }

  private knockFrom(t: Fighter, src: { x: number; z: number }, power: number): void {
    if (t.isDummy) return;
    const d = Math.max(0.001, this.dist(t, src));
    t.vx += ((t.x - src.x) / d) * power;
    t.vz += ((t.z - src.z) / d) * power;
  }

  private setAnim(f: Fighter, a: AnimState): void {
    if (!f.alive) return;
    f.anim = a;
    f.animAt = this.time;
  }

  private settleAnim(f: Fighter): void {
    if (f.anim === 'ko') return;
    const dur = ANIM_DURATION[f.anim];
    if (dur !== undefined && this.time - f.animAt < dur) return;
    if (f.dash) return;
    const next: AnimState = f.guardUntil > this.time ? 'guard' : f.moving ? 'walk' : 'idle';
    if (f.anim !== next) {
      f.anim = next;
      f.animAt = this.time;
    }
  }

  // ───────── 내부: 단어 ─────────

  /** 이 파이터에게 지금 떠 있는 모든 후보의 첫 키(skip 후보는 제외). 새 단어가 이 키들을 피한다. */
  private reservedKeys(f: Fighter, skip?: string): Set<string> {
    const s = new Set<string>();
    for (const c of this.candidatesFor(f)) {
      if (c.id !== skip) s.add(c.word.keys[0]!);
    }
    return s;
  }

  private newAttackWord(f: Fighter, avoid?: string): Word {
    const [min, max] = CONFIG.combat.attackKeys;
    return pickWord(this.rngObj, NOUN_WORDS, min, max, this.reservedKeys(f, 'atk'), avoid) ?? makeWord('가');
  }

  private emit(e: SimEvent): void {
    this.events.push(e);
  }
}

export function spawnPoint(team: Team, rng: () => number): { x: number; z: number } {
  const v = villageOf(team);
  if (!v) return { x: 0, z: 0 };
  const a = rng() * Math.PI * 2;
  const r = 1 + rng() * 2.5;
  return { x: v.x + Math.cos(a) * r, z: v.z + Math.sin(a) * r };
}
