import { classifyModule } from './moduleClassification'

export type DoorHingeSide = 'left' | 'right'
export type DoorCabinetCategory = 'upper' | 'lower' | 'full' | 'tall' | 'generic'

export interface DoorLeafDimensionsInput {
  moduleId?: string
  cabinetCategory?: DoorCabinetCategory
  doorWidthMm: number
  cabinetHeightMm: number
  spaceHeightMm?: number
  doorTopGapMm?: number
  doorBottomGapMm?: number
  doorGapMm?: number
  isDualSlot?: boolean
  hingeSide?: DoorHingeSide
}

export interface DoorLeafDimension {
  index: number
  name: 'single' | 'left' | 'right'
  widthMm: number
  heightMm: number
  hingeSide: DoorHingeSide
}

export interface DoorLeafDimensions {
  leafCount: 1 | 2
  totalDoorWidthMm: number
  leafWidthMm: number
  leafHeightMm: number
  leaves: DoorLeafDimension[]
}

export interface DoorVerticalGeometryInput extends DoorLeafDimensionsInput {
  cabinetBottomMm?: number
}

export interface DoorVerticalGeometry extends DoorLeafDimensions {
  bottomMm: number
  topMm: number
  centerYMm: number
}

export interface SingleDoorOpenGeometryInput {
  hingeSide: DoorHingeSide
  doorGroupX: number
  doorYPosition: number
  doorDepth: number
  doorWidthUnits: number
  epTrimShiftX?: number
  insertExtendShiftX?: number
  panelThicknessMm?: number
  unitScale?: number
}

export interface DualDoorOpenGeometryInput {
  doorSide: DoorHingeSide
  doorYPosition: number
  doorDepth: number
  hingeX: number
  doorWidthUnits: number
  epTrimShift?: number
  insertExtendShift?: number
  panelThicknessMm?: number
  unitScale?: number
}

export interface DoorOpenGeometry {
  hingeOffsetUnits: number
  openInsetAdjustUnits: number
  hingeAxisOffset: number
  parentPosition: [number, number, number]
  childPosition: [number, number, number]
}

const DEFAULT_PANEL_THICKNESS_MM = 18
const DEFAULT_UNIT_SCALE = 0.01
const DEFAULT_DOOR_GAP_MM = 3

export const resolveDoorLeafDimensions = (
  input: DoorLeafDimensionsInput
): DoorLeafDimensions => {
  const {
    moduleId = '',
    cabinetCategory = 'generic',
    doorWidthMm,
    cabinetHeightMm,
    spaceHeightMm,
    doorTopGapMm,
    doorBottomGapMm,
    doorGapMm = DEFAULT_DOOR_GAP_MM,
    isDualSlot,
    hingeSide = 'left'
  } = input
  const classification = classifyModule(moduleId)
  const isUpperCabinet = cabinetCategory === 'upper' || classification.isUpperCabinet
  const isLowerCabinet = cabinetCategory === 'lower' || classification.isLowerCabinet
  const isTallCabinet = !isUpperCabinet && !isLowerCabinet
  const isDualDoor = isDualSlot ?? classification.isDual

  let leafHeightMm: number

  if (spaceHeightMm && isTallCabinet) {
    leafHeightMm = spaceHeightMm - (doorTopGapMm ?? 5) - (doorBottomGapMm ?? 25)
  } else if (isUpperCabinet) {
    leafHeightMm = cabinetHeightMm - 5 + 28
  } else if (isLowerCabinet) {
    if (classification.isTopDown) {
      leafHeightMm = 710
    } else if (classification.isDoorLift) {
      leafHeightMm = cabinetHeightMm + 5 + 30
    } else {
      leafHeightMm = cabinetHeightMm + (doorTopGapMm ?? 0) + (doorBottomGapMm ?? 0)
    }
  } else {
    leafHeightMm = cabinetHeightMm - doorGapMm * 2
  }

  if (isDualDoor) {
    const leafWidthMm = Math.floor(doorWidthMm / 2 - doorGapMm)

    return {
      leafCount: 2,
      totalDoorWidthMm: doorWidthMm,
      leafWidthMm,
      leafHeightMm,
      leaves: [
        {
          index: 0,
          name: 'left',
          widthMm: leafWidthMm,
          heightMm: leafHeightMm,
          hingeSide: 'right'
        },
        {
          index: 1,
          name: 'right',
          widthMm: leafWidthMm,
          heightMm: leafHeightMm,
          hingeSide: 'left'
        }
      ]
    }
  }

  const leafWidthMm = doorWidthMm - doorGapMm

  return {
    leafCount: 1,
    totalDoorWidthMm: doorWidthMm,
    leafWidthMm,
    leafHeightMm,
    leaves: [
      {
        index: 0,
        name: 'single',
        widthMm: leafWidthMm,
        heightMm: leafHeightMm,
        hingeSide
      }
    ]
  }
}

export const resolveDoorVerticalGeometry = (
  input: DoorVerticalGeometryInput
): DoorVerticalGeometry => {
  const leafDimensions = resolveDoorLeafDimensions(input)
  const {
    moduleId = '',
    cabinetCategory = 'generic',
    cabinetHeightMm,
    spaceHeightMm,
    doorTopGapMm,
    doorBottomGapMm,
    cabinetBottomMm = 0
  } = input
  const classification = classifyModule(moduleId)
  const isUpperCabinet = cabinetCategory === 'upper' || classification.isUpperCabinet
  const isLowerCabinet = cabinetCategory === 'lower' || classification.isLowerCabinet
  const doorTopGap = doorTopGapMm ?? 5
  let bottomMm: number
  let topMm: number

  if (isUpperCabinet) {
    topMm = (spaceHeightMm ?? cabinetBottomMm + cabinetHeightMm) - doorTopGap
    bottomMm = topMm - leafDimensions.leafHeightMm
  } else if (isLowerCabinet) {
    if (classification.isTopDown) {
      bottomMm = cabinetBottomMm - 5
      topMm = bottomMm + leafDimensions.leafHeightMm
    } else if (classification.isDoorLift) {
      topMm = cabinetBottomMm + cabinetHeightMm + 30
      bottomMm = topMm - leafDimensions.leafHeightMm
    } else {
      bottomMm = cabinetBottomMm - (doorBottomGapMm ?? 0)
      topMm = bottomMm + leafDimensions.leafHeightMm
    }
  } else {
    topMm = (spaceHeightMm ?? cabinetBottomMm + leafDimensions.leafHeightMm + doorTopGap) - doorTopGap
    bottomMm = topMm - leafDimensions.leafHeightMm
  }

  return {
    ...leafDimensions,
    bottomMm,
    topMm,
    centerYMm: bottomMm + (topMm - bottomMm) / 2
  }
}

export const mmToDoorGeometryUnits = (
  mm: number,
  unitScale = DEFAULT_UNIT_SCALE
) => mm * unitScale

export const calculateDoorOpenInsetUnits = (
  panelThicknessMm = DEFAULT_PANEL_THICKNESS_MM,
  unitScale = DEFAULT_UNIT_SCALE
) => {
  const hingeOffsetUnits = mmToDoorGeometryUnits(panelThicknessMm / 2, unitScale)

  return {
    hingeOffsetUnits,
    openInsetAdjustUnits: hingeOffsetUnits / 2
  }
}

export const calculateSingleDoorOpenGeometry = (
  input: SingleDoorOpenGeometryInput
): DoorOpenGeometry => {
  const {
    hingeSide,
    doorGroupX,
    doorYPosition,
    doorDepth,
    doorWidthUnits,
    epTrimShiftX = 0,
    insertExtendShiftX = 0,
    panelThicknessMm,
    unitScale
  } = input

  const { hingeOffsetUnits, openInsetAdjustUnits } = calculateDoorOpenInsetUnits(
    panelThicknessMm,
    unitScale
  )

  const hingeAxisOffset = hingeSide === 'left'
    ? -doorWidthUnits / 2 + hingeOffsetUnits
    : doorWidthUnits / 2 - hingeOffsetUnits
  const innerXShift = hingeSide === 'left'
    ? openInsetAdjustUnits
    : -openInsetAdjustUnits
  const doorPositionX = -hingeAxisOffset

  return {
    hingeOffsetUnits,
    openInsetAdjustUnits,
    hingeAxisOffset,
    parentPosition: [
      doorGroupX + hingeAxisOffset + epTrimShiftX + insertExtendShiftX + innerXShift,
      doorYPosition,
      doorDepth / 2 + openInsetAdjustUnits
    ],
    childPosition: [
      doorPositionX - innerXShift,
      0,
      -openInsetAdjustUnits
    ]
  }
}

export const calculateDualDoorOpenGeometry = (
  input: DualDoorOpenGeometryInput
): DoorOpenGeometry => {
  const {
    doorSide,
    doorYPosition,
    doorDepth,
    hingeX,
    doorWidthUnits,
    epTrimShift = 0,
    insertExtendShift = 0,
    panelThicknessMm,
    unitScale
  } = input

  const { hingeOffsetUnits, openInsetAdjustUnits } = calculateDoorOpenInsetUnits(
    panelThicknessMm,
    unitScale
  )

  const isLeftDoor = doorSide === 'left'
  const hingeAxisOffset = isLeftDoor
    ? -doorWidthUnits / 2 + hingeOffsetUnits
    : doorWidthUnits / 2 - hingeOffsetUnits

  return {
    hingeOffsetUnits,
    openInsetAdjustUnits,
    hingeAxisOffset,
    parentPosition: [
      hingeX + epTrimShift + insertExtendShift + (isLeftDoor ? openInsetAdjustUnits : -openInsetAdjustUnits),
      doorYPosition,
      doorDepth / 2 + openInsetAdjustUnits
    ],
    childPosition: [
      isLeftDoor
        ? doorWidthUnits / 2 - hingeOffsetUnits - openInsetAdjustUnits
        : -doorWidthUnits / 2 + hingeOffsetUnits + openInsetAdjustUnits,
      0,
      -openInsetAdjustUnits
    ]
  }
}

export const calculateDoorCenterAfterYRotation = (
  geometry: DoorOpenGeometry,
  rotationY: number
): [number, number, number] => {
  const [parentX, parentY, parentZ] = geometry.parentPosition
  const [childX, childY, childZ] = geometry.childPosition
  const cos = Math.cos(rotationY)
  const sin = Math.sin(rotationY)

  return [
    parentX + childX * cos + childZ * sin,
    parentY + childY,
    parentZ - childX * sin + childZ * cos
  ]
}
