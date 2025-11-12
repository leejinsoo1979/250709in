import { useEffect } from 'react';
import { useNavigate, Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { useAdmin } from '@/hooks/useAdmin';
import { UserIcon, UsersIcon, SettingsIcon, LogOutIcon } from '@/components/common/Icons';
import { HiOutlineChartBar, HiOutlineCreditCard, HiOutlineLockClosed, HiOutlineFolder, HiOutlineShare, HiOutlineClipboardList, HiOutlineShieldCheck, HiOutlineMail, HiOutlineChatAlt2, HiOutlineKey } from 'react-icons/hi';
import { VscServerProcess } from 'react-icons/vsc';
import { GiImperialCrown } from 'react-icons/gi';
import styles from './AdminLayout.module.css';

const AdminLayout = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { adminRole, isAdmin, isSuperAdmin, loading } = useAdmin(user);

  useEffect(() => {
    // 로그인하지 않은 경우 로그인 페이지로 리다이렉트
    if (!user) {
      navigate('/login');
    }
  }, [user, navigate]);

  useEffect(() => {
    console.log('🔐 AdminLayout 권한 체크:', { loading, user: !!user, isAdmin, isSuperAdmin });
    // 관리자가 아닌 경우 대시보드로 리다이렉트
    if (!loading && user && !isAdmin) {
      console.error('❌ 관리자 권한 없음 - 리다이렉트');
      alert('관리자 권한이 필요합니다.');
      navigate('/dashboard');
    }
  }, [loading, user, isAdmin, isSuperAdmin, navigate]);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>권한 확인 중...</p>
        </div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return null;
  }

  return (
    <div className={styles.container}>
      {/* 사이드바 */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <div className={styles.headerTop}>
            <VscServerProcess size={32} className={styles.logo} />
            <span className={styles.title}>관리자 모드</span>
          </div>
          {isSuperAdmin && user && (
            <div className={styles.profileSection}>
              <GiImperialCrown className={styles.crownIcon} />
              <div className={styles.profileAvatar}>
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || user.email || ''} />
                ) : (
                  <div className={styles.avatarPlaceholder}>
                    {(user.displayName || user.email || '?').charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className={styles.profileInfo}>
                <div className={styles.profileNameRow}>
                  <span className={styles.profileName}>{user.displayName || '관리자'}</span>
                  <span className={styles.superAdminBadge}>슈퍼 관리자</span>
                </div>
                <span className={styles.profileEmail}>{user.email}</span>
              </div>
            </div>
          )}
        </div>

        <nav className={styles.nav}>
          <NavLink
            to="/admin"
            end
            className={({ isActive }) => isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
          >
            <HiOutlineChartBar size={20} />
            <span>대시보드</span>
          </NavLink>

          <NavLink
            to="/admin/users"
            className={({ isActive }) => isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
          >
            <UsersIcon size={20} />
            <span>사용자 관리</span>
          </NavLink>

          {isSuperAdmin && (
            <NavLink
              to="/admin/admins"
              className={({ isActive }) => isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
            >
              <HiOutlineShieldCheck size={20} />
              <span>관리자 권한 관리</span>
            </NavLink>
          )}

          <NavLink
            to="/admin/teams"
            className={({ isActive }) => isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
          >
            <UserIcon size={20} />
            <span>팀 관리</span>
          </NavLink>

          <NavLink
            to="/admin/projects"
            className={({ isActive }) => isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
          >
            <HiOutlineFolder size={20} />
            <span>프로젝트 관리</span>
          </NavLink>

          <NavLink
            to="/admin/shares"
            className={({ isActive }) => isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
          >
            <HiOutlineShare size={20} />
            <span>공유 관리</span>
          </NavLink>

          <NavLink
            to="/admin/logs"
            className={({ isActive }) => isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
          >
            <HiOutlineClipboardList size={20} />
            <span>로그 및 알림</span>
          </NavLink>

          <NavLink
            to="/admin/messages"
            className={({ isActive }) => isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
          >
            <HiOutlineMail size={20} />
            <span>메시지 관리</span>
          </NavLink>

          <NavLink
            to="/admin/chatbot"
            className={({ isActive }) => isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
          >
            <HiOutlineChatAlt2 size={20} />
            <span>챗봇 관리</span>
          </NavLink>

          <NavLink
            to="/admin/api-keys-all"
            className={({ isActive }) => isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
          >
            <HiOutlineKey size={20} />
            <span>전체 API 키</span>
          </NavLink>

          <NavLink
            to="/admin/api-keys-configurator"
            className={({ isActive }) => isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
          >
            <HiOutlineKey size={20} />
            <span>컨피규레이터 API</span>
          </NavLink>

          <NavLink
            to="/admin/api-keys-optimizer"
            className={({ isActive }) => isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
          >
            <HiOutlineKey size={20} />
            <span>옵티마이저 API</span>
          </NavLink>

          <NavLink
            to="/admin/subscriptions"
            className={({ isActive }) => isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
          >
            <HiOutlineCreditCard size={20} />
            <span>구독 관리</span>
          </NavLink>

          <NavLink
            to="/admin/billing"
            className={({ isActive }) => isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
          >
            <HiOutlineCreditCard size={20} />
            <span>결제 관리</span>
          </NavLink>

          <NavLink
            to="/admin/security"
            className={({ isActive }) => isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
          >
            <HiOutlineLockClosed size={20} />
            <span>보안 설정</span>
          </NavLink>

          <NavLink
            to="/admin/settings"
            className={({ isActive }) => isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
          >
            <SettingsIcon size={20} />
            <span>시스템 설정</span>
          </NavLink>
        </nav>
      </aside>

      {/* 메인 컨텐츠 */}
      <main className={styles.main}>
        <button
          onClick={() => navigate('/dashboard')}
          className={styles.backButton}
          title="대시보드로 돌아가기"
        >
          <LogOutIcon size={24} />
        </button>
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
