import React from 'react';
import { Space3DViewProps } from '../types';
import { createObject3DStyles } from '../utils/styles';
import { calculateRoomDimensions } from '../utils/geometry';
import { Space3DViewContext, Space3DViewContextType } from './Space3DViewContextTypes';

// 컨텍스트 프로바이더 컴포넌트
export const Space3DViewProvider: React.FC<Space3DViewProps & { children: React.ReactNode; viewMode?: '2D' | '3D' }> = ({
  spaceInfo,
  svgSize,
  renderMode = 'wireframe',
  viewMode = '3D',
  activeZone = 'normal',
  children
}) => {
  // 3D 오브젝트 스타일 생성
  const styles = createObject3DStyles();
  
  // 룸 치수 계산
  const roomDimensions = calculateRoomDimensions(spaceInfo);
  
  // 컨텍스트에 제공할 값 설정
  const contextValue: Space3DViewContextType = {
    spaceInfo,
    canvasSize: svgSize,
    styles,
    renderMode,
    viewMode,
    roomDimensions,
    activeZone
  };
  
  return (
    <Space3DViewContext.Provider value={contextValue}>
      {children}
    </Space3DViewContext.Provider>
  );
}; 