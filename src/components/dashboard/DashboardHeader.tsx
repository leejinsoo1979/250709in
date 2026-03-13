import React from 'react';
import { User, Settings, Search } from 'lucide-react';
import Logo from '@/components/common/Logo';
import { NotificationCenter } from '@/components/NotificationCenter';
import { useAuth } from '@/auth/AuthProvider';
import styles from './DashboardHeader.module.css';

interface DashboardHeaderProps {
  onLogoClick?: () => void;
  onProfileClick?: () => void;
  onOpenSettings?: () => void;
  searchTerm?: string;
  onSearchChange?: (value: string) => void;
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  onLogoClick,
  onProfileClick,
  onOpenSettings,
  searchTerm,
  onSearchChange,
}) => {
  const { user } = useAuth();

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <Logo size="large" onClick={onLogoClick} />
      </div>

      <div className={styles.right}>
        {onSearchChange !== undefined && (
          <div className={styles.searchBox}>
            <Search size={14} className={styles.searchIcon} />
            <input
              type="text"
              className={styles.searchInput}
              placeholder="검색..."
              value={searchTerm || ''}
              onChange={e => onSearchChange(e.target.value)}
            />
          </div>
        )}
        <NotificationCenter />
        {onOpenSettings && (
          <button
            className={styles.settingsBtn}
            onClick={onOpenSettings}
            title="설정"
          >
            <Settings size={18} />
          </button>
        )}
        <button
          className={styles.profileBtn}
          onClick={onProfileClick}
          title={user?.displayName || user?.email || '프로필'}
        >
          {user?.photoURL ? (
            <img
              src={user.photoURL}
              alt={user.displayName || '프로필'}
              className={styles.avatar}
            />
          ) : (
            <div className={styles.avatarFallback}>
              <User size={16} />
            </div>
          )}
        </button>
      </div>
    </header>
  );
};

export default DashboardHeader;
