import { PlacedModule } from '@/editor/shared/furniture/types';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { SpaceCalculator } from './indexing';

/**
 * 자유배치 모드 유틸리티
 * AABB 충돌 체크, 공간 경계 클램핑 등
 */

// 가구 간 최소 간격 (mm) - 0으로 설정하여 완전 밀착 허용
const COLLISION_GAP_MM = 0;

export interface FurnitureBoundsX {
  left: number;   // 좌측 X (mm)
  right: number;  // 우측 X (mm)
  category: 'full' | 'upper' | 'lower';
}

/**
 * 내부 공간의 X 범위 반환 (mm 단위)
 * 자유배치에서는 프레임 두께 대신 이격거리(gapConfig)만 적용
 */
export function getInternalSpaceBoundsX(spaceInfo: SpaceInfo): { startX: number; endX: number } {
  const totalWidth = spaceInfo.width || 2400;
  const halfW = totalWidth / 2;
  // 자유배치에서는 이격거리 적용하지 않음 — 전체 공간을 그대로 사용
  return {
    startX: -halfW,
    endX: halfW,
  };
}

/**
 * PlacedModule의 X 범위 반환 (mm 단위)
 */
export function getModuleBoundsX(module: PlacedModule): FurnitureBoundsX {
  const widthMM = module.freeWidth || module.moduleWidth || 450;
  // position.x는 Three.js 단위 (mm * 0.01), 중심점
  const centerXmm = module.position.x * 100; // Three.js → mm
  const halfWidth = widthMM / 2;

  return {
    left: centerXmm - halfWidth,
    right: centerXmm + halfWidth,
    category: getModuleCategory(module),
  };
}

/**
 * 모듈의 카테고리 추출
 */
export function getModuleCategory(module: PlacedModule): 'full' | 'upper' | 'lower' {
  const id = module.moduleId;
  if (id.startsWith('upper-') || id.includes('-upper-')) return 'upper';
  if (id.startsWith('lower-') || id.includes('-lower-')) return 'lower';
  return 'full';
}

/**
 * 자유배치 충돌 체크
 * upper+lower는 같은 X 범위에 공존 가능, full은 전체 차지
 */
export function checkFreeCollision(
  existingModules: PlacedModule[],
  newBounds: FurnitureBoundsX,
  excludeId?: string
): boolean {
  for (const existing of existingModules) {
    if (excludeId && existing.id === excludeId) continue;
    if (!existing.isFreePlacement) continue;

    const existBounds = getModuleBoundsX(existing);

    // X 겹침 체크
    const hasOverlap =
      newBounds.left < existBounds.right + COLLISION_GAP_MM &&
      newBounds.right > existBounds.left - COLLISION_GAP_MM;

    if (!hasOverlap) continue;

    // upper+lower는 공존 가능
    const canCoexist =
      (newBounds.category === 'upper' && existBounds.category === 'lower') ||
      (newBounds.category === 'lower' && existBounds.category === 'upper');

    if (!canCoexist) return true; // 충돌
  }
  return false;
}

/**
 * X 좌표를 공간 경계 내로 클램핑 (mm 단위 입력/출력)
 */
export function clampToSpaceBoundsX(
  xPositionMM: number,
  furnitureWidthMM: number,
  spaceInfo: SpaceInfo
): number {
  const { startX, endX } = getInternalSpaceBoundsX(spaceInfo);
  const halfWidth = furnitureWidthMM / 2;
  return Math.max(startX + halfWidth, Math.min(endX - halfWidth, xPositionMM));
}

/**
 * X 좌표(mm)가 단내림 구간에 속하는지 판별
 * 단내림 구간이면 zone='dropped'와 줄어든 내경 높이를 반환
 */
export function detectDroppedZone(
  xPositionMM: number,
  spaceInfo: SpaceInfo,
  furnitureWidthMM?: number
): { zone: 'normal' | 'dropped'; droppedInternalHeight?: number } {
  if (!spaceInfo.droppedCeiling?.enabled) {
    return { zone: 'normal' };
  }

  const { startX, endX } = getInternalSpaceBoundsX(spaceInfo);
  const droppedWidth = spaceInfo.droppedCeiling.width || 0;
  const droppedPosition = spaceInfo.droppedCeiling.position || 'right';
  const halfW = (furnitureWidthMM || 0) / 2;

  // 가구의 좌/우 끝이 단내림 구간에 진입하면 dropped로 판별
  let isInDropped = false;
  if (droppedPosition === 'left') {
    // 단내림이 왼쪽: 가구 왼쪽 끝이 단내림 구간에 있으면
    isInDropped = (xPositionMM - halfW) < startX + droppedWidth;
  } else {
    // 단내림이 오른쪽: 가구 오른쪽 끝이 단내림 구간에 있으면
    isInDropped = (xPositionMM + halfW) > endX - droppedWidth;
  }

  console.log('🔍 [detectDroppedZone]', {
    xPositionMM, furnitureWidthMM, halfW,
    startX, endX, droppedWidth, droppedPosition,
    checkValue: droppedPosition === 'right' ? `${xPositionMM + halfW} > ${endX - droppedWidth}` : `${xPositionMM - halfW} < ${startX + droppedWidth}`,
    isInDropped,
  });

  if (!isInDropped) {
    return { zone: 'normal' };
  }

  // 단내림 구간의 내경 높이 = 전체 높이 - dropHeight - topFrame - floorFinish - base
  const dropHeight = spaceInfo.droppedCeiling.dropHeight || 0;
  const topFrameMM = spaceInfo.frameSize?.top || 30;
  const floorFinishMM = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? spaceInfo.floorFinish.height : 0;
  const baseHeightMM = spaceInfo.baseConfig?.type === 'stand' ? 0 : (spaceInfo.baseConfig?.height || 65);
  const floatHeightMM = spaceInfo.baseConfig?.placementType === 'float' ? (spaceInfo.baseConfig?.floatHeight || 0) : 0;
  const effectiveBaseHeight = spaceInfo.baseConfig?.type === 'stand' ? floatHeightMM : baseHeightMM;

  const droppedInternalHeight = spaceInfo.height - dropHeight - topFrameMM - floorFinishMM - effectiveBaseHeight;

  return { zone: 'dropped', droppedInternalHeight: Math.max(droppedInternalHeight, 0) };
}

/**
 * Three.js X 좌표를 공간 경계 내로 클램핑
 */
export function clampToSpaceBoundsThreeX(
  xThreeUnits: number,
  furnitureWidthMM: number,
  spaceInfo: SpaceInfo
): number {
  const clampedMM = clampToSpaceBoundsX(xThreeUnits * 100, furnitureWidthMM, spaceInfo);
  return SpaceCalculator.mmToThreeUnits(clampedMM);
}

/**
 * 자유배치 가구 너비 변경 시 위치(X) 보정
 *
 * 벽이나 다른 가구에 붙어있는 쪽은 고정하고, 반대쪽으로만 확장/축소한다.
 * - 왼쪽 붙음 → 왼쪽 고정, 오른쪽으로 확장/축소
 * - 오른쪽 붙음 → 오른쪽 고정, 왼쪽으로 확장/축소
 * - 양쪽 붙음 → 중심 고정 (기존 동작)
 * - 양쪽 안 붙음 → 중심 고정 (기존 동작)
 *
 * @returns 보정된 Three.js X 좌표 (position.x)
 */
export function calcResizedPositionX(
  module: PlacedModule,
  newWidthMm: number,
  allModules: PlacedModule[],
  spaceInfo: SpaceInfo
): number {
  const oldBounds = getModuleBoundsX(module);
  const { startX, endX } = getInternalSpaceBoundsX(spaceInfo);

  const SNAP_THRESHOLD = 3; // 3mm 이내면 "붙어있다"로 판단

  // 왼쪽에 뭔가 붙어있는지 확인 (벽 또는 다른 가구)
  let leftAttached = Math.abs(oldBounds.left - startX) <= SNAP_THRESHOLD;
  // 오른쪽에 뭔가 붙어있는지 확인 (벽 또는 다른 가구)
  let rightAttached = Math.abs(oldBounds.right - endX) <= SNAP_THRESHOLD;

  // 다른 가구의 경계와 비교
  for (const other of allModules) {
    if (other.id === module.id) continue;
    if (!other.isFreePlacement) continue;
    const otherBounds = getModuleBoundsX(other);
    if (Math.abs(oldBounds.left - otherBounds.right) <= SNAP_THRESHOLD) {
      leftAttached = true;
    }
    if (Math.abs(oldBounds.right - otherBounds.left) <= SNAP_THRESHOLD) {
      rightAttached = true;
    }
  }

  const currentCenterMm = module.position.x * 100;
  let newCenterMm: number;

  if (leftAttached && !rightAttached) {
    // 왼쪽 고정 → 오른쪽으로만 확장
    const fixedLeft = oldBounds.left;
    newCenterMm = fixedLeft + newWidthMm / 2;
  } else if (rightAttached && !leftAttached) {
    // 오른쪽 고정 → 왼쪽으로만 확장
    const fixedRight = oldBounds.right;
    newCenterMm = fixedRight - newWidthMm / 2;
  } else {
    // 양쪽 다 붙어있거나, 양쪽 다 안 붙어있으면 → 중심 고정
    newCenterMm = currentCenterMm;
  }

  // 공간 경계 내로 클램핑
  const clampedMm = clampToSpaceBoundsX(newCenterMm, newWidthMm, spaceInfo);
  return clampedMm * 0.01; // Three.js 단위로 변환
}
