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

  it('키큰장찬넬 패널 목록 이름을 Insert 3D mesh 이름으로 매칭한다', () => {
    expect(isPanelKeyExcluded(new Set(['module-1::키큰장찬넬 전면프레임']), 'module-1', 'Insert전면프레임-마감판')).toBe(true)
    expect(isPanelKeyExcluded(new Set(['module-1::키큰장찬넬 좌EP']), 'module-1', 'Insert좌EP-마감판')).toBe(true)
    expect(isPanelKeyExcluded(new Set(['module-1::키큰장찬넬 우EP']), 'module-1', 'Insert우EP-마감판')).toBe(true)
    expect(isPanelKeyExcluded(new Set(['module-1::상단몰딩']), 'module-1', 'Insert상단프레임')).toBe(true)
    expect(isPanelKeyExcluded(new Set(['module-1::걸래받이']), 'module-1', 'Insert걸레받이')).toBe(true)
  })

  it('주방 키큰장 N섹션 측판 이름을 기존 상하 표기와 번호 표기 양쪽으로 매칭한다', () => {
    expect(isPanelKeyExcluded(new Set(['module-1::(하)좌측']), 'module-1', '좌측판1')).toBe(true)
    expect(isPanelKeyExcluded(new Set(['module-1::(하)우측']), 'module-1', '우측판1')).toBe(true)
    expect(isPanelKeyExcluded(new Set(['module-1::(상)좌측']), 'module-1', '좌측판2')).toBe(true)
    expect(isPanelKeyExcluded(new Set(['module-1::(상)좌측']), 'module-1', '좌측판3')).toBe(true)
    expect(isPanelKeyExcluded(new Set(['module-1::좌측판3']), 'module-1', '(상)좌측')).toBe(true)
  })

  it('주방 키큰장 N섹션 백패널과 보강대를 기존 상하 표기와 단수 표기로 매칭한다', () => {
    expect(isPanelKeyExcluded(new Set(['module-1::(하)백패널']), 'module-1', '(1단)백패널')).toBe(true)
    expect(isPanelKeyExcluded(new Set(['module-1::(상)백패널']), 'module-1', '(2단)백패널')).toBe(true)
    expect(isPanelKeyExcluded(new Set(['module-1::(상)후면 보강대 1']), 'module-1', '(2단)보강대 1')).toBe(true)
    expect(isPanelKeyExcluded(new Set(['module-1::(1단)보강대 3']), 'module-1', '(하)보강대 3')).toBe(true)
  })

  it('스타일러장 좌우 백패널과 번호 없는 보강대 mesh 이름을 매칭한다', () => {
    expect(isPanelKeyExcluded(new Set(['module-1::(하)백패널']), 'module-1', '좌(하)백패널')).toBe(true)
    expect(isPanelKeyExcluded(new Set(['module-1::좌(상)백패널']), 'module-1', '(상)백패널')).toBe(true)
    expect(isPanelKeyExcluded(new Set(['module-1::우후면 보강대 1']), 'module-1', '우보강대')).toBe(true)
  })

  it('바지걸이장 후면 보강대 번호 표기를 번호 없는 3D mesh 이름으로 매칭한다', () => {
    expect(isPanelKeyExcluded(new Set(['module-1::(하)후면 보강대 1']), 'module-1', '(하)보강대')).toBe(true)
    expect(isPanelKeyExcluded(new Set(['module-1::(상)후면 보강대 2']), 'module-1', '(상)보강대')).toBe(true)
    expect(isPanelKeyExcluded(new Set(['module-1::(상)보강대']), 'module-1', '(2단)보강대 1')).toBe(true)
  })
})
