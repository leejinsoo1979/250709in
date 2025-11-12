import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { collection, query, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { HiOutlineShare, HiOutlineLink, HiOutlineUsers, HiOutlineEye } from 'react-icons/hi';
import styles from './Shares.module.css';

interface ShareLink {
  id: string;
  projectId: string;
  projectName?: string;
  token: string;
  createdBy: string;
  createdByEmail?: string;
  createdAt: Date | null;
  expiresAt: Date | null;
  viewCount: number;
  isActive: boolean;
  accessCount: number;
}

interface SharedAccess {
  id: string;
  projectId: string;
  projectName?: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  sharedBy: string;
  sharedByEmail?: string;
  permission: string;
  sharedAt: Date | null;
  lastAccessedAt: Date | null;
}

const Shares = () => {
  const { user } = useAuth();
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [sharedAccesses, setSharedAccesses] = useState<SharedAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTab, setSelectedTab] = useState<'links' | 'access'>('links');

  // 공유 링크 및 공유 접근 권한 가져오기
  useEffect(() => {
    if (!user) {
      console.log('🔗 Shares: user 없음');
      return;
    }

    const fetchShareData = async () => {
      try {
        setLoading(true);
        console.log('🔗 공유 데이터 조회 중...');

        // ShareLinks 조회
        const shareLinksQuery = query(collection(db, 'shareLinks'));
        const shareLinksSnapshot = await getDocs(shareLinksQuery);

        console.log('🔗 공유 링크 개수:', shareLinksSnapshot.size);

        const linksData: ShareLink[] = [];
        for (const linkDoc of shareLinksSnapshot.docs) {
          const data = linkDoc.data();

          // 프로젝트 정보 조회
          let projectName = '';
          if (data.projectId) {
            const projectDoc = await getDoc(doc(db, 'projects', data.projectId)).catch(() => null);
            if (projectDoc?.exists()) {
              projectName = projectDoc.data()?.projectName || '';
            }
          }

          // 생성자 정보 조회
          let createdByEmail = '';
          if (data.createdBy) {
            const userDoc = await getDoc(doc(db, 'users', data.createdBy)).catch(() => null);
            if (userDoc?.exists()) {
              createdByEmail = userDoc.data()?.email || '';
            }
          }

          // 접근 로그 개수 조회
          const accessLogsSnapshot = await getDocs(
            collection(db, 'shareLinkAccessLog')
          ).catch(() => ({ size: 0, docs: [] }));

          const linkAccessLogs = accessLogsSnapshot.docs.filter(
            log => log.data().shareLinkId === linkDoc.id
          );

          linksData.push({
            id: linkDoc.id,
            projectId: data.projectId || '',
            projectName,
            token: data.token || '',
            createdBy: data.createdBy || '',
            createdByEmail,
            createdAt: data.createdAt?.toDate?.() || null,
            expiresAt: data.expiresAt?.toDate?.() || null,
            viewCount: data.viewCount || 0,
            isActive: data.isActive !== false,
            accessCount: linkAccessLogs.length
          });
        }

        console.log('🔗 공유 링크 데이터:', linksData);
        setShareLinks(linksData);

        // SharedProjectAccess 조회
        const sharedAccessQuery = query(collection(db, 'sharedProjectAccess'));
        const sharedAccessSnapshot = await getDocs(sharedAccessQuery);

        console.log('👥 공유 접근 권한 개수:', sharedAccessSnapshot.size);

        const accessData: SharedAccess[] = [];
        for (const accessDoc of sharedAccessSnapshot.docs) {
          const data = accessDoc.data();

          // 프로젝트 정보 조회
          let projectName = '';
          if (data.projectId) {
            const projectDoc = await getDoc(doc(db, 'projects', data.projectId)).catch(() => null);
            if (projectDoc?.exists()) {
              projectName = projectDoc.data()?.projectName || '';
            }
          }

          // 사용자 정보 조회
          let userEmail = '';
          let userName = '';
          if (data.userId) {
            const userDoc = await getDoc(doc(db, 'users', data.userId)).catch(() => null);
            if (userDoc?.exists()) {
              userEmail = userDoc.data()?.email || '';
              userName = userDoc.data()?.displayName || '';
            }
          }

          // 공유자 정보 조회
          let sharedByEmail = '';
          if (data.sharedBy) {
            const sharedByDoc = await getDoc(doc(db, 'users', data.sharedBy)).catch(() => null);
            if (sharedByDoc?.exists()) {
              sharedByEmail = sharedByDoc.data()?.email || '';
            }
          }

          accessData.push({
            id: accessDoc.id,
            projectId: data.projectId || '',
            projectName,
            userId: data.userId || '',
            userEmail,
            userName,
            sharedBy: data.sharedBy || '',
            sharedByEmail,
            permission: data.permission || 'viewer',
            sharedAt: data.sharedAt?.toDate?.() || null,
            lastAccessedAt: data.lastAccessedAt?.toDate?.() || null
          });
        }

        console.log('👥 공유 접근 권한 데이터:', accessData);
        setSharedAccesses(accessData);
      } catch (error) {
        console.error('❌ 공유 데이터 조회 실패:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchShareData();
  }, [user]);

  // 검색 필터링
  const filteredShareLinks = shareLinks.filter(link => {
    const query = searchQuery.toLowerCase();
    return (
      link.projectName?.toLowerCase().includes(query) ||
      link.createdByEmail?.toLowerCase().includes(query) ||
      link.token.toLowerCase().includes(query) ||
      link.id.toLowerCase().includes(query)
    );
  });

  const filteredSharedAccesses = sharedAccesses.filter(access => {
    const query = searchQuery.toLowerCase();
    return (
      access.projectName?.toLowerCase().includes(query) ||
      access.userEmail?.toLowerCase().includes(query) ||
      access.userName?.toLowerCase().includes(query) ||
      access.sharedByEmail?.toLowerCase().includes(query) ||
      access.id.toLowerCase().includes(query)
    );
  });

  // 권한 배지
  const getPermissionBadge = (permission: string) => {
    const permissionMap: { [key: string]: { label: string; className: string } } = {
      owner: { label: '소유자', className: styles.permissionOwner },
      editor: { label: '편집자', className: styles.permissionEditor },
      viewer: { label: '뷰어', className: styles.permissionViewer }
    };
    return permissionMap[permission] || permissionMap.viewer;
  };

  // 상태 배지
  const getStatusBadge = (isActive: boolean, expiresAt: Date | null) => {
    if (!isActive) {
      return { label: '비활성', className: styles.statusInactive };
    }
    if (expiresAt && expiresAt < new Date()) {
      return { label: '만료됨', className: styles.statusExpired };
    }
    return { label: '활성', className: styles.statusActive };
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>공유 관리</h1>
          <p className={styles.subtitle}>공유 링크 및 접근 권한 관리</p>
        </div>
      </div>

      {/* 탭 */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${selectedTab === 'links' ? styles.tabActive : ''}`}
          onClick={() => setSelectedTab('links')}
        >
          <HiOutlineLink size={20} />
          <span>공유 링크 ({shareLinks.length})</span>
        </button>
        <button
          className={`${styles.tab} ${selectedTab === 'access' ? styles.tabActive : ''}`}
          onClick={() => setSelectedTab('access')}
        >
          <HiOutlineUsers size={20} />
          <span>접근 권한 ({sharedAccesses.length})</span>
        </button>
      </div>

      <div className={styles.content}>
        {/* 검색 */}
        <div className={styles.searchBar}>
          <input
            type="text"
            placeholder={selectedTab === 'links' ? '프로젝트명, 생성자, 토큰으로 검색...' : '프로젝트명, 사용자, 공유자로 검색...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
        </div>

        {loading ? (
          <div className={styles.loading}>
            <div className={styles.spinner}></div>
            <p>공유 데이터를 불러오는 중...</p>
          </div>
        ) : selectedTab === 'links' ? (
          /* 공유 링크 테이블 */
          filteredShareLinks.length === 0 ? (
            <div className={styles.emptyState}>
              <HiOutlineLink size={48} />
              <p>공유 링크가 없습니다</p>
            </div>
          ) : (
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>프로젝트</th>
                    <th>토큰</th>
                    <th>생성자</th>
                    <th>조회수</th>
                    <th>접근 로그</th>
                    <th>상태</th>
                    <th>생성일</th>
                    <th>만료일</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredShareLinks.map(link => {
                    const statusBadge = getStatusBadge(link.isActive, link.expiresAt);
                    return (
                      <tr key={link.id}>
                        <td>
                          <div className={styles.projectInfo}>
                            <HiOutlineShare size={20} className={styles.projectIcon} />
                            <span className={styles.projectName}>
                              {link.projectName || '프로젝트 정보 없음'}
                            </span>
                          </div>
                        </td>
                        <td className={styles.token}>
                          <code>{link.token.slice(0, 16)}...</code>
                        </td>
                        <td className={styles.userEmail}>{link.createdByEmail}</td>
                        <td className={styles.count}>
                          <HiOutlineEye size={16} /> {link.viewCount}
                        </td>
                        <td className={styles.count}>{link.accessCount}</td>
                        <td>
                          <span className={`${styles.badge} ${statusBadge.className}`}>
                            {statusBadge.label}
                          </span>
                        </td>
                        <td className={styles.date}>
                          {link.createdAt?.toLocaleDateString('ko-KR') || '-'}
                        </td>
                        <td className={styles.date}>
                          {link.expiresAt?.toLocaleDateString('ko-KR') || '무제한'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          /* 공유 접근 권한 테이블 */
          filteredSharedAccesses.length === 0 ? (
            <div className={styles.emptyState}>
              <HiOutlineUsers size={48} />
              <p>공유 접근 권한이 없습니다</p>
            </div>
          ) : (
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>프로젝트</th>
                    <th>사용자</th>
                    <th>권한</th>
                    <th>공유자</th>
                    <th>공유일</th>
                    <th>최근 접근</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSharedAccesses.map(access => {
                    const permissionBadge = getPermissionBadge(access.permission);
                    return (
                      <tr key={access.id}>
                        <td>
                          <div className={styles.projectInfo}>
                            <HiOutlineShare size={20} className={styles.projectIcon} />
                            <span className={styles.projectName}>
                              {access.projectName || '프로젝트 정보 없음'}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className={styles.userInfo}>
                            <span className={styles.userName}>{access.userName || access.userEmail}</span>
                            {access.userName && (
                              <span className={styles.userEmail}>{access.userEmail}</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={`${styles.badge} ${permissionBadge.className}`}>
                            {permissionBadge.label}
                          </span>
                        </td>
                        <td className={styles.userEmail}>{access.sharedByEmail}</td>
                        <td className={styles.date}>
                          {access.sharedAt?.toLocaleDateString('ko-KR') || '-'}
                        </td>
                        <td className={styles.date}>
                          {access.lastAccessedAt?.toLocaleDateString('ko-KR') || '접근 안함'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default Shares;
