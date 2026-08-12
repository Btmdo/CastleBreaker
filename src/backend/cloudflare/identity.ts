/**
 * Cloudflare 백엔드에는 인증 공급자가 없다 (Firebase Anonymous Auth 같은 비동기
 * 로그인 단계 자체가 없음). 기기별로 `crypto.randomUUID()`를 한 번 생성해
 * localStorage 에 고정하고, 그게 곧 이 기기의 uid 가 된다.
 *
 * 기획서 §12.3 의 "비밀번호 없음, 이름만으로 식별" 신뢰 모델과 동급이다 — uid 를
 * 아는 사람은 그 uid 로 행세할 수 있지만, 애초에 uid 는 이 기기 밖으로 나가지
 * 않으므로 로컬 버전보다 오히려 더 안전하다(이름 중복 문제도 없다: 표시 이름은
 * uid 와 별개 필드라 겹쳐도 무방).
 */
const KEY = 'castle-breaker/cf-uid';

export function getOrCreateUid(): string {
  let uid = localStorage.getItem(KEY);
  if (!uid) {
    uid = crypto.randomUUID();
    localStorage.setItem(KEY, uid);
  }
  return uid;
}
