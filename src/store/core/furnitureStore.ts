import { create } from 'zustand';
import { PlacedModule, CurrentDragData } from '@/editor/shared/furniture/types';
import { analyzeColumnSlots, calculateFurnitureBounds } from '@/editor/shared/utils/columnSlotProcessor';
import { ColumnIndexer, calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
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
  
  // 띄워서 배치 설정 변경 시 가구 Y 위치 업데이트
  updateFurnitureYPositions: (spaceInfo: any) => void;
  
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
  
  // 변경 상태 추적
  isDirty: boolean;
  setIsDirty: (dirty: boolean) => void;
  resetAll: () => void;
  markAsSaved: () => void;
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
    // console.log를 set 함수 밖에 배치
    console.log('🟢🟢🟢 [Store] addModule 함수 진입!!!', {
      id: module.id,
      moduleId: module.moduleId,
      slotIndex: module.slotIndex,
      isDualSlot: module.isDualSlot,
      position: module.position
    });
    
    // 충돌 검사를 set 함수 밖에서 먼저 수행
    const currentState = get();
    const existingModules = currentState.placedModules;
    const moduleSlotIndex = module.slotIndex;
    const moduleZone = module.zone;
    const isDualSlot = module.isDualSlot;
    
    // slotIndex가 undefined인 경우 위치로부터 계산
    let calculatedSlotIndex = moduleSlotIndex;
    if (calculatedSlotIndex === undefined || calculatedSlotIndex === null) {
      console.warn('⚠️ [Store] slotIndex가 undefined! position으로부터 계산 시도:', {
        position: module.position,
        zone: moduleZone
      });
      
      // position.x를 기반으로 slotIndex 계산
      const spaceInfo = useSpaceConfigStore.getState().spaceInfo;
      const indexing = calculateSpaceIndexing(spaceInfo);
      
      if (indexing && indexing.threeUnitPositions) {
        // 가장 가까운 슬롯 찾기
        let minDistance = Infinity;
        let closestSlot = 0;
        
        for (let i = 0; i < indexing.threeUnitPositions.length; i++) {
          const distance = Math.abs(module.position.x - indexing.threeUnitPositions[i]);
          if (distance < minDistance) {
            minDistance = distance;
            closestSlot = i;
          }
        }
        
        calculatedSlotIndex = closestSlot;
        console.log('📍 [Store] position으로부터 slotIndex 계산:', {
          positionX: module.position.x,
          calculatedSlotIndex,
          minDistance
        });
      }
    }
    
    // 충돌 검사
    console.log('🔍 [Store] 충돌 검사 시작:', {
      새가구: {
        id: module.id,
        slotIndex: calculatedSlotIndex,
        isDualSlot: isDualSlot,
        zone: moduleZone,
        점유슬롯: isDualSlot ? [calculatedSlotIndex, calculatedSlotIndex + 1] : [calculatedSlotIndex]
      },
      기존가구수: existingModules.length
    });
    
    // 상부장/하부장 여부 확인 - 간단하게 ID로만 판단
    const isNewUpper = module.moduleId.includes('upper-cabinet');
    const isNewLower = module.moduleId.includes('lower-cabinet');
    
    console.log('🔍 [Store] 새 가구 카테고리:', {
      moduleId: module.moduleId,
      isUpper: isNewUpper,
      isLower: isNewLower
    });
    
    const hasConflict = existingModules.some(existing => {
      // 기존 가구의 slotIndex도 확인
      let existingSlotIndex = existing.slotIndex;
      
      // 기존 가구의 slotIndex가 undefined인 경우 position으로부터 계산
      if (existingSlotIndex === undefined || existingSlotIndex === null) {
        const spaceInfo = useSpaceConfigStore.getState().spaceInfo;
        const indexing = calculateSpaceIndexing(spaceInfo);
        
        if (indexing && indexing.threeUnitPositions) {
          let minDistance = Infinity;
          let closestSlot = 0;
          
          for (let i = 0; i < indexing.threeUnitPositions.length; i++) {
            const distance = Math.abs(existing.position.x - indexing.threeUnitPositions[i]);
            if (distance < minDistance) {
              minDistance = distance;
              closestSlot = i;
            }
          }
          
          existingSlotIndex = closestSlot;
        }
      }
      
      // 같은 zone의 가구만 검사 (zone이 없으면 모두 검사)
      if (moduleZone !== undefined && existing.zone !== undefined && moduleZone !== existing.zone) {
        return false;
      }
      
      // 슬롯 충돌 검사
      let hasSlotOverlap = false;
      
      if (isDualSlot) {
        // 새 가구가 듀얼인 경우: 2개 슬롯 검사
        hasSlotOverlap = (existingSlotIndex === calculatedSlotIndex || existingSlotIndex === calculatedSlotIndex + 1) ||
                        (existing.isDualSlot && (existingSlotIndex + 1 === calculatedSlotIndex || existingSlotIndex + 1 === calculatedSlotIndex + 1));
      } else {
        // 새 가구가 싱글인 경우: 1개 슬롯 검사
        hasSlotOverlap = existingSlotIndex === calculatedSlotIndex ||
                        (existing.isDualSlot && existingSlotIndex + 1 === calculatedSlotIndex);
      }
      
      // 슬롯이 겹치지 않으면 충돌 없음
      if (!hasSlotOverlap) {
        return false;
      }
      
      // 슬롯이 겹치는 경우 상부장/하부장 공존 체크 - 간단하게 ID로만 판단
      const isExistingUpper = existing.moduleId.includes('upper-cabinet');
      const isExistingLower = existing.moduleId.includes('lower-cabinet');
      
      // 상부장과 하부장은 공존 가능
      if ((isNewUpper && isExistingLower) || (isNewLower && isExistingUpper)) {
        console.log('✅ [Store] 상부장/하부장 공존 허용:', {
          새가구: { 
            id: module.id, 
            moduleId: module.moduleId, 
            isUpper: isNewUpper, 
            isLower: isNewLower 
          },
          기존가구: { 
            id: existing.id, 
            moduleId: existing.moduleId, 
            isUpper: isExistingUpper, 
            isLower: isExistingLower 
          }
        });
        return false; // 충돌 없음
      }
      
      // 같은 카테고리거나 일반 가구끼리는 충돌
      console.log('❌ [Store] 가구 충돌 감지:', {
        새가구: { id: module.id, slotIndex: calculatedSlotIndex, isDualSlot, isUpper: isNewUpper, isLower: isNewLower },
        기존가구: { id: existing.id, slotIndex: existingSlotIndex, isDualSlot: existing.isDualSlot, isUpper: isExistingUpper, isLower: isExistingLower }
      });
      return true; // 충돌
    });
    
    if (hasConflict) {
      console.error('🚫🚫🚫 [Store] 슬롯 충돌로 가구 추가 거부!', {
        moduleId: module.moduleId,
        slotIndex: calculatedSlotIndex,
        zone: moduleZone
      });
      // 충돌이 있으면 추가하지 않음 (조용히 차단)
      return;
    }
    
    // 충돌이 없으면 추가
    const moduleWithSlot = {
      ...module,
      slotIndex: calculatedSlotIndex
    };
    
    // 추가 직후 상태 확인
    set((state) => {
      // 충돌 검사는 이미 위에서 완료했으므로 바로 추가
      const newModules = [...state.placedModules, moduleWithSlot];
      console.log('✅ [Store] 가구 추가 완료:', newModules.map(m => ({
        id: m.id,
        moduleId: m.moduleId,
        slotIndex: m.slotIndex,
        isDualSlot: m.isDualSlot
      })));
      return { placedModules: newModules };
    });
  },

  // 모듈 제거 함수 (기존 Context 로직과 동일)
  removeModule: (id: string) => {
    set((state) => ({
      placedModules: state.placedModules.filter(module => module.id !== id)
    }));
  },

  // 모듈 이동 함수 - 충돌 감지 추가
  moveModule: (id: string, position: { x: number; y: number; z: number }) => {
    const currentState = get();
    const movingModule = currentState.placedModules.find(m => m.id === id);
    
    if (!movingModule) {
      console.error('이동할 가구를 찾을 수 없습니다:', id);
      return;
    }
    
    // position으로부터 slotIndex 계산
    const spaceInfo = useSpaceConfigStore.getState().spaceInfo;
    const indexing = calculateSpaceIndexing(spaceInfo);
    let newSlotIndex = movingModule.slotIndex;
    
    if (indexing && indexing.threeUnitPositions) {
      let minDistance = Infinity;
      let closestSlot = 0;
      
      for (let i = 0; i < indexing.threeUnitPositions.length; i++) {
        const distance = Math.abs(position.x - indexing.threeUnitPositions[i]);
        if (distance < minDistance) {
          minDistance = distance;
          closestSlot = i;
        }
      }
      
      newSlotIndex = closestSlot;
    }
    
    // 상하부장 여부 확인
    const isMovingUpper = movingModule.moduleId.includes('upper-cabinet');
    const isMovingLower = movingModule.moduleId.includes('lower-cabinet');
    
    // 충돌 검사 (자기 자신 제외)
    const hasConflict = currentState.placedModules.some(existing => {
      if (existing.id === id) return false; // 자기 자신은 제외
      
      let existingSlotIndex = existing.slotIndex;
      
      // 기존 가구의 slotIndex가 없으면 position으로 계산
      if (existingSlotIndex === undefined || existingSlotIndex === null) {
        if (indexing && indexing.threeUnitPositions) {
          let minDistance = Infinity;
          let closestSlot = 0;
          
          for (let i = 0; i < indexing.threeUnitPositions.length; i++) {
            const distance = Math.abs(existing.position.x - indexing.threeUnitPositions[i]);
            if (distance < minDistance) {
              minDistance = distance;
              closestSlot = i;
            }
          }
          
          existingSlotIndex = closestSlot;
        }
      }
      
      // zone 체크
      if (movingModule.zone !== undefined && existing.zone !== undefined && movingModule.zone !== existing.zone) {
        return false;
      }
      
      // 슬롯 충돌 검사
      let hasSlotOverlap = false;
      if (movingModule.isDualSlot) {
        hasSlotOverlap = (existingSlotIndex === newSlotIndex || existingSlotIndex === newSlotIndex + 1) ||
               (existing.isDualSlot && (existingSlotIndex + 1 === newSlotIndex || existingSlotIndex + 1 === newSlotIndex + 1));
      } else {
        hasSlotOverlap = existingSlotIndex === newSlotIndex ||
               (existing.isDualSlot && existingSlotIndex + 1 === newSlotIndex);
      }
      
      // 슬롯이 겹치지 않으면 충돌 없음
      if (!hasSlotOverlap) {
        return false;
      }
      
      // 슬롯이 겹치는 경우 상하부장 예외 처리
      const isExistingUpper = existing.moduleId.includes('upper-cabinet');
      const isExistingLower = existing.moduleId.includes('lower-cabinet');
      
      // 상부장과 하부장은 공존 가능
      if ((isMovingUpper && isExistingLower) || (isMovingLower && isExistingUpper)) {
        console.log('✅ [moveModule] 상하부장 공존 허용');
        return false; // 충돌 없음
      }
      
      return true; // 충돌
    });
    
    if (hasConflict) {
      console.error('🚫 이동 위치에 이미 가구가 있습니다!');
      // 조용히 이동 차단
      return;
    }
    
    // 충돌이 없으면 이동
    set((state) => ({
      placedModules: state.placedModules.map(module => 
        module.id === id 
          ? { ...module, position, slotIndex: newSlotIndex } 
          : module
      )
    }));
  },

  // 배치된 모듈 속성 업데이트 함수 - 충돌 감지 추가
  updatePlacedModule: (id: string, updates: Partial<PlacedModule>) => {
    console.log('📦 updatePlacedModule 호출:', {
      id,
      updates,
      hasPosition: !!updates.position,
      position: updates.position,
      hasSlotIndex: updates.slotIndex !== undefined
    });
    
    // position이나 slotIndex가 변경되는 경우 충돌 검사
    if (updates.position || updates.slotIndex !== undefined) {
      const currentState = get();
      const updatingModule = currentState.placedModules.find(m => m.id === id);
      
      if (!updatingModule) {
        console.error('업데이트할 가구를 찾을 수 없습니다:', id);
        return;
      }
      
      // 새로운 slotIndex 결정
      let newSlotIndex = updates.slotIndex;
      
      // slotIndex가 없고 position이 있으면 계산
      if (newSlotIndex === undefined && updates.position) {
        const spaceInfo = useSpaceConfigStore.getState().spaceInfo;
        const indexing = calculateSpaceIndexing(spaceInfo);
        
        if (indexing && indexing.threeUnitPositions) {
          let minDistance = Infinity;
          let closestSlot = 0;
          
          for (let i = 0; i < indexing.threeUnitPositions.length; i++) {
            const distance = Math.abs(updates.position.x - indexing.threeUnitPositions[i]);
            if (distance < minDistance) {
              minDistance = distance;
              closestSlot = i;
            }
          }
          
          newSlotIndex = closestSlot;
        }
      }
      
      // slotIndex가 변경되는 경우에만 충돌 검사
      if (newSlotIndex !== undefined && newSlotIndex !== updatingModule.slotIndex) {
        const mergedModule = { ...updatingModule, ...updates, slotIndex: newSlotIndex };
        
        const hasConflict = currentState.placedModules.some(existing => {
          if (existing.id === id) return false; // 자기 자신은 제외
          
          let existingSlotIndex = existing.slotIndex;
          
          // 기존 가구의 slotIndex가 없으면 position으로 계산
          if (existingSlotIndex === undefined || existingSlotIndex === null) {
            const spaceInfo = useSpaceConfigStore.getState().spaceInfo;
            const indexing = calculateSpaceIndexing(spaceInfo);
            
            if (indexing && indexing.threeUnitPositions) {
              let minDistance = Infinity;
              let closestSlot = 0;
              
              for (let i = 0; i < indexing.threeUnitPositions.length; i++) {
                const distance = Math.abs(existing.position.x - indexing.threeUnitPositions[i]);
                if (distance < minDistance) {
                  minDistance = distance;
                  closestSlot = i;
                }
              }
              
              existingSlotIndex = closestSlot;
            }
          }
          
          // zone 체크
          const moduleZone = mergedModule.zone;
          if (moduleZone !== undefined && existing.zone !== undefined && moduleZone !== existing.zone) {
            return false;
          }
          
          // 슬롯 충돌 검사
          if (mergedModule.isDualSlot) {
            const hasSlotConflict = (existingSlotIndex === newSlotIndex || existingSlotIndex === newSlotIndex + 1) ||
                   (existing.isDualSlot && (existingSlotIndex + 1 === newSlotIndex || existingSlotIndex + 1 === newSlotIndex + 1));
            
            if (hasSlotConflict) {
              // 상부장/하부장 예외 처리
              const isMovingUpper = mergedModule.moduleId.includes('upper-cabinet');
              const isMovingLower = mergedModule.moduleId.includes('lower-cabinet');
              const isExistingUpper = existing.moduleId.includes('upper-cabinet');
              const isExistingLower = existing.moduleId.includes('lower-cabinet');
              
              if ((isMovingUpper && isExistingLower) || (isMovingLower && isExistingUpper)) {
                return false; // 충돌 없음 - 상하부장은 공존 가능
              }
              return true; // 다른 경우는 충돌
            }
            return false;
          } else {
            const hasSlotConflict = existingSlotIndex === newSlotIndex ||
                   (existing.isDualSlot && existingSlotIndex + 1 === newSlotIndex);
            
            if (hasSlotConflict) {
              // 상부장/하부장 예외 처리
              const isMovingUpper = mergedModule.moduleId.includes('upper-cabinet');
              const isMovingLower = mergedModule.moduleId.includes('lower-cabinet');
              const isExistingUpper = existing.moduleId.includes('upper-cabinet');
              const isExistingLower = existing.moduleId.includes('lower-cabinet');
              
              if ((isMovingUpper && isExistingLower) || (isMovingLower && isExistingUpper)) {
                return false; // 충돌 없음 - 상하부장은 공존 가능
              }
              return true; // 다른 경우는 충돌
            }
            return false;
          }
        });
        
        if (hasConflict) {
          console.error('🚫 업데이트 위치에 이미 가구가 있습니다!');
          // 조용히 업데이트 차단
          return;
        }
        
        // slotIndex를 updates에 추가
        updates = { ...updates, slotIndex: newSlotIndex };
      }
    }
    
    // 충돌이 없으면 업데이트
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
    const currentModules = get().placedModules;
    console.log('🔴 [FURNITURE STORE] clearAllModules 호출:', {
      previousCount: currentModules.length,
      previousModules: currentModules.map(m => ({ id: m.id, name: m.name, slotIndex: m.slotIndex }))
    });
    console.trace('🔴 [TRACE] clearAllModules 호출 스택');
    set({ placedModules: [] });
  },

  // 가구 목록 직접 설정 함수 (함수형 업데이트 지원)
  setPlacedModules: (modules: PlacedModule[] | ((prev: PlacedModule[]) => PlacedModule[])) => {
    const actualModules = get().placedModules;
    const newModules = typeof modules === 'function' ? modules(actualModules) : modules;
    
    console.log('🔴 [FURNITURE STORE] setPlacedModules 호출:', {
      previousCount: actualModules.length,
      newCount: newModules.length,
      isFunction: typeof modules === 'function',
      newModules: newModules.map(m => ({ id: m.id, name: m.name, slotIndex: m.slotIndex })),
      previousModules: actualModules.map(m => ({ id: m.id, name: m.name, slotIndex: m.slotIndex }))
    });
    console.trace('🔴 [TRACE] setPlacedModules 호출 스택');
    
    set({ placedModules: newModules });
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
  
  // 변경 상태 추적
  isDirty: false,
  setIsDirty: (dirty: boolean) => set({ isDirty: dirty }),
  resetAll: () => {
    const currentModules = get().placedModules;
    console.log('🔴 [FURNITURE STORE] resetAll 호출:', {
      previousCount: currentModules.length,
      previousModules: currentModules.map(m => ({ id: m.id, name: m.name, slotIndex: m.slotIndex }))
    });
    console.trace('🔴 [TRACE] resetAll 호출 스택');
    set({
      placedModules: [],
      selectedLibraryModuleId: null,
      selectedPlacedModuleId: null,
      selectedFurnitureId: null,
      isFurniturePlacementMode: false,
      editMode: false,
      editingModuleId: null,
      currentDragData: null,
      isDirty: false
    });
  },
  markAsSaved: () => set({ isDirty: false }),

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
        columns: spaceInfo.columns?.map(c => ({ id: c.id, position: c.position, depth: c.depth })),
        customColumnCount: spaceInfo.customColumnCount,
        mainDoorCount: spaceInfo.mainDoorCount,
        droppedCeilingDoorCount: spaceInfo.droppedCeilingDoorCount
      });
      
      // 현재 컬럼 수 계산
      let totalColumnCount = 0;
      if (spaceInfo.droppedCeiling?.enabled) {
        // 단내림이 활성화된 경우
        const mainCount = spaceInfo.mainDoorCount || spaceInfo.customColumnCount || 3;
        const droppedCount = spaceInfo.droppedCeilingDoorCount || 1;
        totalColumnCount = mainCount + droppedCount;
      } else {
        // 단내림이 비활성화된 경우
        totalColumnCount = spaceInfo.customColumnCount || 3;
      }
      
      console.log('📐 현재 총 컬럼 수:', totalColumnCount);
      
      const columnSlots = analyzeColumnSlots(spaceInfo);
      console.log('🔧 analyzeColumnSlots 결과:', columnSlots);
      
      // 상부장/하부장의 moduleId 업데이트 (공간 설정 변경 시 ID가 바뀌므로)
      const indexing = calculateSpaceIndexing(spaceInfo);
      const newColumnWidth = indexing.columnWidth;
      
      // 제거할 가구 ID 수집 (듀얼 가구 + 컬럼 수 초과 가구)
      const modulesToRemove: string[] = [];
      
      const updatedModules = state.placedModules.map(module => {
        // baseModuleType이 있으면 사용, 없으면 moduleId에서 추출
        const baseType = module.baseModuleType || module.moduleId?.replace(/-\d+$/, '');
        
        // 모든 동적 가구의 moduleId 업데이트 (상부장/하부장 뿐만 아니라 모든 가구)
        if (baseType && module.moduleId) {
          // zone별로 다른 컬럼 너비 계산
          let targetColumnWidth = newColumnWidth;
          
          if (module.zone && spaceInfo.droppedCeiling?.enabled) {
            const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
            if (module.zone === 'dropped' && zoneInfo.dropped) {
              targetColumnWidth = zoneInfo.dropped.columnWidth;
            } else if (module.zone === 'normal' && zoneInfo.normal) {
              targetColumnWidth = zoneInfo.normal.columnWidth;
            }
          }
          
          // 듀얼 가구인지 확인
          const isDualFurniture = baseType.includes('dual-');
          
          // 새로운 너비로 ID 재생성
          const newModuleId = isDualFurniture 
            ? `${baseType}-${Math.round(targetColumnWidth * 2)}`  // 듀얼은 2배 너비
            : `${baseType}-${Math.round(targetColumnWidth)}`;
          
          // moduleId가 변경되는 경우에만 로그
          if (newModuleId !== module.moduleId) {
            console.log('📦 가구 moduleId 업데이트:', {
              baseType,
              oldId: module.moduleId,
              newId: newModuleId,
              zone: module.zone,
              targetColumnWidth,
              isDualFurniture
            });
          }
          
          // moduleId와 moduleWidth 업데이트
          module = {
            ...module,
            moduleId: newModuleId,
            moduleWidth: isDualFurniture ? targetColumnWidth * 2 : targetColumnWidth  // 듀얼은 2배 너비
          };
        }
        
        if (module.slotIndex === undefined) return module;
        
        // zone별 컬럼 수 계산
        let maxSlotIndex = totalColumnCount - 1;
        if (module.zone && spaceInfo.droppedCeiling?.enabled) {
          // 단내림이 활성화된 경우 zone별로 체크
          if (module.zone === 'dropped') {
            maxSlotIndex = (spaceInfo.droppedCeilingDoorCount || 1) - 1;
          } else {
            maxSlotIndex = (spaceInfo.mainDoorCount || spaceInfo.customColumnCount || 3) - 1;
          }
        }
        
        // 컬럼 수를 초과하는 가구는 제거 대상
        if (module.slotIndex > maxSlotIndex) {
          console.log(`🚫 가구 ${module.id} 제거 예정 - 컬럼 수 초과 (슬롯 ${module.slotIndex} > 최대 ${maxSlotIndex})`);
          if (!modulesToRemove.includes(module.id)) {
            modulesToRemove.push(module.id);
          }
          return module; // 일단 그대로 반환 (나중에 필터링)
        }
        
        // 듀얼 가구인 경우 두 번째 슬롯도 체크
        const isDualFurniture = module.isDualSlot || module.moduleId?.includes('dual-');
        if (isDualFurniture && module.slotIndex + 1 > maxSlotIndex) {
          console.log(`🚫 듀얼 가구 ${module.id} 제거 예정 - 두 번째 슬롯이 컬럼 수 초과`);
          if (!modulesToRemove.includes(module.id)) {
            modulesToRemove.push(module.id);
          }
          return module; // 일단 그대로 반환 (나중에 필터링)
        }
        
        // zone이 있는 경우 글로벌 슬롯 인덱스로 변환
        let globalSlotIndex = module.slotIndex;
        if (module.zone && spaceInfo.droppedCeiling?.enabled) {
          const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
          if (module.zone === 'dropped' && zoneInfo.dropped) {
            globalSlotIndex = zoneInfo.normal.columnCount + module.slotIndex;
          }
        }
        
        // 슬롯 정보가 없는 경우 (컬럼 수가 줄어서 슬롯이 없어진 경우)
        const slotInfo = columnSlots[globalSlotIndex];
        if (!slotInfo) {
          console.log(`🚫 가구 ${module.id} 제거 예정 - 슬롯 정보 없음 (globalSlotIndex: ${globalSlotIndex})`);
          if (!modulesToRemove.includes(module.id)) {
            modulesToRemove.push(module.id);
          }
          return module;
        }
        
        // 듀얼 가구인 경우 두 번째 슬롯도 확인 (이미 위에서 선언했으므로 재사용)
        let secondSlotInfo = null;
        if (isDualFurniture) {
          secondSlotInfo = columnSlots[globalSlotIndex + 1];
          // 두 번째 슬롯이 없는 경우 듀얼 가구 제거
          if (!secondSlotInfo) {
            console.log(`🚫 듀얼 가구 ${module.id} 제거 예정 - 두 번째 슬롯 없음`);
            if (!modulesToRemove.includes(module.id)) {
              modulesToRemove.push(module.id);
            }
            return module;
          }
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
          if (!modulesToRemove.includes(module.id)) {
            modulesToRemove.push(module.id);
          }
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
          } else if (module.slotIndex !== undefined && indexing.threeUnitPositions && indexing.threeUnitPositions[module.slotIndex] !== undefined) {
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
          const furnitureBounds = slotInfo ? calculateFurnitureBounds(slotInfo, originalSlotBounds, spaceInfo) : originalSlotBounds;
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
            } else if (module.slotIndex !== undefined && indexing.threeUnitPositions && indexing.threeUnitPositions[module.slotIndex] !== undefined) {
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
      
      // 제거된 가구가 있으면 알림
      if (modulesToRemove.length > 0) {
        console.log(`⚠️ ${modulesToRemove.length}개의 가구가 제거되었습니다:`, {
          removedModules: modulesToRemove,
          reasons: '컬럼 수 초과 또는 기둥 침범'
        });
      }
      
      return {
        placedModules: filteredModules
      };
    });
  },
  
  // 띄워서 배치 설정 변경 시 가구 Y 위치 업데이트
  updateFurnitureYPositions: (spaceInfo: any) => {
    set((state) => {
      console.log('📍 updateFurnitureYPositions 호출:', {
        placementType: spaceInfo.baseConfig?.placementType,
        floatHeight: spaceInfo.baseConfig?.floatHeight,
        furnitureCount: state.placedModules.length
      });
      
      // 각 가구의 Y 위치는 FurnitureItem 컴포넌트에서 자동 계산되므로
      // 여기서는 강제 리렌더링을 위해 타임스탬프를 추가
      const updatedModules = state.placedModules.map(module => ({
        ...module,
        _lastYUpdate: Date.now() // 리렌더링 트리거용
      }));
      
      console.log('📍 Y 위치 업데이트 완료 - 가구 리렌더링 트리거');
      
      return {
        placedModules: updatedModules
      };
    });
  }
}));

// Development mode에서 디버깅을 위해 store를 window에 노출
if (process.env.NODE_ENV === 'development') {
  (window as any).__furnitureStore = useFurnitureStore;
}

export default useFurnitureStore; 