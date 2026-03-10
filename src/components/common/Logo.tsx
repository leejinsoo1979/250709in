import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

interface LogoProps {
  size?: 'small' | 'medium' | 'large';
  onClick?: () => void;
  loading?: boolean;
}

const sizeConfig = {
  small: { dot: 9, gap: 3, fontSize: 14, dotGap: 3 },
  medium: { dot: 12, gap: 5, fontSize: 18, dotGap: 4 },
  large: { dot: 13, gap: 8, fontSize: 20, dotGap: 4 },
};

const Logo: React.FC<LogoProps> = ({ size = 'medium', onClick, loading = false }) => {
  const config = sizeConfig[size];
  const { theme } = useTheme();
  const isDark = theme.mode === 'dark';
  const [hovered, setHovered] = useState(false);
  const [autoAnimating, setAutoAnimating] = useState(false);
  const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 3초마다 자동 애니메이션 (loading 모드가 아닐 때만)
  useEffect(() => {
    if (loading) return;
    autoTimerRef.current = setInterval(() => {
      setAutoAnimating(true);
      setTimeout(() => setAutoAnimating(false), 700);
    }, 3000);

    return () => {
      if (autoTimerRef.current) clearInterval(autoTimerRef.current);
    };
  }, [loading]);

  const isAnimating = loading || hovered || autoAnimating;

  const dotStyle = (index: number): React.CSSProperties => {
    if (loading) {
      return {
        width: config.dot,
        height: config.dot,
        borderRadius: '50%',
        backgroundColor: 'var(--theme-primary, #667eea)',
        animation: 'logoLoadingDot 1.4s ease-in-out infinite',
        animationDelay: `${index * 0.15}s`,
      };
    }
    return {
      width: config.dot,
      height: config.dot,
      borderRadius: '50%',
      backgroundColor: 'var(--theme-primary, #667eea)',
      transition: 'transform 0.3s ease, opacity 0.3s ease',
      transform: isAnimating ? `translateY(${Math.sin((index + 1) * 1.2) * -4}px) scale(1.15)` : 'translateY(0) scale(1)',
      animationName: isAnimating ? 'logoDotBounce' : 'none',
      animationDuration: '0.6s',
      animationDelay: `${index * 0.08}s`,
      animationTimingFunction: 'ease',
      animationFillMode: 'both',
    };
  };

  const textAnimation = loading
    ? 'logoLoadingText 2s ease-in-out infinite'
    : isAnimating ? 'logoTextSlide 0.5s ease both' : 'none';

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
        @keyframes logoLoadingDot {
          0%, 100% { transform: translateY(0) scale(1); opacity: 0.4; }
          50% { transform: translateY(-8px) scale(1.2); opacity: 1; }
        }
        @keyframes logoLoadingText {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
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
            animation: textAnimation,
          }}
        >
          CRAFT
        </span>
      </div>
    </>
  );
};

export default Logo;
