import { useState } from 'react';
import { useApp } from '../../store';
import { BIO_MAX_LEN } from '../../sim/constants';

/**
 * 한줄소개 편집 모달. 매칭 화면에서 상대에게 표시된다 (AI 상대의 tagline 과 동일한 자리).
 */
export function BioEditor({ onClose }: { onClose: () => void }) {
  const profile = useApp((s) => s.profile)!;
  const setProfile = useApp((s) => s.setProfile);
  const [text, setText] = useState(profile.bio);

  const save = () => {
    setProfile({ ...profile, bio: text.trim().slice(0, BIO_MAX_LEN) });
    onClose();
  };

  return (
    <div className="modal-veil" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <h2>한줄소개</h2>
        <div className="hint">매칭 화면에서 상대에게 표시됩니다. 각오나 소개를 자유롭게 적어보세요.</div>

        <div className="name-field" style={{ height: 'auto', padding: '10px 14px' }}>
          <textarea
            autoFocus
            value={text}
            maxLength={BIO_MAX_LEN}
            placeholder="예: 방벽 뒤에서 웃는 남자"
            onChange={(e) => setText(e.target.value)}
            style={{
              flex: 1, background: 'transparent', border: 0, outline: 'none', resize: 'none',
              font: 'inherit', color: 'inherit', minHeight: 56, width: '100%',
            }}
          />
        </div>
        <div className="field-err" style={{ color: 'var(--text3)' }}>
          {text.trim().length}/{BIO_MAX_LEN}
        </div>

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>취소</button>
          <button className="btn primary" onClick={save}>저장</button>
        </div>
      </div>
    </div>
  );
}
