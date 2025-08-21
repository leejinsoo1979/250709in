import React from 'react';
import styles from './style.module.css';
import { useTranslation } from '@/i18n/useTranslation';
import { useTheme } from '@/contexts/ThemeContext';

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
  
  const containerClass = fullscreen 
    ? `${styles.container} ${styles.fullscreen} ${styles.gradientBg}` 
    : styles.container;
  
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