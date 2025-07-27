import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { mmToThreeUnits, threeUnitsToMm } from '@/editor/shared/viewer3d/components/base/utils/threeUtils';
import { calculateFrameThickness } from '@/editor/shared/viewer3d/utils/geometry';
import { SpaceCalculator } from '../indexing/SpaceCalculator';

/**
 * 단내림 영역의 경계 정보를 계산 (내경 기준)
 * 연속된 구조에서 높이 차이만 있는 영역의 경계를 반환
 */
export const getDroppedZoneBounds = (spaceInfo: SpaceInfo) => {
  if (!spaceInfo.droppedCeiling?.enabled) return null;
  
  const { position } = spaceInfo.droppedCeiling;
  // 기본값 처리
  const droppedWidth = spaceInfo.droppedCeiling.width || 900;
  const dropHeight = spaceInfo.droppedCeiling.dropHeight || 200;
  
  // 프레임 두께 계산
  const frameThickness = calculateFrameThickness(spaceInfo);
  
  // 내경 시작점 계산 (ColumnIndexer와 동일)
  let internalStartX;
  if (spaceInfo.surroundType === 'no-surround') {
    let leftReduction = 0;
    
    if (spaceInfo.installType === 'builtin') {
      leftReduction = 2;
    } else if (spaceInfo.installType === 'semistanding') {
      if (spaceInfo.wallConfig?.left) {
        leftReduction = 2;
      } else {
        leftReduction = 20;
      }
    } else {
      leftReduction = 20;
    }
    
    internalStartX = -(spaceInfo.width / 2) + leftReduction;
  } else {
    internalStartX = -(spaceInfo.width / 2) + frameThickness.left;
  }
  
  // 내경 너비
  const internalWidth = SpaceCalculator.calculateInternalWidth(spaceInfo);
  
  // 영역별 너비 (ColumnIndexer와 동일)
  const normalWidth = internalWidth - droppedWidth;
  
  // 위치에 따른 시작점 계산 (ColumnIndexer와 동일)
  let droppedStartX;
  if (position === 'left') {
    droppedStartX = internalStartX;
  } else {
    droppedStartX = internalStartX + normalWidth;
  }
  
  return {
    startX: droppedStartX,                    // 시작 X 좌표 (mm, 중앙 기준)
    endX: droppedStartX + droppedWidth,      // 종료 X 좌표 (mm, 중앙 기준)  
    width: droppedWidth,                      // 영역 폭 (mm)
    height: spaceInfo.height - dropHeight     // 단내림 높이 (mm)
  };
};

/**
 * 주어진 X 좌표가 단내림 영역에 있는지 확인
 * @param x X 좌표 (mm 단위)
 * @param spaceInfo 공간 정보
 * @returns 단내림 영역 여부
 */
export const isPositionInDroppedZone = (
  x: number,
  spaceInfo: SpaceInfo
): boolean => {
  const bounds = getDroppedZoneBounds(spaceInfo);
  if (!bounds) return false;
  
  return x >= bounds.startX && x <= bounds.endX;
};

/**
 * Three.js 좌표가 단내림 영역에 있는지 확인
 * @param threeX Three.js X 좌표
 * @param spaceInfo 공간 정보
 * @returns 단내림 영역 여부
 */
export const isThreePositionInDroppedZone = (
  threeX: number,
  spaceInfo: SpaceInfo
): boolean => {
  const mmX = threeUnitsToMm(threeX);
  return isPositionInDroppedZone(mmX, spaceInfo);
};

/**
 * 단내림 영역의 Three.js 경계 정보 반환
 */
export const getDroppedZoneThreeBounds = (spaceInfo: SpaceInfo) => {
  const bounds = getDroppedZoneBounds(spaceInfo);
  if (!bounds) return null;
  
  return {
    startX: mmToThreeUnits(bounds.startX),
    endX: mmToThreeUnits(bounds.endX),
    width: mmToThreeUnits(bounds.width),
    height: mmToThreeUnits(bounds.height)
  };
};

/**
 * 일반 영역의 경계 정보를 계산 (내경 기준)
 */
export const getNormalZoneBounds = (spaceInfo: SpaceInfo) => {
  // 프레임 두께 계산
  const frameThickness = calculateFrameThickness(spaceInfo);
  
  // 내경 시작점 계산 (ColumnIndexer와 동일)
  let internalStartX;
  if (spaceInfo.surroundType === 'no-surround') {
    let leftReduction = 0;
    
    if (spaceInfo.installType === 'builtin') {
      leftReduction = 2;
    } else if (spaceInfo.installType === 'semistanding') {
      if (spaceInfo.wallConfig?.left) {
        leftReduction = 2;
      } else {
        leftReduction = 20;
      }
    } else {
      leftReduction = 20;
    }
    
    internalStartX = -(spaceInfo.width / 2) + leftReduction;
  } else {
    internalStartX = -(spaceInfo.width / 2) + frameThickness.left;
  }
  
  // 내경 너비
  const internalWidth = SpaceCalculator.calculateInternalWidth(spaceInfo);
  
  if (!spaceInfo.droppedCeiling?.enabled) {
    return {
      startX: internalStartX,
      endX: internalStartX + internalWidth,
      width: internalWidth,
      height: spaceInfo.height
    };
  }
  
  const { position } = spaceInfo.droppedCeiling;
  // 기본값 처리
  const droppedWidth = spaceInfo.droppedCeiling.width || 900;
  const normalWidth = internalWidth - droppedWidth;
  
  // 위치에 따른 시작점 계산 (ColumnIndexer와 동일)
  let normalStartX;
  if (position === 'left') {
    normalStartX = internalStartX + droppedWidth;
  } else {
    normalStartX = internalStartX;
  }
  
  return {
    startX: normalStartX,
    endX: normalStartX + normalWidth,
    width: normalWidth,
    height: spaceInfo.height
  };
};