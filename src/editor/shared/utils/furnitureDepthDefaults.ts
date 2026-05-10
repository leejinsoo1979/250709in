import type { SpaceInfo } from '@/store/core/spaceConfigStore'
import type { ModuleData } from '@/data/modules'
import { classifyModule } from './moduleClassification'

export const isShoeCabinetModuleId = (moduleId = ''): boolean => {
  return classifyModule(moduleId).isShoeCabinet
}

export const getCategoryDefaultFurnitureDepth = (
  spaceDepth: number,
  moduleId = ''
): number | undefined => {
  const classification = classifyModule(moduleId)

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
  const categoryDepth = getCategoryDefaultFurnitureDepth(spaceInfo.depth, moduleId)

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
): number => getCategoryDefaultFurnitureDepth(spaceInfo.depth, moduleId) ?? requestedDepth
