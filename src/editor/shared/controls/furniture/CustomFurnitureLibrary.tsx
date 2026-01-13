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
}

const CustomFurnitureLibrary: React.FC<CustomFurnitureLibraryProps> = ({
  onFurnitureSelect,
}) => {
  const { customFurnitures, removeCustomFurniture, selectedCustomFurnitureId, setSelectedCustomFurniture } = useCustomFurnitureStore();
  const { spaceInfo } = useSpaceConfigStore();
  const { addModule, setFurniturePlacementMode, setCurrentDragData } = useFurnitureStore();
  const { setIsSlotDragging, activeDroppedCeilingTab } = useUIStore();

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [filter, setFilter] = useState<'all' | 'full' | 'upper' | 'lower'>('all');

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

  return (
    <div className={styles.libraryContainer}>
      {/* 헤더 */}
      <div className={styles.header}>
        <h4>커스텀 가구</h4>
        <button
          className={styles.addButton}
          onClick={() => setShowUploadModal(true)}
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
                  <div className={styles.noThumbnail}>📦</div>
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
          <span className={styles.emptyIcon}>📁</span>
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
