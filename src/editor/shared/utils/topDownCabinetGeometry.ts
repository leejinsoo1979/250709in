export const TOP_DOWN_DEFAULT_HEIGHT_MM = 785;
export const TOP_DOWN_DEFAULT_DOOR_TOP_GAP_MM = -80;
export const TOP_DOWN_DEFAULT_DOOR_BOTTOM_GAP_MM = 5;
export const TOP_DOWN_MAIDA_GAP_MM = 20;
export const TOP_DOWN_NOTCH_HEIGHT_MM = 65;
export const TOP_DOWN_NOTCH_TO_MAIDA_TOP_MM = 40;

export interface TopDown2TierGeometry {
  maidaHeightMm: number;
  lowerMaidaBottomMm: number;
  lowerMaidaTopMm: number;
  upperMaidaBottomMm: number;
  upperMaidaTopMm: number;
  lowerNotchFromBottomMm: number;
  upperNotchFromBottomMm: number;
  notches: Array<{ fromBottom: number; height: number }>;
}

export const resolveTopDown2TierGeometry = (heightMm: number): TopDown2TierGeometry => {
  const safeHeight = Number.isFinite(heightMm) && heightMm > 0
    ? heightMm
    : TOP_DOWN_DEFAULT_HEIGHT_MM;
  const lowerMaidaBottomMm = -TOP_DOWN_DEFAULT_DOOR_BOTTOM_GAP_MM;
  const upperMaidaTopMm = safeHeight + TOP_DOWN_DEFAULT_DOOR_TOP_GAP_MM;
  const maidaHeightMm = Math.max(
    0,
    (upperMaidaTopMm - lowerMaidaBottomMm - TOP_DOWN_MAIDA_GAP_MM) / 2
  );
  const lowerMaidaTopMm = lowerMaidaBottomMm + maidaHeightMm;
  const upperMaidaBottomMm = lowerMaidaTopMm + TOP_DOWN_MAIDA_GAP_MM;
  const lowerNotchFromBottomMm = Math.max(
    0,
    lowerMaidaTopMm - TOP_DOWN_NOTCH_TO_MAIDA_TOP_MM
  );
  const upperNotchFromBottomMm = Math.max(
    lowerNotchFromBottomMm + TOP_DOWN_NOTCH_HEIGHT_MM,
    upperMaidaTopMm - TOP_DOWN_NOTCH_TO_MAIDA_TOP_MM
  );

  return {
    maidaHeightMm,
    lowerMaidaBottomMm,
    lowerMaidaTopMm,
    upperMaidaBottomMm,
    upperMaidaTopMm,
    lowerNotchFromBottomMm,
    upperNotchFromBottomMm,
    notches: [
      { fromBottom: lowerNotchFromBottomMm, height: TOP_DOWN_NOTCH_HEIGHT_MM },
      { fromBottom: upperNotchFromBottomMm, height: TOP_DOWN_NOTCH_HEIGHT_MM }
    ]
  };
};

export const getTopDownStoneFrontVisibleHeightMm = (
  moduleHeightMm: number,
  doorTopGap?: number
) => {
  const safeHeight = Number.isFinite(moduleHeightMm) && moduleHeightMm > 0
    ? moduleHeightMm
    : TOP_DOWN_DEFAULT_HEIGHT_MM;
  const effectiveDoorTopGap = doorTopGap ?? TOP_DOWN_DEFAULT_DOOR_TOP_GAP_MM;
  const upperMaidaTopMm = safeHeight + effectiveDoorTopGap;
  return Math.max(0, safeHeight - upperMaidaTopMm - TOP_DOWN_MAIDA_GAP_MM);
};
