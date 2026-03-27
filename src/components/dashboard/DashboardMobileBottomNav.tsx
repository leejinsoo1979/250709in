import React from 'react';
import { PlayCircle, CheckCircle2, Download, Upload, Trash2 } from 'lucide-react';
import styles from './DashboardMobileBottomNav.module.css';

type MenuType = 'all' | 'in-progress' | 'completed' | 'shared-with-me' | 'shared-by-me' | 'trash';

interface DashboardMobileBottomNavProps {
  activeMenu: MenuType;
  onMenuChange: (menu: MenuType) => void;
  onCreateProject: () => void;
  onProfileClick: () => void;
}

const DashboardMobileBottomNav: React.FC<DashboardMobileBottomNavProps> = ({
  activeMenu,
  onMenuChange,
}) => {
  const tabs: { menu: MenuType; label: string; icon: (active: boolean) => React.ReactNode }[] = [
    {
      menu: 'in-progress',
      label: '진행중',
      icon: (active) => <PlayCircle size={20} strokeWidth={active ? 2.2 : 1.6} />,
    },
    {
      menu: 'completed',
      label: '완료',
      icon: (active) => <CheckCircle2 size={20} strokeWidth={active ? 2.2 : 1.6} />,
    },
    {
      menu: 'shared-with-me',
      label: '공유받은',
      icon: (active) => <Download size={20} strokeWidth={active ? 2.2 : 1.6} />,
    },
    {
      menu: 'shared-by-me',
      label: '공유한',
      icon: (active) => <Upload size={20} strokeWidth={active ? 2.2 : 1.6} />,
    },
    {
      menu: 'trash',
      label: '휴지통',
      icon: (active) => <Trash2 size={20} strokeWidth={active ? 2.2 : 1.6} />,
    },
  ];

  return (
    <nav className={styles.bottomNav}>
      {tabs.map((tab) => {
        const isActive = activeMenu === tab.menu;
        return (
          <button
            key={tab.menu}
            className={`${styles.tabItem} ${isActive ? styles.tabItemActive : ''}`}
            onClick={() => onMenuChange(tab.menu)}
          >
            <span className={styles.tabIcon}>{tab.icon(isActive)}</span>
            <span className={styles.tabLabel}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
};

export default DashboardMobileBottomNav;
