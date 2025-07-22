import { useEffect, useRef } from 'react';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { autoSplitDualFurnitureByColumns, analyzeColumnSlots } from '@/editor/shared/utils/columnSlotProcessor';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { getModuleById } from '@/data/modules';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';

/**
 * 기둥 변화에 따른 가구의 동적 반응 처리
 */
const restoreFurnitureFromColumnChanges = (placedModules: any[], spaceInfo: any, updateModule: any) => {
  const internalSpace = calculateInternalSpace(spaceInfo);
  const indexing = calculateSpaceIndexing(spaceInfo);
  const columnSlots = analyzeColumnSlots(spaceInfo);
  
  console.log('🔄 기둥 변화로 인한 가구 동적 반응 시작');
  
  placedModules.forEach(module => {
    if (module.slotIndex === undefined) return;
    
    const slotInfo = columnSlots[module.slotIndex];
    const moduleData = getModuleById(module.moduleId, internalSpace, spaceInfo);
    if (!moduleData) return;
    
    // 기둥이 없어진 슬롯의 가구 완전 복원
    if (!slotInfo || !slotInfo.hasColumn) {
      const hadColumnBefore = module.customDepth && module.customDepth < 580;
      if (hadColumnBefore) {
        const originalDepth = Math.min(moduleData.defaultDepth || 580, spaceInfo.depth);
        
        console.log('🔧 기둥 제거 - 가구 원래 크기 완전 복원:', {
          moduleId: module.id,
          slotIndex: module.slotIndex,
          currentDepth: module.customDepth,
          restoredDepth: originalDepth
        });
        
        updateModule(module.id, {
          customDepth: originalDepth,
          position: {
            ...module.position,
            x: indexing.threeUnitPositions[module.slotIndex] || module.position.x
          },
          adjustedWidth: undefined // 원래 폭으로 복원
        });
      }
      return;
    }
    
    // 기둥이 있는 슬롯의 동적 반응 처리
    if (slotInfo.hasColumn && slotInfo.column) {
      const columnDepth = slotInfo.column.depth;
      const isColumnC = columnDepth === 300;
      
      if (isColumnC) {
        // 기둥C의 침범량 계산
        const slotWidthM = indexing.columnWidth * 0.01;
        const slotCenterX = indexing.threeUnitPositions[module.slotIndex];
        const slotLeftX = slotCenterX - slotWidthM / 2;
        const slotRightX = slotCenterX + slotWidthM / 2;
        
        const columnWidthM = slotInfo.column.width * 0.01;
        const columnLeftX = slotInfo.column.position[0] - columnWidthM / 2;
        const columnRightX = slotInfo.column.position[0] + columnWidthM / 2;
        
        // 슬롯 끝에서의 침범량 계산
        let intrusionFromEdge = 0;
        if (columnLeftX < slotLeftX && columnRightX > slotLeftX) {
          intrusionFromEdge = (columnRightX - slotLeftX) * 1000;
        } else if (columnLeftX < slotRightX && columnRightX > slotRightX) {
          intrusionFromEdge = (slotRightX - columnLeftX) * 1000;
        } else if (columnLeftX <= slotLeftX && columnRightX >= slotRightX) {
          intrusionFromEdge = (slotRightX - slotLeftX) * 1000;
        }
        
        console.log('🏛️ 기둥C 이동 감지 - 가구 동적 반응:', {
          moduleId: module.id,
          slotIndex: module.slotIndex,
          intrusionFromEdge: intrusionFromEdge.toFixed(1) + 'mm',
          threshold: '150mm'
        });
        
        if (intrusionFromEdge < 150) {
          // 150mm 미만 침범: 가구 폭 조정 (밀어내기)
          console.log('✅ 폭 조정 모드 - 가구를 밀어냄');
          // FurnitureItem.tsx에서 자동으로 처리됨 (기둥A 방식)
          updateModule(module.id, {
            customDepth: undefined // 깊이 조정 해제
          });
        } else {
          // 150mm 이상 침범: 깊이 조정 모드로 전환, 폭은 원래대로 복원
          const slotDepth = 730;
          const adjustedDepth = slotDepth - columnDepth;
          
          console.log('✅ 깊이 조정 모드로 전환 - 폭 복원, 깊이 조정:', {
            originalDepth: moduleData.dimensions.depth,
            adjustedDepth: adjustedDepth,
            originalWidth: moduleData.dimensions.width,
            widthRestored: true
          });
          
          updateModule(module.id, {
            customDepth: adjustedDepth,
            adjustedWidth: undefined, // 폭을 원래대로 복원
            position: {
              ...module.position,
              x: slotCenterX // 슬롯 중앙으로 복원
            }
          });
        }
      } else {
        // 다른 기둥들의 기존 로직
        const isShallowColumn = columnDepth < 500;
        if (isShallowColumn) {
          const slotDepth = 730;
          const adjustedDepth = slotDepth - columnDepth;
          
          const isDualFurniture = Math.abs(moduleData.dimensions.width - (indexing.columnWidth * 2)) < 50;
          if (!(isDualFurniture && adjustedDepth <= 300)) {
            if (!module.customDepth || Math.abs(module.customDepth - adjustedDepth) > 10) {
              console.log('🔧 기존 기둥 로직 - 깊이 조정:', {
                moduleId: module.id,
                columnDepth: columnDepth,
                adjustedDepth: adjustedDepth
              });
              
              updateModule(module.id, {
                customDepth: adjustedDepth
              });
            }
          }
        }
      }
    }
  });
};

/**
 * 기둥 변화를 감지하여 기존 듀얼 가구를 자동 분할하는 훅
 */
export const useColumnDualSplitter = () => {
  const { spaceInfo } = useSpaceConfigStore();
  const { placedModules, addModule, removeModule, updatePlacedModule } = useFurnitureStore();
  const previousColumnsRef = useRef<string>('');

  useEffect(() => {
    // 기둥 정보를 문자열로 직렬화하여 변화 감지
    const currentColumnsStr = JSON.stringify(spaceInfo.columns || []);
    
    // 초기 실행은 건너뛰기
    if (previousColumnsRef.current === '') {
      previousColumnsRef.current = currentColumnsStr;
      return;
    }
    
    // 기둥이 변화했을 때만 실행
    if (previousColumnsRef.current !== currentColumnsStr) {
      console.log('🏛️ 기둥 변화 감지 - 듀얼 가구 자동 분할 검사 시작');
      
      // 500ms 지연 후 실행 (기둥 추가/이동 완료 후)
      const timer = setTimeout(() => {
        try {
          // 1. 먼저 기둥이 없어진 슬롯의 가구들을 복원
          restoreFurnitureFromColumnChanges(placedModules, spaceInfo, updatePlacedModule);
          
          // 2. 그 다음 새로 추가된 기둥에 의한 듀얼 가구 분할 처리
          autoSplitDualFurnitureByColumns(
            placedModules,
            spaceInfo,
            addModule,
            removeModule
          );
        } catch (error) {
          console.error('❌ 기둥 변화 처리 중 오류:', error);
        }
      }, 500);
      
      previousColumnsRef.current = currentColumnsStr;
      
      return () => clearTimeout(timer);
    }
  }, [spaceInfo.columns, placedModules, addModule, removeModule, updatePlacedModule]);
  
  // 수동으로 분할 검사를 실행하는 함수
  const triggerManualSplit = () => {
    console.log('🔄 수동 듀얼 가구 분할 검사 실행');
    autoSplitDualFurnitureByColumns(
      placedModules,
      spaceInfo,
      addModule,
      removeModule
    );
  };
  
  return {
    triggerManualSplit
  };
}; 