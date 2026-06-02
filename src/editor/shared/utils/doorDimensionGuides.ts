export interface DoorDimensionModulePlacement {
  id: string
  x: number
  index: number
  slotIndex?: number
  isRightmostSlot?: boolean
}

export interface DoorHeightDimensionSides {
  left: boolean
  right: boolean
}

export const isDoorDimensionCandidate = (
  placedHasDoor: boolean | undefined
): boolean => placedHasDoor === true

export type DoorDimensionCategory = 'upper' | 'lower' | 'tall' | 'other'

export const resolveDoorDimensionCategory = (
  moduleId?: string,
  moduleCategory?: string
): DoorDimensionCategory => {
  if (moduleCategory === 'upper' || moduleId?.includes('upper-') || moduleId?.includes('dual-upper-')) return 'upper'
  if (moduleCategory === 'lower' || moduleId?.includes('lower-') || moduleId?.includes('dual-lower-')) return 'lower'
  if (moduleCategory === 'tall' || moduleId?.includes('tall-') || moduleId?.includes('pantry-')) return 'tall'
  return 'other'
}

export const resolveDoorHeightDimensionSides = (
  modules: DoorDimensionModulePlacement[],
  furnitureId?: string
): DoorHeightDimensionSides => {
  if (!furnitureId || modules.length === 0) {
    return { left: false, right: false }
  }

  const currentModule = modules.find(module => module.id === furnitureId)
  if (!currentModule) {
    return { left: false, right: false }
  }
  if (currentModule.isRightmostSlot) {
    return { left: false, right: true }
  }

  const slotIndexedModules = modules.filter(module => module.slotIndex !== undefined)
  if (currentModule.slotIndex !== undefined && slotIndexedModules.length > 0) {
    const minSlotIndex = Math.min(...slotIndexedModules.map(module => module.slotIndex!))
    const maxSlotIndex = Math.max(...slotIndexedModules.map(module => module.slotIndex!))
    if (currentModule.slotIndex === maxSlotIndex && maxSlotIndex !== minSlotIndex) {
      return { left: false, right: true }
    }
    return {
      left: currentModule.slotIndex === minSlotIndex,
      right: false
    }
  }

  const leftmostX = Math.min(...modules.map(module => module.x))
  const rightmostX = Math.max(...modules.map(module => module.x))

  return {
    left: Math.abs(currentModule.x - leftmostX) <= 0.001,
    right: modules.length > 1 && Math.abs(currentModule.x - rightmostX) <= 0.001 && Math.abs(currentModule.x - leftmostX) > 0.001
  }
}

export const shouldRenderDoorDimensionGuides = (
  showDimensions: boolean,
  isPlainMaterial: boolean,
  viewMode: '2D' | '3D',
  view2DDirection?: string
): boolean => showDimensions
  && !isPlainMaterial
  && (viewMode === '3D' || (viewMode === '2D' && view2DDirection === 'front'))
