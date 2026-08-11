import { doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { getFirebaseDb } from './app';
import * as C from '../../sim/constants';
import type { Side, SpawnOrder } from '../../sim/types';
import type { RoundDoc } from '../types';

const MATCHES = 'matches';

function roundRef(matchId: string, round: number) {
  return doc(getFirebaseDb(), MATCHES, matchId, 'rounds', String(round));
}

/**
 * 이번 라운드 내 소환 예약을 제출한다 (기획서 §11.3 Reserve 에 대응).
 * 실시간 구간에는 어떤 네트워크 요청도 없다 — 라운드 경계에서만 문서 하나를 쓴다.
 */
export async function submitRoundOrders(
  matchId: string, side: Side, round: number, orders: SpawnOrder[],
): Promise<void> {
  const field = side === 'P1' ? 'p1Orders' : 'p2Orders';
  const atField = side === 'P1' ? 'p1SubmittedAt' : 'p2SubmittedAt';
  await setDoc(
    roundRef(matchId, round),
    { round, [field]: orders, [atField]: serverTimestamp() },
    { merge: true },
  );
}

/** 양측 예약이 모두 도착하면 콜백에 전달한다. 구독 해제 함수를 반환한다. */
export function subscribeRound(
  matchId: string, round: number,
  onBoth: (p1: SpawnOrder[], p2: SpawnOrder[]) => void,
): () => void {
  return onSnapshot(roundRef(matchId, round), (snap) => {
    const data = snap.data() as RoundDoc | undefined;
    if (data?.p1Orders && data?.p2Orders) onBoth(data.p1Orders, data.p2Orders);
  });
}

/** 상대와 상태 해시가 어긋났는지 확인하기 위해 라운드 종료 시 남긴다 (§11.5). */
export async function submitStateHash(matchId: string, round: number, side: Side, hash: number) {
  const field = side === 'P1' ? 'p1Hash' : 'p2Hash';
  await setDoc(roundRef(matchId, round), { [field]: hash }, { merge: true });
}

export function subscribeDesync(
  matchId: string, round: number, onMismatch: (p1: number, p2: number) => void,
): () => void {
  return onSnapshot(roundRef(matchId, round), (snap) => {
    const data = snap.data() as RoundDoc | undefined;
    if (data?.p1Hash !== undefined && data?.p2Hash !== undefined && data.p1Hash !== data.p2Hash) {
      onMismatch(data.p1Hash, data.p2Hash);
    }
  });
}

export async function reportMatchEnd(
  matchId: string, winner: 'P1' | 'P2' | 'DRAW', endReason: string,
): Promise<void> {
  await updateDoc(doc(getFirebaseDb(), MATCHES, matchId), { status: 'ended', winner, endReason });
}

/**
 * 최소 접속 유지 신호 (§11.5 재접속 유예의 기반).
 * Cloud Functions 없이는 서버가 끊김을 감지해 강제로 몰수패를 선언할 수 없으므로,
 * 상대 쪽에서 이 타임스탬프가 오래됐다고 판단되면 클라이언트가 직접 안내만 한다.
 */
export async function pingPresence(matchId: string, side: Side): Promise<void> {
  await setDoc(
    doc(getFirebaseDb(), MATCHES, matchId, 'presence', side),
    { at: serverTimestamp() },
    { merge: true },
  );
}

export function subscribePresence(
  matchId: string, side: Side, onStale: (staleMs: number) => void,
): () => void {
  return onSnapshot(doc(getFirebaseDb(), MATCHES, matchId, 'presence', side), (snap) => {
    const at = snap.data()?.at as { toMillis?: () => number } | undefined;
    if (!at?.toMillis) return;
    const staleMs = Date.now() - at.toMillis();
    if (staleMs > C.RECONNECT_GRACE_SEC * 1000) onStale(staleMs);
  });
}
