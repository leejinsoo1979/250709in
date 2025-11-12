import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { collection, getCountFromServer, onSnapshot } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { UsersIcon } from '@/components/common/Icons';
import { HiOutlineOfficeBuilding, HiOutlineChartBar, HiOutlineBriefcase } from 'react-icons/hi';
import styles from './Dashboard.module.css';

interface AdminStats {
  totalUsers: number;
  totalOrganizations: number;
  totalProjects: number;
  totalDesigns: number;
}

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<AdminStats>({
    totalUsers: 0,
    totalOrganizations: 0,
    totalProjects: 0,
    totalDesigns: 0
  });
  const [statsLoading, setStatsLoading] = useState(true);

  // Firebase 통계 데이터 실시간 동기화
  useEffect(() => {
    if (!user) return;

    const fetchInitialStats = async () => {
      try {
        setStatsLoading(true);

        const [usersSnapshot, orgsSnapshot, projectsSnapshot, designsSnapshot] = await Promise.all([
          getCountFromServer(collection(db, 'users')),
          getCountFromServer(collection(db, 'organizations')),
          getCountFromServer(collection(db, 'projects')),
          getCountFromServer(collection(db, 'designs'))
        ]);

        setStats({
          totalUsers: usersSnapshot.data().count,
          totalOrganizations: orgsSnapshot.data().count,
          totalProjects: projectsSnapshot.data().count,
          totalDesigns: designsSnapshot.data().count
        });
      } catch (error) {
        console.error('통계 데이터 가져오기 오류:', error);
      } finally {
        setStatsLoading(false);
      }
    };

    fetchInitialStats();

    // 실시간 업데이트 구독
    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setStats(prev => ({ ...prev, totalUsers: snapshot.size }));
    });

    const unsubscribeOrgs = onSnapshot(collection(db, 'organizations'), (snapshot) => {
      setStats(prev => ({ ...prev, totalOrganizations: snapshot.size }));
    });

    const unsubscribeProjects = onSnapshot(collection(db, 'projects'), (snapshot) => {
      setStats(prev => ({ ...prev, totalProjects: snapshot.size }));
    });

    const unsubscribeDesigns = onSnapshot(collection(db, 'designs'), (snapshot) => {
      setStats(prev => ({ ...prev, totalDesigns: snapshot.size }));
    });

    return () => {
      unsubscribeUsers();
      unsubscribeOrgs();
      unsubscribeProjects();
      unsubscribeDesigns();
    };
  }, [user]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>대시보드</h1>
        <p className={styles.subtitle}>시스템 전체 현황을 한눈에 확인하세요</p>
      </div>

      {/* 통계 카드 */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <UsersIcon size={24} />
          </div>
          <div className={styles.statContent}>
            <h3 className={styles.statLabel}>전체 사용자</h3>
            <p className={styles.statValue}>
              {statsLoading ? '...' : stats.totalUsers.toLocaleString()}
            </p>
            <span className={styles.statChange}>+0% from last month</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <HiOutlineOfficeBuilding size={24} />
          </div>
          <div className={styles.statContent}>
            <h3 className={styles.statLabel}>조직</h3>
            <p className={styles.statValue}>
              {statsLoading ? '...' : stats.totalOrganizations.toLocaleString()}
            </p>
            <span className={styles.statChange}>+0% from last month</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <HiOutlineChartBar size={24} />
          </div>
          <div className={styles.statContent}>
            <h3 className={styles.statLabel}>프로젝트</h3>
            <p className={styles.statValue}>
              {statsLoading ? '...' : stats.totalProjects.toLocaleString()}
            </p>
            <span className={styles.statChange}>+0% from last month</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <HiOutlineBriefcase size={24} />
          </div>
          <div className={styles.statContent}>
            <h3 className={styles.statLabel}>디자인 파일</h3>
            <p className={styles.statValue}>
              {statsLoading ? '...' : stats.totalDesigns.toLocaleString()}
            </p>
            <span className={styles.statChange}>+0% from last month</span>
          </div>
        </div>
      </div>

      {/* 최근 활동 */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>최근 활동</h2>
        <div className={styles.activityList}>
          <div className={styles.emptyState}>
            <p>최근 활동 내역이 없습니다.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
