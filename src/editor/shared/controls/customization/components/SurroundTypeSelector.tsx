import React from 'react';
import { SurroundType, FrameConfig } from '@/store/core/spaceConfigStore';
import styles from '../../styles/common.module.css';

type SurroundMode = 'full-surround' | 'sides-only' | 'no-surround';

interface SurroundTypeSelectorProps {
  surroundType: SurroundType;
  onSurroundTypeChange: (type: SurroundType) => void;
  frameConfig?: FrameConfig;
  onFrameConfigChange?: (key: 'top' | 'bottom', value: boolean) => void;
  disabled?: boolean;
}

/** 현재 상태에서 서라운드 모드 판별 */
function getSurroundMode(surroundType: SurroundType, frameConfig?: FrameConfig): SurroundMode {
  if (surroundType === 'no-surround') return 'no-surround';
  // surround인데 top/bottom 모두 false → 양쪽서라운드
  if (frameConfig && !frameConfig.top && !frameConfig.bottom) return 'sides-only';
  return 'full-surround';
}

const SurroundTypeSelector: React.FC<SurroundTypeSelectorProps> = ({
  surroundType,
  onSurroundTypeChange,
  frameConfig,
  onFrameConfigChange,
  disabled = false
}) => {
  const currentMode = getSurroundMode(surroundType, frameConfig);

  const handleModeChange = (mode: SurroundMode) => {
    if (disabled) return;

    if (mode === 'full-surround') {
      // 전체서라운드: surround + top/bottom 활성화
      onSurroundTypeChange('surround');
      if (onFrameConfigChange) {
        onFrameConfigChange('top', true);
        onFrameConfigChange('bottom', true);
      }
    } else if (mode === 'sides-only') {
      // 양쪽서라운드: surround + top/bottom 비활성화
      onSurroundTypeChange('surround');
      if (onFrameConfigChange) {
        onFrameConfigChange('top', false);
        onFrameConfigChange('bottom', false);
      }
    } else {
      // 노서라운드
      onSurroundTypeChange('no-surround');
    }
  };

  return (
    <div className={styles.section}>
      <div className={styles.toggleButtonGroup}>
        <button
          className={`${styles.toggleButton} ${currentMode === 'full-surround' ? styles.toggleButtonActive : ''}`}
          onClick={() => handleModeChange('full-surround')}
          disabled={disabled}
        >
          전체서라운드
        </button>
        <button
          className={`${styles.toggleButton} ${currentMode === 'sides-only' ? styles.toggleButtonActive : ''}`}
          onClick={() => handleModeChange('sides-only')}
          disabled={disabled}
        >
          양쪽서라운드
        </button>
        <button
          className={`${styles.toggleButton} ${currentMode === 'no-surround' ? styles.toggleButtonActive : ''}`}
          onClick={() => handleModeChange('no-surround')}
          disabled={disabled}
        >
          노서라운드
        </button>
      </div>
    </div>
  );
};

export default SurroundTypeSelector;
