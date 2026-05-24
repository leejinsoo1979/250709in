export const resolveNominalBackPanelOffsetThicknessMm = (thicknessMm: number): number => {
  if (Math.abs(thicknessMm - 18.5) < 0.01) return 18
  if (Math.abs(thicknessMm - 15.5) < 0.01) return 15
  return thicknessMm
}
