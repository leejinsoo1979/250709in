import React from 'react';
import styles from './StatusBar.module.css';

interface StatusBarProps {
  itemCount: number;
  selectedCount: number;
}

const StatusBar: React.FC<StatusBarProps> = ({ itemCount, selectedCount }) => {
  return (
    <div className={styles.statusBar}>
      <span>{itemCount}개 항목</span>
      {selectedCount > 0 && (
        <>
          <span className={styles.divider}>|</span>
          <span>{selectedCount}개 선택됨</span>
        </>
      )}
    </div>
  );
};

export default StatusBar;
