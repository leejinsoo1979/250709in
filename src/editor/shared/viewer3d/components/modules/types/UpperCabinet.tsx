import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ModuleData } from '@/data/modules/shelving';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { useBaseFurniture, BaseFurnitureShell, SectionsRenderer, FurnitureTypeProps } from '../shared';
import { useSpace3DView } from '../../../context/useSpace3DView';
import DoorModule from '../DoorModule';
import FinishingPanelWithTexture from '../components/FinishingPanelWithTexture';
import BoxWithEdges from '../components/BoxWithEdges';

/**
 * 상부장 컴포넌트
 * - 상부장 선반형, 오픈형, 혼합형을 모두 처리
 * - 공통 렌더링 로직 사용
 */
const UpperCabinet: React.FC<FurnitureTypeProps> = ({
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
  slotIndex,
  slotCenterX,
  adjustedWidth,
  slotWidths, // 듀얼 가구의 개별 슬롯 너비들
  showFurniture = true,
  lowerSectionTopOffset,
  placedFurnitureId,
  panelGrainDirections,
  renderMode: renderModeProp
}) => {
  const { renderMode: contextRenderMode, viewMode } = useSpace3DView();
  const renderMode = renderModeProp || contextRenderMode;
  
  // 공통 가구 로직 사용
  const baseFurniture = useBaseFurniture(moduleData, {
    color,
    internalHeight,
    customDepth,
    isDragging,
    isEditMode,
    adjustedWidth
  });

  // 간접조명은 UpperCabinetIndirectLight 컴포넌트에서 통합 관리
  // 개별 상부장에서는 간접조명을 렌더링하지 않음

  return (
    <>
      {/* 간접조명은 UpperCabinetIndirectLight 컴포넌트에서 통합 렌더링 */}
      
      {/* 가구 본체는 showFurniture가 true일 때만 렌더링 */}
      {showFurniture && (
        <>
          <BaseFurnitureShell {...baseFurniture} isDragging={isDragging} isEditMode={isEditMode} hasBackPanel={hasBackPanel} isFloating={true} spaceInfo={spaceInfo} moduleData={moduleData} lowerSectionTopOffsetMm={lowerSectionTopOffset} renderMode={renderMode}>
            {/* 내부 구조는 항상 렌더링 (서랍/선반) */}
            {console.log('🟣 [UpperCabinet] 내부 구조 렌더링:', { isDragging, renderMode, hasLeftRight: !!(baseFurniture.modelConfig.leftSections && baseFurniture.modelConfig.rightSections) })}
            <>
                {/* 듀얼 가구인 경우 좌우 섹션 별도 렌더링 */}
                {baseFurniture.modelConfig.leftSections && baseFurniture.modelConfig.rightSections ? (
                  <>
                    {/* 왼쪽 섹션 - 왼쪽 구획의 중앙에서 왼쪽으로 basicThickness/2만큼 이동 */}
                    <group position={[-(baseFurniture.innerWidth/2 - baseFurniture.basicThickness/2)/2 - baseFurniture.basicThickness/2, 0, 0]}>
                      <SectionsRenderer
                        modelConfig={{ sections: baseFurniture.modelConfig.leftSections }}
                        height={baseFurniture.height}
                        innerWidth={baseFurniture.innerWidth/2 - baseFurniture.basicThickness/2}
                        depth={baseFurniture.depth}
                        adjustedDepthForShelves={baseFurniture.adjustedDepthForShelves}
                        basicThickness={baseFurniture.basicThickness}
                        shelfZOffset={baseFurniture.shelfZOffset}
                        material={baseFurniture.material}
                        calculateSectionHeight={baseFurniture.calculateSectionHeight}
                        mmToThreeUnits={baseFurniture.mmToThreeUnits}
                        renderMode={renderMode}
                        furnitureId={moduleData.id}
                        hideSectionDimensions={false}
                        lowerSectionTopOffsetMm={lowerSectionTopOffset}
                      />
                    </group>
                    
                    {/* 중앙 분리대 - BoxWithEdges 사용 */}
                    <BoxWithEdges
                      args={[baseFurniture.basicThickness, baseFurniture.height - baseFurniture.basicThickness * 2, baseFurniture.adjustedDepthForShelves]}
                      position={[0, 0, baseFurniture.shelfZOffset]}
                      material={baseFurniture.material}
                      renderMode={renderMode}
                        furnitureId={moduleData.id}
                    />
                    
                    {/* 오른쪽 섹션 - 오른쪽 구획의 중앙에서 오른쪽으로 basicThickness/2만큼 이동 */}
                    <group position={[(baseFurniture.innerWidth/2 - baseFurniture.basicThickness/2)/2 + baseFurniture.basicThickness/2, 0, 0]}>
                      <SectionsRenderer
                        modelConfig={{ sections: baseFurniture.modelConfig.rightSections }}
                        height={baseFurniture.height}
                        innerWidth={baseFurniture.innerWidth/2 - baseFurniture.basicThickness/2}
                        depth={baseFurniture.depth}
                        adjustedDepthForShelves={baseFurniture.adjustedDepthForShelves}
                        basicThickness={baseFurniture.basicThickness}
                        shelfZOffset={baseFurniture.shelfZOffset}
                        material={baseFurniture.material}
                        calculateSectionHeight={baseFurniture.calculateSectionHeight}
                        mmToThreeUnits={baseFurniture.mmToThreeUnits}
                        renderMode={renderMode}
                        furnitureId={moduleData.id}
                        hideSectionDimensions={true}
                        lowerSectionTopOffsetMm={lowerSectionTopOffset}
                      />
                    </group>
                  </>
                ) : (
                  /* 싱글 가구인 경우 기존 방식 */
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
                    renderMode={renderMode}
                    furnitureId={moduleData.id}
                    lowerSectionTopOffsetMm={lowerSectionTopOffset}
                  />
                )}
              </>
          </BaseFurnitureShell>

          {/* 상부장 하단 마감재 (18mm) - 도어 색상과 동일 */}
            <FinishingPanelWithTexture
              width={baseFurniture.width}
              height={0.18}
              depth={baseFurniture.depth - 0.4} // 깊이 40mm 줄임
              position={[
                0,
                -(baseFurniture.height / 2) - 0.09, // 하단에 위치 (18mm의 절반만큼 아래로)
                0.2 // z축 앞으로 20mm 이동
              ]}
              spaceInfo={spaceInfo}
              doorColor={baseFurniture.doorColor}
              renderMode={renderMode}
              furnitureId={moduleData.id}
              isDragging={isDragging}
            />
        </>
      )}
      
      {/* 도어는 showFurniture와 관계없이 hasDoor가 true이면 항상 렌더링 (도어만 보기 위해) */}
      {hasDoor && spaceInfo && (
        <DoorModule
          moduleWidth={doorWidth || moduleData.dimensions.width}
          moduleDepth={baseFurniture.actualDepthMm}
          hingePosition={hingePosition}
          spaceInfo={spaceInfo}
          color={baseFurniture.doorColor}
          originalSlotWidth={originalSlotWidth}
          slotCenterX={slotCenterX}
          moduleData={moduleData}
          isDragging={isDragging}
          isEditMode={isEditMode}
          slotWidths={slotWidths}
          slotIndex={slotIndex}
          textureUrl={spaceInfo.materialConfig?.doorTexture}
          panelGrainDirections={panelGrainDirections}
          furnitureId={placedFurnitureId}
        />
      )}
    </>
  );
};

export default UpperCabinet;
