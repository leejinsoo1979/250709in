import React from 'react';
import { useTheme } from '@/contexts/ThemeContext';

interface LogoProps {
  size?: 'small' | 'medium' | 'large';
  onClick?: () => void;
}

const sizeConfig = {
  small: { dot: 9, gap: 3, fontSize: 14, dotGap: 3 },
  medium: { dot: 12, gap: 5, fontSize: 18, dotGap: 4 },
  large: { dot: 16, gap: 6, fontSize: 24, dotGap: 5 },
};

const Logo: React.FC<LogoProps> = ({ size = 'medium', onClick }) => {
  const config = sizeConfig[size];
  const { theme } = useTheme();
  const isDark = theme.mode === 'dark';

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: config.gap,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: config.dotGap }}>
        <div style={{ width: config.dot, height: config.dot, borderRadius: '50%', backgroundColor: 'var(--theme-primary, #667eea)' }} />
        <div style={{ width: config.dot, height: config.dot, borderRadius: '50%', backgroundColor: 'var(--theme-primary, #667eea)' }} />
        <div style={{ width: config.dot, height: config.dot, borderRadius: '50%', backgroundColor: 'var(--theme-primary, #667eea)' }} />
      </div>
      <span
        style={{
          fontSize: config.fontSize,
          fontWeight: 900,
          color: isDark ? '#ffffff' : '#374151',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          letterSpacing: '0.15em',
        }}
      >
        CRAFT
      </span>
    </div>
  );
};

export default Logo;
