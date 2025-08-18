import React from 'react';
import { X } from 'lucide-react';
import styles from './ExitConfirmModal.module.css';

interface ExitConfirmModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ExitConfirmModal: React.FC<ExitConfirmModalProps> = ({ 
  isOpen, 
  onConfirm, 
  onCancel 
}) => {
  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>확인</h3>
          <button className={styles.closeButton} onClick={onCancel}>
            <X size={20} />
          </button>
        </div>
        
        <div className={styles.content}>
          <div className={styles.icon}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <p className={styles.message}>
            CNC 옵티마이저를 종료하시겠습니까?
          </p>
          <p className={styles.subMessage}>
            저장되지 않은 변경사항이 있을 수 있습니다.
          </p>
        </div>
        
        <div className={styles.footer}>
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
            나가기
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExitConfirmModal;