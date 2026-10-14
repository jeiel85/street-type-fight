// 지형: 정점 색으로 칠한 로우폴리 땅, 개울, 다리, 광장 돌바닥.

import {
  BoxGeometry, BufferAttribute, CylinderGeometry, DoubleSide, Group, Mesh, MeshLambertMaterial, PlaneGeometry,
  RepeatWrapping, type Texture,
} from 'three';
import {
  BOUNDS, BRIDGE_HALF_WIDTH, BRIDGE_Z, PLAZA, ROADS, ROAD_HALF_WIDTH, STREAMS, TRAINING_GROUND, VILLAGES,
  distToSegment,
} from '../sim/world';
import { drawTexture } from './canvas';
import { fbm, valueNoise } from './noise';

const MARGIN = 22;
const CELL = 0.6;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function outsideDistance(x: number, z: number): number {
  const dx = Math.max(BOUNDS.minX + 1 - x, 0, x - (BOUNDS.maxX - 1));
  const dz = Math.max(BOUNDS.minZ + 1 - z, 0, z - (BOUNDS.maxZ - 1));
  return Math.hypot(dx, dz);
}

export function groundHeight(x: number, z: number): number {
  let h = 0;
  for (const s of STREAMS) {
    const d = Math.abs(x - s.x);
    h -= 0.55 * (1 - smoothstep(s.hw - 0.3, s.hw + 0.6, d));
  }
  const out = outsideDistance(x, z);
  if (out > 0) h += smoothstep(0, 12, out) * (2.5 + fbm(x * 0.12, z * 0.12) * 5);
  return h;
}

type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hex = (n: number): RGB => [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];

const GRASS_A = hex(0x7fb24f);
const GRASS_B = hex(0x9cc45a);
const GRASS_DARK = hex(0x5e8f3c);
const DIRT = hex(0xc9a46b);
const DIRT_DARK = hex(0xae8853);
const SAND = hex(0xd8c38f);
const PACKED = hex(0xd6bf8e);
const HILL = hex(0x6d9a46);

function groundColor(x: number, z: number): RGB {
  const n = fbm(x * 0.18, z * 0.18);
  let c = mix(GRASS_A, GRASS_B, n);
  c = mix(c, GRASS_DARK, smoothstep(0.62, 0.9, valueNoise(x * 0.07 + 40, z * 0.07)) * 0.6);

  for (const v of VILLAGES) {
    const d = Math.hypot(x - v.x, z - v.z);
    c = mix(c, PACKED, 1 - smoothstep(v.r - 1.5, v.r + 0.5, d + (valueNoise(x, z) - 0.5) * 1.2));
  }
  const tg = Math.hypot(x - TRAINING_GROUND.x, z - TRAINING_GROUND.z);
  c = mix(c, DIRT, 1 - smoothstep(TRAINING_GROUND.r - 0.6, TRAINING_GROUND.r + 0.4, tg));

  let road = Infinity;
  for (const s of ROADS) road = Math.min(road, distToSegment(x, z, s));
  const edge = (valueNoise(x * 1.3, z * 1.3) - 0.5) * 0.5;
  const roadT = 1 - smoothstep(ROAD_HALF_WIDTH - 0.25, ROAD_HALF_WIDTH + 0.35, road + edge);
  c = mix(c, mix(DIRT, DIRT_DARK, valueNoise(x * 2, z * 2)), roadT);

  for (const s of STREAMS) {
    const d = Math.abs(x - s.x);
    c = mix(c, SAND, 1 - smoothstep(s.hw + 0.2, s.hw + 1.1, d + (valueNoise(x * 0.8, z * 0.8) - 0.5) * 0.6));
  }
  const out = outsideDistance(x, z);
  if (out > 0) c = mix(c, HILL, smoothstep(0, 6, out));
  return c;
}

function buildGround(): Mesh {
  const w = BOUNDS.maxX - BOUNDS.minX + MARGIN * 2;
  const d = BOUNDS.maxZ - BOUNDS.minZ + MARGIN * 2;
  const geo = new PlaneGeometry(w, d, Math.round(w / CELL), Math.round(d / CELL)).toNonIndexed();
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  // 면 단위로 같은 색을 칠해 로우폴리 느낌을 낸다(면 중심의 색).
  for (let i = 0; i < pos.count; i += 3) {
    let cx = 0;
    let cz = 0;
    for (let k = 0; k < 3; k++) {
      const x = pos.getX(i + k);
      const z = pos.getZ(i + k);
      pos.setY(i + k, groundHeight(x, z));
      cx += x / 3;
      cz += z / 3;
    }
    const col = groundColor(cx, cz);
    const j = 0.97 + valueNoise(cx * 3.1, cz * 3.1) * 0.06;
    for (let k = 0; k < 3; k++) colors.set([col[0] * j, col[1] * j, col[2] * j], (i + k) * 3);
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new Mesh(geo, new MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  mesh.receiveShadow = true;
  return mesh;
}

function waterTexture(): Texture {
  const t = drawTexture(128, 256, (ctx) => {
    ctx.fillStyle = '#4aa3d8';
    ctx.fillRect(0, 0, 128, 256);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (let i = 0; i < 14; i++) {
      const x = (i * 37) % 112 + 8;
      const y = (i * 71) % 240 + 8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 8, y - 4, x + 16, y);
      ctx.stroke();
    }
  });
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

function plankTexture(): Texture {
  return drawTexture(128, 128, (ctx) => {
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? '#a8743f' : '#b9824a';
      ctx.fillRect(0, i * 16, 128, 16);
      ctx.fillStyle = '#6e4622';
      ctx.fillRect(0, i * 16 + 14, 128, 2);
    }
  });
}

function flagstoneTexture(): Texture {
  return drawTexture(512, 512, (ctx) => {
    ctx.fillStyle = '#b9b2a4';
    ctx.fillRect(0, 0, 512, 512);
    ctx.translate(256, 256);
    ctx.strokeStyle = '#857d70';
    ctx.lineWidth = 4;
    for (let r = 40; r < 256; r += 46) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      const n = Math.round(r / 14);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + r;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        ctx.lineTo(Math.cos(a) * (r + 46), Math.sin(a) * (r + 46));
        ctx.stroke();
      }
    }
    // 가운데 태극 문양
    ctx.fillStyle = '#c84a3c';
    ctx.beginPath();
    ctx.arc(0, 0, 34, Math.PI, 0);
    ctx.arc(17, 0, 17, 0, Math.PI, true);
    ctx.arc(-17, 0, 17, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = '#3b67b0';
    ctx.beginPath();
    ctx.arc(0, 0, 34, 0, Math.PI);
    ctx.arc(-17, 0, 17, Math.PI, 0, true);
    ctx.arc(17, 0, 17, Math.PI, 0);
    ctx.fill();
  });
}

export class Terrain {
  readonly group = new Group();
  private readonly water: Texture;

  constructor() {
    this.group.add(buildGround());

    this.water = waterTexture();
    for (const s of STREAMS) {
      const len = BOUNDS.maxZ - BOUNDS.minZ + MARGIN;
      const geo = new PlaneGeometry(s.hw * 2 + 0.6, len);
      geo.rotateX(-Math.PI / 2);
      const tex = this.water.clone();
      tex.repeat.set(1, len / 8);
      tex.needsUpdate = true;
      const m = new Mesh(geo, new MeshLambertMaterial({ map: tex, transparent: true, opacity: 0.88, color: 0xdff4ff }));
      m.position.set(s.x, -0.22, (BOUNDS.minZ + BOUNDS.maxZ) / 2);
      m.receiveShadow = true;
      m.userData.scroll = tex;
      this.group.add(m);

      const plank = new MeshLambertMaterial({ map: plankTexture() });
      const rail = new MeshLambertMaterial({ color: 0x7a4f2a });
      for (const bz of BRIDGE_Z) {
        const deck = new Mesh(new BoxGeometry(s.hw * 2 + 1.6, 0.22, BRIDGE_HALF_WIDTH * 2), plank);
        deck.position.set(s.x, -0.06, bz);
        deck.castShadow = deck.receiveShadow = true;
        this.group.add(deck);
        for (const side of [-1, 1]) {
          const r = new Mesh(new BoxGeometry(s.hw * 2 + 1.6, 0.1, 0.1), rail);
          r.position.set(s.x, 0.55, bz + side * (BRIDGE_HALF_WIDTH - 0.05));
          r.castShadow = true;
          this.group.add(r);
          for (const px of [-1, 0, 1]) {
            const post = new Mesh(new BoxGeometry(0.14, 0.62, 0.14), rail);
            post.position.set(s.x + px * (s.hw + 0.6), 0.25, bz + side * (BRIDGE_HALF_WIDTH - 0.05));
            post.castShadow = true;
            this.group.add(post);
          }
        }
      }
    }

    const stone = new Mesh(
      new CylinderGeometry(PLAZA.r, PLAZA.r + 0.25, 0.12, 56),
      [
        new MeshLambertMaterial({ color: 0x8f877a }),
        new MeshLambertMaterial({ map: flagstoneTexture() }),
        new MeshLambertMaterial({ color: 0x8f877a, side: DoubleSide }),
      ],
    );
    stone.position.set(PLAZA.x, 0.03, PLAZA.z);
    stone.receiveShadow = true;
    this.group.add(stone);
  }

  update(dt: number): void {
    for (const child of this.group.children) {
      const tex = child.userData.scroll as Texture | undefined;
      if (tex) tex.offset.y -= dt * 0.12;
    }
  }
}
