import React from 'react';
import styles from './style.module.css';

interface LoadingSpinnerProps {
  message?: string;
  size?: 'small' | 'medium' | 'large';
  type?: 'spinner' | 'dots';
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  message = '로딩 중...', 
  size = 'medium',
  type = 'spinner'
}) => {
  return (
    <div className={styles.container}>
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
      {message && (
        <p className={styles.message}>{message}</p>
      )}
    </div>
  );
};

export default LoadingSpinner; 