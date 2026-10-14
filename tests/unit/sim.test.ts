import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config';
import { BotBrain, makeProfile } from '../../src/sim/bot';
import { Sim, spawnPoint, type Fighter } from '../../src/sim/sim';
import type { Word } from '../../src/typing/hangul';

const DT = 1 / 60;

function duel(seed = 1) {
  const sim = new Sim(seed);
  const a = sim.addFighter({ id: 'a', name: 'A', team: 'blue', spawn: { x: 0, z: 0 } });
  const b = sim.addFighter({ id: 'b', name: 'B', team: 'red', spawn: { x: 2, z: 0 } });
  sim.step(DT); // 대상 자동 지정
  return { sim, a, b };
}

function type(sim: Sim, f: Fighter, word: Word, upTo = word.keys.length) {
  for (const k of word.keys.slice(0, upTo)) sim.pressKey(f.id, k);
}

function run(sim: Sim, seconds: number) {
  for (let t = 0; t < seconds; t += DT) sim.step(DT);
}

function defenseWord(sim: Sim, f: Fighter): Word {
  const c = sim.candidatesFor(f).find((c) => c.kind === 'defense');
  if (!c) throw new Error('방어 단어 없음');
  return c.word;
}

const skill = (f: Fighter, id: string) => f.skills.find((s) => s.def.id === id)!.def.word;

describe('Sim 공격', () => {
  it('공격 단어의 키마다 잽, 끝 글자에 마무리 강타가 들어가고 새 단어가 뜬다', () => {
    const { sim, a, b } = duel();
    const word = a.attackWord;
    type(sim, a, word, word.keys.length - 1);
    const afterJabs = b.hp;
    expect(afterJabs).toBeLessThan(CONFIG.fighter.maxHp);
    sim.pressKey('a', word.keys.at(-1)!);
    expect(b.hp).toBeLessThan(afterJabs - CONFIG.combat.finisherBase);
    expect(a.attackWord.text).not.toBe(word.text);
    expect(a.combo).toBe(word.keys.length);
  });

  it('스킬 첫 키와 공격 단어 첫 키는 겹치지 않는다', () => {
    const { a } = duel();
    const skillFirsts = a.skills.map((s) => s.def.word.keys[0]);
    expect(skillFirsts).not.toContain(a.attackWord.keys[0]);
  });

  it('오타는 콤보를 끊고, 직후의 연속 오타는 추가 벌칙 없이 무시한다', () => {
    const { sim, a } = duel();
    type(sim, a, a.attackWord, 2);
    sim.drainEvents();
    const expected = a.attackWord.keys[2]!;
    const wrong = expected === 'ㅋ' ? 'ㅌ' : 'ㅋ';
    sim.pressKey('a', wrong);
    sim.pressKey('a', wrong);
    const ev = sim.drainEvents().map((e) => e.t);
    expect(ev).toEqual(['fumble', 'reject']);
    expect(a.combo).toBe(0);
    expect(a.lock).toEqual({ candId: 'atk', progress: 2 });
    expect(a.stats.wrong).toBe(2);
  });

  it('안전지대 안에서는 공격할 수 없다', () => {
    const sim = new Sim(3);
    const a = sim.addFighter({ id: 'a', name: 'A', team: 'blue', spawn: { x: -30, z: 0 } });
    sim.addFighter({ id: 'b', name: 'B', team: 'red', spawn: { x: -28, z: 0 } });
    sim.step(DT);
    expect(a.targetId).toBeNull();
    const atk = sim.candidatesFor(a).find((c) => c.id === 'atk')!;
    expect(atk.ready).toBe(false);
  });
});

describe('Sim 스킬과 방어', () => {
  it('방어하지 않으면 착탄 시각에 스킬 피해를 받는다', () => {
    const { sim, a, b } = duel();
    type(sim, a, skill(a, 'jangpung'));
    expect(sim.threats).toHaveLength(1);
    run(sim, 1.3);
    expect(b.hp).toBe(CONFIG.fighter.maxHp);
    run(sim, 0.2);
    expect(b.hp).toBeCloseTo(CONFIG.fighter.maxHp - 14, 5);
  });

  it('빨리 막으면 반격(패리)이 되어 공격자가 피해를 되돌려 받는다', () => {
    const { sim, a, b } = duel();
    type(sim, a, skill(a, 'jangpung'));
    type(sim, b, defenseWord(sim, b));
    expect(sim.threats).toHaveLength(0);
    expect(b.stats.parries).toBe(1);
    expect(a.hp).toBeCloseTo(CONFIG.fighter.maxHp - 14 * CONFIG.combat.parryReflect, 5);
    expect(b.hp).toBe(CONFIG.fighter.maxHp);
  });

  it('늦게 막으면 반격 없이 피해만 막는다', () => {
    const { sim, a, b } = duel();
    type(sim, a, skill(a, 'jangpung'));
    run(sim, 1.0); // 1.4초 중 1.0초 경과 → 남은 비율 0.29 < 0.4
    type(sim, b, defenseWord(sim, b));
    run(sim, 1);
    expect(b.stats.blocks).toBe(1);
    expect(b.stats.parries).toBe(0);
    expect(b.hp).toBe(CONFIG.fighter.maxHp);
    expect(a.hp).toBe(CONFIG.fighter.maxHp);
  });

  it('방어 단어의 첫 키는 그 사람의 다른 후보와 겹치지 않는다', () => {
    const { sim, a, b } = duel();
    type(sim, a, skill(a, 'jangpung'));
    const firsts = sim.candidatesFor(b).map((c) => c.word.keys[0]);
    expect(new Set(firsts).size).toBe(firsts.length);
  });

  it('공격 단어를 치던 중에도 방어 단어 첫 키로 바로 방어에 들어간다', () => {
    const { sim, a, b } = duel();
    type(sim, b, b.attackWord, 2);
    type(sim, a, skill(a, 'jangpung'));
    const dw = defenseWord(sim, b);
    type(sim, b, dw);
    expect(sim.threats).toHaveLength(0);
    expect(b.stats.parries + b.stats.blocks).toBe(1);
  });

  it('철벽 중에는 잽 피해가 없다', () => {
    const { sim, a, b } = duel();
    type(sim, b, skill(b, 'wall'));
    const hp = b.hp;
    type(sim, a, a.attackWord, a.attackWord.keys.length - 1);
    expect(b.hp).toBe(hp);
  });

  it('회오리바람은 착탄 전에 범위를 벗어나면 회피된다', () => {
    const { sim, a, b } = duel();
    type(sim, a, skill(a, 'whirl'));
    expect(sim.threats).toHaveLength(1);
    b.x = 9; // 반경 4 × 1.25 밖으로 이동
    sim.drainEvents();
    run(sim, 2);
    const outcomes = sim.drainEvents().flatMap((e) => (e.t === 'resolve' ? [e.outcome] : []));
    expect(outcomes).toContain('dodge');
    expect(b.hp).toBe(CONFIG.fighter.maxHp);
  });
});

describe('Sim KO와 점수', () => {
  it('체력이 0이 되면 KO, 팀 점수가 오르고 잠시 뒤 마을에서 부활한다', () => {
    const { sim, a, b } = duel();
    b.hp = 1;
    type(sim, a, a.attackWord);
    expect(b.alive).toBe(false);
    expect(sim.score.blue).toBe(1);
    expect(a.stats.kos).toBe(1);
    run(sim, CONFIG.combat.respawnDelay + 0.1);
    expect(b.alive).toBe(true);
    expect(b.hp).toBe(CONFIG.fighter.maxHp);
  });

  it('같은 순간 착탄하는 두 스킬 중 첫 번째로 KO가 나도 나머지는 취소로 정리된다(회귀)', () => {
    const { sim, a, b } = duel();
    const c = sim.addFighter({ id: 'c', name: 'C', team: 'blue', spawn: { x: 0, z: 1 } });
    sim.step(DT);
    type(sim, a, skill(a, 'jangpung'));
    type(sim, c, skill(c, 'jangpung'));
    expect(sim.threats).toHaveLength(2);
    b.hp = 1;
    sim.drainEvents();
    expect(() => run(sim, 1.6)).not.toThrow();
    const outcomes = sim.drainEvents().flatMap((e) => (e.t === 'resolve' ? [e.outcome] : []));
    expect(outcomes.sort()).toEqual(['cancel', 'hit']);
    expect(b.alive).toBe(false);
    expect(sim.threats).toHaveLength(0);
  });

  it('판이 끝나면 날아가던 스킬은 모두 취소 이벤트로 정리된다', () => {
    const { sim, a, b } = duel();
    type(sim, b, skill(b, 'jangpung'));
    expect(sim.threats).toHaveLength(1);
    sim.score.blue = CONFIG.match.killsToWin - 1;
    const c = sim.addFighter({ id: 'c', name: 'C', team: 'red', spawn: { x: -1, z: 0 } });
    c.hp = 0.5;
    a.targetId = 'c';
    sim.drainEvents();
    sim.pressKey('a', a.attackWord.keys[0]!);
    const ev = sim.drainEvents();
    expect(sim.winner).toBe('blue');
    expect(sim.threats).toHaveLength(0);
    expect(ev.some((e) => e.t === 'resolve' && e.outcome === 'cancel')).toBe(true);
    expect(ev.at(-1)?.t).toBe('matchEnd');
  });

  it('기세가 가득 차면 속담 필살기 단어가 생긴다', () => {
    const { sim, a } = duel();
    a.gauge = CONFIG.gauge.max - 0.1;
    type(sim, a, a.attackWord, 1);
    expect(a.ultimateWord).not.toBeNull();
    expect(a.ultimateWord!.text).toContain(' ');
  });
});

describe('봇 난투 (스모크)', () => {
  it('4대4 봇이 2분 동안 싸우면 KO가 나고, 후보 첫 키는 항상 서로 다르다', () => {
    const sim = new Sim(42);
    const brains: BotBrain[] = [];
    for (const team of ['blue', 'red'] as const) {
      for (let i = 0; i < 4; i++) {
        const id = `${team}${i}`;
        sim.addFighter({ id, name: id, team, isBot: true, spawn: spawnPoint(team, sim.rng) });
        brains.push(new BotBrain(id, makeProfile(sim.rng, i / 3)));
      }
    }
    for (let t = 0; t < 120; t += DT) {
      for (const b of brains) b.update(sim);
      sim.step(DT);
      for (const f of sim.fighters.values()) {
        const firsts = sim.candidatesFor(f).map((c) => c.word.keys[0]);
        expect(new Set(firsts).size).toBe(firsts.length);
      }
    }
    expect(sim.score.blue + sim.score.red).toBeGreaterThan(0);
    const stats = [...sim.fighters.values()].map((f) => f.stats);
    expect(stats.reduce((s, x) => s + x.blocks + x.parries, 0)).toBeGreaterThan(0);
  });
});
