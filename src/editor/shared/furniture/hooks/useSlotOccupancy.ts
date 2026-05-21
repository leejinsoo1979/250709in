import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateSpaceIndexing, ColumnIndexer } from '@/editor/shared/utils/indexing';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import { getModuleById } from '@/data/modules';

interface PlacedModule {
  id: string;
  moduleId: string;
  position: { x: number; y: number; z: number };
  rotation: number;
  placementWall?: 'front' | 'left' | 'right';
}

export const useSlotOccupancy = (spaceInfo: SpaceInfo) => {
  const checkSlotOccupancy = (
    targetColumn: number, 
    isDualFurniture: boolean, 
    indexing: ReturnType<typeof calculateSpaceIndexing>, 
    placedModules: PlacedModule[]
  ) => {
    const internalSpace = calculateInternalSpace(spaceInfo);
    
    // 단내림이 활성화된 경우 영역별 처리
    if (spaceInfo.droppedCeiling?.enabled && indexing.zones) {
      const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
      
      // 각 영역별 점유 상태를 별도로 관리
      const occupiedSlotsNormal = new Set<number>();
      const occupiedSlotsDropped = new Set<number>();
      
      placedModules.forEach(module => {
        if ((module.placementWall || 'front') !== 'front') return;

        const moduleData = getModuleById(module.moduleId, internalSpace, spaceInfo);
        if (!moduleData) return;
        
        // 가구 위치(mm)로 영역 확인
        const moduleXMm = module.position.x * 100; // Three.js to mm
        const zoneResult = ColumnIndexer.findZoneAndSlotFromPosition(
          { x: moduleXMm }, 
          spaceInfo, 
          indexing
        );
        
        if (!zoneResult) return;
        
        const zoneColumnWidth = zoneResult.zone === 'normal' 
          ? zoneInfo.normal.columnWidth 
          : zoneInfo.dropped!.columnWidth;
          
        const isModuleDual = Math.abs(moduleData.dimensions.width - (zoneColumnWidth * 2)) < 50;
        
        if (zoneResult.zone === 'normal') {
          if (isModuleDual) {
            occupiedSlotsNormal.add(zoneResult.slotIndex);
            occupiedSlotsNormal.add(zoneResult.slotIndex + 1);
            console.log(`🔍 [메인] Dual furniture occupies slots: ${zoneResult.slotIndex}, ${zoneResult.slotIndex + 1}`);
          } else {
            occupiedSlotsNormal.add(zoneResult.slotIndex);
            console.log(`🔍 [메인] Single furniture occupies slot: ${zoneResult.slotIndex}`);
          }
        } else {
          if (isModuleDual) {
            occupiedSlotsDropped.add(zoneResult.slotIndex);
            occupiedSlotsDropped.add(zoneResult.slotIndex + 1);
            console.log(`🔍 [단내림] Dual furniture occupies slots: ${zoneResult.slotIndex}, ${zoneResult.slotIndex + 1}`);
          } else {
            occupiedSlotsDropped.add(zoneResult.slotIndex);
            console.log(`🔍 [단내림] Single furniture occupies slot: ${zoneResult.slotIndex}`);
          }
        }
      });
      
      // 타겟 위치가 어느 영역인지 확인 (targetColumn은 영역 내 인덱스)
      // 이 함수가 호출되는 시점에 targetColumn은 이미 영역별로 계산된 값
      // 따라서 호출자에서 영역 정보를 함께 전달받아야 함
      // 임시로 전역 인덱싱 사용
      const hasConflict = isDualFurniture 
        ? occupiedSlotsNormal.has(targetColumn) || occupiedSlotsNormal.has(targetColumn + 1) ||
          occupiedSlotsDropped.has(targetColumn) || occupiedSlotsDropped.has(targetColumn + 1)
        : occupiedSlotsNormal.has(targetColumn) || occupiedSlotsDropped.has(targetColumn);
      
      console.log(`🔍 Slot conflict check result: ${hasConflict}`);
      return hasConflict;
    }
    
    // 단내림이 없는 경우 기존 로직
    const columnWidth = indexing.columnWidth;
    const occupiedSlots = new Set<number>();
    
    placedModules.forEach(module => {
      if ((module.placementWall || 'front') !== 'front') return;

      const moduleData = getModuleById(module.moduleId, internalSpace, spaceInfo);
      if (!moduleData) return;
      
      const isModuleDual = Math.abs(moduleData.dimensions.width - (columnWidth * 2)) < 50;
      
      let moduleSlot = -1;
      if (isModuleDual) {
        if (indexing.threeUnitDualPositions) {
          moduleSlot = indexing.threeUnitDualPositions.findIndex((pos: number) => 
            Math.abs(pos - module.position.x) < 0.1
          );
          if (moduleSlot >= 0) {
            occupiedSlots.add(moduleSlot);
            occupiedSlots.add(moduleSlot + 1);
            console.log(`🔍 Dual furniture at slot ${moduleSlot} occupies slots: ${moduleSlot}, ${moduleSlot + 1}`);
          }
        }
      } else {
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
    
    let targetSlots: number[];
    if (isDualFurniture) {
      targetSlots = [targetColumn, targetColumn + 1];
    } else {
      targetSlots = [targetColumn];
    }
    
    console.log(`🔍 Target slots for ${isDualFurniture ? 'dual' : 'single'} furniture:`, targetSlots);
    
    const hasConflict = targetSlots.some(slot => occupiedSlots.has(slot));
    console.log(`🔍 Slot conflict check result: ${hasConflict}`);
    
    return hasConflict;
  };

  return { checkSlotOccupancy };
}; 
