/**
 * 자유배치 서라운드 자동 생성 유틸리티
 * 벽-캐비닛 간 gap 계산 → 서라운드 프레임 자동 생성
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
 * - ≤ 2mm → 'none' (밀착, 서라운드 불필요)
 * - > 2mm → 'lshape' (측면패널 + 하부패널)
 */
function determineSurroundMethod(gap: number): SurroundMethod {
  if (gap <= 2) return 'none';
  return 'lshape';
}

/**
 * 자유배치 모드 서라운드 자동 생성
 * 1. 자유배치 모듈만 필터
 * 2. 공간 좌/우 경계 계산
 * 3. 가장 좌/우측 가구 edge 계산
 * 4. gap 기반 서라운드 방식 결정
 */
export function generateSurround(
  spaceInfo: SpaceInfo,
  placedModules: PlacedModule[],
): SurroundGenerationResult {
  // 1. 자유배치 모듈만 필터
  const freeModules = placedModules.filter((m) => m.isFreePlacement);

  if (freeModules.length === 0) {
    return { success: false, errorMessage: '배치된 가구가 없습니다' };
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

  console.log('🔧 [generateSurround]', {
    spaceBounds, leftMostEdge, rightMostEdge, leftGap, rightGap,
  });

  // 5. 좌/우 독립 판정
  const leftMethod = determineSurroundMethod(leftGap);
  const rightMethod = determineSurroundMethod(rightGap);

  // 6. FreeSurroundConfig 구성
  const config: FreeSurroundConfig = {
    left: {
      enabled: leftMethod !== 'none',
      size: 18,
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
      size: 18,
      offset: 0,
      method: rightMethod,
      gap: Math.round(rightGap),
    },
  };

  return { success: true, config };
}
