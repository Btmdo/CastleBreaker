// 기획서 §13 데이터 모델

export type PartCategory = 'BODY' | 'ARM' | 'WEAPON' | 'LEG' | 'SPECIAL';
export type Side = 'P1' | 'P2';
export type Lane = 'GROUND' | 'AIR';
/** 무기 거치대. 몸통 직결 슬롯은 없다 — 무기는 반드시 팔을 거친다. */
export type WeaponMount = 'ARM0' | 'ARM1';
export type Phase = 'SELECTION' | 'REVEAL' | 'REALTIME' | 'RESULT';

/** 퍽 — 계정당 정확히 1개 선택. sim/perks.ts 에서 정의·해석한다. */
export type PerkId =
  | 'FUNDS_START'
  | 'INCOME_BOOST'
  | 'RANGE_BOOST'
  | 'ARMOR_BOOST'
  | 'SPEED_BOOST'
  | 'RAPID_FIRE'
  | 'FORTRESS'
  | 'SLOW_FIELD'
  | 'AIRSTRIKE'
  | 'NULLIFY';

export interface PartDef {
  id: string;
  name: string;
  category: PartCategory;
  cost: number;
  /** 짧은 설계 의도 — UI 툴팁용 */
  blurb: string;
  // 스텟 보정 (없으면 0)
  stability?: number;
  mobility?: number;
  attack?: number;
  range?: number;
  /** 공격 주기 보정 (0.1초 단위 정수. -3 = -0.3초) */
  cycleDeci?: number;
  // 구조
  armSlots?: number; // BODY 전용
  weaponMounts?: number; // ARM 전용
  // 특성
  canFly?: boolean; // SPECIAL 전용
  splashRadius?: number; // 범위 공격 반경 (u)
  /** 자폭 — 공격하는 순간 폭발하고 자신도 소멸한다 */
  suicide?: boolean;
}

export interface Preset {
  id: string;
  name: string; // 1~16자
  body: string; // PartDef.id (필수)
  arms: [string | null, string | null]; // ARM0, ARM1
  weapons: { mount: WeaponMount; part: string }[];
  leg: string | null;
  special: string | null;
}

/** 조립 결과 — 전투가 사용하는 최종 수치 */
export interface PresetResolved {
  presetId: string;
  name: string;
  cost: number;
  stability: number; // HP
  mobility: number;
  attack: number;
  range: number; // u
  cycleTicks: number;
  speedMilli: number; // 밀리유닛/틱
  evasionBp: number;
  canFly: boolean;
  splashRadius: number; // 0 = 단일 타겟
  /** 자폭 유닛 — 첫 공격에 폭발하고 소멸한다 */
  suicide: boolean;
  /** 파생 표시값 */
  cycleSec: number;
  dps: number;
  speedUps: number;
  canHitAir: boolean; // 지상 유닛 기준 (range >= 50)
  canHitGround: boolean; // 공중 유닛 기준 (range > 0)
  /** 렌더용 — 어떤 파츠로 조립됐는지 */
  parts: {
    body: string;
    arms: (string | null)[];
    weapons: { mount: WeaponMount; part: string }[];
    leg: string | null;
    special: string | null;
  };
}

export interface AssembleError {
  code: string;
  message: string;
}

export interface Unit {
  id: number;
  side: Side;
  presetSlot: number; // 0~5
  lane: Lane;
  d: number; // 진행 거리 (밀리유닛, 0 = 자기 성)
  hp: number;
  maxHp: number;
  cooldown: number;
}

export interface SpawnOrder {
  slot: number;
  count: number;
}

/** 렌더러가 소비하는 1회성 이벤트. 시뮬레이션 상태에 영향을 주지 않는다. */
export type SimEvent =
  | { k: 'fire'; unitId: number; side: Side; lane: Lane; d: number; range: number; weapon: string }
  | { k: 'hit'; unitId: number; dmg: number }
  | { k: 'evade'; unitId: number }
  | { k: 'death'; unitId: number; side: Side; lane: Lane; d: number }
  | { k: 'splash'; side: Side; lane: Lane; d: number; radius: number }
  | { k: 'castleHit'; side: Side; dmg: number }
  | { k: 'spawn'; unitId: number }
  | { k: 'airstrike'; side: Side; lane: Lane; d: number; radius: number };

export interface MatchState {
  round: number;
  phase: Phase;
  tick: number; // REALTIME 누적 틱 (제한시간 판정 기준)
  phaseTick: number; // 현재 라운드 내 경과 틱
  termTicks: number;
  castleHp: Record<Side, number>;
  funds: Record<Side, number>;
  units: Unit[];
  spawnQueue: Record<Side, number[]>;
  spawnCooldown: Record<Side, number>;
  nextUnitId: number;
  rngState: number;
  winner: Side | 'DRAW' | null;
  endReason: string | null;
  /** 이번 틱에 발생한 렌더 이벤트 */
  events: SimEvent[];
  /** 통계 */
  stats: MatchStats;

  /** 양측이 선택한 퍽 (없으면 null). 상대가 NULLIFY 를 들면 내 퍽은 무효화된다 */
  perks: Record<Side, PerkId | null>;
  /** 퍽 보정이 반영된 성 최대 HP (FORTRESS 적용 시 CASTLE_HP + 보너스) */
  castleMaxHp: Record<Side, number>;
  /** AIRSTRIKE 퍽 보유 시 다음 공습까지 남은 틱 */
  airstrikeCooldown: Record<Side, number>;
}

export interface MatchStats {
  spentByRound: Record<Side, number[]>;
  perPreset: Record<
    Side,
    { slot: number; spawned: number; kills: number; damageDealt: number; damageTaken: number }[]
  >;
}

export interface Decks {
  P1: PresetResolved[];
  P2: PresetResolved[];
}

// ── 계정 / 랭킹 ──
export interface PlayerProfile {
  name: string; // 정규화 키
  displayName: string;
  rating: number;
  wins: number;
  draws: number;
  losses: number;
  tutorialSeen: boolean;
  presets: Preset[];
  decks: { id: string; name: string; slots: string[] }[];
  activeDeckId: string | null;
  /** 계정당 정확히 1개. 없으면 null */
  perk: PerkId | null;
  /** 매칭 화면에서 상대에게 보이는 한줄소개 */
  bio: string;
  createdAt: number;
  lastSeenAt: number;
}

export interface LeaderRow {
  rank: number;
  displayName: string;
  rating: number;
  wins: number;
  draws: number;
  losses: number;
  isMe: boolean;
}
