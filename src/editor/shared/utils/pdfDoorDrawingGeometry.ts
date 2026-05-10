import { resolveDoorVerticalGeometry, type DoorCabinetCategory, type DoorHingeSide } from './doorGeometryCalculator'

export interface PdfDoorDrawingPlacedModule {
  moduleId: string
  position: { x: number; y: number; z: number }
  hasDoor?: boolean
  customWidth?: number
  adjustedWidth?: number
  moduleWidth?: number
  slotCustomWidth?: number
  freeWidth?: number
  customHeight?: number
  freeHeight?: number
  doorTopGap?: number
  doorBottomGap?: number
  hingePosition?: DoorHingeSide
  isDualSlot?: boolean
}

export interface PdfDoorDrawingSection {
  type?: string
  height?: number
  heightType?: 'absolute' | 'percentage' | string
  drawerHeights?: number[]
  gapHeight?: number
}

export interface PdfDoorDrawingModuleData {
  id?: string
  name?: string
  category?: string
  hasDoor?: boolean
  dimensions: {
    width: number
    height: number
  }
  modelConfig?: {
    basicThickness?: number
    sections?: PdfDoorDrawingSection[]
  }
}

export interface PdfDoorDrawingSubItem {
  type: 'door' | 'drawer'
  x: number
  y: number
  width: number
  height: number
  label?: string
  hingeSide?: DoorHingeSide
}

export interface PdfDoorDrawingItem {
  moduleId: string
  moduleName: string
  furnitureX: number
  furnitureWidth: number
  furnitureHeight: number
  items: PdfDoorDrawingSubItem[]
}

export interface PdfDoorDrawingBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
  width: number
  height: number
}

const firstPositiveNumber = (...values: Array<number | undefined>) => {
  const found = values.find(value => typeof value === 'number' && Number.isFinite(value) && value > 0)
  return found ?? 0
}

const toDoorCabinetCategory = (category?: string): DoorCabinetCategory => {
  if (category === 'upper') return 'upper'
  if (category === 'lower') return 'lower'
  if (category === 'full') return 'full'
  return 'generic'
}

export const resolvePdfDoorDrawingItem = (
  placedModule: PdfDoorDrawingPlacedModule,
  moduleData?: PdfDoorDrawingModuleData
): PdfDoorDrawingItem | null => {
  if (!moduleData) return null

  const hasDoor = placedModule.hasDoor ?? moduleData.hasDoor ?? false
  const sections = moduleData.modelConfig?.sections || []
  const hasDrawer = sections.some(section => section.type === 'drawer')

  if (!hasDoor && !hasDrawer) return null

  const furnitureWidth = firstPositiveNumber(
    placedModule.freeWidth,
    placedModule.customWidth,
    placedModule.adjustedWidth,
    placedModule.slotCustomWidth,
    placedModule.moduleWidth,
    moduleData.dimensions.width
  )
  const furnitureHeight = firstPositiveNumber(
    placedModule.freeHeight,
    placedModule.customHeight,
    moduleData.dimensions.height
  )
  const furnitureX = placedModule.position.x * 100
  const basicThickness = moduleData.modelConfig?.basicThickness || 18
  const doorTopGap = placedModule.doorTopGap ?? 10
  const doorBottomGap = placedModule.doorBottomGap ?? 65
  const doorGap = 3
  const items: PdfDoorDrawingSubItem[] = []

  let currentY = basicThickness

  for (const section of sections) {
    if (section.type === 'drawer') {
      const drawerHeights = section.drawerHeights || []
      const gapHeight = section.gapHeight || 24

      for (let i = 0; i < drawerHeights.length; i++) {
        const drawerHeight = drawerHeights[i]

        items.push({
          type: 'drawer',
          x: basicThickness,
          y: currentY,
          width: Math.max(0, furnitureWidth - basicThickness * 2),
          height: drawerHeight,
          label: `Drawer ${i + 1}`
        })

        currentY += drawerHeight + gapHeight
      }
    } else if (section.type === 'hanging' || section.type === 'shelf' || section.type === 'open') {
      currentY += section.heightType === 'absolute'
        ? section.height || 0
        : ((section.height || 0) / 100) * furnitureHeight
    }
  }

  if (hasDoor && !hasDrawer) {
    const doorWidthMm = Math.max(0, furnitureWidth - basicThickness * 2)
    const doorGeometry = resolveDoorVerticalGeometry({
      moduleId: placedModule.moduleId,
      cabinetCategory: toDoorCabinetCategory(moduleData.category),
      doorWidthMm,
      cabinetHeightMm: furnitureHeight,
      spaceHeightMm: furnitureHeight,
      doorTopGapMm: doorTopGap,
      doorBottomGapMm: doorBottomGap,
      doorGapMm: doorGap,
      isDualSlot: placedModule.isDualSlot,
      hingeSide: placedModule.hingePosition ?? 'left'
    })

    for (const leaf of doorGeometry.leaves) {
      const leafX = doorGeometry.leafCount === 2 && leaf.name === 'right'
        ? basicThickness + doorWidthMm - leaf.widthMm
        : basicThickness

      items.push({
        type: 'door',
        x: leafX,
        y: doorGeometry.bottomMm,
        width: leaf.widthMm,
        height: leaf.heightMm,
        label: leaf.name === 'single' ? 'Door' : `${leaf.name.toUpperCase()} Door`,
        hingeSide: leaf.hingeSide
      })
    }
  }

  if (items.length === 0) return null

  return {
    moduleId: placedModule.moduleId,
    moduleName: moduleData.name || moduleData.id || placedModule.moduleId,
    furnitureX,
    furnitureWidth,
    furnitureHeight,
    items
  }
}

export const resolveDoorDrawingOuterBounds = (
  doorItems: PdfDoorDrawingItem[]
): PdfDoorDrawingBounds | null => {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  for (const doorItem of doorItems) {
    for (const item of doorItem.items) {
      const absX = doorItem.furnitureX + item.x
      minX = Math.min(minX, absX)
      maxX = Math.max(maxX, absX + item.width)
      minY = Math.min(minY, item.y)
      maxY = Math.max(maxY, item.y + item.height)
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return null
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  }
}
