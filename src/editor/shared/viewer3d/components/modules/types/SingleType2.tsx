import React, { useEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useBaseFurniture, SectionsRenderer, FurnitureTypeProps } from '../shared';
import { Text, Line } from '@react-three/drei';
import { useDimensionColor } from '../hooks/useDimensionColor';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useTheme } from '@/contexts/ThemeContext';
import { useUIStore } from '@/store/uiStore';
import DoorModule from '../DoorModule';
import { AdjustableFootsRenderer } from '../components/AdjustableFootsRenderer';

// 독립적인 엣지 표시를 위한 박스 컴포넌트
const BoxWithEdges: React.FC<{
  args: [number, number, number];
  position: [number, number, number];
  material: THREE.Material;
  renderMode?: 'solid' | 'wireframe';
  isDragging?: boolean;
  isEditMode?: boolean;
  hideEdges?: boolean; // 엣지 숨김 옵션 추가
  isBackPanel?: boolean; // 백패널 여부 추가
}> = ({ args, position, material, renderMode = 'solid', isDragging = false, isEditMode = false, hideEdges = false, isBackPanel = false }) => {
  const { viewMode } = useSpace3DView();
  const { view2DDirection, view2DTheme, indirectLightEnabled, indirectLightIntensity, shadowEnabled } = useUIStore(); // view2DDirection, view2DTheme, shadowEnabled 추가
  const { gl } = useThree();
  const { theme } = useTheme();
  
  // Shadow auto-update enabled - manual shadow updates removed

  // 드래그 중이거나 편집 모드일 때 고스트 효과 적용
  const processedMaterial = React.useMemo(() => {
    if (isDragging && material instanceof THREE.MeshStandardMaterial) {
      const ghostMaterial = material.clone();
      ghostMaterial.transparent = true;
      ghostMaterial.opacity = 0.6;
      // 테마 색상 가져오기
      const getThemeColor = () => {
        if (typeof window !== "undefined") {
          const computedStyle = getComputedStyle(document.documentElement);
          const primaryColor = computedStyle.getPropertyValue("--theme-primary").trim();
          if (primaryColor) {
            return primaryColor;
          }
        }
        return "#10b981"; // 기본값 (green)
      };
      
      ghostMaterial.color = new THREE.Color(getThemeColor());
      ghostMaterial.needsUpdate = true;
      return ghostMaterial;
    }
    // 편집 모드에서는 원래 재질 그대로 사용
    return material;
  }, [material, isDragging, isEditMode]);

  return (
    <group position={position}>
      {/* 면 렌더링 - 와이어프레임에서는 투명하게 */}
      <mesh receiveShadow={viewMode === '3D' && renderMode === 'solid' && shadowEnabled} castShadow={viewMode === '3D' && renderMode === 'solid' && shadowEnabled}>
        <boxGeometry args={args} />
        {renderMode === 'wireframe' ? (
          // 와이어프레임 모드: 완전히 투명한 재질
          <meshBasicMaterial transparent={true} opacity={0} />
        ) : isBackPanel && viewMode === '2D' && view2DDirection === 'front' ? (
          // 2D 정면뷰에서 백패널은 완전히 투명하게
          <meshBasicMaterial transparent={true} opacity={0} />
        ) : (
          <primitive object={processedMaterial} attach="material" />
        )}
      </mesh>
      {/* 윤곽선 렌더링 */}
      {!hideEdges && (
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(...args)]} />
          <lineBasicMaterial 
            color={
              viewMode === '3D' 
                ? "#505050"
                : renderMode === 'wireframe' 
                  ? (view2DTheme === 'dark' ? "#FF4500" : "#000000")  // 2D wireframe 다크모드는 붉은 주황색, 라이트모드는 검정색
                  : (view2DTheme === 'dark' ? "#FF4500" : "#444444")  // 2D solid 다크모드는 붉은 주황색, 라이트모드는 회색
            }
            transparent={viewMode === '3D' || (isBackPanel && viewMode === '2D' && view2DDirection === 'front')}
            opacity={
              isBackPanel && viewMode === '2D' && view2DDirection === 'front' 
                ? 0.1  // 2D 정면 뷰에서 백패널은 매우 투명하게
                : viewMode === '3D' 
                  ? 0.9 
                  : 1
            }
            depthTest={viewMode === '3D'}
            depthWrite={false}
            polygonOffset={viewMode === '3D'}
            polygonOffsetFactor={viewMode === '3D' ? -10 : 0}
            polygonOffsetUnits={viewMode === '3D' ? -10 : 0}
            linewidth={viewMode === '2D' ? 2 : 1} 
          />
        </lineSegments>
      )}
    </group>
  );
};

/**
 * SingleType2 컴포넌트
 * - 2단 옷장 (single-2hanging)
 * - ID 패턴: single-2hanging-*
 * - 구조: 하단 선반구역 + 상단 옷걸이구역
 * - 특징: 표준 sections 기반, 안전선반 적용 가능
 */
const SingleType2: React.FC<FurnitureTypeProps> = ({
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
  adjustedWidth,
  slotInfo,
  showFurniture = true,
  furnitureId
}) => {
  // 공통 로직 사용
  const baseFurniture = useBaseFurniture(moduleData, {
    color,
    internalHeight,
    customDepth,
    isDragging,
    isEditMode,
    adjustedWidth
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
  
  // 띄워서 배치 여부 확인
  const isFloating = spaceInfo?.baseConfig?.placementType === "float";
  const floatHeight = spaceInfo?.baseConfig?.floatHeight || 0;
  const showIndirectLight = false;
  const { view2DDirection, indirectLightEnabled, indirectLightIntensity, showDimensions } = useUIStore();
  const { dimensionColor, baseFontSize } = useDimensionColor();
  const { theme } = useTheme();

  return (
    <>
      {/* 띄워서 배치 시 간접조명 효과 */}
      {showIndirectLight && (
        <IndirectLight
          width={baseFurniture.innerWidth * 1.5}
          depth={baseFurniture.depth * 1.5}
          intensity={indirectLightIntensity || 0.8}
          position={[0, -baseFurniture.height/2 - 0.02, 0]}
        />
      )}
      
      {/* 가구 본체는 showFurniture가 true일 때만 렌더링 */}
      {showFurniture && (
        <group>
          {/* 좌우 측면 판재 - 섹션별 분할 또는 단일 */}
          {(() => {
            console.log('🟨🟨🟨 SingleType2 렌더링:', {
              furnitureId: moduleData.id,
              isMultiSection: isMultiSectionFurniture(),
              sectionCount: getSectionHeights().length,
              sectionHeights: getSectionHeights().map(h => h * 100 + 'mm')
            });
            return isMultiSectionFurniture();
          })() ? (
        // 다중 섹션: 섹션별 분할 측면 패널
        <>
          {(() => {
            let accumulatedY = -height/2 + basicThickness;
            
            console.log('🟨🟨 Type2 섹션 처리 시작:', {
              height_mm: height * 100,
              initialAccumulatedY_mm: accumulatedY * 100,
              basicThickness_mm: basicThickness * 100
            });
            
            return getSectionHeights().map((sectionHeight: number, index: number) => {
              console.log(`🟨 SingleType2 섹션 ${index} 시작:`, {
                accumulatedY_before_mm: accumulatedY * 100,
                sectionHeight: sectionHeight * 100 + 'mm',
                shouldRenderMiddlePanel: index < getSectionHeights().length - 1
              });
              
              // 현재 섹션의 중심 Y 위치
              const sectionCenterY = accumulatedY + sectionHeight / 2 - basicThickness;
              
              console.log(`🟨 섹션 ${index} 계산:`, {
                sectionCenterY_mm: sectionCenterY * 100,
                계산: `${accumulatedY * 100} + ${sectionHeight * 100}/2 - ${basicThickness * 100} = ${sectionCenterY * 100}mm`
              });
              
              // 다음 섹션을 위해 누적
              const currentYPosition = accumulatedY;
              accumulatedY += sectionHeight;
              
              console.log(`🟨 섹션 ${index} 종료:`, {
                accumulatedY_after_mm: accumulatedY * 100
              });
            
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
                />
                
                {/* 오른쪽 측면 판재 - 섹션별로 분할 */}
                <BoxWithEdges
                  args={[basicThickness, sectionHeight, depth]}
                  position={[width/2 - basicThickness/2, sectionCenterY, 0]}
                  material={material}
                  renderMode={renderMode}
                  isDragging={isDragging}
                  isEditMode={isEditMode}
                />
                
                {/* 중간 구분 패널 (마지막 섹션 제외) */}
                {index < getSectionHeights().length - 1 && (() => {
                  const middlePanelY = sectionCenterY + sectionHeight/2 + basicThickness/2;
                  console.log(`🟨 섹션 ${index} 중간 패널 위치:`, {
                    middlePanelY_mm: middlePanelY * 100,
                    sectionCenterY_mm: sectionCenterY * 100,
                    sectionHeight_mm: sectionHeight * 100,
                    basicThickness_mm: basicThickness * 100,
                    계산식: `(${sectionCenterY * 100}) + (${sectionHeight * 100}/2) + (${basicThickness * 100}/2) = ${middlePanelY * 100}mm`
                  });
                  
                  return (
                    <BoxWithEdges
                      args={[innerWidth, basicThickness, adjustedDepthForShelves - basicThickness]}
                      position={[0, middlePanelY, basicThickness/2 + shelfZOffset]}
                      material={material}
                      renderMode={renderMode}
                      isDragging={isDragging}
                      isEditMode={isEditMode}
                    />
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
      
      {/* 상단 상판 두께 치수 표시 */}
      {showDimensions && (
        <group>
          {/* 상판 두께 텍스트 */}
          {viewMode === '3D' && (
            <Text
              position={[
                -innerWidth/2 * 0.3 - 0.8 + 0.01, 
                height/2 - basicThickness/2 - 0.01,
                adjustedDepthForShelves/2 + 0.1 - 0.01
              ]}
              fontSize={baseFontSize}
              color="rgba(0, 0, 0, 0.3)"
              anchorX="center"
              anchorY="middle"
              rotation={[0, 0, Math.PI / 2]}
              renderOrder={998}
            >
              {Math.round(basicThickness * 100)}
            </Text>
          )}
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
          >
            {Math.round(basicThickness * 100)}
          </Text>
          
          {/* 상판 두께 수직선 */}
          <Line
            points={[
              [-innerWidth/2 * 0.3, height/2 - basicThickness, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0],
              [-innerWidth/2 * 0.3, height/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]
            ]}
            color={dimensionColor}
            lineWidth={1}
          />
          {/* 수직선 양끝 점 */}
          <mesh position={[-innerWidth/2 * 0.3, height/2 - basicThickness, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
            <sphereGeometry args={[0.02, 8, 8]} />
            <meshBasicMaterial color={dimensionColor} />
          </mesh>
          <mesh position={[-innerWidth/2 * 0.3, height/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
            <sphereGeometry args={[0.02, 8, 8]} />
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
      />
      
      {/* 뒷면 판재 (9mm 얇은 백패널, 상하좌우 각 5mm 확장) */}
      <BoxWithEdges
        args={[innerWidth + mmToThreeUnits(10), innerHeight + mmToThreeUnits(10), backPanelThickness]}
        position={[0, 0, -depth/2 + backPanelThickness/2 + mmToThreeUnits(17)]}
        material={material}
        renderMode={renderMode}
        isDragging={isDragging}
        isEditMode={isEditMode}
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
          mmToThreeUnits={baseFurniture.mmToThreeUnits}
          renderMode={renderMode}
        />
      )}
        </group>
      )}
      
      {/* 도어는 showFurniture와 관계없이 hasDoor가 true이면 항상 렌더링 (도어만 보기 위해) - 단, 기둥 A(deep) 침범 시에는 FurnitureItem에서 별도 렌더링 */}
      {hasDoor && spaceInfo && 
       !(slotInfo && slotInfo.hasColumn && (slotInfo.columnType === 'deep' || adjustedWidth !== undefined)) && (
        <DoorModule
          moduleWidth={doorWidth || moduleData.dimensions.width}
          moduleDepth={baseFurniture.actualDepthMm}
          hingePosition={hingePosition}
          spaceInfo={spaceInfo}
          color={baseFurniture.doorColor}
          isDragging={isDragging}
          isEditMode={isEditMode}
          moduleData={moduleData}
          originalSlotWidth={originalSlotWidth}
          slotCenterX={slotCenterX || 0}
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
    </>
  );
};

export default SingleType2; 
