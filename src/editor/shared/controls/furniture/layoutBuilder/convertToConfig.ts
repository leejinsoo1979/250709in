/**
 * LayoutNode 트리 → CustomFurnitureConfig 변환
 *
 * 렌더러 모델: 각 섹션은 독립 박스 (자체 상하판 보유)
 *   → section.height = 내경(inner height), 패널 두께 제외
 *   → N개 섹션: sum(section.height) = furnitureHeight - 2*N*panelThickness
 *
 * 수평 분할(horizontalSplit): 서브박스도 독립 박스
 *   → position = 좌측 박스 내경 너비 (mm)
 *   → 2분할: left+right 내경 합 = sectionInnerW - 2*panelThickness
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

  // 가구 전체 내경 (단일 박스: 상/하판 2개 차감)
  const totalInnerHeight = height - 2 * PANEL_THICKNESS;
  // 가구 전체 내경 너비 (좌/우측판 2개 차감)
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
    // 독립 박스 모델: N개 섹션 × 2개 패널(상하판) = 2N개 패널
    // availableHeight = furnitureHeight - 2*N*panelThickness
    const availableHeight = height - 2 * children.length * PANEL_THICKNESS;

    // 캔버스 순서 → 3D 순서 변환:
    // 캔버스: children[0]=위, children[last]=아래 (Y축 아래로 증가)
    // 3D렌더러: sections[0]=하부, sections[last]=상부 (Y축 위로 증가)
    // → reverse해서 캔버스 아래→sections[0](하부), 캔버스 위→sections[last](상부)
    const reversed = [...children].reverse();

    const sections = reversed.map((child, idx) => {
      const sectionInnerHeight = Math.round(child.ratio * availableHeight);
      const section = createSection(`section-${idx}`, sectionInnerHeight);

      // child가 horizontal → 해당 섹션에 horizontalSplit
      if (child.direction === 'horizontal' && child.children) {
        // 이 섹션 박스의 내경 너비 = 가구 전체 내경 너비 (측판은 가구 레벨)
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
 *
 * 독립 박스 모델: 서브박스도 자체 좌/우 측판 보유
 * - 2분할: left+right 외경 합 = 부모 박스 너비 → 내경 합 = parentInnerW - 2*PT
 * - 3분할: left+center+right 내경 합 = parentInnerW - 4*PT
 *
 * parentInnerWidth: 부모 섹션 박스의 내경 너비 (좌우측판 제외)
 * position = 좌측 서브박스 내경 너비 (mm)
 */
function buildHorizontalSplit(
  hNode: LayoutNode,
  parentInnerWidth: number,
) {
  const children = hNode.children!;
  // 독립 박스 모델: 각 divider는 2개 패널(좌박스 우측판 + 우박스 좌측판)
  const numDividers = children.length - 1;
  const usableWidth = parentInnerWidth - 2 * numDividers * PANEL_THICKNESS;

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
 *
 * areaSubSplit = 서브박스 내에서 상하 2분할 (독립 박스 모델)
 * 2개 서브섹션 × 2패널 = 4패널 → usableHeight = sectionInnerH - 4*PT
 * 하지만 areaSubSplit.lowerHeight는 하부 서브섹션의 내경 높이
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
      // 독립 박스 모델: 2개 서브섹션 → 4개 패널 차감
      const numSubSections = child.children.length;
      const usableHeight = parentInnerHeight - 2 * numSubSections * PANEL_THICKNESS;
      // children[마지막] = 하부
      const lastChild = child.children[child.children.length - 1];
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
