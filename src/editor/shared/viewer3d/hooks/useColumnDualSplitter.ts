import { useEffect, useRef } from 'react';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { autoSplitDualFurnitureByColumns } from '@/editor/shared/utils/columnSlotProcessor';

/**
 * 기둥 변화를 감지하여 기존 듀얼 가구를 자동 분할하는 훅
 */
export const useColumnDualSplitter = () => {
  const { spaceInfo } = useSpaceConfigStore();
  const { placedModules, addModule, removeModule } = useFurnitureStore();
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
          autoSplitDualFurnitureByColumns(
            placedModules,
            spaceInfo,
            addModule,
            removeModule
          );
        } catch (error) {
          console.error('❌ 듀얼 가구 자동 분할 중 오류:', error);
        }
      }, 500);
      
      previousColumnsRef.current = currentColumnsStr;
      
      return () => clearTimeout(timer);
    }
  }, [spaceInfo.columns, placedModules, addModule, removeModule]);
  
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