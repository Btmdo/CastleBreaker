import * as C from '../sim/constants';
import type { BuildKey } from '../sim/builds';
import type { Decks, MatchState, PresetResolved, Side, SpawnOrder } from '../sim/types';
import type { AiOpponent, AiPattern } from './opponents';

/**
 * AI 상대의 라운드별 소환 결정.
 *
 * ★ 공정성 제약 (기획서 §11.4 블라인드 규칙을 AI에게도 동일 적용)
 *   이 함수는 `s.units` — 이미 전장에 나와 있는 유닛 — 만 읽는다.
 *   플레이어가 이번 라운드에 예약 중인 내용은 어떤 경로로도 참조하지 않는다.
 */

export interface FieldView {
  myGround: number;
  myAir: number;
  myAaCapable: number;
  foeGround: number;
  foeAir: number;
}

export function fieldView(s: MatchState, side: Side, decks: Decks): FieldView {
  const v: FieldView = { myGround: 0, myAir: 0, myAaCapable: 0, foeGround: 0, foeAir: 0 };
  for (const u of s.units) {
    const def = decks[u.side][u.presetSlot];
    if (u.side === side) {
      if (u.lane === 'AIR') v.myAir++; else v.myGround++;
      if (def.canHitAir) v.myAaCapable++;
    } else {
      if (u.lane === 'AIR') v.foeAir++; else v.foeGround++;
    }
  }
  return v;
}

/**
 * 예산 사용 비율. 아껴서 비싼 유닛을 사는 전략은 유효하지만, 유휴 자금은
 * 전장에서 아무 일도 하지 않으므로 과도한 저축은 그 자체로 패배 요인이다.
 * 저축은 '이번 라운드에 살 게 마땅치 않을 때'만 의미가 있다.
 */
function spendRatio(pattern: AiPattern, round: number): number {
  switch (pattern) {
    case 'RUSH': return 1.0;
    case 'TURTLE': return 0.95;
    case 'ARTILLERY': return round === 1 ? 0.98 : 0.95;
    // 폭격기(225)를 R2에 확보하기 위해 R1만 절약한다
    case 'AIR': return round === 1 ? 0.7 : 0.95;
    case 'ADAPTIVE': return 0.95;
  }
}

/**
 * 사이클은 방벽과 화력을 '교차' 배치한다.
 * 방벽을 연속으로 두면 초반 예산이 전부 공격력 0 유닛으로 나가 상대를
 * 전혀 깎지 못하는 함정 편성이 된다 (헤드리스 검증에서 확인).
 */
const STATIC_CYCLES: Record<Exclude<AiPattern, 'ADAPTIVE'>, BuildKey[]> = {
  TURTLE: ['wall', 'lightInf', 'wall', 'heavyInf', 'aaScreen', 'turret'],
  RUSH: ['rusher', 'lightInf', 'lightInf', 'rapid', 'charger', 'wall'],
  ARTILLERY: ['wall', 'artillery', 'lightInf', 'wall', 'longArty', 'aaScreen'],
  AIR: ['bomber', 'aaScreen', 'wall', 'lightInf', 'bomber', 'artillery'],
};

function adaptiveCycle(v: FieldView, round: number): BuildKey[] {
  const c: BuildKey[] = [];
  // 상대 공중이 내 대공보다 많으면 대공 최우선
  if (v.foeAir > v.myAaCapable) c.push('aaScreen', 'aaScreen');
  // 전선이 얇으면 벽을 하나 세우되, 곧바로 화력을 붙인다
  if (v.myGround < 3) c.push('wall');
  c.push('rapid', 'lightInf');
  // 상대가 뭉쳐 있으면 자폭으로 한 번에 쓸어낸다 (겹침 허용의 카운터)
  if (v.foeGround >= 4) c.push('charger');
  // 상대 물량이 두터우면 포병으로 긁는다
  if (v.foeGround >= 5) c.push('artillery');
  // 상대가 대공을 안 들고 왔으면 하늘로 우회
  if (v.foeAir === 0 && round >= 3) c.push('bomber');
  c.push('wall', 'lightInf');
  return c;
}

export function aiDecide(
  o: AiOpponent,
  deck: PresetResolved[],
  s: MatchState,
  side: Side,
  decks: Decks,
  rand: () => number,
): SpawnOrder[] {
  const view = fieldView(s, side, decks);
  const cycle =
    o.pattern === 'ADAPTIVE' ? adaptiveCycle(view, s.round) : STATIC_CYCLES[o.pattern];

  // 덱에 실제로 들어있는 항목만 슬롯 인덱스로 변환
  const slots: number[] = [];
  for (const key of cycle) {
    const idx = o.deck.indexOf(key);
    if (idx >= 0) slots.push(idx);
  }
  if (slots.length === 0) return [];

  const budget = Math.floor(s.funds[side] * spendRatio(o.pattern, s.round));
  let spent = 0;
  let room = C.MAX_UNITS_PER_SIDE;
  for (const u of s.units) if (u.side === side) room--;
  if (room <= 0) return [];

  const counts = new Map<number, number>();
  // 매치마다 조금씩 다르게 보이도록 시작 지점만 회전시킨다
  let cursor = Math.floor(rand() * slots.length) % slots.length;
  let idleLaps = 0;

  while (room > 0 && idleLaps < slots.length) {
    const slot = slots[cursor];
    cursor = (cursor + 1) % slots.length;
    const cost = deck[slot].cost;
    if (spent + cost <= budget) {
      counts.set(slot, (counts.get(slot) ?? 0) + 1);
      spent += cost;
      room--;
      idleLaps = 0;
    } else {
      idleLaps++;
    }
  }

  // ── 최소 화력 보장 ──
  // 공격력 0인 방벽만 사면 상대를 전혀 깎지 못해 예산을 그냥 버리는 셈이 된다.
  // 화력 유닛이 하나도 없으면 가장 싼 공격 유닛으로 한 기를 확보한다.
  const boughtAttack = [...counts.keys()].reduce((sum, s2) => sum + deck[s2].attack, 0);
  if (boughtAttack === 0) {
    let cheapest = -1;
    for (let i = 0; i < deck.length; i++) {
      if (deck[i].attack <= 0) continue;
      if (cheapest < 0 || deck[i].cost < deck[cheapest].cost) cheapest = i;
    }
    if (cheapest >= 0 && deck[cheapest].cost <= s.funds[side]) {
      // 예산이 빌 때까지 방벽을 한 기씩 덜어낸다
      while (spent + deck[cheapest].cost > s.funds[side]) {
        const wall = [...counts.keys()].find((s2) => deck[s2].attack === 0);
        if (wall === undefined) break;
        const n = counts.get(wall)!;
        if (n <= 1) counts.delete(wall); else counts.set(wall, n - 1);
        spent -= deck[wall].cost;
        room++;
      }
      if (spent + deck[cheapest].cost <= s.funds[side] && room > 0) {
        counts.set(cheapest, (counts.get(cheapest) ?? 0) + 1);
      }
    }
  }

  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([slot, count]) => ({ slot, count }));
}
