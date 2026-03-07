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
  modules: PlacedModule[];
}

/** 인접 판정 허용 오차 (mm) */
const MERGE_TOLERANCE_MM = 1;

/**
 * 배치된 가구 목록에서 걸래받이 스트립 그룹을 계산한다.
 * - 자유배치 + hasBase !== false + category !== 'upper' 인 모듈만 대상
 * - X 범위 기준으로 인접/겹치는 모듈을 하나의 그룹으로 병합
 */
export function computeBaseStripGroups(
  placedModules: PlacedModule[],
): BaseStripGroup[] {
  // 1. 걸래받이 대상 모듈 필터링
  const baseModules = placedModules.filter((m) => {
    if (!m.isFreePlacement) return false;
    const category = getModuleCategory(m);
    if (category === 'upper') return false;
    // hasBase가 undefined인 경우 (기존 데이터) → full/lower는 true 취급
    if (m.hasBase === false) return false;
    return true;
  });

  if (baseModules.length === 0) return [];

  // 2. X 범위 계산 및 left 기준 정렬
  const boundsWithModule = baseModules.map((m) => ({
    module: m,
    bounds: getModuleBoundsX(m),
    depthMM: m.freeDepth || 580,
  }));
  boundsWithModule.sort((a, b) => a.bounds.left - b.bounds.left);

  // 3. 인접/겹치는 모듈 병합
  const groups: BaseStripGroup[] = [];
  let currentGroup: BaseStripGroup = {
    id: `base-strip-${boundsWithModule[0].module.id}`,
    leftMM: boundsWithModule[0].bounds.left,
    rightMM: boundsWithModule[0].bounds.right,
    depthMM: boundsWithModule[0].depthMM,
    modules: [boundsWithModule[0].module],
  };

  for (let i = 1; i < boundsWithModule.length; i++) {
    const item = boundsWithModule[i];
    // 현재 그룹의 우측 경계와 다음 모듈의 좌측 경계가 허용오차 내면 병합
    if (item.bounds.left <= currentGroup.rightMM + MERGE_TOLERANCE_MM) {
      currentGroup.rightMM = Math.max(currentGroup.rightMM, item.bounds.right);
      currentGroup.depthMM = Math.max(currentGroup.depthMM, item.depthMM);
      currentGroup.modules.push(item.module);
    } else {
      groups.push(currentGroup);
      currentGroup = {
        id: `base-strip-${item.module.id}`,
        leftMM: item.bounds.left,
        rightMM: item.bounds.right,
        depthMM: item.depthMM,
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
  }));
  boundsWithModule.sort((a, b) => a.bounds.left - b.bounds.left);

  const groups: BaseStripGroup[] = [];
  let currentGroup: BaseStripGroup = {
    id: `top-strip-${boundsWithModule[0].module.id}`,
    leftMM: boundsWithModule[0].bounds.left,
    rightMM: boundsWithModule[0].bounds.right,
    depthMM: boundsWithModule[0].depthMM,
    modules: [boundsWithModule[0].module],
  };

  for (let i = 1; i < boundsWithModule.length; i++) {
    const item = boundsWithModule[i];
    if (item.bounds.left <= currentGroup.rightMM + MERGE_TOLERANCE_MM) {
      currentGroup.rightMM = Math.max(currentGroup.rightMM, item.bounds.right);
      currentGroup.depthMM = Math.max(currentGroup.depthMM, item.depthMM);
      currentGroup.modules.push(item.module);
    } else {
      groups.push(currentGroup);
      currentGroup = {
        id: `top-strip-${item.module.id}`,
        leftMM: item.bounds.left,
        rightMM: item.bounds.right,
        depthMM: item.depthMM,
        modules: [item.module],
      };
    }
  }
  groups.push(currentGroup);

  return groups;
}
