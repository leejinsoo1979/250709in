import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from 'firebase/auth';
import { getCurrentUser } from '@/firebase/auth';
import { useAdmin } from '@/hooks/useAdmin';
import { collection, getDocs, getCountFromServer } from 'firebase/firestore';
import { db } from '@/firebase/config';
import styles from './AdminDashboard.module.css';

interface AdminStats {
  totalUsers: number;
  totalOrganizations: number;
  totalProjects: number;
  totalDesigns: number;
}

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const { adminRole, isAdmin, isSuperAdmin, loading } = useAdmin(user);
  const [stats, setStats] = useState<AdminStats>({
    totalUsers: 0,
    totalOrganizations: 0,
    totalProjects: 0,
    totalDesigns: 0
  });
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    const currentUser = getCurrentUser();
    setUser(currentUser);

    // 로그인하지 않은 경우 로그인 페이지로 리다이렉트
    if (!currentUser) {
      navigate('/login');
    }
  }, [navigate]);

  useEffect(() => {
    // 관리자가 아닌 경우 대시보드로 리다이렉트
    if (!loading && user && !isAdmin) {
      alert('관리자 권한이 필요합니다.');
      navigate('/dashboard');
    }
  }, [loading, user, isAdmin, navigate]);

  // Firebase 통계 데이터 가져오기
  useEffect(() => {
    const fetchStats = async () => {
      if (!user || !isAdmin) return;

      try {
        setStatsLoading(true);

        // 전체 사용자 수 (users 컬렉션)
        const usersSnapshot = await getCountFromServer(collection(db, 'users'));
        const totalUsers = usersSnapshot.data().count;

        // 전체 조직 수 (organizations 컬렉션)
        const orgsSnapshot = await getCountFromServer(collection(db, 'organizations'));
        const totalOrganizations = orgsSnapshot.data().count;

        // 전체 프로젝트 수 (projects 컬렉션)
        const projectsSnapshot = await getCountFromServer(collection(db, 'projects'));
        const totalProjects = projectsSnapshot.data().count;

        // 전체 디자인 파일 수 (designs 컬렉션)
        const designsSnapshot = await getCountFromServer(collection(db, 'designs'));
        const totalDesigns = designsSnapshot.data().count;

        setStats({
          totalUsers,
          totalOrganizations,
          totalProjects,
          totalDesigns
        });
      } catch (error) {
        console.error('통계 데이터 가져오기 오류:', error);
      } finally {
        setStatsLoading(false);
      }
    };

    fetchStats();
  }, [user, isAdmin]);

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
      {/* 헤더 */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>비펀 관리자</h1>
          {adminRole && (
            <span className={styles.roleBadge}>
              {adminRole === 'super' && '슈퍼 관리자'}
              {adminRole === 'admin' && '관리자'}
              {adminRole === 'support' && '지원팀'}
              {adminRole === 'sales' && '영업팀'}
            </span>
          )}
        </div>
        <div className={styles.headerRight}>
          <button
            onClick={() => navigate('/dashboard')}
            className={styles.backButton}
          >
            대시보드로 돌아가기
          </button>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <div className={styles.content}>
        {/* 통계 카드 */}
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statIcon}>👥</div>
            <div className={styles.statContent}>
              <h3 className={styles.statLabel}>전체 사용자</h3>
              <p className={styles.statValue}>
                {statsLoading ? '...' : stats.totalUsers.toLocaleString()}
              </p>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIcon}>🏢</div>
            <div className={styles.statContent}>
              <h3 className={styles.statLabel}>조직</h3>
              <p className={styles.statValue}>
                {statsLoading ? '...' : stats.totalOrganizations.toLocaleString()}
              </p>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIcon}>📊</div>
            <div className={styles.statContent}>
              <h3 className={styles.statLabel}>프로젝트</h3>
              <p className={styles.statValue}>
                {statsLoading ? '...' : stats.totalProjects.toLocaleString()}
              </p>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIcon}>💼</div>
            <div className={styles.statContent}>
              <h3 className={styles.statLabel}>디자인 파일</h3>
              <p className={styles.statValue}>
                {statsLoading ? '...' : stats.totalDesigns.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* 퀵 액션 */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>퀵 액션</h2>
          <div className={styles.actionGrid}>
            <button className={styles.actionCard} disabled>
              <span className={styles.actionIcon}>👥</span>
              <span className={styles.actionLabel}>사용자 관리</span>
            </button>

            <button className={styles.actionCard} disabled>
              <span className={styles.actionIcon}>🏢</span>
              <span className={styles.actionLabel}>조직 관리</span>
            </button>

            <button className={styles.actionCard} disabled>
              <span className={styles.actionIcon}>💳</span>
              <span className={styles.actionLabel}>결제 관리</span>
            </button>

            <button className={styles.actionCard} disabled>
              <span className={styles.actionIcon}>📊</span>
              <span className={styles.actionLabel}>통계 분석</span>
            </button>

            <button className={styles.actionCard} disabled>
              <span className={styles.actionIcon}>🔒</span>
              <span className={styles.actionLabel}>보안 설정</span>
            </button>

            <button className={styles.actionCard} disabled>
              <span className={styles.actionIcon}>⚙️</span>
              <span className={styles.actionLabel}>시스템 설정</span>
            </button>
          </div>
        </div>

        {/* 개발 중 안내 */}
        <div className={styles.section}>
          <div className={styles.notice}>
            <h3>🚧 개발 중</h3>
            <p>관리자 페이지는 현재 개발 중입니다.</p>
            <p>곧 다양한 관리 기능이 추가될 예정입니다.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
