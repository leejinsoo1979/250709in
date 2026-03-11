import React, { useCallback, useState } from 'react';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import { CustomFurnitureConfig } from '@/editor/shared/furniture/types';
import { MdOutlineAutoAwesomeMosaic } from 'react-icons/md';
import LayoutBuilderPopup from './layoutBuilder/LayoutBuilderPopup';
import styles from './CustomizableFurnitureLibrary.module.css';

// 커스터마이징 가구 카테고리별 기본 치수 (mm)
const CUSTOMIZABLE_DEFAULTS: Record<string, { width: number; height: number; depth: number; label: string }> = {
  full: { width: 1000, height: 0, depth: 580, label: '캐비닛만들기' },   // height는 공간 높이에 따라 동적
  'full-single': { width: 500, height: 0, depth: 580, label: '캐비닛만들기' },  // 싱글 = 듀얼의 절반
  'full-dual': { width: 1000, height: 0, depth: 580, label: '캐비닛만들기' },   // 듀얼 기본값
  upper: { width: 1000, height: 700, depth: 340, label: '커스텀 상부장' },
  lower: { width: 1000, height: 800, depth: 580, label: '커스텀 하부장' },
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

// 커스터마이징 가구 모듈 ID에서 치수 기억용 키 추출
// 듀얼은 듀얼끼리, 싱글은 싱글끼리, upper/lower는 별도 추적
export function getCustomDimensionKey(moduleId: string): 'full-single' | 'full-dual' | 'upper' | 'lower' {
  const category = getCustomizableCategory(moduleId);
  if (category === 'upper') return 'upper';
  if (category === 'lower') return 'lower';
  // full 카테고리: 너비로 싱글/듀얼 구분 (500=싱글, 1000+=듀얼)
  const parts = moduleId.split('-');
  const width = parseInt(parts[2] || '1000', 10);
  return width <= 500 ? 'full-single' : 'full-dual';
}

interface CustomizableFurnitureLibraryProps {
  filter?: 'full' | 'upper' | 'lower';
  showHeader?: boolean;
}

const CustomizableFurnitureLibrary: React.FC<CustomizableFurnitureLibraryProps> = ({
  filter = 'full',
}) => {
  const { spaceInfo, setSpaceInfo } = useSpaceConfigStore();
  const { setSelectedFurnitureId, setFurniturePlacementMode, setPendingCustomConfig, setLastCustomDimensions } = useFurnitureStore();

  // 레이아웃 빌더 팝업 상태
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<'full' | 'upper' | 'lower'>('full');

  // 공간 높이로 전체장 높이 결정
  const internalSpace = calculateInternalSpace(spaceInfo);

  const handleItemClick = useCallback((category: 'full' | 'upper' | 'lower') => {
    setSelectedCategory(category);
    setIsPopupOpen(true);
  }, []);

  // 레이아웃 빌더 확인 → pendingCustomConfig 저장 → 배치 모드 활성화
  const handlePopupConfirm = useCallback((config: CustomFurnitureConfig, width: number, height: number, depth: number) => {
    const moduleId = createCustomizableModuleId(selectedCategory, width);
    const dimKey = width <= 500 ? 'full-single' : 'full-dual';

    setPendingCustomConfig(config);
    setLastCustomDimensions(dimKey, { width, height, depth });
    setIsPopupOpen(false);

    // 자유배치 모드로 전환 후 Click & Place 활성화
    if (spaceInfo.layoutMode !== 'free-placement') {
      setSpaceInfo({ layoutMode: 'free-placement' });
    }
    setSelectedFurnitureId(moduleId);
    setFurniturePlacementMode(true);
  }, [selectedCategory, spaceInfo.layoutMode, setSpaceInfo, setSelectedFurnitureId, setFurniturePlacementMode, setPendingCustomConfig, setLastCustomDimensions]);

  const handlePopupClose = useCallback(() => {
    setIsPopupOpen(false);
  }, []);

  const category = filter;
  const defaults = CUSTOMIZABLE_DEFAULTS[category];

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
        </div>
      </div>
      <p className={styles.helpText}>
        클릭 후 레이아웃을 설계하세요. 배치 후 설정 아이콘을 눌러 내부 구조를 편집할 수 있습니다.
      </p>

      {/* 레이아웃 빌더 팝업 */}
      <LayoutBuilderPopup
        isOpen={isPopupOpen}
        onClose={handlePopupClose}
        onConfirm={handlePopupConfirm}
        category={selectedCategory}
        dimensions={{
          width: CUSTOMIZABLE_DEFAULTS[selectedCategory].width,
          height: selectedCategory === 'full' ? internalSpace.height : CUSTOMIZABLE_DEFAULTS[selectedCategory].height,
          depth: CUSTOMIZABLE_DEFAULTS[selectedCategory].depth,
        }}
      />
    </div>
  );
};

export default CustomizableFurnitureLibrary;
export { CUSTOMIZABLE_DEFAULTS, createDefaultCustomConfig };
