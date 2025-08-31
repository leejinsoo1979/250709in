import React from 'react';
import styles from './ColumnZoneCrossPopup.module.css';

interface ColumnZoneCrossPopupProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  fromZone: 'normal' | 'dropped';
  toZone: 'normal' | 'dropped';
  boundaryPosition: 'left' | 'right';
}

const ColumnZoneCrossPopup: React.FC<ColumnZoneCrossPopupProps> = ({
  isOpen,
  onConfirm,
  onCancel,
  fromZone,
  toZone,
  boundaryPosition
}) => {
  if (!isOpen) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.popup}>
        <div className={styles.header}>
          <h3>기둥 이동 확인</h3>
        </div>
        <div className={styles.content}>
          <p>
            기둥이 {fromZone === 'normal' ? '일반 구간' : '단내림 구간'}에서{' '}
            {toZone === 'normal' ? '일반 구간' : '단내림 구간'}으로 이동하려고 합니다.
          </p>
          <p>
            기둥을 {toZone === 'dropped' ? '단내림' : '일반'} 구간의{' '}
            {boundaryPosition === 'left' ? '왼쪽' : '오른쪽'} 경계에 배치하시겠습니까?
          </p>
        </div>
        <div className={styles.actions}>
          <button 
            className={styles.cancelButton}
            onClick={onCancel}
          >
            취소
          </button>
          <button 
            className={styles.confirmButton}
            onClick={onConfirm}
          >
            이동
          </button>
        </div>
      </div>
    </div>
  );
};

export default ColumnZoneCrossPopup;