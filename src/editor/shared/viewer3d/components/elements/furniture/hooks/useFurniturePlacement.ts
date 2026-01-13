import { useCallback } from 'react';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { getModuleById, ModuleData } from '@/data/modules';
import { useCustomFurnitureStore } from '@/store/core/customFurnitureStore';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { calculateInternalSpace } from '../../../../utils/geometry';
import { analyzeColumnSlots, calculateFurnitureBounds } from '@/editor/shared/utils/columnSlotProcessor';
import { v4 as uuidv4 } from 'uuid';

// 커스텀 가구 ID인지 확인하는 함수
const isCustomFurnitureId = (moduleId: string): boolean => {
  return moduleId.startsWith('custom-');
};

/**
 * 클릭 배치 방식으로 가구를 배치하는 훅
 */
export const useFurniturePlacement = () => {
  const { spaceInfo } = useSpaceConfigStore();
  const { selectedFurnitureId, addModule, setSelectedFurnitureId, setFurniturePlacementMode } = useFurnitureStore();
  const { getCustomFurnitureById } = useCustomFurnitureStore();

  const placeFurniture = useCallback((slotIndex: number, zone?: 'normal' | 'dropped') => {
    console.log('🎯🎯🎯 [useFurniturePlacement] placeFurniture 호출됨!!!!', { slotIndex, zone, selectedFurnitureId });

    if (!selectedFurnitureId) {
      console.error('❌❌❌ 선택된 가구가 없습니다:', selectedFurnitureId);
      return;
    }

    console.log('✅ selectedFurnitureId 체크 통과:', selectedFurnitureId);

    const indexing = calculateSpaceIndexing(spaceInfo);
    const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled || false;

    console.log('🟢 [useFurniturePlacement] indexing:', {
      hasDroppedCeiling,
      zones: indexing.zones,
      columnWidth: indexing.columnWidth,
      threeUnitPositions: indexing.threeUnitPositions
    });

    // zone별 spaceInfo 생성 (고스트 프리뷰와 동일)
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

      console.log('🟢 [useFurniturePlacement] zone별 spaceInfo:', {
        zone,
        outerWidth: zoneSpaceInfo.width,
        internalWidth: zoneInternalSpace.width
      });
    }

    // 듀얼 가구 여부를 먼저 확인 - ID 기반 판단 (dual- prefix)
    const isDualFurnitureId = selectedFurnitureId.startsWith('dual-');

    // zone이 있고 듀얼 가구일 때는 zone별 columnWidth로 정확한 너비 계산
    let furnitureId = selectedFurnitureId;
    if (hasDroppedCeiling && zone && indexing.zones && isDualFurnitureId) {
      const zoneColumnWidth = zone === 'dropped' && indexing.zones.dropped
        ? indexing.zones.dropped.columnWidth
        : indexing.zones.normal.columnWidth;

      const dualWidth = zoneColumnWidth * 2;
      const baseId = selectedFurnitureId.replace(/-[\d.]+$/, '');
      furnitureId = `${baseId}-${dualWidth}`;

      console.log('🟢 [useFurniturePlacement] 듀얼 가구 zone별 ID 생성:', {
        originalId: selectedFurnitureId,
        zone,
        zoneColumnWidth,
        dualWidth,
        newId: furnitureId
      });
    }

    // 커스텀 가구 처리
    let moduleData: ModuleData | null = null;

    if (isCustomFurnitureId(selectedFurnitureId)) {
      // 커스텀 가구: customFurnitureStore에서 데이터 변환
      const actualId = selectedFurnitureId.replace(/^custom-/, '');
      const customFurniture = getCustomFurnitureById(actualId);

      if (customFurniture) {
        moduleData = {
          id: selectedFurnitureId,
          name: customFurniture.name,
          category: customFurniture.category as 'full' | 'upper' | 'lower',
          dimensions: {
            width: customFurniture.originalDimensions.width,
            height: customFurniture.originalDimensions.height,
            depth: customFurniture.originalDimensions.depth,
          },
          color: '#8B7355',
          description: `커스텀 가구: ${customFurniture.name}`,
          hasDoor: false,
          isDynamic: false,
          type: 'box',
          defaultDepth: customFurniture.originalDimensions.depth,
        };

        console.log('📦 [useFurniturePlacement] 커스텀 가구 ModuleData 생성:', {
          moduleId: selectedFurnitureId,
          dimensions: moduleData.dimensions,
          category: moduleData.category
        });
      }
    } else {
      // 일반 가구: getModuleById 사용
      moduleData = getModuleById(furnitureId, zoneInternalSpace, zoneSpaceInfo);
    }

    if (!moduleData) {
      console.error('❌ 가구 데이터를 찾을 수 없습니다:', selectedFurnitureId);
      return;
    }

    console.log('🟢 [useFurniturePlacement] moduleData:', {
      id: moduleData.id,
      dimensions: moduleData.dimensions,
      category: moduleData.category
    });

    // 듀얼 가구 여부 확인 - zone별 모듈이므로 해당 zone의 columnWidth 사용
    let columnWidth;
    if (hasDroppedCeiling && zone && indexing.zones) {
      columnWidth = zone === 'dropped' && indexing.zones.dropped
        ? indexing.zones.dropped.columnWidth
        : indexing.zones.normal.columnWidth;
    } else {
      columnWidth = indexing.columnWidth;
    }

    const isDualFurniture = Math.abs(moduleData.dimensions.width - (columnWidth * 2)) < 50;
    console.log('🟢 [useFurniturePlacement] 듀얼 가구 판단:', { zone, columnWidth, furnitureWidth: moduleData.dimensions.width, isDualFurniture });

    // 단내림이 있는 경우 영역별 슬롯 위치 계산
    let allSlotPositions: Array<{ position: number; zone: 'normal' | 'dropped'; index: number }> = [];

    if (!hasDroppedCeiling || !indexing.zones) {
      // 단내림이 없으면 기본 위치 사용
      allSlotPositions = indexing.threeUnitPositions.map((pos, idx) => ({
        position: pos,
        zone: 'normal' as const,
        index: idx
      }));
    } else {
      // normal 영역
      if (indexing.zones.normal?.threeUnitPositions) {
        allSlotPositions.push(...indexing.zones.normal.threeUnitPositions.map((pos, idx) => ({
          position: pos,
          zone: 'normal' as const,
          index: idx
        })));
      }

      // dropped 영역
      if (indexing.zones.dropped?.threeUnitPositions) {
        allSlotPositions.push(...indexing.zones.dropped.threeUnitPositions.map((pos, idx) => ({
          position: pos,
          zone: 'dropped' as const,
          index: idx
        })));
      }

      allSlotPositions.sort((a, b) => a.position - b.position);
    }

    // 위치 계산 - slotIndex와 zone에 해당하는 슬롯 찾기
    console.log('🟢 [useFurniturePlacement] 슬롯 찾기:', { allSlotPositions, slotIndex, zone });
    const targetSlot = allSlotPositions.find(slot =>
      slot.index === slotIndex && (!zone || slot.zone === zone)
    );
    console.log('🟢 [useFurniturePlacement] 찾은 슬롯:', targetSlot);
    if (!targetSlot) {
      console.error('❌ 슬롯을 찾을 수 없습니다:', { slotIndex, zone, allSlotPositions });
      return;
    }

    let xPosition: number;
    if (isDualFurniture) {
      // 듀얼 가구: 현재 슬롯과 다음 슬롯의 중심
      // 같은 zone의 다음 인덱스 슬롯 찾기
      const nextSlot = allSlotPositions.find(slot =>
        slot.index === slotIndex + 1 && slot.zone === targetSlot.zone
      );
      if (!nextSlot) {
        console.error('❌ 듀얼 가구 배치 불가: 다음 슬롯을 찾을 수 없습니다');
        console.error('듀얼 가구는 같은 zone 내에서 연속된 두 슬롯이 필요합니다:', {
          targetSlotIndex: slotIndex,
          targetSlotZone: targetSlot.zone,
          lookingForIndex: slotIndex + 1,
          allSlotPositions
        });
        return;
      }

      // 단내림 경계 체크: 다음 슬롯이 다른 zone이면 배치 불가
      if (hasDroppedCeiling && nextSlot.zone !== targetSlot.zone) {
        console.error('❌ 듀얼 가구 배치 불가: 단내림 경계를 침범합니다');
        console.error('듀얼 가구는 zone 경계를 넘을 수 없습니다:', {
          targetSlot: { index: targetSlot.index, zone: targetSlot.zone },
          nextSlot: { index: nextSlot.index, zone: nextSlot.zone }
        });
        return;
      }

      xPosition = (targetSlot.position + nextSlot.position) / 2;
      console.log('🟢 [useFurniturePlacement] 듀얼 가구 위치 계산:', {
        targetSlot,
        nextSlot,
        xPosition
      });
    } else {
      xPosition = targetSlot.position;
    }

    // Y 위치 계산 (가구 타입에 따라)
    const isUpperCabinet = moduleData.category === 'upper';
    const isLowerCabinet = moduleData.category === 'lower';
    const isTallCabinet = moduleData.category === 'full';

    let yPosition: number;
    const floorFinishHeightMm = spaceInfo.hasFloorFinish && spaceInfo.floorFinish
      ? spaceInfo.floorFinish.height
      : 0;
    const floorFinishHeight = floorFinishHeightMm * 0.01;

    if (isUpperCabinet) {
      // 상부장: 상부프레임 하단에 붙음
      const topFrameHeightMm = spaceInfo.frameSize?.top || 10;
      const bottomFrameHeightMm = spaceInfo.frameSize?.bottom || 0;
      const internalHeight = spaceInfo.height - topFrameHeightMm - bottomFrameHeightMm - floorFinishHeightMm;
      const upperCabinetHeight = moduleData.dimensions.height;
      yPosition = (floorFinishHeightMm + bottomFrameHeightMm + internalHeight - upperCabinetHeight / 2) * 0.01;
    } else if (isLowerCabinet || isTallCabinet) {
      // 하부장/키큰장: 띄움배치 확인
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
      // 기본 위치
      yPosition = 5;
    }

    // customWidth 계산 - 단내림이 있는 경우 슬롯별 실제 너비 사용
    let customWidth: number | undefined;
    let adjustedWidth: number | undefined;
    let customDepth: number | undefined;
    let targetIndexing;

    if (hasDroppedCeiling && zone === 'dropped' && indexing.zones?.dropped) {
      targetIndexing = indexing.zones.dropped;
    } else if (hasDroppedCeiling && zone === 'normal' && indexing.zones?.normal) {
      targetIndexing = indexing.zones.normal;
    } else {
      targetIndexing = indexing;
    }

    if (targetIndexing.slotWidths && targetIndexing.slotWidths[slotIndex] !== undefined) {
      if (isDualFurniture && slotIndex < targetIndexing.slotWidths.length - 1) {
        // 듀얼 가구: 두 슬롯의 너비 합
        const slot1Width = targetIndexing.slotWidths[slotIndex];
        const slot2Width = targetIndexing.slotWidths[slotIndex + 1];
        customWidth = slot1Width + slot2Width;

        console.log('🟢 [useFurniturePlacement] 듀얼 가구 customWidth 계산:', {
          slotIndex,
          slot1Width,
          slot2Width,
          customWidth,
          columnWidth
        });
      } else {
        // 싱글 가구: 해당 슬롯의 실제 너비
        customWidth = targetIndexing.slotWidths[slotIndex];

        console.log('🟢 [useFurniturePlacement] 싱글 가구 customWidth 계산:', {
          slotIndex,
          customWidth,
          columnWidth,
          slotWidths: targetIndexing.slotWidths
        });
      }
    } else {
      // slotWidths가 없으면 기본 columnWidth 사용 (균등 분할)
      customWidth = undefined;

      console.log('🟢 [useFurniturePlacement] slotWidths 없음 - customWidth undefined (columnWidth 사용):', {
        slotIndex,
        columnWidth,
        isDualFurniture
      });
    }

    // 기둥 체크 및 크기 조정 (전체 공간 기준 spaceInfo 사용)
    const columnSlots = analyzeColumnSlots(spaceInfo);

    console.log('🏛️🏛️🏛️ [useFurniturePlacement] 전체 기둥 정보:', {
      columns: spaceInfo.columns?.map(c => ({
        position: c.position,
        width: c.width,
        depth: c.depth
      })),
      columnSlots: columnSlots.map((slot, idx) => ({
        idx,
        slotIndex: slot.slotIndex,
        hasColumn: slot.hasColumn,
        columnType: slot.columnType,
        availableWidth: slot.availableWidth,
        adjustedWidth: slot.adjustedWidth
      }))
    });

    // zone이 있는 경우 globalSlotIndex 계산
    let globalSlotIndex = slotIndex;
    if (hasDroppedCeiling && zone && indexing.zones) {
      if (zone === 'dropped' && indexing.zones.normal) {
        // dropped zone의 경우 normal zone 슬롯 개수를 더해야 함
        globalSlotIndex = indexing.zones.normal.columnCount + slotIndex;
      }
      // normal zone은 이미 globalSlotIndex와 동일
    }

    const targetSlotInfo = columnSlots[globalSlotIndex];

    console.log('🔍 [useFurniturePlacement] 기둥 체크:', {
      slotIndex,
      zone,
      globalSlotIndex,
      targetSlotInfo,
      hasColumn: targetSlotInfo?.hasColumn,
      columnSlotsLength: columnSlots.length
    });

    if (targetSlotInfo && targetSlotInfo.hasColumn && targetSlotInfo.column) {
      // 기둥이 있는 슬롯 - calculateFurnitureBounds로 조정된 크기 계산
      const slotWidthM = columnWidth * 0.01;
      const originalSlotBounds = {
        left: xPosition - slotWidthM / 2,
        right: xPosition + slotWidthM / 2,
        center: xPosition
      };

      const furnitureBounds = calculateFurnitureBounds(targetSlotInfo, originalSlotBounds, spaceInfo);
      adjustedWidth = furnitureBounds.renderWidth;
      customWidth = undefined; // 기둥 슬롯에서는 customWidth 사용 안 함
      xPosition = furnitureBounds.center; // 위치도 조정

      // Column C (300mm)의 경우 깊이 조정
      const columnDepth = targetSlotInfo.column.depth;
      if (columnDepth === 300 && furnitureBounds.renderWidth === columnWidth) {
        customDepth = 730 - columnDepth; // 430mm
      }

      console.log('🔧 [useFurniturePlacement] 기둥 슬롯 배치 - 자동 조정:', {
        zone,
        slotIndex,
        globalSlotIndex,
        originalWidth: moduleData.dimensions.width,
        adjustedWidth,
        adjustedX: xPosition,
        columnDepth,
        customDepth
      });
    }

    // 새 가구 모듈 생성
    const baseType = selectedFurnitureId.replace(/-[\d.]+$/, '');
    const newModule = {
      id: uuidv4(),
      moduleId: selectedFurnitureId,
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

    console.log('🎯 가구 배치:', {
      slotIndex,
      zone: targetSlot.zone,
      position: newModule.position,
      isDual: isDualFurniture,
      category: moduleData.category,
      furnitureWidth: moduleData.dimensions.width,
      columnWidth,
      customWidth: newModule.customWidth,
      targetSlot,
      slotWidths: targetIndexing.slotWidths
    });

    // 가구 추가
    addModule(newModule);

    // 배치 완료 후 선택 해제 및 placement mode 종료
    setSelectedFurnitureId(null);
    setFurniturePlacementMode(false);

    console.log('✅ 가구 배치 완료 - placement mode 종료');
  }, [selectedFurnitureId, spaceInfo, addModule, setSelectedFurnitureId, setFurniturePlacementMode, getCustomFurnitureById]);

  return {
    placeFurniture,
    selectedFurnitureId
  };
};
