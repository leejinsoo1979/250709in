import React, { useMemo } from 'react';
import { Html } from '@react-three/drei';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { getModuleById } from '@/data/modules';
import { calculateInternalSpace } from '../../utils/geometry';
import { useUIStore } from '@/store/uiStore';
import { isSlotAvailable } from '@/editor/shared/utils/slotAvailability';

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
  const { view2DTheme } = useUIStore();

  console.log('🔵🔵🔵 SlotPlacementIndicators 렌더링:', { selectedFurnitureId, placedModulesCount: placedModules.length });

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
      const positions = indexing.threeUnitPositions.map((pos, idx) => ({
        position: pos,
        zone: 'normal' as const,
        index: idx
      }));
      console.log('🔵 [SlotIndicators] 단내림 없음 - 슬롯 위치:', positions);
      return positions;
    }

    const allPositions = [];

    // normal 영역
    if (indexing.zones.normal?.threeUnitPositions) {
      const normalPositions = indexing.zones.normal.threeUnitPositions.map((pos, idx) => ({
        position: pos,
        zone: 'normal' as const,
        index: idx
      }));
      allPositions.push(...normalPositions);
      console.log('🔵 [SlotIndicators] Normal 영역 슬롯:', normalPositions);
    }

    // dropped 영역
    if (indexing.zones.dropped?.threeUnitPositions) {
      const droppedPositions = indexing.zones.dropped.threeUnitPositions.map((pos, idx) => ({
        position: pos,
        zone: 'dropped' as const,
        index: idx
      }));
      allPositions.push(...droppedPositions);
      console.log('🔵 [SlotIndicators] Dropped 영역 슬롯:', droppedPositions);
    }

    // position 정렬하지 않음 - zone별로 slotIndex 순서대로 유지
    console.log('🔵 [SlotIndicators] 전체 슬롯 위치:', allPositions);
    return allPositions;
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

    console.log('🟠 [SlotIndicators] availableSlots 계산 시작:', {
      isDualFurniture,
      allSlotPositions,
      placedModulesCount: placedModules.length,
      placedModules: placedModules.map(m => ({ slotIndex: m.slotIndex, zone: m.zone, id: m.moduleId }))
    });

    for (let i = 0; i < allSlotPositions.length; i++) {
      const slotData = allSlotPositions[i];
      const slotIndex = slotData.index;

      console.log('🟠 [SlotIndicators] 슬롯 체크 시작:', { i, slotIndex, zone: slotData.zone });

      // isDualFurniture와 slotIndex로 슬롯 사용 가능 여부 확인
      const available = isSlotAvailable(
        slotIndex,
        isDualFurniture,
        placedModules,
        spaceInfo,
        selectedFurnitureId,
        undefined, // excludeModuleId
        slotData.zone // targetZone
      );

      if (!available) {
        console.log('🔍 [SlotIndicators] 슬롯 사용 불가:', { slotIndex, zone: slotData.zone });
        continue; // 슬롯 사용 불가
      }

      // 듀얼 가구인 경우 연속된 두 슬롯 체크
      if (isDualFurniture) {
        if (i >= allSlotPositions.length - 1) continue; // 마지막 슬롯은 듀얼 배치 불가

        const nextSlotData = allSlotPositions[i + 1];
        // 같은 영역의 연속된 슬롯인지 확인
        if (slotData.zone !== nextSlotData.zone) continue;

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
      } else {
        // 싱글 가구인 경우
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

    return slots;
  }, [selectedModuleData, isDualFurniture, indexing, placedModules, spaceInfo]);

  if (!selectedFurnitureId || !selectedModuleData) {
    console.log('🔵 SlotPlacementIndicators - 렌더링 안함:', { selectedFurnitureId, selectedModuleData: !!selectedModuleData });
    return null;
  }

  console.log('🔵🔵🔵 SlotPlacementIndicators - 아이콘 렌더링:', { availableSlotsCount: availableSlots.length, availableSlots });

  return (
    <>
      {availableSlots.map((slot) => (
        <Html
          key={`slot-indicator-${slot.zone}-${slot.slotIndex}`}
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
              console.log('🔵 [SlotIndicators] + 아이콘 클릭:', { slotIndex: slot.slotIndex, zone: slot.zone });
              console.log('🔵 [SlotIndicators] onSlotClick 함수:', onSlotClick);
              console.log('🔵 [SlotIndicators] onSlotClick 호출 시작');
              onSlotClick(slot.slotIndex, slot.zone);
              console.log('🔵 [SlotIndicators] onSlotClick 호출 완료');
            }}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: view2DTheme.primary,
              border: '2px solid white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              transition: 'all 0.2s ease',
              fontSize: '22px',
              color: 'white',
              fontWeight: 'bold',
              lineHeight: '1',
              animation: 'pulse 0.8s ease-in-out infinite'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.15)';
              e.currentTarget.style.opacity = '0.8';
              e.currentTarget.style.animation = 'none';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.opacity = '1';
              e.currentTarget.style.animation = 'pulse 0.8s ease-in-out infinite';
            }}
          >
            +
          </div>
          <style>{`
            @keyframes pulse {
              0%, 100% {
                transform: scale(1);
                opacity: 1;
              }
              50% {
                transform: scale(1.1);
                opacity: 0.8;
              }
            }
          `}</style>
        </Html>
      ))}
    </>
  );
};

export default SlotPlacementIndicators;
