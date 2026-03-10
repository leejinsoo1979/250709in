import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Folder, Clock, Share2, Trash2, ChevronRight, ChevronDown, Users, Plus } from 'lucide-react';
import { FcFolder } from 'react-icons/fc';
import { RxDashboard } from 'react-icons/rx';
import { useAuth } from '@/auth/AuthProvider';
import { getDesignFiles, loadFolderData } from '@/firebase/projects';
import type { ProjectSummary, DesignFileSummary } from '@/firebase/types';
import type { FolderData } from '@/firebase/projects';
import type { QuickAccessMenu } from '@/hooks/dashboard/types';
import styles from './NavigationPane.module.css';

interface NavigationPaneProps {
  projects: ProjectSummary[];
  folders: { [projectId: string]: FolderData[] };
  currentProjectId: string | null;
  currentFolderId: string | null;
  activeMenu: QuickAccessMenu;
  onNavigate: (projectId: string | null, folderId?: string | null, label?: string) => void;
  onMenuChange: (menu: QuickAccessMenu) => void;
  onCreateProject?: () => void;
}

const NavigationPane: React.FC<NavigationPaneProps> = ({
  projects,
  folders: _folders,
  currentProjectId,
  currentFolderId,
  activeMenu,
  onNavigate,
  onMenuChange,
  onCreateProject,
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [paneWidth, setPaneWidth] = useState(240);
  const [isResizing, setIsResizing] = useState(false);

  // 디자인 파일 데이터 (프로젝트별)
  const [designFiles, setDesignFiles] = useState<{ [projectId: string]: DesignFileSummary[] }>({});
  // 폴더 데이터 (props.folders와 별도로 Firebase에서 직접 로드)
  const [localFolders, setLocalFolders] = useState<{ [projectId: string]: FolderData[] }>({});

  // 프로젝트 확장 시 디자인 파일 + 폴더 로드
  const loadProjectData = useCallback(async (projectId: string) => {
    if (!user) return;

    try {
      // 디자인 파일 로드
      const result = await getDesignFiles(projectId);
      if (result.designFiles) {
        setDesignFiles(prev => ({
          ...prev,
          [projectId]: result.designFiles.filter(df => df && df.id && df.name)
        }));
      }

      // 폴더 데이터 로드
      const { folders: folderData } = await loadFolderData(projectId);
      if (folderData) {
        setLocalFolders(prev => ({
          ...prev,
          [projectId]: folderData
        }));
      }
    } catch (error) {
      console.error('프로젝트 데이터 로드 에러:', error);
    }
  }, [user]);

  // 프로젝트 확장/축소
  const toggleProject = useCallback((projectId: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
        // 확장 시 데이터 로드
        loadProjectData(projectId);
      }
      return next;
    });
  }, [loadProjectData]);

  // 폴더 확장/축소
  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  // 디자인 파일 클릭 → 에디터로 이동
  const handleDesignFileClick = useCallback((projectId: string, designFileId: string, designFileName: string) => {
    navigate(`/configurator?projectId=${projectId}&designFileId=${designFileId}&designFileName=${encodeURIComponent(designFileName)}`);
  }, [navigate]);

  // 리사이즈 핸들
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = paneWidth;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(180, Math.min(350, startWidth + e.clientX - startX));
      setPaneWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [paneWidth]);

  const quickAccessItems: { key: QuickAccessMenu; label: string; icon: React.ReactNode }[] = [
    { key: 'in-progress', label: '진행중 프로젝트', icon: <Clock size={16} /> },
    { key: 'completed', label: '완료된 프로젝트', icon: <Folder size={16} /> },
    { key: 'shared-with-me', label: '공유받은 파일', icon: <Share2 size={16} /> },
    { key: 'shared-by-me', label: '공유한 파일', icon: <Users size={16} /> },
    { key: 'trash', label: '휴지통', icon: <Trash2 size={16} /> },
  ];

  // 프로젝트의 폴더에 속하지 않는 루트 레벨 디자인 파일 필터
  const getRootDesignFiles = (projectId: string): DesignFileSummary[] => {
    const projectDesignFiles = designFiles[projectId] || [];
    const projectLocalFolders = localFolders[projectId] || [];
    const folderChildIds = new Set(
      projectLocalFolders.flatMap(f => f.children.map(c => c.id))
    );
    return projectDesignFiles.filter(df => !folderChildIds.has(df.id));
  };

  return (
    <div className={styles.pane} style={{ width: paneWidth }}>
      {/* 상단 툴바 */}
      {onCreateProject && (
        <div className={styles.paneToolbar}>
          <button className={styles.paneCreateBtn} onClick={onCreateProject}>
            <Plus size={16} />
            <span>새 프로젝트</span>
          </button>
        </div>
      )}

      <div className={styles.content}>
        {/* 빠른 액세스 */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>빠른 액세스</div>
          {quickAccessItems.map(item => (
            <button
              key={item.key}
              className={`${styles.menuItem} ${
                activeMenu === item.key && !currentProjectId ? styles.menuItemActive : ''
              }`}
              onClick={() => {
                onMenuChange(item.key);
                onNavigate(null, null, item.label);
              }}
            >
              <span className={styles.menuIcon}>{item.icon}</span>
              <span className={styles.menuLabel}>{item.label}</span>
            </button>
          ))}
        </div>

        <hr className={styles.divider} />

        {/* 프로젝트 트리 (파일트리 스타일) */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>프로젝트</div>
          {projects.map(project => {
            const isExpanded = expandedProjects.has(project.id);
            const isSelected = currentProjectId === project.id && !currentFolderId;
            const projectLocalFolders = localFolders[project.id] || [];
            const projectDesignFiles = designFiles[project.id] || [];
            return (
              <div key={project.id}>
                <button
                  className={`${styles.treeItem} ${isSelected ? styles.treeItemActive : ''}`}
                  onClick={() => {
                    onNavigate(project.id, null, project.title);
                    if (!isExpanded) toggleProject(project.id);
                  }}
                >
                  <span
                    className={styles.expandIcon}
                    onClick={e => {
                      e.stopPropagation();
                      toggleProject(project.id);
                    }}
                  >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </span>
                  <RxDashboard size={16} className={styles.projectIcon} />
                  <span className={styles.treeLabel} title={project.title}>
                    {project.title}
                  </span>
                  {isExpanded && (projectDesignFiles.length > 0 || projectLocalFolders.length > 0) && (
                    <span className={styles.treeBadge}>
                      {projectDesignFiles.length + projectLocalFolders.length}
                    </span>
                  )}
                </button>

                {/* 확장 시: 폴더 + 디자인 파일 */}
                {isExpanded && (
                  <div className={styles.treeChildren}>
                    {/* 폴더들 */}
                    {projectLocalFolders.map(folder => {
                      const isFolderExpanded = expandedFolders.has(folder.id);
                      const isFolderSelected = currentProjectId === project.id && currentFolderId === folder.id;

                      return (
                        <div key={folder.id}>
                          <button
                            className={`${styles.treeItem} ${styles.treeItemNested} ${
                              isFolderSelected ? styles.treeItemActive : ''
                            }`}
                            onClick={() => {
                              onNavigate(project.id, folder.id, folder.name);
                              if (!isFolderExpanded) toggleFolder(folder.id);
                            }}
                          >
                            <span
                              className={styles.expandIcon}
                              onClick={e => {
                                e.stopPropagation();
                                toggleFolder(folder.id);
                              }}
                            >
                              {folder.children.length > 0 ? (
                                isFolderExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
                              ) : (
                                <span style={{ width: 12 }} />
                              )}
                            </span>
                            <FcFolder size={14} className={styles.folderIcon} />
                            <span className={styles.treeLabel} title={folder.name}>
                              {folder.name}
                            </span>
                            {folder.children.length > 0 && (
                              <span className={styles.treeBadge}>{folder.children.length}</span>
                            )}
                          </button>

                          {/* 폴더 내 디자인 파일 */}
                          {isFolderExpanded && folder.children.length > 0 && (
                            <div className={styles.treeChildren}>
                              {folder.children.map(child => (
                                <button
                                  key={child.id}
                                  className={`${styles.treeItem} ${styles.treeItemDeep}`}
                                  onClick={() => handleDesignFileClick(project.id, child.id, child.name)}
                                >
                                  <div className={styles.designIcon}>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                                      <path d="M12 19l7-7 3 3-7 7-3-3z"/>
                                      <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
                                      <path d="M2 2l7.586 7.586"/>
                                      <circle cx="11" cy="11" r="2"/>
                                    </svg>
                                  </div>
                                  <span className={styles.treeLabel} title={child.name}>
                                    {child.name}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* 루트 레벨 디자인 파일 (폴더에 속하지 않은 것) */}
                    {getRootDesignFiles(project.id).map(df => (
                      <button
                        key={df.id}
                        className={`${styles.treeItem} ${styles.treeItemNested}`}
                        onClick={() => handleDesignFileClick(project.id, df.id, df.name)}
                      >
                        <span style={{ width: 14 }} />
                        <div className={styles.designIcon}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                            <path d="M12 19l7-7 3 3-7 7-3-3z"/>
                            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
                            <path d="M2 2l7.586 7.586"/>
                            <circle cx="11" cy="11" r="2"/>
                          </svg>
                        </div>
                        <span className={styles.treeLabel} title={df.name}>
                          {df.name}
                        </span>
                      </button>
                    ))}

                    {/* 데이터 로딩 중이거나 비어있을 때 */}
                    {projectLocalFolders.length === 0 && getRootDesignFiles(project.id).length === 0 && (
                      <div className={`${styles.treeItem} ${styles.treeItemNested}`} style={{ color: 'var(--theme-text-muted)', cursor: 'default' }}>
                        <span style={{ width: 14 }} />
                        <span style={{ fontSize: 12 }}>디자인 파일 없음</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 리사이즈 핸들 */}
      <div
        className={`${styles.resizeHandle} ${isResizing ? styles.resizeActive : ''}`}
        onMouseDown={handleResizeStart}
      />
    </div>
  );
};

export default NavigationPane;
