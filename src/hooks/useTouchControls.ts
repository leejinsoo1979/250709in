import { useCallback, useEffect, useRef } from 'react';

interface TouchState {
  startX: number;
  startY: number;
  startDistance: number;
  lastX: number;
  lastY: number;
  touchCount: number;
  startTime: number;
  velocity: { x: number; y: number };
}

interface UseTouchControlsOptions {
  onPinch?: (scale: number) => void;
  onRotate?: (angle: number) => void;
  onPan?: (deltaX: number, deltaY: number) => void;
  onSwipe?: (direction: 'left' | 'right' | 'up' | 'down', velocity: number) => void;
  onTap?: () => void;
  onDoubleTap?: () => void;
  onLongPress?: () => void;
  onFlick?: (direction: 'left' | 'right' | 'up' | 'down', velocity: number) => void;
  element?: HTMLElement | null;
  // 추가된 옵션들
  enableInertia?: boolean; // 관성 스크롤
  enableHapticFeedback?: boolean; // 햅틱 피드백
  sensitivity?: number; // 터치 민감도 (기본값: 1.0)
  preventDefault?: boolean; // 기본 동작 방지
}

export const useTouchControls = (options: UseTouchControlsOptions) => {
  const {
    enableInertia = true,
    enableHapticFeedback = false,
    sensitivity = 1.0,
    preventDefault = true
  } = options;

  const touchState = useRef<TouchState>({
    startX: 0,
    startY: 0,
    startDistance: 0,
    lastX: 0,
    lastY: 0,
    touchCount: 0,
    startTime: 0,
    velocity: { x: 0, y: 0 }
  });

  const lastTapTime = useRef(0);
  const longPressTimer = useRef<NodeJS.Timeout>();
  const inertiaTimer = useRef<number>();

  // 햅틱 피드백 (지원하는 디바이스에서)
  const triggerHapticFeedback = useCallback(() => {
    if (!enableHapticFeedback) return;
    
    if ('vibrate' in navigator) {
      navigator.vibrate(10); // 짧은 진동
    }
  }, [enableHapticFeedback]);

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

  // 속도 계산
  const calculateVelocity = (deltaX: number, deltaY: number, deltaTime: number) => {
    const velocity = Math.sqrt(deltaX * deltaX + deltaY * deltaY) / deltaTime;
    return velocity;
  };

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (preventDefault) {
      e.preventDefault();
    }

    const touches = e.touches;
    touchState.current.touchCount = touches.length;
    touchState.current.startTime = Date.now();

    if (touches.length === 1) {
      touchState.current.startX = touches[0].clientX;
      touchState.current.startY = touches[0].clientY;
      touchState.current.lastX = touches[0].clientX;
      touchState.current.lastY = touches[0].clientY;
      touchState.current.velocity = { x: 0, y: 0 };

      // 롱프레스 타이머 시작
      if (options.onLongPress) {
        longPressTimer.current = setTimeout(() => {
          triggerHapticFeedback();
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
  }, [options, preventDefault, triggerHapticFeedback]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (preventDefault) {
      e.preventDefault();
    }

    const touches = e.touches;

    // 롱프레스 타이머 취소 (움직임 감지)
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }

    if (touches.length === 1 && touchState.current.touchCount === 1) {
      // 팬 제스처
      const deltaX = (touches[0].clientX - touchState.current.lastX) * sensitivity;
      const deltaY = (touches[0].clientY - touchState.current.lastY) * sensitivity;
      
      // 속도 계산
      const currentTime = Date.now();
      const deltaTime = currentTime - touchState.current.startTime;
      touchState.current.velocity = {
        x: deltaX / deltaTime,
        y: deltaY / deltaTime
      };
      
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
  }, [options, preventDefault, sensitivity]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (preventDefault) {
      e.preventDefault();
    }

    // 롱프레스 타이머 취소
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }

    const touches = e.changedTouches;
    if (touches.length === 1 && touchState.current.touchCount === 1) {
      const deltaX = touches[0].clientX - touchState.current.startX;
      const deltaY = touches[0].clientY - touchState.current.startY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      const deltaTime = Date.now() - touchState.current.startTime;
      const velocity = calculateVelocity(deltaX, deltaY, deltaTime);
      
      // 탭 감지 (이동 거리가 10px 미만)
      if (distance < 10) {
        const currentTime = Date.now();
        const timeDiff = currentTime - lastTapTime.current;
        
        if (timeDiff < 300) {
          // 더블탭
          triggerHapticFeedback();
          options.onDoubleTap?.();
        } else {
          // 싱글탭
          triggerHapticFeedback();
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
          const direction = deltaX > 0 ? 'right' : 'left';
          options.onSwipe?.(direction, velocity);
          
          // 빠른 스와이프는 플릭으로 처리
          if (velocity > 0.5) {
            options.onFlick?.(direction, velocity);
          }
        } else {
          // 수직 스와이프
          const direction = deltaY > 0 ? 'down' : 'up';
          options.onSwipe?.(direction, velocity);
          
          // 빠른 스와이프는 플릭으로 처리
          if (velocity > 0.5) {
            options.onFlick?.(direction, velocity);
          }
        }

        // 관성 스크롤 (터치 종료 후)
        if (enableInertia && velocity > 0.1) {
          const inertiaDuration = Math.min(1000, velocity * 500);
          const startTime = Date.now();
          
          const animateInertia = () => {
            const elapsed = Date.now() - startTime;
            const progress = elapsed / inertiaDuration;
            
            if (progress < 1) {
              const easeOut = 1 - Math.pow(1 - progress, 3);
              const currentVelocity = velocity * (1 - easeOut);
              
              if (absX > absY) {
                options.onPan?.(currentVelocity * (deltaX > 0 ? 1 : -1), 0);
              } else {
                options.onPan?.(0, currentVelocity * (deltaY > 0 ? 1 : -1));
              }
              
              inertiaTimer.current = requestAnimationFrame(animateInertia);
            }
          };
          
          animateInertia();
        }
      }
    }
    
    touchState.current.touchCount = e.touches.length;
  }, [options, preventDefault, enableInertia, triggerHapticFeedback]);

  useEffect(() => {
    const element = options.element || document;
    
    element.addEventListener('touchstart', handleTouchStart as EventListener, { passive: !preventDefault });
    element.addEventListener('touchmove', handleTouchMove as EventListener, { passive: !preventDefault });
    element.addEventListener('touchend', handleTouchEnd as EventListener, { passive: !preventDefault });
    
    return () => {
      element.removeEventListener('touchstart', handleTouchStart as EventListener);
      element.removeEventListener('touchmove', handleTouchMove as EventListener);
      element.removeEventListener('touchend', handleTouchEnd as EventListener);
      
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }
      
      if (inertiaTimer.current) {
        cancelAnimationFrame(inertiaTimer.current);
      }
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, options.element, preventDefault]);
};