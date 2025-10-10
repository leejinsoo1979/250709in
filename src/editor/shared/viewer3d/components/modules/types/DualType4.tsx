import React, { useEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { Text, Line } from '@react-three/drei';
import { useBaseFurniture, SectionsRenderer, FurnitureTypeProps, BoxWithEdges } from '../shared';
import { useDimensionColor } from '../hooks/useDimensionColor';
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
  adjustedWidth, // adjustedWidth 추가
  customSections, // 사용자 정의 섹션 설정
  placedFurnitureId
}) => {
  // 공통 로직 사용
  const baseFurniture = useBaseFurniture(moduleData, {
    color,
    internalHeight,
    customDepth,
    isDragging,
    isEditMode,
    slotWidths, // 듀얼 가구의 개별 슬롯 너비 전달
    adjustedWidth, // adjustedWidth 전달
    customSections // 사용자 정의 섹션 설정
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

  const { renderMode, viewMode } = useSpace3DView();
  const { view2DDirection, showDimensions, showDimensionsText, highlightedSection } = useUIStore();
  const { theme } = useTheme();
  const { dimensionColor, baseFontSize } = useDimensionColor();

  return (
    <group>
      {/* 좌우 측면 판재 - 섹션별 분할 또는 단일 */}
      {isMultiSectionFurniture() ? (
        // 다중 섹션: 섹션별 분할 측면 패널
        <>
          {(() => {
            // 하부 측판 높이 = 1000mm
            const drawerSectionHeight = mmToThreeUnits(1000);
            const hangingSectionHeight = getSectionHeights()[1];
            // 중간 패널 위치: 하부 측판 상단(1000mm)에서 패널 두께 절반만 빼기
            const lowerTopPanelY = -height/2 + drawerSectionHeight - basicThickness/2;
            const lowerPanelY = -height/2 + drawerSectionHeight/2;
            const upperPanelY = -height/2 + drawerSectionHeight + hangingSectionHeight/2;
            
            return getSectionHeights().map((sectionHeight: number, index: number) => {
              let currentYPosition = -height/2 + basicThickness;
              
              // 현재 섹션까지의 Y 위치 계산
              for (let i = 0; i < index; i++) {
                currentYPosition += getSectionHeights()[i];
              }
              
              const sectionCenterY = currentYPosition + sectionHeight / 2 - basicThickness;
              
              // 섹션별 강조 확인
              const isSectionHighlighted = highlightedSection === `${placedFurnitureId}-${index}`;

              return (
                <React.Fragment key={`side-panels-${index}`}>
                  {index === 0 ? (
                    // 하부 섹션: 1000mm + 18mm
                    <>
                      {/* 왼쪽 측면 판재 */}
                      <BoxWithEdges
                        args={[basicThickness, drawerSectionHeight, depth]}
                        position={[-width/2 + basicThickness/2, lowerPanelY, 0]}
                        material={material}
                        renderMode={renderMode}
                        isDragging={isDragging}
                        isEditMode={isEditMode}
                        isHighlighted={isSectionHighlighted}
                      />

                      {/* 오른쪽 측면 판재 */}
                      <BoxWithEdges
                        args={[basicThickness, drawerSectionHeight, depth]}
                        position={[width/2 - basicThickness/2, lowerPanelY, 0]}
                        material={material}
                        renderMode={renderMode}
                        isDragging={isDragging}
                        isEditMode={isEditMode}
                        isHighlighted={isSectionHighlighted}
                      />
                    </>
                  ) : (
                    // 상부 섹션: 18mm 줄어든 높이
                    <>
                      {/* 왼쪽 측면 판재 */}
                      <BoxWithEdges
                        args={[basicThickness, hangingSectionHeight, depth]}
                        position={[-width/2 + basicThickness/2, upperPanelY, 0]}
                        material={material}
                        renderMode={renderMode}
                        isDragging={isDragging}
                        isEditMode={isEditMode}
                        isHighlighted={isSectionHighlighted}
                      />

                      {/* 오른쪽 측면 판재 */}
                      <BoxWithEdges
                        args={[basicThickness, hangingSectionHeight, depth]}
                        position={[width/2 - basicThickness/2, upperPanelY, 0]}
                        material={material}
                        renderMode={renderMode}
                        isDragging={isDragging}
                        isEditMode={isEditMode}
                        isHighlighted={isSectionHighlighted}
                      />
                    </>
                  )}
                  
                  {/* 중간 구분 패널 (하부 섹션 상판) - 원래 위치 */}
                  {index === 0 && (
                    <BoxWithEdges
                      args={[innerWidth, basicThickness, adjustedDepthForShelves - basicThickness]}
                      position={[0, lowerTopPanelY, basicThickness/2 + shelfZOffset]}
                      material={material}
                      renderMode={renderMode}
                      isDragging={isDragging}
                      isEditMode={isEditMode}
                      isHighlighted={highlightedSection === `${placedFurnitureId}-0`}
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
                      isHighlighted={highlightedSection === `${placedFurnitureId}-1`}
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
        isHighlighted={isMultiSectionFurniture() ? highlightedSection === `${placedFurnitureId}-1` : false}
      />
      
      {/* Type4 상단 상판 두께 치수 표시 */}
      {moduleData?.id?.includes('4drawer-hanging') && showDimensions && showDimensionsText && (
        <group>
          {/* 상판 두께 텍스트 */}
          <Text
            position={[
              viewMode === '3D' ? -innerWidth/2 * 0.3 - 0.8 : -innerWidth/2 * 0.3 - 0.5,
              height/2 - basicThickness/2,
              viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0
            ]}
            fontSize={baseFontSize}
            color={dimensionColor}
            anchorX="center"
            anchorY="middle"
            rotation={[0, 0, Math.PI / 2]}
            renderOrder={999}
            depthTest={false}
          >
            {Math.round(basicThickness * 100)}
          </Text>
          
          {/* 상판 두께 수직선 */}
          <Line
            points={[
              [-innerWidth/2 * 0.3, height/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0],
              [-innerWidth/2 * 0.3, height/2 - basicThickness, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]
            ]}
            color={dimensionColor}
            lineWidth={1}
          />
          {/* 수직선 양끝 점 */}
          <mesh position={[-innerWidth/2 * 0.3, height/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshBasicMaterial color={dimensionColor} />
          </mesh>
          <mesh position={[-innerWidth/2 * 0.3, height/2 - basicThickness, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshBasicMaterial color={dimensionColor} />
          </mesh>
        </group>
      )}
      
      {/* 하단 판재 */}
      <BoxWithEdges
        args={[innerWidth, basicThickness, depth]}
        position={[0, -height/2 + basicThickness/2, 0]}
        material={material}
        renderMode={renderMode}
        isDragging={isDragging}
        isEditMode={isEditMode}
        isHighlighted={isMultiSectionFurniture() ? highlightedSection === `${placedFurnitureId}-0` : false}
      />
      
      {/* 뒷면 판재 (9mm 백패널, 섹션별로 분리) */}
      {isMultiSectionFurniture() ? (
        // 다중 섹션: 하부/상부 백패널 분리
        <>
          {(() => {
            const lowerSectionHeight = mmToThreeUnits(1000);
            const upperSectionHeight = getSectionHeights()[1];

            // 백패널 높이 = 섹션 내경높이 + 10mm
            // 내경높이 = 섹션높이 - 상하판(36mm)
            const lowerInnerHeight = lowerSectionHeight - basicThickness * 2;
            const upperInnerHeight = upperSectionHeight - basicThickness * 2;
            const lowerBackPanelHeight = lowerInnerHeight + mmToThreeUnits(10);
            const upperBackPanelHeight = upperInnerHeight + mmToThreeUnits(10);

            // 백패널 Y 위치
            const lowerBackPanelY = -height/2 + basicThickness + lowerInnerHeight/2;
            const upperBackPanelY = -height/2 + lowerSectionHeight + basicThickness + upperInnerHeight/2;

            return (
              <>
                {/* 하부 섹션 백패널 */}
                <BoxWithEdges
                  args={[innerWidth + mmToThreeUnits(10), lowerBackPanelHeight, backPanelThickness]}
                  position={[0, lowerBackPanelY, -depth/2 + backPanelThickness/2 + mmToThreeUnits(17)]}
                  material={material}
                  renderMode={renderMode}
                  isDragging={isDragging}
                  isBackPanel={true}
                  isHighlighted={highlightedSection === `${placedFurnitureId}-0`}
                />

                {/* 상부 섹션 백패널 */}
                <BoxWithEdges
                  args={[innerWidth + mmToThreeUnits(10), upperBackPanelHeight, backPanelThickness]}
                  position={[0, upperBackPanelY, -depth/2 + backPanelThickness/2 + mmToThreeUnits(17)]}
                  material={material}
                  renderMode={renderMode}
                  isDragging={isDragging}
                  isBackPanel={true}
                  isHighlighted={highlightedSection === `${placedFurnitureId}-1`}
                />
              </>
            );
          })()}
        </>
      ) : (
        // 단일 섹션: 기존 통짜 백패널
        <BoxWithEdges
          args={[innerWidth + mmToThreeUnits(10), innerHeight + mmToThreeUnits(10), backPanelThickness]}
          position={[0, 0, -depth/2 + backPanelThickness/2 + mmToThreeUnits(17)]}
          material={material}
          renderMode={renderMode}
          isDragging={isDragging}
          isBackPanel={true}
        />
      )}
      
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
          mmToThreeUnits={baseFurniture.mmToThreeUnits}
          renderMode={renderMode}
          furnitureId={moduleData.id}
          placedFurnitureId={placedFurnitureId}
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
        viewMode={viewMode}
        view2DDirection={view2DDirection}
      />
    </group>
  );
};

export default DualType4; 
