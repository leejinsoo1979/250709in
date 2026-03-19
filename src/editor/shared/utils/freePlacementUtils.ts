import { PlacedModule } from '@/editor/shared/furniture/types';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { SpaceCalculator } from './indexing';
import { calculateFrameThickness } from '@/editor/shared/viewer3d/utils/geometry';

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
 * surroundType에 따라:
 *   - surround/both-sides: 프레임 두께(frameSize)를 경계에 반영
 *   - no-surround: 이격거리(gapConfig)만 적용
 */
export function getInternalSpaceBoundsX(spaceInfo: SpaceInfo): { startX: number; endX: number } {
  const totalWidth = spaceInfo.width || 2400;
  const halfW = totalWidth / 2;
  let startX = -halfW;
  let endX = halfW;

  if (spaceInfo.layoutMode === 'free-placement') {
    // surroundType가 surround/both-sides이면 프레임 두께를 경계에 반영
    if (spaceInfo.surroundType !== 'no-surround') {
      const frameThickness = calculateFrameThickness(spaceInfo);
      const hasCB = spaceInfo.droppedCeiling?.enabled;
      const cbPos = spaceInfo.droppedCeiling?.position || 'right';
      const cbWidth = hasCB ? (spaceInfo.droppedCeiling.width || 150) : 0;

      // 커튼박스 쪽: 커튼박스 너비만 제외 (프레임 이격 없음 — 커튼박스에 자체 패널 있음)
      // 반대쪽: 프레임 이격 적용
      if (hasCB && cbPos === 'left') {
        startX += cbWidth;
        endX -= frameThickness.rightMm;
      } else if (hasCB && cbPos === 'right') {
        startX += frameThickness.leftMm;
        endX -= cbWidth;
      } else {
        startX += frameThickness.leftMm;
        endX -= frameThickness.rightMm;
      }
      return { startX, endX };
    }

    // 노서라운드: 기존 이격거리(gapConfig) 기반 로직
    const leftGap = spaceInfo.gapConfig?.left ?? 1.5;
    const rightGap = spaceInfo.gapConfig?.right ?? 1.5;
    const hasDropped = spaceInfo.droppedCeiling?.enabled;
    const droppedPosition = spaceInfo.droppedCeiling?.position || 'right';
    const hasStep = spaceInfo.stepCeiling?.enabled;
    // 통합 배치공간(메인+단내림)↔커튼박스 경계이격
    // 단내림+커튼박스 동시: middle2 (단내림↔커튼박스), 커튼박스만: middle (메인↔커튼박스)
    const normalDroppedGap = (hasDropped && hasStep)
      ? (spaceInfo.gapConfig?.middle2 ?? spaceInfo.gapConfig?.middle ?? 1.5)
      : (spaceInfo.gapConfig?.middle ?? 1.5);

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
    const stepPosition = spaceInfo.stepCeiling?.position || 'right';

    // 이격거리 적용 — 벽이 있는 쪽만, 커튼박스/단내림 경계면은 middleGap
    const isBuiltIn = spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in';
    const isSemiStanding = spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing';
    const hasLeftWall = isBuiltIn || (isSemiStanding && spaceInfo.wallConfig?.left);
    const hasRightWall = isBuiltIn || (isSemiStanding && spaceInfo.wallConfig?.right);

    // 배치 가능 영역의 좌측/우측 경계에 인접한 것이 무엇인지 결정
    // 단내림 구간이 포함되었으므로: 벽 → 커튼박스 → (단내림+메인) 전체가 배치 영역
    // 단내림 쪽의 벽 이격은 일반 wall gap 적용 (단내림도 벽에 붙어있으므로)
    const leftAdjacent = hasDropped && droppedPosition === 'left' ? 'dropped' : 'wall';
    const rightAdjacent = hasDropped && droppedPosition === 'right' ? 'dropped' : 'wall';

    // 좌측 이격
    if (leftAdjacent === 'wall') {
      if (hasLeftWall) startX += leftGap;
    } else {
      startX += normalDroppedGap; // 커튼박스 경계
    }

    // 우측 이격
    if (rightAdjacent === 'wall') {
      if (hasRightWall) endX -= rightGap;
    } else {
      endX -= normalDroppedGap; // 커튼박스 경계
    }
  }

  return { startX, endX };
}

/**
 * PlacedModule의 X 범위 반환 (mm 단위)
 */
export function getModuleBoundsX(module: PlacedModule): FurnitureBoundsX {
  // 너비 우선순위: freeWidth(자유배치) > customWidth(슬롯/슬롯듀얼) > adjustedWidth(기둥침범) > moduleWidth > moduleId 파싱 > 450
  let widthMM = module.freeWidth || module.customWidth || module.adjustedWidth || module.moduleWidth || 0;
  if (!widthMM) {
    // moduleId에서 너비 파싱 (예: "full-1200" → 1200, "dual-upper-4drawer-1800" → 1800)
    const match = module.moduleId?.match(/-(\d{3,})(?:$|-)/);
    widthMM = match ? parseInt(match[1], 10) : 450;
  }
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

    // 단내림 구간의 내경 높이 = 전체높이 - dropHeight - topFrame - floorFinish - base
    const stepDropHeight = spaceInfo.stepCeiling!.dropHeight || 0;
    const topFrameMM = spaceInfo.frameSize?.top || 30;
    const floorFinishMM = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? spaceInfo.floorFinish.height : 0;
    const baseHeightMM = spaceInfo.baseConfig?.type === 'stand' ? 0 : (spaceInfo.baseConfig?.height || 65);
    const floatHeightMM = spaceInfo.baseConfig?.placementType === 'float' ? (spaceInfo.baseConfig?.floatHeight || 0) : 0;
    const effectiveBaseHeight = spaceInfo.baseConfig?.type === 'stand' ? floatHeightMM : baseHeightMM;

    const droppedInternalHeight = spaceInfo.height - stepDropHeight - topFrameMM - floorFinishMM - effectiveBaseHeight;

    console.log('🔍 [detectDroppedZone] free-placement stepCeiling', {
      xPositionMM, stepStartX, stepEndX, isInStep,
      spaceHeight: spaceInfo.height, stepDropHeight, topFrameMM, floorFinishMM, effectiveBaseHeight,
      droppedInternalHeight,
    });

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
    // 좌측에만 붙어있으면 좌측 고정
    newCenterMm = oldBounds.left + halfNew;
  } else if (rightAttached && !leftAttached) {
    // 우측에만 붙어있으면 우측 고정
    newCenterMm = oldBounds.right - halfNew;
  } else if (leftAttached && rightAttached) {
    // 양쪽 다 붙어있으면 좌측 고정 (너비 줄일 때 우측에서 줄어듬)
    newCenterMm = oldBounds.left + halfNew;
  } else {
    // 양쪽 다 안 붙어있으면 좌측 고정
    newCenterMm = oldBounds.left + halfNew;
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

// ─── 구간별 최적 가구 너비 자동 계산 유틸 ───

export type ZoneType = 'main' | 'stepCeiling' | 'curtainBox';

export interface ZonePlacementInfo {
  zone: ZoneType;
  placementStartXmm: number;  // 배치 시작점 (이격 반영, mm)
  placementEndXmm: number;    // 배치 끝점
  placementWidth: number;     // 배치가능 너비
}

/**
 * 각 구간(메인/단내림/커튼박스)의 배치가능 범위(mm) 계산.
 * CleanCAD2D.tsx 3단 치수선 로직을 재사용 가능한 형태로 추출.
 */
export function getZonePlacementBounds(spaceInfo: SpaceInfo): ZonePlacementInfo[] {
  const isFreePlacement = spaceInfo.layoutMode === 'free-placement';
  if (!isFreePlacement) return [];

  const totalWidth = spaceInfo.width || 2400;
  const halfTotal = totalWidth / 2;

  const hasDC = !!spaceInfo.droppedCeiling?.enabled;
  const hasSC = !!spaceInfo.stepCeiling?.enabled;
  const dcWidth = hasDC ? (spaceInfo.droppedCeiling!.width || 0) : 0;
  const scWidth = hasSC ? (spaceInfo.stepCeiling!.width || 0) : 0;
  const dcPosition = spaceInfo.droppedCeiling?.position || 'right';
  const scPosition = spaceInfo.stepCeiling?.position || 'right';

  const mainWidth = totalWidth - dcWidth - scWidth;

  const dcOnLeft = hasDC && dcPosition === 'left';
  const dcOnRight = hasDC && dcPosition === 'right';
  const scOnLeft = hasSC && scPosition === 'left';
  const scOnRight = hasSC && scPosition === 'right';

  // 구간 원점 X (mm, 중심=0 기준)
  const leftStackWidth = (dcOnLeft ? dcWidth : 0) + (scOnLeft ? scWidth : 0);
  const rightStackWidth = (dcOnRight ? dcWidth : 0) + (scOnRight ? scWidth : 0);

  const mainStartXmm = -halfTotal + leftStackWidth;
  const mainEndXmm = halfTotal - rightStackWidth;

  // gap 설정
  const leftGapMm = spaceInfo.gapConfig?.left ?? 1.5;
  const rightGapMm = spaceInfo.gapConfig?.right ?? 1.5;
  const middleGapMm = spaceInfo.gapConfig?.middle ?? 1.5;
  const middle2GapMm = (hasSC && hasDC)
    ? (spaceInfo.gapConfig?.middle2 ?? middleGapMm)
    : middleGapMm;

  const isBuiltIn = spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in';
  const isSemiStanding = spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing';
  const hasLeftWall = isBuiltIn || (isSemiStanding && spaceInfo.wallConfig?.left);
  const hasRightWall = isBuiltIn || (isSemiStanding && spaceInfo.wallConfig?.right);

  const zones: ZonePlacementInfo[] = [];

  // ── 메인 구간 ──
  let mainLeftDelta = 0;
  if (scOnLeft) {
    mainLeftDelta = -middleGapMm;
  } else if (dcOnLeft) {
    mainLeftDelta = middleGapMm;
  } else {
    mainLeftDelta = -(hasLeftWall ? leftGapMm : 0);
  }

  let mainRightDelta = 0;
  if (scOnRight) {
    mainRightDelta = -middleGapMm;
  } else if (dcOnRight) {
    mainRightDelta = middleGapMm;
  } else {
    mainRightDelta = -(hasRightWall ? rightGapMm : 0);
  }

  const mainPlacStart = mainStartXmm - mainLeftDelta;
  const mainPlacEnd = mainEndXmm + mainRightDelta;
  const mainPlacWidth = Math.round((mainWidth + mainLeftDelta + mainRightDelta) * 10) / 10;

  zones.push({
    zone: 'main',
    placementStartXmm: mainPlacStart,
    placementEndXmm: mainPlacEnd,
    placementWidth: mainPlacWidth,
  });

  // ── 단내림(stepCeiling) 구간 ──
  if (hasSC) {
    let scStartXmm: number;
    let scEndXmm: number;
    if (scOnLeft) {
      const scLeftEdge = dcOnLeft ? dcWidth : 0;
      scStartXmm = -halfTotal + scLeftEdge;
      scEndXmm = -halfTotal + scLeftEdge + scWidth;
    } else {
      scStartXmm = mainEndXmm;
      scEndXmm = mainEndXmm + scWidth;
    }

    const scInnerGap = middleGapMm;
    const sameSide = hasDC && dcPosition === scPosition;

    let scPlacStart: number;
    let scPlacEnd: number;
    let scPlacWidth: number;

    if (scOnLeft) {
      scPlacEnd = scEndXmm + scInnerGap;
      if (sameSide) {
        const scOuterGap = middle2GapMm;
        scPlacStart = scStartXmm - scOuterGap;
        scPlacWidth = Math.round((scWidth + scInnerGap + scOuterGap) * 10) / 10;
      } else {
        const scWallGap = hasLeftWall ? leftGapMm : 0;
        scPlacStart = scStartXmm + scWallGap;
        scPlacWidth = Math.round((scWidth + scInnerGap - scWallGap) * 10) / 10;
      }
    } else {
      scPlacStart = scStartXmm - scInnerGap;
      if (sameSide) {
        const scOuterGap = middle2GapMm;
        scPlacEnd = scEndXmm + scOuterGap;
        scPlacWidth = Math.round((scWidth + scInnerGap + scOuterGap) * 10) / 10;
      } else {
        const scWallGap = hasRightWall ? rightGapMm : 0;
        scPlacEnd = scEndXmm - scWallGap;
        scPlacWidth = Math.round((scWidth + scInnerGap - scWallGap) * 10) / 10;
      }
    }

    zones.push({
      zone: 'stepCeiling',
      placementStartXmm: scPlacStart,
      placementEndXmm: scPlacEnd,
      placementWidth: scPlacWidth,
    });
  }

  // ── 커튼박스(droppedCeiling) 구간 ──
  if (hasDC) {
    let dcStartXmm: number;
    let dcEndXmm: number;
    if (dcOnLeft) {
      dcStartXmm = -halfTotal;
      dcEndXmm = -halfTotal + dcWidth;
    } else {
      dcStartXmm = halfTotal - dcWidth;
      dcEndXmm = halfTotal;
    }

    const dcInnerGap = hasSC ? middle2GapMm : middleGapMm;
    const dcLeftGap = dcOnLeft ? (hasLeftWall ? leftGapMm : 0) : dcInnerGap;
    const dcRightGap = dcOnRight ? (hasRightWall ? rightGapMm : 0) : dcInnerGap;

    const dcPlacStart = dcStartXmm + dcLeftGap;
    const dcPlacEnd = dcEndXmm - dcRightGap;
    const dcPlacWidth = Math.round((dcWidth - dcLeftGap - dcRightGap) * 10) / 10;

    zones.push({
      zone: 'curtainBox',
      placementStartXmm: dcPlacStart,
      placementEndXmm: dcPlacEnd,
      placementWidth: dcPlacWidth,
    });
  }

  return zones;
}

/**
 * X좌표(mm)가 어느 구간에 속하는지 판별.
 * 기하학적 경계 기준 — 단내림 > 커튼박스 > 메인 순으로 체크.
 */
export function detectHoverZoneType(xMm: number, spaceInfo: SpaceInfo): ZoneType {
  const totalWidth = spaceInfo.width || 2400;
  const halfTotal = totalWidth / 2;

  const hasDC = !!spaceInfo.droppedCeiling?.enabled;
  const hasSC = !!spaceInfo.stepCeiling?.enabled;
  const dcWidth = hasDC ? (spaceInfo.droppedCeiling!.width || 0) : 0;
  const scWidth = hasSC ? (spaceInfo.stepCeiling!.width || 0) : 0;
  const dcPosition = spaceInfo.droppedCeiling?.position || 'right';
  const scPosition = spaceInfo.stepCeiling?.position || 'right';

  // 단내림 구간 체크
  if (hasSC) {
    const dcOnLeft = hasDC && dcPosition === 'left';
    const scOnLeft = scPosition === 'left';

    let scStartX: number;
    let scEndX: number;
    if (scOnLeft) {
      const scLeftEdge = dcOnLeft ? dcWidth : 0;
      scStartX = -halfTotal + scLeftEdge;
      scEndX = scStartX + scWidth;
    } else {
      const dcOnRight = hasDC && dcPosition === 'right';
      const rightStackDC = dcOnRight ? dcWidth : 0;
      scEndX = halfTotal - rightStackDC;
      scStartX = scEndX - scWidth;
    }
    if (xMm >= scStartX && xMm <= scEndX) return 'stepCeiling';
  }

  // 커튼박스 구간 체크
  if (hasDC) {
    let dcStartX: number;
    let dcEndX: number;
    if (dcPosition === 'left') {
      dcStartX = -halfTotal;
      dcEndX = -halfTotal + dcWidth;
    } else {
      dcStartX = halfTotal - dcWidth;
      dcEndX = halfTotal;
    }
    if (xMm >= dcStartX && xMm <= dcEndX) return 'curtainBox';
  }

  return 'main';
}

/**
 * 구간 내 이미 배치된 가구를 제외한 잔여 너비 계산.
 * 각 PlacedModule의 X bounds와 구간 범위의 겹침(overlap) 차감.
 * isSurroundPanel은 제외.
 */
export function getZoneRemainingWidth(
  zoneInfo: ZonePlacementInfo,
  modules: PlacedModule[],
  excludeId?: string
): number {
  let occupied = 0;
  for (const mod of modules) {
    if (excludeId && mod.id === excludeId) continue;
    if (!mod.isFreePlacement) continue;
    if (mod.isSurroundPanel) continue;

    const bounds = getModuleBoundsX(mod);
    // 구간 범위와의 겹침(overlap) 계산
    const overlapStart = Math.max(bounds.left, zoneInfo.placementStartXmm);
    const overlapEnd = Math.min(bounds.right, zoneInfo.placementEndXmm);
    if (overlapEnd > overlapStart) {
      occupied += overlapEnd - overlapStart;
    }
  }

  return Math.max(0, zoneInfo.placementWidth - occupied);
}

/**
 * 잔여 너비를 기반으로 최적 가구 너비 계산.
 * isDual이면 전체, 싱글이면 절반.
 * 최소 200mm 보장.
 */
export function calculateOptimalFurnitureWidth(remaining: number, isDual: boolean): number {
  const raw = isDual ? remaining : remaining / 2;
  return Math.max(200, Math.round(raw));
}
