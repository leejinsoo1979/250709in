import { useState, useRef } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import { useFurnitureStore } from '@/store';
import { useUIStore } from '@/store/uiStore';

export const useFurnitureSelection = () => {
  const editMode = useFurnitureStore(state => state.editMode);
  const editingModuleId = useFurnitureStore(state => state.editingModuleId);
  const setEditMode = useFurnitureStore(state => state.setEditMode);
  const setEditingModuleId = useFurnitureStore(state => state.setEditingModuleId);
  const removeModule = useFurnitureStore(state => state.removeModule);
  const { openFurnitureEditPopup } = useUIStore();
  const [dragMode, setDragMode] = useState(false);
  const isDragging = useRef(false);

  // 가구 클릭 핸들러 (원클릭 편집모드)
  const handleFurnitureClick = (e: ThreeEvent<MouseEvent>, placedModuleId: string) => {
    console.log('🖱️ handleFurnitureClick 호출:', {
      placedModuleId,
      isDragging: isDragging.current,
      dragMode
    });
    
    // 드래그였다면 클릭 이벤트 무시
    if (isDragging.current) return;
    
    e.stopPropagation();
    
    if (dragMode) {
      // 드래그 모드에서는 삭제
      removeModule(placedModuleId);
      setDragMode(false);
    } else {
      // 가구 클릭하면 가구 편집 팝업 열기
      console.log('🎯 openFurnitureEditPopup 호출 직전:', placedModuleId);
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