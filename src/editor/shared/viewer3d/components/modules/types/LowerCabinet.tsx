import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ModuleData } from '@/data/modules/shelving';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { useBaseFurniture, BaseFurnitureShell, SectionsRenderer, FurnitureTypeProps } from '../shared';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useUIStore } from '@/store/uiStore';
import DoorModule from '../DoorModule';
import FinishingPanelWithTexture from '../components/FinishingPanelWithTexture';
import BoxWithEdges from '../components/BoxWithEdges';
import { AdjustableFootsRenderer } from '../components/AdjustableFootsRenderer';

/**
 * 하부장 컴포넌트
 * - 하부장 선반형, 오픈형, 혼합형을 모두 처리
 * - 공통 렌더링 로직 사용
 * - 상부장과 동일한 구조이지만 하부장 높이(1000mm)로 렌더링
 */
const LowerCabinet: React.FC<FurnitureTypeProps> = ({
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
  renderMode: renderModeProp,
  zone // 단내림 영역 정보
}) => {
  console.log('🏠 [LowerCabinet] Props 확인:', {
    moduleId: moduleData.id,
    lowerSectionTopOffset,
    placementType: spaceInfo?.baseConfig?.placementType,
    floatHeight: spaceInfo?.baseConfig?.floatHeight
  });
  const { renderMode: contextRenderMode, viewMode } = useSpace3DView();
  const renderMode = renderModeProp || contextRenderMode;
  
  // 공통 가구 로직 사용
  const { indirectLightEnabled, indirectLightIntensity } = useUIStore();
  const baseFurniture = useBaseFurniture(moduleData, {
    color,
    internalHeight,
    customDepth,
    isDragging,
    isEditMode,
    adjustedWidth
  });

  // 띄워서 배치 여부 확인 (간접조명용)
  const placementType = spaceInfo?.baseConfig?.placementType;
  const isFloating = placementType === 'float';
  const floatHeight = isFloating ? (spaceInfo?.baseConfig?.floatHeight || 0) : 0;
  
  // 2D 모드 체크 - 2D 모드면 간접조명 안 보이게
  const is2DMode = viewMode === '2D' || viewMode !== '3D';
  const showIndirectLight = false;
  
  // 띄움 배치 시에도 캐비넷 높이는 변경하지 않음
  const adjustedHeight = baseFurniture.height;
  
  // 띄움 배치 시 Y 위치는 FurnitureItem에서 처리하므로 여기서는 0
  const cabinetYPosition = 0;
  
  // 간접조명 Y 위치 계산 (가구 바닥 바로 아래)
  const furnitureBottomY = cabinetYPosition - adjustedHeight/2;
  const lightY = furnitureBottomY - 0.5; // 가구 바닥에서 50cm 아래
  
  

  return (
    <>
      {/* 간접조명 렌더링 (띄워서 배치 시) */}
      {showIndirectLight && (
        <IndirectLight
          width={adjustedWidth ? adjustedWidth * 0.01 : baseFurniture.width} // 조정된 너비 우선 사용 (mm를 Three.js 단위로 변환)
          depth={baseFurniture.depth}
          intensity={indirectLightIntensity || 0.8}
          position={[0, lightY, 0]}
        />
      )}
      
      {/* 가구 본체는 showFurniture가 true일 때만 렌더링 */}
      {showFurniture && (
        <>
          <group position={[0, cabinetYPosition, 0]}>
            <BaseFurnitureShell
              {...baseFurniture}
              height={adjustedHeight}
              isDragging={isDragging}
              isEditMode={isEditMode}
              hasBackPanel={hasBackPanel}
              spaceInfo={spaceInfo}
              moduleData={moduleData}
              lowerSectionTopOffsetMm={lowerSectionTopOffset}
              renderMode={renderMode}
              isFloating={isFloating}>
            {/* 내부 구조는 항상 렌더링 (서랍/선반) */}
            <>
                {/* 듀얼 가구인 경우 좌우 섹션 별도 렌더링 */}
                {baseFurniture.modelConfig.leftSections && baseFurniture.modelConfig.rightSections ? (
                  <>
                    {/* 왼쪽 섹션 - 왼쪽 구획의 중앙에서 왼쪽으로 basicThickness/2만큼 이동 */}
                    <group position={[-(baseFurniture.innerWidth/2 - baseFurniture.basicThickness/2)/2 - baseFurniture.basicThickness/2, 0, 0]}>
                      <SectionsRenderer
                        modelConfig={{ sections: baseFurniture.modelConfig.leftSections }}
                        height={adjustedHeight}
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
                        lowerSectionTopOffsetMm={lowerSectionTopOffset}
                        isFloatingPlacement={isFloating}
                      />
                    </group>
                    
                    {/* 중앙 분리대 - BoxWithEdges 사용 */}
                    <BoxWithEdges
                      args={[baseFurniture.basicThickness, adjustedHeight - baseFurniture.basicThickness * 2, baseFurniture.adjustedDepthForShelves]}
                      position={[0, 0, baseFurniture.shelfZOffset]}
                      material={baseFurniture.material}
                      renderMode={renderMode}
                    />
                    
                    {/* 오른쪽 섹션 - 오른쪽 구획의 중앙에서 오른쪽으로 basicThickness/2만큼 이동 */}
                    <group position={[(baseFurniture.innerWidth/2 - baseFurniture.basicThickness/2)/2 + baseFurniture.basicThickness/2, 0, 0]}>
                      <SectionsRenderer
                        modelConfig={{ sections: baseFurniture.modelConfig.rightSections }}
                        height={adjustedHeight}
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
                        lowerSectionTopOffsetMm={lowerSectionTopOffset}
                        isFloatingPlacement={isFloating}
                      />
                    </group>
                  </>
                ) : (
                  /* 싱글 가구인 경우 기존 방식 */
                  <SectionsRenderer
                    modelConfig={baseFurniture.modelConfig}
                    height={adjustedHeight}
                    innerWidth={baseFurniture.innerWidth}
                    depth={baseFurniture.depth}
                    adjustedDepthForShelves={baseFurniture.adjustedDepthForShelves}
                    basicThickness={baseFurniture.basicThickness}
                    shelfZOffset={baseFurniture.shelfZOffset}
                    material={baseFurniture.material}
                    furnitureId={moduleData.id}
                    calculateSectionHeight={baseFurniture.calculateSectionHeight}
                    mmToThreeUnits={baseFurniture.mmToThreeUnits}
                    renderMode={renderMode}
                    lowerSectionTopOffsetMm={lowerSectionTopOffset}
                    isFloatingPlacement={isFloating}
                  />
                )}
              </>
          </BaseFurnitureShell>

          {/* 하부장 상단 마감재 (18mm) - 도어 색상과 동일 */}
            <FinishingPanelWithTexture
              width={baseFurniture.width}
              height={0.18}
              depth={baseFurniture.depth}
              position={[
                0,
                (adjustedHeight / 2) + 0.09, // 상단에 위치 (18mm의 절반만큼 위로)
                0
              ]}
              spaceInfo={spaceInfo}
              doorColor={baseFurniture.doorColor}
              renderMode={renderMode}
              isDragging={isDragging}
            />
          </group>
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
          floatHeight={spaceInfo.baseConfig?.placementType === 'float' ? floatHeight : 0}
          textureUrl={spaceInfo.materialConfig?.doorTexture}
          panelGrainDirections={panelGrainDirections}
          furnitureId={placedFurnitureId}
          zone={zone}
        />
      )}

      {/* 조절발통 (네 모서리) - 키큰장과 동일하게 처리 */}
      {showFurniture && !(lowerSectionTopOffset && lowerSectionTopOffset > 0) && (
        <AdjustableFootsRenderer
          width={adjustedWidth ? adjustedWidth * 0.01 : baseFurniture.width}
          depth={baseFurniture.depth}
          yOffset={-adjustedHeight / 2}
          renderMode={renderMode}
          isHighlighted={false}
          isFloating={isFloating}
          baseHeight={spaceInfo?.baseConfig?.height || 65}
          baseDepth={spaceInfo?.baseConfig?.depth || 0}
          viewMode={viewMode}
          view2DDirection={useUIStore.getState().view2DDirection}
        />
      )}
    </>
  );
};

export default LowerCabinet;
