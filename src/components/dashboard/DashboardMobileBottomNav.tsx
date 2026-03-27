import React from 'react';
import { Home, Share2, Plus, Trash2, User } from 'lucide-react';
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
  onCreateProject,
  onProfileClick,
}) => {
  const isHomeActive = activeMenu === 'all' || activeMenu === 'in-progress' || activeMenu === 'completed';
  const isShareActive = activeMenu === 'shared-with-me' || activeMenu === 'shared-by-me';
  const isTrashActive = activeMenu === 'trash';

  return (
    <nav className={styles.bottomNav}>
      <button
        className={`${styles.tabItem} ${isHomeActive ? styles.tabItemActive : ''}`}
        onClick={() => onMenuChange('all')}
      >
        <span className={styles.tabIcon}><Home size={22} /></span>
        <span className={styles.tabLabel}>프로젝트</span>
      </button>

      <button
        className={`${styles.tabItem} ${isShareActive ? styles.tabItemActive : ''}`}
        onClick={() => onMenuChange('shared-with-me')}
      >
        <span className={styles.tabIcon}><Share2 size={22} /></span>
        <span className={styles.tabLabel}>공유</span>
      </button>

      <button
        className={styles.fabItem}
        onClick={onCreateProject}
      >
        <div className={styles.fabCircle}>
          <Plus size={24} />
        </div>
        <span className={styles.fabLabel}>생성</span>
      </button>

      <button
        className={`${styles.tabItem} ${isTrashActive ? styles.tabItemActive : ''}`}
        onClick={() => onMenuChange('trash')}
      >
        <span className={styles.tabIcon}><Trash2 size={22} /></span>
        <span className={styles.tabLabel}>휴지통</span>
      </button>

      <button
        className={styles.tabItem}
        onClick={onProfileClick}
      >
        <span className={styles.tabIcon}><User size={22} /></span>
        <span className={styles.tabLabel}>프로필</span>
      </button>
    </nav>
  );
};

export default DashboardMobileBottomNav;
