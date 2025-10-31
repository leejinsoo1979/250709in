import { useState, useCallback, useEffect } from 'react';
import { PlacedModule } from '../types';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateSpaceIndexing, findSlotIndexFromPosition } from '@/editor/shared/utils/indexing';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import { getModuleById } from '@/data/modules';
import { isSlotAvailable, findNextAvailableSlot } from '@/editor/shared/utils/slotAvailability';
import { ColumnIndexer } from '@/editor/shared/utils/indexing';

interface UseFurnitureSpaceAdapterProps {
  setPlacedModules: React.Dispatch<React.SetStateAction<PlacedModule[]>>;
}

export const useFurnitureSpaceAdapter = ({ setPlacedModules }: UseFurnitureSpaceAdapterProps) => {
  // 공간 변경 모드 상태 관리
  const [spaceChangeMode, setSpaceChangeMode] = useState<boolean>(false);



  // 새로운 공간에 맞게 가구 업데이트 함수 (간단한 버전)
  const updateFurnitureForNewSpace = useCallback((oldSpaceInfo: SpaceInfo, newSpaceInfo: SpaceInfo) => {
    setPlacedModules(currentModules => {
      if (currentModules.length === 0) return currentModules;
      
      const oldIndexing = calculateSpaceIndexing(oldSpaceInfo);
      const newIndexing = calculateSpaceIndexing(newSpaceInfo);
      
      // 컬럼 변경이 있을 때만 로그 출력
      if (oldIndexing.columnCount !== newIndexing.columnCount || oldIndexing.columnWidth !== newIndexing.columnWidth) {
      }
      
      const updatedModules: PlacedModule[] = [];
      
      currentModules.forEach(module => {
        // 가구가 이미 zone 정보를 가지고 있는 경우 해당 영역 내에서만 처리
        if (module.zone && newSpaceInfo.droppedCeiling?.enabled) {
          const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(newSpaceInfo, newSpaceInfo.customColumnCount);
          
          if (!zoneInfo.dropped && module.zone === 'dropped') {
            // 단내림이 제거된 경우 단내림 영역 가구 제거
            return;
          }
          
          // 영역별 처리
          const targetZone = module.zone === 'dropped' && zoneInfo.dropped ? zoneInfo.dropped : zoneInfo.normal;
          const zoneSpaceInfo = {
            ...newSpaceInfo,
            width: targetZone.width,
            customColumnCount: targetZone.columnCount
          };
          const zoneInternalSpace = {
            ...calculateInternalSpace(newSpaceInfo),
            width: targetZone.width,
            startX: targetZone.startX
          };
          
          // 영역별 모듈 데이터 가져오기
          const moduleData = getModuleById(module.moduleId, zoneInternalSpace, zoneSpaceInfo);
          if (!moduleData) {
            updatedModules.push({
              ...module,
              isValidInCurrentSpace: false
            });
            return;
          }
          
          // 영역 내에서 위치 재계산
          const slotIndex = module.slotIndex || 0;
          if (slotIndex >= targetZone.columnCount) {
            updatedModules.push({
              ...module,
              isValidInCurrentSpace: false
            });
            return;
          }
          
          const isDual = module.moduleId.startsWith('dual-');
          const newX = targetZone.startX + (slotIndex * targetZone.columnWidth) + 
                      (isDual ? targetZone.columnWidth : targetZone.columnWidth / 2);
          
          // 영역에 맞는 새로운 moduleId 생성
          // 모듈 타입(single/dual)을 유지하면서 새로운 너비로 업데이트
          // 소수점 포함 숫자만 정확히 제거하는 패턴
          const baseType = module.baseModuleType || module.moduleId.replace(/-[\d.]+$/, ''); // baseModuleType 우선 사용
          const newModuleId = `${baseType}-${Math.round(targetZone.columnWidth * (isDual ? 2 : 1) * 10) / 10}`;
          
          // 디버깅: baseModuleType 확인
          if (module.moduleId.includes('hanging')) {
          }
          
          
          updatedModules.push({
            ...module,
            moduleId: newModuleId,
            position: { ...module.position, x: newX * 0.01 }, // mm to Three.js units
            isValidInCurrentSpace: true,
            adjustedWidth: undefined, // 공간 변경 시 초기화 - indexing.slotWidths 사용하도록
            customWidth: undefined, // 공간 변경 시 초기화 - indexing.slotWidths 사용하도록
            isDualSlot: isDual
          });
          return;
        }
        
        // zone 정보가 없는 기존 가구들을 위한 폴백 로직
        const oldInternalSpace = calculateInternalSpace(oldSpaceInfo);
        const moduleData = getModuleById(module.moduleId, oldInternalSpace, oldSpaceInfo);
        
        let slotIndex: number | undefined = module.slotIndex;
        
        // slotIndex가 없는 경우에만 위치에서 계산 (하위 호환성)
        if (slotIndex === undefined && moduleData) {
          const isDualFurniture = Math.abs(moduleData.dimensions.width - (oldIndexing.columnWidth * 2)) < 50;
          slotIndex = findSlotIndexFromPosition(module.position, oldIndexing, isDualFurniture);
        }
        
        if (slotIndex === undefined || slotIndex < 0) {
          // 가구 삭제 대신 원래 위치에 그대로 유지
          updatedModules.push({
            ...module,
            isValidInCurrentSpace: false // 유효하지 않음 표시
          });
          return;
        }
        
        // 새로운 moduleId 계산 (동적 모듈의 경우 숫자 부분을 새로운 컬럼 폭으로 교체)
        let newModuleId = module.moduleId;
        let isDualModule = false;
        
        // 듀얼 모듈 패턴 처리 (숫자가 컬럼폭*2인 경우)
        const dualPatterns = [
          /^(dual-[^-]+(?:-[^-]+)*)-(\d+(?:\.\d+)?)$/,  // dual-2drawer-hanging-1200, dual-2tier-hanging-1200 등
          /^(dual-upper-cabinet-[^-]+(?:-[^-]+)*)-(\d+(?:\.\d+)?)$/,  // dual-upper-cabinet-shelf-1200 등
          /^(dual-lower-cabinet-[^-]+(?:-[^-]+)*)-(\d+(?:\.\d+)?)$/,  // dual-lower-cabinet-2tier-1200 등
        ];
        
        for (const pattern of dualPatterns) {
          const match = module.moduleId.match(pattern);
          if (match) {
            const oldWidth = parseFloat(match[2]); // 두 번째 캡처 그룹이 숫자 (소수점 포함)
            // 듀얼 모듈인지 확인 (기존 폭이 컬럼폭*2와 유사한지)
            if (Math.abs(oldWidth - (oldIndexing.columnWidth * 2)) < 50) {
              // 소수점 1자리까지 정확히 처리
              newModuleId = `${match[1]}-${Math.round(newIndexing.columnWidth * 2 * 10) / 10}`;
              isDualModule = true;
              
              // 디버깅: hanging 타입 체크
              if (module.moduleId.includes('hanging')) {
              }
              break;
            }
          }
        }
        
        // 싱글 모듈 패턴 처리 (듀얼이 아닌 경우)
        if (!isDualModule) {
          const singlePatterns = [
            /^(single-[^-]+(?:-[^-]+)*)-(\d+(?:\.\d+)?)$/,  // single-2drawer-hanging-600, single-2tier-hanging-600 등
            /^(upper-cabinet-[^-]+(?:-[^-]+)*)-(\d+(?:\.\d+)?)$/,  // upper-cabinet-shelf-600 등
            /^(lower-cabinet-[^-]+(?:-[^-]+)*)-(\d+(?:\.\d+)?)$/,  // lower-cabinet-2tier-600 등
          ];
          
          let patternMatched = false;
          for (const pattern of singlePatterns) {
            const match = module.moduleId.match(pattern);
            if (match) {
              // 소수점 1자리까지 정확히 처리
              newModuleId = `${match[1]}-${Math.round(newIndexing.columnWidth * 10) / 10}`;
              patternMatched = true;
              break;
            }
          }
          
          // 패턴 매칭 실패 시 기본 패턴으로 폴백
          if (!patternMatched) {
            // baseModuleType이 있으면 사용, 없으면 기본값
            const baseType = module.baseModuleType || 'single-2drawer-hanging';
            // 소수점 1자리까지 정확히 처리
            newModuleId = `${baseType}-${Math.round(newIndexing.columnWidth * 10) / 10}`;
          }
        }
        
        // 새 공간에서 슬롯이 유효한지 확인
        if (slotIndex >= newIndexing.columnCount) {
          // 슬롯 범위 초과 시 마지막 유효한 슬롯으로 이동
          const maxSlot = newIndexing.columnCount - (isDualModule ? 2 : 1);
          if (maxSlot >= 0) {
            slotIndex = maxSlot;
          } else {
            // 배치할 공간이 아예 없는 경우 원래 위치 유지
            updatedModules.push({
              ...module,
              isValidInCurrentSpace: false
            });
            return;
          }
        }
        
        // 듀얼 가구의 경우 추가 검증: 다음 슬롯도 유효해야 함
        // zone이 있는 경우 해당 zone의 columnCount 확인
        let maxColumnCount = newIndexing.columnCount;
        if (module.zone && newSpaceInfo.droppedCeiling?.enabled) {
          const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(newSpaceInfo, newSpaceInfo.customColumnCount);
          if (module.zone === 'dropped' && zoneInfo.dropped) {
            maxColumnCount = zoneInfo.dropped.columnCount;
          } else if (module.zone === 'normal') {
            maxColumnCount = zoneInfo.normal.columnCount;
          }
        }

        // 듀얼 가구가 범위를 벗어나는지 체크 (slotIndex + 1이 maxColumnCount보다 크거나 같으면 변환)
        // 예: maxColumnCount=2 (슬롯 0,1), 듀얼 가구 slotIndex=1이면 1+1=2 >= 2이므로 변환
        // 하지만 slotIndex=0이면 0+1=1 < 2이므로 유지
        if (isDualModule && (slotIndex + 1) > maxColumnCount - 1) {
          // 듀얼 가구를 싱글로 변환 시도
          console.log('⚠️ [SpaceAdapter] 듀얼 가구 범위 초과, 싱글로 변환:', {
            slotIndex,
            maxColumnCount,
            moduleId: module.moduleId,
            zone: module.zone
          });
          // 소수점 1자리까지 정확히 처리
          const normalizedWidth = Math.round(newIndexing.columnWidth * 10) / 10;
          newModuleId = newModuleId.replace(/^dual-/, 'single-').replace(/-[\d.]+$/, `-${normalizedWidth}`);
          isDualModule = false;
        }
        
        // 충돌 검사 및 슬롯 재배치
        if (!isSlotAvailable(slotIndex, isDualModule, updatedModules, newSpaceInfo, module.moduleId, module.id)) {
          // 오른쪽으로 빈 슬롯 찾기
          let newSlot = findNextAvailableSlot(slotIndex, 'right', isDualModule, updatedModules, newSpaceInfo, module.moduleId, module.id);
          
          // 오른쪽에 없으면 왼쪽으로 찾기
          if (newSlot === null) {
            newSlot = findNextAvailableSlot(slotIndex, 'left', isDualModule, updatedModules, newSpaceInfo, module.moduleId, module.id);
          }
          
          if (newSlot !== null) {
            slotIndex = newSlot;
          } else {
            // 사용 가능한 슬롯 없음 - 원래 위치 유지
            updatedModules.push({
              ...module,
              isValidInCurrentSpace: false
            });
            return;
          }
        }

        // 새로운 위치 계산
        let newX: number;
        let zone: 'normal' | 'dropped' = 'normal';
        let customWidth: number | undefined;
        
        // 단내림 활성화 시 영역 확인
        if (newSpaceInfo.droppedCeiling?.enabled && newIndexing.zones) {
          // 현재 슬롯의 영역 확인
          const moduleX = newIndexing.threeUnitPositions[slotIndex] * 1000; // Three.js units to mm
          const zoneInfo = ColumnIndexer.findZoneAndSlotFromPosition(
            { x: moduleX },
            newSpaceInfo,
            newIndexing
          );
          
          if (zoneInfo) {
            zone = zoneInfo.zone;
            const zoneSlots = zone === 'dropped' && newIndexing.zones.dropped
              ? newIndexing.zones.dropped
              : newIndexing.zones.normal;
            
            // 영역별 위치 계산
            const slotCenterX = zoneSlots.startX + (zoneInfo.slotIndex * zoneSlots.columnWidth) + (zoneSlots.columnWidth / 2);
            newX = slotCenterX * 0.001; // mm to Three.js units
            
            // 단내림 영역의 경우 커스텀 너비 설정
            if (zone === 'dropped') {
              customWidth = zoneSlots.columnWidth;
            }
          } else {
            // 영역을 찾을 수 없는 경우 기본값 사용
            newX = isDualModule && newIndexing.threeUnitDualPositions
              ? newIndexing.threeUnitDualPositions[slotIndex]
              : newIndexing.threeUnitPositions[slotIndex];
          }
        } else {
          // 단내림 비활성화 시 기존 로직
          if (isDualModule && newIndexing.threeUnitDualPositions) {
            // 듀얼 가구: 듀얼 위치 배열 사용
            newX = newIndexing.threeUnitDualPositions[slotIndex];
          } else {
            // 싱글 가구: 일반 위치 배열 사용
            newX = newIndexing.threeUnitPositions[slotIndex];
          }
        }
        
        // 실제 가구 너비 계산 - 슬롯에 맞는 너비 사용
        let newCustomWidth: number | undefined;
        
        // slotWidths가 있으면 사용
        if (newIndexing.slotWidths && newIndexing.slotWidths[slotIndex] !== undefined) {
          if (isDualModule && slotIndex + 1 < newIndexing.slotWidths.length) {
            // 듀얼 가구: 두 슬롯의 너비 합
            newCustomWidth = newIndexing.slotWidths[slotIndex] + newIndexing.slotWidths[slotIndex + 1];
          } else {
            // 싱글 가구: 해당 슬롯의 너비
            newCustomWidth = newIndexing.slotWidths[slotIndex];
          }
        } else if (zone === 'dropped' && customWidth) {
          // 단내림 영역은 이미 계산된 customWidth 사용
          newCustomWidth = customWidth;
        }
        
        updatedModules.push({
          ...module,
          moduleId: newModuleId,
          position: { ...module.position, x: newX },
          slotIndex,
          isDualSlot: newModuleId.includes('dual'),
          isValidInCurrentSpace: true,
          zone,
          customWidth: newCustomWidth,
          adjustedWidth: undefined // adjustedWidth는 FurnitureItem에서 다시 계산됨
        });
      });
      
      // 전체적인 안전장치: 모든 가구 보존
      
      return updatedModules;
    });
  }, [setPlacedModules]);

  return {
    spaceChangeMode,
    setSpaceChangeMode,
    updateFurnitureForNewSpace
  };
}; 