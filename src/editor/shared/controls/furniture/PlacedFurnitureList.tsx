import React from 'react';
import { getModuleById } from '@/data/modules';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import styles from './PlacedFurnitureList.module.css';

const PlacedFurnitureList: React.FC = () => {
  const { spaceInfo } = useSpaceConfigStore();
  const placedModules = useFurnitureStore(state => state.placedModules);
  const removeModule = useFurnitureStore(state => state.removeModule);
  const selectedPlacedModuleId = useFurnitureStore(state => state.selectedPlacedModuleId);
  const setSelectedPlacedModuleId = useFurnitureStore(state => state.setSelectedPlacedModuleId);
  
  // 내경 공간 계산
  const internalSpace = calculateInternalSpace(spaceInfo);
  
  // 배치된 가구가 없는 경우 안내 메시지 표시
  if (placedModules.length === 0) {
    return (
      <div className={styles.container}>
        <h3 className={styles.title}>배치된 가구</h3>
        <div className={styles.emptyMessage}>
          <p>가구를 배치하려면 라이브러리에서 가구를 드래그하여 3D 뷰어에 놓으세요.</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className={styles.container}>
      <h3 className={styles.title}>배치된 가구 ({placedModules.length})</h3>
      
      <div className={styles.listContainer}>
        {placedModules.map((placedModule) => {
          // 모듈 데이터 가져오기
          const moduleData = getModuleById(placedModule.moduleId, internalSpace, spaceInfo);
          if (!moduleData) return null;
          
          // 선택 상태 확인
          const isSelected = selectedPlacedModuleId === placedModule.moduleId;
          
          return (
            <div 
              key={placedModule.id}
              className={`${styles.itemContainer} ${isSelected ? styles.selected : ''}`}
              onClick={() => setSelectedPlacedModuleId(isSelected ? null : placedModule.moduleId)}
            >
              <div className={styles.previewContainer}>
                <div 
                  className={styles.preview}
                  style={{ backgroundColor: moduleData.color }}
                />
              </div>
              
              <div className={styles.infoContainer}>
                <div className={styles.name}>{moduleData.name}</div>
                <div className={styles.dimensions}>
                  {moduleData.dimensions.width} × {moduleData.dimensions.height} × {placedModule.customDepth || moduleData.dimensions.depth}mm
                </div>
              </div>
              
              <div className={styles.actionsContainer}>
                <button
                  className={styles.removeButton}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeModule(placedModule.id);
                  }}
                  title="가구 제거"
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PlacedFurnitureList; 