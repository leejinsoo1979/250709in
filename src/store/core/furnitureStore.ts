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
      zone: module.zone,
      isSplit: module.isSplit,
      spaceType: module.columnSlotInfo?.spaceType
    });
    
    set((state) => {
      // ID 중복 체크
      const existing = state.placedModules.find(m => m.id === module.id);
      if (existing) {
        console.warn('⚠️ 이미 존재하는 가구 ID:', module.id);
        console.trace('중복 addModule 호출 스택:');
        return state; // 변경 없음
      }
      
      // 새 가구의 카테고리 확인
      const newModuleData = getModuleById(module.moduleId, undefined, undefined);
      const newCategory = newModuleData?.category;
      
      // 동일한 슬롯에 이미 가구가 있는지 체크
      const existingModulesInSlot = state.placedModules.filter(m => 
        m.slotIndex === module.slotIndex && 
        m.zone === module.zone
      );
      
      if (existingModulesInSlot.length > 0) {
        // 상부장과 하부장이 공존할 수 있는지 체크
        let canCoexist = false;
        let moduleToReplace = null;
        
        for (const existing of existingModulesInSlot) {
          const existingModuleData = getModuleById(existing.moduleId, undefined, undefined);
          const existingCategory = existingModuleData?.category;
          
          // 상부장-하부장 조합인지 확인
          if ((newCategory === 'upper' && existingCategory === 'lower') ||
              (newCategory === 'lower' && existingCategory === 'upper')) {
            canCoexist = true;
            console.log('✅ 상부장과 하부장 공존 가능:', {
              새가구: { id: module.id, category: newCategory },
              기존가구: { id: existing.id, category: existingCategory }
            });
          } else {
            // 같은 카테고리거나 full 타입이면 교체 필요
            moduleToReplace = existing;
            console.log('⚠️ 교체 필요:', {
              새가구: { id: module.id, category: newCategory },
              기존가구: { id: existing.id, category: existingCategory }
            });
          }
        }
        
        // 공존 가능하면 추가
        if (canCoexist && !moduleToReplace) {
          console.log('✅ 가구 공존 추가');
          return {
            placedModules: [...state.placedModules, module]
          };
        }
        
        // 교체가 필요한 경우
        if (moduleToReplace) {
          console.warn('⚠️ 기존 가구 교체:', {
            슬롯: module.slotIndex,
            zone: module.zone,
            기존가구: moduleToReplace.id,
            새가구: module.id
          });
          
          return {
            placedModules: state.placedModules.map(m => 
              m.id === moduleToReplace.id ? module : m
            )
          };
        }
      }
      
      console.log('✅ 가구 추가 완료:', {
        id: module.id,
        슬롯: module.slotIndex,
        zone: module.zone,
        전체가구수: state.placedModules.length + 1
      });
      
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
    console.log('📦 updatePlacedModule 호출:', {
      id,
      현재모듈: currentModule ? {
        moduleId: currentModule.moduleId,
        슬롯: currentModule.slotIndex,
        zone: currentModule.zone
      } : null,
      업데이트: {
        ...updates,
        position: updates.position,
        슬롯변경: updates.slotIndex,
        zone변경: updates.zone,
      },
      현재가구수: get().placedModules.length,
      현재가구IDs: get().placedModules.map(m => ({ id: m.id, slot: m.slotIndex, zone: m.zone }))
    });
    
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
          const targetModuleData = getModuleById(targetModule.moduleId, internalSpace, spaceInfo);
          const targetCategory = targetModuleData?.category;
          const isTargetUpper = targetCategory === 'upper';
          const isTargetLower = targetCategory === 'lower';
          
          // 다른 가구가 이미 해당 슬롯에 있는지 확인
          const existingModulesInSlot = state.placedModules.filter(m => 
            m.id !== id && // 자기 자신은 제외
            m.slotIndex === newSlotIndex &&
            m.zone === newZone // zone도 같아야 함
          );
          
          if (existingModulesInSlot.length > 0) {
            console.log('🔍 슬롯 이동 - 같은 슬롯에 이미 가구가 존재:', {
              슬롯: newSlotIndex,
              기존가구: existingModulesInSlot.map(m => ({ 
                id: m.id, 
                zone: m.zone,
                category: getModuleById(m.moduleId, internalSpace, spaceInfo)?.category 
              })),
              이동가구: { id, zone: newZone, category: targetCategory }
            });
            
            // 상부장-하부장 공존 가능 여부를 먼저 체크
            let canCoexist = false;
            let moduleToReplace = null;
            
            for (const existing of existingModulesInSlot) {
              const existingModuleData = getModuleById(existing.moduleId, internalSpace, spaceInfo);
              const existingCategory = existingModuleData?.category;
              
              // 상부장-하부장 관계인지 체크
              if ((isTargetUpper && existingCategory === 'lower') || (isTargetLower && existingCategory === 'upper')) {
                // 상부장과 하부장은 공존 가능
                canCoexist = true;
                console.log('✅ 상부장-하부장 공존 가능 (updatePlacedModule):', {
                  기존: { id: existing.id, category: existingCategory, zone: existing.zone },
                  이동: { id, category: targetCategory, zone: newZone }
                });
                // 공존 가능하면 교체 대상 없음
                break;
              } else {
                // 상부장-하부장 관계가 아니면 교체 대상
                moduleToReplace = existing;
                console.log('⚠️ 공존 불가능한 가구 (updatePlacedModule):', {
                  기존: { id: existing.id, category: existingCategory, zone: existing.zone },
                  이동: { id, category: targetCategory, zone: newZone }
                });
              }
            }
            
            // 공존 가능하면 그냥 업데이트
            if (canCoexist) {
              console.log('✅ 상부장과 하부장 공존 - 위치 업데이트:', {
                슬롯: newSlotIndex,
                이동가구: { id, category: targetCategory, zone: newZone },
                기존가구유지: existingModulesInSlot.map(m => m.id)
              });
              
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
            if (moduleToReplace) {
              console.warn('⚠️ 기존 가구 제거 후 이동:', {
                제거가구: moduleToReplace.id,
                이동가구: id,
                슬롯: newSlotIndex
              });
              
              const filteredModules = state.placedModules.filter(m => m.id !== moduleToReplace.id);
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
      
      console.log('📦 updatePlacedModule 완료:', {
        이전가구수: beforeCount,
        이후가구수: newModules.length,
        변경된가구: id,
        가구목록변경: beforeCount !== newModules.length
      });
      
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