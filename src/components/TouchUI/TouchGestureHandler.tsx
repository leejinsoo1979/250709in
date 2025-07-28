import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTouchControls } from '@/hooks/useTouchControls';

interface TouchGestureHandlerProps {
  children: React.ReactNode;
  onPinch?: (scale: number) => void;
  onRotate?: (angle: number) => void;
  onPan?: (deltaX: number, deltaY: number) => void;
  onSwipe?: (direction: 'left' | 'right' | 'up' | 'down', velocity: number) => void;
  onTap?: () => void;
  onDoubleTap?: () => void;
  onLongPress?: () => void;
  onFlick?: (direction: 'left' | 'right' | 'up' | 'down', velocity: number) => void;
  enableInertia?: boolean;
  enableHapticFeedback?: boolean;
  sensitivity?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const TouchGestureHandler: React.FC<TouchGestureHandlerProps> = ({
  children,
  onPinch,
  onRotate,
  onPan,
  onSwipe,
  onTap,
  onDoubleTap,
  onLongPress,
  onFlick,
  enableInertia = true,
  enableHapticFeedback = false,
  sensitivity = 1.0,
  className,
  style
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isGestureActive, setIsGestureActive] = useState(false);

  // 터치 컨트롤 설정
  useTouchControls({
    element: containerRef.current,
    onPinch,
    onRotate,
    onPan: (deltaX, deltaY) => {
      setIsGestureActive(true);
      onPan?.(deltaX, deltaY);
    },
    onSwipe,
    onTap: () => {
      triggerHapticFeedback();
      onTap?.();
    },
    onDoubleTap: () => {
      triggerHapticFeedback();
      onDoubleTap?.();
    },
    onLongPress: () => {
      triggerHapticFeedback();
      onLongPress?.();
    },
    onFlick,
    enableInertia,
    enableHapticFeedback,
    sensitivity,
    preventDefault: true
  });

  // 햅틱 피드백
  const triggerHapticFeedback = useCallback(() => {
    if (!enableHapticFeedback) return;
    
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
  }, [enableHapticFeedback]);

  // 제스처 종료 시 상태 리셋
  useEffect(() => {
    if (isGestureActive) {
      const timer = setTimeout(() => {
        setIsGestureActive(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isGestureActive]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        ...style,
        touchAction: 'none', // 기본 터치 동작 방지
        userSelect: 'none', // 텍스트 선택 방지
        WebkitUserSelect: 'none',
        cursor: isGestureActive ? 'grabbing' : 'grab'
      }}
    >
      {children}
    </div>
  );
}; 