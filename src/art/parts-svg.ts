/**
 * 기획서 §12.9 — 파츠 아트 정의.
 *
 * 도형 데이터를 단일 진실 원천으로 두고, 두 렌더러가 공유한다.
 *   · shapesToSvg()  → 조립소(React DOM) — 파츠 비행·고스트 프리뷰 연출에 필요
 *   · drawShapes()   → 전투 화면(Canvas) — 프리렌더 후 drawImage
 *
 * 스타일 규약: 아웃라인 없음 / 단색 면 / 기본 도형(사각·다각·원)만 / 자유곡선 금지.
 * 좌표계: 몸통 중심이 원점, +x 가 적 방향. 디자인 단위(design unit).
 */
import { SPRITE_DRAW_PX, SIDE, type SideKey, type Tone } from './palette';

export type Shape =
  | { t: 'rect'; x: number; y: number; w: number; h: number; tone: Tone }
  | { t: 'poly'; pts: number[]; tone: Tone }
  | { t: 'circle'; cx: number; cy: number; r: number; tone: Tone };

type AnchorName = 'ARM0' | 'ARM1' | 'LEG' | 'SPECIAL' | 'WEAPON';

interface PartArt {
  shapes: Shape[];
  anchors?: Partial<Record<AnchorName, [number, number]>>;
}

/** 코어(몸통) 최대 폭 = 16 디자인 단위. 이 값이 SPRITE_DRAW_PX(20px)에 대응한다. */
export const DESIGN_CORE_WIDTH = 16;
export const PX_PER_DESIGN = SPRITE_DRAW_PX / DESIGN_CORE_WIDTH; // 1.25

const r = (x: number, y: number, w: number, h: number, tone: Tone): Shape =>
  ({ t: 'rect', x, y, w, h, tone });
const p = (tone: Tone, ...pts: number[]): Shape => ({ t: 'poly', pts, tone });
const c = (cx: number, cy: number, rad: number, tone: Tone): Shape =>
  ({ t: 'circle', cx, cy, r: rad, tone });

export const PART_ART: Record<string, PartArt> = {
  // ── 몸통 ──
  B_H: {
    // 낮고 넓은 저중심 차대. 앞쪽 상단을 깎아 방향성을 준다.
    // 팔 마운트가 차체 '위'에 있어, 무장을 달면 전차 포탑처럼 보인다.
    shapes: [
      p('body', -8, -4, 5, -4, 8, -1, 8, 4, -8, 4),
      r(-4.5, -6, 9, 2.4, 'body'), // 포탑 링
    ],
    anchors: { ARM0: [0, -6.5], LEG: [0, 4], SPECIAL: [-6, -7] },
  },
  B_V: {
    // 직립 구조. 팔은 몸통 옆에 달린다 (인간형).
    shapes: [p('body', -4, -10, 2, -10, 5, -7, 5, 5, -4, 5)],
    anchors: { ARM0: [4, -7], ARM1: [4, -1], LEG: [0, 5], SPECIAL: [-1, -11] },
  },

  // ── 팔 (앵커에서 +x 방향) ──
  A_ROBOT: {
    shapes: [r(0, -1.5, 5, 3, 'arm'), r(4, -2.5, 3, 5, 'arm')],
    anchors: { WEAPON: [7, 0] },
  },
  A_CANNON: {
    shapes: [r(-1, -3, 5, 6, 'arm'), r(4, -1.5, 12, 3, 'arm'), r(15, -2.2, 2, 4.4, 'weapon')],
  },
  A_PYLON: {
    shapes: [r(0, -1, 6, 2, 'arm')],
    anchors: { WEAPON: [6, 0] },
  },
  A_AUTO: {
    // 짧은 총열 + 드럼 탄창
    shapes: [
      r(-1, -2.4, 4.5, 4.8, 'arm'),
      c(0.5, 3.2, 2.2, 'body'),
      r(3.5, -1, 7.5, 2, 'arm'),
      r(10.5, -1.4, 1.6, 2.8, 'weapon'),
    ],
  },
  A_BLADE: {
    // 축 + 원형 톱날
    shapes: [
      r(0, -1.4, 5, 2.8, 'arm'),
      c(8.6, 0, 4.6, 'weapon'),
      p('accent', 8.6, -4.6, 10.8, -3.0, 8.6, -2.4),
      p('accent', 13.0, 0.8, 11.2, -1.6, 10.4, 1.4),
      p('accent', 8.6, 4.6, 6.4, 3.0, 8.6, 2.4),
      c(8.6, 0, 1.5, 'arm'),
    ],
  },
  A_MLRS: {
    // 발사관 묶음
    shapes: [
      r(-1.5, -2, 2.5, 4, 'body'),
      r(0.5, -4.2, 9.5, 8.4, 'arm'),
      r(9.5, -3.4, 2.2, 1.7, 'weapon'),
      r(9.5, -0.9, 2.2, 1.7, 'weapon'),
      r(9.5, 1.6, 2.2, 1.7, 'weapon'),
    ],
  },
  A_RAIL: {
    // 대형 약실 + 두 줄 레일
    shapes: [
      r(-2, -3.6, 6.5, 7.2, 'arm'),
      r(0, -6.2, 3.5, 2.6, 'weapon'),
      r(4.5, -2.4, 17, 1.7, 'arm'),
      r(4.5, 0.7, 17, 1.7, 'arm'),
      r(21, -2.8, 2.2, 5.6, 'accent'),
    ],
  },
  A_CHARGE: {
    // 뭉툭한 탄두 + 경고 줄무늬
    shapes: [
      r(0, -2.4, 4.5, 4.8, 'arm'),
      c(7, 0, 3.6, 'weapon'),
      r(4.8, -1, 1.7, 2, 'accent'),
      r(8.4, -1, 1.7, 2, 'accent'),
    ],
  },

  // ── 무기 ──
  W_SABER: {
    shapes: [r(0, -1.5, 3, 3, 'weapon'), r(3, -0.7, 10, 1.4, 'accent')],
  },
  W_BOMB: {
    shapes: [c(3, 2, 2.6, 'weapon'), p('special', 0.5, 0.5, 3, -1.6, 5.5, 0.5)],
  },
  W_MSL: {
    shapes: [
      r(0, -1.3, 7, 2.6, 'weapon'),
      p('accent', 7, -1.3, 11, 0, 7, 1.3),
      p('special', 0, -1.3, -2.5, -3.2, 0, -0.4),
    ],
  },
  W_RIFLE20: {
    // 소형 제식 소총 + 탄창
    shapes: [
      r(0, -1.2, 9, 2.4, 'weapon'),
      r(2.2, 1.2, 2.4, 2.4, 'weapon'),
      r(9, -0.9, 2, 1.8, 'accent'),
    ],
  },
  W_RIFLE85: {
    // 장총신 + 조준경 + 총구제동기
    shapes: [
      r(0, -1.5, 14.5, 2.7, 'weapon'),
      r(1.2, -3.6, 4.5, 2.1, 'special'),
      r(2.4, 1.2, 3, 2.2, 'weapon'),
      r(14.5, -1.9, 2.6, 3.5, 'accent'),
    ],
  },
  W_GRENADE: {
    // 수류탄 두 발 + 안전핀
    shapes: [
      c(3.2, 0, 3, 'weapon'),
      r(2.4, -4.4, 1.6, 1.8, 'special'),
      c(7.8, 1.6, 2.2, 'weapon'),
      r(7, -1.2, 1.4, 1.4, 'accent'),
    ],
  },

  // ── 다리 (앵커에서 아래로) ──
  L_WHEEL: {
    shapes: [r(-5, 0, 10, 2, 'leg'), c(-4, 3, 3.2, 'leg'), c(4, 3, 3.2, 'leg')],
  },
  L_TRACK: {
    // 차체에 물리도록 앵커보다 위에서 시작한다
    shapes: [r(-7, -1, 14, 6, 'leg'), c(-4.5, 2, 1.8, 'body'), c(4.5, 2, 1.8, 'body')],
  },
  L_QUAD: {
    shapes: [
      p('leg', -6.5, 0, -4.5, 0, -5.2, 6.5, -7.2, 6.5),
      p('leg', -2.5, 0, -0.5, 0, -1.2, 6.5, -3.2, 6.5),
      p('leg', 1.5, 0, 3.5, 0, 4.2, 6.5, 2.2, 6.5),
      p('leg', 4.5, 0, 6.5, 0, 7.2, 6.5, 5.2, 6.5),
      r(-7.6, 6.2, 3, 1.6, 'body'), r(4.8, 6.2, 3, 1.6, 'body'),
    ],
  },
  L_BIPED: {
    shapes: [
      p('leg', -4, 0, -1, 0, -2, 7, -5, 7),
      p('leg', 1, 0, 4, 0, 5, 7, 2, 7),
      r(-5.6, 6.6, 4.2, 1.8, 'body'), r(1.4, 6.6, 4.2, 1.8, 'body'),
    ],
  },
  L_JET: {
    shapes: [
      r(-6, 0, 11, 4.2, 'leg'),
      p('body', -6, 0, -6, 4.2, -9.5, 3.2, -9.5, 1),
      r(2, 4.2, 3, 1.4, 'body'),
    ],
  },

  // ── 특수 ──
  S_HEAD: {
    shapes: [r(-2.5, -4, 5, 4, 'special'), r(0.8, -3.1, 2.6, 1.5, 'accent')],
  },
  S_HMG: {
    shapes: [r(-1, -2.6, 4, 3.2, 'special'), r(3, -1.6, 6.5, 1.3, 'accent')],
  },
  S_WING: {
    shapes: [
      p('special', 0, -1, -10, -5.5, -10, -1.5),
      p('special', 0, 1, -10, 5.5, -10, 1.5),
    ],
  },
  S_CHARGE: {
    // 등에 얹은 폭약 뭉치 + 기폭 장치
    shapes: [
      r(-3.4, -4.2, 6.8, 4.2, 'special'),
      c(0, -5.4, 2.6, 'special'),
      r(-0.9, -8.4, 1.8, 2.4, 'accent'),
      r(-3.4, -2.4, 6.8, 1.2, 'accent'),
    ],
  },
};

// ─────────────────────────────────────────────────────────────
// 조립 — 앵커를 맞춰 레이어를 겹친다
// ─────────────────────────────────────────────────────────────

function shift(shapes: Shape[], dx: number, dy: number): Shape[] {
  return shapes.map((s) => {
    if (s.t === 'rect') return { ...s, x: s.x + dx, y: s.y + dy };
    if (s.t === 'circle') return { ...s, cx: s.cx + dx, cy: s.cy + dy };
    const pts = s.pts.slice();
    for (let i = 0; i < pts.length; i += 2) { pts[i] += dx; pts[i + 1] += dy; }
    return { ...s, pts };
  });
}

export interface UnitParts {
  body: string;
  arms: (string | null)[];
  weapons: { mount: 'ARM0' | 'ARM1'; part: string }[];
  leg: string | null;
  special: string | null;
}

/**
 * 조립된 유닛의 전체 도형을 반환.
 * 레이어 순서(뒤 → 앞): 다리 → 몸통 → 팔 → 무기 → 특수 (기획서 §12.9.5)
 */
export function assembleShapes(parts: UnitParts): Shape[] {
  const bodyArt = PART_ART[parts.body];
  if (!bodyArt) return [];
  const A = bodyArt.anchors ?? {};

  const legLayer: Shape[] = [];
  const bodyLayer: Shape[] = [...bodyArt.shapes];
  const armLayer: Shape[] = [];
  const weaponLayer: Shape[] = [];
  const specialLayer: Shape[] = [];

  if (parts.leg && PART_ART[parts.leg] && A.LEG) {
    legLayer.push(...shift(PART_ART[parts.leg].shapes, A.LEG[0], A.LEG[1]));
  }

  // 팔 — 그리고 그 팔의 WEAPON 앵커 절대 위치를 기록
  const armWeaponAt: Partial<Record<'ARM0' | 'ARM1', [number, number]>> = {};
  for (let i = 0; i < 2; i++) {
    const id = parts.arms[i];
    const slot = (i === 0 ? 'ARM0' : 'ARM1') as 'ARM0' | 'ARM1';
    const base = A[slot];
    if (!id || !PART_ART[id] || !base) continue;
    const art = PART_ART[id];
    armLayer.push(...shift(art.shapes, base[0], base[1]));
    if (art.anchors?.WEAPON) {
      armWeaponAt[slot] = [base[0] + art.anchors.WEAPON[0], base[1] + art.anchors.WEAPON[1]];
    }
  }

  for (const w of parts.weapons) {
    const art = PART_ART[w.part];
    if (!art) continue;
    const at = armWeaponAt[w.mount];
    if (!at) continue;
    weaponLayer.push(...shift(art.shapes, at[0], at[1]));
  }

  if (parts.special && PART_ART[parts.special] && A.SPECIAL) {
    specialLayer.push(...shift(PART_ART[parts.special].shapes, A.SPECIAL[0], A.SPECIAL[1]));
  }

  return [...legLayer, ...bodyLayer, ...armLayer, ...weaponLayer, ...specialLayer];
}

export function shapesBounds(shapes: Shape[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const acc = (x: number, y: number) => {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  };
  for (const s of shapes) {
    if (s.t === 'rect') { acc(s.x, s.y); acc(s.x + s.w, s.y + s.h); }
    else if (s.t === 'circle') { acc(s.cx - s.r, s.cy - s.r); acc(s.cx + s.r, s.cy + s.r); }
    else for (let i = 0; i < s.pts.length; i += 2) acc(s.pts[i], s.pts[i + 1]);
  }
  if (!Number.isFinite(x0)) return { x0: 0, y0: 0, x1: 0, y1: 0, w: 0, h: 0 };
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

// ─────────────────────────────────────────────────────────────
// 렌더러 A — Canvas
// ─────────────────────────────────────────────────────────────

export function drawShapes(
  ctx: CanvasRenderingContext2D, shapes: Shape[], side: SideKey,
  ox: number, oy: number, scale: number, overrideColor?: string,
): void {
  const pal = SIDE[side];
  for (const s of shapes) {
    ctx.fillStyle = overrideColor ?? pal[s.tone];
    if (s.t === 'rect') {
      ctx.fillRect(ox + s.x * scale, oy + s.y * scale, s.w * scale, s.h * scale);
    } else if (s.t === 'circle') {
      ctx.beginPath();
      ctx.arc(ox + s.cx * scale, oy + s.cy * scale, s.r * scale, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(ox + s.pts[0] * scale, oy + s.pts[1] * scale);
      for (let i = 2; i < s.pts.length; i += 2) {
        ctx.lineTo(ox + s.pts[i] * scale, oy + s.pts[i + 1] * scale);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 렌더러 B — SVG 문자열 (React DOM)
// ─────────────────────────────────────────────────────────────

export function shapesToSvgBody(shapes: Shape[], side: SideKey, overrideColor?: string): string {
  const pal = SIDE[side];
  const out: string[] = [];
  for (const s of shapes) {
    const fill = overrideColor ?? pal[s.tone];
    if (s.t === 'rect') {
      out.push(`<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${fill}"/>`);
    } else if (s.t === 'circle') {
      out.push(`<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" fill="${fill}"/>`);
    } else {
      const d: string[] = [];
      for (let i = 0; i < s.pts.length; i += 2) d.push(`${s.pts[i]},${s.pts[i + 1]}`);
      out.push(`<polygon points="${d.join(' ')}" fill="${fill}"/>`);
    }
  }
  return out.join('');
}

/** 도형 묶음을 자체 viewBox 를 가진 완결된 SVG 문자열로 만든다 */
export function shapesToSvg(
  shapes: Shape[], side: SideKey,
  opts: { pad?: number; width?: number; height?: number; overrideColor?: string } = {},
): string {
  const pad = opts.pad ?? 2;
  const b = shapesBounds(shapes);
  const vb = `${b.x0 - pad} ${b.y0 - pad} ${b.w + pad * 2} ${b.h + pad * 2}`;
  const wh =
    opts.width || opts.height
      ? ` width="${opts.width ?? ''}" height="${opts.height ?? ''}"`
      : '';
  return (
    `<svg viewBox="${vb}"${wh} xmlns="http://www.w3.org/2000/svg" ` +
    `preserveAspectRatio="xMidYMid meet">${shapesToSvgBody(shapes, side, opts.overrideColor)}</svg>`
  );
}

/** 단일 파츠 미리보기 SVG (파츠 목록 카드용) */
export function partPreviewSvg(partId: string, side: SideKey = 'P1'): string {
  const art = PART_ART[partId];
  if (!art) return '';
  return shapesToSvg(art.shapes, side, { pad: 1.5 });
}

/** 조립 유닛 미리보기 SVG (도면·덱 카드·튜토리얼용) */
export function unitSvg(parts: UnitParts, side: SideKey = 'P1', overrideColor?: string): string {
  return shapesToSvg(assembleShapes(parts), side, { pad: 2, overrideColor });
}

export type LayerName = 'leg' | 'body' | 'arm' | 'weapon' | 'special';

/**
 * 레이어별로 분리된 SVG 조각 + 공통 viewBox.
 * 메인 화면 로고 조립 연출과 조립소 AN-1 파츠 비행 연출에서, 각 레이어를
 * 독립적으로 움직이면서도 정렬을 유지하기 위해 필요하다.
 */
export function unitLayers(parts: UnitParts, side: SideKey = 'P1') {
  const all = assembleShapes(parts);
  const b = shapesBounds(all);
  const pad = 2;
  const viewBox = `${b.x0 - pad} ${b.y0 - pad} ${b.w + pad * 2} ${b.h + pad * 2}`;

  const only = (keep: LayerName): Shape[] => {
    const sel: UnitParts = {
      body: keep === 'body' ? parts.body : parts.body, // 몸통은 앵커 기준이라 항상 필요
      arms: keep === 'arm' || keep === 'weapon' ? parts.arms : [null, null],
      weapons: keep === 'weapon' ? parts.weapons : [],
      leg: keep === 'leg' ? parts.leg : null,
      special: keep === 'special' ? parts.special : null,
    };
    const shapes = assembleShapes(sel);
    // 몸통 도형은 body 레이어에서만 남긴다
    const bodyShapes = assembleShapes({
      body: parts.body, arms: [null, null], weapons: [], leg: null, special: null,
    });
    if (keep === 'body') return bodyShapes;
    const bodySet = new Set(bodyShapes.map((s) => JSON.stringify(s)));
    let out = shapes.filter((s) => !bodySet.has(JSON.stringify(s)));
    // weapon 레이어에서는 팔 도형도 제외
    if (keep === 'weapon') {
      const armShapes = assembleShapes({
        body: parts.body, arms: parts.arms, weapons: [], leg: null, special: null,
      }).filter((s) => !bodySet.has(JSON.stringify(s)));
      const armSet = new Set(armShapes.map((s) => JSON.stringify(s)));
      out = out.filter((s) => !armSet.has(JSON.stringify(s)));
    }
    return out;
  };

  const order: LayerName[] = ['leg', 'body', 'arm', 'weapon', 'special'];
  const layers = order
    .map((name) => ({ name, shapes: only(name) }))
    .filter((l) => l.shapes.length > 0)
    .map((l) => ({ name: l.name, inner: shapesToSvgBody(l.shapes, side) }));

  return { viewBox, layers };
}

/** 메인 화면 로고에 쓰는 대표 기체 */
export const LOGO_UNIT: UnitParts = {
  body: 'B_H',
  arms: ['A_CANNON', null],
  weapons: [],
  leg: 'L_TRACK',
  special: 'S_HEAD',
};
