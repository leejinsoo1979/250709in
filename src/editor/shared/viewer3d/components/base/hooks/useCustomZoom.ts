import React, { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface CustomZoomControllerProps {
  minDistance: number;
  maxDistance: number;
  viewMode: '2D' | '3D';
  zoomSpeed?: number;
}

/**
 * Canvas 내부에서 사용되는 커스텀 줌 컨트롤러 컴포넌트
 * 카메라 축 고정 상태에서 마우스 포인터 위치 기준 줌 기능
 */
export const CustomZoomController: React.FC<CustomZoomControllerProps> = ({ 
  minDistance, 
  maxDistance, 
  viewMode,
  zoomSpeed = 1.0 
}) => {
  const { camera, gl, scene } = useThree();
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

      // 휠 방향에 따른 줌 계산
      const delta = event.deltaY;

      // 트랙패드 감지: deltaY가 작고 정밀한 값이면 트랙패드
      const isTrackpad = Math.abs(delta) < 50;

      // 트랙패드는 적절한 배율 사용 (맥북 트랙패드 최적화)
      const zoomInFactor = isTrackpad ? 1.04 : 1.15;   // 트랙패드: 4% / 마우스: 15%
      const zoomOutFactor = isTrackpad ? 0.96 : 0.85;  // 트랙패드: 4% / 마우스: 15%

      let newZoom;

      if (delta < 0) {
        // 휠 위: 줌인(확대)
        newZoom = currentZoom * zoomInFactor;
      } else {
        // 휠 아래: 줌아웃(축소)
        newZoom = currentZoom * zoomOutFactor;
      }

      // 줌 범위 제한: 축소는 0.95에서 멈춤, 확대는 무제한
      newZoom = Math.max(0.95, newZoom);
      
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
      
      if (import.meta.env.DEV) {
        console.log('🔍 2D 마우스 포인터 줌:', {
          device: isTrackpad ? 'Trackpad' : 'Mouse',
          mouseX: mouseX.toFixed(0),
          mouseY: mouseY.toFixed(0),
          oldZoom: currentZoom.toFixed(2),
          newZoom: newZoom.toFixed(2),
          deltaY: delta,
          direction: delta < 0 ? 'UP(확대)' : 'DOWN(축소)'
        });
      }

      // 카메라 매트릭스 업데이트
      camera.updateProjectionMatrix();
      
      // 렌더링 강제 업데이트
      gl.render(scene, camera);
    };

    // 휠 이벤트 등록 (passive: false로 preventDefault 허용)
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [gl, scene, minDistance, maxDistance, viewMode, zoomSpeed, camera]);

  // 이 컴포넌트는 렌더링하지 않음 (기능만 제공)
  return null;
};