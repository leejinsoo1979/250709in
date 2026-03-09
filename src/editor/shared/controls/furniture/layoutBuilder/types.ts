/**
 * 레이아웃 빌더 팝업 내부 타입 정의
 *
 * LayoutNode 트리 구조로 2D 섹션 레이아웃을 표현.
 * 확인 시 convertToConfig()로 CustomFurnitureConfig로 변환.
 * 최대 2단계 분할 (루트 → 1차 children → leaf만 허용)
 */

export interface LayoutNode {
  id: string;
  direction: 'leaf' | 'horizontal' | 'vertical';
  // leaf: 최종 섹션 (빈 영역)
  // horizontal: 좌우 분할 (children 좌→우)
  // vertical: 상하 분할 (children 위→아래)
  ratio: number; // 부모 대비 비율 (0~1)
  children?: LayoutNode[];
}

// 캔버스에서 각 leaf의 절대 좌표
export interface LeafRect {
  nodeId: string;
  x: number;      // px (캔버스 기준)
  y: number;
  width: number;   // px
  height: number;
  widthMM: number; // mm (실제 치수)
  heightMM: number;
  depth: number;   // 트리 깊이 (0=루트, 1=1단계, 2=2단계)
}

// 드래그 핸들 정보
export interface ResizeHandle {
  nodeId: string;       // 리사이즈 대상 노드 (첫 번째 child)
  siblingId: string;    // 인접 노드 (두 번째 child)
  parentId: string;     // 부모 노드 ID
  direction: 'horizontal' | 'vertical'; // 핸들 방향
  x: number;            // px
  y: number;
  length: number;       // px (핸들 길이)
}

// 분할 방향 옵션
export type SplitDirection = 'horizontal' | 'vertical';

// 최소 섹션 크기 (mm)
export const MIN_SECTION_SIZE = 100;

// 최대 분할 깊이
export const MAX_SPLIT_DEPTH = 2;

// 초기 레이아웃: 단일 leaf (분할 없음)
export function createInitialLayout(): LayoutNode {
  return { id: 'root', direction: 'leaf', ratio: 1 };
}

// 노드 깊이 계산
export function getNodeDepth(root: LayoutNode, targetId: string, currentDepth = 0): number {
  if (root.id === targetId) return currentDepth;
  if (root.children) {
    for (const child of root.children) {
      const depth = getNodeDepth(child, targetId, currentDepth + 1);
      if (depth >= 0) return depth;
    }
  }
  return -1;
}

// 노드가 분할 가능한지 확인 (최대 2단계)
export function canSplitNode(root: LayoutNode, nodeId: string): boolean {
  const depth = getNodeDepth(root, nodeId);
  return depth >= 0 && depth < MAX_SPLIT_DEPTH;
}
