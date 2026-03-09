/**
 * 레이아웃 빌더 팝업
 *
 * 커스텀 가구 생성 시 2D 인터랙티브 UI로 섹션 레이아웃 설계.
 * 분할/병합/크기조정 후 확인 → CustomFurnitureConfig로 변환 → 배치 모드.
 */

import React, { useCallback } from 'react';
import Modal from '@/components/common/Modal';
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
    width: number;  // mm
    height: number; // mm
    depth: number;  // mm
  };
}

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

  const handleConfirm = useCallback(() => {
    const config = convertToConfig(layout, dimensions);
    onConfirm(config);
  }, [layout, dimensions, onConfirm]);

  const categoryLabel = category === 'full'
    ? '커스텀 캐비닛'
    : category === 'upper'
    ? '커스텀 상부장'
    : '커스텀 하부장';

  const footer = (
    <div className={styles.footerButtons}>
      <button className={styles.cancelBtn} onClick={onClose}>
        취소
      </button>
      <button className={styles.confirmBtn} onClick={handleConfirm}>
        확인
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${categoryLabel} 레이아웃`}
      size="large"
      footer={footer}
    >
      <div className={styles.popupContent}>
        <p className={styles.helpText}>
          영역을 클릭하여 선택한 후 분할하세요. 경계선을 드래그하여 크기를 조정할 수 있습니다.
        </p>

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
    </Modal>
  );
};

export default LayoutBuilderPopup;
