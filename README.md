# CASTLE BREAKER

조립식 오펜스 대전. [오펜스게임_기획서.md](../오펜스게임_기획서.md) 의 구현체.

**플레이**: https://castle-breaker.pages.dev (Cloudflare Pages, 온라인 대전 켜짐)
레거시 미러: https://btmdo.github.io/CastleBreaker/ (GitHub Pages, AI 연습만 — 아래 참고)

AI 연습(가상 플레이어 5인)과 **실제 온라인 대전 둘 다 지금 바로 된다.** 백엔드는 Cloudflare Workers + D1 (아래 [온라인 기능](#온라인-기능) 참고).

## 실행

```bash
npm install
npm run dev
```

| 명령 | 내용 |
|---|---|
| `npm run dev` | 개발 서버 (http://localhost:5180) |
| `npm run check` | 기획서 §8.3 대표 빌드 스텟 + §9.4 교차 레인 문턱값 검증 |
| `npm run sim` | 결정론 검증 + AI 라운드로빈 + 밸런스 구도 |
| `npm run sim -- duel` | 동일 예산 유닛 교환비 측정 |
| `npm run sim -- bal` | 밸런스 구도만 (좌우 미러 포함) |
| `npm run sim -- perk` | 퍽 10종 sanity check (미러 매치 승률 + NULLIFY 검증) |
| `npm run build` | 타입 체크 + 프로덕션 빌드 |

## 게임 흐름

```
메인 페이지 → 플레이어 인증 → 「{이름}의 격납고」 → 매칭 → 전투 → 격납고 (반복)
                                  ├ ① 설계  프리셋 편집
                                  ├ ② 편성  덱 6종 선택 + AI 출격 / 온라인 매칭
                                  ├ ③ 퍽    계정당 1개 선택
                                  └ ④ 랭킹  리더보드
```

- **인증**: 이름만 입력. 이미 있으면 로드, 없으면 신규 생성 + 튜토리얼 자동 표시. 비밀번호 없음 (기획서 §12.3).
- **신규 계정**: 대표 빌드가 설계 슬롯에 미리 들어가 있고, 그중 6종이 기본 덱으로 편성되어 바로 출격 가능하다.
- **한줄소개**: 격납고 상단 "+ 내 소개" 로 편집. 매칭 화면에서 상대에게 표시된다 (AI 는 고정 태그라인).
- **저장**: 온라인 백엔드(Cloudflare) 미설정 시 `localStorage`, 설정 시 Cloudflare D1. 완전히 같은 프로필 스키마를 쓴다.

## 온라인 기능

**백엔드는 Cloudflare Workers + D1 (`worker/`), 프론트는 Cloudflare Pages.** 둘 다 이미 배포돼 있다.

- Worker: https://castle-breaker-api.castle-breaker-worker.workers.dev
- Pages: https://castle-breaker.pages.dev

### 직접 배포하려면

```bash
cd worker && npm install
npx wrangler d1 create castle-breaker-db     # database_id 를 wrangler.toml 에 반영
npx wrangler d1 migrations apply castle-breaker-db --remote
npx wrangler deploy                          # → *.workers.dev URL 확보

cd ..
cp .env.example .env.local                   # VITE_WORKER_URL 에 위 URL 기입
DEPLOY_TARGET=cfpages npm run build
npx wrangler pages project create castle-breaker
npx wrangler pages deploy dist --project-name castle-breaker
```

**구조**

```
worker/                     ★ Cloudflare Worker (별도 Node 프로젝트, 독립 배포)
├── wrangler.toml            D1 바인딩
├── migrations/0001_init.sql players / queue / matches / match_rounds
└── src/
    ├── index.ts              fetch() 라우터 — REST API 전체
    ├── db.ts                 D1 쿼리 헬퍼
    └── matchmaking.ts        서버사이드 원자적 매칭 (조건부 UPDATE)
    (../../src/sim/types, constants, builds, rng 를 그대로 import — 중복 정의 없음)

src/backend/
├── config.ts                VITE_WORKER_URL 읽기 + isCloudflareConfigured
├── types.ts                  OnlinePlayerInfo / MatchFound — AI 상대와 동일한 셰이프
└── cloudflare/
    ├── identity.ts            uid 생성 (crypto.randomUUID, localStorage 고정 — 인증 단계 자체가 없다)
    ├── http.ts                fetch 래퍼
    ├── profile.ts             /api/identify, /api/profile 호출
    ├── leaderboard.ts         /api/leaderboard 호출
    ├── matchmaking.ts         대기열 join + 폴링(1.5초)
    └── match.ts               라운드 예약 폴링(0.8초) + presence(5초)
```

**핵심 설계**: 실시간 전투 구간은 원래 설계(§11.2)대로 **네트워크 트래픽이 0**이다. 결정론 시뮬레이션이라 양쪽 클라이언트가 같은 시드 + 같은 라운드 예약만 받으면 완전히 동일한 결과를 독립적으로 계산한다. 그래서 온라인 동기화는 "라운드 경계에서 예약 하나 주고받기"로 끝난다.

**매칭이 서버 권위로 확정된다**: Worker 무료 플랜이라 Durable Objects(WebSocket)는 못 쓰고 D1 + 폴링으로 구현했지만, `/api/queue/poll` 요청을 처리하는 Worker 핸들러 자체가 이미 서버 코드이므로 매칭 페어링을 거기서 직접 확정한다 — 조건부 `UPDATE ... WHERE matched_match_id IS NULL` 하나로 동시 요청의 이중 매칭을 막는다. (이 프로젝트가 이전에 Firebase 로 시도했을 때는 Cloud Functions 없이는 이게 안 돼서 "클라이언트가 직접 트랜잭션으로 조정"하는 임시방편을 썼는데, Cloudflare Workers 는 그 자체가 서버라 이 문제가 아예 없다.)

**남은 한계**: 연결 끊김 판정은 여전히 폴링 기반 유예(§11.5, `RECONNECT_GRACE_SEC`=60초)로만 감지하고 자동 몰수패 처리는 없다 — Durable Objects(유료 플랜)로 올리면 소켓 close 이벤트로 즉시 감지·자동 처리가 가능하며, 그때는 `backend/cloudflare/matchmaking.ts` · `match.ts` 두 파일만 WebSocket 버전으로 바꾸면 된다(공개 인터페이스가 동일하게 유지되도록 설계했다).

**레거시**: `src/backend/firebase/*` 와 `firestore.rules` 는 검토 단계 산출물로 저장소에 남아있지만 `store.ts` 는 더 이상 참조하지 않는다. `.github/workflows/deploy-pages.yml` 도 그대로 둬서 GitHub Pages 미러가 계속 빌드된다 — 다만 그쪽은 `VITE_WORKER_URL` 이 없어 AI 연습만 가능하다.

## 구조

```
src/
├── sim/        ★ 순수 시뮬레이션 코어 — React·DOM·Math.random·부동소수점 없음
│   constants / parts / builds / assemble / rng / match / perks / elo / types
├── ai/         가상 플레이어 5인 + 라운드별 소환 브레인
├── backend/    로컬/온라인 백엔드 추상화 (위 참고)
├── art/        인라인 SVG 아트 — 외부 이미지·폰트 파일 0개
│   palette / motion / parts-svg / prerender / tutorial-art
├── battle/     Canvas 렌더러 · 30Hz 루프 · 전투 이펙트 · 좌표 변환
├── screens/    React 화면 (Battle=AI 연습, OnlineBattle=온라인 대전)
└── storage/    localStorage 영속화
```

**설계 원칙**: `sim/` 은 입력이 같으면 항상 같은 결과를 내는 순수 함수 집합이다. 위치는 밀리유닛 정수, 시간은 30Hz 틱, 확률은 베이시스포인트로 다뤄 부동소수점을 쓰지 않는다. 이 성질 덕분에 온라인 동기화가 "라운드 경계 문서 교환"만으로 성립한다.

## 가상 플레이어

| 이름 | 레이팅 | 패턴 | 퍽 |
|---|---|---|---|
| 고철 | 850 | `TURTLE` — 방벽과 화력을 교차 편성, 느리게 굳힌다 | 철벽 성채 |
| 질풍 | 960 | `RUSH` — 예산 100% 소진, 초반 압박 | 기동 강화 |
| 포화 | 1060 | `ARTILLERY` — 막고 긁는다 | 조준 보정 |
| 창공 | 1150 | `AIR` — R1만 절약해 폭격기 확보 | 공습 지원 |
| 총사령관 | 1280 | `ADAPTIVE` — 전장을 읽고 부족한 축을 보강 | 퍽 무효화 |

**공정성**: AI는 `s.units` — 이미 전장에 나와 있는 유닛 — 만 읽는다. 플레이어가 이번 라운드에 예약 중인 내용은 어떤 경로로도 참조하지 않는다 (기획서 §11.4 블라인드 규칙을 AI에게도 동일 적용).

## 퍽 (계정당 1개)

`src/sim/perks.ts`. 개전 자금 / 경제 강화 / 조준 보정 / 장갑 강화 / 기동 강화 / 연사 정비 / 철벽 성채(+HP, 피격 반사) / 방어 결계(성 근처 적 감속) / 공습 지원(주기적 폭격) / 퍽 무효화(상대 퍽 무력화). 상대가 무효화를 들면 내 정적 스텟 보정과 경제·방어 효과가 전부 꺼진다 — `npm run sim -- perk` 로 10종 전부가 실제로 유리해지는지, 무효화가 실제로 상대 효과를 지우는지 검증한다.

## 전투 규칙 요점 (겹침 허용)

유닛은 **서로 겹칠 수 있다** — 아군도 적군도 충돌하지 않는다. 근접 유닛이 여러 기 있어도 뒷줄이 앞줄에 막혀 놀지 않고 전부 교전에 참가한다. 예외로 **공격력 0인 유닛(순수 방벽)은 같은 레인 최전방 적과 접촉 거리에서 멈춰** 방패 역할을 한다. 화면에서는 겹친 유닛을 계단식으로 살짝 밀어 올려 구분한다 (기획서 §9.2, §12.9.2).

## 조작

| 위치 | 조작 |
|---|---|
| 조립소 | 파츠 카드 클릭 = 장착 / 슬롯 칩 클릭 = 해제 / 파츠 호버 = 고스트 프리뷰 + 스텟 델타 |
| 전투 | 소환 슬롯 클릭 = +1, 우클릭 = −1, 키보드 `1`~`6` = +1 (Shift = −1), `Enter` = 준비 완료. 배속 1×/2×/4× (표시 배속의 2배로 실제 진행) |

## 알려진 제약

- 전투 루프는 `requestAnimationFrame` 기반이라 **탭이 백그라운드면 진행이 멈춘다** (게임으로서는 정상 동작).
- 온라인 매칭은 `VITE_WORKER_URL` 미설정 시 버튼 자체가 비활성화된다 (GitHub Pages 미러가 이 경우).
- 밸런스는 기획서 §16.2 목표를 전부 충족하지 못한다 (`npm run sim -- bal` 참고). 장거리 사거리 100~150 구간이 여전히 강하다.
