import {
  doc, getDoc, serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore';
import { getFirebaseDb } from './app';
import { bonusPresets, starterPresets } from '../../sim/builds';
import * as C from '../../sim/constants';
import type { PlayerProfile } from '../../sim/types';

const COLLECTION = 'players';

/** Firestore 문서 → PlayerProfile. 로컬 저장 스키마와 완전히 동일하다 (§13). */
function fromDoc(uid: string, data: Record<string, unknown>): PlayerProfile {
  return {
    name: uid,
    displayName: (data.displayName as string) ?? '',
    rating: (data.rating as number) ?? C.RATING_START,
    wins: (data.wins as number) ?? 0,
    draws: (data.draws as number) ?? 0,
    losses: (data.losses as number) ?? 0,
    tutorialSeen: (data.tutorialSeen as boolean) ?? false,
    presets: (data.presets as PlayerProfile['presets']) ?? [],
    decks: (data.decks as PlayerProfile['decks']) ?? [],
    activeDeckId: (data.activeDeckId as string | null) ?? null,
    perk: (data.perk as PlayerProfile['perk']) ?? null,
    bio: (data.bio as string) ?? '',
    createdAt: (data.createdAt as number) ?? Date.now(),
    lastSeenAt: (data.lastSeenAt as number) ?? Date.now(),
  };
}

function toDoc(p: PlayerProfile) {
  // uid(name)/lastSeenAt 은 문서 경로/서버 타임스탬프로 관리하므로 페이로드에서 뺀다
  const { name: _name, lastSeenAt: _lastSeenAt, ...rest } = p;
  void _name; void _lastSeenAt;
  return { ...rest, lastSeenAt: serverTimestamp() };
}

/** 기획서 §12.3 — 이름 조회 후 존재하면 로드, 없으면 신규 생성 (uid 기준) */
export async function loadOrCreateProfile(
  uid: string, displayName: string,
): Promise<{ profile: PlayerProfile; isNew: boolean }> {
  const ref = doc(getFirebaseDb(), COLLECTION, uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return { profile: fromDoc(uid, snap.data()), isNew: false };
  }

  const presets = [...starterPresets(), ...bonusPresets()];
  const profile: PlayerProfile = {
    name: uid,
    displayName,
    rating: C.RATING_START,
    wins: 0, draws: 0, losses: 0,
    tutorialSeen: false,
    presets,
    decks: [{ id: 'deck_1', name: '기본 편성', slots: presets.slice(0, C.DECK_SIZE).map((p) => p.id) }],
    activeDeckId: 'deck_1',
    perk: null,
    bio: '',
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
  };
  await setDoc(ref, { ...toDoc(profile), createdAt: profile.createdAt });
  return { profile, isNew: true };
}

export async function saveProfile(uid: string, profile: PlayerProfile): Promise<void> {
  await setDoc(doc(getFirebaseDb(), COLLECTION, uid), toDoc(profile), { merge: true });
}

export async function bumpTutorialSeen(uid: string): Promise<void> {
  await updateDoc(doc(getFirebaseDb(), COLLECTION, uid), { tutorialSeen: true });
}
