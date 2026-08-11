import { BUILD, type BuildKey } from '../sim/builds';
import { assemble } from '../sim/assemble';
import type { PerkId, PresetResolved } from '../sim/types';

export type AiPattern = 'TURTLE' | 'RUSH' | 'ARTILLERY' | 'AIR' | 'ADAPTIVE';

export interface AiOpponent {
  id: string;
  name: string;
  rating: number;
  pattern: AiPattern;
  /** 한 줄 소개 — 매칭 화면에 표시 */
  tagline: string;
  /** 덱 6종 (BuildKey) */
  deck: BuildKey[];
  /** 고정 퍽 — 플레이스타일에 맞춰 배정 */
  perk: PerkId;
  wins: number;
  draws: number;
  losses: number;
}

/**
 * 가상 플레이어 5인. 각자 고정 덱 + 고정 행동 패턴을 갖는다.
 * 온라인 전환 시 이 파일만 제거하고 실제 매칭으로 대체한다.
 */
export const OPPONENTS: AiOpponent[] = [
  {
    id: 'ai_scrap', name: '고철', rating: 850, pattern: 'TURTLE',
    tagline: '벽을 세우고 기다린다. 절대 먼저 나오지 않는다.',
    deck: ['wall', 'lightInf', 'heavyInf', 'turret', 'aaScreen', 'artillery'],
    perk: 'FORTRESS',
    wins: 14, draws: 3, losses: 21,
  },
  {
    id: 'ai_gale', name: '질풍', rating: 960, pattern: 'RUSH',
    tagline: '방어는 사치다. 첫 30초에 모든 것을 건다.',
    deck: ['rusher', 'lightInf', 'rapid', 'charger', 'wall', 'aaScreen'],
    perk: 'SPEED_BOOST',
    wins: 27, draws: 2, losses: 24,
  },
  {
    id: 'ai_barrage', name: '포화', rating: 1060, pattern: 'ARTILLERY',
    tagline: '막고, 긁고, 또 막는다. 사거리 100의 인내심.',
    deck: ['wall', 'artillery', 'longArty', 'turret', 'aaScreen', 'lightInf'],
    perk: 'RANGE_BOOST',
    wins: 38, draws: 4, losses: 26,
  },
  {
    id: 'ai_sky', name: '창공', rating: 1150, pattern: 'AIR',
    tagline: '지상은 신경 쓰지 않는다. 하늘이 비어 있다면.',
    deck: ['bomber', 'aaScreen', 'wall', 'lightInf', 'rusher', 'artillery'],
    perk: 'AIRSTRIKE',
    wins: 45, draws: 3, losses: 24,
  },
  {
    id: 'ai_marshal', name: '총사령관', rating: 1280, pattern: 'ADAPTIVE',
    tagline: '전장을 읽는다. 당신이 무엇을 빼먹었는지 알고 있다.',
    deck: ['wall', 'lightInf', 'charger', 'aaScreen', 'artillery', 'bomber'],
    perk: 'NULLIFY',
    wins: 61, draws: 5, losses: 19,
  },
];

export function resolveAiDeck(o: AiOpponent): PresetResolved[] {
  return o.deck.map((k, i) => {
    const p = BUILD[k]();
    return assemble({ ...p, id: `${o.id}_${i}` });
  });
}

/** 플레이어 레이팅에 가까운 상대 중 하나를 고른다 */
export function pickOpponent(playerRating: number, rand: () => number): AiOpponent {
  const sorted = [...OPPONENTS].sort(
    (a, b) => Math.abs(a.rating - playerRating) - Math.abs(b.rating - playerRating),
  );
  const pool = sorted.slice(0, 2);
  return pool[Math.floor(rand() * pool.length) % pool.length];
}

export function opponentById(id: string): AiOpponent | undefined {
  return OPPONENTS.find((o) => o.id === id);
}
