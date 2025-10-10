import React, { useEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useBaseFurniture, SectionsRenderer, FurnitureTypeProps, BoxWithEdges } from '../shared';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useTheme } from "@/contexts/ThemeContext";
import { useUIStore } from '@/store/uiStore';
import DoorModule from '../DoorModule';
import { AdjustableFootsRenderer } from '../components/AdjustableFootsRenderer';
import { Text, Line } from '@react-three/drei';
import { useDimensionColor } from '../hooks/useDimensionColor';

/**
 * DualType2 컴포넌트
 * - 2단 옷장 (dual-2hanging)
 * - ID 패턴: dual-2hanging-*
 * - 구조: 하단 선반구역 + 상단 옷걸이구역 (듀얼 타입)
 * - 특징: 표준 sections 기반, 안전선반 적용 가능
 */
const DualType2: React.FC<FurnitureTypeProps> = ({
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
  placedFurnitureId,
  showFurniture = true // 가구 본체 표시 여부
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

  const { renderMode, viewMode } = useSpace3DView();
  const { view2DDirection, showDimensions, showDimensionsText, highlightedSection } = useUIStore();
  const { theme } = useTheme();
  const { dimensionColor, baseFontSize } = useDimensionColor();

  const sectionHeights = getSectionHeights();
  const isMulti = sectionHeights.length >= 2;

  // 디버그: showFurniture 값 확인
  useEffect(() => {
    console.log('🎨 DualType2 - showFurniture:', showFurniture, 'moduleId:', moduleData.id);
  }, [showFurniture, moduleData.id]);

  return (
    <>
      {/* 가구 본체는 showFurniture가 true일 때만 렌더링 */}
      {showFurniture && (
        <group>
          {/* 좌우 측면 판재 - 섹션별 분할 또는 단일 */}
      {isMulti ? (
        // 다중 섹션: 섹션별 분할 측면 패널
        <>
          {(() => {
            let accumulatedY = -height/2 + basicThickness;
            
            return sectionHeights.map((sectionHeight: number, index: number) => {
              // 현재 섹션의 중심 Y 위치
              const sectionCenterY = accumulatedY + sectionHeight / 2 - basicThickness;

              // 다음 섹션을 위해 누적
              accumulatedY += sectionHeight;

              // 섹션별 강조 확인
              const isSectionHighlighted = highlightedSection === `${placedFurnitureId}-${index}`;

            return (
              <React.Fragment key={`side-panels-${index}`}>
                {/* 왼쪽 측면 판재 - 섹션별로 분할 */}
                <BoxWithEdges
                  args={[basicThickness, sectionHeight, depth]}
                  position={[-width/2 + basicThickness/2, sectionCenterY, 0]}
                  material={material}
                  renderMode={renderMode}
                  isDragging={isDragging}
                  isEditMode={isEditMode}
                  isHighlighted={isSectionHighlighted}
                />

                {/* 오른쪽 측면 판재 - 섹션별로 분할 */}
                <BoxWithEdges
                  args={[basicThickness, sectionHeight, depth]}
                  position={[width/2 - basicThickness/2, sectionCenterY, 0]}
                  material={material}
                  renderMode={renderMode}
                  isDragging={isDragging}
                  isEditMode={isEditMode}
                  isHighlighted={isSectionHighlighted}
                />
                
                {/* 중간 구분 패널 (하부 섹션 상판) */}
                {index === 0 && (() => {
                  const lowerTopPanelY = sectionCenterY + sectionHeight/2 - basicThickness/2;

                  return (
                    <BoxWithEdges
                      args={[innerWidth, basicThickness, adjustedDepthForShelves - basicThickness]}
                      position={[0, lowerTopPanelY, basicThickness/2 + shelfZOffset]}
                      material={material}
                      renderMode={renderMode}
                      isDragging={isDragging}
                      isEditMode={isEditMode}
                      isHighlighted={highlightedSection === `${placedFurnitureId}-0`}
                    />
                  );
                })()}

                {/* 상부 섹션의 바닥판 - 하부 섹션 상판 바로 위 */}
                {index === 1 && (() => {
                  // 하부 섹션의 높이와 중심 위치 계산
                  const lowerSectionHeight = sectionHeights[0];
                  let lowerAccumulatedY = -height/2 + basicThickness;
                  const lowerSectionCenterY = lowerAccumulatedY + lowerSectionHeight / 2 - basicThickness;
                  const lowerTopPanelY = lowerSectionCenterY + lowerSectionHeight/2 - basicThickness/2;

                  return (
                    <>
                      {/* 상부 섹션 바닥판 */}
                      <BoxWithEdges
                        args={[innerWidth, basicThickness, adjustedDepthForShelves - basicThickness]}
                        position={[0, lowerTopPanelY + basicThickness, basicThickness/2 + shelfZOffset]}
                        material={material}
                        renderMode={renderMode}
                        isDragging={isDragging}
                        isEditMode={isEditMode}
                        isHighlighted={highlightedSection === `${placedFurnitureId}-1`}
                      />
                    
                    {/* 중간판 두께 치수 표시 */}
                    {showDimensions && showDimensionsText && (
                      <group>
                        {/* 하부 섹션 상판 두께 텍스트 */}
                        <Text
                          position={[
                            -innerWidth/2 * 0.3 - 0.5,
                            lowerTopPanelY,
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

                        {/* 하부 섹션 상판 두께 수직선 */}
                        <Line
                          points={[
                            [-innerWidth/2 * 0.3, lowerTopPanelY - basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0],
                            [-innerWidth/2 * 0.3, lowerTopPanelY + basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]
                          ]}
                          color={dimensionColor}
                          lineWidth={1}
                        />
                        {/* 하부 섹션 상판 수직선 양끝 점 */}
                        <mesh position={[-innerWidth/2 * 0.3, lowerTopPanelY - basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
                          <sphereGeometry args={[0.05, 8, 8]} />
                          <meshBasicMaterial color={dimensionColor} />
                        </mesh>
                        <mesh position={[-innerWidth/2 * 0.3, lowerTopPanelY + basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
                          <sphereGeometry args={[0.05, 8, 8]} />
                          <meshBasicMaterial color={dimensionColor} />
                        </mesh>

                        {/* 상부 섹션 바닥판 두께 텍스트 */}
                        <Text
                          position={[
                            -innerWidth/2 * 0.3 - 0.5,
                            lowerTopPanelY + basicThickness,
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

                        {/* 상부 섹션 바닥판 두께 수직선 */}
                        <Line
                          points={[
                            [-innerWidth/2 * 0.3, lowerTopPanelY + basicThickness - basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0],
                            [-innerWidth/2 * 0.3, lowerTopPanelY + basicThickness + basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]
                          ]}
                          color={dimensionColor}
                          lineWidth={1}
                        />
                        {/* 상부 섹션 바닥판 수직선 양끝 점 */}
                        <mesh position={[-innerWidth/2 * 0.3, lowerTopPanelY + basicThickness - basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
                          <sphereGeometry args={[0.05, 8, 8]} />
                          <meshBasicMaterial color={dimensionColor} />
                        </mesh>
                        <mesh position={[-innerWidth/2 * 0.3, lowerTopPanelY + basicThickness + basicThickness/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
                          <sphereGeometry args={[0.05, 8, 8]} />
                          <meshBasicMaterial color={dimensionColor} />
                        </mesh>
                      </group>
                    )}
                  </>
                  );
                })()}
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
          />
          
          {/* 오른쪽 측면 판재 */}
          <BoxWithEdges
            args={[basicThickness, height, depth]}
            position={[width/2 - basicThickness/2, 0, 0]}
            material={material}
            renderMode={renderMode}
            isDragging={isDragging}
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
        isHighlighted={isMulti ? highlightedSection === `${placedFurnitureId}-${sectionHeights.length - 1}` : false}
      />
      
      {/* 상단 상판 두께 치수 표시 */}
      {showDimensions && showDimensionsText && (
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
        isHighlighted={isMulti ? highlightedSection === `${placedFurnitureId}-0` : false}
      />
      
      {/* 뒷면 판재 (9mm 백패널, 섹션별로 분리) */}
      {isMulti ? (
        // 다중 섹션: 하부/상부 백패널 분리
        <>
          {(() => {
            const lowerSectionHeight = sectionHeights[0];
            const upperSectionHeight = sectionHeights[1];

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
        </group>
      )}

      {/* 도어는 showFurniture와 관계없이 항상 렌더링 (도어 도면 출력용) */}
      {hasDoor && spaceInfo && (
        <DoorModule
          moduleWidth={doorWidth || moduleData.dimensions.width}
          moduleDepth={baseFurniture.actualDepthMm}
          hingePosition={hingePosition}
          spaceInfo={spaceInfo}
          color={baseFurniture.doorColor}
          moduleData={moduleData} // 실제 듀얼캐비넷 분할 정보
          originalSlotWidth={originalSlotWidth}
          slotCenterX={slotCenterX || 0} // slotCenterX가 전달되면 사용, 아니면 0
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
    </>
  );
};

export default DualType2; 
