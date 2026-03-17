import React, { useState, useEffect } from 'react';
import { getSpaceConfigDefaults, updateSpaceConfigDefaults, SpaceConfigDefaults } from '@/firebase/userProfiles';
import { SPACE_LIMITS } from '@/store/core/spaceConfigStore';
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
  baseHeight: 65,
  furnitureSingleWidth: 500,
  furnitureDualWidth: 1000,
  surroundMode: 'full-surround',
};

const SURROUND_OPTIONS: { id: SpaceConfigDefaults['surroundMode']; label: string }[] = [
  { id: 'full-surround', label: '전체서라운드' },
  { id: 'sides-only', label: '양쪽서라운드' },
  { id: 'no-surround', label: '노서라운드' },
];

const SpaceDefaultsModal: React.FC<SpaceDefaultsModalProps> = ({ onClose }) => {
  const [values, setValues] = useState<Required<SpaceConfigDefaults>>(SYSTEM_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    const load = async () => {
      const defaults = await getSpaceConfigDefaults();
      if (defaults) {
        setValues({
          width: defaults.width ?? SYSTEM_DEFAULTS.width,
          height: defaults.height ?? SYSTEM_DEFAULTS.height,
          gapLeft: defaults.gapLeft ?? SYSTEM_DEFAULTS.gapLeft,
          gapRight: defaults.gapRight ?? SYSTEM_DEFAULTS.gapRight,
          frameTop: defaults.frameTop ?? SYSTEM_DEFAULTS.frameTop,
          baseHeight: defaults.baseHeight ?? SYSTEM_DEFAULTS.baseHeight,
          furnitureSingleWidth: defaults.furnitureSingleWidth ?? SYSTEM_DEFAULTS.furnitureSingleWidth,
          furnitureDualWidth: defaults.furnitureDualWidth ?? SYSTEM_DEFAULTS.furnitureDualWidth,
          surroundMode: defaults.surroundMode ?? SYSTEM_DEFAULTS.surroundMode,
        });
      }
      setLoading(false);
    };
    load();
  }, []);

  const handleChange = (key: keyof SpaceConfigDefaults, raw: string) => {
    const num = parseFloat(raw);
    if (isNaN(num)) return;
    setValues(prev => ({ ...prev, [key]: num }));
    setMessage(null);
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await updateSpaceConfigDefaults(values);
    if (error) {
      setMessage({ text: error, type: 'error' });
    } else {
      setMessage({ text: '저장되었습니다.', type: 'success' });
    }
    setSaving(false);
  };

  const handleReset = () => {
    setValues(SYSTEM_DEFAULTS);
    setMessage(null);
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
          <p className={styles.notice}>이 부분에 설정된 기본값은 기존 프로젝트를 제외한 새 프로젝트에서 부터 적용됩니다.</p>
          <div className={styles.fieldGroup}>
            <span className={styles.groupTitle}>공간 크기</span>
            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label className={styles.label}>너비 (W)</label>
                <div className={styles.inputWrapper}>
                  <input
                    className={styles.input}
                    type="number"
                    min={SPACE_LIMITS.WIDTH.MIN}
                    max={SPACE_LIMITS.WIDTH.MAX}
                    value={values.width}
                    onChange={e => handleChange('width', e.target.value)}
                  />
                  <span className={styles.unit}>mm</span>
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>높이 (H)</label>
                <div className={styles.inputWrapper}>
                  <input
                    className={styles.input}
                    type="number"
                    min={SPACE_LIMITS.HEIGHT.MIN}
                    max={SPACE_LIMITS.HEIGHT.MAX}
                    value={values.height}
                    onChange={e => handleChange('height', e.target.value)}
                  />
                  <span className={styles.unit}>mm</span>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <span className={styles.groupTitle}>이격거리</span>
            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label className={styles.label}>좌측 이격</label>
                <div className={styles.inputWrapper}>
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={values.gapLeft}
                    onChange={e => handleChange('gapLeft', e.target.value)}
                  />
                  <span className={styles.unit}>mm</span>
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>우측 이격</label>
                <div className={styles.inputWrapper}>
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={values.gapRight}
                    onChange={e => handleChange('gapRight', e.target.value)}
                  />
                  <span className={styles.unit}>mm</span>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <span className={styles.groupTitle}>프레임 설정</span>
            <div className={styles.toggleRow}>
              {SURROUND_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  className={`${styles.toggleBtn} ${values.surroundMode === opt.id ? styles.toggleBtnActive : ''}`}
                  onClick={() => { setValues(prev => ({ ...prev, surroundMode: opt.id! })); setMessage(null); }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <span className={styles.groupTitle}>프레임 높이</span>
            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label className={styles.label}>상부프레임 높이</label>
                <div className={styles.inputWrapper}>
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    max={200}
                    value={values.frameTop}
                    onChange={e => handleChange('frameTop', e.target.value)}
                  />
                  <span className={styles.unit}>mm</span>
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>하부프레임 높이</label>
                <div className={styles.inputWrapper}>
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    max={200}
                    value={values.baseHeight}
                    onChange={e => handleChange('baseHeight', e.target.value)}
                  />
                  <span className={styles.unit}>mm</span>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <span className={styles.groupTitle}>가구 배치 기본 너비</span>
            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label className={styles.label}>싱글</label>
                <div className={styles.inputWrapper}>
                  <input
                    className={styles.input}
                    type="number"
                    min={200}
                    max={1200}
                    step={10}
                    value={values.furnitureSingleWidth}
                    onChange={e => handleChange('furnitureSingleWidth', e.target.value)}
                  />
                  <span className={styles.unit}>mm</span>
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>듀얼</label>
                <div className={styles.inputWrapper}>
                  <input
                    className={styles.input}
                    type="number"
                    min={400}
                    max={2400}
                    step={10}
                    value={values.furnitureDualWidth}
                    onChange={e => handleChange('furnitureDualWidth', e.target.value)}
                  />
                  <span className={styles.unit}>mm</span>
                </div>
              </div>
            </div>
          </div>

          {message && (
            <p className={`${styles.message} ${message.type === 'success' ? styles.success : styles.error}`}>
              {message.text}
            </p>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.resetButton} onClick={handleReset}>초기화</button>
          <button className={styles.saveButton} onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SpaceDefaultsModal;
