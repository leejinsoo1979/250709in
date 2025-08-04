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

interface FurnitureItemProps {
  placedModule: PlacedModule;
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
}

const FurnitureItem: React.FC<FurnitureItemProps> = ({
  placedModule,
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
  onDoubleClick
}) => {
  // Three.js 컨텍스트 접근
  const { gl, invalidate, scene, camera } = useThree();
  const { isFurnitureDragging, showDimensions, view2DTheme } = useUIStore();
  const [isHovered, setIsHovered] = React.useState(false);
  
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
    const droppedCeilingWidth = spaceInfo.droppedCeiling?.width || 900;
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
  
  // customWidth가 있으면 해당 너비로 모듈 ID 생성
  let targetModuleId = placedModule.moduleId;
  if (placedModule.customWidth && !placedModule.moduleId.endsWith(`-${placedModule.customWidth}`)) {
    // moduleId에 이미 너비가 포함되어 있지 않은 경우에만 추가
    const baseType = placedModule.moduleId.replace(/-\d+$/, '');
    targetModuleId = `${baseType}-${placedModule.customWidth}`;
    console.log('🔧 [FurnitureItem] ModuleID 수정:', {
      original: placedModule.moduleId,
      customWidth: placedModule.customWidth,
      newTargetModuleId: targetModuleId
    });
  }
  
  let moduleData = getModuleById(targetModuleId, internalSpace, zoneSpaceInfo);
  
  if (!moduleData) {
    console.error('❌ [FurnitureItem] 모듈을 찾을 수 없음:', placedModule.moduleId);
    return null; // 모듈 데이터가 없으면 렌더링하지 않음
  }
  
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

  // 가구 위치 변경 시 렌더링 업데이트 및 그림자 업데이트
  useEffect(() => {
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
  
  // mm를 Three.js 단위로 변환
  const mmToThreeUnits = (mm: number) => mm * 0.01;
  
  // 기둥 포함 슬롯 분석 (기둥 변경사항 실시간 반영)
  const columnSlots = React.useMemo(() => {
    return analyzeColumnSlots(spaceInfo);
  }, [spaceInfo, spaceInfo.columns, placedModule.id, placedModule.slotIndex]);
  
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
  
  const slotInfo = placedModule.slotIndex !== undefined ? columnSlots[placedModule.slotIndex] : undefined;
  const isColumnC = (slotInfo?.columnType === 'medium' && slotInfo?.allowMultipleFurniture) || false;
  
  // 듀얼 → 싱글 변환 확인 (드래그 중이 아닐 때만, 기둥 C가 아닐 때만)
  let actualModuleData = moduleData;
  if (!isFurnitureDragging && slotInfo && slotInfo.hasColumn && !isColumnC) {
    const conversionResult = convertDualToSingleIfNeeded(moduleData, slotInfo, spaceInfo);
    if (conversionResult.shouldConvert && conversionResult.convertedModuleData) {
      actualModuleData = conversionResult.convertedModuleData;
    }
  }
  
  // Column C에서 싱글 가구로 변환 (듀얼 가구가 Column C에 배치된 경우)
  if (!isFurnitureDragging && isColumnC && moduleData.id.includes('dual-')) {
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
    : actualModuleData.id.includes('dual-');
  
  // 기둥 침범 상황 확인 및 가구/도어 크기 조정
  // customWidth는 슬롯 기반 너비 조정 시 사용, adjustedWidth는 기둥 침범 시 사용
  // 듀얼 가구는 customWidth가 올바른지 확인 필요
  let furnitureWidthMm = actualModuleData.dimensions.width; // 기본값
  
  // customWidth가 명시적으로 설정되어 있으면 최우선 사용 (배치/드래그/키보드 이동 시 설정된 슬롯 맞춤 너비)
  if (placedModule.customWidth !== undefined && placedModule.customWidth !== null) {
    furnitureWidthMm = placedModule.customWidth;
    console.log('📐 customWidth 사용:', furnitureWidthMm);
  } else if (placedModule.adjustedWidth !== undefined && placedModule.adjustedWidth !== null) {
    // adjustedWidth가 있으면 사용 (기둥 침범 케이스)
    furnitureWidthMm = placedModule.adjustedWidth;
    console.log('📐 adjustedWidth 사용:', furnitureWidthMm);
  } else {
    // 기본값은 모듈 원래 크기 (이미 위에서 설정됨)
    console.log('📐 기본 너비 사용:', furnitureWidthMm);
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
      'moduleWidth': actualModuleData.dimensions.width,
      'isDualSlot': isDualFurniture,
      'widthSource': placedModule.customWidth !== undefined && placedModule.customWidth !== null ? 'customWidth' : 
                    placedModule.adjustedWidth !== undefined && placedModule.adjustedWidth !== null ? 'adjustedWidth' : 'moduleDefault'
    });
  }
  
  // 디버깅용 로그 추가
  console.log('🎯 가구 너비 결정:', {
    moduleId: placedModule.id,
    placedModuleId: placedModule.moduleId,
    slotIndex: placedModule.slotIndex,
    zone: placedModule.zone,
    isDualFurniture,
    customWidth: placedModule.customWidth,
    adjustedWidth: placedModule.adjustedWidth,
    moduleWidth: actualModuleData.dimensions.width,
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
        return `기본 모듈 너비 사용 (${actualModuleData.dimensions.width}mm)`;
      }
    })()
  });
  
  // 마지막 슬롯인지 확인
  let isLastSlot = false;
  if (placedModule.zone && spaceInfo.droppedCeiling?.enabled) {
    const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
    const targetZone = placedModule.zone === 'dropped' && zoneInfo.dropped ? zoneInfo.dropped : zoneInfo.normal;
    isLastSlot = placedModule.slotIndex === targetZone.columnCount - 1;
  } else {
    isLastSlot = placedModule.slotIndex === indexing.columnCount - 1;
  }
  
  // adjustedPosition 계산 - 마지막 슬롯의 경우 원본 슬롯 중심 사용
  let adjustedPosition = placedModule.position;
  if (isLastSlot && !isFurnitureDragging) {
    // 마지막 슬롯은 originalSlotCenterX를 나중에 계산하므로 여기서는 position 사용
    adjustedPosition = { ...placedModule.position };
  }
  let adjustedDepthMm = actualModuleData.dimensions.depth;
  
  
  // 가구 높이는 기본적으로 모듈 데이터의 높이 사용
  let furnitureHeightMm = actualModuleData.dimensions.height;
  
  // 단내림 구간 높이 디버깅
  if (placedModule.zone === 'dropped') {
    console.log('📏 단내림 구간 가구 높이 (초기):', {
      moduleId: placedModule.id,
      customHeight: placedModule.customHeight,
      moduleHeight: actualModuleData.dimensions.height,
      internalSpaceHeight: internalSpace.height,
      finalHeight: furnitureHeightMm,
      zone: placedModule.zone
    });
  }
  
  // Column C 가구 너비 디버깅
  if (slotInfo?.columnType === 'medium' && slotInfo?.allowMultipleFurniture) {
    console.log('🟦 FurnitureItem Column C 너비 확인:', {
      moduleId: placedModule.id,
      customWidth: placedModule.customWidth,
      adjustedWidth: placedModule.adjustedWidth,
      originalWidth: actualModuleData.dimensions.width,
      finalWidth: furnitureWidthMm,
      position: {
        x: placedModule.position.x.toFixed(3),
        z: placedModule.position.z.toFixed(3)
      }
    });
  }
  
  // 듀얼 가구인지 확인하여 도어 크기 결정 (이미 위에서 계산됨)
  // 단내림 구간에서는 zone별 columnWidth 사용
  let originalSlotWidthMm: number;
  if (placedModule.zone && spaceInfo.droppedCeiling?.enabled) {
    const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
    const targetZone = placedModule.zone === 'dropped' && zoneInfo.dropped ? zoneInfo.dropped : zoneInfo.normal;
    
    // 마지막 슬롯의 경우 실제 남은 너비 사용
    if (isLastSlot && !isDualFurniture) {
      const usedWidth = targetZone.columnWidth * (targetZone.columnCount - 1);
      originalSlotWidthMm = targetZone.width - usedWidth;
    } else if (isDualFurniture && placedModule.slotIndex === targetZone.columnCount - 2) {
      // 마지막-1 슬롯의 듀얼 가구인 경우
      const normalSlotWidth = targetZone.columnWidth;
      const lastSlotStart = targetZone.startX + ((targetZone.columnCount - 1) * targetZone.columnWidth);
      const lastSlotEnd = targetZone.startX + targetZone.width;
      const lastSlotWidth = lastSlotEnd - lastSlotStart;
      originalSlotWidthMm = normalSlotWidth + lastSlotWidth;
    } else if (isDualFurniture) {
      // 듀얼 가구: 실제 슬롯 너비들의 합계 사용
      if (targetZone.slotWidths && placedModule.slotIndex < targetZone.slotWidths.length - 1) {
        originalSlotWidthMm = targetZone.slotWidths[placedModule.slotIndex] + targetZone.slotWidths[placedModule.slotIndex + 1];
      } else {
        // fallback: 평균 너비 * 2
        originalSlotWidthMm = targetZone.columnWidth * 2;
      }
    } else {
      // 싱글 가구: 해당 슬롯의 실제 너비 사용
      if (targetZone.slotWidths && targetZone.slotWidths[placedModule.slotIndex] !== undefined) {
        originalSlotWidthMm = targetZone.slotWidths[placedModule.slotIndex];
      } else {
        // fallback: 평균 너비
        originalSlotWidthMm = targetZone.columnWidth;
      }
    }
    
  } else {
    // 단내림이 없는 경우도 마지막 슬롯 처리
    if (isLastSlot && !isDualFurniture) {
      const usedWidth = indexing.columnWidth * (indexing.columnCount - 1);
      const totalInternalWidth = internalSpace.width;  // 내경 전체 너비
      originalSlotWidthMm = totalInternalWidth - usedWidth;
    } else if (isDualFurniture) {
      // 듀얼 가구: 실제 슬롯 너비들의 합계 사용
      if (indexing.slotWidths && placedModule.slotIndex < indexing.slotWidths.length - 1) {
        originalSlotWidthMm = indexing.slotWidths[placedModule.slotIndex] + indexing.slotWidths[placedModule.slotIndex + 1];
      } else {
        // fallback: 평균 너비 * 2
        originalSlotWidthMm = indexing.columnWidth * 2;
      }
    } else {
      // 싱글 가구: 해당 슬롯의 실제 너비 사용
      if (indexing.slotWidths && indexing.slotWidths[placedModule.slotIndex] !== undefined) {
        originalSlotWidthMm = indexing.slotWidths[placedModule.slotIndex];
      } else {
        // fallback: 평균 너비
        originalSlotWidthMm = indexing.columnWidth;
      }
    }
  }
  
  // 도어 크기 디버깅
  if (placedModule.hasDoor) {
    let targetZoneSlotWidths = null;
    let targetZoneInfo = null;
    if (placedModule.zone && spaceInfo.droppedCeiling?.enabled) {
      const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
      const targetZone = placedModule.zone === 'dropped' && zoneInfo.dropped ? zoneInfo.dropped : zoneInfo.normal;
      targetZoneSlotWidths = targetZone.slotWidths;
      targetZoneInfo = targetZone;
    }
    
    console.log('🚪 도어 크기 계산:', {
      zone: placedModule.zone,
      slotIndex: placedModule.slotIndex,
      isLastSlot,
      isDualFurniture,
      originalSlotWidthMm,
      furnitureWidthMm,
      difference: originalSlotWidthMm - furnitureWidthMm,
      indexingSlotWidths: indexing.slotWidths,
      targetZoneSlotWidths,
      targetZoneInfo: targetZoneInfo ? {
        columnWidth: targetZoneInfo.columnWidth,
        columnCount: targetZoneInfo.columnCount,
        width: targetZoneInfo.width
      } : null,
      isDroppedZone: placedModule.zone === 'dropped',
      customWidth: placedModule.customWidth,
      adjustedWidth: placedModule.adjustedWidth,
      actualModuleWidth: actualModuleData?.dimensions?.width,
      moduleIdFromPlaced: placedModule.moduleId
    });
    
    // 도어 너비가 가구 너비와 크게 차이나는 경우 보정
    // 단내림 추가 후 슬롯 너비가 변경되었을 때 발생하는 문제 해결
    const widthDifference = Math.abs(originalSlotWidthMm - furnitureWidthMm);
    if (widthDifference > 20 && !isEditMode && !isDragging) {
      console.warn('⚠️ 도어와 가구 너비 불일치 감지:', {
        originalSlotWidthMm,
        furnitureWidthMm,
        difference: widthDifference,
        '보정여부': '가구 너비로 도어 너비 보정'
      });
      // 가구 너비를 기준으로 도어 너비 보정
      originalSlotWidthMm = furnitureWidthMm;
    }
  }
  
  // 도어는 항상 원래 슬롯 중심에 고정 (가구 이동과 무관)
  let originalSlotCenterX: number;
  
  // zone이 있는 경우 zone별 위치 계산
  if (placedModule.zone && spaceInfo.droppedCeiling?.enabled) {
    const zoneInfo = ColumnIndexer.calculateZoneSlotInfo(spaceInfo, spaceInfo.customColumnCount);
    const targetZone = placedModule.zone === 'dropped' && zoneInfo.dropped ? zoneInfo.dropped : zoneInfo.normal;
    
    // zone 내 로컬 슬롯 인덱스 사용
    const localSlotIndex = placedModule.slotIndex || 0;
    
    if (isDualFurniture && localSlotIndex < targetZone.columnCount - 1) {
      // 듀얼 가구: 두 슬롯의 중간점
      let leftSlotX, rightSlotX;
      
      // 마지막-1 슬롯이 듀얼인 경우 마지막 슬롯의 실제 너비 고려
      if (localSlotIndex === targetZone.columnCount - 2) {
        leftSlotX = targetZone.startX + (localSlotIndex * targetZone.columnWidth) + (targetZone.columnWidth / 2);
        const lastSlotStart = targetZone.startX + ((localSlotIndex + 1) * targetZone.columnWidth);
        const lastSlotEnd = targetZone.startX + targetZone.width;
        rightSlotX = (lastSlotStart + lastSlotEnd) / 2;
      } else {
        leftSlotX = targetZone.startX + (localSlotIndex * targetZone.columnWidth) + (targetZone.columnWidth / 2);
        rightSlotX = targetZone.startX + ((localSlotIndex + 1) * targetZone.columnWidth) + (targetZone.columnWidth / 2);
      }
      originalSlotCenterX = ((leftSlotX + rightSlotX) / 2) * 0.01; // mm to Three.js units
    } else {
      // 싱글 가구
      // targetZone의 threeUnitPositions나 계산된 위치 사용
      const zoneIndexing = placedModule.zone === 'dropped' && indexing.zones?.dropped 
        ? indexing.zones.dropped 
        : (placedModule.zone === 'normal' && indexing.zones?.normal ? indexing.zones.normal : indexing);
      
      if (zoneIndexing.threeUnitPositions && zoneIndexing.threeUnitPositions[localSlotIndex] !== undefined) {
        originalSlotCenterX = zoneIndexing.threeUnitPositions[localSlotIndex];
      } else {
        // fallback: 기본 계산 사용
        originalSlotCenterX = (targetZone.startX + (localSlotIndex * targetZone.columnWidth) + (targetZone.columnWidth / 2)) * 0.01;
      }
    }
  } else {
    // zone이 없는 경우 기존 로직
    // 슬롯 인덱스가 있으면 정확한 슬롯 중심 위치 계산 (우선순위)
    if (placedModule.slotIndex !== undefined && indexing.threeUnitPositions[placedModule.slotIndex] !== undefined) {
      originalSlotCenterX = indexing.threeUnitPositions[placedModule.slotIndex]; // 실제 슬롯 중심 위치
    } else {
      // 슬롯 인덱스가 없는 경우, 듀얼 가구라면 듀얼 위치에서 찾기
      
      if (isDualFurniture && indexing.threeUnitDualPositions) {
        // 듀얼 가구의 경우 듀얼 위치에서 가장 가까운 위치 찾기
        const closestDualIndex = indexing.threeUnitPositions.findIndex(pos => 
          Math.abs(pos - placedModule.position.x) < 0.2 // 20cm 오차 허용
        );
        if (closestDualIndex >= 0) {
          originalSlotCenterX = indexing.threeUnitDualPositions[closestDualIndex];
        } else {
          // 백업: 현재 위치 사용 (기존 동작)
          originalSlotCenterX = placedModule.position.x;
        }
      } else {
        // 싱글 가구의 경우 싱글 위치에서 가장 가까운 위치 찾기
        const closestSingleIndex = indexing.threeUnitPositions.findIndex(pos => 
          Math.abs(pos - placedModule.position.x) < 0.2 // 20cm 오차 허용
        );
        if (closestSingleIndex >= 0) {
          originalSlotCenterX = indexing.threeUnitPositions[closestSingleIndex];
        } else {
          // 백업: 현재 위치 사용 (기존 동작)
          originalSlotCenterX = placedModule.position.x;
        }
      }
    }
  }
  
  // 마지막 슬롯도 일반 슬롯과 동일하게 처리 (특별 처리 제거)
  // threeUnitPositions가 이미 올바른 위치를 가지고 있음
  
  // 마지막 슬롯은 기둥 처리 제외
  if (!isFurnitureDragging && !isLastSlot && slotInfo && slotInfo.hasColumn && slotInfo.column) {
    // 기둥 타입에 따른 처리 방식 확인
    const columnProcessingMethod = slotInfo.columnProcessingMethod || 'width-adjustment';
    
    console.log('🏛️ 기둥 처리 방식:', {
      slotIndex: placedModule.slotIndex,
      columnType: slotInfo.columnType,
      columnDepth: slotInfo.column.depth,
      columnProcessingMethod,
      isColumnC,
      allowMultipleFurniture: slotInfo.allowMultipleFurniture
    });
    
    const slotWidthM = indexing.columnWidth * 0.01; // mm to meters
    const originalSlotBounds = {
      left: originalSlotCenterX - slotWidthM / 2,
      right: originalSlotCenterX + slotWidthM / 2,
      center: originalSlotCenterX
    };
    
    // 기둥 침범에 따른 새로운 가구 경계 계산
    const furnitureBounds = calculateFurnitureBounds(slotInfo, originalSlotBounds, spaceInfo);
    
    // 모든 기둥에 대해 폭 조정 방식 적용 (기둥 C 포함)
    // 단, customWidth가 이미 설정되어 있으면 폭은 변경하지 않고 위치만 조정
    if (columnProcessingMethod === 'width-adjustment') {
      // Column C의 경우 서브슬롯 위치 사용
      if (isColumnC && slotInfo.subSlots && placedModule.subSlotPosition) {
        const subSlot = slotInfo.subSlots[placedModule.subSlotPosition];
        // customWidth가 없을 때만 폭 조정
        if (placedModule.customWidth === undefined || placedModule.customWidth === null) {
          furnitureWidthMm = subSlot.availableWidth;
        }
        adjustedPosition = {
          ...placedModule.position,
          x: subSlot.center
        };
        
        console.log('🔵 Column C 서브슬롯 위치 적용:', {
          subSlotPosition: placedModule.subSlotPosition,
          width: furnitureWidthMm,
          center: subSlot.center,
          originalPosition: placedModule.position.x,
          customWidth: placedModule.customWidth,
          widthOverridden: placedModule.customWidth === undefined || placedModule.customWidth === null
        });
      } else {
        // 일반 폭 조정 방식: 가구 크기와 위치 조정
        // customWidth가 없을 때만 폭 조정
        if (placedModule.customWidth === undefined || placedModule.customWidth === null) {
          furnitureWidthMm = furnitureBounds.renderWidth;
        }
        adjustedPosition = {
          ...placedModule.position,
          x: furnitureBounds.center
        };
      }
      
      console.log('🪑 폭 조정 방식 - 가구 크기 및 위치 조정:', {
        columnType: slotInfo.columnType,
        columnDepth: slotInfo.column.depth,
        originalWidth: actualModuleData.dimensions.width,
        adjustedWidth: furnitureWidthMm,
        originalPosition: placedModule.position.x,
        adjustedPosition: adjustedPosition.x,
        intrusionDirection: slotInfo.intrusionDirection,
        allowMultipleFurniture: slotInfo.allowMultipleFurniture
      });
    } else if (columnProcessingMethod === 'depth-adjustment') {
      // 깊이 조정 방식 (얕은 기둥만 해당, 기둥 C 제외)
      const slotDepth = 730; // 슬롯 기본 깊이
      const columnDepth = slotInfo.column.depth;
      const remainingDepth = slotDepth - columnDepth;
      
      // 듀얼캐비닛인지 확인
      // isDualFurniture는 이미 위에서 계산됨
      
      if (isDualFurniture && remainingDepth <= 300) {
        // 듀얼캐비닛이고 남은 깊이가 300mm 이하면 배치 불가
        // 배치 불가 처리 (원래 깊이 유지하거나 다른 처리)
        adjustedDepthMm = actualModuleData.dimensions.depth;
      } else {
        // 배치 가능 - 깊이만 조정, 폭과 위치는 그대로
        adjustedDepthMm = remainingDepth;
        
        console.log('✅ 얕은 기둥 - 깊이만 줄임, 폭과 위치 유지:', {
          slotDepth: slotDepth,
          columnDepth: columnDepth,
          originalDepth: actualModuleData.dimensions.depth,
          adjustedDepthMm: adjustedDepthMm,
          originalWidth: actualModuleData.dimensions.width,
          keepOriginalWidth: true,
          keepOriginalPosition: true,
          isDualFurniture: isDualFurniture,
          계산식: `${slotDepth} - ${columnDepth} = ${adjustedDepthMm}`
        });
      }
    }
  }
  
  // 가구 치수를 Three.js 단위로 변환
  const width = mmToThreeUnits(furnitureWidthMm);
  
  // 가구 높이 계산: actualModuleData.dimensions.height가 이미 올바른 높이를 가지고 있음
  // generateShelvingModules에서 internalSpace.height를 기반으로 가구를 생성했기 때문
  // 추가 조정 불필요
  
  const height = mmToThreeUnits(furnitureHeightMm);
  
  // 단내림 구간 최종 높이 디버깅
  if (placedModule.zone === 'dropped') {
    console.log('📏 단내림 구간 가구 높이 (최종):', {
      moduleId: placedModule.id,
      furnitureHeightMm,
      internalSpaceHeight: internalSpace.height,
      droppedCeilingHeight: spaceInfo.droppedCeiling?.height,
      안전선반임계값: 2300,
      안전선반적용여부: furnitureHeightMm > 2300
    });
  }
  
  // 깊이 계산: customDepth 우선, 기둥 충돌로 조정된 깊이, 기본 깊이 순
  const actualDepthMm = placedModule.customDepth || (adjustedDepthMm !== actualModuleData.dimensions.depth ? adjustedDepthMm : actualModuleData.dimensions.depth);
  const depth = mmToThreeUnits(actualDepthMm);
  
  // Column C 깊이 디버깅
  if (isColumnC && slotInfo) {
    console.log('🟪 FurnitureItem Column C 깊이 확인:', {
      moduleId: placedModule.id,
      placedModuleCustomDepth: placedModule.customDepth,
      adjustedDepthMm,
      actualModuleDepth: actualModuleData.dimensions.depth,
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
  
  // Z축 위치는 항상 기본 위치 사용 (사이즈만 확장)
  const furnitureZ = furnitureZOffset + furnitureDepth/2 - doorThickness - depth/2;

  // 색상 설정: 드래그 중일 때만 색상 전달, 다른 상태에서는 MaterialPanel 색상 사용
  const furnitureColor = isDraggingThis ? '#66ff66' : undefined;
  
  // 기둥 침범 상황에 따른 최적 힌지 방향 계산 (드래그 중이 아닐 때만)
  let optimalHingePosition = placedModule.hingePosition || 'right';
  if (!isFurnitureDragging && slotInfo && slotInfo.hasColumn) {
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

  return (
    <group>
      {/* 가구 본체 (기둥에 의해 밀려날 수 있음) */}
      <group
        position={[
          adjustedPosition.x,
          furnitureStartY + height / 2, // 내경 바닥 높이 + 가구 높이의 절반
          furnitureZ // 공간 앞면에서 뒤쪽으로 배치
        ]}
        rotation={[0, (placedModule.rotation * Math.PI) / 180, 0]}
        onDoubleClick={(e) => onDoubleClick(e, placedModule.id)}
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
          console.log(`🪑 [가구위치] 이격거리${spaceInfo.gapConfig.left}mm: X=${placedModule.position.x.toFixed(3)}, 폭=${moduleData.dimensions.width}mm`);
          return null;
        })()}

        {/* 가구 타입에 따라 다른 컴포넌트 렌더링 */}
        {moduleData.type === 'box' ? (
          // 박스형 가구 렌더링 (도어 제외)
          <>
            <BoxModule 
              moduleData={actualModuleData}
              isDragging={isDraggingThis} // 실제로 이 가구를 드래그하는 경우만 true
              color={furnitureColor}
              internalHeight={furnitureHeightMm}
              viewMode={viewMode}
              renderMode={renderMode}
              hasDoor={!isFurnitureDragging && slotInfo && slotInfo.hasColumn ? false : (placedModule.hasDoor ?? false)} // 기둥 침범 시 도어는 별도 렌더링 (드래그 중이 아닐 때만)
              customDepth={actualDepthMm}
              hingePosition={optimalHingePosition}
              spaceInfo={zoneSpaceInfo}
              originalSlotWidth={originalSlotWidthMm}
              slotCenterX={0} // 기둥 침범과 무관하게 가구 본체와 동일한 위치
              adjustedWidth={furnitureWidthMm} // 조정된 너비를 adjustedWidth로 전달
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

      {/* 기둥 침범 시 도어를 별도로 렌더링 (원래 슬롯 위치에 고정) - 드래그 중이 아닐 때만 */}
      {(placedModule.hasDoor ?? false) && !isFurnitureDragging && slotInfo && slotInfo.hasColumn && moduleData.type === 'box' && spaceInfo && (
        <group
          position={[
            originalSlotCenterX, // 항상 원래 슬롯 중심
            furnitureStartY + height / 2, // 가구와 동일한 Y 위치
            furnitureZ // 가구와 동일한 Z 위치
          ]}
          rotation={[0, (placedModule.rotation * Math.PI) / 180, 0]}
        >
          <DoorModule
            moduleWidth={originalSlotWidthMm} // 원래 슬롯 크기 사용
            moduleDepth={actualDepthMm}
            hingePosition={optimalHingePosition}
            spaceInfo={zoneSpaceInfo}
            color={furnitureColor}
            doorXOffset={0} // 사용하지 않음
            originalSlotWidth={originalSlotWidthMm}
            slotCenterX={0} // 이미 절대 좌표로 배치했으므로 0
            moduleData={actualModuleData} // 실제 모듈 데이터
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
            adjustedPosition.x,
            furnitureStartY - 1.8, // 원래 위치로 (하부 프레임 아래)
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
        </Html>
      )}
    </group>
  );
};

export default FurnitureItem; 