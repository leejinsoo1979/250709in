import React from 'react';
import { SurroundType, FrameConfig } from '@/store/core/spaceConfigStore';
import styles from '../../styles/common.module.css';

export type SurroundMode = 'full-surround' | 'sides-only' | 'no-surround';

interface SurroundTypeSelectorProps {
  surroundType: SurroundType;
  frameConfig?: FrameConfig;
  onModeChange: (mode: SurroundMode) => void;
  disabled?: boolean;
}

/** 현재 상태에서 서라운드 모드 판별 */
export function getSurroundMode(surroundType: SurroundType, frameConfig?: FrameConfig): SurroundMode {
  if (surroundType === 'no-surround') return 'no-surround';
  if (frameConfig && !frameConfig.top && !frameConfig.bottom) return 'sides-only';
  return 'full-surround';
}

const SurroundTypeSelector: React.FC<SurroundTypeSelectorProps> = ({
  surroundType,
  frameConfig,
  onModeChange,
  disabled = false
}) => {
  const currentMode = getSurroundMode(surroundType, frameConfig);

  return (
    <div className={styles.section}>
      <div className={styles.toggleButtonGroup}>
        <button
          className={`${styles.toggleButton} ${currentMode === 'full-surround' ? styles.toggleButtonActive : ''}`}
          onClick={() => !disabled && onModeChange('full-surround')}
          disabled={disabled}
        >
          전체서라운드
        </button>
        <button
          className={`${styles.toggleButton} ${currentMode === 'sides-only' ? styles.toggleButtonActive : ''}`}
          onClick={() => !disabled && onModeChange('sides-only')}
          disabled={disabled}
        >
          양쪽서라운드
        </button>
        <button
          className={`${styles.toggleButton} ${currentMode === 'no-surround' ? styles.toggleButtonActive : ''}`}
          onClick={() => !disabled && onModeChange('no-surround')}
          disabled={disabled}
        >
          노서라운드
        </button>
      </div>
    </div>
  );
};

export default SurroundTypeSelector;
