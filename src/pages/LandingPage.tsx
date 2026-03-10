import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="bg-zinc-950 min-h-screen flex items-center justify-center px-8">
      <div className="text-center">
        {/* Logo */}
        <motion.div
          className="flex justify-center mb-10"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <img
            src="/images/ttt_logo/tttlogo4.png"
            alt="think thing thank"
            className="h-16 sm:h-20 md:h-24 lg:h-28 w-auto"
          />
        </motion.div>

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
