import React, { useCallback, useState } from 'react';
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
import { getThemeHex } from '@/theme';

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

  // 섹션별 깊이 배열 (Three.js 단위)
  sectionDepths?: number[];

  // 텍스처 URL과 패널별 결 방향
  textureUrl?: string;
  panelGrainDirections?: { [panelName: string]: 'horizontal' | 'vertical' };
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
  placedFurnitureId,
  sectionDepths,
  textureUrl,
  panelGrainDirections
}) => {
  // UI 상태에서 치수 표시 여부 가져오기
  const showDimensions = useUIStore(state => state.showDimensions);
  const highlightedSection = useUIStore(state => state.highlightedSection);
  const highlightedPanel = useUIStore(state => state.highlightedPanel);
  const showDimensionsText = useUIStore(state => state.showDimensionsText);
  const view2DDirection = useUIStore(state => state.view2DDirection);
  const { dimensionColor, baseFontSize, viewMode } = useDimensionColor();

  // 가구 스토어 메서드
  const { placedModules, updatePlacedModule } = useFurnitureStore();

  // Hover 상태 관리 (섹션별)
  const [hoveredSectionIndex, setHoveredSectionIndex] = useState<number | null>(null);

  // 테마 색상
  const themeColor = getThemeHex();

  // 패널 비활성화용 material - 한 번만 생성하고 재사용
  const panelDimmedMaterial = React.useMemo(() => {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#666666'),
      transparent: true,
      opacity: 0.1
    });
    mat.needsUpdate = true;
    return mat;
  }, []); // 한 번만 생성

  // 패널용 material 결정 - useCallback로 최적화
  const getPanelMaterial = React.useCallback((panelName: string) => {
    // 패널 ID 생성
    const panelId = `${placedFurnitureId}-${panelName}`;

    // 패널이 강조되어야 하는지 확인
    const isHighlighted = highlightedPanel === panelId;

    // 패널이 비활성화되어야 하는지 확인
    const isDimmed = highlightedPanel && highlightedPanel !== panelId && highlightedPanel.startsWith(`${placedFurnitureId}-`);

    // 선택된 패널은 원래 material 유지
    if (isHighlighted) {
      return material;
    }
    // 선택되지 않은 패널만 투명하게
    if (isDimmed) {
      return panelDimmedMaterial;
    }
    return material;
  }, [highlightedPanel, placedFurnitureId, material, panelDimmedMaterial]);

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

      // 현재 섹션의 깊이 가져오기 (sectionDepths가 없으면 기본 depth 사용)
      const currentSectionDepth = (sectionDepths && sectionDepths[index]) ? sectionDepths[index] : depth;

      // adjustedDepthForShelves 계산 (백패널 두께 고려)
      // depth와 adjustedDepthForShelves의 차이를 계산해서 비율적용
      const backPanelThickness = depth - adjustedDepthForShelves;
      const currentAdjustedDepthForShelves = currentSectionDepth - backPanelThickness;

      // Z 오프셋 계산 (섹션 깊이가 줄어들면 앞쪽으로 이동)
      const depthDiff = depth - currentSectionDepth;
      const currentShelfZOffset = shelfZOffset + depthDiff / 2;

      // 섹션 이름 결정 (상부/하부 구분)
      const sectionName = allSections.length >= 2
        ? (index === 0 ? '(하)' : '(상)')
        : '';

      let sectionContent = null;

      switch (section.type) {
        case 'shelf':
          // 선반 구역 (안전선반 포함)
          if (section.count && section.count > 0) {
            // 섹션별 강조 확인
            const isSectionHighlighted = highlightedSection === `${placedFurnitureId}-${index}`;

            sectionContent = (
              <ShelfRenderer
                shelfCount={section.count}
                innerWidth={innerWidth}
                innerHeight={sectionHeight}
                depth={currentAdjustedDepthForShelves}
                basicThickness={basicThickness}
                material={material}
                yOffset={sectionCenterY}
                zOffset={currentShelfZOffset}
                shelfPositions={section.shelfPositions}
                isTopFinishPanel={section.isTopFinishPanel}
                showTopFrameDimension={index === 0}
                renderMode={renderMode}
                furnitureId={placedFurnitureId || furnitureId}
                isHighlighted={isSectionHighlighted}
                textureUrl={textureUrl}
                panelGrainDirections={panelGrainDirections}
                sectionName={sectionName}
              />
            );
          }
          break;

        case 'hanging':
          // 옷걸이 구역 - 안전선반이 없어도 ShelfRenderer 호출 (치수 표시를 위해)
          // 섹션별 강조 확인
          const isHangingSectionHighlighted = highlightedSection === `${placedFurnitureId}-${index}`;

          sectionContent = (
            <ShelfRenderer
              shelfCount={section.count || (section.shelfPositions ? section.shelfPositions.length : 0)}
              innerWidth={innerWidth}
              innerHeight={sectionHeight}
              depth={currentAdjustedDepthForShelves}
              basicThickness={basicThickness}
              material={material}
              yOffset={sectionCenterY}
              zOffset={currentShelfZOffset}
              shelfPositions={section.shelfPositions}
              isTopFinishPanel={section.isTopFinishPanel}
              showTopFrameDimension={index === 0}
              renderMode={renderMode}
              furnitureId={placedFurnitureId || furnitureId}
              sectionType={section.type}
              sectionInternalHeight={section.internalHeight}
              isLastSection={index === allSections.length - 1}
              isHighlighted={isHangingSectionHighlighted}
              textureUrl={textureUrl}
              panelGrainDirections={panelGrainDirections}
              sectionName={sectionName}
            />
          );
          break;

        case 'drawer':
          // 서랍 구역
          if (section.count && section.count > 0) {
            // 섹션별 강조 확인
            const isDrawerSectionHighlighted = highlightedSection === `${placedFurnitureId}-${index}`;

            // 상부섹션(index > 0)은 하판이 없으므로 innerHeight에서 basicThickness를 뺌
            const drawerInnerHeight = index > 0 ? sectionHeight - basicThickness : sectionHeight;
            // 상부섹션은 yOffset도 basicThickness/2만큼 위로 조정
            const drawerYOffset = index > 0 ? sectionCenterY + basicThickness/2 : sectionCenterY;

            // 섹션 깊이에 따른 Z 오프셋 계산
            const drawerZOffset = depth - currentSectionDepth !== 0 ? (depth - currentSectionDepth) / 2 : 0;

            sectionContent = (
              <DrawerRenderer
                drawerCount={section.count}
                innerWidth={innerWidth}
                innerHeight={drawerInnerHeight}
                depth={currentSectionDepth}
                basicThickness={basicThickness}
                yOffset={drawerYOffset}
                zOffset={drawerZOffset}
                drawerHeights={section.drawerHeights}
                gapHeight={section.gapHeight}
                material={material}
                renderMode={renderMode}
                isHighlighted={isDrawerSectionHighlighted}
                textureUrl={textureUrl}
                panelGrainDirections={panelGrainDirections}
                furnitureId={placedFurnitureId || furnitureId}
                sectionName={sectionName}
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
            // 모든 가구에서 furnitureId 확인
            console.log('🔵 SectionsRenderer furnitureId 체크:', { furnitureId, index });

            const is2HangingFurniture = furnitureId?.includes('2hanging');
            const isDualFurniture = furnitureId?.includes('dual');

            // 듀얼 가구 디버깅
            if (isDualFurniture) {
              console.log('🔴 듀얼 가구 감지:', { furnitureId, index, isDualFurniture });
            }
            const hasTwoSections = allSections.length === 2;
            // 2hanging의 상부 섹션에 안전선반이 있으면 치수 표시
            const hasSafetyShelf = section.type === 'hanging' && section.shelfPositions && section.shelfPositions.some(pos => pos > 0);

            // 2단 옷장(2hanging) 특별 처리: 안전선반 있으면 상부도 표시
            const shouldHide2HangingUpper = false; // 안전선반 윗칸 내경도 표시하도록 수정

            // 섹션 내경 치수 표시 조건
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

                // 2hanging 디버그
                if (furnitureId?.includes('2hanging')) {
                  console.log(`📏 섹션${index} 치수 계산 | type: ${section.type} | shelfPositions:`, section.shelfPositions, `| hasSafetyShelf: ${hasSafetyShelf}`);
                }

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
                    // 2hanging 상부 섹션: 바닥판 윗면까지 (sectionBottomY는 이미 바닥판 중간이므로 그대로 사용)
                    const is2HangingUpperSection = furnitureId?.includes('2hanging') && index === 1;
                    if (is2HangingUpperSection) {
                      // 상부섹션 바닥판 윗면 = 섹션 하단 (바닥판 아래쪽)
                      bottomY = sectionBottomY;
                    } else {
                      // 일반 hanging 섹션: 바닥판 상단부터
                      bottomY = sectionBottomY + basicThickness;
                    }
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
                      // 2hanging 상부 섹션: 측판 높이에서 최상단 칸과 선반들을 뺀 내경
                      // topY = bottomY + (sectionHeight - basicThickness * 2) = 바닥판 상단 + 내경
                      const is2HangingUpperSection = furnitureId?.includes('2hanging') && index === 1;
                      if (is2HangingUpperSection) {
                        // 상부 섹션의 경우 섹션 높이에서 상하판만 빼면 내경
                        topY = bottomY + (sectionHeight - basicThickness * 2);
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

                  // 첫 번째 섹션(하부)은 가구 바닥판 윗면부터
                  bottomY = index === 0 ? (-height/2 + basicThickness) : (sectionBottomY + basicThickness);
                  topY = sectionTopY - basicThickness;
                  actualInternalHeight = (topY - bottomY) / 0.01;
                } else {
                  // 다른 타입은 기본값 사용
                  bottomY = sectionCenterY - sectionHeight/2;
                  topY = sectionCenterY + sectionHeight/2;
                  actualInternalHeight = sectionHeight / 0.01;
                }
                
                const centerY = (topY + bottomY) / 2;

                // 치수 디버깅
                console.log('📏 섹션 내경 치수:', {
                  furnitureId,
                  sectionIndex: index,
                  actualInternalHeight: Math.round(actualInternalHeight)
                });

                // 현재 섹션의 hover 상태에 따른 색상
                const isHovered = hoveredSectionIndex === index;
                const currentColor = isHovered ? themeColor : dimensionColor;

                // 안전선반 위 칸의 내경 계산 (안전선반이 있는 경우)
                let topCompartmentHeight = null;
                let topCompartmentBottomY = null;
                let topCompartmentTopY = null;

                const isDualFurniture = furnitureId?.includes('dual');
                if (hasSafetyShelf && index === allSections.length - 1) {
                  const safetyShelfPositionMm = section.shelfPositions.find(pos => pos > 0);
                  if (safetyShelfPositionMm !== undefined) {
                    const sectionBottomY = sectionCenterY - sectionHeight/2;
                    // 안전선반 윗면
                    topCompartmentBottomY = sectionBottomY + (safetyShelfPositionMm * 0.01) + basicThickness / 2;
                    // 상부 프레임 하단
                    topCompartmentTopY = height/2 - basicThickness;
                    // 안전선반 위 칸의 내경
                    topCompartmentHeight = (topCompartmentTopY - topCompartmentBottomY) / 0.01;

                    console.log('🔵 안전선반 위 칸 렌더링:', {
                      furnitureId,
                      sectionIndex: index,
                      totalSections: allSections.length,
                      isLastSection: index === allSections.length - 1,
                      topCompartmentHeight: Math.round(topCompartmentHeight),
                      safetyShelfPositionMm
                    });
                  }
                }

                return (
                  <>
                    {/* 하단 칸 내경 치수 (바닥판 ~ 안전선반 하단 또는 천장) */}
                    <>
                      {/* 치수 텍스트 - 편집 가능 */}
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
                        onHoverChange={(hovered) => setHoveredSectionIndex(hovered ? index : null)}
                      />

                      {/* 수직 연결선 - 왼쪽으로 이동 (hover 시 테마 색상) */}
                      <group>
                        <NativeLine
                          points={[
                            [-innerWidth/2 * 0.3, topY, viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0],
                            [-innerWidth/2 * 0.3, bottomY, viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0]
                          ]}
                          color={currentColor}
                          lineWidth={1}
                          dashed={false}
                        />

                        {/* 가이드선 클릭/hover 영역 */}
                        <mesh
                          position={[-innerWidth/2 * 0.3, (topY + bottomY) / 2, viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0]}
                          onPointerOver={(e) => {
                            e.stopPropagation();
                            setHoveredSectionIndex(index);
                          }}
                          onPointerOut={(e) => {
                            e.stopPropagation();
                            setHoveredSectionIndex(null);
                          }}
                        >
                          <planeGeometry args={[0.3, Math.abs(topY - bottomY)]} />
                          <meshBasicMaterial transparent opacity={0} depthTest={false} side={2} />
                        </mesh>
                      </group>

                      {/* 수직선 양끝 엔드포인트 (hover 시 테마 색상) - 측면뷰에서 숨김 */}
                      {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
                        <>
                          <mesh position={[-innerWidth/2 * 0.3, topY, viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0]}>
                            <sphereGeometry args={[0.05, 8, 8]} />
                            <meshBasicMaterial color={currentColor} />
                          </mesh>
                          <mesh position={[-innerWidth/2 * 0.3, bottomY, viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0]}>
                            <sphereGeometry args={[0.05, 8, 8]} />
                            <meshBasicMaterial color={currentColor} />
                          </mesh>
                        </>
                      )}
                    </>

                    {/* 안전선반 위 칸의 내경 치수 (안전선반이 있는 경우 추가 표시) */}
                    {topCompartmentHeight !== null && topCompartmentBottomY !== null && topCompartmentTopY !== null && (
                      <>
                        {(() => {
                          const topCenterY = (topCompartmentTopY + topCompartmentBottomY) / 2;
                          const topSectionIndex = `${index}-top`;
                          const isTopHovered = hoveredSectionIndex === topSectionIndex;
                          const topCurrentColor = isTopHovered ? themeColor : dimensionColor;

                          return (
                            <>
                              {/* 안전선반 위 칸 치수 텍스트 */}
                              <EditableDimensionText
                                position={[
                                  viewMode === '3D' ? -innerWidth/2 * 0.3 - 0.8 : -innerWidth/2 * 0.3 - 0.5,
                                  topCenterY,
                                  viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0
                                ]}
                                fontSize={baseFontSize}
                                color={dimensionColor}
                                rotation={[0, 0, Math.PI / 2]}
                                value={topCompartmentHeight}
                                onValueChange={(newValue) => handleDimensionChange(index, newValue)}
                                sectionIndex={index}
                                furnitureId={furnitureId}
                                renderOrder={1000}
                                depthTest={false}
                                onHoverChange={(hovered) => setHoveredSectionIndex(hovered ? topSectionIndex : null)}
                              />

                              {/* 안전선반 위 칸 수직 연결선 (점선) */}
                              <group>
                                <NativeLine
                                  points={[
                                    [-innerWidth/2 * 0.3, topCompartmentTopY, viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0],
                                    [-innerWidth/2 * 0.3, topCompartmentBottomY, viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0]
                                  ]}
                                  color={topCurrentColor}
                                  lineWidth={1}
                                  dashed={true}
                                />

                                {/* 가이드선 클릭/hover 영역 */}
                                <mesh
                                  position={[-innerWidth/2 * 0.3, topCenterY, viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0]}
                                  onPointerOver={(e) => {
                                    e.stopPropagation();
                                    setHoveredSectionIndex(topSectionIndex);
                                  }}
                                  onPointerOut={(e) => {
                                    e.stopPropagation();
                                    setHoveredSectionIndex(null);
                                  }}
                                >
                                  <planeGeometry args={[0.3, Math.abs(topCompartmentTopY - topCompartmentBottomY)]} />
                                  <meshBasicMaterial transparent opacity={0} depthTest={false} side={2} />
                                </mesh>
                              </group>

                              {/* 수직선 양끝 엔드포인트 - 측면뷰에서 숨김 */}
                              {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
                                <>
                                  <mesh position={[-innerWidth/2 * 0.3, topCompartmentTopY, viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0]}>
                                    <sphereGeometry args={[0.05, 8, 8]} />
                                    <meshBasicMaterial color={topCurrentColor} />
                                  </mesh>
                                  <mesh position={[-innerWidth/2 * 0.3, topCompartmentBottomY, viewMode === '3D' ? depth/2 + 0.1 : depth/2 + 1.0]}>
                                    <sphereGeometry args={[0.05, 8, 8]} />
                                    <meshBasicMaterial color={topCurrentColor} />
                                  </mesh>
                                </>
                              )}
                            </>
                          );
                        })()}
                      </>
                    )}
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
