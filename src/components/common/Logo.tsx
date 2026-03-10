import React, { useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

interface LogoProps {
  size?: 'small' | 'medium' | 'large';
  onClick?: () => void;
}

const sizeConfig = {
  small: { dot: 9, gap: 3, fontSize: 14, dotGap: 3 },
  medium: { dot: 12, gap: 5, fontSize: 18, dotGap: 4 },
  large: { dot: 16, gap: 10, fontSize: 24, dotGap: 5 },
};

const Logo: React.FC<LogoProps> = ({ size = 'medium', onClick }) => {
  const config = sizeConfig[size];
  const { theme } = useTheme();
  const isDark = theme.mode === 'dark';
  const [hovered, setHovered] = useState(false);

  const dotStyle = (index: number): React.CSSProperties => ({
    width: config.dot,
    height: config.dot,
    borderRadius: '50%',
    backgroundColor: 'var(--theme-primary, #667eea)',
    transition: 'transform 0.3s ease, opacity 0.3s ease',
    transform: hovered ? `translateY(${Math.sin((index + 1) * 1.2) * -4}px) scale(1.15)` : 'translateY(0) scale(1)',
    animationName: hovered ? 'logoDotBounce' : 'none',
    animationDuration: '0.6s',
    animationDelay: `${index * 0.08}s`,
    animationTimingFunction: 'ease',
    animationFillMode: 'both',
  });

  return (
    <>
      <style>{`
        @keyframes logoDotBounce {
          0% { transform: translateY(0) scale(1); }
          30% { transform: translateY(-5px) scale(1.2); }
          50% { transform: translateY(1px) scale(0.95); }
          70% { transform: translateY(-2px) scale(1.05); }
          100% { transform: translateY(0) scale(1); }
        }
        @keyframes logoTextSlide {
          0% { opacity: 0.7; letter-spacing: 0.15em; }
          50% { opacity: 1; letter-spacing: 0.25em; }
          100% { opacity: 1; letter-spacing: 0.15em; }
        }
      `}</style>
      <div
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: config.gap,
          cursor: onClick ? 'pointer' : 'default',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: config.dotGap }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={dotStyle(i)} />
          ))}
        </div>
        <span
          style={{
            fontSize: config.fontSize,
            fontWeight: 900,
            color: isDark ? '#ffffff' : '#374151',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            letterSpacing: '0.15em',
            transition: 'letter-spacing 0.4s ease, opacity 0.3s ease',
            animation: hovered ? 'logoTextSlide 0.5s ease both' : 'none',
          }}
        >
          CRAFT
        </span>
      </div>
    </>
  );
};

export default Logo;
