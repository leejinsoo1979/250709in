import { useNavigate } from 'react-router-dom';
import { ShimmerText } from '@/components/ui/shimmer-text';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="bg-zinc-950 min-h-screen flex items-center justify-center px-8">
      <div className="text-center">
        {/* Three Dots + think thing thank */}
        <div className="flex items-center justify-center gap-6 mb-10">
          <div className="flex items-center gap-3">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-10 h-10 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-full bg-white"
                initial={{ scale: 0, opacity: 0 }}
                animate={{
                  scale: 1,
                  opacity: 1,
                  y: [0, -12, 0],
                }}
                transition={{
                  scale: { duration: 0.5, delay: i * 0.15, ease: "easeOut" },
                  opacity: { duration: 0.5, delay: i * 0.15, ease: "easeOut" },
                  y: {
                    duration: 0.5,
                    delay: 0.8 + i * 0.1,
                    repeat: Infinity,
                    repeatDelay: 0.2,
                    ease: "easeInOut",
                  },
                }}
              />
            ))}
          </div>
          <ShimmerText
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white"
            duration={2}
            delay={1}
          >
            think thing thank
          </ShimmerText>
        </div>

        {/* craft */}
        <motion.h1
          className="text-6xl sm:text-7xl md:text-8xl lg:text-[10rem] font-black text-white tracking-tighter leading-normal mb-12 overflow-visible"
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
