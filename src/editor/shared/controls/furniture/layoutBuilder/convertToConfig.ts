/**
 * LayoutNode 트리 → CustomFurnitureConfig 변환
 *
 * 핵심: section.height = 내경(inner height), 패널 두께 제외
 *       horizontalSplit.position = 좌측 박스 내경 너비
 *
 * 변환 매핑:
 * - leaf(루트) → sections[0] (단일 섹션, height = 전체 내경)
 * - V-split(루트) → sections[] (상하 분할)
 * - H-split(루트) → sections[0] + horizontalSplit (좌우 분할)
 * - V-split → H-split(child) → sections[i].horizontalSplit
 * - H-split → V-split(child) → areaSubSplits
 */

import { LayoutNode } from './types';
import { CustomFurnitureConfig, CustomSection, CustomElement } from '@/editor/shared/furniture/types';

const PANEL_THICKNESS = 18;
const DEFAULT_ELEMENT: CustomElement[] = [{ type: 'open' }];

interface Dimensions {
  width: number;   // mm (가구 외경 전체 너비)
  height: number;  // mm (가구 외경 전체 높이)
  depth: number;   // mm
}

export function convertToConfig(
  layout: LayoutNode,
  dimensions: Dimensions,
): CustomFurnitureConfig {
  const { width, height } = dimensions;

  // 가구 전체 내경 (상/하판 두께 제외)
  const totalInnerHeight = height - 2 * PANEL_THICKNESS;
  // 가구 전체 내경 너비 (좌/우측판 두께 제외)
  const totalInnerWidth = width - 2 * PANEL_THICKNESS;

  // Case 1: 단일 leaf → 1개 섹션
  if (layout.direction === 'leaf') {
    return {
      sections: [createSection('section-0', totalInnerHeight)],
      panelThickness: PANEL_THICKNESS,
    };
  }

  // Case 2: 루트가 vertical(상하 분할) → sections 배열
  if (layout.direction === 'vertical') {
    const children = layout.children!;
    // 상하 분할 시 중간 패널 고려: 총 내경 = 전체높이 - 외판2개 - 중간패널(N-1)개
    const numDividers = children.length - 1;
    const usableHeight = totalInnerHeight - numDividers * PANEL_THICKNESS;

    const sections = children.map((child, idx) => {
      const sectionInnerHeight = Math.round(child.ratio * usableHeight);
      const section = createSection(`section-${idx}`, sectionInnerHeight);

      // child가 horizontal → 해당 섹션에 horizontalSplit
      if (child.direction === 'horizontal' && child.children) {
        section.horizontalSplit = buildHorizontalSplit(child, totalInnerWidth);
      }

      return section;
    });

    return {
      sections,
      panelThickness: PANEL_THICKNESS,
    };
  }

  // Case 3: 루트가 horizontal(좌우 분할) → 1개 섹션 + horizontalSplit
  if (layout.direction === 'horizontal' && layout.children) {
    const section = createSection('section-0', totalInnerHeight);
    section.horizontalSplit = buildHorizontalSplit(layout, totalInnerWidth);

    // children 중 vertical이 있으면 → areaSubSplits
    const areas = buildAreaSubSplits(layout, totalInnerHeight);
    if (areas) {
      section.areaSubSplits = areas;
    }

    return {
      sections: [section],
      panelThickness: PANEL_THICKNESS,
    };
  }

  // fallback
  return {
    sections: [createSection('section-0', totalInnerHeight)],
    panelThickness: PANEL_THICKNESS,
  };
}

function createSection(id: string, innerHeight: number): CustomSection {
  return {
    id,
    height: innerHeight,
    elements: [{ type: 'open' }],
  };
}

/**
 * horizontal 노드에서 horizontalSplit 생성
 * parentInnerWidth: 부모 섹션의 내경 너비 (좌우측판 제외)
 * position = 좌측 박스 내경 너비 (mm)
 */
function buildHorizontalSplit(
  hNode: LayoutNode,
  parentInnerWidth: number,
) {
  const children = hNode.children!;
  // 좌우 분할 시 중간 칸막이 패널 고려
  const numDividers = children.length - 1;
  const usableWidth = parentInnerWidth - numDividers * PANEL_THICKNESS;

  const leftInnerWidth = Math.round(children[0].ratio * usableWidth);

  if (children.length === 2) {
    return {
      position: leftInnerWidth,
      leftElements: [...DEFAULT_ELEMENT],
      rightElements: [...DEFAULT_ELEMENT],
    };
  }

  // 3분할
  if (children.length >= 3) {
    const centerInnerWidth = Math.round(children[1].ratio * usableWidth);
    return {
      position: leftInnerWidth,
      secondPosition: centerInnerWidth,
      leftElements: [...DEFAULT_ELEMENT],
      centerElements: [...DEFAULT_ELEMENT],
      rightElements: [...DEFAULT_ELEMENT],
    };
  }

  return {
    position: leftInnerWidth,
    leftElements: [...DEFAULT_ELEMENT],
    rightElements: [...DEFAULT_ELEMENT],
  };
}

/**
 * H-split children 중 vertical이 있으면 areaSubSplits 생성
 */
function buildAreaSubSplits(
  hNode: LayoutNode,
  parentInnerHeight: number,
): Record<string, any> | null {
  const children = hNode.children!;
  const areas: Record<string, any> = {};
  let hasSubSplits = false;

  const areaNames = children.length === 2
    ? ['left', 'right']
    : ['left', 'center', 'right'];

  children.forEach((child, idx) => {
    const areaName = areaNames[idx];
    if (child.direction === 'vertical' && child.children) {
      hasSubSplits = true;
      // children[마지막] = 하부, lowerHeight = 하부 내경
      const lastChild = child.children[child.children.length - 1];
      const usableHeight = parentInnerHeight - PANEL_THICKNESS; // 중간 패널 1개
      const lowerHeight = Math.round(lastChild.ratio * usableHeight);
      areas[areaName] = {
        enabled: true,
        lowerHeight,
        upperElements: [...DEFAULT_ELEMENT],
        lowerElements: [...DEFAULT_ELEMENT],
      };
    }
  });

  return hasSubSplits ? areas : null;
}
