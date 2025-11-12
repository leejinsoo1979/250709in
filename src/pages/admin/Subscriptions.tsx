import { useEffect, useState } from 'react';
import { collection, query, getDocs, orderBy, where } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useAuth } from '@/auth/AuthProvider';
import { SearchIcon } from '@/components/common/Icons';
import { HiOutlineCreditCard, HiOutlineCheck, HiOutlineX } from 'react-icons/hi';
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

const Subscriptions = () => {
  const { user } = useAuth();
  const [subscriptions, setSubscriptions] = useState<SubscriptionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'cancelled' | 'expired'>('all');
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'>('date-desc');
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);

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
      } catch (error) {
        console.error('❌ 구독 데이터 가져오기 오류:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSubscriptions();
  }, []);

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

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'active':
        return styles.statusActive;
      case 'cancelled':
        return styles.statusCancelled;
      case 'expired':
        return styles.statusExpired;
      default:
        return '';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active':
        return '활성';
      case 'cancelled':
        return '취소됨';
      case 'expired':
        return '만료됨';
      default:
        return status;
    }
  };

  const formatAmount = (amount: number, interval: string) => {
    return `₩${amount.toLocaleString()}/${interval === 'monthly' ? '월' : '년'}`;
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>구독 관리</h1>
          <p className={styles.subtitle}>
            전체 {subscriptions.length}건
            {filteredSubscriptions.length !== subscriptions.length && ` · 필터링 ${filteredSubscriptions.length}건`}
          </p>
        </div>
      </div>

      {/* 검색 및 필터 */}
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <SearchIcon size={20} />
          <input
            type="text"
            placeholder="이메일, 이름, UID, 플랜으로 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
        </div>

        <div className={styles.filters}>
          {/* 상태 필터 드롭다운 */}
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>상태</label>
            <div className={styles.customFilterDropdown}>
              <button
                type="button"
                className={styles.filterButton}
                onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
              >
                <span>
                  {filterStatus === 'all' && '전체'}
                  {filterStatus === 'active' && '활성'}
                  {filterStatus === 'cancelled' && '취소됨'}
                  {filterStatus === 'expired' && '만료됨'}
                </span>
                <svg
                  className={`${styles.dropdownIcon} ${statusDropdownOpen ? styles.dropdownIconOpen : ''}`}
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
              {statusDropdownOpen && (
                <div className={styles.filterDropdownMenu}>
                  <button
                    className={`${styles.filterDropdownItem} ${filterStatus === 'all' ? styles.filterDropdownItemActive : ''}`}
                    onClick={() => {
                      setFilterStatus('all');
                      setStatusDropdownOpen(false);
                    }}
                  >
                    전체
                    {filterStatus === 'all' && (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                  <button
                    className={`${styles.filterDropdownItem} ${filterStatus === 'active' ? styles.filterDropdownItemActive : ''}`}
                    onClick={() => {
                      setFilterStatus('active');
                      setStatusDropdownOpen(false);
                    }}
                  >
                    활성
                    {filterStatus === 'active' && (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                  <button
                    className={`${styles.filterDropdownItem} ${filterStatus === 'cancelled' ? styles.filterDropdownItemActive : ''}`}
                    onClick={() => {
                      setFilterStatus('cancelled');
                      setStatusDropdownOpen(false);
                    }}
                  >
                    취소됨
                    {filterStatus === 'cancelled' && (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                  <button
                    className={`${styles.filterDropdownItem} ${filterStatus === 'expired' ? styles.filterDropdownItemActive : ''}`}
                    onClick={() => {
                      setFilterStatus('expired');
                      setStatusDropdownOpen(false);
                    }}
                  >
                    만료됨
                    {filterStatus === 'expired' && (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 정렬 드롭다운 */}
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>정렬</label>
            <div className={styles.customFilterDropdown}>
              <button
                type="button"
                className={styles.filterButton}
                onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
              >
                <span>
                  {sortBy === 'date-desc' && '시작일 최신순'}
                  {sortBy === 'date-asc' && '시작일 오래된순'}
                  {sortBy === 'amount-desc' && '금액 높은순'}
                  {sortBy === 'amount-asc' && '금액 낮은순'}
                </span>
                <svg
                  className={`${styles.dropdownIcon} ${sortDropdownOpen ? styles.dropdownIconOpen : ''}`}
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
              {sortDropdownOpen && (
                <div className={styles.filterDropdownMenu}>
                  <button
                    className={`${styles.filterDropdownItem} ${sortBy === 'date-desc' ? styles.filterDropdownItemActive : ''}`}
                    onClick={() => {
                      setSortBy('date-desc');
                      setSortDropdownOpen(false);
                    }}
                  >
                    시작일 최신순
                    {sortBy === 'date-desc' && (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                  <button
                    className={`${styles.filterDropdownItem} ${sortBy === 'date-asc' ? styles.filterDropdownItemActive : ''}`}
                    onClick={() => {
                      setSortBy('date-asc');
                      setSortDropdownOpen(false);
                    }}
                  >
                    시작일 오래된순
                    {sortBy === 'date-asc' && (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                  <button
                    className={`${styles.filterDropdownItem} ${sortBy === 'amount-desc' ? styles.filterDropdownItemActive : ''}`}
                    onClick={() => {
                      setSortBy('amount-desc');
                      setSortDropdownOpen(false);
                    }}
                  >
                    금액 높은순
                    {sortBy === 'amount-desc' && (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                  <button
                    className={`${styles.filterDropdownItem} ${sortBy === 'amount-asc' ? styles.filterDropdownItemActive : ''}`}
                    onClick={() => {
                      setSortBy('amount-asc');
                      setSortDropdownOpen(false);
                    }}
                  >
                    금액 낮은순
                    {sortBy === 'amount-asc' && (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 구독 테이블 */}
      <div className={styles.tableContainer}>
        {loading ? (
          <div className={styles.loading}>
            <div className={styles.spinner}></div>
            <p>구독 목록을 불러오는 중...</p>
          </div>
        ) : filteredSubscriptions.length === 0 ? (
          <div className={styles.emptyState}>
            <p>{searchQuery ? '검색 결과가 없습니다.' : '구독이 없습니다.'}</p>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>사용자</th>
                <th>플랜</th>
                <th>금액</th>
                <th>상태</th>
                <th>시작일</th>
                <th>종료일</th>
                <th>결제 방법</th>
              </tr>
            </thead>
            <tbody>
              {filteredSubscriptions.map((subscription) => (
                <tr key={subscription.id}>
                  <td>
                    <div className={styles.userInfo}>
                      <div>
                        <div className={styles.userName}>
                          {subscription.userName || '이름 없음'}
                        </div>
                        <div className={styles.userEmail}>{subscription.userEmail}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={styles.planBadge}>{subscription.plan}</span>
                  </td>
                  <td className={styles.amount}>
                    {formatAmount(subscription.amount, subscription.interval)}
                  </td>
                  <td>
                    <span className={`${styles.statusBadge} ${getStatusBadgeClass(subscription.status)}`}>
                      {getStatusText(subscription.status)}
                    </span>
                  </td>
                  <td>{subscription.startDate.toLocaleDateString('ko-KR')}</td>
                  <td>
                    {subscription.endDate
                      ? subscription.endDate.toLocaleDateString('ko-KR')
                      : '-'}
                  </td>
                  <td>{subscription.paymentMethod || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default Subscriptions;
