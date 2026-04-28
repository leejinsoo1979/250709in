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
import { isSurroundPanelId, getSurroundPanelType, SURROUND_PANEL_THICKNESS } from '@/data/modules/surroundPanels';
import { getInternalSpaceBoundsX } from '@/editor/shared/utils/freePlacementUtils';

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

  // 단내림 구간에 배치되면 높이를 줄임 (full/upper 모두)
  if (effectiveZone === 'dropped' && droppedZone.droppedInternalHeight !== undefined) {
    if (moduleData.category === 'full' || moduleData.category === 'upper') {
      effectiveHeight = droppedZone.droppedInternalHeight;
    }
  }

  console.log('🏗️ [placeFurnitureFree] zone detection', {
    xPositionMM, clampedX, zone: effectiveZone,
    originalHeight: dimensions.height, effectiveHeight,
    droppedInternalHeight: droppedZone.droppedInternalHeight,
    category: moduleData.category,
  });

  // Y좌표 계산 (카테고리별)
  // 상부장이 단내림 구간에 배치될 때: 천장 기준이 stepCeiling.height여야 함
  const yPositionThree = calculateYPosition(
    moduleData.category,
    effectiveHeight,
    spaceInfo,
    effectiveZone === 'dropped' ? droppedZone.droppedInternalHeight : undefined
  );

  // 충돌 체크
  const newBounds: FurnitureBoundsX = {
    left: clampedX - dimensions.width / 2,
    right: clampedX + dimensions.width / 2,
    category: moduleData.category as 'full' | 'upper' | 'lower',
  };

  if (!params.skipCollisionCheck) {
    const columns = spaceInfo.columns || [];
    if (checkFreeCollision(existingModules, newBounds) || checkColumnCollision(columns, newBounds)) {
      return { success: false, error: '다른 가구 또는 기둥과 겹칩니다' };
    }
  }

  // Three.js 좌표 변환 (mm → Three.js units: mm * 0.01)
  const xThree = clampedX * 0.01;

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

  const newModule: PlacedModule = {
    id: uuidv4(),
    moduleId,
    baseModuleType: baseType,
    moduleWidth: dimensions.width,
    position: { x: xThree, y: yPositionThree, z: 0 },
    rotation: 0,
    isFreePlacement: true,
    freeWidth: dimensions.width,
    freeHeight: effectiveHeight,
    freeDepth: dimensions.depth,
    zone: effectiveZone,
    hasBase: moduleData.category !== 'upper',
    hasTopFrame: moduleData.category !== 'lower',
    hasBottomFrame: moduleData.category !== 'upper',
    topFrameThickness: spaceInfo.frameSize?.top || 30,
    hasDoor: false, // 자유배치 시 도어 없이 배치 (사용자가 수동 설정)
    lowerSectionTopOffset: defaultLowerTopOffset,
    ...(isCustomizable && {
      // My캐비넷 "수정" 모드: 내부 구조 편집 가능 (톱니/연필 아이콘 표시)
      // My캐비넷 신규 배치: 구조 고정(편집 불가)
      // 커스텀 라이브러리 배치: 내부 구조 편집 가능
      isCustomizable: !isMyCabinetPlacement || isEditingMyCabinet,
      customConfig,
    }),
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
  droppedInternalHeight?: number
): number {
  const floorFinishMM =
    spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? spaceInfo.floorFinish.height : 0;
  const floorFinish = floorFinishMM * 0.01;

  const baseHeightMM = spaceInfo.baseConfig?.type === 'stand'
    ? 0
    : (spaceInfo.baseConfig?.height || 65);

  if (category === 'upper') {
    // 상부장: 천장에서 아래로 배치
    // 단내림 구간이면 단내림 높이 기준, 아니면 전체 높이 기준
    const topFrameMM = spaceInfo.frameSize?.top || 30;
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
    spaceInfo.baseConfig?.placementType === 'float' &&
    (spaceInfo.baseConfig?.floatHeight || 0) > 0;

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
    freeW = 18.5; // 서라운드(PET) 두께 항상 18.5mm
    freeH = panelHeight;
    freeD = panelDepth;
  } else if (panelType === 'right') {
    // 우측 패널: 공간 우측 벽에 붙임
    xMM = spaceBounds.endX + panelWidth / 2; // 내경 오른쪽 경계 바로 오른쪽
    yMM = floorFinishMM + panelHeight / 2;
    freeW = 18.5; // 서라운드(PET) 두께 항상 18.5mm
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
    freeH = 18.5; // 서라운드(PET) 두께 항상 18.5mm
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

  const LEFT_W = 582;
  const INSERT_W = 136;
  const RIGHT_W = 582;
  const TOTAL_W = LEFT_W + INSERT_W + RIGHT_W; // 1300

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

  // 듀얼 세트 중심을 1300mm 너비로 공간에 클램프 (좌우 가장자리 자동 조정)
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
