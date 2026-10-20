// 화면 HUD: 타자 덱(방어·필살·공격·스킬), 체력·기세·콤보, 점수, 대상 정보, 킬 로그, 미니맵, 메뉴 화면.

import { CONFIG } from '../config';
import type { Fighter, Sim, TargetStrategy, Team } from '../sim/sim';
import { Minimap } from './minimap';
import { escapeHtml, setHtml, setText, wordHtml } from './word';

export type Difficulty = 0 | 1 | 2;
export const DIFFICULTY_LABEL = ['초보', '보통', '고수'] as const;
const TEAM_NAME: Record<Team, string> = { blue: '청룡단', red: '주작단', neutral: '중립' };
const STRATEGIES: { key: string; id: TargetStrategy; label: string }[] = [
  { key: '1', id: 'nearest', label: '가까운 적' },
  { key: '2', id: 'revenge', label: '나를 노리는 적' },
  { key: '3', id: 'finish', label: '빈사 상태 적' },
];

/** 처음 화면 아래쪽의 소스 저장소 링크(새 탭). */
const SOURCE_LINK =
  '<a class="source-link" href="https://github.com/jeiel85/street-type-fight" target="_blank" rel="noopener noreferrer" aria-label="GitHub 소스 코드 (새 탭에서 열림)">' +
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg> GitHub</a>';

const MENU_ACTIONS = ['resume', 'mute', 'title', 'share', 'install', 'card-save', 'card-copy', 'card-share'] as const;
export type MenuAction = (typeof MENU_ACTIONS)[number];

export interface ResultData {
  winner: Team;
  myTeam: Team;
  me: Fighter;
  kpm: number;
  accuracy: number;
  score: Record<'blue' | 'red', number>;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (html) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

export class Hud {
  readonly minimap: Minimap;
  private readonly root: HTMLElement;
  private readonly score: HTMLElement;
  private readonly stats: HTMLElement;
  private readonly targetInfo: HTMLElement;
  private readonly feedBox: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly deck: HTMLElement;
  private readonly defenses: HTMLElement;
  private readonly ult: HTMLElement;
  private readonly attack: HTMLElement;
  private readonly skills: HTMLElement;
  private readonly bars: HTMLElement;
  private readonly down: HTMLElement;
  private readonly overlay: HTMLElement;
  private readonly defRows = new Map<string, HTMLElement>();
  private readonly chips: HTMLElement[] = [];
  private keyTimes: number[] = [];
  private lastKeyAt = -1;
  private activeTyping = 0;
  private correct = 0;
  private wrong = 0;
  canInstall = false;
  onMenuAction: (action: MenuAction) => void = () => {};

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud', parent);
    this.score = el('div', 'score', this.root);
    this.stats = el('div', 'mystats', this.root);
    const side = el('div', 'side', this.root);
    this.minimap = new Minimap(el('div', 'minimap', side));
    this.feedBox = el('div', 'feed', side);
    this.banner = el('div', 'banner', this.root);
    this.deck = el('div', 'deck', this.root);
    this.targetInfo = el('div', 'target-info', this.deck);
    this.defenses = el('div', 'defenses', this.deck);
    this.ult = el('div', 'row ult', this.deck);
    this.attack = el('div', 'row attack', this.deck);
    this.skills = el('div', 'skills', this.deck);
    this.bars = el('div', 'bars', this.deck,
      '<div class="bar hp"><i></i><span></span></div><div class="bar gauge"><i></i><span></span></div><div class="combo"></div>');
    this.down = el('div', 'down', this.deck);
    el('div', 'help', this.root, '<kbd>←↑↓→</kbd> 이동 <kbd>Tab</kbd> 대상 <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> 전략 <kbd>Backspace</kbd> 취소 <kbd>Esc</kbd> 메뉴');
    this.overlay = el('div', 'overlay', parent);
    this.overlay.addEventListener('click', (e) => {
      const action = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
      if (action && (MENU_ACTIONS as readonly string[]).includes(action)) this.onMenuAction(action as MenuAction);
    });
  }

  // ───────── 메뉴 화면 ─────────

  /** touchOnly: 마우스·키보드 없는 기기(폰)로 들어온 경우. 게임은 물리 키보드가 필요하므로 PC로 안내한다. */
  showTitle(diff: Difficulty, touchOnly = false, shareNote = ''): void {
    this.root.classList.add('hidden');
    this.overlay.className = 'overlay title';
    this.overlay.innerHTML = `
      <div class="panel">
        <h1><span>스트리트</span><span>타입 파이트</span></h1>
        <p class="sub">자판으로 치고받는 동네 대난투</p>
        <ul class="howto">
          <li><b>공격</b> 상대 머리 위 단어를 친다. 한 타 한 타가 주먹, 마지막 글자가 마무리 강타.</li>
          <li><b>스킬</b> <em>장풍</em> · <em>돌려차기</em> · <em>철벽</em> · <em>회오리바람</em> 을 치면 발동.</li>
          <li><b>방어</b> 빨간 방어 단어가 뜨면 맞기 전에 친다. 빨리 막으면 <em>반격</em>!</li>
          <li><b>필살</b> 기세가 가득 차면 속담 한 줄로 벼락을 내린다.</li>
          <li><b>오타</b> 헛손질하면 콤보가 끊긴다. 빠르게, 그리고 정확하게.</li>
        </ul>
        <p class="keys"><kbd>←↑↓→</kbd> 이동 <kbd>Tab</kbd> 대상 <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> 전략 <kbd>Backspace</kbd> 취소 <kbd>Esc</kbd> 메뉴</p>
        ${touchOnly ? `
        <div class="pc-only">
          <p><b>⌨️ PC 키보드로 하는 게임이에요</b></p>
          <p>지금 기기에서는 칠 수가 없어요. 링크를 PC로 보내서 열어 주세요.</p>
          <button data-action="share">링크 보내기</button>
          <p class="url">${escapeHtml(location.href)}</p>
          ${shareNote ? `<p class="note">${escapeHtml(shareNote)}</p>` : ''}
          <p class="note">키보드를 연결했다면 Enter 를 눌러 시작할 수 있어요.</p>
        </div>` : `
        <p class="diff">상대 실력 <kbd>←</kbd> <b>${DIFFICULTY_LABEL[diff]}</b> <kbd>→</kbd></p>
        <p class="start">Enter 를 눌러 시작</p>
        <p class="note">한/영 전환과 상관없이 두벌식 자판 위치로 입력됩니다.</p>
        ${this.canInstall ? '<div class="install-row"><button class="install-btn" data-action="install">앱으로 설치 <small>바탕화면 · 오프라인 플레이</small></button></div>' : ''}`}
        ${SOURCE_LINK}
      </div>`;
  }

  showPause(muted: boolean): void {
    this.overlay.className = 'overlay pause';
    this.overlay.innerHTML = `
      <div class="panel small">
        <h2>잠깐 쉬는 중</h2>
        <button data-action="resume">계속하기 <small>Enter / Esc</small></button>
        <button data-action="mute">소리 ${muted ? '켜기' : '끄기'}</button>
        ${this.canInstall ? '<button data-action="install">앱으로 설치</button>' : ''}
        <button data-action="title">처음 화면으로</button>
      </div>`;
  }

  /** canCopy/canShare: 이 브라우저가 이미지 복사·파일 공유를 지원하는지(지원할 때만 버튼을 보인다). */
  showResult(r: ResultData, canCopy: boolean, canShare: boolean): void {
    const won = r.winner === r.myTeam;
    const s = r.me.stats;
    this.overlay.className = `overlay result ${won ? 'win' : 'lose'}`;
    this.overlay.innerHTML = `
      <div class="panel">
        <h2>${won ? '승리!' : '패배…'}</h2>
        <p class="sub">${TEAM_NAME[r.winner]} 승 · ${r.score.blue} : ${r.score.red}</p>
        <div class="grid">
          <div><b>${Math.round(r.kpm)}</b><span>전투 타속(타/분)</span></div>
          <div><b>${(r.accuracy * 100).toFixed(1)}%</b><span>정확도</span></div>
          <div><b>${s.maxCombo}</b><span>최대 콤보</span></div>
          <div><b>${s.kos}</b><span>KO</span></div>
          <div><b>${s.deaths}</b><span>다운</span></div>
          <div><b>${s.blocks}</b><span>방어</span></div>
          <div><b>${s.parries}</b><span>반격</span></div>
          <div><b>${Math.round(s.damageDealt)}</b><span>입힌 피해</span></div>
        </div>
        <div class="share">
          <img class="card-preview" alt="점수 카드 미리보기" />
          <div class="share-actions">
            <p class="share-title">점수 카드로 자랑하기</p>
            <button data-action="card-save">이미지 저장</button>
            ${canCopy ? '<button data-action="card-copy">이미지 복사</button>' : ''}
            ${canShare ? '<button data-action="card-share">공유하기</button>' : ''}
            <p class="share-note"></p>
          </div>
        </div>
        <p class="start">Enter 를 눌러 다시 한 판</p>
      </div>`;
  }

  setCardPreview(url: string): void {
    const img = this.overlay.querySelector<HTMLImageElement>('.card-preview');
    if (img) img.src = url;
  }

  setShareNote(text: string): void {
    const note = this.overlay.querySelector<HTMLElement>('.share-note');
    if (note) note.textContent = text;
  }

  hideOverlay(): void {
    this.overlay.className = 'overlay hidden';
    this.overlay.innerHTML = '';
    this.root.classList.remove('hidden');
  }

  resetMatch(): void {
    this.keyTimes = [];
    this.lastKeyAt = -1;
    this.activeTyping = 0;
    this.correct = 0;
    this.wrong = 0;
    this.feedBox.replaceChildren();
    this.defenses.replaceChildren();
    this.defRows.clear();
    this.skills.replaceChildren();
    this.chips.length = 0;
  }

  // ───────── 이벤트 반응 ─────────

  keyTick(time: number): void {
    this.correct++;
    this.keyTimes.push(time);
    // 1.5초 넘게 쉬면 '치는 중'이 아니었던 것으로 보고 전투 타속 계산에서 뺀다.
    if (this.lastKeyAt >= 0 && time - this.lastKeyAt < 1.5) this.activeTyping += time - this.lastKeyAt;
    this.lastKeyAt = time;
  }

  wrongKey(): void {
    this.wrong++;
  }

  combatKpm(): number {
    return this.activeTyping > 1 ? (this.correct / this.activeTyping) * 60 : 0;
  }

  accuracy(): number {
    const n = this.correct + this.wrong;
    return n === 0 ? 1 : this.correct / n;
  }

  shakeDeck(): void {
    this.deck.classList.remove('shake');
    void this.deck.offsetWidth;
    this.deck.classList.add('shake');
  }

  feed(killer: Fighter | null, victim: Fighter, meId: string | null): void {
    const name = (f: Fighter) => `<b class="team-${f.team}${f.id === meId ? ' me' : ''}">${escapeHtml(f.name)}</b>`;
    const row = el('div', 'feed-row', undefined, killer ? `${name(killer)} <i>▶</i> ${name(victim)}` : name(victim));
    this.feedBox.prepend(row);
    setTimeout(() => row.classList.add('fade'), 4500);
    setTimeout(() => row.remove(), 5200);
    while (this.feedBox.children.length > 5) this.feedBox.lastElementChild?.remove();
  }

  // ───────── 매 프레임 ─────────

  update(sim: Sim, meId: string | null): void {
    setHtml(this.score,
      `<span class="team-blue">청룡단 <b>${sim.score.blue}</b></span><i>:</i><span class="team-red"><b>${sim.score.red}</b> 주작단</span>` +
      `<small>${CONFIG.match.killsToWin}킬 선승</small>`);

    const me = meId ? sim.fighters.get(meId) : undefined;
    if (!me) return;
    const now = sim.time;
    while (this.keyTimes.length && this.keyTimes[0]! < now - 10) this.keyTimes.shift();
    setHtml(this.stats,
      `<span>타속 <b>${this.keyTimes.length * 6}</b>타</span><span>정확도 <b>${(this.accuracy() * 100).toFixed(0)}%</b></span>` +
      `<span>KO <b>${me.stats.kos}</b></span><span>다운 <b>${me.stats.deaths}</b></span>`);

    const inSafe = sim.inSafeZone(me);
    setText(this.banner, inSafe ? '안전지대 — 여기선 싸울 수 없고 체력이 빠르게 회복됩니다' : '');
    this.banner.classList.toggle('on', inSafe);

    const target = sim.target(me);
    const strat = STRATEGIES.map((s) => `<span class="${me.strategy === s.id ? 'on' : ''}"><kbd>${s.key}</kbd>${s.label}</span>`).join('');
    setHtml(this.targetInfo,
      (target
        ? `<div class="tgt team-${target.team}">◎ <b>${escapeHtml(target.name)}</b><span class="hpbar"><i style="width:${((target.hp / target.maxHp) * 100).toFixed(0)}%"></i></span>${me.manualTarget ? '<small>직접 지정</small>' : ''}</div>`
        : '<div class="tgt none">대상 없음 — 적에게 다가가세요</div>') +
      `<div class="strat">${strat}<span class="tab"><kbd>Tab</kbd>다음 대상</span></div>`);

    this.deck.classList.toggle('dead', !me.alive);
    setText(this.down, me.alive ? '' : `다운! ${Math.max(0, me.respawnAt - now).toFixed(1)}초 뒤 마을에서 부활`);

    const cands = sim.candidatesFor(me);
    const lock = me.lock;
    const progressOf = (id: string) => (lock?.candId === id ? lock.progress : 0);

    // 방어 단어(맨 위, 가장 급한 것)
    const seen = new Set<string>();
    for (const c of cands) {
      if (c.kind !== 'defense') continue;
      seen.add(c.id);
      let row = this.defRows.get(c.id);
      const th = sim.threats.find((t) => `def:${t.id}` === c.id);
      if (!row) {
        const from = th ? sim.fighters.get(th.attackerId) : undefined;
        row = el('div', 'row defense', this.defenses,
          `<span class="label">막아!</span><span class="word"></span><span class="from">${from ? escapeHtml(from.name) : ''}</span><span class="timer"><i></i></span>`);
        this.defRows.set(c.id, row);
      }
      setHtml(row.querySelector<HTMLElement>('.word')!, wordHtml(c.word, progressOf(c.id)));
      row.classList.toggle('locked', lock?.candId === c.id);
      if (th) {
        const left = Math.max(0, (th.deadline - now) / (th.deadline - th.start));
        row.querySelector<HTMLElement>('.timer i')!.style.width = `${(left * 100).toFixed(1)}%`;
        row.classList.toggle('parry-window', left >= CONFIG.combat.parryRatio);
      }
    }
    for (const [id, row] of this.defRows) {
      if (!seen.has(id)) { row.remove(); this.defRows.delete(id); }
    }

    const ultC = cands.find((c) => c.kind === 'ultimate');
    this.ult.classList.toggle('on', !!ultC);
    this.ult.classList.toggle('locked', lock?.candId === 'ult');
    this.ult.classList.toggle('blocked', !!ultC && !ultC.ready);
    setHtml(this.ult, ultC
      ? `<span class="label">필살</span><span class="word">${wordHtml(ultC.word, progressOf('ult'))}</span>${ultC.ready ? '' : `<span class="why">${ultC.reason}</span>`}`
      : '');

    const atk = cands.find((c) => c.id === 'atk');
    if (atk) {
      this.attack.classList.toggle('locked', lock?.candId === 'atk');
      this.attack.classList.toggle('blocked', !atk.ready);
      setHtml(this.attack,
        `<span class="label">공격</span><span class="word">${wordHtml(atk.word, progressOf('atk'))}</span>` +
        (atk.ready ? `<span class="who">▶ ${escapeHtml(target?.name ?? '')}</span>` : `<span class="why">${atk.reason}</span>`));
    }

    if (this.chips.length !== me.skills.length) {
      this.skills.replaceChildren();
      this.chips.length = 0;
      for (let i = 0; i < me.skills.length; i++) {
        this.chips.push(el('div', 'chip', this.skills, '<span class="key"></span><span class="word"></span><span class="desc"></span><i class="cd"></i>'));
      }
    }
    me.skills.forEach((slot, i) => {
      const chip = this.chips[i]!;
      const c = cands.find((x) => x.id === `skill:${i}`)!;
      const cd = Math.max(0, slot.readyAt - now);
      chip.classList.toggle('locked', lock?.candId === c.id);
      chip.classList.toggle('blocked', !c.ready);
      setText(chip.querySelector<HTMLElement>('.key')!, slot.def.word.keys[0]!);
      setHtml(chip.querySelector<HTMLElement>('.word')!, wordHtml(slot.def.word, progressOf(c.id)));
      setText(chip.querySelector<HTMLElement>('.desc')!, cd > 0 ? `${cd.toFixed(1)}초` : c.ready ? slot.def.desc : (c.reason ?? ''));
      chip.querySelector<HTMLElement>('.cd')!.style.height = `${((cd / slot.def.cooldown) * 100).toFixed(1)}%`;
    });

    const hp = this.bars.querySelector<HTMLElement>('.hp')!;
    hp.querySelector<HTMLElement>('i')!.style.width = `${((me.hp / me.maxHp) * 100).toFixed(1)}%`;
    setText(hp.querySelector<HTMLElement>('span')!, `체력 ${Math.ceil(me.hp)}`);
    hp.classList.toggle('low', me.hp < me.maxHp * 0.3);
    const gauge = this.bars.querySelector<HTMLElement>('.gauge')!;
    gauge.querySelector<HTMLElement>('i')!.style.width = `${((me.gauge / CONFIG.gauge.max) * 100).toFixed(1)}%`;
    setText(gauge.querySelector<HTMLElement>('span')!, me.ultimateWord ? '기세 MAX — 필살기!' : `기세 ${Math.floor(me.gauge)}`);
    gauge.classList.toggle('full', !!me.ultimateWord);
    const combo = this.bars.querySelector<HTMLElement>('.combo')!;
    setHtml(combo, me.combo >= 5 ? `<b>${me.combo}</b> COMBO` : '');
  }
}
