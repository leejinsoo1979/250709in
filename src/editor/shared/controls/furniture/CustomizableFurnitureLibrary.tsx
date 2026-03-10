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

interface CustomizableFurnitureLibraryProps {
  filter?: 'full' | 'upper' | 'lower';
  showHeader?: boolean;
}

const CustomizableFurnitureLibrary: React.FC<CustomizableFurnitureLibraryProps> = ({
  filter = 'full',
}) => {
  const { spaceInfo, setSpaceInfo } = useSpaceConfigStore();
  const { setSelectedFurnitureId, setFurniturePlacementMode, setPendingCustomConfig } = useFurnitureStore();

  // 레이아웃 빌더 팝업 상태
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<'full' | 'upper' | 'lower'>('full');
  // 싱글/듀얼 선택 상태
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [selectedWidth, setSelectedWidth] = useState(1000);

  // 공간 높이로 전체장 높이 결정
  const internalSpace = calculateInternalSpace(spaceInfo);

  const handleItemClick = useCallback(() => {
    setShowTypeSelector(true);
  }, []);

  // 싱글/듀얼 선택 후 팝업 열기
  const handleTypeSelect = useCallback((type: 'single' | 'dual') => {
    const width = type === 'single' ? 500 : 1000;
    setSelectedWidth(width);
    setSelectedCategory(filter);
    setShowTypeSelector(false);
    setIsPopupOpen(true);
  }, [filter]);

  // 레이아웃 빌더 확인 → pendingCustomConfig 저장 → 배치 모드 활성화
  const handlePopupConfirm = useCallback((config: CustomFurnitureConfig) => {
    const moduleId = createCustomizableModuleId(selectedCategory, selectedWidth);

    setPendingCustomConfig(config);
    setIsPopupOpen(false);

    // 자유배치 모드로 전환 후 Click & Place 활성화
    if (spaceInfo.layoutMode !== 'free-placement') {
      setSpaceInfo({ layoutMode: 'free-placement' });
    }
    setSelectedFurnitureId(moduleId);
    setFurniturePlacementMode(true);
  }, [selectedCategory, selectedWidth, spaceInfo.layoutMode, setSpaceInfo, setSelectedFurnitureId, setFurniturePlacementMode, setPendingCustomConfig]);

  const handlePopupClose = useCallback(() => {
    setIsPopupOpen(false);
  }, []);

  const category = filter;
  const defaults = CUSTOMIZABLE_DEFAULTS[category];

  return (
    <div className={styles.container}>
      <div
        className={styles.item}
        onClick={handleItemClick}
      >
        <div className={styles.itemIcon}>
          <MdOutlineAutoAwesomeMosaic size={32} />
        </div>
        <div className={styles.itemInfo}>
          <span className={styles.itemLabel}>{defaults.label}</span>
        </div>
      </div>

      {/* 싱글/듀얼 선택 UI */}
      {showTypeSelector && (
        <div style={{
          display: 'flex', gap: '8px', marginTop: '8px', padding: '0 4px',
        }}>
          <button
            onClick={() => handleTypeSelect('single')}
            style={{
              flex: 1, padding: '10px 8px', borderRadius: '8px',
              border: '1px solid #ddd', background: '#fff',
              cursor: 'pointer', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: '4px', transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#4A90D9'; e.currentTarget.style.background = '#f0f7ff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#ddd'; e.currentTarget.style.background = '#fff'; }}
          >
            <div style={{ width: '20px', height: '36px', border: '2px solid #666', borderRadius: '3px' }} />
            <span style={{ fontSize: '12px', fontWeight: '600' }}>싱글</span>
            <span style={{ fontSize: '10px', color: '#999' }}>W 500mm</span>
          </button>
          <button
            onClick={() => handleTypeSelect('dual')}
            style={{
              flex: 1, padding: '10px 8px', borderRadius: '8px',
              border: '1px solid #ddd', background: '#fff',
              cursor: 'pointer', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: '4px', transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#4A90D9'; e.currentTarget.style.background = '#f0f7ff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#ddd'; e.currentTarget.style.background = '#fff'; }}
          >
            <div style={{ display: 'flex', gap: '2px' }}>
              <div style={{ width: '18px', height: '36px', border: '2px solid #666', borderRadius: '3px' }} />
              <div style={{ width: '18px', height: '36px', border: '2px solid #666', borderRadius: '3px' }} />
            </div>
            <span style={{ fontSize: '12px', fontWeight: '600' }}>듀얼</span>
            <span style={{ fontSize: '10px', color: '#999' }}>W 1000mm</span>
          </button>
        </div>
      )}

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
          width: selectedWidth,
          height: selectedCategory === 'full' ? internalSpace.height : CUSTOMIZABLE_DEFAULTS[selectedCategory].height,
          depth: CUSTOMIZABLE_DEFAULTS[selectedCategory].depth,
        }}
      />
    </div>
  );
};

export default CustomizableFurnitureLibrary;
export { CUSTOMIZABLE_DEFAULTS, createDefaultCustomConfig };
