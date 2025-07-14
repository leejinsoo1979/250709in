import React from 'react';
import { 
  FolderIcon, 
  ChevronRightIcon, 
  BellIcon, 
  SettingsIcon, 
  ListIcon, 
  GridIcon, 
  ClockIcon, 
  DocumentIcon,
  PlusIcon 
} from './Icons';
import styles from './TopBar.module.css';

interface TopBarProps {
  viewMode: 'grid' | 'list';
  sortBy: 'date' | 'name';
  onViewModeToggle: () => void;
  onSortChange: () => void;
  onCreateProject: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  projectsCount: number;
}

const TopBar: React.FC<TopBarProps> = ({ 
  viewMode, 
  sortBy, 
  onViewModeToggle, 
  onSortChange,
  onCreateProject,
  searchQuery,
  onSearchChange,
  projectsCount
}) => {
  return (
    <div className={styles.topBar}>
      <div className={styles.breadcrumb}>
        <span className={styles.breadcrumbItem}>전체 프로젝트</span>
        <ChevronRightIcon size={14} className={styles.chevron} />
        <span className={styles.breadcrumbCount}>({projectsCount})</span>
      </div>

      <div className={styles.searchBar}>
        <div className={styles.searchInputWrapper}>
          <input
            type="text"
            placeholder="프로젝트 이름으로 검색..."
            className={styles.searchInput}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.actions}>
        <button className={styles.createButton} onClick={onCreateProject}>
          <PlusIcon size={16} />
          <span>새 프로젝트</span>
        </button>

        <div className={styles.viewControls}>
          <button
            className={`${styles.viewButton} ${viewMode === 'list' ? styles.active : ''}`}
            onClick={onViewModeToggle}
            title="리스트 보기"
          >
            <ListIcon size={16} />
          </button>
          <button
            className={`${styles.viewButton} ${viewMode === 'grid' ? styles.active : ''}`}
            onClick={onViewModeToggle}
            title="그리드 보기"
          >
            <GridIcon size={16} />
          </button>
        </div>

        <button
          className={styles.sortButton}
          onClick={onSortChange}
          title={sortBy === 'date' ? '날짜순 정렬' : '이름순 정렬'}
        >
          {sortBy === 'date' ? <ClockIcon size={16} /> : <DocumentIcon size={16} />}
        </button>
      </div>
    </div>
  );
};

export default TopBar; 