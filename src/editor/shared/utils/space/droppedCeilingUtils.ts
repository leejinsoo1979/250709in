import { SpaceInfo, DEFAULT_DROPPED_CEILING_VALUES } from '@/store/core/spaceConfigStore';
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
  const droppedWidth = spaceInfo.droppedCeiling.width || DEFAULT_DROPPED_CEILING_VALUES.WIDTH;
  const dropHeight = spaceInfo.droppedCeiling.dropHeight || 200;
  
  // 노서라운드일 때 엔드패널 고려
  const END_PANEL_THICKNESS = 18;
  let leftOffset = 0;
  let rightOffset = 0;
  
  if (spaceInfo.surroundType === 'no-surround') {
    const { wallConfig } = spaceInfo;
    if (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in') {
      // 빌트인: 양쪽 벽에 이격거리만
      leftOffset = spaceInfo.gapConfig?.left || 0;
      rightOffset = spaceInfo.gapConfig?.right || 0;
    } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
      // 세미스탠딩: 벽 있는 쪽 이격거리, 벽 없는 쪽 엔드패널
      if (wallConfig?.left && !wallConfig?.right) {
        leftOffset = spaceInfo.gapConfig?.left || 0;
        rightOffset = END_PANEL_THICKNESS;
      } else if (!wallConfig?.left && wallConfig?.right) {
        leftOffset = END_PANEL_THICKNESS;
        rightOffset = spaceInfo.gapConfig?.right || 0;
      } else {
        // fallback
        leftOffset = spaceInfo.gapConfig?.left || 0;
        rightOffset = END_PANEL_THICKNESS;
      }
    } else {
      // 프리스탠딩: 양쪽 엔드패널
      leftOffset = END_PANEL_THICKNESS;
      rightOffset = END_PANEL_THICKNESS;
    }
  }
  
  // 전체 공간 기준 시작점 (엔드패널/이격거리 고려)
  const totalStartX = -(spaceInfo.width / 2) + leftOffset;
  const availableWidth = spaceInfo.width - leftOffset - rightOffset;
  
  // 위치에 따른 시작점 계산
  let droppedStartX;
  if (position === 'left') {
    droppedStartX = totalStartX;
  } else {
    droppedStartX = totalStartX + (availableWidth - droppedWidth);
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
  // 노서라운드일 때 엔드패널 고려
  const END_PANEL_THICKNESS = 18;
  let leftOffset = 0;
  let rightOffset = 0;
  
  if (spaceInfo.surroundType === 'no-surround') {
    const { wallConfig } = spaceInfo;
    if (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in') {
      // 빌트인: 양쪽 벽에 이격거리만
      leftOffset = spaceInfo.gapConfig?.left || 0;
      rightOffset = spaceInfo.gapConfig?.right || 0;
    } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
      // 세미스탠딩: 벽 있는 쪽 이격거리, 벽 없는 쪽 엔드패널
      if (wallConfig?.left && !wallConfig?.right) {
        leftOffset = spaceInfo.gapConfig?.left || 0;
        rightOffset = END_PANEL_THICKNESS;
      } else if (!wallConfig?.left && wallConfig?.right) {
        leftOffset = END_PANEL_THICKNESS;
        rightOffset = spaceInfo.gapConfig?.right || 0;
      } else {
        // fallback
        leftOffset = spaceInfo.gapConfig?.left || 0;
        rightOffset = END_PANEL_THICKNESS;
      }
    } else {
      // 프리스탠딩: 양쪽 엔드패널
      leftOffset = END_PANEL_THICKNESS;
      rightOffset = END_PANEL_THICKNESS;
    }
  }
  
  // 전체 공간 기준 시작점 (엔드패널/이격거리 고려)
  const totalStartX = -(spaceInfo.width / 2) + leftOffset;
  const availableWidth = spaceInfo.width - leftOffset - rightOffset;
  
  if (!spaceInfo.droppedCeiling?.enabled) {
    return {
      startX: totalStartX,
      endX: totalStartX + availableWidth,
      width: availableWidth,
      height: spaceInfo.height
    };
  }
  
  const { position } = spaceInfo.droppedCeiling;
  // 기본값 처리
  const droppedWidth = spaceInfo.droppedCeiling.width || DEFAULT_DROPPED_CEILING_VALUES.WIDTH;
  const normalWidth = availableWidth - droppedWidth;
  
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