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

    // 가구 높이의 중심 계산
    const furnitureHeightMm = selectedModuleData.dimensions.height;
    const floorFinishHeightMm = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? spaceInfo.floorFinish.height : 0;
    const baseHeightMm = spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height || 65) : 0;
    const floatHeightMm = spaceInfo.baseConfig?.placementType === 'float' ? (spaceInfo.baseConfig?.floatHeight || 0) : 0;

    let yPosition: number;
    if (selectedCategory === 'upper') {
      // 상부장: 천장 근처
      const topFrameHeightMm = spaceInfo.frameSize?.top || 10;
      const bottomFrameHeightMm = spaceInfo.frameSize?.bottom || 0;
      const internalHeight = spaceInfo.height - topFrameHeightMm - bottomFrameHeightMm - floorFinishHeightMm;
      yPosition = (floorFinishHeightMm + bottomFrameHeightMm + internalHeight - furnitureHeightMm / 2) * 0.01;
    } else {
      // 하부장/키큰장: 바닥 기준
      yPosition = (floorFinishHeightMm + baseHeightMm + floatHeightMm + furnitureHeightMm / 2) * 0.01;
    }

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
              y: yPosition,
              z: 0
            }
          });
        }
      } else {
        // 싱글 가구인 경우
        // 같은 슬롯에 어떤 가구든 있으면 점유됨
        const slotOccupied = placedModules.some(m => m.slotIndex === i);

        if (!slotOccupied) {
          slots.push({
            slotIndex: i,
            position: {
              x: indexing.threeUnitPositions[i],
              y: yPosition,
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
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: 'rgba(59, 130, 246, 0.9)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              transition: 'all 0.2s ease',
              fontSize: '24px',
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
