import React, { useState } from 'react';
import { useTheme, ThemeMode, ThemeColor } from '@/contexts/ThemeContext';
import { SettingsIcon, SunIcon, MoonIcon } from './Icons';
import styles from './ThemeSelector.module.css';

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

  const themeColors: { id: ThemeColor; name: string; color: string }[] = [
    { id: 'green', name: '초록색', color: '#10b981' },
    { id: 'blue', name: '파란색', color: '#3b82f6' },
    { id: 'wine', name: '와인색', color: '#991b1b' },
    { id: 'gold', name: '골드', color: '#d97706' },
    { id: 'navy', name: '네이비', color: '#1e3a8a' },
    { id: 'emerald', name: '에메랄드', color: '#059669' },
    { id: 'purple', name: '보라색', color: '#8b5cf6' },
    { id: 'orange', name: '주황색', color: '#f97316' },
    { id: 'red', name: '빨간색', color: '#ef4444' },
    { id: 'pink', name: '분홍색', color: '#ec4899' },
    { id: 'indigo', name: '남색', color: '#6366f1' },
    { id: 'teal', name: '청록색', color: '#14b8a6' },
    { id: 'yellow', name: '노란색', color: '#eab308' },
    { id: 'gray', name: '회색', color: '#6b7280' },
    { id: 'cyan', name: '하늘색', color: '#06b6d4' },
    { id: 'lime', name: '연두색', color: '#84cc16' },
    { id: 'black', name: '검정색', color: '#1a1a1a' },
    { id: 'violet', name: '바이올렛', color: '#C128D7' },
    { id: 'mint', name: '민트', color: '#0CBA80' },
    { id: 'neon', name: '네온그린', color: '#18CF23' },
    { id: 'rust', name: '러스트', color: '#BE5028' },
  ];

  const themeModes: { id: ThemeMode; name: string; icon: React.ReactNode }[] = [
    { id: 'light', name: '라이트 모드', icon: <SunIcon size={16} color="white" /> },
    { id: 'dark', name: '다크 모드', icon: <MoonIcon size={16} color="white" /> },
  ];

  if (variant === 'sidebar') {
    return (
      <div className={styles.sidebarContainer}>
        {showLabel && <div className={styles.sidebarLabel}>테마 설정</div>}
        
        {/* 모드 토글 */}
        <div className={styles.sidebarSection}>
          <div className={styles.sectionTitle}>표시 모드</div>
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
          <div className={styles.sectionTitle}>테마 색상</div>
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
        title="테마 설정"
      >
        <SettingsIcon size={20} />
        {showLabel && <span>테마</span>}
      </button>

      {isOpen && (
        <>
          <div className={styles.overlay} onClick={() => setIsOpen(false)} />
          <div className={styles.dropdown}>
            <div className={styles.dropdownHeader}>
              <h3>테마 설정</h3>
              <button 
                className={styles.closeButton}
                onClick={() => setIsOpen(false)}
              >
                ×
              </button>
            </div>

            {/* 모드 선택 */}
            <div className={styles.section}>
              <div className={styles.sectionTitle}>표시 모드</div>
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
              <div className={styles.sectionTitle}>테마 색상</div>
              <div className={styles.colorList}>
                {themeColors.map((color) => (
                  <button
                    key={color.id}
                    className={`${styles.colorItem} ${theme.color === color.id ? styles.active : ''}`}
                    onClick={() => {
                      setThemeColor(color.id);
                      setIsOpen(false);
                    }}
                  >
                    <div 
                      className={styles.colorPreview}
                      style={{ backgroundColor: color.color }}
                    />
                    <span>{color.name}</span>
                    {theme.color === color.id && <span className={styles.checkIcon}>✓</span>}
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
                {theme.mode === 'light' ? <MoonIcon size={16} color="white" /> : <SunIcon size={16} color="white" />}
                {theme.mode === 'light' ? '다크 모드로 전환' : '라이트 모드로 전환'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ThemeSelector;