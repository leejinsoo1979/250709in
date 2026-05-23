export const DRAWER_RAIL_BACK_GROOVE_START_MM = 17
export const DRAWER_RAIL_FRONT_OFFSET_MM = 85
export const DRAWER_RAIL_FRONT_CLEARANCE_MM = 10
export const DRAWER_BOTTOM_DEPTH_CLEARANCE_MM = 1

const RAIL_RULES = [
  { min: 555, rail: 550 },
  { min: 505, rail: 500 },
  { min: 455, rail: 450 },
  { min: 405, rail: 400 },
  { min: 355, rail: 350 },
  { min: 305, rail: 300 },
  { min: 255, rail: 250 }
] as const

export const resolveDrawerRailSizeMm = (availableDepthMm: number): number | null => {
  const rule = RAIL_RULES.find(item => availableDepthMm >= item.min)
  return rule?.rail ?? null
}

export const calculateDrawerRailAvailableDepthMm = (
  cabinetDepthMm: number,
  backPanelThicknessMm: number,
  frontOffsetMm = DRAWER_RAIL_FRONT_OFFSET_MM
): number => (
  cabinetDepthMm - DRAWER_RAIL_BACK_GROOVE_START_MM - backPanelThicknessMm - frontOffsetMm
)

export const calculateDrawerSideDepthForRailMm = (
  railSizeMm: number,
  panelThicknessMm: number
): number => (
  railSizeMm + panelThicknessMm * 2 - DRAWER_RAIL_FRONT_CLEARANCE_MM
)

export const resolveDrawerRailSizingMm = (
  cabinetDepthMm: number,
  backPanelThicknessMm: number,
  panelThicknessMm: number,
  frontOffsetMm = DRAWER_RAIL_FRONT_OFFSET_MM
) => {
  const availableDepthMm = calculateDrawerRailAvailableDepthMm(
    cabinetDepthMm,
    backPanelThicknessMm,
    frontOffsetMm
  )
  const railSizeMm = resolveDrawerRailSizeMm(availableDepthMm)

  if (railSizeMm == null) {
    return {
      availableDepthMm,
      railSizeMm: null,
      drawerSideDepthMm: Math.max(0, availableDepthMm - DRAWER_RAIL_FRONT_CLEARANCE_MM),
      drawerBottomDepthMm: Math.max(0, availableDepthMm - DRAWER_RAIL_FRONT_CLEARANCE_MM - DRAWER_BOTTOM_DEPTH_CLEARANCE_MM)
    }
  }

  const drawerSideDepthMm = calculateDrawerSideDepthForRailMm(railSizeMm, panelThicknessMm)

  return {
    availableDepthMm,
    railSizeMm,
    drawerSideDepthMm,
    drawerBottomDepthMm: Math.max(0, drawerSideDepthMm - DRAWER_BOTTOM_DEPTH_CLEARANCE_MM)
  }
}
