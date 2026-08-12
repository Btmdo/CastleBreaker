import { rngNext } from '../../src/sim/rng';
import type { OnlinePlayerInfo } from '../../src/backend/types';
import { candidateQueue, claimQueuePair, createMatchRow, parseQueueRow } from './db';

function seedFrom(a: string, b: string): number {
  let s = (Date.now() & 0xffffffff) >>> 0;
  for (const ch of a + '|' + b) s = rngNext(s ^ ch.charCodeAt(0));
  return s || 1;
}

/**
 * 서버사이드 매칭 시도. Worker 요청 핸들러 자체가 서버 코드이므로 Durable
 * Objects 없이도 페어링을 여기서 직접 authoritative 하게 결정한다 — Firebase
 * 버전에서 "Cloud Functions 없이는 불가능"이라 문서화했던 제약이 여기서 해소된다.
 *
 * 동시에 두 요청이 같은 두 uid 를 매칭하려 들 수 있으므로, 실제 확정은
 * `claimQueuePair`의 조건부 UPDATE 하나로만 이뤄진다 — 그 UPDATE 가 두 행을
 * 모두 갱신한 요청만 매치를 생성한다.
 */
export async function attemptMatch(
  db: D1Database, myInfo: OnlinePlayerInfo,
): Promise<string | null> {
  const candidates = await candidateQueue(db, myInfo.uid);
  if (candidates.length === 0) return null;

  let best = candidates[0];
  let bestDiff = Math.abs(best.rating - myInfo.rating);
  for (const c of candidates) {
    const diff = Math.abs(c.rating - myInfo.rating);
    if (diff < bestDiff) { best = c; bestDiff = diff; }
  }

  const matchId = crypto.randomUUID();
  const claimed = await claimQueuePair(db, myInfo.uid, best.uid, matchId);
  if (!claimed) return null; // 다른 요청이 먼저 이 후보를 채갔다 — 다음 폴링에서 재시도

  const opponent = parseQueueRow(best);
  await createMatchRow(db, matchId, seedFrom(myInfo.uid, opponent.uid), myInfo, opponent);
  return matchId;
}
