import React from 'react';

interface LogoProps {
  size?: 'small' | 'medium' | 'large';
  onClick?: () => void;
}

const sizeConfig = {
  small: { dot: 4, gap: 2, fontSize: 14, dotGap: 3 },
  medium: { dot: 6, gap: 4, fontSize: 18, dotGap: 4 },
  large: { dot: 8, gap: 6, fontSize: 24, dotGap: 5 },
};

const Logo: React.FC<LogoProps> = ({ size = 'medium', onClick }) => {
  const config = sizeConfig[size];

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
        <div style={{ width: config.dot, height: config.dot, borderRadius: '50%', backgroundColor: 'var(--theme-text, #ffffff)' }} />
        <div style={{ width: config.dot, height: config.dot, borderRadius: '50%', backgroundColor: 'var(--theme-text, #ffffff)' }} />
        <div style={{ width: config.dot, height: config.dot, borderRadius: '50%', backgroundColor: 'var(--theme-text, #ffffff)' }} />
      </div>
      <span
        style={{
          fontSize: config.fontSize,
          fontWeight: 900,
          color: 'var(--theme-text, #ffffff)',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          letterSpacing: '0.02em',
        }}
      >
        CRAFT
      </span>
    </div>
  );
};

export default Logo;
