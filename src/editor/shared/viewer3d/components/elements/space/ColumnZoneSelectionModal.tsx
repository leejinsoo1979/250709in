import React from 'react';
import styles from './ColumnZoneSelectionModal.module.css';

interface ColumnZoneSelectionModalProps {
  isOpen: boolean;
  onSelect: (zone: 'normal' | 'dropped') => void;
  onCancel: () => void;
}

const ColumnZoneSelectionModal: React.FC<ColumnZoneSelectionModalProps> = ({
  isOpen,
  onSelect,
  onCancel
}) => {
  if (!isOpen) return null;

  return (
    <>
      <div className={styles.overlay} onClick={onCancel} />
      <div className={styles.modal}>
        <div className={styles.header}>
          <h3 className={styles.title}>기둥 배치 구간 선택</h3>
        </div>
        <div className={styles.content}>
          <p className={styles.message}>
            기둥을 배치할 구간을 선택해주세요
          </p>
          <div className={styles.buttons}>
            <button 
              className={`${styles.button} ${styles.normalButton}`}
              onClick={() => onSelect('normal')}
            >
              <div className={styles.buttonIcon}>📐</div>
              <div className={styles.buttonText}>
                <div className={styles.buttonTitle}>일반 구간</div>
                <div className={styles.buttonDesc}>표준 높이 구간</div>
              </div>
            </button>
            <button 
              className={`${styles.button} ${styles.droppedButton}`}
              onClick={() => onSelect('dropped')}
            >
              <div className={styles.buttonIcon}>📉</div>
              <div className={styles.buttonText}>
                <div className={styles.buttonTitle}>단내림 구간</div>
                <div className={styles.buttonDesc}>낮은 높이 구간</div>
              </div>
            </button>
          </div>
        </div>
        <div className={styles.footer}>
          <button className={styles.cancelButton} onClick={onCancel}>
            취소
          </button>
        </div>
      </div>
    </>
  );
};

export default ColumnZoneSelectionModal;