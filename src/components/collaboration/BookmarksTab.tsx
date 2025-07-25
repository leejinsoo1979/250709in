import React, { useState, useEffect } from 'react';
import { StarIcon, SearchIcon, FilterIcon } from '../common/Icons';
import { ProjectBookmark } from '../../firebase/types';
import { getUserBookmarks, toggleProjectBookmark } from '../../firebase/bookmarks';
import { useAuth } from '../../auth/AuthProvider';
import styles from './CollaborationTabs.module.css';

interface BookmarksTabProps {
  onProjectSelect?: (projectId: string) => void;
}

const BookmarksTab: React.FC<BookmarksTabProps> = ({ onProjectSelect }) => {
  const { user } = useAuth();
  const [bookmarks, setBookmarks] = useState<ProjectBookmark[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'personal' | 'shared'>('all');

  // 북마크 목록 로드
  const loadBookmarks = async () => {
    if (!user) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const { bookmarks: fetchedBookmarks, error: fetchError } = await getUserBookmarks();
      if (fetchError) {
        setError(fetchError);
      } else {
        setBookmarks(fetchedBookmarks);
      }
    } catch (err) {
      setError('북마크를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBookmarks();
  }, [user]);

  // 북마크 토글
  const handleToggleBookmark = async (projectId: string, bookmarkType: 'personal' | 'shared') => {
    try {
      const { error } = await toggleProjectBookmark(projectId, bookmarkType);
      if (error) {
        console.error('북마크 토글 에러:', error);
      } else {
        // 북마크 목록 새로고침
        loadBookmarks();
      }
    } catch (err) {
      console.error('북마크 토글 실패:', err);
    }
  };

  // 필터링된 북마크
  const filteredBookmarks = bookmarks.filter(bookmark => {
    const matchesSearch = bookmark.projectTitle.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === 'all' || bookmark.bookmarkType === filterType;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className={styles.tabContent}>
      <div className={styles.tabHeader}>
        <h2 className={styles.tabTitle}>
          <StarIcon size={20} />
          북마크
        </h2>
        <div className={styles.tabActions}>
          <div className={styles.searchBox}>
            <SearchIcon size={16} />
            <input
              type="text"
              placeholder="북마크 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={styles.searchInput}
            />
          </div>
          <div className={styles.filterDropdown}>
            <FilterIcon size={16} />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as 'all' | 'personal' | 'shared')}
              className={styles.filterSelect}
            >
              <option value="all">전체</option>
              <option value="personal">내 프로젝트</option>
              <option value="shared">공유 프로젝트</option>
            </select>
          </div>
        </div>
      </div>

      <div className={styles.contentArea}>
        {loading && (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <p>북마크를 불러오는 중...</p>
          </div>
        )}

        {error && (
          <div className={styles.errorState}>
            <p className={styles.errorMessage}>{error}</p>
            <button onClick={loadBookmarks} className={styles.retryButton}>
              다시 시도
            </button>
          </div>
        )}

        {!loading && !error && filteredBookmarks.length === 0 && (
          <div className={styles.emptyState}>
            <StarIcon size={48} />
            <h3>북마크가 없습니다</h3>
            <p>마음에 드는 프로젝트를 북마크해보세요.</p>
          </div>
        )}

        {!loading && !error && filteredBookmarks.length > 0 && (
          <div className={styles.bookmarkGrid}>
            {filteredBookmarks.map((bookmark) => (
              <div
                key={bookmark.id}
                className={styles.bookmarkCard}
                onClick={() => onProjectSelect?.(bookmark.projectId)}
              >
                <div className={styles.bookmarkHeader}>
                  <div className={styles.bookmarkIcon}>
                    <StarIcon size={20} />
                  </div>
                  <button
                    className={styles.bookmarkToggle}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleBookmark(bookmark.projectId, bookmark.bookmarkType);
                    }}
                  >
                    <StarIcon size={16} filled />
                  </button>
                </div>
                
                <div className={styles.bookmarkContent}>
                  <h4 className={styles.bookmarkTitle}>{bookmark.projectTitle}</h4>
                  <div className={styles.bookmarkMeta}>
                    <span className={`${styles.bookmarkType} ${styles[bookmark.bookmarkType]}`}>
                      {bookmark.bookmarkType === 'personal' ? '내 프로젝트' : '공유 프로젝트'}
                    </span>
                    <span className={styles.bookmarkDate}>
                      {bookmark.createdAt.toDate().toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.tabFooter}>
        <div className={styles.bookmarkStats}>
          <span>총 {filteredBookmarks.length}개의 북마크</span>
          {filterType !== 'all' && (
            <span className={styles.filterInfo}>
              ({filterType === 'personal' ? '내 프로젝트' : '공유 프로젝트'})
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default BookmarksTab;