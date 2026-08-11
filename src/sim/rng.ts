/**
 * 기획서 §9.6 — 결정론 난수 (xorshift32).
 * 상태를 숫자 하나로 들고 다녀 MatchState 직렬화가 가능하다.
 * 시뮬레이션 외부(렌더·이펙트·UI)에서는 절대 사용하지 않는다.
 */
export function rngNext(state: number): number {
  let x = state >>> 0;
  if (x === 0) x = 0x9e3779b9;
  x ^= x << 13; x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5; x >>>= 0;
  return x >>> 0;
}

export function roundSeed(matchSeed: number, round: number): number {
  return ((matchSeed ^ Math.imul(round, 0x9e3779b9)) >>> 0) || 0x9e3779b9;
}

/** 렌더·UI 전용 난수. 시뮬레이션과 완전히 분리된 인스턴스. */
export class VisualRng {
  private s: number;
  constructor(seed = 0x1234567) { this.s = seed >>> 0; }
  next(): number { return (this.s = rngNext(this.s)); }
  float(): number { return this.next() / 0x100000000; }
  range(lo: number, hi: number): number { return lo + this.float() * (hi - lo); }
}
