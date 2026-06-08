import { create } from 'zustand';
import { PlacedModule, CurrentDragData, CustomFurnitureConfig } from '@/editor/shared/furniture/types';
import { analyzeColumnSlots } from '@/editor/shared/utils/columnSlotProcessor';
import { ColumnIndexer, calculateSpaceIndexing, recalculateWithCustomWidths } from '@/editor/shared/utils/indexing';
import { getModuleById } from '@/data/modules';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import { useSpaceConfigStore } from './spaceConfigStore';
import { useUIStore } from '@/store/uiStore';
import { getCategoryDefaultFurnitureDepth } from '@/editor/shared/utils/furnitureDepthDefaults';
import { calcInsertFrameResizedPositionX, resolveInsertFrameResizeHingePosition } from '@/editor/shared/utils/freePlacementUtils';
import { applySlotOutsideEpAdjustments } from '@/editor/shared/utils/slotOutsideEpAdjustment';

const isCornerCabinetModuleId = (moduleId?: string): boolean =>
  !!moduleId && (moduleId.includes('left-corner') || moduleId.includes('right-corner'));

const getTopDownDoorTopGap = (stoneTopThickness?: number, hasTopEndPanel?: boolean): number => {
  if (hasTopEndPanel) return -82;
  if (stoneTopThickness === 10) return -90;
  if (stoneTopThickness === 30) return -70;
  return -80;
};

const applyCurrentSlotOutsideEpAdjustments = (modules: PlacedModule[]): PlacedModule[] => {
  const spaceInfo = useSpaceConfigStore.getState().spaceInfo;
  return applySlotOutsideEpAdjustments(modules, spaceInfo);
};

const getRequiredCornerStartSlot = (
  moduleId: string,
  span: number,
  columnCount: number
): number | null => {
  if (!isCornerCabinetModuleId(moduleId)) return null;
  if (moduleId.includes('left-corner')) return 0;
  return Math.max(0, columnCount - span);
};

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
  restoreFurnitureForColumnMove: (spaceInfo: any) => void;

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

const getGlobalSlotIndexForModule = (module: PlacedModule, spaceInfo: any): number | undefined => {
  if (module.slotIndex === undefined) return undefined;

  let globalSlotIndex = module.slotIndex;
  if (module.zone && spaceInfo.droppedCeiling?.enabled) {
    const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
    if (module.zone === 'dropped' && zoneInfo.dropped) {
      globalSlotIndex = zoneInfo.normal.columnCount + module.slotIndex;
    }
  }

  return globalSlotIndex;
};

const isSameColumnStillAdjacent = (module: PlacedModule, slotInfo: any): boolean =>
  !!(
    slotInfo?.hasColumn &&
    module.columnSlotInfo?.hasColumn &&
    (!module.columnSlotInfo.columnId || slotInfo.column?.id === module.columnSlotInfo.columnId) &&
    (!module.columnSlotInfo.intrusionDirection || slotInfo.intrusionDirection === module.columnSlotInfo.intrusionDirection) &&
    (!module.columnSlotInfo.furniturePosition || slotInfo.furniturePosition === module.columnSlotInfo.furniturePosition)
  );

const hasColumnRelatedAdjust = (module: PlacedModule): boolean =>
  module.adjustedWidth !== undefined ||
  module.columnSlotInfo !== undefined ||
  (module as any).adjustedPosition !== undefined ||
  module.topFrameWidthAdjustEnabled === true ||
  module.baseFrameWidthAdjustEnabled === true;

const clearColumnRelatedAdjust = (module: PlacedModule): PlacedModule => ({
  ...module,
  adjustedWidth: undefined,
  adjustedPosition: undefined,
  columnSlotInfo: undefined,
  topFrameWidthAdjustEnabled: false,
  topFrameLeftAdjustMm: 0,
  topFrameRightAdjustMm: 0,
  baseFrameWidthAdjustEnabled: false,
  baseFrameLeftAdjustMm: 0,
  baseFrameRightAdjustMm: 0
} as PlacedModule);

const getGroupedMovementUpdates = (
  module: PlacedModule,
  targetModule: PlacedModule | undefined,
  updates: Partial<PlacedModule>
): Partial<PlacedModule> | null => {
  if ((updates as any).__skipGroupPropagation) {
    return null;
  }

  if (!targetModule?.groupId || module.id === targetModule.id || module.groupId !== targetModule.groupId || module.isLocked) {
    return null;
  }

  const groupedUpdates: Partial<PlacedModule> = {};

  if (updates.position) {
    groupedUpdates.position = {
      x: module.position.x + (updates.position.x - targetModule.position.x),
      y: module.position.y + (updates.position.y - targetModule.position.y),
      z: module.position.z + (updates.position.z - targetModule.position.z),
    };
  }

  if (
    updates.slotIndex !== undefined &&
    targetModule.slotIndex !== undefined &&
    module.slotIndex !== undefined
  ) {
    groupedUpdates.slotIndex = module.slotIndex + (updates.slotIndex - targetModule.slotIndex);
  }

  if (updates.zone !== undefined) {
    groupedUpdates.zone = updates.zone;
  }

  return Object.keys(groupedUpdates).length > 0 ? groupedUpdates : null;
};

const applyModuleAndGroupedMovement = (
  module: PlacedModule,
  targetId: string,
  targetModule: PlacedModule | undefined,
  updates: Partial<PlacedModule>
): PlacedModule => {
  const { __skipGroupPropagation, ...cleanUpdates } = updates as Partial<PlacedModule> & { __skipGroupPropagation?: boolean };
  if (module.id === targetId) {
    return { ...module, ...cleanUpdates };
  }
  const groupedUpdates = getGroupedMovementUpdates(module, targetModule, updates);
  return groupedUpdates ? { ...module, ...groupedUpdates } : module;
};

/**
 * 가구 배치 후 인접 키큰장(full)의 EP를 자동 체크하는 헬퍼.
 * - 새 가구가 upper/lower면 → 인접 full의 해당 방향 EP 체크
 * - 새 가구가 full이면 → 인접 upper/lower가 있는 방향 EP 체크
 */
const autoSetAdjacentFullEP = (newModule: PlacedModule) => {
  if ((newModule.placementWall || 'front') !== 'front') return;

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
      (m.placementWall || 'front') === 'front' &&
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
  if ((removedModule.placementWall || 'front') !== 'front') return;

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
    (m.placementWall || 'front') === 'front' &&
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
      (m.placementWall || 'front') === 'front' &&
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

      try {
        if (module.customDepth === undefined || module.customDepth === null) {
          module.customDepth = getCategoryDefaultFurnitureDepth(
            spaceInfo.depth || 600,
            module.moduleId || '',
            spaceInfo.furnitureDepthDefaults
          );
        }
      } catch {}

      // 뒷벽 이격: 기본값 0 (뒷벽 붙음). 사용자가 팝업에서 수동 입력하면 앞으로 이동.
      if (module.backWallGap === undefined) {
        module.backWallGap = 0;
      }

      // 우측바 백패널 두께는 배치된 가구 값으로 표시되므로, 신규 가구도 현재 값 상속
      // 기존 배치 가구가 없으면 사용자 기본설정/전역값을 폴백으로 사용한다.
      if (module.backPanelThickness === undefined) {
        const rawBackPanelThickness =
          state.placedModules.find(m => !m.isSurroundPanel && typeof m.backPanelThickness === 'number')?.backPanelThickness
          ?? (spaceInfo as any).backPanelThickness
          ?? 9;
        module.backPanelThickness = rawBackPanelThickness === 9.5
          ? 9
          : rawBackPanelThickness === 5 || rawBackPanelThickness === 5.5
            ? 6
            : rawBackPanelThickness === 3.5
              ? 3
              : rawBackPanelThickness;
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
      const anyOtherHasDoor = state.placedModules.some((m: any) =>
        ((m as any).placementWall || 'front') === ((module as any).placementWall || 'front') &&
        m.hasDoor === true
      );
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
	      const isShelfSplit = module.moduleId?.includes('shelf-split');
	      let configuredDoorTopGap: number | undefined;
	      let configuredDoorBottomGap: number | undefined;
	      if (isTopDown) {
	        configuredDoorTopGap = typeof spaceInfo.doorTopGapLowerTopDown === 'number' ? spaceInfo.doorTopGapLowerTopDown : undefined;
	        configuredDoorBottomGap = typeof spaceInfo.doorBottomGapLowerTopDown === 'number' ? spaceInfo.doorBottomGapLowerTopDown : undefined;
	      } else if (isDoorLift) {
	        configuredDoorTopGap = typeof spaceInfo.doorTopGapLowerDoorLift === 'number' ? spaceInfo.doorTopGapLowerDoorLift : undefined;
	        configuredDoorBottomGap = typeof spaceInfo.doorBottomGapLowerDoorLift === 'number' ? spaceInfo.doorBottomGapLowerDoorLift : undefined;
	      } else if (isBasicLowerCabinet || newCategory === 'lower') {
	        configuredDoorTopGap = typeof spaceInfo.doorTopGapLower === 'number' ? spaceInfo.doorTopGapLower : undefined;
	        configuredDoorBottomGap = typeof spaceInfo.doorBottomGapLower === 'number' ? spaceInfo.doorBottomGapLower : undefined;
	      } else if (newCategory === 'upper') {
	        configuredDoorTopGap = typeof spaceInfo.doorTopGapUpper === 'number' ? spaceInfo.doorTopGapUpper : undefined;
	        configuredDoorBottomGap = typeof spaceInfo.doorBottomGapUpper === 'number' ? spaceInfo.doorBottomGapUpper : undefined;
	      } else {
	        configuredDoorTopGap = typeof spaceInfo.doorTopGapTall === 'number'
	          ? spaceInfo.doorTopGapTall
	          : (typeof spaceInfo.doorTopGap === 'number' ? spaceInfo.doorTopGap : undefined);
	        configuredDoorBottomGap = typeof spaceInfo.doorBottomGapTall === 'number'
	          ? spaceInfo.doorBottomGapTall
	          : (typeof spaceInfo.doorBottomGap === 'number' ? spaceInfo.doorBottomGap : undefined);
	      }
      if (module.doorBottomGap === undefined) {
        if (newCategory === 'upper') {
          // 상부장: 캐비넷 하단에서 도어 하단까지의 확장거리 (바닥 기준이 아님)
          module.doorBottomGap = configuredDoorBottomGap ?? 28;
        } else if (isBasicLowerCabinet || isDoorLift || isTopDown) {
          // 기본하부장/서랍장/도어올림/상판내림: 하단 5mm 확장
          module.doorBottomGap = configuredDoorBottomGap ?? 5;
        } else if (newCategory === 'lower') {
          // 기타 하부장: 캐비넷 하단에서 2mm 아래로 확장
          module.doorBottomGap = configuredDoorBottomGap ?? 2;
        } else {
          const isFloatPlacement = spaceInfo.baseConfig?.placementType === 'float';
          const floatHeight = spaceInfo.baseConfig?.floatHeight || 200;
          module.doorBottomGap = configuredDoorBottomGap ?? (isFloatPlacement ? floatHeight : 25);
        }
      }

      // 도어 상단 이격거리 초기화 (카테고리별 기본값)
      if (module.doorTopGap === undefined) {
        if (isTopDown) {
          // 상판내림: 10T=-90, 20T=-80, 30T=-70
          module.doorTopGap = configuredDoorTopGap ?? getTopDownDoorTopGap(module.stoneTopThickness, module.hasTopEndPanel === true);
        } else if (isDoorLift) {
          // 도어올림: 상단 30mm (마이다가 위로 올라감)
          module.doorTopGap = configuredDoorTopGap ?? 30;
        } else if (isBasicLowerCabinet) {
          // 기본하부장 반통/한통/서랍장: 상단 -20mm (도어가 캐비넷보다 20mm 짧음)
          module.doorTopGap = configuredDoorTopGap ?? -20;
        } else if (newCategory === 'lower') {
          // 기타 하부장: 캐비넷 상단에서 20mm 내려옴
          module.doorTopGap = configuredDoorTopGap ?? 20;
        } else {
          const isFullSurround = spaceInfo.surroundType === 'surround'
            && spaceInfo.frameConfig?.top !== false;
	          module.doorTopGap = configuredDoorTopGap ?? (isFullSurround ? -3 : 5);
	        }
	      }
	      if (isShelfSplit) {
	        const shelfSplitTopGap = spaceInfo.surroundType === 'surround' && spaceInfo.frameConfig?.top !== false ? -3 : 5;
	        module.doorTopGap = module.doorTopGap ?? shelfSplitTopGap;
	        module.upperDoorTopGap = module.upperDoorTopGap ?? module.doorTopGap ?? shelfSplitTopGap;
	      }

      const hasTopByDefault = newCategory === 'upper' || newCategory === 'full';
      if (hasTopByDefault && module.topFrameOffset === undefined && typeof spaceInfo.frameSize?.topOffset === 'number') {
        module.topFrameOffset = spaceInfo.frameSize.topOffset;
      }
      if (hasTopByDefault && module.hasTopFrame === false && module.topFrameGap === undefined && typeof spaceInfo.frameSize?.topGap === 'number') {
        module.topFrameGap = Math.max(0, spaceInfo.frameSize.topGap);
      }
      if (hasTopByDefault && module.hasTopFrame === undefined && (spaceInfo.frameSize?.top ?? 0) <= 0) {
        module.hasTopFrame = false;
      }

      // 상부장 상판 따내기 기본값: 없음 (필요시 수동 설정)
      // topPanelNotchSize, topPanelNotchSide는 undefined → 따내기 없음

      // 하부장 신규 배치 시: 기존 배치된 하부장에 stoneTop이 설치되어 있으면 같은 두께/오프셋 자동 적용
      const isNewLowerById = module.moduleId?.startsWith('lower-') || module.moduleId?.includes('dual-lower-');
      const isNewLower = newCategory === 'lower' || isNewLowerById;
      console.log('[addModule stoneTop auto]', {
        moduleId: module.moduleId,
        newCategory,
        isNewLower,
        incomingStoneThk: module.stoneTopThickness,
        existingModules: state.placedModules.map(m => ({ id: m.id, moduleId: m.moduleId, stoneTopThickness: m.stoneTopThickness }))
      });
      if (isNewLower && (module.stoneTopThickness === undefined || module.stoneTopThickness === 0)) {
        const existingWithStone = state.placedModules.find(m => {
          const mid = m.moduleId || '';
          const isLower = m.moduleId?.startsWith('lower-') || mid.includes('dual-lower-') ||
            mid.includes('lower-door-lift') || mid.includes('lower-top-down') ||
            mid.includes('lower-drawer') || mid.includes('lower-sink') ||
            mid.includes('lower-induction');
          return isLower && (m.stoneTopThickness || 0) > 0;
        });
        console.log('[addModule stoneTop auto] matched existing:', existingWithStone?.moduleId, 'stoneThk:', existingWithStone?.stoneTopThickness);
        if (existingWithStone) {
          module.stoneTopThickness = existingWithStone.stoneTopThickness;
          const isDoorLiftNew = module.moduleId?.includes('lower-door-lift');
          // 상판 오프셋도 같은 값으로 (앞 23 기본, 그 외는 0)
          if (module.stoneTopFrontOffset === undefined) {
            module.stoneTopFrontOffset = isDoorLiftNew ? 0 : (existingWithStone.stoneTopFrontOffset ?? 23);
          }
          if (module.stoneTopBackOffset === undefined) {
            module.stoneTopBackOffset = existingWithStone.stoneTopBackOffset ?? 0;
          }
          if (module.stoneTopLeftOffset === undefined) {
            module.stoneTopLeftOffset = existingWithStone.stoneTopLeftOffset ?? 0;
          }
          if (module.stoneTopRightOffset === undefined) {
            module.stoneTopRightOffset = existingWithStone.stoneTopRightOffset ?? 0;
          }
          // 상판내림: stoneThk에 맞춰 cabH(freeHeight) + doorTopGap 자동 보정
          const isTopDownNew = module.moduleId?.includes('lower-top-down-');
          const sThk = module.stoneTopThickness || 0;
          if (isDoorLiftNew && sThk > 0) {
            module.stoneTopFrontOffset = 0;
            if (module.doorTopGap === undefined) {
              module.doorTopGap = configuredDoorTopGap;
            }
          }
          if (isTopDownNew && sThk > 0) {
            const expectedGap = getTopDownDoorTopGap(sThk, module.hasTopEndPanel === true);
            module.doorTopGap = expectedGap;
            // cabH: 805 - sThk 기준 (반통/한통/2단/3단 공통)
            const expectedCabH = 805 - sThk;
            if (module.freeHeight === undefined) module.freeHeight = expectedCabH;
            if (module.moduleId?.includes('lower-drawer-2tier') || module.moduleId?.includes('dual-lower-drawer-2tier')) {
              if (module.cabinetBodyHeight === undefined) module.cabinetBodyHeight = expectedCabH;
            }
          }
          // 일반 하부장은 stoneThk만 자동 적용 (freeHeight는 기본값 유지 — 사용자가 직접 조정)
        }
      }

      // 걸래받이 기본값: 공간 기본설정 값을 우선 적용하고, 없을 때만 기존 하부장/키큰장 기본값 사용
      const isLowerById = module.moduleId?.startsWith('lower-') || module.moduleId?.includes('dual-lower-');
      const hasBaseByDefault = newCategory === 'lower' || newCategory === 'full' || isLowerById;
      const baseConfig = spaceInfo.baseConfig;
      const lowerBaseFrameHeight = spaceInfo.baseboardLowerSize ?? 105;
      const lowerBaseFrameOffset = spaceInfo.baseboardLowerOffset ?? baseConfig?.offset;
      const lowerBaseFrameGap = spaceInfo.baseboardLowerGap ?? baseConfig?.gap;
      if (module.baseFrameHeight === undefined) {
        if (newCategory === 'lower' || isLowerById) {
          module.baseFrameHeight = lowerBaseFrameHeight;
        } else if (newCategory === 'full') {
          module.baseFrameHeight = baseConfig?.height ?? 60;
        }
      }
      if (hasBaseByDefault && module.baseFrameOffset === undefined) {
        const defaultOffset = (newCategory === 'lower' || isLowerById)
          ? lowerBaseFrameOffset
          : baseConfig?.offset;
        if (typeof defaultOffset === 'number') module.baseFrameOffset = defaultOffset;
      }
      if (hasBaseByDefault && module.baseFrameGap === undefined) {
        const defaultGap = (newCategory === 'lower' || isLowerById)
          ? lowerBaseFrameGap
          : baseConfig?.gap;
        if (typeof defaultGap === 'number') module.baseFrameGap = Math.max(0, defaultGap);
      }
      if (hasBaseByDefault && module.hasBase === undefined && (baseConfig?.height ?? 0) <= 0) {
        module.hasBase = false;
      }


      // 2단 가구인 경우 섹션 깊이 초기화
      const sections = newModuleData?.modelConfig?.sections;
      if (sections && sections.length === 2) {
        const defaultDepth = module.customDepth ?? module.freeDepth ?? newModuleData.dimensions.depth;

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
        const newModules = applyCurrentSlotOutsideEpAdjustments([...state.placedModules, module]);
        notifyR3F(newModules);
        return {
          placedModules: newModules
        };
      }

      // 듀얼 가구인지 확인
      const isDual = module.moduleId.includes('dual-');
      const occupiedSlots = isDual ? [module.slotIndex, module.slotIndex + 1] : [module.slotIndex];
      const incomingWall = module.placementWall || 'front';
      const isCornerCabinet = isCornerCabinetModuleId(module.moduleId);

      if (isCornerCabinet) {
        if (incomingWall !== 'front') {
          console.warn('[addModule] 코너장은 정면 코너 슬롯에만 배치할 수 있습니다.', {
            moduleId: module.moduleId,
            incomingWall
          });
          return { placedModules: state.placedModules };
        }

        const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
        const moduleZone = (module.zone || 'normal') as 'normal' | 'dropped';
        const targetZone = moduleZone === 'dropped' && zoneInfo.dropped ? zoneInfo.dropped : zoneInfo.normal;
        const requiredStartSlot = getRequiredCornerStartSlot(
          module.moduleId,
          occupiedSlots.length,
          targetZone.columnCount
        );

        if (requiredStartSlot !== null && module.slotIndex !== requiredStartSlot) {
          console.warn('[addModule] 코너장 시작 슬롯이 코너와 맞지 않습니다.', {
            moduleId: module.moduleId,
            slotIndex: module.slotIndex,
            requiredStartSlot,
            columnCount: targetZone.columnCount
          });
          return { placedModules: state.placedModules };
        }

        const hasCornerConflict = state.placedModules.some(existing => {
          const existingWall = existing.placementWall || 'front';
          if (existingWall !== 'front') return false;
          if ((existing.zone || 'normal') !== moduleZone) return false;
          const existingIsDual = existing.moduleId.includes('dual-') || existing.isDualSlot;
          const existingSlots = existingIsDual
            ? [existing.slotIndex, existing.slotIndex + 1]
            : [existing.slotIndex];
          return occupiedSlots.some(slot => existingSlots.includes(slot));
        });

        if (hasCornerConflict) {
          console.warn('[addModule] 코너 슬롯에 이미 가구가 배치되어 있습니다.', {
            moduleId: module.moduleId,
            occupiedSlots
          });
          return { placedModules: state.placedModules };
        }
      }

      // 듀얼 가구가 차지하는 모든 슬롯에서 기존 가구들을 체크
      let existingModulesInSlot: typeof state.placedModules = [];
      for (const slotIdx of occupiedSlots) {
        const modulesInThisSlot = state.placedModules.filter(m => {
          const existingWall = m.placementWall || 'front';
          if (incomingWall !== existingWall) return false;

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
          const existingIsCornerCabinet = isCornerCabinetModuleId(existing.moduleId);

          // 상부장-하부장 조합인지 확인
          if (!isCornerCabinet && !existingIsCornerCabinet && (
            (newCategory === 'upper' && existingCategory === 'lower') ||
            (newCategory === 'lower' && existingCategory === 'upper')
          )) {
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

          const newModules = applyCurrentSlotOutsideEpAdjustments([
            ...state.placedModules.filter(m => !replaceIds.includes(m.id)),
            module
          ]);
          notifyR3F(newModules);
          return {
            placedModules: newModules
          };
        }

        // 모든 기존 가구와 공존 가능하면 추가
        const newModules2 = applyCurrentSlotOutsideEpAdjustments([...state.placedModules, module]);
        notifyR3F(newModules2);
        return {
          placedModules: newModules2
        };
      }

      const newModules3 = applyCurrentSlotOutsideEpAdjustments([...state.placedModules, module]);
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
    set((state) => {
      const nextModules = applyCurrentSlotOutsideEpAdjustments(state.placedModules.filter(m =>
        m.id !== id && (!groupId || m.groupId !== groupId)
      ));
      notifyR3F(nextModules);
      return { placedModules: nextModules };
    });

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

    // 자유배치: 가구 삭제 시 균등 모드 자동 해제 (남은 가구가 자동으로 폭 늘어나지 않도록)
    try {
      const uis = useUIStore.getState();
      if (uis.equalDistribution || uis.equalDistributionUpper || uis.equalDistributionLower) {
        uis.setEqualDistribution?.(false);
        uis.setEqualDistributionUpper?.(false);
        uis.setEqualDistributionLower?.(false);
      }
    } catch {}
  },

  // 모듈 이동 함수 (기존 Context 로직과 동일)
  moveModule: (id: string, position: { x: number; y: number; z: number }) => {
    // get() + non-callback set() 방식 사용 (R3F Canvas 내부 리렌더 보장)
    const state = get();
    const targetModule = state.placedModules.find(module => module.id === id);
    if (targetModule?.isLocked) return;
    const newModules = applyCurrentSlotOutsideEpAdjustments(state.placedModules.map(module =>
      applyModuleAndGroupedMovement(module, id, targetModule, { position })
    ));
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


    if (existingModule) {
      if (existingModule.isLocked) {
        const lockedSafeUpdates = { ...updates };
        delete lockedSafeUpdates.position;
        delete lockedSafeUpdates.slotIndex;
        delete lockedSafeUpdates.zone;
        finalUpdates = lockedSafeUpdates;
      }

      if (updates.hasTopFrame === true && updates.topFrameGap === undefined) {
        finalUpdates = { ...finalUpdates, topFrameGap: 0 };
      }

      if (
        typeof updates.topFrameThickness === 'number'
        && typeof existingModule.moduleId === 'string'
        && existingModule.moduleId.includes('shelf-split')
      ) {
        const sections = Array.isArray((finalUpdates as any).customSections)
          ? (finalUpdates as any).customSections
          : (Array.isArray((existingModule as any).customSections) ? (existingModule as any).customSections : []);
        if (sections.length >= 2) {
          const spaceInfo = useSpaceConfigStore.getState().spaceInfo;
          const baseDistance = (finalUpdates.hasBase ?? existingModule.hasBase) === false
            ? ((finalUpdates as any).individualFloatHeight ?? (existingModule as any).individualFloatHeight ?? 0)
            : ((finalUpdates as any).baseFrameHeight ?? existingModule.baseFrameHeight ?? (spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 65) : 0));
          const lowerH = Number(sections[0]?.height) || 0;
          const nextUpperH = Math.max(100, (spaceInfo.height ?? 0) - baseDistance - Math.max(0, updates.topFrameThickness) - lowerH);
          finalUpdates = {
            ...finalUpdates,
            customSections: sections.map((section: any, index: number) => (
              index === 1 ? { ...section, height: nextUpperH, heightType: 'absolute' } : section
            )),
            upperDoorHingePositionsMm: undefined,
          };
        }
      }

      const depthSpaceInfo = useSpaceConfigStore.getState().spaceInfo;
      const depthModuleData = getModuleById(
        existingModule.moduleId,
        calculateInternalSpace(depthSpaceInfo),
        depthSpaceInfo
      );
      const depthSections = depthModuleData?.modelConfig?.sections;
      const isSingleBodyLowerDepth = depthModuleData?.category === 'lower'
        && !existingModule.customConfig
        && (!Array.isArray(depthSections) || depthSections.length <= 1);
      const sectionBodyDepth = isSingleBodyLowerDepth
        && typeof updates.lowerSectionDepth === 'number'
        && updates.lowerSectionDepth > 0
        && updates.customDepth === undefined
        && updates.freeDepth === undefined
        ? updates.lowerSectionDepth
        : undefined;
      const requestedBodyDepth = typeof updates.customDepth === 'number' && updates.customDepth > 0
        ? updates.customDepth
        : (typeof updates.freeDepth === 'number' && updates.freeDepth > 0
          ? updates.freeDepth
          : sectionBodyDepth);
      const currentBodyDepth = typeof existingModule.customDepth === 'number' && existingModule.customDepth > 0
        ? existingModule.customDepth
        : (typeof existingModule.freeDepth === 'number' && existingModule.freeDepth > 0 ? existingModule.freeDepth : undefined);
      const isBodyDepthChanging = requestedBodyDepth !== undefined
        && (currentBodyDepth === undefined || Math.abs(requestedBodyDepth - currentBodyDepth) >= 0.5);

      if (isBodyDepthChanging) {
        const depthSyncUpdates: Partial<PlacedModule> & Record<string, any> = {
          ...finalUpdates,
          customDepth: requestedBodyDepth,
          lowerSectionDepth: requestedBodyDepth,
          upperSectionDepth: requestedBodyDepth,
          endPanelDepth: requestedBodyDepth,
        };

        if (existingModule.isFreePlacement || existingModule.freeDepth !== undefined || updates.freeDepth !== undefined) {
          depthSyncUpdates.freeDepth = requestedBodyDepth;
        }

        if (Array.isArray((existingModule as any).sectionDepths)) {
          depthSyncUpdates.sectionDepths = (existingModule as any).sectionDepths.map(() => requestedBodyDepth);
        }

        if (Array.isArray((existingModule as any).sectionDepthDirections)) {
          const bodyDepthDirection = (updates as any).lowerSectionDepthDirection
            ?? (updates as any).upperSectionDepthDirection
            ?? (existingModule as any).lowerSectionDepthDirection
            ?? (existingModule as any).upperSectionDepthDirection
            ?? 'front';
          depthSyncUpdates.sectionDepthDirections = (existingModule as any).sectionDepthDirections.map(() => bodyDepthDirection);
        }

        if ((existingModule as any).customConfig?.sections) {
          const customConfig = (existingModule as any).customConfig;
          depthSyncUpdates.customConfig = {
            ...customConfig,
            sections: customConfig.sections.map((section: any) => {
              if (!section.horizontalSplit) return section;
              const horizontalSplit = { ...section.horizontalSplit };
              if (horizontalSplit.leftDepth !== undefined) horizontalSplit.leftDepth = requestedBodyDepth;
              if (horizontalSplit.rightDepth !== undefined) horizontalSplit.rightDepth = requestedBodyDepth;
              if (horizontalSplit.centerDepth !== undefined) horizontalSplit.centerDepth = requestedBodyDepth;
              return { ...section, horizontalSplit };
            }),
          };
        }

        finalUpdates = depthSyncUpdates;
      }

      const requestedBodyWidth = typeof updates.freeWidth === 'number' && updates.freeWidth > 0
        ? updates.freeWidth
        : (typeof updates.customWidth === 'number' && updates.customWidth > 0
          ? updates.customWidth
          : (typeof updates.moduleWidth === 'number' && updates.moduleWidth > 0 ? updates.moduleWidth : undefined));
      const currentBodyWidth = typeof existingModule.freeWidth === 'number' && existingModule.freeWidth > 0
        ? existingModule.freeWidth
        : (typeof existingModule.customWidth === 'number' && existingModule.customWidth > 0
          ? existingModule.customWidth
          : (typeof existingModule.moduleWidth === 'number' && existingModule.moduleWidth > 0 ? existingModule.moduleWidth : undefined));
      // 키큰장찬넬은 배치 모드(자유/가이드슬롯/슬롯)와 무관하게 채움재이므로
      // 폭 변경 시 항상 한쪽 면(좌고정/우고정)을 고정한다.
      const isInsertFrameWidthChanging = typeof existingModule.moduleId === 'string'
        && existingModule.moduleId.includes('insert-frame')
        && requestedBodyWidth !== undefined
        && (currentBodyWidth === undefined || Math.abs(requestedBodyWidth - currentBodyWidth) >= 0.5);

      if (isInsertFrameWidthChanging) {
        const spaceInfo = useSpaceConfigStore.getState().spaceInfo;
        const resolvedHingePosition = resolveInsertFrameResizeHingePosition(existingModule, state.placedModules, spaceInfo);
        const insertFrameForResize = {
          ...existingModule,
          hingePosition: resolvedHingePosition,
        };
        // 사용자가 좌고정/우고정을 선택한 경우 그 면을 우선 고정한다 (기본 좌고정).
        // updates에 anchor가 함께 넘어오면 그것을, 아니면 기존 모듈 값을 사용.
        const anchorOverride = (updates.insertFrameWidthAnchor ?? existingModule.insertFrameWidthAnchor ?? 'left') as 'left' | 'right';
        finalUpdates = {
          ...finalUpdates,
          freeWidth: requestedBodyWidth,
          moduleWidth: requestedBodyWidth,
          customWidth: requestedBodyWidth,
          hingePosition: resolvedHingePosition,
          userResizedWidth: true,
          position: {
            ...existingModule.position,
            x: calcInsertFrameResizedPositionX(insertFrameForResize, requestedBodyWidth, state.placedModules, spaceInfo, anchorOverride),
          },
        };
      }
    }
    if (existingModule?.isFreePlacement && finalUpdates.position) {
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
        let posX = (finalUpdates.position as any).x as number;

        // 잠긴 영역 경계 계산
        const effectiveStartX = lockedWallGaps?.left != null ? startX + lockedWallGaps.left : startX;
        const effectiveEndX = lockedWallGaps?.right != null ? endX - lockedWallGaps.right : endX;

        // 가구가 잠긴 영역을 침범하면 경계로 밀어냄
        const minPosX = (effectiveStartX + halfFW) * 0.01;
        const maxPosX = (effectiveEndX - halfFW) * 0.01;
        const clampedPosX = Math.max(minPosX, Math.min(maxPosX, posX));

        if (clampedPosX !== posX) {
          finalUpdates = { ...finalUpdates, position: { ...(finalUpdates.position as any), x: clampedPosX } };
        }
      }
    }

    // 슬롯 변경이 있을 경우 중복 체크 (자유배치 가구는 제외)
    const checkTarget = existingModule || state.placedModules.find(m => m.id === id);
    const oldSlotIndex = checkTarget?.slotIndex;
    const isSlotChanging = (finalUpdates.slotIndex !== undefined && finalUpdates.slotIndex !== oldSlotIndex) || (finalUpdates.zone !== undefined && finalUpdates.zone !== checkTarget?.zone);
    if ((finalUpdates.slotIndex !== undefined || finalUpdates.zone !== undefined) && !checkTarget?.isFreePlacement) {
      const targetModule = checkTarget;
      if (targetModule) {
        const newSlotIndex = finalUpdates.slotIndex !== undefined ? finalUpdates.slotIndex : targetModule.slotIndex;
        const newZone = finalUpdates.zone !== undefined ? finalUpdates.zone : targetModule.zone;
        const movingGroupId = targetModule.groupId;

        // 이동하는 모듈의 카테고리 확인
        const spaceInfo = useSpaceConfigStore.getState();
        const internalSpace = calculateInternalSpace(spaceInfo);
        // updates.moduleId가 있으면 그걸 우선 사용 (모듈 타입이 변경되는 경우를 위해)
        const moduleIdToCheck = finalUpdates.moduleId || targetModule.moduleId;
        const targetModuleData = getModuleById(moduleIdToCheck, internalSpace, spaceInfo);
        const targetCategory = targetModuleData?.category;
        const isTargetUpper = targetCategory === 'upper';
        const isTargetLower = targetCategory === 'lower';

        // 듀얼 가구인지 확인 (업데이트된 moduleId 사용)
        const isDual = moduleIdToCheck.includes('dual-');
        const occupiedSlots = isDual ? [newSlotIndex, newSlotIndex + 1] : [newSlotIndex];
        const targetWallForCorner = targetModule.placementWall || 'front';
        const isCornerCabinet = isCornerCabinetModuleId(moduleIdToCheck);

        if (isCornerCabinet) {
          if (targetWallForCorner !== 'front') {
            console.warn('[updatePlacedModule] 코너장은 정면 코너 슬롯에만 배치할 수 있습니다.', {
              moduleId: moduleIdToCheck,
              targetWall: targetWallForCorner
            });
            return;
          }

          const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
          const moduleZone = (newZone || 'normal') as 'normal' | 'dropped';
          const targetZone = moduleZone === 'dropped' && zoneInfo.dropped ? zoneInfo.dropped : zoneInfo.normal;
          const requiredStartSlot = getRequiredCornerStartSlot(
            moduleIdToCheck,
            occupiedSlots.length,
            targetZone.columnCount
          );

          if (requiredStartSlot !== null && newSlotIndex !== requiredStartSlot) {
            console.warn('[updatePlacedModule] 코너장 시작 슬롯이 코너와 맞지 않습니다.', {
              moduleId: moduleIdToCheck,
              newSlotIndex,
              requiredStartSlot,
              columnCount: targetZone.columnCount
            });
            return;
          }

          const hasCornerConflict = state.placedModules.some(m => {
            if (m.id === id) return false;
            if (movingGroupId && m.groupId === movingGroupId) return false;
            const existingWall = m.placementWall || 'front';
            if (existingWall !== 'front') return false;
            if ((m.zone || 'normal') !== moduleZone) return false;
            const existingIsDual = m.moduleId.includes('dual-') || m.isDualSlot;
            const existingSlots = existingIsDual ? [m.slotIndex, m.slotIndex + 1] : [m.slotIndex];
            return occupiedSlots.some(slot => existingSlots.includes(slot));
          });

          if (hasCornerConflict) {
            console.warn('[updatePlacedModule] 코너 슬롯에 이미 가구가 배치되어 있습니다.', {
              moduleId: moduleIdToCheck,
              occupiedSlots
            });
            return;
          }
        }

        // 듀얼 가구가 차지하는 모든 슬롯에서 기존 가구들을 체크
        let existingModulesInSlot: typeof state.placedModules = [];
        for (const slotIdx of occupiedSlots) {
          const modulesInThisSlot = state.placedModules.filter(m => {
            if (m.id === id) return false; // 자기 자신은 제외
            if (movingGroupId && m.groupId === movingGroupId) return false; // 같은 그룹은 함께 이동하므로 충돌 제외
            const targetWall = targetModule.placementWall || 'front';
            const existingWall = m.placementWall || 'front';
            if (targetWall !== existingWall) return false;

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
            const existingIsCornerCabinet = isCornerCabinetModuleId(existing.moduleId);

            // 상부장-하부장 공존 체크 (듀얼 여부와 관계없이)
            const canCoexist = !isCornerCabinet && !existingIsCornerCabinet && (
              (isTargetUpper && existingCategory === 'lower') ||
              (isTargetLower && existingCategory === 'upper')
            );

            if (canCoexist) {
              // 공존 가능하므로 modulesToReplace에 추가하지 않음
            } else {
              // 같은 카테고리거나 full 카테고리면 교체 필요
              modulesToReplace.push(existing);
            }
          }

          // 모든 기존 가구와 공존 가능하면 그냥 업데이트
          if (modulesToReplace.length === 0) {
            const newModules = applyCurrentSlotOutsideEpAdjustments(state.placedModules.map(module =>
              applyModuleAndGroupedMovement(module, id, existingModule, finalUpdates)
            ));
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
            const newModules = applyCurrentSlotOutsideEpAdjustments(filteredModules.map(module =>
              applyModuleAndGroupedMovement(module, id, existingModule, finalUpdates)
            ));
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
    const newModules = applyCurrentSlotOutsideEpAdjustments(state.placedModules.map(module => {
      return applyModuleAndGroupedMovement(module, id, existingModule, finalUpdates);
    }));

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
    // 도어갭 기본값은 undefined일 때만 채운다. 0/양수/음수는 사용자 입력값이다.
    const newModules = applyCurrentSlotOutsideEpAdjustments(resolved.map(m => {
      const isBasic = m.moduleId?.includes('lower-half-cabinet') || m.moduleId?.includes('dual-lower-half-cabinet') || m.moduleId?.includes('lower-drawer-') || m.moduleId?.includes('dual-lower-drawer-') || m.moduleId?.includes('lower-sink-cabinet') || m.moduleId?.includes('dual-lower-sink-cabinet') || m.moduleId?.includes('lower-induction-cabinet') || m.moduleId?.includes('dual-lower-induction-cabinet');
      if (isBasic) {
        const needsTopFix = m.doorTopGap === undefined;
        const needsBottomFix = m.doorBottomGap === undefined;
        if (needsTopFix || needsBottomFix) {
          return {
            ...m,
            ...(needsTopFix ? { doorTopGap: -20 } : {}),
            ...(needsBottomFix ? { doorBottomGap: 5 } : {})
          };
        }
      }
      // 도어올림 기본값
      const isDoorLift = m.moduleId?.includes('lower-door-lift-');
      if (isDoorLift) {
        const needsTopFix = m.doorTopGap === undefined;
        const needsBottomFix = m.doorBottomGap === undefined;
        if (needsTopFix || needsBottomFix) {
          return {
            ...m,
            ...(needsTopFix ? { doorTopGap: 30 } : {}),
            ...(needsBottomFix ? { doorBottomGap: 5 } : {})
          };
        }
      }
      // 상판내림 기본값
      const isTopDown = m.moduleId?.includes('lower-top-down-');
      if (isTopDown) {
        const needsTopFix = m.doorTopGap === undefined;
        const needsBottomFix = m.doorBottomGap === undefined;
        if (needsTopFix || needsBottomFix) {
          return {
            ...m,
            ...(needsTopFix ? { doorTopGap: getTopDownDoorTopGap(m.stoneTopThickness, m.hasTopEndPanel === true) } : {}),
            ...(needsBottomFix ? { doorBottomGap: 5 } : {})
          };
        }
      }
      return m;
    }));
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

    const isFullSurround = spaceInfo.surroundType === 'surround'
      && spaceInfo.frameConfig?.top !== false;
    const defaultTopGap = isFullSurround ? -3 : 5;

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
      const isShelfSplit = module.moduleId?.includes('shelf-split');
      if (isTopDown) {
        topGap = getTopDownDoorTopGap(module.stoneTopThickness, module.hasTopEndPanel === true);   // 상판내림: 상부EP=-82, 일반 10T=-90/20T=-80/30T=-70
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
	          doorTopGap: isShelfSplit
	            ? (module.doorTopGap ?? (isFullSurround && module.hasTopFrame !== false ? -3 : 5))
	            : isFullSurround && module.hasTopFrame !== false && category !== 'lower' && module.doorTopGap === 5
	            ? -3
	            : (module.doorTopGap ?? topGap),
	          ...(isShelfSplit ? { upperDoorTopGap: module.upperDoorTopGap ?? module.doorTopGap ?? (isFullSurround && module.hasTopFrame !== false ? -3 : 5) } : {}),
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
        if (module.isLocked) return [module];

        const globalSlotIndex = getGlobalSlotIndexForModule(module, spaceInfo);
        if (globalSlotIndex === undefined) return [module];

        const slotInfo = columnSlots[globalSlotIndex];

        // 기둥과 함께 배치된 가구만 폭 보정을 유지한다.
        // 기둥이 나중에 들어오거나, 가구 옆을 벗어나면 보정/확장 체크를 원복한다.
        if (isSameColumnStillAdjacent(module, slotInfo)) {
          const rawWidth = slotInfo.adjustedWidth || slotInfo.availableWidth;
          const newAdjustedWidth = Math.round(rawWidth * 100) / 100;
          if (module.adjustedWidth === newAdjustedWidth) return [module];
          return [{
            ...module,
            adjustedWidth: newAdjustedWidth
          }];
        } else {
          // 기둥이 없는 슬롯인 경우 폭/위치 보정을 제거한다. 기둥 이동으로 가구 좌표를 바꾸면 안 된다.
          if (hasColumnRelatedAdjust(module)) {
            return [clearColumnRelatedAdjust(module)];
          }
          return [module];
        }
      });

      return {
        placedModules: updatedModules
      };
    });
  },

  restoreFurnitureForColumnMove: (spaceInfo: any) => {
    const state = get();
    const columnSlots = analyzeColumnSlots(spaceInfo);
    let changed = false;

    const updatedModules = state.placedModules.map(module => {
      if (module.slotIndex === undefined || module.isLocked || !hasColumnRelatedAdjust(module)) {
        return module;
      }

      const globalSlotIndex = getGlobalSlotIndexForModule(module, spaceInfo);
      const slotInfo = globalSlotIndex !== undefined ? columnSlots[globalSlotIndex] : undefined;
      if (isSameColumnStillAdjacent(module, slotInfo)) {
        return module;
      }

      changed = true;
      return clearColumnRelatedAdjust(module);
    });

    if (!changed) return;
    set({ placedModules: updatedModules });
    notifyR3F(updatedModules);
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
      if ((target.placementWall || 'front') !== 'front') return { placedModules: updatedModules };

      const targetZone = target.zone || 'normal';
      const frontModulesForIndex = updatedModules.filter(m => (m.placementWall || 'front') === 'front');

      // 2. recalculateWithCustomWidths로 슬롯 재분할
      const recalculated = recalculateWithCustomWidths(baseIndexing, frontModulesForIndex, targetZone);
      const columnCount = recalculated.columnCount;

      // 3. 같은 zone 내 모든 모듈의 position.x / moduleWidth 업데이트
      updatedModules = updatedModules.map(m => {
        const mZone = m.zone || 'normal';
        if ((m.placementWall || 'front') !== 'front') return m;
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

        if ((module.placementWall || 'front') !== 'front') {
          return updated;
        }

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
            lowerKey.includes('door') ||
            key.includes('키큰장찬넬 전면프레임') ||
            key.includes('키큰장찬넬 좌EP') ||
            key.includes('키큰장찬넬 우EP')) {
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
	    const isShelfSplit = m.moduleId?.includes('shelf-split');
	    if (isShelfSplit && m.hasDoor === true && (m.doorTopGap === undefined || m.upperDoorTopGap === undefined)) {
	      needsMigration = true;
	      break;
	    }
	    if ((isBasic || isDoorLift || isTopDown) && (m.doorTopGap === undefined || m.doorBottomGap === undefined)) {
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
      const isFullSurround = spInfo.surroundType === 'surround'
        && spInfo.frameConfig?.top !== false;
      const correctGap = isFullSurround ? -3 : 5;
      return { ...m, doorTopGap: correctGap };
    }
	    if (m.moduleId?.includes('shelf-split') && m.hasDoor === true) {
	      const shelfSplitTargetTopGap = spInfo.surroundType === 'surround' && spInfo.frameConfig?.top !== false && m.hasTopFrame !== false ? -3 : 5;
	      return {
	        ...m,
	        doorTopGap: m.doorTopGap ?? shelfSplitTargetTopGap,
	        upperDoorTopGap: m.upperDoorTopGap ?? m.doorTopGap ?? shelfSplitTargetTopGap,
	      };
	    }
	    if (spInfo.surroundType === 'surround' && spInfo.frameConfig?.top !== false && !m.moduleId?.includes('lower-') && m.hasTopFrame !== false && m.doorTopGap === 5) {
	      return { ...m, doorTopGap: -3 };
	    }
    const isBasic = m.moduleId?.includes('lower-half-cabinet') || m.moduleId?.includes('dual-lower-half-cabinet') || m.moduleId?.includes('lower-drawer-') || m.moduleId?.includes('dual-lower-drawer-') || m.moduleId?.includes('lower-sink-cabinet') || m.moduleId?.includes('dual-lower-sink-cabinet') || m.moduleId?.includes('lower-induction-cabinet') || m.moduleId?.includes('dual-lower-induction-cabinet');
    const isDoorLift = m.moduleId?.includes('lower-door-lift-');
    const isTopDown = m.moduleId?.includes('lower-top-down-');
    if (isBasic) {
      const fixTop = m.doorTopGap === undefined;
      const fixBot = m.doorBottomGap === undefined;
      if (!fixTop && !fixBot) return m;
      return { ...m, ...(fixTop ? { doorTopGap: -20 } : {}), ...(fixBot ? { doorBottomGap: 5 } : {}) };
    }
    if (isDoorLift) {
      const fixTop = m.doorTopGap === undefined;
      const fixBot = m.doorBottomGap === undefined;
      if (!fixTop && !fixBot) return m;
      return { ...m, ...(fixTop ? { doorTopGap: 30 } : {}), ...(fixBot ? { doorBottomGap: 5 } : {}) };
    }
    if (isTopDown) {
      const fixTop = m.doorTopGap === undefined;
      const fixBot = m.doorBottomGap === undefined;
      if (!fixTop && !fixBot) return m;
      return { ...m, ...(fixTop ? { doorTopGap: getTopDownDoorTopGap(m.stoneTopThickness, m.hasTopEndPanel === true) } : {}), ...(fixBot ? { doorBottomGap: 5 } : {}) };
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
        const fixTop = m.doorTopGap === undefined;
        const fixBot = m.doorBottomGap === undefined;
        if (!fixTop && !fixBot) return m;
        changed = true;
        return { ...m, ...(fixTop ? { doorTopGap: -20 } : {}), ...(fixBot ? { doorBottomGap: 5 } : {}) };
      }
      if (isDoorLift) {
        const fixTop = m.doorTopGap === undefined;
        const fixBot = m.doorBottomGap === undefined;
        if (!fixTop && !fixBot) return m;
        changed = true;
        return { ...m, ...(fixTop ? { doorTopGap: 30 } : {}), ...(fixBot ? { doorBottomGap: 5 } : {}) };
      }
      if (isTopDown) {
        const fixTop = m.doorTopGap === undefined;
        const fixBot = m.doorBottomGap === undefined;
        if (!fixTop && !fixBot) return m;
        changed = true;
        return { ...m, ...(fixTop ? { doorTopGap: getTopDownDoorTopGap(m.stoneTopThickness, m.hasTopEndPanel === true) } : {}), ...(fixBot ? { doorBottomGap: 5 } : {}) };
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
