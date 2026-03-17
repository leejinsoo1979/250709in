import React, { useMemo, useState } from 'react';
import { MdOutlinePending, MdCheckCircleOutline } from 'react-icons/md';
import { TfiShare, TfiShareAlt } from 'react-icons/tfi';
import { IoFileTrayStackedOutline, IoBanOutline } from 'react-icons/io5';
import { PiFolderFill } from 'react-icons/pi';
import { VscServerProcess } from 'react-icons/vsc';
import { LuFileBox } from 'react-icons/lu';
import { RxDashboard } from 'react-icons/rx';
import { FcFolder } from 'react-icons/fc';
import {
  TrashIcon, PlusIcon, SettingsIcon, LogOutIcon, UserIcon, SearchIcon,
} from '@/components/common/Icons';
import { useAuth } from '@/auth/AuthProvider';
import { useAdmin } from '@/hooks/useAdmin';
import { useNavigate } from 'react-router-dom';
import { signOutUser } from '@/firebase/auth';
import Logo from '@/components/common/Logo';
import SimpleProjectDropdown from '@/components/common/SimpleProjectDropdown';
import ThumbnailImage from '@/components/common/ThumbnailImage';
import { NotificationCenter } from '@/components/NotificationCenter';
import SettingsPanel from '@/components/common/SettingsPanel';
import type { ExplorerItem, QuickAccessMenu } from '@/hooks/dashboard/types';
import type { UseExplorerNavigationReturn, UseExplorerDataReturn, UseExplorerActionsReturn } from '@/hooks/dashboard/types';
import type { ProjectSummary } from '@/firebase/types';
import styles from './ClassicDashboard.module.css';

interface ClassicDashboardProps {
  nav: UseExplorerNavigationReturn;
  data: UseExplorerDataReturn;
  actions: UseExplorerActionsReturn;
  onItemDoubleClick: (item: ExplorerItem) => void;
  onItemContextMenu: (e: React.MouseEvent, item: ExplorerItem) => void;
  onCreateProject: () => void;
  onCreateDesign: () => void;
  onOpenEditor?: (item: ExplorerItem) => void;
  onBlankContextMenu?: (e: React.MouseEvent) => void;
}

const menuItems: { key: QuickAccessMenu; label: string; icon: React.ReactNode }[] = [
  { key: 'in-progress', label: '진행중 프로젝트', icon: <MdOutlinePending size={20} /> },
  { key: 'completed', label: '완료된 프로젝트', icon: <MdCheckCircleOutline size={20} /> },
  { key: 'shared-by-me', label: '공유한 파일', icon: <TfiShare size={18} /> },
  { key: 'shared-with-me', label: '공유받은 파일', icon: <TfiShareAlt size={18} /> },
  { key: 'trash', label: '휴지통', icon: <TrashIcon size={20} /> },
];

const ClassicDashboard: React.FC<ClassicDashboardProps> = ({
  nav,
  data,
  actions: _actions,
  onItemDoubleClick,
  onItemContextMenu,
  onCreateProject,
  onCreateDesign,
  onOpenEditor,
  onBlankContextMenu,
}) => {
  const { user } = useAuth();
  const { isAdmin } = useAdmin(user);
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');
  const [isFileTreeCollapsed, setIsFileTreeCollapsed] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);

  // 프로젝트 목록 (메뉴별 필터링)
  const treeProjects = useMemo(() => {
    if (nav.activeMenu === 'in-progress') {
      return data.projects.filter(p => !p.status || p.status === 'in_progress');
    }
    if (nav.activeMenu === 'completed') {
      return data.projects.filter(p => p.status === 'completed');
    }
    if (nav.activeMenu === 'shared-by-me') return data.sharedByMeProjects;
    if (nav.activeMenu === 'shared-with-me') return data.sharedWithMeProjects;
    return data.projects;
  }, [nav.activeMenu, data.projects, data.sharedByMeProjects, data.sharedWithMeProjects]);

  // 현재 선택된 프로젝트
  const selectedProject = useMemo(() => {
    if (!nav.currentProjectId) return null;
    return [...data.projects, ...data.sharedByMeProjects, ...data.sharedWithMeProjects]
      .find(p => p.id === nav.currentProjectId) || null;
  }, [nav.currentProjectId, data.projects, data.sharedByMeProjects, data.sharedWithMeProjects]);

  // 메뉴별 카운트
  const menuCounts = useMemo(() => ({
    'in-progress': data.projects.filter(p => !p.status || p.status === 'in_progress').length,
    'completed': data.projects.filter(p => p.status === 'completed').length,
    'shared-by-me': data.sharedByMeProjects.length,
    'shared-with-me': data.sharedWithMeProjects.length,
    'trash': 0,
  }), [data.projects, data.sharedByMeProjects, data.sharedWithMeProjects]);

  // 검색 + 정렬
  const filteredItems = useMemo(() => {
    let result = data.currentItems;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(item => item.name.toLowerCase().includes(term));
    }
    result = [...result].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name, 'ko');
      const aTime = a.updatedAt?.toMillis?.() || 0;
      const bTime = b.updatedAt?.toMillis?.() || 0;
      return bTime - aTime;
    });
    return result;
  }, [data.currentItems, searchTerm, sortBy]);

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '날짜 정보 없음';
    const date = timestamp.toDate ? timestamp.toDate() : (timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp));
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const toggleProjectExpansion = (projectId: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const handleProjectSelect = (projectId: string) => {
    const project = [...data.projects, ...data.sharedByMeProjects, ...data.sharedWithMeProjects]
      .find(p => p.id === projectId);
    if (project) {
      nav.navigateTo(project.id, null, project.title);
      if (!expandedProjects.has(projectId)) {
        setExpandedProjects(prev => new Set(prev).add(projectId));
      }
    }
  };

  const handleLogout = async () => {
    await signOutUser();
    navigate('/auth');
  };

  // 프로젝트 트리 표시 여부
  const showProjectTree = (nav.activeMenu === 'all' || nav.activeMenu === 'in-progress' || nav.activeMenu === 'completed') && treeProjects.length > 0;

  // 브레드크럼
  const breadcrumbPath = useMemo(() => {
    const path: { label: string; type: 'root' | 'project' | 'folder' }[] = [];
    if (nav.activeMenu === 'in-progress') path.push({ label: '진행중 프로젝트', type: 'root' });
    else if (nav.activeMenu === 'completed') path.push({ label: '완료된 프로젝트', type: 'root' });
    else if (nav.activeMenu === 'shared-by-me') path.push({ label: '공유한 프로젝트', type: 'root' });
    else if (nav.activeMenu === 'shared-with-me') path.push({ label: '공유받은 프로젝트', type: 'root' });
    else if (nav.activeMenu === 'trash') path.push({ label: '휴지통', type: 'root' });
    else path.push({ label: '전체 프로젝트', type: 'root' });

    if (selectedProject) path.push({ label: selectedProject.title, type: 'project' });
    if (nav.currentFolderId) {
      const folders = data.folders[nav.currentProjectId!] || [];
      const folder = folders.find(f => f.id === nav.currentFolderId);
      if (folder) path.push({ label: folder.name, type: 'folder' });
    }
    return path;
  }, [nav.activeMenu, selectedProject, nav.currentFolderId, nav.currentProjectId, data.folders]);

  const getBreadcrumbIcon = (type: 'root' | 'project' | 'folder') => {
    if (type === 'root') return <MdOutlinePending size={14} />;
    if (type === 'project') return <RxDashboard size={14} />;
    return <FcFolder size={14} />;
  };

  return (
    <div className={styles.dashboard} data-menu={nav.activeMenu}>
      {/* ══════ 좌측 사이드바 ══════ */}
      <aside className={styles.sidebar}>
        {/* 로고 영역 */}
        <div className={styles.logoSection}>
          <div
            className={styles.logo}
            onClick={() => {
              nav.setActiveMenu('in-progress');
              nav.navigateToRoot();
            }}
            style={{ cursor: 'pointer' }}
          >
            <Logo size="large" />
          </div>
        </div>

        {/* 사이드바 서브헤더 - 프로젝트 생성 버튼 */}
        <div className={styles.sidebarSubHeader}>
          <button className={styles.createBtn} onClick={onCreateProject}>
            <PlusIcon size={14} />
            프로젝트 생성
          </button>
        </div>

        {/* 네비게이션 메뉴 */}
        <nav className={styles.navSection}>
          {menuItems.map(item => (
            <div
              key={item.key}
              className={`${styles.navItem} ${
                nav.activeMenu === item.key && !nav.currentProjectId ? styles.active : ''
              }`}
              onClick={() => {
                nav.setActiveMenu(item.key);
                nav.navigateTo(null, null, item.label);
              }}
            >
              <div className={styles.navItemIcon}>{item.icon}</div>
              <span>{item.label}</span>
              <span className={styles.navItemCount}>
                {menuCounts[item.key as keyof typeof menuCounts] ?? 0}
              </span>
            </div>
          ))}
        </nav>

        {/* 설정 섹션 */}
        <div className={styles.settingsSection}>
          <div
            className={styles.settingsItem}
            onClick={() => setIsSettingsPanelOpen(true)}
            style={{ cursor: 'pointer' }}
          >
            <div className={styles.navItemIcon}>
              <SettingsIcon size={20} />
            </div>
            <span>설정</span>
          </div>
          {user ? (
            <div className={styles.settingsItem} onClick={handleLogout}>
              <div className={styles.navItemIcon}>
                <LogOutIcon size={20} />
              </div>
              <span>로그아웃</span>
            </div>
          ) : (
            <div className={styles.settingsItem} onClick={() => navigate('/auth')}>
              <div className={styles.navItemIcon}>
                <UserIcon size={20} />
              </div>
              <span>로그인</span>
            </div>
          )}
        </div>
      </aside>

      {/* ══════ 메인 콘텐츠 ══════ */}
      <main className={styles.main}>
        {/* 상단 헤더 */}
        <header className={styles.header}>
          <div className={styles.headerLeft} />
          <div className={styles.headerRight}>
            <div className={styles.headerActions}>
              {isAdmin && (
                <button
                  className={styles.adminButton}
                  onClick={() => navigate('/admin')}
                  title="관리자 페이지"
                >
                  <VscServerProcess size={20} />
                  <span>관리자</span>
                </button>
              )}
              <NotificationCenter />
            </div>
            <div className={styles.userProfile}>
              <div className={styles.userProfileAvatar}>
                {user?.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt="프로필"
                    referrerPolicy="no-referrer"
                    style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                  />
                ) : (
                  <UserIcon size={14} />
                )}
              </div>
              <span className={styles.userProfileName}>
                {user ? (user.displayName || user.email?.split('@')[0] || '사용자') : '게스트'}
              </span>
            </div>
          </div>
        </header>

        {/* 서브헤더 */}
        <div className={styles.subHeader}>
          <div className={styles.subHeaderContent}>
            <div className={styles.subHeaderLeft}>
              {(nav.activeMenu === 'in-progress' || nav.activeMenu === 'all') && nav.currentProjectId && (
                <button className={styles.createDesignHeaderBtn} onClick={onCreateDesign}>
                  <PlusIcon size={14} />
                  디자인 생성
                </button>
              )}
              {nav.activeMenu === 'completed' && !nav.currentProjectId && (
                <h1 className={styles.subHeaderTitle}>완료된 프로젝트</h1>
              )}
              {nav.activeMenu === 'trash' && (
                <h1 className={styles.subHeaderTitle}>휴지통</h1>
              )}
            </div>

            <div className={styles.subHeaderActions}>
              {/* 검색 */}
              <div className={styles.searchContainer}>
                <div className={styles.searchIconWrap}>
                  <SearchIcon size={16} />
                </div>
                <input
                  type="text"
                  placeholder="프로젝트 검색..."
                  className={styles.searchInput}
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button
                    className={styles.searchClearButton}
                    onClick={() => setSearchTerm('')}
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* 정렬 */}
              <div style={{ position: 'relative' }}>
                <button
                  className={styles.sortButton}
                  onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M3 6h10M5 10h6M7 14h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
                  </svg>
                  <span>{sortBy === 'date' ? '최신순' : '이름순'}</span>
                </button>
                {sortDropdownOpen && (
                  <div className={styles.sortDropdownMenu}>
                    <button
                      className={`${styles.sortOption} ${sortBy === 'date' ? styles.active : ''}`}
                      onClick={() => { setSortBy('date'); setSortDropdownOpen(false); }}
                    >
                      최신순
                    </button>
                    <button
                      className={`${styles.sortOption} ${sortBy === 'name' ? styles.active : ''}`}
                      onClick={() => { setSortBy('name'); setSortDropdownOpen(false); }}
                    >
                      이름순
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 콘텐츠 영역 (프로젝트 트리 + 디자인 그리드) */}
        <div className={styles.content}>
          {/* 프로젝트 트리 */}
          {showProjectTree && (
            <aside className={`${styles.projectTree} ${isFileTreeCollapsed ? styles.collapsed : ''}`}>
              <div className={styles.treeHeader}>
                <button
                  className={styles.treeToggleButton}
                  onClick={() => setIsFileTreeCollapsed(!isFileTreeCollapsed)}
                >
                  <span className={`${styles.toggleIcon} ${isFileTreeCollapsed ? styles.collapsedIcon : ''}`}>
                    ◀
                  </span>
                </button>
                <div className={styles.projectSelectorContainer}>
                  <SimpleProjectDropdown
                    projects={treeProjects as ProjectSummary[]}
                    currentProject={selectedProject as ProjectSummary | null}
                    onProjectSelect={(project) => handleProjectSelect(project.id)}
                  />
                </div>
              </div>

              <div className={styles.treeContent}>
                {treeProjects.length > 0 ? (
                  <div>
                    {treeProjects
                      .filter(project => !nav.currentProjectId || project.id === nav.currentProjectId)
                      .map(project => {
                        const isExpanded = expandedProjects.has(project.id);
                        const isSelected = nav.currentProjectId === project.id;
                        const projectFolders = data.folders[project.id] || [];
                        const designFiles = data.projectDesignFiles[project.id] || [];
                        const hasContent = projectFolders.length > 0 || designFiles.length > 0;

                        return (
                          <div key={project.id}>
                            <div
                              className={`${styles.treeItem} ${isSelected ? styles.active : ''}`}
                              onClick={() => {
                                handleProjectSelect(project.id);
                              }}
                            >
                              {hasContent && (
                                <div
                                  className={`${styles.treeToggleArrow} ${isExpanded ? styles.expanded : ''}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleProjectExpansion(project.id);
                                  }}
                                >
                                  ▶
                                </div>
                              )}
                              <div className={styles.treeItemIcon}>
                                <IoFileTrayStackedOutline size={16} />
                              </div>
                              <span>{project.title}</span>
                              {designFiles.filter((df: any) => !df.isDeleted).length > 0 && (
                                <span className={styles.treeItemCount}>{designFiles.filter((df: any) => !df.isDeleted).length}</span>
                              )}
                              <div className={styles.treeItemActions}>
                                <button
                                  className={styles.treeItemActionBtn}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const item: ExplorerItem = {
                                      id: project.id,
                                      name: project.title,
                                      type: 'project',
                                      projectId: project.id,
                                    };
                                    onItemContextMenu(e, item);
                                  }}
                                >
                                  ⋯
                                </button>
                              </div>
                            </div>

                            {isExpanded && (
                              <div className={styles.projectChildren}>
                                {/* 폴더 목록 */}
                                {projectFolders.map(folder => (
                                  <div key={folder.id}>
                                    <div
                                      className={styles.treeItem}
                                      onClick={() => nav.navigateTo(project.id, folder.id, folder.name)}
                                    >
                                      <div className={styles.treeItemIcon}>
                                        <PiFolderFill size={16} style={{ color: 'var(--theme-primary, #10b981)' }} />
                                      </div>
                                      <span>{folder.name}</span>
                                      {(() => {
                                        const activeCount = designFiles.filter((df: any) => df.folderId === folder.id && !df.isDeleted).length;
                                        return activeCount > 0 ? (
                                          <span className={styles.treeItemCount}>{activeCount}</span>
                                        ) : null;
                                      })()}
                                    </div>
                                  </div>
                                ))}

                                {/* 디자인 파일은 트리에 표시하지 않음 (폴더까지만) */}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <div className={styles.treeItem}>
                    <span style={{ color: '#999', fontSize: '14px' }}>
                      {user ? '프로젝트가 없습니다' : '로그인이 필요합니다'}
                    </span>
                  </div>
                )}
              </div>
            </aside>
          )}

          {/* 디자인 영역 */}
          <section className={styles.designArea}>
            {/* 브레드크럼 */}
            <div className={styles.breadcrumb}>
              {breadcrumbPath.map((item, index) => (
                <React.Fragment key={index}>
                  <span
                    className={`${styles.breadcrumbItem} ${index === breadcrumbPath.length - 1 ? styles.activeBreadcrumb : ''}`}
                    onClick={() => {
                      if (index === 0) {
                        nav.navigateToRoot();
                      } else if (index === 1 && selectedProject) {
                        nav.navigateTo(selectedProject.id, null, selectedProject.title);
                      }
                    }}
                  >
                    {getBreadcrumbIcon(item.type)}
                    {item.label}
                  </span>
                  {index < breadcrumbPath.length - 1 && (
                    <span className={styles.breadcrumbSeparator}>/</span>
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* 디자인 그리드 */}
            <div
              className={styles.designGrid}
              onContextMenu={(e) => {
                if ((e.target as HTMLElement).closest(`.${styles.designCard}, .${styles.folderCard}`)) return;
                if (onBlankContextMenu) onBlankContextMenu(e);
              }}
            >
              {data.isLoading ? (
                <>
                  {[1, 2, 3, 4].map(i => (
                    <div key={`skeleton-${i}`} className={styles.designCard} style={{ opacity: 0.3, pointerEvents: 'none' }}>
                      <div className={styles.cardThumbnail}>
                        <div style={{
                          width: '100%', height: '100%',
                          background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
                        }} />
                      </div>
                      <div className={styles.cardInfo}>
                        <div style={{ width: '60%', height: '16px', background: '#f0f0f0', borderRadius: '4px' }} />
                        <div style={{ width: '30%', height: '12px', background: '#f0f0f0', borderRadius: '4px', marginTop: '4px' }} />
                      </div>
                    </div>
                  ))}
                </>
              ) : filteredItems.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14,2 14,8 20,8" />
                    </svg>
                  </div>
                  <h3 className={styles.emptyTitle}>
                    {nav.currentProjectId ? '디자인이 없습니다' : '프로젝트가 없습니다'}
                  </h3>
                  <p className={styles.emptyDescription}>
                    {nav.currentProjectId
                      ? '새로운 디자인을 만들어 시작하세요'
                      : '새로운 프로젝트를 만들어 시작하세요'}
                  </p>
                  <button
                    className={styles.emptyButton}
                    onClick={nav.currentProjectId ? onCreateDesign : onCreateProject}
                  >
                    {nav.currentProjectId ? '디자인 만들기' : '프로젝트 만들기'}
                  </button>
                </div>
              ) : (
                <>
                  {/* 폴더 카드 */}
                  {filteredItems.filter(item => item.type === 'folder').map(item => (
                    <div
                      key={item.id}
                      className={`${styles.designCard} ${styles.folderCard}`}
                      onClick={() => onItemDoubleClick(item)}
                      onContextMenu={e => onItemContextMenu(e, item)}
                    >
                      <div className={styles.cardThumbnail}>
                        <div className={styles.folderIconLarge}>
                          <PiFolderFill size={144} style={{ color: 'var(--theme-primary, #10b981)' }} />
                        </div>
                      </div>
                      <div className={styles.cardInfo}>
                        <div className={styles.cardTitle}>{item.name}</div>
                        <div className={styles.cardMeta}>
                          <div className={styles.cardDate}>{formatDate(item.updatedAt)}</div>
                        </div>
                      </div>
                      <button
                        className={styles.cardActionButton}
                        onClick={e => { e.stopPropagation(); onItemContextMenu(e, item); }}
                      >
                        ⋯
                      </button>
                    </div>
                  ))}

                  {/* 프로젝트/디자인 카드 */}
                  {filteredItems.filter(item => item.type !== 'folder').map(item => (
                    <div
                      key={item.id}
                      className={styles.designCard}
                      onClick={() => onItemDoubleClick(item)}
                      onContextMenu={e => onItemContextMenu(e, item)}
                    >
                      <div className={styles.cardThumbnail}>
                        {item.type === 'design' && (!item.furnitureCount || item.furnitureCount === 0) ? (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: 'var(--theme-background-secondary, #1a1a1a)', color: 'var(--theme-text-muted, #666)' }}>
                            <IoBanOutline size={20} />
                          </div>
                        ) : item.type === 'design' && item.thumbnail ? (
                          <img src={item.thumbnail} alt={item.name} className={styles.thumbnailImage} />
                        ) : item.type === 'project' ? (
                          <div className={styles.projectThumbnailGrid}>
                            {(() => {
                              const designFiles = data.projectDesignFiles[item.id] || [];
                              if (designFiles.length === 0) {
                                return (
                                  <div className={styles.emptyThumbnailState}>
                                    <LuFileBox size={48} strokeWidth={1} />
                                    <span>생성된 파일이 없습니다</span>
                                  </div>
                                );
                              }
                              const displayItems = designFiles.slice(0, 4);
                              return (
                                <div className={styles.thumbnailGrid}>
                                  {displayItems.map(df => (
                                    <div key={df.id} className={styles.thumbnailItem}>
                                      <ThumbnailImage
                                        project={{ id: item.id, title: item.name } as any}
                                        designFile={{
                                          thumbnail: df.thumbnail,
                                          updatedAt: df.updatedAt,
                                          spaceConfig: df.spaceConfig,
                                          furniture: df.furniture,
                                        }}
                                        className={styles.thumbnailImg}
                                        alt={df.name}
                                      />
                                    </div>
                                  ))}
                                  {Array.from({ length: 4 - displayItems.length }).map((_, i) => (
                                    <div key={`empty-${i}`} className={styles.thumbnailEmpty} />
                                  ))}
                                </div>
                              );
                            })()}
                          </div>
                        ) : (
                          <div className={styles.placeholderThumbnail}>
                            <LuFileBox size={48} strokeWidth={1} />
                          </div>
                        )}

                        {/* 디자인 카드 호버 오버레이 */}
                        {item.type === 'design' && (
                          <div className={styles.designCardOverlay}>
                            <button
                              className={styles.overlayButton}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onOpenEditor) {
                                  onOpenEditor(item);
                                } else {
                                  onItemDoubleClick(item);
                                }
                              }}
                            >
                              에디터로 이동
                            </button>
                          </div>
                        )}
                      </div>

                      <div className={styles.cardInfo}>
                        <div className={styles.cardTitle}>
                          {item.type === 'design' && nav.currentProjectId
                            ? `${selectedProject?.title || ''} > ${item.name}`
                            : item.name}
                        </div>
                        <div className={styles.cardMeta}>
                          {item.type === 'design' && item.spaceSize && (
                            <div className={styles.cardSpaceSize}>
                              {item.spaceSize.width} × {item.spaceSize.height}{item.spaceSize.depth ? ` × ${item.spaceSize.depth}` : ''}
                            </div>
                          )}
                          <div className={styles.cardDate}>{formatDate(item.updatedAt)}</div>
                        </div>
                        <div className={styles.cardFooter}>
                          <div className={styles.cardUser}>
                            <div className={styles.cardUserAvatar}>
                              {(() => {
                                const photoURL = item.ownerPhotoURL || user?.photoURL;
                                return photoURL ? (
                                  <img
                                    src={photoURL}
                                    alt="프로필"
                                    referrerPolicy="no-referrer"
                                    style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                                  />
                                ) : (
                                  <UserIcon size={12} />
                                );
                              })()}
                            </div>
                            <span className={styles.cardUserName}>
                              {item.ownerName || user?.displayName || user?.email?.split('@')[0] || ''}
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        className={styles.cardActionButton}
                        onClick={e => { e.stopPropagation(); onItemContextMenu(e, item); }}
                      >
                        ⋯
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          </section>
        </div>
      </main>

      {/* 설정 패널 */}
      {isSettingsPanelOpen && (
        <SettingsPanel isOpen={isSettingsPanelOpen} onClose={() => setIsSettingsPanelOpen(false)} />
      )}
    </div>
  );
};

export default ClassicDashboard;
