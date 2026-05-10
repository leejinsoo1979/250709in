import { classifyModule } from './moduleClassification'

export interface ShelfInsetInput {
  moduleId?: string
  cabinetCategory?: string
  explicitInsetMm?: number
  depthMm?: number
}

export interface CustomShelfInsetInput {
  shelfMethod?: 'fixed' | 'dowel'
  explicitInsetMm?: number
  depthMm?: number
}

// 깊이 임계값: 이 미만이면 얕은 가구 들이기, 이상이면 깊은 가구 들이기
export const SHELF_INSET_DEPTH_THRESHOLD_MM = 400
export const SHALLOW_SHELF_FRONT_INSET_MM = 20
export const DEEP_SHELF_FRONT_INSET_MM = 72
// 호환용: 일부 호출부에서 참조하는 기본값
export const DEFAULT_SHELF_FRONT_INSET_MM = DEEP_SHELF_FRONT_INSET_MM

export const isLowerHalfShelfInsetModule = (moduleId = ''): boolean => (
  moduleId.includes('lower-half-cabinet') ||
  moduleId.includes('dual-lower-half-cabinet') ||
  moduleId.includes('lower-sink-cabinet') ||
  moduleId.includes('dual-lower-sink-cabinet') ||
  moduleId.includes('lower-induction-cabinet') ||
  moduleId.includes('dual-lower-induction-cabinet') ||
  moduleId.includes('lower-door-lift-half') ||
  moduleId.includes('dual-lower-door-lift-half') ||
  moduleId.includes('lower-top-down-half') ||
  moduleId.includes('dual-lower-top-down-half')
)

export const isTallShelfInsetModule = (moduleId = ''): boolean => (
  moduleId.includes('pull-out-cabinet') ||
  moduleId.includes('pantry-cabinet') ||
  (moduleId.includes('fridge-cabinet') && !moduleId.includes('built-in-fridge'))
)

// 깊이 기반 들이기값: 깊이 < 400 → 20mm, 깊이 ≥ 400 → 72mm
const insetByDepth = (depthMm?: number): number => {
  if (typeof depthMm !== 'number' || !Number.isFinite(depthMm)) {
    return DEEP_SHELF_FRONT_INSET_MM
  }
  return depthMm < SHELF_INSET_DEPTH_THRESHOLD_MM
    ? SHALLOW_SHELF_FRONT_INSET_MM
    : DEEP_SHELF_FRONT_INSET_MM
}

export const resolveShelfFrontInsetMm = ({
  moduleId = '',
  cabinetCategory,
  explicitInsetMm,
  depthMm
}: ShelfInsetInput): number => {
  if (typeof explicitInsetMm === 'number' && Number.isFinite(explicitInsetMm)) {
    return explicitInsetMm
  }

  const classification = classifyModule(moduleId)

  if (
    classification.isUpperCabinet ||
    classification.isShoeCabinet ||
    isTallShelfInsetModule(moduleId) ||
    isLowerHalfShelfInsetModule(moduleId) ||
    cabinetCategory === 'upper'
  ) {
    return insetByDepth(depthMm)
  }

  return 0
}

export const resolveCustomShelfFrontInsetMm = ({
  shelfMethod = 'dowel',
  explicitInsetMm,
  depthMm
}: CustomShelfInsetInput): number => {
  if (shelfMethod === 'fixed') return 0

  return resolveShelfFrontInsetMm({
    cabinetCategory: 'upper',
    explicitInsetMm,
    depthMm
  })
}
