// 소품: 기와집, 나무, 바위, 장승, 깃발, 석등, 풀. 전부 도형 조합 + 캔버스 그림.

import {
  BoxGeometry, Color, ConeGeometry, CylinderGeometry, DodecahedronGeometry, DoubleSide, Group, IcosahedronGeometry,
  InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry, Quaternion, Vector3,
  type BufferAttribute, type BufferGeometry, type Texture,
} from 'three';
import { mulberry32 } from '../sim/rng';
import {
  BOUNDS, HOUSES, JANGSEUNGS, PLAZA, ROCKS, ROADS, ROAD_HALF_WIDTH, STREAMS, TRAINING_GROUND, TREES, VILLAGES,
  distToSegment, type House,
} from '../sim/world';
import { KOREAN_FONT, drawTexture } from './canvas';
import { groundHeight } from './terrain';

const TEAM_ROOF: Record<string, number> = { blue: 0x3d6fb6, red: 0xc0453a, neutral: 0x7a6a5a };

function wallTexture(door: boolean): Texture {
  return drawTexture(256, 192, (ctx) => {
    ctx.fillStyle = '#f3ead6';
    ctx.fillRect(0, 0, 256, 192);
    ctx.fillStyle = '#6b4424';
    ctx.fillRect(0, 0, 256, 14);
    ctx.fillRect(0, 0, 14, 192);
    ctx.fillRect(242, 0, 14, 192);
    ctx.fillRect(122, 0, 12, 192);
    // 창호(격자창)
    const lattice = (x: number, y: number, w: number, h: number) => {
      ctx.fillStyle = '#fbf6e8';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#7a5130';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, w, h);
      ctx.lineWidth = 1.6;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath(); ctx.moveTo(x + (w * i) / 4, y); ctx.lineTo(x + (w * i) / 4, y + h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y + (h * i) / 4); ctx.lineTo(x + w, y + (h * i) / 4); ctx.stroke();
      }
    };
    if (door) {
      lattice(150, 52, 70, 140);
      lattice(32, 60, 70, 60);
    } else {
      lattice(36, 56, 64, 64);
      lattice(156, 56, 64, 64);
    }
    ctx.fillStyle = '#9b8b74';
    ctx.fillRect(0, 176, 256, 16);
  });
}

function makeHouse(h: House): Group {
  const g = new Group();
  const front = new MeshLambertMaterial({ map: wallTexture(true) });
  const side = new MeshLambertMaterial({ map: wallTexture(false) });
  const walls = new Mesh(new BoxGeometry(h.hw * 2, h.h, h.hd * 2), [side, side, side, side, front, side]);
  walls.position.y = h.h / 2 + 0.25;
  const base = new Mesh(new BoxGeometry(h.hw * 2 + 0.4, 0.3, h.hd * 2 + 0.4), new MeshLambertMaterial({ color: 0x9a9184 }));
  base.position.y = 0.12;

  // 팔작지붕 느낌: 네모뿔을 납작하게 눌러 처마를 길게 뺀다.
  const roofColor = TEAM_ROOF[h.team] ?? 0x666666;
  const roof = new Mesh(new ConeGeometry(1, 1, 4, 1), new MeshLambertMaterial({ color: roofColor, flatShading: true }));
  roof.rotation.y = Math.PI / 4;
  roof.scale.set((h.hw + 0.75) * Math.SQRT2, 1.25, (h.hd + 0.75) * Math.SQRT2);
  roof.position.y = h.h + 0.25 + 0.62;
  const ridge = new Mesh(new BoxGeometry(Math.max(0.4, (h.hw - h.hd) * 2 + 0.6), 0.14, 0.2), new MeshLambertMaterial({ color: 0xf2efe6 }));
  ridge.position.y = h.h + 0.25 + 1.22;
  if (h.hd > h.hw) ridge.rotation.y = Math.PI / 2;

  for (const m of [walls, base, roof, ridge]) {
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  g.position.set(h.x, 0, h.z);
  return g;
}

function jangseungTexture(top: string, bottom: string, face: string): Texture {
  return drawTexture(128, 256, (ctx) => {
    ctx.fillStyle = '#b48a5a';
    ctx.fillRect(0, 0, 128, 256);
    ctx.strokeStyle = 'rgba(90,60,30,0.35)';
    for (let i = 0; i < 12; i++) {
      ctx.beginPath(); ctx.moveTo(0, 20 + i * 20); ctx.lineTo(128, 24 + i * 20); ctx.stroke();
    }
    ctx.fillStyle = face;
    ctx.beginPath(); ctx.ellipse(64, 46, 46, 40, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(44, 40, 12, 0, Math.PI * 2); ctx.arc(84, 40, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(46, 41, 6, 0, Math.PI * 2); ctx.arc(82, 41, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(40, 66, 48, 12);
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 66, 48, 12);
    for (let x = 48; x < 88; x += 8) { ctx.beginPath(); ctx.moveTo(x, 66); ctx.lineTo(x, 78); ctx.stroke(); }
    ctx.fillStyle = '#1d1d1d';
    ctx.font = `bold 26px ${KOREAN_FONT}`;
    ctx.textAlign = 'center';
    [...top].forEach((ch, i) => ctx.fillText(ch, 64, 116 + i * 28));
    ctx.font = `bold 20px ${KOREAN_FONT}`;
    ctx.fillText(bottom, 64, 248);
  });
}

function makeJangseung(x: number, z: number, male: boolean): Group {
  const g = new Group();
  const tex = male ? jangseungTexture('천하대', '장군', '#d9534f') : jangseungTexture('지하여', '장군', '#e8a04a');
  const body = new Mesh(new CylinderGeometry(0.26, 0.3, 2.2, 10), [
    new MeshLambertMaterial({ map: tex }),
    new MeshLambertMaterial({ color: 0x9b744a }),
    new MeshLambertMaterial({ color: 0x9b744a }),
  ]);
  body.position.y = 1.1;
  body.rotation.y = -Math.PI / 2; // 얼굴(텍스처 가운데)이 카메라 쪽(+z)을 보게
  const hat = new Mesh(new ConeGeometry(0.42, 0.55, 10), new MeshLambertMaterial({ color: 0x2a2a2a }));
  hat.position.y = 2.45;
  for (const m of [body, hat]) { m.castShadow = true; g.add(m); }
  g.position.set(x, 0, z);
  return g;
}

function makeFlag(x: number, z: number, team: 'blue' | 'red', label: string): { group: Group; cloth: Mesh } {
  const g = new Group();
  const pole = new Mesh(new CylinderGeometry(0.06, 0.07, 4.2, 8), new MeshLambertMaterial({ color: 0x5b3a1e }));
  pole.position.y = 2.1;
  pole.castShadow = true;
  const color = team === 'blue' ? '#2f63b5' : '#c23b31';
  const tex = drawTexture(192, 128, (ctx) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 192, 128);
    ctx.fillStyle = '#f7e9c4';
    for (let i = 0; i < 8; i++) ctx.fillRect(i * 24 + 4, 116, 14, 12);
    ctx.beginPath();
    ctx.arc(96, 58, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.font = `bold 34px ${KOREAN_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 96, 60);
  });
  const clothGeo = new PlaneGeometry(1.8, 1.2, 12, 1);
  clothGeo.translate(0.9, 0, 0);
  const cloth = new Mesh(clothGeo, new MeshLambertMaterial({ map: tex, side: DoubleSide }));
  cloth.position.set(0.07, 3.5, 0);
  cloth.castShadow = true;
  g.add(pole, cloth);
  g.position.set(x, 0, z);
  return { group: g, cloth };
}

function makeStoneLantern(x: number, z: number): Group {
  const g = new Group();
  const stone = new MeshLambertMaterial({ color: 0xa8a090, flatShading: true });
  const parts: [BoxGeometry | CylinderGeometry, number][] = [
    [new BoxGeometry(0.6, 0.18, 0.6), 0.09],
    [new CylinderGeometry(0.12, 0.14, 0.7, 6), 0.53],
    [new BoxGeometry(0.5, 0.36, 0.5), 1.06],
  ];
  for (const [geo, y] of parts) {
    const m = new Mesh(geo, stone);
    m.position.y = y;
    m.castShadow = true;
    g.add(m);
  }
  const glow = new Mesh(new BoxGeometry(0.3, 0.2, 0.52), new MeshBasicMaterial({ color: 0xffd27a }));
  glow.position.y = 1.06;
  const cap = new Mesh(new ConeGeometry(0.46, 0.32, 4), stone);
  cap.rotation.y = Math.PI / 4;
  cap.position.y = 1.4;
  cap.castShadow = true;
  g.add(glow, cap);
  g.position.set(x, 0, z);
  return g;
}

function makeSign(x: number, z: number, text: string): Group {
  const g = new Group();
  const wood = new MeshLambertMaterial({ color: 0x7b5230 });
  const post = new Mesh(new BoxGeometry(0.14, 1.3, 0.14), wood);
  post.position.y = 0.65;
  const tex = drawTexture(256, 96, (ctx) => {
    ctx.fillStyle = '#c99a62';
    ctx.fillRect(0, 0, 256, 96);
    ctx.strokeStyle = '#6b4424';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, 248, 88);
    ctx.fillStyle = '#3a2412';
    ctx.font = `bold 44px ${KOREAN_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 50);
  });
  const board = new Mesh(new BoxGeometry(1.4, 0.52, 0.08), [wood, wood, wood, wood, new MeshLambertMaterial({ map: tex }), wood]);
  board.position.y = 1.3;
  for (const m of [post, board]) { m.castShadow = true; g.add(m); }
  g.position.set(x, 0, z);
  return g;
}

/** 같은 도형을 많이 깔 때는 InstancedMesh 하나로 그린다. */
function instanced(
  geo: BufferGeometry,
  mat: MeshLambertMaterial,
  items: { pos: Vector3; scale: Vector3; rotY: number; color?: number }[],
  shadow: boolean,
): InstancedMesh {
  const mesh = new InstancedMesh(geo, mat, items.length);
  const m = new Matrix4();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  items.forEach((it, i) => {
    q.setFromAxisAngle(up, it.rotY);
    m.compose(it.pos, q, it.scale);
    mesh.setMatrixAt(i, m);
    if (it.color !== undefined) mesh.setColorAt(i, new Color(it.color));
  });
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  return mesh;
}

export class Props {
  readonly group = new Group();
  private readonly flags: Mesh[] = [];
  private readonly houses: { def: House; mats: MeshLambertMaterial[]; opacity: number }[] = [];
  private t = 0;

  constructor() {
    for (const h of HOUSES) {
      const g = makeHouse(h);
      const mats: MeshLambertMaterial[] = [];
      g.traverse((o) => {
        if (!(o instanceof Mesh)) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (m instanceof MeshLambertMaterial && !mats.includes(m)) {
            m.transparent = true;
            mats.push(m);
          }
        }
      });
      this.houses.push({ def: h, mats, opacity: 1 });
      this.group.add(g);
    }
    JANGSEUNGS.forEach((j, i) => this.group.add(makeJangseung(j.x, j.z, i % 2 === 0)));

    for (const v of VILLAGES) {
      const team = v.team === 'red' ? 'red' : 'blue';
      const { group, cloth } = makeFlag(v.x, v.z - 2.6, team, team === 'blue' ? '청룡' : '주작');
      this.group.add(group);
      this.flags.push(cloth);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      this.group.add(makeStoneLantern(PLAZA.x + Math.cos(a) * (PLAZA.r + 0.9), PLAZA.z + Math.sin(a) * (PLAZA.r + 0.9)));
    }
    this.group.add(makeSign(TRAINING_GROUND.x + 2.4, TRAINING_GROUND.z - 2.2, '수련장'));

    this.addTrees();
    this.addRocks();
    this.addGrass();
  }

  private addTrees(): void {
    const rng = mulberry32(7);
    const trunks: Parameters<typeof instanced>[2] = [];
    const leaves: Parameters<typeof instanced>[2] = [];
    const palette = [0x3f8a3a, 0x4d9a3f, 0x5aa646, 0x3a7d44, 0x6aa84a];
    for (const t of TREES) {
      const s = 0.85 + rng() * 0.5;
      const y = groundHeight(t.x, t.z);
      trunks.push({ pos: new Vector3(t.x, y + 0.55 * s, t.z), scale: new Vector3(s, s, s), rotY: 0, color: 0x7a5232 });
      const autumn = rng() < 0.12;
      const col = autumn ? (rng() < 0.5 ? 0xe0a03a : 0xd0603a) : palette[Math.floor(rng() * palette.length)]!;
      leaves.push({ pos: new Vector3(t.x, y + 1.55 * s, t.z), scale: new Vector3(1.0 * s, 0.95 * s, 1.0 * s), rotY: rng() * 6, color: col });
      leaves.push({
        pos: new Vector3(t.x + (rng() - 0.5) * 0.4, y + 2.15 * s, t.z + (rng() - 0.5) * 0.4),
        scale: new Vector3(0.68 * s, 0.68 * s, 0.68 * s), rotY: rng() * 6, color: col,
      });
    }
    this.group.add(instanced(new CylinderGeometry(0.13, 0.19, 1.1, 6), new MeshLambertMaterial(), trunks, true));
    this.group.add(instanced(new IcosahedronGeometry(0.85, 0), new MeshLambertMaterial({ flatShading: true }), leaves, true));
  }

  private addRocks(): void {
    const rng = mulberry32(11);
    const items = ROCKS.map((r) => ({
      pos: new Vector3(r.x, groundHeight(r.x, r.z) + r.r * 0.35, r.z),
      scale: new Vector3(r.r * 1.15, r.r * 0.8, r.r),
      rotY: rng() * 6,
      color: [0x9a9a92, 0x8a8d86, 0xa9a49a][Math.floor(rng() * 3)],
    }));
    this.group.add(instanced(new DodecahedronGeometry(1, 0), new MeshLambertMaterial({ flatShading: true }), items, true));
  }

  private addGrass(): void {
    const rng = mulberry32(13);
    const tufts: Parameters<typeof instanced>[2] = [];
    const flowers: Parameters<typeof instanced>[2] = [];
    const blocked = (x: number, z: number) =>
      VILLAGES.some((v) => Math.hypot(x - v.x, z - v.z) < v.r) ||
      Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r + 0.5 ||
      ROADS.some((s) => distToSegment(x, z, s) < ROAD_HALF_WIDTH + 0.2) ||
      STREAMS.some((s) => Math.abs(x - s.x) < s.hw + 0.8);
    for (let i = 0; i < 1400; i++) {
      const x = BOUNDS.minX + rng() * (BOUNDS.maxX - BOUNDS.minX);
      const z = BOUNDS.minZ + rng() * (BOUNDS.maxZ - BOUNDS.minZ);
      if (blocked(x, z)) continue;
      const y = groundHeight(x, z);
      if (rng() < 0.82) {
        const s = 0.5 + rng() * 0.5;
        tufts.push({ pos: new Vector3(x, y + 0.12 * s, z), scale: new Vector3(s, s, s), rotY: rng() * 6, color: rng() < 0.5 ? 0x6fa844 : 0x86b94e });
      } else {
        flowers.push({
          pos: new Vector3(x, y + 0.1, z), scale: new Vector3(1, 1, 1), rotY: 0,
          color: [0xffffff, 0xffe14d, 0xff8fb1, 0xc79bff][Math.floor(rng() * 4)],
        });
      }
    }
    this.group.add(instanced(new ConeGeometry(0.12, 0.3, 4), new MeshLambertMaterial({ flatShading: true }), tufts, false));
    this.group.add(instanced(new IcosahedronGeometry(0.07, 0), new MeshLambertMaterial(), flowers, false));
  }

  /** focus(보통 내 캐릭터)가 집 뒤에 가려지면 그 집을 반투명하게 만든다. */
  update(dt: number, focus: { x: number; z: number } | null): void {
    this.t += dt;
    for (const h of this.houses) {
      const d = h.def;
      const hidden = !!focus &&
        Math.abs(focus.x - d.x) < d.hw + 1.4 &&
        focus.z < d.z + d.hd + 0.4 &&
        focus.z > d.z - d.hd - d.h * 1.6;
      const target = hidden ? 0.3 : 1;
      if (h.opacity === target) continue;
      h.opacity += Math.sign(target - h.opacity) * Math.min(Math.abs(target - h.opacity), dt * 4);
      for (const m of h.mats) m.opacity = h.opacity;
    }
    // 깃발 펄럭임: 깃대에서 멀수록 크게 흔든다.
    for (const cloth of this.flags) {
      const pos = cloth.geometry.attributes.position as BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        pos.setZ(i, Math.sin(this.t * 4 + x * 3) * 0.12 * x);
      }
      pos.needsUpdate = true;
    }
  }
}
