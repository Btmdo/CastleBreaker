/**
 * localStorage 영속화.
 * 온라인 전환 시 이 파일의 함수 시그니처를 그대로 서버 호출로 바꾸면 된다.
 * (기획서 §11.3 의 Identify / PresetSave / DeckSave / LeaderboardGet 에 대응)
 */
import * as C from '../sim/constants';
import { bonusPresets, starterPresets } from '../sim/builds';
import type { PlayerProfile, Preset } from '../sim/types';
import { OPPONENTS } from '../ai/opponents';
import type { LeaderRow } from '../sim/types';

const KEY = 'castle-breaker/players/v1';

type Store = Record<string, PlayerProfile>;

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function save(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 용량 초과 등은 무시 — 프로토타입 */
  }
}

/** 이름 정규화 — 앞뒤 공백 제거 + 소문자. 오타로 인한 빈 계정 양산을 줄인다 */
export function normalizeName(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateName(raw: string): string | null {
  const t = raw.trim();
  if (t.length < C.NAME_MIN_LEN || t.length > C.NAME_MAX_LEN) {
    return `이름은 ${C.NAME_MIN_LEN}~${C.NAME_MAX_LEN}자여야 합니다`;
  }
  if (!C.NAME_PATTERN.test(t)) return '한글·영문·숫자만 쓸 수 있습니다';
  return null;
}

export interface IdentifyResult {
  profile: PlayerProfile;
  isNew: boolean;
}

/** 기획서 §12.3 — 이름 조회 후 존재하면 로드, 없으면 신규 생성 */
export function identify(raw: string): IdentifyResult {
  const key = normalizeName(raw);
  const store = load();
  const found = store[key];
  if (found) {
    found.lastSeenAt = Date.now();
    // 구버전 데이터 보정
    found.presets ??= [];
    found.decks ??= [];
    found.perk ??= null;
    found.bio ??= '';
    save(store);
    return { profile: found, isNew: false };
  }

  const presets = [...starterPresets(), ...bonusPresets()];
  const profile: PlayerProfile = {
    name: key,
    displayName: raw.trim(),
    rating: C.RATING_START,
    wins: 0, draws: 0, losses: 0,
    tutorialSeen: false,
    presets,
    decks: [{ id: 'deck_1', name: '기본 편성', slots: presets.slice(0, C.DECK_SIZE).map((p) => p.id) }],
    activeDeckId: 'deck_1',
    perk: null,
    bio: '',
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
  };
  store[key] = profile;
  save(store);
  return { profile, isNew: true };
}

export function persist(profile: PlayerProfile) {
  const store = load();
  store[profile.name] = { ...profile, lastSeenAt: Date.now() };
  save(store);
}

export function savePreset(profile: PlayerProfile, preset: Preset): PlayerProfile {
  const presets = profile.presets.slice();
  const i = presets.findIndex((p) => p.id === preset.id);
  if (i >= 0) presets[i] = preset;
  else if (presets.length < C.PRESET_SLOTS) presets.push(preset);
  const next = { ...profile, presets };
  persist(next);
  return next;
}

export function deletePreset(profile: PlayerProfile, presetId: string): PlayerProfile {
  const next: PlayerProfile = {
    ...profile,
    presets: profile.presets.filter((p) => p.id !== presetId),
    decks: profile.decks.map((d) => ({ ...d, slots: d.slots.filter((s) => s !== presetId) })),
  };
  persist(next);
  return next;
}

/**
 * 리더보드 — AI 5인 + 저장된 모든 로컬 플레이어.
 * 온라인 전환 시 서버 랭킹 조회로 대체된다.
 */
export function leaderboard(me: PlayerProfile): LeaderRow[] {
  const store = load();
  const humans = Object.values(store).map((p) => ({
    displayName: p.displayName, rating: p.rating,
    wins: p.wins, draws: p.draws, losses: p.losses,
    isMe: p.name === me.name,
  }));
  const ais = OPPONENTS.map((o) => ({
    displayName: o.name, rating: o.rating,
    wins: o.wins, draws: o.draws, losses: o.losses,
    isMe: false,
  }));
  return [...humans, ...ais]
    .sort((a, b) => b.rating - a.rating)
    .slice(0, C.LEADERBOARD_SIZE)
    .map((r, i) => ({ rank: i + 1, ...r }));
}
