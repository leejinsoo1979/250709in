/**
 * 프레임 병합 그룹 계산 유틸리티
 * Room.tsx의 mergeFrameSegments 그룹핑 로직을 모듈 ID 기반으로 재사용 가능하게 추출
 */
import type { PlacedModule } from '@/editor/shared/furniture/types';
import { getModuleBoundsX } from '@/editor/shared/utils/freePlacementUtils';

export interface FrameMergeGroup {
  moduleIds: string[];   // 이 그룹에 속한 모듈 ID들
  totalWidthMm: number;  // 합산 너비
  label: string;         // 예: "A+B(상)", "C(상)"
}

/**
 * 모듈의 EP 보정된 너비를 계산 (Room.tsx의 세그먼트 생성 로직과 동일)
 */
function getEpCorrectedWidth(mod: PlacedModule): number {
  const bounds = getModuleBoundsX(mod);
  let widthMm = bounds.right - bounds.left;
  const epThk = mod.endPanelThickness || 18;
  if (mod.hasLeftEndPanel) widthMm -= epThk;
  if (mod.hasRightEndPanel) widthMm -= epThk;
  return widthMm;
}

/**
 * PlacedModule[] → 상부/하부 각각의 병합 그룹 반환
 * - 모듈을 X 위치 기준 정렬
 * - 좌측부터 합산, maxWidthMm 미만이면 같은 그룹
 * - EP 보정 적용 (Room.tsx mergeFrameSegments와 동일한 너비 사용)
 * - 상부: hasTopFrame !== false 필터, 하부: hasBase !== false 필터
 */
export function computeFrameMergeGroups(
  modules: PlacedModule[],
  type: 'top' | 'base',
  maxWidthMm: number = 2420
): FrameMergeGroup[] {
  // 타입별 필터
  const filtered = modules.filter(mod =>
    type === 'top'
      ? mod.hasTopFrame !== false
      : mod.hasBase !== false
  );

  if (filtered.length === 0) return [];

  // X 위치 기준 정렬
  const sorted = [...filtered].sort((a, b) => a.position.x - b.position.x);

  // 전체 모듈의 정렬 순서 기반 알파벳 매핑 (필터 전 전체 기준)
  const allSorted = [...modules].sort((a, b) => a.position.x - b.position.x);
  const alphaMap = new Map<string, string>();
  allSorted.forEach((mod, idx) => {
    alphaMap.set(mod.id, String.fromCharCode(65 + idx)); // A, B, C...
  });

  const suffix = type === 'top' ? '상' : '하';

  const groups: FrameMergeGroup[] = [];
  let currentGroup: PlacedModule[] = [];
  let currentSum = 0;

  for (const mod of sorted) {
    const widthMm = getEpCorrectedWidth(mod);

    if (currentGroup.length === 0) {
      currentGroup.push(mod);
      currentSum = widthMm;
      continue;
    }

    if (currentSum + widthMm <= maxWidthMm) {
      currentGroup.push(mod);
      currentSum += widthMm;
    } else {
      // 현재 그룹 확정
      groups.push(buildGroup(currentGroup, currentSum, alphaMap, suffix));
      // 새 그룹 시작
      currentGroup = [mod];
      currentSum = widthMm;
    }
  }

  // 마지막 그룹 확정
  if (currentGroup.length > 0) {
    groups.push(buildGroup(currentGroup, currentSum, alphaMap, suffix));
  }

  return groups;
}

function buildGroup(
  mods: PlacedModule[],
  totalWidthMm: number,
  alphaMap: Map<string, string>,
  suffix: string
): FrameMergeGroup {
  const moduleIds = mods.map(m => m.id);
  const letters = mods.map(m => alphaMap.get(m.id) ?? '?');
  const label = `${letters.join('+')}(${suffix})`;
  return { moduleIds, totalWidthMm, label };
}
