/**
 * 자유배치 모드 프레임 스트립 그룹핑 유틸리티
 * - 하부 걸래받이: 하부/키큰장이 있는 구간에만 생성
 * - 상부 프레임: 상부/키큰장이 있는 구간에만 생성
 * 인접한 가구들은 하나의 연속 스트립으로 병합한다.
 */

import { PlacedModule } from '@/editor/shared/furniture/types';
import { getModuleBoundsX, getModuleCategory } from '@/editor/shared/utils/freePlacementUtils';

/** 걸래받이 스트립 그룹 */
export interface BaseStripGroup {
  id: string;
  leftMM: number;    // 좌측 X 경계 (mm, 공간 중심좌표계)
  rightMM: number;   // 우측 X 경계 (mm)
  depthMM: number;   // 그룹 내 최대 깊이 (mm)
  depthZOffsetMM: number; // 깊이 방향 Z오프셋 (mm, 하부섹션 깊이 축소 시)
  thicknessMM: number; // 그룹 내 최대 프레임 두께 (mm, 0 = 공간 기본값 사용)
  minFreeHeightMM: number; // 그룹 내 최소 freeHeight (mm, 상부프레임 확장 계산용)
  maxFreeHeightMM: number; // 그룹 내 최대 freeHeight (mm, 원래 배치 높이)
  modules: PlacedModule[];
}

/** 인접 판정 허용 오차 (mm) */
const MERGE_TOLERANCE_MM = 1;

/**
 * 하부 섹션 깊이 축소에 따른 Z 오프셋 (mm)
 * 양수 = 뒤로, 음수 = 앞으로
 */
function getLowerDepthZOffsetMM(module: PlacedModule): number {
  const fullDepth = module.freeDepth || 580;
  const lowerDepth = module.lowerSectionDepth;
  if (!lowerDepth || lowerDepth >= fullDepth) return 0;
  const diff = fullDepth - lowerDepth;
  const dir = module.lowerSectionDepthDirection || 'front';
  // front: 앞에서 줄어듦 → 걸래받이도 뒤로 이동 (양수 Z offset)
  // back: 뒤에서 줄어듦 → 걸래받이도 앞으로 이동 (음수 Z offset은 불필요, 앞면 유지)
  return dir === 'front' ? diff : 0;
}

/**
 * 걸래받이용 X 범위 계산 — 하부 섹션의 개별 너비/정렬을 반영
 */
function getBaseFrameBoundsX(module: PlacedModule): { left: number; right: number; category: 'full' | 'upper' | 'lower' } {
  const fullBounds = getModuleBoundsX(module);

  // EP(엔드패널) 적용: 본체 너비 축소 + 비대칭 오프셋
  const hasLeft = module.hasLeftEndPanel;
  const hasRight = module.hasRightEndPanel;
  if (hasLeft || hasRight) {
    const epThk = module.endPanelThickness || 18;
    const leftEpMM = hasLeft ? epThk : 0;
    const rightEpMM = hasRight ? epThk : 0;
    // 본체가 EP 두께만큼 줄어들고, 비대칭이면 중심이 이동
    fullBounds.left += leftEpMM;
    fullBounds.right -= rightEpMM;
  }

  const sections = module.customConfig?.sections;
  if (!sections || sections.length === 0) return fullBounds;

  const lowerSection = sections[0];
  if (!lowerSection.width) return fullBounds;

  const furnitureWidth = module.freeWidth || module.moduleWidth || 450;
  const sectionWidth = Math.min(lowerSection.width, furnitureWidth);
  if (sectionWidth >= furnitureWidth) return fullBounds;

  const centerXmm = module.position.x * 100;
  const halfFW = furnitureWidth / 2;
  const halfSW = sectionWidth / 2;
  const align = lowerSection.align || 'center';

  let offsetMM = 0;
  if (align === 'left') offsetMM = -(halfFW - halfSW);
  else if (align === 'right') offsetMM = halfFW - halfSW;

  return {
    left: centerXmm + offsetMM - halfSW,
    right: centerXmm + offsetMM + halfSW,
    category: fullBounds.category,
  };
}

/**
 * 배치된 가구 목록에서 걸래받이 스트립 그룹을 계산한다.
 * - 자유배치 + hasBase !== false + category !== 'upper' 인 모듈만 대상
 * - X 범위 기준으로 인접/겹치는 모듈을 하나의 그룹으로 병합
 * - 하부 섹션의 개별 너비/정렬을 반영
 */
export function computeBaseStripGroups(
  placedModules: PlacedModule[],
): BaseStripGroup[] {
  // 1. 걸래받이 대상 모듈 필터링 (바닥판 올림 활성 가구는 하부프레임 불필요)
  const baseModules = placedModules.filter((m) => {
    if (!m.isFreePlacement) return false;
    const category = getModuleCategory(m);
    if (category === 'upper') return false;
    // bottomPanelRaise 활성 시 조절발/하부프레임 없음
    const sections = (m as any).customConfig?.sections;
    if (sections?.[0]?.bottomPanelRaise && sections[0].bottomPanelRaise > 0) return false;
    return true;
  });

  if (baseModules.length === 0) return [];

  // 2. X 범위 계산 및 left 기준 정렬 — 하부 섹션 너비/정렬 반영
  const boundsWithModule = baseModules.map((m) => ({
    module: m,
    bounds: getBaseFrameBoundsX(m),
    depthMM: m.lowerSectionDepth || m.freeDepth || 580,
    depthZOffsetMM: getLowerDepthZOffsetMM(m),
  }));
  boundsWithModule.sort((a, b) => a.bounds.left - b.bounds.left);

  // 3. 인접/겹치는 모듈 병합
  const groups: BaseStripGroup[] = [];
  let currentGroup: BaseStripGroup = {
    id: `base-strip-${boundsWithModule[0].module.id}`,
    leftMM: boundsWithModule[0].bounds.left,
    rightMM: boundsWithModule[0].bounds.right,
    depthMM: boundsWithModule[0].depthMM,
    depthZOffsetMM: boundsWithModule[0].depthZOffsetMM,
    thicknessMM: 0,
    minFreeHeightMM: 0,
    maxFreeHeightMM: 0,
    modules: [boundsWithModule[0].module],
  };

  for (let i = 1; i < boundsWithModule.length; i++) {
    const item = boundsWithModule[i];
    // 현재 그룹의 우측 경계와 다음 모듈의 좌측 경계가 허용오차 내면 병합
    if (item.bounds.left <= currentGroup.rightMM + MERGE_TOLERANCE_MM) {
      currentGroup.rightMM = Math.max(currentGroup.rightMM, item.bounds.right);
      currentGroup.depthMM = Math.max(currentGroup.depthMM, item.depthMM);
      currentGroup.depthZOffsetMM = Math.max(currentGroup.depthZOffsetMM, item.depthZOffsetMM);
      currentGroup.modules.push(item.module);
    } else {
      groups.push(currentGroup);
      currentGroup = {
        id: `base-strip-${item.module.id}`,
        leftMM: item.bounds.left,
        rightMM: item.bounds.right,
        depthMM: item.depthMM,
        depthZOffsetMM: item.depthZOffsetMM,
        thicknessMM: 0,
        minFreeHeightMM: 0,
        maxFreeHeightMM: 0,
        modules: [item.module],
      };
    }
  }
  groups.push(currentGroup);

  return groups;
}

/**
 * 배치된 가구 목록에서 상부 프레임 스트립 그룹을 계산한다.
 * - 자유배치 + category === 'upper' 또는 'full' 인 모듈만 대상
 * - X 범위 기준으로 인접/겹치는 모듈을 하나의 그룹으로 병합
 */
export function computeTopStripGroups(
  placedModules: PlacedModule[],
): BaseStripGroup[] {
  const topModules = placedModules.filter((m) => {
    if (!m.isFreePlacement) return false;
    const category = getModuleCategory(m);
    return category === 'upper' || category === 'full';
  });

  if (topModules.length === 0) return [];

  const boundsWithModule = topModules.map((m) => ({
    module: m,
    bounds: getModuleBoundsX(m),
    depthMM: m.freeDepth || 580,
    thicknessMM: m.topFrameThickness || 0,
    freeHeightMM: m.freeHeight || 0,
  }));
  boundsWithModule.sort((a, b) => a.bounds.left - b.bounds.left);

  const groups: BaseStripGroup[] = [];
  let currentGroup: BaseStripGroup = {
    id: `top-strip-${boundsWithModule[0].module.id}`,
    leftMM: boundsWithModule[0].bounds.left,
    rightMM: boundsWithModule[0].bounds.right,
    depthMM: boundsWithModule[0].depthMM,
    depthZOffsetMM: 0,
    thicknessMM: boundsWithModule[0].thicknessMM,
    minFreeHeightMM: boundsWithModule[0].freeHeightMM,
    maxFreeHeightMM: boundsWithModule[0].freeHeightMM,
    modules: [boundsWithModule[0].module],
  };

  for (let i = 1; i < boundsWithModule.length; i++) {
    const item = boundsWithModule[i];
    if (item.bounds.left <= currentGroup.rightMM + MERGE_TOLERANCE_MM) {
      currentGroup.rightMM = Math.max(currentGroup.rightMM, item.bounds.right);
      currentGroup.depthMM = Math.max(currentGroup.depthMM, item.depthMM);
      currentGroup.thicknessMM = Math.max(currentGroup.thicknessMM, item.thicknessMM);
      if (item.freeHeightMM > 0) {
        currentGroup.minFreeHeightMM = currentGroup.minFreeHeightMM > 0
          ? Math.min(currentGroup.minFreeHeightMM, item.freeHeightMM)
          : item.freeHeightMM;
        currentGroup.maxFreeHeightMM = Math.max(currentGroup.maxFreeHeightMM, item.freeHeightMM);
      }
      currentGroup.modules.push(item.module);
    } else {
      groups.push(currentGroup);
      currentGroup = {
        id: `top-strip-${item.module.id}`,
        leftMM: item.bounds.left,
        rightMM: item.bounds.right,
        depthMM: item.depthMM,
        depthZOffsetMM: 0,
        thicknessMM: item.thicknessMM,
        minFreeHeightMM: item.freeHeightMM,
        maxFreeHeightMM: item.freeHeightMM,
        modules: [item.module],
      };
    }
  }
  groups.push(currentGroup);

  return groups;
}
