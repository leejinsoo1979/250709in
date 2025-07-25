import React from 'react';
import styles from './ConvertModal.module.css';
import ExportPanel from './controls/ExportPanel';

interface ConvertModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ConvertModal: React.FC<ConvertModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>컨버팅</h2>
          <button className={styles.closeButton} onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <div className={styles.content}>
          <ExportPanel />
        </div>
      </div>
    </div>
  );
};

export default ConvertModal;