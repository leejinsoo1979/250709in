/**
 * 2D 레이아웃 캔버스
 *
 * LayoutNode 트리를 실제 가구 비율의 2D 사각형으로 시각화.
 * - 각 leaf 클릭 → 선택 + 인라인 분할 버튼
 * - 경계 드래그 → 비율 조정
 * - 각 셀에 실제 치수(mm) 표시
 */

import React, { useRef, useCallback, useMemo, useState } from 'react';
import { LayoutNode, LeafRect, ResizeHandle } from './types';
import styles from './LayoutBuilderPopup.module.css';

interface LayoutCanvasProps {
  layout: LayoutNode;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  totalWidthMM: number;
  totalHeightMM: number;
  computeRects: (
    node: LayoutNode,
    rect: { x: number; y: number; width: number; height: number },
    widthMM: number,
    heightMM: number,
    depth?: number,
  ) => LeafRect[];
  computeHandles: (
    node: LayoutNode,
    rect: { x: number; y: number; width: number; height: number },
    depth?: number,
  ) => ResizeHandle[];
  onResize: (parentId: string, childIndex: number, delta: number) => void;
  canSplit: (nodeId: string) => boolean;
  onSplit: (nodeId: string, direction: 'horizontal' | 'vertical') => void;
}

// 캔버스 최대 영역 내에서 비율 유지하면서 가능한 크게 그림
const MAX_CANVAS_WIDTH = 580;
const MAX_CANVAS_HEIGHT = 420;
const HANDLE_HIT_AREA = 12;

const LayoutCanvas: React.FC<LayoutCanvasProps> = ({
  layout,
  selectedNodeId,
  onSelectNode,
  totalWidthMM,
  totalHeightMM,
  computeRects,
  computeHandles,
  onResize,
  canSplit,
  onSplit,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<{
    parentId: string;
    childIndex: number;
    direction: 'horizontal' | 'vertical';
    startPos: number;
    totalSize: number;
  } | null>(null);

  // 비율 유지하면서 최대 크기 계산
  const { canvasWidth, canvasHeight } = useMemo(() => {
    const aspect = totalWidthMM / totalHeightMM;
    let w = MAX_CANVAS_WIDTH;
    let h = w / aspect;
    if (h > MAX_CANVAS_HEIGHT) {
      h = MAX_CANVAS_HEIGHT;
      w = h * aspect;
    }
    return { canvasWidth: Math.round(w), canvasHeight: Math.round(h) };
  }, [totalWidthMM, totalHeightMM]);

  const canvasRect = useMemo(
    () => ({ x: 0, y: 0, width: canvasWidth, height: canvasHeight }),
    [canvasWidth, canvasHeight],
  );

  const leafRects = useMemo(
    () => computeRects(layout, canvasRect, totalWidthMM, totalHeightMM),
    [layout, canvasRect, totalWidthMM, totalHeightMM, computeRects],
  );

  const handles = useMemo(
    () => computeHandles(layout, canvasRect),
    [layout, canvasRect, computeHandles],
  );

  // 핸들의 childIndex (부모 children에서 몇 번째인지)
  const getChildIndex = useCallback((handle: ResizeHandle): number => {
    const find = (node: LayoutNode, id: string): LayoutNode | null => {
      if (node.id === id) return node;
      if (node.children) for (const c of node.children) {
        const f = find(c, id);
        if (f) return f;
      }
      return null;
    };
    const parent = find(layout, handle.parentId);
    if (!parent?.children) return 0;
    return parent.children.findIndex(c => c.id === handle.nodeId);
  }, [layout]);

  const handleMouseDown = useCallback((e: React.MouseEvent, handle: ResizeHandle) => {
    e.preventDefault();
    e.stopPropagation();
    const childIndex = getChildIndex(handle);
    // 부모 노드의 해당 방향 전체 사이즈 (px)
    const find = (node: LayoutNode, id: string): LayoutNode | null => {
      if (node.id === id) return node;
      if (node.children) for (const c of node.children) {
        const f = find(c, id);
        if (f) return f;
      }
      return null;
    };
    // 부모가 루트면 캔버스 전체, 아니면 부모의 실제 영역을 구해야 하지만
    // 간단하게 핸들 방향의 캔버스 전체 사이즈 사용 (비율 기반이므로)
    const totalSize = handle.direction === 'horizontal' ? canvasWidth : canvasHeight;
    setDragState({
      parentId: handle.parentId,
      childIndex,
      direction: handle.direction,
      startPos: handle.direction === 'horizontal' ? e.clientX : e.clientY,
      totalSize,
    });
  }, [getChildIndex, canvasWidth, canvasHeight]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragState) return;
    const currentPos = dragState.direction === 'horizontal' ? e.clientX : e.clientY;
    const pixelDelta = currentPos - dragState.startPos;
    const ratioDelta = pixelDelta / dragState.totalSize;
    if (Math.abs(ratioDelta) > 0.003) {
      onResize(dragState.parentId, dragState.childIndex, ratioDelta);
      setDragState(prev => prev ? { ...prev, startPos: currentPos } : null);
    }
  }, [dragState, onResize]);

  const handleMouseUp = useCallback(() => {
    setDragState(null);
  }, []);

  // 셀이 작으면 치수 표기를 간결하게
  const renderCellContent = (rect: LeafRect, isSelected: boolean, splitAllowed: boolean) => {
    const isSmall = rect.width < 80 || rect.height < 60;
    const isTiny = rect.width < 50 || rect.height < 40;

    return (
      <div className={styles.cellContent}>
        {!isTiny && (
          <span className={styles.cellDimension}>
            {rect.widthMM} × {rect.heightMM}
          </span>
        )}
        {isTiny && (
          <span className={styles.cellDimensionSub}>
            {rect.widthMM}×{rect.heightMM}
          </span>
        )}
        {isSelected && splitAllowed && !isSmall && (
          <div className={styles.cellActions}>
            <button
              className={styles.cellActionBtn}
              onClick={(e) => { e.stopPropagation(); onSplit(rect.nodeId, 'horizontal'); }}
              title="좌우 분할"
            >
              ┃
            </button>
            <button
              className={styles.cellActionBtn}
              onClick={(e) => { e.stopPropagation(); onSplit(rect.nodeId, 'vertical'); }}
              title="상하 분할"
            >
              ━
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.canvasWrapper}>
      <div
        ref={containerRef}
        className={styles.canvas}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className={styles.canvasInner}
          style={{ width: canvasWidth, height: canvasHeight }}
        >
          {/* Leaf 셀 */}
          {leafRects.map((rect) => {
            const isSelected = selectedNodeId === rect.nodeId;
            const splitAllowed = canSplit(rect.nodeId);

            return (
              <div
                key={rect.nodeId}
                className={`${styles.cell} ${isSelected ? styles.cellSelected : ''}`}
                style={{
                  left: rect.x,
                  top: rect.y,
                  width: rect.width,
                  height: rect.height,
                }}
                onClick={(e) => { e.stopPropagation(); onSelectNode(rect.nodeId); }}
              >
                {renderCellContent(rect, isSelected, splitAllowed)}
              </div>
            );
          })}

          {/* 리사이즈 핸들 */}
          {handles.map((handle, idx) => {
            const isH = handle.direction === 'horizontal';
            return (
              <div
                key={`h-${idx}`}
                className={`${styles.handle} ${isH ? styles.handleH : styles.handleV}`}
                style={
                  isH
                    ? {
                        left: handle.x - HANDLE_HIT_AREA / 2,
                        top: handle.y,
                        width: HANDLE_HIT_AREA,
                        height: handle.length,
                      }
                    : {
                        left: handle.x,
                        top: handle.y - HANDLE_HIT_AREA / 2,
                        width: handle.length,
                        height: HANDLE_HIT_AREA,
                      }
                }
                onMouseDown={(e) => handleMouseDown(e, handle)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default LayoutCanvas;
