import { ROUND_POLL_MS } from '../config';
import * as C from '../../sim/constants';
import type { Side, SpawnOrder } from '../../sim/types';
import { apiGet, apiPost } from './http';

/**
 * 라운드 예약 동기화. Firestore onSnapshot 대신 폴링을 쓰지만 호출부
 * (OnlineBattle.tsx)에서 보는 함수 시그니처는 firebase 버전과 동일하다.
 * 실시간 전투 구간에는 여전히 아무 요청도 없다 — 라운드 경계에서만 오간다.
 */
export async function submitRoundOrders(
  matchId: string, side: Side, round: number, orders: SpawnOrder[],
): Promise<void> {
  await apiPost(`/api/match/${matchId}/orders`, { side, round, orders });
}

/** 양측 예약이 모두 도착하면 콜백에 전달한다. 구독 해제 함수를 반환한다. */
export function subscribeRound(
  matchId: string, round: number,
  onBoth: (p1: SpawnOrder[], p2: SpawnOrder[]) => void,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const poll = async () => {
    if (stopped) return;
    try {
      const r = await apiGet<{ p1Orders: SpawnOrder[] | null; p2Orders: SpawnOrder[] | null }>(
        `/api/match/${matchId}/round/${round}`,
      );
      if (stopped) return;
      if (r.p1Orders && r.p2Orders) { onBoth(r.p1Orders, r.p2Orders); return; } // 도착했으면 폴링 종료
    } catch {
      // 일시적 오류는 다음 폴링에서 재시도
    }
    if (!stopped) timer = setTimeout(poll, ROUND_POLL_MS);
  };
  void poll();

  return () => { stopped = true; if (timer) clearTimeout(timer); };
}

/** 상대와 상태 해시가 어긋났는지 확인하기 위해 라운드 종료 시 남긴다 (§11.5). */
export async function submitStateHash(matchId: string, round: number, side: Side, hash: number) {
  await apiPost(`/api/match/${matchId}/hash`, { side, round, hash });
}

export function subscribeDesync(
  matchId: string, round: number, onMismatch: (p1: number, p2: number) => void,
): () => void {
  let stopped = false;
  const timer = setInterval(async () => {
    if (stopped) return;
    try {
      const r = await apiGet<{ p1Hash?: number; p2Hash?: number }>(
        `/api/match/${matchId}/round/${round}`,
      );
      if (r.p1Hash !== undefined && r.p2Hash !== undefined && r.p1Hash !== r.p2Hash) {
        onMismatch(r.p1Hash, r.p2Hash);
      }
    } catch { /* 무시 */ }
  }, ROUND_POLL_MS);
  return () => { stopped = true; clearInterval(timer); };
}

export async function reportMatchEnd(
  matchId: string, winner: 'P1' | 'P2' | 'DRAW', endReason: string,
): Promise<void> {
  await apiPost(`/api/match/${matchId}/end`, { winner, endReason });
}

/**
 * 접속 유지 신호. Worker 는 Durable Object 처럼 소켓 close 를 직접 관찰할 수
 * 없으므로(무료 플랜, REST 폴링), 여전히 "상대가 오래 안 보이면 안내만" 하는
 * 방식이다 — 이 부분은 Firebase 버전과 동일한 한계다.
 */
export async function pingPresence(matchId: string, side: Side): Promise<void> {
  await apiPost(`/api/match/${matchId}/presence`, { side });
}

export function subscribePresence(
  matchId: string, side: Side, onStale: (staleMs: number) => void,
): () => void {
  let stopped = false;
  const timer = setInterval(async () => {
    if (stopped) return;
    try {
      const r = await apiGet<{ staleMs: number | null; stale: boolean }>(
        `/api/match/${matchId}/presence?side=${side}`,
      );
      if (r.stale && r.staleMs !== null) onStale(r.staleMs);
    } catch { /* 무시 */ }
  }, C.PRESENCE_PING_SEC * 1000);
  return () => { stopped = true; clearInterval(timer); };
}
