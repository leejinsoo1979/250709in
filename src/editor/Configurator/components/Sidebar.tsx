import React from 'react';
import styles from './Sidebar.module.css';
import { Settings, User } from 'lucide-react';

export type SidebarTab = 'module' | 'material' | 'structure' | 'etc';

interface SidebarProps {
  activeTab: SidebarTab | null;
  onTabClick: (tab: SidebarTab) => void;
  isOpen: boolean;
  onToggle: () => void; // 폴딩 버튼 핸들러 추가
}

const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabClick,
  isOpen,
  onToggle
}) => {
  const tabs = [
    {
      id: 'module' as SidebarTab,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
          <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
          <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
          <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
        </svg>
      ),
      label: '모듈'
    },
    {
      id: 'material' as SidebarTab,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" stroke="currentColor" strokeWidth="2"/>
          <polyline points="7.5,4.21 12,6.81 16.5,4.21" stroke="currentColor" strokeWidth="2"/>
          <polyline points="7.5,19.79 7.5,14.6 3,12" stroke="currentColor" strokeWidth="2"/>
          <polyline points="21,12 16.5,14.6 16.5,19.79" stroke="currentColor" strokeWidth="2"/>
          <polyline points="3.27,6.96 12,12.01 20.73,6.96" stroke="currentColor" strokeWidth="2"/>
          <line x1="12" y1="22.08" x2="12" y2="12" stroke="currentColor" strokeWidth="2"/>
        </svg>
      ),
      label: '재질'
    },
    {
      id: 'structure' as SidebarTab,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="currentColor" strokeWidth="2"/>
          <polyline points="9,22 9,12 15,12 15,22" stroke="currentColor" strokeWidth="2"/>
        </svg>
      ),
      label: '구조물'
    },
    {
      id: 'etc' as SidebarTab,
      icon: (<Settings width="20" height="20" />),
      label: '기타'
    }
  ];

  return (
    <aside className={`${styles.sidebar} ${isOpen ? styles.open : ''}`}>
      {/* 폴딩 버튼 - 우측 중앙 */}
      <button 
        className={styles.foldButton}
        onClick={onToggle}
        title={isOpen ? '사이드바 접기' : '사이드바 열기'}
      >
        {isOpen ? '<' : '>'}
      </button>
      {/* 탭 리스트 */}
      <div className={styles.tabList}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.tabButton} ${activeTab === tab.id ? styles.active : ''}`}
            onClick={() => onTabClick(tab.id)}
            title={tab.label}
          >
            <div className={styles.tabIcon}>
              {tab.icon}
            </div>
            <span className={styles.tabLabel}>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* 하단 사용자 정보 */}
      <div className={styles.userSection}>
        <div className={styles.userAvatar}>
          <div className={styles.avatar}>
            <User size={24} />
          </div>
          <div className={styles.onlineIndicator}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar; 