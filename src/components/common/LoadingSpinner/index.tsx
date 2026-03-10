import React from 'react';
import styles from './style.module.css';
import { useTranslation } from '@/i18n/useTranslation';
import { useTheme } from '@/contexts/ThemeContext';
import Logo from '@/components/common/Logo';

interface LoadingSpinnerProps {
  message?: string;
  size?: 'small' | 'medium' | 'large';
  type?: 'spinner' | 'dots';
  fullscreen?: boolean;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  message,
  size = 'medium',
  type = 'spinner',
  fullscreen = false
}) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const displayMessage = message || t('common.loading');

  // 풀스크린: 로고 애니메이션 중앙 표시
  if (fullscreen) {
    return (
      <div className={`${styles.container} ${styles.fullscreen} ${styles.brandBg}`} data-theme-color={theme.color}>
        <div className={styles.brandCenter}>
          <Logo size="large" loading />
          {displayMessage && (
            <p className={styles.brandMessage}>{displayMessage}</p>
          )}
        </div>
      </div>
    );
  }

  const containerClass = styles.container;

  return (
    <div className={containerClass} data-theme-color={theme.color}>
      {type === 'spinner' ? (
        <div className={`${styles.spinner} ${styles[size]}`}>
          <div className={styles.spinnerRing}></div>
        </div>
      ) : (
        <div className={styles.dots}>
          <div className={styles.dot}></div>
          <div className={styles.dot}></div>
          <div className={styles.dot}></div>
        </div>
      )}
      {displayMessage && (
        <p className={styles.message}>{displayMessage}</p>
      )}
    </div>
  );
};

export default LoadingSpinner;
