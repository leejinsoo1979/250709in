import { describe, expect, it } from 'vitest'
import type { PlacedModule } from '@/editor/shared/furniture/types'
import type { SpaceInfo } from '@/store/core/spaceConfigStore'
import { resolveDoorOuterOpenSides } from '../doorOuterGap'

const createSpaceInfo = (overrides: Partial<SpaceInfo> = {}): SpaceInfo => ({
  width: 1000,
  height: 2400,
  depth: 650,
  installType: 'freestanding',
  wallConfig: {
    left: false,
    right: false
  },
  surroundType: 'no-surround',
  frameSize: {
    left: 0,
    right: 0,
    top: 0
  },
  gapConfig: {
    left: 0,
    right: 0
  },
  baseConfig: {
    type: 'floor',
    height: 65,
    placementType: 'ground'
  },
  materialConfig: {},
  ...overrides
})

const createFreeModule = (overrides: Partial<PlacedModule> = {}): PlacedModule => ({
  id: 'free-module-1',
  moduleId: 'lower-half-cabinet-500',
  position: {
    x: -2.5,
    y: 0,
    z: 0
  },
  rotation: 0,
  hasDoor: true,
  isFreePlacement: true,
  freeWidth: 500,
  ...overrides
})

describe('resolveDoorOuterOpenSides', () => {
  it('자유배치는 로컬 slotCenterX 대신 저장된 position.x로 트인 좌측을 판정한다', () => {
    const result = resolveDoorOuterOpenSides({
      spaceInfo: createSpaceInfo(),
      placedModule: createFreeModule(),
      moduleWidthMm: 500,
      slotCenterX: 0
    })

    expect(result).toEqual({
      left: true,
      right: false
    })
  })

  it('자유배치 가구가 우측 트인 끝에 붙으면 우측만 1.5mm 보정 대상으로 판정한다', () => {
    const result = resolveDoorOuterOpenSides({
      spaceInfo: createSpaceInfo({
        installType: 'semistanding',
        wallConfig: {
          left: true,
          right: false
        }
      }),
      placedModule: createFreeModule({
        position: {
          x: 2.5,
          y: 0,
          z: 0
        }
      }),
      moduleWidthMm: 500,
      slotCenterX: 0
    })

    expect(result).toEqual({
      left: false,
      right: true
    })
  })
})
