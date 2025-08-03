import React, { useState, useMemo } from 'react';
import { getModulesByCategory, ModuleData } from '@/data/modules';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import { calculateSpaceIndexing, ColumnIndexer } from '@/editor/shared/utils/indexing';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { isSlotAvailable, findNextAvailableSlot } from '@/editor/shared/utils/slotAvailability';
import { getModuleById } from '@/data/modules';
import styles from './ModuleGallery.module.css';
import Button from '@/components/common/Button';
import { useAlert } from '@/hooks/useAlert';

// 가구 아이콘 매핑 - 각 가구 타입에 맞는 이미지 사용
// import.meta.env.BASE_URL을 사용하여 GitHub Pages base path 자동 적용
const getImagePath = (filename: string) => {
  const path = `${import.meta.env.BASE_URL}images/furniture-thumbnails/${filename}`;
  console.log(`🖼️ [썸네일 경로] ${filename} → ${path}`);
  return path;
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
  // 상부장 타입들
  'upper-cabinet-shelf': getImagePath('upper-cabinet-shelf.png'),
  'upper-cabinet-open': getImagePath('upper-cabinet-open.png'),
  'upper-cabinet-mixed': getImagePath('upper-cabinet-mixed.png'),
};

// 모듈 타입 정의
type ModuleType = 'all' | 'single' | 'dual';

// 썸네일 아이템 컴포넌트
interface ThumbnailItemProps {
  module: ModuleData;
  iconPath: string;
  isValid: boolean;
}

interface ThumbnailItemPropsExtended extends ThumbnailItemProps {
  activeZone?: 'normal' | 'dropped';
}

const ThumbnailItem: React.FC<ThumbnailItemPropsExtended> = ({ module, iconPath, isValid, activeZone }) => {
  const { spaceInfo } = useSpaceConfigStore();
  const placedModules = useFurnitureStore(state => state.placedModules);
  const addModule = useFurnitureStore(state => state.addModule);
  const setFurniturePlacementMode = useFurnitureStore(state => state.setFurniturePlacementMode);
  const setCurrentDragData = useFurnitureStore(state => state.setCurrentDragData);
  const { showAlert, AlertComponent } = useAlert();

  // 드래그 시작 핸들러
  const handleDragStart = (e: React.DragEvent) => {
    if (!isValid) {
      e.preventDefault();
      return;
    }
    
    // 영역별 인덱싱 계산
    let indexing = calculateSpaceIndexing(spaceInfo);
    let targetZone: 'normal' | 'dropped' = 'normal';
    let adjustedDimensions = { ...module.dimensions };
    
    // 단내림이 활성화되어 있고 activeZone이 설정된 경우
    if (spaceInfo.droppedCeiling?.enabled && activeZone) {
      targetZone = activeZone;
      const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
      
      if (activeZone === 'dropped' && zoneInfo.dropped) {
        // 단내림 영역의 슬롯 너비 사용
        const droppedColumnWidth = zoneInfo.dropped.columnWidth;
        
        // 특수 듀얼 가구 체크
        const isSpecialDualFurniture = module.id.includes('dual-2drawer-styler-') || 
                                     module.id.includes('dual-4drawer-pantshanger-');
        
        if (isSpecialDualFurniture && droppedColumnWidth < 550) {
          showAlert('단내림 구간의 슬롯갯수를 줄여주세요', { title: '배치 불가' });
          e.preventDefault();
          return;
        }
        
        // 동적 가구인 경우 크기 조정
        if (module.isDynamic) {
          const isDualFurniture = module.dimensions.width > droppedColumnWidth * 1.5;
          adjustedDimensions.width = isDualFurniture ? droppedColumnWidth * 2 : droppedColumnWidth;
        }
      } else if (activeZone === 'normal' && zoneInfo.normal) {
        // 메인 영역의 슬롯 너비 사용
        const normalColumnWidth = zoneInfo.normal.columnWidth;
        
        // 특수 듀얼 가구 체크
        const isSpecialDualFurniture = module.id.includes('dual-2drawer-styler-') || 
                                     module.id.includes('dual-4drawer-pantshanger-');
        
        if (isSpecialDualFurniture && normalColumnWidth < 550) {
          showAlert('메인 구간의 슬롯갯수를 줄여주세요', { title: '배치 불가' });
          e.preventDefault();
          return;
        }
        
        // 동적 가구인 경우 크기 조정
        if (module.isDynamic) {
          const isDualFurniture = module.dimensions.width > normalColumnWidth * 1.5;
          adjustedDimensions.width = isDualFurniture ? normalColumnWidth * 2 : normalColumnWidth;
        }
      }
    } else {
      // 단내림이 없는 경우 기존 로직
      const isSpecialDualFurniture = module.id.includes('dual-2drawer-styler-') || 
                                   module.id.includes('dual-4drawer-pantshanger-');
      
      if (isSpecialDualFurniture && indexing.columnWidth < 550) {
        showAlert('슬롯갯수를 줄여주세요', { title: '배치 불가' });
        e.preventDefault();
        return;
      }
    }

    // 가구 배치 모드 활성화
    setFurniturePlacementMode(true);

    // 드래그 데이터 설정 (영역 정보 추가)
    const dragData = {
      type: 'furniture',
      zone: targetZone,
      moduleData: {
        id: module.id,
        name: module.name,
        dimensions: adjustedDimensions, // 조정된 크기 사용
        originalDimensions: module.dimensions, // 원본 크기도 저장
        type: module.type || 'default',
        color: module.color,
        hasDoor: module.hasDoor || false,
        isDynamic: module.isDynamic
      }
    };

    e.dataTransfer.setData('application/json', JSON.stringify(dragData));
    e.dataTransfer.setData('text/plain', module.id); // 호환성을 위해 추가
    e.dataTransfer.effectAllowed = 'copy';
    
    console.log('🎯 [ModuleGallery] Drag started:', {
      moduleId: module.id,
      dragData,
      zone: targetZone
    });

    // 전역 드래그 상태 설정
    setCurrentDragData(dragData);
  };

  // 드래그 종료 핸들러
  const handleDragEnd = () => {
    console.log('🎯 [ModuleGallery] Drag ended');
    // 가구 배치 모드 비활성화
    setFurniturePlacementMode(false);
    
    // 전역 드래그 상태 초기화
    setCurrentDragData(null);
  };

  // 더블클릭 시 자동 배치 핸들러
  const handleDoubleClick = () => {
    if (!isValid) return;
    
    console.log('🚨 [ModuleGallery] Double click start:', {
      moduleId: module.id,
      moduleWidth: module.dimensions.width,
      activeZone,
      droppedCeilingEnabled: spaceInfo.droppedCeiling?.enabled,
      spaceInfo: {
        width: spaceInfo.width,
        customColumnCount: spaceInfo.customColumnCount,
        columnMode: spaceInfo.columnMode
      }
    });
    
    try {
      // 단내림이 활성화되어 있는 경우 영역별 처리
      let zoneSpaceInfo = spaceInfo;
      let zoneInternalSpace = calculateInternalSpace(spaceInfo);
      
      if (spaceInfo.droppedCeiling?.enabled && activeZone) {
        const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
        console.log('🎯 [ModuleGallery] Zone info:', {
          activeZone,
          zoneInfo,
          originalWidth: spaceInfo.width,
          originalColumns: spaceInfo.customColumnCount
        });
        
        if (activeZone === 'dropped' && zoneInfo.dropped) {
          // 단내림 영역용 spaceInfo 생성
          zoneSpaceInfo = {
            ...spaceInfo,
            width: zoneInfo.dropped.width,
            customColumnCount: zoneInfo.dropped.columnCount,
            columnMode: 'custom' // columnMode도 설정
          } as SpaceInfo;
          zoneInternalSpace = calculateInternalSpace(zoneSpaceInfo);
          console.log('🎯 [ModuleGallery] Dropped zone space:', {
            zoneWidth: zoneInfo.dropped.width,
            zoneColumns: zoneInfo.dropped.columnCount,
            zoneInternalWidth: zoneInternalSpace.width
          });
        } else if (activeZone === 'normal' && zoneInfo.normal) {
          // 메인 영역용 spaceInfo 생성
          zoneSpaceInfo = {
            ...spaceInfo,
            width: zoneInfo.normal.width,
            customColumnCount: zoneInfo.normal.columnCount,
            columnMode: 'custom'
          } as SpaceInfo;
          zoneInternalSpace = calculateInternalSpace(zoneSpaceInfo);
          console.log('🎯 [ModuleGallery] Normal zone space:', {
            zoneWidth: zoneInfo.normal.width,
            zoneColumns: zoneInfo.normal.columnCount,
            zoneInternalWidth: zoneInternalSpace.width
          });
        }
      }
      
      // 영역별 공간으로 인덱싱 계산
      const indexing = calculateSpaceIndexing(zoneSpaceInfo);
      const internalSpace = zoneInternalSpace;
      
      console.log('🚨 [ModuleGallery] After zone calculation:', {
        zoneSpaceInfo: {
          width: zoneSpaceInfo.width,
          customColumnCount: zoneSpaceInfo.customColumnCount
        },
        indexing: {
          columnWidth: indexing.columnWidth,
          columnCount: indexing.columnCount
        }
      });
      
      // 특수 듀얼 가구 체크 (바지걸이장, 스타일러장)
      const isSpecialDualFurniture = module.id.includes('dual-2drawer-styler-') || 
                                   module.id.includes('dual-4drawer-pantshanger-');
      
      // 특수 듀얼 가구이고 슬롯폭이 550mm 미만인 경우
      if (isSpecialDualFurniture && indexing.columnWidth < 550) {
        showAlert('슬롯갯수를 줄여주세요', { title: '배치 불가' });
        return;
      }
      
      // 영역별 모듈 데이터 가져오기
      let moduleToUse = module;
      
      // 단내림이 활성화되고 activeZone이 설정된 경우 영역별 모듈 생성
      if (spaceInfo.droppedCeiling?.enabled && activeZone) {
        // 가구 ID에서 기본 타입 추출 (예: single-4drawer-hanging-583 -> single-4drawer-hanging)
        const baseModuleId = module.id.replace(/-\d+$/, '');
        // 영역의 컬럼 폭으로 새로운 ID 생성
        const zoneModuleId = `${baseModuleId}-${indexing.columnWidth}`;
        
        console.log('🎯 [ModuleGallery] Creating zone module:', {
          activeZone,
          originalId: module.id,
          baseModuleId,
          zoneModuleId,
          zoneColumnWidth: indexing.columnWidth
        });
        
        // 영역에 맞는 가구 데이터 직접 생성
        moduleToUse = {
          ...module,
          id: zoneModuleId,
          dimensions: {
            ...module.dimensions,
            width: indexing.columnWidth
          }
        };
      }
      
      const zoneModule = moduleToUse;
      
      console.log('🎯 [ModuleGallery] Zone module created:', {
        moduleId: zoneModule.id,
        width: zoneModule.dimensions.width,
        expectedColumnWidth: indexing.columnWidth
      });
      
      // 듀얼/싱글 가구 판별
      const isDualFurniture = module.id.startsWith('dual-');
      
      // 첫 번째 빈 슬롯 찾기
      let availableSlotIndex = -1;
      
      // 모든 슬롯을 순회하며 빈 슬롯 찾기
      for (let i = 0; i < indexing.columnCount; i++) {
        if (isSlotAvailable(i, isDualFurniture, placedModules, zoneSpaceInfo, module.id)) {
          availableSlotIndex = i;
          break;
        }
      }
      
      // 첫 번째 슬롯에서 찾지 못하면 다음 사용 가능한 슬롯 찾기
      if (availableSlotIndex === -1) {
        availableSlotIndex = findNextAvailableSlot(0, 'right', isDualFurniture, placedModules, zoneSpaceInfo, module.id) || -1;
      }
      
      if (availableSlotIndex === -1) {
        console.warn('사용 가능한 슬롯이 없습니다.');
        return;
      }
      
      // 가구 위치 계산
      let positionX: number;
      
      // indexing.threeUnitPositions는 이미 영역의 크기에 맞춰 계산된 절대 위치입니다
      if (isDualFurniture && indexing.threeUnitDualPositions) {
        positionX = indexing.threeUnitDualPositions[availableSlotIndex];
      } else {
        positionX = indexing.threeUnitPositions[availableSlotIndex];
      }
        
      
      console.log('🎯 [ModuleGallery] Position calculation:', {
        activeZone,
        positionX,
        availableSlotIndex,
        isDualFurniture,
        indexingInfo: {
          columnCount: indexing.columnCount,
          columnWidth: indexing.columnWidth,
          internalStartX: indexing.internalStartX,
          threeUnitPositions: indexing.threeUnitPositions
        }
      });
      
      // 기본 깊이 계산
      const getDefaultDepth = (moduleData: ModuleData) => {
        if (moduleData?.defaultDepth) {
          return Math.min(moduleData.defaultDepth, spaceInfo.depth);
        }
        const spaceBasedDepth = Math.floor(spaceInfo.depth * 0.9);
        return Math.min(spaceBasedDepth, 580);
      };
      
      // 고유 ID 생성
      const placedId = `placed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // 실제 슬롯 너비 계산
      let customWidth;
      if (isDualFurniture && indexing.slotWidths && indexing.slotWidths[availableSlotIndex] !== undefined) {
        customWidth = indexing.slotWidths[availableSlotIndex] + (indexing.slotWidths[availableSlotIndex + 1] || indexing.slotWidths[availableSlotIndex]);
      } else if (indexing.slotWidths && indexing.slotWidths[availableSlotIndex] !== undefined) {
        customWidth = indexing.slotWidths[availableSlotIndex];
      } else {
        customWidth = indexing.columnWidth;
      }

      // 새 모듈 생성
      const newModule = {
        id: placedId,
        moduleId: zoneModule.id, // module.id가 아니라 zoneModule.id 사용
        position: {
          x: positionX,
          y: 0,
          z: 0
        },
        rotation: 0,
        hasDoor: false,
        customDepth: getDefaultDepth(zoneModule),
        slotIndex: availableSlotIndex,
        isDualSlot: isDualFurniture,
        isValidInCurrentSpace: true,
        adjustedWidth: zoneModule.dimensions.width,
        hingePosition: 'right' as 'left' | 'right',
        zone: activeZone || undefined, // 영역 정보 저장
        customWidth: customWidth // 실제 슬롯 너비 추가
      };
      
      console.log('🚨 [ModuleGallery] New module created:', {
        originalModuleId: module.id,
        originalWidth: module.dimensions.width,
        zoneModuleId: zoneModule.id,
        zoneModuleWidth: zoneModule.dimensions.width,
        expectedColumnWidth: indexing.columnWidth,
        position: newModule.position,
        zone: activeZone,
        adjustedWidth: newModule.adjustedWidth
      });
      
      // 가구 배치
      console.log('🎯 [ModuleGallery] About to add module:', newModule);
      try {
        addModule(newModule);
        console.log('✅ [ModuleGallery] Module added successfully');
      } catch (addError) {
        console.error('❌ [ModuleGallery] Failed to add module:', addError);
        throw addError;
      }
      
      // 배치된 가구를 자동으로 선택
      const setSelectedPlacedModuleId = useFurnitureStore.getState().setSelectedPlacedModuleId;
      setSelectedPlacedModuleId(placedId);
      
      console.log(`✅ 가구 "${module.name}"을 슬롯 ${availableSlotIndex + 1}에 자동 배치했습니다.`, {
        moduleId: module.id,
        slotIndex: availableSlotIndex,
        position: newModule.position,
        isDual: isDualFurniture,
        selectedId: placedId
      });
      
    } catch (error) {
      console.error('🚨🚨🚨 [ModuleGallery] 가구 자동 배치 중 오류 발생:', error);
      console.error('Error details:', {
        moduleId: module.id,
        activeZone,
        spaceInfo,
        error
      });
    }
  };

  return (
    <>
      <div 
        className={`${styles.thumbnailItem} ${!isValid ? styles.disabled : ''}`}
        draggable={isValid}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDoubleClick={handleDoubleClick}
        title={isValid ? `드래그하여 배치 또는 더블클릭으로 자동 배치: ${module.name}` : '현재 공간에 배치할 수 없습니다'}
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
                img.src = getImagePath('single-2drawer-hanging.png');
              }
            }}
          />
        </div>
        {!isValid && <div className={styles.disabledOverlay} />}
      </div>
      <AlertComponent />
    </>
  );
};

interface ModuleGalleryProps {
  moduleCategory?: 'tall' | 'upperlower';
  upperLowerTab?: 'upper' | 'lower';
  activeZone?: 'normal' | 'dropped';
}

const ModuleGallery: React.FC<ModuleGalleryProps> = ({ moduleCategory = 'tall', upperLowerTab = 'upper', activeZone }) => {
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
  // activeZone이 있으면 zone 정보를 추가한 spaceInfo 전달
  const zoneSpaceInfo = activeZone ? { ...spaceInfo, zone: activeZone } : spaceInfo;
  const fullModules = getModulesByCategory('full', internalSpace, zoneSpaceInfo);
  
  console.log('🔍 [ModuleGallery] Debug info:', {
    spaceInfo: {
      width: spaceInfo.width,
      customColumnCount: spaceInfo.customColumnCount,
      columnMode: spaceInfo.columnMode,
      droppedCeiling: spaceInfo.droppedCeiling
    },
    internalSpace,
    indexing: {
      columnWidth: indexing.columnWidth,
      columnCount: indexing.columnCount
    },
    activeZone,
    fullModules: fullModules.map(m => ({ id: m.id, width: m.dimensions.width }))
  });
  
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
        acc.dualModules.push(module);
      } 
      // 그 외 케이스는 가장 가까운 컬럼 수에 할당
      else if (moduleWidth < (columnWidth * 1.5)) {
        acc.singleModules.push(module);
      } else {
        acc.dualModules.push(module);
      }
      
      return acc;
    }, { singleModules: [] as ModuleData[], dualModules: [] as ModuleData[] });
  }, [fullModules, columnWidth, indexing.columnCount]);

  // 현재 선택된 탭에 따른 모듈 목록 (moduleCategory 필터링 추가)
  const currentModules = useMemo(() => {
    // 상하부장이 선택된 경우 빈 배열 반환 (현재 상하부장 모듈이 없음)
    if (moduleCategory === 'upperlower') {
      return [];
    }
    
    // 키큰장인 경우 기존 로직 적용
    const modules = selectedType === 'all' 
      ? [...singleModules, ...dualModules]
      : selectedType === 'single' 
        ? singleModules 
        : dualModules;
        
    console.log('🎯 [ModuleGallery] Current modules:', {
      selectedType,
      moduleCount: modules.length,
      modules: modules.map(m => ({ 
        id: m.id, 
        width: m.dimensions.width,
        baseId: m.id.replace(/-\d+$/, '')
      }))
    });
    
    return modules;
  }, [selectedType, singleModules, dualModules, moduleCategory]);

  // 가구 ID에서 키 추출하여 아이콘 경로 결정
  const getIconPath = (moduleId: string): string => {
    const moduleKey = moduleId.replace(/-\d+$/, ''); // 폭 정보 제거
    
    // 상부장의 경우 특별 처리
    if (moduleKey.includes('upper-cabinet')) {
      // 상부장 타입별 fallback 설정
      if (moduleKey.includes('shelf')) {
        return FURNITURE_ICONS['upper-cabinet-shelf'] || FURNITURE_ICONS['single-2hanging']; // 선반형은 2단옷장으로 대체
      } else if (moduleKey.includes('open')) {
        return FURNITURE_ICONS['upper-cabinet-open'] || FURNITURE_ICONS['single-2hanging']; // 오픈형도 2단옷장으로 대체
      } else if (moduleKey.includes('mixed')) {
        return FURNITURE_ICONS['upper-cabinet-mixed'] || FURNITURE_ICONS['single-2drawer-hanging']; // 혼합형은 서랍+옷장으로 대체
      }
    }
    
    return FURNITURE_ICONS[moduleKey] || FURNITURE_ICONS['single-2drawer-hanging'];
  };

  // 가구 유효성 검사 (간단 버전)
  const isModuleValid = (module: ModuleData): boolean => {
    return module.dimensions.width <= internalSpace.width && 
           module.dimensions.height <= internalSpace.height && 
           module.dimensions.depth <= internalSpace.depth;
  };

  // cn 유틸 함수 추가
  const cn = (...classes: (string | undefined | null | false)[]) => {
    return classes.filter(Boolean).join(' ');
  };

  return (
    <div className={styles.container}>
      {/* 탭 메뉴 - 키큰장과 상하부장 모두에서 표시 */}
      <div className={styles.tabMenu}>
        <button
          className={cn(styles.tab, selectedType === 'all' && styles.activeTab)}
          onClick={() => setSelectedType('all')}
        >
          전체 ({moduleCategory === 'upperlower' ? 0 : singleModules.length + dualModules.length})
        </button>
        <button
          className={cn(styles.tab, selectedType === 'single' && styles.activeTab)}
          onClick={() => setSelectedType('single')}
        >
          싱글 ({moduleCategory === 'upperlower' ? 0 : singleModules.length})
        </button>
        <button
          className={cn(styles.tab, selectedType === 'dual' && styles.activeTab)}
          onClick={() => setSelectedType('dual')}
        >
          듀얼 ({moduleCategory === 'upperlower' ? 0 : dualModules.length})
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
                activeZone={activeZone}
              />
            );
          })
        ) : (
          <div className={styles.emptyMessage}>
            {moduleCategory === 'upperlower' 
              ? `${upperLowerTab === 'lower' ? '하부장' : '상부장'} 모듈은 아직 준비 중입니다` 
              : '이 유형에 맞는 가구가 없습니다'}
          </div>
        )}
      </div>
    </div>
  );
};

export default ModuleGallery; 