import { useEffect, useState } from 'react';
import { collection, query, getDocs, orderBy, where } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useAuth } from '@/auth/AuthProvider';
import { SearchIcon } from '@/components/common/Icons';
import { HiOutlineCreditCard, HiOutlineCheck, HiOutlineX, HiOutlineTrendingUp, HiOutlineTrendingDown, HiOutlineUsers, HiOutlineCash } from 'react-icons/hi';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import styles from './Subscriptions.module.css';

interface SubscriptionData {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  plan: string;
  status: 'active' | 'cancelled' | 'expired';
  startDate: Date;
  endDate?: Date;
  amount: number;
  interval: 'monthly' | 'yearly';
  paymentMethod?: string;
}

interface SubscriptionStats {
  totalRevenue: number;
  monthlyRevenue: number;
  activeSubscriptions: number;
  cancelledSubscriptions: number;
  planDistribution: { name: string; value: number; color: string }[];
  revenueByPlan: { plan: string; revenue: number }[];
}

const PLAN_COLORS: Record<string, string> = {
  free: '#9CA3AF',
  basic: '#3B82F6',
  pro: '#8B5CF6',
  enterprise: '#F59E0B'
};

const Subscriptions = () => {
  const { user } = useAuth();
  const [subscriptions, setSubscriptions] = useState<SubscriptionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'cancelled' | 'expired'>('all');
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'>('date-desc');
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [stats, setStats] = useState<SubscriptionStats>({
    totalRevenue: 0,
    monthlyRevenue: 0,
    activeSubscriptions: 0,
    cancelledSubscriptions: 0,
    planDistribution: [],
    revenueByPlan: []
  });

  // 테마 색상 가져오기
  const getThemeColor = (variableName: string, fallback: string) => {
    if (typeof window !== 'undefined') {
      const color = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
      return color || fallback;
    }
    return fallback;
  };

  const themeColor = getThemeColor('--theme-primary', '#667eea');

  useEffect(() => {
    const fetchSubscriptions = async () => {
      try {
        setLoading(true);
        console.log('💳 구독 목록 조회 중...');

        const subscriptionsQuery = query(
          collection(db, 'subscriptions'),
          orderBy('startDate', 'desc')
        );
        const subscriptionsSnapshot = await getDocs(subscriptionsQuery);

        const subscriptionsData: SubscriptionData[] = [];
        subscriptionsSnapshot.docs.forEach((doc) => {
          const data = doc.data();
          subscriptionsData.push({
            id: doc.id,
            userId: data.userId || '',
            userEmail: data.userEmail || '',
            userName: data.userName || '',
            plan: data.plan || 'free',
            status: data.status || 'active',
            startDate: data.startDate?.toDate() || new Date(),
            endDate: data.endDate?.toDate(),
            amount: data.amount || 0,
            interval: data.interval || 'monthly',
            paymentMethod: data.paymentMethod
          });
        });

        console.log('💳 구독 데이터:', subscriptionsData);
        setSubscriptions(subscriptionsData);

        // 통계 계산
        calculateStats(subscriptionsData);
      } catch (error) {
        console.error('❌ 구독 데이터 가져오기 오류:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSubscriptions();
  }, []);

  const calculateStats = (data: SubscriptionData[]) => {
    const totalRevenue = data.reduce((sum, sub) => sum + sub.amount, 0);
    const activeSubscriptions = data.filter(sub => sub.status === 'active').length;
    const cancelledSubscriptions = data.filter(sub => sub.status === 'cancelled').length;

    // 이번 달 매출
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const monthlyRevenue = data
      .filter(sub => {
        const subDate = new Date(sub.startDate);
        return subDate.getMonth() === currentMonth && subDate.getFullYear() === currentYear && sub.status === 'active';
      })
      .reduce((sum, sub) => sum + sub.amount, 0);

    // 플랜별 분포
    const planCounts: Record<string, number> = {};
    data.forEach(sub => {
      planCounts[sub.plan] = (planCounts[sub.plan] || 0) + 1;
    });

    const planDistribution = Object.entries(planCounts).map(([plan, count]) => ({
      name: plan.charAt(0).toUpperCase() + plan.slice(1),
      value: count,
      color: PLAN_COLORS[plan] || '#9CA3AF'
    }));

    // 플랜별 매출
    const revenueByPlanMap: Record<string, number> = {};
    data.forEach(sub => {
      revenueByPlanMap[sub.plan] = (revenueByPlanMap[sub.plan] || 0) + sub.amount;
    });

    const revenueByPlan = Object.entries(revenueByPlanMap).map(([plan, revenue]) => ({
      plan: plan.charAt(0).toUpperCase() + plan.slice(1),
      revenue
    }));

    setStats({
      totalRevenue,
      monthlyRevenue,
      activeSubscriptions,
      cancelledSubscriptions,
      planDistribution,
      revenueByPlan
    });
  };

  // Click outside 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (statusDropdownOpen && !target.closest(`.${styles.customFilterDropdown}`)) {
        setStatusDropdownOpen(false);
      }
      if (sortDropdownOpen && !target.closest(`.${styles.customFilterDropdown}`)) {
        setSortDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [statusDropdownOpen, sortDropdownOpen]);

  // 필터링 및 정렬
  const filteredSubscriptions = subscriptions
    .filter(subscription => {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        subscription.userEmail?.toLowerCase().includes(query) ||
        subscription.userName?.toLowerCase().includes(query) ||
        subscription.userId.toLowerCase().includes(query) ||
        subscription.plan.toLowerCase().includes(query);

      const matchesStatus = filterStatus === 'all' || subscription.status === filterStatus;

      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'date-desc':
          return b.startDate.getTime() - a.startDate.getTime();
        case 'date-asc':
          return a.startDate.getTime() - b.startDate.getTime();
        case 'amount-desc':
          return b.amount - a.amount;
        case 'amount-asc':
          return a.amount - b.amount;
        default:
          return 0;
      }
    });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW'
    }).format(amount);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>구독 데이터 로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleSection}>
          <h1 className={styles.title}>구독 관리</h1>
          <p className={styles.subtitle}>구독자 및 매출 현황을 관리합니다</p>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <HiOutlineCash size={24} />
          </div>
          <div className={styles.statContent}>
            <div className={styles.statLabel}>총 매출</div>
            <div className={styles.statValue}>{formatCurrency(stats.totalRevenue)}</div>
            <div className={styles.statChange}>
              <HiOutlineTrendingUp size={16} />
              <span>전체 기간</span>
            </div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <HiOutlineCreditCard size={24} />
          </div>
          <div className={styles.statContent}>
            <div className={styles.statLabel}>이번 달 매출</div>
            <div className={styles.statValue}>{formatCurrency(stats.monthlyRevenue)}</div>
            <div className={styles.statChange}>
              <HiOutlineTrendingUp size={16} />
              <span>{new Date().getMonth() + 1}월</span>
            </div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <HiOutlineCheck size={24} />
          </div>
          <div className={styles.statContent}>
            <div className={styles.statLabel}>활성 구독</div>
            <div className={styles.statValue}>{stats.activeSubscriptions}</div>
            <div className={styles.statChange}>
              <HiOutlineTrendingUp size={16} />
              <span>현재 활성</span>
            </div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}>
            <HiOutlineX size={24} />
          </div>
          <div className={styles.statContent}>
            <div className={styles.statLabel}>취소된 구독</div>
            <div className={styles.statValue}>{stats.cancelledSubscriptions}</div>
            <div className={styles.statChange}>
              <HiOutlineTrendingDown size={16} />
              <span>누적</span>
            </div>
          </div>
        </div>
      </div>

      {/* 차트 섹션 */}
      <div className={styles.chartsGrid}>
        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle}>플랜별 구독자 분포</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={stats.planDistribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {stats.planDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle}>플랜별 매출</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={stats.revenueByPlan}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="plan" />
              <YAxis />
              <Tooltip formatter={(value) => formatCurrency(value as number)} />
              <Bar dataKey="revenue" fill={themeColor} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 필터 및 검색 */}
      <div className={styles.filterSection}>
        <div className={styles.searchBox}>
          <SearchIcon className={styles.searchIcon} />
          <input
            type="text"
            placeholder="이메일, 이름, UID, 플랜으로 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
        </div>

        <div className={styles.filterControls}>
          <div className={styles.customFilterDropdown}>
            <button
              className={styles.filterButton}
              onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
            >
              상태: {filterStatus === 'all' ? '전체' : filterStatus === 'active' ? '활성' : filterStatus === 'cancelled' ? '취소됨' : '만료됨'}
              <span className={styles.dropdownArrow}>▼</span>
            </button>
            {statusDropdownOpen && (
              <div className={styles.dropdownMenu}>
                <button onClick={() => { setFilterStatus('all'); setStatusDropdownOpen(false); }}>전체</button>
                <button onClick={() => { setFilterStatus('active'); setStatusDropdownOpen(false); }}>활성</button>
                <button onClick={() => { setFilterStatus('cancelled'); setStatusDropdownOpen(false); }}>취소됨</button>
                <button onClick={() => { setFilterStatus('expired'); setStatusDropdownOpen(false); }}>만료됨</button>
              </div>
            )}
          </div>

          <div className={styles.customFilterDropdown}>
            <button
              className={styles.filterButton}
              onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
            >
              정렬: {sortBy === 'date-desc' ? '최신순' : sortBy === 'date-asc' ? '오래된순' : sortBy === 'amount-desc' ? '금액높은순' : '금액낮은순'}
              <span className={styles.dropdownArrow}>▼</span>
            </button>
            {sortDropdownOpen && (
              <div className={styles.dropdownMenu}>
                <button onClick={() => { setSortBy('date-desc'); setSortDropdownOpen(false); }}>최신순</button>
                <button onClick={() => { setSortBy('date-asc'); setSortDropdownOpen(false); }}>오래된순</button>
                <button onClick={() => { setSortBy('amount-desc'); setSortDropdownOpen(false); }}>금액 높은순</button>
                <button onClick={() => { setSortBy('amount-asc'); setSortDropdownOpen(false); }}>금액 낮은순</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 구독 목록 */}
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h3>구독 목록</h3>
          <span className={styles.tableCount}>{filteredSubscriptions.length}개</span>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>사용자</th>
                <th>플랜</th>
                <th>상태</th>
                <th>시작일</th>
                <th>종료일</th>
                <th>금액</th>
                <th>주기</th>
                <th>결제수단</th>
              </tr>
            </thead>
            <tbody>
              {filteredSubscriptions.map((subscription) => (
                <tr key={subscription.id}>
                  <td>
                    <div className={styles.userInfo}>
                      <div className={styles.userName}>{subscription.userName || '이름 없음'}</div>
                      <div className={styles.userEmail}>{subscription.userEmail}</div>
                    </div>
                  </td>
                  <td>
                    <span className={styles.planBadge} style={{ backgroundColor: PLAN_COLORS[subscription.plan] || '#9CA3AF' }}>
                      {subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)}
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.statusBadge} ${styles[`status${subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}`]}`}>
                      {subscription.status === 'active' ? '활성' : subscription.status === 'cancelled' ? '취소됨' : '만료됨'}
                    </span>
                  </td>
                  <td>{formatDate(subscription.startDate)}</td>
                  <td>{subscription.endDate ? formatDate(subscription.endDate) : '-'}</td>
                  <td className={styles.amount}>{formatCurrency(subscription.amount)}</td>
                  <td>
                    <span className={styles.intervalBadge}>
                      {subscription.interval === 'monthly' ? '월간' : '연간'}
                    </span>
                  </td>
                  <td>{subscription.paymentMethod || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredSubscriptions.length === 0 && (
            <div className={styles.emptyState}>
              <HiOutlineUsers size={48} />
              <p>구독 내역이 없습니다</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Subscriptions;
