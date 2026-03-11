import React, { useState, useRef, useEffect } from 'react';
import { Plus, FolderPlus, ChevronDown, ChevronLeft, ChevronRight, ArrowUp, LayoutGrid, List, Table, Grid3X3, Image, Clock, Folder, Search, FileText } from 'lucide-react';
import { FcFolder } from 'react-icons/fc';
import type { ProjectSummary } from '@/firebase/types';
import type { FolderData } from '@/firebase/projects';
import type { ViewMode, SortBy, BreadcrumbItem, UseExplorerNavigationReturn, ExplorerItem } from '@/hooks/dashboard/types';
import styles from './ContentToolbar.module.css';

interface ContentToolbarProps {
  viewMode: ViewMode;
  sortBy: SortBy;
  onViewModeChange: (mode: ViewMode) => void;
  onSortChange: (sort: SortBy) => void;
  onCreateProject: () => void;
  onCreateFolder?: () => void;
  onCreateDesign?: () => void;
  nav?: UseExplorerNavigationReturn;
  totalItemCount?: number;
  selectedCount?: number;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
  searchTerm?: string;
  onSearchChange?: (value: string) => void;
  projects?: ProjectSummary[];
  folders?: { [projectId: string]: FolderData[] };
  projectDesignFiles?: { [projectId: string]: any[] };
  currentItems?: ExplorerItem[];
  onItemNavigate?: (item: ExplorerItem) => void;
}

const VIEW_OPTIONS: { mode: ViewMode; label: string; icon: React.ReactNode }[] = [
  { mode: 'extra-large', label: '아주 큰 아이콘', icon: <Image size={15} /> },
  { mode: 'large', label: '큰 아이콘', icon: <LayoutGrid size={15} /> },
  { mode: 'medium', label: '보통 아이콘', icon: <Grid3X3 size={15} /> },
  { mode: 'list', label: '목록', icon: <List size={15} /> },
  { mode: 'details', label: '자세히', icon: <Table size={15} /> },
  { mode: 'tiles', label: '타일', icon: <LayoutGrid size={15} /> },
];

const ContentToolbar: React.FC<ContentToolbarProps> = ({
  viewMode,
  sortBy,
  onViewModeChange,
  onSortChange,
  onCreateFolder,
  onCreateDesign,
  nav,
  searchTerm,
  onSearchChange,
  projects,
  folders,
  projectDesignFiles,
  currentItems,
  onItemNavigate,
}) => {
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [treeOpen, setTreeOpen] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!viewMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) {
        setViewMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [viewMenuOpen]);

  // 파일트리 드롭다운 외부 클릭 닫기
  useEffect(() => {
    if (!treeOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setTreeOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [treeOpen]);

  // 트리 노드 타입
  interface TreeNode {
    id: string;
    label: string;
    type: 'project' | 'folder' | 'design';
    depth: number;
    projectId?: string;
    folderId?: string;
    hasChildren: boolean;
  }

  // 트리 열 때 현재 경로의 프로젝트/폴더를 자동 펼침
  useEffect(() => {
    if (treeOpen && nav?.currentProjectId) {
      setExpandedNodes(prev => {
        const next = new Set(prev);
        next.add(nav.currentProjectId!);
        if (nav.currentFolderId) {
          next.add(nav.currentFolderId);
        }
        return next;
      });
    }
  }, [treeOpen, nav?.currentProjectId, nav?.currentFolderId]);

  const toggleExpand = (nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  // 프로젝트의 디자인 파일 가져오기 (폴더별 필터링)
  const getDesignFilesForProject = (projectId: string, folderId?: string): any[] => {
    const files = projectDesignFiles?.[projectId] || [];
    return files.filter((df: any) => {
      if (df.isDeleted) return false;
      if (folderId) return df.folderId === folderId;
      return !df.folderId; // 루트 레벨 디자인 (폴더에 속하지 않은)
    });
  };

  // 전체 파일 트리 (펼침 상태 반영)
  const buildFileTree = (): TreeNode[] => {
    const tree: TreeNode[] = [];
    if (!projects) return tree;

    const activeProjects = projects.filter(p => !p.isDeleted);
    for (const project of activeProjects) {
      const projectFolders = folders?.[project.id] || [];
      const rootDesigns = getDesignFilesForProject(project.id);
      const hasChildren = projectFolders.length > 0 || rootDesigns.length > 0;

      tree.push({ id: project.id, label: project.title, type: 'project', depth: 0, hasChildren });

      if (expandedNodes.has(project.id)) {
        // 폴더들
        for (const folder of projectFolders) {
          const folderDesigns = getDesignFilesForProject(project.id, folder.id);
          const folderHasChildren = folderDesigns.length > 0;

          tree.push({ id: folder.id, label: folder.name, type: 'folder', depth: 1, projectId: project.id, hasChildren: folderHasChildren });

          // 폴더 펼침 → 하위 디자인
          if (expandedNodes.has(folder.id)) {
            for (const design of folderDesigns) {
              tree.push({ id: design.id, label: design.title || design.name || '무제', type: 'design', depth: 2, projectId: project.id, folderId: folder.id, hasChildren: false });
            }
          }
        }

        // 루트 레벨 디자인 (폴더에 속하지 않은)
        for (const design of rootDesigns) {
          tree.push({ id: design.id, label: design.title || design.name || '무제', type: 'design', depth: 1, projectId: project.id, hasChildren: false });
        }
      }
    }
    return tree;
  };

  const handleTreeItemClick = (node: TreeNode) => {
    if (!nav) return;
    if (node.type === 'project') {
      const project = projects?.find(p => p.id === node.id);
      nav.navigateTo(node.id, null, project?.title || node.id);
      setTreeOpen(false);
    } else if (node.type === 'folder') {
      const folder = folders?.[node.projectId!]?.find(f => f.id === node.id);
      nav.navigateTo(node.projectId!, node.id, folder?.name || node.id);
      setTreeOpen(false);
    } else if (node.type === 'design') {
      const item = currentItems?.find(ci => ci.id === node.id);
      if (item && onItemNavigate) {
        onItemNavigate(item);
      }
      setTreeOpen(false);
    }
  };

  const currentViewOption = VIEW_OPTIONS.find(v => v.mode === viewMode) || VIEW_OPTIONS[2];

  const getBreadcrumbIcon = (item: BreadcrumbItem) => {
    switch (item.type) {
      case 'root': return <Clock size={13} />;
      case 'project': return <Folder size={13} />;
      case 'folder': return <FcFolder size={13} />;
    }
  };

  const handleBreadcrumbClick = (item: BreadcrumbItem) => {
    if (!nav) return;
    if (item.type === 'root') {
      nav.navigateToRoot();
    } else if (item.type === 'project') {
      nav.navigateTo(item.id, null, item.label);
    } else if (item.type === 'folder') {
      nav.navigateTo(nav.currentProjectId, item.id, item.label);
    }
  };

  return (
    <div className={styles.toolbar}>
      {/* 생성 버튼 (맨 좌측) */}
      <div className={styles.actions}>
        {onCreateDesign && (
          <button className={`${styles.createBtn} ${styles.createBtnPrimary}`} onClick={onCreateDesign}>
            <Plus size={16} />
            <span>새 디자인</span>
          </button>
        )}
        {onCreateFolder && (
          <button className={styles.createBtn} onClick={onCreateFolder}>
            <FolderPlus size={16} />
            <span>새 폴더</span>
          </button>
        )}
      </div>

      {/* 네비게이션 버튼 + 브레드크럼 */}
      {nav && (
        <div className={styles.navGroup}>
          <button
            className={styles.navBtn}
            onClick={nav.goBack}
            disabled={!nav.canGoBack}
            title="뒤로"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            className={styles.navBtn}
            onClick={nav.goForward}
            disabled={!nav.canGoForward}
            title="앞으로"
          >
            <ChevronRight size={16} />
          </button>
          <button
            className={styles.navBtn}
            onClick={nav.goUp}
            disabled={!nav.canGoUp}
            title="상위 폴더"
          >
            <ArrowUp size={16} />
          </button>

          <div className={styles.breadcrumb} ref={treeOpen ? dropdownRef : undefined}>
            {nav.breadcrumbPath.map((item, i) => {
              const isLast = i === nav.breadcrumbPath.length - 1;
              return (
                <React.Fragment key={item.id}>
                  {i > 0 && <span className={styles.breadcrumbSep}>&gt;</span>}
                  <div className={styles.breadcrumbSegment}>
                    <button
                      className={`${styles.breadcrumbItem} ${isLast ? styles.breadcrumbActive : ''}`}
                      onClick={() => handleBreadcrumbClick(item)}
                    >
                      <span className={styles.breadcrumbIcon}>{getBreadcrumbIcon(item)}</span>
                      {item.label}
                    </button>
                  </div>
                </React.Fragment>
              );
            })}
            {/* 단일 chevron: 우측 끝 고정 */}
            <button
              className={styles.breadcrumbChevron}
              onClick={(e) => {
                e.stopPropagation();
                setTreeOpen(prev => !prev);
              }}
            >
              <ChevronDown size={10} />
            </button>
            {/* 통합 파일트리 드롭다운 */}
            {treeOpen && (() => {
              const tree = buildFileTree();
              if (tree.length === 0) return null;
              return (
                <div className={styles.breadcrumbDropdown}>
                  {tree.map(node => (
                    <div
                      key={`${node.type}-${node.id}`}
                      className={`${styles.breadcrumbDropdownItem} ${
                        (node.type === 'project' && nav.currentProjectId === node.id && !nav.currentFolderId) ||
                        (node.type === 'folder' && nav.currentFolderId === node.id)
                          ? styles.breadcrumbDropdownItemActive : ''
                      }`}
                      style={{ paddingLeft: `${8 + node.depth * 20}px` }}
                    >
                      {/* 펼침/접힘 토글 */}
                      {node.hasChildren ? (
                        <button
                          className={styles.treeToggle}
                          onClick={(e) => { e.stopPropagation(); toggleExpand(node.id); }}
                        >
                          <ChevronRight
                            size={12}
                            style={{ transform: expandedNodes.has(node.id) ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
                          />
                        </button>
                      ) : (
                        <span className={styles.treeToggleSpacer} />
                      )}
                      <button
                        className={styles.treeItemLabel}
                        onClick={() => handleTreeItemClick(node)}
                      >
                        {node.type === 'project' && <Folder size={14} />}
                        {node.type === 'folder' && <FcFolder size={15} />}
                        {node.type === 'design' && <FileText size={14} />}
                        <span>{node.label}</span>
                      </button>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* 검색바 */}
      {onSearchChange !== undefined && (
        <div className={styles.searchBox}>
          <Search size={16} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="검색..."
            value={searchTerm || ''}
            onChange={e => onSearchChange(e.target.value)}
          />
        </div>
      )}

      {/* 보기 모드 드롭다운 */}
      <div className={styles.viewDropdown} ref={viewMenuRef}>
        <button
          className={styles.viewDropdownBtn}
          onClick={() => setViewMenuOpen(prev => !prev)}
        >
          {currentViewOption.icon}
          <span>{currentViewOption.label}</span>
          <ChevronDown size={12} className={viewMenuOpen ? styles.chevronUp : ''} />
        </button>

        {viewMenuOpen && (
          <div className={styles.viewMenu}>
            {VIEW_OPTIONS.map(opt => (
              <button
                key={opt.mode}
                className={`${styles.viewMenuItem} ${viewMode === opt.mode ? styles.viewMenuItemActive : ''}`}
                onClick={() => {
                  onViewModeChange(opt.mode);
                  setViewMenuOpen(false);
                }}
              >
                {opt.icon}
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 정렬 */}
      <select
        className={styles.sortSelect}
        value={sortBy}
        onChange={e => onSortChange(e.target.value as SortBy)}
      >
        <option value="date">수정일순</option>
        <option value="name">이름순</option>
        <option value="type">종류순</option>
      </select>
    </div>
  );
};

export default ContentToolbar;
