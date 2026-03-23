import React from 'react';
import { useUIStore, type EditorTab } from '@/store/uiStore';
import { FaFolderOpen } from 'react-icons/fa6';
import styles from './TabBar.module.css';

interface TabBarProps {
  onTabSwitch: (tab: EditorTab) => void;
  onTabClose: (tab: EditorTab) => void;
  onNewDesign?: () => void;
  onFileTreeToggle?: () => void;
  isFileTreeOpen?: boolean;
  readOnly?: boolean;
}

const TabBar: React.FC<TabBarProps> = ({ onTabSwitch, onTabClose, onNewDesign, onFileTreeToggle, isFileTreeOpen, readOnly }) => {
  const openTabs = useUIStore((s) => s.openTabs);
  const activeTabId = useUIStore((s) => s.activeTabId);

  return (
    <div className={styles.tabBar}>
      {/* 파일트리 토글 버튼 */}
      {!readOnly && onFileTreeToggle && (
        <button
          className={`${styles.fileTreeButton} ${isFileTreeOpen ? styles.active : ''}`}
          onClick={onFileTreeToggle}
          title="파일 트리 열기/닫기"
        >
          <FaFolderOpen size={20} />
        </button>
      )}
      {openTabs.map((tab) => (
        <div
          key={tab.id}
          className={`${styles.tab} ${tab.id === activeTabId ? styles.active : ''}`}
          onClick={() => {
            if (tab.id !== activeTabId) {
              onTabSwitch(tab);
            }
          }}
          title={`${tab.projectName} / ${tab.designFileName}`}
        >
          <span className={styles.tabLabel}>
            <span className={styles.tabProjectName}>{tab.projectName}</span>
            <span className={styles.tabSeparator}>/</span>
            {tab.designFileName}
          </span>
          <button
            className={styles.closeButton}
            onClick={(e) => {
              e.stopPropagation();
              onTabClose(tab);
            }}
            title="탭 닫기"
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <path d="M1 1L7 7M7 1L1 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
};

export default TabBar;
