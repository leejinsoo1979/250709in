import React from 'react';
import { Grid, List, AlignJustify, Plus, FolderPlus, FilePlus } from 'lucide-react';
import type { ViewMode, SortBy } from '@/hooks/dashboard/types';
import styles from './ContentToolbar.module.css';

interface ContentToolbarProps {
  viewMode: ViewMode;
  sortBy: SortBy;
  onViewModeChange: (mode: ViewMode) => void;
  onSortChange: (sort: SortBy) => void;
  onCreateProject: () => void;
  onCreateFolder: () => void;
  onCreateDesign?: () => void;
  showCreateFolder: boolean; // 프로젝트 내부일 때만 폴더 생성 가능
}

const ContentToolbar: React.FC<ContentToolbarProps> = ({
  viewMode,
  sortBy,
  onViewModeChange,
  onSortChange,
  onCreateProject,
  onCreateFolder,
  onCreateDesign,
  showCreateFolder,
}) => {
  return (
    <div className={styles.toolbar}>
      {/* 생성 버튼 */}
      <div className={styles.actions}>
        <button className={styles.createBtn} onClick={onCreateProject}>
          <Plus size={16} />
          <span>새 프로젝트</span>
        </button>
        {showCreateFolder && (
          <>
            <button className={styles.createBtn} onClick={onCreateFolder}>
              <FolderPlus size={16} />
              <span>새 폴더</span>
            </button>
            {onCreateDesign && (
              <button className={styles.createBtn} onClick={onCreateDesign}>
                <FilePlus size={16} />
                <span>새 디자인</span>
              </button>
            )}
          </>
        )}
      </div>

      <div className={styles.spacer} />

      {/* 뷰 모드 전환 */}
      <div className={styles.viewToggle}>
        <button
          className={`${styles.viewBtn} ${viewMode === 'icons' ? styles.viewBtnActive : ''}`}
          onClick={() => onViewModeChange('icons')}
          title="아이콘 뷰"
        >
          <Grid size={16} />
        </button>
        <button
          className={`${styles.viewBtn} ${viewMode === 'list' ? styles.viewBtnActive : ''}`}
          onClick={() => onViewModeChange('list')}
          title="목록 뷰"
        >
          <List size={16} />
        </button>
        <button
          className={`${styles.viewBtn} ${viewMode === 'details' ? styles.viewBtnActive : ''}`}
          onClick={() => onViewModeChange('details')}
          title="자세히 뷰"
        >
          <AlignJustify size={16} />
        </button>
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
