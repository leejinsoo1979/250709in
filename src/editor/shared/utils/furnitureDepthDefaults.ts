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

const isLowerModuleId = (moduleId = ''): boolean =>
  moduleId.startsWith('lower-') || moduleId.includes('dual-lower-')

// 하부 가구의 실제 깊이(mm). customDepth > lowerSectionDepth > freeDepth > 카테고리 기본 순.
const effectiveLowerDepthMm = (
  module: { moduleId?: string; customDepth?: number; lowerSectionDepth?: number; freeDepth?: number },
  spaceInfo: SpaceInfo
): number => {
  const catDefault = getCategoryDefaultFurnitureDepth(
    spaceInfo.depth || 600,
    module.moduleId || '',
    spaceInfo.furnitureDepthDefaults
  )
  const stored =
    typeof module.customDepth === 'number' && module.customDepth > 0
      ? module.customDepth
      : typeof module.lowerSectionDepth === 'number' && module.lowerSectionDepth > 0
        ? module.lowerSectionDepth
        : typeof module.freeDepth === 'number' && module.freeDepth > 0
          ? module.freeDepth
          : undefined
  return stored ?? catDefault ?? 0
}

// 하부 가구의 앞면 정렬 규칙:
//  - 기준 앞라인 = 현재 배치된 모든 하부 가구(앞/뒤고정 무관) 중 가장 깊은 깊이.
//    (뒤고정 가구도 자기 깊이만큼 앞으로 나와 있으므로 기준 산정에는 포함된다.)
//  - 앞고정 가구(기본): 앞면을 기준 앞라인에 맞춘다 → backWallGap = 기준 − 자기깊이.
//  - 뒤고정 가구: 뒷면을 뒷벽에 붙인다 → backWallGap = 0 (앞라인 정렬 안 함).
// 배치/깊이변경/고정방향 변경 직후 호출해 모든 하부 가구의 backWallGap을 일괄 재계산한다.
// 반환: { id, backWallGap } 변경분만 (값이 달라진 가구만 포함).
export const computeLowerFrontAlignedGaps = <
  T extends { id: string; moduleId?: string; customDepth?: number; lowerSectionDepth?: number; freeDepth?: number; backWallGap?: number; lowerSectionDepthDirection?: 'front' | 'back'; upperSectionDepthDirection?: 'front' | 'back' }
>(
  modules: T[],
  spaceInfo: SpaceInfo
): Array<{ id: string; backWallGap: number }> => {
  const lowers = modules.filter((m) => isLowerModuleId(m.moduleId || ''))
  if (lowers.length === 0) return []
  // 기준 앞라인 = 모든 하부 가구 중 최대 깊이 (방향 무관)
  let maxDepth = 0
  for (const m of lowers) {
    const d = effectiveLowerDepthMm(m, spaceInfo)
    if (d > maxDepth) maxDepth = d
  }
  const changes: Array<{ id: string; backWallGap: number }> = []
  for (const m of lowers) {
    // 앞고정(=direction 'back')만 앞라인 정렬, 뒤고정(=direction 'front')은 0
    const dir = m.lowerSectionDepthDirection ?? m.upperSectionDepthDirection ?? 'front'
    const myDepth = effectiveLowerDepthMm(m, spaceInfo)
    const nextGap = dir === 'back' ? Math.max(0, Math.round(maxDepth - myDepth)) : 0
    if ((m.backWallGap ?? 0) !== nextGap) {
      changes.push({ id: m.id, backWallGap: nextGap })
    }
  }
  return changes
}
