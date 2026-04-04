import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ModuleData } from '@/data/modules/shelving';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { useBaseFurniture, BaseFurnitureShell, SectionsRenderer, FurnitureTypeProps } from '../shared';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useUIStore } from '@/store/uiStore';
import DoorModule from '../DoorModule';
import BoxWithEdges from '../components/BoxWithEdges';
import { AdjustableFootsRenderer } from '../components/AdjustableFootsRenderer';
import { ExternalDrawerRenderer } from '../ExternalDrawerRenderer';

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
  backPanelThickness,
  renderMode: renderModeProp,
  zone, // 단내림 영역 정보
  hasBase,
  individualFloatHeight,
  parentGroupY
}) => {
  console.log('🏠 [LowerCabinet] Props 확인:', {
    moduleId: moduleData.id,
    lowerSectionTopOffset,
    placementType: spaceInfo?.baseConfig?.placementType,
    floatHeight: spaceInfo?.baseConfig?.floatHeight,
    hideTopPanel: !moduleData.id.includes('lower-door-lift-'),
    hasSideNotches: moduleData.id.includes('lower-door-lift-2tier') || moduleData.id.includes('lower-door-lift-3tier') || moduleData.id.includes('lower-drawer-'),
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
    adjustedWidth,
    backPanelThicknessMm: backPanelThickness
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
              isFloating={isFloating}
              hideVentilationCap={true}
              hideTopPanel={!moduleData.id.includes('lower-door-lift-')}
              {...(moduleData.id.includes('lower-drawer-3tier') ? {
                sideNotches: [{ y: 65, z: 40, fromBottom: 295 }, { y: 65, z: 40, fromBottom: 510 }]
              } : moduleData.id.includes('lower-drawer-2tier') ? {
                sideNotches: [{ y: 65, z: 40, fromBottom: 330 }]
              } : moduleData.id.includes('lower-door-lift-3tier') ? {
                sideNotches: [{ y: 65, z: 40, fromBottom: 314 }, { y: 65, z: 40, fromBottom: 544 }]
              } : moduleData.id.includes('lower-door-lift-2tier') ? {
                sideNotches: [{ y: 65, z: 40, fromBottom: 355 }]
              } : {})}>
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
                      furnitureId={placedFurnitureId}
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

          {/* 하부장 상판 마감재 제거 - 하부모듈에는 상판 없음 */}
          </group>
        </>
      )}
      
      {/* 외부서랍 렌더링 (하부 서랍장 전용) */}
      {showFurniture && (moduleData.id.includes('lower-drawer-') || moduleData.id.includes('lower-door-lift-2tier') || moduleData.id.includes('lower-door-lift-3tier')) && (() => {
        const is3Tier = moduleData.id.includes('lower-drawer-3tier');
        const isDoorLift3Tier = moduleData.id.includes('lower-door-lift-3tier');
        const isDoorLift2Tier = moduleData.id.includes('lower-door-lift-2tier');
        // 기존 서랍장: 상단 따내기 60mm 있음. 2단 fromBottom=330(균등), 3단 fromBottom=295+510
        // 도어올림 3단: fromBottom=314, 544 (1단=314, 따내기65, 2단=165, 따내기65, 3단=176)
        // 도어올림 2단: fromBottom=355
        const notchFromBottoms = is3Tier ? [295, 510] : isDoorLift3Tier ? [314, 544] : isDoorLift2Tier ? [355] : [330];
        const notchHeights = is3Tier ? [65, 65] : isDoorLift3Tier ? [65, 65] : isDoorLift2Tier ? [65] : [65];
        const drawerCount = (is3Tier || isDoorLift3Tier) ? 3 : 2;

        return (
          <group position={[0, cabinetYPosition, 0]}>
            <ExternalDrawerRenderer
              drawerCount={drawerCount}
              moduleWidth={adjustedWidth || moduleData.dimensions.width}
              innerWidth={baseFurniture.innerWidth}
              height={adjustedHeight}
              depth={baseFurniture.depth}
              basicThickness={baseFurniture.basicThickness}
              moduleDepthMm={baseFurniture.actualDepthMm}
              material={baseFurniture.material}
              renderMode={renderMode}
              isHighlighted={false}
              textureUrl={spaceInfo?.materialConfig?.texture}
              doorTextureUrl={spaceInfo?.materialConfig?.doorTexture}
              doorColor={baseFurniture.doorColor}
              panelGrainDirections={panelGrainDirections}
              furnitureId={placedFurnitureId}
              showMaida={hasDoor}
              notchFromBottoms={notchFromBottoms}
              notchHeights={notchHeights}
              isEditMode={isEditMode}
              hideTopNotch={isDoorLift2Tier || isDoorLift3Tier}
              maidaHeightsMm={isDoorLift2Tier ? [400, 400] : isDoorLift3Tier ? [360, 210, 210] : undefined}
            />
          </group>
        );
      })()}

      {/* 도어는 showFurniture와 관계없이 hasDoor가 true이면 항상 렌더링 (도어만 보기 위해) */}
      {/* 단, 서랍장(lower-drawer-*)은 도어가 아닌 서랍이 달리므로 도어 렌더링 차단 */}
      {hasDoor && spaceInfo && !moduleData.id.includes('lower-drawer-') && !moduleData.id.includes('lower-door-lift-2tier') && !moduleData.id.includes('lower-door-lift-3tier') && (
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
          hasBase={hasBase}
          individualFloatHeight={individualFloatHeight}
          parentGroupY={parentGroupY}
        />
      )}

      {/* 조절발통 (네 모서리) - 키큰장과 동일하게 처리 */}
      {showFurniture && !(lowerSectionTopOffset && lowerSectionTopOffset > 0) && (
        <AdjustableFootsRenderer
          width={adjustedWidth ? adjustedWidth * 0.01 : baseFurniture.width}
          depth={baseFurniture.depth}
          yOffset={-adjustedHeight / 2}
          placedFurnitureId={placedFurnitureId}
          renderMode={renderMode}
          isHighlighted={false}
          isFloating={isFloating}
          baseHeight={spaceInfo?.baseConfig?.height || 65}
          baseDepth={spaceInfo?.baseConfig?.depth || 0}
          frontZInset={83.5}
          viewMode={viewMode}
          view2DDirection={useUIStore.getState().view2DDirection}
        />
      )}
    </>
  );
};

export default LowerCabinet;
