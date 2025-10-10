import React, { useCallback } from 'react';
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
import EditableDimensionText from './EditableDimensionText';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { updateSectionHeight } from '@/editor/shared/utils/sectionHeightUpdater';

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

  // 섹션 내경 치수 숨김 (듀얼 타입 중복 방지용)
  hideSectionDimensions?: boolean;

  // 배치된 가구 ID (치수 편집용)
  placedFurnitureId?: string;
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
  isHighlighted = false,
  hideSectionDimensions = false,
  placedFurnitureId
}) => {
  // UI 상태에서 치수 표시 여부 가져오기
  const showDimensions = useUIStore(state => state.showDimensions);
  const showDimensionsText = useUIStore(state => state.showDimensionsText);
  const view2DDirection = useUIStore(state => state.view2DDirection);
  const { dimensionColor, baseFontSize, viewMode } = useDimensionColor();

  // 가구 스토어 메서드
  const { placedModules, updatePlacedModule } = useFurnitureStore();

  // 치수 변경 핸들러
  const handleDimensionChange = useCallback((sectionIndex: number, newInternalHeight: number) => {
    if (!placedFurnitureId) {
      console.warn('⚠️ placedFurnitureId가 없어서 치수를 수정할 수 없습니다');
      return;
    }

    console.log('📏 치수 변경 요청:', {
      placedFurnitureId,
      sectionIndex,
      newInternalHeight
    });

    // 배치된 가구 찾기
    const placedModule = placedModules.find(m => m.id === placedFurnitureId);
    if (!placedModule) {
      console.error('❌ 배치된 가구를 찾을 수 없습니다:', placedFurnitureId);
      return;
    }

    // 섹션 높이 업데이트
    const result = updateSectionHeight(
      placedModule,
      sectionIndex,
      newInternalHeight,
      basicThickness
    );

    if (!result.success) {
      alert(result.error || '섹션 높이를 업데이트할 수 없습니다');
      return;
    }

    console.log('✅ 섹션 높이 업데이트 성공:', result);

    // 가구 스토어 업데이트
    updatePlacedModule(placedFurnitureId, {
      customSections: result.updatedSections,
      // moduleData도 업데이트 (dimensions.height)
      moduleData: {
        ...placedModule.moduleData!,
        dimensions: {
          ...placedModule.moduleData!.dimensions,
          height: result.updatedHeight!
        },
        modelConfig: {
          ...placedModule.moduleData!.modelConfig,
          sections: result.updatedSections
        }
      }
    });

    console.log('🎉 가구 업데이트 완료!');
  }, [placedFurnitureId, placedModules, updatePlacedModule, basicThickness]);
  
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
          
          {/* 섹션 내경 치수 표시 - 2단 옷장은 하부 섹션만 표시 (상부는 안전선반 있을 때만), 듀얼 타입 중복 방지 */}
          {(() => {
            const is2HangingFurniture = furnitureId?.includes('2hanging');
            const hasTwoSections = allSections.length === 2;
            // 2hanging의 상부 섹션에 안전선반이 있으면 치수 표시
            const hasSafetyShelf = section.type === 'hanging' && section.shelfPositions && section.shelfPositions.some(pos => pos > 0);

            // 2단 옷장(2hanging) 특별 처리: 하부만 표시, 상부는 안전선반 있을 때만
            const shouldHide2HangingUpper = is2HangingFurniture && hasTwoSections && index === 1 && !hasSafetyShelf;

            const shouldShow = !hideSectionDimensions && showDimensions && showDimensionsText &&
                              !(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right' || view2DDirection === 'top')) &&
                              (section.type === 'hanging' || section.type === 'drawer') &&
                              !shouldHide2HangingUpper;

            // 2hanging만 로그
            if (furnitureId?.includes('2hanging')) {
              console.log(`🚨 섹션${index} | furnitureId: ${furnitureId} | hasSafetyShelf: ${hasSafetyShelf} | shouldShow: ${shouldShow} | shouldHide2HangingUpper: ${shouldHide2HangingUpper}`);
            }
            
            return shouldShow && (
            <group>
              {(() => {
                // 섹션의 실제 내경 계산을 위한 가이드선 위치 설정
                let bottomY, topY;
                let actualInternalHeight;
                
                // 섹션 타입별로 가이드선 위치 계산
                const hasSafetyShelf = section.type === 'hanging' && section.shelfPositions && section.shelfPositions.some(pos => pos > 0);

                if (section.type === 'hanging') {
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
                    // Type4 상부 섹션: 상부섹션 바닥판 상단부터 (하부 1000mm + 바닥판 18mm)
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
                    // 마지막 섹션 (상부 섹션)
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
                      // 안전선반 없는 경우
                      // 2hanging의 상부 섹션: 상부섹션 바닥판 윗면까지 (중간 패널 윗면)
                      const is2HangingUpperSection = furnitureId?.includes('2hanging') && index === 1;
                      if (is2HangingUpperSection) {
                        // 상부섹션 바닥판 윗면 = 하부 프레임 상단 + 하부섹션 1000mm + 바닥판 두께
                        topY = -height/2 + mmToThreeUnits(1000) + basicThickness;
                      } else {
                        // 일반 케이스: 상부 프레임 하단까지
                        topY = height/2 - basicThickness;
                      }
                    }
                  } else {
                    // 다음 섹션과의 경계
                    // 섹션 높이에서 상하판 두께만 빼면 내경
                    // topY = bottomY + (sectionHeight - basicThickness * 2)
                    topY = bottomY + (sectionHeight - basicThickness * 2);
                  }

                  // 실제 내경 계산 (가이드선 사이의 거리)
                  actualInternalHeight = (topY - bottomY) / 0.01;
                } else if (section.type === 'drawer') {
                  // drawer 섹션: 바닥판 상단부터 상판 하단까지
                  const sectionBottomY = sectionCenterY - sectionHeight/2;
                  const sectionTopY = sectionCenterY + sectionHeight/2;
                  
                  bottomY = sectionBottomY + basicThickness;
                  topY = sectionTopY - basicThickness;
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
                    {/* 치수 텍스트 - 편집 가능 (더블클릭) */}
                    <EditableDimensionText
                      position={[
                        viewMode === '3D' ? -innerWidth/2 * 0.3 - 0.8 : -innerWidth/2 * 0.3 - 0.5,
                        centerY,
                        viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0
                      ]}
                      fontSize={baseFontSize}
                      color={dimensionColor}
                      rotation={[0, 0, Math.PI / 2]}
                      value={actualInternalHeight}
                      onValueChange={(newValue) => handleDimensionChange(index, newValue)}
                      sectionIndex={index}
                      furnitureId={furnitureId}
                      renderOrder={1000}
                      depthTest={false}
                    />
                    
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
            );
          })()}
          
          {/* 첫 번째 섹션의 하단 프레임 두께 표시 */}
          {showDimensions && showDimensionsText && !(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right' || view2DDirection === 'top')) && index === 0 && (
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
          {showDimensions && showDimensionsText && !(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right' || view2DDirection === 'top')) && index === allSections.length - 1 && !(
            section.type === 'hanging' && section.shelfPositions && section.shelfPositions.some(pos => pos > 0)
          ) && (
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
