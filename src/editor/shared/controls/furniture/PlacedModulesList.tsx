import React, { useState } from 'react';
import { getModuleById } from '@/data/modules';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import FurnitureInfoModal from './FurnitureInfoModal';
import { Module, PlacedModule } from '@/types/module';
import styles from './PlacedModulesList.module.css';

// 가구 썸네일 이미지 경로
const getImagePath = (filename: string) => {
  return `${import.meta.env.BASE_URL}images/furniture-thumbnails/${filename}`;
};

const FURNITURE_ICONS: Record<string, string> = {
  'single-2drawer-hanging': getImagePath('single-2drawer-hanging.png'),
  'single-2hanging': getImagePath('single-2hanging.png'), 
  'single-4drawer-hanging': getImagePath('single-4drawer-hanging.png'),
  'dual-2drawer-hanging': getImagePath('dual-2drawer-hanging.png'),
  'dual-2hanging': getImagePath('dual-2hanging.png'),
  'dual-4drawer-hanging': getImagePath('dual-4drawer-hanging.png'),
  'dual-2drawer-styler': getImagePath('dual-2drawer-styler.png'),
  'dual-4drawer-pantshanger': getImagePath('dual-4drawer-pantshanger.png'),
  'upper-cabinet-shelf': getImagePath('upper-cabinet-shelf.png'),
  'upper-cabinet-open': getImagePath('upper-cabinet-open.png'),
  'upper-cabinet-mixed': getImagePath('upper-cabinet-mixed.png'),
};

const PlacedModulesList: React.FC = () => {
  const { spaceInfo } = useSpaceConfigStore();
  const placedModules = useFurnitureStore(state => state.placedModules);
  const removeModule = useFurnitureStore(state => state.removeModule);
  const selectedPlacedModuleId = useFurnitureStore(state => state.selectedPlacedModuleId);
  const setSelectedPlacedModuleId = useFurnitureStore(state => state.setSelectedPlacedModuleId);
  
  // 팝업 상태 관리
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedModuleData, setSelectedModuleData] = useState<Module | null>(null);
  const [selectedPlacedModule, setSelectedPlacedModule] = useState<PlacedModule | null>(null);
  
  // 내경 공간 계산
  const internalSpace = calculateInternalSpace(spaceInfo);
  
  // 배치된 가구가 없는 경우 안내 메시지 표시
  if (placedModules.length === 0) {
    return (
      <div className={styles.container}>
        <h3 className={styles.title}>배치된 모듈</h3>
        <div className={styles.emptyMessage}>
          <p>가구를 배치하려면 라이브러리에서 가구를 드래그하여 3D 뷰어에 놓으세요.</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className={styles.container}>
      <h3 className={styles.title}>배치된 모듈 ({placedModules.length})</h3>
      
      <div className={styles.listContainer}>
        {placedModules.map((placedModule) => {
          // customWidth가 있으면 해당 너비로 모듈 ID 생성
          let targetModuleId = placedModule.moduleId;
          if (placedModule.customWidth) {
            const baseType = placedModule.moduleId.replace(/-\d+$/, '');
            targetModuleId = `${baseType}-${placedModule.customWidth}`;
          }
          
          const moduleData = getModuleById(targetModuleId, internalSpace, spaceInfo);
          if (!moduleData) {
            console.error('❌ [PlacedModulesList] 모듈을 찾을 수 없음:', placedModule.moduleId);
            return null;
          }
          
          // 선택 상태 확인
          const isSelected = selectedPlacedModuleId === placedModule.moduleId;
          
          // 가구 ID에서 기본 타입 추출 (너비 정보 제거)
          // baseModuleType 필드를 우선적으로 사용 (소수점 너비 대응)
          const baseModuleType = placedModule.baseModuleType || placedModule.moduleId.replace(/-[\d.]+$/, '');
          const iconPath = FURNITURE_ICONS[baseModuleType] || FURNITURE_ICONS['single-2drawer-hanging'];
          
          // 가구 클릭 시 팝업 열기
          const handleItemClick = () => {
            setSelectedModuleData(moduleData);
            setSelectedPlacedModule(placedModule);
            setIsModalOpen(true);
            setSelectedPlacedModuleId(placedModule.moduleId);
          };
          
          return (
            <div 
              key={placedModule.id}
              className={`${styles.itemContainer} ${isSelected ? styles.selected : ''}`}
              onClick={handleItemClick}
            >
              <div className={styles.previewContainer}>
                <img 
                  src={iconPath} 
                  alt={moduleData.name}
                  className={styles.preview}
                  onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    img.src = getImagePath('single-2drawer-hanging.png');
                  }}
                />
              </div>
              
              <div className={styles.infoContainer}>
                <div className={styles.name}>
                  {/* customWidth가 있고 moduleData 너비와 다르면 customWidth 표시 */}
                  {placedModule.customWidth && placedModule.customWidth !== moduleData.dimensions.width
                    ? moduleData.name.replace(/\d+mm/, `${placedModule.customWidth}mm`)
                    : moduleData.name}
                </div>
                <div className={styles.dimensions}>
                  {placedModule.customWidth || moduleData.dimensions.width} × {moduleData.dimensions.height} × {placedModule.customDepth || moduleData.dimensions.depth}mm
                </div>
                <div className={styles.slotInfo}>
                  슬롯 {placedModule.slotIndex + 1}
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
      
      {/* 가구 정보 팝업 */}
      <FurnitureInfoModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        moduleData={selectedModuleData}
        placedModule={selectedPlacedModule}
      />
    </div>
  );
};

export default PlacedModulesList;