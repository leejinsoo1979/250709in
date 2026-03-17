import React, { useState, useEffect } from 'react';
import { getSpaceConfigDefaults, updateSpaceConfigDefaults, SpaceConfigDefaults } from '@/firebase/userProfiles';
import commonStyles from '@/editor/shared/controls/styles/common.module.css';
import styles from './SpaceDefaultsModal.module.css';

interface SpaceDefaultsModalProps {
  onClose: () => void;
}

const SYSTEM_DEFAULTS: Required<SpaceConfigDefaults> = {
  width: 3600,
  height: 2360,
  gapLeft: 1.5,
  gapRight: 1.5,
  frameTop: 30,
  frameLeft: 18,
  frameRight: 18,
  baseHeight: 65,
  furnitureSingleWidth: 500,
  furnitureDualWidth: 1000,
  surroundMode: 'full-surround',
  installType: 'builtin',
  droppedCeilingEnabled: false,
  droppedCeilingPosition: 'right',
  droppedCeilingWidth: 1300,
  droppedCeilingDropHeight: 200,
};

const SURROUND_OPTIONS: { id: NonNullable<SpaceConfigDefaults['surroundMode']>; label: string }[] = [
  { id: 'full-surround', label: '전체서라운드' },
  { id: 'sides-only', label: '양쪽서라운드' },
  { id: 'no-surround', label: '노서라운드' },
];

const INSTALL_OPTIONS: { id: NonNullable<SpaceConfigDefaults['installType']>; label: string }[] = [
  { id: 'builtin', label: '빌트인' },
  { id: 'semistanding', label: '반빌트인' },
  { id: 'freestanding', label: '스탠딩' },
];

/* ── NumberInput ── */
interface NumberInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

const NumberInput: React.FC<NumberInputProps> = ({ label, value, onChange, min, max, step = 1, unit = 'mm' }) => (
  <div className={styles.numberInput}>
    <div className={styles.inputLabel}>{label}</div>
    <div className={styles.inputGroup}>
      <button className={styles.inputButton} onClick={() => onChange(Math.max(min || 0, value - step))} disabled={value <= (min || 0)}>−</button>
      <div className={styles.inputField}>
        <input type="number" value={value} onChange={(e) => { const v = Number(e.target.value); onChange(Math.max(min || 0, Math.min(max || Infinity, v))); }} min={min} max={max} step={step} />
        <span className={styles.inputUnit}>{unit}</span>
      </div>
      <button className={styles.inputButton} onClick={() => onChange(Math.min(max || Infinity, value + step))} disabled={value >= (max || Infinity)}>+</button>
    </div>
  </div>
);

/* ── ToggleGroup ── */
const Toggle: React.FC<{ options: { id: string; label: string }[]; selected: string; onChange: (id: string) => void }> = ({ options, selected, onChange }) => (
  <div className={commonStyles.toggleButtonGroup}>
    {options.map(opt => (
      <button key={opt.id} className={`${commonStyles.toggleButton} ${selected === opt.id ? commonStyles.toggleButtonActive : ''}`} onClick={() => onChange(opt.id)}>
        {opt.label}
      </button>
    ))}
  </div>
);

/* ── Main Modal ── */
const SpaceDefaultsModal: React.FC<SpaceDefaultsModalProps> = ({ onClose }) => {
  const [values, setValues] = useState<Required<SpaceConfigDefaults>>(SYSTEM_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    const load = async () => {
      const defaults = await getSpaceConfigDefaults();
      if (defaults) {
        setValues(prev => ({
          ...prev,
          ...Object.fromEntries(Object.entries(defaults).filter(([, v]) => v !== undefined)),
        }));
      }
      setLoading(false);
    };
    load();
  }, []);

  const set = <K extends keyof SpaceConfigDefaults>(key: K, value: SpaceConfigDefaults[K]) => {
    setValues(prev => ({ ...prev, [key]: value }));
    setMessage(null);
  };

  const h = (key: keyof SpaceConfigDefaults) => (v: number) => set(key, v);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await updateSpaceConfigDefaults(values);
    setMessage(error ? { text: error, type: 'error' } : { text: '저장되었습니다.', type: 'success' });
    setSaving(false);
  };

  if (loading) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>공간설정 기본값</h3>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>

        <div className={styles.body}>
          <div className={styles.notice}>새 프로젝트에서부터 적용됩니다.</div>

          {/* 공간유형 */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>공간유형</div>
            <Toggle options={INSTALL_OPTIONS} selected={values.installType} onChange={(id) => set('installType', id as any)} />
          </div>

          {/* 공간 크기 */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>공간 크기</div>
            <div className={styles.row}>
              <NumberInput label="너비 (W)" value={values.width} onChange={h('width')} min={1000} max={8000} step={100} />
              <NumberInput label="높이 (H)" value={values.height} onChange={h('height')} min={2000} max={3000} step={100} />
            </div>
          </div>

          {/* 단내림 */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>단내림</div>
            <Toggle
              options={[{ id: 'no', label: '없음' }, { id: 'yes', label: '있음' }]}
              selected={values.droppedCeilingEnabled ? 'yes' : 'no'}
              onChange={(id) => set('droppedCeilingEnabled', id === 'yes')}
            />
            {values.droppedCeilingEnabled && (
              <>
                <div className={styles.row} style={{ marginTop: 6 }}>
                  <div className={styles.numberInput}>
                    <div className={styles.inputLabel}>위치</div>
                    <Toggle
                      options={[{ id: 'left', label: '좌측' }, { id: 'right', label: '우측' }]}
                      selected={values.droppedCeilingPosition}
                      onChange={(id) => set('droppedCeilingPosition', id as any)}
                    />
                  </div>
                  <NumberInput label="내림높이" value={values.droppedCeilingDropHeight} onChange={h('droppedCeilingDropHeight')} min={50} max={500} step={10} />
                </div>
                <NumberInput label="단내림 너비" value={values.droppedCeilingWidth} onChange={h('droppedCeilingWidth')} min={600} max={2400} step={100} />
              </>
            )}
          </div>

          {/* 이격거리 */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>이격거리</div>
            <div className={styles.row}>
              <NumberInput label="좌측" value={values.gapLeft} onChange={h('gapLeft')} min={0} max={100} step={0.5} />
              <NumberInput label="우측" value={values.gapRight} onChange={h('gapRight')} min={0} max={100} step={0.5} />
            </div>
          </div>

          {/* 프레임 타입 */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>프레임 타입</div>
            <Toggle options={SURROUND_OPTIONS} selected={values.surroundMode} onChange={(id) => set('surroundMode', id as any)} />
          </div>

          {/* 프레임 사이즈 */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>프레임 사이즈</div>
            <div className={styles.row}>
              <NumberInput label="상부" value={values.frameTop} onChange={h('frameTop')} min={0} max={200} step={1} />
              <NumberInput label="하부" value={values.baseHeight} onChange={h('baseHeight')} min={0} max={200} step={1} />
            </div>
            {values.surroundMode !== 'no-surround' && (
              <div className={styles.row}>
                <NumberInput label="좌측" value={values.frameLeft} onChange={h('frameLeft')} min={0} max={200} step={1} />
                <NumberInput label="우측" value={values.frameRight} onChange={h('frameRight')} min={0} max={200} step={1} />
              </div>
            )}
          </div>

          {/* 가구 배치 기본 너비 */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>가구 배치 기본 너비</div>
            <div className={styles.row}>
              <NumberInput label="싱글" value={values.furnitureSingleWidth} onChange={h('furnitureSingleWidth')} min={200} max={1200} step={10} />
              <NumberInput label="듀얼" value={values.furnitureDualWidth} onChange={h('furnitureDualWidth')} min={400} max={2400} step={10} />
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className={styles.footer}>
          {message && (
            <span className={`${styles.message} ${message.type === 'success' ? styles.success : styles.error}`}>
              {message.text}
            </span>
          )}
          <div className={styles.footerButtons}>
            <button className={styles.resetButton} onClick={() => { setValues(SYSTEM_DEFAULTS); setMessage(null); }}>초기화</button>
            <button className={styles.saveButton} onClick={handleSave} disabled={saving}>
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpaceDefaultsModal;
