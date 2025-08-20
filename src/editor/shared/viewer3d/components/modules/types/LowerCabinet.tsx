import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ModuleData } from '@/data/modules/shelving';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { useBaseFurniture, BaseFurnitureShell, SectionsRenderer, FurnitureTypeProps, BoxWithEdges } from '../shared';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useUIStore } from '@/store/uiStore';
import IndirectLight from '../IndirectLight';
import DoorModule from '../DoorModule';

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
  customDepth,
  hingePosition = 'right',
  spaceInfo,
  doorWidth,
  doorXOffset = 0,
  originalSlotWidth,
  slotIndex,
  slotCenterX,
  adjustedWidth,
  showFurniture = true,
  adjacentCabinets
}) => {
  const { renderMode, viewMode } = useSpace3DView();
  
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
  const floatHeight = spaceInfo?.baseConfig?.floatHeight || 0;
  
  // 2D 모드 체크 - 2D 모드면 간접조명 안 보이게
  const is2DMode = viewMode === '2D' || viewMode !== '3D';
  const showIndirectLight = !is2DMode && !!(isFloating && floatHeight > 0 && !isDragging && indirectLightEnabled);
  
  // 간접조명 Y 위치 계산 (가구 바닥 바로 아래)
  const furnitureBottomY = -baseFurniture.height/2;
  const lightY = furnitureBottomY - 0.5; // 가구 바닥에서 50cm 아래

  return (
    <>
      {/* 간접조명 렌더링 (띄워서 배치 시) */}
      {showIndirectLight && (
        <IndirectLight
          width={baseFurniture.innerWidth}
          depth={baseFurniture.depth}
          intensity={indirectLightIntensity || 0.8}
          position={[0, lightY, 0]}
        />
      )}
      
      {/* 가구 본체는 showFurniture가 true일 때만 렌더링 */}
      {showFurniture && (
        <>
          <BaseFurnitureShell {...baseFurniture} isDragging={isDragging} isEditMode={isEditMode}>
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
                renderMode={renderMode}
              />
            )}
          </BaseFurnitureShell>
          
          {/* 하부장 상단 마감재 (18mm) - 도어 색상과 동일 */}
          {!isDragging && (() => {
            const doorMaterial = new THREE.MeshStandardMaterial({
              color: baseFurniture.doorColor,
              metalness: 0.0,
              roughness: 0.6,
              transparent: renderMode === 'wireframe',
              opacity: renderMode === 'wireframe' ? 0.3 : 1.0,
              wireframe: renderMode === 'wireframe'
            });
            
            return (
              <BoxWithEdges
                args={[
                  baseFurniture.width,  // 전체 너비 사용
                  0.18, // 18mm
                  baseFurniture.depth
                ]}
                position={[
                  0,
                  (baseFurniture.height / 2) + 0.09, // 상단에 위치 (18mm의 절반만큼 위로)
                  0
                ]}
                material={doorMaterial}
                renderMode={renderMode}
                hideEdges={false} // 와이어프레임에서 엣지 보이도록
              />
            );
          })()}
          
          {/* 하부장 측면 엔드패널 - 키큰장/듀얼장과 인접한 경우 */}
          {!isDragging && adjacentCabinets?.hasAdjacentUpperLower && adjacentCabinets?.adjacentSide && (() => {
            const endPanelMaterial = new THREE.MeshStandardMaterial({
              color: baseFurniture.doorColor,
              metalness: 0.0,
              roughness: 0.6,
              transparent: renderMode === 'wireframe',
              opacity: renderMode === 'wireframe' ? 0.3 : 1.0,
              wireframe: renderMode === 'wireframe'
            });
            
            const endPanelX = adjacentCabinets.adjacentSide === 'left' 
              ? -(baseFurniture.width / 2) - 0.09  // 왼쪽 엔드패널 (18mm의 절반)
              : (baseFurniture.width / 2) + 0.09;   // 오른쪽 엔드패널 (18mm의 절반)
            
            console.log('🎨 하부장 엔드패널 렌더링:', {
              moduleId: moduleData.id,
              side: adjacentCabinets.adjacentSide,
              endPanelX,
              width: baseFurniture.width,
              height: baseFurniture.height
            });
            
            return (
              <BoxWithEdges
                isEndPanel={true}
                args={[
                  0.18,  // 두께 18mm
                  baseFurniture.height,  // 가구와 같은 높이
                  baseFurniture.depth     // 가구와 같은 깊이
                ]}
                position={[endPanelX, 0, 0]}
                material={endPanelMaterial}
                renderMode={renderMode}
                hideEdges={false}
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
          slotIndex={slotIndex}
        />
      )}
    </>
  );
};

export default LowerCabinet;