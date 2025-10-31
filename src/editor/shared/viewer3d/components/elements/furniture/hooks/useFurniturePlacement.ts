import { useCallback } from 'react';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { getModuleById } from '@/data/modules';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { calculateInternalSpace } from '../../../../utils/geometry';
import { v4 as uuidv4 } from 'uuid';

/**
 * 클릭 배치 방식으로 가구를 배치하는 훅
 */
export const useFurniturePlacement = () => {
  const { spaceInfo } = useSpaceConfigStore();
  const { selectedFurnitureId, addModule, setSelectedFurnitureId, setFurniturePlacementMode } = useFurnitureStore();

  const placeFurniture = useCallback((slotIndex: number, zone?: 'normal' | 'dropped') => {
    console.log('🟢 [useFurniturePlacement] placeFurniture 호출:', { slotIndex, zone });

    if (!selectedFurnitureId) {
      console.warn('선택된 가구가 없습니다');
      return;
    }

    const indexing = calculateSpaceIndexing(spaceInfo);
    const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled || false;

    console.log('🟢 [useFurniturePlacement] indexing:', {
      hasDroppedCeiling,
      zones: indexing.zones,
      columnWidth: indexing.columnWidth,
      threeUnitPositions: indexing.threeUnitPositions
    });

    // zone에 맞는 internal space를 객체로 생성
    const baseInternalSpace = calculateInternalSpace(spaceInfo);
    let targetInternalSpace = baseInternalSpace;

    if (hasDroppedCeiling && zone === 'dropped' && indexing.zones?.dropped) {
      // 단내림 영역: 단내림 영역의 폭 사용
      targetInternalSpace = {
        width: indexing.zones.dropped.internalWidth,
        height: baseInternalSpace.height,
        depth: baseInternalSpace.depth
      };
    } else if (hasDroppedCeiling && indexing.zones?.normal) {
      // 단내림이 있지만 일반 영역: 일반 영역의 폭 사용
      targetInternalSpace = {
        width: indexing.zones.normal.internalWidth,
        height: baseInternalSpace.height,
        depth: baseInternalSpace.depth
      };
    }

    console.log('🟢 [useFurniturePlacement] targetInternalSpace:', {
      zone,
      hasDroppedCeiling,
      targetInternalSpace,
      'zones.normal': indexing.zones?.normal?.internalWidth,
      'zones.dropped': indexing.zones?.dropped?.internalWidth
    });

    const moduleData = getModuleById(selectedFurnitureId, targetInternalSpace, spaceInfo);

    if (!moduleData) {
      console.error('❌ 가구 데이터를 찾을 수 없습니다:', selectedFurnitureId);
      return;
    }

    console.log('🟢 [useFurniturePlacement] moduleData:', {
      id: moduleData.id,
      dimensions: moduleData.dimensions,
      category: moduleData.category
    });

    // 듀얼 가구 여부 확인 - ID 기반 판단
    const isDualFurniture = selectedFurnitureId.includes('dual-');

    // zone에 맞는 columnWidth 계산
    let columnWidth;
    if (hasDroppedCeiling && zone === 'dropped' && indexing.zones?.dropped) {
      columnWidth = indexing.zones.dropped.columnWidth;
    } else if (hasDroppedCeiling && indexing.zones?.normal) {
      columnWidth = indexing.zones.normal.columnWidth;
    } else {
      columnWidth = indexing.columnWidth;
    }

    console.log('🟢 [useFurniturePlacement] 듀얼 가구 판단 (ID 기반):', {
      selectedFurnitureId,
      isDualFurniture,
      columnWidth,
      furnitureWidth: moduleData.dimensions.width
    });

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
      // zone과 index를 모두 체크하여 같은 zone의 다음 슬롯 찾기
      const nextSlot = allSlotPositions.find(slot =>
        slot.index === slotIndex + 1 && slot.zone === targetSlot.zone
      );
      if (!nextSlot) {
        console.error('듀얼 가구 배치를 위한 다음 슬롯을 찾을 수 없습니다:', {
          targetSlotIndex: slotIndex,
          targetSlotZone: targetSlot.zone,
          allSlotPositions
        });
        return;
      }
      xPosition = (targetSlot.position + nextSlot.position) / 2;
      console.log('🟢 [useFurniturePlacement] 듀얼 가구 위치:', {
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

    // 새 가구 모듈 생성
    const newModule = {
      id: uuidv4(),
      moduleId: selectedFurnitureId,
      position: {
        x: xPosition,
        y: yPosition,
        z: 0
      },
      rotation: 0,
      slotIndex: slotIndex,
      isDualSlot: isDualFurniture,
      customHeight: undefined,
      customDepth: undefined,
      customWidth: customWidth,
      adjustedWidth: undefined,
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
  }, [selectedFurnitureId, spaceInfo, addModule, setSelectedFurnitureId, setFurniturePlacementMode]);

  return {
    placeFurniture,
    selectedFurnitureId
  };
};
