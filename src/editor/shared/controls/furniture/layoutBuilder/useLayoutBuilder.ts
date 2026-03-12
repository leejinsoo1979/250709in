/**
 * 레이아웃 빌더 상태 관리 훅
 *
 * 분할(split), 병합(merge), 비율조정(resize) 로직 제공.
 * 최대 3단계 분할 제한.
 */

import { useState, useCallback, useMemo } from 'react';
import {
  LayoutNode,
  LeafRect,
  ResizeHandle,
  SplitDirection,
  createInitialLayout,
  getNodeDepth,
  MIN_SECTION_SIZE,
  MAX_SPLIT_DEPTH,
} from './types';
import { v4 as uuidv4 } from 'uuid';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function useLayoutBuilder(totalWidthMM: number, totalHeightMM: number) {
  const [layout, setLayout] = useState<LayoutNode>(createInitialLayout());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // 노드를 ID로 찾기
  const findNode = useCallback((root: LayoutNode, id: string): LayoutNode | null => {
    if (root.id === id) return root;
    if (root.children) {
      for (const child of root.children) {
        const found = findNode(child, id);
        if (found) return found;
      }
    }
    return null;
  }, []);

  // 부모 노드 찾기
  const findParent = useCallback((root: LayoutNode, targetId: string): LayoutNode | null => {
    if (root.children) {
      for (const child of root.children) {
        if (child.id === targetId) return root;
        const found = findParent(child, targetId);
        if (found) return found;
      }
    }
    return null;
  }, []);

  // 트리 딥 클론 + 노드 교체
  const replaceNode = useCallback((root: LayoutNode, targetId: string, newNode: LayoutNode): LayoutNode => {
    if (root.id === targetId) return newNode;
    if (root.children) {
      return {
        ...root,
        children: root.children.map(child => replaceNode(child, targetId, newNode)),
      };
    }
    return { ...root };
  }, []);

  // 분할: leaf → direction + 2 children
  // vertical 분할 시 하부 1000mm 기본 높이 적용 (루트 레벨에서만)
  const splitNode = useCallback((nodeId: string, direction: SplitDirection) => {
    setLayout(prev => {
      const depth = getNodeDepth(prev, nodeId);
      if (depth < 0 || depth >= MAX_SPLIT_DEPTH) return prev;

      const node = findNode(prev, nodeId);
      if (!node || node.direction !== 'leaf') return prev;

      // vertical 분할 + 루트 레벨(depth=0): 하부 외경 1000mm 기본
      let upperRatio = 0.5;
      let lowerRatio = 0.5;
      if (direction === 'vertical' && depth === 0 && totalHeightMM > 1200) {
        const lowerOuter = 1000;
        lowerRatio = lowerOuter / totalHeightMM;
        upperRatio = 1 - lowerRatio;
      }

      // 캔버스 Y축: children[0]=위(상부), children[1]=아래(하부)
      const newNode: LayoutNode = {
        ...node,
        direction,
        children: [
          { id: uuidv4(), direction: 'leaf', ratio: direction === 'vertical' ? upperRatio : 0.5 },
          { id: uuidv4(), direction: 'leaf', ratio: direction === 'vertical' ? lowerRatio : 0.5 },
        ],
      };

      return replaceNode(prev, nodeId, newNode);
    });
  }, [findNode, replaceNode, totalHeightMM]);

  // 병합: 부모의 children 제거 → leaf로 전환
  const mergeNode = useCallback((nodeId: string) => {
    setLayout(prev => {
      // nodeId가 부모 노드인 경우
      const node = findNode(prev, nodeId);
      if (node && node.children) {
        const newNode: LayoutNode = {
          id: node.id,
          direction: 'leaf',
          ratio: node.ratio,
        };
        return replaceNode(prev, nodeId, newNode);
      }

      // nodeId가 자식 노드인 경우 → 부모를 병합
      const parent = findParent(prev, nodeId);
      if (parent && parent.children) {
        const newNode: LayoutNode = {
          id: parent.id,
          direction: 'leaf',
          ratio: parent.ratio,
        };
        return replaceNode(prev, parent.id, newNode);
      }

      return prev;
    });
  }, [findNode, findParent, replaceNode]);

  // 비율 조정: childIndex 번째 child의 비율 변경 (인접 child 보정)
  const resizeNode = useCallback((parentId: string, childIndex: number, delta: number) => {
    setLayout(prev => {
      const parent = findNode(prev, parentId);
      if (!parent || !parent.children || childIndex >= parent.children.length - 1) return prev;

      const children = [...parent.children];
      const child = children[childIndex];
      const sibling = children[childIndex + 1];

      let newRatio = child.ratio + delta;
      let siblingRatio = sibling.ratio - delta;

      // 최소 비율 제한 (MIN_SECTION_SIZE / totalSize)
      const totalSize = parent.direction === 'horizontal' ? totalWidthMM : totalHeightMM;
      const minRatio = MIN_SECTION_SIZE / totalSize;

      if (newRatio < minRatio) {
        newRatio = minRatio;
        siblingRatio = child.ratio + sibling.ratio - minRatio;
      }
      if (siblingRatio < minRatio) {
        siblingRatio = minRatio;
        newRatio = child.ratio + sibling.ratio - minRatio;
      }

      children[childIndex] = { ...child, ratio: newRatio };
      children[childIndex + 1] = { ...sibling, ratio: siblingRatio };

      const newParent: LayoutNode = { ...parent, children };
      return replaceNode(prev, parentId, newParent);
    });
  }, [findNode, replaceNode, totalWidthMM, totalHeightMM]);

  // mm 값으로 직접 리사이즈: nodeId의 치수를 newSizeMM로 설정
  const resizeNodeByMM = useCallback((nodeId: string, newSizeMM: number) => {
    setLayout(prev => {
      const parent = findParent(prev, nodeId);
      if (!parent || !parent.children) return prev;

      const childIndex = parent.children.findIndex(c => c.id === nodeId);
      if (childIndex < 0) return prev;

      // 부모의 실제 mm 크기를 루트에서 재귀적으로 계산
      const computeNodeMM = (node: LayoutNode, wMM: number, hMM: number, targetId: string): { w: number; h: number } | null => {
        if (node.id === targetId) return { w: wMM, h: hMM };
        if (!node.children) return null;
        for (const child of node.children) {
          const cw = node.direction === 'horizontal' ? wMM * child.ratio : wMM;
          const ch = node.direction === 'vertical' ? hMM * child.ratio : hMM;
          const found = computeNodeMM(child, cw, ch, targetId);
          if (found) return found;
        }
        return null;
      };

      const parentMM = computeNodeMM(prev, totalWidthMM, totalHeightMM, parent.id);
      if (!parentMM) return prev;

      // 부모 방향에 맞는 축의 총 mm
      const totalParentMM = parent.direction === 'horizontal' ? parentMM.w : parentMM.h;

      // 새 ratio 계산
      const clampedSize = Math.max(MIN_SECTION_SIZE, Math.min(newSizeMM, totalParentMM - MIN_SECTION_SIZE * (parent.children.length - 1)));
      const newRatio = clampedSize / totalParentMM;

      // 나머지 children의 ratio를 비례적으로 재분배
      const oldRatio = parent.children[childIndex].ratio;
      const remainingOldRatio = 1 - oldRatio;
      const remainingNewRatio = 1 - newRatio;

      const children = parent.children.map((child, i) => {
        if (i === childIndex) return { ...child, ratio: newRatio };
        if (remainingOldRatio > 0) {
          return { ...child, ratio: (child.ratio / remainingOldRatio) * remainingNewRatio };
        }
        // fallback: 균등 분배
        return { ...child, ratio: remainingNewRatio / (parent.children!.length - 1) };
      });

      const newParent: LayoutNode = { ...parent, children };
      return replaceNode(prev, parent.id, newParent);
    });
  }, [findParent, replaceNode, totalWidthMM, totalHeightMM]);

  // 리셋
  const resetLayout = useCallback(() => {
    setLayout(createInitialLayout());
    setSelectedNodeId(null);
  }, []);

  // leaf 사각형 좌표 계산 (캔버스 렌더링용)
  const computeRects = useCallback((
    node: LayoutNode,
    rect: Rect,
    parentWidthMM: number,
    parentHeightMM: number,
    depth = 0,
  ): LeafRect[] => {
    if (node.direction === 'leaf') {
      return [{
        nodeId: node.id,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        widthMM: Math.round(parentWidthMM),
        heightMM: Math.round(parentHeightMM),
        depth,
      }];
    }

    if (!node.children) return [];

    const results: LeafRect[] = [];
    let offset = 0;

    for (const child of node.children) {
      let childRect: Rect;
      let childWidthMM: number;
      let childHeightMM: number;

      if (node.direction === 'horizontal') {
        const childW = rect.width * child.ratio;
        childRect = {
          x: rect.x + offset,
          y: rect.y,
          width: childW,
          height: rect.height,
        };
        childWidthMM = parentWidthMM * child.ratio;
        childHeightMM = parentHeightMM;
        offset += childW;
      } else {
        const childH = rect.height * child.ratio;
        childRect = {
          x: rect.x,
          y: rect.y + offset,
          width: rect.width,
          height: childH,
        };
        childWidthMM = parentWidthMM;
        childHeightMM = parentHeightMM * child.ratio;
        offset += childH;
      }

      results.push(...computeRects(child, childRect, childWidthMM, childHeightMM, depth + 1));
    }

    return results;
  }, []);

  // 리사이즈 핸들 좌표 계산
  const computeHandles = useCallback((
    node: LayoutNode,
    rect: Rect,
    depth = 0,
  ): ResizeHandle[] => {
    if (node.direction === 'leaf' || !node.children) return [];

    const handles: ResizeHandle[] = [];
    let offset = 0;

    for (let i = 0; i < node.children.length - 1; i++) {
      const child = node.children[i];
      const sibling = node.children[i + 1];

      if (node.direction === 'horizontal') {
        offset += rect.width * child.ratio;
        handles.push({
          nodeId: child.id,
          siblingId: sibling.id,
          parentId: node.id,
          direction: 'horizontal',
          x: rect.x + offset,
          y: rect.y,
          length: rect.height,
        });
      } else {
        offset += rect.height * child.ratio;
        handles.push({
          nodeId: child.id,
          siblingId: sibling.id,
          parentId: node.id,
          direction: 'vertical',
          x: rect.x,
          y: rect.y + offset,
          length: rect.width,
        });
      }
    }

    // 재귀: children 내부 핸들도 계산
    offset = 0;
    for (const child of node.children) {
      let childRect: Rect;
      if (node.direction === 'horizontal') {
        const childW = rect.width * child.ratio;
        childRect = { x: rect.x + offset, y: rect.y, width: childW, height: rect.height };
        offset += childW;
      } else {
        const childH = rect.height * child.ratio;
        childRect = { x: rect.x, y: rect.y, width: rect.width, height: childH };
        offset += childH;
      }
      handles.push(...computeHandles(child, childRect, depth + 1));
    }

    return handles;
  }, []);

  // 노드가 분할 가능한지
  const canSplit = useCallback((nodeId: string): boolean => {
    const depth = getNodeDepth(layout, nodeId);
    const node = findNode(layout, nodeId);
    return depth >= 0 && depth < MAX_SPLIT_DEPTH && node?.direction === 'leaf';
  }, [layout, findNode]);

  // 노드가 병합 가능한지 (부모가 있고 부모에 children이 있으면)
  const canMerge = useCallback((nodeId: string): boolean => {
    // 자식 노드인 경우: 부모의 children을 병합
    const parent = findParent(layout, nodeId);
    if (parent && parent.children) return true;
    // 직접 분할된 노드인 경우
    const node = findNode(layout, nodeId);
    if (node && node.children) return true;
    return false;
  }, [layout, findNode, findParent]);

  // leaf 수 세기
  const leafCount = useMemo(() => {
    const count = (node: LayoutNode): number => {
      if (node.direction === 'leaf') return 1;
      return node.children?.reduce((sum, child) => sum + count(child), 0) ?? 0;
    };
    return count(layout);
  }, [layout]);

  return {
    layout,
    selectedNodeId,
    setSelectedNodeId,
    splitNode,
    mergeNode,
    resizeNode,
    resizeNodeByMM,
    resetLayout,
    computeRects,
    computeHandles,
    canSplit,
    canMerge,
    leafCount,
  };
}
