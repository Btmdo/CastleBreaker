import { useState } from 'react';
import { useApp } from '../../store';
import { Assembly } from './Assembly';
import { DeckEdit } from './DeckEdit';
import { PerkPicker } from './PerkPicker';
import { Leaderboard } from './Leaderboard';
import { Tutorial } from './Tutorial';
import { BioEditor } from './BioEditor';
import { Result } from '../Result';

/** 기획서 §12.4 — 「{이름}의 격납고」 */
export function Hangar() {
  const profile = useApp((s) => s.profile);
  const tab = useApp((s) => s.hangarTab);
  const setTab = useApp((s) => s.setHangarTab);
  const tutorialOpen = useApp((s) => s.tutorialOpen);
  const openTutorial = useApp((s) => s.openTutorial);
  const goMain = useApp((s) => s.goMain);
  const result = useApp((s) => s.result);
  const [bioOpen, setBioOpen] = useState(false);

  if (!profile) return null;

  return (
    <div className="hangar">
      <div className="hangar-head">
        <div className="hangar-title">
          <span className="who">{profile.displayName}</span>의 격납고
        </div>
        <div className="hangar-meta">
          <span>레이팅 <b className="mono">{profile.rating.toLocaleString()}</b></span>
          <span>
            전적 <b className="mono">{profile.wins}승 {profile.draws}무 {profile.losses}패</b>
          </span>
        </div>
        <div className="sp" />
        <button className="btn ghost" onClick={() => setBioOpen(true)}>
          {profile.bio ? '내 소개 수정' : '+ 내 소개'}
        </button>
        <button className="btn ghost" onClick={openTutorial}>? 튜토리얼</button>
        <button className="btn ghost" onClick={goMain}>나가기</button>
        <button className="btn primary" onClick={() => setTab('deck')}>출격 준비</button>
      </div>

      <div className="tabs">
        <button className={tab === 'design' ? 'on' : ''} onClick={() => setTab('design')}>① 설계</button>
        <button className={tab === 'deck' ? 'on' : ''} onClick={() => setTab('deck')}>② 편성</button>
        <button className={tab === 'perk' ? 'on' : ''} onClick={() => setTab('perk')}>③ 퍽</button>
        <button className={tab === 'rank' ? 'on' : ''} onClick={() => setTab('rank')}>④ 랭킹</button>
      </div>

      <div className="hangar-body">
        {tab === 'design' && <Assembly />}
        {tab === 'deck' && <DeckEdit />}
        {tab === 'perk' && <PerkPicker />}
        {tab === 'rank' && <Leaderboard />}
      </div>

      {tutorialOpen && <Tutorial />}
      {result && <Result />}
      {bioOpen && <BioEditor onClose={() => setBioOpen(false)} />}
    </div>
  );
}
