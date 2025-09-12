import { useEffect, useRef } from 'react';
import { useHistoryStore } from '@/store/historyStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useProjectStore } from '@/store/core/projectStore';

export const useHistoryTracking = () => {
  const { saveState } = useHistoryStore();
  const spaceInfo = useSpaceConfigStore(state => state.spaceInfo);
  const placedModules = useFurnitureStore(state => state.placedModules);
  const basicInfo = useProjectStore(state => state.basicInfo);
  
  const lastSavedRef = useRef<string>('');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // 상태 변경 감지 및 히스토리 저장 (디바운싱 적용)
  useEffect(() => {
    const currentState = JSON.stringify({ spaceInfo, placedModules, basicInfo });
    
    // 상태가 변경되었을 때만 저장
    if (currentState !== lastSavedRef.current && spaceInfo && basicInfo) {
      // 이전 타이머 취소
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      // 500ms 후에 저장 (빠른 연속 변경 시 마지막 상태만 저장)
      timeoutRef.current = setTimeout(() => {
        saveState({
          spaceInfo,
          placedModules,
          basicInfo
        });
        lastSavedRef.current = currentState;
        console.log('📜 History saved');
      }, 500);
    }
    
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [spaceInfo, placedModules, basicInfo, saveState]);
  
  // 초기 상태 저장
  useEffect(() => {
    if (spaceInfo && basicInfo) {
      const initialState = { spaceInfo, placedModules, basicInfo };
      saveState(initialState);
      lastSavedRef.current = JSON.stringify(initialState);
      console.log('📜 Initial history saved');
    }
  }, []); // 컴포넌트 마운트 시 한 번만 실행
};