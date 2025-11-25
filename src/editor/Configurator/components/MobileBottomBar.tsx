import React from 'react';
import styles from './MobileBottomBar.module.css';

export type MobileTab = 'modules' | 'material' | 'column' | 'others';

interface MobileBottomBarProps {
  activeTab: MobileTab | null;
  onTabChange: (tab: MobileTab) => void;
}

/**
 * 모바일용 하단 탭바 컴포넌트
 * 모듈, 재질, 기둥, 기타 탭 제공
 */
const MobileBottomBar: React.FC<MobileBottomBarProps> = ({ activeTab, onTabChange }) => {
  const tabs: { id: MobileTab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'modules',
      label: '모듈',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
        </svg>
      ),
    },
    {
      id: 'material',
      label: '재질',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 3a9 9 0 0 1 0 18" fill="currentColor" />
        </svg>
      ),
    },
    {
      id: 'column',
      label: '기둥',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="4" y="2" width="6" height="20" rx="1" />
          <rect x="14" y="2" width="6" height="20" rx="1" />
        </svg>
      ),
    },
    {
      id: 'others',
      label: '기타',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      ),
    },
  ];

  return (
    <div className={styles.bottomBar}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`${styles.tabButton} ${activeTab === tab.id ? styles.active : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          <div className={styles.iconWrapper}>{tab.icon}</div>
          <span className={styles.label}>{tab.label}</span>
        </button>
      ))}
    </div>
  );
};

export default MobileBottomBar;
