import { create } from 'zustand';
import { InstallType, FloorFinishConfig } from '@/editor/shared/controls/types';
import { Column, Wall, PanelB } from '@/types/space';
import { useFurnitureStore } from './furnitureStore';

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
  columnMode?: 'auto' | 'custom';
  
  // 재질 설정 추가
  materialConfig?: MaterialConfig;
  
  // 구조물 설정 추가
  columns?: Column[];
  walls?: Wall[];
  panelBs?: PanelB[];
  
  // 단내림 설정 추가
  droppedCeiling?: DroppedCeilingConfig;
  
  // 도어 개수 설정 (단내림 활성화 시 사용)
  mainDoorCount?: number;              // 메인 구간 도어 개수
  droppedCeilingDoorCount?: number;    // 단내림 구간 도어 개수
  
  // 영역 정보 (단내림 구간에서 사용)
  zone?: 'normal' | 'dropped';         // 현재 영역
  
  // 임시 슬롯 너비 (getModuleById에서 특정 너비로 검색할 때 사용)
  _tempSlotWidths?: number[];
}

// 단내림 설정 인터페이스
export interface DroppedCeilingConfig {
  enabled: boolean;              // 단내림 활성화 여부
  position: 'left' | 'right';   // 단내림 위치
  width: number;                 // 단내림 영역 폭 (mm)
  dropHeight: number;            // 천장에서 내려오는 높이 (mm)
  depth?: number;                // 공간 깊이 (생략 시 spaceInfo.depth 사용)
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
  
  // 패널B 설정 액션
  setPanelBs: (panelBs: PanelB[]) => void;
  addPanelB: (panelB: PanelB) => void;
  removePanelB: (id: string) => void;
  updatePanelB: (id: string, updates: Partial<PanelB>) => void;
  
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
  DOOR_COLOR: '#E0E0E0',  // 기본값을 밝은 회색으로 변경 (흰색 강제 초기화 방지)
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
  installType: 'builtin' as const,
  wallConfig: {
    left: true,
    right: true,
  },
  hasFloorFinish: false,
  floorFinish: {
    height: DEFAULT_BASE_VALUES.FLOOR_FINISH_HEIGHT
  },
  // Configurator 초기값 설정
  surroundType: 'surround',  // 기본값을 서라운드로 변경
  frameSize: {
    left: 50,  // 서라운드 기본 프레임 크기
    right: 50,
    top: 10
  },
  gapConfig: {
    left: 2, // 기본 이격거리 2mm
    right: 2, // 기본 이격거리 2mm
  },
  baseConfig: {
    type: 'floor',
    height: DEFAULT_BASE_VALUES.HEIGHT,
    placementType: 'float'  // 기본값을 띄워서 배치로 변경
  },
  // 재질 설정 초기값
  materialConfig: {
    interiorColor: DEFAULT_MATERIAL_VALUES.INTERIOR_COLOR,
    doorColor: DEFAULT_MATERIAL_VALUES.DOOR_COLOR
  },
  // 단내림 기본값 설정
  droppedCeiling: {
    enabled: false,
    position: 'right',
    width: 900,
    dropHeight: 200
  },
  // 도어 개수 기본값 설정
  mainDoorCount: 0,  // 메인 구간 도어 개수 기본값
  droppedCeilingDoorCount: 0  // 단내림 구간 도어 개수 기본값
};

// 초기 상태
const initialState: Omit<SpaceConfigState, 'setSpaceInfo' | 'resetSpaceInfo' | 'resetMaterialConfig' | 'setColumns' | 'addColumn' | 'removeColumn' | 'updateColumn' | 'setWalls' | 'addWall' | 'removeWall' | 'updateWall' | 'setPanelBs' | 'addPanelB' | 'removePanelB' | 'updatePanelB' | 'resetAll' | 'markAsSaved'> = {
  isDirty: false,
  spaceInfo: DEFAULT_SPACE_CONFIG,
};

export const useSpaceConfigStore = create<SpaceConfigState>()((set) => ({
  ...initialState,
  
  // 공간 정보 설정
  setSpaceInfo: (info) => {
    set((state) => {
      // installType 하이픈 문제 수정
      const processedInfo = { ...info };
      if (processedInfo.installType === 'built-in' as any) {
        processedInfo.installType = 'builtin';
      }
      
      // droppedCeiling이 활성화되었는데 width나 dropHeight가 없으면 기본값 설정
      if (processedInfo.droppedCeiling?.enabled && 
          (!processedInfo.droppedCeiling.width || !processedInfo.droppedCeiling.dropHeight)) {
        processedInfo.droppedCeiling = {
          ...processedInfo.droppedCeiling,
          width: processedInfo.droppedCeiling.width || 900,
          dropHeight: processedInfo.droppedCeiling.dropHeight || 200
        };
      }
      
      const newState = {
        spaceInfo: { ...state.spaceInfo, ...processedInfo },
        isDirty: true,
      };
      
      // wallConfig 업데이트 디버그
      if (processedInfo.wallConfig) {
        console.log('🏪 SpaceConfigStore - wallConfig 업데이트:', {
          이전: state.spaceInfo.wallConfig,
          새로운: processedInfo.wallConfig,
          최종: newState.spaceInfo.wallConfig
        });
      }
      
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
          // doorColor는 기존 값을 유지하고, 변경하지 않음
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
    set((state) => {
      const newState = {
        spaceInfo: {
          ...state.spaceInfo,
          columns: [...(state.spaceInfo.columns || []), column]
        },
        isDirty: true,
      };
      
      // 가구 업데이트를 위해 furnitureStore의 updateFurnitureForColumns 호출
      setTimeout(() => {
        const { updateFurnitureForColumns } = useFurnitureStore.getState();
        updateFurnitureForColumns(newState.spaceInfo);
      }, 0);
      
      return newState;
    }),
  
  removeColumn: (id) =>
    set((state) => {
      const newState = {
        spaceInfo: {
          ...state.spaceInfo,
          columns: (state.spaceInfo.columns || []).filter(col => col.id !== id)
        },
        isDirty: true,
      };
      
      // 가구 업데이트를 위해 furnitureStore의 updateFurnitureForColumns 호출
      setTimeout(() => {
        const { updateFurnitureForColumns } = useFurnitureStore.getState();
        updateFurnitureForColumns(newState.spaceInfo);
      }, 0);
      
      return newState;
    }),
  
  updateColumn: (id, updates) =>
    set((state) => {
      const newState = {
        spaceInfo: {
          ...state.spaceInfo,
          columns: (state.spaceInfo.columns || []).map(col => 
            col.id === id ? { ...col, ...updates } : col
          )
        },
        isDirty: true,
      };
      
      // 가구 업데이트를 위해 furnitureStore의 updateFurnitureForColumns 호출
      setTimeout(() => {
        const { updateFurnitureForColumns } = useFurnitureStore.getState();
        updateFurnitureForColumns(newState.spaceInfo);
      }, 0);
      
      return newState;
    }),
  
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
  
  // 패널B 설정 액션들
  setPanelBs: (panelBs) =>
    set((state) => ({
      spaceInfo: {
        ...state.spaceInfo,
        panelBs
      },
      isDirty: true,
    })),
  
  addPanelB: (panelB) =>
    set((state) => ({
      spaceInfo: {
        ...state.spaceInfo,
        panelBs: [...(state.spaceInfo.panelBs || []), panelB]
      },
      isDirty: true,
    })),
  
  removePanelB: (id) =>
    set((state) => ({
      spaceInfo: {
        ...state.spaceInfo,
        panelBs: (state.spaceInfo.panelBs || []).filter(panel => panel.id !== id)
      },
      isDirty: true,
    })),
  
  updatePanelB: (id, updates) =>
    set((state) => ({
      spaceInfo: {
        ...state.spaceInfo,
        panelBs: (state.spaceInfo.panelBs || []).map(panel => 
          panel.id === id ? { ...panel, ...updates } : panel
        )
      },
      isDirty: true,
    })),
  
  // 전체 상태 초기화
  resetAll: () => set({ ...initialState, isDirty: false }),
  
  // 저장 상태로 마킹
  markAsSaved: () => set({ isDirty: false }),
})); 