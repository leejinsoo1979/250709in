import React, { useEffect, useMemo, useState } from 'react';
import { Html } from '@react-three/drei';
import { useSpaceConfigStore, type FreePlacementGuideSlot } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { calculateSpaceIndexing, recalculateWithCustomWidths } from '@/editor/shared/utils/indexing';
import { getModuleById } from '@/data/modules';
import { calculateInternalSpace } from '../../utils/geometry';
import { useUIStore } from '@/store/uiStore';
import { useMyCabinetStore } from '@/store/core/myCabinetStore';
import { isSlotAvailable } from '@/editor/shared/utils/slotAvailability';
import type { ModuleData } from '@/data/modules/shelving';
import { NativeLine } from './NativeLine';
import { useThemeColors } from '@/hooks/useThemeColors';
import {
  getColumnObstacleBoundsX,
  getFreePlacementGuideBoundsX,
  getModuleBoundsX
} from '@/editor/shared/utils/freePlacementUtils';

interface SlotPlacementIndicatorsProps {
  onSlotClick: (slotIndex: number, zone?: 'normal' | 'dropped') => void;
}

interface FreeGuideSlotWidthInputProps {
  slot: FreePlacementGuideSlot;
  onCommit: (slotId: string, widthValue: number) => void;
  onEdit: (slotId: string) => void;
  onAdd: (slotId: string) => void;
  onRemove: (slotId: string) => void;
  onSplit: (slotId: string) => void;
  onToggleMergeSelect: (slotId: string) => void;
  canRemove: boolean;
  canSplit: boolean;
  canMergeSelect: boolean;
  mergeSelected: boolean;
}

const FreeGuideSlotWidthInput: React.FC<FreeGuideSlotWidthInputProps> = ({
  slot,
  onCommit,
  onEdit,
  onAdd,
  onRemove,
  onSplit,
  onToggleMergeSelect,
  canRemove,
  canSplit,
  canMergeSelect,
  mergeSelected
}) => {
  const [value, setValue] = useState(String(Math.round(slot.width)));

  useEffect(() => {
    setValue(String(Math.round(slot.width)));
  }, [slot.width]);

  const commit = () => {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      onCommit(slot.id, parsed);
    } else {
      setValue(String(Math.round(slot.width)));
    }
  };

  if (slot.confirmed) {
    return (
      <div
        style={{
          display: 'grid',
          justifyItems: 'center',
          gap: '3px'
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            height: '22px',
            padding: '0 8px',
            borderRadius: '6px',
            border: '1px solid color-mix(in srgb, var(--theme-primary) 36%, transparent)',
            background: 'color-mix(in srgb, var(--theme-primary) 16%, var(--theme-background) 84%)',
            color: 'var(--theme-text)',
            boxShadow: '0 1px 4px rgba(15, 23, 42, 0.14)',
            fontSize: '11px',
            fontWeight: 800,
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums'
          }}
        >
          {canMergeSelect && (
            <input
              type="checkbox"
              checked={mergeSelected}
              aria-label="상하 병합 선택"
              onChange={() => onToggleMergeSelect(slot.id)}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '12px',
                height: '12px',
                margin: 0,
                accentColor: 'var(--theme-primary)',
                cursor: 'pointer'
              }}
            />
          )}
          {Math.round(slot.width)}mm
        </div>
        <button
          type="button"
          onClick={() => onEdit(slot.id)}
          style={{
            height: '20px',
            minWidth: '42px',
            padding: '0 8px',
            borderRadius: '6px',
            border: '1px solid color-mix(in srgb, var(--theme-primary) 42%, transparent)',
            background: 'var(--theme-background)',
            color: 'var(--theme-primary)',
            fontSize: '10px',
            fontWeight: 800,
            lineHeight: '1',
            boxShadow: '0 1px 4px rgba(15, 23, 42, 0.12)',
            cursor: 'pointer'
          }}
        >
          수정
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'grid',
        justifyItems: 'center',
        gap: '3px'
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          height: '22px',
          padding: '0 7px',
          borderRadius: '6px',
          border: '1px solid color-mix(in srgb, var(--theme-primary) 36%, transparent)',
          background: 'color-mix(in srgb, var(--theme-primary) 12%, var(--theme-background) 88%)',
          color: 'var(--theme-text)',
          boxShadow: '0 1px 4px rgba(15, 23, 42, 0.14)',
          fontSize: '11px',
          fontWeight: 700,
          whiteSpace: 'nowrap'
        }}
      >
        {canMergeSelect && (
          <input
            type="checkbox"
            checked={mergeSelected}
            aria-label="상하 병합 선택"
            onChange={() => onToggleMergeSelect(slot.id)}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '12px',
              height: '12px',
              margin: 0,
              accentColor: 'var(--theme-primary)',
              cursor: 'pointer'
            }}
          />
        )}
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commit();
              e.currentTarget.blur();
            }
            if (e.key === 'Escape') {
              setValue(String(Math.round(slot.width)));
              e.currentTarget.blur();
            }
          }}
          style={{
            width: `${Math.max(34, Math.min(62, value.length * 8 + 10))}px`,
            height: '18px',
            padding: 0,
            border: 'none',
            background: 'transparent',
            color: 'var(--theme-text)',
            fontSize: '11px',
            fontWeight: 800,
            textAlign: 'center',
            outline: 'none',
            fontVariantNumeric: 'tabular-nums'
          }}
        />
      </label>
      <button
        type="button"
        onClick={commit}
        style={{
          height: '20px',
          minWidth: '42px',
          padding: '0 8px',
          borderRadius: '6px',
          border: '1px solid var(--theme-primary)',
          background: 'var(--theme-primary)',
          color: '#fff',
          fontSize: '10px',
          fontWeight: 800,
          lineHeight: '1',
          boxShadow: '0 2px 6px color-mix(in srgb, var(--theme-primary) 24%, transparent)',
          cursor: 'pointer'
        }}
      >
        확인
      </button>
      <div
        style={{
          display: 'flex',
          gap: '4px'
        }}
      >
        <button
          type="button"
          onClick={() => onAdd(slot.id)}
          aria-label="슬롯 추가"
          style={{
            height: '20px',
            width: '24px',
            padding: 0,
            borderRadius: '6px',
            border: '1px solid color-mix(in srgb, var(--theme-primary) 45%, transparent)',
            background: 'color-mix(in srgb, var(--theme-primary) 10%, var(--theme-background) 90%)',
            color: 'var(--theme-primary)',
            fontSize: '15px',
            fontWeight: 800,
            lineHeight: '1',
            cursor: 'pointer'
          }}
        >
          +
        </button>
        <button
          type="button"
          onClick={() => onRemove(slot.id)}
          disabled={!canRemove}
          aria-label="슬롯 제거"
          style={{
            height: '20px',
            width: '24px',
            padding: 0,
            borderRadius: '6px',
            border: '1px solid color-mix(in srgb, var(--theme-text-muted) 34%, transparent)',
            background: 'var(--theme-background)',
            color: canRemove ? 'var(--theme-text-secondary)' : 'var(--theme-text-muted)',
            fontSize: '15px',
            fontWeight: 800,
            lineHeight: '1',
            opacity: canRemove ? 1 : 0.45,
            cursor: canRemove ? 'pointer' : 'not-allowed'
          }}
        >
          -
        </button>
      </div>
      {canSplit && (
        <button
          type="button"
          onClick={() => onSplit(slot.id)}
          style={{
            height: '20px',
            minWidth: '80px',
            padding: '0 7px',
            borderRadius: '6px',
            border: '1px solid color-mix(in srgb, var(--theme-primary) 38%, transparent)',
            background: 'var(--theme-background)',
            color: 'var(--theme-primary)',
            fontSize: '10px',
            fontWeight: 800,
            lineHeight: '1',
            cursor: 'pointer'
          }}
        >
          분할
        </button>
      )}
    </div>
  );
};

/**
 * 슬롯에 + 아이콘을 표시하는 컴포넌트
 * - 싱글 가구: 빈 슬롯에 + 표시
 * - 듀얼 가구: 연속된 두 빈 슬롯의 중심에 + 표시
 */
const SlotPlacementIndicators: React.FC<SlotPlacementIndicatorsProps> = ({ onSlotClick }) => {
  const { spaceInfo, setSpaceInfo } = useSpaceConfigStore();
  const { selectedFurnitureId, placedModules } = useFurnitureStore();
  const { view2DTheme, viewMode, activePlacementWall, view2DDirection } = useUIStore();
  const { pendingPlacement } = useMyCabinetStore();
  const { colors } = useThemeColors();
  const [mergeSelectedSlotIds, setMergeSelectedSlotIds] = useState<string[]>([]);

  const isCustomGuideMode = spaceInfo.customGuideMode === true;
  const isFreePlacement = spaceInfo.layoutMode === 'free-placement';
  const isGuidePlacementMode = isFreePlacement || isCustomGuideMode;

  if (viewMode === '3D' && activePlacementWall !== 'front') {
    return null;
  }

// console.log('🔵🔵🔵 SlotPlacementIndicators 렌더링:', { selectedFurnitureId, placedModulesCount: placedModules.length });

  // 선택된 가구 정보 가져오기 (My캐비넷 모듈은 pendingPlacement로 합성)
  const selectedModuleData = useMemo(() => {
    if (!selectedFurnitureId) return null;
    const internalSpace = calculateInternalSpace(spaceInfo);
    const standardModule = getModuleById(selectedFurnitureId, internalSpace, spaceInfo);
    if (standardModule) return standardModule;

    // My캐비넷 모듈: pendingPlacement에서 합성 ModuleData 생성
    if (pendingPlacement) {
      const idx = calculateSpaceIndexing(spaceInfo);
      const colW = idx.columnWidth;
      // 원래 너비가 칸 너비의 1.5배 이상이면 듀얼 → 2칸 너비로 설정
      const isMyCabinetDual = pendingPlacement.width > colW * 1.5;
      const slotWidth = isMyCabinetDual ? colW * 2 : colW;

      return {
        id: selectedFurnitureId,
        name: '커스텀 캐비넷',
        category: pendingPlacement.category,
        dimensions: {
          width: slotWidth,
          height: pendingPlacement.height,
          depth: pendingPlacement.depth,
        },
        color: '#C8B69E',
        hasDoor: false,
        isDynamic: false,
        modelConfig: { basicThickness: spaceInfo.panelThickness ?? 18 },
      } as ModuleData;
    }
    return null;
  }, [selectedFurnitureId, spaceInfo, pendingPlacement]);

  // 듀얼 가구 여부 확인
  const isDualFurniture = useMemo(() => {
    if (!selectedModuleData) return false;
    // ID 기반: dual- 접두어 또는 듀얼 빌트인 냉장고장
    if (selectedModuleData.id?.startsWith('dual-')) return true;
    if ((selectedModuleData.modelConfig as any)?.isDualBuiltInFridge) return true;
    const indexing = calculateSpaceIndexing(spaceInfo);
    const columnWidth = indexing.columnWidth;
    return Math.abs(selectedModuleData.dimensions.width - (columnWidth * 2)) < 50;
  }, [selectedModuleData, spaceInfo]);

  // 슬롯 인덱싱 정보 — slotCustomWidth 재분할 반영
  const indexing = useMemo(() => {
    const base = calculateSpaceIndexing(spaceInfo);
    const hasCustomWidths = placedModules.some(m => m.slotCustomWidth !== undefined);
    return hasCustomWidths ? recalculateWithCustomWidths(base, placedModules) : base;
  }, [spaceInfo, placedModules]);

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
// console.log('🔵 [SlotIndicators] 단내림 없음 - 슬롯 위치:', positions);
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
// console.log('🔵 [SlotIndicators] Normal 영역 슬롯:', normalPositions);
    }

    // dropped 영역
    if (indexing.zones.dropped?.threeUnitPositions) {
      const droppedPositions = indexing.zones.dropped.threeUnitPositions.map((pos, idx) => ({
        position: pos,
        zone: 'dropped' as const,
        index: idx
      }));
      allPositions.push(...droppedPositions);
// console.log('🔵 [SlotIndicators] Dropped 영역 슬롯:', droppedPositions);
    }

    // position 정렬하지 않음 - zone별로 slotIndex 순서대로 유지
// console.log('🔵 [SlotIndicators] 전체 슬롯 위치:', allPositions);
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

// console.log('🟠 [SlotIndicators] availableSlots 계산 시작:', {
      // isDualFurniture,
      // allSlotPositions,
      // placedModulesCount: placedModules.length,
      // placedModules: placedModules.map(m => ({ slotIndex: m.slotIndex, zone: m.zone, id: m.moduleId }))
    // });

    // Y 위치 계산 함수 - zone에 따라 다른 높이 적용
    const calculateYPosition = (zone: 'normal' | 'dropped'): number => {
      if (selectedCategory === 'upper') {
        // 상부장: 천장 근처
        const topFrameHeightMm = spaceInfo.frameSize?.top || 30;

        // 천장 높이 결정 (단내림 영역이면 단내림 천장 높이 사용)
        const ceilingHeight = (spaceInfo.droppedCeiling?.enabled && zone === 'dropped' && spaceInfo.droppedCeiling?.dropHeight !== undefined)
          ? spaceInfo.height - spaceInfo.droppedCeiling.dropHeight // 전체 높이 - 내려온 높이
          : spaceInfo.height;

// console.log('🔴 [SlotIndicators] 상부장 Y 위치 계산:', {
          // zone,
          // 전체높이: spaceInfo.height,
          // 단내림내려온높이: spaceInfo.droppedCeiling?.dropHeight,
          // 단내림천장높이: (spaceInfo.droppedCeiling?.enabled && zone === 'dropped' && spaceInfo.droppedCeiling?.dropHeight !== undefined)
            // ? spaceInfo.height - spaceInfo.droppedCeiling.dropHeight
            // : undefined,
          // 사용된천장높이: ceilingHeight,
          // 상단몰딩: topFrameHeightMm,
          // 상부장높이: furnitureHeightMm
        // });

        // 상부장 상단 Y = 천장 높이 - 상단몰딩 높이
        const upperCabinetTopY = ceilingHeight - topFrameHeightMm;
        // 상부장 중심 Y = 상부장 상단 - 상부장 높이/2
        return (upperCabinetTopY - furnitureHeightMm / 2) * 0.01;
      } else {
        // 하부장/키큰장: 바닥 기준
        return (floorFinishHeightMm + baseHeightMm + floatHeightMm + furnitureHeightMm / 2) * 0.01;
      }
    };

    for (let i = 0; i < allSlotPositions.length; i++) {
      const slotData = allSlotPositions[i];
      const slotIndex = slotData.index;

// console.log('🟠 [SlotIndicators] 슬롯 체크 시작:', { i, slotIndex, zone: slotData.zone });

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
// console.log('🔍 [SlotIndicators] 슬롯 사용 불가:', { slotIndex, zone: slotData.zone });
        continue; // 슬롯 사용 불가
      }

      // zone에 따른 Y 위치 계산
      const yPosition = calculateYPosition(slotData.zone);

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

  const isSameGuideLine = (
    slot: FreePlacementGuideSlot,
    targetZone: 'full' | 'upper' | 'lower',
    targetGroupId?: string
  ) => (
    (slot.guideZone || 'full') === targetZone
    && (slot.guideGroupId || '') === (targetGroupId || '')
  );

  const updateFreeGuideSlotWidth = (slotId: string, widthValue: number) => {
    const sourceSlots = spaceInfo.freePlacementGuides || [];
    if (sourceSlots.length === 0) return;

    const bounds = getFreePlacementGuideBoundsX(spaceInfo);
    const totalGuideWidth = Math.max(0, bounds.endX - bounds.startX);
    const minSlotWidth = 1;
    const targetSlot = sourceSlots.find((slot) => slot.id === slotId);
    if (!targetSlot) return;
    const targetZone = targetSlot.guideZone || 'full';
    const targetGroupId = targetSlot.guideGroupId;
    const targetZoneSlots = sourceSlots.filter((slot) => isSameGuideLine(slot, targetZone, targetGroupId));
    const useLineBounds = targetZone === 'full' || !!targetGroupId;
    const groupBounds = useLineBounds && targetZoneSlots.length > 0
      ? {
          startX: Math.min(...targetZoneSlots.map((slot) => slot.x)),
          endX: Math.max(...targetZoneSlots.map((slot) => slot.x + slot.width))
        }
      : {
          startX: bounds.startX + (spaceInfo.width || 0) / 2,
          endX: bounds.endX + (spaceInfo.width || 0) / 2
        };

    const otherConfirmedWidth = targetZoneSlots
      .filter((slot) => slot.id !== slotId && slot.confirmed)
      .reduce((sum, slot) => sum + slot.width, 0);
    const unconfirmedCountAfterCommit = targetZoneSlots.filter((slot) => slot.id !== slotId && !slot.confirmed).length;
    const groupWidth = Math.max(0, groupBounds.endX - groupBounds.startX);
    const maxTargetWidth = Math.max(minSlotWidth, groupWidth - otherConfirmedWidth - (unconfirmedCountAfterCommit * minSlotWidth));
    const confirmedTargetWidth = Math.min(Math.max(minSlotWidth, widthValue), maxTargetWidth);

    const slotsWithTargetConfirmed = targetZoneSlots.map((slot) => (
      slot.id === slotId
        ? { ...slot, width: confirmedTargetWidth, confirmed: true }
        : slot
    ));
    const confirmedWidth = slotsWithTargetConfirmed
      .filter((slot) => slot.confirmed)
      .reduce((sum, slot) => sum + slot.width, 0);
    const unconfirmedSlots = slotsWithTargetConfirmed.filter((slot) => !slot.confirmed);
    const redistributedWidth = unconfirmedSlots.length > 0
      ? Math.max(minSlotWidth, (groupWidth - confirmedWidth) / unconfirmedSlots.length)
      : 0;

    let cursorX = groupBounds.startX;
    const nextZoneSlots = slotsWithTargetConfirmed.map((slot, index) => {
      const width = slot.confirmed ? slot.width : redistributedWidth;
      const nextSlot = { ...slot, index, x: cursorX, width };
      cursorX += width;
      return nextSlot;
    });

    const nextSlots = sourceSlots
      .filter((slot) => !isSameGuideLine(slot, targetZone, targetGroupId))
      .concat(nextZoneSlots)
      .sort((a, b) => {
        const zoneOrder = { full: 0, upper: 1, lower: 2 };
        return zoneOrder[a.guideZone || 'full'] - zoneOrder[b.guideZone || 'full'] || a.index - b.index;
      });

    setSpaceInfo({ freePlacementGuides: nextSlots });
  };

  const normalizeFreeGuideSlots = (sourceSlots: FreePlacementGuideSlot[], guideZone?: 'full' | 'upper' | 'lower', guideGroupId?: string): FreePlacementGuideSlot[] => {
    if (sourceSlots.length === 0) return [];

    const targetZone = guideZone || sourceSlots[0]?.guideZone || 'full';
    const targetSeedSlot = sourceSlots.find((slot) => (slot.guideZone || 'full') === targetZone);
    const targetGroupId = guideGroupId ?? targetSeedSlot?.guideGroupId;
    const targetZoneSlots = sourceSlots.filter((slot) => isSameGuideLine(slot, targetZone, targetGroupId));
    const otherSlots = sourceSlots.filter((slot) => !isSameGuideLine(slot, targetZone, targetGroupId));
    const bounds = getFreePlacementGuideBoundsX(spaceInfo);
    const useLineBounds = targetZone === 'full' || !!targetGroupId;
    const groupBounds = useLineBounds && targetZoneSlots.length > 0
      ? {
          startX: Math.min(...targetZoneSlots.map((slot) => slot.x)),
          endX: Math.max(...targetZoneSlots.map((slot) => slot.x + slot.width))
        }
      : {
          startX: bounds.startX + (spaceInfo.width || 0) / 2,
          endX: bounds.endX + (spaceInfo.width || 0) / 2
        };
    const totalGuideWidth = Math.max(0, groupBounds.endX - groupBounds.startX);
    const minSlotWidth = 1;
    const sortedSlots = [...targetZoneSlots].sort((a, b) => a.index - b.index);
    const unconfirmedCount = sortedSlots.filter((slot) => !slot.confirmed).length;
    const confirmedWidth = sortedSlots
      .filter((slot) => slot.confirmed)
      .reduce((sum, slot) => sum + slot.width, 0);
    const maxConfirmedWidth = Math.max(0, totalGuideWidth - (unconfirmedCount * minSlotWidth));
    const confirmedScale = confirmedWidth > maxConfirmedWidth && confirmedWidth > 0
      ? maxConfirmedWidth / confirmedWidth
      : 1;
    const scaledConfirmedWidth = sortedSlots
      .filter((slot) => slot.confirmed)
      .reduce((sum, slot) => sum + (slot.width * confirmedScale), 0);
    const redistributedWidth = unconfirmedCount > 0
      ? Math.max(minSlotWidth, (totalGuideWidth - scaledConfirmedWidth) / unconfirmedCount)
      : 0;

    let cursorX = groupBounds.startX;

    const normalizedSlots = sortedSlots.map((slot, index) => {
      const width = slot.confirmed
        ? Math.max(minSlotWidth, slot.width * confirmedScale)
        : redistributedWidth;
      const nextSlot = {
        ...slot,
        index,
        x: cursorX,
        width,
        guideZone: targetZone,
        guideGroupId: targetGroupId || undefined
      };
      cursorX += width;
      return nextSlot;
    });

    return otherSlots
      .concat(normalizedSlots)
      .sort((a, b) => {
        const zoneOrder = { full: 0, upper: 1, lower: 2 };
        return zoneOrder[a.guideZone || 'full'] - zoneOrder[b.guideZone || 'full'] || a.index - b.index;
      });
  };

  const addFreeGuideSlot = (slotId: string) => {
    const sourceSlots = spaceInfo.freePlacementGuides || [];
    if (sourceSlots.length >= 30) return;
    const targetSlot = sourceSlots.find((slot) => slot.id === slotId);
    if (!targetSlot) return;
    const targetZone = targetSlot?.guideZone || 'full';
    const targetGroupId = targetSlot?.guideGroupId;
    const targetZoneSlots = sourceSlots
      .filter((slot) => isSameGuideLine(slot, targetZone, targetGroupId))
      .sort((a, b) => a.x - b.x);
    if (targetZoneSlots.length === 0) return;
    const guideBounds = getFreePlacementGuideBoundsX(spaceInfo);
    const useLineBounds = targetZone === 'full' || !!targetGroupId;
    const groupStartX = useLineBounds
      ? Math.min(...targetZoneSlots.map((slot) => slot.x))
      : guideBounds.startX + (spaceInfo.width || 0) / 2;
    const groupEndX = useLineBounds
      ? Math.max(...targetZoneSlots.map((slot) => slot.x + slot.width))
      : guideBounds.endX + (spaceInfo.width || 0) / 2;
    const groupWidth = Math.max(0, groupEndX - groupStartX);
    const nextCount = targetZoneSlots.length + 1;
    const nextWidth = groupWidth / nextCount;

    const nextSlot: FreePlacementGuideSlot = {
      id: `free-guide-${Date.now()}`,
      index: nextCount - 1,
      x: groupStartX + nextWidth * (nextCount - 1),
      width: nextWidth,
      guideZone: targetZone,
      guideGroupId: targetGroupId || undefined,
      confirmed: false
    };
    const nextTargetSlots = [...targetZoneSlots, nextSlot].map((slot, index) => ({
      ...slot,
      index,
      x: groupStartX + nextWidth * index,
      width: nextWidth,
      guideGroupId: targetGroupId || undefined,
      confirmed: false
    }));
    const otherSlots = sourceSlots.filter((slot) => !isSameGuideLine(slot, targetZone, targetGroupId));

    setSpaceInfo({
      freePlacementGuides: otherSlots
        .concat(nextTargetSlots)
        .sort((a, b) => {
          const zoneOrder = { full: 0, upper: 1, lower: 2 };
          return zoneOrder[a.guideZone || 'full'] - zoneOrder[b.guideZone || 'full'] || a.index - b.index;
        })
    });
  };

  const removeFreeGuideSlot = (slotId: string) => {
    const sourceSlots = spaceInfo.freePlacementGuides || [];
    const targetSlot = sourceSlots.find((slot) => slot.id === slotId);
    const targetZone = targetSlot?.guideZone || 'full';
    const targetGroupId = targetSlot?.guideGroupId;
    const targetZoneSlots = sourceSlots
      .filter((slot) => isSameGuideLine(slot, targetZone, targetGroupId))
      .sort((a, b) => a.x - b.x);
    const sameAreaSlots = sourceSlots.filter((slot) => (slot.guideZone || 'full') === targetZone);
    if (sameAreaSlots.length <= 1) return;
    if (targetZoneSlots.length <= 1) {
      setMergeSelectedSlotIds((selectedIds) => selectedIds.filter((id) => id !== slotId));
      setSpaceInfo({
        freePlacementGuides: sortFreeGuideSlots(sourceSlots.filter((slot) => slot.id !== slotId))
      });
      return;
    }
    const guideBounds = getFreePlacementGuideBoundsX(spaceInfo);
    const useLineBounds = targetZone === 'full' || !!targetGroupId;
    const groupStartX = useLineBounds
      ? Math.min(...targetZoneSlots.map((slot) => slot.x))
      : guideBounds.startX + (spaceInfo.width || 0) / 2;
    const groupEndX = useLineBounds
      ? Math.max(...targetZoneSlots.map((slot) => slot.x + slot.width))
      : guideBounds.endX + (spaceInfo.width || 0) / 2;
    const groupWidth = Math.max(0, groupEndX - groupStartX);
    const remainingTargetSlots = targetZoneSlots.filter((slot) => slot.id !== slotId);
    const nextWidth = groupWidth / remainingTargetSlots.length;
    const nextTargetSlots = remainingTargetSlots.map((slot, index) => ({
      ...slot,
      index,
      x: groupStartX + nextWidth * index,
      width: nextWidth,
      guideGroupId: targetGroupId || undefined,
      confirmed: false
    }));
    const otherSlots = sourceSlots.filter((slot) => !isSameGuideLine(slot, targetZone, targetGroupId));

    setSpaceInfo({
      freePlacementGuides: otherSlots
        .concat(nextTargetSlots)
        .sort((a, b) => {
          const zoneOrder = { full: 0, upper: 1, lower: 2 };
          return zoneOrder[a.guideZone || 'full'] - zoneOrder[b.guideZone || 'full'] || a.index - b.index;
        })
    });
  };

  const splitFreeGuideSlot = (slotId: string) => {
    const sourceSlots = spaceInfo.freePlacementGuides || [];
    const targetSlot = sourceSlots.find((slot) => slot.id === slotId);
    if (!targetSlot || (targetSlot.guideZone || 'full') !== 'full') return;
    const guideGroupId = targetSlot.guideGroupId || targetSlot.id;

    const baseSlot = {
      index: 0,
      x: targetSlot.x,
      width: targetSlot.width,
      confirmed: targetSlot.confirmed,
      guideGroupId
    };
    const upperSlot: FreePlacementGuideSlot = {
      ...baseSlot,
      id: `${targetSlot.id}-upper-${Date.now()}`,
      guideZone: 'upper'
    };
    const lowerSlot: FreePlacementGuideSlot = {
      ...baseSlot,
      id: `${targetSlot.id}-lower-${Date.now()}`,
      guideZone: 'lower'
    };
    const nextSlots = sourceSlots
      .filter((slot) => slot.id !== slotId)
      .concat([upperSlot, lowerSlot]);

    setSpaceInfo({
      freePlacementGuides: nextSlots
    });
  };

  const sortFreeGuideSlots = (slots: FreePlacementGuideSlot[]) => slots.sort((a, b) => {
    const zoneOrder = { full: 0, upper: 1, lower: 2 };
    return zoneOrder[a.guideZone || 'full'] - zoneOrder[b.guideZone || 'full']
      || a.x - b.x
      || a.index - b.index;
  });

  const getGuideLineBounds = (slot: FreePlacementGuideSlot, sourceSlots: FreePlacementGuideSlot[]) => {
    const bounds = getFreePlacementGuideBoundsX(spaceInfo);
    const targetZone = slot.guideZone || 'full';
    const targetGroupId = slot.guideGroupId;
    const lineSlots = sourceSlots.filter((item) => isSameGuideLine(item, targetZone, targetGroupId));
    const useLineBounds = targetZone === 'full' || !!targetGroupId;

    if (useLineBounds && lineSlots.length > 0) {
      return {
        startX: Math.min(...lineSlots.map((item) => item.x)),
        endX: Math.max(...lineSlots.map((item) => item.x + item.width))
      };
    }

    return {
      startX: bounds.startX + (spaceInfo.width || 0) / 2,
      endX: bounds.endX + (spaceInfo.width || 0) / 2
    };
  };

  const redistributeSlotsAroundMergedWidth = (
    slots: FreePlacementGuideSlot[],
    zone: 'upper' | 'lower',
    baseStartX: number,
    baseEndX: number,
    mergedStartX: number,
    mergedEndX: number,
    groupSeed: string
  ) => {
    const leftSlots = slots.filter((slot) => slot.x + slot.width / 2 < mergedStartX);
    const rightSlots = slots.filter((slot) => slot.x + slot.width / 2 >= mergedStartX);
    const makeSegmentSlots = (
      segmentSlots: FreePlacementGuideSlot[],
      startX: number,
      endX: number,
      suffix: 'left' | 'right'
    ) => {
      const segmentWidth = Math.max(0, endX - startX);
      if (segmentSlots.length === 0 || segmentWidth <= 0) return [];
      const slotWidth = segmentWidth / segmentSlots.length;
      return segmentSlots
        .sort((a, b) => a.x - b.x)
        .map((slot, index) => ({
          ...slot,
          index,
          x: startX + slotWidth * index,
          width: slotWidth,
          guideZone: zone,
          guideGroupId: `${groupSeed}-${zone}-${suffix}`,
          confirmed: false
        }));
    };

    return [
      ...makeSegmentSlots(leftSlots, baseStartX, mergedStartX, 'left'),
      ...makeSegmentSlots(rightSlots, mergedEndX, baseEndX, 'right')
    ];
  };

  const mergeFreeGuideSlots = (slotIdA: string, slotIdB: string) => {
    const sourceSlots = spaceInfo.freePlacementGuides || [];
    const first = sourceSlots.find((slot) => slot.id === slotIdA);
    const second = sourceSlots.find((slot) => slot.id === slotIdB);
    if (!first || !second) return;

    const firstZone = first.guideZone || 'full';
    const secondZone = second.guideZone || 'full';
    if (
      !(
        (firstZone === 'upper' && secondZone === 'lower')
        || (firstZone === 'lower' && secondZone === 'upper')
      )
    ) return;

    const upperSlot = firstZone === 'upper' ? first : second;
    const lowerSlot = firstZone === 'lower' ? first : second;
    const widerSlot = upperSlot.width >= lowerSlot.width ? upperSlot : lowerSlot;
    const mergedStartX = widerSlot.x;
    const mergedWidth = widerSlot.width;
    const mergedEndX = mergedStartX + mergedWidth;
    const upperBounds = getGuideLineBounds(upperSlot, sourceSlots);
    const lowerBounds = getGuideLineBounds(lowerSlot, sourceSlots);
    const baseStartX = Math.min(upperBounds.startX, lowerBounds.startX);
    const baseEndX = Math.max(upperBounds.endX, lowerBounds.endX);
    const groupSeed = `free-guide-merged-${Date.now()}`;

    const upperLineSlots = sourceSlots
      .filter((slot) => isSameGuideLine(slot, 'upper', upperSlot.guideGroupId))
      .filter((slot) => slot.id !== upperSlot.id);
    const lowerLineSlots = sourceSlots
      .filter((slot) => isSameGuideLine(slot, 'lower', lowerSlot.guideGroupId))
      .filter((slot) => slot.id !== lowerSlot.id);
    const consumedSlotIds = new Set([
      upperSlot.id,
      lowerSlot.id,
      ...sourceSlots
        .filter((slot) => isSameGuideLine(slot, 'upper', upperSlot.guideGroupId))
        .map((slot) => slot.id),
      ...sourceSlots
        .filter((slot) => isSameGuideLine(slot, 'lower', lowerSlot.guideGroupId))
        .map((slot) => slot.id)
    ]);
    const mergedSlot: FreePlacementGuideSlot = {
      id: groupSeed,
      index: 0,
      x: mergedStartX,
      width: mergedWidth,
      guideZone: 'full',
      confirmed: false
    };

    const nextSlots = [
      ...sourceSlots.filter((slot) => !consumedSlotIds.has(slot.id)),
      mergedSlot,
      ...redistributeSlotsAroundMergedWidth(
        upperLineSlots,
        'upper',
        baseStartX,
        baseEndX,
        mergedStartX,
        mergedEndX,
        groupSeed
      ),
      ...redistributeSlotsAroundMergedWidth(
        lowerLineSlots,
        'lower',
        baseStartX,
        baseEndX,
        mergedStartX,
        mergedEndX,
        groupSeed
      )
    ];

    setMergeSelectedSlotIds([]);
    setSpaceInfo({ freePlacementGuides: sortFreeGuideSlots(nextSlots) });
  };

  const toggleMergeSelect = (slotId: string) => {
    const sourceSlots = spaceInfo.freePlacementGuides || [];
    const targetSlot = sourceSlots.find((slot) => slot.id === slotId);
    if (!targetSlot) return;
    const targetZone = targetSlot.guideZone || 'full';
    if (targetZone !== 'upper' && targetZone !== 'lower') return;

    if (mergeSelectedSlotIds.includes(slotId)) {
      setMergeSelectedSlotIds(mergeSelectedSlotIds.filter((id) => id !== slotId));
      return;
    }

    const oppositeSlotId = mergeSelectedSlotIds.find((id) => {
      const slot = sourceSlots.find((item) => item.id === id);
      const zone = slot?.guideZone || 'full';
      return targetZone === 'upper' ? zone === 'lower' : zone === 'upper';
    });

    if (oppositeSlotId) {
      mergeFreeGuideSlots(slotId, oppositeSlotId);
      return;
    }

    setMergeSelectedSlotIds([
      ...mergeSelectedSlotIds.filter((id) => {
        const slot = sourceSlots.find((item) => item.id === id);
        const zone = slot?.guideZone || 'full';
        return zone !== targetZone;
      }),
      slotId
    ]);
  };

  const editFreeGuideSlotWidth = (slotId: string) => {
    setSpaceInfo({
      freePlacementGuides: (spaceInfo.freePlacementGuides || []).map((slot) => (
        slot.id === slotId ? { ...slot, confirmed: false } : slot
      ))
    });
  };

  if (isGuidePlacementMode) {
    const guideSlots = (spaceInfo.freePlacementGuides || []).map((slot) => ({
      ...slot,
      guideZone: slot.guideZone || 'full' as const
    }));
    if (guideSlots.length === 0 || (viewMode === '2D' && view2DDirection !== 'front')) {
      return null;
    }

    const fullHeightMm = spaceInfo.height;
    const fullHeight = fullHeightMm * 0.01;
    const hasSplitSlots = guideSlots.some((slot) => slot.guideZone === 'upper' || slot.guideZone === 'lower');

    // ── 가이드 상하분할 5단 높이 (mm) ──
    // 전체 = 몰딩 + 상부장 + 미드웨이 + 하부장 + 걸레받이 (전체 고정)
    // 상단몰딩/걸레받이는 우측바와 연동되도록 frameSize.top / baseConfig.height 사용
    const gTopMolding = spaceInfo.frameSize?.top ?? 0;
    const gBaseboard = spaceInfo.baseConfig?.height ?? 0;
    const gLower = spaceInfo.guideLowerHeight ?? 800;
    const gUpperRaw = spaceInfo.guideUpperHeight ?? 700;
    // 미드웨이 = 전체 - 몰딩 - 상부장 - 하부장 - 걸레받이 (나머지 흡수)
    const gMidway = Math.max(0, Math.round(fullHeightMm - gTopMolding - gUpperRaw - gLower - gBaseboard));
    const gUpper = gUpperRaw;

    // 바닥(0)부터의 누적 경계 (mm): 걸레받이→하부장→미드웨이→상부장→몰딩
    const yBaseTop = gBaseboard;                  // 걸레받이 상단
    const yLowerTop = yBaseTop + gLower;          // 하부장 상단 (= 하부 슬롯 영역 상단)
    const yMidTop = yLowerTop + gMidway;          // 미드웨이 상단 (= 상부 슬롯 영역 하단)
    const yUpperTop = yMidTop + gUpper;           // 상부장 상단 (= 몰딩 하단)
    // mm → three units
    const lowerStartY = yBaseTop * 0.01;
    const lowerEndY = yLowerTop * 0.01;
    const upperStartY = yMidTop * 0.01;
    const upperEndY = yUpperTop * 0.01;
    const splitY = (yLowerTop + yMidTop) / 2 * 0.01; // 미드웨이 중앙 (분할선 표시용)

    const getSlotYRange = (slot: FreePlacementGuideSlot): [number, number] => {
      const zone = slot.guideZone || 'full';
      if (zone === 'upper') return [upperStartY, upperEndY];
      if (zone === 'lower') return [lowerStartY, lowerEndY];
      return [0, fullHeight];
    };
    const getSlotControlY = (slot: FreePlacementGuideSlot) => {
      const [startY, endY] = getSlotYRange(slot);
      return (startY + endY) / 2;
    };
    const getSlotLabelY = (slot: FreePlacementGuideSlot) => {
      const zone = slot.guideZone || 'full';
      if (zone === 'upper' && hasSplitSlots) return fullHeight + 0.28;
      if (zone === 'lower' && hasSplitSlots) return -0.28;
      return fullHeight + 0.28;
    };
    const guideZ = 0.006;
    const guideColor = colors.primary || '#3b82f6';
    const isGuideEditing = spaceInfo.freePlacementGuideEditing === true;
    const guideBounds = getFreePlacementGuideBoundsX(spaceInfo);
    const guideEndX = guideBounds.endX + spaceInfo.width / 2;
    const lastSlotEndX = Math.max(...guideSlots.map((slot) => slot.x + slot.width));
    const remainingFreeWidth = Math.max(0, guideEndX - lastSlotEndX);
    const remainingFreeLabelX = lastSlotEndX + remainingFreeWidth / 2;
    const unconfirmedSummaryKeys = Array.from(new Set(
      guideSlots
        .filter((slot) => !slot.confirmed)
        .map((slot) => {
          const zone = slot.guideZone || 'full';
          return `${zone}:${zone === 'full' ? (slot.guideGroupId || '') : ''}`;
        })
    ));
    const unconfirmedSummaries = unconfirmedSummaryKeys.map((key) => {
      const [zone, groupId] = key.split(':') as ['full' | 'upper' | 'lower', string];
      const slotsForZone = guideSlots.filter((slot) => (
        isSameGuideLine(slot, zone, groupId || undefined)
        && !slot.confirmed
      ));
      const totalWidth = slotsForZone.reduce((sum, slot) => sum + slot.width, 0);
      const labelX = slotsForZone.length > 0
        ? (
          Math.min(...slotsForZone.map((slot) => slot.x))
          + Math.max(...slotsForZone.map((slot) => slot.x + slot.width))
        ) / 2
        : 0;

      return {
        zone,
        groupId,
        totalWidth,
        labelX,
        labelY: zone === 'upper' && hasSplitSlots
          ? fullHeight + 0.28
          : zone === 'lower' && hasSplitSlots
            ? -0.28
            : fullHeight + 0.28
      };
    });
    const splitLineSegments = hasSplitSlots ? (() => {
      const segments = guideSlots
        .filter((slot) => {
          const zone = slot.guideZone || 'full';
          return zone === 'upper' || zone === 'lower';
        })
        .map((slot) => ({
          startX: slot.x,
          endX: slot.x + slot.width
        }))
        .sort((a, b) => a.startX - b.startX);

      return segments.reduce<Array<{ startX: number; endX: number }>>((mergedSegments, segment) => {
        const lastSegment = mergedSegments[mergedSegments.length - 1];
        if (!lastSegment || segment.startX > lastSegment.endX + 0.5) {
          mergedSegments.push({ ...segment });
          return mergedSegments;
        }

        lastSegment.endX = Math.max(lastSegment.endX, segment.endX);
        return mergedSegments;
      }, []);
    })() : [];
    const canUseGuideSlot = (slot: FreePlacementGuideSlot) => {
      const zone = slot.guideZone || 'full';
      if (zone === 'full') return true;
      return selectedModuleData?.category === zone;
    };
    const occupiedGuideBounds = placedModules
      .filter((module) => module.isFreePlacement && !module.isSurroundPanel)
      .map(getModuleBoundsX)
      .concat(getColumnObstacleBoundsX(spaceInfo.columns || []));
    const isGuideSlotOccupied = (slot: FreePlacementGuideSlot) => {
      const zone = slot.guideZone || 'full';
      const slotLeft = slot.x - spaceInfo.width / 2;
      const slotRight = slot.x + slot.width - spaceInfo.width / 2;

      return occupiedGuideBounds.some((bounds) => {
        const overlaps = bounds.left < slotRight - 0.5 && bounds.right > slotLeft + 0.5;
        if (!overlaps) return false;

        const canCoexist =
          (zone === 'upper' && bounds.category === 'lower') ||
          (zone === 'lower' && bounds.category === 'upper');

        return !canCoexist;
      });
    };

    // ── 상하분할 5단 높이 치수 편집기 (좌/우 가장자리) ──
    const spaceHalfWidth = spaceInfo.width / 2;
    const heightTiers = [
      { key: 'molding', label: '상단몰딩', value: gTopMolding, centerYmm: (yUpperTop + fullHeightMm) / 2 },
      { key: 'upper', label: '상부장', value: gUpper, centerYmm: (yMidTop + yUpperTop) / 2 },
      { key: 'midway', label: '미드웨이', value: gMidway, centerYmm: (yLowerTop + yMidTop) / 2 },
      { key: 'lower', label: '하부장', value: gLower, centerYmm: (yBaseTop + yLowerTop) / 2 },
      { key: 'baseboard', label: '걸레받이', value: gBaseboard, centerYmm: yBaseTop / 2 },
    ];
    const commitTier = (key: string, raw: string) => {
      const v = Math.round(parseFloat(raw));
      if (!Number.isFinite(v) || v < 0) return;
      if (key === 'molding') setSpaceInfo({ frameSize: { ...(spaceInfo.frameSize as any), top: v } });
      else if (key === 'lower') setSpaceInfo({ guideLowerHeight: v });
      else if (key === 'baseboard') setSpaceInfo({ baseConfig: { ...(spaceInfo.baseConfig as any), height: v } });
      else if (key === 'upper') setSpaceInfo({ guideUpperHeight: v });
      else if (key === 'midway') {
        // 미드웨이 변경 → 상부장이 흡수
        const newUpper = Math.max(0, Math.round(fullHeightMm - gTopMolding - v - gLower - gBaseboard));
        setSpaceInfo({ guideUpperHeight: newUpper });
      }
    };
    const tierEditorStyle: React.CSSProperties = {
      width: 56, padding: '3px 4px', fontSize: 13, fontWeight: 700, textAlign: 'center',
      border: `2px solid ${guideColor}`, borderRadius: 5, outline: 'none',
      background: 'rgba(255,255,255,0.97)', color: guideColor, lineHeight: 1.1,
    };
    const renderHeightTiers = (sideX: number) =>
      heightTiers.map((tier) => (
        <Html
          key={`guide-tier-${tier.key}-${sideX > 0 ? 'r' : 'l'}`}
          position={[sideX, tier.centerYmm * 0.01, guideZ]}
          center
          zIndexRange={[200, 0]}
          style={{ pointerEvents: 'auto', userSelect: 'none' }}
        >
          <input
            type="number"
            defaultValue={Math.round(tier.value)}
            key={`${tier.key}-${Math.round(tier.value)}`}
            min={0}
            onPointerDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            onBlur={(e) => commitTier(tier.key, e.target.value)}
            style={tierEditorStyle}
          />
        </Html>
      ));

    // 5단 경계 가로선 Y (mm): 바닥 / 걸레받이상단 / 하부장상단 / 미드웨이상단 / 상부장상단 / 천장
    const tierBoundaryYmm = [0, yBaseTop, yLowerTop, yMidTop, yUpperTop, fullHeightMm];
    const tierLineLeftX = -spaceHalfWidth * 0.01;
    const tierLineRightX = spaceHalfWidth * 0.01;
    const renderTierLines = () =>
      tierBoundaryYmm.map((ymm, i) => (
        <NativeLine
          key={`guide-tier-line-${i}`}
          name="free-placement-guide-line"
          points={[[tierLineLeftX, ymm * 0.01, guideZ], [tierLineRightX, ymm * 0.01, guideZ]]}
          color={guideColor}
          lineWidth={1.2}
          dashed
          dashSize={0.08}
          gapSize={0.05}
          opacity={0.5}
          transparent
          depthTest={false}
          depthWrite={false}
          renderOrder={100000}
        />
      ));

    return (
      <>
        {hasSplitSlots && renderTierLines()}
        {hasSplitSlots && renderHeightTiers(-(spaceHalfWidth + 120) * 0.01)}
        {hasSplitSlots && renderHeightTiers((spaceHalfWidth + 120) * 0.01)}
        {guideSlots.flatMap((slot) => {
          const [startY, endY] = getSlotYRange(slot);
          const leftX = (slot.x - spaceInfo.width / 2) * 0.01;
          const rightX = (slot.x + slot.width - spaceInfo.width / 2) * 0.01;

          return [
            <NativeLine
              key={`free-guide-boundary-left-${slot.id}`}
              name="free-placement-guide-line"
              points={[
                [leftX, startY, guideZ],
                [leftX, endY, guideZ]
              ]}
              color={guideColor}
              lineWidth={1.2}
              dashed
              dashSize={0.08}
              gapSize={0.05}
              opacity={0.42}
              transparent
              depthTest={false}
              depthWrite={false}
              renderOrder={100000}
            />,
            <NativeLine
              key={`free-guide-boundary-right-${slot.id}`}
              name="free-placement-guide-line"
              points={[
                [rightX, startY, guideZ],
                [rightX, endY, guideZ]
              ]}
              color={guideColor}
              lineWidth={1.2}
              dashed
              dashSize={0.08}
              gapSize={0.05}
              opacity={0.42}
              transparent
              depthTest={false}
              depthWrite={false}
              renderOrder={100000}
            />
          ];
        })}

        {/* 미드웨이 중앙 분할선 제거: 5단 경계선(renderTierLines)이 미드웨이 위/아래 경계를 이미 표시 */}
        {!hasSplitSlots && splitLineSegments.map((segment, index) => (
          <NativeLine
            key={`free-guide-split-line-${index}`}
            name="free-placement-guide-line"
            points={[
              [(segment.startX - spaceInfo.width / 2) * 0.01, splitY, guideZ],
              [(segment.endX - spaceInfo.width / 2) * 0.01, splitY, guideZ]
            ]}
            color={guideColor}
            lineWidth={1.2}
            dashed
            dashSize={0.08}
            gapSize={0.05}
            opacity={0.5}
            transparent
            depthTest={false}
            depthWrite={false}
            renderOrder={100000}
          />
        ))}

        {guideSlots.map((slot) => {
          if (!slot.confirmed) return null;

          const centerX = (slot.x + slot.width / 2 - spaceInfo.width / 2) * 0.01;

          return (
            <Html
              key={`free-guide-top-width-${slot.id}`}
              position={[centerX, getSlotLabelY(slot), 0]}
              center
              style={{
                pointerEvents: 'none',
                userSelect: 'none',
                background: 'transparent'
              }}
            >
              <div
                style={{
                  color: 'var(--theme-text)',
                  fontSize: '11px',
                  fontWeight: 900,
                  lineHeight: '1',
                  fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'nowrap',
                  textShadow: '0 1px 2px var(--theme-background), 0 -1px 2px var(--theme-background)'
                }}
              >
                {Math.round(slot.width)}
              </div>
            </Html>
          );
        })}

        {unconfirmedSummaries.map((summary) => summary.totalWidth > 0 && (
          <Html
            key={`free-guide-unconfirmed-${summary.zone}`}
            position={[(summary.labelX - spaceInfo.width / 2) * 0.01, summary.labelY, 0]}
            center
            style={{
              pointerEvents: 'none',
              userSelect: 'none',
              background: 'transparent'
            }}
          >
            <div
              style={{
                height: '20px',
                padding: '0 7px',
                borderRadius: '6px',
                border: '1px solid rgba(148, 163, 184, 0.45)',
                background: 'color-mix(in srgb, var(--theme-background) 86%, #64748b 14%)',
                color: 'var(--theme-text-muted)',
                boxShadow: '0 1px 4px rgba(15, 23, 42, 0.12)',
                fontSize: '10px',
                fontWeight: 800,
                lineHeight: '18px',
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap'
              }}
            >
              {Math.round(summary.totalWidth)}
            </div>
          </Html>
        ))}

        {!hasSplitSlots && remainingFreeWidth > 0.5 && (
          <Html
            position={[(remainingFreeLabelX - spaceInfo.width / 2) * 0.01, fullHeight + 0.28, 0]}
            center
            style={{
              pointerEvents: 'none',
              userSelect: 'none',
              background: 'transparent'
            }}
          >
            <div
              style={{
                height: '20px',
                padding: '0 7px',
                borderRadius: '6px',
                border: '1px solid rgba(148, 163, 184, 0.45)',
                background: 'color-mix(in srgb, var(--theme-background) 86%, #64748b 14%)',
                color: 'var(--theme-text-muted)',
                boxShadow: '0 1px 4px rgba(15, 23, 42, 0.12)',
                fontSize: '10px',
                fontWeight: 800,
                lineHeight: '18px',
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap'
              }}
            >
              {Math.round(remainingFreeWidth)}
            </div>
          </Html>
        )}

        {guideSlots.map((slot) => {
          const centerX = (slot.x + slot.width / 2 - spaceInfo.width / 2) * 0.01;
          const canPlaceInSlot = canUseGuideSlot(slot);
          const canShowPlacementHotspot = !isGuideEditing && !isGuideSlotOccupied(slot) && (!selectedModuleData || canPlaceInSlot);
          const slotZone = slot.guideZone || 'full';
          const sameAreaSlotCount = guideSlots.filter((item) => (item.guideZone || 'full') === slotZone).length;

          return (
            <Html
              key={slot.id}
              position={[centerX, getSlotControlY(slot), 0]}
              center
              style={{
                pointerEvents: 'none',
                userSelect: 'none',
                background: 'transparent'
              }}
            >
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  (window as any).__r3fClickHandled = true;
                  if (!isGuideEditing && canPlaceInSlot) {
                    window.dispatchEvent(new CustomEvent('free-placement-guide:slot-click', { detail: slot }));
                  }
                }}
                onPointerEnter={() => {
                  if (!isGuideEditing && canPlaceInSlot) {
                    window.dispatchEvent(new CustomEvent('free-placement-guide:slot-hover', { detail: slot }));
                  }
                }}
                onPointerLeave={() => {
                  if (!isGuideEditing) {
                    window.dispatchEvent(new CustomEvent('free-placement-guide:slot-leave', { detail: slot }));
                  }
                }}
                style={{
                  display: 'grid',
                  justifyItems: 'center',
                  gap: '4px',
                  pointerEvents: 'auto'
                }}
              >
                {canShowPlacementHotspot && (
                  <button
                    type="button"
                    style={{
                      width: '27px',
                      height: '27px',
                      borderRadius: '50%',
                      background: 'var(--theme-primary)',
                      border: '1.5px solid rgba(255, 255, 255, 0.92)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      boxShadow: '0 3px 10px rgba(15, 23, 42, 0.22)',
                      transition: 'all 0.2s ease',
                      fontSize: '20px',
                      color: 'white',
                      fontWeight: 700,
                      textShadow: '0 1px 2px rgba(0, 0, 0, 0.35)',
                      lineHeight: '1',
                      padding: 0
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.08)';
                      e.currentTarget.style.boxShadow = '0 5px 14px rgba(15, 23, 42, 0.28)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.boxShadow = '0 3px 10px rgba(15, 23, 42, 0.22)';
                    }}
                  >
                    +
                  </button>
                )}
                {isGuideEditing && (
                  <FreeGuideSlotWidthInput
                    slot={slot}
                    onCommit={updateFreeGuideSlotWidth}
                    onEdit={editFreeGuideSlotWidth}
                    onAdd={addFreeGuideSlot}
                    onRemove={removeFreeGuideSlot}
                    onSplit={splitFreeGuideSlot}
                    onToggleMergeSelect={toggleMergeSelect}
                    canRemove={sameAreaSlotCount > 1}
                    canSplit={(slot.guideZone || 'full') === 'full'}
                    canMergeSelect={hasSplitSlots && slotZone !== 'full'}
                    mergeSelected={mergeSelectedSlotIds.includes(slot.id)}
                  />
                )}
              </div>
            </Html>
          );
        })}
      </>
    );
  }

  if (!selectedFurnitureId || !selectedModuleData) {
// console.log('🔵 SlotPlacementIndicators - 렌더링 안함:', { selectedFurnitureId, selectedModuleData: !!selectedModuleData });
    return null;
  }

// console.log('🔵🔵🔵 SlotPlacementIndicators - 아이콘 렌더링:', { availableSlotsCount: availableSlots.length, availableSlots });

  return (
    <>
      {availableSlots.map((slot) => (
        <Html
          key={`slot-indicator-${slot.zone}-${slot.slotIndex}`}
          position={[slot.position.x, slot.position.y, slot.position.z]}
          center
          style={{
            pointerEvents: 'none',
            userSelect: 'none',
            background: 'transparent'
          }}
        >
          <div
            onClick={(e) => {
              e.stopPropagation();
              (window as any).__r3fClickHandled = true;
// console.log('🔵 [SlotIndicators] + 아이콘 클릭:', { slotIndex: slot.slotIndex, zone: slot.zone });
// console.log('🔵 [SlotIndicators] onSlotClick 함수:', onSlotClick);
// console.log('🔵 [SlotIndicators] onSlotClick 호출 시작');
              onSlotClick(slot.slotIndex, slot.zone);
// console.log('🔵 [SlotIndicators] onSlotClick 호출 완료');
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
              animation: 'pulse 0.8s ease-in-out infinite',
              pointerEvents: 'auto'
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
