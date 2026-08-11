// 기획서 §12.6.2 / §17 — 조립 연출 타이밍
export const AN = {
  attachFlyMs: 240,   // AN-1 파츠 비행
  attachRingMs: 200,  // AN-2 링 이펙트
  attachShakeMs: 100, // AN-3 도면 셰이크
  attachFlashMs: 180, // AN-4 파츠 플래시
  statBarMs: 300,     // AN-5 스텟 막대
  priceRollMs: 300,   // AN-6 가격 롤업
  detachMs: 180,      // AN-7 해제
  rejectShakeMs: 300, // AN-8 거부 흔들림
  toastMs: 2000,      // AN-8 토스트
  presetStaggerMs: 40,// AN-10 순차 조립 간격
  saveSweepMs: 400,   // AN-11 저장 성공
  logoBuildMs: 600,   // 메인 로고 조립
  easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)',
} as const;

let reduced: boolean | null = null;
/** prefers-reduced-motion 대응 — 이동·셰이크 연출을 생략한다 */
export function prefersReducedMotion(): boolean {
  if (reduced === null) {
    reduced =
      typeof window !== 'undefined' &&
      !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }
  return reduced;
}

export function ms(v: number): number {
  return prefersReducedMotion() ? 0 : v;
}

export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
