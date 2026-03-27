/**
 * 프레임 병합 그룹 계산 유틸리티
 * Room.tsx의 mergeFrameSegments 그룹핑 로직을 모듈 ID 기반으로 재사용 가능하게 추출
 *
 * 병합 조건:
 *  1. 프레임 높이(height)가 동일해야 함
 *  2. 프레임 두께(thickness/Z축)가 동일해야 함 (18mm 고정)
 *  3. Y축 위치가 동일해야 함 (상부끼리, 하부끼리 — type 파라미터로 보장)
 *  4. 합산 너비(X축)가 maxWidthMm(기본 2420mm) 이하여야 함
 */
import type { PlacedModule } from '@/editor/shared/furniture/types';
import { getModuleBoundsX } from '@/editor/shared/utils/freePlacementUtils';

export interface FrameMergeGroup {
  moduleIds: string[];   // 이 그룹에 속한 모듈 ID들
  totalWidthMm: number;  // 합산 너비
  label: string;         // 예: "A+B(상)", "C(상)"
  frameHeight: number;   // 이 그룹의 프레임 높이 (frameHeight 미지정 시 0)
}

/**
 * 모듈의 EP 보정된 너비를 계산 (Room.tsx의 세그먼트 생성 로직과 동일)
 */
function getEpCorrectedWidth(mod: PlacedModule): number {
  const bounds = getModuleBoundsX(mod);
  let widthMm = bounds.right - bounds.left;
  const epThk = mod.endPanelThickness || 18.5;
  if (mod.hasLeftEndPanel) widthMm -= epThk;
  if (mod.hasRightEndPanel) widthMm -= epThk;
  // 부동소수점 오차 제거 — 소수점 한 자리로 반올림
  return Math.round(widthMm * 10) / 10;
}

/**
 * 모듈의 프레임 높이를 가져옴
 * - 개별 가구의 hasTopFrame/hasBase가 false이면 0
 * - 그 외에는 defaultHeight 반환
 */
function getModuleFrameHeight(mod: PlacedModule, type: 'top' | 'base', defaultHeight: number): number {
  if (type === 'top' && (mod as any).hasTopFrame === false) return 0;
  if (type === 'base' && (mod as any).hasBase === false) return 0;
  return defaultHeight;
}

/**
 * PlacedModule[] → 상부/하부 각각의 병합 그룹 반환
 * - 모듈을 X 위치 기준 정렬
 * - frameHeight가 지정되면: 프레임 높이가 동일하고 합산 너비 ≤ maxWidthMm일 때만 같은 그룹
 * - frameHeight가 미지정(0)이면: 너비 합산만으로 그룹핑 (UI 표시용)
 * - EP 보정 적용 (Room.tsx mergeFrameSegments와 동일한 너비 사용)
 */
export function computeFrameMergeGroups(
  modules: PlacedModule[],
  type: 'top' | 'base',
  maxWidthMm: number = 2420,
  frameHeight: number = 0
): FrameMergeGroup[] {
  if (modules.length === 0) return [];

  const useHeightCheck = frameHeight > 0;

  // X 위치 기준 정렬
  const sorted = [...modules].sort((a, b) => a.position.x - b.position.x);

  // 전체 모듈의 정렬 순서 기반 알파벳 매핑
  const alphaMap = new Map<string, string>();
  sorted.forEach((mod, idx) => {
    alphaMap.set(mod.id, String.fromCharCode(65 + idx)); // A, B, C...
  });

  const suffix = type === 'top' ? '상' : '하';

  // frameHeight가 지정된 경우에만 높이 0인 모듈 필터링
  const eligibleModules = useHeightCheck
    ? sorted.filter(mod => getModuleFrameHeight(mod, type, frameHeight) > 0)
    : sorted;

  if (eligibleModules.length === 0) return [];

  const groups: FrameMergeGroup[] = [];
  let currentGroup: PlacedModule[] = [];
  let currentSum = 0;
  let currentHeight = 0;

  for (const mod of eligibleModules) {
    const widthMm = getEpCorrectedWidth(mod);
    const modFrameHeight = useHeightCheck
      ? getModuleFrameHeight(mod, type, frameHeight)
      : 0;

    if (currentGroup.length === 0) {
      currentGroup.push(mod);
      currentSum = widthMm;
      currentHeight = modFrameHeight;
      continue;
    }

    // 병합 조건: 합산 너비 ≤ maxWidthMm
    // frameHeight가 지정되면 추가로 높이도 동일해야 함
    const fitsWidth = currentSum + widthMm <= maxWidthMm;
    const sameHeight = !useHeightCheck || Math.abs(currentHeight - modFrameHeight) < 0.1;

    if (sameHeight && fitsWidth) {
      currentGroup.push(mod);
      currentSum += widthMm;
    } else {
      // 현재 그룹 확정
      groups.push(buildGroup(currentGroup, currentSum, currentHeight, alphaMap, suffix));
      // 새 그룹 시작
      currentGroup = [mod];
      currentSum = widthMm;
      currentHeight = modFrameHeight;
    }
  }

  // 마지막 그룹 확정
  if (currentGroup.length > 0) {
    groups.push(buildGroup(currentGroup, currentSum, currentHeight, alphaMap, suffix));
  }

  return groups;
}

function buildGroup(
  mods: PlacedModule[],
  totalWidthMm: number,
  frameHeight: number,
  alphaMap: Map<string, string>,
  suffix: string
): FrameMergeGroup {
  const moduleIds = mods.map(m => m.id);
  const letters = mods.map(m => alphaMap.get(m.id) ?? '?');
  const label = `${letters.join('+')}(${suffix})`;
  return { moduleIds, totalWidthMm, label, frameHeight };
}
