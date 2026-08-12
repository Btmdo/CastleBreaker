import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../store';
import { leaderboard } from '../../storage/local';
import { fetchOnlineLeaderboard } from '../../backend/cloudflare/leaderboard';
import type { LeaderRow } from '../../sim/types';

/** 기획서 §12.5 — 랭킹 리더보드 (Elo 정렬). 온라인 백엔드면 Firestore 조회로 대체된다. */
export function Leaderboard() {
  const profile = useApp((s) => s.profile)!;
  const backendMode = useApp((s) => s.backendMode);
  const uid = useApp((s) => s.uid);
  const localRows = useMemo(() => leaderboard(profile), [profile]);
  const [onlineRows, setOnlineRows] = useState<LeaderRow[] | null>(null);

  useEffect(() => {
    if (backendMode !== 'online' || !uid) { setOnlineRows(null); return; }
    let cancelled = false;
    void fetchOnlineLeaderboard(uid).then((rows) => { if (!cancelled) setOnlineRows(rows); });
    return () => { cancelled = true; };
  }, [backendMode, uid, profile.rating]);

  const rows = backendMode === 'online' ? (onlineRows ?? []) : localRows;
  const myRow = rows.find((r) => r.isMe);

  const rankClass = (r: number) => (r === 1 ? 'r1' : r === 2 ? 'r2' : r === 3 ? 'r3' : 'mono');
  const winRate = (w: number, d: number, l: number) => {
    const t = w + d + l;
    return t === 0 ? '—' : `${Math.round((w / t) * 100)}%`;
  };

  return (
    <div className="rank-wrap">
      <table className="rank">
        <thead>
          <tr>
            <th style={{ width: 60 }}>순위</th>
            <th>이름</th>
            <th style={{ width: 90, textAlign: 'right' }}>레이팅</th>
            <th style={{ width: 130, textAlign: 'right' }}>전적</th>
            <th style={{ width: 80, textAlign: 'right' }}>승률</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.rank}-${r.displayName}`} className={r.isMe ? 'me' : ''}>
              <td className={rankClass(r.rank)}>{r.rank}</td>
              <td>{r.displayName}{r.isMe && <span className="tag" style={{ marginLeft: 8 }}>나</span>}</td>
              <td className="rt mono" style={{ textAlign: 'right' }}>{r.rating.toLocaleString()}</td>
              <td className="mono" style={{ textAlign: 'right' }}>{r.wins}승 {r.draws}무 {r.losses}패</td>
              <td className="mono" style={{ textAlign: 'right' }}>{winRate(r.wins, r.draws, r.losses)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {!myRow && (
        <table className="rank" style={{ marginTop: 14 }}>
          <tbody>
            <tr className="me">
              <td className="mono">—</td>
              <td>{profile.displayName}<span className="tag" style={{ marginLeft: 8 }}>나</span></td>
              <td className="rt mono" style={{ textAlign: 'right', width: 90 }}>{profile.rating}</td>
              <td className="mono" style={{ textAlign: 'right', width: 130 }}>
                {profile.wins}승 {profile.draws}무 {profile.losses}패
              </td>
              <td className="mono" style={{ textAlign: 'right', width: 80 }}>
                {winRate(profile.wins, profile.draws, profile.losses)}
              </td>
            </tr>
          </tbody>
        </table>
      )}

      {backendMode === 'online' && onlineRows === null && (
        <p style={{ color: 'var(--text3)', fontSize: 12, marginTop: 16 }}>불러오는 중…</p>
      )}
      <p style={{ color: 'var(--text3)', fontSize: 12, marginTop: 16 }}>
        Elo 방식 · 시작 1000점 · K=32 · 강한 상대를 이길수록 더 오릅니다.
        {backendMode === 'online'
          ? ' 온라인 플레이어 전체 순위입니다.'
          : ' 가상 플레이어 5인의 레이팅은 고정입니다.'}
      </p>
    </div>
  );
}
