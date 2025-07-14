import React from 'react';
import { useLocation } from 'react-router-dom';
import styles from './Sidebar.module.css';

// 아이콘 대신 텍스트 사용
const menuItems = [
  { 
    id: 'projects', 
    label: '전체 프로젝트', 
    icon: '📁', 
    path: '/dashboard' 
  },
  { 
    id: 'profile', 
    label: '프로필', 
    icon: '👤', 
    path: '/profile' 
  },
  { 
    id: 'team', 
    label: '팀', 
    icon: '👥', 
    path: '/team' 
  },
  { 
    id: 'settings', 
    label: '설정', 
    icon: '⚙️', 
    path: '/settings' 
  }
];

interface SidebarProps {
  onCreateProject: () => void;
  onInviteUser: () => void;
  onLogout: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onCreateProject, onInviteUser, onLogout }): any => {
  const location = useLocation();

  return (
    <div className={styles.sidebar}>
      {/* 프로필 섹션 */}
      <div className={styles.profileSection}>
        <div className={styles.userImage}>
          <span className={styles.userIcon}>👤</span>
        </div>
        <div className={styles.userInfo}>
          <div className={styles.username}>사용자명</div>
          <div className={styles.userEmail}>user@example.com</div>
        </div>
        
        <button className={styles.createProjectBtn} onClick={onCreateProject}>
          <span className={styles.btnIcon}>+</span>
          새 프로젝트
        </button>
        
        <button className={styles.inviteUserBtn} onClick={onInviteUser}>
          <span className={styles.btnIcon}>👤+</span>
          사용자 초대
        </button>
      </div>

      {/* 네비게이션 메뉴 */}
      <nav className={styles.navigation}>
        {menuItems.map((item) => (
          <div
            key={item.id}
            className={`${styles.menuItem} ${
              location.pathname === item.path ? styles.activeMenuItem : ''
            }`}
          >
            <span className={styles.menuIcon}>{item.icon}</span>
            <span className={styles.menuLabel}>{item.label}</span>
          </div>
        ))}
      </nav>

      {/* 로그아웃 버튼 */}
      <button className={styles.logoutBtn} onClick={onLogout}>
        <span className={styles.btnIcon}>🚪</span>
        로그아웃
      </button>
    </div>
  );
};

export default Sidebar;