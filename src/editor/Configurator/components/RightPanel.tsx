import React, { useState, useEffect } from 'react';
import styles from './RightPanel.module.css';
import commonStyles from '@/editor/shared/controls/styles/common.module.css';
import doorStyles from '@/editor/shared/controls/furniture/PlacedModulePropertiesPanel.module.css';
import { useUIStore } from '@/store/uiStore';
import { useSpaceConfigStore, DEFAULT_DROPPED_CEILING_VALUES, type FreePlacementGuideSlot } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import ColumnProperties from '@/editor/shared/controls/structure/ColumnProperties';
import { SpaceCalculator, calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { useTranslation } from '@/i18n/useTranslation';
import PreviewViewer from './PreviewViewer';
import { computeFrameMergeGroups } from '@/editor/shared/utils/frameMergeUtils';
import { getModuleCategory } from '@/editor/shared/utils/freePlacementUtils';
import { useAuth } from '@/auth/AuthProvider';
import { getSpaceConfigDefaults } from '@/firebase/userProfiles';

// Window 인터페이스 확장
declare global {
  interface Window {
    handleSpaceInfoUpdate?: (updates: any) => void;
  }
}

/* ── 프레임 행 컴포넌트 (모듈 레벨) ── */
const FrameRow = React.memo(({ label, enabled, widthMM = 0, sizeMM, offset, onToggle, onSizeChange, onOffsetChange, hlKey, setHighlightedFrame, gap, onGapChange }: {
  label: string; enabled: boolean; widthMM?: number; sizeMM: number; offset: number;
  onToggle: () => void; onSizeChange: (v: number) => void; onOffsetChange: (v: number) => void; hlKey: string;
  setHighlightedFrame: (v: string | null) => void;
  gap?: number; onGapChange?: (v: number, nextSize?: number) => void;
  splitGapFromSize?: boolean;
}) => {
  const displaySizeMM = Math.max(0, sizeMM);
  const commitDisplaySize = (nextDisplaySize: number) => {
    onSizeChange(nextDisplaySize);
  };
  const commitGap = (nextGap: number) => {
    const clampedGap = Math.max(0, Math.min(2000, nextGap));
    if (onGapChange) onGapChange(clampedGap);
  };
  const [sizeText, setSizeText] = React.useState(String(displaySizeMM || ''));
  const [offsetText, setOffsetText] = React.useState(offset !== 0 ? String(offset) : '');
  const [gapText, setGapText] = React.useState((gap ?? 0) !== 0 ? String(gap) : '');
  const sizeEditingRef = React.useRef(false);
  const offsetEditingRef = React.useRef(false);
  const gapEditingRef = React.useRef(false);

  React.useEffect(() => {
    if (!sizeEditingRef.current) setSizeText(displaySizeMM ? String(displaySizeMM) : '');
  }, [displaySizeMM]);
  React.useEffect(() => {
    if (!offsetEditingRef.current) setOffsetText(offset !== 0 ? String(offset) : '');
  }, [offset]);
  React.useEffect(() => {
    if (!gapEditingRef.current) setGapText((gap ?? 0) !== 0 ? String(gap) : '');
  }, [gap]);
  const showGap = typeof onGapChange === 'function';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0' }}>
      <span style={{ minWidth: '50px', fontSize: '11px', color: 'var(--theme-text-secondary)', fontWeight: 500 }}>{label}</span>
      <button
        onClick={onToggle}
        style={{
          width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer',
          backgroundColor: enabled ? 'var(--theme-primary, #4a90d9)' : '#ccc',
          position: 'relative', transition: 'background-color 0.2s', flexShrink: 0,
        }}
      >
        <span style={{
          position: 'absolute', top: '2px', width: '16px', height: '16px', borderRadius: '50%',
          backgroundColor: '#fff', transition: 'left 0.2s',
          left: enabled ? '18px' : '2px',
        }} />
      </button>
      <div style={{ display: 'flex', flex: 1, gap: '4px', opacity: enabled ? 1 : 0.5 }}>
        {/* 너비 - 읽기전용 */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '2px', border: '1px solid var(--theme-border)', borderRadius: '4px', padding: '2px 4px' }}>
          <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', flexShrink: 0 }}>너비</span>
          <input type="text" inputMode="numeric"
            value={widthMM ? (Number.isInteger(widthMM) ? widthMM : Number(widthMM.toFixed(1))) : ''} readOnly
            onFocus={() => setHighlightedFrame(hlKey)}
            onBlur={() => setHighlightedFrame(null)}
            style={{ width: '100%', border: 'none', outline: 'none', fontSize: '12px', textAlign: 'center', background: 'transparent', color: 'var(--theme-text-secondary)', cursor: 'default' }}
          />
        </div>
        {/* 높이 — 토글 OFF면 0 표시 + 입력 비활성화 */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '2px', border: '1px solid var(--theme-border)', borderRadius: '4px', padding: '2px 4px' }}>
          <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', flexShrink: 0 }}>높이</span>
          <input type="text" inputMode="numeric"
            value={enabled ? sizeText : '0'} placeholder="0"
            disabled={!enabled}
            onFocus={() => { sizeEditingRef.current = true; setHighlightedFrame(hlKey); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                const next = Math.max(0, Math.min(9999, (displaySizeMM || 0) + (e.key === 'ArrowUp' ? 1 : -1)));
                setSizeText(String(next));
                commitDisplaySize(next);
              } else if (e.key === 'Enter') {
                (e.target as HTMLInputElement).blur();
              }
            }}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '' || /^\d+$/.test(v)) {
                setSizeText(v);
                commitDisplaySize(v === '' ? 0 : parseInt(v, 10));
              }
            }}
            onBlur={(e) => { sizeEditingRef.current = false; setHighlightedFrame(null); const clamped = Math.max(0, Math.min(9999, parseInt(e.target.value) || 0)); setSizeText(String(clamped)); commitDisplaySize(clamped); }}
            style={{ width: '100%', border: 'none', outline: 'none', fontSize: '12px', textAlign: 'center', background: 'transparent', color: enabled ? 'var(--theme-text-primary)' : 'var(--theme-text-secondary)', cursor: enabled ? 'text' : 'not-allowed' }}
          />
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '2px', border: '1px solid var(--theme-border)', borderRadius: '4px', padding: '2px 4px' }}>
          <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', flexShrink: 0 }}>옵셋</span>
          <input type="text" inputMode="numeric"
            value={enabled ? offsetText : '0'} placeholder="0"
            disabled={!enabled}
            onFocus={() => { offsetEditingRef.current = true; setHighlightedFrame(hlKey); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                const next = Math.max(-200, Math.min(200, (offset || 0) + (e.key === 'ArrowUp' ? 1 : -1)));
                setOffsetText(String(next));
                onOffsetChange(next);
              } else if (e.key === 'Enter') {
                (e.target as HTMLInputElement).blur();
              }
            }}
            onChange={(e) => { const v = e.target.value; if (v === '' || v === '-' || /^-?\d+$/.test(v)) setOffsetText(v); }}
            onBlur={(e) => { offsetEditingRef.current = false; setHighlightedFrame(null); const clamped = Math.max(-200, Math.min(200, parseInt(e.target.value) || 0)); setOffsetText(String(clamped)); onOffsetChange(clamped); }}
            style={{ width: '100%', border: 'none', outline: 'none', fontSize: '12px', textAlign: 'center', background: 'transparent', color: enabled ? 'var(--theme-text-primary)' : 'var(--theme-text-secondary)', cursor: enabled ? 'text' : 'not-allowed' }}
          />
        </div>
        {showGap && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '2px', border: '1px solid var(--theme-border)', borderRadius: '4px', padding: '2px 4px' }}>
            <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', flexShrink: 0 }}>갭</span>
            <input type="text" inputMode="numeric"
              value={enabled ? gapText : '0'} placeholder="0"
              disabled={!enabled}
              onFocus={() => { gapEditingRef.current = true; setHighlightedFrame(hlKey); }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  const next = Math.max(0, Math.min(2000, (gap || 0) + (e.key === 'ArrowUp' ? 1 : -1)));
                  setGapText(String(next));
                  commitGap(next);
                } else if (e.key === 'Enter') {
                  (e.target as HTMLInputElement).blur();
                }
              }}
              onChange={(e) => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) setGapText(v); }}
              onBlur={(e) => { gapEditingRef.current = false; setHighlightedFrame(null); const clamped = Math.max(0, Math.min(2000, parseInt(e.target.value) || 0)); setGapText(String(clamped)); commitGap(clamped); }}
              style={{ width: '100%', border: 'none', outline: 'none', fontSize: '12px', textAlign: 'center', background: 'transparent', color: enabled ? 'var(--theme-text-primary)' : 'var(--theme-text-secondary)', cursor: enabled ? 'text' : 'not-allowed' }}
            />
          </div>
        )}
      </div>
    </div>
  );
});

const MergedFrameRow = React.memo(({ label, enabled, widthMM, heightMM, offset, onToggle, onHeightChange, onOffsetChange, hlKey, setHighlightedFrame, isLowerCategory = false, userBaseHeightDefault, gap, onGapChange }: {
  label: string; enabled: boolean; widthMM: number; heightMM: number; offset: number;
  onToggle: () => void; onHeightChange: (v: number) => void; onOffsetChange: (v: number) => void; hlKey: string;
  setHighlightedFrame: (v: string | null) => void; isLowerCategory?: boolean; userBaseHeightDefault?: number;
  gap?: number; onGapChange?: (v: number, nextHeight?: number) => void;
  splitGapFromSize?: boolean;
}) => {
  const bfMin = isLowerCategory ? 60 : 40;
  const bfMax = isLowerCategory ? 150 : 100;
  // 일반 가구의 디폴트는 사용자 설정값(baseHeight) 우선, 없으면 60
  const bfDefault = isLowerCategory ? 105 : (userBaseHeightDefault ?? 60);
  const displayHeightMM = Math.max(0, heightMM);
  const commitDisplayHeight = (nextDisplayHeight: number) => {
    onHeightChange(nextDisplayHeight);
  };
  const commitGap = (nextGap: number) => {
    const clampedGap = Math.max(0, Math.min(2000, nextGap));
    if (onGapChange) onGapChange(clampedGap);
  };
  const [heightText, setHeightText] = React.useState(String(displayHeightMM || ''));
  const [offsetText, setOffsetText] = React.useState(offset !== 0 ? String(offset) : '');
  const [gapText, setGapText] = React.useState((gap ?? 0) !== 0 ? String(gap) : '');
  const heightEditingRef = React.useRef(false);
  const offsetEditingRef = React.useRef(false);
  const gapEditingRef = React.useRef(false);

  React.useEffect(() => {
    if (!heightEditingRef.current) setHeightText(displayHeightMM ? String(displayHeightMM) : '');
  }, [displayHeightMM]);
  React.useEffect(() => {
    if (!offsetEditingRef.current) setOffsetText(offset !== 0 ? String(offset) : '');
  }, [offset]);
  React.useEffect(() => {
    if (!gapEditingRef.current) setGapText((gap ?? 0) !== 0 ? String(gap) : '');
  }, [gap]);
  const showGap = typeof onGapChange === 'function';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0' }}>
      <span style={{ minWidth: '50px', fontSize: '11px', color: 'var(--theme-text-secondary)', fontWeight: 500 }}>{label}</span>
      <button
        onClick={onToggle}
        style={{
          width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer',
          backgroundColor: enabled ? 'var(--theme-primary, #4a90d9)' : '#ccc',
          position: 'relative', transition: 'background-color 0.2s', flexShrink: 0,
        }}
      >
        <span style={{
          position: 'absolute', top: '2px', width: '16px', height: '16px', borderRadius: '50%',
          backgroundColor: '#fff', transition: 'left 0.2s',
          left: enabled ? '18px' : '2px',
        }} />
      </button>
      <div style={{ display: 'flex', flex: 1, gap: '4px', opacity: enabled ? 1 : 0.5 }}>
        {/* 너비 - 읽기전용 */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '2px', border: '1px solid var(--theme-border)', borderRadius: '4px', padding: '2px 4px' }}>
          <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', flexShrink: 0 }}>너비</span>
          <input type="text" inputMode="numeric"
            value={widthMM ? (Number.isInteger(widthMM) ? widthMM : Number(widthMM.toFixed(1))) : ''} readOnly
            onFocus={() => setHighlightedFrame(hlKey)}
            onBlur={() => setHighlightedFrame(null)}
            style={{ width: '100%', border: 'none', outline: 'none', fontSize: '12px', textAlign: 'center', background: 'transparent', color: 'var(--theme-text-secondary)', cursor: 'default' }}
          />
        </div>
        {/* 높이 - 편집 가능 */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '2px', border: '1px solid var(--theme-border)', borderRadius: '4px', padding: '2px 4px' }}>
          <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', flexShrink: 0 }}>높이</span>
          <input type="text" inputMode="numeric"
            value={heightText} placeholder="0"
            onFocus={() => { heightEditingRef.current = true; setHighlightedFrame(hlKey); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                const next = Math.max(bfMin, Math.min(bfMax, (displayHeightMM || bfDefault) + (e.key === 'ArrowUp' ? 1 : -1)));
                setHeightText(String(next));
                commitDisplayHeight(next);
              } else if (e.key === 'Enter') {
                (e.target as HTMLInputElement).blur();
              }
            }}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '' || /^\d+$/.test(v)) {
                const next = v === '' ? 0 : Math.min(bfMax, parseInt(v, 10));
                setHeightText(v !== '' && parseInt(v, 10) > bfMax ? String(bfMax) : v);
                commitDisplayHeight(next);
              }
            }}
            onBlur={(e) => { heightEditingRef.current = false; setHighlightedFrame(null); const clamped = Math.max(bfMin, Math.min(bfMax, parseInt(e.target.value) || bfDefault)); setHeightText(String(clamped)); commitDisplayHeight(clamped); }}
            style={{ width: '100%', border: 'none', outline: 'none', fontSize: '12px', textAlign: 'center', background: 'transparent', color: 'var(--theme-text-primary)' }}
          />
        </div>
        {/* 옵셋 - 편집 가능 */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '2px', border: '1px solid var(--theme-border)', borderRadius: '4px', padding: '2px 4px' }}>
          <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', flexShrink: 0 }}>옵셋</span>
          <input type="text" inputMode="numeric"
            value={offsetText} placeholder="0"
            onFocus={() => { offsetEditingRef.current = true; setHighlightedFrame(hlKey); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                const next = Math.max(-200, Math.min(200, (offset || 0) + (e.key === 'ArrowUp' ? 1 : -1)));
                setOffsetText(String(next));
                onOffsetChange(next);
              } else if (e.key === 'Enter') {
                (e.target as HTMLInputElement).blur();
              }
            }}
            onChange={(e) => { const v = e.target.value; if (v === '' || v === '-' || /^-?\d+$/.test(v)) setOffsetText(v); }}
            onBlur={(e) => { offsetEditingRef.current = false; setHighlightedFrame(null); const clamped = Math.max(-200, Math.min(200, parseInt(e.target.value) || 0)); setOffsetText(String(clamped)); onOffsetChange(clamped); }}
            style={{ width: '100%', border: 'none', outline: 'none', fontSize: '12px', textAlign: 'center', background: 'transparent', color: 'var(--theme-text-primary)' }}
          />
        </div>
        {showGap && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '2px', border: '1px solid var(--theme-border)', borderRadius: '4px', padding: '2px 4px' }}>
            <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', flexShrink: 0 }}>갭</span>
            <input type="text" inputMode="numeric"
              value={gapText} placeholder="0"
              onFocus={() => { gapEditingRef.current = true; setHighlightedFrame(hlKey); }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  const next = Math.max(0, Math.min(2000, (gap || 0) + (e.key === 'ArrowUp' ? 1 : -1)));
                  setGapText(String(next));
                  commitGap(next);
                } else if (e.key === 'Enter') {
                  (e.target as HTMLInputElement).blur();
                }
              }}
              onChange={(e) => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) setGapText(v); }}
              onBlur={(e) => { gapEditingRef.current = false; setHighlightedFrame(null); const clamped = Math.max(0, Math.min(2000, parseInt(e.target.value) || 0)); setGapText(String(clamped)); commitGap(clamped); }}
              style={{ width: '100%', border: 'none', outline: 'none', fontSize: '12px', textAlign: 'center', background: 'transparent', color: 'var(--theme-text-primary)' }}
            />
          </div>
        )}
      </div>
    </div>
  );
});

export type RightPanelTab = 'placement' | 'module';

export const ModuleContent: React.FC = () => {
  const { activePopup } = useUIStore();
  const { spaceInfo } = useSpaceConfigStore();

  // column 팝업이 활성화되었으면 기둥 속성 표시
  if (activePopup.type === 'column' && activePopup.id) {
    const column = spaceInfo.columns?.find((col: any) => col.id === activePopup.id);
    if (column) {
      return <ColumnProperties columnId={activePopup.id} />;
    }
    return <div className={styles.placeholder}></div>;
  }

  return (
    <div className={styles.placeholder}>
    </div>
  );
};

interface FormControlProps {
  label: string;
  children: React.ReactNode;
  expanded?: boolean;
  onToggle?: () => void;
  helpText?: string;
  style?: React.CSSProperties;
  headerAccessory?: React.ReactNode;
}

const FormControl: React.FC<FormControlProps> = ({
  label,
  children,
  expanded = true,
  onToggle,
  helpText,
  style,
  headerAccessory
}) => {
  const [showHelp, setShowHelp] = useState(false);
  const helpRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!showHelp) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) {
        setShowHelp(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showHelp]);

  return (
    <div className={styles.formControl} style={style}>
      <div className={styles.formHeader} onClick={onToggle}>
        <div className={styles.formIndicator}></div>
        <h3 className={styles.formLabel}>{label}</h3>
        {headerAccessory && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              marginLeft: '8px',
              display: 'flex',
              alignItems: 'center',
              zIndex: 10,
              position: 'relative',
            }}
          >
            {headerAccessory}
          </div>
        )}
        <div style={{ flex: 1 }} />
        {helpText && (
          <div ref={helpRef} style={{ position: 'relative' }}>
            <button
              className={styles.helpButton}
              onClick={(e) => { e.stopPropagation(); setShowHelp(!showHelp); }}
            >
              ?
            </button>
            {showHelp && (
              <div className={styles.helpPopup}>
                <div className={styles.helpPopupTitle}>{label}</div>
                <div className={styles.helpPopupText}>{helpText}</div>
              </div>
            )}
          </div>
        )}
        {onToggle && (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            className={`${styles.expandIcon} ${expanded ? styles.expanded : ''}`}
          >
            <polyline points="6,9 12,15 18,9" stroke="currentColor" strokeWidth="2.5"/>
          </svg>
        )}
      </div>
      {expanded && <div className={styles.formContent}>{children}</div>}
    </div>
  );
};

interface NumberInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

const NumberInput: React.FC<NumberInputProps> = ({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = 'mm'
}) => (
  <div className={styles.numberInput}>
    <div className={styles.inputLabel}>{label}</div>
    <div className={styles.inputGroup}>
      <button 
        className={styles.inputButton}
        onClick={() => onChange(Math.max(min || 0, value - step))}
        disabled={value <= (min || 0)}
      >
        −
      </button>
      <div className={styles.inputField}>
        <input
          type="number"
          value={value}
          onChange={(e) => {
            const newValue = Number(e.target.value);
            const clampedValue = Math.max(min || 0, Math.min(max || Infinity, newValue));
            onChange(clampedValue);
          }}
          min={min}
          max={max}
          step={step}
          style={{ color: 'var(--theme-text)', backgroundColor: 'var(--theme-surface)' }}
        />
        <span className={styles.inputUnit}>{unit}</span>
      </div>
      <button 
        className={styles.inputButton}
        onClick={() => onChange(Math.min(max || Infinity, value + step))}
        disabled={value >= (max || Infinity)}
      >
        +
      </button>
    </div>
  </div>
);

interface ToggleGroupProps {
  options: { id: string; label: string }[];
  selected: string;
  onChange: (id: string) => void;
}

const ToggleGroup: React.FC<ToggleGroupProps> = ({ options, selected, onChange }) => {
  return (
    <div className={commonStyles.toggleButtonGroup}>
      {options.map((option) => (
        <button
          key={option.id}
          className={`${commonStyles.toggleButton} ${selected === option.id ? commonStyles.toggleButtonActive : ''}`}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};

// 도어 슬라이더 컴포넌트
interface DoorSliderProps {
  value: number;
  onChange: (value: number) => void;
  width: number; // 공간 넓이
  label?: string; // 좌측 라벨 (메인구간, 단내림구간 등)
}

const DoorSlider: React.FC<DoorSliderProps> = ({ value, onChange, width, label }) => {
  const [isDragging, setIsDragging] = useState(false);
  const sliderTrackRef = React.useRef<HTMLDivElement>(null);
  const { spaceInfo } = useSpaceConfigStore();
  
  // 도어 1개 너비 (588mm)
  const DOOR_WIDTH = 588;
  
  // 단내림이 활성화된 경우 메인 구간의 폭 계산
  const getMainZoneWidth = () => {
    if (spaceInfo.droppedCeiling?.enabled) {
      // 단내림 활성화 시 전체 폭에서 단내림 폭을 뺀 나머지가 메인 구간
      const mainZoneWidth = width - (spaceInfo.droppedCeiling.width || 1300);
// console.log('🎯 메인 구간 폭 계산 (DoorSlider):', {
        // totalWidth: width,
        // droppedWidth: spaceInfo.droppedCeiling.width || 1300,
        // mainZoneWidth
      // });
      return mainZoneWidth;
    }
    return width;
  };
  
  // 단내림 구간의 폭 계산 (단내림 구간 도어개수 슬라이더용)
  const getDroppedCeilingWidth = () => {
    if (spaceInfo.droppedCeiling?.enabled) {
      return spaceInfo.droppedCeiling.width || 1300;
    }
    return width;
  };
  
  // 공간 넓이 기반 최소/최대 도어 개수 계산
  const calculateDoorRange = (spaceWidth: number, isForDroppedCeiling: boolean = false) => {
    // 단내림이 활성화된 경우의 계산 로직
    if (spaceInfo.droppedCeiling?.enabled) {
      const frameThickness = 50; // 프레임 두께
      const normalAreaInternalWidth = spaceWidth - frameThickness;
      const MAX_SLOT_WIDTH = 600; // 슬롯 최대 너비 제한
      const MIN_SLOT_WIDTH = 400; // 슬롯 최소 너비 제한
      
      // 최소 필요 슬롯 개수 (600mm 제한)
      const minRequiredSlots = Math.ceil(normalAreaInternalWidth / MAX_SLOT_WIDTH);
      // 최대 가능 슬롯 개수 (400mm 제한)
      const maxPossibleSlots = Math.floor(normalAreaInternalWidth / MIN_SLOT_WIDTH);
      
// console.log('🎯 슬롯 계산 (단내림 활성화):', {
        // isForDroppedCeiling,
        // 구간: isForDroppedCeiling ? '단내림 구간' : '메인 구간',
        // spaceWidth,
        // normalAreaInternalWidth,
        // minRequiredSlots,
        // maxPossibleSlots,
        // maxSlotWidth: MAX_SLOT_WIDTH,
        // minSlotWidth: MIN_SLOT_WIDTH
      // });
      
      return {
        min: Math.max(1, minRequiredSlots),
        max: Math.max(minRequiredSlots, maxPossibleSlots),
        ideal: Math.max(minRequiredSlots, Math.round(normalAreaInternalWidth / 500))
      };
    }
    
    // 단내림이 비활성화된 경우: SpaceCalculator 기반으로 실제 내부 너비 사용
    const internalWidth = SpaceCalculator.calculateInternalWidth(spaceInfo);
    const limits = SpaceCalculator.getColumnCountLimits(internalWidth);

    // 이상적인 도어 개수 (500mm 기준)
    const idealDoorCount = Math.max(limits.minColumns, Math.round(internalWidth / 500));

    // 자유(슬롯 너비 직접 입력) 모드: 좁은 슬롯 허용 → 현재 컬럼수까지 max 확장
    const slotWidthEdit = useUIStore.getState().slotWidthEditMode;
    const currentCustomCount = spaceInfo.customColumnCount || 0;
    const maxColumns = slotWidthEdit
      ? Math.max(limits.maxColumns, currentCustomCount)
      : limits.maxColumns;

    return {
      min: limits.minColumns,
      max: maxColumns,
      ideal: idealDoorCount
    };
  };
  
  // 도어 범위 계산 - 단내림 구간의 도어개수 슬라이더인지 확인
  // 단내림 구간 슬라이더는 width가 단내림 폭과 정확히 같을 때
  const isDroppedCeilingSlider = spaceInfo.droppedCeiling?.enabled && 
    width === (spaceInfo.droppedCeiling.width || 1300);
  
// console.log('🔍 슬라이더 타입 확인:', {
    // width,
    // droppedWidth: spaceInfo.droppedCeiling?.width,
    // isDroppedCeilingSlider,
    // enabled: spaceInfo.droppedCeiling?.enabled
  // });
  
  let doorRange;
  if (isDroppedCeilingSlider) {
    // 단내림 구간의 도어개수 슬라이더인 경우
    doorRange = calculateDoorRange(width, true); // 단내림 구간임을 명시
// console.log('🎯 단내림 구간 도어개수 슬라이더:', {
      // width,
      // droppedCeilingWidth: spaceInfo.droppedCeiling?.width,
      // doorRange,
      // value,
      // isDroppedCeilingSlider
    // });
  } else {
    // 메인 구간의 도어개수 슬라이더인 경우
    const mainZoneWidth = getMainZoneWidth();
    doorRange = calculateDoorRange(mainZoneWidth, false); // 메인 구간임을 명시
// console.log('🎯 메인 구간 도어개수 슬라이더:', {
      // mainZoneWidth,
      // doorRange,
      // value,
      // isDroppedCeilingSlider
    // });
  }
  
  const minDoors = doorRange.min;
  const maxDoors = doorRange.max;
  
  // 현재 값이 범위를 벗어나면 조정
  const clampedValue = Math.max(minDoors, Math.min(maxDoors, value));
  
  // 슬라이더 위치 계산 (0-100%)
  const getSliderPosition = (doorCount: number) => {
    if (maxDoors === minDoors) return 0;
    return ((doorCount - minDoors) / (maxDoors - minDoors)) * 100;
  };
  
  // 위치에서 도어 개수 계산
  const getDoorCountFromPosition = React.useCallback((position: number) => {
    const normalizedPosition = Math.max(0, Math.min(100, position));
    const doorCount = Math.round(minDoors + (normalizedPosition / 100) * (maxDoors - minDoors));
    return Math.max(minDoors, Math.min(maxDoors, doorCount));
  }, [minDoors, maxDoors]);
  
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    
    // 클릭 시 바로 위치 계산하여 값 변경 - sliderTrackRef 사용
    if (sliderTrackRef.current) {
      const rect = sliderTrackRef.current.getBoundingClientRect();
      const position = ((e.clientX - rect.left) / rect.width) * 100;
      const newDoorCount = getDoorCountFromPosition(position);
      
      if (newDoorCount !== value) {
        onChange(newDoorCount);
      }
    }
  };
  
  const handleMouseMove = React.useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!isDragging || !sliderTrackRef.current) return;
    
    const rect = sliderTrackRef.current.getBoundingClientRect();
    const position = ((e.clientX - rect.left) / rect.width) * 100;
    const newDoorCount = getDoorCountFromPosition(position);
    
    if (newDoorCount !== value) {
      onChange(newDoorCount);
    }
  }, [isDragging, value, onChange, getDoorCountFromPosition]);
  
  const handleMouseUp = React.useCallback(() => {
    setIsDragging(false);
  }, []);
  
  React.useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseMove = (e: MouseEvent) => handleMouseMove(e);
      const handleGlobalMouseUp = () => handleMouseUp();
      
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
      
      // 드래그 중 텍스트 선택 방지
      document.body.style.userSelect = 'none';
      
      return () => {
        document.removeEventListener('mousemove', handleGlobalMouseMove);
        document.removeEventListener('mouseup', handleGlobalMouseUp);
        document.body.style.userSelect = '';
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);
  
  // 값이 범위를 벗어나면 자동 조정
  React.useEffect(() => {
    if (clampedValue !== value) {
      onChange(clampedValue);
    }
  }, [clampedValue, value]);

  // width 또는 단내림 설정 변경 시 현재 값이 새로운 범위를 벗어나면 자동 조정
  React.useEffect(() => {
    const mainZoneWidth = isDroppedCeilingSlider ? width : getMainZoneWidth();
    const range = calculateDoorRange(mainZoneWidth, isDroppedCeilingSlider);
    
    // 단내림이 활성화된 경우 메인 구간의 도어 개수가 너무 적으면 자동으로 증가
    if (spaceInfo.droppedCeiling?.enabled) {
      const frameThickness = 50; // 프레임 두께
      const normalAreaInternalWidth = mainZoneWidth - frameThickness;
      const MAX_SLOT_WIDTH = 600;
      const minRequiredSlots = Math.ceil(normalAreaInternalWidth / MAX_SLOT_WIDTH);
      
      if (value < minRequiredSlots) {
// console.log(`🔧 단내림 활성화 시 메인 구간 도어 개수 자동 조정: ${value} → ${minRequiredSlots}`);
        onChange(minRequiredSlots);
        return;
      }
    }
    
    if (value < range.min || value > range.max) {
      const newValue = Math.max(range.min, Math.min(range.max, value));
      onChange(newValue);
    }
  }, [width, value, spaceInfo.droppedCeiling]);
  
  // 슬라이더 라벨 생성 (동적)
  const generateLabels = () => {
    const doorCount = maxDoors - minDoors + 1;
    
// console.log('🎯 DoorSlider 라벨 생성:', {
      // minDoors,
      // maxDoors,
      // doorCount,
      // clampedValue
    // });
    
    if (doorCount <= 8) {
      // 컬럼 수가 8개 이하면 모든 값 표시
      const labels = [];
      for (let i = minDoors; i <= maxDoors; i++) {
        labels.push(i);
      }
// console.log('🎯 생성된 라벨:', labels);
      return labels;
    } else {
      // 컬럼 수가 많으면 대표값들만 표시
      const labels = [];
      const step = Math.ceil(doorCount / 7);
      
      // minDoors부터 시작하되 maxDoors를 초과하지 않도록
      for (let i = minDoors; i <= maxDoors; i += step) {
        if (i <= maxDoors) {
          labels.push(i);
        }
      }
      
      // 마지막 값이 maxDoors가 아니고, 마지막 라벨이 maxDoors보다 작으면 maxDoors 추가
      if (labels.length > 0 && labels[labels.length - 1] < maxDoors) {
        labels.push(maxDoors);
      }
      
// console.log('🎯 생성된 라벨:', labels);
      return labels;
    }
  };
  
  const labels = generateLabels();
  const sliderPosition = getSliderPosition(clampedValue);
  
// console.log('🎯 DoorSlider 렌더링:', {
    // labels,
    // sliderPosition,
    // clampedValue,
    // minDoors,
    // maxDoors
  // });
  
  return (
    <div className={styles.doorSlider} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      {label && (
        <span style={{ fontSize: '10px', color: 'var(--theme-text-muted)', fontWeight: 500, flexShrink: 0, minWidth: '40px' }}>
          {label}
        </span>
      )}
      {/* 컬럼 수 버튼 */}
      <div className={styles.sliderLabels} style={{ flex: 1 }}>
        {labels.map((num) => (
          <span
            key={num}
            className={num === clampedValue ? styles.active : ''}
            onClick={() => onChange(num)}
          >
            {num}
          </span>
        ))}
      </div>
    </div>
  );
};

// 컬러 휠 컴포넌트
const ColorWheel: React.FC = () => (
  <div className={styles.colorWheel}>
    <div className={styles.colorWheelCircle}>
      <div className={styles.colorWheelSVG}>
        <svg width="148" height="148" viewBox="0 0 148 148">
          <defs>
            <linearGradient id="colorGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ff0000" />
              <stop offset="16.67%" stopColor="#ff8800" />
              <stop offset="33.33%" stopColor="#ffff00" />
              <stop offset="50%" stopColor="#00ff00" />
              <stop offset="66.67%" stopColor="#0088ff" />
              <stop offset="83.33%" stopColor="#4400ff" />
              <stop offset="100%" stopColor="#ff0088" />
            </linearGradient>
          </defs>
          <circle cx="74" cy="74" r="70" fill="url(#colorGradient)" />
          <circle cx="74" cy="74" r="30" fill="#ffffff" />
        </svg>
      </div>
      <div className={styles.colorSelector}></div>
    </div>
    <div className={styles.colorSlider}>
      <div className={styles.sliderHandle}></div>
    </div>
    <div className={styles.colorPreview}>
      <div className={styles.colorValue}># F8F8F8</div>
    </div>
  </div>
);

// 슬라이더 컴포넌트 추가
interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
}

const Slider: React.FC<SliderProps> = ({
  value,
  onChange,
  min,
  max,
  step = 1,
  format = (val) => `${val}`
}) => {
  const percentage = ((value - min) / (max - min)) * 100;
  
  return (
    <div className={styles.sliderContainer}>
      <div className={styles.sliderTrack}>
        <div 
          className={styles.sliderFill} 
          style={{ width: `${percentage}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={styles.sliderInput}
        />
      </div>
      <div className={styles.sliderValue}>{format(value)}</div>
    </div>
  );
};

interface RightPanelProps {
  activeTab: RightPanelTab;
  onTabChange: (tab: RightPanelTab) => void;
  isOpen: boolean;
  onToggle: () => void;
  
  // 설치 타입
  installType: string;
  onInstallTypeChange: (type: string) => void;
  
  // 공간 설정
  width: number;
  height: number;
  onWidthChange: (width: number) => void;
  onHeightChange: (height: number) => void;
  
  // 단내림
  hasStep: boolean;
  onStepToggle: () => void;
  
  // 컬럼 수
  doorCount: number;
  onDoorCountChange: (count: number) => void;
  
  // 바닥 마감재
  hasFloorFinish: boolean;
  onFloorFinishToggle: () => void;
  
  // 받침대
  hasBase: boolean;
  onBaseToggle: () => void;
  baseHeight: number;
  baseDepth: number;
  onBaseHeightChange: (height: number) => void;
  onBaseDepthChange: (depth: number) => void;

  // 프레임 속성
  frameType: 'surround' | 'no-surround';
  onFrameTypeChange: (type: 'surround' | 'no-surround') => void;
}

const isUpperCabinetModule = (module?: any): boolean => {
  if (!module) return false;
  const moduleId = module?.moduleId || '';
  return getModuleCategory(module) === 'upper'
    || moduleId.startsWith('upper-')
    || moduleId.includes('-upper-')
    || moduleId.includes('upper-cabinet');
};

const getTopDoorGapForFrameState = (spaceInfo: any, hasTopFrame: boolean, module?: any): number => {
  if (!hasTopFrame) return -5;
  if (module && isUpperCabinetModule(module)) {
    return typeof spaceInfo?.doorTopGapUpper === 'number' ? spaceInfo.doorTopGapUpper : 5;
  }
  const frameConfig = spaceInfo?.frameConfig;
  const isFullSurround = spaceInfo?.surroundType === 'surround'
    && frameConfig?.top !== false;
  return isFullSurround ? -3 : 5;
};

const isShelfSplitModuleId = (moduleId?: string): boolean => !!moduleId?.includes('shelf-split');

const GuideSlotFrameRow = React.memo(({
  label,
  enabled,
  type,
  size,
  offset,
  gap,
  floatHeight = 0,
  onToggle,
  onSizeChange,
  onOffsetChange,
  onGapChange,
  onFloatChange,
}: {
  label: string;
  enabled: boolean;
  type: 'top' | 'base';
  size: number;
  offset: number;
  gap: number;
  floatHeight?: number;
  onToggle: () => void;
  onSizeChange: (v: number) => void;
  onOffsetChange: (v: number) => void;
  onGapChange: (v: number, nextSize?: number) => void;
  onFloatChange?: (v: number) => void;
}) => {
  const visibleSize = Math.max(0, size);
  const numberBoxStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    border: '1px solid var(--theme-border)',
    borderRadius: '4px',
    padding: '2px 4px'
  };
  const inputStyle: React.CSSProperties = {
    width: '100%',
    border: 'none',
    outline: 'none',
    fontSize: '12px',
    textAlign: 'center',
    background: 'transparent',
    color: 'var(--theme-text-primary)'
  };
  const commit = (raw: string, cb: (v: number) => void, min = 0, max = 9999) => {
    const parsed = Math.round(parseFloat(raw));
    if (!Number.isFinite(parsed)) return;
    cb(Math.max(min, Math.min(max, parsed)));
  };
  const commitGap = (raw: string) => {
    const parsed = Math.round(parseFloat(raw));
    if (!Number.isFinite(parsed)) return;
    const nextGap = Math.max(0, Math.min(2000, parsed));
    onGapChange(nextGap);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0' }}>
      <span style={{ minWidth: '50px', fontSize: '11px', color: 'var(--theme-text-secondary)', fontWeight: 500 }}>{label}</span>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '36px',
          height: '20px',
          borderRadius: '10px',
          border: '1px solid var(--theme-primary, #4a90d9)',
          cursor: 'pointer',
          backgroundColor: enabled ? 'var(--theme-primary, #4a90d9)' : 'transparent',
          position: 'relative',
          transition: 'background-color 0.2s',
          flexShrink: 0,
        }}
      >
        <span style={{
          position: 'absolute',
          top: '2px',
          width: '14px',
          height: '14px',
          borderRadius: '50%',
          backgroundColor: enabled ? '#fff' : 'var(--theme-primary, #4a90d9)',
          transition: 'left 0.2s',
          left: enabled ? '18px' : '2px',
        }} />
      </button>
      <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
        {enabled ? (
          <>
            <div style={numberBoxStyle}>
              <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', flexShrink: 0 }}>높이</span>
              <input
                type="text"
                inputMode="numeric"
                defaultValue={visibleSize || ''}
                key={`${label}-${type}-size-${visibleSize}`}
                onBlur={(e) => commit(e.target.value, onSizeChange)}
                style={inputStyle}
              />
            </div>
            <div style={numberBoxStyle}>
              <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', flexShrink: 0 }}>옵셋</span>
              <input
                type="text"
                inputMode="numeric"
                defaultValue={offset || ''}
                key={`${label}-${type}-offset-${offset}`}
                onBlur={(e) => commit(e.target.value, onOffsetChange, -500, 500)}
                style={inputStyle}
              />
            </div>
            <div style={numberBoxStyle}>
              <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', flexShrink: 0 }}>갭</span>
              <input
                type="text"
                inputMode="numeric"
                defaultValue={gap || ''}
                key={`${label}-${type}-gap`}
                onChange={(e) => {
                  if (e.target.value === '' || e.target.value === '-' || /^-?\d+$/.test(e.target.value)) {
                    commitGap(e.target.value);
                  }
                }}
                onBlur={(e) => commitGap(e.target.value)}
                style={inputStyle}
              />
            </div>
          </>
        ) : (
          <div style={numberBoxStyle}>
            <span style={{ fontSize: '10px', color: 'var(--theme-text-secondary)', flexShrink: 0 }}>
              {type === 'top' ? '상단갭' : '띄움높이'}
            </span>
            <input
              type="text"
              inputMode="numeric"
              defaultValue={(type === 'top' ? gap : floatHeight) || ''}
              key={`${label}-${type}-off`}
              onChange={(e) => {
                if (e.target.value === '' || e.target.value === '-' || /^-?\d+$/.test(e.target.value)) {
                  commit(e.target.value, type === 'top' ? onGapChange : (onFloatChange || (() => undefined)), 0, 2000);
                }
              }}
              onBlur={(e) => commit(e.target.value, type === 'top' ? onGapChange : (onFloatChange || (() => undefined)), 0, 2000)}
              style={inputStyle}
            />
          </div>
        )}
      </div>
    </div>
  );
});

const RightPanel: React.FC<RightPanelProps> = ({
  activeTab,
  onTabChange,
  isOpen,
  onToggle,
  installType,
  onInstallTypeChange,
  width,
  height,
  onWidthChange,
  onHeightChange,
  hasStep,
  onStepToggle,
  doorCount,
  onDoorCountChange,
  hasFloorFinish,
  onFloorFinishToggle,
  hasBase,
  onBaseToggle,
  baseHeight,
  baseDepth,
  onBaseHeightChange,
  onBaseDepthChange,
  frameType,
  onFrameTypeChange
}) => {
  const { user } = useAuth();
  const { spaceInfo, setSpaceInfo } = useSpaceConfigStore();
  const { placedModules, clearAllModules, updatePlacedModule } = useFurnitureStore();
  const { setActiveDroppedCeilingTab, selectedFurnitureId, setHighlightedFrame } = useUIStore();
  const { t, currentLanguage } = useTranslation();

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['space', 'layoutMode', 'layout', 'slotFrame', 'guideSlotTopFrame', 'guideSlotBaseFrame'])
  );

  // 상부/걸래받이 '전체' 통합 모드: 우측바와 슬롯 설정모드가 같은 spaceInfo 값만 사용한다.
  const topFrameAllMode = spaceInfo.guideTopFrameAllMode ?? true;
  const baseFrameAllMode = spaceInfo.guideBaseFrameAllMode ?? true;
  const setTopFrameAllMode = (next: boolean) => setSpaceInfo({ guideTopFrameAllMode: next });
  const setBaseFrameAllMode = (next: boolean) => setSpaceInfo({ guideBaseFrameAllMode: next });

  // 사용자가 설정한 기본 프레임/받침대 디폴트 (없으면 시스템 폴백)
  const [userDefaults, setUserDefaults] = useState<{
    frameTop?: number;
    topOffset?: number;
    topGap?: number;
    baseHeight?: number;
    baseOffset?: number;
    baseLowerSize?: number;
    baseLowerOffset?: number;
    baseGap?: number;
    baseLowerGap?: number;
  }>({});
  const resolveDefaultBackedRawSize = React.useCallback((
    rawSize: number | undefined,
    defaultRawSize: number | undefined,
    _gap: number | undefined
  ) => {
    return rawSize ?? defaultRawSize ?? 0;
  }, []);
  useEffect(() => {
    let cancelled = false;
    const applyDefaults = (d: Awaited<ReturnType<typeof getSpaceConfigDefaults>>) => {
      if (cancelled || !d) return;
      const baseOffset = d.baseboardOffset ?? d.baseFrameOffset;
      const baseLowerOffset = d.baseboardLowerOffset ?? baseOffset;
      const baseGap = d.baseboardGap ?? d.baseFrameGap;
      const baseLowerGap = d.baseboardLowerGap ?? baseGap;
	      setUserDefaults({
	        frameTop: d.topMoldingEnabled === false ? 0 : (
	          d.topMoldingSize !== undefined ? d.topMoldingSize : d.frameTop
	        ),
	        topOffset: d.topMoldingOffset ?? d.frameTopOffset,
	        topGap: d.topMoldingGap,
	        baseHeight: d.baseboardEnabled === false ? 0 : (
	          d.baseboardSize !== undefined ? d.baseboardSize : d.baseHeight
	        ),
	        baseOffset,
	        baseLowerSize: d.baseboardLowerEnabled === false ? 0 : (
	          d.baseboardLowerSize !== undefined
	            ? d.baseboardLowerSize
	            : (d.baseboardSize ?? d.baseHeight ?? 105)
	        ),
	        baseLowerOffset,
        baseGap,
        baseLowerGap
      });
    };
    const reloadDefaults = () => {
      getSpaceConfigDefaults().then(applyDefaults).catch(() => { /* noop */ });
    };
    const handleDefaultsUpdated = (event: Event) => {
      applyDefaults((event as CustomEvent).detail);
    };

    reloadDefaults();
    window.addEventListener('space-defaults-updated', handleDefaultsUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener('space-defaults-updated', handleDefaultsUpdated);
    };
  }, []);

  // 초기 렌더링 시 UIStore 동기화
  useEffect(() => {
    if (spaceInfo.droppedCeiling?.enabled) {
      setActiveDroppedCeilingTab(activeTab === 'placement' ? 'main' : 'dropped');
    }
  }, [activeTab, spaceInfo.droppedCeiling?.enabled, setActiveDroppedCeilingTab]);

  // 컬럼 수 범위 계산
  const DOOR_WIDTH = 588;
  
  // 단내림이 활성화된 경우 메인 구간의 폭 계산
  const getMainZoneWidth = () => {
    if (spaceInfo.droppedCeiling?.enabled) {
      // 단내림 활성화 시 전체 폭에서 단내림 폭을 뺀 나머지가 메인 구간
      const mainZoneWidth = width - (spaceInfo.droppedCeiling.width || 1300);
// console.log('🎯 메인 구간 폭 계산 (RightPanel):', {
        // totalWidth: width,
        // droppedWidth: spaceInfo.droppedCeiling.width || 1300,
        // mainZoneWidth
      // });
      return mainZoneWidth;
    }
    return width;
  };
  
  const calculateDoorRange = (_spaceWidth: number) => {
    // SpaceCalculator 기반으로 실제 내부 너비 사용
    const internalWidth = SpaceCalculator.calculateInternalWidth(spaceInfo);
    const limits = SpaceCalculator.getColumnCountLimits(internalWidth);

    const idealDoorCount = Math.max(limits.minColumns, Math.round(internalWidth / 500));

    return {
      min: limits.minColumns,
      max: limits.maxColumns,
      ideal: idealDoorCount
    };
  };

  // width 또는 단내림 설정 변경 시 doorCount 자동 조정
  React.useEffect(() => {
    const mainZoneWidth = getMainZoneWidth();
    const range = calculateDoorRange(mainZoneWidth);
    if (doorCount < range.min || doorCount > range.max) {
      // 현재 doorCount가 새로운 범위를 벗어나면 가장 가까운 유효한 값으로 조정
      const newDoorCount = Math.max(range.min, Math.min(range.max, doorCount));
      onDoorCountChange(newDoorCount);
    }
  }, [width, doorCount, onDoorCountChange, spaceInfo.droppedCeiling]);

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };


  
  // 메인 구간의 폭을 기준으로 도어 범위 계산
  const mainZoneWidth = getMainZoneWidth();
  const doorRange = calculateDoorRange(mainZoneWidth);
  const minDoors = doorRange.min;
  const maxDoors = doorRange.max;

  const isEqualDivision = (spaceInfo.layoutMode || 'equal-division') === 'equal-division';
  const tabs = spaceInfo.droppedCeiling?.enabled && isEqualDivision ? [
    { id: 'placement' as RightPanelTab, label: t('space.mainSection') },
    { id: 'module' as RightPanelTab, label: t('space.droppedSection') }
  ] : [
    { id: 'placement' as RightPanelTab, label: '배치속성' },
    { id: 'module' as RightPanelTab, label: '배치모듈' }
  ];

  const installTypes = [
    { id: 'builtin', label: t('space.wallMount') },
    { id: 'semistanding', label: t('space.semiStanding') },
    { id: 'freestanding', label: t('space.standing') }
  ];

  const materialOptions = React.useMemo(() => [
    { id: 'white', label: t('material.white') },
    { id: 'melamine', label: t('material.melamine') },
    { id: 'premium', label: t('material.premium') }
  ], [t, currentLanguage]);

  const floorOptions = React.useMemo(() => {
    const options = [
      { id: 'yes', label: t('common.enabled') },
      { id: 'no', label: t('common.none') }
    ];
    return options;
  }, [t, currentLanguage]);

  const frameTypeOptions = React.useMemo(() => [
    { id: 'surround', label: t('space.surround') },
    { id: 'no-surround', label: t('space.noSurround') }
  ], [t, currentLanguage]);

  // 단내림 위치 옵션
  const droppedCeilingPositionOptions = React.useMemo(() => [
    { id: 'left', label: t('furniture.left') },
    { id: 'right', label: t('furniture.right') }
  ], [t, currentLanguage]);

  return (
    <div className={`${styles.rightPanel} ${isOpen ? styles.open : ''}`}>
      {/* 미리보기 뷰어 */}
      <PreviewViewer />

      {/* 탭 헤더 */}
      <div className={styles.tabHeader}>
        <div className={styles.tabGroup}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`${styles.tabButton} ${activeTab === tab.id ? styles.active : ''}`}
              onClick={() => {
                onTabChange(tab.id);
                // 단내림이 활성화된 경우 UIStore 업데이트 (균등분할 모드에서만)
                if (spaceInfo.droppedCeiling?.enabled && isEqualDivision) {
                  const newTab = tab.id === 'placement' ? 'main' : 'dropped';
// console.log('🎯 RightPanel 탭 클릭 - activeDroppedCeilingTab 설정:', {
                    // clickedTabId: tab.id,
                    // newActiveTab: newTab,
                    // droppedEnabled: spaceInfo.droppedCeiling?.enabled
                  // });
                  setActiveDroppedCeilingTab(newTab);
                }
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 패널 컨텐츠 */}
      <div className={styles.panelContent}>
        {activeTab === 'placement' && (
          <div className={styles.formContainer}>
            {/* 브랜드 타입 */}
            <FormControl
              label={t('common.brandType')}
              expanded={expandedSections.has('brand')}
              onToggle={() => toggleSection('brand')}
              helpText="가구 브랜드 타입을 선택합니다. 싱글(1칸)과 듀얼(2칸) 중 선택할 수 있습니다."
            >
              <div className={styles.brandType}>
                <div className={styles.brandLabel}>{t('furniture.single')}</div>
                <div className={styles.brandOptions}>
                  <button className={styles.brandOption}>{t('furniture.single')}</button>
                  <button className={styles.brandOption}>{t('furniture.dual')}</button>
                </div>
              </div>
            </FormControl>

            {/* 가격 정보 */}
            <FormControl
              label={t('common.priceInfo')}
              expanded={expandedSections.has('price')}
              onToggle={() => toggleSection('price')}
              helpText="현재 설정된 가구 구성의 예상 가격을 표시합니다."
            >
              <div className={styles.priceInfo}>
                <div className={styles.priceLabel}>{t('common.priceInfo')}</div>
                <div className={styles.priceValue}>₩2,580,000</div>
              </div>
            </FormControl>

            {/* 다재 선택 */}
            <FormControl
              label={t('material.selection')}
              expanded={expandedSections.has('material')}
              onToggle={() => toggleSection('material')}
              helpText="가구 본체에 사용할 자재를 선택합니다. 선택한 자재에 따라 색상과 질감이 변경됩니다."
            >
              <ColorWheel />
              <div className={styles.materialToggle}>
                <div className={styles.materialLabel}>{t('material.title')}</div>
                <ToggleGroup
                  options={materialOptions}
                  selected="white"
                  onChange={() => {}}
                />
              </div>
            </FormControl>

            {/* 공간 설정 */}
            <FormControl
              label={t('space.title')}
              expanded={expandedSections.has('space')}
              onToggle={() => toggleSection('space')}
              helpText="설치 공간의 전체 너비와 높이를 설정합니다. 실측 치수를 입력하세요."
            >
              <NumberInput
                label={t('space.totalWidth')}
                value={width}
                onChange={(newWidth) => {
                  onWidthChange(newWidth);
                  // width 변경 시 doorCount 범위 체크 및 자동 조정은 useEffect에서 처리
                }}
                min={1000}
                max={8000}
                step={100}
              />
              <NumberInput
                label={t('space.height')}
                value={height}
                onChange={onHeightChange}
                min={2000}
                max={3000}
                step={100}
              />
              
              {/* 단내림 활성화 시 구간별 정보 표시 - 균등분할 모드에서만 */}
              {spaceInfo.droppedCeiling?.enabled && isEqualDivision && (
                <div className={styles.zoneInfo}>
                  <div className={styles.zoneInfoItem}>
                    <span className={styles.zoneLabel}>{t('space.mainSection')}:</span>
                    <span className={styles.zoneValue}>{(() => {
                      const mainOuter = width - spaceInfo.droppedCeiling.width;
                      const gapLeft = spaceInfo.gapConfig?.left ?? 1.5;
                      const gapRight = spaceInfo.gapConfig?.right ?? 1.5;
                      const gapMiddle = spaceInfo.gapConfig?.middle ?? 1.5;
                      const pos = spaceInfo.droppedCeiling.position || 'right';
                      const mainW = Math.round(pos === 'right' ? mainOuter - gapLeft - gapMiddle : mainOuter - gapMiddle - gapRight);
                      return `${mainW} × ${height}`;
                    })()} mm</span>
                  </div>
                  <div className={styles.zoneInfoItem}>
                    <span className={styles.zoneLabel}>{t('space.droppedSection')}:</span>
                    <span className={styles.zoneValue}>{(() => {
                      const droppedOuter = spaceInfo.droppedCeiling.width;
                      const pos = spaceInfo.droppedCeiling.position || 'right';
                      const gap = pos === 'right' ? (spaceInfo.gapConfig?.right ?? 1.5) : (spaceInfo.gapConfig?.left ?? 1.5);
                      const droppedW = Math.round(droppedOuter - gap);
                      const droppedH = height - (spaceInfo.droppedCeiling.dropHeight || 0);
                      return `${droppedW} × ${droppedH}`;
                    })()} mm</span>
                  </div>
                </div>
              )}
            </FormControl>

            {/* 단내림 설정 */}
            {(<FormControl
              label={t('space.droppedCeiling')}
              expanded={expandedSections.has('droppedCeiling')}
              onToggle={() => toggleSection('droppedCeiling')}
              helpText="천장 단내림이 있는 경우 설정합니다. 단내림 구간의 위치, 너비, 높이를 지정하여 해당 영역에 맞는 가구를 배치할 수 있습니다."
            >
              {/* 단내림 있음/없음 토글 */}
              <ToggleGroup
                key={`dropped-ceiling-${currentLanguage}`}
                options={[
                  { id: 'no', label: t('common.none') },
                  { id: 'yes', label: t('common.enabled') }
                ]}
                selected={spaceInfo.droppedCeiling?.enabled ? 'yes' : 'no'}
                onChange={(value) => {
                  const isEnabled = value === 'yes';
                  if (isEnabled) {
                    // 단내림 활성화
                    onInstallTypeChange && onInstallTypeChange(installType); // 설치 타입 유지
                    const droppedWidth = 1300; // 기본 단내림 폭
                    const droppedHeight = 200; // 기본 단내림 높이
                    
                    // 단내림 구간의 내경폭으로 적절한 도어 개수 계산
                    const frameThickness = 50;
                    const droppedInternalWidth = droppedWidth - frameThickness;
                    const droppedDoorCount = SpaceCalculator.getDefaultColumnCount(droppedInternalWidth);
                    
// console.log('🎯 단내림 활성화 시 도어개수 계산:', {
                      // droppedWidth,
                      // frameThickness,
                      // droppedInternalWidth,
                      // droppedDoorCount,
                      // 계산식: `Math.ceil(${droppedInternalWidth} / 600) = ${Math.ceil(droppedInternalWidth / 600)}`
                    // });
                    
                    const updates: any = {
                      droppedCeiling: {
                        enabled: true,
                        width: droppedWidth,
                        dropHeight: droppedHeight,
                        position: 'right' // 기본 위치
                      },
                      droppedCeilingDoorCount: droppedDoorCount // 계산된 도어 개수로 설정
                    };
                    // spaceConfigStore 업데이트 호출
                    setSpaceInfo(updates);
                  } else {
                    // 단내림 비활성화
                    const updates: any = {
                      droppedCeiling: {
                        ...spaceInfo.droppedCeiling,
                        enabled: false
                      },
                      mainDoorCount: undefined,
                      droppedCeilingDoorCount: undefined
                    };
                    setSpaceInfo(updates);
                  }
                }}
              />
              
              {/* 단내림이 활성화된 경우 위치 선택 및 너비 조절 */}
              {spaceInfo.droppedCeiling?.enabled && (
                <>
                  <div style={{ marginTop: '16px' }}>
                    <div className={styles.inputLabel} style={{ marginBottom: '8px' }}>
                      {t('placement.droppedCeilingPosition')}
                    </div>
                    <ToggleGroup
                      key={`dropped-position-${currentLanguage}`}
                      options={droppedCeilingPositionOptions}
                      selected={spaceInfo.droppedCeiling?.position || 'right'}
                      onChange={(position) => {
                        const updates: any = {
                          droppedCeiling: {
                            ...spaceInfo.droppedCeiling,
                            position: position as 'left' | 'right'
                          }
                        };
                        setSpaceInfo(updates);
                      }}
                    />
                  </div>
                  
                  {/* 단내림 구간 너비 조절 슬라이더 */}
                  <div style={{ marginTop: '16px' }}>
                    <div className={styles.inputLabel} style={{ marginBottom: '8px' }}>{t('space.droppedCeilingWidth')}</div>
                    <Slider
                      value={spaceInfo.droppedCeiling?.width || 1300}
                      onChange={(newWidth) => {
                        // 너비가 변경되면 해당 너비에 맞는 적절한 컬럼수 재계산
                        const frameThickness = 50;
                        const droppedInternalWidth = newWidth - frameThickness;
                        const newDoorCount = SpaceCalculator.getDefaultColumnCount(droppedInternalWidth);
                        
                        const updates: any = {
                          droppedCeiling: {
                            ...spaceInfo.droppedCeiling,
                            width: newWidth
                          },
                          droppedCeilingDoorCount: newDoorCount
                        };
                        if (window.handleSpaceInfoUpdate) {
                          window.handleSpaceInfoUpdate(updates);
                        }
                      }}
                      min={600}
                      max={Math.min(width - 600, 2400)} // 전체 너비에서 최소 메인구간 600mm 확보, 최대 2400mm
                      step={100}
                      format={(val) => `${val}mm`}
                    />
                  </div>
                </>
              )}
            </FormControl>)}

            {/* 배치 방식 */}
            <FormControl
              label={t('space.layoutMode')}
              expanded={expandedSections.has('layoutMode')}
              onToggle={() => toggleSection('layoutMode')}
              helpText="오토슬롯: 공간을 동일한 폭으로 나누어 가구를 배치합니다. 자유배치: 원하는 위치에 자유롭게 가구를 배치합니다."
            >
              <ToggleGroup
                key={`layout-mode-${currentLanguage}`}
                options={[
                  { id: 'equal-division', label: t('space.equalDivision') },
                  { id: 'free-placement', label: t('space.freePlacement') },
                ]}
                selected={spaceInfo.layoutMode || 'equal-division'}
                onChange={(value) => {
                  const newMode = value as 'equal-division' | 'free-placement';
                  const currentMode = spaceInfo.layoutMode || 'equal-division';
                  if (newMode === currentMode) return;
                  const hasModules = placedModules.length > 0;
                  const hasColumns = (spaceInfo.columns || []).length > 0;
                  if (hasModules || hasColumns) {
                    if (!window.confirm(t('space.modeSwitchWarning'))) return;
                    if (hasModules) clearAllModules();
                    if (hasColumns) setSpaceInfo({ columns: [] });
                  }
                  setSpaceInfo({ layoutMode: newMode });
                }}
              />
            </FormControl>

            {/* 컬럼수 - 오토슬롯 모드에서만 표시 */}
            {isEqualDivision && (
              <FormControl
                label={t('space.columnCount')}
                expanded={expandedSections.has('layout')}
                onToggle={() => toggleSection('layout')}
                helpText="공간을 나눌 칸 수를 설정합니다. 칸 수에 따라 각 슬롯의 너비가 자동으로 계산됩니다."
              >
                <NumberInput
                  label={spaceInfo.droppedCeiling?.enabled ? t('space.columnCount') : t('space.columnCount')}
                  value={doorCount}
                  onChange={onDoorCountChange}
                  min={minDoors}
                  max={maxDoors}
                  unit={t('common.unit')}
                />

                <DoorSlider
                  value={doorCount}
                  onChange={onDoorCountChange}
                  width={width}
                />

              </FormControl>
            )}

            {/* 바닥 마감재 - 띄워서 배치일 때는 숨김 */}
            {(() => {
              const isFloat = spaceInfo.baseConfig?.placementType === 'float' && (spaceInfo.baseConfig?.floatHeight || 0) > 0;
// console.log('🔴🔴🔴 바닥마감재 메뉴 조건:', {
                // baseConfig: spaceInfo.baseConfig,
                // placementType: spaceInfo.baseConfig?.placementType,
                // floatHeight: spaceInfo.baseConfig?.floatHeight,
                // isFloat,
                // shouldShow: !isFloat
              // });
              return !isFloat;
            })() && (
              <FormControl
                label={t('material.floorFinish')}
                expanded={expandedSections.has('floor')}
                onToggle={() => toggleSection('floor')}
                helpText="바닥 마감재 유무를 설정합니다. 마감재가 있으면 가구 하단에 바닥재 두께만큼 여유를 둡니다."
              >
                <ToggleGroup
                  key={`floor-${currentLanguage}`}
                  options={floorOptions}
                  selected={hasFloorFinish ? 'yes' : 'no'}
                  onChange={(value) => onFloorFinishToggle()}
                />
              </FormControl>
            )}

            {/* 프레임 속성 */}
            <FormControl
              label={t('frame.properties')}
              expanded={expandedSections.has('frame')}
              onToggle={() => toggleSection('frame')}
              helpText="프레임 타입을 선택합니다. 서라운드: 벽면 프레임으로 감싸는 방식. 노서라운드: 프레임 없이 빌트인으로 설치합니다."
            >
              <ToggleGroup
                key={`frame-${currentLanguage}`}
                options={frameTypeOptions}
                selected={frameType}
                onChange={(value) => onFrameTypeChange(value as 'surround' | 'no-surround')}
              />
            </FormControl>
            
            {/* 노서라운드 모드에서 상단몰딩 설정 표시 */}
            {frameType === 'no-surround' && (
              <FormControl
                label={t('space.topFrame')}
                expanded={expandedSections.has('topFrame')}
                onToggle={() => toggleSection('topFrame')}
                helpText="노서라운드 모드에서 상단 몰딩의 높이를 설정합니다. 가구 위쪽 마감 처리에 사용됩니다."
              >
                <NumberInput
                  label={t('space.frameHeight')}
                  value={spaceInfo.frameSize?.top ?? 30}
                  onChange={(value) => {
                    const updates = {
                      frameSize: {
                        ...spaceInfo.frameSize,
                        top: value
                      }
                    };
                    setSpaceInfo(updates);
                  }}
                  min={10}
                  max={200}
                  step={1}
                  unit="mm"
                />
              </FormControl>
            )}

            {/* 커스텀 슬롯 설정: 상단몰딩/걸레받이 */}
            {(() => {
              const guideSlots = spaceInfo.freePlacementGuides || [];
              const showGuideFrameSettings =
                spaceInfo.layoutMode === 'free-placement'
                && spaceInfo.customGuideMode === true
                && spaceInfo.freePlacementGuideEditing === true
                && guideSlots.length > 0;
              if (!showGuideFrameSettings) return null;

              const guideTopFrameAllMode = spaceInfo.guideTopFrameAllMode ?? true;
              const guideBaseFrameAllMode = spaceInfo.guideBaseFrameAllMode ?? true;
              const topFrameSlots = guideSlots
                .filter((slot) => (slot.guideZone || 'full') !== 'lower')
                .sort((a, b) => a.x - b.x || a.index - b.index);
              const baseFrameSlots = guideSlots
                .filter((slot) => (slot.guideZone || 'full') !== 'upper')
                .sort((a, b) => a.x - b.x || a.index - b.index);
              const guideTopCandidateModules = placedModules.filter((module) => (
                !module.isSurroundPanel
                && (
                  module.guideSlotPlacement === true
                  || module.guideDepthPlacement === true
                  || spaceInfo.customGuideMode === true
                )
                && (getModuleCategory(module) === 'upper' || getModuleCategory(module) === 'full')
              ));
              const allBaseGuideSlotsAreLower = baseFrameSlots.length > 0 && baseFrameSlots.every(slot => (slot.guideZone || 'full') === 'lower');
              const frameSize = (spaceInfo.frameSize || {}) as any;
              const baseConfig = (spaceInfo.baseConfig || {}) as any;
              const globalTopGap = Math.max(0, frameSize.topGap ?? userDefaults.topGap ?? 0);
              const globalTopRaw = resolveDefaultBackedRawSize(spaceInfo.frameSize?.top, userDefaults.frameTop ?? 30, globalTopGap);
              const globalTopEnabled = globalTopRaw > 0;
              const globalTopThickness = globalTopRaw > 0 ? globalTopRaw : Math.max(30, globalTopGap);
              const globalTopOffset = frameSize.topOffset ?? userDefaults.topOffset ?? 0;
              const globalBaseEnabled = spaceInfo.baseConfig?.type !== 'stand' && (spaceInfo.baseConfig?.height ?? 0) > 0;
              const globalBaseGap = globalBaseEnabled ? Math.max(0, baseConfig.gap ?? userDefaults.baseGap ?? 0) : 0;
              const lowerGuideBaseDefault = spaceInfo.baseboardLowerSize ?? userDefaults.baseLowerSize ?? 105;
              const globalLowerBaseGap = globalBaseEnabled ? Math.max(0, spaceInfo.baseboardLowerGap ?? userDefaults.baseLowerGap ?? globalBaseGap) : 0;
              const globalBaseHeight = globalBaseEnabled
                ? resolveDefaultBackedRawSize(
                  allBaseGuideSlotsAreLower ? spaceInfo.baseboardLowerSize : spaceInfo.baseConfig?.height,
                  allBaseGuideSlotsAreLower ? lowerGuideBaseDefault : (userDefaults.baseHeight ?? 65),
                  allBaseGuideSlotsAreLower ? globalLowerBaseGap : globalBaseGap
                )
                : Math.max(65, spaceInfo.baseConfig?.height || userDefaults.baseHeight || 65);
              const globalBaseOffset = baseConfig.offset ?? userDefaults.baseOffset ?? 0;
              const globalLowerBaseOffset = spaceInfo.baseboardLowerOffset ?? userDefaults.baseLowerOffset ?? globalBaseOffset;
              const globalFloatHeight = globalBaseEnabled ? 0 : Math.max(0, spaceInfo.baseConfig?.floatHeight ?? 0);
              const defaultIfZero = (value: number | undefined, fallback: number) => (
                value === undefined ? fallback : value
              );
              const updateGuideSlotFrame = (slotId: string, updates: Partial<FreePlacementGuideSlot>) => {
                setSpaceInfo({
                  freePlacementGuides: guideSlots.map((slot) => (
                    slot.id === slotId ? { ...slot, ...updates } : slot
                  ))
                });
              };
              const syncGuideTopFrameAll = (
                frameSizeUpdates: Record<string, any>,
                slotUpdates: Partial<FreePlacementGuideSlot>,
                buildModuleUpdates: (module: any) => Record<string, any>
              ) => {
                setSpaceInfo({
                  frameSize: {
                    ...frameSize,
                    ...frameSizeUpdates
                  },
                  freePlacementGuides: guideSlots.map((slot) => (
                    (slot.guideZone || 'full') === 'lower'
                      ? slot
                      : { ...slot, ...slotUpdates }
                  ))
                });
                guideTopCandidateModules.forEach((module) => {
                  updatePlacedModule(module.id, buildModuleUpdates(module));
                });
              };
              const getSlotTopEnabled = (slot: FreePlacementGuideSlot) => slot.hasTopFrame ?? globalTopEnabled;
              const getSlotTopThickness = (slot: FreePlacementGuideSlot) => (
                resolveDefaultBackedRawSize(
                  slot.topFrameThickness,
                  globalTopRaw > 0 ? globalTopRaw : Math.max(30, defaultIfZero(slot.topFrameGap, globalTopGap)),
                  getSlotTopGap(slot)
                )
              );
              const getSlotTopGap = (slot: FreePlacementGuideSlot) => (
                Math.max(0, defaultIfZero(slot.topFrameGap, globalTopGap))
              );
              const getSlotBaseEnabled = (slot: FreePlacementGuideSlot) => slot.hasBase ?? globalBaseEnabled;
              const getSlotBaseHeight = (slot: FreePlacementGuideSlot) => (
                resolveDefaultBackedRawSize(
                  slot.baseFrameHeight,
                  (slot.guideZone || 'full') === 'lower' ? lowerGuideBaseDefault : (globalBaseHeight > 0 ? globalBaseHeight : 65),
                  getSlotBaseGap(slot)
                )
              );
              const getSlotBaseGap = (slot: FreePlacementGuideSlot) => (
                getSlotBaseEnabled(slot)
                  ? Math.max(0, defaultIfZero(slot.baseFrameGap, (slot.guideZone || 'full') === 'lower' ? globalLowerBaseGap : globalBaseGap))
                  : 0
              );
              const guideAllCheckboxStyle: React.CSSProperties = {
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                width: 'fit-content',
                marginBottom: '4px',
                fontSize: '11px',
                color: 'var(--theme-text-secondary)',
                cursor: 'pointer'
              };
              const guideAllCheckboxBottomStyle: React.CSSProperties = {
                ...guideAllCheckboxStyle,
                marginTop: '4px',
                marginBottom: 0
              };

              return (
                <>
                  <FormControl
                    label="상단몰딩"
                    expanded={expandedSections.has('guideSlotTopFrame')}
                    onToggle={() => toggleSection('guideSlotTopFrame')}
                    helpText="커스텀 슬롯의 상단몰딩을 전체 또는 슬롯별로 설정합니다."
                  >
                    <label style={guideAllCheckboxStyle}>
                      <input
                        type="checkbox"
                        checked={guideTopFrameAllMode}
                        onChange={(e) => setSpaceInfo({ guideTopFrameAllMode: e.target.checked })}
                        style={{ cursor: 'pointer', accentColor: 'var(--theme-primary, #4a90d9)' }}
                      />
                      <span>전체</span>
                    </label>
                    {guideTopFrameAllMode ? (
                      <GuideSlotFrameRow
                        label="전체"
                        enabled={globalTopEnabled}
                        type="top"
                        size={globalTopThickness}
                        offset={globalTopOffset}
                        gap={globalTopEnabled ? globalTopGap : Math.max(0, globalTopGap || globalTopThickness)}
                        onToggle={() => {
                          const nextGap = Math.max(0, globalTopGap || globalTopThickness);
                          const nextTop = Math.max(1, globalTopGap || globalTopThickness || 30);
                          syncGuideTopFrameAll(
                            globalTopEnabled
                              ? { top: 0, topGap: nextGap }
                              : { top: nextTop, topGap: 0 },
                            globalTopEnabled
                              ? { hasTopFrame: false, topFrameGap: nextGap, topFrameThickness: globalTopThickness }
                              : { hasTopFrame: true, topFrameGap: 0, topFrameThickness: nextTop },
                            (module) => globalTopEnabled
                              ? {
                                hasTopFrame: false,
                                topFrameGap: nextGap,
                                topFrameThickness: module.topFrameThickness ?? globalTopThickness,
                                doorTopGap: getTopDoorGapForFrameState(spaceInfo, false, module)
                              }
                              : {
                                hasTopFrame: true,
                                topFrameGap: 0,
                                topFrameThickness: nextTop,
                                doorTopGap: getTopDoorGapForFrameState(spaceInfo, true, module)
                              }
                          );
                        }}
                        onSizeChange={(v) => syncGuideTopFrameAll(
                          { top: v },
                          { topFrameThickness: v },
                          () => ({ topFrameThickness: v })
                        )}
                        onOffsetChange={(v) => syncGuideTopFrameAll(
                          { topOffset: v },
                          { topFrameOffset: v },
                          () => ({ topFrameOffset: v })
                        )}
                        onGapChange={(v, nextSize) => {
                          const nextGap = Math.max(0, v);
                          syncGuideTopFrameAll(
                            {
                              ...(nextSize !== undefined ? { top: nextSize } : {}),
                              topGap: nextGap
                            },
                            {
                              ...(nextSize !== undefined ? { topFrameThickness: nextSize } : {}),
                              topFrameGap: nextGap,
                              ...(globalTopEnabled ? {} : { hasTopFrame: false })
                            },
                            () => ({
                              ...(nextSize !== undefined ? { topFrameThickness: nextSize } : {}),
                              topFrameGap: nextGap,
                              ...(globalTopEnabled ? {} : { hasTopFrame: false })
                            })
                          );
                        }}
                      />
                    ) : (
                      topFrameSlots.map((slot, idx) => {
                        const enabled = getSlotTopEnabled(slot);
                        const gap = getSlotTopGap(slot);
                        const thickness = getSlotTopThickness(slot);
                        return (
                          <GuideSlotFrameRow
                            key={`guide-top-${slot.id}`}
                            label={`슬롯 ${idx + 1}`}
                            enabled={enabled}
                            type="top"
                            size={thickness}
                            offset={slot.topFrameOffset ?? globalTopOffset}
                            gap={gap}
                            onToggle={() => updateGuideSlotFrame(slot.id, {
                              hasTopFrame: !enabled,
                              topFrameGap: enabled ? thickness : 0,
                              topFrameThickness: thickness
                            })}
                            onSizeChange={(v) => updateGuideSlotFrame(slot.id, { topFrameThickness: v })}
                            onOffsetChange={(v) => updateGuideSlotFrame(slot.id, { topFrameOffset: v })}
                            onGapChange={(v, nextSize) => updateGuideSlotFrame(slot.id, {
                              ...(nextSize !== undefined ? { topFrameThickness: nextSize } : {}),
                              topFrameGap: Math.max(0, v)
                            })}
                          />
                        );
                      })
                    )}
                  </FormControl>

                  <FormControl
                    label="걸레받이"
                    expanded={expandedSections.has('guideSlotBaseFrame')}
                    onToggle={() => toggleSection('guideSlotBaseFrame')}
                    helpText="커스텀 슬롯의 걸레받이를 전체 또는 슬롯별로 설정합니다."
                  >
                    {guideBaseFrameAllMode ? (
                      <GuideSlotFrameRow
                        label="전체"
                        enabled={globalBaseEnabled}
                        type="base"
                        size={globalBaseHeight}
                        offset={allBaseGuideSlotsAreLower ? globalLowerBaseOffset : globalBaseOffset}
                        gap={allBaseGuideSlotsAreLower ? globalLowerBaseGap : globalBaseGap}
                        floatHeight={globalFloatHeight}
                        onToggle={() => {
                          setSpaceInfo({
                            baseConfig: globalBaseEnabled
                              ? { ...baseConfig, type: 'stand', placementType: 'float', height: 0, floatHeight: 0 }
                              : { ...baseConfig, type: 'floor', placementType: 'ground', height: Math.max(1, globalBaseHeight || 65), floatHeight: 0 }
                          });
                        }}
                        onSizeChange={(v) => setSpaceInfo(allBaseGuideSlotsAreLower
                          ? {
                            baseboardLowerSize: v,
                            baseConfig: { ...baseConfig, type: 'floor', placementType: 'ground' }
                          }
                          : { baseConfig: { ...baseConfig, type: 'floor', placementType: 'ground', height: v } }
                        )}
                        onOffsetChange={(v) => setSpaceInfo(allBaseGuideSlotsAreLower
                          ? { baseboardLowerOffset: v }
                          : { baseConfig: { ...baseConfig, offset: v } }
                        )}
                        onGapChange={(v, nextSize) => setSpaceInfo(allBaseGuideSlotsAreLower
                          ? {
                            ...(nextSize !== undefined ? { baseboardLowerSize: nextSize } : {}),
                            baseboardLowerGap: Math.max(0, v)
                          }
                          : {
                            baseConfig: {
                              ...baseConfig,
                              ...(nextSize !== undefined ? { height: nextSize } : {}),
                              gap: Math.max(0, v)
                            }
                          }
                        )}
                        onFloatChange={(v) => setSpaceInfo({ baseConfig: { ...baseConfig, type: 'stand', placementType: 'float', height: 0, floatHeight: v } })}
                      />
                    ) : (
                      baseFrameSlots.map((slot, idx) => {
                        const enabled = getSlotBaseEnabled(slot);
                        const gap = getSlotBaseGap(slot);
                        const baseHeightValue = getSlotBaseHeight(slot);
                        return (
                          <GuideSlotFrameRow
                            key={`guide-base-${slot.id}`}
                            label={`슬롯 ${idx + 1}`}
                            enabled={enabled}
                            type="base"
                            size={baseHeightValue}
                            offset={defaultIfZero(slot.baseFrameOffset, (slot.guideZone || 'full') === 'lower' ? globalLowerBaseOffset : globalBaseOffset)}
                            gap={gap}
                            floatHeight={slot.individualFloatHeight ?? 0}
                            onToggle={() => updateGuideSlotFrame(slot.id, {
                              hasBase: !enabled,
                              individualFloatHeight: enabled ? gap : slot.individualFloatHeight ?? gap,
                              baseFrameHeight: baseHeightValue
                            })}
                            onSizeChange={(v) => updateGuideSlotFrame(slot.id, { baseFrameHeight: v })}
                            onOffsetChange={(v) => updateGuideSlotFrame(slot.id, { baseFrameOffset: v })}
                            onGapChange={(v, nextSize) => updateGuideSlotFrame(slot.id, {
                              ...(nextSize !== undefined ? { baseFrameHeight: nextSize } : {}),
                              baseFrameGap: Math.max(0, v)
                            })}
                            onFloatChange={(v) => updateGuideSlotFrame(slot.id, { individualFloatHeight: v })}
                          />
                        );
                      })
                    )}
                    <label style={guideAllCheckboxBottomStyle}>
                      <input
                        type="checkbox"
                        checked={guideBaseFrameAllMode}
                        onChange={(e) => setSpaceInfo({ guideBaseFrameAllMode: e.target.checked })}
                        style={{ cursor: 'pointer', accentColor: 'var(--theme-primary, #4a90d9)' }}
                      />
                      <span>전체</span>
                    </label>
                  </FormControl>
                </>
              );
            })()}

            {/* 슬롯배치: 모든 가구의 상,걸래받이 개별 설정 (자유배치와 동일 형태) */}
	            {(() => {
	              if (spaceInfo.layoutMode === 'free-placement') return null;
	              const slotMods = placedModules.filter(m => !m.isSurroundPanel);
	              if (slotMods.length === 0) {
	                const internalWidthMm = Math.round(SpaceCalculator.calculateInternalWidth(spaceInfo) * 10) / 10;
	                const frameSize = (spaceInfo.frameSize || {}) as any;
	                const baseConfig = (spaceInfo.baseConfig || {}) as any;
	                const topEnabled = (spaceInfo.frameSize?.top ?? userDefaults.frameTop ?? 0) > 0;
	                const topOffset = frameSize.topOffset ?? userDefaults.topOffset ?? 0;
	                const topGap = Math.max(0, frameSize.topGap ?? userDefaults.topGap ?? 0);
	                const topSize = topEnabled ? resolveDefaultBackedRawSize(spaceInfo.frameSize?.top, userDefaults.frameTop ?? 30, topGap) : 0;
	                const baseEnabled = spaceInfo.baseConfig?.type !== 'stand' && (spaceInfo.baseConfig?.height ?? userDefaults.baseHeight ?? 0) > 0;
	                const baseOffset = baseConfig.offset ?? userDefaults.baseOffset ?? 0;
	                const baseGap = baseEnabled ? Math.max(0, baseConfig.gap ?? userDefaults.baseGap ?? 0) : 0;
	                const baseSize = baseEnabled ? resolveDefaultBackedRawSize(spaceInfo.baseConfig?.height, userDefaults.baseHeight ?? 65, baseGap) : 0;

	                return (
	                  <>
	                    <FormControl
	                      label="상단몰딩"
	                      expanded={expandedSections.has('slotFrame')}
	                      onToggle={() => toggleSection('slotFrame')}
	                      helpText="가구 배치 전 전역 상단몰딩 기본값입니다."
	                    >
	                      <FrameRow
	                        label="전체"
	                        enabled={topEnabled}
	                        widthMM={internalWidthMm}
	                        sizeMM={topSize}
	                        offset={topOffset}
	                        gap={topGap}
	                        onToggle={() => {
	                          const nextEnabled = !topEnabled;
	                          setSpaceInfo({
	                            frameSize: {
	                              ...spaceInfo.frameSize,
	                              top: nextEnabled ? (userDefaults.frameTop ?? 30) : 0,
	                              topGap: nextEnabled ? 0 : topGap,
	                            } as any,
	                          });
	                        }}
	                        onSizeChange={(v) => setSpaceInfo({ frameSize: { ...spaceInfo.frameSize, top: v } as any })}
	                        onOffsetChange={(v) => setSpaceInfo({ frameSize: { ...spaceInfo.frameSize, topOffset: v } as any })}
	                        onGapChange={(v, nextSize) => setSpaceInfo({
	                          frameSize: {
	                            ...spaceInfo.frameSize,
	                            ...(nextSize !== undefined ? { top: nextSize } : {}),
	                            topGap: Math.max(0, v)
	                          } as any
	                        })}
	                        hlKey="top-global"
	                        setHighlightedFrame={setHighlightedFrame}
	                      />
	                    </FormControl>
	                    <FormControl
	                      label="걸래받이"
	                      expanded={expandedSections.has('slotFrame')}
	                      onToggle={() => toggleSection('slotFrame')}
	                      helpText="가구 배치 전 전역 걸래받이 기본값입니다."
	                    >
	                      <FrameRow
	                        label="전체"
	                        enabled={baseEnabled}
	                        widthMM={internalWidthMm}
	                        sizeMM={baseSize}
	                        offset={baseOffset}
	                        gap={baseGap}
	                        onToggle={() => {
	                          const nextEnabled = !baseEnabled;
	                          setSpaceInfo({
	                            baseConfig: nextEnabled
	                              ? { ...baseConfig, type: 'floor', placementType: 'ground', height: userDefaults.baseHeight ?? 65, floatHeight: 0 }
	                              : { ...baseConfig, type: 'stand', placementType: 'float', height: 0, gap: 0, floatHeight: baseGap },
	                          });
	                        }}
	                        onSizeChange={(v) => setSpaceInfo({ baseConfig: { ...baseConfig, type: 'floor', placementType: 'ground', height: v } })}
	                        onOffsetChange={(v) => setSpaceInfo({ baseConfig: { ...baseConfig, offset: v } })}
	                        onGapChange={(v, nextSize) => setSpaceInfo({
	                          baseConfig: {
	                            ...baseConfig,
	                            ...(nextSize !== undefined ? { height: nextSize } : {}),
	                            gap: Math.max(0, v)
	                          }
	                        })}
	                        hlKey="base-global"
	                        setHighlightedFrame={setHighlightedFrame}
	                      />
	                    </FormControl>
	                  </>
	                );
	              }
	              const sorted = [...slotMods].sort((a, b) => a.position.x - b.position.x);
              const isInsertFrameSlot = (m: any) => typeof m.moduleId === 'string' && m.moduleId.includes('insert-frame');
              const topSortedMods = sorted.filter(m => !isInsertFrameSlot(m) && getModuleCategory(m) !== 'lower');
              const baseSortedMods = sorted.filter(m => !isInsertFrameSlot(m) && getModuleCategory(m) !== 'upper');
              const toAlpha = (n: number) => String.fromCharCode(64 + n);
              const globalTopGap = (spaceInfo.frameSize as any)?.topGap ?? userDefaults.topGap ?? 0;
              const globalBaseOffset = (spaceInfo.baseConfig as any)?.offset ?? userDefaults.baseOffset ?? 0;
              const globalLowerBaseOffset = spaceInfo.baseboardLowerOffset ?? userDefaults.baseLowerOffset ?? globalBaseOffset;
              const globalBaseGap = (spaceInfo.baseConfig as any)?.gap ?? userDefaults.baseGap ?? 0;
              const globalLowerBaseGap = spaceInfo.baseboardLowerGap ?? userDefaults.baseLowerGap ?? globalBaseGap;
              const globalTop = resolveDefaultBackedRawSize(spaceInfo.frameSize?.top, userDefaults.frameTop ?? 30, globalTopGap);
              const isLowerBaseModule = (module?: any) => getModuleCategory(module) === 'lower';
              const allBaseModsAreLower = baseSortedMods.length > 0 && baseSortedMods.every(isLowerBaseModule);
              const lowerBaseDefault = spaceInfo.baseboardLowerSize ?? userDefaults.baseLowerSize ?? 105;
              const globalBase = allBaseModsAreLower
                ? resolveDefaultBackedRawSize(baseSortedMods[0]?.baseFrameHeight ?? spaceInfo.baseboardLowerSize, lowerBaseDefault, globalLowerBaseGap)
                : resolveDefaultBackedRawSize(spaceInfo.baseConfig?.height, userDefaults.baseHeight ?? 65, globalBaseGap);
              const defaultIfZero = (value: number | undefined, fallback: number) => (
                value === undefined ? fallback : value
              );
              const getBaseOffsetDefault = (module?: any) => {
                const isLower = isLowerBaseModule(module);
                return isLower ? globalLowerBaseOffset : globalBaseOffset;
              };
              const getBaseGapDefault = (module?: any) => {
                const isLower = isLowerBaseModule(module);
                return isLower ? globalLowerBaseGap : globalBaseGap;
              };
              const getBaseOffsetDisplay = (module?: any) => defaultIfZero(module?.baseFrameOffset, getBaseOffsetDefault(module));
              const getBaseGapDisplay = (module?: any) => defaultIfZero(module?.baseFrameGap, getBaseGapDefault(module));
              const getBaseSizeDisplay = (module?: any) => {
                const isLower = isLowerBaseModule(module);
                return resolveDefaultBackedRawSize(
                  isLower ? (module?.baseFrameHeight ?? spaceInfo.baseboardLowerSize) : module?.baseFrameHeight,
                  isLower ? lowerBaseDefault : globalBase,
                  getBaseGapDisplay(module)
                );
              };
              const isMergeMode = spaceInfo.frameMergeEnabled ?? false;
              const indexing = calculateSpaceIndexing(spaceInfo);
              const slotColWidth = indexing.columnWidth || 0;
              // 저장된 topFrameOffset 그대로 표시 (Configurator effect가 surroundType별로 동기화)
              const getTopOffsetDisplay = (m: any) => m?.topFrameOffset ?? 0;
              const computeShelfSplitTopDistance = (m: any) => {
                if (!m) return null;
                const sections = Array.isArray(m?.customSections) ? m.customSections : [];
                if (!isShelfSplitModuleId(m?.moduleId) || sections.length < 2) return null;
                const baseDistance = m.hasBase === false
                  ? (m.individualFloatHeight ?? 0)
                  : (m.baseFrameHeight ?? (spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 65) : 0));
	                const sectionTop = baseDistance + sections
	                  .slice(0, 2)
	                  .reduce((sum: number, section: any) => sum + (Number(section?.height) || 0), 0);
	                return Math.max(0, Math.round((spaceInfo.height ?? 0) - sectionTop));
	              };
              const computeBodyHeightTopOffGap = (m: any) => {
                if (!m) return null;
                const bodyHeight = m.freeHeight ?? m.customHeight ?? m.moduleData?.dimensions?.height;
                if (typeof bodyHeight !== 'number' || bodyHeight <= 0) return null;
                const floorFinishH = spaceInfo.hasFloorFinish && spaceInfo.floorFinish?.height ? spaceInfo.floorFinish.height : 0;
                const bottomDistance = m.hasBase === false
                  ? (m.individualFloatHeight ?? 0)
                  : (m.baseFrameHeight ?? (spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 65) : 0));
                return Math.max(0, Math.round((spaceInfo.height ?? 0) - bodyHeight - bottomDistance - floorFinishH));
              };
	              const getTopSizeDisplay = (m: any) => {
	                const enabledGap = m?.hasTopFrame === false ? 0 : Math.max(0, defaultIfZero(m?.topFrameGap, globalTopGap));
	                return resolveDefaultBackedRawSize(m?.topFrameThickness, globalTop, enabledGap);
	              };
              const getTopOffGapDisplay = (m: any) => (
                m?.userResizedHeight === true
                  ? (computeShelfSplitTopDistance(m) ?? computeBodyHeightTopOffGap(m) ?? defaultIfZero(m?.topFrameGap, getTopSizeDisplay(m)))
                  : (computeShelfSplitTopDistance(m) ?? defaultIfZero(m?.topFrameGap, getTopSizeDisplay(m)))
              );
              const getTopGapDisplay = (m: any) => (
                m?.hasTopFrame === false
                  ? getTopOffGapDisplay(m)
                  : Math.max(0, defaultIfZero(m?.topFrameGap, globalTopGap))
              );
              const getTopFrameSizeUpdates = (m: any, nextSize: number) => {
                const clampedSize = Math.max(0, nextSize);
                const sections = Array.isArray(m?.customSections) ? m.customSections : [];
                if (!isShelfSplitModuleId(m?.moduleId) || sections.length < 2) {
                  return { topFrameThickness: clampedSize };
                }

                const baseDistance = m.hasBase === false
                  ? (m.individualFloatHeight ?? 0)
                  : (m.baseFrameHeight ?? (spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 65) : 0));
                const lowerH = Number(sections[0]?.height) || 0;
                const nextUpperH = Math.max(100, (spaceInfo.height ?? 0) - baseDistance - clampedSize - lowerH);
                const nextSections = sections.map((section: any, index: number) => (
                  index === 1 ? { ...section, height: nextUpperH, heightType: 'absolute' } : section
                ));
                return {
                  topFrameThickness: clampedSize,
                  customSections: nextSections,
                  upperDoorHingePositionsMm: undefined,
                };
              };

              // 병합 모드: computeFrameMergeGroups 사용
              if (isMergeMode) {
                const topGroups = computeFrameMergeGroups(topSortedMods, 'top');
                const baseGroups = computeFrameMergeGroups(baseSortedMods, 'base');
                const allTopOnMerge = topFrameAllMode;
                const allBaseOnMerge = baseFrameAllMode;
                const toggleAllTopMerge = () => {
                  const next = !topFrameAllMode;
                  setTopFrameAllMode(next);
                  topSortedMods.forEach(m => updatePlacedModule(m.id, {
                    hasTopFrame: true,
                    topFrameGap: 0,
	                    doorTopGap: getTopDoorGapForFrameState(spaceInfo, true, m)
                  }));
                };
                const toggleAllBaseMerge = () => {
                  const next = !baseFrameAllMode;
                  setBaseFrameAllMode(next);
                  baseSortedMods.forEach(m => updatePlacedModule(m.id, {
                    hasBase: true,
                    doorBottomGap: 25,
                  }));
                };

                return (
                  <>
                    {/* 상단몰딩 섹션 */}
                    <FormControl
                      label="상단몰딩"
                      expanded={expandedSections.has('slotFrame')}
                      onToggle={() => toggleSection('slotFrame')}
                      helpText="프레임 병합 모드: 병합 그룹 단위로 프레임을 설정합니다."
                      headerAccessory={
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--theme-text-secondary)', cursor: 'pointer' }}>
                          <input type="checkbox" checked={allTopOnMerge} onChange={toggleAllTopMerge} style={{ cursor: 'pointer', accentColor: 'var(--theme-primary, #4a90d9)' }} />
                          <span>전체</span>
                        </label>
                      }
                    >
                      {allTopOnMerge ? topGroups.map((group, gIdx) => {
                          const groupMods = group.moduleIds.map(id => topSortedMods.find(m => m.id === id)!).filter(Boolean);
                          const firstMod = groupMods[0];
                          const allEnabled = groupMods.every(m => m.hasTopFrame !== false);
                          const hlKey = `merged-top-${gIdx}`;
                          return (
                            <MergedFrameRow key={hlKey}
	                              label={group.label}
	                              enabled={allEnabled}
	                              widthMM={group.totalWidthMm}
		                              heightMM={firstMod?.topFrameThickness ?? globalTop}
	                              offset={(spaceInfo.frameSize as any)?.topOffset ?? getTopOffsetDisplay(firstMod)}
	                              gap={globalTopGap}
                              splitGapFromSize={allEnabled}
                              userBaseHeightDefault={userDefaults.frameTop}
                              onToggle={() => {
                                const newVal = !allEnabled;
                                group.moduleIds.forEach(id => {
                                  const target = topSortedMods.find(m => m.id === id);
                                  const nextTopSize = newVal ? getTopOffGapDisplay(target) : undefined;
	                                  updatePlacedModule(id, target && newVal ? {
	                                    ...getTopFrameSizeUpdates(target, nextTopSize),
	                                    hasTopFrame: true,
	                                    topFrameGap: 0,
		                                    doorTopGap: getTopDoorGapForFrameState(spaceInfo, true, target)
	                                  } : {
	                                    hasTopFrame: newVal,
	                                    topFrameGap: getTopOffGapDisplay(target),
		                                    doorTopGap: getTopDoorGapForFrameState(spaceInfo, newVal, target)
	                                  });
                                });
                              }}
	                              onHeightChange={(v) => {
	                                setSpaceInfo({ frameSize: { ...spaceInfo.frameSize, top: v } as any });
	                                group.moduleIds.forEach(id => {
	                                  const target = topSortedMods.find(m => m.id === id);
	                                  updatePlacedModule(id, target ? getTopFrameSizeUpdates(target, v) : { topFrameThickness: v });
	                                });
	                              }}
	                              onOffsetChange={(v) => {
	                                setSpaceInfo({ frameSize: { ...spaceInfo.frameSize, topOffset: v } as any });
	                                group.moduleIds.forEach(id => updatePlacedModule(id, { topFrameOffset: v }));
	                              }}
	                              onGapChange={(v, nextHeight) => {
	                                const nextGap = Math.max(0, v);
	                                if (nextHeight !== undefined) {
	                                  setSpaceInfo({ frameSize: { ...spaceInfo.frameSize, top: nextHeight, topGap: nextGap } as any });
	                                  group.moduleIds.forEach(id => {
	                                    const target = topSortedMods.find(m => m.id === id);
	                                    updatePlacedModule(id, target ? { ...getTopFrameSizeUpdates(target, nextHeight), topFrameGap: nextGap } : { topFrameThickness: nextHeight, topFrameGap: nextGap });
	                                  });
	                                } else {
	                                  setSpaceInfo({ frameSize: { ...spaceInfo.frameSize, topGap: nextGap } as any });
	                                  group.moduleIds.forEach(id => updatePlacedModule(id, { topFrameGap: nextGap }));
	                                }
	                              }}
                              hlKey={hlKey}
                              setHighlightedFrame={setHighlightedFrame}
                            />
                          );
                        }) : topSortedMods.map((mod, idx) => {
                          const modWidthMM = Math.round((mod.isDualSlot ? slotColWidth * 2 : slotColWidth) * 10) / 10;
                          return (
                            <FrameRow key={`top-${mod.id}`}
                              label={`${toAlpha(idx + 1)}(상)`}
                              enabled={mod.hasTopFrame !== false}
                              widthMM={modWidthMM}
                              sizeMM={getTopSizeDisplay(mod)}
                              offset={getTopOffsetDisplay(mod)}
                              gap={getTopGapDisplay(mod)}
                              splitGapFromSize={mod.hasTopFrame !== false}
                              onToggle={() => {
	                                const newVal = !(mod.hasTopFrame !== false);
                                const nextTopSize = newVal ? getTopOffGapDisplay(mod) : undefined;
	                                updatePlacedModule(mod.id, newVal ? {
	                                  ...getTopFrameSizeUpdates(mod, nextTopSize),
	                                  hasTopFrame: true,
	                                  topFrameGap: 0,
		                                  doorTopGap: getTopDoorGapForFrameState(spaceInfo, true, mod)
	                                } : {
	                                  hasTopFrame: false,
	                                  topFrameGap: getTopOffGapDisplay(mod),
		                                  doorTopGap: getTopDoorGapForFrameState(spaceInfo, false, mod)
	                                });
                              }}
                              onSizeChange={(v) => updatePlacedModule(mod.id, getTopFrameSizeUpdates(mod, v))}
                              onOffsetChange={(v) => updatePlacedModule(mod.id, { topFrameOffset: v })}
                              onGapChange={(v, nextSize) => updatePlacedModule(mod.id, {
                                ...(nextSize !== undefined ? getTopFrameSizeUpdates(mod, nextSize) : {}),
                                topFrameGap: Math.max(0, v)
                              })}
                              hlKey={`top-${mod.id}`}
                              setHighlightedFrame={setHighlightedFrame}
                            />
                          );
                        })}
                    </FormControl>
                    {/* 걸래받이 섹션 (stand 타입 제외) */}
                    {spaceInfo.baseConfig?.type !== 'stand' && (
                      <FormControl
                        label="걸래받이"
                        expanded={expandedSections.has('slotFrame')}
                        onToggle={() => toggleSection('slotFrame')}
                        helpText="프레임 병합 모드: 걸래받이 병합 그룹 단위로 프레임을 설정합니다."
                        headerAccessory={
                          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--theme-text-secondary)', cursor: 'pointer' }}>
                            <input type="checkbox" checked={allBaseOnMerge} onChange={toggleAllBaseMerge} style={{ cursor: 'pointer', accentColor: 'var(--theme-primary, #4a90d9)' }} />
                            <span>전체</span>
                          </label>
                        }
                      >
                        {allBaseOnMerge ? baseGroups.map((group, gIdx) => {
                            const groupMods = group.moduleIds.map(id => baseSortedMods.find(m => m.id === id)!).filter(Boolean);
                            const firstMod = groupMods[0];
                            const allEnabled = groupMods.every(m => m.hasBase !== false);
                            const hlKey = `merged-base-${gIdx}`;
                            const isLowerGroup = firstMod?.moduleId?.startsWith('lower-') || firstMod?.moduleId?.includes('-lower-');
                            return (
                              <MergedFrameRow key={hlKey}
	                                label={group.label}
	                                enabled={allEnabled}
	                                widthMM={group.totalWidthMm}
	                                heightMM={isLowerGroup ? getBaseSizeDisplay(firstMod) : globalBase}
	                                offset={isLowerGroup ? getBaseOffsetDefault(firstMod) : globalBaseOffset}
	                                gap={isLowerGroup ? globalLowerBaseGap : globalBaseGap}
                                splitGapFromSize={allEnabled}
                                userBaseHeightDefault={userDefaults.baseHeight}
                                onToggle={() => {
                                  const newVal = !allEnabled;
                                  group.moduleIds.forEach(id => updatePlacedModule(id, {
                                    hasBase: newVal,
                                    doorBottomGap: newVal ? 25 : -5,
                                    ...(newVal ? {} : { individualFloatHeight: 0 }),
                                  }));
                                }}
	                                onHeightChange={(v) => {
	                                  setSpaceInfo(isLowerGroup
	                                    ? { baseboardLowerSize: v }
	                                    : { baseConfig: { ...spaceInfo.baseConfig, height: v } as any }
	                                  );
	                                  group.moduleIds.forEach(id => updatePlacedModule(id, { baseFrameHeight: v }));
	                                }}
		                                onOffsetChange={(v) => {
		                                  setSpaceInfo(isLowerGroup
		                                    ? { baseboardLowerOffset: v }
		                                    : { baseConfig: { ...spaceInfo.baseConfig, offset: v } as any }
		                                  );
		                                  group.moduleIds.forEach(id => updatePlacedModule(id, { baseFrameOffset: v }));
		                                }}
	                                onGapChange={(v) => {
	                                  const nextGap = Math.max(0, v);
	                                  setSpaceInfo(isLowerGroup
                                      ? { baseboardLowerGap: nextGap }
                                      : { baseConfig: { ...spaceInfo.baseConfig, gap: nextGap } as any }
                                    );
	                                  group.moduleIds.forEach(id => updatePlacedModule(id, { baseFrameGap: nextGap } as any));
	                                }}
                                hlKey={hlKey}
                                setHighlightedFrame={setHighlightedFrame}
                                isLowerCategory={!!isLowerGroup}
                              />
                            );
                          }) : baseSortedMods.map((mod, idx) => {
                            const baseEnabled = mod.hasBase !== false;
                            const baseModWidthMM = Math.round((mod.isDualSlot ? slotColWidth * 2 : slotColWidth) * 10) / 10;
                            const isLowerMod = isLowerBaseModule(mod);
                            const bfMin = isLowerMod ? 60 : 40;
                            const bfMax = isLowerMod ? 150 : 100;
                            const bfDefault = isLowerMod ? lowerBaseDefault : (userDefaults.baseHeight ?? 60);
                            return (
                              <FrameRow key={`base-${mod.id}`}
                                label={`${toAlpha(idx + 1)}(하)`}
                                enabled={baseEnabled}
                                widthMM={baseModWidthMM}
                                sizeMM={getBaseSizeDisplay(mod) || bfDefault}
                                offset={getBaseOffsetDisplay(mod)}
                                gap={getBaseGapDisplay(mod)}
                                splitGapFromSize={baseEnabled}
                                onToggle={() => updatePlacedModule(mod.id, {
                                  hasBase: !baseEnabled,
                                  doorBottomGap: !baseEnabled ? 25 : -5,
                                  ...(baseEnabled ? { individualFloatHeight: 0 } : {}),
                                })}
                                onSizeChange={(v) => updatePlacedModule(mod.id, { baseFrameHeight: Math.max(bfMin, Math.min(bfMax, v)) })}
                                onOffsetChange={(v) => updatePlacedModule(mod.id, { baseFrameOffset: v })}
                                onGapChange={(v, nextSize) => updatePlacedModule(mod.id, {
                                  ...(nextSize !== undefined ? { baseFrameHeight: Math.max(bfMin, Math.min(bfMax, nextSize)) } : {}),
                                  baseFrameGap: Math.max(0, v)
                                } as any)}
                                hlKey={`base-${mod.id}`}
                                setHighlightedFrame={setHighlightedFrame}
                              />
                            );
                          })}
                      </FormControl>
                    )}
                  </>
                );
              }

              // 비병합 모드: 상부/하부 섹션 분리
              let topNum = 0;
              let baseNum = 0;
              // 통합 모드: '전체' 체크박스로 제어 (개별 hasTopFrame 값은 유지)
              const allTopOn = topFrameAllMode;
              const allBaseOn = baseFrameAllMode;
	              const toggleAllTop = () => {
	                const next = !topFrameAllMode;
	                setTopFrameAllMode(next);
	                // 통합모드 진입/해제 모두 개별행 ON 상태로 복구
	                topSortedMods.forEach(m => updatePlacedModule(m.id, {
	                  hasTopFrame: true,
	                  topFrameGap: 0,
		                  doorTopGap: getTopDoorGapForFrameState(spaceInfo, true, m)
	                }));
	              };
              const toggleAllBase = () => {
	                const next = !baseFrameAllMode;
	                setBaseFrameAllMode(next);
	                // 통합모드 진입/해제 모두 개별행 ON 상태로 복구
	                baseSortedMods.forEach(m => updatePlacedModule(m.id, {
	                  hasBase: true,
	                  doorBottomGap: 25,
	                }));
	              };
              return (
                <>
                  {/* 상단몰딩 섹션 */}
                  <FormControl
                    label="상단몰딩"
                    expanded={expandedSections.has('slotFrame')}
                    onToggle={() => toggleSection('slotFrame')}
                    helpText="각 가구별 상단 몰딩을 개별 설정합니다. 너비(읽기전용), 높이, 옵셋으로 Z축 위치를 조정합니다."
                    headerAccessory={
                      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--theme-text-secondary)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={allTopOn} onChange={toggleAllTop} style={{ cursor: 'pointer', accentColor: 'var(--theme-primary, #4a90d9)' }} />
                        <span>전체</span>
                      </label>
                    }
                  >
                  {allTopOn && topSortedMods.length > 0 ? (
                    // 전체 ON: 통합 행 1개만 표시 (토글로 일괄 ON/OFF)
                    (() => {
                      const first = topSortedMods[0];
                      const totalWidthMM = topSortedMods.reduce((sum, m) => sum + (m.isDualSlot ? slotColWidth * 2 : slotColWidth), 0);
                      const unifiedEnabled = topSortedMods.every(m => m.hasTopFrame !== false);
                      return (
	                        <FrameRow key="top-all"
	                          label="전체"
	                          enabled={unifiedEnabled}
	                          widthMM={Math.round(totalWidthMM * 10) / 10}
		                          sizeMM={first?.topFrameThickness ?? globalTop}
	                          offset={(spaceInfo.frameSize as any)?.topOffset ?? getTopOffsetDisplay(first)}
	                          gap={globalTopGap}
                          splitGapFromSize={unifiedEnabled}
                          onToggle={() => {
                            const newVal = !unifiedEnabled;
	                            topSortedMods.forEach(m => {
                              const nextTopSize = newVal ? getTopOffGapDisplay(m) : undefined;
                              updatePlacedModule(m.id, newVal ? {
                                ...getTopFrameSizeUpdates(m, nextTopSize),
	                              hasTopFrame: true,
	                              topFrameGap: 0,
		                              doorTopGap: getTopDoorGapForFrameState(spaceInfo, true, m)
	                            } : {
	                              hasTopFrame: false,
	                              topFrameGap: getTopOffGapDisplay(m),
		                              doorTopGap: getTopDoorGapForFrameState(spaceInfo, false, m)
	                            });
                            });
                          }}
	                          onSizeChange={(v) => {
	                            setSpaceInfo({ frameSize: { ...spaceInfo.frameSize, top: v } as any });
	                            topSortedMods.forEach(m => updatePlacedModule(m.id, getTopFrameSizeUpdates(m, v)));
	                          }}
	                          onOffsetChange={(v) => {
	                            setSpaceInfo({ frameSize: { ...spaceInfo.frameSize, topOffset: v } as any });
	                            topSortedMods.forEach(m => updatePlacedModule(m.id, { topFrameOffset: v }));
	                          }}
	                          onGapChange={(v, nextSize) => {
	                            const nextGap = Math.max(0, v);
	                            if (nextSize !== undefined) {
	                              setSpaceInfo({ frameSize: { ...spaceInfo.frameSize, top: nextSize, topGap: nextGap } as any });
	                              topSortedMods.forEach(m => updatePlacedModule(m.id, { ...getTopFrameSizeUpdates(m, nextSize), topFrameGap: nextGap }));
	                            } else {
	                              setSpaceInfo({ frameSize: { ...spaceInfo.frameSize, topGap: nextGap } as any });
	                              topSortedMods.forEach(m => updatePlacedModule(m.id, { topFrameGap: nextGap }));
	                            }
	                          }}
                          hlKey="top-all"
                          setHighlightedFrame={setHighlightedFrame}
                        />
                      );
                    })()
                  ) : (
                    topSortedMods.map((mod) => {
                      topNum++;
                      const modWidthMM = Math.round((mod.isDualSlot ? slotColWidth * 2 : slotColWidth) * 10) / 10;
                      return (
                        <FrameRow key={`top-${mod.id}`}
                          label={`${toAlpha(topNum)}(상)`}
                          enabled={mod.hasTopFrame !== false}
                          widthMM={modWidthMM}
                          sizeMM={getTopSizeDisplay(mod)}
                          offset={getTopOffsetDisplay(mod)}
                          gap={getTopGapDisplay(mod)}
                          splitGapFromSize={mod.hasTopFrame !== false}
                          onToggle={() => {
	                            const newVal = !(mod.hasTopFrame !== false);
                            const nextTopSize = newVal ? getTopOffGapDisplay(mod) : undefined;
	                            updatePlacedModule(mod.id, newVal ? {
	                              ...getTopFrameSizeUpdates(mod, nextTopSize),
	                              hasTopFrame: true,
	                              topFrameGap: 0,
		                              doorTopGap: getTopDoorGapForFrameState(spaceInfo, true, mod)
	                            } : {
	                              hasTopFrame: false,
	                              topFrameGap: getTopOffGapDisplay(mod),
		                              doorTopGap: getTopDoorGapForFrameState(spaceInfo, false, mod)
	                            });
                          }}
                          onSizeChange={(v) => {
                            updatePlacedModule(mod.id, getTopFrameSizeUpdates(mod, v));
                          }}
                          onOffsetChange={(v) => updatePlacedModule(mod.id, { topFrameOffset: v })}
                          onGapChange={(v, nextSize) => updatePlacedModule(mod.id, {
                            ...(nextSize !== undefined ? getTopFrameSizeUpdates(mod, nextSize) : {}),
                            topFrameGap: Math.max(0, v)
                          })}
                          hlKey={`top-${mod.id}`}
                          setHighlightedFrame={setHighlightedFrame}
                        />
                      );
                    })
                  )}
                  </FormControl>
                  {/* 걸래받이 섹션 (stand 타입 제외) */}
                  {spaceInfo.baseConfig?.type !== 'stand' && (
                  <FormControl
                    label="걸래받이"
                    expanded={expandedSections.has('slotFrame')}
                    onToggle={() => toggleSection('slotFrame')}
                    helpText="각 가구별 걸래받이(베이스)을 개별 설정합니다. 너비(읽기전용), 높이, 옵셋으로 Z축 위치를 조정합니다."
                    headerAccessory={
                      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--theme-text-secondary)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={allBaseOn} onChange={toggleAllBase} style={{ cursor: 'pointer', accentColor: 'var(--theme-primary, #4a90d9)' }} />
                        <span>전체</span>
                      </label>
                    }
                  >
	                  {allBaseOn && baseSortedMods.length > 0 ? (
	                    (() => {
	                      const first = baseSortedMods[0];
	                      const totalWidthMM = baseSortedMods.reduce((sum, m) => sum + (m.isDualSlot ? slotColWidth * 2 : slotColWidth), 0);
	                      const unifiedEnabled = baseSortedMods.every(m => m.hasBase !== false);
	                      return (
		                        <FrameRow key="base-all"
		                          label="전체"
		                          enabled={unifiedEnabled}
		                          widthMM={Math.round(totalWidthMM * 10) / 10}
		                          sizeMM={globalBase}
			                          offset={allBaseModsAreLower ? globalLowerBaseOffset : globalBaseOffset}
		                          gap={allBaseModsAreLower ? globalLowerBaseGap : globalBaseGap}
	                          splitGapFromSize={unifiedEnabled}
	                          onToggle={() => {
	                            const newVal = !unifiedEnabled;
	                            baseSortedMods.forEach(m => updatePlacedModule(m.id, {
	                              hasBase: newVal,
	                              doorBottomGap: newVal ? 25 : -5,
	                              ...(newVal ? {} : { individualFloatHeight: 0 }),
	                            }));
	                          }}
		                          onSizeChange={(v) => {
		                            setSpaceInfo(allBaseModsAreLower
		                              ? { baseboardLowerSize: v }
		                              : { baseConfig: { ...spaceInfo.baseConfig, height: v } as any }
		                            );
		                            baseSortedMods.forEach(m => updatePlacedModule(m.id, { baseFrameHeight: v }));
		                          }}
			                          onOffsetChange={(v) => {
			                            setSpaceInfo(allBaseModsAreLower
			                              ? { baseboardLowerOffset: v }
			                              : { baseConfig: { ...spaceInfo.baseConfig, offset: v } as any }
			                            );
			                            baseSortedMods.forEach(m => updatePlacedModule(m.id, { baseFrameOffset: v }));
			                          }}
		                          onGapChange={(v, nextSize) => {
		                            const nextGap = Math.max(0, v);
		                            setSpaceInfo(allBaseModsAreLower
		                              ? {
		                                ...(nextSize !== undefined ? { baseboardLowerSize: nextSize } : {}),
		                                baseboardLowerGap: nextGap
		                              }
		                              : {
		                                baseConfig: {
		                                  ...spaceInfo.baseConfig,
		                                  ...(nextSize !== undefined ? { height: nextSize } : {}),
		                                  gap: nextGap
		                                } as any
		                              }
		                            );
		                            baseSortedMods.forEach(m => updatePlacedModule(m.id, {
		                              ...(nextSize !== undefined ? { baseFrameHeight: nextSize } : {}),
		                              baseFrameGap: nextGap
		                            } as any));
		                          }}
	                          hlKey="base-all"
	                          setHighlightedFrame={setHighlightedFrame}
	                        />
	                      );
	                    })()
	                  ) : baseSortedMods.map((mod) => {
	                    baseNum++;
	                    const baseEnabled = mod.hasBase !== false;
	                    const baseModWidthMM = Math.round((mod.isDualSlot ? slotColWidth * 2 : slotColWidth) * 10) / 10;
                    const isLowerMod = isLowerBaseModule(mod);
                    const bfMin = isLowerMod ? 60 : 40;
                    const bfMax = isLowerMod ? 150 : 100;
                    // 일반 가구 디폴트는 사용자 설정값(baseHeight) 우선, 없으면 60
                    const bfDefault = isLowerMod ? lowerBaseDefault : (userDefaults.baseHeight ?? 60);
                    return (
                      <FrameRow key={`base-${mod.id}`}
                        label={`${toAlpha(baseNum)}(하)`}
                        enabled={baseEnabled}
                        widthMM={baseModWidthMM}
                        sizeMM={getBaseSizeDisplay(mod) || bfDefault}
                        offset={getBaseOffsetDisplay(mod)}
                        gap={getBaseGapDisplay(mod)}
                        splitGapFromSize={baseEnabled}
                        onToggle={() => updatePlacedModule(mod.id, {
                          hasBase: !baseEnabled,
                          doorBottomGap: !baseEnabled ? 25 : -5,
                          ...(baseEnabled ? { individualFloatHeight: 0 } : {}),
                        })}
                        onSizeChange={(v) => updatePlacedModule(mod.id, { baseFrameHeight: Math.max(bfMin, Math.min(bfMax, v)) })}
                        onOffsetChange={(v) => updatePlacedModule(mod.id, { baseFrameOffset: v })}
                        onGapChange={(v, nextSize) => updatePlacedModule(mod.id, {
                          ...(nextSize !== undefined ? { baseFrameHeight: Math.max(bfMin, Math.min(bfMax, nextSize)) } : {}),
                          baseFrameGap: Math.max(0, v)
                        } as any)}
                        hlKey={`base-${mod.id}`}
                        setHighlightedFrame={setHighlightedFrame}
                      />
                    );
	                  })}
                  </FormControl>
                  )}
                </>
              );
            })()}

            {/* 자유배치 도어 셋업 방식 (도어가 달린 가구가 있을 때만) */}
            {spaceInfo.layoutMode === 'free-placement' && placedModules.some(m => m.isFreePlacement && m.hasDoor) && (
              <FormControl
                label="도어 셋업"
                expanded={expandedSections.has('doorSetup')}
                onToggle={() => toggleSection('doorSetup')}
                helpText="자유배치 모드에서 도어 설치 방식을 설정합니다. 기본: 각 가구에 맞춤. 프레임 커버: 모든 도어 높이를 통일합니다."
              >
                <div className={doorStyles.doorTabSelector}>
                  <button
                    className={`${doorStyles.doorTab} ${(spaceInfo.doorSetupMode || 'default') === 'default' ? doorStyles.activeDoorTab : ''}`}
                    onClick={() => setSpaceInfo({ doorSetupMode: 'default' })}
                  >
                    기본
                    <span className={doorStyles.doorTabSubtitle}>가구에 맞춤</span>
                  </button>
                  <button
                    className={`${doorStyles.doorTab} ${spaceInfo.doorSetupMode === 'frame-cover' ? doorStyles.activeDoorTab : ''}`}
                    onClick={() => setSpaceInfo({ doorSetupMode: 'frame-cover' })}
                  >
                    프레임 커버
                    <span className={doorStyles.doorTabSubtitle}>도어 높이 통일</span>
                  </button>
                </div>
                <p style={{ fontSize: '11px', color: 'var(--theme-text-secondary)', margin: '4px 0 0 0' }}>
                  {(spaceInfo.doorSetupMode || 'default') === 'default'
                    ? '각 가구 높이에 맞게 도어가 개별 적용됩니다.'
                    : '상단 몰딩을 가리도록 모든 도어 높이가 통일됩니다.'}
                </p>
              </FormControl>
            )}

            {/* 가구재 두께 설정 (15 / 15.5 / 18 / 18.5 mm) */}
            {(
            <FormControl
              label="가구재 두께"
              expanded={expandedSections.has('panelThickness')}
              onToggle={() => toggleSection('panelThickness')}
            >
              <div className={doorStyles.doorTabSelector}>
                {[15, 15.5, 18, 18.5].map((thickness) => (
                  <button
                    key={thickness}
                    className={`${doorStyles.doorTab} ${(spaceInfo.panelThickness ?? 18) === thickness ? doorStyles.activeDoorTab : ''}`}
                    onClick={() => {
                      setSpaceInfo({ panelThickness: thickness });
                      // 백패널/서랍 바닥재는 가구재 18.5T와 무관하게 3/4.5/6/9T 기준을 유지한다.
                      const bpMap: Record<number, number> = { 3.5: 3, 5: 6, 5.5: 6, 9.5: 9 };
                      const allMods = placedModules.filter(m => !m.isSurroundPanel);
                      allMods.forEach(m => {
                        const cur = m.backPanelThickness ?? 9;
                        const mapped = bpMap[cur] ?? cur;
                        if (cur !== mapped) updatePlacedModule(m.id, { backPanelThickness: mapped });
                      });
                    }}
                  >
                    {thickness}mm
                  </button>
                ))}
              </div>
            </FormControl>
            )}

            {/* 백패널 두께 설정 — 모든 가구에 일괄 적용 */}
            {(() => {
              const mods = placedModules.filter(m => !m.isSurroundPanel);
              if (mods.length === 0) return null;
              const rawCurrentThickness = mods[0]?.backPanelThickness ?? 9;
              const currentThickness = rawCurrentThickness === 9.5
                ? 9
                : rawCurrentThickness === 5 || rawCurrentThickness === 5.5
                  ? 6
                  : rawCurrentThickness === 3.5
                    ? 3
                    : rawCurrentThickness;
              return (
                <FormControl
                  label="백패널 두께"
                  expanded={expandedSections.has('backPanel')}
                  onToggle={() => toggleSection('backPanel')}
                >
                  <div className={doorStyles.doorTabSelector}>
                    {[3, 4.5, 6, 9].map((thickness) => (
                      <button
                        key={thickness}
                        className={`${doorStyles.doorTab} ${currentThickness === thickness ? doorStyles.activeDoorTab : ''}`}
                        onClick={() => {
                          mods.forEach(m => updatePlacedModule(m.id, { backPanelThickness: thickness }));
                        }}
                      >
                        {thickness}mm
                      </button>
                    ))}
                  </div>
                </FormControl>
              );
            })()}

          </div>
        )}

        {activeTab === 'module' && (
          <div className={styles.moduleSettings}>
            {/* 단내림 구간이 활성화된 경우 도어 개수 표시 (균등분할 모드에서만) */}
            {spaceInfo.droppedCeiling?.enabled && isEqualDivision && (
              <div className={styles.formContainer}>
                <FormControl
                  label={t('space.droppedColumnCount')}
                  expanded={expandedSections.has('droppedLayout')}
                  onToggle={() => toggleSection('droppedLayout')}
                  helpText="단내림 구간의 칸 수를 설정합니다. 단내림 영역에 배치할 가구 슬롯 수를 지정합니다."
                >
                  <DoorSlider
                    value={spaceInfo.droppedCeilingDoorCount || 1}
                    onChange={(newValue) => {
// console.log('🎯 단내림 구간 도어 개수 변경:', newValue);

                      // 슬롯 개수에 맞춰 단내림 너비 자동 계산 (슬롯 1개 = 450mm)
                      const newWidth = newValue * 450;

                      const updates: any = {
                        droppedCeilingDoorCount: newValue,
                        droppedCeiling: {
                          ...spaceInfo.droppedCeiling,
                          width: newWidth
                        }
                      };
                      setSpaceInfo(updates);
                    }}
                    width={spaceInfo.droppedCeiling?.width || DEFAULT_DROPPED_CEILING_VALUES.WIDTH}
                  />
                  
                  <div className={styles.zoneInfoInline} style={{ marginTop: '8px' }}>
                    <span className={styles.zoneInlineText}>
                      {spaceInfo.droppedCeiling.width} × {height - spaceInfo.droppedCeiling.dropHeight} mm
                      {(() => {
                        const droppedInternalWidth = SpaceCalculator.calculateDroppedZoneInternalWidth(spaceInfo);
                        const doorCount = spaceInfo.droppedCeilingDoorCount || 1;
                        const slotWidth = droppedInternalWidth ? Math.round((droppedInternalWidth / doorCount) * 10) / 10 : 0;
                        return ` · 슬롯 ${slotWidth}mm`;
                      })()}
                    </span>
                  </div>
                </FormControl>
                
                {/* 일반 구간 정보 추가 */}
                <FormControl
                  label={t('space.normalColumnCount')}
                  expanded={expandedSections.has('normalLayout')}
                  onToggle={() => toggleSection('normalLayout')}
                  helpText="일반 구간(단내림 없는 영역)의 칸 수를 설정합니다."
                  style={{ marginTop: '16px' }}
                >
                  <DoorSlider
                    value={spaceInfo.mainDoorCount || spaceInfo.customColumnCount || 3}
                    onChange={(newValue) => {
// console.log('🎯 일반 구간 도어 개수 변경:', newValue);
                      const updates: any = {
                        mainDoorCount: newValue
                      };
                      setSpaceInfo(updates);
                    }}
                    width={spaceInfo.width - (spaceInfo.droppedCeiling?.width || 0)}
                  />
                  
                  <div className={styles.zoneInfoInline} style={{ marginTop: '8px' }}>
                    <span className={styles.zoneInlineText}>
                      {spaceInfo.width - (spaceInfo.droppedCeiling?.width || 0)} × {height} mm
                      {(() => {
                        const normalInternalWidth = SpaceCalculator.calculateNormalZoneInternalWidth(spaceInfo);
                        const doorCount = spaceInfo.mainDoorCount || spaceInfo.customColumnCount || 3;
                        const slotWidth = normalInternalWidth ? Math.round((normalInternalWidth / doorCount) * 10) / 10 : 0;
                        return ` · 슬롯 ${slotWidth}mm`;
                      })()}
                    </span>
                  </div>
                </FormControl>
              </div>
            )}
            <ModuleContent />
          </div>
        )}
      </div>

      {/* 완료 버튼 */}
      <div className={styles.panelFooter}>
        <button className={styles.completeButton}>
          {t('common.finish')}
        </button>
      </div>
    </div>
  );
};

export { DoorSlider as DoorCountSlider };
export default RightPanel; 
