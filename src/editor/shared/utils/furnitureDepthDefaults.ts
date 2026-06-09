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

const isFrontAlignedDepthModuleId = (moduleId = ''): boolean => {
  const classification = classifyModule(moduleId)
  if (classification.isLowerCabinet) return true
  if (
    classification.isPantry ||
    classification.isFridge ||
    moduleId.includes('pull-out-cabinet') ||
    moduleId.includes('built-in-fridge')
  ) {
    return true
  }
  return classification.family === 'full'
    && !classification.isShoeCabinet
    && !classification.isChannel
}

// 앞라인 정렬 대상 가구의 실제 깊이(mm).
// customDepth > lowerSectionDepth > freeDepth > sectionDepths 최대값 > 카테고리 기본 순.
const effectiveFrontAlignedDepthMm = (
  module: { moduleId?: string; customDepth?: number; lowerSectionDepth?: number; freeDepth?: number; sectionDepths?: number[] },
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
          : Array.isArray(module.sectionDepths)
            ? Math.max(0, ...module.sectionDepths.filter((depth) => typeof depth === 'number' && depth > 0))
            : undefined
  return stored ?? catDefault ?? 0
}

// 앞라인 정렬 대상(하부장/키큰장/의류장)의 앞면 정렬 규칙:
//  - 기준 앞라인 = 저장된 기준 앞라인(depthFrontReferenceMm) 또는 현재 배치된 대상 가구 깊이 중 가장 깊은 깊이.
//    (550 뒷고정 상태에서 500으로 줄이고 앞고정하면 기준은 550, backWallGap=50이다.)
//  - 앞고정 가구(기본): 앞면을 기준 앞라인에 맞춘다 → backWallGap = 기준 − 자기깊이.
//  - 뒤고정 가구: 뒷면을 뒷벽에 붙인다 → backWallGap = 0 (앞라인 정렬 안 함).
// 배치/깊이변경/고정방향 변경 직후 호출해 모든 대상 가구의 backWallGap을 일괄 재계산한다.
// 반환: { id, backWallGap } 변경분만 (값이 달라진 가구만 포함).
export const computeLowerFrontAlignedGaps = <
  T extends { id: string; moduleId?: string; customDepth?: number; lowerSectionDepth?: number; freeDepth?: number; sectionDepths?: number[]; backWallGap?: number; depthFrontReferenceMm?: number; lowerSectionDepthDirection?: 'front' | 'back'; upperSectionDepthDirection?: 'front' | 'back' }
>(
  modules: T[],
  spaceInfo: SpaceInfo
): Array<{ id: string; backWallGap: number }> => {
  const targets = modules.filter((m) => isFrontAlignedDepthModuleId(m.moduleId || ''))
  if (targets.length === 0) return []
  // 기준 앞라인 = 저장된 앞라인 기준과 모든 대상 가구 중 최대 깊이 (방향 무관)
  let maxDepth = 0
  for (const m of targets) {
    const d = effectiveFrontAlignedDepthMm(m, spaceInfo)
    const referenceDepth = Math.max(d, m.depthFrontReferenceMm ?? d)
    if (referenceDepth > maxDepth) maxDepth = referenceDepth
  }
  const changes: Array<{ id: string; backWallGap: number }> = []
  for (const m of targets) {
    // 앞고정(=direction 'back')만 앞라인 정렬, 뒤고정(=direction 'front')은 0
    const dir = m.lowerSectionDepthDirection ?? m.upperSectionDepthDirection ?? 'front'
    const myDepth = effectiveFrontAlignedDepthMm(m, spaceInfo)
    const nextGap = dir === 'back' ? Math.max(0, Math.round(maxDepth - myDepth)) : 0
    if ((m.backWallGap ?? 0) !== nextGap) {
      changes.push({ id: m.id, backWallGap: nextGap })
    }
  }
  return changes
}
