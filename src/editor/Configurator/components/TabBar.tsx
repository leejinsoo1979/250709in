import React from 'react';
import { useUIStore, type EditorTab } from '@/store/uiStore';
import styles from './TabBar.module.css';

interface TabBarProps {
  onTabSwitch: (tab: EditorTab) => void;
  onTabClose: (tab: EditorTab) => void;
}

const TabBar: React.FC<TabBarProps> = ({ onTabSwitch, onTabClose }) => {
  const openTabs = useUIStore((s) => s.openTabs);
  const activeTabId = useUIStore((s) => s.activeTabId);

  if (openTabs.length === 0) return null;

  return (
    <div className={styles.tabBar}>
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
