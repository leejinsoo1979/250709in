import React, { useState } from 'react';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import { getModuleById } from '@/data/modules';
import { isSlotAvailable, findNextAvailableSlot } from '@/editor/shared/utils/slotAvailability';
import styles from './ModuleGalleryNew.module.css';

type FurnitureType = 'tall' | 'lower' | 'panel';
type FurnitureCategory = 'all' | 'single' | 'dual';

interface Module {
  id: string;
  name: string;
  image: string;
  type: FurnitureType;
  category: FurnitureCategory;
}

interface ModuleGalleryNewProps {
  modules: Module[];
  onModuleSelect: (moduleId: string) => void;
  selectedModuleId?: string;
}

const ModuleGalleryNew: React.FC<ModuleGalleryNewProps> = ({
  modules,
  onModuleSelect,
  selectedModuleId
}) => {
  const { spaceInfo } = useSpaceConfigStore();
  const placedModules = useFurnitureStore(state => state.placedModules);
  const addModule = useFurnitureStore(state => state.addModule);
  const { selectedModuleForPlacement, setSelectedModuleForPlacement } = useUIStore();
  
  const [selectedType, setSelectedType] = useState<FurnitureType>('tall');
  const [selectedCategory, setSelectedCategory] = useState<FurnitureCategory>('all');

  const furnitureTypes = [
    { id: 'tall' as FurnitureType, label: '키큰장' },
    { id: 'lower' as FurnitureType, label: '하부장' },
    { id: 'panel' as FurnitureType, label: '패널' }
  ];

  const furnitureCategories = [
    { id: 'all' as FurnitureCategory, label: '전체' },
    { id: 'single' as FurnitureCategory, label: '싱글' },
    { id: 'dual' as FurnitureCategory, label: '듀얼' }
  ];

  const filteredModules = modules.filter(module => {
    const typeMatch = module.type === selectedType;
    const categoryMatch = selectedCategory === 'all' || module.category === selectedCategory;
    return typeMatch && categoryMatch;
  });

  // 가구를 빈 슬롯에 자동 배치하는 함수
  const handleModuleDoubleClick = (moduleId: string) => {
    try {
      // 공간 인덱싱 계산
      const indexing = calculateSpaceIndexing(spaceInfo);
      const internalSpace = calculateInternalSpace(spaceInfo);
      
      // 모듈 데이터 가져오기
      const moduleData = getModuleById(moduleId, internalSpace, spaceInfo);
      if (!moduleData) {
        console.error('모듈 데이터를 찾을 수 없습니다:', moduleId);
        return;
      }
      
      // 듀얼/싱글 가구 판별
      const isDualFurniture = moduleData.id.startsWith('dual-');
      
      // 첫 번째 빈 슬롯 찾기
      let availableSlotIndex = -1;
      
      // 모든 슬롯을 순회하며 빈 슬롯 찾기
      for (let i = 0; i < indexing.columnCount; i++) {
        if (isSlotAvailable(i, isDualFurniture, placedModules, spaceInfo, moduleId)) {
          availableSlotIndex = i;
          break;
        }
      }
      
      // 첫 번째 슬롯에서 찾지 못하면 다음 사용 가능한 슬롯 찾기
      if (availableSlotIndex === -1) {
        availableSlotIndex = findNextAvailableSlot(0, 'right', isDualFurniture, placedModules, spaceInfo, moduleId) || -1;
      }
      
      if (availableSlotIndex === -1) {
        console.warn('사용 가능한 슬롯이 없습니다.');
        return;
      }
      
      // 가구 위치 계산
      let positionX: number;
      if (isDualFurniture && indexing.threeUnitDualPositions) {
        positionX = indexing.threeUnitDualPositions[availableSlotIndex];
      } else {
        positionX = indexing.threeUnitPositions[availableSlotIndex];
      }
      
      // 기본 깊이 계산
      const getDefaultDepth = (moduleData: any) => {
        if (moduleData?.defaultDepth) {
          return Math.min(moduleData.defaultDepth, spaceInfo.depth);
        }
        const spaceBasedDepth = Math.floor(spaceInfo.depth * 0.9);
        return Math.min(spaceBasedDepth, 580);
      };
      
      // 고유 ID 생성
      const placedId = `placed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // 새 모듈 생성
      const newModule = {
        id: placedId,
        moduleId: moduleId,
        position: {
          x: positionX,
          y: 0,
          z: 0
        },
        rotation: 0,
        hasDoor: false,
        customDepth: getDefaultDepth(moduleData),
        slotIndex: availableSlotIndex,
        isDualSlot: isDualFurniture,
        isValidInCurrentSpace: true
      };
      
      // 가구 배치
      addModule(newModule);
      
      // 배치된 가구를 자동으로 선택
      const setSelectedPlacedModuleId = useFurnitureStore.getState().setSelectedPlacedModuleId;
      setSelectedPlacedModuleId(placedId);
      
      console.log(`✅ 가구 "${moduleData.name}"을 슬롯 ${availableSlotIndex + 1}에 자동 배치했습니다.`, {
        moduleId,
        slotIndex: availableSlotIndex,
        position: newModule.position,
        isDual: isDualFurniture,
        selectedId: placedId
      });
      
    } catch (error) {
      console.error('가구 자동 배치 중 오류 발생:', error);
    }
  };

  return (
    <div className={styles.moduleGallery}>
      {/* 타입 필터 */}
      <div className={styles.filterSection}>
        <div className={styles.filterGroup}>
          {furnitureTypes.map((type) => (
            <button
              key={type.id}
              className={`${styles.filterButton} ${selectedType === type.id ? styles.active : ''}`}
              onClick={() => setSelectedType(type.id)}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {/* 카테고리 필터 */}
      <div className={styles.filterSection}>
        <div className={styles.filterGroup}>
          {furnitureCategories.map((category) => (
            <button
              key={category.id}
              className={`${styles.filterButton} ${selectedCategory === category.id ? styles.active : ''}`}
              onClick={() => setSelectedCategory(category.id)}
            >
              {category.label}
            </button>
          ))}
        </div>
      </div>

      {/* 모듈 그리드 */}
      <div className={styles.moduleGrid}>
        {filteredModules.map((module) => (
          <div
            key={module.id}
            className={`${styles.moduleCard} ${selectedModuleForPlacement === module.id ? styles.selected : ''}`}
            onClick={() => {
              // 같은 모듈을 다시 클릭하면 선택 해제
              if (selectedModuleForPlacement === module.id) {
                setSelectedModuleForPlacement(null);
              } else {
                setSelectedModuleForPlacement(module.id);
              }
              onModuleSelect(module.id);
            }}
            onDoubleClick={() => handleModuleDoubleClick(module.id)}
            title="클릭: 선택, 더블클릭: 자동 배치"
          >
            <div className={styles.moduleImage}>
              <img src={module.image} alt={module.name} />
            </div>
            <div className={styles.moduleName}>
              {module.name}
            </div>
          </div>
        ))}
      </div>

      {filteredModules.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
              <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
              <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
              <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/>
            </svg>
          </div>
          <p className={styles.emptyText}>선택한 조건에 맞는 모듈이 없습니다</p>
        </div>
      )}
    </div>
  );
};

export default ModuleGalleryNew; 