import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { DoubleSide } from 'three';
import { Plus } from 'lucide-react';
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
import { TOP_END_PANEL_FRONT_OFFSET_DEFAULT_MM } from '@/editor/shared/utils/panelThickness';

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
  onSelect: (slotId: string, range: boolean) => void;
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
  onSelect,
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
        onPointerDown={(e) => {
          onSelect(slot.id, e.shiftKey === true);
          e.stopPropagation();
        }}
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
              aria-label="슬롯 병합 선택"
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
          {Math.round(slot.width)}
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
      onPointerDown={(e) => {
        onSelect(slot.id, e.shiftKey === true);
        e.stopPropagation();
      }}
    >
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          height: '22px',
          padding: 0,
          background: 'transparent',
          color: 'var(--theme-text)',
          fontSize: '11px',
          fontWeight: 700,
          whiteSpace: 'nowrap'
        }}
      >
        {canMergeSelect && (
          <input
            type="checkbox"
            checked={mergeSelected}
            aria-label="슬롯 병합 선택"
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
  const { camera } = useThree();
  const { spaceInfo, setSpaceInfo } = useSpaceConfigStore();
  const { selectedFurnitureId, placedModules, updatePlacedModule } = useFurnitureStore();
  const {
    view2DTheme,
    viewMode,
    activePlacementWall,
    view2DDirection,
    guideDepthEditMode,
    guideDepthZone,
    selectedFurnitureId: uiSelectedFurnitureId,
    selectedFurnitureIds,
    activePopup
  } = useUIStore();
  const { pendingPlacement } = useMyCabinetStore();
  const { colors } = useThemeColors();
  const [mergeSelectedSlotIds, setMergeSelectedSlotIds] = useState<string[]>([]);
  const [selectedGuideSlotIds, setSelectedGuideSlotIds] = useState<string[]>([]);
  const [selectedGuideAnchorSlotId, setSelectedGuideAnchorSlotId] = useState<string | null>(null);
  const depthZone = guideDepthZone;

  const isCustomGuideMode = spaceInfo.customGuideMode === true;
  const isFreePlacement = spaceInfo.layoutMode === 'free-placement';
  const isGuidePlacementMode = isFreePlacement || isCustomGuideMode;
  const shouldScaleGuideHtml = isCustomGuideMode && spaceInfo.freePlacementGuideEditing === true;
  const guideHtmlBaseZoomRef = useRef<number | null>(null);
  const guideHtmlScaleRef = useRef(1);
  const [guideHtmlScale, setGuideHtmlScale] = useState(1);

  useEffect(() => {
    guideHtmlBaseZoomRef.current = null;
    guideHtmlScaleRef.current = 1;
    setGuideHtmlScale(1);
  }, [shouldScaleGuideHtml, viewMode, view2DDirection, guideDepthEditMode]);

  useFrame(() => {
    if (!shouldScaleGuideHtml) return;
    const currentZoom = typeof camera.zoom === 'number' ? camera.zoom : 1;
    if (!Number.isFinite(currentZoom) || currentZoom <= 0) return;
    if (guideHtmlBaseZoomRef.current === null) {
      guideHtmlBaseZoomRef.current = currentZoom;
    }
    const baseZoom = guideHtmlBaseZoomRef.current || currentZoom;
    const nextScale = Math.max(0.45, Math.min(2.2, currentZoom / baseZoom));
    if (Math.abs(nextScale - guideHtmlScaleRef.current) < 0.015) return;
    guideHtmlScaleRef.current = nextScale;
    setGuideHtmlScale(nextScale);
  });

  const guideHtmlScaleStyle = useMemo<React.CSSProperties>(() => (
    shouldScaleGuideHtml
      ? { transform: `scale(${guideHtmlScale})`, transformOrigin: 'center center' }
      : {}
  ), [guideHtmlScale, shouldScaleGuideHtml]);

  useEffect(() => {
    if (selectedGuideSlotIds.length === 0) return;
    const guideSlots = spaceInfo.freePlacementGuides || [];
    const guideSlotIds = new Set(guideSlots.map((slot) => slot.id));
    const nextSelectedIds = selectedGuideSlotIds.filter((id) => guideSlotIds.has(id));
    if (nextSelectedIds.length !== selectedGuideSlotIds.length) {
      setSelectedGuideSlotIds(nextSelectedIds);
    }
    if (selectedGuideAnchorSlotId && !guideSlotIds.has(selectedGuideAnchorSlotId)) {
      setSelectedGuideAnchorSlotId(nextSelectedIds[0] || null);
    }
  }, [selectedGuideAnchorSlotId, selectedGuideSlotIds, spaceInfo.freePlacementGuides]);

  const getGuideSlotRangeIds = (anchorSlotId: string, targetSlotId: string) => {
    const guideSlots = spaceInfo.freePlacementGuides || [];
    const anchorSlot = guideSlots.find((slot) => slot.id === anchorSlotId);
    const targetSlot = guideSlots.find((slot) => slot.id === targetSlotId);

    if (!anchorSlot || !targetSlot) return [targetSlotId];

    const anchorZone = anchorSlot.guideZone || 'full';
    const targetZone = targetSlot.guideZone || 'full';
    const anchorGroupId = anchorSlot.guideGroupId || '';
    const targetGroupId = targetSlot.guideGroupId || '';

    if (anchorZone !== targetZone) {
      return [targetSlotId];
    }

    const lineSlots = guideSlots
      .filter((slot) => (
        (slot.guideZone || 'full') === anchorZone
        && (anchorZone !== 'full' || (slot.guideGroupId || '') === anchorGroupId)
      ))
      .sort((a, b) => a.x - b.x || a.index - b.index);
    const anchorIndex = lineSlots.findIndex((slot) => slot.id === anchorSlotId);
    const targetIndex = lineSlots.findIndex((slot) => slot.id === targetSlotId);

    if (anchorIndex < 0 || targetIndex < 0) return [targetSlotId];

    const startIndex = Math.min(anchorIndex, targetIndex);
    const endIndex = Math.max(anchorIndex, targetIndex);
    return lineSlots.slice(startIndex, endIndex + 1).map((slot) => slot.id);
  };

  const selectGuideSlot = (slotId: string, range = false) => {
    if (!range) {
      setSelectedGuideAnchorSlotId(slotId);
      setSelectedGuideSlotIds([slotId]);
      return;
    }

    const anchorSlotId = selectedGuideAnchorSlotId && selectedGuideSlotIds.includes(selectedGuideAnchorSlotId)
      ? selectedGuideAnchorSlotId
      : selectedGuideSlotIds[selectedGuideSlotIds.length - 1];

    if (!anchorSlotId) {
      setSelectedGuideAnchorSlotId(slotId);
      setSelectedGuideSlotIds([slotId]);
      return;
    }

    const rangeSlotIds = getGuideSlotRangeIds(anchorSlotId, slotId);
    setSelectedGuideSlotIds((current) => Array.from(new Set([...current, ...rangeSlotIds])));
  };

  const applySelectedGuideSlotKeyboardEdit = (action: 'move-left' | 'move-right' | 'grow' | 'shrink', step = 10) => {
    const sourceSlots = spaceInfo.freePlacementGuides || [];
    if (sourceSlots.length === 0 || selectedGuideSlotIds.length === 0) return;

    const selectedIds = new Set(selectedGuideSlotIds);
    const minSlotWidth = 1;
    const nextSlotsById = new Map(sourceSlots.map((slot) => [slot.id, { ...slot, confirmed: true }]));
    const hasSplitSlots = sourceSlots.some((slot) => {
      const zone = slot.guideZone || 'full';
      return zone === 'upper' || zone === 'lower';
    });
    const selectedFullSlots = sourceSlots
      .filter((slot) => selectedIds.has(slot.id) && (slot.guideZone || 'full') === 'full')
      .sort((a, b) => a.x - b.x || a.index - b.index);
    const sortEditedGuideSlots = (slots: FreePlacementGuideSlot[]) => {
      const zoneOrder = { full: 0, upper: 1, lower: 2 };
      return slots.sort((a, b) => (
        zoneOrder[a.guideZone || 'full'] - zoneOrder[b.guideZone || 'full']
        || a.x - b.x
        || a.index - b.index
      ));
    };
    const guideBounds = getFreePlacementGuideBoundsX(spaceInfo);
    const guideStartX = guideBounds.startX + (spaceInfo.width || 0) / 2;
    const guideEndX = guideBounds.endX + (spaceInfo.width || 0) / 2;
    const getEditableLineBounds = (lineSlots: FreePlacementGuideSlot[]) => {
      if (lineSlots.length === 0) return { startX: guideStartX, endX: guideEndX };

      const tolerance = 0.5;
      const lineZone = lineSlots[0]?.guideZone || 'full';
      const lineSlotIds = new Set(lineSlots.map((slot) => slot.id));
      const lineStartX = Math.min(...lineSlots.map((slot) => slot.x));
      const lineEndX = Math.max(...lineSlots.map((slot) => slot.x + slot.width));
      const blocksLine = (slot: FreePlacementGuideSlot) => {
        if (lineSlotIds.has(slot.id)) return false;
        const zone = slot.guideZone || 'full';
        if (lineZone === 'full') return true;
        return zone === 'full' || zone === lineZone;
      };

      const leftBarrierEnd = sourceSlots
        .filter(blocksLine)
        .map((slot) => slot.x + slot.width)
        .filter((endX) => endX <= lineStartX + tolerance)
        .reduce((max, endX) => Math.max(max, endX), guideStartX);
      const rightBarrierStart = sourceSlots
        .filter(blocksLine)
        .map((slot) => slot.x)
        .filter((startX) => startX >= lineEndX - tolerance)
        .reduce((min, startX) => Math.min(min, startX), guideEndX);

      return {
        startX: Math.max(guideStartX, leftBarrierEnd),
        endX: Math.min(guideEndX, rightBarrierStart)
      };
    };

    if (hasSplitSlots && selectedFullSlots.length > 0) {
      const epsilon = 0.5;
      const selectionStartX = Math.min(...selectedFullSlots.map((slot) => slot.x));
      const selectionEndX = Math.max(...selectedFullSlots.map((slot) => slot.x + slot.width));
      const editableBounds = getEditableLineBounds(selectedFullSlots);
      const layoutStartX = editableBounds.startX;
      const layoutEndX = editableBounds.endX;
      const selectedFullIds = new Set(selectedFullSlots.map((slot) => slot.id));
      const leftNeighbors = sourceSlots
        .filter((slot) => !selectedFullIds.has(slot.id))
        .filter((slot) => Math.abs(slot.x + slot.width - selectionStartX) <= epsilon)
        .map((slot) => nextSlotsById.get(slot.id))
        .filter((slot): slot is FreePlacementGuideSlot => !!slot);
      const rightNeighbors = sourceSlots
        .filter((slot) => !selectedFullIds.has(slot.id))
        .filter((slot) => Math.abs(slot.x - selectionEndX) <= epsilon)
        .map((slot) => nextSlotsById.get(slot.id))
        .filter((slot): slot is FreePlacementGuideSlot => !!slot);
      const selectedRangeSlots = selectedFullSlots
        .map((slot) => nextSlotsById.get(slot.id))
        .filter((slot): slot is FreePlacementGuideSlot => !!slot);
      const firstSelected = selectedRangeSlots[0];
      const lastSelected = selectedRangeSlots[selectedRangeSlots.length - 1];

      if (firstSelected && lastSelected && selectedRangeSlots.length > 0) {
        const leftFreeWidth = Math.max(0, selectionStartX - layoutStartX);
        const rightFreeWidth = Math.max(0, layoutEndX - selectionEndX);
        const leftCapacity = leftNeighbors.length > 0
          ? Math.min(...leftNeighbors.map((slot) => Math.max(0, slot.width - minSlotWidth)))
          : leftFreeWidth;
        const rightCapacity = rightNeighbors.length > 0
          ? Math.min(...rightNeighbors.map((slot) => Math.max(0, slot.width - minSlotWidth)))
          : rightFreeWidth;

        if (action === 'move-left') {
          const delta = Math.min(step, leftCapacity);
          if (delta > 0) {
            leftNeighbors.forEach((slot) => {
              slot.width -= delta;
            });
            selectedRangeSlots.forEach((slot) => {
              slot.x -= delta;
            });
            rightNeighbors.forEach((slot) => {
              slot.x -= delta;
              slot.width += delta;
            });
          }
        } else if (action === 'move-right') {
          const delta = Math.min(step, rightCapacity);
          if (delta > 0) {
            leftNeighbors.forEach((slot) => {
              slot.width += delta;
            });
            selectedRangeSlots.forEach((slot) => {
              slot.x += delta;
            });
            rightNeighbors.forEach((slot) => {
              slot.x += delta;
              slot.width -= delta;
            });
          }
        } else if (action === 'grow') {
          if (rightNeighbors.length > 0) {
            const delta = Math.min(step, rightCapacity);
            if (delta > 0) {
              lastSelected.width += delta;
              rightNeighbors.forEach((slot) => {
                slot.x += delta;
                slot.width -= delta;
              });
            }
          } else if (rightFreeWidth > 0) {
            const delta = Math.min(step, rightFreeWidth);
            if (delta > 0) lastSelected.width += delta;
          } else if (leftNeighbors.length > 0) {
            const delta = Math.min(step, leftCapacity);
            if (delta > 0) {
              leftNeighbors.forEach((slot) => {
                slot.width -= delta;
              });
              firstSelected.x -= delta;
              firstSelected.width += delta;
            }
          } else if (leftFreeWidth > 0) {
            const delta = Math.min(step, leftFreeWidth);
            if (delta > 0) {
              firstSelected.x -= delta;
              firstSelected.width += delta;
            }
          }
        } else if (action === 'shrink') {
          const delta = Math.min(step, Math.max(0, lastSelected.width - minSlotWidth));
          if (delta > 0) {
            lastSelected.width -= delta;
            if (rightNeighbors.length > 0) {
              rightNeighbors.forEach((slot) => {
                slot.x -= delta;
                slot.width += delta;
              });
            }
          } else if (leftNeighbors.length > 0) {
            const delta = Math.min(step, Math.max(0, firstSelected.width - minSlotWidth));
            if (delta > 0) {
              leftNeighbors.forEach((slot) => {
                slot.width += delta;
              });
              firstSelected.x += delta;
              firstSelected.width -= delta;
            }
          }
        }
      }

      setSpaceInfo({ freePlacementGuides: sortEditedGuideSlots(Array.from(nextSlotsById.values())) });
      return;
    }
    const lineGroups = new Map<string, FreePlacementGuideSlot[]>();

    sourceSlots.forEach((slot) => {
      const zone = slot.guideZone || 'full';
      const lineKey = zone === 'full' ? `${zone}|${slot.guideGroupId || ''}` : zone;
      const lineSlots = lineGroups.get(lineKey) || [];
      lineSlots.push(slot);
      lineGroups.set(lineKey, lineSlots);
    });

    lineGroups.forEach((lineSlots) => {
      const sortedLineSlots = [...lineSlots].sort((a, b) => a.x - b.x || a.index - b.index);
      const selectedIndexes = sortedLineSlots
        .map((slot, index) => (selectedIds.has(slot.id) ? index : -1))
        .filter((index) => index >= 0);
      if (selectedIndexes.length === 0) return;

      const startIndex = Math.min(...selectedIndexes);
      const endIndex = Math.max(...selectedIndexes);
      const editableBounds = getEditableLineBounds(sortedLineSlots);
      const lineStartX = editableBounds.startX;
      const lineEndX = editableBounds.endX;
      const lineActualStartX = Math.min(...sortedLineSlots.map((slot) => slot.x));
      const lineActualEndX = Math.max(...sortedLineSlots.map((slot) => slot.x + slot.width));
      const leftNeighbor = startIndex > 0 ? nextSlotsById.get(sortedLineSlots[startIndex - 1].id) : null;
      const rightNeighbor = endIndex < sortedLineSlots.length - 1 ? nextSlotsById.get(sortedLineSlots[endIndex + 1].id) : null;
      const firstSelected = nextSlotsById.get(sortedLineSlots[startIndex].id);
      const lastSelected = nextSlotsById.get(sortedLineSlots[endIndex].id);
      const selectedRangeSlots = sortedLineSlots
        .slice(startIndex, endIndex + 1)
        .map((slot) => nextSlotsById.get(slot.id))
        .filter((slot): slot is FreePlacementGuideSlot => !!slot);

      if (!firstSelected || !lastSelected || selectedRangeSlots.length === 0) return;
      const movableLineSlots = sortedLineSlots
        .map((slot) => nextSlotsById.get(slot.id))
        .filter((slot): slot is FreePlacementGuideSlot => !!slot);
      const lineLeftFreeWidth = Math.max(0, lineActualStartX - lineStartX);
      const lineRightFreeWidth = Math.max(0, lineEndX - lineActualEndX);

      if (action === 'move-left' && lineLeftFreeWidth > 0) {
        const delta = Math.min(step, lineLeftFreeWidth);
        movableLineSlots.forEach((slot) => {
          slot.x -= delta;
        });
        return;
      }

      if (action === 'move-right' && lineRightFreeWidth > 0) {
        const delta = Math.min(step, lineRightFreeWidth);
        movableLineSlots.forEach((slot) => {
          slot.x += delta;
        });
        return;
      }

      const selectionStartX = firstSelected.x;
      const selectionEndX = lastSelected.x + lastSelected.width;
      const leftFreeWidth = Math.max(0, selectionStartX - lineStartX);
      const rightFreeWidth = Math.max(0, lineEndX - selectionEndX);
      const leftCapacity = leftNeighbor
        ? Math.max(0, leftNeighbor.width - minSlotWidth)
        : leftFreeWidth;
      const rightCapacity = rightNeighbor
        ? Math.max(0, rightNeighbor.width - minSlotWidth)
        : rightFreeWidth;

      if (action === 'move-left') {
        const delta = Math.min(step, leftCapacity);
        if (delta <= 0) return;

        if (leftNeighbor) leftNeighbor.width -= delta;
        selectedRangeSlots.forEach((slot) => {
          slot.x -= delta;
        });
        if (rightNeighbor) {
          rightNeighbor.x -= delta;
          rightNeighbor.width += delta;
        }
        return;
      }

      if (action === 'move-right') {
        const delta = Math.min(step, rightCapacity);
        if (delta <= 0) return;

        if (leftNeighbor) leftNeighbor.width += delta;
        selectedRangeSlots.forEach((slot) => {
          slot.x += delta;
        });
        if (rightNeighbor) {
          rightNeighbor.x += delta;
          rightNeighbor.width -= delta;
        }
        return;
      }

      if (action === 'grow') {
        if (rightNeighbor) {
          const delta = Math.min(step, rightCapacity);
          if (delta <= 0) return;

          lastSelected.width += delta;
          rightNeighbor.x += delta;
          rightNeighbor.width -= delta;
          return;
        }

        if (rightFreeWidth > 0) {
          const delta = Math.min(step, rightFreeWidth);
          if (delta <= 0) return;
          lastSelected.width += delta;
          return;
        }

        const delta = Math.min(step, leftCapacity);
        if (delta <= 0) return;

        if (leftNeighbor) leftNeighbor.width -= delta;
        firstSelected.x -= delta;
        firstSelected.width += delta;
        return;
      }

      const delta = Math.min(step, Math.max(0, lastSelected.width - minSlotWidth));
      if (delta > 0) {
        lastSelected.width -= delta;
        if (!rightNeighbor) return;
        rightNeighbor.x -= delta;
        rightNeighbor.width += delta;
        return;
      }

      if (!leftNeighbor) return;
      const leftDelta = Math.min(step, Math.max(0, firstSelected.width - minSlotWidth));
      if (leftDelta <= 0) return;

      leftNeighbor.width += leftDelta;
      firstSelected.x += leftDelta;
      firstSelected.width -= leftDelta;
    });

    setSpaceInfo({
      freePlacementGuides: sortEditedGuideSlots(Array.from(nextSlotsById.values()))
    });
  };

  useEffect(() => {
    const isGuideEditing = spaceInfo.freePlacementGuideEditing === true;
    if (!isGuideEditing || selectedGuideSlotIds.length === 0 || typeof window === 'undefined') return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea' || target?.isContentEditable) return;

      const step = event.shiftKey ? 10 : 1;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        applySelectedGuideSlotKeyboardEdit('move-left', step);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        applySelectedGuideSlotKeyboardEdit('move-right', step);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        applySelectedGuideSlotKeyboardEdit('grow', step);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        applySelectedGuideSlotKeyboardEdit('shrink', step);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedGuideSlotIds, spaceInfo.freePlacementGuideEditing, spaceInfo.freePlacementGuides]);

  if (viewMode === '3D' && activePlacementWall !== 'front' && !guideDepthEditMode) {
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
        const configuredTopFrameMm = spaceInfo.frameSize?.top;
        const topFrameHeightMm = configuredTopFrameMm === undefined
          ? 30
          : configuredTopFrameMm > 0
            ? configuredTopFrameMm
            : Math.max(0, (spaceInfo.frameSize as any)?.topGap ?? 0);

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

  const areGuideSlotsHorizontallyAdjacent = (
    first: FreePlacementGuideSlot,
    second: FreePlacementGuideSlot
  ) => {
    const tolerance = 0.5;
    const firstEndX = first.x + first.width;
    const secondEndX = second.x + second.width;

    return Math.abs(firstEndX - second.x) <= tolerance
      || Math.abs(secondEndX - first.x) <= tolerance;
  };

  const doGuideSlotsOverlapX = (
    first: FreePlacementGuideSlot,
    second: FreePlacementGuideSlot
  ) => {
    const tolerance = 0.5;
    return first.x < second.x + second.width - tolerance
      && first.x + first.width > second.x + tolerance;
  };

  const canMergeGuideSlotsHorizontally = (
    first: FreePlacementGuideSlot,
    second: FreePlacementGuideSlot
  ) => {
    const firstZone = first.guideZone || 'full';
    const secondZone = second.guideZone || 'full';

    return firstZone === secondZone
      && (first.guideGroupId || '') === (second.guideGroupId || '')
      && areGuideSlotsHorizontallyAdjacent(first, second);
  };

  const canMergeGuideSlotsVertically = (
    first: FreePlacementGuideSlot,
    second: FreePlacementGuideSlot
  ) => {
    const firstZone = first.guideZone || 'full';
    const secondZone = second.guideZone || 'full';
    const isUpperLowerPair = (
      (firstZone === 'upper' && secondZone === 'lower')
      || (firstZone === 'lower' && secondZone === 'upper')
    );

    return isUpperLowerPair && doGuideSlotsOverlapX(first, second);
  };

  const getMergedGuideFamilySlots = (
    slots: FreePlacementGuideSlot[],
    mergedSlot: FreePlacementGuideSlot
  ) => {
    const mergedGroupPrefix = `${mergedSlot.id}-`;
    return slots.filter((slot) => (
      slot.id === mergedSlot.id
      || (typeof slot.guideGroupId === 'string' && slot.guideGroupId.startsWith(mergedGroupPrefix))
    ));
  };

  const getMergedGuideRemainderSide = (
    slot: FreePlacementGuideSlot,
    mergedStartX: number
  ): 'left' | 'right' => {
    if (slot.guideGroupId?.endsWith('-left')) return 'left';
    if (slot.guideGroupId?.endsWith('-right')) return 'right';
    return slot.x + slot.width / 2 < mergedStartX ? 'left' : 'right';
  };

  const redistributeMergedGuideFamilyWidth = (
    sourceSlots: FreePlacementGuideSlot[],
    targetSlot: FreePlacementGuideSlot,
    widthValue: number
  ): FreePlacementGuideSlot[] | null => {
    if ((targetSlot.guideZone || 'full') !== 'full') return null;

    const familySlots = getMergedGuideFamilySlots(sourceSlots, targetSlot);
    const remainderSlots = familySlots.filter((slot) => slot.id !== targetSlot.id);
    if (remainderSlots.length === 0) return null;

    const minSlotWidth = 1;
    const familyStartX = Math.min(...familySlots.map((slot) => slot.x));
    const familyEndX = Math.max(...familySlots.map((slot) => slot.x + slot.width));
    const mergedStartX = targetSlot.x;
    const rightUpperCount = remainderSlots.filter((slot) => (
      (slot.guideZone || 'full') === 'upper'
      && getMergedGuideRemainderSide(slot, mergedStartX) === 'right'
    )).length;
    const rightLowerCount = remainderSlots.filter((slot) => (
      (slot.guideZone || 'full') === 'lower'
      && getMergedGuideRemainderSide(slot, mergedStartX) === 'right'
    )).length;
    const rightRemainderCount = Math.max(rightUpperCount, rightLowerCount);
    const maxTargetWidth = Math.max(
      minSlotWidth,
      familyEndX - mergedStartX - rightRemainderCount * minSlotWidth
    );
    const nextMergedWidth = Math.min(Math.max(minSlotWidth, widthValue), maxTargetWidth);
    const nextMergedEndX = mergedStartX + nextMergedWidth;

    const makeRemainderSlots = (
      zone: 'upper' | 'lower',
      side: 'left' | 'right',
      startX: number,
      endX: number
    ) => {
      const slots = remainderSlots
        .filter((slot) => (slot.guideZone || 'full') === zone)
        .filter((slot) => getMergedGuideRemainderSide(slot, mergedStartX) === side)
        .sort((a, b) => a.x - b.x);
      const segmentWidth = Math.max(0, endX - startX);
      if (slots.length === 0) return [];

      const slotWidth = Math.max(minSlotWidth, segmentWidth / slots.length);
      return slots.map((slot, index) => ({
        ...slot,
        index,
        x: startX + slotWidth * index,
        width: slotWidth,
        guideZone: zone,
        guideGroupId: `${targetSlot.id}-${zone}-${side}`,
        confirmed: false
      }));
    };

    const nextFamilySlots = [
      {
        ...targetSlot,
        width: nextMergedWidth,
        confirmed: true
      },
      ...makeRemainderSlots('upper', 'left', familyStartX, mergedStartX),
      ...makeRemainderSlots('lower', 'left', familyStartX, mergedStartX),
      ...makeRemainderSlots('upper', 'right', nextMergedEndX, familyEndX),
      ...makeRemainderSlots('lower', 'right', nextMergedEndX, familyEndX)
    ];
    const familySlotIds = new Set(familySlots.map((slot) => slot.id));
    const zoneOrder = { full: 0, upper: 1, lower: 2 };

    return sourceSlots
      .filter((slot) => !familySlotIds.has(slot.id))
      .concat(nextFamilySlots)
      .sort((a, b) => (
        zoneOrder[a.guideZone || 'full'] - zoneOrder[b.guideZone || 'full']
        || a.x - b.x
        || a.index - b.index
      ));
  };

  const redistributeFullGuideSlotWidthAcrossColumns = (
    sourceSlots: FreePlacementGuideSlot[],
    targetSlot: FreePlacementGuideSlot,
    widthValue: number
  ): FreePlacementGuideSlot[] | null => {
    if ((targetSlot.guideZone || 'full') !== 'full') return null;
    if (getMergedGuideFamilySlots(sourceSlots, targetSlot).length > 1) return null;
    const hasSplitSlots = sourceSlots.some((slot) => {
      const zone = slot.guideZone || 'full';
      return zone === 'upper' || zone === 'lower';
    });
    if (!hasSplitSlots) return null;

    const minSlotWidth = 1;
    const groupedColumns = new Map<string, { x: number; width: number; slots: FreePlacementGuideSlot[] }>();
    sourceSlots.forEach((slot) => {
      const zone = slot.guideZone || 'full';
      const key = zone === 'full'
        ? `full:${slot.id}`
        : `split:${Math.round(slot.x * 1000)}:${Math.round((slot.x + slot.width) * 1000)}`;
      const existing = groupedColumns.get(key);
      if (existing) {
        existing.x = Math.min(existing.x, slot.x);
        existing.width = Math.max(existing.x + existing.width, slot.x + slot.width) - existing.x;
        existing.slots.push(slot);
      } else {
        groupedColumns.set(key, { x: slot.x, width: slot.width, slots: [slot] });
      }
    });

    const columns = Array.from(groupedColumns.values()).sort((a, b) => a.x - b.x);
    const targetColumnIndex = columns.findIndex((column) => column.slots.some((slot) => slot.id === targetSlot.id));
    if (targetColumnIndex < 0 || columns.length <= 1) return null;

    const layoutStartX = Math.min(...columns.map((column) => column.x));
    const layoutEndX = Math.max(...columns.map((column) => column.x + column.width));
    const layoutWidth = Math.max(0, layoutEndX - layoutStartX);
    const maxTargetWidth = Math.max(minSlotWidth, layoutWidth - (columns.length - 1) * minSlotWidth);
    const nextTargetWidth = Math.min(Math.max(minSlotWidth, widthValue), maxTargetWidth);
    const remainingWidth = Math.max(0, layoutWidth - nextTargetWidth);
    const otherColumns = columns.filter((_, index) => index !== targetColumnIndex);
    const otherWidthTotal = otherColumns.reduce((sum, column) => sum + column.width, 0);
    const weightedOtherWidths = new Map<typeof columns[number], number>();
    let allocatedOtherWidth = 0;

    otherColumns.forEach((column, index) => {
      const isLastOther = index === otherColumns.length - 1;
      const nextWidth = isLastOther
        ? Math.max(minSlotWidth, remainingWidth - allocatedOtherWidth)
        : Math.max(
          minSlotWidth,
          otherWidthTotal > 0 ? (remainingWidth * column.width) / otherWidthTotal : remainingWidth / otherColumns.length
        );
      weightedOtherWidths.set(column, nextWidth);
      allocatedOtherWidth += nextWidth;
    });

    let cursorX = layoutStartX;
    const nextSlots = columns.flatMap((column, columnIndex) => {
      const nextWidth = columnIndex === targetColumnIndex
        ? nextTargetWidth
        : (weightedOtherWidths.get(column) ?? column.width);
      const nextColumnSlots = column.slots.map((slot) => ({
        ...slot,
        index: columnIndex,
        x: cursorX,
        width: nextWidth,
        confirmed: slot.id === targetSlot.id
      }));
      cursorX += nextWidth;
      return nextColumnSlots;
    });

    return sortFreeGuideSlots(nextSlots);
  };

  const updateFreeGuideSlotWidth = (slotId: string, widthValue: number) => {
    const sourceSlots = spaceInfo.freePlacementGuides || [];
    if (sourceSlots.length === 0) return;

    const bounds = getFreePlacementGuideBoundsX(spaceInfo);
    const totalGuideWidth = Math.max(0, bounds.endX - bounds.startX);
    const minSlotWidth = 1;
    const targetSlot = sourceSlots.find((slot) => slot.id === slotId);
    if (!targetSlot) return;

    const redistributedMergedFamily = redistributeMergedGuideFamilyWidth(sourceSlots, targetSlot, widthValue);
    if (redistributedMergedFamily) {
      setSpaceInfo({ freePlacementGuides: redistributedMergedFamily });
      return;
    }

    const redistributedFullColumns = redistributeFullGuideSlotWidthAcrossColumns(sourceSlots, targetSlot, widthValue);
    if (redistributedFullColumns) {
      setSpaceInfo({ freePlacementGuides: redistributedFullColumns });
      return;
    }

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
    const isLegacyMergedFullSlot = targetZone === 'full'
      && !targetGroupId
      && sourceSlots.some((slot) => (
        typeof slot.guideGroupId === 'string'
        && slot.guideGroupId.startsWith(`${targetSlot.id}-`)
      ));
    const effectiveGroupId = isLegacyMergedFullSlot ? targetSlot.id : targetGroupId;
    const targetZoneSlots = sourceSlots
      .filter((slot) => (
        isLegacyMergedFullSlot
          ? (slot.id === targetSlot.id || isSameGuideLine(slot, targetZone, effectiveGroupId))
          : isSameGuideLine(slot, targetZone, effectiveGroupId)
      ))
      .sort((a, b) => a.x - b.x);
    if (targetZoneSlots.length === 0) return;
    const guideBounds = getFreePlacementGuideBoundsX(spaceInfo);
    const useLineBounds = targetZone === 'full' || !!effectiveGroupId;
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
      guideGroupId: effectiveGroupId || undefined,
      confirmed: false
    };
    const nextTargetSlots = [...targetZoneSlots, nextSlot].map((slot, index) => ({
      ...slot,
      index,
      x: groupStartX + nextWidth * index,
      width: nextWidth,
      guideGroupId: effectiveGroupId || undefined,
      confirmed: false
    }));
    const targetSlotIds = new Set(targetZoneSlots.map((slot) => slot.id));
    const otherSlots = sourceSlots.filter((slot) => !targetSlotIds.has(slot.id));

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
      guideZone: 'lower',
      baseFrameHeight: targetSlot.baseFrameHeight ?? 105
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

  const mergeFreeGuideSlotsHorizontally = (slotIdA: string, slotIdB: string) => {
    const sourceSlots = spaceInfo.freePlacementGuides || [];
    const first = sourceSlots.find((slot) => slot.id === slotIdA);
    const second = sourceSlots.find((slot) => slot.id === slotIdB);
    if (!first || !second || !canMergeGuideSlotsHorizontally(first, second)) return;

    const targetZone = first.guideZone || 'full';
    const targetGroupId = first.guideGroupId;
    const targetLineSlots = sourceSlots
      .filter((slot) => isSameGuideLine(slot, targetZone, targetGroupId))
      .sort((a, b) => a.x - b.x);
    const mergedStartX = Math.min(first.x, second.x);
    const mergedEndX = Math.max(first.x + first.width, second.x + second.width);
    const mergedSlot: FreePlacementGuideSlot = {
      ...first,
      id: `free-guide-horizontal-${Date.now()}`,
      index: 0,
      x: mergedStartX,
      width: mergedEndX - mergedStartX,
      guideZone: targetZone,
      guideGroupId: targetGroupId || undefined,
      confirmed: false
    };
    const consumedSlotIds = new Set([slotIdA, slotIdB]);
    const nextLineSlots = targetLineSlots
      .filter((slot) => !consumedSlotIds.has(slot.id))
      .concat(mergedSlot)
      .sort((a, b) => a.x - b.x)
      .map((slot, index) => ({
        ...slot,
        index,
        guideZone: targetZone,
        guideGroupId: targetGroupId || undefined
      }));

    setMergeSelectedSlotIds([]);
    setSpaceInfo({
      freePlacementGuides: sortFreeGuideSlots(
        sourceSlots
          .filter((slot) => !isSameGuideLine(slot, targetZone, targetGroupId))
          .concat(nextLineSlots)
      )
    });
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
      guideGroupId: groupSeed,
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

    if (mergeSelectedSlotIds.includes(slotId)) {
      setMergeSelectedSlotIds(mergeSelectedSlotIds.filter((id) => id !== slotId));
      return;
    }

    const horizontalSlotId = mergeSelectedSlotIds.find((id) => {
      const slot = sourceSlots.find((item) => item.id === id);
      return slot ? canMergeGuideSlotsHorizontally(targetSlot, slot) : false;
    });

    if (horizontalSlotId) {
      mergeFreeGuideSlotsHorizontally(slotId, horizontalSlotId);
      return;
    }

    const oppositeSlotId = mergeSelectedSlotIds.find((id) => {
      const slot = sourceSlots.find((item) => item.id === id);
      return slot ? canMergeGuideSlotsVertically(targetSlot, slot) : false;
    });

    if (oppositeSlotId) {
      mergeFreeGuideSlots(slotId, oppositeSlotId);
      return;
    }

    setMergeSelectedSlotIds([
      ...mergeSelectedSlotIds.filter((id) => {
        const slot = sourceSlots.find((item) => item.id === id);
        if (!slot) return false;
        const targetZone = targetSlot.guideZone || 'full';
        const slotZone = slot.guideZone || 'full';
        return slotZone !== targetZone
          && !canMergeGuideSlotsVertically(targetSlot, slot);
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

  // 탑뷰 깊이 편집기: 슬롯별 깊이 입력 + 상부/하부 토글 + 앞/뒤 고정
  const renderGuideDepthEditor = (allGuideSlots: FreePlacementGuideSlot[]) => {
    const hasSplit = allGuideSlots.some((s) => (s.guideZone || 'full') === 'upper' || (s.guideZone || 'full') === 'lower');
    // 표시 대상은 전체 슬롯이다. 현재 토글이 아닌 상/하부 슬롯은 흐리게만 보여준다.
    const zoneSlots = allGuideSlots;
    const clampDefaultDepth = (value: number) => Math.min(value, spaceInfo.depth || value);
    const defaultFullDepth = clampDefaultDepth(
      spaceInfo.furnitureDepthDefaults?.wardrobe
      ?? spaceInfo.furnitureDepthDefaults?.tall
      ?? 580
    );
    const defaultLowerDepth = clampDefaultDepth(
      spaceInfo.furnitureDepthDefaults?.lowerBasic
      ?? 580
    );
    const defaultUpperDepth = clampDefaultDepth(
      spaceInfo.furnitureDepthDefaults?.upper
      ?? 300
    );
    const defaultDepthForZone = (zone?: string) => {
      if (zone === 'upper') return defaultUpperDepth;
      if (zone === 'lower') return defaultLowerDepth;
      return defaultFullDepth;
    };
    const guideZ = 0.006;
    const guideColor = colors?.primary || '#3b82f6';
    const halfW = spaceInfo.width / 2;
    const panelDepthMm = spaceInfo.depth || 600;
    const furnitureDepthMm = Math.min(panelDepthMm, 600);
    const furnitureZOffsetMm = -panelDepthMm / 2 + (panelDepthMm - furnitureDepthMm) / 2;
    const backGuideZ = (furnitureZOffsetMm - furnitureDepthMm / 2 - TOP_END_PANEL_FRONT_OFFSET_DEFAULT_MM) * 0.01;
    const frontGuideZ = backGuideZ + panelDepthMm * 0.01;
    const spaceWidthDimZ = backGuideZ - 3;
    const slotSpanStartMm = zoneSlots.length > 0
      ? Math.max(0, Math.min(...zoneSlots.map((slot) => slot.x)))
      : 0;
    const slotSpanEndMm = zoneSlots.length > 0
      ? Math.min(spaceInfo.width, Math.max(...zoneSlots.map((slot) => slot.x + slot.width)))
      : spaceInfo.width;
    const rawLeftGuideGapMm = Math.max(0, slotSpanStartMm);
    const rawRightGuideGapMm = Math.max(0, spaceInfo.width - slotSpanEndMm);
    const leftGuideGapMm = !spaceInfo.gapConfig?.left && rawLeftGuideGapMm <= 2
      ? 0
      : rawLeftGuideGapMm;
    const rightGuideGapMm = !spaceInfo.gapConfig?.right && rawRightGuideGapMm <= 2
      ? 0
      : rawRightGuideGapMm;
    const dimensionSlotStartMm = leftGuideGapMm;
    const dimensionSlotEndMm = spaceInfo.width - rightGuideGapMm;
    const slotWidthTotalMm = Math.max(0, spaceInfo.width - leftGuideGapMm - rightGuideGapMm);
    const formatGuideMm = (value: number) => {
      const rounded = Math.round((Math.abs(value) < 1e-9 ? 0 : value) * 1000) / 1000;
      return Number.isInteger(rounded)
        ? String(rounded)
        : rounded.toFixed(3).replace(/\.?0+$/, '');
    };

    const isFullSlotSectionDepth = (slot: FreePlacementGuideSlot) => hasSplit && (slot.guideZone || 'full') === 'full';
    const isInactiveDepthSlot = (slot: FreePlacementGuideSlot) => (
      hasSplit
      && (slot.guideZone === 'upper' || slot.guideZone === 'lower')
      && slot.guideZone !== depthZone
    );
    const getSlotDepth = (slot: FreePlacementGuideSlot) => {
      if (isFullSlotSectionDepth(slot)) {
        return depthZone === 'upper'
          ? (slot.upperDepth ?? slot.depth ?? defaultFullDepth)
          : (slot.lowerDepth ?? slot.depth ?? defaultFullDepth);
      }
      return slot.depth ?? defaultDepthForZone(slot.guideZone);
    };
    const getSlotGap = (slot: FreePlacementGuideSlot) => {
      if (isFullSlotSectionDepth(slot)) {
        return depthZone === 'upper'
          ? (slot.upperDepthGap ?? slot.depthGap ?? 0)
          : (slot.lowerDepthGap ?? slot.depthGap ?? 0);
      }
      return slot.depthGap ?? 0;
    };

    const commitDepth = (slot: FreePlacementGuideSlot, raw: string) => {
      const v = parseFloat(raw);
      if (!Number.isFinite(v) || v <= 0) return;
      setSpaceInfo({
        freePlacementGuides: (spaceInfo.freePlacementGuides || []).map((s) => {
          if (s.id !== slot.id) return s;
          if (!isFullSlotSectionDepth(slot)) return { ...s, depth: v };
          return depthZone === 'upper'
            ? { ...s, upperDepth: v }
            : { ...s, lowerDepth: v };
        }),
      });
    };

    const commitGap = (slot: FreePlacementGuideSlot, raw: string) => {
      const v = parseFloat(raw);
      if (!Number.isFinite(v) || v < 0) return;
      setSpaceInfo({
        freePlacementGuides: (spaceInfo.freePlacementGuides || []).map((s) => {
          if (s.id !== slot.id) return s;
          if (!isFullSlotSectionDepth(slot)) return { ...s, depthGap: v };
          return depthZone === 'upper'
            ? { ...s, upperDepthGap: v }
            : { ...s, lowerDepthGap: v };
        }),
      });
    };

    const depthInputStyle: React.CSSProperties = {
      width: 40, padding: '1px 3px', fontSize: 11, fontWeight: 700, textAlign: 'center',
      border: `1.5px solid ${guideColor}`, borderRadius: 4, outline: 'none',
      background: 'rgba(255,255,255,0.85)',
      boxShadow: 'none', appearance: 'none', WebkitAppearance: 'none',
      color: guideColor, lineHeight: 1.1,
    };

    return (
      <>
        {/* 전체 공간 너비 치수 (상단) + 연장선 */}
        {(() => {
          const dimZ = spaceWidthDimZ;
          const lx = -halfW * 0.01, rx = halfW * 0.01;
          return (
            <React.Fragment key="guide-depth-width-dim">
              <NativeLine name="free-placement-guide-line"
                points={[[lx, guideZ, dimZ], [rx, guideZ, dimZ]]}
                color={guideColor} lineWidth={1.2} opacity={0.6} transparent depthTest={false} depthWrite={false} renderOrder={100000} />
              {/* 연장선 좌/우 (치수선 → 공간 뒷변) */}
              <NativeLine name="free-placement-guide-line"
                points={[[lx, guideZ, dimZ], [lx, guideZ, backGuideZ]]}
                color={guideColor} lineWidth={0.8} opacity={0.45} transparent depthTest={false} depthWrite={false} renderOrder={100000} />
              <NativeLine name="free-placement-guide-line"
                points={[[rx, guideZ, dimZ], [rx, guideZ, backGuideZ]]}
                color={guideColor} lineWidth={0.8} opacity={0.45} transparent depthTest={false} depthWrite={false} renderOrder={100000} />
              <Html position={[0, guideZ, dimZ - 0.001]} center style={{ pointerEvents: 'none', userSelect: 'none', background: 'transparent' }}>
                <div style={{ color: guideColor, fontSize: 12, fontWeight: 900, whiteSpace: 'nowrap' }}>{formatGuideMm(spaceInfo.width)}</div>
              </Html>
            </React.Fragment>
          );
        })()}

        {/* 배치 슬롯 폭 합계 + 좌우 이격 치수 (공간 안쪽 레벨) */}
        {(() => {
          const innerDimZ = (spaceWidthDimZ + backGuideZ) / 2;
          const tickHalf = Math.max(0.05, Math.min(panelDepthMm * 0.015, 10) * 0.01);
          const toX = (xMm: number) => (xMm - halfW) * 0.01;
          const segmentLabelStyle: React.CSSProperties = {
            color: guideColor,
            fontSize: 10,
            fontWeight: 900,
            whiteSpace: 'nowrap',
            background: 'rgba(255,255,255,0.82)',
            borderRadius: 3,
            padding: '1px 4px'
          };
          const segments = [
            { key: 'left-gap', start: 0, end: dimensionSlotStartMm, label: formatGuideMm(leftGuideGapMm) },
            { key: 'slot-sum', start: dimensionSlotStartMm, end: dimensionSlotEndMm, label: formatGuideMm(slotWidthTotalMm) },
            { key: 'right-gap', start: dimensionSlotEndMm, end: spaceInfo.width, label: formatGuideMm(rightGuideGapMm) },
          ];
          const boundaries = [0, dimensionSlotStartMm, dimensionSlotEndMm, spaceInfo.width];
          return (
            <React.Fragment key="guide-depth-inner-width-dim">
              {segments.map((segment) => {
                const startX = toX(segment.start);
                const endX = toX(segment.end);
                const midX = (startX + endX) / 2;
                return (
                  <React.Fragment key={segment.key}>
                    <NativeLine name="free-placement-guide-line"
                      points={[[startX, guideZ, innerDimZ], [endX, guideZ, innerDimZ]]}
                      color={guideColor} lineWidth={1.4} opacity={0.78} transparent depthTest={false} depthWrite={false} renderOrder={100000} />
                    <Html position={[midX, guideZ, innerDimZ + 0.001]} center style={{ pointerEvents: 'none', userSelect: 'none', background: 'transparent' }}>
                      <div style={segmentLabelStyle}>{segment.label}</div>
                    </Html>
                  </React.Fragment>
                );
              })}
              {boundaries.map((xMm, index) => {
                const x = toX(xMm);
                return (
                  <NativeLine key={`guide-depth-inner-tick-${index}`} name="free-placement-guide-line"
                    points={[[x, guideZ, innerDimZ - tickHalf], [x, guideZ, innerDimZ + tickHalf]]}
                    color={guideColor} lineWidth={1.1} opacity={0.78} transparent depthTest={false} depthWrite={false} renderOrder={100000} />
                );
              })}
            </React.Fragment>
          );
        })()}

        {/* 공간 외곽 좌/우 세로변만 (가로 검정선 제거) */}
        {([-halfW, halfW] as number[]).map((xMm, i) => (
          <NativeLine key={`guide-depth-side-${i}`} name="free-placement-guide-line"
            points={[[xMm * 0.01, guideZ, backGuideZ], [xMm * 0.01, guideZ, frontGuideZ]]}
            color={guideColor} lineWidth={1.2} opacity={0.5} transparent depthTest={false} depthWrite={false} renderOrder={100000} />
        ))}

        {/* 슬롯 경계 세로선 (X 분할) + 슬롯 폭 라벨 */}
        {zoneSlots.flatMap((slot) => {
          const inactive = isInactiveDepthSlot(slot);
          const leftX = (slot.x - halfW) * 0.01;
          const rightX = (slot.x + slot.width - halfW) * 0.01;
          const cX = (slot.x + slot.width / 2 - halfW) * 0.01;
          const depthVal = getSlotDepth(slot);
          const gapVal = getSlotGap(slot);
          const slotBackZ = backGuideZ + gapVal * 0.01;
          const slotFrontZ = slotBackZ + depthVal * 0.01;
          return [
            <NativeLine key={`guide-depth-edge-l-${slot.id}`} name="free-placement-guide-line"
              points={[[leftX, guideZ, slotBackZ], [leftX, guideZ, slotFrontZ]]}
              color={guideColor} lineWidth={inactive ? 0.8 : 1.2} dashed dashSize={0.08} gapSize={0.05} opacity={inactive ? 0.16 : 0.42} transparent depthTest={false} depthWrite={false} renderOrder={100000} />,
            <NativeLine key={`guide-depth-edge-r-${slot.id}`} name="free-placement-guide-line"
              points={[[rightX, guideZ, slotBackZ], [rightX, guideZ, slotFrontZ]]}
              color={guideColor} lineWidth={inactive ? 0.8 : 1.2} dashed dashSize={0.08} gapSize={0.05} opacity={inactive ? 0.16 : 0.42} transparent depthTest={false} depthWrite={false} renderOrder={100000} />,
            <Html key={`guide-depth-width-${slot.id}`} position={[cX, guideZ, backGuideZ - 0.8]} center style={{ pointerEvents: 'none', userSelect: 'none', background: 'transparent' }}>
              <div style={{ color: guideColor, opacity: inactive ? 0.28 : 1, fontSize: 11, fontWeight: 900, whiteSpace: 'nowrap' }}>{Math.round(slot.width)}</div>
            </Html>,
          ];
        })}

        {/* 슬롯별 깊이 박스 + 깊이/갭 입력 */}
        {zoneSlots.flatMap((slot) => {
          const inactive = isInactiveDepthSlot(slot);
          const leftX = (slot.x - halfW) * 0.01;
          const rightX = (slot.x + slot.width - halfW) * 0.01;
          const centerX = (slot.x + slot.width / 2 - halfW) * 0.01;
          const depthVal = getSlotDepth(slot);
          const gapVal = getSlotGap(slot);
          const sectionKey = isFullSlotSectionDepth(slot) ? depthZone : (slot.guideZone || 'full');
          const backScreenZ = backGuideZ + gapVal * 0.01;
          const frontScreenZ = backScreenZ + depthVal * 0.01;
          const midScreenZ = (backScreenZ + frontScreenZ) / 2;
          const boxDepthLen = Math.abs(frontScreenZ - backScreenZ);
          const dashedInactiveLower = depthZone === 'upper' && slot.guideZone === 'lower';
          const elements: React.ReactNode[] = [
            // 깊이 박스 (장 영역 채움)
            <mesh key={`guide-depth-box-${slot.id}`} position={[centerX, guideZ - 0.001, midScreenZ]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[rightX - leftX, boxDepthLen]} />
              <meshBasicMaterial color={guideColor} transparent opacity={inactive ? 0.05 : 0.18} depthTest={false} depthWrite={false} />
            </mesh>,
            <NativeLine key={`guide-depth-box-outline-back-${slot.id}`} name="free-placement-guide-line"
              points={[[leftX, guideZ + 0.001, backScreenZ], [rightX, guideZ + 0.001, backScreenZ]]}
              color={guideColor} lineWidth={inactive ? 0.9 : 1.4} dashed={dashedInactiveLower} dashSize={0.08} gapSize={0.05} opacity={inactive ? 0.22 : 0.9} transparent depthTest={false} depthWrite={false} renderOrder={100001} />,
            <NativeLine key={`guide-depth-box-outline-front-${slot.id}`} name="free-placement-guide-line"
              points={[[leftX, guideZ + 0.001, frontScreenZ], [rightX, guideZ + 0.001, frontScreenZ]]}
              color={guideColor} lineWidth={inactive ? 0.9 : 1.4} dashed={dashedInactiveLower} dashSize={0.08} gapSize={0.05} opacity={inactive ? 0.22 : 0.9} transparent depthTest={false} depthWrite={false} renderOrder={100001} />,
            <NativeLine key={`guide-depth-box-outline-left-${slot.id}`} name="free-placement-guide-line"
              points={[[leftX, guideZ + 0.001, backScreenZ], [leftX, guideZ + 0.001, frontScreenZ]]}
              color={guideColor} lineWidth={inactive ? 0.9 : 1.4} dashed={dashedInactiveLower} dashSize={0.08} gapSize={0.05} opacity={inactive ? 0.22 : 0.9} transparent depthTest={false} depthWrite={false} renderOrder={100001} />,
            <NativeLine key={`guide-depth-box-outline-right-${slot.id}`} name="free-placement-guide-line"
              points={[[rightX, guideZ + 0.001, backScreenZ], [rightX, guideZ + 0.001, frontScreenZ]]}
              color={guideColor} lineWidth={inactive ? 0.9 : 1.4} dashed={dashedInactiveLower} dashSize={0.08} gapSize={0.05} opacity={inactive ? 0.22 : 0.9} transparent depthTest={false} depthWrite={false} renderOrder={100001} />,
          ];

          if (!inactive) {
            elements.push(
              // 깊이/갭 입력 (장 영역 중앙)
              <Html key={`guide-depth-input-${slot.id}`} position={[centerX, guideZ, midScreenZ]} center zIndexRange={[200, 0]} style={{ pointerEvents: 'auto', userSelect: 'none', background: 'transparent' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '40px 40px', columnGap: 3, rowGap: 2, alignItems: 'center', background: 'transparent' }}>
                  <span style={{ fontSize: 9, fontWeight: 600, color: guideColor, lineHeight: 1, whiteSpace: 'nowrap', textAlign: 'right' }}>갭(뒷벽)</span>
                  <input type="text" inputMode="decimal" defaultValue={gapVal} key={`g-${slot.id}-${sectionKey}-${gapVal}`}
                    onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    onBlur={(e) => commitGap(slot, e.target.value)} style={{ ...depthInputStyle, borderStyle: 'dashed' }} />
                  <span style={{ fontSize: 9, fontWeight: 600, color: guideColor, lineHeight: 1, whiteSpace: 'nowrap', textAlign: 'right' }}>깊이</span>
                  <input type="text" inputMode="decimal" defaultValue={depthVal} key={`d-${slot.id}-${sectionKey}-${depthVal}`}
                    onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    onBlur={(e) => commitDepth(slot, e.target.value)} style={depthInputStyle} />
                </div>
              </Html>,
            );
          }

          return elements;
        })}
      </>
    );
  };

  if (isGuidePlacementMode) {
    const guideSlots = (spaceInfo.freePlacementGuides || []).map((slot) => ({
      ...slot,
      guideZone: slot.guideZone || 'full' as const
    }));
    if (guideSlots.length === 0) return null;
    // 2D 측면뷰 등에서는 렌더 안 함. 단, 깊이 모드(탑 카메라)는 허용.
    if (!guideDepthEditMode && viewMode === '2D' && view2DDirection !== 'front') {
      return null;
    }

    // ── 깊이 편집 모드(탑뷰): 폭 입력 대신 슬롯별 깊이 입력 ──
    if (guideDepthEditMode) {
      return renderGuideDepthEditor(guideSlots);
    }

    const fullHeightMm = spaceInfo.height;
    const fullHeight = fullHeightMm * 0.01;
    const hasSplitSlots = guideSlots.some((slot) => slot.guideZone === 'upper' || slot.guideZone === 'lower');
    const isGuideEditing = spaceInfo.freePlacementGuideEditing === true;
    const showGuideHeightSections = isGuideEditing || hasSplitSlots;

    // ── 가이드 높이 구간 (mm) ──
    // 분할 슬롯 = 몰딩 + 상부장 + 미드웨이 + 하부장 + 하단 구간(걸레받이 또는 띄움)
    // 비분할 키큰장 슬롯 = 몰딩 + 상부섹션 + 하부섹션 + 하단 구간(걸레받이 또는 띄움)
    // 상단몰딩/하단 구간은 우측바와 연동되도록 frameSize.top / baseConfig 사용
    const guideTopFrameAllMode = spaceInfo.guideTopFrameAllMode ?? true;
    const rawGlobalTopGap = guideTopFrameAllMode ? (spaceInfo.frameSize as any)?.topGap : undefined;
    const gMoldingGap = Math.max(0, rawGlobalTopGap ?? 0);
    const resolveFrameRawSize = (
      rawSize: number | undefined,
      fallbackRawSize: number | undefined,
      _gap: number | undefined
    ) => {
      return Math.max(0, rawSize ?? fallbackRawSize ?? 0);
    };
    const guideInternalSpace = calculateInternalSpace(spaceInfo);
    const getGuideModuleCategory = (module: typeof placedModules[number]) => {
      const moduleData = getModuleById(module.moduleId, guideInternalSpace, spaceInfo);
      return moduleData?.category
        ?? (module.moduleId.includes('upper') ? 'upper'
          : module.moduleId.includes('lower') ? 'lower' : 'full');
    };
    const topFrameGuideSlots = guideSlots.filter((slot) => (slot.guideZone || 'full') !== 'lower');
    const guideTopFrameModules = placedModules.filter((module) => (
      !module.isSurroundPanel
      && (
        module.guideSlotPlacement === true
        || module.guideDepthPlacement === true
        || ((spaceInfo.customGuideMode === true || guideSlots.length > 0) && module.isFreePlacement === true)
      )
      && (getGuideModuleCategory(module) === 'upper' || getGuideModuleCategory(module) === 'full')
    ));
    const guideTopFrameOffOverride = guideTopFrameAllMode && (
      topFrameGuideSlots.some((slot) => slot.hasTopFrame === false)
      || guideTopFrameModules.some((module) => module.hasTopFrame === false)
    );
    const isStaleCopiedTopGap = (slot: FreePlacementGuideSlot) => {
      if (guideTopFrameAllMode || slot.hasTopFrame !== false || slot.topFrameGapUserSet === true) return false;
      const gapValue = Math.max(0, Math.round(slot.topFrameGap ?? 0));
      if (gapValue <= 0) return false;
      const thicknessValue = Math.max(0, Math.round(slot.topFrameThickness ?? spaceInfo.frameSize?.top ?? 30));
      return gapValue === thicknessValue || gapValue === 30;
    };
    const resolveGuideSlotTopGap = (slot: FreePlacementGuideSlot) => {
      if (isStaleCopiedTopGap(slot)) return 0;
      return Math.max(0, slot.topFrameGap ?? (guideTopFrameAllMode ? gMoldingGap : 0));
    };
    const topGapFromGuideState = Math.max(0,
      rawGlobalTopGap
        ?? (topFrameGuideSlots.find((slot) => slot.hasTopFrame === false && typeof slot.topFrameGap === 'number')
          ? resolveGuideSlotTopGap(topFrameGuideSlots.find((slot) => slot.hasTopFrame === false && typeof slot.topFrameGap === 'number')!)
          : undefined)
        ?? guideTopFrameModules.find((module) => module.hasTopFrame === false && typeof module.topFrameGap === 'number')?.topFrameGap
        ?? 0
    );
    const gTopMolding = guideTopFrameOffOverride
      ? 0
      : resolveFrameRawSize(spaceInfo.frameSize?.top, undefined, topGapFromGuideState);
    const gTopGap = topGapFromGuideState;
    const gTopClearance = Math.max(0, gTopMolding > 0 ? gTopMolding : gTopGap);
    const activePlacedFurnitureId = activePopup.type === 'furnitureEdit' && activePopup.id
      ? activePopup.id
      : (uiSelectedFurnitureId ?? selectedFurnitureIds[selectedFurnitureIds.length - 1] ?? selectedFurnitureId);
    const guideBaseCandidateModules = placedModules.filter((module) => (
      !module.isSurroundPanel
      && (
        module.guideSlotPlacement === true
        || module.guideDepthPlacement === true
        || ((spaceInfo.customGuideMode === true || guideSlots.length > 0) && module.isFreePlacement === true)
      )
    ));
    const guideSelectedBaseModule = guideBaseCandidateModules.find((module) => (
      module.id === activePlacedFurnitureId
      && (getGuideModuleCategory(module) === 'lower' || getGuideModuleCategory(module) === 'full')
    ));
    const guideLowerBaseModule = guideBaseCandidateModules.find((module) => (
      getGuideModuleCategory(module) === 'lower'
    ));
    const guideFullBaseModule = guideBaseCandidateModules.find((module) => (
      getGuideModuleCategory(module) === 'full'
    ));
	    const guideBaseReferenceModule = guideSelectedBaseModule ?? guideLowerBaseModule ?? guideFullBaseModule;
	    const guideLowerBaseSlot = guideSlots.find((slot) => (slot.guideZone || 'full') === 'lower');
	    const guideBaseFrameSlot = guideLowerBaseSlot ?? guideSlots.find((slot) => (slot.guideZone || 'full') === 'full');
	    const guideBaseFrameAllMode = spaceInfo.guideBaseFrameAllMode ?? true;
    const resolveGuideBaseHeight = (module: typeof placedModules[number] | undefined) => {
      if (!module) {
        return spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 0) : 0;
      }
      if (module.hasBase === false) return 0;
      const moduleBaseGap = module.baseFrameGap ?? (spaceInfo.baseConfig as any)?.gap ?? 0;
      return Math.max(0, resolveFrameRawSize(module.baseFrameHeight, spaceInfo.baseConfig?.height ?? 0, moduleBaseGap));
    };
    const resolveGuideLowerBodyHeight = (module: typeof placedModules[number] | undefined) => {
      if (!module) return spaceInfo.guideLowerHeight ?? 800;
      const moduleData = getModuleById(module.moduleId, guideInternalSpace, spaceInfo);
      return Math.max(0, Math.round(
        module.cabinetBodyHeight
          ?? module.customHeight
          ?? module.freeHeight
          ?? moduleData?.dimensions.height
          ?? spaceInfo.guideLowerHeight
          ?? 800
      ));
    };
    const globalFloatingBase = spaceInfo.baseConfig?.type === 'stand'
      || (spaceInfo.baseConfig?.height ?? 0) <= 0;
    const isFloatingBase = guideBaseReferenceModule
      ? guideBaseReferenceModule.hasBase === false
      : globalFloatingBase;
    const guideBaseGapRaw = Math.max(
      0,
      (spaceInfo.baseConfig as any)?.gap ?? 0,
      guideBaseFrameSlot?.baseFrameGap ?? 0,
      guideBaseReferenceModule?.baseFrameGap ?? 0
    );
	    const gBaseboard = guideBaseFrameAllMode
	      ? (
	        resolveFrameRawSize(
            spaceInfo.baseConfig?.height,
            guideBaseReferenceModule?.baseFrameHeight ?? (hasSplitSlots ? 105 : (spaceInfo.baseConfig?.height ?? 0)),
            guideBaseGapRaw
          )
	      )
	      : (spaceInfo.baseConfig?.type === 'floor'
	        ? resolveFrameRawSize(
            guideBaseFrameSlot?.baseFrameHeight,
            guideBaseReferenceModule?.baseFrameHeight ?? (hasSplitSlots ? 105 : (spaceInfo.baseConfig?.height ?? 0)),
            guideBaseGapRaw
          )
	        : 0);
    const gFloatHeight = isFloatingBase
      ? Math.max(0, guideBaseReferenceModule?.individualFloatHeight ?? spaceInfo.baseConfig?.floatHeight ?? 0)
      : 0;
	    // 우측바 옵셋/갭과 연동되는 값
	    const gMoldingOffset = (spaceInfo.frameSize as any)?.topOffset ?? 0;
	    const gBaseOffset = guideBaseFrameAllMode
	      ? ((spaceInfo.baseConfig as any)?.offset ?? 0)
	      : (guideBaseReferenceModule?.baseFrameOffset ?? (spaceInfo.baseConfig as any)?.offset ?? 0);
	    const gBaseGap = isFloatingBase
	      ? 0
	      : Math.max(0, Math.min(gBaseboard, guideBaseGapRaw));
    const gBottomClearance = isFloatingBase ? gFloatHeight : gBaseboard;
    const gMoldingVisible = gTopMolding > 0 ? Math.max(0, gTopMolding - gTopGap) : gTopGap;
    const gBaseboardVisible = isFloatingBase ? gFloatHeight : Math.max(0, gBaseboard - gBaseGap);
    const availableSectionHeight = Math.max(0, Math.round(fullHeightMm - gTopClearance - gBottomClearance));
    const gLower = Math.min(resolveGuideLowerBodyHeight(guideLowerBaseModule), availableSectionHeight);
    const availableUpperHeight = Math.max(0, availableSectionHeight - gLower);
    const gUpperRaw = spaceInfo.guideUpperHeight ?? 700;
    const gUpper = hasSplitSlots
      ? Math.min(gUpperRaw, availableUpperHeight)
      : Math.max(0, availableSectionHeight - gLower);
    // 상하분할 슬롯은 기존처럼 미드웨이 구간을 유지한다.
    // 비분할 키큰장 가이드는 몰딩 + 상부섹션 + 하부섹션 + 걸레받이 4단만 표시한다.
    const gMidway = hasSplitSlots
      ? Math.max(0, Math.round(fullHeightMm - gTopClearance - gUpper - gLower - gBottomClearance))
      : 0;
    const gFloorFinish = spaceInfo.hasFloorFinish && spaceInfo.floorFinish
      ? Math.max(0, Math.round(spaceInfo.floorFinish.height || 0))
      : 0;

    // 바닥(0)부터의 누적 경계 (mm): 하단 구간→하부장→미드웨이→상부장→몰딩
    const yBaseTop = gBottomClearance;            // 걸레받이/띄움 상단
    const yBaseGapTop = Math.min(gBaseGap, yBaseTop);
    const yLowerTop = yBaseTop + gLower;          // 하부장 상단 (= 하부 슬롯 영역 상단)
    const ySplitLowerBaseTop = yBaseTop + gFloorFinish;
    const ySplitLowerTop = yLowerTop + gFloorFinish;
    const yMidTop = yLowerTop + gMidway;          // 미드웨이 상단 (= 상부 슬롯 영역 하단)
    const yUpperTop = yMidTop + gUpper;           // 상부장 상단 (= 몰딩 하단)
    const yMoldingGapBottom = gTopMolding > 0
      ? Math.max(yUpperTop, fullHeightMm - gMoldingGap)
      : yUpperTop;
    const yLowerVisualTop = ySplitLowerTop;
    const yMidwayVisualTop = yMidTop;
    const gMidwayVisible = hasSplitSlots
      ? Math.max(0, yMidwayVisualTop - yLowerVisualTop)
      : 0;
    const gUpperVisible = hasSplitSlots
      ? gUpper
      : Math.max(0, yUpperTop - yLowerVisualTop);
    // mm → three units
    const lowerStartY = ySplitLowerBaseTop * 0.01;
    const lowerEndY = yLowerVisualTop * 0.01;
    const upperStartY = yMidTop * 0.01;
    const upperEndY = yUpperTop * 0.01;
    const splitY = (yLowerVisualTop + yMidTop) / 2 * 0.01; // 미드웨이 중앙 (분할선 표시용)
    const isGlobalTopFrameEnabled = gTopMolding > 0;
    const isGlobalBaseFrameEnabled = spaceInfo.baseConfig?.type === 'floor' && (spaceInfo.baseConfig?.height ?? 0) > 0;
    const resolveSlotBaseEnabled = (slot: FreePlacementGuideSlot) => slot.hasBase ?? isGlobalBaseFrameEnabled;

    const resolveSlotBaseHeightMm = (slot: FreePlacementGuideSlot) => (
      resolveFrameRawSize(
        slot.baseFrameHeight,
        (slot.guideZone || 'full') === 'lower' ? 105 : (spaceInfo.baseConfig?.height || 65),
        slot.baseFrameGap ?? gBaseGap
      )
    );
    const resolveSlotBaseGapMm = (slot: FreePlacementGuideSlot) => (
      Math.max(0, Math.min(resolveSlotBaseHeightMm(slot), slot.baseFrameGap ?? 0))
    );
    const resolveSlotBaseTopMm = (slot: FreePlacementGuideSlot) => (
      resolveSlotBaseEnabled(slot) ? resolveSlotBaseHeightMm(slot) : Math.max(0, slot.individualFloatHeight ?? gFloatHeight)
    );
    const resolveSlotBaseGapTopMm = (slot: FreePlacementGuideSlot) => (
      Math.min(resolveSlotBaseGapMm(slot), resolveSlotBaseTopMm(slot))
    );

    const getSlotYRange = (slot: FreePlacementGuideSlot): [number, number] => {
      const zone = slot.guideZone || 'full';
      const globalBaseEnabled = spaceInfo.baseConfig?.type === 'floor' && (spaceInfo.baseConfig?.height ?? 0) > 0;
      const slotBaseEnabled = guideBaseFrameAllMode
        ? globalBaseEnabled
        : (slot.hasBase ?? globalBaseEnabled);
      const slotBaseClearanceMm = slotBaseEnabled
        ? (guideBaseFrameAllMode ? ySplitLowerBaseTop : resolveSlotBaseHeightMm(slot) + gFloorFinish)
        : Math.max(0, slot.individualFloatHeight ?? gFloatHeight);
      const slotLowerStartY = slotBaseClearanceMm * 0.01;
      const slotLowerEndY = guideBaseFrameAllMode
        ? lowerEndY
        : Math.min(slotBaseClearanceMm + gLower, yMidTop) * 0.01;
      if (zone === 'upper') return [upperStartY, upperEndY];
      if (zone === 'lower') return [slotLowerStartY, slotLowerEndY];
      if (hasSplitSlots) return [slotLowerStartY, upperEndY];
      if (showGuideHeightSections) return [slotLowerStartY, upperEndY];
      return [0, fullHeight];
    };
    const getSlotControlY = (slot: FreePlacementGuideSlot) => {
      const [startY, endY] = getSlotYRange(slot);
      return (startY + endY) / 2;
    };
    const guideZ = 0.006;
    const guideColor = colors.primary || '#3b82f6';
    const selectedGuideSlotRanges = (() => {
      if (!isGuideEditing || selectedGuideSlotIds.length === 0) return [];

      const selectedIds = new Set(selectedGuideSlotIds);
      const selectedLineGroups = new Map<string, FreePlacementGuideSlot[]>();

      guideSlots.forEach((slot) => {
        if (!selectedIds.has(slot.id)) return;

        const zone = slot.guideZone || 'full';
        const lineKey = zone === 'full' ? `full|${slot.guideGroupId || ''}` : zone;
        const lineSlots = selectedLineGroups.get(lineKey) || [];
        lineSlots.push(slot);
        selectedLineGroups.set(lineKey, lineSlots);
      });

      return Array.from(selectedLineGroups.entries()).map(([lineKey, lineSlots]) => {
        const sortedLineSlots = [...lineSlots].sort((a, b) => a.x - b.x || a.index - b.index);
        const leftX = (Math.min(...sortedLineSlots.map((slot) => slot.x)) - spaceInfo.width / 2) * 0.01;
        const rightX = (Math.max(...sortedLineSlots.map((slot) => slot.x + slot.width)) - spaceInfo.width / 2) * 0.01;
        const yRanges = sortedLineSlots.map(getSlotYRange);
        const startY = Math.min(...yRanges.map(([start]) => start));
        const endY = Math.max(...yRanges.map(([, end]) => end));

        return {
          key: lineKey,
          leftX,
          rightX,
          centerY: (startY + endY) / 2
        };
      });
    })();
    const guideBounds = getFreePlacementGuideBoundsX(spaceInfo);
    const guideEndX = guideBounds.endX + spaceInfo.width / 2;
    const lastSlotEndX = Math.max(...guideSlots.map((slot) => slot.x + slot.width));
    const remainingFreeWidth = Math.max(0, guideEndX - lastSlotEndX);
    const remainingFreeLabelX = lastSlotEndX + remainingFreeWidth / 2;
    const splitUpperWidthLabelY = fullHeight + 1.5;
    const splitLowerWidthLabelY = -1.75;
    const getSlotLabelY = (slot: FreePlacementGuideSlot) => {
      const zone = slot.guideZone || 'full';
      if (zone === 'upper' && hasSplitSlots) return splitUpperWidthLabelY;
      if (zone === 'lower' && hasSplitSlots) return splitLowerWidthLabelY;
      return fullHeight + 0.28;
    };
    const shouldShowSlotWidthLabel = (slot: FreePlacementGuideSlot) => (
      !(hasSplitSlots && (slot.guideZone || 'full') === 'full')
    );
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
          ? splitUpperWidthLabelY
          : zone === 'lower' && hasSplitSlots
            ? splitLowerWidthLabelY
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
    const heightSectionLineSegments = hasSplitSlots
      ? splitLineSegments
      : [{
        startX: Math.min(...guideSlots.map((slot) => slot.x)),
        endX: Math.max(...guideSlots.map((slot) => slot.x + slot.width))
      }];
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
    const isHeightTierOccupied = (key: string) => {
      if (key === 'midway') return false;
      const matchesTier = (slot: FreePlacementGuideSlot) => {
        const zone = slot.guideZone || 'full';
        if (zone === 'full') return true;
        if (key === 'upper' || key === 'molding') return zone === 'upper';
	        if (key === 'lower' || key === 'baseboard') return zone === 'lower';
        return false;
      };
      return guideSlots.some((slot) => matchesTier(slot) && isGuideSlotOccupied(slot));
    };

    // ── 가이드 높이 치수 편집기 (좌/우 가장자리) ──
    const spaceHalfWidth = spaceInfo.width / 2;
    const heightTiers = [
      { key: 'molding', label: gTopMolding > 0 ? '상단몰딩' : '상단갭', value: gTopMolding > 0 ? gMoldingVisible : gMoldingGap, centerYmm: (yUpperTop + fullHeightMm) / 2 },
      { key: 'upper', label: '상부섹션', value: gUpperVisible, centerYmm: (yMidTop + yUpperTop) / 2 },
	      ...(hasSplitSlots ? [{ key: 'midway', label: '미드웨이', value: gMidwayVisible, centerYmm: (yLowerVisualTop + yMidTop) / 2 }] : []),
	      { key: 'lower', label: '하부섹션', value: gLower, centerYmm: (ySplitLowerBaseTop + yLowerVisualTop) / 2 },
	      { key: 'baseboard', label: isFloatingBase ? '띄움높이' : '걸레받이', value: isFloatingBase ? gFloatHeight : gBaseboardVisible, centerYmm: (gFloorFinish + ySplitLowerBaseTop) / 2 },
	    ];
    const commitTier = (key: string, raw: string) => {
      const v = Math.round(parseFloat(raw));
      if (!Number.isFinite(v) || v < 0) return;
      if (key === 'molding') {
        setSpaceInfo({
          frameSize: gTopMolding > 0
            ? { ...(spaceInfo.frameSize as any), top: v + gTopGap }
            : { ...(spaceInfo.frameSize as any), top: 0, topGap: v }
        });
      }
      else if (key === 'lower') {
        setSpaceInfo({ guideLowerHeight: hasSplitSlots ? v : Math.min(v, availableSectionHeight) });
      }
	      else if (key === 'baseboard') {
	        const nextBaseHeight = isFloatingBase ? v : v + gBaseGap;
	        syncGuideBaseFrameAll(
	          isFloatingBase
            ? { type: 'stand', placementType: 'float', height: 0, floatHeight: v }
            : { type: 'floor', placementType: 'ground', height: nextBaseHeight },
          isFloatingBase
            ? { hasBase: false, hasBottomFrame: false, individualFloatHeight: v }
            : { hasBase: true, hasBottomFrame: true, baseFrameHeight: nextBaseHeight, baseFrameOffset: gBaseOffset, baseFrameGap: gBaseGap },
          isFloatingBase
            ? { hasBase: false, hasBottomFrame: false, individualFloatHeight: v }
            : { hasBase: true, hasBottomFrame: true, baseFrameHeight: nextBaseHeight, baseFrameOffset: gBaseOffset, baseFrameGap: gBaseGap }
	        );
	      }
      else if (key === 'upper') {
        if (hasSplitSlots) setSpaceInfo({ guideUpperHeight: v });
        else setSpaceInfo({ guideLowerHeight: Math.max(0, availableSectionHeight - v) });
      }
      else if (key === 'midway') {
        // 미드웨이 변경 → 상부장이 흡수
        const newUpper = Math.max(0, Math.round(fullHeightMm - gTopClearance - v - gLower - gBottomClearance));
        setSpaceInfo({ guideUpperHeight: newUpper });
      }
    };
    const tierEditorStyle: React.CSSProperties = {
      width: 56, padding: '3px 4px', fontSize: 13, fontWeight: 700, textAlign: 'center',
      border: `2px solid ${guideColor}`, borderRadius: 5, outline: 'none',
      background: 'rgba(255,255,255,0.97)', color: guideColor, lineHeight: 1.1,
    };
    const renderHeightTiers = (sideX: number, editable: boolean) =>
      heightTiers.map((tier) => {
        if (!editable && isHeightTierOccupied(tier.key)) return null;
	        const labelX = sideX;

        return (
          <Html
            key={`guide-tier-${tier.key}-${sideX > 0 ? 'r' : 'l'}-${editable ? 'edit' : 'read'}`}
            position={[labelX, tier.centerYmm * 0.01, guideZ]}
            center
            zIndexRange={[200, 0]}
            style={{ pointerEvents: editable ? 'auto' : 'none', userSelect: 'none', background: 'transparent' }}
          >
            <div style={guideHtmlScaleStyle}>
            {editable ? (
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
            ) : (
              <div
                style={{
                  minWidth: 34,
                  padding: '2px 5px',
                  color: guideColor,
                  fontSize: 13,
                  fontWeight: 900,
                  lineHeight: 1,
                  textAlign: 'center',
                  fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'nowrap',
                  textShadow: '0 1px 2px var(--theme-background), 0 -1px 2px var(--theme-background)'
                }}
              >
                {Math.round(tier.value)}
              </div>
            )}
            </div>
          </Html>
        );
      });

    const getSlotFrameControlY = (slot: FreePlacementGuideSlot, frame: 'top' | 'base') => {
      const [startY, endY] = getSlotYRange(slot);
      const centerY = (startY + endY) / 2;
      const hasTopEditor = !guideTopFrameAllMode && (slot.guideZone || 'full') !== 'lower';
      const hasBaseEditor = !guideBaseFrameAllMode && (slot.guideZone || 'full') !== 'upper';
      const halfHeight = Math.max(0, (endY - startY) / 2);
      const desiredOffset = hasTopEditor && hasBaseEditor ? 2.8 : 2.1;
      const offset = Math.min(desiredOffset, Math.max(0.35, halfHeight - 0.18));
      const y = frame === 'top' ? centerY + offset : centerY - offset;
      return Math.max(startY + 0.12, Math.min(endY - 0.12, y));
    };
    const getSlotWidthEditorY = (slot: FreePlacementGuideSlot) => {
      const [startY, endY] = getSlotYRange(slot);
      const centerY = (startY + endY) / 2;
      const hasTopEditor = !guideTopFrameAllMode && (slot.guideZone || 'full') !== 'lower';
      const hasBaseEditor = !guideBaseFrameAllMode && (slot.guideZone || 'full') !== 'upper';
      const halfHeight = Math.max(0, (endY - startY) / 2);
      const offset = Math.min(1.05, Math.max(0.35, halfHeight - 0.45));

      if (hasTopEditor && hasBaseEditor) return centerY;
      if (hasTopEditor) return Math.max(startY + 0.22, Math.min(endY - 0.22, centerY - offset));
      if (hasBaseEditor) return Math.max(startY + 0.22, Math.min(endY - 0.22, centerY + offset));

      return centerY;
    };
    const topFrameSlots = guideSlots
      .filter((slot) => (slot.guideZone || 'full') !== 'lower')
      .sort((a, b) => a.x - b.x || a.index - b.index);
    const baseFrameSlots = guideSlots
      .filter((slot) => (slot.guideZone || 'full') !== 'upper')
      .sort((a, b) => a.x - b.x || a.index - b.index);
    const toAlpha = (n: number) => String.fromCharCode(64 + n);
    const commitNumber = (raw: string, commit: (v: number) => void, min = 0, max = 9999) => {
      const parsed = Math.round(parseFloat(raw));
      if (!Number.isFinite(parsed)) return;
      commit(Math.max(min, Math.min(max, parsed)));
    };
    const updateGuideSlotFrame = (slotId: string, updates: Partial<FreePlacementGuideSlot>) => {
      setSpaceInfo({
        freePlacementGuides: (spaceInfo.freePlacementGuides || []).map((slot) => (
          slot.id === slotId ? { ...slot, ...updates } : slot
        ))
      });
    };
    const syncGuideBaseFrameAll = (
      baseConfigUpdates: Record<string, any>,
      slotUpdates: Partial<FreePlacementGuideSlot>,
      moduleUpdates: Record<string, any>
    ) => {
      const nextSpaceInfo: Record<string, any> = {
        baseConfig: {
          ...(spaceInfo.baseConfig as any),
          ...baseConfigUpdates
        }
      };
      const currentGuides = spaceInfo.freePlacementGuides || [];
      if (currentGuides.length > 0) {
        nextSpaceInfo.freePlacementGuides = currentGuides.map((slot) => (
          (slot.guideZone || 'full') === 'upper'
            ? slot
            : { ...slot, ...slotUpdates }
        ));
      }
      setSpaceInfo(nextSpaceInfo);
      guideBaseCandidateModules.forEach((module) => {
        const category = getGuideModuleCategory(module);
        if (category !== 'lower' && category !== 'full') return;
        updatePlacedModule(module.id, moduleUpdates);
      });
    };
    const getSlotTopEnabled = (slot: FreePlacementGuideSlot) => slot.hasTopFrame ?? isGlobalTopFrameEnabled;
    const getSlotTopThickness = (slot: FreePlacementGuideSlot) => (
      resolveFrameRawSize(
        slot.topFrameThickness,
        (spaceInfo.frameSize?.top ?? 0) > 0 ? spaceInfo.frameSize?.top : (slot.topFrameGap ?? gMoldingGap),
        getSlotTopGap(slot)
      )
    );
    const getSlotTopGap = (slot: FreePlacementGuideSlot) => (
      getSlotTopEnabled(slot) ? (slot.topFrameGap ?? 0) : resolveGuideSlotTopGap(slot)
    );
    const getSlotTopVisibleSize = (slot: FreePlacementGuideSlot) => (
      getSlotTopEnabled(slot) ? Math.max(0, getSlotTopThickness(slot)) : 0
    );
    const getSlotBaseEnabled = (slot: FreePlacementGuideSlot) => resolveSlotBaseEnabled(slot);
    const getSlotBaseHeight = (slot: FreePlacementGuideSlot) => (
      resolveSlotBaseHeightMm(slot)
    );
    const getSlotBaseGap = (slot: FreePlacementGuideSlot) => (
      getSlotBaseEnabled(slot) ? resolveSlotBaseGapMm(slot) : 0
    );
    const getSlotBaseVisibleSize = (slot: FreePlacementGuideSlot) => (
      getSlotBaseEnabled(slot) ? Math.max(0, getSlotBaseHeight(slot)) : 0
    );
    const frameEditorPanelStyle: React.CSSProperties = {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      padding: 0,
      background: 'transparent',
      boxShadow: 'none'
    };
    const frameAllEditorPanelStyle: React.CSSProperties = {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      padding: 0,
      background: 'transparent',
      boxShadow: 'none'
    };
    const frameAllCheckboxStyle: React.CSSProperties = {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      color: guideColor,
      fontSize: 10,
      fontWeight: 900,
      cursor: 'pointer',
      whiteSpace: 'nowrap'
    };
    const topFrameEditorY = Math.min(fullHeight + 0.38, ((yUpperTop + fullHeightMm) / 2) * 0.01 + 0.46);
    const baseFrameEditorY = Math.max(-0.38, (yBaseTop / 2) * 0.01 - 0.46);
    const frameRowsStyle: React.CSSProperties = {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      flexWrap: 'nowrap'
    };
    const frameRowStyle: React.CSSProperties = {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      padding: 0,
      background: 'transparent'
    };
    const makeFrameInputStyle = (compact = false): React.CSSProperties => ({
      width: compact ? 26 : 36,
      padding: '2px 3px',
      fontSize: compact ? 10 : 11,
      fontWeight: 700,
      textAlign: 'center',
      border: `1.5px solid ${guideColor}`,
      borderRadius: 4,
      outline: 'none',
      background: 'color-mix(in srgb, var(--theme-background) 88%, transparent)',
      color: guideColor,
      lineHeight: 1.1
    });
    const frameToggleStyle = (enabled: boolean): React.CSSProperties => ({
      width: 28,
      height: 16,
      padding: 0,
      borderRadius: 8,
      border: `1px solid ${guideColor}`,
      background: enabled ? guideColor : 'transparent',
      cursor: 'pointer',
      position: 'relative',
      flexShrink: 0,
      transition: 'background-color 0.2s'
    });
    const frameToggleKnobStyle = (enabled: boolean): React.CSSProperties => ({
      position: 'absolute',
      top: 2,
      left: enabled ? 16 : 2,
      width: 10,
      height: 10,
      borderRadius: '50%',
      background: enabled ? '#fff' : guideColor,
      transition: 'left 0.2s',
      boxShadow: enabled ? 'none' : '0 1px 2px rgba(15, 23, 42, 0.22)'
    });
    const frameField = (labelText: string, value: number, commit: (v: number) => void, keyName: string, min = 0, max = 9999, compact = false) => (
      <label key={keyName} style={{ display: 'flex', alignItems: 'center', gap: compact ? 1 : 2 }}>
        {labelText && !compact && <span style={{ fontSize: 9, fontWeight: 800, color: guideColor, lineHeight: 1, whiteSpace: 'nowrap' }}>{labelText}</span>}
        <input
          type="number"
          aria-label={labelText || keyName}
          defaultValue={Math.round(value)}
          key={`${keyName}-${Math.round(value)}`}
          onPointerDown={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          onBlur={(e) => commitNumber(e.target.value, commit, min, max)}
          style={makeFrameInputStyle(compact)}
        />
      </label>
    );
    const topAllSize = Math.max(0, gTopMolding);
    const baseAllSize = Math.max(0, isFloatingBase ? gFloatHeight : gBaseboard);
    const renderTopFrameEditorRow = (
      labelText: string,
      enabled: boolean,
      size: number,
      offset: number,
      gap: number,
      onToggle: () => void,
      onSize: (v: number) => void,
      onOffset: (v: number) => void,
      onGap: (v: number, nextSize?: number) => void,
      compact = false
    ) => {
      const toggle = (
        <button type="button" aria-label="상단몰딩 토글" onClick={onToggle} style={frameToggleStyle(enabled)}>
          <span style={frameToggleKnobStyle(enabled)} />
        </button>
      );
      const fields = enabled ? (
        <>
          {frameField('', size, onSize, `${labelText}-top-size`, 0, 9999, compact)}
          {frameField('옵셋', offset, onOffset, `${labelText}-top-offset`, -500, 500, compact)}
          {frameField('갭', gap, onGap, `${labelText}-top-gap`, 0, 2000, compact)}
        </>
      ) : (
        frameField(compact ? '갭' : '상단갭', gap, onGap, `${labelText}-top-clearance`, 0, 2000, compact)
      );

      if (compact) {
        return (
          <div key={`top-frame-row-${labelText}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: 0, background: 'transparent' }}>
            {toggle}
            <div style={{ ...frameRowStyle, gap: 2 }}>
              {fields}
            </div>
          </div>
        );
      }

      return (
        <div key={`top-frame-row-${labelText}`} style={{ ...frameRowStyle, gap: 4 }}>
          {labelText && <span style={{ minWidth: 28, color: guideColor, fontSize: 10, fontWeight: 900, whiteSpace: 'nowrap' }}>{labelText}</span>}
          {toggle}
          {fields}
        </div>
      );
    };
    const renderBaseFrameEditorRow = (
      labelText: string,
      enabled: boolean,
      size: number,
      offset: number,
      gap: number,
      floatHeight: number,
      onToggle: () => void,
      onSize: (v: number) => void,
      onOffset: (v: number) => void,
      onGap: (v: number, nextSize?: number) => void,
      onFloat: (v: number) => void,
      compact = false
    ) => {
      const toggle = (
        <button type="button" aria-label="걸레받이 토글" onClick={onToggle} style={frameToggleStyle(enabled)}>
          <span style={frameToggleKnobStyle(enabled)} />
        </button>
      );
      const fields = enabled ? (
        <>
          {frameField('', size, onSize, `${labelText}-base-size`, 0, 9999, compact)}
          {frameField('옵셋', offset, onOffset, `${labelText}-base-offset`, -500, 500, compact)}
          {frameField('갭', gap, onGap, `${labelText}-base-gap`, 0, 2000, compact)}
        </>
      ) : (
        frameField(compact ? '띄움' : '띄움높이', floatHeight, onFloat, `${labelText}-base-float`, 0, 2000, compact)
      );

      if (compact) {
        return (
          <div key={`base-frame-row-${labelText}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: 0, background: 'transparent' }}>
            {toggle}
            <div style={{ ...frameRowStyle, gap: 2 }}>
              {fields}
            </div>
          </div>
        );
      }

      return (
        <div key={`base-frame-row-${labelText}`} style={{ ...frameRowStyle, gap: 4 }}>
          {labelText && <span style={{ minWidth: 28, color: guideColor, fontSize: 10, fontWeight: 900, whiteSpace: 'nowrap' }}>{labelText}</span>}
          {toggle}
          {fields}
        </div>
      );
    };
    const renderFrameSettingEditors = () => (
      <>
        {guideTopFrameAllMode ? (
          <Html
            key="guide-top-frame-settings"
            position={[0, topFrameEditorY, guideZ]}
            center zIndexRange={[200, 0]} style={{ pointerEvents: 'auto', userSelect: 'none' }}
          >
            <div style={{ ...frameAllEditorPanelStyle, ...guideHtmlScaleStyle }} onPointerDown={(e) => e.stopPropagation()}>
              <label style={frameAllCheckboxStyle}>
                <input
                  type="checkbox"
                  checked={guideTopFrameAllMode}
                  onChange={(e) => setSpaceInfo({ guideTopFrameAllMode: e.target.checked })}
                  style={{ width: 12, height: 12, margin: 0, accentColor: guideColor }}
                />
                <span>전체</span>
              </label>
              <div style={frameRowsStyle}>
                {renderTopFrameEditorRow(
                  '',
                  isGlobalTopFrameEnabled,
                  topAllSize,
                  gMoldingOffset,
                  isGlobalTopFrameEnabled ? gMoldingGap : gTopClearance,
                  () => {
                    setSpaceInfo({
                      frameSize: isGlobalTopFrameEnabled
                        ? { ...(spaceInfo.frameSize as any), top: 0, topGap: Math.max(0, gTopClearance) }
                        : { ...(spaceInfo.frameSize as any), top: Math.max(1, gMoldingGap || gTopClearance || 30), topGap: 0 }
                    });
                  },
                  (v) => setSpaceInfo({ frameSize: { ...(spaceInfo.frameSize as any), top: v } }),
                  (v) => setSpaceInfo({ frameSize: { ...(spaceInfo.frameSize as any), topOffset: v } }),
                  (v, nextSize) => setSpaceInfo({
                    frameSize: {
                      ...(spaceInfo.frameSize as any),
                      ...(isGlobalTopFrameEnabled ? {} : { top: 0 }),
                      ...(nextSize !== undefined ? { top: nextSize } : {}),
                      topGap: Math.max(0, v)
                    }
                  })
                )}
              </div>
            </div>
          </Html>
        ) : (
          <>
            <Html
              key="guide-top-frame-all-toggle"
              position={[0, fullHeight + 0.52, guideZ]}
              center zIndexRange={[200, 0]} style={{ pointerEvents: 'auto', userSelect: 'none' }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: 3, color: guideColor, fontSize: 10, fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap', ...guideHtmlScaleStyle }}>
                <input
                  type="checkbox"
                  checked={guideTopFrameAllMode}
                  onChange={(e) => setSpaceInfo({ guideTopFrameAllMode: e.target.checked })}
                  style={{ width: 12, height: 12, margin: 0, accentColor: guideColor }}
                />
                <span>전체</span>
              </label>
            </Html>
            {topFrameSlots.map((slot) => {
              const enabled = getSlotTopEnabled(slot);
              const topGap = getSlotTopGap(slot);
              const thickness = getSlotTopThickness(slot);
              const slotCenterX = (slot.x + slot.width / 2 - spaceHalfWidth) * 0.01;
              const slotTopControlY = getSlotFrameControlY(slot, 'top');
              return (
                <Html
                  key={`guide-top-frame-slot-${slot.id}`}
                  position={[slotCenterX, slotTopControlY, guideZ]}
                  center zIndexRange={[200, 0]} style={{ pointerEvents: 'auto', userSelect: 'none' }}
                >
                  <div style={{ ...frameEditorPanelStyle, ...guideHtmlScaleStyle }} onPointerDown={(e) => e.stopPropagation()}>
                    {renderTopFrameEditorRow(
                      '',
                      enabled,
                      getSlotTopVisibleSize(slot),
                      slot.topFrameOffset ?? gMoldingOffset,
                      topGap,
                      () => updateGuideSlotFrame(slot.id, {
                        hasTopFrame: !enabled,
                        topFrameGap: 0,
                        topFrameGapUserSet: false,
                        topFrameThickness: thickness
                      }),
                      (v) => updateGuideSlotFrame(slot.id, { topFrameThickness: v }),
                      (v) => updateGuideSlotFrame(slot.id, { topFrameOffset: v }),
                      (v, nextSize) => updateGuideSlotFrame(slot.id, {
                        ...(nextSize !== undefined ? { topFrameThickness: nextSize } : {}),
                        topFrameGap: Math.max(0, v),
                        topFrameGapUserSet: true
                      }),
                      true
                    )}
                  </div>
                </Html>
              );
            })}
          </>
        )}
        {guideBaseFrameAllMode ? (
          <Html
            key="guide-base-frame-settings"
            position={[0, baseFrameEditorY, guideZ]}
            center zIndexRange={[200, 0]} style={{ pointerEvents: 'auto', userSelect: 'none' }}
          >
            <div style={{ ...frameAllEditorPanelStyle, ...guideHtmlScaleStyle }} onPointerDown={(e) => e.stopPropagation()}>
              <div style={frameRowsStyle}>
                {renderBaseFrameEditorRow(
                  '',
                  isGlobalBaseFrameEnabled,
                  baseAllSize,
                  gBaseOffset,
                  gBaseGap,
                  gFloatHeight,
                  () => {
                    const nextEnabled = !isGlobalBaseFrameEnabled;
                    const nextBaseHeight = nextEnabled ? Math.max(1, spaceInfo.baseConfig?.height || 65) : 0;
                    syncGuideBaseFrameAll(
                      isGlobalBaseFrameEnabled
                        ? { type: 'stand', placementType: 'float', height: 0, floatHeight: 0 }
                        : { type: 'floor', placementType: 'ground', height: nextBaseHeight },
                      isGlobalBaseFrameEnabled
                        ? { hasBase: false, hasBottomFrame: false, individualFloatHeight: 0 }
                        : { hasBase: true, hasBottomFrame: true, baseFrameHeight: nextBaseHeight },
                      isGlobalBaseFrameEnabled
                        ? { hasBase: false, hasBottomFrame: false, individualFloatHeight: 0 }
                        : { hasBase: true, hasBottomFrame: true, baseFrameHeight: nextBaseHeight }
                    );
                  },
                  (v) => {
                      const nextHeight = v;
                      syncGuideBaseFrameAll(
                        { type: 'floor', placementType: 'ground', height: nextHeight },
                        { hasBase: true, hasBottomFrame: true, baseFrameHeight: nextHeight, baseFrameOffset: gBaseOffset, baseFrameGap: gBaseGap },
                        { hasBase: true, hasBottomFrame: true, baseFrameHeight: nextHeight, baseFrameOffset: gBaseOffset, baseFrameGap: gBaseGap }
                      );
                    },
                  (v) => syncGuideBaseFrameAll(
                    { offset: v },
                    { baseFrameOffset: v },
                    { baseFrameOffset: v }
                  ),
                  (v) => {
                    const nextGap = Math.max(0, v);
                    syncGuideBaseFrameAll(
                      { gap: nextGap },
                      { baseFrameGap: nextGap },
                      { baseFrameGap: nextGap }
                    );
                  },
                  (v) => syncGuideBaseFrameAll(
                    { type: 'stand', placementType: 'float', height: 0, floatHeight: v },
                    { hasBase: false, hasBottomFrame: false, individualFloatHeight: v },
                    { hasBase: false, hasBottomFrame: false, individualFloatHeight: v }
                  )
                )}
              </div>
              <label style={frameAllCheckboxStyle}>
                <input
                  type="checkbox"
                  checked={guideBaseFrameAllMode}
                  onChange={(e) => setSpaceInfo({ guideBaseFrameAllMode: e.target.checked })}
                  style={{ width: 12, height: 12, margin: 0, accentColor: guideColor }}
                />
                <span>전체</span>
              </label>
            </div>
          </Html>
        ) : (
          <>
            <Html
              key="guide-base-frame-all-toggle"
              position={[0, -0.52, guideZ]}
              center zIndexRange={[200, 0]} style={{ pointerEvents: 'auto', userSelect: 'none' }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: 3, color: guideColor, fontSize: 10, fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap', ...guideHtmlScaleStyle }}>
                <input
                  type="checkbox"
                  checked={guideBaseFrameAllMode}
                  onChange={(e) => setSpaceInfo({ guideBaseFrameAllMode: e.target.checked })}
                  style={{ width: 12, height: 12, margin: 0, accentColor: guideColor }}
                />
                <span>전체</span>
              </label>
            </Html>
            {baseFrameSlots.map((slot) => {
              const enabled = getSlotBaseEnabled(slot);
              const baseGap = getSlotBaseGap(slot);
              const baseHeight = getSlotBaseHeight(slot);
              const slotCenterX = (slot.x + slot.width / 2 - spaceHalfWidth) * 0.01;
              const slotBaseControlY = getSlotFrameControlY(slot, 'base');
              return (
                <Html
                  key={`guide-base-frame-slot-${slot.id}`}
                  position={[slotCenterX, slotBaseControlY, guideZ]}
                  center zIndexRange={[200, 0]} style={{ pointerEvents: 'auto', userSelect: 'none' }}
                >
                  <div style={{ ...frameEditorPanelStyle, ...guideHtmlScaleStyle }} onPointerDown={(e) => e.stopPropagation()}>
                    {renderBaseFrameEditorRow(
                      '',
                      enabled,
                      getSlotBaseVisibleSize(slot),
                      slot.baseFrameOffset ?? gBaseOffset,
                      baseGap,
                      slot.individualFloatHeight ?? 0,
                      () => updateGuideSlotFrame(slot.id, {
                        hasBase: !enabled,
                        individualFloatHeight: enabled ? baseGap : slot.individualFloatHeight ?? baseGap,
                        baseFrameHeight: baseHeight
                      }),
                      (v) => updateGuideSlotFrame(slot.id, { baseFrameHeight: v }),
                      (v) => updateGuideSlotFrame(slot.id, { baseFrameOffset: v }),
                      (v, nextSize) => updateGuideSlotFrame(slot.id, {
                        ...(nextSize !== undefined ? { baseFrameHeight: nextSize } : {}),
                        baseFrameGap: Math.max(0, v)
                      }),
                      (v) => updateGuideSlotFrame(slot.id, { individualFloatHeight: v }),
                      true
                    )}
                  </div>
                </Html>
              );
            })}
          </>
        )}
      </>
    );

    const renderFloorFinishGuideLayer = () => {
      if (gFloorFinish <= 0) return null;
      const bounds = getFreePlacementGuideBoundsX(spaceInfo);
      const leftX = bounds.startX * 0.01;
      const rightX = bounds.endX * 0.01;
      const width = Math.max(0.001, rightX - leftX);
      const height = Math.max(0.001, gFloorFinish * 0.01);
      const centerX = (leftX + rightX) / 2;
      const centerY = height / 2;

      return (
        <group key="free-guide-floor-finish-layer">
          <mesh position={[centerX, centerY, guideZ - 0.003]} renderOrder={99997}>
            <planeGeometry args={[width, height]} />
            <meshBasicMaterial
              color="#94a3b8"
              transparent
              opacity={0.18}
              side={DoubleSide}
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
          <NativeLine
            name="free-placement-guide-line"
            points={[[leftX, gFloorFinish * 0.01, guideZ + 0.001], [rightX, gFloorFinish * 0.01, guideZ + 0.001]]}
            color="#64748b"
            lineWidth={1.4}
            dashed
            dashSize={0.06}
            gapSize={0.04}
            opacity={0.75}
            transparent
            depthTest={false}
            depthWrite={false}
            renderOrder={100002}
          />
        </group>
      );
    };

    // 전체 폭 공통 경계(바닥/걸레받이상단/상부장상단/천장): 몰딩·걸레받이는 전체 공통
    const fullWidthBoundaryYmm = [
      0,
      ...(gFloorFinish > 0 ? [gFloorFinish] : []),
      ...(guideBaseFrameAllMode && gBaseGap > 0 ? [yBaseGapTop + gFloorFinish] : []),
      ...(guideBaseFrameAllMode ? [ySplitLowerBaseTop] : []),
      yUpperTop,
      fullHeightMm
    ];
    const sectionBoundaryYmm = hasSplitSlots ? [yLowerVisualTop, yMidTop] : [yLowerVisualTop];
    const tierLineLeftX = -spaceHalfWidth * 0.01;
    const tierLineRightX = spaceHalfWidth * 0.01;
    const tierLineProps = {
      color: guideColor, lineWidth: 1.2, dashed: true, dashSize: 0.08, gapSize: 0.05,
      opacity: 0.5, transparent: true, depthTest: false, depthWrite: false, renderOrder: 100000,
    } as const;
    const renderTierLines = () => [
      // 전체 폭 공통 선
      ...fullWidthBoundaryYmm.map((ymm, i) => (
        <NativeLine
          key={`guide-tier-full-${i}`}
          name="free-placement-guide-line"
          points={[[tierLineLeftX, ymm * 0.01, guideZ], [tierLineRightX, ymm * 0.01, guideZ]]}
          {...tierLineProps}
        />
      )),
      // 섹션 경계 — 분할 슬롯은 미드웨이 위/아래, 비분할 슬롯은 상부/하부 경계만 표시
      ...sectionBoundaryYmm.flatMap((ymm, yi) =>
        heightSectionLineSegments.map((segment, si) => (
          <NativeLine
            key={`guide-tier-mid-${yi}-${si}`}
            name="free-placement-guide-line"
            points={[
              [(segment.startX - spaceInfo.width / 2) * 0.01, ymm * 0.01, guideZ],
              [(segment.endX - spaceInfo.width / 2) * 0.01, ymm * 0.01, guideZ],
            ]}
            {...tierLineProps}
          />
        ))
      ),
    ];
    const renderFrameSectionHorizontalLines = () => {
      const makeSectionLines = (
        slots: FreePlacementGuideSlot[],
        yValuesMm: number[] | ((slot: FreePlacementGuideSlot) => number[]),
        sectionKey: string
      ) => slots.flatMap((slot) => {
        const leftX = (slot.x - spaceInfo.width / 2) * 0.01;
        const rightX = (slot.x + slot.width - spaceInfo.width / 2) * 0.01;
        const slotYValuesMm = typeof yValuesMm === 'function' ? yValuesMm(slot) : yValuesMm;
        const isSelected = selectedGuideSlotIds.includes(slot.id);
        const lineProps = {
          color: guideColor,
          lineWidth: isSelected ? 2.6 : 1.2,
          dashed: true,
          dashSize: 0.08,
          gapSize: 0.05,
          opacity: isSelected ? 0.95 : 0.42,
          transparent: true,
          depthTest: false,
          depthWrite: false,
          renderOrder: 100001,
        } as const;

        return slotYValuesMm.map((ymm) => (
          <NativeLine
            key={`free-guide-${sectionKey}-boundary-y-${ymm}-${slot.id}`}
            name="free-placement-guide-line"
            points={[[leftX, ymm * 0.01, guideZ], [rightX, ymm * 0.01, guideZ]]}
            {...lineProps}
          />
        ));
      });

      const enabledBaseSlots = baseFrameSlots.filter(getSlotBaseEnabled);

      return [
        ...(!guideBaseFrameAllMode
          ? makeSectionLines(
            enabledBaseSlots,
            (slot) => [
              ...(resolveSlotBaseGapMm(slot) > 0 ? [resolveSlotBaseGapTopMm(slot)] : []),
              resolveSlotBaseTopMm(slot)
            ],
            'base-frame'
          )
          : [])
      ];
    };
    const renderFrameSectionVerticalLines = () => {
      const makeSectionLines = (
        slots: FreePlacementGuideSlot[],
        yRangeMm: [number, number] | ((slot: FreePlacementGuideSlot) => [number, number]),
        sectionKey: string
      ) => {
        const visibleSlots = slots.filter((slot) => (
          sectionKey !== 'base-frame' || getSlotBaseEnabled(slot)
        ));

        return visibleSlots.flatMap((slot) => {
          const [startYmm, endYmm] = typeof yRangeMm === 'function' ? yRangeMm(slot) : yRangeMm;
          if (endYmm - startYmm <= 0.5) return [];
          const leftX = (slot.x - spaceInfo.width / 2) * 0.01;
          const rightX = (slot.x + slot.width - spaceInfo.width / 2) * 0.01;
          const startY = startYmm * 0.01;
          const endY = endYmm * 0.01;
          const isSelected = selectedGuideSlotIds.includes(slot.id);
          const lineProps = {
            color: guideColor,
            lineWidth: isSelected ? 2.6 : 1.2,
            dashed: true,
            dashSize: 0.08,
            gapSize: 0.05,
            opacity: isSelected ? 0.95 : 0.42,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            renderOrder: 100001,
          } as const;

          return [
            <NativeLine
              key={`free-guide-${sectionKey}-boundary-left-${slot.id}`}
              name="free-placement-guide-line"
              points={[[leftX, startY, guideZ], [leftX, endY, guideZ]]}
              {...lineProps}
            />,
            <NativeLine
              key={`free-guide-${sectionKey}-boundary-right-${slot.id}`}
              name="free-placement-guide-line"
              points={[[rightX, startY, guideZ], [rightX, endY, guideZ]]}
              {...lineProps}
            />
          ];
        });
      };

      return [
        ...(!guideTopFrameAllMode ? makeSectionLines(topFrameSlots, [yUpperTop, fullHeightMm], 'top-frame') : []),
        ...(!guideBaseFrameAllMode ? makeSectionLines(baseFrameSlots, (slot) => [0, resolveSlotBaseTopMm(slot)], 'base-frame') : [])
      ];
    };

    return (
      <>
        {showGuideHeightSections && renderTierLines()}
        {showGuideHeightSections && renderFrameSectionHorizontalLines()}
        {showGuideHeightSections && renderFrameSectionVerticalLines()}
        {isGuideEditing && selectedGuideSlotIds.length > 0 && (
          <mesh
            key="free-guide-slot-selection-clear-plane"
            position={[0, fullHeight / 2, guideZ - 0.01]}
            onPointerDown={(event: any) => {
              event.stopPropagation();
              (window as any).__r3fClickHandled = true;
              setSelectedGuideAnchorSlotId(null);
              setSelectedGuideSlotIds([]);
            }}
          >
            <planeGeometry args={[(spaceInfo.width + 260) * 0.01, fullHeight + 2.6]} />
            <meshBasicMaterial
              color={guideColor}
              transparent
              opacity={0}
              side={DoubleSide}
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
        )}
        {selectedGuideSlotRanges.map((range) => (
          <React.Fragment key={`free-guide-slot-arrow-${range.key}`}>
            <Html
              position={[range.leftX - 0.08, range.centerY, guideZ + 0.012]}
              center
              zIndexRange={[180, 0]}
              style={{ pointerEvents: 'auto', userSelect: 'none', background: 'transparent' }}
            >
              <button
                type="button"
                aria-label="선택 슬롯 왼쪽으로 이동"
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  applySelectedGuideSlotKeyboardEdit('move-left', event.shiftKey ? 10 : 1);
                }}
                style={{
                  color: guideColor,
                  width: 26,
                  height: 26,
                  padding: 0,
                  border: 'none',
                  borderRadius: 999,
                  background: 'transparent',
                  fontSize: '18px',
                  fontWeight: 900,
                  lineHeight: 1,
                  textShadow: '0 1px 2px rgba(15, 23, 42, 0.22)',
                  cursor: 'pointer'
                }}
              >
                ‹
              </button>
            </Html>
            <Html
              position={[range.rightX + 0.08, range.centerY, guideZ + 0.012]}
              center
              zIndexRange={[180, 0]}
              style={{ pointerEvents: 'auto', userSelect: 'none', background: 'transparent' }}
            >
              <button
                type="button"
                aria-label="선택 슬롯 오른쪽으로 이동"
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  applySelectedGuideSlotKeyboardEdit('move-right', event.shiftKey ? 10 : 1);
                }}
                style={{
                  color: guideColor,
                  width: 26,
                  height: 26,
                  padding: 0,
                  border: 'none',
                  borderRadius: 999,
                  background: 'transparent',
                  fontSize: '18px',
                  fontWeight: 900,
                  lineHeight: 1,
                  textShadow: '0 1px 2px rgba(15, 23, 42, 0.22)',
                  cursor: 'pointer'
                }}
              >
                ›
              </button>
            </Html>
          </React.Fragment>
        ))}
        {showGuideHeightSections && renderHeightTiers(-(spaceHalfWidth + 120) * 0.01, isGuideEditing)}
        {showGuideHeightSections && renderHeightTiers((spaceHalfWidth + 120) * 0.01, isGuideEditing)}
        {renderFloorFinishGuideLayer()}
        {isGuideEditing && renderFrameSettingEditors()}
        {!isGuideEditing && guideSlots.map((slot) => {
          const canPlaceInSlot = canUseGuideSlot(slot);
          const canShowPlacementSlot = !isGuideSlotOccupied(slot) && (!selectedModuleData || canPlaceInSlot);
          if (!canShowPlacementSlot) return null;

          const [startY, endY] = getSlotYRange(slot);
          const leftX = (slot.x - spaceInfo.width / 2) * 0.01;
          const rightX = (slot.x + slot.width - spaceInfo.width / 2) * 0.01;
          const centerX = (leftX + rightX) / 2;
          const centerY = (startY + endY) / 2;
          const width = Math.max(0.001, rightX - leftX);
          const height = Math.max(0.001, endY - startY);

          return (
            <mesh
              key={`free-guide-placement-slot-mesh-${slot.id}`}
              position={[centerX, centerY, guideZ - 0.002]}
              renderOrder={99998}
              onPointerDown={(event: any) => {
                event.stopPropagation();
                (window as any).__r3fClickHandled = true;
                if (canPlaceInSlot) {
                  window.dispatchEvent(new CustomEvent('free-placement-guide:slot-click', { detail: slot }));
                }
              }}
              onPointerEnter={() => {
                if (canPlaceInSlot) {
                  window.dispatchEvent(new CustomEvent('free-placement-guide:slot-hover', { detail: slot }));
                }
              }}
              onPointerLeave={() => {
                window.dispatchEvent(new CustomEvent('free-placement-guide:slot-leave', { detail: slot }));
              }}
            >
              <planeGeometry args={[width, height]} />
              <meshBasicMaterial
                color={guideColor}
                transparent
                opacity={0.08}
                side={DoubleSide}
                depthTest={false}
                depthWrite={false}
              />
            </mesh>
          );
        })}
        {isGuideEditing && guideSlots.map((slot) => {
          const [startY, endY] = getSlotYRange(slot);
          const leftX = (slot.x - spaceInfo.width / 2) * 0.01;
          const rightX = (slot.x + slot.width - spaceInfo.width / 2) * 0.01;
          const centerX = (leftX + rightX) / 2;
          const centerY = (startY + endY) / 2;
          const width = Math.max(0.001, rightX - leftX);
          const height = Math.max(0.001, endY - startY);
          const isSelected = selectedGuideSlotIds.includes(slot.id);
          const selectedLineProps = {
            color: guideColor,
            lineWidth: 2.8,
            opacity: 0.96,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            renderOrder: 100004
          } as const;

          return (
            <group key={`free-guide-slot-select-${slot.id}`}>
              <mesh
                position={[centerX, centerY, guideZ + 0.002]}
                onPointerDown={(event: any) => {
                  event.stopPropagation();
                  (window as any).__r3fClickHandled = true;
                  selectGuideSlot(slot.id, event.shiftKey === true);
                }}
              >
                <planeGeometry args={[width, height]} />
                <meshBasicMaterial
                  color={guideColor}
                  transparent
                  opacity={isSelected ? 0.12 : 0.001}
                  side={DoubleSide}
                  depthTest={false}
                  depthWrite={false}
                />
              </mesh>
              {isSelected && (
                <>
                  <NativeLine
                    key={`selected-top-${slot.id}`}
                    name="free-placement-guide-line"
                    points={[[leftX, endY, guideZ + 0.004], [rightX, endY, guideZ + 0.004]]}
                    {...selectedLineProps}
                  />
                  <NativeLine
                    key={`selected-bottom-${slot.id}`}
                    name="free-placement-guide-line"
                    points={[[leftX, startY, guideZ + 0.004], [rightX, startY, guideZ + 0.004]]}
                    {...selectedLineProps}
                  />
                  <NativeLine
                    key={`selected-left-${slot.id}`}
                    name="free-placement-guide-line"
                    points={[[leftX, startY, guideZ + 0.004], [leftX, endY, guideZ + 0.004]]}
                    {...selectedLineProps}
                  />
                  <NativeLine
                    key={`selected-right-${slot.id}`}
                    name="free-placement-guide-line"
                    points={[[rightX, startY, guideZ + 0.004], [rightX, endY, guideZ + 0.004]]}
                    {...selectedLineProps}
                  />
                </>
              )}
            </group>
          );
        })}
        {guideSlots.flatMap((slot) => {
          const [startY, endY] = getSlotYRange(slot);
          const leftX = (slot.x - spaceInfo.width / 2) * 0.01;
          const rightX = (slot.x + slot.width - spaceInfo.width / 2) * 0.01;
          const isSelected = selectedGuideSlotIds.includes(slot.id);

          return [
            <NativeLine
              key={`free-guide-boundary-left-${slot.id}`}
              name="free-placement-guide-line"
              points={[
                [leftX, startY, guideZ],
                [leftX, endY, guideZ]
              ]}
              color={guideColor}
              lineWidth={isSelected ? 2.6 : 1.2}
              dashed
              dashSize={0.08}
              gapSize={0.05}
              opacity={isSelected ? 0.95 : 0.42}
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
              lineWidth={isSelected ? 2.6 : 1.2}
              dashed
              dashSize={0.08}
              gapSize={0.05}
              opacity={isSelected ? 0.95 : 0.42}
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
          if (!shouldShowSlotWidthLabel(slot)) return null;
          if (!isGuideEditing && isGuideSlotOccupied(slot)) return null;

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
                  ...guideHtmlScaleStyle,
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
          const canMergeWithAnotherSlot = guideSlots.some((item) => (
            item.id !== slot.id
            && (
              canMergeGuideSlotsHorizontally(slot, item)
              || canMergeGuideSlotsVertically(slot, item)
            )
          ));

          return (
            <Html
              key={slot.id}
              position={[centerX, getSlotWidthEditorY(slot), 0]}
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
                  if (isGuideEditing) {
                    selectGuideSlot(slot.id, e.shiftKey === true);
                    return;
                  }
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
                  pointerEvents: 'auto',
                  ...guideHtmlScaleStyle
                }}
              >
                {canShowPlacementHotspot && (
                  <button
                    type="button"
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--theme-primary)',
                      border: '2px solid white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                      transition: 'all 0.2s ease',
                      color: 'white',
                      lineHeight: '1',
                      padding: 0,
                      animation: 'guideSlotPulse 0.8s ease-in-out infinite'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.15)';
                      e.currentTarget.style.opacity = '0.8';
                      e.currentTarget.style.animation = 'none';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.opacity = '1';
                      e.currentTarget.style.animation = 'guideSlotPulse 0.8s ease-in-out infinite';
                    }}
                  >
                    <Plus size={19} strokeWidth={3} style={{ display: 'block' }} aria-hidden="true" />
                  </button>
                )}
                {canShowPlacementHotspot && (
                  <style>{`
                    @keyframes guideSlotPulse {
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
                    onSelect={selectGuideSlot}
                    canRemove={sameAreaSlotCount > 1}
                    canSplit={(slot.guideZone || 'full') === 'full'}
                    canMergeSelect={canMergeWithAnotherSlot}
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
              color: 'white',
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
            <Plus size={19} strokeWidth={3} style={{ display: 'block' }} aria-hidden="true" />
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
