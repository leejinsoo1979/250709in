import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { PLANS } from '@/firebase/plans';
import {
  ArrowLeft, User, Mail, Calendar, Shield, Package,
  FileText, Link as LinkIcon, Eye, HardDrive, Coins,
  CheckCircle, XCircle, Building, Users
} from 'lucide-react';
import styles from './UserDetail.module.css';

interface UserData {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  createdAt: any;
  lastLoginAt: any;
  disabled: boolean;
  plan?: string;
  organization?: string;
  teams?: string[];
  role?: string;
  projectCount?: number;
  storageUsed?: number;
  credits?: number;
}

interface Project {
  id: string;
  title: string;
  createdAt: any;
  updatedAt: any;
}

interface DesignFile {
  id: string;
  fileName: string;
  projectId: string;
  createdAt: any;
  updatedAt?: any;
  fileSize: number;
}

interface ShareLink {
  id: string;
  projectId: string;
  token: string;
  createdAt: any;
  expiresAt: any;
  viewCount: number;
  isActive: boolean;
}

export default function UserDetail() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<UserData | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [designFiles, setDesignFiles] = useState<DesignFile[]>([]);
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserData = async () => {
      if (!userId) {
        setError('사용자 ID가 없습니다.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // 사용자 기본 정보
        const userDoc = await getDoc(doc(db, 'users', userId));

        if (!userDoc.exists()) {
          setError('사용자를 찾을 수 없습니다.');
          setLoading(false);
          return;
        }

        const userData = userDoc.data() as UserData;

        // userProfiles에서 크레딧 정보 가져오기
        const userProfileDoc = await getDoc(doc(db, 'userProfiles', userId));
        let credits = 0;
        if (userProfileDoc.exists()) {
          const profileData = userProfileDoc.data();
          credits = profileData.credits !== undefined ? profileData.credits : 0;
          console.log(`✅ 크레딧 정보 로드: ${credits}`);
        } else {
          console.log('⚠️ userProfiles 문서가 없습니다.');
        }

        setUser({ ...userData, uid: userDoc.id, credits });

        // 프로젝트 조회
        const projectsQuery = query(collection(db, 'projects'), where('userId', '==', userId));
        const projectsSnapshot = await getDocs(projectsQuery);
        console.log(`📊 프로젝트 수: ${projectsSnapshot.docs.length}개`);
        const projectsList = projectsSnapshot.docs.map(doc => {
          const data = doc.data();
          console.log('프로젝트 데이터:', { id: doc.id, ...data });
          return {
            id: doc.id,
            title: data.title || data.projectName || '제목 없음',
            createdAt: data.createdAt,
            updatedAt: data.updatedAt
          };
        });
        setProjects(projectsList);

        // 디자인 파일 조회 - designFiles 컬렉션에서 projectId로 필터링
        let filesList: DesignFile[] = [];
        if (projectsList.length > 0) {
          const designFilesQuery = query(
            collection(db, 'designFiles'),
            where('projectId', 'in', projectsList.map(p => p.id))
          );
          const designFilesSnapshot = await getDocs(designFilesQuery);
          console.log(`📄 디자인 파일 수: ${designFilesSnapshot.docs.length}개`);
          filesList = designFilesSnapshot.docs.map(doc => {
            const data = doc.data();
            console.log('디자인 파일 데이터:', {
              id: doc.id,
              name: data.name,
              fileName: data.fileName,
              projectId: data.projectId,
              hasFurniture: !!data.furniture,
              placedModulesCount: data.furniture?.placedModules?.length || 0,
              spaceConfig: !!data.spaceConfig
            });
            return {
              id: doc.id,
              fileName: data.name || data.fileName || '파일명 없음',
              projectId: data.projectId || '',
              createdAt: data.createdAt,
              updatedAt: data.updatedAt,
              fileSize: data.size || data.fileSize || 0
            };
          });
        } else {
          console.log('⚠️ 프로젝트가 없어서 디자인 파일을 조회하지 않습니다.');
        }
        setDesignFiles(filesList);

        // 공유 링크 조회
        const shareLinksQuery = query(collection(db, 'shareLinks'), where('createdBy', '==', userId));
        const shareLinksSnapshot = await getDocs(shareLinksQuery);
        console.log(`🔗 공유 링크 수: ${shareLinksSnapshot.docs.length}개`);
        const linksList = shareLinksSnapshot.docs.map(doc => {
          const data = doc.data();
          console.log('공유 링크 데이터:', { id: doc.id, ...data });
          return {
            id: doc.id,
            projectId: data.projectId || '',
            token: data.token || '',
            createdAt: data.createdAt,
            expiresAt: data.expiresAt,
            viewCount: data.viewCount || 0,
            isActive: data.isActive !== false
          };
        });
        setShareLinks(linksList);

        setError(null);
      } catch (err) {
        console.error('사용자 정보 로딩 실패:', err);
        setError('사용자 정보를 불러오는데 실패했습니다.');
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [userId]);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>로딩 중...</div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <p>{error || '사용자를 찾을 수 없습니다.'}</p>
          <button onClick={() => navigate('/admin/users')} className={styles.backButton}>
            목록으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={() => navigate('/admin/users')} className={styles.backButton}>
          <ArrowLeft size={18} />
          <span>목록으로</span>
        </button>
        <h1>사용자 상세 정보</h1>
      </div>

      {/* 프로필 카드 */}
      <div className={styles.profileCard}>
        <div className={styles.profileImageWrapper}>
          <div className={styles.profileImage}>
            {user.photoURL ? (
              <img src={user.photoURL} alt={user.displayName || user.email || 'User'} />
            ) : (
              <div className={styles.profilePlaceholder}>
                <User size={48} />
              </div>
            )}
          </div>
          <div className={styles.statusIndicator} data-status={user.disabled ? 'inactive' : 'active'} />
        </div>
        <div className={styles.profileInfo}>
          <h2>{user.displayName || '이름 없음'}</h2>
          <div className={styles.emailRow}>
            <Mail size={16} />
            <p>{user.email}</p>
          </div>
          <div className={styles.profileBadges}>
            <div className={styles.badge} data-variant={user.disabled ? 'danger' : 'success'}>
              {user.disabled ? <XCircle size={14} /> : <CheckCircle size={14} />}
              <span>{user.disabled ? '비활성' : '활성'}</span>
            </div>
            <div className={styles.badge} data-variant={user.emailVerified ? 'info' : 'warning'}>
              {user.emailVerified ? <CheckCircle size={14} /> : <XCircle size={14} />}
              <span>{user.emailVerified ? '인증됨' : '미인증'}</span>
            </div>
            <div
              className={styles.planBadge}
              style={{ backgroundColor: user.role === 'superadmin' ? '#667eea' : PLANS[user.plan || 'free'].color }}
            >
              <Shield size={14} />
              <span>{user.role === 'superadmin' ? '무제한 플랜' : PLANS[user.plan || 'free'].name}</span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.content}>
        {/* 기본 정보 */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <User size={20} />
            <h2>기본 정보</h2>
          </div>
          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <label>
                <Shield size={14} />
                <span>사용자 ID</span>
              </label>
              <div className={styles.monospace}>{user.uid}</div>
            </div>
            <div className={styles.infoItem}>
              <label>
                <Calendar size={14} />
                <span>가입일</span>
              </label>
              <div>
                {user.createdAt
                  ? new Date(user.createdAt.toMillis()).toLocaleString('ko-KR')
                  : '-'}
              </div>
            </div>
            <div className={styles.infoItem}>
              <label>
                <Calendar size={14} />
                <span>마지막 로그인</span>
              </label>
              <div>
                {user.lastLoginAt
                  ? new Date(user.lastLoginAt.toMillis()).toLocaleString('ko-KR')
                  : '-'}
              </div>
            </div>
          </div>
        </section>

        {/* 플랜 정보 */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <Package size={20} />
            <h2>플랜 정보</h2>
          </div>
          <div className={styles.planInfo}>
            <div
              className={styles.planBadgeLarge}
              style={{ backgroundColor: user.role === 'superadmin' ? '#667eea' : PLANS[user.plan || 'free'].color }}
            >
              <Shield size={18} />
              <span>{user.role === 'superadmin' ? '무제한 플랜' : PLANS[user.plan || 'free'].name}</span>
            </div>
            <div className={styles.planFeatures}>
              <div className={styles.planFeature}>
                <Package size={16} />
                <span>최대 프로젝트: {user.role === 'superadmin' ? '무제한' : `${PLANS[user.plan || 'free'].maxProjects}개`}</span>
              </div>
              <div className={styles.planFeature}>
                <HardDrive size={16} />
                <span>스토리지: {user.role === 'superadmin' ? '무제한' : `${PLANS[user.plan || 'free'].storageLimit}GB`}</span>
              </div>
            </div>
          </div>
        </section>

        {/* 소속 정보 */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <Building size={20} />
            <h2>소속 정보</h2>
          </div>
          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <label>
                <Building size={14} />
                <span>조직</span>
              </label>
              <div>{user.organization || '-'}</div>
            </div>
            <div className={styles.infoItem}>
              <label>
                <Shield size={14} />
                <span>역할</span>
              </label>
              <div>{user.role || '-'}</div>
            </div>
            <div className={styles.infoItem}>
              <label>
                <Users size={14} />
                <span>팀</span>
              </label>
              <div>
                {user.teams && user.teams.length > 0
                  ? user.teams.join(', ')
                  : '-'}
              </div>
            </div>
          </div>
        </section>

        {/* 사용 현황 */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <Package size={20} />
            <h2>사용 현황</h2>
          </div>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statIcon} data-color="blue">
                <Package size={24} />
              </div>
              <div className={styles.statInfo}>
                <div className={styles.statLabel}>프로젝트</div>
                <div className={styles.statValue}>{projects.length}</div>
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statIcon} data-color="purple">
                <FileText size={24} />
              </div>
              <div className={styles.statInfo}>
                <div className={styles.statLabel}>디자인 파일</div>
                <div className={styles.statValue}>{designFiles.length}</div>
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statIcon} data-color="green">
                <LinkIcon size={24} />
              </div>
              <div className={styles.statInfo}>
                <div className={styles.statLabel}>공유 링크</div>
                <div className={styles.statValue}>{shareLinks.length}</div>
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statIcon} data-color="orange">
                <Eye size={24} />
              </div>
              <div className={styles.statInfo}>
                <div className={styles.statLabel}>총 조회수</div>
                <div className={styles.statValue}>{shareLinks.reduce((sum, link) => sum + link.viewCount, 0)}</div>
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statIcon} data-color="indigo">
                <HardDrive size={24} />
              </div>
              <div className={styles.statInfo}>
                <div className={styles.statLabel}>스토리지 사용량</div>
                <div className={styles.statValue}>
                  {designFiles.reduce((sum, file) => sum + file.fileSize, 0) > 0
                    ? `${(designFiles.reduce((sum, file) => sum + file.fileSize, 0) / 1024 / 1024).toFixed(2)} MB`
                    : '0 MB'}
                </div>
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statIcon} data-color="yellow">
                <Coins size={24} />
              </div>
              <div className={styles.statInfo}>
                <div className={styles.statLabel}>크레딧</div>
                <div className={styles.statValue}>
                  {user.role === 'superadmin' ? '무제한' : (user.credits !== undefined ? user.credits : 0)}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 프로젝트 */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <Package size={20} />
            <h2>프로젝트 ({projects.length})</h2>
          </div>
          {projects.length === 0 ? (
            <div className={styles.emptyState}>프로젝트가 없습니다</div>
          ) : (
            <div className={styles.listContainer}>
              {projects.map(project => {
                const projectFiles = designFiles.filter(file => file.projectId === project.id);
                const isExpanded = expandedProjectId === project.id;

                return (
                  <div key={project.id} className={styles.projectItem}>
                    <div
                      className={styles.listItem}
                      onClick={() => setExpandedProjectId(isExpanded ? null : project.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className={styles.listItemHeader}>
                        <strong>{project.title}</strong>
                        <div className={styles.projectItemRight}>
                          <span className={styles.fileCount}>파일 {projectFiles.length}개</span>
                          <span className={styles.expandIcon}>{isExpanded ? '▼' : '▶'}</span>
                        </div>
                      </div>
                      <div className={styles.listItemMeta}>
                        <span>생성: {project.createdAt ? new Date(project.createdAt.toMillis()).toLocaleDateString('ko-KR') : '-'}</span>
                        {project.updatedAt && (
                          <span>수정: {new Date(project.updatedAt.toMillis()).toLocaleDateString('ko-KR')}</span>
                        )}
                      </div>
                    </div>

                    {isExpanded && projectFiles.length > 0 && (
                      <div className={styles.projectFiles}>
                        {projectFiles.map(file => {
                          const fileUrl = `https://250709in.vercel.app/configurator?projectId=${file.projectId}&designFileId=${file.id}`;
                          console.log('🔗 링크 생성:', {
                            fileName: file.fileName,
                            fileId: file.id,
                            projectId: file.projectId,
                            url: fileUrl
                          });
                          return (
                            <div key={file.id} className={styles.fileItem}>
                              <div className={styles.fileItemHeader}>
                                <span className={styles.fileName}>{file.fileName}</span>
                                <span className={styles.fileSize}>
                                  {(file.fileSize / 1024).toFixed(2)} KB
                                </span>
                              </div>
                              <div className={styles.fileItemMeta}>
                                <a
                                  href={fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={styles.fileUrl}
                                >
                                  {fileUrl}
                                </a>
                              </div>
                              <div className={styles.fileItemMeta}>
                                <span>생성: {file.createdAt ? new Date(file.createdAt.toMillis()).toLocaleDateString('ko-KR') : '-'}</span>
                                {file.updatedAt && (
                                  <span>수정: {new Date(file.updatedAt.toMillis()).toLocaleDateString('ko-KR')}</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 디자인 파일 */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <FileText size={20} />
            <h2>디자인 파일 ({designFiles.length})</h2>
          </div>
          {designFiles.length === 0 ? (
            <div className={styles.emptyState}>디자인 파일이 없습니다</div>
          ) : (
            <div className={styles.listContainer}>
              {designFiles.map(file => {
                const fileUrl = `https://250709in.vercel.app/configurator?projectId=${file.projectId}&designFileId=${file.id}`;
                console.log('🔗 디자인 파일 섹션 링크:', {
                  fileName: file.fileName,
                  fileId: file.id,
                  projectId: file.projectId,
                  url: fileUrl
                });
                return (
                  <div key={file.id} className={styles.listItem}>
                    <div className={styles.listItemHeader}>
                      <strong className={styles.fileName}>{file.fileName}</strong>
                      <span className={styles.listItemSize}>
                        {(file.fileSize / 1024).toFixed(2)} KB
                      </span>
                    </div>
                    <div className={styles.listItemMeta}>
                      <a
                        href={fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.fileUrl}
                      >
                        {fileUrl}
                      </a>
                    </div>
                    <div className={styles.listItemMeta}>
                      <span>프로젝트: {file.projectId}</span>
                      <span>생성: {file.createdAt ? new Date(file.createdAt.toMillis()).toLocaleDateString('ko-KR') : '-'}</span>
                      {file.updatedAt && (
                        <span>수정: {new Date(file.updatedAt.toMillis()).toLocaleDateString('ko-KR')}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 공유 링크 */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <LinkIcon size={20} />
            <h2>공유 링크 ({shareLinks.length})</h2>
          </div>
          {shareLinks.length === 0 ? (
            <div className={styles.emptyState}>공유 링크가 없습니다</div>
          ) : (
            <div className={styles.listContainer}>
              {shareLinks.map(link => (
                <div key={link.id} className={styles.listItem}>
                  <div className={styles.listItemHeader}>
                    <strong>토큰: {link.token}</strong>
                    <span className={styles.statusBadge} data-status={link.isActive ? 'active' : 'disabled'}>
                      {link.isActive ? '활성' : '비활성'}
                    </span>
                  </div>
                  <div className={styles.listItemMeta}>
                    <span>프로젝트: {link.projectId}</span>
                    <span>조회수: {link.viewCount}회</span>
                    <span>생성: {link.createdAt ? new Date(link.createdAt.toMillis()).toLocaleDateString('ko-KR') : '-'}</span>
                    {link.expiresAt && (
                      <span>만료: {new Date(link.expiresAt.toMillis()).toLocaleDateString('ko-KR')}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
