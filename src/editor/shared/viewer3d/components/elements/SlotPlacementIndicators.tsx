import React, { useMemo } from 'react';
import { Html } from '@react-three/drei';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { getModuleById } from '@/data/modules';
import { calculateInternalSpace } from '../../utils/geometry';

interface SlotPlacementIndicatorsProps {
  onSlotClick: (slotIndex: number, zone?: 'normal' | 'dropped') => void;
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

  // 단내림이 있는 경우 영역별 슬롯 위치 계산
  const getAllSlotPositions = useMemo(() => {
    const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled || false;

    if (!hasDroppedCeiling || !indexing.zones) {
      // 단내림이 없으면 기본 위치 사용
      return indexing.threeUnitPositions.map((pos, idx) => ({
        position: pos,
        zone: 'normal' as const,
        index: idx
      }));
    }

    const allPositions = [];

    // normal 영역
    if (indexing.zones.normal?.threeUnitPositions) {
      allPositions.push(...indexing.zones.normal.threeUnitPositions.map((pos, idx) => ({
        position: pos,
        zone: 'normal' as const,
        index: idx
      })));
    }

    // dropped 영역
    if (indexing.zones.dropped?.threeUnitPositions) {
      allPositions.push(...indexing.zones.dropped.threeUnitPositions.map((pos, idx) => ({
        position: pos,
        zone: 'dropped' as const,
        index: idx
      })));
    }

    return allPositions.sort((a, b) => a.position - b.position);
  }, [indexing, spaceInfo.droppedCeiling?.enabled]);

  // 사용 가능한 슬롯 계산
  const availableSlots = useMemo(() => {
    if (!selectedModuleData) return [];

    const slots: Array<{ slotIndex: number; zone: 'normal' | 'dropped'; position: { x: number; y: number; z: number } }> = [];
    const selectedCategory = selectedModuleData.category;
    const allSlotPositions = getAllSlotPositions;

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

    for (let i = 0; i < allSlotPositions.length; i++) {
      const slotData = allSlotPositions[i];
      const slotIndex = slotData.index;

      // 듀얼 가구인 경우 연속된 두 슬롯 체크
      if (isDualFurniture) {
        if (i >= allSlotPositions.length - 1) continue; // 마지막 슬롯은 듀얼 배치 불가

        const nextSlotData = allSlotPositions[i + 1];
        // 같은 영역의 연속된 슬롯인지 확인
        if (slotData.zone !== nextSlotData.zone) continue;

        // 두 슬롯이 모두 비어있는지 확인 (배치된 듀얼 가구도 고려)
        const slotsOccupied = placedModules.some(m => {
          const moduleData = getModuleById(m.moduleId, calculateInternalSpace(spaceInfo), spaceInfo);
          const moduleWidth = moduleData?.dimensions.width || 0;
          const isPlacedDual = Math.abs(moduleWidth - (indexing.columnWidth * 2)) < 50;

          if (isPlacedDual) {
            // 배치된 가구가 듀얼: 슬롯 범위 겹침 체크
            return (m.slotIndex === slotIndex || m.slotIndex === nextSlotData.index) ||
                   (m.slotIndex + 1 === slotIndex || m.slotIndex + 1 === nextSlotData.index);
          } else {
            // 배치된 가구가 싱글
            return m.slotIndex === slotIndex || m.slotIndex === nextSlotData.index;
          }
        });

        if (!slotsOccupied) {
          // 두 슬롯의 중심 위치 계산
          const centerX = (slotData.position + nextSlotData.position) / 2;

          slots.push({
            slotIndex: slotIndex,
            zone: slotData.zone,
            position: {
              x: centerX,
              y: yPosition,
              z: 0
            }
          });
        }
      } else {
        // 싱글 가구인 경우
        // 같은 슬롯에 어떤 가구든 있으면 점유됨 (배치된 듀얼 가구의 두 번째 슬롯도 고려)
        const slotOccupied = placedModules.some(m => {
          const moduleData = getModuleById(m.moduleId, calculateInternalSpace(spaceInfo), spaceInfo);
          const moduleWidth = moduleData?.dimensions.width || 0;
          const isPlacedDual = Math.abs(moduleWidth - (indexing.columnWidth * 2)) < 50;

          if (isPlacedDual) {
            // 배치된 가구가 듀얼: 듀얼 가구의 두 슬롯 중 하나라도 현재 슬롯이면 점유됨
            return m.slotIndex === slotIndex || m.slotIndex + 1 === slotIndex;
          } else {
            // 배치된 가구가 싱글
            return m.slotIndex === slotIndex;
          }
        });

        if (!slotOccupied) {
          slots.push({
            slotIndex: slotIndex,
            zone: slotData.zone,
            position: {
              x: slotData.position,
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
            userSelect: 'none',
            background: 'transparent'
          }}
        >
          <div
            onClick={(e) => {
              e.stopPropagation();
              onSlotClick(slot.slotIndex, slot.zone);
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
