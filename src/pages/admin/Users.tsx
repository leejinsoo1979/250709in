import { useEffect, useState } from 'react';
import { collection, query, getDocs, DocumentData } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useAuth } from '@/auth/AuthProvider';
import { SearchIcon } from '@/components/common/Icons';
import { getAllAdmins, isSuperAdmin } from '@/firebase/admins';
import { updateUserPlan, PLANS, PlanType } from '@/firebase/plans';
import { GiImperialCrown } from 'react-icons/gi';
import { FaUser } from 'react-icons/fa';
import { PiMedal } from 'react-icons/pi';
import { HiOutlineFolder, HiOutlineCube, HiOutlineLink, HiOutlineEye, HiOutlineClock } from 'react-icons/hi';
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
  plan?: PlanType;
}

const Users = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'name-asc' | 'name-desc'>('date-desc');
  const [filterPlan, setFilterPlan] = useState<PlanType | 'all'>('all');
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [planFilterDropdownOpen, setPlanFilterDropdownOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [userDetailsLoading, setUserDetailsLoading] = useState(false);
  const [userProjects, setUserProjects] = useState<any[]>([]);
  const [userDesignFiles, setUserDesignFiles] = useState<any[]>([]);
  const [userShareLinks, setUserShareLinks] = useState<any[]>([]);
  const [userSharedAccess, setUserSharedAccess] = useState<any[]>([]);
  const [userAccessLogs, setUserAccessLogs] = useState<any[]>([]);
  const [planDialog, setPlanDialog] = useState<{
    show: boolean;
    userId: string;
    userName: string;
    currentPlan: PlanType;
    newPlan: PlanType;
  }>({ show: false, userId: '', userName: '', currentPlan: 'free', newPlan: 'free' });

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

  // 사용자 상세 정보 조회
  const openUserDetails = async (user: UserData) => {
    setSelectedUser(user);
    setUserDetailsLoading(true);

    try {
      // 사용자의 프로젝트 조회
      const projectsQuery = query(collection(db, 'projects'));
      const projectsSnapshot = await getDocs(projectsQuery);
      const userProjectsList = projectsSnapshot.docs
        .filter(doc => doc.data().userId === user.id)
        .map(doc => ({
          id: doc.id,
          title: doc.data().title || doc.data().projectName || '제목 없음',
          createdAt: doc.data().createdAt?.toDate?.() || null,
          updatedAt: doc.data().updatedAt?.toDate?.() || null
        }));

      setUserProjects(userProjectsList);

      // 사용자의 디자인 파일 조회
      const designFilesQuery = query(collection(db, 'designFiles'));
      const designFilesSnapshot = await getDocs(designFilesQuery);
      const userFilesList = designFilesSnapshot.docs
        .filter(doc => doc.data().userId === user.id)
        .map(doc => ({
          id: doc.id,
          fileName: doc.data().fileName || '파일명 없음',
          projectId: doc.data().projectId || '',
          createdAt: doc.data().createdAt?.toDate?.() || null,
          fileSize: doc.data().fileSize || 0
        }));

      setUserDesignFiles(userFilesList);

      // 사용자가 생성한 공유 링크 조회
      const shareLinksQuery = query(collection(db, 'shareLinks'));
      const shareLinksSnapshot = await getDocs(shareLinksQuery);
      const userShareLinksList = shareLinksSnapshot.docs
        .filter(doc => doc.data().createdBy === user.id)
        .map(doc => ({
          id: doc.id,
          projectId: doc.data().projectId || '',
          token: doc.data().token || '',
          createdAt: doc.data().createdAt?.toDate?.() || null,
          expiresAt: doc.data().expiresAt?.toDate?.() || null,
          viewCount: doc.data().viewCount || 0,
          isActive: doc.data().isActive !== false
        }));

      setUserShareLinks(userShareLinksList);

      // 사용자가 접근 권한을 받은 프로젝트 조회
      const sharedAccessQuery = query(collection(db, 'sharedProjectAccess'));
      const sharedAccessSnapshot = await getDocs(sharedAccessQuery);
      const userSharedAccessList = sharedAccessSnapshot.docs
        .filter(doc => doc.data().userId === user.id)
        .map(doc => ({
          id: doc.id,
          projectId: doc.data().projectId || '',
          permission: doc.data().permission || 'viewer',
          sharedAt: doc.data().sharedAt?.toDate?.() || null,
          sharedBy: doc.data().sharedBy || ''
        }));

      setUserSharedAccess(userSharedAccessList);

      // 사용자의 공유 링크 접근 로그 조회
      const accessLogsQuery = query(collection(db, 'shareLinkAccessLog'));
      const accessLogsSnapshot = await getDocs(accessLogsQuery);
      const userAccessLogsList = accessLogsSnapshot.docs
        .filter(doc => doc.data().userId === user.id)
        .map(doc => ({
          id: doc.id,
          shareLinkId: doc.data().shareLinkId || '',
          accessedAt: doc.data().accessedAt?.toDate?.() || null,
          ipAddress: doc.data().ipAddress || '',
          userAgent: doc.data().userAgent || ''
        }))
        .sort((a, b) => {
          if (!a.accessedAt) return 1;
          if (!b.accessedAt) return -1;
          return b.accessedAt.getTime() - a.accessedAt.getTime();
        });

      setUserAccessLogs(userAccessLogsList);
    } catch (error) {
      console.error('❌ 사용자 상세 정보 조회 실패:', error);
    } finally {
      setUserDetailsLoading(false);
    }
  };

  // 사용자 상세 정보 닫기
  const closeUserDetails = () => {
    setSelectedUser(null);
    setUserProjects([]);
    setUserDesignFiles([]);
    setUserShareLinks([]);
    setUserSharedAccess([]);
    setUserAccessLogs([]);
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

  // 필터링 및 정렬
  const filteredUsers = users
    .filter(user => {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        user.email?.toLowerCase().includes(query) ||
        user.displayName?.toLowerCase().includes(query) ||
        user.id.toLowerCase().includes(query);

      const matchesPlan = filterPlan === 'all' || user.plan === filterPlan;

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
        case 'name-asc':
          const nameA = (a.displayName || a.email || '').toLowerCase();
          const nameB = (b.displayName || b.email || '').toLowerCase();
          return nameA.localeCompare(nameB);
        case 'name-desc':
          const nameA2 = (a.displayName || a.email || '').toLowerCase();
          const nameB2 = (b.displayName || b.email || '').toLowerCase();
          return nameB2.localeCompare(nameA2);
        default:
          return 0;
      }
    });

  return (
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
                </div>
              )}
            </div>
          </div>

          {/* 플랜 필터 드롭다운 */}
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>플랜</label>
            <div className={styles.customFilterDropdown}>
              <button
                type="button"
                className={styles.filterButton}
                onClick={() => setPlanFilterDropdownOpen(!planFilterDropdownOpen)}
              >
                <span>
                  {filterPlan === 'all' && '전체'}
                  {filterPlan === 'free' && '무료'}
                  {filterPlan === 'pro' && '프로'}
                  {filterPlan === 'enterprise' && '엔터프라이즈'}
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
                    className={`${styles.filterDropdownItem} ${filterPlan === 'free' ? styles.filterDropdownItemActive : ''}`}
                    onClick={() => {
                      setFilterPlan('free');
                      setPlanFilterDropdownOpen(false);
                    }}
                  >
                    무료
                    {filterPlan === 'free' && (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                  <button
                    className={`${styles.filterDropdownItem} ${filterPlan === 'pro' ? styles.filterDropdownItemActive : ''}`}
                    onClick={() => {
                      setFilterPlan('pro');
                      setPlanFilterDropdownOpen(false);
                    }}
                  >
                    프로
                    {filterPlan === 'pro' && (
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
                    엔터프라이즈
                    {filterPlan === 'enterprise' && (
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
                <th>권한</th>
                <th>플랜</th>
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
                        <FaUser className={styles.userIcon} />
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
                        <span className={styles.superAdminBadge}>슈퍼 관리자</span>
                      )}
                      {targetUser.isAdmin && !targetUser.isSuperAdmin && (
                        <span className={styles.adminBadge}>관리자</span>
                      )}
                      {!targetUser.isAdmin && !targetUser.isSuperAdmin && (
                        <span className={styles.userBadge}>일반 사용자</span>
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
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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

      {/* 사용자 상세 정보 */}
      {selectedUser && (
        <div className={styles.userDetailsSection}>
          <div className={styles.userDetailsHeader}>
            <div className={styles.userDetailsTitle}>
              <div className={styles.userDetailsAvatar}>
                {selectedUser.photoURL ? (
                  <img src={selectedUser.photoURL} alt={selectedUser.displayName || selectedUser.email} />
                ) : (
                  <div className={styles.userDetailsAvatarPlaceholder}>
                    {(selectedUser.displayName || selectedUser.email || '?').charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div>
                <h2>{selectedUser.displayName || '이름 없음'}</h2>
                <p>{selectedUser.email}</p>
              </div>
            </div>
            <button className={styles.closeButton} onClick={closeUserDetails}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className={styles.userDetailsContent}>
              {/* 기본 정보 */}
              <div className={styles.detailsBlock}>
                <h3 className={styles.userDetailsSectionTitle}>기본 정보</h3>
                <div className={styles.userDetailsGrid}>
                  <div className={styles.userDetailsItem}>
                    <span className={styles.userDetailsLabel}>UID</span>
                    <code className={styles.userDetailsValue}>{selectedUser.id}</code>
                  </div>
                  <div className={styles.userDetailsItem}>
                    <span className={styles.userDetailsLabel}>플랜</span>
                    <span
                      className={styles.planBadge}
                      style={{ backgroundColor: PLANS[selectedUser.plan || 'free'].color, color: 'white' }}
                    >
                      {PLANS[selectedUser.plan || 'free'].name}
                    </span>
                  </div>
                  <div className={styles.userDetailsItem}>
                    <span className={styles.userDetailsLabel}>가입일</span>
                    <span className={styles.userDetailsValue}>
                      {selectedUser.createdAt?.toLocaleString('ko-KR') || '-'}
                    </span>
                  </div>
                  <div className={styles.userDetailsItem}>
                    <span className={styles.userDetailsLabel}>최근 로그인</span>
                    <span className={styles.userDetailsValue}>
                      {selectedUser.lastLoginAt?.toLocaleString('ko-KR') || '-'}
                    </span>
                  </div>
                </div>
              </div>

              {/* 프로젝트 */}
              <div className={styles.detailsBlock}>
                <h3 className={styles.userDetailsSectionTitle}>
                  프로젝트 ({userProjects.length})
                </h3>
                {userDetailsLoading ? (
                  <div className={styles.userDetailsLoading}>로딩 중...</div>
                ) : userProjects.length === 0 ? (
                  <div className={styles.userDetailsEmpty}>프로젝트가 없습니다</div>
                ) : (
                  <div className={styles.userDetailsList}>
                    {userProjects.map(project => (
                      <div key={project.id} className={styles.userDetailsListItem}>
                        <div className={styles.userDetailsListItemIcon}>
                          <HiOutlineFolder size={20} />
                        </div>
                        <div className={styles.userDetailsListItemContent}>
                          <span className={styles.userDetailsListItemTitle}>{project.title}</span>
                          <span className={styles.userDetailsListItemMeta}>
                            생성: {project.createdAt?.toLocaleDateString('ko-KR') || '-'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 디자인 파일 */}
              <div className={styles.detailsBlock}>
                <h3 className={styles.userDetailsSectionTitle}>
                  디자인 파일 ({userDesignFiles.length})
                </h3>
                {userDetailsLoading ? (
                  <div className={styles.userDetailsLoading}>로딩 중...</div>
                ) : userDesignFiles.length === 0 ? (
                  <div className={styles.userDetailsEmpty}>디자인 파일이 없습니다</div>
                ) : (
                  <div className={styles.userDetailsList}>
                    {userDesignFiles.slice(0, 10).map(file => (
                      <div key={file.id} className={styles.userDetailsListItem}>
                        <div className={styles.userDetailsListItemIcon}>
                          <HiOutlineCube size={20} />
                        </div>
                        <div className={styles.userDetailsListItemContent}>
                          <span className={styles.userDetailsListItemTitle}>{file.fileName}</span>
                          <span className={styles.userDetailsListItemMeta}>
                            {(file.fileSize / 1024).toFixed(1)} KB · {file.createdAt?.toLocaleDateString('ko-KR') || '-'}
                          </span>
                        </div>
                      </div>
                    ))}
                    {userDesignFiles.length > 10 && (
                      <div className={styles.userDetailsMoreInfo}>
                        +{userDesignFiles.length - 10}개 더 보기
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 생성한 공유 링크 */}
              <div className={styles.detailsBlock}>
                <h3 className={styles.userDetailsSectionTitle}>
                  생성한 공유 링크 ({userShareLinks.length})
                </h3>
                {userDetailsLoading ? (
                  <div className={styles.userDetailsLoading}>로딩 중...</div>
                ) : userShareLinks.length === 0 ? (
                  <div className={styles.userDetailsEmpty}>생성한 공유 링크가 없습니다</div>
                ) : (
                  <div className={styles.userDetailsList}>
                    {userShareLinks.slice(0, 5).map(link => (
                      <div key={link.id} className={styles.userDetailsListItem}>
                        <div className={styles.userDetailsListItemIcon}>
                          <HiOutlineLink size={20} />
                        </div>
                        <div className={styles.userDetailsListItemContent}>
                          <span className={styles.userDetailsListItemTitle}>
                            <code>{link.token.slice(0, 20)}...</code>
                          </span>
                          <span className={styles.userDetailsListItemMeta}>
                            <HiOutlineEye size={14} /> {link.viewCount} 조회 ·
                            {link.isActive ? ' 활성' : ' 비활성'} ·
                            생성: {link.createdAt?.toLocaleDateString('ko-KR') || '-'}
                          </span>
                        </div>
                      </div>
                    ))}
                    {userShareLinks.length > 5 && (
                      <div className={styles.userDetailsMoreInfo}>
                        +{userShareLinks.length - 5}개 더 보기
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 접근 권한 받은 프로젝트 */}
              <div className={styles.detailsBlock}>
                <h3 className={styles.userDetailsSectionTitle}>
                  접근 권한 받은 프로젝트 ({userSharedAccess.length})
                </h3>
                {userDetailsLoading ? (
                  <div className={styles.userDetailsLoading}>로딩 중...</div>
                ) : userSharedAccess.length === 0 ? (
                  <div className={styles.userDetailsEmpty}>접근 권한이 없습니다</div>
                ) : (
                  <div className={styles.userDetailsList}>
                    {userSharedAccess.slice(0, 5).map(access => (
                      <div key={access.id} className={styles.userDetailsListItem}>
                        <div className={styles.userDetailsListItemIcon}>
                          <HiOutlineFolder size={20} />
                        </div>
                        <div className={styles.userDetailsListItemContent}>
                          <span className={styles.userDetailsListItemTitle}>
                            프로젝트 ID: {access.projectId.slice(0, 12)}...
                          </span>
                          <span className={styles.userDetailsListItemMeta}>
                            권한: {access.permission === 'owner' ? '소유자' : access.permission === 'editor' ? '편집자' : '뷰어'} ·
                            공유일: {access.sharedAt?.toLocaleDateString('ko-KR') || '-'}
                          </span>
                        </div>
                      </div>
                    ))}
                    {userSharedAccess.length > 5 && (
                      <div className={styles.userDetailsMoreInfo}>
                        +{userSharedAccess.length - 5}개 더 보기
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 최근 접근 로그 */}
              <div className={styles.detailsBlock}>
                <h3 className={styles.userDetailsSectionTitle}>
                  최근 접근 로그 ({userAccessLogs.length})
                </h3>
                {userDetailsLoading ? (
                  <div className={styles.userDetailsLoading}>로딩 중...</div>
                ) : userAccessLogs.length === 0 ? (
                  <div className={styles.userDetailsEmpty}>접근 로그가 없습니다</div>
                ) : (
                  <div className={styles.userDetailsList}>
                    {userAccessLogs.slice(0, 10).map(log => (
                      <div key={log.id} className={styles.userDetailsListItem}>
                        <div className={styles.userDetailsListItemIcon}>
                          <HiOutlineClock size={20} />
                        </div>
                        <div className={styles.userDetailsListItemContent}>
                          <span className={styles.userDetailsListItemTitle}>
                            링크 ID: {log.shareLinkId.slice(0, 12)}...
                          </span>
                          <span className={styles.userDetailsListItemMeta}>
                            IP: {log.ipAddress || '알 수 없음'} ·
                            {log.accessedAt?.toLocaleString('ko-KR') || '-'}
                          </span>
                        </div>
                      </div>
                    ))}
                    {userAccessLogs.length > 10 && (
                      <div className={styles.userDetailsMoreInfo}>
                        +{userAccessLogs.length - 10}개 더 보기
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 활동 통계 */}
              <div className={styles.detailsBlock}>
                <h3 className={styles.userDetailsSectionTitle}>활동 통계</h3>
                <div className={styles.userDetailsGrid}>
                  <div className={styles.userDetailsItem}>
                    <span className={styles.userDetailsLabel}>총 프로젝트</span>
                    <span className={styles.userDetailsValue}>{userProjects.length}개</span>
                  </div>
                  <div className={styles.userDetailsItem}>
                    <span className={styles.userDetailsLabel}>총 디자인 파일</span>
                    <span className={styles.userDetailsValue}>{userDesignFiles.length}개</span>
                  </div>
                  <div className={styles.userDetailsItem}>
                    <span className={styles.userDetailsLabel}>생성한 공유 링크</span>
                    <span className={styles.userDetailsValue}>{userShareLinks.length}개</span>
                  </div>
                  <div className={styles.userDetailsItem}>
                    <span className={styles.userDetailsLabel}>접근 권한</span>
                    <span className={styles.userDetailsValue}>{userSharedAccess.length}개</span>
                  </div>
                  <div className={styles.userDetailsItem}>
                    <span className={styles.userDetailsLabel}>총 접근 로그</span>
                    <span className={styles.userDetailsValue}>{userAccessLogs.length}회</span>
                  </div>
                  <div className={styles.userDetailsItem}>
                    <span className={styles.userDetailsLabel}>총 조회수</span>
                    <span className={styles.userDetailsValue}>
                      {userShareLinks.reduce((sum, link) => sum + link.viewCount, 0)}회
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;
