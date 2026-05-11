export const STANDARD_COUNTERTOP_THICKNESS_MM = 20;

export const isLowerCabinetModuleId = (moduleId?: string): boolean => {
  if (!moduleId) return false;
  return moduleId.startsWith('lower-') || moduleId.includes('dual-lower-') || moduleId.includes('-lower-');
};

export const resolveCountertopThicknessMm = (module: any, spaceInfo: any): number => {
  const userThickness = module?.stoneTopThickness || 0;
  if (userThickness <= 0) return 0;

  if (module?.stoneTopMaterial === 'pet') {
    const panelThickness = spaceInfo?.panelThickness || 18;
    if (panelThickness === 15) return 18;
    if (panelThickness === 15.5) return 18.5;
    return panelThickness;
  }

  return userThickness;
};

export const getCountertopBodyHeightDeltaMm = (module: any, spaceInfo: any): number => {
  if (!isLowerCabinetModuleId(module?.moduleId)) return 0;
  const countertopThickness = resolveCountertopThicknessMm(module, spaceInfo);
  if (countertopThickness <= 0) return 0;
  return STANDARD_COUNTERTOP_THICKNESS_MM - countertopThickness;
};

export const applyCountertopBodyHeightCompensation = (
  baseHeightMm: number,
  module: any,
  spaceInfo: any
): number => {
  return Math.max(0, baseHeightMm + getCountertopBodyHeightDeltaMm(module, spaceInfo));
};
