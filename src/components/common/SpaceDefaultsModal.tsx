import React, { useState, useEffect, useMemo } from 'react';
import { getSpaceConfigDefaults, updateSpaceConfigDefaults, SpaceConfigDefaults } from '@/firebase/userProfiles';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import Space3DView from '@/editor/shared/viewer3d/Space3DView';
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
};

const SURROUND_OPTIONS: { id: NonNullable<SpaceConfigDefaults['surroundMode']>; label: string }[] = [
  { id: 'full-surround', label: '전체서라운드' },
  { id: 'sides-only', label: '양쪽서라운드' },
  { id: 'no-surround', label: '노서라운드' },
];

/* ── FormControl (collapsible section) ── */
interface FormControlProps {
  label: string;
  children: React.ReactNode;
  expanded?: boolean;
  onToggle?: () => void;
}

const FormControl: React.FC<FormControlProps> = ({ label, children, expanded = true, onToggle }) => (
  <div className={styles.formControl}>
    <div className={styles.formHeader} onClick={onToggle}>
      <div className={styles.formIndicator} />
      <h3 className={styles.formLabel}>{label}</h3>
      <div style={{ flex: 1 }} />
      {onToggle && (
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          className={`${styles.expandIcon} ${expanded ? styles.expanded : ''}`}
        >
          <polyline points="6,9 12,15 18,9" stroke="currentColor" strokeWidth="2.5" />
        </svg>
      )}
    </div>
    {expanded && <div className={styles.formContent}>{children}</div>}
  </div>
);

/* ── NumberInput (stepper with ± buttons) ── */
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
      <button
        className={styles.inputButton}
        onClick={() => onChange(Math.max(min || 0, value - step))}
        disabled={value <= (min || 0)}
      >−</button>
      <div className={styles.inputField}>
        <input
          type="number"
          value={value}
          onChange={(e) => {
            const v = Number(e.target.value);
            onChange(Math.max(min || 0, Math.min(max || Infinity, v)));
          }}
          min={min} max={max} step={step}
        />
        <span className={styles.inputUnit}>{unit}</span>
      </div>
      <button
        className={styles.inputButton}
        onClick={() => onChange(Math.min(max || Infinity, value + step))}
        disabled={value >= (max || Infinity)}
      >+</button>
    </div>
  </div>
);

/* ── ToggleGroup (segmented control) ── */
interface ToggleGroupProps {
  options: { id: string; label: string }[];
  selected: string;
  onChange: (id: string) => void;
}

const ToggleGroup: React.FC<ToggleGroupProps> = ({ options, selected, onChange }) => (
  <div className={commonStyles.toggleButtonGroup}>
    {options.map(opt => (
      <button
        key={opt.id}
        className={`${commonStyles.toggleButton} ${selected === opt.id ? commonStyles.toggleButtonActive : ''}`}
        onClick={() => onChange(opt.id)}
      >
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
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['space', 'gap', 'frame', 'frameSize', 'furniture'])
  );

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

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
          frameLeft: defaults.frameLeft ?? SYSTEM_DEFAULTS.frameLeft,
          frameRight: defaults.frameRight ?? SYSTEM_DEFAULTS.frameRight,
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

  const handleNumChange = (key: keyof SpaceConfigDefaults) => (v: number) => {
    setValues(prev => ({ ...prev, [key]: v }));
    setMessage(null);
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await updateSpaceConfigDefaults(values);
    setMessage(error ? { text: error, type: 'error' } : { text: '저장되었습니다.', type: 'success' });
    setSaving(false);
  };

  const handleReset = () => { setValues(SYSTEM_DEFAULTS); setMessage(null); };

  const previewSpaceInfo = useMemo<SpaceInfo>(() => {
    const surroundType = values.surroundMode === 'no-surround' ? 'no-surround' as const : 'surround' as const;
    const frameConfig = values.surroundMode === 'full-surround'
      ? { left: true, right: true, top: true, bottom: true }
      : values.surroundMode === 'sides-only'
        ? { left: true, right: true, top: false, bottom: false }
        : { left: false, right: false, top: true, bottom: false };
    return {
      width: values.width, height: values.height, depth: 600,
      installType: 'builtin',
      wallConfig: { left: true, right: true },
      hasFloorFinish: false, surroundType, frameConfig,
      frameSize: { top: values.frameTop, bottom: 0, left: values.frameLeft, right: values.frameRight },
      gapConfig: { left: values.gapLeft, right: values.gapRight },
      baseConfig: { height: values.baseHeight, depth: 600, hasFrontBoard: false, frontBoardThickness: 0, frontBoardHeight: 0 },
      furnitureSingleWidth: values.furnitureSingleWidth,
      furnitureDualWidth: values.furnitureDualWidth,
    };
  }, [values]);

  if (loading) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>공간설정 기본값</h3>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>

        <div className={styles.content}>
          {/* 좌측: 3D 프리뷰 */}
          <div className={styles.leftSection}>
            <div className={styles.viewer}>
              <Space3DView
                spaceInfo={previewSpaceInfo}
                viewMode="3D"
                renderMode="solid"
                showAll={true}
                showDimensions={true}
                showFrame={true}
                showFurniture={false}
                isEmbedded={true}
                isStep2={true}
                readOnly={true}
                setViewMode={() => {}}
              />
            </div>
          </div>

          {/* 우측: RightPanel 스타일 설정 폼 */}
          <div className={styles.rightSection}>
            <div className={styles.notice}>새 프로젝트에서부터 적용됩니다.</div>
            <div className={styles.panelContent}>
              <div className={styles.formContainer}>
                {/* 공간 크기 */}
                <FormControl
                  label="공간 크기"
                  expanded={expandedSections.has('space')}
                  onToggle={() => toggleSection('space')}
                >
                  <NumberInput label="전체 너비" value={values.width} onChange={handleNumChange('width')} min={1000} max={8000} step={100} />
                  <NumberInput label="높이" value={values.height} onChange={handleNumChange('height')} min={2000} max={3000} step={100} />
                </FormControl>

                {/* 이격거리 */}
                <FormControl
                  label="이격거리"
                  expanded={expandedSections.has('gap')}
                  onToggle={() => toggleSection('gap')}
                >
                  <NumberInput label="좌측 이격" value={values.gapLeft} onChange={handleNumChange('gapLeft')} min={0} max={100} step={0.5} />
                  <NumberInput label="우측 이격" value={values.gapRight} onChange={handleNumChange('gapRight')} min={0} max={100} step={0.5} />
                </FormControl>

                {/* 프레임 타입 */}
                <FormControl
                  label="프레임 설정"
                  expanded={expandedSections.has('frame')}
                  onToggle={() => toggleSection('frame')}
                >
                  <ToggleGroup
                    options={SURROUND_OPTIONS.map(o => ({ id: o.id, label: o.label }))}
                    selected={values.surroundMode}
                    onChange={(id) => { setValues(prev => ({ ...prev, surroundMode: id as any })); setMessage(null); }}
                  />
                </FormControl>

                {/* 프레임 사이즈 */}
                <FormControl
                  label="프레임 사이즈"
                  expanded={expandedSections.has('frameSize')}
                  onToggle={() => toggleSection('frameSize')}
                >
                  <NumberInput label="상부 프레임" value={values.frameTop} onChange={handleNumChange('frameTop')} min={0} max={200} step={1} />
                  <NumberInput label="하부 프레임" value={values.baseHeight} onChange={handleNumChange('baseHeight')} min={0} max={200} step={1} />
                  {values.surroundMode !== 'no-surround' && (
                    <>
                      <NumberInput label="좌측 프레임" value={values.frameLeft} onChange={handleNumChange('frameLeft')} min={0} max={200} step={1} />
                      <NumberInput label="우측 프레임" value={values.frameRight} onChange={handleNumChange('frameRight')} min={0} max={200} step={1} />
                    </>
                  )}
                </FormControl>

                {/* 가구 배치 기본 너비 */}
                <FormControl
                  label="가구 배치 기본 너비"
                  expanded={expandedSections.has('furniture')}
                  onToggle={() => toggleSection('furniture')}
                >
                  <NumberInput label="싱글" value={values.furnitureSingleWidth} onChange={handleNumChange('furnitureSingleWidth')} min={200} max={1200} step={10} />
                  <NumberInput label="듀얼" value={values.furnitureDualWidth} onChange={handleNumChange('furnitureDualWidth')} min={400} max={2400} step={10} />
                </FormControl>
              </div>
            </div>

            {/* 하단 버튼 */}
            <div className={styles.panelFooter}>
              {message && (
                <span className={`${styles.message} ${message.type === 'success' ? styles.success : styles.error}`}>
                  {message.text}
                </span>
              )}
              <div className={styles.footerButtons}>
                <button className={styles.resetButton} onClick={handleReset}>초기화</button>
                <button className={styles.saveButton} onClick={handleSave} disabled={saving}>
                  {saving ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpaceDefaultsModal;
