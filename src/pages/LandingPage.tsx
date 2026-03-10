import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="bg-zinc-950 min-h-screen flex items-center justify-center px-8">
      <div className="text-center">
        {/* Dots Animation + Logo */}
        <div className="flex items-center justify-center gap-6 sm:gap-8 md:gap-10 mb-10">
          <div className="flex items-center gap-3 sm:gap-4 md:gap-5">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 lg:w-14 lg:h-14 rounded-full bg-white"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1, y: [0, -10, 0] }}
                transition={{
                  scale: { duration: 0.5, delay: i * 0.15, ease: "easeOut" },
                  opacity: { duration: 0.5, delay: i * 0.15, ease: "easeOut" },
                  y: { duration: 2, delay: 0.8 + i * 0.25, repeat: Infinity, ease: "easeInOut" },
                }}
              />
            ))}
          </div>
          <motion.span
            className="text-white font-extrabold text-2xl sm:text-3xl md:text-4xl lg:text-5xl tracking-normal"
            style={{ wordSpacing: '0.15em' }}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
          >
            think thing thank
          </motion.span>
        </div>

        {/* craft */}
        <motion.h1
          className="text-6xl sm:text-7xl md:text-8xl lg:text-[10rem] font-black text-white tracking-normal leading-normal mb-12 overflow-visible"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6, ease: "easeOut" }}
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
          >
            Start Design
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
