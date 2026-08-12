import type { PerkId, PlayerProfile, SpawnOrder } from '../../src/sim/types';
import type { OnlinePlayerInfo } from '../../src/backend/types';
import * as C from '../../src/sim/constants';

// ─────────────────────────────────────────────────────────────
// players
// ─────────────────────────────────────────────────────────────

interface PlayerRow {
  uid: string;
  display_name: string;
  rating: number;
  wins: number;
  draws: number;
  losses: number;
  tutorial_seen: number;
  perk: string | null;
  bio: string;
  active_deck_id: string | null;
  presets_json: string;
  decks_json: string;
  created_at: number;
  last_seen_at: number;
}

function rowToProfile(r: PlayerRow): PlayerProfile {
  return {
    name: r.uid,
    displayName: r.display_name,
    rating: r.rating,
    wins: r.wins,
    draws: r.draws,
    losses: r.losses,
    tutorialSeen: !!r.tutorial_seen,
    presets: JSON.parse(r.presets_json),
    decks: JSON.parse(r.decks_json),
    activeDeckId: r.active_deck_id,
    perk: (r.perk as PerkId | null) ?? null,
    bio: r.bio,
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
  };
}

export async function getPlayer(db: D1Database, uid: string): Promise<PlayerProfile | null> {
  const row = await db.prepare('SELECT * FROM players WHERE uid = ?').bind(uid).first<PlayerRow>();
  return row ? rowToProfile(row) : null;
}

export async function insertPlayer(db: D1Database, profile: PlayerProfile): Promise<void> {
  await db.prepare(
    `INSERT INTO players
      (uid, display_name, rating, wins, draws, losses, tutorial_seen, perk, bio,
       active_deck_id, presets_json, decks_json, created_at, last_seen_at)
     VALUES (?, ?, ?, 0, 0, 0, 0, NULL, '', ?, ?, ?, ?, ?)`,
  ).bind(
    profile.name, profile.displayName, profile.rating,
    profile.activeDeckId, JSON.stringify(profile.presets), JSON.stringify(profile.decks),
    profile.createdAt, profile.lastSeenAt,
  ).run();
}

/** 프로필 전체 upsert — 격납고에서 저장할 때마다 통째로 덮어쓴다 (Firestore setDoc(merge) 와 동일한 사용처) */
export async function upsertPlayer(db: D1Database, uid: string, profile: PlayerProfile): Promise<void> {
  await db.prepare(
    `UPDATE players SET
       display_name = ?, rating = ?, wins = ?, draws = ?, losses = ?,
       tutorial_seen = ?, perk = ?, bio = ?, active_deck_id = ?,
       presets_json = ?, decks_json = ?, last_seen_at = ?
     WHERE uid = ?`,
  ).bind(
    profile.displayName, profile.rating, profile.wins, profile.draws, profile.losses,
    profile.tutorialSeen ? 1 : 0, profile.perk, profile.bio, profile.activeDeckId,
    JSON.stringify(profile.presets), JSON.stringify(profile.decks), Date.now(),
    uid,
  ).run();
}

export interface LeaderRowRaw {
  display_name: string; rating: number; wins: number; draws: number; losses: number; uid: string;
}

export async function topPlayers(db: D1Database, limit: number): Promise<LeaderRowRaw[]> {
  const { results } = await db.prepare(
    'SELECT uid, display_name, rating, wins, draws, losses FROM players ORDER BY rating DESC LIMIT ?',
  ).bind(limit).all<LeaderRowRaw>();
  return results;
}

// ─────────────────────────────────────────────────────────────
// queue
// ─────────────────────────────────────────────────────────────

interface QueueRow {
  uid: string; display_name: string; rating: number; bio: string;
  perk: string | null; deck_json: string; joined_at: number; matched_match_id: string | null;
}

export async function joinQueue(db: D1Database, info: OnlinePlayerInfo): Promise<void> {
  await db.prepare(
    `INSERT INTO queue (uid, display_name, rating, bio, perk, deck_json, joined_at, matched_match_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(uid) DO UPDATE SET
       display_name = excluded.display_name, rating = excluded.rating, bio = excluded.bio,
       perk = excluded.perk, deck_json = excluded.deck_json, joined_at = excluded.joined_at,
       matched_match_id = NULL`,
  ).bind(
    info.uid, info.displayName, info.rating, info.bio, info.perk,
    JSON.stringify(info.deck), Date.now(),
  ).run();
}

export async function leaveQueue(db: D1Database, uid: string): Promise<void> {
  await db.prepare('DELETE FROM queue WHERE uid = ?').bind(uid).run();
}

/** 나보다 먼저 매칭된 상태라면(다른 클라이언트가 나를 짝지어줬다면) matchId 를 반환 */
export async function myQueueMatch(db: D1Database, uid: string): Promise<string | null> {
  const row = await db.prepare('SELECT matched_match_id FROM queue WHERE uid = ?')
    .bind(uid).first<{ matched_match_id: string | null }>();
  return row?.matched_match_id ?? null;
}

/** 레이팅이 가장 가까운 대기 중 상대 후보 목록 (자기 자신·이미 매칭된 사람 제외) */
export async function candidateQueue(db: D1Database, excludeUid: string): Promise<QueueRow[]> {
  const { results } = await db.prepare(
    'SELECT * FROM queue WHERE uid != ? AND matched_match_id IS NULL ORDER BY joined_at ASC',
  ).bind(excludeUid).all<QueueRow>();
  return results;
}

/**
 * 두 대기열 행을 원자적으로 매칭 확정한다.
 * 조건부 UPDATE(WHERE matched_match_id IS NULL)가 0행이면 이미 다른 요청이
 * 선점한 것이므로 false 를 반환해 재시도하게 한다 — Durable Object 없이도
 * 서버가 직접 이중 매칭을 막는 지점.
 */
export async function claimQueuePair(
  db: D1Database, uidA: string, uidB: string, matchId: string,
): Promise<boolean> {
  const res = await db.prepare(
    'UPDATE queue SET matched_match_id = ? WHERE uid IN (?, ?) AND matched_match_id IS NULL',
  ).bind(matchId, uidA, uidB).run();
  return (res.meta.changes ?? 0) === 2;
}

export function parseQueueRow(r: QueueRow): OnlinePlayerInfo {
  return {
    uid: r.uid, displayName: r.display_name, rating: r.rating, bio: r.bio,
    perk: (r.perk as PerkId | null) ?? null, deck: JSON.parse(r.deck_json),
  };
}

// ─────────────────────────────────────────────────────────────
// matches
// ─────────────────────────────────────────────────────────────

interface MatchRow {
  id: string; seed: number; created_at: number; status: string;
  p1_uid: string; p2_uid: string; p1_json: string; p2_json: string;
  winner: string | null; end_reason: string | null;
  p1_last_seen: number | null; p2_last_seen: number | null;
}

export async function createMatchRow(
  db: D1Database, id: string, seed: number, p1: OnlinePlayerInfo, p2: OnlinePlayerInfo,
): Promise<void> {
  await db.prepare(
    `INSERT INTO matches (id, seed, created_at, status, p1_uid, p2_uid, p1_json, p2_json)
     VALUES (?, ?, ?, 'active', ?, ?, ?, ?)`,
  ).bind(id, seed, Date.now(), p1.uid, p2.uid, JSON.stringify(p1), JSON.stringify(p2)).run();
}

export async function getMatch(db: D1Database, id: string): Promise<MatchRow | null> {
  return db.prepare('SELECT * FROM matches WHERE id = ?').bind(id).first<MatchRow>();
}

/** 내 uid 가 참가한, 아직 이 클라이언트가 모르는 매치를 찾는다 (상대가 먼저 매칭을 만든 경우) */
export async function findMatchForUid(db: D1Database, uid: string): Promise<MatchRow | null> {
  return db.prepare('SELECT * FROM matches WHERE p1_uid = ? OR p2_uid = ? ORDER BY created_at DESC LIMIT 1')
    .bind(uid, uid).first<MatchRow>();
}

export function matchRowToInfo(r: MatchRow): { p1: OnlinePlayerInfo; p2: OnlinePlayerInfo } {
  return { p1: JSON.parse(r.p1_json), p2: JSON.parse(r.p2_json) };
}

export async function endMatch(
  db: D1Database, id: string, winner: string, endReason: string,
): Promise<void> {
  await db.prepare('UPDATE matches SET status = ?, winner = ?, end_reason = ? WHERE id = ?')
    .bind('ended', winner, endReason, id).run();
}

export async function pingPresence(db: D1Database, id: string, side: 'P1' | 'P2'): Promise<void> {
  const col = side === 'P1' ? 'p1_last_seen' : 'p2_last_seen';
  await db.prepare(`UPDATE matches SET ${col} = ? WHERE id = ?`).bind(Date.now(), id).run();
}

/**
 * `side` 본인의 마지막 접속 시각을 조회한다.
 * 호출부(OnlineBattle.tsx)는 `subscribePresence(matchId, foeSide, cb)` 형태로
 * "상대 쪽 side" 를 인자로 넘겨 상대의 presence 를 감시하므로, 여기서는
 * 인자로 받은 side 그대로의 값을 반환해야 한다 (반대쪽이 아니다).
 */
export async function getPresence(
  db: D1Database, id: string, side: 'P1' | 'P2',
): Promise<number | null> {
  const row = await getMatch(db, id);
  if (!row) return null;
  return side === 'P1' ? row.p1_last_seen : row.p2_last_seen;
}

// ─────────────────────────────────────────────────────────────
// match_rounds
// ─────────────────────────────────────────────────────────────

interface RoundRow {
  match_id: string; round: number;
  p1_orders_json: string | null; p2_orders_json: string | null;
  p1_hash: number | null; p2_hash: number | null;
}

export async function submitOrders(
  db: D1Database, matchId: string, round: number, side: 'P1' | 'P2', orders: SpawnOrder[],
): Promise<void> {
  const col = side === 'P1' ? 'p1_orders_json' : 'p2_orders_json';
  await db.prepare(
    `INSERT INTO match_rounds (match_id, round, ${col}) VALUES (?, ?, ?)
     ON CONFLICT(match_id, round) DO UPDATE SET ${col} = excluded.${col}`,
  ).bind(matchId, round, JSON.stringify(orders)).run();
}

export async function getRound(
  db: D1Database, matchId: string, round: number,
): Promise<{ p1Orders: SpawnOrder[] | null; p2Orders: SpawnOrder[] | null }> {
  const row = await db.prepare('SELECT * FROM match_rounds WHERE match_id = ? AND round = ?')
    .bind(matchId, round).first<RoundRow>();
  return {
    p1Orders: row?.p1_orders_json ? JSON.parse(row.p1_orders_json) : null,
    p2Orders: row?.p2_orders_json ? JSON.parse(row.p2_orders_json) : null,
  };
}

export async function submitHash(
  db: D1Database, matchId: string, round: number, side: 'P1' | 'P2', hash: number,
): Promise<void> {
  const col = side === 'P1' ? 'p1_hash' : 'p2_hash';
  await db.prepare(
    `INSERT INTO match_rounds (match_id, round, ${col}) VALUES (?, ?, ?)
     ON CONFLICT(match_id, round) DO UPDATE SET ${col} = excluded.${col}`,
  ).bind(matchId, round, hash).run();
}

export const RECONNECT_GRACE_MS = C.RECONNECT_GRACE_SEC * 1000;
