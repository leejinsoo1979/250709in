import { useTheme } from '@/contexts/ThemeContext';
import { useMemo } from 'react';

export const useThemeColors = () => {
  const { theme } = useTheme();
  
  const colors = useMemo(() => {
    // CSS 변수에서 색상 값 가져오기
    const getColor = (varName: string): string => {
      const computed = getComputedStyle(document.documentElement);
      return computed.getPropertyValue(varName).trim() || '';
    };
    
    return {
      primary: getColor('--theme-primary'),
      primaryHover: getColor('--theme-primary-hover'),
      primaryLight: getColor('--theme-primary-light'),
      primaryDark: getColor('--theme-primary-dark'),
      background: getColor('--theme-background'),
      backgroundSecondary: getColor('--theme-background-secondary'),
      surface: getColor('--theme-surface'),
      text: getColor('--theme-text'),
      textSecondary: getColor('--theme-text-secondary'),
      border: getColor('--theme-border'),
      error: getColor('--theme-error'),
      errorLight: getColor('--theme-error-light'),
      warning: getColor('--theme-warning'),
      warningLight: getColor('--theme-warning-light'),
      success: getColor('--theme-success'),
      successLight: getColor('--theme-success-light'),
      info: getColor('--theme-info'),
      infoLight: getColor('--theme-info-light'),
    };
  }, [theme]);
  
  return { colors, theme };
};