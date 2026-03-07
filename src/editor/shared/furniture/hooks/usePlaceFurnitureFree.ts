/**
 * 자유배치 모드 가구 배치 로직
 */

import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { PlacedModule } from '@/editor/shared/furniture/types';
import { getModuleById, ModuleData } from '@/data/modules';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import {
  clampToSpaceBoundsX,
  checkFreeCollision,
  detectDroppedZone,
  FurnitureBoundsX,
} from '@/editor/shared/utils/freePlacementUtils';
import { v4 as uuidv4 } from 'uuid';
import { isCustomizableModuleId, createDefaultCustomConfig } from '@/editor/shared/controls/furniture/CustomizableFurnitureLibrary';

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
}

export interface PlaceFurnitureFreeResult {
  success: boolean;
  module?: PlacedModule;
  error?: string;
}

/**
 * 자유배치 모드로 가구 배치
 */
export function placeFurnitureFree(params: PlaceFurnitureFreeParams): PlaceFurnitureFreeResult {
  const { moduleId, xPositionMM, spaceInfo, dimensions, existingModules } = params;

  console.log('🎯 [placeFurnitureFree] 호출:', { moduleId, xPositionMM, dimensions });

  const internalSpace = calculateInternalSpace(spaceInfo);
  const moduleData = params.moduleData || getModuleById(moduleId, internalSpace, spaceInfo);

  if (!moduleData) {
    return { success: false, error: `가구 데이터를 찾을 수 없습니다: ${moduleId}` };
  }

  // X좌표 클램핑 (공간 경계 내)
  const clampedX = clampToSpaceBoundsX(xPositionMM, dimensions.width, spaceInfo);

  // 단내림 구간 감지: X 좌표 + 가구 너비 기반으로 zone 결정 + 높이 조정
  const droppedZone = detectDroppedZone(clampedX, spaceInfo, dimensions.width);
  const effectiveZone = droppedZone.zone;
  let effectiveHeight = dimensions.height;

  // 키큰장(full)이 단내림 구간에 배치되면 높이를 줄임
  if (effectiveZone === 'dropped' && droppedZone.droppedInternalHeight !== undefined) {
    if (moduleData.category === 'full') {
      effectiveHeight = droppedZone.droppedInternalHeight;
      console.log('📐 [placeFurnitureFree] 단내림 구간 높이 조정:', {
        원래높이: dimensions.height,
        단내림높이: effectiveHeight,
        dropHeight: spaceInfo.droppedCeiling?.dropHeight,
      });
    }
  }

  // Y좌표 계산 (카테고리별)
  const yPositionThree = calculateYPosition(moduleData.category, effectiveHeight, spaceInfo);

  // 충돌 체크
  const newBounds: FurnitureBoundsX = {
    left: clampedX - dimensions.width / 2,
    right: clampedX + dimensions.width / 2,
    category: moduleData.category as 'full' | 'upper' | 'lower',
  };

  if (!params.skipCollisionCheck && checkFreeCollision(existingModules, newBounds)) {
    return { success: false, error: '다른 가구와 겹칩니다' };
  }

  // Three.js 좌표 변환 (mm → Three.js units: mm * 0.01)
  const xThree = clampedX * 0.01;

  const baseType = moduleId.replace(/-[\d.]+$/, '');

  const isCustomizable = isCustomizableModuleId(moduleId);

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
    ...(isCustomizable && {
      isCustomizable: true,
      customConfig: createDefaultCustomConfig(effectiveHeight - 36), // 상하판 두께 제외
    }),
  };

  console.log('✅ [placeFurnitureFree] 배치 완료:', newModule);
  return { success: true, module: newModule };
}

/**
 * 카테고리별 Y 좌표 계산 (Three.js 단위 반환)
 */
export function calculateYPosition(
  category: string,
  heightMM: number,
  spaceInfo: SpaceInfo
): number {
  const floorFinishMM =
    spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? spaceInfo.floorFinish.height : 0;
  const floorFinish = floorFinishMM * 0.01;

  const baseHeightMM = spaceInfo.baseConfig?.type === 'stand'
    ? 0
    : (spaceInfo.baseConfig?.height || 65);

  if (category === 'upper') {
    // 상부장: 천장에서 아래로 배치
    const topFrameMM = spaceInfo.frameSize?.top || 10;
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
