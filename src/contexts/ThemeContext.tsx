import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type ThemeMode = 'light' | 'dark';
export type ThemeColor = 'green' | 'blue' | 'purple' | 'orange' | 'red' | 'pink' | 'indigo' | 'teal' | 'yellow' | 'gray' | 'cyan' | 'lime' | 'black' | 'wine' | 'gold' | 'navy' | 'emerald' | 'violet' | 'mint' | 'neon' | 'rust';

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
  // 초기 테마 설정 시 localStorage 확인
  const getInitialTheme = (): ThemeConfig => {
    try {
      const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme) {
        return JSON.parse(savedTheme) as ThemeConfig;
      }
    } catch (error) {
      console.warn('테마 설정 로드 실패:', error);
    }
    return defaultTheme;
  };

  const [theme, setTheme] = useState<ThemeConfig>(() => {
    const initialTheme = getInitialTheme();
    // 초기 렌더링 시 즉시 테마 적용 (setTimeout 제거)
    if (typeof window !== 'undefined' && document.documentElement) {
      applyThemeToDocument(initialTheme);
    }
    return initialTheme;
  });

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
  console.log('🎨 테마 적용 중:', theme);
  const root = document.documentElement;
  
  // 기존 테마 클래스 제거
  document.body.classList.remove(...Array.from(document.body.classList).filter(c => c.startsWith('theme-')));
  
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
    red: {
      primary: '#ef4444',
      primaryHover: '#dc2626',
      primaryLight: theme.mode === 'dark' ? 'rgba(239, 68, 68, 0.2)' : '#fecaca',
      primaryDark: '#b91c1c',
    },
    pink: {
      primary: '#ec4899',
      primaryHover: '#db2777',
      primaryLight: theme.mode === 'dark' ? 'rgba(236, 72, 153, 0.2)' : '#fce7f3',
      primaryDark: '#be185d',
    },
    indigo: {
      primary: '#6366f1',
      primaryHover: '#4f46e5',
      primaryLight: theme.mode === 'dark' ? 'rgba(99, 102, 241, 0.2)' : '#e0e7ff',
      primaryDark: '#3730a3',
    },
    teal: {
      primary: '#14b8a6',
      primaryHover: '#0d9488',
      primaryLight: theme.mode === 'dark' ? 'rgba(20, 184, 166, 0.2)' : '#ccfbf1',
      primaryDark: '#0f766e',
    },
    yellow: {
      primary: '#eab308',
      primaryHover: '#ca8a04',
      primaryLight: theme.mode === 'dark' ? 'rgba(234, 179, 8, 0.2)' : '#fef3c7',
      primaryDark: '#a16207',
    },
    gray: {
      primary: '#6b7280',
      primaryHover: '#4b5563',
      primaryLight: theme.mode === 'dark' ? 'rgba(107, 114, 128, 0.2)' : '#f3f4f6',
      primaryDark: '#374151',
    },
    cyan: {
      primary: '#06b6d4',
      primaryHover: '#0891b2',
      primaryLight: theme.mode === 'dark' ? 'rgba(6, 182, 212, 0.2)' : '#cffafe',
      primaryDark: '#0e7490',
    },
    lime: {
      primary: '#84cc16',
      primaryHover: '#65a30d',
      primaryLight: theme.mode === 'dark' ? 'rgba(132, 204, 22, 0.2)' : '#ecfccb',
      primaryDark: '#4d7c0f',
    },
    black: {
      primary: '#1a1a1a',
      primaryHover: '#000000',
      primaryLight: theme.mode === 'dark' ? 'rgba(26, 26, 26, 0.2)' : '#f5f5f5',
      primaryDark: '#000000',
    },
    wine: {
      primary: '#991b1b',
      primaryHover: '#7f1d1d',
      primaryLight: theme.mode === 'dark' ? 'rgba(153, 27, 27, 0.2)' : '#fef2f2',
      primaryDark: '#450a0a',
    },
    gold: {
      primary: '#d97706',
      primaryHover: '#b45309',
      primaryLight: theme.mode === 'dark' ? 'rgba(217, 119, 6, 0.2)' : '#fef3c7',
      primaryDark: '#92400e',
    },
    navy: {
      primary: '#1e3a8a',
      primaryHover: '#1e40af',
      primaryLight: theme.mode === 'dark' ? 'rgba(30, 58, 138, 0.2)' : '#dbeafe',
      primaryDark: '#1e1b4b',
    },
    emerald: {
      primary: '#059669',
      primaryHover: '#047857',
      primaryLight: theme.mode === 'dark' ? 'rgba(5, 150, 105, 0.2)' : '#d1fae5',
      primaryDark: '#064e3b',
    },
    violet: {
      primary: '#C128D7',
      primaryHover: '#A020B8',
      primaryLight: theme.mode === 'dark' ? 'rgba(193, 40, 215, 0.2)' : '#f3e8ff',
      primaryDark: '#7B1FA2',
    },
    mint: {
      primary: '#0CBA80',
      primaryHover: '#0AA66B',
      primaryLight: theme.mode === 'dark' ? 'rgba(12, 186, 128, 0.2)' : '#ecfdf5',
      primaryDark: '#065F46',
    },
    neon: {
      primary: '#18CF23',
      primaryHover: '#15B820',
      primaryLight: theme.mode === 'dark' ? 'rgba(24, 207, 35, 0.2)' : '#f0fdf4',
      primaryDark: '#166534',
    },
    rust: {
      primary: '#BE5028',
      primaryHover: '#A8441F',
      primaryLight: theme.mode === 'dark' ? 'rgba(190, 80, 40, 0.2)' : '#fef2f2',
      primaryDark: '#7F2D14',
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
      background: '#000000',
      backgroundSecondary: '#000000',
      surface: '#000000',
      text: '#ffffff',
      textSecondary: '#cccccc',
      textMuted: '#999999',
      border: '#333333',
      borderHover: '#555555',
      shadow: 'rgba(0, 0, 0, 0.5)',
      overlay: 'rgba(0, 0, 0, 0.8)',
    },
  };

  const colors = colorPalettes[theme.color];
  const mode = modeColors[theme.mode];

  // CSS 변수 적용
  root.style.setProperty('--theme-mode', theme.mode); // 모드 정보 추가
  root.style.setProperty('--theme-color', theme.color); // 색상 정보 추가
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

  // 추가 시스템 색상 변수
  root.style.setProperty('--theme-danger', '#ef4444');
  root.style.setProperty('--theme-danger-hover', '#dc2626');
  root.style.setProperty('--theme-danger-light', theme.mode === 'dark' ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2');
  
  root.style.setProperty('--theme-info', '#3b82f6');
  root.style.setProperty('--theme-info-hover', '#2563eb'); 
  root.style.setProperty('--theme-info-light', theme.mode === 'dark' ? 'rgba(59, 130, 246, 0.2)' : '#eff6ff');
  
  root.style.setProperty('--theme-warning', '#f59e0b');
  root.style.setProperty('--theme-warning-hover', '#d97706');
  root.style.setProperty('--theme-warning-light', theme.mode === 'dark' ? 'rgba(245, 158, 11, 0.2)' : '#fef3c7');
  
  root.style.setProperty('--theme-success', colors.primary);
  root.style.setProperty('--theme-success-hover', colors.primaryHover);
  root.style.setProperty('--theme-success-light', colors.primaryLight);

  // 팝업 그림자 - 테마에 따라 다르게 설정
  if (theme.mode === 'dark') {
    root.style.setProperty('--popup-shadow', `0 20px 50px rgba(0, 0, 0, 0.8), 0 10px 20px ${colors.primaryLight}`);
  } else {
    root.style.setProperty('--popup-shadow', '0 20px 50px rgba(0, 0, 0, 0.3), 0 10px 20px rgba(0, 0, 0, 0.15)');
  }

  // body에 테마 클래스 추가
  document.body.className = document.body.className.replace(/theme-\w+-\w+/g, '');
  document.body.classList.add(`theme-${theme.mode}-${theme.color}`);
  
  // body 스타일 강제 적용
  document.body.style.backgroundColor = mode.background;
  document.body.style.color = mode.text;
  
  console.log('🎨 테마 적용 완료:', {
    mode: theme.mode,
    color: theme.color,
    background: mode.background,
    text: mode.text,
    primary: colors.primary
  });
  
  // CSS 변수 적용 확인 및 디버깅
  setTimeout(() => {
    const appliedBackground = getComputedStyle(root).getPropertyValue('--theme-background').trim();
    const appliedText = getComputedStyle(root).getPropertyValue('--theme-text').trim();
    const appliedPrimary = getComputedStyle(root).getPropertyValue('--theme-primary').trim();
    
    console.log('🔍 CSS 변수 적용 확인:', {
      expected: {
        background: mode.background,
        text: mode.text,
        primary: colors.primary
      },
      applied: {
        background: appliedBackground,
        text: appliedText,
        primary: appliedPrimary
      },
      success: appliedBackground === mode.background && appliedText === mode.text
    });
    
    if (appliedBackground !== mode.background) {
      console.error('❌ 배경색 적용 실패!', { expected: mode.background, actual: appliedBackground });
      // 강제로 다시 적용
      root.style.setProperty('--theme-background', mode.background);
      document.body.style.backgroundColor = mode.background;
    }
    if (appliedText !== mode.text) {
      console.error('❌ 텍스트 색상 적용 실패!', { expected: mode.text, actual: appliedText });
      // 강제로 다시 적용
      root.style.setProperty('--theme-text', mode.text);
      document.body.style.color = mode.text;
    }
  }, 100);
  
  // 네비게이션 메뉴 강제 테마 적용
  setTimeout(() => {
    const navItems = document.querySelectorAll('[class*="navItem"]');
    console.log(`🔧 네비게이션 항목 ${navItems.length}개 발견, 테마 강제 적용 중...`);
    
    navItems.forEach((item: Element) => {
      const element = item as HTMLElement;
      if (!element.classList.contains('active')) {
        element.style.setProperty('color', mode.textSecondary, 'important');
        element.style.setProperty('background-color', 'transparent', 'important');
      } else {
        element.style.setProperty('color', colors.primary, 'important');
        element.style.setProperty('background-color', colors.primaryLight, 'important');
      }
    });
    
    console.log('✅ 네비게이션 테마 적용 완료');
  }, 200);
  
  // 동적 파비콘 생성 및 적용
  generateAndSetFavicon(colors.primary, theme.mode);
};

// 동적 파비콘 생성 함수
const generateAndSetFavicon = (color: string, mode: ThemeMode) => {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) return;
  
  // 파비콘 디자인 (둥근 사각형 배경)
  ctx.fillStyle = color;
  const x = 2, y = 2, width = 28, height = 28, radius = 4;
  
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
  ctx.fill();
  
  // 다크모드일 때 약간 밝은 테두리 추가
  if (mode === 'dark') {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  
  // 내부 텍스트 ('m' for 'module')
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('m', 16, 17);
  
  // 파비콘 설정
  const existingLink = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
  const svgLink = document.querySelector("link[rel='icon'][type='image/svg+xml']") as HTMLLinkElement;
  
  // 기존 파비콘 제거
  if (existingLink && existingLink.type === 'image/x-icon') existingLink.remove();
  if (svgLink) svgLink.remove();
  
  // 새로운 파비콘 추가
  const link = document.createElement('link');
  link.type = 'image/x-icon';
  link.rel = 'icon';
  link.href = canvas.toDataURL();
  document.head.appendChild(link);
};