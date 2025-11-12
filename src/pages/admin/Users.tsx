import { useEffect, useState } from 'react';
import { collection, query, getDocs, DocumentData } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useAuth } from '@/auth/AuthProvider';
import { SearchIcon } from '@/components/common/Icons';
import { getAllAdmins, isSuperAdmin } from '@/firebase/admins';
import { updateUserPlan, PLANS, PlanType } from '@/firebase/plans';
import { GiImperialCrown } from 'react-icons/gi';
import { FaUser } from 'react-icons/fa';
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

  const filteredUsers = users.filter(user => {
    const query = searchQuery.toLowerCase();
    return (
      user.email?.toLowerCase().includes(query) ||
      user.displayName?.toLowerCase().includes(query) ||
      user.id.toLowerCase().includes(query)
    );
  });

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>사용자 관리</h1>
          <p className={styles.subtitle}>전체 {users.length}명의 사용자</p>
        </div>
      </div>

      {/* 검색 */}
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
                      ) : !targetUser.isAdmin ? (
                        <FaUser className={styles.userIcon} />
                      ) : (
                        <span className={styles.iconPlaceholder} />
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
                      style={{ backgroundColor: PLANS[targetUser.plan || 'free'].color }}
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
              <label className={styles.planLabel}>현재 플랜</label>
              <div className={styles.currentPlan}>
                <span
                  className={styles.planBadge}
                  style={{ backgroundColor: PLANS[planDialog.currentPlan].color }}
                >
                  {PLANS[planDialog.currentPlan].name}
                </span>
              </div>

              <label className={styles.planLabel}>새 플랜</label>
              <select
                className={styles.planSelect}
                value={planDialog.newPlan}
                onChange={(e) => setPlanDialog({ ...planDialog, newPlan: e.target.value as PlanType })}
              >
                {(Object.keys(PLANS) as PlanType[]).map((planType) => (
                  <option key={planType} value={planType}>
                    {PLANS[planType].name}
                  </option>
                ))}
              </select>

              {/* 선택된 플랜 정보 */}
              <div className={styles.planInfo}>
                <h4 className={styles.planInfoTitle}>
                  {PLANS[planDialog.newPlan].name} 플랜
                </h4>
                <ul className={styles.planFeatures}>
                  {PLANS[planDialog.newPlan].features.map((feature, index) => (
                    <li key={index}>✓ {feature}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className={styles.dialogActions}>
              <button
                className={styles.cancelButton}
                onClick={() =>
                  setPlanDialog({ show: false, userId: '', userName: '', currentPlan: 'free', newPlan: 'free' })
                }
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
