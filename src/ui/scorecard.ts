// 결과 공유용 점수 카드(1080×1350, 4:5 — SNS 피드에서 잘리지 않는 비율).
// 마지막 장면 스냅샷 + 승패 + 전투 타속과 칭호 + 세부 기록 + 게임 주소를 캔버스에 직접 그린다.

import type { FighterStats, Team } from '../sim/sim';

export const GAME_URL = 'https://jeiel85.github.io/street-type-fight/';
const W = 1080;
const H = 1350;
const INK = '#2b2233';
const PAPER = '#fffdf4';
const FONT = '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

export interface ScoreCardData {
  won: boolean;
  winner: Team;
  score: Record<'blue' | 'red', number>;
  kpm: number;
  accuracy: number;
  stats: FighterStats;
}

/** 전투 타속(타/분)에 따른 칭호. 한컴타자 기준으로 200타 보통, 400타 이상 빠름. */
const RANKS: readonly [number, string][] = [
  [600, '전설의 타자왕'],
  [500, '고을 영웅'],
  [400, '마을 대장'],
  [300, '장터 싸움꾼'],
  [200, '골목 주먹'],
  [100, '동네 새내기'],
  [0, '구경꾼'],
];

export function rankTitle(kpm: number): string {
  return RANKS.find(([min]) => kpm >= min)![1];
}

export function shareText(d: ScoreCardData): string {
  const kpm = Math.round(d.kpm);
  const result = d.won ? '승리' : '패배';
  return `스트리트 타입 파이트에서 ${kpm}타 「${rankTitle(d.kpm)}」! 정확도 ${(d.accuracy * 100).toFixed(1)}% · ${d.stats.kos}KO로 ${result}. 너는 몇 타로 싸워? ${GAME_URL}`;
}

/** 지금 화면의 WebGL 장면을 2D 캔버스로 복사한다. 렌더 직후 같은 프레임에서 불러야 내용이 남아 있다. */
export function captureScene(source: HTMLCanvasElement): HTMLCanvasElement | null {
  try {
    const scale = Math.min(1, 1280 / source.width);
    const c = document.createElement('canvas');
    c.width = Math.round(source.width * scale);
    c.height = Math.round(source.height * scale);
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, c.width, c.height);
    return c;
  } catch (err) {
    console.warn('장면 스냅샷 실패 — 카드는 장면 없이 만듭니다.', err);
    return null;
  }
}

function stroked(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, stroke: number): void {
  ctx.lineJoin = 'round';
  ctx.lineWidth = stroke;
  ctx.strokeStyle = INK;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string): void {
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.roundRect(x, y + 8, w, h, r);
  ctx.fill();
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

export function renderScoreCard(d: ScoreCardData, scene: HTMLCanvasElement | null): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D 캔버스를 만들 수 없습니다.');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 바탕: 종이 + 사선 무늬
  ctx.fillStyle = '#f3ead6';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(43,34,51,0.06)';
  ctx.lineWidth = 14;
  for (let i = -H; i < W; i += 48) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + H, H);
    ctx.stroke();
  }

  // 로고
  ctx.save();
  ctx.translate(W / 2, 92);
  ctx.rotate(-0.025);
  ctx.font = `900 76px ${FONT}`;
  stroked(ctx, '스트리트 타입 파이트', 0, 0, '#ffcc33', 14);
  ctx.restore();

  // 마지막 장면
  const sx = 60;
  const sy = 160;
  const sw = W - 120;
  const sh = 470;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(sx, sy, sw, sh, 28);
  ctx.clip();
  if (scene && scene.width > 0 && scene.height > 0) {
    const k = Math.max(sw / scene.width, sh / scene.height);
    const dw = scene.width * k;
    const dh = scene.height * k;
    ctx.drawImage(scene, sx + (sw - dw) / 2, sy + (sh - dh) / 2, dw, dh);
  } else {
    const g = ctx.createLinearGradient(0, sy, 0, sy + sh);
    g.addColorStop(0, '#bfe2ee');
    g.addColorStop(1, '#86b955');
    ctx.fillStyle = g;
    ctx.fillRect(sx, sy, sw, sh);
  }
  const shade = ctx.createLinearGradient(0, sy + sh * 0.55, 0, sy + sh);
  shade.addColorStop(0, 'rgba(43,34,51,0)');
  shade.addColorStop(1, 'rgba(43,34,51,0.55)');
  ctx.fillStyle = shade;
  ctx.fillRect(sx, sy, sw, sh);
  ctx.restore();
  ctx.lineWidth = 8;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.roundRect(sx, sy, sw, sh, 28);
  ctx.stroke();

  // 승패 도장
  ctx.save();
  ctx.translate(sx + sw - 170, sy + 90);
  ctx.rotate(0.12);
  ctx.font = `900 96px ${FONT}`;
  stroked(ctx, d.won ? '승리!' : '패배…', 0, 0, d.won ? '#ffcc33' : '#c9c2d6', 16);
  ctx.restore();

  // 팀 점수
  ctx.font = `900 46px ${FONT}`;
  const scoreY = sy + sh - 48;
  stroked(ctx, `청룡단 ${d.score.blue}`, W / 2 - 150, scoreY, '#7fb0ff', 10);
  stroked(ctx, ':', W / 2, scoreY, PAPER, 10);
  stroked(ctx, `${d.score.red} 주작단`, W / 2 + 150, scoreY, '#ff9a7a', 10);

  // 전투 타속(주인공 수치)과 칭호
  panel(ctx, 60, 664, W - 120, 280, 30, PAPER);
  ctx.font = `800 34px ${FONT}`;
  ctx.fillStyle = '#6b6275';
  ctx.fillText('전투 타속', W / 2, 700);
  ctx.font = `900 132px ${FONT}`;
  stroked(ctx, `${Math.round(d.kpm)}타`, W / 2, 800, '#ff8a00', 16);
  const title = rankTitle(d.kpm);
  ctx.font = `900 38px ${FONT}`;
  const tw = ctx.measureText(title).width + 60;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.roundRect(W / 2 - tw / 2, 878, tw, 52, 26);
  ctx.fill();
  ctx.fillStyle = '#ffcc33';
  ctx.fillText(title, W / 2, 905);

  // 세부 기록
  const cells: [string, string][] = [
    ['정확도', `${(d.accuracy * 100).toFixed(1)}%`],
    ['최대 콤보', String(d.stats.maxCombo)],
    ['KO', String(d.stats.kos)],
    ['다운', String(d.stats.deaths)],
    ['방어', String(d.stats.blocks)],
    ['반격', String(d.stats.parries)],
  ];
  const cw = (W - 120 - 2 * 20) / 3;
  cells.forEach(([label, value], i) => {
    const x = 60 + (i % 3) * (cw + 20);
    const y = 972 + Math.floor(i / 3) * 124;
    panel(ctx, x, y, cw, 108, 22, PAPER);
    ctx.font = `900 50px ${FONT}`;
    ctx.fillStyle = INK;
    ctx.fillText(value, x + cw / 2, y + 44);
    ctx.font = `700 24px ${FONT}`;
    ctx.fillStyle = '#6b6275';
    ctx.fillText(label, x + cw / 2, y + 86);
  });

  // 초대 문구와 주소
  ctx.font = `900 40px ${FONT}`;
  stroked(ctx, '⌨️ 너는 몇 타로 싸워?', W / 2, 1254, PAPER, 10);
  ctx.font = `800 30px ${FONT}`;
  ctx.fillStyle = INK;
  ctx.fillText(GAME_URL.replace(/^https:\/\//, '').replace(/\/$/, ''), W / 2, 1306);
  return c;
}

export function canvasToPng(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('이미지를 만들 수 없습니다.'))), 'image/png');
  });
}
