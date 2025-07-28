import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { mmToThreeUnits, threeUnitsToMm } from '@/editor/shared/viewer3d/components/base/utils/threeUtils';
import { calculateFrameThickness } from '@/editor/shared/viewer3d/utils/geometry';
import { SpaceCalculator } from '../indexing/SpaceCalculator';

/**
 * 단내림 영역의 경계 정보를 계산 (전체 공간 기준)
 * 연속된 구조에서 높이 차이만 있는 영역의 경계를 반환
 */
export const getDroppedZoneBounds = (spaceInfo: SpaceInfo) => {
  if (!spaceInfo.droppedCeiling?.enabled) return null;
  
  const { position } = spaceInfo.droppedCeiling;
  // 기본값 처리
  const droppedWidth = spaceInfo.droppedCeiling.width || 900;
  const dropHeight = spaceInfo.droppedCeiling.dropHeight || 200;
  
  // 전체 공간 기준 시작점
  const totalStartX = -(spaceInfo.width / 2);
  
  // 위치에 따른 시작점 계산
  let droppedStartX;
  if (position === 'left') {
    droppedStartX = totalStartX;
  } else {
    droppedStartX = totalStartX + (spaceInfo.width - droppedWidth);
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
 * 일반 영역의 경계 정보를 계산 (전체 공간 기준)
 */
export const getNormalZoneBounds = (spaceInfo: SpaceInfo) => {
  // 전체 공간 기준 시작점
  const totalStartX = -(spaceInfo.width / 2);
  
  if (!spaceInfo.droppedCeiling?.enabled) {
    return {
      startX: totalStartX,
      endX: totalStartX + spaceInfo.width,
      width: spaceInfo.width,
      height: spaceInfo.height
    };
  }
  
  const { position } = spaceInfo.droppedCeiling;
  // 기본값 처리
  const droppedWidth = spaceInfo.droppedCeiling.width || 900;
  const normalWidth = spaceInfo.width - droppedWidth;
  
  // 위치에 따른 시작점 계산
  let normalStartX;
  if (position === 'left') {
    normalStartX = totalStartX + droppedWidth;
  } else {
    normalStartX = totalStartX;
  }
  
  return {
    startX: normalStartX,
    endX: normalStartX + normalWidth,
    width: normalWidth,
    height: spaceInfo.height
  };
};