import React, { createContext, useContext, useCallback, ReactNode } from 'react';
import { useNavigate as useRouterNavigate } from 'react-router-dom';
import { useConfirm } from '@/hooks/useConfirm';
import { useProjectStore } from '@/store/core/projectStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';

interface NavigationContextType {
  navigate: (to: string, options?: { force?: boolean }) => Promise<void>;
}

const NavigationContext = createContext<NavigationContextType | null>(null);

export const useNavigate = () => {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigate must be used within NavigationProvider');
  }
  return context.navigate;
};

interface NavigationProviderProps {
  children: ReactNode;
}

export const NavigationProvider: React.FC<NavigationProviderProps> = ({ children }) => {
  const routerNavigate = useRouterNavigate();
  const { showConfirm, ConfirmComponent } = useConfirm();
  
  // 스토어에서 isDirty 상태 가져오기
  const projectIsDirty = useProjectStore((state) => state.isDirty);
  const spaceConfigIsDirty = useSpaceConfigStore((state) => state.isDirty);
  const furnitureIsDirty = useFurnitureStore((state) => state.isDirty);
  
  // 스토어 리셋 함수들
  const resetProject = useProjectStore((state) => state.resetAll);
  const resetSpaceConfig = useSpaceConfigStore((state) => state.resetAll);
  const resetFurniture = useFurnitureStore((state) => state.resetAll);
  
  // 어느 하나라도 변경사항이 있으면 true
  const hasUnsavedChanges = projectIsDirty || spaceConfigIsDirty || furnitureIsDirty;

  const navigate = useCallback(async (to: string, options?: { force?: boolean }) => {
    // force 옵션이 있으면 확인 없이 이동
    if (options?.force) {
      routerNavigate(to);
      return;
    }
    
    // 변경사항이 있으면 확인
    if (hasUnsavedChanges) {
      const isConfirmed = await showConfirm(
        '저장하지 않은 변경사항이 있습니다.\n정말로 페이지를 떠나시겠습니까?',
        {
          title: '변경사항 저장 안 됨',
          confirmText: '떠나기',
          cancelText: '머무르기'
        }
      );
      
      if (isConfirmed) {
        // 모든 스토어 초기화
        resetProject();
        resetSpaceConfig();
        resetFurniture();
        routerNavigate(to);
      }
    } else {
      // 변경사항이 없으면 바로 이동
      routerNavigate(to);
    }
  }, [hasUnsavedChanges, showConfirm, routerNavigate, resetProject, resetSpaceConfig, resetFurniture]);

  return (
    <NavigationContext.Provider value={{ navigate }}>
      <ConfirmComponent />
      {children}
    </NavigationContext.Provider>
  );
};