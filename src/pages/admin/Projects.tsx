import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { collection, query, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase/config';
import {
  Folder, FolderOpen, FileText, Users, Share2,
  Calendar, HardDrive, Search, User, Package, ExternalLink
} from 'lucide-react';
import styles from './Projects.module.css';

interface ProjectData {
  id: string;
  projectName: string;
  userId: string;
  ownerName?: string;
  ownerEmail?: string;
  ownerPhotoURL?: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  designFileCount: number;
  isShared: boolean;
  collaboratorCount: number;
}

interface DesignFile {
  id: string;
  fileName: string;
  userId: string;
  projectId: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  fileSize?: number;
}

const Projects = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [designFiles, setDesignFiles] = useState<DesignFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);

  // 프로젝트 목록 가져오기
  useEffect(() => {
    if (!user) {
      console.log('📁 Projects: user 없음');
      return;
    }

    const fetchProjects = async () => {
      try {
        setLoading(true);
        console.log('📁 프로젝트 목록 조회 중...');

        // ⚡ 모든 컬렉션을 1회씩만 병렬로 조회 (이전엔 프로젝트당 N회 반복 → 무한 로딩)
        const [projectsSnap, designFilesSnap, shareLinksSnap, sharedAccessSnap] = await Promise.all([
          getDocs(collection(db, 'projects')),
          getDocs(collection(db, 'designFiles')).catch(() => ({ docs: [] as any[] })),
          getDocs(collection(db, 'shareLinks')).catch(() => ({ docs: [] as any[] })),
          getDocs(collection(db, 'sharedProjectAccess')).catch(() => ({ docs: [] as any[] })),
        ]);

        console.log('📁 프로젝트 개수:', projectsSnap.size);

        // projectId별로 그룹핑 (메모리에서 1회)
        const designFilesByProject = new Map<string, number>();
        designFilesSnap.docs.forEach((d: any) => {
          const pid = d.data().projectId;
          if (pid) designFilesByProject.set(pid, (designFilesByProject.get(pid) || 0) + 1);
        });
        const shareLinksByProject = new Map<string, number>();
        shareLinksSnap.docs.forEach((d: any) => {
          const pid = d.data().projectId;
          if (pid) shareLinksByProject.set(pid, (shareLinksByProject.get(pid) || 0) + 1);
        });
        const collaboratorsByProject = new Map<string, number>();
        sharedAccessSnap.docs.forEach((d: any) => {
          const pid = d.data().projectId;
          if (pid) collaboratorsByProject.set(pid, (collaboratorsByProject.get(pid) || 0) + 1);
        });

        // 소유자 정보를 위한 unique userId 추출
        const userIds = new Set<string>();
        projectsSnap.docs.forEach((p) => {
          const data = p.data();
          const uid = data.userId || data.user_id;
          if (uid) userIds.add(uid);
        });

        // 소유자 정보 병렬 조회 (캐시 맵)
        const ownerMap = new Map<string, { name: string; email: string; photoURL: string }>();
        await Promise.all(
          Array.from(userIds).map(async (uid) => {
            try {
              const userDoc = await getDoc(doc(db, 'users', uid));
              if (userDoc.exists()) {
                const u = userDoc.data();
                ownerMap.set(uid, {
                  name: u?.displayName || u?.name || '',
                  email: u?.email || '',
                  photoURL: u?.photoURL || '',
                });
              }
            } catch { /* ignore */ }
          })
        );

        const projectsData: ProjectData[] = projectsSnap.docs.map((projectDoc) => {
          const data = projectDoc.data();
          const projectName = data.title || data.projectName || data.name || data.project_name || '이름 없음';
          const userId = data.userId || data.user_id || '';
          const owner = ownerMap.get(userId) || { name: '', email: '', photoURL: '' };
          return {
            id: projectDoc.id,
            projectName,
            userId,
            ownerName: owner.name,
            ownerEmail: owner.email,
            ownerPhotoURL: owner.photoURL,
            createdAt: data.createdAt?.toDate?.() || null,
            updatedAt: data.updatedAt?.toDate?.() || null,
            designFileCount: designFilesByProject.get(projectDoc.id) || 0,
            isShared: (shareLinksByProject.get(projectDoc.id) || 0) > 0,
            collaboratorCount: collaboratorsByProject.get(projectDoc.id) || 0,
          };
        });

        console.log('📁 프로젝트 데이터:', projectsData.length, '건');
        setProjects(projectsData);
      } catch (error) {
        console.error('❌ 프로젝트 목록 조회 실패:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, [user]);

  // 디자인 파일 조회
  const fetchDesignFiles = async (projectId: string) => {
    try {
      setFilesLoading(true);
      console.log('📄 디자인 파일 조회 중:', projectId);

      const designFilesQuery = query(collection(db, 'designFiles'));
      const designFilesSnapshot = await getDocs(designFilesQuery);

      const filesData: DesignFile[] = [];
      designFilesSnapshot.forEach(doc => {
        const data = doc.data();
        // 해당 프로젝트의 파일만 필터링
        if (data.projectId === projectId) {
          // 디버깅: 첫 번째 파일의 전체 데이터 구조 확인
          if (filesData.length === 0) {
            console.log('📄 첫 번째 디자인 파일 원본 데이터:', data);
          }

          // 다양한 필드명 시도
          const fileName = data.fileName || data.filename || data.name || data.file_name || data.title || `파일_${doc.id.substring(0, 8)}`;

          filesData.push({
            id: doc.id,
            fileName: fileName,
            userId: data.userId || '',
            projectId: data.projectId || '',
            createdAt: data.createdAt?.toDate?.() || null,
            updatedAt: data.updatedAt?.toDate?.() || null,
            fileSize: data.fileSize || data.size || 0
          });
        }
      });

      console.log('📄 디자인 파일 데이터:', filesData);
      setDesignFiles(filesData);
    } catch (error) {
      console.error('❌ 디자인 파일 조회 실패:', error);
      setDesignFiles([]);
    } finally {
      setFilesLoading(false);
    }
  };

  // 프로젝트 선택
  const handleProjectSelect = (projectId: string) => {
    setSelectedProject(projectId);
    fetchDesignFiles(projectId);
  };

  // 검색 필터링
  const filteredProjects = projects.filter(project => {
    const query = searchQuery.toLowerCase();
    return (
      project.projectName?.toLowerCase().includes(query) ||
      project.ownerName?.toLowerCase().includes(query) ||
      project.ownerEmail?.toLowerCase().includes(query) ||
      project.id.toLowerCase().includes(query)
    );
  });

  // 파일 크기 포맷
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '-';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.headerIcon}>
            <Package size={32} />
          </div>
          <div>
            <h1 className={styles.title}>프로젝트 관리</h1>
            <p className={styles.subtitle}>전체 프로젝트 및 디자인 파일 관리</p>
          </div>
        </div>
      </div>

      <div className={styles.content}>
        {/* 프로젝트 목록 */}
        <div className={styles.projectsSection}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitleWrapper}>
              <FolderOpen size={20} />
              <h2 className={styles.sectionTitle}>프로젝트 목록 ({projects.length})</h2>
            </div>
            <div className={styles.searchWrapper}>
              <Search size={18} className={styles.searchIcon} />
              <input
                type="text"
                placeholder="프로젝트명, 소유자, ID로 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.searchInput}
              />
            </div>
          </div>

          {loading ? (
            <div className={styles.loading}>
              <div className={styles.spinner}></div>
              <p>프로젝트 목록을 불러오는 중...</p>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <Folder size={56} />
              </div>
              <p>프로젝트가 없습니다</p>
            </div>
          ) : (
            <div className={styles.projectsList}>
              {filteredProjects.map(project => (
                <div
                  key={project.id}
                  className={`${styles.projectCard} ${selectedProject === project.id ? styles.projectCardActive : ''}`}
                  onClick={() => handleProjectSelect(project.id)}
                >
                  <div className={styles.projectCardHeader}>
                    <div className={styles.projectIcon}>
                      {selectedProject === project.id ? <FolderOpen size={28} /> : <Folder size={28} />}
                    </div>
                    <div className={styles.projectInfo}>
                      <h3 className={styles.projectName}>{project.projectName}</h3>
                      <div className={styles.projectOwnerInfo}>
                        <div className={styles.ownerAvatar}>
                          {project.ownerPhotoURL ? (
                            <img src={project.ownerPhotoURL} alt={project.ownerName || project.ownerEmail} />
                          ) : (
                            <div className={styles.ownerAvatarPlaceholder}>
                              <User size={20} />
                            </div>
                          )}
                        </div>
                        <div className={styles.ownerDetails}>
                          <span className={styles.ownerName}>
                            {project.ownerName || '이름 없음'}
                          </span>
                          <span className={styles.ownerEmail}>
                            {project.ownerEmail || '이메일 없음'}
                          </span>
                          <code className={styles.ownerUid}>UID: {project.userId.substring(0, 12)}...</code>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className={styles.projectStats}>
                    <div className={styles.stat}>
                      <div className={styles.statIcon} data-color="blue">
                        <FileText size={18} />
                      </div>
                      <div className={styles.statInfo}>
                        <span className={styles.statLabel}>파일</span>
                        <span className={styles.statValue}>{project.designFileCount}</span>
                      </div>
                    </div>
                    {project.isShared && (
                      <div className={styles.stat}>
                        <div className={styles.statIcon} data-color="green">
                          <Share2 size={18} />
                        </div>
                        <div className={styles.statInfo}>
                          <span className={styles.statLabel}>공유</span>
                          <span className={styles.statValue}>활성</span>
                        </div>
                      </div>
                    )}
                    {project.collaboratorCount > 0 && (
                      <div className={styles.stat}>
                        <div className={styles.statIcon} data-color="purple">
                          <Users size={18} />
                        </div>
                        <div className={styles.statInfo}>
                          <span className={styles.statLabel}>협업자</span>
                          <span className={styles.statValue}>{project.collaboratorCount}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className={styles.projectMeta}>
                    <span className={styles.projectId}>ID: {project.id.slice(0, 8)}...</span>
                    {project.createdAt && (
                      <span className={styles.projectDate}>
                        {project.createdAt.toLocaleDateString('ko-KR')}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 디자인 파일 상세 */}
        {selectedProject && (
          <div className={styles.detailSection}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitleWrapper}>
                <FileText size={20} />
                <h2 className={styles.sectionTitle}>
                  디자인 파일 ({designFiles.length})
                </h2>
              </div>
            </div>

            {filesLoading ? (
              <div className={styles.loading}>
                <div className={styles.spinner}></div>
                <p>파일 목록을 불러오는 중...</p>
              </div>
            ) : designFiles.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>
                  <FileText size={56} />
                </div>
                <p>디자인 파일이 없습니다</p>
              </div>
            ) : (
              <div className={styles.filesTable}>
                <table>
                  <thead>
                    <tr>
                      <th>파일명</th>
                      <th>크기</th>
                      <th>생성일</th>
                      <th>수정일</th>
                      <th>작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {designFiles.map(file => (
                      <tr key={file.id}>
                        <td>
                          <div className={styles.fileInfo}>
                            <div className={styles.fileIcon}>
                              <FileText size={20} />
                            </div>
                            <span className={styles.fileName}>{file.fileName}</span>
                          </div>
                        </td>
                        <td className={styles.fileSize}>
                          {formatFileSize(file.fileSize)}
                        </td>
                        <td className={styles.fileDate}>
                          {file.createdAt
                            ? file.createdAt.toLocaleDateString('ko-KR')
                            : '-'}
                        </td>
                        <td className={styles.fileDate}>
                          {file.updatedAt
                            ? file.updatedAt.toLocaleDateString('ko-KR')
                            : '-'}
                        </td>
                        <td>
                          <button
                            className={styles.openButton}
                            onClick={() => navigate(`/configurator?projectId=${file.projectId}&designFileId=${file.id}&designFileName=${encodeURIComponent(file.fileName)}`)}
                            title="에디터에서 열기"
                          >
                            <ExternalLink size={16} />
                            열기
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Projects;
