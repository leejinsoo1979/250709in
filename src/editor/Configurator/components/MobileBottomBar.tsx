import React from 'react';
import { HiOutlineColorSwatch } from 'react-icons/hi';
import styles from './MobileBottomBar.module.css';

export type MobileTab = 'modules' | 'material' | 'column';

interface MobileBottomBarProps {
  activeTab: MobileTab | null;
  onTabChange: (tab: MobileTab) => void;
  onSettingsClick?: () => void;
}

/**
 * 모바일용 하단 탭바 컴포넌트
 * 모듈, 재질 탭 제공 (PC와 동일 구성)
 */
const MobileBottomBar: React.FC<MobileBottomBarProps> = ({ activeTab, onTabChange, onSettingsClick }) => {
  const tabs: { id: MobileTab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'modules',
      label: '모듈',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
          <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
          <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
          <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
        </svg>
      ),
    },
    {
      id: 'material',
      label: '재질',
      icon: <HiOutlineColorSwatch size={22} />,
    },
  ];

  return (
    <div className={styles.bottomBar}>
      <div className={styles.tabList}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.tabButton} ${activeTab === tab.id ? styles.active : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            <div className={styles.tabIcon}>{tab.icon}</div>
            <span className={styles.tabLabel}>{tab.label}</span>
          </button>
        ))}
      </div>
      <button
        className={styles.settingsButton}
        onClick={() => onSettingsClick?.()}
        aria-label="설정"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 3.6 15a1.65 1.65 0 0 0-1.51-1H2a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 3.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 8 3.6a1.65 1.65 0 0 0 1-1.51V2a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 20.4 8c.67 0 1.27.42 1.51 1H22a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        <span>설정</span>
      </button>
    </div>
  );
};

export default MobileBottomBar;
