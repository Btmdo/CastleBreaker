import type { LeaderRow } from '../../sim/types';
import { apiGet } from './http';

/** 온라인 리더보드 — Worker `/api/leaderboard` 조회 (Firebase 버전과 반환 타입 동일) */
export async function fetchOnlineLeaderboard(myUid: string): Promise<LeaderRow[]> {
  return apiGet(`/api/leaderboard?uid=${encodeURIComponent(myUid)}`);
}
