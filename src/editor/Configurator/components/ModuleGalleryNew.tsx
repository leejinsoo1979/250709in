import React, { useState } from 'react';
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
            className={`${styles.moduleCard} ${selectedModuleId === module.id ? styles.selected : ''}`}
            onClick={() => onModuleSelect(module.id)}
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