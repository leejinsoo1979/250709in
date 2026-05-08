import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, getDocs, DocumentData } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useAuth } from '@/auth/AuthProvider';
import { SearchIcon } from '@/components/common/Icons';
import { getAllAdmins, isSuperAdmin } from '@/firebase/admins';
import { updateUserPlan, PLANS, PlanType } from '@/firebase/plans';
import { adminDeleteUserData } from '@/firebase/userProfiles';
import { getAllUserUsageStats, clearUserUsageStatsCache, UserUsageStats } from '@/firebase/userUsageStats';
import { GiImperialCrown } from 'react-icons/gi';
import { FiUser } from 'react-icons/fi';
import { PiMedal } from 'react-icons/pi';
import styles from './Users.module.css';

interface UserData {
  id: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  createdAt?: Date;
  lastLoginAt?: Date;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  isPartner?: boolean;
  plan?: PlanType;
}

const Users = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<
    'date-desc' | 'date-asc' | 'name-asc' | 'name-desc'
    | 'projects-desc' | 'designs-desc' | 'last-login-desc' | 'last-activity-desc'
  >('date-desc');
  const [usageStats, setUsageStats] = useState<Record<string, UserUsageStats>>({});
  const [usageLoading, setUsageLoading] = useState(false);
  // 회원 유형 필터: all=전체, enterprise=기업회원, partner=파트너사, admin=관리자(슈퍼관리자 포함), general=일반회원
  const [filterPlan, setFilterPlan] = useState<'all' | 'enterprise' | 'partner' | 'admin' | 'general'>('all');
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [planFilterDropdownOpen, setPlanFilterDropdownOpen] = useState(false);
  const [planDialog, setPlanDialog] = useState<{
    show: boolean;
    userId: string;
    userName: string;
    currentPlan: PlanType;
    newPlan: PlanType;
  }>({ show: false, userId: '', userName: '', currentPlan: 'free', newPlan: 'free' });

  // 회원 삭제 다이얼로그
  const [deleteDialog, setDeleteDialog] = useState<{
    show: boolean;
    userId: string;
    userEmail: string;
    userName: string;
    confirmInput: string;
    submitting: boolean;
  }>({ show: false, userId: '', userEmail: '', userName: '', confirmInput: '', submitting: false });

  const isAdminUser = user && (isSuperAdmin(user.email) || getAllAdmins().then(admins => admins.has(user.uid)));

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true);
        console.log('👥 사용자 목록 조회 중...');

        // users 컬렉션 조회
        const usersQuery = query(collection(db, 'users'));
        const usersSnapshot = await getDocs(usersQuery).catch(err => {
          console.error('❌ users 조회 실패:', err);
          return { docs: [] };
        });

        // admins 컬렉션 조회
        const adminsMap = await getAllAdmins();
        console.log('👑 관리자 수:', adminsMap.size);

        console.log('👥 사용자 수:', usersSnapshot.docs.length);

        const usersData: UserData[] = [];
        usersSnapshot.docs.forEach((doc) => {
          const data = doc.data() as DocumentData;
          const userEmail = data.email || '';

          usersData.push({
            id: doc.id,
            email: userEmail,
            displayName: data.displayName || data.name || '',
            photoURL: data.photoURL || '',
            createdAt: data.createdAt?.toDate?.() || null,
            lastLoginAt: data.lastLoginAt?.toDate?.() || null,
            isAdmin: adminsMap.has(doc.id),
            isSuperAdmin: isSuperAdmin(userEmail),
            isPartner: !!data.isPartner,
            plan: (data.plan as PlanType) || 'free'
          });
        });

        // 클라이언트에서 정렬 (createdAt 기준 내림차순)
        usersData.sort((a, b) => {
          if (!a.createdAt) return 1;
          if (!b.createdAt) return -1;
          return b.createdAt.getTime() - a.createdAt.getTime();
        });

        console.log('👥 사용자 데이터:', usersData);
        setUsers(usersData);
      } catch (error) {
        console.error('❌ 사용자 데이터 가져오기 오류:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  // 사용량 정렬 선택 시 통계 lazy 로드 (sessionStorage 캐시 적용)
  useEffect(() => {
    const usageRequired =
      sortBy === 'projects-desc' ||
      sortBy === 'designs-desc' ||
      sortBy === 'last-activity-desc';
    if (!usageRequired) return;
    if (Object.keys(usageStats).length > 0) return; // 이미 로드됨

    let cancelled = false;
    (async () => {
      setUsageLoading(true);
      try {
        const stats = await getAllUserUsageStats();
        if (!cancelled) setUsageStats(stats);
      } finally {
        if (!cancelled) setUsageLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sortBy, usageStats]);

  // 사용량 새로고침 (캐시 무효화 후 재로드)
  const refreshUsageStats = async () => {
    clearUserUsageStatsCache();
    setUsageStats({});
    setUsageLoading(true);
    try {
      const stats = await getAllUserUsageStats(true);
      setUsageStats(stats);
    } finally {
      setUsageLoading(false);
    }
  };

  // Click outside 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (sortDropdownOpen && !target.closest(`.${styles.customFilterDropdown}`)) {
        setSortDropdownOpen(false);
      }
      if (planFilterDropdownOpen && !target.closest(`.${styles.customFilterDropdown}`)) {
        setPlanFilterDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [sortDropdownOpen, planFilterDropdownOpen]);

  // 사용자 상세 정보 페이지로 이동
  const openUserDetails = (user: UserData) => {
    console.log('👤 사용자 상세 정보로 이동:', user);
    navigate(`/admin/users/${user.id}`);
  };

  // 플랜 변경 다이얼로그 열기
  const openPlanDialog = (userId: string, userName: string, currentPlan: PlanType) => {
    setPlanDialog({
      show: true,
      userId,
      userName,
      currentPlan,
      newPlan: currentPlan
    });
  };

  // 플랜 변경 실행
  const handlePlanChange = async () => {
    const { userId, newPlan } = planDialog;

    try {
      await updateUserPlan(userId, newPlan);
      alert(`✅ 플랜이 ${PLANS[newPlan].name}(으)로 변경되었습니다.`);

      // 사용자 목록 새로고침
      setUsers(prevUsers =>
        prevUsers.map(u =>
          u.id === userId ? { ...u, plan: newPlan } : u
        )
      );
    } catch (error) {
      alert('❌ 플랜 변경 실패: ' + (error as Error).message);
    } finally {
      setPlanDialog({ show: false, userId: '', userName: '', currentPlan: 'free', newPlan: 'free' });
    }
  };

  // 회원 삭제 다이얼로그 열기
  const openDeleteDialog = (userId: string, userEmail: string, userName: string) => {
    setDeleteDialog({
      show: true,
      userId,
      userEmail,
      userName,
      confirmInput: '',
      submitting: false,
    });
  };

  // 회원 삭제 실행 (Firestore 데이터 일괄 삭제 → 동일 이메일 재가입 가능)
  const handleDeleteUser = async () => {
    const { userId, userEmail, confirmInput } = deleteDialog;
    if (confirmInput.trim().toLowerCase() !== userEmail.trim().toLowerCase()) {
      alert('확인을 위해 사용자의 이메일을 정확히 입력해주세요.');
      return;
    }

    setDeleteDialog((prev) => ({ ...prev, submitting: true }));
    try {
      const { error, deletedCounts } = await adminDeleteUserData(userId);
      if (error) {
        alert('❌ 회원 삭제 실패: ' + error);
        setDeleteDialog((prev) => ({ ...prev, submitting: false }));
        return;
      }

      const projects = deletedCounts?.projects ?? 0;
      alert(
        `✅ 회원 탈퇴 처리가 완료되었습니다.\n` +
        `- 프로젝트 ${projects}건 삭제\n` +
        `- Firestore 사용자 문서 삭제\n` +
        `- Firebase Auth 계정 삭제\n\n` +
        `동일 이메일로 재가입이 가능합니다.`
      );

      // 목록에서 제거
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      setDeleteDialog({ show: false, userId: '', userEmail: '', userName: '', confirmInput: '', submitting: false });
    } catch (e) {
      alert('❌ 회원 삭제 중 예외 발생: ' + (e as Error).message);
      setDeleteDialog((prev) => ({ ...prev, submitting: false }));
    }
  };

  // 필터링 및 정렬
  const filteredUsers = users
    .filter(user => {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        user.email?.toLowerCase().includes(query) ||
        user.displayName?.toLowerCase().includes(query) ||
        user.id.toLowerCase().includes(query);

      const matchesPlan = (() => {
        if (filterPlan === 'all') return true;
        if (filterPlan === 'admin') return !!(user.isAdmin || user.isSuperAdmin);
        if (user.isAdmin || user.isSuperAdmin) return false; // 관리자는 다른 카테고리에서 제외
        if (filterPlan === 'partner') return !!user.isPartner;
        if (filterPlan === 'enterprise') return !user.isPartner && user.plan === 'enterprise';
        // general = 일반회원
        return !user.isPartner && user.plan !== 'enterprise';
      })();

      return matchesSearch && matchesPlan;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'date-desc':
          if (!a.createdAt) return 1;
          if (!b.createdAt) return -1;
          return b.createdAt.getTime() - a.createdAt.getTime();
        case 'date-asc':
          if (!a.createdAt) return 1;
          if (!b.createdAt) return -1;
          return a.createdAt.getTime() - b.createdAt.getTime();
        case 'name-asc': {
          const nameA = (a.displayName || a.email || '').toLowerCase();
          const nameB = (b.displayName || b.email || '').toLowerCase();
          return nameA.localeCompare(nameB);
        }
        case 'name-desc': {
          const nameA2 = (a.displayName || a.email || '').toLowerCase();
          const nameB2 = (b.displayName || b.email || '').toLowerCase();
          return nameB2.localeCompare(nameA2);
        }
        case 'projects-desc': {
          const pa = usageStats[a.id]?.projectCount ?? 0;
          const pb = usageStats[b.id]?.projectCount ?? 0;
          return pb - pa;
        }
        case 'designs-desc': {
          const da = usageStats[a.id]?.designFileCount ?? 0;
          const db_ = usageStats[b.id]?.designFileCount ?? 0;
          return db_ - da;
        }
        case 'last-login-desc': {
          const la = a.lastLoginAt?.getTime() ?? 0;
          const lb = b.lastLoginAt?.getTime() ?? 0;
          return lb - la;
        }
        case 'last-activity-desc': {
          const la = usageStats[a.id]?.lastActivityAt ?? 0;
          const lb = usageStats[b.id]?.lastActivityAt ?? 0;
          return lb - la;
        }
        default:
          return 0;
      }
    });

  return (
    <>
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>사용자 관리</h1>
          <p className={styles.subtitle}>
            전체 {users.length}명
            {filteredUsers.length !== users.length && ` · 필터링 ${filteredUsers.length}명`}
          </p>
        </div>
      </div>

      {/* 검색 및 필터 */}
      <div className={styles.toolbar}>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>검색</label>
          <div className={styles.searchBox}>
            <SearchIcon size={20} />
            <input
              type="text"
              placeholder="이메일, 이름, UID로 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
          </div>
        </div>

        <div className={styles.filters}>
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
                  {sortBy === 'date-desc' && '가입일 최신순'}
                  {sortBy === 'date-asc' && '가입일 오래된순'}
                  {sortBy === 'name-asc' && '이름 가나다순'}
                  {sortBy === 'name-desc' && '이름 역순'}
                  {sortBy === 'projects-desc' && `프로젝트 많은순${usageLoading ? ' (로딩...)' : ''}`}
                  {sortBy === 'designs-desc' && `디자인파일 많은순${usageLoading ? ' (로딩...)' : ''}`}
                  {sortBy === 'last-login-desc' && '최근 로그인순'}
                  {sortBy === 'last-activity-desc' && `최근 활동순${usageLoading ? ' (로딩...)' : ''}`}
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
                    가입일 최신순
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
                    가입일 오래된순
                    {sortBy === 'date-asc' && (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                  <button
                    className={`${styles.filterDropdownItem} ${sortBy === 'name-asc' ? styles.filterDropdownItemActive : ''}`}
                    onClick={() => {
                      setSortBy('name-asc');
                      setSortDropdownOpen(false);
                    }}
                  >
                    이름 가나다순
                    {sortBy === 'name-asc' && (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                  <button
                    className={`${styles.filterDropdownItem} ${sortBy === 'name-desc' ? styles.filterDropdownItemActive : ''}`}
                    onClick={() => {
                      setSortBy('name-desc');
                      setSortDropdownOpen(false);
                    }}
                  >
                    이름 역순
                    {sortBy === 'name-desc' && (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>

                  {/* 사용량 기준 정렬 (구분선) */}
                  <div style={{ borderTop: '1px solid var(--theme-border, #e5e7eb)', margin: '4px 0' }} />

                  <button
                    className={`${styles.filterDropdownItem} ${sortBy === 'projects-desc' ? styles.filterDropdownItemActive : ''}`}
                    onClick={() => { setSortBy('projects-desc'); setSortDropdownOpen(false); }}
                  >
                    프로젝트 많은순
                    {sortBy === 'projects-desc' && (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                  <button
                    className={`${styles.filterDropdownItem} ${sortBy === 'designs-desc' ? styles.filterDropdownItemActive : ''}`}
                    onClick={() => { setSortBy('designs-desc'); setSortDropdownOpen(false); }}
                  >
                    디자인파일 많은순
                    {sortBy === 'designs-desc' && (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                  <button
                    className={`${styles.filterDropdownItem} ${sortBy === 'last-login-desc' ? styles.filterDropdownItemActive : ''}`}
                    onClick={() => { setSortBy('last-login-desc'); setSortDropdownOpen(false); }}
                  >
                    최근 로그인순
                    {sortBy === 'last-login-desc' && (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                  <button
                    className={`${styles.filterDropdownItem} ${sortBy === 'last-activity-desc' ? styles.filterDropdownItemActive : ''}`}
                    onClick={() => { setSortBy('last-activity-desc'); setSortDropdownOpen(false); }}
                  >
                    최근 활동순
                    {sortBy === 'last-activity-desc' && (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>

                  <div style={{ borderTop: '1px solid var(--theme-border, #e5e7eb)', margin: '4px 0' }} />
                  <button
                    className={styles.filterDropdownItem}
                    onClick={() => { refreshUsageStats(); setSortDropdownOpen(false); }}
                    style={{ color: 'var(--theme-primary, #667eea)', fontSize: '12px' }}
                  >
                    🔄 사용량 새로고침
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 회원유형 필터 드롭다운 */}
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>회원유형</label>
            <div className={styles.customFilterDropdown}>
              <button
                type="button"
                className={styles.filterButton}
                onClick={() => setPlanFilterDropdownOpen(!planFilterDropdownOpen)}
              >
                <span>
                  {filterPlan === 'all' && '전체'}
                  {filterPlan === 'enterprise' && '기업회원'}
                  {filterPlan === 'partner' && '파트너사'}
                  {filterPlan === 'admin' && '관리자'}
                  {filterPlan === 'general' && '일반회원'}
                </span>
                <svg
                  className={`${styles.dropdownIcon} ${planFilterDropdownOpen ? styles.dropdownIconOpen : ''}`}
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
              {planFilterDropdownOpen && (
                <div className={styles.filterDropdownMenu}>
                  <button
                    className={`${styles.filterDropdownItem} ${filterPlan === 'all' ? styles.filterDropdownItemActive : ''}`}
                    onClick={() => {
                      setFilterPlan('all');
                      setPlanFilterDropdownOpen(false);
                    }}
                  >
                    전체
                    {filterPlan === 'all' && (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                  <button
                    className={`${styles.filterDropdownItem} ${filterPlan === 'enterprise' ? styles.filterDropdownItemActive : ''}`}
                    onClick={() => {
                      setFilterPlan('enterprise');
                      setPlanFilterDropdownOpen(false);
                    }}
                  >
                    기업회원
                    {filterPlan === 'enterprise' && (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                  <button
                    className={`${styles.filterDropdownItem} ${filterPlan === 'partner' ? styles.filterDropdownItemActive : ''}`}
                    onClick={() => {
                      setFilterPlan('partner');
                      setPlanFilterDropdownOpen(false);
                    }}
                  >
                    파트너사
                    {filterPlan === 'partner' && (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                  <button
                    className={`${styles.filterDropdownItem} ${filterPlan === 'admin' ? styles.filterDropdownItemActive : ''}`}
                    onClick={() => {
                      setFilterPlan('admin');
                      setPlanFilterDropdownOpen(false);
                    }}
                  >
                    관리자
                    {filterPlan === 'admin' && (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                  <button
                    className={`${styles.filterDropdownItem} ${filterPlan === 'general' ? styles.filterDropdownItemActive : ''}`}
                    onClick={() => {
                      setFilterPlan('general');
                      setPlanFilterDropdownOpen(false);
                    }}
                  >
                    일반회원
                    {filterPlan === 'general' && (
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

      {/* 메인 컨텐츠 영역 */}
      <div className={styles.mainContent}>
        {/* 사용자 테이블 */}
        <div className={styles.tableContainer}>
        {loading ? (
          <div className={styles.loading}>
            <div className={styles.spinner}></div>
            <p>사용자 목록을 불러오는 중...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className={styles.emptyState}>
            <p>{searchQuery ? '검색 결과가 없습니다.' : '사용자가 없습니다.'}</p>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>사용자</th>
                <th>이메일</th>
                <th>레벨</th>
                <th>플랜</th>
                <th>프로젝트</th>
                <th>디자인</th>
                <th>UID</th>
                <th>가입일</th>
                <th>최근 로그인</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((targetUser) => (
                <tr key={targetUser.id} onClick={() => openUserDetails(targetUser)} className={styles.clickableRow}>
                  <td>
                    <div className={styles.userInfo}>
                      {targetUser.isSuperAdmin ? (
                        <GiImperialCrown className={styles.crownIcon} />
                      ) : targetUser.isAdmin ? (
                        <PiMedal className={styles.medalIcon} />
                      ) : (
                        <FiUser className={styles.userIcon} />
                      )}
                      <div className={styles.avatar}>
                        {targetUser.photoURL ? (
                          <img src={targetUser.photoURL} alt={targetUser.displayName || targetUser.email} />
                        ) : (
                          <div className={styles.avatarPlaceholder}>
                            {(targetUser.displayName || targetUser.email || '?').charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <span className={styles.displayName}>
                        {targetUser.displayName || '이름 없음'}
                      </span>
                    </div>
                  </td>
                  <td>{targetUser.email}</td>
                  <td>
                    <div className={styles.roleBadges}>
                      {targetUser.isSuperAdmin && (
                        <span className={styles.superAdminBadge}>슈퍼관리자</span>
                      )}
                      {targetUser.isAdmin && !targetUser.isSuperAdmin && (
                        <span className={styles.adminBadge}>관리자</span>
                      )}
                      {!targetUser.isAdmin && !targetUser.isSuperAdmin && targetUser.isPartner && (
                        <span style={{
                          display: 'inline-block',
                          padding: '4px 12px',
                          borderRadius: 12,
                          background: '#0ea5e9',
                          color: '#fff',
                          fontSize: 12,
                          fontWeight: 600,
                        }}>파트너사</span>
                      )}
                      {!targetUser.isAdmin && !targetUser.isSuperAdmin && !targetUser.isPartner && targetUser.plan === 'enterprise' && (
                        <span className={styles.enterpriseBadge}>기업회원</span>
                      )}
                      {!targetUser.isAdmin && !targetUser.isSuperAdmin && !targetUser.isPartner && targetUser.plan !== 'enterprise' && (
                        <span className={styles.userBadge}>일반회원</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span
                      className={styles.planBadge}
                      style={{ backgroundColor: PLANS[targetUser.plan || 'free'].color, color: 'white' }}
                    >
                      {PLANS[targetUser.plan || 'free'].name}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>
                    {usageStats[targetUser.id]?.projectCount ?? (Object.keys(usageStats).length === 0 ? '-' : 0)}
                  </td>
                  <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>
                    {usageStats[targetUser.id]?.designFileCount ?? (Object.keys(usageStats).length === 0 ? '-' : 0)}
                  </td>
                  <td>
                    <code className={styles.uid}>{targetUser.id.substring(0, 12)}...</code>
                  </td>
                  <td>
                    {targetUser.createdAt
                      ? targetUser.createdAt.toLocaleDateString('ko-KR')
                      : '-'}
                  </td>
                  <td>
                    {targetUser.lastLoginAt
                      ? targetUser.lastLoginAt.toLocaleString('ko-KR')
                      : '-'}
                  </td>
                  <td>
                    {targetUser.isSuperAdmin ? (
                      <span className={styles.superAdminText}>절대 권한</span>
                    ) : (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          className={styles.changePlanButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            openPlanDialog(
                              targetUser.id,
                              targetUser.displayName || targetUser.email,
                              targetUser.plan || 'free'
                            );
                          }}
                        >
                          플랜 변경
                        </button>
                        <button
                          className={styles.changePlanButton}
                          style={{
                            background: '#ef4444',
                            borderColor: '#ef4444',
                            color: '#fff',
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            openDeleteDialog(
                              targetUser.id,
                              targetUser.email,
                              targetUser.displayName || targetUser.email
                            );
                          }}
                          title="회원 데이터 삭제 (재가입 가능)"
                        >
                          탈퇴 처리
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        </div>
      </div>
    </div>

    {/* 플랜 변경 다이얼로그 */}
    {planDialog.show && (
      <div className={styles.dialogOverlay}>
        <div className={styles.dialog}>
          <h3 className={styles.dialogTitle}>플랜 변경</h3>
          <p className={styles.dialogMessage}>
            <strong>{planDialog.userName}</strong>님의 플랜을 변경합니다.
          </p>

          <div className={styles.planSelector}>
            <div className={styles.currentPlanSection}>
              <span className={styles.sectionLabel}>현재 플랜</span>
              <div className={styles.planCardSmall}>
                <span className={styles.planName}>{PLANS[planDialog.currentPlan].name}</span>
              </div>
            </div>

            <div className={styles.planGridSection}>
              <span className={styles.sectionLabel}>새 플랜 선택</span>
              <div className={styles.planGrid}>
                {(Object.keys(PLANS) as PlanType[]).map((planType) => (
                  <div
                    key={planType}
                    className={`${styles.planCard} ${planDialog.newPlan === planType ? styles.planCardActive : ''}`}
                    onClick={() => setPlanDialog({ ...planDialog, newPlan: planType })}
                  >
                    <div className={styles.planCardHeader}>
                      <span className={styles.planCardName}>{PLANS[planType].name}</span>
                      {planDialog.newPlan === planType && (
                        <svg className={styles.checkIcon} width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    <ul className={styles.planCardFeatures}>
                      {PLANS[planType].features.slice(0, 3).map((feature, index) => (
                        <li key={index}>{feature}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.dialogActions}>
            <button
              className={styles.cancelButton}
              onClick={() => setPlanDialog({ show: false, userId: '', userName: '', currentPlan: 'free', newPlan: 'free' })}
            >
              취소
            </button>
            <button
              className={styles.confirmButton}
              onClick={handlePlanChange}
              disabled={planDialog.currentPlan === planDialog.newPlan}
            >
              변경
            </button>
          </div>
        </div>
      </div>
    )}

    {/* 회원 탈퇴(데이터 삭제) 다이얼로그 */}
    {deleteDialog.show && (
      <div className={styles.dialogOverlay}>
        <div className={styles.dialog}>
          <h3 className={styles.dialogTitle} style={{ color: '#ef4444' }}>
            ⚠️ 회원 탈퇴 처리
          </h3>
          <p className={styles.dialogMessage}>
            <strong>{deleteDialog.userName}</strong> ({deleteDialog.userEmail}) 회원을 탈퇴 처리합니다.
          </p>

          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 8,
              padding: '12px 14px',
              margin: '12px 0',
              fontSize: 13,
              color: '#991b1b',
              lineHeight: 1.6,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6 }}>다음 데이터가 영구 삭제됩니다:</div>
            <div>• userProfiles, users, admins 컬렉션의 사용자 문서</div>
            <div>• 해당 사용자가 소유한 모든 프로젝트(projects)</div>
            <div>• <b>Firebase Auth 계정</b> (동일 이메일로 재가입 가능)</div>
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={{ display: 'block', fontSize: 13, color: '#374151', marginBottom: 6 }}>
              확인을 위해 사용자의 이메일을 정확히 입력하세요:
            </label>
            <input
              type="text"
              value={deleteDialog.confirmInput}
              onChange={(e) =>
                setDeleteDialog((prev) => ({ ...prev, confirmInput: e.target.value }))
              }
              placeholder={deleteDialog.userEmail}
              autoFocus
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: 8,
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div className={styles.dialogActions}>
            <button
              className={styles.cancelButton}
              onClick={() =>
                setDeleteDialog({
                  show: false,
                  userId: '',
                  userEmail: '',
                  userName: '',
                  confirmInput: '',
                  submitting: false,
                })
              }
              disabled={deleteDialog.submitting}
            >
              취소
            </button>
            <button
              className={styles.confirmButton}
              onClick={handleDeleteUser}
              disabled={
                deleteDialog.submitting ||
                deleteDialog.confirmInput.trim().toLowerCase() !==
                  deleteDialog.userEmail.trim().toLowerCase()
              }
              style={{
                background:
                  deleteDialog.confirmInput.trim().toLowerCase() ===
                  deleteDialog.userEmail.trim().toLowerCase()
                    ? '#ef4444'
                    : undefined,
                borderColor:
                  deleteDialog.confirmInput.trim().toLowerCase() ===
                  deleteDialog.userEmail.trim().toLowerCase()
                    ? '#ef4444'
                    : undefined,
              }}
            >
              {deleteDialog.submitting ? '삭제 중...' : '탈퇴 처리'}
            </button>
          </div>
        </div>
      </div>
    )}

    </>
  );
};

export default Users;
