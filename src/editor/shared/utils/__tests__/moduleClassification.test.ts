import { describe, expect, it } from 'vitest'
import { classifyModule } from '../moduleClassification'

describe('moduleClassification', () => {
  it('상부장과 신발장 계열을 구분한다', () => {
    expect(classifyModule('upper-cabinet-shelf-500')).toMatchObject({
      family: 'upper',
      isUpperCabinet: true,
      isShoeCabinet: false
    })

    expect(classifyModule('single-entryway-h-500')).toMatchObject({
      family: 'entryway',
      isEntryway: true,
      isShoeCabinet: true
    })
  })

  it('하부장 주요 변형을 한 곳에서 판별한다', () => {
    expect(classifyModule('lower-top-down-2tier-500')).toMatchObject({
      family: 'lower',
      isLowerCabinet: true,
      isTopDown: true
    })

    expect(classifyModule('dual-lower-induction-cabinet-1000')).toMatchObject({
      family: 'induction',
      isDual: true,
      isInduction: true
    })
  })

  it('팬트리/더미/찬넬 계열 family를 고정한다', () => {
    expect(classifyModule('single-pantry-cabinet-600').family).toBe('pantry')
    expect(classifyModule('dummy-panel-100').family).toBe('dummy')
    expect(classifyModule('wood-channel-600').family).toBe('channel')
  })
})
