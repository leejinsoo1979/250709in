import { PlacedModule } from '@/editor/shared/furniture/types';
import { getModuleById } from '@/data/modules';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import { SpaceInfo } from '@/store/core/spaceConfigStore';

/**
 * 특정 슬롯이 사용 가능한지 확인하는 함수
 * @param slotIndex 확인할 슬롯 인덱스
 * @param isDualFurniture 배치할 가구가 듀얼인지 여부
 * @param placedModules 현재 배치된 가구 목록
 * @param spaceInfo 공간 정보
 * @param excludeModuleId 제외할 모듈 ID (자기 자신)
 * @returns 슬롯 사용 가능 여부
 */
export const isSlotAvailable = (
  slotIndex: number,
  isDualFurniture: boolean,
  placedModules: PlacedModule[],
  spaceInfo: SpaceInfo,
  excludeModuleId?: string
): boolean => {
  const indexing = calculateSpaceIndexing(spaceInfo);
  const internalSpace = calculateInternalSpace(spaceInfo);
  
  // 범위 검사
  if (slotIndex < 0) return false;
  if (isDualFurniture && slotIndex >= indexing.columnCount - 1) return false;
  if (!isDualFurniture && slotIndex >= indexing.columnCount) return false;
  
  // 목표 슬롯들 계산
  const targetSlots = isDualFurniture 
    ? [slotIndex, slotIndex + 1] 
    : [slotIndex];
  
  // 기존 가구들과 충돌 검사
  for (const placedModule of placedModules) {
    // 제외할 모듈은 건너뛰기
    if (excludeModuleId && placedModule.id === excludeModuleId) {
      continue;
    }
    
    const moduleData = getModuleById(placedModule.moduleId, internalSpace, spaceInfo);
    if (!moduleData) continue;
    
    // 기존 가구의 듀얼/싱글 여부 판별
    const isModuleDual = Math.abs(moduleData.dimensions.width - (indexing.columnWidth * 2)) < 50;
    
    // 기존 모듈의 슬롯 위치 찾기
    let moduleSlot = -1;
    if (isModuleDual && indexing.threeUnitDualPositions) {
      moduleSlot = indexing.threeUnitDualPositions.findIndex((pos: number) => 
        Math.abs(pos - placedModule.position.x) < 0.1
      );
    } else {
      moduleSlot = indexing.threeUnitPositions.findIndex((pos: number) => 
        Math.abs(pos - placedModule.position.x) < 0.1
      );
    }
    
    if (moduleSlot >= 0) {
      const moduleSlots = isModuleDual ? [moduleSlot, moduleSlot + 1] : [moduleSlot];
      const hasOverlap = targetSlots.some(slot => moduleSlots.includes(slot));
      
      if (hasOverlap) {
        return false; // 충돌 발견
      }
    }
  }
  
  return true; // 사용 가능
};

/**
 * 지정된 방향으로 다음 사용 가능한 슬롯을 찾는 함수
 * @param currentSlot 현재 슬롯 인덱스
 * @param direction 검색 방향
 * @param isDualFurniture 가구가 듀얼인지 여부
 * @param placedModules 현재 배치된 가구 목록
 * @param spaceInfo 공간 정보
 * @param excludeModuleId 제외할 모듈 ID (자기 자신)
 * @returns 사용 가능한 슬롯 인덱스 또는 null
 */
export const findNextAvailableSlot = (
  currentSlot: number,
  direction: 'left' | 'right',
  isDualFurniture: boolean,
  placedModules: PlacedModule[],
  spaceInfo: SpaceInfo,
  excludeModuleId?: string
): number | null => {
  const indexing = calculateSpaceIndexing(spaceInfo);
  const step = direction === 'left' ? -1 : 1;
  const maxSlot = indexing.columnCount - (isDualFurniture ? 1 : 0);
  
  // 방향에 따라 끝까지 검색
  for (let slot = currentSlot + step; 
       direction === 'right' ? slot <= maxSlot : slot >= 0; 
       slot += step) {
    
    if (isSlotAvailable(slot, isDualFurniture, placedModules, spaceInfo, excludeModuleId)) {
      return slot;
    }
  }
  
  return null; // 해당 방향에 빈 슬롯 없음
};

/**
 * 슬롯 점유 상태를 시각적으로 디버깅하는 함수
 */
export const debugSlotOccupancy = (placedModules: PlacedModule[], spaceInfo: SpaceInfo): void => {
  const indexing = calculateSpaceIndexing(spaceInfo);
  const occupancyMap = new Array(indexing.columnCount).fill('[ ]');
  
  placedModules.forEach((module, index) => {
    const internalSpace = calculateInternalSpace(spaceInfo);
    const moduleData = getModuleById(module.moduleId, internalSpace, spaceInfo);
    if (!moduleData) return;
    
    const isModuleDual = Math.abs(moduleData.dimensions.width - (indexing.columnWidth * 2)) < 50;
    
    let moduleSlot = -1;
    if (isModuleDual && indexing.threeUnitDualPositions) {
      moduleSlot = indexing.threeUnitDualPositions.findIndex((pos: number) => 
        Math.abs(pos - module.position.x) < 0.1
      );
      if (moduleSlot >= 0) {
        occupancyMap[moduleSlot] = `[${String.fromCharCode(65 + index)}`;
        occupancyMap[moduleSlot + 1] = `${String.fromCharCode(65 + index)}]`;
      }
    } else {
      moduleSlot = indexing.threeUnitPositions.findIndex((pos: number) => 
        Math.abs(pos - module.position.x) < 0.1
      );
      if (moduleSlot >= 0) {
        occupancyMap[moduleSlot] = `[${String.fromCharCode(65 + index)}]`;
      }
    }
  });
  
  console.log('🔍 슬롯 점유 상태:', occupancyMap.join(' '));
}; 