import { create } from 'zustand';
import { PlacedModule, CurrentDragData, CustomFurnitureConfig } from '@/editor/shared/furniture/types';
import { analyzeColumnSlots } from '@/editor/shared/utils/columnSlotProcessor';
import { ColumnIndexer, calculateSpaceIndexing, recalculateWithCustomWidths } from '@/editor/shared/utils/indexing';
import { getModuleById } from '@/data/modules';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import { useSpaceConfigStore } from './spaceConfigStore';

// 가구 데이터 Store 상태 타입 정의
interface FurnitureDataState {
  // 가구 데이터 상태
  placedModules: PlacedModule[];
  hasUnsavedChanges?: boolean;

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

  // 슬롯 모드 가구 너비 조정 → 나머지 슬롯 재분할
  adjustSlotWidth: (moduleId: string, newWidth: number) => void;

  // wallConfig/frameSize 변경 시 가구 너비 재계산
  resetFurnitureWidths: () => void;

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

  // 패널 결 방향 초기화 (측판/백패널/도어를 기본값으로 리셋)
  resetPanelGrainDirections: () => void;

  // 레이아웃 빌더 팝업에서 확인한 커스텀 설정 (배치 전 임시 저장)
  pendingCustomConfig: CustomFurnitureConfig | null;
  setPendingCustomConfig: (config: CustomFurnitureConfig | null) => void;

  // 방금 새로 생성된 커스텀 가구 ID (취소 시 삭제 목적)
  newlyPlacedCustomModuleId: string | null;
  setNewlyPlacedCustomModuleId: (id: string | null) => void;

  // 커스터마이징 가구 마지막 치수 기억 (타입별 독립 추적)
  lastCustomDimensions: Record<string, { width: number; height: number; depth: number }>;
  setLastCustomDimensions: (key: string, dims: { width: number; height: number; depth: number }) => void;

  // 서라운드 패널 배치 시 사용할 폭 (mm)
  surroundPanelWidths: { left: number; right: number; top: number };
  setSurroundPanelWidth: (type: 'left' | 'right' | 'top', width: number) => void;

  // 저장 상태 관리
  markAsSaved: () => void;
  resetAll: () => void;
}

// R3F ConcurrentRoot + Zustand v5 useSyncExternalStore 호환성 workaround:
// react-reconciler의 ConcurrentRoot에서 첫 번째 store 업데이트의 re-render가 누락되는 문제 해결
// set() 후 setTimeout으로 동일 데이터를 새 참조로 재전송하여 R3F reconciler가 확실히 처리하도록 함
// R3F ConcurrentRoot + Zustand v5 호환성 workaround 헬퍼
// (아래 store 생성 후 storeRef에 할당됨)
let storeRef: typeof useFurnitureStore | null = null;
let notifyR3FTimer: ReturnType<typeof setTimeout> | null = null;
const notifyR3F = (modules: PlacedModule[]) => {
  // 이전 타이머를 취소하여 최신 상태만 R3F에 전달 (race condition 방지)
  if (notifyR3FTimer) clearTimeout(notifyR3FTimer);
  // 50ms → 0ms: 팝업이 열린 상태에서 즉시 반영되도록 지연 제거
  // (50ms였던 이유는 race condition 방지였으나, clearTimeout으로 이미 해결됨)
  notifyR3FTimer = setTimeout(() => {
    notifyR3FTimer = null;
    storeRef?.setState({ placedModules: [...modules] });
  }, 0);
};

/**
 * 가구 배치 후 인접 키큰장(full)의 EP를 자동 체크하는 헬퍼.
 * - 새 가구가 upper/lower면 → 인접 full의 해당 방향 EP 체크
 * - 새 가구가 full이면 → 인접 upper/lower가 있는 방향 EP 체크
 */
const autoSetAdjacentFullEP = (newModule: PlacedModule) => {
  const spaceInfo = useSpaceConfigStore.getState().spaceInfo;
  const internalSpace = calculateInternalSpace(spaceInfo);
  const newModuleData = getModuleById(newModule.moduleId, internalSpace, spaceInfo);
  if (!newModuleData) return;

  const allModules = useFurnitureStore.getState().placedModules;
  const newCategory = newModuleData.category;
  const newSlotIndex = newModule.slotIndex;
  if (newSlotIndex === undefined) return;

  const isNewDual = newModule.moduleId?.includes('dual-') || newModule.isDualSlot;

  // 인접 모듈 찾기 (같은 zone)
  const findAdjacentModule = (targetSlotIndex: number) =>
    allModules.find(m =>
      m.id !== newModule.id &&
      m.zone === newModule.zone &&
      (m.slotIndex === targetSlotIndex ||
        ((m.moduleId?.includes('dual-') || m.isDualSlot) && m.slotIndex === targetSlotIndex - 1))
    );

  // Case 1: 새 가구가 upper/lower → 인접 full 키큰장의 EP 체크
  if (newCategory === 'upper' || newCategory === 'lower') {
    // 왼쪽 인접 모듈
    const leftModule = findAdjacentModule(newSlotIndex - 1);
    if (leftModule) {
      const leftData = getModuleById(leftModule.moduleId, internalSpace, spaceInfo);
      if (leftData?.category === 'full' && !leftModule.hasRightEndPanel) {
        useFurnitureStore.getState().updatePlacedModule(leftModule.id, { hasRightEndPanel: true });
      }
    }

    // 오른쪽 인접 모듈
    const rightSlot = isNewDual ? newSlotIndex + 2 : newSlotIndex + 1;
    const rightModule = findAdjacentModule(rightSlot);
    if (rightModule) {
      const rightData = getModuleById(rightModule.moduleId, internalSpace, spaceInfo);
      if (rightData?.category === 'full' && !rightModule.hasLeftEndPanel) {
        useFurnitureStore.getState().updatePlacedModule(rightModule.id, { hasLeftEndPanel: true });
      }
    }
  }

  // Case 2: 새 가구가 full → 인접 upper/lower가 있으면 자기 EP 체크
  if (newCategory === 'full') {
    const updates: Partial<PlacedModule> = {};

    // 왼쪽 인접 모듈
    const leftModule = findAdjacentModule(newSlotIndex - 1);
    if (leftModule) {
      const leftData = getModuleById(leftModule.moduleId, internalSpace, spaceInfo);
      if (leftData?.category === 'upper' || leftData?.category === 'lower') {
        updates.hasLeftEndPanel = true;
      }
    }

    // 오른쪽 인접 모듈
    const rightSlot = isNewDual ? newSlotIndex + 2 : newSlotIndex + 1;
    const rightModule = findAdjacentModule(rightSlot);
    if (rightModule) {
      const rightData = getModuleById(rightModule.moduleId, internalSpace, spaceInfo);
      if (rightData?.category === 'upper' || rightData?.category === 'lower') {
        updates.hasRightEndPanel = true;
      }
    }

    if (Object.keys(updates).length > 0) {
      useFurnitureStore.getState().updatePlacedModule(newModule.id, updates);
    }
  }
};

/**
 * 가구 삭제 시 인접 키큰장(full)의 EP를 해제하는 헬퍼.
 * 삭제되는 가구가 upper/lower이고, 같은 슬롯에 다른 upper/lower가 남아있지 않으면 EP 해제.
 */
const autoClearAdjacentFullEP = (removedModule: PlacedModule) => {
  const spaceInfo = useSpaceConfigStore.getState().spaceInfo;
  const internalSpace = calculateInternalSpace(spaceInfo);
  const removedData = getModuleById(removedModule.moduleId, internalSpace, spaceInfo);
  if (!removedData) return;

  const removedCategory = removedData.category;
  if (removedCategory !== 'upper' && removedCategory !== 'lower') return;

  const allModules = useFurnitureStore.getState().placedModules;
  const slotIndex = removedModule.slotIndex;
  if (slotIndex === undefined) return;

  const isRemovedDual = removedModule.moduleId?.includes('dual-') || removedModule.isDualSlot;

  // 같은 슬롯에 다른 upper/lower가 남아있는지 체크
  const remainingUpperLower = allModules.find(m =>
    m.id !== removedModule.id &&
    m.zone === removedModule.zone &&
    m.slotIndex === slotIndex &&
    (() => {
      const d = getModuleById(m.moduleId, internalSpace, spaceInfo);
      return d?.category === 'upper' || d?.category === 'lower';
    })()
  );

  // 아직 상부장/하부장이 남아있으면 EP 유지
  if (remainingUpperLower) return;

  // 인접 모듈 찾기
  const findAdjacentFull = (targetSlotIndex: number) =>
    allModules.find(m =>
      m.id !== removedModule.id &&
      m.zone === removedModule.zone &&
      (() => {
        const d = getModuleById(m.moduleId, internalSpace, spaceInfo);
        if (d?.category !== 'full') return false;
        const mDual = m.moduleId?.includes('dual-') || m.isDualSlot;
        const mSlots = mDual ? [m.slotIndex, m.slotIndex + 1] : [m.slotIndex];
        return mSlots.includes(targetSlotIndex);
      })()
    );

  // 왼쪽 인접 키큰장 → 우측 EP 해제
  const leftFull = findAdjacentFull(slotIndex - 1);
  if (leftFull?.hasRightEndPanel) {
    useFurnitureStore.getState().updatePlacedModule(leftFull.id, { hasRightEndPanel: false, endPanelThickness: 18 });
  }

  // 오른쪽 인접 키큰장 → 좌측 EP 해제
  const rightSlot = isRemovedDual ? slotIndex + 2 : slotIndex + 1;
  const rightFull = findAdjacentFull(rightSlot);
  if (rightFull?.hasLeftEndPanel) {
    useFurnitureStore.getState().updatePlacedModule(rightFull.id, { hasLeftEndPanel: false, endPanelThickness: 18 });
  }
};

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

  // 레이아웃 빌더 pending 상태
  pendingCustomConfig: null,
  setPendingCustomConfig: (config) => set({ pendingCustomConfig: config }),

  // 방금 새로 생성된 커스텀 가구 ID
  newlyPlacedCustomModuleId: null,
  setNewlyPlacedCustomModuleId: (id) => set({ newlyPlacedCustomModuleId: id }),

  // 커스터마이징 가구 마지막 치수 기억
  lastCustomDimensions: {},
  setLastCustomDimensions: (key, dims) => set((state) => ({
    lastCustomDimensions: { ...state.lastCustomDimensions, [key]: dims }
  })),

  // 서라운드 패널 폭 기본값
  surroundPanelWidths: { left: 40, right: 40, top: 18 },
  setSurroundPanelWidth: (type, width) => set((state) => ({
    surroundPanelWidths: { ...state.surroundPanelWidths, [type]: width }
  })),

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

      // 아일랜드 모드: islandSide 미지정이면 현재 활성 면으로 자동 태깅
      if (spaceInfo.isIsland && !module.islandSide) {
        try {
          const { useUIStore } = require('@/store/uiStore');
          module.islandSide = useUIStore.getState().activeIslandSide || 'front';
        } catch {
          module.islandSide = 'front';
        }
      }

      // 카테고리별 기본 깊이 (customDepth 미설정 시)
      // - 상부장: 300mm (먼저 검사 — upper-cabinet-shelf 등 shelf 포함 ID 구분)
      // - 신발장: 380mm
      try {
        const mid = module.moduleId || '';
        const isUpperCabinet = mid.includes('upper-cabinet');
        const isShoeCabinet = !isUpperCabinet && (
          mid.includes('-entryway-') ||
          mid.includes('-shelf-') ||
          mid.includes('-4drawer-shelf-') ||
          mid.includes('-2drawer-shelf-')
        );
        if (module.customDepth === undefined || module.customDepth === null) {
          if (isUpperCabinet) {
            module.customDepth = Math.min(300, spaceInfo.depth || 600);
          } else if (isShoeCabinet) {
            module.customDepth = Math.min(380, spaceInfo.depth || 600);
          }
        }
      } catch {}

      // 뒷벽 이격: 기본값 0 (뒷벽 붙음). 사용자가 팝업에서 수동 입력하면 앞으로 이동.
      if (module.backWallGap === undefined) {
        module.backWallGap = 0;
      }

      // 도어 설치 토글 상태를 신규 가구에 자동 반영
      let intent = false;
      let doorsOpen: boolean | null = null;
      try {
        const uiModule = require('@/store/uiStore');
        const uiState = uiModule.useUIStore.getState();
        intent = !!uiState.doorInstallIntent;
        doorsOpen = uiState.doorsOpen;
      } catch {}
      // window 글로벌 fallback
      if (typeof window !== 'undefined' && (window as any).__doorInstallIntent === true) {
        intent = true;
      }
      const anyOtherHasDoor = state.placedModules.some((m: any) => m.hasDoor === true);
      if (intent === true || doorsOpen === true || anyOtherHasDoor) {
        module.hasDoor = true;
      }
      // intent 동기화
      if (module.hasDoor === true && typeof window !== 'undefined') {
        (window as any).__doorInstallIntent = true;
      }
      // 디버그: 실제 적용 값 확인
      // eslint-disable-next-line no-console
      console.log('[addModule hasDoor]', { moduleId: module.moduleId, intent, doorsOpen, anyOtherHasDoor, final: module.hasDoor });

      // 도어 바닥 이격거리 초기화 (카테고리별 기본값)
      const isBasicLowerCabinet = module.moduleId?.includes('lower-half-cabinet') || module.moduleId?.includes('dual-lower-half-cabinet') || module.moduleId?.includes('lower-drawer-') || module.moduleId?.includes('dual-lower-drawer-') || module.moduleId?.includes('lower-sink-cabinet') || module.moduleId?.includes('dual-lower-sink-cabinet') || module.moduleId?.includes('lower-induction-cabinet') || module.moduleId?.includes('dual-lower-induction-cabinet');
      const isDoorLift = module.moduleId?.includes('lower-door-lift-');
      const isTopDown = module.moduleId?.includes('lower-top-down-');
      if (module.doorBottomGap === undefined) {
        if (newCategory === 'upper') {
          // 상부장: 캐비넷 하단에서 도어 하단까지의 확장거리 (바닥 기준이 아님)
          module.doorBottomGap = 28;
        } else if (isBasicLowerCabinet || isDoorLift || isTopDown) {
          // 기본하부장/서랍장/도어올림/상판내림: 하단 5mm 확장
          module.doorBottomGap = 5;
        } else if (newCategory === 'lower') {
          // 기타 하부장: 캐비넷 하단에서 2mm 아래로 확장
          module.doorBottomGap = 2;
        } else {
          const isFloatPlacement = spaceInfo.baseConfig?.placementType === 'float';
          const floatHeight = spaceInfo.baseConfig?.floatHeight || 200;
          module.doorBottomGap = isFloatPlacement ? floatHeight : 25;
        }
      }

      // 도어 상단 이격거리 초기화 (카테고리별 기본값)
      if (module.doorTopGap === undefined) {
        if (isTopDown) {
          // 상판내림: 상단 -80mm
          module.doorTopGap = -80;
        } else if (isDoorLift) {
          // 도어올림: 상단 30mm (마이다가 위로 올라감)
          module.doorTopGap = 30;
        } else if (isBasicLowerCabinet) {
          // 기본하부장 반통/한통/서랍장: 상단 -20mm (도어가 캐비넷보다 20mm 짧음)
          module.doorTopGap = -20;
        } else if (newCategory === 'lower') {
          // 기타 하부장: 캐비넷 상단에서 20mm 내려옴
          module.doorTopGap = 20;
        } else {
          const isFullSurround = spaceInfo.surroundType === 'surround' && spaceInfo.frameConfig?.top !== false;
          const topFrameMm = spaceInfo.frameSize?.top || 30;
          module.doorTopGap = isFullSurround ? (topFrameMm + 3) : 5;
        }
      }

      // 상부장 상판 따내기 기본값: 없음 (필요시 수동 설정)
      // topPanelNotchSize, topPanelNotchSide는 undefined → 따내기 없음

      // 하부프레임 기본값: 하부장 100mm, 키큰장 60mm
      const isLowerById = module.moduleId?.startsWith('lower-') || module.moduleId?.includes('dual-lower-');
      if (module.baseFrameHeight === undefined) {
        if (newCategory === 'lower' || isLowerById) {
          module.baseFrameHeight = 100;
        } else if (newCategory === 'full') {
          module.baseFrameHeight = 60;
        }
      }


      // 2단 가구인 경우 섹션 깊이 초기화
      const sections = newModuleData?.modelConfig?.sections;
      if (sections && sections.length === 2) {
        const defaultDepth = newModuleData.dimensions.depth;

        // 섹션 깊이가 설정되지 않은 경우 기본값으로 초기화
        if (module.lowerSectionDepth === undefined) {
          module.lowerSectionDepth = defaultDepth;
        }
        if (module.upperSectionDepth === undefined) {
          module.upperSectionDepth = defaultDepth;
        }
      }

      // 자유배치 가구는 슬롯 충돌 체크 불필요 (X 좌표 기반 충돌 검사는 배치 시점에 이미 완료됨)
      if (module.isFreePlacement) {
        const newModules = [...state.placedModules, module];
        notifyR3F(newModules);
        return {
          placedModules: newModules
        };
      }

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

          const newModules = [
            ...state.placedModules.filter(m => !replaceIds.includes(m.id)),
            module
          ];
          notifyR3F(newModules);
          return {
            placedModules: newModules
          };
        }

        // 모든 기존 가구와 공존 가능하면 추가
        const newModules2 = [...state.placedModules, module];
        notifyR3F(newModules2);
        return {
          placedModules: newModules2
        };
      }

      const newModules3 = [...state.placedModules, module];
      notifyR3F(newModules3);
      return {
        placedModules: newModules3
      };
    });

    // 배치 후 인접 키큰장 EP 자동 체크
    autoSetAdjacentFullEP(module);
  },

  // 모듈 제거 함수 (기존 Context 로직과 동일)
  removeModule: (id: string) => {
    const state = get();
    const module = state.placedModules.find(m => m.id === id);

    // 삭제되는 가구의 잠긴 이격을 공간 레벨로 이관
    if (module?.isFreePlacement) {
      const { setLockedWallGap } = useSpaceConfigStore.getState();
      if (module.freeLeftGapLocked && module.freeLeftGap != null) {
        setLockedWallGap('left', module.freeLeftGap);
      }
      if (module.freeRightGapLocked && module.freeRightGap != null) {
        setLockedWallGap('right', module.freeRightGap);
      }
    }

    // 그룹 모듈 (예: 듀얼 빌트인 냉장고장 세트): 같은 groupId 가진 모든 모듈 함께 삭제
    const groupId = module?.groupId;
    set((state) => ({
      placedModules: state.placedModules.filter(m =>
        m.id !== id && (!groupId || m.groupId !== groupId)
      )
    }));

    // 삭제 후 인접 키큰장 EP 해제 (비동기: 삭제 set과 분리하여 리렌더 충돌 방지)
    if (module) {
      setTimeout(() => autoClearAdjacentFullEP(module), 0);
    }
    // 가구 삭제 시 서라운드도 함께 초기화 + 프레임 병합 해제
    const spaceStore = useSpaceConfigStore.getState();
    spaceStore.setSpaceInfo({ freeSurround: undefined });
    if (spaceStore.spaceInfo.frameMergeEnabled) {
      spaceStore.setSpaceInfo({ frameMergeEnabled: false });
    }
  },

  // 모듈 이동 함수 (기존 Context 로직과 동일)
  moveModule: (id: string, position: { x: number; y: number; z: number }) => {
    // get() + non-callback set() 방식 사용 (R3F Canvas 내부 리렌더 보장)
    const state = get();
    const newModules = state.placedModules.map(module =>
      module.id === id
        ? { ...module, position }
        : module
    );
    set({ placedModules: newModules });
    notifyR3F(newModules);
  },

  // 배치된 모듈 속성 업데이트 함수 (기존 Context 로직과 동일)
  updatePlacedModule: (id: string, updates: Partial<PlacedModule>) => {
    // get() + non-callback set() 방식 사용
    // (callback set()은 R3F Canvas 내부 컴포넌트 re-render를 트리거하지 않는 문제가 있음)
    const state = get();

    // ── 공간 레벨 잠긴 이격 영역 침범 방지 ──
    // position이 변경될 때, 잠긴 이격 영역 안으로 가구가 들어가지 않도록 클램핑
    let finalUpdates = updates;
    const existingModule = state.placedModules.find(m => m.id === id);
    if (existingModule?.isFreePlacement && updates.position) {
      const spaceState = useSpaceConfigStore.getState();
      const lockedWallGaps = spaceState.spaceInfo.lockedWallGaps;

      if (lockedWallGaps?.left != null || lockedWallGaps?.right != null) {
        const totalWidth = spaceState.spaceInfo.width || 2400;
        const halfW = totalWidth / 2;
        const startX = -halfW;
        const endX = halfW;
        const merged = { ...existingModule, ...updates };
        const widthMm = merged.freeWidth || merged.moduleWidth || 450;
        const halfFW = widthMm / 2;
        let posX = (updates.position as any).x as number;

        // 잠긴 영역 경계 계산
        const effectiveStartX = lockedWallGaps?.left != null ? startX + lockedWallGaps.left : startX;
        const effectiveEndX = lockedWallGaps?.right != null ? endX - lockedWallGaps.right : endX;

        // 가구가 잠긴 영역을 침범하면 경계로 밀어냄
        const minPosX = (effectiveStartX + halfFW) * 0.01;
        const maxPosX = (effectiveEndX - halfFW) * 0.01;
        const clampedPosX = Math.max(minPosX, Math.min(maxPosX, posX));

        if (clampedPosX !== posX) {
          finalUpdates = { ...updates, position: { ...(updates.position as any), x: clampedPosX } };
        }
      }
    }

    // 슬롯 변경이 있을 경우 중복 체크 (자유배치 가구는 제외)
    const checkTarget = existingModule || state.placedModules.find(m => m.id === id);
    const oldSlotIndex = checkTarget?.slotIndex;
    const isSlotChanging = (updates.slotIndex !== undefined && updates.slotIndex !== oldSlotIndex) || (updates.zone !== undefined && updates.zone !== checkTarget?.zone);
    if ((updates.slotIndex !== undefined || updates.zone !== undefined) && !checkTarget?.isFreePlacement) {
      const targetModule = checkTarget;
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
                ? { ...module, ...finalUpdates }
                : module
            );
            set({ placedModules: newModules });
            notifyR3F(newModules);
            // 슬롯 변경 시 EP 재계산
            if (isSlotChanging && checkTarget) {
              setTimeout(() => {
                autoClearAdjacentFullEP({ ...checkTarget }); // 이전 위치 EP 해제
                const updated = useFurnitureStore.getState().placedModules.find(m => m.id === id);
                if (updated) autoSetAdjacentFullEP(updated); // 새 위치 EP 설정
              }, 0);
            }
            return;
          }

          // 교체가 필요한 경우
          if (modulesToReplace.length > 0) {
            const replaceIds = modulesToReplace.map(m => m.id);
            const filteredModules = state.placedModules.filter(m => !replaceIds.includes(m.id));
            const newModules = filteredModules.map(module =>
              module.id === id
                ? { ...module, ...finalUpdates }
                : module
            );
            set({ placedModules: newModules });
            notifyR3F(newModules);
            // 슬롯 변경 시 EP 재계산
            if (isSlotChanging && checkTarget) {
              setTimeout(() => {
                autoClearAdjacentFullEP({ ...checkTarget }); // 이전 위치 EP 해제
                const updated = useFurnitureStore.getState().placedModules.find(m => m.id === id);
                if (updated) autoSetAdjacentFullEP(updated); // 새 위치 EP 설정
              }, 0);
            }
            return;
          }
        }
      }
    }

    // 충돌이 없으면 일반 업데이트
    const newModules = state.placedModules.map(module => {
      if (module.id === id) {
        return { ...module, ...finalUpdates };
      }
      return module;
    });

    set({ placedModules: newModules });
    notifyR3F(newModules);

    // 슬롯 변경 시 EP 재계산
    if (isSlotChanging && checkTarget) {
      setTimeout(() => {
        autoClearAdjacentFullEP({ ...checkTarget }); // 이전 위치 EP 해제
        const updated = useFurnitureStore.getState().placedModules.find(m => m.id === id);
        if (updated) autoSetAdjacentFullEP(updated); // 새 위치 EP 설정
      }, 0);
    }
  },

  // 모든 가구 초기화 함수 (기존 Context 로직과 동일)
  clearAllModules: () => {
    set({ placedModules: [] });
    // 가구 전체 삭제 시 서라운드도 함께 초기화
    useSpaceConfigStore.getState().setSpaceInfo({ freeSurround: undefined });
  },

  // 가구 목록 직접 설정 함수 (함수형 업데이트 지원)
  setPlacedModules: (modules: PlacedModule[] | ((prev: PlacedModule[]) => PlacedModule[])) => {
    const state = get();
    const resolved = typeof modules === 'function' ? modules(state.placedModules) : modules;
    // 마이그레이션: 기본하부장/서랍장 도어갭 기본값 업데이트 (옛 기본값 20/2 → 새 기본값 -20/5)
    const newModules = resolved.map(m => {
      const isBasic = m.moduleId?.includes('lower-half-cabinet') || m.moduleId?.includes('dual-lower-half-cabinet') || m.moduleId?.includes('lower-drawer-') || m.moduleId?.includes('dual-lower-drawer-') || m.moduleId?.includes('lower-sink-cabinet') || m.moduleId?.includes('dual-lower-sink-cabinet') || m.moduleId?.includes('lower-induction-cabinet') || m.moduleId?.includes('dual-lower-induction-cabinet');
      if (isBasic) {
        const needsTopFix = m.doorTopGap === 20 || m.doorTopGap === 0;
        const needsBottomFix = m.doorBottomGap === 2 || m.doorBottomGap === 0;
        if (needsTopFix || needsBottomFix) {
          return {
            ...m,
            ...(needsTopFix ? { doorTopGap: -20 } : {}),
            ...(needsBottomFix ? { doorBottomGap: 5 } : {})
          };
        }
      }
      // 도어올림: 옛 기본값(20/2) → 새 기본값(30/5)
      const isDoorLift = m.moduleId?.includes('lower-door-lift-');
      if (isDoorLift) {
        const needsTopFix = m.doorTopGap === 20;
        const needsBottomFix = m.doorBottomGap === 2;
        if (needsTopFix || needsBottomFix) {
          return {
            ...m,
            ...(needsTopFix ? { doorTopGap: 30 } : {}),
            ...(needsBottomFix ? { doorBottomGap: 5 } : {})
          };
        }
      }
      // 상판내림: 옛 기본값(20/2) → 새 기본값(-80/5)
      const isTopDown = m.moduleId?.includes('lower-top-down-');
      if (isTopDown) {
        const needsTopFix = m.doorTopGap === 20;
        const needsBottomFix = m.doorBottomGap === 2;
        if (needsTopFix || needsBottomFix) {
          return {
            ...m,
            ...(needsTopFix ? { doorTopGap: -80 } : {}),
            ...(needsBottomFix ? { doorBottomGap: 5 } : {})
          };
        }
      }
      return m;
    });
    set({ placedModules: newModules });
    notifyR3F(newModules);
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
    const spaceInfo = useSpaceConfigStore.getState().spaceInfo;
    const internalSpace = calculateInternalSpace(spaceInfo);
    const isFloatPlacement = spaceInfo.baseConfig?.placementType === 'float';
    const floatHeight = spaceInfo.baseConfig?.floatHeight || 200;
    const defaultBottomGap = isFloatPlacement ? floatHeight : 25;

    // 전체서라운드: 상부프레임 + 3mm, 그 외: 5mm
    const isFullSurround = spaceInfo.surroundType === 'surround' && spaceInfo.frameConfig?.top !== false;
    const topFrameMm = spaceInfo.frameSize?.top || 30;
    const defaultTopGap = isFullSurround ? (topFrameMm + 3) : 5;

    const currentModules = get().placedModules;
    const updatedModules = currentModules.map(module => {
      // 카테고리별 기본 도어 갭 결정
      const moduleData = getModuleById(module.moduleId, internalSpace, spaceInfo);
      const category = moduleData?.category;

      let topGap = defaultTopGap;
      let bottomGap = defaultBottomGap;
      const isBasicLower = module.moduleId?.includes('lower-half-cabinet') || module.moduleId?.includes('dual-lower-half-cabinet') || module.moduleId?.includes('lower-drawer-') || module.moduleId?.includes('dual-lower-drawer-') || module.moduleId?.includes('lower-sink-cabinet') || module.moduleId?.includes('dual-lower-sink-cabinet') || module.moduleId?.includes('lower-induction-cabinet') || module.moduleId?.includes('dual-lower-induction-cabinet');
      const isDoorLift = module.moduleId?.includes('lower-door-lift-');
      const isTopDown = module.moduleId?.includes('lower-top-down-');
      if (isTopDown) {
        topGap = -80;   // 상판내림: 상단 -80mm
        bottomGap = 5;  // 상판내림: 하단 5mm
      } else if (isDoorLift) {
        topGap = 30;    // 도어올림: 상단 30mm
        bottomGap = 5;  // 도어올림: 하단 5mm
      } else if (isBasicLower) {
        topGap = -20;   // 기본하부장: 도어 상단 -20mm (캐비넷보다 짧음)
        bottomGap = 5;  // 기본하부장: 도어 하단 5mm 확장
      } else if (category === 'lower') {
        topGap = 20;    // 기타 하부장: LOWER_DOOR_TOP_GAP
        bottomGap = 2;  // 기타 하부장: LOWER_DOOR_BOTTOM_EXTENSION
      } else if (category === 'upper') {
        bottomGap = 28; // 상부장 기본값
      }
      return {
        ...module,
        hasDoor,
        ...(hasDoor && {
          doorTopGap: module.doorTopGap ?? topGap,
          doorBottomGap: module.doorBottomGap ?? bottomGap
        })
      };
    });

    set({ placedModules: updatedModules });
    notifyR3F(updatedModules);
  },

  // 기둥 변경 시 가구 adjustedWidth 업데이트
  updateFurnitureForColumns: (spaceInfo: any) => {
    set((state) => {
      const columnSlots = analyzeColumnSlots(spaceInfo);

      const updatedModules = state.placedModules.flatMap(module => {
        if (module.slotIndex === undefined) return [module];

        // zone이 있는 경우 글로벌 슬롯 인덱스로 변환
        let globalSlotIndex = module.slotIndex;
        if (module.zone && spaceInfo.droppedCeiling?.enabled) {
          const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
          if (module.zone === 'dropped' && zoneInfo.dropped) {
            globalSlotIndex = zoneInfo.normal.columnCount + module.slotIndex;
          }
        }

        const slotInfo = columnSlots[globalSlotIndex];
        // 기둥이 있는 슬롯 → adjustedWidth 설정 (가구가 기둥 회피하여 폭 축소)
        if (slotInfo?.hasColumn) {
          const rawWidth = slotInfo.adjustedWidth || slotInfo.availableWidth;
          const newAdjustedWidth = Math.round(rawWidth * 100) / 100;
          return [{
            ...module,
            adjustedWidth: newAdjustedWidth
          }];
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

            return [{
              ...module,
              adjustedWidth: undefined,
              position: {
                ...module.position,
                x: originalX
              }
            }];
          }
          return [{
            ...module,
            adjustedWidth: undefined
          }];
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
  },

  // 전체 상태 초기화
  resetAll: () => {
    set({ placedModules: [], hasUnsavedChanges: false });
  },

  // 슬롯 모드 가구 너비 조정 → 나머지 슬롯 재분할
  adjustSlotWidth: (moduleId: string, newWidth: number) => {
    set((state) => {
      const spaceInfo = useSpaceConfigStore.getState().spaceInfo;
      const baseIndexing = calculateSpaceIndexing(spaceInfo);

      // 1. 대상 모듈의 slotCustomWidth 설정
      let updatedModules = state.placedModules.map(m =>
        m.id === moduleId ? { ...m, slotCustomWidth: newWidth } : { ...m }
      );

      const target = updatedModules.find(m => m.id === moduleId);
      if (!target || target.slotIndex === undefined) return { placedModules: updatedModules };

      const targetZone = target.zone || 'normal';

      // 2. recalculateWithCustomWidths로 슬롯 재분할
      const recalculated = recalculateWithCustomWidths(baseIndexing, updatedModules, targetZone);
      const columnCount = recalculated.columnCount;

      // 3. 같은 zone 내 모든 모듈의 position.x / moduleWidth 업데이트
      updatedModules = updatedModules.map(m => {
        const mZone = m.zone || 'normal';
        if (mZone !== targetZone) return m;
        if (m.slotIndex === undefined) return m;

        const updated = { ...m };
        const slotIdx = updated.slotIndex!;

        if (updated.isDualSlot && slotIdx < columnCount - 1) {
          // 듀얼: 두 슬롯 경계 중심
          const newX = recalculated.threeUnitDualPositions[slotIdx];
          if (newX !== undefined) {
            updated.position = { ...updated.position, x: newX };
          }
          // 듀얼 너비: 두 슬롯 합
          const w1 = recalculated.slotWidths?.[slotIdx] ?? recalculated.columnWidth;
          const w2 = recalculated.slotWidths?.[slotIdx + 1] ?? recalculated.columnWidth;
          const dualW = w1 + w2;

          if (updated.slotCustomWidth !== undefined) {
            // slotCustomWidth가 있는 모듈 → customWidth도 동기화
            updated.customWidth = updated.slotCustomWidth;
            updated.moduleWidth = updated.slotCustomWidth;
          } else {
            updated.customWidth = Math.floor(dualW);
            updated.moduleWidth = Math.floor(dualW);
          }
        } else {
          // 싱글: 슬롯 중심
          const newX = recalculated.threeUnitPositions[slotIdx];
          if (newX !== undefined) {
            // 확장 방향 규칙: 좌측 가구 → 좌변boundary 고정, 우측 가구 → 우변boundary 고정
            if (updated.slotCustomWidth !== undefined) {
              const isLeftSide = slotIdx < columnCount / 2;
              const slotW = updated.slotCustomWidth;
              if (isLeftSide) {
                // 좌측 고정: boundary 좌변 기준
                const leftBound = recalculated.columnBoundaries[slotIdx];
                updated.position = { ...updated.position, x: (leftBound + slotW / 2) * 0.01 };
              } else {
                // 우측 고정: boundary 우변 기준
                const rightBound = recalculated.columnBoundaries[slotIdx + 1];
                updated.position = { ...updated.position, x: (rightBound - slotW / 2) * 0.01 };
              }
              updated.customWidth = updated.slotCustomWidth;
              updated.moduleWidth = updated.slotCustomWidth;
            } else {
              // slotCustomWidth가 없는 모듈: 슬롯 중심으로 이동
              updated.position = { ...updated.position, x: newX };
              const slotW = recalculated.slotWidths?.[slotIdx] ?? recalculated.columnWidth;
              updated.customWidth = Math.floor(slotW);
              updated.moduleWidth = Math.floor(slotW);
            }
          }
        }

        return updated;
      });

      return { placedModules: updatedModules, hasUnsavedChanges: true };
    });

    // R3F 동기화
    const modules = useFurnitureStore.getState().placedModules;
    notifyR3F(modules);
  },

  // wallConfig/frameSize 변경 시 가구 너비 재계산
  resetFurnitureWidths: () => {
    set((state) => {
      const updatedModules = state.placedModules.map(module => {
        const updated = { ...module };

        if (module.customWidth !== undefined) {
          delete updated.customWidth;
        }

        if (module.adjustedWidth !== undefined) {
          delete updated.adjustedWidth;
        }

        if (module.slotCustomWidth !== undefined) {
          delete updated.slotCustomWidth;
        }

        return updated;
      });

      return {
        placedModules: updatedModules
      };
    });
  },

  // 패널 결 방향 초기화 (측판/백패널/도어를 기본값으로 리셋)
  resetPanelGrainDirections: () => {
    set((state) => {
      const updatedModules = state.placedModules.map(module => {
        if (!module.panelGrainDirections) {
          return module;
        }

        // 측판, 백패널, 도어 관련 키들을 제거
        const newDirections = { ...module.panelGrainDirections };
        Object.keys(newDirections).forEach(key => {
          const lowerKey = key.toLowerCase();
          if (lowerKey.includes('측판') ||
            lowerKey.includes('side') ||
            lowerKey.includes('백패널') ||
            lowerKey.includes('back') ||
            lowerKey.includes('뒷판') ||
            lowerKey.includes('도어') ||
            lowerKey.includes('door')) {
            delete newDirections[key];
          }
        });

        return {
          ...module,
          panelGrainDirections: Object.keys(newDirections).length > 0 ? newDirections : undefined
        };
      });

      return {
        placedModules: updatedModules
      };
    });
  }
}));

// R3F 호환성 workaround: store 참조 설정
storeRef = useFurnitureStore;

// 기본하부장 도어갭 마이그레이션: placedModules가 변경될 때마다
// 옛 기본값(doorTopGap=20, doorBottomGap=2) → 새 기본값(-20, 5)으로 자동 교체
// Zustand v5: subscribe는 (state) => void 시그니처만 지원
let migrationRunning = false;
let prevModulesRef = useFurnitureStore.getState().placedModules;
useFurnitureStore.subscribe((state) => {
  if (migrationRunning || state.placedModules === prevModulesRef) {
    prevModulesRef = state.placedModules;
    return;
  }
  prevModulesRef = state.placedModules;
  let needsMigration = false;
  for (const m of state.placedModules) {
    const isBasic = m.moduleId?.includes('lower-half-cabinet') || m.moduleId?.includes('dual-lower-half-cabinet') || m.moduleId?.includes('lower-drawer-') || m.moduleId?.includes('dual-lower-drawer-') || m.moduleId?.includes('lower-sink-cabinet') || m.moduleId?.includes('dual-lower-sink-cabinet') || m.moduleId?.includes('lower-induction-cabinet') || m.moduleId?.includes('dual-lower-induction-cabinet');
    const isDoorLift = m.moduleId?.includes('lower-door-lift-');
    const isTopDown = m.moduleId?.includes('lower-top-down-');
    if ((isBasic || isDoorLift || isTopDown) && (m.doorTopGap === 20 || m.doorTopGap === 0 || m.doorBottomGap === 2 || m.doorBottomGap === 0)) {
      needsMigration = true;
      break;
    }
    // 상부장 doorTopGap 이상치 수정 (이전 버그로 ~1700 등 큰 값이 저장된 경우)
    const isUpper = m.moduleId?.includes('upper-cabinet');
    if (isUpper && m.doorTopGap !== undefined && m.doorTopGap > 100) {
      needsMigration = true;
      break;
    }
  }
  if (!needsMigration) return;
  migrationRunning = true;
  const spInfo = useSpaceConfigStore.getState().spaceInfo;
  const migrated = state.placedModules.map(m => {
    // 상부장 doorTopGap 이상치 수정
    const isUpper = m.moduleId?.includes('upper-cabinet');
    if (isUpper && m.doorTopGap !== undefined && m.doorTopGap > 100) {
      const isFullSurround = spInfo.surroundType === 'surround' && spInfo.frameConfig?.top !== false;
      const topFrameMm = m.topFrameThickness ?? spInfo.frameSize?.top ?? 30;
      const correctGap = isFullSurround ? (topFrameMm + 3) : 5;
      return { ...m, doorTopGap: correctGap };
    }
    const isBasic = m.moduleId?.includes('lower-half-cabinet') || m.moduleId?.includes('dual-lower-half-cabinet') || m.moduleId?.includes('lower-drawer-') || m.moduleId?.includes('dual-lower-drawer-') || m.moduleId?.includes('lower-sink-cabinet') || m.moduleId?.includes('dual-lower-sink-cabinet') || m.moduleId?.includes('lower-induction-cabinet') || m.moduleId?.includes('dual-lower-induction-cabinet');
    const isDoorLift = m.moduleId?.includes('lower-door-lift-');
    const isTopDown = m.moduleId?.includes('lower-top-down-');
    if (isBasic) {
      const fixTop = m.doorTopGap === 20 || m.doorTopGap === 0;
      const fixBot = m.doorBottomGap === 2 || m.doorBottomGap === 0;
      if (!fixTop && !fixBot) return m;
      return { ...m, ...(fixTop ? { doorTopGap: -20 } : {}), ...(fixBot ? { doorBottomGap: 5 } : {}) };
    }
    if (isDoorLift) {
      const fixTop = m.doorTopGap === 20 || m.doorTopGap === 0;
      const fixBot = m.doorBottomGap === 2 || m.doorBottomGap === 0;
      if (!fixTop && !fixBot) return m;
      return { ...m, ...(fixTop ? { doorTopGap: 30 } : {}), ...(fixBot ? { doorBottomGap: 5 } : {}) };
    }
    if (isTopDown) {
      const fixTop = m.doorTopGap === 20 || m.doorTopGap === 0;
      const fixBot = m.doorBottomGap === 2 || m.doorBottomGap === 0;
      if (!fixTop && !fixBot) return m;
      return { ...m, ...(fixTop ? { doorTopGap: -80 } : {}), ...(fixBot ? { doorBottomGap: 5 } : {}) };
    }
    return m;
  });
  prevModulesRef = migrated;
  useFurnitureStore.setState({ placedModules: migrated });
  notifyR3F(migrated);
  migrationRunning = false;
});

// 즉시 마이그레이션: 이미 메모리에 있는 placedModules에도 적용 (HMR 대응)
{
  const cur = useFurnitureStore.getState().placedModules;
  if (cur.length > 0) {
    let changed = false;
    const fixed = cur.map(m => {
      const isBasic = m.moduleId?.includes('lower-half-cabinet') || m.moduleId?.includes('dual-lower-half-cabinet') || m.moduleId?.includes('lower-drawer-') || m.moduleId?.includes('dual-lower-drawer-') || m.moduleId?.includes('lower-sink-cabinet') || m.moduleId?.includes('dual-lower-sink-cabinet') || m.moduleId?.includes('lower-induction-cabinet') || m.moduleId?.includes('dual-lower-induction-cabinet');
      const isDoorLift = m.moduleId?.includes('lower-door-lift-');
      const isTopDown = m.moduleId?.includes('lower-top-down-');
      if (isBasic) {
        const fixTop = m.doorTopGap === 20 || m.doorTopGap === 0;
        const fixBot = m.doorBottomGap === 2 || m.doorBottomGap === 0;
        if (!fixTop && !fixBot) return m;
        changed = true;
        return { ...m, ...(fixTop ? { doorTopGap: -20 } : {}), ...(fixBot ? { doorBottomGap: 5 } : {}) };
      }
      if (isDoorLift) {
        const fixTop = m.doorTopGap === 20 || m.doorTopGap === 0;
        const fixBot = m.doorBottomGap === 2 || m.doorBottomGap === 0;
        if (!fixTop && !fixBot) return m;
        changed = true;
        return { ...m, ...(fixTop ? { doorTopGap: 30 } : {}), ...(fixBot ? { doorBottomGap: 5 } : {}) };
      }
      if (isTopDown) {
        const fixTop = m.doorTopGap === 20 || m.doorTopGap === 0;
        const fixBot = m.doorBottomGap === 2 || m.doorBottomGap === 0;
        if (!fixTop && !fixBot) return m;
        changed = true;
        return { ...m, ...(fixTop ? { doorTopGap: -80 } : {}), ...(fixBot ? { doorBottomGap: 5 } : {}) };
      }
      return m;
    });
    if (changed) {
      prevModulesRef = fixed;
      migrationRunning = true;
      useFurnitureStore.setState({ placedModules: fixed });
      notifyR3F(fixed);
      migrationRunning = false;
    }
  }
}

// Development mode에서 디버깅을 위해 store를 window에 노출
if (process.env.NODE_ENV === 'development') {
  (window as any).__furnitureStore = useFurnitureStore;
}

export default useFurnitureStore; 
