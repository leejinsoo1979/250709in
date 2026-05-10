import { describe, expect, it } from 'vitest'
import {
  calculateClothingRodGeometry,
  mmToClothingRodUnits,
  shouldHideClothingRodInView
} from '../clothingRodGeometry'

describe('clothingRodGeometry', () => {
  it('옷봉 브라켓/봉 고정 치수를 Three 단위로 잠근다', () => {
    const geometry = calculateClothingRodGeometry(mmToClothingRodUnits(600))

    expect(geometry.bracketWidth).toBeCloseTo(0.12, 8)
    expect(geometry.bracketDepth).toBeCloseTo(0.12, 8)
    expect(geometry.bracketHeight).toBeCloseTo(0.75, 8)
    expect(geometry.widthReduction).toBeCloseTo(0.005, 8)
    expect(geometry.rodDepth).toBeCloseTo(0.1, 8)
    expect(geometry.rodHeight).toBeCloseTo(0.3, 8)
    expect(geometry.rodZOffset).toBeCloseTo(-0.01, 8)
  })

  it('옷봉 길이는 좌우 브라켓 안쪽 기준으로 계산한다', () => {
    const innerWidth = mmToClothingRodUnits(600)
    const geometry = calculateClothingRodGeometry(innerWidth)

    expect(geometry.leftBracketX).toBeCloseTo(-2.935, 8)
    expect(geometry.rightBracketX).toBeCloseTo(2.935, 8)
    expect(geometry.rodStartX).toBeCloseTo(-2.875, 8)
    expect(geometry.rodEndX).toBeCloseTo(2.875, 8)
    expect(geometry.rodWidth).toBeCloseTo(5.75, 8)
    expect(geometry.rodCenterX).toBeCloseTo(0, 8)
  })

  it('옷봉은 평면도에서 숨기고 정면/좌측/3D에서는 유지한다', () => {
    expect(shouldHideClothingRodInView('2D', 'top')).toBe(true)
    expect(shouldHideClothingRodInView('2D', 'front')).toBe(false)
    expect(shouldHideClothingRodInView('2D', 'left')).toBe(false)
    expect(shouldHideClothingRodInView('3D', 'top')).toBe(false)
  })
})
