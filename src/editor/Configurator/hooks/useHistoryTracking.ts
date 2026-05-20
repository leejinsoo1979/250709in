import { useEffect, useRef } from 'react';
import { useHistoryStore } from '@/store/historyStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useProjectStore } from '@/store/core/projectStore';

export const useHistoryTracking = (scopeId: string) => {
  const { saveState, setScope } = useHistoryStore();
  const spaceInfo = useSpaceConfigStore(state => state.spaceInfo);
  const placedModules = useFurnitureStore(state => state.placedModules);
  const basicInfo = useProjectStore(state => state.basicInfo);
  
  const lastSavedRef = useRef<string>('');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const latestStateRef = useRef({ spaceInfo, placedModules, basicInfo });

  latestStateRef.current = { spaceInfo, placedModules, basicInfo };

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const initialState = latestStateRef.current;
    if (initialState.spaceInfo && initialState.basicInfo) {
      setScope(scopeId, initialState);
      lastSavedRef.current = JSON.stringify({ scopeId, ...initialState });
      console.log('📜 History scope reset:', scopeId);
    }
  }, [scopeId, setScope]);
  
  // 상태 변경 감지 및 히스토리 저장 (디바운싱 적용)
  useEffect(() => {
    const currentState = JSON.stringify({ scopeId, spaceInfo, placedModules, basicInfo });

    // Undo/Redo로 히스토리의 기존 스냅샷을 적용한 경우에는 새 상태로 저장하지 않는다.
    // 여기서 저장하면 currentIndex 이후 redo 스택이 잘려 Ctrl+Y가 바로 무력화된다.
    const { history, currentIndex, activeScopeId } = useHistoryStore.getState();
    const activeHistoryState = history[currentIndex];
    if (activeScopeId === scopeId && activeHistoryState) {
      const activeHistoryJson = JSON.stringify({
        scopeId,
        spaceInfo: activeHistoryState.spaceInfo,
        placedModules: activeHistoryState.placedModules,
        basicInfo: activeHistoryState.basicInfo
      });

      if (activeHistoryJson === currentState) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        lastSavedRef.current = currentState;
        return;
      }
    }
    
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
        }, scopeId);
        lastSavedRef.current = currentState;
        console.log('📜 History saved');
      }, 500);
    }
    
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [scopeId, spaceInfo, placedModules, basicInfo, saveState]);
};
