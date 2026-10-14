// 한 줄 입력으로 공격·스킬·방어·필살기를 구분하는 판정기.
// 규칙: 동시에 떠 있는 후보 단어들은 첫 키가 모두 다르다(생성 쪽에서 보장).
// 그래서 첫 키 하나로 어떤 단어를 칠지 "잠금"이 정해지고, 이후는 다음 키만 맞으면 된다.

import type { Word } from './hangul';

export type CandKind = 'attack' | 'skill' | 'defense' | 'ultimate';

export interface Candidate {
  readonly id: string;
  readonly kind: CandKind;
  readonly word: Word;
  /** false면 첫 키만 예약된 상태(쿨타임·사거리 밖 등). 눌러도 헛손질로 치지 않는다. */
  readonly ready: boolean;
  readonly reason?: string;
}

export interface LockState {
  readonly candId: string;
  readonly progress: number;
}

export type PressResult =
  | { type: 'progress'; cand: Candidate; progress: number; switched: boolean }
  | { type: 'complete'; cand: Candidate; switched: boolean }
  | { type: 'notReady'; cand: Candidate }
  | { type: 'fumble'; expected: string | null };

export interface PressOutcome {
  readonly lock: LockState | null;
  readonly result: PressResult;
}

function advance(cand: Candidate, progress: number, switched: boolean): PressOutcome {
  if (progress >= cand.word.keys.length) {
    return { lock: null, result: { type: 'complete', cand, switched } };
  }
  return { lock: { candId: cand.id, progress }, result: { type: 'progress', cand, progress, switched } };
}

export function pressKey(lock: LockState | null, cands: readonly Candidate[], token: string): PressOutcome {
  const locked = lock ? cands.find((c) => c.id === lock.candId) : undefined;

  if (lock && locked) {
    const expected = locked.word.keys[lock.progress] ?? null;
    if (locked.ready && token === expected) return advance(locked, lock.progress + 1, false);

    // 공격 도중이라도 날아오는 공격의 방어 단어 첫 키를 치면 곧바로 방어로 갈아탄다.
    // (속도가 생명이므로 '잠금 해제' 키를 따로 누르게 하지 않는다.)
    const defense = cands.find((c) => c.kind === 'defense' && c.ready && c.id !== locked.id && c.word.keys[0] === token);
    if (defense) return advance(defense, 1, true);

    // 치던 단어가 잠시 쓸 수 없게 되면(대상이 사거리 밖으로 밀려나는 등) 진행도를 지키고 벌칙 없이 알린다.
    if (!locked.ready) return { lock, result: { type: 'notReady', cand: locked } };

    return { lock, result: { type: 'fumble', expected } };
  }

  const cand = cands.find((c) => c.word.keys[0] === token);
  if (!cand) return { lock: null, result: { type: 'fumble', expected: null } };
  if (!cand.ready) return { lock: null, result: { type: 'notReady', cand } };
  return advance(cand, 1, false);
}
