import React from 'react';
import ThemeSelector from './ThemeSelector';
import styles from './SettingsModal.module.css';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <>
      <div className={styles.overlay} onClick={onClose} />
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>설정</h2>
          <button className={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </div>
        
        <div className={styles.content}>
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>테마 설정</h3>
            <div className={styles.themeContainer}>
              <ThemeSelector variant="sidebar" showLabel={false} />
            </div>
          </div>
          
          {/* 추후 다른 설정들 추가 가능 */}
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>일반 설정</h3>
            <div className={styles.settingItem}>
              <span>알림</span>
              <input type="checkbox" defaultChecked />
            </div>
            <div className={styles.settingItem}>
              <span>자동 저장</span>
              <input type="checkbox" defaultChecked />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default SettingsModal;