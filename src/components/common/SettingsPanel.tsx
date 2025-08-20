import React, { useEffect } from 'react';
import ThemeSelector from './ThemeSelector';
import { useTranslation } from '@/i18n/useTranslation';
import styles from './SettingsPanel.module.css';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen, onClose }) => {
  const { t, currentLanguage, changeLanguage, availableLanguages } = useTranslation();
  
  useEffect(() => {
    // 언어 변경 시 컴포넌트 리렌더링을 위한 이벤트 리스너
    const handleLanguageChange = () => {
      // 컴포넌트가 자동으로 리렌더링됨
    };
    
    window.addEventListener('languageChange', handleLanguageChange);
    return () => {
      window.removeEventListener('languageChange', handleLanguageChange);
    };
  }, []);
  
  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLanguage = e.target.value;
    console.log('🔄 Changing language from', currentLanguage, 'to', newLanguage);
    changeLanguage(newLanguage);
    // 강제 페이지 새로고침
    setTimeout(() => {
      window.location.reload();
    }, 100);
  };
  
  if (!isOpen) return null;

  return (
    <>
      {/* 백그라운드 오버레이 */}
      <div className={styles.overlay} onClick={onClose} />
      
      {/* 설정 패널 */}
      <div className={styles.panel}>
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
          
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('settings.general')}</h3>
            <div className={styles.settingGroup}>
              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <span className={styles.settingLabel}>{t('settings.language')}</span>
                  <span className={styles.settingDescription}>{t('settings.languageDesc')}</span>
                </div>
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
                <div className={styles.settingInfo}>
                  <span className={styles.settingLabel}>{t('settings.notifications')}</span>
                  <span className={styles.settingDescription}>{t('settings.notificationsDesc')}</span>
                </div>
                <label className={styles.switch}>
                  <input type="checkbox" defaultChecked />
                  <span className={styles.slider}></span>
                </label>
              </div>
              
              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <span className={styles.settingLabel}>{t('settings.autoSave')}</span>
                  <span className={styles.settingDescription}>{t('settings.autoSaveDesc')}</span>
                </div>
                <label className={styles.switch}>
                  <input type="checkbox" defaultChecked />
                  <span className={styles.slider}></span>
                </label>
              </div>
              
              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <span className={styles.settingLabel}>{t('settings.gridSnap')}</span>
                  <span className={styles.settingDescription}>{t('settings.gridSnapDesc')}</span>
                </div>
                <label className={styles.switch}>
                  <input type="checkbox" defaultChecked />
                  <span className={styles.slider}></span>
                </label>
              </div>
            </div>
          </div>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('settings.shortcuts')}</h3>
            <div className={styles.shortcutList}>
              <div className={styles.shortcutItem}>
                <span className={styles.shortcutAction}>{t('common.save')}</span>
                <kbd className={styles.shortcutKey}>Ctrl + S</kbd>
              </div>
              <div className={styles.shortcutItem}>
                <span className={styles.shortcutAction}>{t('common.undo')}</span>
                <kbd className={styles.shortcutKey}>Ctrl + Z</kbd>
              </div>
              <div className={styles.shortcutItem}>
                <span className={styles.shortcutAction}>{t('common.redo')}</span>
                <kbd className={styles.shortcutKey}>Ctrl + Y</kbd>
              </div>
              <div className={styles.shortcutItem}>
                <span className={styles.shortcutAction}>{t('common.copy')}</span>
                <kbd className={styles.shortcutKey}>Ctrl + C</kbd>
              </div>
              <div className={styles.shortcutItem}>
                <span className={styles.shortcutAction}>{t('common.paste')}</span>
                <kbd className={styles.shortcutKey}>Ctrl + V</kbd>
              </div>
            </div>
          </div>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('settings.info')}</h3>
            <div className={styles.infoList}>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>{t('settings.version')}</span>
                <span className={styles.infoValue}>1.0.0</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>{t('settings.lastUpdate')}</span>
                <span className={styles.infoValue}>2024.01.15</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default SettingsPanel;