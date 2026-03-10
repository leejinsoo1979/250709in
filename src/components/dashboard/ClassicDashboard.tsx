import React, { useMemo, useState } from 'react';
import { Folder, Search, Plus, FileText, MoreHorizontal, LayoutGrid, List } from 'lucide-react';
import { MdOutlinePending, MdCheckCircleOutline } from 'react-icons/md';
import { TfiShare, TfiShareAlt } from 'react-icons/tfi';
import { TrashIcon } from '@/components/common/Icons';
import { useAuth } from '@/auth/AuthProvider';
import type { ExplorerItem, QuickAccessMenu } from '@/hooks/dashboard/types';
import type { UseExplorerNavigationReturn, UseExplorerDataReturn, UseExplorerActionsReturn } from '@/hooks/dashboard/types';
import styles from './ClassicDashboard.module.css';

interface ClassicDashboardProps {
  nav: UseExplorerNavigationReturn;
  data: UseExplorerDataReturn;
  actions: UseExplorerActionsReturn;
  onItemDoubleClick: (item: ExplorerItem) => void;
  onItemContextMenu: (e: React.MouseEvent, item: ExplorerItem) => void;
  onCreateProject: () => void;
  onCreateDesign: () => void;
}

const menuItems: { key: QuickAccessMenu; label: string; icon: React.ReactNode }[] = [
  { key: 'in-progress', label: '진행중 프로젝트', icon: <MdOutlinePending size={20} /> },
  { key: 'completed', label: '완료된 프로젝트', icon: <MdCheckCircleOutline size={20} /> },
  { key: 'shared-with-me', label: '공유받은 파일', icon: <TfiShareAlt size={18} /> },
  { key: 'shared-by-me', label: '공유한 파일', icon: <TfiShare size={18} /> },
  { key: 'trash', label: '휴지통', icon: <TrashIcon size={20} /> },
];

const ClassicDashboard: React.FC<ClassicDashboardProps> = ({
  nav,
  data,
  actions,
  onItemDoubleClick,
  onItemContextMenu,
  onCreateProject,
  onCreateDesign,
}) => {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');

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
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  };

  // 브레드크럼 텍스트
  const breadcrumbLabel = nav.currentProjectId
    ? nav.breadcrumbPath[nav.breadcrumbPath.length - 1]?.label || '프로젝트'
    : '전체 프로젝트';

  return (
    <div className={styles.container}>
      {/* ══════ 좌측 사이드바 ══════ */}
      <aside className={styles.sidebar}>
        {/* 프로필 */}
        <div className={styles.profileSection}>
          <div className={styles.userAvatar}>
            {user?.photoURL ? (
              <img src={user.photoURL} alt="프로필" referrerPolicy="no-referrer" />
            ) : (
              <span className={styles.avatarFallback}>👤</span>
            )}
          </div>
          <div className={styles.userName}>{user?.displayName || '사용자'}</div>
          <div className={styles.userEmail}>{user?.email || ''}</div>
        </div>

        {/* 프로젝트 생성 버튼 */}
        <button className={styles.createProjectBtn} onClick={onCreateProject}>
          <Plus size={16} />
          새 프로젝트
        </button>

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
            </div>
          ))}
        </nav>

        {/* 프로젝트 리스트 */}
        <div className={styles.projectListSection}>
          <div className={styles.projectListTitle}>프로젝트</div>
          {data.projects.map(project => (
            <div
              key={project.id}
              className={`${styles.navItem} ${
                nav.currentProjectId === project.id ? styles.active : ''
              }`}
              onClick={() => nav.navigateTo(project.id, null, project.title)}
            >
              <div className={styles.navItemIcon}>
                <Folder size={18} />
              </div>
              <span className={styles.navItemLabel}>{project.title}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* ══════ 우측 메인 영역 ══════ */}
      <main className={styles.mainArea}>
        {/* 서브헤더 (브레드크럼 + 검색 + 보기 토글 + 정렬) */}
        <div className={styles.subHeader}>
          <div className={styles.breadcrumb}>
            {nav.currentProjectId ? (
              <>
                <button className={styles.breadcrumbLink} onClick={() => nav.navigateToRoot()}>
                  전체 프로젝트
                </button>
                <span className={styles.breadcrumbSep}>›</span>
                <span className={styles.breadcrumbCurrent}>{breadcrumbLabel}</span>
              </>
            ) : (
              <span className={styles.breadcrumbCurrent}>{breadcrumbLabel}</span>
            )}
          </div>

          <div className={styles.searchSection}>
            <div className={styles.searchBar}>
              <Search size={16} className={styles.searchIcon} />
              <input
                type="text"
                placeholder="프로젝트 이름으로 검색"
                className={styles.searchInput}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.subHeaderActions}>
            <div className={styles.viewToggle}>
              <button
                className={`${styles.viewBtn} ${viewMode === 'list' ? styles.activeView : ''}`}
                onClick={() => setViewMode('list')}
                title="목록 보기"
              >
                <List size={16} />
              </button>
              <button
                className={`${styles.viewBtn} ${viewMode === 'grid' ? styles.activeView : ''}`}
                onClick={() => setViewMode('grid')}
                title="그리드 보기"
              >
                <LayoutGrid size={16} />
              </button>
            </div>

            <button className={styles.sortBtn} onClick={() => setSortBy(prev => prev === 'date' ? 'name' : 'date')}>
              ⇅ {sortBy === 'date' ? '날짜순' : '이름순'}
            </button>
          </div>
        </div>

        {/* 디자인 그리드 */}
        <div className={styles.gridArea}>
          {data.isLoading ? (
            <div className={styles.emptyState}>
              <div className={styles.spinner} />
              <span>로딩 중...</span>
            </div>
          ) : filteredItems.length === 0 && !nav.currentProjectId ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <Folder size={48} />
              </div>
              <h3 className={styles.emptyTitle}>프로젝트가 없습니다</h3>
              <p className={styles.emptyDescription}>
                새로운 프로젝트를 만들어 시작하세요
              </p>
              <button className={styles.emptyButton} onClick={onCreateProject}>
                프로젝트 만들기
              </button>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <FileText size={48} />
              </div>
              <h3 className={styles.emptyTitle}>디자인이 없습니다</h3>
              <p className={styles.emptyDescription}>
                새로운 디자인을 만들거나 프로젝트를 선택하세요
              </p>
              <button className={styles.emptyButton} onClick={onCreateDesign}>
                디자인 만들기
              </button>
            </div>
          ) : viewMode === 'list' ? (
            <div className={styles.listView}>
              {filteredItems.map(item => (
                <div
                  key={item.id}
                  className={styles.listItem}
                  onClick={e => actions.selectItem(item.id, e.ctrlKey || e.metaKey)}
                  onDoubleClick={() => onItemDoubleClick(item)}
                  onContextMenu={e => onItemContextMenu(e, item)}
                >
                  {item.type === 'folder' || item.type === 'project'
                    ? <Folder size={18} className={styles.listItemIcon} />
                    : <FileText size={18} className={styles.listItemIcon} />}
                  <span className={styles.listItemName}>{item.name}</span>
                  <span className={styles.listItemDate}>{formatDate(item.updatedAt)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.designGrid}>
              {/* 새 디자인 카드 - 프로젝트 내부일 때만 */}
              {nav.currentProjectId && (
                <div className={styles.createDesignCard} onClick={onCreateDesign}>
                  <div className={styles.createIcon}>
                    <Plus size={28} />
                  </div>
                  <p className={styles.createText}>새로운 디자인</p>
                </div>
              )}

              {filteredItems.map(item => (
                <div
                  key={item.id}
                  className={styles.designCard}
                  onClick={e => actions.selectItem(item.id, e.ctrlKey || e.metaKey)}
                  onDoubleClick={() => onItemDoubleClick(item)}
                  onContextMenu={e => onItemContextMenu(e, item)}
                >
                  <div className={styles.cardThumbnail}>
                    {item.thumbnail ? (
                      <img src={item.thumbnail} alt={item.name} />
                    ) : (
                      <div className={styles.placeholderThumbnail}>
                        {item.type === 'folder' || item.type === 'project'
                          ? <Folder size={40} />
                          : <FileText size={40} />}
                      </div>
                    )}

                    {/* 호버 액션 */}
                    <div className={styles.cardHoverActions}>
                      <button
                        className={styles.actionButton}
                        onClick={e => { e.stopPropagation(); onItemContextMenu(e, item); }}
                        title="더보기"
                      >
                        <MoreHorizontal size={14} />
                      </button>
                    </div>
                  </div>

                  <div className={styles.cardInfo}>
                    <h3 className={styles.cardTitle}>{item.name}</h3>
                    <p className={styles.cardDate}>{formatDate(item.updatedAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default ClassicDashboard;
