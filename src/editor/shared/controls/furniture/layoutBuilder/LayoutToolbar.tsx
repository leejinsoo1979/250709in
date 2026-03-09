/**
 * 레이아웃 빌더 액션 바
 *
 * 섹션 수 표시 + 분할/병합/초기화 버튼
 */

import React from 'react';
import styles from './LayoutBuilderPopup.module.css';

interface LayoutToolbarProps {
  selectedNodeId: string | null;
  canSplit: (nodeId: string) => boolean;
  canMerge: (nodeId: string) => boolean;
  onSplit: (nodeId: string, direction: 'horizontal' | 'vertical') => void;
  onMerge: (nodeId: string) => void;
  onReset: () => void;
  leafCount: number;
}

const LayoutToolbar: React.FC<LayoutToolbarProps> = ({
  selectedNodeId,
  canSplit: canSplitFn,
  canMerge: canMergeFn,
  onSplit,
  onMerge,
  onReset,
  leafCount,
}) => {
  const splitAllowed = selectedNodeId ? canSplitFn(selectedNodeId) : false;
  const mergeAllowed = selectedNodeId ? canMergeFn(selectedNodeId) : false;

  return (
    <div className={styles.actionBar}>
      <div className={styles.actionBarLeft}>
        <span className={styles.sectionBadge}>
          섹션 {leafCount}개
        </span>
        {!selectedNodeId && (
          <span className={styles.selectionHint}>
            영역을 클릭하여 선택하세요
          </span>
        )}
      </div>
      <div className={styles.actionBarRight}>
        <button
          className={styles.actionBtn}
          disabled={!splitAllowed}
          onClick={() => selectedNodeId && onSplit(selectedNodeId, 'horizontal')}
        >
          <span className={styles.actionBtnIcon}>┃</span>
          좌우 분할
        </button>
        <button
          className={styles.actionBtn}
          disabled={!splitAllowed}
          onClick={() => selectedNodeId && onSplit(selectedNodeId, 'vertical')}
        >
          <span className={styles.actionBtnIcon}>━</span>
          상하 분할
        </button>
        <button
          className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
          disabled={!mergeAllowed}
          onClick={() => selectedNodeId && onMerge(selectedNodeId)}
        >
          병합
        </button>
        <button
          className={`${styles.actionBtn} ${styles.resetBtn}`}
          onClick={onReset}
          disabled={leafCount <= 1}
        >
          초기화
        </button>
      </div>
    </div>
  );
};

export default LayoutToolbar;
