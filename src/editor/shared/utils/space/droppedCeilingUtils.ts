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
  const droppedWidth = spaceInfo.droppedCeiling.width || DEFAULT_DROPPED_CEILING_VALUES.WIDTH;
  const dropHeight = spaceInfo.droppedCeiling.dropHeight || 200;
  const isLeftDropped = position === 'left';
  
  const END_PANEL_THICKNESS = 18;
  let droppedStartX;
  let actualDroppedWidth = droppedWidth;
  
  if (spaceInfo.surroundType === 'no-surround') {
    const { wallConfig } = spaceInfo;
    
    // 노서라운드에서는 내부 경계도 오프셋을 고려해야 함
    if (isLeftDropped) {
      // 왼쪽 단내림: 단내림 영역은 왼쪽에 위치
      let leftOffset = 0;
      
      if (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in') {
        // 빌트인: 왼쪽 벽에 이격거리
        leftOffset = spaceInfo.gapConfig?.left || 0;
      } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
        if (wallConfig?.left) {
          leftOffset = spaceInfo.gapConfig?.left || 0; // 왼쪽 벽: 이격거리
        } else {
          leftOffset = END_PANEL_THICKNESS; // 왼쪽 벽 없음: 엔드패널
        }
      } else {
        // 프리스탠딩: 왼쪽 엔드패널
        leftOffset = END_PANEL_THICKNESS;
      }
      
      droppedStartX = -(spaceInfo.width / 2) + leftOffset;
      // 단내림 영역 너비는 오프셋을 제외한 실제 설정값
      actualDroppedWidth = droppedWidth - leftOffset;
    } else {
      // 오른쪽 단내림: 단내림 영역은 오른쪽에 위치
      let rightOffset = 0;
      
      if (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in') {
        // 빌트인: 오른쪽 벽에 이격거리
        rightOffset = spaceInfo.gapConfig?.right || 0;
      } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
        if (wallConfig?.right) {
          rightOffset = spaceInfo.gapConfig?.right || 0; // 오른쪽 벽: 이격거리
        } else {
          rightOffset = END_PANEL_THICKNESS; // 오른쪽 벽 없음: 엔드패널
        }
      } else {
        // 프리스탠딩: 오른쪽 엔드패널
        rightOffset = END_PANEL_THICKNESS;
      }
      
      // 오른쪽 단내림의 시작점
      droppedStartX = -(spaceInfo.width / 2) + (spaceInfo.width - droppedWidth);
      // 단내림 영역 너비는 오프셋을 제외한 실제 설정값
      actualDroppedWidth = droppedWidth - rightOffset;
    }
  } else {
    // 서라운드 모드: 기존 로직 유지
    if (isLeftDropped) {
      droppedStartX = -(spaceInfo.width / 2);
    } else {
      droppedStartX = -(spaceInfo.width / 2) + (spaceInfo.width - droppedWidth);
    }
    actualDroppedWidth = droppedWidth;
  }
  
  return {
    startX: droppedStartX,                    // 시작 X 좌표 (mm, 중앙 기준)
    endX: droppedStartX + actualDroppedWidth, // 종료 X 좌표 (mm, 중앙 기준)  
    width: actualDroppedWidth,                // 영역 폭 (mm)
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
  const END_PANEL_THICKNESS = 18;
  
  // 단내림이 없는 경우 전체 영역에 대한 오프셋 계산
  if (!spaceInfo.droppedCeiling?.enabled) {
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
    
    const totalStartX = -(spaceInfo.width / 2) + leftOffset;
    const availableWidth = spaceInfo.width - leftOffset - rightOffset;
    
    return {
      startX: totalStartX,
      endX: totalStartX + availableWidth,
      width: availableWidth,
      height: spaceInfo.height
    };
  }
  
  // 단내림이 있는 경우 일반 영역에 대한 개별 오프셋 계산
  const { position } = spaceInfo.droppedCeiling;
  const droppedWidth = spaceInfo.droppedCeiling.width || DEFAULT_DROPPED_CEILING_VALUES.WIDTH;
  const isLeftDropped = position === 'left';
  
  let normalStartX;
  let normalWidth;
  
  if (spaceInfo.surroundType === 'no-surround') {
    const { wallConfig } = spaceInfo;
    
    if (isLeftDropped) {
      // 왼쪽 단내림: 일반 영역은 오른쪽에 위치
      // 경계선은 단내림 영역의 실제 끝점 (오프셋 적용된 위치)
      const droppedBounds = getDroppedZoneBounds(spaceInfo);
      normalStartX = droppedBounds.endX; // 단내림 영역의 실제 끝점에서 시작
      
      // 일반 영역의 오른쪽 오프셋 계산
      let rightOffset = 0;
      if (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in') {
        rightOffset = spaceInfo.gapConfig?.right || 0;
      } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
        if (wallConfig?.right) {
          rightOffset = spaceInfo.gapConfig?.right || 0;  // 오른쪽 벽: 이격거리
        } else {
          rightOffset = END_PANEL_THICKNESS;  // 오른쪽 벽 없음: 엔드패널
        }
      } else {
        rightOffset = END_PANEL_THICKNESS;  // 프리스탠딩: 엔드패널
      }
      
      // 일반 영역의 너비는 경계선부터 오른쪽 끝까지
      const rightEnd = (spaceInfo.width / 2) - rightOffset;
      normalWidth = rightEnd - normalStartX;
    } else {
      // 오른쪽 단내림: 일반 영역은 왼쪽에 위치
      // 일반 영역의 왼쪽 오프셋 계산
      let leftOffset = 0;
      if (spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in') {
        leftOffset = spaceInfo.gapConfig?.left || 0;
      } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
        if (wallConfig?.left) {
          leftOffset = spaceInfo.gapConfig?.left || 0;  // 왼쪽 벽: 이격거리
        } else {
          leftOffset = END_PANEL_THICKNESS;  // 왼쪽 벽 없음: 엔드패널
        }
      } else {
        leftOffset = END_PANEL_THICKNESS;  // 프리스탠딩: 엔드패널
      }
      
      normalStartX = -(spaceInfo.width / 2) + leftOffset;
      
      // 경계선은 단내림 영역의 실제 시작점
      const droppedBounds = getDroppedZoneBounds(spaceInfo);
      normalWidth = droppedBounds.startX - normalStartX; // 일반 영역의 시작점부터 단내림 시작점까지
    }
  } else {
    // 서라운드 모드: 기존 로직 유지
    if (isLeftDropped) {
      normalStartX = -(spaceInfo.width / 2) + droppedWidth;
      normalWidth = spaceInfo.width - droppedWidth;
    } else {
      normalStartX = -(spaceInfo.width / 2);
      normalWidth = spaceInfo.width - droppedWidth;
    }
  }
  
  return {
    startX: normalStartX,
    endX: normalStartX + normalWidth,
    width: normalWidth,
    height: spaceInfo.height
  };
};