// 물리 키 위치(KeyboardEvent.code) → 두벌식 자모.
// OS의 한/영 상태나 IME 조합 이벤트와 무관하게 같은 판정을 내기 위해 code만 본다.

const LAYOUT: Record<string, readonly [string, string?]> = {
  KeyQ: ['ㅂ', 'ㅃ'], KeyW: ['ㅈ', 'ㅉ'], KeyE: ['ㄷ', 'ㄸ'], KeyR: ['ㄱ', 'ㄲ'], KeyT: ['ㅅ', 'ㅆ'],
  KeyY: ['ㅛ'], KeyU: ['ㅕ'], KeyI: ['ㅑ'], KeyO: ['ㅐ', 'ㅒ'], KeyP: ['ㅔ', 'ㅖ'],
  KeyA: ['ㅁ'], KeyS: ['ㄴ'], KeyD: ['ㅇ'], KeyF: ['ㄹ'], KeyG: ['ㅎ'],
  KeyH: ['ㅗ'], KeyJ: ['ㅓ'], KeyK: ['ㅏ'], KeyL: ['ㅣ'],
  KeyZ: ['ㅋ'], KeyX: ['ㅌ'], KeyC: ['ㅊ'], KeyV: ['ㅍ'], KeyB: ['ㅠ'], KeyN: ['ㅜ'], KeyM: ['ㅡ'],
  Space: [' '],
};

/** 타자 토큰으로 해석되는 키면 토큰을, 아니면 null. Shift가 없는 키는 Shift를 눌러도 같은 자모. */
export function tokenFromCode(code: string, shift: boolean): string | null {
  const entry = LAYOUT[code];
  if (!entry) return null;
  return (shift && entry[1]) || entry[0];
}

/** 봇의 오타 생성 등에 쓰는 전체 토큰 목록(공백 제외). */
export const ALL_JAMO_TOKENS: readonly string[] = Object.entries(LAYOUT)
  .filter(([code]) => code !== 'Space')
  .flatMap(([, [plain, shifted]]) => (shifted ? [plain, shifted] : [plain]));
