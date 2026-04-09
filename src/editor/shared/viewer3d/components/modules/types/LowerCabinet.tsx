import React, { useMemo, useEffect, useRef } from 'react';
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
import { isCabinetTexture1, applyCabinetTexture1Settings, isOakTexture, applyOakTextureSettings, applyDefaultImageTextureSettings } from '@/editor/shared/utils/materialConstants';

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
  parentGroupY,
  doorTopGap,
  doorBottomGap
}) => {
  console.log('🏠 [LowerCabinet] Props 확인:', {
    moduleId: moduleData.id,
    lowerSectionTopOffset,
    placementType: spaceInfo?.baseConfig?.placementType,
    floatHeight: spaceInfo?.baseConfig?.floatHeight,
    hideTopPanel: !moduleData.id.includes('lower-door-lift-') && !moduleData.id.includes('lower-top-down-'),
    hasSideNotches: moduleData.id.includes('lower-door-lift-2tier') || moduleData.id.includes('lower-door-lift-3tier') || moduleData.id.includes('lower-drawer-') || moduleData.id.includes('lower-top-down-'),
  });
  const { renderMode: contextRenderMode, viewMode } = useSpace3DView();
  const renderMode = renderModeProp || contextRenderMode;
  
  // 공통 가구 로직 사용
  const { indirectLightEnabled, indirectLightIntensity, view2DDirection } = useUIStore();
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

  // 상판내림 반통/한통 L프레임용 도어 재질 (텍스처 로드 포함)
  const doorTextureUrl = spaceInfo?.materialConfig?.doorTexture;
  const doorColorVal = baseFurniture.doorColor || '#E0E0E0';
  const doorMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const lFrameDoorMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(doorColorVal),
      metalness: 0.0,
      roughness: 0.6,
      envMapIntensity: 0.0,
    });
    doorMaterialRef.current = mat;
    return mat;
  }, []);

  useEffect(() => {
    if (doorMaterialRef.current) {
      if (!doorMaterialRef.current.map) {
        doorMaterialRef.current.color.set(doorColorVal);
      }
      doorMaterialRef.current.needsUpdate = true;
    }
  }, [doorColorVal]);

  useEffect(() => {
    const mat = doorMaterialRef.current;
    if (!mat) return;
    if (doorTextureUrl) {
      if (isOakTexture(doorTextureUrl)) {
        applyOakTextureSettings(mat);
      } else if (isCabinetTexture1(doorTextureUrl)) {
        applyCabinetTexture1Settings(mat);
      }
      const loader = new THREE.TextureLoader();
      loader.load(doorTextureUrl, (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1);
        mat.map = texture;
        if (isOakTexture(doorTextureUrl)) {
          applyOakTextureSettings(mat);
        } else if (isCabinetTexture1(doorTextureUrl)) {
          applyCabinetTexture1Settings(mat);
        } else {
          applyDefaultImageTextureSettings(mat);
        }
        mat.needsUpdate = true;
        requestAnimationFrame(() => { mat.needsUpdate = true; });
      });
    } else {
      if (mat.map) {
        mat.map.dispose();
        mat.map = null;
      }
      mat.color.set(doorColorVal);
      mat.toneMapped = true;
      mat.roughness = 0.6;
      mat.needsUpdate = true;
    }
  }, [doorTextureUrl, doorColorVal]);

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
              hideTopPanel={!moduleData.id.includes('lower-door-lift-') && !moduleData.id.includes('lower-top-down-')}
              topPanelFrontReduction={moduleData.id.includes('lower-top-down-') ? 18.5 : 0}
              topStretcher={moduleData.id.includes('lower-top-down-') ? { heightMm: 55, depthMm: 40 } : undefined}
              {...(moduleData.id.includes('lower-drawer-3tier') ? {
                sideNotches: [{ y: 65, z: 40, fromBottom: 295 }, { y: 65, z: 40, fromBottom: 510 }]
              } : moduleData.id.includes('lower-drawer-2tier') ? {
                sideNotches: [{ y: 65, z: 40, fromBottom: (moduleData.dimensions.height - 125) / 2 }]
              } : moduleData.id.includes('lower-door-lift-3tier') ? {
                sideNotches: [{ y: 65, z: 40, fromBottom: 315 }, { y: 65, z: 40, fromBottom: 545 }]
              } : moduleData.id.includes('lower-door-lift-2tier') ? {
                sideNotches: [{ y: 65, z: 40, fromBottom: 355 }]
              } : moduleData.id.includes('lower-top-down-3tier') ? {
                sideNotches: [{ y: 65, z: 40, fromBottom: 225 }, { y: 65, z: 40, fromBottom: 445 }, { y: 65, z: 40, fromBottom: 665 }]
              } : moduleData.id.includes('lower-top-down-2tier') ? {
                sideNotches: [{ y: 65, z: 40, fromBottom: 300 }, { y: 65, z: 40, fromBottom: 665 }]
              } : (moduleData.id.includes('lower-top-down-half') || moduleData.id.includes('dual-lower-top-down-half')) ? {
                sideNotches: [{ y: 65, z: 40, fromBottom: 665 }]
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

          {/* 다보 선반 렌더링 (하부장 반통·한통, 도어올림/상판내림 반통·한통) — 탑뷰에서는 숨김 */}
          {(() => {
            if (viewMode === '2D' && view2DDirection === 'top') return null;
            const moduleId = moduleData.id;
            const isLowerHalf = moduleId.includes('lower-half-cabinet') || moduleId.includes('dual-lower-half-cabinet');
            const isDoorLiftHalf = moduleId.includes('lower-door-lift-half') || moduleId.includes('dual-lower-door-lift-half');
            const isTopDownHalf = moduleId.includes('lower-top-down-half') || moduleId.includes('dual-lower-top-down-half');
            if (!isLowerHalf && !isDoorLiftHalf && !isTopDownHalf) return null;

            const mmToUnits = (mm: number) => mm * 0.01;
            const basicThicknessMm = baseFurniture.basicThickness / 0.01;
            const cabinetHeightMm = adjustedHeight / 0.01;
            const depthMm = baseFurniture.depth / 0.01;
            const backPanelMm = (backPanelThickness || 9);

            let referenceHeightMm: number;
            const hasTopPanel = isDoorLiftHalf || isTopDownHalf;

            if (isTopDownHalf) {
              referenceHeightMm = 665;
            } else if (hasTopPanel) {
              referenceHeightMm = cabinetHeightMm - basicThicknessMm * 2;
            } else {
              referenceHeightMm = cabinetHeightMm - basicThicknessMm;
            }

            const shelfInterval = referenceHeightMm / 3;
            const shelfPositions = [shelfInterval, shelfInterval * 2];

            const shelfThicknessMm = 18;
            const shelfFrontInsetMm = 30; // 앞에서 30mm 들여보냄
            const backReductionMm = backPanelMm + basicThicknessMm - 1; // 26mm (바닥판과 동일)
            const shelfDepthMm = depthMm - backReductionMm - shelfFrontInsetMm;
            const shelfWidth = baseFurniture.innerWidth;
            const shelfDepth = mmToUnits(shelfDepthMm);
            const shelfThickness = mmToUnits(shelfThicknessMm);

            const shelfZ = (mmToUnits(backReductionMm) - mmToUnits(shelfFrontInsetMm)) / 2; // 뒤에서 26mm 줄이고 앞에서 30mm 들여보냄

            const cabinetBottomY = -adjustedHeight / 2;
            const bottomPanelTopY = cabinetBottomY + baseFurniture.basicThickness;

            return shelfPositions.map((posFromBottom, idx) => (
              <BoxWithEdges
                key={`dowel-shelf-${idx}`}
                args={[shelfWidth, shelfThickness, shelfDepth]}
                position={[0, bottomPanelTopY + mmToUnits(posFromBottom), shelfZ]}
                material={baseFurniture.material}
                renderMode={renderMode}
                isHighlighted={false}
                panelName={`다보선반(${idx + 1})`}
                furnitureId={placedFurnitureId}
              />
            ));
          })()}

          </BaseFurnitureShell>

          {/* 하부장 상판 마감재 제거 - 하부모듈에는 상판 없음 */}
          </group>
        </>
      )}
      
      {/* 외부서랍 렌더링 (하부 서랍장 전용) */}
      {showFurniture && (moduleData.id.includes('lower-drawer-') || moduleData.id.includes('lower-door-lift-2tier') || moduleData.id.includes('lower-door-lift-3tier') || moduleData.id.includes('lower-top-down-2tier') || moduleData.id.includes('lower-top-down-3tier')) && (() => {
        const is3Tier = moduleData.id.includes('lower-drawer-3tier');
        const isDoorLift3Tier = moduleData.id.includes('lower-door-lift-3tier');
        const isDoorLift2Tier = moduleData.id.includes('lower-door-lift-2tier');
        const isTopDown3Tier = moduleData.id.includes('lower-top-down-3tier');
        const isTopDown2Tier = moduleData.id.includes('lower-top-down-2tier');
        // 기존 서랍장: 상단 따내기 60mm 있음. 2단 fromBottom=330(균등), 3단 fromBottom=295+510
        // 도어올림 3단: fromBottom=315, 545 (1단=315, 따내기65, 2단=165, 따내기65, 3단=175)
        // 도어올림 2단: fromBottom=355
        // 상판내림 3단: fromBottom=225, 445, 665 (1단=225, 따내기65, 2단=155, 따내기65, 3단=155, 따내기65, 상단55)
        // 상판내림 2단: fromBottom=300, 665 (1단=300, 따내기65, 2단=300, 따내기65, 상단55)
        const drawer2TierFromBottom = (moduleData.dimensions.height - 125) / 2;
        const notchFromBottoms = is3Tier ? [295, 510] : isDoorLift3Tier ? [315, 545] : isDoorLift2Tier ? [355] : isTopDown3Tier ? [225, 445, 665] : isTopDown2Tier ? [300, 665] : [drawer2TierFromBottom];
        const notchHeights = is3Tier ? [65, 65] : isDoorLift3Tier ? [65, 65] : isDoorLift2Tier ? [65] : isTopDown3Tier ? [65, 65, 65] : isTopDown2Tier ? [65, 65] : [65];
        const drawerCount = (is3Tier || isDoorLift3Tier || isTopDown3Tier) ? 3 : 2;

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
              hideTopNotch={isDoorLift2Tier || isDoorLift3Tier || isTopDown2Tier || isTopDown3Tier}
              maidaHeightsMm={isDoorLift2Tier ? [400, 400] : isDoorLift3Tier ? [360, 210, 210] : undefined}
              sideHeightOverrides={isTopDown2Tier ? { all: 240 } : isTopDown3Tier ? { first: 180, rest: 130 } : undefined}
              doorTopGap={doorTopGap}
              doorBottomGap={doorBottomGap}
              defaultDoorTopGap={isTopDown2Tier || isTopDown3Tier ? -80 : isDoorLift2Tier || isDoorLift3Tier ? 30 : -20}
              defaultDoorBottomGap={5}
            />
          </group>
        );
      })()}

      {/* 상판내림 반통/한통: L자 프레임만 렌더링 (서랍 없음, 도어는 별도) */}
      {showFurniture && (moduleData.id.includes('lower-top-down-half') || moduleData.id.includes('dual-lower-top-down-half')) && (() => {
        const mmToThreeUnits = (mm: number) => mm * 0.01;
        const notch = { fromBottom: 665, height: 65 };
        const basicThicknessMm = baseFurniture.basicThickness / 0.01;
        const frameWidth = mmToThreeUnits(adjustedWidth || moduleData.dimensions.width);
        const verticalHMm = notch.height - basicThicknessMm;
        const cabinetBottomY = -adjustedHeight / 2;
        const horzY = cabinetBottomY + mmToThreeUnits(notch.fromBottom) + baseFurniture.basicThickness / 2;
        const horzZ = baseFurniture.depth / 2 - mmToThreeUnits(40) / 2;
        const vertY = cabinetBottomY + mmToThreeUnits(notch.fromBottom) + baseFurniture.basicThickness + mmToThreeUnits(verticalHMm) / 2;
        const vertZ = baseFurniture.depth / 2 - mmToThreeUnits(40) + baseFurniture.basicThickness / 2;

        return (
          <group position={[0, 0, 0]}>
            <BoxWithEdges
              args={[frameWidth, baseFurniture.basicThickness, mmToThreeUnits(40)]}
              position={[0, horzY, horzZ]}
              material={lFrameDoorMaterial}
              renderMode={renderMode}
              isHighlighted={false}
              panelName="목찬넬프레임수평(1)"
              panelGrainDirections={panelGrainDirections}
              furnitureId={placedFurnitureId}
            />
            <BoxWithEdges
              args={[frameWidth, mmToThreeUnits(verticalHMm), baseFurniture.basicThickness]}
              position={[0, vertY, vertZ]}
              material={lFrameDoorMaterial}
              renderMode={renderMode}
              isHighlighted={false}
              panelName="목찬넬프레임수직(1)"
              panelGrainDirections={panelGrainDirections}
              furnitureId={placedFurnitureId}
            />
          </group>
        );
      })()}

      {/* 기본하부장 반통/한통: 상단 따내기 L자 프레임 렌더링 */}
      {showFurniture && (moduleData.id.includes('lower-half-cabinet') || moduleData.id.includes('dual-lower-half-cabinet')) && (() => {
        const mmToThreeUnits = (mm: number) => mm * 0.01;
        const cabinetHeight = adjustedHeight;
        const notchHeightMm = 60;
        const notchFromBottomMm = (moduleData.dimensions.height || 785) - notchHeightMm;
        const basicThicknessMm = baseFurniture.basicThickness / 0.01;
        const frameWidth = mmToThreeUnits(adjustedWidth || moduleData.dimensions.width);
        const verticalHMm = notchHeightMm - basicThicknessMm;
        const cabinetBottomY = -cabinetHeight / 2;
        const horzY = cabinetBottomY + mmToThreeUnits(notchFromBottomMm) + baseFurniture.basicThickness / 2;
        const horzZ = baseFurniture.depth / 2 - mmToThreeUnits(40) / 2;
        const vertY = cabinetBottomY + mmToThreeUnits(notchFromBottomMm) + baseFurniture.basicThickness + mmToThreeUnits(verticalHMm) / 2;
        const vertZ = baseFurniture.depth / 2 - mmToThreeUnits(40) + baseFurniture.basicThickness / 2;

        return (
          <group position={[0, cabinetYPosition, 0]}>
            <BoxWithEdges
              args={[frameWidth, baseFurniture.basicThickness, mmToThreeUnits(40)]}
              position={[0, horzY, horzZ]}
              material={lFrameDoorMaterial}
              renderMode={renderMode}
              isHighlighted={false}
              panelName="목찬넬프레임수평(1)"
              panelGrainDirections={panelGrainDirections}
              furnitureId={placedFurnitureId}
            />
            <BoxWithEdges
              args={[frameWidth, mmToThreeUnits(verticalHMm), baseFurniture.basicThickness]}
              position={[0, vertY, vertZ]}
              material={lFrameDoorMaterial}
              renderMode={renderMode}
              isHighlighted={false}
              panelName="목찬넬프레임수직(1)"
              panelGrainDirections={panelGrainDirections}
              furnitureId={placedFurnitureId}
            />
          </group>
        );
      })()}

      {/* 도어는 showFurniture와 관계없이 hasDoor가 true이면 항상 렌더링 (도어만 보기 위해) */}
      {/* 단, 서랍장(lower-drawer-*)은 도어가 아닌 서랍이 달리므로 도어 렌더링 차단 */}
      {hasDoor && spaceInfo && !moduleData.id.includes('lower-drawer-') && !moduleData.id.includes('lower-door-lift-2tier') && !moduleData.id.includes('lower-door-lift-3tier') && !moduleData.id.includes('lower-top-down-2tier') && !moduleData.id.includes('lower-top-down-3tier') && (
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
          doorTopGap={doorTopGap}
          doorBottomGap={doorBottomGap}
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
          frontZInset={65}
          viewMode={viewMode}
          view2DDirection={useUIStore.getState().view2DDirection}
        />
      )}
    </>
  );
};

export default LowerCabinet;
