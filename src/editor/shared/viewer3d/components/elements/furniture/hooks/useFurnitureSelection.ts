import { useState, useRef } from 'react';
import { ThreeEvent } from '@react-three/fiber';
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
  const { openFurnitureEditPopup } = useUIStore();
  const setSelectedFurnitureId = useUIStore(state => state.setSelectedFurnitureId);
  const viewMode = useUIStore(state => state.viewMode);
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
      // 가구 클릭하면 가구 편집 팝업 열기
      openFurnitureEditPopup(placedModuleId);
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
