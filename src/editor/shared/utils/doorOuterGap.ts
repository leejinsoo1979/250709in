import type { PlacedModule } from '@/editor/shared/furniture/types';
import type { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateSpaceIndexing, ColumnIndexer } from '@/editor/shared/utils/indexing';

export interface DoorOuterOpenSides {
  left: boolean;
  right: boolean;
}

const isBuiltin = (installType?: string) =>
  installType === 'builtin' || installType === 'built-in';

const isSemiStanding = (installType?: string) =>
  installType === 'semistanding' || installType === 'semi-standing';

export const resolveDoorOuterOpenSides = ({
  spaceInfo,
  placedModule,
  moduleWidthMm,
  slotCenterX,
}: {
  spaceInfo: SpaceInfo;
  placedModule?: PlacedModule | null;
  moduleWidthMm?: number;
  slotCenterX?: number;
}): DoorOuterOpenSides => {
  if (!placedModule) {
    return { left: false, right: false };
  }

  const installType = spaceInfo.installType;
  const hasLeftWall = isBuiltin(installType) || (isSemiStanding(installType) && !!spaceInfo.wallConfig?.left);
  const hasRightWall = isBuiltin(installType) || (isSemiStanding(installType) && !!spaceInfo.wallConfig?.right);

  if (hasLeftWall && hasRightWall) {
    return { left: false, right: false };
  }

  const indexing = calculateSpaceIndexing(spaceInfo);
  const isDual = !!placedModule.isDualSlot || placedModule.moduleId?.startsWith('dual-');

  // 자유배치 모드: slotIndex가 없으므로 좌표 비교로만 판정 (아래 fallback 분기 사용)
  if (!placedModule.isFreePlacement && typeof placedModule.slotIndex === 'number') {
    let localSlotIndex = placedModule.slotIndex;
    let zoneColumnCount = indexing.columnCount;

    if (spaceInfo.droppedCeiling?.enabled && placedModule.zone) {
      const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
      const targetZone = placedModule.zone === 'dropped' ? zoneInfo.dropped : zoneInfo.normal;
      zoneColumnCount = targetZone?.columnCount ?? zoneColumnCount;

      if (zoneColumnCount > 0 && localSlotIndex >= zoneColumnCount) {
        const droppedCount = zoneInfo.dropped?.columnCount ?? 0;
        const normalCount = zoneInfo.normal?.columnCount ?? 0;
        if (placedModule.zone === 'normal' && spaceInfo.droppedCeiling.position === 'left') {
          localSlotIndex -= droppedCount;
        } else if (placedModule.zone === 'dropped' && spaceInfo.droppedCeiling.position === 'right') {
          localSlotIndex -= normalCount;
        }
      }
    }

    const slotEndIndex = localSlotIndex + (isDual ? 1 : 0);
    return {
      left: !hasLeftWall && localSlotIndex === 0,
      right: !hasRightWall && slotEndIndex === zoneColumnCount - 1,
    };
  }

  // freestanding(벽없음): 공간 전체 폭 기준, 그 외: 내경 폭 기준
  const isFreestanding = !hasLeftWall && !hasRightWall;
  let runStartMm = isFreestanding
    ? -(spaceInfo.width ?? indexing.internalWidth) / 2
    : -indexing.internalWidth / 2;
  let runEndMm = isFreestanding
    ? (spaceInfo.width ?? indexing.internalWidth) / 2
    : indexing.internalWidth / 2;

  if (spaceInfo.droppedCeiling?.enabled && placedModule.zone) {
    const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
    const targetZone = placedModule.zone === 'dropped' ? zoneInfo.dropped : zoneInfo.normal;
    if (targetZone) {
      runStartMm = targetZone.startX;
      runEndMm = targetZone.startX + targetZone.width;
    }
  }

  const widthMm = moduleWidthMm
    ?? placedModule.slotCustomWidth
    ?? placedModule.customWidth
    ?? placedModule.moduleWidth
    ?? placedModule.freeWidth
    ?? 0;

  if (!Number.isFinite(widthMm) || widthMm <= 0) {
    return { left: false, right: false };
  }

  const centerXUnits = placedModule.isFreePlacement
    ? (placedModule.position?.x ?? slotCenterX ?? 0)
    : (slotCenterX ?? placedModule.position?.x ?? 0);
  const centerXmm = centerXUnits / 0.01;
  const leftEdgeMm = centerXmm - widthMm / 2;
  const rightEdgeMm = centerXmm + widthMm / 2;
  // 자유배치는 사용자가 직접 배치하므로 끝선 일치 tolerance를 슬롯배치보다 넉넉히
  // (노서라운드 좌이격 + 엔드패널 두께 등을 고려하여 50mm)
  const toleranceMm = placedModule.isFreePlacement ? 50 : 2;

  return {
    left: !hasLeftWall && Math.abs(leftEdgeMm - runStartMm) <= toleranceMm,
    right: !hasRightWall && Math.abs(rightEdgeMm - runEndMm) <= toleranceMm,
  };
};
