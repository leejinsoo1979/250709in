/**
 * 자유배치 모드 가구 배치 로직
 */

import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { PlacedModule } from '@/editor/shared/furniture/types';
import { getModuleById, ModuleData } from '@/data/modules';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import {
  clampToSpaceBoundsX,
  checkFreeCollision,
  checkColumnCollision,
  detectDroppedZone,
  FurnitureBoundsX,
} from '@/editor/shared/utils/freePlacementUtils';
import { v4 as uuidv4 } from 'uuid';
import { isCustomizableModuleId, createDefaultCustomConfig } from '@/editor/shared/controls/furniture/CustomizableFurnitureLibrary';
import { useMyCabinetStore, PendingPlacement } from '@/store/core/myCabinetStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { CustomFurnitureConfig } from '@/editor/shared/furniture/types';
import { isSurroundPanelId, getSurroundPanelType } from '@/data/modules/surroundPanels';
import { getInternalSpaceBoundsX } from '@/editor/shared/utils/freePlacementUtils';
import { resolveInitialFurnitureDepth } from '@/editor/shared/utils/furnitureDepthDefaults';
import { TOP_END_PANEL_FRONT_OFFSET_DEFAULT_MM } from '@/editor/shared/utils/panelThickness';

type FreePlacementModuleFlags = ModuleData & {
  hasBase?: boolean;
  individualFloatHeight?: number;
  hasTopFrame?: boolean;
  topFrameThickness?: number;
  topFrameOffset?: number;
  topFrameGap?: number;
  baseFrameHeight?: number;
  baseFrameOffset?: number;
  baseFrameGap?: number;
  hasBackPanel?: boolean;
};

const isTopFrameCapablePlacedModule = (module: PlacedModule): boolean => {
  if (module.isSurroundPanel) return false;
  const moduleId = module.moduleId || '';
  if (moduleId.includes('insert-frame')) return false;
  return !(moduleId.startsWith('lower-') || moduleId.includes('-lower-'));
};

const isBaseFrameCapablePlacedModule = (module: PlacedModule): boolean => {
  if (module.isSurroundPanel) return false;
  const moduleId = module.moduleId || '';
  if (moduleId.includes('insert-frame')) return false;
  return !(moduleId.includes('upper-cabinet') || moduleId.startsWith('upper-') || moduleId.includes('-upper-'));
};

const isPlainShoeShelfModuleId = (moduleId?: string): boolean => {
  if (!moduleId) return false;
  return (moduleId.startsWith('single-shelf-') || moduleId.startsWith('dual-shelf-'))
    && !moduleId.includes('-4drawer-shelf-')
    && !moduleId.includes('-2drawer-shelf-')
    && !moduleId.includes('shelf-split');
};

const calculateGuideDepthZPosition = (
  spaceInfo: SpaceInfo,
  depthMm: number,
  gapMm: number
): number => {
  const panelDepthMm = spaceInfo.depth || 600;
  const furnitureDepthMm = Math.min(panelDepthMm, 600);
  const furnitureZOffsetMm = -panelDepthMm / 2 + (panelDepthMm - furnitureDepthMm) / 2;
  const backGuideZMm = furnitureZOffsetMm - furnitureDepthMm / 2 - TOP_END_PANEL_FRONT_OFFSET_DEFAULT_MM;
  return (backGuideZMm + Math.max(0, gapMm) + depthMm / 2) * 0.01;
};

const clampTopFrameGapForModule = (
  moduleData: ModuleData,
  topFrameMm: number,
  topGapMm: number,
  absorbedBaseMm: number
): number => {
  const sections = moduleData.modelConfig?.sections;
  if (!sections || sections.length < 2) {
    return Math.max(0, topGapMm);
  }

  const upperAbsorbingIndex = sections.length - 1;
  const fixedSectionHeight = sections.reduce((sum, section, index) => (
    index === upperAbsorbingIndex ? sum : sum + (section.height || 0)
  ), 0);
  const minimumUpperHeight = moduleData.modelConfig?.basicThickness || 18;
  const maxGap = Math.max(0, moduleData.dimensions.height + topFrameMm + absorbedBaseMm - fixedSectionHeight - minimumUpperHeight);
  return Math.max(0, Math.min(topGapMm, maxGap));
};

export interface PlaceFurnitureFreeParams {
  moduleId: string;
  xPositionMM: number;         // 배치할 X 위치 (mm, 공간 좌표계)
  spaceInfo: SpaceInfo;
  dimensions: {
    width: number;              // mm
    height: number;             // mm
    depth: number;              // mm
  };
  existingModules: PlacedModule[];
  moduleData?: ModuleData;
  skipCollisionCheck?: boolean;
  pendingPlacement?: PendingPlacement | null; // My캐비닛 배치 데이터
}

export interface PlaceFurnitureFreeResult {
  success: boolean;
  module?: PlacedModule;
  /** 듀얼 빌트인 냉장고장처럼 1개 모듈이 여러 개로 분할 배치되는 경우 추가 모듈들 */
  additionalModules?: PlacedModule[];
  error?: string;
}

/**
 * 자유배치 모드로 가구 배치
 */
export function placeFurnitureFree(params: PlaceFurnitureFreeParams): PlaceFurnitureFreeResult {
  const { moduleId, xPositionMM, spaceInfo, dimensions, existingModules } = params;

  // ── 서라운드 패널 전용 배치 ──
  if (isSurroundPanelId(moduleId)) {
    return placeSurroundPanel(moduleId, spaceInfo, dimensions, existingModules);
  }

  // ── 듀얼 빌트인 냉장고장: 1개 모듈 → 3개(좌힌지 빌트인 + 인서트 + 우힌지 빌트인) 분할 배치 ──
  if (moduleId.includes('dual-built-in-fridge')) {
    return placeDualBuiltInFridgeFree(params);
  }

  const internalSpace = calculateInternalSpace(spaceInfo);
  const moduleData = params.moduleData || getModuleById(moduleId, internalSpace, spaceInfo);

  if (!moduleData) {
    return { success: false, error: `가구 데이터를 찾을 수 없습니다: ${moduleId}` };
  }

  // X좌표 클램핑 (공간 경계 내) — 반올림 제거 (방향 편향으로 인한 1mm 잔여 방지)
  const clampedX = clampToSpaceBoundsX(xPositionMM, dimensions.width, spaceInfo);

  // 단내림 구간 감지: X 좌표 + 가구 너비 기반으로 zone 결정 + 높이 조정
  const droppedZone = detectDroppedZone(clampedX, spaceInfo, dimensions.width);
  const effectiveZone = droppedZone.zone;
  let effectiveHeight = dimensions.height;
  if (isPlainShoeShelfModuleId(moduleId)) {
    effectiveHeight = moduleData.dimensions.height;
  }

  // 단내림 구간에 배치되면 높이를 줄임 (full/upper 모두)
  if (effectiveZone === 'dropped' && droppedZone.droppedInternalHeight !== undefined) {
    if (moduleData.category === 'full') {
      effectiveHeight = droppedZone.droppedInternalHeight;
    }
  }

  // 멍장 키큰장(single-dummy-full / dual-dummy-full): 다른 키큰장과 동일하게 공간 H 맞춤
  if (moduleId.includes('dummy-full')) {
    const topFrameMm = spaceInfo.frameSize?.top ?? 30;
    const floorFinishMm = (spaceInfo.hasFloorFinish && spaceInfo.floorFinish?.height) || 0;
    const baseMm = spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 65) : 0;
    const zoneH = effectiveZone === 'dropped' && droppedZone.droppedInternalHeight !== undefined
      ? droppedZone.droppedInternalHeight + (spaceInfo.baseConfig?.height ?? 65)
      : spaceInfo.height;
    effectiveHeight = Math.max(0, zoneH - topFrameMm - floorFinishMm - baseMm);
  }

  // 키큰장(full)은 어떤 배치 경로에서도 본체가 상단몰딩 영역을 침범하면 안 된다.
  // 가이드 슬롯/더블클릭 경로에서 stale한 모듈 높이가 들어와도 내경 높이로 한 번 더 제한한다.
  if (moduleData.category === 'full' && !moduleId.includes('insert-frame')) {
    const maxTallBodyHeight = effectiveZone === 'dropped' && droppedZone.droppedInternalHeight !== undefined
      ? droppedZone.droppedInternalHeight
      : internalSpace.height;
    effectiveHeight = Math.min(effectiveHeight, Math.max(0, maxTallBodyHeight));
  }

  const guideSlotYRange = (moduleData as any)?.guideSlotYRangeMm as { start: number; end: number } | undefined;
  const hasGuideSlotYRange = !!guideSlotYRange
    && Number.isFinite(guideSlotYRange.start)
    && Number.isFinite(guideSlotYRange.end)
    && guideSlotYRange.end > guideSlotYRange.start;
  if (hasGuideSlotYRange && (moduleData.category === 'full' || moduleData.category === 'upper' || moduleData.category === 'lower')) {
    effectiveHeight = Math.max(0, guideSlotYRange.end - guideSlotYRange.start);
  }

  console.log('🏗️ [placeFurnitureFree] zone detection', {
    xPositionMM, clampedX, zone: effectiveZone,
    originalHeight: dimensions.height, effectiveHeight,
    droppedInternalHeight: droppedZone.droppedInternalHeight,
    category: moduleData.category,
  });

  const guideSlotDepthMm = (moduleData as any)?.guideSlotDepthMm;
  const guideSlotDepthGapMm = (moduleData as any)?.guideSlotDepthGapMm;
  const hasGuideSlotDepth = Number.isFinite(guideSlotDepthMm) && guideSlotDepthMm > 0;
  const effectiveDepth = hasGuideSlotDepth
    ? Math.max(1, Math.round(guideSlotDepthMm))
    : resolveInitialFurnitureDepth(
      spaceInfo,
      moduleData.id || moduleId,
      dimensions.depth
    );
  const guideDepthGap = Number.isFinite(guideSlotDepthGapMm) ? Math.max(0, Math.round(guideSlotDepthGapMm)) : 0;

  // Y좌표 계산 (카테고리별)
  // 상부장이 단내림 구간에 배치될 때: 천장 기준이 stepCeiling.height여야 함
  const yPositionThree = hasGuideSlotYRange && (moduleData.category === 'full' || moduleData.category === 'upper' || moduleData.category === 'lower')
    ? ((guideSlotYRange.start + guideSlotYRange.end) / 2) * 0.01
    : calculateYPosition(
      moduleData.category,
      effectiveHeight,
      spaceInfo,
      effectiveZone === 'dropped' ? droppedZone.droppedInternalHeight : undefined,
      (moduleData as any).individualFloatHeight,
      (moduleData as any).hasBase,
    );

  // 충돌 체크
  const newBounds: FurnitureBoundsX = {
    left: clampedX - dimensions.width / 2,
    right: clampedX + dimensions.width / 2,
    category: moduleData.category as 'full' | 'upper' | 'lower',
  };

  if (!params.skipCollisionCheck) {
    const columns = spaceInfo.columns || [];
    if (checkFreeCollision(existingModules, newBounds)) {
      return { success: false, error: '이미 배치된 가구와 겹칩니다' };
    }
    if (checkColumnCollision(columns, newBounds)) {
      return { success: false, error: '기둥과 겹칩니다' };
    }
  }

  // Three.js 좌표 변환 (mm → Three.js units: mm * 0.01)
  const xThree = clampedX * 0.01;
  const zThree = hasGuideSlotDepth
    ? calculateGuideDepthZPosition(spaceInfo, effectiveDepth, guideDepthGap)
    : 0;

  const baseType = moduleId.replace(/-[\d.]+$/, '');

  const isCustomizable = isCustomizableModuleId(moduleId);

  // My캐비닛에서 pendingPlacement의 customConfig 사용, 없으면 기본 생성
  const pp = params.pendingPlacement;
  const isMyCabinetPlacement = !!(pp?.customConfig); // My캐비닛에서 배치한 경우
  const isEditingMyCabinet = !!useMyCabinetStore.getState().editingCabinetId; // My캐비닛 "수정" 모드
  const pendingLayoutConfig = useFurnitureStore.getState().pendingCustomConfig; // 레이아웃 빌더에서 설정한 config
  let customConfig: CustomFurnitureConfig | undefined;
  if (isCustomizable) {
    if (pp?.customConfig) {
      customConfig = JSON.parse(JSON.stringify(pp.customConfig));
    } else if (pendingLayoutConfig) {
      customConfig = JSON.parse(JSON.stringify(pendingLayoutConfig));
    } else {
      customConfig = createDefaultCustomConfig(effectiveHeight - 36); // 상하판 두께 제외
    }
  }

  // 서랍장(2단/4단)/인출장 하부섹션 상판 85mm 들여쓰기 기본값
  const defaultLowerTopOffset = (moduleId.includes('2drawer') || moduleId.includes('4drawer') || moduleId.includes('pull-out-cabinet')) ? 85 : undefined;
  const moduleFlags = moduleData as FreePlacementModuleFlags;
  const topFrameCapableExistingModules = existingModules
    .filter(module => module.isFreePlacement)
    .filter(isTopFrameCapablePlacedModule);
  const inheritTopFrameOff = topFrameCapableExistingModules.length > 0
    && topFrameCapableExistingModules.every(module => module.hasTopFrame === false);
  // 기존 가구의 topFrameGap 우선, 없으면 공간설정의 frameSize.topGap fallback
  const globalTopGap = (spaceInfo.frameSize as any)?.topGap ?? 0;
  const inheritedTopFrameGap = topFrameCapableExistingModules.find(module => module.topFrameGap !== undefined)?.topFrameGap ?? globalTopGap;
  const inheritedTopFrameThickness = topFrameCapableExistingModules.find(module => typeof module.topFrameThickness === 'number')?.topFrameThickness;
  // spaceInfo.frameSize.top === 0 이면 공간설정에서 상단몰딩 OFF로 저장됨
  const topFrameDisabledByGlobal = moduleFlags.hasTopFrame === true
    ? false
    : (spaceInfo.frameSize?.top ?? 30) <= 0;
  const shouldHaveTopFrame = moduleData.category !== 'lower'
    && moduleFlags.hasTopFrame !== false
    && spaceInfo.frameConfig?.top !== false
    && !inheritTopFrameOff
    && !topFrameDisabledByGlobal;
  const baseFrameCapableExistingModules = existingModules
    .filter(module => module.isFreePlacement)
    .filter(isBaseFrameCapablePlacedModule);
  const inheritBaseFrameOff = baseFrameCapableExistingModules.length > 0
    && baseFrameCapableExistingModules.every(module => module.hasBase === false);
  const inheritedFloatHeight = baseFrameCapableExistingModules.find(module => module.individualFloatHeight !== undefined)?.individualFloatHeight ?? 0;
  const inheritedBaseFrameHeight = baseFrameCapableExistingModules.find(module => module.baseFrameHeight !== undefined)?.baseFrameHeight;
  const inheritedDoorBottomGap = baseFrameCapableExistingModules.find(module => module.doorBottomGap !== undefined)?.doorBottomGap;
  // 걸레받이 OFF(type=stand) 또는 height=0이면 받침대 없이 배치한다.
  const baseFrameDisabledByGlobal = moduleFlags.hasBase === true
    ? false
    : spaceInfo.baseConfig?.type === 'stand'
      || (spaceInfo.baseConfig?.height ?? 65) <= 0;
  const shouldHaveBaseFrame = moduleFlags.hasBase === false
    ? false
    : moduleData.category !== 'upper' && !inheritBaseFrameOff && !baseFrameDisabledByGlobal;
  const globalFloatHeight = (spaceInfo.baseConfig?.type === 'stand' || (spaceInfo.baseConfig?.height ?? 0) <= 0)
    ? Math.max(0, spaceInfo.baseConfig?.floatHeight ?? 0)
    : 0;
  const initialFloatHeight = moduleFlags.individualFloatHeight ?? (shouldHaveBaseFrame ? 0 : (inheritedFloatHeight || globalFloatHeight));
  const isKitchenLowerModule = moduleData.category === 'lower' || moduleId.startsWith('lower-') || moduleId.includes('dual-lower-');
  const initialBaseFrameHeight = shouldHaveBaseFrame
    ? (hasGuideSlotYRange
      ? (moduleFlags.baseFrameHeight ?? inheritedBaseFrameHeight ?? (spaceInfo.baseConfig?.height ?? 0))
      : (moduleFlags.baseFrameHeight ?? inheritedBaseFrameHeight ?? (isKitchenLowerModule ? 105 : (spaceInfo.baseConfig?.height ?? 60))))
    : undefined;
  const inheritedAbsorbedBase = shouldHaveBaseFrame
    ? 0
    : ((spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 60) : 0) - initialFloatHeight);
  const topFrameThickness = moduleFlags.topFrameThickness ?? inheritedTopFrameThickness ?? (spaceInfo.frameSize?.top ?? 30);
  const initialTopFrameGap = clampTopFrameGapForModule(
    moduleData,
    topFrameThickness,
    moduleFlags.topFrameGap ?? inheritedTopFrameGap,
    inheritedAbsorbedBase
  );

  const newModule: PlacedModule = {
    id: uuidv4(),
    moduleId,
    baseModuleType: baseType,
    moduleWidth: dimensions.width,
    position: { x: xThree, y: yPositionThree, z: zThree },
    rotation: 0,
    isFreePlacement: true,
    freePlacementCategory: moduleData.category as 'full' | 'upper' | 'lower',
    freeWidth: dimensions.width,
    freeHeight: effectiveHeight,
    freeDepth: effectiveDepth,
    ...(hasGuideSlotYRange ? {
      guideSlotPlacement: true,
      guideSlotZone: moduleData.category as 'full' | 'upper' | 'lower',
    } : {}),
    ...(hasGuideSlotDepth ? {
      customDepth: effectiveDepth,
      backWallGap: guideDepthGap,
      guideDepthPlacement: true,
    } : {}),
    ...((moduleData as any).guideSlotUpperDepthMm !== undefined ? {
      upperSectionDepth: (moduleData as any).guideSlotUpperDepthMm,
      upperSectionDepthDirection: 'back' as const,
    } : {}),
    ...((moduleData as any).guideSlotLowerDepthMm !== undefined ? {
      lowerSectionDepth: (moduleData as any).guideSlotLowerDepthMm,
      lowerSectionDepthDirection: 'back' as const,
    } : {}),
    zone: effectiveZone,
    // ModuleData가 명시적으로 hasBase=false 라면 우선
    hasBase: shouldHaveBaseFrame,
    ...(initialBaseFrameHeight !== undefined ? { baseFrameHeight: initialBaseFrameHeight } : {}),
    hasTopFrame: shouldHaveTopFrame,
    hasBottomFrame: shouldHaveBaseFrame,
    topFrameThickness,
    ...(moduleFlags.topFrameOffset !== undefined ? { topFrameOffset: moduleFlags.topFrameOffset } : {}),
    ...(initialTopFrameGap > 0 ? { topFrameGap: initialTopFrameGap } : {}),
    ...(moduleFlags.baseFrameOffset !== undefined ? { baseFrameOffset: moduleFlags.baseFrameOffset } : {}),
    ...(moduleFlags.baseFrameGap !== undefined ? { baseFrameGap: moduleFlags.baseFrameGap } : {}),
    // ModuleData에 individualFloatHeight 가 정의된 가구
    ...(initialFloatHeight > 0
      ? { individualFloatHeight: initialFloatHeight }
      : {}),
    ...(!shouldHaveBaseFrame && inheritedDoorBottomGap !== undefined
      ? { doorBottomGap: inheritedDoorBottomGap }
      : {}),
    // ModuleData.hasBackPanel === false (예: 유리장 — 사용자 별도 백패널 처리)
    ...(moduleFlags.hasBackPanel === false ? { hasBackPanel: false } : {}),
    hasDoor: false, // 자유배치 시 도어 없이 배치 (사용자가 수동 설정)
    lowerSectionTopOffset: defaultLowerTopOffset,
    ...(isCustomizable && {
      // My캐비넷 "수정" 모드: 내부 구조 편집 가능 (톱니/연필 아이콘 표시)
      // My캐비넷 신규 배치: 구조 고정(편집 불가)
      // 커스텀 라이브러리 배치: 내부 구조 편집 가능
      isCustomizable: !isMyCabinetPlacement || isEditingMyCabinet,
      customConfig,
    }),
    // 키큰장찬넬(insert-frame): 전면 프레임 안쪽 들임 기본 18mm
    ...(moduleId.includes('insert-frame') ? { insertFrontInsetMm: 18 } : {}),
  };

  // 배치 완료 후 pendingPlacement 초기화
  if (pp) {
    useMyCabinetStore.getState().setPendingPlacement(null);
  }

  // 레이아웃 빌더 pending config 초기화
  if (pendingLayoutConfig) {
    useFurnitureStore.getState().setPendingCustomConfig(null);
  }

  return { success: true, module: newModule };
}

/**
 * 카테고리별 Y 좌표 계산 (Three.js 단위 반환)
 */
export function calculateYPosition(
  category: string,
  heightMM: number,
  spaceInfo: SpaceInfo,
  droppedInternalHeight?: number,
  moduleIndividualFloatHeight?: number, // 가구 개별 띄움
  hasBaseOverride?: boolean,            // hasBase=false면 걸레받이 자리 무시
): number {
  const floorFinishMM =
    spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? spaceInfo.floorFinish.height : 0;
  const floorFinish = floorFinishMM * 0.01;

  const baseHeightMM = spaceInfo.baseConfig?.type === 'stand'
    ? 0
    : (category === 'lower' ? 105 : (spaceInfo.baseConfig?.height || 65));

  if (category === 'upper') {
    // 상부장: 천장에서 아래로 배치
    // 단내림 구간이면 단내림 높이 기준, 아니면 전체 높이 기준
    const topFrameMM = spaceInfo.frameSize?.top ?? 30;
    if (droppedInternalHeight !== undefined) {
      // 단내림 구간: 줄어든 내경 높이 + base + floorFinish = 단내림 천장까지
      const internalHeightMM = droppedInternalHeight + baseHeightMM;
      return (floorFinishMM + internalHeightMM - heightMM / 2) * 0.01;
    }
    const internalHeightMM = spaceInfo.height - topFrameMM - floorFinishMM;
    return (floorFinishMM + internalHeightMM - heightMM / 2) * 0.01;
  }

  // full / lower: 바닥에서 위로 배치
  const isFloat =
    (spaceInfo.baseConfig?.type === 'stand' || (spaceInfo.baseConfig?.height ?? 0) <= 0) &&
    (spaceInfo.baseConfig?.floatHeight || 0) > 0;

  // 가구 개별 띄움 우선 — hasBase=false 가구는 받침대 높이를 더하지 않음
  if (hasBaseOverride === false) {
    return floorFinish + (moduleIndividualFloatHeight ?? 0) * 0.01 + (heightMM * 0.01) / 2;
  }

  if (isFloat) {
    const floatH = (spaceInfo.baseConfig?.floatHeight || 0) * 0.01;
    return floorFinish + floatH + (heightMM * 0.01) / 2;
  }

  return floorFinish + baseHeightMM * 0.01 + (heightMM * 0.01) / 2;
}

/**
 * 서라운드 패널 배치 (좌/우/상단 자동 위치 계산)
 */
function placeSurroundPanel(
  moduleId: string,
  spaceInfo: SpaceInfo,
  dimensions: { width: number; height: number; depth: number },
  existingModules: PlacedModule[]
): PlaceFurnitureFreeResult {
  const panelType = getSurroundPanelType(moduleId);
  if (!panelType) {
    return { success: false, error: '잘못된 서라운드 패널 ID' };
  }

  // 중복 배치 방지: 같은 타입 1개만 허용
  const alreadyPlaced = existingModules.some(
    m => m.isSurroundPanel && m.surroundPanelType === panelType
  );
  if (alreadyPlaced) {
    return { success: false, error: `${panelType} 패널은 이미 배치되어 있습니다` };
  }

  const internalSpace = calculateInternalSpace(spaceInfo);
  const spaceBounds = getInternalSpaceBoundsX(spaceInfo);
  const panelWidth = dimensions.width; // 사용자 지정 폭

  // 바닥 마감 높이
  const floorFinishMM = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? spaceInfo.floorFinish.height : 0;

  // 내경 높이 (패널 높이)
  const panelHeight = internalSpace.height;
  // 패널 깊이 = 공간 깊이
  const panelDepth = spaceInfo.depth;

  let xMM: number;
  let yMM: number;
  let freeW: number;
  let freeH: number;
  let freeD: number;

  if (panelType === 'left') {
    // 좌측 패널: 공간 좌측 벽에 붙임
    xMM = spaceBounds.startX - panelWidth / 2; // 벽 바로 바깥쪽 (내경 왼쪽 경계 바로 왼쪽)
    yMM = floorFinishMM + panelHeight / 2;
    freeW = 18; // 서라운드(PET) 두께 항상 18mm
    freeH = panelHeight;
    freeD = panelDepth;
  } else if (panelType === 'right') {
    // 우측 패널: 공간 우측 벽에 붙임
    xMM = spaceBounds.endX + panelWidth / 2; // 내경 오른쪽 경계 바로 오른쪽
    yMM = floorFinishMM + panelHeight / 2;
    freeW = 18; // 서라운드(PET) 두께 항상 18mm
    freeH = panelHeight;
    freeD = panelDepth;
  } else {
    // 상단 패널: 천장에 붙임, 좌우 패널 사이 너비
    const leftPanel = existingModules.find(m => m.isSurroundPanel && m.surroundPanelType === 'left');
    const rightPanel = existingModules.find(m => m.isSurroundPanel && m.surroundPanelType === 'right');
    const leftEdge = leftPanel ? spaceBounds.startX - (leftPanel.surroundPanelWidth || 40) : spaceBounds.startX;
    const rightEdge = rightPanel ? spaceBounds.endX + (rightPanel.surroundPanelWidth || 40) : spaceBounds.endX;
    const topWidth = rightEdge - leftEdge;

    xMM = (leftEdge + rightEdge) / 2;
    yMM = floorFinishMM + panelHeight - panelWidth / 2; // 천장에서 폭/2 아래
    freeW = topWidth;
    freeH = 18; // 서라운드(PET) 두께 항상 18mm
    freeD = panelDepth;
  }

  const xThree = xMM * 0.01;
  const yThree = yMM * 0.01;

  const newModule: PlacedModule = {
    id: uuidv4(),
    moduleId,
    baseModuleType: moduleId,
    moduleWidth: freeW,
    position: { x: xThree, y: yThree, z: 0 },
    rotation: 0,
    isFreePlacement: true,
    isSurroundPanel: true,
    surroundPanelType: panelType,
    surroundPanelWidth: panelWidth,
    freeWidth: freeW,
    freeHeight: freeH,
    freeDepth: freeD,
  };

  return { success: true, module: newModule };
}

/**
 * 자유배치 — 듀얼 빌트인 냉장고장: 1300mm 너비를 좌힌지 빌트인(582) + 인서트 프레임(136) + 우힌지 빌트인(582)로 분할 배치
 * 사용자가 클릭한 X 위치를 듀얼 세트의 중앙으로 사용
 */
function placeDualBuiltInFridgeFree(params: PlaceFurnitureFreeParams): PlaceFurnitureFreeResult {
  const { xPositionMM, spaceInfo } = params;

  const BASE_LEFT_W = 582;
  const BASE_INSERT_W = 136;
  const BASE_RIGHT_W = 582;
  const BASE_TOTAL_W = BASE_LEFT_W + BASE_INSERT_W + BASE_RIGHT_W; // 1300
  const TOTAL_W = Math.max(1, params.dimensions.width || BASE_TOTAL_W);
  const LEFT_W = Math.max(1, Math.round((TOTAL_W * BASE_LEFT_W / BASE_TOTAL_W) * 10) / 10);
  const INSERT_W = Math.max(1, Math.round((TOTAL_W * BASE_INSERT_W / BASE_TOTAL_W) * 10) / 10);
  const RIGHT_W = Math.max(1, Math.round((TOTAL_W - LEFT_W - INSERT_W) * 10) / 10);

  // 빌트인 냉장고장/인서트 프레임의 실제 모듈 dimensions를 모듈 데이터에서 직접 가져옴
  // _tempSlotWidths로 원하는 너비 모듈을 동적 생성하도록 spaceInfo를 임시 수정
  const internalSpace = calculateInternalSpace(spaceInfo);
  const fridgeModuleData = getModuleById(
    `built-in-fridge-${LEFT_W}`,
    internalSpace,
    { ...spaceInfo, _tempSlotWidths: [LEFT_W] } as SpaceInfo
  );
  const insertModuleData = getModuleById(
    `insert-frame-${INSERT_W}`,
    internalSpace,
    { ...spaceInfo, _tempSlotWidths: [INSERT_W] } as SpaceInfo
  );
  if (!fridgeModuleData || !insertModuleData) {
    return { success: false, error: '빌트인 냉장고장/인서트 프레임 모듈을 찾을 수 없습니다' };
  }
  const fridgeDims = { width: LEFT_W, height: fridgeModuleData.dimensions.height, depth: fridgeModuleData.dimensions.depth };
  const insertDims = { width: INSERT_W, height: insertModuleData.dimensions.height, depth: insertModuleData.dimensions.depth };

  // 듀얼 세트 중심을 현재 배치 폭으로 공간에 클램프 (가이드 슬롯에서는 슬롯 1칸 폭)
  const clampedSetCenter = clampToSpaceBoundsX(xPositionMM, TOTAL_W, spaceInfo);
  const setLeftEdge = clampedSetCenter - TOTAL_W / 2;
  const leftCenterX = setLeftEdge + LEFT_W / 2;
  const insertCenterX = setLeftEdge + LEFT_W + INSERT_W / 2;
  const rightCenterX = setLeftEdge + LEFT_W + INSERT_W + RIGHT_W / 2;

  const groupId = `dual-built-in-fridge-${uuidv4()}`;

  // 좌힌지 빌트인 — 분할 함수 내부는 store 추가 없이 module만 생성
  const leftRes = placeFurnitureFree({
    ...params,
    moduleId: 'built-in-fridge-582',
    xPositionMM: leftCenterX,
    dimensions: fridgeDims,
    moduleData: fridgeModuleData,
    skipCollisionCheck: true,
  });
  if (!leftRes.success || !leftRes.module) {
    return { success: false, error: leftRes.error || '좌힌지 빌트인 배치 실패' };
  }
  leftRes.module.hingePosition = 'left';
  leftRes.module.groupId = groupId;

  // 인서트 프레임
  const insertRes = placeFurnitureFree({
    ...params,
    moduleId: 'insert-frame-136',
    xPositionMM: insertCenterX,
    dimensions: insertDims,
    moduleData: insertModuleData,
    skipCollisionCheck: true,
  });
  if (!insertRes.success || !insertRes.module) {
    return { success: false, error: insertRes.error || '인서트 배치 실패' };
  }
  insertRes.module.groupId = groupId;

  // 우힌지 빌트인
  const rightRes = placeFurnitureFree({
    ...params,
    moduleId: 'built-in-fridge-582',
    xPositionMM: rightCenterX,
    dimensions: { width: RIGHT_W, height: fridgeDims.height, depth: fridgeDims.depth },
    moduleData: fridgeModuleData,
    skipCollisionCheck: true,
  });
  if (!rightRes.success || !rightRes.module) {
    return { success: false, error: rightRes.error || '우힌지 빌트인 배치 실패' };
  }
  rightRes.module.hingePosition = 'right';
  rightRes.module.groupId = groupId;

  // 첫 번째 module + 추가 모듈 2개를 반환 — caller가 일괄 추가
  return {
    success: true,
    module: leftRes.module,
    additionalModules: [insertRes.module, rightRes.module],
  };
}
