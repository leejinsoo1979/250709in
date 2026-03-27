/**
 * 서라운드 패널 갤러리 - 기타 탭에서 좌/우/상단 패널 개별 배치
 */
import React, { useCallback, useMemo } from 'react';
import { surroundPanelModules, SurroundPanelModuleData } from '@/data/modules/surroundPanels';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import styles from './SurroundPanelGallery.module.css';

const SurroundPanelGallery: React.FC = () => {
  const {
    selectedFurnitureId,
    setSelectedFurnitureId,
    setFurniturePlacementMode,
    placedModules,
  } = useFurnitureStore();

  // 각 타입별 이미 배치된 서라운드 패널 확인
  const placedPanelTypes = useMemo(() => {
    const types = new Set<string>();
    for (const m of placedModules) {
      if (m.isSurroundPanel && m.surroundPanelType) {
        types.add(m.surroundPanelType);
      }
    }
    return types;
  }, [placedModules]);

  // 카드 클릭 → 배치 모드 활성화
  const handleCardClick = useCallback((panel: SurroundPanelModuleData) => {
    // 이미 배치된 타입은 클릭 불가
    if (placedPanelTypes.has(panel.panelType)) return;

    // 이미 같은 패널 선택 중이면 토글 해제
    if (selectedFurnitureId === panel.id) {
      setSelectedFurnitureId(null);
      setFurniturePlacementMode(false);
      return;
    }

    setSelectedFurnitureId(panel.id);
    setFurniturePlacementMode(true);
  }, [selectedFurnitureId, placedPanelTypes, setSelectedFurnitureId, setFurniturePlacementMode]);

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>서라운드 패널</h3>
      <p className={styles.description}>독립 패널을 배치합니다. 클릭하면 자동으로 배치됩니다.</p>

      <div className={styles.cardList}>
        {surroundPanelModules.map((panel) => {
          const isPlaced = placedPanelTypes.has(panel.panelType);
          const isActive = selectedFurnitureId === panel.id;

          return (
            <div
              key={panel.id}
              className={`${styles.card} ${isActive ? styles.active : ''} ${isPlaced ? styles.placed : ''}`}
              onClick={() => handleCardClick(panel)}
            >
              <div className={styles.cardHeader}>
                <span className={styles.panelName}>{panel.name}</span>
                {isPlaced && <span className={styles.placedBadge}>배치됨</span>}
              </div>

              <div className={styles.cardInfo}>
                <span>클릭하여 배치</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SurroundPanelGallery;
