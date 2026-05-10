import type { PlacedModule } from '@/editor/shared/furniture/types'
import type { SpaceInfo } from '@/store/core/spaceConfigStore'

export interface SideViewZoneInfo {
  normal?: {
    columnCount?: number
    width?: number
  }
  dropped?: {
    width?: number
  }
}

export interface SideViewModuleFilterInput {
  placedModules: PlacedModule[]
  viewDirection?: 'front' | 'left' | 'right' | 'top' | 'all' | '3D'
  selectedSlotIndex?: number | null
  isFreePlacement?: boolean
  spaceInfo?: Pick<SpaceInfo, 'customColumnCount' | 'droppedCeiling'>
  zones?: SideViewZoneInfo | null
  excludeSurroundPanels?: boolean
}

export interface SideViewSlotGroup {
  slotKey: number
  titleIndex: number
  selectedSlotIndex: number
  modules: PlacedModule[]
}

const getModuleX = (module: PlacedModule): number => module.position?.x ?? 0

const getFreePlacementSlotModules = (
  modules: PlacedModule[],
  selectedSlotIndex: number
): PlacedModule[] => {
  const sortedByX = [...modules].sort((a, b) => getModuleX(a) - getModuleX(b))
  const xGroups: number[][] = []
  let lastX: number | null = null

  sortedByX.forEach((module, index) => {
    const moduleX = getModuleX(module)
    if (lastX === null || Math.abs(moduleX - lastX) > 0.01) {
      xGroups.push([index])
      lastX = moduleX
      return
    }

    xGroups[xGroups.length - 1].push(index)
  })

  const slotGroup = xGroups[selectedSlotIndex]
  if (!slotGroup) return []

  const moduleIds = new Set(slotGroup.map(index => sortedByX[index].id))
  return modules.filter(module => moduleIds.has(module.id))
}

const getSlotPlacedModules = (
  modules: PlacedModule[],
  selectedSlotIndex: number,
  spaceInfo?: Pick<SpaceInfo, 'customColumnCount' | 'droppedCeiling'>,
  zones?: SideViewZoneInfo | null
): PlacedModule[] => {
  const hasDroppedCeiling = spaceInfo?.droppedCeiling?.enabled || false
  const normalSlotCount = zones?.normal?.columnCount || (spaceInfo?.customColumnCount || 4)

  return modules.filter(module => {
    if (module.slotIndex === undefined) return false

    let moduleGlobalSlotIndex = module.slotIndex
    let isInDroppedZone = module.zone === 'dropped'

    if (hasDroppedCeiling && !isInDroppedZone && zones?.dropped && zones?.normal) {
      const droppedPosition = spaceInfo?.droppedCeiling?.position || 'right'
      const moduleXMm = getModuleX(module) * 100
      isInDroppedZone = droppedPosition === 'left'
        ? moduleXMm < (zones.dropped.width ?? 0)
        : moduleXMm >= (zones.normal.width ?? 0)
    }

    if (hasDroppedCeiling && isInDroppedZone) {
      moduleGlobalSlotIndex = normalSlotCount + module.slotIndex
    }

    return module.isDualSlot
      ? moduleGlobalSlotIndex === selectedSlotIndex || moduleGlobalSlotIndex + 1 === selectedSlotIndex
      : moduleGlobalSlotIndex === selectedSlotIndex
  })
}

const filterToEdgeModules = (
  modules: PlacedModule[],
  viewDirection?: SideViewModuleFilterInput['viewDirection']
): PlacedModule[] => {
  if (modules.length === 0 || (viewDirection !== 'left' && viewDirection !== 'right')) {
    return modules
  }

  const targetX = viewDirection === 'left'
    ? Math.min(...modules.map(getModuleX))
    : Math.max(...modules.map(getModuleX))

  return modules.filter(module => Math.abs(getModuleX(module) - targetX) < 0.01)
}

export const filterSideViewModules = ({
  placedModules,
  viewDirection,
  selectedSlotIndex,
  isFreePlacement = false,
  spaceInfo,
  zones,
  excludeSurroundPanels = false
}: SideViewModuleFilterInput): PlacedModule[] => {
  if (viewDirection !== 'left' && viewDirection !== 'right') {
    return placedModules
  }

  let filtered = excludeSurroundPanels
    ? placedModules.filter(module => !module.isSurroundPanel)
    : [...placedModules]

  if (selectedSlotIndex !== null && selectedSlotIndex !== undefined) {
    filtered = isFreePlacement
      ? getFreePlacementSlotModules(filtered, selectedSlotIndex)
      : getSlotPlacedModules(filtered, selectedSlotIndex, spaceInfo, zones)
  }

  return filterToEdgeModules(filtered, viewDirection)
}

export const getSideViewSlotGroups = (
  placedModules: PlacedModule[]
): SideViewSlotGroup[] => {
  const visibleModules = placedModules.filter(module => !module.isSurroundPanel)
  const grouped = new Map<number, PlacedModule[]>()

  visibleModules.forEach(module => {
    if (typeof module.slotIndex === 'number') {
      const occupiedSlots = module.isDualSlot
        ? [module.slotIndex, module.slotIndex + 1]
        : [module.slotIndex]

      occupiedSlots.forEach(slotKey => {
        const modules = grouped.get(slotKey) ?? []
        modules.push(module)
        grouped.set(slotKey, modules)
      })
      return
    }

    const slotKey = Math.round(getModuleX(module) * 1000)
    const modules = grouped.get(slotKey) ?? []
    modules.push(module)
    grouped.set(slotKey, modules)
  })

  return Array.from(grouped.entries())
    .sort(([aSlotKey, aModules], [bSlotKey, bModules]) => {
      const hasSlotKey = aSlotKey >= 0 && bSlotKey >= 0
      if (hasSlotKey && aSlotKey !== bSlotKey) return aSlotKey - bSlotKey

      const ax = Math.min(...aModules.map(getModuleX))
      const bx = Math.min(...bModules.map(getModuleX))
      return ax - bx
    })
    .map(([slotKey, modules], index) => ({
      slotKey,
      titleIndex: slotKey >= 0 ? slotKey + 1 : index + 1,
      selectedSlotIndex: slotKey >= 0 ? slotKey : index,
      modules
    }))
}
