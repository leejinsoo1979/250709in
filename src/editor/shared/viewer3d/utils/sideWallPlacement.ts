const DEFAULT_SIDE_FURNITURE_DEPTH_MM = 600;

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
