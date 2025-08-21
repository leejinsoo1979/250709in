import { create } from 'zustand'
import { SpaceInfo } from './core/spaceConfigStore'
import { calculateInternalWidth, calculateSpaceIndexing } from '@/editor/shared/utils/indexing'
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry'

export interface DerivedSpaceState {
  // 캐시된 파생 데이터들
  internalWidth: number
  columnCount: number
  columnWidth: number
  internalHeight: number
  internalDepth: number
  columnPositions: number[]
  threeUnitPositions: number[]
  columnBoundaries: number[]
  dualColumnPositions: number[]
  
  // 단내림 영역별 정보
  zones?: {
    normal?: {
      width: number
      columnCount: number
      columnWidth: number
    }
    dropped?: {
      width: number
      columnCount: number
      columnWidth: number
    }
  }
  
  // 계산 상태
  isCalculated: boolean
  lastCalculatedSpaceInfo: SpaceInfo | null
  
  // 액션들
  recalculateFromSpaceInfo: (spaceInfo: SpaceInfo) => void
  reset: () => void
}

const initialState = {
  internalWidth: 0,
  columnCount: 0,
  columnWidth: 0,
  internalHeight: 0,
  internalDepth: 0,
  columnPositions: [],
  threeUnitPositions: [],
  columnBoundaries: [],
  dualColumnPositions: [],
  isCalculated: false,
  lastCalculatedSpaceInfo: null,
}

export const useDerivedSpaceStore = create<DerivedSpaceState>((set) => ({
  ...initialState,
  
  recalculateFromSpaceInfo: (spaceInfo: SpaceInfo) => {
    try {
      // 입력값 검증 및 보정
      const validatedSpaceInfo = {
        ...spaceInfo,
        width: Math.max(600, spaceInfo.width), // 최소 600mm
        height: Math.max(1000, spaceInfo.height), // 최소 1000mm
      }
      
      // 1. 내부 폭 계산
      const internalWidth = calculateInternalWidth(validatedSpaceInfo)
      
      // 2. 공간 인덱싱 계산 (컬럼 정보)
      const indexing = calculateSpaceIndexing(validatedSpaceInfo)
      
      // 3. 내부 공간 계산 (높이, 깊이 포함)
      const internalSpace = calculateInternalSpace(validatedSpaceInfo)
      
      // 4. 단내림 영역별 정보 추가
      const zones = indexing.zones ? {
        normal: indexing.zones.normal ? {
          width: indexing.zones.normal.width,
          columnCount: indexing.zones.normal.columnCount,
          columnWidth: indexing.zones.normal.columnWidth
        } : undefined,
        dropped: indexing.zones.dropped ? {
          width: indexing.zones.dropped.width,
          columnCount: indexing.zones.dropped.columnCount,
          columnWidth: indexing.zones.dropped.columnWidth
        } : undefined
      } : undefined
      
      // 5. 상태 업데이트
      set({
        internalWidth,
        columnCount: indexing.columnCount,
        columnWidth: indexing.columnWidth,
        internalHeight: internalSpace.height,
        internalDepth: internalSpace.depth,
        columnPositions: indexing.columnPositions,
        threeUnitPositions: indexing.threeUnitPositions,
        columnBoundaries: indexing.columnBoundaries,
        dualColumnPositions: indexing.dualColumnPositions,
        zones,
        isCalculated: true,
        lastCalculatedSpaceInfo: validatedSpaceInfo,
      })
    } catch (error) {
      console.error('❌ [derivedSpaceStore 계산 오류]', error)
      console.error('파생 상태 계산 중 오류 발생:', error)
      
      // 오류 발생 시 안전한 기본값으로 설정
      set({
        internalWidth: Math.max(0, spaceInfo.width - 100), // 대략적인 값
        columnCount: 1,
        columnWidth: Math.max(400, spaceInfo.width - 100),
        internalHeight: Math.max(0, spaceInfo.height - 200), // 대략적인 값
        internalDepth: 580,
        columnPositions: [0],
        threeUnitPositions: [0],
        columnBoundaries: [0, Math.max(400, spaceInfo.width - 100)],
        dualColumnPositions: [],
        isCalculated: true,
        lastCalculatedSpaceInfo: spaceInfo,
      })
    }
  },
  
  reset: () => {
    set(initialState)
  },
}))

// 편의 함수들
export const getDerivedSpaceData = () => {
  const state = useDerivedSpaceStore.getState()
  return {
    internalWidth: state.internalWidth,
    columnCount: state.columnCount,
    columnWidth: state.columnWidth,
    internalHeight: state.internalHeight,
    internalDepth: state.internalDepth,
    columnPositions: state.columnPositions,
    isCalculated: state.isCalculated,
  }
}

// 특정 데이터만 구독하는 셀렉터들
export const useInternalWidth = () => 
  useDerivedSpaceStore((state) => state.internalWidth)

export const useColumnData = () => {
  const columnCount = useDerivedSpaceStore((state) => state.columnCount)
  const columnWidth = useDerivedSpaceStore((state) => state.columnWidth)
  const columnPositions = useDerivedSpaceStore((state) => state.columnPositions)
  
  return { columnCount, columnWidth, columnPositions }
}

export const useInternalSpace = () => {
  const width = useDerivedSpaceStore((state) => state.internalWidth)
  const height = useDerivedSpaceStore((state) => state.internalHeight)
  const depth = useDerivedSpaceStore((state) => state.internalDepth)
  
  return { width, height, depth }
}

// 단내림이 있을 때 메인구간의 정보를 반환하는 훅
export const useMainZoneInfo = () => 
  useDerivedSpaceStore((state) => {
    if (state.zones?.normal) {
      return {
        width: state.zones.normal.width,
        columnCount: state.zones.normal.columnCount,
        columnWidth: state.zones.normal.columnWidth
      }
    }
    // 단내림이 없으면 전체 공간 정보 반환
    return {
      width: state.internalWidth,
      columnCount: state.columnCount,
      columnWidth: state.columnWidth
    }
  }) 