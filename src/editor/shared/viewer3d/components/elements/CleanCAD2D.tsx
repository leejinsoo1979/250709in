import React, { useRef, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { Line, Text, Html } from '@react-three/drei';
import { useThree, useFrame } from '@react-three/fiber';
import NativeLine from './NativeLine';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';
import { getModuleById, calculateEvenShelfPositions } from '@/data/modules';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { useViewerTheme } from '../../context/ViewerThemeContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { getDroppedZoneBounds, getNormalZoneBounds } from '@/editor/shared/utils/space/droppedCeilingUtils';
import { SpaceCalculator } from '@/editor/shared/utils/indexing/SpaceCalculator';
import { ColumnIndexer } from '@/editor/shared/utils/indexing/ColumnIndexer';
import { calculateFrameThickness, calculateInternalSpace, END_PANEL_THICKNESS } from '@/editor/shared/viewer3d/utils/geometry';
import { analyzeColumnSlots, calculateFurnitureBounds } from '@/editor/shared/utils/columnSlotProcessor';
import { isCustomizableModuleId, getCustomDimensionKey, getStandardDimensionKey } from '@/editor/shared/controls/furniture/CustomizableFurnitureLibrary';
import { calcInsertFrameResizedPositionX, calcResizedPositionX, getColumnObstacleBoundsX } from '@/editor/shared/utils/freePlacementUtils';
import { filterSideViewModules } from '@/editor/shared/utils/sideViewModuleFilter';
import { resolveCountertopThicknessMm } from '@/editor/shared/utils/countertopHeightCompensation';
import { resolvePetPanelThicknessMm } from '@/editor/shared/utils/panelThickness';

const formatMmValue = (value: number): string => {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

const resolveTopEndPanelThicknessMm = (module: any): number => {
  if (module?.hasTopEndPanel !== true) return 0;
  return resolvePetPanelThicknessMm(module?.endPanelThickness);
};

const resolveLowerTopFinishThicknessMm = (module: any, spaceInfo: any): number => {
  return Math.max(
    resolveCountertopThicknessMm(module, spaceInfo),
    resolveTopEndPanelThicknessMm(module)
  );
};

interface CleanCAD2DProps {
  viewDirection?: '3D' | 'front' | 'left' | 'right' | 'top';
  showDimensions?: boolean;
  isStep2?: boolean;
  readOnly?: boolean;
}

// 줌아웃 시 Html 내부 UI가 같이 작아지도록 CSS scale 적용하는 래퍼
// (R3F 훅은 <Html> 자식 컨텍스트에서 안전하게 작동하도록 try/catch로 감쌈)
const ZoomScaledBox: React.FC<{ children: React.ReactNode; base?: number; minScale?: number }> = ({ children }) => {
  // 훅 호출 실패 시 렌더 실패 방지: 단순히 div만 그대로 반환
  return <>{children}</>;
};

// 편집 가능한 라벨 컴포넌트를 컴포넌트 밖으로 분리
const EditableLabel: React.FC<{
  columnId: string;
  side: 'left' | 'right' | 'width';
  currentValue: number;
  position: [number, number, number];
  color?: string;
  label: string;
  editingColumnId: string | null;
  editingSide: 'left' | 'right' | 'width' | null;
  editingValue: string;
  handleColumnDistanceEdit: (columnId: string, side: 'left' | 'right' | 'width', currentValue: number) => void;
  handleEditSubmit: () => void;
  handleEditCancel: () => void;
  currentViewDirection: string;
  inputRef: React.RefObject<HTMLInputElement>;
  setEditingValue: (value: string) => void;
}> = ({
  columnId,
  side,
  currentValue,
  position,
  color,
  label,
  editingColumnId,
  editingSide,
  editingValue,
  handleColumnDistanceEdit,
  handleEditSubmit,
  handleEditCancel,
  currentViewDirection,
  inputRef,
  setEditingValue
}) => {
  const view2DTheme = useUIStore(state => state.view2DTheme);
  const isDark = currentViewDirection !== '3D' && view2DTheme === 'dark';
  const isEditing = editingColumnId === columnId && editingSide === side;
  const finalColor = color || (currentViewDirection === '3D' ? '#000000' : '#4CAF50');

  if (isEditing) {
    return (
      <Html
        position={position}
        center
        style={{ pointerEvents: 'auto' }}
        occlude={false}
        zIndexRange={[10000, 10.01]}
        transform={false}
      >
        <div
          style={{
            position: 'relative',
            zIndex: 10000,
            background: isDark
              ? 'rgba(31,41,55,0.98)'
              : (currentViewDirection === '3D' ? 'rgba(255, 255, 255, 0.98)' : 'rgba(255, 255, 255, 0.95)'),
            padding: '4px',
            borderRadius: '4px',
            border: `2px solid ${finalColor}`,
            boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
            minWidth: '80px'
          }}
        >
          <input
            ref={inputRef}
            type="number"
            step="0.1"
            value={editingValue}
            onChange={(e) => setEditingValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleEditSubmit();
              } else if (e.key === 'Escape') {
                handleEditCancel();
              }
            }}
            onBlur={handleEditSubmit}
            style={{
              width: '60px',
              padding: '2px 4px',
              border: `1px solid ${isDark ? '#6b7280' : '#ccc'}`,
              borderRadius: '2px',
              fontSize: '12px',
              fontWeight: 'bold',
              textAlign: 'center',
              outline: 'none',
              backgroundColor: isDark ? '#1f2937' : '#ffffff',
              color: isDark ? '#ffffff' : '#000000',
              colorScheme: isDark ? 'dark' : 'light',
              WebkitAppearance: 'none',
              appearance: 'none',
            }}
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
          <span style={{
            marginLeft: '4px',
            fontSize: '12px',
            fontWeight: 'bold',
            color: isDark ? '#9ca3af' : '#666'
          }}>
            mm
          </span>
        </div>
      </Html>
    );
  }

  return (
    <Html
      position={position}
      center
      style={{ 
        pointerEvents: 'auto',
        position: 'relative',
        zIndex: 99999
      }}
      occlude={false}
      zIndexRange={[9999, 10000]}
      prepend={false}
      portal={undefined}
      transform={false}
      sprite={false}
    >
      <div
        style={{
          background: isDark ? 'rgba(31,41,55,0.95)' : 'rgba(255, 255, 255, 0.95)',
          color: isDark ? '#ffffff' : (currentViewDirection === '3D' ? '#000000' : (finalColor === '#4CAF50' ? '#2E7D32' : '#2196F3')),
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '14px',
          fontWeight: 'bold',
          border: `2px solid ${finalColor}`,
          cursor: 'pointer',
          userSelect: 'none',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          position: 'relative',
          zIndex: 100000,
          pointerEvents: 'auto',
          isolation: 'isolate'
        }}
        onClick={(e) => {
// console.log('🖱️ 라벨 클릭됨:', { columnId, side, currentValue });
          e.preventDefault();
          e.stopPropagation();
          e.nativeEvent?.preventDefault();
          e.nativeEvent?.stopPropagation();
          e.nativeEvent?.stopImmediatePropagation();
          handleColumnDistanceEdit(columnId, side, currentValue);
        }}
        onMouseDown={(e) => {
// console.log('🖱️ 마우스 다운:', { columnId, side, currentValue });
          e.preventDefault();
          e.stopPropagation();
          e.nativeEvent?.preventDefault();
          e.nativeEvent?.stopPropagation();
          e.nativeEvent?.stopImmediatePropagation();
        }}
        onMouseUp={(e) => {
// console.log('🖱️ 마우스 업:', { columnId, side, currentValue });
          e.preventDefault();
          e.stopPropagation();
          e.nativeEvent?.preventDefault();
          e.nativeEvent?.stopPropagation();
          e.nativeEvent?.stopImmediatePropagation();
        }}
        onTouchStart={(e) => {
// console.log('👆 터치 시작:', { columnId, side, currentValue });
          e.preventDefault();
          e.stopPropagation();
          handleColumnDistanceEdit(columnId, side, currentValue);
        }}
      >
        {label}
      </div>
    </Html>
  );
};

/**
 * 미드웨이(상부장~하부장 사이 갭) 편집 UI
 * - 2D 정면뷰 치수선 위에 HTML 오버레이로 배치
 * - 클릭 시 input, Enter/blur 확정, ESC 취소
 */
const MidwayGapEditor: React.FC<{
  value: number;
  color: string;
  onChange: (v: number) => void;
  isDark?: boolean; // deprecated — store에서 직접 구독하므로 무시됨
}> = ({ value, color, onChange }) => {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  // store에서 직접 구독 (prop 전달 지연/누락 차단)
  const view2DTheme = useUIStore(state => state.view2DTheme);
  const viewMode = useUIStore(state => state.viewMode);
  const isDark = viewMode === '2D' && view2DTheme === 'dark';

  useEffect(() => { setText(String(value)); }, [value]);
  useEffect(() => {
    if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
  }, [editing]);

  const commit = () => {
    const n = parseFloat(text);
    if (!isNaN(n) && n > 0 && n !== value) onChange(Math.round(n));
    setEditing(false);
  };

  // 2D 다크모드 대응 (기존 EditableLabel 패턴과 동일)
  const bgBox = isDark ? 'rgba(31,41,55,0.98)' : 'rgba(255,255,255,0.98)';
  const bgInput = isDark ? '#1f2937' : '#ffffff';
  const fgInput = isDark ? '#ffffff' : '#000000';

  if (editing) {
    return (
      <div
        style={{
          background: bgBox,
          border: `2px solid ${color}`,
          borderRadius: 4,
          padding: 4,
          boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="number"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            else if (e.key === 'Escape') { setText(String(value)); setEditing(false); }
          }}
          onBlur={commit}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 60, padding: '2px 4px', fontSize: 13,
            border: `1px solid ${isDark ? '#4b5563' : '#ccc'}`, borderRadius: 2, textAlign: 'center',
            outline: 'none', fontWeight: 'bold',
            background: bgInput,
            color: fgInput,
          }}
        />
      </div>
    );
  }

  // 다크모드에서 텍스트/테두리 색이 검정이면 흰색으로 강제
  const effectiveColor = isDark && (color === '#000000' || color === 'black' || color === '#000') ? '#ffffff' : color;

  return (
    <div
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      onMouseDown={(e) => e.stopPropagation()}
      title="클릭하여 미드웨이 편집 (상부장 하단 확장)"
      style={{
        cursor: 'pointer',
        padding: '3px 8px',
        minWidth: 34,
        textAlign: 'center',
        color: effectiveColor,
        fontSize: 13,
        fontWeight: 'bold',
        background: isDark ? 'rgba(31,41,55,0.85)' : 'rgba(255,255,255,0.92)',
        border: `1px dashed ${effectiveColor}`,
        borderRadius: 3,
        userSelect: 'none',
      }}
    >
      {value}
    </div>
  );
};

const GlassDrawerGapEditor: React.FC<{
  value: number;
  color: string;
  onChange: (value: number) => void;
}> = ({ value, color, onChange }) => {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);
  const view2DTheme = useUIStore(state => state.view2DTheme);
  const viewMode = useUIStore(state => state.viewMode);
  const isDark = viewMode === '2D' && view2DTheme === 'dark';

  useEffect(() => {
    setText(String(value));
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    const next = parseFloat(text);
    if (!Number.isNaN(next) && next >= 0) {
      onChange(Math.round(next));
    } else {
      setText(String(value));
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <div
        style={{
          background: isDark ? 'rgba(31,41,55,0.98)' : 'rgba(255,255,255,0.98)',
          border: `2px solid ${color}`,
          borderRadius: 4,
          padding: 4,
          boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
          pointerEvents: 'auto',
        }}
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="number"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
            if (event.key === 'Escape') {
              setText(String(value));
              setEditing(false);
            }
          }}
          onBlur={commit}
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          style={{
            width: 64,
            padding: '2px 4px',
            border: `1px solid ${isDark ? '#4b5563' : '#ccc'}`,
            borderRadius: 2,
            fontSize: 13,
            fontWeight: 'bold',
            textAlign: 'center',
            outline: 'none',
            background: isDark ? '#1f2937' : '#ffffff',
            color: isDark ? '#ffffff' : '#000000',
          }}
        />
      </div>
    );
  }

  const effectiveColor = isDark && (color === '#000000' || color === 'black' || color === '#000') ? '#ffffff' : color;

  return (
    <div
      onClick={(event) => {
        event.stopPropagation();
        setEditing(true);
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        cursor: 'pointer',
        padding: '3px 8px',
        minWidth: 36,
        textAlign: 'center',
        color: effectiveColor,
        fontSize: 13,
        fontWeight: 'bold',
        background: isDark ? 'rgba(31,41,55,0.85)' : 'rgba(255,255,255,0.92)',
        border: `1px dashed ${effectiveColor}`,
        borderRadius: 3,
        userSelect: 'none',
        pointerEvents: 'auto',
      }}
    >
      {value}
    </div>
  );
};

/**
 * 깔끔한 CAD 스타일 2D 뷰어 (그리드 없음)
 * 이미지와 동일한 스타일의 치수선과 가이드라인만 표시
 */
const CleanCAD2D: React.FC<CleanCAD2DProps> = ({ viewDirection, showDimensions: showDimensionsProp, isStep2, readOnly = false }) => {
  // 카메라 zoom 구독 — 줌아웃 시 편집 UI가 함께 축소되도록 CSS scale 계산
  // (Canvas 컨텍스트 내부이므로 R3F 훅 사용 가능)
  const camera = useThree(state => state.camera);
  const [camZoom, setCamZoom] = useState<number>((camera as any)?.zoom || 1);
  // 리렌더 빈도 완화: 줌 변화가 0.5 이상 누적될 때만 setState
  // (임계값을 2.0으로 크게 하면 showShelfEditUi(zoom>=20) 경계에서
  //  선반 편집 UI 수십 개가 한 프레임에 몰려 mount → "뚝 끊김" 발생)
  useFrame(() => {
    const z = (camera as any)?.zoom || 1;
    if (Math.abs(z - camZoom) > 0.5) setCamZoom(z);
  });
  // 기준 zoom 50에서 100%, 최소 25%까지. zoom이 높아도 1.0으로 clamp.
  const uiScale = Math.min(1, Math.max(0.25, camZoom / 50));
  const uiScaleStyle: React.CSSProperties = { transform: `scale(${uiScale})`, transformOrigin: 'center', display: 'inline-block' };
  // 줌아웃이 과도하면 편집 UI 숨김 (너무 작아져서 시인성/조작성 나빠짐)
  // 임계값 5: 어느 정도 확대 상태에서는 거의 항상 보이도록 완화 (이전 20은 너무 보수적)
  const showShelfEditUi = !readOnly && camZoom >= 5;

  const { spaceInfo } = useSpaceConfigStore();
  const placedModulesStore = useFurnitureStore(state => state.placedModules);
  const updatePlacedModule = useFurnitureStore(state => state.updatePlacedModule);
  const setLastCustomDimensions = useFurnitureStore(state => state.setLastCustomDimensions);
  const showFurniture = useUIStore(state => state.showFurniture);
  const placedModules = useMemo(
    () => (showFurniture ? placedModulesStore : []),
    [placedModulesStore, showFurniture]
  );
  const { view2DDirection, showDimensions: showDimensionsFromStore, showDimensionsText, view2DTheme, selectedSlotIndex, isLayoutBuilderOpen, selectedFurnitureId, selectedFurnitureIds, hingePositionEditModeModuleId, activePopup } = useUIStore();
  const { zones } = useDerivedSpaceStore();

  // 단내림 설정
  const hasDroppedCeiling = spaceInfo.droppedCeiling?.enabled;
  const dropHeightMm = hasDroppedCeiling ? (spaceInfo.droppedCeiling?.dropHeight || 200) : 0;

  // 선택된 슬롯이 단내림 구간에 해당하는지 판단
  const normalSlotCount = zones?.normal?.columnCount || (spaceInfo.customColumnCount || 4);
  const isSelectedSlotInDroppedZone = hasDroppedCeiling && selectedSlotIndex !== null && selectedSlotIndex >= normalSlotCount;

  // 바닥마감재 높이
  const floorFinishHeightMmGlobal = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? spaceInfo.floorFinish.height : 0;
  // 표시할 높이 (단내림 구간이면 단내림 높이, 아니면 전체 높이) - 바닥마감재 두께 반영
  const displaySpaceHeightMm = isSelectedSlotInDroppedZone ? (spaceInfo.height - dropHeightMm - floorFinishHeightMmGlobal) : (spaceInfo.height - floorFinishHeightMmGlobal);

  // props로 전달된 값이 있으면 사용, 없으면 store 값 사용
  const showDimensions = showDimensionsProp !== undefined ? showDimensionsProp : showDimensionsFromStore;

  const leftmostModules = useMemo(() => {
    if (!showDimensions || placedModules.length === 0) return [];

    return filterSideViewModules({
      placedModules,
      viewDirection: 'left',
      selectedSlotIndex,
      isFreePlacement: spaceInfo.layoutMode === 'free-placement' || spaceInfo.customGuideMode === true,
      spaceInfo,
      zones,
      excludeSurroundPanels: true
    });
  }, [showDimensions, placedModules, selectedSlotIndex, spaceInfo, zones]);

  const rightmostModules = useMemo(() => {
    if (!showDimensions || placedModules.length === 0) return [];

    return filterSideViewModules({
      placedModules,
      viewDirection: 'right',
      selectedSlotIndex,
      isFreePlacement: spaceInfo.layoutMode === 'free-placement' || spaceInfo.customGuideMode === true,
      spaceInfo,
      zones,
      excludeSurroundPanels: true
    });
  }, [showDimensions, placedModules, selectedSlotIndex, spaceInfo, zones]);

  const isFreePlacement = spaceInfo.layoutMode === 'free-placement' || spaceInfo.customGuideMode === true;

  // 미드웨이(상부장~하부장 갭) 편집: 좌/우 어느 쪽에서 편집하든 배치된 "모든 상부 가구"에
  // 동일하게 반영한다(가구별 개별 높이 조정은 가구편집 팝업에서만 수행하는 특수 케이스).
  //   delta = 현재 미드웨이 − 새 미드웨이 (양수면 상부장이 그만큼 아래로 확장)
  //   각 상부 가구 customHeight += delta
  const applyMidwayGapToAllUppers = (currentGap: number, newGap: number) => {
    const delta = currentGap - newGap;
    if (delta === 0) return;
    const isUpperModule = (m: any) => {
      const mid = m.moduleId || '';
      return mid.includes('upper-cabinet') || mid.includes('upper-');
    };
    useFurnitureStore.getState().placedModules.forEach((m: any) => {
      if (!isUpperModule(m)) return;
      const baseH = typeof m.customHeight === 'number' && m.customHeight > 0
        ? m.customHeight
        : (m.freeHeight ?? m.moduleHeight ?? 0);
      const nextH = Math.round(baseH + delta);
      if (nextH > 0 && nextH !== baseH) {
        updatePlacedModule(m.id, { customHeight: nextH });
      }
    });
  };

  // 측면뷰 3구간 치수 기준 가구: CADDimensions2D.getVisibleFurnitureForSideView()와 완전 동기화
  const sideViewMod = useMemo(() => {
    if (placedModules.length === 0) return null;
    const filtered = filterSideViewModules({
      placedModules,
      viewDirection: viewDirection || view2DDirection,
      selectedSlotIndex,
      isFreePlacement,
      spaceInfo,
      zones,
      excludeSurroundPanels: true
    });

    if (filtered.length === 0) return null;

    // 하부장/키큰장 우선 (받침대 기준이 되어야 함)
    const lowerOrFull = filtered.find(m => {
      const md = getModuleById(m.moduleId);
      const cat = md?.category ?? (m.moduleId.includes('upper') ? 'upper' : m.moduleId.includes('lower') ? 'lower' : 'full');
      return cat === 'lower' || cat === 'full';
    });
    return (lowerOrFull ?? filtered[0]) as any;
  }, [placedModules, selectedSlotIndex, isFreePlacement, spaceInfo, zones, viewDirection, view2DDirection]);

  // 실제 뷰 방향 결정
  const currentViewDirection = viewDirection || view2DDirection;
  const hasFrontPlacedModules = placedModules.some(module => ((module as any).placementWall || 'front') === 'front');

  // 노서라운드 모드에서 가구 위치별 엔드패널 표시 여부 결정
  const indexing = calculateSpaceIndexing(spaceInfo);
  const isExternalMaidaModule = (moduleId = '') => moduleId.includes('lower-drawer-')
    || moduleId.includes('lower-half-cabinet')
    || moduleId.includes('dual-lower-half-cabinet')
    || moduleId.includes('lower-sink-cabinet')
    || moduleId.includes('dual-lower-sink-cabinet')
    || moduleId.includes('lower-door-lift-')
    || moduleId.includes('lower-top-down-')
    || moduleId.includes('lower-induction-cabinet')
    || moduleId.includes('dual-lower-induction-cabinet');
  const getExternalMaidaDimensionSide = (module: any): 'left' | 'right' | null => {
    const slotCount = indexing.slotWidths?.length || indexing.columnCount || 0;
    const isDual = !!module.isDualSlot || (module.moduleId || '').includes('dual-');
    const isEditing = activePopup.type === 'furnitureEdit' && activePopup.id === module.id;

    if (slotCount > 0 && typeof module.slotIndex === 'number') {
      const endSlotIndex = module.slotIndex + (isDual ? 1 : 0);
      if (module.slotIndex <= 0) return 'left';
      if (endSlotIndex >= slotCount - 1) return 'right';
      if (isEditing) {
        const x = module.position?.x ?? 0;
        return x >= 0 ? 'right' : 'left';
      }
      return null;
    }

    if (module.placementWall === 'left') return 'left';
    if (module.placementWall === 'right') return 'right';
    const x = module.position?.x ?? 0;
    if (Math.abs(x) < 0.001 && !isEditing) return null;
    return x > 0 ? 'right' : 'left';
  };

  // 디버깅 로그 추가
// console.log('🔴 CleanCAD2D - indexing:', {
    // columnCount: indexing.columnCount,
    // columnWidth: indexing.columnWidth,
    // internalWidth: indexing.internalWidth,
    // mainDoorCount: spaceInfo.mainDoorCount,
    // customColumnCount: spaceInfo.customColumnCount
  // });
  const hasLeftFurniture = spaceInfo.surroundType === 'no-surround' && 
    placedModules.some(module => {
      // 듀얼 가구 판단: isDualSlot 속성 또는 moduleId에 'dual-' 포함
      const isDual = module.isDualSlot || module.moduleId.includes('dual-');
      // 싱글 모듈이 0번 슬롯에 있거나, 듀얼 모듈이 0번 슬롯을 포함하는 경우
      if (module.slotIndex === 0) return true;
      // 듀얼 모듈이 1번에서 시작하면 0번도 차지
      if (isDual && module.slotIndex === 1) return true;
      return false;
    });
  const hasRightFurniture = spaceInfo.surroundType === 'no-surround' && 
    placedModules.some(module => {
      const lastSlotIndex = indexing.columnCount - 1;
      // 듀얼 가구 판단: isDualSlot 속성 또는 moduleId에 'dual-' 포함
      const isDual = module.isDualSlot || module.moduleId.includes('dual-');
      // 싱글 모듈이 마지막 슬롯에 있거나, 듀얼 모듈이 마지막 슬롯을 포함하는 경우
      if (module.slotIndex === lastSlotIndex) return true;
      // 듀얼 모듈이 마지막-1에서 시작하면 마지막도 차지
      if (isDual && module.slotIndex === lastSlotIndex - 1) return true;
      return false;
    });

// console.log('🎯 CleanCAD2D 전체 렌더링:', {
    // showDimensionsProp,
    // showDimensionsFromStore,
    // showDimensions,
    // viewDirection,
    // isStep2,
    // surroundType: spaceInfo.surroundType,
    // installType: spaceInfo.installType,
    // wallConfig: spaceInfo.wallConfig,
    // '좌우치수표시조건': !isStep2
  // });
  const { updateColumn, setSpaceInfo } = useSpaceConfigStore();
  const groupRef = useRef<THREE.Group>(null);

  // 가구 높이 배열을 추출하여 깊은 비교를 위한 의존성으로 사용
  const furnitureHeightKeys = useMemo(
    () => placedModules.map(m => `${m.id}-${m.moduleId}-${m.freeHeight || 0}-${m.customHeight || 0}-${m.topFrameThickness || 0}`).join(','),
    [placedModules]
  );

  // 가구 높이 계산을 useMemo로 메모이제이션 - placedModules 변경 시 자동 업데이트
  const furnitureHeights = useMemo(() => {
// console.log('🔄 furnitureHeights 재계산 중...', { furnitureHeightKeys });

    const frameSize = spaceInfo.frameSize || { left: 50, right: 50, top: 50 };
    const topFrameHeight = frameSize.top ?? 0;
    const floorFinishHeightMm = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? spaceInfo.floorFinish.height : 0;
    const isFloating = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
    const floatHeight = isFloating ? (spaceInfo.baseConfig?.floatHeight || 0) : 0;
    // 걸래받이 높이: floor 타입은 받침대, stand 타입(비띄움)은 바닥레일
    const bottomFrameHeight = spaceInfo.baseConfig?.type === 'floor'
      ? (spaceInfo.baseConfig.height || 65)
      : (spaceInfo.baseConfig?.type === 'stand' && !isFloating)
        ? (spaceInfo.baseConfig?.height || 0)
        : 0;

    let maxLowerCabinetHeightMm = 0;
    let maxUpperCabinetHeightMm = 0;

    if (placedModules.length > 0) {
      placedModules.forEach(module => {
        const moduleData = getModuleById(module.moduleId);
        const isCustomizable = module.moduleId.startsWith('customizable-');
        if (!moduleData && !isCustomizable && !module.isFreePlacement) return;

        // 상하부장 분류
        const category = moduleData?.category
          ?? (module.moduleId.includes('upper') ? 'upper'
            : module.moduleId.includes('lower') ? 'lower' : 'full');
        const moduleHeight = category === 'upper'
          ? (module.customHeight
            ?? module.freeHeight
            ?? moduleData?.dimensions.height
            ?? (module.customConfig?.totalHeight || 2000))
          : (module.freeHeight
            ?? module.customHeight
            ?? moduleData?.dimensions.height
            ?? (module.customConfig?.totalHeight || 2000));
        if (category === 'lower' && moduleHeight > maxLowerCabinetHeightMm) {
          maxLowerCabinetHeightMm = moduleHeight;
        }
        if (category === 'upper' && moduleHeight > maxUpperCabinetHeightMm) {
          maxUpperCabinetHeightMm = moduleHeight;
        }
      });
    }

    // 띄움 배치 시 상부섹션 높이 조정
    const adjustedUpperCabinetHeightMm = isFloating && maxUpperCabinetHeightMm > 0
      ? maxUpperCabinetHeightMm - (floatHeight - bottomFrameHeight)
      : 0;

// console.log('✅ furnitureHeights 계산 완료:', {
      // maxLowerCabinetHeightMm,
      // maxUpperCabinetHeightMm,
      // adjustedUpperCabinetHeightMm,
      // isFloating,
      // floatHeight
    // });

    return {
      maxLowerCabinetHeightMm,
      maxUpperCabinetHeightMm,
      adjustedUpperCabinetHeightMm,
      isFloating,
      floatHeight,
      floorFinishHeightMm,
      bottomFrameHeight,
      topFrameHeight
    };
  }, [furnitureHeightKeys, spaceInfo.baseConfig, spaceInfo.frameSize, spaceInfo.hasFloorFinish, spaceInfo.floorFinish, placedModules]);
  
  // 그룹의 모든 자식 요소들에 renderOrder와 depthTest 설정
  useEffect(() => {
    if (groupRef.current) {
      // 일정 시간 후에 실행하여 모든 요소가 렌더링된 후 적용
      const timer = setTimeout(() => {
        if (groupRef.current) {
          groupRef.current.traverse((child) => {
            // Line, LineSegments, Mesh 모두에 적용
            if (child instanceof THREE.Line || child instanceof THREE.LineSegments || child instanceof THREE.Mesh) {
              child.renderOrder = 999999;
              if (child.material) {
                (child.material as any).depthTest = false;
                (child.material as any).depthWrite = false;
                (child.material as any).transparent = true;
              }
            }
          });
        }
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [showDimensions, viewDirection, view2DDirection]);

  const { theme } = useViewerTheme();
  const { colors } = useThemeColors();

  // 편집 상태 관리
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingSide, setEditingSide] = useState<'left' | 'right' | 'width' | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  // 이격거리 편집 상태
  const [editingGapSide, setEditingGapSide] = useState<'left' | 'right' | 'middle' | 'middle2' | null>(null);
  const [editingGapValue, setEditingGapValue] = useState<string>('');
  const gapInputRef = useRef<HTMLInputElement>(null);

  // 자유배치 가구 너비 편집 상태
  const [editingFurnitureWidthId, setEditingFurnitureWidthId] = useState<string | null>(null);
  const [editingFurnitureWidthValue, setEditingFurnitureWidthValue] = useState<string>('');
  const furnitureWidthInputRef = useRef<HTMLInputElement>(null);

  // 자유배치 가구 갭(벽~가구 거리) 편집 상태
  const [editingFurnitureGapSide, setEditingFurnitureGapSide] = useState<'left' | 'right' | null>(null);
  const [editingFurnitureGapValue, setEditingFurnitureGapValue] = useState<string>('');
  const [editingFurnitureGapModuleId, setEditingFurnitureGapModuleId] = useState<string | null>(null);
  const furnitureGapInputRef = useRef<HTMLInputElement>(null);

  // 편집 모드가 활성화되면 입력 필드에 포커스
  useEffect(() => {
    if (editingColumnId && editingSide && inputRef.current) {
      // 더 긴 지연시간과 더 안정적인 포커스 처리
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
          // 추가로 클릭 이벤트도 발생시켜 확실히 포커스
          inputRef.current.click();
        }
      }, 200);
      
      return () => clearTimeout(timer);
    }
  }, [editingColumnId, editingSide]);

  // CSS 변수에서 실제 테마 색상 가져오기 (3D 모드용)
  const getThemeColorFromCSS = (variableName: string, fallback: string) => {
    if (typeof window !== 'undefined') {
      const computedColor = getComputedStyle(document.documentElement)
        .getPropertyValue(variableName).trim();
      return computedColor || fallback;
    }
    return fallback;
  };

  // 3D 모드에서는 진한 색상, 2D 모드에서는 라이트/다크에 따라 검정/흰색
  const primaryColor = getThemeColorFromCSS('--theme-primary', '#10b981');
  const dimensionColor = currentViewDirection === '3D' ? '#333333' : (view2DTheme === 'dark' ? '#ffffff' : '#000000');  // 3D: 진한 회색으로 명확하게
  const textColor = currentViewDirection === '3D' ? '#222222' : (view2DTheme === 'dark' ? '#ffffff' : '#000000');  // 3D: 더 진한 색으로 가독성 향상
  const columnDimensionColor = '#ff3333';
  const guideColor = currentViewDirection === '3D' ? '#888888' : (view2DTheme === 'dark' ? '#cccccc' : '#000000');  // 2D: 라이트-검정, 다크-밝은회색
  const subGuideColor = currentViewDirection === '3D' ? '#bbbbbb' : (view2DTheme === 'dark' ? '#888888' : '#000000');  // 2D: 라이트-검정, 다크-중간회색
  const gridColor = currentViewDirection === '3D' 
    ? primaryColor  // 3D에서는 테마 색상 사용
    : getThemeColorFromCSS('--theme-border', '#e5e7eb');  // 2D에서는 border 색상
  
  // 프레임 치수 색상 - 다른 치수와 동일하게 통일
  const frameDimensionColor = dimensionColor;

  // 기둥 간격 편집 핸들러
  const handleColumnDistanceEdit = (columnId: string, side: 'left' | 'right' | 'width', currentValue: number) => {
// console.log('🖱️ 기둥 간격 편집 시작:', { columnId, side, currentValue });
    const column = spaceInfo.columns?.find(col => col.id === columnId);
    if (readOnly || column?.isLocked) return;
    
    // 기존 편집 모드 먼저 해제
    if (editingColumnId) {
      setEditingColumnId(null);
      setEditingSide(null);
      setEditingValue('');
    }
    
    // 잠시 후 새로운 편집 모드 활성화
    setTimeout(() => {
      setEditingColumnId(columnId);
      setEditingSide(side);
      setEditingValue(formatMmValue(currentValue));
    }, 50);
  };

  const handleEditComplete = () => {
    if (!editingColumnId || !editingSide) return;
    
    const value = Number.parseFloat(editingValue) || 0;
    const column = spaceInfo.columns?.find(col => col.id === editingColumnId);
    
    if (!column || readOnly || column.isLocked) return;

// console.log('✅ 편집 완료:', { columnId: editingColumnId, side: editingSide, value });

    const spaceWidthM = spaceInfo.width * 0.01;
    const columnWidthM = column.width * 0.01;
    const clampColumnX = (x: number, widthMm: number) => {
      if (spaceInfo.layoutMode !== 'free-placement') return x;
      const { startX, endX } = getInternalSpaceBoundsX(spaceInfo);
      const halfWidth = (widthMm * 0.01) / 2;
      const minX = startX * 0.01 + halfWidth;
      const maxX = endX * 0.01 - halfWidth;
      if (minX > maxX) return (minX + maxX) / 2;
      return Math.max(minX, Math.min(maxX, x));
    };

    if (editingSide === 'left') {
      // 왼쪽 벽과 기둥 좌측면 사이의 간격
      const newX = clampColumnX(-(spaceWidthM / 2) + (value * 0.01) + (columnWidthM / 2), column.width);
      updateColumn(editingColumnId, { position: [newX, column.position[1], column.position[2]] });
    } else if (editingSide === 'right') {
      // 오른쪽 벽과 기둥 우측면 사이의 간격
      const newX = clampColumnX((spaceWidthM / 2) - (value * 0.01) - (columnWidthM / 2), column.width);
      updateColumn(editingColumnId, { position: [newX, column.position[1], column.position[2]] });
    } else if (editingSide === 'width') {
      // 기둥 너비 변경
      const nextWidth = Math.max(1, value);
      updateColumn(editingColumnId, {
        width: nextWidth,
        position: [clampColumnX(column.position[0], nextWidth), column.position[1], column.position[2]],
      });
    }

    setEditingColumnId(null);
    setEditingSide(null);
    setEditingValue('');
  };

  const handleEditCancel = () => {
// console.log('❌ 편집 취소');
    setEditingColumnId(null);
    setEditingSide(null);
    setEditingValue('');
  };

  // handleEditSubmit 함수 추가 (EditableLabel에서 사용)
  const handleEditSubmit = () => {
    handleEditComplete();
  };

  // 이격거리 편집 핸들러
  const handleGapEdit = (side: 'left' | 'right' | 'middle' | 'middle2', currentValue: number) => {
    setEditingGapSide(side);
    setEditingGapValue(currentValue.toString());
    setTimeout(() => {
      gapInputRef.current?.focus();
      gapInputRef.current?.select();
    }, 100);
  };

  const handleGapEditSubmit = () => {
    if (!editingGapSide) return;
    const value = parseFloat(editingGapValue);
    if (isNaN(value) || value < 0) {
      setEditingGapSide(null);
      setEditingGapValue('');
      return;
    }
    // middle/middle2(경계면 이격)은 0~5mm, left/right는 0~50mm
    const maxValue = (editingGapSide === 'middle' || editingGapSide === 'middle2') ? 5 : 50;
    const clamped = Math.max(0, Math.min(maxValue, value));
    setSpaceInfo({
      gapConfig: {
        ...spaceInfo.gapConfig,
        left: spaceInfo.gapConfig?.left ?? 1.5,
        right: spaceInfo.gapConfig?.right ?? 1.5,
        [editingGapSide]: clamped,
      }
    });
    setEditingGapSide(null);
    setEditingGapValue('');
  };

  const handleGapEditCancel = () => {
    setEditingGapSide(null);
    setEditingGapValue('');
  };

  useEffect(() => {
    if (editingGapSide && gapInputRef.current) {
      const timer = setTimeout(() => {
        gapInputRef.current?.focus();
        gapInputRef.current?.select();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [editingGapSide]);

  // 자유배치 가구 너비 편집 핸들러
  const handleFurnitureWidthEdit = (moduleId: string, currentWidth: number) => {
    const module = placedModules.find(m => m.id === moduleId);
    if (readOnly || module?.isLocked) return;

    setEditingFurnitureWidthId(moduleId);
    setEditingFurnitureWidthValue(Math.round(currentWidth).toString());
    setTimeout(() => {
      furnitureWidthInputRef.current?.focus();
      furnitureWidthInputRef.current?.select();
    }, 100);
  };

  const handleFurnitureWidthSubmit = () => {
    if (!editingFurnitureWidthId) return;
    const value = parseFloat(editingFurnitureWidthValue);
    const module = placedModules.find(m => m.id === editingFurnitureWidthId);
    const isInsertFrame = typeof module?.moduleId === 'string' && module.moduleId.includes('insert-frame');
    const minWidth = isInsertFrame ? 30 : 100;
    if (isNaN(value) || value < minWidth) {
      setEditingFurnitureWidthId(null);
      setEditingFurnitureWidthValue('');
      return;
    }
    const clamped = Math.max(minWidth, Math.min(3000, Math.round(value)));
    if (module && !module.isLocked && !readOnly) {
      const freshSI = useSpaceConfigStore.getState().spaceInfo;
      const newX = isInsertFrame
        ? calcInsertFrameResizedPositionX(module, clamped, placedModules, freshSI)
        : (
          module.isFreePlacement
            ? calcResizedPositionX(module, clamped, placedModules, freshSI)
            : module.position.x
        );
      updatePlacedModule(editingFurnitureWidthId, {
        freeWidth: clamped,
        moduleWidth: clamped,
        customWidth: clamped,
        position: { ...module.position, x: newX },
        userResizedWidth: true, // 사용자 직접 폭 변경 → 화살표 이동 시 자동 리사이즈 차단
      } as any);
      // 마지막 치수 기억 → 다음 추가 배치 시 이 너비로 배치
      const height = module.freeHeight ?? module.customConfig?.totalHeight ?? 2400;
      const depth = module.freeDepth ?? 600;
      const dims = { width: clamped, height, depth };
      if (isCustomizableModuleId(module.moduleId)) {
        const dimKey = getCustomDimensionKey(module.moduleId);
        setLastCustomDimensions(dimKey, dims);
      } else {
        const stdKey = getStandardDimensionKey(module.moduleId);
        setLastCustomDimensions(stdKey, dims);
      }
    }
    setEditingFurnitureWidthId(null);
    setEditingFurnitureWidthValue('');
  };

  const handleFurnitureWidthCancel = () => {
    setEditingFurnitureWidthId(null);
    setEditingFurnitureWidthValue('');
  };

  useEffect(() => {
    if (editingFurnitureWidthId && furnitureWidthInputRef.current) {
      const timer = setTimeout(() => {
        furnitureWidthInputRef.current?.focus();
        furnitureWidthInputRef.current?.select();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [editingFurnitureWidthId]);

  // 자유배치 가구 갭(벽~가구 거리) 편집 핸들러
  const handleFurnitureGapEdit = (side: 'left' | 'right', moduleId: string, currentValue: number) => {
    setEditingFurnitureGapSide(side);
    setEditingFurnitureGapModuleId(moduleId);
    setEditingFurnitureGapValue(Math.round(currentValue).toString());
    setTimeout(() => {
      furnitureGapInputRef.current?.focus();
      furnitureGapInputRef.current?.select();
    }, 100);
  };

  const handleFurnitureGapSubmit = () => {
    if (!editingFurnitureGapSide || !editingFurnitureGapModuleId) return;
    const value = parseFloat(editingFurnitureGapValue);
    if (isNaN(value) || value < 0) {
      setEditingFurnitureGapSide(null);
      setEditingFurnitureGapValue('');
      setEditingFurnitureGapModuleId(null);
      return;
    }
    const module = placedModules.find(m => m.id === editingFurnitureGapModuleId);
    if (!module) {
      setEditingFurnitureGapSide(null);
      setEditingFurnitureGapValue('');
      setEditingFurnitureGapModuleId(null);
      return;
    }
    const widthMm = getModuleWidthMm(module);
    if (widthMm === null) return;
    const moduleHalfWidth = widthMm * 0.01 / 2;
    const leftOffsetVal = spaceInfo.surroundType === 'surround' ? -(spaceInfo.frameSize?.left || 50) * 0.01 : 0;
    const maxGap = spaceInfo.width;
    const clamped = Math.max(0, Math.min(maxGap, Math.round(value)));

    if (editingFurnitureGapSide === 'left') {
      // 왼쪽 벽에서 거리 → 가구 중심 X = leftOffset + gap(mm→three) + halfWidth
      const newX = leftOffsetVal + clamped * 0.01 + moduleHalfWidth;
      updatePlacedModule(editingFurnitureGapModuleId, { position: { ...module.position, x: newX } });
    } else {
      // 오른쪽 벽에서 거리 → 가구 중심 X = rightEdge - gap(mm→three) - halfWidth
      const rightEdge = spaceInfo.width * 0.01 + leftOffsetVal;
      const newX = rightEdge - clamped * 0.01 - moduleHalfWidth;
      updatePlacedModule(editingFurnitureGapModuleId, { position: { ...module.position, x: newX } });
    }
    setEditingFurnitureGapSide(null);
    setEditingFurnitureGapValue('');
    setEditingFurnitureGapModuleId(null);
  };

  const handleFurnitureGapCancel = () => {
    setEditingFurnitureGapSide(null);
    setEditingFurnitureGapValue('');
    setEditingFurnitureGapModuleId(null);
  };

  useEffect(() => {
    if (editingFurnitureGapSide && furnitureGapInputRef.current) {
      const timer = setTimeout(() => {
        furnitureGapInputRef.current?.focus();
        furnitureGapInputRef.current?.select();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [editingFurnitureGapSide]);

  // mm를 Three.js 단위로 변환 (furnitureDimensions에서 사용하기 위해 먼저 선언)
  const mmToThreeUnits = (mm: number) => mm * 0.01;
  const threeUnitsToMm = (units: number) => units * 100;

  const resolveDepthSpanZ = (
    depthMm: number,
    direction: 'front' | 'back' | undefined,
    furnitureZOffsetValue: number,
    furnitureDepthValue: number,
    doorThicknessValue: number,
    baseDepthOffsetValue = 0,
    backWallGapZValue = 0
  ) => {
    const depth = mmToThreeUnits(depthMm);
    const fixedBackZ = furnitureZOffsetValue - furnitureDepthValue / 2 - doorThicknessValue + baseDepthOffsetValue + backWallGapZValue;

    // 하부 가구는 본체(FurnitureItem.tsx)와 동일하게 "뒷면을 뒷벽에 고정 + backWallGap 앞이동"
    // 으로 통일한다. 앞고정의 앞라인 추종은 backWallGap(이미 fixedBackZ에 포함)으로 표현되므로
    // 앞/뒤고정 모두 backZ=fixedBackZ, frontZ=backZ+depth 로 계산해야 치수가 본체를 정확히 따라간다.
    // (이전엔 앞고정 시 앞면을 공간 앞면 라인에 고정해 본체와 어긋났다.)
    void direction;
    return {
      backZ: fixedBackZ,
      frontZ: fixedBackZ + depth,
    };
  };

  const resolveSideDimensionDepthSpanZ = (
    module: any,
    moduleData: any,
    section: 'upper' | 'lower' | 'auto',
    furnitureZOffsetValue: number,
    furnitureDepthValue: number
  ) => {
    const category = moduleData?.category
      ?? (module?.moduleId?.includes('upper') ? 'upper'
        : module?.moduleId?.includes('lower') ? 'lower' : 'full');
    const depthMm = section === 'upper'
      ? (module?.upperSectionDepth ?? module?.customDepth ?? module?.freeDepth ?? moduleData?.dimensions?.depth ?? 600)
      : section === 'lower'
        ? (module?.lowerSectionDepth ?? module?.customDepth ?? module?.freeDepth ?? moduleData?.dimensions?.depth ?? 600)
        : (module?.customDepth ?? module?.upperSectionDepth ?? module?.lowerSectionDepth ?? module?.freeDepth ?? moduleData?.dimensions?.depth ?? 600);
    const doorThicknessValue = mmToThreeUnits(20);
    const backWallGapZValue = module?.backWallGap ? mmToThreeUnits(module.backWallGap) : 0;
    const isFloatingBase = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
    const baseDepthOffsetValue = isFloatingBase ? mmToThreeUnits(spaceInfo.baseConfig?.depth || 0) : 0;
    const moduleId = module?.moduleId || '';
    const isStandaloneUpper = category === 'upper' || moduleId.includes('upper-cabinet');
    const isBackAlignedFull = moduleId.includes('-entryway-')
      || moduleId.includes('-shelf-')
      || moduleId.includes('-4drawer-shelf-')
      || moduleId.includes('-2drawer-shelf-')
      || moduleId.includes('glass-cabinet');
    // 키큰장찬넬(insert-frame): 도어 없이 가구 전면에 정렬되는 채움재.
    // 실제 3D 본체 전면 = furnitureZOffset + furnitureDepth/2 + baseDepthOffset (도어 두께 차감 없음).
    // → 폭 치수 전면 Z를 본체 전면에 맞춤 (기존엔 뒤로 밀려 찬넬과 어긋남).
    const isInsertFrame = moduleId.includes('insert-frame');

    if (isInsertFrame) {
      const frontZ = furnitureZOffsetValue + furnitureDepthValue / 2 + baseDepthOffsetValue + backWallGapZValue;
      return {
        backZ: frontZ - mmToThreeUnits(depthMm),
        frontZ,
        depthMm,
      };
    }

    if (isStandaloneUpper) {
      const backZ = furnitureZOffsetValue - furnitureDepthValue / 2 - doorThicknessValue + backWallGapZValue;
      return {
        backZ,
        frontZ: backZ + mmToThreeUnits(depthMm),
        depthMm,
      };
    }

    if (isBackAlignedFull) {
      const backZ = furnitureZOffsetValue - furnitureDepthValue / 2 - doorThicknessValue + baseDepthOffsetValue + backWallGapZValue;
      return {
        backZ,
        frontZ: backZ + mmToThreeUnits(depthMm),
        depthMm,
      };
    }

    const direction = section === 'upper'
      ? module?.upperSectionDepthDirection
      : module?.lowerSectionDepthDirection;
    return {
      ...resolveDepthSpanZ(
        depthMm,
        direction,
        furnitureZOffsetValue,
        furnitureDepthValue,
        doorThicknessValue,
        baseDepthOffsetValue,
        backWallGapZValue
      ),
      depthMm,
    };
  };

  const resolveInstalledFrontExtensionZ = (module: any) => {
    return module?.hasDoor === true ? mmToThreeUnits(20) : 0;
  };
  
  // 발통 심볼을 그리는 헬퍼 함수
  const renderFootstoolSymbol = (x: number, y: number, z: number, rotation: [number, number, number] = [0, 0, 0]) => {
    const symbolSize = mmToThreeUnits(100); // 100mm 크기로 확대
    const circleRadius = symbolSize / 4;
    const arcRadius = symbolSize / 3;
    
    // 원형 2개 생성 (상단)
    const createCircle = (centerX: number, centerY: number, centerZ: number) => {
      const points: [number, number, number][] = [];
      const segments = 16;
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        points.push([
          centerX + Math.cos(angle) * circleRadius,
          centerY + Math.sin(angle) * circleRadius,
          centerZ
        ]);
      }
      return points;
    };
    
    // 호(arc) 형태 생성 (하단)
    const createArc = (centerX: number, centerY: number, centerZ: number) => {
      const points: [number, number, number][] = [];
      const segments = 12;
      for (let i = 0; i <= segments; i++) {
        const angle = Math.PI + (i / segments) * Math.PI; // 하단 반원
        points.push([
          centerX + Math.cos(angle) * arcRadius,
          centerY + Math.sin(angle) * arcRadius,
          centerZ
        ]);
      }
      return points;
    };
    
    return (
      <group position={[x, y, z]} rotation={rotation}>
        {/* 좌측 원 */}
        <Line
          points={createCircle(-symbolSize / 3, symbolSize / 4, 0)}
          color="#FF6B00"
          lineWidth={0.8}
        />
        
        {/* 우측 원 */}
        <Line
          points={createCircle(symbolSize / 3, symbolSize / 4, 0)}
          color="#FF6B00"
          lineWidth={0.8}
        />
        
        {/* 하단 호 */}
        <Line
          points={createArc(0, -symbolSize / 4, 0)}
          color="#FF6B00"
          lineWidth={0.8}
        />
      </group>
    );
  };
  
  // 공간 크기 (Three.js 단위) - furnitureDimensions 전에 선언
  const spaceWidth = mmToThreeUnits(spaceInfo.width);
  const spaceHeight = mmToThreeUnits(spaceInfo.height);

  // 커스터마이징 가구 포함 모듈 너비 추출 헬퍼
  // getModuleById()는 customizable-* 모듈에 null 반환 → fallback 필요
  const getModuleWidthMm = (module: typeof placedModules[number]): number | null => {
    if (module.isFreePlacement && module.freeWidth) return module.freeWidth;
    const moduleData = getModuleById(module.moduleId);
    if (moduleData) return module.adjustedWidth || moduleData.dimensions.width;
    // customizable 모듈 fallback
    if (module.adjustedWidth) return module.adjustedWidth;
    if (module.moduleWidth) return module.moduleWidth;
    if (module.freeWidth) return module.freeWidth;
    // moduleId에서 추출: customizable-full-1000 → 1000
    const match = module.moduleId.match(/(\d+)$/);
    if (match) return parseInt(match[1]);
    return null;
  };

  // 가구별 실시간 치수선 및 가이드 미리 계산 (hooks는 항상 호출되어야 함)
  const furnitureDimensions = React.useMemo(() => {
    if (placedModules.length === 0 || currentViewDirection === 'top') return null;

    const columnObstacles = getColumnObstacleBoundsX(spaceInfo.columns || []).map(bounds => ({
      left: bounds.left * 0.01,
      right: bounds.right * 0.01,
    }));
    
    return placedModules.map((module, index) => {
      const moduleData = getModuleById(
        module.moduleId,
        { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
        spaceInfo
      );

      if (!moduleData) {
        // 커스터마이징 가구 등 getModuleById로 못 찾는 경우 fallback
        const isCustomizable = module.moduleId.startsWith('customizable-');
        const isFreePlaced = module.isFreePlacement && module.freeWidth;

        if (isFreePlaced || isCustomizable) {
          const fbW = isFreePlaced
            ? module.freeWidth!
            : (module.customWidth || module.adjustedWidth || module.moduleWidth || 450);
          const fbH = isFreePlaced
            ? (module.freeHeight || 2000)
            : (module.customHeight || 2000);
          const fbD = isFreePlaced
            ? (module.freeDepth || 580)
            : (module.customDepth || 580);
          const mX = module.position.x;
          const hasStepDownFb = spaceInfo.droppedCeiling?.enabled || false;
          const stepDownPositionFb = spaceInfo.droppedCeiling?.position || 'right';
          const fbCategory = module.moduleId.includes('upper') ? 'upper'
            : module.moduleId.includes('lower') ? 'lower' : 'full';
          return {
            module,
            moduleData: {
              id: module.moduleId,
              name: module.moduleId,
              category: fbCategory,
              dimensions: { width: fbW, height: fbH, depth: fbD },
              modelConfig: undefined,
            },
            actualWidth: fbW,
            actualDepth: fbD,
            hasCustomDepth: false,
            moduleX: mX,
            moduleY: spaceHeight / 2,
            moduleLeft: mX - (fbW * 0.01) / 2,
            moduleRight: mX + (fbW * 0.01) / 2,
            nearestLeftDistance: 0,
            nearestRightDistance: 0,
            leftBoundaryDistance: 0,
            rightBoundaryDistance: 0,
            farSideDistance: 0,
            farSideSide: null,
            hasAdjacentLeft: false,
            hasAdjacentRight: false,
            isSpacerHandled: false,
            hasStepDown: hasStepDownFb,
            stepDownPosition: stepDownPositionFb,
            stepDownWidth: 0,
          };
        }
        return null;
      }

      // 단내림 여부 확인 (자유배치: stepCeiling, 슬롯: droppedCeiling)
      const hasStepDown = isFreePlacement
        ? (spaceInfo.stepCeiling?.enabled || false)
        : (spaceInfo.droppedCeiling?.enabled || false);
      const stepDownWidth = isFreePlacement
        ? (spaceInfo.stepCeiling?.width || 0)
        : (spaceInfo.droppedCeiling?.width || 0);
      const stepDownPosition = isFreePlacement
        ? (spaceInfo.stepCeiling?.position || 'right')
        : (spaceInfo.droppedCeiling?.position || 'right');
      // 자유배치 커튼박스 폭 (droppedCeiling 필드 사용) — 단내림과 같은 쪽에 위치
      const freeCbWidth = (isFreePlacement && spaceInfo.droppedCeiling?.enabled)
        ? (spaceInfo.droppedCeiling.width || 0) : 0;
      
      // 기둥 슬롯 분석
      const columnSlots = analyzeColumnSlots(spaceInfo);
      const slotInfo = module.slotIndex !== undefined ? columnSlots[module.slotIndex] : undefined;
      const indexing = calculateSpaceIndexing(spaceInfo);
      
      // 기본 너비 설정 - 자유배치 가구는 freeWidth 우선, 그 외 adjustedWidth(기둥 회피) 우선, customWidth, slotAvailable 순
      // slotInfo.availableWidth는 이격거리가 반영된 실제 슬롯 너비
      // 기둥 앞 배치(front) 모드는 슬롯 전체 너비 사용 (adjustedWidth 무시)
      const isColumnFrontMode = (module as any).columnPlacementMode === 'front';
      const slotFullWidth = module.slotIndex !== undefined
        ? (indexing.slotWidths?.[module.slotIndex] ?? indexing.columnWidth)
        : undefined;
      const slotAvailableWidth = slotInfo?.availableWidth;
      let actualWidth = (module.isFreePlacement && module.freeWidth)
        ? module.freeWidth
        : isColumnFrontMode
          ? (slotFullWidth || moduleData.dimensions.width)
          : (module.adjustedWidth || module.customWidth || slotAvailableWidth || moduleData.dimensions.width);
      // 기둥 회피로 adjustedPosition이 있으면 반영 (front 모드 제외)
      let actualPositionX = isColumnFrontMode
        ? (module.slotIndex !== undefined ? indexing.threeUnitPositions?.[module.slotIndex] ?? module.position.x : module.position.x)
        : ((module as any).adjustedPosition?.x ?? module.position.x);
      
      // 커스텀 깊이가 있는 경우 전용 가구로 취급
      const actualDepth = module.customDepth || moduleData.dimensions.depth;
      const hasCustomDepth = module.customDepth && module.customDepth !== moduleData.dimensions.depth;
      
      // customWidth가 있으면 우선 사용 (이미 위에서 처리됨)
      // adjustedWidth는 두 번째 우선순위 (이미 위에서 처리됨)
      
      // 실제 X 위치
      const moduleX = actualPositionX;
      const moduleY = spaceHeight / 2;
      
      // 모듈 왼쪽 및 오른쪽 끝 계산 (Three.js 단위)
      const actualWidthThree = actualWidth * 0.01; // mm → Three.js
      const moduleLeft = moduleX - actualWidthThree / 2;
      const moduleRight = moduleX + actualWidthThree / 2;
      
      // 단내림 구간 영역 계산 (커튼박스가 벽쪽에 위치하므로 커튼박스 폭 차감)
      // 레이아웃(우측): [벽]─[메인]─[단내림]─[커튼박스]─[벽]
      // 레이아웃(좌측): [벽]─[커튼박스]─[단내림]─[메인]─[벽]
      const stepDownStartX = stepDownPosition === 'left'
        ? -(spaceInfo.width * 0.01) / 2 + (freeCbWidth * 0.01)
        : (spaceInfo.width * 0.01) / 2 - (stepDownWidth * 0.01) - (freeCbWidth * 0.01);
      const stepDownEndX = stepDownPosition === 'left'
        ? -(spaceInfo.width * 0.01) / 2 + (stepDownWidth * 0.01) + (freeCbWidth * 0.01)
        : (spaceInfo.width * 0.01) / 2 - (freeCbWidth * 0.01);
      
      // 스페이서 처리 
      const SPACER_WIDTH = 36; // 36mm 스페이서
      const isSpacerModule = moduleData.name && moduleData.name.includes('스페이서');
      
      // 36mm 스페이서일 때만 처리
      const isSpacerHandled = isSpacerModule && actualWidth === SPACER_WIDTH;
      
      // ────────────────────────────────────────────────
      // 양쪽 이격거리 계산 (인접 가구/벽/단내림 경계 고려)
      // ────────────────────────────────────────────────
      let nearestLeftDistance = 0;
      let nearestRightDistance = 0;
      let hasAdjacentLeft = false;  // 왼쪽에 인접 가구 있음 (벽이 아닌 가구)
      let hasAdjacentRight = false; // 오른쪽에 인접 가구 있음

      // 단내림 경계 mm/Three.js 좌표 (메인↔단내림 경계, 커튼박스 폭 차감)
      const stepDownBoundaryMm = hasStepDown
        ? (stepDownPosition === 'left'
          ? (-spaceInfo.width / 2 + stepDownWidth + freeCbWidth)
          : (spaceInfo.width / 2 - stepDownWidth - freeCbWidth))
        : undefined;
      const stepDownBoundaryThree = stepDownBoundaryMm !== undefined
        ? stepDownBoundaryMm * 0.01 : undefined;

      // 가구가 어느 구간에 있는지 (Three.js 좌표)
      const isModuleInStepDown = hasStepDown && (
        stepDownPosition === 'left'
          ? moduleRight <= stepDownEndX
          : moduleLeft >= stepDownStartX
      );

      // 현재 구간의 벽/경계 범위 (Three.js 좌표)
      let zoneLimitLeft: number; // 이 가구가 속한 구간의 왼쪽 경계
      let zoneLimitRight: number; // 이 가구가 속한 구간의 오른쪽 경계

      // 커튼박스를 제외한 벽 경계 (가구 배치 가능 영역의 끝)
      const wallLeftThree = -(spaceInfo.width * 0.01) / 2 + (stepDownPosition === 'left' ? freeCbWidth * 0.01 : 0);
      const wallRightThree = (spaceInfo.width * 0.01) / 2 - (stepDownPosition === 'right' ? freeCbWidth * 0.01 : 0);

      if (!hasStepDown) {
        // 단내림 없음 → 전체 공간
        zoneLimitLeft = -(spaceInfo.width * 0.01) / 2;
        zoneLimitRight = (spaceInfo.width * 0.01) / 2;
      } else if (isModuleInStepDown) {
        // 단내림 구간 안 (커튼박스 영역 제외)
        if (stepDownPosition === 'left') {
          zoneLimitLeft = wallLeftThree;
          zoneLimitRight = stepDownBoundaryThree!;
        } else {
          zoneLimitLeft = stepDownBoundaryThree!;
          zoneLimitRight = wallRightThree;
        }
      } else {
        // 메인 구간
        if (stepDownPosition === 'left') {
          zoneLimitLeft = stepDownBoundaryThree!;
          zoneLimitRight = wallRightThree;
        } else {
          zoneLimitLeft = wallLeftThree;
          zoneLimitRight = stepDownBoundaryThree!;
        }
      }

      if (slotInfo && slotInfo.wallPositions) {
        nearestLeftDistance = Math.abs(moduleLeft * 100 - slotInfo.wallPositions.left);
        nearestRightDistance = Math.abs(slotInfo.wallPositions.right - moduleRight * 100);
        // 슬롯 가구도 인접 가구 체크 (wallPositions은 벽까지만 → 인접 가구가 사이에 있으면 거리 단축)
        const currentCat = module.isSurroundPanel ? 'full'
          : (module.moduleId?.startsWith('upper-') || module.moduleId?.includes('-upper-')) ? 'upper'
          : (module.moduleId?.startsWith('lower-') || module.moduleId?.includes('-lower-')) ? 'lower'
          : 'full';
        for (const otherModule of placedModules) {
          if (otherModule.id === module.id) continue;
          if (otherModule.isSurroundPanel) continue;
          const otherCat = (otherModule.moduleId?.startsWith('upper-') || otherModule.moduleId?.includes('-upper-')) ? 'upper'
            : (otherModule.moduleId?.startsWith('lower-') || otherModule.moduleId?.includes('-lower-')) ? 'lower'
            : 'full';
          const canCoexist = (currentCat === 'upper' && otherCat === 'lower') || (currentCat === 'lower' && otherCat === 'upper');
          if (canCoexist) continue;
          const otherWmm = (otherModule.isFreePlacement && otherModule.freeWidth)
            ? otherModule.freeWidth
            : (otherModule.customWidth || otherModule.adjustedWidth || otherModule.moduleWidth || 0);
          const otherWThree = otherWmm * 0.01;
          const otherLeft = otherModule.position.x - otherWThree / 2;
          const otherRight = otherModule.position.x + otherWThree / 2;
          // 좌측 인접 가구 — moduleLeft까지 거리가 wallPositions 기반보다 짧으면 갱신
          if (otherRight <= moduleLeft + 0.001) {
            const distMm = Math.round((moduleLeft - otherRight) * 100);
            if (distMm < nearestLeftDistance) {
              nearestLeftDistance = distMm;
              hasAdjacentLeft = true;
            }
          }
          // 우측 인접 가구
          if (otherLeft >= moduleRight - 0.001) {
            const distMm = Math.round((otherLeft - moduleRight) * 100);
            if (distMm < nearestRightDistance) {
              nearestRightDistance = distMm;
              hasAdjacentRight = true;
            }
          }
        }

        for (const column of columnObstacles) {
          if (column.right <= moduleLeft + 0.001) {
            const distMm = Math.round((moduleLeft - column.right) * 100);
            if (distMm < nearestLeftDistance) {
              nearestLeftDistance = distMm;
              hasAdjacentLeft = true;
            }
          }
          if (column.left >= moduleRight - 0.001) {
            const distMm = Math.round((column.left - moduleRight) * 100);
            if (distMm < nearestRightDistance) {
              nearestRightDistance = distMm;
              hasAdjacentRight = true;
            }
          }
        }
      } else {
        // 같은 구간 내 다른 가구들의 위치를 고려
        // 왼쪽: 현재 가구 좌측 ~ (왼쪽에 인접한 가구의 우측 또는 구간 왼쪽 경계)
        let leftEdge = zoneLimitLeft;
        // 오른쪽: 현재 가구 우측 ~ (오른쪽에 인접한 가구의 좌측 또는 구간 오른쪽 경계)
        let rightEdge = zoneLimitRight;

        // 현재 가구의 카테고리 판별 (상부/하부 공존 허용 — 서로 장애물 아님)
        const currentCat = module.isSurroundPanel ? 'full'
          : (module.moduleId?.startsWith('upper-') || module.moduleId?.includes('-upper-')) ? 'upper'
          : (module.moduleId?.startsWith('lower-') || module.moduleId?.includes('-lower-')) ? 'lower'
          : 'full';

        for (const otherModule of placedModules) {
          if (otherModule.id === module.id) continue;
          if (otherModule.isSurroundPanel) continue;

          // 다른 가구 카테고리
          const otherCat = (otherModule.moduleId?.startsWith('upper-') || otherModule.moduleId?.includes('-upper-')) ? 'upper'
            : (otherModule.moduleId?.startsWith('lower-') || otherModule.moduleId?.includes('-lower-')) ? 'lower'
            : 'full';
          // upper↔lower는 공존 가능이므로 서로 장애물로 취급하지 않음
          const canCoexist = (currentCat === 'upper' && otherCat === 'lower') || (currentCat === 'lower' && otherCat === 'upper');
          if (canCoexist) continue;

          // otherW: mm 단위 → Three.js 단위로 변환 (position.xはThree.js単位)
          const otherWmm = (otherModule.isFreePlacement && otherModule.freeWidth)
            ? otherModule.freeWidth
            : (otherModule.customWidth || otherModule.adjustedWidth || otherModule.moduleWidth || 0);
          const otherWThree = otherWmm * 0.01; // mm → Three.js
          const otherLeft = otherModule.position.x - otherWThree / 2;
          const otherRight = otherModule.position.x + otherWThree / 2;

          // 왼쪽에 있는 가구 중 가장 가까운 것
          // tolerance 0.05 unit (5mm) — 부동소수점 오차/미세 겹침도 인접으로 인정
          if (otherRight <= moduleLeft + 0.05 && otherRight > leftEdge) {
            leftEdge = Math.min(otherRight, moduleLeft); // 살짝 겹치면 moduleLeft로 클램프 (음수 갭 방지)
          }
          // 오른쪽에 있는 가구 중 가장 가까운 것
          if (otherLeft >= moduleRight - 0.05 && otherLeft < rightEdge) {
            rightEdge = Math.max(otherLeft, moduleRight);
          }
        }

        for (const column of columnObstacles) {
          if (column.right <= moduleLeft + 0.05 && column.right > leftEdge) {
            leftEdge = Math.min(column.right, moduleLeft);
          }
          if (column.left >= moduleRight - 0.05 && column.left < rightEdge) {
            rightEdge = Math.max(column.left, moduleRight);
          }
        }

        // 인접 가구 여부 (벽/경계가 아닌 다른 가구와 맞닿는지)
        hasAdjacentLeft = Math.abs(leftEdge - zoneLimitLeft) > 0.001;
        hasAdjacentRight = Math.abs(rightEdge - zoneLimitRight) > 0.001;

        // 좌표를 각각 반올림한 뒤 빼면 0.5mm 경계에서 표시 치수가 1mm 흔들릴 수 있다.
        // 다른 치수선처럼 실제 거리 차이를 먼저 구한 뒤 정수 mm로 반올림한다.
        nearestLeftDistance = Math.round(Math.abs((moduleLeft - leftEdge) * 100));
        nearestRightDistance = Math.round(Math.abs((rightEdge - moduleRight) * 100));
      }

      // ────────────────────────────────────────────────
      // 단내림 분절: farSideDistance 계산
      // 단내림 경계 쪽 맨 끝 가구만 farSide 표시
      // ────────────────────────────────────────────────
      let leftBoundaryDistance = 0;
      let rightBoundaryDistance = 0;
      let farSideDistance = 0;
      let farSideSide: 'left' | 'right' | null = null;

      if (hasStepDown && stepDownBoundaryThree !== undefined) {
        const stepDownBoundaryX = stepDownPosition === 'left' ? stepDownEndX : stepDownStartX;

        if (stepDownPosition === 'left') {
          leftBoundaryDistance = Math.abs((moduleLeft - stepDownBoundaryX) * 100);
        } else {
          rightBoundaryDistance = Math.abs((stepDownBoundaryX - moduleRight) * 100);
        }

        // farSide: 가구가 메인 구간에 있고, 단내림 경계 쪽에 인접 가구가 없을 때만 표시
        if (!isModuleInStepDown) {
          // 메인 구간 가구 → 단내림 쪽이 벽/경계인지 확인
          // nearestDistance가 구간 경계까지의 거리인지 확인 (= 중간에 다른 가구가 없음)
          if (stepDownPosition === 'left') {
            // 단내림이 왼쪽 → 왼쪽 경계가 stepDownBoundary → leftEdge == zoneLimitLeft이면 맨 끝
            const distToZoneBoundary = Math.abs((moduleLeft - zoneLimitLeft) * 100);
            if (Math.abs(nearestLeftDistance - distToZoneBoundary) < 1) {
              farSideDistance = stepDownWidth;
              farSideSide = 'left';
            }
          } else {
            // 단내림이 오른쪽 → 오른쪽 경계가 stepDownBoundary → rightEdge == zoneLimitRight이면 맨 끝
            const distToZoneBoundary = Math.abs((zoneLimitRight - moduleRight) * 100);
            if (Math.abs(nearestRightDistance - distToZoneBoundary) < 1) {
              farSideDistance = stepDownWidth;
              farSideSide = 'right';
            }
          }
        } else {
          // 단내림 구간 가구 → 메인 쪽 경계에 인접 가구가 없을 때만 farSide
          // farSide = 메인 구간 폭 (전체 - 단내림 - 커튼박스)
          const mainZoneWidth = spaceInfo.width - stepDownWidth - freeCbWidth;
          if (stepDownPosition === 'left') {
            const distToZoneBoundary = Math.abs((zoneLimitRight - moduleRight) * 100);
            if (Math.abs(nearestRightDistance - distToZoneBoundary) < 1) {
              farSideDistance = mainZoneWidth;
              farSideSide = 'right';
            }
          } else {
            const distToZoneBoundary = Math.abs((moduleLeft - zoneLimitLeft) * 100);
            if (Math.abs(nearestLeftDistance - distToZoneBoundary) < 1) {
              farSideDistance = mainZoneWidth;
              farSideSide = 'left';
            }
          }
        }
      }

      return {
        module,
        moduleData,
        actualWidth,
        actualDepth,
        hasCustomDepth,
        moduleX,
        moduleY,
        moduleLeft,
        moduleRight,
        nearestLeftDistance,
        nearestRightDistance,
        leftBoundaryDistance,
        rightBoundaryDistance,
        farSideDistance,
        farSideSide,
        hasAdjacentLeft,
        hasAdjacentRight,
        isSpacerHandled,
        hasStepDown,
        stepDownPosition,
        stepDownWidth,
        zoneLimitLeft,
        zoneLimitRight,
      };
    }).filter(Boolean);
  }, [placedModules, currentViewDirection, spaceInfo, spaceHeight]);

  // 모든 자식 요소의 renderOrder를 설정
  useEffect(() => {
    if (groupRef.current) {
      // 그룹 자체의 renderOrder 설정
      groupRef.current.renderOrder = 999999;
      
      groupRef.current.traverse((child) => {
        // 타입 안전하게 처리
        if ('material' in child && child.material) {
          child.renderOrder = 999999; // 최대한 높은 값으로 설정
          if (child.material instanceof THREE.Material) {
            child.material.depthTest = false;
            child.material.depthWrite = false; // 깊이 쓰기도 비활성화
            child.material.needsUpdate = true;
          }
        }
      });
    }
  }, [currentViewDirection, showDimensions, placedModules.length, JSON.stringify(placedModules.map(m => ({ id: m.id, moduleId: m.moduleId, customDepth: m.customDepth, upperSectionDepth: m.upperSectionDepth, lowerSectionDepth: m.lowerSectionDepth, upperSectionDepthDirection: m.upperSectionDepthDirection, lowerSectionDepthDirection: m.lowerSectionDepthDirection, position: m.position }))), JSON.stringify(spaceInfo.columns?.map(col => ({ id: col.id, position: col.position, width: col.width, height: col.height, depth: col.depth })))]); // placedModules와 columns 변경사항을 세밀하게 감지
  
  // 치수 표시가 비활성화된 경우에도 기둥은 렌더링 (hooks 호출 후에 체크)
  // showDimensions가 false일 때는 치수선은 숨기지만 기둥은 표시
  
  // 폰트 크기 - 3D에서 더 크게 표시
  // 치수 텍스트 크기 통일 (2D: 0.4, 3D: 0.5)
  const baseFontSize = currentViewDirection === '3D' ? 0.5 : 0.4;
  const largeFontSize = currentViewDirection === '3D' ? 0.5 : 0.4;
  const smallFontSize = currentViewDirection === '3D' ? 0.5 : 0.4;
  // 텍스트 외곽선 제거 (2D/3D 모두)
  const textOutlineWidth = 0;
  const textOutlineColor = '#ffffff';
  // 3D 치수선 굵기 (더 명확하게)
  const dimLineWidth = currentViewDirection === '3D' ? 2 : 1;
  const dimMainLineWidth = currentViewDirection === '3D' ? 2.5 : 2;
  
  // 인덱싱은 이미 상단에서 계산됨
  const { threeUnitBoundaries, columnCount } = indexing;
  
  // 치수선 위치 설정 - 일관된 간격으로 배치
  const hasPlacedModules = placedModules.length > 0;
  const is3DMode = currentViewDirection === '3D'; // 3D 모드인지 판단
  // hasDroppedCeiling은 이미 상단(212번줄)에서 선언됨

  // 치수선 간격 상수 (일관성 있는 레이아웃)
  const DIMENSION_GAP = 120; // 치수선 간 간격 (mm)
  const EXTENSION_LENGTH = 60; // 보조선 연장 길이 (mm)

  // 치수선 균등 간격 배치: 4단 — 전체폭 → 구간사이즈 → 슬롯합계(실배치) → 슬롯폭
  // 자유배치+단내림+가구없음: 2단(전체폭+구간사이즈)으로 축소
  const DIM_GAP = 120; // 치수선 간 간격 120mm (균등)
  const hasFreeStepCeiling = isFreePlacement && !!spaceInfo.stepCeiling?.enabled;
  // 구간 분리 조건: 단내림/커튼박스가 활성화되면 구간 치수선 필요
  // 자유배치 "커튼박스" = droppedCeiling 필드, 슬롯배치 "커튼박스" = curtainBox 필드
  const hasAnyCurtainBox = !!spaceInfo.curtainBox?.enabled; // 슬롯배치 커튼박스
  const hasFreeCurtainBox = isFreePlacement && !!hasDroppedCeiling; // 자유배치 커튼박스 (droppedCeiling 필드 사용)
  const hasAnyStepDown = hasFreeStepCeiling || (!!hasDroppedCeiling && !isFreePlacement);
  const hasZoneSplit = hasAnyStepDown || hasAnyCurtainBox || hasFreeCurtainBox;
  // 커튼박스만(단내림 없음) + 가구 없음 → 3단 배치폭 불필요 (2단: 전체폭+구간사이즈)
  const cbOnly = hasZoneSplit && !hasAnyStepDown && !hasFreeStepCeiling; // 커튼박스만 활성
  const dimLevels = hasZoneSplit
    ? (hasPlacedModules ? 4 : (cbOnly ? 2 : 3))
    : isFreePlacement ? 3 : 3;
  const hasInstalledDoorForVerticalGuides = placedModules.some((module) => {
    if (!module.hasDoor) return false;
    const moduleData = getModuleById(
      module.moduleId,
      { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
      spaceInfo
    );
    const moduleId = module.moduleId || '';
    const hasExternalMaidaDimension = isExternalMaidaModule(moduleId)
      && !!getExternalMaidaDimensionSide(module);
    return !!moduleData?.hasDoor || hasExternalMaidaDimension;
  });
  const doorVerticalGuideExpansionMm = hasInstalledDoorForVerticalGuides ? 160 : 0;
  // 최상단: 전체 너비 (3600)
  const topDimensionY = spaceHeight + mmToThreeUnits(DIM_GAP * dimLevels);
  // 2단: 구간사이즈 (2700 / 900)
  const columnDimensionY = spaceHeight + mmToThreeUnits(DIM_GAP * (dimLevels - 1));
  // 3단: 슬롯 합계 너비 (실배치 공간) — 단내림 있을 때만
  const slotTotalDimensionY = spaceHeight + mmToThreeUnits(DIM_GAP * (dimLevels - 2));
  // 최하단: 개별 슬롯 너비
  const slotDimensionY = spaceHeight + mmToThreeUnits(DIM_GAP);
  const leftFrameDimensionX = -mmToThreeUnits(120 + doorVerticalGuideExpansionMm); // 좌측 프레임 분해 치수선 (공간에 가까운 안쪽)
  const leftDimensionX = leftFrameDimensionX - mmToThreeUnits(200); // 좌측 전체높이 치수선 (프레임 분해보다 충분히 바깥)

  // 좌측 오프셋 (가로 공간치수의 절반)
  const leftOffset = -mmToThreeUnits(spaceInfo.width / 2);

  // 프레임 사이즈 정보
  const frameSize = spaceInfo.frameSize || { left: 50, right: 50, top: 50 };
  
  // 디버깅 로그
// console.log('🔍 CleanCAD2D Debug:', {
    // spaceWidth: spaceInfo.width,
    // droppedCeilingEnabled: spaceInfo.droppedCeiling?.enabled,
    // droppedCeilingWidth: spaceInfo.droppedCeiling?.width,
    // droppedCeilingPosition: spaceInfo.droppedCeiling?.position,
    // frameSize,
    // leftOffset,
    // normalBoundsWidth: spaceInfo.width - (spaceInfo.droppedCeiling?.width || 0),
    // droppedBoundsWidth: spaceInfo.droppedCeiling?.width || 0
  // });
  
  // 화살표 생성 함수
  const createArrowHead = (start: [number, number, number], end: [number, number, number], size = 0.008) => {
    const direction = new THREE.Vector3(end[0] - start[0], end[1] - start[1], end[2] - start[2]).normalize();
    const perpendicular = new THREE.Vector3(-direction.y, direction.x, 0).multiplyScalar(size);
    
    return [
      [start[0] + direction.x * size + perpendicular.x, start[1] + direction.y * size + perpendicular.y, start[2]],
      start,
      [start[0] + direction.x * size - perpendicular.x, start[1] + direction.y * size - perpendicular.y, start[2]]
    ] as [number, number, number][];
  };

  const resolveGlassCabinetBodyHeightMm = (module: any, moduleData?: any, topFrameHeightOverride?: number) => {
    if (!module?.moduleId?.includes('glass-cabinet')) {
      return module?.freeHeight ?? module?.customHeight ?? moduleData?.dimensions?.height ?? 1920;
    }

    const globalTopFrameMm = spaceInfo.frameSize?.top ?? 30;
    const globalBaseFrameMm = spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 65) : 0;
    const isFreePlacementModule = module.isFreePlacement || spaceInfo.layoutMode === 'free-placement';
    const ceilingMm = module.zone === 'dropped'
      ? (isFreePlacementModule && spaceInfo.stepCeiling?.enabled
        ? spaceInfo.height - (spaceInfo.stepCeiling.dropHeight || 0)
        : spaceInfo.droppedCeiling?.enabled
          ? spaceInfo.height - (spaceInfo.droppedCeiling.dropHeight || 0)
          : spaceInfo.height)
      : spaceInfo.height;
    const topClearanceMm = module.hasTopFrame === false
      ? Math.max(0, Math.round(module.topFrameGap ?? 0))
      : Math.max(0, Math.round(topFrameHeightOverride ?? module.topFrameThickness ?? globalTopFrameMm));
    const bottomClearanceMm = module.hasBase === false
      ? Math.max(0, Math.round(module.individualFloatHeight ?? 0))
      : Math.max(0, Math.round(module.baseFrameHeight ?? globalBaseFrameMm));

    return Math.max(0, Math.round(ceilingMm - topClearanceMm - bottomClearanceMm));
  };

  const renderGlassDrawerSideSplitDimensions = (
    module: any,
    x: number,
    lineZ: number,
    textZ: number,
    keyPrefix: string
  ) => {
    const mid = module?.moduleId || '';
    if (!module || !mid.includes('glass-cabinet')) return null;

    const moduleData = getModuleById(mid, calculateInternalSpace(spaceInfo), spaceInfo);
    if (!moduleData) return null;

    const glassH = resolveGlassCabinetBodyHeightMm(module, moduleData);
    const sideH = 500;
    const maxOffset = Math.max(0, glassH - sideH);
    const currentOffset = Math.max(0, Math.min(maxOffset, module.glassDrawerOffsetMm ?? 242));
    const lowerH = Math.round(currentOffset);
    const drawerH = sideH;
    const upperH = Math.round(Math.max(0, glassH - sideH - currentOffset));
    const baseMm = spaceInfo.baseConfig?.type === 'floor'
      ? (module.baseFrameHeight ?? spaceInfo.baseConfig?.height ?? 65)
      : 0;
    const glassBottomAbsMm = module.hasBase === false
      ? Math.max(0, module.individualFloatHeight ?? 0)
      : baseMm;
    const drawerBottomAbsMm = glassBottomAbsMm + currentOffset;
    const drawerTopAbsMm = drawerBottomAbsMm + sideH;
    const glassTopAbsMm = glassBottomAbsMm + glassH;
    const yGlassBottom = mmToThreeUnits(glassBottomAbsMm);
    const yDrawerBottom = mmToThreeUnits(drawerBottomAbsMm);
    const yDrawerTop = mmToThreeUnits(drawerTopAbsMm);
    const yGlassTop = mmToThreeUnits(glassTopAbsMm);
    const tickW = mmToThreeUnits(15);

    const setLowerGap = (value: number) => {
      const next = Math.max(0, Math.min(maxOffset, value));
      updatePlacedModule(module.id, { glassDrawerOffsetMm: next });
    };

    const setUpperGap = (value: number) => {
      const next = Math.max(0, Math.min(maxOffset, glassH - sideH - value));
      updatePlacedModule(module.id, { glassDrawerOffsetMm: next });
    };

    // 측면뷰(좌/우)는 카메라가 X축 방향에서 보므로 Html이 안정적으로 표시되지 않을 수 있음
    // → 측면뷰에서는 Text로 출력 (회전 보정)
    const isSideView = keyPrefix === 'left' || keyPrefix === 'right';
    const sideTextRotation: [number, number, number] = keyPrefix === 'left'
      ? [0, -Math.PI / 2, -Math.PI / 2]
      : [0, Math.PI / 2, Math.PI / 2];
    return (
      <React.Fragment key={`glass-side-split-${keyPrefix}-${module.id}`}>
        <NativeLine name="dimension_line"
          points={[[x, yGlassBottom, lineZ], [x, yGlassTop, lineZ]]}
          color={dimensionColor} lineWidth={0.6}
        />
        {[yGlassBottom, yDrawerBottom, yDrawerTop, yGlassTop].map((y, index) => (
          <NativeLine key={`glass-side-split-tick-${keyPrefix}-${index}`} name="dimension_line"
            points={[[x, y, lineZ - tickW / 2], [x, y, lineZ + tickW / 2]]}
            color={dimensionColor} lineWidth={0.6}
          />
        ))}
        {(isSideView || readOnly) ? (
          <Text
            renderOrder={100001}
            depthTest={false}
            position={[x, (yGlassBottom + yDrawerBottom) / 2, textZ]}
            fontSize={baseFontSize}
            color={textColor}
            anchorX="center"
            anchorY="middle"
            outlineWidth={textOutlineWidth}
            outlineColor={textOutlineColor}
            rotation={isSideView ? sideTextRotation : [0, 0, 0]}
          >
            {lowerH}
          </Text>
        ) : (
          <Html
            position={[x, (yGlassBottom + yDrawerBottom) / 2, textZ]}
            center
            style={{ pointerEvents: 'auto', background: 'transparent' }}
            occlude={false}
            zIndexRange={[10000, 10]}
            transform={false}
          >
            <GlassDrawerGapEditor value={lowerH} color={dimensionColor} onChange={setLowerGap} />
          </Html>
        )}
        <Text
          renderOrder={100001}
          depthTest={false}
          position={[x, (yDrawerBottom + yDrawerTop) / 2, textZ]}
          fontSize={baseFontSize}
          color={textColor}
          anchorX="center"
          anchorY="middle"
          outlineWidth={textOutlineWidth}
          outlineColor={textOutlineColor}
          rotation={isSideView ? sideTextRotation : [0, 0, 0]}
        >
          {drawerH}
        </Text>
        {(isSideView || readOnly) ? (
          <Text
            renderOrder={100001}
            depthTest={false}
            position={[x, (yDrawerTop + yGlassTop) / 2, textZ]}
            fontSize={baseFontSize}
            color={textColor}
            anchorX="center"
            anchorY="middle"
            outlineWidth={textOutlineWidth}
            outlineColor={textOutlineColor}
            rotation={isSideView ? sideTextRotation : [0, 0, 0]}
          >
            {upperH}
          </Text>
        ) : (
          <Html
            position={[x, (yDrawerTop + yGlassTop) / 2, textZ]}
            center
            style={{ pointerEvents: 'auto', background: 'transparent' }}
            occlude={false}
            zIndexRange={[10000, 10]}
            transform={false}
          >
            <GlassDrawerGapEditor value={upperH} color={dimensionColor} onChange={setUpperGap} />
          </Html>
        )}
      </React.Fragment>
    );
  };

  // 뷰 방향별 치수선 렌더링
  const renderDimensions = () => {
    // showDimensions가 false이면 렌더링 안 함
// console.log('🔵 renderDimensions called:', { showDimensions, currentViewDirection });
    if (!showDimensions || hingePositionEditModeModuleId) {
// console.log('❌ showDimensions is false, returning null');
      return null;
    }

    switch (currentViewDirection) {
      case '3D':
      case 'front':
        return renderFrontView();
      case 'left':
        return renderLeftView();
      case 'right':
        return renderRightView();
      case 'top':
        return renderTopView();
      default:
        return renderFrontView();
    }
  };

  // 정면뷰 치수선 - 3D 모드에서는 가구 앞면(도어 두께만큼 뒤)에 배치
  const doorThicknessOffset = mmToThreeUnits(20); // 도어 두께 20mm
  const frontFrameZ = -doorThicknessOffset; // 가구 본체 앞면 z 좌표
  const frontDimensionBackIndicatorZ = (() => {
    const panelDepthMm = spaceInfo.depth || 1500;
    const furnitureDepthMm = 600;
    const panelDepth = mmToThreeUnits(panelDepthMm);
    const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
    const roomBackZ = -panelDepth / 2;
    const furnitureZOffset = roomBackZ + (panelDepth - furnitureDepth) / 2;
    const guideBackZ = furnitureZOffset - furnitureDepth / 2 - mmToThreeUnits(10 + 30);
    return guideBackZ + mmToThreeUnits(20);
  })();
  const zOffset = is3DMode
    ? (hasFrontPlacedModules ? frontFrameZ : frontDimensionBackIndicatorZ)
    : 0;
  const frontViewLocalZ = (worldZ: number | undefined, localOffset = 0.002) => {
    if (!is3DMode || worldZ === undefined || Number.isNaN(worldZ)) return localOffset;
    return worldZ - zOffset + localOffset;
  };
  const resolveFrontDimensionFrontZ = (
    module: any,
    section: 'upper' | 'lower' | 'auto'
  ) => {
    if (!module) return undefined;
    const moduleData = getModuleById(
      module.moduleId,
      { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
      spaceInfo
    );
    if (!moduleData) return undefined;
    const panelDepthMm = spaceInfo.depth || 600;
    const furnitureDepthMm = Math.min(panelDepthMm, 600);
    const panelDepth = mmToThreeUnits(panelDepthMm);
    const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
    const roomBackZ = -panelDepth / 2;
    const furnitureZOffsetValue = roomBackZ + (panelDepth - furnitureDepth) / 2;
    return resolveSideDimensionDepthSpanZ(module, moduleData, section, furnitureZOffsetValue, furnitureDepth).frontZ;
  };
  const resolveFrontTopDimensionLocalZ = (localOffset = 0.002) => {
    const upperRef = placedModules.find(m => {
      if (m.isSurroundPanel) return false;
      const data = getModuleById(
        m.moduleId,
        { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
        spaceInfo
      );
      return data?.category === 'upper' || m.moduleId?.includes('upper-cabinet');
    });
    const fallbackRef = placedModules.find(m => !m.isSurroundPanel);
    const ref = upperRef ?? fallbackRef;
    const worldZ = resolveFrontDimensionFrontZ(ref, upperRef ? 'upper' : 'auto');
    return frontViewLocalZ(worldZ, localOffset);
  };
  
  const renderFrontView = () => (
    <group position={[0, 0, zOffset]} renderOrder={9999}>
      {/* 단내림 구간 표시 (해칭) - 2D 모드, 슬롯배치에서만 (자유배치 커튼박스는 천장 위 구간이므로 해치 불필요) */}
      {spaceInfo.droppedCeiling?.enabled && !isFreePlacement && currentViewDirection !== '3D' && (() => {
        const droppedWidth = mmToThreeUnits(spaceInfo.droppedCeiling.width || (isFreePlacement ? 150 : 900));
        const droppedHeight = mmToThreeUnits(spaceInfo.droppedCeiling.dropHeight || 200);
        const totalHeight = mmToThreeUnits(spaceInfo.height);
        // 자유배치: 커튼박스가 위로 확장 (normalHeight=totalHeight, 해칭은 totalHeight~totalHeight+droppedHeight)
        // 슬롯배치: 단내림이 아래로 축소 (normalHeight=totalHeight-droppedHeight, 해칭은 normalHeight~totalHeight)
        const normalHeight = isFreePlacement ? totalHeight : totalHeight - droppedHeight;

        // 슬롯배치 커튼박스가 같은 쪽에 있으면 해칭 영역을 안쪽으로 이동
        const hatchCBShift = (!isFreePlacement && spaceInfo.curtainBox?.enabled &&
          spaceInfo.curtainBox.position === spaceInfo.droppedCeiling.position)
          ? (spaceInfo.curtainBox.width || 150) : 0;
        const droppedStartX = spaceInfo.droppedCeiling.position === 'left'
          ? leftOffset + mmToThreeUnits(hatchCBShift)
          : leftOffset + mmToThreeUnits(spaceInfo.width - (spaceInfo.droppedCeiling.width || (isFreePlacement ? 150 : 900)) - hatchCBShift);
        const droppedEndX = droppedStartX + droppedWidth;

        // 단내림 구간 빗금 해칭 (대각선 패턴)
        const hatchLines: JSX.Element[] = [];
        const hatchSpacing = mmToThreeUnits(40); // 40mm 간격 (2배 촘촘하게)

        // 좌측 상단 모서리부터 시작하도록 충분한 범위로 계산
        const totalDiagonal = droppedWidth + droppedHeight;
        const startOffset = -droppedHeight; // 상단 모서리까지 커버
        const endOffset = droppedWidth;
        const hatchCount = Math.ceil((endOffset - startOffset) / hatchSpacing) + 1;

        for (let i = 0; i <= hatchCount; i++) {
          const offset = startOffset + i * hatchSpacing;

          // 왼쪽 아래에서 오른쪽 위로 올라가는 대각선
          const startX = droppedStartX + offset;
          const startY = normalHeight;
          const endX = startX + droppedHeight;
          const endY = isFreePlacement ? totalHeight + droppedHeight : totalHeight;

          // 단내림 영역 내부만 그리도록 클리핑
          let clippedStartX = startX;
          let clippedStartY = startY;
          let clippedEndX = endX;
          let clippedEndY = endY;

          // X축 클리핑
          if (startX < droppedStartX) {
            const dy = droppedStartX - startX;
            clippedStartX = droppedStartX;
            clippedStartY = startY + dy;
          }
          if (endX > droppedEndX) {
            const dy = endX - droppedEndX;
            clippedEndX = droppedEndX;
            clippedEndY = endY - dy;
          }

          // 유효한 선분인지 확인
          const hatchTop = isFreePlacement ? totalHeight + droppedHeight : totalHeight;
          if (clippedStartX < droppedEndX && clippedEndX > droppedStartX &&
              clippedStartY < hatchTop && clippedEndY > normalHeight) {
            hatchLines.push(
              <Line
                key={`hatch-${i}`}
                points={[[clippedStartX, clippedStartY, 0.001], [clippedEndX, clippedEndY, 0.001]]}
                color={theme === 'dark' ? '#FFD700' : '#999999'}
                lineWidth={0.3}
                opacity={0.6}
              />
            );
          }
        }

        return (
          <group>
            {/* 회색 반투명 배경 메쉬 */}
            <mesh position={[(droppedStartX + droppedEndX) / 2, (normalHeight + (isFreePlacement ? totalHeight + droppedHeight : totalHeight)) / 2, 0.0005]}>
              <planeGeometry args={[droppedWidth, droppedHeight]} />
              <meshBasicMaterial color="#999999" transparent opacity={0.15} depthTest={false} />
            </mesh>

            {/* 단내림/커튼박스 구간 경계선 */}
            {(() => {
              const hatchTop = isFreePlacement ? totalHeight + droppedHeight : totalHeight;
              const borderColor = theme === 'dark' ? '#FFD700' : '#999999';
              return (
                <>
                  <Line
                    points={[[droppedStartX, normalHeight, 0.002], [droppedStartX, hatchTop, 0.002]]}
                    color={borderColor}
                    lineWidth={0.5}
                  />
                  <Line
                    points={[[droppedEndX, normalHeight, 0.002], [droppedEndX, hatchTop, 0.002]]}
                    color={borderColor}
                    lineWidth={0.5}
                  />
                  <Line
                    points={[[droppedStartX, normalHeight, 0.002], [droppedEndX, normalHeight, 0.002]]}
                    color={borderColor}
                    lineWidth={0.5}
                  />
                  {/* 자유배치 커튼박스: 상단 수평선 */}
                  {isFreePlacement && (
                    <Line
                      points={[[droppedStartX, hatchTop, 0.002], [droppedEndX, hatchTop, 0.002]]}
                      color={borderColor}
                      lineWidth={0.5}
                    />
                  )}
                </>
              );
            })()}

            {/* 해칭 패턴 */}
            {hatchLines}
          </group>
        );
      })()}

      {/* stepCeiling 단내림 구간 표시 (해칭) - 2D 모드, 자유배치에서만 */}
      {isFreePlacement && spaceInfo.stepCeiling?.enabled && currentViewDirection !== '3D' && (() => {
        const scWidthMm = spaceInfo.stepCeiling!.width || 900;
        const scDropMm = spaceInfo.stepCeiling!.dropHeight || 200;
        const scWidth = mmToThreeUnits(scWidthMm);
        const scDropH = mmToThreeUnits(scDropMm);
        const totalHeight = mmToThreeUnits(spaceInfo.height);
        const normalHeight = totalHeight - scDropH; // 단내림 천장 높이

        // 커튼박스가 차지하는 영역 고려
        const cbWidthMm = spaceInfo.droppedCeiling?.enabled ? (spaceInfo.droppedCeiling.width || 0) : 0;

        const scStartX = spaceInfo.stepCeiling!.position === 'left'
          ? leftOffset + mmToThreeUnits(cbWidthMm * (spaceInfo.droppedCeiling?.position === 'left' ? 1 : 0))
          : leftOffset + mmToThreeUnits(spaceInfo.width - scWidthMm - cbWidthMm * (spaceInfo.droppedCeiling?.position === 'right' ? 1 : 0));
        const scEndX = scStartX + scWidth;

        // 해칭 패턴
        const hatchLines: JSX.Element[] = [];
        const hatchSpacing = mmToThreeUnits(40);
        const startOff = -scDropH;
        const endOff = scWidth;
        const hatchCount = Math.ceil((endOff - startOff) / hatchSpacing) + 1;

        for (let i = 0; i <= hatchCount; i++) {
          const off = startOff + i * hatchSpacing;
          const sx = scStartX + off;
          const sy = normalHeight;
          const ex = sx + scDropH;
          const ey = totalHeight;

          let cx1 = sx, cy1 = sy, cx2 = ex, cy2 = ey;
          if (sx < scStartX) { const d = scStartX - sx; cx1 = scStartX; cy1 = sy + d; }
          if (ex > scEndX) { const d = ex - scEndX; cx2 = scEndX; cy2 = ey - d; }

          if (cx1 < scEndX && cx2 > scStartX && cy1 < totalHeight && cy2 > normalHeight) {
            hatchLines.push(
              <Line
                key={`sc-hatch-${i}`}
                points={[[cx1, cy1, 0.001], [cx2, cy2, 0.001]]}
                color={theme === 'dark' ? '#FFD700' : '#999999'}
                lineWidth={0.3}
                opacity={0.6}
              />
            );
          }
        }

        return (
          <group>
            {/* 반투명 배경 */}
            <mesh position={[(scStartX + scEndX) / 2, (normalHeight + totalHeight) / 2, 0.0005]}>
              <planeGeometry args={[scWidth, scDropH]} />
              <meshBasicMaterial color="#999999" transparent opacity={0.15} depthTest={false} />
            </mesh>
            {/* 경계선 */}
            <Line points={[[scStartX, normalHeight, 0.002], [scStartX, totalHeight, 0.002]]} color={theme === 'dark' ? '#FFD700' : '#999999'} lineWidth={0.5} />
            <Line points={[[scEndX, normalHeight, 0.002], [scEndX, totalHeight, 0.002]]} color={theme === 'dark' ? '#FFD700' : '#999999'} lineWidth={0.5} />
            <Line points={[[scStartX, normalHeight, 0.002], [scEndX, normalHeight, 0.002]]} color={theme === 'dark' ? '#FFD700' : '#999999'} lineWidth={0.5} />
            {hatchLines}
          </group>
        );
      })()}

      {/* 바닥마감재 해치 표시 - 2D 모드에서만 */}
      {floorFinishHeightMmGlobal > 0 && currentViewDirection !== '3D' && (() => {
        const floorFinishH = mmToThreeUnits(floorFinishHeightMmGlobal);
        const floorStartX = leftOffset;
        const floorEndX = leftOffset + mmToThreeUnits(spaceInfo.width);
        const floorWidth = mmToThreeUnits(spaceInfo.width);

        // 해칭 대각선
        const floorHatchLines: JSX.Element[] = [];
        const hatchSpacing = mmToThreeUnits(40);
        const startOff = -floorFinishH;
        const endOff = floorWidth;
        const count = Math.ceil((endOff - startOff) / hatchSpacing) + 1;

        for (let i = 0; i <= count; i++) {
          const off = startOff + i * hatchSpacing;
          const sx = floorStartX + off;
          const sy = 0;
          const ex = sx + floorFinishH;
          const ey = floorFinishH;

          let cx0 = sx, cy0 = sy, cx1 = ex, cy1 = ey;
          if (sx < floorStartX) { const d = floorStartX - sx; cx0 = floorStartX; cy0 = sy + d; }
          if (ex > floorEndX) { const d = ex - floorEndX; cx1 = floorEndX; cy1 = ey - d; }

          if (cx0 < floorEndX && cx1 > floorStartX && cy0 < floorFinishH && cy1 > 0) {
            floorHatchLines.push(
              <Line
                key={`floor-hatch-${i}`}
                points={[[cx0, cy0, 0.001], [cx1, cy1, 0.001]]}
                color={theme === 'dark' ? '#FFCC99' : '#CC8844'}
                lineWidth={0.3}
                opacity={0.6}
              />
            );
          }
        }

        return (
          <group>
            {/* 바닥마감재 배경 */}
            <mesh position={[(floorStartX + floorEndX) / 2, floorFinishH / 2, 0.0005]}>
              <planeGeometry args={[floorWidth, floorFinishH]} />
              <meshBasicMaterial color="#FFCC99" transparent opacity={0.2} depthTest={false} />
            </mesh>
            {/* 바닥마감재 상단 경계선 */}
            <Line
              points={[[floorStartX, floorFinishH, 0.002], [floorEndX, floorFinishH, 0.002]]}
              color={theme === 'dark' ? '#FFCC99' : '#CC8844'}
              lineWidth={0.6}
            />
            {floorHatchLines}
          </group>
        );
      })()}

      {/* 정면도 치수선들 */}
      {showDimensions && (
        <>
          {/* 상단 전체 프레임 포함 폭 치수선 - 가구공간(좌) + 커튼박스(별도) 분리 표시 */}
          <group>
        {(() => {
          const cbEnabledTop = !!spaceInfo.curtainBox?.enabled;
          const cbWidthTop = cbEnabledTop ? (spaceInfo.curtainBox?.width || 150) : 0;
          const cbPositionTop = spaceInfo.curtainBox?.position || 'right';
          const spaceLeft = leftOffset;
          const spaceRight = mmToThreeUnits(spaceInfo.width) + leftOffset;
          // 가구 배치 공간 경계
          const furnitureLeft = spaceLeft + (cbEnabledTop && cbPositionTop === 'left' ? mmToThreeUnits(cbWidthTop) : 0);
          const furnitureRight = spaceRight - (cbEnabledTop && cbPositionTop === 'right' ? mmToThreeUnits(cbWidthTop) : 0);
          const furnitureWidth = spaceInfo.width - cbWidthTop;
          const topSpaceDimZ = resolveFrontTopDimensionLocalZ(0.002);
          const topSpaceExtZ = resolveFrontTopDimensionLocalZ(0.001);
          const topSpaceTextZ = resolveFrontTopDimensionLocalZ(0.01);

          const renderDimSegment = (left: number, right: number, label: number, keyId: string) => (
            <React.Fragment key={keyId}>
              <NativeLine name="dimension_line"
                points={[[left, topDimensionY, topSpaceDimZ], [right, topDimensionY, topSpaceDimZ]]}
                color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
              />
              <NativeLine name="dimension_line"
                points={createArrowHead([left, topDimensionY, topSpaceDimZ], [left + 0.05, topDimensionY, topSpaceDimZ])}
                color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
              />
              <NativeLine name="dimension_line"
                points={createArrowHead([right, topDimensionY, topSpaceDimZ], [right - 0.05, topDimensionY, topSpaceDimZ])}
                color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
              />
              {(showDimensionsText || isStep2) && (
                <Text
                  renderOrder={100001} depthTest={false}
                  position={[(left + right) / 2, topDimensionY + mmToThreeUnits(40), topSpaceTextZ]}
                  fontSize={largeFontSize} color={textColor} anchorX="center" anchorY="middle"
                  outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                >
                  {Math.round(label)}
                </Text>
              )}
            </React.Fragment>
          );

          return (
            <>
              {/* 좌측 커튼박스 구간 치수 */}
              {cbEnabledTop && cbPositionTop === 'left' &&
                renderDimSegment(spaceLeft, furnitureLeft, cbWidthTop, 'dim-cb-left')}

              {/* 가구 배치 공간 치수 */}
              {renderDimSegment(furnitureLeft, furnitureRight, furnitureWidth, 'dim-furniture')}

              {/* 우측 커튼박스 구간 치수 */}
              {cbEnabledTop && cbPositionTop === 'right' &&
                renderDimSegment(furnitureRight, spaceRight, cbWidthTop, 'dim-cb-right')}

              {/* 연장선 (최좌측) */}
              <NativeLine name="dimension_line"
                points={[[spaceLeft, spaceHeight, topSpaceExtZ], [spaceLeft, topDimensionY + mmToThreeUnits(40), topSpaceExtZ]]}
                color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
              />

              {/* 연장선 (커튼박스/가구 경계) */}
              {cbEnabledTop && cbPositionTop === 'left' && (
                <NativeLine name="dimension_line"
                  points={[[furnitureLeft, spaceHeight, topSpaceExtZ], [furnitureLeft, topDimensionY + mmToThreeUnits(40), topSpaceExtZ]]}
                  color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                />
              )}
              {cbEnabledTop && cbPositionTop === 'right' && (
                <NativeLine name="dimension_line"
                  points={[[furnitureRight, spaceHeight, topSpaceExtZ], [furnitureRight, topDimensionY + mmToThreeUnits(40), topSpaceExtZ]]}
                  color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                />
              )}

              {/* 연장선 (최우측) */}
              <NativeLine name="dimension_line"
                points={[[spaceRight, spaceHeight, topSpaceExtZ], [spaceRight, topDimensionY + mmToThreeUnits(40), topSpaceExtZ]]}
                color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
              />
            </>
          );
        })()}
      </group>

      {/* 노서라운드 모드 좌측 엔드패널/이격거리 치수선 — 좌측 커튼박스일 때만 숨김 */}
      {showDimensions && !isStep2 && spaceInfo.surroundType === 'no-surround' && !(spaceInfo.curtainBox?.enabled && spaceInfo.curtainBox?.position === 'left') && (() => {
        // 벽없음(freestanding)이면 이격거리/엔드패널 치수선 미표시
        if (spaceInfo.installType === 'freestanding') return null;

        // 커튼박스는 공간과 별개 → 좌측 커튼박스 있어도 좌측 이격 표시 유지 (커튼박스 바로 우측에 위치)

        // ── gapConfig/엔드패널 로직 ──
        const frameThickness = calculateFrameThickness(spaceInfo, hasLeftFurniture, hasRightFurniture);

        // 왼쪽 벽이 있는지 확인
        const hasLeftWall = spaceInfo.wallConfig?.left;

        // 왼쪽 엔드패널 값 결정
        let leftValue: number;
        let leftText: string;

        if (hasLeftWall) {
          // 왼쪽 벽이 있으면 이격거리 표시
          leftValue = spaceInfo.gapConfig?.left ?? 1.5;
          const r = Math.round(leftValue * 10) / 10;
          leftText = r % 1 === 0 ? String(r) : r.toFixed(1);
        } else {
          // 왼쪽 벽이 없으면 EP는 사용자 선택이므로 치수 미표시
          leftValue = 0;
          leftText = '0';
        }
        // 이격거리가 0이면 표시하지 않음
        if (leftValue === 0) return null;

        // 커튼박스 좌측 활성화 시 좌측 이격은 커튼박스 바로 오른쪽(가구공간 시작)에 배치
        const cbLeftActive = !!(spaceInfo.curtainBox?.enabled && spaceInfo.curtainBox?.position === 'left');
        const cbLeftWidth = cbLeftActive ? (spaceInfo.curtainBox?.width || 150) : 0;
	        const leftStart = leftOffset + mmToThreeUnits(cbLeftWidth);
	        // 이격 치수선: 단내림/커튼박스 활성 시 3단(slotTotalDimensionY)에 배치
	        const leftDimY = hasZoneSplit ? slotTotalDimensionY : slotDimensionY;
	        const gapDimZ = resolveFrontTopDimensionLocalZ(0.002);
	        const gapExtZ = resolveFrontTopDimensionLocalZ(0.001);
	        const gapTextZ = resolveFrontTopDimensionLocalZ(0.01);

        return (
          <group>
	            {/* 치수선 */}
	            <Line
	              points={[[leftStart, leftDimY, gapDimZ], [leftStart + mmToThreeUnits(leftValue), leftDimY, gapDimZ]]}
	              color={dimensionColor}
	              lineWidth={0.6}
	            />

	            {/* 좌측 화살표 */}
	            <Line
	              points={createArrowHead([leftStart, leftDimY, gapDimZ], [leftStart + 0.02, leftDimY, gapDimZ])}
	              color={dimensionColor}
	              lineWidth={0.6}
	            />

	            {/* 우측 화살표 */}
	            <Line
	              points={createArrowHead([leftStart + mmToThreeUnits(leftValue), leftDimY, gapDimZ], [leftStart + mmToThreeUnits(leftValue) - 0.02, leftDimY, gapDimZ])}
	              color={dimensionColor}
	              lineWidth={0.6}
	            />

            {/* 좌측 치수 텍스트 - 이격거리 클릭 편집 */}
	            {hasLeftWall && editingGapSide === 'left' ? (
	              <Html
	                position={[leftStart + mmToThreeUnits(leftValue), leftDimY + mmToThreeUnits(30), gapTextZ]}
                style={{ pointerEvents: 'auto', transform: 'translate(-50%, -50%)' }}
                zIndexRange={[10000, 10001]}
              >
                <div style={{ background: currentViewDirection !== '3D' && view2DTheme === 'dark' ? 'rgba(31,41,55,0.98)' : 'rgba(255,255,255,0.98)', padding: '3px', borderRadius: '4px', border: '2px solid #2196F3', boxShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
                  <input
                    ref={gapInputRef}
                    type="number"
                    step="0.5"
                    value={editingGapValue}
                    onChange={(e) => setEditingGapValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleGapEditSubmit(); else if (e.key === 'Escape') handleGapEditCancel(); }}
                    onBlur={handleGapEditSubmit}
                    style={{ width: '50px', padding: '2px 4px', border: '1px solid #555', borderRadius: '2px', fontSize: '12px', fontWeight: 'bold', textAlign: 'center', outline: 'none', background: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#1f2937' : '#fff', color: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#fff' : '#000' }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span style={{ marginLeft: '2px', fontSize: '11px', color: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#9ca3af' : '#666' }}>mm</span>
                </div>
              </Html>
            ) : (
	              <Html
	                position={[leftStart + mmToThreeUnits(leftValue), leftDimY + mmToThreeUnits(30), gapTextZ]}
                style={{ pointerEvents: hasLeftWall ? 'auto' : 'none', transform: 'translate(-50%, -50%)' }}
                zIndexRange={[9999, 10000]}
              >
                <div
                  style={{
                    padding: '2px 6px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    color: dimensionColor,
                    cursor: hasLeftWall ? 'pointer' : 'default',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                    background: hasLeftWall ? (currentViewDirection !== '3D' && view2DTheme === 'dark' ? 'rgba(31,41,55,0.9)' : 'rgba(255,255,255,0.9)') : 'transparent',
                    borderRadius: '3px',
                  }}
                  onClick={(e) => { if (hasLeftWall) { e.stopPropagation(); handleGapEdit('left', leftValue); } }}
                >
                  {leftText}
                </div>
              </Html>
            )}

            {/* 연장선 */}
	            <Line
	              points={[[leftStart, spaceHeight, gapExtZ], [leftStart, leftDimY + mmToThreeUnits(20), gapExtZ]]}
	              color={dimensionColor}
	              lineWidth={0.3}
	            />
	            <Line
	              points={[[leftStart + mmToThreeUnits(leftValue), spaceHeight, gapExtZ], [leftStart + mmToThreeUnits(leftValue), leftDimY + mmToThreeUnits(20), gapExtZ]]}
	              color={dimensionColor}
	              lineWidth={0.3}
	            />
          </group>
        );
      })()}

      {/* 좌측 이격거리 치수선 (단내림 활성 시, 서라운드 전용) — 커튼박스 활성 시 숨김 */}
      {showDimensions && !isStep2 && spaceInfo.surroundType !== 'no-surround' && !isFreePlacement && spaceInfo.droppedCeiling?.enabled && !spaceInfo.curtainBox?.enabled && (() => {
        const leftGap = spaceInfo.gapConfig?.left ?? 0;
        if (leftGap <= 0) return null;
        const frameThk = calculateFrameThickness(spaceInfo, hasLeftFurniture, hasRightFurniture);
        const gapStartX = leftOffset + mmToThreeUnits(frameThk.left);
	        const gapEndX = gapStartX + mmToThreeUnits(leftGap);
	        const fmtVal = (() => { const r = Math.round(leftGap * 10) / 10; return r % 1 === 0 ? String(r) : r.toFixed(1); })();
	        const gapDimY = slotDimensionY - mmToThreeUnits(80);
	        const gapDimZ = resolveFrontTopDimensionLocalZ(0.002);
	        const gapExtZ = resolveFrontTopDimensionLocalZ(0.001);
	        const gapTextZ = resolveFrontTopDimensionLocalZ(0.01);
	        return (
	          <group>
	            <Line points={[[gapStartX, gapDimY, gapDimZ], [gapEndX, gapDimY, gapDimZ]]} color={dimensionColor} lineWidth={0.6} />
	            <Line points={createArrowHead([gapStartX, gapDimY, gapDimZ], [gapStartX + 0.02, gapDimY, gapDimZ])} color={dimensionColor} lineWidth={0.6} />
	            <Line points={createArrowHead([gapEndX, gapDimY, gapDimZ], [gapEndX - 0.02, gapDimY, gapDimZ])} color={dimensionColor} lineWidth={0.6} />
	            <Html position={[(gapStartX + gapEndX) / 2, gapDimY + mmToThreeUnits(30), gapTextZ]} center style={{ pointerEvents: 'auto' }} zIndexRange={[9999, 10000]}>
              <div style={{ padding: '2px 6px', fontSize: '12px', fontWeight: 'bold', color: dimensionColor, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', background: currentViewDirection !== '3D' && view2DTheme === 'dark' ? 'rgba(31,41,55,0.7)' : 'rgba(255,255,255,0.7)', borderRadius: '3px' }}
                onClick={(e) => { e.stopPropagation(); handleGapEdit('left', leftGap); }}>
                {fmtVal}
              </div>
            </Html>
	            <Line points={[[gapStartX, spaceHeight, gapExtZ], [gapStartX, gapDimY + mmToThreeUnits(20), gapExtZ]]} color={dimensionColor} lineWidth={0.3} />
	            <Line points={[[gapEndX, spaceHeight, gapExtZ], [gapEndX, gapDimY + mmToThreeUnits(20), gapExtZ]]} color={dimensionColor} lineWidth={0.3} />
	          </group>
	        );
	      })()}

      {/* 노서라운드 모드 우측 엔드패널/이격거리 치수선 — 우측 커튼박스면 숨김 */}
      {showDimensions && !isStep2 && spaceInfo.surroundType === 'no-surround' && !(spaceInfo.curtainBox?.enabled && spaceInfo.curtainBox?.position === 'right') && (() => {

        // 벽없음(freestanding)이면 이격거리/엔드패널 치수선 미표시
        if (spaceInfo.installType === 'freestanding') return null;

        // 커튼박스는 공간과 별개 취급 → 우측 커튼박스 있어도 우측 이격 표시 유지 (커튼박스 바로 좌측에 위치)

        // ── gapConfig/엔드패널 로직 ──
        const frameThickness = calculateFrameThickness(spaceInfo, hasLeftFurniture, hasRightFurniture);

        // 오른쪽 벽이 있는지 확인
        const hasRightWall = spaceInfo.wallConfig?.right;

        // 오른쪽 엔드패널 값 결정
        let rightValue: number;
        let rightText: string;

        if (hasRightWall) {
          // 오른쪽 벽이 있으면 이격거리 표시
          rightValue = spaceInfo.gapConfig?.right ?? 1.5;
          const rr = Math.round(rightValue * 10) / 10;
          rightText = rr % 1 === 0 ? String(rr) : rr.toFixed(1);
        } else {
          // 오른쪽 벽이 없으면 EP는 사용자 선택이므로 치수 미표시
          rightValue = 0;
          rightText = '0';
        }

        // 이격거리가 0이면 표시하지 않음
        if (rightValue === 0) return null;

        // 커튼박스 우측 활성화 시 우측 이격은 커튼박스 바로 왼쪽(가구공간 끝)에 배치
        const cbRightActive = !!(spaceInfo.curtainBox?.enabled && spaceInfo.curtainBox?.position === 'right');
        const cbRightWidth = cbRightActive ? (spaceInfo.curtainBox?.width || 150) : 0;
	        const rightEdge = mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(cbRightWidth);
	        // 이격 치수선: 단내림/커튼박스 활성 시 3단(slotTotalDimensionY)에 배치
	        const rightDimY = hasZoneSplit ? slotTotalDimensionY : slotDimensionY;
	        const gapDimZ = resolveFrontTopDimensionLocalZ(0.002);
	        const gapExtZ = resolveFrontTopDimensionLocalZ(0.001);
	        const gapTextZ = resolveFrontTopDimensionLocalZ(0.01);

        return (
          <group>
	            {/* 치수선 */}
	            <NativeLine name="dimension_line"
	              points={[[rightEdge - mmToThreeUnits(rightValue), rightDimY, gapDimZ], [rightEdge, rightDimY, gapDimZ]]}
              color={dimensionColor}
              lineWidth={0.6}
              renderOrder={100000}
              depthTest={false}
            />

	            {/* 좌측 화살표 */}
	            <NativeLine name="dimension_line"
	              points={createArrowHead([rightEdge - mmToThreeUnits(rightValue), rightDimY, gapDimZ], [rightEdge - mmToThreeUnits(rightValue) + 0.02, rightDimY, gapDimZ])}
              color={dimensionColor}
              lineWidth={0.6}
              renderOrder={100000}
              depthTest={false}
            />

	            {/* 우측 화살표 */}
	            <NativeLine name="dimension_line"
	              points={createArrowHead([rightEdge, rightDimY, gapDimZ], [rightEdge - 0.02, rightDimY, gapDimZ])}
              color={dimensionColor}
              lineWidth={0.6}
              renderOrder={100000}
              depthTest={false}
            />

            {/* 우측 치수 텍스트 - 이격거리 클릭 편집 */}
	            {hasRightWall && editingGapSide === 'right' ? (
	              <Html
	                position={[rightEdge - mmToThreeUnits(rightValue), rightDimY + mmToThreeUnits(30), gapTextZ]}
                style={{ pointerEvents: 'auto', transform: 'translate(-50%, -50%)' }}
                zIndexRange={[10000, 10001]}
              >
                <div style={{ background: currentViewDirection !== '3D' && view2DTheme === 'dark' ? 'rgba(31,41,55,0.98)' : 'rgba(255,255,255,0.98)', padding: '3px', borderRadius: '4px', border: '2px solid #2196F3', boxShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
                  <input
                    ref={gapInputRef}
                    type="number"
                    step="0.5"
                    value={editingGapValue}
                    onChange={(e) => setEditingGapValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleGapEditSubmit(); else if (e.key === 'Escape') handleGapEditCancel(); }}
                    onBlur={handleGapEditSubmit}
                    style={{ width: '50px', padding: '2px 4px', border: '1px solid #555', borderRadius: '2px', fontSize: '12px', fontWeight: 'bold', textAlign: 'center', outline: 'none', background: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#1f2937' : '#fff', color: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#fff' : '#000' }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span style={{ marginLeft: '2px', fontSize: '11px', color: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#9ca3af' : '#666' }}>mm</span>
                </div>
              </Html>
            ) : (
	              <Html
	                position={[rightEdge - mmToThreeUnits(rightValue), rightDimY + mmToThreeUnits(30), gapTextZ]}
                style={{ pointerEvents: hasRightWall ? 'auto' : 'none', transform: 'translate(-50%, -50%)' }}
                zIndexRange={[9999, 10000]}
              >
                <div
                  style={{
                    padding: '2px 6px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    color: dimensionColor,
                    cursor: hasRightWall ? 'pointer' : 'default',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                    background: hasRightWall ? (currentViewDirection !== '3D' && view2DTheme === 'dark' ? 'rgba(31,41,55,0.9)' : 'rgba(255,255,255,0.9)') : 'transparent',
                    borderRadius: '3px',
                  }}
                  onClick={(e) => { if (hasRightWall) { e.stopPropagation(); handleGapEdit('right', rightValue); } }}
                >
                  {rightText}
                </div>
              </Html>
            )}

            {/* 연장선 */}
	            <Line
	              points={[[rightEdge - mmToThreeUnits(rightValue), spaceHeight, gapExtZ], [rightEdge - mmToThreeUnits(rightValue), rightDimY + mmToThreeUnits(20), gapExtZ]]}
	              color={dimensionColor}
	              lineWidth={0.3}
	            />
	            <Line
	              points={[[rightEdge, spaceHeight, gapExtZ], [rightEdge, rightDimY + mmToThreeUnits(20), gapExtZ]]}
	              color={dimensionColor}
	              lineWidth={0.3}
	            />
          </group>
        );
      })()}

      {/* 좌측 이격거리 치수선 (단내림 활성 시, 서라운드 전용) — 커튼박스 활성 시 숨김 */}
      {showDimensions && !isStep2 && spaceInfo.surroundType !== 'no-surround' && !isFreePlacement && spaceInfo.droppedCeiling?.enabled && !spaceInfo.curtainBox?.enabled && (() => {
        const rightGap = spaceInfo.gapConfig?.right ?? 0;
        if (rightGap <= 0) return null;
        const frameThk = calculateFrameThickness(spaceInfo, hasLeftFurniture, hasRightFurniture);
        const rightEdge = mmToThreeUnits(spaceInfo.width) + leftOffset;
        // 커튼박스가 우측에 있으면 CB 왼쪽 끝에서 이격 표시
        const hasCBRight = spaceInfo.curtainBox?.enabled && spaceInfo.curtainBox?.position === 'right';
        const cbW = hasCBRight ? (spaceInfo.curtainBox!.width || 150) : 0;
	        const gapEndX = rightEdge - mmToThreeUnits(cbW) - mmToThreeUnits(frameThk.right);
	        const gapStartX = gapEndX - mmToThreeUnits(rightGap);
	        const fmtVal = (() => { const r = Math.round(rightGap * 10) / 10; return r % 1 === 0 ? String(r) : r.toFixed(1); })();
	        const gapDimY = slotDimensionY - mmToThreeUnits(80);
	        const gapDimZ = resolveFrontTopDimensionLocalZ(0.002);
	        const gapExtZ = resolveFrontTopDimensionLocalZ(0.001);
	        const gapTextZ = resolveFrontTopDimensionLocalZ(0.01);
	        return (
	          <group>
	            <NativeLine name="dimension_line" points={[[gapStartX, gapDimY, gapDimZ], [gapEndX, gapDimY, gapDimZ]]} color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false} />
	            <Line points={createArrowHead([gapStartX, gapDimY, gapDimZ], [gapStartX + 0.02, gapDimY, gapDimZ])} color={dimensionColor} lineWidth={0.6} />
	            <Line points={createArrowHead([gapEndX, gapDimY, gapDimZ], [gapEndX - 0.02, gapDimY, gapDimZ])} color={dimensionColor} lineWidth={0.6} />
	            <Html position={[(gapStartX + gapEndX) / 2, gapDimY + mmToThreeUnits(30), gapTextZ]} center style={{ pointerEvents: 'auto' }} zIndexRange={[9999, 10000]}>
              <div style={{ padding: '2px 6px', fontSize: '12px', fontWeight: 'bold', color: dimensionColor, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', background: currentViewDirection !== '3D' && view2DTheme === 'dark' ? 'rgba(31,41,55,0.7)' : 'rgba(255,255,255,0.7)', borderRadius: '3px' }}
                onClick={(e) => { e.stopPropagation(); handleGapEdit('right', rightGap); }}>
                {fmtVal}
              </div>
            </Html>
	            <Line points={[[gapStartX, spaceHeight, gapExtZ], [gapStartX, gapDimY + mmToThreeUnits(20), gapExtZ]]} color={dimensionColor} lineWidth={0.3} />
	            <Line points={[[gapEndX, spaceHeight, gapExtZ], [gapEndX, gapDimY + mmToThreeUnits(20), gapExtZ]]} color={dimensionColor} lineWidth={0.3} />
	          </group>
	        );
	      })()}

      {/* 구간 치수선 - 전체 폭 치수선 아래에 표시 (탑뷰가 아닐 때만) */}
      {showDimensions && hasZoneSplit && currentViewDirection !== 'top' && (
        <group>
          {(() => {
            const normalBounds = getNormalZoneBounds(spaceInfo);
            const droppedBounds = getDroppedZoneBounds(spaceInfo);
            const subDimensionY = columnDimensionY; // 전체폭 바로 아래 (내경 치수선 위치 대체)
            const topZoneDimZ = resolveFrontTopDimensionLocalZ(0.002);
            const topZoneExtZ = resolveFrontTopDimensionLocalZ(0.001);
            const topZoneTextZ = resolveFrontTopDimensionLocalZ(0.01);
            const topZoneBoundaryZ = resolveFrontTopDimensionLocalZ(0.003);

            // 프레임 두께 계산
            const frameThickness = calculateFrameThickness(spaceInfo, hasLeftFurniture, hasRightFurniture);

            // 자유배치: 커튼박스 + 단내림 분리 계산
            const hasDC = !!spaceInfo.droppedCeiling?.enabled;
            const hasSC = isFreePlacement && !!spaceInfo.stepCeiling?.enabled;
            const dcWidth = hasDC ? (spaceInfo.droppedCeiling!.width || 0) : 0;
            const scWidth = hasSC ? (spaceInfo.stepCeiling!.width || 0) : 0;
            const dcPosition = spaceInfo.droppedCeiling?.position || 'right';
            const scPosition = spaceInfo.stepCeiling?.position || 'right';
            // 커튼박스 (슬롯배치 + 자유배치 모두)
            const hasCB = !!spaceInfo.curtainBox?.enabled;
            const cbWidth = hasCB ? (spaceInfo.curtainBox!.width || 150) : 0;
            const cbPosition = hasCB ? (spaceInfo.curtainBox!.position || 'right') : 'right';

            // 메인 구간 = 전체 - 단내림 - 단내림(자유배치) - 커튼박스(슬롯) - 좌우 이격
            // 단, 커튼박스가 있는 쪽 이격은 메인 내경 계산에서 제외 (커튼박스 별도 취급)
            const droppedWidth = dcWidth;
            const cbOnLeftForGap = hasCB && cbPosition === 'left';
            const cbOnRightForGap = hasCB && cbPosition === 'right';
            const leftGapMm = cbOnLeftForGap ? 0 : (spaceInfo.gapConfig?.left ?? 0);
            const rightGapMm = cbOnRightForGap ? 0 : (spaceInfo.gapConfig?.right ?? 0);
            const mainWidth = spaceInfo.width - droppedWidth - scWidth - cbWidth - leftGapMm - rightGapMm;

            // 슬롯 합계 너비 (실배치 공간)
            const zoneSlotInfoForDim = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
            const mainSlotTotalWidthRaw = zoneSlotInfoForDim.normal.slotWidths
              ? zoneSlotInfoForDim.normal.slotWidths.reduce((sum: number, w: number) => sum + w, 0)
              : zoneSlotInfoForDim.normal.columnWidth * zoneSlotInfoForDim.normal.columnCount;
            const mainSlotTotalWidth = Math.round(mainSlotTotalWidthRaw * 10) / 10;
            const droppedSlotTotalWidthRaw = zoneSlotInfoForDim.dropped?.slotWidths
              ? zoneSlotInfoForDim.dropped.slotWidths.reduce((sum: number, w: number) => sum + w, 0)
              : (zoneSlotInfoForDim.dropped?.columnWidth || 0) * (zoneSlotInfoForDim.dropped?.columnCount || 0);
            const droppedSlotTotalWidth = Math.round(droppedSlotTotalWidthRaw * 10) / 10;

            // 구간 X 좌표 계산:
            // 각 구간(커튼박스/단내림/메인)의 position에 따라 좌→우 순서 결정
            // 동일 쪽: 벽→커튼박스→단내림→메인
            // 반대 쪽: 벽→단내림→메인→커튼박스→벽 또는 벽→커튼박스→메인→단내림→벽
            const dcOnLeft = hasDC && dcPosition === 'left';
            const dcOnRight = hasDC && dcPosition === 'right';
            const scOnLeft = hasSC && scPosition === 'left';
            const scOnRight = hasSC && scPosition === 'right';
            const cbOnLeft = hasCB && cbPosition === 'left';
            const cbOnRight = hasCB && cbPosition === 'right';

            // 좌측에 쌓이는 구간 너비 합계 (좌→우 순서: 커튼박스 → 단내림)
            const leftStackWidth = (cbOnLeft ? cbWidth : 0) + (dcOnLeft ? droppedWidth : 0) + (scOnLeft ? scWidth : 0);
            // 우측에 쌓이는 구간 너비 합계 (우→좌 순서: 커튼박스 → 단내림)
            const rightStackWidth = (cbOnRight ? cbWidth : 0) + (dcOnRight ? droppedWidth : 0) + (scOnRight ? scWidth : 0);

            // 메인 구간: 좌측 스택 뒤 ~ 우측 스택 앞
            const mainStartX = leftOffset + mmToThreeUnits(leftStackWidth);
            const mainEndX = leftOffset + mmToThreeUnits(spaceInfo.width - rightStackWidth);

            // 단내림(stepCeiling) 구간 X 좌표
            let scStartX = mainStartX;
            let scEndX = mainStartX;
            if (hasSC) {
              if (scOnLeft) {
                // 좌측 단내림: 커튼박스 오른쪽 ~ 단내림 오른쪽 끝
                const scLeftEdge = dcOnLeft ? dcWidth : 0;
                scStartX = leftOffset + mmToThreeUnits(scLeftEdge);
                scEndX = leftOffset + mmToThreeUnits(scLeftEdge + scWidth);
              } else {
                // 우측 단내림: 메인 끝 ~ 커튼박스 왼쪽
                scStartX = mainEndX;
                scEndX = mainEndX + mmToThreeUnits(scWidth);
              }
            }

            // 단내림(droppedCeiling) 구간 X 좌표
            let droppedStartX = mainStartX;
            let droppedEndX = mainStartX;
            if (hasDC) {
              if (dcOnLeft) {
                // 좌측 단내림: CB(좌)가 있으면 CB 오른쪽부터, 경계이격 흡수분 포함
                const dcLeftEdge = cbOnLeft ? cbWidth : 0;
                droppedStartX = leftOffset + mmToThreeUnits(dcLeftEdge);
                droppedEndX = leftOffset + mmToThreeUnits(dcLeftEdge + droppedWidth);
              } else {
                // 우측 단내림: 메인 끝 ~ CB(우) 왼쪽, 경계이격 흡수분 포함
                const dcLeftEdge = spaceInfo.width - droppedWidth - (cbOnRight ? cbWidth : 0);
                droppedStartX = leftOffset + mmToThreeUnits(dcLeftEdge);
                droppedEndX = leftOffset + mmToThreeUnits(dcLeftEdge + droppedWidth);
              }
            }

            // 슬롯배치 커튼박스 구간 X 좌표
            let cbStartX = mainStartX;
            let cbEndX = mainStartX;
            if (hasCB) {
              if (cbOnLeft) {
                cbStartX = leftOffset;
                cbEndX = leftOffset + mmToThreeUnits(cbWidth);
              } else {
                // 우측 커튼박스: 가장 오른쪽 (벽 바로 안쪽)
                cbStartX = leftOffset + mmToThreeUnits(spaceInfo.width - cbWidth);
                cbEndX = leftOffset + mmToThreeUnits(spaceInfo.width);
              }
            }
            
            return (
              <>
                {/* 메인 구간 치수선 */}
                <Line
                  points={[[mainStartX, subDimensionY, topZoneDimZ], [mainEndX, subDimensionY, topZoneDimZ]]}
                  color={dimensionColor}
                  lineWidth={0.6}
                />
                <Line
                  points={createArrowHead([mainStartX, subDimensionY, topZoneDimZ], [mainStartX + 0.05, subDimensionY, topZoneDimZ])}
                  color={dimensionColor}
                  lineWidth={0.6}
                />
                <Line
                  points={createArrowHead([mainEndX, subDimensionY, topZoneDimZ], [mainEndX - 0.05, subDimensionY, topZoneDimZ])}
                  color={dimensionColor}
                  lineWidth={0.6}
                />
                {(showDimensionsText || isStep2) && (
                  <Text
                  renderOrder={100001}
                  depthTest={false}
                    position={[(mainStartX + mainEndX) / 2, subDimensionY + mmToThreeUnits(30), topZoneTextZ]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                  >
                    {(() => { const r = Math.round(mainWidth * 10) / 10; return r % 1 === 0 ? String(r) : r.toFixed(1); })()}
                  </Text>
                )}
                {/* 단내림(stepCeiling) 구간 치수선 — 자유배치 전용 */}
                {hasSC && (<>
                <Line
                  points={[[scStartX, subDimensionY, topZoneDimZ], [scEndX, subDimensionY, topZoneDimZ]]}
                  color={dimensionColor}
                  lineWidth={0.6}
                />
                <Line
                  points={createArrowHead([scStartX, subDimensionY, topZoneDimZ], [scStartX + 0.05, subDimensionY, topZoneDimZ])}
                  color={dimensionColor}
                  lineWidth={0.6}
                />
                <Line
                  points={createArrowHead([scEndX, subDimensionY, topZoneDimZ], [scEndX - 0.05, subDimensionY, topZoneDimZ])}
                  color={dimensionColor}
                  lineWidth={0.6}
                />
                {(showDimensionsText || isStep2) && (
                  <Text
                  renderOrder={100001}
                  depthTest={false}
                    position={[(scStartX + scEndX) / 2, subDimensionY + mmToThreeUnits(30), topZoneTextZ]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                  >
                    {Math.round(scWidth)}
                  </Text>
                )}
                </>)}
                {/* 커튼박스(droppedCeiling) 구간 치수선 */}
                {hasDC && (<>
                <Line
                  points={[[droppedStartX, subDimensionY, topZoneDimZ], [droppedEndX, subDimensionY, topZoneDimZ]]}
                  color={dimensionColor}
                  lineWidth={0.6}
                />
                <Line
                  points={createArrowHead([droppedStartX, subDimensionY, topZoneDimZ], [droppedStartX + 0.05, subDimensionY, topZoneDimZ])}
                  color={dimensionColor}
                  lineWidth={0.6}
                />
                <Line
                  points={createArrowHead([droppedEndX, subDimensionY, topZoneDimZ], [droppedEndX - 0.05, subDimensionY, topZoneDimZ])}
                  color={dimensionColor}
                  lineWidth={0.6}
                />
                {(showDimensionsText || isStep2) && (
                  <Text
                  renderOrder={100001}
                  depthTest={false}
                    position={[(droppedStartX + droppedEndX) / 2, subDimensionY + mmToThreeUnits(30), topZoneTextZ]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                  >
                    {(() => { const r = Math.round(droppedWidth * 10) / 10; return r % 1 === 0 ? String(r) : r.toFixed(1); })()}
                  </Text>
                )}
                </>)}
                {/* 슬롯배치 커튼박스 구간 치수선 — 커튼박스는 공간과 별개로 취급하므로 2단에서 숨김 */}

                {/* 커튼박스 프레임 폭 치수선 — 숨김 (좁은 영역에서 텍스트 겹침 방지) */}

                {/* ===== 3단: 실배치 공간 치수선 ===== */}
                {(() => {
                  // 메인 구간에 듀얼 가구가 있는지 판별
                  const mainModules = placedModules.filter(m => m.zone !== 'dropped');
                  const hasDualInMain = mainModules.some(m => m.isDualSlot || m.moduleId.includes('dual-'));
                  // 단내림 구간에 듀얼 가구가 있는지 판별
                  const droppedModules = placedModules.filter(m => m.zone === 'dropped');
                  const hasDualInDropped = droppedModules.some(m => m.isDualSlot || m.moduleId.includes('dual-'));
                  // 내림 함수: 듀얼이면 0.5 단위 내림, 싱글이면 정수 내림
                  const floorValue = (v: number, hasDual: boolean) =>
                    hasDual ? Math.floor(v * 2) / 2 : Math.floor(v);
                  // 치수 포맷: 정수면 그대로, 소수면 한 자리까지
                  const fmtDim = (v: number) => { const r = Math.round(v * 10) / 10; return r % 1 === 0 ? String(r) : r.toFixed(1); };

                  // 자유배치: 각 구간별 이격거리를 빼서 실배치 폭 계산
                  // 슬롯배치: ColumnIndexer의 슬롯 합계 사용
                  // 전체서라운드/양쪽서라운드: 이격 1.5 고정, 노서라운드만 gapConfig 사용
                  const isNoSurroundForGap = spaceInfo.surroundType === 'no-surround';
                  const leftGapMm = isNoSurroundForGap ? (spaceInfo.gapConfig?.left ?? 1.5) : 1.5;
                  const rightGapMm = isNoSurroundForGap ? (spaceInfo.gapConfig?.right ?? 1.5) : 1.5;
                  const middleGapMm = isNoSurroundForGap ? (spaceInfo.gapConfig?.middle ?? 1.5) : 1.5;
                  // 단내림+커튼박스 동시 활성 시 단내림↔커튼박스 경계는 middle2 (middle 폴백 없음)
                  const middle2GapMm = isNoSurroundForGap
                    ? ((hasSC && hasDC) ? (spaceInfo.gapConfig?.middle2 ?? 1.5) : middleGapMm)
                    : 1.5;

                  const isBuiltIn = spaceInfo.installType === 'builtin' || spaceInfo.installType === 'built-in';
                  const isSemiStanding = spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing';
                  const hasLeftWall = isBuiltIn || (isSemiStanding && spaceInfo.wallConfig?.left);
                  const hasRightWall = isBuiltIn || (isSemiStanding && spaceInfo.wallConfig?.right);

                  // 각 구간의 좌/우 인접 요소 판별
                  // position=right: [벽] [메인] [단내림] [커튼박스] [벽]
                  // position=left:  [벽] [커튼박스] [단내림] [메인] [벽]
                  let mainPlacementWidth: number;
                  let scPlacementWidth: number | null = null;
                  let dcPlacementWidth: number;
                  let scSideFrame = 0;

                  if (isFreePlacement) {
                    // getInternalSpaceBoundsX 로직과 일치시킴:
                    // 통합 배치공간(단내림+메인)에서 각 구간의 실배치 폭 계산
                    // 이격은 통합 배치공간의 양 끝에만 적용 (구간 경계에는 이격 없음)

                    // 메인 구간 좌/우에 인접한 것 → 해당 쪽 이격 결정
                    // 단내림(step)은 통합 배치공간에 포함, 커튼박스는 별도 구간
                    // 자유배치: droppedCeiling(=dc)이 커튼박스 역할 → dcOnLeft/dcOnRight도 curtainbox 인접
                    // 슬롯배치: dc = 실제 단내림, cb = curtainBox 필드
                    const freeDcOnLeft = isFreePlacement && dcOnLeft; // 자유배치 커튼박스(좌)
                    const freeDcOnRight = isFreePlacement && dcOnRight; // 자유배치 커튼박스(우)
                    // 인접 판정 우선순위: 단내림 > 커튼박스 > 벽
                    // 레이아웃이 [벽][메인][단내림][커튼박스][벽]이면 메인은 단내림에 인접 (커튼박스 아님)
                    const mainLeftAdj = scOnLeft ? 'step' : ((cbOnLeft || freeDcOnLeft) ? 'curtainbox' : 'wall');
                    const mainRightAdj = scOnRight ? 'step' : ((cbOnRight || freeDcOnRight) ? 'curtainbox' : 'wall');
                    // 커튼박스 인접 → 이격 없음 (0), 단내림 인접 → middleGap, 벽 인접 → wallGap
                    const mainLeftGap = mainLeftAdj === 'curtainbox' ? 0 : (mainLeftAdj === 'wall' ? (hasLeftWall ? leftGapMm : 0) : middleGapMm);
                    const mainRightGap = mainRightAdj === 'curtainbox' ? 0 : (mainRightAdj === 'wall' ? (hasRightWall ? rightGapMm : 0) : middleGapMm);

                    // ── 3단 치수선: 각 구간의 실배치 폭 ──
                    // 단내림 구간: 양쪽 경계이격을 흡수하여 확장 (1.5 + 900 + 1.5 = 903)
                    // 메인/커튼박스: 단내림에게 뺏긴 경계이격만큼 차감

                    // 단내림이 흡수하는 이격 계산
                    let scInnerGap = middleGapMm; // 메인↔단내림 경계이격 (단내림이 흡수)
                    let scOuterGap = 0; // 단내림 외측 경계이격 (단내림이 흡수)
                    // 단내림 구간 프레임 두께 (서라운드 모드에서 벽쪽 프레임)
                    scSideFrame = (spaceInfo.surroundType !== 'no-surround' && hasSC)
                      ? (spaceInfo.stepCeiling!.sideFrame ?? (scOnLeft ? (frameSize?.left ?? 0) : (frameSize?.right ?? 0)))
                      : 0;
                    if (hasSC) {
                      const sameSide = hasDC && dcPosition === scPosition;
                      if (sameSide) {
                        scOuterGap = 0; // 커튼박스↔단내림 경계: 커튼박스 배치불가이므로 이격 없음
                      } else {
                        // 외벽 인접: 벽이격은 단내림이 흡수하지 않음 (차감)
                        const scOnWallSide = scOnLeft ? hasLeftWall : hasRightWall;
                        scOuterGap = 0; // 벽쪽은 흡수 아닌 차감이므로 별도 처리
                      }
                      // 단내림 배치폭 = 기둥폭 + 메인쪽 경계이격 + 외측 경계이격 - 벽이격 - 프레임
                      if (hasDC && dcPosition === scPosition) {
                        // 커튼박스 같은 쪽: 메인쪽 경계이격만 흡수 (커튼박스쪽은 이격 없음)
                        // 경계이격(1.5mm) 흡수로 0.5mm 소수 발생 가능 → 항상 0.5단위 floor
                        scPlacementWidth = floorValue(scWidth + scInnerGap + scOuterGap - scSideFrame, true);
                      } else {
                        // 벽 인접: 벽쪽은 벽이격 차감, 메인쪽은 경계이격 흡수, 프레임 차감
                        const scWallGap = (scOnLeft ? (hasLeftWall ? leftGapMm : 0) : (hasRightWall ? rightGapMm : 0));
                        scPlacementWidth = floorValue(scWidth + scInnerGap - scWallGap - scSideFrame, true);
                      }
                    }

                    // 메인 배치폭: 각 방향별 delta 계산
                    // - 단내림(step) 인접 → 단내림 가구가 경계이격을 침범 → 차감 (-middleGap)
                    // - 커튼박스(CB) 인접 → CB는 배치불가 구간, 경계이격 불필요 (0)
                    //   단, 메인의 반대쪽(벽) 이격만 차감
                    // - 벽 인접 → 벽이격 차감 (-wallGap)
                    // 단내림 > 커튼박스 > 벽 우선순위로 delta 계산
                    let mainLeftDelta = 0;
                    if (scOnLeft) {
                      // 메인 좌측 = 단내림 인접 → 경계이격 차감
                      mainLeftDelta = -middleGapMm;
                    } else if (cbOnLeft || freeDcOnLeft) {
                      // 메인 좌측 = 커튼박스 인접 → 이격 불필요
                      mainLeftDelta = 0;
                    } else {
                      // 메인 좌측 = 벽 → 벽이격 차감
                      mainLeftDelta = -(hasLeftWall ? leftGapMm : 0);
                    }

                    let mainRightDelta = 0;
                    if (scOnRight) {
                      // 메인 우측 = 단내림 인접 → 경계이격 차감
                      mainRightDelta = -middleGapMm;
                    } else if (cbOnRight || freeDcOnRight) {
                      // 메인 우측 = 커튼박스 인접 → 이격 불필요
                      mainRightDelta = 0;
                    } else {
                      // 메인 우측 = 벽 → 벽이격 차감
                      mainRightDelta = -(hasRightWall ? rightGapMm : 0);
                    }

                    mainPlacementWidth = floorValue(mainWidth + mainLeftDelta + mainRightDelta, hasDualInMain);

                    // 커튼박스 구간: 양쪽 gap 차감 (커튼박스 활성일 때만)
                    let dcLeftGap = 0;
                    let dcRightGap = 0;
                    if (hasDC) {
                      const dcInnerGap = hasSC ? middle2GapMm : middleGapMm;
                      dcLeftGap = dcOnLeft
                        ? (hasLeftWall ? leftGapMm : 0)
                        : dcInnerGap;
                      dcRightGap = dcOnRight
                        ? (hasRightWall ? rightGapMm : 0)
                        : dcInnerGap;
                      dcPlacementWidth = floorValue(dcWidth - dcLeftGap - dcRightGap, hasDualInDropped);
                    } else {
                      dcPlacementWidth = 0;
                    }

                    // 실배치 X좌표 (각 구간의 실 배치 가능 영역 경계)
                    var scPlacStartX = scStartX;
                    var scPlacEndX = scEndX;
                    if (hasSC) {
                      const sameSide = hasDC && dcPosition === scPosition;
                      if (scOnLeft) {
                        // 좌단내림: 오른쪽=메인 경계이격 흡수(확장), 왼쪽=외측
                        scPlacEndX = scEndX + mmToThreeUnits(scInnerGap); // 메인쪽 확장
                        if (sameSide) {
                          scPlacStartX = scStartX - mmToThreeUnits(scOuterGap); // 커튼박스쪽 확장
                        } else {
                          const scWallGap = hasLeftWall ? leftGapMm : 0;
                          scPlacStartX = scStartX + mmToThreeUnits(scWallGap); // 벽쪽 차감
                        }
                        // 좌단내림 프레임: 좌측(벽쪽)에 프레임 → startX 안쪽으로 밀기
                        scPlacStartX += mmToThreeUnits(scSideFrame);
                      } else {
                        // 우단내림: 왼쪽=메인 경계이격 흡수(확장), 오른쪽=외측
                        scPlacStartX = scStartX - mmToThreeUnits(scInnerGap); // 메인쪽 확장
                        if (sameSide) {
                          scPlacEndX = scEndX + mmToThreeUnits(scOuterGap); // 커튼박스쪽 확장
                        } else {
                          const scWallGap = hasRightWall ? rightGapMm : 0;
                          scPlacEndX = scEndX - mmToThreeUnits(scWallGap); // 벽쪽 차감
                        }
                        // 우단내림 프레임: 우측(벽쪽)에 프레임 → endX 안쪽으로 밀기
                        scPlacEndX -= mmToThreeUnits(scSideFrame);
                      }
                    }
                    // mainLeftDelta가 음수면 좌측에서 안으로 줄어듦 → startX + |delta|
                    // mainLeftDelta가 양수면 좌측으로 확장 → startX - delta
                    var mainPlacStartX = mainStartX - mmToThreeUnits(mainLeftDelta);
                    // mainRightDelta가 음수면 우측에서 안으로 줄어듦 → endX - |delta| = endX + delta
                    // mainRightDelta가 양수면 우측으로 확장 → endX + delta
                    var mainPlacEndX = mainEndX + mmToThreeUnits(mainRightDelta);
                    var dcPlacStartX = droppedStartX + mmToThreeUnits(dcLeftGap);
                    var dcPlacEndX = droppedEndX - mmToThreeUnits(dcRightGap);
                  } else {
                    // 슬롯배치: ColumnIndexer 계산값 사용
                    // 프레임은 3단 치수선에 별도 표시 → 실배치에서 제외
                    mainPlacementWidth = zoneSlotInfoForDim.normal.width;
                    dcPlacementWidth = zoneSlotInfoForDim.dropped?.width || droppedWidth;
                    // scSideFrame은 이미 0으로 초기화됨 (슬롯배치에서는 프레임 치수 없음)
                  }

                  // 커튼박스만(단내림 없음) + 가구 없음 → 3단 배치폭 불필요
                  const showPlacementTier = !cbOnly || hasPlacedModules;

                  return (<>
                {/* 메인 구간 실배치 치수선 — 커튼박스만일 때 가구 없으면 숨김 */}
                {showPlacementTier && (() => {
                  // 슬롯배치: 프레임을 별도 표시하므로 실배치 X좌표는 프레임 안쪽부터
                  const mainLeftFrame = (!isFreePlacement && hasDC && !dcOnLeft && !cbOnLeft) ? mmToThreeUnits(frameSize?.left ?? 0) : 0;
                  const mainRightFrame = (!isFreePlacement && hasDC && !dcOnRight && !cbOnRight) ? mmToThreeUnits(frameSize?.right ?? 0) : 0;
                  const msx = isFreePlacement ? mainPlacStartX : mainStartX + mainLeftFrame;
                  const mex = isFreePlacement ? mainPlacEndX : mainEndX - mainRightFrame;
	                  return (<>
	                <Line
	                  points={[[msx, slotTotalDimensionY, topZoneDimZ], [mex, slotTotalDimensionY, topZoneDimZ]]}
	                  color={dimensionColor}
	                  lineWidth={0.6}
	                />
	                <Line
	                  points={createArrowHead([msx, slotTotalDimensionY, topZoneDimZ], [msx + 0.05, slotTotalDimensionY, topZoneDimZ])}
	                  color={dimensionColor}
	                  lineWidth={0.6}
	                />
	                <Line
	                  points={createArrowHead([mex, slotTotalDimensionY, topZoneDimZ], [mex - 0.05, slotTotalDimensionY, topZoneDimZ])}
	                  color={dimensionColor}
	                  lineWidth={0.6}
	                />
                {(showDimensionsText || isStep2) && (
                  <Text
                  renderOrder={100001}
                  depthTest={false}
	                    position={[(msx + mex) / 2, slotTotalDimensionY + mmToThreeUnits(30), topZoneTextZ]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                  >
                    {fmtDim(mainPlacementWidth)}
                  </Text>
                )}
                {/* 메인 구간 실배치 연장선 */}
	                <Line
	                  points={[[msx, spaceHeight, topZoneExtZ], [msx, slotTotalDimensionY + mmToThreeUnits(10), topZoneExtZ]]}
	                  color={subGuideColor}
	                  lineWidth={0.6}
	                />
	                <Line
	                  points={[[mex, spaceHeight, topZoneExtZ], [mex, slotTotalDimensionY + mmToThreeUnits(10), topZoneExtZ]]}
	                  color={subGuideColor}
	                  lineWidth={0.6}
	                />
                  </>);
                })()}

                {/* 단내림(stepCeiling) 구간 실배치 치수선 — 자유배치 전용 */}
	                {hasSC && scPlacementWidth !== null && (<>
	                <Line
	                  points={[[scPlacStartX, slotTotalDimensionY, topZoneDimZ], [scPlacEndX, slotTotalDimensionY, topZoneDimZ]]}
	                  color={dimensionColor}
	                  lineWidth={0.6}
	                />
	                <Line
	                  points={createArrowHead([scPlacStartX, slotTotalDimensionY, topZoneDimZ], [scPlacStartX + 0.05, slotTotalDimensionY, topZoneDimZ])}
	                  color={dimensionColor}
	                  lineWidth={0.6}
	                />
	                <Line
	                  points={createArrowHead([scPlacEndX, slotTotalDimensionY, topZoneDimZ], [scPlacEndX - 0.05, slotTotalDimensionY, topZoneDimZ])}
	                  color={dimensionColor}
	                  lineWidth={0.6}
	                />
                {(showDimensionsText || isStep2) && (
                  <Text
                  renderOrder={100001}
                  depthTest={false}
	                    position={[(scPlacStartX + scPlacEndX) / 2, slotTotalDimensionY + mmToThreeUnits(30), topZoneTextZ]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                  >
                    {fmtDim(scPlacementWidth!)}
                  </Text>
                )}
                {/* 단내림 구간 실배치 연장선 */}
	                <Line
	                  points={[[scPlacStartX, spaceHeight, topZoneExtZ], [scPlacStartX, slotTotalDimensionY + mmToThreeUnits(10), topZoneExtZ]]}
	                  color={subGuideColor}
	                  lineWidth={0.6}
	                />
	                <Line
	                  points={[[scPlacEndX, spaceHeight, topZoneExtZ], [scPlacEndX, slotTotalDimensionY + mmToThreeUnits(10), topZoneExtZ]]}
	                  color={subGuideColor}
	                  lineWidth={0.6}
	                />
                </>)}

                {/* 단내림 구간 프레임 치수선 — 서라운드 모드에서 프레임 두께 표시 */}
                {hasSC && scSideFrame > 0 && (() => {
                  // 프레임 위치: 벽쪽에 프레임이 있음
                  let frameLX: number, frameRX: number;
                  if (scOnLeft) {
                    // 좌단내림: 프레임은 좌측 (scPlacStartX - frame ~ scPlacStartX)
                    frameRX = scPlacStartX;
                    frameLX = scPlacStartX - mmToThreeUnits(scSideFrame);
                  } else {
                    // 우단내림: 프레임은 우측 (scPlacEndX ~ scPlacEndX + frame)
                    frameLX = scPlacEndX;
                    frameRX = scPlacEndX + mmToThreeUnits(scSideFrame);
                  }
	                  return (<>
	                <Line
	                  points={[[frameLX, slotTotalDimensionY, topZoneDimZ], [frameRX, slotTotalDimensionY, topZoneDimZ]]}
	                  color={frameDimensionColor}
	                  lineWidth={0.6}
	                />
	                <Line
	                  points={createArrowHead([frameLX, slotTotalDimensionY, topZoneDimZ], [frameLX + 0.02, slotTotalDimensionY, topZoneDimZ])}
	                  color={frameDimensionColor}
	                  lineWidth={0.6}
	                />
	                <Line
	                  points={createArrowHead([frameRX, slotTotalDimensionY, topZoneDimZ], [frameRX - 0.02, slotTotalDimensionY, topZoneDimZ])}
	                  color={frameDimensionColor}
	                  lineWidth={0.6}
	                />
                {(showDimensionsText || isStep2) && (
                  <Text
                    renderOrder={100001}
                    depthTest={false}
	                    position={[(frameLX + frameRX) / 2, slotTotalDimensionY + mmToThreeUnits(30), topZoneTextZ]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                  >
                    {scSideFrame}
                  </Text>
                )}
                {/* 프레임 연장선 */}
	                <Line
	                  points={[[frameLX, spaceHeight, topZoneExtZ], [frameLX, slotTotalDimensionY + mmToThreeUnits(10), topZoneExtZ]]}
	                  color={subGuideColor}
	                  lineWidth={0.6}
	                />
	                <Line
	                  points={[[frameRX, spaceHeight, topZoneExtZ], [frameRX, slotTotalDimensionY + mmToThreeUnits(10), topZoneExtZ]]}
	                  color={subGuideColor}
	                  lineWidth={0.6}
	                />
                  </>);
                })()}

                {/* 단내림(droppedCeiling) 구간 실배치 치수선 — 자유배치 커튼박스는 배치불가 구간이므로 숨김 */}
                {hasDC && !hasFreeCurtainBox && (() => {
                  const dsx = isFreePlacement ? dcPlacStartX : droppedStartX;
                  const dex = isFreePlacement ? dcPlacEndX : droppedEndX;
	                  return (<>
	                <Line
	                  points={[[dsx, slotTotalDimensionY, topZoneDimZ], [dex, slotTotalDimensionY, topZoneDimZ]]}
	                  color={dimensionColor}
	                  lineWidth={0.6}
	                />
	                <Line
	                  points={createArrowHead([dsx, slotTotalDimensionY, topZoneDimZ], [dsx + 0.05, slotTotalDimensionY, topZoneDimZ])}
	                  color={dimensionColor}
	                  lineWidth={0.6}
	                />
	                <Line
	                  points={createArrowHead([dex, slotTotalDimensionY, topZoneDimZ], [dex - 0.05, slotTotalDimensionY, topZoneDimZ])}
	                  color={dimensionColor}
	                  lineWidth={0.6}
	                />
                {(showDimensionsText || isStep2) && (
                  <Text
                  renderOrder={100001}
                  depthTest={false}
	                    position={[(dsx + dex) / 2, slotTotalDimensionY + mmToThreeUnits(30), topZoneTextZ]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                  >
                    {fmtDim(dcPlacementWidth)}
                  </Text>
                )}
                {/* 단내림 구간 실배치 연장선 */}
	                <Line
	                  points={[[dsx, spaceHeight, topZoneExtZ], [dsx, slotTotalDimensionY + mmToThreeUnits(10), topZoneExtZ]]}
	                  color={subGuideColor}
	                  lineWidth={0.6}
	                />
	                <Line
	                  points={[[dex, spaceHeight, topZoneExtZ], [dex, slotTotalDimensionY + mmToThreeUnits(10), topZoneExtZ]]}
	                  color={subGuideColor}
	                  lineWidth={0.6}
	                />
                  </>);
                })()}


                  </>);
                })()}

                {/* 구간 분리 가이드라인 - 숨김 처리 */}
                {/* <Line
                  points={[
                    [spaceInfo.droppedCeiling.position === 'left' ? mmToThreeUnits(droppedBounds.width) + leftOffset : mmToThreeUnits(normalBounds.width) + leftOffset, 0, 0.001],
                    [spaceInfo.droppedCeiling.position === 'left' ? mmToThreeUnits(droppedBounds.width) + leftOffset : mmToThreeUnits(normalBounds.width) + leftOffset, subDimensionY - mmToThreeUnits(40), 0.001]
                  ]}
                  color={subGuideColor}
                  lineWidth={0.6}
                  dashed
                /> */}
                
                {/* 메인 구간 연장선 (공간 상단에서 치수선까지) */}
	                <Line
	                  points={[
	                    [mainStartX, spaceHeight, topZoneExtZ],
	                    [mainStartX, subDimensionY + mmToThreeUnits(10), topZoneExtZ]
	                  ]}
	                  color={subGuideColor}
	                  lineWidth={0.6}
	                />
	                <Line
	                  points={[
	                    [mainEndX, spaceHeight, topZoneExtZ],
	                    [mainEndX, subDimensionY + mmToThreeUnits(10), topZoneExtZ]
	                  ]}
	                  color={subGuideColor}
	                  lineWidth={0.6}
                />

                {/* 단내림(stepCeiling) 구간 연장선 */}
                {hasSC && (
                <>
	                <Line
	                  points={[
	                    [scStartX, spaceHeight, topZoneExtZ],
	                    [scStartX, subDimensionY + mmToThreeUnits(10), topZoneExtZ]
	                  ]}
	                  color={subGuideColor}
	                  lineWidth={0.6}
	                />
	                <Line
	                  points={[
	                    [scEndX, spaceHeight, topZoneExtZ],
	                    [scEndX, subDimensionY + mmToThreeUnits(10), topZoneExtZ]
	                  ]}
	                  color={subGuideColor}
	                  lineWidth={0.6}
                />
                </>
                )}
                {/* 단내림(droppedCeiling) 구간 연장선 */}
                {hasDC && (
                <>
	                <Line
	                  points={[
	                    [droppedStartX, spaceHeight, topZoneExtZ],
	                    [droppedStartX, subDimensionY + mmToThreeUnits(10), topZoneExtZ]
	                  ]}
	                  color={subGuideColor}
	                  lineWidth={0.6}
	                />
	                <Line
	                  points={[
	                    [droppedEndX, spaceHeight, topZoneExtZ],
	                    [droppedEndX, subDimensionY + mmToThreeUnits(10), topZoneExtZ]
	                  ]}
	                  color={subGuideColor}
	                  lineWidth={0.6}
                />
                </>
                )}
                {/* 커튼박스 구간 연장선 */}
                {hasCB && (
                <>
	                <Line
	                  points={[
	                    [cbStartX, spaceHeight, topZoneExtZ],
	                    [cbStartX, subDimensionY + mmToThreeUnits(10), topZoneExtZ]
	                  ]}
	                  color={subGuideColor}
	                  lineWidth={0.6}
	                />
	                <Line
	                  points={[
	                    [cbEndX, spaceHeight, topZoneExtZ],
	                    [cbEndX, subDimensionY + mmToThreeUnits(10), topZoneExtZ]
	                  ]}
	                  color={subGuideColor}
	                  lineWidth={0.6}
                />
                </>
                )}

                {/* 경계면 이격거리 치수선 - 좌우 이격과 동일한 Y 레벨 */}
                {/* 단내림 있으면 2개 경계면: 메인↔단내림, 단내림↔커튼박스 */}
                {/* 단내림 없으면 1개 경계면: 메인↔커튼박스 */}
                {(() => {
                  // 전체서라운드/양쪽서라운드: 이격 1.5 고정, 노서라운드만 gapConfig
                  const isNoSurroundBoundary = spaceInfo.surroundType === 'no-surround';
                  const middleGapMm = isNoSurroundBoundary ? (spaceInfo.gapConfig?.middle ?? 1.5) : 1.5;
                  const boundaryGapY = slotDimensionY;
                  const boundaryEditable = isNoSurroundBoundary; // 서라운드에서는 편집 불가

                  const boundaries: { leftX: number; rightX: number; editable: boolean; gapSide: string; gapValue: number }[] = [];

                  // 단내림↔메인 경계이격 (단내림이 흡수하지만 이격 치수는 표시)
                  if (hasSC) {
                    if (scOnLeft) {
                      boundaries.push({ leftX: scEndX, rightX: mainStartX, editable: boundaryEditable, gapSide: 'middle', gapValue: middleGapMm });
                    } else {
                      boundaries.push({ leftX: mainEndX, rightX: scStartX, editable: boundaryEditable, gapSide: 'middle', gapValue: middleGapMm });
                    }
                  }

                  if (hasDC && hasSC) {
                    const sameSide = dcPosition === scPosition;
                    if (sameSide) {
                      // 같은 쪽: 단내림↔커튼박스 경계 — 커튼박스에 가구 배치 없으므로 이격 불필요
                      // 메인↔단내림 경계이격만 표시 (위 hasSC 블록에서 이미 처리)
                    } else {
                      // 반대 쪽: 메인↔커튼박스 경계 — 커튼박스 배치불가이므로 이격 불필요
                      // 메인↔단내림 경계이격만 표시 (위 hasSC 블록에서 이미 처리)
                    }
                  } else if (hasDC && hasCB) {
                    // 슬롯배치: 단내림 + 커튼박스 동시 활성
                    // 1) 메인↔단내림 경계 → middle (이격2)
                    if (dcOnLeft) {
                      boundaries.push({ leftX: droppedEndX, rightX: mainStartX, editable: boundaryEditable, gapSide: 'middle', gapValue: middleGapMm });
                    } else {
                      boundaries.push({ leftX: mainEndX, rightX: droppedStartX, editable: boundaryEditable, gapSide: 'middle', gapValue: middleGapMm });
                    }
                    // 2) 단내림↔커튼박스 경계 → middle2 (이격2와 독립)
                    const m2Gap = isNoSurroundBoundary ? (spaceInfo.gapConfig?.middle2 ?? 1.5) : 1.5;
                    if (dcOnLeft && cbOnLeft) {
                      // 같은 쪽(좌): CB↔DC 경계
                      boundaries.push({ leftX: cbEndX, rightX: droppedStartX, editable: boundaryEditable, gapSide: 'middle2', gapValue: m2Gap });
                    } else if (dcOnRight && cbOnRight) {
                      // 같은 쪽(우): DC↔CB 경계
                      boundaries.push({ leftX: droppedEndX, rightX: cbStartX, editable: boundaryEditable, gapSide: 'middle2', gapValue: m2Gap });
                    } else if (dcOnRight && cbOnLeft) {
                      // 반대쪽: 좌CB↔메인 경계
                      boundaries.push({ leftX: cbEndX, rightX: mainStartX, editable: boundaryEditable, gapSide: 'middle2', gapValue: m2Gap });
                    } else if (dcOnLeft && cbOnRight) {
                      // 반대쪽: 메인↔우CB 경계
                      boundaries.push({ leftX: mainEndX, rightX: cbStartX, editable: boundaryEditable, gapSide: 'middle2', gapValue: m2Gap });
                    }
                  } else if (hasDC && !hasFreeCurtainBox) {
                    // 슬롯배치 단내림만(커튼박스 없음): 메인↔단내림 경계
                    if (dcOnLeft) {
                      boundaries.push({ leftX: droppedEndX, rightX: mainStartX, editable: boundaryEditable, gapSide: 'middle', gapValue: middleGapMm });
                    } else {
                      boundaries.push({ leftX: mainEndX, rightX: droppedStartX, editable: boundaryEditable, gapSide: 'middle', gapValue: middleGapMm });
                    }
                  } else if (hasDC && hasFreeCurtainBox) {
                    // 자유배치 커튼박스: 경계이격 없음 (배치불가 구간)
                  } else if (hasCB) {
                    // 슬롯배치 커튼박스만(단내림 없음): 메인↔커튼박스 경계
                    if (cbOnLeft) {
                      boundaries.push({ leftX: cbEndX, rightX: mainStartX, editable: boundaryEditable, gapSide: 'middle', gapValue: middleGapMm });
                    } else {
                      boundaries.push({ leftX: mainEndX, rightX: cbStartX, editable: boundaryEditable, gapSide: 'middle', gapValue: middleGapMm });
                    }
                  } else if (hasSC) {
                    // 단내림만 (커튼박스 없음): 통합 배치공간이므로 경계 이격 없음
                    // 벽↔단내림 이격은 외벽이격으로 처리됨
                  }

                  // CB 양쪽 1.5mm 이격 — 숨김 (좁은 영역에서 텍스트 겹침 방지)



                  return (<>
                    {boundaries.map((b, idx) => (
	                      <React.Fragment key={`boundary-gap-${idx}`}>
	                        <Line
	                          points={[[b.leftX, boundaryGapY, topZoneBoundaryZ], [b.rightX, boundaryGapY, topZoneBoundaryZ]]}
	                          color={dimensionColor}
	                          lineWidth={0.6}
	                        />
	                        <Line
	                          points={createArrowHead([b.leftX, boundaryGapY, topZoneBoundaryZ], [b.leftX + 0.02, boundaryGapY, topZoneBoundaryZ])}
	                          color={dimensionColor}
	                          lineWidth={0.6}
	                        />
	                        <Line
	                          points={createArrowHead([b.rightX, boundaryGapY, topZoneBoundaryZ], [b.rightX - 0.02, boundaryGapY, topZoneBoundaryZ])}
	                          color={dimensionColor}
	                          lineWidth={0.6}
	                        />
	                        {b.editable && editingGapSide === b.gapSide ? (
	                          <Html
	                            position={[(b.leftX + b.rightX) / 2, boundaryGapY + mmToThreeUnits(30), topZoneTextZ]}
                            center
                            style={{ pointerEvents: 'auto' }}
                            zIndexRange={[10000, 10001]}
                          >
                            <div style={{ background: currentViewDirection !== '3D' && view2DTheme === 'dark' ? 'rgba(31,41,55,0.98)' : 'rgba(255,255,255,0.98)', padding: '3px', borderRadius: '4px', border: '2px solid #2196F3', boxShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
                              <input
                                ref={gapInputRef}
                                type="number"
                                step="0.5"
                                min="0"
                                max="5"
                                value={editingGapValue}
                                onChange={(e) => setEditingGapValue(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleGapEditSubmit(); else if (e.key === 'Escape') handleGapEditCancel(); }}
                                onBlur={handleGapEditSubmit}
                                style={{ width: '50px', padding: '2px 4px', border: '1px solid #555', borderRadius: '2px', fontSize: '12px', fontWeight: 'bold', textAlign: 'center', outline: 'none', background: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#1f2937' : '#fff', color: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#fff' : '#000' }}
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                              />
                              <span style={{ marginLeft: '2px', fontSize: '11px', color: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#9ca3af' : '#666' }}>mm</span>
                            </div>
                          </Html>
                        ) : (
	                          <Html
	                            position={[(b.leftX + b.rightX) / 2, boundaryGapY + mmToThreeUnits(30), topZoneTextZ]}
                            center
                            style={{ pointerEvents: b.editable ? 'auto' : 'none' }}
                            zIndexRange={[9999, 10000]}
                          >
                            <div
                              style={{
                                padding: '2px 6px',
                                fontSize: '12px',
                                fontWeight: 'bold',
                                color: dimensionColor,
                                cursor: b.editable ? 'pointer' : 'default',
                                userSelect: 'none',
                                whiteSpace: 'nowrap',
                                background: currentViewDirection !== '3D' && view2DTheme === 'dark' ? 'rgba(31,41,55,0.85)' : 'rgba(255,255,255,0.85)',
                                borderRadius: '3px',
                              }}
                              onClick={(e) => { if (b.editable) { e.stopPropagation(); handleGapEdit(b.gapSide as 'left' | 'right' | 'middle' | 'middle2', b.gapValue); } }}
                            >
                              {`${b.gapValue}`}
                            </div>
                          </Html>
                        )}
                      </React.Fragment>
                    ))}
                  </>);
                })()}
              </>
            );
          })()}
        </group>
      )}
      
      {/* 좌측 프레임 치수선 — 자유배치 전용: 이격거리 미표시 */}
      {showDimensions && !isStep2 && false && isFreePlacement && (() => {
            // 벽없음(freestanding)이면 이격거리/엔드패널 치수선 미표시
            if (spaceInfo.installType === 'freestanding') return null;

            // 왼쪽 벽이 있는지 확인
            const hasLeftWall = spaceInfo.wallConfig?.left;

            // 가장 왼쪽 가구 위치 찾기
            let leftmostFurnitureX: number | null = null;
            let leftmostModuleId: string | null = null;
            if (placedModules.length > 0) {
              placedModules.forEach(module => {
                const widthMm = getModuleWidthMm(module);
                if (widthMm !== null) {
                  const moduleX = module.position.x;
                  const moduleWidth = widthMm * 0.01;
                  const moduleLeft = moduleX - moduleWidth / 2;
                  if (leftmostFurnitureX === null || moduleLeft < leftmostFurnitureX) {
                    leftmostFurnitureX = moduleLeft;
                    leftmostModuleId = module.id;
                  }
                }
              });
            }

            // 벽이 없고 가구도 없으면 치수 표시하지 않음
            if (!hasLeftWall && leftmostFurnitureX === null) {
              return null;
            }

            let leftValue: number;
            let leftText: string;
            const isLeftEditable = isFreePlacement && leftmostModuleId !== null;

            if (isFreePlacement) {
              // 자유배치 모드: 이격 개념 없음 — 가구가 있으면 벽~가구 갭만 표시
              if (leftmostFurnitureX === null) return null;
              const distanceFromLeft = (leftmostFurnitureX - leftOffset) * 100;
              leftValue = Math.round(Math.abs(distanceFromLeft));
              if (leftValue === 0) return null;
              { const _r = Math.round(leftValue * 10) / 10; leftText = _r % 1 === 0 ? String(_r) : _r.toFixed(1); }
            } else if (hasLeftWall) {
              // 노서라운드: 왼쪽 벽이 있으면 이격거리 표시
              leftValue = spaceInfo.gapConfig?.left ?? 1.5;
              if (leftValue === 0) return null;
              { const _r = Math.round(leftValue * 10) / 10; leftText = _r % 1 === 0 ? String(_r) : _r.toFixed(1); }
            } else if (leftmostFurnitureX !== null) {
              // 왼쪽 벽이 없고 가구가 있으면 엔드패널 표시
              const distanceFromLeft = (leftmostFurnitureX - leftOffset) * 100; // mm 단위로 변환
              leftValue = Math.round(Math.abs(distanceFromLeft));
              { const _r = Math.round(leftValue * 10) / 10; leftText = _r % 1 === 0 ? String(_r) : _r.toFixed(1); }
            }

            return (
      <group>
                {/* 치수선 */}
                <NativeLine name="dimension_line"
                  points={[[leftOffset, topDimensionY - mmToThreeUnits(120), 0.002], [leftOffset + mmToThreeUnits(leftValue), topDimensionY - mmToThreeUnits(120), 0.002]]}
                  color={dimensionColor}
                  lineWidth={0.6}
                  renderOrder={100000}
                  depthTest={false}
                />

                {/* 좌측 화살표 */}
                <NativeLine name="dimension_line"
                  points={createArrowHead([leftOffset, topDimensionY - mmToThreeUnits(120), 0.002], [leftOffset + 0.02, topDimensionY - mmToThreeUnits(120), 0.002])}
                  color={dimensionColor}
                  lineWidth={0.6}
                  renderOrder={100000}
                  depthTest={false}
                />

                {/* 우측 화살표 */}
                <NativeLine name="dimension_line"
                  points={createArrowHead([leftOffset + mmToThreeUnits(leftValue), topDimensionY - mmToThreeUnits(120), 0.002], [leftOffset + mmToThreeUnits(leftValue) - 0.02, topDimensionY - mmToThreeUnits(120), 0.002])}
                  color={dimensionColor}
                  lineWidth={0.6}
                  renderOrder={100000}
                  depthTest={false}
                />
                
                {/* 좌측 치수 텍스트 - 이격거리/가구갭 클릭 편집 */}
                {showDimensionsText && hasLeftWall && editingGapSide === 'left' ? (
                  <Html
                    position={[leftOffset + mmToThreeUnits(leftValue) / 2, topDimensionY - mmToThreeUnits(150), 0.01]}
                    center
                    style={{ pointerEvents: 'auto' }}
                    zIndexRange={[10000, 10001]}
                  >
                    <div style={{ background: currentViewDirection !== '3D' && view2DTheme === 'dark' ? 'rgba(31,41,55,0.98)' : 'rgba(255,255,255,0.98)', padding: '3px', borderRadius: '4px', border: '2px solid #2196F3', boxShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
                      <input
                        ref={gapInputRef}
                        type="number"
                        step="0.5"
                        value={editingGapValue}
                        onChange={(e) => setEditingGapValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleGapEditSubmit(); else if (e.key === 'Escape') handleGapEditCancel(); }}
                        onBlur={handleGapEditSubmit}
                        style={{ width: '50px', padding: '2px 4px', border: '1px solid #555', borderRadius: '2px', fontSize: '12px', fontWeight: 'bold', textAlign: 'center', outline: 'none', background: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#1f2937' : '#fff', color: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#fff' : '#000' }}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span style={{ marginLeft: '2px', fontSize: '11px', color: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#9ca3af' : '#666' }}>mm</span>
                    </div>
                  </Html>
                ) : showDimensionsText && isLeftEditable && editingFurnitureGapSide === 'left' ? (
                  <Html
                    position={[leftOffset + mmToThreeUnits(leftValue) / 2, topDimensionY - mmToThreeUnits(150), 0.01]}
                    center
                    style={{ pointerEvents: 'auto' }}
                    zIndexRange={[10000, 10001]}
                  >
                    <div style={{ background: currentViewDirection !== '3D' && view2DTheme === 'dark' ? 'rgba(31,41,55,0.98)' : 'rgba(255,255,255,0.98)', padding: '3px', borderRadius: '4px', border: '2px solid #2196F3', boxShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
                      <input
                        ref={furnitureGapInputRef}
                        type="number"
                        step="1"
                        value={editingFurnitureGapValue}
                        onChange={(e) => setEditingFurnitureGapValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleFurnitureGapSubmit(); else if (e.key === 'Escape') handleFurnitureGapCancel(); }}
                        onBlur={handleFurnitureGapSubmit}
                        style={{ width: '60px', padding: '2px 4px', border: '1px solid #555', borderRadius: '2px', fontSize: '12px', fontWeight: 'bold', textAlign: 'center', outline: 'none', background: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#1f2937' : '#fff', color: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#fff' : '#000' }}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span style={{ marginLeft: '2px', fontSize: '11px', color: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#9ca3af' : '#666' }}>mm</span>
                    </div>
                  </Html>
                ) : showDimensionsText ? (
                  <Html
                    position={[leftOffset + mmToThreeUnits(leftValue) / 2, topDimensionY - mmToThreeUnits(150), 0.01]}
                    center
                    style={{ pointerEvents: (hasLeftWall || isLeftEditable) ? 'auto' : 'none' }}
                    zIndexRange={[9999, 10000]}
                  >
                    <div
                      style={{
                        padding: '2px 6px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        color: dimensionColor,
                        cursor: (hasLeftWall || isLeftEditable) ? 'pointer' : 'default',
                        userSelect: 'none',
                        whiteSpace: 'nowrap',
                        background: (hasLeftWall || isLeftEditable) ? (currentViewDirection !== '3D' && view2DTheme === 'dark' ? 'rgba(31,41,55,0.7)' : 'rgba(255,255,255,0.7)') : 'transparent',
                        borderRadius: '3px',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (hasLeftWall) { handleGapEdit('left', leftValue); }
                        else if (isLeftEditable && leftmostModuleId) { handleFurnitureGapEdit('left', leftmostModuleId, leftValue); }
                      }}
                    >
                      {leftText}{!hasLeftWall && 'mm'}
                    </div>
                  </Html>
                ) : null}
                {/* 연장선 */}
                <NativeLine name="dimension_line"
                  points={[[leftOffset, spaceHeight, 0.001], [leftOffset, topDimensionY - mmToThreeUnits(100), 0.001]]}
                  color={textColor}
                  lineWidth={0.8}
                  renderOrder={1000000}
                  depthTest={false}
                  depthWrite={false}
                  transparent={true}
                />
                <NativeLine name="dimension_line"
                  points={[[leftOffset + mmToThreeUnits(leftValue), spaceHeight, 0.001], [leftOffset + mmToThreeUnits(leftValue), topDimensionY - mmToThreeUnits(100), 0.001]]}
                  color={textColor}
                  lineWidth={0.8}
                  renderOrder={1000000}
                  depthTest={false}
                  depthWrite={false}
                  transparent={true}
                />
      </group>
            );
          })()}
      
      {/* 좌측 커튼박스 프레임 너비 치수선 — 커튼박스는 공간과 별개 취급하므로 숨김 */}
      {false && showDimensions && !isStep2 && !isFreePlacement && spaceInfo.curtainBox?.enabled && spaceInfo.curtainBox?.position === 'left' && (
      <group>
            {(() => {
              const cbW = spaceInfo.curtainBox!.width || 150;
              const cbFrameW = cbW - 3; // 커튼박스 양쪽 1.5mm 이격 고정 (하드코딩)
              const cbFrameStartX = leftOffset + mmToThreeUnits(1.5);
              const cbFrameEndX = leftOffset + mmToThreeUnits(cbW - 1.5);
              return (<>
                <Line points={[[cbFrameStartX, slotTotalDimensionY, 0.002], [cbFrameEndX, slotTotalDimensionY, 0.002]]} color={dimensionColor} lineWidth={0.3} />
                <Line points={createArrowHead([cbFrameStartX, slotTotalDimensionY, 0.002], [cbFrameStartX + 0.02, slotTotalDimensionY, 0.002])} color={dimensionColor} lineWidth={0.3} />
                <Line points={createArrowHead([cbFrameEndX, slotTotalDimensionY, 0.002], [cbFrameEndX - 0.02, slotTotalDimensionY, 0.002])} color={dimensionColor} lineWidth={0.3} />
                <Text renderOrder={100001} depthTest={false}
                  position={[(cbFrameStartX + cbFrameEndX) / 2, slotTotalDimensionY + mmToThreeUnits(30), 0.01]}
                  fontSize={baseFontSize} color={textColor} anchorX="center" anchorY="middle"
                  outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                >{(() => { const r = Math.round(cbFrameW * 10) / 10; return r % 1 === 0 ? String(r) : r.toFixed(1); })()}</Text>
                <NativeLine name="dimension_line"
                  points={[[cbFrameStartX, spaceHeight, 0.001], [cbFrameStartX, topDimensionY + mmToThreeUnits(40), 0.001]]}
                  color={dimensionColor} lineWidth={0.8} renderOrder={1000000} depthTest={false} depthWrite={false} transparent={true}
                />
                <NativeLine name="dimension_line"
                  points={[[cbFrameEndX, spaceHeight, 0.001], [cbFrameEndX, slotTotalDimensionY + mmToThreeUnits(EXTENSION_LENGTH), 0.001]]}
                  color={dimensionColor} lineWidth={0.8} renderOrder={1000000} depthTest={false} depthWrite={false} transparent={true}
                />
              </>);
            })()}
      </group>
      )}

      {/* 서라운드 모드 좌측 프레임 치수선 (2단: columnDimensionY) — 커튼박스 활성 시 전체 숨김 */}
      {showDimensions && !isStep2 && spaceInfo.surroundType === 'surround' && !spaceInfo.curtainBox?.enabled && (
      <group>
            {/* 치수선 */}
            <Line
              points={[[leftOffset, columnDimensionY, 0.002], [leftOffset + mmToThreeUnits(frameSize.left), columnDimensionY, 0.002]]}
              color={dimensionColor}
              lineWidth={0.3}
            />

            {/* 좌측 화살표 */}
            <Line
              points={createArrowHead([leftOffset, columnDimensionY, 0.002], [leftOffset + 0.02, columnDimensionY, 0.002])}
              color={dimensionColor}
              lineWidth={0.3}
            />

            {/* 우측 화살표 */}
            <Line
              points={createArrowHead([leftOffset + mmToThreeUnits(frameSize.left), columnDimensionY, 0.002], [leftOffset + mmToThreeUnits(frameSize.left) - 0.02, columnDimensionY, 0.002])}
              color={dimensionColor}
              lineWidth={0.3}
            />

            {/* 좌측 프레임 치수 텍스트 */}
            <Text
                  renderOrder={100001}
                  depthTest={false}
              position={[leftOffset + mmToThreeUnits(frameSize.left) / 2, columnDimensionY + mmToThreeUnits(30), 0.01]}
              fontSize={baseFontSize}
              color={textColor}
              anchorX="center"
              anchorY="middle"
              outlineWidth={textOutlineWidth}
              outlineColor={textOutlineColor}
            >
              {frameSize.left}
            </Text>

            {/* 연장선 */}
            <NativeLine name="dimension_line"
              points={[[leftOffset, spaceHeight, 0.001], [leftOffset, topDimensionY + mmToThreeUnits(40), 0.001]]}
              color={dimensionColor}
              lineWidth={0.8}
              renderOrder={1000000}
              depthTest={false}
              depthWrite={false}
              transparent={true}
            />
            <NativeLine name="dimension_line"
              points={[[leftOffset + mmToThreeUnits(frameSize.left), spaceHeight, 0.001], [leftOffset + mmToThreeUnits(frameSize.left), columnDimensionY + mmToThreeUnits(EXTENSION_LENGTH), 0.001]]}
              color={dimensionColor}
              lineWidth={0.8}
              renderOrder={1000000}
              depthTest={false}
              depthWrite={false}
              transparent={true}
            />
      </group>
      )}

      {/* 우측 프레임 치수선 — 자유배치 전용: 이격거리 미표시 */}
      {showDimensions && !isStep2 && false && isFreePlacement && (() => {
            // 벽없음(freestanding)이면 이격거리/엔드패널 치수선 미표시
            if (spaceInfo.installType === 'freestanding') return null;

            // 오른쪽 벽이 있는지 확인
            const hasRightWall = spaceInfo.wallConfig?.right;

            // 가장 오른쪽 가구 위치 찾기
            let rightmostFurnitureX: number | null = null;
            let rightmostModuleId: string | null = null;
            if (placedModules.length > 0) {
              placedModules.forEach(module => {
                const widthMm = getModuleWidthMm(module);
                if (widthMm !== null) {
                  const moduleX = module.position.x;
                  const moduleWidth = widthMm * 0.01;
                  const moduleRight = moduleX + moduleWidth / 2;
                  if (rightmostFurnitureX === null || moduleRight > rightmostFurnitureX) {
                    rightmostFurnitureX = moduleRight;
                    rightmostModuleId = module.id;
                  }
                }
              });
            }

            // 벽이 없고 가구도 없으면 치수 표시하지 않음
            if (!hasRightWall && rightmostFurnitureX === null) {
              return null;
            }

            let rightValue: number;
            let rightText: string;
            const isRightEditable = isFreePlacement && rightmostModuleId !== null;

            if (isFreePlacement) {
              // 자유배치 모드: 이격 개념 없음 — 가구가 있으면 벽~가구 갭만 표시
              if (rightmostFurnitureX === null) return null;
              const rightEdge = mmToThreeUnits(spaceInfo.width) + leftOffset;
              const distanceFromRight = (rightEdge - rightmostFurnitureX) * 100;
              rightValue = Math.round(Math.abs(distanceFromRight));
              if (rightValue === 0) return null;
              { const _r = Math.round(rightValue * 10) / 10; rightText = _r % 1 === 0 ? String(_r) : _r.toFixed(1); }
            } else if (hasRightWall) {
              // 노서라운드: 오른쪽 벽이 있으면 이격거리 표시
              rightValue = spaceInfo.gapConfig?.right ?? 1.5;
              if (rightValue === 0) return null;
              { const _r = Math.round(rightValue * 10) / 10; rightText = _r % 1 === 0 ? String(_r) : _r.toFixed(1); }
            } else if (rightmostFurnitureX !== null) {
              // 오른쪽 벽이 없고 가구가 있으면 엔드패널 표시
              const rightEdge = mmToThreeUnits(spaceInfo.width) + leftOffset;
              const distanceFromRight = (rightEdge - rightmostFurnitureX) * 100;
              rightValue = Math.round(Math.abs(distanceFromRight));
              { const _r = Math.round(rightValue * 10) / 10; rightText = _r % 1 === 0 ? String(_r) : _r.toFixed(1); }
            }

            return (
      <group>
                {/* 치수선 */}
                <NativeLine name="dimension_line"
                  renderOrder={100000}
                  depthTest={false}
                  points={[[mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(rightValue), topDimensionY - mmToThreeUnits(120), 0.002], [mmToThreeUnits(spaceInfo.width) + leftOffset, topDimensionY - mmToThreeUnits(120), 0.002]]}
                  color={textColor}
                  lineWidth={0.6}
                />

                {/* 좌측 화살표 */}
                <NativeLine name="dimension_line"
                  points={createArrowHead([mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(rightValue), topDimensionY - mmToThreeUnits(120), 0.002], [mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(rightValue) + 0.02, topDimensionY - mmToThreeUnits(120), 0.002])}
                  color={textColor}
                  lineWidth={0.6}
                  renderOrder={100000}
                  depthTest={false}
                />

                {/* 우측 화살표 */}
                <NativeLine name="dimension_line"
                  points={createArrowHead([mmToThreeUnits(spaceInfo.width) + leftOffset, topDimensionY - mmToThreeUnits(120), 0.002], [mmToThreeUnits(spaceInfo.width) + leftOffset - 0.02, topDimensionY - mmToThreeUnits(120), 0.002])}
                  color={textColor}
                  lineWidth={0.6}
                  renderOrder={100000}
                  depthTest={false}
                />
                
                {/* 우측 치수 텍스트 - 이격거리/가구갭 클릭 편집 */}
                {hasRightWall && editingGapSide === 'right' ? (
                  <Html
                    position={[mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(rightValue) / 2, topDimensionY - mmToThreeUnits(150), 0.01]}
                    center
                    style={{ pointerEvents: 'auto' }}
                    zIndexRange={[10000, 10001]}
                  >
                    <div style={{ background: currentViewDirection !== '3D' && view2DTheme === 'dark' ? 'rgba(31,41,55,0.98)' : 'rgba(255,255,255,0.98)', padding: '3px', borderRadius: '4px', border: '2px solid #2196F3', boxShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
                      <input
                        ref={gapInputRef}
                        type="number"
                        step="0.5"
                        value={editingGapValue}
                        onChange={(e) => setEditingGapValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleGapEditSubmit(); else if (e.key === 'Escape') handleGapEditCancel(); }}
                        onBlur={handleGapEditSubmit}
                        style={{ width: '50px', padding: '2px 4px', border: '1px solid #555', borderRadius: '2px', fontSize: '12px', fontWeight: 'bold', textAlign: 'center', outline: 'none', background: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#1f2937' : '#fff', color: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#fff' : '#000' }}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span style={{ marginLeft: '2px', fontSize: '11px', color: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#9ca3af' : '#666' }}>mm</span>
                    </div>
                  </Html>
                ) : isRightEditable && editingFurnitureGapSide === 'right' ? (
                  <Html
                    position={[mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(rightValue) / 2, topDimensionY - mmToThreeUnits(150), 0.01]}
                    center
                    style={{ pointerEvents: 'auto' }}
                    zIndexRange={[10000, 10001]}
                  >
                    <div style={{ background: currentViewDirection !== '3D' && view2DTheme === 'dark' ? 'rgba(31,41,55,0.98)' : 'rgba(255,255,255,0.98)', padding: '3px', borderRadius: '4px', border: '2px solid #2196F3', boxShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
                      <input
                        ref={furnitureGapInputRef}
                        type="number"
                        step="1"
                        value={editingFurnitureGapValue}
                        onChange={(e) => setEditingFurnitureGapValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleFurnitureGapSubmit(); else if (e.key === 'Escape') handleFurnitureGapCancel(); }}
                        onBlur={handleFurnitureGapSubmit}
                        style={{ width: '60px', padding: '2px 4px', border: '1px solid #555', borderRadius: '2px', fontSize: '12px', fontWeight: 'bold', textAlign: 'center', outline: 'none', background: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#1f2937' : '#fff', color: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#fff' : '#000' }}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span style={{ marginLeft: '2px', fontSize: '11px', color: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#9ca3af' : '#666' }}>mm</span>
                    </div>
                  </Html>
                ) : (
                  <Html
                    position={[mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(rightValue) / 2, topDimensionY - mmToThreeUnits(150), 0.01]}
                    center
                    style={{ pointerEvents: (hasRightWall || isRightEditable) ? 'auto' : 'none' }}
                    zIndexRange={[9999, 10000]}
                  >
                    <div
                      style={{
                        padding: '2px 6px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        color: dimensionColor,
                        cursor: (hasRightWall || isRightEditable) ? 'pointer' : 'default',
                        userSelect: 'none',
                        whiteSpace: 'nowrap',
                        background: (hasRightWall || isRightEditable) ? (currentViewDirection !== '3D' && view2DTheme === 'dark' ? 'rgba(31,41,55,0.7)' : 'rgba(255,255,255,0.7)') : 'transparent',
                        borderRadius: '3px',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (hasRightWall) { handleGapEdit('right', rightValue); }
                        else if (isRightEditable && rightmostModuleId) { handleFurnitureGapEdit('right', rightmostModuleId, rightValue); }
                      }}
                    >
                      {rightText}{!hasRightWall && 'mm'}
                    </div>
                  </Html>
                )}

                {/* 연장선 */}
                <NativeLine name="dimension_line"
                  points={[[mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(rightValue), spaceHeight, 0.001], [mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(rightValue), topDimensionY - mmToThreeUnits(100), 0.001]]}
                  color={textColor}
                  lineWidth={0.8}
                  renderOrder={1000000}
                  depthTest={false}
                  depthWrite={false}
                  transparent={true}
                />
                <NativeLine name="dimension_line"
                  points={[[mmToThreeUnits(spaceInfo.width) + leftOffset, spaceHeight, 0.001], [mmToThreeUnits(spaceInfo.width) + leftOffset, topDimensionY - mmToThreeUnits(100), 0.001]]}
                  color={textColor}
                  lineWidth={0.8}
                  renderOrder={1000000}
                  depthTest={false}
                  depthWrite={false}
                  transparent={true}
                />
      </group>
            );
          })()}
      
      {/* 우측 커튼박스 프레임 너비 치수선 — 커튼박스는 공간과 별개 취급하므로 숨김 */}
      {false && showDimensions && !isStep2 && !isFreePlacement && spaceInfo.curtainBox?.enabled && spaceInfo.curtainBox?.position === 'right' && (
      <group>
            {(() => {
              const cbW = spaceInfo.curtainBox!.width || 150;
              const cbFrameW = cbW - 3; // 커튼박스 양쪽 1.5mm 이격 고정 (하드코딩)
              const rightEdge = mmToThreeUnits(spaceInfo.width) + leftOffset;
              const cbFrameStartX = rightEdge - mmToThreeUnits(cbW - 1.5);
              const cbFrameEndX = rightEdge - mmToThreeUnits(1.5);
              return (<>
                <Line points={[[cbFrameStartX, slotTotalDimensionY, 0.002], [cbFrameEndX, slotTotalDimensionY, 0.002]]} color={dimensionColor} lineWidth={0.3} />
                <Line points={createArrowHead([cbFrameStartX, slotTotalDimensionY, 0.002], [cbFrameStartX + 0.02, slotTotalDimensionY, 0.002])} color={dimensionColor} lineWidth={0.3} />
                <Line points={createArrowHead([cbFrameEndX, slotTotalDimensionY, 0.002], [cbFrameEndX - 0.02, slotTotalDimensionY, 0.002])} color={dimensionColor} lineWidth={0.3} />
                <Text renderOrder={100001} depthTest={false}
                  position={[(cbFrameStartX + cbFrameEndX) / 2, slotTotalDimensionY + mmToThreeUnits(30), 0.01]}
                  fontSize={baseFontSize} color={textColor} anchorX="center" anchorY="middle"
                  outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                >{(() => { const r = Math.round(cbFrameW * 10) / 10; return r % 1 === 0 ? String(r) : r.toFixed(1); })()}</Text>
                <NativeLine name="dimension_line"
                  points={[[cbFrameStartX, spaceHeight, 0.001], [cbFrameStartX, slotTotalDimensionY + mmToThreeUnits(EXTENSION_LENGTH), 0.001]]}
                  color={dimensionColor} lineWidth={0.8} renderOrder={1000000} depthTest={false} depthWrite={false} transparent={true}
                />
                <NativeLine name="dimension_line"
                  points={[[cbFrameEndX, spaceHeight, 0.001], [cbFrameEndX, topDimensionY + mmToThreeUnits(40), 0.001]]}
                  color={dimensionColor} lineWidth={0.8} renderOrder={1000000} depthTest={false} depthWrite={false} transparent={true}
                />
              </>);
            })()}
      </group>
      )}

      {/* 서라운드 모드 우측 프레임 치수선 (2단: columnDimensionY) — 커튼박스 활성 시 전체 숨김 */}
      {showDimensions && !isStep2 && spaceInfo.surroundType === 'surround' && !spaceInfo.curtainBox?.enabled && (
      <group>
            {/* 치수선 */}
            <Line
              points={[[mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(frameSize.right), columnDimensionY, 0.002], [mmToThreeUnits(spaceInfo.width) + leftOffset, columnDimensionY, 0.002]]}
              color={dimensionColor}
              lineWidth={0.3}
            />

            {/* 좌측 화살표 */}
            <Line
              points={createArrowHead([mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(frameSize.right), columnDimensionY, 0.002], [mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(frameSize.right) + 0.02, columnDimensionY, 0.002])}
              color={dimensionColor}
              lineWidth={0.3}
            />

            {/* 우측 화살표 */}
            <Line
              points={createArrowHead([mmToThreeUnits(spaceInfo.width) + leftOffset, columnDimensionY, 0.002], [mmToThreeUnits(spaceInfo.width) + leftOffset - 0.02, columnDimensionY, 0.002])}
              color={dimensionColor}
              lineWidth={0.3}
            />

            {/* 우측 프레임 치수 텍스트 */}
            <Text
                  renderOrder={100001}
                  depthTest={false}
              position={[mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(frameSize.right) / 2, columnDimensionY + mmToThreeUnits(30), 0.01]}
              fontSize={baseFontSize}
              color={textColor}
              anchorX="center"
              anchorY="middle"
              outlineWidth={textOutlineWidth}
              outlineColor={textOutlineColor}
            >
              {frameSize.right}
            </Text>

            {/* 연장선 */}
            <NativeLine name="dimension_line"
              points={[[mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(frameSize.right), spaceHeight, 0.001], [mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(frameSize.right), columnDimensionY + mmToThreeUnits(EXTENSION_LENGTH), 0.001]]}
              color={dimensionColor}
              lineWidth={0.8}
              renderOrder={1000000}
              depthTest={false}
              depthWrite={false}
              transparent={true}
            />
            <NativeLine name="dimension_line"
              points={[[mmToThreeUnits(spaceInfo.width) + leftOffset, spaceHeight, 0.001], [mmToThreeUnits(spaceInfo.width) + leftOffset, topDimensionY + mmToThreeUnits(40), 0.001]]}
              color={dimensionColor}
              lineWidth={0.8}
              renderOrder={1000000}
              depthTest={false}
              depthWrite={false}
              transparent={true}
            />
      </group>
      )}


      {/* 전체 내부 너비 치수선 (구간 분리 시 숨김 — 단내림/커튼박스 활성 시 구간 치수선이 대체) */}
      {!hasZoneSplit && (() => {
        const internalLeftX = threeUnitBoundaries[0];
        const internalRightX = threeUnitBoundaries[threeUnitBoundaries.length - 1];
	        const internalWidthMm = indexing.internalWidth;
	        const centerX = (internalLeftX + internalRightX) / 2;
	        const extLen = mmToThreeUnits(EXTENSION_LENGTH); // 일관된 보조선 길이
	        const internalWidthDimZ = resolveFrontTopDimensionLocalZ(0.002);
	        const internalWidthExtZ = resolveFrontTopDimensionLocalZ(0.001);
	        const internalWidthTextZ = resolveFrontTopDimensionLocalZ(0.01);

	        return (
	          <group key="total-internal-width">
	            {/* 전체 내부 너비 치수선 */}
	            <NativeLine name="dimension_line"
	              points={[[internalLeftX, columnDimensionY, internalWidthDimZ], [internalRightX, columnDimensionY, internalWidthDimZ]]}
	              color={dimensionColor}
	              lineWidth={0.6}
	              renderOrder={100000}
              depthTest={false}
            />
	            {/* 좌측 화살표 */}
	            <NativeLine name="dimension_line"
	              points={createArrowHead([internalLeftX, columnDimensionY, internalWidthDimZ], [internalLeftX + 0.015, columnDimensionY, internalWidthDimZ], 0.01)}
	              color={dimensionColor}
	              lineWidth={0.6}
	              renderOrder={100000}
              depthTest={false}
            />
	            {/* 우측 화살표 */}
	            <NativeLine name="dimension_line"
	              points={createArrowHead([internalRightX, columnDimensionY, internalWidthDimZ], [internalRightX - 0.015, columnDimensionY, internalWidthDimZ], 0.01)}
	              color={dimensionColor}
	              lineWidth={0.6}
	              renderOrder={100000}
              depthTest={false}
            />
            {/* 내부 너비 텍스트 */}
	            <Text
	              renderOrder={100001}
	              depthTest={false}
	              position={[centerX, columnDimensionY + mmToThreeUnits(20), internalWidthTextZ]}
	              fontSize={baseFontSize}
	              color={textColor}
	              anchorX="center"
              anchorY="middle"
              outlineWidth={textOutlineWidth}
              outlineColor={textOutlineColor}
            >
              {(() => { const v = Math.round(internalWidthMm * 2) / 2; return v % 1 === 0 ? v : v.toFixed(1); })()}
            </Text>
	            {/* 좌측 연장선 - 공간 상단에서 치수선 위까지 */}
	            <NativeLine name="dimension_line"
	              points={[[internalLeftX, spaceHeight, internalWidthExtZ], [internalLeftX, topDimensionY + extLen, internalWidthExtZ]]}
	              color={dimensionColor}
	              lineWidth={0.6}
	              renderOrder={100000}
              depthTest={false}
            />
	            {/* 우측 연장선 - 공간 상단에서 치수선 위까지 */}
	            <NativeLine name="dimension_line"
	              points={[[internalRightX, spaceHeight, internalWidthExtZ], [internalRightX, topDimensionY + extLen, internalWidthExtZ]]}
	              color={dimensionColor}
	              lineWidth={0.6}
	              renderOrder={100000}
              depthTest={false}
            />
          </group>
        );
      })()}

      {/* 자유배치 모드 2단: 좌이격 | 가구합산너비 | 우이격 — 숨김 (부정확) */}
      {false && isFreePlacement && furnitureDimensions && furnitureDimensions.length > 0 && (() => {
        const validDims = furnitureDimensions.filter((d): d is NonNullable<typeof d> => d !== null);
        if (validDims.length === 0) return null;
        // moduleX는 Three.js 단위, actualWidth는 mm → 올바른 단위 변환
        const edges = validDims.map(d => ({
          left: d.moduleX - mmToThreeUnits(d.actualWidth / 2),
          right: d.moduleX + mmToThreeUnits(d.actualWidth / 2),
        }));
        const furnitureLeft = Math.min(...edges.map(e => e.left));
        const furnitureRight = Math.max(...edges.map(e => e.right));
        const furnitureTotalMm = Math.round((furnitureRight - furnitureLeft) * 100);
        const extLen = mmToThreeUnits(EXTENSION_LENGTH);

        // 공간 벽 위치 (Three.js 단위)
        const wallLeft = leftOffset; // 좌측 벽
        const wallRight = mmToThreeUnits(spaceInfo.width) + leftOffset; // 우측 벽

        // 이격거리 (mm)
        const leftGapMm = Math.round((furnitureLeft - wallLeft) * 100);
        const rightGapMm = Math.round((wallRight - furnitureRight) * 100);

        return (
          <group key="free-placement-dimensions-tier2">
            {/* 좌측 이격 치수선 (벽~가구좌측) */}
            {leftGapMm > 0 && (
              <>
                <NativeLine name="dimension_line"
                  points={[[wallLeft, columnDimensionY, 0.002], [furnitureLeft, columnDimensionY, 0.002]]}
                  color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                />
                <NativeLine name="dimension_line"
                  points={createArrowHead([wallLeft, columnDimensionY, 0.002], [wallLeft + 0.015, columnDimensionY, 0.002], 0.01)}
                  color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                />
                <NativeLine name="dimension_line"
                  points={createArrowHead([furnitureLeft, columnDimensionY, 0.002], [furnitureLeft - 0.015, columnDimensionY, 0.002], 0.01)}
                  color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                />
                <Text renderOrder={100001} depthTest={false}
                  position={[(wallLeft + furnitureLeft) / 2, columnDimensionY + mmToThreeUnits(20), 0.01]}
                  fontSize={baseFontSize} color={textColor} anchorX="center" anchorY="middle"
                  outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                >
                  {leftGapMm}
                </Text>
              </>
            )}

            {/* 가구 합산 너비 치수선 */}
            <NativeLine name="dimension_line"
              points={[[furnitureLeft, columnDimensionY, 0.002], [furnitureRight, columnDimensionY, 0.002]]}
              color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
            />
            <NativeLine name="dimension_line"
              points={createArrowHead([furnitureLeft, columnDimensionY, 0.002], [furnitureLeft + 0.015, columnDimensionY, 0.002], 0.01)}
              color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
            />
            <NativeLine name="dimension_line"
              points={createArrowHead([furnitureRight, columnDimensionY, 0.002], [furnitureRight - 0.015, columnDimensionY, 0.002], 0.01)}
              color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
            />
            <Text renderOrder={100001} depthTest={false}
              position={[(furnitureLeft + furnitureRight) / 2, columnDimensionY + mmToThreeUnits(20), 0.01]}
              fontSize={baseFontSize} color={textColor} anchorX="center" anchorY="middle"
              outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
            >
              {furnitureTotalMm}
            </Text>

            {/* 우측 이격 치수선 (가구우측~벽) */}
            {rightGapMm > 0 && (
              <>
                <NativeLine name="dimension_line"
                  points={[[furnitureRight, columnDimensionY, 0.002], [wallRight, columnDimensionY, 0.002]]}
                  color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                />
                <NativeLine name="dimension_line"
                  points={createArrowHead([furnitureRight, columnDimensionY, 0.002], [furnitureRight + 0.015, columnDimensionY, 0.002], 0.01)}
                  color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                />
                <NativeLine name="dimension_line"
                  points={createArrowHead([wallRight, columnDimensionY, 0.002], [wallRight - 0.015, columnDimensionY, 0.002], 0.01)}
                  color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                />
                <Text renderOrder={100001} depthTest={false}
                  position={[(furnitureRight + wallRight) / 2, columnDimensionY + mmToThreeUnits(20), 0.01]}
                  fontSize={baseFontSize} color={textColor} anchorX="center" anchorY="middle"
                  outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                >
                  {rightGapMm}
                </Text>
              </>
            )}

            {/* 가구 좌측 끝 연장선 (공간상단~치수선 위) */}
            <NativeLine name="dimension_line"
              points={[[furnitureLeft, spaceHeight, 0.001], [furnitureLeft, topDimensionY + extLen, 0.001]]}
              color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
            />
            {/* 가구 우측 끝 연장선 */}
            <NativeLine name="dimension_line"
              points={[[furnitureRight, spaceHeight, 0.001], [furnitureRight, topDimensionY + extLen, 0.001]]}
              color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
            />
          </group>
        );
      })()}

      {/* ═══ 좌측 세로 치수선 (2단 구조) ═══ */}
      {showDimensions && <group>
        {(() => {
          // ── 가구 데이터 수집 (자유배치 + 슬롯배치 공통) ──
          const allMods = placedModules.filter(m => !m.isSurroundPanel);
          // 단내림 정보 — 모드별 분기 (슬롯: droppedCeiling, 자유배치: stepCeiling)
          const hasDrop_L = isFreePlacement
            ? (spaceInfo.stepCeiling?.enabled === true)
            : (spaceInfo.droppedCeiling?.enabled === true);
          const isLeftDrop_pre = hasDrop_L && (isFreePlacement
            ? spaceInfo.stepCeiling!.position === 'left'
            : spaceInfo.droppedCeiling!.position === 'left');
          // 단내림이 좌측이면 단내림 구간 가구 기준, 아니면 가장 좌측 가구
          const leftmostMod = (() => {
            if (isLeftDrop_pre) {
              // 슬롯: zone='dropped', 자유배치: zone='stepCeiling'
              const dropZoneName = isFreePlacement ? 'stepCeiling' : 'dropped';
              const droppedMods = allMods.filter(m => m.zone === dropZoneName);
              if (droppedMods.length > 0) return droppedMods.reduce((l, m) => m.position.x < l.position.x ? m : l);
            }
            return allMods.length > 0 ? allMods.reduce((l, m) => m.position.x < l.position.x ? m : l) : null;
          })();

          // 같은 슬롯/위치에 상부장+하부장 동시 배치 시 companion 모듈 찾기
          const leftCompanionMod = (() => {
            if (!leftmostMod) return null;
            const leftModData = getModuleById(leftmostMod.moduleId);
            const leftCat = leftModData?.category
              ?? (leftmostMod.moduleId.includes('upper') ? 'upper'
                : leftmostMod.moduleId.includes('lower') ? 'lower' : 'full');
            if (leftCat === 'full') return null; // 키큰장은 companion 없음
            const targetCat = leftCat === 'upper' ? 'lower' : 'upper';
            return allMods.find(m => {
              if (m === leftmostMod) return false;
              const bothHaveSlot = m.slotIndex !== undefined && leftmostMod.slotIndex !== undefined;
              const samePosition = bothHaveSlot
                ? m.slotIndex === leftmostMod.slotIndex
                : Math.abs((m.position?.x ?? 0) - (leftmostMod.position?.x ?? 0)) < 300;
              if (!samePosition) return false;
              const mData = getModuleById(m.moduleId);
              const mCat = mData?.category
                ?? (m.moduleId.includes('upper') ? 'upper'
                  : m.moduleId.includes('lower') ? 'lower' : 'full');
              return mCat === targetCat;
            }) ?? null;
          })();

          // ── 공통 변수 ──
          const outerX = leftDimensionX + leftOffset;  // 2단(바깥) X
          const innerX = leftFrameDimensionX + leftOffset;  // 1단(안쪽) X
          const leftCBOuterX = outerX - mmToThreeUnits(200); // 3단(더 바깥): 커튼박스 높이
          const floorFinishY = floorFinishHeightMmGlobal > 0 ? mmToThreeUnits(floorFinishHeightMmGlobal) : 0;
          const hasFloorFinish = floorFinishHeightMmGlobal > 0;

          const floorFinishMidY = floorFinishY / 2;
          const spaceMidY = floorFinishY + (spaceHeight - floorFinishY) / 2;

          // ── 단내림 정보 (hasDrop_L 재사용) ──
          const hasDrop = hasDrop_L;
          const dropHeight = hasDrop ? (isFreePlacement
            ? (spaceInfo.stepCeiling!.dropHeight || 200)
            : (spaceInfo.droppedCeiling!.dropHeight || 200)) : 0;
          const isLeftDrop = isLeftDrop_pre;

          // ── 커튼박스 정보 — 모드별 분기 (슬롯: curtainBox, 자유배치: droppedCeiling) ──
          const hasCB_L = isFreePlacement
            ? (spaceInfo.droppedCeiling?.enabled === true)
            : (spaceInfo.curtainBox?.enabled === true);
          const cbDropH_L = hasCB_L ? (isFreePlacement
            ? (spaceInfo.droppedCeiling!.dropHeight || 0)
            : (spaceInfo.curtainBox!.dropHeight || 0)) : 0;
          const cbTotalH_L = spaceInfo.height + cbDropH_L;
          // CB가 좌측에 있는지
          const isCBLeft = hasCB_L && (isFreePlacement
            ? spaceInfo.droppedCeiling!.position === 'left'
            : spaceInfo.curtainBox!.position === 'left');

          // ── 1단 분해 계산 (가구 유무 무관 — 항상 표시) ──
          const _internalHeight = calculateInternalSpace(spaceInfo).height;
          const globalBottomFrameH = spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig.height || 65) : 0;
          const globalTopFrame = spaceInfo.frameSize?.top ?? 30;
          // effectiveH: 단내림이 좌측에 있으면 단내림 높이 (가구 유무 무관 — 구간 자체의 높이)
          const effectiveH = isLeftDrop ? (spaceInfo.height - dropHeight) : spaceInfo.height;

          // per-furniture 실제 프레임 size (토글 무관 — 가구 내경 계산용)
          // 상하부장 동시배치 시 하부장의 프레임 정보를 사용해야 함
          const leftLowerMod = (() => {
            if (!leftmostMod) return leftmostMod;
            const cat = getModuleById(leftmostMod.moduleId)?.category
              ?? (leftmostMod.moduleId.includes('upper') ? 'upper'
                : leftmostMod.moduleId.includes('lower') ? 'lower' : 'full');
            if (cat === 'upper') {
              // leftmostMod가 상부장이면 companion(하부장)을 프레임 참조로 사용
              const lowerMod = allMods.find(m => {
                if (m === leftmostMod) return false;
                const bothHaveSlot = m.slotIndex !== undefined && leftmostMod.slotIndex !== undefined;
                const samePos = bothHaveSlot
                  ? m.slotIndex === leftmostMod.slotIndex
                  : Math.abs((m.position?.x ?? 0) - (leftmostMod.position?.x ?? 0)) < 300;
                if (!samePos) return false;
                const mCat = getModuleById(m.moduleId)?.category
                  ?? (m.moduleId.includes('upper') ? 'upper'
                    : m.moduleId.includes('lower') ? 'lower' : 'full');
                return mCat === 'lower';
              });
              return lowerMod ?? leftmostMod;
            }
            return leftmostMod;
          })();
          const leftUpperMod = (() => {
            if (!leftmostMod) return leftmostMod;
            const cat = getModuleById(leftmostMod.moduleId)?.category
              ?? (leftmostMod.moduleId.includes('upper') ? 'upper'
                : leftmostMod.moduleId.includes('lower') ? 'lower' : 'full');
            if (cat === 'lower') {
              const upperMod = allMods.find(m => {
                if (m === leftmostMod) return false;
                const bothHaveSlot = m.slotIndex !== undefined && leftmostMod.slotIndex !== undefined;
                const samePos = bothHaveSlot
                  ? m.slotIndex === leftmostMod.slotIndex
                  : Math.abs((m.position?.x ?? 0) - (leftmostMod.position?.x ?? 0)) < 300;
                if (!samePos) return false;
                const mCat = getModuleById(m.moduleId)?.category
                  ?? (m.moduleId.includes('upper') ? 'upper'
                    : m.moduleId.includes('lower') ? 'lower' : 'full');
                return mCat === 'upper';
              });
              return upperMod ?? leftmostMod;
            }
            return leftmostMod;
          })();
          // 상부/걸래받이 치수 = 토글 OFF면 0, ON이면 저장값
          // 상하부장 동시배치 시 leftmostMod가 상부장이면 leftLowerMod(하부장)의 hasBase 참조
          const baseRefMod = leftLowerMod ?? leftmostMod;
          const topRefMod_L = leftUpperMod ?? leftmostMod;
          const actualBottomSize = baseRefMod?.hasBase === false ? 0 : (leftLowerMod?.baseFrameHeight !== undefined ? leftLowerMod.baseFrameHeight : globalBottomFrameH);
          const actualTopSize = topRefMod_L?.hasTopFrame === false ? 0 : (topRefMod_L?.topFrameThickness !== undefined ? topRefMod_L.topFrameThickness : globalTopFrame);
          const actualTopClearance = topRefMod_L?.hasTopFrame === false
            ? Math.max(0, Math.round(topRefMod_L?.topFrameGap ?? 0))
            : actualTopSize;

          // 가구 내경 높이 — FurnitureItem.tsx와 동일한 로직 적용
          let furnitureH: number;
          // 카테고리는 항상 먼저 resolve (freeHeight/customHeight 여부와 무관)
          const leftModDataForCat = leftmostMod ? getModuleById(
            leftmostMod.moduleId,
            { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
            spaceInfo
          ) : null;
          let leftCategoryResolved: string = leftModDataForCat?.category
            ?? (leftmostMod?.moduleId.includes('upper') ? 'upper'
              : leftmostMod?.moduleId.includes('lower') ? 'lower' : 'full');
          const isStaleUpperTotalHeightLeft = (value?: number) => {
            if (leftCategoryResolved !== 'upper' || !leftModDataForCat || typeof value !== 'number') return false;
            const rounded = Math.round(value);
            return rounded === 850
              || rounded === 868
              || rounded === Math.round(leftModDataForCat.dimensions.height + (spaceInfo.baseConfig?.height ?? 65))
              || rounded === Math.round(leftModDataForCat.dimensions.height + 60)
              || rounded === Math.round(leftModDataForCat.dimensions.height + 65);
          };
          if (leftmostMod) {
            const isLeftGlassForH = !!leftmostMod.moduleId?.includes('glass-cabinet');
            if (isLeftGlassForH) {
              // 유리장은 슬롯/자유배치 모두 다른 키큰장처럼 공간 기준으로 측면 H를 산출한다.
              // 기존 배치값 freeHeight/customHeight가 남아 있어도 상하부 토글 흡수분이 치수가이드에 반영되어야 한다.
              const topFrameMm = topRefMod_L?.hasTopFrame === false
                ? 0
                : (topRefMod_L?.topFrameThickness ?? globalTopFrame ?? 0);
              const topGapMm = topRefMod_L?.hasTopFrame === false
                ? Math.max(0, Math.round(topRefMod_L?.topFrameGap ?? 0))
                : 0;
              const bottomClearanceMm = leftmostMod?.hasBase === false
                ? Math.max(0, Math.round(leftmostMod?.individualFloatHeight ?? 0))
                : actualBottomSize;
              furnitureH = Math.max(0, effectiveH - topFrameMm - topGapMm - bottomClearanceMm);
            } else if (leftCategoryResolved === 'upper' && leftmostMod.customHeight) {
              furnitureH = leftmostMod.customHeight;
            } else if (leftmostMod.freeHeight && !isStaleUpperTotalHeightLeft(leftmostMod.freeHeight)) {
              furnitureH = leftmostMod.freeHeight;
            } else if (leftmostMod.customHeight) {
              furnitureH = leftmostMod.customHeight;
            } else {
              if (leftCategoryResolved === 'lower' || leftCategoryResolved === 'upper') {
                furnitureH = leftModDataForCat?.dimensions.height ?? Math.max(0, effectiveH - actualBottomSize - actualTopClearance);
              } else {
                // 키큰장(full): 공간 - 걸래받이 - 상단몰딩
                furnitureH = Math.max(0, effectiveH - actualBottomSize - actualTopClearance);
              }
            }
          } else {
            furnitureH = _internalHeight;
          }
          // console.log('🔍 [상부섹션 furnitureH 좌]', { ... }); // 진단용 로그 제거 (성능)

          // companion 모듈(상부장+하부장 동시 배치) 높이 계산
          let companionH = 0;
          let companionCategory: string = '';
          if (leftCompanionMod) {
            const compModData = getModuleById(
              leftCompanionMod.moduleId,
              { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
              spaceInfo
            );
            companionCategory = compModData?.category
              ?? (leftCompanionMod.moduleId.includes('upper') ? 'upper'
                : leftCompanionMod.moduleId.includes('lower') ? 'lower' : 'full');
            const isStaleCompanionUpperTotalHeight = (value?: number) => {
              if (companionCategory !== 'upper' || !compModData || typeof value !== 'number') return false;
              const rounded = Math.round(value);
              return rounded === 850
                || rounded === 868
                || rounded === Math.round(compModData.dimensions.height + (spaceInfo.baseConfig?.height ?? 65))
                || rounded === Math.round(compModData.dimensions.height + 60)
                || rounded === Math.round(compModData.dimensions.height + 65);
            };
            companionH = companionCategory === 'upper'
              ? (leftCompanionMod.customHeight
                ?? (!isStaleCompanionUpperTotalHeight(leftCompanionMod.freeHeight) ? leftCompanionMod.freeHeight : undefined)
                ?? compModData?.dimensions.height
                ?? 0)
              : ((!isStaleCompanionUpperTotalHeight(leftCompanionMod.freeHeight) ? leftCompanionMod.freeHeight : undefined)
                ?? leftCompanionMod.customHeight
              ?? compModData?.dimensions.height
              ?? 0);
          }
          // hasDualCabinet: 상부장+하부장 동시 배치
          const hasDualCabinet = leftCompanionMod !== null && companionH > 0;
          // 상부장 하부마감판 두께 (UpperCabinet.tsx FinishingPanelWithTexture 18mm)
          const UPPER_BOTTOM_FINISH_MM = 18;
          // 하부장/상부장 높이 분리 (상부장은 하부마감판 포함, EP 끄면 미포함)
          let lowerCabinetH = 0;
          let upperCabinetH = 0;
          let upperCabinetBodyH = 0;
          let upperCabinetBottomEpH = 0;
          let lowerCountertopH = 0;
          let singleLowerCountertopH = 0;
          if (hasDualCabinet) {
            const upperModForEP = leftCategoryResolved === 'upper' ? leftmostMod : leftCompanionMod;
            const upperHasBottomEP = (upperModForEP as any)?.hasBottomEndPanel !== false;
            const upperFinishMm = upperHasBottomEP ? UPPER_BOTTOM_FINISH_MM : 0;
            upperCabinetBottomEpH = upperFinishMm;
            if (leftCategoryResolved === 'lower') {
              lowerCabinetH = furnitureH;
              upperCabinetBodyH = companionH;
              upperCabinetH = upperCabinetBodyH + upperCabinetBottomEpH;
            } else if (leftCategoryResolved === 'upper') {
              upperCabinetBodyH = furnitureH;
              upperCabinetH = upperCabinetBodyH + upperCabinetBottomEpH;
              lowerCabinetH = companionH;
            }
          }

          const getStoneH = (m: any): number => {
            return resolveCountertopThicknessMm(m, spaceInfo);
          };
          if (hasDualCabinet) {
            const lowerMod = leftCategoryResolved === 'lower' ? leftmostMod : leftCompanionMod;
            const stoneH = getStoneH(lowerMod);
            if (stoneH > 0) lowerCountertopH = stoneH;
          } else if (leftCategoryResolved === 'lower' && leftmostMod?.stoneTopThickness) {
            singleLowerCountertopH = getStoneH(leftmostMod);
          }

          // 바닥마감재 차감: 키큰장(full)만 (하부장/상부장은 고정 높이이므로 차감 불필요)
          const floorFinishForHeight = (spaceInfo.hasFloorFinish && spaceInfo.floorFinish)
            ? spaceInfo.floorFinish.height : 0;
          if (floorFinishForHeight > 0 && leftCategoryResolved === 'full') {
            furnitureH -= floorFinishForHeight;
          }

          // 치수가이드 표시용 프레임 높이 (토글 반영)
          // 하부: OFF → 띄움 높이(individualFloatHeight) 표시, ON → 실제 size
          // 상하부장 동시배치 시 하부장의 hasBase/individualFloatHeight 사용
          const bottomFrameH = leftLowerMod?.hasBase === false
            ? (leftLowerMod.individualFloatHeight ?? 0)
            : actualBottomSize;
          const bottomFrameGapH = leftLowerMod?.hasBase === false
            ? 0
            : Math.max(0, Math.min(bottomFrameH, (baseRefMod as any)?.baseFrameGap ?? 0));
          const bottomFrameVisibleH = Math.max(0, bottomFrameH - bottomFrameGapH);
          const leftTopGapForDim = topRefMod_L?.hasTopFrame === false
            ? Math.max(0, Math.round(topRefMod_L?.topFrameGap ?? 0))
            : 0;
          if (isFreePlacement && leftmostMod?.hasBase === false && topRefMod_L?.hasTopFrame !== false && leftCategoryResolved === 'full') {
            const absorbedBase = leftmostMod.baseFrameHeight ?? globalBottomFrameH;
            const floatH = leftmostMod.individualFloatHeight ?? 0;
            furnitureH += (absorbedBase - floatH);
          }
          if (isFreePlacement && topRefMod_L?.hasTopFrame === false && leftCategoryResolved === 'full') {
            furnitureH = Math.max(0, effectiveH - floorFinishForHeight - bottomFrameH - leftTopGapForDim);
          }
          // 상단몰딩 높이: 상부장/상하부장 동시배치는 고정값(actualTopSize), 하부장 단독은 남은 공간, 키큰장은 나머지에서 계산
          const furnitureOccupiedH = furnitureH + (leftCategoryResolved === 'lower' && !hasDualCabinet ? singleLowerCountertopH : 0);
          const topFrameH = (leftCategoryResolved === 'upper' || hasDualCabinet)
            ? actualTopSize
            : Math.max(0, effectiveH - floorFinishForHeight - bottomFrameH - furnitureOccupiedH);

          // 상부장 여부: 상부장은 천장에서 아래로 배치되므로 분할 순서가 다름
          const isUpperCategory = leftCategoryResolved === 'upper' && !hasDualCabinet;

          // ── 섹션 분할 정보 (2섹션 가구일 때 하부/상부 높이 분리) ──
          let sectionHeights: number[] = []; // 각 섹션의 mm 높이
          // 측면뷰 기준 가구는 sideViewMod 우선 (사용자가 선택/표시 중인 모듈)
          const leftViewMod = sideViewMod || leftmostMod;
          if (leftViewMod && !hasDualCabinet) {
            const modData = getModuleById(
              leftViewMod.moduleId,
              calculateInternalSpace(spaceInfo),
              spaceInfo
            );
            const sections = ((leftViewMod as any)?.customSections || modData?.modelConfig?.sections) as any[] | undefined;
            if (sections && sections.length >= 2) {
              // 섹션 기준 furnitureH = 실제 가구 내경 (공간 - 실제 상단몰딩 - 실제 걸래받이 - 띄움)
              // 상단몰딩 OFF: 슬롯/자유 모두 topFrameGap만큼 공간이 비므로 섹션 영역에서 차감
              const realTopFrame = topRefMod_L?.hasTopFrame === false
                ? (isFreePlacement ? leftTopGapForDim : ((topRefMod_L as any).topFrameGap ?? 0))
                : (topRefMod_L?.topFrameThickness ?? globalTopFrame);
              // 띄움 배치: hasBase=false 이면 걸래받이 자리가 띄움 공간으로 대체됨
              // → individualFloatHeight 가 없으면 baseFrameHeight (= 띄움 기본) 사용
              // 걸래받이 OFF (hasBase=false) → 걸래받이 자리를 마지막 섹션이 흡수
              //   → realBottomFrame = individualFloatHeight (있으면) 또는 0
              // 걸래받이 ON → baseFrameHeight (있으면) 또는 globalBottomFrameH
              const leftLowerHasBase = (leftLowerMod as any)?.hasBase;
              const realBottomFrame = leftLowerHasBase === false
                ? ((leftLowerMod as any)?.individualFloatHeight ?? 0)
                : (leftLowerMod?.baseFrameHeight ?? globalBottomFrameH);
              // 인출장/팬트리장: 바닥마감재도 가구 외경에 포함 (마지막 섹션이 흡수)
              const isPullOutOrPantryHere = !!(leftViewMod?.moduleId?.includes('pull-out-cabinet') || leftViewMod?.moduleId?.includes('pantry-cabinet'));
              const realFloorFinish = isPullOutOrPantryHere ? 0 : floorFinishForHeight;
              const sectionBasisH = Math.max(0, effectiveH - realTopFrame - realBottomFrame - realFloorFinish);
              const rawHeights = sections.map(s => {
                if (s.heightType === 'absolute') return s.height;
                return Math.round(sectionBasisH * s.height / 100);
              });
              // 현관장 H는 첫(하부) 섹션이 흡수
              // 선반장(single-shelf/dual-shelf): 걸레받이 OFF→하부 흡수, 띄움→하부 차감으로 분배
              // 그 외(일반 가구, 4drawer/2drawer-shelf 등): 마지막(상부) 섹션이 흡수
              const leftModId = leftViewMod?.moduleId || '';
              const leftIsEntryway = leftModId.includes('-entryway-');
              const leftIsPlainShelf = (leftModId.startsWith('single-shelf-') || leftModId.startsWith('dual-shelf-'))
                && !leftModId.includes('-4drawer-shelf-')
                && !leftModId.includes('-2drawer-shelf-')
                && !leftModId.includes('shelf-split');
              const leftIsShelfSplit = leftModId.includes('shelf-split');
              if (leftIsEntryway && rawHeights.length >= 2) {
                const fixedSum = rawHeights.slice(1).reduce((a, b) => a + b, 0);
                sectionHeights = [
                  Math.max(0, sectionBasisH - fixedSum),
                  ...rawHeights.slice(1),
                ];
              } else if ((leftIsPlainShelf || leftIsShelfSplit) && rawHeights.length >= 2) {
                // 하부 경계는 바닥 기준 1060mm 유지:
                // 걸레받이 OFF면 하부에 base를 더하고, 띄움은 하부에서 뺀다.
                const isFloatPlacement = spaceInfo?.baseConfig?.type === 'stand'
                  && spaceInfo?.baseConfig?.placementType === 'float';
                const globalFloatMm = isFloatPlacement ? (spaceInfo?.baseConfig?.floatHeight || 0) : 0;
                const globalBaseMm = spaceInfo?.baseConfig?.type === 'floor'
                  ? (spaceInfo?.baseConfig?.height ?? 60)
                  : 0;
                const shelfBaseAbsorbedMm = !leftIsShelfSplit && (leftLowerHasBase === false)
                  ? ((leftLowerMod as any)?.baseFrameHeight ?? globalBaseMm)
                  : 0;
                const shelfFloatAbsorbedMm = leftIsShelfSplit
                  ? 0
                  : (leftLowerHasBase === false)
                  ? Math.max(0, (leftLowerMod as any)?.individualFloatHeight ?? 0)
                  : globalFloatMm;
                const shelfBaseFrameDeltaMm = 0;
                const lowerOrig = rawHeights[0];
                const newLowerH = Math.max(0, Math.round(lowerOrig + shelfBaseAbsorbedMm - shelfFloatAbsorbedMm - shelfBaseFrameDeltaMm));
                const remainingUpperH = Math.max(0, sectionBasisH - newLowerH);
                const hasExplicitShelfSplitSections = leftIsShelfSplit && Array.isArray((leftViewMod as any)?.customSections);
                sectionHeights = [
                  newLowerH,
                  hasExplicitShelfSplitSections
                    ? Math.min(remainingUpperH, Math.max(0, Math.round(rawHeights[1] || 0)))
                    : remainingUpperH,
                ];
              } else {
                const fixedSum = rawHeights.slice(0, -1).reduce((a, b) => a + b, 0);
                sectionHeights = [
                  ...rawHeights.slice(0, -1),
                  Math.max(0, sectionBasisH - fixedSum)
                ];
              }
            }
          }
          const hasSectionSplit = sectionHeights.length >= 2;
          // console.log('🔍 [sectionHeights 좌]', { ... }); // 진단용 로그 제거 (성능)

          // Y 좌표 (1단용)
          const floorFinishBaseY = mmToThreeUnits(floorFinishForHeight);
          const effectiveCeilingY = mmToThreeUnits(effectiveH);
          const bottomFrameGapTopY = floorFinishBaseY + mmToThreeUnits(bottomFrameGapH);
          const bottomFrameSegments = bottomFrameGapH > 0
            ? [
              { key: 'gap', bottomY: floorFinishBaseY, topY: bottomFrameGapTopY, heightMm: bottomFrameGapH },
              { key: 'base', bottomY: bottomFrameGapTopY, topY: mmToThreeUnits(floorFinishForHeight + bottomFrameH), heightMm: bottomFrameVisibleH },
            ].filter(seg => seg.heightMm > 0)
            : [{ key: 'base', bottomY: floorFinishBaseY, topY: mmToThreeUnits(floorFinishForHeight + bottomFrameH), heightMm: bottomFrameH }];
          // 상부장: 천장→상단몰딩→가구→빈공간→바닥 순서
          // 하부장/키큰장: 바닥→바닥마감재→받침대→가구→상단몰딩→천장 순서
          // 상하부장 동시배치: 바닥→받침대→하부장→빈공간→상부장→상단몰딩→천장
          let bottomFrameTopY: number, furnitureTopY: number, lowerCabinetBodyTopY: number, singleLowerCountertopTopY: number;
          if (hasDualCabinet) {
            // 상하부장 동시 배치: 하부장 기준으로 좌표 설정
            bottomFrameTopY = mmToThreeUnits(floorFinishForHeight + bottomFrameH);
            lowerCabinetBodyTopY = mmToThreeUnits(floorFinishForHeight + bottomFrameH + lowerCabinetH);
            furnitureTopY = mmToThreeUnits(floorFinishForHeight + bottomFrameH + lowerCabinetH + lowerCountertopH);
            singleLowerCountertopTopY = furnitureTopY;
          } else if (isUpperCategory) {
            // 상부장: 가구는 천장 - 상단몰딩 아래에 붙음
            // 본체 가이드는 EP 켜진 경우에만 하부마감판(18mm) 포함, 끄면 본체만
            const singleUpperHasBottomEP = (leftmostMod as any)?.hasBottomEndPanel !== false;
            const singleUpperFinishMm = singleUpperHasBottomEP ? UPPER_BOTTOM_FINISH_MM : 0;
            furnitureTopY = mmToThreeUnits(effectiveH - actualTopClearance); // 상단몰딩/상단갭 하단 = 가구 상단
            bottomFrameTopY = furnitureTopY - mmToThreeUnits(furnitureH + singleUpperFinishMm); // 가구 하단 + (EP 시 하부마감판)
            lowerCabinetBodyTopY = furnitureTopY;
            singleLowerCountertopTopY = furnitureTopY;
          } else {
            bottomFrameTopY = mmToThreeUnits(floorFinishForHeight + bottomFrameH);
            furnitureTopY = mmToThreeUnits(floorFinishForHeight + bottomFrameH + furnitureH);
            lowerCabinetBodyTopY = furnitureTopY;
            singleLowerCountertopTopY = furnitureTopY + mmToThreeUnits(singleLowerCountertopH);
          }
          // 상하부장 동시배치 시 상부장 Y 좌표
          const upperCabinetBottomY = hasDualCabinet ? mmToThreeUnits(effectiveH - actualTopClearance - upperCabinetH) : 0;
          const upperCabinetBodyBottomY = hasDualCabinet ? upperCabinetBottomY + mmToThreeUnits(upperCabinetBottomEpH) : 0;
          const upperCabinetTopY = hasDualCabinet ? mmToThreeUnits(effectiveH - actualTopClearance) : 0;
          // 중간 빈공간 높이
          const middleGapH = hasDualCabinet
            ? Math.max(0, effectiveH - floorFinishForHeight - bottomFrameH - lowerCabinetH - lowerCountertopH - upperCabinetH - actualTopClearance)
            : 0;
          const lowerFrontZ_L = resolveFrontDimensionFrontZ(baseRefMod ?? leftmostMod, 'lower');
          const upperFrontZ_L = resolveFrontDimensionFrontZ(topRefMod_L ?? leftmostMod, 'upper');
          const lowerDimZ_L = frontViewLocalZ(lowerFrontZ_L, 0.002);
          const lowerExtZ_L = frontViewLocalZ(lowerFrontZ_L, 0.001);
          const lowerTextZ_L = frontViewLocalZ(lowerFrontZ_L, 0.01);
          const upperDimZ_L = frontViewLocalZ(upperFrontZ_L ?? lowerFrontZ_L, 0.002);
          const upperExtZ_L = frontViewLocalZ(upperFrontZ_L ?? lowerFrontZ_L, 0.001);
          const upperTextZ_L = frontViewLocalZ(upperFrontZ_L ?? lowerFrontZ_L, 0.01);
          const baseDimZ_L = hasDualCabinet || !isUpperCategory ? lowerDimZ_L : upperDimZ_L;
          const baseExtZ_L = hasDualCabinet || !isUpperCategory ? lowerExtZ_L : upperExtZ_L;
          const baseTextZ_L = hasDualCabinet || !isUpperCategory ? lowerTextZ_L : upperTextZ_L;
          const bodyDimZ_L = hasDualCabinet ? lowerDimZ_L : (isUpperCategory ? upperDimZ_L : lowerDimZ_L);
          const bodyExtZ_L = hasDualCabinet ? lowerExtZ_L : (isUpperCategory ? upperExtZ_L : lowerExtZ_L);
          const bodyTextZ_L = hasDualCabinet ? lowerTextZ_L : (isUpperCategory ? upperTextZ_L : lowerTextZ_L);
          const spaceDimZ_L = bodyDimZ_L;
          const spaceExtZ_L = bodyExtZ_L;
          const spaceTextZ_L = bodyTextZ_L;
          const topDimZ_L = hasDualCabinet || isUpperCategory ? upperDimZ_L : lowerDimZ_L;
          const topExtZ_L = hasDualCabinet || isUpperCategory ? upperExtZ_L : lowerExtZ_L;
          const topTextZ_L = hasDualCabinet || isUpperCategory ? upperTextZ_L : lowerTextZ_L;

          return (
            <>
              {/* ── 2단(바깥): 공간 전체 높이 (단내림 기둥 구분 포함) ── */}
              {(() => {
                const spaceHeightMm = spaceInfo.height;
                const spaceTopY = mmToThreeUnits(spaceHeightMm);
                // 단내림 기둥 높이 분리 표시 여부
                const showDropTick = isLeftDrop && dropHeight > 0;
                const dropBoundaryY = showDropTick ? mmToThreeUnits(spaceHeightMm - dropHeight) : spaceTopY;
                // 아래쪽(단내림 구간 높이) 중간Y
                const lowerMidY = floorFinishY + (dropBoundaryY - floorFinishY) / 2;
                // 위쪽(기둥 높이) 중간Y
                const upperMidY = (dropBoundaryY + spaceTopY) / 2;

                return (<>
                  {/* 세로 메인 라인: 0 ~ spaceHeight */}
                  <NativeLine name="dimension_line"
                    points={[[outerX, 0, spaceDimZ_L], [outerX, spaceTopY, spaceDimZ_L]]}
                    color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                  />
                  <NativeLine name="dimension_line"
                    points={createArrowHead([outerX, 0, spaceDimZ_L], [outerX, 0.05, spaceDimZ_L])}
                    color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                  />
                  <NativeLine name="dimension_line"
                    points={createArrowHead([outerX, spaceTopY, spaceDimZ_L], [outerX, spaceTopY - 0.05, spaceDimZ_L])}
                    color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                  />
                  {/* 바닥마감재 구분 틱 & 치수 — 연장선이 가구 좌측까지 이어지도록 충분히 길게 */}
                  {hasFloorFinish && (
                    <>
                      <NativeLine name="dimension_line"
                        points={[[outerX - mmToThreeUnits(30), floorFinishY, spaceDimZ_L], [0, floorFinishY, spaceDimZ_L]]}
                        color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                      />
                      <Text renderOrder={100001} depthTest={false}
                        position={[outerX - mmToThreeUnits(10), floorFinishMidY, spaceTextZ_L]}
                        fontSize={largeFontSize} color={textColor}
                        anchorX="right" anchorY="middle"
                        outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                      >
                        {floorFinishHeightMmGlobal}
                      </Text>
                    </>
                  )}
                  {/* 단내림 경계 구분 틱 & 기둥 높이 */}
                  {showDropTick && (
                    <>
                      <NativeLine name="dimension_line"
                        points={[[outerX - mmToThreeUnits(30), dropBoundaryY, spaceDimZ_L], [outerX + mmToThreeUnits(30), dropBoundaryY, spaceDimZ_L]]}
                        color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                      />
                      {/* 단내림 구간 높이 (아래쪽) */}
                      <Text renderOrder={100001} depthTest={false}
                        position={[outerX - mmToThreeUnits(10), lowerMidY, spaceTextZ_L]}
                        fontSize={largeFontSize} color={textColor}
                        anchorX="right" anchorY="middle"
                        outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                      >
                        {spaceHeightMm - dropHeight - floorFinishHeightMmGlobal}
                      </Text>
                      {/* 기둥 높이 (위쪽) */}
                      <Text renderOrder={100001} depthTest={false}
                        position={[outerX - mmToThreeUnits(10), upperMidY, spaceTextZ_L]}
                        fontSize={largeFontSize} color={textColor}
                        anchorX="right" anchorY="middle"
                        outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                      >
                        {dropHeight}
                      </Text>
                    </>
                  )}
                  {/* 단내림 없을 때 전체 높이 텍스트 */}
                  {!showDropTick && (
                    <Text renderOrder={100001} depthTest={false}
                      position={[outerX - mmToThreeUnits(10), floorFinishY + (spaceTopY - floorFinishY) / 2, spaceTextZ_L]}
                      fontSize={largeFontSize} color={textColor}
                      anchorX="right" anchorY="middle"
                      outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                    >
                      {spaceHeightMm - floorFinishHeightMmGlobal}
                    </Text>
                  )}
                </>);
              })()}

              {/* ── 3단(더 바깥): 커튼박스 전체 높이 (CB가 좌측일 때만) ── */}
              {isCBLeft && (() => {
                const cbHeightY = mmToThreeUnits(cbTotalH_L);
                const cbMidY = cbHeightY / 2;
                return (<>
                  <NativeLine name="dimension_line"
                    points={[[leftCBOuterX, 0, spaceDimZ_L], [leftCBOuterX, cbHeightY, spaceDimZ_L]]}
                    color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                  />
                  <NativeLine name="dimension_line"
                    points={createArrowHead([leftCBOuterX, 0, spaceDimZ_L], [leftCBOuterX, 0.05, spaceDimZ_L])}
                    color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                  />
                  <NativeLine name="dimension_line"
                    points={createArrowHead([leftCBOuterX, cbHeightY, spaceDimZ_L], [leftCBOuterX, cbHeightY - 0.05, spaceDimZ_L])}
                    color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                  />
                  <Text renderOrder={100001} depthTest={false}
                    position={[leftCBOuterX - mmToThreeUnits(10), cbMidY, spaceTextZ_L]}
                    fontSize={largeFontSize} color={textColor}
                    anchorX="right" anchorY="middle"
                    outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                  >
                    {cbTotalH_L}
                  </Text>
                </>);
              })()}

              {/* ── 1단(안쪽): 받침대/가구높이/상단몰딩 분해 (가구가 배치된 경우만 표시) ── */}
              {leftmostMod && (<>
              {/* 세로 메인 라인: 바닥마감재 위 ~ effectiveCeiling */}
              {hasDualCabinet ? (
                <>
                  <NativeLine name="dimension_line"
                    points={[[innerX, floorFinishBaseY, lowerDimZ_L], [innerX, furnitureTopY, lowerDimZ_L]]}
                    color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                  />
                  <NativeLine name="dimension_line"
                    points={[[innerX, upperCabinetBottomY, upperDimZ_L], [innerX, effectiveCeilingY, upperDimZ_L]]}
                    color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                  />
                </>
              ) : (
                <NativeLine name="dimension_line"
                  points={[[innerX, floorFinishBaseY, bodyDimZ_L], [innerX, effectiveCeilingY, bodyDimZ_L]]}
                  color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                />
              )}
              <NativeLine name="dimension_line"
                points={createArrowHead([innerX, floorFinishBaseY, baseDimZ_L], [innerX, floorFinishBaseY + 0.05, baseDimZ_L])}
                color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
              />
              <NativeLine name="dimension_line"
                points={createArrowHead([innerX, effectiveCeilingY, topDimZ_L], [innerX, effectiveCeilingY - 0.05, topDimZ_L])}
                color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
              />

              {/* 받침대 구분 틱 & 치수 (하부장/키큰장) 또는 빈공간 (상부장) */}
              {hasDualCabinet ? (
                /* 상하부장 동시배치: 받침대 높이 */
                bottomFrameH > 0 && (
                  <>
                    <NativeLine name="dimension_line"
                      points={[[innerX - mmToThreeUnits(15), bottomFrameTopY, baseDimZ_L], [innerX + mmToThreeUnits(15), bottomFrameTopY, baseDimZ_L]]}
                      color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                    />
                    {bottomFrameGapH > 0 && (
                      <>
                        <NativeLine name="dimension_line"
                          points={[[innerX - mmToThreeUnits(15), bottomFrameGapTopY, baseDimZ_L], [innerX + mmToThreeUnits(15), bottomFrameGapTopY, baseDimZ_L]]}
                          color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                        />
                        <NativeLine name="dimension_line"
                          points={[[innerX - mmToThreeUnits(20), bottomFrameGapTopY, baseExtZ_L], [leftOffset, bottomFrameGapTopY, baseExtZ_L]]}
                          color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                        />
                      </>
                    )}
                    {bottomFrameSegments.map(seg => (
                      <Text key={`left-dual-base-${seg.key}`} renderOrder={100001} depthTest={false}
                        position={[innerX - mmToThreeUnits(seg.key === 'gap' ? 45 : 25), (seg.bottomY + seg.topY) / 2, baseTextZ_L]}
                        fontSize={baseFontSize} color={textColor} anchorX="right" anchorY="middle"
                        outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                      >
                        {Math.round(seg.heightMm)}
                      </Text>
                    ))}
                  </>
                )
              ) : isUpperCategory ? (
                /* 상부장: 바닥마감재 위 ~ 가구 하단 = 빈공간 */
                bottomFrameTopY > floorFinishBaseY + 0.001 && (
                  <>
                    <NativeLine name="dimension_line"
                      points={[[innerX - mmToThreeUnits(15), bottomFrameTopY, baseDimZ_L], [innerX + mmToThreeUnits(15), bottomFrameTopY, baseDimZ_L]]}
                      color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                    />
                    <Text renderOrder={100001} depthTest={false}
                      position={[innerX - mmToThreeUnits(25), (floorFinishBaseY + bottomFrameTopY) / 2, baseTextZ_L]}
                      fontSize={baseFontSize} color={textColor} anchorX="right" anchorY="middle"
                      outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                    >
                      {Math.round(effectiveH - actualTopClearance - furnitureH - floorFinishForHeight)}
                    </Text>
                  </>
                )
              ) : (
                /* 하부장/키큰장: 받침대 높이 */
                bottomFrameH > 0 && (
                  <>
                    <NativeLine name="dimension_line"
                      points={[[innerX - mmToThreeUnits(15), bottomFrameTopY, baseDimZ_L], [innerX + mmToThreeUnits(15), bottomFrameTopY, baseDimZ_L]]}
                      color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                    />
                    {bottomFrameGapH > 0 && (
                      <>
                        <NativeLine name="dimension_line"
                          points={[[innerX - mmToThreeUnits(15), bottomFrameGapTopY, baseDimZ_L], [innerX + mmToThreeUnits(15), bottomFrameGapTopY, baseDimZ_L]]}
                          color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                        />
                        <NativeLine name="dimension_line"
                          points={[[innerX - mmToThreeUnits(20), bottomFrameGapTopY, baseExtZ_L], [leftOffset, bottomFrameGapTopY, baseExtZ_L]]}
                          color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                        />
                      </>
                    )}
                    {bottomFrameSegments.map(seg => (
                      <Text key={`left-base-${seg.key}`} renderOrder={100001} depthTest={false}
                        position={[innerX - mmToThreeUnits(seg.key === 'gap' ? 45 : 25), (seg.bottomY + seg.topY) / 2, baseTextZ_L]}
                        fontSize={baseFontSize} color={textColor} anchorX="right" anchorY="middle"
                        outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                      >
                        {Math.round(seg.heightMm)}
                      </Text>
                    ))}
                  </>
                )
              )}

              {/* 가구(내경) 높이 — 상하부장 동시배치 / 섹션 분할 / 단일 표시 */}
              {hasDualCabinet ? (
                <>
                  {/* 하부장 높이 */}
                  <NativeLine name="dimension_line"
                    points={[[innerX - mmToThreeUnits(15), lowerCabinetBodyTopY, lowerDimZ_L], [innerX + mmToThreeUnits(15), lowerCabinetBodyTopY, lowerDimZ_L]]}
                    color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                  />
                  <Text renderOrder={100001} depthTest={false}
                    position={[innerX - mmToThreeUnits(25), (bottomFrameTopY + lowerCabinetBodyTopY) / 2, lowerTextZ_L]}
                    fontSize={baseFontSize} color={textColor} anchorX="right" anchorY="middle"
                    outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                  >
                    {lowerCabinetH}
                  </Text>
                  {lowerCountertopH > 0 && (
                    <>
                      <NativeLine name="dimension_line"
                        points={[[innerX - mmToThreeUnits(15), furnitureTopY, lowerDimZ_L], [innerX + mmToThreeUnits(15), furnitureTopY, lowerDimZ_L]]}
                        color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                      />
                      <NativeLine name="dimension_line"
                        points={[[leftOffset, lowerCabinetBodyTopY, lowerExtZ_L], [innerX - mmToThreeUnits(20), lowerCabinetBodyTopY, lowerExtZ_L]]}
                        color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                      />
                      <Text renderOrder={100001} depthTest={false}
                        position={[innerX - mmToThreeUnits(25), (lowerCabinetBodyTopY + furnitureTopY) / 2, lowerTextZ_L]}
                        fontSize={baseFontSize} color={textColor} anchorX="right" anchorY="middle"
                        outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                      >
                        {lowerCountertopH}
                      </Text>
                    </>
                  )}
                  {/* 중간 빈공간 (있는 경우) — 클릭 편집 가능 (상부장 하단 확장) */}
                  {middleGapH > 0 && (() => {
                    // 상부장 모듈 찾기 (leftmostMod 또는 leftCompanionMod 중 upper 카테고리)
                    const upperMod = leftCategoryResolved === 'upper' ? leftmostMod : leftCompanionMod;
                    const currentUpperH = upperCabinetBodyH;
                    return (
                      <>
                        <NativeLine name="dimension_line"
                          points={[[innerX - mmToThreeUnits(15), upperCabinetBottomY, upperDimZ_L], [innerX + mmToThreeUnits(15), upperCabinetBottomY, upperDimZ_L]]}
                          color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                        />
                        <Text renderOrder={100001} depthTest={false}
                          position={[innerX - mmToThreeUnits(25), (furnitureTopY + upperCabinetBottomY) / 2, upperTextZ_L]}
                          fontSize={baseFontSize} color={textColor} anchorX="right" anchorY="middle"
                          outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                        >
                          {middleGapH}
                        </Text>
                        {upperMod && !spaceInfo?.customGuideMode && (
                          <Html
                            position={[innerX - mmToThreeUnits(25), (furnitureTopY + upperCabinetBottomY) / 2, 0.02]}
                            center
                            zIndexRange={[200, 0]}
                            style={{ pointerEvents: 'auto', userSelect: 'none' }}
                          >
                            <MidwayGapEditor
                              value={middleGapH}
                              color={textColor}
                              isDark={currentViewDirection !== '3D' && view2DTheme === 'dark'}
                              onChange={(newGap) => {
                                // 좌/우/모든 상부 가구 연동
                                applyMidwayGapToAllUppers(middleGapH, newGap);
                              }}
                            />
                          </Html>
                        )}
                      </>
                    );
                  })()}
                  {/* 상부장 높이 */}
                  <NativeLine name="dimension_line"
                    points={[[innerX - mmToThreeUnits(15), upperCabinetTopY, upperDimZ_L], [innerX + mmToThreeUnits(15), upperCabinetTopY, upperDimZ_L]]}
                    color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                  />
                  {upperCabinetBottomEpH > 0 && (
                    <NativeLine name="dimension_line"
                      points={[[leftOffset, upperCabinetBodyBottomY, upperDimZ_L], [innerX - mmToThreeUnits(20), upperCabinetBodyBottomY, upperDimZ_L]]}
                      color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                    />
                  )}
                  <Text renderOrder={100001} depthTest={false}
                    position={[innerX - mmToThreeUnits(25), (upperCabinetBodyBottomY + upperCabinetTopY) / 2, upperTextZ_L]}
                    fontSize={baseFontSize} color={textColor} anchorX="right" anchorY="middle"
                    outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                  >
                    {upperCabinetBodyH}
                  </Text>
                  {upperCabinetBottomEpH > 0 && (
                    <Text renderOrder={100001} depthTest={false}
                      position={[innerX - mmToThreeUnits(25), (upperCabinetBottomY + upperCabinetBodyBottomY) / 2, upperTextZ_L]}
                      fontSize={baseFontSize} color={textColor} anchorX="right" anchorY="middle"
                      outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                    >
                      {upperCabinetBottomEpH}
                    </Text>
                  )}
                </>
              ) : hasSectionSplit ? (
                <>
                  {/* 섹션별 구분 틱 & 치수 (하부→상부 순서) */}
                  {(() => {
                    const displaySegments = sectionHeights.map((secH, idx) => {
                      const secBottomMm = floorFinishForHeight + bottomFrameH + sectionHeights.slice(0, idx).reduce((a, b) => a + b, 0);
                      const secTopMm = secBottomMm + secH;
                      return {
                        bottomMm: secBottomMm,
                        topMm: secTopMm,
                        heightMm: Math.round(secH),
                        key: `sec-${idx}`,
                      };
                    });

                    return displaySegments.map((seg, idx) => {
                    const secH = seg.heightMm;
                    const secBottomY = mmToThreeUnits(seg.bottomMm);
                    const secTopY = mmToThreeUnits(seg.topMm);
                    return (
                      <React.Fragment key={`left-${seg.key}-${idx}`}>
                        {/* 섹션 상단 구분 틱 */}
                        <NativeLine name="dimension_line"
                          points={[[innerX - mmToThreeUnits(15), secTopY, bodyDimZ_L], [innerX + mmToThreeUnits(15), secTopY, bodyDimZ_L]]}
                          color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                        />
                        {/* 섹션 높이 텍스트 */}
                        <Text renderOrder={100001} depthTest={false}
                          position={[innerX - mmToThreeUnits(25), (secBottomY + secTopY) / 2, bodyTextZ_L]}
                          fontSize={baseFontSize} color={textColor} anchorX="right" anchorY="middle"
                          outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                        >
                          {secH}
                        </Text>
                        {/* 섹션 경계 연장선 */}
                        {idx < displaySegments.length - 1 && (
                          <NativeLine name="dimension_line"
                            points={[[leftOffset, secTopY, bodyExtZ_L], [innerX - mmToThreeUnits(20), secTopY, bodyExtZ_L]]}
                            color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                          />
                        )}
                      </React.Fragment>
                    );
                    });
                  })()}
                </>
              ) : (
                <>
                  {/* 단일 내경 높이 표시
                      - 상부장: 본체 H(furnitureH)와 하부 EP(18mm)를 별도 치수로 분리 표시
                      - 그 외: 단일 치수 */}
                  <NativeLine name="dimension_line"
                    points={[[innerX - mmToThreeUnits(15), furnitureTopY, bodyDimZ_L], [innerX + mmToThreeUnits(15), furnitureTopY, bodyDimZ_L]]}
                    color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                  />
                  {leftCategoryResolved === 'upper' ? (() => {
                    // 상부장 본체 하단 = bottomFrameTopY + 하부 EP 두께(있을 때만)
                    const hasBottomEPLeft = (() => {
                      const lm = leftmostMod as any;
                      return lm?.hasBottomEndPanel !== false;
                    })();
                    const bodyBottomY = hasBottomEPLeft
                      ? bottomFrameTopY + mmToThreeUnits(UPPER_BOTTOM_FINISH_MM)
                      : bottomFrameTopY;
                    return (
                      <>
                        {/* 본체 H 치수 텍스트 */}
                        <Text renderOrder={100001} depthTest={false}
                          position={[innerX - mmToThreeUnits(25), (bodyBottomY + furnitureTopY) / 2, bodyTextZ_L]}
                          fontSize={baseFontSize} color={textColor} anchorX="right" anchorY="middle"
                          outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                        >
                          {furnitureH}
                        </Text>
                        {hasBottomEPLeft && (
                          <>
                            {/* 본체 하단 ~ 하부 EP 하단 구분 가이드 — 좌측으로만 짧게 (외곽선과 무관) */}
                            <NativeLine name="dimension_line"
                              points={[[leftOffset, bodyBottomY, bodyDimZ_L], [innerX - mmToThreeUnits(20), bodyBottomY, bodyDimZ_L]]}
                              color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                            />
                            {/* 하부 EP 18 치수 텍스트 */}
                            <Text renderOrder={100001} depthTest={false}
                              position={[innerX - mmToThreeUnits(25), (bottomFrameTopY + bodyBottomY) / 2, bodyTextZ_L]}
                              fontSize={baseFontSize} color={textColor} anchorX="right" anchorY="middle"
                              outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                            >
                              {UPPER_BOTTOM_FINISH_MM}
                            </Text>
                          </>
                        )}
                      </>
                    );
                  })() : (
                    <>
                      <Text renderOrder={100001} depthTest={false}
                        position={[innerX - mmToThreeUnits(25), (bottomFrameTopY + furnitureTopY) / 2, bodyTextZ_L]}
                        fontSize={baseFontSize} color={textColor} anchorX="right" anchorY="middle"
                        outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                      >
                        {furnitureH}
                      </Text>
                      {singleLowerCountertopH > 0 && (
                        <>
                          <NativeLine name="dimension_line"
                            points={[[innerX - mmToThreeUnits(15), singleLowerCountertopTopY, bodyDimZ_L], [innerX + mmToThreeUnits(15), singleLowerCountertopTopY, bodyDimZ_L]]}
                            color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                          />
                          <NativeLine name="dimension_line"
                            points={[[leftOffset, furnitureTopY, bodyExtZ_L], [innerX - mmToThreeUnits(20), furnitureTopY, bodyExtZ_L]]}
                            color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                          />
                          <Text renderOrder={100001} depthTest={false}
                            position={[innerX - mmToThreeUnits(25), (furnitureTopY + singleLowerCountertopTopY) / 2, bodyTextZ_L]}
                            fontSize={baseFontSize} color={textColor} anchorX="right" anchorY="middle"
                            outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                          >
                            {singleLowerCountertopH}
                          </Text>
                        </>
                      )}
                    </>
                  )}
                </>
              )}

              {/* 상단몰딩/상단갭 구분 틱 & 치수 — 토글 OFF여도 사용자 입력 상단갭 표시 */}
              {(() => {
                const isShelfSplitTopDim = !!leftViewMod?.moduleId?.includes('shelf-split') && sectionHeights.length >= 2;
                const shelfSplitTopFrameForDim = isShelfSplitTopDim
                  ? Math.max(0, Math.round(effectiveH - floorFinishForHeight - bottomFrameH - sectionHeights.reduce((sum, h) => sum + h, 0)))
                  : null;
                // 토글 OFF + 사용자 입력 상단갭이 있으면 그 값을 표시 (몰딩 자리가 빈 공간)
                const userTopGap = topRefMod_L?.hasTopFrame === false
                  ? Math.max(0, Math.round(shelfSplitTopFrameForDim ?? topRefMod_L?.topFrameGap ?? 0))
                  : 0;
                const displayTopFrame = topRefMod_L?.hasTopFrame === false
                  ? userTopGap
                  : Math.max(0, Math.round(actualTopSize));
                if (displayTopFrame <= 0) return null;
                const topGapH = topRefMod_L?.hasTopFrame === false
                  ? 0
                  : Math.max(0, Math.min(displayTopFrame, Math.round(topRefMod_L?.topFrameGap ?? 0)));
                const visibleTopFrameH = Math.max(0, displayTopFrame - topGapH);
                const singleLowerTopRef = singleLowerCountertopH > 0 ? singleLowerCountertopTopY : furnitureTopY;
                const sectionSplitTopRef = hasSectionSplit
                  ? mmToThreeUnits(floorFinishForHeight + bottomFrameH + sectionHeights.reduce((sum, h) => sum + h, 0))
                  : singleLowerTopRef;
                const topFrameBottomRef = topRefMod_L?.hasTopFrame === false
                  ? effectiveCeilingY - mmToThreeUnits(userTopGap)
                  : (isShelfSplitTopDim ? effectiveCeilingY - mmToThreeUnits(displayTopFrame) : (hasDualCabinet ? upperCabinetTopY : sectionSplitTopRef));
                const topGapBottomRef = effectiveCeilingY - mmToThreeUnits(topGapH);
                const topFrameSegments = topGapH > 0
                  ? [
                    { key: 'frame', bottomY: topFrameBottomRef, topY: topGapBottomRef, heightMm: visibleTopFrameH },
                    { key: 'gap', bottomY: topGapBottomRef, topY: effectiveCeilingY, heightMm: topGapH },
                  ].filter(seg => seg.heightMm > 0)
                  : [{ key: 'frame', bottomY: topFrameBottomRef, topY: effectiveCeilingY, heightMm: displayTopFrame }];
                return (
                  <>
                    <NativeLine name="dimension_line"
                      points={[[innerX, topFrameBottomRef, frontViewLocalZ(upperFrontZ_L ?? lowerFrontZ_L, 0.003)], [innerX, effectiveCeilingY, frontViewLocalZ(upperFrontZ_L ?? lowerFrontZ_L, 0.003)]]}
                      color={frameDimensionColor} lineWidth={0.8} renderOrder={100002} depthTest={false}
                    />
                    <NativeLine name="dimension_line"
                      points={[[innerX - mmToThreeUnits(15), effectiveCeilingY, topDimZ_L], [innerX + mmToThreeUnits(15), effectiveCeilingY, topDimZ_L]]}
                      color={frameDimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                    />
                    <NativeLine name="dimension_line"
                      points={[[innerX - mmToThreeUnits(15), topFrameBottomRef, topDimZ_L], [innerX + mmToThreeUnits(15), topFrameBottomRef, topDimZ_L]]}
                      color={frameDimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                    />
                    {topGapH > 0 && (
                      <>
                        <NativeLine name="dimension_line"
                          points={[[innerX - mmToThreeUnits(15), topGapBottomRef, topDimZ_L], [innerX + mmToThreeUnits(15), topGapBottomRef, topDimZ_L]]}
                          color={frameDimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                        />
                        <NativeLine name="dimension_line"
                          points={[[leftOffset, topGapBottomRef, frontViewLocalZ(upperFrontZ_L ?? lowerFrontZ_L, 0.003)], [innerX - mmToThreeUnits(20), topGapBottomRef, frontViewLocalZ(upperFrontZ_L ?? lowerFrontZ_L, 0.003)]]}
                          color={frameDimensionColor} lineWidth={0.6} renderOrder={100002} depthTest={false}
                        />
                      </>
                    )}
                    <NativeLine name="dimension_line"
                      points={[[leftOffset, effectiveCeilingY, frontViewLocalZ(upperFrontZ_L ?? lowerFrontZ_L, 0.003)], [innerX - mmToThreeUnits(20), effectiveCeilingY, frontViewLocalZ(upperFrontZ_L ?? lowerFrontZ_L, 0.003)]]}
                      color={frameDimensionColor} lineWidth={0.6} renderOrder={100002} depthTest={false}
                    />
                    <NativeLine name="dimension_line"
                      points={[[leftOffset, topFrameBottomRef, frontViewLocalZ(upperFrontZ_L ?? lowerFrontZ_L, 0.003)], [innerX - mmToThreeUnits(20), topFrameBottomRef, frontViewLocalZ(upperFrontZ_L ?? lowerFrontZ_L, 0.003)]]}
                      color={frameDimensionColor} lineWidth={0.6} renderOrder={100002} depthTest={false}
                    />
                    {topFrameSegments.map(seg => (
                      <Text key={`left-top-${seg.key}`} renderOrder={100001} depthTest={false}
                        position={[innerX - mmToThreeUnits(seg.key === 'gap' ? 45 : 25), (seg.bottomY + seg.topY) / 2, topTextZ_L]}
                        fontSize={baseFontSize} color={frameDimensionColor} anchorX="right" anchorY="middle"
                        outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                      >
                        {Math.round(seg.heightMm)}
                      </Text>
                    ))}
                  </>
                );
              })()}
              </>)}

              {/* ── 연장선: 각 경계점에서 수평선 ── */}
              {/* 바닥(Y=0) — 커튼박스 있으면 3단까지 연장 */}
              <NativeLine name="dimension_line"
                points={[[(isCBLeft ? leftCBOuterX : outerX) - mmToThreeUnits(20), 0, spaceExtZ_L], [leftOffset, 0, spaceExtZ_L]]}
                color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
              />
              {/* 단내림 천장 연장선 (단내림이 좌측에 있을 때) */}
              {isLeftDrop && dropHeight > 0 && (
                <NativeLine name="dimension_line"
                  points={[[outerX - mmToThreeUnits(20), effectiveCeilingY, spaceExtZ_L], [leftOffset, effectiveCeilingY, spaceExtZ_L]]}
                  color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                />
              )}
              {/* 공간 천장(spaceHeight) 연장선 — 커튼박스 있으면 3단까지 */}
              <NativeLine name="dimension_line"
                points={[[(isCBLeft ? leftCBOuterX : outerX) - mmToThreeUnits(20), spaceHeight, spaceExtZ_L], [leftOffset, spaceHeight, spaceExtZ_L]]}
                color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
              />
              {/* 커튼박스 천장 연장선 */}
              {isCBLeft && (
                <NativeLine name="dimension_line"
                  points={[[leftCBOuterX - mmToThreeUnits(20), mmToThreeUnits(cbTotalH_L), spaceExtZ_L], [leftOffset, mmToThreeUnits(cbTotalH_L), spaceExtZ_L]]}
                  color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                />
              )}
              {/* 받침대 상단 또는 상부장 하단 경계 (가구 있을 때만) */}
              {leftmostMod && (isUpperCategory ? (bottomFrameTopY > floorFinishBaseY + 0.001) : (bottomFrameH > 0)) && (
                <NativeLine name="dimension_line"
                  points={[[innerX - mmToThreeUnits(20), bottomFrameTopY, baseExtZ_L], [leftOffset, bottomFrameTopY, baseExtZ_L]]}
                  color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                />
              )}
              {/* 가구(내경) 상단 = 하부장 상단 (가구 있을 때만) */}
              {leftmostMod && (() => {
                const bodyTopYForExt = leftViewMod?.moduleId?.includes('shelf-split') && sectionHeights.length >= 2
                  ? mmToThreeUnits(floorFinishForHeight + bottomFrameH + sectionHeights.reduce((sum, h) => sum + h, 0))
                  : furnitureTopY;
                return (
                  <NativeLine name="dimension_line"
                    points={[[innerX - mmToThreeUnits(20), bodyTopYForExt, bodyExtZ_L], [leftOffset, bodyTopYForExt, bodyExtZ_L]]}
                    color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                  />
                );
              })()}
              {/* 듀얼: 상부장 하단 경계 연장선 */}
              {hasDualCabinet && upperCabinetBottomY > furnitureTopY + 0.001 && (
                <NativeLine name="dimension_line"
                  points={[[innerX - mmToThreeUnits(20), upperCabinetBottomY, upperExtZ_L], [leftOffset, upperCabinetBottomY, upperExtZ_L]]}
                  color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                />
              )}
              {/* 듀얼: 상부장 상단 경계 연장선 */}
              {hasDualCabinet && (
                <NativeLine name="dimension_line"
                  points={[[innerX - mmToThreeUnits(20), upperCabinetTopY, upperExtZ_L], [leftOffset, upperCabinetTopY, upperExtZ_L]]}
                  color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                />
              )}
            </>
          );
        })()}
      </group>}

      {/* 커튼박스 전체높이 치수선 제거됨 — 사용자 요청 */}

      {/* ═══ 우측 세로 치수선 (2단 구조) ═══ */}
      {showDimensions && <group>
        {(() => {
          // ── 가구 데이터 수집 (자유배치 + 슬롯배치 공통) ──
          const allMods_R = placedModules.filter(m => !m.isSurroundPanel);
          // 단내림 정보 — 모드별 분기 (슬롯: droppedCeiling, 자유배치: stepCeiling)
          const hasDrop_R = isFreePlacement
            ? (spaceInfo.stepCeiling?.enabled === true)
            : (spaceInfo.droppedCeiling?.enabled === true);
          const isRightDrop_pre = hasDrop_R && (isFreePlacement
            ? spaceInfo.stepCeiling!.position === 'right'
            : spaceInfo.droppedCeiling!.position === 'right');
          // 단내림이 우측이면 단내림 구간 가구 기준, 아니면 가장 우측 가구
          const rightmostMod = (() => {
            if (isRightDrop_pre) {
              // 슬롯: zone='dropped', 자유배치: zone='stepCeiling'
              const dropZoneName = isFreePlacement ? 'stepCeiling' : 'dropped';
              const droppedMods = allMods_R.filter(m => m.zone === dropZoneName);
              if (droppedMods.length > 0) return droppedMods.reduce((r, m) => m.position.x > r.position.x ? m : r);
            }
            return allMods_R.length > 0 ? allMods_R.reduce((r, m) => m.position.x > r.position.x ? m : r) : null;
          })();

          // 같은 슬롯/위치에 상부장+하부장 동시 배치 시 companion 모듈 찾기
          const rightCompanionMod = (() => {
            if (!rightmostMod) return null;
            const rModData = getModuleById(rightmostMod.moduleId);
            const rCat = rModData?.category
              ?? (rightmostMod.moduleId.includes('upper') ? 'upper'
                : rightmostMod.moduleId.includes('lower') ? 'lower' : 'full');
            if (rCat === 'full') return null;
            const targetCat = rCat === 'upper' ? 'lower' : 'upper';
            return allMods_R.find(m => {
              if (m === rightmostMod) return false;
              const bothHaveSlot = m.slotIndex !== undefined && rightmostMod.slotIndex !== undefined;
              const samePosition = bothHaveSlot
                ? m.slotIndex === rightmostMod.slotIndex
                : Math.abs((m.position?.x ?? 0) - (rightmostMod.position?.x ?? 0)) < 300;
              if (!samePosition) return false;
              const mData = getModuleById(m.moduleId);
              const mCat = mData?.category
                ?? (m.moduleId.includes('upper') ? 'upper'
                  : m.moduleId.includes('lower') ? 'lower' : 'full');
              return mCat === targetCat;
            }) ?? null;
          })();

          // ── 커튼박스 정보 — 모드별 분기 (슬롯: curtainBox, 자유배치: droppedCeiling) ──
          const hasCB_R_any = isFreePlacement
            ? (spaceInfo.droppedCeiling?.enabled === true)
            : (spaceInfo.curtainBox?.enabled === true);
          // CB가 우측에 있는지
          const isCBRight = hasCB_R_any && (isFreePlacement
            ? spaceInfo.droppedCeiling!.position === 'right'
            : spaceInfo.curtainBox!.position === 'right');
          const hasCB_R = isCBRight; // 우측 치수선에서는 CB가 우측일 때만 표시
          const cbDropH_R = hasCB_R ? (isFreePlacement
            ? (spaceInfo.droppedCeiling!.dropHeight || 0)
            : (spaceInfo.curtainBox!.dropHeight || 0)) : 0;
          const cbTotalH_R = spaceInfo.height + cbDropH_R; // 커튼박스 전체 높이

          // ── 공통 변수 ──
          const rightWallX = mmToThreeUnits(spaceInfo.width) + leftOffset;
          const rightInnerX = rightWallX + mmToThreeUnits(200 + doorVerticalGuideExpansionMm);   // 1단(안쪽): 프레임 분해
          const rightOuterX = rightWallX + mmToThreeUnits(400 + doorVerticalGuideExpansionMm);   // 2단: 단내림 높이 or 전체 높이
          const rightCBOuterX = rightWallX + mmToThreeUnits(600 + doorVerticalGuideExpansionMm); // 3단(바깥): 커튼박스 높이
          const floorFinishYR = floorFinishHeightMmGlobal > 0 ? mmToThreeUnits(floorFinishHeightMmGlobal) : 0;
          const hasFloorFinishR = floorFinishHeightMmGlobal > 0;
          const floorFinishMidYR = floorFinishYR / 2;
          const spaceMidYR = floorFinishYR + (spaceHeight - floorFinishYR) / 2;

          // ── 단내림 정보 (hasDrop_R 재사용) ──
          const hasDrop = hasDrop_R;
          const dropHeight = hasDrop ? (isFreePlacement
            ? (spaceInfo.stepCeiling!.dropHeight || 200)
            : (spaceInfo.droppedCeiling!.dropHeight || 200)) : 0;
          const isRightDrop = isRightDrop_pre;
          // ── 1단 분해 계산 (가구 유무 무관 — 항상 표시) ──
          const rInternalHeight = calculateInternalSpace(spaceInfo).height;
          const rGlobalBottomFrameH = spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig.height || 65) : 0;
          const rGlobalTopFrame = spaceInfo.frameSize?.top ?? 30;
          // effectiveH: 단내림이 우측에 있으면 단내림 높이 (가구 유무 무관 — 구간 자체의 높이)
          const rEffectiveH = isRightDrop ? (spaceInfo.height - dropHeight) : spaceInfo.height;

          // per-furniture 실제 프레임 size (토글 무관 — 가구 내경 계산용)
          // 상하부장 동시배치 시 하부장의 프레임 정보를 사용해야 함
          const rightLowerMod = (() => {
            if (!rightmostMod) return rightmostMod;
            const cat = getModuleById(rightmostMod.moduleId)?.category
              ?? (rightmostMod.moduleId.includes('upper') ? 'upper'
                : rightmostMod.moduleId.includes('lower') ? 'lower' : 'full');
            if (cat === 'upper') {
              const lowerMod = allMods_R.find(m => {
                if (m === rightmostMod) return false;
                const bothHaveSlot = m.slotIndex !== undefined && rightmostMod.slotIndex !== undefined;
                const samePos = bothHaveSlot
                  ? m.slotIndex === rightmostMod.slotIndex
                  : Math.abs((m.position?.x ?? 0) - (rightmostMod.position?.x ?? 0)) < 300;
                if (!samePos) return false;
                const mCat = getModuleById(m.moduleId)?.category
                  ?? (m.moduleId.includes('upper') ? 'upper'
                    : m.moduleId.includes('lower') ? 'lower' : 'full');
                return mCat === 'lower';
              });
              return lowerMod ?? rightmostMod;
            }
            return rightmostMod;
          })();
          // 상부장 참조: rightmostMod가 하부장이면 같은 위치의 상부장(companion)을 상단몰딩 참조로 사용
          const rightUpperMod = (() => {
            if (!rightmostMod) return rightmostMod;
            const cat = getModuleById(rightmostMod.moduleId)?.category
              ?? (rightmostMod.moduleId.includes('upper') ? 'upper'
                : rightmostMod.moduleId.includes('lower') ? 'lower' : 'full');
            if (cat === 'lower') {
              const upperMod = allMods_R.find(m => {
                if (m === rightmostMod) return false;
                const bothHaveSlot = m.slotIndex !== undefined && rightmostMod.slotIndex !== undefined;
                const samePos = bothHaveSlot
                  ? m.slotIndex === rightmostMod.slotIndex
                  : Math.abs((m.position?.x ?? 0) - (rightmostMod.position?.x ?? 0)) < 300;
                if (!samePos) return false;
                const mCat = getModuleById(m.moduleId)?.category
                  ?? (m.moduleId.includes('upper') ? 'upper'
                    : m.moduleId.includes('lower') ? 'lower' : 'full');
                return mCat === 'upper';
              });
              return upperMod ?? rightmostMod;
            }
            return rightmostMod;
          })();
          // 상부/걸래받이 치수 = 토글 OFF면 0, ON이면 저장값
          // 상하부장 동시배치 시 rightmostMod가 하부장이면 rightUpperMod(상부장)의 hasTopFrame 참조
          const topRefMod_R = rightUpperMod ?? rightmostMod;
          const rActualBottomSize = rightLowerMod?.hasBase === false ? 0 : (rightLowerMod?.baseFrameHeight !== undefined ? rightLowerMod.baseFrameHeight : rGlobalBottomFrameH);
          const rActualTopSize = topRefMod_R?.hasTopFrame === false ? 0 : (topRefMod_R?.topFrameThickness !== undefined ? topRefMod_R.topFrameThickness : rGlobalTopFrame);
          const rActualTopClearance = topRefMod_R?.hasTopFrame === false
            ? Math.max(0, Math.round(topRefMod_R?.topFrameGap ?? 0))
            : rActualTopSize;

          // 가구 내경 높이 — FurnitureItem.tsx와 동일한 로직 적용
          let rFurnitureH: number;
          // 카테고리는 항상 먼저 resolve (freeHeight/customHeight 여부와 무관)
          const rightModDataForCat = rightmostMod ? getModuleById(
            rightmostMod.moduleId,
            { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
            spaceInfo
          ) : null;
          let rightCategoryResolved: string = rightModDataForCat?.category
            ?? (rightmostMod?.moduleId.includes('upper') ? 'upper'
              : rightmostMod?.moduleId.includes('lower') ? 'lower' : 'full');
          const isStaleUpperTotalHeightRight = (value?: number) => {
            if (rightCategoryResolved !== 'upper' || !rightModDataForCat || typeof value !== 'number') return false;
            const rounded = Math.round(value);
            return rounded === 850
              || rounded === 868
              || rounded === Math.round(rightModDataForCat.dimensions.height + (spaceInfo.baseConfig?.height ?? 65))
              || rounded === Math.round(rightModDataForCat.dimensions.height + 60)
              || rounded === Math.round(rightModDataForCat.dimensions.height + 65);
          };
          if (rightmostMod) {
            const isRightGlassForH = !!rightmostMod.moduleId?.includes('glass-cabinet');
            if (isRightGlassForH) {
              // 유리장은 슬롯/자유배치 모두 다른 키큰장처럼 공간 기준으로 측면 H를 산출한다.
              const topFrameMm = topRefMod_R?.hasTopFrame === false
                ? 0
                : (topRefMod_R?.topFrameThickness ?? rGlobalTopFrame ?? 0);
              const topGapMm = topRefMod_R?.hasTopFrame === false
                ? Math.max(0, Math.round(rightmostMod?.topFrameGap ?? 0))
                : 0;
              const bottomClearanceMm = rightLowerMod?.hasBase === false
                ? Math.max(0, Math.round(rightLowerMod?.individualFloatHeight ?? 0))
                : rActualBottomSize;
              rFurnitureH = Math.max(0, rEffectiveH - topFrameMm - topGapMm - bottomClearanceMm);
            } else if (rightCategoryResolved === 'upper' && rightmostMod.customHeight) {
              rFurnitureH = rightmostMod.customHeight;
            } else if (rightmostMod.freeHeight && !isStaleUpperTotalHeightRight(rightmostMod.freeHeight)) {
              rFurnitureH = rightmostMod.freeHeight;
            } else if (rightmostMod.customHeight) {
              rFurnitureH = rightmostMod.customHeight;
            } else {
              if (rightCategoryResolved === 'lower' || rightCategoryResolved === 'upper') {
                rFurnitureH = rightModDataForCat?.dimensions.height ?? Math.max(0, rEffectiveH - rActualBottomSize - rActualTopClearance);
              } else {
                rFurnitureH = Math.max(0, rEffectiveH - rActualBottomSize - rActualTopClearance);
              }
            }
          } else {
            rFurnitureH = rInternalHeight;
          }
          // console.log('🔍 [상부섹션 furnitureH 우]', { ... }); // 진단용 로그 제거 (성능)

          // companion 모듈(상부장+하부장 동시 배치) 높이 계산
          let rCompanionH = 0;
          let rCompanionCategory: string = '';
          if (rightCompanionMod) {
            const compModData = getModuleById(
              rightCompanionMod.moduleId,
              { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
              spaceInfo
            );
            rCompanionCategory = compModData?.category
              ?? (rightCompanionMod.moduleId.includes('upper') ? 'upper'
                : rightCompanionMod.moduleId.includes('lower') ? 'lower' : 'full');
            const isStaleRightCompanionUpperTotalHeight = (value?: number) => {
              if (rCompanionCategory !== 'upper' || !compModData || typeof value !== 'number') return false;
              const rounded = Math.round(value);
              return rounded === 850
                || rounded === 868
                || rounded === Math.round(compModData.dimensions.height + (spaceInfo.baseConfig?.height ?? 65))
                || rounded === Math.round(compModData.dimensions.height + 60)
                || rounded === Math.round(compModData.dimensions.height + 65);
            };
            rCompanionH = rCompanionCategory === 'upper'
              ? (rightCompanionMod.customHeight
                ?? (!isStaleRightCompanionUpperTotalHeight(rightCompanionMod.freeHeight) ? rightCompanionMod.freeHeight : undefined)
                ?? compModData?.dimensions.height
                ?? 0)
              : ((!isStaleRightCompanionUpperTotalHeight(rightCompanionMod.freeHeight) ? rightCompanionMod.freeHeight : undefined)
                ?? rightCompanionMod.customHeight
              ?? compModData?.dimensions.height
              ?? 0);
          }
          const rHasDualCabinet = rightCompanionMod !== null && rCompanionH > 0;
          // 상부장 하부마감판 두께 (UpperCabinet.tsx FinishingPanelWithTexture 18mm)
          const R_UPPER_BOTTOM_FINISH_MM = 18;
          let rLowerCabinetH = 0;
          let rUpperCabinetH = 0;
          let rUpperCabinetBodyH = 0;
          let rUpperCabinetBottomEpH = 0;
          let rLowerCountertopH = 0;
          let rSingleLowerCountertopH = 0;
          if (rHasDualCabinet) {
            const rUpperModForEP = rightCategoryResolved === 'upper' ? rightmostMod : rightCompanionMod;
            const rUpperHasBottomEP = (rUpperModForEP as any)?.hasBottomEndPanel !== false;
            const rUpperFinishMm = rUpperHasBottomEP ? R_UPPER_BOTTOM_FINISH_MM : 0;
            rUpperCabinetBottomEpH = rUpperFinishMm;
            if (rightCategoryResolved === 'lower') {
              rLowerCabinetH = rFurnitureH;
              rUpperCabinetBodyH = rCompanionH;
              rUpperCabinetH = rUpperCabinetBodyH + rUpperCabinetBottomEpH;
            } else if (rightCategoryResolved === 'upper') {
              rUpperCabinetBodyH = rFurnitureH;
              rUpperCabinetH = rUpperCabinetBodyH + rUpperCabinetBottomEpH;
              rLowerCabinetH = rCompanionH;
            }
          }

          const getStoneH_r = (m: any): number => {
            return resolveCountertopThicknessMm(m, spaceInfo);
          };
          if (rHasDualCabinet) {
            const rLowerMod = rightCategoryResolved === 'lower' ? rightmostMod : rightCompanionMod;
            const rStoneH = getStoneH_r(rLowerMod);
            if (rStoneH > 0) rLowerCountertopH = rStoneH;
          } else if (rightCategoryResolved === 'lower' && rightmostMod?.stoneTopThickness) {
            rSingleLowerCountertopH = getStoneH_r(rightmostMod);
          }

          // 바닥마감재 차감: 키큰장(full)만 (하부장/상부장은 고정 높이이므로 차감 불필요)
          const rFloorFinishForHeight = (spaceInfo.hasFloorFinish && spaceInfo.floorFinish)
            ? spaceInfo.floorFinish.height : 0;
          if (rFloorFinishForHeight > 0 && rightCategoryResolved === 'full') {
            rFurnitureH -= rFloorFinishForHeight;
          }

          // 치수가이드 표시용 프레임 높이 (토글 반영)
          // 상하부장 동시배치 시 하부장의 hasBase/individualFloatHeight 사용
          const rBottomFrameH = rightLowerMod?.hasBase === false
            ? (rightLowerMod.individualFloatHeight ?? 0)
            : rActualBottomSize;
          const rBaseRefMod = rightLowerMod ?? rightmostMod;
          const rBottomFrameGapH = rightLowerMod?.hasBase === false
            ? 0
            : Math.max(0, Math.min(rBottomFrameH, (rBaseRefMod as any)?.baseFrameGap ?? 0));
          const rBottomFrameVisibleH = Math.max(0, rBottomFrameH - rBottomFrameGapH);
          const rTopGapForDim = topRefMod_R?.hasTopFrame === false
            ? Math.max(0, Math.round(topRefMod_R?.topFrameGap ?? 0))
            : 0;
          if (isFreePlacement && rightmostMod?.hasBase === false && topRefMod_R?.hasTopFrame !== false && rightCategoryResolved === 'full') {
            const rAbsorbedBase = rightmostMod.baseFrameHeight ?? rGlobalBottomFrameH;
            const rFloatH = rightmostMod.individualFloatHeight ?? 0;
            rFurnitureH += (rAbsorbedBase - rFloatH);
          }
          if (isFreePlacement && topRefMod_R?.hasTopFrame === false && rightCategoryResolved === 'full') {
            rFurnitureH = Math.max(0, rEffectiveH - rFloorFinishForHeight - rBottomFrameH - rTopGapForDim);
          }
          // 상단몰딩 높이: 상부장/상하부장 동시배치는 고정값, 하부장 단독은 남은 공간, 키큰장은 나머지에서 계산
          const rFurnitureOccupiedH = rFurnitureH + (rightCategoryResolved === 'lower' && !rHasDualCabinet ? rSingleLowerCountertopH : 0);
          const rTopFrameH = (rightCategoryResolved === 'upper' || rHasDualCabinet)
            ? rActualTopSize
            : Math.max(0, rEffectiveH - rFloorFinishForHeight - rBottomFrameH - rFurnitureOccupiedH);

          // ── 섹션 분할 정보 (2섹션 가구일 때 하부/상부 높이 분리) ──
          let rSectionHeights: number[] = [];
          if (rightmostMod && !rHasDualCabinet) {
            const rModData = getModuleById(
              rightmostMod.moduleId,
              calculateInternalSpace(spaceInfo),
              spaceInfo
            );
            const rSections = ((rightmostMod as any)?.customSections || rModData?.modelConfig?.sections) as any[] | undefined;
            if (rSections && rSections.length >= 2) {
              // 섹션 기준 furnitureH = 실제 가구 내경 (공간 - 실제 상단몰딩 - 실제 걸래받이)
              // 상단몰딩 OFF: 슬롯/자유 모두 topFrameGap만큼 공간이 비므로 섹션 영역에서 차감
              const rRealTopFrame = topRefMod_R?.hasTopFrame === false
                ? (isFreePlacement ? rTopGapForDim : ((topRefMod_R as any).topFrameGap ?? 0))
                : (topRefMod_R?.topFrameThickness ?? rGlobalTopFrame);
              const rRealBottomFrame = (rightLowerMod as any)?.hasBase === false
                ? ((rightLowerMod as any)?.individualFloatHeight ?? 0)
                : (rightLowerMod?.baseFrameHeight ?? rGlobalBottomFrameH);
              const rIsPullOutOrPantryHere = !!(rightmostMod?.moduleId?.includes('pull-out-cabinet') || rightmostMod?.moduleId?.includes('pantry-cabinet'));
              const rRealFloorFinish = rIsPullOutOrPantryHere ? 0 : rFloorFinishForHeight;
              const rSectionBasisH = Math.max(0, rEffectiveH - rRealTopFrame - rRealBottomFrame - rRealFloorFinish);
              const rRawHeights = rSections.map(s => {
                if (s.heightType === 'absolute') return s.height;
                return Math.round(rSectionBasisH * s.height / 100);
              });
              // 현관장 H는 첫(하부) 섹션이 흡수
              // 선반장(single-shelf/dual-shelf): 걸레받이 OFF→하부 흡수, 띄움→하부 차감
              // 그 외(일반 가구, 4drawer/2drawer-shelf 등): 마지막(상부) 섹션이 흡수
              const rModId = rightmostMod?.moduleId || '';
              const rIsEntryway = rModId.includes('-entryway-');
              const rIsPlainShelf = (rModId.startsWith('single-shelf-') || rModId.startsWith('dual-shelf-'))
                && !rModId.includes('-4drawer-shelf-')
                && !rModId.includes('-2drawer-shelf-')
                && !rModId.includes('shelf-split');
              if (rIsEntryway && rRawHeights.length >= 2) {
                const rFixedSum = rRawHeights.slice(1).reduce((a, b) => a + b, 0);
                rSectionHeights = [
                  Math.max(0, rSectionBasisH - rFixedSum),
                  ...rRawHeights.slice(1),
                ];
              } else if (rIsPlainShelf && rRawHeights.length >= 2) {
                const isFloatPlacement = spaceInfo?.baseConfig?.type === 'stand'
                  && spaceInfo?.baseConfig?.placementType === 'float';
                const globalFloatMm = isFloatPlacement ? (spaceInfo?.baseConfig?.floatHeight || 0) : 0;
                const globalBaseMm = spaceInfo?.baseConfig?.type === 'floor'
                  ? (spaceInfo?.baseConfig?.height ?? 60)
                  : 0;
                const rShelfBaseAbsorbedMm = ((rightLowerMod as any)?.hasBase === false)
                  ? ((rightLowerMod as any)?.baseFrameHeight ?? globalBaseMm)
                  : 0;
                const rShelfFloatAbsorbedMm = ((rightLowerMod as any)?.hasBase === false)
                  ? Math.max(0, (rightLowerMod as any)?.individualFloatHeight ?? 0)
                  : globalFloatMm;
                const rLowerOrig = rRawHeights[0];
                const rNewLowerH = Math.max(0, Math.round(rLowerOrig + rShelfBaseAbsorbedMm - rShelfFloatAbsorbedMm));
                rSectionHeights = [
                  rNewLowerH,
                  Math.max(0, rSectionBasisH - rNewLowerH),
                ];
              } else {
                const rFixedSum = rRawHeights.slice(0, -1).reduce((a, b) => a + b, 0);
                rSectionHeights = [
                  ...rRawHeights.slice(0, -1),
                  Math.max(0, rSectionBasisH - rFixedSum)
                ];
              }
            }
          }
          const rHasSectionSplit = rSectionHeights.length >= 2;

          // 상부장 여부: 상부장은 천장에서 아래로 배치되므로 분할 순서가 다름
          const rIsUpperCategory = rightCategoryResolved === 'upper' && !rHasDualCabinet;

          // Y 좌표 (1단용) — 바닥마감재가 있으면 마감재 위에서 시작
          const rFloorFinishBaseY = mmToThreeUnits(rFloorFinishForHeight);
          const rEffectiveCeilingY = mmToThreeUnits(rEffectiveH);
          const rBottomFrameGapTopY = rFloorFinishBaseY + mmToThreeUnits(rBottomFrameGapH);
          const rBottomFrameSegments = rBottomFrameGapH > 0
            ? [
              { key: 'gap', bottomY: rFloorFinishBaseY, topY: rBottomFrameGapTopY, heightMm: rBottomFrameGapH },
              { key: 'base', bottomY: rBottomFrameGapTopY, topY: mmToThreeUnits(rFloorFinishForHeight + rBottomFrameH), heightMm: rBottomFrameVisibleH },
            ].filter(seg => seg.heightMm > 0)
            : [{ key: 'base', bottomY: rFloorFinishBaseY, topY: mmToThreeUnits(rFloorFinishForHeight + rBottomFrameH), heightMm: rBottomFrameH }];
          let rBottomFrameTopY: number, rFurnitureTopY: number, rLowerCabinetBodyTopY: number, rSingleLowerCountertopTopY: number;
          if (rHasDualCabinet) {
            // 상하부장 동시 배치: 하부장 기준으로 좌표 설정
            rBottomFrameTopY = mmToThreeUnits(rFloorFinishForHeight + rBottomFrameH);
            rLowerCabinetBodyTopY = mmToThreeUnits(rFloorFinishForHeight + rBottomFrameH + rLowerCabinetH);
            rFurnitureTopY = mmToThreeUnits(rFloorFinishForHeight + rBottomFrameH + rLowerCabinetH + rLowerCountertopH);
            rSingleLowerCountertopTopY = rFurnitureTopY;
          } else if (rIsUpperCategory) {
            // 상부장: 가구는 천장 - 상단몰딩 아래에 붙음
            // 본체 가이드는 EP 켜진 경우에만 하부마감판(18mm) 포함, 끄면 본체만
            const rSingleUpperHasBottomEP = (rightmostMod as any)?.hasBottomEndPanel !== false;
            const rSingleUpperFinishMm = rSingleUpperHasBottomEP ? R_UPPER_BOTTOM_FINISH_MM : 0;
            rFurnitureTopY = mmToThreeUnits(rEffectiveH - rActualTopClearance); // 상단몰딩/상단갭 하단 = 가구 상단
            rBottomFrameTopY = rFurnitureTopY - mmToThreeUnits(rFurnitureH + rSingleUpperFinishMm); // 가구 하단 + (EP 시 하부마감판)
            rLowerCabinetBodyTopY = rFurnitureTopY;
            rSingleLowerCountertopTopY = rFurnitureTopY;
          } else {
            rBottomFrameTopY = mmToThreeUnits(rFloorFinishForHeight + rBottomFrameH);
            rFurnitureTopY = mmToThreeUnits(rFloorFinishForHeight + rBottomFrameH + rFurnitureH);
            rLowerCabinetBodyTopY = rFurnitureTopY;
            rSingleLowerCountertopTopY = rFurnitureTopY + mmToThreeUnits(rSingleLowerCountertopH);
          }
          // 상하부장 동시배치 시 상부장 Y 좌표
          const rUpperCabinetBottomY = rHasDualCabinet ? mmToThreeUnits(rEffectiveH - rActualTopClearance - rUpperCabinetH) : 0;
          const rUpperCabinetBodyBottomY = rHasDualCabinet ? rUpperCabinetBottomY + mmToThreeUnits(rUpperCabinetBottomEpH) : 0;
          const rUpperCabinetTopY = rHasDualCabinet ? mmToThreeUnits(rEffectiveH - rActualTopClearance) : 0;
          const rMiddleGapH = rHasDualCabinet
            ? Math.max(0, rEffectiveH - rFloorFinishForHeight - rBottomFrameH - rLowerCabinetH - rLowerCountertopH - rUpperCabinetH - rActualTopClearance)
            : 0;
          const lowerFrontZ_R = resolveFrontDimensionFrontZ(rightLowerMod ?? rightmostMod, 'lower');
          const upperFrontZ_R = resolveFrontDimensionFrontZ(topRefMod_R ?? rightmostMod, 'upper');
          const lowerDimZ_R = frontViewLocalZ(lowerFrontZ_R, 0.002);
          const lowerExtZ_R = frontViewLocalZ(lowerFrontZ_R, 0.001);
          const lowerTextZ_R = frontViewLocalZ(lowerFrontZ_R, 0.01);
          const upperDimZ_R = frontViewLocalZ(upperFrontZ_R ?? lowerFrontZ_R, 0.002);
          const upperExtZ_R = frontViewLocalZ(upperFrontZ_R ?? lowerFrontZ_R, 0.001);
          const upperTextZ_R = frontViewLocalZ(upperFrontZ_R ?? lowerFrontZ_R, 0.01);
          const baseDimZ_R = rHasDualCabinet || !rIsUpperCategory ? lowerDimZ_R : upperDimZ_R;
          const baseExtZ_R = rHasDualCabinet || !rIsUpperCategory ? lowerExtZ_R : upperExtZ_R;
          const baseTextZ_R = rHasDualCabinet || !rIsUpperCategory ? lowerTextZ_R : upperTextZ_R;
          const bodyDimZ_R = rHasDualCabinet ? lowerDimZ_R : (rIsUpperCategory ? upperDimZ_R : lowerDimZ_R);
          const bodyExtZ_R = rHasDualCabinet ? lowerExtZ_R : (rIsUpperCategory ? upperExtZ_R : lowerExtZ_R);
          const bodyTextZ_R = rHasDualCabinet ? lowerTextZ_R : (rIsUpperCategory ? upperTextZ_R : lowerTextZ_R);
          const spaceDimZ_R = bodyDimZ_R;
          const spaceExtZ_R = bodyExtZ_R;
          const spaceTextZ_R = bodyTextZ_R;
          const topDimZ_R = rHasDualCabinet || rIsUpperCategory ? upperDimZ_R : lowerDimZ_R;
          const topExtZ_R = rHasDualCabinet || rIsUpperCategory ? upperExtZ_R : lowerExtZ_R;
          const topTextZ_R = rHasDualCabinet || rIsUpperCategory ? upperTextZ_R : lowerTextZ_R;

          return (
            <>
              {/* ── 2단: 공간 전체 높이 (단내림 기둥 구분 포함) ── */}
              {(() => {
                const spaceHeightMm = spaceInfo.height;
                const spaceTopY = mmToThreeUnits(spaceHeightMm);
                // 단내림 기둥 높이 분리 표시 여부
                const showDropTick = isRightDrop && dropHeight > 0;
                const dropBoundaryY = showDropTick ? mmToThreeUnits(spaceHeightMm - dropHeight) : spaceTopY;
                // 아래쪽(단내림 구간 높이) 중간Y
                const lowerMidY = floorFinishYR + (dropBoundaryY - floorFinishYR) / 2;
                // 위쪽(기둥 높이) 중간Y
                const upperMidY = (dropBoundaryY + spaceTopY) / 2;

                return (<>
                  {/* 세로 메인 라인: 0 ~ spaceHeight */}
                  <NativeLine name="dimension_line"
                    points={[[rightOuterX, 0, spaceDimZ_R], [rightOuterX, spaceTopY, spaceDimZ_R]]}
                    color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                  />
                  <NativeLine name="dimension_line"
                    points={createArrowHead([rightOuterX, 0, spaceDimZ_R], [rightOuterX, 0.05, spaceDimZ_R])}
                    color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                  />
                  <NativeLine name="dimension_line"
                    points={createArrowHead([rightOuterX, spaceTopY, spaceDimZ_R], [rightOuterX, spaceTopY - 0.05, spaceDimZ_R])}
                    color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                  />
                  {/* 바닥마감재 구분 틱 & 치수 — 연장선이 가구 우측까지 이어지도록 충분히 길게 */}
                  {hasFloorFinishR && (
                    <>
                      <NativeLine name="dimension_line"
                        points={[[0, floorFinishYR, spaceDimZ_R], [rightOuterX + mmToThreeUnits(30), floorFinishYR, spaceDimZ_R]]}
                        color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                      />
                      <Text renderOrder={100001} depthTest={false}
                        position={[rightOuterX + mmToThreeUnits(10), floorFinishMidYR, spaceTextZ_R]}
                        fontSize={largeFontSize} color={textColor}
                        anchorX="left" anchorY="middle"
                        outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                      >
                        {floorFinishHeightMmGlobal}
                      </Text>
                    </>
                  )}
                  {/* 단내림 경계 구분 틱 & 기둥 높이 */}
                  {showDropTick && (
                    <>
                      <NativeLine name="dimension_line"
                        points={[[rightOuterX - mmToThreeUnits(30), dropBoundaryY, spaceDimZ_R], [rightOuterX + mmToThreeUnits(30), dropBoundaryY, spaceDimZ_R]]}
                        color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                      />
                      {/* 단내림 구간 높이 (아래쪽) */}
                      <Text renderOrder={100001} depthTest={false}
                        position={[rightOuterX + mmToThreeUnits(10), lowerMidY, spaceTextZ_R]}
                        fontSize={largeFontSize} color={textColor}
                        anchorX="left" anchorY="middle"
                        outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                      >
                        {spaceHeightMm - dropHeight - floorFinishHeightMmGlobal}
                      </Text>
                      {/* 기둥 높이 (위쪽) */}
                      <Text renderOrder={100001} depthTest={false}
                        position={[rightOuterX + mmToThreeUnits(10), upperMidY, spaceTextZ_R]}
                        fontSize={largeFontSize} color={textColor}
                        anchorX="left" anchorY="middle"
                        outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                      >
                        {dropHeight}
                      </Text>
                    </>
                  )}
                  {/* 단내림 없을 때 전체 높이 텍스트 */}
                  {!showDropTick && (
                    <Text renderOrder={100001} depthTest={false}
                      position={[rightOuterX + mmToThreeUnits(10), floorFinishYR + (spaceTopY - floorFinishYR) / 2, spaceTextZ_R]}
                      fontSize={largeFontSize} color={textColor}
                      anchorX="left" anchorY="middle"
                      outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                    >
                      {spaceHeightMm - floorFinishHeightMmGlobal}
                    </Text>
                  )}
                </>);
              })()}

              {/* ── 3단(바깥): 커튼박스 전체 높이 (CB 있을 때만) ── */}
              {hasCB_R && (() => {
                const cbHeightY = mmToThreeUnits(cbTotalH_R);
                const cbMidY = cbHeightY / 2;
                return (<>
                  <NativeLine name="dimension_line"
                    points={[[rightCBOuterX, 0, spaceDimZ_R], [rightCBOuterX, cbHeightY, spaceDimZ_R]]}
                    color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                  />
                  <NativeLine name="dimension_line"
                    points={createArrowHead([rightCBOuterX, 0, spaceDimZ_R], [rightCBOuterX, 0.05, spaceDimZ_R])}
                    color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                  />
                  <NativeLine name="dimension_line"
                    points={createArrowHead([rightCBOuterX, cbHeightY, spaceDimZ_R], [rightCBOuterX, cbHeightY - 0.05, spaceDimZ_R])}
                    color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                  />
                  <Text renderOrder={100001} depthTest={false}
                    position={[rightCBOuterX + mmToThreeUnits(10), cbMidY, spaceTextZ_R]}
                    fontSize={largeFontSize} color={textColor}
                    anchorX="left" anchorY="middle"
                    outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                  >
                    {cbTotalH_R}
                  </Text>
                </>);
              })()}

              {/* ── 1단(안쪽): 받침대/가구높이/상단몰딩 분해 (가구가 배치된 경우만 표시) ── */}
              {rightmostMod && (<>
              {/* 세로 메인 라인: 바닥마감재 위 ~ effectiveCeiling */}
              {rHasDualCabinet ? (
                <>
                  <NativeLine name="dimension_line"
                    points={[[rightInnerX, rFloorFinishBaseY, lowerDimZ_R], [rightInnerX, rFurnitureTopY, lowerDimZ_R]]}
                    color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                  />
                  <NativeLine name="dimension_line"
                    points={[[rightInnerX, rUpperCabinetBottomY, upperDimZ_R], [rightInnerX, rEffectiveCeilingY, upperDimZ_R]]}
                    color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                  />
                </>
              ) : (
                <NativeLine name="dimension_line"
                  points={[[rightInnerX, rFloorFinishBaseY, bodyDimZ_R], [rightInnerX, rEffectiveCeilingY, bodyDimZ_R]]}
                  color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                />
              )}
              <NativeLine name="dimension_line"
                points={createArrowHead([rightInnerX, rFloorFinishBaseY, baseDimZ_R], [rightInnerX, rFloorFinishBaseY + 0.05, baseDimZ_R])}
                color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
              />
              <NativeLine name="dimension_line"
                points={createArrowHead([rightInnerX, rEffectiveCeilingY, topDimZ_R], [rightInnerX, rEffectiveCeilingY - 0.05, topDimZ_R])}
                color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
              />

              {/* 받침대 구분 틱 & 치수 (하부장/키큰장) 또는 빈공간 (상부장) */}
              {rHasDualCabinet ? (
                /* 상하부장 동시배치: 받침대 높이 */
                rBottomFrameH > 0 && (
                  <>
                    <NativeLine name="dimension_line"
                      points={[[rightInnerX - mmToThreeUnits(15), rBottomFrameTopY, baseDimZ_R], [rightInnerX + mmToThreeUnits(15), rBottomFrameTopY, baseDimZ_R]]}
                      color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                    />
                    {rBottomFrameGapH > 0 && (
                      <>
                        <NativeLine name="dimension_line"
                          points={[[rightInnerX - mmToThreeUnits(15), rBottomFrameGapTopY, baseDimZ_R], [rightInnerX + mmToThreeUnits(15), rBottomFrameGapTopY, baseDimZ_R]]}
                          color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                        />
                        <NativeLine name="dimension_line"
                          points={[[rightWallX, rBottomFrameGapTopY, baseExtZ_R], [rightInnerX + mmToThreeUnits(20), rBottomFrameGapTopY, baseExtZ_R]]}
                          color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                        />
                      </>
                    )}
                    {rBottomFrameSegments.map(seg => (
                      <Text key={`right-dual-base-${seg.key}`} renderOrder={100001} depthTest={false}
                        position={[rightInnerX + mmToThreeUnits(seg.key === 'gap' ? 30 : 10), (seg.bottomY + seg.topY) / 2, baseTextZ_R]}
                        fontSize={baseFontSize} color={textColor} anchorX="left" anchorY="middle"
                        outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                      >
                        {Math.round(seg.heightMm)}
                      </Text>
                    ))}
                  </>
                )
              ) : rIsUpperCategory ? (
                /* 상부장: 바닥마감재 위 ~ 가구 하단 = 빈공간 */
                rBottomFrameTopY > rFloorFinishBaseY + 0.001 && (
                  <>
                    <NativeLine name="dimension_line"
                      points={[[rightInnerX - mmToThreeUnits(15), rBottomFrameTopY, baseDimZ_R], [rightInnerX + mmToThreeUnits(15), rBottomFrameTopY, baseDimZ_R]]}
                      color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                    />
                    <Text renderOrder={100001} depthTest={false}
                      position={[rightInnerX + mmToThreeUnits(10), (rFloorFinishBaseY + rBottomFrameTopY) / 2, baseTextZ_R]}
                      fontSize={baseFontSize} color={textColor} anchorX="left" anchorY="middle"
                      outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                    >
                      {Math.round(rEffectiveH - rActualTopClearance - rFurnitureH - rFloorFinishForHeight)}
                    </Text>
                  </>
                )
              ) : (
                /* 하부장/키큰장: 받침대 높이 */
                rBottomFrameH > 0 && (
                  <>
                    <NativeLine name="dimension_line"
                      points={[[rightInnerX - mmToThreeUnits(15), rBottomFrameTopY, baseDimZ_R], [rightInnerX + mmToThreeUnits(15), rBottomFrameTopY, baseDimZ_R]]}
                      color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                    />
                    {rBottomFrameGapH > 0 && (
                      <>
                        <NativeLine name="dimension_line"
                          points={[[rightInnerX - mmToThreeUnits(15), rBottomFrameGapTopY, baseDimZ_R], [rightInnerX + mmToThreeUnits(15), rBottomFrameGapTopY, baseDimZ_R]]}
                          color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                        />
                        <NativeLine name="dimension_line"
                          points={[[rightWallX, rBottomFrameGapTopY, baseExtZ_R], [rightInnerX + mmToThreeUnits(20), rBottomFrameGapTopY, baseExtZ_R]]}
                          color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                        />
                      </>
                    )}
                    {rBottomFrameSegments.map(seg => (
                      <Text key={`right-base-${seg.key}`} renderOrder={100001} depthTest={false}
                        position={[rightInnerX + mmToThreeUnits(seg.key === 'gap' ? 30 : 10), (seg.bottomY + seg.topY) / 2, baseTextZ_R]}
                        fontSize={baseFontSize} color={textColor} anchorX="left" anchorY="middle"
                        outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                      >
                        {Math.round(seg.heightMm)}
                      </Text>
                    ))}
                  </>
                )
              )}

              {/* 가구(내경) 높이 — 상하부장 동시배치 / 섹션 분할 / 단일 표시 */}
              {rHasDualCabinet ? (
                <>
                  {/* 하부장 높이 */}
                  <NativeLine name="dimension_line"
                    points={[[rightInnerX - mmToThreeUnits(15), rLowerCabinetBodyTopY, lowerDimZ_R], [rightInnerX + mmToThreeUnits(15), rLowerCabinetBodyTopY, lowerDimZ_R]]}
                    color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                  />
                  <Text renderOrder={100001} depthTest={false}
                    position={[rightInnerX + mmToThreeUnits(10), (rBottomFrameTopY + rLowerCabinetBodyTopY) / 2, lowerTextZ_R]}
                    fontSize={baseFontSize} color={textColor} anchorX="left" anchorY="middle"
                    outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                  >
                    {rLowerCabinetH}
                  </Text>
                  {rLowerCountertopH > 0 && (
                    <>
                      <NativeLine name="dimension_line"
                        points={[[rightInnerX - mmToThreeUnits(15), rFurnitureTopY, lowerDimZ_R], [rightInnerX + mmToThreeUnits(15), rFurnitureTopY, lowerDimZ_R]]}
                        color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                      />
                      <NativeLine name="dimension_line"
                        points={[[rightWallX, rLowerCabinetBodyTopY, lowerExtZ_R], [rightInnerX + mmToThreeUnits(20), rLowerCabinetBodyTopY, lowerExtZ_R]]}
                        color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                      />
                      <Text renderOrder={100001} depthTest={false}
                        position={[rightInnerX + mmToThreeUnits(10), (rLowerCabinetBodyTopY + rFurnitureTopY) / 2, lowerTextZ_R]}
                        fontSize={baseFontSize} color={textColor} anchorX="left" anchorY="middle"
                        outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                      >
                        {rLowerCountertopH}
                      </Text>
                    </>
                  )}
                  {/* 중간 빈공간 (있는 경우) — 클릭 편집 가능 (상부장 하단 확장) */}
                  {rMiddleGapH > 0 && (() => {
                    const rUpperMod = rightCategoryResolved === 'upper' ? rightmostMod : rightCompanionMod;
                    const currentRUpperH = rUpperCabinetBodyH;
                    return (
                      <>
                        <NativeLine name="dimension_line"
                          points={[[rightInnerX - mmToThreeUnits(15), rUpperCabinetBottomY, upperDimZ_R], [rightInnerX + mmToThreeUnits(15), rUpperCabinetBottomY, upperDimZ_R]]}
                          color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                        />
                        <Text renderOrder={100001} depthTest={false}
                          position={[rightInnerX + mmToThreeUnits(10), (rFurnitureTopY + rUpperCabinetBottomY) / 2, upperTextZ_R]}
                          fontSize={baseFontSize} color={textColor} anchorX="left" anchorY="middle"
                          outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                        >
                          {rMiddleGapH}
                        </Text>
                        {rUpperMod && !spaceInfo?.customGuideMode && (
                          <Html
                            position={[rightInnerX + mmToThreeUnits(10), (rFurnitureTopY + rUpperCabinetBottomY) / 2, 0.02]}
                            center
                            zIndexRange={[200, 0]}
                            style={{ pointerEvents: 'auto', userSelect: 'none' }}
                          >
                            <MidwayGapEditor
                              value={rMiddleGapH}
                              color={textColor}
                              isDark={currentViewDirection !== '3D' && view2DTheme === 'dark'}
                              onChange={(newGap) => {
                                // 좌/우/모든 상부 가구 연동
                                applyMidwayGapToAllUppers(rMiddleGapH, newGap);
                              }}
                            />
                          </Html>
                        )}
                      </>
                    );
                  })()}
                  {/* 상부장 높이 */}
                  <NativeLine name="dimension_line"
                    points={[[rightInnerX - mmToThreeUnits(15), rUpperCabinetTopY, upperDimZ_R], [rightInnerX + mmToThreeUnits(15), rUpperCabinetTopY, upperDimZ_R]]}
                    color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                  />
                  {rUpperCabinetBottomEpH > 0 && (
                    <NativeLine name="dimension_line"
                      points={[[rightWallX, rUpperCabinetBodyBottomY, upperDimZ_R], [rightInnerX + mmToThreeUnits(20), rUpperCabinetBodyBottomY, upperDimZ_R]]}
                      color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                    />
                  )}
                  <Text renderOrder={100001} depthTest={false}
                    position={[rightInnerX + mmToThreeUnits(10), (rUpperCabinetBodyBottomY + rUpperCabinetTopY) / 2, upperTextZ_R]}
                    fontSize={baseFontSize} color={textColor} anchorX="left" anchorY="middle"
                    outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                  >
                    {rUpperCabinetBodyH}
                  </Text>
                  {rUpperCabinetBottomEpH > 0 && (
                    <Text renderOrder={100001} depthTest={false}
                      position={[rightInnerX + mmToThreeUnits(10), (rUpperCabinetBottomY + rUpperCabinetBodyBottomY) / 2, upperTextZ_R]}
                      fontSize={baseFontSize} color={textColor} anchorX="left" anchorY="middle"
                      outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                    >
                      {rUpperCabinetBottomEpH}
                    </Text>
                  )}
                </>
              ) : rHasSectionSplit ? (
                <>
                  {/* 섹션별 구분 틱 & 치수 (하부→상부 순서) */}
                  {rSectionHeights.map((secH, idx) => {
                    const secBottomMm = rFloorFinishForHeight + rBottomFrameH + rSectionHeights.slice(0, idx).reduce((a, b) => a + b, 0);
                    const secTopMm = secBottomMm + secH;
                    const secBottomY = mmToThreeUnits(secBottomMm);
                    const secTopY = mmToThreeUnits(secTopMm);
                    return (
                      <React.Fragment key={`right-sec-${idx}`}>
                        {/* 섹션 상단 구분 틱 */}
                        <NativeLine name="dimension_line"
                          points={[[rightInnerX - mmToThreeUnits(15), secTopY, bodyDimZ_R], [rightInnerX + mmToThreeUnits(15), secTopY, bodyDimZ_R]]}
                          color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                        />
                        {/* 섹션 높이 텍스트 */}
                        <Text renderOrder={100001} depthTest={false}
                          position={[rightInnerX + mmToThreeUnits(10), (secBottomY + secTopY) / 2, bodyTextZ_R]}
                          fontSize={baseFontSize} color={textColor} anchorX="left" anchorY="middle"
                          outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                        >
                          {secH}
                        </Text>
                        {/* 섹션 경계 연장선 */}
                        {idx < rSectionHeights.length - 1 && (
                          <NativeLine name="dimension_line"
                            points={[[rightWallX, secTopY, bodyExtZ_R], [rightInnerX + mmToThreeUnits(20), secTopY, bodyExtZ_R]]}
                            color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                          />
                        )}
                      </React.Fragment>
                    );
                  })}
                </>
              ) : (
                <>
                  {/* 단일 내경 높이 표시
                      - 상부장: 본체 H(rFurnitureH)와 하부 EP(18mm)를 별도 치수로 분리 표시
                      - 그 외: 단일 치수 */}
                  <NativeLine name="dimension_line"
                    points={[[rightInnerX - mmToThreeUnits(15), rFurnitureTopY, bodyDimZ_R], [rightInnerX + mmToThreeUnits(15), rFurnitureTopY, bodyDimZ_R]]}
                    color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                  />
                  {rightCategoryResolved === 'upper' ? (() => {
                    const hasBottomEPRight = (() => {
                      const rm = rightmostMod as any;
                      return rm?.hasBottomEndPanel !== false;
                    })();
                    const rBodyBottomY = hasBottomEPRight
                      ? rBottomFrameTopY + mmToThreeUnits(R_UPPER_BOTTOM_FINISH_MM)
                      : rBottomFrameTopY;
                    return (
                      <>
                        <Text renderOrder={100001} depthTest={false}
                          position={[rightInnerX + mmToThreeUnits(10), (rBodyBottomY + rFurnitureTopY) / 2, bodyTextZ_R]}
                          fontSize={baseFontSize} color={textColor} anchorX="left" anchorY="middle"
                          outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                        >
                          {rFurnitureH}
                        </Text>
                        {hasBottomEPRight && (
                          <>
                            <NativeLine name="dimension_line"
                              points={[[rightWallX, rBodyBottomY, bodyDimZ_R], [rightInnerX + mmToThreeUnits(20), rBodyBottomY, bodyDimZ_R]]}
                              color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                            />
                            <Text renderOrder={100001} depthTest={false}
                              position={[rightInnerX + mmToThreeUnits(10), (rBottomFrameTopY + rBodyBottomY) / 2, bodyTextZ_R]}
                              fontSize={baseFontSize} color={textColor} anchorX="left" anchorY="middle"
                              outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                            >
                              {R_UPPER_BOTTOM_FINISH_MM}
                            </Text>
                          </>
                        )}
                      </>
                    );
                  })() : (
                    <>
                      <Text renderOrder={100001} depthTest={false}
                        position={[rightInnerX + mmToThreeUnits(10), (rBottomFrameTopY + rFurnitureTopY) / 2, bodyTextZ_R]}
                        fontSize={baseFontSize} color={textColor} anchorX="left" anchorY="middle"
                        outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                      >
                        {rFurnitureH}
                      </Text>
                      {rSingleLowerCountertopH > 0 && (
                        <>
                          <NativeLine name="dimension_line"
                            points={[[rightInnerX - mmToThreeUnits(15), rSingleLowerCountertopTopY, bodyDimZ_R], [rightInnerX + mmToThreeUnits(15), rSingleLowerCountertopTopY, bodyDimZ_R]]}
                            color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                          />
                          <NativeLine name="dimension_line"
                            points={[[rightWallX, rFurnitureTopY, bodyExtZ_R], [rightInnerX + mmToThreeUnits(20), rFurnitureTopY, bodyExtZ_R]]}
                            color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                          />
                          <Text renderOrder={100001} depthTest={false}
                            position={[rightInnerX + mmToThreeUnits(10), (rFurnitureTopY + rSingleLowerCountertopTopY) / 2, bodyTextZ_R]}
                            fontSize={baseFontSize} color={textColor} anchorX="left" anchorY="middle"
                            outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                          >
                            {rSingleLowerCountertopH}
                          </Text>
                        </>
                      )}
                    </>
                  )}
                </>
              )}

              {/* 상단몰딩/상단갭 구분 틱 & 치수 — 좌측과 동일하게 표시 */}
              {(() => {
                const rIsShelfSplitTopDim = !!rightmostMod?.moduleId?.includes('shelf-split') && rSectionHeights.length >= 2;
                const userTopGap = topRefMod_R?.hasTopFrame === false
                  ? Math.max(0, Math.round(topRefMod_R?.topFrameGap ?? 0))
                  : 0;
                const displayTopFrame = topRefMod_R?.hasTopFrame === false
                  ? userTopGap
                  : Math.max(0, Math.round(rActualTopSize));
                if (displayTopFrame <= 0) return null;
                const topGapH = topRefMod_R?.hasTopFrame === false
                  ? 0
                  : Math.max(0, Math.min(displayTopFrame, Math.round(topRefMod_R?.topFrameGap ?? 0)));
                const visibleTopFrameH = Math.max(0, displayTopFrame - topGapH);
                const rSingleLowerTopRef = rSingleLowerCountertopH > 0 ? rSingleLowerCountertopTopY : rFurnitureTopY;
                const rSectionSplitTopRef = rHasSectionSplit
                  ? mmToThreeUnits(rFloorFinishForHeight + rBottomFrameH + rSectionHeights.reduce((sum, h) => sum + h, 0))
                  : rSingleLowerTopRef;
                const topFrameBottomRef = topRefMod_R?.hasTopFrame === false
                  ? rEffectiveCeilingY - mmToThreeUnits(userTopGap)
                  : (rIsShelfSplitTopDim ? rEffectiveCeilingY - mmToThreeUnits(displayTopFrame) : (rHasDualCabinet ? rUpperCabinetTopY : rSectionSplitTopRef));
                const topGapBottomRef = rEffectiveCeilingY - mmToThreeUnits(topGapH);
                const topFrameSegments = topGapH > 0
                  ? [
                    { key: 'frame', bottomY: topFrameBottomRef, topY: topGapBottomRef, heightMm: visibleTopFrameH },
                    { key: 'gap', bottomY: topGapBottomRef, topY: rEffectiveCeilingY, heightMm: topGapH },
                  ].filter(seg => seg.heightMm > 0)
                  : [{ key: 'frame', bottomY: topFrameBottomRef, topY: rEffectiveCeilingY, heightMm: displayTopFrame }];
                return (
                  <>
                    <NativeLine name="dimension_line"
                      points={[[rightInnerX, topFrameBottomRef, frontViewLocalZ(upperFrontZ_R ?? lowerFrontZ_R, 0.003)], [rightInnerX, rEffectiveCeilingY, frontViewLocalZ(upperFrontZ_R ?? lowerFrontZ_R, 0.003)]]}
                      color={frameDimensionColor} lineWidth={0.8} renderOrder={100002} depthTest={false}
                    />
                    <NativeLine name="dimension_line"
                      points={[[rightInnerX - mmToThreeUnits(15), rEffectiveCeilingY, topDimZ_R], [rightInnerX + mmToThreeUnits(15), rEffectiveCeilingY, topDimZ_R]]}
                      color={frameDimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                    />
                    <NativeLine name="dimension_line"
                      points={[[rightInnerX - mmToThreeUnits(15), topFrameBottomRef, topDimZ_R], [rightInnerX + mmToThreeUnits(15), topFrameBottomRef, topDimZ_R]]}
                      color={frameDimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                    />
                    {topGapH > 0 && (
                      <NativeLine name="dimension_line"
                        points={[[rightInnerX - mmToThreeUnits(15), topGapBottomRef, topDimZ_R], [rightInnerX + mmToThreeUnits(15), topGapBottomRef, topDimZ_R]]}
                        color={frameDimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                      />
                    )}
                    <NativeLine name="dimension_line"
                      points={[[rightWallX, rEffectiveCeilingY, frontViewLocalZ(upperFrontZ_R ?? lowerFrontZ_R, 0.003)], [rightInnerX + mmToThreeUnits(20), rEffectiveCeilingY, frontViewLocalZ(upperFrontZ_R ?? lowerFrontZ_R, 0.003)]]}
                      color={frameDimensionColor} lineWidth={0.6} renderOrder={100002} depthTest={false}
                    />
                    <NativeLine name="dimension_line"
                      points={[[rightWallX, topFrameBottomRef, frontViewLocalZ(upperFrontZ_R ?? lowerFrontZ_R, 0.003)], [rightInnerX + mmToThreeUnits(20), topFrameBottomRef, frontViewLocalZ(upperFrontZ_R ?? lowerFrontZ_R, 0.003)]]}
                      color={frameDimensionColor} lineWidth={0.6} renderOrder={100002} depthTest={false}
                    />
                    {topFrameSegments.map(seg => (
                      <Text key={`right-top-${seg.key}`} renderOrder={100001} depthTest={false}
                        position={[rightInnerX + mmToThreeUnits(seg.key === 'gap' ? 30 : 10), (seg.bottomY + seg.topY) / 2, topTextZ_R]}
                        fontSize={baseFontSize} color={frameDimensionColor} anchorX="left" anchorY="middle"
                        outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                      >
                        {Math.round(seg.heightMm)}
                      </Text>
                    ))}
                  </>
                );
              })()}
              </>)}

              {/* 커튼박스(droppedCeiling) 구간 치수는 표시하지 않음 */}

              {/* ── 연장선: 각 경계점에서 수평선 ── */}
              {/* 바닥(Y=0) — 커튼박스 있으면 3단까지 연장 */}
              <NativeLine name="dimension_line"
                points={[[rightWallX, 0, spaceExtZ_R], [(hasCB_R ? rightCBOuterX : rightOuterX) + mmToThreeUnits(20), 0, spaceExtZ_R]]}
                color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
              />
              {/* 단내림 천장 연장선 (단내림이 우측에 있을 때) */}
              {isRightDrop && dropHeight > 0 && (
                <NativeLine name="dimension_line"
                  points={[[rightWallX, rEffectiveCeilingY, spaceExtZ_R], [rightOuterX + mmToThreeUnits(20), rEffectiveCeilingY, spaceExtZ_R]]}
                  color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                />
              )}
              {/* 공간 천장(spaceHeight) 연장선 — 커튼박스 있으면 3단까지 */}
              <NativeLine name="dimension_line"
                points={[[rightWallX, spaceHeight, spaceExtZ_R], [(hasCB_R ? rightCBOuterX : rightOuterX) + mmToThreeUnits(20), spaceHeight, spaceExtZ_R]]}
                color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
              />
              {/* 커튼박스 천장 연장선 */}
              {hasCB_R && (
                <NativeLine name="dimension_line"
                  points={[[rightWallX, mmToThreeUnits(cbTotalH_R), spaceExtZ_R], [rightCBOuterX + mmToThreeUnits(20), mmToThreeUnits(cbTotalH_R), spaceExtZ_R]]}
                  color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                />
              )}
              {/* 받침대 상단 또는 상부장 하단 경계 (가구 있을 때만) */}
              {rightmostMod && (rIsUpperCategory ? (rBottomFrameTopY > rFloorFinishBaseY + 0.001) : (rBottomFrameH > 0)) && (
                <NativeLine name="dimension_line"
                  points={[[rightWallX, rBottomFrameTopY, baseExtZ_R], [rightInnerX + mmToThreeUnits(20), rBottomFrameTopY, baseExtZ_R]]}
                  color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                />
              )}
              {/* 가구(내경) 상단 = 하부장 상단 (가구 있을 때만) */}
              {rightmostMod && (
                <NativeLine name="dimension_line"
                  points={[[rightWallX, rFurnitureTopY, bodyExtZ_R], [rightInnerX + mmToThreeUnits(20), rFurnitureTopY, bodyExtZ_R]]}
                  color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                />
              )}
              {/* 듀얼: 상부장 하단 경계 연장선 */}
              {rHasDualCabinet && rUpperCabinetBottomY > rFurnitureTopY + 0.001 && (
                <NativeLine name="dimension_line"
                  points={[[rightWallX, rUpperCabinetBottomY, upperExtZ_R], [rightInnerX + mmToThreeUnits(20), rUpperCabinetBottomY, upperExtZ_R]]}
                  color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                />
              )}
              {/* 듀얼: 상부장 상단 경계 연장선 */}
              {rHasDualCabinet && (
                <NativeLine name="dimension_line"
                  points={[[rightWallX, rUpperCabinetTopY, upperExtZ_R], [rightInnerX + mmToThreeUnits(20), rUpperCabinetTopY, upperExtZ_R]]}
                  color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                />
              )}
            </>
          );
        })()}
      </group>}

      {/* 커스텀 가구 섹션별 높이 치수선 (설계모드 - 가구 좌측) */}
      {showDimensions && isLayoutBuilderOpen && (
      <group>
        {(() => {
          // 배치된 커스텀 가구 찾기
          const customModule = placedModules.find(m => m.moduleId.startsWith('customizable-') && m.customConfig?.sections?.length);
          if (!customModule || !customModule.customConfig) return null;

          const { sections: rawSections, panelThickness: pt } = customModule.customConfig;
          const panelThickness = pt ?? 18;

          // 가구 너비 (좌측 위치 계산용)
          const furnitureWidth = customModule.customWidth || customModule.adjustedWidth || customModule.moduleWidth || 450;
          const furnitureLeftX = customModule.position.x - mmToThreeUnits(furnitureWidth / 2);
          const dimLineX = furnitureLeftX - mmToThreeUnits(120); // 가구 좌측에서 120mm 왼쪽

          // 가구 하단 Y 계산 (기존 우측 치수선 로직과 동일)
          // 바닥판 올림(bottomPanelRaise) 활성 시 조절발 높이를 0으로 (FurnitureItem과 동일)
          const configSections = customModule.customConfig.sections;
          const bottomRaiseActive = configSections?.[0]?.bottomPanelRaise && configSections[0].bottomPanelRaise > 0;
          const isFloating = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
          const floatHeight = isFloating ? (spaceInfo.baseConfig?.floatHeight || 0) : 0;
          const bottomFrameHeight = bottomRaiseActive ? 0 : (spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height || 65) : 0);
          const furnitureBaseY = isFloating ? mmToThreeUnits(floatHeight) : mmToThreeUnits(bottomFrameHeight);

          // 섹션 높이 보정 (CustomizableBoxModule과 동일한 로직)
          // 가구 전체 외경 높이에 맞게 상부(마지막) 섹션 높이를 조정
          const furnitureHeight = customModule.customConfig.totalHeight
            || customModule.freeHeight
            || customModule.customHeight
            || customModule.moduleHeight
            || (spaceInfo.height - (spaceInfo.frameSize?.top ?? 30) - bottomFrameHeight);
          let sections = rawSections;
          if (rawSections.length >= 2) {
            const outerSum = rawSections.reduce((sum: number, s: any) => {
              const pc = (s.showBottomPanel !== false ? 1 : 0) + (s.showTopPanel !== false ? 1 : 0);
              return sum + s.height + pc * panelThickness;
            }, 0);
            if (Math.abs(outerSum - furnitureHeight) > 1) {
              const lastIdx = rawSections.length - 1;
              const fixedOuter = rawSections.slice(0, lastIdx).reduce((sum: number, s: any) => {
                const pc = (s.showBottomPanel !== false ? 1 : 0) + (s.showTopPanel !== false ? 1 : 0);
                return sum + s.height + pc * panelThickness;
              }, 0);
              const lastPc = (rawSections[lastIdx].showBottomPanel !== false ? 1 : 0) + (rawSections[lastIdx].showTopPanel !== false ? 1 : 0);
              const newLastInner = furnitureHeight - fixedOuter - lastPc * panelThickness;
              if (newLastInner > 0) {
                sections = rawSections.map((s: any, i: number) => i === lastIdx ? { ...s, height: Math.round(newLastInner) } : s);
              }
            }
          }

          // 각 섹션의 외경 Y 범위 계산
          // 물리 구조 (아래→위): 하판(pt) → section[0] 내경 → 칸막이(pt) → section[1] 내경 → 상판(pt)
          const sectionRanges: { startY: number; endY: number; heightMm: number }[] = [];
          const sectionGap = customModule.customConfig.sectionGap ?? 0;
          const ptUnits = mmToThreeUnits(panelThickness);
          // 바닥판 올림 시 조절발 높이만큼 측판이 아래로 확장됨
          const baseHeightMmForExt = spaceInfo.baseConfig?.height || 65;

          // 각 섹션의 내경 시작 Y 위치를 먼저 누적 계산
          let internalY = furnitureBaseY + ptUnits; // 하판 상단 = section[0] 내경 하단
          sections.forEach((section: any, i: number) => {
            const internalH = mmToThreeUnits(section.height);
            // 외경 하단: 이 섹션 아래의 패널 하단
            let outerStartY = internalY - ptUnits;
            // 외경 상단: 이 섹션 위의 패널 상단
            const outerEndY = internalY + internalH + ptUnits;
            // 외경 높이 (mm)
            let outerH = section.height + 2 * panelThickness;

            // 바닥판 올림 시 하부 섹션(i===0): 측판이 조절발 높이만큼 확장 → 치수에 포함
            if (i === 0 && bottomRaiseActive) {
              outerStartY = outerStartY - mmToThreeUnits(baseHeightMmForExt);
              outerH = outerH + baseHeightMmForExt;
            }

            sectionRanges.push({ startY: outerStartY, endY: outerEndY, heightMm: Math.round(outerH) });
            // 다음 섹션 내경 시작: 현재 상판 + 다음 하판 (독립 박스이므로 패널 2개)
            if (i < sections.length - 1) {
              internalY = internalY + internalH + ptUnits + ptUnits + mmToThreeUnits(sectionGap);
            }
          });

          // 연장선 왼쪽 끝
          const extLineLeftX = dimLineX - mmToThreeUnits(20);

          // 가구 중심 X 및 우측 X (폭 치수용)
          const furnitureCenterX = customModule.position.x;
          const furnitureRightX = furnitureCenterX + mmToThreeUnits(furnitureWidth / 2);

          // horizontalSplit이 있는 섹션의 폭 치수 데이터 계산
          // 하부 섹션(아래쪽 절반) → 가구 아래에, 상부 섹션(위쪽 절반) → 가구 위에 표시
          const widthDimSections: { sectionIdx: number; dimY: number; isAbove: boolean; anchorY: number; boxes: { startX: number; endX: number; widthMm: number }[] }[] = [];
          const lastSectionIdx = sections.length - 1;
          let bottomRowIndex = 0; // 아래로 누적되는 줄 번호
          let topRowIndex = 0;    // 위로 누적되는 줄 번호
          // 가구 전체 외경 상단 Y
          const furnitureTopY = sectionRanges.length > 0 ? sectionRanges[sectionRanges.length - 1].endY : furnitureBaseY;

          sections.forEach((section: any, i: number) => {
            const hs = section.horizontalSplit;
            if (!hs) return;

            // 섹션 내경 너비 (mm) = 가구 전체 외경 너비 - 좌우 패널 2개
            const sectionInnerWMm = furnitureWidth - 2 * panelThickness;
            const leftInnerWMm = hs.position;
            const is3Split = hs.secondPosition !== undefined && hs.secondPosition > 0;
            const leftOuterWMm = leftInnerWMm + 2 * panelThickness;

            let centerInnerWMm = 0;
            let centerOuterWMm = 0;
            if (is3Split) {
              centerInnerWMm = hs.secondPosition!;
              centerOuterWMm = centerInnerWMm + 2 * panelThickness;
            }

            const rightInnerWMm = is3Split
              ? sectionInnerWMm - leftInnerWMm - centerInnerWMm - 4 * panelThickness
              : sectionInnerWMm - leftInnerWMm - 2 * panelThickness;
            const rightOuterWMm = rightInnerWMm + 2 * panelThickness;

            // 박스 X 위치 계산 (가구 좌측 외경 기준)
            const boxes: { startX: number; endX: number; widthMm: number }[] = [];
            let curX = furnitureLeftX;
            boxes.push({ startX: curX, endX: curX + mmToThreeUnits(leftOuterWMm), widthMm: Math.round(leftOuterWMm) });
            curX += mmToThreeUnits(leftOuterWMm);
            if (is3Split) {
              boxes.push({ startX: curX, endX: curX + mmToThreeUnits(centerOuterWMm), widthMm: Math.round(centerOuterWMm) });
              curX += mmToThreeUnits(centerOuterWMm);
            }
            boxes.push({ startX: curX, endX: curX + mmToThreeUnits(rightOuterWMm), widthMm: Math.round(rightOuterWMm) });

            // 하부 섹션 → 가구 아래, 상부 섹션 → 가구 위
            const isAbove = i > lastSectionIdx / 2; // 상부 절반은 위에 표시
            if (isAbove) {
              const wDimY = furnitureTopY + mmToThreeUnits(80 + topRowIndex * 80);
              widthDimSections.push({ sectionIdx: i, dimY: wDimY, isAbove: true, anchorY: furnitureTopY, boxes });
              topRowIndex++;
            } else {
              const wDimY = -mmToThreeUnits(80 + bottomRowIndex * 80);
              widthDimSections.push({ sectionIdx: i, dimY: wDimY, isAbove: false, anchorY: 0, boxes });
              bottomRowIndex++;
            }
          });

          // 공통 데이터: 조절발/상단몰딩
          const footHeightMm = bottomRaiseActive ? 0 : (spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height || 65) : 0);
          const topFrameMm = spaceInfo.frameSize?.top ?? 30;
          const floorFinishMm = (spaceInfo.hasFloorFinish && spaceInfo.floorFinish) ? spaceInfo.floorFinish.height : 0;
          const floorFinishYDim = mmToThreeUnits(floorFinishMm);

          // 좌/우 공통 세그먼트 생성 헬퍼
          const buildAllSegments = (baseSegments: { startY: number; endY: number; heightMm: number }[]) => {
            const all: { startY: number; endY: number; heightMm: number }[] = [];
            // 1) 조절발
            if (footHeightMm > 0) {
              all.push({ startY: floorFinishYDim, endY: furnitureBaseY, heightMm: Math.round(footHeightMm) });
            }
            // 2) 섹션 세그먼트
            baseSegments.forEach(seg => all.push(seg));
            // 3) 상단몰딩
            if (topFrameMm > 0) {
              const topStart = baseSegments.length > 0 ? baseSegments[baseSegments.length - 1].endY : furnitureBaseY;
              const topEnd = topStart + mmToThreeUnits(topFrameMm);
              all.push({ startY: topStart, endY: topEnd, heightMm: Math.round(topFrameMm) });
            }
            return all;
          };

          const leftAllSegments = buildAllSegments(sectionRanges);

          return (
            <>
              {leftAllSegments.map((range, idx) => (
                <group key={`custom-section-dim-${idx}`}>
                  {/* 수직 치수선 */}
                  <NativeLine name="dimension_line"
                    points={[[dimLineX, range.startY, 0.002], [dimLineX, range.endY, 0.002]]}
                    color={dimensionColor}
                    lineWidth={0.6}
                    renderOrder={100000}
                    depthTest={false}
                  />
                  {/* 하단 틱 마크 */}
                  <NativeLine name="dimension_line"
                    points={createArrowHead([dimLineX, range.startY, 0.002], [dimLineX, range.startY - 0.015, 0.002])}
                    color={dimensionColor}
                    lineWidth={0.6}
                    renderOrder={100000}
                    depthTest={false}
                  />
                  {/* 상단 틱 마크 */}
                  <NativeLine name="dimension_line"
                    points={createArrowHead([dimLineX, range.endY, 0.002], [dimLineX, range.endY + 0.015, 0.002])}
                    color={dimensionColor}
                    lineWidth={0.6}
                    renderOrder={100000}
                    depthTest={false}
                  />
                  {/* 하단 보조 연장선 */}
                  <NativeLine name="dimension_line"
                    points={[[furnitureLeftX, range.startY, 0.001], [extLineLeftX, range.startY, 0.001]]}
                    color={dimensionColor}
                    lineWidth={0.3}
                    renderOrder={100000}
                    depthTest={false}
                  />
                  {/* 상단 보조 연장선 */}
                  <NativeLine name="dimension_line"
                    points={[[furnitureLeftX, range.endY, 0.001], [extLineLeftX, range.endY, 0.001]]}
                    color={dimensionColor}
                    lineWidth={0.3}
                    renderOrder={100000}
                    depthTest={false}
                  />
                  {/* 치수 텍스트 */}
                  <Text
                    renderOrder={100001}
                    depthTest={false}
                    position={[dimLineX - mmToThreeUnits(60), (range.startY + range.endY) / 2, 0.01]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                    rotation={[0, 0, Math.PI / 2]}
                  >
                    {range.heightMm}
                  </Text>
                </group>
              ))}

              {/* 우측 섹션 높이 치수선 (가구 우측) — 조절발/상단몰딩/서브분할/바닥판올림 반영 */}
              {(() => {
                const dimLineRightX = furnitureRightX + mmToThreeUnits(120);
                const extLineRightX = dimLineRightX + mmToThreeUnits(20);

                // 각 섹션에 대해 서브분할/바닥판올림이 있으면 분할된 높이 구간 목록, 없으면 전체 하나
                const rightSegments: { startY: number; endY: number; heightMm: number }[] = [];
                sectionRanges.forEach((range, idx) => {
                  const section = sections[idx] as any;
                  // areaSubSplits에서 활성화된 서브분할 찾기 (어느 영역이든)
                  const subSplits = section.areaSubSplits;
                  let activeSub: any = null;
                  if (subSplits) {
                    for (const key of ['right', 'left', 'center', 'full']) {
                      if (subSplits[key]?.enabled) {
                        activeSub = subSplits[key];
                        break;
                      }
                    }
                  }

                  // 바닥판 올림 확인 (첫 번째 섹션만, 영역별 areaFinish 포함)
                  let maxBottomRaiseMm = 0;
                  if (idx === 0) {
                    if (section.bottomPanelRaise && section.bottomPanelRaise > 0) {
                      maxBottomRaiseMm = section.bottomPanelRaise;
                    }
                    if (section.areaFinish) {
                      for (const key of ['left', 'right', 'center', 'full']) {
                        const areaRaise = section.areaFinish[key]?.bottomPanelRaise;
                        if (areaRaise && areaRaise > maxBottomRaiseMm) {
                          maxBottomRaiseMm = areaRaise;
                        }
                      }
                    }
                  }

                  if (activeSub) {
                    const ratio = activeSub.lowerHeight / section.height;
                    const totalY = range.endY - range.startY;
                    const lowerY = totalY * ratio;
                    const splitY = range.startY + lowerY;
                    const lowerMm = Math.round(range.heightMm * ratio);
                    const upperMm = range.heightMm - lowerMm;
                    rightSegments.push({ startY: range.startY, endY: splitY, heightMm: lowerMm });
                    rightSegments.push({ startY: splitY, endY: range.endY, heightMm: upperMm });
                  } else if (maxBottomRaiseMm > 0) {
                    const totalYRange = range.endY - range.startY;
                    const raiseRatio = maxBottomRaiseMm / range.heightMm;
                    const raiseY = totalYRange * raiseRatio;
                    const splitY = range.startY + raiseY;
                    rightSegments.push({ startY: range.startY, endY: splitY, heightMm: Math.round(maxBottomRaiseMm) });
                    rightSegments.push({ startY: splitY, endY: range.endY, heightMm: Math.round(range.heightMm - maxBottomRaiseMm) });
                  } else {
                    rightSegments.push(range);
                  }
                });

                const allRightSegments = buildAllSegments(rightSegments);

                return allRightSegments.map((seg, idx) => (
                  <group key={`custom-section-dim-right-${idx}`}>
                    <NativeLine name="dimension_line"
                      points={[[dimLineRightX, seg.startY, 0.002], [dimLineRightX, seg.endY, 0.002]]}
                      color={dimensionColor}
                      lineWidth={0.6}
                      renderOrder={100000}
                      depthTest={false}
                    />
                    <NativeLine name="dimension_line"
                      points={createArrowHead([dimLineRightX, seg.startY, 0.002], [dimLineRightX, seg.startY - 0.015, 0.002])}
                      color={dimensionColor}
                      lineWidth={0.6}
                      renderOrder={100000}
                      depthTest={false}
                    />
                    <NativeLine name="dimension_line"
                      points={createArrowHead([dimLineRightX, seg.endY, 0.002], [dimLineRightX, seg.endY + 0.015, 0.002])}
                      color={dimensionColor}
                      lineWidth={0.6}
                      renderOrder={100000}
                      depthTest={false}
                    />
                    <NativeLine name="dimension_line"
                      points={[[furnitureRightX, seg.startY, 0.001], [extLineRightX, seg.startY, 0.001]]}
                      color={dimensionColor}
                      lineWidth={0.3}
                      renderOrder={100000}
                      depthTest={false}
                    />
                    <NativeLine name="dimension_line"
                      points={[[furnitureRightX, seg.endY, 0.001], [extLineRightX, seg.endY, 0.001]]}
                      color={dimensionColor}
                      lineWidth={0.3}
                      renderOrder={100000}
                      depthTest={false}
                    />
                    <Text
                      renderOrder={100001}
                      depthTest={false}
                      position={[dimLineRightX + mmToThreeUnits(60), (seg.startY + seg.endY) / 2, 0.01]}
                      fontSize={baseFontSize}
                      color={textColor}
                      anchorX="center"
                      anchorY="middle"
                      outlineWidth={textOutlineWidth}
                      outlineColor={textOutlineColor}
                      rotation={[0, 0, Math.PI / 2]}
                    >
                      {seg.heightMm}
                    </Text>
                  </group>
                ));
              })()}

              {/* 좌우분할 섹션 폭 치수선 (하부→아래, 상부→위) */}
              {widthDimSections.map((wd) => {
                // 연장선 끝: 치수선에서 20mm 더 바깥쪽
                const extEndY = wd.isAbove ? wd.dimY + mmToThreeUnits(20) : wd.dimY - mmToThreeUnits(20);
                // 텍스트 위치: 치수선에서 40mm 바깥쪽
                const textY = wd.isAbove ? wd.dimY + mmToThreeUnits(40) : wd.dimY - mmToThreeUnits(40);
                return (
                  <group key={`custom-width-dim-s${wd.sectionIdx}`}>
                    {wd.boxes.map((box, bIdx) => (
                      <group key={`wb-${wd.sectionIdx}-${bIdx}`}>
                        {/* 수평 치수선 */}
                        <NativeLine name="dimension_line"
                          points={[[box.startX, wd.dimY, 0.002], [box.endX, wd.dimY, 0.002]]}
                          color={dimensionColor}
                          lineWidth={0.6}
                          renderOrder={100000}
                          depthTest={false}
                        />
                        {/* 좌측 틱 마크 */}
                        <NativeLine name="dimension_line"
                          points={createArrowHead([box.startX, wd.dimY, 0.002], [box.startX - 0.015, wd.dimY, 0.002])}
                          color={dimensionColor}
                          lineWidth={0.6}
                          renderOrder={100000}
                          depthTest={false}
                        />
                        {/* 우측 틱 마크 */}
                        <NativeLine name="dimension_line"
                          points={createArrowHead([box.endX, wd.dimY, 0.002], [box.endX + 0.015, wd.dimY, 0.002])}
                          color={dimensionColor}
                          lineWidth={0.6}
                          renderOrder={100000}
                          depthTest={false}
                        />
                        {/* 좌측 수직 보조 연장선 (가구 끝에서 치수선까지) */}
                        <NativeLine name="dimension_line"
                          points={[[box.startX, wd.anchorY, 0.001], [box.startX, extEndY, 0.001]]}
                          color={dimensionColor}
                          lineWidth={0.3}
                          renderOrder={100000}
                          depthTest={false}
                        />
                        {/* 우측 수직 보조 연장선 (가구 끝에서 치수선까지) */}
                        <NativeLine name="dimension_line"
                          points={[[box.endX, wd.anchorY, 0.001], [box.endX, extEndY, 0.001]]}
                          color={dimensionColor}
                          lineWidth={0.3}
                          renderOrder={100000}
                          depthTest={false}
                        />
                        {/* 폭 치수 텍스트 */}
                        <Text
                          renderOrder={100001}
                          depthTest={false}
                          position={[(box.startX + box.endX) / 2, textY, 0.01]}
                          fontSize={baseFontSize}
                          color={textColor}
                          anchorX="center"
                          anchorY="middle"
                          outlineWidth={textOutlineWidth}
                          outlineColor={textOutlineColor}
                        >
                          {box.widthMm}
                        </Text>
                      </group>
                    ))}
                  </group>
                );
              })}
            </>
          );
        })()}
      </group>
      )}

      {/* 가구별 실시간 치수선 및 가이드 (가구가 배치된 경우에만 표시, 탑뷰가 아닐 때만) */}
      {showDimensions && furnitureDimensions && furnitureDimensions.map((item, index) => {
        if (!item) return null;
        
        const {
          module,
          moduleData,
          actualWidth,
          actualDepth,
          hasCustomDepth,
          moduleX,
          moduleY,
          moduleLeft,
          moduleRight,
          nearestLeftDistance,
          nearestRightDistance,
          leftBoundaryDistance,
          rightBoundaryDistance,
          farSideDistance,
          farSideSide,
          hasAdjacentLeft,
          hasAdjacentRight,
          isSpacerHandled,
          hasStepDown,
          stepDownPosition,
          stepDownWidth: stepDownWidthItem,
          zoneLimitLeft,
          zoneLimitRight,
        } = item;
        
        // actualPositionX를 moduleX로부터 가져옴
        let actualPositionX = moduleX;
        
        // 실제 너비 계산은 이미 완료되어 있음
        // 단내림 폭 (자유배치: stepCeiling, 슬롯: droppedCeiling)
        const stepDownWidthLocal = isFreePlacement
          ? (spaceInfo.stepCeiling?.width || 0)
          : (spaceInfo.droppedCeiling?.width || 0);
        // 외치(outside) EP: 본체 폭은 그대로지만 EP가 좌/우 바깥에 추가되므로
        // 폭 치수가이드는 본체폭 + EP두께(좌/우 각각)만큼 늘어나야 한다. (내치는 전체폭 유지 → 보정 없음)
        const epDimThkMm = (module.endPanelMode === 'outside')
          ? resolvePetPanelThicknessMm(module.endPanelThickness) : 0;
        const leftEpDimMm = (epDimThkMm && module.hasLeftEndPanel) ? epDimThkMm : 0;
        const rightEpDimMm = (epDimThkMm && module.hasRightEndPanel) ? epDimThkMm : 0;
        const dimWidthMm = actualWidth + leftEpDimMm + rightEpDimMm; // 치수 표시용 전체폭
        const epDimCenterShift = mmToThreeUnits((rightEpDimMm - leftEpDimMm) / 2); // 좌우 비대칭 시 외곽 중심 이동
        const moduleWidth = mmToThreeUnits(dimWidthMm);
        const leftX = actualPositionX + epDimCenterShift - moduleWidth / 2;
        const rightX = actualPositionX + epDimCenterShift + moduleWidth / 2;
	        // 가구 카테고리: 하부장은 하부장 바로 위에, 상부장/키큰장은 공간 상단에 너비 치수 표시
	        const moduleCategoryForDim = moduleData.category
	          ?? (module.moduleId?.includes('upper') ? 'upper'
	            : module.moduleId?.includes('lower') ? 'lower' : 'full');
	        const isLowerDim = moduleCategoryForDim === 'lower';
	        const isUpperDim = moduleCategoryForDim === 'upper';
	        const topGapMmForDim = module.hasTopFrame === false
	          ? Math.max(0, Math.round(module.topFrameGap ?? 0))
	          : 0;
	        const topFrameMmForDim = module.hasTopFrame === false
	          ? topGapMmForDim
	          : Math.max(0, Math.round(module.topFrameThickness ?? (spaceInfo.frameSize?.top ?? 30)));
	        // 우측 작은 상단갭 박스(가구 우측에 100 표시) — 좌측에 이미 표시되므로 중복 제거
	        const showTopGapHeightGuide = false;
        const moduleCeilingMmForDim = (() => {
          if (module.zone === 'dropped') {
            if (isFreePlacement && spaceInfo.stepCeiling?.enabled) {
              return spaceInfo.height - (spaceInfo.stepCeiling.dropHeight || 0);
            }
            if (spaceInfo.droppedCeiling?.enabled) {
              return spaceInfo.height - (spaceInfo.droppedCeiling.dropHeight || 0);
            }
          }
          return spaceInfo.height;
        })();
        const moduleCeilingYForDim = mmToThreeUnits(moduleCeilingMmForDim);
        // 하부장 상단 Y(mm) = 바닥마감재 + 걸래받이(받침대) + 개별 띄움 + 가구 높이
        // 3D 배치 좌표계(바닥=0)에서 계산
        const floorFinishMmForDim = spaceInfo.hasFloorFinish && spaceInfo.floorFinish?.height
          ? (spaceInfo.floorFinish.height || 0) : 0;
        const baseFrameMmForDim = module.hasBase === false
          ? 0
          : (module.baseFrameHeight ?? (spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height || 65) : 0));
        const floatMmForDim = module.hasBase === false ? (module.individualFloatHeight ?? 0) : 0;
        const isGlassCabinetForFrontDim = module.moduleId?.includes('glass-cabinet') && moduleCategoryForDim === 'full';
        const moduleHeightMm = isGlassCabinetForFrontDim
          ? resolveGlassCabinetBodyHeightMm(module, moduleData)
          : ((moduleData.category === 'upper'
            ? (module.customHeight ?? module.freeHeight ?? moduleData.dimensions.height)
            : (module.freeHeight ?? module.customHeight ?? moduleData.dimensions.height)) || 0);
        const moduleBottomYMmForDim = isGlassCabinetForFrontDim
          ? (module.hasBase === false
            ? Math.max(0, Math.round(module.individualFloatHeight ?? 0))
            : (spaceInfo.baseConfig?.type === 'floor'
              ? Math.max(0, Math.round(module.baseFrameHeight ?? spaceInfo.baseConfig?.height ?? 65))
              : 0))
          : floorFinishMmForDim + baseFrameMmForDim + floatMmForDim;
	        const lowerTopYMm = moduleBottomYMmForDim + moduleHeightMm;
	        const LOWER_DIM_OFFSET_MM = 150; // 하부장 상단에서 치수선까지 거리 (연장선 길이)
	        const lowerDimY = mmToThreeUnits(lowerTopYMm + LOWER_DIM_OFFSET_MM);
	        const upperTopYMm = moduleCeilingMmForDim - topFrameMmForDim;
	        const upperDimY = mmToThreeUnits(upperTopYMm + DIM_GAP);
	        const dimY = isLowerDim ? lowerDimY : (isUpperDim ? upperDimY : slotDimensionY);
	        const moduleWidthExtensionStartY = isUpperDim ? mmToThreeUnits(upperTopYMm) : moduleCeilingYForDim;
	        const moduleWidthExtensionEndY = isUpperDim
	          ? dimY
	          : ((hasDroppedCeiling || hasStepDown) ? slotTotalDimensionY : columnDimensionY);
	        const moduleWidthSection = moduleCategoryForDim === 'upper'
	          ? 'upper'
	          : moduleCategoryForDim === 'lower'
	            ? 'lower'
	            : 'auto';
	        const moduleWidthWorldZ = resolveFrontDimensionFrontZ(module, moduleWidthSection);
	        const moduleWidthDimZ = frontViewLocalZ(moduleWidthWorldZ, 0.002);
	        const moduleWidthExtZ = frontViewLocalZ(moduleWidthWorldZ, 0.001);
	        const moduleWidthTextZ = frontViewLocalZ(moduleWidthWorldZ, 0.01);
        
        // 듀얼 가구인지 확인 (이름에 'dual' 포함)
        const isDualModule = moduleData.id.includes('dual');
        
        // 섹션 구조 가져오기
        const leftSections = isDualModule ? 
          (moduleData.modelConfig?.leftSections || moduleData.modelConfig?.sections || []) :
          (moduleData.modelConfig?.sections || []);
        const rightSections = isDualModule ? 
          (moduleData.modelConfig?.rightSections || moduleData.modelConfig?.sections || []) :
          [];
        
        // 듀얼 가구의 경우 좌우 폭 계산 (조정된 너비 기반)
        let leftWidth, rightWidth;
        if (isDualModule) {
          if (moduleData.modelConfig?.rightAbsoluteWidth) {
            // 원래 비율을 유지하면서 조정
            const originalRatio = moduleData.modelConfig.rightAbsoluteWidth / moduleData.dimensions.width;
            rightWidth = actualWidth * originalRatio;
            leftWidth = actualWidth - rightWidth;
          } else {
            // 50:50 분할
            leftWidth = actualWidth / 2;
            rightWidth = actualWidth / 2;
          }
        } else {
          leftWidth = actualWidth;
          rightWidth = 0;
        }
        
        const leftThreeWidth = mmToThreeUnits(leftWidth);
        const rightThreeWidth = mmToThreeUnits(rightWidth);
        
        // 메인구간 경계 계산 (커튼박스 폭 차감)
        const freeCbWidthLocal = (isFreePlacement && spaceInfo.droppedCeiling?.enabled)
          ? (spaceInfo.droppedCeiling.width || 0) : 0;
        const mainAreaLeft = hasStepDown && stepDownPosition === 'left'
          ? mmToThreeUnits(stepDownWidthLocal + freeCbWidthLocal)
          : 0;
        const mainAreaRight = hasStepDown && stepDownPosition === 'right'
          ? mmToThreeUnits(spaceInfo.width - stepDownWidthLocal - freeCbWidthLocal)
          : mmToThreeUnits(spaceInfo.width);
        
        // 모듈이 속한 구간 확인 (메인구간 또는 단내림 구간)
        const isInMainArea = leftX >= mainAreaLeft && rightX <= mainAreaRight;
        const isInStepDownArea = hasStepDown && !isInMainArea;
        
        // 가이드라인 높이 계산 - 가구 상단까지만
        const furnitureHeight = mmToThreeUnits(moduleHeightMm);
        const guideTopY = isGlassCabinetForFrontDim
          ? mmToThreeUnits(moduleBottomYMmForDim + moduleHeightMm)
          : furnitureHeight; // 가구 상단까지만 표시
        const guideBottomY = isGlassCabinetForFrontDim ? mmToThreeUnits(moduleBottomYMmForDim) : 0;
        
        // 가이드라인은 해당 구간 내에서만 표시
        const shouldShowGuide = isInMainArea || isInStepDownArea;
        
        return (
          <group key={`module-guide-${index}`} renderOrder={1000000}>

	            {/* 가구 치수선 */}
	            <NativeLine name="dimension_line"
	              points={[[leftX, dimY, moduleWidthDimZ], [rightX, dimY, moduleWidthDimZ]]}
	              color={dimensionColor}
	              lineWidth={0.6}
	              renderOrder={1000000}
              depthTest={false}
            />

	            {/* 좌측 화살표 */}
	            <NativeLine name="dimension_line"
	              points={createArrowHead([leftX, dimY, moduleWidthDimZ], [leftX + 0.02, dimY, moduleWidthDimZ], 0.01)}
	              color={dimensionColor}
	              lineWidth={0.6}
	              renderOrder={1000000}
              depthTest={false}
            />

	            {/* 우측 화살표 */}
	            <NativeLine name="dimension_line"
	              points={createArrowHead([rightX, dimY, moduleWidthDimZ], [rightX - 0.02, dimY, moduleWidthDimZ], 0.01)}
	              color={dimensionColor}
	              lineWidth={0.6}
	              renderOrder={1000000}
              depthTest={false}
            />

            {/* 가구 치수 텍스트 — 자유배치: 클릭 편집 가능, 그 외: 읽기 전용 */}
	            {isFreePlacement && editingFurnitureWidthId === module.id ? (
	              <Html
	                position={[actualPositionX, dimY + mmToThreeUnits(30), moduleWidthTextZ]}
                center
                style={{ pointerEvents: 'auto' }}
                zIndexRange={[10000, 10001]}
              >
                <div style={{ background: currentViewDirection !== '3D' && view2DTheme === 'dark' ? 'rgba(31,41,55,0.98)' : 'rgba(255,255,255,0.98)', padding: '3px', borderRadius: '4px', border: '2px solid #2196F3', boxShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
                  <input
                    ref={furnitureWidthInputRef}
                    type="number"
                    step="1"
                    value={editingFurnitureWidthValue}
                    onChange={(e) => setEditingFurnitureWidthValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleFurnitureWidthSubmit(); else if (e.key === 'Escape') handleFurnitureWidthCancel(); }}
                    onBlur={handleFurnitureWidthSubmit}
                    style={{ width: '60px', padding: '2px 4px', border: '1px solid #555', borderRadius: '2px', fontSize: '12px', fontWeight: 'bold', textAlign: 'center', outline: 'none', background: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#1f2937' : '#fff', color: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#fff' : '#000' }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span style={{ marginLeft: '2px', fontSize: '11px', color: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#9ca3af' : '#666' }}>mm</span>
                </div>
              </Html>
	            ) : isFreePlacement ? (
	              <Html
	                position={[actualPositionX, dimY + mmToThreeUnits(30), moduleWidthTextZ]}
                center
                style={{ pointerEvents: 'auto' }}
                zIndexRange={[9999, 10000]}
              >
                <div
                  style={{
                    padding: '2px 6px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    color: dimensionColor,
                    cursor: module.isLocked || readOnly ? 'default' : 'pointer',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                    background: currentViewDirection !== '3D' && view2DTheme === 'dark' ? 'rgba(31,41,55,0.7)' : 'rgba(255,255,255,0.7)',
                    borderRadius: '3px',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!module.isLocked && !readOnly) handleFurnitureWidthEdit(module.id, actualWidth);
                  }}
                >
                  {(() => {
                    const r = Math.round(dimWidthMm * 2) / 2; // 0.5mm 단위 (외치 EP 포함 전체폭)
                    return r % 1 === 0 ? String(r) : r.toFixed(1);
                  })()}
                </div>
              </Html>
            ) : (
	              <Text
	                position={[actualPositionX, dimY + mmToThreeUnits(30), moduleWidthTextZ]}
                fontSize={baseFontSize}
                color={dimensionColor}
                anchorX="center"
                anchorY="middle"
                renderOrder={1000000}
                depthTest={false}
              >
                {(() => {
                    const r = Math.round(dimWidthMm * 2) / 2; // 0.5mm 단위 (외치 EP 포함 전체폭)
                    return r % 1 === 0 ? String(r) : r.toFixed(1);
                })()}
              </Text>
            )}

            {/* 연장선 끝 세리프 (가로 틱 마크) */}
            {[leftX, rightX].map((x, ti) => (
              <React.Fragment key={`tick-${ti}`}>
	                <NativeLine name="dimension_line"
	                  points={[[x - mmToThreeUnits(5), dimY, moduleWidthExtZ], [x + mmToThreeUnits(5), dimY, moduleWidthExtZ]]}
	                  color={dimensionColor} lineWidth={0.6} renderOrder={1000000} depthTest={false}
	                />
              </React.Fragment>
            ))}

            {/* 연장선 - 하부장은 가구 상단에서 바로 위 치수선까지, 그 외는 가구 상단에서 공간 상단 치수선까지 */}
            {isLowerDim ? (
              <>
	                <NativeLine name="dimension_line"
	                  points={[[leftX, mmToThreeUnits(lowerTopYMm), moduleWidthExtZ], [leftX, dimY, moduleWidthExtZ]]}
                  color={dimensionColor}
                  lineWidth={0.6}
                  renderOrder={1000000}
                  depthTest={false}
                  depthWrite={false}
                  transparent={true}
                />
	                <NativeLine name="dimension_line"
	                  points={[[rightX, mmToThreeUnits(lowerTopYMm), moduleWidthExtZ], [rightX, dimY, moduleWidthExtZ]]}
                  color={dimensionColor}
                  lineWidth={0.6}
                  renderOrder={1000000}
                  depthTest={false}
                  depthWrite={false}
                  transparent={true}
                />
              </>
            ) : (
              <>
	                <NativeLine name="dimension_line"
	                  points={[[leftX, moduleWidthExtensionStartY, moduleWidthExtZ], [leftX, moduleWidthExtensionEndY, moduleWidthExtZ]]}
                  color={dimensionColor}
                  lineWidth={0.6}
                  renderOrder={1000000}
                  depthTest={false}
                  depthWrite={false}
                  transparent={true}
                />
	                <NativeLine name="dimension_line"
	                  points={[[rightX, moduleWidthExtensionStartY, moduleWidthExtZ], [rightX, moduleWidthExtensionEndY, moduleWidthExtZ]]}
                  color={dimensionColor}
                  lineWidth={0.6}
                  renderOrder={1000000}
                  depthTest={false}
                  depthWrite={false}
                  transparent={true}
                />
              </>
            )}

            {/* 자유배치: 구간 내 좌/우 이격 치수선 (가구~구간경계 거리) */}
	            {isFreePlacement && (() => {
              // 이격 치수선 Y: 가구 수직 중앙 (공간 안에 표시)
              const modCat = moduleData.category
                ?? (module.moduleId.includes('upper') ? 'upper'
                  : module.moduleId.includes('lower') ? 'lower' : 'full');
              const modHeightMm = modCat === 'upper'
                ? (module.customHeight ?? module.freeHeight ?? moduleData.dimensions.height)
                : (module.freeHeight ?? module.customHeight ?? moduleData.dimensions.height);
              const baseFrameHGap = module.baseFrameHeight ?? (spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig.height || 65) : 0);
              const topFrameForGap = module.hasTopFrame === false
                ? Math.max(0, Math.round(module.topFrameGap ?? 0))
                : (module.topFrameThickness ?? (spaceInfo.frameSize?.top ?? 30));
              let gapDimY: number;
              if (modCat === 'upper') {
                // 상부장 중앙: (공간상단 - topFrame - modHeight) ~ (공간상단 - topFrame) 의 중간
                const upperTop = spaceInfo.height - topFrameForGap;
                const upperBottom = upperTop - modHeightMm;
                gapDimY = mmToThreeUnits((upperTop + upperBottom) / 2);
              } else {
                // 하부장/키큰장 중앙: baseFrame ~ (baseFrame + modHeight) 의 중간
                gapDimY = mmToThreeUnits(baseFrameHGap + modHeightMm / 2);
              }

              // 자유배치는 벽/가구 모두 실제 좌표 거리 기준으로 표시한다.
              // freeLeftGap/gapConfig는 기본 배치값이라 이동 후 실제 이격과 달라질 수 있다.
              const useActualGapDistance = module.isFreePlacement || spaceInfo.layoutMode === 'free-placement';
              const rawLeftGap = hasAdjacentLeft || useActualGapDistance
                ? nearestLeftDistance
                : (module.freeLeftGap ?? spaceInfo.gapConfig?.left ?? 1.5);
              const rawRightGap = hasAdjacentRight || useActualGapDistance
                ? nearestRightDistance
                : (module.freeRightGap ?? spaceInfo.gapConfig?.right ?? 1.5);
              // 이격거리는 정수 mm로 반올림 (소수점 불필요)
              const formatDim = (v: number) => Math.round(v).toString();
              const leftGapMm = Math.round(rawLeftGap);
              const rightGapMm = Math.round(rawRightGap);

              // 이격 숨김 조건:
              // 1) 서라운드 모드에서 벽 인접 가구의 이격은 프레임 두께와 겹침 → 숨김
              // 2) 이격거리 ≤ 2mm 는 기본 최소간격이므로 숨김 (노서라운드 포함)
              const isSurround = spaceInfo.surroundType !== 'no-surround';
              const hideFreePlacementInlineGap = useActualGapDistance;
              const suppressLeftGap = hideFreePlacementInlineGap || leftGapMm <= 2 || (isSurround && !hasAdjacentLeft && leftGapMm > 0 && leftGapMm <= (frameSize?.left ?? 0) + 2);
              const suppressRightGap = hideFreePlacementInlineGap || rightGapMm <= 2 || (isSurround && !hasAdjacentRight && rightGapMm > 0 && rightGapMm <= (frameSize?.right ?? 0) + 2);
              // 좌측 갭: 가구 왼쪽 ~ (왼쪽 인접 가구 또는 구간 경계)
              const gapLeftX = leftX - mmToThreeUnits(leftGapMm);
              // 우측 갭: (오른쪽 인접 가구 또는 구간 경계) ~ 가구 오른쪽
              const gapRightX = rightX + mmToThreeUnits(rightGapMm);
              // 가구 이동 핸들러: 화살표 클릭 시 벽/인접가구까지 한번에 붙임
              const isSelected = selectedFurnitureId === module.id
                || (selectedFurnitureIds ?? []).includes(module.id);
              const stopAll = (e: any) => {
                e.stopPropagation();
                e.nativeEvent?.stopImmediatePropagation?.();
                // 캔버스 클릭 → 선택해제 방지 (R3F mesh handleClick이 뒤이어 실행되어도 무시)
                (window as any).__r3fClickHandled = true;
                // 다음 tick에 해제하여 씬 onClick 한 번만 차단
                setTimeout(() => { (window as any).__r3fClickHandled = false; }, 50);
              };
              const halfW = moduleWidth / 2;
              // 실제 이동 거리: nearestLeftDistance/nearestRightDistance는 가구/벽까지 실거리 (mm)
              // 단, nearestDistance는 물리적 벽까지 거리이므로, 벽 인접 시 이격(gapConfig)을 빼야 함
              const wallGapLeft = spaceInfo.gapConfig?.left ?? 1.5;
              const wallGapRight = spaceInfo.gapConfig?.right ?? 1.5;
              const realLeftGapMm = hasAdjacentLeft
                ? (nearestLeftDistance || 0)
                : Math.max(0, (nearestLeftDistance || 0) - wallGapLeft);
              const realRightGapMm = hasAdjacentRight
                ? (nearestRightDistance || 0)
                : Math.max(0, (nearestRightDistance || 0) - wallGapRight);
              // 실제 빈 공간 기준으로 버튼 표시 — 가구 사이 빈 공간이 3mm 이상일 때만
              // 다중선택(그룹)일 때: 그룹의 양쪽 끝 가구에서만 바깥 방향 화살표 표시.
              //   - 그룹 내부 화살표는 의미가 없어 숨김 (그룹 안쪽엔 같이 선택된 가구가 있음).
              //   - 슬롯배치 모드는 그룹 이동 자체 불가 (슬롯 인덱스 고정 → 슬롯 밖으로 벗어남 방지).
              const multiIds = (selectedFurnitureIds ?? []);
              const isMulti = multiIds.length >= 2 && multiIds.includes(module.id);
              const groupModules = isMulti
                ? placedModules.filter(m => multiIds.includes(m.id) && !m.isSurroundPanel)
                : [];
              const isLeftmostInGroup = isMulti
                ? groupModules.every(m => m.id === module.id || m.position.x >= module.position.x)
                : true;
              const isRightmostInGroup = isMulti
                ? groupModules.every(m => m.id === module.id || m.position.x <= module.position.x)
                : true;
              // 자유/커스텀 가이드 배치 전용. 슬롯배치는 슬롯 인덱스 기반이라 화살표 자체 표시 안 함.
              const guideLayoutActive = spaceInfo.customGuideMode === true
                && (spaceInfo.freePlacementGuides?.length || 0) > 0;
              const isGuidePlacementModule = module.guideSlotPlacement === true
                || (guideLayoutActive && module.isFreePlacement === true);
              const suppressFreePlacementMoveHandles = spaceInfo.freePlacementGuideEditing === true;
              const canMoveLeft = isFreePlacement && !suppressFreePlacementMoveHandles && realLeftGapMm >= 3 && isLeftmostInGroup;
              const canMoveRight = isFreePlacement && !suppressFreePlacementMoveHandles && realRightGapMm >= 3 && isRightmostInGroup;
              // 좌측 한계: 벽 이격 경계 또는 인접 가구 우측 끝
              const leftLimit = leftX - mmToThreeUnits(realLeftGapMm);
              // 우측 한계: 벽 이격 경계 또는 인접 가구 좌측 끝
              const rightLimit = rightX + mmToThreeUnits(realRightGapMm);
              // 1mm(0.01) 단위로 스냅하여 부동소수점 오차 방지
              const snap = (v: number) => Math.round(v * 100) / 100;
              // 좌/우 한계(벽 또는 인접 가구)까지 한번에 붙이기 + 가구 너비 자동 확장
              // (기본값: 싱글 600, 듀얼 1200 상한까지 빈 공간만큼 확장)
              // 단, 사용자가 직접 폭을 변경한 경우(userResizedWidth)는 현재 폭 유지
              const isModDual = module.moduleId?.includes('dual-');
              const maxModWidth = isModDual ? 1200 : 600;
              const currentWidthMm = (module.freeWidth || module.customWidth || module.moduleWidth || 0);
              const userResized = !!(module as any).userResizedWidth;
              const shouldAutoExpandOnMove = !isGuidePlacementModule && !userResized;
              const totalAvailableMm = realLeftGapMm + currentWidthMm + realRightGapMm;
              const newWidthMm = shouldAutoExpandOnMove
                ? Math.min(maxModWidth, Math.floor(totalAvailableMm))
                : currentWidthMm;
              const newHalfWThree = mmToThreeUnits(newWidthMm) / 2;

              // 그룹 이동: 좌·우 동일한 한 칸 단위로 이동 (그룹 내 최소 가구 폭).
              //   - 양쪽 빈 공간 중 더 작은 쪽이 stepMm보다 작으면 그 값으로 제한 → 좌우 대칭 보장.
              const groupStepBaseMm = isMulti
                ? Math.min(...groupModules.map(m => (m.freeWidth || m.customWidth || m.moduleWidth || 600)))
                : currentWidthMm;
              // 그룹 양쪽 끝 가구의 빈 공간 확인 (좌·우 같은 step 적용 위해)
              const groupLeftmost = isMulti
                ? groupModules.reduce((min, m) => (m.position.x < min.position.x ? m : min), groupModules[0])
                : module;
              const groupRightmost = isMulti
                ? groupModules.reduce((max, m) => (m.position.x > max.position.x ? m : max), groupModules[0])
                : module;
              // 자기 위치(module)가 leftmost일 때 realLeftGap이 의미 있음.
              const leftEdgeGapMm = (isMulti && groupLeftmost.id === module.id) ? realLeftGapMm : 0;
              const rightEdgeGapMm = (isMulti && groupRightmost.id === module.id) ? realRightGapMm : 0;

              const moveLeft = (e: any) => {
                stopAll(e);
                if (isMulti) {
                  const stepMm = Math.min(groupStepBaseMm, leftEdgeGapMm);
                  if (stepMm <= 0) return;
                  const deltaThree = -mmToThreeUnits(stepMm);
                  groupModules.forEach(m => {
                    if ((m as any).isLocked) return;
                    updatePlacedModule(m.id, { position: { ...m.position, x: snap(m.position.x + deltaThree) } });
                  });
                  return;
                }
                const newX = snap(leftLimit + newHalfWThree);
                const updates: any = { position: { ...module.position, x: newX } };
                if (shouldAutoExpandOnMove) {
                  updates.freeWidth = newWidthMm;
                  updates.moduleWidth = newWidthMm;
                }
                updatePlacedModule(module.id, updates);
              };
              const moveRight = (e: any) => {
                stopAll(e);
                if (isMulti) {
                  const stepMm = Math.min(groupStepBaseMm, rightEdgeGapMm);
                  if (stepMm <= 0) return;
                  const deltaThree = mmToThreeUnits(stepMm);
                  groupModules.forEach(m => {
                    if ((m as any).isLocked) return;
                    updatePlacedModule(m.id, { position: { ...m.position, x: snap(m.position.x + deltaThree) } });
                  });
                  return;
                }
                const newX = snap(rightLimit - newHalfWThree);
                const updates: any = { position: { ...module.position, x: newX } };
                if (shouldAutoExpandOnMove) {
                  updates.freeWidth = newWidthMm;
                  updates.moduleWidth = newWidthMm;
                }
                updatePlacedModule(module.id, updates);
              };
              return (<>
                {/* 좌측 이동 화살표 — 가구 선택 + 이격 여유 있을 때만 */}
                {isSelected && canMoveLeft && (
                  <Html position={[leftX - mmToThreeUnits(30), gapDimY, 0.01]}
                    center style={{ pointerEvents: 'auto' }} zIndexRange={[10001, 10002]}>
                    <div
                      onPointerDown={stopAll}
                      onMouseDown={stopAll}
                      onClick={moveLeft}
                      onPointerUp={stopAll}
                      style={{
                        width: '32px', height: '40px',
                        background: 'var(--theme-primary, #2196F3)',
                        borderRadius: '6px 0 0 6px',
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                        transition: 'background 0.15s',
                        pointerEvents: 'auto',
                        userSelect: 'none',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'color-mix(in srgb, var(--theme-primary, #2196F3) 85%, black 15%)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--theme-primary, #2196F3)'; }}
                    >
                      <svg width="14" height="18" viewBox="0 0 10 14" fill="none" style={{ pointerEvents: 'none' }}><path d="M8 1L2 7L8 13" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                  </Html>
                )}
                {/* 좌측 이격 치수 */}
                {leftGapMm > 0 && !suppressLeftGap && (<>
                  <NativeLine name="dimension_line"
                    points={[[gapLeftX, gapDimY, 0.002], [leftX, gapDimY, 0.002]]}
                    color={dimensionColor} lineWidth={0.6} renderOrder={1000000} depthTest={false}
                  />
                  <NativeLine name="dimension_line"
                    points={createArrowHead([gapLeftX, gapDimY, 0.002], [gapLeftX + 0.02, gapDimY, 0.002], 0.01)}
                    color={dimensionColor} lineWidth={0.6} renderOrder={1000000} depthTest={false}
                  />
                  <NativeLine name="dimension_line"
                    points={createArrowHead([leftX, gapDimY, 0.002], [leftX - 0.02, gapDimY, 0.002], 0.01)}
                    color={dimensionColor} lineWidth={0.6} renderOrder={1000000} depthTest={false}
                  />
                  <Text renderOrder={1000000} depthTest={false}
                    position={[(gapLeftX + leftX) / 2, gapDimY + mmToThreeUnits(30), 0.01]}
                    fontSize={baseFontSize} color={textColor}
                    anchorX="center" anchorY="middle"
                    outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                  >
                    {formatDim(leftGapMm)}
                  </Text>
                </>)}
                {/* 우측 이동 화살표 — 가구 선택 + 이격 여유 있을 때만 */}
                {isSelected && canMoveRight && (
                  <Html position={[rightX + mmToThreeUnits(30), gapDimY, 0.01]}
                    center style={{ pointerEvents: 'auto' }} zIndexRange={[10001, 10002]}>
                    <div
                      onPointerDown={stopAll}
                      onMouseDown={stopAll}
                      onClick={moveRight}
                      onPointerUp={stopAll}
                      style={{
                        width: '32px', height: '40px',
                        background: 'var(--theme-primary, #2196F3)',
                        borderRadius: '0 6px 6px 0',
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                        transition: 'background 0.15s',
                        pointerEvents: 'auto',
                        userSelect: 'none',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'color-mix(in srgb, var(--theme-primary, #2196F3) 85%, black 15%)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--theme-primary, #2196F3)'; }}
                    >
                      <svg width="14" height="18" viewBox="0 0 10 14" fill="none" style={{ pointerEvents: 'none' }}><path d="M2 1L8 7L2 13" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                  </Html>
                )}
                {/* 우측 이격 치수 */}
                {rightGapMm > 0 && !suppressRightGap && (<>
                  <NativeLine name="dimension_line"
                    points={[[rightX, gapDimY, 0.002], [gapRightX, gapDimY, 0.002]]}
                    color={dimensionColor} lineWidth={0.6} renderOrder={1000000} depthTest={false}
                  />
                  <NativeLine name="dimension_line"
                    points={createArrowHead([rightX, gapDimY, 0.002], [rightX + 0.02, gapDimY, 0.002], 0.01)}
                    color={dimensionColor} lineWidth={0.6} renderOrder={1000000} depthTest={false}
                  />
                  <NativeLine name="dimension_line"
                    points={createArrowHead([gapRightX, gapDimY, 0.002], [gapRightX - 0.02, gapDimY, 0.002], 0.01)}
                    color={dimensionColor} lineWidth={0.6} renderOrder={1000000} depthTest={false}
                  />
                  <Text renderOrder={1000000} depthTest={false}
                    position={[(rightX + gapRightX) / 2, gapDimY + mmToThreeUnits(30), 0.01]}
                    fontSize={baseFontSize} color={textColor}
                    anchorX="center" anchorY="middle"
                    outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                  >
                    {formatDim(rightGapMm)}
                  </Text>
                </>)}
              </>);
	            })()}

	            {/* 정면뷰 상단갭 세로 치수가이드 */}
	            {showTopGapHeightGuide && (() => {
	              const topGapTopY = moduleCeilingYForDim;
	              const topGapBottomY = moduleCeilingYForDim - mmToThreeUnits(topGapMmForDim);
	              const topGapDimX = rightX + mmToThreeUnits(120);
	              const topGapExtX = topGapDimX + mmToThreeUnits(20);
	              const topGapTextX = topGapDimX + mmToThreeUnits(60);

	              return (
	                <group key={`front-top-gap-guide-${module.id}`}>
	                  <NativeLine name="dimension_line"
	                    points={[[topGapDimX, topGapBottomY, 0.002], [topGapDimX, topGapTopY, 0.002]]}
	                    color={dimensionColor}
	                    lineWidth={0.6}
	                    renderOrder={1000000}
	                    depthTest={false}
	                  />
	                  <NativeLine name="dimension_line"
	                    points={createArrowHead([topGapDimX, topGapBottomY, 0.002], [topGapDimX, topGapBottomY - 0.015, 0.002])}
	                    color={dimensionColor}
	                    lineWidth={0.6}
	                    renderOrder={1000000}
	                    depthTest={false}
	                  />
	                  <NativeLine name="dimension_line"
	                    points={createArrowHead([topGapDimX, topGapTopY, 0.002], [topGapDimX, topGapTopY + 0.015, 0.002])}
	                    color={dimensionColor}
	                    lineWidth={0.6}
	                    renderOrder={1000000}
	                    depthTest={false}
	                  />
	                  <NativeLine name="dimension_line"
	                    points={[[rightX, topGapBottomY, 0.001], [topGapExtX, topGapBottomY, 0.001]]}
	                    color={dimensionColor}
	                    lineWidth={0.3}
	                    renderOrder={1000000}
	                    depthTest={false}
	                  />
	                  <NativeLine name="dimension_line"
	                    points={[[rightX, topGapTopY, 0.001], [topGapExtX, topGapTopY, 0.001]]}
	                    color={dimensionColor}
	                    lineWidth={0.3}
	                    renderOrder={1000000}
	                    depthTest={false}
	                  />
	                  <Text
	                    renderOrder={1000001}
	                    depthTest={false}
	                    position={[topGapTextX, (topGapBottomY + topGapTopY) / 2, 0.01]}
	                    fontSize={baseFontSize}
	                    color={textColor}
	                    anchorX="center"
	                    anchorY="middle"
	                    outlineWidth={textOutlineWidth}
	                    outlineColor={textOutlineColor}
	                    rotation={[0, 0, Math.PI / 2]}
	                  >
	                    {topGapMmForDim}
	                  </Text>
	                </group>
	              );
	            })()}

	          </group>
	        );
	      })}

      {/* 선반장(-shelf-) 모듈 입면뷰 각 칸 내경 편집 라벨
          공식: 첫칸=pos[0]-t/2, 중간=pos[i+1]-pos[i]-t, 마지막=sectionH-pos[N-1]-t/2 */}
      {showDimensions && currentViewDirection === 'front' && placedModules.map((module) => {
        const mid = module.moduleId || '';
        // 신발장 카테고리: 현관장 H, 선반장, 선반장+4단서랍, 선반장+2단서랍 모두 포함
        const isShelf = mid.includes('-shelf-') || mid.includes('-entryway-');
        if (!isShelf) return null;
        const moduleData = getModuleById(mid, calculateInternalSpace(spaceInfo), spaceInfo);
        if (!moduleData) return null;
        // 상부장은 sections가 없고 leftSections만 있을 수 있음 (dual-upper-cabinet-shelf-*) → fallback
        const effectiveSections = ((module as any).customSections
          || moduleData.modelConfig?.sections
          || moduleData.modelConfig?.leftSections
          || []) as any[];
        if (!effectiveSections || effectiveSections.length === 0) return null;
        const basicThickness = (moduleData.modelConfig as any)?.basicThickness || 18;
        const floorFinishMm = spaceInfo.hasFloorFinish && spaceInfo.floorFinish?.height ? spaceInfo.floorFinish.height : 0;
        const baseFrameMm = (module as any).hasBase === false ? 0
          : ((module as any).baseFrameHeight ?? (spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height || 65) : 0));
        const floatMm = (module as any).hasBase === false ? ((module as any).individualFloatHeight ?? 0) : 0;
        const cxX = module.position.x;
        const labelX = cxX;
        // 실제 렌더링 공식 동일 (SectionsRenderer)
        // 가구 외경 H = 공간높이 - 상단몰딩 - 받침대
        // availableHeight = H - 2*t (가구 상하판)
        // 마지막 섹션 = availableHeight - 나머지섹션합
        const topFrameMm = spaceInfo.frameSize?.top ?? 30;
        const effectiveTopFrameMm = (module as any).hasTopFrame === false
          ? ((module as any).topFrameGap ?? 0)
          : ((module as any).topFrameThickness ?? topFrameMm);
        const spaceHeightMm = spaceInfo.height || 0;
        // 상부장은 3D 렌더와 동일 공식으로 위치 계산 (천장에서 아래로 붙어 있음)
        // furnitureBottomMm = ceilingH - topFrame - H
        // module.position.y는 배치 시점 값이라 H 변경 시 갱신 안 됨 → 사용 X
        const isUpperCabinet = moduleData.category === 'upper' || mid.includes('upper-cabinet');
        const ownHeightMm = (module as any).customHeight ?? (module as any).freeHeight ?? moduleData.dimensions?.height ?? 0;
        const ceilingHeightForUpper = spaceHeightMm;
        const furnitureBottomMm = isUpperCabinet
          ? Math.max(0, Math.round(ceilingHeightForUpper - effectiveTopFrameMm - ownHeightMm))
          : (floorFinishMm + baseFrameMm + floatMm);
        // 띄움도 가구 외부 빈 공간으로 빼야 입면=측면 일치 (하부 섹션이 흡수하지 않음)
        const furnitureOuterH = isUpperCabinet
          ? ownHeightMm
          : (spaceHeightMm - effectiveTopFrameMm - baseFrameMm - floatMm);
        const availableHeight = furnitureOuterH - 2 * basicThickness;
        // 모듈 원본 sections.height 사용 (useBaseFurniture 비례조정 전 값)
        // useBaseFurniture와 동일 공식: renderHeight = 가구외경, absorb = 가구외경 - 다른섹션합
        // - 현관장 H: 하부 섹션이 흡수
        // - 선반장(single-shelf/dual-shelf): 걸레받이 OFF→하부 흡수, 띄움→하부 차감
        // - 그 외: 마지막 섹션이 흡수
        const isEntrywayEff = mid.includes('-entryway-');
        const isPlainShelfEff = (mid.startsWith('single-shelf-') || mid.startsWith('dual-shelf-'))
          && !mid.includes('-4drawer-shelf-')
          && !mid.includes('-2drawer-shelf-')
          && !mid.includes('shelf-split');
        const isShelfSplitEff = mid.includes('shelf-split');
        const usesStableShelfBoundary = isPlainShelfEff || isShelfSplitEff;
        const originalSections = (moduleData.modelConfig?.sections
          || moduleData.modelConfig?.leftSections
          || []) as any[];
        const heightSourceSections = effectiveSections.length > 0 ? effectiveSections : originalSections;
        let getEffectiveSectionHeight: (_sec: any, idx: number) => number;
        if (usesStableShelfBoundary && heightSourceSections.length >= 2) {
          // 선반장/도어분절 현관장 분배:
          // lowerNew = lowerOrig + baseAbsorbed - floatAbsorbed - baseFrameDelta
          const lowerOrig = heightSourceSections[0].height || 0;
          const globalBaseMm = spaceInfo?.baseConfig?.type === 'floor'
            ? (spaceInfo?.baseConfig?.height ?? 60)
            : 0;
          const baseAbsorbedMm = !isShelfSplitEff && (module as any).hasBase === false
            ? globalBaseMm
            : 0;
          const isFloatPlacement = spaceInfo?.baseConfig?.type === 'stand'
            && spaceInfo?.baseConfig?.placementType === 'float';
          const globalFloatMm = isFloatPlacement ? (spaceInfo?.baseConfig?.floatHeight || 0) : 0;
          const floatAbsorbedMm = isShelfSplitEff
            ? 0
            : (module as any).hasBase === false
            ? Math.max(0, (module as any).individualFloatHeight ?? 0)
            : globalFloatMm;
          const baseFrameDeltaMm = 0;
          const newLowerH = Math.max(0, Math.round(lowerOrig + baseAbsorbedMm - floatAbsorbedMm - baseFrameDeltaMm));
          const remainingUpperH = Math.max(0, Math.round(furnitureOuterH - newLowerH));
          const newUpperH = isShelfSplitEff && Array.isArray((module as any).customSections)
            ? Math.min(remainingUpperH, Math.max(0, Math.round(heightSourceSections[1]?.height || 0)))
            : remainingUpperH;
          getEffectiveSectionHeight = (_sec: any, idx: number) => {
            if (idx === 0) return newLowerH;
            if (idx === 1) return newUpperH;
            return heightSourceSections[idx]?.height || 0;
          };
        } else {
          const absorbIdx = isEntrywayEff ? 0 : heightSourceSections.length - 1;
          const fixedSumOuter = heightSourceSections.reduce((s: number, sec: any, i: number) =>
            i === absorbIdx ? s : s + (sec.height || 0), 0);
          const absorbEffectiveOuter = Math.max(0, furnitureOuterH - fixedSumOuter);
          getEffectiveSectionHeight = (_sec: any, idx: number) => {
            return idx === absorbIdx ? absorbEffectiveOuter : (heightSourceSections[idx]?.height || 0);
          };
        }

        // 가구 내부 바닥(밑판 윗면)에서 섹션 시작
        // 현관장 H/일반 선반장만 하부 흡수 (4단/2단서랍선반장은 일반 가구)
        const isShoeLabel = mid.includes('-entryway-') ||
          mid.startsWith('single-shelf-') ||
          mid.startsWith('dual-shelf-');
        let sectionBottomMm = furnitureBottomMm + basicThickness;
        const output: React.ReactNode[] = [];
        effectiveSections.forEach((section: any, sectionIdx: number) => {
          const sectionHeight = getEffectiveSectionHeight(section, sectionIdx);
          if (section.type !== 'shelf') {
            sectionBottomMm += sectionHeight;
            return;
          }
          // 일반 선반장(single-shelf/dual-shelf)은 하부 섹션에서 띄움/걸레받이를 이미 흡수하므로
          // 상부 스피너에 추가 띄움 보정을 넣으면 실제 선반 위치와 어긋난다.
          const labelOffsetMm = (isShoeLabel && !usesStableShelfBoundary && sectionIdx !== 0) ? -floatMm : 0;
          const rawShelfPositions = [...((section.shelfPositions || []) as number[])].sort((a, b) => a - b);
          const hasCustomShelfPositions = !!(module as any).customSections
            && (section.count ?? 0) > 0
            && rawShelfPositions.length >= (section.count ?? 0);
          const shouldResolveRenderedShelfPositions = usesStableShelfBoundary
            && !hasCustomShelfPositions
            && (section.count ?? 0) > 0
            && rawShelfPositions.length > 0;
          const posArr: number[] = shouldResolveRenderedShelfPositions
            ? calculateEvenShelfPositions(
              Math.max(0, sectionHeight - 2 * basicThickness),
              section.count ?? rawShelfPositions.length,
              basicThickness
            )
            : rawShelfPositions;
          const n = posArr.length;
          if (n === 0) { sectionBottomMm += sectionHeight; return; }
          const halfT = basicThickness / 2;
          // 흡수된 section height 사용 (getEffectiveSectionHeight 결과 우선)
          const sectionOuterH = sectionHeight || (section.height as number);
          const innerH = Math.max(0, sectionOuterH - 2 * basicThickness);
          // gaps: posArr 그대로 사용 (선반 사이 간격 = posArr 차이 그대로)
          const gaps: number[] = [];
          for (let k = 0; k <= n; k++) {
            if (k === 0) {
              gaps.push(Math.max(0, Math.round(posArr[0] - halfT)));
            } else if (k === n) {
              gaps.push(Math.max(0, Math.round(innerH - posArr[n - 1] - halfT)));
            } else {
              gaps.push(Math.max(0, Math.round(posArr[k] - posArr[k - 1] - basicThickness)));
            }
          }
          // 각 칸 중심 Y (신발장 상부 섹션은 labelOffsetMm으로 띄움 보정)
          const centerYs: number[] = [];
          centerYs.push(sectionBottomMm + gaps[0] / 2 + labelOffsetMm);
          for (let i = 1; i < gaps.length; i++) {
            const below = sectionBottomMm + posArr[i - 1] + halfT;
            centerYs.push(below + gaps[i] / 2 + labelOffsetMm);
          }
          const applyGapEdit = (gapIdx: number, newGap: number) => {
            const safeGap = Math.max(0, Math.round(newGap));
            const latestModule = useFurnitureStore.getState().placedModules.find(m => m.id === module.id);
            const latestSections = ((latestModule as any)?.customSections || effectiveSections) as any[];
            const latestSection = latestSections[sectionIdx] || section;
            const latestPositionSource = Array.isArray(latestSection.shelfPositions) && latestSection.shelfPositions.length === n
              ? latestSection.shelfPositions
              : posArr;
            const latestPositions = [...latestPositionSource].sort((a, b) => a - b);
            // 섹션 외경을 spaceInfo 실시간 값으로 재계산 (받침/프레임 변경 즉시 반영)
            const sectionOuterH2 = sectionOuterH;
            const sectionInnerH = Math.max(0, sectionOuterH2 - 2 * basicThickness);
            const latestGaps: number[] = [];
            for (let k = 0; k <= n; k++) {
              if (k === 0) {
                latestGaps.push(Math.max(0, Math.round(latestPositions[0] - halfT)));
              } else if (k === n) {
                latestGaps.push(Math.max(0, Math.round(sectionInnerH - latestPositions[n - 1] - halfT)));
              } else {
                latestGaps.push(Math.max(0, Math.round(latestPositions[k] - latestPositions[k - 1] - basicThickness)));
              }
            }
            const updated = [...latestGaps];
            updated[gapIdx] = safeGap;
            const otherCount = updated.length - 1;
            if (otherCount > 0) {
              const remaining = sectionInnerH - safeGap - n * basicThickness;
              const eachOther = Math.max(0, Math.round(remaining / otherCount));
              for (let k = 0; k < updated.length; k++) {
                if (k !== gapIdx) updated[k] = eachOther;
              }
              // 반올림 오차 흡수
              const lastIdx = gapIdx === updated.length - 1 ? updated.length - 2 : updated.length - 1;
              const sumAll = updated.reduce((s, v) => s + v, 0);
              updated[lastIdx] += Math.round(sectionInnerH - sumAll - n * basicThickness);
              updated[lastIdx] = Math.max(0, updated[lastIdx]);
            }
            // pos[k] = sum(gaps[0..k]) + k*basicThickness + halfT (선반 중심)
            const newPositions: number[] = [];
            let acc = 0;
            for (let k = 0; k < n; k++) {
              acc += updated[k];
              newPositions.push(Math.round(acc + k * basicThickness + halfT));
            }
            const newSections = latestSections.map((s: any) => ({
              ...s,
              ...(Array.isArray(s.shelfPositions) ? { shelfPositions: [...s.shelfPositions] } : {})
            }));
            newSections[sectionIdx] = { ...latestSection, shelfPositions: newPositions };
            updatePlacedModule(module.id, { customSections: newSections });
          };
          // 신발장(현관장 H/선반장)의 하부 섹션 마지막 칸(받침대 아래)은 라벨 표시 안 함
          // 현관장 H/일반 선반장만 받침대 아래 칸 라벨 숨김 (4단/2단서랍선반장은 표시)
          const isShoeGapHide = (mid.includes('-entryway-') ||
            mid.startsWith('single-shelf-') ||
            mid.startsWith('dual-shelf-')) && sectionIdx === 0;
          if (showShelfEditUi)
          gaps.forEach((g, i) => {
            if (isShoeGapHide && i === gaps.length - 1) return; // 432 같은 잘못된 마지막 칸 라벨 숨김
            const cyThree = mmToThreeUnits(centerYs[i]);
            output.push(
              <Html
                key={`shelf-gap-${module.id}-${sectionIdx}-${i}`}
                position={[labelX, cyThree, 0.02]}
                center
                style={{ pointerEvents: 'auto', background: 'transparent' }}
                zIndexRange={[5000, 0]}
                transform={false}
              >
                <div style={{ ...uiScaleStyle, background: 'transparent' }}>
                  <input
                    type="text"
                    defaultValue={String(g)}
                    key={`inp-${module.id}-${sectionIdx}-${i}-${g}`}
                    onBlur={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v) && v !== g) applyGapEdit(i, v);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        e.preventDefault();
                        const cur = parseInt((e.target as HTMLInputElement).value, 10) || 0;
                        applyGapEdit(i, cur + (e.key === 'ArrowUp' ? 1 : -1));
                      }
                    }}
                    style={{
                      width: '88px', fontSize: '18px', textAlign: 'center',
                      color: dimensionColor,
                      background: 'transparent',
                      backgroundColor: 'transparent',
                      border: `1px solid ${dimensionColor}`, borderRadius: '3px',
                      padding: '6px 8px', outline: 'none', fontWeight: 'bold',
                      WebkitTextFillColor: dimensionColor, opacity: 1,
                      WebkitAppearance: 'none',
                      appearance: 'none',
                      boxShadow: 'none',
                    }}
                  />
                </div>
              </Html>
            );
          });
          // 스피너 전용: 클릭한 선반 k만 1mm 이동 (나머지 선반 위치 불변)
          const moveShelf = (k: number, delta: number) => {
            const latestModule = useFurnitureStore.getState().placedModules.find(m => m.id === module.id);
            const latestSections = ((latestModule as any)?.customSections || effectiveSections) as any[];
            const latestSection = latestSections[sectionIdx] || section;
            const latestPositionSource = Array.isArray(latestSection.shelfPositions) && latestSection.shelfPositions.length === n
              ? latestSection.shelfPositions
              : posArr;
            const currentPositions = [...latestPositionSource].sort((a, b) => a - b);
            const newPos = currentPositions[k] + delta;
            // 위/아래 선반/경계와 충돌 방지
            const minBound = k > 0 ? currentPositions[k - 1] + basicThickness : 0;
            const maxBound = k < n - 1 ? currentPositions[k + 1] - basicThickness : innerH;
            if (newPos <= minBound || newPos >= maxBound) return;
            currentPositions[k] = newPos;
            const newSections = latestSections.map((s: any) => ({
              ...s,
              ...(Array.isArray(s.shelfPositions) ? { shelfPositions: [...s.shelfPositions] } : {})
            }));
            newSections[sectionIdx] = { ...latestSection, shelfPositions: currentPositions };
            updatePlacedModule(module.id, { customSections: newSections });
          };
          // 스피너: 각 선반(posArr[k]) 위에 배치 — 선반 위로/아래로 1mm 이동
          if (showShelfEditUi)
          posArr.forEach((pos, k) => {
            const shelfYmm = sectionBottomMm + pos + labelOffsetMm;
            const shelfYThree = mmToThreeUnits(shelfYmm);
            const stopShelfSpinnerEvent = (e: any) => {
              e.preventDefault();
              e.stopPropagation();
              e.nativeEvent?.preventDefault?.();
              e.nativeEvent?.stopPropagation?.();
              e.nativeEvent?.stopImmediatePropagation?.();
            };
            output.push(
              <Html
                key={`shelf-spinner-${module.id}-${sectionIdx}-${k}`}
                position={[labelX, shelfYThree, 0.02]}
                center
                style={{ pointerEvents: 'none', background: 'transparent' }}
                zIndexRange={[5000, 0]}
                transform={false}
              >
                <div style={{ ...uiScaleStyle, background: 'transparent', pointerEvents: 'none' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '40px', lineHeight: 0, background: 'transparent', pointerEvents: 'none' }}>
                  <button
                    type="button"
                    draggable={false}
                    onPointerDown={(e) => {
                      stopShelfSpinnerEvent(e);
                      moveShelf(k, 1);
                    }}
                    onMouseDown={stopShelfSpinnerEvent}
                    onPointerMove={stopShelfSpinnerEvent}
                    onDragStart={stopShelfSpinnerEvent}
                    onClick={stopShelfSpinnerEvent}
                    style={{
                      width: '40px', height: '24px', fontSize: '16px', lineHeight: '1',
                      padding: 0, cursor: 'pointer', margin: 0, boxSizing: 'border-box',
                      color: dimensionColor,
                      background: 'transparent',
                      border: `1px solid ${dimensionColor}`, borderRadius: '3px 3px 0 0',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 'bold',
                      pointerEvents: 'auto',
                      userSelect: 'none',
                      touchAction: 'none',
                    }}
                  >▲</button>
                  <button
                    type="button"
                    draggable={false}
                    onPointerDown={(e) => {
                      stopShelfSpinnerEvent(e);
                      moveShelf(k, -1);
                    }}
                    onMouseDown={stopShelfSpinnerEvent}
                    onPointerMove={stopShelfSpinnerEvent}
                    onDragStart={stopShelfSpinnerEvent}
                    onClick={stopShelfSpinnerEvent}
                    style={{
                      width: '40px', height: '24px', fontSize: '16px', lineHeight: '1',
                      padding: 0, cursor: 'pointer', margin: 0, boxSizing: 'border-box',
                      color: dimensionColor,
                      background: 'transparent',
                      border: `1px solid ${dimensionColor}`, borderTop: 'none',
                      borderRadius: '0 0 3px 3px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 'bold',
                      pointerEvents: 'auto',
                      userSelect: 'none',
                      touchAction: 'none',
                    }}
                  >▼</button>
                </div>
                </div>
              </Html>
            );
          });
          sectionBottomMm += sectionHeight;
        });
        return <React.Fragment key={`shelf-gaps-${module.id}`}>{output}</React.Fragment>;
      })}

      {/* 유리장(glass-cabinet) 정면뷰: 서랍 영역 위치 조절 스피너(▲▼) + 좌측 분할 치수 가이드 */}
      {showDimensions && currentViewDirection === 'front' && placedModules.map((module) => {
        const mid = module.moduleId || '';
        if (!mid.includes('glass-cabinet')) return null;
        const moduleData = getModuleById(mid, calculateInternalSpace(spaceInfo), spaceInfo);
        if (!moduleData) return null;

        // 유리장 외경 H — 상부몰딩 ON/OFF 즉시 반영 (spaceInfo 기반 동적 계산)
        const glassH = resolveGlassCabinetBodyHeightMm(module, moduleData);
        // 유리장 바닥 절대 Y(mm) = 일반 키큰장과 동일한 받침대/사용자 띄움 기준
        const glassBaseMm = spaceInfo.baseConfig?.type === 'floor'
          ? ((module as any).baseFrameHeight ?? spaceInfo.baseConfig?.height ?? 65)
          : 0;
        const glassBottomAbsMm = (module as any).hasBase === false
          ? Math.max(0, (module as any).individualFloatHeight ?? 0)
          : glassBaseMm;
        const glassTopAbsMm = glassBottomAbsMm + glassH;

        // 서랍 영역(측판+바닥판+2단서랍) 측판 사양
        const SIDE_H = 500;
        const DEFAULT_OFFSET = 242;
        const currentOffset = (module as any).glassDrawerOffsetMm ?? DEFAULT_OFFSET;
        const drawerBottomAbsMm = glassBottomAbsMm + currentOffset;
        const drawerTopAbsMm = drawerBottomAbsMm + SIDE_H;
        const drawerCenterAbsMm = (drawerBottomAbsMm + drawerTopAbsMm) / 2;

        const moveOffset = (delta: number) => {
          const next = Math.max(0, Math.min(glassH - SIDE_H, currentOffset + delta));
          if (next === currentOffset) return;
          updatePlacedModule(module.id, { glassDrawerOffsetMm: next });
        };

        // 3개 분할 영역 mm: 상부오픈 / 서랍 / 하부오픈
        const upperH = Math.max(0, Math.round(glassTopAbsMm - drawerTopAbsMm));
        const drawerH = Math.max(0, Math.round(drawerTopAbsMm - drawerBottomAbsMm));
        const lowerH = Math.max(0, Math.round(drawerBottomAbsMm - glassBottomAbsMm));

        // 좌측 가이드 X (모듈 좌측 외부, 가구 좌측에서 약 60mm 떨어진 위치)
        const moduleWidthMm = (module.moduleWidth || (module as any).slotCustomWidth || moduleData.dimensions?.width || 600);
        const cxX = module.position.x;
        const leftGuideX = cxX - mmToThreeUnits(moduleWidthMm / 2 + 30);
        const leftTextX = leftGuideX - mmToThreeUnits(20);

        const yGlassBottom = mmToThreeUnits(glassBottomAbsMm);
        const yGlassTop = mmToThreeUnits(glassTopAbsMm);
        const yDrawerBottom = mmToThreeUnits(drawerBottomAbsMm);
        const yDrawerTop = mmToThreeUnits(drawerTopAbsMm);

        const tickW = mmToThreeUnits(15);
        const drawCenterYThree = mmToThreeUnits(drawerCenterAbsMm);

        return (
          <React.Fragment key={`glass-drawer-controls-${module.id}`}>
            {/* 좌측 분할 가이드선 (수직 메인선 + 4개 가로 틱) */}
            <NativeLine name="dimension_line"
              points={[[leftGuideX, yGlassBottom, 0.002], [leftGuideX, yGlassTop, 0.002]]}
              color={dimensionColor} lineWidth={0.6}
            />
            <NativeLine name="dimension_line"
              points={[[leftGuideX - tickW/2, yGlassBottom, 0.002], [leftGuideX + tickW/2, yGlassBottom, 0.002]]}
              color={dimensionColor} lineWidth={0.6}
            />
            <NativeLine name="dimension_line"
              points={[[leftGuideX - tickW/2, yDrawerBottom, 0.002], [leftGuideX + tickW/2, yDrawerBottom, 0.002]]}
              color={dimensionColor} lineWidth={0.6}
            />
            <NativeLine name="dimension_line"
              points={[[leftGuideX - tickW/2, yDrawerTop, 0.002], [leftGuideX + tickW/2, yDrawerTop, 0.002]]}
              color={dimensionColor} lineWidth={0.6}
            />
            <NativeLine name="dimension_line"
              points={[[leftGuideX - tickW/2, yGlassTop, 0.002], [leftGuideX + tickW/2, yGlassTop, 0.002]]}
              color={dimensionColor} lineWidth={0.6}
            />
            {/* 3개 치수 텍스트 (하/상은 클릭하여 직접 입력 가능, 중간 서랍 H는 고정 500) */}
            {readOnly ? (
              <Text
                position={[leftTextX, (yGlassBottom + yDrawerBottom) / 2, 0.01]}
                fontSize={baseFontSize}
                color={textColor}
                anchorX="right"
                anchorY="middle"
                outlineWidth={textOutlineWidth}
                outlineColor={textOutlineColor}
              >
                {lowerH}
              </Text>
            ) : (
              <Html
                position={[leftTextX, (yGlassBottom + yDrawerBottom) / 2, 0.01]}
                center
                style={{ pointerEvents: 'auto', background: 'transparent' }}
                occlude={false}
                zIndexRange={[10000, 10]}
                transform={false}
              >
                <GlassDrawerGapEditor
                  value={lowerH}
                  color={dimensionColor}
                  onChange={(v) => {
                    const maxOffset = Math.max(0, glassH - SIDE_H);
                    const next = Math.max(0, Math.min(maxOffset, v));
                    updatePlacedModule(module.id, { glassDrawerOffsetMm: next });
                  }}
                />
              </Html>
            )}
            <Text
              position={[leftTextX, (yDrawerBottom + yDrawerTop) / 2, 0.01]}
              fontSize={baseFontSize}
              color={textColor}
              anchorX="right"
              anchorY="middle"
              outlineWidth={textOutlineWidth}
              outlineColor={textOutlineColor}
            >
              {drawerH}
            </Text>
            {readOnly ? (
              <Text
                position={[leftTextX, (yDrawerTop + yGlassTop) / 2, 0.01]}
                fontSize={baseFontSize}
                color={textColor}
                anchorX="right"
                anchorY="middle"
                outlineWidth={textOutlineWidth}
                outlineColor={textOutlineColor}
              >
                {upperH}
              </Text>
            ) : (
              <Html
                position={[leftTextX, (yDrawerTop + yGlassTop) / 2, 0.01]}
                center
                style={{ pointerEvents: 'auto', background: 'transparent' }}
                occlude={false}
                zIndexRange={[10000, 10]}
                transform={false}
              >
                <GlassDrawerGapEditor
                  value={upperH}
                  color={dimensionColor}
                  onChange={(v) => {
                    const maxOffset = Math.max(0, glassH - SIDE_H);
                    const next = Math.max(0, Math.min(maxOffset, glassH - SIDE_H - v));
                    updatePlacedModule(module.id, { glassDrawerOffsetMm: next });
                  }}
                />
              </Html>
            )}

            {/* 서랍 영역 위치 조절 스피너 (▲▼) — 더 크게 */}
            {!readOnly && <Html
              position={[cxX, drawCenterYThree, 0.02]}
              center
              style={{ pointerEvents: 'auto', background: 'transparent' }}
              zIndexRange={[5000, 0]}
              transform={false}
            >
              <div style={{ ...uiScaleStyle, background: 'transparent' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '60px', lineHeight: 0, background: 'transparent', gap: '3px' }}>
                  <button
                    type="button"
                    draggable={false}
                    onPointerDown={(e) => {
                      stopShelfSpinnerEvent(e);
                      moveOffset(1);
                    }}
                    onMouseDown={stopShelfSpinnerEvent}
                    onPointerMove={stopShelfSpinnerEvent}
                    onDragStart={stopShelfSpinnerEvent}
                    onClick={stopShelfSpinnerEvent}
                    style={{
                      width: '36px', height: '26px', padding: 0, lineHeight: '26px',
                      background: 'rgba(255,255,255,0.95)',
                      color: '#000', border: '1px solid rgba(0,0,0,0.5)', borderRadius: '4px',
                      cursor: 'pointer', fontSize: '16px', fontWeight: 'bold',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                      userSelect: 'none',
                      touchAction: 'none',
                    }}
                  >▲</button>
                  <button
                    type="button"
                    draggable={false}
                    onPointerDown={(e) => {
                      stopShelfSpinnerEvent(e);
                      moveOffset(-1);
                    }}
                    onMouseDown={stopShelfSpinnerEvent}
                    onPointerMove={stopShelfSpinnerEvent}
                    onDragStart={stopShelfSpinnerEvent}
                    onClick={stopShelfSpinnerEvent}
                    style={{
                      width: '36px', height: '26px', padding: 0, lineHeight: '26px',
                      background: 'rgba(255,255,255,0.95)',
                      color: '#000', border: '1px solid rgba(0,0,0,0.5)', borderRadius: '4px',
                      cursor: 'pointer', fontSize: '16px', fontWeight: 'bold',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                      userSelect: 'none',
                      touchAction: 'none',
                    }}
                  >▼</button>
                </div>
              </div>
            </Html>}
          </React.Fragment>
        );
      })}

      {/* 3D: 좌·우 끝에 배치된 유리장은 측면(가구 좌·우 옆) 분할 치수 추가 표시 */}
      {showDimensions && currentViewDirection === '3D' && placedModules.map((module) => {
        const mid = module.moduleId || '';
        if (!mid.includes('glass-cabinet')) return null;
        const moduleData = getModuleById(mid, calculateInternalSpace(spaceInfo), spaceInfo);
        if (!moduleData) return null;

        const moduleWidthMm = (module.moduleWidth || (module as any).slotCustomWidth || moduleData.dimensions?.width || 600);
        const moduleHalfW = mmToThreeUnits(moduleWidthMm / 2);
        const moduleLeftX = module.position.x - moduleHalfW;
        const moduleRightX = module.position.x + moduleHalfW;

        // 공간 좌·우 경계 (벽 안쪽)
        const spaceLeftX = leftOffset;
        const spaceRightX = leftOffset + mmToThreeUnits(spaceInfo.width);
        const EDGE_TOLERANCE = mmToThreeUnits(50); // 끝 판정 허용 오차

        const isLeftEnd = Math.abs(moduleLeftX - spaceLeftX) < EDGE_TOLERANCE;
        const isRightEnd = Math.abs(moduleRightX - spaceRightX) < EDGE_TOLERANCE;
        if (!isLeftEnd && !isRightEnd) return null;

        // 측면 가이드 X — 가구 외측에 가이드 표시
        const guideOffset = mmToThreeUnits(80);
        const textOffset = mmToThreeUnits(140);
        const sideX = isLeftEnd
          ? moduleLeftX - guideOffset
          : moduleRightX + guideOffset;
        const textX = isLeftEnd
          ? moduleLeftX - textOffset
          : moduleRightX + textOffset;
        // lineZ/textZ는 가구 측면(YZ 평면) 위에 평면적으로 — 가구 깊이 중앙(0)
        const lineZ = 0;
        const textZ = 0;

        return (
          <React.Fragment key={`glass-3d-side-split-${module.id}`}>
            {renderGlassDrawerSideSplitDimensions(
              module,
              sideX,
              lineZ,
              textZ,
              isLeftEnd ? `3d-left-${module.id}` : `3d-right-${module.id}`
            )}
          </React.Fragment>
        );
      })}

      {/* 자유배치: 가구 없는 구간의 전체 폭 치수 (slotDimensionY 레벨) — 가구 있을 때만 */}
      {isFreePlacement && showDimensions && hasPlacedModules && (spaceInfo.stepCeiling?.enabled) && (() => {
        // 각 구간(메인/단내림)에 가구가 있는지 확인
        const stepDownWidthMm = isFreePlacement
          ? (spaceInfo.stepCeiling?.width || 0)
          : (spaceInfo.droppedCeiling?.width || 0);
        const stepDownPos = isFreePlacement
          ? (spaceInfo.stepCeiling?.position || 'right')
          : (spaceInfo.droppedCeiling?.position || 'right');

        // 자유배치 커튼박스 폭 (droppedCeiling)
        const freeCbW = (isFreePlacement && spaceInfo.droppedCeiling?.enabled)
          ? (spaceInfo.droppedCeiling.width || 0) : 0;
        // 구간 경계 (leftOffset 기반, Three.js 좌표, 커튼박스 제외)
        const mainZoneStartX = stepDownPos === 'left'
          ? leftOffset + mmToThreeUnits(stepDownWidthMm + freeCbW)
          : leftOffset;
        const mainZoneEndX = stepDownPos === 'right'
          ? leftOffset + mmToThreeUnits(spaceInfo.width - stepDownWidthMm - freeCbW)
          : leftOffset + mmToThreeUnits(spaceInfo.width);
        const scZoneStartX = stepDownPos === 'left'
          ? leftOffset + mmToThreeUnits(freeCbW)
          : leftOffset + mmToThreeUnits(spaceInfo.width - stepDownWidthMm - freeCbW);
        const scZoneEndX = stepDownPos === 'left'
          ? leftOffset + mmToThreeUnits(stepDownWidthMm + freeCbW)
          : leftOffset + mmToThreeUnits(spaceInfo.width - freeCbW);

        // 가구가 해당 구간에 있는지
        const validDims = furnitureDimensions ? furnitureDimensions.filter(Boolean) : [];
        const hasFurnitureInMain = validDims.some((d: any) => {
          const mL = d.moduleX - mmToThreeUnits(d.actualWidth / 2);
          const mR = d.moduleX + mmToThreeUnits(d.actualWidth / 2);
          return mL >= mainZoneStartX - 0.001 && mR <= mainZoneEndX + 0.001;
        });
        const hasFurnitureInSC = validDims.some((d: any) => {
          const mL = d.moduleX - mmToThreeUnits(d.actualWidth / 2);
          const mR = d.moduleX + mmToThreeUnits(d.actualWidth / 2);
          return mL >= scZoneStartX - 0.001 && mR <= scZoneEndX + 0.001;
        });

        const dimY = slotDimensionY;
        const zones: { startX: number; endX: number; widthMm: number }[] = [];
        if (!hasFurnitureInMain) {
          zones.push({ startX: mainZoneStartX, endX: mainZoneEndX, widthMm: spaceInfo.width - stepDownWidthMm - freeCbW });
        }
        if (!hasFurnitureInSC) {
          zones.push({ startX: scZoneStartX, endX: scZoneEndX, widthMm: stepDownWidthMm });
        }

        return zones.map((zone, zi) => (
          <group key={`empty-zone-dim-${zi}`}>
            <NativeLine name="dimension_line"
              points={[[zone.startX, dimY, 0.002], [zone.endX, dimY, 0.002]]}
              color={dimensionColor} lineWidth={0.6} renderOrder={1000000} depthTest={false}
            />
            <NativeLine name="dimension_line"
              points={createArrowHead([zone.startX, dimY, 0.002], [zone.startX + 0.02, dimY, 0.002], 0.01)}
              color={dimensionColor} lineWidth={0.6} renderOrder={1000000} depthTest={false}
            />
            <NativeLine name="dimension_line"
              points={createArrowHead([zone.endX, dimY, 0.002], [zone.endX - 0.02, dimY, 0.002], 0.01)}
              color={dimensionColor} lineWidth={0.6} renderOrder={1000000} depthTest={false}
            />
            <Text renderOrder={1000000} depthTest={false}
              position={[(zone.startX + zone.endX) / 2, dimY + mmToThreeUnits(30), 0.01]}
              fontSize={baseFontSize} color={textColor}
              anchorX="center" anchorY="middle"
              outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
            >
              {Math.round(zone.widthMm)}
            </Text>
          </group>
        ));
      })()}

      {/* 서라운드 모드 프레임 실제 사이즈 — 제거됨 (프레임 내경 치수는 불필요) */}

      {/* 슬롯배치: 빈 슬롯 치수 표시 (4단: slotDimensionY) — 가구가 없는 슬롯 폭 */}
      {showDimensions && !isFreePlacement && currentViewDirection !== '3D' && (() => {
        const boundaries = indexing.threeUnitBoundaries;
        const slotWidthsArr = indexing.slotWidths;
        if (!boundaries || boundaries.length < 2 || !slotWidthsArr) return null;

        // 점유 슬롯 인덱스 집합 (자유배치 제외)
        const occupiedSet = new Set<number>();
        placedModules.forEach(m => {
          if (m.isFreePlacement) return;
          if (typeof m.slotIndex !== 'number') return;
          occupiedSet.add(m.slotIndex);
          if (m.isDualSlot) occupiedSet.add(m.slotIndex + 1);
        });

        const dimY = slotDimensionY;
        const elements: JSX.Element[] = [];
        for (let i = 0; i < slotWidthsArr.length; i++) {
          if (occupiedSet.has(i)) continue;
          const startX = boundaries[i];
          const endX = boundaries[i + 1];
          if (startX === undefined || endX === undefined) continue;
          const widthMm = slotWidthsArr[i];
          elements.push(
            <group key={`empty-slot-dim-${i}`}>
              <NativeLine name="dimension_line"
                points={[[startX, dimY, 0.002], [endX, dimY, 0.002]]}
                color={dimensionColor} lineWidth={0.6} renderOrder={1000000} depthTest={false}
              />
              <NativeLine name="dimension_line"
                points={createArrowHead([startX, dimY, 0.002], [startX + 0.015, dimY, 0.002], 0.01)}
                color={dimensionColor} lineWidth={0.6} renderOrder={1000000} depthTest={false}
              />
              <NativeLine name="dimension_line"
                points={createArrowHead([endX, dimY, 0.002], [endX - 0.015, dimY, 0.002], 0.01)}
                color={dimensionColor} lineWidth={0.6} renderOrder={1000000} depthTest={false}
              />
              <Text renderOrder={1000000} depthTest={false}
                position={[(startX + endX) / 2, dimY + mmToThreeUnits(20), 0.01]}
                fontSize={baseFontSize} color={textColor}
                anchorX="center" anchorY="middle"
                outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
              >
                {(() => { const v = Math.round(widthMm * 2) / 2; return v % 1 === 0 ? v : v.toFixed(1); })()}
              </Text>
            </group>
          );
        }
        return <>{elements}</>;
      })()}

      {/* 슬롯배치 커튼박스 내경 치수선 (4단: slotDimensionY) — cbWidth - 경계이격 */}
      {showDimensions && !isStep2 && !isFreePlacement && spaceInfo.curtainBox?.enabled && (() => {
        const cbW = spaceInfo.curtainBox!.width || 150;
        const cbPos = spaceInfo.curtainBox!.position || 'right';
        // 경계쪽 이격: 전체서라운드/양쪽서라운드는 1.5 고정, 노서라운드만 gapConfig 사용
        const isNoSurround = spaceInfo.surroundType === 'no-surround';
        const hasDCForCB = !!spaceInfo.droppedCeiling?.enabled;
        const boundaryGap = isNoSurround
          ? (hasDCForCB ? (spaceInfo.gapConfig?.middle2 ?? 1.5) : (spaceInfo.gapConfig?.middle ?? 1.5))
          : 1.5;
        const internalW = cbW - boundaryGap;
        if (internalW <= 0) return null;
        const dimY = slotDimensionY;
        const rightEdge = mmToThreeUnits(spaceInfo.width) + leftOffset;
        // 우측 CB: 경계쪽(좌측)에서 boundaryGap만큼 안쪽
        // 좌측 CB: 경계쪽(우측)에서 boundaryGap만큼 안쪽
        const cbStartX = cbPos === 'right'
          ? rightEdge - mmToThreeUnits(cbW) + mmToThreeUnits(boundaryGap)
          : leftOffset;
        const cbEndX = cbPos === 'right'
          ? rightEdge
          : leftOffset + mmToThreeUnits(cbW) - mmToThreeUnits(boundaryGap);
        const fmtVal = (() => { const r = Math.round(internalW * 10) / 10; return r % 1 === 0 ? String(r) : r.toFixed(1); })();
        return (
          <group>
            <NativeLine name="dimension_line"
              points={[[cbStartX, dimY, 0.002], [cbEndX, dimY, 0.002]]}
              color={dimensionColor} lineWidth={0.6} renderOrder={1000000} depthTest={false}
            />
            <NativeLine name="dimension_line"
              points={createArrowHead([cbStartX, dimY, 0.002], [cbStartX + 0.02, dimY, 0.002], 0.01)}
              color={dimensionColor} lineWidth={0.6} renderOrder={1000000} depthTest={false}
            />
            <NativeLine name="dimension_line"
              points={createArrowHead([cbEndX, dimY, 0.002], [cbEndX - 0.02, dimY, 0.002], 0.01)}
              color={dimensionColor} lineWidth={0.6} renderOrder={1000000} depthTest={false}
            />
            <Text renderOrder={1000000} depthTest={false}
              position={[(cbStartX + cbEndX) / 2, dimY + mmToThreeUnits(30), 0.01]}
              fontSize={baseFontSize} color={textColor}
              anchorX="center" anchorY="middle"
              outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
            >{fmtVal}</Text>
          </group>
        );
      })()}

      {/* 기둥별 상단 너비 치수선 */}
      {showDimensions && spaceInfo.columns && spaceInfo.columns.length > 0 && (currentViewDirection === 'front' || currentViewDirection === '3D') && spaceInfo.columns.map((column) => {
        const columnWidthM = column.width * 0.01;
        const leftX = column.position[0] - columnWidthM / 2;
        const rightX = column.position[0] + columnWidthM / 2;
        const dimY = slotDimensionY;
        const tickHalf = mmToThreeUnits(18);
        const columnTopY = mmToThreeUnits(Math.min(column.height || spaceInfo.height, spaceInfo.height));
        const isLockedColumn = !!column.isLocked;
        const isEditingColumnWidth = !isLockedColumn && editingColumnId === column.id && editingSide === 'width';

        return (
          <group key={`column-dim-${column.id}`}>
            <NativeLine name="dimension_line"
              points={[[leftX, dimY, 0.002], [rightX, dimY, 0.002]]}
              color={columnDimensionColor}
              lineWidth={0.6}
              renderOrder={1000000}
              depthTest={false}
            />

            <NativeLine name="dimension_line"
              points={createArrowHead([leftX, dimY, 0.002], [leftX + 0.02, dimY, 0.002], 0.01)}
              color={columnDimensionColor}
              lineWidth={0.6}
              renderOrder={1000000}
              depthTest={false}
            />

            <NativeLine name="dimension_line"
              points={createArrowHead([rightX, dimY, 0.002], [rightX - 0.02, dimY, 0.002], 0.01)}
              color={columnDimensionColor}
              lineWidth={0.6}
              renderOrder={1000000}
              depthTest={false}
            />

            {isEditingColumnWidth ? (
              <Html
                position={[column.position[0], dimY + mmToThreeUnits(30), 0.01]}
                center
                style={{ pointerEvents: 'auto' }}
                zIndexRange={[10000, 10001]}
              >
                <div style={{ background: currentViewDirection !== '3D' && view2DTheme === 'dark' ? 'rgba(31,41,55,0.98)' : 'rgba(255,255,255,0.98)', padding: '3px', borderRadius: '4px', border: '2px solid #2196F3', boxShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
                  <input
                    ref={inputRef}
                    type="number"
                    step="0.1"
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleEditSubmit(); else if (e.key === 'Escape') handleEditCancel(); }}
                    onBlur={handleEditSubmit}
                    style={{ width: '60px', padding: '2px 4px', border: '1px solid #555', borderRadius: '2px', fontSize: '12px', fontWeight: 'bold', textAlign: 'center', outline: 'none', background: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#1f2937' : '#fff', color: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#fff' : '#000' }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  />
                  <span style={{ marginLeft: '2px', fontSize: '11px', color: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#9ca3af' : '#666' }}>mm</span>
                </div>
              </Html>
            ) : (
              <Html
                position={[column.position[0], dimY + mmToThreeUnits(30), 0.01]}
                center
                style={{ pointerEvents: 'auto' }}
                zIndexRange={[9999, 10000]}
              >
                <div
                  style={{
                    padding: '2px 6px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    color: columnDimensionColor,
                    cursor: readOnly || isLockedColumn ? 'default' : 'pointer',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                    background: currentViewDirection !== '3D' && view2DTheme === 'dark' ? 'rgba(31,41,55,0.7)' : 'rgba(255,255,255,0.7)',
                    borderRadius: '3px',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!readOnly && !isLockedColumn) handleColumnDistanceEdit(column.id, 'width', column.width);
                  }}
                >
                  {formatMmValue(column.width)}
                </div>
              </Html>
            )}

            <NativeLine name="dimension_line"
              points={[[leftX, columnTopY, 0.001], [leftX, dimY + tickHalf, 0.001]]}
              color={columnDimensionColor}
              lineWidth={0.3}
              renderOrder={1000000}
              depthTest={false}
              depthWrite={false}
              transparent={true}
            />
            <NativeLine name="dimension_line"
              points={[[rightX, columnTopY, 0.001], [rightX, dimY + tickHalf, 0.001]]}
              color={columnDimensionColor}
              lineWidth={0.3}
              renderOrder={1000000}
              depthTest={false}
              depthWrite={false}
              transparent={true}
            />
          </group>
        );
      })}
      
      {/* 단내림 구간 치수선 - 탑뷰: 새 코드(line ~7005)로 통합됨 */}
        </>
      )}
      
      {/* 발통 심볼 - 정면뷰 */}
      {placedModules.map((module, index) => {
        const moduleData = getModuleById(module.moduleId);
        if (!moduleData) return null;
        
        const moduleX = module.position.x;
        const moduleWidth = ((module.isFreePlacement && module.freeWidth) ? module.freeWidth : (module.adjustedWidth || moduleData.dimensions.width)) * 0.01;
        
        // 가구 하단 중앙에 발통 심볼 배치
        return (
          <group key={`footstool-front-${module.id || index}`}>
            {renderFootstoolSymbol(
              moduleX, 
              mmToThreeUnits(100), // 바닥에서 100mm 위
              0.01
            )}
          </group>
        );
      })}
    </group>
  );

  // 좌측뷰 치수선 - Room.tsx와 정확히 동일한 좌표계 사용
  const renderLeftView = () => {
    if (currentViewDirection !== 'left') return null;
    
    // Room.tsx와 동일한 계산 - 실제 spaceInfo 값 사용
    const panelDepthMm = spaceInfo.depth || 600; // 실제 공간 깊이 사용
    const furnitureDepthMm = 600; // 가구 공간 깊이는 고정
    const panelDepth = mmToThreeUnits(panelDepthMm);
    const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
    
    // Room.tsx와 완전히 동일한 Z 오프셋 계산
    const spaceZOffset = -panelDepth / 2; // 공간 메쉬용 깊이 중앙
    const furnitureZOffset = spaceZOffset + (panelDepth - furnitureDepth) / 2; // 가구/프레임용
    
    // 실제 공간 크기 (Room.tsx와 동일)
    const actualSpaceWidth = mmToThreeUnits(spaceInfo.width);
    const actualSpaceHeight = mmToThreeUnits(spaceInfo.height);
    
    const frameSize = spaceInfo.frameSize || { left: 50, right: 50, top: 50 };
    const topDimensionY = actualSpaceHeight + mmToThreeUnits(hasPlacedModules ? 280 : 200);
    const leftDimensionX = -mmToThreeUnits(200); // 좌측 치수선 X 위치
    
    return (
      <group>
        {/* 상단 전체 깊이 치수선 - 숨김 */}
        {/* <group>
          {/* 치수선 *}
          <Line
            points={[[leftDimensionX, topDimensionY, spaceZOffset], [leftDimensionX, topDimensionY, spaceZOffset + panelDepth]]}
            color={dimensionColor}
            lineWidth={0.6}
          />
          
          {/* 전면 화살표 *}
          <Line
            points={createArrowHead([leftDimensionX, topDimensionY, spaceZOffset], [leftDimensionX, topDimensionY, spaceZOffset + 0.05])}
            color={dimensionColor}
            lineWidth={0.6}
          />
          
          {/* 후면 화살표 *}
          <Line
            points={createArrowHead([leftDimensionX, topDimensionY, spaceZOffset + panelDepth], [leftDimensionX, topDimensionY, spaceZOffset + panelDepth - 0.05])}
            color={dimensionColor}
            lineWidth={0.6}
          />
          
          {/* 전체 깊이 치수 텍스트 *}
          {(showDimensionsText || isStep2) && (
            <Text
                  renderOrder={100001}
                  depthTest={false}
              position={[leftDimensionX - mmToThreeUnits(60), topDimensionY, spaceZOffset + panelDepth / 2]}
              fontSize={largeFontSize}
              color={textColor}
              anchorX="center"
              anchorY="middle"
              outlineWidth={textOutlineWidth}
              outlineColor={textOutlineColor}
              rotation={[0, Math.PI / 2, 0]}
            >
              {spaceInfo.depth}
            </Text>
          )}
          
          {/* 연장선 (전면) *}
          <Line
            points={[[0, 0, spaceZOffset], [leftDimensionX - mmToThreeUnits(20), 0, spaceZOffset]]}
            color={dimensionColor}
            lineWidth={0.6}
          />
          <Line
            points={[[0, actualSpaceHeight, spaceZOffset], [leftDimensionX - mmToThreeUnits(20), actualSpaceHeight, spaceZOffset]]}
            color={dimensionColor}
            lineWidth={0.6}
          />
          
          {/* 연장선 (후면) *}
          <Line
            points={[[0, 0, spaceZOffset + panelDepth], [leftDimensionX - mmToThreeUnits(20), 0, spaceZOffset + panelDepth]]}
            color={dimensionColor}
            lineWidth={0.6}
          />
          <Line
            points={[[0, actualSpaceHeight, spaceZOffset + panelDepth], [leftDimensionX - mmToThreeUnits(20), actualSpaceHeight, spaceZOffset + panelDepth]]}
            color={dimensionColor}
            lineWidth={0.6}
          />
        </group> */}

        {/* 우측 3구간 높이 치수선 표시 */}
        {showDimensions && <group>
          {(() => {
            const sideDimensionOffsetZ = mmToThreeUnits(120);

            // useMemo로 메모이제이션된 값 사용
            const {
              maxLowerCabinetHeightMm,
              maxUpperCabinetHeightMm,
              adjustedUpperCabinetHeightMm,
              isFloating,
              floatHeight,
              floorFinishHeightMm,
              bottomFrameHeight: globalBottomFrame,
              topFrameHeight: globalTopFrame
            } = furnitureHeights;

            // 개별 모듈의 baseFrameHeight 우선 사용 (선택된 슬롯 기준 가구)
            const viewMod = sideViewMod || leftmostModules[0];
            const getSideCategory = (mod: typeof viewMod) => {
              if (!mod) return 'full';
              const modData = getModuleById(mod.moduleId);
              return modData?.category
                ?? (mod.moduleId.includes('upper') ? 'upper'
                  : mod.moduleId.includes('lower') ? 'lower' : 'full');
            };
            const viewModCategoryForFrame = getSideCategory(viewMod);
            const findSideCompanion = (targetCategory: string) => {
              if (!viewMod) return undefined;
              return placedModules.find(m => {
                if (m.id === viewMod.id) return false;
                const bothHaveSlot = m.slotIndex !== undefined && viewMod.slotIndex !== undefined;
                const samePos = bothHaveSlot
                  ? m.slotIndex === viewMod.slotIndex
                  : Math.abs((m.position?.x ?? 0) - (viewMod.position?.x ?? 0)) < 300;
                return samePos && getSideCategory(m) === targetCategory;
              });
            };
            const bottomFrameRefMod = viewModCategoryForFrame === 'upper'
              ? findSideCompanion('lower')
              : viewMod;
            const topFrameRefMod = viewModCategoryForFrame === 'lower'
              ? (findSideCompanion('upper') ?? viewMod)
              : viewMod;
            const bottomFrameRefCategory = getSideCategory(bottomFrameRefMod);
            const lowerTopFinishRefMod = bottomFrameRefCategory === 'lower'
              ? bottomFrameRefMod
              : findSideCompanion('lower');
            // 가구별 상단몰딩/상단갭 우선 (하부 OFF 시 상단몰딩이 확장된 값 반영)
            const isTopFrameOff = topFrameRefMod?.hasTopFrame === false;
            const rawTopFrame = topFrameRefMod?.topFrameThickness ?? globalTopFrame;
            // 하부 OFF 시 상단몰딩에 흡수된 걸래받이 크기 (FurnitureItem의 topDelta 계산과 동일)
            const globalBaseMm = spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 60) : 0;
            const canAbsorbBaseInSideView = bottomFrameRefCategory === 'full' || bottomFrameRefCategory === 'lower';
            const isShelfSplitSideView = !!viewMod?.moduleId?.includes('shelf-split')
              || !!bottomFrameRefMod?.moduleId?.includes('shelf-split')
              || !!topFrameRefMod?.moduleId?.includes('shelf-split');
            const canAbsorbBaseIntoTopFrame = bottomFrameRefCategory === 'full' && !isShelfSplitSideView;
            const baseFrameAbsorbed = canAbsorbBaseIntoTopFrame && bottomFrameRefMod?.hasBase === false
              ? (bottomFrameRefMod.baseFrameHeight ?? globalBaseMm)
              : 0;
            const bottomFrameHeight = canAbsorbBaseInSideView && bottomFrameRefMod?.hasBase === false
              ? (bottomFrameRefMod.individualFloatHeight ?? 0)
              : (bottomFrameRefMod?.baseFrameHeight !== undefined && spaceInfo.baseConfig?.type === 'floor')
                ? bottomFrameRefMod.baseFrameHeight : globalBottomFrame;
            const bottomFrameGapHeight = canAbsorbBaseInSideView && bottomFrameRefMod?.hasBase === false
              ? 0
              : Math.max(0, Math.min(bottomFrameHeight, (bottomFrameRefMod as any)?.baseFrameGap ?? 0));
            const bottomFrameVisibleHeight = Math.max(0, bottomFrameHeight - bottomFrameGapHeight);
            const moduleFloatHeight = canAbsorbBaseInSideView && bottomFrameRefMod?.hasBase === false
              ? Math.max(0, Math.round(bottomFrameRefMod.individualFloatHeight ?? 0))
              : 0;
            const sideIsFloating = isFloating || moduleFloatHeight > 0;
            const sideFloatHeight = isFloating ? floatHeight : moduleFloatHeight;
            const sideBodyStartMm = sideIsFloating ? floorFinishHeightMm + sideFloatHeight : bottomFrameHeight;
            const shelfSplitDynamicTopFrame = (() => {
              const refMod = topFrameRefMod ?? viewMod;
              const sections = Array.isArray((refMod as any)?.customSections) ? (refMod as any).customSections : [];
              if (!refMod?.moduleId?.includes('shelf-split') || sections.length < 2) return null;
              const bodyTopMm = bottomFrameHeight + sections
                .slice(0, 2)
                .reduce((sum: number, section: any) => sum + (Number(section?.height) || 0), 0);
              return Math.max(0, Math.round(spaceInfo.height - bodyTopMm));
            })();
            const topFrameHeight = isTopFrameOff
              ? Math.max(0, Math.round(shelfSplitDynamicTopFrame ?? topFrameRefMod?.topFrameGap ?? 0))
              : Math.max(0, rawTopFrame - baseFrameAbsorbed);
            const hasUpperTopFrameRef = getSideCategory(topFrameRefMod) === 'upper';
            const topFrameDimensionValue = isTopFrameOff
              ? Math.max(0, Math.round(shelfSplitDynamicTopFrame ?? topFrameRefMod?.topFrameGap ?? 0))
              : Math.max(0, Math.round((hasUpperTopFrameRef ? rawTopFrame : topFrameHeight) ?? 0));
            const topFrameDimensionHeight = topFrameHeight > 0 ? topFrameHeight : topFrameDimensionValue;
            const topSegmentColor = frameDimensionColor;
            const topFinishThicknessMm = lowerTopFinishRefMod
              ? resolveLowerTopFinishThicknessMm(lowerTopFinishRefMod, spaceInfo)
              : 0;
            // console.log('🔍 [CleanCAD2D 좌측 치수]', { ... }); // 진단용 로그 제거 (성능)
            // hasBase=false → 걸래받이 0 (individualFloatHeight만 반영)
            const bottomFrameRefData = bottomFrameRefMod
              ? getModuleById(bottomFrameRefMod.moduleId, calculateInternalSpace(spaceInfo), spaceInfo)
              : null;
            const topFrameRefData = topFrameRefMod
              ? getModuleById(topFrameRefMod.moduleId, calculateInternalSpace(spaceInfo), spaceInfo)
              : null;
            const lowerGuideFrontZ = bottomFrameRefMod && bottomFrameRefData
              ? resolveSideDimensionDepthSpanZ(bottomFrameRefMod, bottomFrameRefData, 'lower', furnitureZOffset, furnitureDepth).frontZ
              : spaceZOffset;
            const upperGuideFrontZ = topFrameRefMod && topFrameRefData
              ? resolveSideDimensionDepthSpanZ(topFrameRefMod, topFrameRefData, 'upper', furnitureZOffset, furnitureDepth).frontZ
              : lowerGuideFrontZ;
            const rightDimensionZ = Math.max(lowerGuideFrontZ, upperGuideFrontZ) + sideDimensionOffsetZ;
            const sideSectionHeights = (() => {
              if (!viewMod || viewModCategoryForFrame !== 'full') return [] as number[];
              const mid = viewMod.moduleId || '';
              const modData = getModuleById(mid, calculateInternalSpace(spaceInfo), spaceInfo);
              const sections = (((viewMod as any).customSections || modData?.modelConfig?.sections) as any[] | undefined) || [];
              if (sections.length < 2) return [] as number[];
              const bodyBottomMm = sideBodyStartMm;
              const bodyTopMm = Math.max(0, spaceInfo.height - topFrameDimensionHeight);
              const sectionBasisH = Math.max(0, Math.round(bodyTopMm - bodyBottomMm));
              const rawHeights = sections.map(s => {
                if (s.heightType === 'absolute') return s.height || 0;
                return Math.round(sectionBasisH * (s.height || 0) / 100);
              });
              const isEntryway = mid.includes('-entryway-');
              const isPlainShelf = (mid.startsWith('single-shelf-') || mid.startsWith('dual-shelf-'))
                && !mid.includes('-4drawer-shelf-')
                && !mid.includes('-2drawer-shelf-')
                && !mid.includes('shelf-split');
              const isShelfSplit = mid.includes('shelf-split');
              if (isEntryway) {
                const fixedSum = rawHeights.slice(1).reduce((sum, h) => sum + h, 0);
                return [Math.max(0, sectionBasisH - fixedSum), ...rawHeights.slice(1)];
              }
              if (isPlainShelf || isShelfSplit) {
                const globalBaseForShelf = spaceInfo.baseConfig?.type === 'floor'
                  ? (spaceInfo.baseConfig?.height ?? 60)
                  : 0;
                const baseAbsorbedMm = !isShelfSplit && (viewMod as any).hasBase === false
                  ? globalBaseForShelf
                  : 0;
                const isFloatPlacement = spaceInfo.baseConfig?.type === 'stand'
                  && spaceInfo.baseConfig?.placementType === 'float';
                const globalFloatMm = isFloatPlacement ? (spaceInfo.baseConfig?.floatHeight || 0) : 0;
                const floatAbsorbedMm = isShelfSplit
                  ? 0
                  : (viewMod as any).hasBase === false
                  ? Math.max(0, (viewMod as any).individualFloatHeight ?? 0)
                  : globalFloatMm;
                const baseFrameDeltaMm = 0;
                const newLowerH = Math.max(0, Math.round((rawHeights[0] || 0) + baseAbsorbedMm - floatAbsorbedMm - baseFrameDeltaMm));
                const remainingUpperH = Math.max(0, sectionBasisH - newLowerH);
                const upperH = isShelfSplit && Array.isArray((viewMod as any).customSections)
                  ? Math.min(remainingUpperH, Math.max(0, Math.round(rawHeights[1] || 0)))
                  : remainingUpperH;
                return [newLowerH, upperH];
              }
              const fixedSum = rawHeights.slice(0, -1).reduce((sum, h) => sum + h, 0);
              return [...rawHeights.slice(0, -1), Math.max(0, sectionBasisH - fixedSum)];
            })();
            const hasSideSectionSplit = sideSectionHeights.length >= 2;
            const sideSectionStartMm = sideBodyStartMm;

            // 단내림 구간이면 단내림 높이, 일반 구간이면 전체 높이 사용
            const cabinetPlacementHeight = Math.max(spaceInfo.height - topFrameDimensionHeight - bottomFrameHeight, 0); // 캐비넷 배치 영역 (바닥마감재는 받침대에 포함)

            const bottomY = 0; // 바닥
            const floorFinishTopYLocal = mmToThreeUnits(floorFinishHeightMm); // 바닥마감재 상단
            const baseStartYLocal = floorFinishHeightMm > 0 ? floorFinishTopYLocal : bottomY; // 받침대 시작점
            const bottomFrameTopY = mmToThreeUnits(bottomFrameHeight); // 걸래받이 상단
            const bottomFrameGapTopY = mmToThreeUnits(bottomFrameGapHeight);
            const bottomFrameSegments = bottomFrameGapHeight > 0
              ? [
                { key: 'gap', bottomY, topY: bottomFrameGapTopY, heightMm: bottomFrameGapHeight },
                { key: 'base', bottomY: bottomFrameGapTopY, topY: bottomFrameTopY, heightMm: bottomFrameVisibleHeight },
              ].filter(seg => seg.heightMm > 0)
              : [{ key: 'base', bottomY, topY: bottomFrameTopY, heightMm: bottomFrameHeight }];
            const sideBodyStartY = mmToThreeUnits(sideBodyStartMm);
            const isLowerSideMeasure = bottomFrameRefCategory === 'lower' || viewModCategoryForFrame === 'lower';
            const lowerSideMeasureStartY = isLowerSideMeasure ? bottomY : sideBodyStartY;
            const cabinetAreaTopY = mmToThreeUnits(bottomFrameHeight + cabinetPlacementHeight); // 캐비넷 영역 상단
            const topFrameTopY = cabinetAreaTopY + mmToThreeUnits(topFrameDimensionHeight); // 상단 몰딩 상단

            // 좌측뷰 대상 가구의 높이만 사용
            let maxFurnitureTop = topFrameTopY;
            let maxModuleHeightMm = 0;
            let tallestModuleTopY = cabinetAreaTopY;
            let tallestModuleBottomY = bottomFrameTopY;

            if (viewMod) {
              const moduleData = getModuleById(viewMod.moduleId, calculateInternalSpace(spaceInfo), spaceInfo);
              const isCustomizable = viewMod.moduleId.startsWith('customizable-');
              if (moduleData || isCustomizable || viewMod.isFreePlacement) {
                const category = moduleData?.category
                  ?? (viewMod.moduleId.includes('upper') ? 'upper'
                    : viewMod.moduleId.includes('lower') ? 'lower' : 'full');
                const isGlassCabinetForSideDim = viewMod.moduleId?.includes('glass-cabinet') && category === 'full';
                let moduleHeight = isGlassCabinetForSideDim
                  ? resolveGlassCabinetBodyHeightMm(viewMod, moduleData, topFrameHeight)
                  : isTopFrameOff && category === 'full' && !viewMod.freeHeight
                  ? cabinetPlacementHeight
                  : (category === 'upper'
                    ? (viewMod.customHeight
                      ?? viewMod.freeHeight
                      ?? moduleData?.dimensions.height
                      ?? (viewMod.customConfig?.totalHeight || 2000))
                    : (viewMod.freeHeight
                      ?? viewMod.customHeight
                      ?? moduleData?.dimensions.height
                      ?? (viewMod.customConfig?.totalHeight || 2000)));
                const hasManualHeight = !!(viewMod.freeHeight || viewMod.customHeight);
                if (!isGlassCabinetForSideDim && isTopFrameOff && category === 'full' && hasManualHeight) {
                  moduleHeight += Math.max(0, rawTopFrame - topFrameHeight);
                }
                // 걸래받이 OFF (hasBase=false): 가구가 걸래받이 자리를 흡수 — moduleHeight 보정
                // (FurnitureItem.tsx의 furnitureHeightMm 보정과 동일)
                if (!isGlassCabinetForSideDim && !isTopFrameOff && !hasManualHeight && (viewMod as any).hasBase === false && category === 'full') {
                  const globalBase = spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 60) : 0;
                  const absorbedBase = (viewMod as any).baseFrameHeight ?? globalBase;
                  const floatH = (viewMod as any).individualFloatHeight ?? 0;
                  moduleHeight += (absorbedBase - floatH);
                } else if (!isGlassCabinetForSideDim && hasManualHeight && (viewMod as any).hasBase === false && category === 'full') {
                  const globalBase = spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 60) : 0;
                  const absorbedBase = (viewMod as any).baseFrameHeight ?? globalBase;
                  const floatH = (viewMod as any).individualFloatHeight ?? 0;
                  moduleHeight += (absorbedBase - floatH);
                }
                const moduleTopY = category === 'upper'
                  ? cabinetAreaTopY
                  : (sideBodyStartY + mmToThreeUnits(moduleHeight));
                const moduleBottomY = category === 'upper'
                  ? moduleTopY - mmToThreeUnits(moduleHeight)
                  : sideBodyStartY;
                maxFurnitureTop = moduleTopY;
                maxModuleHeightMm = moduleHeight;
                tallestModuleTopY = moduleTopY;
                tallestModuleBottomY = moduleBottomY;
              }
            }
            const hasFurnitureHeight = maxModuleHeightMm > 0;
            const furnitureHeightValue = hasFurnitureHeight ? maxModuleHeightMm : cabinetPlacementHeight;
            const furnitureTopY = hasFurnitureHeight ? tallestModuleTopY : cabinetAreaTopY;
            // 띄움배치 시에는 바닥재 + floatHeight를 기준으로 텍스트 위치 계산
            const furnitureStartY = hasFurnitureHeight
              ? tallestModuleBottomY
              : sideBodyStartY;
            const furnitureTextY = furnitureStartY + (furnitureTopY - furnitureStartY) / 2;
            const lowerSideFurnitureTopY = (() => {
              if (!isLowerSideMeasure || bottomFrameRefCategory !== 'lower' || !bottomFrameRefMod) return null;
              const lowerModuleData = getModuleById(bottomFrameRefMod.moduleId, calculateInternalSpace(spaceInfo), spaceInfo);
              const lowerModuleHeight = bottomFrameRefMod.freeHeight
                ?? bottomFrameRefMod.customHeight
                ?? lowerModuleData?.dimensions.height
                ?? (bottomFrameRefMod.customConfig?.totalHeight || 0);
              return lowerModuleHeight > 0
                ? sideBodyStartY + mmToThreeUnits(lowerModuleHeight)
                : null;
            })();
            const topFinishBottomY = lowerSideFurnitureTopY ?? furnitureTopY;
            const topFinishTopY = topFinishBottomY + mmToThreeUnits(topFinishThicknessMm);
            const furnitureMeasuredStartY = isLowerSideMeasure
              ? bottomY
              : topFinishThicknessMm > 0
                ? bottomY
                : furnitureStartY;
            const furnitureMeasuredTopY = topFinishThicknessMm > 0 ? topFinishTopY : (lowerSideFurnitureTopY ?? furnitureTopY);
            const furnitureMeasuredHeightValue = Math.round(threeUnitsToMm(furnitureMeasuredTopY - furnitureMeasuredStartY));
            const furnitureMeasuredTextY = furnitureMeasuredStartY + (furnitureMeasuredTopY - furnitureMeasuredStartY) / 2;
            const topFrameLineTopY = topFrameTopY;
            const extraFurnitureHeightUnits = maxFurnitureTop - topFrameLineTopY;
            const extraFurnitureHeightMm = extraFurnitureHeightUnits > 1e-6 ? Math.round(threeUnitsToMm(extraFurnitureHeightUnits)) : 0;
            const hasExtraFurnitureHeight = extraFurnitureHeightMm > 0;
            const extraFurnitureZ = rightDimensionZ + mmToThreeUnits(40);
            const extraFurnitureTextY = topFrameLineTopY + (maxFurnitureTop - topFrameLineTopY) / 2;


            return (
              <>
                {renderGlassDrawerSideSplitDimensions(
                  viewMod,
                  0,
                  rightDimensionZ + mmToThreeUnits(95),
                  rightDimensionZ + mmToThreeUnits(155),
                  'left'
                )}
                {/* 1. 띄움 높이 또는 걸래받이 높이 */}
                {/* 띄움 배치인 경우: 띄움 높이 표시 (실제 가구 위치에 맞춤) */}
                {sideIsFloating && sideFloatHeight > 0 && (
                <group>
                  <Line
                    points={[[0, mmToThreeUnits(floorFinishHeightMm), rightDimensionZ], [0, sideBodyStartY, rightDimensionZ]]}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Line
                    points={createArrowHead([0, mmToThreeUnits(floorFinishHeightMm), rightDimensionZ], [0, mmToThreeUnits(floorFinishHeightMm) + 0.015, rightDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Line
                    points={createArrowHead([0, sideBodyStartY, rightDimensionZ], [0, sideBodyStartY + 0.015, rightDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Text
                    renderOrder={100001}
                    depthTest={false}
                    position={[0, mmToThreeUnits(floorFinishHeightMm) + mmToThreeUnits(sideFloatHeight / 2), rightDimensionZ + mmToThreeUnits(60)]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                    rotation={[0, -Math.PI / 2, -Math.PI / 2]}
                  >
                    {sideFloatHeight}
                  </Text>
                </group>
                )}

                {/* 띄움 배치가 아니고 받침대가 있는 경우: 걸래받이 높이 표시 (바닥부터) */}
                {!sideIsFloating && bottomFrameHeight > 0 && (
                <group>
                  <Line
                    points={[[0, bottomY, rightDimensionZ], [0, bottomFrameTopY, rightDimensionZ]]}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Line
                    points={createArrowHead([0, bottomY, rightDimensionZ], [0, bottomY - 0.015, rightDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Line
                    points={createArrowHead([0, bottomFrameTopY, rightDimensionZ], [0, bottomFrameTopY + 0.015, rightDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  {bottomFrameGapHeight > 0 && (
                    <Line
                      points={[[0, bottomFrameGapTopY, rightDimensionZ], [0, bottomFrameGapTopY, rightDimensionZ + mmToThreeUnits(25)]]}
                      color={dimensionColor}
                      lineWidth={0.6}
                    />
                  )}
                  {bottomFrameSegments.map(seg => (
                    <Text
                      key={`left-side-base-${seg.key}`}
                      renderOrder={100001}
                      depthTest={false}
                      position={[0, (seg.bottomY + seg.topY) / 2, rightDimensionZ + mmToThreeUnits(seg.key === 'gap' ? 100 : 60)]}
                      fontSize={baseFontSize}
                      color={textColor}
                      anchorX="center"
                      anchorY="middle"
                      outlineWidth={textOutlineWidth}
                      outlineColor={textOutlineColor}
                      rotation={[0, -Math.PI / 2, -Math.PI / 2]}
                    >
                      {Math.round(seg.heightMm)}
                    </Text>
                  ))}
                </group>
                )}

                {/* 2. 하부섹션 높이 (띄움 배치 시) 또는 캐비넷/가구 높이 (일반 배치 시) */}
                {/* 띄움 배치이고 하부장이 있는 경우: 하부섹션 높이 표시 */}
                {sideIsFloating && viewModCategoryForFrame !== 'full' && !isLowerSideMeasure && !hasSideSectionSplit && maxLowerCabinetHeightMm > 0 && (
                <group>
                  <Line
                    points={[[0, lowerSideMeasureStartY, rightDimensionZ], [0, mmToThreeUnits(sideBodyStartMm + maxLowerCabinetHeightMm + topFinishThicknessMm), rightDimensionZ]]}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Line
                    points={createArrowHead([0, lowerSideMeasureStartY, rightDimensionZ], [0, lowerSideMeasureStartY + 0.015, rightDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Line
                    points={createArrowHead([0, mmToThreeUnits(sideBodyStartMm + maxLowerCabinetHeightMm + topFinishThicknessMm), rightDimensionZ], [0, mmToThreeUnits(sideBodyStartMm + maxLowerCabinetHeightMm + topFinishThicknessMm) - 0.015, rightDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Text
                    renderOrder={100001}
                    depthTest={false}
                    position={[0, lowerSideMeasureStartY + (mmToThreeUnits(sideBodyStartMm + maxLowerCabinetHeightMm + topFinishThicknessMm) - lowerSideMeasureStartY) / 2, rightDimensionZ + mmToThreeUnits(60)]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                    rotation={[0, -Math.PI / 2, -Math.PI / 2]}
                  >
                    {Math.round(threeUnitsToMm(mmToThreeUnits(sideBodyStartMm + maxLowerCabinetHeightMm + topFinishThicknessMm) - lowerSideMeasureStartY))}
                  </Text>
                </group>
                )}

                {/* 띄움 배치가 아닌 경우: 일반 가구 높이 표시 */}
                {(!sideIsFloating || isLowerSideMeasure || viewModCategoryForFrame === 'full') && !hasSideSectionSplit && (
                <group>
                  <Line
                    points={[[0, furnitureMeasuredStartY, rightDimensionZ], [0, furnitureMeasuredTopY, rightDimensionZ]]}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Line
                    points={createArrowHead([0, furnitureMeasuredStartY, rightDimensionZ], [0, furnitureMeasuredStartY + 0.015, rightDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Line
                    points={createArrowHead([0, furnitureMeasuredTopY, rightDimensionZ], [0, furnitureMeasuredTopY - 0.015, rightDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Text
                    renderOrder={100001}
                    depthTest={false}
                    position={[0, furnitureMeasuredTextY, rightDimensionZ + mmToThreeUnits(60)]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                    rotation={[0, -Math.PI / 2, -Math.PI / 2]}
                  >
                    {furnitureMeasuredHeightValue}
                  </Text>
                </group>
                )}

                {/* 하부장 상판/상부 EP 두께 */}
                {topFinishThicknessMm > 0 && (
                <group>
                  <Line
                    points={[[0, topFinishBottomY, rightDimensionZ], [0, topFinishTopY, rightDimensionZ]]}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Line
                    points={createArrowHead([0, topFinishBottomY, rightDimensionZ], [0, topFinishBottomY + 0.015, rightDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Line
                    points={createArrowHead([0, topFinishTopY, rightDimensionZ], [0, topFinishTopY - 0.015, rightDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Text
                    renderOrder={100001}
                    depthTest={false}
                    position={[0, (topFinishBottomY + topFinishTopY) / 2, rightDimensionZ + mmToThreeUnits(60)]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                    rotation={[0, -Math.PI / 2, -Math.PI / 2]}
                  >
                    {topFinishThicknessMm}
                  </Text>
                </group>
                )}

                {/* 3. 상부섹션 높이 (띄움 배치이고 상부장이 있는 경우) */}
                {sideIsFloating && viewModCategoryForFrame !== 'full' && !hasSideSectionSplit && adjustedUpperCabinetHeightMm > 0 && (
                <group>
                  <Line
                    points={[[0, mmToThreeUnits(sideBodyStartMm + maxLowerCabinetHeightMm), rightDimensionZ], [0, mmToThreeUnits(sideBodyStartMm + maxLowerCabinetHeightMm + adjustedUpperCabinetHeightMm), rightDimensionZ]]}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Line
                    points={createArrowHead([0, mmToThreeUnits(sideBodyStartMm + maxLowerCabinetHeightMm), rightDimensionZ], [0, mmToThreeUnits(sideBodyStartMm + maxLowerCabinetHeightMm) + 0.015, rightDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Line
                    points={createArrowHead([0, mmToThreeUnits(sideBodyStartMm + maxLowerCabinetHeightMm + adjustedUpperCabinetHeightMm), rightDimensionZ], [0, mmToThreeUnits(sideBodyStartMm + maxLowerCabinetHeightMm + adjustedUpperCabinetHeightMm) - 0.015, rightDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Text
                    renderOrder={100001}
                    depthTest={false}
                    position={[0, mmToThreeUnits(sideBodyStartMm + maxLowerCabinetHeightMm) + mmToThreeUnits(adjustedUpperCabinetHeightMm / 2), rightDimensionZ + mmToThreeUnits(60)]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                    rotation={[0, -Math.PI / 2, -Math.PI / 2]}
                  >
                    {adjustedUpperCabinetHeightMm}
                  </Text>
                </group>
                )}

                {/* 3-1. 상부장 높이 (비띄움 배치이고 상부장이 있는 경우) */}
                {!sideIsFloating && viewModCategoryForFrame !== 'full' && !hasSideSectionSplit && maxUpperCabinetHeightMm > 0 && (
                <group>
                  <Line
                    points={[[0, cabinetAreaTopY - mmToThreeUnits(maxUpperCabinetHeightMm), rightDimensionZ], [0, cabinetAreaTopY, rightDimensionZ]]}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Line
                    points={createArrowHead([0, cabinetAreaTopY - mmToThreeUnits(maxUpperCabinetHeightMm), rightDimensionZ], [0, cabinetAreaTopY - mmToThreeUnits(maxUpperCabinetHeightMm) + 0.015, rightDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Line
                    points={createArrowHead([0, cabinetAreaTopY, rightDimensionZ], [0, cabinetAreaTopY - 0.015, rightDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Text
                    renderOrder={100001}
                    depthTest={false}
                    position={[0, cabinetAreaTopY - mmToThreeUnits(maxUpperCabinetHeightMm / 2), rightDimensionZ + mmToThreeUnits(60)]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                    rotation={[0, -Math.PI / 2, -Math.PI / 2]}
                  >
                    {maxUpperCabinetHeightMm}
                  </Text>
                </group>
                )}

                {/* full 2섹션 가구: 측면뷰에서도 실제 상하부 섹션 경계 기준으로 높이 분리 */}
                {hasSideSectionSplit && (
                <group>
                  {sideSectionHeights.map((secH, idx) => {
                    const secBottomMm = sideSectionStartMm + sideSectionHeights.slice(0, idx).reduce((sum, h) => sum + h, 0);
                    const secTopMm = secBottomMm + secH;
                    const secBottomY = mmToThreeUnits(secBottomMm);
                    const secTopY = mmToThreeUnits(secTopMm);
                    const boundaryFrontZ = Math.max(lowerGuideFrontZ, upperGuideFrontZ);
                    return (
                      <React.Fragment key={`left-side-sec-${idx}`}>
                        <Line
                          points={[[0, secBottomY, rightDimensionZ], [0, secTopY, rightDimensionZ]]}
                          color={dimensionColor}
                          lineWidth={0.6}
                        />
                        <Line
                          points={createArrowHead([0, secBottomY, rightDimensionZ], [0, secBottomY + 0.015, rightDimensionZ])}
                          color={dimensionColor}
                          lineWidth={0.6}
                        />
                        <Line
                          points={createArrowHead([0, secTopY, rightDimensionZ], [0, secTopY - 0.015, rightDimensionZ])}
                          color={dimensionColor}
                          lineWidth={0.6}
                        />
                        <Text
                          renderOrder={100001}
                          depthTest={false}
                          position={[0, (secBottomY + secTopY) / 2, rightDimensionZ + mmToThreeUnits(60)]}
                          fontSize={baseFontSize}
                          color={textColor}
                          anchorX="center"
                          anchorY="middle"
                          outlineWidth={textOutlineWidth}
                          outlineColor={textOutlineColor}
                          rotation={[0, -Math.PI / 2, -Math.PI / 2]}
                        >
                          {secH}
                        </Text>
                        {idx < sideSectionHeights.length - 1 && (
                          <Line
                            points={[[0, secTopY, boundaryFrontZ], [0, secTopY, rightDimensionZ - mmToThreeUnits(20)]]}
                            color={dimensionColor}
                            lineWidth={0.3}
                          />
                        )}
                      </React.Fragment>
                    );
                  })}
                </group>
                )}

                {/* 4. 상단 몰딩 높이 / 토글 OFF일 때는 상단갭 */}
                {!isTopFrameOff && topFrameDimensionHeight > 0 && (() => {
                  // EP 모드: ㄱ자 EP 전면 세로(=80) + 도어 상단~EP 안쪽 갭 두 개로 분리 표시
                  // 인조대리석 모드 등 EP 미설치: 기존대로 한 줄(상단몰딩 높이) 표시
                  const epRefMod = topFrameRefMod ?? viewMod;
                  const epEnabled = epRefMod?.hasTopEndPanel === true;
                  const epFrontHeightMm = 80;
                  const totalMm = topFrameDimensionValue || topFrameDimensionHeight;
                  const topGapMm = Math.min(totalMm, Math.max(0, Math.round((epRefMod as any)?.topFrameGap ?? 0)));
                  const visibleTopMm = Math.max(0, totalMm);
                  const topGapBottomY = topFrameTopY - mmToThreeUnits(topGapMm);
                  const isEpSplit = epEnabled && totalMm > epFrontHeightMm + 1;

                  if (!isEpSplit) {
                    return (
                      <group>
                        <Line
                          points={[[0, cabinetAreaTopY, rightDimensionZ], [0, topFrameTopY, rightDimensionZ]]}
                          color={topSegmentColor}
                          lineWidth={0.6}
                        />
                        <Line
                          points={createArrowHead([0, cabinetAreaTopY, rightDimensionZ], [0, cabinetAreaTopY + 0.015, rightDimensionZ])}
                          color={topSegmentColor}
                          lineWidth={0.6}
                        />
                        <Line
                          points={createArrowHead([0, topFrameTopY, rightDimensionZ], [0, topFrameTopY - 0.015, rightDimensionZ])}
                          color={topSegmentColor}
                          lineWidth={0.6}
                        />
                        {topGapMm > 0 && (
                          <Line
                            points={[[0, topGapBottomY, rightDimensionZ], [0, topGapBottomY, rightDimensionZ + mmToThreeUnits(25)]]}
                            color={topSegmentColor}
                            lineWidth={0.6}
                          />
                        )}
                        {visibleTopMm > 0 && (
                          <Text
                            renderOrder={100001}
                            depthTest={false}
                            position={[0, (cabinetAreaTopY + topGapBottomY) / 2, rightDimensionZ + mmToThreeUnits(60)]}
                            fontSize={baseFontSize}
                            color={textColor}
                            anchorX="center"
                            anchorY="middle"
                            outlineWidth={textOutlineWidth}
                            outlineColor={textOutlineColor}
                            rotation={[0, -Math.PI / 2, -Math.PI / 2]}
                          >
                            {visibleTopMm}
                          </Text>
                        )}
                        {topGapMm > 0 && (
                          <Text
                            renderOrder={100001}
                            depthTest={false}
                            position={[0, (topGapBottomY + topFrameTopY) / 2, rightDimensionZ + mmToThreeUnits(100)]}
                            fontSize={baseFontSize}
                            color={textColor}
                            anchorX="center"
                            anchorY="middle"
                            outlineWidth={textOutlineWidth}
                            outlineColor={textOutlineColor}
                            rotation={[0, -Math.PI / 2, -Math.PI / 2]}
                          >
                            {topGapMm}
                          </Text>
                        )}
                      </group>
                    );
                  }

                  // EP 분리 표시: 80(전면) + 갭(나머지)
                  const epSplitY = cabinetAreaTopY + mmToThreeUnits(epFrontHeightMm);
                  const gapMm = Math.max(0, Math.round(totalMm - epFrontHeightMm));
                  return (
                    <group>
                      {/* (a) ㄱ자 전면 80 — 측판 상단 ~ EP 안쪽 바닥 */}
                      <Line
                        points={[[0, cabinetAreaTopY, rightDimensionZ], [0, epSplitY, rightDimensionZ]]}
                        color={topSegmentColor}
                        lineWidth={0.6}
                      />
                      <Line
                        points={createArrowHead([0, cabinetAreaTopY, rightDimensionZ], [0, cabinetAreaTopY + 0.015, rightDimensionZ])}
                        color={topSegmentColor}
                        lineWidth={0.6}
                      />
                      <Line
                        points={createArrowHead([0, epSplitY, rightDimensionZ], [0, epSplitY - 0.015, rightDimensionZ])}
                        color={topSegmentColor}
                        lineWidth={0.6}
                      />
                      <Text
                        renderOrder={100001}
                        depthTest={false}
                        position={[0, (cabinetAreaTopY + epSplitY) / 2, rightDimensionZ + mmToThreeUnits(60)]}
                        fontSize={baseFontSize}
                        color={textColor}
                        anchorX="center"
                        anchorY="middle"
                        outlineWidth={textOutlineWidth}
                        outlineColor={textOutlineColor}
                        rotation={[0, -Math.PI / 2, -Math.PI / 2]}
                      >
                        {epFrontHeightMm}
                      </Text>

                      {/* (b) 도어 상단 ~ EP 안쪽 갭 */}
                      {gapMm > 0 && (
                        <>
                          <Line
                            points={[[0, epSplitY, rightDimensionZ], [0, topFrameTopY, rightDimensionZ]]}
                            color={topSegmentColor}
                            lineWidth={0.6}
                          />
                          <Line
                            points={createArrowHead([0, epSplitY, rightDimensionZ], [0, epSplitY + 0.015, rightDimensionZ])}
                            color={topSegmentColor}
                            lineWidth={0.6}
                          />
                          <Line
                            points={createArrowHead([0, topFrameTopY, rightDimensionZ], [0, topFrameTopY - 0.015, rightDimensionZ])}
                            color={topSegmentColor}
                            lineWidth={0.6}
                          />
                          <Text
                            renderOrder={100001}
                            depthTest={false}
                            position={[0, (epSplitY + topFrameTopY) / 2, rightDimensionZ + mmToThreeUnits(60)]}
                            fontSize={baseFontSize}
                            color={textColor}
                            anchorX="center"
                            anchorY="middle"
                            outlineWidth={textOutlineWidth}
                            outlineColor={textOutlineColor}
                            rotation={[0, -Math.PI / 2, -Math.PI / 2]}
                          >
                            {gapMm}
                          </Text>
                          {/* 분리선 (EP 안쪽 바닥 위치 가이드) */}
                          <Line
                            points={[[0, epSplitY, upperGuideFrontZ], [0, epSplitY, rightDimensionZ - mmToThreeUnits(20)]]}
                            color={topSegmentColor}
                            lineWidth={0.3}
                          />
                        </>
                      )}
                    </group>
                  );
                })()}

                {/* 5. 상단 몰딩 이상 돌출 구간 */}
                {hasExtraFurnitureHeight && (
                <group>
                  <Line
                    points={[[0, topFrameTopY, extraFurnitureZ], [0, maxFurnitureTop, extraFurnitureZ]]}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Line
                    points={createArrowHead([0, topFrameTopY, extraFurnitureZ], [0, topFrameTopY + 0.015, extraFurnitureZ])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Line
                    points={createArrowHead([0, maxFurnitureTop, extraFurnitureZ], [0, maxFurnitureTop - 0.015, extraFurnitureZ])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Text
                  renderOrder={100001}
                  depthTest={false}
                    position={[0, extraFurnitureTextY, extraFurnitureZ + mmToThreeUnits(30)]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                    rotation={[0, -Math.PI / 2, -Math.PI / 2]}
                  >
                    {extraFurnitureHeightMm}
                  </Text>
                </group>
                )}

                {/* 6. 도어/마이다 높이 치수선 (선택된 슬롯의 가구 기준) */}
                {(() => {
                  if (currentViewDirection === 'front') return null;
                  if (!sideViewMod || sideViewMod.isSurroundPanel) return null;

                  const doorModule = sideViewMod;
                  const doorModData = getModuleById(
                    doorModule.moduleId,
                    { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
                    spaceInfo
                  );
                  const doorCategory = doorModData?.category
                    ?? (doorModule.moduleId.includes('upper') ? 'upper'
                      : doorModule.moduleId.startsWith('lower-') ? 'lower' : 'full');

                  const doorDimOffsetZ = mmToThreeUnits(80);
                  const doorGuideEndInsetZ = mmToThreeUnits(20);
                  const resolveDoorSectionFrontZ = (section: 'upper' | 'lower' | 'auto') => {
                    if (!doorModData) return rightDimensionZ;
                    return resolveSideDimensionDepthSpanZ(
                      doorModule,
                      doorModData,
                      section,
                      furnitureZOffset,
                      furnitureDepth
                    ).frontZ;
                  };
                  const defaultDoorSection: 'upper' | 'lower' | 'auto' =
                    doorCategory === 'upper' ? 'upper' : doorCategory === 'lower' ? 'lower' : 'auto';
                  const doorGuideFrontZ = resolveDoorSectionFrontZ(defaultDoorSection);
                  const doorDimZ = doorGuideFrontZ + doorDimOffsetZ;
                  const doorGuideEndZ = doorDimZ - doorGuideEndInsetZ;
                  const doorColor = '#E91E63';

                  // 인덕션장: hasDoor일 때만 마이다 치수 표시
                  const isInduction = doorModule.moduleId?.includes('lower-induction-cabinet') || doorModule.moduleId?.includes('dual-lower-induction-cabinet');
                  if (isInduction && doorModule.hasDoor) {
                    const cabinetBottomAbs = bottomFrameHeight;
                    const defaultDTG = -20;
                    const defaultDBG = 5;
                    const dtg = doorModule.doorTopGap ?? defaultDTG;
                    const dbg = doorModule.doorBottomGap ?? defaultDBG;
                    const gapTopExt = dtg - defaultDTG;
                    const gapBottomExt = dbg - defaultDBG;
                    const gapMm = 3;
                    const maida1H = 340 + gapBottomExt;
                    const maida1BottomAbs = cabinetBottomAbs - 5 - gapBottomExt;
                    const maida1TopAbs = maida1BottomAbs + maida1H;
                    const maida2BottomAbs = cabinetBottomAbs - 5 + 340 + gapMm;
                    const inductionModData = getModuleById(doorModule.moduleId, { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth }, spaceInfo);
                    const cabinetH = doorModule.freeHeight
                      ?? doorModule.customHeight
                      ?? inductionModData?.dimensions.height
                      ?? 785;
                    const cabinetTopAbs = cabinetBottomAbs + cabinetH;
                    const maida2TopAbs = cabinetTopAbs - 20 + gapTopExt;
                    const maida2H = Math.max(0, maida2TopAbs - maida2BottomAbs);
                    // 상단 갭: 2단 마이다 상단 ~ 캐비넷 상단
                    const topGapMm = Math.round(cabinetTopAbs - maida2TopAbs);

                    const renderMaidaDim = (bottomAbs: number, topAbs: number, heightMm: number) => {
                      const bY = mmToThreeUnits(bottomAbs);
                      const tY = mmToThreeUnits(topAbs);
                      const midY = (bY + tY) / 2;
                      return (
                        <group>
                          <Line points={[[0, bY, doorDimZ], [0, tY, doorDimZ]]} color={doorColor} lineWidth={0.6} />
                          <Line points={createArrowHead([0, bY, doorDimZ], [0, bY + 0.015, doorDimZ])} color={doorColor} lineWidth={0.6} />
                          <Line points={createArrowHead([0, tY, doorDimZ], [0, tY - 0.015, doorDimZ])} color={doorColor} lineWidth={0.6} />
                          <Text
                            renderOrder={100001} depthTest={false}
                            position={[0, midY, doorDimZ + mmToThreeUnits(60)]}
                            fontSize={baseFontSize} color={doorColor}
                            anchorX="center" anchorY="middle"
                            outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                            rotation={[0, -Math.PI / 2, -Math.PI / 2]}
                          >
                          {Math.round(heightMm)}
                        </Text>
                          <Line points={[[0, tY, doorGuideFrontZ], [0, tY, doorGuideEndZ]]} color={doorColor} lineWidth={0.3} />
                          <Line points={[[0, bY, doorGuideFrontZ], [0, bY, doorGuideEndZ]]} color={doorColor} lineWidth={0.3} />
                        </group>
                      );
                    };

                    return (
                      <group>
                        {/* 하단 갭: 받침대 상단 ~ 1단 마이다 하단 (마이다가 바닥 아래이면 음수 → 표시안됨) */}
                        {maida1BottomAbs > cabinetBottomAbs && renderMaidaDim(cabinetBottomAbs, maida1BottomAbs, Math.round(maida1BottomAbs - cabinetBottomAbs))}
                        {renderMaidaDim(maida1BottomAbs, maida1TopAbs, maida1H)}
                        {/* 마이다 사이 갭 */}
                        {renderMaidaDim(maida1TopAbs, maida2BottomAbs, gapMm)}
                        {renderMaidaDim(maida2BottomAbs, maida2TopAbs, maida2H)}
                        {/* 상단 갭: 2단 마이다 상단 ~ 캐비넷 상단 */}
                        {topGapMm > 0 && renderMaidaDim(maida2TopAbs, cabinetTopAbs, topGapMm)}
                      </group>
                    );
                  }

                  const doorModuleId = doorModule.moduleId || doorModData?.id || '';
                  const isTvBasicOneDrawer = doorModuleId.includes('lower-drawer-1tier');
                  const isTvDoorLiftOneDrawer = doorModuleId.includes('lower-door-lift-1tier');
                  if (doorModule.hasDoor && (isTvBasicOneDrawer || isTvDoorLiftOneDrawer)) {
                    const cabinetH = doorModule.customHeight
                      ?? doorModule.freeHeight
                      ?? doorModData?.dimensions.height
                      ?? 230;
                    const cabinetBottomAbs = bottomFrameHeight;
                    const defaultDoorTopGap = isTvDoorLiftOneDrawer ? 30 : -20;
                    const defaultDoorBottomGap = 5;
                    const effectiveDoorTopGap = doorModule.doorTopGap ?? defaultDoorTopGap;
                    const effectiveDoorBottomGap = doorModule.doorBottomGap ?? defaultDoorBottomGap;
                    const maidaHeightMm = Math.max(0, cabinetH + effectiveDoorTopGap + effectiveDoorBottomGap);
                    const maidaBottomAbs = cabinetBottomAbs - effectiveDoorBottomGap;
                    const maidaTopAbs = maidaBottomAbs + maidaHeightMm;
                    const bY = mmToThreeUnits(maidaBottomAbs);
                    const tY = mmToThreeUnits(maidaTopAbs);
                    const midY = (bY + tY) / 2;

                    if (maidaHeightMm <= 0) return null;

                    return (
                      <group name="door-dimension-height-tv-one-drawer">
                        <Line points={[[0, bY, doorDimZ], [0, tY, doorDimZ]]} color={doorColor} lineWidth={0.6} />
                        <Line points={createArrowHead([0, bY, doorDimZ], [0, bY + 0.015, doorDimZ])} color={doorColor} lineWidth={0.6} />
                        <Line points={createArrowHead([0, tY, doorDimZ], [0, tY - 0.015, doorDimZ])} color={doorColor} lineWidth={0.6} />
                        <Text
                          name="door-dimension-height-tv-one-drawer-text"
                          renderOrder={100001} depthTest={false}
                          position={[0, midY, doorDimZ + mmToThreeUnits(60)]}
                          fontSize={baseFontSize}
                          color={doorColor}
                          anchorX="center" anchorY="middle"
                          outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                          rotation={[0, -Math.PI / 2, -Math.PI / 2]}
                        >
                          {Math.round(maidaHeightMm)}
                        </Text>
                        <Line points={[[0, tY, doorGuideFrontZ], [0, tY, doorGuideEndZ]]} color={doorColor} lineWidth={0.3} />
                        <Line points={[[0, bY, doorGuideFrontZ], [0, bY, doorGuideEndZ]]} color={doorColor} lineWidth={0.3} />
                      </group>
                    );
                  }

                  // 도어가 없는 가구 (인덕션 이외)는 치수선 생략
                  if (!doorModule.hasDoor) return null;

                  // 도어갭 기본값 0 (몸통 기준, EP와 동일)
                  const doorTopGapVal = doorModule.doorTopGap ?? 0;
                  const doorBottomGapVal = doorModule.doorBottomGap ?? 0;

                  let doorHeightMm = 0;
                  let doorBottomAbsMm = 0;
                  let doorTopAbsMm = 0;

                  // 단내림 구간 높이 계산
                  const effectiveH = spaceInfo.height;

                  // 도어분절 가구(shelf-split / pantry-cabinet-split): 도어 2장 치수 표시
                  const isShelfSplitDoor = typeof doorModule.moduleId === 'string' &&
                    (doorModule.moduleId.includes('shelf-split') || doorModule.moduleId.includes('pantry-cabinet-split'));
                  if (isShelfSplitDoor) {
                    const usesSideSectionBasis = doorModule.moduleId.includes('shelf-split') && sideSectionHeights.length >= 2;
                    const cabinetBottomAbsS = usesSideSectionBasis
                      ? sideSectionStartMm
                      : bottomFrameHeight;
                    const cabinetTopAbsS = usesSideSectionBasis
                      ? sideSectionStartMm + sideSectionHeights.reduce((sum, h) => sum + h, 0)
                      : effectiveH - (doorModule.topFrameThickness ?? (spaceInfo.frameSize?.top ?? 30));
                    // 모듈별 사양:
                    //  - 도어분절 현관장(shelf-split): 하부섹션 860, 분절 갭 20mm
                    //  - 도어분절 팬트리장(pantry-cabinet-split): 하부섹션 1825, 분절 갭 3mm
                    const isPantrySplitDim = doorModule.moduleId.includes('pantry-cabinet-split');
                    const defaultLowerSecTopMm = isPantrySplitDim ? 1825 : 860;
                    // customSections[0].height가 있으면 동적 적용 (섹션 H 변경 시 도어도 따라감)
                    const customSecsForDim = (doorModule as any).customSections;
                    const customLowerH = (customSecsForDim && customSecsForDim.length > 0)
                      ? customSecsForDim[0].height : undefined;
                    const lowerSecTopMm = usesSideSectionBasis
                      ? sideSectionHeights[0]
                      : (typeof customLowerH === 'number' && customLowerH > 0)
                        ? customLowerH : defaultLowerSecTopMm;
                    const defaultLowerDoorTopGapVal = isPantrySplitDim ? -2 : -40;
                    const defaultUpperDoorBottomGapVal = isPantrySplitDim ? -1 : 20;
                    const lowerDoorTopGapVal = typeof (doorModule as any).lowerDoorTopGap === 'number'
                      ? ((doorModule as any).lowerDoorTopGap === (isPantrySplitDim ? 2 : 40) ? defaultLowerDoorTopGapVal : (doorModule as any).lowerDoorTopGap)
                      : defaultLowerDoorTopGapVal;
	                    const upperDoorBottomGapVal = typeof (doorModule as any).upperDoorBottomGap === 'number'
	                      ? (
	                        (!isPantrySplitDim && (doorModule as any).upperDoorBottomGap === -20)
	                          ? defaultUpperDoorBottomGapVal
	                          : (isPantrySplitDim && (doorModule as any).upperDoorBottomGap === 1 ? defaultUpperDoorBottomGapVal : (doorModule as any).upperDoorBottomGap)
	                      )
	                      : defaultUpperDoorBottomGapVal;
	                    const lowerDoorBottomGapVal = (doorModule as any).lowerDoorBottomGap ?? 0;
	                    const shelfSplitDefaultUpperTopGap = !isPantrySplitDim
	                      ? (spaceInfo.surroundType === 'surround' && spaceInfo.frameConfig?.top !== false && (doorModule as any).hasTopFrame !== false ? -3 : 5)
	                      : 0;
	                    const upperDoorTopGapVal = typeof (doorModule as any).upperDoorTopGap === 'number'
	                      ? (doorModule as any).upperDoorTopGap
	                      : !isPantrySplitDim && (doorTopGapVal === undefined || doorTopGapVal === 0 || doorTopGapVal === 5 || doorTopGapVal === -3)
	                        ? shelfSplitDefaultUpperTopGap
	                        : doorTopGapVal;
                    const lowerDoorTopFromBottom = lowerSecTopMm + lowerDoorTopGapVal;
                    const lowerDoorBottomAbs = cabinetBottomAbsS - (lowerDoorBottomGapVal || 0);
                    const lowerDoorTopAbs = cabinetBottomAbsS + lowerDoorTopFromBottom;
                    const lowerDoorH = lowerDoorTopAbs - lowerDoorBottomAbs;
                    // 몸통 기준 +값이면 상부도어 하단은 아래로 확장된다.
                    const upperDoorBottomAbs = cabinetBottomAbsS + lowerSecTopMm - upperDoorBottomGapVal;
                    const upperDoorTopAbs = cabinetTopAbsS + (upperDoorTopGapVal || 0);
                    const upperDoorH = upperDoorTopAbs - upperDoorBottomAbs;

                    const lowerBY = mmToThreeUnits(lowerDoorBottomAbs);
                    const lowerTY = mmToThreeUnits(lowerDoorTopAbs);
                    const lowerMidY = (lowerBY + lowerTY) / 2;
                    const upperBY = mmToThreeUnits(upperDoorBottomAbs);
                    const upperTY = mmToThreeUnits(upperDoorTopAbs);
                    const upperMidY = (upperBY + upperTY) / 2;
                    const lowerDoorGuideFrontZ = resolveDoorSectionFrontZ('lower');
                    const upperDoorGuideFrontZ = resolveDoorSectionFrontZ('upper');
                    const lowerDoorDimZ = lowerDoorGuideFrontZ + doorDimOffsetZ;
                    const upperDoorDimZ = upperDoorGuideFrontZ + doorDimOffsetZ;

                    const renderSplitDim = (
                      bY: number,
                      tY: number,
                      midY: number,
                      heightMm: number,
                      key: string,
                      guideFrontZ: number,
                      dimZ: number
                    ) => (
                      <group key={key} name={`door-dimension-height-${key}`}>
                        <Line points={[[0, bY, dimZ], [0, tY, dimZ]]} color={doorColor} lineWidth={0.6} />
                        <Line points={createArrowHead([0, bY, dimZ], [0, bY + 0.015, dimZ])} color={doorColor} lineWidth={0.6} />
                        <Line points={createArrowHead([0, tY, dimZ], [0, tY - 0.015, dimZ])} color={doorColor} lineWidth={0.6} />
                        <Text
                          renderOrder={100001} depthTest={false}
                          position={[0, midY, dimZ + mmToThreeUnits(60)]}
                          fontSize={baseFontSize} color={doorColor}
                          anchorX="center" anchorY="middle"
                          outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                          rotation={[0, -Math.PI / 2, -Math.PI / 2]}
                        >
                          {Math.round(heightMm)}
                        </Text>
                        <Line points={[[0, tY, guideFrontZ], [0, tY, dimZ - doorGuideEndInsetZ]]} color={doorColor} lineWidth={0.3} />
                        <Line points={[[0, bY, guideFrontZ], [0, bY, dimZ - doorGuideEndInsetZ]]} color={doorColor} lineWidth={0.3} />
                      </group>
                    );

                    return (
                      <group name="door-dimension-height-split">
                        {lowerDoorH > 0 && renderSplitDim(lowerBY, lowerTY, lowerMidY, lowerDoorH, 'lower', lowerDoorGuideFrontZ, lowerDoorDimZ)}
                        {upperDoorH > 0 && renderSplitDim(upperBY, upperTY, upperMidY, upperDoorH, 'upper', upperDoorGuideFrontZ, upperDoorDimZ)}
                      </group>
                    );
                  }

                  if (doorCategory === 'upper') {
                    // 상부장 도어 (몸통 기준, EP와 동일)
                    // doorHeight = 몸통H + 상단갭 + 하단갭
                    // 몸통 H는 팝업 H와 동일해야 함: 상부장은 customHeight 우선
                    // doorModData.dimensions.height는 zone/maxHeight 영향으로 바뀔 수 있어 사용 안 함
                    const cabinetH = doorModule.customHeight
                      ?? doorModule.freeHeight
                      ?? 785; // 상부장 표준 높이
                    const topFrameVal = doorModule.topFrameThickness ?? (spaceInfo.frameSize?.top ?? 30);
                    const cabinetTopAbs = effectiveH - topFrameVal;
                    const cabinetBottomAbs = cabinetTopAbs - cabinetH;
                    doorTopAbsMm = cabinetTopAbs + doorTopGapVal;
                    doorBottomAbsMm = cabinetBottomAbs - doorBottomGapVal;
                    doorHeightMm = cabinetH + doorTopGapVal + doorBottomGapVal;
                    console.log('🚪 [측면뷰 상부장 도어 H 디버그]', {
                      moduleId: doorModule.moduleId,
                      cabinetH,
                      freeHeight: doorModule.freeHeight,
                      customHeight: doorModule.customHeight,
                      doorModData_height: doorModData?.dimensions.height,
                      doorTopGapVal,
                      doorBottomGapVal,
                      topFrameVal,
                      doorHeightMm,
                      doorTopAbsMm,
                      doorBottomAbsMm,
                    });
                  } else if (doorCategory === 'lower') {
                    const cabinetH = doorModData?.dimensions.height ?? 1000;
                    const isDoorLift = doorModData?.id?.includes('lower-door-lift-');
                    const isTopDown = doorModData?.id?.includes('lower-top-down-');
                    const cabinetBottomAbs = bottomFrameHeight;

                    if (isTopDown) {
                      doorHeightMm = 710;
                      doorBottomAbsMm = cabinetBottomAbs - 5;
                      doorTopAbsMm = doorBottomAbsMm + doorHeightMm;
                    } else if (isDoorLift) {
                      doorHeightMm = cabinetH + 5 + 30;
                      doorTopAbsMm = cabinetBottomAbs + cabinetH + 30;
                      doorBottomAbsMm = doorTopAbsMm - doorHeightMm;
                    } else {
                      doorHeightMm = cabinetH - 20 + 2;
                      doorTopAbsMm = cabinetBottomAbs + cabinetH - 20;
                      doorBottomAbsMm = doorTopAbsMm - doorHeightMm;
                    }
                  } else {
                    // 키큰장
                    // 가구는 마감재만큼 올라가지만 도어 하단 치수는 마감 바닥 기준으로 마감재 두께가 빠져야 한다.
                    doorBottomAbsMm = bottomFrameHeight - doorBottomGapVal;
                    doorTopAbsMm = effectiveH - doorTopGapVal;
                    doorHeightMm = Math.max(0, doorTopAbsMm - doorBottomAbsMm);
                  }

                  if (doorHeightMm <= 0) return null;

                  const doorBottomY = mmToThreeUnits(doorBottomAbsMm);
                  const doorTopY = mmToThreeUnits(doorTopAbsMm);
                  const doorMidY = (doorBottomY + doorTopY) / 2;

                  return (
                    <group name="door-dimension-height">
                      <Line
                        points={[[0, doorBottomY, doorDimZ], [0, doorTopY, doorDimZ]]}
                        color={doorColor} lineWidth={0.6}
                      />
                      <Line
                        points={createArrowHead([0, doorBottomY, doorDimZ], [0, doorBottomY + 0.015, doorDimZ])}
                        color={doorColor} lineWidth={0.6}
                      />
                      <Line
                        points={createArrowHead([0, doorTopY, doorDimZ], [0, doorTopY - 0.015, doorDimZ])}
                        color={doorColor} lineWidth={0.6}
                      />
                      <Text
                        name="door-dimension-height-text"
                        renderOrder={100001} depthTest={false}
                        position={[0, doorMidY, doorDimZ + mmToThreeUnits(60)]}
                        fontSize={baseFontSize}
                        color={doorColor}
                        anchorX="center" anchorY="middle"
                        outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                        rotation={[0, -Math.PI / 2, -Math.PI / 2]}
                      >
                        {Math.round(doorHeightMm)}
                      </Text>
                      {/* 도어 경계 연장선 */}
                      <Line
                        points={[[0, doorTopY, doorGuideFrontZ], [0, doorTopY, doorGuideEndZ]]}
                        color={doorColor} lineWidth={0.3}
                      />
                      <Line
                        points={[[0, doorBottomY, doorGuideFrontZ], [0, doorBottomY, doorGuideEndZ]]}
                        color={doorColor} lineWidth={0.3}
                      />
                    </group>
                  );
                })()}

                {/* 연장선들 */}
                <Line
                  points={[[0, bottomY, lowerGuideFrontZ], [0, bottomY, rightDimensionZ - mmToThreeUnits(20)]]}
                  color={dimensionColor}
                  lineWidth={0.3}
                />
                {/* 걸래받이 상단 연장선 - 받침대가 있는 경우에만 표시 */}
                {bottomFrameHeight > 0 && (
                <Line
                  points={[[0, bottomFrameTopY, lowerGuideFrontZ], [0, bottomFrameTopY, rightDimensionZ - mmToThreeUnits(20)]]}
                  color={dimensionColor}
                  lineWidth={0.3}
                />
                )}
                {!isTopFrameOff && topFrameDimensionHeight > 0 && (
                  <>
                    <Line
                      points={[[0, cabinetAreaTopY, upperGuideFrontZ], [0, cabinetAreaTopY, rightDimensionZ - mmToThreeUnits(20)]]}
                      color={topSegmentColor}
                      lineWidth={0.3}
                    />
                    <Line
                      points={[[0, topFrameTopY, upperGuideFrontZ], [0, topFrameTopY, rightDimensionZ - mmToThreeUnits(20)]]}
                      color={topSegmentColor}
                      lineWidth={0.3}
                    />
                  </>
                )}
              </>
            );
          })()}
        </group>}


        {/* 가구별 치수선 (좌측뷰에서는 깊이 치수) - 좌측뷰에서는 가장 왼쪽 가구만 표시 */}
        {showDimensions && leftmostModules.map((module, index) => {
          // 좌측뷰에서는 가장 왼쪽 가구만 대상으로 깊이 치수 표시
          const moduleData = getModuleById(
            module.moduleId,
            { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
            spaceInfo
          );
          
          if (!moduleData) return null;
          
          // 실제 가구 깊이와 위치 계산 (FurnitureItem.tsx와 동일)
          // 2섹션 가구인 경우 상부/하부 섹션 깊이 각각 사용
          const hasMultiSection = module.upperSectionDepth !== undefined || module.lowerSectionDepth !== undefined;

          // 상부 치수용 (기본값: 상부섹션 깊이)
          const depthSection = hasMultiSection || moduleData.category === 'upper' || module.moduleId?.includes('upper-cabinet')
            ? 'upper'
            : 'auto';
          
          // 실제 가구 Z 위치 계산 (FurnitureItem.tsx와 동일)
          const upperSpan = resolveSideDimensionDepthSpanZ(module, moduleData, depthSection, furnitureZOffset, furnitureDepth);
          const actualDepth = upperSpan.depthMm;
          const furnitureBackZ = upperSpan.backZ;
          const furnitureFrontZ = upperSpan.frontZ;
          
          // 치수선은 공간 상단에 표시
          const dimY = actualSpaceHeight + mmToThreeUnits(150);
          const furnitureX = module.position.x;
          const furnitureHeight = mmToThreeUnits(module.customHeight || moduleData.dimensions.height);
          const furnitureTopY = module.position.y + furnitureHeight / 2;

          return (
            <group key={`left-module-dim-${index}`}>
              {/* 가구 깊이 치수선 (상단) */}
              <Line
                points={[[furnitureX, dimY, furnitureBackZ], [furnitureX, dimY, furnitureFrontZ]]}
                color={dimensionColor}
                lineWidth={0.6}
              />

              {/* 화살표들 */}
              <Line
                points={createArrowHead([furnitureX, dimY, furnitureBackZ], [furnitureX, dimY, furnitureBackZ + 0.02], 0.01)}
                color={dimensionColor}
                lineWidth={0.6}
              />
              <Line
                points={createArrowHead([furnitureX, dimY, furnitureFrontZ], [furnitureX, dimY, furnitureFrontZ - 0.02], 0.01)}
                color={dimensionColor}
                lineWidth={0.6}
              />

              {/* 치수 텍스트 */}
              <Text
                renderOrder={100001}
                depthTest={false}
                position={[furnitureX, dimY + mmToThreeUnits(50), (furnitureBackZ + furnitureFrontZ) / 2]}
                fontSize={largeFontSize}
                color={textColor}
                anchorX="center"
                anchorY="middle"
                outlineWidth={textOutlineWidth}
                outlineColor={textOutlineColor}
              >
                {actualDepth}
              </Text>

              {/* 연장선 (가구 상단에서 치수선까지) */}
              <Line
                points={[[furnitureX, furnitureTopY, furnitureBackZ], [furnitureX, dimY + mmToThreeUnits(10), furnitureBackZ]]}
                color={dimensionColor}
                lineWidth={0.6}
                dashed={false}
              />
              <Line
                points={[[furnitureX, furnitureTopY, furnitureFrontZ], [furnitureX, dimY + mmToThreeUnits(10), furnitureFrontZ]]}
                color={dimensionColor}
                lineWidth={0.6}
                dashed={false}
              />

              {/* 하부섹션 깊이 치수 (2섹션 가구인 경우) */}
              {hasMultiSection && (() => {
                const lowerSpan = resolveSideDimensionDepthSpanZ(module, moduleData, 'lower', furnitureZOffset, furnitureDepth);
                const lowerBackZ = lowerSpan.backZ;
                const lowerFrontZ = lowerSpan.frontZ;
                const lowerDimY = mmToThreeUnits(-50); // 하단 치수선 위치
                const furnitureBottomY = module.position.y - furnitureHeight / 2;

                return (
                  <group>
                    {/* 하부 깊이 치수선 */}
                    <Line
                      points={[[furnitureX, lowerDimY, lowerBackZ], [furnitureX, lowerDimY, lowerFrontZ]]}
                      color={dimensionColor}
                      lineWidth={0.6}
                    />

                    {/* 화살표들 */}
                    <Line
                      points={createArrowHead([furnitureX, lowerDimY, lowerBackZ], [furnitureX, lowerDimY, lowerBackZ + 0.02], 0.01)}
                      color={dimensionColor}
                      lineWidth={0.6}
                    />
                    <Line
                      points={createArrowHead([furnitureX, lowerDimY, lowerFrontZ], [furnitureX, lowerDimY, lowerFrontZ - 0.02], 0.01)}
                      color={dimensionColor}
                      lineWidth={0.6}
                    />

                    {/* 치수 텍스트 */}
                    <Text
                      renderOrder={100001}
                      depthTest={false}
                      position={[furnitureX, lowerDimY - mmToThreeUnits(50), (lowerBackZ + lowerFrontZ) / 2]}
                      fontSize={largeFontSize}
                      color={textColor}
                      anchorX="center"
                      anchorY="middle"
                    >
                      {lowerSpan.depthMm}
                    </Text>

                    {/* 연장선 (가구 하단에서 치수선까지) */}
                    <Line
                      points={[[furnitureX, furnitureBottomY, lowerBackZ], [furnitureX, lowerDimY - mmToThreeUnits(10), lowerBackZ]]}
                      color={dimensionColor}
                      lineWidth={0.6}
                      dashed={false}
                    />
                    <Line
                      points={[[furnitureX, furnitureBottomY, lowerFrontZ], [furnitureX, lowerDimY - mmToThreeUnits(10), lowerFrontZ]]}
                      color={dimensionColor}
                      lineWidth={0.6}
                      dashed={false}
                    />
                  </group>
                );
              })()}
            </group>
          );
        })}

        {/* 단내림 구간 치수선 - 좌측뷰 */}
        {showDimensions && spaceInfo.droppedCeiling?.enabled && (
          <group>
            {(() => {
              const normalBounds = getNormalZoneBounds(spaceInfo);
              const droppedBounds = getDroppedZoneBounds(spaceInfo);
              const subDimensionY = actualSpaceHeight + mmToThreeUnits(50); // 전체 폭 치수선 아래

              // 슬롯배치 커튼박스 폭 — 단내림 바깥쪽(벽쪽)에 위치
              const cbW = (!isFreePlacement && spaceInfo.curtainBox?.enabled) ? (spaceInfo.curtainBox.width || 150) : 0;
              const mainW = spaceInfo.width - spaceInfo.droppedCeiling.width - cbW;
              const droppedW = spaceInfo.droppedCeiling.width;

              // 메인 구간 치수선 — [CB][단내림][메인] 또는 [메인][단내림][CB]
              const mainStartX = spaceInfo.droppedCeiling.position === 'left'
                ? -actualSpaceWidth/2 + mmToThreeUnits(cbW + droppedW)
                : -actualSpaceWidth/2;
              const mainEndX = spaceInfo.droppedCeiling.position === 'left'
                ? actualSpaceWidth/2
                : -actualSpaceWidth/2 + mmToThreeUnits(mainW);

              // 단내림 구간 치수선
              const droppedStartX = spaceInfo.droppedCeiling.position === 'left'
                ? -actualSpaceWidth/2 + mmToThreeUnits(cbW)
                : -actualSpaceWidth/2 + mmToThreeUnits(mainW);
              const droppedEndX = spaceInfo.droppedCeiling.position === 'left'
                ? -actualSpaceWidth/2 + mmToThreeUnits(cbW + droppedW)
                : -actualSpaceWidth/2 + mmToThreeUnits(mainW + droppedW);
              
              return (
                <>
                  {/* 메인 구간 치수선 */}
                  <Line
                    points={[[mainStartX, subDimensionY, 0], [mainEndX, subDimensionY, 0]]}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Line
                    points={createArrowHead([mainStartX, subDimensionY, 0], [mainStartX + 0.05, subDimensionY, 0])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Line
                    points={createArrowHead([mainEndX, subDimensionY, 0], [mainEndX - 0.05, subDimensionY, 0])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Text
                  renderOrder={100001}
                  depthTest={false}
                    position={[(mainStartX + mainEndX) / 2, subDimensionY + mmToThreeUnits(30), 0]}
                    fontSize={smallFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                  >
                    {Math.round(mainW)}
                  </Text>

                  {/* 단내림 구간 치수선 */}
                  <Line
                    points={[[droppedStartX, subDimensionY, 0], [droppedEndX, subDimensionY, 0]]}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Line
                    points={createArrowHead([droppedStartX, subDimensionY, 0], [droppedStartX + 0.05, subDimensionY, 0])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Line
                    points={createArrowHead([droppedEndX, subDimensionY, 0], [droppedEndX - 0.05, subDimensionY, 0])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Text
                  renderOrder={100001}
                  depthTest={false}
                    position={[(droppedStartX + droppedEndX) / 2, subDimensionY + mmToThreeUnits(30), 0]}
                    fontSize={smallFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                  >
                    {Math.round(droppedW)}
                  </Text>
                  
                  {/* 구간 분리 가이드라인 */}
                  <Line
                    points={[
                      [spaceInfo.droppedCeiling.position === 'left' ? -actualSpaceWidth/2 + mmToThreeUnits(droppedBounds.width) : -actualSpaceWidth/2 + mmToThreeUnits(normalBounds.width), 0, 0],
                      [spaceInfo.droppedCeiling.position === 'left' ? -actualSpaceWidth/2 + mmToThreeUnits(droppedBounds.width) : -actualSpaceWidth/2 + mmToThreeUnits(normalBounds.width), subDimensionY - mmToThreeUnits(20), 0]
                    ]}
                    color={subGuideColor}
                    lineWidth={0.6}
                    dashed
                  />
                </>
              );
            })()}
          </group>
        )}
        
        {/* 발통 심볼 - 좌측뷰 */}
        {placedModules.map((module, index) => {
          const moduleData = getModuleById(module.moduleId);
          if (!moduleData) return null;
          
          const moduleZ = module.position.z || 0;
          const moduleDepth = (moduleData.dimensions.depth || 600) * 0.01;
          
          // 가구 좌측면 하단 중앙에 발통 심볼 배치
          return (
            <group key={`footstool-left-${module.id || index}`}>
              {renderFootstoolSymbol(
                leftDimensionX + mmToThreeUnits(100), 
                mmToThreeUnits(100), 
                spaceZOffset + moduleZ,
                [0, -Math.PI / 2, 0] // Y축 -90도 회전 (좌측뷰)
              )}
            </group>
          );
        })}
      </group>
    );
  };

  // 우측뷰 치수선 - Room.tsx와 정확히 동일한 좌표계 사용
  const renderRightView = () => {
    if (currentViewDirection !== 'right') return null;
    
    // Room.tsx와 동일한 계산
    const panelDepthMm = spaceInfo.depth || 600;
    const furnitureDepthMm = 600;
    const spaceWidth = mmToThreeUnits(spaceInfo.width);
    const spaceDepth = mmToThreeUnits(spaceInfo.depth);
    const spaceHeight = mmToThreeUnits(spaceInfo.height);
    const panelDepth = mmToThreeUnits(panelDepthMm);
    const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
    
    // Room.tsx와 완전히 동일한 Z 오프셋 계산
    const spaceZOffset = -panelDepth / 2;
    const furnitureZOffset = spaceZOffset + (panelDepth - furnitureDepth) / 2;
    
    const actualSpaceWidth = mmToThreeUnits(spaceInfo.width);
    const actualSpaceHeight = mmToThreeUnits(spaceInfo.height);
    
    const frameSize = spaceInfo.frameSize || { left: 50, right: 50, top: 50 };
    const topDimensionY = actualSpaceHeight + mmToThreeUnits(hasPlacedModules ? 280 : 200);
    const rightDimensionX = actualSpaceWidth + mmToThreeUnits(200); // 우측 치수선 X 위치
    
    return (
      <group renderOrder={1000000}>
        {/* 상단 전체 깊이 치수선 - 숨김 */}
        {/* <group>
          {/* 치수선 *}
          <Line
            points={[[rightDimensionX, topDimensionY, spaceZOffset], [rightDimensionX, topDimensionY, spaceZOffset + panelDepth]]}
            color={dimensionColor}
            lineWidth={0.6}
          />
          
          {/* 전면 화살표 *}
          <Line
            points={createArrowHead([rightDimensionX, topDimensionY, spaceZOffset], [rightDimensionX, topDimensionY, spaceZOffset + 0.05])}
            color={dimensionColor}
            lineWidth={0.6}
          />
          
          {/* 후면 화살표 *}
          <Line
            points={createArrowHead([rightDimensionX, topDimensionY, spaceZOffset + panelDepth], [rightDimensionX, topDimensionY, spaceZOffset + panelDepth - 0.05])}
            color={dimensionColor}
            lineWidth={0.6}
          />
          
          {/* 전체 깊이 치수 텍스트 *}
          {(showDimensionsText || isStep2) && (
            <Text
                  renderOrder={100001}
                  depthTest={false}
              position={[rightDimensionX + mmToThreeUnits(60), topDimensionY, spaceZOffset + panelDepth / 2]}
              fontSize={largeFontSize}
              color={textColor}
              anchorX="center"
              anchorY="middle"
              outlineWidth={textOutlineWidth}
              outlineColor={textOutlineColor}
              rotation={[0, -Math.PI / 2, 0]}
            >
              {spaceInfo.depth}
            </Text>
          )}
          
          {/* 연장선 (전면) *}
          <Line
            points={[[actualSpaceWidth, 0, spaceZOffset], [rightDimensionX + mmToThreeUnits(20), 0, spaceZOffset]]}
            color={dimensionColor}
            lineWidth={0.6}
          />
          <Line
            points={[[actualSpaceWidth, actualSpaceHeight, spaceZOffset], [rightDimensionX + mmToThreeUnits(20), actualSpaceHeight, spaceZOffset]]}
            color={dimensionColor}
            lineWidth={0.6}
          />
          
          {/* 연장선 (후면) *}
          <Line
            points={[[actualSpaceWidth, 0, spaceZOffset + panelDepth], [rightDimensionX + mmToThreeUnits(20), 0, spaceZOffset + panelDepth]]}
            color={dimensionColor}
            lineWidth={0.6}
          />
          <Line
            points={[[actualSpaceWidth, actualSpaceHeight, spaceZOffset + panelDepth], [rightDimensionX + mmToThreeUnits(20), actualSpaceHeight, spaceZOffset + panelDepth]]}
            color={dimensionColor}
            lineWidth={0.6}
          />
        </group> */}
        
        {/* 우측 전체 높이 치수선 */}
        {showDimensions && <group>
          {/* 단내림이 있는 경우 높이 치수선 표시 */}
          {spaceInfo.droppedCeiling?.enabled ? (
            <>
              {/* 단내림 위치에 따라 치수선 표시 */}
              {spaceInfo.droppedCeiling.position === 'right' ? (
                <>
                  {/* 우측 커튼박스 — 커튼박스 높이차이 치수 제거 (사용자 요청) */}
                  {/* 슬롯배치에서만 단내림 높이차이 표시 */}
                  {!isFreePlacement && (() => {
                    const dimBottom = mmToThreeUnits(spaceInfo.height - spaceInfo.droppedCeiling.dropHeight);
                    const dimTop = actualSpaceHeight;
                    const dimMid = (dimBottom + dimTop) / 2;
                    const zPos = spaceZOffset - mmToThreeUnits(200);
                    return (
                      <>
                        <Line
                          points={[[rightDimensionX, dimBottom, zPos], [rightDimensionX, dimTop, zPos]]}
                          color={dimensionColor}
                          lineWidth={0.6}
                        />
                        <Line
                          points={createArrowHead([rightDimensionX, dimBottom, zPos], [rightDimensionX, dimBottom + 0.05, zPos])}
                          color={dimensionColor}
                          lineWidth={0.6}
                        />
                        <Line
                          points={createArrowHead([rightDimensionX, dimTop, zPos], [rightDimensionX, dimTop - 0.05, zPos])}
                          color={dimensionColor}
                          lineWidth={0.6}
                        />
                        {(showDimensionsText || isStep2) && (
                          <Text
                            renderOrder={100001}
                            depthTest={false}
                            position={[rightDimensionX + mmToThreeUnits(60), dimMid, zPos]}
                            fontSize={largeFontSize}
                            color={textColor}
                            anchorX="center"
                            anchorY="middle"
                            outlineWidth={textOutlineWidth}
                            outlineColor={textOutlineColor}
                            rotation={[0, 0, 0]}
                          >
                            {spaceInfo.droppedCeiling.dropHeight}
                          </Text>
                        )}
                      </>
                    );
                  })()}
                </>
              ) : (
                <>
                  {/* 좌측 단내림 - 우측 외부 치수선에 전체 높이 표시 */}
                  <Line
                    points={[[rightDimensionX, 0, spaceZOffset - mmToThreeUnits(200)], [rightDimensionX, actualSpaceHeight, spaceZOffset - mmToThreeUnits(200)]]}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  
                  {/* 하단 화살표 */}
                  <Line
                    points={createArrowHead([rightDimensionX, 0, spaceZOffset - mmToThreeUnits(200)], [rightDimensionX, 0.05, spaceZOffset - mmToThreeUnits(200)])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  
                  {/* 상단 화살표 */}
                  <Line
                    points={createArrowHead([rightDimensionX, actualSpaceHeight, spaceZOffset - mmToThreeUnits(200)], [rightDimensionX, actualSpaceHeight - 0.05, spaceZOffset - mmToThreeUnits(200)])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  
                  {/* 전체 높이 텍스트 */}
                  {(showDimensionsText || isStep2) && (
                    <Text
                  renderOrder={100001}
                  depthTest={false}
                      position={[rightDimensionX + mmToThreeUnits(60), actualSpaceHeight / 2, spaceZOffset - mmToThreeUnits(200)]}
                      fontSize={largeFontSize}
                      color={textColor}
                      anchorX="center"
                      anchorY="middle"
                      outlineWidth={textOutlineWidth}
                      outlineColor={textOutlineColor}
                      rotation={[0, 0, 0]}
                    >
                      {spaceInfo.height - floorFinishHeightMmGlobal}
                    </Text>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              {/* 단내림이 없는 경우 기존 전체 높이 치수선 */}
              {/* 치수선 */}
              <Line
                points={[[rightDimensionX, 0, spaceZOffset - mmToThreeUnits(200)], [rightDimensionX, actualSpaceHeight, spaceZOffset - mmToThreeUnits(200)]]}
                color={dimensionColor}
                lineWidth={0.6}
              />

              {/* 하단 화살표 */}
              <Line
                points={createArrowHead([rightDimensionX, 0, spaceZOffset - mmToThreeUnits(200)], [rightDimensionX, 0.05, spaceZOffset - mmToThreeUnits(200)])}
                color={dimensionColor}
                lineWidth={0.6}
              />

              {/* 상단 화살표 */}
              <Line
                points={createArrowHead([rightDimensionX, actualSpaceHeight, spaceZOffset - mmToThreeUnits(200)], [rightDimensionX, actualSpaceHeight - 0.05, spaceZOffset - mmToThreeUnits(200)])}
                color={dimensionColor}
                lineWidth={0.6}
              />

              {/* 전체 높이 치수 텍스트 */}
              {(showDimensionsText || isStep2) && (
                <Text
                  renderOrder={100001}
                  depthTest={false}
                  position={[rightDimensionX + mmToThreeUnits(60), actualSpaceHeight / 2, spaceZOffset - mmToThreeUnits(200)]}
                  fontSize={largeFontSize}
                  color={textColor}
                  anchorX="center"
                  anchorY="middle"
                  outlineWidth={textOutlineWidth}
                  outlineColor={textOutlineColor}
                  rotation={[0, 0, 0]}
                >
                  {spaceInfo.height - floorFinishHeightMmGlobal}
                </Text>
              )}
            </>
          )}
          
          {/* 연장선 */}
          <Line
            points={[[actualSpaceWidth, 0, spaceZOffset], [actualSpaceWidth, 0, spaceZOffset - mmToThreeUnits(180)]]}
            color={dimensionColor}
            lineWidth={0.6}
          />
          <Line
            points={[[actualSpaceWidth, actualSpaceHeight, spaceZOffset], [actualSpaceWidth, actualSpaceHeight, spaceZOffset - mmToThreeUnits(180)]]}
            color={dimensionColor}
            lineWidth={0.6}
          />
          
          {/* 단내림/커튼박스 높이 연장선 - 커튼박스가 있는 경우에만 표시 */}
          {spaceInfo.droppedCeiling?.enabled && (
            <Line
              points={[
                [actualSpaceWidth, isFreePlacement ? mmToThreeUnits(spaceInfo.height + spaceInfo.droppedCeiling.dropHeight) : mmToThreeUnits(spaceInfo.height - spaceInfo.droppedCeiling.dropHeight), spaceZOffset],
                [actualSpaceWidth, isFreePlacement ? mmToThreeUnits(spaceInfo.height + spaceInfo.droppedCeiling.dropHeight) : mmToThreeUnits(spaceInfo.height - spaceInfo.droppedCeiling.dropHeight), spaceZOffset - mmToThreeUnits(180)]
              ]}
              color={dimensionColor}
              lineWidth={0.6}
            />
          )}

          {/* 커튼박스 전체 높이 치수선 — 좌측뷰 (제거됨, 사용자 요청) */}
        </group>}

        {/* 좌측 3구간 높이 치수선 */}
        {showDimensions && <group>
          {(() => {
            const leftDimensionZ = spaceZOffset + panelDepth + mmToThreeUnits(120);

            // useMemo로 메모이제이션된 값 사용
            const {
              maxLowerCabinetHeightMm,
              maxUpperCabinetHeightMm,
              adjustedUpperCabinetHeightMm,
              isFloating,
              floatHeight,
              floorFinishHeightMm,
              bottomFrameHeight: globalBottomFrame,
              topFrameHeight: globalTopFrame
            } = furnitureHeights;

            // 개별 모듈의 baseFrameHeight 우선 사용 (선택된 슬롯 기준 가구)
            const viewMod = sideViewMod || rightmostModules[0];
            const getSideCategory = (mod: typeof viewMod) => {
              if (!mod) return 'full';
              const modData = getModuleById(mod.moduleId);
              return modData?.category
                ?? (mod.moduleId.includes('upper') ? 'upper'
                  : mod.moduleId.includes('lower') ? 'lower' : 'full');
            };
            const viewModCategoryForFrame = getSideCategory(viewMod);
            const findSideCompanion = (targetCategory: string) => {
              if (!viewMod) return undefined;
              return placedModules.find(m => {
                if (m.id === viewMod.id) return false;
                const bothHaveSlot = m.slotIndex !== undefined && viewMod.slotIndex !== undefined;
                const samePos = bothHaveSlot
                  ? m.slotIndex === viewMod.slotIndex
                  : Math.abs((m.position?.x ?? 0) - (viewMod.position?.x ?? 0)) < 300;
                return samePos && getSideCategory(m) === targetCategory;
              });
            };
            const bottomFrameRefMod = viewModCategoryForFrame === 'upper'
              ? findSideCompanion('lower')
              : viewMod;
            const topFrameRefMod = viewModCategoryForFrame === 'lower'
              ? (findSideCompanion('upper') ?? viewMod)
              : viewMod;
            const bottomFrameRefCategory = getSideCategory(bottomFrameRefMod);
            const lowerTopFinishRefMod = bottomFrameRefCategory === 'lower'
              ? bottomFrameRefMod
              : findSideCompanion('lower');
            // 가구별 상단몰딩/상단갭 우선 (하부 OFF 시 상단몰딩에 흡수된 베이스 분 빼서 표시)
            const isTopFrameOff = topFrameRefMod?.hasTopFrame === false;
            const rawTopFrame = topFrameRefMod?.topFrameThickness ?? globalTopFrame;
            const globalBaseMm = spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 60) : 0;
            const canAbsorbBaseInSideView = bottomFrameRefCategory === 'full' || bottomFrameRefCategory === 'lower';
            const isShelfSplitSideView = !!viewMod?.moduleId?.includes('shelf-split')
              || !!bottomFrameRefMod?.moduleId?.includes('shelf-split')
              || !!topFrameRefMod?.moduleId?.includes('shelf-split');
            const canAbsorbBaseIntoTopFrame = bottomFrameRefCategory === 'full' && !isShelfSplitSideView;
            const baseFrameAbsorbed = canAbsorbBaseIntoTopFrame && bottomFrameRefMod?.hasBase === false
              ? (bottomFrameRefMod.baseFrameHeight ?? globalBaseMm)
              : 0;
            const bottomFrameHeight = canAbsorbBaseInSideView && bottomFrameRefMod?.hasBase === false
              ? (bottomFrameRefMod.individualFloatHeight ?? 0)
              : (bottomFrameRefMod?.baseFrameHeight !== undefined && spaceInfo.baseConfig?.type === 'floor')
                ? bottomFrameRefMod.baseFrameHeight : globalBottomFrame;
            const bottomFrameGapHeight = canAbsorbBaseInSideView && bottomFrameRefMod?.hasBase === false
              ? 0
              : Math.max(0, Math.min(bottomFrameHeight, (bottomFrameRefMod as any)?.baseFrameGap ?? 0));
            const bottomFrameVisibleHeight = Math.max(0, bottomFrameHeight - bottomFrameGapHeight);
            const moduleFloatHeight = canAbsorbBaseInSideView && bottomFrameRefMod?.hasBase === false
              ? Math.max(0, Math.round(bottomFrameRefMod.individualFloatHeight ?? 0))
              : 0;
            const sideIsFloating = isFloating || moduleFloatHeight > 0;
            const sideFloatHeight = isFloating ? floatHeight : moduleFloatHeight;
            const sideBodyStartMm = sideIsFloating ? floorFinishHeightMm + sideFloatHeight : bottomFrameHeight;
            const shelfSplitDynamicTopFrame = (() => {
              const refMod = topFrameRefMod ?? viewMod;
              const sections = Array.isArray((refMod as any)?.customSections) ? (refMod as any).customSections : [];
              if (!refMod?.moduleId?.includes('shelf-split') || sections.length < 2) return null;
              const bodyTopMm = bottomFrameHeight + sections
                .slice(0, 2)
                .reduce((sum: number, section: any) => sum + (Number(section?.height) || 0), 0);
              return Math.max(0, Math.round(spaceInfo.height - bodyTopMm));
            })();
            const topFrameHeight = isTopFrameOff
              ? Math.max(0, Math.round(shelfSplitDynamicTopFrame ?? topFrameRefMod?.topFrameGap ?? 0))
              : Math.max(0, rawTopFrame - baseFrameAbsorbed);
            const hasUpperTopFrameRef = getSideCategory(topFrameRefMod) === 'upper';
            const topFrameDimensionValue = isTopFrameOff
              ? Math.max(0, Math.round(shelfSplitDynamicTopFrame ?? topFrameRefMod?.topFrameGap ?? 0))
              : Math.max(0, Math.round((hasUpperTopFrameRef ? rawTopFrame : topFrameHeight) ?? 0));
            const topFrameDimensionHeight = topFrameHeight > 0 ? topFrameHeight : topFrameDimensionValue;
            const topSegmentColor = frameDimensionColor;
            const topFinishThicknessMm = lowerTopFinishRefMod
              ? resolveLowerTopFinishThicknessMm(lowerTopFinishRefMod, spaceInfo)
              : 0;
            // console.log('🔍 [CleanCAD2D 우측 치수]', { viewModId: viewMod?.id, rawTopFrame, baseFrameAbsorbed, topFrameHeight, hasBase: viewMod?.hasBase });
            // hasBase=false → 걸래받이 0 (individualFloatHeight만 반영)
            const bottomFrameRefData = bottomFrameRefMod
              ? getModuleById(bottomFrameRefMod.moduleId, calculateInternalSpace(spaceInfo), spaceInfo)
              : null;
            const topFrameRefData = topFrameRefMod
              ? getModuleById(topFrameRefMod.moduleId, calculateInternalSpace(spaceInfo), spaceInfo)
              : null;
            const lowerGuideFrontZ = bottomFrameRefMod && bottomFrameRefData
              ? resolveSideDimensionDepthSpanZ(bottomFrameRefMod, bottomFrameRefData, 'lower', furnitureZOffset, furnitureDepth).frontZ
              : spaceZOffset;
            const upperGuideFrontZ = topFrameRefMod && topFrameRefData
              ? resolveSideDimensionDepthSpanZ(topFrameRefMod, topFrameRefData, 'upper', furnitureZOffset, furnitureDepth).frontZ
              : lowerGuideFrontZ;
            const sideSectionHeights = (() => {
              if (!viewMod || viewModCategoryForFrame !== 'full') return [] as number[];
              const mid = viewMod.moduleId || '';
              const modData = getModuleById(mid, calculateInternalSpace(spaceInfo), spaceInfo);
              const sections = (((viewMod as any).customSections || modData?.modelConfig?.sections) as any[] | undefined) || [];
              if (sections.length < 2) return [] as number[];
              const bodyBottomMm = sideBodyStartMm;
              const bodyTopMm = Math.max(0, spaceInfo.height - topFrameDimensionHeight);
              const sectionBasisH = Math.max(0, Math.round(bodyTopMm - bodyBottomMm));
              const rawHeights = sections.map(s => {
                if (s.heightType === 'absolute') return s.height || 0;
                return Math.round(sectionBasisH * (s.height || 0) / 100);
              });
              const isEntryway = mid.includes('-entryway-');
              const isPlainShelf = (mid.startsWith('single-shelf-') || mid.startsWith('dual-shelf-'))
                && !mid.includes('-4drawer-shelf-')
                && !mid.includes('-2drawer-shelf-')
                && !mid.includes('shelf-split');
              const isShelfSplit = mid.includes('shelf-split');
              if (isEntryway) {
                const fixedSum = rawHeights.slice(1).reduce((sum, h) => sum + h, 0);
                return [Math.max(0, sectionBasisH - fixedSum), ...rawHeights.slice(1)];
              }
              if (isPlainShelf || isShelfSplit) {
                const globalBaseForShelf = spaceInfo.baseConfig?.type === 'floor'
                  ? (spaceInfo.baseConfig?.height ?? 60)
                  : 0;
                const baseAbsorbedMm = !isShelfSplit && (viewMod as any).hasBase === false
                  ? globalBaseForShelf
                  : 0;
                const isFloatPlacement = spaceInfo.baseConfig?.type === 'stand'
                  && spaceInfo.baseConfig?.placementType === 'float';
                const globalFloatMm = isFloatPlacement ? (spaceInfo.baseConfig?.floatHeight || 0) : 0;
                const floatAbsorbedMm = isShelfSplit
                  ? 0
                  : (viewMod as any).hasBase === false
                  ? Math.max(0, (viewMod as any).individualFloatHeight ?? 0)
                  : globalFloatMm;
                const baseFrameDeltaMm = 0;
                const newLowerH = Math.max(0, Math.round((rawHeights[0] || 0) + baseAbsorbedMm - floatAbsorbedMm - baseFrameDeltaMm));
                const remainingUpperH = Math.max(0, sectionBasisH - newLowerH);
                const upperH = isShelfSplit && Array.isArray((viewMod as any).customSections)
                  ? Math.min(remainingUpperH, Math.max(0, Math.round(rawHeights[1] || 0)))
                  : remainingUpperH;
                return [newLowerH, upperH];
              }
              const fixedSum = rawHeights.slice(0, -1).reduce((sum, h) => sum + h, 0);
              return [...rawHeights.slice(0, -1), Math.max(0, sectionBasisH - fixedSum)];
            })();
            const hasSideSectionSplit = sideSectionHeights.length >= 2;
            const sideSectionStartMm = sideBodyStartMm;

            // 단내림 구간이면 단내림 높이, 일반 구간이면 전체 높이 사용
            const cabinetPlacementHeight = Math.max(spaceInfo.height - topFrameDimensionHeight - bottomFrameHeight, 0); // 바닥마감재는 받침대에 포함

            const bottomY = 0;
            const floorFinishTopYRight = mmToThreeUnits(floorFinishHeightMm);
            const baseStartYRight = floorFinishHeightMm > 0 ? floorFinishTopYRight : bottomY;
            const bottomFrameTopY = mmToThreeUnits(bottomFrameHeight);
            const bottomFrameGapTopY = mmToThreeUnits(bottomFrameGapHeight);
            const bottomFrameSegments = bottomFrameGapHeight > 0
              ? [
                { key: 'gap', bottomY, topY: bottomFrameGapTopY, heightMm: bottomFrameGapHeight },
                { key: 'base', bottomY: bottomFrameGapTopY, topY: bottomFrameTopY, heightMm: bottomFrameVisibleHeight },
              ].filter(seg => seg.heightMm > 0)
              : [{ key: 'base', bottomY, topY: bottomFrameTopY, heightMm: bottomFrameHeight }];
            const sideBodyStartY = mmToThreeUnits(sideBodyStartMm);
            const isLowerSideMeasure = bottomFrameRefCategory === 'lower' || viewModCategoryForFrame === 'lower';
            const lowerSideMeasureStartY = isLowerSideMeasure ? bottomY : sideBodyStartY;
            const cabinetAreaTopY = mmToThreeUnits(bottomFrameHeight + cabinetPlacementHeight);
            const topFrameTopY = cabinetAreaTopY + mmToThreeUnits(topFrameDimensionHeight);

            // 우측뷰 대상 가구(rightmostModules[0])의 높이만 사용
            let maxFurnitureTop = topFrameTopY;
            let maxModuleHeightMm = 0;
            let tallestModuleTopY = cabinetAreaTopY;
            let tallestModuleBottomY = bottomFrameTopY;

            if (viewMod) {
              const moduleData = getModuleById(viewMod.moduleId, calculateInternalSpace(spaceInfo), spaceInfo);
              const isCustomizable = viewMod.moduleId.startsWith('customizable-');
              if (moduleData || isCustomizable || viewMod.isFreePlacement) {
                const category = moduleData?.category
                  ?? (viewMod.moduleId.includes('upper') ? 'upper'
                    : viewMod.moduleId.includes('lower') ? 'lower' : 'full');
                const isGlassCabinetForSideDim = viewMod.moduleId?.includes('glass-cabinet') && category === 'full';
                let moduleHeight = isGlassCabinetForSideDim
                  ? resolveGlassCabinetBodyHeightMm(viewMod, moduleData, topFrameHeight)
                  : isTopFrameOff && category === 'full' && !viewMod.freeHeight
                  ? cabinetPlacementHeight
                  : (category === 'upper'
                    ? (viewMod.customHeight
                      ?? viewMod.freeHeight
                      ?? moduleData?.dimensions.height
                      ?? (viewMod.customConfig?.totalHeight || 2000))
                    : (viewMod.freeHeight
                      ?? viewMod.customHeight
                      ?? moduleData?.dimensions.height
                      ?? (viewMod.customConfig?.totalHeight || 2000)));
                const hasManualHeight = !!(viewMod.freeHeight || viewMod.customHeight);
                if (!isGlassCabinetForSideDim && isTopFrameOff && category === 'full' && hasManualHeight) {
                  moduleHeight += Math.max(0, rawTopFrame - topFrameHeight);
                }
                // 걸래받이 OFF (hasBase=false): 가구가 걸래받이 자리를 흡수 — moduleHeight 보정
                // (FurnitureItem.tsx의 furnitureHeightMm 보정과 동일)
                if (!isGlassCabinetForSideDim && !isTopFrameOff && !hasManualHeight && (viewMod as any).hasBase === false && category === 'full') {
                  const globalBase = spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 60) : 0;
                  const absorbedBase = (viewMod as any).baseFrameHeight ?? globalBase;
                  const floatH = (viewMod as any).individualFloatHeight ?? 0;
                  moduleHeight += (absorbedBase - floatH);
                } else if (!isGlassCabinetForSideDim && hasManualHeight && (viewMod as any).hasBase === false && category === 'full') {
                  const globalBase = spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height ?? 60) : 0;
                  const absorbedBase = (viewMod as any).baseFrameHeight ?? globalBase;
                  const floatH = (viewMod as any).individualFloatHeight ?? 0;
                  moduleHeight += (absorbedBase - floatH);
                }
                const moduleTopY = category === 'upper'
                  ? cabinetAreaTopY
                  : (sideBodyStartY + mmToThreeUnits(moduleHeight));
                const moduleBottomY = category === 'upper'
                  ? moduleTopY - mmToThreeUnits(moduleHeight)
                  : sideBodyStartY;
                maxFurnitureTop = moduleTopY;
                maxModuleHeightMm = moduleHeight;
                tallestModuleTopY = moduleTopY;
                tallestModuleBottomY = moduleBottomY;
              }
            }

            const hasFurnitureHeight = maxModuleHeightMm > 0;
            const furnitureHeightValue = hasFurnitureHeight ? maxModuleHeightMm : cabinetPlacementHeight;
            const furnitureTopY = hasFurnitureHeight ? tallestModuleTopY : cabinetAreaTopY;
            // 띄움배치 시에는 바닥재 + floatHeight를 기준으로 텍스트 위치 계산
            const furnitureStartY = hasFurnitureHeight
              ? tallestModuleBottomY
              : sideBodyStartY;
            const furnitureTextY = furnitureStartY + (furnitureTopY - furnitureStartY) / 2;
            const lowerSideFurnitureTopY = (() => {
              if (!isLowerSideMeasure || bottomFrameRefCategory !== 'lower' || !bottomFrameRefMod) return null;
              const lowerModuleData = getModuleById(bottomFrameRefMod.moduleId, calculateInternalSpace(spaceInfo), spaceInfo);
              const lowerModuleHeight = bottomFrameRefMod.freeHeight
                ?? bottomFrameRefMod.customHeight
                ?? lowerModuleData?.dimensions.height
                ?? (bottomFrameRefMod.customConfig?.totalHeight || 0);
              return lowerModuleHeight > 0
                ? sideBodyStartY + mmToThreeUnits(lowerModuleHeight)
                : null;
            })();
            const topFinishBottomY = lowerSideFurnitureTopY ?? furnitureTopY;
            const topFinishTopY = topFinishBottomY + mmToThreeUnits(topFinishThicknessMm);
            const furnitureMeasuredStartY = isLowerSideMeasure
              ? bottomY
              : topFinishThicknessMm > 0
                ? bottomY
                : furnitureStartY;
            const furnitureMeasuredTopY = topFinishThicknessMm > 0 ? topFinishTopY : (lowerSideFurnitureTopY ?? furnitureTopY);
            const furnitureMeasuredHeightValue = Math.round(threeUnitsToMm(furnitureMeasuredTopY - furnitureMeasuredStartY));
            const furnitureMeasuredTextY = furnitureMeasuredStartY + (furnitureMeasuredTopY - furnitureMeasuredStartY) / 2;
            const topFrameLineTopY = topFrameTopY;
            const extraFurnitureHeightUnits = maxFurnitureTop - topFrameLineTopY;
            const extraFurnitureHeightMm = extraFurnitureHeightUnits > 1e-6 ? Math.round(threeUnitsToMm(extraFurnitureHeightUnits)) : 0;
            const hasExtraFurnitureHeight = extraFurnitureHeightMm > 0;
            const extraFurnitureZ = leftDimensionZ + mmToThreeUnits(40);
            const extraFurnitureTextY = topFrameLineTopY + (maxFurnitureTop - topFrameLineTopY) / 2;

// console.log('📐 [우측뷰] 치수 렌더링:', {
              // isFloating,
              // floatHeight,
              // maxLowerCabinetHeightMm,
              // adjustedUpperCabinetHeightMm,
              // floorFinishHeightMm,
              // bottomFrameHeight
            // });

            return (
              <>
                {renderGlassDrawerSideSplitDimensions(
                  viewMod,
                  spaceWidth,
                  leftDimensionZ + mmToThreeUnits(95),
                  leftDimensionZ + mmToThreeUnits(155),
                  'right'
                )}
                {/* 1. 띄움 높이 또는 걸래받이 높이 */}
                {/* 띄움 배치인 경우: 띄움 높이 표시 (실제 가구 위치에 맞춤) */}
                {sideIsFloating && sideFloatHeight > 0 && (
                <group>
                  <Line
                    points={[[spaceWidth, mmToThreeUnits(floorFinishHeightMm), leftDimensionZ], [spaceWidth, sideBodyStartY, leftDimensionZ]]}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, mmToThreeUnits(floorFinishHeightMm), leftDimensionZ], [spaceWidth, mmToThreeUnits(floorFinishHeightMm) + 0.015, leftDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, sideBodyStartY, leftDimensionZ], [spaceWidth, sideBodyStartY + 0.015, leftDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Text
                    renderOrder={100001}
                    depthTest={false}
                    position={[spaceWidth, mmToThreeUnits(floorFinishHeightMm) + mmToThreeUnits(sideFloatHeight / 2), leftDimensionZ + mmToThreeUnits(60)]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                    rotation={[0, 0, 0]}
                  >
                    {sideFloatHeight}
                  </Text>
                </group>
                )}

                {/* 띄움 배치가 아니고 받침대가 있는 경우: 걸래받이 높이 표시 (바닥부터) */}
                {!sideIsFloating && bottomFrameHeight > 0 && (
                <group>
                  <Line
                    points={[[spaceWidth, bottomY, leftDimensionZ], [spaceWidth, bottomFrameTopY, leftDimensionZ]]}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, bottomY, leftDimensionZ], [spaceWidth, bottomY - 0.015, leftDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, bottomFrameTopY, leftDimensionZ], [spaceWidth, bottomFrameTopY + 0.015, leftDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  {bottomFrameGapHeight > 0 && (
                    <Line
                      points={[[spaceWidth, bottomFrameGapTopY, leftDimensionZ], [spaceWidth, bottomFrameGapTopY, leftDimensionZ + mmToThreeUnits(25)]]}
                      color={dimensionColor}
                      lineWidth={0.6}
                    />
                  )}
                  {bottomFrameSegments.map(seg => (
                    <Text
                      key={`right-side-base-${seg.key}`}
                      renderOrder={100001}
                      depthTest={false}
                      position={[spaceWidth, (seg.bottomY + seg.topY) / 2, leftDimensionZ + mmToThreeUnits(seg.key === 'gap' ? 100 : 60)]}
                      fontSize={baseFontSize}
                      color={textColor}
                      anchorX="center"
                      anchorY="middle"
                      outlineWidth={textOutlineWidth}
                      outlineColor={textOutlineColor}
                      rotation={[0, 0, 0]}
                    >
                      {Math.round(seg.heightMm)}
                    </Text>
                  ))}
                </group>
                )}

                {/* 2. 하부섹션 높이 (띄움 배치 시) 또는 캐비넷/가구 높이 (일반 배치 시) */}
                {/* 띄움 배치이고 하부장이 있는 경우: 하부섹션 높이 표시 */}
                {sideIsFloating && viewModCategoryForFrame !== 'full' && !isLowerSideMeasure && !hasSideSectionSplit && maxLowerCabinetHeightMm > 0 && (
                <group>
                  <Line
                    points={[[spaceWidth, lowerSideMeasureStartY, leftDimensionZ], [spaceWidth, mmToThreeUnits(sideBodyStartMm + maxLowerCabinetHeightMm + topFinishThicknessMm), leftDimensionZ]]}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, lowerSideMeasureStartY, leftDimensionZ], [spaceWidth, lowerSideMeasureStartY + 0.015, leftDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, mmToThreeUnits(sideBodyStartMm + maxLowerCabinetHeightMm + topFinishThicknessMm), leftDimensionZ], [spaceWidth, mmToThreeUnits(sideBodyStartMm + maxLowerCabinetHeightMm + topFinishThicknessMm) - 0.015, leftDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Text
                    renderOrder={100001}
                    depthTest={false}
                    position={[spaceWidth, lowerSideMeasureStartY + (mmToThreeUnits(sideBodyStartMm + maxLowerCabinetHeightMm + topFinishThicknessMm) - lowerSideMeasureStartY) / 2, leftDimensionZ + mmToThreeUnits(60)]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                    rotation={[0, 0, 0]}
                  >
                    {Math.round(threeUnitsToMm(mmToThreeUnits(sideBodyStartMm + maxLowerCabinetHeightMm + topFinishThicknessMm) - lowerSideMeasureStartY))}
                  </Text>
                </group>
                )}

                {/* 띄움 배치가 아닌 경우: 일반 가구 높이 표시 */}
                {(!sideIsFloating || isLowerSideMeasure || viewModCategoryForFrame === 'full') && !hasSideSectionSplit && (
                <group>
                  <Line
                    points={[[spaceWidth, furnitureMeasuredStartY, leftDimensionZ], [spaceWidth, furnitureMeasuredTopY, leftDimensionZ]]}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, furnitureMeasuredStartY, leftDimensionZ], [spaceWidth, furnitureMeasuredStartY + 0.015, leftDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, furnitureMeasuredTopY, leftDimensionZ], [spaceWidth, furnitureMeasuredTopY - 0.015, leftDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Text
                    renderOrder={100001}
                    depthTest={false}
                    position={[spaceWidth, furnitureMeasuredTextY, leftDimensionZ + mmToThreeUnits(60)]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                    rotation={[0, 0, 0]}
                  >
                    {furnitureMeasuredHeightValue}
                  </Text>
                </group>
                )}

                {/* 하부장 상판/상부 EP 두께 */}
                {topFinishThicknessMm > 0 && (
                <group>
                  <Line
                    points={[[spaceWidth, topFinishBottomY, leftDimensionZ], [spaceWidth, topFinishTopY, leftDimensionZ]]}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, topFinishBottomY, leftDimensionZ], [spaceWidth, topFinishBottomY + 0.015, leftDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, topFinishTopY, leftDimensionZ], [spaceWidth, topFinishTopY - 0.015, leftDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Text
                    renderOrder={100001}
                    depthTest={false}
                    position={[spaceWidth, (topFinishBottomY + topFinishTopY) / 2, leftDimensionZ + mmToThreeUnits(60)]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                    rotation={[0, 0, 0]}
                  >
                    {topFinishThicknessMm}
                  </Text>
                </group>
                )}

                {/* 3. 상부섹션 높이 (띄움 배치이고 상부장이 있는 경우) */}
                {sideIsFloating && viewModCategoryForFrame !== 'full' && !hasSideSectionSplit && adjustedUpperCabinetHeightMm > 0 && (
                <group>
                  <Line
                    points={[[spaceWidth, mmToThreeUnits(sideBodyStartMm + maxLowerCabinetHeightMm), leftDimensionZ], [spaceWidth, mmToThreeUnits(sideBodyStartMm + maxLowerCabinetHeightMm + adjustedUpperCabinetHeightMm), leftDimensionZ]]}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, mmToThreeUnits(sideBodyStartMm + maxLowerCabinetHeightMm), leftDimensionZ], [spaceWidth, mmToThreeUnits(sideBodyStartMm + maxLowerCabinetHeightMm) + 0.015, leftDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, mmToThreeUnits(sideBodyStartMm + maxLowerCabinetHeightMm + adjustedUpperCabinetHeightMm), leftDimensionZ], [spaceWidth, mmToThreeUnits(sideBodyStartMm + maxLowerCabinetHeightMm + adjustedUpperCabinetHeightMm) - 0.015, leftDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Text
                    renderOrder={100001}
                    depthTest={false}
                    position={[spaceWidth, mmToThreeUnits(sideBodyStartMm + maxLowerCabinetHeightMm) + mmToThreeUnits(adjustedUpperCabinetHeightMm / 2), leftDimensionZ + mmToThreeUnits(60)]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                    rotation={[0, 0, 0]}
                  >
                    {adjustedUpperCabinetHeightMm}
                  </Text>
                </group>
                )}

                {/* 3-1. 상부장 높이 (비띄움 배치이고 상부장이 있는 경우) */}
                {!sideIsFloating && viewModCategoryForFrame !== 'full' && !hasSideSectionSplit && maxUpperCabinetHeightMm > 0 && (
                <group>
                  <Line
                    points={[[spaceWidth, cabinetAreaTopY - mmToThreeUnits(maxUpperCabinetHeightMm), leftDimensionZ], [spaceWidth, cabinetAreaTopY, leftDimensionZ]]}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, cabinetAreaTopY - mmToThreeUnits(maxUpperCabinetHeightMm), leftDimensionZ], [spaceWidth, cabinetAreaTopY - mmToThreeUnits(maxUpperCabinetHeightMm) + 0.015, leftDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, cabinetAreaTopY, leftDimensionZ], [spaceWidth, cabinetAreaTopY - 0.015, leftDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Text
                    renderOrder={100001}
                    depthTest={false}
                    position={[spaceWidth, cabinetAreaTopY - mmToThreeUnits(maxUpperCabinetHeightMm / 2), leftDimensionZ + mmToThreeUnits(60)]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                    rotation={[0, 0, 0]}
                  >
                    {maxUpperCabinetHeightMm}
                  </Text>
                </group>
                )}

                {/* full 2섹션 가구: 측면뷰에서도 실제 상하부 섹션 경계 기준으로 높이 분리 */}
                {hasSideSectionSplit && (
                <group>
                  {sideSectionHeights.map((secH, idx) => {
                    const secBottomMm = sideSectionStartMm + sideSectionHeights.slice(0, idx).reduce((sum, h) => sum + h, 0);
                    const secTopMm = secBottomMm + secH;
                    const secBottomY = mmToThreeUnits(secBottomMm);
                    const secTopY = mmToThreeUnits(secTopMm);
                    const boundaryFrontZ = Math.max(lowerGuideFrontZ, upperGuideFrontZ);
                    return (
                      <React.Fragment key={`right-side-sec-${idx}`}>
                        <Line
                          points={[[spaceWidth, secBottomY, leftDimensionZ], [spaceWidth, secTopY, leftDimensionZ]]}
                          color={dimensionColor}
                          lineWidth={0.6}
                        />
                        <Line
                          points={createArrowHead([spaceWidth, secBottomY, leftDimensionZ], [spaceWidth, secBottomY + 0.015, leftDimensionZ])}
                          color={dimensionColor}
                          lineWidth={0.6}
                        />
                        <Line
                          points={createArrowHead([spaceWidth, secTopY, leftDimensionZ], [spaceWidth, secTopY - 0.015, leftDimensionZ])}
                          color={dimensionColor}
                          lineWidth={0.6}
                        />
                        <Text
                          renderOrder={100001}
                          depthTest={false}
                          position={[spaceWidth, (secBottomY + secTopY) / 2, leftDimensionZ + mmToThreeUnits(60)]}
                          fontSize={baseFontSize}
                          color={textColor}
                          anchorX="center"
                          anchorY="middle"
                          outlineWidth={textOutlineWidth}
                          outlineColor={textOutlineColor}
                          rotation={[0, 0, 0]}
                        >
                          {secH}
                        </Text>
                        {idx < sideSectionHeights.length - 1 && (
                          <Line
                            points={[[spaceWidth, secTopY, boundaryFrontZ], [spaceWidth, secTopY, leftDimensionZ + mmToThreeUnits(20)]]}
                            color={dimensionColor}
                            lineWidth={0.3}
                          />
                        )}
                      </React.Fragment>
                    );
                  })}
                </group>
                )}

                {/* 4. 상단 몰딩 높이 / 토글 OFF일 때는 상단갭 */}
                {!isTopFrameOff && topFrameDimensionHeight > 0 && (() => {
                  // EP 모드: ㄱ자 EP 전면 세로(=80) + 도어 상단~EP 안쪽 갭 두 개로 분리 표시
                  const epRefMod = topFrameRefMod ?? viewMod;
                  const epEnabled = epRefMod?.hasTopEndPanel === true;
                  const epFrontHeightMm = 80;
                  const totalMm = topFrameDimensionValue || topFrameDimensionHeight;
                  const topGapMm = Math.min(totalMm, Math.max(0, Math.round((epRefMod as any)?.topFrameGap ?? 0)));
                  const visibleTopMm = Math.max(0, totalMm);
                  const topGapBottomY = topFrameLineTopY - mmToThreeUnits(topGapMm);
                  const isEpSplit = epEnabled && totalMm > epFrontHeightMm + 1;

                  if (!isEpSplit) {
                    return (
                      <group>
                        <Line
                          points={[[spaceWidth, cabinetAreaTopY, leftDimensionZ], [spaceWidth, topFrameLineTopY, leftDimensionZ]]}
                          color={topSegmentColor}
                          lineWidth={0.6}
                        />
                        <Line
                          points={createArrowHead([spaceWidth, cabinetAreaTopY, leftDimensionZ], [spaceWidth, cabinetAreaTopY + 0.015, leftDimensionZ])}
                          color={topSegmentColor}
                          lineWidth={0.6}
                        />
                        <Line
                          points={createArrowHead([spaceWidth, topFrameLineTopY, leftDimensionZ], [spaceWidth, topFrameLineTopY - 0.015, leftDimensionZ])}
                          color={topSegmentColor}
                          lineWidth={0.6}
                        />
                        {topGapMm > 0 && (
                          <Line
                            points={[[spaceWidth, topGapBottomY, leftDimensionZ], [spaceWidth, topGapBottomY, leftDimensionZ + mmToThreeUnits(25)]]}
                            color={topSegmentColor}
                            lineWidth={0.6}
                          />
                        )}
                        {visibleTopMm > 0 && (
                          <Text
                            renderOrder={100001}
                            depthTest={false}
                            position={[spaceWidth, (cabinetAreaTopY + topGapBottomY) / 2, leftDimensionZ + mmToThreeUnits(60)]}
                            fontSize={baseFontSize}
                            color={textColor}
                            anchorX="center"
                            anchorY="middle"
                            outlineWidth={textOutlineWidth}
                            outlineColor={textOutlineColor}
                            rotation={[0, 0, 0]}
                          >
                            {visibleTopMm}
                          </Text>
                        )}
                        {topGapMm > 0 && (
                          <Text
                            renderOrder={100001}
                            depthTest={false}
                            position={[spaceWidth, (topGapBottomY + topFrameLineTopY) / 2, leftDimensionZ + mmToThreeUnits(100)]}
                            fontSize={baseFontSize}
                            color={textColor}
                            anchorX="center"
                            anchorY="middle"
                            outlineWidth={textOutlineWidth}
                            outlineColor={textOutlineColor}
                            rotation={[0, 0, 0]}
                          >
                            {topGapMm}
                          </Text>
                        )}
                      </group>
                    );
                  }

                  const epSplitY = cabinetAreaTopY + mmToThreeUnits(epFrontHeightMm);
                  const gapMm = Math.max(0, Math.round(totalMm - epFrontHeightMm));
                  return (
                    <group>
                      {/* (a) ㄱ자 전면 80 — 측판 상단 ~ EP 안쪽 바닥 */}
                      <Line
                        points={[[spaceWidth, cabinetAreaTopY, leftDimensionZ], [spaceWidth, epSplitY, leftDimensionZ]]}
                        color={topSegmentColor}
                        lineWidth={0.6}
                      />
                      <Line
                        points={createArrowHead([spaceWidth, cabinetAreaTopY, leftDimensionZ], [spaceWidth, cabinetAreaTopY + 0.015, leftDimensionZ])}
                        color={topSegmentColor}
                        lineWidth={0.6}
                      />
                      <Line
                        points={createArrowHead([spaceWidth, epSplitY, leftDimensionZ], [spaceWidth, epSplitY - 0.015, leftDimensionZ])}
                        color={topSegmentColor}
                        lineWidth={0.6}
                      />
                      <Text
                        renderOrder={100001}
                        depthTest={false}
                        position={[spaceWidth, (cabinetAreaTopY + epSplitY) / 2, leftDimensionZ + mmToThreeUnits(60)]}
                        fontSize={baseFontSize}
                        color={textColor}
                        anchorX="center"
                        anchorY="middle"
                        outlineWidth={textOutlineWidth}
                        outlineColor={textOutlineColor}
                        rotation={[0, 0, 0]}
                      >
                        {epFrontHeightMm}
                      </Text>

                      {/* (b) 도어 상단 ~ EP 안쪽 갭 */}
                      {gapMm > 0 && (
                        <>
                          <Line
                            points={[[spaceWidth, epSplitY, leftDimensionZ], [spaceWidth, topFrameLineTopY, leftDimensionZ]]}
                            color={topSegmentColor}
                            lineWidth={0.6}
                          />
                          <Line
                            points={createArrowHead([spaceWidth, epSplitY, leftDimensionZ], [spaceWidth, epSplitY + 0.015, leftDimensionZ])}
                            color={topSegmentColor}
                            lineWidth={0.6}
                          />
                          <Line
                            points={createArrowHead([spaceWidth, topFrameLineTopY, leftDimensionZ], [spaceWidth, topFrameLineTopY - 0.015, leftDimensionZ])}
                            color={topSegmentColor}
                            lineWidth={0.6}
                          />
                          <Text
                            renderOrder={100001}
                            depthTest={false}
                            position={[spaceWidth, (epSplitY + topFrameLineTopY) / 2, leftDimensionZ + mmToThreeUnits(60)]}
                            fontSize={baseFontSize}
                            color={textColor}
                            anchorX="center"
                            anchorY="middle"
                            outlineWidth={textOutlineWidth}
                            outlineColor={textOutlineColor}
                            rotation={[0, 0, 0]}
                          >
                            {gapMm}
                          </Text>
                          <Line
                            points={[[spaceWidth, epSplitY, upperGuideFrontZ], [spaceWidth, epSplitY, leftDimensionZ + mmToThreeUnits(20)]]}
                            color={topSegmentColor}
                            lineWidth={0.3}
                          />
                        </>
                      )}
                    </group>
                  );
                })()}

                {/* 5. 상단 몰딩 이상 돌출 구간 */}
                {hasExtraFurnitureHeight && (
                <group>
                  <Line
                    points={[[spaceWidth, topFrameLineTopY, extraFurnitureZ], [spaceWidth, maxFurnitureTop, extraFurnitureZ]]}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, topFrameLineTopY, extraFurnitureZ], [spaceWidth, topFrameLineTopY + 0.015, extraFurnitureZ])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, maxFurnitureTop, extraFurnitureZ], [spaceWidth, maxFurnitureTop - 0.015, extraFurnitureZ])}
                    color={dimensionColor}
                    lineWidth={0.6}
                  />
                  <Text
                  renderOrder={100001}
                  depthTest={false}
                    position={[spaceWidth, extraFurnitureTextY, extraFurnitureZ + mmToThreeUnits(30)]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                    rotation={[0, 0, 0]}
                  >
                    {extraFurnitureHeightMm}
                  </Text>
                </group>
                )}
                
                {/* 연장선들 */}
                <Line
                  points={[[spaceWidth, bottomY, lowerGuideFrontZ], [spaceWidth, bottomY, leftDimensionZ + mmToThreeUnits(20)]]}
                  color={dimensionColor}
                  lineWidth={0.3}
                />
                {/* 걸래받이 상단 연장선 - 받침대가 있는 경우에만 표시 */}
                {bottomFrameHeight > 0 && (
                <Line
                  points={[[spaceWidth, bottomFrameTopY, lowerGuideFrontZ], [spaceWidth, bottomFrameTopY, leftDimensionZ + mmToThreeUnits(20)]]}
                  color={dimensionColor}
                  lineWidth={0.3}
                />
                )}
                {!isTopFrameOff && topFrameDimensionHeight > 0 && (
                  <>
                    <Line
                      points={[[spaceWidth, cabinetAreaTopY, upperGuideFrontZ], [spaceWidth, cabinetAreaTopY, leftDimensionZ + mmToThreeUnits(20)]]}
                      color={topSegmentColor}
                      lineWidth={0.3}
                    />
                    <Line
                      points={[[spaceWidth, topFrameTopY, upperGuideFrontZ], [spaceWidth, topFrameTopY, leftDimensionZ + mmToThreeUnits(20)]]}
                      color={topSegmentColor}
                      lineWidth={0.3}
                    />
                  </>
                )}
                {hasExtraFurnitureHeight && (
                <Line
                  points={[[spaceWidth, maxFurnitureTop, spaceZOffset + spaceDepth], [spaceWidth, maxFurnitureTop, extraFurnitureZ + mmToThreeUnits(10)]]}
                  color={dimensionColor}
                  lineWidth={0.3}
                />
                )}
              </>
            );
          })()}
        </group>}

        {/* 가구별 치수선 (우측뷰에서는 깊이 치수) - 우측뷰에서는 가장 오른쪽 가구만 표시 */}
        {rightmostModules.map((module, index) => {
          // 우측뷰에서는 가장 오른쪽 가구만 대상으로 깊이 치수 표시
          const moduleData = getModuleById(
            module.moduleId,
            { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
            spaceInfo
          );
          
          if (!moduleData) return null;

          // 2섹션 가구인 경우 상부/하부 섹션 깊이 각각 사용
          const hasMultiSection = module.upperSectionDepth !== undefined || module.lowerSectionDepth !== undefined;

          // 상부 치수용
          const depthSection = hasMultiSection || moduleData.category === 'upper' || module.moduleId?.includes('upper-cabinet')
            ? 'upper'
            : 'auto';
          const dimY = topDimensionY - mmToThreeUnits(120);
          const upperSpan = resolveSideDimensionDepthSpanZ(module, moduleData, depthSection, furnitureZOffset, furnitureDepth);

          return (
            <group key={`right-module-dim-${index}`}>
              {/* 가구 깊이 치수선 */}
              <Line
                points={[[spaceWidth, dimY, upperSpan.backZ], [spaceWidth, dimY, upperSpan.frontZ]]}
                color={dimensionColor}
                lineWidth={0.3}
              />
              
              {/* 화살표들 */}
              <Line
                points={createArrowHead([spaceWidth, dimY, upperSpan.backZ], [spaceWidth, dimY, upperSpan.backZ + 0.02], 0.01)}
                color={dimensionColor}
                lineWidth={0.3}
              />
              <Line
                points={createArrowHead([spaceWidth, dimY, upperSpan.frontZ], [spaceWidth, dimY, upperSpan.frontZ - 0.02], 0.01)}
                color={dimensionColor}
                lineWidth={0.3}
              />

              {/* 치수 텍스트 */}
              <Text
                  renderOrder={100001}
                  depthTest={false}
                position={[spaceWidth, dimY - mmToThreeUnits(30), (upperSpan.backZ + upperSpan.frontZ) / 2]}
                fontSize={baseFontSize}
                color={dimensionColor}
                anchorX="center"
                anchorY="middle"
              >
                {upperSpan.depthMm}
              </Text>

              {/* 연장선 (가구에서 치수선까지 긴 보조선) */}
              <Line
                points={[[spaceWidth, spaceHeight, upperSpan.backZ], [spaceWidth, dimY + mmToThreeUnits(30), upperSpan.backZ]]}
                color={dimensionColor}
                lineWidth={0.3}
              />
              <Line
                points={[[spaceWidth, spaceHeight, upperSpan.frontZ], [spaceWidth, dimY + mmToThreeUnits(30), upperSpan.frontZ]]}
                color={dimensionColor}
                lineWidth={0.3}
              />

              {/* 하부섹션 깊이 치수 (2섹션 가구인 경우) */}
              {hasMultiSection && (() => {
                const lowerSpan = resolveSideDimensionDepthSpanZ(module, moduleData, 'lower', furnitureZOffset, furnitureDepth);
                const lowerDimY = mmToThreeUnits(200); // 하단 치수선 위치 (바닥에서 위로)

                return (
                  <group>
                    {/* 하부 깊이 치수선 */}
                    <Line
                      points={[[spaceWidth, lowerDimY, lowerSpan.backZ], [spaceWidth, lowerDimY, lowerSpan.frontZ]]}
                      color={dimensionColor}
                      lineWidth={0.3}
                    />

                    {/* 화살표들 */}
                    <Line
                      points={createArrowHead([spaceWidth, lowerDimY, lowerSpan.backZ], [spaceWidth, lowerDimY, lowerSpan.backZ + 0.02], 0.01)}
                      color={dimensionColor}
                      lineWidth={0.3}
                    />
                    <Line
                      points={createArrowHead([spaceWidth, lowerDimY, lowerSpan.frontZ], [spaceWidth, lowerDimY, lowerSpan.frontZ - 0.02], 0.01)}
                      color={dimensionColor}
                      lineWidth={0.3}
                    />

                    {/* 치수 텍스트 */}
                    <Text
                      renderOrder={100001}
                      depthTest={false}
                      position={[spaceWidth, lowerDimY + mmToThreeUnits(30), (lowerSpan.backZ + lowerSpan.frontZ) / 2]}
                      fontSize={baseFontSize}
                      color={dimensionColor}
                      anchorX="center"
                      anchorY="middle"
                    >
                      {lowerSpan.depthMm}
                    </Text>

                    {/* 연장선 (가구에서 치수선까지) */}
                    <Line
                      points={[[spaceWidth, 0, lowerSpan.backZ], [spaceWidth, lowerDimY - mmToThreeUnits(30), lowerSpan.backZ]]}
                      color={dimensionColor}
                      lineWidth={0.3}
                    />
                    <Line
                      points={[[spaceWidth, 0, lowerSpan.frontZ], [spaceWidth, lowerDimY - mmToThreeUnits(30), lowerSpan.frontZ]]}
                      color={dimensionColor}
                      lineWidth={0.3}
                    />
                  </group>
                );
              })()}
            </group>
          );
        })}
        
        {/* 발통 심볼 - 우측뷰 */}
        {placedModules.map((module, index) => {
          const moduleData = getModuleById(module.moduleId);
          if (!moduleData) return null;
          
          const moduleZ = module.position.z || 0;
          const moduleDepth = (moduleData.dimensions.depth || 600) * 0.01;
          
          // 가구 우측면 하단 중앙에 발통 심볼 배치
          return (
            <group key={`footstool-right-${module.id || index}`}>
              {renderFootstoolSymbol(
                rightDimensionX - mmToThreeUnits(100), 
                mmToThreeUnits(100), 
                spaceZOffset + moduleZ,
                [0, Math.PI / 2, 0] // Y축 +90도 회전 (우측뷰)
              )}
            </group>
          );
        })}
      </group>
    );
  };

  // 상단뷰 치수선 - 객체 좌표계와 맞춤 (상단 몰딩 가로길이, 좌우 프레임 폭, 캐비넷 폭만 표시)
  const renderTopView = () => {
    const spaceWidth = mmToThreeUnits(spaceInfo.width);
    const spaceDepth = mmToThreeUnits(spaceInfo.depth);
    const frameSize = spaceInfo.frameSize || { left: 50, right: 50, top: 50 };
    const topDimensionZ = -mmToThreeUnits(hasPlacedModules ? 200 : 150);
    // 상단뷰에서는 X축이 가로(폭), Z축이 세로(깊이)  
    // 공간은 중앙에서 -width/2 ~ +width/2, -depth/2 ~ +depth/2로 배치됨
    const spaceXOffset = -spaceWidth / 2;
    const spaceZOffset = -spaceDepth / 2;
    const baseFrameHeight = spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig.height || 65) : 0;
    const baseFrameThickness = mmToThreeUnits(18); // 걸래받이 두께
    const baseFrameY = 0; // 바닥 기준
    const baseFrameZ = spaceZOffset + spaceDepth/2 - mmToThreeUnits(20); // 3D와 동일하게 앞쪽에서 20mm 뒤로
    const baseFrameWidth = spaceWidth - (spaceInfo.surroundType === 'no-surround' ? 0 : (mmToThreeUnits(frameSize.left) + mmToThreeUnits(frameSize.right)));
    const baseFrameX = spaceXOffset + spaceWidth/2;
    
    // 탑뷰 치수선 레이아웃 — 입면(front view)과 동일한 DIM_GAP 기반 균등 간격
    // 입면: Y축 위로, 탑뷰: Z축 앞으로 (음의 방향)
    const topViewDimLevels = dimLevels; // 입면과 동일한 단수
    // 1단(최외곽): 전체 폭 — 가장 앞쪽
    const topMainDimZ = spaceZOffset - mmToThreeUnits(DIM_GAP * topViewDimLevels);
    // 2단: 구간 사이즈
    const topZoneDimZ = spaceZOffset - mmToThreeUnits(DIM_GAP * (topViewDimLevels - 1));
    // 3단: 내경
    const topSubDimZ = spaceZOffset - mmToThreeUnits(DIM_GAP * (topViewDimLevels - 2));
    // 4단(최내곽): 개별 가구 — 가장 공간에 가까움
    const topSlotDimZ = spaceZOffset - mmToThreeUnits(DIM_GAP);

    return (
      <group>
        {/* 탑뷰 치수선들 - 좌측면도가 아닐 때만 표시 */}
        {showDimensions && currentViewDirection !== 'left' && (
          <>
        {/* 상단 전체 폭 치수선 (상단 몰딩의 가로 길이) - 외부로 이동 / 커튼박스 분리 표시 */}
        <group>
          {(() => {
            const mainDimZ = topMainDimZ;
            const cbEnabledTop = !!spaceInfo.curtainBox?.enabled;
            const cbWidthTopMm = cbEnabledTop ? (spaceInfo.curtainBox?.width || 150) : 0;
            const cbPositionTop = spaceInfo.curtainBox?.position || 'right';
            const furnitureLeftX = spaceXOffset + (cbEnabledTop && cbPositionTop === 'left' ? mmToThreeUnits(cbWidthTopMm) : 0);
            const furnitureRightX = spaceXOffset + spaceWidth - (cbEnabledTop && cbPositionTop === 'right' ? mmToThreeUnits(cbWidthTopMm) : 0);
            const furnitureWidthMm = spaceInfo.width - cbWidthTopMm;

            const DimSegmentTop: React.FC<{ left: number; right: number; label: number; }> = ({ left, right, label }) => (
              <>
                <NativeLine name="dimension_line"
                  points={[[left, spaceHeight, mainDimZ], [right, spaceHeight, mainDimZ]]}
                  color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                />
                <NativeLine name="dimension_line"
                  points={createArrowHead([left, spaceHeight, mainDimZ], [left + 0.05, spaceHeight, mainDimZ])}
                  color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                />
                <NativeLine name="dimension_line"
                  points={createArrowHead([right, spaceHeight, mainDimZ], [right - 0.05, spaceHeight, mainDimZ])}
                  color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                />
                <Text
                  renderOrder={100000} depthTest={false}
                  position={[(left + right) / 2, spaceHeight + 0.1, mainDimZ - mmToThreeUnits(40)]}
                  fontSize={largeFontSize} color={textColor} anchorX="center" anchorY="middle"
                  outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                  rotation={[-Math.PI / 2, 0, 0]}
                >
                  {Math.round(label)}
                </Text>
              </>
            );

            return (
              <>
                {/* 좌측 커튼박스 구간 치수 */}
                {cbEnabledTop && cbPositionTop === 'left' && (
                  <DimSegmentTop left={spaceXOffset} right={furnitureLeftX} label={cbWidthTopMm} />
                )}

                {/* 가구 배치 공간 치수 */}
                <DimSegmentTop left={furnitureLeftX} right={furnitureRightX} label={furnitureWidthMm} />

                {/* 우측 커튼박스 구간 치수 */}
                {cbEnabledTop && cbPositionTop === 'right' && (
                  <DimSegmentTop left={furnitureRightX} right={spaceXOffset + spaceWidth} label={cbWidthTopMm} />
                )}

                {/* 연장선 - 좌우 프레임 앞쪽으로 더 연장 + 커튼박스/가구공간 경계선 */}
                {(() => {
                  const panelDepthMm = spaceInfo.depth || 600;
                  const furnitureDepthMm = Math.min(panelDepthMm, 600);
                  const panelDepth = mmToThreeUnits(panelDepthMm);
                  const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
                  const furnitureZOffset = spaceZOffset + (panelDepth - furnitureDepth) / 2;
                  const frameZ = furnitureZOffset + furnitureDepth/2;

                  return (
                    <>
                      <NativeLine name="dimension_line"
                        points={[
                          [spaceXOffset, spaceHeight, frameZ],
                          [spaceXOffset, spaceHeight, mainDimZ - mmToThreeUnits(20)]
                        ]}
                        color={dimensionColor} renderOrder={100000} depthTest={false}
                      />
                      <NativeLine name="dimension_line"
                        points={[
                          [spaceXOffset + spaceWidth, spaceHeight, frameZ],
                          [spaceXOffset + spaceWidth, spaceHeight, mainDimZ - mmToThreeUnits(20)]
                        ]}
                        color={dimensionColor} renderOrder={100000} depthTest={false}
                      />
                      {/* 커튼박스/가구공간 경계 연장선 */}
                      {cbEnabledTop && cbPositionTop === 'left' && (
                        <NativeLine name="dimension_line"
                          points={[
                            [furnitureLeftX, spaceHeight, frameZ],
                            [furnitureLeftX, spaceHeight, mainDimZ - mmToThreeUnits(20)]
                          ]}
                          color={dimensionColor} renderOrder={100000} depthTest={false}
                        />
                      )}
                      {cbEnabledTop && cbPositionTop === 'right' && (
                        <NativeLine name="dimension_line"
                          points={[
                            [furnitureRightX, spaceHeight, frameZ],
                            [furnitureRightX, spaceHeight, mainDimZ - mmToThreeUnits(20)]
                          ]}
                          color={dimensionColor} renderOrder={100000} depthTest={false}
                        />
                      )}
                    </>
                  );
                })()}
              </>
            );
          })()}
        </group>
        
        {/* 좌측 프레임 폭 치수선 - 외부로 이동 */}
        {showDimensions && <group>
          {(() => {
            const frameDimZ = spaceZOffset - mmToThreeUnits(hasPlacedModules ? 50 : 40);
            
            // 노서라운드일 때는 왼쪽 벽 유무에 따라 처리
            if (spaceInfo.surroundType === 'no-surround') {
              const hasLeftWall = spaceInfo.wallConfig?.left;
              
              let leftValue: number;
              let leftText: string;
              
              if (hasLeftWall) {
                // 왼쪽 벽이 있으면 이격거리 표시
                leftValue = spaceInfo.gapConfig?.left ?? 1.5;
                if (leftValue === 0) return null;
                { const _r = Math.round(leftValue * 10) / 10; leftText = _r % 1 === 0 ? String(_r) : _r.toFixed(1); }
              } else {
                // 왼쪽 벽이 없으면 EP는 사용자 선택이므로 치수 미표시
                return null;
              }
              
              return (
                <>
                  <NativeLine name="dimension_line"
                    points={[[spaceXOffset, spaceHeight, frameDimZ], [spaceXOffset + mmToThreeUnits(leftValue), spaceHeight, frameDimZ]]}
                    color={dimensionColor}
                    lineWidth={0.6}
                    renderOrder={100000}
                    depthTest={false}
                  />

                  {/* 좌측 프레임 화살표들 */}
                  <NativeLine name="dimension_line"
                    points={createArrowHead([spaceXOffset, spaceHeight, frameDimZ], [spaceXOffset + 0.02, spaceHeight, frameDimZ])}
                    color={dimensionColor}
                    lineWidth={0.6}
                    renderOrder={100000}
                    depthTest={false}
                  />
                  <NativeLine name="dimension_line"
                    points={createArrowHead([spaceXOffset + mmToThreeUnits(leftValue), spaceHeight, frameDimZ], [spaceXOffset + mmToThreeUnits(leftValue) - 0.02, spaceHeight, frameDimZ])}
                    color={dimensionColor}
                    lineWidth={0.6}
                    renderOrder={100000}
                    depthTest={false}
                  />

                  {/* 좌측 프레임 치수 텍스트 - 상단뷰용 회전 적용 */}
                  <Text
                  renderOrder={100000}
                  depthTest={false}
                    position={[spaceXOffset + mmToThreeUnits(leftValue)/2, spaceHeight + 0.1, frameDimZ - mmToThreeUnits(30)]}
                    fontSize={baseFontSize}
                    color={dimensionColor}
                    anchorX="center"
                    anchorY="middle"
                    rotation={[-Math.PI / 2, 0, 0]}
                  >
                    {leftText}
                  </Text>
                </>
              );
            } else {
              // 서라운드 모드일 때는 기존 로직 유지
              const frameThickness = calculateFrameThickness(spaceInfo, hasLeftFurniture, hasRightFurniture);

              // 왼쪽 프레임 두께가 0이면 (벽이 있으면) 표시하지 않음
              if (frameThickness.left === 0) {
                return null;
              }

              // 프레임 두께 값을 직접 사용
              const leftValue = frameThickness.left;

              return (
              <>
                <NativeLine name="dimension_line"
                  points={[[spaceXOffset, spaceHeight, frameDimZ], [spaceXOffset + mmToThreeUnits(leftValue), spaceHeight, frameDimZ]]}
                  color={dimensionColor}
                  lineWidth={0.6}
                  renderOrder={100000}
                  depthTest={false}
                />

                {/* 좌측 프레임 화살표들 */}
                <NativeLine name="dimension_line"
                  points={createArrowHead([spaceXOffset, spaceHeight, frameDimZ], [spaceXOffset + 0.02, spaceHeight, frameDimZ])}
                  color={dimensionColor}
                  lineWidth={0.6}
                  renderOrder={100000}
                  depthTest={false}
                />
                <NativeLine name="dimension_line"
                  points={createArrowHead([spaceXOffset + mmToThreeUnits(leftValue), spaceHeight, frameDimZ], [spaceXOffset + mmToThreeUnits(leftValue) - 0.02, spaceHeight, frameDimZ])}
                  color={dimensionColor}
                  lineWidth={0.6}
                  renderOrder={100000}
                  depthTest={false}
                />
                
                {/* 좌측 프레임 치수 텍스트 - 상단뷰용 회전 적용 */}
                <Text
                  position={[spaceXOffset + mmToThreeUnits(leftValue / 2), spaceHeight + 0.1, frameDimZ - mmToThreeUnits(30)]}
                  fontSize={baseFontSize}
                  color={textColor}
                  anchorX="center"
                  anchorY="middle"
                  outlineWidth={textOutlineWidth}
                  outlineColor={textOutlineColor}
                  rotation={[-Math.PI / 2, 0, 0]}
                  renderOrder={100000}
                  depthTest={false}
                >
                  {(() => { const _r = Math.round(leftValue * 10) / 10; return _r % 1 === 0 ? _r : _r.toFixed(1); })()}
                </Text>
              </>
              );
            }
          })()}
        </group>}

        {/* 우측 프레임 폭 치수선 - 외부로 이동 */}
        {showDimensions && <group>
          {(() => {
            const frameDimZ = spaceZOffset - mmToThreeUnits(hasPlacedModules ? 50 : 40);
            
            // 노서라운드일 때는 오른쪽 벽 유무에 따라 처리
            if (spaceInfo.surroundType === 'no-surround') {
              const hasRightWall = spaceInfo.wallConfig?.right;
              
              let rightValue: number;
              let rightText: string;
              
              if (hasRightWall) {
                // 오른쪽 벽이 있으면 이격거리 표시
                rightValue = spaceInfo.gapConfig?.right ?? 1.5;
                if (rightValue === 0) return null;
                { const _r = Math.round(rightValue * 10) / 10; rightText = _r % 1 === 0 ? String(_r) : _r.toFixed(1); }
              } else {
                // 오른쪽 벽이 없으면 EP는 사용자 선택이므로 치수 미표시
                return null;
              }
              
              return (
                <>
                  <NativeLine name="dimension_line"
                    points={[[spaceXOffset + spaceWidth - mmToThreeUnits(rightValue), spaceHeight, frameDimZ], [spaceXOffset + spaceWidth, spaceHeight, frameDimZ]]}
                    color={dimensionColor}
                    lineWidth={0.6}
                    renderOrder={100000}
                    depthTest={false}
                  />

                  {/* 우측 프레임 화살표들 */}
                  <NativeLine name="dimension_line"
                    points={createArrowHead([spaceXOffset + spaceWidth - mmToThreeUnits(rightValue), spaceHeight, frameDimZ], [spaceXOffset + spaceWidth - mmToThreeUnits(rightValue) + 0.02, spaceHeight, frameDimZ])}
                    color={dimensionColor}
                    lineWidth={0.6}
                    renderOrder={100000}
                    depthTest={false}
                  />
                  <NativeLine name="dimension_line"
                    points={createArrowHead([spaceXOffset + spaceWidth, spaceHeight, frameDimZ], [spaceXOffset + spaceWidth - 0.02, spaceHeight, frameDimZ])}
                    color={dimensionColor}
                    lineWidth={0.6}
                    renderOrder={100000}
                    depthTest={false}
                  />

                  {/* 우측 프레임 치수 텍스트 - 상단뷰용 회전 적용 */}
                  <Text
                  renderOrder={100000}
                  depthTest={false}
                    position={[spaceXOffset + spaceWidth - mmToThreeUnits(rightValue/2), spaceHeight + 0.1, frameDimZ - mmToThreeUnits(30)]}
                    fontSize={baseFontSize}
                    color={dimensionColor}
                    anchorX="center"
                    anchorY="middle"
                    rotation={[-Math.PI / 2, 0, 0]}
                  >
                    {rightText}
                  </Text>
                </>
              );
            } else {
              // 서라운드 모드일 때는 기존 로직 유지
              const frameThickness = calculateFrameThickness(spaceInfo, hasLeftFurniture, hasRightFurniture);

              // 오른쪽 프레임 두께가 0이면 (벽이 있으면) 표시하지 않음
              if (frameThickness.right === 0) {
                return null;
              }

              // 프레임 두께 값을 직접 사용
              const rightValue = frameThickness.right;

            return (
              <>
                <NativeLine name="dimension_line"
                  points={[[spaceXOffset + spaceWidth - mmToThreeUnits(rightValue), spaceHeight, frameDimZ], [spaceXOffset + spaceWidth, spaceHeight, frameDimZ]]}
                  color={dimensionColor}
                  lineWidth={0.6}
                  renderOrder={100000}
                  depthTest={false}
                />

                {/* 우측 프레임 화살표들 */}
                <NativeLine name="dimension_line"
                  points={createArrowHead([spaceXOffset + spaceWidth - mmToThreeUnits(rightValue), spaceHeight, frameDimZ], [spaceXOffset + spaceWidth - mmToThreeUnits(rightValue) + 0.02, spaceHeight, frameDimZ])}
                  color={dimensionColor}
                  lineWidth={0.6}
                  renderOrder={100000}
                  depthTest={false}
                />
                <NativeLine name="dimension_line"
                  points={createArrowHead([spaceXOffset + spaceWidth, spaceHeight, frameDimZ], [spaceXOffset + spaceWidth - 0.02, spaceHeight, frameDimZ])}
                  color={dimensionColor}
                  lineWidth={0.6}
                  renderOrder={100000}
                  depthTest={false}
                />
                
                {/* 우측 프레임 치수 텍스트 - 상단뷰용 회전 적용 */}
                <Text
                  position={[spaceXOffset + spaceWidth - mmToThreeUnits(rightValue / 2), spaceHeight + 0.1, frameDimZ - mmToThreeUnits(30)]}
                  fontSize={baseFontSize}
                  color={textColor}
                  anchorX="center"
                  anchorY="middle"
                  outlineWidth={textOutlineWidth}
                  outlineColor={textOutlineColor}
                  rotation={[-Math.PI / 2, 0, 0]}
                  renderOrder={100000}
                  depthTest={false}
                >
                  {(() => { const _r = Math.round(rightValue * 10) / 10; return _r % 1 === 0 ? _r : _r.toFixed(1); })()}
                </Text>
              </>
              );
            }
          })()}
        </group>}

        {/* 구간 치수선 - 탑뷰 (입면 2단: 원 사이즈 + 3단: 내경) */}
        {showDimensions && (spaceInfo.droppedCeiling?.enabled || (isFreePlacement && spaceInfo.stepCeiling?.enabled)) && (
          <group>
            {(() => {
              const normalBounds = getNormalZoneBounds(spaceInfo);
              const droppedBounds = getDroppedZoneBounds(spaceInfo);
              // 2단: 원 구간 사이즈 — DIM_GAP 기반 (입면과 동일 간격)
              const zoneDimZ = topZoneDimZ;
              // 3단: 내경 — DIM_GAP 기반
              const subDimensionZ = topSubDimZ;

              const frameThickness = calculateFrameThickness(spaceInfo, hasLeftFurniture, hasRightFurniture);

              // 입면과 동일한 구간 계산 로직
              const hasDC = !!spaceInfo.droppedCeiling?.enabled;
              const hasSC = isFreePlacement && !!spaceInfo.stepCeiling?.enabled;
              const dcWidth = hasDC ? (spaceInfo.droppedCeiling!.width || 0) : 0;
              const scWidth = hasSC ? (spaceInfo.stepCeiling!.width || 0) : 0;
              const dcPosition = spaceInfo.droppedCeiling?.position || 'right';
              const scPosition = spaceInfo.stepCeiling?.position || 'right';
              const hasCB = !isFreePlacement && !!spaceInfo.curtainBox?.enabled;
              const cbWidth = hasCB ? (spaceInfo.curtainBox!.width || 150) : 0;
              const cbPosition = hasCB ? (spaceInfo.curtainBox!.position || 'right') : 'right';

              const mainWidth = spaceInfo.width - dcWidth - scWidth - cbWidth;
              const droppedWidth = dcWidth;

              const dcOnLeft = hasDC && dcPosition === 'left';
              const scOnLeft = hasSC && scPosition === 'left';
              const cbOnLeft = hasCB && cbPosition === 'left';
              const dcOnRight = hasDC && dcPosition === 'right';
              const scOnRight = hasSC && scPosition === 'right';
              const cbOnRight = hasCB && cbPosition === 'right';

              const leftStackWidth = (cbOnLeft ? cbWidth : 0) + (dcOnLeft ? dcWidth : 0) + (scOnLeft ? scWidth : 0);
              const rightStackWidth = (cbOnRight ? cbWidth : 0) + (dcOnRight ? dcWidth : 0) + (scOnRight ? scWidth : 0);

              const mainStartX = spaceXOffset + mmToThreeUnits(leftStackWidth);
              const mainEndX = spaceXOffset + mmToThreeUnits(spaceInfo.width - rightStackWidth);

              // 단내림(stepCeiling) 구간 X 좌표
              let scStartX = mainStartX, scEndX = mainStartX;
              if (hasSC) {
                if (scOnLeft) {
                  const scLeftEdge = dcOnLeft ? dcWidth : 0;
                  scStartX = spaceXOffset + mmToThreeUnits(scLeftEdge);
                  scEndX = spaceXOffset + mmToThreeUnits(scLeftEdge + scWidth);
                } else {
                  scStartX = mainEndX;
                  scEndX = mainEndX + mmToThreeUnits(scWidth);
                }
              }

              // 단내림(droppedCeiling) 구간 X 좌표
              let droppedStartX = mainStartX, droppedEndX = mainStartX;
              if (hasDC) {
                if (dcOnLeft) {
                  const dcLeftEdge = cbOnLeft ? cbWidth : 0;
                  droppedStartX = spaceXOffset + mmToThreeUnits(dcLeftEdge);
                  droppedEndX = spaceXOffset + mmToThreeUnits(dcLeftEdge + dcWidth);
                } else {
                  const dcLeftEdge = spaceInfo.width - dcWidth - (cbOnRight ? cbWidth : 0);
                  droppedStartX = spaceXOffset + mmToThreeUnits(dcLeftEdge);
                  droppedEndX = spaceXOffset + mmToThreeUnits(dcLeftEdge + dcWidth);
                }
              }

              // 슬롯배치 커튼박스 구간 X 좌표
              let cbStartX = mainStartX, cbEndX = mainStartX;
              if (hasCB) {
                if (cbOnLeft) {
                  cbStartX = spaceXOffset;
                  cbEndX = spaceXOffset + mmToThreeUnits(cbWidth);
                } else {
                  cbStartX = spaceXOffset + mmToThreeUnits(spaceInfo.width - cbWidth);
                  cbEndX = spaceXOffset + spaceWidth;
                }
              }

              // 내경 계산용
              const zoneSlotInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);

              // 헬퍼: 탑뷰 치수선 한 구간 렌더링 (NativeLine — 입면과 동일)
              const renderZoneDim = (startX: number, endX: number, label: string, z: number) => (
                <>
                  <NativeLine name="dimension_line" points={[[startX, spaceHeight, z], [endX, spaceHeight, z]]} color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false} />
                  <NativeLine name="dimension_line" points={createArrowHead([startX, spaceHeight, z], [startX + 0.05, spaceHeight, z])} color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false} />
                  <NativeLine name="dimension_line" points={createArrowHead([endX, spaceHeight, z], [endX - 0.05, spaceHeight, z])} color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false} />
                  {(showDimensionsText || isStep2) && (
                    <Text renderOrder={100000} depthTest={false}
                      position={[(startX + endX) / 2, spaceHeight + 0.1, z - mmToThreeUnits(30)]}
                      fontSize={smallFontSize} color={textColor} anchorX="center" anchorY="middle"
                      outlineWidth={textOutlineWidth} outlineColor={textOutlineColor}
                      rotation={[-Math.PI / 2, 0, 0]}
                    >{label}</Text>
                  )}
                </>
              );

              return (
                <>
                  {/* ===== 2단: 원 구간 사이즈 (2000/900/150) ===== */}
                  {renderZoneDim(mainStartX, mainEndX, String(Math.round(mainWidth)), zoneDimZ)}
                  {hasSC && renderZoneDim(scStartX, scEndX, String(Math.round(scWidth)), zoneDimZ)}
                  {hasDC && renderZoneDim(droppedStartX, droppedEndX, String(Math.round(droppedWidth)), zoneDimZ)}
                  {hasCB && renderZoneDim(cbStartX, cbEndX, String(Math.round(cbWidth)), zoneDimZ)}

                  {/* ===== 3단: 이격 반영된 내경 ===== */}
                  {renderZoneDim(mainStartX, mainEndX,
                    String(isFreePlacement ? Math.round(mainWidth) : (() => {
                      // 내경 원값 (slotWidths 정수내림 합산이 아닌 이격 반영된 내경)
                      const val = zoneSlotInfo.normal.width;
                      const r = Math.round(val * 10) / 10;
                      return r % 1 === 0 ? String(r) : r.toFixed(1);
                    })()),
                    subDimensionZ
                  )}
                  {(hasDC || hasSC) && renderZoneDim(
                    hasDC ? droppedStartX : scStartX,
                    hasDC ? droppedEndX : scEndX,
                    String(isFreePlacement
                      ? Math.round(hasDC ? droppedWidth : scWidth)
                      : (() => {
                        const d = zoneSlotInfo.dropped;
                        if (!d) return Math.round(hasDC ? dcWidth : scWidth);
                        // 3단: 이격 반영된 내경 (slotWidths 합산이 아닌 내경 원값)
                        const val = d.width;
                        const r = Math.round(val * 10) / 10;
                        return r % 1 === 0 ? String(r) : r.toFixed(1);
                      })()),
                    subDimensionZ
                  )}
                  {hasCB && (() => {
                    const cbInner = cbWidth - 3;
                    const isCBLeft = spaceInfo.curtainBox?.position === 'left';
                    const cbInnerStartX = isCBLeft ? cbStartX + mmToThreeUnits(1.5) : cbStartX;
                    const cbInnerEndX = isCBLeft ? cbEndX : cbEndX - mmToThreeUnits(1.5);
                    return renderZoneDim(cbInnerStartX, cbInnerEndX, String(cbInner % 1 === 0 ? cbInner : cbInner.toFixed(1)), subDimensionZ);
                  })()}

                  {/* 구간 분리 가이드라인 */}
                  <NativeLine name="dimension_line"
                    points={[
                      [hasDC
                        ? (dcPosition === 'left' ? spaceXOffset + mmToThreeUnits(droppedBounds.width) : spaceXOffset + mmToThreeUnits(normalBounds.width))
                        : (scOnLeft ? scEndX : scStartX),
                      spaceHeight, spaceZOffset],
                      [hasDC
                        ? (dcPosition === 'left' ? spaceXOffset + mmToThreeUnits(droppedBounds.width) : spaceXOffset + mmToThreeUnits(normalBounds.width))
                        : (scOnLeft ? scEndX : scStartX),
                      spaceHeight, subDimensionZ + mmToThreeUnits(20)]
                    ]}
                    color={subGuideColor}
                    renderOrder={100000}
                    depthTest={false}
                    dashed
                  />

                  {/* CB 구간 분리 가이드라인 */}
                  {hasCB && (
                    <NativeLine name="dimension_line"
                      points={[
                        [cbOnLeft ? cbEndX : cbStartX, spaceHeight, spaceZOffset],
                        [cbOnLeft ? cbEndX : cbStartX, spaceHeight, subDimensionZ + mmToThreeUnits(20)]
                      ]}
                      color={subGuideColor}
                      renderOrder={100000}
                      depthTest={false}
                      dashed
                    />
                  )}

                  {/* 연장선 */}
                  <NativeLine name="dimension_line" points={[[mainStartX, spaceHeight, spaceZOffset], [mainStartX, spaceHeight, subDimensionZ - mmToThreeUnits(10)]]} color={subGuideColor} renderOrder={100000} depthTest={false} />
                  <NativeLine name="dimension_line" points={[[mainEndX, spaceHeight, spaceZOffset], [mainEndX, spaceHeight, subDimensionZ - mmToThreeUnits(10)]]} color={subGuideColor} renderOrder={100000} depthTest={false} />
                  {(hasDC || hasSC) && (<>
                    <NativeLine name="dimension_line" points={[[hasDC ? droppedStartX : scStartX, spaceHeight, spaceZOffset], [hasDC ? droppedStartX : scStartX, spaceHeight, subDimensionZ - mmToThreeUnits(10)]]} color={subGuideColor} renderOrder={100000} depthTest={false} />
                    <NativeLine name="dimension_line" points={[[hasDC ? droppedEndX : scEndX, spaceHeight, spaceZOffset], [hasDC ? droppedEndX : scEndX, spaceHeight, subDimensionZ - mmToThreeUnits(10)]]} color={subGuideColor} renderOrder={100000} depthTest={false} />
                  </>)}
                  {hasCB && (<>
                    <NativeLine name="dimension_line" points={[[cbStartX, spaceHeight, spaceZOffset], [cbStartX, spaceHeight, subDimensionZ - mmToThreeUnits(10)]]} color={subGuideColor} renderOrder={100000} depthTest={false} />
                    <NativeLine name="dimension_line" points={[[cbEndX, spaceHeight, spaceZOffset], [cbEndX, spaceHeight, subDimensionZ - mmToThreeUnits(10)]]} color={subGuideColor} renderOrder={100000} depthTest={false} />
                  </>)}

                  {/* 경계면 이격거리 치수선 - 탑뷰 */}
                  {hasDC && (() => {
                    const boundaryGapMm = zoneSlotInfo.boundaryGap || 0;
                    const boundaryGapZ = subDimensionZ - mmToThreeUnits(60);
                    let boundaryLeftX: number;
                    let boundaryRightX: number;

                    if (dcPosition === 'left') {
                      boundaryLeftX = droppedEndX;
                      boundaryRightX = mainStartX;
                    } else {
                      boundaryLeftX = mainEndX;
                      boundaryRightX = droppedStartX;
                    }

                    return (
                      <>
                        <NativeLine name="dimension_line"
                          points={[[boundaryLeftX, spaceHeight, boundaryGapZ], [boundaryRightX, spaceHeight, boundaryGapZ]]}
                          color={dimensionColor}
                          lineWidth={0.6}
                          renderOrder={100000}
                          depthTest={false}
                        />
                        <NativeLine name="dimension_line"
                          points={createArrowHead([boundaryLeftX, spaceHeight, boundaryGapZ], [boundaryLeftX + 0.02, spaceHeight, boundaryGapZ])}
                          color={dimensionColor}
                          lineWidth={0.6}
                          renderOrder={100000}
                          depthTest={false}
                        />
                        <NativeLine name="dimension_line"
                          points={createArrowHead([boundaryRightX, spaceHeight, boundaryGapZ], [boundaryRightX - 0.02, spaceHeight, boundaryGapZ])}
                          color={dimensionColor}
                          lineWidth={0.6}
                          renderOrder={100000}
                          depthTest={false}
                        />
                        {/* 경계면 이격거리 텍스트 - 클릭 편집 (상단 뷰) */}
                        {editingGapSide === 'middle' ? (
                          <Html
                            position={[(boundaryLeftX + boundaryRightX) / 2, spaceHeight + 0.1, boundaryGapZ - mmToThreeUnits(30)]}
                            center
                            style={{ pointerEvents: 'auto' }}
                            zIndexRange={[10000, 10001]}
                          >
                            <div style={{ background: currentViewDirection !== '3D' && view2DTheme === 'dark' ? 'rgba(31,41,55,0.98)' : 'rgba(255,255,255,0.98)', padding: '3px', borderRadius: '4px', border: '2px solid #2196F3', boxShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
                              <input
                                ref={gapInputRef}
                                type="number"
                                step="0.5"
                                min="0"
                                max="5"
                                value={editingGapValue}
                                onChange={(e) => setEditingGapValue(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleGapEditSubmit(); else if (e.key === 'Escape') handleGapEditCancel(); }}
                                onBlur={handleGapEditSubmit}
                                style={{ width: '50px', padding: '2px 4px', border: '1px solid #555', borderRadius: '2px', fontSize: '12px', fontWeight: 'bold', textAlign: 'center', outline: 'none', background: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#1f2937' : '#fff', color: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#fff' : '#000' }}
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                              />
                              <span style={{ marginLeft: '2px', fontSize: '11px', color: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#9ca3af' : '#666' }}>mm</span>
                            </div>
                          </Html>
                        ) : (
                          <Html
                            position={[(boundaryLeftX + boundaryRightX) / 2, spaceHeight + 0.1, boundaryGapZ - mmToThreeUnits(30)]}
                            center
                            style={{ pointerEvents: 'auto' }}
                            zIndexRange={[9999, 10000]}
                          >
                            <div
                              style={{
                                padding: '2px 6px',
                                fontSize: '12px',
                                fontWeight: 'bold',
                                color: dimensionColor,
                                cursor: 'pointer',
                                userSelect: 'none',
                                whiteSpace: 'nowrap',
                                background: currentViewDirection !== '3D' && view2DTheme === 'dark' ? 'rgba(31,41,55,0.7)' : 'rgba(255,255,255,0.7)',
                                borderRadius: '3px',
                              }}
                              onClick={(e) => { e.stopPropagation(); handleGapEdit('middle', boundaryGapMm); }}
                            >
                              {`${boundaryGapMm}`}
                            </div>
                          </Html>
                        )}
                      </>
                    );
                  })()}
                </>
              );
            })()}
          </group>
        )}
        
        {/* 뒷벽과 좌우 벽 실선 표시 */}
        <group>
          {/* 뒷벽 (정면 반대쪽, Z=0 근처) */}
          <Line
            points={[[spaceXOffset, spaceHeight, spaceZOffset], [spaceXOffset + spaceWidth, spaceHeight, spaceZOffset]]}
            color={subGuideColor}
            lineWidth={0.6}
          />
          
          {/* 좌측 벽 - 탑뷰에서 숨김 */}
          {/* <Line
            points={[[spaceXOffset, spaceHeight, spaceZOffset], [spaceXOffset, spaceHeight, spaceZOffset + spaceDepth]]}
            color={subGuideColor}
            lineWidth={0.6}
          /> */}
          
          {/* 우측 벽 - 탑뷰에서 숨김 */}
          {/* <Line
            points={[[spaceXOffset + spaceWidth, spaceHeight, spaceZOffset], [spaceXOffset + spaceWidth, spaceHeight, spaceZOffset + spaceDepth]]}
            color={subGuideColor}
            lineWidth={0.6}
          /> */}
        </group>

              {/* 좌측 치수선 - 좌측에 배치된 캐비넷 깊이별 2단 표시 */}
      {placedModules.length > 0 && (() => {
        // 좌측 가구들의 깊이별 정보 수집
        const depthGroups: Map<number, { backZ: number; frontZ: number; edgeX: number }> = new Map();

        placedModules.forEach((module) => {
          if (module.position.x >= 0) return;
          const moduleData = getModuleById(
            module.moduleId,
            { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
            spaceInfo
          );
          if (!moduleData || !moduleData.dimensions) return;

          // 키큰장찬넬(insert-frame): 깊이 치수 가이드 숨김
          if (module.moduleId?.includes('insert-frame')) return;
          // 유리장은 정면/측면 전용 치수로 처리하고, 탑뷰 외부 깊이 그룹에는 넣지 않는다.
          if (module.moduleId?.includes('glass-cabinet')) return;

          // 기둥 앞 배치(front) 모드는 슬롯 전체 너비 사용
          const isColFront = (module as any).columnPlacementMode === 'front';
          const slotFullW = module.slotIndex !== undefined ? (indexing.slotWidths?.[module.slotIndex] ?? indexing.columnWidth) : undefined;
          const moduleWidthMm = (module.isFreePlacement && module.freeWidth)
            ? module.freeWidth
            : isColFront
              ? (slotFullW || moduleData.dimensions.width)
              : (module.customWidth || module.adjustedWidth || moduleData.dimensions.width);
          const isStylerModule = moduleData.id.includes('dual-2drawer-styler');
          const moduleWidth = mmToThreeUnits(moduleWidthMm);
          const rightX = module.position.x + moduleWidth / 2;

          const panelDepthMm = spaceInfo.depth || 600;
          const furnitureDepthMm = Math.min(panelDepthMm, 600);
          const doorThicknessMm = 20;
          const panelDepth = mmToThreeUnits(panelDepthMm);
          const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
          const doorThickness = mmToThreeUnits(doorThicknessMm);
          const zOffset = -panelDepth / 2;
          const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;

          // 2섹션 가구: 상부/하부 각각 별도 depthGroup으로 추가
          const hasUpperSection = module.upperSectionDepth !== undefined;
          const hasLowerSection = module.lowerSectionDepth !== undefined;
          const is2Section = hasUpperSection || hasLowerSection;

          if (isStylerModule) {
            const actualDepthMm = module.customDepth || module.upperSectionDepth || moduleData.dimensions.depth;
            const frontExtensionZ = resolveInstalledFrontExtensionZ(module);
            const leftDepthMm = actualDepthMm;
            const rightDepthMm = 660;
            const leftDepth = mmToThreeUnits(leftDepthMm);
            const rightDepth = mmToThreeUnits(rightDepthMm);
            const baseFurnitureZOffset = furnitureZOffset;
            const leftFurnitureZ = baseFurnitureZOffset + furnitureDepth/2 - doorThickness - leftDepth/2;
            const depthOffset = (leftDepth - rightDepth) / 2;
            const rightFurnitureZ = baseFurnitureZOffset + furnitureDepth/2 - doorThickness - rightDepth/2 + depthOffset;
            const furnitureBackZ = Math.min(leftFurnitureZ - leftDepth/2, rightFurnitureZ - rightDepth/2);
            const furnitureFrontZ = Math.max(leftFurnitureZ + leftDepth/2, rightFurnitureZ + rightDepth/2) + frontExtensionZ;
            const depthKey = Math.round((furnitureFrontZ - furnitureBackZ) / 0.01);
            const existing = depthGroups.get(depthKey);
            if (existing) {
              existing.backZ = Math.min(existing.backZ, furnitureBackZ);
              existing.frontZ = Math.max(existing.frontZ, furnitureFrontZ);
              existing.edgeX = Math.max(existing.edgeX, rightX);
            } else {
              depthGroups.set(depthKey, { backZ: furnitureBackZ, frontZ: furnitureFrontZ, edgeX: rightX });
            }
          } else if (is2Section) {
            // FurnitureItem.tsx와 정확히 동일한 Z 공식:
            //   isFloating = baseConfig.type==='stand' && placementType==='float'
            //   baseDepthOffset = isFloating ? baseConfig.depth : 0
            //   상부장: backZ = furnitureZOffset - furnitureDepth/2 - doorThickness  (+ 0)
            //   신발장: backZ = furnitureZOffset - furnitureDepth/2 - doorThickness + baseDepthOffset (상/하부 모두 뒷면 정렬)
            //   하부장/의류장: backZ = furnitureZOffset + furnitureDepth/2 - doorThickness - depth + baseDepthOffset
            const isFloating = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
            const baseDepthOffset = isFloating ? mmToThreeUnits(spaceInfo.baseConfig?.depth || 0) : 0;
            // 가구별 뒷벽 이격(backWallGap) 반영 — 모든 z 위치에 더해줌
            const moduleBackWallGapMm2 = (module as any).backWallGap ?? 0;
            const moduleBackWallGapZ2 = moduleBackWallGapMm2 > 0 ? mmToThreeUnits(moduleBackWallGapMm2) : 0;
            const mid2 = module.moduleId || '';
            const isShoeCabinet2 = (mid2.includes('-entryway-') || mid2.includes('-shelf-') ||
                                   mid2.includes('-4drawer-shelf-') || mid2.includes('-2drawer-shelf-'));

            if (isShoeCabinet2) {
              // 신발장(선반장): FurnitureItem.tsx처럼 customDepth를 최우선으로 사용 (단일 깊이)
              const frontExtensionZ = resolveInstalledFrontExtensionZ(module);
              const depthMm = module.customDepth || module.upperSectionDepth || module.lowerSectionDepth || moduleData.dimensions.depth;
              const depth = mmToThreeUnits(depthMm);
              const backZ = furnitureZOffset - furnitureDepth/2 - doorThickness + baseDepthOffset + moduleBackWallGapZ2;
              const frontZ = backZ + depth + frontExtensionZ;
              const key = Math.round((frontZ - backZ) / 0.01);
              const existing = depthGroups.get(key);
              if (existing) {
                existing.backZ = Math.min(existing.backZ, backZ);
                existing.frontZ = Math.max(existing.frontZ, frontZ);
                existing.edgeX = Math.max(existing.edgeX, rightX);
              } else {
                depthGroups.set(key, { backZ, frontZ, edgeX: rightX });
              }
            } else {
              // 의류장(2섹션): 하부=앞면정렬, 상부=뒷면정렬
              const lowerDepthMm = module.lowerSectionDepth || module.customDepth || moduleData.dimensions.depth;
              const lowerSpan = resolveDepthSpanZ(
                lowerDepthMm,
                module.lowerSectionDepthDirection,
                furnitureZOffset,
                furnitureDepth,
                doorThickness,
                baseDepthOffset,
                moduleBackWallGapZ2
              );
              const lowerBackZ = lowerSpan.backZ;
              const lowerFrontZ = lowerSpan.frontZ + resolveInstalledFrontExtensionZ(module);
              const lowerKey = Math.round((lowerFrontZ - lowerBackZ) / 0.01);
              const existingLower = depthGroups.get(lowerKey);
              if (existingLower) {
                existingLower.backZ = Math.min(existingLower.backZ, lowerBackZ);
                existingLower.frontZ = Math.max(existingLower.frontZ, lowerFrontZ);
                existingLower.edgeX = Math.max(existingLower.edgeX, rightX);
              } else {
                depthGroups.set(lowerKey, { backZ: lowerBackZ, frontZ: lowerFrontZ, edgeX: rightX });
              }

              const upperDepthMm = module.upperSectionDepth || module.customDepth || moduleData.dimensions.depth;
              const upperDepth = mmToThreeUnits(upperDepthMm);
              const upperBackZ = furnitureZOffset - furnitureDepth/2 - doorThickness + moduleBackWallGapZ2;
              const upperFrontZ = upperBackZ + upperDepth + resolveInstalledFrontExtensionZ(module);
              const upperKey = Math.round((upperFrontZ - upperBackZ) / 0.01);
              if (upperKey !== lowerKey) {
                const existingUpper = depthGroups.get(upperKey);
                if (existingUpper) {
                  existingUpper.backZ = Math.min(existingUpper.backZ, upperBackZ);
                  existingUpper.frontZ = Math.max(existingUpper.frontZ, upperFrontZ);
                  existingUpper.edgeX = Math.max(existingUpper.edgeX, rightX);
                } else {
                  depthGroups.set(upperKey, { backZ: upperBackZ, frontZ: upperFrontZ, edgeX: rightX });
                }
              }
            }
          } else {
            const mid = module.moduleId || '';
            const isShoeCabinet = (mid.includes('-entryway-') || mid.includes('-shelf-') ||
                                  mid.includes('-4drawer-shelf-') || mid.includes('-2drawer-shelf-'));
            // 모든 가구 공통: 사용자가 편집 팝업에서 설정한 실제 깊이 우선
            // 우선순위: customDepth > upperSectionDepth || lowerSectionDepth > dimensions.depth
            // (의류장/신발장 모두 섹션 깊이가 저장될 수 있음)
            const actualDepthMm = module.customDepth
              || module.upperSectionDepth
              || module.lowerSectionDepth
              || moduleData.dimensions.depth;
            const depth = mmToThreeUnits(actualDepthMm);
            const isFloating = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
            const baseDepthOffset = isFloating ? mmToThreeUnits(spaceInfo.baseConfig?.depth || 0) : 0;
            // 가구별 뒷벽 이격(backWallGap) 반영
            const moduleBackWallGapMmX = (module as any).backWallGap ?? 0;
            const moduleBackWallGapZX = moduleBackWallGapMmX > 0 ? mmToThreeUnits(moduleBackWallGapMmX) : 0;
            const isUpperCat = moduleData.category === 'upper' || module.moduleId?.includes('upper-cabinet');
            const frontExtensionZ = resolveInstalledFrontExtensionZ(module);
            let furnitureBackZ: number;
            let furnitureFrontZ: number;
            if (isUpperCat) {
              // 상부장: 공간 뒷면 정렬
              furnitureBackZ = furnitureZOffset - furnitureDepth/2 - doorThickness + moduleBackWallGapZX;
              furnitureFrontZ = furnitureBackZ + depth + frontExtensionZ;
            } else if (isShoeCabinet) {
              // 신발장: FurnitureItem.tsx와 동일하게 뒷벽 기준에 붙인다.
              furnitureBackZ = furnitureZOffset - furnitureDepth/2 - doorThickness + baseDepthOffset + moduleBackWallGapZX;
              furnitureFrontZ = furnitureBackZ + depth + frontExtensionZ;
            } else if (moduleData.category === 'lower' || module.moduleId?.includes('lower-cabinet')) {
              const span = resolveDepthSpanZ(
                actualDepthMm,
                module.lowerSectionDepthDirection,
                furnitureZOffset,
                furnitureDepth,
                doorThickness,
                baseDepthOffset,
                moduleBackWallGapZX
              );
              furnitureBackZ = span.backZ;
              furnitureFrontZ = span.frontZ + frontExtensionZ;
            } else {
              // 하부장 외 키큰장/의류장 단일 깊이는 기존 앞면 정렬 유지
              furnitureBackZ = furnitureZOffset + furnitureDepth/2 - doorThickness - depth + baseDepthOffset + moduleBackWallGapZX;
              furnitureFrontZ = furnitureBackZ + depth + frontExtensionZ;
            }
            const depthKey = Math.round((furnitureFrontZ - furnitureBackZ) / 0.01);
            const existing = depthGroups.get(depthKey);
            if (existing) {
              existing.backZ = Math.min(existing.backZ, furnitureBackZ);
              existing.frontZ = Math.max(existing.frontZ, furnitureFrontZ);
              existing.edgeX = Math.max(existing.edgeX, rightX);
            } else {
              depthGroups.set(depthKey, { backZ: furnitureBackZ, frontZ: furnitureFrontZ, edgeX: rightX });
            }
          }
        });

        if (depthGroups.size === 0) return null;

        // 깊이 오름차순 정렬: 안쪽(가까운)=짧은깊이, 바깥쪽(먼)=긴깊이
        const sortedDepths = Array.from(depthGroups.entries()).sort((a, b) => a[0] - b[0]);
        const innerDimX = spaceXOffset - mmToThreeUnits(200);  // 1단(안쪽): 짧은 깊이
        const outerDimX = spaceXOffset - mmToThreeUnits(350);  // 2단(바깥): 긴 깊이
        const extPad = mmToThreeUnits(20); // 연장선 치수선 바깥 여유

        return (
          <group key="left-cabinet-depth-dims">
            {sortedDepths.map((entry, tierIdx) => {
              const [depthMm, group] = entry;
              const dimX = sortedDepths.length === 1 ? innerDimX : (tierIdx === 0 ? innerDimX : outerDimX);
              const textOffsetX = dimX - mmToThreeUnits(40);
              const cabinetDepthMm = Math.round((group.frontZ - group.backZ) / 0.01);
              // 연장선: 가구 앞/뒷면에서 해당 치수선 X 위치 바깥까지만
              const extEndX = dimX - extPad;

              return (
                <group key={`left-depth-tier-${tierIdx}`}>
                  {/* 치수선 */}
                  <NativeLine name="dimension_line"
                    points={[[dimX, spaceHeight, group.backZ], [dimX, spaceHeight, group.frontZ]]}
                    color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                  />
                  {/* 화살표 */}
                  <NativeLine name="dimension_line"
                    points={createArrowHead([dimX, spaceHeight, group.backZ], [dimX, spaceHeight, group.backZ + 0.02], 0.01)}
                    color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                  />
                  <NativeLine name="dimension_line"
                    points={createArrowHead([dimX, spaceHeight, group.frontZ], [dimX, spaceHeight, group.frontZ - 0.02], 0.01)}
                    color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                  />
                  {/* 깊이 텍스트 */}
                  <Text renderOrder={100000} depthTest={false}
                    position={[textOffsetX, spaceHeight + 0.1, (group.backZ + group.frontZ) / 2]}
                    fontSize={baseFontSize} color={dimensionColor}
                    anchorX="center" anchorY="middle" rotation={[-Math.PI / 2, 0, 0]}
                  >
                    {cabinetDepthMm}
                  </Text>
                  {/* 연장선 - 뒷면: 가구에서 치수선 바깥까지만 */}
                  <NativeLine name="dimension_line"
                    points={[[spaceXOffset, spaceHeight, group.backZ], [extEndX, spaceHeight, group.backZ]]}
                    color={dimensionColor} renderOrder={100000} depthTest={false}
                  />
                  {/* 연장선 - 앞면: 가구에서 치수선 바깥까지만 */}
                  <NativeLine name="dimension_line"
                    points={[[spaceXOffset, spaceHeight, group.frontZ], [extEndX, spaceHeight, group.frontZ]]}
                    color={dimensionColor} renderOrder={100000} depthTest={false}
                  />
                </group>
              );
            })}
          </group>
        );
      })()}

        {/* 우측 치수선 - 우측에 배치된 캐비넷 깊이별 2단 표시 */}
        {placedModules.length > 0 && (() => {
          const depthGroups: Map<number, { backZ: number; frontZ: number; edgeX: number }> = new Map();

          placedModules.forEach((module) => {
            if (module.position.x < 0) return;
            const moduleData = getModuleById(
              module.moduleId,
              { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
              spaceInfo
            );
            if (!moduleData || !moduleData.dimensions) return;

            // 키큰장찬넬(insert-frame): 깊이 치수 가이드 숨김
            if (module.moduleId?.includes('insert-frame')) return;
            // 유리장은 정면/측면 전용 치수로 처리하고, 탑뷰 외부 깊이 그룹에는 넣지 않는다.
            if (module.moduleId?.includes('glass-cabinet')) return;

            const isColFront = (module as any).columnPlacementMode === 'front';
            const slotFullW = module.slotIndex !== undefined ? (indexing.slotWidths?.[module.slotIndex] ?? indexing.columnWidth) : undefined;
            const moduleWidthMm = (module.isFreePlacement && module.freeWidth)
              ? module.freeWidth
              : isColFront
                ? (slotFullW || moduleData.dimensions.width)
                : (module.customWidth || module.adjustedWidth || moduleData.dimensions.width);
            const isStylerModule = moduleData.id.includes('dual-2drawer-styler');
            const moduleWidth = mmToThreeUnits(moduleWidthMm);
            const leftX = module.position.x - moduleWidth / 2;

            const panelDepthMm = spaceInfo.depth || 600;
            const furnitureDepthMm = Math.min(panelDepthMm, 600);
            const doorThicknessMm = 20;
            const panelDepth = mmToThreeUnits(panelDepthMm);
            const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
            const doorThickness = mmToThreeUnits(doorThicknessMm);
            const zOffset = -panelDepth / 2;
            const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;

            // 2섹션 가구: 상부/하부 각각 별도 depthGroup으로 추가
            const hasUpperSection = module.upperSectionDepth !== undefined;
            const hasLowerSection = module.lowerSectionDepth !== undefined;
            const is2Section = hasUpperSection || hasLowerSection;

            if (isStylerModule) {
              const actualDepthMm = module.customDepth || module.upperSectionDepth || moduleData.dimensions.depth;
              const frontExtensionZ = resolveInstalledFrontExtensionZ(module);
              const rightDepthMm = 660;
              const rightDepth = mmToThreeUnits(rightDepthMm);
              const baseFurnitureZOffset = furnitureZOffset;
              const stylerZOffset = baseFurnitureZOffset + (furnitureDepth - rightDepth) / 2;
              const stylerZ = stylerZOffset + rightDepth/2 - doorThickness - rightDepth/2;
              const furnitureBackZ = stylerZ - rightDepth/2;
              const furnitureFrontZ = stylerZ + rightDepth/2 + frontExtensionZ;
              const depthKey = Math.round((furnitureFrontZ - furnitureBackZ) / 0.01);
              const existing = depthGroups.get(depthKey);
              if (existing) {
                existing.backZ = Math.min(existing.backZ, furnitureBackZ);
                existing.frontZ = Math.max(existing.frontZ, furnitureFrontZ);
                existing.edgeX = Math.min(existing.edgeX, leftX);
              } else {
                depthGroups.set(depthKey, { backZ: furnitureBackZ, frontZ: furnitureFrontZ, edgeX: leftX });
              }
            } else if (is2Section) {
              // FurnitureItem.tsx와 동일 공식 — 신발장은 customDepth 우선 단일 깊이
              const isFloating = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
              const baseDepthOffset = isFloating ? mmToThreeUnits(spaceInfo.baseConfig?.depth || 0) : 0;
              // 가구별 뒷벽 이격(backWallGap) 반영
              const moduleBackWallGapMmR = (module as any).backWallGap ?? 0;
              const moduleBackWallGapZR = moduleBackWallGapMmR > 0 ? mmToThreeUnits(moduleBackWallGapMmR) : 0;
              const mid2 = module.moduleId || '';
              const isShoeCabinet2 = mid2.includes('-entryway-') || mid2.includes('-shelf-') ||
                                     mid2.includes('-4drawer-shelf-') || mid2.includes('-2drawer-shelf-');

              if (isShoeCabinet2) {
                // 신발장: customDepth 최우선(FurnitureItem.tsx와 동일)
                const frontExtensionZ = resolveInstalledFrontExtensionZ(module);
                const depthMm = module.customDepth || module.upperSectionDepth || module.lowerSectionDepth || moduleData.dimensions.depth;
                const depth = mmToThreeUnits(depthMm);
                const backZ = furnitureZOffset - furnitureDepth/2 - doorThickness + baseDepthOffset + moduleBackWallGapZR;
                const frontZ = backZ + depth + frontExtensionZ;
                const key = Math.round((frontZ - backZ) / 0.01);
                const existing = depthGroups.get(key);
                if (existing) {
                  existing.backZ = Math.min(existing.backZ, backZ);
                  existing.frontZ = Math.max(existing.frontZ, frontZ);
                  existing.edgeX = Math.min(existing.edgeX, leftX);
                } else {
                  depthGroups.set(key, { backZ, frontZ, edgeX: leftX });
                }
              } else {
                // 의류장(2섹션): 하부=앞면정렬, 상부=뒷면정렬
                const lowerDepthMm = module.lowerSectionDepth || module.customDepth || moduleData.dimensions.depth;
                const lowerSpan = resolveDepthSpanZ(
                  lowerDepthMm,
                  module.lowerSectionDepthDirection,
                  furnitureZOffset,
                  furnitureDepth,
                  doorThickness,
                  baseDepthOffset,
                  moduleBackWallGapZR
                );
                const lowerBackZ = lowerSpan.backZ;
                const lowerFrontZ = lowerSpan.frontZ + resolveInstalledFrontExtensionZ(module);
                const lowerKey = Math.round((lowerFrontZ - lowerBackZ) / 0.01);
                const existingLower = depthGroups.get(lowerKey);
                if (existingLower) {
                  existingLower.backZ = Math.min(existingLower.backZ, lowerBackZ);
                  existingLower.frontZ = Math.max(existingLower.frontZ, lowerFrontZ);
                  existingLower.edgeX = Math.min(existingLower.edgeX, leftX);
                } else {
                  depthGroups.set(lowerKey, { backZ: lowerBackZ, frontZ: lowerFrontZ, edgeX: leftX });
                }

                const upperDepthMm = module.upperSectionDepth || module.customDepth || moduleData.dimensions.depth;
                const upperDepth = mmToThreeUnits(upperDepthMm);
                const upperBackZ = furnitureZOffset - furnitureDepth/2 - doorThickness + moduleBackWallGapZR;
                const upperFrontZ = upperBackZ + upperDepth + resolveInstalledFrontExtensionZ(module);
                const upperKey = Math.round((upperFrontZ - upperBackZ) / 0.01);
                if (upperKey !== lowerKey) {
                  const existingUpper = depthGroups.get(upperKey);
                  if (existingUpper) {
                    existingUpper.backZ = Math.min(existingUpper.backZ, upperBackZ);
                    existingUpper.frontZ = Math.max(existingUpper.frontZ, upperFrontZ);
                    existingUpper.edgeX = Math.min(existingUpper.edgeX, leftX);
                  } else {
                    depthGroups.set(upperKey, { backZ: upperBackZ, frontZ: upperFrontZ, edgeX: leftX });
                  }
                }
              }
            } else {
              const actualDepthMm = module.customDepth
                || module.upperSectionDepth
                || module.lowerSectionDepth
                || moduleData.dimensions.depth;
              const depth = mmToThreeUnits(actualDepthMm);
              const isFloating = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
              const baseDepthOffset = isFloating ? mmToThreeUnits(spaceInfo.baseConfig?.depth || 0) : 0;
              // 가구별 뒷벽 이격(backWallGap) 반영
              const moduleBackWallGapMmRX = (module as any).backWallGap ?? 0;
              const moduleBackWallGapZRX = moduleBackWallGapMmRX > 0 ? mmToThreeUnits(moduleBackWallGapMmRX) : 0;
              const isUpperCat = moduleData.category === 'upper' || module.moduleId?.includes('upper-cabinet');
              const frontExtensionZ = resolveInstalledFrontExtensionZ(module);
              const mid = module.moduleId || '';
              const isShoeCabinet = (mid.includes('-entryway-') || mid.includes('-shelf-') ||
                                    mid.includes('-4drawer-shelf-') || mid.includes('-2drawer-shelf-'));
              let furnitureBackZ: number;
              let furnitureFrontZ: number;
              if (isUpperCat) {
                furnitureBackZ = furnitureZOffset - furnitureDepth/2 - doorThickness + moduleBackWallGapZRX;
                furnitureFrontZ = furnitureBackZ + depth + frontExtensionZ;
              } else if (isShoeCabinet) {
                // 신발장: FurnitureItem.tsx와 동일하게 뒷벽 기준에 붙인다.
                furnitureBackZ = furnitureZOffset - furnitureDepth/2 - doorThickness + baseDepthOffset + moduleBackWallGapZRX;
                furnitureFrontZ = furnitureBackZ + depth + frontExtensionZ;
              } else if (moduleData.category === 'lower' || module.moduleId?.includes('lower-cabinet')) {
                const span = resolveDepthSpanZ(
                  actualDepthMm,
                  module.lowerSectionDepthDirection,
                  furnitureZOffset,
                  furnitureDepth,
                  doorThickness,
                  baseDepthOffset,
                  moduleBackWallGapZRX
                );
                furnitureBackZ = span.backZ;
                furnitureFrontZ = span.frontZ + frontExtensionZ;
              } else {
                furnitureBackZ = furnitureZOffset + furnitureDepth/2 - doorThickness - depth + baseDepthOffset + moduleBackWallGapZRX;
                furnitureFrontZ = furnitureBackZ + depth + frontExtensionZ;
              }
              const depthKey = Math.round((furnitureFrontZ - furnitureBackZ) / 0.01);
              const existing = depthGroups.get(depthKey);
              if (existing) {
                existing.backZ = Math.min(existing.backZ, furnitureBackZ);
                existing.frontZ = Math.max(existing.frontZ, furnitureFrontZ);
                existing.edgeX = Math.min(existing.edgeX, leftX);
              } else {
                depthGroups.set(depthKey, { backZ: furnitureBackZ, frontZ: furnitureFrontZ, edgeX: leftX });
              }
            }
          });

          if (depthGroups.size === 0) return null;

          // 깊이 오름차순 정렬: 안쪽(가까운)=짧은깊이, 바깥쪽(먼)=긴깊이
          const sortedDepths = Array.from(depthGroups.entries()).sort((a, b) => a[0] - b[0]);
          const innerDimX = spaceXOffset + spaceWidth + mmToThreeUnits(200);
          const outerDimX = spaceXOffset + spaceWidth + mmToThreeUnits(350);
          const extPad = mmToThreeUnits(20);
          const rightWallX = spaceXOffset + spaceWidth; // 우측 공간 벽 위치

          return (
            <group key="right-cabinet-depth-dims">
              {sortedDepths.map((entry, tierIdx) => {
                const [depthMm, group] = entry;
                const dimX = sortedDepths.length === 1 ? innerDimX : (tierIdx === 0 ? innerDimX : outerDimX);
                const textOffsetX = dimX + mmToThreeUnits(40);
                const cabinetDepthMm = Math.round((group.frontZ - group.backZ) / 0.01);
                const extEndX = dimX + extPad;

                return (
                  <group key={`right-depth-tier-${tierIdx}`}>
                    {/* 치수선 */}
                    <NativeLine name="dimension_line"
                      points={[[dimX, spaceHeight, group.backZ], [dimX, spaceHeight, group.frontZ]]}
                      color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                    />
                    {/* 화살표 */}
                    <NativeLine name="dimension_line"
                      points={createArrowHead([dimX, spaceHeight, group.backZ], [dimX, spaceHeight, group.backZ + 0.02], 0.01)}
                      color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                    />
                    <NativeLine name="dimension_line"
                      points={createArrowHead([dimX, spaceHeight, group.frontZ], [dimX, spaceHeight, group.frontZ - 0.02], 0.01)}
                      color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
                    />
                    {/* 깊이 텍스트 */}
                    <Text renderOrder={100000} depthTest={false}
                      position={[textOffsetX, spaceHeight + 0.1, (group.backZ + group.frontZ) / 2]}
                      fontSize={baseFontSize} color={dimensionColor}
                      anchorX="center" anchorY="middle" rotation={[-Math.PI / 2, 0, 0]}
                    >
                      {cabinetDepthMm}
                    </Text>
                    {/* 연장선 - 뒷면: 공간 벽에서 치수선 바깥까지만 */}
                    <NativeLine name="dimension_line"
                      points={[[rightWallX, spaceHeight, group.backZ], [extEndX, spaceHeight, group.backZ]]}
                      color={dimensionColor} renderOrder={100000} depthTest={false}
                    />
                    {/* 연장선 - 앞면: 공간 벽에서 치수선 바깥까지만 */}
                    <NativeLine name="dimension_line"
                      points={[[rightWallX, spaceHeight, group.frontZ], [extEndX, spaceHeight, group.frontZ]]}
                      color={dimensionColor} renderOrder={100000} depthTest={false}
                    />
                  </group>
                );
              })}
            </group>
          );
      })()}

        {/* 기존 복잡한 좌측 치수선 주석 처리 */}
        {false && placedModules.length > 0 && (
          <group>
            {(() => {
              const leftDimensionX = spaceXOffset - mmToThreeUnits(200);
              
              // 디버깅을 위한 로그
// console.log('🔍 [상단뷰 치수] 배치된 가구들:', placedModules.map(m => ({
                // id: m.id,
                // moduleId: m.moduleId,
                // customDepth: m.customDepth,
                // position: m.position
              // })));
              
              // 모든 배치된 가구의 실제 앞면과 뒷면 위치를 계산하여 최대 범위 찾기
              let minBackZ = Infinity;
              let maxFrontZ = -Infinity;
              
              placedModules.forEach(module => {
                const moduleData = getModuleById(
                  module.moduleId,
                  { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
                  spaceInfo
                );
                
                if (!moduleData) {
// console.log('❌ [상단뷰 치수] 모듈 데이터 없음:', module.moduleId);
                  return;
                }
                
                const actualDepthMm = module.customDepth || moduleData.dimensions.depth;
// console.log(`📏 [상단뷰 치수] 가구 ${module.id}:`);
// console.log(`  - moduleId: ${module.moduleId}`);
// console.log(`  - customDepth: ${module.customDepth}`);
// console.log(`  - moduleData.dimensions.depth: ${moduleData.dimensions.depth}`);
// console.log(`  - moduleData.defaultDepth: ${moduleData.defaultDepth}`);
// console.log(`  - 최종 사용 깊이: ${actualDepthMm}mm`);
                
                // 실제 가구 위치 계산 (FurnitureItem.tsx와 완전히 동일한 방식, 실제 공간 깊이 사용)
                const panelDepthMm = spaceInfo.depth || 600; // 실제 공간 깊이
                const furnitureDepthMm = Math.min(panelDepthMm, 600); // 가구 공간 깊이
                const doorThicknessMm = 20;
                
                const panelDepth = mmToThreeUnits(panelDepthMm);
                const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
                const doorThickness = mmToThreeUnits(doorThicknessMm);
                const depth = mmToThreeUnits(actualDepthMm);
                
                // FurnitureItem.tsx와 동일한 계산
                const zOffset = -panelDepth / 2; // 공간 메쉬용 깊이 중앙
                const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2; // 뒷벽에서 600mm
                const furnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - depth/2;
                
                // 가구의 앞면과 뒷면 계산
                const furnitureBackZ = furnitureZ - depth/2;
                const furnitureFrontZ = furnitureZ + depth/2;
                
// console.log(`📐 [상단뷰 치수] 가구 ${module.id}: 뒷면Z=${furnitureBackZ.toFixed(3)}, 앞면Z=${furnitureFrontZ.toFixed(3)}`);
                
                minBackZ = Math.min(minBackZ, furnitureBackZ);
                maxFrontZ = Math.max(maxFrontZ, furnitureFrontZ);
              });
              
              // 가장 깊은 가구의 실제 깊이를 먼저 계산
              let deepestModuleDepthMm = 0;
              
              // 가장 깊이가 깊은 가구 찾기 (보조선 연결용)
              let deepestModule = null;
              
              placedModules.forEach(module => {
                const moduleData = getModuleById(
                  module.moduleId,
                  { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
                  spaceInfo
                );
                
                if (!moduleData) return;
                
                const actualDepthMm = module.customDepth || moduleData.dimensions.depth;
                
                if (actualDepthMm > deepestModuleDepthMm) {
                  deepestModuleDepthMm = actualDepthMm;
                  deepestModule = module;
                }
              });
              
              // @ts-ignore
// console.log(`🏆 [상단뷰 치수] 가장 깊은 가구: ${deepestModule?.module?.id}, 깊이: ${deepestModuleDepthMm}mm`);
              
              // 좌측 프레임 앞면 위치 계산 (실제 공간 깊이 사용)
              const panelDepthMm = spaceInfo.depth || 600;
              const furnitureDepthMm = Math.min(panelDepthMm, 600);
              const doorThicknessMm = 20;
              const frameThicknessMm = 20; // 프레임 두께
              
              const panelDepth = mmToThreeUnits(panelDepthMm);
              const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
              const doorThickness = mmToThreeUnits(doorThicknessMm);
              const frameThickness = mmToThreeUnits(frameThicknessMm);
              const furnitureZOffset = spaceZOffset + (panelDepth - furnitureDepth) / 2;
              
              // 도어 앞면 위치
              const doorFrontZ = furnitureZOffset + (furnitureDepth + mmToThreeUnits(20)) / 2;
              // 좌측 프레임 앞면 위치 (도어 앞면에서 프레임 두께만큼 더 앞쪽)
              const leftFrameFrontZ = doorFrontZ + frameThickness;
              
// console.log(`🏠 [상단뷰 치수] spaceZOffset: ${spaceZOffset.toFixed(3)}`);
// console.log(`🏠 [상단뷰 치수] furnitureZOffset: ${furnitureZOffset.toFixed(3)}`);
// console.log(`🏠 [상단뷰 치수] doorFrontZ: ${doorFrontZ.toFixed(3)}`);
              
              // 가장 깊은 가구의 앞면과 뒷면 위치 계산
              let deepestModuleBackZ = spaceZOffset; // 기본값: 뒷벽
              let deepestModuleFrontZ = spaceZOffset; // 기본값: 뒷벽
              
              if (deepestModule && deepestModule.module) {
                const moduleData = getModuleById(
                  deepestModule.module.moduleId,
                  { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
                  spaceInfo
                );
                
                if (moduleData?.dimensions) {
                  const actualDepthMm = deepestModule.module.customDepth || moduleData?.dimensions.depth || 0;
                  const depth = mmToThreeUnits(actualDepthMm);
                  
                  const panelDepth = mmToThreeUnits(spaceInfo.depth || 600);
                  const furnitureDepth = mmToThreeUnits(Math.min(spaceInfo.depth || 600, 600));
                  const doorThickness = mmToThreeUnits(20);
                  const zOffset = -panelDepth / 2;
                  const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;
                  const furnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - depth/2;
                  
                  deepestModuleBackZ = furnitureZ - depth/2; // 가장 깊은 가구의 뒷면
                  deepestModuleFrontZ = furnitureZ + depth/2; // 가장 깊은 가구의 앞면
                }
              }
              
              // 좌측 프레임 앞면에서 가장 깊은 가구 뒷면까지의 실제 거리 계산 (mm 단위)
              const actualDistanceMm = Math.round((leftFrameFrontZ - deepestModuleBackZ) / 0.01);
              
// console.log(`📏 [상단뷰 치수] 좌측 프레임 앞면 Z: ${leftFrameFrontZ.toFixed(3)}`);
// console.log(`📏 [상단뷰 치수] 가장 깊은 가구 뒷면 Z: ${deepestModuleBackZ.toFixed(3)}`);
// console.log(`📏 [상단뷰 치수] Z 차이: ${(leftFrameFrontZ - deepestModuleBackZ).toFixed(3)}`);
// console.log(`📏 [상단뷰 치수] 실제 거리: ${actualDistanceMm}mm`);
              
              return (
                <>
                  <Line
                    points={[[leftDimensionX, spaceHeight, deepestModuleBackZ], [leftDimensionX, spaceHeight, leftFrameFrontZ]]}
                    color={dimensionColor}
                    lineWidth={0.3}
                  />
                  
                  {/* 뒤쪽 화살표 (가구 뒷면) */}
                  <Line
                    points={createArrowHead([leftDimensionX, spaceHeight, deepestModuleBackZ], [leftDimensionX, spaceHeight, deepestModuleBackZ + 0.05])}
                    color={dimensionColor}
                    lineWidth={0.3}
                  />
                  
                  {/* 앞쪽 화살표 (좌측 프레임 앞면) */}
                  <Line
                    points={createArrowHead([leftDimensionX, spaceHeight, leftFrameFrontZ], [leftDimensionX, spaceHeight, leftFrameFrontZ - 0.05])}
                    color={dimensionColor}
                    lineWidth={0.3}
                  />
                  
                  {/* 좌측 프레임 앞면에서 가장 깊은 가구 뒷면까지의 거리 표시 */}
                  <Text
                  renderOrder={100001}
                  depthTest={false}
                    position={[leftDimensionX - mmToThreeUnits(40), spaceHeight + 0.1, deepestModuleBackZ + (leftFrameFrontZ - deepestModuleBackZ) / 2]}
                    fontSize={baseFontSize}
                    color={dimensionColor}
                    anchorX="center"
                    anchorY="middle"
                    rotation={[-Math.PI / 2, 0, Math.PI / 2]}
                  >
                    {actualDistanceMm}
                  </Text>
                  
                  {/* 연장선 - 좌측 프레임 앞면과 가장 깊은 가구 뒷면에서 시작 */}
                  {deepestModule && (
                    <>
                      {/* 가구 뒷면에서 치수선까지 */}
                      <Line
                        points={[[deepestModule.position.x, spaceHeight, deepestModuleBackZ], [leftDimensionX - mmToThreeUnits(20), spaceHeight, deepestModuleBackZ]]}
                        color={dimensionColor}
                        lineWidth={0.3}
                      />
                      {/* 좌측 프레임 앞면에서 치수선까지 */}
                      <Line
                        points={[[spaceXOffset, spaceHeight, leftFrameFrontZ], [leftDimensionX - mmToThreeUnits(20), spaceHeight, leftFrameFrontZ]]}
                        color={dimensionColor}
                        lineWidth={0.3}
                      />
                    </>
                  )}
                </>
              );
            })()}
          </group>
        )}

        {/* 캐비넷별 폭 치수선 - 외부로 이동하고 정면처럼 표시 */}
        {showDimensions && placedModules.length > 0 && placedModules.map((module, index) => {
          // 단내림 구간 가구는 zone 정보를 포함한 spaceInfo로 moduleData 조회
          let topViewSpaceInfo = spaceInfo;
          if (module.zone === 'dropped') {
            topViewSpaceInfo = { ...spaceInfo, zone: 'dropped' as const };
          }
          const moduleData = getModuleById(
            module.moduleId,
            calculateInternalSpace(topViewSpaceInfo),
            topViewSpaceInfo
          );

          if (!moduleData) return null;

          // 자유배치 가구는 freeWidth 우선, 그 외 customWidth/adjustedWidth/기본너비
          // 기둥 앞 배치(front) 모드는 슬롯 전체 너비
          const isColFrontTop = (module as any).columnPlacementMode === 'front';
          const slotFullWTop = module.slotIndex !== undefined ? (indexing.slotWidths?.[module.slotIndex] ?? indexing.columnWidth) : undefined;
          const actualWidth = (module.isFreePlacement && module.freeWidth)
            ? module.freeWidth
            : isColFrontTop
              ? (slotFullWTop || moduleData.dimensions.width)
              : (module.customWidth || module.adjustedWidth || moduleData.dimensions.width);
          const moduleWidth = mmToThreeUnits(actualWidth);
          // 조정된 위치가 있으면 사용, 없으면 원래 위치 사용 (front 모드는 슬롯 중심 X)
          const actualPositionX = isColFrontTop
            ? (module.slotIndex !== undefined ? (indexing.threeUnitPositions?.[module.slotIndex] ?? module.position.x) : module.position.x)
            : (module.adjustedPosition?.x || module.position.x);
          const leftX = actualPositionX - moduleWidth / 2;
          const rightX = actualPositionX + moduleWidth / 2;

          // 4단: 개별 가구 치수선 — DIM_GAP 기반 (입면 slotDimensionY에 대응)
          const dimZ = topSlotDimZ;

          return (
            <group key={`top-module-dim-${index}`}>
              {/* 캐비넷 폭 치수선 */}
              <NativeLine name="dimension_line"
                points={[[leftX, spaceHeight, dimZ], [rightX, spaceHeight, dimZ]]}
                color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
              />

              {/* 화살표들 */}
              <NativeLine name="dimension_line"
                points={createArrowHead([leftX, spaceHeight, dimZ], [leftX + 0.02, spaceHeight, dimZ], 0.01)}
                color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
              />
              <NativeLine name="dimension_line"
                points={createArrowHead([rightX, spaceHeight, dimZ], [rightX - 0.02, spaceHeight, dimZ], 0.01)}
                color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={false}
              />

              {/* 캐비넷 폭 치수 텍스트 - 상단뷰용, 듀얼: 0.5 단위 내림, 싱글: 정수 내림 */}
              <Text
                  renderOrder={100000}
                  depthTest={false}
                position={[actualPositionX, spaceHeight + 0.1, dimZ - mmToThreeUnits(30)]}
                fontSize={baseFontSize}
                color={dimensionColor}
                anchorX="center"
                anchorY="middle"
                rotation={[-Math.PI / 2, 0, 0]}
              >
                {(() => {
                  const w = Math.round(actualWidth * 10) / 10;
                  return w % 1 === 0 ? w : w.toFixed(1);
                })()}
              </Text>

              {/* 연장선들 - 가구 앞단에서 치수선까지 */}
              {(() => {
                // 좌우 깊이가 다른 가구인지 확인
                const isDualModule = moduleData?.id.includes('dual') || false;
                const rightAbsoluteDepth = moduleData?.modelConfig?.rightAbsoluteDepth;
                const hasAsymmetricDepth = isDualModule && rightAbsoluteDepth;

                const panelDepthMm = spaceInfo.depth || 600;
                const furnitureDepthMm = Math.min(panelDepthMm, 600);
                const doorThicknessMm = 20;
                const actualDepthMm = module.customDepth || moduleData?.dimensions?.depth || 580;

                const panelDepth = mmToThreeUnits(panelDepthMm);
                const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
                const doorThickness = mmToThreeUnits(doorThicknessMm);

                const furnitureZOffset = spaceZOffset + (panelDepth - furnitureDepth) / 2;

                if (hasAsymmetricDepth) {
                  // 좌우 깊이가 다른 경우: 각각 다른 깊이로 계산
                  const leftDepthMm = actualDepthMm; // 좌측은 기본 깊이
                  const rightDepthMm = rightAbsoluteDepth; // 우측은 절대 깊이

                  const leftDepth = mmToThreeUnits(leftDepthMm);
                  const rightDepth = mmToThreeUnits(rightDepthMm);

                  // 좌측 앞면 (기본 깊이)
                  const leftFrontZ = furnitureZOffset + furnitureDepth/2 - doorThickness - leftDepth/2 + leftDepth/2;
                  // 우측 앞면 (절대 깊이) - 깊이 차이만큼 앞쪽으로 이동
                  const rightFrontZ = furnitureZOffset + furnitureDepth/2 - doorThickness - rightDepth/2 + rightDepth/2 + (leftDepth - rightDepth) / 2;

                  return (
                    <>
                      {/* 좌측 연장선 */}
                      <NativeLine name="dimension_line"
                        points={[[leftX, spaceHeight, leftFrontZ], [leftX, spaceHeight, dimZ - mmToThreeUnits(15)]]}
                        color={dimensionColor} renderOrder={100000} depthTest={false}
                      />
                      {/* 우측 연장선 */}
                      <NativeLine name="dimension_line"
                        points={[[rightX, spaceHeight, rightFrontZ], [rightX, spaceHeight, dimZ - mmToThreeUnits(15)]]}
                        color={dimensionColor} renderOrder={100000} depthTest={false}
                      />
                    </>
                  );
                } else {
                  // 좌우 깊이가 동일한 경우: 기존 로직
                  const moduleDepth = mmToThreeUnits(actualDepthMm);
                  const furnitureFrontZ = furnitureZOffset + furnitureDepth/2 - doorThickness - moduleDepth/2 + moduleDepth/2;

                  return (
                    <>
                      <NativeLine name="dimension_line"
                        points={[[leftX, spaceHeight, furnitureFrontZ], [leftX, spaceHeight, dimZ - mmToThreeUnits(15)]]}
                        color={dimensionColor} renderOrder={100000} depthTest={false}
                      />
                      <NativeLine name="dimension_line"
                        points={[[rightX, spaceHeight, furnitureFrontZ], [rightX, spaceHeight, dimZ - mmToThreeUnits(15)]]}
                        color={dimensionColor} renderOrder={100000} depthTest={false}
                      />
                    </>
                  );
                }
              })()}
            </group>
          );
        })}

        {/* 기둥별 치수 - 상부뷰 (기둥 내부에 텍스트만 표시) - 불필요하므로 비활성화 */}
        {false && showDimensions && spaceInfo.columns && spaceInfo.columns.length > 0 && spaceInfo.columns.map((column, index) => {
          const columnDepthM = (column.depth || 300) * 0.01;
          // 기둥 중앙 Z 위치 계산
          const columnCenterZ = column.position[2] || (spaceZOffset + columnDepthM / 2);

          return (
            <group key={`top-column-dim-${column.id}`}>
              {/* 기둥 치수 텍스트 - 기둥 내부 중앙에 표시 */}
              <Text
                renderOrder={100001}
                depthTest={false}
                position={[column.position[0], spaceHeight + 0.1, columnCenterZ]}
                fontSize={baseFontSize * 0.8}
                color="#FF0000"
                anchorX="center"
                anchorY="middle"
                rotation={[-Math.PI / 2, 0, 0]}
              >
                {formatMmValue(column.width)}
              </Text>
            </group>
          );
        })}

        {/* 우측 치수선 - 우측 프레임 앞면부터 가구 가장 뒷면까지 거리 (비활성화) */}
        {false && placedModules.length > 0 && (() => {
          // 우측에 배치된 가구들의 가장 뒷면과 X 위치 찾기
          let rightmostBackZ = Infinity;
          let rightFurnitureX = spaceXOffset + mmToThreeUnits(spaceInfo.width); // 기본값: 공간 오른쪽 끝
          let rightFurnitureLeftEdge = spaceXOffset + mmToThreeUnits(spaceInfo.width); // 우측 가구의 왼쪽 끝 모서리
          
          placedModules.forEach((module) => {
            const moduleData = getModuleById(
              module.moduleId,
              { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
              spaceInfo
            );
            
            if (!moduleData || !moduleData.dimensions) return;
            
            // FurnitureItem.tsx와 완전히 동일한 계산
            const actualDepthMm = module.customDepth || moduleData.dimensions.depth;
            const moduleWidthMm = (module.isFreePlacement && module.freeWidth) ? module.freeWidth : moduleData.dimensions.width;
            const moduleWidth = mmToThreeUnits(moduleWidthMm);
            const leftX = module.position.x - moduleWidth / 2;
            const rightX = module.position.x + moduleWidth / 2;
            
            // 우측 절반에 있는 가구만 고려 (공간 중앙 기준)
            const spaceWidth = mmToThreeUnits(spaceInfo.width);
            const spaceCenterX = spaceXOffset + spaceWidth / 2;
            
            if (rightX > spaceCenterX) {
              // 좌우 깊이가 다른 가구인지 확인 (스타일러장 등)
              const isDualModule = moduleData.id.includes('dual');
              const rightAbsoluteDepth = moduleData.modelConfig?.rightAbsoluteDepth;
              const hasAsymmetricDepth = isDualModule && rightAbsoluteDepth;
              
              // FurnitureItem.tsx와 완전히 동일한 Z 위치 계산 (실제 공간 깊이 사용)
              const panelDepthMm = spaceInfo.depth || 600;
              const furnitureDepthMm = Math.min(panelDepthMm, 600);
              const doorThicknessMm = 20;
              
              const panelDepth = mmToThreeUnits(panelDepthMm);
              const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
              const doorThickness = mmToThreeUnits(doorThicknessMm);
              
              // FurnitureItem.tsx와 동일한 계산
              const zOffset = -panelDepth / 2;
              const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;
              
              let furnitureBackZ;
              
              if (hasAsymmetricDepth) {
                // 좌우 깊이가 다른 경우: 우측 절대 깊이 사용
                const leftDepthMm = actualDepthMm;
                const rightDepthMm = rightAbsoluteDepth!;
                const leftDepth = mmToThreeUnits(leftDepthMm);
                const rightDepth = mmToThreeUnits(rightDepthMm);
                
// console.log('🔍 [스타일러장 디버깅]');
// console.log('- 모듈ID:', moduleData.id);
// console.log('- actualDepthMm (좌측):', leftDepthMm);
// console.log('- rightAbsoluteDepth (우측):', rightDepthMm);
// console.log('- leftDepth (Three.js):', leftDepth);
// console.log('- rightDepth (Three.js):', rightDepth);
// console.log('- furnitureZOffset:', furnitureZOffset);
// console.log('- furnitureDepth:', furnitureDepth);
// console.log('- doorThickness:', doorThickness);
                
                // 우측 가구의 실제 배치 위치 (깊이 차이 반영) - DualType5와 동일하게 계산
                // DualType5에서는 우측이 660mm로 더 깊으므로, 우측 뒷면이 더 뒤로 나와야 함
                const rightFurnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - rightDepth/2;
                furnitureBackZ = rightFurnitureZ - rightDepth/2;
// console.log('- rightFurnitureZ (가구 중심, 수정된 계산):', rightFurnitureZ);
// console.log('- furnitureBackZ (가구 뒷면, 수정된 계산):', furnitureBackZ);
              } else {
                // 좌우 깊이가 동일한 경우: FurnitureItem.tsx와 동일
                const depth = mmToThreeUnits(actualDepthMm);
                const furnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - depth/2;
                furnitureBackZ = furnitureZ - depth/2;
              }
              
              if (furnitureBackZ < rightmostBackZ) {
                rightmostBackZ = furnitureBackZ;
                rightFurnitureLeftEdge = leftX; // 실제 가구의 왼쪽 끝
              }
            }
          });
          
          if (rightmostBackZ === Infinity) return null;
          
          // 우측 프레임 앞면 위치 계산 (Room.tsx와 동일, 실제 공간 깊이 사용)
          const panelDepthMm = spaceInfo.depth || 600;
          const furnitureDepthMm = Math.min(panelDepthMm, 600); // 실제 가구 공간 깊이 (FurnitureItem.tsx와 동일)
          
          const panelDepth = mmToThreeUnits(panelDepthMm);
          const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
          
          const furnitureZOffset = spaceZOffset + (panelDepth - furnitureDepth) / 2;
          // Room.tsx의 실제 우측 프레임 위치 (가구 앞면에서 30mm 뒤로)
          const rightFrameFrontZ = furnitureZOffset + furnitureDepth/2 - mmToThreeUnits(30);
          
          // 거리 계산 (mm 단위) - 우측 프레임 앞면부터 실제 가구 뒷면까지의 실제 거리  
          const distanceMm = Math.round((rightFrameFrontZ - rightmostBackZ) / 0.01);
          
          // 치수선을 오른쪽에 표시
          const spaceWidth = mmToThreeUnits(spaceInfo.width);
          const rightDimensionX = spaceXOffset + spaceWidth + mmToThreeUnits(200);
          
          return (
            <group key="right-frame-to-furniture-dimension">
              {/* 치수선 */}
              <Line
                points={[[rightDimensionX, spaceHeight, rightmostBackZ], [rightDimensionX, spaceHeight, rightFrameFrontZ]]}
                color={dimensionColor}
                lineWidth={0.3}
              />
              
              {/* 화살표들 */}
              <Line
                points={createArrowHead([rightDimensionX, spaceHeight, rightmostBackZ], [rightDimensionX, spaceHeight, rightmostBackZ + 0.02], 0.01)}
                color={dimensionColor}
                lineWidth={0.3}
              />
              <Line
                points={createArrowHead([rightDimensionX, spaceHeight, rightFrameFrontZ], [rightDimensionX, spaceHeight, rightFrameFrontZ - 0.02], 0.01)}
                color={dimensionColor}
                lineWidth={0.3}
              />
              
              {/* 거리 텍스트 */}
              <Text
                  renderOrder={100001}
                  depthTest={false}
                position={[rightDimensionX + mmToThreeUnits(40), spaceHeight + 0.1, (rightmostBackZ + rightFrameFrontZ) / 2]}
                fontSize={baseFontSize}
                color={dimensionColor}
                anchorX="center"
                anchorY="middle"
                rotation={[-Math.PI / 2, 0, 0]}
              >
                {distanceMm}
              </Text>

              {/* 연장선들 - 실제 가구의 정확한 위치에서 짧게 */}
              <Line
                points={[[rightFurnitureLeftEdge, spaceHeight, rightmostBackZ], [rightDimensionX - mmToThreeUnits(20), spaceHeight, rightmostBackZ]]}
                color={dimensionColor}
                lineWidth={0.3}
              />
              {/* 우측 프레임 앞면 연장선 - 공간 벽에서 짧게 */}
              <Line
                points={[[spaceXOffset + spaceWidth, spaceHeight, rightFrameFrontZ], [rightDimensionX - mmToThreeUnits(20), spaceHeight, rightFrameFrontZ]]}
                color={dimensionColor}
                lineWidth={0.3}
              />
            </group>
          );
        })()}

        {/* 도어 치수 표시 - 3D에서 도어가 실제로 설치된 캐비넷에만 표시 */}
        {is3DMode && showDimensions && placedModules.length > 0 && placedModules.filter(module => {
          const moduleData = getModuleById(
            module.moduleId,
            { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
            spaceInfo
          );
          // moduleData.hasDoor: 도어 가능 여부, module.hasDoor: 실제 설치 여부
          return moduleData && moduleData.hasDoor && module.hasDoor;
        }).map((module, index) => {
          const moduleData = getModuleById(
            module.moduleId,
            { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
            spaceInfo
          );
          
          // 도어가 없으면 표시하지 않음
          if (!moduleData || !moduleData.hasDoor) return null;
          const dimensionColor = primaryColor;
          
          const actualDepthMm = module.customDepth || moduleData.dimensions.depth;
          // 자유배치 가구는 freeWidth 우선, 기둥 조정 너비 사용
          // 기둥 앞 배치(front) 모드는 슬롯 전체 너비 + 슬롯 중심
          const isColFrontDoor = (module as any).columnPlacementMode === 'front';
          const slotFullWDoor = module.slotIndex !== undefined ? (indexing.slotWidths?.[module.slotIndex] ?? indexing.columnWidth) : undefined;
          const actualWidthMm = (module.isFreePlacement && module.freeWidth)
            ? module.freeWidth
            : isColFrontDoor
              ? (slotFullWDoor || moduleData.dimensions.width)
              : (module.customWidth || module.adjustedWidth || moduleData.dimensions.width);
          const moduleWidth = mmToThreeUnits(actualWidthMm);
          const moduleCenterX = isColFrontDoor
            ? (module.slotIndex !== undefined ? (indexing.threeUnitPositions?.[module.slotIndex] ?? module.position.x) : module.position.x)
            : module.position.x;
          const leftX = moduleCenterX - moduleWidth / 2;
          const rightX = moduleCenterX + moduleWidth / 2;
          
          // 스타일러장인지 확인 (듀얼 서랍+스타일러 타입)
          const isStylerType = moduleData.id.includes('dual-2drawer-styler');
          
          // 도어 위치 계산 (FurnitureItem.tsx와 동일, 실제 공간 깊이 사용)
          const panelDepthMm = spaceInfo.depth || 600;
          const furnitureDepthMm = Math.min(panelDepthMm, 600);
          const stylerDepthMm = 660; // 스타일러장 깊이
          const doorThicknessMm = 18;
          
          const panelDepth = mmToThreeUnits(panelDepthMm);
          const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
          const stylerDepth = mmToThreeUnits(stylerDepthMm);
          const doorThickness = mmToThreeUnits(doorThicknessMm);
          
          // 스타일러장의 경우 우측 부분의 깊이와 위치가 다름 (DualType5.tsx와 동일한 로직)
          let leftDoorFrontZ, rightDoorFrontZ, leftDoorBackZ, rightDoorBackZ;
          
          if (isStylerType) {
            // DualType5.tsx 로직 참고: 좌우 비대칭 깊이 처리
            const leftDepthMm = actualDepthMm; // 좌측: 600mm (또는 customDepth)
            const rightDepthMm = 660; // 우측: 스타일러장 고정 깊이
            
            const leftDepth = mmToThreeUnits(leftDepthMm);
            const rightDepth = mmToThreeUnits(rightDepthMm);
            
            // 기본 가구 Z 오프셋 (600mm 기준)
            const baseFurnitureZOffset = spaceZOffset + (panelDepth - furnitureDepth) / 2;
            
            // 좌측 도어 위치 (기본 위치)
            leftDoorFrontZ = baseFurnitureZOffset + furnitureDepth/2 - doorThickness - leftDepth/2 + leftDepth/2;
            leftDoorBackZ = leftDoorFrontZ - doorThickness;
            
            // 우측 도어 위치 수정: 좌측 도어와 동일한 Z 라인에 정렬
            // 스타일러장 우측 도어도 같은 라인에 있도록 leftDoorFrontZ와 동일하게 설정
            rightDoorFrontZ = leftDoorFrontZ;
            rightDoorBackZ = leftDoorBackZ;
          } else {
            // 일반 가구: 동일한 깊이
            const depth = mmToThreeUnits(actualDepthMm);
            const furnitureZOffset = spaceZOffset + (panelDepth - furnitureDepth) / 2;
            const doorFrontZ = furnitureZOffset + furnitureDepth/2 - doorThickness - depth/2 + depth/2;
            const doorBackZ = doorFrontZ - doorThickness;
            
            leftDoorFrontZ = rightDoorFrontZ = doorFrontZ;
            leftDoorBackZ = rightDoorBackZ = doorBackZ;
          }
          
          // 하위 호환성을 위한 기본값 설정
          const doorFrontZ = leftDoorFrontZ;
          const doorBackZ = leftDoorBackZ;
          
          // 듀얼 도어인지 확인 (id에 'dual'이 포함되어 있으면 듀얼 도어로 간주)
          const isDualDoor = moduleData.id?.includes('dual');
          
          // 실제 도어의 x축 위치 계산
          let leftDoorLeftX, leftDoorRightX, rightDoorLeftX, rightDoorRightX;
          
          if (isDualDoor) {
            // 듀얼 도어: 좌우 각각의 도어 경계
            const centerX = module.position.x;
            leftDoorLeftX = leftX;
            leftDoorRightX = centerX;
            rightDoorLeftX = centerX;
            rightDoorRightX = rightX;
          } else {
            // 싱글 도어: 전체 영역
            leftDoorLeftX = leftX;
            leftDoorRightX = rightX;
            rightDoorLeftX = leftX;
            rightDoorRightX = rightX;
          }
          
          return (
            <group key={`door-dimension-${index}`}>
              {/* 하단 도어 치수 - 듀얼은 좌측 도어 기준 1개만, 싱글은 전체 */}
              {/* 모든 도어의 치수는 leftDoorFrontZ를 사용하여 동일한 Z 라인에 배치 */}
              {isDualDoor ? (
                // 듀얼 도어: 좌측 도어 치수만 표시
                <>
                  {/* 좌측 도어 치수 */}
                  <group>
                    <NativeLine name="dimension_line"
                      points={[[leftDoorLeftX, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)], [leftDoorRightX, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)]]}
                      color={dimensionColor}
                      lineWidth={0.6}
                      renderOrder={100000}
                      depthTest={false}
                    />
                    <NativeLine name="dimension_line"
                      points={createArrowHead([leftDoorLeftX, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)], [leftDoorLeftX + 0.05, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)])}
                      color={dimensionColor}
                      lineWidth={0.6}
                      renderOrder={100000}
                      depthTest={false}
                    />
                    <NativeLine name="dimension_line"
                      points={createArrowHead([leftDoorRightX, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)], [leftDoorRightX - 0.05, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)])}
                      color={dimensionColor}
                      lineWidth={0.6}
                      renderOrder={100000}
                      depthTest={false}
                    />
                    <Text
                      renderOrder={999999}
                      material-depthTest={false}
                      material-depthWrite={false}
                      material-transparent={true}
                      position={[(leftDoorLeftX + leftDoorRightX) / 2, spaceHeight + 0.1, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 120 : 100)]}
                      fontSize={baseFontSize}
                      color={dimensionColor}
                      anchorX="center"
                      anchorY="middle"
                      rotation={[-Math.PI / 2, 0, 0]}
                    >
                      {Math.round((actualWidthMm - 6) / 2)}
                    </Text>
                    <NativeLine name="dimension_line"
                      points={[[leftDoorLeftX, spaceHeight, leftDoorFrontZ], [leftDoorLeftX, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 60 : 40)]]}
                      color={dimensionColor}
                      lineWidth={0.6}
                      renderOrder={100000}
                      depthTest={false}
                    />
                    <NativeLine name="dimension_line"
                      points={[[leftDoorRightX, spaceHeight, leftDoorFrontZ], [leftDoorRightX, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 60 : 40)]]}
                      color={dimensionColor}
                      lineWidth={0.6}
                      renderOrder={100000}
                      depthTest={false}
                    />
                  </group>

                  {/* 중간 세로 가이드선 - 듀얼 도어를 나누는 중간선이 가로 치수선까지 확장 */}
                  <group>
                    <NativeLine name="dimension_line"
                      points={[[module.position.x, spaceHeight, leftDoorFrontZ], [module.position.x, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)]]}
                      color={dimensionColor}
                      lineWidth={0.6}
                      renderOrder={100000}
                      depthTest={false}
                    />
                  </group>
                </>
              ) : (
                // 싱글 도어: 전체 치수 표시
                <group>
                  <NativeLine name="dimension_line"
                    points={[[leftDoorLeftX, spaceHeight, doorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)], [rightDoorRightX, spaceHeight, doorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)]]}
                    color={dimensionColor}
                    lineWidth={0.6}
                    renderOrder={100000}
                    depthTest={false}
                  />
                  <NativeLine name="dimension_line"
                    points={createArrowHead([leftDoorLeftX, spaceHeight, doorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)], [leftDoorLeftX + 0.05, spaceHeight, doorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)])}
                    color={dimensionColor}
                    lineWidth={0.6}
                    renderOrder={100000}
                    depthTest={false}
                  />
                  <NativeLine name="dimension_line"
                    points={createArrowHead([rightDoorRightX, spaceHeight, doorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)], [rightDoorRightX - 0.05, spaceHeight, doorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)])}
                    color={dimensionColor}
                    lineWidth={0.6}
                    renderOrder={100000}
                    depthTest={false}
                  />
                  <Text
                    renderOrder={999999}
                    material-depthTest={false}
                    material-depthWrite={false}
                    material-transparent={true}
                    position={[(leftDoorLeftX + rightDoorRightX) / 2, spaceHeight + 0.1, doorFrontZ + mmToThreeUnits(hasPlacedModules ? 120 : 100)]}
                    fontSize={baseFontSize}
                    color={dimensionColor}
                    anchorX="center"
                    anchorY="middle"
                    rotation={[-Math.PI / 2, 0, 0]}
                  >
                    {actualWidthMm - 3}
                  </Text>
                  <NativeLine name="dimension_line"
                    points={[[leftDoorLeftX, spaceHeight, doorFrontZ], [leftDoorLeftX, spaceHeight, doorFrontZ + mmToThreeUnits(hasPlacedModules ? 60 : 40)]]}
                    color={dimensionColor}
                    lineWidth={0.6}
                    renderOrder={100000}
                    depthTest={false}
                  />
                  <NativeLine name="dimension_line"
                    points={[[rightDoorRightX, spaceHeight, doorFrontZ], [rightDoorRightX, spaceHeight, doorFrontZ + mmToThreeUnits(hasPlacedModules ? 60 : 40)]]}
                    color={dimensionColor}
                    lineWidth={0.6}
                    renderOrder={100000}
                    depthTest={false}
                  />
                </group>
              )}
              
              {/* 도어 두께 치수 - 좌측에 표시, z축 위로 10mm 이동 */}
              <group>
                {/* 도어 두께 치수선 (좌측, z축을 위로 22mm 이동하여 실제 도어 위치에 맞춤) */}
                <Line
                  points={[[spaceXOffset - mmToThreeUnits(200), spaceHeight, -mmToThreeUnits(18)], [spaceXOffset - mmToThreeUnits(200), spaceHeight, mmToThreeUnits(0)]]}
                  color={dimensionColor}
                  lineWidth={0.3}
                />
                {/* 도어 두께 화살표 */}
                <Line
                  points={createArrowHead([spaceXOffset - mmToThreeUnits(200), spaceHeight, -mmToThreeUnits(18)], [spaceXOffset - mmToThreeUnits(200), spaceHeight, -mmToThreeUnits(18) + 0.02], 0.01)}
                  color={dimensionColor}
                  lineWidth={0.3}
                />
                <Line
                  points={createArrowHead([spaceXOffset - mmToThreeUnits(200), spaceHeight, mmToThreeUnits(0)], [spaceXOffset - mmToThreeUnits(200), spaceHeight, mmToThreeUnits(0) - 0.02], 0.01)}
                  color={dimensionColor}
                  lineWidth={0.3}
                />
                {/* 도어 두께 텍스트 (중앙 위치) */}
                <Text
                  position={[spaceXOffset - mmToThreeUnits(240), spaceHeight + 0.1, -mmToThreeUnits(9)]}
                  fontSize={baseFontSize}
                  color={dimensionColor}
                  anchorX="center"
                  anchorY="middle"
                  rotation={[-Math.PI / 2, 0, 0]}
                  renderOrder={100001}
                  depthTest={false}
                >
                  {doorThicknessMm}
                </Text>
                {/* 도어 두께 연결선 - 실제 도어 위치에 맞춤 */}
                <Line
                  points={[[leftDoorLeftX, spaceHeight, -mmToThreeUnits(18)], [spaceXOffset - mmToThreeUnits(180), spaceHeight, -mmToThreeUnits(18)]]}
                  color={dimensionColor}
                  lineWidth={0.3}
                />
                <Line
                  points={[[leftDoorLeftX, spaceHeight, mmToThreeUnits(0)], [spaceXOffset - mmToThreeUnits(180), spaceHeight, mmToThreeUnits(0)]]}
                  color={dimensionColor}
                  lineWidth={0.3}
                />
              </group>
            </group>
          );
        })}
                  </>
      )}

      {/* (3D 깊이 치수는 renderDimensions 바깥 최상위 group으로 이동됨 — zOffset 영향 회피) */}
      {false && is3DMode && showDimensions && placedModules.length > 0 && (
        <group position={[0, 0, -zOffset]} renderOrder={999999}>
          {placedModules.map((module, mIdx) => {
            const moduleData = getModuleById(
              module.moduleId,
              { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
              spaceInfo
            );
            if (!moduleData || !moduleData.dimensions) return null;
            if (module.moduleId?.includes('insert-frame')) return null;
            if (module.moduleId?.includes('glass-cabinet')) return null;

            const isColFront3D = (module as any).columnPlacementMode === 'front';
            const slotFullW3D = module.slotIndex !== undefined ? (indexing.slotWidths?.[module.slotIndex] ?? indexing.columnWidth) : undefined;
            const moduleWidthMm3D = (module.isFreePlacement && module.freeWidth)
              ? module.freeWidth
              : isColFront3D
                ? (slotFullW3D || moduleData.dimensions.width)
                : (module.customWidth || module.adjustedWidth || moduleData.dimensions.width);
            const halfWidth = mmToThreeUnits(moduleWidthMm3D) / 2;
            const cxX3D = isColFront3D
              ? (module.slotIndex !== undefined ? (indexing.threeUnitPositions?.[module.slotIndex] ?? module.position.x) : module.position.x)
              : module.position.x;
            // 가구가 화면 좌측(음수 X)이면 좌측면, 아니면 우측면에 표시
            const showOnLeftSide = cxX3D < 0;
            // 치수선은 가구 측면에서 약간 떨어진 위치
            const sideOffset = mmToThreeUnits(80);
            const sideX = showOnLeftSide ? (cxX3D - halfWidth - sideOffset) : (cxX3D + halfWidth + sideOffset);
            const textOffsetX = showOnLeftSide ? -mmToThreeUnits(40) : mmToThreeUnits(40);

            // 가구 Z 위치 계산 (FurnitureItem.tsx와 동일 로직)
            const panelDepthMm3D = spaceInfo.depth || 600;
            const furnitureDepthMm3D = Math.min(panelDepthMm3D, 600);
            const doorThicknessMm3D = 20;
            const panelDepth3D = mmToThreeUnits(panelDepthMm3D);
            const furnitureDepth3D = mmToThreeUnits(furnitureDepthMm3D);
            const doorThickness3D = mmToThreeUnits(doorThicknessMm3D);
            const zOff3D = -panelDepth3D / 2;
            const furnitureZOffset3D = zOff3D + (panelDepth3D - furnitureDepth3D) / 2;
            const isFloating3D = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
            const baseDepthOffset3D = isFloating3D ? mmToThreeUnits(spaceInfo.baseConfig?.depth || 0) : 0;
            const moduleBackWallGapMm3D = (module as any).backWallGap ?? 0;
            const moduleBackWallGapZ3D = moduleBackWallGapMm3D > 0 ? mmToThreeUnits(moduleBackWallGapMm3D) : 0;
            const mid3D = module.moduleId || '';
            const isShoeCab3D = (mid3D.includes('-entryway-') || mid3D.includes('-shelf-')
              || mid3D.includes('-4drawer-shelf-') || mid3D.includes('-2drawer-shelf-'));
            const isUpper3D = moduleData.category === 'upper' || mid3D.includes('upper-cabinet');

            const actualDepthMm3D = module.customDepth || module.upperSectionDepth || module.lowerSectionDepth || moduleData.dimensions.depth;
            const depth3D = mmToThreeUnits(actualDepthMm3D);

            let backZ3D: number;
            if (isUpper3D) {
              backZ3D = furnitureZOffset3D - furnitureDepth3D / 2 - doorThickness3D + moduleBackWallGapZ3D;
            } else if (isShoeCab3D) {
              backZ3D = furnitureZOffset3D - furnitureDepth3D / 2 - doorThickness3D + baseDepthOffset3D + moduleBackWallGapZ3D;
            } else {
              backZ3D = furnitureZOffset3D + furnitureDepth3D / 2 - doorThickness3D - depth3D + baseDepthOffset3D + moduleBackWallGapZ3D;
            }
            const frontZ3D = backZ3D + depth3D;

            // Y: 가구 중간높이
            const moduleHeightMm3D = isUpper3D
              ? (module.customHeight ?? module.freeHeight ?? moduleData.dimensions.height ?? 600)
              : (module.freeHeight ?? module.customHeight ?? moduleData.dimensions.height ?? 2200);
            const floorFinishMm3D = spaceInfo.hasFloorFinish && spaceInfo.floorFinish?.height ? spaceInfo.floorFinish.height : 0;
            const baseFrameMm3D = (module as any).hasBase === false ? 0
              : ((module as any).baseFrameHeight ?? (spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height || 65) : 0));
            const floatMm3D = (module as any).hasBase === false ? ((module as any).individualFloatHeight ?? 0) : 0;
            const topFrameMm3D = (module as any).hasTopFrame === false
              ? ((module as any).topFrameGap ?? 0)
              : ((module as any).topFrameThickness ?? (spaceInfo.frameSize?.top ?? 30));
            const moduleBottomMm3D = isUpper3D
              ? Math.max(0, Math.round(spaceInfo.height - topFrameMm3D - moduleHeightMm3D))
              : (floorFinishMm3D + baseFrameMm3D + floatMm3D);
            const midY3D = mmToThreeUnits(moduleBottomMm3D + moduleHeightMm3D / 2);

            // 회전된 텍스트: 측면에서 보았을 때 가구 측면에 평행
            const textRotation: [number, number, number] = showOnLeftSide
              ? [0, -Math.PI / 2, 0]
              : [0, Math.PI / 2, 0];

            const cabinetSideX = showOnLeftSide ? (cxX3D - halfWidth) : (cxX3D + halfWidth);

            return (
              <group key={`3d-depth-dim-${module.id}-${mIdx}`} name={`3d-depth-dim-${module.id}`}>
                {/* 깊이 치수선 (Z축 방향) */}
                <NativeLine name="3d-depth-dimension"
                  points={[[sideX, midY3D, backZ3D], [sideX, midY3D, frontZ3D]]}
                  color={dimensionColor} lineWidth={1.5}
                  renderOrder={100000} depthTest={true}
                />
                {/* 화살표 (뒷면 / 앞면) */}
                <NativeLine name="3d-depth-dimension"
                  points={createArrowHead([sideX, midY3D, backZ3D], [sideX, midY3D, backZ3D + 0.02])}
                  color={dimensionColor} lineWidth={1.5}
                  renderOrder={100000} depthTest={true}
                />
                <NativeLine name="3d-depth-dimension"
                  points={createArrowHead([sideX, midY3D, frontZ3D], [sideX, midY3D, frontZ3D - 0.02])}
                  color={dimensionColor} lineWidth={1.5}
                  renderOrder={100000} depthTest={true}
                />
                {/* 깊이 텍스트 (가구 측면 외부) */}
                <Text
                  position={[sideX + textOffsetX, midY3D, (backZ3D + frontZ3D) / 2]}
                  fontSize={baseFontSize}
                  color={textColor}
                  anchorX="center"
                  anchorY="middle"
                  outlineWidth={textOutlineWidth}
                  outlineColor={textOutlineColor}
                  rotation={textRotation}
                  renderOrder={100001}
                  material-depthTest={true}
                  material-transparent={true}
                >
                  {Math.round(actualDepthMm3D)}
                </Text>
                {/* 연장선: 가구 측면 ~ 치수선까지 */}
                <NativeLine name="3d-depth-dimension-ext"
                  points={[[cabinetSideX, midY3D, backZ3D], [sideX, midY3D, backZ3D]]}
                  color={dimensionColor} lineWidth={0.8}
                  renderOrder={100000} depthTest={true}
                />
                <NativeLine name="3d-depth-dimension-ext"
                  points={[[cabinetSideX, midY3D, frontZ3D], [sideX, midY3D, frontZ3D]]}
                  color={dimensionColor} lineWidth={0.8}
                  renderOrder={100000} depthTest={true}
                />
              </group>
            );
          })}
        </group>
      )}

    </group>
  );
  };

  // 기둥만 렌더링하는 함수
  const renderColumns = () => {
    // showDimensions가 true이고 currentViewDirection이 'front'일 때만 처리
    if (!showDimensions || currentViewDirection !== 'front') {
      return null;
    }
    
    // 기둥 관련 거리 표시는 ColumnDistanceLabels에서 더블클릭 시에만 표시
    return null;
  };

// console.log('🎨 CleanCAD2D 최종 렌더링:', {
    // currentViewDirection,
    // showDimensions,
    // hasColumns: !!spaceInfo.columns,
    // columnCount: spaceInfo.columns?.length,
    // shouldRenderColumns: currentViewDirection === 'front'
  // });

  return (
    <group 
      ref={groupRef} 
      renderOrder={1000000}
    >
      {/* 치수선 렌더링 - 조건은 renderDimensions 내부에서 처리 */}
      {renderDimensions()}

      {/* 기둥 렌더링 - 조건은 renderColumns 내부에서 처리 */}
      {renderColumns()}

      {/* 3D 모드: 각 가구의 좌/우 측면 외부 바닥 라인에 깊이 치수 표시 (선택된 가구만)
          가구 클릭 → selectedFurnitureId(또는 selectedFurnitureIds) 일치 시에만 활성화 */}
      {is3DMode && showDimensions && placedModules.length > 0 && placedModules.map((module, mIdx) => {
        const moduleData = getModuleById(
          module.moduleId,
          { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
          spaceInfo
        );
        if (!moduleData || !moduleData.dimensions) return null;
        if (module.moduleId?.includes('insert-frame')) return null;
        if (module.moduleId?.includes('glass-cabinet')) return null;
        // 선택된 가구만 깊이 치수 표시
        const isSelectedForDepthDim = selectedFurnitureId === module.id
          || (selectedFurnitureIds ?? []).includes(module.id);
        if (!isSelectedForDepthDim) return null;

        const indexing3D = calculateSpaceIndexing(spaceInfo);
        const isColFront3D = (module as any).columnPlacementMode === 'front';
        const slotFullW3D = module.slotIndex !== undefined ? (indexing3D.slotWidths?.[module.slotIndex] ?? indexing3D.columnWidth) : undefined;
        const moduleWidthMm3D = (module.isFreePlacement && module.freeWidth)
          ? module.freeWidth
          : isColFront3D
            ? (slotFullW3D || moduleData.dimensions.width)
            : (module.customWidth || module.adjustedWidth || moduleData.dimensions.width);
        const halfWidth = mmToThreeUnits(moduleWidthMm3D) / 2;
        const cxX3D = isColFront3D
          ? (module.slotIndex !== undefined ? (indexing3D.threeUnitPositions?.[module.slotIndex] ?? module.position.x) : module.position.x)
          : module.position.x;
        const showOnLeftSide = cxX3D < 0;
        const mid3D = module.moduleId || '';
        const hasInstalledDoor3D = !!moduleData.hasDoor && !!module.hasDoor;
        const externalMaidaDimensionSide3D = isExternalMaidaModule(mid3D)
          ? getExternalMaidaDimensionSide(module)
          : null;
        if (isExternalMaidaModule(mid3D) && !externalMaidaDimensionSide3D) return null;
        const hasExternalMaidaDimension3D = !!module.hasDoor
          && !!externalMaidaDimensionSide3D;
        // 치수선 X 위치: 도어/서랍 마이다 치수가 외부에 있으면 겹치지 않도록 좌/우측으로 조금 더 뺀다.
        const sideOffsetMm = (hasInstalledDoor3D || hasExternalMaidaDimension3D) ? 120 : 80;
        const sideX = showOnLeftSide
          ? (cxX3D - halfWidth - mmToThreeUnits(sideOffsetMm))
          : (cxX3D + halfWidth + mmToThreeUnits(sideOffsetMm));
        const textOffsetX = showOnLeftSide ? -mmToThreeUnits(40) : mmToThreeUnits(40);

        // 가구 Z 위치 (FurnitureItem과 동일 로직)
        const panelDepthMm3D = spaceInfo.depth || 600;
        const furnitureDepthMm3D = Math.min(panelDepthMm3D, 600);
        const doorThicknessMm3D = 20;
        const panelDepth3D = mmToThreeUnits(panelDepthMm3D);
        const furnitureDepth3D = mmToThreeUnits(furnitureDepthMm3D);
        const doorThickness3D = mmToThreeUnits(doorThicknessMm3D);
        const zOff3D = -panelDepth3D / 2;
        const furnitureZOffset3D = zOff3D + (panelDepth3D - furnitureDepth3D) / 2;
        const isFloating3D = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
        const baseDepthOffset3D = isFloating3D ? mmToThreeUnits(spaceInfo.baseConfig?.depth || 0) : 0;
        const moduleBackWallGapMm3D = (module as any).backWallGap ?? 0;
        const moduleBackWallGapZ3D = moduleBackWallGapMm3D > 0 ? mmToThreeUnits(moduleBackWallGapMm3D) : 0;
        const isShoeCab3D = (mid3D.includes('-entryway-') || mid3D.includes('-shelf-')
          || mid3D.includes('-4drawer-shelf-') || mid3D.includes('-2drawer-shelf-'));
        const isUpper3D = moduleData.category === 'upper' || mid3D.includes('upper-cabinet');

        // 도어분절 가구는 섹션별 깊이 중 최대값 사용 (sectionDepths > upperSectionDepth/lowerSectionDepth > customDepth)
        const isDoorSplit3D = mid3D.includes('shelf-split') || mid3D.includes('pantry-cabinet-split');
        const sectionDepthsArr = (module as any).sectionDepths as number[] | undefined;
        const maxSectionDepth = (sectionDepthsArr && sectionDepthsArr.length > 0)
          ? Math.max(...sectionDepthsArr.filter(d => typeof d === 'number' && d > 0))
          : 0;
        const actualDepthMm3D = isDoorSplit3D && maxSectionDepth > 0
          ? maxSectionDepth
          : (module.customDepth || module.upperSectionDepth || module.lowerSectionDepth || moduleData.dimensions.depth);
        const depth3D = mmToThreeUnits(actualDepthMm3D);

        let backZ3D: number;
        if (isUpper3D) {
          backZ3D = furnitureZOffset3D - furnitureDepth3D / 2 - doorThickness3D + moduleBackWallGapZ3D;
        } else if (isShoeCab3D) {
          backZ3D = furnitureZOffset3D - furnitureDepth3D / 2 - doorThickness3D + baseDepthOffset3D + moduleBackWallGapZ3D;
        } else {
          backZ3D = furnitureZOffset3D + furnitureDepth3D / 2 - doorThickness3D - depth3D + baseDepthOffset3D + moduleBackWallGapZ3D;
        }
        const frontZ3D = backZ3D + depth3D;

        // 치수선 Y 위치: 가구 바닥 라인 (다른 깊이 치수들과 동일하게 안정적 위치)
        const floorFinishMm3D = spaceInfo.hasFloorFinish && spaceInfo.floorFinish?.height ? spaceInfo.floorFinish.height : 0;
        const baseFrameMm3D = (module as any).hasBase === false ? 0
          : ((module as any).baseFrameHeight ?? (spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig?.height || 65) : 0));
        const floatMm3D = (module as any).hasBase === false ? ((module as any).individualFloatHeight ?? 0) : 0;
        const topFrameMm3D = (module as any).hasTopFrame === false
          ? ((module as any).topFrameGap ?? 0)
          : ((module as any).topFrameThickness ?? (spaceInfo.frameSize?.top ?? 30));
        const moduleHeightMm3D = isUpper3D
          ? (module.customHeight ?? module.freeHeight ?? moduleData.dimensions.height ?? 600)
          : (module.freeHeight ?? module.customHeight ?? moduleData.dimensions.height ?? 2200);
        const moduleBottomMm3D = isUpper3D
          ? Math.max(0, Math.round(spaceInfo.height - topFrameMm3D - moduleHeightMm3D))
          : (floorFinishMm3D + baseFrameMm3D + floatMm3D);
        // 가구 바닥 위치에 깊이 치수 배치 (탑뷰 좌측뷰의 spaceHeight와 같은 의미: 가구 base)
        const dimY3D = mmToThreeUnits(moduleBottomMm3D);

        // 텍스트 회전: 가구 측면에서 보았을 때 정상 방향으로 읽히도록 (탑뷰 깊이 치수와 같이 위에서 보는 형태)
        const textRotation: [number, number, number] = [-Math.PI / 2, 0, 0];

        const cabinetSideX = showOnLeftSide ? (cxX3D - halfWidth) : (cxX3D + halfWidth);

        return (
          <group key={`3d-depth-dim-${module.id}-${mIdx}`} name={`3d-depth-dim-${module.id}`}>
            {/* 깊이 치수선 (Z축 방향) — 기존 좌측뷰와 동일 스타일 */}
            <NativeLine name="3d-depth-dimension"
              points={[[sideX, dimY3D, backZ3D], [sideX, dimY3D, frontZ3D]]}
              color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={true}
            />
            <NativeLine name="3d-depth-dimension"
              points={createArrowHead([sideX, dimY3D, backZ3D], [sideX, dimY3D, backZ3D + 0.02], 0.01)}
              color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={true}
            />
            <NativeLine name="3d-depth-dimension"
              points={createArrowHead([sideX, dimY3D, frontZ3D], [sideX, dimY3D, frontZ3D - 0.02], 0.01)}
              color={dimensionColor} lineWidth={0.6} renderOrder={100000} depthTest={true}
            />
            {/* 깊이 텍스트 — 좌측뷰 깊이 라벨과 동일 스타일 (fontSize, color, rotation) */}
            <Text
              position={[sideX + textOffsetX, dimY3D + 0.1, (backZ3D + frontZ3D) / 2]}
              fontSize={baseFontSize}
              color={dimensionColor}
              anchorX="center"
              anchorY="middle"
              outlineWidth={textOutlineWidth}
              outlineColor={textOutlineColor}
              rotation={textRotation}
              renderOrder={100001}
              material-depthTest={true}
              material-transparent={true}
            >
              {Math.round(actualDepthMm3D)}
            </Text>
            {/* 연장선: 가구 측면 ~ 치수선까지 (탑뷰 좌측뷰와 동일) */}
            <NativeLine name="3d-depth-dimension-ext"
              points={[[cabinetSideX, dimY3D, backZ3D], [sideX, dimY3D, backZ3D]]}
              color={dimensionColor} renderOrder={100000} depthTest={true}
            />
            <NativeLine name="3d-depth-dimension-ext"
              points={[[cabinetSideX, dimY3D, frontZ3D], [sideX, dimY3D, frontZ3D]]}
              color={dimensionColor} renderOrder={100000} depthTest={true}
            />
          </group>
        );
      })}
      
      {/* 단내림 구간 경계선 및 가이드 - 2D 정면뷰에서는 숨김 */}
      {spaceInfo.droppedCeiling?.enabled && currentViewDirection === 'front' && false && (
        <group>
          {/* 단내림 구간 경계선 (수직선) */}
          <Line
            points={[
              [
                spaceInfo.droppedCeiling?.position === 'left' 
                  ? mmToThreeUnits(spaceInfo.droppedCeiling?.width || 0)
                  : mmToThreeUnits(spaceInfo.width - (spaceInfo.droppedCeiling?.width || 0)), 
                0, 
                0.001
              ],
              [
                spaceInfo.droppedCeiling?.position === 'left'
                  ? mmToThreeUnits(spaceInfo.droppedCeiling?.width || 0)
                  : mmToThreeUnits(spaceInfo.width - (spaceInfo.droppedCeiling?.width || 0)),
                mmToThreeUnits(spaceInfo.height),
                0.001
              ]
            ]}
            color={primaryColor}
            lineWidth={0.6}
            dashed
            dashSize={0.03}
            gapSize={0.02}
          />
          
          {/* 단내림 높이 표시선 (수평선) */}
          <Line
            points={[
              [
                spaceInfo.droppedCeiling?.position === 'left' ? 0 : mmToThreeUnits(spaceInfo.width - (spaceInfo.droppedCeiling?.width || 0)),
                mmToThreeUnits(spaceInfo.height - (spaceInfo.droppedCeiling?.dropHeight || 0)),
                0.001
              ],
              [
                spaceInfo.droppedCeiling?.position === 'left' 
                  ? mmToThreeUnits(spaceInfo.droppedCeiling?.width || 0)
                  : mmToThreeUnits(spaceInfo.width),
                mmToThreeUnits(spaceInfo.height - (spaceInfo.droppedCeiling?.dropHeight || 0)),
                0.001
              ]
            ]}
            color={primaryColor}
            lineWidth={0.6}
            dashed
            dashSize={0.02}
            gapSize={0.01}
          />
        </group>
      )}
    </group>
  );
};

export default CleanCAD2D;
