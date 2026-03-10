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
  // 치수 라벨 영역을 고려한 높이 패딩 (상단 치수 표시 공간 확보)
  const dimensionLabelPadding = 400; // mm 단위 여유 공간
  const effectiveHeight = height + dimensionLabelPadding;

  // 공간의 3차원 대각선 길이 계산 (모든 차원 고려)
  const diagonal = Math.sqrt(width * width + effectiveHeight * effectiveHeight + depth * depth);

  // W가 1200~2300 구간에서는 높이가 지배적이라 카메라가 너무 가까움
  // 이 구간에 추가 여백을 적용
  let furnitureMargin = 0.95;
  if (width >= 1200 && width <= 2300) {
    // 높이가 폭보다 클 때 추가 여백 적용
    const heightDominance = height / Math.max(width, 1);
    if (heightDominance > 1.0) {
      furnitureMargin = 1.05 + (heightDominance - 1.0) * 0.1;
    }
  }

  // FOV 50도 기준으로 거리 계산
  const fov = 50;
  const fovRad = (fov * Math.PI) / 180;

  // 가장 큰 차원을 기준으로 기본 거리 계산 (패딩 반영된 높이 사용)
  const maxDimension = Math.max(width, effectiveHeight, depth);
  const baseDistance = (maxDimension / 2) / Math.tan(fovRad / 2);

  // 대각선 길이도 고려해서 더 안전한 거리 계산
  const diagonalDistance = (diagonal / 2) / Math.tan(fovRad / 2);
  const safeDistance = Math.max(baseDistance, diagonalDistance);

  // Three.js 단위로 변환하고 여백 적용
  const distance = mmToThreeUnits(safeDistance * furnitureMargin);

  // 큰 공간에서도 전체가 보이도록 최대 거리 제한 대폭 증가
  return Math.max(7, Math.min(150, distance));
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