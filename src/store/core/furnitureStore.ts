import { create } from 'zustand';
import { PlacedModule, CurrentDragData } from '@/editor/shared/furniture/types';
import { analyzeColumnSlots } from '@/editor/shared/utils/columnSlotProcessor';
import { ColumnIndexer, calculateSpaceIndexing } from '@/editor/shared/utils/indexing';

// 가구 데이터 Store 상태 타입 정의
interface FurnitureDataState {
  // 가구 데이터 상태
  placedModules: PlacedModule[];
  
  // 선택 상태 (FurnitureSelectionProvider에서 이전)
  selectedLibraryModuleId: string | null;
  selectedPlacedModuleId: string | null;
  selectedFurnitureId: string | null; // Click & Place를 위한 선택된 가구 ID
  
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
  
  // 기둥 변경 시 가구 업데이트
  updateFurnitureForColumns: (spaceInfo: any) => void;
  
  // 선택 상태 액션들 (FurnitureSelectionProvider와 동일한 인터페이스)
  setSelectedLibraryModuleId: (id: string | null) => void;
  setSelectedPlacedModuleId: (id: string | null) => void;
  setSelectedFurnitureId: (id: string | null) => void;
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
  selectedFurnitureId: null,

  // UI 상태 초기값 (FurnitureUIProvider와 동일)
  isFurniturePlacementMode: false,
  editMode: false,
  editingModuleId: null,

  // 드래그 상태 초기값 (FurnitureDragProvider와 동일)
  currentDragData: null,

  // 모듈 추가 함수 (기존 Context 로직과 동일)
  addModule: (module: PlacedModule) => {
    console.log('🟢 addModule 호출:', {
      id: module.id,
      position: {
        x: module.position.x.toFixed(3),
        y: module.position.y.toFixed(3),
        z: module.position.z.toFixed(3)
      },
      customDepth: module.customDepth,
      customWidth: module.customWidth,
      adjustedWidth: module.adjustedWidth,
      slotIndex: module.slotIndex,
      isSplit: module.isSplit,
      spaceType: module.columnSlotInfo?.spaceType
    });
    
    set((state) => {
      // 중복 체크
      const existing = state.placedModules.find(m => m.id === module.id);
      if (existing) {
        console.warn('⚠️ 이미 존재하는 가구 ID:', module.id);
        console.trace('중복 addModule 호출 스택:');
        return state; // 변경 없음
      }
      
      return {
        placedModules: [...state.placedModules, module]
      };
    });
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

  setSelectedFurnitureId: (id: string | null) => {
    set({ selectedFurnitureId: id });
  },

  clearAllSelections: () => {
    set({ 
      selectedLibraryModuleId: null,
      selectedPlacedModuleId: null,
      selectedFurnitureId: null 
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
  },
  
  // 기둥 변경 시 가구 adjustedWidth 업데이트
  updateFurnitureForColumns: (spaceInfo: any) => {
    set((state) => {
      console.log('🔧 updateFurnitureForColumns 호출:', {
        surroundType: spaceInfo.surroundType,
        columnCount: spaceInfo.columns?.length || 0,
        columns: spaceInfo.columns?.map(c => ({ id: c.id, position: c.position, depth: c.depth }))
      });
      
      const columnSlots = analyzeColumnSlots(spaceInfo);
      console.log('🔧 analyzeColumnSlots 결과:', columnSlots);
      
      const updatedModules = state.placedModules.map(module => {
        if (module.slotIndex === undefined) return module;
        
        // zone이 있는 경우 글로벌 슬롯 인덱스로 변환
        let globalSlotIndex = module.slotIndex;
        if (module.zone && spaceInfo.droppedCeiling?.enabled) {
          const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
          if (module.zone === 'dropped' && zoneInfo.dropped) {
            globalSlotIndex = zoneInfo.normal.columnCount + module.slotIndex;
          }
        }
        
        const slotInfo = columnSlots[globalSlotIndex];
        
        console.log(`🔧 가구 ${module.id} (슬롯 ${module.slotIndex} → ${globalSlotIndex}):`, {
          hasColumn: slotInfo?.hasColumn,
          availableWidth: slotInfo?.availableWidth,
          adjustedWidth: slotInfo?.adjustedWidth,
          intrusionDirection: slotInfo?.intrusionDirection
        });
        
        // 기둥이 있는 슬롯인 경우 adjustedWidth 설정
        if (slotInfo?.hasColumn) {
          const newAdjustedWidth = slotInfo.adjustedWidth || slotInfo.availableWidth;
          console.log(`✅ 가구 ${module.id} adjustedWidth 설정: ${newAdjustedWidth}mm`);
          return {
            ...module,
            adjustedWidth: newAdjustedWidth
          };
        } else {
          // 기둥이 없는 슬롯인 경우 adjustedWidth 제거하고 위치 복원
          if (module.adjustedWidth !== undefined) {
            console.log(`❌ 가구 ${module.id} adjustedWidth 제거 및 위치 복원`);
            
            // 원래 슬롯 중심 위치로 복원
            const indexing = calculateSpaceIndexing(spaceInfo);
            let originalX = module.position.x;
            
            // zone이 있는 경우 zone별 위치 사용
            if (module.zone && spaceInfo.droppedCeiling?.enabled) {
              const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
              const targetZone = module.zone === 'dropped' && zoneInfo.dropped ? zoneInfo.dropped : zoneInfo.normal;
              
              if (module.slotIndex !== undefined && module.slotIndex < targetZone.columnCount) {
                // zone별 indexing 정보 사용
                const zoneIndexing = module.zone === 'dropped' && indexing.zones?.dropped 
                  ? indexing.zones.dropped 
                  : (module.zone === 'normal' && indexing.zones?.normal ? indexing.zones.normal : indexing);
                
                if (zoneIndexing.threeUnitPositions && zoneIndexing.threeUnitPositions[module.slotIndex] !== undefined) {
                  originalX = zoneIndexing.threeUnitPositions[module.slotIndex];
                }
              }
            } else if (module.slotIndex !== undefined && indexing.threeUnitPositions[module.slotIndex] !== undefined) {
              // zone이 없는 경우 전체 indexing 사용
              originalX = indexing.threeUnitPositions[module.slotIndex];
            }
            
            return {
              ...module,
              adjustedWidth: undefined,
              position: {
                ...module.position,
                x: originalX
              }
            };
          }
          return {
            ...module,
            adjustedWidth: undefined
          };
        }
      });
      
      console.log('🔧 기둥 변경에 따른 가구 업데이트 완료:', {
        columnCount: spaceInfo.columns?.length || 0,
        updatedFurniture: updatedModules.filter(m => m.adjustedWidth !== undefined).map(m => ({
          id: m.id,
          slotIndex: m.slotIndex,
          adjustedWidth: m.adjustedWidth
        }))
      });
      
      return {
        placedModules: updatedModules
      };
    });
  },
  
  // Mark as saved
  markAsSaved: () => {
    set({ hasUnsavedChanges: false });
  }
}));

// Development mode에서 디버깅을 위해 store를 window에 노출
if (process.env.NODE_ENV === 'development') {
  (window as any).__furnitureStore = useFurnitureStore;
}

export default useFurnitureStore; 