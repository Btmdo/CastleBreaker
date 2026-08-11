// 기획서 §17 상수 테이블 전문 — 본 프로젝트 모든 수치의 단일 진실 원천.
// 이 파일과 parts.ts 를 제외한 어떤 sim 로직에도 리터럴 숫자를 쓰지 않는다.

// ── 시간 ──
export const TICKS_PER_SEC = 30;
export const LIMIT_SEC = 600; // 실시간 진행 누적 제한
export const LIMIT_TICKS = LIMIT_SEC * TICKS_PER_SEC;
export const SELECTION_MAX_SEC = 60;
export const REVEAL_SEC = 2;
export const TERM_BASE_SEC = 30; // 라운드 텀 = min(30 × n, 120)
export const TERM_MAX_SEC = 120;

// ── 전장 ──
export const FIELD_WIDTH = 600; // u
export const FIELD_WIDTH_MILLI = 600_000;
export const SPAWN_POS_MILLI = 15_000; // 15u
export const UNIT_GAP_MILLI = 12_000; // 12u (반경 6u × 2)
export const MAX_UNITS_PER_SIDE = 30;
export const SPAWN_INTERVAL_TICKS = 12; // 0.4초

// ── 성 ──
export const CASTLE_HP = 3500;

// ── 경제 ──
export const START_FUNDS = 200;
export const INCOME_PER_SEC = 7;

// ── 기본 스테이터스 ──
export const BASE_STABILITY = 100;
export const BASE_MOBILITY = 0;
export const BASE_ATTACK = 0;
export const BASE_RANGE = 20; // u
export const BASE_CYCLE_DECI = 20; // 2.0초 (0.1초 단위)

export const MIN_STABILITY = 10;
export const MIN_RANGE = 0;
export const MIN_CYCLE_DECI = 8; // 0.8초 하한

// ── 파생 계수 ──
export const SPEED_PER_MOBILITY_MILLI = 20; // 밀리유닛/틱 (= 기동성 × 0.6 u/s)
export const EVASION_BP_PER_MOBILITY = 25; // bp
export const EVASION_BP_CAP = 4000; // 40%
export const BP_DENOM = 10_000;

// ── 교차 레인 문턱값 (§9.4) ──
export const AA_MIN_RANGE = 50; // 지대공: 사거리 ≥ 50
export const AG_MIN_RANGE = 1; // 공대지: 사거리 > 0  (즉 ≥ 1)

// ── 프리셋 / 덱 ──
export const PRESET_SLOTS = 30;
export const DECK_SIZE = 6;
export const DECK_SAVES = 5;
export const PRESET_NAME_MIN = 1;
export const PRESET_NAME_MAX = 16;

// ── 계정 / 레이팅 (§12.3, §12.5) ──
export const NAME_MIN_LEN = 2;
export const NAME_MAX_LEN = 12;
export const NAME_PATTERN = /^[가-힣a-zA-Z0-9]+$/;
export const RATING_START = 1000;
export const RATING_FLOOR = 100;
export const ELO_K = 32;
export const LEADERBOARD_SIZE = 50;

// ── 한줄소개 ──
export const BIO_MAX_LEN = 60;

// ── 온라인 (기획서 §11.5) ──
export const RECONNECT_GRACE_SEC = 60;
export const PRESENCE_PING_SEC = 5;

// ── 퍽 (한 계정당 1개 선택) ──
export const PERK_START_FUNDS_BONUS = 100; // 개전 자금
export const PERK_INCOME_BONUS = 3; // 경제 강화, 초당
export const PERK_RANGE_BONUS = 8; // 조준 보정, u (전 유닛)
export const PERK_ARMOR_PCT = 0.12; // 장갑 강화, 안정성 비율
export const PERK_SPEED_PCT = 0.15; // 기동 강화, 이동속도 비율 (회피율은 불변)
export const PERK_RAPID_PCT = 0.08; // 연사 정비, 공격 주기 단축 비율
export const PERK_CYCLE_FLOOR_TICKS = 6; // 연사 정비 하한 (0.2초)
export const PERK_FORTRESS_HP_BONUS = 500; // 철벽 성채, 성 HP
export const PERK_FORTRESS_REFLECT_PCT = 0.15; // 철벽 성채, 반사 데미지 비율
export const PERK_SLOWFIELD_RADIUS = 100; // 방어 결계, 자기 성 기준 u
export const PERK_SLOWFIELD_FACTOR = 0.7; // 방어 결계, 적 이동속도 배율 (−30%)
export const PERK_AIRSTRIKE_INTERVAL_SEC = 45; // 공습 지원, 주기
export const PERK_AIRSTRIKE_DAMAGE = 80; // 공습 지원, 데미지
export const PERK_AIRSTRIKE_RADIUS = 30; // 공습 지원, 반경 u

/** 라운드 n(1-based)의 텀(초). 기획서 §4.2 */
export function roundTermSec(n: number): number {
  return Math.min(TERM_BASE_SEC * n, TERM_MAX_SEC);
}
