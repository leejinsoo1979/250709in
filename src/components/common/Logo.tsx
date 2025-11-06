import React from 'react';
import { useTheme } from '@/contexts/ThemeContext';

interface LogoProps {
  size?: 'small' | 'medium' | 'large';
  onClick?: () => void;
}

const Logo: React.FC<LogoProps> = ({ size = 'medium', onClick }) => {
  const { theme } = useTheme();
  
  // 크기별 설정
  const sizeConfig = {
    small: {
      mSize: 20,
      logoFontSize: 14,
      gap: 6,
      mBorderRadius: 4,
    },
    medium: {
      mSize: 32,
      logoFontSize: 18,
      gap: 8,
      mBorderRadius: 6,
    },
    large: {
      mSize: 40,
      logoFontSize: 24,
      gap: 10,
      mBorderRadius: 8,
    },
  };

  const config = sizeConfig[size];

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: config.gap,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
    >
      {/* m 박스 */}
      <div
        style={{
          width: config.mSize,
          height: config.mSize,
          backgroundColor: 'var(--theme-primary)',
          borderRadius: config.mBorderRadius,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ffffff',
          fontSize: config.mSize * 0.6,
          fontWeight: 'bold',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          transition: 'all 0.2s ease',
        }}
      >
        m
      </div>
      
      {/* logo 텍스트 */}
      <span
        style={{
          fontSize: config.logoFontSize,
          fontWeight: '600',
          color: 'var(--theme-text)',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          transition: 'color 0.2s ease',
        }}
      >
        logo
      </span>
    </div>
  );
};

export default Logo;