import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { useTouchControls } from '../../../../../../hooks/useTouchControls';

interface UseTouchOrbitControlsOptions {
  enabled?: boolean;
  enableRotate?: boolean;
  enableZoom?: boolean;
  enablePan?: boolean;
}

export const useTouchOrbitControls = (
  controlsRef: React.MutableRefObject<OrbitControls | null>,
  options: UseTouchOrbitControlsOptions = {}
) => {
  const { camera, gl } = useThree();
  const { enabled = true, enableRotate = true, enableZoom = true, enablePan = true } = options;
  
  const initialDistance = useRef<number>(0);
  const lastScale = useRef<number>(1);
  const lastAngle = useRef<number>(0);
  const isFurnitureDrag = useRef(false);

  // 터치 컨트롤 훅 사용
  useTouchControls({
    element: gl.domElement,
    onPinch: (scale) => {
      if (!controlsRef.current || !enableZoom || !enabled || isFurnitureDrag.current) return;
      
      // 핀치 줌
      const zoomScale = scale / lastScale.current;
      controlsRef.current.dollyIn(zoomScale);
      controlsRef.current.update();
      lastScale.current = scale;
    },
    onRotate: (angle) => {
      if (!controlsRef.current || !enableRotate || !enabled || isFurnitureDrag.current) return;
      
      // 회전 제스처 처리 (두 손가락)
      const deltaAngle = angle - lastAngle.current;
      controlsRef.current.rotateLeft((deltaAngle * Math.PI) / 180);
      controlsRef.current.update();
      lastAngle.current = angle;
    },
    onPan: (deltaX, deltaY) => {
      if (!controlsRef.current || !enabled || isFurnitureDrag.current) return;
      
      // 한 손가락: 카메라 회전, 두 손가락: 팬
      if (enableRotate) {
        // 회전 민감도 조정
        const rotateSpeed = 0.5;
        controlsRef.current.rotateLeft((deltaX * rotateSpeed * Math.PI) / 180);
        controlsRef.current.rotateUp((deltaY * rotateSpeed * Math.PI) / 180);
        controlsRef.current.update();
      }
    },
    onDoubleTap: () => {
      if (!controlsRef.current || !enabled) return;
      
      // 더블탭으로 초기 뷰로 리셋
      controlsRef.current.reset();
    },
  });

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

  // 터치 이벤트 중 기본 동작 방지
  useEffect(() => {
    const canvas = gl.domElement;
    
    const preventDefaultTouch = (e: TouchEvent) => {
      if (enabled) {
        e.preventDefault();
      }
    };

    // 터치 이벤트 리스너 추가
    canvas.addEventListener('touchstart', preventDefaultTouch, { passive: false });
    canvas.addEventListener('touchmove', preventDefaultTouch, { passive: false });
    canvas.addEventListener('touchend', preventDefaultTouch, { passive: false });

    return () => {
      canvas.removeEventListener('touchstart', preventDefaultTouch);
      canvas.removeEventListener('touchmove', preventDefaultTouch);
      canvas.removeEventListener('touchend', preventDefaultTouch);
    };
  }, [gl.domElement, enabled]);

  return controlsRef;
};