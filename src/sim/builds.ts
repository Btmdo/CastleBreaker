import type { Preset, WeaponMount } from './types';

/**
 * 기획서 §8.3 대표 빌드 11종.
 * 신규 플레이어의 기본 제공 설계이자 AI 상대의 덱 재료로 쓴다.
 */
function mk(
  id: string, name: string, body: string,
  arms: (string | null)[], weapons: [WeaponMount, string][],
  leg: string | null, special: string | null,
): Preset {
  return {
    id, name, body,
    arms: [arms[0] ?? null, arms[1] ?? null],
    weapons: weapons.map(([mount, part]) => ({ mount, part })),
    leg, special,
  };
}

export const BUILD = {
  // 가로 몸통 + 활강포 = 전차 실루엣 (팔 마운트가 차체 위에 있다)
  wall: () => mk('b_wall', '방벽', 'B_H', [], [], 'L_TRACK', null),
  tank: () => mk('b_tank', '전차', 'B_H', ['A_CANNON'], [], 'L_TRACK', null),
  aaScreen: () => mk('b_aa', '대공 스크린', 'B_H', ['A_ROBOT'], [['ARM0', 'W_MSL']], 'L_WHEEL', null),
  lightInf: () => mk('b_light', '경보병', 'B_H', ['A_ROBOT'], [['ARM0', 'W_SABER']], 'L_WHEEL', null),
  heavyInf: () => mk('b_heavy', '중장병', 'B_H', ['A_ROBOT'], [['ARM0', 'W_SABER']], 'L_QUAD', null),
  rapid: () => mk('b_rapid', '속사병', 'B_H', ['A_ROBOT'], [['ARM0', 'W_SABER']], 'L_WHEEL', 'S_HMG'),
  rusher: () => mk('b_rush', '러셔', 'B_H', ['A_PYLON'], [['ARM0', 'W_SABER']], 'L_JET', null),
  twinSaber: () => mk('b_twin', '쌍검병', 'B_V', ['A_ROBOT', 'A_ROBOT'],
    [['ARM0', 'W_SABER'], ['ARM1', 'W_SABER']], 'L_WHEEL', null),
  artillery: () => mk('b_arty', '포병', 'B_V', ['A_CANNON', 'A_CANNON'], [], 'L_TRACK', null),
  longArty: () => mk('b_long', '장포대', 'B_V', ['A_CANNON', 'A_CANNON'], [], 'L_BIPED', null),
  turret: () => mk('b_turret', '고정 포탑', 'B_V', ['A_CANNON', 'A_CANNON'], [], null, 'S_HEAD'),
  bomber: () => mk('b_bomb', '폭격기', 'B_H', ['A_PYLON'], [['ARM0', 'W_BOMB']], 'L_JET', 'S_WING'),
  // 자폭 — 겹침이 허용된 전장에서 뭉친 적을 한 번에 쓴다
  charger: () => mk('b_charge', '자폭병', 'B_H', ['A_CHARGE'], [], 'L_WHEEL', null),
  kamikaze: () => mk('b_kami', '가미카제', 'B_H', [], [], 'L_JET', 'S_CHARGE'),
  // 신규 팔 파츠
  autoTank: () => mk('b_auto', '속사전차', 'B_H', ['A_AUTO'], [], 'L_TRACK', null),
  sawman: () => mk('b_saw', '절단기', 'B_H', ['A_BLADE'], [], 'L_WHEEL', null),
  mlrs: () => mk('b_mlrs', '다연장 포대', 'B_H', ['A_MLRS'], [], 'L_TRACK', null),
  railgun: () => mk('b_rail', '레일포', 'B_V', ['A_RAIL'], [], 'L_TRACK', null),
  // 신규 무기 파츠
  rifleman: () => mk('b_rifle', '소총병', 'B_H', ['A_ROBOT'], [['ARM0', 'W_RIFLE20']], 'L_WHEEL', null),
  sniper: () => mk('b_snipe', '저격병', 'B_V', ['A_ROBOT'], [['ARM0', 'W_RIFLE85']], 'L_BIPED', null),
  grenadier: () => mk('b_gren', '척탄병', 'B_H', ['A_PYLON'], [['ARM0', 'W_GRENADE']], 'L_WHEEL', null),
} as const;

export type BuildKey = keyof typeof BUILD;

/** 신규 플레이어에게 제공하는 기본 설계 6종 — 전 메커니즘을 한 번씩 다룬다 */
export const STARTER_KEYS: BuildKey[] = [
  'wall', 'lightInf', 'rapid', 'aaScreen', 'artillery', 'bomber',
];

/** 나머지도 참고용으로 설계 슬롯에 넣어 준다 */
const BONUS_KEYS: BuildKey[] = (Object.keys(BUILD) as BuildKey[])
  .filter((k) => !STARTER_KEYS.includes(k));

/**
 * 기본 제공 설계. 이름은 '프리셋 1', '프리셋 2' … 로 붙는다.
 * (BUILD 의 서술적 이름은 AI 덱과 내부 참조용으로 그대로 남는다)
 */
function numbered(keys: BuildKey[], offset: number, tag: string): Preset[] {
  return keys.map((k, i) => {
    const p = BUILD[k]();
    return { ...p, id: `p_${tag}${i}_${k}`, name: `프리셋 ${offset + i + 1}` };
  });
}

export function starterPresets(): Preset[] {
  return numbered(STARTER_KEYS, 0, '');
}

export function bonusPresets(): Preset[] {
  return numbered(BONUS_KEYS, STARTER_KEYS.length, 'x');
}
