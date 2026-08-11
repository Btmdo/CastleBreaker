/**
 * 전장 캔버스 렌더러. 기획서 §3.3 / §12.9
 * 스프라이트는 프리렌더 캐시에서 drawImage 로만 그린다.
 */
import { BG, SIDE, SPRITE_DRAW_PX, STATUS, hpColor } from '../art/palette';
import type { SpriteCache } from '../art/prerender';
import { spriteKey } from '../art/prerender';
import { FIELD_WIDTH, UNIT_GAP_MILLI } from '../sim/constants';
import type { Decks, MatchState, Side, Unit } from '../sim/types';
import type { Fx } from './effects';
import {
  CANVAS_H, CANVAS_W, CASTLE_H_PX, CASTLE_W_PX, FIELD_MARGIN_PX,
  LANE_Y_AIR, LANE_Y_GROUND, PX_PER_UNIT, castleX, facing, laneY, toX,
} from './view';

const FIELD_PX = FIELD_WIDTH * PX_PER_UNIT;

function drawBackdrop(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = BG.sky;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // 공중 레인 가이드 — 아주 옅게
  ctx.fillStyle = BG.groundLine;
  ctx.globalAlpha = 0.35;
  ctx.fillRect(FIELD_MARGIN_PX, LANE_Y_AIR + 4, FIELD_PX, 1);
  ctx.globalAlpha = 1;

  // 지면
  ctx.fillStyle = BG.ground;
  ctx.fillRect(0, LANE_Y_GROUND, CANVAS_W, CANVAS_H - LANE_Y_GROUND);
  ctx.fillStyle = BG.groundLine;
  ctx.fillRect(0, LANE_Y_GROUND, CANVAS_W, 2);

  // 거리 눈금 — 100u 마다
  ctx.fillStyle = BG.groundLine;
  for (let u = 100; u < FIELD_WIDTH; u += 100) {
    const x = FIELD_MARGIN_PX + u * PX_PER_UNIT;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(x, LANE_Y_GROUND + 8, 1, 10);
    ctx.globalAlpha = 1;
  }
}

function drawCastle(ctx: CanvasRenderingContext2D, s: MatchState, side: Side, fx: Fx, now: number) {
  const pal = SIDE[side];
  const dir = facing(side);
  const baseX = castleX(side);
  const shake = fx.castleShakeOffset(side, now);
  const x = (dir > 0 ? baseX - CASTLE_W_PX : baseX) + shake;
  const y = LANE_Y_GROUND - CASTLE_H_PX;

  // 본체
  ctx.fillStyle = pal.castle;
  ctx.fillRect(x, y, CASTLE_W_PX, CASTLE_H_PX);
  // 상단 띠
  ctx.fillStyle = pal.castleDark;
  ctx.fillRect(x, y, CASTLE_W_PX, 18);
  // 흉벽 (기하학적 요철)
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(x + 4 + i * 19, y - 10, 12, 12);
  }
  // 창문
  ctx.fillStyle = pal.castleDark;
  ctx.fillRect(x + 16, y + 46, 16, 26);
  ctx.fillRect(x + 48, y + 46, 16, 26);
  ctx.fillRect(x + 32, y + 96, 16, 34);

  // 성 HP 바 — 성 위에 (철벽 성채 퍽으로 최대 HP가 늘었을 수 있다)
  const frac = Math.max(0, s.castleHp[side]) / s.castleMaxHp[side];
  const bw = CASTLE_W_PX + 12;
  const bx = x - 6;
  const by = y - 30;
  ctx.fillStyle = BG.panel;
  ctx.fillRect(bx, by, bw, 8);
  ctx.fillStyle = hpColor(frac);
  ctx.fillRect(bx, by, bw * frac, 8);
}

/**
 * 겹친 유닛의 표시 전용 계단 배치 (기획서 §12.9.2).
 *
 * 유닛이 서로 겹칠 수 있게 되면서 중심 간격 12u 보장이 사라졌다. 아웃라인이
 * 없는 플랫 스타일에서 같은 자리에 겹친 유닛은 한 덩어리로 보이므로, 겹치는
 * 유닛에 행 번호를 돌려 배정해 위로 조금씩 밀어 올린다.
 * ★ 시뮬레이션 좌표(u.d)는 절대 건드리지 않는다. 순수 표시 계층 처리다.
 */
const STACK_ROWS = 4;
const STACK_DY = 7; // 행당 위로 밀어 올리는 px
const STACK_DX = 3; // 행당 뒤로 미는 px (깊이감)

function computeStackRows(units: Unit[]): Map<number, number> {
  const rows = new Map<number, number>();
  const groups = new Map<string, Unit[]>();
  for (const u of units) {
    const k = `${u.side}:${u.lane}`;
    let g = groups.get(k);
    if (!g) { g = []; groups.set(k, g); }
    g.push(u);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.d - b.d || a.id - b.id);
    let row = 0;
    for (let i = 0; i < list.length; i++) {
      if (i === 0) row = 0;
      else if (Math.abs(list[i].d - list[i - 1].d) >= UNIT_GAP_MILLI) row = 0;
      else row = (row + 1) % STACK_ROWS;
      rows.set(list[i].id, row);
    }
  }
  return rows;
}

function legMotion(legId: string | null, u: Unit, now: number): { dy: number; spin: number } {
  if (!legId) return { dy: 0, spin: 0 };
  const phase = now * 0.012 + u.id * 1.7;
  switch (legId) {
    case 'L_WHEEL':
    case 'L_TRACK':
      return { dy: 0, spin: now * 0.02 + u.id };
    case 'L_BIPED':
      return { dy: Math.abs(Math.sin(phase)) * -1.6, spin: 0 };
    case 'L_QUAD':
      return { dy: Math.abs(Math.sin(phase * 1.5)) * -1.1, spin: 0 };
    case 'L_JET':
      return { dy: Math.sin(phase * 0.7) * 1.2, spin: 0 };
    default:
      return { dy: 0, spin: 0 };
  }
}

function drawUnit(
  ctx: CanvasRenderingContext2D, u: Unit, decks: Decks,
  cache: SpriteCache, fx: Fx, now: number, moving: boolean, row: number,
) {
  const def = decks[u.side][u.presetSlot];
  const sp = cache.get(spriteKey(u.side, u.presetSlot));
  if (!sp) return;

  const x = toX(u.side, u.d) - facing(u.side) * row * STACK_DX;
  const base = laneY(u.lane) - row * STACK_DY;
  const m = moving ? legMotion(def.parts.leg, u, now) : { dy: 0, spin: 0 };

  const dx = Math.round(x - sp.anchorX);
  const dy = Math.round(base - sp.anchorBottom + m.dy);

  // 제트 트레일
  if (def.parts.leg === 'L_JET' && moving) {
    const dir = facing(u.side);
    ctx.fillStyle = SIDE[u.side].accent;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(x - dir * 12, base - 8);
    ctx.lineTo(x - dir * (26 + Math.sin(now * 0.03 + u.id) * 6), base - 6);
    ctx.lineTo(x - dir * 12, base - 3);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  const img = fx.isFlashing(u.id, now) ? sp.flash : sp.canvas;
  ctx.drawImage(img, dx, dy, sp.w, sp.h);

  // 바퀴/궤도 회전 표식 — 스프라이트를 회전시키지 않고 작은 마커로 표현
  if (m.spin && (def.parts.leg === 'L_WHEEL' || def.parts.leg === 'L_TRACK')) {
    ctx.fillStyle = SIDE[u.side].accent;
    const rr = 3;
    for (const cx of [x - 5, x + 5]) {
      const a = m.spin;
      ctx.fillRect(cx + Math.cos(a) * rr - 1, base - 4 + Math.sin(a) * rr - 1, 2, 2);
    }
  }

  // HP 바 — 손상됐을 때만
  if (u.hp < u.maxHp) {
    const frac = u.hp / u.maxHp;
    const w = SPRITE_DRAW_PX;
    const bx = Math.round(x - w / 2);
    const by = dy - 7;
    ctx.fillStyle = BG.app;
    ctx.fillRect(bx, by, w, 3);
    ctx.fillStyle = hpColor(frac);
    ctx.fillRect(bx, by, w * frac, 3);
  }
}

/** 선택 시간에 표시하는 사거리 링 */
function drawRangeRings(ctx: CanvasRenderingContext2D, s: MatchState, decks: Decks) {
  ctx.globalAlpha = 0.16;
  for (const u of s.units) {
    const def = decks[u.side][u.presetSlot];
    if (def.attack <= 0) continue;
    const x = toX(u.side, u.d);
    const y = laneY(u.lane) - 10;
    const r = def.range * PX_PER_UNIT + 12;
    ctx.strokeStyle = SIDE[u.side].accent;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export interface RenderOpts {
  showRings: boolean;
  paused: boolean;
}

export function render(
  ctx: CanvasRenderingContext2D, s: MatchState, decks: Decks,
  cache: SpriteCache, fx: Fx, now: number, opts: RenderOpts,
) {
  drawBackdrop(ctx);
  drawCastle(ctx, s, 'P1', fx, now);
  drawCastle(ctx, s, 'P2', fx, now);

  if (opts.showRings) drawRangeRings(ctx, s, decks);

  // 계단 배치의 윗행(뒤쪽)을 먼저, 같은 행 안에서는 작은 d 를 먼저 그린다
  const rows = computeStackRows(s.units);
  const sorted = [...s.units].sort(
    (a, b) => (rows.get(b.id) ?? 0) - (rows.get(a.id) ?? 0) || a.d - b.d,
  );
  const moving = !opts.paused && s.phase === 'REALTIME';
  for (const u of sorted) {
    if (u.lane === 'AIR') continue;
    drawUnit(ctx, u, decks, cache, fx, now, moving, rows.get(u.id) ?? 0);
  }
  for (const u of sorted) {
    if (u.lane !== 'AIR') continue;
    drawUnit(ctx, u, decks, cache, fx, now, moving, rows.get(u.id) ?? 0);
  }

  fx.draw(ctx, now);

  // 시간 정지 표식
  if (s.phase === 'SELECTION') {
    ctx.fillStyle = BG.app;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.globalAlpha = 1;
    ctx.fillStyle = STATUS.funds;
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('■ 시간 정지 — 선택 시간', CANVAS_W / 2, 40);
  }
}

/** 유닛 화면 위치 조회 (이펙트가 회피 팝업 위치를 잡을 때 사용) */
export function unitScreenPos(s: MatchState, id: number): { x: number; y: number } | null {
  const u = s.units.find((x) => x.id === id);
  if (!u) return null;
  return { x: toX(u.side, u.d), y: laneY(u.lane) - 10 };
}
