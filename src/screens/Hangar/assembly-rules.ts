import { mountAvailable, weaponSlotCount } from '../../sim/assemble';
import { part } from '../../sim/parts';
import type { Preset, WeaponMount } from '../../sim/types';

/**
 * 파츠 클릭 → 어느 슬롯에 붙는지 결정하고, 구조가 깨지는 부속을 정리한다.
 * (몸통을 좁은 것으로 바꾸면 두 번째 팔이 떨어지고, 팔을 활강포로 바꾸면
 *  그 팔에 달렸던 무기가 떨어진다)
 */
export type AttachResult =
  | { ok: true; preset: Preset; slot: 'BODY' | 'ARM0' | 'ARM1' | 'LEG' | 'SPECIAL' | WeaponMount; dropped: string[] }
  | { ok: false; reason: string; slotHint: string };

function cleanup(p: Preset): { preset: Preset; dropped: string[] } {
  const dropped: string[] = [];
  const body = part(p.body);
  const armSlots = body.armSlots ?? 0;
  const arms: [string | null, string | null] = [p.arms[0], p.arms[1]];

  // 몸통이 지원하지 않는 팔 슬롯 정리
  for (let i = armSlots; i < 2; i++) {
    if (arms[i]) { dropped.push(arms[i]!); arms[i] = null; }
  }

  // 유효하지 않은 마운트의 무기 정리
  const probe: Preset = { ...p, arms, weapons: [] };
  const weapons = p.weapons.filter((w) => {
    const ok = mountAvailable(probe, w.mount);
    if (!ok) dropped.push(w.part);
    return ok;
  });

  return { preset: { ...p, arms, weapons }, dropped };
}

export function attach(p: Preset, partId: string): AttachResult {
  const d = part(partId);

  if (d.category === 'BODY') {
    const r = cleanup({ ...p, body: partId });
    return { ok: true, preset: r.preset, slot: 'BODY', dropped: r.dropped };
  }

  if (d.category === 'LEG') {
    return { ok: true, preset: { ...p, leg: partId }, slot: 'LEG', dropped: p.leg ? [p.leg] : [] };
  }

  if (d.category === 'SPECIAL') {
    return {
      ok: true, preset: { ...p, special: partId }, slot: 'SPECIAL',
      dropped: p.special ? [p.special] : [],
    };
  }

  if (d.category === 'ARM') {
    const body = part(p.body);
    const armSlots = body.armSlots ?? 0;
    if (armSlots === 0) {
      return { ok: false, reason: '이 몸통은 팔을 지원하지 않습니다', slotHint: 'ARM0' };
    }
    // 빈 슬롯 우선, 없으면 첫 슬롯을 교체
    let idx = -1;
    for (let i = 0; i < armSlots; i++) if (!p.arms[i]) { idx = i; break; }
    const replacing = idx < 0;
    if (replacing) idx = 0;
    const arms: [string | null, string | null] = [p.arms[0], p.arms[1]];
    const old = arms[idx];
    arms[idx] = partId;
    const r = cleanup({ ...p, arms });
    return {
      ok: true, preset: r.preset,
      slot: idx === 0 ? 'ARM0' : 'ARM1',
      dropped: [...(old ? [old] : []), ...r.dropped],
    };
  }

  // WEAPON — 비어 있는 팔 거치대를 찾는다 (몸통 직결 슬롯은 없다)
  const used = new Set(p.weapons.map((w) => w.mount));
  const order: WeaponMount[] = ['ARM0', 'ARM1'];
  let target: WeaponMount | null = null;
  for (const m of order) {
    if (used.has(m)) continue;
    if (mountAvailable(p, m)) { target = m; break; }
  }
  if (!target) {
    const total = weaponSlotCount(p);
    return {
      ok: false,
      reason: total === 0
        ? '무기는 거치대가 있는 팔(로봇 팔·무장창)에만 달 수 있습니다'
        : `무기 거치대가 부족합니다 (현재 ${total}칸)`,
      slotHint: 'WEAPON',
    };
  }
  return {
    ok: true,
    preset: { ...p, weapons: [...p.weapons, { mount: target, part: partId }] },
    slot: target,
    dropped: [],
  };
}

export function detach(p: Preset, slot: string): Preset {
  if (slot === 'LEG') return { ...p, leg: null };
  if (slot === 'SPECIAL') return { ...p, special: null };
  if (slot === 'ARM0' || slot === 'ARM1') {
    const arms: [string | null, string | null] = [p.arms[0], p.arms[1]];
    arms[slot === 'ARM0' ? 0 : 1] = null;
    return cleanup({ ...p, arms }).preset;
  }
  if (slot.startsWith('W:')) {
    const mount = slot.slice(2) as WeaponMount;
    return { ...p, weapons: p.weapons.filter((w) => w.mount !== mount) };
  }
  return p;
}

/** 파츠를 붙일 수 있는지만 판정 (목록 회색 처리용) */
export function canAttach(p: Preset, partId: string): string | null {
  const r = attach(p, partId);
  return r.ok ? null : r.reason;
}
