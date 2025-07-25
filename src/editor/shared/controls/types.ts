// 설치 타입 관련
export type InstallType = 'builtin' | 'semistanding' | 'freestanding';
export type WallSide = 'left' | 'right';

export interface InstallTypeConfig {
  type: InstallType;
  label: string;
  description: string;
}

export interface WallConfig {
  left: boolean;  // true: 벽 있음, false: 오픈(end panel)
  right: boolean; // true: 벽 있음, false: 오픈(end panel)
}

// 바닥 마감재 관련
export interface FloorFinishConfig {
  height: number;  // 바닥 마감재 높이 (mm)
}

// 서라운드 관련
export type SurroundType = 'surround' | 'no-surround';

export interface SurroundConfig {
  type: SurroundType;
  frameSize: {
    left: number;
    right: number;
    top: number;
  };
}

// 받침대 관련
export type BaseType = 'none' | 'low' | 'high';

export interface BaseConfig {
  type: BaseType;
  height: number;
}

// 상수 정의
export const INSTALL_TYPES: InstallTypeConfig[] = [
  { 
    type: 'builtin',
    label: '양쪽벽',
    description: '양쪽 벽이 막혀있는 기본형식'
  },
  { 
    type: 'semistanding',
    label: '한쪽벽',
    description: '한쪽만 벽으로 막혀있고 한쪽은 오픈된 형식'
  },
  { 
    type: 'freestanding',
    label: '벽없음',
    description: '양쪽 벽이 없는 독립형 형식'
  }
];

export const SURROUND_TYPES = [
  { type: 'surround' as const, label: '서라운드' },
  { type: 'no-surround' as const, label: '노서라운드' }
];

export const BASE_TYPES = [
  { type: 'none' as const, label: '없음' },
  { type: 'low' as const, label: '낮은 받침대' },
  { type: 'high' as const, label: '높은 받침대' }
]; 