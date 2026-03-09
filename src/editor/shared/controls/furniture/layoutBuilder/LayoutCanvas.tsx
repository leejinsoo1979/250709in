/**
 * 2D 레이아웃 캔버스
 *
 * LayoutNode 트리를 2D 사각형으로 시각화.
 * 각 leaf: 클릭 → 선택, 치수 표시
 * 경계: 드래그 핸들 → 비율 조정
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

const CANVAS_WIDTH = 500;
const CANVAS_PADDING = 20;
const HANDLE_WIDTH = 8;

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

  // 캔버스 비율 계산
  const canvasHeight = useMemo(
    () => Math.round(CANVAS_WIDTH * (totalHeightMM / totalWidthMM)),
    [totalWidthMM, totalHeightMM],
  );

  const canvasRect = useMemo(
    () => ({ x: 0, y: 0, width: CANVAS_WIDTH, height: canvasHeight }),
    [canvasHeight],
  );

  // leaf 사각형 + 핸들 계산
  const leafRects = useMemo(
    () => computeRects(layout, canvasRect, totalWidthMM, totalHeightMM),
    [layout, canvasRect, totalWidthMM, totalHeightMM, computeRects],
  );

  const handles = useMemo(
    () => computeHandles(layout, canvasRect),
    [layout, canvasRect, computeHandles],
  );

  // 핸들의 childIndex 계산 (부모의 children에서 해당 child의 인덱스)
  const getChildIndex = useCallback((handle: ResizeHandle): number => {
    const findNodeById = (node: LayoutNode, id: string): LayoutNode | null => {
      if (node.id === id) return node;
      if (node.children) {
        for (const c of node.children) {
          const found = findNodeById(c, id);
          if (found) return found;
        }
      }
      return null;
    };

    const parent = findNodeById(layout, handle.parentId);
    if (!parent?.children) return 0;
    return parent.children.findIndex(c => c.id === handle.nodeId);
  }, [layout]);

  // 드래그 시작
  const handleMouseDown = useCallback((
    e: React.MouseEvent,
    handle: ResizeHandle,
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const childIndex = getChildIndex(handle);
    const totalSize = handle.direction === 'horizontal'
      ? canvasRect.width
      : canvasRect.height;

    setDragState({
      parentId: handle.parentId,
      childIndex,
      direction: handle.direction,
      startPos: handle.direction === 'horizontal' ? e.clientX : e.clientY,
      totalSize,
    });
  }, [getChildIndex, canvasRect]);

  // 드래그 이동
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragState) return;

    const currentPos = dragState.direction === 'horizontal' ? e.clientX : e.clientY;
    const pixelDelta = currentPos - dragState.startPos;
    const ratioDelta = pixelDelta / dragState.totalSize;

    if (Math.abs(ratioDelta) > 0.005) {
      onResize(dragState.parentId, dragState.childIndex, ratioDelta);
      setDragState(prev => prev ? { ...prev, startPos: currentPos } : null);
    }
  }, [dragState, onResize]);

  // 드래그 종료
  const handleMouseUp = useCallback(() => {
    setDragState(null);
  }, []);

  return (
    <div
      ref={containerRef}
      className={styles.canvas}
      style={{
        width: CANVAS_WIDTH + CANVAS_PADDING * 2,
        height: canvasHeight + CANVAS_PADDING * 2,
        padding: CANVAS_PADDING,
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div
        className={styles.canvasInner}
        style={{ width: CANVAS_WIDTH, height: canvasHeight, position: 'relative' }}
      >
        {/* Leaf 셀 렌더링 */}
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
              onClick={(e) => {
                e.stopPropagation();
                onSelectNode(rect.nodeId);
              }}
            >
              <div className={styles.cellContent}>
                <span className={styles.cellDimension}>
                  {rect.widthMM} × {rect.heightMM}
                </span>
                {isSelected && splitAllowed && (
                  <div className={styles.splitButtons}>
                    <button
                      className={styles.splitBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSplit(rect.nodeId, 'horizontal');
                      }}
                      title="좌우 분할"
                    >
                      ↔
                    </button>
                    <button
                      className={styles.splitBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSplit(rect.nodeId, 'vertical');
                      }}
                      title="상하 분할"
                    >
                      ↕
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* 리사이즈 핸들 렌더링 */}
        {handles.map((handle, idx) => {
          const isHorizontal = handle.direction === 'horizontal';

          return (
            <div
              key={`handle-${idx}`}
              className={`${styles.handle} ${isHorizontal ? styles.handleH : styles.handleV}`}
              style={
                isHorizontal
                  ? {
                      left: handle.x - HANDLE_WIDTH / 2,
                      top: handle.y,
                      width: HANDLE_WIDTH,
                      height: handle.length,
                    }
                  : {
                      left: handle.x,
                      top: handle.y - HANDLE_WIDTH / 2,
                      width: handle.length,
                      height: HANDLE_WIDTH,
                    }
              }
              onMouseDown={(e) => handleMouseDown(e, handle)}
            />
          );
        })}
      </div>
    </div>
  );
};

export default LayoutCanvas;
