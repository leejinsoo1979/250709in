import React from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import styles from './AnimatedCard.module.css';

interface AnimatedCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  delay?: number;
  hover?: boolean;
  glow?: boolean;
}

const AnimatedCard: React.FC<AnimatedCardProps> = ({
  children,
  className,
  onClick,
  delay = 0,
  hover = true,
  glow = false
}) => {
  return (
    <motion.div
      className={clsx(styles.card, glow && styles.glow, className)}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ 
        duration: 0.4, 
        delay, 
        ease: [0.4, 0, 0.2, 1] 
      }}
      whileHover={hover ? { 
        y: -4, 
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)',
        transition: { duration: 0.2 }
      } : undefined}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      onClick={onClick}
    >
      {children}
    </motion.div>
  );
};

export default AnimatedCard;