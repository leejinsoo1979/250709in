import { describe, expect, it } from 'vitest'
import type { SpaceInfo } from '@/store/core/spaceConfigStore'
import {
  calculateFurnitureDimensions,
  normalizeDrawingDimensionView,
  resolveDrawingDimensions,
  roundDrawingDimensionMm,
  type FurnitureDimension
} from '../furnitureDimensionCalculator'

const createFurnitureDimension = (
  overrides: Partial<FurnitureDimension> = {}
): FurnitureDimension => ({
  module: {
    id: 'module-1',
    moduleId: 'lower-cabinet-basic',
    position: { x: 0, y: 0, z: 0 },
    rotation: 0,
    hasDoor: true
  },
  moduleData: {
    id: 'lower-cabinet-basic',
    category: 'lower',
    dimensions: { width: 1100, height: 720, depth: 380 }
  },
  actualWidth: 1100,
  actualHeight: 720,
  actualDepth: 380,
  innerWidth: 1064,
  innerHeight: 684,
  innerDepth: 353,
  basicThickness: 18,
  backPanelThickness: 9,
  position: { x: 0, y: 0, z: 0 },
  isMultiSection: false,
  ...overrides
})

describe('drawing dimensions regression baselines', () => {
  it('치수값은 부동소수 오차를 정수 mm 기준으로 반올림한다', () => {
    expect(roundDrawingDimensionMm(1099.999999)).toBe(1100)
    expect(roundDrawingDimensionMm(1100.000001)).toBe(1100)
    expect(roundDrawingDimensionMm(1100.999999)).toBe(1101)
  })

  it('우측뷰 요청은 발주/export 정책에 따라 좌측뷰로 정규화한다', () => {
    expect(normalizeDrawingDimensionView('right')).toBe('left')
    expect(normalizeDrawingDimensionView('left')).toBe('left')
  })

  it('정면/평면/좌측 치수 세그먼트 기준을 같은 가구 치수에서 만든다', () => {
    const result = resolveDrawingDimensions({
      dimensions: [
        createFurnitureDimension({
          actualWidth: 1100.999999,
          actualHeight: 720,
          actualDepth: 379.999999
        })
      ],
      views: ['front', 'top', 'left'],
      includeDoor: false
    })

    expect(result.front.map(segment => [segment.axis, segment.valueMm])).toEqual([
      ['width', 1101],
      ['height', 720]
    ])
    expect(result.top.map(segment => [segment.axis, segment.valueMm])).toEqual([
      ['width', 1101],
      ['depth', 380]
    ])
    expect(result.left.map(segment => [segment.axis, segment.valueMm])).toEqual([
      ['depth', 380],
      ['height', 720]
    ])
    expect(result.door).toEqual([])
  })

  it('우측뷰 요청이 들어와도 right 버킷을 만들지 않고 left 버킷만 채운다', () => {
    const result = resolveDrawingDimensions({
      dimensions: [createFurnitureDimension()],
      views: ['right'],
      includeDoor: false
    })

    expect(result.left.map(segment => segment.axis)).toEqual(['depth', 'height'])
    expect(result.front).toEqual([])
    expect(result.top).toEqual([])
    expect(result.door).toEqual([])
    expect(result.warnings).toEqual([
      'right-side drawing request normalized to left-side export policy'
    ])
  })

  it('듀얼 도어 도면 폭은 전체폭 합산값이 아니라 좌우 leaf 폭으로 고정한다', () => {
    const result = resolveDrawingDimensions({
      dimensions: [
        createFurnitureDimension({
          module: {
            id: 'dual-module',
            moduleId: 'dual-lower-cabinet-basic',
            position: { x: 0, y: 0, z: 0 },
            rotation: 0,
            hasDoor: true,
            isDualSlot: true
          },
          moduleData: {
            id: 'dual-lower-cabinet-basic',
            category: 'lower',
            dimensions: { width: 1000, height: 720, depth: 580 }
          },
          actualWidth: 1000,
          actualHeight: 720,
          actualDepth: 580
        })
      ],
      views: ['door']
    })

    expect(result.door.map(segment => [segment.id, segment.axis, segment.valueMm])).toEqual([
      ['dual-module:door:left:width', 'door-width', 497],
      ['dual-module:door:left:height', 'door-height', 720],
      ['dual-module:door:right:width', 'door-width', 497],
      ['dual-module:door:right:height', 'door-height', 720]
    ])
  })

  it('공통 치수 계산기는 자유배치 W/H/D 값을 우선 사용한다', () => {
    const dimensions = calculateFurnitureDimensions([
      {
        id: 'free-entryway',
        moduleId: 'single-entryway-h-500',
        position: { x: 0, y: 0, z: 0 },
        rotation: 0,
        hasDoor: true,
        isFreePlacement: true,
        freeWidth: 620,
        freeHeight: 1900,
        freeDepth: 380
      }
    ], {
      width: 2700,
      height: 2400,
      depth: 650,
      _tempSlotWidths: [500]
    } as SpaceInfo & { _tempSlotWidths: number[] })

    expect(dimensions).toHaveLength(1)
    expect(dimensions[0].actualWidth).toBe(620)
    expect(dimensions[0].actualHeight).toBe(1900)
    expect(dimensions[0].actualDepth).toBe(380)
  })
})
