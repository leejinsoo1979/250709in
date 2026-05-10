export const BACK_WALL_GAP_MIN_MM = -500
export const BACK_WALL_GAP_MAX_MM = 500

export const clampBackWallGapMm = (valueMm: number): number => {
  if (!Number.isFinite(valueMm)) return 0

  return Math.max(BACK_WALL_GAP_MIN_MM, Math.min(BACK_WALL_GAP_MAX_MM, valueMm))
}

export const parseBackWallGapInput = (rawValue: string): number | null => {
  if (rawValue === '') return 0
  if (rawValue === '-') return null
  if (!/^-?\d+$/.test(rawValue)) return null

  return clampBackWallGapMm(parseInt(rawValue, 10))
}

export const stepBackWallGapMm = (
  currentValueMm: number | undefined,
  deltaMm: number
): number => clampBackWallGapMm((currentValueMm ?? 0) + deltaMm)
