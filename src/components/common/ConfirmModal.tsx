import React from 'react';
import styles from './AlertModal.module.css';

interface ConfirmModalProps {
  isOpen: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  confirmText?: string;
  cancelText?: string;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({ 
  isOpen, 
  message, 
  onConfirm, 
  onCancel, 
  title = '확인',
  confirmText = '확인',
  cancelText = '취소'
}) => {
  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>{title}</h3>
        </div>
        <div className={styles.content}>
          <p className={styles.message}>{message}</p>
        </div>
        <div className={styles.footer}>
          <button className={styles.cancelButton} onClick={onCancel}>
            {cancelText}
          </button>
          <button className={styles.confirmButton} onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;