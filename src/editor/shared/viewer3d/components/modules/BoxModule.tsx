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
  viewMode?: '2D' | '3D';
  renderMode?: 'solid' | 'wireframe';
  furnitureId?: string; // 가구 ID (칸 강조용)
  showFurniture?: boolean; // 가구 본체 표시 여부 (2D 모드에서 도어만 표시할 때 사용)
  isHighlighted?: boolean; // 가구 강조 여부
  adjacentCabinets?: { hasAdjacentUpperLower: boolean; adjacentSide: 'left' | 'right' | null }; // 인접 상하부장 정보
  // 이벤트 핸들러 추가
  onPointerDown?: (e: any) => void;
  onPointerMove?: (e: any) => void;
  onPointerUp?: (e: any) => void;
  onPointerOver?: () => void;
  onPointerOut?: () => void;
  onDoubleClick?: (e: any) => void;
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
  viewMode,
  renderMode,
  furnitureId,
  showFurniture = true, // 기본값은 true (가구 표시)
  isHighlighted = false, // 강조 상태
  adjacentCabinets, // 인접 상하부장 정보
  // 이벤트 핸들러들
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerOver,
  onPointerOut,
  onDoubleClick
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
    isHighlighted
  });
  
  // 모든 간접조명은 UpperCabinetIndirectLight에서 통합 처리하므로 BoxModule에서는 렌더링하지 않음
  const showIndirectLight = false;
  
  
  
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
            // 이벤트 핸들러들 전달
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerOver={onPointerOver}
          onPointerOut={onPointerOut}
          onDoubleClick={onDoubleClick}
        furnitureId={furnitureId}
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
        // 이벤트 핸들러들 전달
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onDoubleClick={onDoubleClick}
        furnitureId={furnitureId}
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
        // 이벤트 핸들러들 전달
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onDoubleClick={onDoubleClick}
        furnitureId={furnitureId}
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
        showFurniture={showFurniture}
        furnitureId={furnitureId} // 가구 본체 표시 여부
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
        showFurniture={showFurniture} // 가구 본체 표시 여부
        isHighlighted={isHighlighted} // 강조 상태 전달
        furnitureId={furnitureId} // 가구 ID 전달
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
        slotIndex={slotIndex} // 슬롯 인덱스 전달
        showFurniture={showFurniture}
        furnitureId={furnitureId} // 가구 본체 표시 여부
      />
      </>
    );
  }

  if (moduleData.id.includes('dual-2drawer-styler')) {
    console.log('🔍 BoxModule: 스타일러장 렌더링 시작', {
      moduleId: moduleData.id,
      showFurniture,
      isDragging,
      isEditMode,
      spaceInfo: {
        hasSpaceInfo: !!spaceInfo,
        placementType: spaceInfo?.baseConfig?.placementType,
        floatHeight: spaceInfo?.baseConfig?.floatHeight
      }
    });
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
        // 이벤트 핸들러들 전달
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onDoubleClick={onDoubleClick}
        furnitureId={furnitureId}
      />
      </>
    );
  }

  if (moduleData.id.includes('dual-4drawer-pantshanger')) {
    console.log('🔍 BoxModule: 바지걸이장 렌더링 시작', {
      moduleId: moduleData.id,
      showFurniture,
      isDragging,
      isEditMode,
      spaceInfo: {
        hasSpaceInfo: !!spaceInfo,
        placementType: spaceInfo?.baseConfig?.placementType,
        floatHeight: spaceInfo?.baseConfig?.floatHeight
      }
    });
    return (
      <>
        {/* 모든 타입에서 간접조명 렌더링 */}
        {/* IndirectLight는 마지막에 한 번만 렌더링 */}
        <DualType6
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
        // 이벤트 핸들러들 전달
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onDoubleClick={onDoubleClick}
        furnitureId={furnitureId}
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
        >
          {/* 드래그 중이 아닐 때만 내부 구조 렌더링 */}
          {!isDragging && (
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
              renderMode={renderMode || useSpace3DView().renderMode}
              furnitureId={furnitureId}
            />
          )}
        </BaseFurnitureShell>
      )}
      
      {/* 도어는 showFurniture와 관계없이 hasDoor가 true이면 항상 렌더링 (도어만 보기 위해) */}
      {(() => {
        console.log('🚪 BoxModule 도어 체크:', {
          moduleId: moduleData.id,
          hasDoor,
          spaceInfo: !!spaceInfo,
          showFurniture,
          viewMode: useSpace3DView().viewMode,
          willRenderDoor: hasDoor && spaceInfo
        });
        
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