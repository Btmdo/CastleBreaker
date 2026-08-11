import { useApp } from '../../store';
import { PERKS } from '../../sim/perks';
import type { PerkId } from '../../sim/types';

/** 계정당 정확히 1개 선택하는 퍽. 선택 즉시 저장된다 (매치 시작 시점 값으로 고정 사용). */
export function PerkPicker() {
  const profile = useApp((s) => s.profile)!;
  const setProfile = useApp((s) => s.setProfile);

  const choose = (id: PerkId) => {
    setProfile({ ...profile, perk: profile.perk === id ? null : id });
  };

  return (
    <div className="perk-wrap">
      <div className="perk-head">
        <h3>퍽 — 한 개만 선택</h3>
        <p>대전 내내 적용되는 고정 효과입니다. 다시 클릭하면 선택이 해제됩니다.</p>
      </div>
      <div className="perk-grid">
        {PERKS.map((p) => {
          const on = profile.perk === p.id;
          return (
            <button
              key={p.id}
              className={`perk-card ${on ? 'on' : ''}`}
              onClick={() => choose(p.id)}
            >
              <div className="perk-top">
                <span className="perk-tag2">{p.tag}</span>
                <span className="perk-name">{p.name}</span>
              </div>
              <div className="perk-desc">{p.desc}</div>
              {on && <div className="perk-check">✓ 선택됨</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
