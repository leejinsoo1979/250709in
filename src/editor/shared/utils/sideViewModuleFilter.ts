import type { PlacedModule } from '@/editor/shared/furniture/types'
import type { FreePlacementGuideSlot, SpaceInfo } from '@/store/core/spaceConfigStore'

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
  spaceInfo?: Pick<SpaceInfo, 'customColumnCount' | 'droppedCeiling' | 'freePlacementGuides' | 'width'>
  zones?: SideViewZoneInfo | null
  excludeSurroundPanels?: boolean
}

export interface SideViewSlotGroup {
  slotKey: number
  titleIndex: number
  selectedSlotIndex: number
  modules: PlacedModule[]
}

export interface SideViewGuideSlotGroup {
  displayIndex: number
  label: string
  selectedSlotIndex: number
  x: number
  width: number
  guideZone: 'full' | 'upper' | 'lower'
  slotIds: string[]
}

const getModuleX = (module: PlacedModule): number => module.position?.x ?? 0

const zoneLabelMap: Record<'full' | 'upper' | 'lower', string> = {
  full: '',
  upper: '상',
  lower: '하'
}

const zoneSortOrder: Record<'full' | 'upper' | 'lower', number> = {
  full: 0,
  upper: 1,
  lower: 2
}

export const getSideViewGuideSlotGroups = (
  guideSlots: FreePlacementGuideSlot[] = []
): SideViewGuideSlotGroup[] => {
  const sortedSlots = [...guideSlots].sort((a, b) => {
    if (Math.abs(a.x - b.x) > 0.5) return a.x - b.x
    const zoneOrderDiff = zoneSortOrder[a.guideZone || 'full'] - zoneSortOrder[b.guideZone || 'full']
    if (zoneOrderDiff !== 0) return zoneOrderDiff
    return a.width - b.width
  })

  const groups: Array<{ x: number; width: number; guideZone: 'full' | 'upper' | 'lower'; slotIds: string[] }> = []
  sortedSlots.forEach(slot => {
    const guideZone = slot.guideZone || 'full'
    const existing = groups.find(group =>
      Math.abs(group.x - slot.x) <= 0.5 &&
      Math.abs(group.width - slot.width) <= 0.5 &&
      group.guideZone === guideZone
    )

    if (existing) {
      existing.slotIds.push(slot.id)
      return
    }

    groups.push({ x: slot.x, width: slot.width, guideZone, slotIds: [slot.id] })
  })

  const hasSplitSlots = groups.some(group => group.guideZone === 'upper' || group.guideZone === 'lower')
  const zoneCounters: Record<'full' | 'upper' | 'lower', number> = {
    full: 0,
    upper: 0,
    lower: 0
  }

  return groups.map((group, index) => ({
    ...group,
    displayIndex: ++zoneCounters[group.guideZone],
    label: hasSplitSlots && group.guideZone !== 'full'
      ? `${zoneLabelMap[group.guideZone]}${zoneCounters[group.guideZone]}`
      : `${zoneCounters[group.guideZone]}`,
    selectedSlotIndex: index
  }))
}

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

const getGuidePlacementSlotModules = (
  modules: PlacedModule[],
  selectedSlotIndex: number,
  spaceInfo?: Pick<SpaceInfo, 'freePlacementGuides' | 'width'>
): PlacedModule[] | null => {
  const guideGroups = getSideViewGuideSlotGroups(spaceInfo?.freePlacementGuides || [])
  const targetGroup = guideGroups[selectedSlotIndex]
  const spaceWidth = spaceInfo?.width || 0
  if (!targetGroup || spaceWidth <= 0) return null

  const targetGuideCenterX = targetGroup.x + targetGroup.width / 2
  const groupsByZone = new Map<'full' | 'upper' | 'lower', SideViewGuideSlotGroup>()
  guideGroups.forEach(group => {
    const groupStartX = group.x - 0.5
    const groupEndX = group.x + group.width + 0.5
    if (targetGuideCenterX < groupStartX || targetGuideCenterX > groupEndX) return

    const existing = groupsByZone.get(group.guideZone)
    if (!existing) {
      groupsByZone.set(group.guideZone, group)
      return
    }

    const groupCenterDistance = Math.abs(group.x + group.width / 2 - targetGuideCenterX)
    const existingCenterDistance = Math.abs(existing.x + existing.width / 2 - targetGuideCenterX)
    if (groupCenterDistance < existingCenterDistance) {
      groupsByZone.set(group.guideZone, group)
    }
  })
  const xLevelGroups = Array.from(groupsByZone.values())
  const targetCenters = new Set(
    xLevelGroups.map(group => Number(((group.x + group.width / 2 - spaceWidth / 2) * 0.01).toFixed(4)))
  )

  return modules.filter(module => {
    const moduleX = getModuleX(module)
    return Array.from(targetCenters).some(targetCenterX => Math.abs(moduleX - targetCenterX) < 0.015)
  })
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
    if (isFreePlacement) {
      filtered = getGuidePlacementSlotModules(filtered, selectedSlotIndex, spaceInfo)
        ?? getFreePlacementSlotModules(filtered, selectedSlotIndex)
    } else {
      filtered = getSlotPlacedModules(filtered, selectedSlotIndex, spaceInfo, zones)
    }

    return filtered
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
