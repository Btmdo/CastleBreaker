import * as C from './constants';
import { partOrNull } from './parts';
import type { AssembleError, PartDef, Preset, PresetResolved, WeaponMount } from './types';

/** 조립에 실제로 장착된 파츠 전부를 순서대로 반환 (렌더 레이어 순서와 무관) */
export function equippedParts(p: Preset): PartDef[] {
  const out: PartDef[] = [];
  const body = partOrNull(p.body);
  if (body) out.push(body);
  for (const a of p.arms) {
    const d = partOrNull(a);
    if (d) out.push(d);
  }
  for (const w of p.weapons) {
    const d = partOrNull(w.part);
    if (d) out.push(d);
  }
  const leg = partOrNull(p.leg);
  if (leg) out.push(leg);
  const sp = partOrNull(p.special);
  if (sp) out.push(sp);
  return out;
}

/**
 * 기획서 §6.2 — 총 무기 슬롯 = Σ 팔 weaponMounts.
 * 몸통 직결 슬롯은 없다. 무기는 반드시 거치대(팔)를 거쳐야 한다.
 */
export function weaponSlotCount(p: Preset): number {
  let n = 0;
  for (const a of p.arms) {
    const d = partOrNull(a);
    if (d) n += d.weaponMounts ?? 0;
  }
  return n;
}

/** 해당 마운트에 무기를 달 수 있는지 */
export function mountAvailable(p: Preset, mount: WeaponMount): boolean {
  const idx = mount === 'ARM0' ? 0 : 1;
  const body = partOrNull(p.body);
  if (!body || (body.armSlots ?? 0) <= idx) return false;
  const arm = partOrNull(p.arms[idx]);
  return !!arm && (arm.weaponMounts ?? 0) >= 1;
}

/** 기획서 §6.3 유효성 검증 V-1 ~ V-7 */
export function validate(p: Preset): AssembleError[] {
  const errs: AssembleError[] = [];
  const body = partOrNull(p.body);

  // V-1
  if (!body || body.category !== 'BODY') {
    errs.push({ code: 'V-1', message: '몸통은 필수입니다' });
    return errs; // 몸통이 없으면 나머지 검증이 무의미
  }

  // V-2
  const armSlots = body.armSlots ?? 0;
  const armCount = p.arms.filter((a, i) => a !== null && i < 2).length;
  for (let i = armSlots; i < 2; i++) {
    if (p.arms[i]) {
      errs.push({ code: 'V-2', message: `이 몸통은 팔을 ${armSlots}개까지만 지원합니다` });
      break;
    }
  }
  void armCount;

  // V-3
  const slots = weaponSlotCount(p);
  if (p.weapons.length > slots) {
    errs.push({ code: 'V-3', message: '무기 거치대가 부족합니다' });
  }

  // V-4 — 마운트 유효성 및 중복
  const seen = new Set<string>();
  for (const w of p.weapons) {
    if (w.mount !== 'ARM0' && w.mount !== 'ARM1') {
      errs.push({ code: 'V-4', message: '무기 배치가 올바르지 않습니다' });
      continue;
    }
    if (seen.has(w.mount)) {
      errs.push({ code: 'V-4', message: '무기 배치가 올바르지 않습니다' });
    }
    seen.add(w.mount);
    const def = partOrNull(w.part);
    if (!def || def.category !== 'WEAPON') {
      errs.push({ code: 'V-4', message: '무기 배치가 올바르지 않습니다' });
    }
  }

  // V-5 — 무기는 그 팔이 거치대를 제공해야 달 수 있다
  for (const w of p.weapons) {
    if (!mountAvailable(p, w.mount)) {
      errs.push({ code: 'V-5', message: '이 팔에는 무기를 달 수 없습니다' });
    }
  }

  // V-6
  const leg = partOrNull(p.leg);
  if (p.leg && (!leg || leg.category !== 'LEG')) {
    errs.push({ code: 'V-6', message: '다리 파츠가 올바르지 않습니다' });
  }
  const sp = partOrNull(p.special);
  if (p.special && (!sp || sp.category !== 'SPECIAL')) {
    errs.push({ code: 'V-6', message: '특수 파츠가 올바르지 않습니다' });
  }
  for (let i = 0; i < 2; i++) {
    const a = partOrNull(p.arms[i]);
    if (p.arms[i] && (!a || a.category !== 'ARM')) {
      errs.push({ code: 'V-6', message: '팔 파츠가 올바르지 않습니다' });
    }
  }

  // V-7
  const nameLen = p.name.trim().length;
  if (nameLen < C.PRESET_NAME_MIN || nameLen > C.PRESET_NAME_MAX) {
    errs.push({ code: 'V-7', message: `이름은 ${C.PRESET_NAME_MIN}~${C.PRESET_NAME_MAX}자여야 합니다` });
  }

  return errs;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** 렌더 이펙트용 대표 무장 결정 */
function fxWeaponOf(ids: Set<string>): string {
  if (ids.has('A_CHARGE') || ids.has('S_CHARGE')) return 'charge';
  if (ids.has('A_RAIL')) return 'rail';
  if (ids.has('A_MLRS') || ids.has('W_GRENADE')) return 'bomb';
  if (ids.has('W_BOMB')) return 'bomb';
  if (ids.has('W_MSL')) return 'missile';
  if (ids.has('A_CANNON') || ids.has('W_RIFLE85')) return 'cannon';
  if (ids.has('A_BLADE') || ids.has('W_SABER')) return 'saber';
  if (ids.has('A_AUTO') || ids.has('W_RIFLE20') || ids.has('S_HMG')) return 'hmg';
  return 'none';
}

/**
 * 기획서 §8 — 조립 → 최종 스텟.
 * 모든 파츠 보정은 유닛 전체에 합산된다. 유닛은 무기를 몇 개 달았든 하나의 통합 공격을 한다.
 */
export function assemble(p: Preset): PresetResolved {
  const eq = equippedParts(p);

  let stability = C.BASE_STABILITY;
  let mobility = C.BASE_MOBILITY;
  let attack = C.BASE_ATTACK;
  let range = C.BASE_RANGE;
  let cycleDeci = C.BASE_CYCLE_DECI;
  let cost = 0;
  let canFly = false;
  let splashRadius = 0;
  let suicide = false;
  const ids = new Set<string>();

  for (const d of eq) {
    stability += d.stability ?? 0;
    mobility += d.mobility ?? 0;
    attack += d.attack ?? 0;
    range += d.range ?? 0;
    cycleDeci += d.cycleDeci ?? 0;
    cost += d.cost;
    if (d.canFly) canFly = true;
    if (d.suicide) suicide = true;
    if (d.splashRadius && d.splashRadius > splashRadius) splashRadius = d.splashRadius;
    ids.add(d.id);
  }

  stability = Math.max(C.MIN_STABILITY, stability);
  mobility = Math.max(0, mobility);
  attack = Math.max(0, attack);
  range = Math.max(C.MIN_RANGE, range);
  cycleDeci = Math.max(C.MIN_CYCLE_DECI, cycleDeci);

  const speedMilli = mobility * C.SPEED_PER_MOBILITY_MILLI;
  const evasionBp = clamp(mobility * C.EVASION_BP_PER_MOBILITY, 0, C.EVASION_BP_CAP);
  // 0.1초 = 3틱 이므로 cycleDeci × 3 은 항상 정수
  const cycleTicks = cycleDeci * (C.TICKS_PER_SEC / 10);

  return {
    presetId: p.id,
    name: p.name,
    cost,
    stability,
    mobility,
    attack,
    range,
    cycleTicks,
    speedMilli,
    evasionBp,
    canFly,
    splashRadius,
    suicide,
    cycleSec: cycleDeci / 10,
    dps: attack === 0 ? 0 : Math.round((attack / (cycleDeci / 10)) * 10) / 10,
    speedUps: Math.round(mobility * 0.6 * 10) / 10,
    canHitAir: range >= C.AA_MIN_RANGE,
    canHitGround: range >= C.AG_MIN_RANGE,
    parts: {
      body: p.body,
      arms: [p.arms[0], p.arms[1]],
      weapons: p.weapons.map((w) => ({ ...w })),
      leg: p.leg,
      special: p.special,
    },
    // @ts-expect-error — fxWeapon 은 렌더 전용 확장 필드
    fxWeapon: fxWeaponOf(ids),
  };
}

/** fxWeapon 접근용 헬퍼 (타입 확장 회피) */
export function fxWeapon(r: PresetResolved): string {
  return (r as unknown as { fxWeapon: string }).fxWeapon ?? 'none';
}

export function emptyPreset(id: string, name = '새 설계'): Preset {
  return { id, name, body: 'B_H', arms: [null, null], weapons: [], leg: null, special: null };
}

export function clonePreset(p: Preset): Preset {
  return {
    ...p,
    arms: [p.arms[0], p.arms[1]],
    weapons: p.weapons.map((w) => ({ ...w })),
  };
}
