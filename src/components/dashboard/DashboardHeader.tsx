import React from 'react';
import { User } from 'lucide-react';
import Logo from '@/components/common/Logo';
import { useAuth } from '@/auth/AuthProvider';
import styles from './DashboardHeader.module.css';

interface DashboardHeaderProps {
  onLogoClick?: () => void;
  onProfileClick?: () => void;
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  onLogoClick,
  onProfileClick,
}) => {
  const { user } = useAuth();

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <Logo size="small" onClick={onLogoClick} />
      </div>

      <div className={styles.right}>
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
