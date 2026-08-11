import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { getFirebaseDb } from './app';
import * as C from '../../sim/constants';
import type { LeaderRow } from '../../sim/types';

/** 온라인 리더보드 — Firestore players 컬렉션을 레이팅 내림차순으로 조회한다 */
export async function fetchOnlineLeaderboard(myUid: string): Promise<LeaderRow[]> {
  const q = query(
    collection(getFirebaseDb(), 'players'),
    orderBy('rating', 'desc'),
    limit(C.LEADERBOARD_SIZE),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d, i) => {
    const data = d.data();
    return {
      rank: i + 1,
      displayName: (data.displayName as string) ?? '?',
      rating: (data.rating as number) ?? C.RATING_START,
      wins: (data.wins as number) ?? 0,
      draws: (data.draws as number) ?? 0,
      losses: (data.losses as number) ?? 0,
      isMe: d.id === myUid,
    };
  });
}
