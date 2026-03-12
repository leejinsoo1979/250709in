/**
 * 레이아웃 빌더 팝업
 *
 * 커스텀 가구 생성 시 2D 인터랙티브 UI로 섹션 레이아웃 설계.
 * - 싱글(500mm)/듀얼(1000mm) 타입 선택
 * - 가구 비율에 맞는 캔버스에 섹션 시각화
 * - 클릭으로 선택 → 분할/병합
 * - 드래그로 경계 조정
 * - 확인 시 CustomFurnitureConfig로 변환
 */

import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CustomFurnitureConfig } from '@/editor/shared/furniture/types';
import { useLayoutBuilder } from './useLayoutBuilder';
import { convertToConfig } from './convertToConfig';
import LayoutCanvas from './LayoutCanvas';
import LayoutToolbar from './LayoutToolbar';
import styles from './LayoutBuilderPopup.module.css';

interface LayoutBuilderPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (config: CustomFurnitureConfig, width: number, height: number, depth: number) => void;
  category: 'full' | 'upper' | 'lower';
  dimensions: {
    width: number;
    height: number;
    depth: number;
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  full: '캐비닛만들기',
  upper: '커스텀 상부장',
  lower: '커스텀 하부장',
};

const LayoutBuilderPopup: React.FC<LayoutBuilderPopupProps> = ({
  isOpen,
  onClose,
  onConfirm,
  category,
  dimensions,
}) => {
  // 싱글/듀얼 타입 (full 카테고리에서만 사용)
  const [cabinetType, setCabinetType] = useState<'single' | 'dual'>('dual');
  const [typeConfirmed, setTypeConfirmed] = useState(false);
  const [customWidth, setCustomWidth] = useState<number>(1000);
  const [customHeight, setCustomHeight] = useState<number>(dimensions.height);
  const [customDepth, setCustomDepth] = useState<number>(dimensions.depth);
  const currentWidth = category === 'full' ? customWidth : dimensions.width;
  const currentHeight = customHeight;
  const currentDepth = customDepth;

  const {
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
  } = useLayoutBuilder(currentWidth, currentHeight);

  // 팝업 열릴 때 초기화
  useEffect(() => {
    if (isOpen) {
      setCabinetType('dual');
      setCustomWidth(1000);
      setCustomHeight(dimensions.height);
      setCustomDepth(dimensions.depth);
      setTypeConfirmed(false);
    }
  }, [isOpen, dimensions.height, dimensions.depth]);

  // 타입 변경 시 레이아웃 리셋
  const handleTypeChange = useCallback((type: 'single' | 'dual') => {
    setCabinetType(type);
    setCustomWidth(type === 'single' ? 500 : 1000);
    setTypeConfirmed(true);
    resetLayout();
  }, [resetLayout]);

  // 커스텀 너비 변경
  const handleWidthChange = useCallback((value: number) => {
    const clamped = Math.max(200, Math.min(2400, value));
    setCustomWidth(clamped);
    // 싱글/듀얼 자동 매칭
    if (clamped <= 600) setCabinetType('single');
    else setCabinetType('dual');
    setTypeConfirmed(true);
    resetLayout();
  }, [resetLayout]);

  // ESC 닫기
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // body 스크롤 방지
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  // 싱글 타입: 좌우 분할 차단
  const isSingle = category === 'full' && cabinetType === 'single';

  const wrappedSplitNode = useCallback((nodeId: string, direction: 'horizontal' | 'vertical') => {
    if (isSingle && direction === 'horizontal') return;
    splitNode(nodeId, direction);
  }, [splitNode, isSingle]);

  const handleConfirm = useCallback(() => {
    const dims = { width: currentWidth, height: currentHeight, depth: currentDepth };
    const config = convertToConfig(layout, dims);
    onConfirm(config, currentWidth, currentHeight, currentDepth);
  }, [layout, currentWidth, currentHeight, currentDepth, onConfirm]);

  if (!isOpen) return null;

  const popup = (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.popup} onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.headerIcon}>⊞</div>
            <div>
              <h2 className={styles.headerTitle}>
                {CATEGORY_LABELS[category]} 레이아웃
              </h2>
              <div className={styles.headerDimensions}>
                {currentWidth} × {Math.round(currentHeight)} × {currentDepth} mm
              </div>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        {/* 바디 */}
        <div className={styles.body}>
          {/* 타입 + 치수 통합 바 */}
          <div className={styles.configBar}>
            {/* 싱글/듀얼 타입 선택 (full 카테고리만) */}
            {category === 'full' && (
              <div className={styles.typeSelector}>
                <button
                  className={`${styles.typeBtn} ${cabinetType === 'single' ? styles.typeBtnActive : ''}`}
                  onClick={() => handleTypeChange('single')}
                  title="싱글 (500mm)"
                >
                  <div style={{ width: '10px', height: '16px', border: '1.5px solid currentColor', borderRadius: '1px' }} />
                  <span className={styles.typeBtnLabel}>싱글</span>
                </button>
                <button
                  className={`${styles.typeBtn} ${cabinetType === 'dual' ? styles.typeBtnActive : ''}`}
                  onClick={() => handleTypeChange('dual')}
                  title="듀얼 (1000mm)"
                >
                  <div style={{ display: 'flex', gap: '1px' }}>
                    <div style={{ width: '8px', height: '16px', border: '1.5px solid currentColor', borderRadius: '1px' }} />
                    <div style={{ width: '8px', height: '16px', border: '1.5px solid currentColor', borderRadius: '1px' }} />
                  </div>
                  <span className={styles.typeBtnLabel}>듀얼</span>
                </button>
              </div>
            )}
            {category === 'full' && <span className={styles.configDivider} />}
            {/* 치수 입력 */}
            <div className={styles.dimRow}>
              <label className={styles.dimLabel}>W</label>
              <input
                type="number"
                className={styles.dimInput}
                value={customWidth}
                min={200}
                max={2400}
                step={10}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v)) handleWidthChange(v);
                }}
                onBlur={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (isNaN(v)) handleWidthChange(1000);
                }}
              />
              <span className={styles.dimSeparator}>×</span>
              <label className={styles.dimLabel}>H</label>
              <input
                type="number"
                className={styles.dimInput}
                value={Math.round(customHeight)}
                min={200}
                max={3000}
                step={10}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v)) {
                    setCustomHeight(Math.max(200, Math.min(3000, v)));
                    resetLayout();
                  }
                }}
                onBlur={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (isNaN(v)) {
                    setCustomHeight(dimensions.height);
                    resetLayout();
                  }
                }}
              />
              <span className={styles.dimSeparator}>×</span>
              <label className={styles.dimLabel}>D</label>
              <input
                type="number"
                className={styles.dimInput}
                value={customDepth}
                min={200}
                max={800}
                step={10}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v)) setCustomDepth(Math.max(200, Math.min(800, v)));
                }}
                onBlur={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (isNaN(v)) setCustomDepth(dimensions.depth);
                }}
              />
              <span className={styles.dimUnit}>mm</span>
            </div>
            <span className={styles.guideHint} title="영역 클릭 후 분할 | 경계선 드래그로 크기 조정 | 최대 3단계">💡</span>
          </div>

          {/* 캔버스 */}
          <LayoutCanvas
            layout={layout}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            totalWidthMM={currentWidth}
            totalHeightMM={currentHeight}
            computeRects={computeRects}
            computeHandles={computeHandles}
            onResize={resizeNode}
            onResizeByMM={resizeNodeByMM}
            canSplit={canSplit}
            onSplit={wrappedSplitNode}
            disableHorizontalSplit={isSingle}
          />

          {/* 액션 바 */}
          <LayoutToolbar
            selectedNodeId={selectedNodeId}
            canSplit={canSplit}
            canMerge={canMerge}
            onSplit={wrappedSplitNode}
            onMerge={mergeNode}
            onReset={resetLayout}
            leafCount={leafCount}
            disableHorizontalSplit={isSingle}
          />
        </div>

        {/* 푸터 */}
        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>
            취소
          </button>
          <button className={styles.confirmBtn} onClick={handleConfirm}>
            레이아웃 확인
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(popup, document.body);
};

export default LayoutBuilderPopup;
