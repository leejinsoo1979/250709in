import React from 'react';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { useFurnitureStore } from '@/store';
import { useSlotOccupancy } from './useSlotOccupancy';
import { useDropPositioning } from './useDropPositioning';
import { getModuleById, ModuleData } from '@/data/modules';
import { calculateInternalSpace } from '../../viewer3d/utils/geometry';

export const useFurnitureDragHandlers = (spaceInfo: SpaceInfo) => {
  const addModule = useFurnitureStore(state => state.addModule);
  const placedModules = useFurnitureStore(state => state.placedModules);
  const setFurniturePlacementMode = useFurnitureStore(state => state.setFurniturePlacementMode);
  const { checkSlotOccupancy } = useSlotOccupancy(spaceInfo);
  const { calculateDropPosition, findAvailableSlot } = useDropPositioning(spaceInfo);

  // 기본 가구 깊이 계산 (가구별 defaultDepth 우선, 없으면 fallback)
  const getDefaultDepth = (moduleData?: ModuleData) => {
    if (moduleData?.defaultDepth) {
      return Math.min(moduleData.defaultDepth, spaceInfo.depth);
    }
    
    // 기존 fallback 로직
    const spaceBasedDepth = Math.floor(spaceInfo.depth * 0.9);
    return Math.min(spaceBasedDepth, 580);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDragLeave = () => {
    // 드래그 리브 처리
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    
    try {
      const dragDataString = e.dataTransfer.getData('application/json');
      if (!dragDataString) return;
      
      const currentDragData = JSON.parse(dragDataString);
      
      if (currentDragData && currentDragData.type === 'furniture') {
        // 드롭 위치 계산
        const dropPosition = calculateDropPosition(e, currentDragData);
        if (!dropPosition) return;

        const indexing = calculateSpaceIndexing(spaceInfo);
        let finalX = dropPosition.x;
        
        // 중복 배치 확인 - 슬롯 기반 충돌 검사 사용
        const isBlocked = checkSlotOccupancy(dropPosition.column, dropPosition.isDualFurniture, indexing, placedModules);
        
        // 충돌이 감지되면 다음 사용 가능한 슬롯 찾기
        if (isBlocked) {
          const availableSlot = findAvailableSlot(
            dropPosition.column,
            dropPosition.isDualFurniture,
            indexing,
            checkSlotOccupancy,
            placedModules
          );
          
          if (!availableSlot) {
            return;
          }
          
          finalX = availableSlot.x;
        }
        
        // 고유 ID 생성
        const placedId = `placed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // 가구 데이터 조회하여 기본 깊이 계산
        const internalSpace = calculateInternalSpace(spaceInfo);
        const moduleData = getModuleById(currentDragData.moduleData.id, internalSpace, spaceInfo);
        const customDepth = getDefaultDepth(moduleData);
        
        // 새 모듈 배치
        const newModule = {
          id: placedId,
          moduleId: currentDragData.moduleData.id,
          position: {
            x: finalX,
            y: 0,
            z: 0
          },
          rotation: 0,
          hasDoor: currentDragData.moduleData.hasDoor ?? true, // 도어 정보 포함
          customDepth: customDepth // 가구별 기본 깊이 설정
        };
        
        addModule(newModule);
      }
    } catch (error) {
      console.error('Error handling drop:', error);
    }
    
    setFurniturePlacementMode(false);
  };

  return {
    handleDragOver,
    handleDragLeave,
    handleDrop
  };
}; 