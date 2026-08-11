import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store';
import { assemble } from '../sim/assemble';
import { DECK_SIZE } from '../sim/constants';
import { unitSvg } from '../art/parts-svg';

/**
 * 기획서 §12.7 매칭 대기.
 * 온라인이 아니므로 실제로는 AI 상대가 이미 정해져 있다 — 대기 연출만 재생하고
 * 상대 카드를 보여준 뒤 전투로 넘어간다.
 */
const SEARCH_MS = 1400;
const CARD_MS = 1600;

export function Matching() {
  const profile = useApp((s) => s.profile)!;
  const opponent = useApp((s) => s.opponent)!;
  const beginBattle = useApp((s) => s.beginBattle);
  const backToHangar = useApp((s) => s.backToHangar);
  const [t0] = useState(() => performance.now());
  const [elapsed, setElapsed] = useState(0);
  const [found, setFound] = useState(false);

  const deck = profile.decks.find((d) => d.id === profile.activeDeckId) ?? profile.decks[0];
  const units = useMemo(() => {
    const byId = new Map(profile.presets.map((p) => [p.id, p]));
    return (deck?.slots ?? [])
      .slice(0, DECK_SIZE)
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((p) => unitSvg(assemble(p!).parts, 'P1'));
  }, [deck, profile.presets]);

  useEffect(() => {
    const iv = setInterval(() => setElapsed(performance.now() - t0), 100);
    const a = setTimeout(() => setFound(true), SEARCH_MS);
    const b = setTimeout(() => beginBattle(), SEARCH_MS + CARD_MS);
    return () => { clearInterval(iv); clearTimeout(a); clearTimeout(b); };
  }, [t0, beginBattle]);

  const secs = Math.floor(elapsed / 1000);
  const spin = elapsed / 1000;

  return (
    <div className="matching">
      <div className="orbit">
        {units.map((svg, i) => {
          const a = spin * 0.9 + (i / Math.max(1, units.length)) * Math.PI * 2;
          return (
            <i
              key={i}
              style={{
                transform: `translate(${Math.cos(a) * 96}px, ${Math.sin(a) * 96}px)`,
                opacity: found ? 0.25 : 1,
                transition: 'opacity .4s',
              }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          );
        })}
      </div>

      {found ? (
        <div className="foe-card">
          <div style={{ fontSize: 11, letterSpacing: '.14em', color: 'var(--text2)' }}>상대 발견</div>
          <div className="nm">{opponent.name}</div>
          <div className="rt mono">레이팅 {opponent.rating.toLocaleString()}</div>
          <div className="tl">“{opponent.tagline}”</div>
        </div>
      ) : (
        <>
          <div className="match-text">상대를 찾는 중…</div>
          <div className="match-time mono">
            00:{String(secs).padStart(2, '0')}
          </div>
          <button className="btn ghost" onClick={backToHangar}>취소</button>
        </>
      )}
    </div>
  );
}
