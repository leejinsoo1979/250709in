export interface ClothingRodGeometry {
  bracketWidth: number
  bracketDepth: number
  bracketHeight: number
  widthReduction: number
  leftBracketX: number
  rightBracketX: number
  rodStartX: number
  rodEndX: number
  rodWidth: number
  rodCenterX: number
  rodDepth: number
  rodHeight: number
  rodYOffset: number
  rodZOffset: number
  midLineOffset: number
}

const DEFAULT_UNIT_SCALE = 0.01

export const mmToClothingRodUnits = (
  mm: number,
  unitScale = DEFAULT_UNIT_SCALE
) => mm * unitScale

export const calculateClothingRodGeometry = (
  innerWidth: number,
  unitScale = DEFAULT_UNIT_SCALE
): ClothingRodGeometry => {
  const bracketWidth = mmToClothingRodUnits(12, unitScale)
  const bracketDepth = mmToClothingRodUnits(12, unitScale)
  const bracketHeight = mmToClothingRodUnits(75, unitScale)
  const widthReduction = mmToClothingRodUnits(0.5, unitScale)

  const leftBracketX = -innerWidth / 2 + bracketWidth / 2 + widthReduction
  const rightBracketX = innerWidth / 2 - bracketWidth / 2 - widthReduction
  const rodStartX = leftBracketX + bracketWidth / 2
  const rodEndX = rightBracketX - bracketWidth / 2
  const rodWidth = rodEndX - rodStartX
  const rodCenterX = (rodStartX + rodEndX) / 2
  const rodDepth = mmToClothingRodUnits(10, unitScale)
  const rodHeight = mmToClothingRodUnits(30, unitScale)
  const rodYOffset = -bracketHeight / 2 + mmToClothingRodUnits(5, unitScale) + rodHeight / 2
  const rodZOffset = -mmToClothingRodUnits(1, unitScale)
  const midLineOffset = mmToClothingRodUnits(5, unitScale)

  return {
    bracketWidth,
    bracketDepth,
    bracketHeight,
    widthReduction,
    leftBracketX,
    rightBracketX,
    rodStartX,
    rodEndX,
    rodWidth,
    rodCenterX,
    rodDepth,
    rodHeight,
    rodYOffset,
    rodZOffset,
    midLineOffset
  }
}

export const shouldHideClothingRodInView = (
  viewMode: string,
  view2DDirection: string | undefined
) => viewMode === '2D' && view2DDirection === 'top'
