import * as C from '../../src/sim/constants';
import { bonusPresets, starterPresets } from '../../src/sim/builds';
import type { PlayerProfile, SpawnOrder } from '../../src/sim/types';
import type { OnlinePlayerInfo } from '../../src/backend/types';
import { corsPreflight, err, json } from './cors';
import {
  candidateQueue, endMatch, getMatch, getPlayer, getRound,
  getPresence, insertPlayer, joinQueue, leaveQueue, matchRowToInfo, myQueueMatch,
  pingPresence, RECONNECT_GRACE_MS, submitHash, submitOrders, topPlayers, upsertPlayer,
} from './db';
import { attemptMatch } from './matchmaking';

export interface Env {
  DB: D1Database;
}

function sideOf(uid: string, row: { p1_uid: string; p2_uid: string }): 'P1' | 'P2' | null {
  if (row.p1_uid === uid) return 'P1';
  if (row.p2_uid === uid) return 'P2';
  return null;
}

async function readJson<T>(req: Request): Promise<T> {
  return req.json() as Promise<T>;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return corsPreflight();

    const url = new URL(req.url);
    const { pathname } = url;
    const db = env.DB;

    try {
      // ── 프로필 ──
      if (pathname === '/api/identify' && req.method === 'POST') {
        const { uid, displayName } = await readJson<{ uid: string; displayName: string }>(req);
        if (!uid || !displayName) return err('uid, displayName 필요');

        let profile = await getPlayer(db, uid);
        let isNew = false;
        if (!profile) {
          isNew = true;
          const now = Date.now();
          // 로컬 백엔드(storage/local.ts identify())와 동일하게 대표 빌드로 채워서 시작한다
          const presets = [...starterPresets(), ...bonusPresets()];
          profile = {
            name: uid, displayName, rating: C.RATING_START,
            wins: 0, draws: 0, losses: 0, tutorialSeen: false,
            presets,
            decks: [{ id: 'deck_1', name: '기본 편성', slots: presets.slice(0, C.DECK_SIZE).map((p) => p.id) }],
            activeDeckId: 'deck_1', perk: null, bio: '',
            createdAt: now, lastSeenAt: now,
          } satisfies PlayerProfile;
          await insertPlayer(db, profile);
        }
        return json({ profile, isNew });
      }

      if (pathname.startsWith('/api/profile/') && req.method === 'PUT') {
        const uid = pathname.slice('/api/profile/'.length);
        const profile = await readJson<PlayerProfile>(req);
        await upsertPlayer(db, uid, profile);
        return json({ ok: true });
      }

      // ── 리더보드 ──
      if (pathname === '/api/leaderboard' && req.method === 'GET') {
        const uid = url.searchParams.get('uid') ?? '';
        const rows = await topPlayers(db, C.LEADERBOARD_SIZE);
        return json(rows.map((r, i) => ({
          rank: i + 1, displayName: r.display_name, rating: r.rating,
          wins: r.wins, draws: r.draws, losses: r.losses, isMe: r.uid === uid,
        })));
      }

      // ── 매칭 대기열 ──
      if (pathname === '/api/queue/join' && req.method === 'POST') {
        const info = await readJson<OnlinePlayerInfo>(req);
        await joinQueue(db, info);
        return json({ ok: true });
      }

      if (pathname === '/api/queue/leave' && req.method === 'POST') {
        const { uid } = await readJson<{ uid: string }>(req);
        await leaveQueue(db, uid);
        return json({ ok: true });
      }

      // 폴링: 이미 매칭됐으면 그 매치를, 아니면 서버가 그 자리에서 매칭을 시도한다
      if (pathname === '/api/queue/poll' && req.method === 'GET') {
        const uid = url.searchParams.get('uid') ?? '';
        if (!uid) return err('uid 필요');

        let matchId = await myQueueMatch(db, uid);
        if (!matchId) {
          const candidates = await candidateQueue(db, uid);
          // 내 큐 정보 자체를 다시 읽어 attemptMatch 에 넘긴다
          const myRow = (await db.prepare('SELECT * FROM queue WHERE uid = ?').bind(uid).first()) as
            | { uid: string; display_name: string; rating: number; bio: string; perk: string | null; deck_json: string }
            | null;
          if (!myRow) return err('대기열에 없습니다. 먼저 join 하세요', 404);
          if (candidates.length > 0) {
            const myInfo: OnlinePlayerInfo = {
              uid: myRow.uid, displayName: myRow.display_name, rating: myRow.rating,
              bio: myRow.bio, perk: myRow.perk as OnlinePlayerInfo['perk'], deck: JSON.parse(myRow.deck_json),
            };
            matchId = await attemptMatch(db, myInfo);
          }
        }
        if (!matchId) return json({ found: false });

        const row = await getMatch(db, matchId);
        if (!row) return json({ found: false });
        const side = sideOf(uid, row);
        if (!side) return err('매치에 참가하지 않았습니다', 403);
        const { p1, p2 } = matchRowToInfo(row);
        const me = side === 'P1' ? p1 : p2;
        const opponent = side === 'P1' ? p2 : p1;
        return json({ found: true, matchId, side, seed: row.seed, me, opponent });
      }

      // ── 매치 라운드 동기화 ──
      const roundMatch = pathname.match(/^\/api\/match\/([^/]+)\/orders$/);
      if (roundMatch && req.method === 'POST') {
        const matchId = roundMatch[1];
        const { side, round, orders } = await readJson<{ side: 'P1' | 'P2'; round: number; orders: SpawnOrder[] }>(req);
        await submitOrders(db, matchId, round, side, orders);
        return json({ ok: true });
      }

      const getRoundMatch = pathname.match(/^\/api\/match\/([^/]+)\/round\/(\d+)$/);
      if (getRoundMatch && req.method === 'GET') {
        const [, matchId, roundStr] = getRoundMatch;
        const data = await getRound(db, matchId, Number(roundStr));
        return json(data);
      }

      const hashMatch = pathname.match(/^\/api\/match\/([^/]+)\/hash$/);
      if (hashMatch && req.method === 'POST') {
        const matchId = hashMatch[1];
        const { side, round, hash } = await readJson<{ side: 'P1' | 'P2'; round: number; hash: number }>(req);
        await submitHash(db, matchId, round, side, hash);
        return json({ ok: true });
      }

      const presenceMatch = pathname.match(/^\/api\/match\/([^/]+)\/presence$/);
      if (presenceMatch && req.method === 'POST') {
        const matchId = presenceMatch[1];
        const { side } = await readJson<{ side: 'P1' | 'P2' }>(req);
        await pingPresence(db, matchId, side);
        return json({ ok: true });
      }
      if (presenceMatch && req.method === 'GET') {
        const matchId = presenceMatch[1];
        const side = (url.searchParams.get('side') ?? 'P1') as 'P1' | 'P2';
        const lastSeen = await getPresence(db, matchId, side);
        const staleMs = lastSeen ? Date.now() - lastSeen : null;
        return json({ staleMs, stale: staleMs !== null && staleMs > RECONNECT_GRACE_MS });
      }

      const endMatchRe = pathname.match(/^\/api\/match\/([^/]+)\/end$/);
      if (endMatchRe && req.method === 'POST') {
        const matchId = endMatchRe[1];
        const { winner, endReason } = await readJson<{ winner: string; endReason: string }>(req);
        await endMatch(db, matchId, winner, endReason);
        return json({ ok: true });
      }

      return err('not found', 404);
    } catch (e) {
      return err((e as Error).message ?? 'internal error', 500);
    }
  },
};
