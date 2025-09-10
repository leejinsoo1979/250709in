import { create } from 'zustand';
import { PlacedModule, CurrentDragData } from '@/editor/shared/furniture/types';
import { analyzeColumnSlots } from '@/editor/shared/utils/columnSlotProcessor';
import { ColumnIndexer, calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { getModuleById } from '@/data/modules';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import { useSpaceConfigStore } from './spaceConfigStore';

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

    set((state) => {
      // ID 중복 체크
      const existing = state.placedModules.find(m => m.id === module.id);
      if (existing) {
        
        return state; // 변경 없음
      }
      
      // 새 가구의 카테고리 확인
      const spaceInfo = useSpaceConfigStore.getState().spaceInfo;
      const internalSpace = calculateInternalSpace(spaceInfo);
      const newModuleData = getModuleById(module.moduleId, internalSpace, spaceInfo);
      const newCategory = newModuleData?.category;
      
      // 듀얼 가구인지 확인
      const isDual = module.moduleId.includes('dual-');
      const occupiedSlots = isDual ? [module.slotIndex, module.slotIndex + 1] : [module.slotIndex];
      
      // 듀얼 가구가 차지하는 모든 슬롯에서 기존 가구들을 체크
      let existingModulesInSlot: typeof state.placedModules = [];
      for (const slotIdx of occupiedSlots) {
        const modulesInThisSlot = state.placedModules.filter(m => {
          // 기존 가구가 듀얼인지 확인
          const existingIsDual = m.moduleId.includes('dual-');
          const existingOccupiedSlots = existingIsDual ? [m.slotIndex, m.slotIndex + 1] : [m.slotIndex];
          
          // 기존 가구가 차지하는 슬롯 중 하나라도 현재 슬롯과 겹치는지 확인
          return existingOccupiedSlots.includes(slotIdx) && m.zone === module.zone;
        });
        
        // 중복 제거하며 추가
        modulesInThisSlot.forEach(m => {
          if (!existingModulesInSlot.find(existing => existing.id === m.id)) {
            existingModulesInSlot.push(m);
          }
        });
      }

      if (existingModulesInSlot.length > 0) {
        // 상부장과 하부장이 공존할 수 있는지 체크
        let modulesToReplace: typeof state.placedModules = [];
        
        // 모든 기존 가구와 공존 가능한지 확인
        for (const existing of existingModulesInSlot) {
          const existingModuleData = getModuleById(existing.moduleId, internalSpace, spaceInfo);
          const existingCategory = existingModuleData?.category;
          
          // 상부장-하부장 조합인지 확인
          if ((newCategory === 'upper' && existingCategory === 'lower') ||
              (newCategory === 'lower' && existingCategory === 'upper')) {
            // 공존 가능 - 계속 진행
            
          } else {
            // 같은 카테고리거나 full 타입이면 교체 필요
            modulesToReplace.push(existing);
            
          }
        }
        
        // 교체가 필요한 경우
        if (modulesToReplace.length > 0) {

          // 교체될 가구들의 ID 목록
          const replaceIds = modulesToReplace.map(m => m.id);
          
          return {
            placedModules: [
              ...state.placedModules.filter(m => !replaceIds.includes(m.id)),
              module
            ]
          };
        }
        
        // 모든 기존 가구와 공존 가능하면 추가
        
        return {
          placedModules: [...state.placedModules, module]
        };
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
    const currentModule = get().placedModules.find(m => m.id === id);

    set((state) => {
      const beforeCount = state.placedModules.length;
      
      // 슬롯 변경이 있을 경우 중복 체크
      if (updates.slotIndex !== undefined || updates.zone !== undefined) {
        const targetModule = state.placedModules.find(m => m.id === id);
        if (targetModule) {
          const newSlotIndex = updates.slotIndex !== undefined ? updates.slotIndex : targetModule.slotIndex;
          const newZone = updates.zone !== undefined ? updates.zone : targetModule.zone;
          
          // 이동하는 모듈의 카테고리 확인
          const spaceInfo = useSpaceConfigStore.getState();
          const internalSpace = calculateInternalSpace(spaceInfo);
          // updates.moduleId가 있으면 그걸 우선 사용 (모듈 타입이 변경되는 경우를 위해)
          const moduleIdToCheck = updates.moduleId || targetModule.moduleId;
          const targetModuleData = getModuleById(moduleIdToCheck, internalSpace, spaceInfo);
          const targetCategory = targetModuleData?.category;
          const isTargetUpper = targetCategory === 'upper';
          const isTargetLower = targetCategory === 'lower';

          // 듀얼 가구인지 확인 (업데이트된 moduleId 사용)
          const isDual = moduleIdToCheck.includes('dual-');
          const occupiedSlots = isDual ? [newSlotIndex, newSlotIndex + 1] : [newSlotIndex];
          
          // 듀얼 가구가 차지하는 모든 슬롯에서 기존 가구들을 체크
          let existingModulesInSlot: typeof state.placedModules = [];
          for (const slotIdx of occupiedSlots) {
            const modulesInThisSlot = state.placedModules.filter(m => {
              if (m.id === id) return false; // 자기 자신은 제외
              
              // 기존 가구가 듀얼인지 확인
              const existingIsDual = m.moduleId.includes('dual-');
              const existingOccupiedSlots = existingIsDual ? [m.slotIndex, m.slotIndex + 1] : [m.slotIndex];
              
              // 기존 가구가 차지하는 슬롯 중 하나라도 현재 슬롯과 겹치는지 확인
              return existingOccupiedSlots.includes(slotIdx) && m.zone === newZone;
            });
            
            // 중복 제거하며 추가
            modulesInThisSlot.forEach(m => {
              if (!existingModulesInSlot.find(existing => existing.id === m.id)) {
                existingModulesInSlot.push(m);
              }
            });
          }

          if (existingModulesInSlot.length > 0) {

            // 상부장-하부장 공존 가능 여부를 체크
            let modulesToReplace: typeof state.placedModules = [];
            
            // 기존 가구들과의 공존 가능 여부 체크
            for (const existing of existingModulesInSlot) {
              const existingModuleData = getModuleById(existing.moduleId, internalSpace, spaceInfo);
              const existingCategory = existingModuleData?.category;
              const existingIsDual = existing.moduleId.includes('dual-');

              // 상부장-하부장 공존 체크 (듀얼 여부와 관계없이)
              const canCoexist = (isTargetUpper && existingCategory === 'lower') || 
                                (isTargetLower && existingCategory === 'upper');

              if (canCoexist) {
                
                // 공존 가능하므로 modulesToReplace에 추가하지 않음
              } else {
                // 같은 카테고리거나 full 카테고리면 교체 필요
                modulesToReplace.push(existing);
                
              }
            }
            
            // 모든 기존 가구와 공존 가능하면 그냥 업데이트
            if (modulesToReplace.length === 0) {

              const newModules = state.placedModules.map(module => 
                module.id === id 
                  ? { ...module, ...updates } 
                  : module
              );
              
              return {
                placedModules: newModules
              };
            }
            
            // 교체가 필요한 경우
            if (modulesToReplace.length > 0) {

              // 교체될 가구들의 ID 목록
              const replaceIds = modulesToReplace.map(m => m.id);
              
              const filteredModules = state.placedModules.filter(m => !replaceIds.includes(m.id));
              const newModules = filteredModules.map(module => 
                module.id === id 
                  ? { ...module, ...updates } 
                  : module
              );
              
              return {
                placedModules: newModules
              };
            }
          }
        }
      }
      
      // 충돌이 없으면 일반 업데이트
      const newModules = state.placedModules.map(module => 
        module.id === id 
          ? { ...module, ...updates } 
          : module
      );

      return {
        placedModules: newModules
      };
    });
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

    set((state) => {
      const updatedModules = state.placedModules.map(module => ({
        ...module,
        hasDoor
      }));

      return {
        placedModules: updatedModules
      };
    });
  },
  
  // 기둥 변경 시 가구 adjustedWidth 업데이트
  updateFurnitureForColumns: (spaceInfo: any) => {
    set((state) => {

      const columnSlots = analyzeColumnSlots(spaceInfo);

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

        // 기둥이 있는 슬롯인 경우 adjustedWidth 설정
        if (slotInfo?.hasColumn) {
          const newAdjustedWidth = slotInfo.adjustedWidth || slotInfo.availableWidth;
          
          return {
            ...module,
            adjustedWidth: newAdjustedWidth
          };
        } else {
          // 기둥이 없는 슬롯인 경우 adjustedWidth 제거하고 위치 복원
          if (module.adjustedWidth !== undefined) {

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