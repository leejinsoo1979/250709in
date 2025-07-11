import React from 'react';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { useFurnitureSpaceAdapter } from '../hooks';
import { useFurnitureStore } from '@/store/core/furnitureStore';

// 공간 변경 관련 기능을 제공하는 HOC
export interface WithFurnitureSpaceAdapterProps {
  spaceChangeMode: boolean;
  setSpaceChangeMode: (mode: boolean) => void;
  updateFurnitureForNewSpace: (oldSpaceInfo: SpaceInfo, newSpaceInfo: SpaceInfo) => void;
}

// HOC 함수
export function withFurnitureSpaceAdapter<P extends object>(
  WrappedComponent: React.ComponentType<P & WithFurnitureSpaceAdapterProps>
): React.FC<P> {
  return function WithFurnitureSpaceAdapterComponent(props: P) {
    // Store에서 setPlacedModules 액션 가져오기
    const setPlacedModules = useFurnitureStore(state => state.setPlacedModules);
    
    // 공간 변경 어댑터 훅 사용 - Store의 setPlacedModules를 직접 전달
    const spaceAdapterProps = useFurnitureSpaceAdapter({
      setPlacedModules
    });

    return (
      <WrappedComponent 
        {...props} 
        {...spaceAdapterProps}
      />
    );
  };
} 