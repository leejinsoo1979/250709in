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
    console.log('🚨 updateFurnitureForNewSpace 호출됨:', {
      oldSpaceInfo,
      newSpaceInfo,
      caller: new Error().stack
    });
    setPlacedModules(currentModules => {
      if (currentModules.length === 0) return currentModules;
      
      const oldIndexing = calculateSpaceIndexing(oldSpaceInfo);
      const newIndexing = calculateSpaceIndexing(newSpaceInfo);
      
      // 세미스탠딩에서 벽 위치만 변경된 경우 감지
      const isOnlyWallPositionChange = 
        oldSpaceInfo.installType === 'semistanding' && 
        newSpaceInfo.installType === 'semistanding' &&
        oldSpaceInfo.width === newSpaceInfo.width &&
        oldSpaceInfo.wallConfig?.left !== newSpaceInfo.wallConfig?.left &&
        oldIndexing.columnWidth === newIndexing.columnWidth;
      
      if (isOnlyWallPositionChange) {
        console.log('🔄 세미스탠딩 벽 위치만 변경됨 - 가구 너비 유지');
        // 벽 위치만 변경된 경우 가구를 그대로 반환
        return currentModules;
      }
      
      // 컬럼 변경이 있을 때만 로그 출력
      if (oldIndexing.columnCount !== newIndexing.columnCount || oldIndexing.columnWidth !== newIndexing.columnWidth) {
        console.log(`🔄 컬럼 변경: ${oldIndexing.columnCount}개(${oldIndexing.columnWidth}mm) → ${newIndexing.columnCount}개(${newIndexing.columnWidth}mm)`);
      }
      
      const updatedModules: PlacedModule[] = [];
      
      currentModules.forEach(module => {
        // 가구가 이미 zone 정보를 가지고 있는 경우 해당 영역 내에서만 처리
        if (module.zone && newSpaceInfo.droppedCeiling?.enabled) {
          console.log('🔍 Zone 가구 처리 시작:', {
            moduleId: module.moduleId,
            zone: module.zone,
            customWidth: module.customWidth,
            isDualSlot: module.isDualSlot
          });
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
          const baseType = module.moduleId.replace(/-\d+$/, '');
          const newModuleId = `${baseType}-${targetZone.columnWidth * (isDual ? 2 : 1)}`;
          
          console.log('🔄 Zone 가구 업데이트:', {
            originalModuleId: module.moduleId,
            baseType,
            isDual,
            zone: module.zone,
            targetZone: targetZone,
            slotIndex,
            newX: newX * 0.01,
            newModuleId,
            oldWidth: module.customWidth || module.adjustedWidth,
            newWidth: targetZone.columnWidth * (isDual ? 2 : 1),
            targetZoneSlotWidths: targetZone.slotWidths
          });
          
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
          /^dual-([^-]+(?:-[^-]+)*)-(\d+)$/,  // dual-open-1200, dual-hang-shelf2-1200 등 (하이픈 포함)
        ];
        
        for (const pattern of dualPatterns) {
          const match = module.moduleId.match(pattern);
          if (match) {
            const oldWidth = parseInt(match[2]); // 두 번째 캡처 그룹이 숫자
            // 듀얼 모듈인지 확인 (기존 폭이 컬럼폭*2와 유사한지)
            if (Math.abs(oldWidth - (oldIndexing.columnWidth * 2)) < 50) {
              newModuleId = module.moduleId.replace(pattern, `dual-$1-${newIndexing.columnWidth * 2}`);
              isDualModule = true;
              break;
            }
          }
        }
        
        // 싱글 모듈 패턴 처리 (듀얼이 아닌 경우)
        if (!isDualModule) {
          const singlePatterns = [
            /^single-([^-]+(?:-[^-]+)*)-(\d+)$/,  // single-open-600, single-hang-shelf2-600 등 (하이픈 포함)
          ];
          
          let patternMatched = false;
          for (const pattern of singlePatterns) {
            const match = module.moduleId.match(pattern);
            if (match) {
              newModuleId = module.moduleId.replace(pattern, `single-$1-${newIndexing.columnWidth}`);
              patternMatched = true;
              break;
            }
          }
          
          // 패턴 매칭 실패 시 기본 패턴으로 폴백
          if (!patternMatched) {
            newModuleId = `single-open-${newIndexing.columnWidth}`;
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
        
        if (isDualModule && (slotIndex + 1) >= maxColumnCount) {
          // 듀얼 가구를 싱글로 변환 시도
          newModuleId = newModuleId.replace(/^dual-/, 'single-').replace(/-(\d+)$/, `-${newIndexing.columnWidth}`);
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