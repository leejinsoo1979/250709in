/**
 * 3D 뷰어에서 사용하는 유틸리티 함수들
 */

// 단위 변환 상수
const MM_TO_THREE_UNITS = 0.01;

// FOV 조정 설정
export const FOV_ADJUSTMENTS = {
  BASE_FOV: 50,
  SMALL_WIDTH_THRESHOLD: 1000,
  MEDIUM_WIDTH_THRESHOLD: 1500,
  LARGE_WIDTH_THRESHOLD: 2000,
  SMALL_ADJUSTMENT: 5,
  MEDIUM_ADJUSTMENT: 0,
  LARGE_ADJUSTMENT: -5,
  XLARGE_ADJUSTMENT: -10,
} as const;

/**
 * 공간 폭에 따라 동적으로 FOV를 계산
 * @param width 공간 폭 (mm)
 * @returns 계산된 FOV 값
 */
export const calculateDynamicFOV = (width: number): number => {
  const {
    BASE_FOV,
    SMALL_WIDTH_THRESHOLD,
    MEDIUM_WIDTH_THRESHOLD,
    LARGE_WIDTH_THRESHOLD,
    SMALL_ADJUSTMENT,
    MEDIUM_ADJUSTMENT,
    LARGE_ADJUSTMENT,
    XLARGE_ADJUSTMENT,
  } = FOV_ADJUSTMENTS;

  if (width <= SMALL_WIDTH_THRESHOLD) {
    return BASE_FOV + SMALL_ADJUSTMENT;
  } else if (width <= MEDIUM_WIDTH_THRESHOLD) {
    return BASE_FOV + MEDIUM_ADJUSTMENT;
  } else if (width <= LARGE_WIDTH_THRESHOLD) {
    return BASE_FOV + LARGE_ADJUSTMENT;
  } else {
    return BASE_FOV + XLARGE_ADJUSTMENT;
  }
};

/**
 * mm를 Three.js 단위로 변환
 */
export const mmToThreeUnits = (mm: number) => mm * MM_TO_THREE_UNITS;

/**
 * Three.js 단위를 mm로 변환
 */
export const threeUnitsToMm = (threeUnits: number) => threeUnits / MM_TO_THREE_UNITS;

/**
 * 최적화된 카메라 거리 계산 (3D 모드에서 충분히 멀리, 큰 공간도 전체 표시)
 */
export const calculateOptimalDistance = (width: number, height: number, depth: number, placedModulesCount: number = 0) => {
  // 공간의 3차원 대각선 길이 계산 (모든 차원 고려)
  const diagonal = Math.sqrt(width * width + height * height + depth * depth);
  
  // 적절한 여백으로 조정
  // 가구 유무와 관계없이 일정한 여백 사용
  const furnitureMargin = 0.75; // 카메라를 더 가까이 (0.85 → 0.75)
  
  // FOV 50도 기준으로 거리 계산
  const fov = 50;
  const fovRad = (fov * Math.PI) / 180;
  
  // 가장 큰 차원을 기준으로 기본 거리 계산
  const maxDimension = Math.max(width, height, depth); // depth도 고려
  const baseDistance = (maxDimension / 2) / Math.tan(fovRad / 2);
  
  // 대각선 길이도 고려해서 더 안전한 거리 계산
  const diagonalDistance = (diagonal / 2) / Math.tan(fovRad / 2);
  const safeDistance = Math.max(baseDistance, diagonalDistance);
  
  // Three.js 단위로 변환하고 여백 적용
  const distance = mmToThreeUnits(safeDistance * furnitureMargin);
  
  // 큰 공간에서도 전체가 보이도록 최대 거리 제한 대폭 증가
  return Math.max(7, Math.min(150, distance)); // 적절한 최소 거리
};

/**
 * 뷰모드에 따른 카메라 위치 계산
 * @param viewMode 뷰 모드
 * @param defaultPosition 기본 카메라 위치
 * @param spaceWidth 공간 폭 (mm)
 * @param spaceHeight 공간 높이 (mm)
 * @param spaceDepth 공간 깊이 (mm)
 * @param placedModulesCount 배치된 가구 개수
 * @returns 계산된 카메라 위치
 */
export const calculateCameraPosition = (
  viewMode: '2D' | '3D',
  defaultPosition: [number, number, number],
  spaceWidth?: number,
  spaceHeight?: number,
  spaceDepth?: number,
  placedModulesCount?: number
): [number, number, number] => {
  if (viewMode === '2D' && spaceWidth && spaceHeight) {
    // 2D 모드: 3D와 동일한 동적 거리 계산 사용
    const depth = spaceDepth || 600; // 기본 깊이 600mm
    const distance = calculateOptimalDistance(spaceWidth, spaceHeight, depth, placedModulesCount || 0);
    const yCenter = mmToThreeUnits(spaceHeight * 0.5);
    return [0, yCenter, distance];
  }
  
  // 3D 모드에서는 기본 위치 사용
  return defaultPosition;
};

/**
 * 카메라 타겟 위치 계산
 * @param spaceHeight 공간 높이
 * @returns 카메라 타겟 위치
 */
export const calculateCameraTarget = (spaceHeight: number): [number, number, number] => {
  // 공간 높이의 절반 위치를 타겟으로 설정 (가구 유무와 관계없이 일정)
  const yCenter = mmToThreeUnits(spaceHeight * 0.5);
  return [0, yCenter, 0];
}; 