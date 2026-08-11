// 논리 좌표(진행거리 밀리유닛) ↔ 화면 좌표 변환. 기획서 §3.3
import { FIELD_WIDTH } from '../sim/constants';
import type { Lane, Side } from '../sim/types';

export const CANVAS_W = 1280;
export const CANVAS_H = 720;
export const PX_PER_UNIT = 2;
export const FIELD_MARGIN_PX = 40;
export const LANE_Y_GROUND = 560;
export const LANE_Y_AIR = 300;
export const CASTLE_W_PX = 80;
export const CASTLE_H_PX = 150;
export const HP_BAR_SHOW_MS = 3000;

/** 진행거리(밀리유닛) → 화면 x. 자기 성이 0, 적 성이 600u. */
export function toX(side: Side, dMilli: number): number {
  const u = dMilli / 1000;
  return side === 'P1'
    ? FIELD_MARGIN_PX + u * PX_PER_UNIT
    : FIELD_MARGIN_PX + (FIELD_WIDTH - u) * PX_PER_UNIT;
}

export function laneY(lane: Lane): number {
  return lane === 'AIR' ? LANE_Y_AIR : LANE_Y_GROUND;
}

export function castleX(side: Side): number {
  return side === 'P1' ? FIELD_MARGIN_PX : FIELD_MARGIN_PX + FIELD_WIDTH * PX_PER_UNIT;
}

/** +1 = 오른쪽(P1 진격 방향), -1 = 왼쪽 */
export function facing(side: Side): 1 | -1 {
  return side === 'P1' ? 1 : -1;
}
