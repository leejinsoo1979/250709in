import React, { useCallback } from 'react';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import { CustomFurnitureConfig } from '@/editor/shared/furniture/types';
import { MdOutlineAutoAwesomeMosaic } from 'react-icons/md';
import styles from './CustomizableFurnitureLibrary.module.css';

// 커스터마이징 가구 카테고리별 기본 치수 (mm)
const CUSTOMIZABLE_DEFAULTS: Record<string, { width: number; height: number; depth: number; label: string }> = {
  full: { width: 600, height: 0, depth: 580, label: '커스텀 캐비닛' },   // height는 공간 높이에 따라 동적
  upper: { width: 600, height: 700, depth: 340, label: '커스텀 상부장' },
  lower: { width: 600, height: 800, depth: 580, label: '커스텀 하부장' },
};

// 커스터마이징 가구를 위한 기본 빈 설정 생성
function createDefaultCustomConfig(height: number): CustomFurnitureConfig {
  return {
    sections: [
      {
        id: 'section-0',
        height,
        elements: [{ type: 'open' }],
      },
    ],
    panelThickness: 18,
  };
}

// 커스터마이징 가구 모듈 ID 생성 (getModuleById와 호환)
export function createCustomizableModuleId(category: string, width: number): string {
  return `customizable-${category}-${width}`;
}

// 커스터마이징 가구 모듈 ID인지 판별
export function isCustomizableModuleId(moduleId: string): boolean {
  return moduleId.startsWith('customizable-');
}

// 커스터마이징 가구 모듈 ID에서 카테고리 추출
export function getCustomizableCategory(moduleId: string): 'full' | 'upper' | 'lower' {
  const parts = moduleId.split('-');
  return (parts[1] || 'full') as 'full' | 'upper' | 'lower';
}

interface CustomizableFurnitureLibraryProps {
  filter?: 'full' | 'upper' | 'lower';
  showHeader?: boolean;
}

const CustomizableFurnitureLibrary: React.FC<CustomizableFurnitureLibraryProps> = ({
  filter = 'full',
}) => {
  const { spaceInfo } = useSpaceConfigStore();
  const { setSelectedFurnitureId, setFurniturePlacementMode } = useFurnitureStore();

  // 공간 높이로 전체장 높이 결정
  const internalSpace = calculateInternalSpace(spaceInfo);

  const handleItemClick = useCallback((category: 'full' | 'upper' | 'lower') => {
    const defaults = CUSTOMIZABLE_DEFAULTS[category];
    const moduleId = createCustomizableModuleId(category, defaults.width);

    // Click & Place 모드 활성화
    setSelectedFurnitureId(moduleId);
    setFurniturePlacementMode(true);
  }, [internalSpace, setSelectedFurnitureId, setFurniturePlacementMode]);

  const category = filter;
  const defaults = CUSTOMIZABLE_DEFAULTS[category];
  const height = category === 'full' ? internalSpace.height : defaults.height;

  return (
    <div className={styles.container}>
      <div
        className={styles.item}
        onClick={() => handleItemClick(category)}
      >
        <div className={styles.itemIcon}>
          <MdOutlineAutoAwesomeMosaic size={32} />
        </div>
        <div className={styles.itemInfo}>
          <span className={styles.itemLabel}>{defaults.label}</span>
          <span className={styles.itemDimension}>
            {defaults.width} × {Math.round(height)} × {defaults.depth} mm
          </span>
        </div>
      </div>
      <p className={styles.helpText}>
        클릭 후 공간에 배치하세요. 배치 후 설정 아이콘을 눌러 내부 구조를 편집할 수 있습니다.
      </p>
    </div>
  );
};

export default CustomizableFurnitureLibrary;
export { CUSTOMIZABLE_DEFAULTS, createDefaultCustomConfig };
