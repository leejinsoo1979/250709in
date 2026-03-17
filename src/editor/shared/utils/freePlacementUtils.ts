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
  let startX = -halfW;
  let endX = halfW;

  if (spaceInfo.layoutMode === 'free-placement') {
    const leftGap = spaceInfo.gapConfig?.left ?? 1.5;
    const rightGap = spaceInfo.gapConfig?.right ?? 1.5;
    const middleGap = spaceInfo.gapConfig?.middle ?? 1.5;
    const hasDropped = spaceInfo.droppedCeiling?.enabled;
    const droppedPosition = spaceInfo.droppedCeiling?.position || 'right';

    // 커튼박스 구간 제외
    if (hasDropped) {
      const surroundWidth = spaceInfo.droppedCeiling.width || 0;
      if (droppedPosition === 'left') {
        startX += surroundWidth;
      } else {
        endX -= surroundWidth;
      }
    }

    // 단내림(stepCeiling) 구간은 제외하지 않음 — 가구 배치 허용 (높이만 조정)
    const hasStep = spaceInfo.stepCeiling?.enabled;
    const stepPosition = spaceInfo.stepCeiling?.position || 'right';

    // 이격거리 적용 — 벽이 있는 쪽만, 커튼박스/단내림 경계면은 middleGap
    const isBuiltIn = spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in';
    const isSemiStanding = spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing';
    const hasLeftWall = isBuiltIn || (isSemiStanding && spaceInfo.wallConfig?.left);
    const hasRightWall = isBuiltIn || (isSemiStanding && spaceInfo.wallConfig?.right);

    // 메인구간 좌측/우측에 인접한 것이 무엇인지 결정
    // 구간 순서: 벽 → 커튼박스 → 단내림 → 메인구간
    const leftAdjacent = hasStep && stepPosition === 'left' ? 'step'
      : hasDropped && droppedPosition === 'left' ? 'dropped'
      : 'wall';
    const rightAdjacent = hasStep && stepPosition === 'right' ? 'step'
      : hasDropped && droppedPosition === 'right' ? 'dropped'
      : 'wall';

    // 좌측 이격
    if (leftAdjacent === 'wall') {
      if (hasLeftWall) startX += leftGap;
    } else {
      startX += middleGap; // 커튼박스 or 단내림 경계
    }

    // 우측 이격
    if (rightAdjacent === 'wall') {
      if (hasRightWall) endX -= rightGap;
    } else {
      endX -= middleGap; // 커튼박스 or 단내림 경계
    }
  }

  return { startX, endX };
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
    // 서라운드 패널은 별도 공간이므로 충돌 체크 제외
    if (existing.isSurroundPanel) continue;

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
  // ── 자유배치모드: stepCeiling(단내림) 구간 감지 ──
  if (spaceInfo.layoutMode === 'free-placement') {
    const hasStep = spaceInfo.stepCeiling?.enabled;
    if (!hasStep) {
      return { zone: 'normal' };
    }

    const totalWidth = spaceInfo.width || 2400;
    const halfTotal = totalWidth / 2;
    const stepWidth = spaceInfo.stepCeiling!.width || 0;
    const stepPosition = spaceInfo.stepCeiling!.position || 'right';
    const surroundWidth = spaceInfo.droppedCeiling?.enabled ? (spaceInfo.droppedCeiling.width || 0) : 0;
    const droppedPosition = spaceInfo.droppedCeiling?.position || 'right';
    const halfFW = (furnitureWidthMM || 0) / 2;

    // 단내림 구간의 X 범위 계산 (커튼박스 안쪽에 위치)
    let stepStartX: number;
    let stepEndX: number;

    if (stepPosition === 'right') {
      // 우측 단내림: 커튼박스가 우측이면 커튼박스 왼쪽에, 아니면 공간 우측 끝에서
      const rightEdge = (droppedPosition === 'right' && spaceInfo.droppedCeiling?.enabled)
        ? halfTotal - surroundWidth
        : halfTotal;
      stepEndX = rightEdge;
      stepStartX = rightEdge - stepWidth;
    } else {
      // 좌측 단내림: 커튼박스가 좌측이면 커튼박스 오른쪽에, 아니면 공간 좌측 끝에서
      const leftEdge = (droppedPosition === 'left' && spaceInfo.droppedCeiling?.enabled)
        ? -halfTotal + surroundWidth
        : -halfTotal;
      stepStartX = leftEdge;
      stepEndX = leftEdge + stepWidth;
    }

    // 가구 중심이 단내림 구간에 있는지 판별
    const isInStep = xPositionMM >= stepStartX && xPositionMM <= stepEndX;

    if (!isInStep) {
      return { zone: 'normal' };
    }

    // 단내림 구간의 내경 높이 = stepCeiling.height - topFrame - floorFinish - base
    const stepHeight = spaceInfo.stepCeiling!.height || spaceInfo.height;
    const topFrameMM = spaceInfo.frameSize?.top || 30;
    const floorFinishMM = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? spaceInfo.floorFinish.height : 0;
    const baseHeightMM = spaceInfo.baseConfig?.type === 'stand' ? 0 : (spaceInfo.baseConfig?.height || 65);
    const floatHeightMM = spaceInfo.baseConfig?.placementType === 'float' ? (spaceInfo.baseConfig?.floatHeight || 0) : 0;
    const effectiveBaseHeight = spaceInfo.baseConfig?.type === 'stand' ? floatHeightMM : baseHeightMM;

    const droppedInternalHeight = stepHeight - topFrameMM - floorFinishMM - effectiveBaseHeight;

    return { zone: 'dropped', droppedInternalHeight: Math.max(droppedInternalHeight, 0) };
  }

  // ── 균등배치모드: droppedCeiling(단내림) 구간 감지 ──
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
  const halfNew = newWidthMm / 2;

  // ── 잠긴 이격 경계 ──
  const lockedGaps = spaceInfo.lockedWallGaps;
  const effStart = (lockedGaps?.left != null) ? startX + lockedGaps.left : startX;
  const effEnd = (lockedGaps?.right != null) ? endX - lockedGaps.right : endX;

  // ── 붙어있는 쪽 고정 ──
  const SNAP_THRESHOLD = 3;

  let leftAttached = Math.abs(oldBounds.left - startX) <= SNAP_THRESHOLD
    || (lockedGaps?.left != null && Math.abs(oldBounds.left - effStart) <= SNAP_THRESHOLD);
  let rightAttached = Math.abs(oldBounds.right - endX) <= SNAP_THRESHOLD
    || (lockedGaps?.right != null && Math.abs(oldBounds.right - effEnd) <= SNAP_THRESHOLD);

  for (const other of allModules) {
    if (other.id === module.id || !other.isFreePlacement) continue;
    const otherBounds = getModuleBoundsX(other);
    if (Math.abs(oldBounds.left - otherBounds.right) <= SNAP_THRESHOLD) leftAttached = true;
    if (Math.abs(oldBounds.right - otherBounds.left) <= SNAP_THRESHOLD) rightAttached = true;
  }

  const currentCenterMm = module.position.x * 100;
  let newCenterMm: number;

  if (leftAttached && !rightAttached) {
    newCenterMm = oldBounds.left + halfNew;
  } else if (rightAttached && !leftAttached) {
    newCenterMm = oldBounds.right - halfNew;
  } else {
    newCenterMm = currentCenterMm;
  }

  let clampedMm = clampToSpaceBoundsX(newCenterMm, newWidthMm, spaceInfo);

  // 잠긴 이격 영역 침범 방지
  clampedMm = Math.max(effStart + halfNew, Math.min(effEnd - halfNew, clampedMm));

  // 결과 검증 로그
  const resultLeft = clampedMm - halfNew;
  const resultRight = clampedMm + halfNew;
  if (lockedGaps?.left != null || lockedGaps?.right != null) {
    console.log('🔒 [calcResizedPositionX]', {
      oldWidth: module.freeWidth || module.moduleWidth,
      newWidth: newWidthMm,
      oldCenter: currentCenterMm,
      oldLeft: oldBounds.left, oldRight: oldBounds.right,
      effStart, effEnd,
      leftAttached, rightAttached,
      newCenter: clampedMm,
      resultLeft, resultRight,
      leftGap: resultLeft - startX,
      rightGap: endX - resultRight,
      lockedGaps,
    });
  }

  return clampedMm * 0.01;
}
