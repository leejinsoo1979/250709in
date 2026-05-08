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
import { FiUser } from 'react-icons/fi';
import { PiMedal } from 'react-icons/pi';
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

interface Permission {
  id: string;
  label: string;
  description: string;
}

const PERMISSIONS: Permission[] = [
  { id: 'dashboard', label: '대시보드 접근', description: '관리자 대시보드 조회' },
  { id: 'users', label: '사용자 관리', description: '사용자 목록 조회 및 플랜 변경' },
  { id: 'projects', label: '프로젝트 관리', description: '모든 프로젝트 조회 및 관리' },
  { id: 'teams', label: '팀 관리', description: '팀 목록 조회 및 관리' },
  { id: 'shares', label: '공유 관리', description: '공유 링크 및 접근 권한 관리' },
  { id: 'logs', label: '로그 조회', description: '시스템 로그 및 활동 내역 조회' },
  { id: 'notifications', label: '알림 관리', description: '알림 내역 조회 및 관리' }
];

const Admins = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'role' | 'name-asc' | 'name-desc'>('role');
  const [filterRole, setFilterRole] = useState<'all' | 'superadmin' | 'admin' | 'user'>('all');
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [roleFilterDropdownOpen, setRoleFilterDropdownOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    show: boolean;
    userId: string;
    userName: string;
    isGranting: boolean;
  }>({ show: false, userId: '', userName: '', isGranting: false });
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(
    PERMISSIONS.map(p => p.id)
  );

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

        // 모든 사용자를 메모리에 보관 (검색 시 일반 사용자도 찾을 수 있도록)
        // 단, 검색어가 비어있으면 화면에는 관리자/슈퍼관리자만 노출 (filteredUsers 에서 처리)
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
            isSuperAdmin: isSuperAdmin(userEmail),
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

  // 권한 토글
  const togglePermission = (permissionId: string) => {
    setSelectedPermissions(prev =>
      prev.includes(permissionId)
        ? prev.filter(id => id !== permissionId)
        : [...prev, permissionId]
    );
  };

  // 권한 부여 확인 다이얼로그 열기
  const openGrantDialog = (userId: string, userName: string) => {
    setSelectedPermissions(PERMISSIONS.map(p => p.id)); // 모든 권한 선택으로 초기화
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

  // Click outside 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (sortDropdownOpen && !target.closest(`.${styles.customFilterDropdown}`)) {
        setSortDropdownOpen(false);
      }
      if (roleFilterDropdownOpen && !target.closest(`.${styles.customFilterDropdown}`)) {
        setRoleFilterDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [sortDropdownOpen, roleFilterDropdownOpen]);

  const filteredUsers = users
    .filter(user => {
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch = !query ||
        user.email?.toLowerCase().includes(query) ||
        user.displayName?.toLowerCase().includes(query) ||
        user.id.toLowerCase().includes(query);

      const matchesRole =
        filterRole === 'all' ||
        (filterRole === 'superadmin' && user.isSuperAdmin) ||
        (filterRole === 'admin' && user.isAdmin && !user.isSuperAdmin) ||
        (filterRole === 'user' && !user.isAdmin && !user.isSuperAdmin);

      return matchesSearch && matchesRole;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'role':
          if (a.isSuperAdmin !== b.isSuperAdmin) return a.isSuperAdmin ? -1 : 1;
          if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
          return (a.displayName || a.email).localeCompare(b.displayName || b.email);
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

  // 통계
  const stats = {
    total: users.length,
    superAdmins: users.filter(u => u.isSuperAdmin).length,
    admins: users.filter(u => u.isAdmin && !u.isSuperAdmin).length,
    regularUsers: users.filter(u => !u.isAdmin && !u.isSuperAdmin).length,
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
                  {sortBy === 'role' && '권한별'}
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
                    className={`${styles.filterDropdownItem} ${sortBy === 'role' ? styles.filterDropdownItemActive : ''}`}
                    onClick={() => {
                      setSortBy('role');
                      setSortDropdownOpen(false);
                    }}
                  >
                    권한별
                    {sortBy === 'role' && (
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

          {/* 권한 필터 드롭다운 */}
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>권한</label>
            <div className={styles.customFilterDropdown}>
              <button
                type="button"
                className={styles.filterButton}
                onClick={() => setRoleFilterDropdownOpen(!roleFilterDropdownOpen)}
              >
                <span>
                  {filterRole === 'all' && '전체'}
                  {filterRole === 'superadmin' && '슈퍼 관리자'}
                  {filterRole === 'admin' && '관리자'}
                  {filterRole === 'user' && '일반 사용자'}
                </span>
                <svg
                  className={`${styles.dropdownIcon} ${roleFilterDropdownOpen ? styles.dropdownIconOpen : ''}`}
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
              {roleFilterDropdownOpen && (
                <div className={styles.filterDropdownMenu}>
                  <button
                    className={`${styles.filterDropdownItem} ${filterRole === 'all' ? styles.filterDropdownItemActive : ''}`}
                    onClick={() => {
                      setFilterRole('all');
                      setRoleFilterDropdownOpen(false);
                    }}
                  >
                    전체
                    {filterRole === 'all' && (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                  <button
                    className={`${styles.filterDropdownItem} ${filterRole === 'superadmin' ? styles.filterDropdownItemActive : ''}`}
                    onClick={() => {
                      setFilterRole('superadmin');
                      setRoleFilterDropdownOpen(false);
                    }}
                  >
                    슈퍼 관리자
                    {filterRole === 'superadmin' && (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                  <button
                    className={`${styles.filterDropdownItem} ${filterRole === 'admin' ? styles.filterDropdownItemActive : ''}`}
                    onClick={() => {
                      setFilterRole('admin');
                      setRoleFilterDropdownOpen(false);
                    }}
                  >
                    관리자
                    {filterRole === 'admin' && (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                  <button
                    className={`${styles.filterDropdownItem} ${filterRole === 'user' ? styles.filterDropdownItemActive : ''}`}
                    onClick={() => {
                      setFilterRole('user');
                      setRoleFilterDropdownOpen(false);
                    }}
                  >
                    일반 사용자
                    {filterRole === 'user' && (
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
                      ) : targetUser.isAdmin ? (
                        <PiMedal className={styles.medalIcon} />
                      ) : (
                        <FiUser className={styles.userIcon} />
                      )}
                      <div className={styles.avatar}>
                        {targetUser.photoURL ? (
                          <img
                            src={targetUser.photoURL}
                            alt={targetUser.displayName || targetUser.email}
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              // 이미지 로드 실패 시 placeholder 로 폴백
                              const img = e.currentTarget;
                              img.style.display = 'none';
                              const fb = img.nextElementSibling as HTMLElement | null;
                              if (fb) fb.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <div
                          className={styles.avatarPlaceholder}
                          style={{ display: targetUser.photoURL ? 'none' : 'flex' }}
                        >
                          {(targetUser.displayName || targetUser.email || '?').charAt(0).toUpperCase()}
                        </div>
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

            {confirmDialog.isGranting && (
              <div className={styles.permissionsBox}>
                <p className={styles.permissionsTitle}>부여할 권한 선택</p>
                <div className={styles.permissionsList}>
                  {PERMISSIONS.map(permission => (
                    <label key={permission.id} className={styles.permissionItem}>
                      <input
                        type="checkbox"
                        checked={selectedPermissions.includes(permission.id)}
                        onChange={() => togglePermission(permission.id)}
                        className={styles.permissionCheckbox}
                      />
                      <div className={styles.permissionInfo}>
                        <span className={styles.permissionLabel}>{permission.label}</span>
                        <span className={styles.permissionDescription}>{permission.description}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

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
