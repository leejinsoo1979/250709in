import { useMemo } from 'react';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';

interface SurroundCalculations {
  noSurroundFrameWidth: number | null;
  surroundFrameWidth: number | null;
  columnInfo: {
    columnCount: number;
    columnWidth: number;
  };
}

export const useSurroundCalculations = (
  spaceInfo: SpaceInfo,
  hasLeftWall: boolean,
  hasRightWall: boolean
): SurroundCalculations => {
  const derivedStore = useDerivedSpaceStore();
  const END_PANEL_WIDTH = 18; // 고정 18mm

  // 노서라운드 모드에서 프레임 너비 계산
  const noSurroundFrameWidth = useMemo(() => {
    const isNoSurround = spaceInfo.surroundType === 'no-surround';
    if (!isNoSurround || !spaceInfo.gapConfig) return null;
    
    const gapSize = spaceInfo.gapConfig.size;
    const totalWidth = spaceInfo.width;
    
    // 좌우 각각 이격거리만큼 줄어든 값이 상하단 프레임의 너비가 됨
    return totalWidth - (gapSize * 2);
  }, [spaceInfo.surroundType, spaceInfo.gapConfig, spaceInfo.width]);

  // 서라운드 모드에서 프레임 너비 계산
  const surroundFrameWidth = useMemo(() => {
    const isSurround = spaceInfo.surroundType === 'surround';
    if (!isSurround || !spaceInfo.frameSize) return null;
    
    const totalWidth = spaceInfo.width;
    const leftFrameWidth = !hasLeftWall ? END_PANEL_WIDTH : (spaceInfo.frameSize.left || 10);
    const rightFrameWidth = !hasRightWall ? END_PANEL_WIDTH : (spaceInfo.frameSize.right || 10);
    
    // 좌우 프레임 너비를 제외한 값이 상하단 프레임의 너비가 됨
    return totalWidth - leftFrameWidth - rightFrameWidth;
  }, [spaceInfo.surroundType, spaceInfo.frameSize, spaceInfo.width, hasLeftWall, hasRightWall]);

  // 슬롯 정보 계산 - 파생 스토어의 캐시된 값 사용
  const columnInfo = useMemo(() => {
    if (derivedStore.isCalculated) {
      // 파생 스토어에서 이미 계산된 값 사용
      return {
        columnCount: derivedStore.columnCount,
        columnWidth: derivedStore.columnWidth
      };
    }
    // 폴백: 파생 스토어가 아직 계산되지 않았으면 기존 방식
    const indexing = calculateSpaceIndexing(spaceInfo);
    return {
      columnCount: indexing.columnCount,
      columnWidth: indexing.columnWidth
    };
  }, [derivedStore.isCalculated, derivedStore.columnCount, derivedStore.columnWidth, spaceInfo]);

  return {
    noSurroundFrameWidth,
    surroundFrameWidth,
    columnInfo
  };
}; 