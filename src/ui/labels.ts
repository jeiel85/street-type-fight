// 월드에 붙는 HTML 표시: 이름표·체력, 내 대상 위 공격 단어, 내 머리 위 방어 단어, 적의 시전 중 단어(읽기용), 피해 숫자.

import { Vector3, type PerspectiveCamera } from 'three';
import type { PaperDoll } from '../render/paperdoll';
import type { Fighter, Sim } from '../sim/sim';
import { escapeHtml, setHtml, wordHtml } from './word';

interface Tag {
  el: HTMLElement;
  hp: HTMLElement;
  bubble: HTMLElement;
}

interface Popup {
  el: HTMLElement;
  pos: Vector3;
  life: number;
  max: number;
}

export class WorldLabels {
  private readonly root: HTMLElement;
  private readonly tags = new Map<string, Tag>();
  private readonly popups: Popup[] = [];
  private readonly v = new Vector3();

  constructor(parent: HTMLElement, private readonly camera: PerspectiveCamera) {
    this.root = document.createElement('div');
    this.root.className = 'world-labels';
    parent.appendChild(this.root);
  }

  clear(): void {
    this.root.replaceChildren();
    this.tags.clear();
    this.popups.length = 0;
  }

  private project(p: Vector3): { x: number; y: number; visible: boolean } {
    this.v.copy(p).project(this.camera);
    return {
      x: ((this.v.x + 1) / 2) * this.root.clientWidth,
      y: ((1 - this.v.y) / 2) * this.root.clientHeight,
      visible: this.v.z < 1 && Math.abs(this.v.x) < 1.2 && Math.abs(this.v.y) < 1.2,
    };
  }

  private tag(f: Fighter, meId: string | null): Tag {
    let t = this.tags.get(f.id);
    if (!t) {
      const el = document.createElement('div');
      el.className = `tag team-${f.team}${f.id === meId ? ' me' : ''}`;
      el.innerHTML = `<div class="stack"><div class="bubble"></div><div class="name">${escapeHtml(f.name)}</div><div class="hpbar"><i></i></div></div>`;
      this.root.appendChild(el);
      t = { el, hp: el.querySelector('.hpbar i')!, bubble: el.querySelector('.bubble')! };
      this.tags.set(f.id, t);
    }
    return t;
  }

  popup(pos: Vector3, text: string, cls: string, life = 0.9): void {
    const el = document.createElement('div');
    el.className = `popup ${cls}`;
    el.textContent = text;
    this.root.appendChild(el);
    this.popups.push({ el, pos: pos.clone(), life, max: life });
    if (this.popups.length > 40) {
      const old = this.popups.shift();
      old?.el.remove();
    }
  }

  update(sim: Sim, dolls: Map<string, PaperDoll>, meId: string | null, dt: number): void {
    const me = meId ? sim.fighters.get(meId) ?? null : null;
    const myTarget = me ? sim.target(me) : null;
    const head = new Vector3();

    for (const f of sim.fighters.values()) {
      const t = this.tag(f, meId);
      const doll = dolls.get(f.id);
      if (!doll || !f.alive) {
        t.el.style.display = 'none';
        continue;
      }
      doll.headTop(head);
      const s = this.project(head);
      if (!s.visible) {
        t.el.style.display = 'none';
        continue;
      }
      t.el.style.display = '';
      t.el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`;
      t.hp.style.width = `${Math.max(0, (f.hp / f.maxHp) * 100).toFixed(1)}%`;
      t.el.classList.toggle('targeted', f === myTarget);

      // 말풍선: 내 대상이면 내 공격 단어, 나 자신이면 날아오는 방어 단어, 그 외엔 그 사람이 시전 중인 스킬
      let html = '';
      if (me && f === myTarget) {
        const progress = me.lock?.candId === 'atk' ? me.lock.progress : 0;
        html = `<div class="b-attack">${wordHtml(me.attackWord, progress)}</div>`;
      } else if (f === me) {
        for (const th of sim.threats) {
          if (th.targetId !== f.id) continue;
          const progress = f.lock?.candId === `def:${th.id}` ? f.lock.progress : 0;
          const left = Math.max(0, (th.deadline - sim.time) / (th.deadline - th.start));
          html += `<div class="b-defense"><span>${wordHtml(th.word, progress)}</span><u style="width:${(left * 100).toFixed(0)}%"></u></div>`;
        }
      } else if (f.lock && f.lock.progress > 0 && (f.lock.candId.startsWith('skill:') || f.lock.candId === 'ult')) {
        const cand = sim.candidatesFor(f).find((c) => c.id === f.lock!.candId);
        if (cand) html = `<div class="b-cast${cand.kind === 'ultimate' ? ' ult' : ''}">${wordHtml(cand.word, f.lock.progress)}</div>`;
      }
      setHtml(t.bubble, html);
    }

    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        p.el.remove();
        this.popups.splice(i, 1);
        continue;
      }
      const k = 1 - p.life / p.max;
      p.pos.y += dt * 1.2;
      const s = this.project(p.pos);
      p.el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -50%) scale(${(k < 0.15 ? 0.6 + k * 4 : 1).toFixed(2)})`;
      p.el.style.opacity = String(k > 0.7 ? (1 - k) / 0.3 : 1);
    }
  }
}
