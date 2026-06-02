import { PlacedModule } from '@/editor/shared/furniture/types';
import { SpaceInfo, type FreePlacementGuideSlot } from '@/store/core/spaceConfigStore';
import { Column } from '@/types/space';
import { SpaceCalculator } from './indexing';
import { calculateFrameThickness } from '@/editor/shared/viewer3d/utils/geometry';

/**
 * 자유배치 모드 유틸리티
 * AABB 충돌 체크, 공간 경계 클램핑 등
 */

// 가구 간 최소 간격 (mm) - 0으로 설정하여 완전 밀착 허용
const COLLISION_GAP_MM = 0;
const COLLISION_EPSILON_MM = 0.5;

export interface FurnitureBoundsX {
  left: number;   // 좌측 X (mm)
  right: number;  // 우측 X (mm)
  category: 'full' | 'upper' | 'lower';
}

export interface FreeGuideZoneYRangeOptions {
  bottomClearanceMm?: number;
  topClearanceMm?: number;
  lowerHeightMm?: number;
  upperHeightMm?: number;
}

export function getFreeGuideZoneYRangeMm(
  zone: 'full' | 'upper' | 'lower',
  spaceInfo: SpaceInfo,
  options: FreeGuideZoneYRangeOptions = {}
): { start: number; end: number } | null {
  const fullHeightMm = spaceInfo.height || 0;
  const topMoldingMm = spaceInfo.frameSize?.top ?? 0;
  const topGapMm = (spaceInfo.frameSize as any)?.topGap ?? 0;
  const topClearanceMm = options.topClearanceMm !== undefined
    ? Math.max(0, options.topClearanceMm)
    : Math.max(0, topMoldingMm > 0 ? topMoldingMm : topGapMm);
  const isFloatingBase = spaceInfo.baseConfig?.type === 'stand'
    || (spaceInfo.baseConfig?.height ?? 0) <= 0;
  const defaultBottomClearanceMm = isFloatingBase
    ? Math.max(0, spaceInfo.baseConfig?.floatHeight ?? 0)
    : Math.max(0, spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 0) : 0);
  const bottomClearanceMm = options.bottomClearanceMm ?? defaultBottomClearanceMm;
  const lowerMm = options.lowerHeightMm ?? spaceInfo.guideLowerHeight ?? 800;
  const upperMm = options.upperHeightMm ?? spaceInfo.guideUpperHeight ?? 700;
  const midwayMm = Math.max(0, Math.round(fullHeightMm - topClearanceMm - upperMm - lowerMm - bottomClearanceMm));
  const floorFinishMm = spaceInfo.hasFloorFinish && spaceInfo.floorFinish
    ? Math.max(0, Math.round(spaceInfo.floorFinish.height || 0))
    : 0;

  const yBaseTop = bottomClearanceMm;
  const yLowerTop = yBaseTop + lowerMm;
  const ySplitLowerBaseTop = yBaseTop + floorFinishMm;
  const ySplitLowerTop = yLowerTop + floorFinishMm;
  const yMidTop = yLowerTop + midwayMm;
  const yUpperTop = yMidTop + upperMm;

  if (zone === 'full') {
    const start = bottomClearanceMm + floorFinishMm;
    return { start, end: Math.max(start, fullHeightMm - topClearanceMm) };
  }
  if (zone === 'upper') return { start: yMidTop, end: yUpperTop };
  return { start: ySplitLowerBaseTop, end: Math.max(ySplitLowerBaseTop, Math.min(ySplitLowerTop, yMidTop)) };
}

export function getFreeGuideSlotYRangeMm(
  slot: FreePlacementGuideSlot,
  spaceInfo: SpaceInfo
): { start: number; end: number } | null {
  const zone = slot.guideZone || 'full';
  const fullHeightMm = spaceInfo.height || 0;
  const topAllMode = spaceInfo.guideTopFrameAllMode ?? true;
  const globalTopEnabled = (spaceInfo.frameSize?.top ?? 0) > 0;
  const globalTopClearance = globalTopEnabled
    ? Math.max(0, spaceInfo.frameSize?.top ?? 0)
    : Math.max(0, (spaceInfo.frameSize as any)?.topGap ?? 0);
  const slotTopEnabled = topAllMode ? globalTopEnabled : (slot.hasTopFrame ?? globalTopEnabled);
  const slotTopClearance = slotTopEnabled
    ? Math.max(0, slot.topFrameThickness ?? globalTopClearance)
    : Math.max(0, slot.topFrameGap ?? (spaceInfo.frameSize as any)?.topGap ?? 0);

  const globalRange = getFreeGuideZoneYRangeMm(zone, spaceInfo);
  if (!globalRange) return null;

  if (zone === 'upper') {
    return { start: globalRange.start, end: Math.max(globalRange.start, fullHeightMm - slotTopClearance) };
  }

  if (zone === 'lower') return globalRange;
  if (zone === 'full') return globalRange;

  return {
    start: globalRange.start,
    end: Math.max(globalRange.start, fullHeightMm - slotTopClearance)
  };
}

export function applyFreeGuideSlotToPlacement<TDimensions extends { width: number; height: number; depth: number }, TModuleData extends { dimensions?: Partial<TDimensions> }>(
  slot: FreePlacementGuideSlot,
  spaceInfo: SpaceInfo,
  dimensions: TDimensions,
  moduleData: TModuleData
): { dimensions: TDimensions; moduleData: TModuleData & {
  guideSlotYRangeMm?: { start: number; end: number };
  guideSlotDepthMm?: number;
  guideSlotDepthGapMm?: number;
  guideSlotUpperDepthMm?: number;
  guideSlotLowerDepthMm?: number;
  hasTopFrame?: boolean;
  topFrameThickness?: number;
  topFrameOffset?: number;
  topFrameGap?: number;
  hasBase?: boolean;
  baseFrameHeight?: number;
  baseFrameOffset?: number;
  baseFrameGap?: number;
  individualFloatHeight?: number;
} } {
  const guideSlotYRange = getFreeGuideSlotYRangeMm(slot, spaceInfo);
  const guideSlotHeight = guideSlotYRange ? guideSlotYRange.end - guideSlotYRange.start : undefined;
  const placementWidth = Math.max(1, Math.round(slot.width));
  const category = (moduleData as any).category as 'full' | 'upper' | 'lower' | undefined;
  const defaultUpperDepth = Math.min(spaceInfo.depth || 300, spaceInfo.furnitureDepthDefaults?.upper ?? 300);
  const defaultLowerDepth = Math.min(spaceInfo.depth || 580, spaceInfo.furnitureDepthDefaults?.lowerBasic ?? 580);
  const defaultFullDepth = Math.min(spaceInfo.depth || 580, spaceInfo.furnitureDepthDefaults?.wardrobe ?? spaceInfo.furnitureDepthDefaults?.tall ?? 580);
  const slotZone = slot.guideZone || 'full';
  const upperDepth = slot.upperDepth ?? slot.depth ?? defaultUpperDepth;
  const lowerDepth = slot.lowerDepth ?? slot.depth ?? defaultLowerDepth;
  const fullDepth = slot.depth ?? (
    slot.upperDepth !== undefined || slot.lowerDepth !== undefined
      ? Math.max(upperDepth, lowerDepth)
      : defaultFullDepth
  );
  const placementDepth = Math.max(1, Math.round(
    slotZone === 'upper' || category === 'upper'
      ? upperDepth
      : slotZone === 'lower' || category === 'lower'
        ? lowerDepth
        : fullDepth
  ));
  const upperGap = slot.upperDepthGap ?? slot.depthGap ?? 0;
  const lowerGap = slot.lowerDepthGap ?? slot.depthGap ?? 0;
  const fullGap = slot.depthGap ?? (
    slot.upperDepthGap !== undefined || slot.lowerDepthGap !== undefined
      ? Math.min(upperGap, lowerGap)
      : 0
  );
  const placementGap = Math.max(0, Math.round(
    slotZone === 'upper' || category === 'upper'
      ? upperGap
      : slotZone === 'lower' || category === 'lower'
        ? lowerGap
        : fullGap
  ));
  const canApplyTopFrame = slotZone !== 'lower' && category !== 'lower';
  const canApplyBaseFrame = slotZone !== 'upper' && category !== 'upper';
  const globalTopEnabled = (spaceInfo.frameSize?.top ?? 30) > 0;
  const globalTopThickness = spaceInfo.frameSize?.top ?? 30;
  const globalTopGap = Math.max(0, (spaceInfo.frameSize as any)?.topGap ?? 0);
  const globalTopOffset = Math.round((spaceInfo.frameSize as any)?.topOffset ?? 0);
  const globalBaseEnabled = spaceInfo.baseConfig?.type !== 'stand' && (spaceInfo.baseConfig?.height ?? 0) > 0;
  const globalBaseHeight = Math.max(0, Math.round(spaceInfo.baseConfig?.height ?? 65));
  const defaultSlotBaseHeight = slotZone === 'lower' ? 105 : globalBaseHeight;
  const globalBaseGap = globalBaseEnabled ? Math.max(0, Math.round((spaceInfo.baseConfig as any)?.gap ?? 0)) : 0;
  const globalBaseOffset = Math.round((spaceInfo.baseConfig as any)?.offset ?? 0);
  const globalFloatHeight = globalBaseEnabled ? 0 : Math.max(0, Math.round(spaceInfo.baseConfig?.floatHeight ?? 0));
  const nextDimensions = {
    ...dimensions,
    width: placementWidth,
    depth: placementDepth,
    ...(guideSlotHeight !== undefined ? { height: guideSlotHeight } : {}),
  } as TDimensions;
  const nextModuleData = {
    ...moduleData,
    ...(guideSlotYRange ? { guideSlotYRangeMm: guideSlotYRange } : {}),
    guideSlotDepthMm: placementDepth,
    guideSlotDepthGapMm: placementGap,
    ...(slot.guideZone === 'full' && (slot.upperDepth !== undefined || slot.lowerDepth !== undefined)
      ? {
        guideSlotUpperDepthMm: Math.max(1, Math.round(upperDepth)),
        guideSlotLowerDepthMm: Math.max(1, Math.round(lowerDepth)),
      }
      : {}),
    ...(canApplyTopFrame ? { hasTopFrame: slot.hasTopFrame ?? globalTopEnabled } : {}),
    ...(canApplyTopFrame ? { topFrameThickness: Math.max(0, Math.round(slot.topFrameThickness ?? globalTopThickness)) } : {}),
    ...(canApplyTopFrame ? { topFrameOffset: Math.round(slot.topFrameOffset ?? globalTopOffset) } : {}),
    ...(canApplyTopFrame ? { topFrameGap: Math.max(0, Math.round(slot.topFrameGap ?? globalTopGap)) } : {}),
    ...(canApplyBaseFrame ? { hasBase: slot.hasBase ?? globalBaseEnabled } : {}),
    ...(canApplyBaseFrame ? { baseFrameHeight: Math.max(0, Math.round(slot.baseFrameHeight ?? defaultSlotBaseHeight)) } : {}),
    ...(canApplyBaseFrame ? { baseFrameOffset: Math.round(slot.baseFrameOffset ?? globalBaseOffset) } : {}),
    ...(canApplyBaseFrame ? { baseFrameGap: Math.max(0, Math.round(slot.baseFrameGap ?? globalBaseGap)) } : {}),
    ...(canApplyBaseFrame ? { individualFloatHeight: Math.max(0, Math.round(slot.individualFloatHeight ?? globalFloatHeight)) } : {}),
    dimensions: {
      ...(moduleData.dimensions || {}),
      width: placementWidth,
      depth: placementDepth,
      ...(guideSlotHeight !== undefined ? { height: guideSlotHeight } : {}),
    }
  } as TModuleData & {
    guideSlotYRangeMm?: { start: number; end: number };
    guideSlotDepthMm?: number;
    guideSlotDepthGapMm?: number;
    guideSlotUpperDepthMm?: number;
    guideSlotLowerDepthMm?: number;
  };

  return { dimensions: nextDimensions, moduleData: nextModuleData };
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
 * 자유배치 가이드 전용 X 범위.
 * 가이드 와리는 사용자가 입력한 좌우 이격값만 공간 폭에서 제외한 폭을 기준으로 한다.
 */
export function getFreePlacementGuideBoundsX(spaceInfo: SpaceInfo): { startX: number; endX: number } {
  const totalWidth = spaceInfo.width || 2400;
  const halfW = totalWidth / 2;
  const leftGap = spaceInfo.gapConfig?.left ?? 0;
  const rightGap = spaceInfo.gapConfig?.right ?? 0;

  return {
    startX: -halfW + leftGap,
    endX: halfW - rightGap
  };
}

export function redistributeFreePlacementGuidesForSpaceChange(
  slots: FreePlacementGuideSlot[] | undefined,
  previousSpaceInfo: SpaceInfo,
  nextSpaceInfo: SpaceInfo
): FreePlacementGuideSlot[] | undefined {
  if (!slots || slots.length === 0) return slots;

  const previousWidth = previousSpaceInfo.width || 0;
  const nextWidth = nextSpaceInfo.width || 0;
  const previousBounds = getFreePlacementGuideBoundsX(previousSpaceInfo);
  const nextBounds = getFreePlacementGuideBoundsX(nextSpaceInfo);
  const previousStartX = previousBounds.startX + previousWidth / 2;
  const previousEndX = previousBounds.endX + previousWidth / 2;
  const nextStartX = nextBounds.startX + nextWidth / 2;
  const nextEndX = nextBounds.endX + nextWidth / 2;
  const previousGuideWidth = Math.max(0, previousEndX - previousStartX);
  const nextGuideWidth = Math.max(0, nextEndX - nextStartX);

  if (previousGuideWidth <= 0 || nextGuideWidth <= 0) {
    return slots.map((slot) => ({ ...slot }));
  }

  const scale = nextGuideWidth / previousGuideWidth;
  const zoneOrder = { full: 0, upper: 1, lower: 2 };

  return slots
    .map((slot) => {
      const relativeStart = (slot.x - previousStartX) / previousGuideWidth;
      const nextX = nextStartX + relativeStart * nextGuideWidth;
      return {
        ...slot,
        x: Math.max(nextStartX, Math.min(nextEndX, nextX)),
        width: Math.max(1, slot.width * scale)
      };
    })
    .sort((a, b) => {
      const zoneA = a.guideZone || 'full';
      const zoneB = b.guideZone || 'full';
      return zoneOrder[zoneA] - zoneOrder[zoneB] || a.x - b.x || a.index - b.index;
    })
    .map((slot, index, list) => {
      const sameLineIndex = list
        .slice(0, index + 1)
        .filter((item) => (
          (item.guideZone || 'full') === (slot.guideZone || 'full')
          && (item.guideGroupId || '') === (slot.guideGroupId || '')
        )).length - 1;
      return { ...slot, index: sameLineIndex };
    });
}

/**
 * PlacedModule의 X 범위 반환 (mm 단위)
 */
export function getModuleBoundsX(module: PlacedModule): FurnitureBoundsX {
  // 너비 우선순위: freeWidth(자유배치) > slotCustomWidth(슬롯 사용자지정) > customWidth(슬롯/듀얼) > adjustedWidth(기둥침범) > moduleWidth > moduleId 파싱 > 450
  let widthMM = module.freeWidth || module.slotCustomWidth || module.customWidth || module.adjustedWidth || module.moduleWidth || 0;
  if (!widthMM) {
    // moduleId에서 너비 파싱 (예: "full-1200" → 1200, "dual-upper-4drawer-1800" → 1800)
    const match = module.moduleId?.match(/-(\d{3,})(?:$|-)/);
    widthMM = match ? parseInt(match[1], 10) : 450;
  }
  // position.x는 Three.js 단위 (mm * 0.01), 중심점
  // 반올림 없이 실수 그대로 사용 → 반올림 방향 편향(1mm 오차) 방지
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
  if (module.freePlacementCategory) return module.freePlacementCategory;
  if (module.guideSlotZone) return module.guideSlotZone;

  const id = module.moduleId;
  if (id.startsWith('upper-') || id.includes('-upper-')) return 'upper';
  if (id.startsWith('lower-') || id.includes('-lower-')) return 'lower';
  return 'full';
}

export function resolveInsertFrameResizeHingePosition(
  module: PlacedModule,
  allModules: PlacedModule[],
  spaceInfo: SpaceInfo
): 'left' | 'right' {
  if (module.hingePosition === 'left' || module.hingePosition === 'right') {
    return module.hingePosition;
  }

  const oldBounds = getModuleBoundsX(module);
  const { startX, endX } = getInternalSpaceBoundsX(spaceInfo);
  const lockedGaps = spaceInfo.lockedWallGaps;
  const effStart = lockedGaps?.left != null ? startX + lockedGaps.left : startX;
  const effEnd = lockedGaps?.right != null ? endX - lockedGaps.right : endX;
  const SNAP_MM = 10;
  const NEAR_MM = 80;
  const currentCenterMm = module.position.x * 100;
  const spaceMidMm = (startX + endX) / 2;

  let leftGap: number | null = null;
  let rightGap: number | null = null;

  const rememberLeftGap = (gap: number) => {
    leftGap = leftGap == null ? gap : Math.min(leftGap, gap);
  };
  const rememberRightGap = (gap: number) => {
    rightGap = rightGap == null ? gap : Math.min(rightGap, gap);
  };

  for (const other of allModules) {
    if (other.id === module.id || other.isSurroundPanel) continue;
    const otherBounds = getModuleBoundsX(other);

    const gapToLeft = oldBounds.left - otherBounds.right;
    if (gapToLeft >= -SNAP_MM && gapToLeft <= NEAR_MM) {
      rememberLeftGap(Math.max(0, gapToLeft));
    }

    const gapToRight = otherBounds.left - oldBounds.right;
    if (gapToRight >= -SNAP_MM && gapToRight <= NEAR_MM) {
      rememberRightGap(Math.max(0, gapToRight));
    }
  }

  const leftWallGap = oldBounds.left - effStart;
  if (leftWallGap >= -SNAP_MM && leftWallGap <= NEAR_MM) {
    rememberLeftGap(Math.max(0, leftWallGap));
  }

  const rightWallGap = effEnd - oldBounds.right;
  if (rightWallGap >= -SNAP_MM && rightWallGap <= NEAR_MM) {
    rememberRightGap(Math.max(0, rightWallGap));
  }

  if (leftGap != null || rightGap != null) {
    if (leftGap == null) return 'right';
    if (rightGap == null) return 'left';
    if (leftGap < rightGap) return 'left';
    if (rightGap < leftGap) return 'right';
  }

  return currentCenterMm <= spaceMidMm ? 'left' : 'right';
}

/**
 * 자유배치 가이드 슬롯 중 아직 점유되지 않은 슬롯을 좌측부터 찾는다.
 * upper/lower는 기존 자유배치 규칙처럼 같은 X 슬롯에 서로 공존할 수 있다.
 */
export function findAvailableFreeGuideSlot(
  slots: FreePlacementGuideSlot[] | undefined,
  placedModules: PlacedModule[],
  spaceInfo: SpaceInfo,
  category: 'full' | 'upper' | 'lower',
  extraOccupiedBounds: FurnitureBoundsX[] = []
): FreePlacementGuideSlot | null {
  if (!slots || slots.length === 0) return null;

  const spaceWidth = spaceInfo.width || 0;
  const guideSlots = slots.map(slot => ({ ...slot, guideZone: slot.guideZone || 'full' as const }));
  const hasUpperSlots = guideSlots.some(slot => slot.guideZone === 'upper');
  const hasLowerSlots = guideSlots.some(slot => slot.guideZone === 'lower');
  const sortedSlots = guideSlots
    .filter(slot => {
      if (category === 'upper') return hasUpperSlots ? slot.guideZone === 'upper' : slot.guideZone === 'full';
      if (category === 'lower') return hasLowerSlots ? slot.guideZone === 'lower' : slot.guideZone === 'full';
      return slot.guideZone === 'full';
    })
    .sort((a, b) => a.x - b.x);
  const existingBounds = placedModules
    .filter(module => module.isFreePlacement && !module.isSurroundPanel)
    .map(getModuleBoundsX)
    .concat(extraOccupiedBounds);

  for (const slot of sortedSlots) {
    const slotLeft = slot.x - spaceWidth / 2;
    const slotRight = slot.x + slot.width - spaceWidth / 2;
    const isOccupied = existingBounds.some(bounds => {
      const overlaps = bounds.left < slotRight - 0.5 && bounds.right > slotLeft + 0.5;
      if (!overlaps) return false;

      const canCoexist =
        (category === 'upper' && bounds.category === 'lower') ||
        (category === 'lower' && bounds.category === 'upper');

      return !canCoexist;
    });

    if (!isOccupied) return slot;
  }

  return null;
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
      newBounds.left < existBounds.right + COLLISION_GAP_MM - COLLISION_EPSILON_MM &&
      newBounds.right > existBounds.left - COLLISION_GAP_MM + COLLISION_EPSILON_MM;

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
 * 기둥-가구 충돌 체크 (자유배치 모드)
 * 기둥의 X 범위와 가구의 X 범위가 겹치면 충돌
 */
export function checkColumnCollision(
  columns: Column[],
  newBounds: FurnitureBoundsX
): boolean {
  for (const colBounds of getColumnObstacleBoundsX(columns)) {
    const colLeft = colBounds.left;
    const colRight = colBounds.right;

    // X 겹침 체크
    const hasOverlap =
      newBounds.left < colRight + COLLISION_GAP_MM - COLLISION_EPSILON_MM &&
      newBounds.right > colLeft - COLLISION_GAP_MM + COLLISION_EPSILON_MM;

    if (hasOverlap) return true;
  }
  return false;
}

/**
 * 자유배치에서 기둥을 X축 장애물로 변환.
 * noCollision 기둥은 사용자가 의도적으로 가구 충돌을 끈 상태이므로 제외한다.
 */
export function getColumnObstacleBoundsX(columns: Column[]): FurnitureBoundsX[] {
  return columns
    .filter(col => !col.noCollision && col.width > 0)
    .map(col => {
      const colCenterXmm = col.position[0] * 100;
      const colHalfWidth = col.width / 2;
      const epThickness = Math.max(0, col.endPanelThickness ?? 18);
      const leftEp = col.hasLeftEndPanel ? epThickness : 0;
      const rightEp = col.hasRightEndPanel ? epThickness : 0;
      return {
        left: colCenterXmm - colHalfWidth - leftEp,
        right: colCenterXmm + colHalfWidth + rightEp,
        category: 'full' as const,
      };
    });
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

  // 좌측 정렬 기준점 결정: 인접 가구 우측 끝 우선, 없으면 oldBounds.left, 벽 이격 경계
  let leftAnchor: number | null = null;
  let rightAnchor: number | null = null;

  // 벽/이격 경계 체크
  if (Math.abs(oldBounds.left - startX) <= SNAP_THRESHOLD) leftAnchor = startX;
  else if (lockedGaps?.left != null && Math.abs(oldBounds.left - effStart) <= SNAP_THRESHOLD) leftAnchor = effStart;

  if (Math.abs(oldBounds.right - endX) <= SNAP_THRESHOLD) rightAnchor = endX;
  else if (lockedGaps?.right != null && Math.abs(oldBounds.right - effEnd) <= SNAP_THRESHOLD) rightAnchor = effEnd;

  // 인접 가구 체크 — 가구 끝점을 정확한 anchor로 사용 (부동소수점 오차 제거)
  for (const other of allModules) {
    if (other.id === module.id || !other.isFreePlacement) continue;
    const otherBounds = getModuleBoundsX(other);
    if (Math.abs(oldBounds.left - otherBounds.right) <= SNAP_THRESHOLD) {
      leftAnchor = otherBounds.right; // 인접 가구의 우측 끝에 정확히 붙임
    }
    if (Math.abs(oldBounds.right - otherBounds.left) <= SNAP_THRESHOLD) {
      rightAnchor = otherBounds.left; // 인접 가구의 좌측 끝에 정확히 붙임
    }
  }

  const leftAttached = leftAnchor !== null;
  const rightAttached = rightAnchor !== null;

  const currentCenterMm = module.position.x * 100;
  let newCenterMm: number;

  // 공간 중앙 기준으로 가구가 좌/우 어느 쪽에 있는지 판단
  //  - 좌측 영역 가구: 좌측면(oldLeft) 고정 → 우측으로 확장/축소
  //  - 우측 영역 가구: 우측면(oldRight) 고정 → 좌측으로 확장/축소
  const spaceMidMm = (startX + endX) / 2;
  const isOnLeftSide = currentCenterMm < spaceMidMm;

  if (leftAttached && rightAttached) {
    // 양쪽 다 붙어있으면 공간 위치에 따라 anchor 선택
    newCenterMm = isOnLeftSide ? (leftAnchor! + halfNew) : (rightAnchor! - halfNew);
  } else if (leftAttached) {
    // 좌측에만 붙어있으면 좌측 anchor 기준
    newCenterMm = leftAnchor! + halfNew;
  } else if (rightAttached) {
    // 우측에만 붙어있으면 우측 anchor 기준
    newCenterMm = rightAnchor! - halfNew;
  } else {
    // 어디에도 안 붙어있으면 공간 중앙 기준으로 좌/우 판단
    newCenterMm = isOnLeftSide
      ? oldBounds.left + halfNew
      : oldBounds.right - halfNew;
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

/**
 * 키큰장찬넬 전용 너비 변경 위치 보정.
 *
 * 찬넬은 채움재이므로 붙어 있는 가구 쪽 면을 우선 고정하고 반대쪽으로만 확장/축소한다.
 * 일반 자유배치 리사이즈처럼 중심 기준으로 양쪽을 동시에 움직이면 옆 가구와 겹치기 쉽다.
 */
export function calcInsertFrameResizedPositionX(
  module: PlacedModule,
  newWidthMm: number,
  allModules: PlacedModule[],
  spaceInfo: SpaceInfo,
  anchorOverride?: 'left' | 'right'
): number {
  const oldBounds = getModuleBoundsX(module);
  const { startX, endX } = getInternalSpaceBoundsX(spaceInfo);
  const halfNew = newWidthMm / 2;
  const currentCenterMm = module.position.x * 100;
  const spaceMidMm = (startX + endX) / 2;

  const lockedGaps = spaceInfo.lockedWallGaps;
  const effStart = lockedGaps?.left != null ? startX + lockedGaps.left : startX;
  const effEnd = lockedGaps?.right != null ? endX - lockedGaps.right : endX;

  // 사용자가 좌고정/우고정을 명시한 경우: 자동 anchor 탐색을 건너뛰고 해당 면을 고정한다.
  //  - 좌고정: 좌측면(oldBounds.left)을 유지하고 우측으로 확장/축소
  //  - 우고정: 우측면(oldBounds.right)을 유지하고 좌측으로 확장/축소
  if (anchorOverride === 'left' || anchorOverride === 'right') {
    const forcedCenterMm = anchorOverride === 'left'
      ? oldBounds.left + halfNew
      : oldBounds.right - halfNew;
    let forcedClampedMm = clampToSpaceBoundsX(forcedCenterMm, newWidthMm, spaceInfo);
    forcedClampedMm = Math.max(effStart + halfNew, Math.min(effEnd - halfNew, forcedClampedMm));
    return forcedClampedMm * 0.01;
  }

  const SNAP_MM = 10;
  const NEAR_MM = 80;
  let leftAnchor: { x: number; gap: number } | null = null;
  let rightAnchor: { x: number; gap: number } | null = null;

  for (const other of allModules) {
    if (other.id === module.id || other.isSurroundPanel) continue;
    const otherBounds = getModuleBoundsX(other);

    const leftGap = oldBounds.left - otherBounds.right;
    if (leftGap >= -SNAP_MM && leftGap <= NEAR_MM) {
      if (!leftAnchor || leftGap < leftAnchor.gap) {
        leftAnchor = { x: otherBounds.right, gap: Math.max(0, leftGap) };
      }
    }

    const rightGap = otherBounds.left - oldBounds.right;
    if (rightGap >= -SNAP_MM && rightGap <= NEAR_MM) {
      if (!rightAnchor || rightGap < rightAnchor.gap) {
        rightAnchor = { x: otherBounds.left, gap: Math.max(0, rightGap) };
      }
    }
  }

  const leftWallGap = oldBounds.left - effStart;
  if (!leftAnchor && leftWallGap >= -SNAP_MM && leftWallGap <= NEAR_MM) {
    leftAnchor = { x: effStart, gap: Math.max(0, leftWallGap) };
  }

  const rightWallGap = effEnd - oldBounds.right;
  if (!rightAnchor && rightWallGap >= -SNAP_MM && rightWallGap <= NEAR_MM) {
    rightAnchor = { x: effEnd, gap: Math.max(0, rightWallGap) };
  }

  let newCenterMm: number;
  const leftAttached = !!leftAnchor && leftAnchor.gap <= SNAP_MM;
  const rightAttached = !!rightAnchor && rightAnchor.gap <= SNAP_MM;
  const resizeHingePosition = resolveInsertFrameResizeHingePosition(module, allModules, spaceInfo);
  const keepLeftForOpening = resizeHingePosition === 'left';
  const keepRightForOpening = resizeHingePosition === 'right';

  if (leftAttached && rightAttached) {
    const keepLeft = keepLeftForOpening
      ? true
      : keepRightForOpening
        ? false
        : currentCenterMm < spaceMidMm;
    newCenterMm = keepLeft
      ? leftAnchor!.x + halfNew
      : rightAnchor!.x - halfNew;
  } else if (leftAttached) {
    newCenterMm = leftAnchor!.x + halfNew;
  } else if (rightAttached) {
    newCenterMm = rightAnchor!.x - halfNew;
  } else if (resizeHingePosition === 'left') {
    // 좌측 힌지 = 오른쪽 열림. 배치된 좌측면을 고정하고 열림방향으로 확장한다.
    newCenterMm = oldBounds.left + halfNew;
  } else if (resizeHingePosition === 'right') {
    // 우측 힌지 = 왼쪽 열림. 배치된 우측면을 고정하고 열림방향으로 확장한다.
    newCenterMm = oldBounds.right - halfNew;
  } else if (leftAnchor && rightAnchor) {
    const useLeftAnchor = leftAnchor.gap < rightAnchor.gap
      || (leftAnchor.gap === rightAnchor.gap && currentCenterMm < spaceMidMm);
    newCenterMm = useLeftAnchor
      ? leftAnchor.x + halfNew
      : rightAnchor.x - halfNew;
  } else if (leftAnchor) {
    newCenterMm = leftAnchor.x + halfNew;
  } else if (rightAnchor) {
    newCenterMm = rightAnchor.x - halfNew;
  } else {
    newCenterMm = currentCenterMm < spaceMidMm
      ? oldBounds.left + halfNew
      : oldBounds.right - halfNew;
  }

  let clampedMm = clampToSpaceBoundsX(newCenterMm, newWidthMm, spaceInfo);
  clampedMm = Math.max(effStart + halfNew, Math.min(effEnd - halfNew, clampedMm));
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
  excludeId?: string,
  columns: Column[] = []
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

  for (const bounds of getColumnObstacleBoundsX(columns)) {
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
