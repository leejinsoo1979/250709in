/**
 * 공통 가구 배치 로직
 * 클릭+고스트, 드래그앤드랍, 더블클릭 모두 이 함수를 사용
 */

import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { PlacedModule } from '@/store/core/furnitureStore';
import { getModuleById, ModuleData } from '@/data/modules';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import { analyzeColumnSlots, calculateFurnitureBounds } from '@/editor/shared/utils/columnSlotProcessor';
import { v4 as uuidv4 } from 'uuid';

export interface PlaceFurnitureParams {
  moduleId: string;           // 배치할 가구 ID (예: 'single-2drawer-hanging-450')
  slotIndex: number;          // 슬롯 인덱스
  zone?: 'normal' | 'dropped'; // 단내림 구역
  spaceInfo: SpaceInfo;       // 공간 정보
  moduleData?: ModuleData;    // 미리 조회한 모듈 데이터 (없으면 내부에서 조회)
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

  console.log('🎯 [placeFurnitureAtSlot] 호출:', { moduleId, slotIndex, zone });

  const indexing = calculateSpaceIndexing(spaceInfo);
  const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled || false;

  // zone별 spaceInfo 생성
  let zoneSpaceInfo = spaceInfo;
  let zoneInternalSpace = calculateInternalSpace(spaceInfo);

  if (hasDroppedCeiling && zone && indexing.zones) {
    const droppedCeilingWidth = spaceInfo.droppedCeiling?.width || 900;

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

  // zone별 columnWidth로 정확한 너비 계산
  let furnitureId = moduleId;
  if (hasDroppedCeiling && zone && indexing.zones && isDualFurnitureId) {
    const zoneColumnWidth = zone === 'dropped' && indexing.zones.dropped
      ? indexing.zones.dropped.columnWidth
      : indexing.zones.normal.columnWidth;

    const dualWidth = zoneColumnWidth * 2;
    const baseId = moduleId.replace(/-[\d.]+$/, '');
    furnitureId = `${baseId}-${dualWidth}`;
  }

  // 모듈 데이터 조회
  const moduleData = params.moduleData || getModuleById(furnitureId, zoneInternalSpace, zoneSpaceInfo);

  if (!moduleData) {
    return { success: false, error: `가구 데이터를 찾을 수 없습니다: ${moduleId}` };
  }

  // zone별 columnWidth 결정
  let columnWidth: number;
  if (hasDroppedCeiling && zone && indexing.zones) {
    columnWidth = zone === 'dropped' && indexing.zones.dropped
      ? indexing.zones.dropped.columnWidth
      : indexing.zones.normal.columnWidth;
  } else {
    columnWidth = indexing.columnWidth;
  }

  const isDualFurniture = Math.abs(moduleData.dimensions.width - (columnWidth * 2)) < 50;

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
    const topFrameHeightMm = spaceInfo.frameSize?.top || 10;
    const bottomFrameHeightMm = spaceInfo.frameSize?.bottom || 0;
    const internalHeight = spaceInfo.height - topFrameHeightMm - bottomFrameHeightMm - floorFinishHeightMm;
    const upperCabinetHeight = moduleData.dimensions.height;
    yPosition = (floorFinishHeightMm + bottomFrameHeightMm + internalHeight - upperCabinetHeight / 2) * 0.01;
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

  if (hasDroppedCeiling && zone === 'dropped' && indexing.zones?.dropped) {
    targetIndexing = indexing.zones.dropped;
  } else if (hasDroppedCeiling && zone === 'normal' && indexing.zones?.normal) {
    targetIndexing = indexing.zones.normal;
  } else {
    targetIndexing = indexing;
  }

  if (targetIndexing.slotWidths && targetIndexing.slotWidths[slotIndex] !== undefined) {
    if (isDualFurniture && slotIndex < targetIndexing.slotWidths.length - 1) {
      const slot1Width = targetIndexing.slotWidths[slotIndex];
      const slot2Width = targetIndexing.slotWidths[slotIndex + 1];
      customWidth = slot1Width + slot2Width;
    } else {
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

  // 새 가구 모듈 생성
  const baseType = moduleId.replace(/-[\d.]+$/, '');
  const newModule: PlacedModule = {
    id: uuidv4(),
    moduleId: moduleId,
    baseModuleType: baseType,
    position: {
      x: xPosition,
      y: yPosition,
      z: 0
    },
    rotation: 0,
    slotIndex: slotIndex,
    isDualSlot: isDualFurniture,
    customHeight: undefined,
    customDepth: customDepth,
    customWidth: customWidth,
    adjustedWidth: adjustedWidth,
    lowerSectionDepth: undefined,
    upperSectionDepth: undefined,
    customSections: undefined,
    isLocked: false,
    zone: targetSlot.zone
  };

  console.log('✅ [placeFurnitureAtSlot] 가구 배치 완료:', {
    slotIndex,
    zone: targetSlot.zone,
    position: newModule.position,
    isDual: isDualFurniture,
    customWidth: newModule.customWidth,
    adjustedWidth: newModule.adjustedWidth
  });

  return { success: true, module: newModule };
}

/**
 * 기본 가구 깊이 계산
 */
export function getDefaultFurnitureDepth(spaceInfo: SpaceInfo, moduleData?: ModuleData): number {
  if (moduleData?.defaultDepth) {
    return Math.min(moduleData.defaultDepth, spaceInfo.depth);
  }
  const spaceBasedDepth = Math.floor(spaceInfo.depth * 0.9);
  return Math.min(spaceBasedDepth, 580);
}
