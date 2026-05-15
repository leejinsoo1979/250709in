import { describe, expect, it } from 'vitest'
import { getExcludedPanelAliases, isPanelKeyExcluded } from '../ExcludedPanelsContext'

describe('ExcludedPanelsContext aliases', () => {
  it('라벨이 붙은 상단몰딩 패널을 top-frame으로 매칭한다', () => {
    const aliases = getExcludedPanelAliases('현관장 H 상단몰딩')

    expect(aliases).toContain('top-frame')
    expect(isPanelKeyExcluded(new Set(['module-1::현관장 H 상단몰딩']), 'module-1', 'top-frame')).toBe(true)
  })

  it('번호가 붙은 목찬넬 패널을 번호 없는 3D mesh 이름으로 매칭한다', () => {
    const excludedKeys = new Set([
      'module-1::목찬넬프레임수평(1)',
      'module-1::목찬넬프레임수직(1)'
    ])

    expect(isPanelKeyExcluded(excludedKeys, 'module-1', '목찬넬프레임수평')).toBe(true)
    expect(isPanelKeyExcluded(excludedKeys, 'module-1', '목찬넬프레임수직')).toBe(true)
  })
})
