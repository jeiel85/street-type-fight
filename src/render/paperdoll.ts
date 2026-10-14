// 종이인형 캐릭터: 부위(머리·몸통·팔·다리)를 캔버스에 직접 그려 오려 붙이고, 관절을 코드로 움직인다.
// 판 전체를 카메라 쪽으로 눕혀(tilt) 쿼터뷰에서도 납작하지 않게 보이고, 좌우는 판을 뒤집어 표현한다.

import {
  CircleGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Vector3, type Texture,
} from 'three';
import type { Fighter, Team } from '../sim/sim';
import { drawTexture, shade } from './canvas';

const PPU = 160; // 캔버스 픽셀 / 월드 유닛
const PAPER = '#fffdf4';
const INK = '#2b2233';

type Expr = 'normal' | 'shout' | 'hurt' | 'ko';

export interface Look {
  skin: string;
  hair: string;
  hairStyle: number;
  outfit: string;
  pants: string;
  band: string;
  belt: string;
  shoe: string;
}

const SKINS = ['#ffe0c2', '#f7d0a8', '#eebd92', '#d9a57a'];
const HAIRS = ['#2a2230', '#3b2a22', '#5a3a26', '#1f2a3a', '#b8742e', '#7a2f2f'];
const TEAM_OUTFIT: Record<Team, string[]> = {
  blue: ['#3f74c9', '#3568b8', '#4a82d6'],
  red: ['#d24a3a', '#c23f33', '#de5b45'],
  neutral: ['#c8a86a'],
};
const TEAM_BAND: Record<Team, string> = { blue: '#7fc4ff', red: '#ffb347', neutral: '#ffffff' };

export function lookFor(seed: number, team: Team): Look {
  const pick = <T,>(arr: readonly T[], k: number) => arr[Math.abs(Math.floor(seed * 7.31 + k * 3.17)) % arr.length]!;
  const outfit = pick(TEAM_OUTFIT[team], 1);
  return {
    skin: pick(SKINS, 2),
    hair: pick(HAIRS, 3),
    hairStyle: Math.abs(Math.floor(seed * 1.7 + 5)) % 4,
    outfit,
    pants: team === 'red' ? '#4a2a2a' : '#26324d',
    band: TEAM_BAND[team],
    belt: pick(['#1d1d1d', '#f1e6c8', '#7b4b2a'], 4),
    shoe: pick(['#2b2b2b', '#f4f4f4', '#7b4b2a'], 5),
  };
}

// ───────── 그리기 ─────────

/** 종이 오림 느낌: 흰 여백 테두리 → 채우기 → 잉크 외곽선. */
function cut(ctx: CanvasRenderingContext2D, shapes: { path: () => void; fill: string }[], margin = 9): void {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = PAPER;
  ctx.lineWidth = margin * 2;
  for (const s of shapes) { ctx.beginPath(); s.path(); ctx.stroke(); ctx.fillStyle = PAPER; ctx.fill(); }
  for (const s of shapes) {
    ctx.beginPath();
    s.path();
    ctx.fillStyle = s.fill;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3.5;
    ctx.stroke();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.roundRect(x, y, w, h, r);
}

const HEAD_W = 176;
const HEAD_C = { x: 88, y: 96, r: 56 };

function drawHead(look: Look, expr: Expr): Texture {
  return drawTexture(HEAD_W, HEAD_W, (ctx) => {
    const { x: cx, y: cy, r } = HEAD_C;
    const back: { path: () => void; fill: string }[] = [];
    if (look.hairStyle === 1) back.push({ path: () => ctx.ellipse(32, 92, 20, 30, -0.5, 0, Math.PI * 2), fill: look.hair });
    if (look.hairStyle === 2) back.push({ path: () => roundRect(ctx, 34, 62, 92, 92, 30), fill: look.hair });
    if (look.hairStyle === 3) back.push({ path: () => ctx.arc(cx - 6, cy - r - 4, 17, 0, Math.PI * 2), fill: look.hair });
    // 머리띠 꼬리(뒤로 날린다)
    back.push({
      path: () => { ctx.moveTo(40, 70); ctx.lineTo(8, 60); ctx.lineTo(14, 76); ctx.lineTo(36, 80); ctx.closePath(); },
      fill: look.band,
    });
    back.push({
      path: () => { ctx.moveTo(40, 76); ctx.lineTo(14, 96); ctx.lineTo(26, 102); ctx.lineTo(42, 84); ctx.closePath(); },
      fill: look.band,
    });
    const face = { path: () => ctx.arc(cx, cy, r, 0, Math.PI * 2), fill: look.skin };
    const ear = { path: () => ctx.arc(cx - 30, cy + 6, 11, 0, Math.PI * 2), fill: look.skin };
    const hair = {
      path: () => {
        ctx.arc(cx, cy, r + 3, Math.PI * 1.02, Math.PI * 1.98);
        if (look.hairStyle === 0) {
          for (let i = 0; i <= 6; i++) {
            const a = Math.PI * 1.98 - (i / 6) * Math.PI * 0.96;
            const rr = i % 2 ? r + 4 : r + 20;
            ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr - 4);
          }
        }
        // 앞머리 (얼굴 방향인 오른쪽으로 쏠린다)
        ctx.lineTo(cx + r - 2, cy - 4);
        ctx.lineTo(cx + 34, cy - 22);
        ctx.lineTo(cx + 22, cy - 8);
        ctx.lineTo(cx + 8, cy - 26);
        ctx.lineTo(cx - 8, cy - 14);
        ctx.lineTo(cx - 24, cy - 30);
        ctx.lineTo(cx - r + 4, cy + 4);
        ctx.closePath();
      },
      fill: look.hair,
    };
    cut(ctx, [...back, ear, face, hair]);

    // 머리띠
    ctx.strokeStyle = INK;
    ctx.lineWidth = 17;
    ctx.beginPath(); ctx.arc(cx, cy + 4, r - 4, Math.PI * 1.12, Math.PI * 1.9); ctx.stroke();
    ctx.strokeStyle = look.band;
    ctx.lineWidth = 11;
    ctx.beginPath(); ctx.arc(cx, cy + 4, r - 4, Math.PI * 1.13, Math.PI * 1.89); ctx.stroke();

    // 볼
    ctx.fillStyle = 'rgba(255,120,140,0.45)';
    ctx.beginPath(); ctx.ellipse(cx + 12, cy + 24, 9, 5, 0, 0, Math.PI * 2); ctx.ellipse(cx + 48, cy + 22, 7, 5, 0, 0, Math.PI * 2); ctx.fill();

    const ex1 = cx + 16;
    const ex2 = cx + 42;
    const ey = cy + 6;
    ctx.fillStyle = INK;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    if (expr === 'normal' || expr === 'shout') {
      // 눈썹: 싸울 때는 더 사납게
      const k = expr === 'shout' ? 6 : 2;
      ctx.beginPath(); ctx.moveTo(ex1 - 9, ey - 18 - k); ctx.lineTo(ex1 + 8, ey - 14 + k * 0.4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex2 - 7, ey - 14 + k * 0.4); ctx.lineTo(ex2 + 8, ey - 18 - k); ctx.stroke();
      for (const ex of [ex1, ex2]) {
        ctx.fillStyle = INK;
        ctx.beginPath(); ctx.ellipse(ex, ey, 5.5, 9, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(ex + 2, ey - 3.5, 2.4, 0, Math.PI * 2); ctx.fill();
      }
    } else if (expr === 'hurt') {
      for (const [ex, dir] of [[ex1, 1], [ex2, -1]] as const) {
        ctx.beginPath(); ctx.moveTo(ex - 7 * dir, ey - 7); ctx.lineTo(ex + 6 * dir, ey); ctx.lineTo(ex - 7 * dir, ey + 7); ctx.stroke();
      }
      ctx.fillStyle = '#8fd0ff';
      ctx.beginPath(); ctx.moveTo(cx - 26, cy - 34); ctx.quadraticCurveTo(cx - 18, cy - 20, cx - 26, cy - 16); ctx.quadraticCurveTo(cx - 34, cy - 20, cx - 26, cy - 34); ctx.fill();
    } else {
      for (const ex of [ex1, ex2]) {
        ctx.beginPath(); ctx.moveTo(ex - 6, ey - 6); ctx.lineTo(ex + 6, ey + 6); ctx.moveTo(ex + 6, ey - 6); ctx.lineTo(ex - 6, ey + 6); ctx.stroke();
      }
    }

    const mx = cx + 32;
    const my = cy + 30;
    ctx.lineWidth = 3.5;
    if (expr === 'normal') {
      ctx.beginPath(); ctx.moveTo(mx - 8, my); ctx.quadraticCurveTo(mx, my + 5, mx + 7, my - 1); ctx.stroke();
    } else if (expr === 'shout') {
      ctx.fillStyle = '#7a1f2b';
      ctx.beginPath(); ctx.moveTo(mx - 11, my - 4); ctx.lineTo(mx + 11, my - 5); ctx.quadraticCurveTo(mx + 6, my + 14, mx - 4, my + 12); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff8c9a';
      ctx.beginPath(); ctx.ellipse(mx, my + 7, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
    } else if (expr === 'hurt') {
      ctx.beginPath(); ctx.moveTo(mx - 10, my + 2);
      for (let i = 1; i <= 4; i++) ctx.lineTo(mx - 10 + i * 5, my + 2 + (i % 2 ? -4 : 0));
      ctx.stroke();
    } else {
      ctx.fillStyle = '#7a1f2b';
      ctx.beginPath(); ctx.ellipse(mx, my + 3, 6, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  });
}

function drawTorso(look: Look): Texture {
  return drawTexture(104, 104, (ctx) => {
    cut(ctx, [{
      path: () => {
        ctx.moveTo(22, 14); ctx.quadraticCurveTo(52, 4, 84, 14);
        ctx.lineTo(80, 92); ctx.quadraticCurveTo(52, 98, 26, 92); ctx.closePath();
      },
      fill: look.outfit,
    }]);
    // 도복 깃(교차)
    ctx.strokeStyle = shade(look.outfit, 1.45);
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(40, 12); ctx.lineTo(64, 70); ctx.stroke();
    ctx.strokeStyle = shade(look.outfit, 0.7);
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(68, 12); ctx.lineTo(56, 44); ctx.stroke();
    // 그림자 쪽
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath(); ctx.moveTo(24, 16); ctx.lineTo(36, 16); ctx.lineTo(34, 90); ctx.lineTo(27, 90); ctx.closePath(); ctx.fill();
    // 띠
    ctx.fillStyle = look.belt;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(24, 72, 58, 13, 3); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(70, 82); ctx.lineTo(76, 100); ctx.lineTo(82, 98); ctx.lineTo(74, 82); ctx.closePath(); ctx.fill(); ctx.stroke();
  });
}

function drawArm(look: Look): Texture {
  return drawTexture(48, 96, (ctx) => {
    cut(ctx, [
      { path: () => roundRect(ctx, 13, 18, 22, 46, 10), fill: look.skin },
      { path: () => roundRect(ctx, 10, 4, 28, 40, 12), fill: look.outfit },
      { path: () => ctx.arc(24, 74, 14, 0, Math.PI * 2), fill: '#fbf7ee' },
    ], 6);
    // 주먹 붕대
    ctx.strokeStyle = '#c9c0ae';
    ctx.lineWidth = 2;
    for (const y of [68, 74, 80]) { ctx.beginPath(); ctx.moveTo(12, y); ctx.lineTo(36, y - 3); ctx.stroke(); }
  });
}

function drawLeg(look: Look): Texture {
  return drawTexture(56, 100, (ctx) => {
    cut(ctx, [
      { path: () => { ctx.moveTo(14, 6); ctx.lineTo(42, 6); ctx.lineTo(39, 76); ctx.lineTo(17, 76); ctx.closePath(); }, fill: look.pants },
      { path: () => roundRect(ctx, 12, 72, 38, 18, 8), fill: look.shoe },
    ], 6);
  });
}

function drawDummyBody(): Texture {
  return drawTexture(104, 104, (ctx) => {
    cut(ctx, [{ path: () => roundRect(ctx, 20, 8, 64, 88, 22), fill: '#d9b46a' }]);
    ctx.strokeStyle = '#a07b3a';
    ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) { ctx.beginPath(); ctx.moveTo(26 + i * 4, 12); ctx.lineTo(24 + i * 4.2, 92); ctx.stroke(); }
    ctx.strokeStyle = '#7b4b2a';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(20, 40); ctx.lineTo(84, 40); ctx.moveTo(20, 70); ctx.lineTo(84, 70); ctx.stroke();
  });
}

function drawDummyHead(hurt: boolean): Texture {
  return drawTexture(HEAD_W, HEAD_W, (ctx) => {
    const { x: cx, y: cy, r } = HEAD_C;
    cut(ctx, [{ path: () => ctx.arc(cx, cy, r - 4, 0, Math.PI * 2), fill: '#e8d3a4' }]);
    ctx.strokeStyle = '#8a6a3a';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.arc(cx, cy, r - 14, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 5;
    for (const ex of [cx - 16, cx + 18]) {
      ctx.beginPath();
      if (hurt) { ctx.moveTo(ex - 7, cy - 7); ctx.lineTo(ex + 7, cy + 7); ctx.moveTo(ex + 7, cy - 7); ctx.lineTo(ex - 7, cy + 7); }
      else ctx.arc(ex, cy, 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(cx - 14, cy + 26); ctx.lineTo(cx + 16, cy + 24); ctx.stroke();
    // 과녁 표시
    ctx.strokeStyle = '#d9534f';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(cx + 2, cy - 30, 9, 0, Math.PI * 2); ctx.stroke();
  });
}

function drawPost(): Texture {
  return drawTexture(56, 100, (ctx) => {
    cut(ctx, [{ path: () => roundRect(ctx, 20, 0, 16, 100, 4), fill: '#8a5a30' }], 5);
  });
}

// ───────── 조립 ─────────

const shadowGeo = new CircleGeometry(0.42, 20).rotateX(-Math.PI / 2);

interface Limb { pivot: Group; mesh: Mesh }

function partMesh(tex: Texture, wPx: number, hPx: number, pivotPx: number, pivotPy: number): Mesh {
  const geo = new PlaneGeometry(wPx / PPU, hPx / PPU);
  geo.translate(-(pivotPx - wPx / 2) / PPU, -(hPx / 2 - pivotPy) / PPU, 0);
  const mat = new MeshBasicMaterial({ map: tex, alphaTest: 0.5, side: DoubleSide, toneMapped: false });
  return new Mesh(geo, mat);
}

function limb(parent: Group, mesh: Mesh, x: number, y: number, z: number): Limb {
  const pivot = new Group();
  pivot.position.set(x, y, z);
  pivot.add(mesh);
  parent.add(pivot);
  return { pivot, mesh };
}

/** 같은 모양새(look)의 텍스처는 한 번만 그린다. */
const texCache = new Map<string, Texture>();
function cached(key: string, make: () => Texture): Texture {
  let t = texCache.get(key);
  if (!t) { t = make(); texCache.set(key, t); }
  return t;
}

export class PaperDoll {
  readonly root = new Group();
  readonly shadow: Mesh;
  private readonly flip = new Group();
  private readonly body = new Group();
  private readonly head: Limb;
  private readonly torso: Mesh;
  private readonly armF: Limb;
  private readonly armB: Limb;
  private readonly legF: Limb;
  private readonly legB: Limb;
  private readonly heads: Record<Expr, Texture>;
  private readonly tinted: { mat: MeshBasicMaterial; base: number }[] = [];
  private readonly topMarker = new Group();
  private faceScale = 1;
  private pulse = 0;
  private wasAlive = true;
  private popIn = 1;
  private wobble = 0;
  private wobbleV = 0;

  constructor(private readonly f: Fighter, tilt: number) {
    const look = lookFor(f.look, f.team);
    const key = JSON.stringify(look);
    if (f.isDummy) {
      const normal = cached('dummy-head', () => drawDummyHead(false));
      const hurt = cached('dummy-head-hurt', () => drawDummyHead(true));
      this.heads = { normal, shout: normal, hurt, ko: hurt };
    } else {
      this.heads = {
        normal: cached(`${key}:normal`, () => drawHead(look, 'normal')),
        shout: cached(`${key}:shout`, () => drawHead(look, 'shout')),
        hurt: cached(`${key}:hurt`, () => drawHead(look, 'hurt')),
        ko: cached(`${key}:ko`, () => drawHead(look, 'ko')),
      };
    }
    const torsoTex = f.isDummy ? cached('dummy-body', drawDummyBody) : cached(`${key}:torso`, () => drawTorso(look));
    const armTex = f.isDummy ? cached('dummy-arm', () => drawArm({ ...look, skin: '#d9b46a', outfit: '#c49a52' })) : cached(`${key}:arm`, () => drawArm(look));
    const legTex = f.isDummy ? cached('dummy-post', drawPost) : cached(`${key}:leg`, () => drawLeg(look));

    // 부위 깊이 순서(카메라 쪽이 +z): 뒷다리 < 뒷팔 < 몸통 < 앞다리 < 머리 < 앞팔
    this.legB = limb(this.body, partMesh(legTex, 56, 100, 28, 8), -0.06, 0.52, -0.03);
    this.armB = limb(this.body, partMesh(armTex, 48, 96, 24, 12), -0.07, 0.9, -0.02);
    this.torso = partMesh(torsoTex, 104, 104, 52, 92);
    this.torso.position.set(0, 0.44, 0);
    this.body.add(this.torso);
    this.legF = limb(this.body, partMesh(legTex, 56, 100, 28, 8), 0.07, 0.52, 0.01);
    this.head = limb(this.body, partMesh(this.heads.normal, HEAD_W, HEAD_W, 86, 150), 0.02, 0.93, 0.02);
    this.armF = limb(this.body, partMesh(armTex, 48, 96, 24, 12), 0.1, 0.88, 0.03);
    if (f.isDummy) {
      this.legB.pivot.visible = false;
      this.legF.pivot.position.set(0, 0.55, 0.01);
    }
    this.topMarker.position.set(0, 1.95, 0);
    this.body.add(this.topMarker);

    for (const [m, base] of [
      [this.legB.mesh, 0.68], [this.armB.mesh, 0.68], [this.torso, 1], [this.legF.mesh, 1], [this.head.mesh, 1], [this.armF.mesh, 1],
    ] as const) {
      const mat = m.material as MeshBasicMaterial;
      mat.color.setScalar(base);
      this.tinted.push({ mat, base });
    }

    this.flip.add(this.body);
    this.root.add(this.flip);
    this.root.rotation.x = -tilt;
    this.root.position.set(f.x, 0, f.z);

    this.shadow = new Mesh(shadowGeo, new MeshBasicMaterial({ color: 0x1b2a12, transparent: true, opacity: 0.32, depthWrite: false }));
    this.shadow.position.set(f.x, 0.03, f.z);
    this.shadow.renderOrder = 1;
  }

  /** 잽을 맞을 때 등 짧게 하얗게 번쩍. */
  flash(amount = 0.12): void {
    this.pulse = Math.max(this.pulse, amount);
    if (this.f.isDummy) this.wobbleV += 9;
  }

  headTop(out: Vector3): Vector3 {
    return this.topMarker.getWorldPosition(out);
  }

  update(time: number, dt: number, alpha: number): void {
    const f = this.f;
    const x = f.prevX + (f.x - f.prevX) * alpha;
    const z = f.prevZ + (f.z - f.prevZ) * alpha;
    const t = time - f.animAt;

    if (!f.alive) {
      // KO: 날아가며 빙글빙글 돌다 별이 된다.
      const k = Math.min(1, t / 1.0);
      this.root.position.set(x - f.facing * t * 3, Math.max(0, 7 * t - 9 * t * t) + k * 0.5, z);
      this.flip.rotation.z += dt * 14 * -f.facing;
      const s = t < 0.55 ? 1 : Math.max(0, 1 - (t - 0.55) / 0.35);
      this.root.scale.setScalar(s);
      this.head.mesh.material = this.matWith(this.head.mesh, this.heads.ko);
      this.shadow.visible = false;
      this.wasAlive = false;
      return;
    }
    if (!this.wasAlive) {
      this.wasAlive = true;
      this.popIn = 0;
      this.flip.rotation.z = 0;
    }
    this.popIn = Math.min(1, this.popIn + dt * 4);
    const pop = this.popIn < 1 ? 1 + Math.sin(this.popIn * Math.PI) * 0.25 : 1;
    this.root.scale.set(this.popIn * pop, this.popIn * pop, 1);
    this.root.position.set(x, 0, z);
    this.shadow.visible = true;
    this.shadow.position.set(x, 0.03, z);

    // 방향 전환은 종이를 뒤집듯 폭이 0을 지나간다.
    this.faceScale += (f.facing - this.faceScale) * Math.min(1, dt * 22);
    this.flip.scale.x = this.faceScale;

    this.pose(f, t, time);

    this.pulse = Math.max(0, this.pulse - dt);
    const guard = f.guardUntil > time;
    for (const { mat, base } of this.tinted) {
      if (f.anim === 'hit' && t < 0.25) mat.color.setRGB(base * 2.2, base * 0.75, base * 0.75);
      else if (this.pulse > 0) mat.color.setScalar(base * 2.4);
      else if (guard) mat.color.setRGB(base * 0.8, base * 0.95, base * 1.35);
      else mat.color.setScalar(base);
    }
  }

  private matWith(mesh: Mesh, tex: Texture): MeshBasicMaterial {
    const mat = mesh.material as MeshBasicMaterial;
    if (mat.map !== tex) mat.map = tex;
    return mat;
  }

  private pose(f: Fighter, t: number, time: number): void {
    const b = this.body;
    let bodyY = 0;
    let lean = 0;
    let headRot = 0;
    // 팔 각도: 0 = 아래로 늘어뜨림, π/2 = 정면으로 뻗음, 그 이상 = 위로. 기본은 주먹을 턱 앞에 든 자세.
    let aF = 1.8, aB = 1.45, lF = 0.25, lB = -0.2;
    let aFx = 0, aFs = 1, aBx = 0, aBs = 1;
    let expr: Expr = 'normal';
    const breathe = Math.sin(time * 4 + f.look) * 0.02;

    switch (f.anim) {
      case 'idle':
        bodyY = breathe;
        aF += breathe * 2;
        break;
      case 'walk': {
        const ph = time * 11;
        lF = Math.sin(ph) * 0.65;
        lB = -Math.sin(ph) * 0.65;
        aF = 1.7 + Math.sin(ph) * 0.15;
        aB = 1.35 - Math.sin(ph) * 0.15;
        bodyY = Math.abs(Math.sin(ph)) * 0.05;
        lean = -0.06;
        break;
      }
      case 'jab': {
        const k = Math.sin(Math.min(1, t / 0.14) * Math.PI);
        if (f.jabSide === 0) { aF = 1.6; aFx = 0.16 * k; aFs = 1 + 0.35 * k; }
        else { aB = 1.6; aBx = 0.2 * k; aBs = 1 + 0.4 * k; }
        lean = -0.12 * k;
        expr = 'shout';
        break;
      }
      case 'finisher': {
        const k = Math.min(1, t / 0.3);
        aF = 0.6 + k * 2.2;
        aFs = 1.25;
        bodyY = Math.sin(k * Math.PI) * 0.18;
        lean = 0.1 - k * 0.25;
        lF = 0.5;
        expr = 'shout';
        break;
      }
      case 'cast':
        aF = 1.62; aB = 1.55; aFx = 0.1; aBx = 0.12; aFs = 1.2; aBs = 1.2;
        lean = -0.08;
        bodyY = Math.sin(time * 30) * 0.015;
        expr = 'shout';
        break;
      case 'dash':
        lF = 1.55; lB = -0.3; aF = -0.5; aB = 0.4;
        lean = 0.3;
        bodyY = 0.12;
        expr = 'shout';
        break;
      case 'whirl':
        aF = 1.57; aB = 1.57; aFs = 1.2; aBs = 1.2;
        this.flip.scale.x = Math.sin(time * 40) >= 0 ? 1 : -1;
        expr = 'shout';
        break;
      case 'guard':
      case 'block':
        aF = 2.3; aB = 2.0; aFx = 0.05;
        bodyY = -0.05;
        lF = 0.4; lB = -0.35;
        break;
      case 'hit':
        lean = 0.32 * Math.max(0, 1 - t / 0.3);
        headRot = 0.25;
        aF = -0.5; aB = -0.9;
        expr = 'hurt';
        break;
      case 'fumble':
        lean = -0.28 * Math.sin(Math.min(1, t / 0.3) * Math.PI);
        aF = 2.8; aB = -0.6;
        headRot = -0.2;
        expr = 'hurt';
        break;
      case 'ko':
        expr = 'ko';
        break;
    }

    if (f.isDummy) {
      // 허수아비: 팔은 벌린 채, 맞으면 용수철처럼 흔들린다.
      this.wobbleV += (-this.wobble * 60 - this.wobbleV * 6) * (1 / 60);
      this.wobble += this.wobbleV * (1 / 60);
      b.rotation.z = this.wobble * 0.08;
      this.armF.pivot.rotation.z = 1.5;
      this.armB.pivot.rotation.z = -1.5;
      this.legF.pivot.rotation.z = 0;
      this.head.mesh.material = this.matWith(this.head.mesh, f.lastHitAt > time - 0.4 ? this.heads.hurt : this.heads.normal);
      return;
    }

    b.position.y = bodyY;
    b.rotation.z = lean;
    this.head.pivot.rotation.z = headRot;
    this.armF.pivot.rotation.z = aF;
    this.armF.pivot.position.x = 0.1 + aFx;
    this.armF.mesh.scale.y = aFs;
    this.armB.pivot.rotation.z = aB;
    this.armB.pivot.position.x = -0.07 + aBx;
    this.armB.mesh.scale.y = aBs;
    this.legF.pivot.rotation.z = lF;
    this.legB.pivot.rotation.z = lB;
    this.head.mesh.material = this.matWith(this.head.mesh, this.heads[expr]);
  }

  dispose(): void {
    this.root.removeFromParent();
    this.shadow.removeFromParent();
  }
}
