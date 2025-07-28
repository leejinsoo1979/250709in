import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { useTouchControls } from '../../../../../../hooks/useTouchControls';

interface UseTouchOrbitControlsOptions {
  enabled?: boolean;
  enableRotate?: boolean;
  enableZoom?: boolean;
  enablePan?: boolean;
  // 맥북 트랙패드 최적화 옵션
  trackpadMode?: boolean; // 트랙패드 모드 활성화
  sensitivity?: number; // 민감도 조정 (기본값: 1.0)
  zoomSensitivity?: number; // 줌 민감도 (기본값: 1.0)
  panSensitivity?: number; // 팬 민감도 (기본값: 1.0)
  // 키보드 컨트롤 옵션
  enableKeyboard?: boolean; // 키보드 컨트롤 활성화
  keyboardSpeed?: number; // 키보드 이동 속도
}

export const useTouchOrbitControls = (
  controlsRef: React.MutableRefObject<OrbitControls | null>,
  options: UseTouchOrbitControlsOptions = {}
) => {
  const { camera, gl } = useThree();
  const { 
    enabled = true, 
    enableRotate = true, 
    enableZoom = true, 
    enablePan = true,
    trackpadMode = true, // 맥북 트랙패드 최적화 기본 활성화
    sensitivity = 1.0,
    zoomSensitivity = 1.0,
    panSensitivity = 1.0,
    enableKeyboard = true, // 키보드 컨트롤 기본 활성화
    keyboardSpeed = 0.1
  } = options;
  
  const initialDistance = useRef<number>(0);
  const lastScale = useRef<number>(1);
  const lastAngle = useRef<number>(0);
  const isFurnitureDrag = useRef(false);
  const isTrackpad = useRef(false);
  const pressedKeys = useRef<Set<string>>(new Set());
  const touchCount = useRef<number>(0);
  const isPanning = useRef<boolean>(false);

  // 트랙패드 감지
  useEffect(() => {
    const detectTrackpad = () => {
      // 트랙패드 감지 로직
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const hasTouch = 'ontouchstart' in window;
      const hasPointer = 'onpointerdown' in window;
      
      // 맥북에서 터치 이벤트가 있으면 트랙패드로 간주
      isTrackpad.current = isMac && hasTouch && !('ontouchend' in window);
    };

    detectTrackpad();
  }, []);

  // 키보드 컨트롤
  useEffect(() => {
    if (!enableKeyboard || !controlsRef.current) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!enabled || isFurnitureDrag.current) return;
      
      const key = event.key.toLowerCase();
      pressedKeys.current.add(key);
      
      // Space 키로 초기 뷰 리셋
      if (key === ' ') {
        event.preventDefault();
        controlsRef.current?.reset();
        return;
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      pressedKeys.current.delete(key);
    };

    // 키보드 이벤트 리스너 추가
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [enableKeyboard, enabled, controlsRef]);

  // 키보드 애니메이션 루프
  useEffect(() => {
    if (!enableKeyboard || !controlsRef.current) return;

    const animate = () => {
      if (!enabled || isFurnitureDrag.current || !controlsRef.current) return;

      const speed = keyboardSpeed;
      
      // WASD 키로 카메라 이동
      if (pressedKeys.current.has('w')) {
        controlsRef.current.pan(0, -speed, 0);
      }
      if (pressedKeys.current.has('s')) {
        controlsRef.current.pan(0, speed, 0);
      }
      if (pressedKeys.current.has('a')) {
        controlsRef.current.pan(-speed, 0, 0);
      }
      if (pressedKeys.current.has('d')) {
        controlsRef.current.pan(speed, 0, 0);
      }
      
      // QE 키로 좌우 회전
      if (pressedKeys.current.has('q')) {
        controlsRef.current.rotateLeft(speed * 0.1);
      }
      if (pressedKeys.current.has('e')) {
        controlsRef.current.rotateLeft(-speed * 0.1);
      }
      
      // RF 키로 상하 회전
      if (pressedKeys.current.has('r')) {
        controlsRef.current.rotateUp(speed * 0.1);
      }
      if (pressedKeys.current.has('f')) {
        controlsRef.current.rotateUp(-speed * 0.1);
      }
      
      // ZX 키로 줌
      if (pressedKeys.current.has('z')) {
        controlsRef.current.dollyIn(1.05);
      }
      if (pressedKeys.current.has('x')) {
        controlsRef.current.dollyOut(1.05);
      }
      
      controlsRef.current.update();
      requestAnimationFrame(animate);
    };

    const animationId = requestAnimationFrame(animate);
    
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [enableKeyboard, enabled, keyboardSpeed, controlsRef]);

  // 커스텀 터치 컨트롤
  useEffect(() => {
    if (!enabled || !controlsRef.current) return;

    const canvas = gl.domElement;
    let startTouches: Touch[] = [];
    let lastTouchPositions: { x: number; y: number }[] = [];

    const handleTouchStart = (e: TouchEvent) => {
      if (isFurnitureDrag.current) return;
      
      e.preventDefault();
      startTouches = Array.from(e.touches);
      lastTouchPositions = startTouches.map(touch => ({ x: touch.clientX, y: touch.clientY }));
      touchCount.current = e.touches.length;
      
      console.log('🖐️ 터치 시작:', {
        touchCount: e.touches.length,
        positions: lastTouchPositions
      });
      
      // 두 손가락 터치 시작 시 팬 모드 활성화
      if (e.touches.length === 2) {
        isPanning.current = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (isFurnitureDrag.current || !controlsRef.current) return;
      
      e.preventDefault();
      const currentTouches = Array.from(e.touches);
      
      if (e.touches.length === 1 && touchCount.current === 1) {
        // 한 손가락: 카메라 회전
        const touch = currentTouches[0];
        const lastPos = lastTouchPositions[0];
        
        if (lastPos) {
          const deltaX = touch.clientX - lastPos.x;
          const deltaY = touch.clientY - lastPos.y;
          
          // 회전 민감도 조정
          const rotateSpeed = sensitivity * 0.01;
          controlsRef.current.rotateLeft((deltaX * rotateSpeed * Math.PI) / 180);
          controlsRef.current.rotateUp((deltaY * rotateSpeed * Math.PI) / 180);
          controlsRef.current.update();
          
          console.log('🔄 한 손가락 회전:', {
            deltaX: deltaX.toFixed(2),
            deltaY: deltaY.toFixed(2),
            rotateSpeed: rotateSpeed.toFixed(4)
          });
        }
        
        lastTouchPositions[0] = { x: touch.clientX, y: touch.clientY };
      } else if (e.touches.length === 2 && touchCount.current === 2) {
        // 두 손가락: 줌 또는 팬
        const touch1 = currentTouches[0];
        const touch2 = currentTouches[1];
        const lastPos1 = lastTouchPositions[0];
        const lastPos2 = lastTouchPositions[1];
        
        if (lastPos1 && lastPos2) {
          // 현재 거리와 이전 거리 계산
          const currentDistance = Math.sqrt(
            Math.pow(touch1.clientX - touch2.clientX, 2) + 
            Math.pow(touch1.clientY - touch2.clientY, 2)
          );
          const lastDistance = Math.sqrt(
            Math.pow(lastPos1.x - lastPos2.x, 2) + 
            Math.pow(lastPos1.y - lastPos2.y, 2)
          );
          
          // 거리 변화가 크면 줌, 작으면 팬
          const distanceChange = Math.abs(currentDistance - lastDistance);
          const avgDistance = (currentDistance + lastDistance) / 2;
          const zoomThreshold = avgDistance * 0.1; // 10% 변화를 줌으로 간주
          
          if (distanceChange > zoomThreshold) {
            // 줌 처리
            const zoomScale = currentDistance / lastDistance;
            const adjustedZoomScale = Math.pow(zoomScale, zoomSensitivity);
            controlsRef.current.dollyIn(adjustedZoomScale);
            
            console.log('🔍 두 손가락 줌:', {
              currentDistance: currentDistance.toFixed(2),
              lastDistance: lastDistance.toFixed(2),
              zoomScale: zoomScale.toFixed(3),
              adjustedZoomScale: adjustedZoomScale.toFixed(3)
            });
          } else {
            // 팬 처리
            const centerX = (touch1.clientX + touch2.clientX) / 2;
            const centerY = (touch1.clientY + touch2.clientY) / 2;
            const lastCenterX = (lastPos1.x + lastPos2.x) / 2;
            const lastCenterY = (lastPos1.y + lastPos2.y) / 2;
            
            const deltaX = centerX - lastCenterX;
            const deltaY = centerY - lastCenterY;
            
            // 팬 민감도 조정
            const panSpeed = panSensitivity * 0.01;
            controlsRef.current.pan(-deltaX * panSpeed, -deltaY * panSpeed, 0);
            
            console.log('📱 두 손가락 팬:', {
              deltaX: deltaX.toFixed(2),
              deltaY: deltaY.toFixed(2),
              panSpeed: panSpeed.toFixed(4)
            });
          }
          
          controlsRef.current.update();
        }
        
        lastTouchPositions[0] = { x: touch1.clientX, y: touch1.clientY };
        lastTouchPositions[1] = { x: touch2.clientX, y: touch2.clientY };
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (isFurnitureDrag.current) return;
      
      e.preventDefault();
      console.log('🖐️ 터치 종료:', {
        remainingTouches: e.touches.length
      });
      
      touchCount.current = 0;
      isPanning.current = false;
      startTouches = [];
      lastTouchPositions = [];
    };

    // 터치 이벤트 리스너 추가
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

    console.log('🎮 터치 컨트롤 활성화됨');

    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
      console.log('🎮 터치 컨트롤 비활성화됨');
    };
  }, [enabled, sensitivity, zoomSensitivity, panSensitivity, controlsRef, gl.domElement]);

  // 가구 드래그 상태 감지
  useEffect(() => {
    const handleFurnitureDragStart = () => {
      isFurnitureDrag.current = true;
    };

    const handleFurnitureDragEnd = () => {
      isFurnitureDrag.current = false;
    };

    // 전역 이벤트 리스너 추가
    window.addEventListener('furniture-drag-start', handleFurnitureDragStart);
    window.addEventListener('furniture-drag-end', handleFurnitureDragEnd);

    return () => {
      window.removeEventListener('furniture-drag-start', handleFurnitureDragStart);
      window.removeEventListener('furniture-drag-end', handleFurnitureDragEnd);
    };
  }, []);

  return controlsRef;
};