import React, { useState, useRef, useEffect } from 'react';
import { Plus, FolderPlus, ChevronDown, ChevronLeft, ChevronRight, ArrowUp, LayoutGrid, List, Table, Grid3X3, Image, Clock, Folder } from 'lucide-react';
import { FcFolder } from 'react-icons/fc';
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
}) => {
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const viewMenuRef = useRef<HTMLDivElement>(null);

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
            {nav.breadcrumbPath.map((item, i) => (
              <React.Fragment key={item.id}>
                {i > 0 && <span className={styles.breadcrumbSep}>&gt;</span>}
                <button
                  className={`${styles.breadcrumbItem} ${
                    i === nav.breadcrumbPath.length - 1 ? styles.breadcrumbActive : ''
                  }`}
                  onClick={() => handleBreadcrumbClick(item)}
                >
                  <span className={styles.breadcrumbIcon}>{getBreadcrumbIcon(item)}</span>
                  {item.label}
                </button>
              </React.Fragment>
            ))}
          </div>
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

      <div className={styles.spacer} />

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
