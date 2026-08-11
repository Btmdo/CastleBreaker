/**
 * 기획서 §12.9.4 — 에셋 파이프라인.
 * 파츠 도형 → 오프스크린 캔버스 래스터화 → 프리셋 단위 합성 캐시.
 * 조합이 수백 가지이므로 전 조합을 미리 굽지 않고, 매치에 등장하는 12종
 * (덱 6종 × 진영 2) 만 굽는다. 전투 루프는 drawImage 만 호출한다.
 */
import { SPRITE_ALLOC_PX, STATUS, type SideKey } from './palette';
import {
  PX_PER_DESIGN, assembleShapes, drawShapes, shapesBounds,
  type Shape, type UnitParts,
} from './parts-svg';
import type { Decks, PresetResolved, Side } from '../sim/types';

/** 슈퍼샘플링 배율 — 40px 로 굽고 20px 로 그려 계단을 없앤다 */
const SS = 3;
const PAD = 2 * SS;

export interface UnitSprite {
  canvas: HTMLCanvasElement;
  flash: HTMLCanvasElement;
  /** 캔버스 내에서 몸통 원점(x=0)의 위치 (표시 px 기준) */
  anchorX: number;
  /** 캔버스 내에서 유닛 바닥의 위치 (표시 px 기준) */
  anchorBottom: number;
  w: number;
  h: number;
  /** 코어 폭 검증용 — 네거티브 스페이스 규약(§12.9.2) 확인에 쓴다 */
  coreWidthPx: number;
}

function mirror(shapes: Shape[]): Shape[] {
  return shapes.map((s) => {
    if (s.t === 'rect') return { ...s, x: -(s.x + s.w) };
    if (s.t === 'circle') return { ...s, cx: -s.cx };
    const pts = s.pts.slice();
    for (let i = 0; i < pts.length; i += 2) pts[i] = -pts[i];
    return { ...s, pts };
  });
}

/** 코어(몸통·다리·특수) 폭만 측정 — 전방으로 뻗는 무장은 제외한다 */
function coreWidth(parts: UnitParts): number {
  const core: UnitParts = { ...parts, arms: [null, null], weapons: [] };
  return shapesBounds(assembleShapes(core)).w * PX_PER_DESIGN;
}

function bake(parts: UnitParts, side: SideKey): UnitSprite {
  let shapes = assembleShapes(parts);
  if (side === 'P2') shapes = mirror(shapes);

  const b = shapesBounds(shapes);
  const S = PX_PER_DESIGN * SS;
  const w = Math.ceil(b.w * S) + PAD * 2;
  const h = Math.ceil(b.h * S) + PAD * 2;
  const ox = PAD - b.x0 * S;
  const oy = PAD - b.y0 * S;

  const make = (override?: string) => {
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, w);
    cv.height = Math.max(1, h);
    const ctx = cv.getContext('2d')!;
    drawShapes(ctx, shapes, side, ox, oy, S, override);
    return cv;
  };

  return {
    canvas: make(),
    flash: make(STATUS.flash),
    anchorX: ox / SS,
    anchorBottom: (oy + b.y1 * S) / SS,
    w: w / SS,
    h: h / SS,
    coreWidthPx: coreWidth(parts),
  };
}

export type SpriteCache = Map<string, UnitSprite>;

export function spriteKey(side: Side, slot: number): string {
  return `${side}:${slot}`;
}

/** 매치 시작 시 1회 호출. 덱 6종 × 진영 2 = 12장 (+ 플래시 변형 12장) */
export function buildSpriteCache(decks: Decks): SpriteCache {
  const cache: SpriteCache = new Map();
  for (const side of ['P1', 'P2'] as const) {
    decks[side].forEach((def, slot) => {
      cache.set(spriteKey(side, slot), bake(def.parts as UnitParts, side));
    });
  }
  return cache;
}

/** 단발 스프라이트 (매칭 화면 회전 연출 등) */
export function bakeOne(def: PresetResolved, side: SideKey): UnitSprite {
  return bake(def.parts as UnitParts, side);
}

/**
 * 판독성 규약 자체 점검 (§12.9.2).
 * 코어 폭이 SPRITE_ALLOC_PX 를 넘으면 인접 유닛과 붙어 한 덩어리로 보인다.
 */
export function auditReadability(cache: SpriteCache): { key: string; coreWidthPx: number }[] {
  const bad: { key: string; coreWidthPx: number }[] = [];
  for (const [key, sp] of cache) {
    if (sp.coreWidthPx > SPRITE_ALLOC_PX - 2) bad.push({ key, coreWidthPx: sp.coreWidthPx });
  }
  return bad;
}
