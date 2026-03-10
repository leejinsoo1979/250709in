import React, { useMemo, useState } from 'react';
import { Clock, Folder, Share2, Users, Trash2, Search, Plus, FileText, MoreHorizontal } from 'lucide-react';
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

const tabItems: { key: QuickAccessMenu; label: string; icon: React.ReactNode }[] = [
  { key: 'in-progress', label: '진행중', icon: <Clock size={16} /> },
  { key: 'completed', label: '완료', icon: <Folder size={16} /> },
  { key: 'shared-with-me', label: '공유받은', icon: <Share2 size={16} /> },
  { key: 'shared-by-me', label: '공유한', icon: <Users size={16} /> },
  { key: 'trash', label: '휴지통', icon: <Trash2 size={16} /> },
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
  const [searchTerm, setSearchTerm] = useState('');

  // 현재 탭에 맞는 항목 수
  const tabCounts = useMemo(() => {
    const counts: Partial<Record<QuickAccessMenu, number>> = {};
    counts['in-progress'] = data.projects.filter(p => p.status !== 'completed').length;
    counts['completed'] = data.projects.filter(p => p.status === 'completed').length;
    counts['shared-with-me'] = data.sharedWithMeProjects?.length || 0;
    counts['shared-by-me'] = data.sharedByMeProjects?.length || 0;
    counts['trash'] = 0;
    return counts;
  }, [data.projects, data.sharedWithMeProjects, data.sharedByMeProjects]);

  // 검색 필터
  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return data.currentItems;
    const term = searchTerm.toLowerCase();
    return data.currentItems.filter(item => item.name.toLowerCase().includes(term));
  }, [data.currentItems, searchTerm]);

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const getTypeLabel = (type: string) => {
    if (type === 'project') return '프로젝트';
    if (type === 'folder') return '폴더';
    return '디자인';
  };

  return (
    <div className={styles.container}>
      {/* 좌측 탭 메뉴 */}
      <div className={styles.sidebar}>
        <div className={styles.sidebarSection}>
          <div className={styles.sidebarLabel}>메뉴</div>
          {tabItems.map(tab => (
            <button
              key={tab.key}
              className={`${styles.tabItem} ${nav.activeMenu === tab.key && !nav.currentProjectId ? styles.tabItemActive : ''}`}
              onClick={() => {
                nav.setActiveMenu(tab.key);
                nav.navigateTo(null, null, tab.label);
              }}
            >
              <span className={styles.tabIcon}>{tab.icon}</span>
              {tab.label}
              {(tabCounts[tab.key] ?? 0) > 0 && (
                <span className={styles.tabCount}>{tabCounts[tab.key]}</span>
              )}
            </button>
          ))}
        </div>

        <div className={styles.sidebarSection}>
          <div className={styles.sidebarLabel}>프로젝트</div>
          {data.projects.map(project => (
            <button
              key={project.id}
              className={`${styles.tabItem} ${nav.currentProjectId === project.id ? styles.tabItemActive : ''}`}
              onClick={() => nav.navigateTo(project.id, null, project.title)}
              title={project.title}
            >
              <span className={styles.tabIcon}><Folder size={16} /></span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {project.title}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 우측 메인 영역 */}
      <div className={styles.main}>
        {/* 상단 툴바 */}
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <span className={styles.searchIcon}><Search size={15} /></span>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="프로젝트 또는 디자인 검색..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <div className={styles.toolbarActions}>
            <button className={styles.createBtn} onClick={onCreateProject}>
              <Plus size={16} />
              새 프로젝트
            </button>
            {nav.currentProjectId && (
              <button className={styles.createBtn} onClick={onCreateDesign}>
                <Plus size={16} />
                새 디자인
              </button>
            )}
          </div>
        </div>

        {/* 카드 그리드 */}
        <div className={styles.cardArea}>
          {data.isLoading ? (
            <div className={styles.emptyState}>
              <div className={styles.spinner} />
              <span>로딩 중...</span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className={styles.emptyState}>
              <Folder size={48} className={styles.emptyIcon} />
              <span>{searchTerm ? '검색 결과가 없습니다' : '항목이 없습니다'}</span>
            </div>
          ) : (
            <div className={styles.cardGrid}>
              {filteredItems.map(item => (
                <div
                  key={item.id}
                  className={`${styles.card} ${actions.selectedItems.has(item.id) ? styles.cardSelected : ''}`}
                  onClick={e => actions.selectItem(item.id, e.ctrlKey || e.metaKey)}
                  onDoubleClick={() => onItemDoubleClick(item)}
                  onContextMenu={e => onItemContextMenu(e, item)}
                >
                  <div className={styles.cardThumbnail}>
                    {item.thumbnail ? (
                      <img src={item.thumbnail} alt={item.name} />
                    ) : item.type === 'folder' || item.type === 'project' ? (
                      <Folder size={48} />
                    ) : (
                      <FileText size={48} />
                    )}
                  </div>
                  <div className={styles.cardBody}>
                    <div className={styles.cardTitle} title={item.name}>{item.name}</div>
                    <div className={styles.cardMeta}>
                      <span className={styles.cardBadge}>{getTypeLabel(item.type)}</span>
                      {item.spaceSize && (
                        <span>{item.spaceSize.width}x{item.spaceSize.depth}</span>
                      )}
                      <span>{formatDate(item.updatedAt)}</span>
                      <div className={styles.cardActions}>
                        <button
                          className={styles.moreBtn}
                          onClick={e => { e.stopPropagation(); onItemContextMenu(e, item); }}
                        >
                          <MoreHorizontal size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClassicDashboard;
