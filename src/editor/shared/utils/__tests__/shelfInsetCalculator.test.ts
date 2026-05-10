import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SHELF_FRONT_INSET_MM,
  resolveCustomShelfFrontInsetMm,
  resolveShelfFrontInsetMm
} from '../shelfInsetCalculator'

describe('shelfInsetCalculator', () => {
  it('현재 렌더/패널리스트 기준의 상부장 선반 앞 들이기 30mm를 고정한다', () => {
    expect(resolveShelfFrontInsetMm({ moduleId: 'upper-cabinet-shelf-500' }))
      .toBe(DEFAULT_SHELF_FRONT_INSET_MM)
    expect(resolveShelfFrontInsetMm({ cabinetCategory: 'upper' }))
      .toBe(DEFAULT_SHELF_FRONT_INSET_MM)
  })

  it('현관장/선반장 계열 선반 앞 들이기 30mm를 고정한다', () => {
    expect(resolveShelfFrontInsetMm({ moduleId: 'single-entryway-h-500' }))
      .toBe(DEFAULT_SHELF_FRONT_INSET_MM)
    expect(resolveShelfFrontInsetMm({ moduleId: 'single-4drawer-shelf-500' }))
      .toBe(DEFAULT_SHELF_FRONT_INSET_MM)
  })

  it('팬트리/인출장/일반 냉장고장 계열의 기존 30mm 들이기 기준을 유지한다', () => {
    expect(resolveShelfFrontInsetMm({ moduleId: 'single-pull-out-cabinet-600' }))
      .toBe(DEFAULT_SHELF_FRONT_INSET_MM)
    expect(resolveShelfFrontInsetMm({ moduleId: 'single-pantry-cabinet-600' }))
      .toBe(DEFAULT_SHELF_FRONT_INSET_MM)
    expect(resolveShelfFrontInsetMm({ moduleId: 'single-fridge-cabinet-600' }))
      .toBe(DEFAULT_SHELF_FRONT_INSET_MM)
    expect(resolveShelfFrontInsetMm({ moduleId: 'built-in-fridge-582' }))
      .toBe(0)
  })

  it('하부 반통/싱크/인덕션/상판내림 half 계열 기준을 고정한다', () => {
    expect(resolveShelfFrontInsetMm({ moduleId: 'lower-half-cabinet-500' }))
      .toBe(DEFAULT_SHELF_FRONT_INSET_MM)
    expect(resolveShelfFrontInsetMm({ moduleId: 'dual-lower-induction-cabinet-1000' }))
      .toBe(DEFAULT_SHELF_FRONT_INSET_MM)
    expect(resolveShelfFrontInsetMm({ moduleId: 'lower-top-down-half-500' }))
      .toBe(DEFAULT_SHELF_FRONT_INSET_MM)
  })

  it('명시 입력값은 기존 특수 모듈 기본값보다 우선한다', () => {
    expect(resolveShelfFrontInsetMm({
      moduleId: 'upper-cabinet-shelf-500',
      explicitInsetMm: 12
    })).toBe(12)
  })

  it('커스텀 선반은 고정선반 0mm, 다보선반 기본 30mm와 명시값을 유지한다', () => {
    expect(resolveCustomShelfFrontInsetMm({ shelfMethod: 'fixed' })).toBe(0)
    expect(resolveCustomShelfFrontInsetMm({ shelfMethod: 'dowel' }))
      .toBe(DEFAULT_SHELF_FRONT_INSET_MM)
    expect(resolveCustomShelfFrontInsetMm({
      shelfMethod: 'dowel',
      explicitInsetMm: 18
    })).toBe(18)
  })

  it('기준이 없는 일반 옷장은 임의 들이기 값을 만들지 않는다', () => {
    expect(resolveShelfFrontInsetMm({ moduleId: 'single-2hanging-500' })).toBe(0)
  })
})
