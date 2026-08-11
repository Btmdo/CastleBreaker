import { onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth';
import { getFirebaseAuth } from './app';

/**
 * 익명 인증 — 표시 이름은 Firestore 프로필 문서에 따로 저장한다 (§12.3 그대로,
 * 계정은 이름만으로 식별되고 비밀번호가 없다는 원칙을 온라인에서도 유지).
 * uid 는 기기별로 고정되므로, 같은 이름을 다른 기기에서 쓰면 별개의 uid가 된다 —
 * 로컬 버전의 "이름 중복 접속 시 세션 탈취" 문제와는 다른 종류의 제약이며,
 * Cloud Functions 없이는 이름-계정 매핑 검증을 서버에서 강제할 수 없다.
 */
export function waitForAuth(): Promise<User> {
  const auth = getFirebaseAuth();
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(
      auth,
      (user) => {
        unsub();
        if (user) resolve(user);
        else signInAnonymously(auth).then((cred) => resolve(cred.user)).catch(reject);
      },
      reject,
    );
  });
}
