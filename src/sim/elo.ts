import { ELO_K } from './constants';

/** 기획서 §12.5 — 표준 Elo. 제로섬이라 인플레이션이 없다. 로컬/온라인 백엔드가 공유한다. */
export function eloDelta(myRating: number, oppRating: number, score: 0 | 0.5 | 1): number {
  const expected = 1 / (1 + Math.pow(10, (oppRating - myRating) / 400));
  return Math.round(ELO_K * (score - expected));
}
