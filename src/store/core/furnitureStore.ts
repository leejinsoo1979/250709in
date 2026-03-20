import { create } from 'zustand';
import { PlacedModule, CurrentDragData, CustomFurnitureConfig } from '@/editor/shared/furniture/types';
import { analyzeColumnSlots } from '@/editor/shared/utils/columnSlotProcessor';
import { ColumnIndexer, calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
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
  notifyR3FTimer = setTimeout(() => {
    notifyR3FTimer = null;
    storeRef?.setState({ placedModules: [...modules] });
  }, 50);
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

      // 도어 바닥 이격거리 초기화 (spaceInfo에 저장된 값 우선 사용)
      if (module.doorBottomGap === undefined) {
        const isFloatPlacement = spaceInfo.baseConfig?.placementType === 'float';
        const floatHeight = spaceInfo.baseConfig?.floatHeight || 200;
        module.doorBottomGap = spaceInfo.doorBottomGap ?? (isFloatPlacement ? floatHeight : 25);
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

    set((state) => ({
      placedModules: state.placedModules.filter(m => m.id !== id)
    }));
    // 가구 삭제 시 서라운드도 함께 초기화 + 프레임 병합 해제
    const spaceStore = useSpaceConfigStore.getState();
    spaceStore.setSpaceInfo({ freeSurround: undefined });
    if (spaceStore.spaceInfo.frameMergeEnabled) {
      spaceStore.setSpaceInfo({ frameMergeEnabled: false });
    }
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
    const newModules = typeof modules === 'function' ? modules(state.placedModules) : modules;
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
    const isFloatPlacement = spaceInfo.baseConfig?.placementType === 'float';
    const floatHeight = spaceInfo.baseConfig?.floatHeight || 200;
    const defaultBottomGap = spaceInfo.doorBottomGap ?? (isFloatPlacement ? floatHeight : 25);

    // 전체서라운드: 상부프레임 + 3mm, 그 외: spaceInfo.doorTopGap 또는 5mm
    const isFullSurround = spaceInfo.surroundType === 'surround' && spaceInfo.frameConfig?.top !== false;
    const topFrameMm = spaceInfo.frameSize?.top || 30;
    const defaultTopGap = isFullSurround ? (topFrameMm + 3) : (spaceInfo.doorTopGap || 5);

    set((state) => {
      const updatedModules = state.placedModules.map(module => ({
        ...module,
        hasDoor,
        ...(hasDoor && {
          doorTopGap: module.doorTopGap ?? defaultTopGap,
          doorBottomGap: module.doorBottomGap ?? defaultBottomGap
        })
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
        // 기둥이 있는 슬롯인 경우 adjustedWidth 설정 (소수점 2자리로 반올림)
        if (slotInfo?.hasColumn) {
          const rawWidth = slotInfo.adjustedWidth || slotInfo.availableWidth;
          const newAdjustedWidth = Math.round(rawWidth * 100) / 100;

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
  },

  // 전체 상태 초기화
  resetAll: () => {
    set({ placedModules: [], hasUnsavedChanges: false });
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

// Development mode에서 디버깅을 위해 store를 window에 노출
if (process.env.NODE_ENV === 'development') {
  (window as any).__furnitureStore = useFurnitureStore;
}

export default useFurnitureStore; 
