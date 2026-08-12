import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store';
import * as C from '../sim/constants';
import { createMatch, sanitizeOrders, stateHash, submitOrders, tick, unitCount } from '../sim/match';
import type { Decks, MatchState, Side, SpawnOrder } from '../sim/types';
import { applyPerkToDeck, effectivePerk, perkDef } from '../sim/perks';
import { buildSpriteCache } from '../art/prerender';
import { unitSvg } from '../art/parts-svg';
import { BattleLoop, type Speed } from '../battle/loop';
import { Fx } from '../battle/effects';
import { render, unitScreenPos } from '../battle/renderer';
import { CANVAS_H, CANVAS_W } from '../battle/view';
import { Svg } from '../ui/Svg';
import { Result } from './Result';
import {
  pingPresence, submitRoundOrders, submitStateHash, subscribePresence, subscribeRound,
} from '../backend/cloudflare/match';

/**
 * 실제 온라인 상대와 겨루는 전투 화면. Battle.tsx(AI 연습)와 시뮬레이션 코어는
 * 완전히 동일하다 — 다른 점은 상대의 라운드 예약을 로컬 AI 가 만드는 대신
 * Firestore 문서로 주고받는다는 것뿐이다. 실시간 구간에는 여전히 네트워크
 * 트래픽이 없다 (기획서 §11.2).
 *
 * Firebase 미연결 상태(오늘)에는 이 화면에 진입할 방법이 없다 — DeckEdit 의
 * 온라인 버튼이 비활성화돼 있다. 코드만 완성해 둔 상태.
 */
export function OnlineBattle() {
  const match = useApp((s) => s.onlineMatch)!;
  const finishBattle = useApp((s) => s.finishBattle);
  const result = useApp((s) => s.result);

  const { matchId, side, seed, me, opponent } = match;
  const foeSide: Side = side === 'P1' ? 'P2' : 'P1';

  // 리터럴 P1/P2 는 항상 화면 왼쪽/오른쪽을 뜻한다 (렌더러가 그렇게 고정돼 있다).
  // "내가 어느 쪽인지"는 매치마다 달라지므로 HUD 라벨만 그에 맞게 붙인다.
  const p1Info = side === 'P1' ? me : opponent;
  const p2Info = side === 'P1' ? opponent : me;

  const perks = useMemo(
    () => ({
      P1: side === 'P1' ? me.perk : opponent.perk,
      P2: side === 'P1' ? opponent.perk : me.perk,
    }),
    [side, me.perk, opponent.perk],
  );

  const decksRef = useRef<Decks | null>(null);
  if (!decksRef.current) {
    decksRef.current = {
      P1: applyPerkToDeck(p1Info.deck, effectivePerk(perks, 'P1')),
      P2: applyPerkToDeck(p2Info.deck, effectivePerk(perks, 'P2')),
    };
  }
  const decks = decksRef.current;
  const myDeck = decks[side];

  const stateRef = useRef<MatchState>(createMatch(seed, perks));
  const fxRef = useRef(new Fx());
  const cacheRef = useRef(buildSpriteCache(decks));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loopRef = useRef<BattleLoop | null>(null);
  const lastOrdersRef = useRef<{ p1: SpawnOrder[]; p2: SpawnOrder[] }>({ p1: [], p2: [] });
  const selStartRef = useRef(0);
  const submittedRef = useRef(false);
  const endedRef = useRef(false);
  const roundUnsubRef = useRef<(() => void) | null>(null);
  const committedRoundRef = useRef(-1);
  const presenceStaleRef = useRef(false);

  const [, forceHud] = useState(0);
  const [orders, setOrders] = useState<Record<number, number>>({});
  const [ready, setReady] = useState(false);
  const [speed, setSpeed] = useState<Speed>(4);
  const [selLeft, setSelLeft] = useState(C.SELECTION_MAX_SEC);
  const [oppStale, setOppStale] = useState(false);

  const s = stateRef.current;
  const reservedTotal = useMemo(
    () => Object.entries(orders).reduce((t, [k, n]) => t + myDeck[+k].cost * n, 0),
    [orders, myDeck],
  );
  const reservedCount = useMemo(
    () => Object.values(orders).reduce((t, n) => t + n, 0),
    [orders],
  );

  /** 라운드가 바뀔 때 이전 구독을 정리하고 새 라운드 문서를 구독한다 */
  const subscribeToRound = useCallback((round: number) => {
    roundUnsubRef.current?.();
    roundUnsubRef.current = subscribeRound(matchId, round, (p1, p2) => {
      if (committedRoundRef.current >= round) return; // 이미 이 라운드를 확정했다
      committedRoundRef.current = round;
      const st = stateRef.current;
      lastOrdersRef.current = {
        p1: sanitizeOrders(p1, decks.P1, st.funds.P1).orders,
        p2: sanitizeOrders(p2, decks.P2, st.funds.P2).orders,
      };
      submitOrders(st, decks, p1, p2, seed);
      forceHud((v) => v + 1);
    });
  }, [matchId, decks, seed]);

  const enterSelection = useCallback(() => {
    setOrders({});
    setReady(false);
    submittedRef.current = false;
    selStartRef.current = performance.now();
    setSelLeft(C.SELECTION_MAX_SEC);
    subscribeToRound(stateRef.current.round);
  }, [subscribeToRound]);

  const commit = useCallback(() => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const myOrders: SpawnOrder[] = Object.entries(orders)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => ({ slot: +k, count: n }));
    void submitRoundOrders(matchId, side, stateRef.current.round, myOrders);
    forceHud((v) => v + 1);
  }, [orders, matchId, side]);

  const commitRef = useRef(commit);
  useEffect(() => { commitRef.current = commit; }, [commit]);

  // ── 루프 기동 ──
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    enterSelection();

    // 접속 유지 신호 — Cloud Functions 없이는 서버가 끊김을 강제 판정할 수 없어
    // 클라이언트끼리 타임스탬프를 비교해 안내만 한다 (§11.5)
    void pingPresence(matchId, side);
    const presenceIv = setInterval(() => void pingPresence(matchId, side), C.PRESENCE_PING_SEC * 1000);
    const unsubPresence = subscribePresence(matchId, foeSide, () => {
      presenceStaleRef.current = true;
      setOppStale(true);
    });

    let hudAt = 0;
    let prevPhase: MatchState['phase'] = stateRef.current.phase;

    const loop = new BattleLoop(
      () => {
        const st = stateRef.current;
        tick(st, decks);
        if (st.events.length) {
          fxRef.current.ingest(st.events, performance.now(), (id) => unitScreenPos(st, id));
        }
      },
      (now) => {
        const st = stateRef.current;
        fxRef.current.prune(now);
        render(ctx, st, decks, cacheRef.current, fxRef.current, now, {
          showRings: st.phase === 'SELECTION',
          paused: st.phase !== 'REALTIME',
        });

        if (st.phase !== prevPhase) {
          if (st.phase === 'SELECTION') enterSelection();
          prevPhase = st.phase;
          forceHud((v) => v + 1);
        }

        if (st.phase === 'SELECTION' && !submittedRef.current) {
          const left = Math.max(0, C.SELECTION_MAX_SEC - (now - selStartRef.current) / 1000);
          setSelLeft(left);
          if (left <= 0) commitRef.current();
        }

        if (st.phase === 'RESULT' && !endedRef.current) {
          endedRef.current = true;
          void submitStateHash(matchId, st.round, side, stateHash(st));

          const myWin = st.winner === side ? 'win' : st.winner === 'DRAW' ? 'draw' : 'loss';
          // Result 화면은 항상 "castleP1=나, castleP2=상대" 로 가정한다 —
          // 리터럴 P1/P2 는 매치마다 달라지므로 여기서 내 쪽 기준으로 정렬한다.
          const mine: Side = side, foe: Side = foeSide;
          finishBattle({
            outcome: myWin,
            reason: st.endReason ?? '',
            castleP1: Math.max(0, st.castleHp[mine]),
            castleP2: Math.max(0, st.castleHp[foe]),
            castleMaxP1: st.castleMaxHp[mine],
            castleMaxP2: st.castleMaxHp[foe],
            seconds: Math.round(st.tick / C.TICKS_PER_SEC),
            rounds: st.round,
            stats: {
              spentByRound: { P1: st.stats.spentByRound[mine], P2: st.stats.spentByRound[foe] },
              perPreset: { P1: st.stats.perPreset[mine], P2: st.stats.perPreset[foe] },
            },
            myDeck: decks[mine],
            oppDeck: decks[foe],
            oppName: opponent.displayName,
            myPerk: me.perk,
            oppPerk: opponent.perk,
          });
        }

        if (now - hudAt > 100) { hudAt = now; forceHud((v) => v + 1); }
      },
      () => stateRef.current.phase !== 'SELECTION' && stateRef.current.phase !== 'RESULT',
    );
    loopRef.current = loop;
    loop.start();
    return () => {
      loop.stop();
      roundUnsubRef.current?.();
      clearInterval(presenceIv);
      unsubPresence();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (loopRef.current) loopRef.current.speed = speed; }, [speed]);

  const roomLeft = C.MAX_UNITS_PER_SIDE - unitCount(s, side) - s.spawnQueue[side].length - reservedCount;

  const bump = useCallback((slot: number, delta: number) => {
    if (stateRef.current.phase !== 'SELECTION' || submittedRef.current) return;
    setOrders((o) => {
      const cur = o[slot] ?? 0;
      const next = Math.max(0, cur + delta);
      if (delta > 0) {
        const st = stateRef.current;
        const cost = myDeck[slot].cost;
        const spent = Object.entries(o).reduce((t, [k, n]) => t + myDeck[+k].cost * n, 0);
        if (spent + cost > st.funds[side]) return o;
        const cnt = Object.values(o).reduce((t, n) => t + n, 0);
        if (C.MAX_UNITS_PER_SIDE - unitCount(st, side) - st.spawnQueue[side].length - cnt <= 0) return o;
      }
      return { ...o, [slot]: next };
    });
  }, [myDeck, side]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (stateRef.current.phase !== 'SELECTION') return;
      if (e.key >= '1' && e.key <= '6') bump(+e.key - 1, e.shiftKey ? -1 : 1);
      if (e.key === 'Enter' && !submittedRef.current) { setReady(true); commitRef.current(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bump]);

  const doReady = () => { setReady(true); commit(); };

  const hpFrac = (v: number, sd: Side) => Math.max(0, v) / s.castleMaxHp[sd];
  const phaseLabel =
    s.phase === 'SELECTION' ? '선택 시간' :
    s.phase === 'REVEAL' ? '공개' :
    s.phase === 'REALTIME' ? '전투 중' : '종료';
  const termLeft = Math.max(0, (s.termTicks - s.phaseTick) / C.TICKS_PER_SEC);
  const totalLeft = Math.max(0, (C.LIMIT_TICKS - s.tick) / C.TICKS_PER_SEC);
  const mm = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

  return (
    <div className="battle">
      <div className="b-top">
        <div className="b-side p1">
          <div className="nm">
            {p1Info.displayName}{side === 'P1' && <span className="tag" style={{ marginLeft: 6 }}>나</span>}
            {perkDef(perks.P1) && <span className="tag perk-tag">{perkDef(perks.P1)!.name}</span>}
          </div>
          <div className="hpbar"><i style={{ width: `${hpFrac(s.castleHp.P1, 'P1') * 100}%`, background: 'var(--p1)' }} /></div>
          <div className="row">
            <span>성 <span className="mono">{Math.max(0, s.castleHp.P1)}</span></span>
            <span>자금 <b className="mono">{s.funds.P1}</b></span>
            <span>유닛 <span className="mono">{unitCount(s, 'P1')}/{C.MAX_UNITS_PER_SIDE}</span></span>
          </div>
        </div>

        <div className="b-center">
          <div className="rd">ROUND {s.round}</div>
          <div className={`ph ${s.phase === 'SELECTION' ? 'sel' : ''}`}>
            {phaseLabel}
            {s.phase === 'SELECTION' && <span className="mono"> {Math.ceil(selLeft)}s</span>}
          </div>
          <div className="tm">
            {s.phase === 'REALTIME' && <>다음 선택까지 {mm(termLeft)} · </>}
            남은 시간 {mm(totalLeft)}
          </div>
          {oppStale && (
            <div style={{ color: 'var(--bad)', fontSize: 11, marginTop: 4 }}>
              상대 연결이 {C.RECONNECT_GRACE_SEC}초 넘게 확인되지 않습니다
            </div>
          )}
        </div>

        <div className="b-side p2 right">
          <div className="nm">
            {perkDef(perks.P2) && <span className="tag perk-tag">{perkDef(perks.P2)!.name}</span>}
            {p2Info.displayName}{side === 'P2' && <span className="tag" style={{ marginLeft: 6 }}>나</span>}
          </div>
          <div className="hpbar"><i style={{ width: `${hpFrac(s.castleHp.P2, 'P2') * 100}%`, background: 'var(--p2)' }} /></div>
          <div className="row">
            <span>유닛 <span className="mono">{unitCount(s, 'P2')}/{C.MAX_UNITS_PER_SIDE}</span></span>
            <span>자금 <b className="mono">{s.funds.P2}</b></span>
            <span>성 <span className="mono">{Math.max(0, s.castleHp.P2)}</span></span>
          </div>
        </div>

        <div className="speeds">
          {([1, 2, 4] as Speed[]).map((v) => (
            <button key={v} className={speed === v ? 'on' : ''} onClick={() => setSpeed(v)}>{v}×</button>
          ))}
        </div>
      </div>

      <div className="b-stage">
        <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} />
        {s.phase === 'REVEAL' && (
          <div className="reveal">
            <RevealCol who={p1Info.displayName} side="p1" orders={lastOrdersRef.current.p1} deck={decks.P1} />
            <RevealCol who={p2Info.displayName} side="p2" orders={lastOrdersRef.current.p2} deck={decks.P2} />
          </div>
        )}
      </div>

      <div className="b-bottom">
        <div className="summon-bar">
          {myDeck.map((d, i) => {
            const n = orders[i] ?? 0;
            const canAfford = reservedTotal + d.cost <= s.funds[side];
            const off = s.phase !== 'SELECTION' || submittedRef.current || (!canAfford && n === 0) || roomLeft <= 0;
            return (
              <div
                key={i}
                className={`summon-slot ${off && n === 0 ? 'off' : ''}`}
                onClick={() => bump(i, 1)}
                onContextMenu={(e) => { e.preventDefault(); bump(i, -1); }}
                title={`${d.name} · ${d.cost}원 · HP ${d.stability} · 사거리 ${d.range} · DPS ${d.dps.toFixed(1)}`}
              >
                <span className="kb mono">{i + 1}</span>
                <Svg className="pic" html={unitSvg(d.parts, side)} />
                <div className="nm">{d.name}</div>
                <div className="cost mono">{d.cost}</div>
                {n > 0 && <div className="badge mono">{n}</div>}
              </div>
            );
          })}
        </div>

        <div className="b-ready">
          <div className="sum">
            <span>예약</span>
            <b className={reservedTotal > s.funds[side] ? 'over' : ''}>{reservedTotal} / {s.funds[side]}</b>
          </div>
          <div className="sum"><span>남은 소환칸</span><b>{Math.max(0, roomLeft)}</b></div>
          {s.phase === 'SELECTION' && !ready ? (
            <button className="btn primary ready-btn" onClick={doReady} disabled={reservedTotal > s.funds[side]}>
              준비 완료
            </button>
          ) : s.phase === 'SELECTION' ? (
            <div className="waiting">상대를 기다리는 중…</div>
          ) : (
            <div className="waiting" style={{ color: 'var(--text3)' }}>
              {s.phase === 'REALTIME' ? '전투 진행 중' : '—'}
            </div>
          )}
        </div>
      </div>

      {result && <Result />}
    </div>
  );
}

function RevealCol({
  who, side, orders, deck,
}: {
  who: string; side: 'p1' | 'p2'; orders: SpawnOrder[];
  deck: { name: string; parts: Parameters<typeof unitSvg>[0] }[];
}) {
  return (
    <div className={`rv-col ${side}`}>
      <div className="who">{who}</div>
      {orders.length === 0 && <div className="rv-none">소환 없음</div>}
      {orders.map((o, i) => (
        <div className="rv-card" key={i} style={{ animationDelay: `${i * 90}ms` }}>
          <Svg className="pic" html={unitSvg(deck[o.slot].parts, side === 'p1' ? 'P1' : 'P2')} />
          <span className="nm">{deck[o.slot].name}</span>
          <span className="ct mono">×{o.count}</span>
        </div>
      ))}
    </div>
  );
}
