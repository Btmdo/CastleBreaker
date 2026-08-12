/**
 * Firebase 연결 설정. 값은 전부 Vite 환경변수(`VITE_FIREBASE_*`)에서 읽는다.
 *
 * 이 프로토타입은 "Firebase 연결 자체"만 비워둔 상태로 배포된다 — 코드는 전부
 * 완성돼 있고, 아래 환경변수만 채우면 즉시 온라인 기능이 살아난다.
 *   VITE_FIREBASE_API_KEY
 *   VITE_FIREBASE_AUTH_DOMAIN
 *   VITE_FIREBASE_PROJECT_ID
 *   VITE_FIREBASE_STORAGE_BUCKET
 *   VITE_FIREBASE_MESSAGING_SENDER_ID
 *   VITE_FIREBASE_APP_ID
 *
 * 값이 비어 있으면 앱 전체가 자동으로 오프라인(AI 연습) 모드로만 동작한다.
 * `.env.example` 참고.
 */

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

const env = import.meta.env;

export const FIREBASE_CONFIG: FirebaseWebConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? '',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: env.VITE_FIREBASE_APP_ID ?? '',
};

/** apiKey 와 projectId 가 둘 다 채워져 있어야 온라인 기능을 켠다 */
export const isFirebaseConfigured =
  FIREBASE_CONFIG.apiKey.length > 0 && FIREBASE_CONFIG.projectId.length > 0;

/**
 * Cloudflare Worker 연결 설정. 실제로 쓰는 온라인 백엔드는 이쪽이다 —
 * `store.ts` 는 `isFirebaseConfigured` 대신 `isCloudflareConfigured` 를 본다.
 * 위 Firebase 코드는 삭제하지 않고 그대로 둔 것뿐, 어디서도 참조하지 않는다.
 */
export const WORKER_URL = (import.meta.env.VITE_WORKER_URL ?? '').replace(/\/$/, '');

export const isCloudflareConfigured = WORKER_URL.length > 0;

/** 매칭 대기열 폴링 주기 (ms) */
export const QUEUE_POLL_MS = 1500;
/** 라운드 예약 폴링 주기 (ms) */
export const ROUND_POLL_MS = 800;
