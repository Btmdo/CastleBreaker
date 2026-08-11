/**
 * 기획서 §12.9.6 — 전투 이펙트.
 * 시뮬레이션 이벤트를 받아 화면 좌표의 1회성 연출로 바꾼다.
 * ★ §9.6 결정론 RNG 를 절대 사용하지 않는다. 연출 전용 난수만 쓴다.
 */
import { SIDE, STATUS, type SideKey } from '../art/palette';
import { VisualRng } from '../sim/rng';
import type { SimEvent, Side } from '../sim/types';
import { PX_PER_UNIT, facing, laneY, toX } from './view';

type Item =
  | { k: 'slash'; x: number; y: number; dir: number; side: SideKey; t0: number; life: number }
  | { k: 'tracer'; x: number; y: number; dir: number; len: number; side: SideKey; t0: number; life: number }
  | { k: 'muzzle'; x: number; y: number; side: SideKey; t0: number; life: number }
  | { k: 'shell'; x: number; y: number; dir: number; len: number; side: SideKey; t0: number; life: number }
  | { k: 'dash'; x: number; y: number; dir: number; side: SideKey; t0: number; life: number }
  | { k: 'bomb'; x: number; y: number; dir: number; side: SideKey; t0: number; life: number }
  | { k: 'splash'; x: number; y: number; r: number; side: SideKey; t0: number; life: number }
  | { k: 'miss'; x: number; y: number; t0: number; life: number }
  | { k: 'frag'; x: number; y: number; vx: number; vy: number; s: number; side: SideKey; t0: number; life: number }
  | { k: 'castleBurst'; x: number; y: number; side: SideKey; t0: number; life: number }
  | { k: 'blast'; x: number; y: number; r: number; side: SideKey; t0: number; life: number };

const LIFE = {
  slash: 130, tracer: 170, muzzle: 150, shell: 220, dash: 110,
  bomb: 240, splash: 220, miss: 340, frag: 300, castleBurst: 260, blast: 420,
};

export class Fx {
  private items: Item[] = [];
  private hitFlash = new Map<number, number>();
  private castleShake = new Map<Side, number>();
  private rng = new VisualRng(0xc0ffee);

  /** 이번 틱의 시뮬레이션 이벤트를 연출로 변환 */
  ingest(events: SimEvent[], now: number, unitPos: (id: number) => { x: number; y: number } | null) {
    for (const e of events) {
      switch (e.k) {
        case 'fire': {
          const side = e.side as SideKey;
          const dir = facing(e.side);
          const x = toX(e.side, e.d) + dir * 10;
          const y = laneY(e.lane) - 12;
          const len = Math.max(14, e.range * PX_PER_UNIT);
          if (e.weapon === 'saber') this.items.push({ k: 'slash', x, y, dir, side, t0: now, life: LIFE.slash });
          else if (e.weapon === 'missile') this.items.push({ k: 'shell', x, y, dir, len, side, t0: now, life: LIFE.shell });
          else if (e.weapon === 'cannon') {
            this.items.push({ k: 'muzzle', x, y, side, t0: now, life: LIFE.muzzle });
            this.items.push({ k: 'tracer', x, y, dir, len, side, t0: now, life: LIFE.tracer });
          } else if (e.weapon === 'rail') {
            // 레일건 — 얇고 긴 관통 섬광
            this.items.push({ k: 'muzzle', x, y, side, t0: now, life: LIFE.muzzle });
            this.items.push({ k: 'tracer', x, y, dir, len: len * 1.1, side, t0: now, life: LIFE.tracer + 90 });
          } else if (e.weapon === 'charge') {
            // 자폭 — 흰 섬광 + 확장하는 충격파
            this.items.push({ k: 'blast', x, y, r: Math.max(40, len), side, t0: now, life: LIFE.blast });
            this.items.push({ k: 'muzzle', x, y, side, t0: now, life: LIFE.muzzle });
          } else if (e.weapon === 'bomb') this.items.push({ k: 'bomb', x, y, dir, side, t0: now, life: LIFE.bomb });
          else this.items.push({ k: 'dash', x, y, dir, side, t0: now, life: LIFE.dash });
          break;
        }
        case 'hit':
          this.hitFlash.set(e.unitId, now + 80);
          break;
        case 'evade': {
          const p = unitPos(e.unitId);
          if (p) this.items.push({ k: 'miss', x: p.x, y: p.y - 26, t0: now, life: LIFE.miss });
          break;
        }
        case 'death': {
          const x = toX(e.side, e.d);
          const y = laneY(e.lane) - 10;
          const n = 5;
          for (let i = 0; i < n; i++) {
            this.items.push({
              k: 'frag', x, y,
              vx: this.rng.range(-70, 70), vy: this.rng.range(-120, -30),
              s: this.rng.range(3, 6),
              side: e.side as SideKey, t0: now, life: LIFE.frag,
            });
          }
          break;
        }
        case 'splash':
          this.items.push({
            k: 'splash', x: toX(e.side, e.d), y: laneY(e.lane) - 10,
            r: e.radius * PX_PER_UNIT, side: e.side as SideKey, t0: now, life: LIFE.splash,
          });
          break;
        case 'castleHit': {
          const opp: Side = e.side;
          this.castleShake.set(opp, now + 140);
          this.items.push({
            k: 'castleBurst',
            x: opp === 'P1' ? 40 + 80 : 40 + 1200 - 80,
            y: 470, side: opp as SideKey, t0: now, life: LIFE.castleBurst,
          });
          break;
        }
        case 'spawn':
          break;
        case 'airstrike':
          // 공습 지원 퍽 — 폭발 충격파를 더 크고 오래 보여준다
          this.items.push({
            k: 'blast', x: toX(e.side, e.d), y: laneY(e.lane) - 10,
            r: e.radius * PX_PER_UNIT * 1.6, side: e.side as SideKey, t0: now, life: LIFE.blast + 120,
          });
          break;
      }
    }
  }

  prune(now: number) {
    this.items = this.items.filter((i) => now - i.t0 < i.life);
    for (const [k, v] of this.hitFlash) if (v < now) this.hitFlash.delete(k);
    for (const [k, v] of this.castleShake) if (v < now) this.castleShake.delete(k);
  }

  isFlashing(unitId: number, now: number): boolean {
    const t = this.hitFlash.get(unitId);
    return t !== undefined && t > now;
  }

  castleShakeOffset(side: Side, now: number): number {
    const t = this.castleShake.get(side);
    if (t === undefined || t < now) return 0;
    return Math.sin((t - now) * 0.9) * 3;
  }

  clear() {
    this.items.length = 0;
    this.hitFlash.clear();
    this.castleShake.clear();
  }

  draw(ctx: CanvasRenderingContext2D, now: number) {
    for (const i of this.items) {
      const p = (now - i.t0) / i.life;
      if (p < 0 || p > 1) continue;
      const fade = 1 - p;
      const pal = 'side' in i ? SIDE[i.side] : null;
      ctx.globalAlpha = fade;

      switch (i.k) {
        case 'slash':
          ctx.fillStyle = pal!.accent;
          ctx.fillRect(i.x, i.y - 12 + p * 20, i.dir > 0 ? 22 : -22, 3);
          break;
        case 'tracer':
          ctx.fillStyle = pal!.weapon;
          ctx.fillRect(i.x, i.y - 1, i.dir * i.len * (0.4 + p * 0.6), 2);
          break;
        case 'muzzle':
          ctx.fillStyle = STATUS.flash;
          ctx.beginPath();
          ctx.arc(i.x, i.y, 3 + p * 7, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'shell': {
          const tx = i.x + i.dir * i.len * p;
          ctx.fillStyle = pal!.accent;
          ctx.beginPath();
          ctx.moveTo(tx + i.dir * 6, i.y);
          ctx.lineTo(tx, i.y - 3);
          ctx.lineTo(tx, i.y + 3);
          ctx.closePath();
          ctx.fill();
          break;
        }
        case 'dash':
          ctx.fillStyle = pal!.accent;
          ctx.fillRect(i.x + i.dir * p * 16, i.y - 1, i.dir * 7, 2);
          break;
        case 'bomb': {
          const drop = p * 30;
          ctx.fillStyle = pal!.weapon;
          ctx.beginPath();
          ctx.arc(i.x + i.dir * p * 10, i.y + drop, 4, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'splash':
          ctx.strokeStyle = pal!.accent;
          ctx.lineWidth = 3 * fade + 1;
          ctx.beginPath();
          ctx.arc(i.x, i.y, i.r * (0.25 + p * 0.75), 0, Math.PI * 2);
          ctx.stroke();
          break;
        case 'miss':
          ctx.fillStyle = STATUS.hpMid;
          ctx.font = '700 12px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('MISS', i.x, i.y - p * 16);
          break;
        case 'frag': {
          const t = p * (LIFE.frag / 1000);
          ctx.fillStyle = pal!.body;
          ctx.fillRect(i.x + i.vx * t, i.y + i.vy * t + 380 * t * t, i.s, i.s);
          break;
        }
        case 'castleBurst':
          ctx.fillStyle = STATUS.flash;
          ctx.beginPath();
          ctx.arc(i.x, i.y, 6 + p * 22, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'blast': {
          // 안쪽 섬광
          ctx.fillStyle = STATUS.flash;
          ctx.globalAlpha = fade * fade;
          ctx.beginPath();
          ctx.arc(i.x, i.y, i.r * 0.45 * (1 - p * 0.4), 0, Math.PI * 2);
          ctx.fill();
          // 바깥 충격파
          ctx.globalAlpha = fade;
          ctx.strokeStyle = pal!.accent;
          ctx.lineWidth = 4 * fade + 1;
          ctx.beginPath();
          ctx.arc(i.x, i.y, i.r * (0.2 + p * 0.9), 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
  }
}
