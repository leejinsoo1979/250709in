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

  const placeFurniture = useCallback((slotIndex: number) => {
    if (!selectedFurnitureId) {
      console.warn('선택된 가구가 없습니다');
      return;
    }

    const internalSpace = calculateInternalSpace(spaceInfo);
    const moduleData = getModuleById(selectedFurnitureId, internalSpace, spaceInfo);

    if (!moduleData) {
      console.error('가구 데이터를 찾을 수 없습니다:', selectedFurnitureId);
      return;
    }

    const indexing = calculateSpaceIndexing(spaceInfo);

    // 듀얼 가구 여부 확인
    const columnWidth = indexing.columnWidth;
    const isDualFurniture = Math.abs(moduleData.dimensions.width - (columnWidth * 2)) < 50;

    // 위치 계산
    let xPosition: number;
    if (isDualFurniture && indexing.threeUnitDualPositions) {
      xPosition = indexing.threeUnitDualPositions[slotIndex];
    } else {
      xPosition = indexing.threeUnitPositions[slotIndex];
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
      customWidth: undefined,
      adjustedWidth: undefined,
      lowerSectionDepth: undefined,
      upperSectionDepth: undefined,
      customSections: undefined,
      isLocked: false,
      zone: undefined
    };

    console.log('🎯 가구 배치:', {
      slotIndex,
      position: newModule.position,
      isDual: isDualFurniture,
      category: moduleData.category
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
