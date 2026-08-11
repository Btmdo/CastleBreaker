import type { PerkId, PresetResolved, SpawnOrder } from '../sim/types';

/**
 * 온라인 상대 정보 — AI(`AiOpponent`)와 실제 플레이어를 화면에서 동일하게
 * 다루기 위한 공통 셰이프. 매칭 화면·전투 HUD 는 이 타입만 알면 된다.
 */
export interface OnlinePlayerInfo {
  uid: string;
  displayName: string;
  rating: number;
  bio: string;
  perk: PerkId | null;
  /** 매치 시작 시점의 덱 6종 스냅샷 (조립 완료 상태) */
  deck: PresetResolved[];
}

export interface MatchFound {
  matchId: string;
  side: 'P1' | 'P2';
  seed: number;
  me: OnlinePlayerInfo;
  opponent: OnlinePlayerInfo;
}

/** Firestore 라운드 문서 — 기획서 §11.3 Reserve/RoundStart 에 대응 */
export interface RoundDoc {
  round: number;
  p1Orders?: SpawnOrder[];
  p2Orders?: SpawnOrder[];
  p1SubmittedAt?: number;
  p2SubmittedAt?: number;
  /** 결정론 검증용 — 상대와 상태 해시가 다르면 콘솔에 경고만 남긴다 (§11.5, 서버 권위 없이는 자동 교정 불가) */
  p1Hash?: number;
  p2Hash?: number;
}

export type MatchStatus = 'active' | 'ended';

export interface MatchDoc {
  seed: number;
  createdAt: number;
  status: MatchStatus;
  p1: OnlinePlayerInfo;
  p2: OnlinePlayerInfo;
  winner?: 'P1' | 'P2' | 'DRAW';
  endReason?: string;
}
