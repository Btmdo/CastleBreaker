import { useApp } from './store';
import { Main } from './screens/Main';
import { Identify } from './screens/Identify';
import { Hangar } from './screens/Hangar/Hangar';
import { Matching } from './screens/Matching';
import { Battle } from './screens/Battle';
import { OnlineMatching } from './screens/OnlineMatching';
import { OnlineBattle } from './screens/OnlineBattle';

/**
 * 기획서 §1.4 게임 플레이 흐름
 *   메인 페이지 → 플레이어 인증 → 「{이름}의 격납고」 → 매칭 → 전투 → 격납고 (반복)
 *
 * MATCHING/BATTLE 는 opponentMode 에 따라 AI 연습 화면과 온라인 화면 중 하나로 갈린다.
 */
export function App() {
  const screen = useApp((s) => s.screen);
  const opponentMode = useApp((s) => s.opponentMode);

  switch (screen) {
    case 'MAIN':
      return <Main />;
    case 'IDENTIFY':
      return (
        <>
          <Main />
          <Identify />
        </>
      );
    case 'HANGAR':
      return <Hangar />;
    case 'MATCHING':
      return opponentMode === 'online' ? <OnlineMatching /> : <Matching />;
    case 'BATTLE':
      return opponentMode === 'online' ? <OnlineBattle /> : <Battle />;
  }
}
