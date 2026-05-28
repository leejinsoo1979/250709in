import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, X } from 'lucide-react';
import styles from './DeleteConfirmModal.module.css';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDangerous?: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = '확인',
  cancelText = '취소',
  isDangerous = false,
  isLoading = false,
  onConfirm,
  onCancel,
}) => {
  const displayTitle = title || (isDangerous ? '영구 삭제' : '파일 삭제');

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isLoading) onCancel();
      if (event.key === 'Enter' && !isLoading) onConfirm();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onCancel, onConfirm]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div className={styles.overlay} onClick={isLoading ? undefined : onCancel}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className={styles.closeButton}
          onClick={onCancel}
          disabled={isLoading}
          aria-label="닫기"
        >
          <X size={18} />
        </button>

        <div
          className={`${styles.iconWrap} ${isDangerous ? styles.dangerIcon : ''}`}
          aria-hidden="true"
        >
          <Trash2 size={24} />
        </div>

        <h2 id="delete-confirm-title" className={styles.title}>
          {displayTitle}
        </h2>
        <p className={styles.message}>{message}</p>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={`${styles.confirmButton} ${isDangerous ? styles.dangerButton : ''}`}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? '처리 중...' : confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default DeleteConfirmModal;
