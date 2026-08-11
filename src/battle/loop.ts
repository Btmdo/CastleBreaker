import { TICKS_PER_SEC } from '../sim/constants';

const TICK_MS = 1000 / TICKS_PER_SEC;
/** 한 프레임에 처리할 최대 틱 — 탭 복귀 시 폭주 방지 */
const MAX_TICKS_PER_FRAME = 64;

export type Speed = 1 | 2 | 4;

/**
 * 전역 배속 승수. UI 라벨(1×/2×/4×)은 그대로 두고 실제 진행 속도만 이 값만큼
 * 곱해진다 — 즉 "2×" 버튼을 눌러도 화면엔 2×라고 뜨지만 실제로는 4×로 돈다.
 */
const GLOBAL_SPEED_BOOST = 2;

/**
 * 고정 30Hz accumulator 루프.
 * 배속은 accumulator 에 들어가는 시간만 늘린다 — 시뮬레이션 틱 수와 결과는
 * 배속과 무관하게 동일하다. (오프라인 프로토타입 전용 기능)
 */
export class BattleLoop {
  speed: Speed = 4; // 기본 4배속(라벨) = 실제 8배속
  private raf = 0;
  private last = 0;
  private acc = 0;
  private running = false;

  constructor(
    private step: () => void,
    private draw: (now: number) => void,
    private shouldTick: () => boolean,
  ) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    const frame = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(now - this.last, 250);
      this.last = now;
      this.acc += dt * this.speed * GLOBAL_SPEED_BOOST;
      let n = 0;
      while (this.acc >= TICK_MS && n < MAX_TICKS_PER_FRAME) {
        if (!this.shouldTick()) { this.acc = 0; break; }
        this.step();
        this.acc -= TICK_MS;
        n++;
      }
      if (n >= MAX_TICKS_PER_FRAME) this.acc = 0;
      this.draw(now);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
}
