import { describe, it, expect } from 'vitest'
import { calculateInternalWidth, calculateSpaceIndexing } from '../indexing'
import { calculateInternalSpace } from '../../viewer3d/utils/geometry'
import { SpaceInfo } from '@/store/core/spaceConfigStore'

// 테스트용 기본 spaceInfo
const createBasicSpaceInfo = (overrides: Partial<SpaceInfo> = {}): SpaceInfo => ({
  width: 3600,
  height: 2400,
  depth: 580,
  installType: 'built-in',
  wallConfig: {
    left: true,
    right: true,
  },
  hasFloorFinish: false,
  floorFinish: {
    height: 50
  },
  
  surroundType: 'surround',
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

describe('파생 상태 계산 로직', () => {
  describe('calculateInternalWidth', () => {
    it('서라운드 모드에서 좌우 프레임을 제외한 내부 폭을 계산해야 한다', () => {
      const spaceInfo = createBasicSpaceInfo({
        width: 3600,
        surroundType: 'surround',
        frameSize: { left: 50, right: 50, top: 50 }
      })
      
      const internalWidth = calculateInternalWidth(spaceInfo)
      
      // 3600 - 50(좌) - 50(우) = 3500
      expect(internalWidth).toBe(3500)
    })

    it('노서라운드 모드에서 이격거리를 제외한 내부 폭을 계산해야 한다', () => {
      const spaceInfo = createBasicSpaceInfo({
        width: 3600,
        surroundType: 'no-surround',
        gapConfig: { left: 3, right: 3 },
        installType: 'built-in'
      })

      const internalWidth = calculateInternalWidth(spaceInfo)
      
      // 3600 - 3(좌) - 3(우) = 3594
      expect(internalWidth).toBe(3594)
    })

    it('폭 변경 시 내부 폭이 올바르게 재계산되어야 한다', () => {
      const spaceInfo1 = createBasicSpaceInfo({ width: 3600 })
      const spaceInfo2 = createBasicSpaceInfo({ width: 2700 })
      
      const internalWidth1 = calculateInternalWidth(spaceInfo1)
      const internalWidth2 = calculateInternalWidth(spaceInfo2)
      
      expect(internalWidth2).toBe(internalWidth1 - 900) // 폭 차이만큼 감소
    })
  })

  describe('calculateSpaceIndexing', () => {
    it('내부 폭에 따라 컬럼 수가 올바르게 계산되어야 한다', () => {
      const spaceInfo = createBasicSpaceInfo({
        width: 3600,
        surroundType: 'surround',
        frameSize: { left: 50, right: 50, top: 50 }
      })
      
      const indexing = calculateSpaceIndexing(spaceInfo)
      
      expect(indexing.columnCount).toBeGreaterThan(0)
      expect(indexing.columnWidth).toBeGreaterThan(0)
      expect(indexing.columnPositions).toHaveLength(indexing.columnCount)
    })

    it('폭이 줄어들면 컬럼 수도 줄어들어야 한다', () => {
      const spaceInfo1 = createBasicSpaceInfo({ width: 3600 })
      const spaceInfo2 = createBasicSpaceInfo({ width: 2400 })
      
      const indexing1 = calculateSpaceIndexing(spaceInfo1)
      const indexing2 = calculateSpaceIndexing(spaceInfo2)
      
      expect(indexing2.columnCount).toBeLessThanOrEqual(indexing1.columnCount)
    })

    it('사용자 지정 컬럼 수가 우선적으로 적용되어야 한다', () => {
      const spaceInfo = createBasicSpaceInfo({
        width: 3600,
        customColumnCount: 5
      })
      
      const indexing = calculateSpaceIndexing(spaceInfo)
      
      expect(indexing.columnCount).toBe(5)
    })
  })

  describe('calculateInternalSpace', () => {
    it('높이에서 바닥 두께, 상단 프레임, 받침대를 제외한 내부 높이를 계산해야 한다', () => {
      const spaceInfo = createBasicSpaceInfo({
        height: 2400,
        hasFloorFinish: true,
        floorFinish: { height: 50 },
        frameSize: { left: 50, right: 50, top: 50 },
        baseConfig: { type: 'floor', height: 65 }
      })
      
      const internalSpace = calculateInternalSpace(spaceInfo)
      
      // 2400 - 50(바닥) - 50(상단프레임) - 65(받침대) = 2235
      expect(internalSpace.height).toBe(2235)
    })

    it('바닥 마감이 없으면 바닥 두께를 제외하지 않아야 한다', () => {
      const spaceInfo = createBasicSpaceInfo({
        height: 2400,
        hasFloorFinish: false,
        frameSize: { left: 50, right: 50, top: 50 },
        baseConfig: { type: 'floor', height: 65 }
      })
      
      const internalSpace = calculateInternalSpace(spaceInfo)
      
      // 2400 - 0(바닥) - 50(상단프레임) - 65(받침대) = 2285
      expect(internalSpace.height).toBe(2285)
    })

    it('폭과 깊이 계산이 올바르게 되어야 한다', () => {
      const spaceInfo = createBasicSpaceInfo({
        width: 3600,
        surroundType: 'surround',
        frameSize: { left: 50, right: 50, top: 50 }
      })
      
      const internalSpace = calculateInternalSpace(spaceInfo)
      
      expect(internalSpace.width).toBe(3500) // 내부 폭
      expect(internalSpace.depth).toBe(580) // INNER_DEPTH 고정값
    })
  })

  describe('성능 테스트', () => {
    it('동일한 입력에 대해 일관된 결과를 반환해야 한다', () => {
      const spaceInfo = createBasicSpaceInfo()
      
      const result1 = calculateSpaceIndexing(spaceInfo)
      const result2 = calculateSpaceIndexing(spaceInfo)
      const result3 = calculateSpaceIndexing(spaceInfo)
      
      expect(result1).toEqual(result2)
      expect(result2).toEqual(result3)
    })

    it('대량 계산 시 합리적인 시간 내에 완료되어야 한다', () => {
      const spaceInfo = createBasicSpaceInfo()
      
      const startTime = performance.now()
      
      // 1000번 계산
      for (let i = 0; i < 1000; i++) {
        calculateSpaceIndexing(spaceInfo)
        calculateInternalWidth(spaceInfo)
        calculateInternalSpace(spaceInfo)
      }
      
      const endTime = performance.now()
      const duration = endTime - startTime
      
      // 1000번 계산이 100ms 이내에 완료되어야 함
      expect(duration).toBeLessThan(100)
    })
  })

  describe('경계값 테스트', () => {
    it('최소 폭에서도 정상 동작해야 한다', () => {
      const spaceInfo = createBasicSpaceInfo({ width: 600 })
      
      expect(() => {
        const internalWidth = calculateInternalWidth(spaceInfo)
        const indexing = calculateSpaceIndexing(spaceInfo)
        const internalSpace = calculateInternalSpace(spaceInfo)
        
        expect(internalWidth).toBeGreaterThan(0)
        expect(indexing.columnCount).toBeGreaterThan(0)
        expect(internalSpace.width).toBeGreaterThan(0)
      }).not.toThrow()
    })

    it('매우 큰 폭에서도 정상 동작해야 한다', () => {
      const spaceInfo = createBasicSpaceInfo({ width: 10000 })
      
      expect(() => {
        const internalWidth = calculateInternalWidth(spaceInfo)
        const indexing = calculateSpaceIndexing(spaceInfo)
        
        expect(internalWidth).toBeGreaterThan(0)
        expect(indexing.columnCount).toBeGreaterThan(0)
      }).not.toThrow()
    })
  })
}) 
