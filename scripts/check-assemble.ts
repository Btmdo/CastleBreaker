/**
 * 기획서 §8.3 대표 빌드 11종의 스텟이 실제 조립 계산과 일치하는지 검증한다.
 * 실행: npm run check
 */
import { assemble, validate } from '../src/sim/assemble';
import type { Preset, WeaponMount } from '../src/sim/types';

let id = 0;
function mk(
  name: string,
  body: string,
  arms: (string | null)[],
  weapons: [WeaponMount, string][],
  leg: string | null,
  special: string | null,
): Preset {
  return {
    id: `t${++id}`,
    name,
    body,
    arms: [arms[0] ?? null, arms[1] ?? null],
    weapons: weapons.map(([mount, part]) => ({ mount, part })),
    leg,
    special,
  };
}

interface Expect {
  hp: number; mob: number; atk: number; rng: number;
  cycle: number; dps: number; evaBp: number; cost: number;
  fly?: boolean; suicide?: boolean;
}

const CASES: { p: Preset; e: Expect }[] = [
  { p: mk('방벽', 'B_H', [], [], 'L_TRACK', null),
    e: { hp: 120, mob: 10, atk: 0, rng: 20, cycle: 2.0, dps: 0, evaBp: 250, cost: 60 } },

  { p: mk('전차', 'B_H', ['A_CANNON'], [], 'L_TRACK', null),
    e: { hp: 120, mob: 10, atk: 20, rng: 50, cycle: 3.0, dps: 6.7, evaBp: 250, cost: 120 } },

  { p: mk('대공 스크린', 'B_H', ['A_ROBOT'], [['ARM0', 'W_MSL']], 'L_WHEEL', null),
    e: { hp: 95, mob: 20, atk: 10, rng: 60, cycle: 1.7, dps: 5.9, evaBp: 500, cost: 130 } },

  { p: mk('경보병', 'B_H', ['A_ROBOT'], [['ARM0', 'W_SABER']], 'L_WHEEL', null),
    e: { hp: 95, mob: 20, atk: 30, rng: 10, cycle: 1.7, dps: 17.6, evaBp: 500, cost: 135 } },

  { p: mk('중장병', 'B_H', ['A_ROBOT'], [['ARM0', 'W_SABER']], 'L_QUAD', null),
    e: { hp: 110, mob: 15, atk: 30, rng: 10, cycle: 1.7, dps: 17.6, evaBp: 375, cost: 160 } },

  { p: mk('속사병', 'B_H', ['A_ROBOT'], [['ARM0', 'W_SABER']], 'L_WHEEL', 'S_HMG'),
    e: { hp: 95, mob: 20, atk: 40, rng: 10, cycle: 1.3, dps: 30.8, evaBp: 500, cost: 165 } },

  { p: mk('러셔', 'B_H', ['A_PYLON'], [['ARM0', 'W_SABER']], 'L_JET', null),
    e: { hp: 90, mob: 80, atk: 30, rng: 0, cycle: 2.3, dps: 13.0, evaBp: 2000, cost: 185 } },

  { p: mk('쌍검병', 'B_V', ['A_ROBOT', 'A_ROBOT'],
      [['ARM0', 'W_SABER'], ['ARM1', 'W_SABER']], 'L_WHEEL', null),
    e: { hp: 60, mob: 20, atk: 60, rng: 20, cycle: 1.4, dps: 42.9, evaBp: 500, cost: 230 } },

  { p: mk('포병', 'B_V', ['A_CANNON', 'A_CANNON'], [], 'L_TRACK', null),
    e: { hp: 100, mob: 10, atk: 40, rng: 100, cycle: 4.0, dps: 10.0, evaBp: 250, cost: 190 } },

  { p: mk('장포대', 'B_V', ['A_CANNON', 'A_CANNON'], [], 'L_BIPED', null),
    e: { hp: 70, mob: 10, atk: 40, rng: 120, cycle: 4.0, dps: 10.0, evaBp: 250, cost: 215 } },

  { p: mk('고정 포탑', 'B_V', ['A_CANNON', 'A_CANNON'], [], null, 'S_HEAD'),
    e: { hp: 80, mob: 0, atk: 40, rng: 110, cycle: 4.0, dps: 10.0, evaBp: 0, cost: 185 } },

  { p: mk('폭격기', 'B_H', ['A_PYLON'], [['ARM0', 'W_BOMB']], 'L_JET', 'S_WING'),
    e: { hp: 70, mob: 80, atk: 20, rng: 10, cycle: 2.3, dps: 8.7, evaBp: 2000, cost: 225, fly: true } },

  { p: mk('자폭병', 'B_H', ['A_CHARGE'], [], 'L_WHEEL', null),
    e: { hp: 110, mob: 20, atk: 90, rng: 0, cycle: 2.0, dps: 45.0, evaBp: 500, cost: 105, suicide: true } },

  { p: mk('가미카제', 'B_H', [], [], 'L_JET', 'S_CHARGE'),
    e: { hp: 90, mob: 80, atk: 60, rng: 20, cycle: 2.0, dps: 30.0, evaBp: 2000, cost: 160, suicide: true } },

  // ── 신규 팔 파츠 ──
  { p: mk('속사전차', 'B_H', ['A_AUTO'], [], 'L_TRACK', null),
    e: { hp: 120, mob: 10, atk: 15, rng: 35, cycle: 1.5, dps: 10.0, evaBp: 250, cost: 105 } },

  { p: mk('절단기', 'B_H', ['A_BLADE'], [], 'L_WHEEL', null),
    e: { hp: 115, mob: 20, atk: 35, rng: 5, cycle: 1.4, dps: 25.0, evaBp: 500, cost: 105 } },

  { p: mk('다연장 포대', 'B_H', ['A_MLRS'], [], 'L_TRACK', null),
    e: { hp: 110, mob: 10, atk: 25, rng: 65, cycle: 3.2, dps: 7.8, evaBp: 250, cost: 150 } },

  { p: mk('레일포', 'B_V', ['A_RAIL'], [], 'L_TRACK', null),
    e: { hp: 90, mob: 10, atk: 45, rng: 110, cycle: 3.6, dps: 12.5, evaBp: 250, cost: 180 } },

  // ── 신규 무기 파츠 ──
  { p: mk('소총병', 'B_H', ['A_ROBOT'], [['ARM0', 'W_RIFLE20']], 'L_WHEEL', null),
    e: { hp: 95, mob: 20, atk: 15, rng: 40, cycle: 1.5, dps: 10.0, evaBp: 500, cost: 115 } },

  { p: mk('저격병', 'B_V', ['A_ROBOT'], [['ARM0', 'W_RIFLE85']], 'L_BIPED', null),
    e: { hp: 55, mob: 10, atk: 25, rng: 110, cycle: 2.2, dps: 11.4, evaBp: 250, cost: 195 } },

  { p: mk('척탄병', 'B_H', ['A_PYLON'], [['ARM0', 'W_GRENADE']], 'L_WHEEL', null),
    e: { hp: 110, mob: 20, atk: 12, rng: 20, cycle: 2.5, dps: 4.8, evaBp: 500, cost: 100 } },
];

let fail = 0;
const pad = (s: string | number, n: number) => String(s).padEnd(n);

console.log(pad('빌드', 14) + pad('HP', 10) + pad('기동', 10) + pad('공격', 10) +
            pad('사거리', 10) + pad('주기', 10) + pad('DPS', 10) + pad('회피bp', 10) + '가격');
console.log('-'.repeat(94));

for (const { p, e } of CASES) {
  const errs = validate(p);
  if (errs.length) {
    console.log(`✗ ${p.name}: 조립 검증 실패 — ${errs.map((x) => `${x.code} ${x.message}`).join(', ')}`);
    fail++;
    continue;
  }
  const r = assemble(p);
  const checks: [string, number | boolean, number | boolean][] = [
    ['HP', r.stability, e.hp],
    ['기동', r.mobility, e.mob],
    ['공격', r.attack, e.atk],
    ['사거리', r.range, e.rng],
    ['주기', r.cycleSec, e.cycle],
    ['DPS', r.dps, e.dps],
    ['회피bp', r.evasionBp, e.evaBp],
    ['가격', r.cost, e.cost],
    ['비행', r.canFly, e.fly ?? false],
    ['자폭', r.suicide, e.suicide ?? false],
  ];
  const bad = checks.filter(([, got, want]) => got !== want);
  const mark = bad.length ? '✗' : '✓';
  if (bad.length) fail++;
  console.log(
    `${mark} ` + pad(p.name, 12) + pad(r.stability, 10) + pad(r.mobility, 10) + pad(r.attack, 10) +
    pad(r.range, 10) + pad(r.cycleSec.toFixed(1), 10) + pad(r.dps.toFixed(1), 10) +
    pad(r.evasionBp, 10) + r.cost,
  );
  for (const [label, got, want] of bad) {
    console.log(`    └ ${label}: 실제 ${got} ≠ 기대 ${want}`);
  }
}

// ── 교차 레인 문턱값 검증 (§9.4) ──
console.log('\n[교차 레인 문턱값]');
const t: { p: Preset; rng: number; air: boolean }[] = [
  // 경계 바로 아래: 가로 + 무장창 + 미사일 = 20 − 10 + 30 = 40 → 대공 불가
  { p: mk('r40', 'B_H', ['A_PYLON'], [['ARM0', 'W_MSL']], null, null), rng: 40, air: false },
  // 경계 정확히: 가로 + 120mm = 20 + 30 = 50 → 대공 가능
  { p: mk('r50', 'B_H', ['A_CANNON'], [], null, null), rng: 50, air: true },
  // 가로 + 중기관총 = 사거리 20 → 대공 불가
  { p: mk('r20', 'B_H', [], [], null, 'S_HMG'), rng: 20, air: false },
  // 가로 + 무장창 + 광선검 + 날개 = 20 − 10 − 20 → 0 → 공대지 불가
  { p: mk('air0', 'B_H', ['A_PYLON'], [['ARM0', 'W_SABER']], null, 'S_WING'), rng: 0, air: false },
];
for (const c of t) {
  const r = assemble(c.p);
  const okRange = r.range === c.rng;
  const okAir = r.canHitAir === c.air;
  if (!okRange || !okAir) fail++;
  console.log(
    `${okRange && okAir ? '✓' : '✗'} ${pad(c.p.name, 8)} 사거리=${pad(r.range, 5)} ` +
    `대공=${pad(String(r.canHitAir), 6)} 공대지=${r.canHitGround}` +
    (okRange && okAir ? '' : `  ← 기대 사거리=${c.rng} 대공=${c.air}`),
  );
}
// 사거리 0 항공기는 지상을 못 때린다
const air0 = assemble(t[3].p);
if (air0.canHitGround !== false) {
  console.log('✗ 사거리 0 항공기가 공대지 가능으로 나옴');
  fail++;
} else {
  console.log('✓ 사거리 0 항공기는 지상을 때릴 수 없다 (광선검 항공기 봉쇄 성립)');
}

console.log('');
if (fail) {
  console.log(`❌ ${fail}건 불일치`);
  process.exit(1);
}
console.log('✅ 전부 일치');
