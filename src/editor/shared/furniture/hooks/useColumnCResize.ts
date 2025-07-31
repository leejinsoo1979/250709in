import { useState, useCallback, useRef } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import { Vector3 } from 'three';
import { PlacedModule } from '../types';
import { useFurnitureStore } from '@/store/core/furnitureStore';

interface ResizeState {
  isResizing: boolean;
  startPoint: Vector3 | null;
  startWidth: number;
  startDepth: number;
  direction: 'horizontal' | 'vertical' | null;
}

export const useColumnCResize = (
  placedModule: PlacedModule,
  isColumnCFront: boolean,
  columnDepth: number,
  slotWidth: number
) => {
  const updatePlacedModule = useFurnitureStore(state => state.updatePlacedModule);
  const [resizeState, setResizeState] = useState<ResizeState>({
    isResizing: false,
    startPoint: null,
    startWidth: placedModule.customWidth || 150,
    startDepth: placedModule.customDepth || 600,
    direction: null
  });

  const dragThreshold = 0.01; // 10mm in Three.js units
  const initialDirection = useRef<'horizontal' | 'vertical' | null>(null);

  const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!isColumnCFront) return;
    
    e.stopPropagation();
    const point = e.point.clone();
    
    setResizeState({
      isResizing: true,
      startPoint: point,
      startWidth: placedModule.customWidth || 150,
      startDepth: placedModule.customDepth || 600,
      direction: null
    });
    
    initialDirection.current = null;
    
    // 가구 리사이즈 시작 이벤트 발생 (카메라 회전 비활성화)
    window.dispatchEvent(new CustomEvent('furniture-drag-start'));
    
    // 커서 변경
    document.body.style.cursor = 'crosshair';
  }, [isColumnCFront, placedModule.customWidth, placedModule.customDepth]);

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!resizeState.isResizing || !resizeState.startPoint) return;
    
    const currentPoint = e.point.clone();
    const deltaX = currentPoint.x - resizeState.startPoint.x;
    const deltaZ = currentPoint.z - resizeState.startPoint.z;
    
    // 처음 움직임에서 방향 결정
    if (!initialDirection.current) {
      if (Math.abs(deltaX) > dragThreshold || Math.abs(deltaZ) > dragThreshold) {
        initialDirection.current = Math.abs(deltaX) > Math.abs(deltaZ) ? 'horizontal' : 'vertical';
        setResizeState(prev => ({ ...prev, direction: initialDirection.current }));
      }
      return;
    }
    
    if (initialDirection.current === 'horizontal') {
      // 좌우 크기 조절
      const deltaWidthMm = deltaX * 1000; // Three.js units to mm
      let newWidth = resizeState.startWidth + deltaWidthMm;
      
      // 제약 조건 적용
      const minWidth = 150; // 프로젝트 최소 가구 너비
      const maxWidth = slotWidth; // Column C의 경우 300mm
      newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      
      updatePlacedModule(placedModule.id, {
        customWidth: Math.round(newWidth)
      });
      
      console.log('🔄 가구 너비 조절:', {
        deltaX: deltaX.toFixed(3),
        startWidth: resizeState.startWidth,
        newWidth: Math.round(newWidth)
      });
    } else if (initialDirection.current === 'vertical') {
      // 위아래 깊이 조절
      const deltaDepthMm = -deltaZ * 1000; // Three.js units to mm (Z축은 반대)
      let newDepth = resizeState.startDepth + deltaDepthMm;
      
      // 제약 조건: 최소 깊이는 (원래 깊이 - 기둥 깊이), 최대는 원래 깊이
      const minDepth = Math.max(200, 600 - columnDepth); // 최소 200mm
      const maxDepth = 600; // 원래 깊이
      
      newDepth = Math.max(minDepth, Math.min(maxDepth, newDepth));
      
      // Z 위치도 함께 조정해야 함
      const depthDiff = newDepth - (placedModule.customDepth || 600);
      const newZ = placedModule.position.z - (depthDiff * 0.001) / 2;
      
      updatePlacedModule(placedModule.id, {
        customDepth: Math.round(newDepth),
        position: { ...placedModule.position, z: newZ }
      });
      
      console.log('🔄 가구 깊이 조절:', {
        deltaZ: deltaZ.toFixed(3),
        startDepth: resizeState.startDepth,
        newDepth: Math.round(newDepth),
        newZ: newZ.toFixed(3)
      });
    }
  }, [resizeState, placedModule, columnDepth, updatePlacedModule]);

  const handlePointerUp = useCallback(() => {
    if (!resizeState.isResizing) return;
    
    setResizeState({
      isResizing: false,
      startPoint: null,
      startWidth: placedModule.customWidth || 150,
      startDepth: placedModule.customDepth || 600,
      direction: null
    });
    
    initialDirection.current = null;
    document.body.style.cursor = 'default';
    
    // 가구 리사이즈 종료 이벤트 발생 (카메라 회전 재활성화)
    window.dispatchEvent(new CustomEvent('furniture-drag-end'));
    
    console.log('✅ 크기 조절 완료:', {
      finalWidth: placedModule.customWidth,
      finalDepth: placedModule.customDepth
    });
  }, [resizeState.isResizing, placedModule]);

  return {
    isResizing: resizeState.isResizing,
    resizeDirection: resizeState.direction,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp
  };
};