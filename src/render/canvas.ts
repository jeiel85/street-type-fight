// 외부 이미지 없이 모든 그림을 캔버스에 직접 그려 텍스처로 쓴다.

import { CanvasTexture, SRGBColorSpace, type Texture } from 'three';

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D 캔버스를 만들 수 없습니다.');
  return [c, ctx];
}

export function toTexture(canvas: HTMLCanvasElement): Texture {
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function drawTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): Texture {
  const [c, ctx] = makeCanvas(w, h);
  draw(ctx);
  return toTexture(c);
}

/** 색을 밝기 배율로 조정(#rrggbb). */
export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * k)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

export const KOREAN_FONT = '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
