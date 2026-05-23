import React, { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface CustomZoomControllerProps {
  minDistance: number;
  maxDistance: number;
  minZoom?: number;
  maxZoom?: number;
  viewMode: '2D' | '3D';
  zoomSpeed?: number;
  controlsRef?: React.MutableRefObject<any>;
}

/**
 * Canvas 내부에서 사용되는 커스텀 줌 컨트롤러 컴포넌트
 * 카메라 축 고정 상태에서 마우스 포인터 위치 기준 줌 기능
 */
export const CustomZoomController: React.FC<CustomZoomControllerProps> = ({ 
  minDistance, 
  maxDistance, 
  minZoom = 0.5,
  maxZoom = 160,
  viewMode,
  zoomSpeed = 1.0,
  controlsRef
}) => {
  const { camera, gl, invalidate } = useThree();
  const currentCameraRef = useRef(camera);
  
  useEffect(() => {
    currentCameraRef.current = camera;
  }, [camera]);

  useEffect(() => {
    // 2D 모드에서만 커스텀 줌 활성화
    if (viewMode !== '2D') return;

    const canvas = gl.domElement;
    if (!canvas) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const camera = currentCameraRef.current;
      if (!camera || !(camera instanceof THREE.OrthographicCamera)) return;

      // 마우스 위치를 캔버스 좌표로 변환
      const rect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      // 현재 줌값
      const currentZoom = camera.zoom;

      // 휠 방향에 따른 줌 계산. 트랙패드는 deltaY가 1 미만~수 px 단위로 자주 들어와서
      // 일반 마우스 휠처럼 100으로 나누면 줌인이 거의 체감되지 않는다.
      const deltaUnit = event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 3
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? 24
          : 1;
      const normalizedDelta = event.deltaY * deltaUnit;
      const isTrackpad = event.ctrlKey
        || (event.deltaMode === WheelEvent.DOM_DELTA_PIXEL && Math.abs(event.deltaY) < 50);
      const wheelSteps = isTrackpad
        ? THREE.MathUtils.clamp(Math.abs(normalizedDelta) / 18, 0.25, 2.5)
        : THREE.MathUtils.clamp(Math.abs(normalizedDelta) / 100, 0.75, 4);
      const zoomBase = 1 + Math.max(0.05, zoomSpeed);
      let newZoom = currentZoom * Math.pow(zoomBase, normalizedDelta < 0 ? wheelSteps : -wheelSteps);

      // 컨트롤 설정의 줌 범위를 그대로 적용한다. 기존 0.95 고정 하한 때문에
      // 2D에서 줌아웃이 거의 되지 않았다.
      newZoom = THREE.MathUtils.clamp(newZoom, minZoom, maxZoom);
      
      if (newZoom !== currentZoom) {
        // 마우스 포인터를 NDC 좌표로 변환 (-1 ~ 1)
        const mouseNDC = new THREE.Vector2();
        mouseNDC.x = (mouseX / rect.width) * 2 - 1;
        mouseNDC.y = -((mouseY / rect.height) * 2 - 1);

        // 줌 전 마우스 위치의 월드 좌표 계산
        const worldBefore = new THREE.Vector3();
        const frustumWidth = (camera.right - camera.left) / currentZoom;
        const frustumHeight = (camera.top - camera.bottom) / currentZoom;
        
        worldBefore.x = mouseNDC.x * frustumWidth / 2;
        worldBefore.y = mouseNDC.y * frustumHeight / 2;

        // 줌 적용
        camera.zoom = newZoom;

        // 줌 후 마우스 위치의 월드 좌표 계산
        const worldAfter = new THREE.Vector3();
        const newFrustumWidth = (camera.right - camera.left) / newZoom;
        const newFrustumHeight = (camera.top - camera.bottom) / newZoom;
        
        worldAfter.x = mouseNDC.x * newFrustumWidth / 2;
        worldAfter.y = mouseNDC.y * newFrustumHeight / 2;

        // 차이만큼 뷰포트 조정하여 마우스 포인터 위치 고정
        const deltaX = worldBefore.x - worldAfter.x;
        const deltaY = worldBefore.y - worldAfter.y;
        
        camera.left += deltaX;
        camera.right += deltaX;
        camera.top += deltaY;
        camera.bottom += deltaY;
      } else {
        // 줌이 변경되지 않은 경우에도 적용
        camera.zoom = newZoom;
      }
      
      // 카메라 매트릭스 업데이트
      camera.updateProjectionMatrix();
      invalidate();
    };

    // 휠 이벤트 등록 (passive: false로 preventDefault 허용)
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [gl, invalidate, minDistance, maxDistance, minZoom, maxZoom, viewMode, zoomSpeed, camera]);

  // 이 컴포넌트는 렌더링하지 않음 (기능만 제공)
  return null;
};
