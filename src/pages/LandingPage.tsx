import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useAnimation } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useResponsive } from '@/hooks/useResponsive';
import { isSketchUpEnvironment } from '@/editor/shared/utils/sketchupBridge';

export default function LandingPage() {
  const navigate = useNavigate();
  const { theme, toggleMode } = useTheme();
  const isDark = theme.mode === 'dark';
  const { isMobile, isTouchDevice } = useResponsive();

  // SketchUp HtmlDialog 환경에서는 랜딩페이지를 표시하지 않고
  // 즉시 SketchUp 전용 대시보드로 이동 (대시보드가 알아서 로그인 화면으로 보냄)
  useEffect(() => {
    if (isSketchUpEnvironment()) {
      navigate('/sketchup', { replace: true });
    }
  }, [navigate]);

  // CRAFT 애니메이션 상태
  const [craftAnimating, setCraftAnimating] = useState(false);
  // 호버 상태
  const [craftHovered, setCraftHovered] = useState(false);
  const [buttonHovered, setButtonHovered] = useState(false);

  const craftControls = useAnimation();

  // Custom dot cursor
  const containerRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const [cursorOnInteractive, setCursorOnInteractive] = useState(false);

  useEffect(() => {
    if (isTouchDevice) return; // 터치 기기에서는 커서 비활성화

    const container = containerRef.current;
    const cursor = cursorRef.current;
    if (!container || !cursor) return;

    const handleMouseMove = (e: MouseEvent) => {
      cursor.style.left = `${e.clientX}px`;
      cursor.style.top = `${e.clientY}px`;
      if (cursor.style.opacity !== '1') {
        cursor.style.opacity = '1';
      }
    };

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const interactive = target.closest('button, a, [role="button"], .cursor-pointer');
      setCursorOnInteractive(!!interactive);
    };

    const handleMouseLeave = () => {
      cursor.style.opacity = '0';
    };

    const handleMouseEnter = () => {
      cursor.style.opacity = '1';
    };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseover', handleMouseOver);
    container.addEventListener('mouseleave', handleMouseLeave);
    container.addEventListener('mouseenter', handleMouseEnter);

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseover', handleMouseOver);
      container.removeEventListener('mouseleave', handleMouseLeave);
      container.removeEventListener('mouseenter', handleMouseEnter);
    };
  }, [isTouchDevice]);

  // CRAFT: 4초 간격 자동 애니메이션 (ttt와 엇갈리게)
  useEffect(() => {
    const timeout = setTimeout(() => {
      const interval = setInterval(() => {
        setCraftAnimating(true);
        setTimeout(() => setCraftAnimating(false), 2000);
      }, 4000);
      return () => clearInterval(interval);
    }, 1500);
    return () => clearTimeout(timeout);
  }, []);

  // CRAFT 호버 시 파워풀한 스케일 펀치
  const handleCraftHover = useCallback(() => {
    setCraftHovered(true);
    setCraftAnimating(true);
    craftControls.start({
      scale: [1, 1.03, 1],
      transition: { duration: 0.5, ease: 'easeOut' },
    });
  }, [craftControls]);

  const handleCraftLeave = useCallback(() => {
    setCraftHovered(false);
    setTimeout(() => setCraftAnimating(false), 800);
  }, []);
  const handleCraftTap = useCallback(() => {
    setCraftAnimating(true);
    craftControls.start({
      scale: [1, 1.03, 1],
      transition: { duration: 0.5, ease: 'easeOut' },
    });
    setTimeout(() => setCraftAnimating(false), 2000);
  }, [craftControls]);

  const isCraftActive = craftAnimating || craftHovered || buttonHovered;

  return (
    <div
      ref={containerRef}
      className={`${isDark ? 'bg-zinc-950' : 'bg-white'} min-h-screen flex flex-col transition-colors duration-300`}
      style={{ cursor: isTouchDevice ? 'auto' : 'none' }}
      data-landing-cursor={!isTouchDevice ? '' : undefined}
    >
      {/* Hide native cursor on all child elements (desktop only) */}
      {!isTouchDevice && (
        <style>{`
          [data-landing-cursor] * { cursor: none !important; }
        `}</style>
      )}
      {/* Custom Dot Cursor (desktop only) */}
      {!isTouchDevice && (
        <div
          ref={cursorRef}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            pointerEvents: 'none',
            zIndex: 9999,
            transform: 'translate(-50%, -50%)',
            transition: 'width 0.2s ease, height 0.2s ease, background 0.2s ease, box-shadow 0.2s ease',
            borderRadius: '50%',
            width: cursorOnInteractive ? '40px' : '20px',
            height: cursorOnInteractive ? '40px' : '20px',
            background: cursorOnInteractive
              ? 'transparent'
              : isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.85)',
            boxShadow: cursorOnInteractive
              ? isDark
                ? 'inset 0 0 0 2px rgba(255,255,255,0.7)'
                : 'inset 0 0 0 2px rgba(0,0,0,0.6)'
              : 'none',
            opacity: 0,
          }}
        />
      )}
      {/* Header */}
      <header className={`flex items-center justify-between ${isMobile ? 'px-4 py-3' : 'px-8 sm:px-12 py-5'}`}>
        <div
          className="flex items-center gap-1.5 cursor-pointer"
          onClick={() => navigate('/')}
        >
          <svg
            viewBox="0 0 70.97 22.87"
            className={`${isDark ? 'text-white' : 'text-zinc-900'} h-3.5 w-auto`}
            fill="none"
            stroke="currentColor"
            strokeWidth={4}
            strokeMiterlimit={10}
            aria-hidden="true"
          >
            {[68.97, 55.58, 42.18, 28.79, 15.39, 2].map((x, i) => (
              <line key={`hbar-${i}`} x1={x} y1="22.87" x2={x} y2="0" />
            ))}
          </svg>
          <span className={`${isDark ? 'text-white' : 'text-zinc-900'} font-bold text-sm sm:text-base ml-1.5`}>made make material</span>
        </div>
        <div className={`flex items-center ${isMobile ? 'gap-2' : 'gap-3'}`}>
          <button
            onClick={toggleMode}
            className={`p-2 rounded-full transition-colors ${isDark ? 'text-white hover:bg-white/10' : 'text-zinc-900 hover:bg-zinc-100'}`}
          >
            {isDark ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <button
            className={`bg-transparent font-semibold rounded-full border transition-colors ${isMobile ? 'text-xs px-3 py-1.5' : 'text-sm px-6 py-2'} ${isDark ? 'text-white border-white hover:bg-white/10' : 'text-zinc-900 border-zinc-900 hover:bg-zinc-100'}`}
            onClick={() => navigate('/login')}
          >
            Login
          </button>
          <button
            className={`font-semibold rounded-full transition-colors ${isMobile ? 'text-xs px-3 py-1.5' : 'text-sm px-6 py-2'} ${isDark ? 'bg-white text-zinc-950 hover:bg-zinc-200' : 'bg-zinc-900 text-white hover:bg-zinc-700'}`}
            onClick={() => navigate('/signup')}
          >
            Sign up
          </button>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-8">
      <div className="text-center">
        {/* lllll made make material */}
        <div className="flex items-center justify-center gap-3 sm:gap-4 mb-6">
          {/* lllll 로고 (세로선 6개) — 등장 애니메이션 */}
          <svg
            viewBox="0 0 70.97 22.87"
            className={`${isDark ? 'text-white' : 'text-zinc-900'} h-5 sm:h-6 md:h-7 lg:h-8 w-auto`}
            fill="none"
            stroke="currentColor"
            strokeWidth={4}
            strokeMiterlimit={10}
            aria-hidden="true"
          >
            {[68.97, 55.58, 42.18, 28.79, 15.39, 2].map((x, i) => (
              <motion.line
                key={`bar-${i}`}
                x1={x}
                y1="22.87"
                x2={x}
                y2="0"
                initial={{ scaleY: 0, opacity: 0 }}
                style={{ transformBox: 'fill-box', transformOrigin: 'bottom' }}
                animate={{ scaleY: 1, opacity: 1 }}
                transition={{
                  scaleY: { duration: 0.45, delay: i * 0.06, ease: 'easeOut' },
                  opacity: { duration: 0.4, delay: i * 0.06 },
                }}
              />
            ))}
          </svg>
          {/* made make material 텍스트 — 글자 순차 등장 (타이핑) */}
          <motion.span
            className={`${isDark ? 'text-white' : 'text-zinc-900'} font-bold text-2xl sm:text-3xl md:text-4xl lg:text-5xl tracking-wide ml-2`}
            style={{ display: 'inline-flex' }}
          >
            {'made make material'.split('').map((char, i) => (
              <motion.span
                key={i}
                style={{ display: 'inline-block', whiteSpace: char === ' ' ? 'pre' : undefined }}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.3 + i * 0.045, ease: 'easeOut' }}
                whileHover={{ y: -6, scale: 1.15, transition: { duration: 0.12 } }}
              >
                {char === ' ' ? '\u00A0' : char}
              </motion.span>
            ))}
          </motion.span>
        </div>

        {/* CRAFT — 역동적 개별 글자 애니메이션 */}
        <motion.div
          className="mb-12 cursor-pointer"
          {...(isTouchDevice
            ? { onClick: handleCraftTap }
            : { onMouseEnter: handleCraftHover, onMouseLeave: handleCraftLeave }
          )}
          animate={craftControls}
        >
          <motion.div
            className={`${isDark ? 'text-white' : 'text-zinc-900'} font-black text-6xl sm:text-7xl md:text-8xl lg:text-9xl tracking-tight`}
            style={{ display: 'inline-flex', gap: '0.02em' }}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3, ease: 'easeOut' }}
          >
            {'CRAFT'.split('').map((char, i) => (
              <motion.span
                key={i}
                style={{
                  display: 'inline-block',
                  textShadow: isCraftActive
                    ? isDark
                      ? '0 0 20px rgba(255,255,255,0.3), 0 0 60px rgba(255,255,255,0.1)'
                      : '0 0 20px rgba(0,0,0,0.12), 0 0 60px rgba(0,0,0,0.05)'
                    : 'none',
                  transition: 'text-shadow 0.4s ease',
                }}
                animate={{
                  y: isCraftActive ? [0, -10, 0] : 0,
                }}
                transition={{
                  y: isCraftActive
                    ? { duration: 1.4, delay: i * 0.07, times: [0, 0.3, 1], ease: 'easeInOut' }
                    : { duration: 0.3 },
                }}
                whileHover={{
                  y: -8,
                  transition: { duration: 0.2, ease: 'easeOut' },
                }}
              >
                {char}
              </motion.span>
            ))}
          </motion.div>
        </motion.div>

        {/* Start Design Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.0 }}
        >
          <Button
            size="lg"
            className={`rounded-full px-10 text-lg font-semibold min-h-[48px] ${isDark ? 'bg-white text-zinc-950 hover:bg-zinc-200' : 'bg-zinc-900 text-white hover:bg-zinc-700'}`}
            onClick={() => navigate('/dashboard')}
            onMouseEnter={() => setButtonHovered(true)}
            onMouseLeave={() => setButtonHovered(false)}
          >
            Start Design
          </Button>
        </motion.div>
      </div>
      </div>
    </div>
  );
}
