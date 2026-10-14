import { describe, expect, it } from 'vitest';
import { compose, makeWord, splitProgress } from '../../src/typing/hangul';
import { tokenFromCode } from '../../src/typing/dubeolsik';
import { pressKey, type Candidate, type LockState } from '../../src/typing/matcher';
import { NOUN_WORDS, PROVERB_WORDS, MAX_PROVERB_SYLLABLES, pickWord } from '../../src/typing/words';

const keysOf = (s: string) => makeWord(s).keys.join('');

describe('makeWord (음절 → 두벌식 키 토큰)', () => {
  it('겹모음·겹받침은 두 번, 쌍자음은 한 번(Shift)으로 분해한다', () => {
    expect(keysOf('과')).toBe('ㄱㅗㅏ');
    expect(keysOf('닭')).toBe('ㄷㅏㄹㄱ');
    expect(keysOf('쌀')).toBe('ㅆㅏㄹ');
    expect(keysOf('흙')).toBe('ㅎㅡㄹㄱ');
    expect(keysOf('의')).toBe('ㅇㅡㅣ');
  });

  it('공백은 Space 토큰 하나이고 글자 시작 위치를 기록한다', () => {
    const w = makeWord('칼로 물');
    expect(w.keys.join('')).toBe('ㅋㅏㄹㄹㅗ ㅁㅜㄹ');
    expect(w.charStarts).toEqual([0, 3, 5, 6, 9]);
  });

  it('지원하지 않는 문자는 거부한다', () => {
    expect(() => makeWord('abc')).toThrow();
    expect(() => makeWord('가.')).toThrow();
  });
});

describe('compose (두벌식 오토마타)', () => {
  const c = (s: string) => compose([...s]);

  it('IME처럼 받침을 다음 글자로 넘긴다', () => {
    expect(c('ㄱㅏㄴ')).toBe('간');
    expect(c('ㄱㅏㄴㅏ')).toBe('가나');
    expect(c('ㅇㅏㄴㅈㅏ')).toBe('안자');
    expect(c('ㄷㅏㄹㄱ')).toBe('닭');
    expect(c('ㄷㅏㄹㄱㅏ')).toBe('달가');
  });

  it('겹모음을 합치고, 받침이 될 수 없는 쌍자음은 새 글자로 보낸다', () => {
    expect(c('ㄱㅗㅏ')).toBe('과');
    expect(c('ㅎㅗㅣ')).toBe('회');
    expect(c('ㄱㅏㄸ')).toBe('가ㄸ');
    expect(c('ㅂㅏㅆ')).toBe('밨');
  });

  it('사전의 모든 단어와 속담이 분해 후 다시 조합하면 원래대로 돌아온다', () => {
    for (const w of [...NOUN_WORDS, ...PROVERB_WORDS]) {
      expect(compose(w.keys)).toBe(w.text);
    }
  });
});

describe('splitProgress (화면 표시)', () => {
  it('완료한 글자, 조합 중인 글자, 남은 글자로 나눈다', () => {
    const w = makeWord('회오리');
    expect(splitProgress(w, 0)).toEqual({ done: '', composing: '', rest: '회오리' });
    expect(splitProgress(w, 2)).toEqual({ done: '', composing: '호', rest: '오리' });
    expect(splitProgress(w, 3)).toEqual({ done: '회', composing: '', rest: '오리' });
    expect(splitProgress(w, 4)).toEqual({ done: '회', composing: 'ㅇ', rest: '리' });
    expect(splitProgress(w, w.keys.length)).toEqual({ done: '회오리', composing: '', rest: '' });
  });
});

describe('tokenFromCode (물리 키 → 자모)', () => {
  it('두벌식 배열과 Shift 쌍자음을 따른다', () => {
    expect(tokenFromCode('KeyR', false)).toBe('ㄱ');
    expect(tokenFromCode('KeyR', true)).toBe('ㄲ');
    expect(tokenFromCode('KeyO', true)).toBe('ㅒ');
    expect(tokenFromCode('KeyK', true)).toBe('ㅏ');
    expect(tokenFromCode('Space', false)).toBe(' ');
    expect(tokenFromCode('Digit1', false)).toBeNull();
    expect(tokenFromCode('ArrowLeft', false)).toBeNull();
  });
});

describe('pressKey (후보 판정)', () => {
  const cand = (id: string, kind: Candidate['kind'], text: string, ready = true): Candidate => ({
    id, kind, word: makeWord(text), ready,
  });
  const cands = [cand('atk', 'attack', '사과'), cand('s0', 'skill', '장풍'), cand('s1', 'skill', '철벽', false)];

  it('첫 키로 잠그고 끝까지 치면 완료한다', () => {
    let lock: LockState | null = null;
    const seq = [...'ㅅㅏㄱㅗㅏ'];
    const results = seq.map((t) => {
      const o = pressKey(lock, cands, t);
      lock = o.lock;
      return o.result.type;
    });
    expect(results).toEqual(['progress', 'progress', 'progress', 'progress', 'complete']);
    expect(lock).toBeNull();
  });

  it('틀린 키는 헛손질이고 잠금과 진행도는 유지된다', () => {
    const first = pressKey(null, cands, 'ㅅ');
    const wrong = pressKey(first.lock, cands, 'ㅓ');
    expect(wrong.result).toEqual({ type: 'fumble', expected: 'ㅏ' });
    expect(wrong.lock).toEqual({ candId: 'atk', progress: 1 });
  });

  it('어느 후보와도 맞지 않는 첫 키는 헛손질이다', () => {
    expect(pressKey(null, cands, 'ㅋ').result.type).toBe('fumble');
  });

  it('쿨타임인 스킬의 첫 키는 헛손질이 아니라 준비 안 됨이다', () => {
    const o = pressKey(null, cands, 'ㅊ');
    expect(o.result.type).toBe('notReady');
    expect(o.lock).toBeNull();
  });

  it('공격 도중 방어 단어 첫 키를 치면 방어로 갈아탄다', () => {
    const withDefense = [...cands, cand('def:1', 'defense', '나무')];
    const mid = pressKey(null, withDefense, 'ㅅ');
    const o = pressKey(mid.lock, withDefense, 'ㄴ');
    expect(o.result).toMatchObject({ type: 'progress', switched: true });
    expect(o.lock).toEqual({ candId: 'def:1', progress: 1 });
  });

  it('잠근 후보가 사라지면 잠금을 풀고 새 첫 키로 판정한다', () => {
    const o = pressKey({ candId: 'gone', progress: 2 }, cands, 'ㅈ');
    expect(o.lock).toEqual({ candId: 's0', progress: 1 });
  });
});

describe('사전', () => {
  it('속담은 12음절 이하만 남는다', () => {
    expect(PROVERB_WORDS.length).toBeGreaterThan(15);
    for (const p of PROVERB_WORDS) expect(p.text.replace(/ /g, '').length).toBeLessThanOrEqual(MAX_PROVERB_SYLLABLES);
  });

  it('제외된 첫 키를 피해서 키 수 범위의 단어를 뽑는다', () => {
    let s = 1;
    const rng = { next: () => ((s = (s * 16807) % 2147483647) / 2147483647) };
    const excluded = new Set(['ㄱ', 'ㄴ', 'ㄷ', 'ㅈ', 'ㅊ', 'ㅎ', 'ㅅ']);
    for (let i = 0; i < 200; i++) {
      const w = pickWord(rng, NOUN_WORDS, 3, 4, excluded)!;
      expect(excluded.has(w.keys[0]!)).toBe(false);
      expect(w.keys.length).toBeGreaterThanOrEqual(3);
      expect(w.keys.length).toBeLessThanOrEqual(4);
    }
  });

  it('범위 안에 없으면 가장 가까운 길이로 물러선다', () => {
    const rng = { next: () => 0.5 };
    const w = pickWord(rng, NOUN_WORDS, 40, 50, new Set());
    expect(w).not.toBeNull();
  });
});
