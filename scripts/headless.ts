/**
 * 헤드리스 대전 시뮬레이터.
 *   npm run sim                       기본: 결정론 검증 + AI 5인 라운드로빈
 *   npm run sim -- bal                기획서 §16.2 BAL-1~3 밸런스 구도
 */
import { assemble } from '../src/sim/assemble';
import { BUILD, type BuildKey } from '../src/sim/builds';
import { createMatch, stateHash, submitOrders, tick } from '../src/sim/match';
import { rngNext } from '../src/sim/rng';
import type { Decks, MatchState, PresetResolved, Side, SpawnOrder } from '../src/sim/types';
import { OPPONENTS, resolveAiDeck, type AiOpponent } from '../src/ai/opponents';
import { aiDecide } from '../src/ai/brain';
import { PERKS, applyPerkToDeck, effectivePerk } from '../src/sim/perks';
import type { PerkId } from '../src/sim/types';

function makeRand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s = rngNext(s); return s / 0x100000000; };
}

function deckOf(keys: BuildKey[]): PresetResolved[] {
  return keys.map((k, i) => assemble({ ...BUILD[k](), id: `d${i}` }));
}

interface Player {
  name: string;
  decide: (s: MatchState, side: Side, decks: Decks, rand: () => number) => SpawnOrder[];
  deck: PresetResolved[];
}

function aiPlayer(o: AiOpponent): Player {
  const deck = resolveAiDeck(o);
  return {
    name: o.name,
    deck,
    decide: (s, side, decks, rand) => aiDecide(o, deck, s, side, decks, rand),
  };
}

/**
 * 고정 덱을 정해진 사이클로 계속 뽑는 단순 봇 (밸런스 구도용).
 * ratio < 1 이면 그만큼 저축한다 — 비싼 유닛을 모으는 전략 재현용.
 */
function fixedPlayer(
  name: string, keys: BuildKey[], cycle: number[], ratio = 1,
): Player {
  const deck = deckOf(keys);
  return {
    name,
    deck,
    decide: (s, side) => {
      let room = 30;
      for (const u of s.units) if (u.side === side) room--;
      let budget = Math.floor(s.funds[side] * (s.round === 1 ? Math.max(ratio, 0.95) : ratio));
      const counts = new Map<number, number>();
      const buy = (slot: number) => {
        const cost = deck[slot].cost;
        if (cost > budget || room <= 0) return false;
        counts.set(slot, (counts.get(slot) ?? 0) + 1);
        budget -= cost; room--;
        return true;
      };
      // 1단계: 값비싼 핵심 유닛부터 확보한다.
      // 값싼 유닛을 먼저 사면 예산이 잠식되어 정작 핵심 유닛을 못 사게 된다.
      for (const slot of [...new Set(cycle)].sort((x, y) => deck[y].cost - deck[x].cost)) {
        buy(slot);
      }
      // 2단계: 남은 예산을 사이클 순서대로 채운다
      let cursor = 0, idle = 0;
      while (room > 0 && idle < cycle.length) {
        if (buy(cycle[cursor])) idle = 0; else idle++;
        cursor = (cursor + 1) % cycle.length;
      }
      return [...counts.entries()].map(([slot, count]) => ({ slot, count }));
    },
  };
}

interface Outcome {
  winner: Side | 'DRAW';
  reason: string;
  ticks: number;
  rounds: number;
  hpP1: number;
  hpP2: number;
  hash: number;
}

function runMatch(
  p1: Player, p2: Player, matchSeed: number,
  perks: Record<Side, PerkId | null> = { P1: null, P2: null },
): Outcome {
  // 정적 스텟 보정은 '실제로 적용되는' 퍽을 써야 한다 — 상대가 NULLIFY 를
  // 들었으면 내 스텟 보정도 사라져야 하므로 원본 perks 를 그대로 넣으면 안 된다.
  const decks: Decks = {
    P1: applyPerkToDeck(p1.deck, effectivePerk(perks, 'P1')),
    P2: applyPerkToDeck(p2.deck, effectivePerk(perks, 'P2')),
  };
  const s = createMatch(matchSeed, perks);
  const r1 = makeRand(matchSeed ^ 0xa1);
  const r2 = makeRand(matchSeed ^ 0xb2);
  let guard = 0;

  while (s.phase !== 'RESULT' && guard++ < 200_000) {
    if (s.phase === 'SELECTION') {
      const o1 = p1.decide(s, 'P1', decks, r1);
      const o2 = p2.decide(s, 'P2', decks, r2);
      submitOrders(s, decks, o1, o2, matchSeed);
      continue;
    }
    tick(s, decks);
  }
  return {
    winner: s.winner ?? 'DRAW', reason: s.endReason ?? '?',
    ticks: s.tick, rounds: s.round,
    hpP1: s.castleHp.P1, hpP2: s.castleHp.P2, hash: stateHash(s),
  };
}

const pad = (v: string | number, n: number) => String(v).padEnd(n);

// ─────────────────────────────────────────────────────────────

function checkDeterminism() {
  console.log('[결정론 검증]');
  const a = aiPlayer(OPPONENTS[1]);
  const b = aiPlayer(OPPONENTS[3]);
  let ok = true;
  for (const seed of [1, 42, 12345, 0xdeadbeef]) {
    const r1 = runMatch(a, b, seed);
    const r2 = runMatch(a, b, seed);
    const same = r1.hash === r2.hash && r1.ticks === r2.ticks && r1.winner === r2.winner;
    if (!same) ok = false;
    console.log(
      `  ${same ? '✓' : '✗'} seed=${pad(seed, 12)} hash=${pad(r1.hash, 12)} ` +
      `승자=${pad(r1.winner, 5)} ${r1.ticks}틱` + (same ? '' : `  ← 2회차 hash=${r2.hash}`),
    );
  }
  return ok;
}

function roundRobin() {
  console.log('\n[AI 라운드로빈 — 각 조합 10판]');
  console.log('  ' + pad('', 12) + OPPONENTS.map((o) => pad(o.name, 10)).join(''));
  const RUNS = 10;
  for (const a of OPPONENTS) {
    let row = '  ' + pad(a.name, 12);
    for (const b of OPPONENTS) {
      if (a === b) { row += pad('—', 10); continue; }
      let w = 0;
      const pa = aiPlayer(a); const pb = aiPlayer(b);
      for (let i = 0; i < RUNS; i++) {
        const r = runMatch(pa, pb, 1000 + i * 7919);
        if (r.winner === 'P1') w++;
      }
      row += pad(`${(w / RUNS * 100).toFixed(0)}%`, 10);
    }
    console.log(row);
  }
  console.log('  (행 = P1 진영으로 싸운 쪽의 승률)');
}

function sampleMatch() {
  console.log('\n[샘플 매치 상세: 질풍 vs 포화]');
  const a = aiPlayer(OPPONENTS[1]);
  const b = aiPlayer(OPPONENTS[2]);
  const decks: Decks = { P1: a.deck, P2: b.deck };
  const s = createMatch(777);
  const r1 = makeRand(0xa1); const r2 = makeRand(0xb2);
  let guard = 0;
  while (s.phase !== 'RESULT' && guard++ < 200_000) {
    if (s.phase === 'SELECTION') {
      const f1 = s.funds.P1, f2 = s.funds.P2;
      const o1 = a.decide(s, 'P1', decks, r1);
      const o2 = b.decide(s, 'P2', decks, r2);
      const d1 = o1.map((o) => `${a.deck[o.slot].name}×${o.count}`).join(' ') || '(없음)';
      const d2 = o2.map((o) => `${b.deck[o.slot].name}×${o.count}`).join(' ') || '(없음)';
      console.log(`  R${s.round} @${(s.tick / 30).toFixed(0)}s  성 ${s.castleHp.P1}/${s.castleHp.P2}`);
      console.log(`    질풍(${f1}원): ${d1}`);
      console.log(`    포화(${f2}원): ${d2}`);
      submitOrders(s, decks, o1, o2, 777);
      continue;
    }
    tick(s, decks);
  }
  console.log(`  → ${s.winner} 승 (${s.endReason}), 성 ${s.castleHp.P1}/${s.castleHp.P2}, ${(s.tick / 30).toFixed(0)}초`);
}

function balance() {
  const RUNS = 100;
  const scenarios: { id: string; goal: string; a: Player; b: Player }[] = [
    {
      id: 'BAL-1 러시 vs 방벽',
      goal: '어느 쪽도 승률 60% 초과 금지',
      // 방벽 측은 벽과 화력을 교차 편성한다 (벽만 세우면 화력이 0이라 아무것도 못 막는다)
      a: fixedPlayer('러시', ['rusher', 'lightInf', 'rapid', 'twinSaber', 'wall', 'aaScreen'], [0, 1, 1, 2]),
      b: fixedPlayer('방벽', ['wall', 'lightInf', 'heavyInf', 'turret', 'aaScreen', 'artillery'], [0, 1, 0, 2]),
    },
    {
      id: 'BAL-2 포병 vs 근접',
      goal: '포병 단독 승률 < 55%',
      // 근접 측에 러셔를 넣는다 — 장거리 포대의 실제 카운터는 느린 근접이 아니라
      // 사거리 밖을 순식간에 지나오는 고기동 유닛이다
      a: fixedPlayer('포병', ['wall', 'artillery', 'longArty', 'turret', 'aaScreen', 'lightInf'], [0, 1, 0, 2]),
      b: fixedPlayer('근접', ['lightInf', 'rusher', 'rapid', 'heavyInf', 'wall', 'aaScreen'], [0, 1, 0, 2]),
    },
    {
      id: 'BAL-3a 항공 vs 대공 0기',
      goal: '항공 승률 > 85%',
      a: fixedPlayer('항공', ['bomber', 'aaScreen', 'wall', 'lightInf', 'rusher', 'artillery'], [0, 3, 0, 2], 0.9),
      b: fixedPlayer('대공무시', ['lightInf', 'rapid', 'twinSaber', 'heavyInf', 'wall', 'turret'], [0, 1, 4]),
    },
    {
      id: 'BAL-3b 항공 vs 대공 편성',
      goal: '항공 승률 < 40%',
      a: fixedPlayer('항공', ['bomber', 'aaScreen', 'wall', 'lightInf', 'rusher', 'artillery'], [0, 3, 0, 2], 0.9),
      b: fixedPlayer('대공편성', ['aaScreen', 'wall', 'artillery', 'lightInf', 'rapid', 'turret'], [0, 1, 0, 2]),
    },
  ];

  console.log('\n[밸런스 구도 — 각 100판, 좌우 미러 포함]');
  for (const sc of scenarios) {
    // 정방향: A=P1 / 미러: A=P2. 대칭 게임이면 두 승률이 비슷해야 한다.
    const run = (mirror: boolean) => {
      let aWin = 0, d = 0, ticks = 0, byCastle = 0;
      for (let i = 0; i < RUNS; i++) {
        const seed = 5000 + i * 104729;
        const r = mirror ? runMatch(sc.b, sc.a, seed) : runMatch(sc.a, sc.b, seed);
        const aSide: Side = mirror ? 'P2' : 'P1';
        if (r.winner === aSide) aWin++; else if (r.winner === 'DRAW') d++;
        ticks += r.ticks;
        if (r.reason === 'castle') byCastle++;
      }
      return { rate: (aWin / RUNS) * 100, d, secs: ticks / RUNS / 30, castle: byCastle };
    };
    const fwd = run(false);
    const mir = run(true);
    const avg = (fwd.rate + mir.rate) / 2;
    const skew = Math.abs(fwd.rate - mir.rate);
    console.log(
      `  ${pad(sc.id, 26)} ${sc.a.name} 승률 ${avg.toFixed(0)}%  ` +
      `(정방향 ${fwd.rate.toFixed(0)}% / 미러 ${mir.rate.toFixed(0)}%)  ` +
      `평균 ${fwd.secs.toFixed(0)}초, 성파괴 ${fwd.castle}%`,
    );
    console.log(
      `  ${' '.repeat(26)} 목표: ${sc.goal}` +
      (skew > 20 ? `   ⚠ 진영 편향 ${skew.toFixed(0)}%p` : ''),
    );
  }
}

/**
 * 동일 예산 교환비 측정.
 * 봇 AI를 완전히 배제하고, 같은 금액으로 산 A 무리와 B 무리를 한 번에 붙인다.
 * 유닛 자체의 밸런스를 재는 순수 계측기.
 */
function duel(aKey: BuildKey, bKey: BuildKey, budget: number, seed: number) {
  const da = deckOf([aKey]);
  const db = deckOf([bKey]);
  const nA = Math.floor(budget / da[0].cost);
  const nB = Math.floor(budget / db[0].cost);
  if (nA === 0 || nB === 0) return null;

  const decks: Decks = { P1: da, P2: db };
  const s = createMatch(seed);
  s.funds.P1 = 99999; s.funds.P2 = 99999;
  submitOrders(s, decks, [{ slot: 0, count: nA }], [{ slot: 0, count: nB }], seed);
  // 라운드 텀에 끊기지 않고 교전이 끝까지 가도록 텀을 늘린다 (추가 주문은 넣지 않는다)
  s.termTicks = 60_000;

  let guard = 0;
  let spawnedAll = false;
  while (guard++ < 60_000) {
    tick(s, decks);
    if (s.phase === 'RESULT' || s.phase === 'SELECTION') break;
    // 소환이 전부 끝난 뒤부터 전멸 판정을 시작한다
    if (!spawnedAll) {
      spawnedAll = s.phase === 'REALTIME' &&
        s.spawnQueue.P1.length === 0 && s.spawnQueue.P2.length === 0;
      continue;
    }
    const aAlive = s.units.some((u) => u.side === 'P1');
    const bAlive = s.units.some((u) => u.side === 'P2');
    if (!aAlive || !bAlive) break;
  }
  const aLeft = s.units.filter((u) => u.side === 'P1');
  const bLeft = s.units.filter((u) => u.side === 'P2');
  const hpFrac = (us: typeof aLeft, n: number, max: number) =>
    us.reduce((t, u) => t + u.hp, 0) / (n * max);
  return {
    nA, nB,
    aLeft: aLeft.length, bLeft: bLeft.length,
    aHp: hpFrac(aLeft, nA, da[0].stability),
    bHp: hpFrac(bLeft, nB, db[0].stability),
    secs: s.tick / 30,
    castleA: s.castleHp.P2, castleB: s.castleHp.P1,
  };
}

function duels() {
  const BUDGET = 560; // 중반 라운드 한 번 분량
  const pairs: [BuildKey, BuildKey][] = [
    ['artillery', 'lightInf'],
    ['artillery', 'rusher'],
    ['turret', 'lightInf'],
    ['turret', 'rusher'],
    ['longArty', 'rapid'],
    ['longArty', 'rusher'],
    ['longArty', 'bomber'],
    ['wall', 'lightInf'],
    ['heavyInf', 'lightInf'],
    ['rapid', 'lightInf'],
    ['twinSaber', 'rapid'],
    ['rusher', 'lightInf'],
    ['aaScreen', 'bomber'],
    ['tank', 'bomber'],
    ['bomber', 'lightInf'],
    ['charger', 'lightInf'],
    ['charger', 'twinSaber'],
    ['kamikaze', 'lightInf'],
    ['charger', 'artillery'],
  ];
  console.log(`\n[동일 예산 교환비 — 각 ${BUDGET}원, 1회 교전]`);
  console.log('  ' + pad('A', 12) + pad('vs B', 12) + pad('수량', 10) +
              pad('생존', 12) + pad('잔여HP', 16) + '결과');
  for (const [a, b] of pairs) {
    const r = duel(a, b, BUDGET, 4242);
    if (!r) { console.log(`  ${a} vs ${b}: 예산 부족`); continue; }
    const verdict =
      r.aLeft > 0 && r.bLeft === 0 ? `A 완승` :
      r.bLeft > 0 && r.aLeft === 0 ? `B 완승` :
      r.aLeft === 0 && r.bLeft === 0 ? '전멸' :
      r.aHp > r.bHp ? `A 우세` : `B 우세`;
    const nameA = deckOf([a])[0].name, nameB = deckOf([b])[0].name;
    console.log(
      '  ' + pad(nameA, 12) + pad(nameB, 12) + pad(`${r.nA} : ${r.nB}`, 10) +
      pad(`${r.aLeft} : ${r.bLeft}`, 12) +
      pad(`${(r.aHp * 100).toFixed(0)}% : ${(r.bHp * 100).toFixed(0)}%`, 16) + verdict,
    );
  }
}

// ─────────────────────────────────────────────────────────────

/**
 * 퍽 sanity check — 미러 매치(양측 동일 덱)에서 P1 에게만 퍽을 줘 승률이
 * 확실히 50%보다 오르는지 확인한다. NULLIFY 는 예외로, 상대가 퍽이 없으면
 * 무효화할 대상이 없어 50% 근처에 머물러야 하고(그 자체는 무해), 상대가
 * 퍽을 들었을 때는 그 상대 퍽의 효과를 지워 50%에 가깝게 되돌려야 한다.
 */
function perkCheck() {
  const RUNS = 60;
  const base = fixedPlayer('A', ['lightInf', 'rapid', 'wall', 'aaScreen'], [0, 1, 0, 2]);
  const rival = fixedPlayer('B', ['lightInf', 'rapid', 'wall', 'aaScreen'], [0, 1, 0, 2]);

  console.log('\n[퍽 sanity check — 미러 매치, P1 에게만 퍽 부여, 각 ' + RUNS + '판]');
  for (const p of PERKS) {
    let w = 0;
    for (let i = 0; i < RUNS; i++) {
      const r = runMatch(base, rival, 9000 + i * 7793, { P1: p.id, P2: null });
      if (r.winner === 'P1') w++;
    }
    const rate = (w / RUNS) * 100;
    const flag = p.id === 'NULLIFY' ? '(상대 퍽 없음 → 중립 기대)' : rate > 50 ? '' : '  ⚠ 기대만큼 안 오름';
    console.log(`  ${pad(p.name, 12)} P1 승률 ${rate.toFixed(0)}% ${flag}`);
  }

  console.log('\n[퍽 무효화 — P1 NULLIFY, P2 는 각 퍽 보유]');
  for (const p of PERKS) {
    if (p.id === 'NULLIFY') continue;
    let w = 0;
    for (let i = 0; i < RUNS; i++) {
      const r = runMatch(base, rival, 9500 + i * 7793, { P1: 'NULLIFY', P2: p.id });
      if (r.winner === 'P1') w++;
    }
    console.log(`  vs ${pad(p.name, 12)} P1 승률 ${((w / RUNS) * 100).toFixed(0)}% (50% 근처가 정상)`);
  }
}

const mode = process.argv[2] ?? 'all';
if (mode === 'duel') { duels(); process.exit(0); }
if (mode === 'perk') { perkCheck(); process.exit(0); }
if (mode === 'bal') {
  balance();
} else {
  const ok = checkDeterminism();
  sampleMatch();
  roundRobin();
  balance();
  if (!ok) { console.log('\n❌ 결정론 검증 실패'); process.exit(1); }
  console.log('\n✅ 결정론 OK');
}
