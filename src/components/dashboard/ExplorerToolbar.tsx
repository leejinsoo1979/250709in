import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, ArrowUp, Search } from 'lucide-react';
import type { UseExplorerNavigationReturn, BreadcrumbItem, QuickAccessMenu } from '@/hooks/dashboard/types';
import styles from './ExplorerToolbar.module.css';

// 빠른 액세스 메뉴 라벨 매핑
const MENU_LABELS: Record<QuickAccessMenu, string> = {
  'all': '전체',
  'in-progress': '진행중 프로젝트',
  'completed': '완료된 프로젝트',
  'bookmarks': '즐겨찾기',
  'shared-with-me': '공유받은 파일',
  'shared-by-me': '공유한 파일',
  'trash': '휴지통',
  'profile': '프로필',
  'team': '팀',
};

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
      nav.navigateTo(nav.currentProjectId, item.id, item.label);
    }
  };

  // 루트일 때 activeMenu에 맞는 라벨 표시
  const displayBreadcrumb = nav.breadcrumbPath.map((item, i) => {
    if (i === 0 && item.type === 'root') {
      return { ...item, label: MENU_LABELS[nav.activeMenu] || '전체' };
    }
    return item;
  });

  return (
    <div className={styles.toolbar}>
      {/* 좌측: 네비게이션 버튼 */}
      <div className={styles.navSection}>
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

      {/* 우측: 주소 표시줄 (브레드크럼) */}
      <div className={styles.addressSection}>
        <div className={styles.addressBar}>
          {displayBreadcrumb.map((item, i) => (
            <React.Fragment key={item.id}>
              {i > 0 && <span className={styles.separator}>&gt;</span>}
              <button
                className={`${styles.breadcrumbItem} ${
                  i === displayBreadcrumb.length - 1 ? styles.breadcrumbActive : ''
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
    </div>
  );
};

export default ExplorerToolbar;
