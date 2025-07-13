import { createContext } from 'react';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { Object3DStyles } from '../types';
import { calculateRoomDimensions } from '../utils/geometry';

// 컨텍스트에서 제공할 값들의 타입 정의
export interface Space3DViewContextType {
  // 기본 정보
  spaceInfo: SpaceInfo;
  canvasSize: { width: number; height: number };
  
  // 3D 스타일 및 설정
  styles: Object3DStyles;
  renderMode: 'solid' | 'wireframe';
  viewMode: '2D' | '3D';
  
  // 계산된 3D 치수
  roomDimensions: ReturnType<typeof calculateRoomDimensions>;
}

// 컨텍스트 생성
export const Space3DViewContext = createContext<Space3DViewContextType | null>(null); 