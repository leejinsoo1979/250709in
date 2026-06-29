import React, { useEffect, useState } from 'react';
import { User, Settings, Search, Sun, Moon } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import Logo from '@/components/common/Logo';
import { NotificationCenter } from '@/components/NotificationCenter';
import { useAuth } from '@/auth/AuthProvider';
import { useTheme } from '@/contexts/ThemeContext';
import { db } from '@/firebase/config';
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
  const { theme, toggleMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const photoURL = user?.photoURL || '';
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [pendingQnACount, setPendingQnACount] = useState(0);
  const isDashboard = location.pathname.startsWith('/dashboard');
  const isGallery = location.pathname.startsWith('/gallery');
  const isNews = location.pathname.startsWith('/news');
  const isQnA = location.pathname.startsWith('/qna');

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [photoURL]);

  useEffect(() => {
    if (!user) {
      setPendingQnACount(0);
      return;
    }

    const qnaQuery = query(
      collection(db, 'qna'),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(
      qnaQuery,
      snapshot => setPendingQnACount(snapshot.size),
      error => {
        console.error('Q&A 대기 건수 구독 실패:', error);
        setPendingQnACount(0);
      }
    );

    return unsubscribe;
  }, [user]);

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <div className={styles.logoWrap}>
          <Logo size="large" onClick={onLogoClick} noAnimation />
        </div>
      </div>

      <div className={styles.right}>
        <nav className={styles.nav}>
          <button
            className={`${styles.navBtn} ${isDashboard ? styles.active : ''}`}
            onClick={() => navigate('/dashboard')}
            title="Home"
          >
            <span>Home</span>
          </button>
          <button
            className={`${styles.navBtn} ${isGallery ? styles.active : ''}`}
            onClick={() => navigate('/gallery')}
            title="Gallery"
          >
            <span>Gallery</span>
          </button>
          <button
            className={`${styles.navBtn} ${isNews ? styles.active : ''}`}
            onClick={() => navigate('/news')}
            title="News"
          >
            <span>News</span>
          </button>
          <button
            className={`${styles.navBtn} ${isQnA ? styles.active : ''}`}
            onClick={() => navigate('/qna')}
            title="Q&A"
          >
            <span>Q&amp;A</span>
            {pendingQnACount > 0 && (
              <span className={styles.navBadge}>{pendingQnACount > 99 ? '99+' : pendingQnACount}</span>
            )}
          </button>
        </nav>
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
          className={styles.themeToggleBtn}
          onClick={toggleMode}
          title={theme.mode === 'dark' ? '라이트 모드' : '다크 모드'}
        >
          {theme.mode === 'dark' ? <Moon size={18} strokeWidth={1.8} /> : <Sun size={18} strokeWidth={1.8} />}
        </button>
        <button
          className={styles.profileBtn}
          onClick={onProfileClick}
          title={user?.displayName || user?.email || '프로필'}
        >
          {photoURL && !avatarLoadFailed ? (
            <img
              src={photoURL}
              alt={user?.displayName || '프로필'}
              className={styles.avatar}
              referrerPolicy="no-referrer"
              onError={() => setAvatarLoadFailed(true)}
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
