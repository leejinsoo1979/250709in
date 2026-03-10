import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

export default function LandingPage() {
  const navigate = useNavigate();
  const { theme, toggleMode } = useTheme();
  const isDark = theme.mode === 'dark';
  const [dotsHovered, setDotsHovered] = useState(false);
  const [buttonHovered, setButtonHovered] = useState(false);
  const [textHovered, setTextHovered] = useState(false);
  const [autoAnimate, setAutoAnimate] = useState(false);

  const isAnimating = dotsHovered || buttonHovered || textHovered || autoAnimate;

  // 2초 간격 자동 애니메이션
  useEffect(() => {
    const interval = setInterval(() => {
      setAutoAnimate(true);
      setTimeout(() => setAutoAnimate(false), 1800);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

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
        {/* Dots + Logo */}
        <div className="flex items-center justify-center gap-6 sm:gap-8 md:gap-10 mb-10">
          <div
            className="flex items-center gap-3 sm:gap-4 md:gap-5"
            onMouseEnter={() => setDotsHovered(true)}
            onMouseLeave={() => setDotsHovered(false)}
          >
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className={`w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 lg:w-14 lg:h-14 rounded-full ${isDark ? 'bg-white' : 'bg-zinc-900'} cursor-pointer`}
                initial={{ scale: 0, opacity: 0 }}
                animate={{
                  scale: 1,
                  opacity: 1,
                  y: isAnimating ? [0, -16, 0, 0] : 0,
                }}
                transition={{
                  scale: { duration: 0.5, delay: i * 0.15, ease: "easeOut" },
                  opacity: { duration: 0.5, delay: i * 0.15, ease: "easeOut" },
                  y: isAnimating
                    ? { duration: 1.8, delay: i * 0.12, times: [0, 0.15, 0.3, 1], ease: "easeInOut" }
                    : { duration: 0.3 },
                }}
              />
            ))}
          </div>
          <motion.span
            className={`${isDark ? 'text-white' : 'text-zinc-900'} font-black text-5xl sm:text-6xl md:text-7xl lg:text-8xl tracking-normal cursor-pointer`}
            style={{ display: 'inline-flex' }}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
            onMouseEnter={() => setTextHovered(true)}
            onMouseLeave={() => setTextHovered(false)}
          >
            {'CRAFT'.split('').map((char, i) => (
              <motion.span
                key={i}
                style={{
                  display: 'inline-block',
                  textShadow: isAnimating
                    ? isDark
                      ? '0 0 20px rgba(255,255,255,0.4), 0 0 60px rgba(255,255,255,0.2), 0 0 100px rgba(255,255,255,0.1)'
                      : '0 0 20px rgba(0,0,0,0.15), 0 0 60px rgba(0,0,0,0.08), 0 0 100px rgba(0,0,0,0.04)'
                    : 'none',
                }}
                animate={{
                  y: isAnimating ? [0, -12, 0, 0] : 0,
                }}
                transition={{
                  y: isAnimating
                    ? { duration: 1.8, delay: i * 0.06, times: [0, 0.15, 0.3, 1], ease: "easeInOut" }
                    : { duration: 0.3 },
                }}
              >
                {char}
              </motion.span>
            ))}
          </motion.span>
        </div>

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
