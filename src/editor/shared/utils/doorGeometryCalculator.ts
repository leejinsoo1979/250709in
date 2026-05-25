import {
  avoidHingePositionsForShelves,
  calculateHingePositions,
  type HingeShelfCollisionRange
} from '@/domain/boring/calculators/hingeCalculator'
import { DEFAULT_HINGE_SETTINGS } from '@/domain/boring/constants'
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

export interface SidePanelMatchedHingePositionsInput {
  doorHeightMm: number
  doorBottomOnSideMm: number
  shelfCollisionRangesOnSideMm?: HingeShelfCollisionRange[]
  customSidePositionsMm?: number[] | null
  customDoorPositionsMm?: number[] | null
  defaultDoorPositionsMm?: number[]
  clearanceMm?: number
  preserveEdgePositionsMm?: boolean
}

export interface SidePanelMatchedHingePositions {
  doorPositionsMm: number[]
  sidePositionsMm: number[]
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

export interface DoorWidthAdjustmentSides {
  leftMm: number
  rightMm: number
}

export type DoorHingeMode = 'auto' | 'upper2' | 'lower4' | 'lower5'

export interface DefaultDoorHingePositionsInput {
  doorHeightMm: number
  isUpperCabinet?: boolean
  isLowerCabinet?: boolean
  hingeMode?: DoorHingeMode
}

export interface SideAnchoredDoorHingePositionsInput {
  doorHeightMm: number
  doorBottomOnSideMm: number
  defaultDoorPositionsMm?: number[]
  firstSidePositionMm?: number
  lastSidePositionMm?: number
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

  if (isTallCabinet) {
    leafHeightMm = cabinetHeightMm + (doorTopGapMm ?? 0) + (doorBottomGapMm ?? 0)
  } else if (isUpperCabinet) {
    leafHeightMm = cabinetHeightMm + (doorTopGapMm ?? 5) + (doorBottomGapMm ?? 28)
  } else if (isLowerCabinet) {
    if (classification.isTopDown) {
      // 상판내림은 몸통 높이 증감분을 상단 전대/대리석 앞판이 흡수한다.
      // 도어 기준은 기본 몸통 785mm에 상하 갭만 반영한다. 기본 -80/+5 = 710mm.
      leafHeightMm = 785 + (doorTopGapMm ?? -80) + (doorBottomGapMm ?? 5)
    } else if (classification.isDoorLift) {
      leafHeightMm = cabinetHeightMm + (doorTopGapMm ?? 30) + (doorBottomGapMm ?? 5)
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
  let bottomMm: number
  let topMm: number

  if (isUpperCabinet) {
    const upperDoorTopGap = doorTopGapMm ?? 5
    const upperDoorBottomGap = doorBottomGapMm ?? 28
    const cabinetTopMm = spaceHeightMm ?? cabinetBottomMm + cabinetHeightMm
    topMm = cabinetTopMm + upperDoorTopGap
    bottomMm = cabinetTopMm - cabinetHeightMm - upperDoorBottomGap
  } else if (isLowerCabinet) {
    if (classification.isTopDown) {
      bottomMm = cabinetBottomMm - 5
      topMm = bottomMm + leafDimensions.leafHeightMm
    } else if (classification.isDoorLift) {
      const doorLiftTopGap = doorTopGapMm ?? 30
      const doorLiftBottomGap = doorBottomGapMm ?? 5
      bottomMm = cabinetBottomMm - doorLiftBottomGap
      topMm = cabinetBottomMm + cabinetHeightMm + doorLiftTopGap
    } else {
      bottomMm = cabinetBottomMm - (doorBottomGapMm ?? 0)
      topMm = bottomMm + leafDimensions.leafHeightMm
    }
  } else {
    bottomMm = cabinetBottomMm - (doorBottomGapMm ?? 0)
    topMm = cabinetBottomMm + cabinetHeightMm + (doorTopGapMm ?? 0)
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

export const resolveHingeOppositeDoorWidthAdjustment = (
  adjustmentMm: number,
  hingeSide: DoorHingeSide
): DoorWidthAdjustmentSides => {
  if (hingeSide === 'right') {
    return { leftMm: adjustmentMm, rightMm: 0 }
  }

  return { leftMm: 0, rightMm: adjustmentMm }
}

export const normalizeDoorHingePositionsMm = (
  positions: number[] | null | undefined,
  doorHeightMm: number
): number[] => {
  if (!Array.isArray(positions) || !Number.isFinite(doorHeightMm) || doorHeightMm <= 0) {
    return []
  }

  const min = 1
  const max = Math.max(min, doorHeightMm - 1)
  const normalized = positions
    .map(position => Math.round(position))
    .filter(position => Number.isFinite(position))
    .map(position => Math.max(min, Math.min(max, position)))

  return Array.from(new Set(normalized)).sort((a, b) => a - b)
}

export const resolveDefaultDoorHingePositionsMm = ({
  doorHeightMm,
  hingeMode = 'auto'
}: DefaultDoorHingePositionsInput): number[] => {
  if (!Number.isFinite(doorHeightMm) || doorHeightMm <= 0) {
    return []
  }

  if (hingeMode === 'upper2') {
    return normalizeDoorHingePositionsMm(
      calculateHingePositions(doorHeightMm, {
        ...DEFAULT_HINGE_SETTINGS,
        minDoorHeightFor3Hinges: Number.POSITIVE_INFINITY
      }),
      doorHeightMm
    )
  }

  if (hingeMode === 'lower5') {
    return normalizeDoorHingePositionsMm(
      calculateHingePositions(doorHeightMm, {
        ...DEFAULT_HINGE_SETTINGS,
        minDoorHeightFor3Hinges: 0,
        minDoorHeightFor4Hinges: 0,
        minDoorHeightFor5Hinges: 0
      }),
      doorHeightMm
    )
  }

  if (hingeMode === 'lower4') {
    return normalizeDoorHingePositionsMm(
      calculateHingePositions(doorHeightMm, {
        ...DEFAULT_HINGE_SETTINGS,
        minDoorHeightFor3Hinges: 0,
        minDoorHeightFor4Hinges: 0,
        minDoorHeightFor5Hinges: Number.POSITIVE_INFINITY
      }),
      doorHeightMm
    )
  }

  return normalizeDoorHingePositionsMm(
    calculateHingePositions(doorHeightMm),
    doorHeightMm
  )
}

export const resolveSideAnchoredDoorHingePositionsMm = ({
  doorHeightMm,
  doorBottomOnSideMm,
  defaultDoorPositionsMm,
  firstSidePositionMm,
  lastSidePositionMm,
}: SideAnchoredDoorHingePositionsInput): number[] => {
  const basePositions = normalizeDoorHingePositionsMm(
    defaultDoorPositionsMm && defaultDoorPositionsMm.length > 0
      ? defaultDoorPositionsMm
      : calculateHingePositions(doorHeightMm),
    doorHeightMm
  )
  if (basePositions.length < 2 || !Number.isFinite(doorBottomOnSideMm)) {
    return basePositions
  }

  const positions = [...basePositions]
  if (Number.isFinite(firstSidePositionMm)) {
    positions[0] = (firstSidePositionMm as number) - doorBottomOnSideMm
  }
  if (Number.isFinite(lastSidePositionMm)) {
    positions[positions.length - 1] = (lastSidePositionMm as number) - doorBottomOnSideMm
  }

  if (positions.length > 2) {
    const first = positions[0]
    const last = positions[positions.length - 1]
    const spacing = (last - first) / (positions.length - 1)
    for (let index = 1; index < positions.length - 1; index += 1) {
      positions[index] = first + spacing * index
    }
  }

  return normalizeDoorHingePositionsMm(positions, doorHeightMm)
}

export const resolveSidePanelMatchedHingePositions = ({
  doorHeightMm,
  doorBottomOnSideMm,
  shelfCollisionRangesOnSideMm = [],
  customSidePositionsMm,
  customDoorPositionsMm,
  defaultDoorPositionsMm,
  clearanceMm = 50,
  preserveEdgePositionsMm = false
}: SidePanelMatchedHingePositionsInput): SidePanelMatchedHingePositions => {
  if (!Number.isFinite(doorHeightMm) || doorHeightMm <= 0 || !Number.isFinite(doorBottomOnSideMm)) {
    return { doorPositionsMm: [], sidePositionsMm: [] }
  }

  const customSidePositions = (customSidePositionsMm || [])
    .filter(position => Number.isFinite(position))
    .map(position => Math.round(position * 1000) / 1000)
    .sort((a, b) => a - b)
  if (customSidePositions.length > 0) {
    const minSidePosition = doorBottomOnSideMm + 1
    const maxSidePosition = doorBottomOnSideMm + doorHeightMm - 1
    const sidePositions = customSidePositions.map(position =>
      Math.max(minSidePosition, Math.min(maxSidePosition, position))
    )
    return {
      sidePositionsMm: sidePositions,
      doorPositionsMm: normalizeDoorHingePositionsMm(
        sidePositions.map(position => position - doorBottomOnSideMm),
        doorHeightMm
      )
    }
  }

  const customDoorPositions = normalizeDoorHingePositionsMm(customDoorPositionsMm, doorHeightMm)
  if (customDoorPositions.length > 0) {
    return {
      doorPositionsMm: customDoorPositions,
      sidePositionsMm: customDoorPositions.map(position => Math.round((doorBottomOnSideMm + position) * 1000) / 1000)
    }
  }

  const doorCandidates = normalizeDoorHingePositionsMm(
    defaultDoorPositionsMm && defaultDoorPositionsMm.length > 0
      ? defaultDoorPositionsMm
      : calculateHingePositions(doorHeightMm),
    doorHeightMm
  )
  if (doorCandidates.length === 0) {
    return { doorPositionsMm: [], sidePositionsMm: [] }
  }

  const sideCandidates = doorCandidates.map(position => doorBottomOnSideMm + position)
  const sideHeightForClamp = doorBottomOnSideMm + doorHeightMm
  const avoidedSidePositions = avoidHingePositionsForShelves(
    sideCandidates,
    shelfCollisionRangesOnSideMm,
    sideHeightForClamp,
    {
      clearanceMm,
      minMarginMm: doorBottomOnSideMm + DEFAULT_HINGE_SETTINGS.topBottomMargin,
      maxMarginMm: DEFAULT_HINGE_SETTINGS.topBottomMargin
    }
  )
  const sidePositions = preserveEdgePositionsMm && avoidedSidePositions.length >= 2
    ? avoidedSidePositions.map((position, index) => {
      if (index === 0) return sideCandidates[0]
      if (index === avoidedSidePositions.length - 1) return sideCandidates[sideCandidates.length - 1]
      return position
    })
    : avoidedSidePositions

  return {
    sidePositionsMm: sidePositions,
    doorPositionsMm: normalizeDoorHingePositionsMm(
      sidePositions.map(position => position - doorBottomOnSideMm),
      doorHeightMm
    )
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
