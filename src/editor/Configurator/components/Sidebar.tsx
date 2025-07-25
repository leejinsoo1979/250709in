import React from 'react';
import styles from './Sidebar.module.css';
import { Settings, User } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { PaletteIcon, StructureIcon } from '@/components/common/Icons';

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
  const { user } = useAuth();
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
      icon: <PaletteIcon size={20} />,
      label: '재질'
    },
    {
      id: 'structure' as SidebarTab,
      icon: <StructureIcon size={20} />,
      label: '구조물'
    },
    {
      id: 'etc' as SidebarTab,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <circle cx="5" cy="12" r="1" stroke="currentColor" strokeWidth="2"/>
          <circle cx="12" cy="12" r="1" stroke="currentColor" strokeWidth="2"/>
          <circle cx="19" cy="12" r="1" stroke="currentColor" strokeWidth="2"/>
        </svg>
      ),
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
                        {tab.icon && <div className={styles.tabIcon}>{tab.icon}</div>}
            <span className={styles.tabLabel}>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* 하단 설정 버튼 */}
      <div className={styles.userSection}>
        <button className={styles.settingsButton} title="설정">
          <Settings size={24} />
        </button>
      </div>
    </aside>
  );
};

export default Sidebar; 