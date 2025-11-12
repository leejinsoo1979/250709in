import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { collection, query, getDocs, doc, getDoc, where } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { HiOutlineShare, HiOutlineLink, HiOutlineUsers, HiOutlineChevronDown, HiOutlineChevronRight } from 'react-icons/hi';
import styles from './Shares.module.css';

interface ProjectOwner {
  userId: string;
  email: string;
  displayName: string;
}

interface Collaborator {
  userId: string;
  email: string;
  displayName: string;
  permission: 'viewer' | 'editor';
  sharedVia: 'link' | 'email';
  sharedAt: Date | null;
  linkToken?: string;
}

interface ProjectShare {
  projectId: string;
  projectName: string;
  owner: ProjectOwner;
  collaborators: Collaborator[];
  shareLinks: ShareLinkInfo[];
  totalCollaborators: number;
  totalLinks: number;
}

interface ShareLinkInfo {
  id: string;
  token: string;
  permission: string;
  createdAt: Date | null;
  expiresAt: Date | null;
  isActive: boolean;
  usageCount: number;
}

const Shares = () => {
  const { user } = useAuth();
  const [projectShares, setProjectShares] = useState<ProjectShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) {
      console.log('🔗 Shares: user 없음');
      return;
    }

    const fetchShareData = async () => {
      try {
        setLoading(true);
        console.log('🔗 공유 데이터 조회 중...');

        // 모든 프로젝트 조회
        const projectsSnapshot = await getDocs(collection(db, 'projects'));
        const projectSharesData: ProjectShare[] = [];

        for (const projectDoc of projectsSnapshot.docs) {
          const projectData = projectDoc.data();
          const projectId = projectDoc.id;
          const projectName = projectData.title || projectData.projectName || projectData.name || '이름 없음';

          // 프로젝트 소유자 정보
          let ownerEmail = '';
          let ownerDisplayName = '';
          if (projectData.userId) {
            const ownerDoc = await getDoc(doc(db, 'users', projectData.userId)).catch(() => null);
            if (ownerDoc?.exists()) {
              const ownerData = ownerDoc.data();
              ownerEmail = ownerData.email || '';
              ownerDisplayName = ownerData.displayName || ownerData.userName || ownerEmail.split('@')[0] || '사용자';
            }
          }

          const owner: ProjectOwner = {
            userId: projectData.userId || '',
            email: ownerEmail,
            displayName: ownerDisplayName
          };

          // 협업자 조회 (sharedProjectAccess)
          const accessQuery = query(
            collection(db, 'sharedProjectAccess'),
            where('projectId', '==', projectId)
          );
          const accessSnapshot = await getDocs(accessQuery);

          const collaborators: Collaborator[] = [];
          for (const accessDoc of accessSnapshot.docs) {
            const accessData = accessDoc.data();

            let userEmail = accessData.userEmail || '';
            let userDisplayName = accessData.userName || '';

            // 사용자 정보 조회
            if (accessData.userId && (!userEmail || !userDisplayName)) {
              const userDoc = await getDoc(doc(db, 'users', accessData.userId)).catch(() => null);
              if (userDoc?.exists()) {
                const userData = userDoc.data();
                userEmail = userData.email || userEmail;
                userDisplayName = userData.displayName || userData.userName || userEmail.split('@')[0];
              }
            }

            collaborators.push({
              userId: accessData.userId || '',
              email: userEmail,
              displayName: userDisplayName,
              permission: accessData.permission || 'viewer',
              sharedVia: accessData.sharedVia || 'link',
              sharedAt: accessData.grantedAt?.toDate?.() || accessData.sharedAt?.toDate?.() || null,
              linkToken: accessData.linkToken || ''
            });
          }

          // 공유 링크 조회
          const linksQuery = query(
            collection(db, 'shareLinks'),
            where('projectId', '==', projectId)
          );
          const linksSnapshot = await getDocs(linksQuery);

          const shareLinks: ShareLinkInfo[] = [];
          for (const linkDoc of linksSnapshot.docs) {
            const linkData = linkDoc.data();
            shareLinks.push({
              id: linkDoc.id,
              token: linkData.token || '',
              permission: linkData.permission || 'viewer',
              createdAt: linkData.createdAt?.toDate?.() || null,
              expiresAt: linkData.expiresAt?.toDate?.() || null,
              isActive: linkData.isActive !== false,
              usageCount: linkData.usageCount || 0
            });
          }

          // 협업자나 링크가 있는 프로젝트만 추가
          if (collaborators.length > 0 || shareLinks.length > 0) {
            projectSharesData.push({
              projectId,
              projectName,
              owner,
              collaborators,
              shareLinks,
              totalCollaborators: collaborators.length,
              totalLinks: shareLinks.length
            });
          }
        }

        console.log('🔗 프로젝트 공유 데이터:', projectSharesData.length);
        setProjectShares(projectSharesData);
      } catch (error) {
        console.error('❌ 공유 데이터 조회 실패:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchShareData();
  }, [user]);

  // 검색 필터링
  const filteredProjects = projectShares.filter(project => {
    const query = searchQuery.toLowerCase();
    return (
      project.projectName.toLowerCase().includes(query) ||
      project.owner.email.toLowerCase().includes(query) ||
      project.owner.displayName.toLowerCase().includes(query) ||
      project.collaborators.some(c =>
        c.email.toLowerCase().includes(query) ||
        c.displayName.toLowerCase().includes(query)
      )
    );
  });

  // 프로젝트 펼침/접힘
  const toggleProject = (projectId: string) => {
    const newExpanded = new Set(expandedProjects);
    if (newExpanded.has(projectId)) {
      newExpanded.delete(projectId);
    } else {
      newExpanded.add(projectId);
    }
    setExpandedProjects(newExpanded);
  };

  // 권한 배지
  const getPermissionBadge = (permission: string) => {
    const permissionMap: { [key: string]: { label: string; className: string } } = {
      owner: { label: '소유자', className: styles.permissionOwner },
      editor: { label: '편집자', className: styles.permissionEditor },
      viewer: { label: '뷰어', className: styles.permissionViewer }
    };
    return permissionMap[permission] || permissionMap.viewer;
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>공유 관리</h1>
          <p className={styles.subtitle}>프로젝트별 소유자 및 협업자 현황</p>
        </div>
        <div className={styles.stats}>
          <div className={styles.statCard}>
            <HiOutlineShare size={24} />
            <div>
              <div className={styles.statValue}>{projectShares.length}</div>
              <div className={styles.statLabel}>공유된 프로젝트</div>
            </div>
          </div>
          <div className={styles.statCard}>
            <HiOutlineUsers size={24} />
            <div>
              <div className={styles.statValue}>
                {projectShares.reduce((sum, p) => sum + p.totalCollaborators, 0)}
              </div>
              <div className={styles.statLabel}>총 협업자</div>
            </div>
          </div>
          <div className={styles.statCard}>
            <HiOutlineLink size={24} />
            <div>
              <div className={styles.statValue}>
                {projectShares.reduce((sum, p) => sum + p.totalLinks, 0)}
              </div>
              <div className={styles.statLabel}>활성 링크</div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.content}>
        {/* 검색 */}
        <div className={styles.searchBar}>
          <input
            type="text"
            placeholder="프로젝트명, 소유자, 협업자로 검색..."
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
        ) : filteredProjects.length === 0 ? (
          <div className={styles.emptyState}>
            <HiOutlineShare size={48} />
            <p>공유된 프로젝트가 없습니다</p>
          </div>
        ) : (
          <div className={styles.projectList}>
            {filteredProjects.map(project => {
              const isExpanded = expandedProjects.has(project.projectId);
              return (
                <div key={project.projectId} className={styles.projectCard}>
                  {/* 프로젝트 헤더 */}
                  <div
                    className={styles.projectHeader}
                    onClick={() => toggleProject(project.projectId)}
                  >
                    <div className={styles.projectHeaderLeft}>
                      {isExpanded ? (
                        <HiOutlineChevronDown size={20} className={styles.chevron} />
                      ) : (
                        <HiOutlineChevronRight size={20} className={styles.chevron} />
                      )}
                      <HiOutlineShare size={20} className={styles.projectIcon} />
                      <div>
                        <div className={styles.projectName}>{project.projectName}</div>
                        <div className={styles.projectMeta}>
                          <span className={styles.ownerInfo}>
                            소유자: {project.owner.displayName} ({project.owner.email})
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className={styles.projectHeaderRight}>
                      <div className={styles.badge}>
                        <HiOutlineUsers size={16} />
                        {project.totalCollaborators}명
                      </div>
                      <div className={styles.badge}>
                        <HiOutlineLink size={16} />
                        {project.totalLinks}개
                      </div>
                    </div>
                  </div>

                  {/* 프로젝트 상세 */}
                  {isExpanded && (
                    <div className={styles.projectDetails}>
                      {/* 협업자 목록 */}
                      {project.collaborators.length > 0 && (
                        <div className={styles.section}>
                          <h3 className={styles.sectionTitle}>
                            <HiOutlineUsers size={18} />
                            협업자 ({project.collaborators.length}명)
                          </h3>
                          <div className={styles.tableContainer}>
                            <table className={styles.table}>
                              <thead>
                                <tr>
                                  <th>사용자</th>
                                  <th>이메일</th>
                                  <th>권한</th>
                                  <th>공유 방식</th>
                                  <th>공유 링크</th>
                                  <th>공유일</th>
                                </tr>
                              </thead>
                              <tbody>
                                {project.collaborators.map((collab, idx) => {
                                  const permissionBadge = getPermissionBadge(collab.permission);
                                  const baseUrl = import.meta.env.VITE_APP_URL || window.location.origin;
                                  const shareUrl = collab.linkToken
                                    ? `${baseUrl}/share/${collab.linkToken}`
                                    : '';
                                  return (
                                    <tr key={`${collab.userId}-${idx}`}>
                                      <td className={styles.userName}>{collab.displayName}</td>
                                      <td className={styles.userEmail}>{collab.email}</td>
                                      <td>
                                        <span className={`${styles.badge} ${permissionBadge.className}`}>
                                          {permissionBadge.label}
                                        </span>
                                      </td>
                                      <td>
                                        <span className={styles.sharedVia}>
                                          {collab.sharedVia === 'email' ? '이메일 초대' : '링크'}
                                        </span>
                                      </td>
                                      <td>
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
                                          <span className={styles.noLink}>-</span>
                                        )}
                                      </td>
                                      <td className={styles.date}>
                                        {collab.sharedAt?.toLocaleDateString('ko-KR') || '-'}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* 공유 링크 목록 */}
                      {project.shareLinks.length > 0 && (
                        <div className={styles.section}>
                          <h3 className={styles.sectionTitle}>
                            <HiOutlineLink size={18} />
                            공유 링크 ({project.shareLinks.length}개)
                          </h3>
                          <div className={styles.tableContainer}>
                            <table className={styles.table}>
                              <thead>
                                <tr>
                                  <th>링크 URL</th>
                                  <th>권한</th>
                                  <th>사용 횟수</th>
                                  <th>상태</th>
                                  <th>생성일</th>
                                  <th>만료일</th>
                                </tr>
                              </thead>
                              <tbody>
                                {project.shareLinks.map(link => {
                                  const permissionBadge = getPermissionBadge(link.permission);
                                  const baseUrl = import.meta.env.VITE_APP_URL || window.location.origin;
                                  const shareUrl = `${baseUrl}/share/${link.token}`;
                                  const isExpired = link.expiresAt && link.expiresAt < new Date();
                                  const statusClass = !link.isActive
                                    ? styles.statusInactive
                                    : isExpired
                                    ? styles.statusExpired
                                    : styles.statusActive;
                                  const statusLabel = !link.isActive
                                    ? '비활성'
                                    : isExpired
                                    ? '만료됨'
                                    : '활성';

                                  return (
                                    <tr key={link.id}>
                                      <td>
                                        <a
                                          href={shareUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className={styles.linkUrl}
                                        >
                                          {shareUrl}
                                        </a>
                                      </td>
                                      <td>
                                        <span className={`${styles.badge} ${permissionBadge.className}`}>
                                          {permissionBadge.label}
                                        </span>
                                      </td>
                                      <td className={styles.count}>{link.usageCount}회</td>
                                      <td>
                                        <span className={`${styles.badge} ${statusClass}`}>
                                          {statusLabel}
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
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Shares;
