import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { FIREBASE_CONFIG, isFirebaseConfigured } from '../config';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

/**
 * 지연 초기화 — 설정값이 없으면 절대 Firebase SDK를 건드리지 않는다.
 * (초기화 자체가 네트워크 요청을 만들진 않지만, 빈 apiKey로 초기화 시도하면
 * 콘솔에 오류가 찍히므로 방지한다)
 */
function ensureApp(): FirebaseApp {
  if (!isFirebaseConfigured) {
    throw new Error('Firebase 설정이 없습니다. .env.local 에 VITE_FIREBASE_* 값을 채워주세요.');
  }
  if (!app) app = initializeApp(FIREBASE_CONFIG);
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!auth) auth = getAuth(ensureApp());
  return auth;
}

export function getFirebaseDb(): Firestore {
  if (!db) db = getFirestore(ensureApp());
  return db;
}
