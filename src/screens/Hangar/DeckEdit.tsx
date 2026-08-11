import { useMemo, useState } from 'react';
import { useApp } from '../../store';
import { assemble } from '../../sim/assemble';
import { DECK_SIZE } from '../../sim/constants';
import { unitSvg } from '../../art/parts-svg';
import { pickOpponent } from '../../ai/opponents';
import { rngNext } from '../../sim/rng';
import { Svg } from '../../ui/Svg';
import { isFirebaseConfigured } from '../../backend/config';

/** 기획서 §12.4 ② 편성 탭 */
export function DeckEdit() {
  const profile = useApp((s) => s.profile)!;
  const setProfile = useApp((s) => s.setProfile);
  const sortie = useApp((s) => s.sortie);
  const sortieOnline = useApp((s) => s.sortieOnline);
  const [msg, setMsg] = useState<string | null>(null);

  const deck = profile.decks.find((d) => d.id === profile.activeDeckId) ?? profile.decks[0];
  const byId = useMemo(
    () => new Map(profile.presets.map((p) => [p.id, p])),
    [profile.presets],
  );
  const slots = useMemo(
    () => Array.from({ length: DECK_SIZE }, (_, i) => byId.get(deck?.slots[i] ?? '') ?? null),
    [deck, byId],
  );
  const resolved = slots.map((p) => (p ? assemble(p) : null));
  const filled = slots.filter(Boolean).length;

  const setSlots = (next: (string | null)[]) => {
    const decks = profile.decks.map((d) =>
      d.id === deck.id ? { ...d, slots: next.filter((x): x is string => !!x) } : d,
    );
    setProfile({ ...profile, decks });
  };

  const toggle = (presetId: string) => {
    const cur = slots.map((p) => p?.id ?? null);
    const at = cur.indexOf(presetId);
    if (at >= 0) { cur[at] = null; setSlots(cur); return; }
    const empty = cur.indexOf(null);
    if (empty < 0) { setMsg(`덱은 ${DECK_SIZE}개까지입니다. 먼저 하나를 빼세요.`); setTimeout(() => setMsg(null), 1800); return; }
    cur[empty] = presetId;
    setSlots(cur);
  };

  // 편성 진단 — 무엇을 빼먹었는지 알려준다
  const cov = {
    대공: resolved.some((r) => r?.canHitAir),
    항공: resolved.some((r) => r?.canFly),
    화력: resolved.some((r) => r && r.attack > 0),
    방벽: resolved.some((r) => r && r.stability >= 110),
    저가: resolved.some((r) => r && r.cost <= 100),
  };

  const uid = useApp((s) => s.uid);
  const backendMode = useApp((s) => s.backendMode);

  const doSortie = () => {
    if (filled < DECK_SIZE) return;
    const seed = (Date.now() ^ rngNext(profile.rating + filled)) >>> 0;
    let s = seed;
    const rand = () => { s = rngNext(s); return s / 0x100000000; };
    sortie(pickOpponent(profile.rating, rand), seed);
  };

  const onlineReady = backendMode === 'online' && !!uid && filled >= DECK_SIZE;
  const doSortieOnline = () => {
    if (!onlineReady || !uid) return;
    sortieOnline({
      uid,
      displayName: profile.displayName,
      rating: profile.rating,
      bio: profile.bio,
      perk: profile.perk,
      deck: resolved.filter((r): r is NonNullable<typeof r> => !!r),
    });
  };

  return (
    <div className="deckpage">
      <div className="deck-grid">
        <h4 style={{ fontSize: 11, letterSpacing: '.12em', color: 'var(--text2)', marginBottom: 10 }}>
          출격 덱 — {filled} / {DECK_SIZE}
        </h4>
        <div className="deck-slots">
          {slots.map((p, i) => {
            const r = resolved[i];
            return (
              <div
                key={i}
                className={`deck-slot ${p ? '' : 'empty'}`}
                onClick={() => p && toggle(p.id)}
                title={p ? '클릭하면 뺍니다' : ''}
              >
                {p && r ? (
                  <>
                    <Svg className="pic" html={unitSvg(r.parts, 'P1')} />
                    <div className="nm">{p.name}</div>
                    <div className="cost mono">{r.cost} 원</div>
                    <div className="st mono">
                      HP {r.stability} · 사거리 {r.range} · DPS {r.dps.toFixed(0)}
                    </div>
                  </>
                ) : (
                  <div style={{ paddingTop: 28, paddingBottom: 28, fontSize: 12 }}>비어 있음</div>
                )}
              </div>
            );
          })}
        </div>

        <h4 style={{ fontSize: 11, letterSpacing: '.12em', color: 'var(--text2)', margin: '4px 0 10px' }}>
          보유 설계 {profile.presets.length}
        </h4>
        <div className="pool">
          {profile.presets.map((p) => {
            const r = assemble(p);
            const inDeck = slots.some((s) => s?.id === p.id);
            return (
              <div key={p.id} className={`pool-card ${inDeck ? 'in' : ''}`} onClick={() => toggle(p.id)}>
                <Svg className="pic" html={unitSvg(r.parts, 'P1')} />
                <div>
                  <div className="nm">{p.name}</div>
                  <div className="cost mono">{r.cost} 원</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="deck-side">
        <button
          className="btn primary sortie-btn"
          disabled={filled < DECK_SIZE}
          onClick={doSortie}
        >
          AI 연습 출격
        </button>
        <button
          className="btn sortie-btn"
          disabled={!onlineReady}
          onClick={doSortieOnline}
          title={!isFirebaseConfigured ? '온라인 서버 연결 대기 중 — 곧 활성화됩니다' : ''}
        >
          {isFirebaseConfigured ? '온라인 대전 매칭' : '온라인 대전 (연결 대기 중)'}
        </button>
        {filled < DECK_SIZE && (
          <div className="deck-note" style={{ color: 'var(--bad)' }}>
            덱에 설계 {DECK_SIZE - filled}개가 더 필요합니다.
          </div>
        )}

        <div>
          <h4 style={{ fontSize: 11, letterSpacing: '.12em', color: 'var(--text2)', marginBottom: 8 }}>
            편성 진단
          </h4>
          <div className="cov">
            {Object.entries(cov).map(([k, v]) => (
              <div key={k}>
                <span style={{ color: 'var(--text2)' }}>{k}</span>
                <span className={v ? 'ok' : 'no'}>{v ? '✓ 있음' : '✗ 없음'}</span>
              </div>
            ))}
          </div>
          {!cov.대공 && (
            <div className="deck-note" style={{ color: 'var(--bad)', marginTop: 8 }}>
              대공 수단(사거리 50 이상)이 하나도 없습니다. 상대 항공기가 성까지 그대로 갑니다.
            </div>
          )}
          {!cov.화력 && (
            <div className="deck-note" style={{ color: 'var(--bad)', marginTop: 8 }}>
              공격력이 있는 유닛이 없습니다. 방벽만으로는 상대를 죽일 수 없습니다.
            </div>
          )}
        </div>

        {msg && <div className="deck-note" style={{ color: 'var(--warn)' }}>{msg}</div>}

        <div className="deck-note" style={{ marginTop: 'auto' }}>
          매치가 시작되면 이 6종을 자금이 허락하는 만큼 몇 번이든 소환할 수 있습니다.
          매치 중에는 덱을 바꿀 수 없습니다.
        </div>
      </div>
    </div>
  );
}
