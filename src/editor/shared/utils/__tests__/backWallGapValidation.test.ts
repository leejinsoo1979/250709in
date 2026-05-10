import { describe, expect, it } from 'vitest'
import {
  clampBackWallGapMm,
  parseBackWallGapInput,
  stepBackWallGapMm
} from '../backWallGapValidation'

describe('backWallGapValidation', () => {
  it('뒷벽 이격은 음수 입력을 허용한다', () => {
    expect(parseBackWallGapInput('-120')).toBe(-120)
    expect(parseBackWallGapInput('80')).toBe(80)
  })

  it('입력 중 단독 minus 문자는 아직 확정값으로 처리하지 않는다', () => {
    expect(parseBackWallGapInput('-')).toBeNull()
  })

  it('범위 밖 값은 -500mm에서 500mm 사이로 제한한다', () => {
    expect(clampBackWallGapMm(-999)).toBe(-500)
    expect(clampBackWallGapMm(999)).toBe(500)
  })

  it('화살표 증감도 음수 범위를 유지한다', () => {
    expect(stepBackWallGapMm(0, -1)).toBe(-1)
    expect(stepBackWallGapMm(-500, -1)).toBe(-500)
    expect(stepBackWallGapMm(500, 1)).toBe(500)
  })
})
