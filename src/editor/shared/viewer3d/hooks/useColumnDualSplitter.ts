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
      // 모든 기둥에 대해 FurnitureItem.tsx에서 자동으로 폭 조정 처리
      console.log('🏛️ 기둥 변화 감지 - 가구 폭 자동 조정:', {
        moduleId: module.id,
        slotIndex: module.slotIndex,
        columnDepth: slotInfo.column.depth,
        message: 'FurnitureItem.tsx에서 자동으로 폭과 위치 조정됨'
      });
      
      // adjustedWidth를 undefined로 설정하지 않음 - FurnitureItem이 계산하도록 둠
      // customDepth도 변경하지 않음 - 필요시 FurnitureItem이 처리
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
      
      // 100ms 지연 후 실행 (기둥 추가/이동 완료 후)
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
      }, 100);
      
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