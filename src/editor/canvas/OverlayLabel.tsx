import React, { useEffect, useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

interface OverlayLabelProps {
  stageRef: React.RefObject<any>;
  x: number;
  y: number;
  text: string;
  rotateDeg?: number;
}

const OverlayLabel: React.FC<OverlayLabelProps> = ({ 
  stageRef, 
  x, 
  y, 
  text, 
  rotateDeg = -90 
}) => {
  const { theme } = useTheme();
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const updatePosition = () => {
      if (!stageRef.current) return;

      const stage = stageRef.current;
      const stagePosition = stage.position();
      const stageScale = stage.scaleX(); // scaleX === scaleY in uniform scaling

      // Calculate screen position based on stage transform
      const screenX = x * stageScale + stagePosition.x;
      const screenY = y * stageScale + stagePosition.y;

      setPosition({ x: screenX, y: screenY });
      setScale(stageScale);
    };

    // Initial position
    updatePosition();

    // Listen to stage events
    const stage = stageRef.current;
    if (stage) {
      stage.on('dragmove', updatePosition);
      stage.on('wheel', updatePosition);
      stage.on('scaleChange', updatePosition);
      stage.on('positionChange', updatePosition);

      // Cleanup
      return () => {
        stage.off('dragmove', updatePosition);
        stage.off('wheel', updatePosition);
        stage.off('scaleChange', updatePosition);
        stage.off('positionChange', updatePosition);
      };
    }
  }, [stageRef, x, y]);

  const backgroundColor = theme?.mode === 'dark' 
    ? 'rgba(0, 0, 0, 0.85)' 
    : 'rgba(255, 255, 255, 0.9)';

  const textColor = theme?.mode === 'dark'
    ? '#ffffff'
    : '#333333';

  const borderColor = theme?.mode === 'dark'
    ? 'rgba(255, 255, 255, 0.3)'
    : 'rgba(0, 0, 0, 0.2)';

  return (
    <div
      style={{
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: `rotate(${rotateDeg}deg) scale(${scale})`,
        transformOrigin: 'center',
        pointerEvents: 'none',
        backgroundColor,
        color: textColor,
        border: `1px solid ${borderColor}`,
        borderRadius: '4px',
        padding: '4px 8px',
        fontSize: '12px',
        fontWeight: 'bold',
        fontFamily: 'monospace',
        whiteSpace: 'nowrap',
        zIndex: 1000,
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.15)',
      }}
    >
      {text}
    </div>
  );
};

export default OverlayLabel;