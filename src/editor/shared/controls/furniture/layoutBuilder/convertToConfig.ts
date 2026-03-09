/**
 * LayoutNode 트리 → CustomFurnitureConfig 변환
 *
 * 변환 매핑:
 * - V-split(루트) → sections[] (height = ratio × totalHeight)
 * - H-split(루트) → sections[0] + horizontalSplit
 * - V-split → H-split(child) → sections[i] + sections[i].horizontalSplit
 * - H-split → V-split(child) → sections[0] + horizontalSplit + areaSubSplits
 * - leaf(루트) → sections[0] (단일 섹션)
 */

import { LayoutNode } from './types';
import { CustomFurnitureConfig, CustomSection, CustomElement } from '@/editor/shared/furniture/types';

const PANEL_THICKNESS = 18;
const DEFAULT_ELEMENT: CustomElement[] = [{ type: 'open' }];

interface Dimensions {
  width: number;   // mm
  height: number;  // mm
  depth: number;   // mm
}

export function convertToConfig(
  layout: LayoutNode,
  dimensions: Dimensions,
): CustomFurnitureConfig {
  const { width, height } = dimensions;

  // Case 1: 단일 leaf → 1개 섹션
  if (layout.direction === 'leaf') {
    return {
      sections: [createSection('section-0', height)],
      panelThickness: PANEL_THICKNESS,
    };
  }

  // Case 2: 루트가 vertical(상하 분할) → sections 배열
  if (layout.direction === 'vertical') {
    const sections = layout.children!.map((child, idx) => {
      const sectionHeight = Math.round(child.ratio * height);
      const section = createSection(`section-${idx}`, sectionHeight);

      // child가 horizontal → 해당 섹션에 horizontalSplit 추가
      if (child.direction === 'horizontal' && child.children) {
        section.horizontalSplit = buildHorizontalSplit(child, width);
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
    const section = createSection('section-0', height);
    section.horizontalSplit = buildHorizontalSplit(layout, width);

    // children 중 vertical이 있으면 → areaSubSplits
    const areas = buildAreaSubSplits(layout, height);
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
    sections: [createSection('section-0', height)],
    panelThickness: PANEL_THICKNESS,
  };
}

function createSection(id: string, height: number): CustomSection {
  return {
    id,
    height,
    elements: [...DEFAULT_ELEMENT],
  };
}

/**
 * horizontal 노드에서 horizontalSplit 생성
 * children[0] = left, children[1] = right (2분할)
 * children[0] = left, children[1] = center, children[2] = right (3분할)
 */
function buildHorizontalSplit(
  hNode: LayoutNode,
  parentWidth: number,
) {
  const children = hNode.children!;
  const leftWidth = Math.round(children[0].ratio * parentWidth) - PANEL_THICKNESS;

  if (children.length === 2) {
    return {
      position: leftWidth,
      leftElements: [...DEFAULT_ELEMENT],
      rightElements: [...DEFAULT_ELEMENT],
    };
  }

  // 3분할
  if (children.length >= 3) {
    const centerWidth = Math.round(children[1].ratio * parentWidth) - PANEL_THICKNESS;
    return {
      position: leftWidth,
      secondPosition: centerWidth,
      leftElements: [...DEFAULT_ELEMENT],
      centerElements: [...DEFAULT_ELEMENT],
      rightElements: [...DEFAULT_ELEMENT],
    };
  }

  return {
    position: leftWidth,
    leftElements: [...DEFAULT_ELEMENT],
    rightElements: [...DEFAULT_ELEMENT],
  };
}

/**
 * H-split의 children 중 vertical이 있으면 areaSubSplits 생성
 * left child가 vertical → areaSubSplits.left
 * right child가 vertical → areaSubSplits.right
 */
function buildAreaSubSplits(
  hNode: LayoutNode,
  parentHeight: number,
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
      // 아래→위 순서 (children은 위→아래이므로 마지막이 하부)
      const lastChild = child.children[child.children.length - 1];
      const lowerHeight = Math.round(lastChild.ratio * parentHeight);
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
