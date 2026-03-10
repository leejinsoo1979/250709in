import React, { useMemo } from 'react';
import { FileText, MoreHorizontal } from 'lucide-react';
import { FcFolder } from 'react-icons/fc';
import { LuFileBox } from 'react-icons/lu';
import { RxDashboard } from 'react-icons/rx';
import ThumbnailImage from '@/components/common/ThumbnailImage';
import type { ExplorerItem, ViewMode, SortBy, SortDirection, DragState, SelectItemOptions } from '@/hooks/dashboard/types';
import { VIEW_MODE_ICON_SIZE } from '@/hooks/dashboard/types';
import styles from './ContentPane.module.css';

interface ContentPaneProps {
  items: ExplorerItem[];
  viewMode: ViewMode;
  sortBy: SortBy;
  sortDirection: SortDirection;
  searchTerm: string;
  selectedItems: Set<string>;
  dragState: DragState;
  onItemClick: (id: string, optionsOrMulti?: boolean | SelectItemOptions) => void;
  onItemDoubleClick: (item: ExplorerItem) => void;
  onItemContextMenu: (e: React.MouseEvent, item: ExplorerItem) => void;
  onSortDirectionToggle: () => void;
  dragHandlers: {
    onDragStart: (e: React.DragEvent, item: DragState['draggedItem']) => void;
    onDragOver: (e: React.DragEvent, folderId: string) => void;
    onDrop: (e: React.DragEvent, targetFolderId: string) => void;
    onDragEnd: () => void;
  };
  projectDesignFiles?: { [projectId: string]: any[] };
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
  projectDesignFiles,
  isLoading,
}) => {
  const iconSize = VIEW_MODE_ICON_SIZE[viewMode];

  // 검색 + 정렬
  const filteredItems = useMemo(() => {
    let result = items;

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(item => item.name.toLowerCase().includes(term));
    }

    result = [...result].sort((a, b) => {
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

  // 정렬된 아이템 ID 목록 (Shift 선택용)
  const filteredItemIds = useMemo(() => filteredItems.map(i => i.id), [filteredItems]);

  const handleItemClick = (e: React.MouseEvent, id: string) => {
    onItemClick(id, {
      multi: e.ctrlKey || e.metaKey,
      shift: e.shiftKey,
      orderedIds: filteredItemIds,
    });
  };

  const handleCheckboxClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onItemClick(id, { multi: true });
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  const getTypeLabel = (type: string) => {
    if (type === 'project') return '프로젝트';
    if (type === 'folder') return '폴더';
    return '디자인';
  };

  const getItemIcon = (item: ExplorerItem, size: number, isCard?: boolean) => {
    if (item.type === 'project') {
      return <RxDashboard size={size} className={styles.itemIconProject} />;
    }
    if (item.type === 'folder') {
      return <FcFolder size={size} className={styles.itemIconFolder} />;
    }
    if (isCard) {
      return (
        <div className={styles.designPlaceholder}>
          <FileText size={Math.max(size * 0.35, 20)} />
          <span className={styles.designPlaceholderLabel}>{item.name}</span>
        </div>
      );
    }
    return <FileText size={size} className={styles.itemIconDesign} />;
  };

  // 체크박스 렌더링
  const renderCheckbox = (item: ExplorerItem) => {
    const isSelected = selectedItems.has(item.id);
    return (
      <input
        type="checkbox"
        className={`${styles.itemCheckbox} ${isSelected ? styles.itemCheckboxVisible : ''}`}
        checked={isSelected}
        onChange={() => {}}
        onClick={(e) => handleCheckboxClick(e, item.id)}
        tabIndex={-1}
      />
    );
  };

  // 드래그 속성 생성 헬퍼
  const getDragProps = (item: ExplorerItem) => ({
    draggable: item.type === 'design',
    onDragStart: (e: React.DragEvent) => {
      if (item.type === 'design' && item.projectId) {
        dragHandlers.onDragStart(e, { id: item.id, name: item.name, type: 'design' as const, projectId: item.projectId });
      }
    },
    onDragOver: item.type === 'folder' ? (e: React.DragEvent) => dragHandlers.onDragOver(e, item.id) : undefined,
    onDrop: item.type === 'folder' ? (e: React.DragEvent) => dragHandlers.onDrop(e, item.id) : undefined,
    onDragEnd: dragHandlers.onDragEnd,
  });

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
        <FcFolder size={48} className={styles.emptyIcon} />
        <span>{searchTerm ? '검색 결과가 없습니다' : '항목이 없습니다'}</span>
      </div>
    );
  }

  // ── 자세히 뷰 (테이블) ──
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
            data-item-card
            data-item-id={item.id}
            className={`${styles.tableRow} ${selectedItems.has(item.id) ? styles.tableRowSelected : ''} ${
              dragState.dragOverFolder === item.id ? styles.dragOver : ''
            }`}
            onClick={e => handleItemClick(e, item.id)}
            onDoubleClick={() => onItemDoubleClick(item)}
            onContextMenu={e => onItemContextMenu(e, item)}
            {...getDragProps(item)}
          >
            <div className={styles.colName}>
              {renderCheckbox(item)}
              {getItemIcon(item, 16)}
              <span className={styles.rowName}>{item.name}</span>
            </div>
            <div className={styles.colType}>{getTypeLabel(item.type)}</div>
            <div className={styles.colSize}>
              {item.spaceSize ? `${item.spaceSize.width}x${item.spaceSize.height}x${item.spaceSize.depth}` : '-'}
            </div>
            <div className={styles.colDate}>{formatDate(item.updatedAt)}</div>
            <div className={styles.colActions}>
              <button className={styles.moreBtn} onClick={e => { e.stopPropagation(); onItemContextMenu(e, item); }}>
                <MoreHorizontal size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── 목록 뷰 ──
  if (viewMode === 'list') {
    return (
      <div className={styles.listView}>
        {filteredItems.map(item => (
          <div
            key={item.id}
            data-item-card
            data-item-id={item.id}
            className={`${styles.listItem} ${selectedItems.has(item.id) ? styles.listItemSelected : ''} ${
              dragState.dragOverFolder === item.id ? styles.dragOver : ''
            }`}
            onClick={e => handleItemClick(e, item.id)}
            onDoubleClick={() => onItemDoubleClick(item)}
            onContextMenu={e => onItemContextMenu(e, item)}
            {...getDragProps(item)}
          >
            {renderCheckbox(item)}
            {getItemIcon(item, 16)}
            <span className={styles.listName}>{item.name}</span>
            <span className={styles.listDate}>{formatDate(item.updatedAt)}</span>
          </div>
        ))}
      </div>
    );
  }

  // ── 타일 뷰 ──
  if (viewMode === 'tiles') {
    return (
      <div className={styles.tileGrid}>
        {filteredItems.map(item => (
          <div
            key={item.id}
            data-item-card
            data-item-id={item.id}
            className={`${styles.tileCard} ${selectedItems.has(item.id) ? styles.tileCardSelected : ''} ${
              dragState.dragOverFolder === item.id ? styles.dragOver : ''
            }`}
            onClick={e => handleItemClick(e, item.id)}
            onDoubleClick={() => onItemDoubleClick(item)}
            onContextMenu={e => onItemContextMenu(e, item)}
            {...getDragProps(item)}
          >
            {renderCheckbox(item)}
            <div className={styles.tileThumbnail}>
              {item.thumbnail ? (
                <img src={item.thumbnail} alt={item.name} />
              ) : (
                getItemIcon(item, iconSize, true)
              )}
            </div>
            <div className={styles.tileInfo}>
              <div className={styles.tileName} title={item.name}>{item.name}</div>
              <div className={styles.tileMeta}>
                {getTypeLabel(item.type)}
                {item.spaceSize && ` · ${item.spaceSize.width}x${item.spaceSize.depth}`}
              </div>
              <div className={styles.tileMeta}>{formatDate(item.updatedAt)}</div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── 아이콘 뷰 (extra-large / large / medium / small) ──
  const gridMinWidth = viewMode === 'extra-large' ? 280 : viewMode === 'large' ? 160 : viewMode === 'medium' ? 120 : 90;
  const thumbSize = iconSize;

  return (
    <div
      className={styles.iconGrid}
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${gridMinWidth}px, 1fr))` }}
    >
      {filteredItems.map(item => (
        <div
          key={item.id}
          data-item-card
          data-item-id={item.id}
          className={`${styles.iconCard} ${selectedItems.has(item.id) ? styles.iconCardSelected : ''} ${
            dragState.dragOverFolder === item.id ? styles.dragOver : ''
          }`}
          onClick={e => handleItemClick(e, item.id)}
          onDoubleClick={() => onItemDoubleClick(item)}
          onContextMenu={e => onItemContextMenu(e, item)}
          {...getDragProps(item)}
        >
          {renderCheckbox(item)}
          <div className={styles.iconThumbnail} style={{ width: thumbSize, height: thumbSize }}>
            {(viewMode === 'extra-large' || viewMode === 'large') && item.type === 'project' && projectDesignFiles ? (
              (() => {
                const designFiles = projectDesignFiles[item.id] || [];
                if (designFiles.length === 0) {
                  return (
                    <div className={styles.projectGridEmpty}>
                      <LuFileBox size={32} strokeWidth={1} />
                    </div>
                  );
                }
                const displayItems = designFiles.slice(0, 4);
                return (
                  <div className={styles.projectGrid}>
                    {displayItems.map((df: any) => (
                      <div key={df.id} className={styles.projectGridItem}>
                        <ThumbnailImage
                          project={{ id: item.id, title: item.name } as any}
                          designFile={{
                            thumbnail: df.thumbnail,
                            updatedAt: df.updatedAt,
                            spaceConfig: df.spaceConfig,
                            furniture: df.furniture,
                          }}
                          className={styles.projectGridImg}
                          alt={df.name}
                        />
                      </div>
                    ))}
                    {Array.from({ length: 4 - displayItems.length }).map((_, i) => (
                      <div key={`empty-${i}`} className={styles.projectGridItemEmpty} />
                    ))}
                  </div>
                );
              })()
            ) : item.type === 'project' ? (
              getItemIcon(item, Math.max(thumbSize * 0.5, 16), true)
            ) : item.thumbnail ? (
              <img src={item.thumbnail} alt={item.name} />
            ) : (
              getItemIcon(item, Math.max(thumbSize * 0.5, 16), true)
            )}
          </div>
          <div className={styles.iconName} title={item.name} style={{ maxWidth: thumbSize + 20 }}>
            {item.name}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ContentPane;
