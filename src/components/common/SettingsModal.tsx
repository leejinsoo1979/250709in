import React, { useState, useEffect } from 'react';
import ThemeSelector from './ThemeSelector';
import styles from './SettingsModal.module.css';
import { useTranslation } from '@/i18n/useTranslation';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { t, currentLanguage, changeLanguage, availableLanguages } = useTranslation();
  const [selectedLanguage, setSelectedLanguage] = useState('ko');
  
  useEffect(() => {
    // 저장된 언어 설정 불러오기
    const savedLanguage = localStorage.getItem('app-language') || 'ko';
    setSelectedLanguage(savedLanguage);
  }, []);
  
  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLanguage = e.target.value;
    setSelectedLanguage(newLanguage);
    changeLanguage(newLanguage);
    // 강제 페이지 새로고침
    setTimeout(() => {
      window.location.reload();
    }, 100);
  };
  
  if (!isOpen) return null;

  return (
    <>
      <div className={styles.overlay} onClick={onClose} />
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>{t('settings.title')}</h2>
          <button className={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </div>
        
        <div className={styles.content}>
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('settings.theme')}</h3>
            <div className={styles.themeContainer}>
              <ThemeSelector variant="sidebar" showLabel={false} />
            </div>
          </div>
          
          {/* 추후 다른 설정들 추가 가능 */}
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('settings.general')}</h3>
            <div className={styles.settingItem}>
              <span>{t('settings.language')}</span>
              <select 
                value={currentLanguage} 
                onChange={handleLanguageChange}
                className={styles.languageSelect}
              >
                {availableLanguages.map(lang => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.settingItem}>
              <span>{t('settings.notifications')}</span>
              <input type="checkbox" defaultChecked />
            </div>
            <div className={styles.settingItem}>
              <span>{t('settings.autoSave')}</span>
              <input type="checkbox" defaultChecked />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default SettingsModal;