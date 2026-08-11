/**
 * 기획서 §12.10 — 튜토리얼 일러스트 6종.
 * 전부 인라인 SVG. 외부 이미지 파일 0개. §12.9 스타일 규약(아웃라인 없음 /
 * 단색 면 / 기본 도형만) 을 그대로 따른다.
 */
import { BG, SIDE, STATUS, TEXT } from './palette';
import { unitSvg } from './parts-svg';
import { BUILD } from '../sim/builds';

const P1 = SIDE.P1;
const P2 = SIDE.P2;

const wrap = (w: number, h: number, inner: string) =>
  `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" ` +
  `preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%">${inner}</svg>`;

const label = (
  x: number, y: number, t: string,
  fill: string = TEXT.secondary, size = 11, anchor = 'middle',
) =>
  `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-family="inherit" ` +
  `font-weight="600" text-anchor="${anchor}">${t}</text>`;

/** 파츠 아트로 만든 실제 유닛을 일러스트 안에 배치한다 */
function unitAt(key: keyof typeof BUILD, side: 'P1' | 'P2', x: number, y: number, size: number) {
  const p = BUILD[key]();
  const svg = unitSvg(
    { body: p.body, arms: p.arms, weapons: p.weapons, leg: p.leg, special: p.special },
    side,
  );
  const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  const vb = /viewBox="([^"]+)"/.exec(svg)![1].split(' ').map(Number);
  const scale = size / Math.max(vb[2], vb[3]);
  return (
    `<g transform="translate(${x},${y}) scale(${scale}) translate(${-vb[0] - vb[2] / 2},${-vb[1] - vb[3]})">` +
    inner + '</g>'
  );
}

function castle(x: number, groundY: number, side: 'P1' | 'P2', h = 46) {
  const pal = side === 'P1' ? P1 : P2;
  const w = 30;
  const x0 = side === 'P1' ? x : x - w;
  return (
    `<rect x="${x0}" y="${groundY - h}" width="${w}" height="${h}" fill="${pal.castle}"/>` +
    `<rect x="${x0}" y="${groundY - h}" width="${w}" height="7" fill="${pal.castleDark}"/>` +
    `<rect x="${x0 + 6}" y="${groundY - h + 14}" width="7" height="11" fill="${pal.castleDark}"/>` +
    `<rect x="${x0 + 17}" y="${groundY - h + 14}" width="7" height="11" fill="${pal.castleDark}"/>`
  );
}

// ── 1. 목표 ────────────────────────────────────────────────
const p1 = () => {
  const g = 108;
  return wrap(400, 150,
    `<rect width="400" height="${g}" fill="${BG.sky}"/>` +
    `<rect y="${g}" width="400" height="${150 - g}" fill="${BG.ground}"/>` +
    `<rect y="${g}" width="400" height="2" fill="${BG.groundLine}"/>` +
    castle(14, g, 'P1') + castle(386, g, 'P2') +
    unitAt('lightInf', 'P1', 108, g, 30) +
    unitAt('wall', 'P1', 78, g, 26) +
    unitAt('lightInf', 'P2', 292, g, 30) +
    unitAt('artillery', 'P2', 322, g, 30) +
    // 진격 화살표
    `<polygon points="150,${g - 22} 168,${g - 15} 150,${g - 8}" fill="${P1.arm}"/>` +
    `<polygon points="250,${g - 22} 232,${g - 15} 250,${g - 8}" fill="${P2.arm}"/>` +
    `<rect x="34" y="${g - 58}" width="${STATUS.hpHigh ? 0 : 0}" height="0" fill="none"/>` +
    label(44, g - 52, '내 성', P1.accent, 11) +
    label(356, g - 52, '상대 성', P2.accent, 11) +
    label(200, 22, '성이 먼저 무너지는 쪽이 패배', TEXT.primary, 13),
  );
};

// ── 2. 전장 (2레인) ────────────────────────────────────────
const p2 = () => {
  const air = 44, gnd = 116;
  return wrap(400, 150,
    `<rect width="400" height="150" fill="${BG.sky}"/>` +
    `<rect y="${gnd}" width="400" height="34" fill="${BG.ground}"/>` +
    `<rect y="${gnd}" width="400" height="2" fill="${BG.groundLine}"/>` +
    // 공중 레인 가이드
    `<rect y="${air + 6}" width="400" height="1" fill="${BG.groundLine}"/>` +
    label(38, air - 14, '공중 레인', TEXT.secondary, 10, 'start') +
    label(38, gnd - 42, '지상 레인', TEXT.secondary, 10, 'start') +
    unitAt('bomber', 'P1', 120, air + 6, 26) +
    unitAt('bomber', 'P2', 280, air + 6, 26) +
    // 지상: 앞 유닛이 뒤를 막는다
    unitAt('wall', 'P1', 150, gnd, 26) +
    unitAt('lightInf', 'P1', 122, gnd, 26) +
    unitAt('lightInf', 'P1', 94, gnd, 26) +
    unitAt('lightInf', 'P2', 250, gnd, 26) +
    `<rect x="163" y="${gnd - 30}" width="2" height="26" fill="${STATUS.danger}"/>` +
    label(200, gnd - 36, '앞 유닛이 막히면 뒤도 못 간다', STATUS.danger, 11) +
    label(200, air - 26, '공중은 공중만 막는다', P1.accent, 11),
  );
};

// ── 3. 라운드 ──────────────────────────────────────────────
const p3 = () => {
  const y = 64, h = 30;
  let x = 20;
  const parts: string[] = [];
  const terms = [30, 60, 90, 120];
  terms.forEach((t, i) => {
    // 선택(정지)
    parts.push(`<rect x="${x}" y="${y}" width="16" height="${h}" fill="${STATUS.funds}" opacity="0.85"/>`);
    parts.push(label(x + 8, y - 8, `R${i + 1}`, TEXT.secondary, 10));
    x += 16;
    // 전투(진행) — 텀이 길어진다
    const w = t * 1.05;
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${P1.body}"/>`);
    parts.push(label(x + w / 2, y + 20, `${t}초`, TEXT.primary, 11));
    x += w + 3;
  });
  return wrap(400, 150,
    `<rect width="400" height="150" fill="${BG.sky}"/>` +
    parts.join('') +
    `<rect x="20" y="${y + h + 8}" width="${x - 23}" height="2" fill="${BG.groundLine}"/>` +
    `<rect x="20" y="${y + h + 20}" width="16" height="10" fill="${STATUS.funds}" opacity="0.85"/>` +
    label(42, y + h + 29, '선택 시간 — 시간 정지 (최대 60초)', TEXT.secondary, 10, 'start') +
    `<rect x="20" y="${y + h + 36}" width="16" height="10" fill="${P1.body}"/>` +
    label(42, y + h + 45, '전투 시간 — 간격이 30초씩 길어진다', TEXT.secondary, 10, 'start') +
    label(200, 26, '멈췄다 흐르고, 다시 멈춘다', TEXT.primary, 13),
  );
};

// ── 4. 자금 ────────────────────────────────────────────────
const p4 = () => {
  const cy = 74;
  const coin = (x: number, y: number, on: boolean) =>
    `<circle cx="${x}" cy="${y}" r="7" fill="${on ? STATUS.funds : BG.panelHi}"/>`;
  return wrap(400, 150,
    `<rect width="400" height="150" fill="${BG.sky}"/>` +
    // 시계
    `<circle cx="88" cy="${cy}" r="30" fill="${BG.panel}"/>` +
    `<rect x="86" y="${cy - 22}" width="4" height="24" fill="${P1.arm}"/>` +
    `<rect x="88" y="${cy - 2}" width="17" height="4" fill="${P1.accent}"/>` +
    // 흐르는 구간 — 코인이 나온다
    coin(150, cy, true) + coin(176, cy, true) + coin(202, cy, true) +
    label(176, cy - 26, '시간이 흐를 때 +7 / 초', STATUS.funds, 11) +
    // 정지 구간 — 코인이 멈춘다
    coin(280, cy, false) + coin(306, cy, false) +
    `<rect x="256" y="${cy - 20}" width="4" height="40" fill="${STATUS.danger}"/>` +
    `<rect x="264" y="${cy - 20}" width="4" height="40" fill="${STATUS.danger}"/>` +
    label(300, cy - 26, '선택 시간엔 멈춤', STATUS.danger, 11) +
    label(200, 26, '자금은 전투가 흐를 때만 쌓인다', TEXT.primary, 13) +
    label(200, 132, '남은 돈은 다음 라운드로 이월된다', TEXT.secondary, 11),
  );
};

// ── 5. 조립 ────────────────────────────────────────────────
const p5 = () => {
  const box = (x: number, y: number, w: number, h: number, t: string, fill: string) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>` +
    label(x + w / 2, y + h / 2 + 4, t, BG.app, 11);
  const bar = (x: number, y: number, w: number, fill: string) =>
    `<rect x="${x}" y="${y}" width="86" height="8" fill="${BG.panelHi}"/>` +
    `<rect x="${x}" y="${y}" width="${w}" height="8" fill="${fill}"/>`;
  return wrap(400, 150,
    `<rect width="400" height="150" fill="${BG.sky}"/>` +
    // 슬롯 도식
    box(96, 20, 52, 20, '특수', P1.special) +
    box(96, 52, 52, 20, '몸통', P1.body) +
    box(38, 52, 52, 20, '팔', P1.arm) +
    box(38, 80, 52, 20, '무기', P1.weapon) +
    box(96, 84, 52, 20, '다리', P1.leg) +
    `<rect x="120" y="40" width="2" height="12" fill="${BG.groundLine}"/>` +
    `<rect x="120" y="72" width="2" height="12" fill="${BG.groundLine}"/>` +
    `<rect x="90" y="61" width="6" height="2" fill="${BG.groundLine}"/>` +
    // 화살표
    `<polygon points="170,62 190,55 190,69" fill="${TEXT.secondary}"/>` +
    // 스텟 막대
    label(206, 30, '안정성', TEXT.secondary, 10, 'start') + bar(258, 22, 62, P1.body) +
    label(206, 52, '공격력', TEXT.secondary, 10, 'start') + bar(258, 44, 44, P1.weapon) +
    label(206, 74, '사거리', TEXT.secondary, 10, 'start') + bar(258, 66, 30, P1.arm) +
    label(206, 100, '가격', STATUS.funds, 11, 'start') +
    label(344, 100, '135 원', STATUS.funds, 14, 'end') +
    label(200, 136, '강해지면 반드시 비싸진다', TEXT.primary, 12),
  );
};

// ── 6. 스테이터스 ★ 가장 중요 ──────────────────────────────
const p6 = () => {
  const y = 92, x0 = 40, x1 = 360;
  const at = (v: number) => x0 + (v / 160) * (x1 - x0);
  return wrap(400, 150,
    `<rect width="400" height="150" fill="${BG.sky}"/>` +
    label(200, 20, '사거리에는 두 개의 문턱이 있다', TEXT.primary, 13) +
    // 눈금자
    `<rect x="${x0}" y="${y}" width="${x1 - x0}" height="4" fill="${BG.panelHi}"/>` +
    // 0 지점
    `<rect x="${at(0) - 2}" y="${y - 16}" width="4" height="34" fill="${STATUS.danger}"/>` +
    label(at(0), y + 32, '0', STATUS.danger, 12) +
    label(at(0) + 6, y - 22, '공중 유닛은 사거리가 0보다 커야 지상을 때린다', STATUS.danger, 10, 'start') +
    // 50 지점
    `<rect x="${at(50) - 2}" y="${y - 16}" width="4" height="34" fill="${P1.accent}"/>` +
    label(at(50), y + 32, '50', P1.accent, 12) +
    label(at(50) + 6, y - 40, '사거리 50 이상이어야 공중을 때린다', P1.accent, 10, 'start') +
    // 눈금
    [20, 100, 150].map((v) =>
      `<rect x="${at(v)}" y="${y - 6}" width="2" height="16" fill="${BG.groundLine}"/>` +
      label(at(v), y + 32, String(v), TEXT.disabled, 10)).join('') +
    // 스텟 아이콘 행
    [
      ['안정성', P1.body], ['기동성', P1.arm], ['공격력', P1.weapon],
      ['사거리', P1.special], ['가격', STATUS.funds], ['비행', P1.accent],
    ].map(([t, col], i) =>
      `<rect x="${28 + i * 60}" y="42" width="10" height="10" fill="${col}"/>` +
      label(43 + i * 60, 51, t, TEXT.secondary, 9, 'start')).join(''),
  );
};

export interface TutorialPage {
  title: string;
  art: string;
  body: string[];
}

export const TUTORIAL_PAGES: TutorialPage[] = [
  {
    title: '목표',
    art: p1(),
    body: [
      '전장 양쪽에 성이 있다. 유닛을 소환해 상대 성을 부수고 내 성을 지킨다.',
      '성 HP가 먼저 0이 되는 쪽이 패배한다. 10분이 지나면 성 HP 비율이 높은 쪽이 이긴다.',
    ],
  },
  {
    title: '전장',
    art: p2(),
    body: [
      '길은 지상과 공중 두 개다. 유닛은 알아서 전진하고, 사거리 안에 적이 들어오면 공격한다.',
      '같은 레인에서는 앞 유닛이 뒤 유닛을 막는다. 공중 유닛은 공중 유닛만 막는다 — 상대가 대공 수단을 안 들고 왔다면 하늘은 그대로 뚫린다.',
    ],
  },
  {
    title: '라운드',
    art: p3(),
    body: [
      '선택 시간에는 시간이 완전히 멈춘다. 이때 유닛을 예약하고, 둘 다 준비를 마치거나 60초가 지나면 전투가 재개된다.',
      '전투 구간은 30초 → 60초 → 90초 → 120초로 길어진다. 후반에는 한 번의 선택이 훨씬 무거워진다.',
    ],
  },
  {
    title: '자금',
    art: p4(),
    body: [
      '자금은 전투가 흐르는 동안에만 초당 7원씩 쌓인다. 선택 시간에는 한 푼도 늘지 않는다.',
      '쓰지 않은 돈은 그대로 이월된다. 아껴서 비싼 기체를 뽑을 수도 있지만, 유휴 자금은 전장에서 아무 일도 하지 않는다.',
    ],
  },
  {
    title: '조립',
    art: p5(),
    body: [
      '유닛은 카탈로그에서 고르는 게 아니라 파츠로 직접 조립한다. 몸통은 필수이고 팔·무기·다리·특수는 선택이다.',
      '붙인 파츠가 스텟과 가격을 동시에 정한다. 강한 파츠를 붙이면 반드시 비싸지거나 다른 무언가를 잃는다.',
    ],
  },
  {
    title: '스테이터스',
    art: p6(),
    body: [
      '안정성은 체력, 기동성은 이동속도와 회피율, 그리고 공격력·사거리·가격·비행 가능 여부가 있다.',
      '사거리 50 이상이어야 공중을 때릴 수 있다. 공중 유닛은 사거리가 0보다 커야 지상을 때릴 수 있다. 이 두 문턱이 이 게임 전투의 핵심이다.',
    ],
  },
];
