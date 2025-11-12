import { useEffect, useState } from 'react';
import { collection, query, getDocs, DocumentData } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { useAuth } from '@/auth/AuthProvider';
import { SearchIcon } from '@/components/common/Icons';
import {
  getAllAdmins,
  grantAdminRole,
  revokeAdminRole,
  isSuperAdmin
} from '@/firebase/admins';
import { GiImperialCrown } from 'react-icons/gi';
import { FaUser } from 'react-icons/fa';
import styles from './Admins.module.css';

interface UserData {
  id: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  createdAt?: Date;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
}

const Admins = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{
    show: boolean;
    userId: string;
    userName: string;
    isGranting: boolean;
  }>({ show: false, userId: '', userName: '', isGranting: false });

  const currentUserIsSuperAdmin = isSuperAdmin(user?.email);

  // 슈퍼 관리자가 아니면 접근 불가
  if (!currentUserIsSuperAdmin) {
    return (
      <div className={styles.container}>
        <div className={styles.accessDenied}>
          <h2>접근 권한 없음</h2>
          <p>슈퍼 관리자만 이 페이지에 접근할 수 있습니다.</p>
        </div>
      </div>
    );
  }

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
            isAdmin: adminsMap.has(doc.id),
            isSuperAdmin: isSuperAdmin(userEmail)
          });
        });

        // 클라이언트에서 정렬 (권한별 정렬: 슈퍼 관리자 > 관리자 > 일반 사용자)
        usersData.sort((a, b) => {
          if (a.isSuperAdmin !== b.isSuperAdmin) {
            return a.isSuperAdmin ? -1 : 1;
          }
          if (a.isAdmin !== b.isAdmin) {
            return a.isAdmin ? -1 : 1;
          }
          return (a.displayName || a.email).localeCompare(b.displayName || b.email);
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

  // 권한 부여 확인 다이얼로그 열기
  const openGrantDialog = (userId: string, userName: string) => {
    setConfirmDialog({
      show: true,
      userId,
      userName,
      isGranting: true
    });
  };

  // 권한 해제 확인 다이얼로그 열기
  const openRevokeDialog = (userId: string, userName: string) => {
    setConfirmDialog({
      show: true,
      userId,
      userName,
      isGranting: false
    });
  };

  // 권한 부여/해제 실행
  const handleConfirm = async () => {
    const { userId, isGranting } = confirmDialog;

    try {
      if (isGranting) {
        const targetUser = users.find(u => u.id === userId);
        if (!targetUser) return;

        await grantAdminRole(
          userId,
          { email: targetUser.email, displayName: targetUser.displayName || '' },
          user?.uid || ''
        );
        alert('✅ 관리자 권한이 부여되었습니다.');
      } else {
        await revokeAdminRole(userId);
        alert('✅ 관리자 권한이 해제되었습니다.');
      }

      // 사용자 목록 새로고침
      const adminsMap = await getAllAdmins();
      setUsers(prevUsers =>
        prevUsers.map(u =>
          u.id === userId
            ? { ...u, isAdmin: adminsMap.has(userId) }
            : u
        ).sort((a, b) => {
          if (a.isSuperAdmin !== b.isSuperAdmin) return a.isSuperAdmin ? -1 : 1;
          if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
          return (a.displayName || a.email).localeCompare(b.displayName || b.email);
        })
      );
    } catch (error) {
      alert('❌ 작업 실패: ' + (error as Error).message);
    } finally {
      setConfirmDialog({ show: false, userId: '', userName: '', isGranting: false });
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

  // 통계
  const stats = {
    total: users.length,
    superAdmins: users.filter(u => u.isSuperAdmin).length,
    admins: users.filter(u => u.isAdmin && !u.isSuperAdmin).length,
    regularUsers: users.filter(u => !u.isAdmin && !u.isSuperAdmin).length
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>관리자 권한 관리</h1>
          <p className={styles.subtitle}>
            슈퍼 관리자 {stats.superAdmins}명 · 관리자 {stats.admins}명 · 일반 사용자 {stats.regularUsers}명
          </p>
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
                <th>현재 권한</th>
                <th>UID</th>
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
                    <code className={styles.uid}>{targetUser.id.substring(0, 12)}...</code>
                  </td>
                  <td>
                    {targetUser.isSuperAdmin ? (
                      <span className={styles.superAdminText}>절대 권한</span>
                    ) : targetUser.isAdmin ? (
                      <button
                        className={styles.revokeButton}
                        onClick={() => openRevokeDialog(targetUser.id, targetUser.displayName || targetUser.email)}
                      >
                        권한 해제
                      </button>
                    ) : (
                      <button
                        className={styles.grantButton}
                        onClick={() => openGrantDialog(targetUser.id, targetUser.displayName || targetUser.email)}
                      >
                        관리자 지정
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 권한 변경 확인 다이얼로그 */}
      {confirmDialog.show && (
        <div className={styles.dialogOverlay}>
          <div className={styles.dialog}>
            <h3 className={styles.dialogTitle}>
              {confirmDialog.isGranting ? '관리자 권한 부여' : '관리자 권한 해제'}
            </h3>
            <p className={styles.dialogMessage}>
              <strong>{confirmDialog.userName}</strong>님에게{' '}
              {confirmDialog.isGranting
                ? '관리자 권한을 부여하시겠습니까?'
                : '관리자 권한을 해제하시겠습니까?'}
            </p>
            <div className={styles.dialogActions}>
              <button
                className={styles.cancelButton}
                onClick={() =>
                  setConfirmDialog({ show: false, userId: '', userName: '', isGranting: false })
                }
              >
                취소
              </button>
              <button
                className={
                  confirmDialog.isGranting ? styles.confirmButton : styles.confirmRevokeButton
                }
                onClick={handleConfirm}
              >
                {confirmDialog.isGranting ? '권한 부여' : '권한 해제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Admins;
