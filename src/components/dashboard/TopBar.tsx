import React from 'react';
import styles from './TopBar.module.css';

const TopBar = ({ 
  viewMode = 'grid', 
  sortBy = 'date', 
  onViewModeToggle, 
  onSortChange 
}: any): any => {
  const handleViewModeToggle = (): any => {
    const newMode = viewMode === 'grid' ? 'list' : 'grid';
    onViewModeToggle?.(newMode);
  };

  const handleSortChange = (): any => {
    const newSort = sortBy === 'date' ? 'name' : 'date';
    onSortChange?.(newSort);
  };

  return (
    <div className={styles.topBar}>
      {/* 브레드크럼 */}
      <div className={styles.breadcrumb}>
        <span className={styles.breadcrumbText}>전체 프로젝트</span>
        <span className={styles.chevron}>›</span>
      </div>

      {/* 검색 바 */}
      <div className={styles.searchSection}>
        <div className={styles.searchBar}>
          <span className={styles.searchIcon}>🔍</span>
          <input
            type="text"
            placeholder="프로젝트 이름으로 검색"
            className={styles.searchInput}
          />
        </div>
      </div>

      {/* 액션 버튼들 */}
      <div className={styles.actions}>
        <button className={styles.exportBtn}>
          <span className={styles.btnIcon}>📤</span>
          내보내기
        </button>
        
        <div className={styles.viewToggle}>
          <button
            className={`${styles.viewBtn} ${viewMode === 'list' ? styles.activeView : ''}`}
            onClick={handleViewModeToggle}
          >
            <span className={styles.btnIcon}>☰</span>
          </button>
          <button
            className={`${styles.viewBtn} ${viewMode === 'grid' ? styles.activeView : ''}`}
            onClick={handleViewModeToggle}
          >
            <span className={styles.btnIcon}>⊞</span>
          </button>
        </div>
        
        <button className={styles.sortBtn} onClick={handleSortChange}>
          <span className={styles.btnIcon}>⇅</span>
          {sortBy === 'date' ? '날짜순' : '이름순'}
        </button>
      </div>
    </div>
  );
};

export default TopBar;