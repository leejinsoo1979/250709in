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
    return {
      left: currentModule.slotIndex === minSlotIndex,
      right: false
    }
  }

  const leftmostX = Math.min(...modules.map(module => module.x))

  return {
    left: Math.abs(currentModule.x - leftmostX) <= 0.001,
    right: false
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
