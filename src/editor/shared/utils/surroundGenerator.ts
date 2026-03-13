/**
 * 자유배치 서라운드 자동 생성 유틸리티
 * 벽-캐비닛 간 gap 계산 → EP / L-shape 자동 판정
 */

import { PlacedModule } from '@/editor/shared/furniture/types';
import { SpaceInfo, FreeSurroundConfig, SurroundMethod } from '@/store/core/spaceConfigStore';
import { getInternalSpaceBoundsX, getModuleBoundsX } from './freePlacementUtils';

export interface SurroundGenerationResult {
  success: boolean;
  config?: FreeSurroundConfig;
  errorMessage?: string;
}

/**
 * gap 값으로 서라운드 방식 결정
 * - ≤ 18mm → 'none' (서라운드 불필요)
 * - 18 < gap ≤ 22mm → 'ep' (18T × 40W 패널)
 * - 22 < gap ≤ 100mm → 'lshape' (측면패널 + 하부패널)
 */
function determineSurroundMethod(gap: number): SurroundMethod {
  if (gap <= 18) return 'none';
  if (gap <= 22) return 'ep';
  return 'lshape';
}

/**
 * 자유배치 모드 서라운드 자동 생성
 * 1. 자유배치 모듈만 필터
 * 2. 공간 좌/우 경계 계산
 * 3. 가장 좌/우측 가구 edge 계산
 * 4. gap 판정 → EP / L-shape / none
 */
export function generateSurround(
  spaceInfo: SpaceInfo,
  placedModules: PlacedModule[],
): SurroundGenerationResult {
  // 1. 자유배치 모듈만 필터
  const freeModules = placedModules.filter((m) => m.isFreePlacement);

  if (freeModules.length === 0) {
    return { success: false, errorMessage: '가구를 더 채워주세요' };
  }

  // 2. 공간 좌/우 경계
  const spaceBounds = getInternalSpaceBoundsX(spaceInfo);

  // 3. 모든 모듈의 X 범위 계산 → 가장 좌/우측 edge
  const allBounds = freeModules.map((m) => getModuleBoundsX(m));
  const leftMostEdge = Math.min(...allBounds.map((b) => b.left));
  const rightMostEdge = Math.max(...allBounds.map((b) => b.right));

  // 4. gap 계산
  const leftGap = leftMostEdge - spaceBounds.startX;
  const rightGap = spaceBounds.endX - rightMostEdge;

  // 5. gap 초과 검사
  if (leftGap > 100 || rightGap > 100) {
    const overSide = leftGap > 100 && rightGap > 100
      ? '좌우측'
      : leftGap > 100 ? '좌측' : '우측';
    return {
      success: false,
      errorMessage: `${overSide} 이격거리가 100mm를 초과합니다. 가구를 더 채워주세요`,
    };
  }

  // 6. 좌/우 독립 판정
  const leftMethod = determineSurroundMethod(leftGap);
  const rightMethod = determineSurroundMethod(rightGap);

  // 7. FreeSurroundConfig 구성
  const config: FreeSurroundConfig = {
    left: {
      enabled: leftMethod !== 'none',
      size: leftMethod === 'ep' ? 18 : leftMethod === 'lshape' ? 18 : 0,
      offset: 0,
      method: leftMethod,
      gap: Math.round(leftGap),
    },
    top: {
      enabled: true,
      size: 30,
      offset: 0,
    },
    right: {
      enabled: rightMethod !== 'none',
      size: rightMethod === 'ep' ? 18 : rightMethod === 'lshape' ? 18 : 0,
      offset: 0,
      method: rightMethod,
      gap: Math.round(rightGap),
    },
  };

  return { success: true, config };
}
