import { useState, useRef } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import { useFurnitureStore } from '@/store';

export const useFurnitureSelection = () => {
  const editMode = useFurnitureStore(state => state.editMode);
  const editingModuleId = useFurnitureStore(state => state.editingModuleId);
  const setEditMode = useFurnitureStore(state => state.setEditMode);
  const setEditingModuleId = useFurnitureStore(state => state.setEditingModuleId);
  const removeModule = useFurnitureStore(state => state.removeModule);
  const [dragMode, setDragMode] = useState(false);
  const isDragging = useRef(false);

  // 가구 클릭 핸들러 (원클릭 편집모드)
  const handleFurnitureClick = (e: ThreeEvent<MouseEvent>, placedModuleId: string) => {
    // 드래그였다면 클릭 이벤트 무시
    if (isDragging.current) return;
    
    e.stopPropagation();
    
    if (dragMode) {
      // 드래그 모드에서는 삭제
      removeModule(placedModuleId);
      setDragMode(false);
    } else {
      // 가구 클릭하면 바로 편집모드 진입 (이미 편집 중이어도 해당 가구로 편집모드 전환)
      setEditMode(true);
      setEditingModuleId(placedModuleId);
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