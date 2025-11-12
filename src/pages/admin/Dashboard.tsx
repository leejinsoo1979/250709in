import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { collection, getCountFromServer, onSnapshot, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { UsersIcon } from '@/components/common/Icons';
import { HiOutlineOfficeBuilding, HiOutlineChartBar, HiOutlineBriefcase, HiOutlineTrendingUp, HiOutlineClock, HiOutlineUserGroup } from 'react-icons/hi';
import styles from './Dashboard.module.css';

interface AdminStats {
  totalUsers: number;
  totalOrganizations: number;
  totalProjects: number;
  totalDesigns: number;
  activeUsers: number;
  newUsersThisMonth: number;
  newUsersToday: number;
}

interface RecentActivity {
  id: string;
  type: string;
  user: string;
  email: string;
  action: string;
  timestamp: Date;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState<AdminStats>({
    totalUsers: 0,
    totalOrganizations: 0,
    totalProjects: 0,
    totalDesigns: 0,
    activeUsers: 0,
    newUsersThisMonth: 0,
    newUsersToday: 0
  });
  const [statsLoading, setStatsLoading] = useState(true);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);

  // Firebase 통계 데이터 가져오기
  useEffect(() => {
    if (!user) return;

    const fetchStats = async () => {
      try {
        setStatsLoading(true);

        // 기본 통계
        const [usersSnapshot, orgsSnapshot, projectsSnapshot, designsSnapshot] = await Promise.all([
          getCountFromServer(collection(db, 'users')),
          getCountFromServer(collection(db, 'organizations')),
          getCountFromServer(collection(db, 'projects')),
          getCountFromServer(collection(db, 'designFiles'))
        ]);

        // 오늘 가입한 사용자 (오늘 00:00:00부터)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTimestamp = Timestamp.fromDate(today);

        const newUsersTodayQuery = query(
          collection(db, 'users'),
          where('createdAt', '>=', todayTimestamp)
        );
        const newUsersTodaySnapshot = await getCountFromServer(newUsersTodayQuery);

        // 이번 달 가입한 사용자 (이번 달 1일 00:00:00부터)
        const firstDayOfMonth = new Date();
        firstDayOfMonth.setDate(1);
        firstDayOfMonth.setHours(0, 0, 0, 0);
        const monthTimestamp = Timestamp.fromDate(firstDayOfMonth);

        const newUsersMonthQuery = query(
          collection(db, 'users'),
          where('createdAt', '>=', monthTimestamp)
        );
        const newUsersMonthSnapshot = await getCountFromServer(newUsersMonthQuery);

        // 활성 사용자 (최근 7일 이내 로그인)
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekTimestamp = Timestamp.fromDate(weekAgo);

        const activeUsersQuery = query(
          collection(db, 'users'),
          where('lastLoginAt', '>=', weekTimestamp)
        );
        const activeUsersSnapshot = await getCountFromServer(activeUsersQuery);

        setStats({
          totalUsers: usersSnapshot.data().count,
          totalOrganizations: orgsSnapshot.data().count,
          totalProjects: projectsSnapshot.data().count,
          totalDesigns: designsSnapshot.data().count,
          activeUsers: activeUsersSnapshot.data().count,
          newUsersThisMonth: newUsersMonthSnapshot.data().count,
          newUsersToday: newUsersTodaySnapshot.data().count
        });
      } catch (error) {
        console.error('통계 데이터 가져오기 오류:', error);
      } finally {
        setStatsLoading(false);
      }
    };

    fetchStats();

    // 실시간 사용자 수 업데이트
    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setStats(prev => ({ ...prev, totalUsers: snapshot.size }));
    });

    // 실시간 프로젝트 수 업데이트
    const unsubscribeProjects = onSnapshot(collection(db, 'projects'), (snapshot) => {
      setStats(prev => ({ ...prev, totalProjects: snapshot.size }));
    });

    return () => {
      unsubscribeUsers();
      unsubscribeProjects();
    };
  }, [user]);

  // 최근 활동 가져오기
  useEffect(() => {
    if (!user) return;

    const fetchRecentActivities = async () => {
      try {
        // 최근 생성된 사용자
        const recentUsersQuery = query(
          collection(db, 'users'),
          orderBy('createdAt', 'desc'),
          limit(10)
        );
        const usersSnapshot = await getDocs(recentUsersQuery);

        const activities: RecentActivity[] = [];
        usersSnapshot.forEach(doc => {
          const data = doc.data();
          activities.push({
            id: doc.id,
            type: 'user_created',
            user: data.displayName || data.name || '이름 없음',
            email: data.email || '',
            action: '새 사용자 가입',
            timestamp: data.createdAt?.toDate() || new Date()
          });
        });

        // 최근 생성된 프로젝트
        const recentProjectsQuery = query(
          collection(db, 'projects'),
          orderBy('createdAt', 'desc'),
          limit(5)
        );
        const projectsSnapshot = await getDocs(recentProjectsQuery);

        projectsSnapshot.forEach(doc => {
          const data = doc.data();
          activities.push({
            id: doc.id,
            type: 'project_created',
            user: data.projectName || '프로젝트',
            email: '',
            action: '새 프로젝트 생성',
            timestamp: data.createdAt?.toDate() || new Date()
          });
        });

        // 시간순 정렬
        activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

        setRecentActivities(activities.slice(0, 10));
      } catch (error) {
        console.error('최근 활동 가져오기 오류:', error);
      }
    };

    fetchRecentActivities();
  }, [user]);

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'user_created':
        return <UsersIcon size={16} />;
      case 'project_created':
        return <HiOutlineChartBar size={16} />;
      default:
        return <HiOutlineClock size={16} />;
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>시스템 관리 대시보드</h1>
          <p className={styles.subtitle}>전체 시스템 현황 및 사용자 관리</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.actionButton} onClick={() => navigate('/admin/users')}>
            <UsersIcon size={18} />
            사용자 관리
          </button>
          <button className={styles.actionButton} onClick={() => navigate('/admin/organizations')}>
            <HiOutlineOfficeBuilding size={18} />
            조직 관리
          </button>
        </div>
      </div>

      {/* 주요 통계 카드 */}
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
            <span className={styles.statChange}>
              <HiOutlineTrendingUp size={14} />
              오늘 +{stats.newUsersToday}
            </span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <HiOutlineUserGroup size={24} />
          </div>
          <div className={styles.statContent}>
            <h3 className={styles.statLabel}>활성 사용자 (7일)</h3>
            <p className={styles.statValue}>
              {statsLoading ? '...' : stats.activeUsers.toLocaleString()}
            </p>
            <span className={styles.statChange}>
              {stats.totalUsers > 0 ? Math.round((stats.activeUsers / stats.totalUsers) * 100) : 0}% 활성률
            </span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <HiOutlineTrendingUp size={24} />
          </div>
          <div className={styles.statContent}>
            <h3 className={styles.statLabel}>이번 달 신규 가입</h3>
            <p className={styles.statValue}>
              {statsLoading ? '...' : stats.newUsersThisMonth.toLocaleString()}
            </p>
            <span className={styles.statChange}>
              평균 일 {Math.round(stats.newUsersThisMonth / new Date().getDate())}명
            </span>
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
            <span className={styles.statChange}>B2B 고객사</span>
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
            <span className={styles.statChange}>
              평균 {stats.totalUsers > 0 ? (stats.totalProjects / stats.totalUsers).toFixed(1) : 0}개/사용자
            </span>
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
            <span className={styles.statChange}>
              평균 {stats.totalProjects > 0 ? (stats.totalDesigns / stats.totalProjects).toFixed(1) : 0}개/프로젝트
            </span>
          </div>
        </div>
      </div>

      {/* 최근 활동 */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>최근 활동</h2>
        <div className={styles.activityList}>
          {recentActivities.length === 0 ? (
            <div className={styles.emptyState}>
              <p>최근 활동 내역이 없습니다.</p>
            </div>
          ) : (
            <table className={styles.activityTable}>
              <thead>
                <tr>
                  <th>유형</th>
                  <th>사용자/항목</th>
                  <th>활동</th>
                  <th>시간</th>
                </tr>
              </thead>
              <tbody>
                {recentActivities.map((activity) => (
                  <tr key={activity.id}>
                    <td>
                      <div className={styles.activityIcon}>
                        {getActivityIcon(activity.type)}
                      </div>
                    </td>
                    <td>
                      <div className={styles.activityUser}>
                        <span className={styles.userName}>{activity.user}</span>
                        {activity.email && (
                          <span className={styles.userEmail}>{activity.email}</span>
                        )}
                      </div>
                    </td>
                    <td>{activity.action}</td>
                    <td className={styles.timestamp}>
                      {activity.timestamp.toLocaleString('ko-KR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
