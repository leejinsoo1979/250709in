import { describe, expect, it } from 'vitest'
import {
  resolveDoorHeightDimensionSides,
  shouldRenderDoorDimensionGuides
} from '../doorDimensionGuides'

describe('doorDimensionGuides', () => {
  it('가장 왼쪽 가구에만 좌측 높이 치수를 허용한다', () => {
    const modules = [
      { id: 'middle', x: 0, index: 1 },
      { id: 'left', x: -5, index: 0 },
      { id: 'right', x: 5, index: 2 }
    ]

    expect(resolveDoorHeightDimensionSides(modules, 'left')).toEqual({ left: true, right: false })
  })

  it('맨 우측 슬롯 가구에만 우측 높이 치수를 허용한다', () => {
    const modules = [
      { id: 'left', x: -5, index: 0 },
      { id: 'right', x: 5, index: 1, isRightmostSlot: true }
    ]

    expect(resolveDoorHeightDimensionSides(modules, 'right')).toEqual({ left: false, right: true })
  })

  it('단일 가구도 우측 슬롯이 아니면 좌측 높이 치수만 허용한다', () => {
    expect(resolveDoorHeightDimensionSides([{ id: 'only', x: 0, index: 0 }], 'only')).toEqual({
      left: true,
      right: false
    })
  })

  it('단일 가구라도 맨 우측 슬롯이면 우측 높이 치수만 허용한다', () => {
    expect(resolveDoorHeightDimensionSides([{ id: 'only', x: 0, index: 0, isRightmostSlot: true }], 'only')).toEqual({
      left: false,
      right: true
    })
  })

  it('중간 가구는 높이 치수를 표시하지 않는다', () => {
    const modules = [
      { id: 'left', x: -5, index: 0, slotIndex: 0 },
      { id: 'middle', x: 0, index: 1, slotIndex: 1 },
      { id: 'right', x: 5, index: 2, slotIndex: 2, isRightmostSlot: true }
    ]

    expect(resolveDoorHeightDimensionSides(modules, 'middle')).toEqual({ left: false, right: false })
  })

  it('같은 왼쪽 슬롯의 상부장과 하부장은 모두 좌측 높이 치수를 허용한다', () => {
    const modules = [
      { id: 'lower', x: -5, index: 0, slotIndex: 0 },
      { id: 'upper', x: -5, index: 1, slotIndex: 0 },
      { id: 'right', x: 5, index: 2, slotIndex: 2, isRightmostSlot: true }
    ]

    expect(resolveDoorHeightDimensionSides(modules, 'lower')).toEqual({ left: true, right: false })
    expect(resolveDoorHeightDimensionSides(modules, 'upper')).toEqual({ left: true, right: false })
  })

  it('도어 치수 가이드는 3D와 2D 정면뷰에서 렌더링한다', () => {
    expect(shouldRenderDoorDimensionGuides(true, false, '2D', 'front')).toBe(true)
    expect(shouldRenderDoorDimensionGuides(true, false, '3D', 'front')).toBe(true)
    expect(shouldRenderDoorDimensionGuides(true, false, '2D', 'left')).toBe(false)
    expect(shouldRenderDoorDimensionGuides(false, false, '2D', 'front')).toBe(false)
    expect(shouldRenderDoorDimensionGuides(true, true, '2D', 'front')).toBe(false)
  })
})
