import React, { useMemo } from 'react';
import { FileText, MoreHorizontal, Sparkles, Search, Trash2 } from 'lucide-react';
import { LuFileBox } from 'react-icons/lu';
import { IoBanOutline } from 'react-icons/io5';
import { FcFolder } from 'react-icons/fc';
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
  onSelectAll?: () => void;
  onClearSelection?: () => void;
  isNewUser?: boolean;
  userName?: string;
  onCreateProject?: () => void;
  activeMenu?: string;
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
  onSelectAll,
  onClearSelection,
  isNewUser,
  userName,
  onCreateProject,
  activeMenu,
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
        cmp = aTime - bTime;
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

  // 빈 영역 클릭 시 선택 해제
  const handleGridClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('[data-item-card]')) {
      onClearSelection?.();
    }
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

  const formatDateFull = (timestamp: any) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
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

  // 체크박스 렌더링 (호버 시 표시, 선택된 아이템은 항상 표시)
  const hasSelection = selectedItems.size > 0;
  const renderCheckbox = (item: ExplorerItem) => {
    const isSelected = selectedItems.has(item.id);
    return (
      <input
        type="checkbox"
        className={`${styles.itemCheckbox} ${isSelected ? styles.itemCheckboxVisible : ''}`}
        checked={isSelected}
        onChange={() => {}}
        onClick={(e) => handleCheckboxClick(e, item.id)}
        draggable={false}
        tabIndex={-1}
      />
    );
  };

  // 드래그 속성 생성 헬퍼
  const getDragProps = (item: ExplorerItem) => {
    const isFolder = item.type === 'folder';
    const isDesign = item.type === 'design';
    return {
      draggable: isDesign,
      onDragStart: (e: React.DragEvent) => {
        if (isDesign && item.projectId) {
          dragHandlers.onDragStart(e, { id: item.id, name: item.name, type: 'design' as const, projectId: item.projectId });
        }
      },
      // 폴더: 드롭 대상 — onDragOver에서 preventDefault 필수
      onDragOver: isFolder ? (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragHandlers.onDragOver(e, item.id);
      } : undefined,
      onDragEnter: isFolder ? (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
      } : undefined,
      onDrop: isFolder ? (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragHandlers.onDrop(e, item.id);
      } : undefined,
      onDragLeave: isFolder ? (e: React.DragEvent) => {
        // 자식 요소로 이동할 때 dragLeave가 발생하지 않도록
        const rect = e.currentTarget.getBoundingClientRect();
        if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
          dragHandlers.onDragOver(e, '');
        }
      } : undefined,
      onDragEnd: dragHandlers.onDragEnd,
    };
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
    // 검색 결과 없음
    if (searchTerm) {
      return (
        <div className={styles.emptyState}>
          <Search size={48} className={styles.emptyIcon} />
          <span>검색 결과가 없습니다</span>
        </div>
      );
    }

    // 최초 가입자 환영 화면
    if (isNewUser) {
      return (
        <div className={styles.welcomeState}>
          <h2 className={styles.welcomeTitle}>
            {userName ? `${userName}님, 환영합니다!` : '환영합니다!'}
          </h2>
          <p className={styles.welcomeSubtitle}>
            나만의 가구를 디자인해보세요
          </p>
          <button className={styles.welcomeButton} onClick={onCreateProject}>
            + 첫 프로젝트 만들기
          </button>
        </div>
      );
    }

    // 일반 빈 상태
    return (
      <div className={styles.emptyState}>
        {activeMenu === 'trash' ? (
          <>
            <Trash2 size={40} className={styles.emptyIcon} />
            <span>휴지통이 비어있습니다</span>
          </>
        ) : (
          <>
            <RxDashboard size={40} className={styles.emptyIcon} />
            <span>항목이 없습니다</span>
          </>
        )}
      </div>
    );
  }

  // ── 자세히 뷰 (테이블) ──
  if (viewMode === 'details') {
    return (
      <div className={styles.detailsTable} onClick={handleGridClick}>
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
      <div className={styles.listView} onClick={handleGridClick}>
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
      <div className={styles.tileGrid} onClick={handleGridClick}>
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
              {(item.type === 'design' && (!item.furnitureCount || item.furnitureCount === 0)) ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: 'var(--theme-background-secondary, #1a1a1a)', color: 'var(--theme-text-muted, #666)' }}>
                  <IoBanOutline size={20} />
                </div>
              ) : item.thumbnail ? (
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

  // ── SaaS 카드 뷰 (extra-large) ──
  if (viewMode === 'extra-large') {
    return (
      <div
        className={styles.saasGrid}
        onClick={handleGridClick}
      >
        {filteredItems.map(item => {
          // 프로젝트/디자인/폴더 → SaaS 카드
          return (
            <div
              key={item.id}
              data-item-card
              data-item-id={item.id}
              className={`${styles.saasCard} ${selectedItems.has(item.id) ? styles.saasCardSelected : ''} ${
                dragState.dragOverFolder === item.id ? styles.dragOver : ''
              }`}
              onClick={e => handleItemClick(e, item.id)}
              onDoubleClick={() => onItemDoubleClick(item)}
              onContextMenu={e => onItemContextMenu(e, item)}
              {...getDragProps(item)}
            >
              {renderCheckbox(item)}
              <div className={styles.saasThumbnailArea}>
                {item.type === 'folder' ? (
                  <div className={styles.saasFolderIcon}>
                    <FcFolder size={200} />
                  </div>
                ) : item.type === 'project' && projectDesignFiles ? (
                  (() => {
                    const designFiles = projectDesignFiles[item.id] || [];
                    if (designFiles.length === 0) {
                      return (
                        <div className={styles.projectGridEmpty}>
                          <LuFileBox size={40} strokeWidth={1} />
                        </div>
                      );
                    }
                    const displayItems = designFiles.slice(0, 4);
                    return (
                      <div className={styles.saasProjectGrid}>
                        {displayItems.map((df: any) => (
                          <div key={df.id} className={styles.saasProjectGridItem}>
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
                          <div key={`empty-${i}`} className={styles.saasProjectGridItemEmpty}>
                            <LuFileBox size={24} strokeWidth={1} />
                          </div>
                        ))}
                      </div>
                    );
                  })()
                ) : (item.type === 'design' && (!item.furnitureCount || item.furnitureCount === 0)) ? (
                  <div className={styles.projectGridEmpty} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--theme-background-secondary, #1a1a1a)', color: 'var(--theme-text-muted, #666)' }}>
                    <IoBanOutline size={20} />
                  </div>
                ) : item.thumbnail ? (
                  <img src={item.thumbnail} alt={item.name} className={styles.saasSingleThumb} />
                ) : (
                  <div className={styles.projectGridEmpty}>
                    {getItemIcon(item, 40, true)}
                  </div>
                )}
              </div>
              <div className={styles.saasInfoArea}>
                <div className={styles.saasName} title={item.name}>{item.name}</div>
                <div className={styles.saasDate}>{formatDateFull(item.updatedAt)}</div>
                {item.ownerName && (
                  <div className={styles.saasOwner}>
                    {item.ownerPhotoURL ? (
                      <img src={item.ownerPhotoURL} alt={item.ownerName} className={styles.saasAvatar} />
                    ) : (
                      <div className={styles.saasAvatarFallback}>{item.ownerName.charAt(0)}</div>
                    )}
                    <span className={styles.saasOwnerName}>{item.ownerName}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ── 아이콘 뷰 (large / medium / small) ──
  const gridMinWidth = viewMode === 'large' ? 240 : viewMode === 'medium' ? 160 : 90;
  const thumbSize = iconSize;

  return (
    <div
      className={styles.iconGrid}
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${gridMinWidth}px, 1fr))` }}
      onClick={handleGridClick}
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
            {viewMode === 'large' && item.type === 'project' && projectDesignFiles ? (
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
            ) : (item.type === 'design' && (!item.furnitureCount || item.furnitureCount === 0)) ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: 'var(--theme-background-secondary, #1a1a1a)', color: 'var(--theme-text-muted, #666)' }}>
                <IoBanOutline size={20} />
              </div>
            ) : item.thumbnail ? (
              <img src={item.thumbnail} alt={item.name} />
            ) : (
              getItemIcon(item, Math.max(thumbSize * 0.5, 16), true)
            )}
          </div>
          <div className={styles.iconInfo} style={{ maxWidth: thumbSize + 20 }}>
            <div className={styles.iconName} title={item.name}>
              {item.name}
            </div>
            {item.spaceSize && (
              <div className={styles.iconSpaceSize}>
                {item.spaceSize.width} × {item.spaceSize.depth} × {item.spaceSize.height}
              </div>
            )}
            <div className={styles.iconMeta}>
              {formatDateFull(item.updatedAt)}
              {item.type === 'project' && projectDesignFiles && (
                <span> · {(projectDesignFiles[item.id] || []).length}개 파일</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ContentPane;
