import React, { useRef, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { Line, Text, Html } from '@react-three/drei';
import NativeLine from './NativeLine';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useUIStore } from '@/store/uiStore';
import { useDerivedSpaceStore } from '@/store/derivedSpaceStore';
import { getModuleById } from '@/data/modules';
import { calculateSpaceIndexing } from '@/editor/shared/utils/indexing';
import { useViewerTheme } from '../../context/ViewerThemeContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { getDroppedZoneBounds, getNormalZoneBounds } from '@/editor/shared/utils/space/droppedCeilingUtils';
import { SpaceCalculator } from '@/editor/shared/utils/indexing/SpaceCalculator';
import { ColumnIndexer } from '@/editor/shared/utils/indexing/ColumnIndexer';
import { calculateFrameThickness, END_PANEL_THICKNESS } from '@/editor/shared/viewer3d/utils/geometry';
import { analyzeColumnSlots, calculateFurnitureBounds } from '@/editor/shared/utils/columnSlotProcessor';

interface CleanCAD2DProps {
  viewDirection?: '3D' | 'front' | 'left' | 'right' | 'top';
  showDimensions?: boolean;
  isStep2?: boolean;
}

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
            background: currentViewDirection === '3D'
              ? 'rgba(255, 255, 255, 0.98)'
              : 'rgba(255, 255, 255, 0.95)',
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
              border: '1px solid #ccc',
              borderRadius: '2px',
              fontSize: '12px',
              fontWeight: 'bold',
              textAlign: 'center',
              outline: 'none'
            }}
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
          <span style={{ 
            marginLeft: '4px', 
            fontSize: '12px', 
            fontWeight: 'bold',
            color: '#666'
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
          background: 'rgba(255, 255, 255, 0.95)',
          color: currentViewDirection === '3D' ? '#000000' : (finalColor === '#4CAF50' ? '#2E7D32' : '#2196F3'),
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
          console.log('🖱️ 라벨 클릭됨:', { columnId, side, currentValue });
          e.preventDefault();
          e.stopPropagation();
          e.nativeEvent?.preventDefault();
          e.nativeEvent?.stopPropagation();
          e.nativeEvent?.stopImmediatePropagation();
          handleColumnDistanceEdit(columnId, side, currentValue);
        }}
        onMouseDown={(e) => {
          console.log('🖱️ 마우스 다운:', { columnId, side, currentValue });
          e.preventDefault();
          e.stopPropagation();
          e.nativeEvent?.preventDefault();
          e.nativeEvent?.stopPropagation();
          e.nativeEvent?.stopImmediatePropagation();
        }}
        onMouseUp={(e) => {
          console.log('🖱️ 마우스 업:', { columnId, side, currentValue });
          e.preventDefault();
          e.stopPropagation();
          e.nativeEvent?.preventDefault();
          e.nativeEvent?.stopPropagation();
          e.nativeEvent?.stopImmediatePropagation();
        }}
        onTouchStart={(e) => {
          console.log('👆 터치 시작:', { columnId, side, currentValue });
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
 * 깔끔한 CAD 스타일 2D 뷰어 (그리드 없음)
 * 이미지와 동일한 스타일의 치수선과 가이드라인만 표시
 */
const CleanCAD2D: React.FC<CleanCAD2DProps> = ({ viewDirection, showDimensions: showDimensionsProp, isStep2 }) => {
  const { spaceInfo } = useSpaceConfigStore();
  const placedModulesStore = useFurnitureStore(state => state.placedModules);
  const showFurniture = useUIStore(state => state.showFurniture);
  const placedModules = useMemo(
    () => (showFurniture ? placedModulesStore : []),
    [placedModulesStore, showFurniture]
  );
  const { view2DDirection, showDimensions: showDimensionsFromStore, showDimensionsText, view2DTheme, selectedSlotIndex } = useUIStore();
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
    const [firstModule] = placedModules;
    if (!firstModule) return [];

    const leftmostModule = placedModules.reduce((min, module) =>
      module.position.x < min.position.x ? module : min,
      firstModule
    );

    return [leftmostModule];
  }, [showDimensions, placedModules]);

  const rightmostModules = useMemo(() => {
    if (!showDimensions || placedModules.length === 0) return [];
    const [firstModule] = placedModules;
    if (!firstModule) return [];

    const rightmostModule = placedModules.reduce((max, module) =>
      module.position.x > max.position.x ? module : max,
      firstModule
    );

    return [rightmostModule];
  }, [showDimensions, placedModules]);

  // 실제 뷰 방향 결정
  const currentViewDirection = viewDirection || view2DDirection;

  // 노서라운드 모드에서 가구 위치별 엔드패널 표시 여부 결정
  const indexing = calculateSpaceIndexing(spaceInfo);

  // 디버깅 로그 추가
  console.log('🔴 CleanCAD2D - indexing:', {
    columnCount: indexing.columnCount,
    columnWidth: indexing.columnWidth,
    internalWidth: indexing.internalWidth,
    mainDoorCount: spaceInfo.mainDoorCount,
    customColumnCount: spaceInfo.customColumnCount
  });
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
  
  const isFreePlacement = spaceInfo.layoutMode === 'free-placement';

  console.log('🎯 CleanCAD2D 전체 렌더링:', {
    showDimensionsProp,
    showDimensionsFromStore,
    showDimensions,
    viewDirection,
    isStep2,
    surroundType: spaceInfo.surroundType,
    installType: spaceInfo.installType,
    wallConfig: spaceInfo.wallConfig,
    '좌우치수표시조건': !isStep2
  });
  const { updateColumn, setSpaceInfo } = useSpaceConfigStore();
  const groupRef = useRef<THREE.Group>(null);

  // 가구 높이 배열을 추출하여 깊은 비교를 위한 의존성으로 사용
  const furnitureHeightKeys = useMemo(
    () => placedModules.map(m => `${m.id}-${m.moduleId}-${m.customHeight || 0}`).join(','),
    [placedModules]
  );

  // 가구 높이 계산을 useMemo로 메모이제이션 - placedModules 변경 시 자동 업데이트
  const furnitureHeights = useMemo(() => {
    console.log('🔄 furnitureHeights 재계산 중...', { furnitureHeightKeys });

    const frameSize = spaceInfo.frameSize || { left: 50, right: 50, top: 50 };
    const topFrameHeight = frameSize.top ?? 0;
    const floorFinishHeightMm = spaceInfo.hasFloorFinish && spaceInfo.floorFinish ? spaceInfo.floorFinish.height : 0;
    const bottomFrameHeight = spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig.height || 65) : 0;
    const isFloating = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
    const floatHeight = isFloating ? (spaceInfo.baseConfig?.floatHeight || 0) : 0;

    let maxLowerCabinetHeightMm = 0;
    let maxUpperCabinetHeightMm = 0;

    if (placedModules.length > 0) {
      placedModules.forEach(module => {
        const moduleData = getModuleById(module.moduleId);
        if (moduleData) {
          const moduleHeight = module.customHeight ?? moduleData.dimensions.height;

          // 상하부장 분류
          if (moduleData.category === 'lower' && moduleHeight > maxLowerCabinetHeightMm) {
            maxLowerCabinetHeightMm = moduleHeight;
          }
          if (moduleData.category === 'upper' && moduleHeight > maxUpperCabinetHeightMm) {
            maxUpperCabinetHeightMm = moduleHeight;
          }
        }
      });
    }

    // 띄움 배치 시 상부섹션 높이 조정
    const adjustedUpperCabinetHeightMm = isFloating && maxUpperCabinetHeightMm > 0
      ? maxUpperCabinetHeightMm - (floatHeight - bottomFrameHeight)
      : 0;

    console.log('✅ furnitureHeights 계산 완료:', {
      maxLowerCabinetHeightMm,
      maxUpperCabinetHeightMm,
      adjustedUpperCabinetHeightMm,
      isFloating,
      floatHeight
    });

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
  const [editingGapSide, setEditingGapSide] = useState<'left' | 'right' | 'middle' | null>(null);
  const [editingGapValue, setEditingGapValue] = useState<string>('');
  const gapInputRef = useRef<HTMLInputElement>(null);

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
  const guideColor = currentViewDirection === '3D' ? '#888888' : (view2DTheme === 'dark' ? '#cccccc' : '#000000');  // 2D: 라이트-검정, 다크-밝은회색
  const subGuideColor = currentViewDirection === '3D' ? '#bbbbbb' : (view2DTheme === 'dark' ? '#888888' : '#000000');  // 2D: 라이트-검정, 다크-중간회색
  const gridColor = currentViewDirection === '3D' 
    ? primaryColor  // 3D에서는 테마 색상 사용
    : getThemeColorFromCSS('--theme-border', '#e5e7eb');  // 2D에서는 border 색상
  
  // 프레임 치수 색상 - 다른 치수와 동일하게 통일
  const frameDimensionColor = dimensionColor;

  // 기둥 간격 편집 핸들러
  const handleColumnDistanceEdit = (columnId: string, side: 'left' | 'right' | 'width', currentValue: number) => {
    console.log('🖱️ 기둥 간격 편집 시작:', { columnId, side, currentValue });
    
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
      setEditingValue(Math.round(currentValue).toString());
    }, 50);
  };

  const handleEditComplete = () => {
    if (!editingColumnId || !editingSide) return;
    
    const value = parseInt(editingValue) || 0;
    const column = spaceInfo.columns?.find(col => col.id === editingColumnId);
    
    if (!column) return;

    console.log('✅ 편집 완료:', { columnId: editingColumnId, side: editingSide, value });

    const spaceWidthM = spaceInfo.width * 0.01;
    const columnWidthM = column.width * 0.01;

    if (editingSide === 'left') {
      // 왼쪽 벽과 기둥 좌측면 사이의 간격
      const newX = -(spaceWidthM / 2) + (value * 0.01) + (columnWidthM / 2);
      updateColumn(editingColumnId, { position: [newX, column.position[1], column.position[2]] });
    } else if (editingSide === 'right') {
      // 오른쪽 벽과 기둥 우측면 사이의 간격
      const newX = (spaceWidthM / 2) - (value * 0.01) - (columnWidthM / 2);
      updateColumn(editingColumnId, { position: [newX, column.position[1], column.position[2]] });
    } else if (editingSide === 'width') {
      // 기둥 너비 변경
      updateColumn(editingColumnId, { width: value });
    }

    setEditingColumnId(null);
    setEditingSide(null);
    setEditingValue('');
  };

  const handleEditCancel = () => {
    console.log('❌ 편집 취소');
    setEditingColumnId(null);
    setEditingSide(null);
    setEditingValue('');
  };

  // handleEditSubmit 함수 추가 (EditableLabel에서 사용)
  const handleEditSubmit = () => {
    handleEditComplete();
  };

  // 이격거리 편집 핸들러
  const handleGapEdit = (side: 'left' | 'right' | 'middle', currentValue: number) => {
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
    // middle(경계면 이격)은 0~5mm, left/right는 0~50mm
    const maxValue = editingGapSide === 'middle' ? 5 : 50;
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

  // mm를 Three.js 단위로 변환 (furnitureDimensions에서 사용하기 위해 먼저 선언)
  const mmToThreeUnits = (mm: number) => mm * 0.01;
  const threeUnitsToMm = (units: number) => units * 100;
  
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
          lineWidth={1.5}
        />
        
        {/* 우측 원 */}
        <Line
          points={createCircle(symbolSize / 3, symbolSize / 4, 0)}
          color="#FF6B00"
          lineWidth={1.5}
        />
        
        {/* 하단 호 */}
        <Line
          points={createArc(0, -symbolSize / 4, 0)}
          color="#FF6B00"
          lineWidth={1.5}
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
          const fbCategory = module.moduleId.includes('-upper-') ? 'upper'
            : module.moduleId.includes('-lower-') ? 'lower' : 'full';
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
            moduleLeft: mX - fbW / 2,
            moduleRight: mX + fbW / 2,
            nearestLeftDistance: 0,
            nearestRightDistance: 0,
            leftBoundaryDistance: 0,
            rightBoundaryDistance: 0,
            isSpacerHandled: false,
            hasStepDown: hasStepDownFb,
            stepDownPosition: stepDownPositionFb,
          };
        }
        return null;
      }

      // 단내림 여부 확인
      const hasStepDown = spaceInfo.droppedCeiling?.enabled || false;
      const stepDownWidth = spaceInfo.droppedCeiling?.width || 0;
      const stepDownPosition = spaceInfo.droppedCeiling?.position || 'right';
      
      // 기둥 슬롯 분석
      const columnSlots = analyzeColumnSlots(spaceInfo);
      const slotInfo = module.slotIndex !== undefined ? columnSlots[module.slotIndex] : undefined;
      const indexing = calculateSpaceIndexing(spaceInfo);
      
      // 기본 너비 설정 - 자유배치 가구는 freeWidth 우선, 그 외 customWidth 우선
      // slotInfo.availableWidth는 이격거리가 반영된 실제 슬롯 너비
      const slotAvailableWidth = slotInfo?.availableWidth;
      let actualWidth = (module.isFreePlacement && module.freeWidth)
        ? module.freeWidth
        : (module.customWidth || module.adjustedWidth || slotAvailableWidth || moduleData.dimensions.width);
      let actualPositionX = module.position.x;
      
      // 커스텀 깊이가 있는 경우 전용 가구로 취급
      const actualDepth = module.customDepth || moduleData.dimensions.depth;
      const hasCustomDepth = module.customDepth && module.customDepth !== moduleData.dimensions.depth;
      
      // customWidth가 있으면 우선 사용 (이미 위에서 처리됨)
      // adjustedWidth는 두 번째 우선순위 (이미 위에서 처리됨)
      
      // 실제 X 위치
      const moduleX = actualPositionX;
      const moduleY = spaceHeight / 2;
      
      // 모듈 왼쪽 및 오른쪽 끝 계산
      const moduleLeft = moduleX - actualWidth / 2;
      const moduleRight = moduleX + actualWidth / 2;
      
      // 단내림 구간 영역 계산
      const stepDownStartX = stepDownPosition === 'left' 
        ? -(spaceInfo.width * 0.01) / 2 
        : (spaceInfo.width * 0.01) / 2 - (stepDownWidth * 0.01);
      const stepDownEndX = stepDownPosition === 'left'
        ? -(spaceInfo.width * 0.01) / 2 + (stepDownWidth * 0.01)
        : (spaceInfo.width * 0.01) / 2;
      
      // 스페이서 처리 
      const SPACER_WIDTH = 36; // 36mm 스페이서
      const isSpacerModule = moduleData.name && moduleData.name.includes('스페이서');
      
      // 36mm 스페이서일 때만 처리
      const isSpacerHandled = isSpacerModule && actualWidth === SPACER_WIDTH;
      
      // 양쪽에서 가장 가까운 컬럼/벽까지의 거리 계산
      let nearestLeftDistance = 0;
      let nearestRightDistance = 0;
      
      if (slotInfo && slotInfo.wallPositions) {
        // 슬롯 정보가 있을 때는 슬롯의 벽 위치 사용
        nearestLeftDistance = Math.abs(moduleLeft * 100 - slotInfo.wallPositions.left);
        nearestRightDistance = Math.abs(slotInfo.wallPositions.right - moduleRight * 100);
      } else {
        // 슬롯 정보가 없을 때는 직접 계산
        const moduleLeftMm = moduleLeft * 100;
        const moduleRightMm = moduleRight * 100;
        
        // 좌측 거리 계산
        nearestLeftDistance = Math.abs(moduleLeftMm - (-spaceInfo.width / 2));
        
        // 우측 거리 계산  
        nearestRightDistance = Math.abs(spaceInfo.width / 2 - moduleRightMm);
      }
      
      // 단내림 구간과의 경계 치수
      let leftBoundaryDistance = 0;
      let rightBoundaryDistance = 0;
      
      if (hasStepDown) {
        // 단내림 구간 경계 계산
        const stepDownBoundaryX = stepDownPosition === 'left' ? stepDownEndX : stepDownStartX;
        
        // 가구와 단내림 경계 사이의 거리 계산
        if (stepDownPosition === 'left') {
          // 왼쪽 단내림일 때 - 가구 왼쪽과 단내림 우측 경계 사이 거리
          leftBoundaryDistance = Math.abs((moduleLeft - stepDownBoundaryX) * 100);
        } else {
          // 오른쪽 단내림일 때 - 가구 오른쪽과 단내림 좌측 경계 사이 거리
          rightBoundaryDistance = Math.abs((stepDownBoundaryX - moduleRight) * 100);
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
        isSpacerHandled,
        hasStepDown,
        stepDownPosition
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
  }, [currentViewDirection, showDimensions, placedModules.length, JSON.stringify(placedModules.map(m => ({ id: m.id, moduleId: m.moduleId, customDepth: m.customDepth, upperSectionDepth: m.upperSectionDepth, lowerSectionDepth: m.lowerSectionDepth, position: m.position }))), JSON.stringify(spaceInfo.columns?.map(col => ({ id: col.id, position: col.position, width: col.width, height: col.height, depth: col.depth })))]); // placedModules와 columns 변경사항을 세밀하게 감지
  
  // 치수 표시가 비활성화된 경우에도 기둥은 렌더링 (hooks 호출 후에 체크)
  // showDimensions가 false일 때는 치수선은 숨기지만 기둥은 표시
  
  // 폰트 크기 - 3D에서 더 크게 표시
  const baseFontSize = currentViewDirection === '3D' ? 0.5 : 0.4;
  const largeFontSize = currentViewDirection === '3D' ? 0.6 : 0.5;
  const smallFontSize = currentViewDirection === '3D' ? 0.42 : 0.35;
  // 3D 텍스트 외곽선 (배경과 구분되게)
  const textOutlineWidth = currentViewDirection === '3D' ? 0.06 : 0;
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

  // 치수선 균등 간격 배치 (단내림 있으면 4단, 없으면 3단)
  const DIM_GAP = 120; // 치수선 간 간격 120mm (균등)
  const dimLevels = hasDroppedCeiling ? 4 : 3;
  // 1단계: 전체 너비 (3600) - 가장 위
  const topDimensionY = spaceHeight + mmToThreeUnits(DIM_GAP * dimLevels);
  // 2단계 (단내림 시): 내부 너비 합산 (3597) - 전체 폭 바로 아래
  const columnDimensionY = spaceHeight + mmToThreeUnits(DIM_GAP * (dimLevels - 1));
  // 3단계 (단내림 시 3, 아니면 2): 메인구간 + 단내림구간 치수 - 개별 슬롯 바로 위
  const zoneDimensionY = spaceHeight + mmToThreeUnits(DIM_GAP * (dimLevels - 2));
  // 4단계 (단내림 시 4, 아니면 3): 개별 슬롯 너비 - 가장 아래
  const slotDimensionY = spaceHeight + mmToThreeUnits(DIM_GAP);
  const leftDimensionX = -mmToThreeUnits(200); // 좌측 치수선 (균형감을 위해 200으로 고정)

  // 좌측 오프셋 (가로 공간치수의 절반)
  const leftOffset = -mmToThreeUnits(spaceInfo.width / 2);

  // 프레임 사이즈 정보
  const frameSize = spaceInfo.frameSize || { left: 50, right: 50, top: 50 };
  
  // 디버깅 로그
  console.log('🔍 CleanCAD2D Debug:', {
    spaceWidth: spaceInfo.width,
    droppedCeilingEnabled: spaceInfo.droppedCeiling?.enabled,
    droppedCeilingWidth: spaceInfo.droppedCeiling?.width,
    droppedCeilingPosition: spaceInfo.droppedCeiling?.position,
    frameSize,
    leftOffset,
    normalBoundsWidth: spaceInfo.width - (spaceInfo.droppedCeiling?.width || 0),
    droppedBoundsWidth: spaceInfo.droppedCeiling?.width || 0
  });
  
  // 화살표 생성 함수
  const createArrowHead = (start: [number, number, number], end: [number, number, number], size = 0.015) => {
    const direction = new THREE.Vector3(end[0] - start[0], end[1] - start[1], end[2] - start[2]).normalize();
    const perpendicular = new THREE.Vector3(-direction.y, direction.x, 0).multiplyScalar(size);
    
    return [
      [start[0] + direction.x * size + perpendicular.x, start[1] + direction.y * size + perpendicular.y, start[2]],
      start,
      [start[0] + direction.x * size - perpendicular.x, start[1] + direction.y * size - perpendicular.y, start[2]]
    ] as [number, number, number][];
  };

  // 뷰 방향별 치수선 렌더링
  const renderDimensions = () => {
    // showDimensions가 false이면 렌더링 안 함
    console.log('🔵 renderDimensions called:', { showDimensions, currentViewDirection });
    if (!showDimensions) {
      console.log('❌ showDimensions is false, returning null');
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
  const zOffset = is3DMode ? frontFrameZ : 0; // 3D 모드에서 가구 앞면 위치로 배치
  
  const renderFrontView = () => (
    <group position={[0, 0, zOffset]} renderOrder={9999}>
      {/* 단내림 구간 표시 (기둥처럼) - 2D 모드에서만 */}
      {spaceInfo.droppedCeiling?.enabled && currentViewDirection !== '3D' && (() => {
        const droppedWidth = mmToThreeUnits(spaceInfo.droppedCeiling.width || 900);
        const droppedHeight = mmToThreeUnits(spaceInfo.droppedCeiling.dropHeight || 200);
        const totalHeight = mmToThreeUnits(spaceInfo.height);
        const normalHeight = totalHeight - droppedHeight;

        const droppedStartX = spaceInfo.droppedCeiling.position === 'left'
          ? leftOffset
          : leftOffset + mmToThreeUnits(spaceInfo.width - (spaceInfo.droppedCeiling.width || 900));
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
          const endY = totalHeight;

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
          if (clippedStartX < droppedEndX && clippedEndX > droppedStartX &&
              clippedStartY < totalHeight && clippedEndY > normalHeight) {
            hatchLines.push(
              <Line
                key={`hatch-${i}`}
                points={[[clippedStartX, clippedStartY, 0.001], [clippedEndX, clippedEndY, 0.001]]}
                color={theme === 'dark' ? '#FFD700' : '#999999'}
                lineWidth={0.5}
                opacity={0.6}
              />
            );
          }
        }

        return (
          <group>
            {/* 회색 반투명 배경 메쉬 */}
            <mesh position={[(droppedStartX + droppedEndX) / 2, (normalHeight + totalHeight) / 2, 0.0005]}>
              <planeGeometry args={[droppedWidth, droppedHeight]} />
              <meshBasicMaterial color="#999999" transparent opacity={0.15} depthTest={false} />
            </mesh>

            {/* 단내림 구간 경계선 */}
            <Line
              points={[[droppedStartX, normalHeight, 0.002], [droppedStartX, totalHeight, 0.002]]}
              color={theme === 'dark' ? '#FFD700' : '#999999'}
              lineWidth={0.8}
            />
            <Line
              points={[[droppedEndX, normalHeight, 0.002], [droppedEndX, totalHeight, 0.002]]}
              color={theme === 'dark' ? '#FFD700' : '#999999'}
              lineWidth={0.8}
            />
            <Line
              points={[[droppedStartX, normalHeight, 0.002], [droppedEndX, normalHeight, 0.002]]}
              color={theme === 'dark' ? '#FFD700' : '#999999'}
              lineWidth={0.8}
            />

            {/* 해칭 패턴 */}
            {hatchLines}
          </group>
        );
      })()}

      {/* 정면도 치수선들 */}
      {showDimensions && (
        <>
          {/* 상단 전체 프레임 포함 폭 치수선 - 항상 공간 너비 표시 */}
          <group>
        {(() => {
          const actualLeftEdge = leftOffset;
          const actualRightEdge = mmToThreeUnits(spaceInfo.width) + leftOffset;
          const displayWidth = spaceInfo.width;

          return (
            <>
              {/* 치수선 */}
              <NativeLine name="dimension_line"
                points={[[actualLeftEdge, topDimensionY, 0.002], [actualRightEdge, topDimensionY, 0.002]]}
                color={dimensionColor}
                lineWidth={1}
                renderOrder={100000}
                depthTest={false}
              />

              {/* 좌측 화살표 */}
              <NativeLine name="dimension_line"
                points={createArrowHead([actualLeftEdge, topDimensionY, 0.002], [actualLeftEdge + 0.05, topDimensionY, 0.002])}
                color={dimensionColor}
                lineWidth={1}
                renderOrder={100000}
                depthTest={false}
              />

              {/* 우측 화살표 */}
              <NativeLine name="dimension_line"
                points={createArrowHead([actualRightEdge, topDimensionY, 0.002], [actualRightEdge - 0.05, topDimensionY, 0.002])}
                color={dimensionColor}
                lineWidth={1}
                renderOrder={100000}
                depthTest={false}
              />

              {/* 전체 폭 치수 텍스트 */}
              {(showDimensionsText || isStep2) && (
                <Text
                  renderOrder={1000}
                  depthTest={false}
                  position={[(actualLeftEdge + actualRightEdge) / 2, topDimensionY + mmToThreeUnits(40), 0.01]}
                  fontSize={largeFontSize}
                  color={textColor}
                  anchorX="center"
                  anchorY="middle"
                  outlineWidth={textOutlineWidth}
                  outlineColor={textOutlineColor}
                >
                  {Math.round(displayWidth)}
                </Text>
              )}

              {/* 연장선 (좌측 프레임) */}
              <NativeLine name="dimension_line"
                points={[[actualLeftEdge, 0, 0.001], [actualLeftEdge, topDimensionY + mmToThreeUnits(40), 0.001]]}
                color={dimensionColor}
                lineWidth={1}
                renderOrder={100000}
                depthTest={false}
              />

              {/* 연장선 (우측 프레임) */}
              <NativeLine name="dimension_line"
                points={[[actualRightEdge, 0, 0.001], [actualRightEdge, topDimensionY + mmToThreeUnits(40), 0.001]]}
                color={dimensionColor}
                lineWidth={1}
                renderOrder={100000}
                depthTest={false}
              />
            </>
          );
        })()}
      </group>

      {/* 노서라운드 모드 좌측 엔드패널/이격거리 치수선 */}
      {showDimensions && !isStep2 && spaceInfo.surroundType === 'no-surround' && (isFreePlacement || hasLeftFurniture) && (() => {
        const frameThickness = calculateFrameThickness(spaceInfo, hasLeftFurniture, hasRightFurniture);

        // 왼쪽 벽이 있는지 확인
        const hasLeftWall = spaceInfo.wallConfig?.left;

        // 자유배치 모드에서는 이격거리(벽이 있을 때)만 표시, 엔드패널은 숨김
        if (isFreePlacement && !hasLeftWall) return null;

        // 왼쪽 엔드패널 값 결정
        let leftValue: number;
        let leftText: string;

        if (hasLeftWall) {
          // 왼쪽 벽이 있으면 이격거리 표시
          leftValue = spaceInfo.gapConfig?.left ?? 1.5;
          leftText = `이격 ${leftValue}`;
        } else {
          // 왼쪽 벽이 없으면 엔드패널 표시
          leftValue = frameThickness.left > 0 ? frameThickness.left : END_PANEL_THICKNESS;
          leftText = `${leftValue}`;
        }

        // 이격거리가 0이면 표시하지 않음
        if (leftValue === 0) return null;

        return (
          <group>
            {/* 치수선 */}
            <Line
              points={[[leftOffset, topDimensionY - mmToThreeUnits(120), 0.002], [leftOffset + mmToThreeUnits(leftValue), topDimensionY - mmToThreeUnits(120), 0.002]]}
              color={dimensionColor}
              lineWidth={1}
            />
            
            {/* 좌측 화살표 */}
            <Line
              points={createArrowHead([leftOffset, topDimensionY - mmToThreeUnits(120), 0.002], [leftOffset + 0.02, topDimensionY - mmToThreeUnits(120), 0.002])}
              color={dimensionColor}
              lineWidth={1}
            />
            
            {/* 우측 화살표 */}
            <Line
              points={createArrowHead([leftOffset + mmToThreeUnits(leftValue), topDimensionY - mmToThreeUnits(120), 0.002], [leftOffset + mmToThreeUnits(leftValue) - 0.02, topDimensionY - mmToThreeUnits(120), 0.002])}
              color={dimensionColor}
              lineWidth={1}
            />
            
            {/* 좌측 치수 텍스트 - 이격거리 클릭 편집 */}
            {hasLeftWall && editingGapSide === 'left' ? (
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
                    style={{ width: '50px', padding: '2px 4px', border: '1px solid #ccc', borderRadius: '2px', fontSize: '12px', fontWeight: 'bold', textAlign: 'center', outline: 'none', background: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#1f2937' : '#fff', color: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#fff' : '#000' }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span style={{ marginLeft: '2px', fontSize: '11px', color: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#9ca3af' : '#666' }}>mm</span>
                </div>
              </Html>
            ) : (
              <Html
                position={[leftOffset + mmToThreeUnits(leftValue) / 2, topDimensionY - mmToThreeUnits(150), 0.01]}
                center
                style={{ pointerEvents: hasLeftWall ? 'auto' : 'none' }}
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
                    background: hasLeftWall ? (currentViewDirection !== '3D' && view2DTheme === 'dark' ? 'rgba(31,41,55,0.7)' : 'rgba(255,255,255,0.7)') : 'transparent',
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
              points={[[leftOffset, spaceHeight, 0.001], [leftOffset, topDimensionY - mmToThreeUnits(100), 0.001]]}
              color={dimensionColor}
              lineWidth={0.5}
            />
            <Line
              points={[[leftOffset + mmToThreeUnits(leftValue), spaceHeight, 0.001], [leftOffset + mmToThreeUnits(leftValue), topDimensionY - mmToThreeUnits(100), 0.001]]}
              color={dimensionColor}
              lineWidth={0.5}
            />
          </group>
        );
      })()}
      
      {/* 노서라운드 모드 우측 엔드패널/이격거리 치수선 */}
      {showDimensions && !isStep2 && spaceInfo.surroundType === 'no-surround' && (isFreePlacement || hasRightFurniture) && (() => {
        const frameThickness = calculateFrameThickness(spaceInfo, hasLeftFurniture, hasRightFurniture);

        // 오른쪽 벽이 있는지 확인
        const hasRightWall = spaceInfo.wallConfig?.right;

        // 자유배치 모드에서는 이격거리(벽이 있을 때)만 표시, 엔드패널은 숨김
        if (isFreePlacement && !hasRightWall) return null;

        // 오른쪽 엔드패널 값 결정
        let rightValue: number;
        let rightText: string;

        if (hasRightWall) {
          // 오른쪽 벽이 있으면 이격거리 표시
          rightValue = spaceInfo.gapConfig?.right ?? 1.5;
          rightText = `이격 ${rightValue}`;
        } else {
          // 오른쪽 벽이 없으면 엔드패널 표시
          rightValue = frameThickness.right > 0 ? frameThickness.right : END_PANEL_THICKNESS;
          rightText = `${rightValue}`;
        }

        // 이격거리가 0이면 표시하지 않음
        if (rightValue === 0) return null;

        const rightEdge = mmToThreeUnits(spaceInfo.width) + leftOffset;

        return (
          <group>
            {/* 치수선 */}
            <NativeLine name="dimension_line"
              points={[[rightEdge - mmToThreeUnits(rightValue), topDimensionY - mmToThreeUnits(120), 0.002], [rightEdge, topDimensionY - mmToThreeUnits(120), 0.002]]}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={100000}
              depthTest={false}
            />

            {/* 좌측 화살표 */}
            <NativeLine name="dimension_line"
              points={createArrowHead([rightEdge - mmToThreeUnits(rightValue), topDimensionY - mmToThreeUnits(120), 0.002], [rightEdge - mmToThreeUnits(rightValue) + 0.02, topDimensionY - mmToThreeUnits(120), 0.002])}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={100000}
              depthTest={false}
            />

            {/* 우측 화살표 */}
            <NativeLine name="dimension_line"
              points={createArrowHead([rightEdge, topDimensionY - mmToThreeUnits(120), 0.002], [rightEdge - 0.02, topDimensionY - mmToThreeUnits(120), 0.002])}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={100000}
              depthTest={false}
            />
            
            {/* 우측 치수 텍스트 - 이격거리 클릭 편집 */}
            {hasRightWall && editingGapSide === 'right' ? (
              <Html
                position={[rightEdge - mmToThreeUnits(rightValue) / 2, topDimensionY - mmToThreeUnits(150), 0.01]}
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
                    style={{ width: '50px', padding: '2px 4px', border: '1px solid #ccc', borderRadius: '2px', fontSize: '12px', fontWeight: 'bold', textAlign: 'center', outline: 'none', background: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#1f2937' : '#fff', color: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#fff' : '#000' }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span style={{ marginLeft: '2px', fontSize: '11px', color: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#9ca3af' : '#666' }}>mm</span>
                </div>
              </Html>
            ) : (
              <Html
                position={[rightEdge - mmToThreeUnits(rightValue) / 2, topDimensionY - mmToThreeUnits(150), 0.01]}
                center
                style={{ pointerEvents: hasRightWall ? 'auto' : 'none' }}
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
                    background: hasRightWall ? (currentViewDirection !== '3D' && view2DTheme === 'dark' ? 'rgba(31,41,55,0.7)' : 'rgba(255,255,255,0.7)') : 'transparent',
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
              points={[[rightEdge - mmToThreeUnits(rightValue), spaceHeight, 0.001], [rightEdge - mmToThreeUnits(rightValue), topDimensionY - mmToThreeUnits(100), 0.001]]}
              color={dimensionColor}
              lineWidth={0.5}
            />
            <Line
              points={[[rightEdge, spaceHeight, 0.001], [rightEdge, topDimensionY - mmToThreeUnits(100), 0.001]]}
              color={dimensionColor}
              lineWidth={0.5}
            />
          </group>
        );
      })()}

      {/* 단내림 구간 치수선 - 전체 폭 치수선 아래에 표시 (탑뷰가 아닐 때만) */}
      {showDimensions && spaceInfo.droppedCeiling?.enabled && currentViewDirection !== 'top' && (
        <group>
          {(() => {
            const normalBounds = getNormalZoneBounds(spaceInfo);
            const droppedBounds = getDroppedZoneBounds(spaceInfo);
            const subDimensionY = zoneDimensionY; // 메인/단내림 구간 전용 Y 레벨
            
            // 프레임 두께 계산
            const frameThickness = calculateFrameThickness(spaceInfo, hasLeftFurniture, hasRightFurniture);
            
            // 프레임을 포함한 전체 좌표 계산
            const mainWidth = spaceInfo.width - spaceInfo.droppedCeiling.width;
            const droppedWidth = spaceInfo.droppedCeiling.width;
            
            // 메인 구간 치수선
            const mainStartX = spaceInfo.droppedCeiling.position === 'left' 
              ? leftOffset + mmToThreeUnits(droppedWidth)
              : leftOffset;
            const mainEndX = spaceInfo.droppedCeiling.position === 'left'
              ? leftOffset + mmToThreeUnits(spaceInfo.width)
              : leftOffset + mmToThreeUnits(mainWidth);
            
            // 단내림 구간 치수선
            const droppedStartX = spaceInfo.droppedCeiling.position === 'left'
              ? leftOffset
              : leftOffset + mmToThreeUnits(mainWidth);
            const droppedEndX = spaceInfo.droppedCeiling.position === 'left'
              ? leftOffset + mmToThreeUnits(droppedWidth)
              : leftOffset + mmToThreeUnits(spaceInfo.width);
            
            return (
              <>
                {/* 메인 구간 치수선 */}
                <Line
                  points={[[mainStartX, subDimensionY, 0.002], [mainEndX, subDimensionY, 0.002]]}
                  color={dimensionColor}
                  lineWidth={1}
                />
                <Line
                  points={createArrowHead([mainStartX, subDimensionY, 0.002], [mainStartX + 0.05, subDimensionY, 0.002])}
                  color={dimensionColor}
                  lineWidth={1}
                />
                <Line
                  points={createArrowHead([mainEndX, subDimensionY, 0.002], [mainEndX - 0.05, subDimensionY, 0.002])}
                  color={dimensionColor}
                  lineWidth={1}
                />
                {(showDimensionsText || isStep2) && (
                  <Text
                  renderOrder={1000}
                  depthTest={false}
                    position={[(mainStartX + mainEndX) / 2, subDimensionY + mmToThreeUnits(30), 0.01]}
                    fontSize={smallFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                  >
                    {(() => {
                      // 노서라운드일 때 실제 축소값 계산
                      let leftReduction = frameThickness.left;
                      let rightReduction = frameThickness.right;
                      
                      if (spaceInfo.surroundType === 'no-surround') {
                        if (spaceInfo.installType === 'builtin') {
                          // 양쪽벽: 설정된 이격거리 사용
                          leftReduction = spaceInfo.gapConfig?.left ?? 1.5;
                          rightReduction = spaceInfo.gapConfig?.right ?? 1.5;
                        } else if (spaceInfo.installType === 'semistanding') {
                          if (spaceInfo.wallConfig?.left) {
                            leftReduction = spaceInfo.gapConfig?.left ?? 1.5;
                            rightReduction = 20;
                          } else {
                            leftReduction = 20;
                            rightReduction = spaceInfo.gapConfig?.right ?? 1.5;
                          }
                        } else if (spaceInfo.installType === 'freestanding') {
                          // 벽없음: 슬롯은 엔드패널 포함, reduction 없음
                          leftReduction = 0;
                          rightReduction = 0;
                        }
                      }

                      // ColumnIndexer의 실제 계산된 너비 사용
                      const zoneSlotInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
                      return Math.round(zoneSlotInfo.normal.width);
                    })()}
                  </Text>
                )}

                {/* 단내림 구간 치수선 */}
                <Line
                  points={[[droppedStartX, subDimensionY, 0.002], [droppedEndX, subDimensionY, 0.002]]}
                  color={dimensionColor}
                  lineWidth={1}
                />
                <Line
                  points={createArrowHead([droppedStartX, subDimensionY, 0.002], [droppedStartX + 0.05, subDimensionY, 0.002])}
                  color={dimensionColor}
                  lineWidth={1}
                />
                <Line
                  points={createArrowHead([droppedEndX, subDimensionY, 0.002], [droppedEndX - 0.05, subDimensionY, 0.002])}
                  color={dimensionColor}
                  lineWidth={1}
                />
                {(showDimensionsText || isStep2) && (
                  <Text
                  renderOrder={1000}
                  depthTest={false}
                    position={[(droppedStartX + droppedEndX) / 2, subDimensionY + mmToThreeUnits(30), 0.01]}
                    fontSize={smallFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                  >
                    {(() => {
                      // 노서라운드일 때 실제 축소값 계산
                      let leftReduction = frameThickness.left;
                      let rightReduction = frameThickness.right;

                      if (spaceInfo.surroundType === 'no-surround') {
                        if (spaceInfo.installType === 'builtin') {
                          // 양쪽벽: 설정된 이격거리 사용
                          leftReduction = spaceInfo.gapConfig?.left ?? 1.5;
                          rightReduction = spaceInfo.gapConfig?.right ?? 1.5;
                        } else if (spaceInfo.installType === 'semistanding') {
                          if (spaceInfo.wallConfig?.left) {
                            leftReduction = spaceInfo.gapConfig?.left ?? 1.5;
                            rightReduction = 20;
                          } else {
                            leftReduction = 20;
                            rightReduction = spaceInfo.gapConfig?.right ?? 1.5;
                          }
                        } else if (spaceInfo.installType === 'freestanding') {
                          // 벽없음: 슬롯은 엔드패널 포함, reduction 없음
                          leftReduction = 0;
                          rightReduction = 0;
                        }
                      }

                      // ColumnIndexer의 실제 계산된 너비 사용
                      const zoneSlotInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
                      return Math.round(zoneSlotInfo.dropped?.width || spaceInfo.droppedCeiling.width);
                    })()}
                  </Text>
                )}
                
                {/* 구간 분리 가이드라인 - 숨김 처리 */}
                {/* <Line
                  points={[
                    [spaceInfo.droppedCeiling.position === 'left' ? mmToThreeUnits(droppedBounds.width) + leftOffset : mmToThreeUnits(normalBounds.width) + leftOffset, 0, 0.001],
                    [spaceInfo.droppedCeiling.position === 'left' ? mmToThreeUnits(droppedBounds.width) + leftOffset : mmToThreeUnits(normalBounds.width) + leftOffset, subDimensionY - mmToThreeUnits(40), 0.001]
                  ]}
                  color={subGuideColor}
                  lineWidth={1}
                  dashed
                /> */}
                
                {/* 메인 구간 연장선 (치수선에서 벽면까지) */}
                <Line
                  points={[
                    [mainStartX, subDimensionY - mmToThreeUnits(40), 0.001],
                    [mainStartX, subDimensionY + mmToThreeUnits(10), 0.001]
                  ]}
                  color={subGuideColor}
                  lineWidth={1}
                />
                <Line
                  points={[
                    [mainEndX, subDimensionY - mmToThreeUnits(40), 0.001],
                    [mainEndX, subDimensionY + mmToThreeUnits(10), 0.001]
                  ]}
                  color={subGuideColor}
                  lineWidth={1}
                />
                
                {/* 단내림 구간 연장선 (치수선에서 벽면까지) */}
                <Line
                  points={[
                    [droppedStartX, subDimensionY - mmToThreeUnits(40), 0.001],
                    [droppedStartX, subDimensionY + mmToThreeUnits(10), 0.001]
                  ]}
                  color={subGuideColor}
                  lineWidth={1}
                />
                <Line
                  points={[
                    [droppedEndX, subDimensionY - mmToThreeUnits(40), 0.001],
                    [droppedEndX, subDimensionY + mmToThreeUnits(10), 0.001]
                  ]}
                  color={subGuideColor}
                  lineWidth={1}
                />

                {/* 경계면 이격거리 치수선 - 좌우 이격과 동일한 Y 레벨 */}
                {(() => {
                  // ColumnIndexer에서 계산된 boundaryGap 사용
                  const zoneSlotInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
                  const boundaryGapMm = zoneSlotInfo.boundaryGap || 0;

                  const boundaryGapY = topDimensionY - mmToThreeUnits(120); // 좌우 이격과 동일한 Y 레벨
                  let boundaryLeftX: number;
                  let boundaryRightX: number;

                  if (spaceInfo.droppedCeiling.position === 'left') {
                    // 왼쪽 단내림: 단내림 끝 ~ 메인 시작
                    boundaryLeftX = droppedEndX;
                    boundaryRightX = mainStartX;
                  } else {
                    // 오른쪽 단내림: 메인 끝 ~ 단내림 시작
                    boundaryLeftX = mainEndX;
                    boundaryRightX = droppedStartX;
                  }

                  return (
                    <>
                      <Line
                        points={[[boundaryLeftX, boundaryGapY, 0.003], [boundaryRightX, boundaryGapY, 0.003]]}
                        color={dimensionColor}
                        lineWidth={1}
                      />
                      <Line
                        points={createArrowHead([boundaryLeftX, boundaryGapY, 0.003], [boundaryLeftX + 0.02, boundaryGapY, 0.003])}
                        color={dimensionColor}
                        lineWidth={1}
                      />
                      <Line
                        points={createArrowHead([boundaryRightX, boundaryGapY, 0.003], [boundaryRightX - 0.02, boundaryGapY, 0.003])}
                        color={dimensionColor}
                        lineWidth={1}
                      />
                      {/* 경계면 이격거리 텍스트 - 클릭 편집 */}
                      {editingGapSide === 'middle' ? (
                        <Html
                          position={[(boundaryLeftX + boundaryRightX) / 2, boundaryGapY - mmToThreeUnits(30), 0.01]}
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
                              style={{ width: '50px', padding: '2px 4px', border: '1px solid #ccc', borderRadius: '2px', fontSize: '12px', fontWeight: 'bold', textAlign: 'center', outline: 'none', background: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#1f2937' : '#fff', color: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#fff' : '#000' }}
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                            <span style={{ marginLeft: '2px', fontSize: '11px', color: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#9ca3af' : '#666' }}>mm</span>
                          </div>
                        </Html>
                      ) : (
                        <Html
                          position={[(boundaryLeftX + boundaryRightX) / 2, boundaryGapY - mmToThreeUnits(30), 0.01]}
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
                            {`이격 ${boundaryGapMm}`}
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
      
      {/* 좌측 프레임 치수선 / 노서라운드일 때는 이격거리/엔드패널 치수선 */}
      {showDimensions && !isStep2 && spaceInfo.surroundType === 'no-surround' && (() => {
            // 왼쪽 벽이 있는지 확인
            const hasLeftWall = spaceInfo.wallConfig?.left;

            // 자유배치 모드에서는 이격거리(벽이 있을 때)만 표시, 엔드패널은 숨김
            if (isFreePlacement && !hasLeftWall) return null;

            // 가장 왼쪽 가구 위치 찾기
            let leftmostFurnitureX: number | null = null;
            if (!isFreePlacement && placedModules.length > 0) {
              placedModules.forEach(module => {
                const widthMm = getModuleWidthMm(module);
                if (widthMm !== null) {
                  const moduleX = module.position.x;
                  const moduleWidth = widthMm * 0.01;
                  const moduleLeft = moduleX - moduleWidth / 2;
                  if (leftmostFurnitureX === null || moduleLeft < leftmostFurnitureX) {
                    leftmostFurnitureX = moduleLeft;
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

            if (hasLeftWall) {
              // 왼쪽 벽이 있으면 이격거리 표시
              leftValue = spaceInfo.gapConfig?.left ?? 1.5;
              if (leftValue === 0) return null;
              leftText = `이격 ${leftValue}`;
            } else if (leftmostFurnitureX !== null) {
              // 왼쪽 벽이 없고 가구가 있으면 엔드패널 표시
              const distanceFromLeft = (leftmostFurnitureX - leftOffset) * 100; // mm 단위로 변환
              leftValue = Math.round(Math.abs(distanceFromLeft));
              leftText = `${leftValue}`;
            }
            
            return (
      <group>
                {/* 치수선 */}
                <NativeLine name="dimension_line"
                  points={[[leftOffset, topDimensionY - mmToThreeUnits(120), 0.002], [leftOffset + mmToThreeUnits(leftValue), topDimensionY - mmToThreeUnits(120), 0.002]]}
                  color={dimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />

                {/* 좌측 화살표 */}
                <NativeLine name="dimension_line"
                  points={createArrowHead([leftOffset, topDimensionY - mmToThreeUnits(120), 0.002], [leftOffset + 0.02, topDimensionY - mmToThreeUnits(120), 0.002])}
                  color={dimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />

                {/* 우측 화살표 */}
                <NativeLine name="dimension_line"
                  points={createArrowHead([leftOffset + mmToThreeUnits(leftValue), topDimensionY - mmToThreeUnits(120), 0.002], [leftOffset + mmToThreeUnits(leftValue) - 0.02, topDimensionY - mmToThreeUnits(120), 0.002])}
                  color={dimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />
                
                {/* 좌측 치수 텍스트 - 이격거리 클릭 편집 */}
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
                        style={{ width: '50px', padding: '2px 4px', border: '1px solid #ccc', borderRadius: '2px', fontSize: '12px', fontWeight: 'bold', textAlign: 'center', outline: 'none', background: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#1f2937' : '#fff', color: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#fff' : '#000' }}
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
                    style={{ pointerEvents: hasLeftWall ? 'auto' : 'none' }}
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
                        background: hasLeftWall ? (currentViewDirection !== '3D' && view2DTheme === 'dark' ? 'rgba(31,41,55,0.7)' : 'rgba(255,255,255,0.7)') : 'transparent',
                        borderRadius: '3px',
                      }}
                      onClick={(e) => { if (hasLeftWall) { e.stopPropagation(); handleGapEdit('left', leftValue); } }}
                    >
                      {leftText}
                    </div>
                  </Html>
                ) : null}
                {/* 연장선 */}
                <NativeLine name="dimension_line"
                  points={[[leftOffset, spaceHeight, 0.001], [leftOffset, topDimensionY - mmToThreeUnits(100), 0.001]]}
                  color={textColor}
                  lineWidth={1.5}
                  renderOrder={1000000}
                  depthTest={false}
                  depthWrite={false}
                  transparent={true}
                />
                <NativeLine name="dimension_line"
                  points={[[leftOffset + mmToThreeUnits(leftValue), spaceHeight, 0.001], [leftOffset + mmToThreeUnits(leftValue), topDimensionY - mmToThreeUnits(100), 0.001]]}
                  color={textColor}
                  lineWidth={1.5}
                  renderOrder={1000000}
                  depthTest={false}
                  depthWrite={false}
                  transparent={true}
                />
      </group>
            );
          })()}
      
      {/* 서라운드 모드 좌측 프레임 치수선 - 자유배치 모드에서는 숨김 */}
      {showDimensions && !isStep2 && !isFreePlacement && spaceInfo.surroundType === 'surround' && (
      <group>
            {/* 치수선 */}
            <Line
              points={[[leftOffset, slotDimensionY, 0.002], [leftOffset + mmToThreeUnits(frameSize.left), slotDimensionY, 0.002]]}
              color={dimensionColor}
              lineWidth={0.5}
            />

            {/* 좌측 화살표 */}
            <Line
              points={createArrowHead([leftOffset, slotDimensionY, 0.002], [leftOffset + 0.02, slotDimensionY, 0.002])}
              color={dimensionColor}
              lineWidth={0.5}
            />

            {/* 우측 화살표 */}
            <Line
              points={createArrowHead([leftOffset + mmToThreeUnits(frameSize.left), slotDimensionY, 0.002], [leftOffset + mmToThreeUnits(frameSize.left) - 0.02, slotDimensionY, 0.002])}
              color={dimensionColor}
              lineWidth={0.5}
            />

            {/* 좌측 프레임 치수 텍스트 */}
            <Text
                  renderOrder={1000}
                  depthTest={false}
              position={[leftOffset + mmToThreeUnits(frameSize.left) / 2, slotDimensionY + mmToThreeUnits(30), 0.01]}
              fontSize={baseFontSize}
              color={textColor}
              anchorX="center"
              anchorY="middle"
              outlineWidth={textOutlineWidth}
              outlineColor={textOutlineColor}
            >
              {frameSize.left}
            </Text>

            {/* 연장선 - topDimensionY(3600선)까지 연장 */}
            <NativeLine name="dimension_line"
              points={[[leftOffset, spaceHeight, 0.001], [leftOffset, topDimensionY + mmToThreeUnits(40), 0.001]]}
              color={dimensionColor}
              lineWidth={1.5}
              renderOrder={1000000}
              depthTest={false}
              depthWrite={false}
              transparent={true}
            />
            <NativeLine name="dimension_line"
              points={[[leftOffset + mmToThreeUnits(frameSize.left), spaceHeight, 0.001], [leftOffset + mmToThreeUnits(frameSize.left), topDimensionY + mmToThreeUnits(40), 0.001]]}
              color={dimensionColor}
              lineWidth={1.5}
              renderOrder={1000000}
              depthTest={false}
              depthWrite={false}
              transparent={true}
            />
      </group>
      )}
      
      {/* 우측 프레임 치수선 / 노서라운드일 때는 이격거리/엔드패널 치수선 */}
      {showDimensions && !isStep2 && spaceInfo.surroundType === 'no-surround' && (() => {
            // 오른쪽 벽이 있는지 확인
            const hasRightWall = spaceInfo.wallConfig?.right;

            // 자유배치 모드에서는 이격거리(벽이 있을 때)만 표시, 엔드패널은 숨김
            if (isFreePlacement && !hasRightWall) return null;

            // 가장 오른쪽 가구 위치 찾기
            let rightmostFurnitureX: number | null = null;
            if (!isFreePlacement && placedModules.length > 0) {
              placedModules.forEach(module => {
                const widthMm = getModuleWidthMm(module);
                if (widthMm !== null) {
                  const moduleX = module.position.x;
                  const moduleWidth = widthMm * 0.01;
                  const moduleRight = moduleX + moduleWidth / 2;
                  if (rightmostFurnitureX === null || moduleRight > rightmostFurnitureX) {
                    rightmostFurnitureX = moduleRight;
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

            if (hasRightWall) {
              // 오른쪽 벽이 있으면 이격거리 표시
              rightValue = spaceInfo.gapConfig?.right ?? 1.5;
              if (rightValue === 0) return null;
              rightText = `이격 ${rightValue}`;
            } else if (rightmostFurnitureX !== null) {
              // 오른쪽 벽이 없고 가구가 있으면 엔드패널 표시
              const rightEdge = mmToThreeUnits(spaceInfo.width) + leftOffset;
              const distanceFromRight = (rightEdge - rightmostFurnitureX) * 100; // mm 단위로 변환
              rightValue = Math.round(Math.abs(distanceFromRight));
              rightText = `${rightValue}`;
            }
            
            return (
      <group>
                {/* 치수선 */}
                <NativeLine name="dimension_line"
                  renderOrder={100000}
                  depthTest={false}
                  points={[[mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(rightValue), topDimensionY - mmToThreeUnits(120), 0.002], [mmToThreeUnits(spaceInfo.width) + leftOffset, topDimensionY - mmToThreeUnits(120), 0.002]]}
                  color={textColor}
                  lineWidth={1}
                />

                {/* 좌측 화살표 */}
                <NativeLine name="dimension_line"
                  points={createArrowHead([mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(rightValue), topDimensionY - mmToThreeUnits(120), 0.002], [mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(rightValue) + 0.02, topDimensionY - mmToThreeUnits(120), 0.002])}
                  color={textColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />

                {/* 우측 화살표 */}
                <NativeLine name="dimension_line"
                  points={createArrowHead([mmToThreeUnits(spaceInfo.width) + leftOffset, topDimensionY - mmToThreeUnits(120), 0.002], [mmToThreeUnits(spaceInfo.width) + leftOffset - 0.02, topDimensionY - mmToThreeUnits(120), 0.002])}
                  color={textColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />
                
                {/* 우측 치수 텍스트 - 이격거리 클릭 편집 */}
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
                        style={{ width: '50px', padding: '2px 4px', border: '1px solid #ccc', borderRadius: '2px', fontSize: '12px', fontWeight: 'bold', textAlign: 'center', outline: 'none', background: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#1f2937' : '#fff', color: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#fff' : '#000' }}
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
                    style={{ pointerEvents: hasRightWall ? 'auto' : 'none' }}
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
                        background: hasRightWall ? (currentViewDirection !== '3D' && view2DTheme === 'dark' ? 'rgba(31,41,55,0.7)' : 'rgba(255,255,255,0.7)') : 'transparent',
                        borderRadius: '3px',
                      }}
                      onClick={(e) => { if (hasRightWall) { e.stopPropagation(); handleGapEdit('right', rightValue); } }}
                    >
                      {rightText}
                    </div>
                  </Html>
                )}

                {/* 연장선 */}
                <NativeLine name="dimension_line"
                  points={[[mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(rightValue), spaceHeight, 0.001], [mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(rightValue), topDimensionY - mmToThreeUnits(100), 0.001]]}
                  color={textColor}
                  lineWidth={1.5}
                  renderOrder={1000000}
                  depthTest={false}
                  depthWrite={false}
                  transparent={true}
                />
                <NativeLine name="dimension_line"
                  points={[[mmToThreeUnits(spaceInfo.width) + leftOffset, spaceHeight, 0.001], [mmToThreeUnits(spaceInfo.width) + leftOffset, topDimensionY - mmToThreeUnits(100), 0.001]]}
                  color={textColor}
                  lineWidth={1.5}
                  renderOrder={1000000}
                  depthTest={false}
                  depthWrite={false}
                  transparent={true}
                />
      </group>
            );
          })()}
      
      {/* 서라운드 모드 우측 프레임 치수선 - 자유배치 모드에서는 숨김 */}
      {showDimensions && !isStep2 && !isFreePlacement && spaceInfo.surroundType === 'surround' && (
      <group>
            {/* 치수선 */}
            <Line
              points={[[mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(frameSize.right), slotDimensionY, 0.002], [mmToThreeUnits(spaceInfo.width) + leftOffset, slotDimensionY, 0.002]]}
              color={dimensionColor}
              lineWidth={0.5}
            />

            {/* 좌측 화살표 */}
            <Line
              points={createArrowHead([mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(frameSize.right), slotDimensionY, 0.002], [mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(frameSize.right) + 0.02, slotDimensionY, 0.002])}
              color={dimensionColor}
              lineWidth={0.5}
            />

            {/* 우측 화살표 */}
            <Line
              points={createArrowHead([mmToThreeUnits(spaceInfo.width) + leftOffset, slotDimensionY, 0.002], [mmToThreeUnits(spaceInfo.width) + leftOffset - 0.02, slotDimensionY, 0.002])}
              color={dimensionColor}
              lineWidth={0.5}
            />

            {/* 우측 프레임 치수 텍스트 */}
            <Text
                  renderOrder={1000}
                  depthTest={false}
              position={[mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(frameSize.right) / 2, slotDimensionY + mmToThreeUnits(30), 0.01]}
              fontSize={baseFontSize}
              color={textColor}
              anchorX="center"
              anchorY="middle"
              outlineWidth={textOutlineWidth}
              outlineColor={textOutlineColor}
            >
              {frameSize.right}
            </Text>

            {/* 연장선 - topDimensionY(3600선)까지 연장 */}
            <NativeLine name="dimension_line"
              points={[[mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(frameSize.right), spaceHeight, 0.001], [mmToThreeUnits(spaceInfo.width) + leftOffset - mmToThreeUnits(frameSize.right), topDimensionY + mmToThreeUnits(40), 0.001]]}
              color={dimensionColor}
              lineWidth={1.5}
              renderOrder={1000000}
              depthTest={false}
              depthWrite={false}
              transparent={true}
            />
            <NativeLine name="dimension_line"
              points={[[mmToThreeUnits(spaceInfo.width) + leftOffset, spaceHeight, 0.001], [mmToThreeUnits(spaceInfo.width) + leftOffset, topDimensionY + mmToThreeUnits(40), 0.001]]}
              color={dimensionColor}
              lineWidth={1.5}
              renderOrder={1000000}
              depthTest={false}
              depthWrite={false}
              transparent={true}
            />
      </group>
      )}
      
      {/* 전체 내부 너비 치수선 (자유배치 모드에서는 숨김 - 프레임 없음) */}
      {!isFreePlacement && (() => {
        const internalLeftX = threeUnitBoundaries[0];
        const internalRightX = threeUnitBoundaries[threeUnitBoundaries.length - 1];
        const internalWidthMm = indexing.internalWidth;
        const centerX = (internalLeftX + internalRightX) / 2;
        const extLen = mmToThreeUnits(EXTENSION_LENGTH); // 일관된 보조선 길이

        return (
          <group key="total-internal-width">
            {/* 전체 내부 너비 치수선 */}
            <NativeLine name="dimension_line"
              points={[[internalLeftX, columnDimensionY, 0.002], [internalRightX, columnDimensionY, 0.002]]}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 좌측 화살표 */}
            <NativeLine name="dimension_line"
              points={createArrowHead([internalLeftX, columnDimensionY, 0.002], [internalLeftX + 0.03, columnDimensionY, 0.002], 0.01)}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 우측 화살표 */}
            <NativeLine name="dimension_line"
              points={createArrowHead([internalRightX, columnDimensionY, 0.002], [internalRightX - 0.03, columnDimensionY, 0.002], 0.01)}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 내부 너비 텍스트 */}
            <Text
              renderOrder={1000}
              depthTest={false}
              position={[centerX, columnDimensionY + mmToThreeUnits(20), 0.01]}
              fontSize={baseFontSize}
              color={textColor}
              anchorX="center"
              anchorY="middle"
              outlineWidth={textOutlineWidth}
              outlineColor={textOutlineColor}
            >
              {Math.round(internalWidthMm)}
            </Text>
            {/* 좌측 연장선 - 공간 상단에서 치수선 위까지 */}
            <NativeLine name="dimension_line"
              points={[[internalLeftX, spaceHeight, 0.001], [internalLeftX, topDimensionY + extLen, 0.001]]}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={100000}
              depthTest={false}
            />
            {/* 우측 연장선 - 공간 상단에서 치수선 위까지 */}
            <NativeLine name="dimension_line"
              points={[[internalRightX, spaceHeight, 0.001], [internalRightX, topDimensionY + extLen, 0.001]]}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={100000}
              depthTest={false}
            />
          </group>
        );
      })()}

      
      {/* 좌측 전체 높이 치수선 */}
      {showDimensions && <group>
        {/* 단내림이 있는 경우 높이 치수선 표시 */}
        {spaceInfo.droppedCeiling?.enabled ? (
          <>
            {/* 단내림 위치에 따라 치수선 표시 */}
            {spaceInfo.droppedCeiling.position === 'left' ? (
              <>
                {/* 좌측 단내림 - 좌측 외부 치수선에 단내림 구간 높이 표시 */}
                <NativeLine name="dimension_line"
                  points={[[leftDimensionX + leftOffset, mmToThreeUnits(spaceInfo.height - spaceInfo.droppedCeiling.dropHeight), 0.002], [leftDimensionX + leftOffset, spaceHeight, 0.002]]}
                  color={dimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />

                {/* 하단 화살표 */}
                <NativeLine name="dimension_line"
                  points={createArrowHead([leftDimensionX + leftOffset, mmToThreeUnits(spaceInfo.height - spaceInfo.droppedCeiling.dropHeight), 0.002], [leftDimensionX + leftOffset, mmToThreeUnits(spaceInfo.height - spaceInfo.droppedCeiling.dropHeight) + 0.05, 0.002])}
                  color={dimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />

                {/* 상단 화살표 */}
                <NativeLine name="dimension_line"
                  points={createArrowHead([leftDimensionX + leftOffset, spaceHeight, 0.002], [leftDimensionX + leftOffset, spaceHeight - 0.05, 0.002])}
                  color={dimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />
                
                {/* 단내림 구간 높이 텍스트 */}
                <Text
                  renderOrder={1000}
                  depthTest={false}
                  position={[leftDimensionX + leftOffset - mmToThreeUnits(60), mmToThreeUnits(spaceInfo.height - spaceInfo.droppedCeiling.dropHeight / 2), 0.01]}
                  fontSize={largeFontSize}
                  color={textColor}
                  anchorX="center"
                  anchorY="middle"
                  outlineWidth={textOutlineWidth}
                  outlineColor={textOutlineColor}
                  rotation={[0, 0, -Math.PI / 2]}
                >
                  {spaceInfo.droppedCeiling.dropHeight}
                </Text>
              </>
            ) : (
              <>
                {/* 우측 단내림 - 좌측 외부 치수선에 전체 높이 표시 */}
                {(() => {
                  const leftBottomYDrop = floorFinishHeightMmGlobal > 0 ? mmToThreeUnits(floorFinishHeightMmGlobal) : 0;
                  const leftMidYDrop = leftBottomYDrop + (spaceHeight - leftBottomYDrop) / 2;
                  return (
                    <>
                      <NativeLine name="dimension_line"
                        points={[[leftDimensionX + leftOffset, leftBottomYDrop, 0.002], [leftDimensionX + leftOffset, spaceHeight, 0.002]]}
                        color={dimensionColor}
                        lineWidth={1}
                        renderOrder={100000}
                        depthTest={false}
                      />

                      {/* 하단 화살표 */}
                      <NativeLine name="dimension_line"
                        points={createArrowHead([leftDimensionX + leftOffset, leftBottomYDrop, 0.002], [leftDimensionX + leftOffset, leftBottomYDrop + 0.05, 0.002])}
                        color={dimensionColor}
                        lineWidth={1}
                        renderOrder={100000}
                        depthTest={false}
                      />

                      {/* 상단 화살표 */}
                      <NativeLine name="dimension_line"
                        points={createArrowHead([leftDimensionX + leftOffset, spaceHeight, 0.002], [leftDimensionX + leftOffset, spaceHeight - 0.05, 0.002])}
                        color={dimensionColor}
                        lineWidth={1}
                        renderOrder={100000}
                        depthTest={false}
                      />

                      {/* 전체 높이 텍스트 */}
                      <Text
                        renderOrder={1000}
                        depthTest={false}
                        position={[leftDimensionX + leftOffset - mmToThreeUnits(60), leftMidYDrop, 0.01]}
                        fontSize={largeFontSize}
                        color={textColor}
                        anchorX="center"
                        anchorY="middle"
                        outlineWidth={textOutlineWidth}
                        outlineColor={textOutlineColor}
                        rotation={[0, 0, -Math.PI / 2]}
                      >
                        {spaceInfo.height - floorFinishHeightMmGlobal}
                      </Text>
                    </>
                  );
                })()}
              </>
            )}
          </>
        ) : (
          <>
            {/* 단내림이 없는 경우 기존 전체 높이 치수선 */}
            {/* 바닥마감재가 있으면 마감재 상단부터, 없으면 바닥부터 */}
            {(() => {
              const leftBottomY = floorFinishHeightMmGlobal > 0 ? mmToThreeUnits(floorFinishHeightMmGlobal) : 0;
              const leftMidY = leftBottomY + (spaceHeight - leftBottomY) / 2;
              return (
                <>
                  {/* 치수선 */}
                  <NativeLine name="dimension_line"
                    points={[[leftDimensionX + leftOffset, leftBottomY, 0.002], [leftDimensionX + leftOffset, spaceHeight, 0.002]]}
                    color={dimensionColor}
                    lineWidth={1}
                    renderOrder={100000}
                    depthTest={false}
                  />

                  {/* 하단 화살표 */}
                  <NativeLine name="dimension_line"
                    points={createArrowHead([leftDimensionX + leftOffset, leftBottomY, 0.002], [leftDimensionX + leftOffset, leftBottomY + 0.05, 0.002])}
                    color={dimensionColor}
                    lineWidth={1}
                    renderOrder={100000}
                    depthTest={false}
                  />

                  {/* 상단 화살표 */}
                  <NativeLine name="dimension_line"
                    points={createArrowHead([leftDimensionX + leftOffset, spaceHeight, 0.002], [leftDimensionX + leftOffset, spaceHeight - 0.05, 0.002])}
                    color={dimensionColor}
                    lineWidth={1}
                    renderOrder={100000}
                    depthTest={false}
                  />

                  {/* 전체 높이 치수 텍스트 */}
                  <Text
                    renderOrder={1000}
                    depthTest={false}
                    position={[leftDimensionX + leftOffset - mmToThreeUnits(60), leftMidY, 0.01]}
                    fontSize={largeFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                    rotation={[0, 0, -Math.PI / 2]}
                  >
                    {spaceInfo.height - floorFinishHeightMmGlobal}
                  </Text>
                </>
              );
            })()}
          </>
        )}
        
        {/* 연장선 (하단) */}
        <NativeLine name="dimension_line"
          points={[[leftOffset, floorFinishHeightMmGlobal > 0 ? mmToThreeUnits(floorFinishHeightMmGlobal) : 0, 0.001], [leftDimensionX + leftOffset - mmToThreeUnits(20), floorFinishHeightMmGlobal > 0 ? mmToThreeUnits(floorFinishHeightMmGlobal) : 0, 0.001]]}
          color={dimensionColor}
          lineWidth={1}
          renderOrder={100000}
          depthTest={false}
        />

        {/* 연장선 (상단) */}
        <NativeLine name="dimension_line"
          points={[[leftOffset, spaceHeight, 0.001], [leftDimensionX + leftOffset - mmToThreeUnits(20), spaceHeight, 0.001]]}
          color={dimensionColor}
          lineWidth={1}
          renderOrder={100000}
          depthTest={false}
        />
      </group>}

      {/* 우측 3구간 높이 치수선 (상부프레임 + 캐비넷배치영역 + 하부프레임) */}
      {showDimensions && (
      <group>
        {(() => {
          const rightDimensionX = mmToThreeUnits(spaceInfo.width) + leftOffset + mmToThreeUnits(200); // 우측 치수선 위치 (균형감을 위해 200으로 고정)
          
          // 띄워서 배치인지 확인
          const isFloating = spaceInfo.baseConfig?.type === 'stand' && spaceInfo.baseConfig?.placementType === 'float';
          const floatHeight = isFloating ? (spaceInfo.baseConfig?.floatHeight || 0) : 0;
          
          const topFrameHeight = frameSize.top ?? 0; // 상부 프레임 높이
          const bottomFrameHeight = spaceInfo.baseConfig?.type === 'floor' ? (spaceInfo.baseConfig.height || 65) : 0; // 하부 프레임 높이 (받침대가 있는 경우만)
          const bottomFrameDepth = spaceInfo.depth; // 받침대 깊이 (공간 깊이와 동일)
          const cabinetPlacementHeight = Math.max(spaceInfo.height - topFrameHeight - bottomFrameHeight - floatHeight, 0); // 캐비넷 배치 영역 (바닥마감재는 받침대에 포함)

          const floorFinishH = floorFinishHeightMmGlobal; // 바닥마감재 높이 (mm)
          const bottomY = mmToThreeUnits(floatHeight); // 바닥 시작점
          const floorFinishTopY = mmToThreeUnits(floatHeight + floorFinishH); // 바닥마감재 상단
          const baseStartY = floorFinishH > 0 ? floorFinishTopY : bottomY; // 받침대 시작점 (마감재 있으면 위로)
          const bottomFrameTopY = mmToThreeUnits(floatHeight + bottomFrameHeight); // 하부 프레임 상단
          const cabinetAreaTopY = mmToThreeUnits(floatHeight + bottomFrameHeight + cabinetPlacementHeight); // 캐비넷 영역 상단
          const topFrameTopY = cabinetAreaTopY + mmToThreeUnits(topFrameHeight); // 상부 프레임 상단 (= 공간 천장 높이)

          // 배치된 가구들의 최대 높이 및 실제 가구 높이 계산
          let maxFurnitureTop = topFrameTopY;
          let maxModuleHeightMm = 0;
          let tallestModuleTopY = cabinetAreaTopY;

          // 상하부장 높이 계산 (띄움 배치 시 표시용)
          let maxLowerCabinetHeightMm = 0;
          let maxUpperCabinetHeightMm = 0;

          placedModules.forEach(module => {
            const moduleData = getModuleById(module.moduleId);
            if (!moduleData) return;

            const moduleHeight = module.customHeight ?? moduleData.dimensions.height;
            // 띄움배치 시에는 floatHeight를 기준으로, 아니면 bottomFrameTopY를 기준으로
            const furnitureStartY = isFloating ? mmToThreeUnits(floatHeight) : bottomFrameTopY;
            const moduleTopY = furnitureStartY + mmToThreeUnits(moduleHeight);

            if (moduleTopY > maxFurnitureTop) {
              maxFurnitureTop = moduleTopY;
            }

            if (moduleHeight > maxModuleHeightMm) {
              maxModuleHeightMm = moduleHeight;
              tallestModuleTopY = moduleTopY;
            }

            // 상하부장 분류
            if (moduleData.category === 'lower' && moduleHeight > maxLowerCabinetHeightMm) {
              maxLowerCabinetHeightMm = moduleHeight;
            }
            if (moduleData.category === 'upper' && moduleHeight > maxUpperCabinetHeightMm) {
              maxUpperCabinetHeightMm = moduleHeight;
            }
          });

          const hasFurnitureHeight = maxModuleHeightMm > 0;
          const furnitureHeightValue = hasFurnitureHeight ? maxModuleHeightMm : cabinetPlacementHeight;
          const furnitureTopY = hasFurnitureHeight ? tallestModuleTopY : cabinetAreaTopY;
          // 띄움배치 시에는 floatHeight를 기준으로 텍스트 위치 계산
          const furnitureStartY = isFloating ? mmToThreeUnits(floatHeight) : bottomFrameTopY;
          const furnitureTextY = furnitureStartY + (furnitureTopY - furnitureStartY) / 2;

          const topFrameLineTopY = topFrameTopY;
          const extraFurnitureHeightUnits = maxFurnitureTop - topFrameLineTopY;
          const extraFurnitureHeightMm = extraFurnitureHeightUnits > 1e-6 ? Math.round(threeUnitsToMm(extraFurnitureHeightUnits)) : 0;
          const hasExtraFurnitureHeight = extraFurnitureHeightMm > 0;
          const extraFurnitureX = rightDimensionX + mmToThreeUnits(70); // 균형감을 위해 70으로 고정
          const extraFurnitureTextY = topFrameLineTopY + (maxFurnitureTop - topFrameLineTopY) / 2;
          
          return (
            <>
              {/* 0. 띄움 높이 - 띄워서 배치인 경우에만 표시 (우측) */}
              {isFloating && floatHeight > 0 && (
                <group>
                  <NativeLine name="dimension_line"
                    points={[[rightDimensionX + mmToThreeUnits(100), 0, 0.002], [rightDimensionX + mmToThreeUnits(100), mmToThreeUnits(floatHeight), 0.002]]}
                    color={textColor}
                    lineWidth={1}
                    renderOrder={100000}
                    depthTest={false}
                  />
                  <NativeLine name="dimension_line"
                    points={createArrowHead([rightDimensionX + mmToThreeUnits(100), 0, 0.002], [rightDimensionX + mmToThreeUnits(100), -0.03, 0.002])}
                    color={textColor}
                    lineWidth={1}
                    renderOrder={100000}
                    depthTest={false}
                  />
                  <NativeLine name="dimension_line"
                    points={createArrowHead([rightDimensionX + mmToThreeUnits(100), mmToThreeUnits(floatHeight), 0.002], [rightDimensionX + mmToThreeUnits(100), mmToThreeUnits(floatHeight) + 0.03, 0.002])}
                    color={textColor}
                    lineWidth={1}
                    renderOrder={100000}
                    depthTest={false}
                  />
                  <Text
                  renderOrder={1000}
                  depthTest={false}
                    position={[rightDimensionX + mmToThreeUnits(100) + mmToThreeUnits(30), mmToThreeUnits(floatHeight / 2), 0.01]}
                    fontSize={baseFontSize * 0.9}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                    rotation={[0, 0, -Math.PI / 2]}
                  >
                    띄움 {floatHeight}
                  </Text>
                  {/* 연장선들 - 좌측으로 1800mm 이동 */}
                  <Line
                    points={[[-mmToThreeUnits(1800), 0, 0.002], [mmToThreeUnits(spaceInfo.width) - mmToThreeUnits(1800), 0, 0.002]]}
                    color={textColor}
                    lineWidth={0.5}
                    dashed
                    dashSize={0.01}
                    gapSize={0.005}
                  />
                  <Line
                    points={[[-mmToThreeUnits(1800), mmToThreeUnits(floatHeight), 0.002], [mmToThreeUnits(spaceInfo.width) - mmToThreeUnits(1800), mmToThreeUnits(floatHeight), 0.002]]}
                    color={textColor}
                    lineWidth={0.5}
                    dashed
                    dashSize={0.01}
                    gapSize={0.005}
                  />
                </group>
              )}
              
              {/* 0. 바닥마감재 두께 치수선 (바닥마감재 있을 때만) */}
              {!isFloating && floorFinishH > 0 && (
              <group>
                <NativeLine name="dimension_line"
                  points={[[rightDimensionX, bottomY, 0.002], [rightDimensionX, floorFinishTopY, 0.002]]}
                  color={dimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />
                <NativeLine name="dimension_line"
                  points={createArrowHead([rightDimensionX, bottomY, 0.002], [rightDimensionX, bottomY - 0.03, 0.002])}
                  color={dimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />
                <NativeLine name="dimension_line"
                  points={createArrowHead([rightDimensionX, floorFinishTopY, 0.002], [rightDimensionX, floorFinishTopY + 0.03, 0.002])}
                  color={dimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />
                <Text
                  renderOrder={1000}
                  depthTest={false}
                  position={[rightDimensionX + mmToThreeUnits(is3DMode ? 30 : 60), mmToThreeUnits(floatHeight + floorFinishH / 2), 0.01]}
                  fontSize={baseFontSize}
                  color={textColor}
                  anchorX="center"
                  anchorY="middle"
                  outlineWidth={textOutlineWidth}
                  outlineColor={textOutlineColor}
                  rotation={[0, 0, -Math.PI / 2]}
                >
                  {floorFinishH}
                </Text>
              </group>
              )}

              {/* 1. 하부 프레임 높이 또는 하부섹션 높이 */}
              {/* 띄움 배치가 아니고 받침대가 있는 경우: 하부 프레임 높이 표시 */}
              {!isFloating && bottomFrameHeight > 0 && (
              <group>
                <NativeLine name="dimension_line"
                  points={[[rightDimensionX, baseStartY, 0.002], [rightDimensionX, bottomFrameTopY, 0.002]]}
                  color={dimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />
                <NativeLine name="dimension_line"
                  points={createArrowHead([rightDimensionX, baseStartY, 0.002], [rightDimensionX, baseStartY - 0.03, 0.002])}
                  color={dimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />
                <NativeLine name="dimension_line"
                  points={createArrowHead([rightDimensionX, bottomFrameTopY, 0.002], [rightDimensionX, bottomFrameTopY + 0.03, 0.002])}
                  color={dimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />
                <Text
                  renderOrder={1000}
                  depthTest={false}
                  position={[rightDimensionX + mmToThreeUnits(is3DMode ? 30 : 60), (baseStartY + bottomFrameTopY) / 2, 0.01]}
                  fontSize={baseFontSize}
                  color={textColor}
                  anchorX="center"
                  anchorY="middle"
                  outlineWidth={textOutlineWidth}
                  outlineColor={textOutlineColor}
                  rotation={[0, 0, -Math.PI / 2]}
                >
                  {Math.max(0, bottomFrameHeight - floorFinishHeightMmGlobal)}
                </Text>
              </group>
              )}

              {/* 띄움 배치이고 하부장이 있는 경우: 하부섹션 높이 표시 */}
              {isFloating && maxLowerCabinetHeightMm > 0 && (
              <group>
                <NativeLine name="dimension_line"
                  points={[[rightDimensionX, mmToThreeUnits(floatHeight), 0.002], [rightDimensionX, mmToThreeUnits(floatHeight + maxLowerCabinetHeightMm), 0.002]]}
                  color={dimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />
                <NativeLine name="dimension_line"
                  points={createArrowHead([rightDimensionX, mmToThreeUnits(floatHeight), 0.002], [rightDimensionX, mmToThreeUnits(floatHeight) + 0.03, 0.002])}
                  color={dimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />
                <NativeLine name="dimension_line"
                  points={createArrowHead([rightDimensionX, mmToThreeUnits(floatHeight + maxLowerCabinetHeightMm), 0.002], [rightDimensionX, mmToThreeUnits(floatHeight + maxLowerCabinetHeightMm) - 0.03, 0.002])}
                  color={dimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />
                <Text
                  renderOrder={1000}
                  depthTest={false}
                  position={[rightDimensionX + mmToThreeUnits(is3DMode ? 30 : 60), mmToThreeUnits(floatHeight + maxLowerCabinetHeightMm / 2), 0.01]}
                  fontSize={baseFontSize}
                  color={textColor}
                  anchorX="center"
                  anchorY="middle"
                  outlineWidth={textOutlineWidth}
                  outlineColor={textOutlineColor}
                  rotation={[0, 0, -Math.PI / 2]}
                >
                  {maxLowerCabinetHeightMm}
                </Text>
              </group>
              )}

              {/* 1-1. 받침대 깊이 - 받침대가 있고 좌우측면뷰에서만 표시 (정면뷰에서는 숨김) */}
              {bottomFrameHeight > 0 && view2DDirection !== 'front' && (
              <group>
                <Text
                  renderOrder={1000}
                  depthTest={false}
                  position={[rightDimensionX + mmToThreeUnits(is3DMode ? 30 : 60), mmToThreeUnits(floatHeight + bottomFrameHeight) - mmToThreeUnits(10), 0.01]}
                  fontSize={baseFontSize * 0.8}
                  color={textColor}
                  anchorX="center"
                  anchorY="middle"
                  outlineWidth={textOutlineWidth}
                  outlineColor={textOutlineColor}
                  rotation={[0, 0, -Math.PI / 2]}
                >
                  (D{bottomFrameDepth})
                </Text>
              </group>
              )}
              
              {/* 2. 캐비넷/가구 높이 또는 상부섹션 높이 */}
              {/* 띄움 배치가 아니거나 상하부장 분리되지 않은 경우: 통합 가구 높이 표시 */}
              {(!isFloating || (maxLowerCabinetHeightMm === 0 && maxUpperCabinetHeightMm === 0)) && (
              <group>
                <NativeLine name="dimension_line"
                  points={[[rightDimensionX, bottomFrameTopY, 0.002], [rightDimensionX, furnitureTopY, 0.002]]}
                  color={dimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />
                <NativeLine name="dimension_line"
                  points={createArrowHead([rightDimensionX, bottomFrameTopY, 0.002], [rightDimensionX, bottomFrameTopY + 0.03, 0.002])}
                  color={dimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />
                <NativeLine name="dimension_line"
                  points={createArrowHead([rightDimensionX, furnitureTopY, 0.002], [rightDimensionX, furnitureTopY - 0.03, 0.002])}
                  color={dimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />
                <Text
                  renderOrder={1000}
                  depthTest={false}
                  position={[rightDimensionX + mmToThreeUnits(is3DMode ? 30 : 60), furnitureTextY, 0.01]}
                  fontSize={baseFontSize}
                  color={textColor}
                  anchorX="center"
                  anchorY="middle"
                  outlineWidth={textOutlineWidth}
                  outlineColor={textOutlineColor}
                  rotation={[0, 0, -Math.PI / 2]}
                >
                  {furnitureHeightValue}
                </Text>
              </group>
              )}

              {/* 띄움 배치이고 상부장이 있는 경우: 상부섹션 높이 표시 */}
              {isFloating && maxUpperCabinetHeightMm > 0 && (
              <group>
                <NativeLine name="dimension_line"
                  points={[[rightDimensionX, mmToThreeUnits(floatHeight + maxLowerCabinetHeightMm), 0.002], [rightDimensionX, mmToThreeUnits(floatHeight + maxLowerCabinetHeightMm + maxUpperCabinetHeightMm), 0.002]]}
                  color={dimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />
                <NativeLine name="dimension_line"
                  points={createArrowHead([rightDimensionX, mmToThreeUnits(floatHeight + maxLowerCabinetHeightMm), 0.002], [rightDimensionX, mmToThreeUnits(floatHeight + maxLowerCabinetHeightMm) + 0.03, 0.002])}
                  color={dimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />
                <NativeLine name="dimension_line"
                  points={createArrowHead([rightDimensionX, mmToThreeUnits(floatHeight + maxLowerCabinetHeightMm + maxUpperCabinetHeightMm), 0.002], [rightDimensionX, mmToThreeUnits(floatHeight + maxLowerCabinetHeightMm + maxUpperCabinetHeightMm) - 0.03, 0.002])}
                  color={dimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />
                <Text
                  renderOrder={1000}
                  depthTest={false}
                  position={[rightDimensionX + mmToThreeUnits(is3DMode ? 30 : 60), mmToThreeUnits(floatHeight + maxLowerCabinetHeightMm + maxUpperCabinetHeightMm / 2), 0.01]}
                  fontSize={baseFontSize}
                  color={textColor}
                  anchorX="center"
                  anchorY="middle"
                  outlineWidth={textOutlineWidth}
                  outlineColor={textOutlineColor}
                  rotation={[0, 0, -Math.PI / 2]}
                >
                  {maxUpperCabinetHeightMm}
                </Text>
              </group>
              )}
              
              {/* 3. 상부 프레임 높이 / 노서라운드일 때는 상부 이격거리 - 자유배치에서는 숨김 */}
              {topFrameHeight > 0 && !isFreePlacement && (
              <group>
                <NativeLine name="dimension_line"
                  points={[[rightDimensionX, cabinetAreaTopY, 0.002], [rightDimensionX, topFrameLineTopY, 0.002]]}
                  color={spaceInfo.surroundType === 'no-surround' ? textColor : frameDimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />
                {/* 화살표: 공간이 충분할 때만 표시 (30mm 이상) */}
                {topFrameHeight >= 30 && (
                <>
                <NativeLine name="dimension_line"
                  points={createArrowHead([rightDimensionX, cabinetAreaTopY, 0.002], [rightDimensionX, cabinetAreaTopY + 0.03, 0.002])}
                  color={spaceInfo.surroundType === 'no-surround' ? textColor : frameDimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />
                <NativeLine name="dimension_line"
                  points={createArrowHead([rightDimensionX, topFrameLineTopY, 0.002], [rightDimensionX, topFrameLineTopY - 0.03, 0.002])}
                  color={spaceInfo.surroundType === 'no-surround' ? textColor : frameDimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />
                </>
                )}
                <Text
                  renderOrder={1000}
                  depthTest={false}
                  position={[rightDimensionX + mmToThreeUnits(is3DMode ? 30 : 60), topFrameHeight < 50
                    ? topFrameLineTopY + mmToThreeUnits(30)
                    : mmToThreeUnits(spaceInfo.height - topFrameHeight / 2), 0.01]}
                  fontSize={baseFontSize}
                  color={spaceInfo.surroundType === 'no-surround' ? textColor : frameDimensionColor}
                  anchorX="center"
                  anchorY="middle"
                  rotation={[0, 0, -Math.PI / 2]}
                >
                  {topFrameHeight}
                </Text>
              </group>
              )}

              {/* 4. 상부 프레임 이상으로 올라온 가구 높이 */}
              {hasExtraFurnitureHeight && (
              <group>
                <NativeLine name="dimension_line"
                  points={[[extraFurnitureX, topFrameLineTopY, 0.002], [extraFurnitureX, maxFurnitureTop, 0.002]]}
                  color={dimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />
                <NativeLine name="dimension_line"
                  points={createArrowHead([extraFurnitureX, topFrameLineTopY, 0.002], [extraFurnitureX, topFrameLineTopY + 0.03, 0.002])}
                  color={dimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />
                <NativeLine name="dimension_line"
                  points={createArrowHead([extraFurnitureX, maxFurnitureTop, 0.002], [extraFurnitureX, maxFurnitureTop - 0.03, 0.002])}
                  color={dimensionColor}
                  lineWidth={1}
                  renderOrder={100000}
                  depthTest={false}
                />
                <Text
                  renderOrder={1000}
                  depthTest={false}
                  position={[extraFurnitureX + mmToThreeUnits(30), extraFurnitureTextY, 0.01]}
                  fontSize={baseFontSize}
                  color={textColor}
                  anchorX="center"
                  anchorY="middle"
                  outlineWidth={textOutlineWidth}
                  outlineColor={textOutlineColor}
                  rotation={[0, 0, -Math.PI / 2]}
                >
                  {extraFurnitureHeightMm}
                </Text>
              </group>
              )}
              
              {/* 연장선들 */}
              <Line
                points={[[mmToThreeUnits(spaceInfo.width) + leftOffset, bottomY, 0.001], [rightDimensionX + mmToThreeUnits(is3DMode ? 10 : 20), bottomY, 0.001]]}
                color={dimensionColor}
                lineWidth={0.5}
              />
              {/* 하부 프레임 상단 연장선 - 받침대가 있는 경우에만 표시 */}
              {bottomFrameHeight > 0 && (
              <Line
                points={[[mmToThreeUnits(spaceInfo.width) + leftOffset, bottomFrameTopY, 0.001], [rightDimensionX + mmToThreeUnits(is3DMode ? 10 : 20), bottomFrameTopY, 0.001]]}
                color={dimensionColor}
                lineWidth={0.5}
              />
              )}
              <Line
                points={[[mmToThreeUnits(spaceInfo.width) + leftOffset, furnitureTopY, 0.001], [rightDimensionX + mmToThreeUnits(is3DMode ? 10 : 20), furnitureTopY, 0.001]]}
                color={dimensionColor}
                lineWidth={0.5}
              />
              <Line
                points={[[mmToThreeUnits(spaceInfo.width) + leftOffset, topFrameLineTopY, 0.001], [rightDimensionX + mmToThreeUnits(is3DMode ? 10 : 20), topFrameLineTopY, 0.001]]}
                color={dimensionColor}
                lineWidth={0.5}
              />
              {hasExtraFurnitureHeight && (
              <Line
                points={[[mmToThreeUnits(spaceInfo.width) + leftOffset, maxFurnitureTop, 0.001], [extraFurnitureX + mmToThreeUnits(10), maxFurnitureTop, 0.001]]}
                color={dimensionColor}
                lineWidth={0.5}
              />
              )}
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
          isSpacerHandled,
          hasStepDown,
          stepDownPosition
        } = item;
        
        // actualPositionX를 moduleX로부터 가져옴
        let actualPositionX = moduleX;
        
        // 실제 너비 계산은 이미 완료되어 있음
        const stepDownWidth = spaceInfo.droppedCeiling?.width || 0;
        const moduleWidth = mmToThreeUnits(actualWidth);
        const leftX = actualPositionX - moduleWidth / 2;
        const rightX = actualPositionX + moduleWidth / 2;
        const dimY = slotDimensionY; // 개별 가구 치수선은 가장 아래 (slotDimensionY)
        
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
        
        // 메인구간 경계 계산
        const mainAreaLeft = hasStepDown && stepDownPosition === 'left' 
          ? mmToThreeUnits(stepDownWidth) 
          : 0;
        const mainAreaRight = hasStepDown && stepDownPosition === 'right'
          ? mmToThreeUnits(spaceInfo.width - stepDownWidth)
          : mmToThreeUnits(spaceInfo.width);
        
        // 모듈이 속한 구간 확인 (메인구간 또는 단내림 구간)
        const isInMainArea = leftX >= mainAreaLeft && rightX <= mainAreaRight;
        const isInStepDownArea = hasStepDown && !isInMainArea;
        
        // 가이드라인 높이 계산 - 가구 상단까지만
        const furnitureHeight = mmToThreeUnits(moduleData.dimensions.height);
        const guideTopY = furnitureHeight; // 가구 상단까지만 표시
        const guideBottomY = 0;
        
        // 가이드라인은 해당 구간 내에서만 표시
        const shouldShowGuide = isInMainArea || isInStepDownArea;
        
        return (
          <group key={`module-guide-${index}`} renderOrder={1000000}>

            {/* 가구 치수선 */}
            <NativeLine name="dimension_line"
              points={[[leftX, dimY, 0.002], [rightX, dimY, 0.002]]}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={1000000}
              depthTest={false}
            />

            {/* 좌측 화살표 */}
            <NativeLine name="dimension_line"
              points={createArrowHead([leftX, dimY, 0.002], [leftX + 0.02, dimY, 0.002], 0.01)}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={1000000}
              depthTest={false}
            />

            {/* 우측 화살표 */}
            <NativeLine name="dimension_line"
              points={createArrowHead([rightX, dimY, 0.002], [rightX - 0.02, dimY, 0.002], 0.01)}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={1000000}
              depthTest={false}
            />

            {/* 가구 치수 텍스트 — 듀얼: 0.5 단위 내림, 싱글: 정수 내림 */}
            <Text
              position={[actualPositionX, dimY + mmToThreeUnits(30), 0.01]}
              fontSize={baseFontSize}
              color={dimensionColor}
              anchorX="center"
              anchorY="middle"
              renderOrder={1000000}
              depthTest={false}
            >
              {(() => {
                const isDual = module.isDualSlot || module.moduleId.includes('dual-');
                if (isDual) {
                  const w = Math.floor(actualWidth * 2) / 2;
                  return w % 1 === 0 ? w : w.toFixed(1);
                }
                return Math.floor(actualWidth);
              })()}
            </Text>

            {/* 연장선 끝 세리프 (가로 틱 마크) */}
            {[leftX, rightX].map((x, ti) => (
              <React.Fragment key={`tick-${ti}`}>
                <NativeLine name="dimension_line"
                  points={[[x - mmToThreeUnits(5), dimY, 0.001], [x + mmToThreeUnits(5), dimY, 0.001]]}
                  color={dimensionColor} lineWidth={1} renderOrder={1000000} depthTest={false}
                />
              </React.Fragment>
            ))}

            {/* 연장선 - 가구 상단에서 내부너비 치수선(columnDimensionY)까지 */}
            <NativeLine name="dimension_line"
              points={[[leftX, spaceHeight, 0.001], [leftX, columnDimensionY, 0.001]]}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={1000000}
              depthTest={false}
              depthWrite={false}
              transparent={true}
            />
            <NativeLine name="dimension_line"
              points={[[rightX, spaceHeight, 0.001], [rightX, columnDimensionY, 0.001]]}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={1000000}
              depthTest={false}
              depthWrite={false}
              transparent={true}
            />

          </group>
        );
      })}

      {/* 기둥별 치수선 (개별 기둥 너비) - 불필요하므로 비활성화 */}
      {false && showDimensions && spaceInfo.columns && spaceInfo.columns.length > 0 && currentViewDirection !== 'top' && spaceInfo.columns.map((column, index) => {
        const columnWidthM = column.width * 0.01;
        const leftX = column.position[0] - columnWidthM / 2;
        const rightX = column.position[0] + columnWidthM / 2;
        // 개별 슬롯 치수선은 내부너비(columnDimensionY) 아래에 배치
        const dimY = slotDimensionY;

        return (
          <group key={`column-dim-${column.id}`}>
            {/* 기둥 치수선 */}
            <NativeLine name="dimension_line"
              points={[[leftX, dimY, 0.002], [rightX, dimY, 0.002]]}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={1000000}
              depthTest={false}
            />

            {/* 좌측 화살표 */}
            <NativeLine name="dimension_line"
              points={createArrowHead([leftX, dimY, 0.002], [leftX + 0.02, dimY, 0.002], 0.01)}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={1000000}
              depthTest={false}
            />

            {/* 우측 화살표 */}
            <NativeLine name="dimension_line"
              points={createArrowHead([rightX, dimY, 0.002], [rightX - 0.02, dimY, 0.002], 0.01)}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={1000000}
              depthTest={false}
            />

            {/* 기둥 치수 텍스트 - 치수선 아래에 표시 */}
            <Text
              position={[column.position[0], dimY - mmToThreeUnits(25), 0.01]}
              fontSize={baseFontSize}
              color={textColor}
              anchorX="center"
              anchorY="middle"
              outlineWidth={textOutlineWidth}
              outlineColor={textOutlineColor}
              renderOrder={1000000}
              depthTest={false}
            >
              {Math.round(column.width)}
            </Text>

            {/* 연장선 - 치수선에서 아래로 15mm만 */}
            <NativeLine name="dimension_line"
              points={[[leftX, dimY, 0.001], [leftX, dimY - mmToThreeUnits(15), 0.001]]}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={1000000}
              depthTest={false}
              depthWrite={false}
              transparent={true}
            />
            <NativeLine name="dimension_line"
              points={[[rightX, dimY, 0.001], [rightX, dimY - mmToThreeUnits(15), 0.001]]}
              color={dimensionColor}
              lineWidth={1}
              renderOrder={1000000}
              depthTest={false}
              depthWrite={false}
              transparent={true}
            />
          </group>
        );
      })}
      
      {/* 단내림 구간 치수선 - 탑뷰 */}
      {showDimensions && spaceInfo.droppedCeiling?.enabled && currentViewDirection === 'top' && (
        <group>
          {(() => {
            // 탑뷰에서 필요한 변수들 재정의
            const spaceWidth = mmToThreeUnits(spaceInfo.width);
            const spaceDepth = mmToThreeUnits(spaceInfo.depth);
            const spaceXOffset = -spaceWidth / 2;
            const spaceZOffset = -spaceDepth / 2;
            
            const subDimensionZ = spaceZOffset - mmToThreeUnits(hasPlacedModules ? 300 : 250); // 전체 폭 치수선 아래
            
            // 프레임 두께 계산
            const frameThickness = calculateFrameThickness(spaceInfo, hasLeftFurniture, hasRightFurniture);
            
            // 프레임을 포함한 전체 좌표 계산
            const mainWidth = spaceInfo.width - spaceInfo.droppedCeiling.width;
            const droppedWidth = spaceInfo.droppedCeiling.width;
            
            // 메인 구간 치수선
            const mainStartX = spaceInfo.droppedCeiling.position === 'left' 
              ? spaceXOffset + mmToThreeUnits(droppedWidth)
              : spaceXOffset;
            const mainEndX = spaceInfo.droppedCeiling.position === 'left'
              ? spaceXOffset + spaceWidth
              : spaceXOffset + mmToThreeUnits(mainWidth);
            
            // 단내림 구간 치수선
            const droppedStartX = spaceInfo.droppedCeiling.position === 'left'
              ? spaceXOffset
              : spaceXOffset + mmToThreeUnits(mainWidth);
            const droppedEndX = spaceInfo.droppedCeiling.position === 'left'
              ? spaceXOffset + mmToThreeUnits(droppedWidth)
              : spaceXOffset + spaceWidth;
            
            return (
              <>
                {/* 메인 구간 치수선 */}
                <Line
                  points={[[mainStartX, spaceHeight, subDimensionZ], [mainEndX, spaceHeight, subDimensionZ]]}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                <Line
                  points={createArrowHead([mainStartX, spaceHeight, subDimensionZ], [mainStartX + 0.05, spaceHeight, subDimensionZ])}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                <Line
                  points={createArrowHead([mainEndX, spaceHeight, subDimensionZ], [mainEndX - 0.05, spaceHeight, subDimensionZ])}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                {(showDimensionsText || isStep2) && (
                  <Text
                  renderOrder={1000}
                  depthTest={false}
                    position={[(mainStartX + mainEndX) / 2, spaceHeight + 0.1, subDimensionZ - mmToThreeUnits(30)]}
                    fontSize={smallFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                    rotation={[-Math.PI / 2, 0, 0]}
                  >
                    {(() => {
                      // 노서라운드일 때 실제 축소값 계산
                      let leftReduction = frameThickness.left;
                      let rightReduction = frameThickness.right;
                      
                      if (spaceInfo.surroundType === 'no-surround') {
                        if (spaceInfo.installType === 'builtin') {
                          // 양쪽벽: 설정된 이격거리 사용
                          leftReduction = spaceInfo.gapConfig?.left ?? 1.5;
                          rightReduction = spaceInfo.gapConfig?.right ?? 1.5;
                        } else if (spaceInfo.installType === 'semistanding') {
                          if (spaceInfo.wallConfig?.left) {
                            leftReduction = spaceInfo.gapConfig?.left ?? 1.5;
                            rightReduction = 20;
                          } else {
                            leftReduction = 20;
                            rightReduction = spaceInfo.gapConfig?.right ?? 1.5;
                          }
                        } else if (spaceInfo.installType === 'freestanding') {
                          // 벽없음: 슬롯은 엔드패널 포함, reduction 없음
                          leftReduction = 0;
                          rightReduction = 0;
                        }
                      }

                      // ColumnIndexer의 실제 계산된 너비 사용
                      const zoneSlotInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
                      return Math.round(zoneSlotInfo.normal.width);
                    })()}
                  </Text>
                )}
                
                {/* 단내림 구간 치수선 */}
                <Line
                  points={[[droppedStartX, spaceHeight, subDimensionZ], [droppedEndX, spaceHeight, subDimensionZ]]}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                <Line
                  points={createArrowHead([droppedStartX, spaceHeight, subDimensionZ], [droppedStartX + 0.05, spaceHeight, subDimensionZ])}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                <Line
                  points={createArrowHead([droppedEndX, spaceHeight, subDimensionZ], [droppedEndX - 0.05, spaceHeight, subDimensionZ])}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                {(showDimensionsText || isStep2) && (
                  <Text
                  renderOrder={1000}
                  depthTest={false}
                    position={[(droppedStartX + droppedEndX) / 2, spaceHeight + 0.1, subDimensionZ - mmToThreeUnits(30)]}
                    fontSize={smallFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                    rotation={[-Math.PI / 2, 0, 0]}
                  >
                    {(() => {
                      // 노서라운드일 때 실제 축소값 계산
                      let leftReduction = frameThickness.left;
                      let rightReduction = frameThickness.right;
                      
                      if (spaceInfo.surroundType === 'no-surround') {
                        if (spaceInfo.installType === 'builtin') {
                          // 양쪽벽: 설정된 이격거리 사용
                          leftReduction = spaceInfo.gapConfig?.left ?? 1.5;
                          rightReduction = spaceInfo.gapConfig?.right ?? 1.5;
                        } else if (spaceInfo.installType === 'semistanding') {
                          if (spaceInfo.wallConfig?.left) {
                            leftReduction = spaceInfo.gapConfig?.left ?? 1.5;
                            rightReduction = 20;
                          } else {
                            leftReduction = 20;
                            rightReduction = spaceInfo.gapConfig?.right ?? 1.5;
                          }
                        } else if (spaceInfo.installType === 'freestanding') {
                          // 벽없음: 슬롯은 엔드패널 포함, reduction 없음
                          leftReduction = 0;
                          rightReduction = 0;
                        }
                      }

                      // ColumnIndexer의 실제 계산된 너비 사용
                      const zoneSlotInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
                      return Math.round(zoneSlotInfo.dropped?.width || spaceInfo.droppedCeiling.width);
                    })()}
                  </Text>
                )}
                
                {/* 구간 분리 가이드라인 */}
                <Line
                  points={[
                    [spaceInfo.droppedCeiling.position === 'left' ? droppedEndX : mainEndX, spaceHeight, spaceZOffset], 
                    [spaceInfo.droppedCeiling.position === 'left' ? droppedEndX : mainEndX, spaceHeight, subDimensionZ - mmToThreeUnits(20)]
                  ]}
                  color={subGuideColor}
                  lineWidth={0.5}
                  dashed
                />
                
                {/* 연장선 - 메인 영역 */}
                <Line
                  points={[
                    [spaceInfo.droppedCeiling.position === 'left' ? mainEndX : mainStartX, spaceHeight, spaceZOffset],
                    [spaceInfo.droppedCeiling.position === 'left' ? mainEndX : mainStartX, spaceHeight, subDimensionZ - mmToThreeUnits(20)]
                  ]}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                
                {/* 경계면 이격거리 치수선 */}
                {(() => {
                  // ColumnIndexer에서 계산된 boundaryGap 사용
                  const zoneSlotInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
                  const boundaryGapMm = zoneSlotInfo.boundaryGap || 0;

                  const boundaryGapZ = subDimensionZ - mmToThreeUnits(60);
                  let boundaryLeftX: number;
                  let boundaryRightX: number;

                  if (spaceInfo.droppedCeiling.position === 'left') {
                    boundaryLeftX = droppedEndX;
                    boundaryRightX = mainStartX;
                  } else {
                    boundaryLeftX = mainEndX;
                    boundaryRightX = droppedStartX;
                  }

                  return (
                    <>
                      <Line
                        points={[[boundaryLeftX, spaceHeight, boundaryGapZ], [boundaryRightX, spaceHeight, boundaryGapZ]]}
                        color={dimensionColor}
                        lineWidth={1}
                      />
                      <Line
                        points={createArrowHead([boundaryLeftX, spaceHeight, boundaryGapZ], [boundaryLeftX + 0.02, spaceHeight, boundaryGapZ])}
                        color={dimensionColor}
                        lineWidth={1}
                      />
                      <Line
                        points={createArrowHead([boundaryRightX, spaceHeight, boundaryGapZ], [boundaryRightX - 0.02, spaceHeight, boundaryGapZ])}
                        color={dimensionColor}
                        lineWidth={1}
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
                              style={{ width: '50px', padding: '2px 4px', border: '1px solid #ccc', borderRadius: '2px', fontSize: '12px', fontWeight: 'bold', textAlign: 'center', outline: 'none', background: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#1f2937' : '#fff', color: currentViewDirection !== '3D' && view2DTheme === 'dark' ? '#fff' : '#000' }}
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
                            {`이격 ${boundaryGapMm}`}
                          </div>
                        </Html>
                      )}
                    </>
                  );
                })()}

                {/* 연장선 - 단내림 영역 */}
                <Line
                  points={[
                    [spaceInfo.droppedCeiling.position === 'left' ? droppedStartX : droppedEndX, spaceHeight, spaceZOffset],
                    [spaceInfo.droppedCeiling.position === 'left' ? droppedStartX : droppedEndX, spaceHeight, subDimensionZ - mmToThreeUnits(20)]
                  ]}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
              </>
            );
          })()}
        </group>
      )}
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
    if (viewDirection !== 'left') return null;
    
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
            lineWidth={1}
          />
          
          {/* 전면 화살표 *}
          <Line
            points={createArrowHead([leftDimensionX, topDimensionY, spaceZOffset], [leftDimensionX, topDimensionY, spaceZOffset + 0.05])}
            color={dimensionColor}
            lineWidth={1}
          />
          
          {/* 후면 화살표 *}
          <Line
            points={createArrowHead([leftDimensionX, topDimensionY, spaceZOffset + panelDepth], [leftDimensionX, topDimensionY, spaceZOffset + panelDepth - 0.05])}
            color={dimensionColor}
            lineWidth={1}
          />
          
          {/* 전체 깊이 치수 텍스트 *}
          {(showDimensionsText || isStep2) && (
            <Text
                  renderOrder={1000}
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
            lineWidth={1}
          />
          <Line
            points={[[0, actualSpaceHeight, spaceZOffset], [leftDimensionX - mmToThreeUnits(20), actualSpaceHeight, spaceZOffset]]}
            color={dimensionColor}
            lineWidth={1}
          />
          
          {/* 연장선 (후면) *}
          <Line
            points={[[0, 0, spaceZOffset + panelDepth], [leftDimensionX - mmToThreeUnits(20), 0, spaceZOffset + panelDepth]]}
            color={dimensionColor}
            lineWidth={1}
          />
          <Line
            points={[[0, actualSpaceHeight, spaceZOffset + panelDepth], [leftDimensionX - mmToThreeUnits(20), actualSpaceHeight, spaceZOffset + panelDepth]]}
            color={dimensionColor}
            lineWidth={1}
          />
        </group> */}

        {/* 우측 3구간 높이 치수선 표시 */}
        {showDimensions && <group>
          {(() => {
            const rightDimensionZ = spaceZOffset + panelDepth + mmToThreeUnits(120); // 우측 치수선 위치

            // useMemo로 메모이제이션된 값 사용
            const {
              maxLowerCabinetHeightMm,
              adjustedUpperCabinetHeightMm,
              isFloating,
              floatHeight,
              floorFinishHeightMm,
              bottomFrameHeight,
              topFrameHeight
            } = furnitureHeights;

            // 단내림 구간이면 단내림 높이, 일반 구간이면 전체 높이 사용
            const cabinetPlacementHeight = Math.max(spaceInfo.height - topFrameHeight - bottomFrameHeight, 0); // 캐비넷 배치 영역 (바닥마감재는 받침대에 포함)

            const bottomY = 0; // 바닥
            const floorFinishTopYLocal = mmToThreeUnits(floorFinishHeightMm); // 바닥마감재 상단
            const baseStartYLocal = floorFinishHeightMm > 0 ? floorFinishTopYLocal : bottomY; // 받침대 시작점
            const bottomFrameTopY = mmToThreeUnits(bottomFrameHeight); // 하부 프레임 상단
            const cabinetAreaTopY = mmToThreeUnits(bottomFrameHeight + cabinetPlacementHeight); // 캐비넷 영역 상단
            const topFrameTopY = cabinetAreaTopY + mmToThreeUnits(topFrameHeight); // 상부 프레임 상단

            // 배치된 가구들의 최대 높이 계산 (좌측뷰)
            let maxFurnitureTop = topFrameTopY;
            let maxModuleHeightMm = 0;
            let tallestModuleTopY = cabinetAreaTopY;

            if (placedModules.length > 0) {
              placedModules.forEach(module => {
                const moduleData = getModuleById(module.moduleId);
                if (moduleData) {
                  const moduleHeight = module.customHeight ?? moduleData.dimensions.height;
                  // 띄움배치 시에는 바닥재 + floatHeight를 기준으로, 아니면 bottomFrameTopY를 기준으로
                  const furnitureStartY = isFloating ? mmToThreeUnits(floorFinishHeightMm + floatHeight) : bottomFrameTopY;
                  const moduleTopY = furnitureStartY + mmToThreeUnits(moduleHeight);
                  if (moduleTopY > maxFurnitureTop) {
                    maxFurnitureTop = moduleTopY;
                  }
                  if (moduleHeight > maxModuleHeightMm) {
                    maxModuleHeightMm = moduleHeight;
                    tallestModuleTopY = moduleTopY;
                  }
                }
              });
            }

            const hasFurnitureHeight = maxModuleHeightMm > 0;
            const furnitureHeightValue = hasFurnitureHeight ? maxModuleHeightMm : cabinetPlacementHeight;
            const furnitureTopY = hasFurnitureHeight ? tallestModuleTopY : cabinetAreaTopY;
            // 띄움배치 시에는 바닥재 + floatHeight를 기준으로 텍스트 위치 계산
            const furnitureStartY = isFloating ? mmToThreeUnits(floorFinishHeightMm + floatHeight) : bottomFrameTopY;
            const furnitureTextY = furnitureStartY + (furnitureTopY - furnitureStartY) / 2;
            const topFrameLineTopY = topFrameTopY;
            const extraFurnitureHeightUnits = maxFurnitureTop - topFrameLineTopY;
            const extraFurnitureHeightMm = extraFurnitureHeightUnits > 1e-6 ? Math.round(threeUnitsToMm(extraFurnitureHeightUnits)) : 0;
            const hasExtraFurnitureHeight = extraFurnitureHeightMm > 0;
            const extraFurnitureZ = rightDimensionZ + mmToThreeUnits(40);
            const extraFurnitureTextY = topFrameLineTopY + (maxFurnitureTop - topFrameLineTopY) / 2;

            console.log('📐 [좌측뷰] 치수 렌더링:', {
              isFloating,
              floatHeight,
              maxLowerCabinetHeightMm,
              adjustedUpperCabinetHeightMm,
              floorFinishHeightMm,
              bottomFrameHeight
            });

            return (
              <>
                {/* 1. 띄움 높이 또는 하부 프레임 높이 */}
                {/* 띄움 배치인 경우: 띄움 높이 표시 (실제 가구 위치에 맞춤) */}
                {isFloating && floatHeight > 0 && (
                <group>
                  <Line
                    points={[[0, mmToThreeUnits(floorFinishHeightMm), rightDimensionZ], [0, mmToThreeUnits(floorFinishHeightMm + floatHeight), rightDimensionZ]]}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([0, mmToThreeUnits(floorFinishHeightMm), rightDimensionZ], [0, mmToThreeUnits(floorFinishHeightMm) + 0.03, rightDimensionZ])}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([0, mmToThreeUnits(floorFinishHeightMm + floatHeight), rightDimensionZ], [0, mmToThreeUnits(floorFinishHeightMm + floatHeight) + 0.03, rightDimensionZ])}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Text
                    renderOrder={1000}
                    depthTest={false}
                    position={[0, mmToThreeUnits(floorFinishHeightMm) + mmToThreeUnits(floatHeight / 2), rightDimensionZ + mmToThreeUnits(60)]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                    rotation={[0, -Math.PI / 2, -Math.PI / 2]}
                  >
                    {floatHeight}
                  </Text>
                </group>
                )}

                {/* 바닥마감재 두께 치수선 (평면 뷰) */}
                {!isFloating && floorFinishHeightMm > 0 && (
                <group>
                  <Line
                    points={[[0, bottomY, rightDimensionZ], [0, floorFinishTopYLocal, rightDimensionZ]]}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([0, bottomY, rightDimensionZ], [0, 0.03, rightDimensionZ])}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([0, floorFinishTopYLocal, rightDimensionZ], [0, floorFinishTopYLocal + 0.03, rightDimensionZ])}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Text
                    renderOrder={1000}
                    depthTest={false}
                    position={[0, floorFinishTopYLocal / 2, rightDimensionZ + mmToThreeUnits(60)]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                    rotation={[0, -Math.PI / 2, -Math.PI / 2]}
                  >
                    {floorFinishHeightMm}
                  </Text>
                </group>
                )}

                {/* 띄움 배치가 아니고 받침대가 있는 경우: 하부 프레임 높이 표시 */}
                {!isFloating && bottomFrameHeight > 0 && (
                <group>
                  <Line
                    points={[[0, baseStartYLocal, rightDimensionZ], [0, bottomFrameTopY, rightDimensionZ]]}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([0, baseStartYLocal, rightDimensionZ], [0, baseStartYLocal - 0.03, rightDimensionZ])}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([0, bottomFrameTopY, rightDimensionZ], [0, bottomFrameTopY + 0.03, rightDimensionZ])}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Text
                    renderOrder={1000}
                    depthTest={false}
                    position={[0, (baseStartYLocal + bottomFrameTopY) / 2, rightDimensionZ + mmToThreeUnits(60)]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                    rotation={[0, -Math.PI / 2, -Math.PI / 2]}
                  >
                    {Math.max(0, bottomFrameHeight - floorFinishHeightMm)}
                  </Text>
                </group>
                )}

                {/* 2. 하부섹션 높이 (띄움 배치 시) 또는 캐비넷/가구 높이 (일반 배치 시) */}
                {/* 띄움 배치이고 하부장이 있는 경우: 하부섹션 높이 표시 */}
                {isFloating && maxLowerCabinetHeightMm > 0 && (
                <group>
                  <Line
                    points={[[0, mmToThreeUnits(floorFinishHeightMm + floatHeight), rightDimensionZ], [0, mmToThreeUnits(floorFinishHeightMm + floatHeight + maxLowerCabinetHeightMm), rightDimensionZ]]}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([0, mmToThreeUnits(floorFinishHeightMm + floatHeight), rightDimensionZ], [0, mmToThreeUnits(floorFinishHeightMm + floatHeight) + 0.03, rightDimensionZ])}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([0, mmToThreeUnits(floorFinishHeightMm + floatHeight + maxLowerCabinetHeightMm), rightDimensionZ], [0, mmToThreeUnits(floorFinishHeightMm + floatHeight + maxLowerCabinetHeightMm) - 0.03, rightDimensionZ])}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Text
                    renderOrder={1000}
                    depthTest={false}
                    position={[0, mmToThreeUnits(floorFinishHeightMm + floatHeight) + mmToThreeUnits(maxLowerCabinetHeightMm / 2), rightDimensionZ + mmToThreeUnits(60)]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                    rotation={[0, -Math.PI / 2, -Math.PI / 2]}
                  >
                    {maxLowerCabinetHeightMm}
                  </Text>
                </group>
                )}

                {/* 띄움 배치가 아닌 경우: 일반 가구 높이 표시 */}
                {!isFloating && (
                <group>
                  <Line
                    points={[[0, bottomFrameTopY, rightDimensionZ], [0, furnitureTopY, rightDimensionZ]]}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([0, bottomFrameTopY, rightDimensionZ], [0, bottomFrameTopY + 0.03, rightDimensionZ])}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([0, furnitureTopY, rightDimensionZ], [0, furnitureTopY - 0.03, rightDimensionZ])}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Text
                    renderOrder={1000}
                    depthTest={false}
                    position={[0, furnitureTextY, rightDimensionZ + mmToThreeUnits(60)]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                    rotation={[0, -Math.PI / 2, -Math.PI / 2]}
                  >
                    {furnitureHeightValue}
                  </Text>
                </group>
                )}

                {/* 3. 상부섹션 높이 (띄움 배치이고 상부장이 있는 경우) */}
                {isFloating && adjustedUpperCabinetHeightMm > 0 && (
                <group>
                  <Line
                    points={[[0, mmToThreeUnits(floorFinishHeightMm + floatHeight + maxLowerCabinetHeightMm), rightDimensionZ], [0, mmToThreeUnits(floorFinishHeightMm + floatHeight + maxLowerCabinetHeightMm + adjustedUpperCabinetHeightMm), rightDimensionZ]]}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([0, mmToThreeUnits(floorFinishHeightMm + floatHeight + maxLowerCabinetHeightMm), rightDimensionZ], [0, mmToThreeUnits(floorFinishHeightMm + floatHeight + maxLowerCabinetHeightMm) + 0.03, rightDimensionZ])}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([0, mmToThreeUnits(floorFinishHeightMm + floatHeight + maxLowerCabinetHeightMm + adjustedUpperCabinetHeightMm), rightDimensionZ], [0, mmToThreeUnits(floorFinishHeightMm + floatHeight + maxLowerCabinetHeightMm + adjustedUpperCabinetHeightMm) - 0.03, rightDimensionZ])}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Text
                    renderOrder={1000}
                    depthTest={false}
                    position={[0, mmToThreeUnits(floorFinishHeightMm + floatHeight + maxLowerCabinetHeightMm) + mmToThreeUnits(adjustedUpperCabinetHeightMm / 2), rightDimensionZ + mmToThreeUnits(60)]}
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

                {/* 4. 상부 프레임 높이 / 노서라운드일 때는 상부 이격거리 - 자유배치에서는 숨김 */}
                {!isFreePlacement && (
                <group>
                  <Line
                    points={[[0, cabinetAreaTopY, rightDimensionZ], [0, topFrameTopY, rightDimensionZ]]}
                    color={spaceInfo.surroundType === 'no-surround' ? textColor : frameDimensionColor}
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([0, cabinetAreaTopY, rightDimensionZ], [0, cabinetAreaTopY + 0.03, rightDimensionZ])}
                    color={spaceInfo.surroundType === 'no-surround' ? textColor : frameDimensionColor}
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([0, topFrameTopY, rightDimensionZ], [0, topFrameTopY - 0.03, rightDimensionZ])}
                    color={spaceInfo.surroundType === 'no-surround' ? textColor : frameDimensionColor}
                    lineWidth={1}
                  />
                  <Text
                  renderOrder={1000}
                  depthTest={false}
                    position={[0, cabinetAreaTopY + mmToThreeUnits(topFrameHeight / 2), rightDimensionZ + mmToThreeUnits(60)]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                    rotation={[0, -Math.PI / 2, -Math.PI / 2]}
                  >
                    {topFrameHeight}
                  </Text>
                </group>
                )}

                {/* 5. 상부 프레임 이상 돌출 구간 */}
                {hasExtraFurnitureHeight && (
                <group>
                  <Line
                    points={[[0, topFrameTopY, extraFurnitureZ], [0, maxFurnitureTop, extraFurnitureZ]]}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([0, topFrameTopY, extraFurnitureZ], [0, topFrameTopY + 0.03, extraFurnitureZ])}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([0, maxFurnitureTop, extraFurnitureZ], [0, maxFurnitureTop - 0.03, extraFurnitureZ])}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Text
                  renderOrder={1000}
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

                {/* 연장선들 */}
                <Line
                  points={[[0, bottomY, spaceZOffset], [0, bottomY, rightDimensionZ - mmToThreeUnits(20)]]}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                {/* 하부 프레임 상단 연장선 - 받침대가 있는 경우에만 표시 */}
                {bottomFrameHeight > 0 && (
                <Line
                  points={[[0, bottomFrameTopY, spaceZOffset], [0, bottomFrameTopY, rightDimensionZ - mmToThreeUnits(20)]]}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                )}
                <Line
                  points={[[0, cabinetAreaTopY, spaceZOffset], [0, cabinetAreaTopY, rightDimensionZ - mmToThreeUnits(20)]]}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                <Line
                  points={[[0, topY, spaceZOffset], [0, topY, rightDimensionZ - mmToThreeUnits(20)]]}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
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
          const upperDepth = module.upperSectionDepth || module.customDepth || moduleData.dimensions.depth;
          const lowerDepth = module.lowerSectionDepth || module.customDepth || moduleData.dimensions.depth;

          console.log('📏📏📏 [좌측뷰 깊이 치수] module.id=', module.id, 'upperSectionDepth=', module.upperSectionDepth, 'lowerSectionDepth=', module.lowerSectionDepth, 'upperDepth=', upperDepth, 'lowerDepth=', lowerDepth);

          // 상부 치수용 (기본값: 상부섹션 깊이)
          const actualDepth = upperDepth;
          const moduleDepth = mmToThreeUnits(actualDepth);
          
          // 실제 가구 Z 위치 계산 (FurnitureItem.tsx와 동일)
          const doorThickness = mmToThreeUnits(20);
          const furnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - moduleDepth/2;
          const furnitureBackZ = furnitureZ - moduleDepth/2;
          const furnitureFrontZ = furnitureZ + moduleDepth/2;
          
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
                lineWidth={1}
              />

              {/* 화살표들 */}
              <Line
                points={createArrowHead([furnitureX, dimY, furnitureBackZ], [furnitureX, dimY, furnitureBackZ + 0.02], 0.01)}
                color={dimensionColor}
                lineWidth={1}
              />
              <Line
                points={createArrowHead([furnitureX, dimY, furnitureFrontZ], [furnitureX, dimY, furnitureFrontZ - 0.02], 0.01)}
                color={dimensionColor}
                lineWidth={1}
              />

              {/* 치수 텍스트 */}
              <Text
                renderOrder={1000}
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
                lineWidth={1}
                dashed={false}
              />
              <Line
                points={[[furnitureX, furnitureTopY, furnitureFrontZ], [furnitureX, dimY + mmToThreeUnits(10), furnitureFrontZ]]}
                color={dimensionColor}
                lineWidth={1}
                dashed={false}
              />

              {/* 하부섹션 깊이 치수 (2섹션 가구인 경우) */}
              {hasMultiSection && (() => {
                const lowerModuleDepth = mmToThreeUnits(lowerDepth);
                const lowerFurnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - lowerModuleDepth/2;
                const lowerBackZ = lowerFurnitureZ - lowerModuleDepth/2;
                const lowerFrontZ = lowerFurnitureZ + lowerModuleDepth/2;
                const lowerDimY = mmToThreeUnits(-50); // 하단 치수선 위치
                const furnitureBottomY = module.position.y - furnitureHeight / 2;

                return (
                  <group>
                    {/* 하부 깊이 치수선 */}
                    <Line
                      points={[[furnitureX, lowerDimY, lowerBackZ], [furnitureX, lowerDimY, lowerFrontZ]]}
                      color={dimensionColor}
                      lineWidth={1}
                    />

                    {/* 화살표들 */}
                    <Line
                      points={createArrowHead([furnitureX, lowerDimY, lowerBackZ], [furnitureX, lowerDimY, lowerBackZ + 0.02], 0.01)}
                      color={dimensionColor}
                      lineWidth={1}
                    />
                    <Line
                      points={createArrowHead([furnitureX, lowerDimY, lowerFrontZ], [furnitureX, lowerDimY, lowerFrontZ - 0.02], 0.01)}
                      color={dimensionColor}
                      lineWidth={1}
                    />

                    {/* 치수 텍스트 */}
                    <Text
                      renderOrder={1000}
                      depthTest={false}
                      position={[furnitureX, lowerDimY - mmToThreeUnits(50), (lowerBackZ + lowerFrontZ) / 2]}
                      fontSize={largeFontSize}
                      color={textColor}
                      anchorX="center"
                      anchorY="middle"
                    >
                      {lowerDepth}
                    </Text>

                    {/* 연장선 (가구 하단에서 치수선까지) */}
                    <Line
                      points={[[furnitureX, furnitureBottomY, lowerBackZ], [furnitureX, lowerDimY - mmToThreeUnits(10), lowerBackZ]]}
                      color={dimensionColor}
                      lineWidth={1}
                      dashed={false}
                    />
                    <Line
                      points={[[furnitureX, furnitureBottomY, lowerFrontZ], [furnitureX, lowerDimY - mmToThreeUnits(10), lowerFrontZ]]}
                      color={dimensionColor}
                      lineWidth={1}
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
              
              // 메인 구간 치수선 (좌측뷰에서는 좌우가 반대)
              const mainStartX = spaceInfo.droppedCeiling.position === 'left' 
                ? -actualSpaceWidth/2 + mmToThreeUnits(droppedBounds.width)
                : -actualSpaceWidth/2;
              const mainEndX = spaceInfo.droppedCeiling.position === 'left'
                ? actualSpaceWidth/2
                : -actualSpaceWidth/2 + mmToThreeUnits(normalBounds.width);
              
              // 단내림 구간 치수선
              const droppedStartX = spaceInfo.droppedCeiling.position === 'left'
                ? -actualSpaceWidth/2
                : -actualSpaceWidth/2 + mmToThreeUnits(normalBounds.width);
              const droppedEndX = spaceInfo.droppedCeiling.position === 'left'
                ? -actualSpaceWidth/2 + mmToThreeUnits(droppedBounds.width)
                : actualSpaceWidth/2;
              
              return (
                <>
                  {/* 메인 구간 치수선 */}
                  <Line
                    points={[[mainStartX, subDimensionY, 0], [mainEndX, subDimensionY, 0]]}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([mainStartX, subDimensionY, 0], [mainStartX + 0.05, subDimensionY, 0])}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([mainEndX, subDimensionY, 0], [mainEndX - 0.05, subDimensionY, 0])}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Text
                  renderOrder={1000}
                  depthTest={false}
                    position={[(mainStartX + mainEndX) / 2, subDimensionY + mmToThreeUnits(30), 0]}
                    fontSize={smallFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                  >
                    {(() => {
                      const frameThickness = calculateFrameThickness(spaceInfo, hasLeftFurniture, hasRightFurniture);
                      console.log('🔍 좌측뷰 메인구간 프레임 계산:', {
                        surroundType: spaceInfo.surroundType,
                        installType: spaceInfo.installType,
                        wallConfig: spaceInfo.wallConfig,
                        frameThickness,
                        droppedPosition: spaceInfo.droppedCeiling.position
                      });
                      
                      // 노서라운드일 때 실제 축소값 계산
                      let leftReduction = frameThickness.left;
                      let rightReduction = frameThickness.right;
                      
                      if (spaceInfo.surroundType === 'no-surround') {
                        if (spaceInfo.installType === 'builtin') {
                          leftReduction = 2;
                          rightReduction = 2;
                        } else if (spaceInfo.installType === 'semistanding') {
                          if (spaceInfo.wallConfig?.left) {
                            leftReduction = 2;
                            rightReduction = 20;
                          } else {
                            leftReduction = 20;
                            rightReduction = 2;
                          }
                        } else if (spaceInfo.installType === 'freestanding') {
                          leftReduction = 20;
                          rightReduction = 20;
                        }
                      }
                      
                      if (spaceInfo.droppedCeiling.position === 'left') {
                        // 왼쪽 단내림: 메인구간은 오른쪽 프레임/엔드패널 제외
                        return spaceInfo.width - spaceInfo.droppedCeiling.width - rightReduction;
                      } else {
                        // 오른쪽 단내림: 메인구간은 왼쪽 프레임/엔드패널 제외
                        return spaceInfo.width - spaceInfo.droppedCeiling.width - leftReduction;
                      }
                    })()}
                  </Text>
                  
                  {/* 단내림 구간 치수선 */}
                  <Line
                    points={[[droppedStartX, subDimensionY, 0], [droppedEndX, subDimensionY, 0]]}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([droppedStartX, subDimensionY, 0], [droppedStartX + 0.05, subDimensionY, 0])}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([droppedEndX, subDimensionY, 0], [droppedEndX - 0.05, subDimensionY, 0])}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Text
                  renderOrder={1000}
                  depthTest={false}
                    position={[(droppedStartX + droppedEndX) / 2, subDimensionY + mmToThreeUnits(30), 0]}
                    fontSize={smallFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                  >
                    {(() => {
                      const frameThickness = calculateFrameThickness(spaceInfo, hasLeftFurniture, hasRightFurniture);
                      
                      // 노서라운드일 때 실제 축소값 계산
                      let leftReduction = frameThickness.left;
                      let rightReduction = frameThickness.right;
                      
                      if (spaceInfo.surroundType === 'no-surround') {
                        if (spaceInfo.installType === 'builtin') {
                          leftReduction = 2;
                          rightReduction = 2;
                        } else if (spaceInfo.installType === 'semistanding') {
                          if (spaceInfo.wallConfig?.left) {
                            leftReduction = 2;
                            rightReduction = 20;
                          } else {
                            leftReduction = 20;
                            rightReduction = 2;
                          }
                        } else if (spaceInfo.installType === 'freestanding') {
                          leftReduction = 20;
                          rightReduction = 20;
                        }
                      }
                      
                      if (spaceInfo.droppedCeiling.position === 'left') {
                        // 왼쪽 단내림: 단내림구간은 왼쪽 프레임/엔드패널 제외
                        return spaceInfo.droppedCeiling.width - leftReduction;
                      } else {
                        // 오른쪽 단내림: 단내림구간은 오른쪽 프레임/엔드패널 제외
                        return spaceInfo.droppedCeiling.width - rightReduction;
                      }
                    })()}
                  </Text>
                  
                  {/* 구간 분리 가이드라인 */}
                  <Line
                    points={[
                      [spaceInfo.droppedCeiling.position === 'left' ? -actualSpaceWidth/2 + mmToThreeUnits(droppedBounds.width) : -actualSpaceWidth/2 + mmToThreeUnits(normalBounds.width), 0, 0],
                      [spaceInfo.droppedCeiling.position === 'left' ? -actualSpaceWidth/2 + mmToThreeUnits(droppedBounds.width) : -actualSpaceWidth/2 + mmToThreeUnits(normalBounds.width), subDimensionY - mmToThreeUnits(20), 0]
                    ]}
                    color={subGuideColor}
                    lineWidth={1}
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
    if (viewDirection !== 'right') return null;
    
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
            lineWidth={1}
          />
          
          {/* 전면 화살표 *}
          <Line
            points={createArrowHead([rightDimensionX, topDimensionY, spaceZOffset], [rightDimensionX, topDimensionY, spaceZOffset + 0.05])}
            color={dimensionColor}
            lineWidth={1}
          />
          
          {/* 후면 화살표 *}
          <Line
            points={createArrowHead([rightDimensionX, topDimensionY, spaceZOffset + panelDepth], [rightDimensionX, topDimensionY, spaceZOffset + panelDepth - 0.05])}
            color={dimensionColor}
            lineWidth={1}
          />
          
          {/* 전체 깊이 치수 텍스트 *}
          {(showDimensionsText || isStep2) && (
            <Text
                  renderOrder={1000}
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
            lineWidth={1}
          />
          <Line
            points={[[actualSpaceWidth, actualSpaceHeight, spaceZOffset], [rightDimensionX + mmToThreeUnits(20), actualSpaceHeight, spaceZOffset]]}
            color={dimensionColor}
            lineWidth={1}
          />
          
          {/* 연장선 (후면) *}
          <Line
            points={[[actualSpaceWidth, 0, spaceZOffset + panelDepth], [rightDimensionX + mmToThreeUnits(20), 0, spaceZOffset + panelDepth]]}
            color={dimensionColor}
            lineWidth={1}
          />
          <Line
            points={[[actualSpaceWidth, actualSpaceHeight, spaceZOffset + panelDepth], [rightDimensionX + mmToThreeUnits(20), actualSpaceHeight, spaceZOffset + panelDepth]]}
            color={dimensionColor}
            lineWidth={1}
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
                  {/* 우측 단내림 - 우측 외부 치수선에 단내림 구간 높이 표시 */}
                  <Line
                    points={[[rightDimensionX, mmToThreeUnits(spaceInfo.height - spaceInfo.droppedCeiling.dropHeight), spaceZOffset - mmToThreeUnits(200)], [rightDimensionX, actualSpaceHeight, spaceZOffset - mmToThreeUnits(200)]]}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  
                  {/* 하단 화살표 */}
                  <Line
                    points={createArrowHead([rightDimensionX, mmToThreeUnits(spaceInfo.height - spaceInfo.droppedCeiling.dropHeight), spaceZOffset - mmToThreeUnits(200)], [rightDimensionX, mmToThreeUnits(spaceInfo.height - spaceInfo.droppedCeiling.dropHeight) + 0.05, spaceZOffset - mmToThreeUnits(200)])}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  
                  {/* 상단 화살표 */}
                  <Line
                    points={createArrowHead([rightDimensionX, actualSpaceHeight, spaceZOffset - mmToThreeUnits(200)], [rightDimensionX, actualSpaceHeight - 0.05, spaceZOffset - mmToThreeUnits(200)])}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  
                  {/* 단내림 구간 높이 텍스트 */}
                  {(showDimensionsText || isStep2) && (
                    <Text
                  renderOrder={1000}
                  depthTest={false}
                      position={[rightDimensionX + mmToThreeUnits(60), mmToThreeUnits(spaceInfo.height - spaceInfo.droppedCeiling.dropHeight / 2), spaceZOffset - mmToThreeUnits(200)]}
                      fontSize={largeFontSize}
                      color={textColor}
                      anchorX="center"
                      anchorY="middle"
                      outlineWidth={textOutlineWidth}
                      outlineColor={textOutlineColor}
                      rotation={[0, 0, -Math.PI / 2]}
                    >
                      {spaceInfo.droppedCeiling.dropHeight}
                    </Text>
                  )}
                </>
              ) : (
                <>
                  {/* 좌측 단내림 - 우측 외부 치수선에 전체 높이 표시 */}
                  <Line
                    points={[[rightDimensionX, 0, spaceZOffset - mmToThreeUnits(200)], [rightDimensionX, actualSpaceHeight, spaceZOffset - mmToThreeUnits(200)]]}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  
                  {/* 하단 화살표 */}
                  <Line
                    points={createArrowHead([rightDimensionX, 0, spaceZOffset - mmToThreeUnits(200)], [rightDimensionX, 0.05, spaceZOffset - mmToThreeUnits(200)])}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  
                  {/* 상단 화살표 */}
                  <Line
                    points={createArrowHead([rightDimensionX, actualSpaceHeight, spaceZOffset - mmToThreeUnits(200)], [rightDimensionX, actualSpaceHeight - 0.05, spaceZOffset - mmToThreeUnits(200)])}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  
                  {/* 전체 높이 텍스트 */}
                  {(showDimensionsText || isStep2) && (
                    <Text
                  renderOrder={1000}
                  depthTest={false}
                      position={[rightDimensionX + mmToThreeUnits(60), actualSpaceHeight / 2, spaceZOffset - mmToThreeUnits(200)]}
                      fontSize={largeFontSize}
                      color={textColor}
                      anchorX="center"
                      anchorY="middle"
                      outlineWidth={textOutlineWidth}
                      outlineColor={textOutlineColor}
                      rotation={[0, 0, -Math.PI / 2]}
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
                lineWidth={1}
              />

              {/* 하단 화살표 */}
              <Line
                points={createArrowHead([rightDimensionX, 0, spaceZOffset - mmToThreeUnits(200)], [rightDimensionX, 0.05, spaceZOffset - mmToThreeUnits(200)])}
                color={dimensionColor}
                lineWidth={1}
              />

              {/* 상단 화살표 */}
              <Line
                points={createArrowHead([rightDimensionX, actualSpaceHeight, spaceZOffset - mmToThreeUnits(200)], [rightDimensionX, actualSpaceHeight - 0.05, spaceZOffset - mmToThreeUnits(200)])}
                color={dimensionColor}
                lineWidth={1}
              />

              {/* 전체 높이 치수 텍스트 */}
              {(showDimensionsText || isStep2) && (
                <Text
                  renderOrder={1000}
                  depthTest={false}
                  position={[rightDimensionX + mmToThreeUnits(60), actualSpaceHeight / 2, spaceZOffset - mmToThreeUnits(200)]}
                  fontSize={largeFontSize}
                  color={textColor}
                  anchorX="center"
                  anchorY="middle"
                  outlineWidth={textOutlineWidth}
                  outlineColor={textOutlineColor}
                  rotation={[0, 0, -Math.PI / 2]}
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
            lineWidth={1}
          />
          <Line
            points={[[actualSpaceWidth, actualSpaceHeight, spaceZOffset], [actualSpaceWidth, actualSpaceHeight, spaceZOffset - mmToThreeUnits(180)]]}
            color={dimensionColor}
            lineWidth={1}
          />
          
          {/* 단내림 높이 연장선 - 단내림이 있는 경우에만 표시 */}
          {spaceInfo.droppedCeiling?.enabled && (
            <Line
              points={[
                [actualSpaceWidth, mmToThreeUnits(spaceInfo.height - spaceInfo.droppedCeiling.dropHeight), spaceZOffset], 
                [actualSpaceWidth, mmToThreeUnits(spaceInfo.height - spaceInfo.droppedCeiling.dropHeight), spaceZOffset - mmToThreeUnits(180)]
              ]}
              color={dimensionColor}
              lineWidth={1}
            />
          )}
        </group>}

        {/* 좌측 3구간 높이 치수선 */}
        {showDimensions && <group>
          {(() => {
            const leftDimensionZ = spaceZOffset + panelDepth + mmToThreeUnits(120);

            // useMemo로 메모이제이션된 값 사용
            const {
              maxLowerCabinetHeightMm,
              adjustedUpperCabinetHeightMm,
              isFloating,
              floatHeight,
              floorFinishHeightMm,
              bottomFrameHeight,
              topFrameHeight
            } = furnitureHeights;

            // 단내림 구간이면 단내림 높이, 일반 구간이면 전체 높이 사용
            const cabinetPlacementHeight = Math.max(spaceInfo.height - topFrameHeight - bottomFrameHeight, 0); // 바닥마감재는 받침대에 포함

            const bottomY = 0;
            const floorFinishTopYRight = mmToThreeUnits(floorFinishHeightMm);
            const baseStartYRight = floorFinishHeightMm > 0 ? floorFinishTopYRight : bottomY;
            const bottomFrameTopY = mmToThreeUnits(bottomFrameHeight);
            const cabinetAreaTopY = mmToThreeUnits(bottomFrameHeight + cabinetPlacementHeight);
            const topFrameTopY = cabinetAreaTopY + mmToThreeUnits(topFrameHeight);

            // 배치된 가구들의 최대 높이 계산 (우측뷰)
            let maxFurnitureTop = topFrameTopY;
            let maxModuleHeightMm = 0;
            let tallestModuleTopY = cabinetAreaTopY;

            if (placedModules.length > 0) {
              placedModules.forEach(module => {
                const moduleData = getModuleById(module.moduleId);
                if (moduleData) {
                  const moduleHeight = module.customHeight ?? moduleData.dimensions.height;
                  // 띄움배치 시에는 바닥재 + floatHeight를 기준으로, 아니면 bottomFrameTopY를 기준으로
                  const furnitureStartY = isFloating ? mmToThreeUnits(floorFinishHeightMm + floatHeight) : bottomFrameTopY;
                  const moduleTopY = furnitureStartY + mmToThreeUnits(moduleHeight);
                  if (moduleTopY > maxFurnitureTop) {
                    maxFurnitureTop = moduleTopY;
                  }
                  if (moduleHeight > maxModuleHeightMm) {
                    maxModuleHeightMm = moduleHeight;
                    tallestModuleTopY = moduleTopY;
                  }
                }
              });
            }

            const hasFurnitureHeight = maxModuleHeightMm > 0;
            const furnitureHeightValue = hasFurnitureHeight ? maxModuleHeightMm : cabinetPlacementHeight;
            const furnitureTopY = hasFurnitureHeight ? tallestModuleTopY : cabinetAreaTopY;
            // 띄움배치 시에는 바닥재 + floatHeight를 기준으로 텍스트 위치 계산
            const furnitureStartY = isFloating ? mmToThreeUnits(floorFinishHeightMm + floatHeight) : bottomFrameTopY;
            const furnitureTextY = furnitureStartY + (furnitureTopY - furnitureStartY) / 2;
            const topFrameLineTopY = topFrameTopY;
            const extraFurnitureHeightUnits = maxFurnitureTop - topFrameLineTopY;
            const extraFurnitureHeightMm = extraFurnitureHeightUnits > 1e-6 ? Math.round(threeUnitsToMm(extraFurnitureHeightUnits)) : 0;
            const hasExtraFurnitureHeight = extraFurnitureHeightMm > 0;
            const extraFurnitureZ = leftDimensionZ + mmToThreeUnits(40);
            const extraFurnitureTextY = topFrameLineTopY + (maxFurnitureTop - topFrameLineTopY) / 2;

            console.log('📐 [우측뷰] 치수 렌더링:', {
              isFloating,
              floatHeight,
              maxLowerCabinetHeightMm,
              adjustedUpperCabinetHeightMm,
              floorFinishHeightMm,
              bottomFrameHeight
            });

            return (
              <>
                {/* 1. 띄움 높이 또는 하부 프레임 높이 */}
                {/* 띄움 배치인 경우: 띄움 높이 표시 (실제 가구 위치에 맞춤) */}
                {isFloating && floatHeight > 0 && (
                <group>
                  <Line
                    points={[[spaceWidth, mmToThreeUnits(floorFinishHeightMm), leftDimensionZ], [spaceWidth, mmToThreeUnits(floorFinishHeightMm + floatHeight), leftDimensionZ]]}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, mmToThreeUnits(floorFinishHeightMm), leftDimensionZ], [spaceWidth, mmToThreeUnits(floorFinishHeightMm) + 0.03, leftDimensionZ])}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, mmToThreeUnits(floorFinishHeightMm + floatHeight), leftDimensionZ], [spaceWidth, mmToThreeUnits(floorFinishHeightMm + floatHeight) + 0.03, leftDimensionZ])}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Text
                    renderOrder={1000}
                    depthTest={false}
                    position={[spaceWidth, mmToThreeUnits(floorFinishHeightMm) + mmToThreeUnits(floatHeight / 2), leftDimensionZ + mmToThreeUnits(60)]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                    rotation={[0, 0, -Math.PI / 2]}
                  >
                    {floatHeight}
                  </Text>
                </group>
                )}

                {/* 바닥마감재 두께 치수선 (측면 뷰) */}
                {!isFloating && floorFinishHeightMm > 0 && (
                <group>
                  <Line
                    points={[[spaceWidth, bottomY, leftDimensionZ], [spaceWidth, floorFinishTopYRight, leftDimensionZ]]}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, bottomY, leftDimensionZ], [spaceWidth, 0.03, leftDimensionZ])}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, floorFinishTopYRight, leftDimensionZ], [spaceWidth, floorFinishTopYRight + 0.03, leftDimensionZ])}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Text
                    renderOrder={1000}
                    depthTest={false}
                    position={[spaceWidth, floorFinishTopYRight / 2, leftDimensionZ + mmToThreeUnits(60)]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                    rotation={[0, 0, -Math.PI / 2]}
                  >
                    {floorFinishHeightMm}
                  </Text>
                </group>
                )}

                {/* 띄움 배치가 아니고 받침대가 있는 경우: 하부 프레임 높이 표시 */}
                {!isFloating && bottomFrameHeight > 0 && (
                <group>
                  <Line
                    points={[[spaceWidth, baseStartYRight, leftDimensionZ], [spaceWidth, bottomFrameTopY, leftDimensionZ]]}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, baseStartYRight, leftDimensionZ], [spaceWidth, baseStartYRight - 0.03, leftDimensionZ])}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, bottomFrameTopY, leftDimensionZ], [spaceWidth, bottomFrameTopY + 0.03, leftDimensionZ])}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Text
                    renderOrder={1000}
                    depthTest={false}
                    position={[spaceWidth, (baseStartYRight + bottomFrameTopY) / 2, leftDimensionZ + mmToThreeUnits(60)]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                    rotation={[0, 0, -Math.PI / 2]}
                  >
                    {Math.max(0, bottomFrameHeight - floorFinishHeightMm)}
                  </Text>
                </group>
                )}

                {/* 2. 하부섹션 높이 (띄움 배치 시) 또는 캐비넷/가구 높이 (일반 배치 시) */}
                {/* 띄움 배치이고 하부장이 있는 경우: 하부섹션 높이 표시 */}
                {isFloating && maxLowerCabinetHeightMm > 0 && (
                <group>
                  <Line
                    points={[[spaceWidth, mmToThreeUnits(floorFinishHeightMm + floatHeight), leftDimensionZ], [spaceWidth, mmToThreeUnits(floorFinishHeightMm + floatHeight + maxLowerCabinetHeightMm), leftDimensionZ]]}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, mmToThreeUnits(floorFinishHeightMm + floatHeight), leftDimensionZ], [spaceWidth, mmToThreeUnits(floorFinishHeightMm + floatHeight) + 0.03, leftDimensionZ])}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, mmToThreeUnits(floorFinishHeightMm + floatHeight + maxLowerCabinetHeightMm), leftDimensionZ], [spaceWidth, mmToThreeUnits(floorFinishHeightMm + floatHeight + maxLowerCabinetHeightMm) - 0.03, leftDimensionZ])}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Text
                    renderOrder={1000}
                    depthTest={false}
                    position={[spaceWidth, mmToThreeUnits(floorFinishHeightMm + floatHeight) + mmToThreeUnits(maxLowerCabinetHeightMm / 2), leftDimensionZ + mmToThreeUnits(60)]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                    rotation={[0, 0, -Math.PI / 2]}
                  >
                    {maxLowerCabinetHeightMm}
                  </Text>
                </group>
                )}

                {/* 띄움 배치가 아닌 경우: 일반 가구 높이 표시 */}
                {!isFloating && (
                <group>
                  <Line
                    points={[[spaceWidth, bottomFrameTopY, leftDimensionZ], [spaceWidth, furnitureTopY, leftDimensionZ]]}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, bottomFrameTopY, leftDimensionZ], [spaceWidth, bottomFrameTopY + 0.03, leftDimensionZ])}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, furnitureTopY, leftDimensionZ], [spaceWidth, furnitureTopY - 0.03, leftDimensionZ])}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Text
                    renderOrder={1000}
                    depthTest={false}
                    position={[spaceWidth, furnitureTextY, leftDimensionZ + mmToThreeUnits(60)]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                    rotation={[0, 0, -Math.PI / 2]}
                  >
                    {furnitureHeightValue}
                  </Text>
                </group>
                )}

                {/* 3. 상부섹션 높이 (띄움 배치이고 상부장이 있는 경우) */}
                {isFloating && adjustedUpperCabinetHeightMm > 0 && (
                <group>
                  <Line
                    points={[[spaceWidth, mmToThreeUnits(floorFinishHeightMm + floatHeight + maxLowerCabinetHeightMm), leftDimensionZ], [spaceWidth, mmToThreeUnits(floorFinishHeightMm + floatHeight + maxLowerCabinetHeightMm + adjustedUpperCabinetHeightMm), leftDimensionZ]]}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, mmToThreeUnits(floorFinishHeightMm + floatHeight + maxLowerCabinetHeightMm), leftDimensionZ], [spaceWidth, mmToThreeUnits(floorFinishHeightMm + floatHeight + maxLowerCabinetHeightMm) + 0.03, leftDimensionZ])}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, mmToThreeUnits(floorFinishHeightMm + floatHeight + maxLowerCabinetHeightMm + adjustedUpperCabinetHeightMm), leftDimensionZ], [spaceWidth, mmToThreeUnits(floorFinishHeightMm + floatHeight + maxLowerCabinetHeightMm + adjustedUpperCabinetHeightMm) - 0.03, leftDimensionZ])}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Text
                    renderOrder={1000}
                    depthTest={false}
                    position={[spaceWidth, mmToThreeUnits(floorFinishHeightMm + floatHeight + maxLowerCabinetHeightMm) + mmToThreeUnits(adjustedUpperCabinetHeightMm / 2), leftDimensionZ + mmToThreeUnits(60)]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                    rotation={[0, 0, -Math.PI / 2]}
                  >
                    {adjustedUpperCabinetHeightMm}
                  </Text>
                </group>
                )}

                {/* 4. 상부 프레임 높이 / 노서라운드일 때는 상부 이격거리 - 자유배치에서는 숨김 */}
                {!isFreePlacement && (
                <group>
                  <Line
                    points={[[spaceWidth, cabinetAreaTopY, leftDimensionZ], [spaceWidth, topFrameLineTopY, leftDimensionZ]]}
                    color={spaceInfo.surroundType === 'no-surround' ? textColor : frameDimensionColor}
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, cabinetAreaTopY, leftDimensionZ], [spaceWidth, cabinetAreaTopY + 0.03, leftDimensionZ])}
                    color={spaceInfo.surroundType === 'no-surround' ? textColor : frameDimensionColor}
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, topFrameLineTopY, leftDimensionZ], [spaceWidth, topFrameLineTopY - 0.03, leftDimensionZ])}
                    color={spaceInfo.surroundType === 'no-surround' ? textColor : frameDimensionColor}
                    lineWidth={1}
                  />
                  <Text
                  renderOrder={1000}
                  depthTest={false}
                    position={[spaceWidth, mmToThreeUnits(spaceInfo.height - topFrameHeight / 2), leftDimensionZ + mmToThreeUnits(60)]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                    rotation={[0, 0, -Math.PI / 2]}
                  >
                    {topFrameHeight}
                </Text>
              </group>
                )}

                {/* 5. 상부 프레임 이상 돌출 구간 */}
                {hasExtraFurnitureHeight && (
                <group>
                  <Line
                    points={[[spaceWidth, topFrameLineTopY, extraFurnitureZ], [spaceWidth, maxFurnitureTop, extraFurnitureZ]]}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, topFrameLineTopY, extraFurnitureZ], [spaceWidth, topFrameLineTopY + 0.03, extraFurnitureZ])}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Line
                    points={createArrowHead([spaceWidth, maxFurnitureTop, extraFurnitureZ], [spaceWidth, maxFurnitureTop - 0.03, extraFurnitureZ])}
                    color={dimensionColor}
                    lineWidth={1}
                  />
                  <Text
                  renderOrder={1000}
                  depthTest={false}
                    position={[spaceWidth, extraFurnitureTextY, extraFurnitureZ + mmToThreeUnits(30)]}
                    fontSize={baseFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                    rotation={[0, 0, -Math.PI / 2]}
                  >
                    {extraFurnitureHeightMm}
                  </Text>
                </group>
                )}
                
                {/* 연장선들 */}
                <Line
                  points={[[spaceWidth, bottomY, spaceZOffset], [spaceWidth, bottomY, leftDimensionZ + mmToThreeUnits(20)]]}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                {/* 하부 프레임 상단 연장선 - 받침대가 있는 경우에만 표시 */}
                {bottomFrameHeight > 0 && (
                <Line
                  points={[[spaceWidth, bottomFrameTopY, spaceZOffset], [spaceWidth, bottomFrameTopY, leftDimensionZ + mmToThreeUnits(20)]]}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                )}
                <Line
                  points={[[spaceWidth, furnitureTopY, spaceZOffset], [spaceWidth, furnitureTopY, leftDimensionZ + mmToThreeUnits(20)]]}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                <Line
                  points={[[spaceWidth, topFrameTopY, spaceZOffset + spaceDepth], [spaceWidth, topFrameTopY, leftDimensionZ + mmToThreeUnits(20)]]}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                {hasExtraFurnitureHeight && (
                <Line
                  points={[[spaceWidth, maxFurnitureTop, spaceZOffset + spaceDepth], [spaceWidth, maxFurnitureTop, extraFurnitureZ + mmToThreeUnits(10)]]}
                  color={dimensionColor}
                  lineWidth={0.5}
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
          const upperDepth = module.upperSectionDepth || module.customDepth || moduleData.dimensions.depth;
          const lowerDepth = module.lowerSectionDepth || module.customDepth || moduleData.dimensions.depth;

          // 상부 치수용
          const actualDepth = upperDepth;
          const moduleDepth = mmToThreeUnits(actualDepth);
          const dimY = topDimensionY - mmToThreeUnits(120);
          
          return (
            <group key={`right-module-dim-${index}`}>
              {/* 가구 깊이 치수선 */}
              <Line
                points={[[spaceWidth, dimY, spaceZOffset], [spaceWidth, dimY, spaceZOffset + moduleDepth]]}
                color={dimensionColor}
                lineWidth={0.5}
              />
              
              {/* 화살표들 */}
              <Line
                points={createArrowHead([spaceWidth, dimY, spaceZOffset], [spaceWidth, dimY, spaceZOffset + 0.02], 0.01)}
                color={dimensionColor}
                lineWidth={0.5}
              />
              <Line
                points={createArrowHead([spaceWidth, dimY, spaceZOffset + moduleDepth], [spaceWidth, dimY, spaceZOffset + moduleDepth - 0.02], 0.01)}
                color={dimensionColor}
                lineWidth={0.5}
              />
              
              {/* 치수 텍스트 */}
              <Text
                  renderOrder={1000}
                  depthTest={false}
                position={[spaceWidth, dimY - mmToThreeUnits(30), spaceZOffset + moduleDepth / 2]}
                fontSize={baseFontSize}
                color={dimensionColor}
                anchorX="center"
                anchorY="middle"
              >
                {actualDepth}
              </Text>

              {/* 연장선 (가구에서 치수선까지 긴 보조선) */}
              <Line
                points={[[spaceWidth, spaceHeight, spaceZOffset], [spaceWidth, dimY + mmToThreeUnits(30), spaceZOffset]]}
                color={dimensionColor}
                lineWidth={0.5}
              />
              <Line
                points={[[spaceWidth, spaceHeight, spaceZOffset + moduleDepth], [spaceWidth, dimY + mmToThreeUnits(30), spaceZOffset + moduleDepth]]}
                color={dimensionColor}
                lineWidth={0.5}
              />

              {/* 하부섹션 깊이 치수 (2섹션 가구인 경우) */}
              {hasMultiSection && (() => {
                const lowerModuleDepth = mmToThreeUnits(lowerDepth);
                const lowerDimY = mmToThreeUnits(200); // 하단 치수선 위치 (바닥에서 위로)

                return (
                  <group>
                    {/* 하부 깊이 치수선 */}
                    <Line
                      points={[[spaceWidth, lowerDimY, spaceZOffset], [spaceWidth, lowerDimY, spaceZOffset + lowerModuleDepth]]}
                      color={dimensionColor}
                      lineWidth={0.5}
                    />

                    {/* 화살표들 */}
                    <Line
                      points={createArrowHead([spaceWidth, lowerDimY, spaceZOffset], [spaceWidth, lowerDimY, spaceZOffset + 0.02], 0.01)}
                      color={dimensionColor}
                      lineWidth={0.5}
                    />
                    <Line
                      points={createArrowHead([spaceWidth, lowerDimY, spaceZOffset + lowerModuleDepth], [spaceWidth, lowerDimY, spaceZOffset + lowerModuleDepth - 0.02], 0.01)}
                      color={dimensionColor}
                      lineWidth={0.5}
                    />

                    {/* 치수 텍스트 */}
                    <Text
                      renderOrder={1000}
                      depthTest={false}
                      position={[spaceWidth, lowerDimY + mmToThreeUnits(30), spaceZOffset + lowerModuleDepth / 2]}
                      fontSize={baseFontSize}
                      color={dimensionColor}
                      anchorX="center"
                      anchorY="middle"
                    >
                      {lowerDepth}
                    </Text>

                    {/* 연장선 (가구에서 치수선까지) */}
                    <Line
                      points={[[spaceWidth, 0, spaceZOffset], [spaceWidth, lowerDimY - mmToThreeUnits(30), spaceZOffset]]}
                      color={dimensionColor}
                      lineWidth={0.5}
                    />
                    <Line
                      points={[[spaceWidth, 0, spaceZOffset + lowerModuleDepth], [spaceWidth, lowerDimY - mmToThreeUnits(30), spaceZOffset + lowerModuleDepth]]}
                      color={dimensionColor}
                      lineWidth={0.5}
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

  // 상단뷰 치수선 - 객체 좌표계와 맞춤 (상부 프레임 가로길이, 좌우 프레임 폭, 캐비넷 폭만 표시)
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
    const baseFrameThickness = mmToThreeUnits(18); // 하부 프레임 두께
    const baseFrameY = 0; // 바닥 기준
    const baseFrameZ = spaceZOffset + spaceDepth/2 - mmToThreeUnits(20); // 3D와 동일하게 앞쪽에서 20mm 뒤로
    const baseFrameWidth = spaceWidth - (spaceInfo.surroundType === 'no-surround' ? 0 : (mmToThreeUnits(frameSize.left) + mmToThreeUnits(frameSize.right)));
    const baseFrameX = spaceXOffset + spaceWidth/2;
    
    return (
      <group>
        {/* 탑뷰 치수선들 - 좌측면도가 아닐 때만 표시 */}
        {showDimensions && viewDirection !== 'left' && (
          <>
        {/* 상단 전체 폭 치수선 (상부 프레임의 가로 길이) - 외부로 이동 */}
        <group>
          {(() => {
            // 전체 가로 치수선을 캐비넷 외부(앞쪽)로 이동
            const mainDimZ = spaceZOffset - mmToThreeUnits(hasPlacedModules ? 200 : 150);
            
            return (
              <>
                <Line
                  points={[[spaceXOffset, spaceHeight, mainDimZ], [spaceXOffset + spaceWidth, spaceHeight, mainDimZ]]}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                
                {/* 좌측 화살표 */}
                <Line
                  points={createArrowHead([spaceXOffset, spaceHeight, mainDimZ], [spaceXOffset + 0.05, spaceHeight, mainDimZ])}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                
                {/* 우측 화살표 */}
                <Line
                  points={createArrowHead([spaceXOffset + spaceWidth, spaceHeight, mainDimZ], [spaceXOffset + spaceWidth - 0.05, spaceHeight, mainDimZ])}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                
                {/* 전체 폭 치수 텍스트 - 상단뷰용 회전 적용 */}
                <Text
                  renderOrder={1000}
                  depthTest={false}
                  position={[0, spaceHeight + 0.1, mainDimZ - mmToThreeUnits(40)]}
                  fontSize={largeFontSize}
                  color={textColor}
                  anchorX="center"
                  anchorY="middle"
                  outlineWidth={textOutlineWidth}
                  outlineColor={textOutlineColor}
                  rotation={[-Math.PI / 2, 0, 0]}
                >
                  {Math.round(spaceInfo.width)}
                </Text>
                
                {/* 연장선 - 좌우 프레임 앞쪽으로 더 연장 */}
                {(() => {
                  // 프레임 앞선 위치 계산 - 더 앞쪽으로 연장 (실제 공간 깊이 사용)
                  const panelDepthMm = spaceInfo.depth || 600;
                  const furnitureDepthMm = Math.min(panelDepthMm, 600);
                  const panelDepth = mmToThreeUnits(panelDepthMm);
                  const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
                  const furnitureZOffset = spaceZOffset + (panelDepth - furnitureDepth) / 2;
                  const frameZ = furnitureZOffset + furnitureDepth/2; // 30mm 더 앞으로 (- 30mm 제거)
                  
                  return (
                    <>
                      <Line
                        points={[
                          [spaceXOffset, spaceHeight, frameZ], 
                          [spaceXOffset, spaceHeight, mainDimZ - mmToThreeUnits(20)]
                        ]}
                        color={dimensionColor}
                        lineWidth={0.5}
                      />
                      <Line
                        points={[
                          [spaceXOffset + spaceWidth, spaceHeight, frameZ], 
                          [spaceXOffset + spaceWidth, spaceHeight, mainDimZ - mmToThreeUnits(20)]
                        ]}
                        color={dimensionColor}
                        lineWidth={0.5}
                      />
                    </>
                  );
                })()}
              </>
            );
          })()}
        </group>
        
        {/* 좌측 프레임 폭 치수선 - 외부로 이동 - 자유배치에서는 숨김 */}
        {showDimensions && !isFreePlacement && <group>
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
                leftText = `이격 ${leftValue}`;
              } else {
                // 왼쪽 벽이 없으면 엔드패널 표시
                const frameThickness = calculateFrameThickness(spaceInfo, hasLeftFurniture, hasRightFurniture);

                leftValue = frameThickness.left > 0 ? frameThickness.left : END_PANEL_THICKNESS;
                leftText = `${leftValue}`;
              }
              
              return (
                <>
                  <Line
                    points={[[spaceXOffset, spaceHeight, frameDimZ], [spaceXOffset + mmToThreeUnits(leftValue), spaceHeight, frameDimZ]]}
                    color={dimensionColor}
                    lineWidth={0.5}
                  />
                  
                  {/* 좌측 프레임 화살표들 */}
                  <Line
                    points={createArrowHead([spaceXOffset, spaceHeight, frameDimZ], [spaceXOffset + 0.02, spaceHeight, frameDimZ])}
                    color={dimensionColor}
                    lineWidth={0.5}
                  />
                  <Line
                    points={createArrowHead([spaceXOffset + mmToThreeUnits(leftValue), spaceHeight, frameDimZ], [spaceXOffset + mmToThreeUnits(leftValue) - 0.02, spaceHeight, frameDimZ])}
                    color={dimensionColor}
                    lineWidth={0.5}
                  />
                  
                  {/* 좌측 프레임 치수 텍스트 - 상단뷰용 회전 적용 */}
                  <Text
                  renderOrder={1000}
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
                <Line
                  points={[[spaceXOffset, spaceHeight, frameDimZ], [spaceXOffset + mmToThreeUnits(leftValue), spaceHeight, frameDimZ]]}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                
                {/* 좌측 프레임 화살표들 */}
                <Line
                  points={createArrowHead([spaceXOffset, spaceHeight, frameDimZ], [spaceXOffset + 0.02, spaceHeight, frameDimZ])}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                <Line
                  points={createArrowHead([spaceXOffset + mmToThreeUnits(leftValue), spaceHeight, frameDimZ], [spaceXOffset + mmToThreeUnits(leftValue) - 0.02, spaceHeight, frameDimZ])}
                  color={dimensionColor}
                  lineWidth={0.5}
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
                  renderOrder={1000}
                  depthTest={false}
                >
                  {leftValue}
                </Text>
              </>
              );
            }
          })()}
        </group>}

        {/* 우측 프레임 폭 치수선 - 외부로 이동 - 자유배치에서는 숨김 */}
        {showDimensions && !isFreePlacement && <group>
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
                rightText = `이격 ${rightValue}`;
              } else {
                // 오른쪽 벽이 없으면 엔드패널 표시
                const frameThickness = calculateFrameThickness(spaceInfo, hasLeftFurniture, hasRightFurniture);

                rightValue = frameThickness.right > 0 ? frameThickness.right : END_PANEL_THICKNESS;
                rightText = `${rightValue}`;
              }
              
              return (
                <>
                  <Line
                    points={[[spaceXOffset + spaceWidth - mmToThreeUnits(rightValue), spaceHeight, frameDimZ], [spaceXOffset + spaceWidth, spaceHeight, frameDimZ]]}
                    color={dimensionColor}
                    lineWidth={0.5}
                  />
                  
                  {/* 우측 프레임 화살표들 */}
                  <Line
                    points={createArrowHead([spaceXOffset + spaceWidth - mmToThreeUnits(rightValue), spaceHeight, frameDimZ], [spaceXOffset + spaceWidth - mmToThreeUnits(rightValue) + 0.02, spaceHeight, frameDimZ])}
                    color={dimensionColor}
                    lineWidth={0.5}
                  />
                  <Line
                    points={createArrowHead([spaceXOffset + spaceWidth, spaceHeight, frameDimZ], [spaceXOffset + spaceWidth - 0.02, spaceHeight, frameDimZ])}
                    color={dimensionColor}
                    lineWidth={0.5}
                  />
                  
                  {/* 우측 프레임 치수 텍스트 - 상단뷰용 회전 적용 */}
                  <Text
                  renderOrder={1000}
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
                <Line
                  points={[[spaceXOffset + spaceWidth - mmToThreeUnits(rightValue), spaceHeight, frameDimZ], [spaceXOffset + spaceWidth, spaceHeight, frameDimZ]]}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                
                {/* 우측 프레임 화살표들 */}
                <Line
                  points={createArrowHead([spaceXOffset + spaceWidth - mmToThreeUnits(rightValue), spaceHeight, frameDimZ], [spaceXOffset + spaceWidth - mmToThreeUnits(rightValue) + 0.02, spaceHeight, frameDimZ])}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                <Line
                  points={createArrowHead([spaceXOffset + spaceWidth, spaceHeight, frameDimZ], [spaceXOffset + spaceWidth - 0.02, spaceHeight, frameDimZ])}
                  color={dimensionColor}
                  lineWidth={0.5}
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
                  renderOrder={1000}
                  depthTest={false}
                >
                  {rightValue}
                </Text>
              </>
              );
            }
          })()}
        </group>}

        {/* 단내림 구간 치수선 - 탑뷰 */}
        {showDimensions && spaceInfo.droppedCeiling?.enabled && (
          <group>
            {(() => {
              const normalBounds = getNormalZoneBounds(spaceInfo);
              const droppedBounds = getDroppedZoneBounds(spaceInfo);
              const subDimensionZ = spaceZOffset - mmToThreeUnits(280); // 전체 폭 치수선 아래
              
              // 프레임 두께 계산
              const frameThickness = calculateFrameThickness(spaceInfo, hasLeftFurniture, hasRightFurniture);
              
              // 프레임을 포함한 전체 좌표 계산
              const mainWidth = spaceInfo.width - spaceInfo.droppedCeiling.width;
              const droppedWidth = spaceInfo.droppedCeiling.width;
              
              // 메인 구간 치수선
              const mainStartX = spaceInfo.droppedCeiling.position === 'left' 
                ? spaceXOffset + mmToThreeUnits(droppedWidth)
                : spaceXOffset;
              const mainEndX = spaceInfo.droppedCeiling.position === 'left'
                ? spaceXOffset + spaceWidth
                : spaceXOffset + mmToThreeUnits(mainWidth);
              
              // 단내림 구간 치수선
              const droppedStartX = spaceInfo.droppedCeiling.position === 'left'
                ? spaceXOffset
                : spaceXOffset + mmToThreeUnits(mainWidth);
              const droppedEndX = spaceInfo.droppedCeiling.position === 'left'
                ? spaceXOffset + mmToThreeUnits(droppedWidth)
                : spaceXOffset + spaceWidth;
              
              return (
                <>
                  {/* 메인 구간 치수선 */}
                  <Line
                    points={[[mainStartX, spaceHeight, subDimensionZ], [mainEndX, spaceHeight, subDimensionZ]]}
                    color={dimensionColor}
                    lineWidth={0.5}
                  />
                  <Line
                    points={createArrowHead([mainStartX, spaceHeight, subDimensionZ], [mainStartX + 0.05, spaceHeight, subDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.5}
                  />
                  <Line
                    points={createArrowHead([mainEndX, spaceHeight, subDimensionZ], [mainEndX - 0.05, spaceHeight, subDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.5}
                  />
                  <Text
                  renderOrder={1000}
                  depthTest={false}
                    position={[(mainStartX + mainEndX) / 2, spaceHeight + 0.1, subDimensionZ - mmToThreeUnits(40)]}
                    fontSize={smallFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                    rotation={[-Math.PI / 2, 0, 0]}
                  >
                    {(() => {
                      // 노서라운드일 때 실제 축소값 계산
                      let leftReduction = frameThickness.left;
                      let rightReduction = frameThickness.right;
                      
                      if (spaceInfo.surroundType === 'no-surround') {
                        if (spaceInfo.installType === 'builtin') {
                          // 양쪽벽: 설정된 이격거리 사용
                          leftReduction = spaceInfo.gapConfig?.left ?? 1.5;
                          rightReduction = spaceInfo.gapConfig?.right ?? 1.5;
                        } else if (spaceInfo.installType === 'semistanding') {
                          if (spaceInfo.wallConfig?.left) {
                            leftReduction = spaceInfo.gapConfig?.left ?? 1.5;
                            rightReduction = 20;
                          } else {
                            leftReduction = 20;
                            rightReduction = spaceInfo.gapConfig?.right ?? 1.5;
                          }
                        } else if (spaceInfo.installType === 'freestanding') {
                          // 벽없음: 슬롯은 엔드패널 포함, reduction 없음
                          leftReduction = 0;
                          rightReduction = 0;
                        }
                      }

                      // ColumnIndexer의 실제 계산된 너비 사용
                      const zoneSlotInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
                      return Math.round(zoneSlotInfo.normal.width);
                    })()}
                  </Text>
                  
                  {/* 단내림 구간 치수선 */}
                  <Line
                    points={[[droppedStartX, spaceHeight, subDimensionZ], [droppedEndX, spaceHeight, subDimensionZ]]}
                    color={dimensionColor}
                    lineWidth={0.5}
                  />
                  <Line
                    points={createArrowHead([droppedStartX, spaceHeight, subDimensionZ], [droppedStartX + 0.05, spaceHeight, subDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.5}
                  />
                  <Line
                    points={createArrowHead([droppedEndX, spaceHeight, subDimensionZ], [droppedEndX - 0.05, spaceHeight, subDimensionZ])}
                    color={dimensionColor}
                    lineWidth={0.5}
                  />
                  <Text
                  renderOrder={1000}
                  depthTest={false}
                    position={[(droppedStartX + droppedEndX) / 2, spaceHeight + 0.1, subDimensionZ - mmToThreeUnits(40)]}
                    fontSize={smallFontSize}
                    color={textColor}
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={textOutlineWidth}
                    outlineColor={textOutlineColor}
                    rotation={[-Math.PI / 2, 0, 0]}
                  >
                    {(() => {
                      // 노서라운드일 때 실제 축소값 계산
                      let leftReduction = frameThickness.left;
                      let rightReduction = frameThickness.right;
                      
                      if (spaceInfo.surroundType === 'no-surround') {
                        if (spaceInfo.installType === 'builtin') {
                          // 양쪽벽: 설정된 이격거리 사용
                          leftReduction = spaceInfo.gapConfig?.left ?? 1.5;
                          rightReduction = spaceInfo.gapConfig?.right ?? 1.5;
                        } else if (spaceInfo.installType === 'semistanding') {
                          if (spaceInfo.wallConfig?.left) {
                            leftReduction = spaceInfo.gapConfig?.left ?? 1.5;
                            rightReduction = 20;
                          } else {
                            leftReduction = 20;
                            rightReduction = spaceInfo.gapConfig?.right ?? 1.5;
                          }
                        } else if (spaceInfo.installType === 'freestanding') {
                          // 벽없음: 슬롯은 엔드패널 포함, reduction 없음
                          leftReduction = 0;
                          rightReduction = 0;
                        }
                      }

                      // ColumnIndexer의 실제 계산된 너비 사용
                      const zoneSlotInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
                      return Math.round(zoneSlotInfo.dropped?.width || spaceInfo.droppedCeiling.width);
                    })()}
                  </Text>
                  
                  {/* 구간 분리 가이드라인 */}
                  <Line
                    points={[
                      [spaceInfo.droppedCeiling.position === 'left' ? spaceXOffset + mmToThreeUnits(droppedBounds.width) : spaceXOffset + mmToThreeUnits(normalBounds.width), spaceHeight, spaceZOffset],
                      [spaceInfo.droppedCeiling.position === 'left' ? spaceXOffset + mmToThreeUnits(droppedBounds.width) : spaceXOffset + mmToThreeUnits(normalBounds.width), spaceHeight, subDimensionZ + mmToThreeUnits(20)]
                    ]}
                    color={subGuideColor}
                    lineWidth={0.5}
                    dashed
                  />
                  
                  {/* 메인 구간 연장선 */}
                  <Line
                    points={[
                      [mainStartX, spaceHeight, spaceZOffset - mmToThreeUnits(100)],
                      [mainStartX, spaceHeight, subDimensionZ - mmToThreeUnits(10)]
                    ]}
                    color={subGuideColor}
                    lineWidth={0.5}
                  />
                  <Line
                    points={[
                      [mainEndX, spaceHeight, spaceZOffset - mmToThreeUnits(100)],
                      [mainEndX, spaceHeight, subDimensionZ - mmToThreeUnits(10)]
                    ]}
                    color={subGuideColor}
                    lineWidth={0.5}
                  />
                  
                  {/* 단내림 구간 연장선 */}
                  <Line
                    points={[
                      [droppedStartX, spaceHeight, spaceZOffset - mmToThreeUnits(100)],
                      [droppedStartX, spaceHeight, subDimensionZ - mmToThreeUnits(10)]
                    ]}
                    color={subGuideColor}
                    lineWidth={0.5}
                  />
                  <Line
                    points={[
                      [droppedEndX, spaceHeight, spaceZOffset - mmToThreeUnits(100)],
                      [droppedEndX, spaceHeight, subDimensionZ - mmToThreeUnits(10)]
                    ]}
                    color={subGuideColor}
                    lineWidth={0.5}
                  />
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
            lineWidth={1}
          />
          
          {/* 좌측 벽 - 탑뷰에서 숨김 */}
          {/* <Line
            points={[[spaceXOffset, spaceHeight, spaceZOffset], [spaceXOffset, spaceHeight, spaceZOffset + spaceDepth]]}
            color={subGuideColor}
            lineWidth={1}
          /> */}
          
          {/* 우측 벽 - 탑뷰에서 숨김 */}
          {/* <Line
            points={[[spaceXOffset + spaceWidth, spaceHeight, spaceZOffset], [spaceXOffset + spaceWidth, spaceHeight, spaceZOffset + spaceDepth]]}
            color={subGuideColor}
            lineWidth={1}
          /> */}
        </group>

              {/* 좌측 치수선 - 좌측에 배치된 캐비넷만 고려 */}
      {placedModules.length > 0 && (() => {
        // 좌측에 배치된 가구 중에서 가장 깊은 가구 찾기 (x < 0인 가구만)
        let deepestBackZ = Infinity;
        let deepestFrontZ = -Infinity;
        let deepestFurnitureRightX = spaceXOffset;
        let hasLeftFurniture = false;
        
        placedModules.forEach((module) => {
          // 좌측에 배치된 가구만 고려 (x 좌표가 음수)
          if (module.position.x >= 0) return;
          const moduleData = getModuleById(
            module.moduleId,
            { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
            spaceInfo
          );
          
          if (!moduleData || !moduleData.dimensions) {
            return;
          }
          
          // 가구 본래 깊이 사용 (customDepth는 기둥 조정값이므로 무시)
          const actualDepthMm = moduleData.dimensions.depth;
          const moduleWidthMm = moduleData.dimensions.width;
          const isStylerModule = moduleData.id.includes('dual-2drawer-styler');

          const moduleWidth = mmToThreeUnits(moduleWidthMm);
          const rightX = module.position.x + moduleWidth / 2;
          
          // FurnitureItem.tsx와 완전히 동일한 Z 위치 계산 (실제 공간 깊이 사용)
          const panelDepthMm = spaceInfo.depth || 600;
          const furnitureDepthMm = Math.min(panelDepthMm, 600);
          const doorThicknessMm = 20;
          
          const panelDepth = mmToThreeUnits(panelDepthMm);
          const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
          const doorThickness = mmToThreeUnits(doorThicknessMm);
          
          let furnitureBackZ, furnitureFrontZ;
          
          if (isStylerModule) {
            // 스타일러장: 우측이 660mm로 더 깊음
            const leftDepthMm = actualDepthMm; // 좌측: 600mm
            const rightDepthMm = 660; // 우측: 스타일러장 고정 깊이
            
            const leftDepth = mmToThreeUnits(leftDepthMm);
            const rightDepth = mmToThreeUnits(rightDepthMm);
            
            // 기본 가구 Z 오프셋
            const zOffset = -panelDepth / 2;
            const baseFurnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;
            
            // 좌측 부분 위치
            const leftFurnitureZ = baseFurnitureZOffset + furnitureDepth/2 - doorThickness - leftDepth/2;
            const leftBackZ = leftFurnitureZ - leftDepth/2;
            const leftFrontZ = leftFurnitureZ + leftDepth/2;
            
            // 우측 부분 위치 (깊이 차이만큼 뒤로 이동)
            const depthOffset = (leftDepth - rightDepth) / 2; // (600-660)/2 = -30mm
            const rightFurnitureZ = baseFurnitureZOffset + furnitureDepth/2 - doorThickness - rightDepth/2 + depthOffset;
            const rightBackZ = rightFurnitureZ - rightDepth/2;
            const rightFrontZ = rightFurnitureZ + rightDepth/2;
            
            // 전체에서 가장 뒤쪽과 앞쪽 선택
            furnitureBackZ = Math.min(leftBackZ, rightBackZ);
            furnitureFrontZ = Math.max(leftFrontZ, rightFrontZ);
          } else {
            // 일반 가구: 동일한 깊이
            const depth = mmToThreeUnits(actualDepthMm);
          const zOffset = -panelDepth / 2;
          const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;
          const furnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - depth/2;
            furnitureBackZ = furnitureZ - depth/2;
            furnitureFrontZ = furnitureZ + depth/2;
          }
          
          hasLeftFurniture = true; // 좌측에 가구가 있음을 표시
          
          // 가장 뒤쪽과 앞쪽 가구 찾기
          if (furnitureBackZ < deepestBackZ) {
            deepestBackZ = furnitureBackZ;
            deepestFurnitureRightX = rightX;
          }
          if (furnitureFrontZ > deepestFrontZ) {
            deepestFrontZ = furnitureFrontZ;
          }
        });
        
        // 좌측에 가구가 없거나 유효한 치수가 없으면 표시하지 않음
        if (!hasLeftFurniture || deepestBackZ === Infinity || deepestFrontZ === -Infinity) {
          return null;
        }
        
        // 실제 캐비넷 깊이 계산 (mm 단위)
        const cabinetDepthMm = Math.round((deepestFrontZ - deepestBackZ) / 0.01);
        const leftDimensionX = spaceXOffset - mmToThreeUnits(200);
        
        return (
          <group key="cabinet-depth-dimension">
            {/* 치수선 */}
            <Line
              points={[[leftDimensionX, spaceHeight, deepestBackZ], [leftDimensionX, spaceHeight, deepestFrontZ]]}
              color={dimensionColor}
              lineWidth={0.5}
            />
            
            {/* 화살표들 */}
            <Line
              points={createArrowHead([leftDimensionX, spaceHeight, deepestBackZ], [leftDimensionX, spaceHeight, deepestBackZ + 0.02], 0.01)}
              color={dimensionColor}
              lineWidth={0.5}
            />
            <Line
              points={createArrowHead([leftDimensionX, spaceHeight, deepestFrontZ], [leftDimensionX, spaceHeight, deepestFrontZ - 0.02], 0.01)}
              color={dimensionColor}
              lineWidth={0.5}
            />
            
            {/* 캐비넷 깊이 텍스트 */}
            <Text
                  renderOrder={1000}
                  depthTest={false}
              position={[leftDimensionX - mmToThreeUnits(40), spaceHeight + 0.1, (deepestBackZ + deepestFrontZ) / 2]}
              fontSize={baseFontSize}
              color={dimensionColor}
              anchorX="center"
              anchorY="middle"
              rotation={[-Math.PI / 2, 0, 0]}
            >
              {cabinetDepthMm}
            </Text>

            {/* 연장선들 - 캐비넷 뒷면과 앞면에서 치수선까지 */}
            <Line
              points={[[deepestFurnitureRightX, spaceHeight, deepestBackZ], [leftDimensionX, spaceHeight, deepestBackZ]]}
              color={dimensionColor}
              lineWidth={0.5}
            />
            <Line
              points={[[deepestFurnitureRightX, spaceHeight, deepestFrontZ], [leftDimensionX, spaceHeight, deepestFrontZ]]}
              color={dimensionColor}
              lineWidth={0.5}
            />
          </group>
        );
      })()}

        {/* 우측 치수선 - 우측에 배치된 캐비넷만 고려 */}
        {placedModules.length > 0 && (() => {
          // 우측에 배치된 가구 중에서 가장 깊은 가구 찾기 (x >= 0인 가구만)
          let deepestBackZ = Infinity;
          let deepestFrontZ = -Infinity;
          let deepestFurnitureLeftX = spaceXOffset;
          let hasRightFurniture = false;
          
          placedModules.forEach((module) => {
            // 우측에 배치된 가구만 고려 (x 좌표가 0 이상)
            if (module.position.x < 0) return;
            
            const moduleData = getModuleById(
              module.moduleId,
              { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
              spaceInfo
            );
            
            if (!moduleData || !moduleData.dimensions) {
              return;
            }
            
            // 가구 본래 깊이 사용 (customDepth는 기둥 조정값이므로 무시)
            const actualDepthMm = moduleData.dimensions.depth;
            const moduleWidthMm = moduleData.dimensions.width;
            const isStylerModule = moduleData.id.includes('dual-2drawer-styler');
            
            const moduleWidth = mmToThreeUnits(moduleWidthMm);
            const leftX = module.position.x - moduleWidth / 2;
            
            // FurnitureItem.tsx와 완전히 동일한 Z 위치 계산 (실제 공간 깊이 사용)
        const panelDepthMm = spaceInfo.depth || 600;
        const furnitureDepthMm = Math.min(panelDepthMm, 600);
        const doorThicknessMm = 20;
            
        const panelDepth = mmToThreeUnits(panelDepthMm);
        const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
        const doorThickness = mmToThreeUnits(doorThicknessMm);
            
            let furnitureBackZ, furnitureFrontZ;
            
            if (isStylerModule) {
              // 스타일러장: 우측이 660mm로 더 깊음 (DualType5.tsx와 동일한 계산)
              const rightDepthMm = 660; // 우측: 스타일러장 고정 깊이
              const rightDepth = mmToThreeUnits(rightDepthMm);
              
              // 기본 가구 Z 오프셋 (600mm 기준)
              const zOffset = -panelDepth / 2;
              const baseFurnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;
              
              // 스타일러장 우측 부분 위치 계산 (DualType5 컴포넌트와 동일)
              // furnitureZOffset에서 시작해서 스타일러장 깊이만큼 조정
              const stylerZOffset = baseFurnitureZOffset + (furnitureDepth - rightDepth) / 2;
              const stylerZ = stylerZOffset + rightDepth/2 - doorThickness - rightDepth/2;
              furnitureBackZ = stylerZ - rightDepth/2;
              furnitureFrontZ = stylerZ + rightDepth/2;
            } else {
              // 일반 가구: 동일한 깊이
              const depth = mmToThreeUnits(actualDepthMm);
              const zOffset = -panelDepth / 2;
              const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2;
              const furnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - depth/2;
              furnitureBackZ = furnitureZ - depth/2;
              furnitureFrontZ = furnitureZ + depth/2;
            }
            
            hasRightFurniture = true; // 우측에 가구가 있음을 표시
            
            // 가장 뒤쪽과 앞쪽 가구 찾기
            if (furnitureBackZ < deepestBackZ) {
              deepestBackZ = furnitureBackZ;
              deepestFurnitureLeftX = leftX;
            }
            if (furnitureFrontZ > deepestFrontZ) {
              deepestFrontZ = furnitureFrontZ;
            }
          });
          
          // 우측에 가구가 없거나 유효한 치수가 없으면 표시하지 않음
          if (!hasRightFurniture || deepestBackZ === Infinity || deepestFrontZ === -Infinity) {
            return null;
          }
          
          // 실제 캐비넷 깊이 계산 (mm 단위)
          const cabinetDepthMm = Math.round((deepestFrontZ - deepestBackZ) / 0.01);
          const rightDimensionX = spaceXOffset + spaceWidth + mmToThreeUnits(200);
        
        return (
            <group key="right-cabinet-depth-dimension">
            {/* 치수선 */}
            <Line
                points={[[rightDimensionX, spaceHeight, deepestBackZ], [rightDimensionX, spaceHeight, deepestFrontZ]]}
              color={dimensionColor}
              lineWidth={0.5}
            />
            
            {/* 화살표들 */}
            <Line
                points={createArrowHead([rightDimensionX, spaceHeight, deepestBackZ], [rightDimensionX, spaceHeight, deepestBackZ + 0.02], 0.01)}
              color={dimensionColor}
              lineWidth={0.5}
            />
            <Line
                points={createArrowHead([rightDimensionX, spaceHeight, deepestFrontZ], [rightDimensionX, spaceHeight, deepestFrontZ - 0.02], 0.01)}
              color={dimensionColor}
              lineWidth={0.5}
            />
            
              {/* 캐비넷 깊이 텍스트 */}
            <Text
                  renderOrder={1000}
                  depthTest={false}
                position={[rightDimensionX + mmToThreeUnits(40), spaceHeight + 0.1, (deepestBackZ + deepestFrontZ) / 2]}
              fontSize={baseFontSize}
              color={dimensionColor}
              anchorX="center"
              anchorY="middle"
              rotation={[-Math.PI / 2, 0, 0]}
            >
                {cabinetDepthMm}
            </Text>

              {/* 연장선들 - 캐비넷 뒷면과 앞면에서 치수선까지 */}
            <Line
                points={[[deepestFurnitureLeftX, spaceHeight, deepestBackZ], [rightDimensionX, spaceHeight, deepestBackZ]]}
              color={dimensionColor}
              lineWidth={0.5}
            />
            <Line
                points={[[deepestFurnitureLeftX, spaceHeight, deepestFrontZ], [rightDimensionX, spaceHeight, deepestFrontZ]]}
              color={dimensionColor}
              lineWidth={0.5}
            />
          </group>
        );
      })()}

        {/* 기존 복잡한 좌측 치수선 주석 처리 */}
        {false && placedModules.length > 0 && (
          <group>
            {(() => {
              const leftDimensionX = spaceXOffset - mmToThreeUnits(200);
              
              // 디버깅을 위한 로그
              console.log('🔍 [상단뷰 치수] 배치된 가구들:', placedModules.map(m => ({
                id: m.id,
                moduleId: m.moduleId,
                customDepth: m.customDepth,
                position: m.position
              })));
              
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
                  console.log('❌ [상단뷰 치수] 모듈 데이터 없음:', module.moduleId);
                  return;
                }
                
                const actualDepthMm = module.customDepth || moduleData.dimensions.depth;
                console.log(`📏 [상단뷰 치수] 가구 ${module.id}:`);
                console.log(`  - moduleId: ${module.moduleId}`);
                console.log(`  - customDepth: ${module.customDepth}`);
                console.log(`  - moduleData.dimensions.depth: ${moduleData.dimensions.depth}`);
                console.log(`  - moduleData.defaultDepth: ${moduleData.defaultDepth}`);
                console.log(`  - 최종 사용 깊이: ${actualDepthMm}mm`);
                
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
                
                console.log(`📐 [상단뷰 치수] 가구 ${module.id}: 뒷면Z=${furnitureBackZ.toFixed(3)}, 앞면Z=${furnitureFrontZ.toFixed(3)}`);
                
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
              console.log(`🏆 [상단뷰 치수] 가장 깊은 가구: ${deepestModule?.module?.id}, 깊이: ${deepestModuleDepthMm}mm`);
              
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
              
              console.log(`🏠 [상단뷰 치수] spaceZOffset: ${spaceZOffset.toFixed(3)}`);
              console.log(`🏠 [상단뷰 치수] furnitureZOffset: ${furnitureZOffset.toFixed(3)}`);
              console.log(`🏠 [상단뷰 치수] doorFrontZ: ${doorFrontZ.toFixed(3)}`);
              
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
              
              console.log(`📏 [상단뷰 치수] 좌측 프레임 앞면 Z: ${leftFrameFrontZ.toFixed(3)}`);
              console.log(`📏 [상단뷰 치수] 가장 깊은 가구 뒷면 Z: ${deepestModuleBackZ.toFixed(3)}`);
              console.log(`📏 [상단뷰 치수] Z 차이: ${(leftFrameFrontZ - deepestModuleBackZ).toFixed(3)}`);
              console.log(`📏 [상단뷰 치수] 실제 거리: ${actualDistanceMm}mm`);
              
              return (
                <>
                  <Line
                    points={[[leftDimensionX, spaceHeight, deepestModuleBackZ], [leftDimensionX, spaceHeight, leftFrameFrontZ]]}
                    color={dimensionColor}
                    lineWidth={0.5}
                  />
                  
                  {/* 뒤쪽 화살표 (가구 뒷면) */}
                  <Line
                    points={createArrowHead([leftDimensionX, spaceHeight, deepestModuleBackZ], [leftDimensionX, spaceHeight, deepestModuleBackZ + 0.05])}
                    color={dimensionColor}
                    lineWidth={0.5}
                  />
                  
                  {/* 앞쪽 화살표 (좌측 프레임 앞면) */}
                  <Line
                    points={createArrowHead([leftDimensionX, spaceHeight, leftFrameFrontZ], [leftDimensionX, spaceHeight, leftFrameFrontZ - 0.05])}
                    color={dimensionColor}
                    lineWidth={0.5}
                  />
                  
                  {/* 좌측 프레임 앞면에서 가장 깊은 가구 뒷면까지의 거리 표시 */}
                  <Text
                  renderOrder={1000}
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
                        lineWidth={0.5}
                      />
                      {/* 좌측 프레임 앞면에서 치수선까지 */}
                      <Line
                        points={[[spaceXOffset, spaceHeight, leftFrameFrontZ], [leftDimensionX - mmToThreeUnits(20), spaceHeight, leftFrameFrontZ]]}
                        color={dimensionColor}
                        lineWidth={0.5}
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
          const moduleData = getModuleById(
            module.moduleId,
            { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth },
            spaceInfo
          );

          if (!moduleData) return null;

          // 기둥에 의해 조정된 너비와 위치 사용 (customWidth 우선)
          const actualWidth = module.customWidth || module.adjustedWidth || moduleData.dimensions.width;
          const moduleWidth = mmToThreeUnits(actualWidth);
          // 조정된 위치가 있으면 사용, 없으면 원래 위치 사용
          const actualPositionX = module.adjustedPosition?.x || module.position.x;
          const leftX = actualPositionX - moduleWidth / 2;
          const rightX = actualPositionX + moduleWidth / 2;

          // 캐비넷 외부로 치수선 이동 (가이드라인보다 안쪽으로)
          const dimZ = spaceZOffset - mmToThreeUnits(hasPlacedModules ? 80 : 60);

          return (
            <group key={`top-module-dim-${index}`}>
              {/* 캐비넷 폭 치수선 */}
              <Line
                points={[[leftX, spaceHeight, dimZ], [rightX, spaceHeight, dimZ]]}
                color={dimensionColor}
                lineWidth={0.5}
              />

              {/* 화살표들 */}
              <Line
                points={createArrowHead([leftX, spaceHeight, dimZ], [leftX + 0.02, spaceHeight, dimZ], 0.01)}
                color={dimensionColor}
                lineWidth={0.5}
              />
              <Line
                points={createArrowHead([rightX, spaceHeight, dimZ], [rightX - 0.02, spaceHeight, dimZ], 0.01)}
                color={dimensionColor}
                lineWidth={0.5}
              />

              {/* 캐비넷 폭 치수 텍스트 - 상단뷰용, 듀얼: 0.5 단위 내림, 싱글: 정수 내림 */}
              <Text
                  renderOrder={1000}
                  depthTest={false}
                position={[actualPositionX, spaceHeight + 0.1, dimZ - mmToThreeUnits(30)]}
                fontSize={baseFontSize}
                color={dimensionColor}
                anchorX="center"
                anchorY="middle"
                rotation={[-Math.PI / 2, 0, 0]}
              >
                {(() => {
                  const isDual = module.isDualSlot || module.moduleId.includes('dual-');
                  if (isDual) {
                    const w = Math.floor(actualWidth * 2) / 2;
                    return w % 1 === 0 ? w : w.toFixed(1);
                  }
                  return Math.floor(actualWidth);
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
                      <Line
                        points={[[leftX, spaceHeight, leftFrontZ], [leftX, spaceHeight, dimZ - mmToThreeUnits(15)]]}
                        color={dimensionColor}
                        lineWidth={0.5}
                      />
                      {/* 우측 연장선 */}
                      <Line
                        points={[[rightX, spaceHeight, rightFrontZ], [rightX, spaceHeight, dimZ - mmToThreeUnits(15)]]}
                        color={dimensionColor}
                        lineWidth={0.5}
                      />
                    </>
                  );
                } else {
                  // 좌우 깊이가 동일한 경우: 기존 로직
                  const moduleDepth = mmToThreeUnits(actualDepthMm);
                  const furnitureFrontZ = furnitureZOffset + furnitureDepth/2 - doorThickness - moduleDepth/2 + moduleDepth/2;

                  return (
                    <>
                      <Line
                        points={[[leftX, spaceHeight, furnitureFrontZ], [leftX, spaceHeight, dimZ - mmToThreeUnits(15)]]}
                        color={dimensionColor}
                        lineWidth={0.5}
                      />
                      <Line
                        points={[[rightX, spaceHeight, furnitureFrontZ], [rightX, spaceHeight, dimZ - mmToThreeUnits(15)]]}
                        color={dimensionColor}
                        lineWidth={0.5}
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
                renderOrder={1000}
                depthTest={false}
                position={[column.position[0], spaceHeight + 0.1, columnCenterZ]}
                fontSize={baseFontSize * 0.8}
                color="#FF0000"
                anchorX="center"
                anchorY="middle"
                rotation={[-Math.PI / 2, 0, 0]}
              >
                {Math.round(column.width)}
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
            const moduleWidthMm = moduleData.dimensions.width;
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
                
                console.log('🔍 [스타일러장 디버깅]');
                console.log('- 모듈ID:', moduleData.id);
                console.log('- actualDepthMm (좌측):', leftDepthMm);
                console.log('- rightAbsoluteDepth (우측):', rightDepthMm);
                console.log('- leftDepth (Three.js):', leftDepth);
                console.log('- rightDepth (Three.js):', rightDepth);
                console.log('- furnitureZOffset:', furnitureZOffset);
                console.log('- furnitureDepth:', furnitureDepth);
                console.log('- doorThickness:', doorThickness);
                
                // 우측 가구의 실제 배치 위치 (깊이 차이 반영) - DualType5와 동일하게 계산
                // DualType5에서는 우측이 660mm로 더 깊으므로, 우측 뒷면이 더 뒤로 나와야 함
                const rightFurnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - rightDepth/2;
                furnitureBackZ = rightFurnitureZ - rightDepth/2;
                console.log('- rightFurnitureZ (가구 중심, 수정된 계산):', rightFurnitureZ);
                console.log('- furnitureBackZ (가구 뒷면, 수정된 계산):', furnitureBackZ);
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
                lineWidth={0.5}
              />
              
              {/* 화살표들 */}
              <Line
                points={createArrowHead([rightDimensionX, spaceHeight, rightmostBackZ], [rightDimensionX, spaceHeight, rightmostBackZ + 0.02], 0.01)}
                color={dimensionColor}
                lineWidth={0.5}
              />
              <Line
                points={createArrowHead([rightDimensionX, spaceHeight, rightFrameFrontZ], [rightDimensionX, spaceHeight, rightFrameFrontZ - 0.02], 0.01)}
                color={dimensionColor}
                lineWidth={0.5}
              />
              
              {/* 거리 텍스트 */}
              <Text
                  renderOrder={1000}
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
                lineWidth={0.5}
              />
              {/* 우측 프레임 앞면 연장선 - 공간 벽에서 짧게 */}
              <Line
                points={[[spaceXOffset + spaceWidth, spaceHeight, rightFrameFrontZ], [rightDimensionX - mmToThreeUnits(20), spaceHeight, rightFrameFrontZ]]}
                color={dimensionColor}
                lineWidth={0.5}
              />
            </group>
          );
        })()}

        {/* 도어 치수 표시 - 도어가 실제로 설치된 캐비넷에만 표시 */}
        {/* 도어 치수 표시 비활성화 */}
        {false && placedModules.length > 0 && placedModules.filter(module => {
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
          
          const actualDepthMm = module.customDepth || moduleData.dimensions.depth;
          // 기둥에 의해 조정된 너비 사용 (customWidth는 Column C용, adjustedWidth는 일반 기둥용)
          const actualWidthMm = module.customWidth || module.adjustedWidth || moduleData.dimensions.width;
          const moduleWidth = mmToThreeUnits(actualWidthMm);
          const leftX = module.position.x - moduleWidth / 2;
          const rightX = module.position.x + moduleWidth / 2;
          
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
              {/* 하단 도어 치수 - 듀얼인 경우 각각 따로, 싱글인 경우 전체 */}
              {/* 모든 도어의 치수는 leftDoorFrontZ를 사용하여 동일한 Z 라인에 배치 */}
              {isDualDoor ? (
                // 듀얼 도어: 좌우 각각 치수 표시
                <>
                  {/* 좌측 도어 치수 */}
                  <group>
                    <NativeLine name="dimension_line"
                      points={[[leftDoorLeftX, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)], [leftDoorRightX, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)]]}
                      color={dimensionColor}
                      lineWidth={1}
                      renderOrder={100000}
                      depthTest={false}
                    />
                    <NativeLine name="dimension_line"
                      points={createArrowHead([leftDoorLeftX, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)], [leftDoorLeftX + 0.05, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)])}
                      color={dimensionColor}
                      lineWidth={1}
                      renderOrder={100000}
                      depthTest={false}
                    />
                    <NativeLine name="dimension_line"
                      points={createArrowHead([leftDoorRightX, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)], [leftDoorRightX - 0.05, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)])}
                      color={dimensionColor}
                      lineWidth={1}
                      renderOrder={100000}
                      depthTest={false}
                    />
                    <Text
                  renderOrder={1000}
                  depthTest={false}
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
                      lineWidth={1}
                      renderOrder={100000}
                      depthTest={false}
                    />
                    <NativeLine name="dimension_line"
                      points={[[leftDoorRightX, spaceHeight, leftDoorFrontZ], [leftDoorRightX, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 60 : 40)]]}
                      color={dimensionColor}
                      lineWidth={1}
                      renderOrder={100000}
                      depthTest={false}
                    />
                  </group>
                  
                  {/* 우측 도어 치수 - 모든 도어와 동일한 Z 라인 사용 */}
                  <group>
                    <NativeLine name="dimension_line"
                      points={[[rightDoorLeftX, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)], [rightDoorRightX, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)]]}
                      color={dimensionColor}
                      lineWidth={1}
                      renderOrder={100000}
                      depthTest={false}
                    />
                    <NativeLine name="dimension_line"
                      points={createArrowHead([rightDoorLeftX, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)], [rightDoorLeftX + 0.05, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)])}
                      color={dimensionColor}
                      lineWidth={1}
                      renderOrder={100000}
                      depthTest={false}
                    />
                    <NativeLine name="dimension_line"
                      points={createArrowHead([rightDoorRightX, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)], [rightDoorRightX - 0.05, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)])}
                      color={dimensionColor}
                      lineWidth={1}
                      renderOrder={100000}
                      depthTest={false}
                    />
                    <Text
                  renderOrder={1000}
                  depthTest={false}
                      position={[(rightDoorLeftX + rightDoorRightX) / 2, spaceHeight + 0.1, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 120 : 100)]}
                      fontSize={baseFontSize}
                      color={dimensionColor}
                      anchorX="center"
                      anchorY="middle"
                      rotation={[-Math.PI / 2, 0, 0]}
                    >
                      {Math.round((actualWidthMm - 6) / 2)}
                    </Text>
                    <NativeLine name="dimension_line"
                      points={[[rightDoorLeftX, spaceHeight, leftDoorFrontZ], [rightDoorLeftX, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 60 : 40)]]}
                      color={dimensionColor}
                      lineWidth={1}
                      renderOrder={100000}
                      depthTest={false}
                    />
                    <NativeLine name="dimension_line"
                      points={[[rightDoorRightX, spaceHeight, leftDoorFrontZ], [rightDoorRightX, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 60 : 40)]]}
                      color={dimensionColor}
                      lineWidth={1}
                      renderOrder={100000}
                      depthTest={false}
                    />
                  </group>
                  
                  {/* 중간 세로 가이드선 - 듀얼 도어를 나누는 중간선이 가로 치수선까지 확장 */}
                  <group>
                    <NativeLine name="dimension_line"
                      points={[[module.position.x, spaceHeight, leftDoorFrontZ], [module.position.x, spaceHeight, leftDoorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)]]}
                      color={dimensionColor}
                      lineWidth={1}
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
                    lineWidth={1}
                    renderOrder={100000}
                    depthTest={false}
                  />
                  <NativeLine name="dimension_line"
                    points={createArrowHead([leftDoorLeftX, spaceHeight, doorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)], [leftDoorLeftX + 0.05, spaceHeight, doorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)])}
                    color={dimensionColor}
                    lineWidth={1}
                    renderOrder={100000}
                    depthTest={false}
                  />
                  <NativeLine name="dimension_line"
                    points={createArrowHead([rightDoorRightX, spaceHeight, doorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)], [rightDoorRightX - 0.05, spaceHeight, doorFrontZ + mmToThreeUnits(hasPlacedModules ? 80 : 60)])}
                    color={dimensionColor}
                    lineWidth={1}
                    renderOrder={100000}
                    depthTest={false}
                  />
                  <Text
                  renderOrder={1000}
                  depthTest={false}
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
                    lineWidth={1}
                    renderOrder={100000}
                    depthTest={false}
                  />
                  <NativeLine name="dimension_line"
                    points={[[rightDoorRightX, spaceHeight, doorFrontZ], [rightDoorRightX, spaceHeight, doorFrontZ + mmToThreeUnits(hasPlacedModules ? 60 : 40)]]}
                    color={dimensionColor}
                    lineWidth={1}
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
                  lineWidth={0.5}
                />
                {/* 도어 두께 화살표 */}
                <Line
                  points={createArrowHead([spaceXOffset - mmToThreeUnits(200), spaceHeight, -mmToThreeUnits(18)], [spaceXOffset - mmToThreeUnits(200), spaceHeight, -mmToThreeUnits(18) + 0.02], 0.01)}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                <Line
                  points={createArrowHead([spaceXOffset - mmToThreeUnits(200), spaceHeight, mmToThreeUnits(0)], [spaceXOffset - mmToThreeUnits(200), spaceHeight, mmToThreeUnits(0) - 0.02], 0.01)}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                {/* 도어 두께 텍스트 (중앙 위치) */}
                <Text
                  position={[spaceXOffset - mmToThreeUnits(240), spaceHeight + 0.1, -mmToThreeUnits(9)]}
                  fontSize={baseFontSize}
                  color={dimensionColor}
                  anchorX="center"
                  anchorY="middle"
                  rotation={[-Math.PI / 2, 0, 0]}
                  renderOrder={1000}
                  depthTest={false}
                >
                  {doorThicknessMm}
                </Text>
                {/* 도어 두께 연결선 - 실제 도어 위치에 맞춤 */}
                <Line
                  points={[[leftDoorLeftX, spaceHeight, -mmToThreeUnits(18)], [spaceXOffset - mmToThreeUnits(180), spaceHeight, -mmToThreeUnits(18)]]}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
                <Line
                  points={[[leftDoorLeftX, spaceHeight, mmToThreeUnits(0)], [spaceXOffset - mmToThreeUnits(180), spaceHeight, mmToThreeUnits(0)]]}
                  color={dimensionColor}
                  lineWidth={0.5}
                />
              </group>
            </group>
          );
        })}
                  </>
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

  console.log('🎨 CleanCAD2D 최종 렌더링:', {
    currentViewDirection,
    showDimensions,
    hasColumns: !!spaceInfo.columns,
    columnCount: spaceInfo.columns?.length,
    shouldRenderColumns: currentViewDirection === 'front'
  });

  return (
    <group 
      ref={groupRef} 
      renderOrder={1000000}
    >
      {/* 치수선 렌더링 - 조건은 renderDimensions 내부에서 처리 */}
      {renderDimensions()}
      
      {/* 기둥 렌더링 - 조건은 renderColumns 내부에서 처리 */}
      {renderColumns()}
      
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
            lineWidth={1}
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
            lineWidth={1}
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
