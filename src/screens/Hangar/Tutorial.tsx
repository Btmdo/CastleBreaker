import { useState } from 'react';
import { useApp } from '../../store';
import { TUTORIAL_PAGES } from '../../art/tutorial-art';
import { Svg } from '../../ui/Svg';

/** 기획서 §12.10 — 튜토리얼 팝업 6페이지 */
export function Tutorial() {
  const close = useApp((s) => s.closeTutorial);
  const [i, setI] = useState(0);
  const page = TUTORIAL_PAGES[i];
  const last = i === TUTORIAL_PAGES.length - 1;

  return (
    <div className="modal-veil">
      <div className="modal tut" style={{ padding: 0, minWidth: 0 }}>
        <div className="tut-art">
          <Svg key={`art${i}`} className="tut-key" html={page.art} />
        </div>
        <div className="tut-body">
          <h3>
            <span className="ix mono">{i + 1} / {TUTORIAL_PAGES.length}</span>
            {page.title}
          </h3>
          {page.body.map((b, k) => <p key={k}>{b}</p>)}
        </div>
        <div className="tut-foot">
          <div className="dots">
            {TUTORIAL_PAGES.map((_, k) => (
              <i key={k} className={k === i ? 'on' : ''} onClick={() => setI(k)} />
            ))}
          </div>
          <button className="btn ghost" disabled={i === 0} onClick={() => setI(i - 1)}>이전</button>
          {last ? (
            <button className="btn primary" onClick={close}>시작하기</button>
          ) : (
            <button className="btn" onClick={() => setI(i + 1)}>다음</button>
          )}
        </div>
      </div>
    </div>
  );
}
