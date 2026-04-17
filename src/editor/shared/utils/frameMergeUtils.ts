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

/**
 * 인조대리석 상판 병합 그룹 계산 유틸리티
 * - 인접한 모듈(X축 정렬 기준 빈틈없음)
 * - 상판 관련된 설정(두께, 옵셋, 뒷턱)이 모두 동일해야 병합
 * - 결합 너비 최대 3680mm(인조대리석 기본 원장 L사이즈) 허용
 */
export function computeStoneTopMergeGroups(
  modules: PlacedModule[],
  maxWidthMm: number = 3680
): FrameMergeGroup[] {
  if (modules.length === 0) return [];
  
  // 돌출/두께가 있는 유효한 상판을 가진 모듈만 추출
  const eligibleModules = modules.filter(mod => (mod.stoneTopThickness || 0) > 0);
  if (eligibleModules.length === 0) return [];

  const sorted = [...eligibleModules].sort((a, b) => a.position.x - b.position.x);

  const alphaMap = new Map<string, string>();
  sorted.forEach((mod, idx) => {
    alphaMap.set(mod.id, String.fromCharCode(65 + idx)); // A, B, C...
  });

  const groups: FrameMergeGroup[] = [];
  let currentGroup: PlacedModule[] = [];
  let currentSum = 0;

  for (const mod of sorted) {
    const widthMm = getEpCorrectedWidth(mod) + (mod.stoneTopLeftOffset || 0) + (mod.stoneTopRightOffset || 0);

    if (currentGroup.length === 0) {
      currentGroup.push(mod);
      currentSum = widthMm;
      continue;
    }

    const prevMod = currentGroup[currentGroup.length - 1];
    
    // 병합 조건 검사
    const sameThickness = prevMod.stoneTopThickness === mod.stoneTopThickness;
    const sameOffsets = 
      (prevMod.stoneTopFrontOffset || 0) === (mod.stoneTopFrontOffset || 0) &&
      (prevMod.stoneTopBackOffset || 0) === (mod.stoneTopBackOffset || 0);
    const sameBackLip = 
      (prevMod.stoneTopBackLip || 0) === (mod.stoneTopBackLip || 0) &&
      (prevMod.stoneTopBackLipThickness || 0) === (mod.stoneTopBackLipThickness || 0) &&
      (prevMod.stoneTopBackLipDepthOffset || 0) === (mod.stoneTopBackLipDepthOffset || 0) &&
      (prevMod.stoneTopBackLipTopOffset || 0) === (mod.stoneTopBackLipTopOffset || 0) &&
      (prevMod.stoneTopBackLipTopBackOffset || 0) === (mod.stoneTopBackLipTopBackOffset || 0) &&
      (prevMod.stoneTopBackLipFullFill || false) === (mod.stoneTopBackLipFullFill || false) &&
      (prevMod.stoneTopBackLipFillHeight || 0) === (mod.stoneTopBackLipFillHeight || 0);
      
    // Z좌표 검사 (앞뒤로 튀어나온 정도가 다르면 병합 불가) - 동일 선상이려면 zOffset이 같아야 함
    const sameZ = Math.abs(prevMod.position.z - mod.position.z) < 0.1;
    // Y좌표 검사 (높이가 다르면 병합 불가)
    const sameY = Math.abs(prevMod.position.y - mod.position.y) < 0.1;
    // X좌표(인접) 검사 - 이전 모듈의 우측 끝과 현재 모듈의 좌측 끝이 맞닿아 있는지 검사
    const prevBounds = getModuleBoundsX(prevMod);
    const currBounds = getModuleBoundsX(mod);
    const isAdjacent = Math.abs(currBounds.left - prevBounds.right) < 1.0; 

    // 상판 좌우 돌출이 있으면 인접 병합이 어색해지므로, 사이에 돌출값이 없는지도 확인
    const noInnerOffsets = (prevMod.stoneTopRightOffset || 0) === 0 && (mod.stoneTopLeftOffset || 0) === 0;

    const fitsWidth = currentSum + widthMm <= maxWidthMm;

    if (sameThickness && sameOffsets && sameBackLip && sameZ && sameY && isAdjacent && noInnerOffsets && fitsWidth) {
      currentGroup.push(mod);
      currentSum += widthMm;
    } else {
      groups.push(buildGroup(currentGroup, currentSum, 0, alphaMap, '상판'));
      currentGroup = [mod];
      currentSum = widthMm;
    }
  }

  if (currentGroup.length > 0) {
    groups.push(buildGroup(currentGroup, currentSum, 0, alphaMap, '상판'));
  }

  // 그룹에 2개 이상의 모듈이 포함된 것만 반환 (1개짜리는 병합 불필요)
  return groups.filter(g => g.moduleIds.length > 1);
}
