import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store';
import { assemble } from '../sim/assemble';
import * as C from '../sim/constants';
import { createMatch, sanitizeOrders, submitOrders, tick, unitCount } from '../sim/match';
import { rngNext } from '../sim/rng';
import type { Decks, MatchState, SpawnOrder } from '../sim/types';
import { resolveAiDeck } from '../ai/opponents';
import { aiDecide } from '../ai/brain';
import { buildSpriteCache } from '../art/prerender';
import { unitSvg } from '../art/parts-svg';
import { BattleLoop, type Speed } from '../battle/loop';
import { Fx } from '../battle/effects';
import { render, unitScreenPos } from '../battle/renderer';
import { CANVAS_H, CANVAS_W } from '../battle/view';
import { Svg } from '../ui/Svg';
import { Result } from './Result';
import { applyPerkToDeck, effectivePerk, perkDef } from '../sim/perks';

export function Battle() {
  const profile = useApp((s) => s.profile)!;
  const opponent = useApp((s) => s.opponent)!;
  const matchSeed = useApp((s) => s.matchSeed);
  const finishBattle = useApp((s) => s.finishBattle);
  const result = useApp((s) => s.result);

  // 퍽 — 계정당 1개. 매치 시작 시점의 값으로 고정한다 (전투 중 변경 불가)
  const perksRef = useRef<Record<'P1' | 'P2', import('../sim/types').PerkId | null> | null>(null);
  if (!perksRef.current) perksRef.current = { P1: profile.perk, P2: opponent.perk };
  const perks = perksRef.current;

  // ── 덱 확정 (매치 중 불변) ──
  // 전투가 끝나면 레이팅이 갱신되어 profile 이 바뀌는데, 그때 덱 객체가 새로 만들어지면
  // 루프가 붙잡고 있는 것과 HUD 가 보는 것이 갈라진다. 최초 1회만 만들어 ref 에 고정한다.
  const decksRef = useRef<Decks | null>(null);
  if (!decksRef.current) {
    const byId = new Map(profile.presets.map((p) => [p.id, p]));
    const deck = profile.decks.find((d) => d.id === profile.activeDeckId) ?? profile.decks[0];
    const mine = (deck?.slots ?? [])
      .slice(0, C.DECK_SIZE)
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((p) => assemble(p!));
    decksRef.current = {
      P1: applyPerkToDeck(mine, effectivePerk(perks, 'P1')),
      P2: applyPerkToDeck(resolveAiDeck(opponent), effectivePerk(perks, 'P2')),
    };
  }
  const decks = decksRef.current;

  const stateRef = useRef<MatchState>(createMatch(matchSeed, perks));
  const fxRef = useRef(new Fx());
  const cacheRef = useRef(buildSpriteCache(decks));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loopRef = useRef<BattleLoop | null>(null);
  const aiOrdersRef = useRef<SpawnOrder[]>([]);
  const lastOrdersRef = useRef<{ p1: SpawnOrder[]; p2: SpawnOrder[] }>({ p1: [], p2: [] });
  const aiRandRef = useRef<() => number>(() => 0);
  const selStartRef = useRef(0);
  const submittedRef = useRef(false);
  const endedRef = useRef(false);

  const [, forceHud] = useState(0);
  const [orders, setOrders] = useState<Record<number, number>>({});
  const [ready, setReady] = useState(false);
  const [speed, setSpeed] = useState<Speed>(4); // 기본 4배속
  const [selLeft, setSelLeft] = useState(C.SELECTION_MAX_SEC);

  // AI 난수 — 매치 시드에서 파생해 재현 가능하게 둔다
  useEffect(() => {
    let s = (matchSeed ^ 0x5bd1) >>> 0;
    aiRandRef.current = () => { s = rngNext(s); return s / 0x100000000; };
  }, [matchSeed]);

  const s = stateRef.current;
  const myDeck = decks.P1;
  const reservedTotal = useMemo(
    () => Object.entries(orders).reduce((t, [k, n]) => t + myDeck[+k].cost * n, 0),
    [orders, myDeck],
  );
  const reservedCount = useMemo(
    () => Object.values(orders).reduce((t, n) => t + n, 0),
    [orders],
  );

  /** 선택 시간 진입 — AI 결정을 만들고 예약을 초기화한다 */
  const enterSelection = useCallback(() => {
    // ★ AI 는 전장에 나와 있는 유닛만 본다. 플레이어의 이번 라운드 예약은 참조하지 않는다.
    aiOrdersRef.current = aiDecide(
      opponent, decks.P2, stateRef.current, 'P2', decks, aiRandRef.current,
    );
    setOrders({});
    setReady(false);
    submittedRef.current = false;
    selStartRef.current = performance.now();
    setSelLeft(C.SELECTION_MAX_SEC);
  }, [opponent, decks]);

  const commit = useCallback(() => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const st = stateRef.current;
    const p1: SpawnOrder[] = Object.entries(orders)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => ({ slot: +k, count: n }));
    const p2 = aiOrdersRef.current;
    lastOrdersRef.current = {
      p1: sanitizeOrders(p1, decks.P1, st.funds.P1).orders,
      p2: sanitizeOrders(p2, decks.P2, st.funds.P2).orders,
    };
    submitOrders(st, decks, p1, p2, matchSeed);
    forceHud((v) => v + 1);
  }, [orders, decks, matchSeed]);

  // 최신 commit 을 루프에서 쓰기 위한 ref
  const commitRef = useRef(commit);
  useEffect(() => { commitRef.current = commit; }, [commit]);

  // ── 루프 기동 ──
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    enterSelection();

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

        // 선택 시간 타이머 (벽시계)
        if (st.phase === 'SELECTION' && !submittedRef.current) {
          const left = Math.max(0, C.SELECTION_MAX_SEC - (now - selStartRef.current) / 1000);
          setSelLeft(left);
          if (left <= 0) commitRef.current();
        }

        if (st.phase === 'RESULT' && !endedRef.current) {
          endedRef.current = true;
          const outcome = st.winner === 'P1' ? 'win' : st.winner === 'P2' ? 'loss' : 'draw';
          finishBattle({
            outcome,
            reason: st.endReason ?? '',
            castleP1: Math.max(0, st.castleHp.P1),
            castleP2: Math.max(0, st.castleHp.P2),
            castleMaxP1: st.castleMaxHp.P1,
            castleMaxP2: st.castleMaxHp.P2,
            seconds: Math.round(st.tick / C.TICKS_PER_SEC),
            rounds: st.round,
            stats: st.stats,
            myDeck: decks.P1,
            oppDeck: decks.P2,
            oppName: opponent.name,
            myPerk: perks.P1,
            oppPerk: perks.P2,
          });
        }

        if (now - hudAt > 100) { hudAt = now; forceHud((v) => v + 1); }
      },
      () => stateRef.current.phase !== 'SELECTION' && stateRef.current.phase !== 'RESULT',
    );
    loopRef.current = loop;
    loop.start();
    return () => loop.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (loopRef.current) loopRef.current.speed = speed; }, [speed]);

  // ── 소환 예약 ──
  const roomLeft =
    C.MAX_UNITS_PER_SIDE - unitCount(s, 'P1') - s.spawnQueue.P1.length - reservedCount;

  const bump = useCallback((slot: number, delta: number) => {
    if (stateRef.current.phase !== 'SELECTION' || submittedRef.current) return;
    setOrders((o) => {
      const cur = o[slot] ?? 0;
      const next = Math.max(0, cur + delta);
      if (delta > 0) {
        const st = stateRef.current;
        const cost = decks.P1[slot].cost;
        const spent = Object.entries(o).reduce((t, [k, n]) => t + decks.P1[+k].cost * n, 0);
        if (spent + cost > st.funds.P1) return o;
        const cnt = Object.values(o).reduce((t, n) => t + n, 0);
        if (C.MAX_UNITS_PER_SIDE - unitCount(st, 'P1') - st.spawnQueue.P1.length - cnt <= 0) return o;
      }
      return { ...o, [slot]: next };
    });
  }, [decks]);

  // 키보드 1~6 / Enter
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

  // ── HUD 값 ──
  const hpFrac = (v: number, side: 'P1' | 'P2') => Math.max(0, v) / s.castleMaxHp[side];
  const phaseLabel =
    s.phase === 'SELECTION' ? '선택 시간' :
    s.phase === 'REVEAL' ? '공개' :
    s.phase === 'REALTIME' ? '전투 중' : '종료';
  const termLeft = Math.max(0, (s.termTicks - s.phaseTick) / C.TICKS_PER_SEC);
  const totalLeft = Math.max(0, (C.LIMIT_TICKS - s.tick) / C.TICKS_PER_SEC);
  const mm = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

  return (
    <div className="battle">
      {/* 상단 */}
      <div className="b-top">
        <div className="b-side p1">
          <div className="nm">
            {profile.displayName}
            {perkDef(perks.P1) && <span className="tag perk-tag">{perkDef(perks.P1)!.name}</span>}
          </div>
          <div className="hpbar">
            <i style={{ width: `${hpFrac(s.castleHp.P1, 'P1') * 100}%`, background: 'var(--p1)' }} />
          </div>
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
        </div>

        <div className="b-side p2 right">
          <div className="nm">
            {perkDef(perks.P2) && <span className="tag perk-tag">{perkDef(perks.P2)!.name}</span>}
            {opponent.name}
          </div>
          <div className="hpbar">
            <i style={{ width: `${hpFrac(s.castleHp.P2, 'P2') * 100}%`, background: 'var(--p2)' }} />
          </div>
          <div className="row">
            <span>유닛 <span className="mono">{unitCount(s, 'P2')}/{C.MAX_UNITS_PER_SIDE}</span></span>
            <span>자금 <b className="mono">{s.funds.P2}</b></span>
            <span>성 <span className="mono">{Math.max(0, s.castleHp.P2)}</span></span>
          </div>
        </div>

        <div className="speeds">
          {([1, 2, 4] as Speed[]).map((v) => (
            <button key={v} className={speed === v ? 'on' : ''} onClick={() => setSpeed(v)}>
              {v}×
            </button>
          ))}
        </div>
      </div>

      {/* 전장 */}
      <div className="b-stage">
        <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} />
        {s.phase === 'REVEAL' && (
          <div className="reveal">
            <RevealCol who={profile.displayName} side="p1" orders={lastOrdersRef.current.p1} deck={decks.P1} />
            <RevealCol who={opponent.name} side="p2" orders={lastOrdersRef.current.p2} deck={decks.P2} />
          </div>
        )}
      </div>

      {/* 하단 소환 바 */}
      <div className="b-bottom">
        <div className="summon-bar">
          {myDeck.map((d, i) => {
            const n = orders[i] ?? 0;
            const canAfford = reservedTotal + d.cost <= s.funds.P1;
            const off = s.phase !== 'SELECTION' || submittedRef.current || (!canAfford && n === 0) || roomLeft <= 0;
            return (
              <div
                key={i}
                className={`summon-slot ${off && n === 0 ? 'off' : ''}`}
                onClick={() => bump(i, 1)}
                onContextMenu={(e) => { e.preventDefault(); bump(i, -1); }}
                title={`${d.name} · ${d.cost}원 · HP ${d.stability} · 사거리 ${d.range} · DPS ${d.dps.toFixed(1)}` +
                  `${d.canFly ? ' · 비행' : ''}${d.canHitAir ? ' · 대공' : ''}`}
              >
                <span className="kb mono">{i + 1}</span>
                <Svg className="pic" html={unitSvg(d.parts, 'P1')} />
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
            <b className={reservedTotal > s.funds.P1 ? 'over' : ''}>
              {reservedTotal} / {s.funds.P1}
            </b>
          </div>
          <div className="sum">
            <span>남은 소환칸</span><b>{Math.max(0, roomLeft)}</b>
          </div>
          {s.phase === 'SELECTION' && !ready ? (
            <button
              className="btn primary ready-btn"
              onClick={doReady}
              disabled={reservedTotal > s.funds.P1}
            >
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
