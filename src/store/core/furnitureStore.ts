import { create } from 'zustand';
import { PlacedModule, CurrentDragData } from '@/editor/shared/furniture/types';
import { analyzeColumnSlots, calculateFurnitureBounds } from '@/editor/shared/utils/columnSlotProcessor';
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
      
      // 제거할 듀얼 가구 ID 수집
      const modulesToRemove: string[] = [];
      
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
        
        // 듀얼 가구인 경우 두 번째 슬롯도 확인
        const isDualFurniture = module.isDualSlot || module.moduleId?.includes('dual-');
        let secondSlotInfo = null;
        if (isDualFurniture && columnSlots[globalSlotIndex + 1]) {
          secondSlotInfo = columnSlots[globalSlotIndex + 1];
        }
        
        console.log(`🔧 가구 ${module.id} (슬롯 ${module.slotIndex} → ${globalSlotIndex}):`, {
          isDualFurniture,
          hasColumn: slotInfo?.hasColumn,
          availableWidth: slotInfo?.availableWidth,
          adjustedWidth: slotInfo?.adjustedWidth,
          intrusionDirection: slotInfo?.intrusionDirection,
          secondSlotHasColumn: secondSlotInfo?.hasColumn
        });
        
        // 듀얼 가구이고 기둥이 침범하는 경우 제거 대상으로 표시
        if (isDualFurniture && (slotInfo?.hasColumn || secondSlotInfo?.hasColumn)) {
          console.log(`🚫 듀얼 가구 ${module.id} 제거 예정 - 기둥 침범`);
          modulesToRemove.push(module.id);
          return module; // 일단 그대로 반환 (나중에 필터링)
        }
        
        // 싱글 가구의 기둥 침범 처리
        if (!isDualFurniture && slotInfo?.hasColumn) {
          const newAdjustedWidth = slotInfo.adjustedWidth || slotInfo.availableWidth;
          console.log(`✅ 가구 ${module.id} adjustedWidth 설정: ${newAdjustedWidth}mm`);
          
          // 가구 위치 계산
          const indexing = calculateSpaceIndexing(spaceInfo);
          let slotCenterX = module.position.x; // 기본값
          
          // zone이 있는 경우 zone별 위치 사용
          if (module.zone && spaceInfo.droppedCeiling?.enabled) {
            const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
            const targetZone = module.zone === 'dropped' && zoneInfo.dropped ? zoneInfo.dropped : zoneInfo.normal;
            
            if (module.slotIndex !== undefined && module.slotIndex < targetZone.columnCount) {
              const zoneIndexing = module.zone === 'dropped' && indexing.zones?.dropped 
                ? indexing.zones.dropped 
                : (module.zone === 'normal' && indexing.zones?.normal ? indexing.zones.normal : indexing);
              
              if (zoneIndexing.threeUnitPositions && zoneIndexing.threeUnitPositions[module.slotIndex] !== undefined) {
                slotCenterX = zoneIndexing.threeUnitPositions[module.slotIndex];
              }
            }
          } else if (module.slotIndex !== undefined && indexing.threeUnitPositions[module.slotIndex] !== undefined) {
            slotCenterX = indexing.threeUnitPositions[module.slotIndex];
          }
          
          // 슬롯 경계 계산
          const slotWidth = indexing.columnWidth * 0.01; // mm to Three.js units
          const originalSlotBounds = {
            left: slotCenterX - slotWidth / 2,
            right: slotCenterX + slotWidth / 2,
            center: slotCenterX
          };
          
          // 가구 위치 계산 (calculateFurnitureBounds 함수 사용)
          const furnitureBounds = calculateFurnitureBounds(slotInfo, originalSlotBounds, spaceInfo);
          const adjustedX = furnitureBounds.center;
          
          return {
            ...module,
            adjustedWidth: newAdjustedWidth,
            position: {
              ...module.position,
              x: adjustedX
            }
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
      
      // 제거 대상 듀얼 가구 필터링
      const filteredModules = updatedModules.filter(m => !modulesToRemove.includes(m.id));
      
      console.log('🔧 기둥 변경에 따른 가구 업데이트 완료:', {
        columnCount: spaceInfo.columns?.length || 0,
        removedDualFurniture: modulesToRemove,
        updatedFurniture: filteredModules.filter(m => m.adjustedWidth !== undefined).map(m => ({
          id: m.id,
          slotIndex: m.slotIndex,
          adjustedWidth: m.adjustedWidth
        }))
      });
      
      // 제거된 듀얼 가구가 있으면 알림
      if (modulesToRemove.length > 0) {
        console.log(`⚠️ ${modulesToRemove.length}개의 듀얼 가구가 기둥 침범으로 제거되었습니다.`);
      }
      
      return {
        placedModules: filteredModules
      };
    });
  }
}));

// Development mode에서 디버깅을 위해 store를 window에 노출
if (process.env.NODE_ENV === 'development') {
  (window as any).__furnitureStore = useFurnitureStore;
}

export default useFurnitureStore; 