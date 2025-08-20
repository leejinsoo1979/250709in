import React from 'react';
import styles from './HelpModal.module.css';
import { useTranslation } from '@/i18n/useTranslation';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  
  if (!isOpen) return null;

  const shortcuts = [
    { key: t('help.shortcuts.mouseDrag'), action: t('help.shortcuts.cameraRotate') },
    { key: t('help.shortcuts.mouseWheel'), action: t('help.shortcuts.zoomInOut') },
    { key: 'Delete', action: t('help.shortcuts.deleteSelected') },
    { key: 'Backspace', action: t('help.shortcuts.deleteSelected') },
    { key: 'Esc', action: t('help.shortcuts.exitEditMode') },
    { key: t('help.shortcuts.arrowKeys'), action: t('help.shortcuts.fineTuneMove') },
    { key: t('help.shortcuts.doubleClick'), action: t('help.shortcuts.editMode') },
    { key: t('help.shortcuts.dragDrop'), action: t('help.shortcuts.placeFurniture') },
  ];

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h3 className={styles.title}>{t('help.title')}</h3>
          <button className={styles.closeButton} onClick={onClose}>
            ✕
          </button>
        </div>
        
        <div className={styles.content}>
          <div className={styles.shortcuts}>
            {shortcuts.map((shortcut, index) => (
              <div key={index} className={styles.shortcutItem}>
                <span className={styles.key}>{shortcut.key}</span>
                <span className={styles.action}>{shortcut.action}</span>
              </div>
            ))}
          </div>
          
          <div className={styles.tips}>
            <h4>{t('help.tips.title')}</h4>
            <ul>
              <li>{t('help.tips.autoPlace')}</li>
              <li>{t('help.tips.editPopup')}</li>
              <li>{t('help.tips.editColumn')}</li>
              <li>{t('help.tips.doorInstall')}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HelpModal; 