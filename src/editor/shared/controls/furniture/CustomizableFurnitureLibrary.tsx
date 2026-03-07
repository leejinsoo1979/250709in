import React, { useCallback } from 'react';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import { CustomFurnitureConfig } from '@/editor/shared/furniture/types';
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
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            {/* 외곽 캐비닛 */}
            <rect x="8" y="4" width="32" height="40" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
            {/* 상부 칸 */}
            <line x1="8" y1="18" x2="40" y2="18" stroke="currentColor" strokeWidth="1" />
            {/* 하부 칸 */}
            <line x1="8" y1="32" x2="40" y2="32" stroke="currentColor" strokeWidth="1" />
            {/* 상부 선반 */}
            <rect x="11" y="7" width="26" height="8" rx="1" stroke="currentColor" strokeWidth="0.8" fill="none" opacity="0.5" />
            {/* 중간 행거바 */}
            <line x1="14" y1="25" x2="34" y2="25" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            {/* 하부 서랍 손잡이 */}
            <line x1="20" y1="38" x2="28" y2="38" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            {/* + 아이콘 */}
            <circle cx="38" cy="42" r="5" fill="currentColor" opacity="0.15" />
            <line x1="38" y1="39.5" x2="38" y2="44.5" stroke="currentColor" strokeWidth="1.2" />
            <line x1="35.5" y1="42" x2="40.5" y2="42" stroke="currentColor" strokeWidth="1.2" />
          </svg>
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
