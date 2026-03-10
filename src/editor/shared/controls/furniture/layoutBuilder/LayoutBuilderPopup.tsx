/**
 * 레이아웃 빌더 팝업
 *
 * 커스텀 가구 생성 시 2D 인터랙티브 UI로 섹션 레이아웃 설계.
 * - 가구 비율에 맞는 캔버스에 섹션 시각화
 * - 클릭으로 선택 → 분할/병합
 * - 드래그로 경계 조정
 * - 확인 시 CustomFurnitureConfig로 변환
 */

import React, { useCallback, useEffect } from 'react';
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
  onConfirm: (config: CustomFurnitureConfig) => void;
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
  const {
    layout,
    selectedNodeId,
    setSelectedNodeId,
    splitNode,
    mergeNode,
    resizeNode,
    resetLayout,
    computeRects,
    computeHandles,
    canSplit,
    canMerge,
    leafCount,
  } = useLayoutBuilder(dimensions.width, dimensions.height);

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

  const handleConfirm = useCallback(() => {
    const config = convertToConfig(layout, dimensions);
    console.log('🏗️ [LayoutBuilder] layout tree:', JSON.stringify(layout, null, 2));
    console.log('🏗️ [LayoutBuilder] dimensions:', dimensions);
    console.log('🏗️ [LayoutBuilder] converted config:', JSON.stringify(config, null, 2));
    onConfirm(config);
  }, [layout, dimensions, onConfirm]);

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
                {dimensions.width} × {Math.round(dimensions.height)} × {dimensions.depth} mm
              </div>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        {/* 바디 */}
        <div className={styles.body}>
          {/* 가이드 */}
          <div className={styles.guide}>
            <span className={styles.guideIcon}>💡</span>
            <p className={styles.guideText}>
              영역을 클릭하여 선택 후 분할하세요. 경계선을 드래그하면 크기를 조정할 수 있습니다. 최대 3단계 분할 가능.
            </p>
          </div>

          {/* 캔버스 */}
          <LayoutCanvas
            layout={layout}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            totalWidthMM={dimensions.width}
            totalHeightMM={dimensions.height}
            computeRects={computeRects}
            computeHandles={computeHandles}
            onResize={resizeNode}
            canSplit={canSplit}
            onSplit={splitNode}
          />

          {/* 액션 바 */}
          <LayoutToolbar
            selectedNodeId={selectedNodeId}
            canSplit={canSplit}
            canMerge={canMerge}
            onSplit={splitNode}
            onMerge={mergeNode}
            onReset={resetLayout}
            leafCount={leafCount}
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
