export const phase0ModuleClassificationBaselines = [
  {
    moduleId: 'upper-cabinet-shelf-500',
    expected: {
      family: 'upper',
      isUpperCabinet: true,
      isShoeCabinet: false
    }
  },
  {
    moduleId: 'single-entryway-h-500',
    expected: {
      family: 'entryway',
      isEntryway: true,
      isShoeCabinet: true
    }
  },
  {
    moduleId: 'dual-lower-induction-cabinet-1000',
    expected: {
      family: 'induction',
      isDual: true,
      isInduction: true
    }
  }
] as const

export const phase0DoorLeafBaselines = [
  {
    name: 'upper single door panel',
    input: {
      moduleId: 'upper-cabinet-basic',
      cabinetCategory: 'upper',
      doorWidthMm: 500,
      cabinetHeightMm: 785
    },
    expected: {
      leafCount: 1,
      leafWidthMm: 497,
      leafHeightMm: 808
    }
  },
  {
    name: 'dual lower door leaf width',
    input: {
      moduleId: 'dual-lower-half-cabinet-1000',
      cabinetCategory: 'lower',
      doorWidthMm: 1000,
      cabinetHeightMm: 710,
      isDualSlot: true
    },
    expected: {
      leafCount: 2,
      leafWidthMm: 497,
      leafHeightMm: 710
    }
  },
  {
    name: 'lower top-down fixed door height',
    input: {
      moduleId: 'lower-top-down-2tier',
      cabinetCategory: 'lower',
      doorWidthMm: 600,
      cabinetHeightMm: 710
    },
    expected: {
      leafCount: 1,
      leafWidthMm: 597,
      leafHeightMm: 710
    }
  }
] as const

export const phase0ShelfInsetBaselines = [
  {
    moduleId: 'upper-cabinet-shelf-500',
    expectedInsetMm: 30
  },
  {
    moduleId: 'single-entryway-h-500',
    expectedInsetMm: 30
  },
  {
    moduleId: 'single-2hanging-500',
    expectedInsetMm: 0
  }
] as const
