-- CASTLE BREAKER Cloudflare 백엔드 초기 스키마.
-- PlayerProfile(sim/types.ts)의 presets/decks 는 중첩 구조라 JSON 문자열로 저장한다.

CREATE TABLE players (
  uid TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 1000,
  wins INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  tutorial_seen INTEGER NOT NULL DEFAULT 0,
  perk TEXT,
  bio TEXT NOT NULL DEFAULT '',
  active_deck_id TEXT,
  presets_json TEXT NOT NULL DEFAULT '[]',
  decks_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE INDEX idx_players_rating ON players (rating DESC);

-- 매칭 대기열. matched_match_id 가 채워지면 그 클라이언트는 매치를 찾은 것이다.
CREATE TABLE queue (
  uid TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  rating INTEGER NOT NULL,
  bio TEXT NOT NULL,
  perk TEXT,
  deck_json TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  matched_match_id TEXT
);

CREATE TABLE matches (
  id TEXT PRIMARY KEY,
  seed INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  p1_uid TEXT NOT NULL,
  p2_uid TEXT NOT NULL,
  p1_json TEXT NOT NULL,
  p2_json TEXT NOT NULL,
  winner TEXT,
  end_reason TEXT,
  p1_last_seen INTEGER,
  p2_last_seen INTEGER
);

CREATE INDEX idx_matches_p1 ON matches (p1_uid);
CREATE INDEX idx_matches_p2 ON matches (p2_uid);

CREATE TABLE match_rounds (
  match_id TEXT NOT NULL,
  round INTEGER NOT NULL,
  p1_orders_json TEXT,
  p2_orders_json TEXT,
  p1_hash INTEGER,
  p2_hash INTEGER,
  PRIMARY KEY (match_id, round)
);
