// 직업 스킬 정의. 프로토타입은 '권사' 키트 하나만 둔다(GDD §6).
// 스킬 단어의 첫 키는 키트 안에서 모두 달라야 하고, 공격·방어 단어는 이 첫 키들을 피해서 뽑힌다.

import { makeWord, type Word } from '../typing/hangul';

export type SkillShape = 'projectile' | 'dash' | 'aoe' | 'guard';

export interface SkillDef {
  readonly id: string;
  readonly word: Word;
  readonly shape: SkillShape;
  readonly desc: string;
  readonly cooldown: number;
  /** 대상 지정 스킬의 사거리. 범위기는 radius를 쓴다. */
  readonly range: number;
  readonly radius: number;
  /** 시전 완료 후 착탄까지의 지연 = 상대가 방어 단어를 칠 시간. */
  readonly windup: number;
  readonly damage: number;
  readonly knock: number;
  /** 상대에게 주어지는 방어 단어의 키 수 범위. */
  readonly defenseKeys: readonly [number, number];
  readonly guardDuration: number;
}

const base = { range: 0, radius: 0, windup: 0, damage: 0, knock: 0, defenseKeys: [0, 0] as const, guardDuration: 0 };

export const BRAWLER_KIT: readonly SkillDef[] = [
  {
    ...base,
    id: 'jangpung',
    word: makeWord('장풍'),
    shape: 'projectile',
    desc: '기를 모아 쏘는 원거리 일격',
    cooldown: 4,
    range: 10,
    windup: 1.4,
    damage: 14,
    knock: 6,
    defenseKeys: [3, 4],
  },
  {
    ...base,
    id: 'kick',
    word: makeWord('돌려차기'),
    shape: 'dash',
    desc: '대상에게 돌진해 꽂는 회전 발차기, 넉백 큼',
    cooldown: 6,
    range: 6,
    windup: 1.2,
    damage: 18,
    knock: 12,
    defenseKeys: [3, 4],
  },
  {
    ...base,
    id: 'wall',
    word: makeWord('철벽'),
    shape: 'guard',
    desc: '3초간 잽 무효, 스킬 피해 절반',
    cooldown: 12,
    guardDuration: 3,
  },
  {
    ...base,
    id: 'whirl',
    word: makeWord('회오리바람'),
    shape: 'aoe',
    desc: '주변 모든 적에게 회오리. 착탄 전에 범위를 벗어나면 회피',
    cooldown: 10,
    radius: 4,
    windup: 1.6,
    damage: 15,
    knock: 8,
    defenseKeys: [4, 5],
  },
];
