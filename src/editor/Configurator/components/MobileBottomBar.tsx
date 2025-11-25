import React from 'react';
import styles from './MobileBottomBar.module.css';

export type MobileTab = 'modules' | 'material' | 'settings' | 'viewer';

interface MobileBottomBarProps {
  activeTab: MobileTab | null;
  onTabChange: (tab: MobileTab) => void;
}

/**
 * 모바일용 하단 탭바 컴포넌트
 * 모듈 추가, 재질, 설정, 보기 탭 제공
 */
const MobileBottomBar: React.FC<MobileBottomBarProps> = ({ activeTab, onTabChange }) => {
  const tabs: { id: MobileTab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'modules',
      label: '모듈 추가',
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
      id: 'settings',
      label: '설정',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="M4.93 4.93l1.41 1.41" />
          <path d="M17.66 17.66l1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="M6.34 17.66l-1.41 1.41" />
          <path d="M19.07 4.93l-1.41 1.41" />
        </svg>
      ),
    },
    {
      id: 'viewer',
      label: '보기',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="3" />
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
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
