import React, { useState, useMemo } from 'react';
import { getModulesByCategory, getModuleById, ModuleData } from '@/data/modules';
import { useSpaceConfigStore, SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import { calculateSpaceIndexing, ColumnIndexer } from '@/editor/shared/utils/indexing';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { isSlotAvailable } from '@/editor/shared/utils/slotAvailability';
import { analyzeColumnSlots } from '@/editor/shared/utils/columnSlotProcessor';
import { placeFurnitureAtSlot } from '@/editor/shared/furniture/hooks/usePlaceFurnitureAtSlot';
import { placeFurnitureFree } from '@/editor/shared/furniture/hooks/usePlaceFurnitureFree';
import { getInternalSpaceBoundsX, checkFreeCollision, FurnitureBoundsX } from '@/editor/shared/utils/freePlacementUtils';
import styles from './ModuleGallery.module.css';
import { useAlert } from '@/hooks/useAlert';
import { useUIStore } from '@/store/uiStore';
import { useTranslation } from '@/i18n/useTranslation';

// 가구 아이콘 매핑 - 각 가구 타입에 맞는 이미지 사용
// import.meta.env.BASE_URL을 사용하여 GitHub Pages base path 자동 적용
const getImagePath = (filename: string) => {
  // public 폴더의 파일은 /로 시작하는 절대 경로로 접근
  // 최신 브라우저는 URL에 한글이 있어도 자동으로 인코딩함
  return `/images/furniture-thumbnails/${filename}`;
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
  // 싱글 상부장
  'upper-cabinet-shelf': getImagePath('upper-cabinet-shelf.png'),
  'upper-cabinet-2tier': getImagePath('upper-cabinet-2tier.png'),
  'upper-cabinet-open': getImagePath('upper-cabinet-open.png'),
  'upper-cabinet-mixed': getImagePath('upper-cabinet-mixed.png'),
  // 싱글 하부장
  'lower-cabinet-basic': getImagePath('lower-cabinet-basic.png'),
  'lower-cabinet-2tier': getImagePath('lower-cabinet-2tier.png'),
  // 듀얼 상부장
  'dual-upper-cabinet-shelf': getImagePath('dual-upper-cabinet-shelf.png'),
  'dual-upper-cabinet-2tier': getImagePath('dual-upper-cabinet-2tier.png'),
  'dual-upper-cabinet-open': getImagePath('dual-upper-cabinet-open.png'),
  'dual-upper-cabinet-mixed': getImagePath('dual-upper-cabinet-mixed.png'),
  // 듀얼 하부장
  'dual-lower-cabinet-basic': getImagePath('dual-lower-cabinet-basic.png'),
  'dual-lower-cabinet-2tier': getImagePath('dual-lower-cabinet-2tier.png'),
};

// 모듈 타입 정의
export type ModuleType = 'all' | 'single' | 'dual';

// 썸네일 아이템 컴포넌트
interface ThumbnailItemProps {
  module: ModuleData;
  iconPath: string;
  isValid: boolean;
}

const ThumbnailItem: React.FC<ThumbnailItemProps> = ({ module, iconPath, isValid }) => {
  const { spaceInfo } = useSpaceConfigStore();
  const placedModules = useFurnitureStore(state => state.placedModules);
  const addModule = useFurnitureStore(state => state.addModule);
  const setFurniturePlacementMode = useFurnitureStore(state => state.setFurniturePlacementMode);
  const setCurrentDragData = useFurnitureStore(state => state.setCurrentDragData);
  const selectedFurnitureId = useFurnitureStore(state => state.selectedFurnitureId);
  const setSelectedFurnitureId = useFurnitureStore(state => state.setSelectedFurnitureId);
  const { showAlert, AlertComponent } = useAlert();
  const { activeDroppedCeilingTab, setIsSlotDragging } = useUIStore();

  // 드래그용 이미지 ref (각 썸네일마다 독립적인 DOM 요소)
  const dragImageRef = React.useRef<HTMLImageElement>(null);

  // 클릭과 더블클릭을 구분하기 위한 타이머
  const clickTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const isDoubleClickRef = React.useRef<boolean>(false);

  // 컴포넌트 언마운트 시 타이머 정리
  React.useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
    };
  }, []);

  // 드래그 시작 핸들러
  const handleDragStart = (e: React.DragEvent) => {
    if (!isValid) {
      e.preventDefault();
      return;
    }

    // 가구 배치 모드를 먼저 활성화
    setFurniturePlacementMode(true);
    setIsSlotDragging(true); // 슬롯 드래그 시작

    // 노서라운드 모드에서 frameSize를 강제로 0으로 수정
    let correctedSpaceInfo = spaceInfo;
    if (spaceInfo.surroundType === 'no-surround' && spaceInfo.frameSize &&
      (spaceInfo.frameSize.left > 0 || spaceInfo.frameSize.right > 0)) {
      console.error('🔴🔴🔴 [ModuleGallery] 노서라운드인데 frameSize가 잘못됨! 강제 수정!', {
        '원래 frameSize': spaceInfo.frameSize
      });
      correctedSpaceInfo = {
        ...spaceInfo,
        frameSize: { left: 0, right: 0, top: 0 }
      };
    }

    // 영역별 인덱싱 계산
    const indexing = calculateSpaceIndexing(correctedSpaceInfo);
    let targetZone: 'normal' | 'dropped' | undefined = undefined;
    const adjustedDimensions = { ...module.dimensions };
    let dragModuleId = module.id; // 드래그에 사용할 모듈 ID

    // 단내림이 활성화되어 있는 경우
    if (spaceInfo.droppedCeiling?.enabled) {
      // 서라운드 모드: zone을 undefined로 설정 (드롭 시점에 레이캐스팅으로 결정)
      // 노서라운드 모드: activeDroppedCeilingTab으로 zone 결정
      const isSurround = spaceInfo.surroundType === 'surround';
      targetZone = isSurround ? undefined : (activeDroppedCeilingTab === 'dropped' ? 'dropped' : 'normal');
      const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);

      if (targetZone === 'dropped' && zoneInfo.dropped) {
        // 단내림 영역의 개별 슬롯 너비 사용
        const droppedSlotWidths = zoneInfo.dropped.slotWidths || [];
        const droppedColumnWidth = zoneInfo.dropped.columnWidth;

        // 특수 듀얼 가구 체크
        const isSpecialDualFurniture = module.id.includes('dual-2drawer-styler') ||
          module.id.includes('dual-4drawer-pantshanger');

        // 듀얼 가구는 2개 슬롯을 사용하므로 2개 슬롯의 합계 너비로 확인
        if (isSpecialDualFurniture && droppedSlotWidths.length >= 2) {
          const dualWidth = droppedSlotWidths[0] + droppedSlotWidths[1];
          // 스타일러(694mm) 또는 바지걸이(564mm)의 최대값인 694mm로 체크
          if (dualWidth < 694) {
            showAlert('단내림 구간의 슬롯갯수를 줄여주세요', { title: '배치 불가' });
            e.preventDefault();
            return;
          }
        }

        // 동적 가구인 경우 크기 조정
        if (module.isDynamic) {
          const isDualFurniture = module.dimensions.width > droppedColumnWidth * 1.5;

          // 첫 번째 슬롯의 실제 너비 사용
          if (droppedSlotWidths.length > 0) {
            if (isDualFurniture && droppedSlotWidths.length >= 2) {
              adjustedDimensions.width = droppedSlotWidths[0] + droppedSlotWidths[1];
            } else {
              adjustedDimensions.width = droppedSlotWidths[0];
            }
          } else {
            // fallback: 평균 너비 사용
            adjustedDimensions.width = isDualFurniture ? droppedColumnWidth * 2 : droppedColumnWidth;
          }

          // 정확한 너비를 포함한 모듈 ID 생성 (소수점 1자리로 반올림)
          const widthForId = Math.round(adjustedDimensions.width * 10) / 10;
          const baseType = module.id.replace(/-[\d.]+$/, '');
          dragModuleId = `${baseType}-${widthForId}`;
        }
      } else if (targetZone === 'normal' && zoneInfo.normal) {
        // 메인 영역의 개별 슬롯 너비 사용
        const normalSlotWidths = zoneInfo.normal.slotWidths || [];
        const normalColumnWidth = zoneInfo.normal.columnWidth;

        // 특수 듀얼 가구 체크
        const isSpecialDualFurniture = module.id.includes('dual-2drawer-styler') ||
          module.id.includes('dual-4drawer-pantshanger');

        // 듀얼 가구는 2개 슬롯을 사용하므로 2개 슬롯의 합계 너비로 확인
        if (isSpecialDualFurniture && normalSlotWidths.length >= 2) {
          const dualWidth = normalSlotWidths[0] + normalSlotWidths[1];
          // 스타일러(694mm) 또는 바지걸이(564mm)의 최대값인 694mm로 체크
          if (dualWidth < 694) {
            showAlert('메인 구간의 슬롯갯수를 줄여주세요', { title: '배치 불가' });
            e.preventDefault();
            return;
          }
        }

        // 동적 가구인 경우 크기 조정
        if (module.isDynamic) {
          const isDualFurniture = module.dimensions.width > normalColumnWidth * 1.5;

          // 첫 번째 슬롯의 실제 너비 사용
          if (normalSlotWidths.length > 0) {
            if (isDualFurniture && normalSlotWidths.length >= 2) {
              adjustedDimensions.width = normalSlotWidths[0] + normalSlotWidths[1];
            } else {
              adjustedDimensions.width = normalSlotWidths[0];
            }
          } else {
            // fallback: 평균 너비 사용
            adjustedDimensions.width = isDualFurniture ? normalColumnWidth * 2 : normalColumnWidth;
          }

          // 정확한 너비를 포함한 모듈 ID 생성 (소수점 1자리로 반올림)
          const widthForId = Math.round(adjustedDimensions.width * 10) / 10;
          const baseType = module.id.replace(/-[\d.]+$/, '');
          dragModuleId = `${baseType}-${widthForId}`;
        }
      }
    } else {
      // 단내림이 없는 경우 기존 로직
      const isSpecialDualFurniture = module.id.includes('dual-2drawer-styler') ||
        module.id.includes('dual-4drawer-pantshanger');

      // 듀얼 가구는 2개 슬롯을 사용하므로 2개 슬롯의 합계 너비로 확인
      if (isSpecialDualFurniture) {
        const totalSlots = indexing.columnCount;
        if (totalSlots < 2) {
          showAlert('듀얼 가구를 배치하려면 최소 2개의 슬롯이 필요합니다', { title: '배치 불가' });
          e.preventDefault();
          return;
        }
        // 2개 슬롯의 합계 너비가 694mm (스타일러 내경폭) 이상인지 확인
        const dualWidth = indexing.columnWidth * 2;
        if (dualWidth < 694) {
          showAlert('슬롯갯수를 줄여주세요', { title: '배치 불가' });
          e.preventDefault();
          return;
        }
      }

      // 동적 가구인 경우 - 너비를 제외한 기본 타입만 전달
      if (module.isDynamic) {
        // 너비 정보를 제거한 기본 타입 ID만 사용
        // 실제 너비는 배치 시점에 SlotDropZones에서 계산
        const baseType = module.id.replace(/-[\d.]+$/, '');
        dragModuleId = baseType; // 너비 없이 기본 타입만

        // dimensions는 기본값 사용 (실제 배치 시 재계산됨)
        const isDualFurniture = module.id.startsWith('dual-');
        adjustedDimensions.width = isDualFurniture ? 1000 : 500; // 임시값
      }
    }

    // 드래그 데이터 설정 (영역 정보 추가)
    const dragData = {
      type: 'furniture',
      zone: targetZone,
      moduleData: {
        id: dragModuleId, // 조정된 ID 사용
        name: module.name,
        dimensions: adjustedDimensions, // 조정된 크기 사용
        originalDimensions: module.dimensions, // 원본 크기도 저장
        type: module.type || 'default',
        color: module.color,
        hasDoor: module.hasDoor || false,
        isDynamic: module.isDynamic,
        furnType: module.id.includes('dual-') ? 'dual' : 'single',
        customWidth: adjustedDimensions.width, // customWidth 추가
        modelConfig: module.modelConfig,
        category: module.category
      },
      // 🔴🔴🔴 CRITICAL: correctedSpaceInfo를 dragData에 포함
      spaceInfo: correctedSpaceInfo
    };

    e.dataTransfer.setData('application/json', JSON.stringify(dragData));
    e.dataTransfer.setData('text/plain', module.id);
    e.dataTransfer.effectAllowed = 'copy';

    // 드래그 고스트 이미지 설정 - ref에 있는 독립적인 DOM 이미지 사용
    if (dragImageRef.current && dragImageRef.current.complete) {
      e.dataTransfer.setDragImage(dragImageRef.current, 50, 50);
      console.log('🎨 고스트 설정:', module.name, iconPath);
    }

    // 전역 드래그 상태 설정
    setCurrentDragData(dragData);
  };

  // 드래그 종료 핸들러
  const handleDragEnd = () => {
    // 가구 배치 모드 비활성화
    setFurniturePlacementMode(false);
    setIsSlotDragging(false); // 슬롯 드래그 종료

    // 전역 드래그 상태 초기화를 지연시켜 drop 이벤트가 먼저 처리되도록 함
    setTimeout(() => {
      setCurrentDragData(null);
    }, 100);
  };

  // 클릭 핸들러 - Click & Place 기능
  const handleClick = () => {
    if (!isValid) return;

    // 자유배치 모드: 즉시 선택 (300ms 딜레이 없음, currentDragData 미설정)
    if (spaceInfo.layoutMode === 'free-placement') {
      if (selectedFurnitureId === module.id) {
        setSelectedFurnitureId(null);
        setFurniturePlacementMode(false);
        return;
      }
      setSelectedFurnitureId(module.id);
      setFurniturePlacementMode(true);
      return;
    }

    // 더블클릭이 처리되고 있으면 클릭 무시
    if (isDoubleClickRef.current) {
      isDoubleClickRef.current = false;
      return;
    }

    // 더블클릭 대기 중이면 클릭 무시
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
      return;
    }

    // 300ms 후에 클릭 처리 (더블클릭이 아닌 경우에만)
    clickTimeoutRef.current = setTimeout(() => {
      clickTimeoutRef.current = null;

      // 더블클릭이 발생했으면 클릭 처리 하지 않음
      if (isDoubleClickRef.current) {
        isDoubleClickRef.current = false;
        return;
      }

      // 이미 선택된 가구를 다시 클릭하면 비활성화
      if (selectedFurnitureId === module.id) {
        setSelectedFurnitureId(null);
        setFurniturePlacementMode(false);
        setCurrentDragData(null);
        return;
      }

      // 영역별 인덱싱 계산
      const indexing = calculateSpaceIndexing(spaceInfo);
      let targetZone: 'normal' | 'dropped' = 'normal';
      const adjustedDimensions = { ...module.dimensions };
      let dragModuleId = module.id;

      // 단내림이 활성화되어 있는 경우
      if (spaceInfo.droppedCeiling?.enabled) {
        targetZone = activeDroppedCeilingTab === 'dropped' ? 'dropped' : 'normal';
        const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);

        if (targetZone === 'dropped' && zoneInfo.dropped) {
          // 단내림 영역의 개별 슬롯 너비 사용
          const droppedSlotWidths = zoneInfo.dropped.slotWidths || [];
          const droppedColumnWidth = zoneInfo.dropped.columnWidth;

          // 특수 듀얼 가구 체크
          const isSpecialDualFurniture = module.id.includes('dual-2drawer-styler') ||
            module.id.includes('dual-4drawer-pantshanger');

          if (isSpecialDualFurniture && droppedSlotWidths.length >= 2) {
            const dualWidth = droppedSlotWidths[0] + droppedSlotWidths[1];
            if (dualWidth < 694) {
              showAlert('단내림 구간의 슬롯갯수를 줄여주세요', { title: '배치 불가' });
              return;
            }
          }

          // 동적 가구인 경우 크기 조정
          if (module.isDynamic) {
            const isDualFurniture = module.dimensions.width > droppedColumnWidth * 1.5;

            if (droppedSlotWidths.length > 0) {
              if (isDualFurniture && droppedSlotWidths.length >= 2) {
                const targetWidth = droppedSlotWidths[0] + droppedSlotWidths[1];
                // 소수점 1자리로 반올림하여 부동소수점 정밀도 문제 해결
                const widthForId = Math.round(targetWidth * 10) / 10;
                const baseType = module.id.replace(/-[\d.]+$/, '');
                dragModuleId = `${baseType}-${widthForId}`;
                adjustedDimensions.width = targetWidth;
              } else if (!isDualFurniture && droppedSlotWidths.length > 0) {
                const targetWidth = droppedSlotWidths[0];
                // 소수점 1자리로 반올림하여 부동소수점 정밀도 문제 해결
                const widthForId = Math.round(targetWidth * 10) / 10;
                const baseType = module.id.replace(/-[\d.]+$/, '');
                dragModuleId = `${baseType}-${widthForId}`;
                adjustedDimensions.width = targetWidth;
              }
            }
          }
        }
      } else {
        // 단내림이 없는 일반 경우에도 정확한 슬롯 너비로 ID 조정
        if (module.isDynamic) {
          const isDualFurniture = module.id.startsWith('dual-');

          if (indexing.slotWidths && indexing.slotWidths.length > 0) {
            let targetWidth;
            if (isDualFurniture && indexing.slotWidths.length >= 2) {
              targetWidth = indexing.slotWidths[0] + indexing.slotWidths[1];
            } else {
              targetWidth = indexing.slotWidths[0];
            }
            // 소수점 1자리로 반올림하여 부동소수점 정밀도 문제 해결
            const widthForId = Math.round(targetWidth * 10) / 10;
            const baseType = module.id.replace(/-[\d.]+$/, '');
            dragModuleId = `${baseType}-${widthForId}`;
            adjustedDimensions.width = targetWidth;
          } else {
            // fallback: 평균 너비 사용
            const targetWidth = isDualFurniture ? indexing.columnWidth * 2 : indexing.columnWidth;
            // 소수점 1자리로 반올림하여 부동소수점 정밀도 문제 해결
            const widthForId = Math.round(targetWidth * 10) / 10;
            const baseType = module.id.replace(/-[\d.]+$/, '');
            dragModuleId = `${baseType}-${widthForId}`;
            adjustedDimensions.width = targetWidth;
          }
        }
      }

      // 가구 선택 상태 설정
      setSelectedFurnitureId(module.id);
      setFurniturePlacementMode(true);

      // Click & Place를 위한 데이터 설정
      const clickPlaceData = {
        type: 'furniture',
        zone: targetZone,
        moduleData: {
          id: dragModuleId,
          name: module.name,
          dimensions: adjustedDimensions,
          originalDimensions: module.dimensions,
          type: module.type || 'default',
          color: module.color,
          hasDoor: module.hasDoor || false,
          isDynamic: module.isDynamic,
          furnType: module.id.includes('dual-') ? 'dual' : 'single',
          modelConfig: module.modelConfig,
          category: module.category
        }
      };

      setCurrentDragData(clickPlaceData);
    }, 300);
  };

  // 더블클릭 시 자동 배치 핸들러
  const handleDoubleClick = () => {
    // 더블클릭 플래그 설정
    isDoubleClickRef.current = true;

    if (!isValid) {
      return;
    }

    // 클릭 타이머가 있으면 취소 (클릭 이벤트 방지)
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }

    // Click & Place 모드 비활성화 (고스트 제거)
    setSelectedFurnitureId(null);
    setFurniturePlacementMode(false);
    setCurrentDragData(null);

    // ★ 자유배치 모드: placeFurnitureFree 사용
    if (spaceInfo.layoutMode === 'free-placement') {
      try {
        const internalSpace = calculateInternalSpace(spaceInfo);
        const moduleData = getModuleById(module.id, internalSpace, spaceInfo);
        if (!moduleData) {
          console.warn('❌ [자유배치 더블클릭] 모듈 데이터 없음:', module.id);
          return;
        }

        const dims = module.dimensions;
        const { startX, endX } = getInternalSpaceBoundsX(spaceInfo);

        // 중앙부터 시작해 빈 자리 찾기
        const centerX = (startX + endX) / 2;
        const step = dims.width;
        let targetX: number | null = null;

        // 중앙 → 좌우 교대로 탐색
        for (let offset = 0; offset <= (endX - startX); offset += step) {
          for (const sign of [0, 1, -1]) {
            const tryX = centerX + offset * sign;
            if (tryX - dims.width / 2 < startX || tryX + dims.width / 2 > endX) continue;
            const bounds: FurnitureBoundsX = {
              left: tryX - dims.width / 2,
              right: tryX + dims.width / 2,
              category: moduleData.category as 'full' | 'upper' | 'lower',
            };
            if (!checkFreeCollision(placedModules, bounds)) {
              targetX = tryX;
              break;
            }
          }
          if (targetX !== null) break;
        }

        if (targetX === null) {
          showAlert('배치할 공간이 부족합니다', { title: '배치 불가' });
          return;
        }

        const result = placeFurnitureFree({
          moduleId: module.id,
          xPositionMM: targetX,
          spaceInfo,
          dimensions: dims,
          existingModules: placedModules,
          moduleData,
        });

        if (result.success && result.module) {
          addModule(result.module);
          const setSelectedPlacedModuleId = useFurnitureStore.getState().setSelectedPlacedModuleId;
          setSelectedPlacedModuleId(result.module.id);
        } else {
          console.warn('❌ [자유배치 더블클릭] 배치 실패:', result.error);
        }
      } catch (error) {
        console.error('🚨 [자유배치 더블클릭] 오류:', error);
      } finally {
        setTimeout(() => { isDoubleClickRef.current = false; }, 100);
      }
      return;
    }

    try {
      // 노서라운드 모드에서 frameSize 확인 및 수정

      // 노서라운드 모드에서 frameSize를 강제로 0으로 수정
      let correctedSpaceInfo = spaceInfo;
      if (spaceInfo.surroundType === 'no-surround' && spaceInfo.frameSize &&
        (spaceInfo.frameSize.left > 0 || spaceInfo.frameSize.right > 0)) {
        console.error('🔴🔴🔴 [ModuleGallery] 더블클릭 - 노서라운드인데 frameSize가 잘못됨! 강제 수정!', {
          '원래 frameSize': spaceInfo.frameSize
        });
        correctedSpaceInfo = {
          ...spaceInfo,
          frameSize: { left: 0, right: 0, top: 0 }
        };
      }

      // 단내림 사용 여부에 따라 할당될 수 있는 영역 값
      let targetZone: 'normal' | 'dropped' | undefined = undefined;
      // 전체 공간 사용 (통합된 공간)
      const fullSpaceInfo = correctedSpaceInfo;
      const fullInternalSpace = calculateInternalSpace(correctedSpaceInfo);

      // 전체 공간에 대한 인덱싱 계산
      const indexing = calculateSpaceIndexing(fullSpaceInfo);
      const internalSpace = fullInternalSpace;

      // 특수 듀얼 가구 체크 (바지걸이장, 스타일러장)
      const isSpecialDualFurniture = module.id.includes('dual-2drawer-styler') ||
        module.id.includes('dual-4drawer-pantshanger');

      // 특수 듀얼 가구이고 슬롯폭이 부족한 경우
      if (isSpecialDualFurniture) {
        const totalSlots = indexing.columnCount;
        if (totalSlots < 2) {
          showAlert('듀얼 가구를 배치하려면 최소 2개의 슬롯이 필요합니다', { title: '배치 불가' });
          return;
        }
        // 2개 슬롯의 합계 너비가 694mm (스타일러 내경폭) 이상인지 확인
        const dualWidth = indexing.columnWidth * 2;
        if (dualWidth < 694) {
          showAlert('슬롯갯수를 줄여주세요', { title: '배치 불가' });
          return;
        }
      }

      // 동적 크기 조정이 필요한 가구인지 확인
      const isDynamicFurniture = module.isDynamic || module.id.includes('single-') || module.id.includes('dual-');

      // 영역에 맞는 실제 너비 계산
      let actualWidth = module.dimensions.width;
      if (isDynamicFurniture) {
        const isDualFurniture = module.id.startsWith('dual-');

        // 노서라운드 모드에서는 slotWidths 사용
        if (spaceInfo.surroundType === 'no-surround' && indexing.slotWidths && indexing.slotWidths.length > 0) {
          if (isDualFurniture && indexing.slotWidths.length >= 2) {
            actualWidth = indexing.slotWidths[0] + indexing.slotWidths[1];
          } else {
            actualWidth = indexing.slotWidths[0];
          }
        } else {
          actualWidth = isDualFurniture ? indexing.columnWidth * 2 : indexing.columnWidth;
        }
      }

      // 듀얼/싱글 가구 판별
      const isDualFurniture = module.id.startsWith('dual-');

      // 먼저 단내림 구역 정보를 파악
      let droppedZoneStart = 0;
      let droppedZoneEnd = 0;
      let normalZoneStart = 0;
      let normalZoneEnd = 0;

      if (spaceInfo.droppedCeiling?.enabled) {
        const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
        if (spaceInfo.droppedCeiling.position === 'left') {
          droppedZoneStart = 0;
          droppedZoneEnd = zoneInfo.dropped?.columnCount || 0;
          normalZoneStart = zoneInfo.dropped?.columnCount || 0;
          normalZoneEnd = indexing.columnCount;
        } else {
          normalZoneStart = 0;
          normalZoneEnd = zoneInfo.normal.columnCount;
          droppedZoneStart = zoneInfo.normal.columnCount;
          droppedZoneEnd = indexing.columnCount;
        }
      }

      // 첫 번째 빈 슬롯 찾기
      let availableSlotIndex = -1;

      // 단내림이 있는 경우: activeDroppedCeilingTab에 따라 우선 순위 결정
      if (spaceInfo.droppedCeiling?.enabled) {
        // activeDroppedCeilingTab이 'dropped'면 단내림 구간 우선, 아니면 일반 구간 우선
        const preferDropped = activeDroppedCeilingTab === 'dropped';

        if (preferDropped) {
          // 단내림 구간 우선 검색
          for (let i = droppedZoneStart; i < droppedZoneEnd; i++) {
            if (isDualFurniture) {
              const slot2 = i + 1;
              if (slot2 >= droppedZoneEnd) {
                continue;
              }
            }

            const isAvailable = isSlotAvailable(i, isDualFurniture, placedModules, fullSpaceInfo, module.id, undefined, 'dropped');
            if (isAvailable) {
              availableSlotIndex = i;
              break;
            }
          }

          // 단내림 구간에서 못 찾았으면 일반 구간에서 찾기
          if (availableSlotIndex === -1) {
            for (let i = normalZoneStart; i < normalZoneEnd; i++) {
              if (isDualFurniture) {
                const slot2 = i + 1;
                if (slot2 >= normalZoneEnd) {
                  continue;
                }
              }

              const isAvailable = isSlotAvailable(i, isDualFurniture, placedModules, fullSpaceInfo, module.id, undefined, 'normal');
              if (isAvailable) {
                availableSlotIndex = i;
                break;
              }
            }
          }
        } else {
          // 일반 구간 우선 검색
          for (let i = normalZoneStart; i < normalZoneEnd; i++) {
            if (isDualFurniture) {
              const slot2 = i + 1;
              if (slot2 >= normalZoneEnd) {
                continue;
              }
            }

            const isAvailable = isSlotAvailable(i, isDualFurniture, placedModules, fullSpaceInfo, module.id, undefined, 'normal');
            if (isAvailable) {
              availableSlotIndex = i;
              break;
            }
          }

          // 일반 구간에서 못 찾았으면 단내림 구간에서 찾기
          if (availableSlotIndex === -1) {
            for (let i = droppedZoneStart; i < droppedZoneEnd; i++) {
              if (isDualFurniture) {
                const slot2 = i + 1;
                if (slot2 >= droppedZoneEnd) {
                  continue;
                }
              }

              const isAvailable = isSlotAvailable(i, isDualFurniture, placedModules, fullSpaceInfo, module.id, undefined, 'dropped');
              if (isAvailable) {
                availableSlotIndex = i;
                break;
              }
            }
          }
        }
      } else {
        // 단내림이 없는 경우: 모든 슬롯을 순회
        for (let i = 0; i < indexing.columnCount; i++) {
          const isAvailable = isSlotAvailable(i, isDualFurniture, placedModules, fullSpaceInfo, module.id);
          if (isAvailable) {
            availableSlotIndex = i;
            break;
          }
        }
      }

      if (availableSlotIndex === -1) {
        console.warn('❌ 사용 가능한 슬롯이 없습니다.');
        return;
      }

      // 슬롯 인덱스에 따라 zone 결정
      let localSlotIndex = availableSlotIndex;

      if (spaceInfo.droppedCeiling?.enabled) {
        const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);

        // 단내림 위치에 따라 zone 판단
        if (spaceInfo.droppedCeiling.position === 'left') {
          if (zoneInfo.dropped && availableSlotIndex < zoneInfo.dropped.columnCount) {
            targetZone = 'dropped';
            localSlotIndex = availableSlotIndex;
          } else {
            targetZone = 'normal';
            localSlotIndex = availableSlotIndex - (zoneInfo.dropped?.columnCount || 0);
          }
        } else {
          if (zoneInfo.normal && availableSlotIndex < zoneInfo.normal.columnCount) {
            targetZone = 'normal';
            localSlotIndex = availableSlotIndex;
          } else {
            targetZone = 'dropped';
            localSlotIndex = availableSlotIndex - zoneInfo.normal.columnCount;
          }
        }
      }

      // ★★★ 공통 배치 함수 사용 (클릭+고스트, 드래그앤드랍과 동일) ★★★
      const result = placeFurnitureAtSlot({
        moduleId: module.id,
        slotIndex: localSlotIndex,
        zone: targetZone,
        spaceInfo: correctedSpaceInfo
      });

      if (!result.success) {
        console.error('❌ 가구 배치 실패:', result.error);
        return;
      }

      if (result.module) {
        addModule(result.module);

        // 배치된 가구를 자동으로 선택
        const setSelectedPlacedModuleId = useFurnitureStore.getState().setSelectedPlacedModuleId;
        setSelectedPlacedModuleId(result.module.id);
      }

    } catch (error) {
      console.error('🚨🚨🚨 [ModuleGallery] 가구 자동 배치 중 오류 발생:', error);
      console.error('Error details:', {
        moduleId: module.id,
        activeZone: activeDroppedCeilingTab,
        spaceInfo,
        error
      });
    } finally {
      // 더블클릭 처리 완료 후 플래그 리셋
      setTimeout(() => {
        isDoubleClickRef.current = false;
      }, 100);
    }
  };

  // ThumbnailItem 컴포넌트 내부 계속...

  return (
    <>
      <div
        className={`${styles.thumbnailItem} ${!isValid ? styles.disabled : ''} ${selectedFurnitureId === module.id ? styles.selected : ''}`}
        data-category={module.category}
        draggable={isValid}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        title={isValid ? `클릭하여 선택 또는 드래그하여 배치: ${module.name}` : '현재 공간에 배치할 수 없습니다'}
      >
        <div className={styles.thumbnailImage}>
          <img
            src={iconPath}
            alt={module.name}
            onError={(e) => {
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

      {/* 드래그 전용 이미지 (화면에 표시되지 않음, 각 썸네일마다 독립적) */}
      <img
        ref={dragImageRef}
        src={iconPath}
        alt=""
        style={{ position: 'absolute', left: '-9999px', width: '100px', height: '133px' }}
      />

      <AlertComponent />
    </>
  );
};

interface ModuleGalleryProps {
  moduleCategory?: 'tall' | 'upper' | 'lower';
  selectedType?: ModuleType;
  onSelectedTypeChange?: (type: ModuleType) => void;
  hideTabMenu?: boolean;
}

const ModuleGallery: React.FC<ModuleGalleryProps> = ({ moduleCategory = 'tall', selectedType: externalSelectedType, onSelectedTypeChange, hideTabMenu = false }) => {
  const { t } = useTranslation();
  // 선택된 탭 상태 (전체/싱글/듀얼/커스텀)
  const [internalSelectedType, setInternalSelectedType] = useState<ModuleType>('all');
  const selectedType = externalSelectedType ?? internalSelectedType;
  const setSelectedType = onSelectedTypeChange ?? setInternalSelectedType;

  // 에디터 스토어에서 공간 정보 가져오기
  const { spaceInfo } = useSpaceConfigStore();
  const { activeDroppedCeilingTab } = useUIStore();

  // 단내림이 활성화되어 있고 단내림 탭이 선택된 경우 영역별 공간 정보 사용
  let zoneSpaceInfo = spaceInfo;
  let zoneInternalSpace = calculateInternalSpace(spaceInfo);

  if (spaceInfo.droppedCeiling?.enabled && activeDroppedCeilingTab === 'dropped') {
    const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
    if (zoneInfo.dropped) {
      // 단내림 구간용 spaceInfo 생성
      // 중요: generateShelvingModules는 원본 spaceInfo를 사용해야 함
      // zone 정보만 추가하고 나머지는 그대로 유지
      zoneSpaceInfo = {
        ...spaceInfo,
        zone: 'dropped' as const // zone 정보만 추가
      } as SpaceInfo;
      // internalSpace는 zone의 실제 내경 사용
      const droppedInternalWidth = calculateInternalSpace(spaceInfo).width;
      zoneInternalSpace = {
        width: droppedInternalWidth || 850,
        height: spaceInfo.height - (spaceInfo.droppedCeiling?.dropHeight || 0),
        depth: calculateInternalSpace(spaceInfo).depth
      };
    }
  }

  // 인덱싱 정보 계산 (컬럼 정보) - 영역별 공간 정보 사용
  const indexing = calculateSpaceIndexing(zoneSpaceInfo);

  // adjustForIntegerSlotWidth 비활성화 - 소수점 2자리 유지를 위해
  // const adjustedResult = SpaceCalculator.adjustForIntegerSlotWidth(zoneSpaceInfo);
  // const adjustedSpaceInfo = adjustedResult.adjustmentMade ? adjustedResult.adjustedSpaceInfo : zoneSpaceInfo;
  const adjustedSpaceInfo = zoneSpaceInfo;
  const adjustedInternalSpace = calculateInternalSpace(adjustedSpaceInfo);

  // 조정된 spaceInfo에 슬롯 너비 정보 추가
  const spaceInfoWithSlotWidths = {
    ...adjustedSpaceInfo,
    _tempSlotWidths: indexing.slotWidths
  };

  // 카테고리에 따라 모듈 가져오기 (슬롯 너비 정보가 포함된 spaceInfo 사용)
  let categoryModules: ModuleData[] = [];
  if (moduleCategory === 'upper') {
    // 상부장 카테고리 선택시
    categoryModules = getModulesByCategory('upper', adjustedInternalSpace, spaceInfoWithSlotWidths);
  } else if (moduleCategory === 'lower') {
    // 하부장 카테고리 선택시
    categoryModules = getModulesByCategory('lower', adjustedInternalSpace, spaceInfoWithSlotWidths);
  } else {
    // 키큰장(전체형) 모듈
    categoryModules = getModulesByCategory('full', adjustedInternalSpace, spaceInfoWithSlotWidths);
  }

  const fullModules = categoryModules;
  console.log('🏗️ ModuleGallery 렌더링:', {
    moduleCategory,
    fullModulesCount: fullModules.length,
    selectedType,
    adjustedInternalSpace
  });

  // 싱글(1컬럼)과 듀얼(2컬럼) 모듈로 분류 (동적 크기 조정을 위해 ID 기반 분류)
  const { singleModules, dualModules } = useMemo(() => {
    // 컬럼이 1개인 경우 모두 싱글로 처리
    if (indexing.columnCount <= 1) {
      return {
        singleModules: fullModules,
        dualModules: []
      };
    }

    // ID 기반으로 싱글/듀얼 분류
    return fullModules.reduce((acc, module) => {
      // ID에 'dual-'이 포함되면 듀얼, 아니면 싱글
      if (module.id.includes('dual-')) {
        acc.dualModules.push(module);
      } else {
        acc.singleModules.push(module);
      }

      return acc;
    }, { singleModules: [] as ModuleData[], dualModules: [] as ModuleData[] });
  }, [fullModules, indexing.columnCount]);

  // 현재 선택된 탭에 따른 모듈 목록
  const currentModules = useMemo(() => {
    // 모든 카테고리에서 싱글/듀얼 필터링 적용
    const modules = selectedType === 'all'
      ? [...singleModules, ...dualModules]
      : selectedType === 'single'
        ? singleModules
        : dualModules;

    return modules;
  }, [selectedType, singleModules, dualModules]);

  // 가구 ID에서 키 추출하여 아이콘 경로 결정
  const getIconPath = (moduleId: string): string => {
    const moduleKey = moduleId.replace(/-[\d.]+$/, ''); // 폭 정보 제거
    return FURNITURE_ICONS[moduleKey] || FURNITURE_ICONS['single-2drawer-hanging'];
  };

  // 가구 유효성 검사 (간단 버전)
  const isModuleValid = (module: ModuleData): boolean => {
    // 듀얼 가구인지 확인
    const isDualModule = module.id.includes('dual-');

    // 단내림 구간에서 듀얼 가구는 실제 배치 가능성 체크
    if (activeDroppedCeilingTab === 'dropped' && isDualModule) {
      // 단내림 구간에서는 듀얼 가구가 2개 슬롯을 차지할 수 있는지 확인
      const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
      if (zoneInfo.dropped) {
        // 단내림 구간에 최소 2개의 슬롯이 있는지 확인
        return zoneInfo.dropped.columnCount >= 2 &&
          module.dimensions.height <= zoneInternalSpace.height &&
          module.dimensions.depth <= zoneInternalSpace.depth;
      }
    }

    // 일반적인 유효성 검사
    return module.dimensions.width <= zoneInternalSpace.width &&
      module.dimensions.height <= zoneInternalSpace.height &&
      module.dimensions.depth <= zoneInternalSpace.depth;
  };

  // cn 유틸 함수 추가
  const cn = (...classes: (string | undefined | null | false)[]) => {
    return classes.filter(Boolean).join(' ');
  };

  return (
    <div className={styles.container}>
      {/* 탭 메뉴 - hideTabMenu가 false일 때만 표시 (부모에서 별도 렌더링 시 숨김) */}
      {!hideTabMenu && (
        <div className={styles.tabMenu}>
          <button
            className={cn(styles.tab, selectedType === 'all' && styles.activeTab)}
            onClick={() => setSelectedType('all')}
          >
            {t('furniture.all')} ({singleModules.length + dualModules.length})
          </button>
          <button
            className={cn(styles.tab, selectedType === 'single' && styles.activeTab)}
            onClick={() => setSelectedType('single')}
          >
            {t('furniture.single')} ({singleModules.length})
          </button>
          <button
            className={cn(styles.tab, selectedType === 'dual' && styles.activeTab)}
            onClick={() => setSelectedType('dual')}
          >
            {t('furniture.dual')} ({dualModules.length})
          </button>
        </div>
      )}

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
              {moduleCategory === 'upper'
                ? `${t('furniture.upperCabinet')} ${t('furniture.moduleNotReady')}`
                : moduleCategory === 'lower'
                  ? `${t('furniture.lowerCabinet')} ${t('furniture.moduleNotReady')}`
                  : t('furniture.noModulesAvailable')}
            </div>
          )}
        </div>
    </div>
  );
};

export default ModuleGallery; 