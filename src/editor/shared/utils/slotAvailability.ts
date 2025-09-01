import { PlacedModule } from '@/editor/shared/furniture/types';
import { getModuleById } from '@/data/modules';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { analyzeColumnSlots, canPlaceFurnitureInColumnSlot, ColumnSlotInfo } from './columnSlotProcessor';

/**
 * 특정 슬롯이 사용 가능한지 확인하는 함수
 * @param slotIndex 확인할 슬롯 인덱스
 * @param isDualFurniture 배치할 가구가 듀얼인지 여부
 * @param placedModules 현재 배치된 가구 목록
 * @param spaceInfo 공간 정보
 * @param moduleId 배치하려는 가구의 모듈 ID
 * @param excludeModuleId 제외할 모듈 ID (자기 자신)
 * @returns 슬롯 사용 가능 여부
 */
export const isSlotAvailable = (
  slotIndex: number,
  isDualFurniture: boolean,
  placedModules: PlacedModule[],
  spaceInfo: SpaceInfo,
  moduleId: string,
  excludeModuleId?: string,
  targetZone?: 'normal' | 'dropped'
): boolean => {
  console.log('🔍 isSlotAvailable 시작:', {
    targetSlot: slotIndex,
    isDualFurniture,
    moduleId,
    총가구수: placedModules.length,
    placedModules: placedModules.map(m => ({
      id: m.id,
      moduleId: m.moduleId,
      slotIndex: m.slotIndex,
      position: m.position
    })),
    excludeModuleId,
    targetZone,
    droppedCeilingEnabled: spaceInfo.droppedCeiling?.enabled
  });
  
  const indexing = calculateSpaceIndexing(spaceInfo);
  const internalSpace = calculateInternalSpace(spaceInfo);
  
  // 범위 검사
  if (slotIndex < 0) return false;
  if (isDualFurniture && slotIndex >= indexing.columnCount - 1) return false;
  if (!isDualFurniture && slotIndex >= indexing.columnCount) return false;
  
  // 기둥 포함 슬롯 분석
  const columnSlots = analyzeColumnSlots(spaceInfo);
  
  // 목표 슬롯들 계산
  const targetSlots = isDualFurniture 
    ? [slotIndex, slotIndex + 1] 
    : [slotIndex];
  
  // 새로운 모듈 데이터 가져오기
  const newModuleData = getModuleById(moduleId, internalSpace, spaceInfo);
  const isNewUpper = newModuleData?.category === 'upper' || 
                    moduleId.includes('upper-cabinet') || 
                    moduleId.includes('dual-upper-cabinet');
  const isNewLower = newModuleData?.category === 'lower' || 
                    moduleId.includes('lower-cabinet') || 
                    moduleId.includes('dual-lower-cabinet');

  console.log('📋 새 가구 정보:', {
    moduleId,
    category: newModuleData?.category,
    isUpper: isNewUpper,
    isLower: isNewLower,
    targetSlots
  });

  // 1. 먼저 같은 슬롯에 배치된 가구들과의 충돌 검사 (상하부장 공존 허용)
  for (const placedModule of placedModules) {
    // 제외할 모듈은 건너뛰기
    if (excludeModuleId && placedModule.id === excludeModuleId) {
      continue;
    }
    
    // zone이 다른 경우 충돌 검사 제외
    if (targetZone && placedModule.zone && placedModule.zone !== targetZone) {
      console.log('🔄 다른 zone이므로 건너뛰기:', {
        targetZone,
        placedModuleZone: placedModule.zone,
        moduleId: placedModule.moduleId
      });
      continue;
    }
    
    const moduleData = getModuleById(placedModule.moduleId, internalSpace, spaceInfo);
    if (!moduleData) continue;
    
    // 기존 가구의 듀얼/싱글 여부 판별
    const isModuleDual = placedModule.moduleId.includes('dual-') || 
                        (placedModule.isDualSlot !== undefined ? placedModule.isDualSlot : 
                        Math.abs(moduleData.dimensions.width - (indexing.columnWidth * 2)) < 50);
    
    // 기존 모듈의 슬롯 위치 찾기
    let moduleSlot = placedModule.slotIndex;
    
    // slotIndex가 undefined인 경우 위치로부터 계산
    if (moduleSlot === undefined || moduleSlot === null) {
      if (!placedModule.position || placedModule.position.x === undefined) {
        continue;
      }
      
      // 위치로부터 슬롯 인덱스 계산 (간략화)
      const positions = isModuleDual && indexing.threeUnitDualPositions 
        ? Object.values(indexing.threeUnitDualPositions)
        : indexing.threeUnitPositions;
      
      let minDistance = Infinity;
      let closestSlot = -1;
      
      positions.forEach((pos: any, idx: number) => {
        const distance = Math.abs(pos - placedModule.position.x);
        if (distance < minDistance) {
          minDistance = distance;
          closestSlot = idx;
        }
      });
      
      if (minDistance < 0.1) {
        moduleSlot = closestSlot;
      } else {
        const estimatedSlot = Math.floor((placedModule.position.x + (internalSpace.width * 0.005)) / (indexing.columnWidth * 0.01));
        if (estimatedSlot >= 0 && estimatedSlot < indexing.columnCount) {
          moduleSlot = estimatedSlot;
        } else {
          continue;
        }
      }
    }
    
    // 슬롯 위치를 찾은 경우만 충돌 검사
    if (moduleSlot !== undefined && moduleSlot !== null && moduleSlot >= 0) {
      const moduleSlots = isModuleDual ? [moduleSlot, moduleSlot + 1] : [moduleSlot];
      const hasOverlap = targetSlots.some(slot => moduleSlots.includes(slot));
      
      if (hasOverlap) {
        const isExistingUpper = moduleData.category === 'upper' || 
                               placedModule.moduleId.includes('upper-cabinet') || 
                               placedModule.moduleId.includes('dual-upper-cabinet');
        const isExistingLower = moduleData.category === 'lower' || 
                               placedModule.moduleId.includes('lower-cabinet') || 
                               placedModule.moduleId.includes('dual-lower-cabinet');
        
        console.log('🔍 충돌 검사:', {
          새가구: { moduleId, isUpper: isNewUpper, isLower: isNewLower },
          기존가구: { moduleId: placedModule.moduleId, isUpper: isExistingUpper, isLower: isExistingLower },
          상하부장조합: (isNewUpper && isExistingLower) || (isNewLower && isExistingUpper)
        });
        
        // 상부장과 하부장은 같은 슬롯에 공존 가능
        if ((isNewUpper && isExistingLower) || (isNewLower && isExistingUpper)) {
          console.log('✅ 상부장/하부장 공존 가능 - 충돌 없음');
          continue; // 다음 가구 검사
        }
        
        // 같은 카테고리거나 호환되지 않는 가구는 충돌
        console.log('🚫 슬롯 충돌! 배치 불가');
        return false;
      }
    }
  }
  
  // 2. 기둥이 있는 슬롯에 대한 특별 처리
  for (const targetSlot of targetSlots) {
    const slotInfo = columnSlots[targetSlot];
    if (!slotInfo) continue;
    
    if (slotInfo.hasColumn) {
      // Column C 특별 처리
      if (slotInfo.columnType === 'medium' && slotInfo.allowMultipleFurniture) {
        // Column C는 여러 가구 배치 가능
        const furnitureInSlot = placedModules.filter(m => 
          m.slotIndex === targetSlot && 
          m.id !== excludeModuleId &&
          (!targetZone || m.zone === targetZone)
        );
        
        // 상하부장은 서로 공존 가능하므로 별도로 카운트
        const upperCount = furnitureInSlot.filter(m => {
          const data = getModuleById(m.moduleId, internalSpace, spaceInfo);
          return data?.category === 'upper' || m.moduleId.includes('upper-cabinet');
        }).length;
        
        const lowerCount = furnitureInSlot.filter(m => {
          const data = getModuleById(m.moduleId, internalSpace, spaceInfo);
          return data?.category === 'lower' || m.moduleId.includes('lower-cabinet');
        }).length;
        
        const otherCount = furnitureInSlot.length - upperCount - lowerCount;
        
        // Column C에서도 상부장과 하부장은 공존 가능
        // 상부장/하부장은 각각 1개씩만 허용
        if (isNewUpper && upperCount >= 1) {
          console.log('🚫 Column C: 이미 상부장이 있어 추가 상부장 배치 불가');
          return false;
        }
        if (isNewLower && lowerCount >= 1) {
          console.log('🚫 Column C: 이미 하부장이 있어 추가 하부장 배치 불가');
          return false;
        }
        // 기타 가구는 추가 제한
        if (!isNewUpper && !isNewLower && otherCount >= 2) {
          console.log('🚫 Column C: 기타 가구는 최대 2개까지만 배치 가능');
          return false;
        }
        
        // 상부장과 하부장 공존은 명시적으로 허용
        console.log('✅ Column C: 상부장/하부장 공존 체크 통과', {
          isNewUpper,
          isNewLower,
          upperCount,
          lowerCount,
          otherCount
        });
        
      } else {
        // 일반 기둥 처리
        if (isDualFurniture) {
          return false; // 듀얼 가구는 일반 기둥 슬롯에 배치 불가
        }
        // 싱글 가구는 기둥과 함께 배치 가능 (크기 조정은 다른 곳에서 처리)
      }
    }
  }
  
  console.log('✅ 슬롯 사용 가능!');
  return true;
};

/**
 * 지정된 방향으로 다음 사용 가능한 슬롯을 찾는 함수
 * @param currentSlot 현재 슬롯 인덱스
 * @param direction 검색 방향
 * @param isDualFurniture 가구가 듀얼인지 여부
 * @param placedModules 현재 배치된 가구 목록
 * @param spaceInfo 공간 정보
 * @param moduleId 배치하려는 가구의 모듈 ID
 * @param excludeModuleId 제외할 모듈 ID (자기 자신)
 * @returns 사용 가능한 슬롯 인덱스 또는 null
 */
export const findNextAvailableSlot = (
  currentSlot: number,
  direction: 'left' | 'right',
  isDualFurniture: boolean,
  placedModules: PlacedModule[],
  spaceInfo: SpaceInfo,
  moduleId: string,
  excludeModuleId?: string,
  targetZone?: 'normal' | 'dropped'
): number | null => {
  const indexing = calculateSpaceIndexing(spaceInfo);
  const step = direction === 'left' ? -1 : 1;
  const maxSlot = indexing.columnCount - (isDualFurniture ? 1 : 0);
  
  // 듀얼장의 경우 한 칸씩만 이동하도록 수정
  // 싱글장은 기존대로 동작
  const moveStep = step;
  
  // 방향에 따라 끝까지 검색
  for (let slot = currentSlot + moveStep; 
       direction === 'right' ? slot <= maxSlot : slot >= 0; 
       slot += moveStep) {
    
    if (isSlotAvailable(slot, isDualFurniture, placedModules, spaceInfo, moduleId, excludeModuleId, targetZone)) {
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
  const internalSpace = calculateInternalSpace(spaceInfo);
  
  // 전체 슬롯 점유 상태 맵
  const occupancyMap = new Array(indexing.columnCount).fill('[ ]');
  const slotDetails: Record<number, { modules: string[], isDual: boolean[] }> = {};
  
  // 각 슬롯 초기화
  for (let i = 0; i < indexing.columnCount; i++) {
    slotDetails[i] = { modules: [], isDual: [] };
  }
  
  placedModules.forEach((module, index) => {
    // isDualSlot 속성을 우선 사용
    const isModuleDual = module.isDualSlot !== undefined ? module.isDualSlot : false;
    const moduleSlot = module.slotIndex !== undefined ? module.slotIndex : -1;
    
    if (moduleSlot >= 0) {
      const moduleLabel = String.fromCharCode(65 + index);
      
      if (isModuleDual) {
        // 듀얼 가구는 2개 슬롯 차지
        slotDetails[moduleSlot].modules.push(moduleLabel);
        slotDetails[moduleSlot].isDual.push(true);
        if (moduleSlot + 1 < indexing.columnCount) {
          slotDetails[moduleSlot + 1].modules.push(moduleLabel);
          slotDetails[moduleSlot + 1].isDual.push(true);
        }
        
        occupancyMap[moduleSlot] = `[${moduleLabel}`;
        if (moduleSlot + 1 < indexing.columnCount) {
          occupancyMap[moduleSlot + 1] = `${moduleLabel}]`;
        }
      } else {
        // 싱글 가구는 1개 슬롯 차지
        slotDetails[moduleSlot].modules.push(moduleLabel);
        slotDetails[moduleSlot].isDual.push(false);
        occupancyMap[moduleSlot] = `[${moduleLabel}]`;
      }
    }
  });
  
  // 문제가 있는 슬롯 찾기 (1개 이상의 가구가 있는 슬롯)
  const problematicSlots: number[] = [];
  Object.entries(slotDetails).forEach(([slot, details]) => {
    if (details.modules.length > 1) {
      problematicSlots.push(parseInt(slot));
    }
  });
  
  console.log('📊 전체 슬롯 점유 상태:', {
    총슬롯수: indexing.columnCount,
    배치된가구수: placedModules.length,
    듀얼가구수: placedModules.filter(m => m.isDualSlot).length,
    싱글가구수: placedModules.filter(m => !m.isDualSlot).length,
    점유맵: occupancyMap.join(' '),
    문제슬롯: problematicSlots,
    슬롯상세: slotDetails
  });
  
  if (problematicSlots.length > 0) {
    console.error('⚠️ 슬롯 충돌 발견!', problematicSlots.map(slot => ({
      슬롯번호: slot,
      가구들: slotDetails[slot].modules,
      듀얼여부: slotDetails[slot].isDual
    })));
  }
}; 