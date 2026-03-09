/**
 * 레이아웃 빌더 툴바
 *
 * 선택된 노드에 대한 액션 버튼: 분할(가로/세로), 병합, 리셋
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
    <div className={styles.toolbar}>
      <div className={styles.toolbarLeft}>
        <span className={styles.toolbarInfo}>
          섹션 {leafCount}개
        </span>
      </div>
      <div className={styles.toolbarRight}>
        <button
          className={styles.toolbarBtn}
          disabled={!splitAllowed}
          onClick={() => selectedNodeId && onSplit(selectedNodeId, 'horizontal')}
          title="선택 영역을 좌우로 분할"
        >
          ↔ 좌우 분할
        </button>
        <button
          className={styles.toolbarBtn}
          disabled={!splitAllowed}
          onClick={() => selectedNodeId && onSplit(selectedNodeId, 'vertical')}
          title="선택 영역을 상하로 분할"
        >
          ↕ 상하 분할
        </button>
        <button
          className={`${styles.toolbarBtn} ${styles.toolbarBtnDanger}`}
          disabled={!mergeAllowed}
          onClick={() => selectedNodeId && onMerge(selectedNodeId)}
          title="선택 영역을 부모와 병합"
        >
          병합
        </button>
        <button
          className={styles.toolbarBtn}
          onClick={onReset}
          disabled={leafCount <= 1}
          title="모든 분할 초기화"
        >
          초기화
        </button>
      </div>
    </div>
  );
};

export default LayoutToolbar;
