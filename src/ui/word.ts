// 타자 단어를 진행도에 맞춰 HTML로 그린다: 친 글자 / 조합 중인 글자 / 남은 글자.

import { splitProgress, type Word } from '../typing/hangul';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]!);

/** 공백은 눈에 보이게 가운뎃점 너비의 칸으로 바꾼다(속담을 칠 때 Space를 빠뜨리지 않게). */
const showSpaces = (s: string) => escapeHtml(s).replace(/ /g, '<i class="sp"> </i>');

export function wordHtml(word: Word, progress: number): string {
  const { done, composing, rest } = splitProgress(word, progress);
  return `<span class="w-done">${showSpaces(done)}</span>` +
    (composing ? `<span class="w-comp">${escapeHtml(composing)}</span>` : '') +
    `<span class="w-rest">${showSpaces(rest)}</span>`;
}

/** 같은 내용이면 DOM을 건드리지 않는다(매 프레임 갱신 비용 절감). */
export function setHtml(el: HTMLElement, html: string): void {
  if (el.dataset.html !== html) {
    el.dataset.html = html;
    el.innerHTML = html;
  }
}

export function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}
