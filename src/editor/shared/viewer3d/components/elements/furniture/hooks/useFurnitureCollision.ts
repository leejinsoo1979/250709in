import { useFurnitureStore } from '@/store';
import { getModuleById } from '@/data/modules';
import { calculateInternalSpace } from '../../../../utils/geometry';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { SpaceInfo } from '@/store/core/spaceConfigStore';

interface UseFurnitureCollisionProps {
  spaceInfo: SpaceInfo;
}

export const useFurnitureCollision = ({ spaceInfo }: UseFurnitureCollisionProps) => {
  const placedModules = useFurnitureStore(state => state.placedModules);
  const removeModule = useFurnitureStore(state => state.removeModule);
  
  // 내경 공간 계산
  const internalSpace = calculateInternalSpace(spaceInfo);
  const indexing = calculateSpaceIndexing(spaceInfo);

  // 특정 슬롯의 기존 가구 제거
  const removeExistingFurnitureInSlots = (targetSlot: number, isDualFurniture: boolean, excludeModuleId: string): void => {
    const furnitureToRemove: string[] = [];
    
    placedModules.forEach(placedModule => {
      if (placedModule.id === excludeModuleId) return; // 자기 자신은 제외
      
      const moduleData = getModuleById(placedModule.moduleId, internalSpace, spaceInfo);
      if (!moduleData) return;
      
      // 기존 가구의 듀얼/싱글 여부 판별
      const columnWidth = indexing.columnWidth;
      const existingFurnitureWidth = moduleData.dimensions.width;
      const isExistingDual = Math.abs(existingFurnitureWidth - (columnWidth * 2)) < 50;
      
      // 기존 가구의 슬롯 찾기
      let existingSlotIndex = -1;
      
      if (isExistingDual) {
        // 듀얼가구: threeUnitDualPositions에서 슬롯 찾기
        if (indexing.threeUnitDualPositions) {
          existingSlotIndex = indexing.threeUnitDualPositions.findIndex(pos => 
            Math.abs(pos - placedModule.position.x) < 0.1
          );
        }
      } else {
        // 싱글가구: threeUnitPositions에서 슬롯 찾기
        existingSlotIndex = indexing.threeUnitPositions.findIndex(pos => 
          Math.abs(pos - placedModule.position.x) < 0.1
        );
      }
      
      // 충돌 검사
      if (existingSlotIndex !== -1) {
        let shouldRemove = false;
        
        if (isDualFurniture) {
          // 새로 배치할 가구가 듀얼: targetSlot과 targetSlot+1에 겹치는 가구 제거
          if (isExistingDual) {
            // 기존도 듀얼: 정확히 같은 슬롯이면 제거
            shouldRemove = (existingSlotIndex === targetSlot);
          } else {
            // 기존은 싱글: targetSlot 또는 targetSlot+1에 있으면 제거
            shouldRemove = (existingSlotIndex === targetSlot || existingSlotIndex === targetSlot + 1);
          }
        } else {
          // 새로 배치할 가구가 싱글: targetSlot에 겹치는 가구 제거
          if (isExistingDual) {
            // 기존이 듀얼: targetSlot-1 또는 targetSlot에 시작하는 듀얼가구면 제거
            shouldRemove = (existingSlotIndex === targetSlot - 1 || existingSlotIndex === targetSlot);
          } else {
            // 기존도 싱글: 정확히 같은 슬롯이면 제거
            shouldRemove = (existingSlotIndex === targetSlot);
          }
        }
        
        if (shouldRemove) {
          furnitureToRemove.push(placedModule.id);
        }
      }
    });
    
    // 실제 제거 수행
    furnitureToRemove.forEach(id => removeModule(id));
  };

  return {
    removeExistingFurnitureInSlots
  };
}; 