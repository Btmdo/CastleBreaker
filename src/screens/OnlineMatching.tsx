import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import { MatchmakingSession } from '../backend/firebase/matchmaking';
import { unitSvg } from '../art/parts-svg';

/**
 * 실제 온라인 상대를 찾는 매칭 화면 (기획서 §12.7 의 온라인 버전).
 * Firebase 가 연결되지 않은 오늘은 이 화면에 도달할 방법 자체가 없다
 * (DeckEdit 의 온라인 버튼이 비활성화돼 있다) — 코드만 완성해 둔다.
 */
export function OnlineMatching() {
  const myInfo = useApp((s) => s.onlineMyInfo);
  const onlineMatchFound = useApp((s) => s.onlineMatchFound);
  const beginBattle = useApp((s) => s.beginBattle);
  const backToHangar = useApp((s) => s.backToHangar);
  const [elapsed, setElapsed] = useState(0);
  const sessionRef = useRef<MatchmakingSession | null>(null);

  useEffect(() => {
    if (!myInfo) return;
    const t0 = performance.now();
    const iv = setInterval(() => setElapsed(performance.now() - t0), 100);

    const session = new MatchmakingSession(myInfo);
    sessionRef.current = session;
    void session.start((found) => {
      onlineMatchFound(found);
      beginBattle();
    });

    return () => {
      clearInterval(iv);
      void session.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myInfo]);

  if (!myInfo) return null;
  const secs = Math.floor(elapsed / 1000);

  return (
    <div className="matching">
      <div className="orbit">
        {myInfo.deck.map((d, i) => {
          const a = (elapsed / 1000) * 0.9 + (i / myInfo.deck.length) * Math.PI * 2;
          return (
            <i
              key={i}
              style={{ transform: `translate(${Math.cos(a) * 96}px, ${Math.sin(a) * 96}px)` }}
              dangerouslySetInnerHTML={{ __html: unitSvg(d.parts, 'P1') }}
            />
          );
        })}
      </div>
      <div className="match-text">온라인 상대를 찾는 중…</div>
      <div className="match-time mono">00:{String(secs).padStart(2, '0')}</div>
      <button className="btn ghost" onClick={() => { void sessionRef.current?.cancel(); backToHangar(); }}>
        취소
      </button>
    </div>
  );
}
