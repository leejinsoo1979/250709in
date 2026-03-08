import { useState, useRef } from 'react';
import { ThreeEvent, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useFurnitureStore } from '@/store';
import { useUIStore } from '@/store/uiStore';

interface UseFurnitureSelectionOptions {
  readOnly?: boolean;
}

export const useFurnitureSelection = (options?: UseFurnitureSelectionOptions) => {
  const { readOnly = false } = options || {};

  const editMode = useFurnitureStore(state => state.editMode);
  const editingModuleId = useFurnitureStore(state => state.editingModuleId);
  const setEditMode = useFurnitureStore(state => state.setEditMode);
  const setEditingModuleId = useFurnitureStore(state => state.setEditingModuleId);
  const removeModule = useFurnitureStore(state => state.removeModule);
  const { openFurnitureEditPopup, openCustomizableEditPopup } = useUIStore();
  const placedModules = useFurnitureStore(state => state.placedModules);
  const setSelectedFurnitureId = useUIStore(state => state.setSelectedFurnitureId);
  const viewMode = useUIStore(state => state.viewMode);
  const { camera, gl } = useThree();
  const [dragMode, setDragMode] = useState(false);
  const isDragging = useRef(false);

  // 가구 클릭 핸들러 (더블클릭 편집모드)
  const handleFurnitureClick = (e: ThreeEvent<MouseEvent>, placedModuleId: string) => {
    // 읽기 전용 모드에서는 편집 불가
    if (readOnly) {
      console.log('🚫 읽기 전용 모드 - 가구 편집 차단');
      e.stopPropagation();
      return;
    }

    // 드래그였다면 클릭 이벤트 무시
    if (isDragging.current) return;

    console.log('🖱️ 더블클릭 감지:', {
      placedModuleId,
      event: e.type,
      button: e.button
    });

    e.stopPropagation();

    if (viewMode === '3D') {
      setSelectedFurnitureId(placedModuleId);
    } else {
      setSelectedFurnitureId(null);
    }

    if (dragMode) {
      // 드래그 모드에서는 삭제
      removeModule(placedModuleId);
      if (useUIStore.getState().selectedFurnitureId === placedModuleId) {
        setSelectedFurnitureId(null);
      }
      setDragMode(false);
    } else {
      // 커스터마이징 가구면 전용 편집 팝업, 아니면 기존 편집 팝업
      const targetModule = placedModules.find(m => m.id === placedModuleId);
      if (targetModule?.isCustomizable) {
        // 가구 우측 끝의 screen 좌표 계산
        const halfW = (targetModule.freeWidth || targetModule.moduleWidth || 0) * 0.01 / 2;
        const rightEdge = new THREE.Vector3(
          targetModule.position.x + halfW,
          targetModule.position.y,
          targetModule.position.z
        );
        rightEdge.project(camera);
        const rect = gl.domElement.getBoundingClientRect();
        const sx = Math.round((rightEdge.x * 0.5 + 0.5) * rect.width + rect.left);
        const sy = Math.round((-rightEdge.y * 0.5 + 0.5) * rect.height + rect.top);
        openCustomizableEditPopup(placedModuleId, undefined, undefined, sx, sy);
      } else {
        openFurnitureEditPopup(placedModuleId);
      }
    }
  };

  return {
    dragMode,
    setDragMode,
    editMode,
    setEditMode,
    editingModuleId,
    setEditingModuleId,
    handleFurnitureClick,
    isDragging
  };
}; 
