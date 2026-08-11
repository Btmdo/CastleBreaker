import { useEffect, useState } from 'react';
import { useApp } from '../store';
import { perkDef } from '../sim/perks';

/** 기획서 §12.11 결과 화면 — 확인하면 격납고로 복귀한다 */
export function Result() {
  const r = useApp((s) => s.result)!;
  const back = useApp((s) => s.backToHangar);
  const [rating, setRating] = useState(r.ratingBefore);

  // 레이팅 숫자 롤업
  useEffect(() => {
    const start = performance.now();
    const dur = 700;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      setRating(Math.round(r.ratingBefore + (r.ratingAfter - r.ratingBefore) * e));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [r.ratingBefore, r.ratingAfter]);

  const delta = r.ratingAfter - r.ratingBefore;
  const title = r.outcome === 'win' ? '승리' : r.outcome === 'loss' ? '패배' : '무승부';
  const why =
    r.reason === 'castle' ? '성 파괴' :
    r.reason === 'timeup' ? '제한시간 종료 — 성 HP 비율 판정' : r.reason;

  const rounds = Math.max(
    r.stats.spentByRound.P1.length,
    r.stats.spentByRound.P2.length,
  );
  const maxSpend = Math.max(
    1,
    ...r.stats.spentByRound.P1.filter(Boolean),
    ...r.stats.spentByRound.P2.filter(Boolean),
  );

  return (
    <div className="modal-veil">
      <div className="result">
        <h2 className={r.outcome}>{title}</h2>
        <div className="why">
          {why} · {r.rounds}라운드 · {Math.floor(r.seconds / 60)}분 {r.seconds % 60}초
        </div>

        <div className="rating-line">
          <span style={{ color: 'var(--text2)', fontSize: 12 }}>레이팅</span>
          <span className="n">{rating.toLocaleString()}</span>
          <span className={`dl ${delta >= 0 ? 'up' : 'dn'}`}>
            {delta >= 0 ? '+' : ''}{delta}
          </span>
          <span style={{ color: 'var(--text3)', fontSize: 12, marginLeft: 'auto' }}>
            vs {r.oppName}
          </span>
        </div>

        {(perkDef(r.myPerk) || perkDef(r.oppPerk)) && (
          <div className="res-sec">
            <h4>사용한 퍽</h4>
            <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
              <span style={{ color: 'var(--p1-lite)' }}>
                나: {perkDef(r.myPerk)?.name ?? '없음'}
              </span>
              <span style={{ color: 'var(--p2-lite)' }}>
                {r.oppName}: {perkDef(r.oppPerk)?.name ?? '없음'}
              </span>
            </div>
          </div>
        )}

        <div className="res-sec">
          <h4>성 HP</h4>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13 }}>
            <span style={{ color: 'var(--p1)', fontWeight: 800, width: 70 }}>내 성</span>
            <div style={{ flex: 1, height: 12, background: 'var(--app)' }}>
              <div style={{ width: `${(r.castleP1 / r.castleMaxP1) * 100}%`, height: '100%', background: 'var(--p1)' }} />
            </div>
            <span className="mono" style={{ width: 90, textAlign: 'right' }}>
              {r.castleP1} / {r.castleMaxP1}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, marginTop: 6 }}>
            <span style={{ color: 'var(--p2)', fontWeight: 800, width: 70 }}>{r.oppName}</span>
            <div style={{ flex: 1, height: 12, background: 'var(--app)' }}>
              <div style={{ width: `${(r.castleP2 / r.castleMaxP2) * 100}%`, height: '100%', background: 'var(--p2)' }} />
            </div>
            <span className="mono" style={{ width: 90, textAlign: 'right' }}>
              {r.castleP2} / {r.castleMaxP2}
            </span>
          </div>
        </div>

        <div className="res-sec">
          <h4>라운드별 지출</h4>
          <div className="spend-graph">
            {Array.from({ length: rounds }, (_, i) => {
              const a = r.stats.spentByRound.P1[i] ?? 0;
              const b = r.stats.spentByRound.P2[i] ?? 0;
              return (
                <div className="col" key={i}>
                  <div className="pair">
                    <i className="a" style={{ height: `${(a / maxSpend) * 100}%`, animationDelay: `${i * 60}ms` }} title={`${a}원`} />
                    <i className="b" style={{ height: `${(b / maxSpend) * 100}%`, animationDelay: `${i * 60 + 30}ms` }} title={`${b}원`} />
                  </div>
                  <span className="lb">R{i + 1}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="res-sec">
          <h4>내 유닛 통계</h4>
          <table className="stats">
            <thead>
              <tr>
                <th>설계</th><th>소환</th><th>처치</th><th>입힌 피해</th><th>받은 피해</th>
              </tr>
            </thead>
            <tbody>
              {r.stats.perPreset.P1.map((p, i) => (
                <tr key={i}>
                  <td>{r.myDeck[i]?.name ?? '—'}</td>
                  <td className="mono">{p.spawned}</td>
                  <td className="mono">{p.kills}</td>
                  <td className="mono">{p.damageDealt}</td>
                  <td className="mono">{p.damageTaken}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="res-actions">
          <button className="btn primary" onClick={back}>격납고로</button>
        </div>
      </div>
    </div>
  );
}
