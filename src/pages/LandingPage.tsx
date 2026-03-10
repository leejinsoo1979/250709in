import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useAnimation } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

export default function LandingPage() {
  const navigate = useNavigate();
  const { theme, toggleMode } = useTheme();
  const isDark = theme.mode === 'dark';

  // think thing thank 애니메이션 상태
  const [tttAnimating, setTttAnimating] = useState(false);
  // CRAFT 애니메이션 상태
  const [craftAnimating, setCraftAnimating] = useState(false);
  // 호버 상태
  const [tttHovered, setTttHovered] = useState(false);
  const [craftHovered, setCraftHovered] = useState(false);
  const [buttonHovered, setButtonHovered] = useState(false);

  const craftControls = useAnimation();

  // think thing thank: 3초 간격 자동 애니메이션
  useEffect(() => {
    const interval = setInterval(() => {
      setTttAnimating(true);
      setTimeout(() => setTttAnimating(false), 1600);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

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
      scale: [1, 1.08, 1],
      transition: { duration: 0.4, ease: 'easeOut' },
    });
  }, [craftControls]);

  const handleCraftLeave = useCallback(() => {
    setCraftHovered(false);
    setTimeout(() => setCraftAnimating(false), 800);
  }, []);

  // ttt 호버
  const handleTttHover = () => {
    setTttHovered(true);
    setTttAnimating(true);
  };
  const handleTttLeave = () => {
    setTttHovered(false);
    setTimeout(() => setTttAnimating(false), 800);
  };

  const isTttActive = tttAnimating || tttHovered;
  const isCraftActive = craftAnimating || craftHovered || buttonHovered;

  return (
    <div className={`${isDark ? 'bg-zinc-950' : 'bg-white'} min-h-screen flex flex-col transition-colors duration-300`}>
      {/* Header */}
      <header className="flex items-center justify-between px-8 sm:px-12 py-5">
        <div
          className="flex items-center gap-1.5 cursor-pointer"
          onClick={() => navigate('/')}
        >
          <div className="flex items-center gap-1">
            <div className={`w-3.5 h-3.5 rounded-full ${isDark ? 'bg-white' : 'bg-zinc-900'}`} />
            <div className={`w-3.5 h-3.5 rounded-full ${isDark ? 'bg-white' : 'bg-zinc-900'}`} />
            <div className={`w-3.5 h-3.5 rounded-full ${isDark ? 'bg-white' : 'bg-zinc-900'}`} />
          </div>
          <span className={`${isDark ? 'text-white' : 'text-zinc-900'} font-black text-lg ml-1`}>CRAFT</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleMode}
            className={`p-2 rounded-full transition-colors ${isDark ? 'text-white hover:bg-white/10' : 'text-zinc-900 hover:bg-zinc-100'}`}
          >
            {isDark ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <button
            className={`bg-transparent text-sm font-semibold rounded-full px-6 py-2 border transition-colors ${isDark ? 'text-white border-white hover:bg-white/10' : 'text-zinc-900 border-zinc-900 hover:bg-zinc-100'}`}
            onClick={() => navigate('/login')}
          >
            Login
          </button>
          <button
            className={`text-sm font-semibold rounded-full px-6 py-2 transition-colors ${isDark ? 'bg-white text-zinc-950 hover:bg-zinc-200' : 'bg-zinc-900 text-white hover:bg-zinc-700'}`}
            onClick={() => navigate('/signup')}
          >
            Sign up
          </button>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-8">
      <div className="text-center">
        {/* ... think thing thank */}
        <div
          className="flex items-center justify-center gap-3 sm:gap-4 mb-6 cursor-pointer"
          onMouseEnter={handleTttHover}
          onMouseLeave={handleTttLeave}
        >
          {/* 3 dots — 순차 팝 애니메이션 */}
          {[0, 1, 2].map((i) => (
            <motion.div
              key={`dot-${i}`}
              className={`w-6 h-6 sm:w-7 sm:h-7 md:w-9 md:h-9 lg:w-10 lg:h-10 rounded-full ${isDark ? 'bg-white' : 'bg-zinc-900'}`}
              initial={{ scale: 0, opacity: 0 }}
              animate={{
                scale: isTttActive ? [1, 1.3, 0.9, 1] : 1,
                opacity: 1,
              }}
              transition={{
                scale: isTttActive
                  ? { duration: 0.8, delay: i * 0.12, times: [0, 0.3, 0.6, 1], ease: 'easeOut' }
                  : { duration: 0.5, delay: i * 0.1, ease: 'easeOut' },
                opacity: { duration: 0.4, delay: i * 0.1 },
              }}
              whileHover={{ scale: 1.4, transition: { duration: 0.15 } }}
            />
          ))}
          {/* think thing thank 텍스트 — 글자별 웨이브 */}
          <motion.span
            className={`${isDark ? 'text-white' : 'text-zinc-900'} font-black text-2xl sm:text-3xl md:text-4xl lg:text-5xl tracking-wide ml-2`}
            style={{ display: 'inline-flex' }}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2, ease: 'easeOut' }}
          >
            {'think thing thank'.split('').map((char, i) => (
              <motion.span
                key={i}
                style={{ display: 'inline-block', whiteSpace: char === ' ' ? 'pre' : undefined }}
                animate={{
                  y: isTttActive ? [0, -8, 2, 0] : 0,
                  opacity: isTttActive ? [1, 1, 0.7, 1] : 1,
                }}
                transition={{
                  y: isTttActive
                    ? { duration: 1.2, delay: 0.3 + i * 0.035, times: [0, 0.25, 0.5, 1], ease: 'easeInOut' }
                    : { duration: 0.3 },
                  opacity: isTttActive
                    ? { duration: 1.2, delay: 0.3 + i * 0.035, times: [0, 0.25, 0.5, 1] }
                    : { duration: 0.3 },
                }}
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
          onMouseEnter={handleCraftHover}
          onMouseLeave={handleCraftLeave}
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
                      ? '0 0 30px rgba(255,255,255,0.5), 0 0 80px rgba(255,255,255,0.25)'
                      : '0 0 30px rgba(0,0,0,0.2), 0 0 80px rgba(0,0,0,0.1)'
                    : 'none',
                  transition: 'text-shadow 0.3s ease',
                }}
                animate={{
                  y: isCraftActive ? [0, -20, 4, -8, 0] : 0,
                  rotateZ: isCraftActive ? [0, -6, 4, -2, 0] : 0,
                  scale: isCraftActive ? [1, 1.1, 0.95, 1.03, 1] : 1,
                }}
                transition={{
                  y: isCraftActive
                    ? { duration: 1.2, delay: i * 0.08, times: [0, 0.2, 0.45, 0.7, 1], ease: 'easeOut' }
                    : { duration: 0.3 },
                  rotateZ: isCraftActive
                    ? { duration: 1.2, delay: i * 0.08, times: [0, 0.2, 0.45, 0.7, 1], ease: 'easeOut' }
                    : { duration: 0.3 },
                  scale: isCraftActive
                    ? { duration: 1.2, delay: i * 0.08, times: [0, 0.2, 0.45, 0.7, 1], ease: 'easeOut' }
                    : { duration: 0.3 },
                }}
                whileHover={{
                  y: -16,
                  scale: 1.2,
                  rotateZ: [-3, 3, 0],
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
            className={`rounded-full px-10 text-lg font-semibold ${isDark ? 'bg-white text-zinc-950 hover:bg-zinc-200' : 'bg-zinc-900 text-white hover:bg-zinc-700'}`}
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
