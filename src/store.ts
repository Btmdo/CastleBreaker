import { create } from 'zustand';
import type { AiOpponent } from './ai/opponents';
import type { MatchStats, PerkId, PlayerProfile, PresetResolved } from './sim/types';
import * as C from './sim/constants';
import { eloDelta } from './sim/elo';
import { identify as identifyLocal, persist } from './storage/local';
import { isCloudflareConfigured } from './backend/config';
import { getOrCreateUid } from './backend/cloudflare/identity';
import { identifyOnline, saveProfileOnline } from './backend/cloudflare/profile';
import type { MatchFound, OnlinePlayerInfo } from './backend/types';

export type Screen = 'MAIN' | 'IDENTIFY' | 'HANGAR' | 'MATCHING' | 'BATTLE';
/** 프로필이 어디에 저장되는가. Firebase 설정이 없으면 앱 전체가 'local' 로만 동작한다. */
export type BackendMode = 'local' | 'online';
/** 이번 대전 상대가 AI 인지 실제 플레이어인지 */
export type OpponentMode = 'ai' | 'online';

export interface BattleResult {
  outcome: 'win' | 'draw' | 'loss';
  reason: string;
  ratingBefore: number;
  ratingAfter: number;
  castleP1: number;
  castleP2: number;
  castleMaxP1: number;
  castleMaxP2: number;
  seconds: number;
  rounds: number;
  stats: MatchStats;
  myDeck: PresetResolved[];
  oppDeck: PresetResolved[];
  oppName: string;
  myPerk: PerkId | null;
  oppPerk: PerkId | null;
}

interface AppState {
  screen: Screen;
  profile: PlayerProfile | null;
  backendMode: BackendMode;
  /** 온라인 백엔드일 때의 uid (이 기기에 고정된 UUID). 로컬 백엔드에서는 null */
  uid: string | null;
  identifyBusy: boolean;
  identifyError: string | null;

  opponentMode: OpponentMode;
  opponent: AiOpponent | null;
  onlineMyInfo: OnlinePlayerInfo | null;
  onlineMatch: MatchFound | null;
  matchSeed: number;

  result: BattleResult | null;
  tutorialOpen: boolean;
  hangarTab: 'design' | 'deck' | 'perk' | 'rank';

  goMain: () => void;
  openIdentify: () => void;
  doIdentify: (name: string) => Promise<void>;
  setProfile: (p: PlayerProfile) => void;
  setHangarTab: (t: 'design' | 'deck' | 'perk' | 'rank') => void;
  openTutorial: () => void;
  closeTutorial: () => void;

  /** 기획서 §12.4 ② 편성 — AI 연습 출격 */
  sortie: (opp: AiOpponent, seed: number) => void;
  /** 온라인 매칭 화면으로 전환만 한다. 실제 매칭은 OnlineMatching 컴포넌트가 수행 */
  sortieOnline: (myInfo: OnlinePlayerInfo) => void;
  onlineMatchFound: (m: MatchFound) => void;

  beginBattle: () => void;
  finishBattle: (r: Omit<BattleResult, 'ratingBefore' | 'ratingAfter'>) => void;
  backToHangar: () => void;
}

export const useApp = create<AppState>((set, get) => ({
  screen: 'MAIN',
  profile: null,
  backendMode: 'local',
  uid: null,
  identifyBusy: false,
  identifyError: null,

  opponentMode: 'ai',
  opponent: null,
  onlineMyInfo: null,
  onlineMatch: null,
  matchSeed: 1,

  result: null,
  tutorialOpen: false,
  hangarTab: 'design',

  goMain: () => set({ screen: 'MAIN', opponent: null, onlineMatch: null, result: null }),
  openIdentify: () => set({ screen: 'IDENTIFY', identifyError: null }),

  /**
   * 기획서 §12.3 — 이름 조회 후 존재하면 로드, 없으면 신규 생성.
   * Cloudflare Worker 가 설정돼 있으면 온라인 백엔드(uid 기준)를, 아니면
   * 로컬(localStorage, 이름 기준)을 그대로 쓴다. 오프라인 프로토타입 동작은
   * 이 분기 이전과 완전히 동일하다.
   *
   * (`backend/firebase/*` 는 그대로 남아있지만 여기서 더 이상 참조하지 않는다 —
   * 실제 온라인 백엔드는 Cloudflare 로 교체됐다.)
   */
  doIdentify: async (name) => {
    set({ identifyBusy: true, identifyError: null });
    try {
      if (isCloudflareConfigured) {
        const uid = getOrCreateUid();
        const { profile, isNew } = await identifyOnline(uid, name.trim());
        set({
          profile, uid, backendMode: 'online',
          screen: 'HANGAR', hangarTab: 'design', identifyBusy: false,
          tutorialOpen: isNew || !profile.tutorialSeen,
        });
      } else {
        const { profile, isNew } = identifyLocal(name);
        set({
          profile, uid: null, backendMode: 'local',
          screen: 'HANGAR', hangarTab: 'design', identifyBusy: false,
          tutorialOpen: isNew || !profile.tutorialSeen,
        });
      }
    } catch (err) {
      set({ identifyBusy: false, identifyError: (err as Error).message || '접속에 실패했습니다' });
    }
  },

  setProfile: (p) => {
    set({ profile: p });
    const { backendMode, uid } = get();
    if (backendMode === 'online' && uid) void saveProfileOnline(uid, p);
    else persist(p);
  },

  setHangarTab: (t) => set({ hangarTab: t }),
  openTutorial: () => set({ tutorialOpen: true }),

  closeTutorial: () => {
    const p = get().profile;
    if (p && !p.tutorialSeen) {
      const next = { ...p, tutorialSeen: true };
      get().setProfile(next);
    }
    set({ tutorialOpen: false });
  },

  sortie: (opp, seed) => set({
    screen: 'MATCHING', opponentMode: 'ai', opponent: opp, onlineMatch: null,
    matchSeed: seed, result: null,
  }),

  sortieOnline: (myInfo) => set({
    screen: 'MATCHING', opponentMode: 'online', opponent: null,
    onlineMyInfo: myInfo, onlineMatch: null, result: null,
  }),

  onlineMatchFound: (m) => set({ onlineMatch: m, matchSeed: m.seed }),

  beginBattle: () => set({ screen: 'BATTLE' }),

  finishBattle: (r) => {
    const p = get().profile;
    const oppRating = get().opponentMode === 'ai' ? get().opponent?.rating : get().onlineMatch?.opponent.rating;
    if (!p || oppRating === undefined) return;

    const score = r.outcome === 'win' ? 1 : r.outcome === 'draw' ? 0.5 : 0;
    const before = p.rating;
    const after = Math.max(C.RATING_FLOOR, before + eloDelta(before, oppRating, score));
    const next: PlayerProfile = {
      ...p,
      rating: after,
      wins: p.wins + (r.outcome === 'win' ? 1 : 0),
      draws: p.draws + (r.outcome === 'draw' ? 1 : 0),
      losses: p.losses + (r.outcome === 'loss' ? 1 : 0),
    };
    get().setProfile(next);
    set({ result: { ...r, ratingBefore: before, ratingAfter: after } });
  },

  backToHangar: () => set({ screen: 'HANGAR', result: null, opponent: null, onlineMatch: null }),
}));
