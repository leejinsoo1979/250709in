const DEFAULT_SIDE_FURNITURE_DEPTH_MM = 600;
export const SIDE_WALL_CORNER_DOOR_RECESS_MM = 20;
export const SIDE_WALL_CORNER_DOOR_FRONT_GAP_MM = 3;

export const ROOM_BACK_MESH_GAP_MM = 10;
export const ROOM_MESH_BACK_SHIFT_MM = 30;

// Side-wall placement indicators are drawn on the usable wall plane, not on the
// full visual room mesh extension. Keep this derived from the room mesh offsets
// so the placement range does not drift when those offsets change.
export const SIDE_WALL_PLACEMENT_EDGE_INSET_MM =
  ROOM_MESH_BACK_SHIFT_MM - ROOM_BACK_MESH_GAP_MM;

export const getDefaultSideFurnitureDepthMm = (panelDepthMm: number) =>
  Math.min(Math.max(1, panelDepthMm), DEFAULT_SIDE_FURNITURE_DEPTH_MM);

export const calculateSideWallPlacementRangeMm = (
  panelDepthMm: number,
  furnitureDepthMm: number = getDefaultSideFurnitureDepthMm(panelDepthMm)
) => {
  const depthMm = Math.max(1, panelDepthMm);
  const clampedFurnitureDepthMm = Math.min(
    depthMm,
    Math.max(1, furnitureDepthMm)
  );
  const endZMm =
    depthMm - clampedFurnitureDepthMm - SIDE_WALL_PLACEMENT_EDGE_INSET_MM;

  return {
    startZMm: endZMm - depthMm,
    endZMm,
    depthMm,
    furnitureDepthMm: clampedFurnitureDepthMm
  };
};

export const resolveSideWallCornerBodyDepthMm = (
  frontCornerModule: any,
  frontCornerData: any,
  totalSideDepthMm: number
) => {
  const frontCornerDepthMm = frontCornerModule?.customDepth
    ?? frontCornerModule?.freeDepth
    ?? frontCornerModule?.upperSectionDepth
    ?? frontCornerModule?.lowerSectionDepth
    ?? frontCornerData?.defaultDepth
    ?? frontCornerData?.dimensions?.depth
    ?? Math.min(DEFAULT_SIDE_FURNITURE_DEPTH_MM, totalSideDepthMm);

  return Math.min(
    Math.max(1, totalSideDepthMm),
    Math.max(1, frontCornerDepthMm)
  );
};

const getWidthFromModuleId = (moduleId?: string) => {
  const widthMatch = moduleId?.match(/-([\d.]+)$/);
  return widthMatch ? parseFloat(widthMatch[1]) : undefined;
};

export const resolveSideWallCabinetDepthMm = (
  frontCornerModule: any,
  frontCornerData: any,
  maxCabinetDepthMm: number,
  fallbackDepthMm: number
) => {
  if (!frontCornerModule) {
    return Math.min(maxCabinetDepthMm, Math.max(1, fallbackDepthMm));
  }

  const frontCornerWidthMm = frontCornerModule?.freeWidth
    ?? frontCornerModule?.moduleWidth
    ?? getWidthFromModuleId(frontCornerModule?.moduleId)
    ?? frontCornerData?.dimensions?.width
    ?? frontCornerModule?.customWidth
    ?? frontCornerModule?.adjustedWidth
    ?? frontCornerModule?.slotCustomWidth;
  const sideCabinetDepthMm = Number.isFinite(frontCornerWidthMm)
    ? frontCornerWidthMm - SIDE_WALL_CORNER_DOOR_RECESS_MM - SIDE_WALL_CORNER_DOOR_FRONT_GAP_MM
    : fallbackDepthMm;

  return Math.min(
    maxCabinetDepthMm,
    Math.max(1, sideCabinetDepthMm)
  );
};

export const distributeSideWallDepthMm = (depthMm: number) => {
  if (depthMm <= 0.5) {
    return [];
  }

  const slotCount = Math.max(1, Math.ceil(depthMm / DEFAULT_SIDE_FURNITURE_DEPTH_MM));
  const slotDepthMm = depthMm / slotCount;
  return Array.from({ length: slotCount }, () => slotDepthMm);
};

export const buildSideWallSlotSizesMm = (
  wall: 'left' | 'right',
  totalSideDepthMm: number,
  frontCornerModule?: any,
  frontCornerData?: any
) => {
  if (!frontCornerModule) {
    return distributeSideWallDepthMm(totalSideDepthMm);
  }

  const cornerDepthMm = resolveSideWallCornerBodyDepthMm(
    frontCornerModule,
    frontCornerData,
    totalSideDepthMm
  );
  const remainingSideDepthMm = Math.max(0, totalSideDepthMm - cornerDepthMm);
  if (remainingSideDepthMm <= 0.5) {
    return [totalSideDepthMm];
  }

  const remainingSlots = distributeSideWallDepthMm(remainingSideDepthMm);
  return wall === 'left'
    ? [...remainingSlots, cornerDepthMm]
    : [cornerDepthMm, ...remainingSlots];
};

export const getSideWallCornerSlotIndex = (
  wall: 'left' | 'right',
  sideSlotSizes: number[],
  hasFrontCornerModule: boolean
) => {
  if (!hasFrontCornerModule || sideSlotSizes.length === 0) {
    return -1;
  }

  return wall === 'left' ? sideSlotSizes.length - 1 : 0;
};

const getSideWallActualDepthFromBackMm = (
  wall: 'left' | 'right',
  totalSideDepthMm: number,
  depthFromVisualStartMm: number
) => wall === 'left'
  ? totalSideDepthMm - depthFromVisualStartMm
  : depthFromVisualStartMm;

export const getSideWallSlotCenterZMm = (
  wall: 'left' | 'right',
  sideWallRange: { startZMm: number; depthMm: number },
  totalSideDepthMm: number,
  slotStartDepthMm: number,
  slotDepthMm: number
) => {
  const actualDepthFromBackMm = getSideWallActualDepthFromBackMm(
    wall,
    totalSideDepthMm,
    slotStartDepthMm + slotDepthMm / 2
  );
  const depthRatio = actualDepthFromBackMm / totalSideDepthMm;
  return sideWallRange.startZMm + sideWallRange.depthMm * depthRatio;
};

export const getSideWallDepthFromZMm = (
  wall: 'left' | 'right',
  sideWallRange: { startZMm: number; depthMm: number },
  totalSideDepthMm: number,
  zMm: number
) => {
  const depthFromBackMm = Math.max(
    0,
    Math.min(
      totalSideDepthMm,
      ((zMm - sideWallRange.startZMm) / sideWallRange.depthMm) * totalSideDepthMm
    )
  );
  return wall === 'left'
    ? totalSideDepthMm - depthFromBackMm
    : depthFromBackMm;
};

export const getSideWallLocalGuideX = (
  wall: 'left' | 'right',
  rangeWidth: number,
  depthMm: number,
  totalSideDepthMm: number
) => {
  const actualDepthFromBackMm = getSideWallActualDepthFromBackMm(
    wall,
    totalSideDepthMm,
    depthMm
  );
  const x = -rangeWidth / 2 + rangeWidth * (actualDepthFromBackMm / totalSideDepthMm);
  return wall === 'left' ? -x : x;
};
