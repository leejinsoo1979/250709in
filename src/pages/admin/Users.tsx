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

        <div className={styles.filters}>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>정렬</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className={styles.filterSelect}
            >
              <option value="date-desc">가입일 최신순</option>
              <option value="date-asc">가입일 오래된순</option>
              <option value="name-asc">이름 가나다순</option>
              <option value="name-desc">이름 역순</option>
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>플랜</label>
            <select
              value={filterPlan}
              onChange={(e) => setFilterPlan(e.target.value as any)}
              className={styles.filterSelect}
            >
              <option value="all">전체</option>
              <option value="free">무료</option>
              <option value="pro">프로</option>
              <option value="enterprise">엔터프라이즈</option>
            </select>
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
                <tr key={targetUser.id}>
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
                      className={`${styles.planBadge} ${(targetUser.plan || 'free') === 'free' ? styles.planBadgeFree : ''}`}
                      style={(targetUser.plan || 'free') !== 'free' ? { backgroundColor: PLANS[targetUser.plan || 'free'].color } : {}}
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
                        onClick={() => openPlanDialog(
                          targetUser.id,
                          targetUser.displayName || targetUser.email,
                          targetUser.plan || 'free'
                        )}
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
    </div>
  );
};

export default Users;
