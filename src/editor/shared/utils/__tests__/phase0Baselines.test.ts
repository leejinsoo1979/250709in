import { describe, expect, it } from 'vitest'
import {
  phase0DoorLeafBaselines,
  phase0ModuleClassificationBaselines,
  phase0ShelfInsetBaselines
} from '../__fixtures__/phase0Baselines'
import { resolveDoorLeafDimensions } from '../doorGeometryCalculator'
import { classifyModule } from '../moduleClassification'
import { resolveShelfFrontInsetMm } from '../shelfInsetCalculator'

describe('Phase 0 baseline fixtures', () => {
  it('module classification fixture는 현재 moduleId 판별 결과와 비교 가능하다', () => {
    phase0ModuleClassificationBaselines.forEach(({ moduleId, expected }) => {
      expect(classifyModule(moduleId)).toMatchObject(expected)
    })
  })

  it('door geometry fixture는 기존 도어 leaf W/H 기준과 비교 가능하다', () => {
    phase0DoorLeafBaselines.forEach(({ input, expected }) => {
      expect(resolveDoorLeafDimensions(input)).toMatchObject(expected)
    })
  })

  it('shelf inset fixture는 기존 선반 앞 들이기 기준과 비교 가능하다', () => {
    phase0ShelfInsetBaselines.forEach(({ moduleId, expectedInsetMm }) => {
      expect(resolveShelfFrontInsetMm({ moduleId })).toBe(expectedInsetMm)
    })
  })
})
