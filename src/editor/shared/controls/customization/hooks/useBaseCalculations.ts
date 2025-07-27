import { useMemo, useEffect } from 'react';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { 
  getColumnCountLimits
} from '@/editor/shared/utils/indexing';
import { useInternalWidth, useDerivedSpaceStore, useMainZoneInfo } from '@/store/derivedSpaceStore';

interface ColumnLimits {
  minColumns: number;
  maxColumns: number;
  canUseSingle: boolean;
  canUseDual: boolean;
}

interface BaseCalculations {
  internalWidth: number;
  columnLimits: ColumnLimits;
  currentColumnWidth: number;
  isAutoMode: boolean;
  derivedColumnCount: number;
}

export const useBaseCalculations = (
  spaceInfo: SpaceInfo,
  columnCount: number
): BaseCalculations => {
  // 파생 스토어에서 계산된 값들 가져오기
  const internalWidth = useInternalWidth();
  const derivedColumnCount = useDerivedSpaceStore((state) => state.columnCount);
  const isCalculated = useDerivedSpaceStore((state) => state.isCalculated);
  const derivedSpaceStore = useDerivedSpaceStore();
  
  // 단내림이 있을 때는 메인구간 정보 사용
  const mainZoneInfo = useMainZoneInfo();

  // 데이터 불일치 감지 및 재계산 (Side Effect)
  useEffect(() => {
    // derivedSpaceStore가 이미 계산되었는데도 internalWidth가 비정상적인 경우에만 재계산
    const shouldForceRecalculate = isCalculated && internalWidth === 0;
    const hasSignificantDifference = isCalculated && spaceInfo.width > 0 && Math.abs(internalWidth - spaceInfo.width) > 1000;
    
    if (shouldForceRecalculate || hasSignificantDifference) {
      console.warn('⚠️ [internalWidth 불일치 감지] 재계산 강제 실행', {
        internalWidth,
        spaceInfoWidth: spaceInfo.width,
        차이: Math.abs(internalWidth - spaceInfo.width),
        isCalculated
      });
      derivedSpaceStore.recalculateFromSpaceInfo(spaceInfo);
    }
  }, [internalWidth, spaceInfo, isCalculated, derivedSpaceStore]);

  // 단내림이 있을 때는 메인구간 너비 사용, 없으면 전체 너비 사용
  const effectiveWidth = mainZoneInfo.width;
  const effectiveColumnCount = mainZoneInfo.columnCount;
  
  // 컬럼 제한 계산 (순수 계산)
  const columnLimits = useMemo(() => {
    return getColumnCountLimits(effectiveWidth);
  }, [effectiveWidth]);

  // 현재 컬럼 너비 계산
  const currentColumnWidth = useMemo(() => {
    return mainZoneInfo.columnWidth;
  }, [mainZoneInfo.columnWidth]);

  // 자동 모드 여부
  const isAutoMode = useMemo(() => {
    return !spaceInfo.customColumnCount;
  }, [spaceInfo.customColumnCount]);

  return {
    internalWidth: effectiveWidth,
    columnLimits,
    currentColumnWidth,
    isAutoMode,
    derivedColumnCount: effectiveColumnCount
  };
}; 