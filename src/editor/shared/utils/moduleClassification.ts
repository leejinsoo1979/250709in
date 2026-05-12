export type ModuleFamily =
  | 'upper'
  | 'lower'
  | 'full'
  | 'entryway'
  | 'pantry'
  | 'channel'
  | 'dummy'
  | 'induction'
  | 'unknown'

export interface ModuleClassification {
  moduleId: string
  family: ModuleFamily
  isDual: boolean
  isUpperCabinet: boolean
  isLowerCabinet: boolean
  isEntryway: boolean
  isShoeCabinet: boolean
  isDrawerCabinet: boolean
  isDoorLift: boolean
  isTopDown: boolean
  isChannel: boolean
  isDummy: boolean
  isInduction: boolean
  isPantry: boolean
  isFridge: boolean
}

export const classifyModule = (moduleId = ''): ModuleClassification => {
  const isDual = moduleId.startsWith('dual-') || moduleId.includes('dual-')
  const isUpperCabinet = moduleId.includes('upper-cabinet')
  const isLowerCabinet = moduleId.includes('lower-') || moduleId.includes('dual-lower-')
  const isEntryway = moduleId.includes('-entryway-')
  const isDrawerCabinet = moduleId.includes('drawer')
  const isDoorLift = moduleId.includes('lower-door-lift-')
  const isTopDown = moduleId.includes('lower-top-down-') || moduleId.includes('dual-lower-top-down-')
  const isChannel = moduleId.includes('channel') || moduleId.includes('찬넬')
  const isDummy = moduleId.includes('dummy')
  const isInduction = moduleId.includes('induction')
  const isPantry = moduleId.includes('pantry-cabinet')
  const isFridge = moduleId.includes('fridge-cabinet')
  // 도어분절 현관장(entryway-split)은 신발장 카테고리에 표시되지만 깊이 600 기본 → 신발장 자동 처리 제외
  const isEntrywaySplit = moduleId.includes('entryway-split')
  const isShoeCabinet = !isUpperCabinet && !isEntrywaySplit && (
    isEntryway ||
    moduleId.includes('-shelf-') ||
    moduleId.includes('-4drawer-shelf-') ||
    moduleId.includes('-2drawer-shelf-')
  )

  let family: ModuleFamily = 'unknown'
  if (isChannel) family = 'channel'
  else if (isDummy) family = 'dummy'
  else if (isInduction) family = 'induction'
  else if (isEntryway) family = 'entryway'
  else if (isPantry) family = 'pantry'
  else if (isUpperCabinet) family = 'upper'
  else if (isLowerCabinet) family = 'lower'
  else if (moduleId.includes('single-') || moduleId.includes('dual-')) family = 'full'

  return {
    moduleId,
    family,
    isDual,
    isUpperCabinet,
    isLowerCabinet,
    isEntryway,
    isShoeCabinet,
    isDrawerCabinet,
    isDoorLift,
    isTopDown,
    isChannel,
    isDummy,
    isInduction,
    isPantry,
    isFridge
  }
}
