import React, { useState } from 'react';
import { useTheme, ThemeMode, ThemeColor } from '@/contexts/ThemeContext';
import { SettingsIcon, SunIcon, MoonIcon } from './Icons';
import styles from './ThemeSelector.module.css';
import { useTranslation } from '@/i18n/useTranslation';

interface ThemeSelectorProps {
  variant?: 'dropdown' | 'sidebar';
  showLabel?: boolean;
}

const ThemeSelector: React.FC<ThemeSelectorProps> = ({ 
  variant = 'dropdown', 
  showLabel = true 
}) => {
  const { theme, setThemeMode, setThemeColor, toggleMode } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const { t } = useTranslation();

  // 4x7 그리드로 정리된 색상 배열
  const themeColors: { id: ThemeColor; name: string; color: string }[] = [
    // 1번째 줄
    { id: 'black', name: '차콜블랙', color: '#1a1a1a' },
    { id: 'gray', name: '다크그레이', color: '#6b7280' },
    { id: 'blue', name: '스카이블루', color: '#3b82f6' },
    { id: 'navy', name: '로얄블루', color: '#1e3a8a' },
    { id: 'indigo', name: '페일블루', color: '#6366f1' },
    { id: 'teal', name: '딥틸', color: '#14b8a6' },
    { id: 'cyan', name: '다크틸', color: '#06b6d4' },
    
    // 2번째 줄
    { id: 'white', name: '라이트그레이', color: '#D65DB1' },
    { id: 'plum', name: '플럼', color: '#790963' },
    { id: 'vivid', name: '비비드', color: '#a25378' },
    { id: 'rust', name: '선셋오렌지', color: '#FF7438' },
    { id: 'brown', name: '다크브라운', color: '#5A2B1D' },
    { id: 'emerald', name: '포레스트그린', color: '#059669' },
    { id: 'darkgray', name: '블루그레이', color: '#2C3844' },
    
    // 3번째 줄
    { id: 'wine', name: '바이올렛', color: '#845EC2' },
    { id: 'purple', name: '딥퍼플', color: '#8b5cf6' },
    { id: 'pink', name: '코랄핑크', color: '#ec4899' },
    { id: 'red', name: '레드', color: '#D2042D' },
    { id: 'maroon', name: '다크레드', color: '#3F0D0D' },
    { id: 'turquoise', name: '터콰이즈', color: '#003A7A' },
    { id: 'slate', name: '슬레이트', color: '#2E3A47' },
    
    // 4번째 줄
    { id: 'copper', name: '코퍼', color: '#AD4F34' },
    { id: 'mint', name: '민트', color: '#0CBA80' },
    { id: 'lime', name: '라임그린', color: '#84cc16' },
    { id: 'green', name: '그린', color: '#10b981' },
    { id: 'forest', name: '다크그린', color: '#1B3924' },
    { id: 'olive', name: '올리브', color: '#4C462C' },
    { id: 'yellow', name: '올리브그린', color: '#eab308' },
  ];

  const themeModes: { id: ThemeMode; name: string; icon: React.ReactNode }[] = [
    { id: 'light', name: t('settings.lightMode'), icon: <SunIcon size={16} /> },
    { id: 'dark', name: t('settings.darkMode'), icon: <MoonIcon size={16} /> },
  ];

  if (variant === 'sidebar') {
    return (
      <div className={styles.sidebarContainer}>
        {showLabel && <div className={styles.sidebarLabel}>{t('settings.themeSettings')}</div>}
        
        {/* 모드 토글 */}
        <div className={styles.sidebarSection}>
          <div className={styles.sectionTitle}>{t('settings.displayMode')}</div>
          <div className={styles.modeToggleTab}>
            {themeModes.map((mode) => (
              <button
                key={mode.id}
                className={`${styles.modeTabButton} ${theme.mode === mode.id ? styles.active : ''}`}
                onClick={() => setThemeMode(mode.id)}
                title={mode.name}
              >
                <span className={styles.modeIcon}>{mode.icon}</span>
                <span className={styles.modeName}>{mode.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 색상 선택 */}
        <div className={styles.sidebarSection}>
          <div className={styles.sectionTitle}>{t('settings.themeColor')}</div>
          <div className={styles.colorGrid}>
            {themeColors.map((color) => (
              <button
                key={color.id}
                className={`${styles.colorButton} ${theme.color === color.id ? styles.active : ''}`}
                onClick={() => setThemeColor(color.id)}
                title={color.name}
                style={{ backgroundColor: color.color }}
              >
                {theme.color === color.id && (
                  <span className={styles.checkIcon}>✓</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.dropdownContainer}>
      <button
        className={styles.trigger}
        onClick={() => setIsOpen(!isOpen)}
        title={t('settings.themeSettings')}
      >
        <SettingsIcon size={20} />
        {showLabel && <span>{t('settings.theme')}</span>}
      </button>

      {isOpen && (
        <>
          <div className={styles.overlay} onClick={() => setIsOpen(false)} />
          <div className={styles.dropdown}>
            <div className={styles.dropdownHeader}>
              <h3>{t('settings.themeSettings')}</h3>
              <button 
                className={styles.closeButton}
                onClick={() => setIsOpen(false)}
              >
                ×
              </button>
            </div>

            {/* 모드 선택 */}
            <div className={styles.section}>
              <div className={styles.sectionTitle}>{t('settings.displayMode')}</div>
              <div className={styles.modeList}>
                {themeModes.map((mode) => (
                  <button
                    key={mode.id}
                    className={`${styles.modeItem} ${theme.mode === mode.id ? styles.active : ''}`}
                    onClick={() => {
                      setThemeMode(mode.id);
                      setIsOpen(false);
                    }}
                  >
                    <span className={styles.modeIcon}>{mode.icon}</span>
                    <span>{mode.name}</span>
                    {theme.mode === mode.id && <span className={styles.checkIcon}>✓</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* 색상 선택 */}
            <div className={styles.section}>
              <div className={styles.sectionTitle}>{t('settings.themeColor')}</div>
              <div className={styles.colorList}>
                {themeColors.map((color) => (
                  <button
                    key={color.id}
                    className={`${styles.colorItem} ${theme.color === color.id ? styles.active : ''}`}
                    onClick={() => {
                      setThemeColor(color.id);
                      setIsOpen(false);
                    }}
                    title={color.name}
                  >
                    <div 
                      className={styles.colorPreview}
                      style={{ backgroundColor: color.color }}
                    >
                      {theme.color === color.id && <span className={styles.checkIcon}>✓</span>}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 빠른 모드 토글 */}
            <div className={styles.section}>
              <button
                className={styles.quickToggle}
                onClick={() => {
                  toggleMode();
                  setIsOpen(false);
                }}
              >
                {theme.mode === 'light' ? <MoonIcon size={16} /> : <SunIcon size={16} />}
                {theme.mode === 'light' ? t('settings.darkMode') : t('settings.lightMode')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ThemeSelector;