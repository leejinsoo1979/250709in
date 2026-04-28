import React, { useState, useMemo, useEffect } from 'react';
import { getModulesByCategory, getModuleById, ModuleData } from '@/data/modules';
import { useSpaceConfigStore, SpaceInfo } from '@/store/core/spaceConfigStore';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import { calculateSpaceIndexing, ColumnIndexer } from '@/editor/shared/utils/indexing';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { isSlotAvailable } from '@/editor/shared/utils/slotAvailability';
import { analyzeColumnSlots } from '@/editor/shared/utils/columnSlotProcessor';
import { placeFurnitureAtSlot } from '@/editor/shared/furniture/hooks/usePlaceFurnitureAtSlot';
import { placeFurnitureFree } from '@/editor/shared/furniture/hooks/usePlaceFurnitureFree';
import { getInternalSpaceBoundsX, getModuleBoundsX } from '@/editor/shared/utils/freePlacementUtils';
import styles from './ModuleGallery.module.css';
import { useAlert } from '@/hooks/useAlert';
import { useUIStore } from '@/store/uiStore';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from '@/i18n/useTranslation';
import { getStandardDimensionKey } from './CustomizableFurnitureLibrary';

// 가구 아이콘 매핑 - 각 가구 타입에 맞는 이미지 사용
// import.meta.env.BASE_URL을 사용하여 GitHub Pages base path 자동 적용
const getImagePath = (filename: string) => {
  // public 폴더의 파일은 /로 시작하는 절대 경로로 접근
  // 최신 브라우저는 URL에 한글이 있어도 자동으로 인코딩함
  return `/images/furniture-thumbnails/${filename}`;
};

const FURNITURE_ICONS: Record<string, string> = {
  // 키큰장 (주방)
  'built-in-fridge': getImagePath('single_builtin.png'),
  'insert-frame': getImagePath('insert_frame.png'),
  'dual-built-in-fridge': getImagePath('dual_builtin.png'),
  'single-pull-out-cabinet': getImagePath('microwave.png'),
  'single-pantry-cabinet': getImagePath('pantry.png'),
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
  // 싱글 하부장 (이전 모듈 비활성화)
  // 'lower-cabinet-basic': getImagePath('lower-cabinet-basic.png'),
  // 'lower-cabinet-2tier': getImagePath('lower-cabinet-2tier.png'),
  // 새 하부장
  'lower-half-cabinet': getImagePath('lower-half-cabinet.png'),
  'lower-sink-cabinet': getImagePath('lower-sink-cabinet.png'),
  'lower-induction-cabinet': getImagePath('lower-induction-cabinet.png'),
  // 듀얼 상부장
  'dual-upper-cabinet-shelf': getImagePath('dual-upper-cabinet-shelf.png'),
  'dual-upper-cabinet-2tier': getImagePath('dual-upper-cabinet-2tier.png'),
  'dual-upper-cabinet-open': getImagePath('dual-upper-cabinet-open.png'),
  'dual-upper-cabinet-mixed': getImagePath('dual-upper-cabinet-mixed.png'),
  // 듀얼 하부장 (이전 모듈 비활성화)
  // 'dual-lower-cabinet-basic': getImagePath('dual-lower-cabinet-basic.png'),
  // 'dual-lower-cabinet-2tier': getImagePath('dual-lower-cabinet-2tier.png'),
  // 새 듀얼 하부장
  'dual-lower-half-cabinet': getImagePath('dual-lower-half-cabinet.png'),
  'dual-lower-sink-cabinet': getImagePath('dual-lower-sink-cabinet.png'),
  'dual-lower-induction-cabinet': getImagePath('dual-lower-induction-cabinet.png'),
  // 기본하부장 서랍
  'lower-drawer-2tier': getImagePath('lower-drawer-2tier.png'),
  'dual-lower-drawer-2tier': getImagePath('dual-lower-drawer-2tier.png'),
  'lower-drawer-3tier': getImagePath('lower-drawer-3tier.png'),
  'dual-lower-drawer-3tier': getImagePath('dual-lower-drawer-3tier.png'),
  // 도어올림 하부장
  'lower-door-lift-half': getImagePath('lower-door-lift-half.png'),
  'dual-lower-door-lift-half': getImagePath('dual-lower-door-lift-half.png'),
  'lower-door-lift-2tier': getImagePath('lower-door-lift-2tier.png'),
  'dual-lower-door-lift-2tier': getImagePath('dual-lower-door-lift-2tier.png'),
  'lower-door-lift-3tier': getImagePath('lower-door-lift-3tier.png'),
  'dual-lower-door-lift-3tier': getImagePath('dual-lower-door-lift-3tier.png'),
  // 도어올림 터치 하부장
  'lower-door-lift-touch-2tier-a': getImagePath('lower-door-lift-touch-2tier-a.png'),
  'dual-lower-door-lift-touch-2tier-a': getImagePath('dual-lower-door-lift-touch-2tier-a.png'),
  'lower-door-lift-touch-2tier-b': getImagePath('lower-door-lift-touch-2tier-b.png'),
  'dual-lower-door-lift-touch-2tier-b': getImagePath('dual-lower-door-lift-touch-2tier-b.png'),
  'lower-door-lift-touch-3tier': getImagePath('lower-door-lift-touch-3tier.png'),
  'dual-lower-door-lift-touch-3tier': getImagePath('dual-lower-door-lift-touch-3tier.png'),
  // 상판내림 하부장
  'lower-top-down-half': getImagePath('lower-top-down-half.png'),
  'dual-lower-top-down-half': getImagePath('dual-lower-top-down-half.png'),
  'lower-top-down-2tier': getImagePath('lower-top-down-2tier.png'),
  'dual-lower-top-down-2tier': getImagePath('dual-lower-top-down-2tier.png'),
  'lower-top-down-3tier': getImagePath('lower-top-down-3tier.png'),
  'dual-lower-top-down-3tier': getImagePath('dual-lower-top-down-3tier.png'),
  'lower-top-down-touch-2tier': getImagePath('lower-top-down-touch-2tier.png'),
  'dual-lower-top-down-touch-2tier': getImagePath('dual-lower-top-down-touch-2tier.png'),
  'lower-top-down-touch-3tier': getImagePath('lower-top-down-touch-3tier.png'),
  'dual-lower-top-down-touch-3tier': getImagePath('dual-lower-top-down-touch-3tier.png'),
  // 싱글 선반장
  'single-2drawer-shelf': getImagePath('7.png'),
  'single-4drawer-shelf': getImagePath('8.png'),
  'single-shelf': getImagePath('9.png'),
  // 듀얼 선반장
  'dual-4drawer-shelf': getImagePath('18.png'),
  'dual-2drawer-shelf': getImagePath('19.png'),
  'dual-shelf': getImagePath('20.png'),
  // 현관장 H
  'single-entryway-h': getImagePath('entrance_single-H.png'),
  'dual-entryway-h': getImagePath('entrance_duel-H.png'),
  // 현관장 I (비활성화)
  // 'single-entryway-i': getImagePath('entrance_single-I.png'),
  // 'dual-entryway-i': getImagePath('entrance_duel-I.png'),
};

// 모듈 타입 정의
export type ModuleType = 'all' | 'single' | 'dual';

// 신발장 판별 (full 카테고리 내)
// - 선반장 계열: single-shelf-*, dual-shelf-*, single-Ndrawer-shelf-*, dual-Ndrawer-shelf-*
// - 현관장 계열: single-entryway-*, dual-entryway-*
// 주의: upper-cabinet-shelf-*, dual-upper-cabinet-shelf-* 는 upper 카테고리이므로 여기 해당 없음
const isShoeModuleId = (id: string): boolean => {
  if (id.includes('entryway')) return true;
  // -shelf로 끝나는 ID 키 (폭 제거 후) 또는 중간에 -shelf-가 포함된 full 모듈
  // full 카테고리 기준이므로 upper/lower 접두어가 없음
  // 예: single-shelf-600, single-4drawer-shelf-600
  // 구분: upper-cabinet-shelf 계열은 upper 카테고리라 여기로 안 옴
  const key = id.replace(/-[\d.]+$/, '');
  return /(^|-)shelf$/.test(key) || /-shelf$/.test(key);
};

/**
 * 썸네일 하단에 표시할 이름 포맷팅
 * - 뒤에 붙은 "XXmm" 제거
 * - 듀얼: "듀얼 " 접두어 제거, "한통" 제거 (접미어 없음)
 * - 싱글: "반통"을 항상 "(반통)" 형태로 감싸서 표시 (이름 안에 있어도 괄호로 변환)
 */
const formatThumbnailName = (module: ModuleData): string => {
  let name = module.name.replace(/\s*[\d.]+mm$/, '');
  const isDual = module.id.includes('dual-');

  // "한통" 제거, "듀얼 " 접두어 제거
  name = name.replace(/\s*한통/, '').replace(/^듀얼\s*/, '');

  if (isDual) return name.trim();

  // 싱글: 이름 안의 "반통" 또는 "(반통)"을 모두 제거한 뒤, 끝에 "(반통)" 하나만 붙임
  name = name
    .replace(/\s*\(반통\)/g, '')
    .replace(/\s*반통/g, '')
    .trim();
  return `${name}(반통)`;
};

// 썸네일 아이�� 컴포넌트
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
  // (다크모드 검정 배경 처리 제거 — 누끼 처리된 PNG로 사용자가 직접 작업함)

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
        // 스타일러장 배치 제한 해제 (바지걸이장만 제한 유지)
        const isSpecialDualFurniture = module.id.includes('dual-4drawer-pantshanger');

        // 듀얼 가구는 2개 슬롯을 사용하므로 2개 슬롯의 합계 너비로 확인
        if (isSpecialDualFurniture) {
          // 싱글 슬롯 525mm 미만 체크
          if (droppedSlotWidths.length > 0 && droppedSlotWidths[0] < 525) {
            showAlert('본 가구는 슬롯 폭이 525mm 이상이어야 배치할 수 있습니다', { title: '배치 불가' });
            e.preventDefault();
            return;
          }
          // 듀얼 2슬롯 합계 1050mm 미만 체크
          if (droppedSlotWidths.length >= 2) {
            const dualWidth = droppedSlotWidths[0] + droppedSlotWidths[1];
            if (dualWidth < 1050) {
              showAlert('본 가구는 슬롯 2개의 합이 1050mm 이상이어야 배치할 수 있습니다', { title: '배치 불가' });
              e.preventDefault();
              return;
            }
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
        // 스타일러장 배치 제한 해제 (바지걸이장만 제한 유지)
        const isSpecialDualFurniture = module.id.includes('dual-4drawer-pantshanger');

        if (isSpecialDualFurniture) {
          // 싱글 슬롯 525mm 미만 체크
          if (normalSlotWidths.length > 0 && normalSlotWidths[0] < 525) {
            showAlert('본 가구는 슬롯 폭이 525mm 이상이어야 배치할 수 있습니다', { title: '배치 불가' });
            e.preventDefault();
            return;
          }
          // 듀얼 2슬롯 합계 1050mm 미만 체크
          if (normalSlotWidths.length >= 2) {
            const dualWidth = normalSlotWidths[0] + normalSlotWidths[1];
            if (dualWidth < 1050) {
              showAlert('본 가구는 슬롯 2개의 합이 1050mm 이상이어야 배치할 수 있습니다', { title: '배치 불가' });
              e.preventDefault();
              return;
            }
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
      // 스타일러장 배치 제한 해제 (바지걸이장만 제한 유지)
      const isSpecialDualFurniture = module.id.includes('dual-4drawer-pantshanger');

      if (isSpecialDualFurniture) {
        const totalSlots = indexing.columnCount;
        if (totalSlots < 2) {
          showAlert('듀얼 가구를 배치하려면 최소 2개의 슬롯이 필요합니다', { title: '배치 불가' });
          e.preventDefault();
          return;
        }
        // 싱글 슬롯 525mm 미만 체크
        if (indexing.columnWidth < 525) {
          showAlert('본 가구는 슬롯 폭이 525mm 이상이어야 배치할 수 있습니다', { title: '배치 불가' });
          e.preventDefault();
          return;
        }
        // 듀얼 2슬롯 합계 1050mm 미만 체크
        const dualWidth = indexing.columnWidth * 2;
        if (dualWidth < 1050) {
          showAlert('본 가구는 슬롯 2개의 합이 1050mm 이상이어야 배치할 수 있습니다', { title: '배치 불가' });
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
        // 빌트인 냉장고장: 폭 600 고정
        const isBuiltInFridge = module.id.includes('built-in-fridge');
        const isDualFurniture = module.id.startsWith('dual-');
        adjustedDimensions.width = isBuiltInFridge ? 600 : (isDualFurniture ? 1000 : 500);
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

          // 특수 듀얼 가구 체크 (스타일러장 제한 해제, 바지걸이장만 제한 유지)
          const isSpecialDualFurniture = module.id.includes('dual-4drawer-pantshanger');

          if (isSpecialDualFurniture) {
            // 싱글 슬롯 525mm 미만 체크
            if (droppedSlotWidths.length > 0 && droppedSlotWidths[0] < 525) {
              showAlert('본 가구는 슬롯 폭이 525mm 이상이어야 배치할 수 있습니다', { title: '배치 불가' });
              return;
            }
            // 듀얼 2슬롯 합계 1050mm 미만 체크
            if (droppedSlotWidths.length >= 2) {
              const dualWidth = droppedSlotWidths[0] + droppedSlotWidths[1];
              if (dualWidth < 1050) {
                showAlert('본 가구는 슬롯 2개의 합이 1050mm 이상이어야 배치할 수 있습니다', { title: '배치 불가' });
                return;
              }
            }
          }

          // 동적 가구인 경우 크기 조정
          if (module.isDynamic) {
            // 빌트인 냉장고장: 폭 582 고정 (사이즈 변경 불가)
            if (module.id.includes('built-in-fridge')) {
              dragModuleId = module.id; // 'built-in-fridge-582' 그대로
              adjustedDimensions.width = 582;
            } else {
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
        }
      } else {
        // 단내림이 없는 일반 경우에도 정확한 슬롯 너비로 ID 조정
        if (module.isDynamic) {
          const isDualFurniture = module.id.startsWith('dual-');
          // 빌트인 냉장고장: dimensions는 600 고정, ID만 슬롯 너비로
          const isBuiltInFridge = module.id.includes('built-in-fridge');

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
            // 빌트인 냉장고장: 실제 폭은 항상 600 고정
            adjustedDimensions.width = isBuiltInFridge ? 600 : targetWidth;
          } else {
            // fallback: 평균 너비 사용
            const targetWidth = isDualFurniture ? indexing.columnWidth * 2 : indexing.columnWidth;
            // 소수점 1자리로 반올림하여 부동소수점 정밀도 문제 해결
            const widthForId = Math.round(targetWidth * 10) / 10;
            const baseType = module.id.replace(/-[\d.]+$/, '');
            dragModuleId = `${baseType}-${widthForId}`;
            adjustedDimensions.width = isBuiltInFridge ? 600 : targetWidth;
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

        // 이전 배치 치수 적용 (lastCustomDimensions) — 단, 너비는 모듈 기본값 우선
        // (lastDims는 이전에 자동 축소된 값일 수 있어 그대로 쓰면 공간 낭비)
        const stdKey = getStandardDimensionKey(module.id);
        const lastDims = useFurnitureStore.getState().lastCustomDimensions[stdKey];
        let dims = lastDims
          ? { width: module.dimensions.width, height: lastDims.height, depth: lastDims.depth }
          : { ...module.dimensions };
        const fullBounds = getInternalSpaceBoundsX(spaceInfo);

        // 단내림(stepCeiling) 활성 시: 메인 구간 + 단내림 구간을 별도로 검색
        const hasStepCeiling = !!spaceInfo.stepCeiling?.enabled;
        const scWidthMm = hasStepCeiling ? (spaceInfo.stepCeiling!.width || 0) : 0;
        const scPos = hasStepCeiling ? (spaceInfo.stepCeiling!.position || 'right') : 'right';
        const middleGap = spaceInfo.gapConfig?.middle ?? 1.5;

        // 구간별 영역 계산
        // fullBounds = 통합 배치공간(메인+단내림, 커튼박스 제외)
        // 단내림 구간은 통합 배치공간 내에서 위치 기준으로 분리
        interface ZoneRange { startX: number; endX: number; zone: 'main' | 'step' }
        const zones: ZoneRange[] = [];
        if (hasStepCeiling) {
          // 단내림 경계점 = 공간 원점 기준으로 계산
          // 커튼박스는 항상 단내림과 같은 쪽 → 커튼박스 폭 차감
          const halfW = (spaceInfo.width || 2400) / 2;
          const cbWidth = spaceInfo.droppedCeiling?.enabled ? (spaceInfo.droppedCeiling.width || 150) : 0;

          const scBoundary = scPos === 'left'
            ? -halfW + cbWidth + scWidthMm  // 좌: [벽][커튼박스][단내림]|경계|[메인][벽]
            : halfW - cbWidth - scWidthMm;  // 우: [벽][메인]|경계|[단내림][커튼박스][벽]

          if (scPos === 'left') {
            // [벽] [커튼박스] [단내림] [middleGap] [메인] [벽]
            zones.push({ startX: scBoundary + middleGap, endX: fullBounds.endX, zone: 'main' });
            zones.push({ startX: fullBounds.startX, endX: scBoundary, zone: 'step' });
          } else {
            // [벽] [메인] [middleGap] [단내림] [커튼박스] [벽]
            zones.push({ startX: fullBounds.startX, endX: scBoundary - middleGap, zone: 'main' });
            zones.push({ startX: scBoundary, endX: fullBounds.endX, zone: 'step' });
          }
        } else {
          zones.push({ startX: fullBounds.startX, endX: fullBounds.endX, zone: 'main' });
        }

        // 좌측부터 순서대로 빈 자리 찾기
        let furnitureWidth = dims.width;
        const newCategory = (moduleData.category || 'full') as 'full' | 'upper' | 'lower';
        const isNewDual = module.id.includes('dual-');
        const MAX_SINGLE = 600;
        const MAX_DUAL = 1200;
        const maxAllowedWidth = isNewDual ? MAX_DUAL : MAX_SINGLE;
        // 빌트인 냉장고장(582) / 인서트 프레임(136) / 듀얼 빌트인(1300): 고정폭 — 빈 공간에 맞춰 확장하지 않음
        const isDualBuiltIn = module.id.includes('dual-built-in-fridge');
        const isFixedWidth = module.id.includes('built-in-fridge') || module.id.includes('insert-frame') || isDualBuiltIn;
        // 듀얼 빌트인 냉장고장 고정 너비 1300mm (582 + 136 + 582)
        const dualBuiltInTotalWidth = 1300;

        const freeModules = placedModules.filter(m => m.isFreePlacement && !m.isSurroundPanel);
        const allBounds = freeModules.map(m => getModuleBoundsX(m)).sort((a, b) => a.left - b.left);

        // upper/lower 공존: 다른 카테고리 가구는 장애물에서 제외
        const isCoexistable = newCategory === 'upper' || newCategory === 'lower';
        const blockingBounds = isCoexistable
          ? allBounds.filter(b => b.category === newCategory || b.category === 'full')
          : allBounds;
        const sortedBounds = blockingBounds.sort((a, b) => a.left - b.left);

        // 각 구간에서 후보 빈 공간 수집 (메인 우선, 단내림 다음)
        let targetX: number | null = null;
        for (const zone of zones) {
          const { startX, endX } = zone;

          const candidates: { left: number; right: number }[] = [];
          // 구간 내 장애물만 필터링
          const zoneBounds = sortedBounds.filter(b => b.right > startX && b.left < endX);
          if (zoneBounds.length === 0) {
            candidates.push({ left: startX, right: endX });
          } else {
            if (zoneBounds[0].left > startX) {
              candidates.push({ left: startX, right: zoneBounds[0].left });
            }
            for (let i = 0; i < zoneBounds.length - 1; i++) {
              if (zoneBounds[i + 1].left > zoneBounds[i].right) {
                candidates.push({ left: zoneBounds[i].right, right: zoneBounds[i + 1].left });
              }
            }
            const lastRight = zoneBounds[zoneBounds.length - 1].right;
            if (endX > lastRight) {
              candidates.push({ left: lastRight, right: endX });
            }
          }

          // 자유배치: 가구를 남은 빈 공간에 맞춰 배치 (단, 싱글 600 / 듀얼 1200 상한)
          // 가장 큰 빈 공간을 찾아 그 크기만큼 가구 너비를 맞춤
          if (candidates.length > 0) {
            const largestGap = candidates.reduce((max, g) => {
              const w = g.right - g.left;
              return w > (max.right - max.left) ? g : max;
            }, candidates[0]);
            const gapW = Math.floor(largestGap.right - largestGap.left);
            // 듀얼 빌트인은 1300 고정. 그 외 고정폭은 모듈 기본값. 일반은 200 최소.
            const minRequired = isDualBuiltIn ? dualBuiltInTotalWidth : (isFixedWidth ? dims.width : 200);
            if (gapW >= minRequired) {
              if (isDualBuiltIn) {
                furnitureWidth = dualBuiltInTotalWidth;
              } else if (isFixedWidth) {
                furnitureWidth = dims.width;
              } else {
                furnitureWidth = Math.min(gapW, maxAllowedWidth);
              }
              dims = { ...dims, width: furnitureWidth };
              targetX = largestGap.left + furnitureWidth / 2;
              break;
            }
          }

        }

        if (targetX === null) {
          if (isDualBuiltIn) {
            console.error('[듀얼냉장고장 자유배치 실패] targetX===null. dims.width=', dims.width, 'minRequired=', dualBuiltInTotalWidth, 'zones=', zones, 'sortedBounds=', sortedBounds);
          }
          showAlert(isDualBuiltIn
            ? `배치 공간이 부족합니다. 듀얼 빌트인 냉장고장은 ${dualBuiltInTotalWidth}mm 이상의 빈 공간이 필요합니다.`
            : '배치할 공간이 부족합니다', { title: '배치 불가' });
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
          // 듀얼 빌트인 등 분할 배치된 추가 모듈도 함께 추가
          if (result.additionalModules && result.additionalModules.length > 0) {
            result.additionalModules.forEach(m => addModule(m));
          }
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

      // 특수 듀얼 가구 체크 (바지걸이장만 제한, 스타일러장 해제)
      const isSpecialDualFurniture = module.id.includes('dual-4drawer-pantshanger');

      // 특수 듀얼 가구이고 슬롯폭이 부족한 경우
      if (isSpecialDualFurniture) {
        // 싱글 슬롯이 525mm 미만이면 배치 불가
        if (indexing.columnWidth < 525) {
          showAlert('본 가구는 슬롯 폭이 525mm 이상이어야 배치할 수 있습니다', { title: '배치 불가' });
          return;
        }
        const totalSlots = indexing.columnCount;
        if (totalSlots < 2) {
          showAlert('듀얼 가구를 배치하려면 최소 2개의 슬롯이 필요합니다', { title: '배치 불가' });
          return;
        }
        // 2개 슬롯의 합계 너비가 1050mm 이상인지 확인
        const dualWidth = indexing.columnWidth * 2;
        if (dualWidth < 1050) {
          showAlert('본 가구는 슬롯 2개의 합이 1050mm 이상이어야 배치할 수 있습니다', { title: '배치 불가' });
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

      // 첫 번째 빈 슬롯 찾기 (로컬 인덱스 사용)
      let availableSlotIndex = -1;
      let foundZone: 'normal' | 'dropped' | undefined = undefined;

      // 단내림이 있는 경우: activeDroppedCeilingTab에 따라 우선 순위 결정
      if (spaceInfo.droppedCeiling?.enabled) {
        const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
        const normalCount = zoneInfo.normal?.columnCount ?? 0;
        const droppedCount = zoneInfo.dropped?.columnCount ?? 0;

        // activeDroppedCeilingTab이 'dropped'면 단내림 구간 우선, 아니면 일반 구간 우선
        const preferDropped = activeDroppedCeilingTab === 'dropped';

        // 로컬 인덱스(0~zoneColumnCount)로 검색하는 헬퍼
        const searchZone = (zone: 'normal' | 'dropped', count: number): number => {
          for (let i = 0; i < count; i++) {
            if (isDualFurniture && i + 1 >= count) {
              continue;
            }
            const isAvail = isSlotAvailable(i, isDualFurniture, placedModules, fullSpaceInfo, module.id, undefined, zone);
            if (isAvail) {
              return i;
            }
          }
          return -1;
        };

        if (preferDropped) {
          // 단내림 구간 우선 검색
          availableSlotIndex = searchZone('dropped', droppedCount);
          if (availableSlotIndex !== -1) {
            foundZone = 'dropped';
          } else {
            // 단내림 구간에서 못 찾았으면 일반 구간에서 찾기
            availableSlotIndex = searchZone('normal', normalCount);
            if (availableSlotIndex !== -1) {
              foundZone = 'normal';
            }
          }
        } else {
          // 일반 구간 우선 검색
          availableSlotIndex = searchZone('normal', normalCount);
          if (availableSlotIndex !== -1) {
            foundZone = 'normal';
          } else {
            // 일반 구간에서 못 찾았으면 단내림 구간에서 찾기
            availableSlotIndex = searchZone('dropped', droppedCount);
            if (availableSlotIndex !== -1) {
              foundZone = 'dropped';
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

      // zone이 결정된 경우 직접 사용 (로컬 인덱스 그대로)
      const localSlotIndex = availableSlotIndex;
      if (foundZone) {
        targetZone = foundZone;
      }

      // ★★★ 공통 배치 함수 사용 (클릭+고스트, 드래그앤드랍과 동일) ★★★
      console.log('🔵 [더블클릭배치]', { moduleId: module.id, localSlotIndex, targetZone, spaceWidth: correctedSpaceInfo.width });
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
          {iconPath ? (
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
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', fontSize: '11px', color: 'var(--theme-primary)', backgroundColor: 'color-mix(in srgb, var(--theme-primary) 20%, transparent)', textAlign: 'center', padding: '4px', wordBreak: 'keep-all', borderRadius: '4px' }}>
              {module.name.replace(/\s*[\d.]+mm$/, '')}
            </div>
          )}
          {!isValid && <div className={styles.disabledOverlay} />}
        </div>
        <div className={styles.thumbnailName}>{formatThumbnailName(module)}</div>
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

// 주방 서브카테고리 (기본장/도어올림/상판내림/상부장/키큰장)
export type KitchenSubCategory = 'basic' | 'door-raise' | 'top-down' | 'upper' | 'tall';

interface ModuleGalleryProps {
  // clothing=키큰장(full), shoes=신발장(전용 모듈), kitchen=주방(하부장+상부장)
  // tall/upper/lower는 기존 호환용으로 유지
  moduleCategory?: 'tall' | 'upper' | 'lower' | 'clothing' | 'shoes' | 'kitchen' | 'island';
  // 주방 서브카테고리 (moduleCategory가 'kitchen'일 때만 사용)
  kitchenSubCategory?: KitchenSubCategory;
  selectedType?: ModuleType;
  onSelectedTypeChange?: (type: ModuleType) => void;
  hideTabMenu?: boolean;
}

const ModuleGallery: React.FC<ModuleGalleryProps> = ({ moduleCategory = 'tall', kitchenSubCategory = 'basic', selectedType: externalSelectedType, onSelectedTypeChange, hideTabMenu = false }) => {
  const { t } = useTranslation();
  // 선택된 탭 상태 (전체/싱글/듀얼/커스텀)
  const [internalSelectedType, setInternalSelectedType] = useState<ModuleType>('all');
  // 주방 카테고리는 싱글/듀얼 구분 없이 항상 'all'로 고정
  const rawSelectedType = externalSelectedType ?? internalSelectedType;
  const selectedType: ModuleType = moduleCategory === 'kitchen' ? 'all' : rawSelectedType;
  const setSelectedType = onSelectedTypeChange ?? setInternalSelectedType;

  // 주방 진입 시 외부 selectedType도 'all'로 동기화
  useEffect(() => {
    if (moduleCategory === 'kitchen' && rawSelectedType !== 'all') {
      setSelectedType('all');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleCategory]);

  // 에디터 스토어에서 공간 정보 가져오기
  const { spaceInfo } = useSpaceConfigStore();
  const { activeDroppedCeilingTab } = useUIStore();
  // 빌트인 냉장고장 검증용 - 이미 배치된 가구들의 고정 폭 합산에 사용
  const placedModulesForValid = useFurnitureStore(state => state.placedModules);

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
  } else if (moduleCategory === 'clothing') {
    // 의류장 = 키큰장(full) 중 신발장/주방 키큰장 제외
    categoryModules = getModulesByCategory('full', adjustedInternalSpace, spaceInfoWithSlotWidths)
      .filter(m =>
        !isShoeModuleId(m.id) &&
        !m.id.includes('built-in-fridge') &&
        !m.id.includes('insert-frame') &&
        !m.id.includes('pull-out-cabinet') &&
        !m.id.includes('pantry-cabinet') &&
        !m.id.includes('fridge-cabinet')
      );
  } else if (moduleCategory === 'shoes') {
    // 신발장 = full 카테고리 내 선반장 계열 + 현관장
    categoryModules = getModulesByCategory('full', adjustedInternalSpace, spaceInfoWithSlotWidths)
      .filter(m => isShoeModuleId(m.id));
  } else if (moduleCategory === 'kitchen') {
    // 주방 = 서브카테고리별 필터링
    if (kitchenSubCategory === 'upper') {
      // 상부장 = upper 전체
      categoryModules = getModulesByCategory('upper', adjustedInternalSpace, spaceInfoWithSlotWidths);
    } else if (kitchenSubCategory === 'tall') {
      // 키큰장 = full 카테고리 중 키큰장 전용 모듈 (빌트인 냉장고장, Insert 프레임, 인출장, 팬트리장, 냉장고장 등)
      const allFullModules = getModulesByCategory('full', adjustedInternalSpace, spaceInfoWithSlotWidths);
      categoryModules = allFullModules.filter(m =>
        m.id.includes('built-in-fridge') ||
        m.id.includes('insert-frame') ||
        m.id.includes('pull-out-cabinet') ||
        m.id.includes('pantry-cabinet') ||
        m.id.includes('fridge-cabinet')
      );
      console.log('[키큰장 탭] full 모듈 전체:', allFullModules.map(m => m.id));
      console.log('[키큰장 탭] 필터링 후:', categoryModules.map(m => m.id));
    } else {
      // 기본장/도어올림/상판내림 = lower 중 ID 패턴으로 분기
      const lowerMods = getModulesByCategory('lower', adjustedInternalSpace, spaceInfoWithSlotWidths);
      categoryModules = lowerMods.filter(m => {
        const id = m.id;
        const isDoorRaise = id.includes('door-lift') || id.includes('door-raise');
        const isTopDown = id.includes('top-down');
        if (kitchenSubCategory === 'door-raise') return isDoorRaise;
        if (kitchenSubCategory === 'top-down') return isTopDown;
        // 기본장 = 도어올림/상판내림 제외한 나머지
        return !isDoorRaise && !isTopDown;
      });
    }
  } else if (moduleCategory === 'island') {
    // 아일랜드 = 주방 하부장 모듈 재사용 (기본장/도어올림/상판내림만, 상부장 제외)
    const lowerMods = getModulesByCategory('lower', adjustedInternalSpace, spaceInfoWithSlotWidths);
    categoryModules = lowerMods.filter(m => {
      const id = m.id;
      const isDoorRaise = id.includes('door-lift') || id.includes('door-raise');
      const isTopDown = id.includes('top-down');
      if (kitchenSubCategory === 'door-raise') return isDoorRaise;
      if (kitchenSubCategory === 'top-down') return isTopDown;
      return !isDoorRaise && !isTopDown;
    });
  } else {
    // 키큰장(전체형) 모듈 (기존 'tall' 호환) — 주방 전용 모듈 제외
    categoryModules = getModulesByCategory('full', adjustedInternalSpace, spaceInfoWithSlotWidths)
      .filter(m =>
        !m.id.includes('built-in-fridge') &&
        !m.id.includes('insert-frame') &&
        !m.id.includes('pull-out-cabinet') &&
        !m.id.includes('pantry-cabinet') &&
        !m.id.includes('fridge-cabinet')
      );
  }

  // 현관장 H 임시 숨김 (신발장 카테고리 제외)
  if (moduleCategory !== 'shoes') {
    categoryModules = categoryModules.filter(m => !m.id.includes('entryway-h'));
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
    // 멍장(더미 가구) 3종 전용 썸네일
    if (moduleId.includes('dummy')) return '/images/furniture-thumbnails/dummy.png';
    const moduleKey = moduleId.replace(/-[\d.]+$/, ''); // 폭 정보 제거
    return moduleKey in FURNITURE_ICONS ? FURNITURE_ICONS[moduleKey] : FURNITURE_ICONS['single-2drawer-hanging'];
  };

  // 가구 유효성 검사 (간단 버전)
  const isModuleValid = (module: ModuleData): boolean => {
    // 듀얼 가구인지 확인
    const isDualModule = module.id.includes('dual-');

    // 듀얼 빌트인 냉장고장: 자유배치/슬롯배치 모두 지원
    if (module.id.includes('dual-built-in-fridge')) {
      const fitsHeightDepth = module.dimensions.height <= zoneInternalSpace.height
        && module.dimensions.depth <= zoneInternalSpace.depth;
      return module.dimensions.width <= zoneInternalSpace.width && fitsHeightDepth;
    }

    // 빌트인 냉장고장(싱글): 빈 공간에 들어갈 수 있는지만 체크
    if (module.id.includes('built-in-fridge')) {
      const fridgeWidth = module.dimensions.width; // 582
      const sameZoneSlot = (m: any) => !m.isFreePlacement &&
        ((m.zone || 'normal') === (activeDroppedCeilingTab === 'dropped' ? 'dropped' : 'normal'));
      const occupied = placedModulesForValid.filter(sameZoneSlot);
      const occupiedWidth = occupied.reduce((s: number, m: any) =>
        s + (m.slotCustomWidth ?? m.customWidth ?? 0), 0);
      const remainingWidth = zoneInternalSpace.width - occupiedWidth;
      const fitsHeightDepth = module.dimensions.height <= zoneInternalSpace.height
        && module.dimensions.depth <= zoneInternalSpace.depth;
      return remainingWidth >= fridgeWidth - 0.01 && fitsHeightDepth;
    }

    // 단내림 활성화 시 영역별 검증
    if (spaceInfo.droppedCeiling?.enabled) {
      const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);

      // 단내림 탭: dropped 영역 검증
      if (activeDroppedCeilingTab === 'dropped') {
        if (zoneInfo.dropped) {
          if (isDualModule && zoneInfo.dropped.columnCount < 2) {
            return false;
          }
          return module.dimensions.height <= zoneInternalSpace.height &&
            module.dimensions.depth <= zoneInternalSpace.depth;
        }
      } else {
        // 메인 탭: normal 영역 검증
        if (isDualModule && zoneInfo.normal.columnCount < 2) {
          return false;
        }
        return module.dimensions.height <= zoneInternalSpace.height &&
          module.dimensions.depth <= zoneInternalSpace.depth;
      }
    }

    // 단내림 없음: 일반 검증
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
              {moduleCategory === 'shoes'
                ? `신발장 ${t('furniture.moduleNotReady')}`
                : moduleCategory === 'upper'
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