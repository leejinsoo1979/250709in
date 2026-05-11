export interface DoorDimensionModulePlacement {
  id: string
  x: number
  index: number
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
    return { left: true, right: true }
  }

  const sortedModules = [...modules].sort((a, b) => {
    if (Math.abs(a.x - b.x) > 0.001) return a.x - b.x
    return a.index - b.index
  })
  const leftModule = sortedModules[0]
  const rightModule = sortedModules[sortedModules.length - 1]

  return {
    left: leftModule.id === furnitureId,
    right: rightModule.id === furnitureId
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
