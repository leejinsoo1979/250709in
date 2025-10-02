import React, { useEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useBaseFurniture, SectionsRenderer, FurnitureTypeProps, BoxWithEdges } from '../shared';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useTheme } from "@/contexts/ThemeContext";
import DoorModule from '../DoorModule';
import { AdjustableFootsRenderer } from '../components/AdjustableFootsRenderer';
import { useUIStore } from '@/store/uiStore';


/**
 * DualType4 컴포넌트
 * - 4단 서랍 + 옷장 복합형 (dual-4drawer-hanging)
 * - ID 패턴: dual-4drawer-hanging-*
 * - 구조: 하단 4단서랍 + 상단 옷장 (듀얼 타입)
 * - 특징: 표준 sections 기반, 안전선반 적용 가능
 */
const DualType4: React.FC<FurnitureTypeProps> = ({
  moduleData,
  color,
  internalHeight,
  hasDoor,
  customDepth,
  hingePosition = 'right',
  spaceInfo,
  isDragging = false,
  isEditMode = false,
  doorWidth,
  originalSlotWidth,
  slotIndex,
  slotCenterX,
  slotWidths,
  adjustedWidth // adjustedWidth 추가
}) => {
  // 공통 로직 사용
  const baseFurniture = useBaseFurniture(moduleData, {
    color,
    internalHeight,
    customDepth,
    isDragging,
    isEditMode,
    slotWidths, // 듀얼 가구의 개별 슬롯 너비 전달
    adjustedWidth // adjustedWidth 전달
  });

  const {
    width,
    height,
    depth,
    innerWidth,
    innerHeight,
    basicThickness,
    backPanelThickness,
    adjustedDepthForShelves,
    shelfZOffset,
    material,
    mmToThreeUnits,
    isMultiSectionFurniture,
    getSectionHeights
  } = baseFurniture;

  const { renderMode } = useSpace3DView();
  const { viewMode, view2DDirection } = useUIStore();
  const { theme } = useTheme();

  return (
    <group>
      {/* 좌우 측면 판재 - 섹션별 분할 또는 단일 */}
      {isMultiSectionFurniture() ? (
        // 다중 섹션: 섹션별 분할 측면 패널
        <>
          {(() => {
            // 먼저 하부 섹션 상판 Y 위치 계산 (모든 섹션에서 사용)
            const lowerSectionHeight = getSectionHeights()[0];
            const lowerSectionCenterY = -height/2 + basicThickness + lowerSectionHeight / 2 - basicThickness;
            const lowerTopPanelY = lowerSectionCenterY + lowerSectionHeight/2 + basicThickness/2 - mmToThreeUnits(9);
            
            return getSectionHeights().map((sectionHeight: number, index: number) => {
              let currentYPosition = -height/2 + basicThickness;
              
              // 현재 섹션까지의 Y 위치 계산
              for (let i = 0; i < index; i++) {
                currentYPosition += getSectionHeights()[i];
              }
              
              const sectionCenterY = currentYPosition + sectionHeight / 2 - basicThickness;
              
              return (
                <React.Fragment key={`side-panels-${index}`}>
                  {index === 0 ? (
                    // 하부 섹션: 원래 높이 그대로
                    <>
                      {/* 왼쪽 측면 판재 */}
                      <BoxWithEdges
                        args={[basicThickness, sectionHeight, depth]}
                        position={[-width/2 + basicThickness/2, sectionCenterY, 0]}
                        material={material}
                        renderMode={renderMode}
                        isDragging={isDragging}
                        isEditMode={isEditMode}
                      />
                      
                      {/* 오른쪽 측면 판재 */}
                      <BoxWithEdges
                        args={[basicThickness, sectionHeight, depth]}
                        position={[width/2 - basicThickness/2, sectionCenterY, 0]}
                        material={material}
                        renderMode={renderMode}
                        isDragging={isDragging}
                        isEditMode={isEditMode}
                      />
                    </>
                  ) : (
                    // 상부 섹션: 바닥판(18mm) 위에서 시작, 18mm 줄어든 높이
                    <>
                      {/* 왼쪽 측면 판재 - 바닥판 위에서 시작 */}
                      <BoxWithEdges
                        args={[basicThickness, sectionHeight - mmToThreeUnits(18), depth]}
                        position={[-width/2 + basicThickness/2, lowerTopPanelY + basicThickness + (sectionHeight - mmToThreeUnits(18))/2, 0]}
                        material={material}
                        renderMode={renderMode}
                        isDragging={isDragging}
                        isEditMode={isEditMode}
                      />
                      
                      {/* 오른쪽 측면 판재 - 바닥판 위에서 시작 */}
                      <BoxWithEdges
                        args={[basicThickness, sectionHeight - mmToThreeUnits(18), depth]}
                        position={[width/2 - basicThickness/2, lowerTopPanelY + basicThickness + (sectionHeight - mmToThreeUnits(18))/2, 0]}
                        material={material}
                        renderMode={renderMode}
                        isDragging={isDragging}
                        isEditMode={isEditMode}
                      />
                    </>
                  )}
                  
                  {/* 중간 구분 패널 (하부 섹션 상판) - 9mm 내림 */}
                  {index === 0 && (
                    <BoxWithEdges
                      args={[innerWidth, basicThickness, adjustedDepthForShelves - basicThickness]}
                      position={[0, lowerTopPanelY, basicThickness/2 + shelfZOffset]}
                      material={material}
                      renderMode={renderMode}
                      isDragging={isDragging}
                      isEditMode={isEditMode}
                    />
                  )}
                  
                  {/* 상부 섹션의 바닥판 - 하부 섹션 상판 바로 위 */}
                  {index === 1 && (
                    <BoxWithEdges
                      args={[innerWidth, basicThickness, adjustedDepthForShelves - basicThickness]}
                      position={[0, lowerTopPanelY + basicThickness, basicThickness/2 + shelfZOffset]}
                      material={material}
                      renderMode={renderMode}
                      isDragging={isDragging}
                      isEditMode={isEditMode}
                    />
                  )}
                </React.Fragment>
              );
            });
          })()}
        </>
      ) : (
        // 단일 섹션: 기존 통짜 측면 패널
        <>
          {/* 왼쪽 측면 판재 */}
          <BoxWithEdges
            args={[basicThickness, height, depth]}
            position={[-width/2 + basicThickness/2, 0, 0]}
            material={material}
            renderMode={renderMode}
            isDragging={isDragging}
            isEditMode={isEditMode}
          />
          
          {/* 오른쪽 측면 판재 */}
          <BoxWithEdges
            args={[basicThickness, height, depth]}
            position={[width/2 - basicThickness/2, 0, 0]}
            material={material}
            renderMode={renderMode}
            isDragging={isDragging}
            isEditMode={isEditMode}
          />
        </>
      )}
      
      {/* 상단 판재 */}
      <BoxWithEdges
        args={[innerWidth, basicThickness, depth]}
        position={[0, height/2 - basicThickness/2, 0]}
        material={material}
        renderMode={renderMode}
        isDragging={isDragging}
        isEditMode={isEditMode}
      />
      
      {/* 하단 판재 */}
      <BoxWithEdges
        args={[innerWidth, basicThickness, depth]}
        position={[0, -height/2 + basicThickness/2, 0]}
        material={material}
        renderMode={renderMode}
        isDragging={isDragging}
        isEditMode={isEditMode}
      />
      
      {/* 뒷면 판재 (9mm 얇은 백패널, 상하좌우 각 5mm 확장) */}
      <BoxWithEdges
        args={[innerWidth + mmToThreeUnits(10), innerHeight + mmToThreeUnits(10), backPanelThickness]}
        position={[0, 0, -depth/2 + backPanelThickness/2 + mmToThreeUnits(17)]}
        material={material}
        renderMode={renderMode}
        isDragging={isDragging}
        hideEdges={false} // 엣지는 표시하되
        isBackPanel={true} // 백패널임을 표시
      />
      
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
      
      {/* 도어는 항상 렌더링 (가구 식별에 중요) */}
      {hasDoor && spaceInfo && (
        <DoorModule
          moduleWidth={doorWidth || moduleData.dimensions.width}
          moduleDepth={baseFurniture.actualDepthMm}
          hingePosition={hingePosition}
          spaceInfo={spaceInfo}
          color={baseFurniture.doorColor}
          moduleData={moduleData} // 실제 듀얼캐비넷 분할 정보
          originalSlotWidth={originalSlotWidth}
          slotCenterX={slotCenterX} // FurnitureItem에서 전달받은 보정값 사용
          slotWidths={slotWidths} // 듀얼 가구의 개별 슬롯 너비들
          isDragging={isDragging}
          isEditMode={isEditMode}
        slotIndex={slotIndex}
        />
      )}
      
      {/* 조절발통 (네 모서리) */}
      <AdjustableFootsRenderer
        width={width}
        depth={depth}
        yOffset={-height / 2}
        renderMode={renderMode}
        isHighlighted={false}
        isFloating={false}
        baseHeight={spaceInfo?.baseConfig?.height || 65}
      />
    </group>
  );
};

export default DualType4; 
