import { useCallback } from 'react';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { ModuleData } from '@/data/modules';
import { useCustomFurnitureStore } from '@/store/core/customFurnitureStore';
import { placeFurnitureAtSlot } from '@/editor/shared/furniture/hooks/usePlaceFurnitureAtSlot';

// 커스텀 가구 ID인지 확인하는 함수
const isCustomFurnitureId = (moduleId: string): boolean => {
  return moduleId.startsWith('custom-');
};

/**
 * 클릭 배치 방식으로 가구를 배치하는 훅
 * 공통 placeFurnitureAtSlot 함수를 사용
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

    // 커스텀 가구 처리
    let moduleData: ModuleData | undefined;

    if (isCustomFurnitureId(selectedFurnitureId)) {
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
      }
    }

    // 공통 배치 함수 호출
    const result = placeFurnitureAtSlot({
      moduleId: selectedFurnitureId,
      slotIndex,
      zone,
      spaceInfo,
      moduleData
    });

    if (!result.success) {
      console.error('❌ 가구 배치 실패:', result.error);
      return;
    }

    if (result.module) {
      addModule(result.module);
    }

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
