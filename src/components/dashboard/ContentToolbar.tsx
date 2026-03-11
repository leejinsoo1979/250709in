import React, { useState, useRef, useEffect } from 'react';
import { Plus, FolderPlus, ChevronDown, ChevronLeft, ChevronRight, ArrowUp, LayoutGrid, List, Table, Grid3X3, Image, Clock, Folder, Search } from 'lucide-react';
import { FcFolder } from 'react-icons/fc';
import type { ProjectSummary } from '@/firebase/types';
import type { FolderData } from '@/firebase/projects';
import type { ViewMode, SortBy, BreadcrumbItem, UseExplorerNavigationReturn } from '@/hooks/dashboard/types';
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
  totalItemCount = 0,
  selectedCount = 0,
  onSelectAll,
  onClearSelection,
  searchTerm,
  onSearchChange,
  projects,
  folders,
}) => {
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [dropdownOpenId, setDropdownOpenId] = useState<string | null>(null);
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

  // 브레드크럼 드롭다운 외부 클릭 닫기
  useEffect(() => {
    if (!dropdownOpenId) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpenId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpenId]);

  const getDropdownItems = (item: BreadcrumbItem) => {
    if (item.type === 'root' && projects) {
      return projects.filter(p => !p.isDeleted).map(p => ({
        id: p.id,
        label: p.title,
        type: 'project' as const,
      }));
    }
    if (item.type === 'project' && folders && nav?.currentProjectId) {
      const projectFolders = folders[nav.currentProjectId] || [];
      return projectFolders.map(f => ({
        id: f.id,
        label: f.name,
        type: 'folder' as const,
      }));
    }
    return [];
  };

  const handleDropdownItemClick = (dropdownItem: { id: string; type: 'project' | 'folder' }) => {
    if (!nav) return;
    if (dropdownItem.type === 'project') {
      const project = projects?.find(p => p.id === dropdownItem.id);
      nav.navigateTo(dropdownItem.id, null, project?.title || dropdownItem.id);
    } else if (dropdownItem.type === 'folder') {
      const folder = folders?.[nav.currentProjectId!]?.find(f => f.id === dropdownItem.id);
      nav.navigateTo(nav.currentProjectId, dropdownItem.id, folder?.name || dropdownItem.id);
    }
    setDropdownOpenId(null);
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

  // 전체선택 체크박스 상태
  const isAllSelected = totalItemCount > 0 && selectedCount === totalItemCount;
  const isPartiallySelected = selectedCount > 0 && selectedCount < totalItemCount;

  const handleSelectAllToggle = () => {
    if (isAllSelected || isPartiallySelected) {
      onClearSelection?.();
    } else {
      onSelectAll?.();
    }
  };

  return (
    <div className={styles.toolbar}>
      {/* 전체선택 체크박스 */}
      {onSelectAll && totalItemCount > 0 && (
        <div className={styles.selectAllCheckbox} title={isAllSelected ? '선택 해제' : '전체 선택'}>
          <input
            type="checkbox"
            checked={isAllSelected}
            ref={(el) => {
              if (el) el.indeterminate = isPartiallySelected;
            }}
            onChange={handleSelectAllToggle}
          />
        </div>
      )}

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

          <div className={styles.breadcrumb}>
            {nav.breadcrumbPath.map((item, i) => {
              const isLast = i === nav.breadcrumbPath.length - 1;
              const dropdownItems = getDropdownItems(item);
              const showChevron = !isLast && dropdownItems.length > 0;
              return (
                <React.Fragment key={item.id}>
                  {i > 0 && <span className={styles.breadcrumbSep}>&gt;</span>}
                  <div className={styles.breadcrumbSegment} ref={dropdownOpenId === item.id ? dropdownRef : undefined}>
                    <button
                      className={`${styles.breadcrumbItem} ${isLast ? styles.breadcrumbActive : ''}`}
                      onClick={() => handleBreadcrumbClick(item)}
                    >
                      <span className={styles.breadcrumbIcon}>{getBreadcrumbIcon(item)}</span>
                      {item.label}
                    </button>
                    {showChevron && (
                      <button
                        className={styles.breadcrumbChevron}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDropdownOpenId(prev => prev === item.id ? null : item.id);
                        }}
                      >
                        <ChevronDown size={10} />
                      </button>
                    )}
                    {dropdownOpenId === item.id && (
                      <div className={styles.breadcrumbDropdown}>
                        {dropdownItems.map(di => (
                          <button
                            key={di.id}
                            className={styles.breadcrumbDropdownItem}
                            onClick={() => handleDropdownItemClick(di)}
                          >
                            {di.type === 'project' ? <Folder size={13} /> : <FcFolder size={13} />}
                            <span>{di.label}</span>
                          </button>
                        ))}
                        {dropdownItems.length === 0 && (
                          <div className={styles.breadcrumbDropdownEmpty}>항목 없음</div>
                        )}
                      </div>
                    )}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      <div className={styles.spacer} />

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

      {/* 생성 버튼 */}
      <div className={styles.actions}>
        {onCreateDesign && (
          <button className={styles.createBtn} onClick={onCreateDesign}>
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
