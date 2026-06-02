import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Box, Edges, Html } from '@react-three/drei';
import { ThreeEvent, useThree } from '@react-three/fiber';
import { getModuleById, ModuleData } from '@/data/modules';
import { calculateInternalSpace, END_PANEL_RENDER_THICKNESS } from '../../../utils/geometry';
import { SpaceInfo, useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { PlacedModule } from '@/editor/shared/furniture/types';
import BoxModule from '../../modules/BoxModule';
import * as THREE from 'three';
import { analyzeColumnSlots, calculateFurnitureWidthWithColumn, convertDualToSingleIfNeeded, calculateFurnitureBounds, calculateOptimalHingePosition } from '@/editor/shared/utils/columnSlotProcessor';
import { calculateSpaceIndexing, ColumnIndexer, recalculateWithCustomWidths } from '@/editor/shared/utils/indexing';
import DoorModule from '../../modules/DoorModule';
import { useUIStore } from '@/store/uiStore';
import { EditIcon, SettingsIcon } from '@/components/common/Icons';
import { getEdgeColor } from '../../../utils/edgeColorUtils';
import { useColumnCResize } from '@/editor/shared/furniture/hooks/useColumnCResize';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useCustomFurnitureStore } from '@/store/core/customFurnitureStore';
import EndPanelWithTexture from '../../modules/components/EndPanelWithTexture';
import { useTheme } from '@/contexts/ThemeContext';
import { isCustomizableModuleId, getCustomizableCategory, CUSTOMIZABLE_DEFAULTS } from '@/editor/shared/controls/furniture/CustomizableFurnitureLibrary';
import SurroundPanelMesh from '../../modules/SurroundPanelMesh';
import { FaRegObjectGroup } from 'react-icons/fa';
import { isDummyModuleId } from '@/editor/shared/utils/dummyModule';
import { getCategoryDefaultFurnitureDepth } from '@/editor/shared/utils/furnitureDepthDefaults';
import { resolvePetPanelThicknessMm } from '@/editor/shared/utils/panelThickness';
import { getFreeGuideZoneYRangeMm } from '@/editor/shared/utils/freePlacementUtils';

// 엔드패널 슬롯 계산 기준 두께
const END_PANEL_THICKNESS = 18; // mm

let furnitureModifierTrackingInstalled = false;

const ensureFurnitureModifierTracking = () => {
  if (typeof window === 'undefined' || furnitureModifierTrackingInstalled) {
    return;
  }
  furnitureModifierTrackingInstalled = true;

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Shift' || event.code === 'ShiftLeft' || event.code === 'ShiftRight') (window as any).__furnitureShiftPressed = true;
    if (event.key === 'Control' || event.code === 'ControlLeft' || event.code === 'ControlRight') (window as any).__furnitureCtrlPressed = true;
    if (event.key === 'Meta' || event.code === 'MetaLeft' || event.code === 'MetaRight') (window as any).__furnitureMetaPressed = true;
  };
  const handleKeyUp = (event: KeyboardEvent) => {
    if (event.key === 'Shift' || event.code === 'ShiftLeft' || event.code === 'ShiftRight') (window as any).__furnitureShiftPressed = false;
    if (event.key === 'Control' || event.code === 'ControlLeft' || event.code === 'ControlRight') (window as any).__furnitureCtrlPressed = false;
    if (event.key === 'Meta' || event.code === 'MetaLeft' || event.code === 'MetaRight') (window as any).__furnitureMetaPressed = false;
  };
  const clearModifierState = () => {
    (window as any).__furnitureShiftPressed = false;
    (window as any).__furnitureCtrlPressed = false;
    (window as any).__furnitureMetaPressed = false;
  };

  window.addEventListener('keydown', handleKeyDown, true);
  window.addEventListener('keyup', handleKeyUp, true);
  document.addEventListener('keydown', handleKeyDown, true);
  document.addEventListener('keyup', handleKeyUp, true);
  window.addEventListener('blur', clearModifierState);
};

const isMultiSelectModifierPressed = (event?: MouseEvent | PointerEvent | null): boolean => {
  if (event?.shiftKey || event?.ctrlKey || event?.metaKey) {
    return true;
  }
  if (typeof window === 'undefined') {
    return false;
  }
  return !!(
    (window as any).__furnitureShiftPressed ||
    (window as any).__furnitureCtrlPressed ||
    (window as any).__furnitureMetaPressed
  );
};

// 커스텀 가구 ID인지 확인하는 함수
const isCustomFurnitureId = (moduleId: string): boolean => {
  return moduleId.startsWith('custom-');
};

// 커스텀 가구 데이터를 ModuleData 형식으로 변환하는 함수
const createModuleDataFromCustomFurniture = (
  customFurnitureId: string,
  getCustomFurnitureById: (id: string) => any,
  slotWidth?: number,
  slotHeight?: number,
  slotDepth?: number,
  panelThickness: number = 18
): ModuleData | null => {
  // 'custom-' 접두사 제거
  const actualId = customFurnitureId.replace(/^custom-/, '');
  const customFurniture = getCustomFurnitureById(actualId);

  if (!customFurniture) {
    console.warn('커스텀 가구를 찾을 수 없음:', actualId);
    return null;
  }

  // 슬롯 크기가 제공되면 해당 크기 사용, 아니면 원본 크기 사용
  const width = slotWidth || customFurniture.originalDimensions.width;
  const height = slotHeight || customFurniture.originalDimensions.height;
  const depth = slotDepth || customFurniture.originalDimensions.depth;

  return {
    id: customFurnitureId,
    name: customFurniture.name,
    category: customFurniture.category as 'full' | 'upper' | 'lower',
    dimensions: {
      width,
      height,
      depth,
    },
    color: '#8B7355', // 기본 목재 색상
    description: `커스텀 가구: ${customFurniture.name}`,
    hasDoor: false,
    isDynamic: false,
    type: 'box',
    defaultDepth: customFurniture.originalDimensions.depth,
    // 커스텀 가구용 modelConfig
    modelConfig: {
      basicThickness: panelThickness,
      hasOpenFront: true,
      hasShelf: false,
      sections: [],
    },
  };
};

// 상부장/하부장과 키큰장(듀얼 포함)의 인접 판단 함수
// → 자동 EP 로직 비활성화: 항상 false 반환
const checkAdjacentUpperLowerToFull = (
  _currentModule: PlacedModule,
  _allModules: PlacedModule[],
  _spaceInfo: SpaceInfo
): { hasAdjacentUpperLower: boolean; adjacentSide: 'left' | 'right' | 'both' | null } => {
  return { hasAdjacentUpperLower: false, adjacentSide: null };

  /* === 기존 로직 (비활성화) ===
  // 현재 가구가 키큰장(full) 또는 듀얼 캐비넷인지 확인
  const currentModuleData = getModuleById(currentModule.moduleId, calculateInternalSpace(spaceInfo), spaceInfo);
  if (!currentModuleData) {
    return { hasAdjacentUpperLower: false, adjacentSide: null };
  }

  // 키큰장(full)이 아니면 처리하지 않음
  // 듀얼 캐비넷이어도 상부장/하부장이면 엔드패널 처리하지 않음
  const isDualCabinet = currentModule.moduleId?.includes('dual-');

  // 키큰장(full 카테고리)만 처리
  // 듀얼 상부장/하부장은 처리하지 않음 (같은 카테고리끼리는 엔드패널 불필요)
  if (currentModuleData.category !== 'full') {
    return { hasAdjacentUpperLower: false, adjacentSide: null };
  }

  // 현재 가구의 슬롯 인덱스
  const currentSlotIndex = currentModule.slotIndex;
  if (currentSlotIndex === undefined) {
    return { hasAdjacentUpperLower: false, adjacentSide: null };
  }

  // 듀얼 캐비넷의 경우 두 개의 슬롯을 차지
  const isCurrentDual = isDualCabinet || currentModule.isDualSlot;

  // 단내림이 활성화된 경우, 현재 모듈의 zone 사용
  let currentZone: 'normal' | 'dropped' | undefined = currentModule.zone;
  if (spaceInfo.droppedCeiling?.enabled && currentZone) {
  }

  // slotCustomWidth 재분할이 반영된 indexing 사용
  // 메모이제이션: calculateSpaceIndexing는 무거운 계산인데 매 렌더 실행되면 기둥 드래그 중 렉을 유발한다.
  const baseIndexing = useMemo(() => calculateSpaceIndexing(spaceInfo), [spaceInfo]);
  const indexing = useMemo(() => {
    const hasCustomWidths = placedModules.some(m => m.slotCustomWidth !== undefined);
    return hasCustomWidths ? recalculateWithCustomWidths(baseIndexing, placedModules) : baseIndexing;
  }, [baseIndexing, placedModules]);

  // 인접한 슬롯에 상부장/하부장이 있는지 확인
  // 왼쪽: 싱글 가구는 -1, 듀얼 가구는 시작 슬롯이 -2 위치에 있어야 함
  let leftAdjacentModule = allModules.find(m => {
    // 같은 zone인 경우: 기존 slotIndex 로직
    if (m.zone === currentZone) {
      const isLeftDual = m.moduleId?.includes('dual-');
      if (isLeftDual) {
        return m.slotIndex === currentSlotIndex - 2;
      } else {
        return m.slotIndex === currentSlotIndex - 1;
      }
    }

    // 다른 zone인 경우: 경계 체크
    if (spaceInfo.droppedCeiling?.enabled && m.zone && currentZone && m.zone !== currentZone) {
      const droppedPosition = spaceInfo.droppedCeiling.position || 'right';

      if (droppedPosition === 'right') {
        // normal(왼쪽) - dropped(오른쪽)
        // 현재가 dropped 시작이고, m이 normal 끝
        // 듀얼 가구도 고려: dropped zone 시작 (0)에 배치
        const isAtNormalEnd = m.slotIndex === (indexing.zones?.normal?.columnCount ?? 0) - 1;
        return (
          currentZone === 'dropped' && m.zone === 'normal' &&
          currentSlotIndex === 0 && isAtNormalEnd
        );
      } else {
        // dropped(왼쪽) - normal(오른쪽)
        // 현재가 normal 시작이고, m이 dropped 끝
        // 듀얼 가구도 고려: normal zone 시작 (0)에 배치
        const isAtDroppedEnd = m.slotIndex === (indexing.zones?.dropped?.columnCount ?? 0) - 1;
        return (
          currentZone === 'normal' && m.zone === 'dropped' &&
          currentSlotIndex === 0 && isAtDroppedEnd
        );
      }
    }

    return false;
  });

  // 오른쪽: 현재 가구가 듀얼이면 +2, 싱글이면 +1 위치 체크
  let rightAdjacentModule = allModules.find(m => {
    // 같은 zone인 경우: 기존 slotIndex 로직
    if (m.zone === currentZone) {
      const targetSlot = isCurrentDual ? currentSlotIndex + 2 : currentSlotIndex + 1;
      return m.slotIndex === targetSlot;
    }

    // 다른 zone인 경우: 경계 체크
    if (spaceInfo.droppedCeiling?.enabled && m.zone && currentZone && m.zone !== currentZone) {
      const droppedPosition = spaceInfo.droppedCeiling.position || 'right';

      if (droppedPosition === 'right') {
        // normal(왼쪽) - dropped(오른쪽)
        // 현재가 normal 끝이고, m이 dropped 시작
        // 듀얼 가구는 2칸 차지: normal zone 끝 2칸 (columnCount-2, columnCount-1)
        const normalColumnCount = indexing.zones?.normal?.columnCount ?? 0;
        const isAtNormalEnd = isCurrentDual
          ? currentSlotIndex === normalColumnCount - 2
          : currentSlotIndex === normalColumnCount - 1;
        return (
          currentZone === 'normal' && m.zone === 'dropped' &&
          isAtNormalEnd && m.slotIndex === 0
        );
      } else {
        // dropped(왼쪽) - normal(오른쪽)
        // 현재가 dropped 끝이고, m이 normal 시작
        // 듀얼 가구는 2칸 차지: dropped zone 끝 2칸 (columnCount-2, columnCount-1)
        const droppedColumnCount = indexing.zones?.dropped?.columnCount ?? 0;
        const isAtDroppedEnd = isCurrentDual
          ? currentSlotIndex === droppedColumnCount - 2
          : currentSlotIndex === droppedColumnCount - 1;
        return (
          currentZone === 'dropped' && m.zone === 'normal' &&
          isAtDroppedEnd && m.slotIndex === 0
        );
      }
    }

    return false;
  });

  // 왼쪽 인접 모듈이 상부장/하부장인지 확인
  let hasLeftAdjacent = false;
  if (leftAdjacentModule) {
    const leftModuleData = getModuleById(leftAdjacentModule.moduleId, calculateInternalSpace(spaceInfo), spaceInfo);
    const isLeftUpperLower = leftModuleData?.category === 'upper' || leftModuleData?.category === 'lower';


    if (isLeftUpperLower) {
      hasLeftAdjacent = true;
    }
  }

  // 오른쪽 인접 모듈이 상부장/하부장인지 확인
  let hasRightAdjacent = false;
  if (rightAdjacentModule) {
    const rightModuleData = getModuleById(rightAdjacentModule.moduleId, calculateInternalSpace(spaceInfo), spaceInfo);
    const isRightUpperLower = rightModuleData?.category === 'upper' || rightModuleData?.category === 'lower';


    if (isRightUpperLower) {
      hasRightAdjacent = true;
    }
  }

  // 결과 반환
  const result = (() => {
    if (hasLeftAdjacent && hasRightAdjacent) {
      return { hasAdjacentUpperLower: true, adjacentSide: 'both' as const };
    } else if (hasLeftAdjacent) {
      return { hasAdjacentUpperLower: true, adjacentSide: 'left' as const };
    } else if (hasRightAdjacent) {
      return { hasAdjacentUpperLower: true, adjacentSide: 'right' as const };
    }
    return { hasAdjacentUpperLower: false, adjacentSide: null };
  })();

  return result;
  === 기존 로직 끝 === */
};

interface FurnitureItemProps {
  placedModule: PlacedModule;
  placedModules: PlacedModule[]; // 추가
  spaceInfo: SpaceInfo;
  furnitureStartY: number;
  isDragMode: boolean;
  isEditMode: boolean;
  isDraggingThis: boolean;
  viewMode: '2D' | '3D';
  view2DDirection?: 'front' | 'left' | 'right' | 'top' | 'all';
  renderMode: 'solid' | 'wireframe';
  showFurniture?: boolean; // 가구 본체 표시 여부
  readOnly?: boolean; // 읽기 전용 모드 (viewer 권한)
  onPointerDown: (e: ThreeEvent<PointerEvent>, id: string) => void;
  onPointerMove: (e: ThreeEvent<PointerEvent>) => void;
  onPointerUp: () => void;
  onDoubleClick: (e: ThreeEvent<MouseEvent>, id: string) => void;
  onFurnitureClick?: (furnitureId: string, slotIndex: number) => void; // 가구 클릭 콜백 (미리보기용)
  ghostHighlightSlotIndex?: number | null;
}

const FurnitureItem: React.FC<FurnitureItemProps> = ({
  placedModule,
  placedModules,
  spaceInfo,
  furnitureStartY,
  isDragMode,
  isEditMode,
  isDraggingThis,
  viewMode,
  view2DDirection,
  renderMode,
  showFurniture = true,
  readOnly = false,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onDoubleClick,
  onFurnitureClick,
  ghostHighlightSlotIndex
}) => {
  const FURNITURE_DEBUG = false;
  const debugLog = (...args: any[]) => {
    if (FURNITURE_DEBUG) {
    }
  };
  const debugWarn = (...args: any[]) => {
    if (FURNITURE_DEBUG) {
      console.warn(...args);
    }
  };
  // Three.js 컨텍스트 접근
  const { gl, invalidate, scene, camera } = useThree();

  // 디버그: showFurniture 값 확인
  useEffect(() => {
    debugLog('🎯 FurnitureItem - showFurniture:', showFurniture, 'placedModuleId:', placedModule.id, 'moduleId:', placedModule.moduleId);
  }, [showFurniture, placedModule.id, placedModule.moduleId]);
  const { isFurnitureDragging, isDraggingColumn, showDimensions, view2DTheme, selectedFurnitureId, selectedSlotIndex, showFurnitureEditHandles, isLayoutBuilderOpen, isLiveDimensionMode, isTapeMeasureMode, panelSimulationPhase, panelSimulationViewBackup, activePlacementWall } = useUIStore();
  // 기둥 이동(columnMoveOnly) 가드는 폭 보정 차단에서 제외한다.
  // 기둥을 가구 슬롯으로 밀어넣어도 가구 폭은 기둥 침범분만큼 줄어들어야 하기 때문.
  // (위치 점프는 아래 shouldKeepFurnitureXFixedForColumn 이 슬롯 중심으로 고정하므로 발생하지 않음)
  const isPlacementStructureDragging = isFurnitureDragging || isDraggingColumn;
  const shouldApplyColumnAdjustment = !placedModule.isLocked && !isPlacementStructureDragging;
  // 3D 측면뷰(L/R)일 때 카메라 쪽 가구는 숨겨야 하지만 early return은 hook 위반 → visible flag로 처리
  const sideViewHiddenByCamera = (() => {
    if (viewMode !== '3D') return false;
    const px = placedModule.position?.x ?? 0;
    if (activePlacementWall === 'left' && px > 0) return true;
    if (activePlacementWall === 'right' && px < 0) return true;
    return false;
  })();
  const isPanelListTabActive = useUIStore(state => state.isPanelListTabActive);
  const activePopup = useUIStore(state => state.activePopup);
  const { updatePlacedModule } = useFurnitureStore();
  // store에서 해당 가구의 도어 갭/경첩을 직접 구독 (플로팅 패널 변경 시 즉시 반영)
  const storeDoorTopGap = useFurnitureStore(state => state.placedModules.find(m => m.id === placedModule.id)?.doorTopGap);
  const storeDoorBottomGap = useFurnitureStore(state => state.placedModules.find(m => m.id === placedModule.id)?.doorBottomGap);
  const storeHingePosition = useFurnitureStore(state => state.placedModules.find(m => m.id === placedModule.id)?.hingePosition);
  const { getCustomFurnitureById } = useCustomFurnitureStore();
  const [isHovered, setIsHovered] = React.useState(false);
  const [showDoorOptions, setShowDoorOptions] = useState(false);
  const [showSurroundOptions, setShowSurroundOptions] = useState(false);
  const [doorTopGapInput, setDoorTopGapInput] = useState<string>((storeDoorTopGap ?? placedModule.doorTopGap ?? 5).toString());
  const [doorBottomGapInput, setDoorBottomGapInput] = useState<string>((storeDoorBottomGap ?? placedModule.doorBottomGap ?? 1.5).toString());
  // 커스텀 가구 편집 중에는 선택 하이라이트 끄기 (실시간 변경 확인을 위해)
  const isCustomEditing = placedModule.isCustomizable && activePopup.type === 'customizableEdit' && activePopup.id === placedModule.id;
  const selectedFurnitureIds = useUIStore(state => state.selectedFurnitureIds);
  const isMultiSelected = selectedFurnitureIds?.includes(placedModule.id) ?? false;
  const isGroupedSelection = !!placedModule.groupId && placedModules.some(module =>
    module.groupId === placedModule.groupId &&
    (selectedFurnitureId === module.id || (selectedFurnitureIds?.includes(module.id) ?? false))
  );
  const isSelected = (selectedFurnitureId === placedModule.id || isMultiSelected || isGroupedSelection) && !isCustomEditing;
  const isDummyModule = isDummyModuleId(placedModule.moduleId);
  const selectedFurnitureCount = selectedFurnitureIds?.length ?? 0;
  // 선택/편집/줄자모드 중인 가구는 solid로 렌더링
  const effectiveRenderMode = (isSelected || isEditMode || (viewMode === '3D' && (isLiveDimensionMode || isTapeMeasureMode))) ? 'solid' : renderMode;
  // 편집 모드 고스트: 측면/상면뷰에서는 비활성화 (정면/3D에서만 표시)
  const isEditModeForView = isEditMode && (viewMode === '3D' || view2DDirection === 'front' || view2DDirection === 'all');
  const { theme: appTheme } = useTheme();

  // 드래그/편집 시 도어/서라운드 옵션 패널 닫기
  useEffect(() => {
    if (isDraggingThis || isEditMode) {
      setShowDoorOptions(false);
      setShowSurroundOptions(false);
    }
  }, [isDraggingThis, isEditMode]);

  useEffect(() => {
    ensureFurnitureModifierTracking();
  }, []);

  // 허공 클릭 시 도어 옵션 패널 닫기
  useEffect(() => {
    if (!showDoorOptions) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // 패널 내부 클릭은 무시
      if (target.closest('[data-door-options-panel]')) return;
      setShowDoorOptions(false);
    };
    // 다음 프레임에 리스너 등록 (현재 클릭 이벤트 무시)
    const raf = requestAnimationFrame(() => {
      window.addEventListener('pointerdown', handleOutsideClick);
    });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointerdown', handleOutsideClick);
    };
  }, [showDoorOptions]);

  // 허공 클릭 시 서라운드 옵션 패널 닫기
  useEffect(() => {
    if (!showSurroundOptions) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-surround-options-panel]')) return;
      setShowSurroundOptions(false);
    };
    const raf = requestAnimationFrame(() => {
      window.addEventListener('pointerdown', handleOutsideClick);
    });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointerdown', handleOutsideClick);
    };
  }, [showSurroundOptions]);

  // store 갭 값 변경 시 입력 동기화 (몸통 기준, 기본값 0)
  useEffect(() => {
    setDoorTopGapInput((storeDoorTopGap ?? 0).toString());
    setDoorBottomGapInput((storeDoorBottomGap ?? 0).toString());
  }, [storeDoorTopGap, storeDoorBottomGap]);

  // 도어갭 자동 동기화 비활성화 (몸통 기준 시스템에서는 사용자 입력 + 토글 핸들러로 제어)
  // 기존: 슬롯배치 전체서라운드에서 doorTopGap을 자동 강제 → 상부몰딩/걸레받이 토글 결과를 덮어씀
  const isLowerModule = placedModule.moduleId?.includes('lower-');

  // 도어 갭 변경 핸들러
  const handleDoorTopGapCommit = useCallback((value: string) => {
    const num = parseInt(value);
    if (!isNaN(num)) {
      updatePlacedModule(placedModule.id, { doorTopGap: num });
    } else {
      setDoorTopGapInput((storeDoorTopGap ?? 0).toString());
    }
  }, [placedModule.id, storeDoorTopGap, updatePlacedModule]);

  const handleDoorBottomGapCommit = useCallback((value: string) => {
    const num = parseInt(value);
    if (!isNaN(num)) {
      updatePlacedModule(placedModule.id, { doorBottomGap: num });
    } else {
      setDoorBottomGapInput((storeDoorBottomGap ?? 0).toString());
    }
  }, [placedModule.id, storeDoorBottomGap, updatePlacedModule]);

  // 도어 셋업 모드 변경 핸들러
  const handleDoorSetupModeChange = useCallback((mode: 'furniture-fit' | 'space-fit') => {
    const { setSpaceInfo } = useSpaceConfigStore.getState();
    // 도어 셋팅 변경 시 상걸래받이도 연동 변경
    // 공간에 맞춤 → 프레임 가구에 맞춤, 가구에 맞춤 → 프레임 도어에 맞춤
    if (mode === 'space-fit') {
      const spaceInfo = useSpaceConfigStore.getState().spaceInfo;
      const isFloat = spaceInfo.baseConfig?.placementType === 'float';
      const floatH = spaceInfo.baseConfig?.floatHeight || 200;
      const spaceFitBottom = isFloat ? floatH : 25;
      setSpaceInfo({ doorSetupMode: mode, frameOffsetBase: 'furniture', doorTopGap: 1.5, doorBottomGap: spaceFitBottom });
      const allModules = useFurnitureStore.getState().placedModules;
      allModules.forEach((m) => {
        if (!m.hasDoor) return;
        const isLower = m.moduleId?.includes('lower-');
        if (!isLower) updatePlacedModule(m.id, { doorTopGap: 1.5, doorBottomGap: spaceFitBottom });
      });
    } else {
      setSpaceInfo({ doorSetupMode: mode, frameOffsetBase: 'door', doorTopGap: 1.5, doorBottomGap: 1.5 });
      const allModules = useFurnitureStore.getState().placedModules;
      allModules.forEach((m) => {
        if (!m.hasDoor) return;
        const isLower = m.moduleId?.includes('lower-');
        if (!isLower) updatePlacedModule(m.id, { doorTopGap: 1.5, doorBottomGap: 1.5 });
      });
    }
  }, [updatePlacedModule]);

  // 경첩 방향 변경 핸들러
  const handleHingeChange = useCallback((pos: 'left' | 'right') => {
    updatePlacedModule(placedModule.id, { hingePosition: pos });
  }, [placedModule.id, updatePlacedModule]);

  const handleCornerHingeChange = useCallback((
    field: 'cornerFrontHingePosition' | 'cornerSideHingePosition',
    pos: 'left' | 'right'
  ) => {
    updatePlacedModule(placedModule.id, { [field]: pos });
  }, [placedModule.id, updatePlacedModule]);

  // 테마 색상 매핑
  const themeColorMap: Record<string, string> = {
    green: '#10b981',
    blue: '#3b82f6',
    purple: '#8b5cf6',
    vivid: '#a25378',
    red: '#D2042D',
    pink: '#ec4899',
    indigo: '#6366f1',
    teal: '#14b8a6',
    yellow: '#eab308',
    gray: '#6b7280',
    cyan: '#06b6d4',
    lime: '#84cc16',
    black: '#1a1a1a',
    wine: '#845EC2',
    gold: '#d97706',
    navy: '#1e3a8a',
    emerald: '#059669',
    violet: '#C128D7',
    mint: '#0CBA80',
    neon: '#18CF23',
    rust: '#FF7438',
    white: '#D65DB1',
    plum: '#790963',
    brown: '#5A2B1D',
    darkgray: '#2C3844',
    maroon: '#3F0D0D',
    turquoise: '#003A7A',
    slate: '#2E3A47',
    copper: '#AD4F34',
    forest: '#1B3924',
    olive: '#4C462C'
  };

  const selectionHighlightColor = themeColorMap[appTheme.color] || '#3b82f6';
  const highlightPadding = 0.02; // ≒2mm 추가 여유
  const highlightMeshRef = React.useRef<THREE.Mesh>(null);

  // 렌더링 추적 및 클린업
  React.useEffect(() => {
    // 마운트/언마운트 로그 제거 (성능 최적화)
    return () => {
      // 무거운 클린업 제거 - React Three Fiber가 자동으로 처리
    };
  }, [placedModule.id]);

  React.useEffect(() => {
    if (!isSelected) return;
    if (!highlightMeshRef.current) return;
    // 강조용 보조 메쉬는 입력 이벤트에서 제외한다.
    highlightMeshRef.current.raycast = () => null;
    highlightMeshRef.current.traverse(child => {
      child.raycast = () => null;
    });
  }, [isSelected]);

  // 섹션 깊이 변경 추적
  React.useEffect(() => {
    debugLog('🔍 FurnitureItem - placedModule 섹션 깊이 변경:', {
      id: placedModule.id,
      moduleId: placedModule.moduleId,
      lowerSectionDepth: placedModule.lowerSectionDepth,
      upperSectionDepth: placedModule.upperSectionDepth
    });
  }, [placedModule.lowerSectionDepth, placedModule.upperSectionDepth, placedModule.id, placedModule.moduleId]);

  // 테마 색상 가져오기
  const getThemeColor = () => {
    const computedStyle = getComputedStyle(document.documentElement);
    return computedStyle.getPropertyValue('--theme-primary').trim() || '#10b981';
  };

  // 내경 공간 계산 - zone 정보가 있으면 zone별 계산
  let internalSpace = calculateInternalSpace(spaceInfo);
  let zoneSpaceInfo = spaceInfo;

  // zone 자동 감지: placedModule.zone이 없으면 X 위치 기반으로 zone 결정
  let effectiveZone = placedModule.zone;

  // 단내림 활성 여부 (슬롯: droppedCeiling, 자유배치: stepCeiling)
  const hasDroppedZone = spaceInfo.droppedCeiling?.enabled;
  const hasStepZone = spaceInfo.layoutMode === 'free-placement' && spaceInfo.stepCeiling?.enabled;
  const hasAnyDroppedZone = hasDroppedZone || hasStepZone;

  // 단내림이 활성화되어 있고 zone 정보가 없으면 X 위치로 판단
  if (hasAnyDroppedZone && !effectiveZone) {
    const positionXMm = placedModule.position.x * 100;
    const totalWidth = spaceInfo.width;

    if (hasStepZone) {
      // 자유배치: stepCeiling 기반 zone 감지
      const stepPosition = spaceInfo.stepCeiling!.position || 'right';
      const stepWidth = spaceInfo.stepCeiling!.width || 0;
      const dcEnabled = spaceInfo.droppedCeiling?.enabled;
      const dcWidth = dcEnabled ? (spaceInfo.droppedCeiling!.width || 0) : 0;
      const dcPosition = spaceInfo.droppedCeiling?.position || 'right';

      if (stepPosition === 'left') {
        const leftEdge = (dcPosition === 'left' && dcEnabled) ? -totalWidth / 2 + dcWidth : -totalWidth / 2;
        const stepBoundary = leftEdge + stepWidth;
        effectiveZone = positionXMm < stepBoundary ? 'dropped' : 'normal';
      } else {
        const rightEdge = (dcPosition === 'right' && dcEnabled) ? totalWidth / 2 - dcWidth : totalWidth / 2;
        const stepBoundary = rightEdge - stepWidth;
        effectiveZone = positionXMm > stepBoundary ? 'dropped' : 'normal';
      }
    } else if (hasDroppedZone) {
      // 슬롯배치: droppedCeiling 기반 zone 감지
      const droppedPosition = spaceInfo.droppedCeiling!.position;
      const droppedCeilingWidth = spaceInfo.droppedCeiling!.width || 900;

      if (droppedPosition === 'left') {
        const droppedBoundary = -totalWidth / 2 + droppedCeilingWidth;
        effectiveZone = positionXMm < droppedBoundary ? 'dropped' : 'normal';
      } else {
        const droppedBoundary = totalWidth / 2 - droppedCeilingWidth;
        effectiveZone = positionXMm > droppedBoundary ? 'dropped' : 'normal';
      }
    }
  }

  // 단내림이 활성화되고 zone 정보가 있는 경우 영역별 처리
  if (hasAnyDroppedZone && effectiveZone) {
    if (hasStepZone) {
      // 자유배치 stepCeiling: zone별 높이 조정
      const stepWidth = spaceInfo.stepCeiling!.width || 0;
      const dcWidth = spaceInfo.droppedCeiling?.enabled ? (spaceInfo.droppedCeiling!.width || 0) : 0;
      let zoneOuterWidth: number;

      if (effectiveZone === 'dropped') {
        zoneOuterWidth = stepWidth;
      } else {
        zoneOuterWidth = spaceInfo.width - stepWidth - dcWidth;
      }

      zoneSpaceInfo = {
        ...spaceInfo,
        width: zoneOuterWidth,
        zone: effectiveZone
      };

      // stepCeiling의 dropped zone: 높이 조정은 freeHeight에 이미 반영됨
      // normal zone: 전체 높이 기준
      internalSpace = calculateInternalSpace(zoneSpaceInfo);
    } else if (hasDroppedZone) {
      // 슬롯배치: 기존 droppedCeiling 로직
      const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
      const targetZone = effectiveZone === 'dropped' && zoneInfo.dropped ? zoneInfo.dropped : zoneInfo.normal;

      const droppedCeilingWidth = spaceInfo.droppedCeiling?.width || 900;
      let zoneOuterWidth: number;

      if (effectiveZone === 'dropped') {
        zoneOuterWidth = droppedCeilingWidth;
      } else {
        zoneOuterWidth = spaceInfo.width - droppedCeilingWidth;
      }

      zoneSpaceInfo = {
        ...spaceInfo,
        width: zoneOuterWidth,
        zone: effectiveZone
      };

      internalSpace = calculateInternalSpace(zoneSpaceInfo);
      internalSpace.startX = targetZone.startX;
    }
  }

  // 모듈 데이터 가져오기 - zone별 spaceInfo 사용
  // 가구 위치 변경 시 렌더링 업데이트 및 그림자 업데이트
  // Hook은 조건부 return 전에 선언되어야 함
  useEffect(() => {
    invalidate();

    // 3D 모드에서 그림자 강제 업데이트
    if (gl && gl.shadowMap) {
      gl.shadowMap.needsUpdate = true;

      // 메쉬 렌더링 완료 보장을 위한 지연 업데이트
      setTimeout(() => {
        gl.shadowMap.needsUpdate = true;
        invalidate();
      }, 100);

      // 추가로 300ms 후에도 한 번 더 (완전한 렌더링 보장)
      setTimeout(() => {
        gl.shadowMap.needsUpdate = true;
        invalidate();
      }, 300);
    }
  }, [placedModule.position.x, placedModule.position.y, placedModule.position.z, placedModule.id, invalidate, gl]);

  // mm를 Three.js 단위로 변환
  const mmToThreeUnits = (mm: number) => mm * 0.01;

  // 기둥 포함 슬롯 분석 (기둥 변경사항 실시간 반영)
  // Hook은 조건부 return 전에 선언되어야 함
  const columnSlots = React.useMemo(() => {
    return analyzeColumnSlots(spaceInfo, placedModules);
  }, [spaceInfo, spaceInfo.columns, placedModule.id, placedModule.slotIndex, placedModules]);

  // Column C 크기 조절 훅 - 모든 Hook은 조건부 return 전에 호출되어야 함
  // 실제 값은 나중에 계산되므로 여기서는 기본값으로 호출
  const [columnCParams, setColumnCParams] = React.useState({
    isEnabled: false,
    depth: 300,
    width: 600
  });

  const columnCResize = useColumnCResize(
    placedModule,
    columnCParams.isEnabled,
    columnCParams.depth,
    columnCParams.width
  );

  // 위치 변경 로깅용 useEffect - early return 전에 선언
  const [positionLogData, setPositionLogData] = React.useState<any>(null);

  useEffect(() => {
    if (positionLogData) {
    }
  }, [positionLogData]);

  // Column C 파라미터 업데이트를 위한 상태와 useEffect
  const [columnCState, setColumnCState] = React.useState<{
    isEnabled: boolean;
    depth: number;
    width: number;
  } | null>(null);

  React.useEffect(() => {
    if (columnCState) {
      setColumnCParams(columnCState);
    }
  }, [columnCState]);

  // 위치 로깅을 위한 상태와 useEffect
  const [positionState, setPositionState] = React.useState<any>(null);

  React.useEffect(() => {
    if (positionState) {
      setPositionLogData(positionState);
    }
  }, [positionState]);

  // 모든 Hook 선언을 여기에 추가 (조건부 return 이전)
  // 이 Hook들은 나중에 계산되는 변수들을 사용하므로 별도 state로 관리
  const [deferredEffects, setDeferredEffects] = React.useState<{
    columnC?: any;
    position?: any;
  }>({});

  React.useEffect(() => {
    if (deferredEffects.columnC) {
      setColumnCParams(deferredEffects.columnC);
    }
  }, [deferredEffects.columnC]);

  React.useEffect(() => {
    if (deferredEffects.position) {
      setPositionLogData(deferredEffects.position);
    }
  }, [deferredEffects.position]);

  // Column C와 위치 계산을 위한 상태 - 나중에 계산될 값들
  const [calculatedValues, setCalculatedValues] = React.useState<{
    isColumnCFront?: boolean;
    slotInfoColumn?: any;
    indexingColumnWidth?: number;
    adjustedPosition?: any;
    actualModuleData?: any;
  }>({});

  // 계산된 값들이 변경될 때 deferredEffects 업데이트
  React.useEffect(() => {
    if (calculatedValues.isColumnCFront !== undefined) {
      setDeferredEffects({
        columnC: {
          isEnabled: calculatedValues.isColumnCFront,
          depth: calculatedValues.slotInfoColumn?.depth || 300,
          width: calculatedValues.indexingColumnWidth || 600
        },
        position: {
          id: placedModule.id,
          isEditMode,
          placedModulePosition: placedModule.position,
          adjustedPosition: calculatedValues.adjustedPosition,
          positionDifference: calculatedValues.adjustedPosition ? {
            x: calculatedValues.adjustedPosition.x - placedModule.position.x,
            y: calculatedValues.adjustedPosition.y - placedModule.position.y,
            z: calculatedValues.adjustedPosition.z - placedModule.position.z
          } : { x: 0, y: 0, z: 0 },
          zone: placedModule.zone,
          category: calculatedValues.actualModuleData?.category
        }
      });
    }
  }, [calculatedValues, placedModule.id, isEditMode, placedModule.position, placedModule.zone]);

  // 너비에 따라 모듈 ID 생성 (targetModuleId 정의를 getModuleById 호출 전으로 이동)
  let targetModuleId = placedModule.moduleId;

  // 싱글 상하부장 디버깅
  const isUpperCabinet = placedModule.moduleId.includes('upper-cabinet');
  const isLowerCabinet = placedModule.moduleId.includes('lower-');
  const isDualCabinet = placedModule.moduleId.includes('dual-');

  // 카테고리별(키큰장/상부장/하부장 3종) 글로벌 도어 갭 폴백 해석
  // DoorModule과 동일한 우선순위: 개별 가구 값 → 카테고리 글로벌 → 공통 글로벌
  // 하부장은 기본장/도어올림(lower-door-lift-)/상판내림(lower-top-down-) 3종 분리
  const isLowerDoorLift = placedModule.moduleId.includes('lower-door-lift-');
  const isLowerTopDown = placedModule.moduleId.includes('lower-top-down-');
  const globalDoorTopGapForCategory = isUpperCabinet
    ? (spaceInfo.doorTopGapUpper ?? spaceInfo.doorTopGap)
    : isLowerCabinet
      ? (isLowerDoorLift ? (spaceInfo.doorTopGapLowerDoorLift ?? spaceInfo.doorTopGap)
        : isLowerTopDown ? (spaceInfo.doorTopGapLowerTopDown ?? spaceInfo.doorTopGap)
          : (spaceInfo.doorTopGapLower ?? spaceInfo.doorTopGap))
      : (spaceInfo.doorTopGapTall ?? spaceInfo.doorTopGap);
  const globalDoorBottomGapForCategory = isUpperCabinet
    ? (spaceInfo.doorBottomGapUpper ?? spaceInfo.doorBottomGap)
    : isLowerCabinet
      ? (isLowerDoorLift ? (spaceInfo.doorBottomGapLowerDoorLift ?? spaceInfo.doorBottomGap)
        : isLowerTopDown ? (spaceInfo.doorBottomGapLowerTopDown ?? spaceInfo.doorBottomGap)
          : (spaceInfo.doorBottomGapLower ?? spaceInfo.doorBottomGap))
      : (spaceInfo.doorBottomGapTall ?? spaceInfo.doorBottomGap);

  if ((isUpperCabinet || isLowerCabinet) && !isDualCabinet) {
    debugLog('🔍 싱글 상하부장 처리 시작:', {
      original: placedModule.moduleId,
      customWidth: placedModule.customWidth,
      adjustedWidth: placedModule.adjustedWidth,
      internalSpace,
      zoneSpaceInfo
    });
  }

  // adjustedWidth가 있는 경우 (기둥 A 침범) - 원본 모듈 ID 사용
  // 폭 조정은 렌더링 시에만 적용
  if (placedModule.adjustedWidth) {
    // 기둥 A 침범 - 원본 모듈 사용, 폭은 렌더링 시 조정
  }
  // customWidth가 있고 adjustedWidth가 없는 경우 - customWidth로 모듈 ID 생성
  else if (placedModule.customWidth && !placedModule.adjustedWidth) {
    // 상하부장 특별 처리
    const isUpperLower = targetModuleId.includes('upper-cabinet') || targetModuleId.includes('lower-cabinet');

    if (isUpperLower) {
      // 싱글 상하부장의 경우 customWidth를 무조건 적용
      // 이미 customWidth가 포함되어 있어도 다시 설정
      const baseId = targetModuleId.replace(/-\d+$/, '');
      targetModuleId = `${baseId}-${placedModule.customWidth}`;

      if (!isDualCabinet) {
        debugLog('🎯 싱글 상하부장 ID 강제 변경:', {
          original: placedModule.moduleId,
          baseId,
          customWidth: placedModule.customWidth,
          newTargetId: targetModuleId
        });
      }
    } else {
      // 일반 가구: customWidth 기반으로 targetModuleId 재계산
      // baseModuleType이 있으면 사용 (가장 정확), 없으면 정규식으로 추출
      const baseType = placedModule.baseModuleType || targetModuleId.replace(/-[\d.]+$/, '');
      targetModuleId = `${baseType}-${placedModule.customWidth}`;
    }
  }
  // 자유배치 가구: freeWidth 기반으로 targetModuleId 재계산 (customWidth가 없을 때)
  // surroundType 변경으로 internalSpace.width가 바뀌어도 자유배치는 freeWidth가 기준
  else if (placedModule.isFreePlacement && placedModule.freeWidth && !placedModule.customWidth) {
    const baseType = placedModule.baseModuleType || targetModuleId.replace(/-[\d.]+$/, '');
    targetModuleId = `${baseType}-${placedModule.freeWidth}`;
  }

  // === 커스텀 가구 처리 ===
  // 커스텀 가구인 경우 customFurnitureStore에서 데이터를 가져와 ModuleData 생성
  const isCustomFurniture = isCustomFurnitureId(placedModule.moduleId);

  // 도어 위치 고정을 위한 원래 슬롯 정보 계산 - zone별 처리
  // (모듈 검색 로직에서 indexing이 필요하므로 상단으로 이동)
  const indexing = React.useMemo(() => {
    if (spaceInfo.droppedCeiling?.enabled && placedModule.zone) {
      // 단내림이 있을 때는 전체 indexing 정보를 가져와서 zones 포함
      return calculateSpaceIndexing(spaceInfo);
    } else {
      return calculateSpaceIndexing(zoneSpaceInfo);
    }
  }, [spaceInfo, zoneSpaceInfo, placedModule.zone]);

  const zoneSlotInfo = React.useMemo(() => {
    if (!spaceInfo.droppedCeiling?.enabled) {
      return null;
    }
    return ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
  }, [spaceInfo.droppedCeiling?.enabled, spaceInfo.customColumnCount, spaceInfo.width, spaceInfo.installType, spaceInfo.gapConfig, spaceInfo.surroundType]);

  let moduleData: ModuleData | null = null;

  if (isCustomFurniture) {
    // 커스텀 가구: customFurnitureStore에서 데이터 변환
    // 자유배치에서 freeHeight가 있으면 사용 (사용자가 높이를 수동 조정한 경우)
    const custFurnHeight = (placedModule.isFreePlacement && placedModule.freeHeight)
      ? placedModule.freeHeight
      : (internalSpace?.height || zoneSpaceInfo?.height);
    moduleData = createModuleDataFromCustomFurniture(
      placedModule.moduleId,
      getCustomFurnitureById,
      placedModule.customWidth || internalSpace?.width,
      custFurnHeight,
      placedModule.customDepth || internalSpace?.depth || zoneSpaceInfo?.depth,
      spaceInfo.panelThickness ?? 18
    );

    if (moduleData) {
      debugLog('📦 커스텀 가구 ModuleData 생성:', {
        moduleId: placedModule.moduleId,
        moduleData: { id: moduleData.id, dimensions: moduleData.dimensions }
      });
    } else {
      console.warn('커스텀 가구 ModuleData 생성 실패:', placedModule.moduleId);
    }
  } else if (isCustomizableModuleId(placedModule.moduleId)) {
    // 커스터마이징 가구: placedModule의 freeWidth/freeHeight/freeDepth로 ModuleData 생성
    const custCategory = getCustomizableCategory(placedModule.moduleId);
    const custDefaults = CUSTOMIZABLE_DEFAULTS[custCategory];
    const custWidth = placedModule.customWidth || placedModule.adjustedWidth || placedModule.freeWidth || custDefaults.width;

    // freeHeight가 있으면 배치 시 설정된 높이를 그대로 사용 (customConfig와 일치 보장)
    // freeHeight가 없으면 internalSpace.height 또는 기본값 사용
    const fallbackHeight = custCategory === 'full' ? internalSpace.height : custDefaults.height;
    let custHeight = placedModule.freeHeight || fallbackHeight;
    const custDepth = placedModule.freeDepth || custDefaults.depth;
    moduleData = {
      id: placedModule.moduleId,
      name: custDefaults.label,
      category: custCategory as 'full' | 'upper' | 'lower',
      dimensions: { width: custWidth, height: custHeight, depth: custDepth },
      color: '#D4C5A9',
      description: custDefaults.label,
      hasDoor: false,
      isDynamic: false,
      type: 'box' as const,
      defaultDepth: custDepth,
      modelConfig: {
        basicThickness: spaceInfo.panelThickness ?? 18,
        hasOpenFront: true,
        hasShelf: false,
        sections: [],
      },
    };
  } else {
    // 일반 가구: getModuleById 호출
    // 자유배치 가구는 freeWidth/freeHeight/freeDepth 기반으로 internalSpace 보정
    // (surroundType 변경으로 internalSpace가 줄어들어도 모듈을 정확히 매칭)
    if (placedModule.isFreePlacement && placedModule.freeWidth) {
      const fpInternalSpace = {
        width: placedModule.freeWidth,
        height: placedModule.freeHeight || internalSpace.height,
        depth: placedModule.freeDepth || internalSpace.depth,
      };
      moduleData = getModuleById(targetModuleId, fpInternalSpace, zoneSpaceInfo);
    } else {
      moduleData = getModuleById(targetModuleId, internalSpace, zoneSpaceInfo);
    }
  }

  if ((isUpperCabinet || isLowerCabinet) && !isDualCabinet && !isCustomFurniture) {
    debugLog('📌 싱글 상하부장 getModuleById 결과:', {
      targetModuleId,
      moduleDataFound: !!moduleData,
      moduleData: moduleData ? { id: moduleData.id, dimensions: moduleData.dimensions } : null
    });
  }

  // moduleData가 없으면 기본 모듈 ID로 재시도 (커스텀 가구는 제외)
  if (!moduleData && !isCustomFurniture && targetModuleId !== placedModule.moduleId) {
    if ((isUpperCabinet || isLowerCabinet) && !isDualCabinet) {
      debugLog('⚠️ 싱글 상하부장 첫 시도 실패, 원본 ID로 재시도:', placedModule.moduleId);
    }
    // targetModuleId로 모듈을 찾을 수 없음, 원본 ID로 재시도
    moduleData = getModuleById(placedModule.moduleId, internalSpace, zoneSpaceInfo);

    if ((isUpperCabinet || isLowerCabinet) && !isDualCabinet) {
      debugLog('📌 싱글 상하부장 원본 ID 재시도 결과:', {
        moduleDataFound: !!moduleData
      });
    }
  }

  // 그래도 못 찾으면 다양한 패턴으로 재시도 (커스텀 가구는 제외)
  if (!moduleData && !isCustomFurniture) {
    const parts = placedModule.moduleId.split('-');

    // 상하부장 특별 처리
    const isUpperCabinetFallback = placedModule.moduleId.includes('upper-cabinet');
    const isLowerCabinetFallback = placedModule.moduleId.includes('lower-cabinet');

    if (isUpperCabinetFallback || isLowerCabinetFallback) {
      if (!isDualCabinet) {
        debugLog('🚨 싱글 상하부장 모든 시도 실패, 패턴 재시도 시작');
      }

      // 상하부장의 경우 너비를 변경해서 재시도
      // 예: upper-cabinet-shelf-600 -> upper-cabinet-shelf-[슬롯너비]
      if (internalSpace) {
        const baseId = targetModuleId.replace(/-\d+$/, '');

        // 슬롯 너비 우선 사용
        let tryWidth = placedModule.customWidth || internalSpace.width;

        // 슬롯 인덱스가 있고 indexing 정보가 있으면 슬롯 너비 사용
        if (placedModule.slotIndex !== undefined && indexing && indexing.columnWidth) {
          tryWidth = indexing.columnWidth;
          if (!isDualCabinet) {
            debugLog('🔧 싱글 상하부장 슬롯 너비로 시도:', {
              slotIndex: placedModule.slotIndex,
              columnWidth: indexing.columnWidth,
              tryWidth
            });
          }
        }

        const newId = `${baseId}-${tryWidth}`;

        if (!isDualCabinet) {
          debugLog('🔧 싱글 상하부장 시도 ID:', newId);
        }

        moduleData = getModuleById(newId, internalSpace, zoneSpaceInfo);

        // 그래도 못 찾으면 다양한 너비들로 시도
        if (!moduleData) {
          // 슬롯 기반 너비들 먼저 시도
          const tryWidths = [
            placedModule.customWidth,
            indexing?.columnWidth,
            internalSpace.width,
            600, 900, 1200, 1500, 1800
          ].filter(w => w && w > 0);

          // 중복 제거
          const uniqueWidths = [...new Set(tryWidths)];

          for (const width of uniqueWidths) {
            const testId = `${baseId}-${width}`;
            if (!isDualCabinet) {
              debugLog('🔧 싱글 상하부장 너비로 시도:', testId);
            }
            moduleData = getModuleById(testId, internalSpace, zoneSpaceInfo);
            if (moduleData) {
              if (!isDualCabinet) {
                debugLog('✅ 싱글 상하부장 찾음!:', testId);
              }
              break;
            }
          }
        }
      }
    } else {
      // 일반 가구 처리 (기존 로직)
      if (parts.length >= 3) {
        // 마지막이 숫자면 제거하고 시도
        if (/^\d+$/.test(parts[parts.length - 1])) {
          const withoutWidth = parts.slice(0, -1).join('-');
          moduleData = getModuleById(withoutWidth, internalSpace, zoneSpaceInfo);
        }

        // 그래도 없으면 upper/lower 제거하고 시도  
        if (!moduleData && (parts.includes('upper') || parts.includes('lower'))) {
          const withoutCategory = parts.filter(p => p !== 'upper' && p !== 'lower').join('-');
          moduleData = getModuleById(withoutCategory, internalSpace, zoneSpaceInfo);
        }
      }

      // 패턴 2: 기본 타입만으로 시도 (single-open)
      if (!moduleData) {
        const baseType = parts.slice(0, 2).join('-');
        if (baseType !== placedModule.moduleId) {
          moduleData = getModuleById(baseType, internalSpace, zoneSpaceInfo);
        }
      }
    }

    // customWidth 적용
    if (moduleData && placedModule.customWidth) {
      moduleData = {
        ...moduleData,
        dimensions: {
          ...moduleData.dimensions,
          width: placedModule.customWidth
        }
      };
    }
  }

  // 높이 직접 입력이 있으면 moduleData.dimensions.height 오버라이드
  // (커스텀/커스터마이징 가구는 이미 위에서 처리됨, 여기는 표준 모듈용)
  // 슬롯 배치/자유배치 모두 적용 — 사용자가 높이를 수동 변경한 경우
  const isStaleUpperTotalHeight = (value?: number) => {
    if (!moduleData || moduleData.category !== 'upper' || typeof value !== 'number') return false;
    const rounded = Math.round(value);
    const baseFrameHeight = spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 65) : 65;
    return rounded === 850
      || rounded === 868
      || rounded === Math.round(moduleData.dimensions.height + baseFrameHeight)
      || rounded === Math.round(moduleData.dimensions.height + 60)
      || rounded === Math.round(moduleData.dimensions.height + 65);
  };

  const currentGuideSlotBottomClearanceMm = (() => {
    if (!placedModule.guideSlotPlacement) return undefined;
    if (placedModule.hasBase === false) {
      return Math.max(0, placedModule.individualFloatHeight ?? 0);
    }
    if (typeof placedModule.baseFrameHeight === 'number') {
      return Math.max(0, placedModule.baseFrameHeight);
    }
    const isFloatingBase = spaceInfo.baseConfig?.type === 'stand'
      || (spaceInfo.baseConfig?.height ?? 0) <= 0;
    return isFloatingBase
      ? Math.max(0, spaceInfo.baseConfig?.floatHeight ?? 0)
      : Math.max(0, spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 0) : 0);
  })();

  const currentGuideSlotTopClearanceMm = (() => {
    if (!placedModule.guideSlotPlacement) return undefined;
    if (placedModule.hasTopFrame === false) {
      return Math.max(0, placedModule.topFrameGap ?? (spaceInfo.frameSize as any)?.topGap ?? 0);
    }
    return Math.max(0, placedModule.topFrameThickness ?? spaceInfo.frameSize?.top ?? 0);
  })();

  const currentGuideSlotYRangeMm = placedModule.guideSlotPlacement
    && (placedModule.guideSlotZone === 'full' || placedModule.guideSlotZone === 'upper' || placedModule.guideSlotZone === 'lower')
    ? getFreeGuideZoneYRangeMm(placedModule.guideSlotZone, spaceInfo, {
      bottomClearanceMm: currentGuideSlotBottomClearanceMm,
      topClearanceMm: currentGuideSlotTopClearanceMm
    })
    : null;
  const currentGuideSlotHeightMm = currentGuideSlotYRangeMm
    ? Math.max(0, currentGuideSlotYRangeMm.end - currentGuideSlotYRangeMm.start)
    : undefined;

  const validUpperCustomHeight = moduleData?.category === 'upper'
    && placedModule.customHeight
    ? placedModule.customHeight
    : undefined;
  const validFreeHeight = (placedModule.freeHeight
    && !isStaleUpperTotalHeight(placedModule.freeHeight)
    ? placedModule.freeHeight
    : undefined) ?? currentGuideSlotHeightMm;
  const directModuleHeight = moduleData?.category === 'upper'
    ? (validUpperCustomHeight ?? validFreeHeight)
    : validFreeHeight;

  if (moduleData && directModuleHeight
      && !isCustomFurniture && !isCustomizableModuleId(placedModule.moduleId)) {
    moduleData = {
      ...moduleData,
      dimensions: {
        ...moduleData.dimensions,
        height: directModuleHeight,
      },
    };
  }

  // cabinetBodyHeight가 있으면 moduleData.dimensions.height 오버라이드
  // 2단서랍장 반통/한통의 몸통 높이 변경용 (기본 785mm)
  if (moduleData && placedModule.cabinetBodyHeight
      && (placedModule.moduleId.includes('lower-drawer-2tier') || placedModule.moduleId.includes('dual-lower-drawer-2tier'))) {
    moduleData = {
      ...moduleData,
      dimensions: {
        ...moduleData.dimensions,
        height: placedModule.cabinetBodyHeight,
      },
    };
  }

  // moduleData가 없을 때 체크 - 단순 변수로 처리
  const moduleNotFound = !moduleData;

  const convertGlobalToZoneIndex = React.useCallback((
    index: number | undefined,
    zone: 'normal' | 'dropped' | undefined
  ): number | undefined => {
    if (index === undefined || zone === undefined) {
      return index;
    }

    if (!spaceInfo.droppedCeiling?.enabled || !zoneSlotInfo) {
      return index;
    }

    const zoneInfo = zone === 'dropped' ? zoneSlotInfo.dropped : zoneSlotInfo.normal;
    const zoneCount = zoneInfo?.columnCount ?? 0;

    const clampIndex = (value: number): number => {
      if (zoneCount <= 0) {
        return 0;
      }
      if (value < 0) {
        return 0;
      }
      if (value >= zoneCount) {
        return zoneCount - 1;
      }
      return value;
    };

    if (zoneCount > 0 && index >= 0 && index < zoneCount) {
      return index;
    }

    const droppedCount = zoneSlotInfo.dropped?.columnCount ?? 0;
    const normalCount = zoneSlotInfo.normal?.columnCount ?? 0;
    const position = spaceInfo.droppedCeiling.position;

    if (zone === 'normal' && position === 'left') {
      return clampIndex(index - droppedCount);
    }

    if (zone === 'dropped' && position === 'right') {
      return clampIndex(index - normalCount);
    }

    return clampIndex(index);
  }, [spaceInfo.droppedCeiling?.enabled, spaceInfo.droppedCeiling?.position, zoneSlotInfo]);

  const convertZoneToGlobalIndex = React.useCallback((
    index: number | undefined,
    zone: 'normal' | 'dropped' | undefined
  ): number | undefined => {
    if (index === undefined || zone === undefined) {
      return index;
    }

    if (!spaceInfo.droppedCeiling?.enabled || !zoneSlotInfo) {
      return index;
    }

    const zoneInfo = zone === 'dropped' ? zoneSlotInfo.dropped : zoneSlotInfo.normal;
    const zoneCount = zoneInfo?.columnCount ?? 0;

    if (zoneCount > 0 && index >= zoneCount) {
      return index;
    }

    if (zone === 'normal' && spaceInfo.droppedCeiling.position === 'left') {
      return index + (zoneSlotInfo.dropped?.columnCount ?? 0);
    }

    if (zone === 'dropped' && spaceInfo.droppedCeiling.position === 'right') {
      return index + (zoneSlotInfo.normal?.columnCount ?? 0);
    }

    return index;
  }, [spaceInfo.droppedCeiling?.enabled, spaceInfo.droppedCeiling?.position, zoneSlotInfo]);

  const localSlotIndex = React.useMemo(() => {
    if (placedModule.slotIndex === undefined) {
      return undefined;
    }
    return convertGlobalToZoneIndex(placedModule.slotIndex, placedModule.zone as 'normal' | 'dropped');
  }, [placedModule.slotIndex, placedModule.zone, convertGlobalToZoneIndex]);

  const globalSlotIndex = React.useMemo(() => {
    if (placedModule.slotIndex === undefined) {
      return undefined;
    }

    const baseIndex = localSlotIndex !== undefined ? localSlotIndex : placedModule.slotIndex;
    return convertZoneToGlobalIndex(baseIndex, placedModule.zone as 'normal' | 'dropped');
  }, [placedModule.slotIndex, placedModule.zone, localSlotIndex, convertZoneToGlobalIndex]);

  const normalizedSlotIndex = localSlotIndex ?? placedModule.slotIndex;

  const highlightSlotIndex = React.useMemo(() => {
    if (globalSlotIndex !== undefined) {
      return globalSlotIndex;
    }
    if (placedModule.slotIndex !== undefined) {
      return placedModule.slotIndex;
    }
    return normalizedSlotIndex;
  }, [globalSlotIndex, placedModule.slotIndex, normalizedSlotIndex]);

  const shouldGhostHighlight = React.useMemo(() => {
    if (ghostHighlightSlotIndex === null || ghostHighlightSlotIndex === undefined) {
      return false;
    }
    if (viewMode !== '3D') {
      return false;
    }
    if (isLiveDimensionMode || isTapeMeasureMode) {
      return false;
    }
    if (highlightSlotIndex === undefined) {
      return false;
    }
    const isDual = placedModule.isDualSlot || moduleData?.id?.includes('dual-');
    if (isDual) {
      return (
        highlightSlotIndex === ghostHighlightSlotIndex ||
        highlightSlotIndex + 1 === ghostHighlightSlotIndex
      );
    }
    return highlightSlotIndex === ghostHighlightSlotIndex;
  }, [ghostHighlightSlotIndex, viewMode, isLiveDimensionMode, isTapeMeasureMode, highlightSlotIndex, placedModule.isDualSlot, moduleData?.id]);

  const slotInfo = globalSlotIndex !== undefined ? columnSlots[globalSlotIndex] : undefined;

  const groupedFurnitureModules = React.useMemo(() => {
    if (!placedModule.groupId) {
      return [];
    }
    return placedModules
      .filter((module) => module.groupId === placedModule.groupId);
  }, [placedModule.groupId, placedModules]);

  const groupedFurnitureIds = React.useMemo(() => {
    return groupedFurnitureModules.map((module) => module.id);
  }, [groupedFurnitureModules]);

  const isGroupSelected = React.useMemo(() => {
    if (!placedModule.groupId || groupedFurnitureModules.length < 2) {
      return false;
    }
    return groupedFurnitureModules.some(module =>
      selectedFurnitureId === module.id || (selectedFurnitureIds?.includes(module.id) ?? false)
    );
  }, [placedModule.groupId, groupedFurnitureModules, selectedFurnitureId, selectedFurnitureIds]);

  const isLeftmostGroupedFurniture = React.useMemo(() => {
    if (!placedModule.groupId || groupedFurnitureModules.length < 2) {
      return false;
    }
    const leftmost = groupedFurnitureModules.reduce((current, module) =>
      module.position.x < current.position.x ? module : current
    );
    return leftmost.id === placedModule.id;
  }, [placedModule.groupId, groupedFurnitureModules, placedModule.id]);

  const columnActionContext = React.useMemo(() => {
    if (placedModule.isLocked) {
      return undefined;
    }

    if (slotInfo?.hasColumn && slotInfo.column) {
      return { slotInfo, module: placedModule };
    }

    const candidateIds = new Set<string>();
    groupedFurnitureIds.forEach((id) => candidateIds.add(id));

    if ((selectedFurnitureIds?.length ?? 0) >= 2 && selectedFurnitureIds?.includes(placedModule.id)) {
      selectedFurnitureIds?.forEach((id) => candidateIds.add(id));
    }

    for (const id of candidateIds) {
      const module = placedModules.find((item) => item.id === id);
      if (!module || module.isLocked) {
        continue;
      }

      const candidateGlobalSlotIndex = convertZoneToGlobalIndex(
        module.slotIndex,
        module.zone as 'normal' | 'dropped'
      );
      const candidateSlotInfo = candidateGlobalSlotIndex !== undefined
        ? columnSlots[candidateGlobalSlotIndex]
        : undefined;

      if (candidateSlotInfo?.hasColumn && candidateSlotInfo.column) {
        return { slotInfo: candidateSlotInfo, module };
      }
    }

    return undefined;
  }, [
    slotInfo,
    groupedFurnitureIds,
    selectedFurnitureIds,
    placedModule.id,
    placedModule.isLocked,
    placedModules,
    convertZoneToGlobalIndex,
    columnSlots
  ]);
  const columnActionSlotInfo = columnActionContext?.slotInfo;
  const columnActionModule = columnActionContext?.module;
  const usesGroupedColumnAction = !!columnActionContext && columnActionModule?.id !== placedModule.id;
  const shouldRenderColumnActionControls = (
    isSelected ||
    (isGroupSelected && isLeftmostGroupedFurniture && !!columnActionSlotInfo?.hasColumn && !!columnActionSlotInfo.column)
  );

  // 단내림 구간 기둥 디버깅
  if (placedModule.zone === 'dropped' && slotInfo) {
  }

  const slotBoundaries = React.useMemo(() => {
    if (normalizedSlotIndex === undefined) {
      return null;
    }

    if (spaceInfo.droppedCeiling?.enabled && placedModule.zone && zoneSlotInfo) {
      const targetZone = placedModule.zone === 'dropped' ? zoneSlotInfo.dropped : zoneSlotInfo.normal;
      if (targetZone) {
        const slotWidths = targetZone.slotWidths && targetZone.slotWidths.length === targetZone.columnCount
          ? targetZone.slotWidths
          : new Array(targetZone.columnCount).fill(targetZone.columnWidth);

        if (normalizedSlotIndex >= slotWidths.length) {
          return null;
        }

        let accumulated = targetZone.startX;
        for (let i = 0; i < normalizedSlotIndex; i++) {
          accumulated += slotWidths[i];
        }
        const left = accumulated;
        const right = accumulated + slotWidths[normalizedSlotIndex];

        return {
          left: left * 0.01,
          right: right * 0.01
        } as const;
      }
    }

    if (indexing.threeUnitBoundaries && indexing.threeUnitBoundaries.length > normalizedSlotIndex + 1) {
      return {
        left: indexing.threeUnitBoundaries[normalizedSlotIndex],
        right: indexing.threeUnitBoundaries[normalizedSlotIndex + 1]
      } as const;
    }

    return null;
  }, [normalizedSlotIndex, spaceInfo.droppedCeiling?.enabled, placedModule.zone, zoneSlotInfo, indexing.threeUnitBoundaries]);

  const isColumnC = (slotInfo?.columnType === 'medium') || false;

  // 듀얼 → 싱글 변환 확인 (드래그 중이 아닐 때만, 기둥 C가 아닐 때만)
  const actualModuleData = React.useMemo(() => {
    let result = moduleData;
    if (moduleData) {
      // isDualSlot이 true이면 듀얼 가구 유지 (키보드 이동 등으로 명시적으로 배치된 경우)
      if (!isPlacementStructureDragging && slotInfo && slotInfo.hasColumn && !isColumnC && !placedModule.isDualSlot) {
        const conversionResult = convertDualToSingleIfNeeded(moduleData, slotInfo, spaceInfo);
        if (conversionResult.shouldConvert && conversionResult.convertedModuleData) {
          result = conversionResult.convertedModuleData;
        }
      }

      // Column C에서 싱글 가구로 변환 (듀얼 가구가 Column C에 배치된 경우)
      // isDualSlot이 true이면 듀얼 가구 유지
      if (!isPlacementStructureDragging && isColumnC && moduleData.id.includes('dual-') && !placedModule.isDualSlot) {
        result = {
          ...moduleData,
          id: moduleData.id.replace('dual-', 'single-'),
          name: moduleData.name.replace('듀얼', '싱글'),
          dimensions: {
            ...moduleData.dimensions,
            width: slotInfo?.subSlots ?
              (placedModule.subSlotPosition === 'left' ?
                slotInfo.subSlots.left.availableWidth :
                slotInfo.subSlots.right.availableWidth) :
              indexing.columnWidth / 2
          }
        };
      }
    }
    return result;
  }, [moduleData, isPlacementStructureDragging, slotInfo, isColumnC, spaceInfo, placedModule.subSlotPosition, indexing.columnWidth]);

  // 듀얼 가구인지 확인 (가장 먼저 계산)
  // placedModule.isDualSlot이 있으면 그것을 사용, 없으면 모듈 ID로 판단
  const isDualFurniture = placedModule.isDualSlot !== undefined
    ? placedModule.isDualSlot
    : actualModuleData?.id.includes('dual-') || false;
  const isRightCornerCabinet = !!(
    actualModuleData?.id?.includes('right-corner') ||
    placedModule.moduleId?.includes('right-corner')
  );
  const isLeftCornerCabinet = !!(
    actualModuleData?.id?.includes('left-corner') ||
    placedModule.moduleId?.includes('left-corner')
  );
  const isCornerCabinet = isRightCornerCabinet || isLeftCornerCabinet;


  // 상부장/하부장과 인접한 키큰장인지 확인 (actualModuleData가 있을 때만)
  const adjacentCheck = actualModuleData
    ? checkAdjacentUpperLowerToFull(placedModule, placedModules, spaceInfo)
    : { hasAdjacentUpperLower: false, adjacentSide: null };

  // 마지막 슬롯인지 확인 (adjustedPosition 초기화 전에 필요)
  // 단내림이 있으면 zone별 columnCount 사용
  const isLastSlot = normalizedSlotIndex !== undefined
    ? (() => {
      if (spaceInfo.droppedCeiling?.enabled && indexing.zones && placedModule.zone) {
        const zoneData = placedModule.zone === 'dropped' ? indexing.zones.dropped : indexing.zones.normal;
        const totalColumnCount = zoneData?.columnCount ?? indexing.columnCount;

        // 듀얼 가구: 정확히 마지막-1 슬롯에서 시작할 때만 마지막 (두 슬롯 차지하므로)
        const result = isDualFurniture
          ? normalizedSlotIndex === totalColumnCount - 2
          : normalizedSlotIndex === totalColumnCount - 1;


        return result;
      }
      // 단내림 없을 때도 동일 로직 적용
      const result = isDualFurniture
        ? normalizedSlotIndex === indexing.columnCount - 2
        : normalizedSlotIndex === indexing.columnCount - 1;
      return result;
    })()
    : false;

  // adjustedPosition 계산을 useMemo로 최적화 (초기값만 설정)
  const initialAdjustedPosition = React.useMemo(() => {
    const basePosition = { ...(placedModule.position || { x: 0, y: 0, z: 0 }) };
    if (isLastSlot && !isPlacementStructureDragging) {
      // 마지막 슬롯은 originalSlotCenterX를 나중에 계산하므로 여기서는 position 사용
      return { ...(placedModule.position || { x: 0, y: 0, z: 0 }) };
    }
    return basePosition;
  }, [placedModule.position, isLastSlot, isPlacementStructureDragging]);

  // 🔴🔴🔴 Y축 위치 계산 - actualModuleData가 정의된 후에 실행
  // category 기반 체크 (moduleId 패턴 매칭 대신 actualModuleData.category 사용)
  const isUpperCabinetForY = actualModuleData?.category === 'upper';

  // 하부장 체크: category 'lower' (lower-half-cabinet, lower-drawer, lower-door-lift 등 모두 포함)
  const isLowerCabinetForY = actualModuleData?.category === 'lower';

  // 키큰장 체크
  const isTallCabinetForY = actualModuleData?.category === 'full';

  const autoDroppedUpperHeight = React.useMemo(() => {
    const matchesAutoHeight = (value?: number) => {
      if (!isUpperCabinetForY || placedModule.zone !== 'dropped' || typeof value !== 'number') {
        return false;
      }

      const expectedHeights: number[] = [];
      if (spaceInfo.droppedCeiling?.enabled && typeof spaceInfo.droppedCeiling.dropHeight === 'number') {
        const topFrameMm = spaceInfo.frameSize?.top || 0;
        const baseFrameMm = spaceInfo.baseConfig?.height || 0;
        expectedHeights.push(spaceInfo.height - spaceInfo.droppedCeiling.dropHeight - topFrameMm - baseFrameMm);
        expectedHeights.push(calculateInternalSpace({ ...spaceInfo, zone: 'dropped' as const }).height);
      }
      if (spaceInfo.layoutMode === 'free-placement' && spaceInfo.stepCeiling?.enabled) {
        expectedHeights.push(calculateInternalSpace({
          ...spaceInfo,
          height: spaceInfo.height - (spaceInfo.stepCeiling.dropHeight || 0)
        }).height);
      }

      return expectedHeights.some(height => Math.round(height) === Math.round(value));
    };

    return {
      freeHeight: matchesAutoHeight(placedModule.freeHeight),
      customHeight: matchesAutoHeight(placedModule.customHeight),
    };
  }, [isUpperCabinetForY, placedModule.zone, placedModule.freeHeight, placedModule.customHeight, spaceInfo]);

  // adjustedPosition 계산 (Y축 위치 포함)
  let adjustedPosition = initialAdjustedPosition;

  if (isUpperCabinetForY && actualModuleData) {
    // 드래그 중일 때는 position.y 그대로 사용
    if (isDraggingThis) {
      adjustedPosition = {
        ...adjustedPosition,
        y: placedModule.position.y
      };
    } else {
      // 상부장은 상단몰딩 하단에 붙어야 함
      // 자유배치 모드에서는 사용자 지정 높이를 우선 사용
      // 미드웨이 편집: customHeight가 있으면 상단 고정, 하단 확장
      const upperCabinetHeight = (placedModule.customHeight && !autoDroppedUpperHeight.customHeight)
        ? placedModule.customHeight
        : (placedModule.isFreePlacement && placedModule.freeHeight && !autoDroppedUpperHeight.freeHeight && !isStaleUpperTotalHeight(placedModule.freeHeight)
          ? placedModule.freeHeight
          : (currentGuideSlotHeightMm ?? (actualModuleData?.dimensions.height || 0))); // 상부장 높이

      if (currentGuideSlotYRangeMm && placedModule.guideSlotZone === 'upper') {
        adjustedPosition = {
          ...adjustedPosition,
          y: ((currentGuideSlotYRangeMm.start + currentGuideSlotYRangeMm.end) / 2) * 0.01
        };
      } else {

        // 띄워서 배치 모드와 관계없이 상부장은 항상 상단몰딩 하단에 붙어야 함
        // 상단몰딩 OFF: 몰딩 두께가 아니라 사용자가 지정한 상단갭만 천장에서 띄움
        const topFrameHeightMm = placedModule.hasTopFrame === false
          ? (placedModule.topFrameGap ?? 0)
          : (placedModule.topFrameThickness ?? (spaceInfo.frameSize?.top ?? 30));

        // 단내림 구역에 배치된 경우 단내림 높이 사용, 아니면 전체 높이 사용
        const isInDroppedZone = placedModule.zone === 'dropped';
        let ceilingHeight = spaceInfo.height;
        if (isInDroppedZone) {
          if (spaceInfo.layoutMode === 'free-placement' && spaceInfo.stepCeiling?.enabled) {
            // 자유배치: stepCeiling 단내림
            ceilingHeight = spaceInfo.height - (spaceInfo.stepCeiling.dropHeight || 0);
          } else if (spaceInfo.droppedCeiling?.enabled && spaceInfo.droppedCeiling?.dropHeight !== undefined) {
            // 균등배치: droppedCeiling 단내림
            ceilingHeight = spaceInfo.height - spaceInfo.droppedCeiling.dropHeight;
          }
        }

        // 상부장 상단 Y = 천장 높이 - 상단몰딩 높이 (상단몰딩 하단)
        const upperCabinetTopY = ceilingHeight - topFrameHeightMm;
        // 상부장 중심 Y = 상부장 상단 - 상부장 높이/2
        const upperCabinetCenterY = (upperCabinetTopY - upperCabinetHeight / 2) * 0.01;


        adjustedPosition = {
          ...adjustedPosition,
          y: upperCabinetCenterY
        };
      }
    }
  }

  // 가구 높이 계산 (Y 위치 계산 전에 필요)
  // 자유배치 키큰장: freeHeight(사용자 지정) 우선 → 없으면 internalSpace.height(프레임 자동 연동)
  //   + 개별 topFrameThickness delta 보정
  // 자유배치 상/하부장: freeHeight 고정 (프레임 변경과 무관한 독립 높이)
  // 슬롯 기반: actualModuleData.dimensions.height (이미 internalSpace 반영)
  let furnitureHeightMm: number;
  // 자유배치 float: 렌더링 시점에서 floatHeight를 직접 반영
  // freeHeight가 있으면 사용하되, 없거나 갱신 안 됐을 때도 올바르게 계산
  const isStandFloat = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
  const floatHeightMm = isStandFloat ? (spaceInfo.baseConfig?.floatHeight || 0) : 0;
  if (currentGuideSlotHeightMm !== undefined && isTallCabinetForY) {
    furnitureHeightMm = currentGuideSlotHeightMm;
  } else if (placedModule.isFreePlacement && isTallCabinetForY) {
    // freeHeight가 stale(이전 배치모드 값)일 수 있으므로 최대값 제한
    const baseFreeHeight = placedModule.freeHeight || internalSpace.height;
    const maxFreeHeight = internalSpace.height - floatHeightMm;
    furnitureHeightMm = Math.min(baseFreeHeight, maxFreeHeight);
    // 개별 가구 상단몰딩 두께 변경 시 추가 보정
    if (placedModule.topFrameThickness !== undefined) {
      const globalTopFrame = spaceInfo.frameSize?.top ?? 30;
      const topFrameDelta = placedModule.topFrameThickness - globalTopFrame;
      furnitureHeightMm -= topFrameDelta;
    }
    if (placedModule.hasTopFrame === false) {
      const topFrameMm = placedModule.topFrameThickness ?? (spaceInfo.frameSize?.top ?? 30);
      const topGapMm = placedModule.topFrameGap ?? 0;
      furnitureHeightMm += (topFrameMm - topGapMm);
    }
    // 키큰장찬넬(insert-frame)은 채움재이므로 걸레받이 흡수 처리 제외 (바닥 아래로 내려가는 문제 방지)
    const isInsertFrameForFreeHeight = typeof placedModule.moduleId === 'string' && placedModule.moduleId.includes('insert-frame');
    if (placedModule.hasBase === false && !isInsertFrameForFreeHeight) {
      const globalBaseMm = spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 60) : 0;
      const absorbedBase = placedModule.baseFrameHeight ?? globalBaseMm;
      const floatH = placedModule.individualFloatHeight ?? 0;
      furnitureHeightMm += (absorbedBase - floatH);
    }
  } else if (currentGuideSlotHeightMm !== undefined && !placedModule.freeHeight && (isUpperCabinetForY || isLowerCabinetForY)) {
    furnitureHeightMm = currentGuideSlotHeightMm;
  } else if (isUpperCabinetForY && placedModule.customHeight && !autoDroppedUpperHeight.customHeight) {
    furnitureHeightMm = placedModule.customHeight;
  } else if (placedModule.isFreePlacement && placedModule.freeHeight && !(isUpperCabinetForY && (autoDroppedUpperHeight.freeHeight || isStaleUpperTotalHeight(placedModule.freeHeight)))) {
    furnitureHeightMm = placedModule.freeHeight;
  } else {
    // 상부장 미드웨이 편집: customHeight 우선 (상단 고정, 하단만 확장)
    if (isUpperCabinetForY && placedModule.customHeight && !autoDroppedUpperHeight.customHeight) {
      furnitureHeightMm = placedModule.customHeight;
    } else {
      furnitureHeightMm = actualModuleData?.dimensions.height || 0;
    }
    // 슬롯모드: 개별 가구 프레임 높이 변경 시 가구 body 높이 보정
    // freeHeight가 있으면 사용자가 직접 높이를 지정한 것이므로 topFrameThickness delta 보정 불필요
    // (freeHeight 자체에 이미 줄어든 높이가 반영되어 있음 — 이중 차감 방지)
    // freeHeight가 없을 때만 topFrameThickness delta로 보정
    if (!placedModule.isFreePlacement && furnitureHeightMm > 0) {
      // freeHeight가 없을 때만 topFrameThickness delta 보정
      // 단, 걸래받이이 OFF일 때는 그 공간을 가구가 차지하므로 차감하지 않는 delta 계산
      if (!placedModule.freeHeight && placedModule.topFrameThickness !== undefined && isTallCabinetForY) {
        const globalTop = spaceInfo.frameSize?.top ?? 30;
        const topDelta = placedModule.topFrameThickness - globalTop;
        furnitureHeightMm -= topDelta;
      }
      if (placedModule.hasTopFrame === false && isTallCabinetForY) {
        const topFrameMm = placedModule.topFrameThickness ?? (spaceInfo.frameSize?.top ?? 30);
        const topGapMm = placedModule.topFrameGap ?? 0;
        furnitureHeightMm += (topFrameMm - topGapMm);
      }
      // 개별 baseFrameHeight 보정: 키큰장(full)만 적용
      // moduleData.dimensions.height는 글로벌 baseFrame 기준이므로 개별 차이를 반영
      // (CADDimensions2D.tsx computeFurnitureHeightMm과 동일 로직)
      const isStandType = spaceInfo.baseConfig?.type === 'stand';
      if (placedModule.baseFrameHeight !== undefined && !isStandType && isTallCabinetForY) {
        const globalBase = spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 65) : 0;
        furnitureHeightMm -= (placedModule.baseFrameHeight - globalBase);
      }
      // 걸래받이 OFF: 걸래받이 자리를 가구가 흡수 - 띄움만큼은 빈 공간으로 제외
      // 단, 키큰장찬넬(insert-frame)은 채움재이므로 흡수하지 않음 (바닥 아래로 내려가는 문제 방지)
      const isInsertFrameForHeight = typeof placedModule.moduleId === 'string' && placedModule.moduleId.includes('insert-frame');
      if (placedModule.hasBase === false && isTallCabinetForY && !isInsertFrameForHeight) {
        const globalBaseMm = spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 60) : 0;
        const absorbedBase = placedModule.baseFrameHeight ?? globalBaseMm;
        const floatH = placedModule.individualFloatHeight ?? 0;
        furnitureHeightMm += (absorbedBase - floatH);
      }
    }
  }

  // 바닥마감재 적용: 키큰장(full)만 가구 높이에서 차감 (상부 섹션이 흡수)
  // 하부장(lower)/상부장(upper)은 고정 높이이므로 바닥마감재에 의해 줄면 안 됨
  // (하부장은 바닥마감재 위로 Y만 올라감, 높이는 유지)
  {
    const floorFinishForHeight = (spaceInfo.hasFloorFinish && spaceInfo.floorFinish)
      ? spaceInfo.floorFinish.height : 0;
    const guideSlotAlreadyIncludesFloorFinish = !!currentGuideSlotYRangeMm
      && placedModule.guideSlotPlacement === true
      && placedModule.guideSlotZone === 'full';
    if (floorFinishForHeight > 0 && isTallCabinetForY && !guideSlotAlreadyIncludesFloorFinish) {
      furnitureHeightMm -= floorFinishForHeight;
    }
  }

  // 걸래받이 토글 꺼짐 → 가구 높이 유지, Y 위치만 바닥으로 내림 (baseHeightMm=0 처리)
  // furnitureHeightMm는 변경하지 않음 (측판 높이 유지)

  // customSections는 placedModule에 직접 저장된 것만 사용
  // (freeHeight에 의한 비례 조정은 useBaseFurniture에서 modelConfig.sections 자체를 조정)
  // 단, 사용자가 명시한 옷봉선반 갭(upperShelfTopGap)이 있으면
  // 상부 hanging 섹션의 안전선반 위치를 매 렌더링 시 (innerH - gap - t/2)로 재계산.
  // 이렇게 해야 상단몰딩/걸레받이/높이 변경에도 갭이 가구 상판 기준으로 유지됨.
  const adjustedCustomSections = (() => {
    const userGap = (placedModule as any).upperShelfTopGap as number | undefined;
    const removed = !!(placedModule as any).removeUpperSafetyShelf;
    const fallbackSections = (actualModuleData?.modelConfig?.sections as any[] | undefined);
    const rawSections = placedModule.customSections ?? fallbackSections;
    if (!rawSections || !Array.isArray(rawSections) || rawSections.length === 0) return placedModule.customSections;
    const basicThicknessMm = (spaceInfo as any).panelThickness || 18;
    // 안전선반 제거 토글 ON → customSections에서 안전선반(pos>0) 제거
    if (removed) {
      let upperIdxR = -1;
      for (let i = rawSections.length - 1; i >= 0; i--) {
        if ((rawSections[i] as any).type === 'hanging') { upperIdxR = i; break; }
      }
      if (upperIdxR < 0) return placedModule.customSections;
      const next = rawSections.map((sec, idx) => {
        if (idx !== upperIdxR) return sec;
        const pos = Array.isArray((sec as any).shelfPositions) ? (sec as any).shelfPositions : [];
        const filtered = pos.filter((p: number) => p <= 0);
        const out: any = { ...sec, shelfPositions: filtered };
        if ((sec as any).count === 1 && pos.some((p: number) => p > 0) && filtered.length === 0) {
          delete out.count;
        }
        return out;
      });
      return next;
    }
    if (typeof userGap !== 'number') return placedModule.customSections;
    // 마지막 hanging 섹션 인덱스
    let upperIdx = -1;
    for (let i = rawSections.length - 1; i >= 0; i--) {
      if ((rawSections[i] as any).type === 'hanging') { upperIdx = i; break; }
    }
    if (upperIdx < 0) return placedModule.customSections;
    const upper = rawSections[upperIdx] as any;
    const shelfPositions = Array.isArray(upper.shelfPositions) ? [...upper.shelfPositions] : [];
    let safetyIdx = shelfPositions.findIndex((p: number) => p > 0);
    // 안전선반이 아직 없으면 추가 가능하도록 인덱스 끝에 자리 확보
    let appendNew = false;
    if (safetyIdx < 0) {
      appendNew = true;
      safetyIdx = shelfPositions.length;
    }
    // SectionsRenderer의 calculatedHeight (섹션 전체 높이, 상/하판 포함)
    let sectionFullH: number;
    if (upperIdx === rawSections.length - 1) {
      const prev = rawSections.slice(0, upperIdx).reduce((s, sec: any) => s + (sec.height || 0), 0);
      sectionFullH = Math.max(0, furnitureHeightMm - prev);
    } else {
      sectionFullH = Math.max(0, upper.height || 0);
    }
    // ShelfRenderer: 갭 = (sectionFullH - 2t) - positionMm - t/2 (선반 윗면 ~ 상판 아랫면)
    // → positionMm = sectionFullH - 2t - userGap - t/2 = sectionFullH - userGap - 2.5t
    // 단 useBaseFurniture가 preserveUpperSafetyShelfGap로 비례 조정 시
    // currentGap = section.height-2t - pos - t/2 식을 쓰므로,
    // section.height도 sectionFullH로 갱신하여 비례 조정이 작동하지 않도록 함.
    const nextShelfPos = Math.max(0, Math.round((sectionFullH - 2 * basicThicknessMm) - userGap - basicThicknessMm / 2));
    if (!appendNew && nextShelfPos === shelfPositions[safetyIdx] && (upper.height === sectionFullH)) {
      return placedModule.customSections;
    }
    shelfPositions[safetyIdx] = nextShelfPos;
    return rawSections.map((sec, idx) => idx === upperIdx
      ? { ...sec, shelfPositions, height: sectionFullH }
      : sec);
  })();

  // 하부장과 키큰장의 띄워서 배치 처리
  if ((isLowerCabinetForY || isTallCabinetForY) && actualModuleData) {
    // 드래그 중일 때는 position.y 그대로 사용
    if (isDraggingThis) {
      adjustedPosition = {
        ...adjustedPosition,
        y: placedModule.position.y
      };
    } else {
      if (currentGuideSlotYRangeMm && (placedModule.guideSlotZone === 'full' || placedModule.guideSlotZone === 'lower')) {
        const hasUserHeight = placedModule.isFreePlacement
          && typeof placedModule.freeHeight === 'number'
          && placedModule.freeHeight > 0;
        const centerY = hasUserHeight
          ? (currentGuideSlotYRangeMm.start + furnitureHeightMm / 2) * 0.01
          : ((currentGuideSlotYRangeMm.start + currentGuideSlotYRangeMm.end) / 2) * 0.01;
        adjustedPosition = {
          ...adjustedPosition,
          y: centerY
        };
      } else {
        // 띄워서 배치 확인 - placementType이 명시적으로 'float'이고 type이 'stand'일 때만
        const isFloatPlacement = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';

        if (isFloatPlacement) {
          const floorFinishHeightMm = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ?
            spaceInfo.floorFinish.height : 0;
          const floorFinishHeight = floorFinishHeightMm * 0.01; // mm to Three.js units
          const floatHeightMm = spaceInfo.baseConfig?.floatHeight || 0;
          const floatHeight = floatHeightMm * 0.01; // mm to Three.js units
          // 클램핑된 furnitureHeightMm 사용 (띄움배치 시 높이 축소 반영)
          const furnitureHeight = furnitureHeightMm * 0.01; // mm to Three.js units

          if (isLowerCabinetForY) {
            // 하부장은 띄움 높이만큼 전체가 떠야 함 (바닥마감재는 조절발로 흡수)
            const yPos = floatHeight + (furnitureHeight / 2);

            adjustedPosition = {
              ...adjustedPosition,
              y: yPos
            };
          } else {
            // 키큰장: 하부장과 동일하게 띄움 높이만큼 전체가 떠야 함 (바닥마감재는 조절발로 흡수)
            const yPos = floatHeight + (furnitureHeight / 2);

            adjustedPosition = {
              ...adjustedPosition,
              y: yPos
            };
          }
        } else {
          // 일반 배치 (받침대 있거나 바닥 배치)
          // 기본적으로 받침대 높이 65mm 적용, stand 타입일 때만 0
          // 바닥판 올림(bottomPanelRaise) 활성 시 조절발 높이를 0으로 → 가구 전체가 바닥으로 내려감
          // customConfig.sections에서 bottomPanelRaise 확인 (customSections가 아닌 customConfig가 실제 데이터 소스)
          const configSections = placedModule.customConfig?.sections;
          const bottomRaiseActive = configSections?.[0]?.bottomPanelRaise && configSections[0].bottomPanelRaise > 0;
          const isLowerModBase = placedModule.moduleId?.startsWith('lower-') || placedModule.moduleId?.includes('-lower-');
          // 키큰장찬넬(insert-frame)은 채움재이므로 걸레받이 OFF 영향을 받지 않음 (바닥 아래로 내려가는 문제 방지)
          const isInsertFrameForBase = typeof placedModule.moduleId === 'string' && placedModule.moduleId.includes('insert-frame');
          const effectiveHasBaseFalse = !isInsertFrameForBase && placedModule.hasBase === false;
          const baseHeightMm = bottomRaiseActive ? 0 : (spaceInfo.baseConfig?.type === 'stand' ? 0 : (effectiveHasBaseFalse ? 0 : (placedModule.baseFrameHeight ?? spaceInfo.baseConfig?.height ?? (isLowerModBase ? 105 : 60))));
          // 걸래받이 OFF + 개별 띄움 높이
          const indivFloatMm = effectiveHasBaseFalse ? (placedModule.individualFloatHeight ?? 0) : 0;
          const baseHeight = (baseHeightMm + indivFloatMm) * 0.01; // mm to Three.js units

          // 바닥 마감재 높이
          const floorFinishHeightMm = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ?
            spaceInfo.floorFinish.height : 0;
          const floorFinishHeight = floorFinishHeightMm * 0.01; // mm to Three.js units

          // 가구 높이 (단내림 구간에서 조정된 높이 사용)
          const furnitureHeight = furnitureHeightMm * 0.01; // mm to Three.js units

          // Y 위치 계산: 바닥마감재높이 + 받침대높이(+개별띄움) + 가구높이/2
          const yPos = floorFinishHeight + baseHeight + (furnitureHeight / 2);
          adjustedPosition = {
            ...adjustedPosition,
            y: yPos
          };
        }
      }
    }
  }

  // 기둥 침범 상황 확인 및 가구/도어 크기 조정
  // customWidth는 슬롯 기반 너비 조정 시 사용, adjustedWidth는 기둥 침범 시 사용
  // 듀얼 가구는 customWidth가 올바른지 확인 필요
  let furnitureWidthMm = actualModuleData?.dimensions.width || 0; // 기본값

  // 자유배치 모드에서는 freeWidth를 최우선 사용한다.
  // customWidth가 이전 편집값으로 남아 있어도 2D 치수 입력으로 줄인 폭을 덮어쓰면 안 된다.
  if (placedModule.isFreePlacement && placedModule.freeWidth) {
    furnitureWidthMm = placedModule.freeWidth;
  } else if (
    (placedModule.placementWall === 'left' || placedModule.placementWall === 'right') &&
    typeof (placedModule as any).sideLogicalWidth === 'number'
  ) {
    furnitureWidthMm = (placedModule as any).sideLogicalWidth;
  } else if (!placedModule.isFreePlacement && placedModule.adjustedWidth !== undefined && placedModule.adjustedWidth !== null) {
    // adjustedWidth가 있으면 최우선 사용 (기둥 침범 케이스) - 자유배치는 제외
    furnitureWidthMm = placedModule.adjustedWidth;
  } else if (!placedModule.isFreePlacement && placedModule.slotCustomWidth !== undefined) {
    // slotCustomWidth: 슬롯 모드 사용자 지정 너비 (adjustedWidth 다음 우선순위)
    furnitureWidthMm = placedModule.slotCustomWidth;
  } else if (placedModule.customWidth !== undefined && placedModule.customWidth !== null) {
    // customWidth가 있지만 기둥도 있으면 기둥 조정 우선
    if (shouldApplyColumnAdjustment && slotInfo && slotInfo.hasColumn && slotInfo.column && slotBoundaries) {
      const originalSlotBounds = {
        left: slotBoundaries.left,
        right: slotBoundaries.right,
        center: (slotBoundaries.left + slotBoundaries.right) / 2
      };

      const furnitureBounds = calculateFurnitureBounds(slotInfo, originalSlotBounds, spaceInfo);
      furnitureWidthMm = furnitureBounds.renderWidth;

    } else {
      // 기둥이 없으면 customWidth 사용
      furnitureWidthMm = placedModule.customWidth;
    }
  } else {
    // 기본값 사용 전에 기둥이 있는지 확인

    // 기둥이 있으면 calculateFurnitureBounds로 조정된 너비 계산
    if (shouldApplyColumnAdjustment && slotInfo && slotInfo.hasColumn && slotInfo.column && slotBoundaries) {
      const slotWidthM = indexing.columnWidth * 0.01;
      const originalSlotBounds = {
        left: slotBoundaries.left,
        right: slotBoundaries.right,
        center: (slotBoundaries.left + slotBoundaries.right) / 2
      };

      const furnitureBounds = calculateFurnitureBounds(slotInfo, originalSlotBounds, spaceInfo);
      furnitureWidthMm = furnitureBounds.renderWidth;

    } else if (placedModule.slotIndex !== undefined && indexing.slotWidths?.[placedModule.slotIndex]) {
      // 기둥이 없으면 슬롯 너비 사용 (이격거리가 반영된 실제 슬롯 너비)
      const slotWidth = indexing.slotWidths[placedModule.slotIndex];
      const isDual = placedModule.isDualSlot || placedModule.moduleId.startsWith('dual-');
      
      if (isDual) {
        // 듀얼 가구인 경우 현재 슬롯과 다음 슬롯의 너비를 합산
        const nextSlotWidth = indexing.slotWidths[placedModule.slotIndex + 1] || slotWidth;
        furnitureWidthMm = slotWidth + nextSlotWidth;
      } else {
        furnitureWidthMm = slotWidth;
      }
    }
    // slotIndex도 없으면 기본값 그대로 사용 (이미 위에서 설정됨)
  }


  // 듀얼 가구 렌더링 너비 확인용 로그 제거 (성능)
  // if (placedModule.isDualSlot || placedModule.moduleId.startsWith('dual-')) {
  //   console.log('📐 [렌더링너비]', { ... });
  // }

  // 기둥에 의한 자동 깊이 조정을 위한 플래그와 값 저장
  // customWidth가 있어도 기둥이 있으면 깊이 조정 필요
  let autoAdjustedDepthMm: number | null = null;
  if (shouldApplyColumnAdjustment && slotInfo && slotInfo.hasColumn && slotInfo.column && slotBoundaries) {
    const columnDepth = slotInfo.column.depth;
    // Column C (300mm)의 경우 깊이 조정 필요
    if (columnDepth === 300 && furnitureWidthMm === indexing.columnWidth) {
      autoAdjustedDepthMm = 730 - columnDepth; // 430mm
    }
  }

  // 엔드패널 조정 전 원래 너비 저장 (엔드패널 조정 시 사용)
  let originalFurnitureWidthMm = furnitureWidthMm;

  // 표준 모듈: EP 물리적 두께(PET 18mm)만큼 가구 본체 너비 축소
  // 내치(inside, 기본): EP만큼 본체를 줄여 전체 외곽 폭 유지.
  // 외치(outside): 본체를 줄이지 않음 → 본체 바깥에 EP가 붙어 전체 폭이 EP만큼 늘어남.
  if (!placedModule.customConfig && placedModule.endPanelMode !== 'outside') {
    const epThk = resolvePetPanelThicknessMm(placedModule.endPanelThickness) || END_PANEL_RENDER_THICKNESS;
    if (placedModule.hasLeftEndPanel) furnitureWidthMm -= epThk;
    if (placedModule.hasRightEndPanel) furnitureWidthMm -= epThk;
  }

  // 너비 줄임 여부 저장 (위치 조정에서 사용)
  let widthReduced = false;

  // 슬롯 가이드와의 크기 비교 로그
  if (indexing.slotWidths && normalizedSlotIndex !== undefined) {
    const slotGuideWidth = isDualFurniture && normalizedSlotIndex < indexing.slotWidths.length - 1
      ? indexing.slotWidths[normalizedSlotIndex] + indexing.slotWidths[normalizedSlotIndex + 1]
      : indexing.slotWidths[normalizedSlotIndex];

  }

  // 키큰장인지 확인 (2hanging이 포함된 모듈 ID)
  const isTallCabinet = actualModuleData?.id?.includes('2hanging') || false;

  // 키큰장 엔드패널 처리
  let adjustedWidthForEndPanel = furnitureWidthMm;
  let positionAdjustmentForEndPanel = 0; // 위치 조정값

  // 키큰장이 상하부장과 인접한 경우 확인
  // 노서라운드/서라운드 무관하게 무조건 엔드패널 필요 (높이 차이를 메우기 위함)
  const needsEndPanelAdjustment = adjacentCheck.hasAdjacentUpperLower;
  const endPanelSide = adjacentCheck.adjacentSide;


  // 🔴🔴🔴 엔드패널 디버깅 - 키큰장일 때만
  if (actualModuleData?.category === 'full') {
  }

  // 노서라운드 첫/마지막 슬롯 여부 확인 (상하부장 처리에서 사용)
  // 세미스탠딩도 프리스탠딩과 동일하게 처리
  // 세미스탠딩의 경우 벽이 없는 쪽 슬롯만 해당
  const isSemiStanding = spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing';
  const hasLeftWall = spaceInfo.wallConfig?.left;
  const hasRightWall = spaceInfo.wallConfig?.right;

  // 노서라운드 첫 슬롯: zone별 첫 슬롯 (zone 내 인덱스 0)
  // 단내림 경계 슬롯 체크 (메인구간과 단내림구간 사이의 안쪽 슬롯만 경계)
  const isAtDroppedBoundary = spaceInfo.droppedCeiling?.enabled && indexing.zones && placedModule.zone && (() => {
    const droppedPosition = spaceInfo.droppedCeiling.position;

    if (droppedPosition === 'right') {
      // 단내림 오른쪽: 메인구간 마지막 슬롯만 경계 (단내림 첫 슬롯은 경계 아님)
      if (placedModule.zone === 'normal') {
        return isLastSlot;
      } else {
        return false; // 단내림구간은 경계 없음
      }
    } else {
      // 단내림 왼쪽: 메인구간 첫 슬롯만 경계 (단내림 마지막 슬롯은 경계 아님)
      if (placedModule.zone === 'normal') {
        return normalizedSlotIndex === 0;
      } else {
        return false; // 단내림구간은 경계 없음
      }
    }
  })();

  const isNoSurroundFirstSlot = spaceInfo.surroundType === 'no-surround' &&
    ((spaceInfo.installType === 'freestanding') ||
      (isSemiStanding && !hasLeftWall)) && // 세미스탠딩에서 왼쪽 벽이 없는 경우
    !isAtDroppedBoundary && // 경계 슬롯 제외
    (() => {
      // 단내림이 있으면 zone별 바깥쪽 끝 첫 슬롯 확인
      if (spaceInfo.droppedCeiling?.enabled && placedModule.zone && zoneSlotInfo) {
        const droppedPosition = spaceInfo.droppedCeiling.position;
        const localIndex = localSlotIndex ?? placedModule.slotIndex;

        if (placedModule.zone === 'dropped') {
          // 단내림 왼쪽: 단내림구간 첫 슬롯(0)이 바깥쪽 끝 (단, 한쪽벽에서 왼쪽벽이 있으면 제외)
          // 단내림 오른쪽: 단내림구간 첫 슬롯(0)은 안쪽 경계
          if (droppedPosition === 'left') {
            // 한쪽벽에서 왼쪽벽이 있으면 바깥쪽 끝이 아님
            if (isSemiStanding && hasLeftWall) return false;
            return localIndex === 0;
          }
          return false;
        } else {
          // 메인구간: zone 첫 슬롯 (단, 한쪽벽에서 왼쪽벽이 있으면 제외)
          if (isSemiStanding && hasLeftWall) return false;
          return localIndex === 0;
        }
      }
      // 단내림이 없으면 전체 첫 슬롯
      return normalizedSlotIndex === 0;
    })();

  // 노서라운드 마지막 슬롯: zone별 바깥쪽 끝 마지막 슬롯
  let isNoSurroundLastSlot = spaceInfo.surroundType === 'no-surround' &&
    ((spaceInfo.installType === 'freestanding') ||
      (isSemiStanding && !hasRightWall)) && // 세미스탠딩에서 오른쪽 벽이 없는 경우
    !isAtDroppedBoundary && // 경계 슬롯 제외
    (() => {
      // 단내림이 있으면 zone별 바깥쪽 끝 마지막 슬롯 확인
      if (spaceInfo.droppedCeiling?.enabled && placedModule.zone && zoneSlotInfo) {
        const droppedPosition = spaceInfo.droppedCeiling.position;
        const targetZone = placedModule.zone === 'dropped' ? zoneSlotInfo.dropped : zoneSlotInfo.normal;
        const localIndex = localSlotIndex ?? placedModule.slotIndex;
        const zoneColumnCount = targetZone?.columnCount ?? indexing.columnCount;

        if (placedModule.zone === 'dropped') {
          // 단내림 왼쪽: 단내림구간 마지막 슬롯은 안쪽 경계
          // 단내림 오른쪽: 단내림구간 마지막 슬롯이 바깥쪽 끝 (단, 한쪽벽에서 오른쪽벽이 있으면 제외)
          if (droppedPosition === 'right') {
            // 한쪽벽에서 오른쪽벽이 있으면 바깥쪽 끝이 아님
            if (isSemiStanding && hasRightWall) return false;
            return localIndex === zoneColumnCount - 1;
          }
          return false;
        } else {
          // 메인구간: zone 마지막 슬롯 (단, 한쪽벽에서 오른쪽벽이 있으면 제외)
          // 단내림 좌측: 메인구간은 바깥쪽 끝이 아님 (좌측에 있는 단내림 구간이 바깥쪽)
          if (droppedPosition === 'left') return false;
          if (isSemiStanding && hasRightWall) return false;
          return localIndex === zoneColumnCount - 1;
        }
      }
      // 단내림이 없으면 isLastSlot 사용
      return isLastSlot;
    })();

  // 듀얼 가구가 전체 공간의 맨 마지막 슬롯에 있는 경우 (바깥쪽 끝)
  let isNoSurroundDualLastSlot = spaceInfo.surroundType === 'no-surround' &&
    ((spaceInfo.installType === 'freestanding') ||
      (isSemiStanding && !hasRightWall)) && // 세미스탠딩에서 오른쪽 벽이 없는 경우
    isDualFurniture &&
    (() => {
      // 단내림이 있으면 dropped zone의 마지막에서 두번째 슬롯만 체크 (전체 공간의 바깥쪽 끝)
      if (spaceInfo.droppedCeiling?.enabled && placedModule.zone && zoneSlotInfo) {
        if (placedModule.zone === 'dropped' && zoneSlotInfo.dropped) {
          const localIndex = localSlotIndex ?? placedModule.slotIndex;
          const zoneColumnCount = zoneSlotInfo.dropped.columnCount ?? indexing.columnCount;
          return localIndex === zoneColumnCount - 2;
        }
        // normal zone은 전체 공간의 바깥쪽 끝이 아니므로 false
        return false;
      }
      // 단내림이 없으면 전체 마지막에서 두번째 슬롯
      return normalizedSlotIndex === indexing.columnCount - 2;
    })();

  // 서라운드 모드: 단내림구간 바깥쪽 끝 슬롯 확인
  const isSurroundDroppedEdgeSlot = spaceInfo.surroundType === 'surround' &&
    (spaceInfo.installType === 'freestanding' || isSemiStanding) &&
    spaceInfo.droppedCeiling?.enabled &&
    placedModule.zone === 'dropped' &&
    !isAtDroppedBoundary &&
    (() => {
      if (zoneSlotInfo?.dropped) {
        const localIndex = localSlotIndex ?? placedModule.slotIndex;
        const zoneColumnCount = zoneSlotInfo.dropped.columnCount ?? indexing.columnCount;
        // 한쪽벽일 때: 오른쪽 벽이 없으면 오른쪽 끝만, 왼쪽 벽이 없으면 왼쪽 끝만
        if (isSemiStanding) {
          if (!hasRightWall) {
            // 듀얼: 마지막에서 두번째, 싱글: 마지막
            return isDualFurniture
              ? localIndex === zoneColumnCount - 2
              : localIndex === zoneColumnCount - 1;
          } else if (!hasLeftWall) {
            return localIndex === 0;
          }
          return false;
        }
        // 프리스탠딩: 양쪽 끝 모두
        if (isDualFurniture) {
          // 듀얼: 첫슬롯 또는 마지막에서 두번째 슬롯
          return localIndex === 0 || localIndex === zoneColumnCount - 2;
        }
        return localIndex === 0 || localIndex === zoneColumnCount - 1;
      }
      return false;
    })();

  // 듀얼 가구: 바깥쪽 끝 슬롯만 엔드패널만큼 줄임
  // - 노서라운드: 바깥쪽 끝 슬롯(첫/마지막)만
  // - 서라운드: 단내림 구간 바깥쪽 끝 슬롯만
  // - 한쪽벽(semistanding)도 프리스탠딩과 동일하게 처리
  // - 단, 상하부장이 인접한 경우는 제외 (키큰장 로직에서 별도 처리)
  // 노서라운드 EP 자동 생성 제거됨 — 서라운드 단내림 끝 슬롯만 처리
  const shouldReduceWidth = isDualFurniture && (spaceInfo.installType === 'freestanding' || isSemiStanding) && !needsEndPanelAdjustment && (
    isSurroundDroppedEdgeSlot
  );

  if (shouldReduceWidth) {
    furnitureWidthMm = furnitureWidthMm - END_PANEL_THICKNESS;
    widthReduced = true;
  }


  // 키큰장이 상하부장과 인접했을 때 - 너비 조정 및 위치 이동
  const hasColumnInSlot = !!(slotInfo && slotInfo.hasColumn && slotInfo.column);

  if (needsEndPanelAdjustment && endPanelSide && !hasColumnInSlot) {
    // 노서라운드 첫/마지막 슬롯에서는 특별 처리
    if (isNoSurroundFirstSlot || isNoSurroundLastSlot || isNoSurroundDualLastSlot) {
      // 노서라운드에서는 바깥쪽 엔드패널 18mm + 안쪽 상하부장 엔드패널 18mm = 총 36mm 줄임
      if (endPanelSide === 'left') {
        // 마지막 슬롯에서 왼쪽 상하부장: 총 36mm 줄이고 위치는 중앙 유지
        adjustedWidthForEndPanel = originalFurnitureWidthMm - (END_PANEL_THICKNESS * 2); // 36mm 줄임
        // 위치는 이동하지 않음 (슬롯 중앙 유지)
        positionAdjustmentForEndPanel = 0;
      } else if (endPanelSide === 'right') {
        // 첫번째 슬롯에서 오른쪽 상하부장: 총 36mm 줄이고 위치는 중앙 유지
        adjustedWidthForEndPanel = originalFurnitureWidthMm - (END_PANEL_THICKNESS * 2); // 36mm 줄임
        // 위치는 이동하지 않음 (슬롯 중앙 유지)
        positionAdjustmentForEndPanel = 0;
      } else if (endPanelSide === 'both') {
        // 양쪽 상하부장: 54mm 줄이고 중앙 유지 (바깥쪽 18mm + 양쪽 안쪽 36mm)
        adjustedWidthForEndPanel = originalFurnitureWidthMm - (END_PANEL_THICKNESS * 3);
        positionAdjustmentForEndPanel = 0;
      }
    } else {
      // 일반적인 경우: 엔드패널 두께만큼 키큰장 너비를 줄이고 상하부장 반대쪽으로 이동
      if (endPanelSide === 'left') {
        // 왼쪽에 상하부장이 있으면 18mm 줄이고 오른쪽으로 9mm 이동 (엔드패널 공간 확보)
        adjustedWidthForEndPanel = originalFurnitureWidthMm - END_PANEL_THICKNESS;
        positionAdjustmentForEndPanel = (END_PANEL_THICKNESS / 2) * 0.01; // 오른쪽으로 9mm 이동
      } else if (endPanelSide === 'right') {
        // 오른쪽에 상하부장이 있으면 18mm 줄이고 왼쪽으로 9mm 이동 (엔드패널 공간 확보)
        adjustedWidthForEndPanel = originalFurnitureWidthMm - END_PANEL_THICKNESS;
        positionAdjustmentForEndPanel = -(END_PANEL_THICKNESS / 2) * 0.01; // 왼쪽으로 9mm 이동
      } else if (endPanelSide === 'both') {
        // 양쪽에 상하부장이 있으면 36mm 줄이고 중앙 유지
        adjustedWidthForEndPanel = originalFurnitureWidthMm - (END_PANEL_THICKNESS * 2);
        positionAdjustmentForEndPanel = 0;
      }
    }

    furnitureWidthMm = adjustedWidthForEndPanel; // 실제 가구 너비 업데이트
  }

  // 노서라운드 모드에서 엔드패널 자동 처리 비활성화
  // 벽없음 시 EP 자동 생성 기능 제거됨
  if (false && spaceInfo.surroundType === 'no-surround' &&
    (spaceInfo.installType === 'freestanding' ||
      spaceInfo.installType === 'semistanding' ||
      spaceInfo.installType === 'semi-standing') &&
    normalizedSlotIndex !== undefined) {

    // 프리스탠딩에서는 양쪽 모두, 세미스탠딩에서는 벽이 없는 쪽만 처리
    let shouldProcessFirstSlot = false;
    let shouldProcessLastSlot = false;

    // 단내림이 있을 때, 경계면 슬롯인지 확인 (공간 전체의 끝이 아닌 경계면)
    const isAtBoundary = spaceInfo.droppedCeiling?.enabled && indexing.zones && placedModule.zone && (() => {
      const droppedPosition = spaceInfo.droppedCeiling.position;
      const isDual = placedModule.isDualSlot || false;
      const currentZoneData = placedModule.zone === 'dropped' ? indexing.zones?.dropped : indexing.zones?.normal;
      let result = false;

      if (droppedPosition === 'right') {
        // 단내림이 오른쪽: 메인구간 마지막 슬롯만 경계 (안쪽)
        // 단내림구간 첫 슬롯은 경계 (안쪽), 마지막 슬롯은 바깥쪽이므로 경계 아님
        if (placedModule.zone === 'normal') {
          if (isDual && normalizedSlotIndex !== undefined) {
            // 듀얼 가구: 끝 슬롯(slotIndex+1)이 zone 마지막인지 체크
            const endSlotIndex = normalizedSlotIndex + 1;
            const zoneLastIndex = (currentZoneData?.columnCount ?? indexing.columnCount) - 1;
            result = isLastSlot || (endSlotIndex === zoneLastIndex);
          } else {
            // 싱글 가구: 시작 슬롯이 마지막인지만 체크
            result = isLastSlot;
          }
        } else if (placedModule.zone === 'dropped') {
          // 단내림구간: 첫 슬롯(index 0)만 경계 (안쪽)
          // 마지막 슬롯은 바깥쪽이므로 엔드패널 필요
          result = normalizedSlotIndex === 0;
        }
      } else {
        // 단내림이 왼쪽: 메인구간 첫 슬롯만 경계 (안쪽)
        // 단내림구간 마지막 슬롯은 경계 (안쪽), 첫 슬롯은 바깥쪽이므로 경계 아님
        if (placedModule.zone === 'normal') {
          if (isDual && normalizedSlotIndex !== undefined) {
            // 듀얼 가구: 시작 슬롯이 0 또는 1이면 경계
            result = normalizedSlotIndex === 0 || normalizedSlotIndex === 1;
          } else {
            // 싱글 가구
            result = normalizedSlotIndex === 0;
          }
        } else if (placedModule.zone === 'dropped') {
          // 단내림구간: 마지막 슬롯만 경계 (안쪽)
          // 첫 슬롯은 바깥쪽이므로 엔드패널 필요
          result = isLastSlot;
        }
      }

      return result;
    })();

    if (spaceInfo.installType === 'freestanding') {
      // 프리스탠딩: 양쪽 모두 처리 (단, 경계면 슬롯은 제외)
      shouldProcessFirstSlot = normalizedSlotIndex === 0 && !isAtBoundary;
      shouldProcessLastSlot = isLastSlot && !isAtBoundary;
    } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
      // 세미스탠딩: 벽이 없는 쪽만 처리 (단, 경계면 슬롯은 제외)
      shouldProcessFirstSlot = normalizedSlotIndex === 0 && !spaceInfo.wallConfig?.left && !isAtBoundary;
      shouldProcessLastSlot = isLastSlot && !spaceInfo.wallConfig?.right && !isAtBoundary;
    }


    // zone별 columnCount와 zone 내 로컬 인덱스 계산 (듀얼 가구 체크에 필요)
    const zoneColumnCount = (() => {
      if (spaceInfo.droppedCeiling?.enabled && indexing.zones && placedModule.zone) {
        const zoneData = placedModule.zone === 'dropped' ? indexing.zones.dropped : indexing.zones.normal;
        return zoneData?.columnCount ?? indexing.columnCount;
      }
      return indexing.columnCount;
    })();

    // zone 내 로컬 인덱스 계산 (단내림이 있을 때)
    const zoneLocalIndex = (() => {
      if (spaceInfo.droppedCeiling?.enabled && placedModule.zone && zoneSlotInfo) {
        return localSlotIndex ?? placedModule.slotIndex;
      }
      return normalizedSlotIndex;
    })();

    // 듀얼 가구의 경우: 첫번째 슬롯에 있고, 왼쪽에 벽이 없으면 처리 (경계면 제외)
    const isDualFirstSlot = isDualFurniture && zoneLocalIndex === 0 && !isAtBoundary &&
      (spaceInfo.installType === 'freestanding' ||
        ((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !spaceInfo.wallConfig?.left));

    const isFirstSlotNoSurround = shouldProcessFirstSlot && !isDualFirstSlot;

    // 듀얼 가구의 끝 슬롯이 바깥쪽(경계 바깥)인지 체크
    const isDualEndSlotAtOuter = isDualFurniture && zoneLocalIndex !== undefined &&
      zoneLocalIndex + 1 === zoneColumnCount - 1 &&
      spaceInfo.droppedCeiling?.enabled && placedModule.zone === 'dropped';

    const isDualLastSlot = isDualFurniture && zoneLocalIndex === zoneColumnCount - 2 && (!isAtBoundary || isDualEndSlotAtOuter) &&
      (spaceInfo.installType === 'freestanding' ||
        ((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !spaceInfo.wallConfig?.right));


    // 듀얼 가구가 마지막 슬롯에 있으면 isLastSlot 처리를 하지 않음
    const isLastSlotNoSurround = shouldProcessLastSlot && !isDualLastSlot;

    // 듀얼 가구 첫번째 슬롯 특별 처리 (상하부장 유무와 관계없이 항상 처리)
    if ((isDualFirstSlot || (widthReduced && isNoSurroundFirstSlot)) && !needsEndPanelAdjustment) {
      // 단내림구간: 엔드패널에서 멀어지는 방향으로 9mm 이동
      if (spaceInfo.droppedCeiling?.enabled && placedModule.zone === 'dropped') {
        const droppedPosition = spaceInfo.droppedCeiling.position;
        // 단내림 우측: 왼쪽으로 9mm (오른쪽 엔드패널에서 멀어지게)
        // 단내림 좌측: 오른쪽으로 9mm (왼쪽 엔드패널에서 멀어지게)
        positionAdjustmentForEndPanel = droppedPosition === 'right'
          ? -(END_PANEL_THICKNESS / 2) * 0.01  // 우측 단내림: 왼쪽으로
          : (END_PANEL_THICKNESS / 2) * 0.01;  // 좌측 단내림: 오른쪽으로
      } else {
        // 메인구간: 조정 불필요
        positionAdjustmentForEndPanel = 0;
      }
    }
    // 듀얼 가구 마지막 슬롯 특별 처리 (상하부장 유무와 관계없이 항상 처리)
    else if ((isDualLastSlot || (widthReduced && (isNoSurroundLastSlot || isNoSurroundDualLastSlot))) && !needsEndPanelAdjustment) {
      // 단내림구간: 엔드패널에서 멀어지는 방향으로 9mm 이동
      if (spaceInfo.droppedCeiling?.enabled && placedModule.zone === 'dropped') {
        const droppedPosition = spaceInfo.droppedCeiling.position;
        // 단내림 우측 마지막슬롯: 왼쪽으로 9mm (오른쪽 엔드패널에서 멀어지게)
        // 단내림 좌측 마지막슬롯: 오른쪽으로 9mm (왼쪽 엔드패널에서 멀어지게)
        positionAdjustmentForEndPanel = droppedPosition === 'right'
          ? -(END_PANEL_THICKNESS / 2) * 0.01  // 우측 단내림: 왼쪽으로
          : (END_PANEL_THICKNESS / 2) * 0.01;  // 좌측 단내림: 오른쪽으로
      } else {
        // 메인구간: 조정 불필요
        positionAdjustmentForEndPanel = 0;
      }
    }
    // 싱글 가구 첫/마지막 슬롯 처리 (상하부장도 포함)
    else if ((isFirstSlotNoSurround || isLastSlotNoSurround)) {
      // 키큰장이 아니거나, 키큰장이지만 상하부장과 인접하지 않은 경우
      if (!needsEndPanelAdjustment) {
        // 가구 너비를 18mm 줄임
        const originalWidth = furnitureWidthMm;
        furnitureWidthMm = originalWidth - END_PANEL_THICKNESS;

        // 노서라운드 모드에서 위치 조정
        // 키큰장: 엔드패널에서 멀어지는 방향으로 9mm 이동 (침범 방지)
        // 상하부장: 엔드패널 쪽으로 9mm 이동 (엔드패널과 함께 이동)

        // 단내림구간인 경우: 단내림 위치에 따라 바깥쪽 방향 결정
        const isDroppedZone = spaceInfo.droppedCeiling?.enabled && placedModule.zone === 'dropped';
        const droppedPosition = spaceInfo.droppedCeiling?.position;

        if (isTallCabinet) {
          // 키큰장: 단내림구간과 메인구간 구분
          if (isDroppedZone) {
            // 단내림구간: 엔드패널에서 멀어지는 방향으로 9mm 이동
            // 단내림 우측: 왼쪽으로 9mm (오른쪽 엔드패널에서 멀어지게)
            // 단내림 좌측: 오른쪽으로 9mm (왼쪽 엔드패널에서 멀어지게)
            positionAdjustmentForEndPanel = droppedPosition === 'right'
              ? -(END_PANEL_THICKNESS / 2) * 0.01  // 우측 단내림: 왼쪽으로
              : (END_PANEL_THICKNESS / 2) * 0.01;  // 좌측 단내림: 오른쪽으로
          } else {
            // 메인구간: 조정 불필요
            positionAdjustmentForEndPanel = 0;
          }
        } else {
          // 상하부장: 단내림구간과 메인구간 구분
          if (isDroppedZone) {
            // 단내림구간: 엔드패널에서 멀어지는 방향으로 9mm 이동
            // 단내림 우측: 왼쪽으로 9mm (오른쪽 엔드패널에서 멀어지게)
            // 단내림 좌측: 오른쪽으로 9mm (왼쪽 엔드패널에서 멀어지게)
            positionAdjustmentForEndPanel = droppedPosition === 'right'
              ? -(END_PANEL_THICKNESS / 2) * 0.01  // 우측 단내림: 왼쪽으로
              : (END_PANEL_THICKNESS / 2) * 0.01;  // 좌측 단내림: 오른쪽으로
          } else {
            // 메인구간: 조정 불필요
            positionAdjustmentForEndPanel = 0;
          }
        }

      } else {
        // 키큰장이 상하부장과 인접한 경우는 위에서 이미 처리했으므로
        // 하지만 노서라운드 첫/마지막 슬롯이면 추가 위치 조정이 필요할 수 있음
        // 상하부장 자체는 추가 처리가 필요함
        if (isUpperCabinet || isLowerCabinet) {
          // 상하부장이 첫/마지막 슬롯에 있는 경우도 처리
          const originalWidth = furnitureWidthMm;
          // 이미 키큰장 때문에 조정된 경우가 아니면 조정
          if (furnitureWidthMm === originalFurnitureWidthMm) {
            furnitureWidthMm = originalWidth - END_PANEL_THICKNESS;

            // 단내림구간인지 확인
            const isDroppedZone = spaceInfo.droppedCeiling?.enabled && placedModule.zone === 'dropped';
            const droppedPosition = spaceInfo.droppedCeiling?.position;

            if (isDroppedZone) {
              // 단내림구간: 엔드패널에서 멀어지는 방향으로 9mm 이동
              positionAdjustmentForEndPanel = droppedPosition === 'right'
                ? -(END_PANEL_THICKNESS / 2) * 0.01  // 우측 단내림: 왼쪽으로
                : (END_PANEL_THICKNESS / 2) * 0.01;  // 좌측 단내림: 오른쪽으로
            } else {
              // 메인구간: 조정 불필요
              positionAdjustmentForEndPanel = 0;
            }

          }
        }
      }
    }

    // 노서라운드 모드에서는 slotWidths가 이미 엔드패널을 고려하여 계산되어 있음
    // FurnitureItem에서 추가로 조정하지 않음
  }

  // 디버깅용 로그 추가 제거됨

  // 키큰장 높이는 항상 내경 높이와 동일 (띄워서 배치와 관계없이)
  // 키큰장은 바닥(또는 띄움 위치)부터 시작해서 상단몰딩 하단까지

  // 노서라운드 모드에서 엔드패널 위치 조정은 나중에 적용

  // 자유배치 모드에서는 사용자 지정 깊이를 우선 사용
  let adjustedDepthMm = (placedModule.isFreePlacement && placedModule.freeDepth)
    ? placedModule.freeDepth
    : (actualModuleData?.dimensions.depth || 0);

  // 단내림 구간 높이 디버깅
  if (placedModule.zone === 'dropped') {
    debugLog('🟢 FurnitureItem 단내림 구간 가구 높이');
    debugLog('  zone:', placedModule.zone);
    debugLog('  moduleId:', placedModule.moduleId);
    debugLog('  furnitureHeightMm:', furnitureHeightMm);
    debugLog('  actualModuleDataHeight:', actualModuleData?.dimensions.height);
    debugLog('  internalSpaceHeight:', internalSpace.height);
    debugLog('  droppedCeilingEnabled:', spaceInfo.droppedCeiling?.enabled);
    debugLog('  dropHeight:', spaceInfo.droppedCeiling?.dropHeight);
  }

  // Column C 가구 너비 디버깅
  if (slotInfo?.columnType === 'medium' && slotInfo?.allowMultipleFurniture) {
  }

  // 듀얼 가구인지 확인하여 도어 크기 결정 (이미 위에서 계산됨)
  // 단내림 구간에서는 zone별 columnWidth 사용
  let originalSlotWidthMm: number;

  // 자유배치 모드에서는 freeWidth를 도어 기준 너비로 사용
  if (placedModule.isFreePlacement && placedModule.freeWidth) {
    originalSlotWidthMm = placedModule.freeWidth;
  } else if (
    (placedModule.placementWall === 'left' || placedModule.placementWall === 'right') &&
    typeof (placedModule as any).sideLogicalWidth === 'number'
  ) {
    originalSlotWidthMm = (placedModule as any).sideLogicalWidth;
  } else {

    // 노서라운드 모드에서 끝 슬롯인지 확인
    const isEndSlotInNoSurround = spaceInfo.surroundType === 'no-surround' &&
      normalizedSlotIndex !== undefined &&
      (normalizedSlotIndex === 0 || normalizedSlotIndex === indexing.columnCount - 1);

    if (placedModule.zone && spaceInfo.droppedCeiling?.enabled && zoneSlotInfo) {
      const targetZone = placedModule.zone === 'dropped' && zoneSlotInfo.dropped ? zoneSlotInfo.dropped : zoneSlotInfo.normal;
      const localIndex = localSlotIndex ?? placedModule.slotIndex ?? 0;

      // 마지막 슬롯의 경우 실제 남은 너비 사용
      if (isLastSlot && !isDualFurniture) {
        const usedWidth = targetZone.columnWidth * (targetZone.columnCount - 1);
        originalSlotWidthMm = targetZone.width - usedWidth;
      } else if (isDualFurniture && localIndex === targetZone.columnCount - 2) {
        // 마지막-1 슬롯의 듀얼 가구인 경우
        const normalSlotWidth = targetZone.columnWidth;
        const lastSlotStart = targetZone.startX + ((targetZone.columnCount - 1) * targetZone.columnWidth);
        const lastSlotEnd = targetZone.startX + targetZone.width;
        const lastSlotWidth = lastSlotEnd - lastSlotStart;
        originalSlotWidthMm = normalSlotWidth + lastSlotWidth;
      } else if (isDualFurniture) {
        // 듀얼 가구: 실제 슬롯 너비들의 합계 사용
        if (targetZone.slotWidths && localIndex >= 0 && localIndex < targetZone.slotWidths.length - 1) {
          originalSlotWidthMm = targetZone.slotWidths[localIndex] + targetZone.slotWidths[localIndex + 1];
        } else {
          // fallback: 평균 너비 * 2
          originalSlotWidthMm = targetZone.columnWidth * 2;
        }
      } else {
        // 싱글 가구: 해당 슬롯의 실제 너비 사용
        if (targetZone.slotWidths && localIndex >= 0 && localIndex < targetZone.slotWidths.length) {
          originalSlotWidthMm = targetZone.slotWidths[localIndex];
        } else {
          // fallback: 평균 너비
          originalSlotWidthMm = targetZone.columnWidth;
        }
      }

    } else {
      // 단내림이 없는 경우도 마지막 슬롯 처리
      if (isLastSlot && !isDualFurniture) {
        const usedWidth = indexing.columnWidth * (indexing.columnCount - 1);
        const totalInternalWidth = internalSpace.width;  // 내경 전체 너비
        originalSlotWidthMm = totalInternalWidth - usedWidth;
      } else if (isDualFurniture) {
        // 듀얼 가구: 실제 슬롯 너비들의 합계 사용
        if (indexing.slotWidths && normalizedSlotIndex !== undefined && normalizedSlotIndex < indexing.slotWidths.length - 1) {
          originalSlotWidthMm = indexing.slotWidths[normalizedSlotIndex] + indexing.slotWidths[normalizedSlotIndex + 1];
        } else {
          // fallback: 평균 너비 * 2
          originalSlotWidthMm = indexing.columnWidth * 2;
        }
      } else {
        // 싱글 가구: 해당 슬롯의 실제 너비 사용
        if (indexing.slotWidths && normalizedSlotIndex !== undefined && indexing.slotWidths[normalizedSlotIndex] !== undefined) {
          originalSlotWidthMm = indexing.slotWidths[normalizedSlotIndex];
        } else {
          // fallback: 평균 너비
          originalSlotWidthMm = indexing.columnWidth;
        }
      }
    }
  } // end else (slot-based originalSlotWidthMm)

  // 도어 크기 디버깅
  if (placedModule.hasDoor) {
    let targetZoneSlotWidths = null;
    let targetZoneInfo = null;
    if (placedModule.zone && spaceInfo.droppedCeiling?.enabled) {
      const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
      const targetZone = placedModule.zone === 'dropped' && zoneInfo.dropped ? zoneInfo.dropped : zoneInfo.normal;
      targetZoneSlotWidths = targetZone.slotWidths;
      targetZoneInfo = targetZone;
    }

    // 도어 너비 보정: originalSlotWidthMm(indexing 기반)과 가구 너비 비교
    // 기둥 침범 시 도어는 원래 슬롯 너비를 유지해야 함 (커버도어)
    // 키큰장에 엔드패널이 있을 때도 도어는 원래 슬롯 너비를 유지해야 함
    const widthDifference = Math.abs(originalSlotWidthMm - furnitureWidthMm);
    const hasFrontOffsetEndPanel = (placedModule.hasLeftEndPanel && (placedModule.leftEndPanelOffset ?? 0) > 0)
      || (placedModule.hasRightEndPanel && (placedModule.rightEndPanelOffset ?? 0) > 0);
    const shouldFitLowerDoorWithManualEndPanel = actualModuleData?.category === 'lower'
      && hasFrontOffsetEndPanel;
    const hasManualEndPanel = placedModule.hasLeftEndPanel || placedModule.hasRightEndPanel;
    const hasSlotOutsideEpTrim = !placedModule.isFreePlacement
      && placedModule.slotCustomWidth === undefined
      && typeof placedModule.customWidth === 'number'
      && originalSlotWidthMm > furnitureWidthMm
      && Math.abs(placedModule.customWidth - furnitureWidthMm) < 0.5;
    if ((widthDifference > 20 || hasSlotOutsideEpTrim) && (!hasManualEndPanel || shouldFitLowerDoorWithManualEndPanel) && (!isEditMode || shouldFitLowerDoorWithManualEndPanel) && !isDraggingThis && !(slotInfo && slotInfo.hasColumn) && !needsEndPanelAdjustment) {
      // 기둥 커버도어가 아니면 furnitureWidthMm(customWidth/EP 반영)이 실제 가구 크기이므로 도어를 가구에 맞춤
      originalSlotWidthMm = furnitureWidthMm;
    }
  }

  // 벽없음 + 노서라운드 모드에서 벽이 없는 쪽의 가구는 도어가 엔드패널을 덮도록 확장
  let doorWidthExpansion = 0;
  let doorWidth = (placedModule.isFreePlacement && placedModule.freeWidth)
    ? placedModule.freeWidth
    : (!placedModule.isFreePlacement && placedModule.slotCustomWidth !== undefined)
      ? placedModule.slotCustomWidth
      : (actualModuleData?.dimensions.width || 0);
  let doorXOffset = 0;
  let originalSlotWidthForDoor = originalSlotWidthMm;

  // 상하부장 인접 시 도어 확장 비활성화 (엔드패널이 공간을 채우므로)
  if (needsEndPanelAdjustment) {
  }

  // 노서라운드 엔드패널 도어 확장 비활성화 (EP 자동 생성 제거됨)
  if (false && !needsEndPanelAdjustment && spaceInfo.surroundType === 'no-surround' &&
    (spaceInfo.installType === 'freestanding' ||
      spaceInfo.installType === 'semistanding' ||
      spaceInfo.installType === 'semi-standing') &&
    normalizedSlotIndex !== undefined) {

    // 프리스탠딩에서는 양쪽 모두, 세미스탠딩에서는 벽이 없는 쪽만 처리
    let shouldExpandFirstSlot = false;
    let shouldExpandLastSlot = false;

    if (spaceInfo.installType === 'freestanding') {
      // 프리스탠딩: 양쪽 모두 확장
      shouldExpandFirstSlot = normalizedSlotIndex === 0;
      shouldExpandLastSlot = isLastSlot;
    } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
      // 세미스탠딩: 벽이 없는 쪽만 확장
      shouldExpandFirstSlot = normalizedSlotIndex === 0 && !spaceInfo.wallConfig?.left;
      shouldExpandLastSlot = isLastSlot && !spaceInfo.wallConfig?.right;
    }

    // zone별 로컬 인덱스 사용
    const currentLocalSlotIndex = localSlotIndex ?? normalizedSlotIndex;


    // 듀얼 가구의 경우: 각 zone의 첫번째 슬롯에 있고, 벽이 없으면 처리
    const isDualFirstSlotDoor = isDualFurniture && currentLocalSlotIndex === 0 &&
      (spaceInfo.installType === 'freestanding' ||
        ((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !spaceInfo.wallConfig?.left));


    const isFirstSlotFreestanding = shouldExpandFirstSlot && !isDualFirstSlotDoor;
    const isLastSlotFreestanding = shouldExpandLastSlot;

    // 각 zone의 마지막 듀얼 슬롯 체크
    const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
    const zoneColumnCount = placedModule.zone === 'dropped' && zoneInfo.dropped
      ? zoneInfo.dropped.columnCount
      : (zoneInfo.normal?.columnCount ?? indexing.columnCount);

    const isDualLastSlot = isDualFurniture && currentLocalSlotIndex === zoneColumnCount - 2 &&
      (spaceInfo.installType === 'freestanding' ||
        ((spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') && !spaceInfo.wallConfig?.right));

    // 첫번째 또는 마지막 슬롯: 도어 확장
    if (isFirstSlotFreestanding || isLastSlotFreestanding || isDualFirstSlotDoor || isDualLastSlot) {
      if (isDualFurniture && isDualFirstSlotDoor) {
        // 듀얼 가구가 첫번째 슬롯에 있는 경우: 왼쪽 도어만 18mm 확장
        doorWidthExpansion = END_PANEL_THICKNESS; // 18mm 확장
        // 단내림 구간 듀얼장: 가구 이동을 상쇄해서 도어를 슬롯 중심에 고정
        // 일반 구간 듀얼장: 상하부장 인접 시 위치 조정, 아니면 기본 9mm 좌측 이동
        if (placedModule.zone === 'dropped' && spaceInfo.droppedCeiling?.enabled) {
          // 가구가 positionAdjustmentForEndPanel만큼 이동했으므로, 도어는 반대로 이동
          doorXOffset = -positionAdjustmentForEndPanel;
        } else {
          doorXOffset = needsEndPanelAdjustment ? positionAdjustmentForEndPanel : -(END_PANEL_THICKNESS / 2) * 0.01;
        }

      } else if (isDualFurniture && isDualLastSlot) {
        // 듀얼 가구가 마지막 슬롯에 있는 경우: 오른쪽 도어만 18mm 확장
        doorWidthExpansion = END_PANEL_THICKNESS; // 18mm 확장
        // 단내림 구간 듀얼장: 가구 이동을 상쇄해서 도어를 슬롯 중심에 고정
        // 일반 구간 듀얼장(단내림 경계): doorXOffset = 0 (슬롯 중심 고정)
        // 단내림 없을 때: 기본 9mm 우측 이동
        if (placedModule.zone === 'dropped' && spaceInfo.droppedCeiling?.enabled) {
          // 가구가 positionAdjustmentForEndPanel만큼 이동했으므로, 도어는 반대로 이동
          doorXOffset = -positionAdjustmentForEndPanel;
        } else if (spaceInfo.droppedCeiling?.enabled) {
          // 단내림이 있고, 일반 구간 마지막 슬롯 → 도어 중심 고정 (단내림 경계)
          doorXOffset = needsEndPanelAdjustment ? positionAdjustmentForEndPanel : 0;
        } else {
          // 단내림이 없을 때 → 기본 9mm 우측 이동
          doorXOffset = needsEndPanelAdjustment ? positionAdjustmentForEndPanel : (END_PANEL_THICKNESS / 2) * 0.01;
        }

      } else {
        // 싱글 가구 또는 듀얼 가구 첫번째 슬롯: 한쪽만 18mm 확장
        doorWidthExpansion = END_PANEL_THICKNESS;


        // 도어 위치는 확장된 방향과 반대로 이동 (가구 위치에 맞춤)
        // 단내림 경계와 인접한 슬롯: 도어 중심 고정 (최우선, 단내림이 있을 때만)
        // 상하부장이 인접한 경우 위치 조정 사용, 아니면 기본 9mm 이동
        if (placedModule.zone === 'dropped' && currentLocalSlotIndex === 0 && spaceInfo.droppedCeiling?.enabled) {
          // 단내림 구간 첫번째 슬롯 싱글장: 도어 중심 고정
          doorXOffset = 0;
        } else if (placedModule.zone === 'normal' && currentLocalSlotIndex === zoneColumnCount - 1 && spaceInfo.droppedCeiling?.enabled) {
          // 일반 구간 마지막 슬롯 싱글장: 단내림 우측은 경계라서 중심 고정, 단내림 좌측은 바깥쪽 끝이라서 중심 고정
          doorXOffset = 0;
        } else if (isFirstSlotFreestanding) {
          doorXOffset = needsEndPanelAdjustment ? positionAdjustmentForEndPanel : -(END_PANEL_THICKNESS / 2) * 0.01;
        } else {
          doorXOffset = needsEndPanelAdjustment ? positionAdjustmentForEndPanel : (END_PANEL_THICKNESS / 2) * 0.01;
        }

      }
    }

    // 벽 위치 설정 (freestanding은 양쪽 벽 없음) - hasLeftWall, hasRightWall은 이미 위에서 설정됨
  } else if (false && !needsEndPanelAdjustment && spaceInfo.surroundType === 'no-surround' && normalizedSlotIndex !== undefined) {
    // EP 자동 생성 제거됨 — 노서라운드 도어 확장/오프셋 비활성화
  }

  // 수동 EP가 있으면 도어 확장 비활성화 + 슬롯 모드에서 본체 이동 역보정
  // 본체는 epOffsetX로 이동하지만 도어는 원래 슬롯 중앙에 있어야 하므로 역방향 오프셋
  if (placedModule.hasLeftEndPanel || placedModule.hasRightEndPanel) {
    doorWidthExpansion = 0;
    if (!placedModule.isFreePlacement && !placedModule.customConfig && placedModule.endPanelMode !== 'outside') {
      // 슬롯 모드: 본체가 epOffsetX만큼 이동하므로 도어를 역방향으로 되돌림
      const epThkDoor = mmToThreeUnits(resolvePetPanelThicknessMm(placedModule.endPanelThickness));
      const leftEpDoor = placedModule.hasLeftEndPanel ? epThkDoor : 0;
      const rightEpDoor = placedModule.hasRightEndPanel ? epThkDoor : 0;
      doorXOffset = -(leftEpDoor - rightEpDoor) / 2; // epOffsetX의 역방향
    } else {
      doorXOffset = 0;
    }
  }

  // 도어는 항상 원래 슬롯 중심에 고정 (가구 이동과 무관)
  let originalSlotCenterX: number;

  // zone이 있는 경우 zone별 위치 계산
  if (placedModule.zone && spaceInfo.droppedCeiling?.enabled) {
    const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
    const targetZone = placedModule.zone === 'dropped' && zoneInfo.dropped ? zoneInfo.dropped : zoneInfo.normal;

    // zone 내 로컬 슬롯 인덱스 사용
    const localSlotIndexForZone = localSlotIndex ?? placedModule.slotIndex ?? 0;

    if (isDualFurniture && localSlotIndexForZone < targetZone.columnCount - 1) {
      // 듀얼 가구: 두 슬롯의 중간점
      let leftSlotX, rightSlotX;

      // 마지막-1 슬롯이 듀얼인 경우 마지막 슬롯의 실제 너비 고려
      if (localSlotIndexForZone === targetZone.columnCount - 2) {
        leftSlotX = targetZone.startX + (localSlotIndexForZone * targetZone.columnWidth) + (targetZone.columnWidth / 2);
        const lastSlotStart = targetZone.startX + ((localSlotIndexForZone + 1) * targetZone.columnWidth);
        const lastSlotEnd = targetZone.startX + targetZone.width;
        rightSlotX = (lastSlotStart + lastSlotEnd) / 2;
      } else {
        leftSlotX = targetZone.startX + (localSlotIndexForZone * targetZone.columnWidth) + (targetZone.columnWidth / 2);
        rightSlotX = targetZone.startX + ((localSlotIndexForZone + 1) * targetZone.columnWidth) + (targetZone.columnWidth / 2);
      }
      originalSlotCenterX = ((leftSlotX + rightSlotX) / 2) * 0.01; // mm to Three.js units
    } else {
      // 싱글 가구
      // targetZone의 threeUnitPositions나 계산된 위치 사용
      const zoneIndexing = placedModule.zone === 'dropped' && indexing.zones?.dropped
        ? indexing.zones.dropped
        : (placedModule.zone === 'normal' && indexing.zones?.normal ? indexing.zones.normal : indexing);

      if (zoneIndexing.threeUnitPositions && zoneIndexing.threeUnitPositions[localSlotIndexForZone] !== undefined) {
        originalSlotCenterX = zoneIndexing.threeUnitPositions[localSlotIndexForZone];
      } else {
        // fallback: 기본 계산 사용
        originalSlotCenterX = (targetZone.startX + (localSlotIndexForZone * targetZone.columnWidth) + (targetZone.columnWidth / 2)) * 0.01;
      }
    }
  } else {
    // zone이 없는 경우 기존 로직
    // 듀얼 가구는 두 슬롯의 중간 위치 계산
    if (isDualFurniture && normalizedSlotIndex !== undefined) {
      // 듀얼 가구: 두 슬롯의 중간 위치
      const leftSlotX = indexing.threeUnitPositions[normalizedSlotIndex];
      const rightSlotX = indexing.threeUnitPositions[normalizedSlotIndex + 1] || leftSlotX;
      originalSlotCenterX = (leftSlotX + rightSlotX) / 2;

    } else if (normalizedSlotIndex !== undefined && indexing.threeUnitPositions[normalizedSlotIndex] !== undefined) {
      // 싱글 가구: 슬롯 중심 위치
      originalSlotCenterX = indexing.threeUnitPositions[normalizedSlotIndex]; // 실제 슬롯 중심 위치
    } else {
      // 슬롯 인덱스가 없는 경우, 듀얼 가구라면 듀얼 위치에서 찾기

      if (isDualFurniture && indexing.threeUnitDualPositions) {
        // 듀얼 가구의 경우 듀얼 위치에서 가장 가까운 위치 찾기
        const closestDualIndex = indexing.threeUnitPositions.findIndex(pos =>
          Math.abs(pos - placedModule.position.x) < 0.2 // 20cm 오차 허용
        );
        if (closestDualIndex >= 0) {
          originalSlotCenterX = indexing.threeUnitDualPositions[closestDualIndex];
        } else {
          // 백업: 현재 위치 사용 (기존 동작)
          originalSlotCenterX = placedModule.position.x;
        }
      } else {
        // 싱글 가구의 경우 싱글 위치에서 가장 가까운 위치 찾기
        const closestSingleIndex = indexing.threeUnitPositions.findIndex(pos =>
          Math.abs(pos - placedModule.position.x) < 0.2 // 20cm 오차 허용
        );
        if (closestSingleIndex >= 0) {
          originalSlotCenterX = indexing.threeUnitPositions[closestSingleIndex];
        } else {
          // 백업: 현재 위치 사용 (기존 동작)
          originalSlotCenterX = placedModule.position.x;
        }
      }
    }
  }

  // 마지막 슬롯도 일반 슬롯과 동일하게 처리 (특별 처리 제거)
  // threeUnitPositions가 이미 올바른 위치를 가지고 있음

  const widthReductionBeforeColumn = Math.max(0, originalFurnitureWidthMm - furnitureWidthMm);

  // 기둥이 있는 모든 슬롯 처리 (단내림 구간 포함)
  if (shouldApplyColumnAdjustment && slotInfo && slotInfo.hasColumn && slotInfo.column) {
    // 기둥 타입에 따른 처리 방식 확인
    const columnProcessingMethod = slotInfo.columnProcessingMethod || 'width-adjustment';

    const slotWidthMmForBounds = slotInfo.slotWidth ?? indexing.slotWidths?.[normalizedSlotIndex] ?? indexing.columnWidth;
    const slotWidthM = slotWidthMmForBounds * 0.01; // mm to meters
    const originalSlotBounds = {
      left: originalSlotCenterX - slotWidthM / 2,
      right: originalSlotCenterX + slotWidthM / 2,
      center: originalSlotCenterX
    };

    // 기둥 침범에 따른 새로운 가구 경계 계산
    const furnitureBounds = calculateFurnitureBounds(slotInfo, originalSlotBounds, spaceInfo);

    // 기둥 침범 시에는 가구 폭을 조정하여 기둥과 겹치지 않도록 함
    if (columnProcessingMethod === 'width-adjustment') {
      // 'front' 모드: 기둥 타입(medium/shallow/deep) 무관하게 폭은 슬롯 전체, 깊이만 줄임, 기둥 앞으로 배치
      if (placedModule.columnPlacementMode === 'front') {
        const slotDepth = 730;
        const columnDepth = slotInfo.column?.depth || 300;
        const remainingDepth = Math.max(100, slotDepth - columnDepth); // 최소 100mm 보장

        furnitureWidthMm = indexing.columnWidth; // 슬롯 전체 너비
        adjustedDepthMm = remainingDepth; // 깊이 조정
        adjustedPosition = {
          ...adjustedPosition,
          x: originalSlotCenterX // 슬롯 중심
        };

      } else {
        // 일반 폭 조정 방식: 가구 크기와 위치 조정
        // 기둥 침범 시에는 항상 폭 조정
        const slotHalfWidthM = (slotWidthMmForBounds * 0.01) / 2;
        let furnitureHalfWidthM = (furnitureBounds.renderWidth * 0.01) / 2;
        const originalHalfWidthM = furnitureHalfWidthM;
        const slotLeft = originalSlotCenterX - slotHalfWidthM;
        const slotRight = originalSlotCenterX + slotHalfWidthM;

        const desiredOffset = (needsEndPanelAdjustment || widthReduced) ? positionAdjustmentForEndPanel : 0;
        let targetCenter = furnitureBounds.center + desiredOffset;

        if (targetCenter - furnitureHalfWidthM < slotLeft) {
          targetCenter = slotLeft + furnitureHalfWidthM;
        }
        if (targetCenter + furnitureHalfWidthM > slotRight) {
          targetCenter = slotRight - furnitureHalfWidthM;
        }

        const appliedOffset = targetCenter - furnitureBounds.center;

        if (needsEndPanelAdjustment || widthReduced || appliedOffset !== desiredOffset) {
          positionAdjustmentForEndPanel = appliedOffset;
        }

        let adjustedWidthAfterColumn = furnitureBounds.renderWidth;

        let appliedReduction = 0;
        if (widthReductionBeforeColumn > 0) {
          const maxReduction = Math.max(0, adjustedWidthAfterColumn - 50); // 최소 폭 확보
          appliedReduction = Math.min(widthReductionBeforeColumn, maxReduction);
          if (appliedReduction > 0) {
            adjustedWidthAfterColumn -= appliedReduction;
            furnitureHalfWidthM = (adjustedWidthAfterColumn * 0.01) / 2;
          }
        }

        if (appliedReduction > 0 && (needsEndPanelAdjustment || widthReduced)) {
          const shiftSign = (() => {
            if (positionAdjustmentForEndPanel > 0) return 1;
            if (positionAdjustmentForEndPanel < 0) return -1;
            if (endPanelSide === 'left') return 1;
            if (endPanelSide === 'right') return -1;
            return 0;
          })();

          if (shiftSign !== 0) {
            const halfDiff = originalHalfWidthM - furnitureHalfWidthM;
            let shiftedCenter = targetCenter + halfDiff * shiftSign;
            const minCenter = slotLeft + furnitureHalfWidthM;
            const maxCenter = slotRight - furnitureHalfWidthM;
            shiftedCenter = Math.min(maxCenter, Math.max(minCenter, shiftedCenter));
            targetCenter = shiftedCenter;
          }
        }

        furnitureWidthMm = adjustedWidthAfterColumn;
        adjustedPosition = {
          ...adjustedPosition, // adjustedPosition 사용하여 상부장 Y 위치 보존
          x: targetCenter
        };

        if (needsEndPanelAdjustment || widthReduced) {
          positionAdjustmentForEndPanel = targetCenter - furnitureBounds.center;
        }

        // 기둥 변경으로 인한 폭 조정 store 반영.
        // adjustedPosition(기둥 회피로 밀린 중심)도 저장해야 걸레받이·상부몰딩·치수가 본체 중심을 따라간다.
        // 성능: (1) 드래그 진행 중에는 store write 생략(로컬 렌더만) → 매 프레임 write/리렌더 폭주 방지.
        //      (2) 값은 1mm 단위로 양자화 비교·저장 → 부동소수 미세 차이로 인한 불필요한 write/피드백 루프 차단.
        const quantTargetCenter = Math.round(targetCenter * 100) / 100; // 0.01 three-unit = 1mm
        const prevAdjPosX = placedModule.adjustedPosition?.x;
        const widthChanged = placedModule.adjustedWidth !== furnitureWidthMm;
        const posChanged = prevAdjPosX === undefined
          || Math.round(prevAdjPosX * 100) !== Math.round(quantTargetCenter * 100);
        if (shouldApplyColumnAdjustment && !isDraggingColumn && (widthChanged || posChanged)) {
          updatePlacedModule(placedModule.id, {
            adjustedWidth: furnitureWidthMm,
            adjustedPosition: { x: quantTargetCenter, y: placedModule.position.y, z: placedModule.position.z },
            columnSlotInfo: {
              hasColumn: true,
              columnId: slotInfo.column?.id,
              columnPosition: slotInfo.columnPosition,
              availableWidth: slotInfo.availableWidth,
              adjustedWidth: slotInfo.adjustedWidth,
              intrusionDirection: slotInfo.intrusionDirection,
              furniturePosition: slotInfo.furniturePosition
            }
          });
        }
      } // end of else (기둥 측면 배치 모드)
    } else if (columnProcessingMethod === 'depth-adjustment') {
      // 깊이 조정 방식 (기둥 C(300mm) 및 얕은 기둥)
      const slotDepth = 730; // 슬롯 기본 깊이
      const columnDepth = slotInfo.column.depth;
      const remainingDepth = slotDepth - columnDepth; // 430mm

      // '기둥 앞에 배치' 모드: 폭은 슬롯 전체, 깊이만 줄임
      if (placedModule.columnPlacementMode === 'front') {
        // 기둥 앞에 배치 - 폭은 슬롯 전체, 깊이만 줄임
        furnitureWidthMm = indexing.columnWidth; // 슬롯 전체 너비
        adjustedPosition = {
          ...adjustedPosition,
          x: originalSlotCenterX // 슬롯 중심
        };
        // 깊이 = 슬롯깊이 - 기둥깊이 = 730 - 300 = 430mm
        adjustedDepthMm = remainingDepth; // 430mm
      } else {
        // '기둥 측면 배치' 모드 (기본값): 폭 줄임, 깊이는 원래대로
        // 폭 조정 로직 적용 (width-adjustment와 유사)
        if (slotInfo.availableWidth) {
          furnitureWidthMm = slotInfo.availableWidth;
        }
        // 깊이는 원래 모듈 깊이 유지 (줄이지 않음)
        adjustedDepthMm = actualModuleData?.dimensions.depth || 0;

        // 위치 조정 (기둥 침범 방향에 따라)
        if (slotInfo.intrusionDirection && slotInfo.availableWidth) {
          const slotWidth = indexing.columnWidth;
          const widthReduction = slotWidth - slotInfo.availableWidth;
          const halfReductionUnits = mmToThreeUnits(widthReduction / 2);

          if (slotInfo.intrusionDirection === 'from-left') {
            // 기둥이 왼쪽에서 침범 - 가구를 오른쪽으로 이동
            adjustedPosition = {
              ...adjustedPosition,
              x: originalSlotCenterX + halfReductionUnits
            };
          } else if (slotInfo.intrusionDirection === 'from-right') {
            // 기둥이 오른쪽에서 침범 - 가구를 왼쪽으로 이동
            adjustedPosition = {
              ...adjustedPosition,
              x: originalSlotCenterX - halfReductionUnits
            };
          }
        }
      }
    }
  }

  if (needsEndPanelAdjustment && endPanelSide && hasColumnInSlot) {
    const baseWidthAfterColumn = furnitureWidthMm;
    const reductionMap: Record<string, number> = {
      left: END_PANEL_THICKNESS,
      right: END_PANEL_THICKNESS,
      both: END_PANEL_THICKNESS * 2
    };

    const reductionMm = reductionMap[endPanelSide] ?? 0;
    let adjustedWidth = Math.max(150, baseWidthAfterColumn - reductionMm);
    const appliedReductionMm = Math.max(0, baseWidthAfterColumn - adjustedWidth);

    furnitureWidthMm = adjustedWidth;

    if (appliedReductionMm > 0) {
      const halfReductionUnits = mmToThreeUnits(appliedReductionMm / 2);
      if (endPanelSide === 'left') {
        // 왼쪽 엔드패널: 기둥 쪽을 고정하고 오른쪽 폭만 줄이므로 중심을 오른쪽으로 이동
        positionAdjustmentForEndPanel += halfReductionUnits;
      } else if (endPanelSide === 'right') {
        // 오른쪽 엔드패널: 기둥 쪽을 고정하고 왼쪽 폭만 줄이므로 중심을 왼쪽으로 이동
        positionAdjustmentForEndPanel -= halfReductionUnits;
      }
      // 양쪽 엔드패널(both)은 중심을 유지
    }
  }

  // 기둥이 슬롯을 벗어났을 때만 customDepth 제거 (사용자가 직접 설정한 깊이는 유지)
  const shouldResetCustomDepth = shouldApplyColumnAdjustment && slotInfo && !slotInfo.hasColumn && !!placedModule.customDepth && !!placedModule.columnSlotInfo;

  if (shouldApplyColumnAdjustment && slotInfo && !slotInfo.hasColumn && placedModule.customDepth && placedModule.columnSlotInfo) {
    // 기둥이 슬롯을 벗어났을 때 customDepth 제거
    // 깊이를 원래대로 복구
    adjustedDepthMm = actualModuleData?.dimensions.depth || 0;
  }

  const shouldResetWidth = shouldApplyColumnAdjustment && slotInfo && !slotInfo.hasColumn &&
    (placedModule.adjustedWidth !== undefined || placedModule.columnSlotInfo !== undefined);

  if (shouldApplyColumnAdjustment && slotInfo && !slotInfo.hasColumn && (placedModule.adjustedWidth || placedModule.columnSlotInfo)) {
    // 기둥이 슬롯을 벗어났을 때 폭도 원상복구
    // 폭을 원래대로 복구
    furnitureWidthMm = actualModuleData?.dimensions.width || 0;

    // 위치도 슬롯 중심으로 복구
    const slotCenterX = (normalizedSlotIndex !== undefined && indexing.threeUnitPositions[normalizedSlotIndex] !== undefined)
      ? indexing.threeUnitPositions[normalizedSlotIndex]
      : placedModule.position.x;
    adjustedPosition = {
      ...adjustedPosition, // adjustedPosition 사용하여 상부장 Y 위치 보존
      x: slotCenterX + ((needsEndPanelAdjustment || widthReduced) ? positionAdjustmentForEndPanel : 0)
    };
  }

  // 가구 위치 이동 (벽없음 모드)

  if ((spaceInfo.installType === 'freestanding' || isSemiStanding) && !isAtDroppedBoundary) {
    const currentX = adjustedPosition.x;
    const offset = (END_PANEL_THICKNESS / 2) * 0.01; // 9mm
    const isDroppedZone = spaceInfo.droppedCeiling?.enabled && placedModule.zone === 'dropped';

    // 경계 슬롯은 이동하지 않음
    let finalOffset = 0;


    if (spaceInfo.surroundType === 'no-surround') {
      // EP 자동 생성 제거됨 — 노서라운드에서 9mm 오프셋 불필요
      finalOffset = 0;
    } else if (spaceInfo.surroundType === 'surround' && widthReduced) {
      // 서라운드: 너비가 줄어든 듀얼 가구만 안쪽(왼쪽)으로 9mm 이동
      finalOffset = -offset;
    }

    if (finalOffset !== 0) {
      adjustedPosition = {
        ...adjustedPosition,
        x: currentX + finalOffset
      };
    }
  }

  // 가구 치수를 Three.js 단위로 변환
  const width = mmToThreeUnits(furnitureWidthMm);

  // 가구 높이 계산: actualModuleData.dimensions.height가 이미 올바른 높이를 가지고 있음
  // generateShelvingModules에서 internalSpace.height를 기반으로 가구를 생성했기 때문
  // 추가 조정 불필요

  const height = mmToThreeUnits(furnitureHeightMm);

  // 단내림 구간 최종 높이 디버깅
  // 단내림 진단용 로그 제거 (성능)
  // if (placedModule.zone === 'dropped') {
  //   console.log('🟠 [단내림 FurnitureItem]', { ... });
  // }

  // 깊이 계산: 설정 기본 깊이/사용자 지정 깊이 > adjustedDepthMm(슬롯-기둥 남는 공간) > moduleDepth
  // 기둥 앞 배치 front 모드도 customDepth를 존중 (사용자가 기둥과 같은 깊이로 줄인 경우 등)
  const moduleDepth = actualModuleData?.dimensions?.depth || 0;
  const categoryDefaultDepth = getCategoryDefaultFurnitureDepth(
    spaceInfo.depth || 600,
    placedModule.moduleId || '',
    spaceInfo.furnitureDepthDefaults
  );
  const storedCustomDepth = typeof placedModule.customDepth === 'number' && placedModule.customDepth > 0
    ? placedModule.customDepth
    : undefined;
  const effectiveCustomDepth = storedCustomDepth ?? categoryDefaultDepth;
  const rawActualDepthMm = effectiveCustomDepth ||
    (placedModule.columnPlacementMode === 'front' && adjustedDepthMm !== moduleDepth
      ? adjustedDepthMm
      : (autoAdjustedDepthMm !== null ? autoAdjustedDepthMm :
          (adjustedDepthMm !== moduleDepth ? adjustedDepthMm : moduleDepth)));
  const actualDepthMm = placedModule.moduleId?.includes('-entryway-') && Math.abs(rawActualDepthMm - 400) < 0.5
    ? 380
    : rawActualDepthMm;
  const depth = mmToThreeUnits(actualDepthMm);
  const renderModuleData: ModuleData | null = actualModuleData
    ? {
        ...actualModuleData,
        dimensions: {
          ...actualModuleData.dimensions,
          depth: actualDepthMm,
        },
      }
    : actualModuleData;



  // 도어 두께 (20mm) - furnitureZ 계산에 필요하므로 먼저 선언
  const doorThicknessMm = 20;
  const doorThickness = mmToThreeUnits(doorThicknessMm);

  // Room.tsx와 동일한 Z축 위치 계산 - furnitureGroupPosition 전에 계산해야 함 (실제 공간 깊이 사용)
  const panelDepthMm = spaceInfo.depth || 600; // 실제 공간 깊이
  const furnitureDepthMm = Math.min(panelDepthMm, 600); // 가구 공간 깊이
  const panelDepth = mmToThreeUnits(panelDepthMm);
  const furnitureDepth = mmToThreeUnits(furnitureDepthMm);

  // Room.tsx와 동일한 계산: 뒷벽에서 600mm만 나오도록
  const zOffset = -panelDepth / 2; // 공간 메쉬용 깊이 중앙
  const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2; // 뒷벽에서 600mm

  // Z축 위치 계산 - 기둥 C가 있어도 위치는 변경하지 않음
  // 띄움배치일 때는 받침대 깊이만큼 앞으로 당김 (조절발이 없으므로)
  const isFloating = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
  const baseDepthOffset = isFloating ? mmToThreeUnits(spaceInfo.baseConfig?.depth || 0) : 0;

  // 기둥 앞 공간 가구인지 확인 (isColumnCFront는 나중에 정의되므로 직접 체크)
  const isFrontSpaceFurniture = placedModule.columnSlotInfo?.spaceType === 'front';
  const isSideWallFurniture = placedModule.placementWall === 'left' || placedModule.placementWall === 'right';
  const defaultModuleDepthMm = categoryDefaultDepth
    ?? (actualModuleData as any)?.defaultDepth
    ?? actualModuleData?.dimensions?.depth
    ?? actualDepthMm;
  const resolveSectionDepthForRender = (sectionDepth?: number) => {
    if (sectionDepth === undefined || sectionDepth === null) return actualDepthMm;
    return Math.abs(sectionDepth - defaultModuleDepthMm) < 0.5
      ? actualDepthMm
      : sectionDepth;
  };
  const effectiveLowerSectionDepth = resolveSectionDepthForRender(placedModule.lowerSectionDepth);
  const effectiveUpperSectionDepth = resolveSectionDepthForRender(placedModule.upperSectionDepth);
  const lowerSectionDir = placedModule.lowerSectionDepthDirection || 'front';
  const upperSectionDir = placedModule.upperSectionDepthDirection || 'front';
  const usesUnifiedSectionDepthDirection = lowerSectionDir === upperSectionDir
    && Math.abs(effectiveLowerSectionDepth - actualDepthMm) < 0.5
    && Math.abs(effectiveUpperSectionDepth - actualDepthMm) < 0.5;
  const usesUnifiedShoeDepthDirection = lowerSectionDir === upperSectionDir
    && Math.abs(effectiveLowerSectionDepth - effectiveUpperSectionDepth) < 0.5;

  // 기둥 앞 공간 가구는 저장된 Z 위치 사용, 일반 가구는 계산된 Z 위치 사용
  // 상부장/하부장/키큰장: backWallGap 0 기준 뒷벽 라인을 맞춘다.
  const isUpperForZ = actualModuleData?.category === 'upper' || placedModule.moduleId?.includes('upper-cabinet');
  // 신발장 카테고리 + 유리장: 뒷벽에 뒷면 정렬 (앞면 맞추는 로직 제거)
  const midForZ = placedModule.moduleId || '';
  const isShoeCabinet = (midForZ.includes('-entryway-') || midForZ.includes('-shelf-') || midForZ.includes('-4drawer-shelf-') || midForZ.includes('-2drawer-shelf-') || midForZ.includes('glass-cabinet'));
  const isKitchenTallCabinet = (
    midForZ.includes('pull-out-cabinet') ||
    midForZ.includes('pantry-cabinet') ||
    midForZ.includes('fridge-cabinet') ||
    midForZ.includes('built-in-fridge')
  );
  const isBackAlignedTallCabinet = actualModuleData?.category === 'full'
    && !isShoeCabinet
    && !midForZ.includes('insert-frame');
  const isLowerForZ = actualModuleData?.category === 'lower'
    || midForZ.startsWith('lower-')
    || midForZ.includes('dual-lower-');
  let furnitureZ: number;
  if (isFrontSpaceFurniture || isSideWallFurniture) {
    furnitureZ = placedModule.position.z;
  } else if (isUpperForZ) {
    // 상부장: 뒷면을 하부장 뒷면에 정렬
    furnitureZ = furnitureZOffset - furnitureDepth / 2 - doorThickness + depth / 2;
  } else if (isKitchenTallCabinet || isBackAlignedTallCabinet) {
    const baseDepth = mmToThreeUnits(defaultModuleDepthMm);
    const fixedBackZ = furnitureZOffset - furnitureDepth / 2 - doorThickness + baseDepthOffset;
    const fixedFrontZ = fixedBackZ + baseDepth;
    furnitureZ = usesUnifiedSectionDepthDirection && lowerSectionDir === 'back'
      ? fixedFrontZ - depth / 2
      : fixedBackZ + depth / 2;
  } else if (isLowerForZ) {
    const lowerBaseDepth = mmToThreeUnits(categoryDefaultDepth ?? defaultModuleDepthMm);
    const fixedBackZ = furnitureZOffset - furnitureDepth / 2 - doorThickness + baseDepthOffset;
    const baseFrontZ = fixedBackZ + lowerBaseDepth;
    furnitureZ = lowerSectionDir === 'back'
      ? baseFrontZ - depth / 2
      : fixedBackZ + depth / 2;
  } else if (isShoeCabinet) {
    // 신발장: 기본은 뒷벽 기준, 앞고정 선택 시 앞면 기준으로 깊이를 줄인다.
    // 도어 안쪽 밀림은 각 도어 렌더러의 로컬 Z에서 처리하고, 본체 기준은 임의로 띄우지 않는다.
    furnitureZ = usesUnifiedShoeDepthDirection && lowerSectionDir === 'back'
      ? furnitureZOffset + furnitureDepth / 2 - doorThickness - depth / 2 + baseDepthOffset
      : furnitureZOffset - furnitureDepth / 2 - doorThickness + depth / 2 + baseDepthOffset;
  } else {
    // 기본은 앞면 정렬 (앞고정: 앞면 고정, 깊이 감소 시 뒷면이 앞으로)
    furnitureZ = furnitureZOffset + furnitureDepth / 2 - doorThickness - depth / 2 + baseDepthOffset;
    // 뒤고정(lowerSectionDepthDirection='front'): 뒷면 고정, 깊이 감소 시 앞면이 뒤로 이동
    // → 중심 Z를 감소량만큼 뒤로 이동
    // 카테고리 기본 깊이로 자동 보정된 값은 현재 기준 깊이로 취급한다.
    // 그렇지 않으면 주방 특수 키큰장처럼 모듈 원 깊이와 기본 깊이가 다른 가구가
    // 기본 깊이를 적용받는 순간 앞/뒤로 한 번 더 밀린다.
    if (usesUnifiedSectionDepthDirection && lowerSectionDir === 'front') {
      const isUsingCategoryDefaultDepth = categoryDefaultDepth !== undefined
        && Math.abs(actualDepthMm - categoryDefaultDepth) < 0.5;
      const baseDepthMm = isUsingCategoryDefaultDepth
        ? actualDepthMm
        : (actualModuleData?.dimensions.depth || actualDepthMm);
      const depthDiffMm = baseDepthMm - actualDepthMm;
      if (depthDiffMm !== 0) {
        furnitureZ -= mmToThreeUnits(depthDiffMm);
      }
    }
  }

  // 뒷벽과 이격: 기본 위치 유지(0=앞면정렬). 양수면 앞으로 이동.
  // (키큰장찬넬은 insertFrontInsetMm으로 내부 프레임만 들이고 가구 위치는 이동 안 함)
  const backWallGapMm = placedModule.backWallGap ?? 0;
  if (!isFrontSpaceFurniture && backWallGapMm > 0) {
    furnitureZ += mmToThreeUnits(backWallGapMm);
  }


  // EP 비대칭 보정: 좌EP만 → 본체 오른쪽으로, 우EP만 → 본체 왼쪽으로
  // 본체 너비가 EP만큼 줄었으므로 본체+EP 전체가 슬롯/위치 중앙에 오도록 보정
  // 도어는 본체 그룹 안에서 렌더링되므로 자동으로 따라감
  // + EP 18.5mm일 때 EP방향으로 0.5mm 추가 이동 (슬롯 기준 18mm와의 차이)
  let epOffsetX = 0;
  // 외치(outside)에서는 본체 폭이 안 줄고 EP가 바깥에 추가되므로 본체 중심 보정 불필요(본체 고정).
  if (!placedModule.customConfig && placedModule.endPanelMode !== 'outside') {
    const epThk = mmToThreeUnits(placedModule.endPanelThickness || END_PANEL_RENDER_THICKNESS);
    const leftEp = placedModule.hasLeftEndPanel ? epThk : 0;
    const rightEp = placedModule.hasRightEndPanel ? epThk : 0;
    epOffsetX = (leftEp - rightEp) / 2; // 좌EP만: 본체 →, 우EP만: 본체 ←
  }

  // 🔴 Z축 디버그
  // console.log('🔴 Z', ...); // 진단용 로그 제거 (성능)

  // 기둥 침범 시에는 adjustedPosition.x(기둥 회피 정렬 위치)를 그대로 사용해야
  // 가구가 기둥 반대쪽으로 밀려 한쪽 방향으로만 줄어든다 (중심 고정 시 양쪽으로 줄어 기둥과 겹침).
  // 슬롯 점프는 store의 slotIndex/position.x 가 바뀌지 않으므로 발생하지 않는다.
  const furnitureGroupPosition: [number, number, number] = [
    (placedModule.isLocked || isSideWallFurniture)
      ? placedModule.position.x
      : adjustedPosition.x + positionAdjustmentForEndPanel + epOffsetX,
    adjustedPosition.y, // finalYPosition 대신 직접 사용 (TDZ 에러 방지)
    furnitureZ
  ];

  const furnitureGroupRotation: [number, number, number] = [
    0,
    (placedModule.rotation * Math.PI) / 180,
    0
  ];
  const isInsertFrameModule = placedModule.moduleId?.includes('insert-frame') === true;
  const isTopPlanView = viewMode === '2D' && view2DDirection === 'top';
  const showInsertFramePlanSettingsIcon = isInsertFrameModule && isTopPlanView;
  const topPlanIconLineOffset = 0.85;
  const editIconForwardOffset = depth / 2 + (showInsertFramePlanSettingsIcon ? topPlanIconLineOffset : 0.5);
  const editIconPosition: [number, number, number] = isSideWallFurniture
    ? [
      furnitureGroupPosition[0] + (placedModule.placementWall === 'left' ? editIconForwardOffset : -editIconForwardOffset),
      furnitureGroupPosition[1] - height / 2 - 3.2,
      furnitureGroupPosition[2]
    ]
    : [
      furnitureGroupPosition[0],
      furnitureGroupPosition[1] - height / 2 - 3.2,
      furnitureGroupPosition[2] + editIconForwardOffset
    ];

  const sideFrameColor = spaceInfo.materialConfig?.doorColor
    || (spaceInfo.materialConfig as any)?.frameColor
    || '#D4C5A9';
  const sideFrameThickness = mmToThreeUnits(END_PANEL_RENDER_THICKNESS);
  const globalTopFrameOffsetMm = (spaceInfo.frameSize as any)?.topOffset;
  const useGlobalTopFrameOffset = spaceInfo.guideTopFrameAllMode ?? true;
  const effectiveTopFrameOffsetMm = typeof placedModule.topFrameOffset === 'number'
    ? placedModule.topFrameOffset
    : (useGlobalTopFrameOffset && typeof globalTopFrameOffsetMm === 'number'
      ? globalTopFrameOffsetMm
      : (globalTopFrameOffsetMm ?? 0));
  const globalBaseFrameOffsetMm = (spaceInfo.baseConfig as any)?.offset;
  const useGlobalBaseFrameOffset = spaceInfo.guideBaseFrameAllMode ?? true;
  const effectiveBaseFrameOffsetMm = typeof placedModule.baseFrameOffset === 'number'
    ? placedModule.baseFrameOffset
    : (useGlobalBaseFrameOffset && typeof globalBaseFrameOffsetMm === 'number'
      ? globalBaseFrameOffsetMm
      : (globalBaseFrameOffsetMm ?? 0));
  const shouldRenderSideWallFrames = isSideWallFurniture
    && !placedModule.moduleId?.includes('insert-frame')
    && !placedModule.isSurroundPanel;
  const sideTopFrame = (() => {
    if (!shouldRenderSideWallFrames) return null;
    if (placedModule.hasTopFrame === false) return null;
    if (actualModuleData?.category === 'lower') return null;

    const rawHeightMm = placedModule.topFrameThickness ?? (spaceInfo.frameSize?.top ?? 30);
    const gapMm = rawHeightMm > 0
      ? Math.max(0, Math.min(rawHeightMm, placedModule.topFrameGap ?? (spaceInfo.frameSize as any)?.topGap ?? 0))
      : 0;
    const visibleHeightMm = Math.max(0, rawHeightMm - gapMm);
    if (visibleHeightMm <= 0.5) return null;

    const worldY = (spaceInfo.height || internalSpace.height) - gapMm - visibleHeightMm / 2;
    return {
      height: mmToThreeUnits(visibleHeightMm),
      y: mmToThreeUnits(worldY) - furnitureGroupPosition[1],
      z: depth / 2 - sideFrameThickness / 2 - mmToThreeUnits(effectiveTopFrameOffsetMm)
    };
  })();
  const sideBaseFrame = (() => {
    if (!shouldRenderSideWallFrames) return null;
    if (placedModule.hasBase === false) return null;
    if (actualModuleData?.category === 'upper' || placedModule.moduleId?.includes('upper-cabinet')) return null;
    if (spaceInfo.baseConfig?.type !== 'floor') return null;

    const rawHeightMm = placedModule.guideSlotPlacement
      ? (placedModule.baseFrameHeight ?? spaceInfo.baseConfig?.height ?? 65)
      : (placedModule.baseFrameHeight ?? (spaceInfo.baseConfig?.height ?? 65));
    const gapMm = rawHeightMm > 0 ? Math.max(0, Math.min(rawHeightMm, (placedModule as any).baseFrameGap ?? 0)) : 0;
    const visibleHeightMm = Math.max(0, rawHeightMm - gapMm);
    if (visibleHeightMm <= 0.5) return null;

    const floorFinishMm = spaceInfo.hasFloorFinish && spaceInfo.floorFinish?.height ? spaceInfo.floorFinish.height : 0;
    const worldY = floorFinishMm + gapMm + visibleHeightMm / 2;
    return {
      height: mmToThreeUnits(visibleHeightMm),
      y: mmToThreeUnits(worldY) - furnitureGroupPosition[1],
      z: depth / 2 - sideFrameThickness / 2 - mmToThreeUnits(20 + (spaceInfo.baseConfig?.depth ?? 0) + effectiveBaseFrameOffsetMm)
    };
  })();

  // Column C 깊이 디버깅
  if (isColumnC && slotInfo) {
  }

  // 기둥 C 디버깅 - 위치는 유지, 깊이만 조정
  if (adjustedDepthMm !== moduleDepth && slotInfo?.hasColumn) {
  }

  // 기둥 C가 있는 경우 디버깅
  if (slotInfo?.hasColumn && slotInfo.columnProcessingMethod === 'depth-adjustment' && slotInfo.column) {
  }

  // 색상 설정: 드래그 중일 때만 색상 전달, 다른 상태에서는 MaterialPanel 색상 사용
  const furnitureColor = isDraggingThis ? '#66ff66' : undefined;

  // 기둥 침범 상황에 따른 최적 힌지 방향 계산 (드래그 중이 아닐 때만)
  let optimalHingePosition = placedModule.hingePosition || (isRightCornerCabinet ? 'left' : 'right');

  // 노서라운드 모드에서 커버도어의 힌지 위치 조정
  if (!isCornerCabinet && spaceInfo.surroundType === 'no-surround' && normalizedSlotIndex !== undefined) {
    const isFirstSlot = normalizedSlotIndex === 0;
    // isLastSlot은 이미 위에서 정의됨

    if (spaceInfo.installType === 'freestanding') {
      if (isFirstSlot) {
        // 첫번째 슬롯: 힌지가 오른쪽에 있어야 왼쪽 엔드패널을 덮음
        optimalHingePosition = 'right';
      } else if (isLastSlot) {
        // 마지막 슬롯: 힌지가 왼쪽에 있어야 오른쪽 엔드패널을 덮음
        optimalHingePosition = 'left';
      }
    } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
      if (isFirstSlot && !spaceInfo.wallConfig?.left) {
        optimalHingePosition = 'right';
      } else if (isLastSlot && !spaceInfo.wallConfig?.right) {
        optimalHingePosition = 'left';
      }
    }
  } else if (shouldApplyColumnAdjustment && slotInfo && slotInfo.hasColumn) {
    // 기둥 침범 상황에 따른 힌지 조정
    optimalHingePosition = calculateOptimalHingePosition(slotInfo);
  }

  // Column C 기둥 앞 가구인지 확인
  const isColumnCFront = isColumnC && placedModule.columnSlotInfo?.spaceType === 'front';

  // adjustedPosition을 memoize하여 참조 안정성 확보
  const memoizedAdjustedPosition = React.useMemo(() => ({
    x: adjustedPosition.x,
    y: adjustedPosition.y,
    z: adjustedPosition.z
  }), [adjustedPosition.x, adjustedPosition.y, adjustedPosition.z]);

  React.useEffect(() => {
    if (!shouldResetCustomDepth) return;
    updatePlacedModule(placedModule.id, { customDepth: undefined });
  }, [shouldResetCustomDepth, placedModule.id, updatePlacedModule]);

  React.useEffect(() => {
    if (categoryDefaultDepth === undefined) return;
    if (placedModule.columnSlotInfo) return;
    const depthToApply = effectiveCustomDepth ?? categoryDefaultDepth;
    const updates: Partial<PlacedModule> = {};
    if (storedCustomDepth === undefined && Math.abs(moduleDepth - categoryDefaultDepth) >= 0.5) {
      updates.customDepth = categoryDefaultDepth;
    }
    const isStaleLowerDepth = placedModule.lowerSectionDepth === undefined
      || (storedCustomDepth === undefined && Math.abs(placedModule.lowerSectionDepth - moduleDepth) < 0.5);
    const isStaleUpperDepth = placedModule.upperSectionDepth === undefined
      || (storedCustomDepth === undefined && Math.abs(placedModule.upperSectionDepth - moduleDepth) < 0.5);
    if (isStaleLowerDepth) updates.lowerSectionDepth = depthToApply;
    if (isStaleUpperDepth) updates.upperSectionDepth = depthToApply;
    if (Object.keys(updates).length === 0) return;
    updatePlacedModule(placedModule.id, updates);
  }, [
    categoryDefaultDepth,
    effectiveCustomDepth,
    moduleDepth,
    placedModule.columnSlotInfo,
    placedModule.id,
    placedModule.lowerSectionDepth,
    placedModule.upperSectionDepth,
    storedCustomDepth,
    updatePlacedModule,
  ]);

  const widthResetPayload = React.useMemo(() => {
    if (!shouldResetWidth) return null;
    return {
      adjustedWidth: undefined,
      adjustedPosition: undefined,
      columnSlotInfo: undefined
    };
  }, [shouldResetWidth]);

  React.useEffect(() => {
    if (!widthResetPayload) return;
    updatePlacedModule(placedModule.id, widthResetPayload);
  }, [widthResetPayload, placedModule.id, updatePlacedModule]);

  const toggleCurrentFurnitureMultiSelection = React.useCallback(() => {
    const uiState = useUIStore.getState();
    const furnitureState = useFurnitureStore.getState();
    const base = [...(uiState.selectedFurnitureIds || [])];
    const addBaseId = (id?: string | null) => {
      if (id && !base.includes(id)) {
        base.push(id);
      }
    };

    addBaseId(uiState.selectedFurnitureId);
    addBaseId(furnitureState.selectedFurnitureId);
    addBaseId(furnitureState.selectedPlacedModuleId);

    const exists = base.includes(placedModule.id);
    const next = exists ? base.filter(id => id !== placedModule.id) : [...base, placedModule.id];
    const activeId = next[next.length - 1] ?? null;

    uiState.setSelectedColumnId(null);
    uiState.setSelectedFurnitureIds(next);
    furnitureState.setSelectedFurnitureId(activeId);
    furnitureState.setSelectedPlacedModuleId(activeId);
  }, [placedModule.id]);

  // 계산된 값들을 상태로 업데이트 - 값이 실제로 변경될 때만 업데이트
  React.useEffect(() => {
    setCalculatedValues(prev => {
      // 값이 실제로 변경되었는지 확인
      const hasChanged =
        prev.isColumnCFront !== isColumnCFront ||
        prev.slotInfoColumn !== slotInfo?.column ||
        prev.indexingColumnWidth !== indexing.columnWidth ||
        prev.adjustedPosition?.x !== memoizedAdjustedPosition.x ||
        prev.adjustedPosition?.y !== memoizedAdjustedPosition.y ||
        prev.adjustedPosition?.z !== memoizedAdjustedPosition.z ||
        prev.actualModuleData?.id !== actualModuleData?.id;

      if (!hasChanged) {
        return prev; // 변경 없으면 이전 값 유지 (리렌더링 방지)
      }

      return {
        isColumnCFront,
        slotInfoColumn: slotInfo?.column,
        indexingColumnWidth: indexing.columnWidth,
        adjustedPosition: memoizedAdjustedPosition,
        actualModuleData
      };
    });
  }, [isColumnCFront, slotInfo?.column, indexing.columnWidth, memoizedAdjustedPosition, actualModuleData]);

  // Column C 전용 이벤트 핸들러 래핑
  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    const nativeEvent = e.nativeEvent as PointerEvent;
    const isMultiSelectPointer = isMultiSelectModifierPressed(nativeEvent);
    if (isMultiSelectPointer) {
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation?.();
      (window as any).__r3fClickHandled = true;
      (window as any).__r3fFurnitureClicked = true;
      (window as any).__multiSelectPointerHandled = placedModule.id;
      toggleCurrentFurnitureMultiSelection();
      return;
    }

    // 잠긴 가구는 이동만 막고 선택/잠금해제 UI는 살아 있어야 한다.
    if (placedModule.isLocked) {
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation?.();
      (window as any).__r3fClickHandled = true;
      (window as any).__r3fFurnitureClicked = true;
      useUIStore.getState().setSelectedColumnId(null);
      useFurnitureStore.getState().setSelectedFurnitureId(placedModule.id);
      useFurnitureStore.getState().setSelectedPlacedModuleId(placedModule.id);
      useUIStore.getState().setSelectedFurnitureId(placedModule.id);
      useUIStore.getState().setSelectedFurnitureIds([placedModule.id]);
      return;
    }

    // slotCustomWidth가 설정된 가구는 드래그(좌우 이동) 불가
    if (placedModule.slotCustomWidth !== undefined) {
      e.stopPropagation();
      return;
    }

    // 편집/이동 모드에서는 드래그 시작 차단 (onClick에서 처리)
    if (isEditMode || (window as any).__furnitureMoveMode) {
      e.stopPropagation();
      return;
    }

    if (isColumnCFront && !isDragMode) {
      // Column C 기둥 앞 가구는 리사이즈 모드
      columnCResize.handlePointerDown(e);
    } else {
      // 일반 가구는 드래그 모드
      onPointerDown(e, placedModule.id);
    }
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (columnCResize.isResizing) {
      columnCResize.handlePointerMove(e);
    } else {
      onPointerMove(e);
    }
  };

  const handlePointerUp = (e?: ThreeEvent<PointerEvent>) => {
    // 편집/이동 모드에서는 pointerUp도 차단
    if (isEditMode || (window as any).__furnitureMoveMode) {
      e?.stopPropagation();
      return;
    }
    if (columnCResize.isResizing) {
      columnCResize.handlePointerUp();
    } else {
      onPointerUp();
    }
  };

  // 위치 변경 로깅은 이미 상단에서 처리됨

  const finalYPosition = adjustedPosition.y;

  if (isUpperCabinet) {
  }

  // 모듈 데이터는 이미 line 458에서 체크했으므로 여기서는 체크하지 않음
  // 이곳에서 early return하면 React Hooks 에러 발생

  // moduleData가 없으면 빈 그룹 반환
  // 도어 크기는 상하부장 배치 여부와 무관하게 항상 동일하게 생성
  // 듀얼 가구인 경우 개별 슬롯 너비 배열 계산
  const calculatedSlotWidths = React.useMemo(() => {
    if (!isDualFurniture) return undefined;

    const localIndex = localSlotIndex ?? placedModule.slotIndex ?? 0;

    // 단내림이 있고 zone 정보가 있는 경우
    if (placedModule.zone && spaceInfo.droppedCeiling?.enabled && zoneSlotInfo) {
      const targetZone = placedModule.zone === 'dropped' && zoneSlotInfo.dropped ? zoneSlotInfo.dropped : zoneSlotInfo.normal;

      if (targetZone.slotWidths && localIndex >= 0 && localIndex < targetZone.slotWidths.length - 1) {
        return [targetZone.slotWidths[localIndex], targetZone.slotWidths[localIndex + 1]];
      }
    }

    // 단내림이 없는 경우
    if (indexing.slotWidths && normalizedSlotIndex !== undefined && normalizedSlotIndex < indexing.slotWidths.length - 1) {
      return [indexing.slotWidths[normalizedSlotIndex], indexing.slotWidths[normalizedSlotIndex + 1]];
    }

    return undefined;
  }, [isDualFurniture, localSlotIndex, placedModule.slotIndex, placedModule.zone, spaceInfo.droppedCeiling?.enabled, zoneSlotInfo, indexing.slotWidths, normalizedSlotIndex]);

  // 측면뷰에서 선택된 슬롯의 가구만 표시 (4분할 뷰 포함)
  // view2DDirection은 prop으로 전달받음 (4분할 뷰에서는 각 패널별로 'left'/'right' 전달)
  // 중요: selectedSlotIndex는 전역 인덱스이므로 globalSlotIndex와 비교해야 함
  if (
    viewMode === '2D' &&
    (view2DDirection === 'left' || view2DDirection === 'right') &&
    selectedSlotIndex !== null
  ) {
    // 전역 인덱스 사용 (단내림 가구도 정확히 비교)
    const furnitureGlobalSlotIndex = globalSlotIndex ?? normalizedSlotIndex;
    if (furnitureGlobalSlotIndex !== undefined) {
      // 듀얼 슬롯 가구인지 확인
      const isDual = isDualFurniture || placedModule.isDualSlot || moduleData?.id?.includes('dual-');
      if (isDual) {
        // 듀얼 슬롯 가구: 현재 슬롯 또는 다음 슬롯에 걸쳐있으면 표시
        if (furnitureGlobalSlotIndex !== selectedSlotIndex && furnitureGlobalSlotIndex + 1 !== selectedSlotIndex) {
          return <group />;
        }
      } else {
        // 단일 슬롯 가구: 정확히 일치해야 표시
        if (furnitureGlobalSlotIndex !== selectedSlotIndex) {
          return <group />;
        }
      }
    }
  }

  // ── 서라운드 패널: moduleData 불필요, 전용 메시로 렌더링 ──
  if (placedModule.isSurroundPanel) {
    const surroundDepth = placedModule.freeDepth || spaceInfo.depth;
    // group position이 이미 패널 중심이므로, 아이콘은 로컬 (0,0,앞쪽)
    const surroundFrontZ = surroundDepth * 0.01 / 2 + (isTopPlanView ? topPlanIconLineOffset : 0.3);
    // 서라운드 패널도 인접 가구(같은 슬롯)의 backWallGap 상속
    let surroundExtraZ = placedModule.backWallGap ?? 0;
    if (surroundExtraZ === 0 && placedModule.slotIndex !== undefined) {
      const comp = placedModules.find((m: any) => m.id !== placedModule.id && m.slotIndex === placedModule.slotIndex && (m.backWallGap ?? 0) > 0);
      if (comp) surroundExtraZ = (comp as any).backWallGap || 0;
    }
    const surroundZ = placedModule.position.z + (surroundExtraZ > 0 ? mmToThreeUnits(surroundExtraZ) : 0);
    return (
      <group
        userData={{ furnitureId: placedModule.id }}
        position={[placedModule.position.x, placedModule.position.y, surroundZ]}
        onClick={(e) => {
          e.stopPropagation();
          (window as any).__r3fClickHandled = true;
          useUIStore.getState().setSelectedColumnId(null);
          useFurnitureStore.getState().setSelectedFurnitureId(placedModule.id);
          useFurnitureStore.getState().setSelectedPlacedModuleId(placedModule.id);
          useUIStore.getState().setSelectedFurnitureId(placedModule.id);
          useUIStore.getState().openFurnitureEditPopup(placedModule.id);
        }}
      >
        <SurroundPanelMesh placedModule={placedModule} renderMode={effectiveRenderMode} viewMode={viewMode} />

        {/* 서라운드 패널 설정 톱니 아이콘 */}
        {(
          <Html
            position={[0, 0, surroundFrontZ]}
            center
            zIndexRange={[100, 0]}
            style={{ userSelect: 'none', pointerEvents: 'auto', zIndex: 9999, background: 'transparent' }}
          >
            <div
              data-surround-options-panel
              style={{
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                border: `2px solid ${getThemeColor()}`,
                borderRadius: '50%',
                backgroundColor: (viewMode === '2D' && view2DTheme === 'dark') ? '#1f2937' : '#ffffff',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
              }}
              onClick={(e) => {
                e.stopPropagation();
                (window as any).__r3fClickHandled = true;
                setShowSurroundOptions(prev => !prev);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              title="서라운드 패널 설정"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={getThemeColor()} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
          </Html>
        )}

        {/* 서라운드 옵셋 팝업 */}
        {showSurroundOptions && (
          <Html
            position={[1.5, 0, surroundFrontZ]}
            center
            zIndexRange={[200, 0]}
            style={{ userSelect: 'none', pointerEvents: 'auto', zIndex: 200, background: 'transparent' }}
          >
            <div
              data-surround-options-panel
              style={{
                background: 'rgba(255, 255, 255, 0.95)',
                borderRadius: '12px',
                border: `2px solid ${getThemeColor()}`,
                boxShadow: `0 4px 16px ${getThemeColor()}33`,
                padding: '12px',
                minWidth: '200px',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                fontSize: '13px',
                color: '#1f2937',
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              {/* 헤더 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontWeight: 600, fontSize: '14px' }}>서라운드 옵셋</span>
                <button
                  onClick={() => setShowSurroundOptions(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#9ca3af', fontSize: '16px', lineHeight: 1 }}
                >✕</button>
              </div>

              {/* 좌/우 옵셋 */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '11px', color: '#6b7280', marginBottom: '3px', display: 'block' }}>좌 ←</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={placedModule.surroundOffsetLeft ?? 0}
                      onChange={(e) => {
                        const v = parseInt(e.target.value) || 0;
                        updatePlacedModule(placedModule.id, { surroundOffsetLeft: v });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowUp') { const v = (placedModule.surroundOffsetLeft ?? 0) + 1; updatePlacedModule(placedModule.id, { surroundOffsetLeft: v }); }
                        if (e.key === 'ArrowDown') { const v = (placedModule.surroundOffsetLeft ?? 0) - 1; updatePlacedModule(placedModule.id, { surroundOffsetLeft: v }); }
                      }}
                      style={{ width: '50px', padding: '4px 6px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '13px', textAlign: 'center', outline: 'none', color: '#000', background: '#fff' }}
                    />
                    <span style={{ fontSize: '11px', color: '#9ca3af' }}>mm</span>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '11px', color: '#6b7280', marginBottom: '3px', display: 'block' }}>우 →</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={placedModule.surroundOffsetRight ?? 0}
                      onChange={(e) => {
                        const v = parseInt(e.target.value) || 0;
                        updatePlacedModule(placedModule.id, { surroundOffsetRight: v });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowUp') { const v = (placedModule.surroundOffsetRight ?? 0) + 1; updatePlacedModule(placedModule.id, { surroundOffsetRight: v }); }
                        if (e.key === 'ArrowDown') { const v = (placedModule.surroundOffsetRight ?? 0) - 1; updatePlacedModule(placedModule.id, { surroundOffsetRight: v }); }
                      }}
                      style={{ width: '50px', padding: '4px 6px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '13px', textAlign: 'center', outline: 'none', color: '#000', background: '#fff' }}
                    />
                    <span style={{ fontSize: '11px', color: '#9ca3af' }}>mm</span>
                  </div>
                </div>
              </div>

              {/* 상/하 옵셋 */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '11px', color: '#6b7280', marginBottom: '3px', display: 'block' }}>상 ↑</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={placedModule.surroundOffsetTop ?? 0}
                      onChange={(e) => {
                        const v = parseInt(e.target.value) || 0;
                        updatePlacedModule(placedModule.id, { surroundOffsetTop: v });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowUp') { const v = (placedModule.surroundOffsetTop ?? 0) + 1; updatePlacedModule(placedModule.id, { surroundOffsetTop: v }); }
                        if (e.key === 'ArrowDown') { const v = (placedModule.surroundOffsetTop ?? 0) - 1; updatePlacedModule(placedModule.id, { surroundOffsetTop: v }); }
                      }}
                      style={{ width: '50px', padding: '4px 6px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '13px', textAlign: 'center', outline: 'none', color: '#000', background: '#fff' }}
                    />
                    <span style={{ fontSize: '11px', color: '#9ca3af' }}>mm</span>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '11px', color: '#6b7280', marginBottom: '3px', display: 'block' }}>하 ↓</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={placedModule.surroundOffsetBottom ?? 0}
                      onChange={(e) => {
                        const v = parseInt(e.target.value) || 0;
                        updatePlacedModule(placedModule.id, { surroundOffsetBottom: v });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowUp') { const v = (placedModule.surroundOffsetBottom ?? 0) + 1; updatePlacedModule(placedModule.id, { surroundOffsetBottom: v }); }
                        if (e.key === 'ArrowDown') { const v = (placedModule.surroundOffsetBottom ?? 0) - 1; updatePlacedModule(placedModule.id, { surroundOffsetBottom: v }); }
                      }}
                      style={{ width: '50px', padding: '4px 6px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '13px', textAlign: 'center', outline: 'none', color: '#000', background: '#fff' }}
                    />
                    <span style={{ fontSize: '11px', color: '#9ca3af' }}>mm</span>
                  </div>
                </div>
              </div>

              {/* 깊이 옵셋 */}
              <div>
                <label style={{ fontSize: '11px', color: '#6b7280', marginBottom: '3px', display: 'block' }}>깊이</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={placedModule.surroundOffsetDepth ?? 0}
                    onChange={(e) => {
                      const v = parseInt(e.target.value) || 0;
                      updatePlacedModule(placedModule.id, { surroundOffsetDepth: v });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowUp') { const v = (placedModule.surroundOffsetDepth ?? 0) + 1; updatePlacedModule(placedModule.id, { surroundOffsetDepth: v }); }
                      if (e.key === 'ArrowDown') { const v = (placedModule.surroundOffsetDepth ?? 0) - 1; updatePlacedModule(placedModule.id, { surroundOffsetDepth: v }); }
                    }}
                    style={{ width: '50px', padding: '4px 6px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '13px', textAlign: 'center', outline: 'none', color: '#000', background: '#fff' }}
                  />
                  <span style={{ fontSize: '11px', color: '#9ca3af' }}>mm</span>
                </div>
              </div>
            </div>
          </Html>
        )}
      </group>
    );
  }

  // moduleData가 없으면 빈 그룹 반환 (모든 Hook 호출 이후)
  if (moduleNotFound || !moduleData) {
    return <group />;
  }

  // 최종 렌더링 위치 로그
  if (placedModule.zone === 'dropped') {
  }

  // 설계모드에서는 설계 중인 가구만 표시, 나머지 숨김
  // 팝업이 열려있다면 해당 가구도 표시 (비정상적인 선택 해제 방어)
  const isCurrentlyDesigning = selectedFurnitureId === placedModule.id ||
    (activePopup.type === 'customizableEdit' && activePopup.id === placedModule.id);
  const hiddenInDesignMode = isLayoutBuilderOpen && !isCurrentlyDesigning;

  return (
    <group userData={{ furnitureId: placedModule.id }} visible={!hiddenInDesignMode && !sideViewHiddenByCamera}>
      {shouldGhostHighlight && width > 0 && height > 0 && depth > 0 && (
        <group position={furnitureGroupPosition} rotation={furnitureGroupRotation}>
          <mesh renderOrder={1000}>
            <boxGeometry args={[width * 1.04, height * 1.04, depth * 1.05]} />
            <meshBasicMaterial
              color={selectionHighlightColor}
              transparent
              opacity={0.32}
              depthWrite={false}
              depthTest={false}
            />
          </mesh>
        </group>
      )}
      {/* 가구 본체 (기둥에 의해 밀려날 수 있음) */}
      <group
        userData={{ furnitureId: placedModule.id, type: 'furniture-body' }}
        position={furnitureGroupPosition}
        rotation={furnitureGroupRotation}
        onContextMenu={(e) => {
          // EP 컨텍스트 메뉴는 키큰장/상부장/하부장 모두에서 사용한다.
          if (!['full', 'upper', 'lower'].includes(actualModuleData?.category ?? '')) return;
          e.stopPropagation();
          const native = e.nativeEvent as MouseEvent;
          native.preventDefault?.();
          useUIStore.getState().openTallEpContextMenu(placedModule.id, native.clientX, native.clientY);
        }}
        onClick={(e) => {
          if (viewMode === '3D' && (isLiveDimensionMode || isTapeMeasureMode)) {
            (window as any).__r3fClickHandled = true;
            (window as any).__r3fFurnitureClicked = true;
            e.stopPropagation();
            return;
          }

          // 이동 모드 중 가구 클릭 → 배치 확정
          if ((window as any).__furnitureMoveMode) {
            e.stopPropagation();
            (window as any).__r3fClickHandled = true;
            window.dispatchEvent(new CustomEvent('furniture-confirm-placement'));
            return;
          }
          // 가구 클릭 → 허공 클릭 deselect 방지 플래그 설정
          (window as any).__r3fClickHandled = true;
          // FreePlacementDropZone의 1프레임 지연 닫기 로직에서 가구 클릭임을 확인하기 위한 플래그
          (window as any).__r3fFurnitureClicked = true;

          // Shift/Ctrl/Cmd+클릭: 다중 선택 토글 (편집 팝업/이동 모드 진입 X)
          const nativeEvent = e.nativeEvent as MouseEvent;
          const isMultiSelectClick = isMultiSelectModifierPressed(nativeEvent);
          if (isMultiSelectClick) {
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation?.();
            if ((window as any).__multiSelectPointerHandled === placedModule.id) {
              (window as any).__multiSelectPointerHandled = null;
              return;
            }
            toggleCurrentFurnitureMultiSelection();
            return;
          }

          // 다중 선택된 가구를 다시 클릭해도 선택 그룹을 단일 선택으로 무너뜨리지 않는다.
          if ((selectedFurnitureIds?.length ?? 0) >= 2 && selectedFurnitureIds.includes(placedModule.id)) {
            e.stopPropagation();
            useUIStore.getState().setSelectedColumnId(null);
            return;
          }

          if (placedModule.groupId) {
            const groupModulesAll = useFurnitureStore.getState().placedModules
              .filter(m => m.groupId === placedModule.groupId);
            const groupIds = groupModulesAll.map(m => m.id);
            if (groupIds.length >= 2) {
              e.stopPropagation();
              (window as any).__r3fClickHandled = true;
              useUIStore.getState().setSelectedColumnId(null);
              // 그룹 묶인 가구는 어떤 멤버를 클릭해도 동일한 그룹 상태 유지.
              //   대표(activeId)는 이미 그룹에서 선택된 가구가 있으면 그대로, 없으면 그룹의 가장 왼쪽 가구.
              const currentActiveId = useFurnitureStore.getState().selectedFurnitureId;
              const isCurrentInGroup = !!currentActiveId && groupIds.includes(currentActiveId);
              const leftmostId = [...groupModulesAll]
                .sort((a, b) => a.position.x - b.position.x)[0]?.id ?? placedModule.id;
              const activeId = isCurrentInGroup ? currentActiveId! : leftmostId;
              useFurnitureStore.getState().setSelectedFurnitureId(activeId);
              useFurnitureStore.getState().setSelectedPlacedModuleId(activeId);
              useUIStore.getState().setSelectedFurnitureIds(groupIds);
              return;
            }
          }

          // 잠긴 가구는 클릭으로 잠금 해제
          if (placedModule.isLocked) {
            e.stopPropagation();
            useUIStore.getState().setSelectedColumnId(null);
            useFurnitureStore.getState().setSelectedFurnitureId(placedModule.id);
            useFurnitureStore.getState().setSelectedPlacedModuleId(placedModule.id);
            useUIStore.getState().setSelectedFurnitureId(placedModule.id);
            useUIStore.getState().setSelectedFurnitureIds([placedModule.id]);
            const updateModule = useFurnitureStore.getState().updateModule;
            updateModule(placedModule.id, { isLocked: false });
            return;
          }

          // 가구 클릭 시 해당 슬롯 선택 (4분할 뷰 또는 미리보기에서 사용)
          if (onFurnitureClick && placedModule.slotIndex !== undefined) {
            e.stopPropagation();
            useUIStore.getState().setSelectedColumnId(null);
            useFurnitureStore.getState().setSelectedFurnitureId(placedModule.id);
            useFurnitureStore.getState().setSelectedPlacedModuleId(placedModule.id);
            useUIStore.getState().setSelectedFurnitureId(placedModule.id);
            onFurnitureClick(placedModule.id, placedModule.slotIndex);
            return;
          } else if (isEditMode) {
            // 편집 모드 중 가구 재클릭 → 이동 모드 진입
            e.stopPropagation();
            (window as any).__r3fClickHandled = true;
            window.dispatchEvent(new CustomEvent('furniture-enter-move-mode', {
              detail: { moduleId: placedModule.id },
            }));
          } else {
            // 원클릭으로 편집 팝업 열기 (고스트 활성화)
            onDoubleClick(e, placedModule.id);
          }
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerOver={() => {
          if (isColumnCFront && !isDragMode) {
            document.body.style.cursor = columnCResize.isResizing ? 'crosshair' : 'move';
          } else {
            document.body.style.cursor = isDragMode ? 'grab' : (isDraggingThis ? 'grabbing' : 'grab');
          }
          setIsHovered(true);
        }}
        onPointerOut={() => {
          if (!columnCResize.isResizing) {
            document.body.style.cursor = 'default';
          }
          setIsHovered(false);
        }}
      >
        {/* 키큰장찬넬(insert-frame) 클릭 영역 확장: 폭이 좁아 다른 가구 사이에 끼면
            마우스로 잡기 어려운 문제를 해결. 투명 박스 메시를 가구 폭의 좌우로
            확장하여 클릭/호버 영역만 넓히고 시각 변화는 없음. (편집 모드에서만,
            드래그 중이 아닐 때) */}
        {placedModule.moduleId?.includes('insert-frame') && width > 0 && height > 0 && depth > 0 && !isDraggingThis && (
          <mesh
            position={[0, 0, 0]}
            userData={{ decoration: 'pick-helper', furnitureId: placedModule.id }}
            renderOrder={-1}
          >
            {/* 클릭 영역을 좌우 +60mm씩 확장 (총 +120mm) — 시각적 표시 없음 */}
            <boxGeometry args={[width + mmToThreeUnits(120), height, depth]} />
            <meshBasicMaterial
              transparent
              opacity={0}
              depthWrite={false}
              depthTest={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        )}
        {placedModule.groupId && !readOnly && width > 0 && height > 0 && depth > 0 && (
          <Html
            position={[0, 0, depth / 2 + 0.04]}
            center
            occlude={false}
            zIndexRange={[9000, 9001]}
            style={{
              pointerEvents: 'none',
              userSelect: 'none',
              background: 'transparent'
            }}
          >
            <div
              style={{
                width: '30px',
                height: '30px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                background: 'rgba(45, 45, 45, 0.72)',
                border: '1px solid rgba(255, 255, 255, 0.55)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.22)'
              }}
            >
              <FaRegObjectGroup size={15} color="#ffffff" />
            </div>
          </Html>
        )}
        {shouldRenderColumnActionControls && width > 0 && height > 0 && depth > 0 && (
          <>
            {/* 선택 하이라이트: 3D에서만 표시 (2D에서는 치수 확인을 위해 숨김) */}
            {isSelected && viewMode === '3D' && (
              <mesh
                ref={highlightMeshRef}
                position={[0, 0, 0]}
                renderOrder={999}
                userData={{ decoration: 'selection-highlight', furnitureId: placedModule.id }}
              >
                <boxGeometry args={[width + highlightPadding, height + highlightPadding, depth + highlightPadding]} />
                <meshBasicMaterial
                  color={placedModule.isLocked ? "#ff3333" : selectionHighlightColor}
                  transparent
                  opacity={placedModule.isLocked ? 0.08 : 0.12}
                  depthWrite={false}
                  depthTest={false}
                  side={THREE.DoubleSide}
                  toneMapped={false}
                />
              </mesh>
            )}

            {/* 가구 상단 아이콘 툴바 (readOnly에서는 숨김, 2D 측면/상면뷰에서는 숨김)
                다중 선택 시: 마지막에 선택한 가구 위에 통합 툴바 1개만 표시.
                그룹 다중선택일 땐 그룹 X 중앙으로 이동하여 양쪽 끝의 가운데에 표시. */}
            {isSelected && !isPanelListTabActive && !readOnly && (viewMode === '3D' || view2DDirection === 'front' || view2DDirection === 'all')
              && (
                (selectedFurnitureIds?.length ?? 0) < 2
                || selectedFurnitureIds[selectedFurnitureIds.length - 1] === placedModule.id
              )
              && (
              <Html
                position={(() => {
                  const baseY = height / 2 + mmToThreeUnits(50);
                  const baseZ = depth / 2 + 0.03;
                  const ids = selectedFurnitureIds ?? [];
                  if (ids.length >= 2) {
                    const groupMembers = placedModules.filter(m => ids.includes(m.id) && !m.isSurroundPanel);
                    if (groupMembers.length >= 2) {
                      const xs = groupMembers.map(m => m.position.x);
                      const groupCenterX = (Math.min(...xs) + Math.max(...xs)) / 2;
                      // 로컬 좌표계 기준 오프셋: 그룹 중심 - 자기 위치
                      const localOffsetX = groupCenterX - placedModule.position.x;
                      return [localOffsetX, baseY, baseZ] as [number, number, number];
                    }
                  }
                  return [0, baseY, baseZ] as [number, number, number];
                })()}
                center
                occlude={false}
                zIndexRange={[10000, 10001]}
                style={{
                  pointerEvents: 'auto',
                  userSelect: 'none',
                  background: 'transparent'
                }}
              >
                <div
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.nativeEvent.stopImmediatePropagation();
                    (window as any).__r3fClickHandled = true;
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    e.nativeEvent.stopImmediatePropagation();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.nativeEvent.stopImmediatePropagation();
                  }}
                  style={{
                    display: 'flex',
                    gap: '8px',
                    background: 'rgba(70, 70, 70, 0.7)',
                    borderRadius: '18px',
                    padding: '6px 12px',
                    boxShadow: '0 3px 12px rgba(0,0,0,0.25)'
                  }}
                >
                  {selectedFurnitureCount >= 2 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        (window as any).__r3fClickHandled = true;
                        const updatePlacedModule = useFurnitureStore.getState().updatePlacedModule;
                        const placed = useFurnitureStore.getState().placedModules;
                        const ids = (useUIStore.getState().selectedFurnitureIds || [])
                          .filter(id => {
                            const m = placed.find(p => p.id === id);
                            return !!m && !(m as any).isLocked;
                          });
                        if (ids.length < 2) return;
                        const selectedModules = ids
                          .map(id => placed.find(p => p.id === id))
                          .filter(Boolean) as typeof placed;
                        const selectedGroupIds = Array.from(new Set(
                          selectedModules
                            .map(module => module.groupId)
                            .filter(Boolean)
                        ));
                        const shouldUngroup = selectedGroupIds.length === 1
                          && selectedModules.length === ids.length
                          && selectedModules.every(module => module.groupId === selectedGroupIds[0]);
                        if (shouldUngroup) {
                          ids.forEach(id => updatePlacedModule(id, { groupId: undefined }));
                          useUIStore.getState().setSelectedFurnitureIds(ids);
                          return;
                        }
                        const groupId = `furniture-group-${Date.now()}`;
                        ids.forEach(id => updatePlacedModule(id, { groupId }));
                        useUIStore.getState().setSelectedFurnitureIds(ids);
                      }}
                      style={{
                        width: '24px',
                        height: '24px',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: '0',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'opacity 0.2s',
                        padding: 0
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'}
                      onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                      title="그룹 묶기/해제"
                    >
                      <FaRegObjectGroup size={16} color="#ffffff" />
                    </button>
                  )}

                  {/* 잠금 버튼 — 슬롯/자유배치 모두 표시. 다중 선택 시 모든 선택 가구 일괄 토글 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      (window as any).__r3fClickHandled = true;
                      const updatePlacedModule = useFurnitureStore.getState().updatePlacedModule;
                      const ids = (selectedFurnitureIds?.length ?? 0) >= 2 ? selectedFurnitureIds : [placedModule.id];
                      const newLockedState = !placedModule.isLocked;
                      ids.forEach(id => updatePlacedModule(id, { isLocked: newLockedState }));
                    }}
                    style={{
                      width: '24px',
                      height: '24px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: '0',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'opacity 0.2s',
                      padding: 0
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="5" y="11" width="14" height="10" rx="2" />
                      <path d="M12 17a1 1 0 100-2 1 1 0 000 2z" fill="white" />
                      {placedModule.isLocked ? (
                        <path d="M7 11V7a5 5 0 0110 0v4" />
                      ) : (
                        <path d="M7 11V7a5 5 0 019.9-1" />
                      )}
                    </svg>
                  </button>

                  {/* 삭제 버튼 — 다중 선택 시 모든 비잠금 선택 가구 일괄 삭제 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      (window as any).__r3fClickHandled = true;
                      const removeModule = useFurnitureStore.getState().removeModule;
                      const placed = useFurnitureStore.getState().placedModules;
                      const ids = (selectedFurnitureIds?.length ?? 0) >= 2 ? selectedFurnitureIds : [placedModule.id];
                      ids.forEach(id => {
                        const m = placed.find(p => p.id === id);
                        if (!m || (m as any).isLocked) return;
                        removeModule(id);
                      });
                    }}
                    style={{
                      width: '24px',
                      height: '24px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: '0',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'opacity 0.2s',
                      padding: 0
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18" />
                      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
                      <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                  </button>

                  {/* 복제 버튼 — 다중 선택 시 모든 비잠금 선택 가구 일괄 복제 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      (window as any).__r3fClickHandled = true;
                      const placed = useFurnitureStore.getState().placedModules;
                      const ids = (selectedFurnitureIds?.length ?? 0) >= 2 ? selectedFurnitureIds : [placedModule.id];
                      ids.forEach(id => {
                        const m = placed.find(p => p.id === id);
                        if (!m || (m as any).isLocked) return;
                        window.dispatchEvent(new CustomEvent('duplicate-furniture', {
                          detail: { furnitureId: id }
                        }));
                      });
                    }}
                    style={{
                      width: '24px',
                      height: '24px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: '0',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'opacity 0.2s',
                      padding: 0
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                  </button>
                </div>
              </Html>
            )}

            {/* 앞↔측면 배치 전환 화살표 — 가구 선택 시 가구↔기둥 사이 표시 */}
            {/* 기둥 타입(columnType)과 무관하게 기둥이 있고 가구 앞 여유가 있으면 전환 가능 */}
            {shouldRenderColumnActionControls && !readOnly && columnActionSlotInfo?.hasColumn && columnActionSlotInfo.column && (() => {
              const columnDepthMm = columnActionSlotInfo.column.depth;
              const actionModule = columnActionModule ?? placedModule;
              const actionModuleData = actionModule.id === placedModule.id
                ? actualModuleData
                : getModuleById(actionModule.moduleId, internalSpace, spaceInfo);
              const originalDepth = actionModuleData?.dimensions.depth || (actionModule as any).freeDepth || (actionModule as any).customDepth || 600;
              const isFrontMode = (actionModule as any).columnPlacementMode === 'front';
              // front 모드가 아닐 때: 가구깊이 - 기둥깊이 >= 290 필요 (앞 배치 후 최소 깊이 확보)
              if (!isFrontMode) {
                const depthDiff = ((actionModule as any).customDepth ?? originalDepth) - columnDepthMm;
                if (depthDiff < 290 && !usesGroupedColumnAction) return null;
              }

              // 양쪽(좌·우) 모두 화살표 표시. 클릭 시 동일하게 측면↔앞 토글.
              const arrowZ = depth / 2 + 0.05;

              const handleArrowClick = () => {
                (window as any).__r3fClickHandled = true;
                const storeSelectedIds = useUIStore.getState().selectedFurnitureIds || [];
                const renderedSelectedIds = selectedFurnitureIds || [];
                const placed = useFurnitureStore.getState().placedModules;
                const groupIds = placedModule.groupId
                  ? placed
                    .filter(m => m.groupId === placedModule.groupId)
                    .map(m => m.id)
                  : [];
                const ids = Array.from(new Set(
                  (groupIds.length >= 2 ? groupIds : storeSelectedIds.length >= 2 ? storeSelectedIds : renderedSelectedIds.length >= 2 ? renderedSelectedIds : [placedModule.id])
                ));
                const nextFrontMode = !isFrontMode;

                ids.forEach((id) => {
                  const targetModule = placed.find(m => m.id === id);
                  if (!targetModule || (targetModule as any).isLocked) return;

                  const targetGlobalSlotIndex = convertZoneToGlobalIndex(
                    targetModule.slotIndex,
                    targetModule.zone as 'normal' | 'dropped'
                  );
                  const targetSlotInfo = targetGlobalSlotIndex !== undefined
                    ? columnSlots[targetGlobalSlotIndex]
                    : undefined;
                  if (!targetSlotInfo?.hasColumn || !targetSlotInfo.column) return;

                  if (!nextFrontMode) {
                    updatePlacedModule(id, {
                      customDepth: undefined,
                      lowerSectionDepth: undefined,
                      upperSectionDepth: undefined,
                      lowerSectionDepthDirection: undefined,
                      upperSectionDepthDirection: undefined,
                      columnPlacementMode: undefined,
                    } as any);
                    return;
                  }

                  const targetModuleData = getModuleById(
                    targetModule.moduleId,
                    internalSpace,
                    spaceInfo
                  );
                  const targetOriginalDepth = targetModuleData?.dimensions.depth
                    || (targetModule as any).freeDepth
                    || (targetModule as any).customDepth
                    || originalDepth;
                  const targetDepth = ((targetModule as any).customDepth ?? targetOriginalDepth) - targetSlotInfo.column.depth;
                  if (targetDepth < 290) return;

                  updatePlacedModule(id, {
                    customDepth: targetDepth,
                    lowerSectionDepth: targetDepth,
                    upperSectionDepth: targetDepth,
                    lowerSectionDepthDirection: 'back',
                    upperSectionDepthDirection: 'back',
                    customWidth: undefined,
                    adjustedWidth: undefined,
                    columnPlacementMode: 'front',
                  } as any);
                });
              };

              const renderArrow = (side: 'left' | 'right') => (
                <Html
                  key={side}
                  position={[side === 'left' ? -mmToThreeUnits(100) : mmToThreeUnits(100), 0, arrowZ]}
                  center
                  zIndexRange={[10000, 10001]}
                  style={{ pointerEvents: 'auto', userSelect: 'none', background: 'transparent' }}
                >
                  <button
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      (window as any).__r3fClickHandled = true;
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleArrowClick();
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                    style={{
                      width: '32px', height: '32px', borderRadius: '20px', border: 'none',
                      background: 'rgba(70, 70, 70, 0.75)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', boxShadow: '0 3px 12px rgba(0,0,0,0.25)',
                      padding: 0, transition: 'opacity 0.2s',
                    }}
                    title={isFrontMode ? '기둥 측면 배치로 복원' : '기둥 앞으로 배치'}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {side === 'left' ? (
                        <polyline points="15 18 9 12 15 6" />
                      ) : (
                        <polyline points="9 18 15 12 9 6" />
                      )}
                    </svg>
                  </button>
                </Html>
              );

              return (
                <>
                  {renderArrow('left')}
                  {renderArrow('right')}
                </>
              );
            })()}

          </>
        )}

        {/* 잠긴 가구 중앙에 자물쇠 아이콘 표시 (선택 여부와 무관, readOnly 모드에서는 숨김) */}
        {placedModule.isLocked && !readOnly && (
          <Html
            position={[0, 0, 0]}
            center
            style={{
              pointerEvents: 'none',
              userSelect: 'none',
              background: 'transparent'
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                background: 'rgba(255, 51, 51, 0.5)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
                border: '2px solid rgba(255, 255, 255, 0.3)'
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z" />
              </svg>
            </div>
          </Html>
        )}

        {/* 노서라운드 모드에서 가구 위치 디버깅 */}
        {spaceInfo.surroundType === 'no-surround' && spaceInfo.gapConfig && (() => {
          return null;
        })()}

        {/* 가구 타입에 따라 다른 컴포넌트 렌더링 */}
        {moduleData.type === 'box' ? (
          // 박스형 가구 렌더링 (도어 제외)
          <>
            {(() => {
              // 듀얼 가구이고 측면뷰인 경우, 표시할 섹션 계산
              let visibleSectionIndex: number | null = null;
              if (
                viewMode === '2D' &&
                placedModule.isDualSlot &&
                (view2DDirection === 'left' || view2DDirection === 'right') &&
                normalizedSlotIndex !== undefined
              ) {
                if (selectedSlotIndex !== null) {
                  // 슬롯이 선택된 경우: 선택된 슬롯에 따라 섹션 표시
                  if (normalizedSlotIndex === selectedSlotIndex) {
                    // 첫 번째 슬롯 선택 → 좌측 섹션 (인덱스 0)
                    visibleSectionIndex = 0;
                  } else if (normalizedSlotIndex + 1 === selectedSlotIndex) {
                    // 두 번째 슬롯 선택 → 우측 섹션 (인덱스 1)
                    visibleSectionIndex = 1;
                  }
                } else {
                  // 슬롯이 선택되지 않은 경우: view2DDirection에 따라 자동 선택
                  if (view2DDirection === 'left') {
                    // 좌측뷰 → 첫 번째 슬롯 (좌측 섹션)
                    visibleSectionIndex = 0;
                  } else if (view2DDirection === 'right') {
                    // 우측뷰 → 두 번째 슬롯 (우측 섹션)
                    visibleSectionIndex = 1;
                  }
                }
              }

              debugLog('🔍 FurnitureItem - visibleSectionIndex 계산:', {
                isDualSlot: placedModule.isDualSlot,
                view2DDirection,
                selectedSlotIndex,
                slotIndex: normalizedSlotIndex,
                visibleSectionIndex,
                furnitureId: placedModule.id
              });

              // customSections의 선반 갯수 변경 시에만 BoxModule 리마운트
              // shelfPositions는 prop으로 갱신만 → 듀얼 W 변경 시 width에 비례해 재계산되어도
              // BoxModule이 remount되지 않아 클릭 race(팝업 안 뜨는 현상) 방지
              // 도어분절 가구: 섹션 높이 변경 시 분절 위치 갱신을 위해 height도 key에 포함
              const isDoorSplitForKey = !!(actualModuleData?.id?.includes('shelf-split') || actualModuleData?.id?.includes('pantry-cabinet-split'));
              const customSectionsKey = adjustedCustomSections
                ? adjustedCustomSections.map((s: any) => {
                    if (!isDoorSplitForKey) return `${s.count || 0}`;
                    const shelfKey = Array.isArray(s.shelfPositions)
                      ? s.shelfPositions.map((position: number) => Math.round(position)).join(',')
                      : '';
                    return `${s.count || 0}h${Math.round(s.height || 0)}p${shelfKey}`;
                  }).join('|')
                : '';
              // removeUpperSafetyShelf 토글 변경 시에도 BoxModule 리마운트 (편집 중 고스트 실시간 반영)
              const removeUpperSafetyShelfKey = placedModule.removeUpperSafetyShelf ? '1' : '0';
              const doorInstallKey = placedModule.hasDoor ? 'door1' : 'door0';
              const isUpperShelfForKey = actualModuleData?.category === 'upper' && !!(
                actualModuleData.modelConfig?.sections?.some((section: any) => section.type === 'shelf') ||
                actualModuleData.modelConfig?.leftSections?.some((section: any) => section.type === 'shelf')
              );
              const upperShelfPositionsKey = isUpperShelfForKey && adjustedCustomSections
                ? adjustedCustomSections.map((section: any) => (
                  Array.isArray(section.shelfPositions)
                    ? section.shelfPositions.map((position: number) => Math.round(position)).join(',')
                    : ''
                )).join('|')
                : '';
              // key에서 height를 제거 — H 변경마다 BoxModule이 unmount/remount 되면서
              // 그 1~2 프레임 사이 클릭이 raycaster에 안 잡혀 "허공 클릭"으로 처리되어
              // closeAllPopups()가 호출되는 race를 막음. H는 internalHeight prop으로 반영.
              return (
                <BoxModule
                  key={`boxmodule-${placedModule.id}-${customSectionsKey}-usp${upperShelfPositionsKey}-rus${removeUpperSafetyShelfKey}-${doorInstallKey}`}
                  moduleData={renderModuleData}
                  isDragging={isDraggingThis} // 드래그 중에만 고스트 투명 표시 (내부 선반/서랍 숨김)
                  isEditMode={isEditModeForView} // 편집 모드 고스트: 측면/상면뷰에서는 숨김
                  color={furnitureColor}
                  internalHeight={furnitureHeightMm}
                  viewMode={viewMode}
                  renderMode={effectiveRenderMode}
                  hasDoor={
                    // 기둥 A(deep) 또는 adjustedWidth가 있는 경우(front 모드 제외) 또는 엔드패널 조정: 도어는 cover-door 블록에서 별도 렌더
                    placedModule.columnPlacementMode === 'front'
                      ? false // front 모드: cover-door 블록에서 렌더
                      : (
                        (slotInfo && slotInfo.hasColumn && (slotInfo.columnType === 'deep' || (placedModule.adjustedWidth !== undefined && placedModule.adjustedWidth !== null))) || needsEndPanelAdjustment
                          ? false
                          : (placedModule.hasDoor ?? false)
                      )
                  }
                  customDepth={actualDepthMm}
                  hingePosition={optimalHingePosition}
                  spaceInfo={zoneSpaceInfo}
                  doorWidth={originalSlotWidthMm + doorWidthExpansion} // 도어 너비에 확장분 추가
                  originalSlotWidth={originalSlotWidthMm}
                  slotCenterX={doorXOffset} // 도어 위치 오프셋 적용
                  adjustedWidth={furnitureWidthMm} // 조정된 너비를 adjustedWidth로 전달
                  slotIndex={normalizedSlotIndex} // 슬롯 인덱스 전달
                  slotInfo={slotInfo} // 슬롯 정보 전달 (기둥 침범 여부 포함)
                  slotWidths={calculatedSlotWidths}
                  isHighlighted={isSelected && !isEditMode} // 선택 상태 전달 (편집 모드에서는 하이라이트 비활성)
                  placedFurnitureId={placedModule.id} // 배치된 가구 ID 전달 (치수 편집용)
                  customSections={adjustedCustomSections} // 사용자 정의 섹션 설정 (단내림 구간에서 조정됨)
                  showFurniture={showFurniture} // 가구 본체 표시 여부
                  visibleSectionIndex={visibleSectionIndex} // 듀얼 가구 섹션 필터링
                  doorTopGap={storeDoorTopGap ?? placedModule.doorTopGap ?? globalDoorTopGapForCategory} // store 우선 → prop → 카테고리 글로벌 폴백
                  doorBottomGap={storeDoorBottomGap ?? placedModule.doorBottomGap ?? globalDoorBottomGapForCategory} // store 우선 → prop → 카테고리 글로벌 폴백
                  lowerSectionDepth={effectiveLowerSectionDepth} // 하부 섹션 깊이 (mm)
                  upperSectionDepth={effectiveUpperSectionDepth} // 상부 섹션 깊이 (mm)
                  lowerSectionDepthDirection={placedModule.lowerSectionDepthDirection} // 하부 깊이 줄이는 방향
                  upperSectionDepthDirection={placedModule.upperSectionDepthDirection} // 상부 깊이 줄이는 방향
                  lowerSectionWidth={placedModule.lowerSectionWidth} // 하부 섹션 너비 (mm)
                  upperSectionWidth={placedModule.upperSectionWidth} // 상부 섹션 너비 (mm)
                  lowerSectionWidthDirection={placedModule.lowerSectionWidthDirection} // 하부 너비 줄이는 방향
                  upperSectionWidthDirection={placedModule.upperSectionWidthDirection} // 상부 너비 줄이는 방향
                  lowerLeftSectionDepth={placedModule.lowerLeftSectionDepth} // 하부 좌측 영역 깊이 (mm)
                  lowerRightSectionDepth={placedModule.lowerRightSectionDepth} // 하부 우측 영역 깊이 (mm)
                  lowerSectionTopOffset={placedModule.lowerSectionTopOffset} // 하부 섹션 상판 오프셋 (mm) - 각 가구별 저장된 값 사용
                  backPanelThickness={placedModule.backPanelThickness} // 백패널 두께 (mm)
                  hasLeftEndPanel={placedModule.hasLeftEndPanel}
                  hasRightEndPanel={placedModule.hasRightEndPanel}
                  endPanelThickness={placedModule.endPanelThickness}
                  endPanelDepth={placedModule.endPanelDepth}
                  endPanelDepthDirection={placedModule.endPanelDepthDirection}
                  leftEndPanelOffset={placedModule.leftEndPanelOffset ?? placedModule.endPanelOffset}
                  rightEndPanelOffset={placedModule.rightEndPanelOffset ?? placedModule.endPanelOffset}
                  leftEndPanelBackOffset={placedModule.leftEndPanelBackOffset}
                  rightEndPanelBackOffset={placedModule.rightEndPanelBackOffset}
                  leftEndPanelOffsetDir={placedModule.leftEndPanelOffsetDir}
                  rightEndPanelOffsetDir={placedModule.rightEndPanelOffsetDir}
                  doorSplit={placedModule.doorSplit}
                  upperDoorTopGap={placedModule.upperDoorTopGap}
                  upperDoorBottomGap={placedModule.upperDoorBottomGap}
                  lowerDoorTopGap={placedModule.lowerDoorTopGap}
                  lowerDoorBottomGap={placedModule.lowerDoorBottomGap}
                  grainDirection={placedModule.grainDirection} // 텍스처 결 방향 (하위 호환성)
                  panelGrainDirections={(() => {
                    debugLog('🚨 FurnitureItem - placedModule 체크:', {
                      id: placedModule.id,
                      hasPanelGrainDirections: !!placedModule.panelGrainDirections,
                      panelGrainDirections: placedModule.panelGrainDirections,
                      panelGrainDirectionsType: typeof placedModule.panelGrainDirections,
                      panelGrainDirectionsKeys: placedModule.panelGrainDirections ? Object.keys(placedModule.panelGrainDirections) : []
                    });
                    return placedModule.panelGrainDirections;
                  })()} // 패널별 개별 결 방향
                  zone={effectiveZone}
                  isFreePlacement={placedModule.isFreePlacement}
                  topFrameThickness={placedModule.topFrameThickness}
                  topFrameOffset={effectiveTopFrameOffsetMm}
                  topFrameGap={placedModule.topFrameGap}
                  hasTopFrame={placedModule.hasTopFrame}
                  hasBase={placedModule.hasBase}
                  baseFrameHeight={placedModule.baseFrameHeight}
                  baseFrameOffset={effectiveBaseFrameOffsetMm}
                  baseFrameGap={(placedModule as any).baseFrameGap}
                  individualFloatHeight={placedModule.individualFloatHeight}
                  isCustomizable={placedModule.isCustomizable}
                  customConfig={placedModule.customConfig}
                  parentGroupY={adjustedPosition.y}
                  endPanelHeightMode={placedModule.endPanelHeightMode}
                  topPanelNotchSize={placedModule.topPanelNotchSize}
                  topPanelNotchSide={placedModule.topPanelNotchSide}
                />
              );
            })()}

            {sideTopFrame && (
              <Box
                args={[width, sideTopFrame.height, sideFrameThickness]}
                position={[0, sideTopFrame.y, sideTopFrame.z]}
              >
                <meshStandardMaterial color={sideFrameColor} roughness={0.48} metalness={0.06} />
                <Edges color={getEdgeColor(sideFrameColor)} />
              </Box>
            )}

            {sideBaseFrame && (
              <Box
                args={[width, sideBaseFrame.height, sideFrameThickness]}
                position={[0, sideBaseFrame.y, sideBaseFrame.z]}
              >
                <meshStandardMaterial color={sideFrameColor} roughness={0.48} metalness={0.06} />
                <Edges color={getEdgeColor(sideFrameColor)} />
              </Box>
            )}

            {/* 가구 너비 디버깅 */}
            {(() => {
              const slotWidthMm = (() => {
                if (placedModule.zone && spaceInfo.droppedCeiling?.enabled && indexing.zones) {
                  const targetZone = placedModule.zone === 'dropped' && indexing.zones.dropped ? indexing.zones.dropped : indexing.zones.normal;
                  const zoneIndex = localSlotIndex ?? placedModule.slotIndex;
                  if (zoneIndex !== undefined) {
                    return targetZone.slotWidths?.[zoneIndex] || targetZone.columnWidth;
                  }
                  return targetZone.columnWidth;
                }
                if (normalizedSlotIndex !== undefined) {
                  return indexing.slotWidths?.[normalizedSlotIndex] || indexing.columnWidth;
                }
                return indexing.columnWidth;
              })();

              const expectedThreeUnits = mmToThreeUnits(slotWidthMm);
              const actualThreeUnits = mmToThreeUnits(furnitureWidthMm);

              return null;
            })()}

            {/* 표준 모듈 엔드패널 렌더링 — 바닥까지 내려옴 */}
            {!placedModule.customConfig && (() => {
              const hasLeft = placedModule.hasLeftEndPanel;
              const hasRight = placedModule.hasRightEndPanel;
              if (!hasLeft && !hasRight) return null;

              // 인접 가구 판단: EP 방향에 같은 높이(full) 가구가 있을 때만 측판 생략
              // 키큰장(full) 옆에 하부장(lower)/상부장(upper)이 있으면 높이 차이로 측판 노출 → 측판 필요
              const mySlot = placedModule.slotIndex;
              const myZone = placedModule.zone || 'normal';
              const isDual = placedModule.isDualSlot;
              const furnitureCategory = actualModuleData?.category;
              const isSlotAdjacent = (m: typeof placedModule, targetSlot: number) =>
                m.id !== placedModule.id && !m.isFreePlacement && (m.zone || 'normal') === myZone &&
                m.slotIndex !== undefined && (m.slotIndex === targetSlot || (m.isDualSlot && m.slotIndex === targetSlot - 1));
              const isSameHeightAdjacent = (m: typeof placedModule) => {
                // 인접 가구가 본인보다 얕으면(앞면 일치 안함) 측면 노출 → 측판 필요
                const adjData = getModuleById(m.moduleId, internalSpace, spaceInfo);
                const adjDepth = (m as any).customDepth || (m as any).freeDepth || adjData?.dimensions?.depth || 0;
                const myDepth = placedModule.customDepth || (placedModule as any).freeDepth || actualModuleData?.dimensions?.depth || 0;
                if (adjDepth > 0 && myDepth > 0 && adjDepth < myDepth - 1) {
                  return false; // 인접이 얕음 → 본인 측면 일부 노출 → 측판 필요
                }
                // full(키큰장)의 EP → 인접도 full이어야 측판 생략
                if (furnitureCategory === 'full') {
                  return adjData?.category === 'full';
                }
                // upper/lower는 기존 로직 유지 (인접 가구 있으면 측판 생략)
                return true;
              };
              const leftAdjacentExists = mySlot !== undefined && placedModules.some(m => {
                const adjSlot = isDual ? mySlot - 1 : mySlot - 1;
                return isSlotAdjacent(m, adjSlot) && isSameHeightAdjacent(m);
              });
              const rightSlotEnd = isDual && mySlot !== undefined ? mySlot + 1 : mySlot;
              const rightAdjacentExists = rightSlotEnd !== undefined && placedModules.some(m =>
                m.id !== placedModule.id && !m.isFreePlacement && (m.zone || 'normal') === myZone &&
                m.slotIndex !== undefined && (m.slotIndex === rightSlotEnd + 1 || (m.isDualSlot && m.slotIndex === rightSlotEnd + 1))
                && isSameHeightAdjacent(m)
              );

              const epThicknessMm = resolvePetPanelThicknessMm(placedModule.endPanelThickness);
              const epW = mmToThreeUnits(epThicknessMm);
              // EP 깊이: endPanelDepth(사용자 명시) 우선, 없으면 customDepth/actualDepthMm/dimensions.depth 순
              const epTemplateDepth = actualModuleData?.dimensions?.depth || 600;
              const epOwnDepth = placedModule.endPanelDepth
                ?? placedModule.customDepth
                ?? actualDepthMm
                ?? epTemplateDepth;
              const epDepthMm = epOwnDepth;
              const epD = mmToThreeUnits(epDepthMm);
              // 앞/뒤 옵셋: + 늘림, - 줄임. 깊이 = base + front + back, Z = (front - back) / 2
              const leftFront = mmToThreeUnits(placedModule.leftEndPanelOffset ?? 0);
              const leftBack = mmToThreeUnits(placedModule.leftEndPanelBackOffset ?? 0);
              const leftEpD = Math.max(0, epD + leftFront + leftBack);
              const leftEpZShift = (leftFront - leftBack) / 2;
              const rightFront = mmToThreeUnits(placedModule.rightEndPanelOffset ?? 0);
              const rightBack = mmToThreeUnits(placedModule.rightEndPanelBackOffset ?? 0);
              const rightEpD = Math.max(0, epD + rightFront + rightBack);
              const rightEpZShift = (rightFront - rightBack) / 2;

              // EP 높이 계산: 상단/하단 갭은 모두 가구 몸통 기준 바깥 방향
              const groupY = adjustedPosition.y; // Three.js 단위 (가구 중심 Y)
              const defaultEpTopOffsetMm = placedModule.hasTopFrame === false
                ? 0
                : (placedModule.topFrameThickness ?? (spaceInfo.frameSize?.top ?? 30));
              const defaultEpBottomOffsetMm = placedModule.hasBase === false
                ? 0
                : (spaceInfo.baseConfig?.type === 'stand'
                  ? 0
                  : (placedModule.baseFrameHeight ?? (spaceInfo.baseConfig?.height ?? 65)));
              // 사용자가 명시한 값(0 포함, undefined가 아니면)을 우선 사용. undefined일 때만 default.
              const epTopOffsetMm = placedModule.hasTopFrame === false
                ? 0
                : (placedModule.endPanelTopOffset !== undefined ? (placedModule.endPanelTopOffset as number) : defaultEpTopOffsetMm);
              const epBottomOffsetMm = placedModule.hasBase === false
                ? 0
                : (placedModule.endPanelBottomOffset !== undefined ? (placedModule.endPanelBottomOffset as number) : defaultEpBottomOffsetMm);
              const topOff = mmToThreeUnits(epTopOffsetMm);
              const bottomOff = mmToThreeUnits(epBottomOffsetMm);

              const furnitureTop = groupY + height / 2;
              const furnitureBottom = groupY - height / 2;
              const epTopWorld = furnitureTop + topOff;
              const epBottomWorld = furnitureBottom - bottomOff;

              let epH: number;
              let epYRelative: number;
              epH = Math.max(0, epTopWorld - epBottomWorld);
              const epCenterWorld = epBottomWorld + epH / 2;
              epYRelative = epCenterWorld - groupY;

              return (
                <>
                  {hasLeft && (
                    <EndPanelWithTexture
                      width={epW}
                      height={epH}
                      depth={leftEpD}
                      position={[-(width / 2) - epW / 2, epYRelative, leftEpZShift]}
                      spaceInfo={zoneSpaceInfo}
                      renderMode={effectiveRenderMode}
                      useFrameColor={true}
                      endPanelThicknessMm={epThicknessMm}
                      side="left"
                      adjacentFurniture={leftAdjacentExists}
                    />
                  )}
                  {hasRight && (
                    <EndPanelWithTexture
                      width={epW}
                      height={epH}
                      depth={rightEpD}
                      position={[(width / 2) + epW / 2, epYRelative, rightEpZShift]}
                      spaceInfo={zoneSpaceInfo}
                      renderMode={effectiveRenderMode}
                      useFrameColor={true}
                      endPanelThicknessMm={epThicknessMm}
                      side="right"
                      adjacentFurniture={rightAdjacentExists}
                    />
                  )}
                </>
              );
            })()}
          </>
        ) : (
          // 기본 가구 (단순 Box) 렌더링 — 측면/상면뷰에서는 편집 고스트 숨김
          <>
            <Box
              args={[width, height, depth]}
            >
              <meshStandardMaterial
                color={isEditModeForView ? selectionHighlightColor : furnitureColor}
                transparent={isDraggingThis || isEditModeForView}
                opacity={isDraggingThis ? 0.35 : isEditModeForView ? 0.15 : 1.0}
                depthWrite={!(isDraggingThis || isEditModeForView)}
                metalness={0.0}
                roughness={0.7}
              />
            </Box>
            <Edges
              color={columnCResize.isResizing ? '#ff6600' : getEdgeColor({
                isDragging: isDraggingThis,
                isEditMode: isEditModeForView,
                isDragMode,
                viewMode,
                view2DTheme,
                renderMode: effectiveRenderMode
              })}
              threshold={1}
              scale={1.001}
              linewidth={columnCResize.isResizing ? 3 : 1}
            />

          </>
        )}

        {/* Column C 기둥 앞 가구 리사이즈 안내 표시 */}
        {isColumnCFront && isHovered && !isDragMode && !columnCResize.isResizing && (
          <Html
            position={[0, height / 2 + 0.5, depth / 2 + 0.1]}
            center
            occlude={false}  // 메쉬에 가려지지 않도록 설정
            style={{
              userSelect: 'none',
              pointerEvents: 'none',
              zIndex: 10000  // zIndex도 더 높게 설정
            }}
          >
            <div
              style={{
                background: 'rgba(255, 102, 0, 0.9)',
                color: 'white',
                padding: '6px 12px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 'bold',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
              }}
            >
              ↔️ 드래그하여 크기 조절
            </div>
          </Html>
        )}

        {/* Column C 리사이즈 방향 표시 */}
        {columnCResize.isResizing && columnCResize.resizeDirection && (
          <Html
            position={[0, 0, depth / 2 + 0.1]}
            center
            occlude={false}  // 메쉬에 가려지지 않도록 설정
            style={{
              userSelect: 'none',
              pointerEvents: 'none',
              zIndex: 10000  // zIndex도 더 높게 설정
            }}
          >
            <div
              style={{
                background: 'rgba(255, 102, 0, 0.9)',
                color: 'white',
                padding: '6px 12px',
                borderRadius: '4px',
                fontSize: '14px',
                fontWeight: 'bold',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
              }}
            >
              {columnCResize.resizeDirection === 'horizontal' ? '↔️ 너비 조절' : '↕️ 깊이 조절'}
            </div>
          </Html>
        )}

      </group>

      {/* 기둥 침범 시 또는 엔드패널 조정이 필요한 경우 도어를 별도로 렌더링 (원래 슬롯 위치에 고정) */}
      {/* 기둥 A (deep 타입) 또는 기둥이 있고 adjustedWidth가 설정된 경우 또는 엔드패널 조정이 필요한 경우 또는 기둥 앞 배치(front) 모드일 때 커버도어 렌더링 */}
      {(placedModule.hasDoor ?? false) &&
        ((slotInfo && slotInfo.hasColumn && slotInfo.columnType === 'deep') ||
          (slotInfo && slotInfo.hasColumn && placedModule.adjustedWidth !== undefined && placedModule.adjustedWidth !== null) ||
          (slotInfo && slotInfo.hasColumn && placedModule.columnPlacementMode === 'front') ||
          needsEndPanelAdjustment) &&
        spaceInfo && (() => {
          return true;
        })() && (
          <group
            userData={{ furnitureId: placedModule.id, type: 'cover-door' }}
            position={[
              (placedModule.isLocked ? placedModule.position.x : originalSlotCenterX) + doorXOffset, // 도어 중심에 오프셋 적용
              finalYPosition, // 상부장은 14, 나머지는 adjustedPosition.y
              (() => {
                // 상/하부 섹션 depth가 있으면 도어 Z를 "덜 줄어든 쪽"(max) 기준 + direction 반영
                const uS = (placedModule as any).upperSectionDepth;
                const lS = (placedModule as any).lowerSectionDepth;
                const candidates = [
                  {
                    depthMm: lS,
                    direction: ((placedModule as any).lowerSectionDepthDirection || 'front') as 'front' | 'back',
                  },
                  {
                    depthMm: uS,
                    direction: ((placedModule as any).upperSectionDepthDirection || 'front') as 'front' | 'back',
                  },
                ]
                  .filter((candidate): candidate is { depthMm: number; direction: 'front' | 'back' } => (
                    typeof candidate.depthMm === 'number' && candidate.depthMm > 0
                  ))
                  .map(candidate => {
                    const diffMm = actualDepthMm - candidate.depthMm;
                    const localZ = diffMm === 0
                      ? 0
                      : candidate.direction === 'back'
                        ? mmToThreeUnits(diffMm) / 2
                        : -mmToThreeUnits(diffMm) / 2;
                    return {
                      localZ,
                      frontZ: furnitureZ + localZ + mmToThreeUnits(candidate.depthMm) / 2,
                    };
                  });
                if (candidates.length > 0) {
                  const frontMost = candidates.reduce((best, candidate) => (
                    candidate.frontZ > best.frontZ ? candidate : best
                  ));
                  return furnitureZ + frontMost.localZ;
                }
                return furnitureZ;
              })()
            ]}
            rotation={[0, (placedModule.rotation * Math.PI) / 180, 0]}
          >
            <DoorModule
              moduleWidth={doorWidth}
              moduleDepth={(() => {
                const uS = (placedModule as any).upperSectionDepth;
                const lS = (placedModule as any).lowerSectionDepth;
                const maxSec = Math.max(uS || 0, lS || 0);
                return maxSec > 0 ? maxSec : actualDepthMm;
              })()}
              hingePosition={optimalHingePosition}
              spaceInfo={spaceInfo}
              color={isDraggingThis ? '#ff6600' : actualModuleData?.category === 'full' ? undefined : spaceInfo.materialConfig?.doorColor}
              textureUrl={spaceInfo.materialConfig?.doorTexture}
              originalSlotWidth={originalSlotWidthForDoor}
              slotCenterX={doorXOffset}
              moduleData={renderModuleData}
              isDragging={isDraggingThis}
              isEditMode={isEditModeForView}
              adjustedWidth={furnitureWidthMm}
              floatHeight={
                // **중요**: 저장된 값 무시하고 항상 현재 spaceInfo의 placementType을 우선 사용
                spaceInfo.baseConfig?.placementType === 'float'
                  ? (spaceInfo.baseConfig?.floatHeight || 0)
                  : 0
              }
              doorTopGap={storeDoorTopGap ?? placedModule.doorTopGap ?? globalDoorTopGapForCategory}
              doorBottomGap={storeDoorBottomGap ?? placedModule.doorBottomGap ?? globalDoorBottomGapForCategory}
              slotWidths={undefined}
              furnitureId={placedModule.id}
              hingePositionsMm={placedModule.hingePositionsMm}
              upperDoorHingePositionsMm={placedModule.upperDoorHingePositionsMm}
              lowerDoorHingePositionsMm={placedModule.lowerDoorHingePositionsMm}
              zone={effectiveZone}
              internalHeight={furnitureHeightMm}
              isFreePlacement={placedModule.isFreePlacement}
              topFrameThickness={placedModule.topFrameThickness}
              hasBase={placedModule.hasBase}
              individualFloatHeight={placedModule.individualFloatHeight}
              individualBaseFrameHeight={placedModule.baseFrameHeight}
              parentGroupY={adjustedPosition.y}
            />
          </group>
        )}

      {/* 키큰장/듀얼 캐비넷 옆에 상하부장이 있을 때 엔드패널 렌더링 */}
      {/* 노서라운드/서라운드 무관하게 무조건 렌더링 (높이 차이를 메우기 위함) */}
      {(() => {
        // 엔드패널 렌더링 조건 체크
        const shouldRender = needsEndPanelAdjustment && endPanelSide;


        if (!shouldRender) return null;

        // 엔드패널 위치 계산 (물리적 렌더링은 18.5mm)
        const endPanelWidth = mmToThreeUnits(END_PANEL_RENDER_THICKNESS);
        const endPanelHeight = height; // 가구와 동일한 높이
        // EP 길이: endPanelDepth(사용자 명시) 우선, 없으면 customDepth/actualDepthMm 사용
        const epDepthMmSlot = placedModule.endPanelDepth
          ?? placedModule.customDepth
          ?? actualDepthMm
          ?? actualModuleData?.dimensions?.depth
          ?? 600;
        const endPanelDepth = mmToThreeUnits(epDepthMmSlot);

        // 엔드패널 X 위치 계산
        // EP 안쪽 면이 슬롯 18mm 경계에 딱 맞도록 배치
        // → EP 중심 = 슬롯경계 + 18mm - endPanelWidth/2 (바깥쪽으로 0.25mm 밀림)
        const epSlotWidth = mmToThreeUnits(END_PANEL_THICKNESS); // 슬롯 기준 18mm
        const adjustedHalfWidth = width / 2; // 이미 줄어든 너비의 절반
        const endPanelXPositions = [];

        // 키큰장/듀얼장 중심 X 위치 (adjustedPosition.x에 이미 positionAdjustmentForEndPanel이 적용됨)
        const furnitureCenterX = adjustedPosition.x;

        // 왼쪽 엔드패널 렌더링 (endPanelSide만 존중 - 바깥쪽 엔드패널 중복 방지)
        if ((endPanelSide === 'left' || endPanelSide === 'both') && slotBoundaries) {
          // EP 안쪽 면 = slotLeft + 18mm → EP 중심 = slotLeft + 18mm - EP두께/2
          const leftPanelX = slotBoundaries.left + epSlotWidth - endPanelWidth / 2;

          endPanelXPositions.push({
            x: leftPanelX,
            side: 'left',
            zone: placedModule.zone
          });
        }
        // 오른쪽 엔드패널 렌더링 (endPanelSide만 존중 - 바깥쪽 엔드패널 중복 방지)
        if ((endPanelSide === 'right' || endPanelSide === 'both') && slotBoundaries) {
          // 듀얼장의 경우 두 번째 슬롯의 오른쪽 경계 사용
          let rightPanelX: number;

          if (isDualFurniture && normalizedSlotIndex !== undefined) {
            // 듀얼장: slotBoundaries.right(첫 슬롯 우측) + 두 번째 슬롯 너비
            // 단내림이 있을 때는 zone별 slotWidths 사용
            let secondSlotWidth: number;
            if (spaceInfo.droppedCeiling?.enabled && placedModule.zone && zoneSlotInfo) {
              const targetZone = placedModule.zone === 'dropped' ? zoneSlotInfo.dropped : zoneSlotInfo.normal;
              if (targetZone?.slotWidths && targetZone.slotWidths[normalizedSlotIndex + 1] !== undefined) {
                secondSlotWidth = targetZone.slotWidths[normalizedSlotIndex + 1] * 0.01;
              } else {
                secondSlotWidth = (targetZone?.columnWidth ?? indexing.columnWidth) * 0.01;
              }
            } else {
              // 단내림이 없을 때는 일반 indexing.slotWidths 사용
              secondSlotWidth = indexing.slotWidths && indexing.slotWidths[normalizedSlotIndex + 1]
                ? indexing.slotWidths[normalizedSlotIndex + 1] * 0.01
                : indexing.columnWidth * 0.01;
            }

            // EP 안쪽 면 = slotRight + secondSlotWidth - 18mm → EP 중심 = 그 + EP두께/2
            rightPanelX = slotBoundaries.right + secondSlotWidth - epSlotWidth + endPanelWidth / 2;
          } else {
            // 싱글장: EP 안쪽 면 = slotRight - 18mm → EP 중심 = 그 + EP두께/2
            rightPanelX = slotBoundaries.right - epSlotWidth + endPanelWidth / 2;
          }

          endPanelXPositions.push({
            x: rightPanelX,
            side: 'right',
            zone: placedModule.zone
          });
        }


        // 엔드패널: 가구 상단부터 바닥(Y=0)까지 연장
        const furnitureTopY = finalYPosition + height / 2; // 가구 상단 Y
        const extendedEndPanelHeight = furnitureTopY; // 바닥(0)부터 가구 상단까지
        const endPanelYPosition = extendedEndPanelHeight / 2; // 중심 Y
        // 앞/뒤 옵셋: + 늘림, - 줄임
        const getSlotEpOffset = (side: string) => {
          const frontMm = side === 'left'
            ? (placedModule.leftEndPanelOffset ?? 0)
            : (placedModule.rightEndPanelOffset ?? 0);
          const backMm = side === 'left'
            ? (placedModule.leftEndPanelBackOffset ?? 0)
            : (placedModule.rightEndPanelBackOffset ?? 0);
          const frontUnit = mmToThreeUnits(frontMm);
          const backUnit = mmToThreeUnits(backMm);
          return {
            depth: Math.max(0, endPanelDepth + frontUnit + backUnit),
            zShift: (frontUnit - backUnit) / 2,
          };
        };

        return (
          <>
            {endPanelXPositions.map((panel, index) => {
              const slotEp = getSlotEpOffset(panel.side);
              return (
              <group
                key={`endpanel-group-${placedModule.id}-${panel.side}-${index}`}
                position={[panel.x, endPanelYPosition, furnitureZ + slotEp.zShift]}
              >
                <EndPanelWithTexture
                  width={endPanelWidth}
                  height={extendedEndPanelHeight}
                  depth={slotEp.depth}
                  position={[0, 0, 0]}
                  spaceInfo={zoneSpaceInfo}
                  renderMode={effectiveRenderMode}
                  endPanelThicknessMm={resolvePetPanelThicknessMm(placedModule.endPanelThickness)}
                  side={panel.side as 'left' | 'right'}
                  adjacentFurniture={(() => {
                    // EP 방향 슬롯에 인접 가구가 있으면 측판 불필요
                    const mySlot = normalizedSlotIndex;
                    const myZone = placedModule.zone || 'normal';
                    if (mySlot === undefined) return false;
                    const checkSlot = panel.side === 'left'
                      ? mySlot - 1
                      : (isDualFurniture ? mySlot + 2 : mySlot + 1);
                    return placedModules.some(m =>
                      m.id !== placedModule.id && !m.isFreePlacement &&
                      (m.zone || 'normal') === myZone &&
                      m.slotIndex !== undefined &&
                      (m.slotIndex === checkSlot || (m.isDualSlot && m.slotIndex + 1 === checkSlot))
                    );
                  })()}
                />
              </group>
              );
            })}
          </>
        );
      })()}


      {/* 도어는 BoxModule 내부에서 렌더링하도록 변경 */}

      {/* 자유배치 도어 설정 톱니 아이콘 — 캐비넷 중심에 하나만 표시 (하부장/인서트 프레임 제외, 측면뷰 상부장 제외) */}
      {placedModule.isFreePlacement && placedModule.hasDoor && !isLowerCabinet && !placedModule.moduleId?.includes('insert-frame') && !isDraggingThis && !isEditMode && showFurnitureEditHandles && showDimensions && !(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right') && isUpperCabinet) && (
        <Html
          position={[
            adjustedPosition.x,
            finalYPosition,
            furnitureZ + depth / 2 + (isTopPlanView ? topPlanIconLineOffset : doorThickness + 0.3)
          ]}
          center
          zIndexRange={[100, 0]}
          style={{
            userSelect: 'none',
            pointerEvents: 'auto',
            zIndex: 100,
            background: 'transparent',
          }}
        >
          <div
            data-door-options-panel
            style={{
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              border: `2px solid ${getThemeColor()}`,
              borderRadius: '50%',
              backgroundColor: (viewMode === '2D' && view2DTheme === 'dark') ? '#1f2937' : '#ffffff',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
            }}
            onClick={(e) => {
              e.stopPropagation();
              (window as any).__r3fClickHandled = true;
              setShowDoorOptions(prev => !prev);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title="도어 설정"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={getThemeColor()} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </div>
        </Html>
      )}

      {/* 도어 옵션 플로팅 패널 */}
      {showDoorOptions && placedModule.isFreePlacement && placedModule.hasDoor && !isLowerCabinet && viewMode !== '2D' && (
        <Html
          position={[
            adjustedPosition.x + width / 2 + 1.5,
            finalYPosition,
            furnitureZ + depth / 2 + doorThickness + 0.3
          ]}
          center
          zIndexRange={[200, 0]}
          style={{
            userSelect: 'none',
            pointerEvents: 'auto',
            zIndex: 200,
            background: 'transparent',
          }}
        >
          <div
            data-door-options-panel
            style={{
              background: 'rgba(255, 255, 255, 0.95)',
              borderRadius: '12px',
              border: `2px solid ${getThemeColor()}`,
              boxShadow: `0 4px 16px ${getThemeColor()}33`,
              padding: '12px',
              minWidth: '200px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              fontSize: '13px',
              color: '#1f2937',
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontWeight: 600, fontSize: '14px' }}>도어 셋팅</span>
              <button
                onClick={() => setShowDoorOptions(false)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
                  color: '#9ca3af', fontSize: '16px', lineHeight: 1,
                }}
              >✕</button>
            </div>

            {/* 상단/하단 갭 */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '11px', color: '#6b7280', marginBottom: '3px', display: 'block' }}>상단 ↑</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={doorTopGapInput}
                    onChange={(e) => setDoorTopGapInput(e.target.value)}
                    onBlur={() => handleDoorTopGapCommit(doorTopGapInput)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleDoorTopGapCommit(doorTopGapInput);
                      if (e.key === 'ArrowUp') {
                        const v = (parseInt(doorTopGapInput) || 0) + 1;
                        setDoorTopGapInput(v.toString());
                        updatePlacedModule(placedModule.id, { doorTopGap: v });
                      }
                      if (e.key === 'ArrowDown') {
                        const v = (parseInt(doorTopGapInput) || 0) - 1;
                        setDoorTopGapInput(v.toString());
                        updatePlacedModule(placedModule.id, { doorTopGap: v });
                      }
                    }}
                    style={{
                      width: '50px', padding: '4px 6px', borderRadius: '4px',
                      border: '1px solid #d1d5db', fontSize: '13px', textAlign: 'center',
                      outline: 'none', color: '#000', background: '#fff',
                    }}
                  />
                  <span style={{ fontSize: '11px', color: '#9ca3af' }}>mm</span>
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '11px', color: '#6b7280', marginBottom: '3px', display: 'block' }}>하단 ↓</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={doorBottomGapInput}
                    onChange={(e) => setDoorBottomGapInput(e.target.value)}
                    onBlur={() => handleDoorBottomGapCommit(doorBottomGapInput)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleDoorBottomGapCommit(doorBottomGapInput);
                      if (e.key === 'ArrowUp') {
                        const v = (parseInt(doorBottomGapInput) || 0) + 1;
                        setDoorBottomGapInput(v.toString());
                        updatePlacedModule(placedModule.id, { doorBottomGap: v });
                      }
                      if (e.key === 'ArrowDown') {
                        const v = (parseInt(doorBottomGapInput) || 0) - 1;
                        setDoorBottomGapInput(v.toString());
                        updatePlacedModule(placedModule.id, { doorBottomGap: v });
                      }
                    }}
                    style={{
                      width: '50px', padding: '4px 6px', borderRadius: '4px',
                      border: '1px solid #d1d5db', fontSize: '13px', textAlign: 'center',
                      outline: 'none', color: '#000', background: '#fff',
                    }}
                  />
                  <span style={{ fontSize: '11px', color: '#9ca3af' }}>mm</span>
                </div>
              </div>
            </div>

            {/* 경첩 방향 (싱글 가구만) */}
            {!isDummyModule && (isCornerCabinet ? (() => {
              const frontHinge = ((placedModule as any).cornerFrontHingePosition || (isRightCornerCabinet ? 'left' : 'right')) as 'left' | 'right';
              const sideHinge = ((placedModule as any).cornerSideHingePosition || (isRightCornerCabinet ? 'right' : 'left')) as 'left' | 'right';
              const renderCornerHingeButtons = (
                label: string,
                value: 'left' | 'right',
                field: 'cornerFrontHingePosition' | 'cornerSideHingePosition'
              ) => (
                <div>
                  <label style={{ fontSize: '11px', color: '#6b7280', marginBottom: '3px', display: 'block' }}>{label}</label>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {(['left', 'right'] as const).map((pos) => {
                      const isActive = value === pos;
                      return (
                        <button
                          key={`${field}-${pos}`}
                          onClick={() => handleCornerHingeChange(field, pos)}
                          style={{
                            flex: 1,
                            padding: '5px 8px',
                            borderRadius: '6px',
                            border: '1px solid',
                            borderColor: isActive ? getThemeColor() : '#d1d5db',
                            background: isActive ? getThemeColor() : '#fff',
                            color: isActive ? '#fff' : '#374151',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 500,
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {pos === 'left' ? '좌' : '우'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );

              return (
                <>
                  {renderCornerHingeButtons('정면 경첩 방향', frontHinge, 'cornerFrontHingePosition')}
                  {renderCornerHingeButtons('측면 경첩 방향', sideHinge, 'cornerSideHingePosition')}
                </>
              );
            })() : !isDualFurniture && (
              <div>
                <label style={{ fontSize: '11px', color: '#6b7280', marginBottom: '3px', display: 'block' }}>경첩 방향</label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {(['left', 'right'] as const).map((pos) => {
                    const isActive = (storeHingePosition ?? placedModule.hingePosition ?? 'right') === pos;
                    return (
                    <button
                      key={pos}
                      onClick={() => handleHingeChange(pos)}
                      style={{
                        flex: 1,
                        padding: '5px 8px',
                        borderRadius: '6px',
                        border: '1px solid',
                        borderColor: isActive ? getThemeColor() : '#d1d5db',
                        background: isActive ? getThemeColor() : '#fff',
                        color: isActive ? '#fff' : '#374151',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 500,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {pos === 'left' ? '좌' : '우'}
                    </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Html>
      )}

      {/* 편집 아이콘 표시 — 2D 평면의 키큰장찬넬은 전면 옵셋 설정 진입점으로 톱니를 표시 */}
      {!readOnly && showFurnitureEditHandles && showDimensions && !isLayoutBuilderOpen &&
        panelSimulationPhase !== 'layout' && !panelSimulationViewBackup &&
        !(viewMode === '3D' && (isLiveDimensionMode || isTapeMeasureMode)) &&
        (!isInsertFrameModule || placedModule.isFreePlacement || showInsertFramePlanSettingsIcon) &&
        !(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right' || (view2DDirection === 'top' && !showInsertFramePlanSettingsIcon))) && (
        <Html
          position={editIconPosition}
          center
          style={{
            userSelect: 'none',
            pointerEvents: 'auto',
            zIndex: 100,
            background: 'transparent'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                border: `2px solid ${getThemeColor()}`,
                borderRadius: '50%',
                backgroundColor: (viewMode === '2D' && view2DTheme === 'dark') ? '#1f2937' : '#ffffff',
                transition: 'all 0.2s ease',
                opacity: isHovered ? 1 : 0.8,
                transform: isHovered ? 'scale(1.1)' : 'scale(1)',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
              }}
              onClick={(e) => {
                e.stopPropagation();
                (window as any).__r3fClickHandled = true;
                if (isEditMode) {
                  // 이미 편집 모드라면 팝업 닫기
                  const closeAllPopups = useUIStore.getState().closeAllPopups;
                  closeAllPopups();
                } else {
                  // 편집 모드가 아니면 팝업 열기
                  onDoubleClick(e as any, placedModule.id);
                }
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              title={showInsertFramePlanSettingsIcon ? '키큰장찬넬 설정' : '가구 속성 편집'}
            >
              {showInsertFramePlanSettingsIcon
                ? <SettingsIcon color={getThemeColor()} size={18} />
                : <EditIcon color={getThemeColor()} size={18} />}
            </div>
          </div>
        </Html>
      )}
      {/* 키큰장 우클릭 EP 메뉴는 Canvas 바깥 컴포넌트로 분리 예정 (zustand store 사용) */}
    </group>
  );
};

export default FurnitureItem;
