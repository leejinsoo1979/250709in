import React from 'react';
import { FrameConfig } from '@/store/core/spaceConfigStore';
import styles from '../../styles/common.module.css';
import { useTranslation } from '@/i18n/useTranslation';

interface SurroundTypeSelectorProps {
  frameConfig: FrameConfig;
  onFrameConfigChange: (config: FrameConfig) => void;
  disabled?: boolean;
}

const SurroundTypeSelector: React.FC<SurroundTypeSelectorProps> = ({
  frameConfig,
  onFrameConfigChange,
  disabled = false
}) => {
  const { t } = useTranslation();

  const toggleFrame = (key: keyof FrameConfig) => {
    if (disabled) return;
    onFrameConfigChange({
      ...frameConfig,
      [key]: !frameConfig[key],
    });
  };

  return (
    <div className={styles.section}>
      <div className={styles.toggleButtonGroup}>
        <button
          className={`${styles.toggleButton} ${frameConfig.left ? styles.toggleButtonActive : ''}`}
          onClick={() => toggleFrame('left')}
          disabled={disabled}
        >
          {t('space.frameLeft') || '좌'}
        </button>
        <button
          className={`${styles.toggleButton} ${frameConfig.right ? styles.toggleButtonActive : ''}`}
          onClick={() => toggleFrame('right')}
          disabled={disabled}
        >
          {t('space.frameRight') || '우'}
        </button>
        <button
          className={`${styles.toggleButton} ${frameConfig.top ? styles.toggleButtonActive : ''}`}
          onClick={() => toggleFrame('top')}
          disabled={disabled}
        >
          {t('space.frameTop') || '상'}
        </button>
        <button
          className={`${styles.toggleButton} ${frameConfig.bottom ? styles.toggleButtonActive : ''}`}
          onClick={() => toggleFrame('bottom')}
          disabled={disabled}
        >
          {t('space.frameBottom') || '하'}
        </button>
      </div>
    </div>
  );
};

export default SurroundTypeSelector;
