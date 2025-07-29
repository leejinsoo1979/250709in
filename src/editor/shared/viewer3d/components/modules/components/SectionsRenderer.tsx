import React from 'react';
import * as THREE from 'three';
import { SectionConfig } from '@/data/modules/shelving';
import { useSpace3DView } from '../../../context/useSpace3DView';
import ShelfRenderer from '../ShelfRenderer';
import DrawerRenderer from '../DrawerRenderer';
import { Html, Text, Line } from '@react-three/drei';
import { useUIStore } from '@/store/uiStore';

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
  
  // 가구 ID (칸 강조용)
  furnitureId?: string;
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
  furnitureId
}) => {
  // UI 상태에서 치수 표시 여부 가져오기
  const showDimensions = useUIStore(state => state.showDimensions);
  const { viewMode } = useSpace3DView();
  
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
      const sectionCenterY = currentYPosition + sectionHeight / 2;
      
      // 디버깅: 섹션 높이 확인
      if (section.type === 'open' || section.type === 'drawer') {
        console.log(`📏 Section ${index} (${section.type}):`, {
          calculatedHeight: sectionHeight,
          calculatedHeightMm: Math.round(sectionHeight / 0.01),
          totalHeight: height,
          totalHeightMm: Math.round(height / 0.01),
          availableHeight: height - basicThickness * 2,
          availableHeightMm: Math.round((height - basicThickness * 2) / 0.01)
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
                renderMode={renderMode}
                furnitureId={furnitureId}
              />
            );
          }
          break;
          
        case 'hanging':
          // 옷걸이 구역
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
                renderMode={renderMode}
                furnitureId={furnitureId}
              />
            );
          }
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
          
          {/* 섹션 내경 치수 표시 - 서랍과 오픈(하부장) 섹션 전체 높이 표시 */}
          {showDimensions && (section.type === 'drawer' || section.type === 'open') && (
            <group>
              {(() => {
                // 섹션의 실제 내경 계산
                let actualInternalHeight = sectionHeight;
                let bottomY = sectionCenterY - sectionHeight/2;
                let topY = sectionCenterY + sectionHeight/2;
                
                // 첫 번째 섹션이면 하부 프레임 고려
                if (index === 0) {
                  // 실제 내경은 하부 프레임 두께를 뺀 값
                  actualInternalHeight -= basicThickness;
                  // 하단 가이드선은 바닥 프레임 상단 (원래 위치 유지)
                  // bottomY += basicThickness;
                }
                
                // 다음 섹션이 있으면 중간 구분 패널 고려 (상단을 패널 하단으로)
                if (index < allSections.length - 1) {
                  topY -= basicThickness;
                }
                
                const centerY = (topY + bottomY) / 2;
                
                return (
                  <>
                    {/* 치수 텍스트 - 수직선 좌측에 표시 */}
                    <Text
                      position={[
                        -innerWidth/2 * 0.3 - 0.5, 
                        centerY, 
                        viewMode === '3D' 
                          ? basicThickness/2 + (depth - basicThickness)/2 + 0.01 
                          : basicThickness + 0.2
                      ]}
                      fontSize={0.32}
                      color="#4CAF50"
                      anchorX="center"
                      anchorY="middle"
                      rotation={[0, 0, Math.PI / 2]}
                    renderOrder={999}
                    depthTest={false}
                    >
                      {Math.round(actualInternalHeight / 0.01)}
                    </Text>
                    
                    {/* 수직 연결선 - 왼쪽으로 이동 */}
                    <Line
                      points={[
                        [-innerWidth/2 * 0.3, topY, viewMode === '3D' ? basicThickness/2 + (depth - basicThickness)/2 + 0.01 : basicThickness + 0.15],
                        [-innerWidth/2 * 0.3, bottomY, viewMode === '3D' ? basicThickness/2 + (depth - basicThickness)/2 + 0.01 : basicThickness + 0.15]
                      ]}
                      color="#4CAF50"
                      lineWidth={1}
                    />
                    {/* 수직 연결선 양끝 점 */}
                    <mesh position={[-innerWidth/2 * 0.3, topY, viewMode === '3D' ? basicThickness/2 + (depth - basicThickness)/2 + 0.01 : basicThickness + 0.15]}>
                      <sphereGeometry args={[0.03, 8, 8]} />
                      <meshBasicMaterial color="#4CAF50" />
                    </mesh>
                    <mesh position={[-innerWidth/2 * 0.3, bottomY, viewMode === '3D' ? basicThickness/2 + (depth - basicThickness)/2 + 0.01 : basicThickness + 0.15]}>
                      <sphereGeometry args={[0.03, 8, 8]} />
                      <meshBasicMaterial color="#4CAF50" />
                    </mesh>
                  </>
                );
              })()}
            </group>
          )}
          
          {/* 첫 번째 섹션의 하단 프레임 두께 표시 */}
          {showDimensions && index === 0 && (section.type === 'drawer' || section.type === 'open') && (
            <group>
              {/* 하단 프레임 두께 텍스트 - 수직선 좌측에 표시 */}
              <Text
                position={[
                  -innerWidth/2 * 0.3 - 0.5, 
                  -height/2 + basicThickness/2, 
                  viewMode === '3D' 
                    ? basicThickness/2 + (depth - basicThickness)/2 + 0.1 
                    : basicThickness/2 + 0.8
                ]}
                fontSize={0.32}
                color="#4CAF50"
                anchorX="center"
                anchorY="middle"
                rotation={[0, 0, Math.PI / 2]}
                renderOrder={999}
                depthTest={false}
              >
                {Math.round(basicThickness / 0.01)}
              </Text>
              
              {/* 하단 프레임 두께 수직선 - 왼쪽으로 이동 */}
              <Line
                points={[
                  [-innerWidth/2 * 0.3, -height/2, viewMode === '3D' ? basicThickness/2 + (depth - basicThickness)/2 + 0.01 : basicThickness/2 + 0.5],
                  [-innerWidth/2 * 0.3, -height/2 + basicThickness, viewMode === '3D' ? basicThickness/2 + (depth - basicThickness)/2 + 0.01 : basicThickness/2 + 0.5]
                ]}
                color="#4CAF50"
                lineWidth={1}
              />
              {/* 하단 프레임 두께 수직선 양끝 점 */}
              <mesh position={[-innerWidth/2 * 0.3, -height/2, viewMode === '3D' ? basicThickness/2 + (depth - basicThickness)/2 + 0.01 : basicThickness/2 + 0.5]}>
                <sphereGeometry args={[0.02, 8, 8]} />
                <meshBasicMaterial color="#4CAF50" />
              </mesh>
              <mesh position={[-innerWidth/2 * 0.3, -height/2 + basicThickness, viewMode === '3D' ? basicThickness/2 + (depth - basicThickness)/2 + 0.01 : basicThickness/2 + 0.5]}>
                <sphereGeometry args={[0.02, 8, 8]} />
                <meshBasicMaterial color="#4CAF50" />
              </mesh>
            </group>
          )}
          
          {/* 중간 구분 패널 두께 표시 */}
          {showDimensions && hasDividerPanel && (
            <group>
              {/* 중간 패널 두께 텍스트 - 수직선 좌측에 표시 */}
              <Text
                position={[
                  -innerWidth/2 * 0.3 - 0.5, 
                  dividerPanelY, 
                  viewMode === '3D' 
                    ? basicThickness/2 + (depth - basicThickness)/2 + 0.01 
                    : basicThickness/2 + 0.5
                ]}
                fontSize={0.32}
                color="#4CAF50"
                anchorX="center"
                anchorY="middle"
                rotation={[0, 0, Math.PI / 2]}
                renderOrder={999}
                depthTest={false}
              >
                {Math.round(basicThickness / 0.01)}
              </Text>
              
              {/* 수직 연결선 - 왼쪽으로 이동 */}
              <Line
                points={[
                  [-innerWidth/2 * 0.3, dividerPanelY + basicThickness/2, viewMode === '3D' ? basicThickness/2 + (depth - basicThickness)/2 + 0.01 : basicThickness/2 + 0.5],
                  [-innerWidth/2 * 0.3, dividerPanelY - basicThickness/2, viewMode === '3D' ? basicThickness/2 + (depth - basicThickness)/2 + 0.01 : basicThickness/2 + 0.5]
                ]}
                color="#4CAF50"
                lineWidth={1}
              />
              {/* 수직 연결선 양끝 점 */}
              <mesh position={[-innerWidth/2 * 0.3, dividerPanelY + basicThickness/2, viewMode === '3D' ? basicThickness/2 + (depth - basicThickness)/2 + 0.01 : basicThickness/2 + 0.5]}>
                <sphereGeometry args={[0.02, 8, 8]} />
                <meshBasicMaterial color="#4CAF50" />
              </mesh>
              <mesh position={[-innerWidth/2 * 0.3, dividerPanelY - basicThickness/2, viewMode === '3D' ? basicThickness/2 + (depth - basicThickness)/2 + 0.01 : basicThickness/2 + 0.5]}>
                <sphereGeometry args={[0.02, 8, 8]} />
                <meshBasicMaterial color="#4CAF50" />
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