import React from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '@/i18n/useTranslation';
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
  const { t } = useTranslation();
  
  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>{t('common.confirm')}</h3>
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
            {t('cnc.exitConfirmMessage')}
          </p>
          <p className={styles.subMessage}>
            {t('cnc.unsavedChangesWarning')}
          </p>
        </div>
        
        <div className={styles.footer}>
          <button 
            className={styles.cancelButton}
            onClick={onCancel}
          >
            {t('common.cancel')}
          </button>
          <button 
            className={styles.confirmButton}
            onClick={onConfirm}
          >
            {t('cnc.exit')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExitConfirmModal;