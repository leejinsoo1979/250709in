import React from 'react';
import { SurroundType, FrameConfig } from '@/store/core/spaceConfigStore';
import styles from '../../styles/common.module.css';

interface SurroundTypeSelectorProps {
  surroundType: SurroundType;
  onSurroundTypeChange: (type: SurroundType) => void;
  frameConfig?: FrameConfig;
  onFrameConfigChange?: (key: 'top' | 'bottom', value: boolean) => void;
  disabled?: boolean;
}

const SurroundTypeSelector: React.FC<SurroundTypeSelectorProps> = ({
  surroundType,
  onSurroundTypeChange,
  frameConfig,
  onFrameConfigChange,
  disabled = false
}) => {
  const isSurround = surroundType === 'surround';
  const isNoSurround = surroundType === 'no-surround';

  return (
    <div className={styles.section}>
      {/* 서라운드/노서라운드 선택 */}
      <div className={styles.toggleButtonGroup}>
        <button
          className={`${styles.toggleButton} ${isSurround ? styles.toggleButtonActive : ''}`}
          onClick={() => !disabled && onSurroundTypeChange('surround')}
          disabled={disabled}
        >
          서라운드(일반)
        </button>
        <button
          className={`${styles.toggleButton} ${isNoSurround ? styles.toggleButtonActive : ''}`}
          onClick={() => !disabled && onSurroundTypeChange('no-surround')}
          disabled={disabled}
        >
          노서라운드(타이트)
        </button>
      </div>

      {/* 상/하 프레임 체크박스 - 서라운드일 때만 표시 */}
      {isSurround && frameConfig && onFrameConfigChange && (
        <div className={styles.toggleButtonGroup} style={{ marginTop: '6px' }}>
          <button
            className={`${styles.toggleButton} ${frameConfig.top ? styles.toggleButtonActive : ''}`}
            onClick={() => !disabled && onFrameConfigChange('top', !frameConfig.top)}
            disabled={disabled}
          >
            상
          </button>
          <button
            className={`${styles.toggleButton} ${frameConfig.bottom ? styles.toggleButtonActive : ''}`}
            onClick={() => !disabled && onFrameConfigChange('bottom', !frameConfig.bottom)}
            disabled={disabled}
          >
            하
          </button>
        </div>
      )}
    </div>
  );
};

export default SurroundTypeSelector;
