import type { FurnitureDepthDefaultKey, FurnitureDepthDefaults, SpaceInfo } from '@/store/core/spaceConfigStore'
import type { ModuleData } from '@/data/modules'
import { classifyModule } from './moduleClassification'

export const isShoeCabinetModuleId = (moduleId = ''): boolean => {
  return classifyModule(moduleId).isShoeCabinet
}

const isCornerCabinetModuleId = (moduleId = ''): boolean => {
  return moduleId.includes('left-corner') || moduleId.includes('right-corner')
}

export const resolveFurnitureDepthDefaultKey = (
  moduleId = ''
): FurnitureDepthDefaultKey | undefined => {
  if (!moduleId || isCornerCabinetModuleId(moduleId)) {
    return undefined
  }

  const classification = classifyModule(moduleId)

  if (classification.isUpperCabinet) {
    return 'upper'
  }

  if (classification.isShoeCabinet) {
    return 'shoe'
  }

  if (classification.isTopDown) {
    return 'lowerTopDown'
  }

  if (classification.isDoorLift) {
    return 'lowerDoorLift'
  }

  if (
    classification.isLowerCabinet &&
    !classification.isDoorLift &&
    !classification.isTopDown
  ) {
    return 'lowerBasic'
  }

  if (
    classification.isPantry ||
    classification.isFridge ||
    moduleId.includes('pull-out-cabinet') ||
    moduleId.includes('built-in-fridge')
  ) {
    return 'tall'
  }

  if (
    moduleId.includes('hanging') ||
    moduleId.includes('pantshanger') ||
    moduleId.includes('styler') ||
    classification.family === 'full'
  ) {
    return 'wardrobe'
  }

  return undefined
}

export const getCategoryDefaultFurnitureDepth = (
  spaceDepth: number,
  moduleId = '',
  defaults?: FurnitureDepthDefaults
): number | undefined => {
  const classification = classifyModule(moduleId)
  const defaultKey = resolveFurnitureDepthDefaultKey(moduleId)
  const configuredDepth = defaultKey ? defaults?.[defaultKey] : undefined

  if (typeof configuredDepth === 'number' && configuredDepth > 0) {
    return Math.min(configuredDepth, spaceDepth)
  }

  if (classification.isUpperCabinet) {
    return Math.min(300, spaceDepth)
  }

  if (classification.isShoeCabinet) {
    return Math.min(380, spaceDepth)
  }

  return undefined
}

export const getDefaultFurnitureDepth = (
  spaceInfo: SpaceInfo,
  moduleData?: ModuleData | null
): number => {
  const moduleId = moduleData?.id || ''
  const categoryDepth = getCategoryDefaultFurnitureDepth(
    spaceInfo.depth,
    moduleId,
    spaceInfo.furnitureDepthDefaults
  )

  if (categoryDepth !== undefined) {
    return categoryDepth
  }

  if (moduleData?.defaultDepth) {
    return Math.min(moduleData.defaultDepth, spaceInfo.depth)
  }

  const spaceBasedDepth = Math.floor(spaceInfo.depth * 0.9)
  return Math.min(spaceBasedDepth, 580)
}

export const resolveInitialFurnitureDepth = (
  spaceInfo: SpaceInfo,
  moduleId: string,
  requestedDepth: number
): number => getCategoryDefaultFurnitureDepth(
  spaceInfo.depth,
  moduleId,
  spaceInfo.furnitureDepthDefaults
) ?? requestedDepth
