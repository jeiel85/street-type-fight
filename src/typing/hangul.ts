// 한글 음절 ↔ 두벌식 키 토큰 변환.
// 게임은 OS IME를 쓰지 않고 "키 토큰"(자판 한 번에 해당하는 자모 또는 공백) 단위로 판정한다.
// 그래서 단어를 키 토큰 열로 분해하는 decompose와, 토큰 열을 화면용 문자열로 조합하는 compose가 필요하다.

const SYLLABLE_BASE = 0xac00;
const SYLLABLE_LAST = 0xd7a3;

const INITIALS = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const MEDIALS = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'];
const FINALS = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

// 두벌식에서 두 번 눌러 만드는 겹모음·겹받침. (ㄲ·ㅆ 등 쌍자음은 Shift 한 번이므로 여기 없다.)
const VOWEL_PAIRS: Record<string, [string, string]> = {
  ㅘ: ['ㅗ', 'ㅏ'], ㅙ: ['ㅗ', 'ㅐ'], ㅚ: ['ㅗ', 'ㅣ'],
  ㅝ: ['ㅜ', 'ㅓ'], ㅞ: ['ㅜ', 'ㅔ'], ㅟ: ['ㅜ', 'ㅣ'],
  ㅢ: ['ㅡ', 'ㅣ'],
};
const FINAL_PAIRS: Record<string, [string, string]> = {
  ㄳ: ['ㄱ', 'ㅅ'], ㄵ: ['ㄴ', 'ㅈ'], ㄶ: ['ㄴ', 'ㅎ'],
  ㄺ: ['ㄹ', 'ㄱ'], ㄻ: ['ㄹ', 'ㅁ'], ㄼ: ['ㄹ', 'ㅂ'], ㄽ: ['ㄹ', 'ㅅ'], ㄾ: ['ㄹ', 'ㅌ'], ㄿ: ['ㄹ', 'ㅍ'], ㅀ: ['ㄹ', 'ㅎ'],
  ㅄ: ['ㅂ', 'ㅅ'],
};

const VOWEL_COMBINE = invertPairs(VOWEL_PAIRS);
const FINAL_COMBINE = invertPairs(FINAL_PAIRS);

function invertPairs(pairs: Record<string, [string, string]>): Map<string, string> {
  const m = new Map<string, string>();
  for (const [whole, [a, b]] of Object.entries(pairs)) m.set(a + b, whole);
  return m;
}

const CONSONANTS = new Set(INITIALS);
const VOWELS = new Set(MEDIALS);

export function isConsonant(token: string): boolean {
  return CONSONANTS.has(token);
}

export function isVowel(token: string): boolean {
  return VOWELS.has(token);
}

/** 한 글자를 두벌식 키 토큰 열로. 공백은 ' ' 한 토큰. 지원하지 않는 문자는 예외. */
export function charToKeys(ch: string): string[] {
  if (ch === ' ') return [' '];
  const code = ch.codePointAt(0) ?? 0;
  if (code >= SYLLABLE_BASE && code <= SYLLABLE_LAST) {
    const idx = code - SYLLABLE_BASE;
    const l = INITIALS[Math.floor(idx / 588)]!;
    const v = MEDIALS[Math.floor((idx % 588) / 28)]!;
    const t = FINALS[idx % 28]!;
    const keys = [l, ...(VOWEL_PAIRS[v] ?? [v])];
    if (t) keys.push(...(FINAL_PAIRS[t] ?? [t]));
    return keys;
  }
  if (CONSONANTS.has(ch) || VOWELS.has(ch)) return [...(VOWEL_PAIRS[ch] ?? [ch])];
  if (FINAL_PAIRS[ch]) return [...FINAL_PAIRS[ch]];
  throw new Error(`타자 단어에 쓸 수 없는 문자: "${ch}"`);
}

export interface Word {
  readonly text: string;
  /** 쳐야 하는 키 토큰 전체. */
  readonly keys: readonly string[];
  /** 글자 i가 keys에서 시작하는 위치. 길이는 글자 수 + 1(끝 표시). */
  readonly charStarts: readonly number[];
}

export function makeWord(text: string): Word {
  const keys: string[] = [];
  const charStarts: number[] = [];
  for (const ch of text) {
    charStarts.push(keys.length);
    keys.push(...charToKeys(ch));
  }
  charStarts.push(keys.length);
  return { text, keys, charStarts };
}

/** 두벌식 오토마타: 키 토큰 열을 IME가 보여 줄 문자열로 조합한다. */
export function compose(tokens: readonly string[]): string {
  let out = '';
  let l: string | null = null;
  let v: string | null = null;
  let t: string | null = null;

  const flush = () => {
    if (l && v) {
      out += String.fromCharCode(
        SYLLABLE_BASE + INITIALS.indexOf(l) * 588 + MEDIALS.indexOf(v) * 28 + FINALS.indexOf(t ?? ''),
      );
    } else if (l) {
      out += l;
    } else if (v) {
      out += v;
    }
    l = v = t = null;
  };

  for (const tok of tokens) {
    if (isConsonant(tok)) {
      if (l && v && !t) {
        // 받침이 될 수 없는 쌍자음(ㄸ·ㅃ·ㅉ)은 새 글자로 넘긴다.
        if (FINALS.includes(tok)) t = tok;
        else { flush(); l = tok; }
      } else if (l && v && t) {
        const merged = FINAL_COMBINE.get(t + tok);
        if (merged) t = merged;
        else { flush(); l = tok; }
      } else {
        flush();
        l = tok;
      }
    } else if (isVowel(tok)) {
      if (t) {
        // 받침이 다음 글자의 초성으로 넘어간다. 겹받침이면 뒷부분만 넘어간다.
        const pair: [string, string] | undefined = FINAL_PAIRS[t];
        let carry: string;
        if (pair) { t = pair[0]; carry = pair[1]; } else { carry = t; t = null; }
        flush();
        l = carry;
        v = tok;
      } else if (v) {
        const merged = VOWEL_COMBINE.get(v + tok);
        if (merged) v = merged;
        else { flush(); v = tok; }
      } else {
        v = tok;
      }
    } else {
      flush();
      out += tok;
    }
  }
  flush();
  return out;
}

/** 진행도(입력한 키 수)를 글자 단위 화면 표시로 나눈다. 현재 글자는 조합 중인 모양을 보여 준다. */
export function splitProgress(word: Word, progress: number): { done: string; composing: string; rest: string } {
  const chars = [...word.text];
  let i = 0;
  while (i < chars.length && word.charStarts[i + 1]! <= progress) i++;
  const done = chars.slice(0, i).join('');
  if (i >= chars.length) return { done, composing: '', rest: '' };
  const start = word.charStarts[i]!;
  const composing = progress > start ? compose(word.keys.slice(start, progress)) : '';
  const rest = chars.slice(composing ? i + 1 : i).join('');
  return { done, composing, rest };
}
