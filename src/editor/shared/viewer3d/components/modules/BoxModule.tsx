import React, { useEffect, useState, useMemo } from 'react';
import { ModuleData } from '../../../../../data/modules/shelving';
import { SpaceInfo, useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useBaseFurniture, BaseFurnitureShell, SectionsRenderer } from './shared';
import DoorModule from './DoorModule';
import { useSpace3DView } from '../../context/useSpace3DView';
import { useUIStore } from '@/store/uiStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import * as THREE from 'three';
import IndirectLight from './IndirectLight';
import SingleType1 from './types/SingleType1';
import SingleType2 from './types/SingleType2';
import SingleType4 from './types/SingleType4';
import DualType1 from './types/DualType1';
import DualType2 from './types/DualType2';
import DualType4 from './types/DualType4';
import DualType5 from './types/DualType5';
import DualType6 from './types/DualType6';
import UpperCabinet from './types/UpperCabinet';
import LowerCabinet from './types/LowerCabinet';
import CustomFurnitureModule from './types/CustomFurnitureModule';
import CustomizableBoxModule from './types/CustomizableBoxModule';
import { CustomFurnitureConfig } from '@/editor/shared/furniture/types';

interface BoxModuleProps {
  moduleData: ModuleData;
  color?: string;
  isDragging?: boolean;
  isEditMode?: boolean; // 편집 모드 여부
  internalHeight?: number;
  hasDoor?: boolean;
  hasBackPanel?: boolean; // 백패널 유무 (상부장/하부장용)
  customDepth?: number;
  hingePosition?: 'left' | 'right';
  spaceInfo?: SpaceInfo;
  doorWidth?: number; // 도어 너비 (사용하지 않음 - 도어는 항상 원래 슬롯 크기)
  doorXOffset?: number; // 도어 위치 보정값 (사용하지 않음)
  originalSlotWidth?: number; // 원래 슬롯 너비 (mm)
  slotCenterX?: number; // 원래 슬롯 중심 X 좌표 (Three.js 단위)
  adjustedWidth?: number; // 기둥/엔드판넬에 의해 조정된 폭 (mm)
  slotWidths?: number[]; // 듀얼 가구의 개별 슬롯 너비들 (mm)
  slotIndex?: number; // 슬롯 인덱스 (노서라운드 모드에서 엔드패널 확장 판단용)
  slotInfo?: any; // 슬롯 정보 (기둥 침범 등)
  viewMode?: '2D' | '3D';
  renderMode?: 'solid' | 'wireframe';
  furnitureId?: string; // 가구 ID (칸 강조용)
  showFurniture?: boolean; // 가구 본체 표시 여부 (2D 모드에서 도어만 표시할 때 사용)
  isHighlighted?: boolean; // 가구 강조 여부
  adjacentCabinets?: { hasAdjacentUpperLower: boolean; adjacentSide: 'left' | 'right' | null }; // 인접 상하부장 정보
  placedFurnitureId?: string; // 배치된 가구의 고유 ID (치수 편집용)
  customSections?: SectionConfig[]; // 사용자 정의 섹션 설정
  visibleSectionIndex?: number | null; // 듀얼 가구 섹션 필터링 (0: 좌측, 1: 우측, null: 전체)
  doorTopGap?: number; // 가구 상단에서 위로의 갭 (mm, 기본값: 5)
  doorBottomGap?: number; // 가구 하단에서 아래로의 갭 (mm, 기본값: 25)
  lowerSectionDepth?: number; // 하부 섹션 깊이 (mm)
  upperSectionDepth?: number; // 상부 섹션 깊이 (mm)
  lowerSectionDepthDirection?: 'front' | 'back'; // 하부 깊이 줄이는 방향
  upperSectionDepthDirection?: 'front' | 'back'; // 상부 깊이 줄이는 방향
  lowerLeftSectionDepth?: number; // 하부 좌측 영역 깊이 (mm)
  lowerRightSectionDepth?: number; // 하부 우측 영역 깊이 (mm)
  lowerSectionTopOffset?: number; // 하부 섹션 상판 오프셋 (mm) - 띄움 배치 시 사용
  grainDirection?: 'horizontal' | 'vertical'; // 텍스처 결 방향 (하위 호환성)
  panelGrainDirections?: { [panelName: string]: 'horizontal' | 'vertical' }; // 패널별 개별 결 방향
  backPanelThickness?: number; // 백패널 두께 (mm, 기본값: 9)
  hasLeftEndPanel?: boolean; // 좌측 엔드패널 표시 여부
  hasRightEndPanel?: boolean; // 우측 엔드패널 표시 여부
  endPanelThickness?: number; // 엔드패널 두께 (mm, 기본값: 18)
  endPanelDepth?: number; // 엔드패널 깊이 (mm, 기본값: 가구 깊이)
  endPanelOffset?: number; // 엔드패널 Z축 옵셋 (mm, 기본값: 0) — 하위호환
  leftEndPanelOffset?: number; // 좌측 EP 개별 옵셋 (mm)
  rightEndPanelOffset?: number; // 우측 EP 개별 옵셋 (mm)
  zone?: 'normal' | 'dropped'; // 단내림 영역 정보
  isFreePlacement?: boolean; // 자유배치 모드 여부
  doorSplit?: boolean; // 도어 분할 모드 (상/하 개별 도어)
  upperDoorTopGap?: number; // 상부 도어 상단 이격거리 (mm)
  upperDoorBottomGap?: number; // 상부 도어 하단 이격거리 (mm)
  lowerDoorTopGap?: number; // 하부 도어 상단 이격거리 (mm)
  lowerDoorBottomGap?: number; // 하부 도어 하단 이격거리 (mm)
  topFrameThickness?: number; // 개별 가구 상부프레임 두께 (mm)
  hasBase?: boolean; // 하부프레임 존재 여부 (false면 받침대 없음 → baseHeight=0)
  individualFloatHeight?: number; // 개별 띄움 높이 (mm) - hasBase=false일 때 도어 Y보정용
  isCustomizable?: boolean; // 커스터마이징 가구 여부
  customConfig?: CustomFurnitureConfig; // 커스터마이징 설정
  // 이벤트 핸들러 추가
  onPointerDown?: (e: any) => void;
  onPointerMove?: (e: any) => void;
  onPointerUp?: (e: any) => void;
  onPointerOver?: () => void;
  onPointerOut?: () => void;
  onDoubleClick?: (e: any) => void;
  parentGroupY?: number; // 부모 그룹(가구)의 Y 위치 (Three.js 단위) — 도어 Y 보정용
}

/**
 * BoxModule 컴포넌트 (공통 로직 사용)
 * 
 * 1. 타입별 라우팅: 주요 타입들은 개별 컴포넌트로 라우팅
 * 2. 특수 케이스: DualType5/6 같은 복잡한 케이스는 별도 처리
 * 3. 일반 폴백: 나머지 케이스들은 공통 로직 사용
 */
const BoxModule: React.FC<BoxModuleProps> = ({
  moduleData,
  color,
  isDragging = false,
  isEditMode = false,
  internalHeight,
  hasDoor = false,
  hasBackPanel = true, // 기본값은 true (백패널 있음)
  customDepth,
  hingePosition = 'right',
  spaceInfo,
  doorWidth,
  doorXOffset = 0,
  originalSlotWidth,
  slotCenterX,
  adjustedWidth,
  slotWidths,
  slotIndex,
  slotInfo,
  viewMode,
  renderMode,
  furnitureId,
  showFurniture = true, // 기본값은 true (가구 표시)
  isHighlighted = false, // 강조 상태
  adjacentCabinets, // 인접 상하부장 정보
  placedFurnitureId, // 배치된 가구 ID
  customSections, // 사용자 정의 섹션 설정
  visibleSectionIndex = null, // 듀얼 가구 섹션 필터링 (0: 좌측, 1: 우측, null: 전체)
  doorTopGap = 5, // 가구 상단에서 위로의 갭 (mm)
  doorBottomGap = 25, // 가구 하단에서 아래로의 갭 (mm)
  lowerSectionDepth, // 하부 섹션 깊이 (mm)
  upperSectionDepth, // 상부 섹션 깊이 (mm)
  lowerSectionDepthDirection, // 하부 깊이 줄이는 방향
  upperSectionDepthDirection, // 상부 깊이 줄이는 방향
  lowerLeftSectionDepth, // 하부 좌측 영역 깊이 (mm)
  lowerRightSectionDepth, // 하부 우측 영역 깊이 (mm)
  lowerSectionTopOffset, // 하부 섹션 상판 오프셋 (mm) - 띄움 배치 시 사용
  grainDirection, // 텍스처 결 방향
  panelGrainDirections, // 패널별 개별 결 방향
  backPanelThickness: backPanelThicknessProp, // 백패널 두께 (mm)
  hasLeftEndPanel, // 좌측 엔드패널
  hasRightEndPanel, // 우측 엔드패널
  endPanelThickness, // 엔드패널 두께 (mm)
  endPanelDepth, // 엔드패널 깊이 (mm)
  endPanelOffset, // 엔드패널 Z축 옵셋 (mm) — 하위호환
  leftEndPanelOffset, // 좌측 EP 개별 옵셋 (mm)
  rightEndPanelOffset, // 우측 EP 개별 옵셋 (mm)
  zone, // 단내림 영역 정보
  isFreePlacement = false, // 자유배치 모드 여부
  doorSplit, // 도어 분할 모드
  upperDoorTopGap, // 상부 도어 상단 이격거리
  upperDoorBottomGap, // 상부 도어 하단 이격거리
  lowerDoorTopGap, // 하부 도어 상단 이격거리
  lowerDoorBottomGap, // 하부 도어 하단 이격거리
  topFrameThickness, // 개별 가구 상부프레임 두께
  hasBase, // 하부프레임 존재 여부
  individualFloatHeight, // 개별 띄움 높이
  isCustomizable: _isCustomizable = false, // 커스터마이징 가구 여부 (편집 패널 분기용, 렌더링에는 customConfig 사용)
  customConfig, // 커스터마이징 설정
  // 이벤트 핸들러들
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerOver,
  onPointerOut,
  onDoubleClick,
  parentGroupY, // 부모 그룹 Y 위치
}) => {
  // === React Hooks는 항상 최상단에서 호출 ===
  const spaceConfigStore = useSpaceConfigStore();
  const { indirectLightEnabled, indirectLightIntensity, indirectLightColor } = useUIStore();
  const placedModules = useFurnitureStore(state => state.placedModules);
  
  
  // 공통 로직도 항상 호출 (조건부 사용)
  const baseFurniture = useBaseFurniture(moduleData, {
    color,
    internalHeight,
    customDepth,
    isDragging,
    isEditMode,
    adjustedWidth,
    isHighlighted,
    grainDirection,
    panelGrainDirections,
    backPanelThicknessMm: backPanelThicknessProp
  });


  // debug useEffects removed for perf
  
  // 모든 간접조명은 UpperCabinetIndirectLight에서 통합 처리하므로 BoxModule에서는 렌더링하지 않음
  const showIndirectLight = false;



  // === 커스터마이징 가구 라우팅 (커스텀 설정이 있으면 항상 CustomizableBoxModule 사용) ===
  if (customConfig) {
    return (
      <>
        <CustomizableBoxModule
          width={adjustedWidth || moduleData.dimensions.width}
          height={moduleData.dimensions.height}
          depth={customDepth || moduleData.dimensions.depth}
          customConfig={customConfig}
          category={moduleData.category as 'full' | 'upper' | 'lower'}
          color={color}
          isDragging={isDragging}
          isEditMode={isEditMode}
          showFurniture={showFurniture}
          isHighlighted={isHighlighted}
          placedFurnitureId={placedFurnitureId}
          panelGrainDirections={panelGrainDirections}
          lowerSectionDepth={lowerSectionDepth}
          upperSectionDepth={upperSectionDepth}
          lowerSectionDepthDirection={lowerSectionDepthDirection}
          upperSectionDepthDirection={upperSectionDepthDirection}
          lowerLeftSectionDepth={lowerLeftSectionDepth}
          lowerRightSectionDepth={lowerRightSectionDepth}
          backPanelThickness={backPanelThicknessProp}
          hasLeftEndPanel={hasLeftEndPanel}
          hasRightEndPanel={hasRightEndPanel}
          endPanelThickness={endPanelThickness}
          endPanelDepth={endPanelDepth}
          leftEndPanelOffset={leftEndPanelOffset ?? endPanelOffset}
          rightEndPanelOffset={rightEndPanelOffset ?? endPanelOffset}
          isEditable={_isCustomizable}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerOver={onPointerOver}
          onPointerOut={onPointerOut}
          onDoubleClick={onDoubleClick}
        />
        {/* 커스터마이징 가구에도 도어 렌더링 (hasDoor가 true인 경우) */}
        {hasDoor && spaceInfo && (
          <DoorModule
            moduleWidth={adjustedWidth || moduleData.dimensions.width}
            moduleDepth={baseFurniture.actualDepthMm}
            hingePosition={hingePosition}
            spaceInfo={spaceInfo}
            color={baseFurniture.doorColor}
            doorXOffset={doorXOffset}
            originalSlotWidth={originalSlotWidth}
            slotCenterX={slotCenterX}
            slotWidths={slotWidths}
            slotIndex={slotIndex}
            moduleData={moduleData}
            isDragging={isDragging}
            isEditMode={isEditMode}
            textureUrl={baseFurniture.textureUrl}
            panelGrainDirections={baseFurniture.panelGrainDirections}
            furnitureId={placedFurnitureId}
            floatHeight={spaceInfo?.baseConfig?.floatHeight}
            doorTopGap={doorTopGap}
            doorBottomGap={doorBottomGap}
            zone={zone}
            internalHeight={internalHeight}
            isFreePlacement={isFreePlacement}
            topFrameThickness={topFrameThickness}
            hasBase={hasBase}
            individualFloatHeight={individualFloatHeight}
            parentGroupY={parentGroupY}
          />
        )}
      </>
    );
  }

  // === 0단계: 커스텀 가구 라우팅 ===
  if (moduleData.id.startsWith('custom-')) {
    // 커스텀 가구 ID에서 실제 가구 ID 추출
    const customFurnitureId = moduleData.id;

    return (
      <CustomFurnitureModule
        customFurnitureId={customFurnitureId}
        slotWidth={adjustedWidth || moduleData.dimensions.width}
        slotHeight={moduleData.dimensions.height}
        slotDepth={customDepth || moduleData.dimensions.depth}
        scaleMode="non-uniform"
        color={color}
        isDragging={isDragging}
        isEditMode={isEditMode}
        showFurniture={showFurniture}
        isHighlighted={isHighlighted}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onDoubleClick={onDoubleClick}
      />
    );
  }

  // === 1단계: 타입별 라우팅 (주요 타입들) ===
  if (moduleData.id.includes('dual-4drawer-hanging')) {
    return (
      <>
        <DualType4
          moduleData={moduleData}
          color={color}
          isDragging={isDragging}
          isEditMode={isEditMode}
          internalHeight={internalHeight}
          hasDoor={hasDoor}
          customDepth={customDepth}
          hingePosition={hingePosition}
          spaceInfo={spaceInfo}
          doorWidth={doorWidth}
          doorXOffset={0} // 도어 위치 고정 (커버 방식)
          originalSlotWidth={originalSlotWidth}
          slotCenterX={slotCenterX}
          adjustedWidth={adjustedWidth} // 조정된 폭 전달
          slotWidths={slotWidths} // 듀얼 가구의 개별 슬롯 너비들
          slotIndex={slotIndex} // 슬롯 인덱스 전달
          showFurniture={showFurniture} // 가구 본체 표시 여부
          customSections={customSections} // 사용자 정의 섹션 설정
          placedFurnitureId={placedFurnitureId} // 배치된 가구 ID 전달
          visibleSectionIndex={visibleSectionIndex} // 듀얼 가구 섹션 필터링
          lowerSectionDepth={lowerSectionDepth} // 하부 섹션 깊이 (mm)
          upperSectionDepth={upperSectionDepth} // 상부 섹션 깊이 (mm)
          lowerSectionDepthDirection={lowerSectionDepthDirection}
          upperSectionDepthDirection={upperSectionDepthDirection}
  
          lowerSectionTopOffset={lowerSectionTopOffset} // 하부 섹션 상판 오프셋 (mm) - 띄움 배치 시 사용
          backPanelThickness={backPanelThicknessProp} // 백패널 두께 (mm)
            // 이벤트 핸들러들 전달
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerOver={onPointerOver}
          onPointerOut={onPointerOut}
          onDoubleClick={onDoubleClick}
        furnitureId={furnitureId}
        doorTopGap={doorTopGap} // 천장에서 도어 상단까지의 갭
        doorBottomGap={doorBottomGap} // 바닥에서 도어 하단까지의 갭
        zone={zone}
        hasBase={hasBase}
            individualFloatHeight={individualFloatHeight}
        />
      </>
    );
  }

  if (moduleData.id.includes('dual-2drawer-hanging')) {
    return (
      <>
        {/* 모든 타입에서 간접조명 렌더링 */}
        {/* IndirectLight는 마지막에 한 번만 렌더링 */}
        <DualType1
        key={`${placedFurnitureId}-${lowerSectionDepth}-${upperSectionDepth}`}
        moduleData={moduleData}
        color={color}
        isDragging={isDragging}
        isEditMode={isEditMode}
        internalHeight={internalHeight}
        hasDoor={hasDoor}
        customDepth={customDepth}
        hingePosition={hingePosition}
        spaceInfo={spaceInfo}
        doorWidth={doorWidth}
        doorXOffset={0} // 도어 위치 고정 (커버 방식)
        originalSlotWidth={originalSlotWidth}
        slotCenterX={slotCenterX}
        adjustedWidth={adjustedWidth} // 조정된 폭 전달
        slotWidths={slotWidths} // 듀얼 가구의 개별 슬롯 너비들
        slotIndex={slotIndex} // 슬롯 인덱스 전달
        showFurniture={showFurniture} // 가구 본체 표시 여부
        customSections={customSections} // 자유배치 freeHeight 조정된 섹션
        isHighlighted={isHighlighted} // 강조 상태 전달
        placedFurnitureId={placedFurnitureId} // 배치된 가구 ID 전달
        visibleSectionIndex={visibleSectionIndex} // 듀얼 가구 섹션 필터링
        grainDirection={grainDirection} // 텍스처 결 방향 (하위 호환성)
        panelGrainDirections={panelGrainDirections} // 패널별 개별 결 방향
        lowerSectionDepth={lowerSectionDepth} // 하부 섹션 깊이 (mm)
        upperSectionDepth={upperSectionDepth} // 상부 섹션 깊이 (mm)
        lowerSectionDepthDirection={lowerSectionDepthDirection}
        upperSectionDepthDirection={upperSectionDepthDirection}


        lowerSectionTopOffset={lowerSectionTopOffset} // 하부 섹션 상판 오프셋 (mm) - 띄움 배치 시 사용
        backPanelThickness={backPanelThicknessProp} // 백패널 두께 (mm)
        // 이벤트 핸들러들 전달
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onDoubleClick={onDoubleClick}
        furnitureId={furnitureId}
        doorTopGap={doorTopGap} // 천장에서 도어 상단까지의 갭
        doorBottomGap={doorBottomGap} // 바닥에서 도어 하단까지의 갭
        zone={zone} // 단내림 영역 정보
        hasBase={hasBase}
            individualFloatHeight={individualFloatHeight}
      />
      </>
    );
  }

  if (moduleData.id.includes('dual-2hanging')) {
    return (
      <>
        {/* 모든 타입에서 간접조명 렌더링 */}
        {/* IndirectLight는 마지막에 한 번만 렌더링 */}
        <DualType2
        key={`${placedFurnitureId}-${lowerSectionDepth}-${upperSectionDepth}`}
        moduleData={moduleData}
        color={color}
        isDragging={isDragging}
        isEditMode={isEditMode}
        internalHeight={internalHeight}
        hasDoor={hasDoor}
        customDepth={customDepth}
        hingePosition={hingePosition}
        spaceInfo={spaceInfo}
        doorWidth={doorWidth}
        doorXOffset={0} // 도어 위치 고정 (커버 방식)
        originalSlotWidth={originalSlotWidth}
        slotCenterX={slotCenterX}
        adjustedWidth={adjustedWidth} // 조정된 폭 전달
        slotWidths={slotWidths} // 듀얼 가구의 개별 슬롯 너비들
        slotIndex={slotIndex} // 슬롯 인덱스 전달
        showFurniture={showFurniture} // 가구 본체 표시 여부
        customSections={customSections} // 자유배치 freeHeight 조정된 섹션
        isHighlighted={isHighlighted} // 강조 상태 전달
        placedFurnitureId={placedFurnitureId} // 배치된 가구 ID 전달
        visibleSectionIndex={visibleSectionIndex} // 듀얼 가구 섹션 필터링
        lowerSectionDepth={lowerSectionDepth} // 하부 섹션 깊이
        upperSectionDepth={upperSectionDepth} // 상부 섹션 깊이
        lowerSectionDepthDirection={lowerSectionDepthDirection}
        upperSectionDepthDirection={upperSectionDepthDirection}
        doorTopGap={doorTopGap}
        doorBottomGap={doorBottomGap}
        doorSplit={doorSplit}
        upperDoorTopGap={upperDoorTopGap}
        upperDoorBottomGap={upperDoorBottomGap}
        lowerDoorTopGap={lowerDoorTopGap}
        lowerDoorBottomGap={lowerDoorBottomGap}
        lowerSectionTopOffset={lowerSectionTopOffset} // 하부 섹션 상판 오프셋 (mm) - 띄움 배치 시 사용
        backPanelThickness={backPanelThicknessProp} // 백패널 두께 (mm)
        panelGrainDirections={panelGrainDirections}
        // 이벤트 핸들러들 전달
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onDoubleClick={onDoubleClick}
        furnitureId={furnitureId}
        zone={zone} // 단내림 영역 정보
        hasBase={hasBase}
            individualFloatHeight={individualFloatHeight}
      />
      </>
    );
  }

  if (moduleData.id.includes('single-4drawer-hanging')) {
    return (
      <>
        {/* 모든 타입에서 간접조명 렌더링 */}
        {/* IndirectLight는 마지막에 한 번만 렌더링 */}
        <SingleType4
        key={`${placedFurnitureId}-${lowerSectionDepth}-${upperSectionDepth}`}
        moduleData={moduleData}
        color={color}
        isDragging={isDragging}
        isEditMode={isEditMode}
        internalHeight={internalHeight}
        hasDoor={hasDoor}
        customDepth={customDepth}
        hingePosition={hingePosition}
        spaceInfo={spaceInfo}
        doorWidth={doorWidth}
        doorXOffset={0} // 도어 위치 고정 (커버 방식)
        originalSlotWidth={originalSlotWidth}
        slotCenterX={slotCenterX}
        adjustedWidth={adjustedWidth} // 조정된 폭 전달
        slotIndex={slotIndex} // 슬롯 인덱스 전달
        slotInfo={slotInfo} // 슬롯 정보 전달
        showFurniture={showFurniture}
        customSections={customSections} // 자유배치 freeHeight 조정된 섹션
        isHighlighted={isHighlighted} // 강조 상태 전달
        furnitureId={furnitureId} // 가구 본체 표시 여부
        placedFurnitureId={placedFurnitureId} // 배치된 가구 ID 전달
        doorTopGap={doorTopGap}
        doorBottomGap={doorBottomGap}
        lowerSectionDepth={lowerSectionDepth}
        upperSectionDepth={upperSectionDepth}
        lowerSectionDepthDirection={lowerSectionDepthDirection}
        upperSectionDepthDirection={upperSectionDepthDirection}
        doorSplit={doorSplit}
        upperDoorTopGap={upperDoorTopGap}
        upperDoorBottomGap={upperDoorBottomGap}
        lowerDoorTopGap={lowerDoorTopGap}
        lowerDoorBottomGap={lowerDoorBottomGap}
        lowerSectionTopOffset={lowerSectionTopOffset} // 하부 섹션 상판 오프셋 (mm) - 띄움 배치 시 사용
        backPanelThickness={backPanelThicknessProp} // 백패널 두께 (mm)
        zone={zone}
        hasBase={hasBase}
            individualFloatHeight={individualFloatHeight}
      />
      </>
    );
  }

  if (moduleData.id.includes('single-2drawer-hanging')) {
    return (
      <>
        {/* 모든 타입에서 간접조명 렌더링 */}
        {/* IndirectLight는 마지막에 한 번만 렌더링 */}
        <SingleType1
        key={`${placedFurnitureId}-${lowerSectionDepth}-${upperSectionDepth}`}
        moduleData={moduleData}
        color={color}
        isDragging={isDragging}
        isEditMode={isEditMode}
        internalHeight={internalHeight}
        hasDoor={hasDoor}
        customDepth={customDepth}
        hingePosition={hingePosition}
        spaceInfo={spaceInfo}
        doorWidth={doorWidth}
        customSections={customSections}
        doorXOffset={0} // 도어 위치 고정 (커버 방식)
        originalSlotWidth={originalSlotWidth}
        slotCenterX={slotCenterX}
        adjustedWidth={adjustedWidth} // 조정된 폭 전달
        slotIndex={slotIndex} // 슬롯 인덱스 전달
        slotInfo={slotInfo} // 슬롯 정보 전달
        showFurniture={showFurniture} // 가구 본체 표시 여부
        isHighlighted={isHighlighted} // 강조 상태 전달
        furnitureId={furnitureId} // 가구 ID 전달
        placedFurnitureId={placedFurnitureId} // 배치된 가구 ID 전달
        lowerSectionDepth={lowerSectionDepth}
        upperSectionDepth={upperSectionDepth}
        lowerSectionDepthDirection={lowerSectionDepthDirection}
        upperSectionDepthDirection={upperSectionDepthDirection}
        panelGrainDirections={panelGrainDirections}
        doorSplit={doorSplit}
        doorTopGap={doorTopGap}
        doorBottomGap={doorBottomGap}
        upperDoorTopGap={upperDoorTopGap}
        upperDoorBottomGap={upperDoorBottomGap}
        lowerDoorTopGap={lowerDoorTopGap}
        lowerDoorBottomGap={lowerDoorBottomGap}
        lowerSectionTopOffset={lowerSectionTopOffset} // 하부 섹션 상판 오프셋 (mm) - 띄움 배치 시 사용
        backPanelThickness={backPanelThicknessProp} // 백패널 두께 (mm)
        zone={zone}
        hasBase={hasBase}
            individualFloatHeight={individualFloatHeight}
      />
      </>
    );
  }

  if (moduleData.id.includes('single-2hanging')) {
    return (
      <>
        {/* 모든 타입에서 간접조명 렌더링 */}
        {/* IndirectLight는 마지막에 한 번만 렌더링 */}
        <SingleType2
        moduleData={moduleData}
        color={color}
        isDragging={isDragging}
        isEditMode={isEditMode}
        internalHeight={internalHeight}
        hasDoor={hasDoor}
        customDepth={customDepth}
        hingePosition={hingePosition}
        spaceInfo={spaceInfo}
        doorWidth={doorWidth}
        doorXOffset={0} // 도어 위치 고정 (커버 방식)
        originalSlotWidth={originalSlotWidth}
        slotCenterX={slotCenterX}
        adjustedWidth={adjustedWidth} // 조정된 폭 전달
        placedFurnitureId={placedFurnitureId} // 배치된 가구 ID 전달
        slotIndex={slotIndex} // 슬롯 인덱스 전달
        showFurniture={showFurniture}
        customSections={customSections} // 자유배치 freeHeight 조정된 섹션
        furnitureId={furnitureId} // 가구 본체 표시 여부
        doorTopGap={doorTopGap} // 천장에서 도어 상단까지의 갭
        doorBottomGap={doorBottomGap} // 바닥에서 도어 하단까지의 갭
        lowerSectionDepth={lowerSectionDepth} // 하부 섹션 깊이 (mm)
        upperSectionDepth={upperSectionDepth} // 상부 섹션 깊이 (mm)
        lowerSectionDepthDirection={lowerSectionDepthDirection}
        upperSectionDepthDirection={upperSectionDepthDirection}
        doorSplit={doorSplit}
        upperDoorTopGap={upperDoorTopGap}
        upperDoorBottomGap={upperDoorBottomGap}
        lowerDoorTopGap={lowerDoorTopGap}
        lowerDoorBottomGap={lowerDoorBottomGap}
        lowerSectionTopOffset={lowerSectionTopOffset} // 하부 섹션 상판 오프셋 (mm) - 띄움 배치 시 사용
        backPanelThickness={backPanelThicknessProp} // 백패널 두께 (mm)
        zone={zone}
        hasBase={hasBase}
            individualFloatHeight={individualFloatHeight}
      />
      </>
    );
  }

  if (moduleData.id.includes('dual-2drawer-styler')) {
    
    return (
      <>
        {/* 모든 타입에서 간접조명 렌더링 */}
        {/* IndirectLight는 마지막에 한 번만 렌더링 */}
        <DualType5
        moduleData={moduleData}
        color={color}
        isDragging={isDragging}
        isEditMode={isEditMode}
        internalHeight={internalHeight}
        hasDoor={hasDoor}
        customDepth={customDepth}
        hingePosition={hingePosition}
        spaceInfo={spaceInfo}
        doorWidth={doorWidth}
        doorXOffset={0} // 도어 위치 고정 (커버 방식)
        originalSlotWidth={originalSlotWidth}
        slotCenterX={slotCenterX}
        adjustedWidth={adjustedWidth} // 조정된 폭 전달
        slotWidths={slotWidths} // 듀얼 가구의 개별 슬롯 너비들
        slotIndex={slotIndex} // 슬롯 인덱스 전달
        showFurniture={showFurniture} // 가구 본체 표시 여부
        customSections={customSections} // 자유배치 freeHeight 조정된 섹션
        visibleSectionIndex={visibleSectionIndex} // 듀얼 가구 섹션 필터링
        lowerSectionTopOffset={lowerSectionTopOffset} // 하부 섹션 상판 오프셋 (mm) - 띄움 배치 시 사용
        backPanelThickness={backPanelThicknessProp} // 백패널 두께 (mm)
        placedFurnitureId={placedFurnitureId} // 배치된 가구 ID 전달
        // 이벤트 핸들러들 전달
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onDoubleClick={onDoubleClick}
        furnitureId={furnitureId}
        zone={zone} // 단내림 영역 정보
        hasBase={hasBase}
        individualFloatHeight={individualFloatHeight}
        doorTopGap={doorTopGap}
        doorBottomGap={doorBottomGap}
      />
      </>
    );
  }

  if (moduleData.id.includes('dual-4drawer-pantshanger')) {
    
    return (
      <>
        {/* 모든 타입에서 간접조명 렌더링 */}
        {/* IndirectLight는 마지막에 한 번만 렌더링 */}
        <DualType6
        key={`${placedFurnitureId}-${lowerSectionDepth}-${upperSectionDepth}-${doorSplit}-${upperDoorTopGap}-${upperDoorBottomGap}-${lowerDoorTopGap}-${lowerDoorBottomGap}`}
        moduleData={moduleData}
        color={color}
        isDragging={isDragging}
        isEditMode={isEditMode}
        internalHeight={internalHeight}
        hasDoor={hasDoor}
        customDepth={customDepth}
        hingePosition={hingePosition}
        spaceInfo={spaceInfo}
        doorWidth={doorWidth}
        doorXOffset={0} // 도어 위치 고정 (커버 방식)
        originalSlotWidth={originalSlotWidth}
        slotCenterX={slotCenterX}
        adjustedWidth={adjustedWidth} // 조정된 폭 전달
        slotWidths={slotWidths} // 듀얼 가구의 개별 슬롯 너비들
        slotIndex={slotIndex} // 슬롯 인덱스 전달
        showFurniture={showFurniture} // 가구 본체 표시 여부
        customSections={customSections} // 자유배치 freeHeight 조정된 섹션
        visibleSectionIndex={visibleSectionIndex} // 듀얼 가구 섹션 필터링
        lowerSectionDepth={lowerSectionDepth}
        upperSectionDepth={upperSectionDepth}
        lowerSectionDepthDirection={lowerSectionDepthDirection}
        upperSectionDepthDirection={upperSectionDepthDirection}
        doorSplit={doorSplit}
        upperDoorTopGap={upperDoorTopGap}
        upperDoorBottomGap={upperDoorBottomGap}
        lowerDoorTopGap={lowerDoorTopGap}
        lowerDoorBottomGap={lowerDoorBottomGap}
        lowerSectionTopOffset={lowerSectionTopOffset} // 하부 섹션 상판 오프셋 (mm) - 띄움 배치 시 사용
        backPanelThickness={backPanelThicknessProp} // 백패널 두께 (mm)
        placedFurnitureId={placedFurnitureId} // 배치된 가구 ID 전달
        // 이벤트 핸들러들 전달
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onDoubleClick={onDoubleClick}
        furnitureId={furnitureId}
        zone={zone} // 단내림 영역 정보
        hasBase={hasBase}
        individualFloatHeight={individualFloatHeight}
        doorTopGap={doorTopGap}
        doorBottomGap={doorBottomGap}
      />
      </>
    );
  }

  // === 상부장 타입들 (싱글 및 듀얼) ===
  if (moduleData.id.includes('upper-cabinet-') || moduleData.id.includes('dual-upper-cabinet-')) {
    return (
      <>
        {/* 모든 타입에서 간접조명 렌더링 */}
        {/* IndirectLight는 마지막에 한 번만 렌더링 */}
        <UpperCabinet
        moduleData={moduleData}
        color={color}
        isDragging={isDragging}
        isEditMode={isEditMode}
        internalHeight={internalHeight}
        hasDoor={hasDoor}
        hasBackPanel={hasBackPanel} // 백패널 유무 전달
        customDepth={customDepth}
        hingePosition={hingePosition}
        spaceInfo={spaceInfo}
        doorWidth={doorWidth}
        doorXOffset={0}
        originalSlotWidth={originalSlotWidth}
        slotCenterX={slotCenterX}
        adjustedWidth={adjustedWidth}
        slotWidths={slotWidths} // 듀얼 가구의 개별 슬롯 너비들
        slotIndex={slotIndex}
        showFurniture={showFurniture} // 가구 본체 표시 여부
        lowerSectionTopOffset={lowerSectionTopOffset} // 하부 섹션 상판 오프셋 (mm) - 띄움 배치 시 사용
        placedFurnitureId={placedFurnitureId}
        panelGrainDirections={panelGrainDirections}
        backPanelThickness={backPanelThicknessProp} // 백패널 두께 (mm)
        renderMode={renderMode} // 렌더 모드 전달
        zone={zone} // 단내림 영역 정보
        hasBase={hasBase}
            individualFloatHeight={individualFloatHeight}
      />
      </>
    );
  }

  // === 하부장 타입들 (싱글 및 듀얼) ===
  if (moduleData.id.includes('lower-cabinet-') || moduleData.id.includes('dual-lower-cabinet-')) {
    return (
      <>
        {/* 모든 타입에서 간접조명 렌더링 */}
        {/* IndirectLight는 마지막에 한 번만 렌더링 */}
        <LowerCabinet
        moduleData={moduleData}
        color={color}
        isDragging={isDragging}
        isEditMode={isEditMode}
        internalHeight={internalHeight}
        hasDoor={hasDoor}
        hasBackPanel={hasBackPanel} // 백패널 유무 전달
        customDepth={customDepth}
        hingePosition={hingePosition}
        spaceInfo={spaceInfo}
        doorWidth={doorWidth}
        doorXOffset={0}
        originalSlotWidth={originalSlotWidth}
        slotCenterX={slotCenterX}
        adjustedWidth={adjustedWidth}
        slotWidths={slotWidths} // 듀얼 가구의 개별 슬롯 너비들
        slotIndex={slotIndex}
        showFurniture={showFurniture} // 가구 본체 표시 여부
        lowerSectionTopOffset={lowerSectionTopOffset} // 하부 섹션 상판 오프셋 (mm) - 띄움 배치 시 사용
        placedFurnitureId={placedFurnitureId}
        panelGrainDirections={panelGrainDirections}
        backPanelThickness={backPanelThicknessProp} // 백패널 두께 (mm)
        renderMode={renderMode} // 렌더 모드 전달
        zone={zone} // 단내림 영역 정보
        hasBase={hasBase}
            individualFloatHeight={individualFloatHeight}
      />
      </>
    );
  }

  // === 2단계: 일반 폴백 케이스 (공통 로직 사용) ===
  // 나머지 케이스들을 공통 로직으로 처리
  return (
    <>
      {/* 가구 본체는 showFurniture가 true일 때만 렌더링 */}
      {showFurniture && (
        <BaseFurnitureShell 
          {...baseFurniture} 
          isDragging={isDragging} 
          isEditMode={isEditMode} 
          isHighlighted={isHighlighted}
          placedFurnitureId={placedFurnitureId}
          panelGrainDirections={panelGrainDirections}
        >
          {/* 내부 구조 렌더링 (드래그/고스트 중에도 표시) */}
          {(
            <SectionsRenderer
              modelConfig={baseFurniture.modelConfig}
              height={baseFurniture.height}
              innerWidth={baseFurniture.innerWidth}
              depth={baseFurniture.depth}
              adjustedDepthForShelves={baseFurniture.adjustedDepthForShelves}
              basicThickness={baseFurniture.basicThickness}
              shelfZOffset={baseFurniture.shelfZOffset}
              material={baseFurniture.material}
              calculateSectionHeight={baseFurniture.calculateSectionHeight}
              mmToThreeUnits={baseFurniture.mmToThreeUnits}
              renderMode={renderMode || useSpace3DView().renderMode}
              furnitureId={furnitureId}
              placedFurnitureId={placedFurnitureId}
              textureUrl={baseFurniture.textureUrl}
              panelGrainDirections={panelGrainDirections}
              isFloatingPlacement={spaceInfo?.baseConfig?.placementType === 'float'}
            />
          )}
        </BaseFurnitureShell>
      )}
      
      {/* 도어는 showFurniture와 관계없이 hasDoor가 true이면 항상 렌더링 (도어만 보기 위해) */}
      {(() => {
        
        
        // 2D 모드에서 showFurniture가 false여도 도어는 렌더링
        if (hasDoor && spaceInfo) {
          return (
            <DoorModule
              moduleWidth={doorWidth || moduleData.dimensions.width} // 무시됨
              moduleDepth={baseFurniture.actualDepthMm}
              hingePosition={hingePosition}
              spaceInfo={spaceInfo}
              color={baseFurniture.doorColor}
              doorXOffset={doorXOffset} // FurnitureItem에서 전달받은 오프셋 사용
              originalSlotWidth={originalSlotWidth}
              slotCenterX={slotCenterX}
              slotWidths={slotWidths} // 듀얼 가구의 개별 슬롯 너비들
              slotIndex={slotIndex} // 슬롯 인덱스 전달
              moduleData={moduleData} // 실제 듀얼캐비넷 분할 정보
              isDragging={isDragging}
              isEditMode={isEditMode}
              textureUrl={baseFurniture.textureUrl} // 텍스처 URL 전달
              panelGrainDirections={baseFurniture.panelGrainDirections} // 결방향 정보 전달
              furnitureId={placedFurnitureId} // 가구 ID 전달
              floatHeight={spaceInfo?.baseConfig?.floatHeight} // 띄움 높이 전달
              doorTopGap={doorTopGap} // 천장에서 도어 상단까지의 갭
              doorBottomGap={doorBottomGap} // 바닥에서 도어 하단까지의 갭
              zone={zone} // 단내림 영역 정보 전달
              internalHeight={internalHeight} // 자유배치 시 실제 가구 높이 전달
              isFreePlacement={isFreePlacement} // 자유배치 모드 전달
              topFrameThickness={topFrameThickness} // 개별 가구 상부프레임 두께
              hasBase={hasBase}
            individualFloatHeight={individualFloatHeight}
            parentGroupY={parentGroupY}
            />
          );
        }
        return null;
      })()}
      
      {/* 간접조명은 UpperCabinetIndirectLight 컴포넌트에서 통합 관리 */}
    </>
  );
};

export default BoxModule; 
