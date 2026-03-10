import React, { useEffect } from 'react';
import ThemeSelector from './ThemeSelector';
import { useTranslation } from '@/i18n/useTranslation';
import { useUIStore } from '@/store/uiStore';
import styles from './SettingsPanel.module.css';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen, onClose }) => {
  const { t, currentLanguage, changeLanguage, availableLanguages } = useTranslation();
  const { viewMode, cameraMode, setCameraMode, shadowEnabled, setShadowEnabled, edgeOutlineEnabled, setEdgeOutlineEnabled } = useUIStore();
  
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
          
          {/* 뷰모드 & 그래픽 설정 (3D 모드일 때만 표시) */}
          {viewMode === '3D' && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>뷰모드 & 그래픽</h3>
              <div className={styles.settingGroup}>
                <div className={styles.settingItem}>
                  <div className={styles.settingInfo}>
                    <span className={styles.settingLabel}>카메라 모드</span>
                    <span className={styles.settingDescription}>3D 뷰 투영 방식</span>
                  </div>
                  <div className={styles.segmentedControl}>
                    <button
                      className={`${styles.segmentButton} ${cameraMode === 'perspective' ? styles.segmentActive : ''}`}
                      onClick={() => setCameraMode('perspective')}
                    >
                      Perspective
                    </button>
                    <button
                      className={`${styles.segmentButton} ${cameraMode === 'orthographic' ? styles.segmentActive : ''}`}
                      onClick={() => setCameraMode('orthographic')}
                    >
                      Orthographic
                    </button>
                  </div>
                </div>
                <div className={styles.settingItem}>
                  <div className={styles.settingInfo}>
                    <span className={styles.settingLabel}>그림자</span>
                    <span className={styles.settingDescription}>3D 뷰에서 그림자 표시</span>
                  </div>
                  <label className={styles.switch}>
                    <input type="checkbox" checked={shadowEnabled} onChange={() => setShadowEnabled(!shadowEnabled)} />
                    <span className={styles.slider}></span>
                  </label>
                </div>
                <div className={styles.settingItem}>
                  <div className={styles.settingInfo}>
                    <span className={styles.settingLabel}>윤곽선</span>
                    <span className={styles.settingDescription}>3D 뷰에서 엣지 윤곽선 표시</span>
                  </div>
                  <label className={styles.switch}>
                    <input type="checkbox" checked={edgeOutlineEnabled} onChange={() => setEdgeOutlineEnabled(!edgeOutlineEnabled)} />
                    <span className={styles.slider}></span>
                  </label>
                </div>
              </div>
            </div>
          )}

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

        </div>
      </div>
    </>
  );
};

export default SettingsPanel;