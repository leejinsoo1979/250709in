import React, { useMemo } from 'react';
import { Folder, FileText, MoreHorizontal } from 'lucide-react';
import type { ExplorerItem, ViewMode, SortBy, SortDirection, DragState } from '@/hooks/dashboard/types';
import styles from './ContentPane.module.css';

interface ContentPaneProps {
  items: ExplorerItem[];
  viewMode: ViewMode;
  sortBy: SortBy;
  sortDirection: SortDirection;
  searchTerm: string;
  selectedItems: Set<string>;
  dragState: DragState;
  onItemClick: (id: string, multi?: boolean) => void;
  onItemDoubleClick: (item: ExplorerItem) => void;
  onItemContextMenu: (e: React.MouseEvent, item: ExplorerItem) => void;
  onSortDirectionToggle: () => void;
  dragHandlers: {
    onDragStart: (e: React.DragEvent, item: DragState['draggedItem']) => void;
    onDragOver: (e: React.DragEvent, folderId: string) => void;
    onDrop: (e: React.DragEvent, targetFolderId: string) => void;
    onDragEnd: () => void;
  };
  isLoading?: boolean;
}

const ContentPane: React.FC<ContentPaneProps> = ({
  items,
  viewMode,
  sortBy,
  sortDirection,
  searchTerm,
  selectedItems,
  dragState,
  onItemClick,
  onItemDoubleClick,
  onItemContextMenu,
  onSortDirectionToggle,
  dragHandlers,
  isLoading,
}) => {
  // 검색 + 정렬 적용
  const filteredItems = useMemo(() => {
    let result = items;

    // 검색 필터
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(item => item.name.toLowerCase().includes(term));
    }

    // 정렬
    result = [...result].sort((a, b) => {
      // 폴더를 항상 먼저
      if (a.type === 'folder' && b.type !== 'folder') return -1;
      if (a.type !== 'folder' && b.type === 'folder') return 1;

      let cmp = 0;
      if (sortBy === 'name') {
        cmp = a.name.localeCompare(b.name, 'ko');
      } else if (sortBy === 'date') {
        const aTime = a.updatedAt?.toMillis?.() || 0;
        const bTime = b.updatedAt?.toMillis?.() || 0;
        cmp = bTime - aTime;
      } else if (sortBy === 'type') {
        cmp = a.type.localeCompare(b.type);
      }

      return sortDirection === 'desc' ? -cmp : cmp;
    });

    return result;
  }, [items, searchTerm, sortBy, sortDirection]);

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  const getItemIcon = (item: ExplorerItem) => {
    if (item.type === 'folder' || item.type === 'project') {
      return <Folder size={viewMode === 'icons' ? 40 : 16} className={styles.itemIconFolder} />;
    }
    return <FileText size={viewMode === 'icons' ? 40 : 16} className={styles.itemIconDesign} />;
  };

  if (isLoading) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.spinner} />
        <span>로딩 중...</span>
      </div>
    );
  }

  if (filteredItems.length === 0) {
    return (
      <div className={styles.emptyState}>
        <Folder size={48} className={styles.emptyIcon} />
        <span>{searchTerm ? '검색 결과가 없습니다' : '항목이 없습니다'}</span>
      </div>
    );
  }

  // 아이콘 뷰
  if (viewMode === 'icons') {
    return (
      <div className={styles.iconGrid}>
        {filteredItems.map(item => (
          <div
            key={item.id}
            className={`${styles.iconCard} ${selectedItems.has(item.id) ? styles.iconCardSelected : ''} ${
              dragState.dragOverFolder === item.id ? styles.dragOver : ''
            }`}
            onClick={e => onItemClick(item.id, e.ctrlKey || e.metaKey)}
            onDoubleClick={() => onItemDoubleClick(item)}
            onContextMenu={e => onItemContextMenu(e, item)}
            draggable={item.type === 'design'}
            onDragStart={e => {
              if (item.type === 'design' && item.projectId) {
                dragHandlers.onDragStart(e, {
                  id: item.id,
                  name: item.name,
                  type: 'design',
                  projectId: item.projectId,
                });
              }
            }}
            onDragOver={item.type === 'folder' ? e => dragHandlers.onDragOver(e, item.id) : undefined}
            onDrop={item.type === 'folder' ? e => dragHandlers.onDrop(e, item.id) : undefined}
            onDragEnd={dragHandlers.onDragEnd}
          >
            <div className={styles.iconThumbnail}>
              {item.thumbnail ? (
                <img src={item.thumbnail} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                getItemIcon(item)
              )}
            </div>
            <div className={styles.iconName} title={item.name}>
              {item.name}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // 자세히 뷰 (테이블)
  if (viewMode === 'details') {
    return (
      <div className={styles.detailsTable}>
        <div className={styles.tableHeader}>
          <div className={styles.colName} onClick={onSortDirectionToggle}>
            이름 {sortBy === 'name' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
          </div>
          <div className={styles.colType}>종류</div>
          <div className={styles.colSize}>크기</div>
          <div className={styles.colDate} onClick={onSortDirectionToggle}>
            수정일 {sortBy === 'date' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
          </div>
          <div className={styles.colActions} />
        </div>
        {filteredItems.map(item => (
          <div
            key={item.id}
            className={`${styles.tableRow} ${selectedItems.has(item.id) ? styles.tableRowSelected : ''} ${
              dragState.dragOverFolder === item.id ? styles.dragOver : ''
            }`}
            onClick={e => onItemClick(item.id, e.ctrlKey || e.metaKey)}
            onDoubleClick={() => onItemDoubleClick(item)}
            onContextMenu={e => onItemContextMenu(e, item)}
            draggable={item.type === 'design'}
            onDragStart={e => {
              if (item.type === 'design' && item.projectId) {
                dragHandlers.onDragStart(e, {
                  id: item.id, name: item.name, type: 'design', projectId: item.projectId,
                });
              }
            }}
            onDragOver={item.type === 'folder' ? e => dragHandlers.onDragOver(e, item.id) : undefined}
            onDrop={item.type === 'folder' ? e => dragHandlers.onDrop(e, item.id) : undefined}
            onDragEnd={dragHandlers.onDragEnd}
          >
            <div className={styles.colName}>
              {getItemIcon(item)}
              <span className={styles.rowName}>{item.name}</span>
            </div>
            <div className={styles.colType}>
              {item.type === 'project' ? '프로젝트' : item.type === 'folder' ? '폴더' : '디자인'}
            </div>
            <div className={styles.colSize}>
              {item.spaceSize
                ? `${item.spaceSize.width}x${item.spaceSize.height}x${item.spaceSize.depth}`
                : '-'}
            </div>
            <div className={styles.colDate}>{formatDate(item.updatedAt)}</div>
            <div className={styles.colActions}>
              <button
                className={styles.moreBtn}
                onClick={e => {
                  e.stopPropagation();
                  onItemContextMenu(e, item);
                }}
              >
                <MoreHorizontal size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // 목록 뷰
  return (
    <div className={styles.listView}>
      {filteredItems.map(item => (
        <div
          key={item.id}
          className={`${styles.listItem} ${selectedItems.has(item.id) ? styles.listItemSelected : ''}`}
          onClick={e => onItemClick(item.id, e.ctrlKey || e.metaKey)}
          onDoubleClick={() => onItemDoubleClick(item)}
          onContextMenu={e => onItemContextMenu(e, item)}
        >
          {getItemIcon(item)}
          <span className={styles.listName}>{item.name}</span>
          <span className={styles.listDate}>{formatDate(item.updatedAt)}</span>
        </div>
      ))}
    </div>
  );
};

export default ContentPane;
