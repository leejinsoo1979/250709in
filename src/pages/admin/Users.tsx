import { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, getDocs, onSnapshot, DocumentData } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { SearchIcon } from '@/components/common/Icons';
import styles from './Users.module.css';

interface UserData {
  id: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  createdAt?: Date;
  lastLoginAt?: Date;
}

const Users = () => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    // Firebase users 컬렉션 실시간 구독
    const usersQuery = query(
      collection(db, 'users'),
      orderBy('createdAt', 'desc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
      const usersData: UserData[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data() as DocumentData;
        usersData.push({
          id: doc.id,
          email: data.email || '',
          displayName: data.displayName || data.name || '',
          photoURL: data.photoURL || '',
          createdAt: data.createdAt?.toDate?.() || null,
          lastLoginAt: data.lastLoginAt?.toDate?.() || null
        });
      });
      setUsers(usersData);
      setLoading(false);
    }, (error) => {
      console.error('사용자 데이터 가져오기 오류:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

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
                <th>UID</th>
                <th>가입일</th>
                <th>최근 로그인</th>
                <th>작업</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className={styles.userInfo}>
                      <div className={styles.avatar}>
                        {user.photoURL ? (
                          <img src={user.photoURL} alt={user.displayName || user.email} />
                        ) : (
                          <div className={styles.avatarPlaceholder}>
                            {(user.displayName || user.email || '?').charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <span className={styles.displayName}>
                        {user.displayName || '이름 없음'}
                      </span>
                    </div>
                  </td>
                  <td>{user.email}</td>
                  <td>
                    <code className={styles.uid}>{user.id.substring(0, 12)}...</code>
                  </td>
                  <td>
                    {user.createdAt
                      ? user.createdAt.toLocaleDateString('ko-KR')
                      : '-'}
                  </td>
                  <td>
                    {user.lastLoginAt
                      ? user.lastLoginAt.toLocaleString('ko-KR')
                      : '-'}
                  </td>
                  <td>
                    <button className={styles.actionButton}>상세</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default Users;
