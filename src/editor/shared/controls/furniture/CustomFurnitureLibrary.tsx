import React, { useState, useCallback } from 'react';
import { useCustomFurnitureStore, CustomFurnitureData } from '@/store/core/customFurnitureStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import CustomFurnitureUpload from './CustomFurnitureUpload';
import styles from './CustomFurnitureLibrary.module.css';

interface CustomFurnitureLibraryProps {
  onFurnitureSelect?: (furniture: CustomFurnitureData) => void;
  filter?: 'all' | 'full' | 'upper' | 'lower';
  showHeader?: boolean;
  onOpenUploadModal?: () => void;
}

const CustomFurnitureLibrary: React.FC<CustomFurnitureLibraryProps> = ({
  onFurnitureSelect,
  filter: externalFilter,
  showHeader = true,
  onOpenUploadModal,
}) => {
  const { customFurnitures, removeCustomFurniture, selectedCustomFurnitureId, setSelectedCustomFurniture } = useCustomFurnitureStore();
  const { spaceInfo } = useSpaceConfigStore();
  const { addModule, setFurniturePlacementMode, setCurrentDragData } = useFurnitureStore();
  const { setIsSlotDragging, activeDroppedCeilingTab } = useUIStore();

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [internalFilter, setInternalFilter] = useState<'all' | 'full' | 'upper' | 'lower'>('all');

  // 외부 필터가 있으면 외부 필터 사용, 없으면 내부 필터 사용
  const filter = externalFilter ?? internalFilter;
  const setFilter = setInternalFilter;

  // 필터링된 가구 목록
  const filteredFurnitures = customFurnitures.filter(
    (f) => filter === 'all' || f.category === filter
  );

  // 가구 선택 핸들러
  const handleFurnitureClick = useCallback((furniture: CustomFurnitureData) => {
    setSelectedCustomFurniture(furniture.id);
    onFurnitureSelect?.(furniture);
  }, [setSelectedCustomFurniture, onFurnitureSelect]);

  // 가구 삭제 핸들러
  const handleDelete = useCallback((e: React.MouseEvent, furnitureId: string) => {
    e.stopPropagation();
    if (window.confirm('이 커스텀 가구를 삭제하시겠습니까?')) {
      removeCustomFurniture(furnitureId);
    }
  }, [removeCustomFurniture]);

  // 드래그 시작 핸들러
  const handleDragStart = useCallback((e: React.DragEvent, furniture: CustomFurnitureData) => {
    setFurniturePlacementMode(true);
    setIsSlotDragging(true);

    // 드래그 데이터 설정
    const zone = activeDroppedCeilingTab === 'dropped' ? 'dropped' : 'normal';
    const indexing = calculateSpaceIndexing(spaceInfo);

    setCurrentDragData({
      moduleId: `custom-${furniture.id}`,
      isDualSlot: false,
      zone,
      indexing,
      isCustomFurniture: true,
      customFurnitureData: furniture,
    });

    // 드래그 이미지 설정
    if (furniture.thumbnail) {
      const img = new Image();
      img.src = furniture.thumbnail;
      e.dataTransfer.setDragImage(img, 50, 50);
    }

    e.dataTransfer.effectAllowed = 'copy';
  }, [spaceInfo, activeDroppedCeilingTab, setFurniturePlacementMode, setIsSlotDragging, setCurrentDragData]);

  // 드래그 종료 핸들러
  const handleDragEnd = useCallback(() => {
    setFurniturePlacementMode(false);
    setIsSlotDragging(false);
    setCurrentDragData(null);
  }, [setFurniturePlacementMode, setIsSlotDragging, setCurrentDragData]);

  // 카테고리 라벨
  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'full': return '전체장';
      case 'upper': return '상부장';
      case 'lower': return '하부장';
      default: return category;
    }
  };

  // 업로드 모달 열기 핸들러
  const handleOpenUploadModal = useCallback(() => {
    if (onOpenUploadModal) {
      onOpenUploadModal();
    } else {
      setShowUploadModal(true);
    }
  }, [onOpenUploadModal]);

  return (
    <div className={styles.libraryContainer}>
      {/* 헤더 - showHeader가 true일 때만 표시 */}
      {showHeader && (
        <>
          <div className={styles.header}>
            <h4>커스텀 가구</h4>
            <button
              className={styles.addButton}
              onClick={handleOpenUploadModal}
            >
              + 추가
            </button>
          </div>

          {/* 필터 */}
          <div className={styles.filterBar}>
            <button
              className={`${styles.filterButton} ${filter === 'all' ? styles.active : ''}`}
              onClick={() => setFilter('all')}
            >
              전체 ({customFurnitures.length})
            </button>
            <button
              className={`${styles.filterButton} ${filter === 'full' ? styles.active : ''}`}
              onClick={() => setFilter('full')}
            >
              전체장
            </button>
            <button
              className={`${styles.filterButton} ${filter === 'upper' ? styles.active : ''}`}
              onClick={() => setFilter('upper')}
            >
              상부장
            </button>
            <button
              className={`${styles.filterButton} ${filter === 'lower' ? styles.active : ''}`}
              onClick={() => setFilter('lower')}
            >
              하부장
            </button>
          </div>
        </>
      )}

      {/* 하위 탭 (showHeader가 false일 때 표시) */}
      {!showHeader && (
        <div className={styles.subTabs}>
          <button
            className={styles.subTab}
            style={{ flex: 1 }}
          >
            전체 ({filteredFurnitures.length})
          </button>
          <button
            className={styles.addSubTab}
            onClick={handleOpenUploadModal}
          >
            + 추가
          </button>
        </div>
      )}

      {/* 가구 그리드 */}
      {filteredFurnitures.length > 0 ? (
        <div className={styles.furnitureGrid}>
          {filteredFurnitures.map((furniture) => (
            <div
              key={furniture.id}
              className={`${styles.furnitureItem} ${
                selectedCustomFurnitureId === furniture.id ? styles.selected : ''
              }`}
              onClick={() => handleFurnitureClick(furniture)}
              draggable
              onDragStart={(e) => handleDragStart(e, furniture)}
              onDragEnd={handleDragEnd}
            >
              {/* 썸네일 */}
              <div className={styles.thumbnail}>
                {furniture.thumbnail ? (
                  <img src={furniture.thumbnail} alt={furniture.name} />
                ) : (
                  <div className={styles.noThumbnail}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                      <line x1="12" y1="22.08" x2="12" y2="12" />
                    </svg>
                  </div>
                )}
              </div>

              {/* 정보 */}
              <div className={styles.info}>
                <span className={styles.name}>{furniture.name}</span>
                <span className={styles.category}>
                  {getCategoryLabel(furniture.category)}
                </span>
                <span className={styles.dimensions}>
                  {furniture.originalDimensions.width} ×{' '}
                  {furniture.originalDimensions.depth} ×{' '}
                  {furniture.originalDimensions.height}
                </span>
              </div>

              {/* 삭제 버튼 */}
              <button
                className={styles.deleteButton}
                onClick={(e) => handleDelete(e, furniture.id)}
                title="삭제"
              >
                ×
              </button>

              {/* 패널 수 뱃지 */}
              {furniture.panels.length > 0 && (
                <span className={styles.panelBadge}>
                  {furniture.panels.length} 패널
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <svg className={styles.emptyIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <p>커스텀 가구가 없습니다</p>
          <button
            className={styles.emptyAddButton}
            onClick={() => setShowUploadModal(true)}
          >
            가구 추가하기
          </button>
        </div>
      )}

      {/* 업로드 모달 */}
      {showUploadModal && (
        <div className={styles.modalOverlay}>
          <CustomFurnitureUpload
            onClose={() => setShowUploadModal(false)}
            onSuccess={() => setShowUploadModal(false)}
          />
        </div>
      )}
    </div>
  );
};

export default CustomFurnitureLibrary;
