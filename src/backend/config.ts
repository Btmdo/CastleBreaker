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
