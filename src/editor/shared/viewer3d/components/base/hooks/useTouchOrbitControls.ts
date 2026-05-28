import { useCallback, useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Spherical, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

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

type OrbitControlsWithInternalMethods = OrbitControls & {
  pan?: (deltaX: number, deltaY: number, deltaZ?: number) => void
  rotateLeft?: (angle: number) => void
  rotateUp?: (angle: number) => void
  dollyIn?: (scale: number) => void
  dollyOut?: (scale: number) => void
}

type SyntheticPointerEvent = PointerEvent & {
  __ctrlRotateSynth?: boolean
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
  
  const isFurnitureDrag = useRef(false);
  const isTrackpad = useRef(false);
  const pressedKeys = useRef<Set<string>>(new Set());
  const touchCount = useRef<number>(0);
  const isPanning = useRef<boolean>(false);

  const updateControls = useCallback(() => {
    controlsRef.current?.update();
  }, [controlsRef]);

  const panCamera = useCallback((deltaX: number, deltaY: number) => {
    if (!enablePan) return;

    const controls = controlsRef.current as OrbitControlsWithInternalMethods | null;

    if (!controls) return;

    const nextDeltaX = deltaX * sensitivity;
    const nextDeltaY = deltaY * sensitivity;

    if (typeof controls.pan === 'function') {
      controls.pan(nextDeltaX, nextDeltaY, 0);
      updateControls();
      return;
    }

    const target = controls.target || new Vector3();
    const right = new Vector3().setFromMatrixColumn(camera.matrix, 0).multiplyScalar(nextDeltaX);
    const up = new Vector3().setFromMatrixColumn(camera.matrix, 1).multiplyScalar(nextDeltaY);
    const move = right.add(up);

    camera.position.add(move);
    target.add(move);
    updateControls();
  }, [camera, controlsRef, enablePan, sensitivity, updateControls]);

  const rotateCamera = useCallback((thetaDelta: number, phiDelta = 0) => {
    if (!enableRotate) return;

    const controls = controlsRef.current as OrbitControlsWithInternalMethods | null;

    if (!controls) return;

    const nextThetaDelta = thetaDelta * sensitivity;
    const nextPhiDelta = phiDelta * sensitivity;

    if (typeof controls.rotateLeft === 'function' || typeof controls.rotateUp === 'function') {
      if (nextThetaDelta && typeof controls.rotateLeft === 'function') controls.rotateLeft(nextThetaDelta);
      if (nextPhiDelta && typeof controls.rotateUp === 'function') controls.rotateUp(nextPhiDelta);
      updateControls();
      return;
    }

    const target = controls.target || new Vector3();
    const offset = new Vector3().subVectors(camera.position, target);
    const spherical = new Spherical().setFromVector3(offset);
    spherical.theta += nextThetaDelta;
    spherical.phi += nextPhiDelta;
    spherical.makeSafe();
    offset.setFromSpherical(spherical);
    camera.position.copy(target).add(offset);
    camera.lookAt(target);
    updateControls();
  }, [camera, controlsRef, enableRotate, sensitivity, updateControls]);

  const zoomCamera = useCallback((scale: number, direction: 'in' | 'out') => {
    if (!enableZoom) return;

    const controls = controlsRef.current as OrbitControlsWithInternalMethods | null;

    if (!controls) return;

    if (direction === 'in' && typeof controls.dollyIn === 'function') {
      controls.dollyIn(scale);
      updateControls();
      return;
    }

    if (direction === 'out' && typeof controls.dollyOut === 'function') {
      controls.dollyOut(scale);
      updateControls();
      return;
    }

    const target = controls.target || new Vector3();
    const offset = new Vector3().subVectors(camera.position, target);
    offset.multiplyScalar(direction === 'in' ? 1 / scale : scale);
    camera.position.copy(target).add(offset);
    updateControls();
  }, [camera, controlsRef, enableZoom, updateControls]);

  // 트랙패드 감지
  useEffect(() => {
    const detectTrackpad = () => {
      // 트랙패드 감지 로직
      if (!trackpadMode) {
        isTrackpad.current = false;
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const hasTouch = 'ontouchstart' in window;
      
      // 맥북에서 터치 이벤트가 있으면 트랙패드로 간주
      isTrackpad.current = isMac && hasTouch && !('ontouchend' in window);
    };

    detectTrackpad();
  }, [trackpadMode]);

  // 키보드 컨트롤
  useEffect(() => {
    if (!enableKeyboard || !controlsRef.current) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!enabled || isFurnitureDrag.current) return;
      
      const key = event.key.toLowerCase();
      pressedKeys.current.add(key);
      
      // Space 키는 ThreeCanvas에서 resetCamera()로 처리 (중복 방지)
      if (key === ' ') return;
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
        panCamera(0, -speed);
      }
      if (pressedKeys.current.has('s')) {
        panCamera(0, speed);
      }
      if (pressedKeys.current.has('a')) {
        panCamera(-speed, 0);
      }
      if (pressedKeys.current.has('d')) {
        panCamera(speed, 0);
      }
      
      // QE 키로 좌우 회전
      if (pressedKeys.current.has('q')) {
        rotateCamera(speed * 0.1);
      }
      if (pressedKeys.current.has('e')) {
        rotateCamera(-speed * 0.1);
      }
      
      // RF 키로 상하 회전
      if (pressedKeys.current.has('r')) {
        rotateCamera(0, speed * 0.1);
      }
      if (pressedKeys.current.has('f')) {
        rotateCamera(0, -speed * 0.1);
      }
      
      // ZX 키로 줌
      if (pressedKeys.current.has('z')) {
        zoomCamera(1.05, 'in');
      }
      if (pressedKeys.current.has('x')) {
        zoomCamera(1.05, 'out');
      }
      
      updateControls();
      requestAnimationFrame(animate);
    };

    const animationId = requestAnimationFrame(animate);
    
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [enableKeyboard, enabled, keyboardSpeed, controlsRef, panCamera, rotateCamera, updateControls, zoomCamera]);

  // Ctrl + 트랙패드/마우스 드래그 → 회전 (마우스 휠 클릭+드래그와 동일)
  // 맥북 트랙패드에서 Ctrl을 누르고 드래그하면 마우스 중간 버튼 드래그처럼 동작
  useEffect(() => {
    if (!enabled || !controlsRef.current) return;

    const canvas = gl.domElement;
    let isCtrlDragging = false;
    const SYNTH_FLAG = '__ctrlRotateSynth';
    const captureOptions: AddEventListenerOptions = { capture: true };

    const handlePointerDown = (e: PointerEvent) => {
      if ((e as SyntheticPointerEvent)[SYNTH_FLAG]) return; // 합성 이벤트는 무시
      if (isFurnitureDrag.current) return;
      // Ctrl + 클릭/드래그 → 중간 버튼으로 변환 (맥에서 Ctrl+click은 button=2로 올 수 있음)
      if (e.ctrlKey && (e.button === 0 || e.button === 2)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        isCtrlDragging = true;
        const synth = new PointerEvent('pointerdown', {
          bubbles: true, clientX: e.clientX, clientY: e.clientY,
          button: 1, buttons: 4, pointerId: e.pointerId,
          pointerType: e.pointerType, view: window,
        });
        (synth as SyntheticPointerEvent)[SYNTH_FLAG] = true;
        canvas.dispatchEvent(synth);
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if ((e as SyntheticPointerEvent)[SYNTH_FLAG]) return;
      if (!isCtrlDragging) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const synth = new PointerEvent('pointermove', {
        bubbles: true, clientX: e.clientX, clientY: e.clientY,
        button: 1, buttons: 4, pointerId: e.pointerId,
        pointerType: e.pointerType, view: window,
      });
      (synth as SyntheticPointerEvent)[SYNTH_FLAG] = true;
      canvas.dispatchEvent(synth);
    };

    const handlePointerUp = (e: PointerEvent) => {
      if ((e as SyntheticPointerEvent)[SYNTH_FLAG]) return;
      if (!isCtrlDragging) return;
      isCtrlDragging = false;
      e.preventDefault();
      e.stopImmediatePropagation();
      const synth = new PointerEvent('pointerup', {
        bubbles: true, clientX: e.clientX, clientY: e.clientY,
        button: 1, buttons: 0, pointerId: e.pointerId,
        pointerType: e.pointerType, view: window,
      });
      (synth as SyntheticPointerEvent)[SYNTH_FLAG] = true;
      canvas.dispatchEvent(synth);
    };

    // Ctrl+클릭 시 맥 기본 컨텍스트 메뉴 방지
    const handleContextMenu = (e: MouseEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };

    // capture phase에서 가로채서 원래 Ctrl+클릭 이벤트를 막고 중간버튼 합성 이벤트 발송
    canvas.addEventListener('pointerdown', handlePointerDown, captureOptions);
    window.addEventListener('pointermove', handlePointerMove, captureOptions);
    window.addEventListener('pointerup', handlePointerUp, captureOptions);
    canvas.addEventListener('contextmenu', handleContextMenu);

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown, captureOptions);
      window.removeEventListener('pointermove', handlePointerMove, captureOptions);
      window.removeEventListener('pointerup', handlePointerUp, captureOptions);
      canvas.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [enabled, controlsRef, gl.domElement]);

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
        // 한 손가락: 팬 (회전은 휠 클릭+드래그로만)
        const touch = currentTouches[0];
        const lastPos = lastTouchPositions[0];

        if (lastPos) {
          const deltaX = touch.clientX - lastPos.x;
          const deltaY = touch.clientY - lastPos.y;

          const panSpeed = panSensitivity * 0.01;
          panCamera(-deltaX * panSpeed, deltaY * panSpeed);
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
            zoomCamera(adjustedZoomScale, 'in');
            
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
            panCamera(-deltaX * panSpeed, -deltaY * panSpeed);
            
            console.log('📱 두 손가락 팬:', {
              deltaX: deltaX.toFixed(2),
              deltaY: deltaY.toFixed(2),
              panSpeed: panSpeed.toFixed(4)
            });
          }
          
          updateControls();
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
  }, [enabled, zoomSensitivity, panSensitivity, controlsRef, gl.domElement, panCamera, updateControls, zoomCamera]);

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
