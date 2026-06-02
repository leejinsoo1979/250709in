import { describe, expect, it, vi } from 'vitest'
import { getModuleById } from '@/data/modules'
import { placeFurnitureFree } from '../usePlaceFurnitureFree'
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry'
import {
  getCategoryDefaultFurnitureDepth,
  getDefaultFurnitureDepth,
  isShoeCabinetModuleId,
  resolveInitialFurnitureDepth
} from '@/editor/shared/utils/furnitureDepthDefaults'
import type { SpaceInfo } from '@/store/core/spaceConfigStore'

vi.mock('@/store/core/myCabinetStore', () => ({
  useMyCabinetStore: {
    getState: () => ({
      editingCabinetId: null,
      setPendingPlacement: vi.fn()
    })
  }
}))

vi.mock('@/store/core/furnitureStore', () => ({
  useFurnitureStore: {
    getState: () => ({
      pendingCustomConfig: null,
      setPendingCustomConfig: vi.fn()
    })
  }
}))

const createSpaceInfo = (depth = 600): SpaceInfo => ({
  width: 2400,
  height: 2400,
  depth,
  installType: 'built-in',
  surroundType: 'surround',
  wallConfig: { left: true, right: true },
  hasFloorFinish: false,
  baseConfig: { type: 'floor', height: 65 },
  frameSize: { left: 50, right: 50, top: 50 },
  materialConfig: {
    interiorColor: '#FFFFFF',
    doorColor: '#E0E0E0'
  }
})

describe('entryway shoe cabinet depth regression', () => {
  it('신발장 판별에서 upper-cabinet-shelf는 신발장으로 오인하지 않는다', () => {
    expect(isShoeCabinetModuleId('single-entryway-h-500')).toBe(true)
    expect(isShoeCabinetModuleId('single-shelf-500')).toBe(true)
    expect(isShoeCabinetModuleId('upper-cabinet-shelf-500')).toBe(false)
  })

  it('카테고리 기본 깊이는 상부장 300mm, 신발장 380mm를 반환한다', () => {
    expect(getCategoryDefaultFurnitureDepth(600, 'upper-cabinet-shelf-500')).toBe(300)
    expect(getCategoryDefaultFurnitureDepth(600, 'single-entryway-h-500')).toBe(380)
    expect(getCategoryDefaultFurnitureDepth(600, 'single-2drawer-hanging-500')).toBeUndefined()
  })

  it('현관장 H 템플릿 깊이는 생성 기준부터 380mm이다', () => {
    const spaceInfo = createSpaceInfo()
    const internalSpace = calculateInternalSpace(spaceInfo)
    const moduleData = getModuleById('single-entryway-h-500', internalSpace, spaceInfo)

    expect(moduleData).toBeDefined()
    expect(moduleData?.dimensions.depth).toBe(380)
    expect(moduleData?.defaultDepth).toBe(380)
  })

  it('슬롯 배치 기본 깊이는 현관장 H를 400이 아니라 380으로 고정한다', () => {
    const spaceInfo = createSpaceInfo()
    const internalSpace = calculateInternalSpace(spaceInfo)
    const moduleData = getModuleById('single-entryway-h-500', internalSpace, spaceInfo)

    expect(getDefaultFurnitureDepth(spaceInfo, moduleData)).toBe(380)
  })

  it('공간 깊이가 380보다 작으면 현관장 H 기본 깊이는 공간 깊이를 넘지 않는다', () => {
    const spaceInfo = createSpaceInfo(360)
    const internalSpace = calculateInternalSpace(spaceInfo)
    const moduleData = getModuleById('single-entryway-h-500', internalSpace, spaceInfo)

    expect(getDefaultFurnitureDepth(spaceInfo, moduleData)).toBe(360)
  })

  it('자유배치 초기 깊이 결정도 현관장 H를 400이 아니라 380으로 고정한다', () => {
    const spaceInfo = createSpaceInfo()

    expect(resolveInitialFurnitureDepth(spaceInfo, 'single-entryway-h-500', 400)).toBe(380)
  })

  it('자유배치 생성 결과의 freeDepth도 현관장 H를 380mm로 고정한다', () => {
    const spaceInfo = createSpaceInfo()
    const internalSpace = calculateInternalSpace(spaceInfo)
    const moduleData = getModuleById('single-entryway-h-500', internalSpace, spaceInfo)

    expect(moduleData).toBeDefined()

    const result = placeFurnitureFree({
      moduleId: 'single-entryway-h-500',
      xPositionMM: 0,
      spaceInfo,
      dimensions: {
        width: moduleData?.dimensions.width ?? 500,
        height: moduleData?.dimensions.height ?? 2200,
        depth: 400
      },
      existingModules: [],
      moduleData,
      skipCollisionCheck: true
    })

    expect(result.success).toBe(true)
    expect(result.module?.freeDepth).toBe(380)
    expect(result.module?.moduleWidth).toBe(moduleData?.dimensions.width)
  })

  it('자유배치 생성 시 걸레받이 옵셋과 갭을 공간 기본값에서 복사한다', () => {
    const spaceInfo = {
      ...createSpaceInfo(),
      baseConfig: { type: 'floor' as const, height: 65, offset: 80, gap: 12 }
    }
    const internalSpace = calculateInternalSpace(spaceInfo)
    const moduleData = getModuleById('single-entryway-h-500', internalSpace, spaceInfo)

    expect(moduleData).toBeDefined()

    const result = placeFurnitureFree({
      moduleId: 'single-entryway-h-500',
      xPositionMM: 0,
      spaceInfo,
      dimensions: {
        width: moduleData?.dimensions.width ?? 500,
        height: moduleData?.dimensions.height ?? 2200,
        depth: moduleData?.dimensions.depth ?? 380
      },
      existingModules: [],
      moduleData,
      skipCollisionCheck: true
    })

    expect(result.success).toBe(true)
    expect(result.module?.baseFrameOffset).toBe(80)
    expect(result.module?.baseFrameGap).toBe(12)
  })

  it('자유배치 하부장은 공간 옵셋이 없으면 걸레받이 기본 옵셋 65mm를 사용한다', () => {
    const spaceInfo = createSpaceInfo()
    const internalSpace = calculateInternalSpace(spaceInfo)
    const moduleData = getModuleById('lower-half-cabinet-500', internalSpace, spaceInfo)

    expect(moduleData).toBeDefined()

    const result = placeFurnitureFree({
      moduleId: 'lower-half-cabinet-500',
      xPositionMM: 0,
      spaceInfo,
      dimensions: {
        width: moduleData?.dimensions.width ?? 500,
        height: moduleData?.dimensions.height ?? 805,
        depth: moduleData?.dimensions.depth ?? 580
      },
      existingModules: [],
      moduleData,
      skipCollisionCheck: true
    })

    expect(result.success).toBe(true)
    expect(result.module?.baseFrameOffset).toBe(65)
  })
})
