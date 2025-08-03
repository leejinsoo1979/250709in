import React from 'react';
import { BaseConfig } from '@/store/core/spaceConfigStore';
import styles from '../../styles/common.module.css';

interface BaseTypeSelectorProps {
  baseConfig?: BaseConfig;
  onBaseTypeChange: (type: 'floor' | 'stand') => void;
  disabled?: boolean;
}

const BaseTypeSelector: React.FC<BaseTypeSelectorProps> = ({
  baseConfig,
  onBaseTypeChange,
  disabled = false
}) => {
  const isFloor = baseConfig?.type === 'floor' || !baseConfig;
  const isStand = baseConfig?.type === 'stand';
  

  return (
    <div className={styles.section}>
      <div className={styles.toggleButtonGroup}>
        <button
          className={`${styles.toggleButton} ${isFloor ? styles.toggleButtonActive : ''}`}
          onClick={() => onBaseTypeChange('floor')}
          disabled={disabled}
        >
          있음
        </button>
        <button
          className={`${styles.toggleButton} ${isStand ? styles.toggleButtonActive : ''}`}
          onClick={() => onBaseTypeChange('stand')}
          disabled={disabled}
        >
          없음
        </button>
      </div>
    </div>
  );
};

export default BaseTypeSelector; 