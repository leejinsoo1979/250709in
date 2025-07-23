import React, { useState } from 'react';
import { useTheme, ThemeMode, ThemeColor } from '@/contexts/ThemeContext';
import { SettingsIcon } from './Icons';
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
    { id: 'purple', name: '보라색', color: '#8b5cf6' },
    { id: 'orange', name: '주황색', color: '#f97316' },
  ];

  const themeModes: { id: ThemeMode; name: string; icon: string }[] = [
    { id: 'light', name: '라이트 모드', icon: '☀️' },
    { id: 'dark', name: '다크 모드', icon: '🌙' },
  ];

  if (variant === 'sidebar') {
    return (
      <div className={styles.sidebarContainer}>
        {showLabel && <div className={styles.sidebarLabel}>테마 설정</div>}
        
        {/* 모드 토글 */}
        <div className={styles.sidebarSection}>
          <div className={styles.sectionTitle}>표시 모드</div>
          <div className={styles.modeToggle}>
            {themeModes.map((mode) => (
              <button
                key={mode.id}
                className={`${styles.modeButton} ${theme.mode === mode.id ? styles.active : ''}`}
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
                {theme.mode === 'light' ? '🌙' : '☀️'}
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