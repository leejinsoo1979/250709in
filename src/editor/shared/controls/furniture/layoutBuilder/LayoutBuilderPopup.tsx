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
  onConfirm: (config: CustomFurnitureConfig, width: number) => void;
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
  const [typeConfirmed, setTypeConfirmed] = useState(false); // 팝업 열릴 때 선택 표시
  const currentWidth = category === 'full' ? (cabinetType === 'single' ? 500 : 1000) : dimensions.width;

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
  } = useLayoutBuilder(currentWidth, dimensions.height);

  // 팝업 열릴 때 초기화
  useEffect(() => {
    if (isOpen) {
      setCabinetType('dual');
      setTypeConfirmed(false);
    }
  }, [isOpen]);

  // 타입 변경 시 레이아웃 리셋
  const handleTypeChange = useCallback((type: 'single' | 'dual') => {
    setCabinetType(type);
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

  const handleConfirm = useCallback(() => {
    const dims = { ...dimensions, width: currentWidth };
    const config = convertToConfig(layout, dims);
    onConfirm(config, currentWidth);
  }, [layout, dimensions, currentWidth, onConfirm]);

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
                {currentWidth} × {Math.round(dimensions.height)} × {dimensions.depth} mm
              </div>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        {/* 바디 */}
        <div className={styles.body}>
          {/* 싱글/듀얼 타입 선택 (full 카테고리만) */}
          {category === 'full' && (
            <div className={styles.typeSelector}>
              <button
                className={`${styles.typeBtn} ${cabinetType === 'single' ? styles.typeBtnActive : ''}`}
                onClick={() => handleTypeChange('single')}
              >
                <div className={styles.typeBtnIcon}>
                  <div style={{ width: '14px', height: '20px', border: '2px solid currentColor', borderRadius: '2px' }} />
                </div>
                <div className={styles.typeBtnText}>
                  <span className={styles.typeBtnLabel}>싱글</span>
                  <span className={styles.typeBtnSize}>500mm</span>
                </div>
              </button>
              <button
                className={`${styles.typeBtn} ${cabinetType === 'dual' ? styles.typeBtnActive : ''}`}
                onClick={() => handleTypeChange('dual')}
              >
                <div className={styles.typeBtnIcon}>
                  <div style={{ display: 'flex', gap: '2px' }}>
                    <div style={{ width: '12px', height: '20px', border: '2px solid currentColor', borderRadius: '2px' }} />
                    <div style={{ width: '12px', height: '20px', border: '2px solid currentColor', borderRadius: '2px' }} />
                  </div>
                </div>
                <div className={styles.typeBtnText}>
                  <span className={styles.typeBtnLabel}>듀얼</span>
                  <span className={styles.typeBtnSize}>1000mm</span>
                </div>
              </button>
            </div>
          )}

          {/* 가이드 */}
          <div className={styles.guide}>
            <span className={styles.guideIcon}>💡</span>
            <p className={styles.guideText}>
              영역 클릭 후 분할 | 경계선 드래그로 크기 조정 | 최대 3단계
            </p>
          </div>

          {/* 캔버스 */}
          <LayoutCanvas
            layout={layout}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            totalWidthMM={currentWidth}
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
