import * as C from './constants';
import type { PerkId, PresetResolved, Side } from './types';

export interface PerkDef {
  id: PerkId;
  name: string;
  desc: string;
  /** UI 카드에 쓰는 짧은 태그 (전투/경제/방어 등) */
  tag: string;
}

/** 퍽 10종. 계정당 정확히 1개만 선택할 수 있다. */
export const PERKS: PerkDef[] = [
  {
    id: 'FUNDS_START', name: '개전 자금', tag: '경제',
    desc: `대전 시작 시 자금 +${C.PERK_START_FUNDS_BONUS}원. 첫 라운드부터 더 강하게 시작한다.`,
  },
  {
    id: 'INCOME_BOOST', name: '경제 강화', tag: '경제',
    desc: `초당 수입 +${C.PERK_INCOME_BONUS}원. 후반으로 갈수록 격차가 벌어진다.`,
  },
  {
    id: 'RANGE_BOOST', name: '조준 보정', tag: '전투',
    desc: `보유한 모든 유닛의 사거리 +${C.PERK_RANGE_BONUS}u. 대공 진입선(50)에 더 쉽게 닿는다.`,
  },
  {
    id: 'ARMOR_BOOST', name: '장갑 강화', tag: '전투',
    desc: `보유한 모든 유닛의 안정성(HP) +${Math.round(C.PERK_ARMOR_PCT * 100)}%.`,
  },
  {
    id: 'SPEED_BOOST', name: '기동 강화', tag: '전투',
    desc: `보유한 모든 유닛의 이동속도 +${Math.round(C.PERK_SPEED_PCT * 100)}% (회피율은 그대로).`,
  },
  {
    id: 'RAPID_FIRE', name: '연사 정비', tag: '전투',
    desc: `보유한 모든 유닛의 공격 주기 −${Math.round(C.PERK_RAPID_PCT * 100)}%. 조금씩 더 자주 쏜다.`,
  },
  {
    id: 'FORTRESS', name: '철벽 성채', tag: '방어',
    desc: `성 HP +${C.PERK_FORTRESS_HP_BONUS}. 성이 공격받으면 공격한 유닛에게 ${Math.round(C.PERK_FORTRESS_REFLECT_PCT * 100)}% 반사 데미지.`,
  },
  {
    id: 'SLOW_FIELD', name: '방어 결계', tag: '방어',
    desc: `자기 성 주변 ${C.PERK_SLOWFIELD_RADIUS}u 안에 들어온 적 유닛의 이동속도 −${Math.round((1 - C.PERK_SLOWFIELD_FACTOR) * 100)}%.`,
  },
  {
    id: 'AIRSTRIKE', name: '공습 지원', tag: '지원',
    desc: `${C.PERK_AIRSTRIKE_INTERVAL_SEC}초마다 적 지상군 밀집 지점에 폭격 지원(반경 ${C.PERK_AIRSTRIKE_RADIUS}u, ${C.PERK_AIRSTRIKE_DAMAGE} 데미지).`,
  },
  {
    id: 'NULLIFY', name: '퍽 무효화', tag: '방해',
    desc: '상대의 퍽 효과를 완전히 무시한다. 서로 무효화를 고르면 둘 다 발동하지 않는다.',
  },
];

const BY_ID = new Map(PERKS.map((p) => [p.id, p]));
export function perkDef(id: PerkId | null | undefined): PerkDef | null {
  return id ? (BY_ID.get(id) ?? null) : null;
}

const OTHER: Record<Side, Side> = { P1: 'P2', P2: 'P1' };

/**
 * 실제로 적용되는 퍽. 상대가 NULLIFY 를 들었으면 내 퍽은 무효가 된다.
 * 서로 NULLIFY 를 들면 대칭적으로 서로를 무효화해 둘 다 아무 효과가 없다.
 */
export function effectivePerk(perks: Record<Side, PerkId | null>, side: Side): PerkId | null {
  if (perks[OTHER[side]] === 'NULLIFY') return null;
  return perks[side];
}

function clampCycle(ticks: number): number {
  return Math.max(C.PERK_CYCLE_FLOOR_TICKS, Math.round(ticks));
}

/**
 * 퍽의 정적(파츠 무관) 스텟 보정을 덱 전체에 적용한다.
 * 위치·시간에 의존하는 효과(방어 결계, 공습, 반사)는 match.ts 의 틱 로직에서 처리한다.
 */
export function applyPerkToDeck(deck: PresetResolved[], perk: PerkId | null): PresetResolved[] {
  if (!perk) return deck;
  return deck.map((d) => {
    switch (perk) {
      case 'RANGE_BOOST': {
        const range = d.range + C.PERK_RANGE_BONUS;
        return {
          ...d, range,
          canHitAir: range >= C.AA_MIN_RANGE,
          canHitGround: range >= C.AG_MIN_RANGE,
        };
      }
      case 'ARMOR_BOOST': {
        const stability = Math.round(d.stability * (1 + C.PERK_ARMOR_PCT));
        return { ...d, stability };
      }
      case 'SPEED_BOOST': {
        const speedMilli = Math.round(d.speedMilli * (1 + C.PERK_SPEED_PCT));
        const speedUps = Math.round((speedMilli / C.SPEED_PER_MOBILITY_MILLI) * 0.6 * 10) / 10;
        return { ...d, speedMilli, speedUps };
      }
      case 'RAPID_FIRE': {
        if (d.cycleTicks <= 0) return d; // 무장 없는 유닛은 그대로
        const cycleTicks = clampCycle(d.cycleTicks * (1 - C.PERK_RAPID_PCT));
        const cycleSec = cycleTicks / C.TICKS_PER_SEC;
        const dps = d.attack === 0 ? 0 : Math.round((d.attack / cycleSec) * 10) / 10;
        return { ...d, cycleTicks, cycleSec, dps };
      }
      default:
        return d; // 경제/방어/지원/무효화 계열은 유닛 스텟에 손대지 않는다
    }
  });
}

export function perkStartFundsBonus(perk: PerkId | null): number {
  return perk === 'FUNDS_START' ? C.PERK_START_FUNDS_BONUS : 0;
}

export function perkIncomeBonus(perk: PerkId | null): number {
  return perk === 'INCOME_BOOST' ? C.PERK_INCOME_BONUS : 0;
}

export function perkCastleHpBonus(perk: PerkId | null): number {
  return perk === 'FORTRESS' ? C.PERK_FORTRESS_HP_BONUS : 0;
}
