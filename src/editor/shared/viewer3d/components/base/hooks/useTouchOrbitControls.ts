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

  // Ctrl + 트랙패드/마우스 드래그 → 회전 (마우스 휠 클릭+드래그와 동일)
  // 맥북 트랙패드에서 Ctrl을 누르고 드래그하면 마우스 중간 버튼 드래그처럼 동작
  useEffect(() => {
    if (!enabled || !controlsRef.current) return;

    const canvas = gl.domElement;
    let isCtrlDragging = false;
    const SYNTH_FLAG = '__ctrlRotateSynth';

    const handlePointerDown = (e: PointerEvent) => {
      if ((e as any)[SYNTH_FLAG]) return; // 합성 이벤트는 무시
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
        (synth as any)[SYNTH_FLAG] = true;
        canvas.dispatchEvent(synth);
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if ((e as any)[SYNTH_FLAG]) return;
      if (!isCtrlDragging) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const synth = new PointerEvent('pointermove', {
        bubbles: true, clientX: e.clientX, clientY: e.clientY,
        button: 1, buttons: 4, pointerId: e.pointerId,
        pointerType: e.pointerType, view: window,
      });
      (synth as any)[SYNTH_FLAG] = true;
      canvas.dispatchEvent(synth);
    };

    const handlePointerUp = (e: PointerEvent) => {
      if ((e as any)[SYNTH_FLAG]) return;
      if (!isCtrlDragging) return;
      isCtrlDragging = false;
      e.preventDefault();
      e.stopImmediatePropagation();
      const synth = new PointerEvent('pointerup', {
        bubbles: true, clientX: e.clientX, clientY: e.clientY,
        button: 1, buttons: 0, pointerId: e.pointerId,
        pointerType: e.pointerType, view: window,
      });
      (synth as any)[SYNTH_FLAG] = true;
      canvas.dispatchEvent(synth);
    };

    // Ctrl+클릭 시 맥 기본 컨텍스트 메뉴 방지
    const handleContextMenu = (e: MouseEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };

    // capture phase에서 가로채서 원래 Ctrl+클릭 이벤트를 막고 중간버튼 합성 이벤트 발송
    canvas.addEventListener('pointerdown', handlePointerDown, { capture: true });
    window.addEventListener('pointermove', handlePointerMove, { capture: true });
    window.addEventListener('pointerup', handlePointerUp, { capture: true });
    canvas.addEventListener('contextmenu', handleContextMenu);

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown, { capture: true } as any);
      window.removeEventListener('pointermove', handlePointerMove, { capture: true } as any);
      window.removeEventListener('pointerup', handlePointerUp, { capture: true } as any);
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

      if (e.touches.length === 2) {
        isPanning.current = true;
      }
    };

    // rAF throttle — 모바일 터치 이벤트는 초당 120~240회까지 발생
    // OrbitControls.update() 매번 호출하면 버벅임. 프레임당 1회로 제한.
    let rafPending = false;
    let pendingTouches: Touch[] | null = null;
    const flushMove = () => {
      rafPending = false;
      if (!pendingTouches || !controlsRef.current) return;
      const currentTouches = pendingTouches;
      pendingTouches = null;

      if (currentTouches.length === 1 && touchCount.current === 1) {
        // 한 손가락: 팬
        const touch = currentTouches[0];
        const lastPos = lastTouchPositions[0];
        if (lastPos) {
          const deltaX = touch.clientX - lastPos.x;
          const deltaY = touch.clientY - lastPos.y;
          const panSpeed = panSensitivity * 0.01;
          controlsRef.current.pan(-deltaX * panSpeed, deltaY * panSpeed, 0);
          controlsRef.current.update();
        }
        lastTouchPositions[0] = { x: touch.clientX, y: touch.clientY };
      } else if (currentTouches.length === 2 && touchCount.current === 2) {
        // 두 손가락: 핀치 줌 + 팬 동시 적용 (분기하지 않음 — 더 자연스러움)
        const t1 = currentTouches[0];
        const t2 = currentTouches[1];
        const lp1 = lastTouchPositions[0];
        const lp2 = lastTouchPositions[1];

        if (lp1 && lp2) {
          const curDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
          const lastDist = Math.hypot(lp1.x - lp2.x, lp1.y - lp2.y);

          // 줌: 거리비 — 최소 변화 1px 이상일 때만
          if (Math.abs(curDist - lastDist) > 1 && lastDist > 0) {
            const scale = curDist / lastDist;
            const adjusted = Math.pow(scale, zoomSensitivity);
            // dollyIn은 카메라를 가깝게. scale>1 = 손가락 벌림 = 확대 = dollyIn 필요
            controlsRef.current.dollyIn(adjusted);
          }

          // 팬: 중심점 이동
          const cx = (t1.clientX + t2.clientX) / 2;
          const cy = (t1.clientY + t2.clientY) / 2;
          const lcx = (lp1.x + lp2.x) / 2;
          const lcy = (lp1.y + lp2.y) / 2;
          const dx = cx - lcx;
          const dy = cy - lcy;
          if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
            const panSpeed = panSensitivity * 0.01;
            controlsRef.current.pan(-dx * panSpeed, dy * panSpeed, 0);
          }

          controlsRef.current.update();
        }

        lastTouchPositions[0] = { x: t1.clientX, y: t1.clientY };
        lastTouchPositions[1] = { x: t2.clientX, y: t2.clientY };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (isFurnitureDrag.current || !controlsRef.current) return;
      e.preventDefault();
      // touchCount 동기화 (한↔두 손가락 전환 안전)
      touchCount.current = e.touches.length;
      // 최신 touches만 rAF에 전달 — 중간 이벤트는 자연스럽게 drop됨
      pendingTouches = Array.from(e.touches);
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(flushMove);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (isFurnitureDrag.current) return;
      e.preventDefault();
      touchCount.current = e.touches.length; // 남은 터치 반영 (두 손가락 중 하나만 떼도 처리)
      if (e.touches.length === 0) {
        isPanning.current = false;
        startTouches = [];
        lastTouchPositions = [];
      } else {
        // 남은 터치 기준으로 위치 재설정 (떼는 순간 점프 방지)
        lastTouchPositions = Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY }));
      }
    };

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });

    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
      canvas.removeEventListener('touchcancel', handleTouchEnd);
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