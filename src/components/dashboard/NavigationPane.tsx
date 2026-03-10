import React, { useState, useCallback, useEffect } from 'react';
import { Folder, Clock, Share2, Trash2, ChevronRight, ChevronDown, Users, Plus, Home, FileText } from 'lucide-react';
import { FcFolder } from 'react-icons/fc';
import { RxDashboard } from 'react-icons/rx';
import { useAuth } from '@/auth/AuthProvider';
import { loadFolderData, getDesignFiles } from '@/firebase/projects';
import type { ProjectSummary, DesignFileSummary } from '@/firebase/types';
import type { FolderData } from '@/firebase/projects';
import type { QuickAccessMenu, ExplorerItem } from '@/hooks/dashboard/types';
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
  menuCounts?: Partial<Record<QuickAccessMenu, number>>;
  onItemContextMenu?: (e: React.MouseEvent, item: ExplorerItem) => void;
  autoExpandProjectId?: string | null;
  onGoHome?: () => void;
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
  menuCounts,
  onItemContextMenu,
  autoExpandProjectId,
  onGoHome,
}) => {
  const { user } = useAuth();
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (autoExpandProjectId) initial.add(autoExpandProjectId);
    return initial;
  });
  const [paneWidth, setPaneWidth] = useState(240);
  const [isResizing, setIsResizing] = useState(false);

  // 폴더 데이터 (Firebase에서 직접 로드)
  const [localFolders, setLocalFolders] = useState<{ [projectId: string]: FolderData[] }>({});
  // 프로젝트별 디자인 파일 목록
  const [designFileMap, setDesignFileMap] = useState<{ [projectId: string]: DesignFileSummary[] }>({});

  // 프로젝트별 디자인 파일 로드
  const loadDesignFiles = useCallback(async (projectId: string) => {
    try {
      const { designFiles } = await getDesignFiles(projectId);
      setDesignFileMap(prev => ({
        ...prev,
        [projectId]: designFiles
      }));
    } catch {
      // ignore
    }
  }, []);

  // 프로젝트 확장 시 폴더 + 디자인 파일 로드
  const loadProjectData = useCallback(async (projectId: string) => {
    if (!user) return;

    try {
      const [folderResult] = await Promise.all([
        loadFolderData(projectId),
        loadDesignFiles(projectId),
      ]);
      if (folderResult.folders) {
        setLocalFolders(prev => ({
          ...prev,
          [projectId]: folderResult.folders
        }));
      }
    } catch (error) {
      console.error('프로젝트 데이터 로드 에러:', error);
    }
  }, [user, loadDesignFiles]);

  // 프로젝트 목록 변경 시 모든 프로젝트 자동 확장 + 데이터 로드
  useEffect(() => {
    if (projects.length === 0) return;
    const newExpanded = new Set<string>();
    projects.forEach(project => {
      newExpanded.add(project.id);
      loadProjectData(project.id);
    });
    setExpandedProjects(newExpanded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

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
        {/* 메인 화면 */}
        {onGoHome && (
          <div className={styles.section}>
            <button
              className={styles.menuItem}
              onClick={onGoHome}
            >
              <span className={styles.menuIcon}><Home size={16} /></span>
              <span className={styles.menuLabel}>메인 화면</span>
            </button>
          </div>
        )}

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
              {menuCounts?.[item.key] !== undefined && menuCounts[item.key]! > 0 && (
                <span className={styles.menuBadge}>{menuCounts[item.key]}</span>
              )}
            </button>
          ))}
        </div>

        <hr className={styles.divider} />

        {/* 프로젝트 트리 (파일트리 스타일) */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            {quickAccessItems.find(item => item.key === activeMenu)?.label || '프로젝트'}
          </div>
          {projects.map(project => {
            const isExpanded = expandedProjects.has(project.id);
            const isSelected = currentProjectId === project.id && !currentFolderId;
            const projectLocalFolders = localFolders[project.id] || [];
            const projectDesignFiles = designFileMap[project.id] || [];
            const fileCount = projectDesignFiles.length;
            // 폴더에 속하지 않은 루트 디자인 파일
            const rootDesignFiles = projectDesignFiles.filter(f => !f.folderId);
            return (
              <div key={project.id}>
                <button
                  className={`${styles.treeItem} ${isSelected ? styles.treeItemActive : ''}`}
                  onClick={() => {
                    onNavigate(project.id, null, project.title);
                    if (!isExpanded) toggleProject(project.id);
                  }}
                  onContextMenu={(e) => {
                    if (onItemContextMenu) {
                      e.preventDefault();
                      e.stopPropagation();
                      onItemContextMenu(e, {
                        id: project.id,
                        name: project.title,
                        type: 'project',
                        updatedAt: project.updatedAt,
                      });
                    }
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
                  {fileCount > 0 && (
                    <span className={styles.treeBadge}>
                      {fileCount}
                    </span>
                  )}
                </button>

                {/* 확장 시: 폴더 + 디자인 파일 표시 */}
                {isExpanded && (projectLocalFolders.length > 0 || rootDesignFiles.length > 0) && (
                  <div className={styles.treeChildren}>
                    {/* 폴더 */}
                    {projectLocalFolders.map(folder => {
                      const isFolderSelected = currentProjectId === project.id && currentFolderId === folder.id;
                      const folderFiles = projectDesignFiles.filter(f => f.folderId === folder.id);
                      const isFolderExpanded = expandedFolders.has(folder.id);

                      return (
                        <div key={folder.id}>
                          <button
                            className={`${styles.treeItem} ${styles.treeItemNested} ${
                              isFolderSelected ? styles.treeItemActive : ''
                            }`}
                            onClick={() => {
                              onNavigate(project.id, folder.id, folder.name);
                              setExpandedFolders(prev => {
                                const next = new Set(prev);
                                if (next.has(folder.id)) next.delete(folder.id);
                                else next.add(folder.id);
                                return next;
                              });
                            }}
                            onContextMenu={(e) => {
                              if (onItemContextMenu) {
                                e.preventDefault();
                                e.stopPropagation();
                                onItemContextMenu(e, {
                                  id: folder.id,
                                  name: folder.name,
                                  type: 'folder',
                                  projectId: project.id,
                                });
                              }
                            }}
                          >
                            <span className={styles.expandIcon}>
                              {isFolderExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            </span>
                            <FcFolder size={14} className={styles.folderIcon} />
                            <span className={styles.treeLabel} title={folder.name}>
                              {folder.name}
                            </span>
                            {folderFiles.length > 0 && (
                              <span className={styles.treeBadge}>{folderFiles.length}</span>
                            )}
                          </button>
                          {/* 폴더 내 디자인 파일 — 폴더 펼침 시에만 */}
                          {isFolderExpanded && folderFiles.map(file => (
                            <button
                              key={file.id}
                              className={`${styles.treeItem} ${styles.treeItemDeep}`}
                              onClick={() => onNavigate(project.id, folder.id, file.name)}
                              title={`${file.name} (${file.spaceSize.width}×${file.spaceSize.height}mm)`}
                            >
                              <span style={{ width: 28 }} />
                              <FileText size={13} className={styles.fileIcon} />
                              <span className={styles.treeLabel}>{file.name}</span>
                            </button>
                          ))}
                        </div>
                      );
                    })}

                    {/* 루트 디자인 파일 (폴더에 속하지 않은 파일) */}
                    {rootDesignFiles.map(file => (
                      <button
                        key={file.id}
                        className={`${styles.treeItem} ${styles.treeItemNested}`}
                        onClick={() => onNavigate(project.id, null, file.name)}
                        title={`${file.name} (${file.spaceSize.width}×${file.spaceSize.height}mm)`}
                      >
                        <span style={{ width: 14 }} />
                        <FileText size={13} className={styles.fileIcon} />
                        <span className={styles.treeLabel}>{file.name}</span>
                      </button>
                    ))}
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
