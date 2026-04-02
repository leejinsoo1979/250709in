import React, { createContext, useContext } from 'react';

/**
 * 가구 편집 모드(고스트) 상태를 하위 컴포넌트에 전달하는 컨텍스트
 * PlacedFurnitureContainer에서 제공하며, BoxWithEdges에서 소비
 * prop drilling 없이 모든 하위 BoxWithEdges가 고스트 상태를 감지할 수 있음
 */
const FurnitureGhostContext = createContext<boolean>(false);

export const FurnitureGhostProvider: React.FC<{
  isEditMode: boolean;
  children: React.ReactNode;
}> = ({ isEditMode, children }) => (
  <FurnitureGhostContext.Provider value={isEditMode}>
    {children}
  </FurnitureGhostContext.Provider>
);

export const useFurnitureGhostContext = () => useContext(FurnitureGhostContext);
