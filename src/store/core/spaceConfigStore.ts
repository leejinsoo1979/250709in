import { create } from 'zustand';
import { InstallType, FloorFinishConfig } from '@/editor/shared/controls/types';
import { Column, Wall } from '@/types/space';

// Configurator 관련 추가 타입들
export type SurroundType = 'surround' | 'no-surround';

export interface FrameSize {
  left: number;
  right: number;
  top: number;
}

export interface GapConfig {
  left: number;  // 좌측 이격거리 (mm 단위)
  right: number; // 우측 이격거리 (mm 단위)
  top?: number;  // 상부 이격거리 (mm 단위) - 선택적
}

export interface BaseConfig {
  type: 'floor' | 'stand';
  height: number;
  placementType?: 'ground' | 'float'; // 받침대 없음일 때 배치 방식
  floatHeight?: number; // 띄워서 배치 시 띄우는 높이
}

// 재질 설정 타입
export interface MaterialConfig {
  interiorColor: string;
  doorColor: string;
  interiorTexture?: string;  // 내부 재질 텍스처 이미지 경로
  doorTexture?: string;      // 도어 재질 텍스처 이미지 경로
}

// 공간 정보 타입
export interface SpaceInfo {
  width: number;
  height: number;
  depth: number;
  installType: InstallType;
  wallConfig: {
    left: boolean;
    right: boolean;
  };
  hasFloorFinish: boolean;
  floorFinish?: FloorFinishConfig;
  
  // Configurator 관련 추가 속성
  surroundType?: SurroundType;
  frameSize?: FrameSize;
  gapConfig?: GapConfig;
  baseConfig?: BaseConfig;
  
  // 컬럼 수 사용자 지정 속성
  customColumnCount?: number;
  
  // 재질 설정 추가
  materialConfig?: MaterialConfig;
  
  // 구조물 설정 추가
  columns?: Column[];
  walls?: Wall[];
}

// 공간 설정 상태 타입
interface SpaceConfigState {
  // 상태
  spaceInfo: SpaceInfo;
  isDirty: boolean;  // 변경사항 있음을 표시
  
  // 공간 정보 액션
  setSpaceInfo: (info: Partial<SpaceInfo>) => void;
  resetSpaceInfo: () => void;
  
  // 재질 설정 액션
  resetMaterialConfig: () => void;
  
  // 구조물 설정 액션
  setColumns: (columns: Column[]) => void;
  addColumn: (column: Column) => void;
  removeColumn: (id: string) => void;
  updateColumn: (id: string, updates: Partial<Column>) => void;
  
  // 가벽 설정 액션
  setWalls: (walls: Wall[]) => void;
  addWall: (wall: Wall) => void;
  removeWall: (id: string) => void;
  updateWall: (id: string, updates: Partial<Wall>) => void;
  
  // 전체 상태 관리
  resetAll: () => void;
  markAsSaved: () => void;
}

// 기본값 상수들 (다른 파일에서 재사용 가능)
export const DEFAULT_SPACE_VALUES = {
  WIDTH: 3600,
  HEIGHT: 2400,
  DEPTH: 1500,
} as const;

export const DEFAULT_FRAME_VALUES = {
  LEFT: 50,
  RIGHT: 50,
  TOP: 10,
} as const;

export const DEFAULT_BASE_VALUES = {
  HEIGHT: 65,
  FLOOR_FINISH_HEIGHT: 50,
} as const;

export const DEFAULT_MATERIAL_VALUES = {
  INTERIOR_COLOR: '#FFFFFF',
  DOOR_COLOR: '#FFFFFF',
} as const;

// 공간 치수 범위 상수들 (controls에서 사용)
export const SPACE_LIMITS = {
  WIDTH: {
    MIN: 1200,  // 최소 폭
    MAX: 8000,  // 최대 폭
  },
  HEIGHT: {
    MIN: 2010,  // 최소 높이
    MAX: 2410,  // 최대 높이
  },
  DEPTH: {
    MIN: 130,   // 최소 깊이
    MAX: 1500,   // 최대 깊이
  },
} as const;

// 가구 관련 상수들
export const FURNITURE_LIMITS = {
  DEPTH: {
    MIN: 130,           // 가구 최소 깊이
    MAX: 780,           // 가구 최대 깊이
    DEFAULT_FALLBACK: 580,  // 기본 fallback 깊이
  },
  DUAL_THRESHOLD: 1200,     // 듀얼장 사용 가능 최소 내경폭
} as const;

// 기본 SpaceInfo 객체 (다른 파일에서 재사용 가능)
export const DEFAULT_SPACE_CONFIG: SpaceInfo = {
  width: DEFAULT_SPACE_VALUES.WIDTH,
  height: DEFAULT_SPACE_VALUES.HEIGHT,
  depth: DEFAULT_SPACE_VALUES.DEPTH,
  installType: 'built-in',
  wallConfig: {
    left: true,
    right: true,
  },
  hasFloorFinish: false,
  floorFinish: {
    height: DEFAULT_BASE_VALUES.FLOOR_FINISH_HEIGHT
  },
  // Configurator 초기값 설정
  surroundType: 'no-surround',
  frameSize: {
    left: DEFAULT_FRAME_VALUES.LEFT,
    right: DEFAULT_FRAME_VALUES.RIGHT,
    top: DEFAULT_FRAME_VALUES.TOP
  },
  gapConfig: {
    left: 2, // 기본 이격거리 2mm
    right: 2, // 기본 이격거리 2mm
  },
  baseConfig: {
    type: 'floor',
    height: DEFAULT_BASE_VALUES.HEIGHT,
    placementType: 'ground'
  },
  // 재질 설정 초기값
  materialConfig: {
    interiorColor: DEFAULT_MATERIAL_VALUES.INTERIOR_COLOR,
    doorColor: DEFAULT_MATERIAL_VALUES.DOOR_COLOR
  }
};

// 초기 상태
const initialState: Omit<SpaceConfigState, 'setSpaceInfo' | 'resetSpaceInfo' | 'resetMaterialConfig' | 'setColumns' | 'addColumn' | 'removeColumn' | 'updateColumn' | 'resetAll' | 'markAsSaved'> = {
  isDirty: false,
  spaceInfo: DEFAULT_SPACE_CONFIG,
};

export const useSpaceConfigStore = create<SpaceConfigState>()((set) => ({
  ...initialState,
  
  // 공간 정보 설정
  setSpaceInfo: (info) => {
    set((state) => {
      const newState = {
        spaceInfo: { ...state.spaceInfo, ...info },
        isDirty: true,
      };
      return newState;
    });
  },
  
  // 공간 정보 초기화
  resetSpaceInfo: () =>
    set({
      spaceInfo: initialState.spaceInfo,
      isDirty: true,
    }),
  
  // 재질 설정 초기화
  resetMaterialConfig: () =>
    set((state) => ({
      spaceInfo: {
        ...state.spaceInfo,
        materialConfig: {
          ...state.spaceInfo.materialConfig!,
          doorColor: '#FFFFFF'  // 흰색으로 초기화 (테스트용)
        }
      },
      isDirty: true,
    })),
  
  // 구조물 설정 액션들
  setColumns: (columns) =>
    set((state) => ({
      spaceInfo: {
        ...state.spaceInfo,
        columns
      },
      isDirty: true,
    })),
  
  addColumn: (column) =>
    set((state) => ({
      spaceInfo: {
        ...state.spaceInfo,
        columns: [...(state.spaceInfo.columns || []), column]
      },
      isDirty: true,
    })),
  
  removeColumn: (id) =>
    set((state) => ({
      spaceInfo: {
        ...state.spaceInfo,
        columns: (state.spaceInfo.columns || []).filter(col => col.id !== id)
      },
      isDirty: true,
    })),
  
  updateColumn: (id, updates) =>
    set((state) => ({
      spaceInfo: {
        ...state.spaceInfo,
        columns: (state.spaceInfo.columns || []).map(col => 
          col.id === id ? { ...col, ...updates } : col
        )
      },
      isDirty: true,
    })),
  
  // 가벽 설정 액션들
  setWalls: (walls) =>
    set((state) => ({
      spaceInfo: {
        ...state.spaceInfo,
        walls
      },
      isDirty: true,
    })),
  
  addWall: (wall) =>
    set((state) => ({
      spaceInfo: {
        ...state.spaceInfo,
        walls: [...(state.spaceInfo.walls || []), wall]
      },
      isDirty: true,
    })),
  
  removeWall: (id) =>
    set((state) => ({
      spaceInfo: {
        ...state.spaceInfo,
        walls: (state.spaceInfo.walls || []).filter(wall => wall.id !== id)
      },
      isDirty: true,
    })),
  
  updateWall: (id, updates) =>
    set((state) => ({
      spaceInfo: {
        ...state.spaceInfo,
        walls: (state.spaceInfo.walls || []).map(wall => 
          wall.id === id ? { ...wall, ...updates } : wall
        )
      },
      isDirty: true,
    })),
  
  // 전체 상태 초기화
  resetAll: () => set({ ...initialState, isDirty: false }),
  
  // 저장 상태로 마킹
  markAsSaved: () => set({ isDirty: false }),
})); 