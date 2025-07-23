import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type ThemeMode = 'light' | 'dark';
export type ThemeColor = 'green' | 'blue' | 'purple' | 'orange';

export interface ThemeConfig {
  mode: ThemeMode;
  color: ThemeColor;
}

interface ThemeContextType {
  theme: ThemeConfig;
  setThemeMode: (mode: ThemeMode) => void;
  setThemeColor: (color: ThemeColor) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'app-theme-config';

const defaultTheme: ThemeConfig = {
  mode: 'light',
  color: 'green',
};

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<ThemeConfig>(defaultTheme);

  // 로컬스토리지에서 테마 설정 불러오기
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme) {
        const parsedTheme = JSON.parse(savedTheme) as ThemeConfig;
        setTheme(parsedTheme);
      }
    } catch (error) {
      console.warn('테마 설정 로드 실패:', error);
    }
  }, []);

  // 테마 변경 시 로컬스토리지에 저장 및 CSS 변수 업데이트
  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(theme));
      applyThemeToDocument(theme);
    } catch (error) {
      console.warn('테마 설정 저장 실패:', error);
    }
  }, [theme]);

  const setThemeMode = (mode: ThemeMode) => {
    setTheme(prev => ({ ...prev, mode }));
  };

  const setThemeColor = (color: ThemeColor) => {
    setTheme(prev => ({ ...prev, color }));
  };

  const toggleMode = () => {
    setThemeMode(theme.mode === 'light' ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider value={{ theme, setThemeMode, setThemeColor, toggleMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

// CSS 변수를 문서에 적용하는 함수
const applyThemeToDocument = (theme: ThemeConfig) => {
  const root = document.documentElement;
  
  // 테마별 색상 팔레트
  const colorPalettes = {
    green: {
      primary: '#10b981',
      primaryHover: '#059669',
      primaryLight: theme.mode === 'dark' ? 'rgba(16, 185, 129, 0.2)' : '#d1fae5',
      primaryDark: '#047857',
    },
    blue: {
      primary: '#3b82f6',
      primaryHover: '#2563eb',
      primaryLight: theme.mode === 'dark' ? 'rgba(59, 130, 246, 0.2)' : '#dbeafe',
      primaryDark: '#1d4ed8',
    },
    purple: {
      primary: '#8b5cf6',
      primaryHover: '#7c3aed',
      primaryLight: theme.mode === 'dark' ? 'rgba(139, 92, 246, 0.2)' : '#ede9fe',
      primaryDark: '#6d28d9',
    },
    orange: {
      primary: '#f97316',
      primaryHover: '#ea580c',
      primaryLight: theme.mode === 'dark' ? 'rgba(249, 115, 22, 0.2)' : '#fed7aa',
      primaryDark: '#c2410c',
    },
  };

  // 모드별 색상 설정
  const modeColors = {
    light: {
      background: '#ffffff',
      backgroundSecondary: '#f9fafb',
      surface: '#ffffff',
      text: '#111827',
      textSecondary: '#6b7280',
      textMuted: '#9ca3af',
      border: '#e5e7eb',
      borderHover: '#d1d5db',
      shadow: 'rgba(0, 0, 0, 0.1)',
      overlay: 'rgba(0, 0, 0, 0.5)',
    },
    dark: {
      background: '#1f2937',
      backgroundSecondary: '#111827',
      surface: '#374151',
      text: '#f9fafb',
      textSecondary: '#d1d5db',
      textMuted: '#9ca3af',
      border: '#4b5563',
      borderHover: '#6b7280',
      shadow: 'rgba(0, 0, 0, 0.3)',
      overlay: 'rgba(0, 0, 0, 0.7)',
    },
  };

  const colors = colorPalettes[theme.color];
  const mode = modeColors[theme.mode];

  // CSS 변수 적용
  root.style.setProperty('--theme-primary', colors.primary);
  root.style.setProperty('--theme-primary-hover', colors.primaryHover);
  root.style.setProperty('--theme-primary-light', colors.primaryLight);
  root.style.setProperty('--theme-primary-dark', colors.primaryDark);
  
  root.style.setProperty('--theme-background', mode.background);
  root.style.setProperty('--theme-background-secondary', mode.backgroundSecondary);
  root.style.setProperty('--theme-surface', mode.surface);
  root.style.setProperty('--theme-text', mode.text);
  root.style.setProperty('--theme-text-secondary', mode.textSecondary);
  root.style.setProperty('--theme-text-muted', mode.textMuted);
  root.style.setProperty('--theme-border', mode.border);
  root.style.setProperty('--theme-border-hover', mode.borderHover);
  root.style.setProperty('--theme-shadow', mode.shadow);
  root.style.setProperty('--theme-overlay', mode.overlay);

  // body에 테마 클래스 추가
  document.body.className = document.body.className.replace(/theme-\w+-\w+/g, '');
  document.body.classList.add(`theme-${theme.mode}-${theme.color}`);
};