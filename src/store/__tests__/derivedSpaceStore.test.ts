import { describe, it, expect, beforeEach } from 'vitest'
import { useDerivedSpaceStore } from '../derivedSpaceStore'
import { useSpaceConfigStore, SpaceInfo } from '../core/spaceConfigStore'

// 테스트용 기본 spaceInfo
const createTestSpaceInfo = (overrides: Partial<SpaceInfo> = {}): SpaceInfo => ({
  width: 3600,
  height: 2400,
  depth: 580,
  installType: 'built-in' as const,
  wallConfig: {
    left: true,
    right: true,
  },
  hasFloorFinish: false,
  floorFinish: {
    height: 50
  },
  surroundType: 'surround' as const,
  frameSize: {
    left: 50,
    right: 50,
    top: 50
  },
  baseConfig: {
    type: 'floor',
    height: 65,
    placementType: 'ground'
  },
  materialConfig: {
    interiorColor: '#FFFFFF',
          doorColor: '#000000'
  },
  ...overrides
})

describe('DerivedSpaceStore', () => {
  beforeEach(() => {
    // 각 테스트 전에 스토어들 초기화
    useSpaceConfigStore.getState().resetAll()
    useDerivedSpaceStore.getState().reset()
  })

  describe('초기 상태', () => {
    it('기본값들이 올바르게 설정되어야 한다', () => {
      const state = useDerivedSpaceStore.getState()
      
      expect(state.internalWidth).toBe(0)
      expect(state.columnCount).toBe(0)
      expect(state.columnWidth).toBe(0)
      expect(state.internalHeight).toBe(0)
      expect(state.internalDepth).toBe(0)
      expect(state.columnPositions).toEqual([])
      expect(state.isCalculated).toBe(false)
    })
  })

  describe('spaceInfo로부터 파생 상태 계산', () => {
    it('spaceInfo가 주어지면 모든 파생 데이터를 한 번에 계산해야 한다', () => {
      const spaceInfo = createTestSpaceInfo({
        width: 3600,
        surroundType: 'surround',
        frameSize: { left: 50, right: 50, top: 50 }
      })
      
      const store = useDerivedSpaceStore.getState()
      store.recalculateFromSpaceInfo(spaceInfo)
      
      const state = useDerivedSpaceStore.getState()
      
      // 기본 계산 검증
      expect(state.internalWidth).toBe(3500) // 3600 - 50 - 50
      expect(state.columnCount).toBeGreaterThan(0)
      expect(state.columnWidth).toBeGreaterThan(0)
      expect(state.internalHeight).toBeGreaterThan(0)
      expect(state.internalDepth).toBe(580)
      expect(state.columnPositions).toHaveLength(state.columnCount)
      expect(state.isCalculated).toBe(true)
    })

    it('동일한 spaceInfo에 대해 일관된 결과를 반환해야 한다', () => {
      const spaceInfo = createTestSpaceInfo()
      const store = useDerivedSpaceStore.getState()
      
      store.recalculateFromSpaceInfo(spaceInfo)
      const result1 = { ...useDerivedSpaceStore.getState() }
      
      store.recalculateFromSpaceInfo(spaceInfo)
      const result2 = { ...useDerivedSpaceStore.getState() }
      
      // 함수 제외하고 데이터만 비교
      const data1 = {
        internalWidth: result1.internalWidth,
        columnCount: result1.columnCount,
        columnWidth: result1.columnWidth,
        internalHeight: result1.internalHeight,
        internalDepth: result1.internalDepth,
        columnPositions: result1.columnPositions,
        isCalculated: result1.isCalculated
      }
      const data2 = {
        internalWidth: result2.internalWidth,
        columnCount: result2.columnCount,
        columnWidth: result2.columnWidth,
        internalHeight: result2.internalHeight,
        internalDepth: result2.internalDepth,
        columnPositions: result2.columnPositions,
        isCalculated: result2.isCalculated
      }
      
      expect(data1).toEqual(data2)
    })

    it('폭 변경 시 관련 파생 데이터가 모두 업데이트되어야 한다', () => {
      const spaceInfo1 = createTestSpaceInfo({ width: 3600 })
      const spaceInfo2 = createTestSpaceInfo({ width: 2400 })
      
      const store = useDerivedSpaceStore.getState()
      
      store.recalculateFromSpaceInfo(spaceInfo1)
      const state1 = { ...useDerivedSpaceStore.getState() }
      
      store.recalculateFromSpaceInfo(spaceInfo2)
      const state2 = { ...useDerivedSpaceStore.getState() }
      
      // 폭이 작아지면 내부 폭도 작아져야 함
      expect(state2.internalWidth).toBeLessThan(state1.internalWidth)
      
      // 컬럼 수도 줄어들 수 있음
      expect(state2.columnCount).toBeLessThanOrEqual(state1.columnCount)
      
      // 컬럼 위치 배열 길이도 컬럼 수에 맞춰 변경
      expect(state2.columnPositions).toHaveLength(state2.columnCount)
    })
  })

  describe('사용자 지정 컬럼 수 처리', () => {
    it('customColumnCount가 있으면 우선적으로 사용해야 한다', () => {
      const spaceInfo = createTestSpaceInfo({
        width: 3600,
        customColumnCount: 7
      })
      
      const store = useDerivedSpaceStore.getState()
      store.recalculateFromSpaceInfo(spaceInfo)
      
      const state = useDerivedSpaceStore.getState()
      expect(state.columnCount).toBe(7)
      expect(state.columnPositions).toHaveLength(7)
    })

    it('customColumnCount가 없으면 자동 계산을 사용해야 한다', () => {
      const spaceInfo = createTestSpaceInfo({
        width: 3600,
        customColumnCount: undefined
      })
      
      const store = useDerivedSpaceStore.getState()
      store.recalculateFromSpaceInfo(spaceInfo)
      
      const state = useDerivedSpaceStore.getState()
      // 자동 계산된 컬럼 수 (정확한 값은 계산 로직에 따름)
      expect(state.columnCount).toBeGreaterThan(0)
      expect(state.columnCount).not.toBe(7) // 사용자 지정값과 다름
    })
  })

  describe('성능 최적화', () => {
    it('대량 계산이 빠르게 처리되어야 한다', () => {
      const spaceInfo = createTestSpaceInfo()
      const store = useDerivedSpaceStore.getState()
      
      const startTime = performance.now()
      
      // 100번 계산
      for (let i = 0; i < 100; i++) {
        store.recalculateFromSpaceInfo(spaceInfo)
      }
      
      const endTime = performance.now()
      const duration = endTime - startTime
      
      // 100번 계산이 50ms 이내에 완료되어야 함
      expect(duration).toBeLessThan(50)
    })

    it('메모리 누수가 없어야 한다', () => {
      const spaceInfo = createTestSpaceInfo()
      const store = useDerivedSpaceStore.getState()
      
      // 초기 상태 확인
      const initialState = { ...useDerivedSpaceStore.getState() }
      
      // 여러 번 계산 후 리셋
      for (let i = 0; i < 10; i++) {
        store.recalculateFromSpaceInfo(spaceInfo)
      }
      
      store.reset()
      const resetState = { ...useDerivedSpaceStore.getState() }
      
      // 리셋 후 초기 상태와 동일해야 함
      expect(resetState.internalWidth).toBe(initialState.internalWidth)
      expect(resetState.columnCount).toBe(initialState.columnCount)
      expect(resetState.isCalculated).toBe(initialState.isCalculated)
    })
  })

  describe('에러 처리', () => {
    it('잘못된 spaceInfo가 주어져도 에러가 발생하지 않아야 한다', () => {
      const invalidSpaceInfo = createTestSpaceInfo({
        width: -100, // 음수 폭
        height: 0    // 0 높이
      })
      
      const store = useDerivedSpaceStore.getState()
      
      expect(() => {
        store.recalculateFromSpaceInfo(invalidSpaceInfo)
      }).not.toThrow()
      
      const state = useDerivedSpaceStore.getState()
      // 최소한의 유효한 값들이 설정되어야 함
      expect(state.internalWidth).toBeGreaterThanOrEqual(0)
      expect(state.columnCount).toBeGreaterThan(0)
    })
  })

  describe('기존 editorStore와의 통합', () => {
    it('spaceConfigStore의 spaceInfo를 수동으로 전달해서 계산할 수 있어야 한다', () => {
      const spaceConfigStore = useSpaceConfigStore.getState()
      const derivedStore = useDerivedSpaceStore.getState()
      
      // 초기 상태
      expect(derivedStore.isCalculated).toBe(false)
      
      // spaceConfigStore의 spaceInfo 변경
      spaceConfigStore.setSpaceInfo({ width: 2700 })
      
      // 수동으로 파생 상태 계산
      derivedStore.recalculateFromSpaceInfo(spaceConfigStore.spaceInfo)
      
      // 계산 후 상태 확인
      const newState = useDerivedSpaceStore.getState()
      
      expect(newState.isCalculated).toBe(true)
      expect(newState.internalWidth).toBeGreaterThan(0)
    })
  })
}) 