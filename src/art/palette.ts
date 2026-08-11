// 기획서 §12.9.3 / §17 — 미니멀 기하학적 플랫 색 팔레트
// 아웃라인 없음. 단색 면만. 경계는 네거티브 스페이스로 만든다.

export const BG = {
  sky: '#1B2430',
  ground: '#2A3644',
  groundLine: '#3C4C5E',
  app: '#141C26',
  panel: '#1E2936',
  panelHi: '#27364A',
} as const;

export const TEXT = {
  primary: '#E6EDF3',
  secondary: '#8B9AAB',
  disabled: '#54636F',
} as const;

/** 파츠 카테고리별 명도 위계 — 어두움(leg) → 밝음(special). 겹쳐도 구조가 읽힌다. */
export type Tone = 'leg' | 'body' | 'arm' | 'weapon' | 'special' | 'accent';

export const SIDE = {
  P1: {
    leg: '#1C6E77', body: '#2A94A0', arm: '#38BEC9',
    weapon: '#6FD3DB', special: '#A7E8ED', accent: '#D6F7FA',
    castle: '#2A94A0', castleDark: '#1C6E77',
  },
  P2: {
    leg: '#8C4418', body: '#C4632A', arm: '#F0803C',
    weapon: '#F5A268', special: '#FAC79E', accent: '#FDE3CE',
    castle: '#C4632A', castleDark: '#8C4418',
  },
} as const;

export type SideKey = keyof typeof SIDE;

export const STATUS = {
  hpHigh: '#4ADE80',
  hpMid: '#FACC15',
  hpLow: '#EF4444',
  funds: '#FACC15',
  danger: '#EF4444',
  success: '#4ADE80',
  flash: '#FFFFFF',
} as const;

/** 판독성 규약 — 기획서 §12.9.2. 변경 금지. */
export const SPRITE_ALLOC_PX = 24; // 유닛 1기에 할당된 폭 (12u × 2px/u)
export const SPRITE_DRAW_PX = 20; // 실제로 그리는 폭
export const NEGATIVE_SPACE_PX = (SPRITE_ALLOC_PX - SPRITE_DRAW_PX) / 2; // 2px

export function hpColor(frac: number): string {
  if (frac > 0.6) return STATUS.hpHigh;
  if (frac > 0.3) return STATUS.hpMid;
  return STATUS.hpLow;
}

export function toneColor(side: SideKey, tone: Tone): string {
  return SIDE[side][tone];
}
