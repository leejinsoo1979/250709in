import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { collection, query, getDocs, where, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { HiOutlineClipboardList, HiOutlineBell, HiOutlineKey, HiOutlineLink } from 'react-icons/hi';
import styles from './Logs.module.css';

interface LoginHistory {
  id: string;
  userId: string;
  userEmail?: string;
  timestamp: Date | null;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
}

interface Notification {
  id: string;
  userId: string;
  userEmail?: string;
  type: string;
  message: string;
  createdAt: Date | null;
  read: boolean;
}

interface ActivityLog {
  id: string;
  userId: string;
  userEmail?: string;
  action: string;
  resource: string;
  resourceId?: string;
  timestamp: Date | null;
  metadata?: any;
}

interface ShareLinkAccess {
  id: string;
  shareLinkId: string;
  shareLinkToken?: string;
  projectId?: string;
  projectName?: string;
  ipAddress?: string;
  userAgent?: string;
  accessedAt: Date | null;
}

const Logs = () => {
  const { user } = useAuth();
  const [loginHistory, setLoginHistory] = useState<LoginHistory[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [shareLinkAccessLog, setShareLinkAccessLog] = useState<ShareLinkAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTab, setSelectedTab] = useState<'login' | 'notifications' | 'activity' | 'sharelink'>('login');

  // 로그 데이터 가져오기
  useEffect(() => {
    if (!user) {
      console.log('📋 Logs: user 없음');
      return;
    }

    const fetchLogs = async () => {
      try {
        setLoading(true);
        console.log('📋 로그 데이터 조회 중...');

        // LoginHistory 조회 (본인 것만)
        const loginHistoryQuery = query(
          collection(db, 'loginHistory'),
          where('userId', '==', user.uid),
          orderBy('timestamp', 'desc'),
          limit(100)
        );
        const loginHistorySnapshot = await getDocs(loginHistoryQuery).catch(() => ({ docs: [] }));

        const loginData: LoginHistory[] = [];
        loginHistorySnapshot.docs.forEach(doc => {
          const data = doc.data();
          loginData.push({
            id: doc.id,
            userId: data.userId || '',
            userEmail: data.userEmail || user.email || '',
            timestamp: data.timestamp?.toDate?.() || null,
            ipAddress: data.ipAddress || '',
            userAgent: data.userAgent || '',
            success: data.success !== false
          });
        });

        console.log('📋 로그인 기록:', loginData.length);
        setLoginHistory(loginData);

        // Notifications 조회 (본인 것만)
        const notificationsQuery = query(
          collection(db, 'notifications'),
          where('userId', '==', user.uid),
          orderBy('createdAt', 'desc'),
          limit(100)
        );
        const notificationsSnapshot = await getDocs(notificationsQuery).catch(() => ({ docs: [] }));

        const notifData: Notification[] = [];
        notificationsSnapshot.docs.forEach(doc => {
          const data = doc.data();
          notifData.push({
            id: doc.id,
            userId: data.userId || '',
            userEmail: user.email || '',
            type: data.type || 'info',
            message: data.message || '',
            createdAt: data.createdAt?.toDate?.() || null,
            read: data.read === true
          });
        });

        console.log('📋 알림:', notifData.length);
        setNotifications(notifData);

        // ActivityLogs 조회 (본인 것만)
        const activityLogsQuery = query(
          collection(db, 'activityLogs'),
          where('userId', '==', user.uid),
          orderBy('timestamp', 'desc'),
          limit(100)
        );
        const activityLogsSnapshot = await getDocs(activityLogsQuery).catch(() => ({ docs: [] }));

        const activityData: ActivityLog[] = [];
        activityLogsSnapshot.docs.forEach(doc => {
          const data = doc.data();
          activityData.push({
            id: doc.id,
            userId: data.userId || '',
            userEmail: user.email || '',
            action: data.action || '',
            resource: data.resource || '',
            resourceId: data.resourceId || '',
            timestamp: data.timestamp?.toDate?.() || null,
            metadata: data.metadata || {}
          });
        });

        console.log('📋 활동 로그:', activityData.length);
        setActivityLogs(activityData);

        // ShareLinkAccessLog 조회 (전체 - 관리자만)
        const shareLinkAccessLogQuery = query(
          collection(db, 'shareLinkAccessLog'),
          orderBy('accessedAt', 'desc'),
          limit(200)
        );
        const shareLinkAccessLogSnapshot = await getDocs(shareLinkAccessLogQuery).catch(() => ({ docs: [] }));

        // ⚡ 옛 로그 보강용으로 shareLinks/projects를 1회씩만 가져와서 메모리 매핑
        // (이전엔 로그 1건당 doc 조회 → 200건이면 400회 read, 무한 로딩)
        const needsBackfill = shareLinkAccessLogSnapshot.docs.some((d) => {
          const data = d.data();
          return !data.projectId || !data.shareLinkToken;
        });

        const shareLinkMap = new Map<string, { token: string; projectId: string }>();
        const projectNameMap = new Map<string, string>();
        if (needsBackfill) {
          try {
            const [shareLinksSnap, projectsSnap] = await Promise.all([
              getDocs(collection(db, 'shareLinks')),
              getDocs(collection(db, 'projects')),
            ]);
            shareLinksSnap.docs.forEach((d) => {
              const x = d.data();
              shareLinkMap.set(d.id, { token: x.token || '', projectId: x.projectId || '' });
            });
            projectsSnap.docs.forEach((d) => {
              const x = d.data();
              projectNameMap.set(d.id, x.projectName || x.title || '');
            });
          } catch { /* ignore */ }
        }

        const shareLinkData: ShareLinkAccess[] = shareLinkAccessLogSnapshot.docs.map((logDoc) => {
          const data = logDoc.data();
          let projectId = data.projectId || '';
          let projectName = data.projectName || '';
          let shareLinkToken = data.shareLinkToken || '';

          if (!projectId || !shareLinkToken) {
            const shareLinkId = data.shareLinkId || data.linkId;
            if (shareLinkId) {
              const sl = shareLinkMap.get(shareLinkId);
              if (sl) {
                if (!shareLinkToken) shareLinkToken = sl.token;
                if (!projectId) projectId = sl.projectId;
              }
            }
            if (projectId && !projectName) {
              projectName = projectNameMap.get(projectId) || '';
            }
          }

          return {
            id: logDoc.id,
            shareLinkId: data.shareLinkId || data.linkId || '',
            shareLinkToken,
            projectId,
            projectName,
            ipAddress: data.ipAddress || '',
            userAgent: data.userAgent || '',
            accessedAt: data.accessedAt?.toDate?.() || null,
          };
        });

        console.log('📋 공유 링크 접근 로그:', shareLinkData.length);
        setShareLinkAccessLog(shareLinkData);
      } catch (error) {
        console.error('❌ 로그 데이터 조회 실패:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [user]);

  // 검색 필터링
  const filteredLoginHistory = loginHistory.filter(log => {
    const query = searchQuery.toLowerCase();
    return (
      log.userEmail?.toLowerCase().includes(query) ||
      log.ipAddress?.toLowerCase().includes(query)
    );
  });

  const filteredNotifications = notifications.filter(notif => {
    const query = searchQuery.toLowerCase();
    return (
      notif.message?.toLowerCase().includes(query) ||
      notif.type?.toLowerCase().includes(query)
    );
  });

  const filteredActivityLogs = activityLogs.filter(log => {
    const query = searchQuery.toLowerCase();
    return (
      log.action?.toLowerCase().includes(query) ||
      log.resource?.toLowerCase().includes(query) ||
      log.resourceId?.toLowerCase().includes(query)
    );
  });

  const filteredShareLinkAccessLog = shareLinkAccessLog.filter(log => {
    const query = searchQuery.toLowerCase();
    return (
      log.projectName?.toLowerCase().includes(query) ||
      log.shareLinkToken?.toLowerCase().includes(query) ||
      log.ipAddress?.toLowerCase().includes(query)
    );
  });

  // 알림 타입 배지
  const getNotificationTypeBadge = (type: string) => {
    const typeMap: { [key: string]: { label: string; className: string } } = {
      info: { label: '정보', className: styles.typeInfo },
      warning: { label: '경고', className: styles.typeWarning },
      error: { label: '오류', className: styles.typeError },
      success: { label: '성공', className: styles.typeSuccess }
    };
    return typeMap[type] || typeMap.info;
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>로그 및 알림</h1>
          <p className={styles.subtitle}>시스템 활동 및 알림 조회</p>
        </div>
      </div>

      {/* 탭 */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${selectedTab === 'login' ? styles.tabActive : ''}`}
          onClick={() => setSelectedTab('login')}
        >
          <HiOutlineKey size={20} />
          <span>로그인 기록 ({loginHistory.length})</span>
        </button>
        <button
          className={`${styles.tab} ${selectedTab === 'notifications' ? styles.tabActive : ''}`}
          onClick={() => setSelectedTab('notifications')}
        >
          <HiOutlineBell size={20} />
          <span>알림 ({notifications.length})</span>
        </button>
        <button
          className={`${styles.tab} ${selectedTab === 'activity' ? styles.tabActive : ''}`}
          onClick={() => setSelectedTab('activity')}
        >
          <HiOutlineClipboardList size={20} />
          <span>활동 로그 ({activityLogs.length})</span>
        </button>
        <button
          className={`${styles.tab} ${selectedTab === 'sharelink' ? styles.tabActive : ''}`}
          onClick={() => setSelectedTab('sharelink')}
        >
          <HiOutlineLink size={20} />
          <span>공유 링크 접근 ({shareLinkAccessLog.length})</span>
        </button>
      </div>

      <div className={styles.content}>
        {/* 검색 */}
        <div className={styles.searchBar}>
          <input
            type="text"
            placeholder={
              selectedTab === 'login' ? '이메일, IP 주소로 검색...' :
              selectedTab === 'notifications' ? '메시지, 타입으로 검색...' :
              selectedTab === 'activity' ? '액션, 리소스로 검색...' :
              '프로젝트명, 토큰, IP로 검색...'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
        </div>

        {loading ? (
          <div className={styles.loading}>
            <div className={styles.spinner}></div>
            <p>로그 데이터를 불러오는 중...</p>
          </div>
        ) : selectedTab === 'login' ? (
          /* 로그인 기록 */
          filteredLoginHistory.length === 0 ? (
            <div className={styles.emptyState}>
              <HiOutlineKey size={48} />
              <p>로그인 기록이 없습니다</p>
            </div>
          ) : (
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>이메일</th>
                    <th>시간</th>
                    <th>IP 주소</th>
                    <th>User Agent</th>
                    <th>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLoginHistory.map(log => (
                    <tr key={log.id}>
                      <td className={styles.userEmail}>{log.userEmail}</td>
                      <td className={styles.timestamp}>
                        {log.timestamp?.toLocaleString('ko-KR') || '-'}
                      </td>
                      <td className={styles.ipAddress}>{log.ipAddress}</td>
                      <td className={styles.userAgent}>{log.userAgent}</td>
                      <td>
                        <span className={`${styles.badge} ${log.success ? styles.statusSuccess : styles.statusFailed}`}>
                          {log.success ? '성공' : '실패'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : selectedTab === 'notifications' ? (
          /* 알림 */
          filteredNotifications.length === 0 ? (
            <div className={styles.emptyState}>
              <HiOutlineBell size={48} />
              <p>알림이 없습니다</p>
            </div>
          ) : (
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>타입</th>
                    <th>메시지</th>
                    <th>생성일</th>
                    <th>읽음</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredNotifications.map(notif => {
                    const typeBadge = getNotificationTypeBadge(notif.type);
                    return (
                      <tr key={notif.id}>
                        <td>
                          <span className={`${styles.badge} ${typeBadge.className}`}>
                            {typeBadge.label}
                          </span>
                        </td>
                        <td className={styles.message}>{notif.message}</td>
                        <td className={styles.timestamp}>
                          {notif.createdAt?.toLocaleString('ko-KR') || '-'}
                        </td>
                        <td>
                          <span className={`${styles.badge} ${notif.read ? styles.statusRead : styles.statusUnread}`}>
                            {notif.read ? '읽음' : '읽지 않음'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : selectedTab === 'activity' ? (
          /* 활동 로그 */
          filteredActivityLogs.length === 0 ? (
            <div className={styles.emptyState}>
              <HiOutlineClipboardList size={48} />
              <p>활동 로그가 없습니다</p>
            </div>
          ) : (
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>액션</th>
                    <th>리소스</th>
                    <th>리소스 ID</th>
                    <th>시간</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredActivityLogs.map(log => (
                    <tr key={log.id}>
                      <td className={styles.action}>{log.action}</td>
                      <td className={styles.resource}>{log.resource}</td>
                      <td className={styles.resourceId}>{log.resourceId || '-'}</td>
                      <td className={styles.timestamp}>
                        {log.timestamp?.toLocaleString('ko-KR') || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          /* 공유 링크 접근 로그 */
          filteredShareLinkAccessLog.length === 0 ? (
            <div className={styles.emptyState}>
              <HiOutlineLink size={48} />
              <p>공유 링크 접근 로그가 없습니다</p>
            </div>
          ) : (
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>프로젝트</th>
                    <th>공유 링크</th>
                    <th>IP 주소</th>
                    <th>User Agent</th>
                    <th>접근 시간</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredShareLinkAccessLog.map(log => {
                    const shareUrl = log.shareLinkToken
                      ? `https://250709in.vercel.app/share/${log.shareLinkToken}`
                      : '';

                    return (
                      <tr key={log.id}>
                        <td className={styles.projectName}>
                          {log.projectName || '프로젝트 정보 없음'}
                        </td>
                        <td className={styles.shareLink}>
                          {shareUrl ? (
                            <a
                              href={shareUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.linkUrl}
                            >
                              {shareUrl}
                            </a>
                          ) : (
                            <span className={styles.noLink}>링크 정보 없음</span>
                          )}
                        </td>
                        <td className={styles.ipAddress}>{log.ipAddress || '-'}</td>
                        <td className={styles.userAgent}>{log.userAgent || '-'}</td>
                        <td className={styles.timestamp}>
                          {log.accessedAt?.toLocaleString('ko-KR') || '-'}
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

export default Logs;
