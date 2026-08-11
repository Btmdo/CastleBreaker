import { useState } from 'react';
import { useApp } from '../store';
import { NAME_MAX_LEN } from '../sim/constants';
import { validateName } from '../storage/local';

/**
 * 기획서 §12.3 플레이어 인증.
 * 이름이 이미 있으면 그 데이터를 로드하고, 없으면 신규로 시작한다.
 * 비밀번호는 없다 — 지정 인원 내부용이라는 전제 (§12.3 보안 정책).
 */
export function Identify() {
  const doIdentify = useApp((s) => s.doIdentify);
  const goMain = useApp((s) => s.goMain);
  const busy = useApp((s) => s.identifyBusy);
  const remoteErr = useApp((s) => s.identifyError);
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    if (busy) return;
    const e = validateName(name);
    if (e) { setErr(e); return; }
    void doIdentify(name);
  };

  return (
    <div className="modal-veil" onMouseDown={(e) => { if (e.target === e.currentTarget) goMain(); }}>
      <div className="modal">
        <h2>조종사 등록</h2>
        <div className="hint">
          이름만 입력하면 됩니다. 이미 쓴 이름이면 그 기록을 이어서, 처음이면 새로 시작합니다.
        </div>

        <div className="name-field">
          <input
            autoFocus
            value={name}
            maxLength={NAME_MAX_LEN}
            placeholder="이름 (2~12자)"
            onChange={(e) => { setName(e.target.value); setErr(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            disabled={busy}
          />
          <span className="count mono">{name.trim().length}/{NAME_MAX_LEN}</span>
        </div>
        <div className="field-err">{err ?? remoteErr ?? ''}</div>

        <div className="modal-actions">
          <button className="btn ghost" onClick={goMain} disabled={busy}>취소</button>
          <button className="btn primary" onClick={submit} disabled={busy}>
            {busy ? '접속 중…' : '접속'}
          </button>
        </div>
      </div>
    </div>
  );
}
