import { PlacedModule } from '@/editor/shared/furniture/types';
import { getModuleById } from '@/data/modules';
import { ColumnIndexer, calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
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
  const indexing = calculateSpaceIndexing(spaceInfo);
  const internalSpace = calculateInternalSpace(spaceInfo);
  const zoneInfo = spaceInfo.droppedCeiling?.enabled
    ? ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount)
    : undefined;

  const resolveGlobalSlotIndex = (
    slot: number,
    zone?: 'normal' | 'dropped'
  ): number => {
    if (!spaceInfo.droppedCeiling?.enabled || !zoneInfo || slot < 0) {
      return slot;
    }

    const normalCount = zoneInfo.normal?.columnCount ?? 0;
    const droppedCount = zoneInfo.dropped?.columnCount ?? 0;
    const position = spaceInfo.droppedCeiling?.position;

    if (zone === 'normal') {
      if (position === 'left') {
        return slot >= droppedCount ? slot : slot + droppedCount;
      }
      return slot;
    }

    if (zone === 'dropped') {
      if (position === 'right') {
        return slot >= normalCount ? slot : slot + normalCount;
      }
      return slot;
    }

    return slot;
  };

  const totalZoneColumnCount = zoneInfo
    ? (zoneInfo.normal?.columnCount ?? 0) + (zoneInfo.dropped?.columnCount ?? 0)
    : indexing.columnCount;

  const effectiveColumnCount = Math.max(indexing.columnCount, totalZoneColumnCount);
  
  console.log('[SlotDebug] isSlotAvailable:start', {
    slotIndex,
    isDualFurniture,
    placedCount: placedModules.length,
    effectiveColumnCount,
    moduleId,
    excludeModuleId
  });
  
  // 범위 검사
  if (slotIndex < 0) {
    console.log('[SlotDebug] isSlotAvailable:range-fail', { reason: 'negative', slotIndex });
    return false;
  }
  if (isDualFurniture && slotIndex >= effectiveColumnCount - 1) {
    console.log('[SlotDebug] isSlotAvailable:range-fail', { reason: 'dual-out-of-range', slotIndex, effectiveColumnCount });
    return false;
  }
  if (!isDualFurniture && slotIndex >= effectiveColumnCount) {
    console.log('[SlotDebug] isSlotAvailable:range-fail', { reason: 'single-out-of-range', slotIndex, effectiveColumnCount });
    return false;
  }
  
  // 기둥 포함 슬롯 분석
  const columnSlots = analyzeColumnSlots(spaceInfo);
  
  // 목표 슬롯들 계산
  const targetSlots = isDualFurniture 
    ? [slotIndex, slotIndex + 1] 
    : [slotIndex];
  
  // 디버그 로그 제거 (성능 문제로 인해)
  
  // 기둥이 있는 슬롯은 150mm 이상의 공간이 있으면 배치 가능
  // (가구 폭이 150mm까지 줄어들 수 있음)
  for (const targetSlot of targetSlots) {
    const slotInfo = columnSlots[targetSlot];
    if (!slotInfo) {
      console.log(`⚠️ 슬롯 ${targetSlot}의 정보를 찾을 수 없음 (columnSlots 길이: ${columnSlots.length})`);
      continue;
    }
    
    // 디버그 로그 제거 (성능 문제로 인해)
    
    if (slotInfo.hasColumn) {
      // Column C (300mm) 특별 처리 - 듀얼 가구도 배치 가능 (2개의 싱글로 분할)
      if (slotInfo.columnType === 'medium' && slotInfo.allowMultipleFurniture) {
        // Column C는 듀얼 가구를 2개의 싱글로 분할하여 배치 가능
        if (isDualFurniture) {
          // Column C 슬롯에 이미 2개의 가구가 있는지 확인
          const furnitureInSlot = placedModules.filter(m => {
            if (typeof m.slotIndex !== 'number') {
              return false;
            }
            const moduleZone = m.zone as 'normal' | 'dropped' | undefined;
            const globalSlot = resolveGlobalSlotIndex(m.slotIndex, moduleZone);
            return globalSlot === targetSlot && m.id !== excludeModuleId;
          });
          
          if (furnitureInSlot.length >= 2) {
            return false; // 이미 2개의 가구가 있음
          }
          
          // 듀얼 가구는 배치 가능 (2개의 싱글로 분할됨)
          console.log('[SlotDebug] isSlotAvailable:columnC-dual-allowed', { slotIndex: targetSlot, furnitureInSlot: furnitureInSlot.length });
          return true;
        } else {
          // 싱글 가구는 빈 서브슬롯이 있으면 배치 가능
          const furnitureInSlot = placedModules.filter(m => {
            if (typeof m.slotIndex !== 'number') {
              return false;
            }
            const moduleZone = m.zone as 'normal' | 'dropped' | undefined;
            const globalSlot = resolveGlobalSlotIndex(m.slotIndex, moduleZone);
            return globalSlot === targetSlot && m.id !== excludeModuleId;
          });
          
          if (furnitureInSlot.length >= 2) {
            console.log('[SlotDebug] isSlotAvailable:columnC-single-full', { slotIndex: targetSlot, furnitureInSlot: furnitureInSlot.length });
            return false; // 이미 2개의 가구가 있음
          }
          
          console.log('[SlotDebug] isSlotAvailable:columnC-single-allowed', { slotIndex: targetSlot, furnitureInSlot: furnitureInSlot.length });
          return true; // 빈 서브슬롯이 있음
        }
      } else {
        // 일반 기둥 처리 (기존 로직)
        // 듀얼 가구는 기둥 슬롯에 배치 불가
        if (isDualFurniture) {
          console.log('[SlotDebug] isSlotAvailable:column-blocked', { slotIndex: targetSlot, reason: 'dual-hit-column' });
          return false;
        }
        
        // 싱글 가구는 기둥 침범 후에도 최소 150mm 공간이 있으면 배치 가능
        // 여기서는 일단 배치 가능하다고 판단하고, 실제 크기 계산은 SlotDropZones에서 처리
        // 가구 배치 가능 (기둥 침범 후 크기는 SlotDropZones에서 계산)
      }
    }
  }
  
  // Column C가 있는 슬롯인 경우 특별 처리
  const hasColumnC = targetSlots.some(slot => {
    const slotInfo = columnSlots[slot];
    return slotInfo?.hasColumn && slotInfo?.columnType === 'medium' && slotInfo?.allowMultipleFurniture;
  });
  
  if (hasColumnC) {
    // Column C 슬롯 - 3개까지 가구 배치 가능 (첫 번째 1개 + 기둥 앞 2개)
    const targetSlot = targetSlots[0]; // 단일 슬롯만 확인
    const furnitureInSlot = placedModules.filter(m => {
      if (typeof m.slotIndex !== 'number') {
        return false;
      }
      const moduleZone = m.zone as 'normal' | 'dropped' | undefined;
      const globalSlot = resolveGlobalSlotIndex(m.slotIndex, moduleZone);
      return globalSlot === targetSlot && m.id !== excludeModuleId;
    });
    
    console.log('🔵 Column C 슬롯 가용성 확인:', {
      slotIndex: targetSlot,
      기존가구수: furnitureInSlot.length,
      isDualFurniture,
      배치가능: furnitureInSlot.length < 3
    });
    
    const columnCResult = furnitureInSlot.length < 3;
    console.log('[SlotDebug] isSlotAvailable:columnC-result', { slotIndex: targetSlot, columnCResult });
    return columnCResult; // 3개 미만이면 배치 가능
  } else if (targetSlots.some(slot => columnSlots[slot]?.hasColumn)) {
    // 일반 기둥이 있는 슬롯 - 기존 로직
    return true;
  } else {
    // 기둥이 없는 슬롯에서는 기존 로직 사용
    
    // 배치하려는 모듈의 카테고리 확인
    const newModuleData = getModuleById(moduleId, internalSpace, spaceInfo);
    const newCategory = newModuleData?.category;
    const isNewUpper = newCategory === 'upper';
    const isNewLower = newCategory === 'lower';
    
    for (const placedModule of placedModules) {
      // 제외할 모듈은 건너뛰기
      if (excludeModuleId && placedModule.id === excludeModuleId) {
        continue;
      }

      // zone이 지정된 경우, 다른 zone의 가구는 무시
      if (targetZone) {
        const moduleZone = placedModule.zone || 'normal';
        console.log('🔍 [isSlotAvailable] Zone 체크:', {
          targetZone,
          moduleZone,
          placedModuleId: placedModule.id,
          placedModuleSlotIndex: placedModule.slotIndex,
          match: moduleZone === targetZone
        });
        if (moduleZone !== targetZone) {
          console.log('  → 다른 zone이므로 무시');
          continue; // 다른 zone의 가구는 체크 안함
        }
        console.log('  → 같은 zone, 충돌 체크 계속');
      }

      const moduleData = getModuleById(placedModule.moduleId, internalSpace, spaceInfo);
      if (!moduleData) continue;

      // 기존 가구의 카테고리 확인
      const existingCategory = moduleData.category;
      const isExistingUpper = existingCategory === 'upper';
      const isExistingLower = existingCategory === 'lower';

      // 상부장과 하부장은 같은 슬롯에 공존 가능
      if ((isNewUpper && isExistingLower) || (isNewLower && isExistingUpper)) {
        // 공존 가능한 경우, 이 모듈은 충돌로 간주하지 않음
        console.log('✅ 상부장-하부장 공존 가능 (isSlotAvailable):', {
          기존: { id: placedModule.id, category: existingCategory },
          새가구: { moduleId, category: newCategory }
        });
        continue;
      }
      
      // 같은 카테고리끼리는 공존 불가능 (상부장-상부장, 하부장-하부장)
      if ((isNewUpper && isExistingUpper) || (isNewLower && isExistingLower)) {
        console.log('❌ 같은 카테고리 충돌 (isSlotAvailable):', {
          기존: { id: placedModule.id, category: existingCategory },
          새가구: { moduleId, category: newCategory }
        });
        // 충돌 체크는 아래에서 계속 진행
      }
      
      // 기존 가구의 듀얼/싱글 여부 판별 - isDualSlot 속성을 우선 사용
      const isModuleDual = placedModule.isDualSlot !== undefined ? placedModule.isDualSlot : 
                          Math.abs(moduleData.dimensions.width - (indexing.columnWidth * 2)) < 50;
      
      // 기존 모듈의 슬롯 위치 찾기 - slotIndex 속성을 우선 사용
      const storedSlot = placedModule.slotIndex;
      const moduleZone = placedModule.zone as 'normal' | 'dropped' | undefined;

      // targetZone이 지정된 경우, 로컬 인덱스로 직접 비교
      let moduleSlot: number;
      let moduleSlots: number[];

      if (targetZone && typeof storedSlot === 'number') {
        // 로컬 인덱스로 직접 비교 (zone이 같은 경우만 여기까지 옴)
        moduleSlot = storedSlot;
        if (isModuleDual) {
          moduleSlots = [moduleSlot, moduleSlot + 1];
        } else {
          moduleSlots = [moduleSlot];
        }
        console.log('🔍 [isSlotAvailable] 로컬 인덱스 비교:', {
          targetSlots,
          moduleSlots,
          placedModuleId: placedModule.id
        });
      } else {
        // 글로벌 인덱스로 변환하여 비교 (기존 로직)
        moduleSlot = typeof storedSlot === 'number'
          ? resolveGlobalSlotIndex(storedSlot, moduleZone)
          : -1;

        // slotIndex가 없는 경우에만 위치로부터 계산
        if (moduleSlot === -1) {
          if (isModuleDual && indexing.threeUnitDualPositions) {
            moduleSlot = indexing.threeUnitDualPositions.findIndex((pos: number) =>
              Math.abs(pos - placedModule.position.x) < 0.1
            );
          } else {
            moduleSlot = indexing.threeUnitPositions.findIndex((pos: number) =>
              Math.abs(pos - placedModule.position.x) < 0.1
            );
          }
          moduleSlot = resolveGlobalSlotIndex(moduleSlot, moduleZone);
        }

        moduleSlots = (() => {
          if (!isModuleDual) {
            return [moduleSlot];
          }

          if (typeof storedSlot === 'number') {
            const second = resolveGlobalSlotIndex(storedSlot + 1, moduleZone);
            return [moduleSlot, second];
          }

          return [moduleSlot, moduleSlot + 1];
        })();
      }

      if (moduleSlot >= 0) {
        const hasOverlap = targetSlots.some(slot => moduleSlots.includes(slot));

        if (hasOverlap) {
          // 상부장과 하부장 공존은 허용되므로 이미 위에서 체크함
          console.log('🚫 슬롯 충돌 감지 (isSlotAvailable):', {
            targetSlots,
            existingModule: {
              id: placedModule.id,
              moduleId: placedModule.moduleId,
              slotIndex: moduleSlot,
              slotIndexGlobal: moduleSlots[0],
              isDual: isModuleDual,
              occupiedSlots: moduleSlots,
              category: existingCategory
            },
            newModule: {
              moduleId,
              category: newCategory
            },
            isDualFurniture,
            conflict: true
          });
          console.log('[SlotDebug] isSlotAvailable:conflict', {
            conflictWith: placedModule.id,
            conflictModuleSlot: moduleSlot,
            targetSlots,
            isDualFurniture
          });
          return false; // 충돌 발견
        }
      }
    }
  }
  
  console.log('[SlotDebug] isSlotAvailable:success', { slotIndex, isDualFurniture });
  return true; // 사용 가능
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

  // zone별 슬롯 범위 계산
  let maxSlot: number;
  if (targetZone && indexing.zones) {
    const zoneInfo = targetZone === 'dropped' ? indexing.zones.dropped : indexing.zones.normal;
    if (!zoneInfo) {
      console.log('⚠️ [findNextAvailableSlot] Zone 정보 없음:', targetZone);
      return null;
    }
    maxSlot = zoneInfo.columnCount - (isDualFurniture ? 1 : 0);
    console.log('🔍 [findNextAvailableSlot] Zone 범위:', {
      targetZone,
      maxSlot,
      zoneColumnCount: zoneInfo.columnCount
    });
  } else {
    maxSlot = indexing.columnCount - (isDualFurniture ? 1 : 0);
  }

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
  const zoneInfo = spaceInfo.droppedCeiling?.enabled
    ? ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount)
    : undefined;

  const resolveGlobalSlotIndex = (
    slot: number,
    zone?: 'normal' | 'dropped'
  ): number => {
    if (!spaceInfo.droppedCeiling?.enabled || !zoneInfo || slot < 0) {
      return slot;
    }

    const normalCount = zoneInfo.normal?.columnCount ?? 0;
    const droppedCount = zoneInfo.dropped?.columnCount ?? 0;
    const position = spaceInfo.droppedCeiling?.position;

    if (zone === 'normal') {
      if (position === 'left') {
        return slot >= droppedCount ? slot : slot + droppedCount;
      }
      return slot;
    }

    if (zone === 'dropped') {
      if (position === 'right') {
        return slot >= normalCount ? slot : slot + normalCount;
      }
      return slot;
    }

    return slot;
  };

  const totalZoneColumnCount = zoneInfo
    ? (zoneInfo.normal?.columnCount ?? 0) + (zoneInfo.dropped?.columnCount ?? 0)
    : indexing.columnCount;

  const effectiveColumnCount = Math.max(indexing.columnCount, totalZoneColumnCount);
  
  // 전체 슬롯 점유 상태 맵
  const occupancyMap = new Array(effectiveColumnCount).fill('[ ]');
  const slotDetails: Record<number, { modules: string[], isDual: boolean[] }> = {};
  
  // 각 슬롯 초기화
  for (let i = 0; i < effectiveColumnCount; i++) {
    slotDetails[i] = { modules: [], isDual: [] };
  }
  
  placedModules.forEach((module, index) => {
    // isDualSlot 속성을 우선 사용
    const isModuleDual = module.isDualSlot !== undefined ? module.isDualSlot : false;
    const storedSlot = module.slotIndex;
    const moduleZone = module.zone as 'normal' | 'dropped' | undefined;
    let moduleSlot = typeof storedSlot === 'number'
      ? resolveGlobalSlotIndex(storedSlot, moduleZone)
      : -1;

    if (moduleSlot === -1) {
      if (isModuleDual && indexing.threeUnitDualPositions) {
        moduleSlot = indexing.threeUnitDualPositions.findIndex((pos: number) => 
          Math.abs(pos - module.position.x) < 0.1
        );
      } else {
        moduleSlot = indexing.threeUnitPositions.findIndex((pos: number) => 
          Math.abs(pos - module.position.x) < 0.1
        );
      }
      moduleSlot = resolveGlobalSlotIndex(moduleSlot, moduleZone);
    }

    if (moduleSlot >= 0) {
      const moduleLabel = String.fromCharCode(65 + index);
      const secondarySlot = isModuleDual && typeof storedSlot === 'number'
        ? resolveGlobalSlotIndex((storedSlot as number) + 1, moduleZone)
        : moduleSlot + 1;
      
      if (isModuleDual) {
        // 듀얼 가구는 2개 슬롯 차지
        if (slotDetails[moduleSlot]) {
          slotDetails[moduleSlot].modules.push(moduleLabel);
          slotDetails[moduleSlot].isDual.push(true);
        }
        if (secondarySlot < effectiveColumnCount && slotDetails[secondarySlot]) {
          slotDetails[secondarySlot].modules.push(moduleLabel);
          slotDetails[secondarySlot].isDual.push(true);
        }
        
        occupancyMap[moduleSlot] = `[${moduleLabel}`;
        if (secondarySlot < effectiveColumnCount) {
          occupancyMap[secondarySlot] = `${moduleLabel}]`;
        }
      } else {
        // 싱글 가구는 1개 슬롯 차지
        if (slotDetails[moduleSlot]) {
          slotDetails[moduleSlot].modules.push(moduleLabel);
          slotDetails[moduleSlot].isDual.push(false);
        }
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
    총슬롯수: effectiveColumnCount,
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
