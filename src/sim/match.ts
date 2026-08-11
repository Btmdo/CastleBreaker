import * as C from './constants';
import { rngNext, roundSeed } from './rng';
import type { Decks, MatchState, PerkId, PresetResolved, Side, SpawnOrder, Unit } from './types';
import { fxWeapon } from './assemble';
import { effectivePerk, perkCastleHpBonus, perkIncomeBonus, perkStartFundsBonus } from './perks';

const AIRSTRIKE_INTERVAL_TICKS = C.PERK_AIRSTRIKE_INTERVAL_SEC * C.TICKS_PER_SEC;

const REVEAL_TICKS = C.REVEAL_SEC * C.TICKS_PER_SEC;
/** 유닛이 더 이상 전진할 수 없는 지점 — 적 성 표면에 접촉한 상태 */
const MOVE_LIMIT = C.FIELD_WIDTH_MILLI - C.UNIT_GAP_MILLI;

const OTHER: Record<Side, Side> = { P1: 'P2', P2: 'P1' };

// ─────────────────────────────────────────────────────────────
// 생성
// ─────────────────────────────────────────────────────────────

const NO_PERKS: Record<Side, PerkId | null> = { P1: null, P2: null };

export function createMatch(
  matchSeed: number,
  perks: Record<Side, PerkId | null> = NO_PERKS,
): MatchState {
  const castleMaxHp: Record<Side, number> = {
    P1: C.CASTLE_HP + perkCastleHpBonus(effectivePerk(perks, 'P1')),
    P2: C.CASTLE_HP + perkCastleHpBonus(effectivePerk(perks, 'P2')),
  };
  return {
    round: 1,
    phase: 'SELECTION',
    tick: 0,
    phaseTick: 0,
    termTicks: 0,
    castleHp: { ...castleMaxHp },
    funds: {
      P1: C.START_FUNDS + perkStartFundsBonus(effectivePerk(perks, 'P1')),
      P2: C.START_FUNDS + perkStartFundsBonus(effectivePerk(perks, 'P2')),
    },
    units: [],
    spawnQueue: { P1: [], P2: [] },
    spawnCooldown: { P1: 0, P2: 0 },
    nextUnitId: 1,
    rngState: roundSeed(matchSeed, 1),
    winner: null,
    endReason: null,
    events: [],
    stats: {
      spentByRound: { P1: [], P2: [] },
      perPreset: {
        P1: Array.from({ length: C.DECK_SIZE }, (_, i) => blankStat(i)),
        P2: Array.from({ length: C.DECK_SIZE }, (_, i) => blankStat(i)),
      },
    },
    perks: { ...perks },
    castleMaxHp,
    airstrikeCooldown: { P1: AIRSTRIKE_INTERVAL_TICKS, P2: AIRSTRIKE_INTERVAL_TICKS },
  };
}

function blankStat(slot: number) {
  return { slot, spawned: 0, kills: 0, damageDealt: 0, damageTaken: 0 };
}

// ─────────────────────────────────────────────────────────────
// 라운드 전이
// ─────────────────────────────────────────────────────────────

/** 예약 합계가 잔액을 넘지 않도록 잘라낸 유효 주문을 반환 */
export function sanitizeOrders(
  orders: SpawnOrder[],
  deck: PresetResolved[],
  funds: number,
): { orders: SpawnOrder[]; total: number } {
  const out: SpawnOrder[] = [];
  let total = 0;
  for (const o of orders) {
    if (o.slot < 0 || o.slot >= deck.length || o.count <= 0) continue;
    const unit = deck[o.slot].cost;
    let count = o.count;
    while (count > 0 && total + unit * count > funds) count--;
    if (count > 0) {
      out.push({ slot: o.slot, count });
      total += unit * count;
    }
  }
  return { orders: out, total };
}

/**
 * 선택 시간 종료 — 양측 주문을 확정하고 REVEAL 로 넘어간다.
 * 기획서 §5.3: 예약은 이 시점에 일괄 결제된다.
 */
export function submitOrders(
  s: MatchState,
  decks: Decks,
  p1: SpawnOrder[],
  p2: SpawnOrder[],
  matchSeed: number,
): void {
  if (s.phase !== 'SELECTION') return;
  for (const side of ['P1', 'P2'] as const) {
    const raw = side === 'P1' ? p1 : p2;
    const { orders, total } = sanitizeOrders(raw, decks[side], s.funds[side]);
    s.funds[side] -= total;
    s.stats.spentByRound[side][s.round - 1] = total;
    for (const o of orders) {
      for (let i = 0; i < o.count; i++) s.spawnQueue[side].push(o.slot);
    }
  }
  s.phase = 'REVEAL';
  s.phaseTick = 0;
  s.termTicks = C.roundTermSec(s.round) * C.TICKS_PER_SEC;
  s.rngState = roundSeed(matchSeed, s.round);
}

/** 라운드 텀 종료 — 미소환 큐를 전액 환불하고 다음 선택 시간으로 (기획서 §14.3) */
function enterSelection(s: MatchState, decks: Decks): void {
  for (const side of ['P1', 'P2'] as const) {
    for (const slot of s.spawnQueue[side]) s.funds[side] += decks[side][slot].cost;
    s.spawnQueue[side] = [];
    s.spawnCooldown[side] = 0;
  }
  s.round++;
  s.phase = 'SELECTION';
  s.phaseTick = 0;
}

function endMatch(s: MatchState, reason: string): void {
  s.phase = 'RESULT';
  s.endReason = reason;
  if (s.castleHp.P1 <= 0 && s.castleHp.P2 <= 0) s.winner = 'DRAW';
  else if (s.castleHp.P1 <= 0) s.winner = 'P2';
  else if (s.castleHp.P2 <= 0) s.winner = 'P1';
  else if (s.castleHp.P1 > s.castleHp.P2) s.winner = 'P1';
  else if (s.castleHp.P2 > s.castleHp.P1) s.winner = 'P2';
  else s.winner = 'DRAW';
}

// ─────────────────────────────────────────────────────────────
// 소환
// ─────────────────────────────────────────────────────────────

function processSpawnQueue(s: MatchState, side: Side, deck: PresetResolved[]): void {
  if (s.spawnCooldown[side] > 0) { s.spawnCooldown[side]--; return; }
  if (s.spawnQueue[side].length === 0) return;

  let count = 0;
  for (const u of s.units) if (u.side === side) count++;
  if (count >= C.MAX_UNITS_PER_SIDE) return;

  const slot = s.spawnQueue[side][0];
  const def = deck[slot];
  const lane = def.canFly ? 'AIR' : 'GROUND';

  // 유닛이 서로 겹칠 수 있으므로 소환 지점은 항상 고정이다.
  // (겹침 허용 이전에는 자리를 찾아 성 쪽으로 밀착 정렬해야 했다)
  const d = C.SPAWN_POS_MILLI;

  s.spawnQueue[side].shift();
  const id = s.nextUnitId++;
  s.units.push({
    id, side, presetSlot: slot, lane, d,
    hp: def.stability, maxHp: def.stability, cooldown: 0,
  });
  s.stats.perPreset[side][slot].spawned++;
  s.spawnCooldown[side] = C.SPAWN_INTERVAL_TICKS;
  s.events.push({ k: 'spawn', unitId: id });
}

// ─────────────────────────────────────────────────────────────
// 타겟 / 전투
// ─────────────────────────────────────────────────────────────

/** 서로 마주보는 두 유닛의 중심 간 거리 (밀리유닛) */
function centerDist(a: Unit, b: Unit): number {
  return C.FIELD_WIDTH_MILLI - a.d - b.d;
}

/**
 * 유닛의 유효 사거리 (중심 간 거리 기준).
 * 사거리 0 = 접촉 근접이므로 유닛 지름(12u)만큼을 더한다 (기획서 §9.2).
 */
function reachMilli(def: PresetResolved): number {
  return def.range * 1000 + C.UNIT_GAP_MILLI;
}

type Target = Unit | 'CASTLE' | null;

export function findTarget(s: MatchState, u: Unit, def: PresetResolved): Target {
  if (def.attack <= 0) return null; // 무장 없는 유닛은 공격하지 않는다
  const reach = reachMilli(def);
  const foe = OTHER[u.side];

  let best: Unit | null = null;
  let bestD = Infinity;

  // 1) 같은 레인
  for (const e of s.units) {
    if (e.side !== foe || e.hp <= 0 || e.lane !== u.lane) continue;
    const dist = centerDist(u, e);
    if (dist <= reach && dist < bestD) { best = e; bestD = dist; }
  }
  if (best) return best;

  // 2) 교차 레인 — §9.4 문턱값
  const canCross = u.lane === 'GROUND' ? def.canHitAir : def.canHitGround;
  if (canCross) {
    for (const e of s.units) {
      if (e.side !== foe || e.hp <= 0 || e.lane === u.lane) continue;
      const dist = centerDist(u, e);
      if (dist <= reach && dist < bestD) { best = e; bestD = dist; }
    }
    if (best) return best;
  }

  // 3) 적 성 — 성은 지상 구조물이므로 공중 유닛은 공대지 조건을 만족해야 한다
  const castleReachable = u.lane === 'GROUND' || def.canHitGround;
  if (castleReachable && u.d + reach >= C.FIELD_WIDTH_MILLI) return 'CASTLE';

  return null;
}

function applyDamage(
  s: MatchState, u: Unit, def: PresetResolved, target: Unit | 'CASTLE', decks: Decks,
): void {
  s.events.push({
    k: 'fire', unitId: u.id, side: u.side, lane: u.lane, d: u.d,
    range: def.range, weapon: fxWeapon(def),
  });

  if (target === 'CASTLE') {
    const foe = OTHER[u.side];
    s.castleHp[foe] -= def.attack; // 성은 회피하지 않는다
    s.stats.perPreset[u.side][u.presetSlot].damageDealt += def.attack;
    s.events.push({ k: 'castleHit', side: foe, dmg: def.attack });

    // 철벽 성채 — 성을 때린 유닛에게 반사 데미지 (회피 판정 없음, 자동 반격)
    // 자폭 유닛은 어차피 이번 공격으로 소멸하므로 반사를 따로 적용하지 않는다.
    if (!def.suicide && effectivePerk(s.perks, foe) === 'FORTRESS') {
      const reflect = Math.round(def.attack * C.PERK_FORTRESS_REFLECT_PCT);
      u.hp -= reflect;
      s.events.push({ k: 'hit', unitId: u.id, dmg: reflect });
      if (u.hp <= 0) s.events.push({ k: 'death', unitId: u.id, side: u.side, lane: u.lane, d: u.d });
    }

    if (def.suicide) detonate(s, u);
    return;
  }

  hitOne(s, u, def, target, decks);

  if (def.splashRadius > 0) {
    const r = def.splashRadius * 1000;
    s.events.push({ k: 'splash', side: target.side, lane: target.lane, d: target.d, radius: def.splashRadius });
    for (const e of s.units) {
      if (e === target || e.side !== target.side || e.hp <= 0) continue;
      if (e.lane !== target.lane) continue; // 같은 레인만
      if (Math.abs(e.d - target.d) <= r) hitOne(s, u, def, e, decks);
    }
  }

  if (def.suicide) detonate(s, u);
}

/** 자폭 — 공격한 그 틱에 스스로 소멸한다. 적의 처치 수로 잡히지 않는다. */
function detonate(s: MatchState, u: Unit): void {
  u.hp = 0;
  s.events.push({ k: 'death', unitId: u.id, side: u.side, lane: u.lane, d: u.d });
}

/**
 * 공습 지원 (AIRSTRIKE 퍽) — 적 지상군이 가장 밀집한 지점에 즉시 폭격한다.
 * 유닛이 아니라 지원 화력이므로 회피 판정 없이 항상 명중한다.
 */
function performAirstrike(s: MatchState, side: Side): void {
  const foe = OTHER[side];
  const targets = s.units.filter((u) => u.side === foe && u.lane === 'GROUND' && u.hp > 0);
  if (targets.length === 0) return;

  const radius = C.PERK_AIRSTRIKE_RADIUS * 1000;
  let best = targets[0];
  let bestCount = -1;
  for (const t of targets) {
    let count = 0;
    for (const o of targets) if (Math.abs(o.d - t.d) <= radius) count++;
    if (count > bestCount || (count === bestCount && t.id < best.id)) { best = t; bestCount = count; }
  }

  s.events.push({ k: 'airstrike', side: foe, lane: 'GROUND', d: best.d, radius: C.PERK_AIRSTRIKE_RADIUS });
  for (const t of targets) {
    if (Math.abs(t.d - best.d) > radius) continue;
    t.hp -= C.PERK_AIRSTRIKE_DAMAGE;
    s.events.push({ k: 'hit', unitId: t.id, dmg: C.PERK_AIRSTRIKE_DAMAGE });
    if (t.hp <= 0) s.events.push({ k: 'death', unitId: t.id, side: t.side, lane: t.lane, d: t.d });
  }
}

function hitOne(s: MatchState, u: Unit, def: PresetResolved, e: Unit, decks: Decks): void {
  const eDef = decks[e.side][e.presetSlot];
  s.rngState = rngNext(s.rngState);
  if (s.rngState % C.BP_DENOM < eDef.evasionBp) {
    s.events.push({ k: 'evade', unitId: e.id });
    return;
  }
  const before = e.hp;
  e.hp -= def.attack;
  const dealt = Math.min(before, def.attack);
  s.stats.perPreset[u.side][u.presetSlot].damageDealt += dealt;
  s.stats.perPreset[e.side][e.presetSlot].damageTaken += dealt;
  s.events.push({ k: 'hit', unitId: e.id, dmg: def.attack });
  if (e.hp <= 0) {
    s.stats.perPreset[u.side][u.presetSlot].kills++;
    s.events.push({ k: 'death', unitId: e.id, side: e.side, lane: e.lane, d: e.d });
  }
}

// ─────────────────────────────────────────────────────────────
// 틱
// ─────────────────────────────────────────────────────────────

/** 1틱 진행. 기획서 §14.1 */
export function tick(s: MatchState, decks: Decks): void {
  s.events.length = 0;

  if (s.phase === 'REVEAL') {
    s.phaseTick++;
    if (s.phaseTick >= REVEAL_TICKS) { s.phase = 'REALTIME'; s.phaseTick = 0; }
    return;
  }
  if (s.phase !== 'REALTIME') return;

  s.tick++;
  s.phaseTick++;

  // 1) 자금 축적 — 30틱마다 +7 (경제 강화 퍽 보유 시 추가)
  if (s.tick % C.TICKS_PER_SEC === 0) {
    s.funds.P1 += C.INCOME_PER_SEC + perkIncomeBonus(effectivePerk(s.perks, 'P1'));
    s.funds.P2 += C.INCOME_PER_SEC + perkIncomeBonus(effectivePerk(s.perks, 'P2'));
  }

  // 1.5) 공습 지원 — 퍽 보유 측만 주기적으로 발동
  for (const side of ['P1', 'P2'] as const) {
    if (effectivePerk(s.perks, side) !== 'AIRSTRIKE') continue;
    if (--s.airstrikeCooldown[side] <= 0) {
      s.airstrikeCooldown[side] = AIRSTRIKE_INTERVAL_TICKS;
      performAirstrike(s, side);
    }
  }

  // 2) 소환 큐 처리
  processSpawnQueue(s, 'P1', decks.P1);
  processSpawnQueue(s, 'P2', decks.P2);

  // ID 오름차순 — RNG 소비 순서를 고정한다
  const alive = s.units.filter((u) => u.hp > 0).sort((a, b) => a.id - b.id);

  // 3) 이동
  for (const u of alive) {
    const def = decks[u.side][u.presetSlot];
    if (findTarget(s, u, def)) continue; // 사거리 내 타겟 → 정지

    // 유닛은 서로 겹칠 수 있다 — 아군도 적군도 통과한다.
    // 덕분에 근접 유닛이 여러 기 있어도 뒷줄이 앞줄에 막히지 않고 전부 교전에
    // 참가한다. (겹침 허용 이전에는 최전방 1기만 때릴 수 있었다)
    let limit = MOVE_LIMIT;

    // 예외: 무장이 없는 유닛(공격력 0)은 사거리 판정에 절대 걸리지 않아
    // 그대로 적진을 관통해 적 성까지 가 버린다. 같은 레인 최전방 적과
    // 접촉 거리에서 멈춰 세워 '앞에 서서 대신 맞는' 방벽 역할을 남긴다.
    if (def.attack <= 0) {
      for (const e of s.units) {
        if (e.side === u.side || e.lane !== u.lane || e.hp <= 0) continue;
        limit = Math.min(limit, C.FIELD_WIDTH_MILLI - e.d - C.UNIT_GAP_MILLI);
      }
    }

    // 방어 결계 — 접근 중인 적 성 100u 이내에서는 이동속도가 줄어든다
    let speed = def.speedMilli;
    const foeCastle = OTHER[u.side];
    if (
      effectivePerk(s.perks, foeCastle) === 'SLOW_FIELD' &&
      C.FIELD_WIDTH_MILLI - u.d <= C.PERK_SLOWFIELD_RADIUS * 1000
    ) {
      speed = Math.round(speed * C.PERK_SLOWFIELD_FACTOR);
    }

    const next = u.d + speed;
    u.d = next < limit ? next : limit;
    if (u.d < 0) u.d = 0;
  }

  // 4) 공격
  for (const u of alive) {
    if (u.hp <= 0) continue;
    const def = decks[u.side][u.presetSlot];
    if (u.cooldown > 0) { u.cooldown--; continue; }
    const target = findTarget(s, u, def);
    if (!target) continue;
    if (target !== 'CASTLE' && target.hp <= 0) continue;
    applyDamage(s, u, def, target, decks);
    u.cooldown = def.cycleTicks;
  }

  // 5) 사망 처리
  if (s.units.some((u) => u.hp <= 0)) s.units = s.units.filter((u) => u.hp > 0);

  // 6) 종료 판정
  if (s.castleHp.P1 <= 0 || s.castleHp.P2 <= 0) return endMatch(s, 'castle');
  if (s.tick >= C.LIMIT_TICKS) return endMatch(s, 'timeup');

  // 7) 라운드 텀 종료 → 다음 선택 시간
  if (s.phaseTick >= s.termTicks) enterSelection(s, decks);
}

// ─────────────────────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────────────────────

/** 결정론 검증용 상태 해시 (FNV-1a) */
export function stateHash(s: MatchState): number {
  let h = 0x811c9dc5;
  const mix = (v: number) => { h ^= v | 0; h = Math.imul(h, 0x01000193) >>> 0; };
  mix(s.tick); mix(s.round); mix(s.castleHp.P1); mix(s.castleHp.P2);
  mix(s.funds.P1); mix(s.funds.P2); mix(s.rngState);
  for (const u of [...s.units].sort((a, b) => a.id - b.id)) {
    mix(u.id); mix(u.d); mix(u.hp); mix(u.cooldown);
    mix(u.side === 'P1' ? 1 : 2); mix(u.lane === 'AIR' ? 1 : 0);
  }
  return h >>> 0;
}

export function unitCount(s: MatchState, side: Side): number {
  let n = 0;
  for (const u of s.units) if (u.side === side) n++;
  return n;
}

export function remainingSelectionSlots(s: MatchState, side: Side): number {
  return C.MAX_UNITS_PER_SIDE - unitCount(s, side) - s.spawnQueue[side].length;
}
