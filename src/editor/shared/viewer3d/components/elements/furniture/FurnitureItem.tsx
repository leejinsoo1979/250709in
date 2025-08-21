import React, { useEffect } from 'react';
import { Box, Edges, Html } from '@react-three/drei';
import { ThreeEvent, useThree } from '@react-three/fiber';
import { getModuleById } from '@/data/modules';
import { calculateInternalSpace } from '../../../utils/geometry';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { PlacedModule } from '@/editor/shared/furniture/types';
import BoxModule from '../../modules/BoxModule';
import * as THREE from 'three';
import { analyzeColumnSlots, calculateFurnitureWidthWithColumn, convertDualToSingleIfNeeded, calculateFurnitureBounds, calculateOptimalHingePosition } from '@/editor/shared/utils/columnSlotProcessor';
import { calculateSpaceIndexing, ColumnIndexer } from '@/editor/shared/utils/indexing';
import DoorModule from '../../modules/DoorModule';
import { useUIStore } from '@/store/uiStore';
import { EditIcon } from '@/components/common/Icons';
import { getEdgeColor } from '../../../utils/edgeColorUtils';
import { useColumnCResize } from '@/editor/shared/furniture/hooks/useColumnCResize';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import BoxWithEdges from '../../modules/components/BoxWithEdges';
import { isCabinetTexture1, applyCabinetTexture1Settings } from '@/editor/shared/utils/materialConstants';
import EndPanelWithTexture from '../../modules/components/EndPanelWithTexture';

// 엔드패널 두께 상수
const END_PANEL_THICKNESS = 18; // mm

// 상부장/하부장과 키큰장(듀얼 포함)의 인접 판단 함수
const checkAdjacentUpperLowerToFull = (
  currentModule: PlacedModule,
  allModules: PlacedModule[],
  spaceInfo: SpaceInfo
): { hasAdjacentUpperLower: boolean; adjacentSide: 'left' | 'right' | 'both' | null } => {
  // 현재 가구가 키큰장(full) 또는 듀얼 캐비넷인지 확인
  const currentModuleData = getModuleById(currentModule.moduleId, calculateInternalSpace(spaceInfo), spaceInfo);
  if (!currentModuleData) {
    return { hasAdjacentUpperLower: false, adjacentSide: null };
  }
  
  // 키큰장(full)이 아니고 듀얼 캐비넷도 아니면 처리하지 않음
  const isDualCabinet = currentModule.moduleId?.includes('dual-');
  
  console.log('🔍 checkAdjacentUpperLowerToFull 시작:', {
    moduleId: currentModule.moduleId,
    category: currentModuleData.category,
    isDualCabinet,
    slotIndex: currentModule.slotIndex
  });
  
  if (currentModuleData.category !== 'full' && !isDualCabinet) {
    console.log('❌ 키큰장/듀얼이 아니므로 처리 안함');
    return { hasAdjacentUpperLower: false, adjacentSide: null };
  }

  // 현재 가구의 슬롯 인덱스
  const currentSlotIndex = currentModule.slotIndex;
  if (currentSlotIndex === undefined) {
    return { hasAdjacentUpperLower: false, adjacentSide: null };
  }

  // 듀얼 캐비넷의 경우 두 개의 슬롯을 차지
  const isCurrentDual = isDualCabinet || currentModule.isDualSlot;
  
  // 인접한 슬롯에 상부장/하부장이 있는지 확인
  // 듀얼 캐비넷의 경우:
  // - 왼쪽 인접: 첫 번째 슬롯의 왼쪽 (currentSlotIndex - 1)
  // - 오른쪽 인접: 두 번째 슬롯의 오른쪽 (currentSlotIndex + 2)
  const leftAdjacentModule = allModules.find(m => m.slotIndex === currentSlotIndex - 1);
  const rightAdjacentModule = isCurrentDual 
    ? allModules.find(m => m.slotIndex === currentSlotIndex + 2)  // 듀얼은 +2
    : allModules.find(m => m.slotIndex === currentSlotIndex + 1); // 싱글은 +1

  // 양쪽 인접 가구 체크를 위한 변수
  let hasLeftAdjacent = false;
  let hasRightAdjacent = false;

  // 왼쪽 인접 가구 확인
  if (leftAdjacentModule) {
    const leftModuleData = getModuleById(leftAdjacentModule.moduleId, calculateInternalSpace(spaceInfo), spaceInfo);
    const isLeftUpperLower = leftModuleData && (leftModuleData.category === 'upper' || leftModuleData.category === 'lower');
    const isLeftDualUpperLower = leftAdjacentModule.moduleId?.includes('dual-') && isLeftUpperLower;
    
    // 왼쪽이 듀얼상하부장인 경우, 그 듀얼의 오른쪽 슬롯이 현재 가구와 인접한지 확인
    if (isLeftDualUpperLower && leftAdjacentModule.isDualSlot) {
      // 듀얼상하부장의 오른쪽 슬롯이 현재 가구의 왼쪽과 인접
      const leftDualRightSlot = leftAdjacentModule.slotIndex + 1;
      if (leftDualRightSlot === currentSlotIndex - 1) {
        console.log('🔍 키큰장 왼쪽에 듀얼상하부장 감지 (듀얼의 오른쪽 슬롯):', {
          current: currentModule.moduleId,
          leftModule: leftAdjacentModule.moduleId,
          isDual: isCurrentDual
        });
        hasLeftAdjacent = true;
      }
    } else if (isLeftUpperLower) {
      console.log('🔍 듀얼/키큰장 왼쪽에 상하부장 감지:', {
        current: currentModule.moduleId,
        leftModule: leftAdjacentModule.moduleId,
        isDual: isCurrentDual
      });
      hasLeftAdjacent = true;
    }
  }
  
  // 왼쪽에 듀얼상하부장이 있는지 추가 체크 (듀얼의 오른쪽 슬롯이 현재 슬롯-1인 경우)
  if (!hasLeftAdjacent) {
    const leftDualModule = allModules.find(m => 
      m.isDualSlot && 
      m.slotIndex === currentSlotIndex - 2 // 듀얼이 2슬롯 차지하므로
    );
    if (leftDualModule) {
      const leftDualModuleData = getModuleById(leftDualModule.moduleId, calculateInternalSpace(spaceInfo), spaceInfo);
      if (leftDualModuleData && (leftDualModuleData.category === 'upper' || leftDualModuleData.category === 'lower')) {
        console.log('🔍 키큰장 왼쪽에 듀얼상하부장 감지:', {
          current: currentModule.moduleId,
          leftDualModule: leftDualModule.moduleId
        });
        hasLeftAdjacent = true;
      }
    }
  }

  // 오른쪽 인접 가구 확인
  if (rightAdjacentModule) {
    const rightModuleData = getModuleById(rightAdjacentModule.moduleId, calculateInternalSpace(spaceInfo), spaceInfo);
    const isRightUpperLower = rightModuleData && (rightModuleData.category === 'upper' || rightModuleData.category === 'lower');
    const isRightDualUpperLower = rightAdjacentModule.moduleId?.includes('dual-') && isRightUpperLower;
    
    if (isRightUpperLower) {
      console.log('🔍 듀얼/키큰장 오른쪽에 상하부장 감지:', {
        current: currentModule.moduleId,
        rightModule: rightAdjacentModule.moduleId,
        isDual: isCurrentDual,
        currentSlotIndex,
        rightCheckSlot: isCurrentDual ? currentSlotIndex + 2 : currentSlotIndex + 1,
        isRightDualUpperLower
      });
      hasRightAdjacent = true;
    }
  }

  // 결과 반환
  const result = (() => {
    if (hasLeftAdjacent && hasRightAdjacent) {
      return { hasAdjacentUpperLower: true, adjacentSide: 'both' };
    } else if (hasLeftAdjacent) {
      return { hasAdjacentUpperLower: true, adjacentSide: 'left' };
    } else if (hasRightAdjacent) {
      return { hasAdjacentUpperLower: true, adjacentSide: 'right' };
    }
    return { hasAdjacentUpperLower: false, adjacentSide: null };
  })();

  // 듀얼 가구일 때만 디버그 로그
  if (isCurrentDual) {
    console.log('🎯 듀얼 가구 인접 체크 결과:', {
      currentModule: currentModule.moduleId,
      currentSlotIndex,
      hasLeftAdjacent,
      hasRightAdjacent,
      adjacentSide: result.adjacentSide,
      leftCheckSlot: currentSlotIndex - 1,
      rightCheckSlot: currentSlotIndex + 2,
      leftAdjacentModule: leftAdjacentModule?.moduleId,
      rightAdjacentModule: rightAdjacentModule?.moduleId,
      allModulesSlots: allModules.map(m => ({id: m.moduleId, slot: m.slotIndex}))
    });
  }

  return result;
};

interface FurnitureItemProps {
  placedModule: PlacedModule;
  placedModules: PlacedModule[]; // 추가
  spaceInfo: SpaceInfo;
  furnitureStartY: number;
  isDragMode: boolean;
  isEditMode: boolean;
  isDraggingThis: boolean;
  viewMode: '2D' | '3D';
  view2DDirection?: 'front' | 'left' | 'right' | 'top' | 'all';
  renderMode: 'solid' | 'wireframe';
  onPointerDown: (e: ThreeEvent<PointerEvent>, id: string) => void;
  onPointerMove: (e: ThreeEvent<PointerEvent>) => void;
  onPointerUp: () => void;
  onDoubleClick: (e: ThreeEvent<MouseEvent>, id: string) => void;
  showFurniture?: boolean; // 가구 표시 여부 추가
}

const FurnitureItem: React.FC<FurnitureItemProps> = ({
  placedModule,
  placedModules,
  spaceInfo,
  furnitureStartY,
  isDragMode,
  isEditMode,
  isDraggingThis,
  viewMode,
  view2DDirection,
  renderMode,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onDoubleClick,
  showFurniture = true // 기본값 true
}) => {
  // furnitureStartY 변경 감지
  React.useEffect(() => {
    if (placedModule.moduleId.includes('dual-4drawer-pantshanger') || placedModule.moduleId.includes('dual-2drawer-styler')) {
      console.log('🎯 FurnitureItem - furnitureStartY 변경 감지:', {
        moduleId: placedModule.moduleId,
        furnitureStartY,
        baseConfig: spaceInfo?.baseConfig,
        placementType: spaceInfo?.baseConfig?.placementType,
        floatHeight: spaceInfo?.baseConfig?.floatHeight
      });
    }
  }, [furnitureStartY, spaceInfo?.baseConfig?.placementType, spaceInfo?.baseConfig?.floatHeight, placedModule.moduleId]);
  // Three.js 컨텍스트 접근
  const { gl, invalidate, scene, camera } = useThree();
  const { isFurnitureDragging, showDimensions, view2DTheme, highlightedCompartment } = useUIStore();
  const { updatePlacedModule } = useFurnitureStore();
  const [isHovered, setIsHovered] = React.useState(false);
  
  // 이 가구가 강조되어야 하는지 확인
  const isHighlighted = highlightedCompartment === placedModule.id;
  
  // 디버깅 로그
  React.useEffect(() => {
    if (isHighlighted) {
      console.log('🔆 가구 강조됨:', {
        moduleId: placedModule.id,
        highlightedCompartment,
        isHighlighted
      });
    }
  }, [isHighlighted, placedModule.id, highlightedCompartment]);
  
  // 가구 위치 변경 시 렌더링 업데이트 및 그림자 업데이트 (Hook을 먼저 호출)
  React.useEffect(() => {
    invalidate();
    
    // 3D 모드에서 그림자 강제 업데이트
    if (gl && gl.shadowMap) {
      gl.shadowMap.needsUpdate = true;
      
      // 메쉬 렌더링 완료 보장을 위한 지연 업데이트
      setTimeout(() => {
        gl.shadowMap.needsUpdate = true;
        invalidate();
      }, 100);
      
      // 추가로 300ms 후에도 한 번 더 (완전한 렌더링 보장)
      setTimeout(() => {
        gl.shadowMap.needsUpdate = true;
        invalidate();
      }, 300);
    }
  }, [placedModule.position.x, placedModule.position.y, placedModule.position.z, placedModule.id, invalidate, gl]);
  
  // Early state for module data check
  const [moduleNotFound, setModuleNotFound] = React.useState(false);
  
  // 테마 색상 가져오기
  const getThemeColor = () => {
    const computedStyle = getComputedStyle(document.documentElement);
    return computedStyle.getPropertyValue('--theme-primary').trim() || '#10b981';
  };
  
  // 내경 공간 계산 - zone 정보가 있으면 zone별 계산
  let internalSpace = calculateInternalSpace(spaceInfo);
  let zoneSpaceInfo = spaceInfo;
  
  // 단내림이 활성화되고 zone 정보가 있는 경우 영역별 처리
  // 높이는 항상 재계산해야 하므로 조건 제거
  if (spaceInfo.droppedCeiling?.enabled && placedModule.zone) {
    const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
    const targetZone = placedModule.zone === 'dropped' && zoneInfo.dropped ? zoneInfo.dropped : zoneInfo.normal;
    
    // 단내림 영역별 외경 너비 계산 (프레임 포함)
    const droppedCeilingWidth = spaceInfo.droppedCeiling?.width || DEFAULT_DROPPED_CEILING_VALUES.WIDTH;
    let zoneOuterWidth: number;
    
    if (placedModule.zone === 'dropped') {
      // 단내림 영역의 외경 너비
      zoneOuterWidth = droppedCeilingWidth;
    } else {
      // 메인 영역의 외경 너비
      zoneOuterWidth = spaceInfo.width - droppedCeilingWidth;
    }
    
    // 영역별 spaceInfo 생성
    zoneSpaceInfo = {
      ...spaceInfo,
      width: zoneOuterWidth,  // zone의 외경 너비
      zone: placedModule.zone  // zone 정보 추가
    };
    
    internalSpace = calculateInternalSpace(zoneSpaceInfo);
    internalSpace.startX = targetZone.startX;
    
    // calculateInternalSpace에서 이미 zone === 'dropped'일 때 높이를 조정하므로
    // 여기서는 추가 조정하지 않음
    if (placedModule.zone === 'dropped') {
      console.log('🏗️ [FurnitureItem] 단내림 구간 내경 공간:', {
        zone: placedModule.zone,
        internalHeight: internalSpace.height,
        dropHeight: spaceInfo.droppedCeiling?.dropHeight || 200,
        customHeight: placedModule.customHeight
      });
    }
  }
  
  // 모듈 데이터 가져오기 - zone별 spaceInfo 사용
  console.log('🔍 [FurnitureItem] getModuleById 호출:', {
    moduleId: placedModule.moduleId,
    customWidth: placedModule.customWidth,
    zone: placedModule.zone,
    internalSpace: internalSpace
  });
  
  // 너비에 따라 모듈 ID 생성
  let targetModuleId = placedModule.moduleId;
  
  // adjustedWidth가 있는 경우 (기둥 A 침범) - 원본 모듈 ID 사용
  // 폭 조정은 렌더링 시에만 적용
  if (placedModule.adjustedWidth) {
    console.log('🔧 [FurnitureItem] 기둥 A 침범 - 원본 모듈 사용, 폭은 렌더링 시 조정:', {
      moduleId: placedModule.moduleId,
      adjustedWidth: placedModule.adjustedWidth,
      renderWidth: placedModule.adjustedWidth
    });
  }
  // customWidth가 있고 adjustedWidth가 없는 경우 - customWidth로 모듈 ID 생성
  else if (placedModule.customWidth && !placedModule.adjustedWidth && !placedModule.moduleId.endsWith(`-${placedModule.customWidth}`)) {
    const baseType = placedModule.moduleId.replace(/-\d+$/, '');
    targetModuleId = `${baseType}-${placedModule.customWidth}`;
    console.log('🔧 [FurnitureItem] customWidth로 ModuleID 생성:', {
      original: placedModule.moduleId,
      customWidth: placedModule.customWidth,
      newTargetModuleId: targetModuleId
    });
  }
  
  let moduleData = getModuleById(targetModuleId, internalSpace, zoneSpaceInfo);
  
  // Set state instead of early return to maintain hooks order
  React.useEffect(() => {
    if (!moduleData) {
      console.error('❌ [FurnitureItem] 모듈을 찾을 수 없음:', {
        targetModuleId,
        originalModuleId: placedModule.moduleId,
        adjustedWidth: placedModule.adjustedWidth,
        customWidth: placedModule.customWidth
      });
      setModuleNotFound(true);
    } else {
      setModuleNotFound(false);
    }
  }, [moduleData, targetModuleId, placedModule.moduleId, placedModule.adjustedWidth, placedModule.customWidth]);
  
  if (moduleData) {
    console.log('✅ [FurnitureItem] 찾은 모듈:', {
      targetModuleId: targetModuleId,
      originalModuleId: placedModule.moduleId,
      moduleId: moduleData.id,
      moduleWidth: moduleData.dimensions.width,
      moduleHeight: moduleData.dimensions.height,
      customWidth: placedModule.customWidth,
      expectedWidth: placedModule.customWidth || moduleData.dimensions.width,
      placedModuleId: placedModule.moduleId,
      idContainsWidth: placedModule.moduleId.match(/-(\d+)$/),
      zone: placedModule.zone,
      internalSpaceHeight: internalSpace.height
    });
  }

  // mm를 Three.js 단위로 변환
  const mmToThreeUnits = (mm: number) => mm * 0.01;
  
  // 기둥 포함 슬롯 분석 (기둥 변경사항 실시간 반영)
  const columnSlots = React.useMemo(() => {
    return analyzeColumnSlots(spaceInfo, placedModules);
  }, [spaceInfo, spaceInfo.columns, placedModule.id, placedModule.slotIndex, placedModules]);
  
  // zone 로컬 인덱스를 전체 인덱스로 변환
  let globalSlotIndex = placedModule.slotIndex;
  if (spaceInfo.droppedCeiling?.enabled && placedModule.zone) {
    const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
    
    if (spaceInfo.droppedCeiling.position === 'right' && placedModule.zone === 'dropped') {
      // 단내림이 오른쪽: 단내림 슬롯은 메인 슬롯 뒤에 위치
      globalSlotIndex = placedModule.slotIndex + zoneInfo.normal.columnCount;
    } else if (spaceInfo.droppedCeiling.position === 'left' && placedModule.zone === 'normal') {
      // 단내림이 왼쪽: 메인 슬롯은 단내림 슬롯 뒤에 위치
      globalSlotIndex = placedModule.slotIndex + zoneInfo.dropped.columnCount;
    }
  }
  
  // 도어 위치 고정을 위한 원래 슬롯 정보 계산 - zone별 처리
  let indexing;
  if (spaceInfo.droppedCeiling?.enabled && placedModule.zone) {
    const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
    const targetZone = placedModule.zone === 'dropped' && zoneInfo.dropped ? zoneInfo.dropped : zoneInfo.normal;
    
    // zone별 indexing은 targetZone 정보를 직접 사용
    indexing = {
      columnCount: targetZone.columnCount,
      columnWidth: targetZone.columnWidth,
      threeUnitPositions: [],
      threeUnitDualPositions: {},
      threeUnitBoundaries: []
    };
  } else {
    indexing = calculateSpaceIndexing(zoneSpaceInfo);
  }
  
  const slotInfo = globalSlotIndex !== undefined ? columnSlots[globalSlotIndex] : undefined;
  const isColumnC = (slotInfo?.columnType === 'medium') || false;
  
  // 듀얼 → 싱글 변환 확인 (드래그 중이 아닐 때만, 기둥 C가 아닐 때만)
  let actualModuleData = moduleData;
  if (!isFurnitureDragging && slotInfo && slotInfo.hasColumn && !isColumnC && moduleData) {
    const conversionResult = convertDualToSingleIfNeeded(moduleData, slotInfo, spaceInfo);
    if (conversionResult.shouldConvert && conversionResult.convertedModuleData) {
      actualModuleData = conversionResult.convertedModuleData;
    }
  }
  
  // Column C에서 싱글 가구로 변환 (듀얼 가구가 Column C에 배치된 경우)
  if (!isFurnitureDragging && isColumnC && moduleData && moduleData.id.includes('dual-')) {
    actualModuleData = {
      ...moduleData,
      id: moduleData.id.replace('dual-', 'single-'),
      name: moduleData.name.replace('듀얼', '싱글'),
      dimensions: {
        ...moduleData.dimensions,
        width: slotInfo?.subSlots ? 
          (placedModule.subSlotPosition === 'left' ? 
            slotInfo.subSlots.left.availableWidth : 
            slotInfo.subSlots.right.availableWidth) : 
          indexing.columnWidth / 2
      }
    };
  }
  
  // 듀얼 가구인지 확인 (가장 먼저 계산)
  // placedModule.isDualSlot이 있으면 그것을 사용, 없으면 모듈 ID로 판단
  const isDualFurniture = placedModule.isDualSlot !== undefined 
    ? placedModule.isDualSlot 
    : (actualModuleData?.id.includes('dual-') || false);
  
  // 상부장/하부장과 인접한 키큰장인지 확인 (actualModuleData가 있을 때만)
  const adjacentCheck = actualModuleData 
    ? checkAdjacentUpperLowerToFull(placedModule, placedModules, spaceInfo)
    : { hasAdjacentUpperLower: false, adjacentSide: null };
  let needsEndPanelAdjustment = adjacentCheck.hasAdjacentUpperLower;
  let endPanelSide = adjacentCheck.adjacentSide;
  
  // 상하부장은 엔드패널이 필요없으므로 인접 체크 불필요
  // 상하부장 인접 체크 로직 제거됨
  
  // 듀얼 가구 인접 체크 디버깅
  if (isDualFurniture && actualModuleData) {
    console.log('🔍 듀얼 가구 인접 체크:', {
      moduleId: placedModule.moduleId,
      slotIndex: placedModule.slotIndex,
      isDualFurniture,
      category: actualModuleData.category,
      adjacentCheck,
      needsEndPanelAdjustment
    });
  }
  
  // 캐비넷 너비 결정: 슬롯 너비 우선 정책
  // 1순위: adjustedWidth (기둥 침범 케이스)
  // 2순위: slotWidths (슬롯 경계에 정확히 맞춤)
  // 3순위: customWidth (명시적 설정)
  // 4순위: 모듈 기본 너비
  let furnitureWidthMm = actualModuleData?.dimensions.width || 600; // 기본값
  
  // adjustedWidth가 있으면 최우선 사용 (기둥 침범 케이스)
  if (placedModule.adjustedWidth !== undefined && placedModule.adjustedWidth !== null) {
    furnitureWidthMm = placedModule.adjustedWidth;
    console.log('📐 adjustedWidth 사용 (기둥 침범):', furnitureWidthMm);
  } else if (indexing.slotWidths && placedModule.slotIndex !== undefined && indexing.slotWidths[placedModule.slotIndex] !== undefined) {
    // 슬롯 너비를 우선적으로 사용 - 캐비넷은 슬롯에 정확히 맞춤
    if (isDualFurniture && placedModule.slotIndex < indexing.slotWidths.length - 1) {
      furnitureWidthMm = indexing.slotWidths[placedModule.slotIndex] + indexing.slotWidths[placedModule.slotIndex + 1];
      console.log('📐 듀얼 캐비넷 - 슬롯 너비 사용:', furnitureWidthMm, '(두 슬롯 합계)');
    } else {
      furnitureWidthMm = indexing.slotWidths[placedModule.slotIndex];
      console.log('📐 싱글 캐비넷 - 슬롯 너비 사용:', furnitureWidthMm);
    }
  } else if (placedModule.customWidth !== undefined && placedModule.customWidth !== null) {
    // customWidth가 명시적으로 설정되어 있으면 사용
    furnitureWidthMm = placedModule.customWidth;
    console.log('📐 customWidth 사용:', furnitureWidthMm);
  } else {
    // 기본값은 모듈 원래 크기
    console.log('📐 기본 너비 사용:', furnitureWidthMm);
  }
  
  // 키큰장/듀얼장이 상부장/하부장과 인접한 경우만 너비 조정 (상하부장 자체는 조정 안함)
  if (needsEndPanelAdjustment && actualModuleData?.category !== 'upper' && actualModuleData?.category !== 'lower') {
    const originalWidth = furnitureWidthMm;
    
    // 듀얼 가구의 경우 특별 처리
    if (isDualFurniture) {
      // 듀얼 가구는 양쪽에 상하부장이 있을 때 양쪽 18mm씩 총 36mm 줄여야 함
      // 한쪽만 있을 때는 18mm만 줄임
      const reduction = endPanelSide === 'both' ? END_PANEL_THICKNESS * 2 : END_PANEL_THICKNESS;
      furnitureWidthMm -= reduction;
      
      console.log('🔧 듀얼장 - 상하부장 인접으로 너비 조정:', {
        moduleId: placedModule.moduleId,
        slotIndex: placedModule.slotIndex,
        category: actualModuleData?.category,
        isDualFurniture,
        originalWidth,
        adjustedWidth: furnitureWidthMm,
        endPanelSide,
        reduction,
        needsEndPanelAdjustment,
        adjacentCheck,
        description: endPanelSide === 'both' 
          ? '듀얼장 양쪽에 상하부장 - 36mm 축소 (양쪽 18mm씩)'
          : `듀얼장 ${endPanelSide}쪽에 상하부장 - 18mm 축소`
      });
    } else {
      // 싱글 키큰장은 기존 로직 유지
      const reduction = endPanelSide === 'both' ? END_PANEL_THICKNESS * 2 : END_PANEL_THICKNESS;
      furnitureWidthMm -= reduction;
      
      console.log('🔧 키큰장 - 상하부장 인접으로 너비 조정:', {
        moduleId: placedModule.moduleId,
        category: actualModuleData?.category,
        isDualFurniture,
        originalWidth,
        adjustedWidth: furnitureWidthMm,
        endPanelSide,
        reduction,
        description: endPanelSide === 'both' 
          ? '키큰장 + 양쪽 엔드패널(36mm) = 슬롯 전체 너비'
          : '키큰장 + 엔드패널(18mm) = 슬롯 전체 너비'
      });
    }
  }
  
  // 슬롯 가이드와의 크기 비교 로그
  if (indexing.slotWidths && placedModule.slotIndex !== undefined) {
    const slotGuideWidth = isDualFurniture && placedModule.slotIndex < indexing.slotWidths.length - 1
      ? indexing.slotWidths[placedModule.slotIndex] + indexing.slotWidths[placedModule.slotIndex + 1]
      : indexing.slotWidths[placedModule.slotIndex];
    
    console.log('📏 FurnitureItem 크기 비교:', {
      moduleId: placedModule.moduleId,
      slotIndex: placedModule.slotIndex,
      'slotGuideWidth(mm)': slotGuideWidth,
      'furnitureWidth(mm)': furnitureWidthMm,
      'difference(mm)': Math.abs(slotGuideWidth - furnitureWidthMm),
      'difference(Three.js)': Math.abs(slotGuideWidth - furnitureWidthMm) * 0.01,
      'customWidth': placedModule.customWidth,
      'adjustedWidth': placedModule.adjustedWidth,
      'moduleWidth': actualModuleData?.dimensions.width || 600,
      'isDualSlot': isDualFurniture,
      'widthSource': placedModule.customWidth !== undefined && placedModule.customWidth !== null ? 'customWidth' : 
                    placedModule.adjustedWidth !== undefined && placedModule.adjustedWidth !== null ? 'adjustedWidth' : 'moduleDefault'
    });
  }
  
  // 마지막 슬롯인지 먼저 확인 (듀얼 가구는 columnCount - 2가 마지막)
  let isLastSlot = false;
  if (placedModule.zone && spaceInfo.droppedCeiling?.enabled) {
    const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
    const targetZone = placedModule.zone === 'dropped' && zoneInfo.dropped ? zoneInfo.dropped : zoneInfo.normal;
    // 듀얼 가구는 2개 슬롯을 차지하므로, 마지막 슬롯뿐 아니라 마지막-1 슬롯에 있어도 마지막으로 판단
    isLastSlot = isDualFurniture 
      ? placedModule.slotIndex + 2 >= targetZone.columnCount
      : placedModule.slotIndex === targetZone.columnCount - 1;
  } else {
    isLastSlot = isDualFurniture
      ? placedModule.slotIndex + 2 >= indexing.columnCount
      : placedModule.slotIndex === indexing.columnCount - 1;
  }

  // 원래 슬롯 너비 저장 (기둥 침범 조정 전, 커버도어용)
  // adjustedWidth가 있어도 도어는 원래 슬롯 크기를 유지해야 함
  let originalSlotWidthMm;
  if (indexing.slotWidths && placedModule.slotIndex !== undefined && indexing.slotWidths[placedModule.slotIndex] !== undefined) {
    // 슬롯 너비 사용
    if (isDualFurniture && placedModule.slotIndex < indexing.slotWidths.length - 1) {
      originalSlotWidthMm = indexing.slotWidths[placedModule.slotIndex] + indexing.slotWidths[placedModule.slotIndex + 1];
    } else {
      originalSlotWidthMm = indexing.slotWidths[placedModule.slotIndex];
    }
  } else {
    // 슬롯 너비가 없으면 모듈 기본 너비 사용
    originalSlotWidthMm = actualModuleData?.dimensions.width || 600;
  }
  
  // 노서라운드 모드에서 엔드패널 옆 캐비넷은 18mm 줄이기
  // 단, customWidth가 이미 설정되어 있으면 이미 올바른 슬롯 너비가 반영된 것이므로 추가로 빼지 않음
  let adjustedWidthForEndPanel = furnitureWidthMm;
  let positionAdjustmentForEndPanel = 0; // 위치 조정값
  
  console.log('🔍 노서라운드 조정 전 상태:', {
    moduleId: placedModule.moduleId,
    slotIndex: placedModule.slotIndex,
    furnitureWidthMm,
    hasCustomWidth: placedModule.customWidth !== undefined && placedModule.customWidth !== null,
    customWidth: placedModule.customWidth,
    surroundType: spaceInfo.surroundType,
    installType: spaceInfo.installType,
    columnCount: indexing.columnCount,
    isLastSlot,
    placedModulePosition: placedModule.position
  });
  
  // 노서라운드 엔드패널 슬롯인지 확인 (도어 위치 결정용)
  // 단내림이 있을 때는 '공간 전체(Global)' 기준의 첫/마지막 슬롯만 엔드패널로 취급해야 함
  const isNoSurroundEndSlot = (() => {
    if (spaceInfo.surroundType !== 'no-surround' || placedModule.slotIndex === undefined) return false;

    // 기본값: 현재 계산된 isLastSlot, slotIndex 0를 사용 (단내림 없음)
    let isGlobalFirst = placedModule.slotIndex === 0;
    let isGlobalLast = isLastSlot;

    if (spaceInfo.droppedCeiling?.enabled && placedModule.zone) {
      const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
      const totalColumnCount = (zoneInfo.normal?.columnCount || 0) + (zoneInfo.dropped?.columnCount || 0);

      // zone 로컬 인덱스를 글로벌 인덱스로 변환
      let globalSlotIndex = placedModule.slotIndex;
      if (spaceInfo.droppedCeiling.position === 'right') {
        // 단내림이 우측이면: 메인(좌측) → 0..normal-1, 단내림(우측) → normal..(total-1)
        if (placedModule.zone === 'dropped') {
          globalSlotIndex = (zoneInfo.normal?.columnCount || 0) + placedModule.slotIndex;
        }
      } else if (spaceInfo.droppedCeiling.position === 'left') {
        // 단내림이 좌측이면: 단내림(좌측) → 0..dropped-1, 메인(우측) → dropped..(total-1)
        if (placedModule.zone === 'normal') {
          globalSlotIndex = (zoneInfo.dropped?.columnCount || 0) + placedModule.slotIndex;
        }
      }

      isGlobalFirst = globalSlotIndex === 0;
      isGlobalLast = globalSlotIndex === (totalColumnCount - 1);
    }

    if (spaceInfo.installType === 'freestanding') {
      // 벽 없음: 전역 첫/마지막 슬롯만 엔드패널
      return isGlobalFirst || isGlobalLast;
    }

    if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
      // 한쪽벽: 벽이 없는 쪽에 엔드패널
      // wallConfig.left = true : 왼쪽에 벽 → 오른쪽에 엔드패널
      // wallConfig.right = true : 오른쪽에 벽 → 왼쪽에 엔드패널
      if (spaceInfo.wallConfig?.left) {
        return isGlobalLast; // 왼쪽에 벽 → 오른쪽(마지막 슬롯)에 엔드패널
      }
      if (spaceInfo.wallConfig?.right) {
        return isGlobalFirst; // 오른쪽에 벽 → 왼쪽(첫 슬롯)에 엔드패널
      }
      // 벽 정보가 없으면 엔드패널 없음
      return false;
    }

    return false;
  })();

  // 디버깅용 로그 추가
  console.log('🎯 가구 너비 결정:', {
    moduleId: placedModule.id,
    placedModuleId: placedModule.moduleId,
    slotIndex: placedModule.slotIndex,
    zone: placedModule.zone,
    isDualFurniture,
    customWidth: placedModule.customWidth,
    adjustedWidth: placedModule.adjustedWidth,
    moduleWidth: actualModuleData?.dimensions.width || 600,
    finalWidth: furnitureWidthMm,
    평균슬롯너비: indexing.columnWidth,
    실제슬롯너비배열: indexing.slotWidths,
    실제슬롯너비: indexing.slotWidths?.[placedModule.slotIndex],
    계산방법: (() => {
      if (placedModule.customWidth) {
        return `customWidth 사용 (${placedModule.customWidth}mm)`;
      } else if (indexing.slotWidths && placedModule.slotIndex !== undefined && indexing.slotWidths[placedModule.slotIndex]) {
        return `slotWidths 사용 (${indexing.slotWidths[placedModule.slotIndex]}mm)`;
      } else if (placedModule.adjustedWidth) {
        return `adjustedWidth 사용 (${placedModule.adjustedWidth}mm)`;
      } else {
        return `기본 모듈 너비 사용 (${actualModuleData?.dimensions.width || 600}mm)`;
      }
    })()
  });
  
  
  // adjustedPosition 계산 - 마지막 슬롯의 경우 원본 슬롯 중심 사용
  let adjustedPosition = placedModule.position;
  if (isLastSlot && !isFurnitureDragging) {
    // 마지막 슬롯은 originalSlotCenterX를 나중에 계산하므로 여기서는 position 사용
    adjustedPosition = { ...placedModule.position };
  }
  
  // 노서라운드 모드에서 엔드패널 위치 조정은 렌더링 시 동적으로 적용됨
  
  let adjustedDepthMm = actualModuleData?.dimensions.depth || 600;
  
  
  // 가구 높이는 기본적으로 모듈 데이터의 높이 사용
  let furnitureHeightMm = actualModuleData?.dimensions.height || 2200;
  
  // 단내림 구간 높이 디버깅
  if (placedModule.zone === 'dropped') {
    console.log('📏 단내림 구간 가구 높이 (초기):', {
      moduleId: placedModule.id,
      customHeight: placedModule.customHeight,
      moduleHeight: actualModuleData?.dimensions.height || 2200,
      internalSpaceHeight: internalSpace.height,
      finalHeight: furnitureHeightMm,
      zone: placedModule.zone
    });
  }
  
  // 깊이 계산: customDepth 우선, 기둥 충돌로 조정된 깊이, 기본 깊이 순
  const actualDepthMm = placedModule.customDepth || (adjustedDepthMm !== (actualModuleData?.dimensions.depth || 600) ? adjustedDepthMm : (actualModuleData?.dimensions.depth || 600));
  const depth = mmToThreeUnits(actualDepthMm);
  
  // 너비와 높이를 Three.js 단위로 변환
  const width = mmToThreeUnits(furnitureWidthMm);
  const height = mmToThreeUnits(furnitureHeightMm);
  
  // Column C 깊이 디버깅
  if (isColumnC && slotInfo) {
    console.log('🟪 FurnitureItem Column C 깊이 확인:', {
      moduleId: placedModule.id,
      placedModuleCustomDepth: placedModule.customDepth,
      adjustedDepthMm,
      actualModuleDepth: actualModuleData?.dimensions.depth || 600,
      finalActualDepthMm: actualDepthMm,
      slotIndex: placedModule.slotIndex,
      isSplit: placedModule.isSplit,
      spaceType: placedModule.columnSlotInfo?.spaceType
    });
  }
  

  // 도어 두께 (20mm)
  const doorThicknessMm = 20;
  const doorThickness = mmToThreeUnits(doorThicknessMm);

  // Room.tsx와 동일한 Z축 위치 계산
  const panelDepthMm = 1500; // 전체 공간 깊이
  const furnitureDepthMm = 600; // 가구 공간 깊이
  const panelDepth = mmToThreeUnits(panelDepthMm);
  const furnitureDepth = mmToThreeUnits(furnitureDepthMm);
  
  // Room.tsx와 동일한 계산: 뒷벽에서 600mm만 나오도록
  const zOffset = -panelDepth / 2; // 공간 메쉬용 깊이 중앙
  const furnitureZOffset = zOffset + (panelDepth - furnitureDepth) / 2; // 뒷벽에서 600mm
  
  // Z축 위치 계산 - 기둥 C가 있어도 위치는 변경하지 않음
  const furnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - depth/2;
  
  // 기둥 C 디버깅 - 위치는 유지, 깊이만 조정
  if (adjustedDepthMm !== (actualModuleData?.dimensions.depth || 600) && slotInfo?.hasColumn) {
    console.log('🎯 기둥 C - 깊이만 조정, 위치 유지:', {
      columnDepthMm: slotInfo.column?.depth || 0,
      originalDepthMm: actualModuleData?.dimensions.depth || 600,
      adjustedDepthMm,
      furnitureZ,
      설명: '가구 위치는 그대로, 깊이만 줄어듦'
    });
  }
  
  // 기둥 C가 있는 경우 디버깅
  if (slotInfo?.hasColumn && slotInfo.columnProcessingMethod === 'depth-adjustment' && slotInfo.column) {
    console.log('🔵 기둥 C - 가구 깊이만 조정 (위치는 고정):', {
      columnDepthMm: slotInfo.column.depth,
      originalDepthMm: actualModuleData?.dimensions.depth || 600,
      adjustedDepthMm,
      actualDepthMm,
      furnitureZ: furnitureZ,
      설명: '가구는 항상 같은 위치에서 시작하고 깊이만 줄어듭니다'
    });
  }

  // 색상 설정: 드래그 중일 때만 색상 전달, 다른 상태에서는 MaterialPanel 색상 사용
  const furnitureColor = isDraggingThis ? '#66ff66' : undefined;
  
  // 기둥 침범 상황에 따른 최적 힌지 방향 계산 (드래그 중이 아닐 때만)
  let optimalHingePosition = placedModule.hingePosition || 'right';
  
  // 노서라운드 모드에서 커버도어의 힌지 위치 조정
  if (spaceInfo.surroundType === 'no-surround' && placedModule.slotIndex !== undefined) {
    const isFirstSlot = placedModule.slotIndex === 0;
    
    // 단내림이 있는 경우 각 구간의 columnCount를 기준으로 마지막 슬롯 판단
    let isLastSlot = false;
    if (spaceInfo.droppedCeiling?.enabled && indexing.zones) {
      // 가구가 속한 구간 확인
      const furnitureZone = placedModule.zone || 'normal';
      const zoneInfo = furnitureZone === 'dropped' && indexing.zones.dropped 
        ? indexing.zones.dropped 
        : indexing.zones.normal;
      
      // 해당 구간의 columnCount를 기준으로 마지막 슬롯 판단
      isLastSlot = isDualFurniture 
        ? placedModule.slotIndex + 2 >= zoneInfo.columnCount
        : placedModule.slotIndex === zoneInfo.columnCount - 1;
        
      console.log('🎯 단내림 마지막 슬롯 판단:', {
        zone: furnitureZone,
        slotIndex: placedModule.slotIndex,
        zoneColumnCount: zoneInfo.columnCount,
        isLastSlot,
        isDualFurniture
      });
    } else {
      // 단내림이 없는 경우 기존 로직
      isLastSlot = isDualFurniture 
        ? placedModule.slotIndex + 2 >= indexing.columnCount
        : placedModule.slotIndex === indexing.columnCount - 1;
    }
    
    if (spaceInfo.installType === 'freestanding') {
      if (isFirstSlot) {
        // 첫번째 슬롯: 힌지가 오른쪽에 있어야 왼쪽 엔드패널을 덮음
        optimalHingePosition = 'right';
        console.log('🚪 노서라운드 첫번째 슬롯 힌지: right (왼쪽 엔드패널 커버)');
      } else if (isLastSlot) {
        // 마지막 슬롯: 힌지가 왼쪽에 있어야 오른쪽 엔드패널을 덮음
        optimalHingePosition = 'left';
        console.log('🚪 노서라운드 마지막 슬롯 힌지: left (오른쪽 엔드패널 커버)');
      }
    } else if (spaceInfo.installType === 'semistanding' || spaceInfo.installType === 'semi-standing') {
      if (isFirstSlot && !spaceInfo.wallConfig?.left) {
        optimalHingePosition = 'right';
      } else if (isLastSlot && !spaceInfo.wallConfig?.right) {
        optimalHingePosition = 'left';
      }
    }
  } else if (!isFurnitureDragging && slotInfo && slotInfo.hasColumn) {
    // 기둥 침범 상황에 따른 힌지 조정
    optimalHingePosition = calculateOptimalHingePosition(slotInfo);
    console.log('🚪 기둥 침범에 따른 힌지 방향 조정:', {
      slotIndex: slotInfo.slotIndex,
      intrusionDirection: slotInfo.intrusionDirection,
      furniturePosition: slotInfo.furniturePosition,
      originalHinge: placedModule.hingePosition || 'right',
      optimalHinge: optimalHingePosition
         });
   }

  // Column C 기둥 앞 가구인지 확인
  const isColumnCFront = isColumnC && placedModule.columnSlotInfo?.spaceType === 'front';
  
  // Column C 크기 조절 훅 사용 (기둥 앞 가구일 때만)
  const columnCResize = useColumnCResize(
    placedModule,
    isColumnCFront,
    slotInfo?.column?.depth || 300,
    indexing.columnWidth // 동적으로 실제 슬롯 너비 사용
  );

  // Column C 전용 이벤트 핸들러 래핑
  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (isColumnCFront && !isDragMode) {
      // Column C 기둥 앞 가구는 리사이즈 모드
      columnCResize.handlePointerDown(e);
    } else {
      // 일반 가구는 드래그 모드
      onPointerDown(e, placedModule.id);
    }
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (columnCResize.isResizing) {
      columnCResize.handlePointerMove(e);
    } else {
      onPointerMove(e);
    }
  };

  const handlePointerUp = () => {
    if (columnCResize.isResizing) {
      columnCResize.handlePointerUp();
    } else {
      onPointerUp();
    }
  };

  // 위치 변경 로깅 (adjustedPosition 계산 후)
  useEffect(() => {
    console.log('📍 FurnitureItem 위치 변경:', {
      id: placedModule.id,
      placedModulePosition: placedModule.position,
      adjustedPosition: adjustedPosition,
      positionDifference: {
        x: adjustedPosition.x - placedModule.position.x,
        y: adjustedPosition.y - placedModule.position.y,
        z: adjustedPosition.z - placedModule.position.z
      }
    });
  }, [placedModule.position.x, placedModule.position.y, placedModule.position.z, adjustedPosition.x, adjustedPosition.y, adjustedPosition.z, placedModule.id]);

  // 가구의 Y 위치를 계산 (변경될 때마다 업데이트)
  const furnitureYPosition = React.useMemo(() => {
    // 상부장은 내경 공간 상단에 붙여서 배치 (드래그 중에도 적용)
    if (moduleData?.category === 'upper' || actualModuleData?.category === 'upper') {
      // 내경 공간 계산
      const internalSpace = calculateInternalSpace(spaceInfo);
      const internalHeightMm = internalSpace.height;
      const furnitureHeightMm = actualModuleData?.dimensions.height || 2200;
      
      // 상부장은 항상 천장에 붙어있어야 함
      // furnitureStartY를 그대로 사용 (PlacedFurnitureContainer에서 올바르게 계산됨)
      const yPos = furnitureStartY + mmToThreeUnits(internalHeightMm - furnitureHeightMm / 2);
      
      if (isDraggingThis) {
        console.log('🔝 상부장 드래그 중 Y 위치:', {
          moduleId: actualModuleData?.id || 'unknown',
          category: moduleData?.category || actualModuleData?.category || 'unknown',
          furnitureStartY,
          internalHeightMm,
          furnitureHeightMm,
          totalY: yPos,
          isDragging: isDraggingThis,
          baseConfig: spaceInfo?.baseConfig
        });
      }
      
      return yPos;
    }
    
    // 일반 가구 (하부장 포함)
    const yPos = furnitureStartY + height / 2;
    if (actualModuleData?.id.includes('dual-4drawer-pantshanger') || actualModuleData?.id.includes('dual-2drawer-styler')) {
      console.log('🚀 가구 Y 위치 계산:', {
        moduleId: actualModuleData?.id || 'unknown',
        furnitureStartY,
        height,
        totalY: yPos,
        baseConfig: spaceInfo?.baseConfig
      });
    }
    return yPos;
  }, [furnitureStartY, height, actualModuleData?.id, actualModuleData?.category, moduleData?.category, spaceInfo, spaceInfo?.baseConfig?.placementType, spaceInfo?.baseConfig?.floatHeight, isDraggingThis]);

  // 엔드패널이 있을 때 키큰장 위치 조정 - 도어는 위치 변경 없음
  const furnitureXAdjustment = 0; // 도어 위치는 변경하지 않음

  // slotCenterX 계산 (도어 위치용) - 이 변수를 미리 계산하여 BoxModule과 별도 도어 렌더링에서 모두 사용
  const slotCenterX = (() => {
    // 도어 위치 계산 함수: 논리적으로 도어가 커버해야 할 영역의 중심을 계산
    const calculateDoorCenterOffset = () => {
      if (!isNoSurroundEndSlot) {
        // 일반 슬롯: 도어는 가구 중심에 위치
        return 0;
      }
      
      // 노서라운드 엔드패널 슬롯의 경우
      // 도어가 커버해야 할 영역 = 가구 공간 + 엔드패널 공간
      // 도어 너비는 이미 originalSlotWidthMm로 설정됨 (엔드패널 포함)
      
      // 슬롯의 실제 경계 계산
      const doorWidth = originalSlotWidthMm; // 도어 너비 (엔드패널 포함)
      const furnitureWidth = furnitureWidthMm; // 가구 너비 (엔드패널 18mm 제외)
      
      // 도어가 커버해야 할 영역의 시작점과 끝점 계산
      let doorCoverStartX: number;
      let doorCoverEndX: number;
      let doorCoverCenterX: number;
      
      // 엔드패널이 포함된 슬롯의 중앙에 도어 배치
      // 슬롯 너비(600mm)와 가구 너비(582mm)의 차이를 계산
      const slotWidth = originalSlotWidthMm; // 600mm (엔드패널 포함)
      const furnitureActualWidth = furnitureWidthMm; // 582mm (가구 실제 너비)
      const widthDifference = slotWidth - furnitureActualWidth; // 18mm
      
      if (placedModule.slotIndex === 0 && 
          (spaceInfo.installType === 'freestanding' || 
           (spaceInfo.installType === 'semistanding' && spaceInfo.wallConfig?.right))) {
        // 첫 번째 슬롯: 엔드패널이 왼쪽에 있음 (벽없음 또는 오른쪽벽 모드)
        // 도어는 슬롯 중앙 = 가구 중심에서 왼쪽으로 (18mm/2 = 9mm) 이동
        doorCoverCenterX = -mmToThreeUnits(widthDifference / 2);
      } else if (isLastSlot && 
                (spaceInfo.installType === 'freestanding' || 
                 (spaceInfo.installType === 'semistanding' && spaceInfo.wallConfig?.left))) {
        // 마지막 슬롯: 엔드패널이 오른쪽에 있음 (벽없음 또는 왼쪽벽 모드)
        // 도어는 슬롯 중앙 = 가구 중심에서 오른쪽으로 (18mm/2 = 9mm) 이동
        doorCoverCenterX = mmToThreeUnits(widthDifference / 2);
      } else {
        // 중간 슬롯 또는 예외 케이스 - 도어 오프셋 없음
        doorCoverCenterX = 0;
      }
      
      // 도어 오프셋은 이미 상대 위치로 계산됨
      const doorOffsetX = doorCoverCenterX;
      
      console.log('🚪 노서라운드 엔드패널 도어 위치 계산:', {
        슬롯인덱스: placedModule.slotIndex,
        가구위치: adjustedPosition.x,
        가구너비: furnitureWidth,
        도어너비: doorWidth,
        도어오프셋: doorOffsetX,
        설명: '도어가 가구 중심에서 상대적으로 이동하여 엔드패널 커버'
      });
      
      return doorOffsetX;
    };
    
    return calculateDoorCenterOffset();
  })();

  // Early return after all hooks have been called
  if (moduleNotFound || !moduleData) {
    return null;
  }

  return (
    <group>
      {/* 가구 본체 (기둥에 의해 밀려날 수 있음) */}
      <group
          position={[
            adjustedPosition.x + positionAdjustmentForEndPanel,
            furnitureYPosition, // memoized Y position
            furnitureZ // 공간 앞면에서 뒤쪽으로 배치
          ]}
          rotation={[0, (placedModule.rotation * Math.PI) / 180, 0]}
          onClick={(e) => {
            // onClick 이벤트 제거 - 드래그 후 팝업이 뜨는 문제 해결
            // onDoubleClick은 실제로 가구 선택 핸들러이지만 드래그 감지가 제대로 안 되어 제거
            e.stopPropagation();
          }}
          onDoubleClick={(e) => {
            console.log('🎯 FurnitureItem onDoubleClick 이벤트 발생:', placedModule.id);
            onDoubleClick(e, placedModule.id);
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerOver={() => {
            if (isColumnCFront && !isDragMode) {
              document.body.style.cursor = columnCResize.isResizing ? 'crosshair' : 'move';
            } else {
              document.body.style.cursor = isDragMode ? 'grab' : (isDraggingThis ? 'grabbing' : 'grab');
            }
            setIsHovered(true);
          }}
          onPointerOut={() => {
            if (!columnCResize.isResizing) {
              document.body.style.cursor = 'default';
            }
            setIsHovered(false);
          }}
        >
          {/* 노서라운드 모드에서 가구 위치 디버깅 */}
          {spaceInfo.surroundType === 'no-surround' && spaceInfo.gapConfig && (() => {
            console.log(`🪑 [가구위치] 이격거리${spaceInfo.gapConfig.left}mm: X=${placedModule.position.x.toFixed(3)}, 폭=${moduleData?.dimensions.width}mm`);
            return null;
          })()}

          {/* 가구 타입에 따라 다른 컴포넌트 렌더링 */}
          {moduleData?.type === 'box' ? (
            // 박스형 가구 렌더링 (도어 제외)
            <>
              {/* 키큰장과 듀얼장이 상부장/하부장과 인접한 경우 가구 본체를 이동 */}
              {/* 상하부장 자체는 이동하지 않음 */}
              <group position={[
                needsEndPanelAdjustment && endPanelSide && actualModuleData?.category !== 'upper' && actualModuleData?.category !== 'lower'
                  ? (endPanelSide === 'both'
                      ? 0  // 양쪽에 엔드패널이 있으면 중앙에 위치
                      : endPanelSide === 'left' 
                        ? mmToThreeUnits(END_PANEL_THICKNESS/2)   // 왼쪽에 상/하부장 -> 가구를 오른쪽으로 9mm 이동
                        : -mmToThreeUnits(END_PANEL_THICKNESS/2)) // 오른쪽에 상/하부장 -> 가구를 왼쪽으로 9mm 이동
                  : 0,  // 조정이 필요 없는 경우
                0, 
                0
              ]}>
                <BoxModule 
                moduleData={actualModuleData}
                isDragging={isDraggingThis} // 실제로 이 가구를 드래그하는 경우만 true
                color={furnitureColor}
                internalHeight={furnitureHeightMm}
                viewMode={viewMode}
                renderMode={renderMode}
                showFurniture={showFurniture}
                isHighlighted={isHighlighted} // 강조 상태 전달
                hasDoor={(isFurnitureDragging || isDraggingThis)
                  ? false // 드래그 중에는 도어 렌더링 안 함
                  : needsEndPanelAdjustment
                  ? false // 엔드패널이 있는 경우 도어는 별도 렌더링
                  : (slotInfo && slotInfo.hasColumn && (slotInfo.columnType === 'deep' || (placedModule.adjustedWidth !== undefined && placedModule.adjustedWidth !== null))) 
                  ? false // 기둥 A(deep) 또는 adjustedWidth가 있는 경우 도어는 별도 렌더링
                  : (placedModule.hasDoor ?? false)}
                hasBackPanel={placedModule.hasBackPanel} // 백패널 유무 전달
                customDepth={actualDepthMm}
                hingePosition={optimalHingePosition}
                spaceInfo={(() => {
                  console.log('🚨 FurnitureItem -> BoxModule spaceInfo 전달:', {
                    moduleId: actualModuleData?.id || 'unknown',
                    hasSpaceInfo: !!zoneSpaceInfo,
                    baseConfig: zoneSpaceInfo?.baseConfig,
                    placementType: zoneSpaceInfo?.baseConfig?.placementType,
                    floatHeight: zoneSpaceInfo?.baseConfig?.floatHeight
                  });
                  return zoneSpaceInfo;
                })()}
                doorWidth={furnitureWidthMm} // 도어 너비는 가구 너비와 동일
                doorXOffset={0} // 도어 위치는 변경하지 않음
                onDoubleClick={(e: any) => onDoubleClick(e, placedModule.id)} // 더블클릭 이벤트 전달
                originalSlotWidth={originalSlotWidthMm}
                slotCenterX={slotCenterX} // 미리 계산된 값 사용
                adjustedWidth={furnitureWidthMm} // 조정된 너비를 adjustedWidth로 전달
                slotIndex={placedModule.slotIndex} // 슬롯 인덱스 전달
                slotInfo={slotInfo} // 슬롯 정보 전달 (기둥 침범 여부 포함)
                adjacentCabinets={{ hasAdjacentUpperLower: needsEndPanelAdjustment, adjacentSide: endPanelSide }} // 인접 상하부장 정보 전달
                slotWidths={(() => {
                  // 듀얼 가구인 경우 개별 슬롯 너비 전달
                  if (isDualFurniture) {
                    let widths;
                    if (placedModule.zone && spaceInfo.droppedCeiling?.enabled) {
                      const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
                      const targetZone = placedModule.zone === 'dropped' && zoneInfo.dropped ? zoneInfo.dropped : zoneInfo.normal;
                      if (targetZone.slotWidths && placedModule.slotIndex < targetZone.slotWidths.length - 1) {
                        widths = [targetZone.slotWidths[placedModule.slotIndex], targetZone.slotWidths[placedModule.slotIndex + 1]];
                      }
                    } else if (indexing.slotWidths && placedModule.slotIndex < indexing.slotWidths.length - 1) {
                      widths = [indexing.slotWidths[placedModule.slotIndex], indexing.slotWidths[placedModule.slotIndex + 1]];
                    }
                    
                    // 상하부장과 인접한 경우 슬롯 너비 조정
                    if (widths && needsEndPanelAdjustment) {
                      if (endPanelSide === 'both') {
                        // 양쪽에 상하부장이 있는 경우: 각 슬롯에서 18mm씩 빼기
                        return [widths[0] - END_PANEL_THICKNESS, widths[1] - END_PANEL_THICKNESS];
                      } else {
                        // 한쪽에만 상하부장이 있는 경우: 각 슬롯에서 9mm씩 빼기  
                        return [widths[0] - END_PANEL_THICKNESS/2, widths[1] - END_PANEL_THICKNESS/2];
                      }
                    }
                    
                    return widths;
                  }
                  return undefined;
                })()}
              />
              </group>
              {/* 가구 너비 디버깅 */}
              {(() => {
                const slotWidthMm = (() => {
                  if (placedModule.zone && spaceInfo.droppedCeiling?.enabled && indexing.zones) {
                    const targetZone = placedModule.zone === 'dropped' && indexing.zones.dropped ? indexing.zones.dropped : indexing.zones.normal;
                    return targetZone.slotWidths?.[placedModule.slotIndex] || targetZone.columnWidth;
                  }
                  return indexing.slotWidths?.[placedModule.slotIndex] || indexing.columnWidth;
                })();
                
                const expectedThreeUnits = mmToThreeUnits(slotWidthMm);
                const actualThreeUnits = mmToThreeUnits(furnitureWidthMm);
                
                console.log('🎨 BoxModule 너비 비교:', {
                  moduleId: placedModule.id,
                  slotIndex: placedModule.slotIndex,
                  zone: placedModule.zone,
                  '슬롯너비_mm': slotWidthMm,
                  '가구너비_mm': furnitureWidthMm,
                  '차이_mm': slotWidthMm - furnitureWidthMm,
                  '슬롯너비_three': expectedThreeUnits.toFixed(4),
                  '가구너비_three': actualThreeUnits.toFixed(4),
                  '차이_three': (expectedThreeUnits - actualThreeUnits).toFixed(4),
                  customWidth: placedModule.customWidth,
                  adjustedWidth: placedModule.adjustedWidth,
                  계산방법: (() => {
                    if (indexing.slotWidths && placedModule.slotIndex !== undefined && indexing.slotWidths[placedModule.slotIndex]) {
                      return 'slotWidths 배열 사용';
                    } else if (placedModule.customWidth) {
                      return 'customWidth 사용';
                    } else if (placedModule.adjustedWidth) {
                      return 'adjustedWidth 사용';
                    } else {
                      return '기본 모듈 너비 사용';
                    }
                  })()
                });
                return null;
              })()}
              
              {/* 상부장/하부장과 인접한 키큰장의 엔드패널 렌더링 (상하부장 자체가 아닌 경우만) */}
              {needsEndPanelAdjustment && endPanelSide && actualModuleData?.category !== 'upper' && actualModuleData?.category !== 'lower' && (() => {
                const reducedFurnitureWidth = mmToThreeUnits(furnitureWidthMm);
                const panels = [];
                
                // 키큰장의 이동량 계산
                const furnitureOffset = endPanelSide === 'both'
                  ? 0  // 양쪽에 엔드패널이 있으면 중앙에 위치
                  : endPanelSide === 'left' 
                    ? mmToThreeUnits(END_PANEL_THICKNESS/2)   // 왼쪽에 상/하부장 -> 가구를 오른쪽으로 9mm 이동
                    : -mmToThreeUnits(END_PANEL_THICKNESS/2); // 오른쪽에 상/하부장 -> 가구를 왼쪽으로 9mm 이동
                
                // 양쪽 또는 왼쪽에 엔드패널이 필요한 경우
                if (endPanelSide === 'both' || endPanelSide === 'left') {
                  // 왼쪽 엔드패널은 이동된 가구의 왼쪽 가장자리에 붙음
                  const leftPanelX = furnitureOffset - reducedFurnitureWidth/2 - mmToThreeUnits(END_PANEL_THICKNESS)/2;
                  panels.push(
                    <EndPanelWithTexture
                      key="left-panel"
                      width={mmToThreeUnits(END_PANEL_THICKNESS)}
                      height={height}
                      depth={depth}
                      position={[leftPanelX, 0, 0]}
                      spaceInfo={spaceInfo}
                      renderMode={renderMode}
                    />
                  );
                  console.log('🔧 왼쪽 엔드패널 렌더링:', {
                    moduleId: placedModule.id,
                    leftPanelX,
                    furnitureOffset,
                    reducedFurnitureWidth: furnitureWidthMm
                  });
                }
                
                // 양쪽 또는 오른쪽에 엔드패널이 필요한 경우
                if (endPanelSide === 'both' || endPanelSide === 'right') {
                  // 오른쪽 엔드패널은 이동된 가구의 오른쪽 가장자리에 붙음
                  const rightPanelX = furnitureOffset + reducedFurnitureWidth/2 + mmToThreeUnits(END_PANEL_THICKNESS)/2;
                  panels.push(
                    <EndPanelWithTexture
                      key="right-panel"
                      width={mmToThreeUnits(END_PANEL_THICKNESS)}
                      height={height}
                      depth={depth}
                      position={[rightPanelX, 0, 0]}
                      spaceInfo={spaceInfo}
                      renderMode={renderMode}
                    />
                  );
                  console.log('🔧 오른쪽 엔드패널 렌더링:', {
                    moduleId: placedModule.id,
                    rightPanelX,
                    furnitureOffset,
                    reducedFurnitureWidth: furnitureWidthMm
                  });
                }
                
                console.log('🔧 엔드패널 렌더링 완료:', {
                  moduleId: placedModule.id,
                  side: endPanelSide,
                  panelCount: panels.length,
                  furnitureOffset,
                  isDualFurniture,
                  reducedFurnitureWidth: furnitureWidthMm,
                  endPanelThickness: END_PANEL_THICKNESS
                });
                
                return panels;
              })()}
              
              {/* 엔드패널이 있는 경우 도어를 별도로 렌더링 (원래 위치에) */}
              {needsEndPanelAdjustment && (placedModule.hasDoor ?? false) && !isFurnitureDragging && !isDraggingThis && (() => {
                console.log('🚪 엔드패널 도어 별도 렌더링:', {
                  moduleId: placedModule.id,
                  needsEndPanelAdjustment,
                  hasDoor: placedModule.hasDoor
                });
                
                const doorWidth = endPanelSide === 'both' 
                  ? furnitureWidthMm + (END_PANEL_THICKNESS * 2)  // 양쪽 엔드패널 포함
                  : furnitureWidthMm + END_PANEL_THICKNESS;  // 한쪽 엔드패널 포함
                
                return (
                  <DoorModule
                    moduleWidth={doorWidth} // 엔드패널 개수에 따라 도어 너비 조정
                    moduleDepth={actualDepthMm}
                    hingePosition={optimalHingePosition}
                    spaceInfo={zoneSpaceInfo}
                    color={undefined} // MaterialPanel 색상 사용
                    doorXOffset={0} // 도어 위치는 변경하지 않음
                    originalSlotWidth={originalSlotWidthMm}
                    slotCenterX={slotCenterX}
                    moduleData={actualModuleData}
                    isDragging={isDraggingThis}
                    isEditMode={isEditMode}
                    slotIndex={placedModule.slotIndex}
                  />
                );
              })()}
            </>
          ) : (
            // 기본 가구 (단순 Box) 렌더링
            <>
              <Box 
                args={[width, height, depth]}
              >
                <meshPhysicalMaterial 
                  color={furnitureColor}
                  clearcoat={0.1}
                  clearcoatRoughness={0.8}
                  metalness={0.0}
                  roughness={0.7}
                  reflectivity={0.2}
                  transparent={isDraggingThis || isEditMode}
                  opacity={isDraggingThis || isEditMode ? 0.8 : 1.0}
                />
              </Box>
              <Edges 
                color={columnCResize.isResizing ? '#ff6600' : getEdgeColor({
                  isDragging: isDraggingThis,
                  isEditMode,
                  isDragMode,
                  viewMode,
                  view2DTheme,
                  renderMode
                })} 
                threshold={1} 
                scale={1.001}
                linewidth={columnCResize.isResizing ? 3 : 1}
              />
              
              {/* 편집 모드일 때 안내 텍스트 */}
              {isEditMode && (
                <primitive 
                  object={(() => {
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d')!;
                    canvas.width = 256;
                    canvas.height = 128;
                    context.fillStyle = 'rgba(255, 140, 0, 0.9)';
                    context.fillRect(0, 0, 256, 128);
                    context.fillStyle = '#ffffff';
                    context.font = '16px Arial';
                    context.textAlign = 'center';
                    context.fillText('편집 모드', 128, 25);
                    context.font = '12px Arial';
                    context.fillText('더블클릭으로 진입', 128, 40);
                    context.fillText('드래그: 이동', 128, 55);
                    context.fillText('←→: 이동', 128, 70);
                    context.fillText('Del: 삭제', 128, 85);
                    context.fillText('Esc: 해제', 128, 100);
                    
                    const texture = new THREE.CanvasTexture(canvas);
                    const material = new THREE.MeshBasicMaterial({ 
                      map: texture, 
                      transparent: true,
                      depthTest: false
                    });
                    const geometry = new THREE.PlaneGeometry(3, 1.5);
                    const mesh = new THREE.Mesh(geometry, material);
                    mesh.position.set(0, height + 2, 0);
                    mesh.renderOrder = 1002;
                    return mesh;
                  })()}
                />
              )}
            </>
          )}
          
          {/* Column C 기둥 앞 가구 리사이즈 안내 표시 */}
          {isColumnCFront && isHovered && !isDragMode && !columnCResize.isResizing && (
            <Html
              position={[0, height/2 + 0.5, depth/2 + 0.1]}
              center
              style={{
                userSelect: 'none',
                pointerEvents: 'none',
                zIndex: 1000
              }}
            >
              <div
                style={{
                  background: 'rgba(255, 102, 0, 0.9)',
                  color: 'white',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }}
              >
                ↔️ 드래그하여 크기 조절
              </div>
            </Html>
          )}
          
          {/* Column C 리사이즈 방향 표시 */}
          {columnCResize.isResizing && columnCResize.resizeDirection && (
            <Html
              position={[0, 0, depth/2 + 0.1]}
              center
              style={{
                userSelect: 'none',
                pointerEvents: 'none',
                zIndex: 1000
              }}
            >
              <div
                style={{
                  background: 'rgba(255, 102, 0, 0.9)',
                  color: 'white',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }}
              >
                {columnCResize.resizeDirection === 'horizontal' ? '↔️ 너비 조절' : '↕️ 깊이 조절'}
              </div>
            </Html>
          )}
          
        </group>

      {/* 기둥 침범 시 도어를 별도로 렌더링 (원래 슬롯 위치에 고정) */}
      {/* 기둥 A (deep 타입) 또는 기둥이 있고 adjustedWidth가 설정된 경우 커버도어 렌더링 */}
      {/* 드래그 중에는 커버도어를 렌더링하지 않음 (위치 문제 방지) */}
      {/* 2D 모드에서 가구가 숨겨져도 도어는 표시 */}
      {!isFurnitureDragging && 
       !isDraggingThis &&
       (placedModule.hasDoor ?? true) && 
       ((slotInfo && slotInfo.hasColumn && slotInfo.columnType === 'deep') || 
        (slotInfo && slotInfo.hasColumn && placedModule.adjustedWidth !== undefined && placedModule.adjustedWidth !== null)) && 
       spaceInfo && (() => {
        console.log('🚪🚨 커버도어 렌더링 조건 체크 INSIDE:', {
          hasDoor: placedModule.hasDoor,
          showFurniture,
          viewMode,
          isFurnitureDragging,
          isDraggingThis,
          isEditMode,
          hasColumn: slotInfo?.hasColumn,
          columnType: slotInfo?.columnType,
          isDeepColumn: slotInfo?.columnType === 'deep',
          hasAdjustedWidth: placedModule.adjustedWidth !== undefined && placedModule.adjustedWidth !== null,
          adjustedWidth: placedModule.adjustedWidth,
          originalSlotWidthMm,
          furnitureWidthMm,
          원래슬롯중심: placedModule.position.x,
          가구조정위치: adjustedPosition?.x,
          차이: originalSlotWidthMm - furnitureWidthMm,
          BoxModule도어: slotInfo && slotInfo.hasColumn ? false : (placedModule.hasDoor ?? false),
          is2DHiddenFurniture: !showFurniture && viewMode === '2D',
          커버도어렌더링: true
        });
        return true;
      })() && (
        <group
          position={[
            // 현재 슬롯의 중심 위치 사용 (원래 슬롯 크기 기준)
            // 듀얼 가구는 두 슬롯의 중간 위치
            (() => {
              if (indexing.threeUnitPositions && placedModule.slotIndex !== undefined) {
                if (isDualFurniture && placedModule.slotIndex < indexing.threeUnitPositions.length - 1) {
                  // 듀얼 가구: 두 슬롯의 중간
                  const slot1 = indexing.threeUnitPositions[placedModule.slotIndex];
                  const slot2 = indexing.threeUnitPositions[placedModule.slotIndex + 1];
                  return (slot1 + slot2) / 2;
                } else {
                  // 싱글 가구: 해당 슬롯의 중심
                  return indexing.threeUnitPositions[placedModule.slotIndex];
                }
              }
              return placedModule.position.x; // 폴백
            })(),
            furnitureYPosition, // 가구와 동일한 Y 위치 (상부장 위치 반영)
            furnitureZ + 0.02 // 가구보다 약간 앞쪽 (20mm)
          ]}
          rotation={[0, (placedModule.rotation * Math.PI) / 180, 0]}
        >
          {console.log('🚪🚪 커버도어 렌더링 중:', {
            원래슬롯중심: placedModule.position.x,
            가구위치: adjustedPosition.x,
            도어X위치: (() => {
              if (isNoSurroundEndSlot) {
                const widthDifference = originalSlotWidthMm - furnitureWidthMm;
                const halfDifference = widthDifference / 2;
                const hasLeftEndPanel = placedModule.slotIndex === 0 && 
                  (spaceInfo.installType === 'freestanding' || 
                   (spaceInfo.installType === 'semistanding' && spaceInfo.wallConfig?.right));
                
                // 단내림이 있는 경우 각 구간의 columnCount를 기준으로 마지막 슬롯 판단
                let isLastSlot = false;
                if (spaceInfo.droppedCeiling?.enabled && indexing.zones) {
                  const furnitureZone = placedModule.zone || 'normal';
                  const zoneInfo = furnitureZone === 'dropped' && indexing.zones.dropped 
                    ? indexing.zones.dropped 
                    : indexing.zones.normal;
                  
                  isLastSlot = isDualFurniture 
                    ? placedModule.slotIndex + 2 >= zoneInfo.columnCount
                    : placedModule.slotIndex === zoneInfo.columnCount - 1;
                } else {
                  // 단내림이 없는 경우 기존 로직
                  isLastSlot = isDualFurniture 
                    ? placedModule.slotIndex + 2 >= indexing.columnCount
                    : placedModule.slotIndex === indexing.columnCount - 1;
                }
                
                const hasRightEndPanel = isLastSlot && 
                  (spaceInfo.installType === 'freestanding' || 
                   (spaceInfo.installType === 'semistanding' && spaceInfo.wallConfig?.left));
                
                if (hasLeftEndPanel) {
                  return placedModule.position.x - mmToThreeUnits(halfDifference);
                } else if (hasRightEndPanel) {
                  return placedModule.position.x + mmToThreeUnits(halfDifference);
                }
              }
              return placedModule.position.x;
            })(),
            너비: originalSlotWidthMm,
            가구너비: furnitureWidthMm,
            차이: originalSlotWidthMm - furnitureWidthMm,
            노서라운드엔드슬롯: isNoSurroundEndSlot,
            슬롯인덱스: placedModule.slotIndex
          })}
          <DoorModule
            moduleWidth={originalSlotWidthMm} // 원래 슬롯 크기 사용 (커버도어)
            moduleDepth={actualDepthMm}
            hingePosition={optimalHingePosition}
            spaceInfo={zoneSpaceInfo}
            color={furnitureColor}
            doorXOffset={0} // 사용하지 않음
            originalSlotWidth={originalSlotWidthMm}
            slotCenterX={0} // 도어는 가구와 같은 위치 (움직이지 않음)
            moduleData={actualModuleData} // 실제 모듈 데이터
            slotIndex={placedModule.slotIndex} // 슬롯 인덱스 전달
            isDragging={isDraggingThis}
            isEditMode={isEditMode}
            slotWidths={(() => {
              // 듀얼 가구인 경우 개별 슬롯 너비 전달
              if (isDualFurniture) {
                if (placedModule.zone && spaceInfo.droppedCeiling?.enabled) {
                  const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
                  const targetZone = placedModule.zone === 'dropped' && zoneInfo.dropped ? zoneInfo.dropped : zoneInfo.normal;
                  if (targetZone.slotWidths && placedModule.slotIndex < targetZone.slotWidths.length - 1) {
                    return [targetZone.slotWidths[placedModule.slotIndex], targetZone.slotWidths[placedModule.slotIndex + 1]];
                  }
                } else if (indexing.slotWidths && placedModule.slotIndex < indexing.slotWidths.length - 1) {
                  return [indexing.slotWidths[placedModule.slotIndex], indexing.slotWidths[placedModule.slotIndex + 1]];
                }
              }
              return undefined;
            })()}
          />
        </group>
      )}

      {/* 도어는 BoxModule 내부에서 렌더링하도록 변경 */}
      {/* 3D 모드에서 편집 아이콘 표시 - showDimensions가 true이고 3D 모드일 때만 표시 */}
      {showDimensions && viewMode === '3D' && (
        <Html
          position={[
            adjustedPosition.x + positionAdjustmentForEndPanel,
            (() => {
              // 상부장인 경우 하단에 표시
              if (actualModuleData?.category === 'upper') {
                const upperHeight = actualModuleData?.dimensions.height || 800;
                // 상부장의 하단 Y 위치 (더 아래로 조정)
                return furnitureStartY + mmToThreeUnits(internalSpace.height - upperHeight) - 2.5;
              }
              // 그 외의 경우 기존 위치 (하부 프레임 아래)
              return furnitureStartY - 1.8;
            })(),
            furnitureZ + depth / 2 + 0.5 // 가구 앞쪽
          ]}
          center
          style={{
            userSelect: 'none',
            pointerEvents: 'auto',
            zIndex: 100,
            background: 'transparent'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                border: `2px solid ${getThemeColor()}`,
                borderRadius: '50%',
                backgroundColor: '#ffffff',
                transition: 'all 0.2s ease',
                opacity: isHovered ? 1 : 0.8,
                transform: isHovered ? 'scale(1.1)' : 'scale(1)',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
              }}
              onClick={(e) => {
                e.stopPropagation();
                // 이미 편집 모드라면 팝업 닫기
                if (isEditMode) {
                  const closeAllPopups = useUIStore.getState().closeAllPopups;
                  closeAllPopups();
                } else {
                  // 편집 모드가 아니면 팝업 열기
                  onDoubleClick(e as any, placedModule.id);
                }
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              title="가구 속성 편집"
            >
              <EditIcon color={getThemeColor()} size={18} />
            </div>
          </div>
        </Html>
      )}
    </group>
  );
};

export default FurnitureItem; 