import { useMemo } from 'react';
import { useApp } from '../store';
import { LOGO_UNIT, unitLayers } from '../art/parts-svg';
import { SIDE } from '../art/palette';

/**
 * 기획서 §12.2 메인 페이지.
 * 로고는 파츠 도형이 화면 밖에서 날아와 조립되는 형태로 등장한다 —
 * 첫 화면에서 이 게임이 '조립하는 게임'임을 알린다.
 */

/** 레이어별 진입 방향 — 다리는 아래, 몸통은 위, 팔은 좌, 무기는 우, 특수는 위 */
const ENTRY: Record<string, [string, string]> = {
  leg: ['0px', '90px'],
  body: ['0px', '-90px'],
  arm: ['-110px', '0px'],
  weapon: ['120px', '20px'],
  special: ['0px', '-70px'],
};
const DELAY: Record<string, number> = { leg: 0, body: 90, arm: 190, weapon: 280, special: 370 };

function FloatBg() {
  const bits = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => {
        const size = 6 + ((i * 7) % 18);
        return {
          left: `${(i * 4.7 + 3) % 97}%`,
          top: `${(i * 13 + 10) % 100}%`,
          width: size,
          height: i % 3 === 0 ? size : Math.max(3, size / 2),
          duration: 9 + ((i * 3) % 11),
          delay: -((i * 1.7) % 12),
          color: i % 4 === 0 ? SIDE.P2.leg : SIDE.P1.leg,
        };
      }),
    [],
  );
  return (
    <div className="main-bg" aria-hidden>
      {bits.map((b, i) => (
        <i
          key={i}
          style={{
            left: b.left, top: b.top, width: b.width, height: b.height,
            background: b.color,
            animationDuration: `${b.duration}s`,
            animationDelay: `${b.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

export function Main() {
  const openIdentify = useApp((s) => s.openIdentify);
  const screen = useApp((s) => s.screen);
  const { viewBox, layers } = useMemo(() => unitLayers(LOGO_UNIT, 'P1'), []);

  return (
    <div className="main">
      <FloatBg />
      <div className="logo-wrap">
        <div className="logo-mech">
          {layers.map((l) => {
            const [fx, fy] = ENTRY[l.name] ?? ['0px', '-60px'];
            return (
              <svg
                key={l.name}
                className="lay"
                viewBox={viewBox}
                preserveAspectRatio="xMidYMid meet"
                style={
                  {
                    '--fx': fx, '--fy': fy,
                    animationDelay: `${DELAY[l.name] ?? 0}ms`,
                  } as React.CSSProperties
                }
                dangerouslySetInnerHTML={{ __html: l.inner }}
              />
            );
          })}
        </div>
        <div className="logo-word">
          CASTLE <span className="b">BREAKER</span>
        </div>
        <div className="logo-sub">조립식 오펜스 대전</div>
        <button
          className="start-btn"
          onClick={openIdentify}
          disabled={screen !== 'MAIN'}
        >
          GAME START
        </button>
      </div>
      <div className="main-foot">v0.1 오프라인 프로토타입 · 가상 플레이어 대전</div>
    </div>
  );
}
