import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ModuleData } from '@/data/modules/shelving';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { useBaseFurniture, BaseFurnitureShell, SectionsRenderer, FurnitureTypeProps } from '../shared';
import { useSpace3DView } from '../../../context/useSpace3DView';
import DoorModule from '../DoorModule';
import FinishingPanelWithTexture from '../components/FinishingPanelWithTexture';
import BoxWithEdges from '../components/BoxWithEdges';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { resolveShelfFrontInsetMm } from '@/editor/shared/utils/shelfInsetCalculator';

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
  backPanelThickness,
  renderMode: renderModeProp,
  zone, // 단내림 영역 정보
  hasBase,
  individualFloatHeight,
  parentGroupY,
  topPanelNotchSize,
  topPanelNotchSide,
  doorTopGap: doorTopGapProp,
  doorBottomGap: doorBottomGapProp,
  customSections, // 사용자 정의 섹션 (선반 갯수/위치 편집 반영)
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
    adjustedWidth,
    backPanelThicknessMm: backPanelThickness,
    customSections, // useBaseFurniture가 modelConfig.sections/leftSections/rightSections 오버라이드
  });

  // 좌/우 최외곽 상부장 자동 판별 — 서라운드 프레임 옆이면 하부마감판을 프레임 위로 확장
  const placedModulesForOuter = useFurnitureStore(state => state.placedModules);
  const outerExtendLeftUpper = useMemo(() => {
    if (!placedFurnitureId || !spaceInfo) return 0;
    const self = placedModulesForOuter.find(mm => mm.id === placedFurnitureId);
    if (!self) return 0;
    const selfId = self.moduleId || '';
    const isUpperCat = selfId.startsWith('upper-') || selfId.includes('-upper-');
    if (!isUpperCat) return 0;
    const selfW = (self.isFreePlacement && self.freeWidth) ? self.freeWidth : (self.customWidth || self.adjustedWidth || self.moduleWidth || 0);
    const selfCx = Math.round(self.position.x * 100);
    const selfLeft = selfCx - selfW / 2;
    const halfSpaceMm = (spaceInfo.width || 0) / 2;
    const leftFrameMM = spaceInfo.frameSize?.left || 0;
    const leftBoundaryMm = -halfSpaceMm + leftFrameMM;
    const isAdjLeft = Math.abs(selfLeft - leftBoundaryMm) <= 1;
    return isAdjLeft ? leftFrameMM : 0;
  }, [placedModulesForOuter, placedFurnitureId, spaceInfo?.frameSize?.left, spaceInfo?.width]);
  const outerExtendRightUpper = useMemo(() => {
    if (!placedFurnitureId || !spaceInfo) return 0;
    const self = placedModulesForOuter.find(mm => mm.id === placedFurnitureId);
    if (!self) return 0;
    const selfId = self.moduleId || '';
    const isUpperCat = selfId.startsWith('upper-') || selfId.includes('-upper-');
    if (!isUpperCat) return 0;
    const selfW = (self.isFreePlacement && self.freeWidth) ? self.freeWidth : (self.customWidth || self.adjustedWidth || self.moduleWidth || 0);
    const selfCx = Math.round(self.position.x * 100);
    const selfRight = selfCx + selfW / 2;
    const halfSpaceMm = (spaceInfo.width || 0) / 2;
    const rightFrameMM = spaceInfo.frameSize?.right || 0;
    const rightBoundaryMm = halfSpaceMm - rightFrameMM;
    const isAdjRight = Math.abs(selfRight - rightBoundaryMm) <= 1;
    return isAdjRight ? rightFrameMM : 0;
  }, [placedModulesForOuter, placedFurnitureId, spaceInfo?.frameSize?.right, spaceInfo?.width]);

  // 간접조명은 UpperCabinetIndirectLight 컴포넌트에서 통합 관리
  // 개별 상부장에서는 간접조명을 렌더링하지 않음

  // 듀얼 섹션 레이아웃 계산
  const isDual = !!(baseFurniture.modelConfig.leftSections && baseFurniture.modelConfig.rightSections);
  const isOpenType = moduleData.id.includes('dual-upper-cabinet-open');
  const sectionWidth = isDual
    ? (isOpenType ? baseFurniture.innerWidth / 2 : baseFurniture.innerWidth / 2 - baseFurniture.basicThickness / 2)
    : baseFurniture.innerWidth;
  const leftX = isOpenType
    ? -baseFurniture.innerWidth / 4
    : -(sectionWidth / 2 + baseFurniture.basicThickness / 2);
  const rightX = isOpenType
    ? baseFurniture.innerWidth / 4
    : (sectionWidth / 2 + baseFurniture.basicThickness / 2);

  return (
    <>
      {/* 간접조명은 UpperCabinetIndirectLight 컴포넌트에서 통합 렌더링 */}
      
      {/* 가구 본체는 showFurniture가 true일 때만 렌더링 */}
      {showFurniture && (
        <>
          <BaseFurnitureShell {...baseFurniture} isDragging={isDragging} isEditMode={isEditMode} hasBackPanel={hasBackPanel} isFloating={true} spaceInfo={spaceInfo} moduleData={moduleData} lowerSectionTopOffsetMm={lowerSectionTopOffset} renderMode={renderMode} topPanelNotchSize={topPanelNotchSize} topPanelNotchSide={topPanelNotchSide}>
            {/* 내부 구조는 항상 렌더링 (서랍/선반) */}
            <>
                {/* 듀얼 가구도 칸막이 없이 전체 너비로 선반 렌더링 */}
                {isDual ? (
                  <SectionsRenderer
                    modelConfig={{ sections: baseFurniture.modelConfig.leftSections! }}
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
                    isFloatingPlacement={spaceInfo?.baseConfig?.placementType === 'float'}
                    shelfFrontInsetMm={resolveShelfFrontInsetMm({
                      moduleId: moduleData.id,
                      cabinetCategory: moduleData.category,
                      depthMm: baseFurniture?.actualDepthMm
                    })}
                  />
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
                    isFloatingPlacement={spaceInfo?.baseConfig?.placementType === 'float'}
                    shelfFrontInsetMm={resolveShelfFrontInsetMm({
                      moduleId: moduleData.id,
                      cabinetCategory: moduleData.category,
                      depthMm: baseFurniture?.actualDepthMm
                    })}
                  />
                )}
              </>
          </BaseFurnitureShell>

          {/* 상부장 하단 마감재 (18mm) - 도어 색상과 동일 — 하부 EP 체크 해제 시 미렌더 */}
            {(() => {
              const selfMod = placedFurnitureId
                ? placedModulesForOuter.find(mm => mm.id === placedFurnitureId)
                : null;
              const hasBottomEP = (selfMod as any)?.hasBottomEndPanel !== false;
              if (!hasBottomEP) return null;
              // 사용자 입력 갭 (전면갭=앞에서 들이기, 후면갭=뒤에서 들이기, mm)
              // 기본값: 전면 0mm, 후면 35mm (사용자가 입력 안 하면 후면 35mm 적용)
              const FRONT_GAP_DEFAULT_MM = 0;
              const BACK_GAP_DEFAULT_MM = 35;
              const frontGapMm = (selfMod as any)?.bottomEndPanelOffset ?? FRONT_GAP_DEFAULT_MM;
              const backGapMm = (selfMod as any)?.bottomEndPanelBackOffset ?? BACK_GAP_DEFAULT_MM;
              const leftExtMm = outerExtendLeftUpper;
              const rightExtMm = outerExtendRightUpper;
              const leftExt = leftExtMm * 0.01;
              const rightExt = rightExtMm * 0.01;
              const extendedWidth = baseFurniture.width + leftExt + rightExt;
              const xOffset = (rightExt - leftExt) / 2;
              const frontGap = frontGapMm * 0.01;
              const backGap = backGapMm * 0.01;
              const panelFrontZ = baseFurniture.depth / 2 - frontGap;
              const panelBackZ = -baseFurniture.depth / 2 + backGap;
              const panelDepth = panelFrontZ - panelBackZ;
              const panelCenterZ = (panelFrontZ + panelBackZ) / 2;
              return (
            <FinishingPanelWithTexture
              width={extendedWidth}
              height={0.18}
              depth={panelDepth}
              position={[
                xOffset,
                -(baseFurniture.height / 2) - 0.09,
                panelCenterZ
              ]}
              spaceInfo={spaceInfo}
              doorColor={baseFurniture.doorColor}
              renderMode={renderMode}
              furnitureId={moduleData.id}
              isDragging={isDragging}
              isEditMode={isEditMode}
              panelName="하부마감판"
            />
              );
            })()}
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
          floatHeight={spaceInfo.baseConfig?.placementType === 'float' ? (spaceInfo.baseConfig?.floatHeight || 0) : 0}
          zone={zone}
          hasBase={hasBase}
          individualFloatHeight={individualFloatHeight}
          parentGroupY={parentGroupY}
          doorTopGap={doorTopGapProp}
          doorBottomGap={doorBottomGapProp}
        />
      )}
    </>
  );
};

export default UpperCabinet;
