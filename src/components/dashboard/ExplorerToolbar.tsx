import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, ArrowUp, Search } from 'lucide-react';
import type { UseExplorerNavigationReturn, BreadcrumbItem } from '@/hooks/dashboard/types';
import styles from './ExplorerToolbar.module.css';

interface ExplorerToolbarProps {
  nav: UseExplorerNavigationReturn;
  searchTerm?: string;
  onSearchChange?: (value: string) => void;
  hideSearch?: boolean;
}

const ExplorerToolbar: React.FC<ExplorerToolbarProps> = ({
  nav,
  searchTerm = '',
  onSearchChange,
  hideSearch = false,
}) => {
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const handleBreadcrumbClick = (item: BreadcrumbItem) => {
    if (item.type === 'root') {
      nav.navigateToRoot();
    } else if (item.type === 'project') {
      nav.navigateTo(item.id, null, item.label);
    } else if (item.type === 'folder') {
      // 폴더 클릭 시 현재 프로젝트 유지하고 폴더로 이동
      nav.navigateTo(nav.currentProjectId, item.id, item.label);
    }
  };

  return (
    <div className={styles.toolbar}>
      {/* 네비게이션 버튼 */}
      <div className={styles.navButtons}>
        <button
          className={styles.navBtn}
          onClick={nav.goBack}
          disabled={!nav.canGoBack}
          title="뒤로 (Alt+←)"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          className={styles.navBtn}
          onClick={nav.goForward}
          disabled={!nav.canGoForward}
          title="앞으로 (Alt+→)"
        >
          <ChevronRight size={18} />
        </button>
        <button
          className={styles.navBtn}
          onClick={nav.goUp}
          disabled={!nav.canGoUp}
          title="상위 폴더 (Alt+↑)"
        >
          <ArrowUp size={18} />
        </button>
      </div>

      {/* 주소 표시줄 (브레드크럼) */}
      <div className={styles.addressBar}>
        {nav.breadcrumbPath.map((item, i) => (
          <React.Fragment key={item.id}>
            {i > 0 && <span className={styles.separator}>&gt;</span>}
            <button
              className={`${styles.breadcrumbItem} ${
                i === nav.breadcrumbPath.length - 1 ? styles.breadcrumbActive : ''
              }`}
              onClick={() => handleBreadcrumbClick(item)}
            >
              {item.label}
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* 검색 */}
      {!hideSearch && onSearchChange && (
        <div className={`${styles.searchBox} ${isSearchFocused ? styles.searchFocused : ''}`}>
          <Search size={16} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="검색..."
            value={searchTerm}
            onChange={e => onSearchChange(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
          />
        </div>
      )}
    </div>
  );
};

export default ExplorerToolbar;
