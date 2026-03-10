import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';

export default function LandingPage() {
  const navigate = useNavigate();
  const [dotsHovered, setDotsHovered] = useState(false);
  const [craftHovered, setCraftHovered] = useState(false);
  const [buttonHovered, setButtonHovered] = useState(false);
  const [textHovered, setTextHovered] = useState(false);

  const isAnimating = dotsHovered || craftHovered || buttonHovered || textHovered;

  return (
    <div className="bg-zinc-950 min-h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 sm:px-10 py-4">
        <img
          src="/images/ttt_logo/tttlogo.png"
          alt="think thing thank"
          className="h-6 sm:h-7 w-auto invert cursor-pointer"
          onClick={() => navigate('/')}
        />
        <div className="flex items-center">
          <Button
            variant="ghost"
            className="text-zinc-400 hover:text-white hover:bg-zinc-800 text-sm font-medium"
            onClick={() => navigate('/login')}
          >
            Sign in
          </Button>
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
                className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 lg:w-14 lg:h-14 rounded-full bg-white cursor-pointer"
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
                    ? { duration: 1.8, delay: i * 0.12, repeat: Infinity, times: [0, 0.15, 0.3, 1], ease: "easeInOut" }
                    : { duration: 0.3 },
                }}
              />
            ))}
          </div>
          <motion.span
            className="text-white font-extrabold text-2xl sm:text-3xl md:text-4xl lg:text-5xl tracking-normal cursor-pointer"
            style={{ wordSpacing: '0.15em', display: 'inline-flex' }}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
            onMouseEnter={() => setTextHovered(true)}
            onMouseLeave={() => setTextHovered(false)}
          >
            {'think thing thank'.split('').map((char, i) => (
              <motion.span
                key={i}
                style={{ display: 'inline-block', whiteSpace: char === ' ' ? 'pre' : undefined }}
                animate={{
                  y: isAnimating ? [0, -8, 0, 0] : 0,
                }}
                transition={{
                  y: isAnimating
                    ? { duration: 1.8, delay: i * 0.04, repeat: Infinity, times: [0, 0.15, 0.3, 1], ease: "easeInOut" }
                    : { duration: 0.3 },
                }}
              >
                {char}
              </motion.span>
            ))}
          </motion.span>
        </div>

        {/* craft */}
        <motion.h1
          className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black text-white tracking-normal leading-normal mb-12 overflow-visible cursor-pointer transition-all duration-300"
          style={{
            textShadow: isAnimating
              ? '0 0 20px rgba(255,255,255,0.4), 0 0 60px rgba(255,255,255,0.2), 0 0 100px rgba(255,255,255,0.1)'
              : 'none',
          }}
          initial={{ opacity: 0, y: 40 }}
          animate={{
            opacity: 1,
            y: 0,
            scale: isAnimating ? 1.05 : 1,
            letterSpacing: isAnimating ? '0.05em' : '0em',
          }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          onMouseEnter={() => setCraftHovered(true)}
          onMouseLeave={() => setCraftHovered(false)}
        >
          craft
        </motion.h1>

        {/* Start Design Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.0 }}
        >
          <Button
            size="lg"
            className="bg-white text-zinc-950 hover:bg-zinc-200 rounded-full px-10 text-lg font-semibold"
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
