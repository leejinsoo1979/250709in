import React, { useState, useMemo } from 'react';
import { getModulesByCategory, ModuleData } from '@/data/modules';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import styles from './ModuleGallery.module.css';

// 가구 아이콘 매핑 - 각 가구 타입에 맞는 이미지 사용
const FURNITURE_ICONS: Record<string, string> = {
  'single-2drawer-hanging': '/images/furniture-thumbnails/single-2drawer-hanging.png',
  'single-2hanging': '/images/furniture-thumbnails/single-2hanging.png', 
  'single-4drawer-hanging': '/images/furniture-thumbnails/single-4drawer-hanging.png',
  'dual-2drawer-hanging': '/images/furniture-thumbnails/dual-2drawer-hanging.png',
  'dual-2hanging': '/images/furniture-thumbnails/dual-2hanging.png',
  'dual-4drawer-hanging': '/images/furniture-thumbnails/dual-4drawer-hanging.png',
  'dual-2drawer-styler': '/images/furniture-thumbnails/dual-2drawer-styler.png',
  'dual-4drawer-pantshanger': '/images/furniture-thumbnails/dual-4drawer-pantshanger.png',
};

// 모듈 타입 정의
type ModuleType = 'all' | 'single' | 'dual';

// 썸네일 아이템 컴포넌트
interface ThumbnailItemProps {
  module: ModuleData;
  iconPath: string;
  isValid: boolean;
}

const ThumbnailItem: React.FC<ThumbnailItemProps> = ({ module, iconPath, isValid }) => {
  const setFurniturePlacementMode = useFurnitureStore(state => state.setFurniturePlacementMode);
  const setCurrentDragData = useFurnitureStore(state => state.setCurrentDragData);

  // 드래그 시작 핸들러
  const handleDragStart = (e: React.DragEvent) => {
    if (!isValid) {
      e.preventDefault();
      return;
    }

    // 가구 배치 모드 활성화
    setFurniturePlacementMode(true);

    // 드래그 데이터 설정 (ModuleItem과 동일한 구조)
    const dragData = {
      type: 'furniture',
      moduleData: {
        id: module.id,
        name: module.name,
        dimensions: module.dimensions,
        type: module.type || 'default',
        color: module.color,
        hasDoor: module.hasDoor || false // 기본값: false
      }
    };

    e.dataTransfer.setData('application/json', JSON.stringify(dragData));
    e.dataTransfer.setData('text/plain', module.id); // 호환성을 위해 추가
    e.dataTransfer.effectAllowed = 'copy';

    // 전역 드래그 상태 설정
    setCurrentDragData(dragData);
  };

  // 드래그 종료 핸들러
  const handleDragEnd = () => {
    // 가구 배치 모드 비활성화
    setFurniturePlacementMode(false);
    
    // 전역 드래그 상태 초기화
    setCurrentDragData(null);
  };



  return (
    <div 
      className={`${styles.thumbnailItem} ${!isValid ? styles.disabled : ''}`}
      draggable={isValid}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      title={isValid ? `드래그하여 배치: ${module.name}` : '현재 공간에 배치할 수 없습니다'}
    >
      <div className={styles.thumbnailImage}>
        <img 
          src={iconPath} 
          alt={module.name}
          onError={(e) => {
            // 이미지 로드 실패 시 기본 이미지로 대체 (한 번만 실행)
            const img = e.target as HTMLImageElement;
            if (!img.dataset.fallbackAttempted) {
              img.dataset.fallbackAttempted = 'true';
              img.src = '/images/furniture-thumbnails/single-2drawer-hanging.png';
            }
          }}
        />
      </div>
      {!isValid && <div className={styles.disabledOverlay} />}
    </div>
  );
};

const ModuleGallery: React.FC = () => {
  // 선택된 탭 상태 (전체/싱글/듀얼)
  const [selectedType, setSelectedType] = useState<ModuleType>('all');
  
  // 에디터 스토어에서 공간 정보 가져오기
  const { spaceInfo } = useSpaceConfigStore();

  // 내경 공간 계산
  const internalSpace = calculateInternalSpace(spaceInfo);
  
  // 인덱싱 정보 계산 (컬럼 정보)
  const indexing = calculateSpaceIndexing(spaceInfo);
  
  // 단일 컬럼의 너비 계산
  const columnWidth = indexing.columnWidth;
  
  // 전체 높이 모듈들만 가져오기 (내경 공간 정보 전달)
  const fullModules = getModulesByCategory('full', internalSpace, spaceInfo);
  
  // 싱글(1컬럼)과 듀얼(2컬럼) 모듈로 분류 (기존 로직 재사용)
  const { singleModules, dualModules } = useMemo(() => {
    // 여백 허용치 축소 (기존 50mm에서 30mm로 감소)
    const MARGIN_TOLERANCE = 30;
    
    // 컬럼이 1개인 경우 모두 싱글로 처리
    if (indexing.columnCount <= 1) {
      return {
        singleModules: fullModules,
        dualModules: []
      };
    }
    
    // 일반적인 컬럼 계산 로직
    return fullModules.reduce((acc, module) => {
      const moduleWidth = module.dimensions.width;
      
      // 싱글 컬럼 모듈 판단 (1컬럼 너비 ± 여백 허용치)
      if (Math.abs(moduleWidth - columnWidth) <= MARGIN_TOLERANCE) {
        acc.singleModules.push(module);
      } 
      // 듀얼 컬럼 모듈 판단 (2컬럼 너비 ± 여백 허용치)
      else if (Math.abs(moduleWidth - (columnWidth * 2)) <= MARGIN_TOLERANCE) {
        // 특수 듀얼 가구 조건부 노출: 슬롯폭이 550mm 이상일 때만 표시
        const isSpecialDualFurniture = module.id.includes('dual-2drawer-styler-') || 
                                       module.id.includes('dual-4drawer-pantshanger-');
        if (isSpecialDualFurniture && columnWidth < 550) {
          // 슬롯폭이 550mm 미만이면 특수 가구는 제외 (스타일러, 바지걸이장)
          return acc;
        }
        acc.dualModules.push(module);
      } 
      // 그 외 케이스는 가장 가까운 컬럼 수에 할당
      else if (moduleWidth < (columnWidth * 1.5)) {
        acc.singleModules.push(module);
      } else {
        // 특수 듀얼 가구 조건부 노출: 슬롯폭이 550mm 이상일 때만 표시
        const isSpecialDualFurniture = module.id.includes('dual-2drawer-styler-') || 
                                       module.id.includes('dual-4drawer-pantshanger-');
        if (isSpecialDualFurniture && columnWidth < 550) {
          // 슬롯폭이 550mm 미만이면 특수 가구는 제외 (스타일러, 바지걸이장)
          return acc;
        }
        acc.dualModules.push(module);
      }
      
      return acc;
    }, { singleModules: [] as ModuleData[], dualModules: [] as ModuleData[] });
  }, [fullModules, columnWidth, indexing.columnCount]);

  // 현재 선택된 탭에 따른 모듈 목록
  const currentModules = selectedType === 'all' 
    ? [...singleModules, ...dualModules]
    : selectedType === 'single' 
      ? singleModules 
      : dualModules;

  // 가구 ID에서 키 추출하여 아이콘 경로 결정
  const getIconPath = (moduleId: string): string => {
    const moduleKey = moduleId.replace(/-\d+$/, ''); // 폭 정보 제거
    return FURNITURE_ICONS[moduleKey] || FURNITURE_ICONS['single-2drawer-hanging'];
  };

  // 가구 유효성 검사 (간단 버전)
  const isModuleValid = (module: ModuleData): boolean => {
    return module.dimensions.width <= internalSpace.width && 
           module.dimensions.height <= internalSpace.height && 
           module.dimensions.depth <= internalSpace.depth;
  };

  return (
    <div className={styles.container}>
      {/* 탭 메뉴 */}
      <div className={styles.tabMenu}>
        <button
          className={`${styles.tabButton} ${selectedType === 'all' ? styles.activeTab : ''}`}
          onClick={() => setSelectedType('all')}
        >
          전체 ({singleModules.length + dualModules.length})
        </button>
        <button
          className={`${styles.tabButton} ${selectedType === 'single' ? styles.activeTab : ''}`}
          onClick={() => setSelectedType('single')}
        >
          싱글 ({singleModules.length})
        </button>
        <button
          className={`${styles.tabButton} ${selectedType === 'dual' ? styles.activeTab : ''}`}
          onClick={() => setSelectedType('dual')}
        >
          듀얼 ({dualModules.length})
        </button>
      </div>
      
      {/* 썸네일 그리드 (2열) */}
      <div className={styles.thumbnailGrid}>
        {currentModules.length > 0 ? (
          currentModules.map(module => {
            const iconPath = getIconPath(module.id);
            const isValid = isModuleValid(module);
            
            return (
              <ThumbnailItem
                key={module.id}
                module={module}
                iconPath={iconPath}
                isValid={isValid}
              />
            );
          })
        ) : (
          <div className={styles.emptyMessage}>
            이 유형에 맞는 가구가 없습니다
          </div>
        )}
      </div>
    </div>
  );
};

export default ModuleGallery; 