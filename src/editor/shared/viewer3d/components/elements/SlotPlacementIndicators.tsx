import React, { useMemo } from 'react';
import { Html } from '@react-three/drei';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { getModuleById } from '@/data/modules';
import { calculateInternalSpace } from '../../utils/geometry';

interface SlotPlacementIndicatorsProps {
  onSlotClick: (slotIndex: number) => void;
}

/**
 * 슬롯에 + 아이콘을 표시하는 컴포넌트
 * - 싱글 가구: 빈 슬롯에 + 표시
 * - 듀얼 가구: 연속된 두 빈 슬롯의 중심에 + 표시
 */
const SlotPlacementIndicators: React.FC<SlotPlacementIndicatorsProps> = ({ onSlotClick }) => {
  const { spaceInfo } = useSpaceConfigStore();
  const { selectedFurnitureId, placedModules } = useFurnitureStore();

  // 선택된 가구 정보 가져오기
  const selectedModuleData = useMemo(() => {
    if (!selectedFurnitureId) return null;
    const internalSpace = calculateInternalSpace(spaceInfo);
    return getModuleById(selectedFurnitureId, internalSpace, spaceInfo);
  }, [selectedFurnitureId, spaceInfo]);

  // 듀얼 가구 여부 확인
  const isDualFurniture = useMemo(() => {
    if (!selectedModuleData) return false;
    const indexing = calculateSpaceIndexing(spaceInfo);
    const columnWidth = indexing.columnWidth;
    return Math.abs(selectedModuleData.dimensions.width - (columnWidth * 2)) < 50;
  }, [selectedModuleData, spaceInfo]);

  // 슬롯 인덱싱 정보
  const indexing = useMemo(() => calculateSpaceIndexing(spaceInfo), [spaceInfo]);

  // 사용 가능한 슬롯 계산
  const availableSlots = useMemo(() => {
    if (!selectedModuleData) return [];

    const slots: Array<{ slotIndex: number; position: { x: number; y: number; z: number } }> = [];
    const selectedCategory = selectedModuleData.category;

    for (let i = 0; i < indexing.columnCount; i++) {
      // 듀얼 가구인 경우 연속된 두 슬롯 체크
      if (isDualFurniture) {
        if (i >= indexing.columnCount - 1) continue; // 마지막 슬롯은 듀얼 배치 불가

        // 두 슬롯이 모두 비어있는지 확인
        const slot1Occupied = placedModules.some(m => m.slotIndex === i);
        const slot2Occupied = placedModules.some(m => m.slotIndex === i + 1);

        if (!slot1Occupied && !slot2Occupied) {
          // 두 슬롯의 중심 위치 계산
          const centerX = indexing.threeUnitDualPositions?.[i] ||
                         (indexing.threeUnitPositions[i] + indexing.threeUnitPositions[i + 1]) / 2;

          slots.push({
            slotIndex: i,
            position: {
              x: centerX,
              y: 5, // 적절한 높이 (나중에 조정 가능)
              z: 0
            }
          });
        }
      } else {
        // 싱글 가구인 경우
        // 같은 슬롯에 동일 카테고리 가구가 있는지 확인
        const occupiedBySameCategory = placedModules.some(m => {
          if (m.slotIndex !== i) return false;
          const moduleData = getModuleById(m.moduleId, calculateInternalSpace(spaceInfo), spaceInfo);
          return moduleData?.category === selectedCategory;
        });

        if (!occupiedBySameCategory) {
          slots.push({
            slotIndex: i,
            position: {
              x: indexing.threeUnitPositions[i],
              y: 5,
              z: 0
            }
          });
        }
      }
    }

    return slots;
  }, [selectedModuleData, isDualFurniture, indexing, placedModules, spaceInfo]);

  if (!selectedFurnitureId || !selectedModuleData) {
    return null;
  }

  return (
    <>
      {availableSlots.map((slot) => (
        <Html
          key={`slot-indicator-${slot.slotIndex}`}
          position={[slot.position.x, slot.position.y, slot.position.z]}
          center
          style={{
            pointerEvents: 'auto',
            userSelect: 'none'
          }}
        >
          <div
            onClick={(e) => {
              e.stopPropagation();
              onSlotClick(slot.slotIndex);
            }}
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: 'rgba(59, 130, 246, 0.9)',
              border: '3px solid white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
              transition: 'all 0.2s ease',
              fontSize: '32px',
              color: 'white',
              fontWeight: 'bold',
              lineHeight: '1'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.15)';
              e.currentTarget.style.backgroundColor = 'rgba(37, 99, 235, 1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.9)';
            }}
          >
            +
          </div>
        </Html>
      ))}
    </>
  );
};

export default SlotPlacementIndicators;
