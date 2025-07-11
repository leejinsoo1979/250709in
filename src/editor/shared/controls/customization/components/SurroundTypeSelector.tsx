import React from 'react';
import { SurroundType } from '@/store/core/spaceConfigStore';
import styles from '../../styles/common.module.css';

interface SurroundTypeSelectorProps {
  surroundType: SurroundType;
  onSurroundTypeChange: (type: SurroundType) => void;
  disabled?: boolean;
}

const SurroundTypeSelector: React.FC<SurroundTypeSelectorProps> = ({
  surroundType,
  onSurroundTypeChange,
  disabled = false
}) => {
  const isSurround = surroundType === 'surround';
  const isNoSurround = surroundType === 'no-surround';

  return (
    <div className={styles.section}>
      <div className={styles.toggleButtonGroup}>
        <button
          className={`${styles.toggleButton} ${isNoSurround ? styles.toggleButtonActive : ''}`}
          onClick={() => !disabled && onSurroundTypeChange('no-surround')}
          disabled={disabled}
        >
          있음
        </button>
        <button
          className={`${styles.toggleButton} ${isSurround ? styles.toggleButtonActive : ''}`}
          onClick={() => !disabled && onSurroundTypeChange('surround')}
          disabled={disabled}
        >
          없음
        </button>
      </div>
    </div>
  );
};

export default SurroundTypeSelector; 