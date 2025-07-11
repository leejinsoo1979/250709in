import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import { getModuleById } from '@/data/modules';

interface PlacedModule {
  id: string;
  moduleId: string;
  position: { x: number; y: number; z: number };
  rotation: number;
}

export const useSlotOccupancy = (spaceInfo: SpaceInfo) => {
  const checkSlotOccupancy = (
    targetColumn: number, 
    isDualFurniture: boolean, 
    indexing: ReturnType<typeof calculateSpaceIndexing>, 
    placedModules: PlacedModule[]
  ) => {
    const columnWidth = indexing.columnWidth;
    const internalSpace = calculateInternalSpace(spaceInfo);
    
    // 배치된 가구들의 슬롯 점유 상태 파악
    const occupiedSlots = new Set<number>();
    
    placedModules.forEach(module => {
      // 각 배치된 가구가 어떤 슬롯을 점유하는지 계산
      const moduleData = getModuleById(module.moduleId, internalSpace, spaceInfo);
      if (!moduleData) return;
      
      const isModuleDual = Math.abs(moduleData.dimensions.width - (columnWidth * 2)) < 50;
      
      // 가구의 위치에서 슬롯 번호 찾기
      let moduleSlot = -1;
      if (isModuleDual) {
        // 듀얼 가구: threeUnitDualPositions에서 슬롯 찾기
        if (indexing.threeUnitDualPositions) {
          moduleSlot = indexing.threeUnitDualPositions.findIndex((pos: number) => 
            Math.abs(pos - module.position.x) < 0.1
          );
          if (moduleSlot >= 0) {
            // 듀얼 가구는 연속된 두 개의 싱글 슬롯을 점유
            occupiedSlots.add(moduleSlot);
            occupiedSlots.add(moduleSlot + 1);
            console.log(`🔍 Dual furniture at slot ${moduleSlot} occupies slots: ${moduleSlot}, ${moduleSlot + 1}`);
          }
        }
      } else {
        // 싱글 가구: threeUnitPositions에서 슬롯 찾기
        moduleSlot = indexing.threeUnitPositions.findIndex((pos: number) => 
          Math.abs(pos - module.position.x) < 0.1
        );
        if (moduleSlot >= 0) {
          occupiedSlots.add(moduleSlot);
          console.log(`🔍 Single furniture at slot ${moduleSlot}`);
        }
      }
    });
    
    console.log('🔍 All occupied slots:', Array.from(occupiedSlots));
    
    // 현재 배치하려는 가구가 점유할 슬롯들 계산
    let targetSlots: number[];
    if (isDualFurniture) {
      // 듀얼 가구는 연속된 두 개의 슬롯을 점유
      targetSlots = [targetColumn, targetColumn + 1];
    } else {
      // 싱글 가구는 하나의 슬롯만 점유
      targetSlots = [targetColumn];
    }
    
    console.log(`🔍 Target slots for ${isDualFurniture ? 'dual' : 'single'} furniture:`, targetSlots);
    
    // 충돌 검사
    const hasConflict = targetSlots.some(slot => occupiedSlots.has(slot));
    console.log(`🔍 Slot conflict check result: ${hasConflict}`);
    
    return hasConflict;
  };

  return { checkSlotOccupancy };
}; 