import React from 'react';
import ThemeSelector from './ThemeSelector';
import styles from './SettingsPanel.module.css';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <>
      {/* 백그라운드 오버레이 */}
      <div className={styles.overlay} onClick={onClose} />
      
      {/* 설정 패널 */}
      <div className={styles.panel}>
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
          
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>일반 설정</h3>
            <div className={styles.settingGroup}>
              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <span className={styles.settingLabel}>알림</span>
                  <span className={styles.settingDescription}>새로운 업데이트 및 알림 받기</span>
                </div>
                <label className={styles.switch}>
                  <input type="checkbox" defaultChecked />
                  <span className={styles.slider}></span>
                </label>
              </div>
              
              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <span className={styles.settingLabel}>자동 저장</span>
                  <span className={styles.settingDescription}>변경사항을 자동으로 저장</span>
                </div>
                <label className={styles.switch}>
                  <input type="checkbox" defaultChecked />
                  <span className={styles.slider}></span>
                </label>
              </div>
              
              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <span className={styles.settingLabel}>그리드 스냅</span>
                  <span className={styles.settingDescription}>오브젝트를 그리드에 자동 정렬</span>
                </div>
                <label className={styles.switch}>
                  <input type="checkbox" defaultChecked />
                  <span className={styles.slider}></span>
                </label>
              </div>
            </div>
          </div>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>키보드 단축키</h3>
            <div className={styles.shortcutList}>
              <div className={styles.shortcutItem}>
                <span className={styles.shortcutAction}>저장</span>
                <kbd className={styles.shortcutKey}>Ctrl + S</kbd>
              </div>
              <div className={styles.shortcutItem}>
                <span className={styles.shortcutAction}>실행취소</span>
                <kbd className={styles.shortcutKey}>Ctrl + Z</kbd>
              </div>
              <div className={styles.shortcutItem}>
                <span className={styles.shortcutAction}>다시실행</span>
                <kbd className={styles.shortcutKey}>Ctrl + Y</kbd>
              </div>
              <div className={styles.shortcutItem}>
                <span className={styles.shortcutAction}>복사</span>
                <kbd className={styles.shortcutKey}>Ctrl + C</kbd>
              </div>
              <div className={styles.shortcutItem}>
                <span className={styles.shortcutAction}>붙여넣기</span>
                <kbd className={styles.shortcutKey}>Ctrl + V</kbd>
              </div>
            </div>
          </div>

          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>정보</h3>
            <div className={styles.infoList}>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>버전</span>
                <span className={styles.infoValue}>1.0.0</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>최종 업데이트</span>
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