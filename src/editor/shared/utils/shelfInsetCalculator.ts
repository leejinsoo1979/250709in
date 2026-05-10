import { classifyModule } from './moduleClassification'

export interface ShelfInsetInput {
  moduleId?: string
  cabinetCategory?: string
  explicitInsetMm?: number
}

export interface CustomShelfInsetInput {
  shelfMethod?: 'fixed' | 'dowel'
  explicitInsetMm?: number
}

export const DEFAULT_SHELF_FRONT_INSET_MM = 30

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

export const resolveShelfFrontInsetMm = ({
  moduleId = '',
  cabinetCategory,
  explicitInsetMm
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
    return DEFAULT_SHELF_FRONT_INSET_MM
  }

  return 0
}

export const resolveCustomShelfFrontInsetMm = ({
  shelfMethod = 'dowel',
  explicitInsetMm
}: CustomShelfInsetInput): number => {
  if (shelfMethod === 'fixed') return 0

  return resolveShelfFrontInsetMm({
    cabinetCategory: 'upper',
    explicitInsetMm
  })
}
