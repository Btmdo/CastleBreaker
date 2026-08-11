import {
  collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query,
  runTransaction, serverTimestamp, setDoc, where,
} from 'firebase/firestore';
import { getFirebaseDb } from './app';
import { rngNext } from '../../sim/rng';
import type { MatchFound, MatchDoc, OnlinePlayerInfo } from '../types';

const QUEUE = 'queue';
const MATCHES = 'matches';

/** 대기열에 가까운 레이팅 상대가 있으면 잡아온다. 없으면 undefined. */
async function findCandidate(myUid: string, myRating: number): Promise<string | undefined> {
  const snap = await getDocs(query(collection(getFirebaseDb(), QUEUE), orderBy('rating', 'asc')));
  let best: string | undefined;
  let bestDiff = Infinity;
  snap.forEach((d) => {
    if (d.id === myUid) return;
    const diff = Math.abs((d.data().rating as number) - myRating);
    if (diff < bestDiff) { bestDiff = diff; best = d.id; }
  });
  return best;
}

function seedFrom(a: string, b: string): number {
  let s = (Date.now() & 0xffffffff) >>> 0;
  for (const ch of a + '|' + b) s = rngNext(s ^ ch.charCodeAt(0));
  return s || 1;
}

/**
 * 대기열 등록 + 매칭 시도.
 *
 * ★ 임시 방편: Cloud Functions 가 아직 없어 매칭 성사를 클라이언트가 트랜잭션으로
 * 직접 처리한다 (uid 오름차순인 쪽만 매치 문서를 생성해 중복 생성을 막는다).
 * 신뢰된 소수 인원 대상 프로토타입이라 허용 가능한 절충이며, 나중에 서버 권위
 * 매칭(Cloud Function)으로 교체하면 이 파일의 findCandidate/시도 로직만 들어내면 된다.
 */
export class MatchmakingSession {
  private stopped = false;
  private unsubQueue: (() => void) | null = null;
  private unsubMatchA: (() => void) | null = null;
  private unsubMatchB: (() => void) | null = null;

  constructor(private me: OnlinePlayerInfo) {}

  async start(onFound: (m: MatchFound) => void): Promise<void> {
    const db = getFirebaseDb();
    await setDoc(doc(db, QUEUE, this.me.uid), {
      uid: this.me.uid,
      displayName: this.me.displayName,
      rating: this.me.rating,
      bio: this.me.bio,
      perk: this.me.perk,
      deck: this.me.deck,
      joinedAt: serverTimestamp(),
    });

    const resolveOnce = (matchId: string, data: MatchDoc) => {
      if (this.stopped) return;
      this.stopped = true;
      this.cleanupListeners();
      const side: 'P1' | 'P2' = data.p1.uid === this.me.uid ? 'P1' : 'P2';
      const opponent = side === 'P1' ? data.p2 : data.p1;
      onFound({ matchId, side, seed: data.seed, me: this.me, opponent });
    };

    // 상대가 먼저 매치를 만든 경우를 감지한다 (내가 p1 이거나 p2 인 문서)
    this.unsubMatchA = onSnapshot(
      query(collection(db, MATCHES), where('p1.uid', '==', this.me.uid)),
      (qs) => qs.forEach((d) => resolveOnce(d.id, d.data() as MatchDoc)),
    );
    this.unsubMatchB = onSnapshot(
      query(collection(db, MATCHES), where('p2.uid', '==', this.me.uid)),
      (qs) => qs.forEach((d) => resolveOnce(d.id, d.data() as MatchDoc)),
    );

    // 대기열 변동을 관찰하며 스스로 매칭을 시도한다
    this.unsubQueue = onSnapshot(collection(db, QUEUE), () => {
      void this.tryMatch();
    });
    void this.tryMatch();
  }

  private async tryMatch(): Promise<void> {
    if (this.stopped) return;
    const db = getFirebaseDb();
    const candidate = await findCandidate(this.me.uid, this.me.rating);
    if (!candidate || this.stopped) return;
    // 결정론적 타이브레이크 — uid 가 더 작은 쪽만 매치를 생성한다
    if (this.me.uid > candidate) return;

    try {
      const matchId = `${this.me.uid}_${candidate}_${Date.now()}`;
      await runTransaction(db, async (tx) => {
        const meRef = doc(db, QUEUE, this.me.uid);
        const themRef = doc(db, QUEUE, candidate);
        const [meSnap, themSnap] = await Promise.all([tx.get(meRef), tx.get(themRef)]);
        if (!meSnap.exists() || !themSnap.exists()) throw new Error('queue-gone');

        const them = themSnap.data();
        const matchDoc: MatchDoc = {
          seed: seedFrom(this.me.uid, candidate),
          createdAt: Date.now(),
          status: 'active',
          p1: this.me,
          p2: {
            uid: them.uid, displayName: them.displayName, rating: them.rating,
            bio: them.bio, perk: them.perk, deck: them.deck,
          },
        };
        tx.set(doc(db, MATCHES, matchId), matchDoc);
        tx.delete(meRef);
        tx.delete(themRef);
      });
    } catch {
      // 다른 클라이언트가 먼저 잡아갔거나 대기열에서 빠짐 — 다음 스냅샷에서 재시도
    }
  }

  private cleanupListeners() {
    this.unsubQueue?.(); this.unsubQueue = null;
    this.unsubMatchA?.(); this.unsubMatchA = null;
    this.unsubMatchB?.(); this.unsubMatchB = null;
  }

  async cancel(): Promise<void> {
    this.stopped = true;
    this.cleanupListeners();
    try { await deleteDoc(doc(getFirebaseDb(), QUEUE, this.me.uid)); } catch { /* 이미 지워졌으면 무시 */ }
  }
}
