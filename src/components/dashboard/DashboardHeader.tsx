import React from 'react';
import { User, Settings } from 'lucide-react';
import Logo from '@/components/common/Logo';
import { useAuth } from '@/auth/AuthProvider';
import styles from './DashboardHeader.module.css';

interface DashboardHeaderProps {
  onLogoClick?: () => void;
  onProfileClick?: () => void;
  onOpenSettings?: () => void;
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  onLogoClick,
  onProfileClick,
  onOpenSettings,
}) => {
  const { user } = useAuth();

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <Logo size="small" onClick={onLogoClick} />
      </div>

      <div className={styles.right}>
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
