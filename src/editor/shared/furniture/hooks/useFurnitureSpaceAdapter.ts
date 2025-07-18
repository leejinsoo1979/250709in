import { useState, useCallback } from 'react';
import { PlacedModule } from '../types';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateSpaceIndexing, findSlotIndexFromPosition } from '@/editor/shared/utils/indexing';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import { getModuleById } from '@/data/modules';
import { isSlotAvailable, findNextAvailableSlot } from '@/editor/shared/utils/slotAvailability';

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
        console.log(`🔄 컬럼 변경: ${oldIndexing.columnCount}개(${oldIndexing.columnWidth}mm) → ${newIndexing.columnCount}개(${newIndexing.columnWidth}mm)`);
      }
      
      const updatedModules: PlacedModule[] = [];
      
      currentModules.forEach(module => {
        // 🔧 항상 현재 위치로부터 슬롯 인덱스를 다시 계산 (저장된 값 무시)
        const oldInternalSpace = calculateInternalSpace(oldSpaceInfo);
        const moduleData = getModuleById(module.moduleId, oldInternalSpace, oldSpaceInfo);
        
        let slotIndex: number | undefined;
        if (moduleData) {
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
        if (isDualModule && (slotIndex + 1) >= newIndexing.columnCount) {
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
        if (isDualModule && newIndexing.threeUnitDualPositions) {
          // 듀얼 가구: 듀얼 위치 배열 사용
          newX = newIndexing.threeUnitDualPositions[slotIndex];
        } else {
          // 싱글 가구: 일반 위치 배열 사용
          newX = newIndexing.threeUnitPositions[slotIndex];
        }
        
        updatedModules.push({
          ...module,
          moduleId: newModuleId,
          position: { ...module.position, x: newX },
          slotIndex,
          isDualSlot: newModuleId.includes('dual'),
          isValidInCurrentSpace: true
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