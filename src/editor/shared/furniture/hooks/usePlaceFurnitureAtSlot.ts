/**
 * 공통 가구 배치 로직
 * 클릭+고스트, 드래그앤드랍, 더블클릭 모두 이 함수를 사용
 */

import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { PlacedModule, CustomFurnitureConfig } from '@/editor/shared/furniture/types';
import { getModuleById, ModuleData } from '@/data/modules';
import { calculateSpaceIndexing, recalculateWithCustomWidths } from '@/editor/shared/utils/indexing';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { analyzeColumnSlots, calculateFurnitureBounds } from '@/editor/shared/utils/columnSlotProcessor';
import { isCustomizableModuleId, createDefaultCustomConfig } from '@/editor/shared/controls/furniture/CustomizableFurnitureLibrary';
import { useMyCabinetStore, PendingPlacement } from '@/store/core/myCabinetStore';
import { v4 as uuidv4 } from 'uuid';

export interface PlaceFurnitureParams {
  moduleId: string;           // 배치할 가구 ID (예: 'single-2drawer-hanging-450')
  slotIndex: number;          // 슬롯 인덱스
  zone?: 'normal' | 'dropped'; // 단내림 구역
  spaceInfo: SpaceInfo;       // 공간 정보
  moduleData?: ModuleData;    // 미리 조회한 모듈 데이터 (없으면 내부에서 조회)
  pendingPlacement?: PendingPlacement | null; // My캐비넷 배치 데이터
}

export interface PlaceFurnitureResult {
  success: boolean;
  module?: PlacedModule;
  error?: string;
}

/**
 * 슬롯에 가구를 배치하기 위한 모든 계산을 수행
 * 클릭+고스트 방식의 로직을 기준으로 함
 */
export function placeFurnitureAtSlot(params: PlaceFurnitureParams): PlaceFurnitureResult {
  const { moduleId, slotIndex, zone, spaceInfo } = params;

  const baseIndexing = calculateSpaceIndexing(spaceInfo);
  const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled || false;

  // 빌트인 냉장고장: 자기 자신을 미리 가상 모듈로 추가해 indexing 재계산
  //   → 새 슬롯 중심(600)에 배치되어 슬롯 경계 벗어남 방지
  const BUILT_IN_FRIDGE_FIXED_WIDTH = 600;
  const isBuiltInFridgeForIndex = moduleId.includes('built-in-fridge');

  // slotCustomWidth가 있는 기존 모듈이 있으면 재분할된 indexing 사용
  const existingModules = useFurnitureStore.getState().placedModules;
  const virtualModulesForIndex = isBuiltInFridgeForIndex
    ? [
        ...existingModules,
        // 가상 모듈: 이번에 배치할 빌트인 냉장고장
        {
          id: '__virtual_fridge__',
          moduleId,
          slotIndex,
          slotCustomWidth: BUILT_IN_FRIDGE_FIXED_WIDTH,
          isDualSlot: false,
          zone: zone || 'normal',
        } as any,
      ]
    : existingModules;
  const hasCustomWidthModules = virtualModulesForIndex.some(m => m.slotCustomWidth !== undefined);
  const indexing = hasCustomWidthModules
    ? recalculateWithCustomWidths(baseIndexing, virtualModulesForIndex, zone || 'normal')
    : baseIndexing;

  // zone별 spaceInfo 생성
  let zoneSpaceInfo = spaceInfo;
  let zoneInternalSpace = calculateInternalSpace(spaceInfo);

  if (hasDroppedCeiling && zone && indexing.zones) {
    const droppedCeilingWidth = spaceInfo.droppedCeiling?.width || (spaceInfo.layoutMode === 'free-placement' ? 150 : 900);

    if (zone === 'dropped') {
      zoneSpaceInfo = {
        ...spaceInfo,
        width: droppedCeilingWidth,
        height: spaceInfo.height,
        zone: 'dropped' as const
      };
    } else {
      zoneSpaceInfo = {
        ...spaceInfo,
        width: spaceInfo.width - droppedCeilingWidth,
        zone: 'normal' as const
      };
    }

    zoneInternalSpace = calculateInternalSpace(zoneSpaceInfo);
  }

  // 듀얼 가구 여부 확인 (ID 기반)
  const isDualFurnitureId = moduleId.startsWith('dual-');

  // zone별 columnWidth 결정
  // recalculateWithCustomWidths() 적용 시 top-level columnWidth가 재계산되므로 우선 사용
  let columnWidth: number;
  if (hasCustomWidthModules) {
    columnWidth = indexing.columnWidth;
  } else if (hasDroppedCeiling && zone && indexing.zones) {
    columnWidth = zone === 'dropped' && indexing.zones.dropped
      ? indexing.zones.dropped.columnWidth
      : indexing.zones.normal.columnWidth;
  } else {
    columnWidth = indexing.columnWidth;
  }

  // 듀얼 가구의 실제 너비: zone이 있으면 해당 zone의 slotWidths 사용
  // 단, slotWidths는 Math.floor로 내림되어 있어 합산 시 내부 폭보다 -1~-N mm 손실 가능.
  // 해결: zone의 실제 내부 폭(width)을 기준으로 2슬롯 비율만큼 사용 → floor 손실 방지.
  const getActualDualWidth = (): number => {
    // 단내림 + zone 지정 시 해당 zone 기준 (★ top-level slotWidths는 전체 공간 인덱스이므로 사용 금지)
    if (hasDroppedCeiling && zone && indexing.zones) {
      const zoneData = zone === 'dropped' ? indexing.zones.dropped : indexing.zones.normal;
      const zoneSlotWidths = zoneData?.slotWidths;
      if (zoneSlotWidths && slotIndex < zoneSlotWidths.length - 1) {
        return zoneSlotWidths[slotIndex] + zoneSlotWidths[slotIndex + 1];
      }

      // 폴백: 균등 분할
      const zoneColumnCount = zoneData?.columnCount ?? 0;
      const zoneInternalWidth = zoneData?.width ?? 0;
      if (zoneColumnCount >= 2 && zoneInternalWidth > 0) {
        if (zoneColumnCount === 2) {
          return Math.floor(zoneInternalWidth);
        }
        return Math.floor((zoneInternalWidth * 2) / zoneColumnCount);
      }
      return columnWidth * 2;
    }
    // 단내림 없음: slotWidths가 재분배된 경우 실제 슬롯 너비 합 사용
    const sw = indexing.slotWidths;
    if (sw && slotIndex < sw.length - 1) {
      return sw[slotIndex] + sw[slotIndex + 1];
    }
    // slotWidths 없을 때 폴백: 균등 분할
    if (indexing.columnCount >= 2 && indexing.internalWidth > 0) {
      if (indexing.columnCount === 2) {
        return Math.floor(indexing.internalWidth);
      }
      return Math.floor((indexing.internalWidth * 2) / indexing.columnCount);
    }
    return columnWidth * 2;
  };

  // 현재 인덱싱 기반으로 정확한 너비 재계산 — 싱글/듀얼 모두
  // moduleId에 포함된 너비가 이전 공간 설정 기준일 수 있으므로 항상 현재 슬롯 너비로 재계산
  const baseId = moduleId.replace(/-[\d.]+$/, '');
  let furnitureId: string;

  if (hasDroppedCeiling && zone && indexing.zones) {
    if (isDualFurnitureId) {
      const dualWidth = getActualDualWidth();
      furnitureId = `${baseId}-${dualWidth}`;
    } else {
      // 싱글 가구: 해당 zone의 slotWidths 기준 (top-level slotWidths는 전체 공간 인덱스이므로 사용 금지)
      const zoneData = zone === 'dropped' ? indexing.zones.dropped : indexing.zones.normal;
      const zoneSlotWidths = zoneData?.slotWidths;
      const singleWidth = zoneSlotWidths && slotIndex < zoneSlotWidths.length
        ? zoneSlotWidths[slotIndex]
        : columnWidth;
      furnitureId = `${baseId}-${singleWidth}`;
    }
  } else {
    // 일반 (단내림 없음): 현재 인덱싱의 슬롯 너비로 재계산
    if (isDualFurnitureId) {
      const dualWidth = getActualDualWidth();
      furnitureId = `${baseId}-${dualWidth}`;
    } else {
      const currentSlotWidth = indexing.slotWidths && slotIndex < indexing.slotWidths.length
        ? indexing.slotWidths[slotIndex]
        : columnWidth;
      furnitureId = `${baseId}-${currentSlotWidth}`;
    }
  }

  // 모듈 데이터 조회 (커스터마이징 가구는 getModuleById로 찾을 수 없으므로 pendingPlacement에서 합성)
  // ★ params.moduleData가 전달되더라도 현재 너비와 다르면 무시하고 재조회
  const isCustomizableModule = isCustomizableModuleId(moduleId);
  let moduleData: ModuleData | undefined;

  if (params.moduleData) {
    // 전달된 moduleData의 너비가 현재 계산된 너비와 일치하는지 확인
    // 단내림+zone 지정 시 zone의 slotWidths 사용 (top-level은 전체 공간 인덱스)
    const expectedSingleWidth = (() => {
      if (hasDroppedCeiling && zone && indexing.zones) {
        const zoneData = zone === 'dropped' ? indexing.zones.dropped : indexing.zones.normal;
        const zoneSw = zoneData?.slotWidths;
        if (zoneSw && slotIndex < zoneSw.length) return zoneSw[slotIndex];
        return columnWidth;
      }
      return indexing.slotWidths && slotIndex < indexing.slotWidths.length
        ? indexing.slotWidths[slotIndex]
        : columnWidth;
    })();
    const expectedWidth = isDualFurnitureId ? getActualDualWidth() : expectedSingleWidth;
    if (Math.abs(params.moduleData.dimensions.width - expectedWidth) < 2) {
      moduleData = params.moduleData;
    } else {
      // 너비 불일치 — 현재 인덱싱 기반으로 재조회
      moduleData = getModuleById(furnitureId, zoneInternalSpace, zoneSpaceInfo);
    }
  } else {
    moduleData = getModuleById(furnitureId, zoneInternalSpace, zoneSpaceInfo);
  }

  if (!moduleData && isCustomizableModule && params.pendingPlacement) {
    const pp = params.pendingPlacement;
    const isMyCabinetDual = pp.width > columnWidth * 1.5;
    const slotWidth = isMyCabinetDual ? columnWidth * 2 : columnWidth;
    moduleData = {
      id: moduleId,
      name: '커스텀 캐비넷',
      category: pp.category,
      dimensions: {
        width: slotWidth,
        height: pp.height,
        depth: pp.depth,
      },
      color: '#C8B69E',
      hasDoor: false,
      isDynamic: false,
      modelConfig: { basicThickness: spaceInfo.panelThickness ?? 18 },
    } as ModuleData;
  }

  if (!moduleData) {
    return { success: false, error: `가구 데이터를 찾을 수 없습니다: ${moduleId}` };
  }

  // 듀얼 판별: ID 기반 우선, 또는 가구 너비가 단일 슬롯의 1.5배 초과인지 확인
  const isDualFurniture = isDualFurnitureId || (moduleData.dimensions.width > columnWidth * 1.5);

  // 슬롯 위치 계산
  let allSlotPositions: Array<{ position: number; zone: 'normal' | 'dropped'; index: number }> = [];

  if (!hasDroppedCeiling || !indexing.zones) {
    allSlotPositions = indexing.threeUnitPositions.map((pos, idx) => ({
      position: pos,
      zone: 'normal' as const,
      index: idx
    }));
  } else {
    if (indexing.zones.normal?.threeUnitPositions) {
      allSlotPositions.push(...indexing.zones.normal.threeUnitPositions.map((pos, idx) => ({
        position: pos,
        zone: 'normal' as const,
        index: idx
      })));
    }

    if (indexing.zones.dropped?.threeUnitPositions) {
      allSlotPositions.push(...indexing.zones.dropped.threeUnitPositions.map((pos, idx) => ({
        position: pos,
        zone: 'dropped' as const,
        index: idx
      })));
    }

    allSlotPositions.sort((a, b) => a.position - b.position);
  }

  // 타겟 슬롯 찾기
  const targetSlot = allSlotPositions.find(slot =>
    slot.index === slotIndex && (!zone || slot.zone === zone)
  );

  if (!targetSlot) {
    return { success: false, error: `슬롯을 찾을 수 없습니다: slotIndex=${slotIndex}, zone=${zone}` };
  }

  // 빌트인 냉장고장: 가상 모듈 추가된 indexing의 threeUnitPositions가 600 슬롯 중심을 갖도록
  // recalculateWithCustomWidths를 거쳤지만, allSlotPositions은 그 결과를 사용하지 않을 수 있어
  // targetSlot.position을 indexing.threeUnitPositions[slotIndex]로 직접 덮어쓰기
  if (moduleId.includes('built-in-fridge')
      && indexing.threeUnitPositions
      && indexing.threeUnitPositions[slotIndex] !== undefined) {
    targetSlot.position = indexing.threeUnitPositions[slotIndex];
  }

  // X 위치 계산
  let xPosition: number;
  if (isDualFurniture) {
    const nextSlot = allSlotPositions.find(slot =>
      slot.index === slotIndex + 1 && slot.zone === targetSlot.zone
    );

    if (!nextSlot) {
      return { success: false, error: '듀얼 가구 배치 불가: 다음 슬롯을 찾을 수 없습니다' };
    }

    if (hasDroppedCeiling && nextSlot.zone !== targetSlot.zone) {
      return { success: false, error: '듀얼 가구 배치 불가: 단내림 경계를 침범합니다' };
    }

    xPosition = (targetSlot.position + nextSlot.position) / 2;
  } else {
    xPosition = targetSlot.position;
  }

  // Y 위치 계산
  const isUpperCabinet = moduleData.category === 'upper';
  const isLowerCabinet = moduleData.category === 'lower';
  const isTallCabinet = moduleData.category === 'full';

  let yPosition: number;
  const floorFinishHeightMm = spaceInfo.hasFloorFinish && spaceInfo.floorFinish
    ? spaceInfo.floorFinish.height
    : 0;
  const floorFinishHeight = floorFinishHeightMm * 0.01;

  if (isUpperCabinet) {
    const topFrameHeightMm = spaceInfo.frameSize?.top || 30;
    const internalHeight = spaceInfo.height - topFrameHeightMm - floorFinishHeightMm;
    const upperCabinetHeight = moduleData.dimensions.height;
    yPosition = (floorFinishHeightMm + internalHeight - upperCabinetHeight / 2) * 0.01;
  } else if (isLowerCabinet || isTallCabinet) {
    const isFloatPlacement = spaceInfo.baseConfig?.type === 'stand' &&
                            spaceInfo.baseConfig?.placementType === 'float';

    if (isFloatPlacement) {
      const floatHeightMm = spaceInfo.baseConfig?.floatHeight || 0;
      const floatHeight = floatHeightMm * 0.01;
      const furnitureHeight = moduleData.dimensions.height * 0.01;
      yPosition = floorFinishHeight + floatHeight + (furnitureHeight / 2);
    } else {
      const baseHeightMm = spaceInfo.baseConfig?.type === 'stand'
        ? 0
        : (spaceInfo.baseConfig?.height || 65);
      const baseHeight = baseHeightMm * 0.01;
      const furnitureHeight = moduleData.dimensions.height * 0.01;
      yPosition = floorFinishHeight + baseHeight + (furnitureHeight / 2);
    }
  } else {
    yPosition = 5;
  }

  // customWidth 계산 (slotWidths 기반)
  let customWidth: number | undefined;
  let adjustedWidth: number | undefined;
  let customDepth: number | undefined;

  let targetIndexing: {
    columnCount: number;
    columnWidth: number;
    slotWidths?: number[];
  };

  // 단내림+zone 지정 시 zone 데이터 최우선 (top-level slotWidths는 전체 공간 인덱스)
  if (hasDroppedCeiling && zone === 'dropped' && indexing.zones?.dropped) {
    targetIndexing = indexing.zones.dropped;
  } else if (hasDroppedCeiling && zone === 'normal' && indexing.zones?.normal) {
    targetIndexing = indexing.zones.normal;
  } else {
    targetIndexing = indexing;
  }

  if (targetIndexing.slotWidths && targetIndexing.slotWidths[slotIndex] !== undefined) {
    if (isDualFurniture && slotIndex < targetIndexing.slotWidths.length - 1) {
      // 듀얼: getActualDualWidth()와 일치시켜 floor 손실 방지
      customWidth = getActualDualWidth();
    } else {
      // 싱글: slotWidths에서 0.5mm 단위 내림된 값 사용
      customWidth = targetIndexing.slotWidths[slotIndex];
    }
  }
  // 기둥 체크 및 크기 조정
  const columnSlots = analyzeColumnSlots(spaceInfo);

  // globalSlotIndex 계산
  let globalSlotIndex = slotIndex;
  if (hasDroppedCeiling && zone && indexing.zones) {
    if (zone === 'dropped' && indexing.zones.normal) {
      globalSlotIndex = indexing.zones.normal.columnCount + slotIndex;
    }
  }

  const targetSlotInfo = columnSlots[globalSlotIndex];

  if (targetSlotInfo && targetSlotInfo.hasColumn && targetSlotInfo.column) {
    const slotWidthM = columnWidth * 0.01;
    const originalSlotBounds = {
      left: xPosition - slotWidthM / 2,
      right: xPosition + slotWidthM / 2,
      center: xPosition
    };

    const furnitureBounds = calculateFurnitureBounds(targetSlotInfo, originalSlotBounds, spaceInfo);
    adjustedWidth = furnitureBounds.renderWidth;
    customWidth = undefined; // 기둥 슬롯에서는 customWidth 사용 안 함
    xPosition = furnitureBounds.center;

    const columnDepth = targetSlotInfo.column.depth;
    if (columnDepth === 300 && furnitureBounds.renderWidth === columnWidth) {
      customDepth = 730 - columnDepth; // 430mm
    }
  }

  // 커스터마이징 가구 처리 (My캐비넷 or 일반 커스텀 가구)
  let customConfig: CustomFurnitureConfig | undefined;
  let isCustomizable: boolean | undefined;
  let moduleWidth: number | undefined;

  if (isCustomizableModuleId(moduleId)) {
    const pp = params.pendingPlacement;
    const isMyCabinet = !!(pp?.customConfig);

    if (isMyCabinet) {
      // My캐비넷: 저장된 customConfig를 복사하여 사용
      customConfig = JSON.parse(JSON.stringify(pp.customConfig));
      isCustomizable = false; // My캐비넷은 편집 불가 상태로 배치
    } else {
      // 일반 커스텀 가구: 기본 customConfig 생성
      const topFrameMm = spaceInfo.frameSize?.top || 30;
      const bottomFrameMm = 0;
      const floorFinishMm = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? spaceInfo.floorFinish.height : 0;
      const baseHeightMm = spaceInfo.baseConfig?.type === 'stand' ? 0 : (spaceInfo.baseConfig?.height || 65);
      const availableHeight = spaceInfo.height - topFrameMm - bottomFrameMm - floorFinishMm - baseHeightMm;
      const ptMm = spaceInfo.panelThickness ?? 18;
      customConfig = createDefaultCustomConfig(availableHeight - ptMm * 2);
      isCustomizable = true;
    }

    // 슬롯 너비를 moduleWidth로 저장
    moduleWidth = customWidth || adjustedWidth || columnWidth;
  }

  // 새 가구 모듈 생성
  // baseId는 이미 위에서 계산됨 (moduleId.replace(/-[\d.]+$/, ''))
  // 서랍 모듈은 하부 섹션 상판 85mm 들여쓰기 기본값 적용
  const defaultLowerTopOffset = (furnitureId.includes('2drawer') || furnitureId.includes('4drawer')) ? 85 : undefined;
  // 단내림 구간 가구 높이 계산: 공간높이 - 단내림높이 - 프레임 - 받침대
  let droppedCustomHeight: number | undefined;
  if (hasDroppedCeiling && zone === 'dropped' && spaceInfo.droppedCeiling?.dropHeight) {
    const dropH = spaceInfo.droppedCeiling.dropHeight;
    const frameTop = spaceInfo.frameSize?.top || 0;
    const baseH = spaceInfo.baseConfig?.height || 0;
    droppedCustomHeight = spaceInfo.height - dropH - frameTop - baseH;
  }

  console.log('📦 [배치결과]', {
    입력moduleId: moduleId,
    baseId,
    furnitureId,
    customWidth,
    isDualFurniture,
    spaceWidth: spaceInfo.width,
    internalWidth: indexing.internalWidth,
    columnCount: indexing.columnCount,
    columnWidth: indexing.columnWidth,
    slotWidths: indexing.slotWidths,
    slotIndex,
    actualDualWidth: isDualFurnitureId ? getActualDualWidth() : 'N/A(싱글)',
    hasCustomWidthModules,
    moduleDataWidth: moduleData?.dimensions.width,
  });

  // 단내림 디버깅
  if (zone === 'dropped') {
    console.log('🟠 [단내림 배치]', {
      zone,
      droppedCustomHeight,
      'moduleData.height': moduleData?.dimensions.height,
      'moduleData.width': moduleData?.dimensions.width,
      'zoneInternalSpace.height': zoneInternalSpace.height,
      'zoneInternalSpace.width': zoneInternalSpace.width,
      'spaceInfo.height': spaceInfo.height,
      'dropHeight': spaceInfo.droppedCeiling?.dropHeight,
      yPosition,
    });
  }

  // 카테고리별 기본 깊이 (상부장 300 먼저, 신발장 380)
  if (customDepth === undefined) {
    const isUpperCabinet = furnitureId.includes('upper-cabinet');
    const isShoeCabinet = !isUpperCabinet && (
      furnitureId.includes('-entryway-') ||
      furnitureId.includes('-shelf-') ||
      furnitureId.includes('-4drawer-shelf-') ||
      furnitureId.includes('-2drawer-shelf-')
    );
    if (isUpperCabinet) {
      customDepth = Math.min(300, spaceInfo.depth);
    } else if (isShoeCabinet) {
      customDepth = Math.min(380, spaceInfo.depth);
    }
  }

  // 빌트인 냉장고장: 슬롯 너비와 무관하게 600 고정 + slotCustomWidth로 슬롯 재분배 트리거
  // (BUILT_IN_FRIDGE_FIXED_WIDTH는 함수 상단에서 이미 선언됨)
  // adjustedWidth는 기둥 침범 케이스 전용(FurnitureItem이 그걸로 위치 보정함)이므로 빌트인 냉장고장에는 박지 않음
  const isBuiltInFridge = (moduleId.includes('built-in-fridge')) || (furnitureId.includes('built-in-fridge'));
  const finalCustomWidth = isBuiltInFridge ? BUILT_IN_FRIDGE_FIXED_WIDTH : customWidth;
  const finalAdjustedWidth = isBuiltInFridge ? undefined : adjustedWidth;

  const newModule: PlacedModule = {
    id: uuidv4(),
    moduleId: furnitureId,
    baseModuleType: baseId,
    position: {
      x: xPosition,
      y: yPosition,
      z: 0
    },
    rotation: 0,
    slotIndex: slotIndex,
    isDualSlot: isDualFurniture,
    customHeight: droppedCustomHeight,
    customDepth: customDepth,
    customWidth: finalCustomWidth,
    adjustedWidth: finalAdjustedWidth,
    // 빌트인 냉장고장: slotCustomWidth로 슬롯 자동 재분배 트리거
    ...(isBuiltInFridge ? { slotCustomWidth: BUILT_IN_FRIDGE_FIXED_WIDTH } : {}),
    lowerSectionDepth: undefined,
    upperSectionDepth: undefined,
    lowerSectionTopOffset: defaultLowerTopOffset,
    // 서라운드 + 상부장은 상부 프레임 옵셋 기본 23mm
    ...((moduleData.category === 'upper' && spaceInfo.surroundType === 'surround')
         ? { topFrameOffset: 23 } : {}),
    zone: targetSlot.zone,
    ...(customConfig !== undefined && { customConfig }),
    ...(isCustomizable !== undefined && { isCustomizable }),
    ...(moduleWidth !== undefined && { moduleWidth }),
  };

  // My캐비넷 배치 데이터 초기화
  if (params.pendingPlacement) {
    useMyCabinetStore.getState().setPendingPlacement(null);
  }

  // 빌트인 냉장고장: spaceInfo.customSlotWidths를 직접 갱신해
  //   ColumnGuides/SlotPlacementIndicators/FurnitureItem 등 모든 인덱싱이
  //   새 슬롯 너비를 즉시 사용하도록 보장
  //   추가로 newModule의 xPosition도 새 슬롯 중심으로 강제 보정
  if (isBuiltInFridge && !hasDroppedCeiling) {
    try {
      const { useSpaceConfigStore } = require('@/store/core/spaceConfigStore');
      const currentSpaceInfo = useSpaceConfigStore.getState().spaceInfo;
      // 모든 가구의 slotCustomWidth 수집 (이번에 추가될 빌트인 냉장고장 포함)
      const allModulesWithFridge = [
        ...useFurnitureStore.getState().placedModules,
        newModule,
      ];
      // baseIndexing 다시 계산 후 가상 재분배 적용 → 실제 슬롯 너비 배열
      const baseIdx = calculateSpaceIndexing(currentSpaceInfo);
      const recalcResult = recalculateWithCustomWidths(baseIdx, allModulesWithFridge, 'normal');
      if (recalcResult.slotWidths && recalcResult.slotWidths.length === baseIdx.columnCount) {
        useSpaceConfigStore.getState().setSpaceInfo({
          customSlotWidths: recalcResult.slotWidths,
        });
        // newModule.position.x를 재분배된 새 슬롯 중심으로 강제 보정
        if (recalcResult.threeUnitPositions && recalcResult.threeUnitPositions[slotIndex] !== undefined) {
          newModule.position = {
            ...newModule.position,
            x: recalcResult.threeUnitPositions[slotIndex],
          };
        }
      }
    } catch (e) {
      console.warn('[빌트인 냉장고장] spaceInfo.customSlotWidths 갱신 실패', e);
    }
  }

  return { success: true, module: newModule };
}

/**
 * 기본 가구 깊이 계산
 */
export function getDefaultFurnitureDepth(spaceInfo: SpaceInfo, moduleData?: ModuleData): number {
  const mid = moduleData?.id || '';
  // 상부장: 300mm (먼저 검사)
  const isUpperCabinet = mid.includes('upper-cabinet');
  if (isUpperCabinet) {
    return Math.min(300, spaceInfo.depth);
  }
  // 신발장: 380mm
  const isShoeCabinet = mid.includes('-entryway-') || mid.includes('-shelf-') || mid.includes('-4drawer-shelf-') || mid.includes('-2drawer-shelf-');
  if (isShoeCabinet) {
    return Math.min(380, spaceInfo.depth);
  }
  if (moduleData?.defaultDepth) {
    return Math.min(moduleData.defaultDepth, spaceInfo.depth);
  }
  const spaceBasedDepth = Math.floor(spaceInfo.depth * 0.9);
  return Math.min(spaceBasedDepth, 580);
}
