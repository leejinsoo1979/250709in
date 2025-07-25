import { create } from 'zustand';
import { PlacedModule, CurrentDragData } from '@/editor/shared/furniture/types';

// 가구 데이터 Store 상태 타입 정의
interface FurnitureDataState {
  // 가구 데이터 상태
  placedModules: PlacedModule[];
  
  // 선택 상태 (FurnitureSelectionProvider에서 이전)
  selectedLibraryModuleId: string | null;
  selectedPlacedModuleId: string | null;
  
  // UI 상태 (FurnitureUIProvider에서 이전)
  isFurniturePlacementMode: boolean;
  editMode: boolean;
  editingModuleId: string | null;
  
  // 드래그 상태 (FurnitureDragProvider에서 이전)
  currentDragData: CurrentDragData | null;
  
  // 가구 데이터 액션들
  addModule: (module: PlacedModule) => void;
  removeModule: (id: string) => void;
  updatePlacedModule: (id: string, updates: Partial<PlacedModule>) => void;
  clearAllModules: () => void;
  moveModule: (id: string, position: { x: number; y: number; z: number }) => void;
  setPlacedModules: (modules: PlacedModule[] | ((prev: PlacedModule[]) => PlacedModule[])) => void;
  
  // 전체 도어 설치/제거
  setAllDoors: (hasDoor: boolean) => void;
  
  // 선택 상태 액션들 (FurnitureSelectionProvider와 동일한 인터페이스)
  setSelectedLibraryModuleId: (id: string | null) => void;
  setSelectedPlacedModuleId: (id: string | null) => void;
  clearAllSelections: () => void;
  
  // UI 상태 액션들 (FurnitureUIProvider와 동일한 인터페이스)
  setFurniturePlacementMode: (mode: boolean) => void;
  setEditMode: (mode: boolean) => void;
  setEditingModuleId: (id: string | null) => void;
  exitEditMode: () => void;
  
  // 드래그 상태 액션들 (FurnitureDragProvider와 동일한 인터페이스)
  setCurrentDragData: (data: CurrentDragData | null) => void;
  clearDragData: () => void;
}

// 가구 데이터 Store 생성
export const useFurnitureStore = create<FurnitureDataState>((set, get) => ({
  // 가구 데이터 초기 상태
  placedModules: [],

  // 선택 상태 초기값 (FurnitureSelectionProvider와 동일)
  selectedLibraryModuleId: null,
  selectedPlacedModuleId: null,

  // UI 상태 초기값 (FurnitureUIProvider와 동일)
  isFurniturePlacementMode: false,
  editMode: false,
  editingModuleId: null,

  // 드래그 상태 초기값 (FurnitureDragProvider와 동일)
  currentDragData: null,

  // 모듈 추가 함수 (기존 Context 로직과 동일)
  addModule: (module: PlacedModule) => {
    set((state) => ({
      placedModules: [...state.placedModules, module]
    }));
  },

  // 모듈 제거 함수 (기존 Context 로직과 동일)
  removeModule: (id: string) => {
    set((state) => ({
      placedModules: state.placedModules.filter(module => module.id !== id)
    }));
  },

  // 모듈 이동 함수 (기존 Context 로직과 동일)
  moveModule: (id: string, position: { x: number; y: number; z: number }) => {
    set((state) => ({
      placedModules: state.placedModules.map(module => 
        module.id === id 
          ? { ...module, position } 
          : module
      )
    }));
  },

  // 배치된 모듈 속성 업데이트 함수 (기존 Context 로직과 동일)
  updatePlacedModule: (id: string, updates: Partial<PlacedModule>) => {
    console.log('📦 updatePlacedModule 호출:', {
      id,
      updates,
      hasPosition: !!updates.position,
      position: updates.position
    });
    
    set((state) => ({
      placedModules: state.placedModules.map(module => 
        module.id === id 
          ? { ...module, ...updates } 
          : module
      )
    }));
  },

  // 모든 가구 초기화 함수 (기존 Context 로직과 동일)
  clearAllModules: () => {
    set({ placedModules: [] });
  },

  // 가구 목록 직접 설정 함수 (함수형 업데이트 지원)
  setPlacedModules: (modules: PlacedModule[] | ((prev: PlacedModule[]) => PlacedModule[])) => {
    set((state) => ({
      placedModules: typeof modules === 'function' ? modules(state.placedModules) : modules
    }));
  },

  // 선택 상태 액션들 (FurnitureSelectionProvider와 완전히 동일한 로직)
  setSelectedLibraryModuleId: (id: string | null) => {
    set({ selectedLibraryModuleId: id });
  },

  setSelectedPlacedModuleId: (id: string | null) => {
    set({ selectedPlacedModuleId: id });
  },

  clearAllSelections: () => {
    set({ 
      selectedLibraryModuleId: null,
      selectedPlacedModuleId: null 
    });
  },

  // UI 상태 액션들 (FurnitureUIProvider와 완전히 동일한 로직)
  setFurniturePlacementMode: (mode: boolean) => {
    set({ isFurniturePlacementMode: mode });
  },

  setEditMode: (mode: boolean) => {
    set({ editMode: mode });
  },

  setEditingModuleId: (id: string | null) => {
    set({ editingModuleId: id });
  },

  exitEditMode: () => {
    set({ 
      editMode: false,
      editingModuleId: null 
    });
  },

  // 드래그 상태 액션들 (FurnitureDragProvider와 완전히 동일한 로직)
  setCurrentDragData: (data: CurrentDragData | null) => {
    set({ currentDragData: data });
  },

  clearDragData: () => {
    set({ currentDragData: null });
  },

  // 전체 도어 설치/제거 함수
  setAllDoors: (hasDoor: boolean) => {
    console.log('🚪 setAllDoors 호출:', {
      hasDoor,
      currentModulesCount: get().placedModules.length,
      currentModules: get().placedModules.map(m => ({ id: m.id, hasDoor: m.hasDoor }))
    });
    
    set((state) => {
      const updatedModules = state.placedModules.map(module => ({
        ...module,
        hasDoor
      }));
      
      console.log('🚪 setAllDoors 완료:', {
        updatedModulesCount: updatedModules.length,
        updatedModules: updatedModules.map(m => ({ id: m.id, hasDoor: m.hasDoor }))
      });
      
      return {
        placedModules: updatedModules
      };
    });
  }
})); 