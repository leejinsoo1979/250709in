export const PET_PANEL_THICKNESS_MM = 18

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
