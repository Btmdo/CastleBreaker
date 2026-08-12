import type { PlayerProfile } from '../../sim/types';
import { apiPost, apiPut } from './http';

/** 기획서 §12.3 — 이름 조회 후 존재하면 로드, 없으면 신규 생성 (Worker `/api/identify`) */
export async function identifyOnline(
  uid: string, displayName: string,
): Promise<{ profile: PlayerProfile; isNew: boolean }> {
  return apiPost('/api/identify', { uid, displayName });
}

export async function saveProfileOnline(uid: string, profile: PlayerProfile): Promise<void> {
  await apiPut(`/api/profile/${uid}`, profile);
}
