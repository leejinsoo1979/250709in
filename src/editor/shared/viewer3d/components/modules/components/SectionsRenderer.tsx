import React from 'react';
import * as THREE from 'three';
import { SectionConfig } from '@/data/modules/shelving';
import { useSpace3DView } from '../../../context/useSpace3DView';
import ShelfRenderer from '../ShelfRenderer';
import DrawerRenderer from '../DrawerRenderer';
import { Html, Text } from '@react-three/drei';
import NativeLine from '../../elements/NativeLine';
import { useUIStore } from '@/store/uiStore';
import DimensionText from './DimensionText';
import { useDimensionColor } from '../hooks/useDimensionColor';

// SectionsRenderer Props 인터페이스
interface SectionsRendererProps {
  // 설정 데이터
  modelConfig: {
    sections?: SectionConfig[];
  };
  
  // 치수 관련
  height: number;
  innerWidth: number;
  depth: number;
  adjustedDepthForShelves: number;
  
  // 계산된 값들
  basicThickness: number;
  shelfZOffset: number;
  
  // 재질
  material: THREE.Material;
  
  // 렌더 모드
  renderMode: 'solid' | 'wireframe';
  
  // 헬퍼 함수들
  calculateSectionHeight: (section: SectionConfig, availableHeight: number) => number;
  mmToThreeUnits: (mm: number) => number;
  
  // 가구 ID (칸 강조용)
  furnitureId?: string;
  
  // 강조 상태
  isHighlighted?: boolean;
}

/**
 * SectionsRenderer 컴포넌트
 * - sections 설정에 따라 내부 구조 렌더링
 * - 서랍, 선반, 옷걸이 구역 등을 자동으로 배치
 */
const SectionsRenderer: React.FC<SectionsRendererProps> = ({
  modelConfig,
  height,
  innerWidth,
  depth,
  adjustedDepthForShelves,
  basicThickness,
  shelfZOffset,
  material,
  renderMode,
  calculateSectionHeight,
  mmToThreeUnits,
  furnitureId,
  isHighlighted = false
}) => {
  // UI 상태에서 치수 표시 여부 가져오기
  const showDimensions = useUIStore(state => state.showDimensions);
  const showDimensionsText = useUIStore(state => state.showDimensionsText);
  const view2DDirection = useUIStore(state => state.view2DDirection);
  const { dimensionColor, baseFontSize, viewMode } = useDimensionColor();
  
  // 상하부장 여부 확인 (upper-cabinet, lower-cabinet 패턴)
  const isUpperLowerCabinet = furnitureId?.includes('upper-cabinet') || furnitureId?.includes('lower-cabinet');
  
  // sections 기반 내부 구조 렌더링
  const renderSections = () => {
    const { sections } = modelConfig;
    
    if (!sections || sections.length === 0) {
      return null;
    }
    

    // 사용 가능한 내부 높이
    const availableHeight = height - basicThickness * 2;
    
    // 고정 높이 섹션들 분리
    const fixedSections = sections.filter((s: SectionConfig) => s.heightType === 'absolute');
    
    // 고정 섹션들의 총 높이 계산
    const totalFixedHeight = fixedSections.reduce((sum: number, section: SectionConfig) => {
      return sum + calculateSectionHeight(section, availableHeight);
    }, 0);
    
    // 나머지 공간 계산
    const remainingHeight = availableHeight - totalFixedHeight;
    
    // 모든 섹션의 높이 계산
    const allSections = sections.map((section: SectionConfig) => ({
      ...section,
      calculatedHeight: (section.heightType === 'absolute') 
        ? calculateSectionHeight(section, availableHeight)
        : calculateSectionHeight(section, remainingHeight)
    }));

    // 렌더링
    let currentYPosition = -height/2 + basicThickness;
    
    return allSections.map((section: SectionConfig & { calculatedHeight: number }, index: number) => {
      const sectionHeight = section.calculatedHeight;
      // Type4 하부 섹션(drawer)은 서랍을 18mm 아래로
      const isType4DrawerSection = furnitureId?.includes('4drawer-hanging') && section.type === 'drawer' && index === 0;
      const sectionCenterY = currentYPosition + sectionHeight / 2 - (isType4DrawerSection ? basicThickness : 0);
      
      // 디버깅: 섹션 높이 확인
      if (index === 0) {
        console.log(`🔍 첫 번째 섹션 정보:`, {
          index,
          type: section.type,
          height: sectionHeight,
          showDimensions,
          viewMode,
          view2DDirection,
          condition: section.type === 'drawer' || section.type === 'open' || section.type === 'hanging'
        });
      }
      
      if (section.type === 'open' || section.type === 'drawer') {
        console.log(`📏 Section ${index} (${section.type}):`, {
          calculatedHeight: sectionHeight,
          calculatedHeightMm: Math.round(sectionHeight * 100),
          totalHeight: height,
          totalHeightMm: Math.round(height * 100),
          availableHeight: height - basicThickness * 2,
          availableHeightMm: Math.round((height - basicThickness * 2) * 100)
        });
      }
      
      let sectionContent = null;
      
      switch (section.type) {
        case 'shelf':
          // 선반 구역 (안전선반 포함)
          if (section.count && section.count > 0) {
            sectionContent = (
              <ShelfRenderer
                shelfCount={section.count}
                innerWidth={innerWidth}
                innerHeight={sectionHeight}
                depth={adjustedDepthForShelves}
                basicThickness={basicThickness}
                material={material}
                yOffset={sectionCenterY}
                zOffset={shelfZOffset}
                shelfPositions={section.shelfPositions}
                isTopFinishPanel={section.isTopFinishPanel}
                showTopFrameDimension={index === 0}
                renderMode={renderMode}
                furnitureId={furnitureId}
                isHighlighted={isHighlighted}
              />
            );
          }
          break;
          
        case 'hanging':
          // 옷걸이 구역 - 안전선반이 없어도 ShelfRenderer 호출 (치수 표시를 위해)
          sectionContent = (
            <ShelfRenderer
              shelfCount={section.count || (section.shelfPositions ? section.shelfPositions.length : 0)}
              innerWidth={innerWidth}
              innerHeight={sectionHeight}
              depth={adjustedDepthForShelves}
              basicThickness={basicThickness}
              material={material}
              yOffset={sectionCenterY}
              zOffset={shelfZOffset}
              shelfPositions={section.shelfPositions}
              isTopFinishPanel={section.isTopFinishPanel}
              showTopFrameDimension={index === 0}
              renderMode={renderMode}
              furnitureId={furnitureId}
              sectionType={section.type}
              sectionInternalHeight={section.internalHeight}
              isLastSection={index === allSections.length - 1}
              isHighlighted={isHighlighted}
            />
          );
          break;
          
        case 'drawer':
          // 서랍 구역
          if (section.count && section.count > 0) {
            sectionContent = (
              <>
                {/* 서랍 렌더링 */}
                <DrawerRenderer
                  drawerCount={section.count}
                  innerWidth={innerWidth}
                  innerHeight={sectionHeight}
                  depth={depth}
                  basicThickness={basicThickness}
                  yOffset={sectionCenterY}
                  drawerHeights={section.drawerHeights}
                  gapHeight={section.gapHeight}
                  material={material}
                  renderMode={renderMode}
                  isHighlighted={isHighlighted}
                />
                {/* 바닥판 두께 치수 표시용 ShelfRenderer */}
                <ShelfRenderer
                  shelfCount={1}
                  innerWidth={innerWidth}
                  innerHeight={sectionHeight}
                  depth={adjustedDepthForShelves}
                  basicThickness={basicThickness}
                  material={material}
                  yOffset={sectionCenterY}
                  zOffset={shelfZOffset}
                  shelfPositions={[0]}
                  renderMode={renderMode}
                  furnitureId={furnitureId}
                  sectionType={section.type}
                  isHighlighted={isHighlighted}
                />
              </>
            );
          }
          break;
      }
      
      // 중간 구분 패널 위치 계산 (마지막 섹션이 아닌 경우)
      const hasDividerPanel = index < allSections.length - 1;
      const dividerPanelY = currentYPosition + sectionHeight + basicThickness/2 - basicThickness;
      
      // 다음 섹션을 위해 Y 위치 이동
      currentYPosition += sectionHeight;
      
      return (
        <group key={`section-${index}`}>
          {sectionContent}
          
          {/* 섹션 내경 치수 표시 - drawer 섹션은 제외 */}
          {showDimensions && showDimensionsText && !(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right' || view2DDirection === 'top')) && 
           section.type === 'hanging' && (
            <group>
              {(() => {
                // 섹션의 실제 내경 계산을 위한 가이드선 위치 설정
                let bottomY, topY;
                let actualInternalHeight;
                
                // 섹션 타입별로 가이드선 위치 계산
                const hasSafetyShelf = section.type === 'hanging' && section.shelfPositions && section.shelfPositions.some(pos => pos > 0);

                if (section.type === 'hanging' || section.type === 'drawer') {
                  // 섹션의 절대 위치 계산
                  const sectionBottomY = sectionCenterY - sectionHeight/2;
                  const sectionTopY = sectionCenterY + sectionHeight/2;
                  
                  // Type4 hanging 섹션 특별 처리
                  const isType4HangingSection = furnitureId?.includes('4drawer-hanging') && section.type === 'hanging' && index === 1;
                  
                  // 하단 가이드선 위치 결정
                  if (index === 0) {
                    // 첫 번째 섹션: 하부 프레임 상단
                    bottomY = -height/2 + basicThickness;
                  } else if (isType4HangingSection) {
                    // Type4 상부 섹션: 중간 패널 2개 위 (바닥판 상단)
                    // 하부섹션 바닥판(18) + 내경(964) + 상판(18) + 상부 바닥판(18) = 1018
                    // 서랍이 18mm 아래로 내려갔으므로 상판도 18mm 아래
                    bottomY = -height/2 + mmToThreeUnits(1000) + basicThickness;
                  } else {
                    // 일반 hanging 섹션: 바닥판 상단부터
                    bottomY = sectionBottomY + basicThickness;
                  }
                  
                  // 디버깅: hanging 섹션의 치수 계산 확인
                  if (section.type === 'hanging') {
                    console.log('🔍 Hanging 섹션 치수 계산:', {
                      index,
                      sectionType: section.type,
                      hasShelfPositions: !!(section.shelfPositions && section.shelfPositions.length > 0),
                      shelfPositions: section.shelfPositions,
                      sectionBottomY,
                      sectionTopY,
                      bottomY,
                      basicThickness,
                      basicThickness_mm: basicThickness * 100,
                      height,
                      calculatedHeight: section.calculatedHeight,
                      sectionHeight
                    });
                  }
                  
                  // 상단 가이드선 위치 결정
                  if (index === allSections.length - 1) {
                    // hanging 섹션에서 안전선반이 있는 경우: 안전선반 하단까지
                    if (hasSafetyShelf) {
                      // 안전선반의 위치를 가져옴 (0이 아닌 첫 번째 값 = 안전선반, 섹션 하단 기준)
                      const safetyShelfPositionMm = section.shelfPositions.find(pos => pos > 0);
                      if (safetyShelfPositionMm !== undefined) {
                        // 안전선반 하단 Y 위치 = 섹션 하단 + 안전선반 위치(mm) - 안전선반 두께/2
                        topY = sectionBottomY + (safetyShelfPositionMm * 0.01) - basicThickness / 2;
                      } else {
                        topY = height/2 - basicThickness;
                      }
                    } else {
                      // 안전선반 없으면 상부 프레임 하단까지
                      topY = height/2 - basicThickness;
                    }
                  } else {
                    // 다음 섹션과의 경계
                    // 섹션 데이터의 1000mm는 (상판18 + 내경964 + 바닥판18) 구조
                    // bottomY는 이미 바닥판 상단
                    // 내경 상단 = 바닥판 상단 + 내경 높이 = bottomY + (1000 - 36)
                    topY = bottomY + (sectionHeight - basicThickness * 2);
                    
                    // isTopFinishPanel이 있는 경우 상판 두께만큼 추가로 감소
                    if (section.isTopFinishPanel) {
                      topY -= basicThickness;
                    }
                  }
                  
                  // 실제 내경 계산 (가이드선 사이의 거리)
                  actualInternalHeight = (topY - bottomY) / 0.01;
                } else {
                  // 다른 타입은 기본값 사용
                  bottomY = sectionCenterY - sectionHeight/2;
                  topY = sectionCenterY + sectionHeight/2;
                  actualInternalHeight = sectionHeight / 0.01;
                }
                
                const centerY = (topY + bottomY) / 2;
                
                return (
                  <>
                    {/* 치수 텍스트 - 수직선 좌측에 표시 */}
                    {viewMode === '3D' && (
                      <Text
                        position={[
                          -innerWidth/2 * 0.3 - 0.8 + 0.01, 
                          centerY - 0.01, 
                          depth/2 + 0.1 - 0.01
                        ]}
                        fontSize={baseFontSize}
                        color="rgba(0, 0, 0, 0.3)"
                        anchorX="center"
                        anchorY="middle"
                        rotation={[0, 0, Math.PI / 2]}
                        renderOrder={998}
                        depthTest={false}
                      >
                        {Math.round(actualInternalHeight)}
                      </Text>
                    )}
                    <Text
                      position={[
                        viewMode === '3D' ? -innerWidth/2 * 0.3 - 0.8 : -innerWidth/2 * 0.3 - 0.5, 
                        centerY, 
                        viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0
                      ]}
                      fontSize={baseFontSize}
                      color={dimensionColor}
                      anchorX="center"
                      anchorY="middle"
                      rotation={[0, 0, Math.PI / 2]}
                      renderOrder={1000}
                      depthTest={false}
                    >
                      {Math.round(actualInternalHeight)}
                    </Text>
                    
                    {/* 수직 연결선 - 왼쪽으로 이동 */}
                    <NativeLine
                      points={[
                        [-innerWidth/2 * 0.3, topY, viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0],
                        [-innerWidth/2 * 0.3, bottomY, viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0]
                      ]}
                      color={dimensionColor}
                      lineWidth={1}
                      dashed={false}
                    />
                    
                    {/* 수직선 양끝 엔드포인트 */}
                    <mesh position={[-innerWidth/2 * 0.3, topY, viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0]}>
                      <sphereGeometry args={[0.05, 8, 8]} />
                      <meshBasicMaterial color={dimensionColor} />
                    </mesh>
                    <mesh position={[-innerWidth/2 * 0.3, bottomY, viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0]}>
                      <sphereGeometry args={[0.05, 8, 8]} />
                      <meshBasicMaterial color={dimensionColor} />
                    </mesh>
                  </>
                );
              })()}
            </group>
          )}
          
          {/* 첫 번째 섹션의 하단 프레임 두께 표시 - Type4는 제외 */}
          {showDimensions && showDimensionsText && !(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right' || view2DDirection === 'top')) && index === 0 && !(furnitureId?.includes('4drawer-hanging')) && (
            <group>
              {/* 하단 프레임 두께 텍스트 - 수직선 좌측에 표시 */}
              {viewMode === '3D' && (
                <Text
                  position={[
                    -innerWidth/2 * 0.3 - 0.8 + 0.01, 
                    -height/2 + basicThickness/2 - 0.01, 
                    depth/2 + 0.1 - 0.01
                  ]}
                  fontSize={baseFontSize}
                  color="rgba(0, 0, 0, 0.3)"
                  anchorX="center"
                  anchorY="middle"
                  rotation={[0, 0, Math.PI / 2]}
                  renderOrder={998}
                >
                  {Math.round((basicThickness > 0 ? basicThickness : 0.18) * 100)}
                </Text>
              )}
              <Text
                position={[
                  viewMode === '3D' ? -innerWidth/2 * 0.3 - 0.8 : -innerWidth/2 * 0.3 - 0.5, 
                  -height/2 + basicThickness/2, 
                  viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0
                ]}
                fontSize={baseFontSize}
                color={dimensionColor}
                anchorX="center"
                anchorY="middle"
                rotation={[0, 0, Math.PI / 2]}
                renderOrder={1000}
                depthTest={false}
              >
                {Math.round((basicThickness > 0 ? basicThickness : 0.18) * 100)}
              </Text>
              
              {/* 하단 프레임 두께 수직선 - 왼쪽으로 이동 */}
              <NativeLine
                points={[
                  [-innerWidth/2 * 0.3, -height/2, viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0],
                  [-innerWidth/2 * 0.3, -height/2 + basicThickness, viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0]
                ]}
                color={dimensionColor}
                lineWidth={1}
                dashed={false}
              />
              
              {/* 하단 프레임 두께 수직선 양끝 점 */}
              <mesh position={[-innerWidth/2 * 0.3, -height/2, viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0]}>
                <sphereGeometry args={[0.05, 8, 8]} />
                <meshBasicMaterial color={dimensionColor} />
              </mesh>
              <mesh position={[-innerWidth/2 * 0.3, -height/2 + basicThickness, viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0]}>
                <sphereGeometry args={[0.05, 8, 8]} />
                <meshBasicMaterial color={dimensionColor} />
              </mesh>
            </group>
          )}
          
          
          {/* 마지막 섹션의 상단 프레임 두께 표시 */}
          {showDimensions && showDimensionsText && !(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right' || view2DDirection === 'top')) && index === allSections.length - 1 && (
            <group>
              {/* 상단 프레임 두께 텍스트 - 수직선 좌측에 표시 */}
              {viewMode === '3D' && (
                <Text
                  position={[
                    -innerWidth/2 * 0.3 - 0.8 + 0.01, 
                    height/2 - basicThickness/2 - 0.01, 
                    depth/2 + 0.1 - 0.01
                  ]}
                  fontSize={baseFontSize}
                  color="rgba(0, 0, 0, 0.3)"
                  anchorX="center"
                  anchorY="middle"
                  rotation={[0, 0, Math.PI / 2]}
                  renderOrder={998}
                >
                  {Math.round((basicThickness > 0 ? basicThickness : 0.18) * 100)}
                </Text>
              )}
              <Text
                position={[
                  viewMode === '3D' ? -innerWidth/2 * 0.3 - 0.8 : -innerWidth/2 * 0.3 - 0.5, 
                  height/2 - basicThickness/2, 
                  viewMode === '3D' 
                    ? depth/2 + 0.1 
                    : depth/2 + 1.0
                ]}
                fontSize={baseFontSize}
                color={dimensionColor}
                anchorX="center"
                anchorY="middle"
                rotation={[0, 0, Math.PI / 2]}
                renderOrder={999}
                depthTest={false}
              >
                {Math.round((basicThickness > 0 ? basicThickness : 0.18) * 100)}
              </Text>
              
              {/* 상단 프레임 두께 수직선 - 왼쪽으로 이동 */}
              <NativeLine
                points={[
                  [-innerWidth/2 * 0.3, height/2, viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0],
                  [-innerWidth/2 * 0.3, height/2 - basicThickness, viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0]
                ]}
                color={dimensionColor}
                lineWidth={1}
                dashed={false}
              />
              
              {/* 상단 프레임 두께 수직선 양끝 점 */}
              <mesh position={[-innerWidth/2 * 0.3, height/2, viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0]}>
                <sphereGeometry args={[0.05, 8, 8]} />
                <meshBasicMaterial color={dimensionColor} />
              </mesh>
              <mesh position={[-innerWidth/2 * 0.3, height/2 - basicThickness, viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0]}>
                <sphereGeometry args={[0.05, 8, 8]} />
                <meshBasicMaterial color={dimensionColor} />
              </mesh>
            </group>
          )}
        </group>
      );
    });
  };
  
  return (
    <>
      {renderSections()}
    </>
  );
};

export default SectionsRenderer; 
