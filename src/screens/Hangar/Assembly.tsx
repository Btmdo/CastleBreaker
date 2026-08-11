import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../store';
import { assemble, clonePreset, emptyPreset, validate, weaponSlotCount } from '../../sim/assemble';
import { part, partsOf } from '../../sim/parts';
import { AA_MIN_RANGE, PRESET_SLOTS } from '../../sim/constants';
import type { PartCategory, Preset, PresetResolved } from '../../sim/types';
import { partPreviewSvg, unitLayers, type LayerName } from '../../art/parts-svg';
import { AN, ms } from '../../art/motion';
import { deletePreset, savePreset } from '../../storage/local';
import { Svg } from '../../ui/Svg';
import { attach, canAttach, detach } from './assembly-rules';

const CATS: { k: PartCategory; label: string }[] = [
  { k: 'BODY', label: '몸통' },
  { k: 'ARM', label: '팔' },
  { k: 'WEAPON', label: '무기' },
  { k: 'LEG', label: '다리' },
  { k: 'SPECIAL', label: '특수' },
];

const BAR_MAX = { stability: 180, mobility: 100, attack: 100, range: 160 };
const CAT_LAYER: Record<PartCategory, LayerName> = {
  BODY: 'body', ARM: 'arm', WEAPON: 'weapon', LEG: 'leg', SPECIAL: 'special',
};

/** AN-6 가격 롤업 — 중간값을 실제로 세며 올라간다 */
/**
 * AN-6 가격 롤업 — 중간값을 실제로 세며 올라간다.
 * React state 로 돌리면 조립소 전체가 초당 60회 리렌더되므로 DOM 을 직접 갱신한다.
 */
function useRollup(ref: React.RefObject<HTMLElement>, target: number, duration: number) {
  const last = useRef(target);
  // textContent 의 소유권을 이 이펙트가 갖는다. JSX 로 값을 렌더하면
  // 리렌더마다 최종값이 덮어써져 롤업이 눈에 보이지 않는다.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const a = last.current;
    if (a === target || duration === 0) {
      last.current = target;
      el.textContent = String(target);
      return;
    }
    const start = performance.now();
    let id = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - t, 3);
      const nv = Math.round(a + (target - a) * e);
      last.current = nv;
      el.textContent = String(nv);
      if (t < 1) id = requestAnimationFrame(step);
    };
    el.textContent = String(a);
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [ref, target, duration]);
}

interface Fly { id: number; svg: string; dx: number; dy: number; x: number; y: number; w: number; h: number }
interface Ring { id: number; x: number; y: number }

export function Assembly() {
  const profile = useApp((s) => s.profile)!;
  const setProfile = useApp((s) => s.setProfile);

  const [cat, setCat] = useState<PartCategory>('BODY');
  const [draft, setDraft] = useState<Preset>(() =>
    profile.presets[0] ? clonePreset(profile.presets[0]) : emptyPreset(`p_${Date.now()}`),
  );
  const [hover, setHover] = useState<string | null>(null);
  const [flies, setFlies] = useState<Fly[]>([]);
  const [rings, setRings] = useState<Ring[]>([]);
  const [shake, setShake] = useState(false);
  const [saved, setSaved] = useState(false);
  const [rejectSlot, setRejectSlot] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [flashLayer, setFlashLayer] = useState<LayerName | null>(null);
  const [staggerAt, setStaggerAt] = useState(0);
  const [thresholdHit, setThresholdHit] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const prevRef = useRef<PresetResolved | null>(null);

  const resolved = useMemo(() => assemble(draft), [draft]);
  const errors = useMemo(() => validate(draft), [draft]);
  const preview = useMemo(() => {
    if (!hover) return null;
    const r = attach(draft, hover);
    return r.ok ? assemble(r.preset) : null;
  }, [hover, draft]);

  const shown = preview ?? resolved;
  const priceRef = useRef<HTMLSpanElement>(null);
  useRollup(priceRef, shown.cost, ms(AN.priceRollMs));

  // 대공/공대지 문턱을 넘긴 순간 강조 (§12.6.1)
  useEffect(() => {
    const prev = prevRef.current;
    if (prev && (prev.canHitAir !== resolved.canHitAir || prev.canHitGround !== resolved.canHitGround)) {
      setThresholdHit(true);
      const t = setTimeout(() => setThresholdHit(false), 800);
      return () => clearTimeout(t);
    }
    prevRef.current = resolved;
  }, [resolved]);
  useEffect(() => { prevRef.current = resolved; }, [resolved]);

  const flash = useCallback((layer: LayerName) => {
    setFlashLayer(layer);
    setTimeout(() => setFlashLayer(null), ms(AN.attachFlashMs) || 1);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), AN.toastMs);
  }, []);

  /** AN-1~AN-6: 파츠 장착 */
  const onPartClick = (partId: string, e: React.MouseEvent<HTMLDivElement>) => {
    const res = attach(draft, partId);
    if (!res.ok) {
      // AN-8 거부 — 슬롯 흔들림 + 사유 토스트
      setRejectSlot(res.slotHint);
      setTimeout(() => setRejectSlot(null), AN.rejectShakeMs);
      showToast(res.reason);
      return;
    }

    setDraft(res.preset); // 즉시 반영 — 가격·스텟은 같은 프레임에 갱신된다 (§12.6.1)

    const stage = stageRef.current?.getBoundingClientRect();
    const card = e.currentTarget.getBoundingClientRect();
    if (stage && ms(AN.attachFlyMs)) {
      const tw = 74, th = 74;
      const tx = stage.left + stage.width / 2 - tw / 2;
      const ty = stage.top + stage.height / 2 - th / 2;
      const id = ++seq.current;
      setFlies((f) => [
        ...f,
        {
          id, svg: partPreviewSvg(partId, 'P1'),
          x: tx, y: ty, w: tw, h: th,
          dx: card.left + card.width / 2 - (tx + tw / 2),
          dy: card.top + card.height / 2 - (ty + th / 2),
        },
      ]);
      setTimeout(() => {
        setFlies((f) => f.filter((x) => x.id !== id));
        // AN-2 링
        setRings((r) => [...r, { id, x: tx + tw / 2, y: ty + th / 2 }]);
        setTimeout(() => setRings((r) => r.filter((x) => x.id !== id)), AN.attachRingMs);
        // AN-3 셰이크 + AN-4 플래시
        setShake(true);
        setTimeout(() => setShake(false), AN.attachShakeMs);
        flash(CAT_LAYER[part(partId).category]);
      }, AN.attachFlyMs);
    } else {
      flash(CAT_LAYER[part(partId).category]);
    }

    if (res.dropped.length) {
      showToast(`${res.dropped.map((d) => part(d).name).join(', ')} 이(가) 분리되었습니다`);
    }
  };

  /** AN-7 해제 */
  const onSlotClick = (slot: string, filled: boolean) => {
    if (!filled) return;
    setDraft(detach(draft, slot));
  };

  /** AN-10 프리셋 로드 — 파츠가 하나씩 순차로 조립된다 */
  const loadPreset = (p: Preset) => {
    setDraft(clonePreset(p));
    setStaggerAt(performance.now());
  };

  /** AN-11 저장 */
  const doSave = () => {
    if (errors.length) { showToast(errors[0].message); return; }
    setProfile(savePreset(profile, clonePreset(draft)));
    setSaved(true);
    setTimeout(() => setSaved(false), AN.saveSweepMs);
    showToast('설계 저장됨');
  };

  const newPreset = () => {
    if (profile.presets.length >= PRESET_SLOTS) { showToast(`설계 슬롯이 가득 찼습니다 (${PRESET_SLOTS})`); return; }
    loadPreset(emptyPreset(`p_${Date.now()}`));
  };

  const doDelete = () => {
    if (!profile.presets.some((p) => p.id === draft.id)) return;
    const next = deletePreset(profile, draft.id);
    setProfile(next);
    if (next.presets[0]) loadPreset(next.presets[0]);
    else loadPreset(emptyPreset(`p_${Date.now()}`));
  };

  // ── 도면 레이어 ──
  const bp = useMemo(() => unitLayers(resolved.parts, 'P1'), [resolved]);
  const ghost = useMemo(
    () => (preview ? unitLayers(preview.parts, 'P1') : null),
    [preview],
  );

  // ── 슬롯 칩 ──
  const bodyDef = part(draft.body);
  const armSlots = bodyDef.armSlots ?? 0;
  const wSlots = weaponSlotCount(draft);
  const weaponAt = (m: string) => draft.weapons.find((w) => w.mount === m);

  const chips: { key: string; label: string; value: string | null; slot: string }[] = [
    { key: 'SPECIAL', label: '특수', value: draft.special && part(draft.special).name, slot: 'SPECIAL' },
    { key: 'BODY', label: '몸통', value: bodyDef.name, slot: 'BODY' },
    ...Array.from({ length: armSlots }, (_, i) => ({
      key: `ARM${i}`, label: `팔 ${i + 1}`,
      value: draft.arms[i] ? part(draft.arms[i]!).name : null,
      slot: `ARM${i}`,
    })),
    ...Array.from({ length: armSlots }, (_, i) => {
      const m = `ARM${i}`;
      const armDef = draft.arms[i] ? part(draft.arms[i]!) : null;
      const supports = !!armDef && (armDef.weaponMounts ?? 0) >= 1;
      return {
        key: `W:${m}`, label: `무기 (팔 ${i + 1})`,
        value: supports ? (weaponAt(m) ? part(weaponAt(m)!.part).name : null) : '—',
        slot: `W:${m}`,
      };
    }),
    { key: 'LEG', label: '다리', value: draft.leg && part(draft.leg).name, slot: 'LEG' },
  ];

  const statRow = (
    key: 'stability' | 'mobility' | 'attack' | 'range', label: string, suffix = '',
  ) => {
    const cur = resolved[key];
    const nxt = shown[key];
    const delta = nxt - cur;
    const max = BAR_MAX[key];
    return (
      <div className="stat-row" key={key}>
        <div className="top">
          <span className="k">{label}</span>
          <span>
            <span className="v mono">{nxt}{suffix}</span>
            {delta !== 0 && (
              <span className={`d ${delta > 0 ? 'up' : 'dn'}`}>
                {delta > 0 ? '+' : ''}{delta}
              </span>
            )}
          </span>
        </div>
        <div className="bar">
          <i
            className={delta > 0 ? 'up' : delta < 0 ? 'dn' : ''}
            style={{ width: `${Math.min(100, (nxt / max) * 100)}%` }}
          />
          {delta !== 0 && (
            <u style={{
              left: `${Math.min(100, (Math.min(cur, nxt) / max) * 100)}%`,
              width: `${Math.min(100, (Math.abs(delta) / max) * 100)}%`,
            }} />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="garage">
      {/* ── 좌: 설계 목록 + 파츠 ── */}
      <div className="g-col left">
        <div className="g-head">설계 슬롯 {profile.presets.length} / {PRESET_SLOTS}</div>
        <div className="g-scroll" style={{ maxHeight: 190, flex: 'none' }}>
          {profile.presets.map((p) => {
            const r = assemble(p);
            return (
              <div
                key={p.id}
                className={`preset-row ${p.id === draft.id ? 'on' : ''}`}
                onClick={() => loadPreset(p)}
              >
                <Svg className="mini" html={partPreviewSvg(p.body, 'P1')} />
                <span className="nm">{p.name}</span>
                <span className="cost mono">{r.cost}</span>
              </div>
            );
          })}
          <div className="preset-row" onClick={newPreset} style={{ color: 'var(--text2)' }}>
            <span className="mini" />
            <span className="nm">+ 새 설계</span>
          </div>
        </div>

        <div className="cat-tabs">
          {CATS.map((c) => (
            <button key={c.k} className={cat === c.k ? 'on' : ''} onClick={() => setCat(c.k)}>
              {c.label}
            </button>
          ))}
        </div>

        <div className="g-scroll" onMouseLeave={() => setHover(null)}>
          {partsOf(cat).map((d) => {
            const block = canAttach(draft, d.id);
            const equipped =
              draft.body === d.id || draft.leg === d.id || draft.special === d.id ||
              draft.arms.includes(d.id) || draft.weapons.some((w) => w.part === d.id);
            const mods: [string, number][] = [
              ['안정', d.stability ?? 0], ['기동', d.mobility ?? 0],
              ['공격', d.attack ?? 0], ['사거리', d.range ?? 0],
            ].filter(([, v]) => v !== 0) as [string, number][];
            return (
              <div
                key={d.id}
                className={`part-card ${block ? 'blocked' : ''} ${equipped ? 'equipped' : ''}`}
                title={d.blurb}
                onMouseEnter={() => !block && setHover(d.id)}
                onMouseLeave={() => setHover(null)}
                onClick={(e) => onPartClick(d.id, e)}
              >
                <Svg className="pic" html={partPreviewSvg(d.id, 'P1')} />
                <div className="info">
                  <div className="nm">{d.name}</div>
                  <div className="mods">
                    {mods.map(([k, v]) => (
                      <span key={k} className={v > 0 ? 'up' : 'dn'}>
                        {k}{v > 0 ? '+' : ''}{v}{' '}
                      </span>
                    ))}
                    {d.cycleDeci ? (
                      <span className={d.cycleDeci < 0 ? 'up' : 'dn'}>
                        주기{d.cycleDeci > 0 ? '+' : ''}{(d.cycleDeci / 10).toFixed(1)}s
                      </span>
                    ) : null}
                    {d.canFly && <span className="up">비행</span>}
                    {d.weaponMounts ? <span> 무기칸+{d.weaponMounts}</span> : null}
                    {d.armSlots ? <span> 팔{d.armSlots}칸</span> : null}
                  </div>
                </div>
                <span className="pc mono">{d.cost}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 중: 조립 도면 ── */}
      <div className={`blueprint ${shake ? 'shake' : ''} ${saved ? 'saved' : ''}`}>
        <div className="bp-stage" ref={stageRef}>
          <div className="bp-unit">
            {bp.layers.map((l, i) => (
              <svg
                // staggerAt 을 key 에 넣어야 프리셋을 다시 불러올 때 AN-10 순차 조립이
                // 재생된다 (key 가 같으면 CSS 애니메이션이 다시 트리거되지 않는다)
                key={`${l.name}@${staggerAt}`}
                viewBox={bp.viewBox}
                preserveAspectRatio="xMidYMid meet"
                style={{
                  position: 'absolute', inset: 0,
                  animation: staggerAt
                    ? `layIn ${ms(220)}ms var(--ease) ${i * ms(AN.presetStaggerMs)}ms both`
                    : undefined,
                  filter: flashLayer === l.name ? 'brightness(2.6)' : undefined,
                  transition: 'filter .14s',
                }}
                dangerouslySetInnerHTML={{ __html: l.inner }}
              />
            ))}
          </div>
          {ghost && (
            <div className="bp-ghost">
              <svg viewBox={ghost.viewBox} preserveAspectRatio="xMidYMid meet"
                   dangerouslySetInnerHTML={{ __html: ghost.layers.map((l) => l.inner).join('') }} />
            </div>
          )}
        </div>

        <div className="bp-slots">
          {chips.map((c) => (
            <div
              key={c.key}
              className={
                `slot-chip ${c.value && c.value !== '—' ? 'filled' : ''} ` +
                `${rejectSlot === c.slot || (rejectSlot === 'WEAPON' && c.slot.startsWith('W:')) ? 'reject' : ''} ` +
                `${hover && part(hover).category === 'WEAPON' && c.slot.startsWith('W:') && !c.value ? 'pulse' : ''}`
              }
              onClick={() => onSlotClick(c.slot, !!c.value && c.value !== '—')}
              title={c.value && c.value !== '—' ? '클릭하면 해제' : ''}
            >
              <div className="lbl">{c.label}</div>
              <div className={`val ${c.value ? '' : 'empty'}`}>{c.value ?? '비어 있음'}</div>
            </div>
          ))}
        </div>

        <div className="bp-name">
          <input
            value={draft.name}
            maxLength={16}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <span className="tag mono">무기 {draft.weapons.length}/{wSlots}</span>
        </div>
        <div className="bp-err">{errors[0]?.message ?? ''}</div>
        <div className="bp-actions">
          <button className="btn primary" onClick={doSave} disabled={errors.length > 0}>저장</button>
          <button className="btn ghost danger" onClick={doDelete}>삭제</button>
        </div>
      </div>

      {/* ── 우: 스텟 패널 ── */}
      <div className="g-col right">
        <div className="g-head">스테이터스</div>
        <div className="stat-panel">
          <div className="price-big">
            <span className="lb">총 가격</span>
            <span className="vv mono" ref={priceRef} />
          </div>

          {statRow('stability', '안정성 (HP)')}
          {statRow('mobility', '기동성')}
          {statRow('attack', '공격력')}
          {statRow('range', '사거리', 'u')}

          <div className="derived">
            <div><span className="k">이동속도</span><span className="v mono">{shown.speedUps} u/s</span></div>
            <div><span className="k">회피율</span><span className="v mono">{(shown.evasionBp / 100).toFixed(2)}%</span></div>
            <div><span className="k">공격 주기</span><span className="v mono">{shown.cycleSec.toFixed(2)}초</span></div>
            <div><span className="k">DPS</span><span className="v mono">{shown.dps.toFixed(1)}</span></div>
            <div><span className="k">전장 횡단</span><span className="v mono">
              {shown.speedUps > 0 ? `${(600 / shown.speedUps).toFixed(1)}초` : '이동 불가'}
            </span></div>
          </div>

          <div className="derived" style={{ marginTop: 10 }}>
            <div><span className="k">비행</span>
              <span className={`v ${shown.canFly ? 'yes' : ''}`}>{shown.canFly ? '가능' : '불가'}</span>
            </div>
            <div className={thresholdHit ? 'flashline' : ''}>
              <span className="k">대공 (지상→공중)</span>
              <span className={`v ${shown.canHitAir ? 'yes' : 'no'}`}>
                {shown.canHitAir ? '✓ 가능' : `✗ 사거리 ${AA_MIN_RANGE} 필요 (현재 ${shown.range})`}
              </span>
            </div>
            <div className={thresholdHit ? 'flashline' : ''}>
              <span className="k">공대지 (공중→지상)</span>
              <span className={`v ${shown.canHitGround ? 'yes' : 'no'}`}>
                {shown.canHitGround ? '✓ 가능' : '✗ 사거리가 0보다 커야 함'}
              </span>
            </div>
            {shown.splashRadius > 0 && (
              <div><span className="k">범위 공격</span><span className="v yes">반경 {shown.splashRadius}u</span></div>
            )}
          </div>

          <p style={{ color: 'var(--text3)', fontSize: 11, marginTop: 12, lineHeight: 1.6 }}>
            파츠에 마우스를 올리면 장착 시 변화량이 미리 보입니다.
            슬롯을 클릭하면 해제됩니다.
          </p>
        </div>
      </div>

      {/* ── 연출 오버레이 ── */}
      {flies.map((f) => (
        <div
          key={f.id}
          className="fly-part"
          style={{
            left: f.x, top: f.y, width: f.w, height: f.h,
            ['--dx' as string]: `${f.dx}px`, ['--dy' as string]: `${f.dy}px`,
            animation: `flyPart ${AN.attachFlyMs}ms var(--ease) forwards`,
          }}
          dangerouslySetInnerHTML={{ __html: f.svg }}
        />
      ))}
      {rings.map((r) => (
        <div key={r.id} className="attach-ring" style={{ left: r.x, top: r.y }} />
      ))}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
