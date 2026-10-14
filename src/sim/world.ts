// 월드 배치 데이터. 시뮬레이션(충돌·안전지대)과 렌더러(메시)가 같은 데이터를 쓴다.
// 서버로 옮길 때도 그대로 쓰도록 Three.js에 의존하지 않는다.

import { mulberry32 } from './rng';

export type Team = 'blue' | 'red' | 'neutral';

export interface Box { x: number; z: number; hw: number; hd: number }
export interface Circle { x: number; z: number; r: number }
export interface House extends Box { team: Team; h: number }
export interface Village { team: Team; name: string; x: number; z: number; r: number }
export interface Segment { ax: number; az: number; bx: number; bz: number }

export const BOUNDS = { minX: -40, maxX: 40, minZ: -26, maxZ: 26 };

export const VILLAGES: readonly Village[] = [
  { team: 'blue', name: '청룡 마을', x: -30, z: 0, r: 8 },
  { team: 'red', name: '주작 마을', x: 30, z: 0, r: 8 },
];

export const PLAZA: Circle = { x: 0, z: 0, r: 7 };
export const TRAINING_DUMMY = { x: -21, z: 12 };
export const TRAINING_GROUND: Circle = { x: -21, z: 12, r: 3.2 };

/** 개울 두 줄(x 고정, 남북으로 흐름)과 다리 위치. 다리만 건널 수 있다. */
export const STREAMS = [{ x: -13, hw: 1.4 }, { x: 13, hw: 1.4 }];
export const BRIDGE_Z = [-8, 8];
export const BRIDGE_HALF_WIDTH = 1.7;

const HOUSE_OFFSETS: readonly { dx: number; dz: number; hw: number; hd: number; h: number }[] = [
  { dx: -5, dz: -5.2, hw: 1.8, hd: 1.4, h: 1.8 },
  { dx: 2, dz: -6.4, hw: 1.6, hd: 1.3, h: 1.6 },
  { dx: -5, dz: 5.2, hw: 1.8, hd: 1.4, h: 1.8 },
  { dx: 2.4, dz: 6.4, hw: 1.6, hd: 1.3, h: 1.6 },
  { dx: -8.6, dz: 0, hw: 1.3, hd: 1.8, h: 2.0 },
];

// 붉은 마을은 푸른 마을을 x축 대칭으로 뒤집어 출구가 서로 가운데를 향한다.
export const HOUSES: readonly House[] = VILLAGES.flatMap((v) =>
  HOUSE_OFFSETS.map((o) => ({
    x: v.x + (v.team === 'blue' ? o.dx : -o.dx),
    z: v.z + o.dz,
    hw: o.hw,
    hd: o.hd,
    h: o.h,
    team: v.team,
  })),
);

/** 마을 출구의 장승(좌우 한 쌍). */
export const JANGSEUNGS: readonly Circle[] = VILLAGES.flatMap((v) => {
  const x = v.x + (v.team === 'blue' ? 7.5 : -7.5);
  return [{ x, z: -1.8, r: 0.3 }, { x, z: 1.8, r: 0.3 }];
});

/** 길(렌더링용 + 나무를 심지 않을 곳). */
export const ROADS: readonly Segment[] = (() => {
  const half: Segment[] = [
    { ax: -30, az: 0, bx: -18, bz: 0 },
    { ax: -18, az: 0, bx: -13, bz: -8 },
    { ax: -18, az: 0, bx: -13, bz: 8 },
    { ax: -13, az: -8, bx: -5, bz: -3 },
    { ax: -13, az: 8, bx: -5, bz: 3 },
    { ax: -26, az: 4, bx: -21, bz: 12 },
  ];
  return [...half, ...half.slice(0, 5).map((s) => ({ ax: -s.ax, az: s.az, bx: -s.bx, bz: s.bz }))];
})();
export const ROAD_HALF_WIDTH = 1.3;

/** 개울을 막는 충돌 상자(다리 구간은 비어 있다). */
export const STREAM_BLOCKS: readonly Box[] = STREAMS.flatMap((s) => {
  const edges = [BOUNDS.minZ, ...BRIDGE_Z.flatMap((z) => [z - BRIDGE_HALF_WIDTH, z + BRIDGE_HALF_WIDTH]), BOUNDS.maxZ];
  const boxes: Box[] = [];
  for (let i = 0; i < edges.length; i += 2) {
    const z0 = edges[i]!;
    const z1 = edges[i + 1]!;
    boxes.push({ x: s.x, z: (z0 + z1) / 2, hw: s.hw, hd: (z1 - z0) / 2 });
  }
  return boxes;
});

export function distToSegment(x: number, z: number, s: Segment): number {
  const dx = s.bx - s.ax;
  const dz = s.bz - s.az;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / len2));
  return Math.hypot(x - (s.ax + t * dx), z - (s.az + t * dz));
}

function nearRoad(x: number, z: number, margin: number): boolean {
  return ROADS.some((s) => distToSegment(x, z, s) < ROAD_HALF_WIDTH + margin);
}

function nearStream(x: number, margin: number): boolean {
  return STREAMS.some((s) => Math.abs(x - s.x) < s.hw + margin);
}

function insideAny(x: number, z: number, circles: readonly Circle[], margin: number): boolean {
  return circles.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + margin);
}

/** 나무·바위는 시드 고정 난수로 배치해 서버와 클라이언트가 같은 맵을 갖는다. */
function scatter(): { trees: Circle[]; rocks: Circle[] } {
  const rng = mulberry32(20261014);
  const keepOut: Circle[] = [...VILLAGES, PLAZA, TRAINING_GROUND];
  const trees: Circle[] = [];
  const rocks: Circle[] = [];
  const free = (x: number, z: number, r: number) =>
    !insideAny(x, z, keepOut, 1.2) &&
    !nearRoad(x, z, 0.8) &&
    !nearStream(x, 1.0) &&
    !HOUSES.some((h) => Math.abs(x - h.x) < h.hw + r + 0.8 && Math.abs(z - h.z) < h.hd + r + 0.8) &&
    !insideAny(x, z, trees, r + 0.6) &&
    !insideAny(x, z, rocks, r + 0.6);

  // 외곽 숲: 맵 가장자리를 두른다.
  for (let i = 0; i < 260; i++) {
    const edge = rng() < 0.5;
    const x = edge ? BOUNDS.minX + rng() * (BOUNDS.maxX - BOUNDS.minX) : (rng() < 0.5 ? BOUNDS.minX + rng() * 4 : BOUNDS.maxX - rng() * 4);
    const z = edge ? (rng() < 0.5 ? BOUNDS.minZ + rng() * 4 : BOUNDS.maxZ - rng() * 4) : BOUNDS.minZ + rng() * (BOUNDS.maxZ - BOUNDS.minZ);
    if (free(x, z, 0.5)) trees.push({ x, z, r: 0.5 });
  }
  // 들판 군데군데: 시야를 조금 가리고 싸움 동선을 만든다.
  for (let i = 0; i < 400 && trees.length < 330; i++) {
    const x = BOUNDS.minX + 4 + rng() * (BOUNDS.maxX - BOUNDS.minX - 8);
    const z = BOUNDS.minZ + 4 + rng() * (BOUNDS.maxZ - BOUNDS.minZ - 8);
    if (rng() < 0.55 && free(x, z, 0.5)) trees.push({ x, z, r: 0.5 });
  }
  for (let i = 0; i < 200 && rocks.length < 26; i++) {
    const x = BOUNDS.minX + 5 + rng() * (BOUNDS.maxX - BOUNDS.minX - 10);
    const z = BOUNDS.minZ + 5 + rng() * (BOUNDS.maxZ - BOUNDS.minZ - 10);
    const r = 0.4 + rng() * 0.5;
    if (free(x, z, r)) rocks.push({ x, z, r });
  }
  return { trees, rocks };
}

const scattered = scatter();
export const TREES: readonly Circle[] = scattered.trees;
export const ROCKS: readonly Circle[] = scattered.rocks;

export const SOLID_BOXES: readonly Box[] = [...HOUSES, ...STREAM_BLOCKS];
export const SOLID_CIRCLES: readonly Circle[] = [...TREES, ...ROCKS, ...JANGSEUNGS];

export function safeZoneAt(x: number, z: number): Village | null {
  return VILLAGES.find((v) => Math.hypot(x - v.x, z - v.z) <= v.r) ?? null;
}

export function villageOf(team: Team): Village | null {
  return VILLAGES.find((v) => v.team === team) ?? null;
}
