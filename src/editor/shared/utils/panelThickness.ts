export const PET_PANEL_THICKNESS_MM = 18
export const TOP_END_PANEL_FRONT_OFFSET_DEFAULT_MM = 20

export const isBasicLowerTopEndPanelDoorGapModuleId = (moduleId?: string): boolean => {
  if (!moduleId) return false
  return moduleId.includes('lower-cabinet-basic')
    || moduleId.includes('dual-lower-cabinet-basic')
    || moduleId.includes('lower-cabinet-2tier')
    || moduleId.includes('dual-lower-cabinet-2tier')
    || moduleId.includes('lower-half-cabinet')
    || moduleId.includes('dual-lower-half-cabinet')
    || moduleId.includes('lower-drawer-')
    || moduleId.includes('dual-lower-drawer-')
    || moduleId.includes('lower-sink-cabinet')
    || moduleId.includes('dual-lower-sink-cabinet')
    || moduleId.includes('lower-induction-cabinet')
    || moduleId.includes('dual-lower-induction-cabinet')
}

export const isDoorLiftTopEndPanelModuleId = (moduleId?: string): boolean => {
  return !!moduleId?.includes('lower-door-lift-')
}

export const resolveTopEndPanelFrontOffsetMm = (
  moduleId?: string,
  doorTopGap?: number | null,
  topEndPanelOffset?: number | null
): number => {
  if (isDoorLiftTopEndPanelModuleId(moduleId)) {
    return typeof topEndPanelOffset === 'number' && Number.isFinite(topEndPanelOffset)
      ? topEndPanelOffset
      : 0
  }
  if (isBasicLowerTopEndPanelDoorGapModuleId(moduleId) && typeof doorTopGap === 'number') {
    return doorTopGap > 0 ? 0 : TOP_END_PANEL_FRONT_OFFSET_DEFAULT_MM
  }
  return typeof topEndPanelOffset === 'number' && Number.isFinite(topEndPanelOffset)
    ? topEndPanelOffset
    : TOP_END_PANEL_FRONT_OFFSET_DEFAULT_MM
}

export const resolvePetPanelThicknessMm = (thicknessMm?: number | null): number => {
  if (typeof thicknessMm !== 'number' || !Number.isFinite(thicknessMm) || thicknessMm <= 0) {
    return PET_PANEL_THICKNESS_MM
  }
  if (Math.abs(thicknessMm - 18.5) < 0.01 || Math.abs(thicknessMm - 15.5) < 0.01) {
    return PET_PANEL_THICKNESS_MM
  }
  return thicknessMm
}

export const resolveNominalBackPanelOffsetThicknessMm = (thicknessMm: number): number => {
  if (Math.abs(thicknessMm - 18.5) < 0.01) return 18
  if (Math.abs(thicknessMm - 15.5) < 0.01) return 15
  return thicknessMm
}
