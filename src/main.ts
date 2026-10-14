// 진입점: 장면 조립, 입력, 고정 간격 시뮬레이션 루프, 사건 → 연출·소리·HUD 연결.

import './style.css';
import { Vector3 } from 'three';
import { Sfx } from './audio/sfx';
import { Fx } from './render/fx';
import { PaperDoll, releaseDollTextures } from './render/paperdoll';
import { Props } from './render/props';
import { Stage } from './render/stage';
import { Terrain } from './render/terrain';
import { BotBrain, makeProfile } from './sim/bot';
import { Sim, spawnPoint, type Fighter, type SimEvent, type TargetStrategy } from './sim/sim';
import { BRAWLER_KIT } from './sim/skills';
import { PLAZA, TRAINING_DUMMY } from './sim/world';
import { CONFIG } from './config';
import { tokenFromCode } from './typing/dubeolsik';
import { Hud, type Difficulty } from './ui/hud';
import { GAME_URL, canvasToPng, captureScene, renderScoreCard, shareText, type ScoreCardData } from './ui/scorecard';
import { WorldLabels } from './ui/labels';

const STEP = 1 / CONFIG.tickHz;
const ME = 'me';

const BLUE_NAMES = ['번개손', '독수리타법', '키보드전사', '무쇠손가락', '청룡펀치', '한타신동'];
const RED_NAMES = ['타자왕', '쌍권총', '손가락귀신', '철권타자', '불꽃자판', '주작발톱'];
/** 상대 실력(0~1)의 분포. 아군은 한 단계 아래로 맞춰 플레이어가 주인공이 되게 한다. */
const LEVELS: Record<Difficulty, { enemy: number[]; ally: number[] }> = {
  0: { enemy: [0, 0.1, 0.2, 0.3], ally: [0.1, 0.25, 0.4] },
  1: { enemy: [0.25, 0.4, 0.55, 0.7], ally: [0.2, 0.35, 0.5] },
  2: { enemy: [0.6, 0.75, 0.9, 1.0], ally: [0.45, 0.6, 0.75] },
};

function shuffled<T>(arr: readonly T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

class Match {
  readonly sim: Sim;
  readonly brains: BotBrain[] = [];
  readonly dolls = new Map<string, PaperDoll>();
  readonly meId: string | null;

  constructor(private readonly stage: Stage, withPlayer: boolean, diff: Difficulty) {
    const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    this.sim = new Sim(seed);
    const rng = this.sim.rng;
    const levels = LEVELS[diff];
    const blue = shuffled(BLUE_NAMES, rng);
    const red = shuffled(RED_NAMES, rng);

    if (withPlayer) {
      this.add({ id: ME, name: '나', team: 'blue', spawn: spawnPoint('blue', rng), look: 3 });
      this.meId = ME;
    } else {
      this.meId = null;
    }
    const allyLevels = withPlayer ? levels.ally : [...levels.ally, 0.5];
    allyLevels.forEach((lv, i) => this.addBot(`b${i}`, blue[i]!, 'blue', lv));
    levels.enemy.forEach((lv, i) => this.addBot(`r${i}`, red[i]!, 'red', lv));
    this.add({ id: 'dummy', name: '허수아비', team: 'neutral', isDummy: true, spawn: TRAINING_DUMMY });
  }

  private addBot(id: string, name: string, team: 'blue' | 'red', level: number): void {
    const strategies: TargetStrategy[] = ['nearest', 'revenge', 'finish'];
    const rng = this.sim.rng;
    this.add({
      id, name, team, isBot: true, spawn: spawnPoint(team, rng), look: Math.floor(rng() * 1000),
      strategy: strategies[Math.floor(rng() * 3)],
    });
    this.brains.push(new BotBrain(id, makeProfile(rng, level)));
  }

  private add(init: Parameters<Sim['addFighter']>[0]): void {
    const f = this.sim.addFighter(init);
    const doll = new PaperDoll(f, this.stage.tilt);
    this.dolls.set(f.id, doll);
    this.stage.scene.add(doll.root, doll.shadow);
  }

  dispose(): void {
    for (const d of this.dolls.values()) d.dispose();
    releaseDollTextures();
  }
}

// ───────── 조립 ─────────

const app = document.getElementById('app')!;
let stage: Stage;
try {
  stage = new Stage(app);
} catch (err) {
  // WebGL을 못 쓰는 브라우저·기기: 빈 화면 대신 이유를 보여 주고, 원인은 콘솔에 그대로 남긴다.
  app.innerHTML = `<div class="overlay"><div class="panel small"><h2>3D를 켤 수 없어요</h2>
    <p>이 브라우저에서 WebGL을 사용할 수 없습니다. 최신 Chrome·Edge·Firefox에서 하드웨어 가속을 켜고 다시 열어 주세요.</p></div></div>`;
  throw err;
}
/** 마우스 같은 정밀 포인터가 하나도 없으면 폰·태블릿으로 본다(키보드가 없을 가능성이 큼). */
const touchOnly = !window.matchMedia('(any-pointer: fine)').matches;
let shareNote = '';
const terrain = new Terrain();
const props = new Props();
stage.scene.add(terrain.group, props.group);
const fx = new Fx(stage.scene, stage.tilt);
const sfx = new Sfx();
const hud = new Hud(app);
const labels = new WorldLabels(app, stage.camera);

type Mode = 'title' | 'play' | 'pause' | 'result';
let mode: Mode = 'title';
let difficulty: Difficulty = 1;
let match = new Match(stage, false, difficulty);
let acc = 0;
let resultAt = -1;
let attractTarget: string | null = null;
let attractUntil = 0;
const held = new Set<string>();

// ───────── 점수 카드 ─────────

let pendingShot = false;
let sceneShot: HTMLCanvasElement | null = null;
let card: { blob: Blob; url: string; data: ScoreCardData } | null = null;
const canCopyImage = 'ClipboardItem' in window && typeof navigator.clipboard?.write === 'function';
const canShareFiles = (() => {
  try {
    return typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [new File([''], 'card.png', { type: 'image/png' })] });
  } catch {
    return false; // 파일 공유 판별 자체를 못 하는 브라우저
  }
})();

function clearCard(): void {
  if (card) URL.revokeObjectURL(card.url);
  card = null;
  sceneShot = null;
  pendingShot = false;
}

async function prepareCard(data: ScoreCardData): Promise<void> {
  try {
    const blob = await canvasToPng(renderScoreCard(data, sceneShot));
    if (mode !== 'result') return; // 그사이 다음 판으로 넘어감
    clearCard();
    card = { blob, url: URL.createObjectURL(blob), data };
    hud.setCardPreview(card.url);
  } catch (err) {
    console.error(err);
    hud.setShareNote('점수 카드를 만들지 못했어요.');
  }
}

function cardFileName(): string {
  return `street-type-fight-${card ? Math.round(card.data.kpm) : 0}타.png`;
}

async function cardAction(action: 'card-save' | 'card-copy' | 'card-share'): Promise<void> {
  if (!card) { hud.setShareNote('카드를 만드는 중이에요. 잠시 뒤 다시 눌러 주세요.'); return; }
  try {
    if (action === 'card-save') {
      const a = document.createElement('a');
      a.href = card.url;
      a.download = cardFileName();
      // 일부 브라우저(Firefox)는 문서에 붙지 않은 링크의 다운로드를 무시한다.
      document.body.appendChild(a);
      a.click();
      a.remove();
      hud.setShareNote('이미지를 저장했어요.');
    } else if (action === 'card-copy') {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': card.blob })]);
      hud.setShareNote('이미지를 복사했어요. Threads 글쓰기 창에 붙여 넣으세요.');
    } else {
      const file = new File([card.blob], cardFileName(), { type: 'image/png' });
      await navigator.share({ files: [file], text: shareText(card.data), url: GAME_URL });
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return; // 사용자가 공유 창을 닫음
    console.warn(err);
    hud.setShareNote(action === 'card-copy' ? '복사가 안 돼요. 이미지 저장을 써 주세요.' : '공유가 안 돼요. 이미지 저장을 써 주세요.');
  }
}

function startMatch(): void {
  clearCard();
  sfx.unlock();
  match.dispose();
  fx.reset();
  labels.clear();
  hud.resetMatch();
  match = new Match(stage, true, difficulty);
  const me = match.sim.fighters.get(ME)!;
  stage.follow(me.x, me.z, 0, true);
  resultAt = -1;
  mode = 'play';
  hud.hideOverlay();
}

function toTitle(): void {
  clearCard();
  match.dispose();
  fx.reset();
  labels.clear();
  match = new Match(stage, false, difficulty);
  mode = 'title';
  hud.showTitle(difficulty, touchOnly, shareNote);
}

async function shareLink(): Promise<void> {
  const url = location.href.split('#')[0]!;
  try {
    if (navigator.share) {
      await navigator.share({ title: document.title, text: '자판으로 치고받는 동네 대난투 — PC에서 열어 보세요', url });
      return;
    }
    await navigator.clipboard.writeText(url);
    shareNote = '링크를 복사했어요. PC로 보내서 열어 주세요.';
  } catch (err) {
    // 사용자가 공유 창을 닫은 경우는 오류가 아니다.
    if (err instanceof DOMException && err.name === 'AbortError') return;
    shareNote = '자동 복사가 안 돼요. 위 주소를 길게 눌러 복사해 주세요.';
  }
  if (mode === 'title') hud.showTitle(difficulty, touchOnly, shareNote);
}

hud.onMenuAction = (action) => {
  if (action === 'share') { void shareLink(); return; }
  if (action === 'card-save' || action === 'card-copy' || action === 'card-share') { void cardAction(action); return; }
  if (action === 'resume') { mode = 'play'; hud.hideOverlay(); }
  if (action === 'mute') { sfx.setMuted(!sfx.muted); hud.showPause(sfx.muted); }
  if (action === 'title') toTitle();
};

// ───────── 입력 ─────────

const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
const STRATEGY_KEYS: Record<string, TargetStrategy> = { Digit1: 'nearest', Digit2: 'revenge', Digit3: 'finish' };

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.altKey || e.metaKey) return; // 브라우저 단축키는 그대로 둔다
  const code = e.code;

  if (mode === 'title') {
    if (code === 'Enter') startMatch();
    else if (code === 'ArrowLeft' || code === 'ArrowRight') {
      difficulty = Math.max(0, Math.min(2, difficulty + (code === 'ArrowLeft' ? -1 : 1))) as Difficulty;
      hud.showTitle(difficulty, touchOnly, shareNote);
    }
    if (code in ARROWS || code === 'Space' || code === 'Tab') e.preventDefault();
    return;
  }
  if (mode === 'result') {
    if (code === 'Enter') startMatch();
    if (code === 'Escape') toTitle();
    return;
  }
  if (mode === 'pause') {
    if (code === 'Enter' || code === 'Escape') { mode = 'play'; hud.hideOverlay(); }
    return;
  }

  const sim = match.sim;
  if (code === 'Escape') {
    mode = 'pause';
    held.clear();
    hud.showPause(sfx.muted);
    return;
  }
  if (code in ARROWS) { held.add(code); e.preventDefault(); return; }
  if (code === 'Tab') { e.preventDefault(); if (!e.repeat) sim.cycleTarget(ME); return; }
  if (code === 'Backspace') { e.preventDefault(); sim.cancelLock(ME); return; }
  if (code in STRATEGY_KEYS) { sim.setStrategy(ME, STRATEGY_KEYS[code]!); return; }

  const token = tokenFromCode(code, e.shiftKey);
  if (token) {
    e.preventDefault();
    // 키를 꾹 누르고 있을 때의 자동 반복은 타자로 치지 않는다.
    if (!e.repeat) sim.pressKey(ME, token);
  }
});
window.addEventListener('keyup', (e) => held.delete(e.code));
window.addEventListener('blur', () => held.clear());

// ───────── 사건 → 연출 ─────────

const tmp = new Vector3();

function handleEvents(events: SimEvent[]): void {
  const sim = match.sim;
  const meId = match.meId;
  const me = meId ? sim.fighters.get(meId) : undefined;
  const get = (id: string) => sim.fighters.get(id);
  // 내 일이 아니면 거리만큼 작게 들린다.
  const vol = (...ids: string[]) => {
    if (meId && ids.includes(meId)) return 1;
    const f = get(ids[0]!);
    const ref = me ?? { x: PLAZA.x, z: PLAZA.z };
    return f ? Math.max(0, 1 - Math.hypot(f.x - ref.x, f.z - ref.z) / 22) * 0.6 : 0;
  };
  const above = (f: Fighter, dy = 1.9) => tmp.set(f.x, dy, f.z);
  const mine = (...ids: string[]) => !!meId && ids.includes(meId);

  for (const e of events) {
    switch (e.t) {
      case 'key':
        if (e.id === meId) { hud.keyTick(sim.time); sfx.key(); }
        break;
      case 'jab': {
        const a = get(e.attacker)!;
        const t = get(e.target)!;
        fx.jab(a, t, e.close, e.guarded);
        match.dolls.get(t.id)?.flash(0.06);
        const v = vol(a.id, t.id);
        if (v > 0.05) sfx.jab(e.close, v);
        if (mine(a.id, t.id) && e.dmg > 0) labels.popup(above(t, 1.6), Math.round(e.dmg * 10) / 10 + '', e.close ? 'dmg close' : 'dmg');
        if (mine(t.id)) stage.shake(0.05);
        break;
      }
      case 'whiff':
        break;
      case 'finisher': {
        const t = get(e.target)!;
        fx.finisher(t);
        sfx.finisher(vol(e.attacker, e.target));
        labels.popup(above(t, 1.8), String(Math.round(e.dmg)), 'dmg big');
        if (mine(e.attacker, e.target)) stage.shake(0.22);
        break;
      }
      case 'fumble': {
        const f = get(e.id)!;
        fx.fumble(f);
        if (e.id === meId) {
          sfx.fumble();
          hud.wrongKey();
          hud.shakeDeck();
          labels.popup(above(f, 2.2), '헛손질!', 'miss');
        }
        break;
      }
      case 'reject':
        if (e.id === meId) { sfx.reject(); hud.wrongKey(); }
        break;
      case 'notReady':
        if (e.id === meId) {
          sfx.notReady();
          labels.popup(above(get(e.id)!, 2.2), e.reason, 'info');
        }
        break;
      case 'guard':
        fx.guardUp(get(e.id)!);
        sfx.guard();
        break;
      case 'cast': {
        const f = get(e.id)!;
        sfx.cast(e.kind, vol(e.id));
        const def = BRAWLER_KIT.find((s) => s.id === e.skillId);
        if (e.kind === 'aoe' && def) fx.startWhirl(f, def.radius, def.windup, sim.time);
        labels.popup(above(f, 2.3), e.kind === 'ultimate' ? '필살!' : `${def?.word.text ?? ''}!`, e.kind === 'ultimate' ? 'skill ult' : 'skill');
        break;
      }
      case 'threat':
        fx.startThreat(e.threat, sim);
        if (e.threat.targetId === meId) sfx.warn();
        break;
      case 'resolve': {
        fx.endThreat(e.threat, e.outcome, sim);
        const t = get(e.threat.targetId);
        const a = get(e.threat.attackerId);
        if (!t) break;
        const v = vol(t.id, e.threat.attackerId);
        if (e.outcome === 'hit') {
          if (e.threat.kind === 'ultimate') { sfx.thunder(Math.max(v, 0.5)); stage.shake(0.45); }
          else { sfx.hit(v); if (mine(t.id, e.threat.attackerId)) stage.shake(0.3); }
          labels.popup(above(t, 1.8), String(Math.round(e.dmg)), e.threat.kind === 'ultimate' ? 'dmg huge' : 'dmg big');
        } else if (e.outcome === 'block') {
          sfx.block(v);
          labels.popup(above(t, 2.1), '막음!', 'block');
        } else if (e.outcome === 'parry') {
          sfx.parry(v);
          labels.popup(above(t, 2.1), '반격!', 'parry');
          if (a) labels.popup(above(a, 1.8), String(Math.round(e.dmg)), 'dmg big');
          if (mine(t.id, e.threat.attackerId)) stage.shake(0.15);
        } else if (e.outcome === 'dodge') {
          labels.popup(above(t, 2.1), '회피!', 'dodge');
        }
        break;
      }
      case 'splash': {
        const t = get(e.target)!;
        fx.splash(t);
        labels.popup(above(t, 1.8), String(Math.round(e.dmg)), 'dmg');
        break;
      }
      case 'ultimateReady':
        if (e.id === meId) {
          sfx.ultimateReady();
          labels.popup(above(get(e.id)!, 2.4), '필살기 준비!', 'skill ult');
        }
        break;
      case 'ko': {
        const v = get(e.victim)!;
        fx.ko(v);
        sfx.ko(vol(e.victim, e.killer ?? e.victim));
        labels.popup(above(v, 2.0), 'K.O!', 'ko');
        if (!v.isDummy) hud.feed(e.killer ? get(e.killer) ?? null : null, v, meId);
        if (mine(e.victim, e.killer ?? '')) stage.shake(0.5);
        break;
      }
      case 'respawn':
        fx.respawn(get(e.id)!);
        break;
      case 'matchEnd':
        if (me) pendingShot = true; // 다음 렌더 직후 마지막 장면을 찍어 둔다
        resultAt = performance.now() + 1800;
        if (me) sfx.fanfare(e.winner === me.team);
        break;
    }
  }
}

// ───────── 루프 ─────────

function attractCamera(dt: number): void {
  const sim = match.sim;
  const now = sim.time;
  let f = attractTarget ? sim.fighters.get(attractTarget) : undefined;
  if (!f || !f.alive || now > attractUntil) {
    const fighting = [...sim.fighters.values()].filter((x) => x.alive && !x.isDummy && x.targetId);
    const pool = fighting.length ? fighting : [...sim.fighters.values()].filter((x) => x.alive && !x.isDummy);
    f = pool[Math.floor(Math.random() * pool.length)];
    attractTarget = f?.id ?? null;
    attractUntil = now + 7;
  }
  if (f) stage.follow(f.x, f.z, dt * 0.5);
}

let last = performance.now();
function frame(nowMs: number): void {
  // 다음 프레임을 먼저 예약해, 한 프레임의 예외가 콘솔에 남되 게임 전체를 멈추지는 않게 한다.
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (nowMs - last) / 1000);
  last = nowMs;
  const sim = match.sim;

  if (mode === 'play' || mode === 'title' || mode === 'result') {
    if (mode === 'play') {
      let mx = 0;
      let mz = 0;
      for (const k of held) { mx += ARROWS[k]![0]; mz += ARROWS[k]![1]; }
      sim.setMove(ME, mx, mz);
    }
    acc += dt;
    while (acc >= STEP) {
      for (const b of match.brains) b.update(sim);
      sim.step(STEP);
      acc -= STEP;
    }
    handleEvents(sim.drainEvents());
  }
  const alpha = acc / STEP;

  // 타이틀 뒤 데모 대전도 15킬이면 끝나므로, 멈춘 화면이 되지 않게 새 판을 다시 돌린다.
  if (mode === 'title' && resultAt > 0 && nowMs >= resultAt) {
    match.dispose();
    fx.reset();
    labels.clear();
    match = new Match(stage, false, difficulty);
    resultAt = -1;
    return;
  }

  if (mode === 'play' && resultAt > 0 && nowMs >= resultAt) {
    mode = 'result';
    const me = sim.fighters.get(ME)!;
    const kpm = hud.combatKpm();
    const accuracy = hud.accuracy();
    hud.showResult({ winner: sim.winner!, myTeam: me.team, me, kpm, accuracy, score: sim.score }, canCopyImage, canShareFiles);
    void prepareCard({ won: sim.winner === me.team, winner: sim.winner!, score: { ...sim.score }, kpm, accuracy, stats: { ...me.stats } });
  }

  const me = match.meId ? sim.fighters.get(match.meId) : undefined;
  if (me) stage.follow(me.prevX + (me.x - me.prevX) * alpha, me.prevZ + (me.z - me.prevZ) * alpha, dt);
  else attractCamera(dt);

  for (const d of match.dolls.values()) d.update(sim.time, dt, alpha);
  terrain.update(dt);
  props.update(dt, me && me.alive ? me : null);
  if (mode !== 'pause') fx.update(dt, sim);
  stage.render();
  if (pendingShot) {
    sceneShot = captureScene(stage.renderer.domElement);
    pendingShot = false;
  }
  labels.update(sim, match.dolls, match.meId, dt);
  hud.update(sim, match.meId);
  hud.minimap.draw(sim, match.meId);
}

// 개발 서버에서만 콘솔/자동 점검용으로 현재 시뮬레이션을 노출한다(배포 빌드에는 포함되지 않음).
if (import.meta.env.DEV) {
  Object.assign(window, { __game: { stage, get sim() { return match.sim; }, get mode() { return mode; } } });
}

hud.showTitle(difficulty, touchOnly, shareNote);
requestAnimationFrame(frame);
