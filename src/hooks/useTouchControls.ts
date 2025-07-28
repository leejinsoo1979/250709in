import { useRef, useCallback, useEffect } from 'react';

interface TouchState {
  startX: number;
  startY: number;
  startDistance: number;
  lastX: number;
  lastY: number;
  touchCount: number;
}

interface UseTouchControlsOptions {
  onPinch?: (scale: number) => void;
  onRotate?: (angle: number) => void;
  onPan?: (deltaX: number, deltaY: number) => void;
  onSwipe?: (direction: 'left' | 'right' | 'up' | 'down') => void;
  onTap?: () => void;
  onDoubleTap?: () => void;
  onLongPress?: () => void;
  element?: HTMLElement | null;
}

export const useTouchControls = (options: UseTouchControlsOptions) => {
  const touchState = useRef<TouchState>({
    startX: 0,
    startY: 0,
    startDistance: 0,
    lastX: 0,
    lastY: 0,
    touchCount: 0,
  });

  const lastTapTime = useRef(0);
  const longPressTimer = useRef<NodeJS.Timeout>();

  // 두 터치 포인트 간 거리 계산
  const getTouchDistance = (touches: TouchList): number => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // 두 터치 포인트 간 각도 계산
  const getTouchAngle = (touches: TouchList): number => {
    if (touches.length < 2) return 0;
    const dx = touches[1].clientX - touches[0].clientX;
    const dy = touches[1].clientY - touches[0].clientY;
    return Math.atan2(dy, dx) * (180 / Math.PI);
  };

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touches = e.touches;
    touchState.current.touchCount = touches.length;

    if (touches.length === 1) {
      touchState.current.startX = touches[0].clientX;
      touchState.current.startY = touches[0].clientY;
      touchState.current.lastX = touches[0].clientX;
      touchState.current.lastY = touches[0].clientY;

      // 롱프레스 타이머 시작
      if (options.onLongPress) {
        longPressTimer.current = setTimeout(() => {
          options.onLongPress?.();
        }, 500);
      }
    } else if (touches.length === 2) {
      // 롱프레스 타이머 취소
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }
      
      touchState.current.startDistance = getTouchDistance(touches);
    }
  }, [options]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    const touches = e.touches;

    // 롱프레스 타이머 취소 (움직임 감지)
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }

    if (touches.length === 1 && touchState.current.touchCount === 1) {
      // 팬 제스처
      const deltaX = touches[0].clientX - touchState.current.lastX;
      const deltaY = touches[0].clientY - touchState.current.lastY;
      
      options.onPan?.(deltaX, deltaY);
      
      touchState.current.lastX = touches[0].clientX;
      touchState.current.lastY = touches[0].clientY;
    } else if (touches.length === 2) {
      // 핀치 제스처
      const currentDistance = getTouchDistance(touches);
      const scale = currentDistance / touchState.current.startDistance;
      
      options.onPinch?.(scale);
      
      touchState.current.startDistance = currentDistance;
    }
  }, [options]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    // 롱프레스 타이머 취소
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }

    const touches = e.changedTouches;
    if (touches.length === 1 && touchState.current.touchCount === 1) {
      const deltaX = touches[0].clientX - touchState.current.startX;
      const deltaY = touches[0].clientY - touchState.current.startY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      
      // 탭 감지 (이동 거리가 10px 미만)
      if (distance < 10) {
        const currentTime = Date.now();
        const timeDiff = currentTime - lastTapTime.current;
        
        if (timeDiff < 300) {
          // 더블탭
          options.onDoubleTap?.();
        } else {
          // 싱글탭
          options.onTap?.();
        }
        
        lastTapTime.current = currentTime;
      }
      // 스와이프 감지 (이동 거리가 50px 이상)
      else if (distance > 50) {
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);
        
        if (absX > absY) {
          // 수평 스와이프
          options.onSwipe?.(deltaX > 0 ? 'right' : 'left');
        } else {
          // 수직 스와이프
          options.onSwipe?.(deltaY > 0 ? 'down' : 'up');
        }
      }
    }
    
    touchState.current.touchCount = e.touches.length;
  }, [options]);

  useEffect(() => {
    const element = options.element || document;
    
    element.addEventListener('touchstart', handleTouchStart, { passive: false });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: false });
    
    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
      
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, options.element]);
};