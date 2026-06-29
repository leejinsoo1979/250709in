import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

interface LogoProps {
  size?: 'small' | 'medium' | 'large';
  onClick?: () => void;
  loading?: boolean;
  noAnimation?: boolean;
}

// lllll 로고(세로선 6개) 높이(px) + 텍스트 폰트 크기
const sizeConfig = {
  small: { bars: 11, gap: 6, fontSize: 15 },
  medium: { bars: 13, gap: 7, fontSize: 18 },
  large: { bars: 15, gap: 8, fontSize: 21 },
};

// mmmlogo.svg 의 세로선 x 좌표 (viewBox 0 0 70.97 22.87)
const BAR_X = [68.97, 55.58, 42.18, 28.79, 15.39, 2];

const Logo: React.FC<LogoProps> = ({ size = 'medium', onClick, loading = false, noAnimation = false }) => {
  const config = sizeConfig[size];
  const { theme } = useTheme();
  const isDark = theme.mode === 'dark';
  const [hovered, setHovered] = useState(false);
  const [autoAnimating, setAutoAnimating] = useState(false);
  const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 3초마다 자동 애니메이션 (loading 모드가 아니고 noAnimation이 아닐 때만)
  useEffect(() => {
    if (loading || noAnimation) return;
    autoTimerRef.current = setInterval(() => {
      setAutoAnimating(true);
      setTimeout(() => setAutoAnimating(false), 700);
    }, 4000);

    return () => {
      if (autoTimerRef.current) clearInterval(autoTimerRef.current);
    };
  }, [loading, noAnimation]);

  const isAnimating = noAnimation ? false : (loading || hovered || autoAnimating);
  const color = isDark ? '#ffffff' : '#374151';

  return (
    <>
      <style>{`
        @keyframes logoTextSlide {
          0% { opacity: 0.7; letter-spacing: 0.1em; }
          50% { opacity: 1; letter-spacing: 0.18em; }
          100% { opacity: 1; letter-spacing: 0.1em; }
        }
        @keyframes logoLoadingText {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        @keyframes logoBarPulse {
          0%, 100% { transform: scaleY(0.5); opacity: 0.5; }
          50% { transform: scaleY(1); opacity: 1; }
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
        <svg
          viewBox="0 0 70.97 22.87"
          style={{ height: config.bars, width: 'auto', display: 'block' }}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeMiterlimit={10}
          aria-hidden="true"
        >
          {BAR_X.map((x, i) => (
            <line
              key={i}
              x1={x}
              y1="22.87"
              x2={x}
              y2="0"
              style={{
                transformBox: 'fill-box',
                transformOrigin: 'bottom',
                animation: loading
                  ? `logoBarPulse 1.2s ease-in-out ${i * 0.12}s infinite`
                  : 'none',
              }}
            />
          ))}
        </svg>
        <span
          style={{
            fontSize: config.fontSize,
            fontWeight: 700,
            color,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            letterSpacing: '0.1em',
            whiteSpace: 'nowrap',
            transition: 'letter-spacing 0.4s ease, opacity 0.3s ease',
            animation: loading
              ? 'logoLoadingText 2s ease-in-out infinite'
              : isAnimating ? 'logoTextSlide 0.5s ease both' : 'none',
          }}
        >
          mmmcraft
        </span>
      </div>
    </>
  );
};

export default Logo;
