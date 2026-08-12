import { QUEUE_POLL_MS } from '../config';
import type { MatchFound, OnlinePlayerInfo } from '../types';
import { apiGet, apiPost } from './http';

interface PollResult {
  found: boolean;
  matchId?: string;
  side?: 'P1' | 'P2';
  seed?: number;
  me?: OnlinePlayerInfo;
  opponent?: OnlinePlayerInfo;
}

/**
 * 대기열 등록 + 매칭 폴링.
 *
 * Firebase 버전과 달리 이번엔 **클라이언트 조정이 아니다** — 서버(Worker)가
 * `/api/queue/poll` 요청을 처리하는 그 자리에서 직접 페어링을 확정한다
 * (worker/src/matchmaking.ts 의 `attemptMatch`). 클라이언트는 그 결과를
 * 몇 초 간격으로 물어보기만 한다. Durable Objects 없이도 서버 권위가 성립한다.
 */
export class MatchmakingSession {
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private me: OnlinePlayerInfo) {}

  async start(onFound: (m: MatchFound) => void): Promise<void> {
    await apiPost('/api/queue/join', this.me);
    const poll = async () => {
      if (this.stopped) return;
      try {
        const r = await apiGet<PollResult>(`/api/queue/poll?uid=${encodeURIComponent(this.me.uid)}`);
        if (this.stopped) return;
        if (r.found && r.matchId && r.side && r.seed !== undefined && r.me && r.opponent) {
          this.stopped = true;
          onFound({ matchId: r.matchId, side: r.side, seed: r.seed, me: r.me, opponent: r.opponent });
          return;
        }
      } catch {
        // 일시적 네트워크 오류는 다음 폴링에서 재시도
      }
      if (!this.stopped) this.timer = setTimeout(poll, QUEUE_POLL_MS);
    };
    void poll();
  }

  async cancel(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    try { await apiPost('/api/queue/leave', { uid: this.me.uid }); } catch { /* 무시 */ }
  }
}
