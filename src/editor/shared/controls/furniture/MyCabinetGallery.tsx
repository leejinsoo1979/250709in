import React, { useEffect, useCallback } from 'react';
import { useMyCabinetStore } from '@/store/core/myCabinetStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { SavedCabinet } from '@/firebase/types';
import { createCustomizableModuleId } from './CustomizableFurnitureLibrary';
import { MdOutlineAutoAwesomeMosaic } from 'react-icons/md';
import styles from './CustomizableFurnitureLibrary.module.css';

interface MyCabinetGalleryProps {
  filter?: 'full' | 'upper' | 'lower' | 'all';
}

const CATEGORY_LABELS: Record<string, string> = {
  full: '전체장',
  upper: '상부장',
  lower: '하부장',
};

const MyCabinetGallery: React.FC<MyCabinetGalleryProps> = ({ filter = 'all' }) => {
  const { savedCabinets, isLoading, fetchCabinets, deleteCabinet, setPendingPlacement } = useMyCabinetStore();
  const { setSelectedFurnitureId, setFurniturePlacementMode } = useFurnitureStore();

  useEffect(() => {
    fetchCabinets();
  }, [fetchCabinets]);

  const filteredCabinets = filter === 'all'
    ? savedCabinets
    : savedCabinets.filter((c) => c.category === filter);

  const handleItemClick = useCallback((cabinet: SavedCabinet) => {
    // pendingPlacement에 저장된 설정 세팅
    setPendingPlacement({
      customConfig: cabinet.customConfig,
      width: cabinet.width,
      height: cabinet.height,
      depth: cabinet.depth,
      category: cabinet.category,
    });

    // 해당 카테고리의 커스터마이징 가구 모듈 ID 생성
    const moduleId = createCustomizableModuleId(cabinet.category, cabinet.width);
    setSelectedFurnitureId(moduleId);
    setFurniturePlacementMode(true);
  }, [setPendingPlacement, setSelectedFurnitureId, setFurniturePlacementMode]);

  const handleDelete = useCallback(async (e: React.MouseEvent, cabinetId: string) => {
    e.stopPropagation();
    if (window.confirm('이 캐비닛을 삭제하시겠습니까?')) {
      await deleteCabinet(cabinetId);
    }
  }, [deleteCabinet]);

  if (isLoading) {
    return (
      <div className={styles.container}>
        <p className={styles.helpText}>불러오는 중...</p>
      </div>
    );
  }

  if (filteredCabinets.length === 0) {
    return (
      <div className={styles.container}>
        <p className={styles.helpText}>
          저장된 캐비닛이 없습니다.
          <br />
          커스텀 캐비닛을 편집한 후 "My캐비닛에 저장"을 눌러 저장하세요.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {filteredCabinets.map((cabinet) => (
        <div
          key={cabinet.id}
          className={styles.item}
          onClick={() => handleItemClick(cabinet)}
        >
          <div className={styles.itemIcon}>
            <MdOutlineAutoAwesomeMosaic size={32} />
          </div>
          <div className={styles.itemInfo}>
            <span className={styles.itemLabel}>{cabinet.name}</span>
            <span className={styles.itemDimension}>
              {CATEGORY_LABELS[cabinet.category]} | {cabinet.width} x {cabinet.height} x {cabinet.depth} mm
            </span>
          </div>
          <button
            onClick={(e) => handleDelete(e, cabinet.id)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--theme-text-tertiary)',
              cursor: 'pointer',
              padding: '4px',
              fontSize: '16px',
              marginLeft: 'auto',
              flexShrink: 0,
            }}
            title="삭제"
          >
            ×
          </button>
        </div>
      ))}
      <p className={styles.helpText}>
        클릭 후 공간에 배치하세요. 저장된 내부 구조가 자동 적용됩니다.
      </p>
    </div>
  );
};

export default MyCabinetGallery;
