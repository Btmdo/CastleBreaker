import type { PartDef } from './types';

/** 기획서 §7 파츠 데이터 전문 (16종) */
export const PARTS: PartDef[] = [
  // ── 몸통 (필수, 1개) ──
  {
    id: 'B_H', name: '가로 몸통', category: 'BODY', cost: 30,
    stability: +10, armSlots: 1,
    blurb: '낮고 넓은 저중심 차대. 싸고 튼튼한 기본형',
  },
  {
    id: 'B_V', name: '세로 몸통', category: 'BODY', cost: 40,
    stability: -10, range: +20, armSlots: 2,
    blurb: '직립 구조. 높은 마운트로 사거리를 벌고 팔을 두 개 지지하지만 무게중심이 높아 물렁하다',
  },

  // ── 팔 (선택) ──
  {
    id: 'A_ROBOT', name: '로봇 팔', category: 'ARM', cost: 35,
    stability: -15, range: +10, cycleDeci: -3, weaponMounts: 1,
    blurb: '능동 관절 조준. 사거리와 연사를 벌지만 다관절 구조라 취약하고 비싸다',
  },
  {
    id: 'A_CANNON', name: '120mm 활강포', category: 'ARM', cost: 60,
    attack: +20, range: +30, cycleDeci: +10, weaponMounts: 0,
    blurb: '완결된 무장. 무기를 추가로 못 달지만 그 자체로 장거리 화력. 재장전이 느리다',
  },
  {
    id: 'A_PYLON', name: '무장창', category: 'ARM', cost: 15,
    range: -10, cycleDeci: +3, weaponMounts: 1,
    blurb: '고정 하드포인트. 최저가로 무기 슬롯을 늘리지만 조준 장치가 없어 짧고 느리다',
  },
  {
    id: 'A_AUTO', name: '30mm 속사포', category: 'ARM', cost: 45,
    attack: +15, range: +15, cycleDeci: -5, weaponMounts: 0,
    blurb: '완결된 자동포. 화력은 낮지만 연사가 빨라 꾸준히 긁는다. 값도 싸다',
  },
  {
    id: 'A_BLADE', name: '회전 칼날', category: 'ARM', cost: 55,
    attack: +35, range: -15, stability: +5, cycleDeci: -6, weaponMounts: 0,
    blurb: '접촉 전용 절단기. 근접에서는 최고 효율이지만 사거리를 깎고 무기를 달 수 없다',
  },
  {
    id: 'A_MLRS', name: '다연장 미사일 포대', category: 'ARM', cost: 90,
    attack: +25, range: +45, stability: -10, cycleDeci: +12, splashRadius: 25, weaponMounts: 0,
    blurb: '탄막 발사기. 사거리 45와 반경 25u 범위 공격을 동시에 얻지만 재장전이 매우 느리다',
  },
  {
    id: 'A_RAIL', name: '장거리 레일건', category: 'ARM', cost: 110,
    attack: +45, range: +70, stability: -10, cycleDeci: +16, weaponMounts: 0,
    blurb: '전 파츠 최장 사거리. 한 발이 무겁지만 재장전이 가장 느리고 가장 비싸다',
  },
  {
    id: 'A_CHARGE', name: '자폭 폭탄', category: 'ARM', cost: 55,
    attack: +90, range: -20, splashRadius: 30, suicide: true, weaponMounts: 0,
    blurb: '접촉해서 터진다. 반경 30u를 90 데미지로 쓸고 자신도 소멸한다. 뭉친 적을 상대하는 1회용 결전병기',
  },

  // ── 무기 (선택) ──
  {
    id: 'W_SABER', name: '광선검', category: 'WEAPON', cost: 50,
    attack: +30, range: -20,
    blurb: '최고 단발 화력. 사거리를 크게 깎아 접촉해야만 쓴다. 비행 유닛이 들기 어렵다',
  },
  {
    id: 'W_BOMB', name: '항공폭탄', category: 'WEAPON', cost: 20,
    attack: +20, range: 0, splashRadius: 20,
    blurb: '최저가 화력. 착탄 반경 20u의 같은 레인 적 전원에게 100% 데미지',
  },
  {
    id: 'W_MSL', name: '미사일', category: 'WEAPON', cost: 45,
    attack: +10, range: +30,
    blurb: '화력은 낮지만 사거리를 크게 벌어 대공 진입권(사거리 50)을 확보하는 핵심 파츠',
  },
  {
    id: 'W_RIFLE20', name: '20mm 로봇용 라이플', category: 'WEAPON', cost: 30,
    attack: +15, range: +10, cycleDeci: -2,
    blurb: '표준 제식 화기. 값싸게 화력·사거리·연사를 조금씩 얻는 무난한 선택',
  },
  {
    id: 'W_RIFLE85', name: '85mm 장거리 라이플', category: 'WEAPON', cost: 65,
    attack: +25, range: +40, cycleDeci: +5,
    blurb: '대구경 저격총. 무기 중 사거리가 가장 길어 팔 하나로 대공 진입선을 넘길 수 있다',
  },
  {
    id: 'W_GRENADE', name: '로봇용 수류탄', category: 'WEAPON', cost: 35,
    attack: +12, range: +10, cycleDeci: +2, splashRadius: 30,
    blurb: '던져서 넓게 터뜨린다. 단발 화력은 가장 낮지만 반경 30u가 뭉친 적을 한꺼번에 긁는다',
  },

  // ── 다리 (선택, 1개) ──
  {
    id: 'L_WHEEL', name: '바퀴', category: 'LEG', cost: 20,
    mobility: +20,
    blurb: '최고 가성비 이동. 가장 싸고 가장 빠른 지상 다리',
  },
  {
    id: 'L_TRACK', name: '캐터필러', category: 'LEG', cost: 30,
    mobility: +10, stability: +10,
    blurb: '궤도. 느리지만 접지 안정성으로 HP를 번다. 방벽 전용',
  },
  {
    id: 'L_QUAD', name: '사족보행', category: 'LEG', cost: 45,
    mobility: +15, stability: +15,
    blurb: '기동과 안정을 모두 챙기는 프리미엄. 비싼 무장을 오래 살릴 때',
  },
  {
    id: 'L_BIPED', name: '이족보행', category: 'LEG', cost: 55,
    mobility: +10, stability: -20, range: +20,
    blurb: '직립 고소 사격 플랫폼. 사거리를 주는 유일한 다리',
  },
  {
    id: 'L_JET', name: '제트엔진', category: 'LEG', cost: 90,
    mobility: +80, stability: -20,
    blurb: '압도적 기동. 전장을 12.5초에 횡단하고 회피율 20%. 전 파츠 중 최고가',
  },

  // ── 특수 (선택, 1개) ──
  {
    id: 'S_HEAD', name: '머리', category: 'SPECIAL', cost: 25,
    range: +10, stability: -10,
    blurb: '광학 조준 장치. 값싸게 사거리를 벌지만 피격 면적이 늘어난다',
  },
  {
    id: 'S_HMG', name: '중기관총', category: 'SPECIAL', cost: 30,
    attack: +10, cycleDeci: -4,
    blurb: '보조 화력. 주기를 줄이는 유일한 비(非)팔 파츠로 DPS를 크게 끌어올린다',
  },
  {
    id: 'S_WING', name: '날개', category: 'SPECIAL', cost: 70,
    stability: -20, canFly: true,
    blurb: '공중 레인 진입권. 지상 블로킹을 완전히 무시한다. 이동 파츠가 아니라 고도 파츠다',
  },
  {
    id: 'S_CHARGE', name: '자폭 장치', category: 'SPECIAL', cost: 40,
    attack: +60, splashRadius: 45, suicide: true,
    blurb: '팔을 비운 채로 자폭한다. 사거리를 깎지 않아 조금 떨어져서 터지고 폭발 반경이 더 넓다. 날개와는 함께 쓸 수 없다',
  },
];

const BY_ID = new Map(PARTS.map((p) => [p.id, p]));

export function part(id: string): PartDef {
  const p = BY_ID.get(id);
  if (!p) throw new Error(`unknown part: ${id}`);
  return p;
}

export function partOrNull(id: string | null | undefined): PartDef | null {
  if (!id) return null;
  return BY_ID.get(id) ?? null;
}

export function partsOf(category: PartDef['category']): PartDef[] {
  return PARTS.filter((p) => p.category === category);
}
