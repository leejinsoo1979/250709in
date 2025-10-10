import React, { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useThree } from '@react-three/fiber';
import { useTheme } from '@/contexts/ThemeContext';
import { useUIStore } from '@/store/uiStore';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import BoxWithEdges from './BoxWithEdges';
import { AdjustableFootsRenderer } from './AdjustableFootsRenderer';
import { Text, Line } from '@react-three/drei';
import DimensionText from './DimensionText';
import { useDimensionColor } from '../hooks/useDimensionColor';

// 점선을 수동으로 그리는 컴포넌트
const ManualDashedBox: React.FC<{
  width: number;
  height: number;
  color: string;
  dashSize?: number;
  gapSize?: number;
}> = ({ width, height, color, dashSize = 0.03, gapSize = 0.02 }) => {
  const segmentLength = dashSize + gapSize;
  
  // 각 변에 대한 점선 세그먼트 생성
  const createDashedLine = (start: [number, number, number], end: [number, number, number]) => {
    const segments: Array<[number, number, number][]> = [];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const dz = end[2] - start[2];
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const numSegments = Math.floor(length / segmentLength);
    
    for (let i = 0; i < numSegments; i++) {
      const t1 = (i * segmentLength) / length;
      const t2 = Math.min((i * segmentLength + dashSize) / length, 1);
      
      if (t2 > t1) {
        segments.push([
          [start[0] + dx * t1, start[1] + dy * t1, start[2] + dz * t1],
          [start[0] + dx * t2, start[1] + dy * t2, start[2] + dz * t2]
        ]);
      }
    }
    
    return segments;
  };
  
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  
  // 사각형의 4개 변에 대한 점선 세그먼트
  const topSegments = createDashedLine([-halfWidth, halfHeight, 0], [halfWidth, halfHeight, 0]);
  const bottomSegments = createDashedLine([-halfWidth, -halfHeight, 0], [halfWidth, -halfHeight, 0]);
  const leftSegments = createDashedLine([-halfWidth, -halfHeight, 0], [-halfWidth, halfHeight, 0]);
  const rightSegments = createDashedLine([halfWidth, -halfHeight, 0], [halfWidth, halfHeight, 0]);
  
  const allSegments = [...topSegments, ...bottomSegments, ...leftSegments, ...rightSegments];
  
  return (
    <group>
      {allSegments.map((segment, index) => {
        const geometry = new THREE.BufferGeometry().setFromPoints(
          segment.map(point => new THREE.Vector3(...point))
        );
        
        return (
          <line key={index} geometry={geometry}>
            <lineBasicMaterial 
              color={color} 
              transparent={true}
              opacity={0.01}
            />
          </line>
        );
      })}
    </group>
  );
};


// BaseFurnitureShell Props 인터페이스
interface BaseFurnitureShellProps {
  // 치수 관련
  width: number;
  height: number;
  depth: number;
  innerWidth: number;
  innerHeight: number;
  
  // 계산된 값들
  basicThickness: number;
  backPanelThickness: number;
  adjustedDepthForShelves: number;
  shelfZOffset: number;
  
  // 재질
  material: THREE.Material;
  
  // 헬퍼 함수들
  isMultiSectionFurniture: () => boolean;
  getSectionHeights: () => number[];
  mmToThreeUnits: (mm: number) => number;
  
  // 드래그 상태
  isDragging?: boolean;
  
  // 편집 모드 상태
  isEditMode?: boolean;
  
  // 강조 상태
  isHighlighted?: boolean;
  
  // 백패널 유무
  hasBackPanel?: boolean;
  
  // 가구 데이터 (ID 확인용)
  moduleData?: { id: string };
  
  // 띄움배치 여부
  isFloating?: boolean;
  
  // 공간 정보 (받침대 높이 확인용)
  spaceInfo?: SpaceInfo;
  
  // 자식 컴포넌트 (내부 구조)
  children?: React.ReactNode;
}

/**
 * BaseFurnitureShell 컴포넌트
 * - 가구의 기본 구조 (측면판, 상하판, 백패널) 렌더링
 * - 타입별 컴포넌트들이 공통으로 사용하는 기본 쉘
 * - 내부 구조는 children으로 전달받아 렌더링
 */
const BaseFurnitureShell: React.FC<BaseFurnitureShellProps> = ({
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
  isMultiSectionFurniture,
  getSectionHeights,
  mmToThreeUnits,
  isDragging = false,
  isEditMode = false,
  isHighlighted = false,
  hasBackPanel = true, // 기본값은 true (백패널 있음)
  moduleData,
  isFloating = false, // 기본값은 false (바닥 배치)
  spaceInfo,
  children
}) => {
  const { renderMode, viewMode } = useSpace3DView(); // context에서 renderMode와 viewMode 가져오기
  const { gl } = useThree(); // Three.js renderer 가져오기
  const { theme } = useTheme(); // 테마 정보 가져오기
  const { view2DDirection, showDimensions, showDimensionsText } = useUIStore(); // UI 스토어에서 view2DDirection 가져오기
  const { dimensionColor, baseFontSize } = useDimensionColor();
  
  // BaseFurnitureShell을 사용하는 가구들의 그림자 업데이트 - 제거
  // 그림자 자동 업데이트가 활성화되어 있으므로 수동 업데이트 불필요
  
  return (
    <group>
      {/* 좌우 측면 판재 - 다중 섹션은 상하 분할, 나머지는 통짜 */}
      <>
        {(moduleData?.id?.includes('4drawer-hanging') || moduleData?.id?.includes('2drawer-hanging') || moduleData?.id?.includes('2hanging')) && isMultiSectionFurniture() && getSectionHeights().length === 2 ? (
          // 다중 섹션: 좌우 측판을 상부/하부로 분할
          <>
            {(() => {
              const lowerSectionHeight = getSectionHeights()[0];
              const upperSectionHeight = getSectionHeights()[1];

              // 4drawer-hanging: 하부 측판 -18mm, 상부 측판 +18mm
              // 2drawer-hanging, 2hanging: 하부 측판 +18mm, 상부 측판 -18mm
              const is4Drawer = moduleData?.id?.includes('4drawer-hanging');

              const adjustedLowerHeight = is4Drawer
                ? lowerSectionHeight - basicThickness  // 4단: 하부 18mm 줄임
                : lowerSectionHeight + basicThickness; // 2단: 하부 18mm 늘림
              const lowerPanelY = -height/2 + adjustedLowerHeight/2;

              const adjustedUpperHeight = is4Drawer
                ? upperSectionHeight + basicThickness  // 4단: 상부 18mm 늘림
                : upperSectionHeight - basicThickness; // 2단: 상부 18mm 줄임
              const upperPanelY = is4Drawer
                ? -height/2 + lowerSectionHeight - basicThickness + adjustedUpperHeight/2  // 4단
                : -height/2 + lowerSectionHeight + basicThickness + adjustedUpperHeight/2; // 2단

              return (
                <>
                  {/* 왼쪽 하부 측판 (18mm 연장) */}
                  <BoxWithEdges
                    args={[basicThickness, adjustedLowerHeight, depth]}
                    position={[-innerWidth/2 - basicThickness/2, lowerPanelY, 0]}
                    material={material}
                    renderMode={renderMode}
                    isDragging={isDragging}
                  />

                  {/* 왼쪽 상부 측판 (18mm 단축) */}
                  <BoxWithEdges
                    args={[basicThickness, adjustedUpperHeight, depth]}
                    position={[-innerWidth/2 - basicThickness/2, upperPanelY, 0]}
                    material={material}
                    renderMode={renderMode}
                    isDragging={isDragging}
                  />

                  {/* 오른쪽 하부 측판 (18mm 연장) */}
                  <BoxWithEdges
                    args={[basicThickness, adjustedLowerHeight, depth]}
                    position={[innerWidth/2 + basicThickness/2, lowerPanelY, 0]}
                    material={material}
                    renderMode={renderMode}
                    isDragging={isDragging}
                  />

                  {/* 오른쪽 상부 측판 (18mm 단축) */}
                  <BoxWithEdges
                    args={[basicThickness, adjustedUpperHeight, depth]}
                    position={[innerWidth/2 + basicThickness/2, upperPanelY, 0]}
                    material={material}
                    renderMode={renderMode}
                    isDragging={isDragging}
                  />
                </>
              );
            })()}
          </>
        ) : (
          // 기존: 통짜 측판
          <>
            {/* 왼쪽 측면 판재 */}
            <BoxWithEdges
              args={[basicThickness, height, depth]}
              position={[-innerWidth/2 - basicThickness/2, 0, 0]}
              material={material}
              renderMode={renderMode}
              isDragging={isDragging}
            />
            
            {/* 오른쪽 측면 판재 */}
            <BoxWithEdges
              args={[basicThickness, height, depth]}
              position={[innerWidth/2 + basicThickness/2, 0, 0]}
              material={material}
              renderMode={renderMode}
              isDragging={isDragging}
            />
          </>
        )}
        
        {/* 다중 섹션 가구인 경우 중간 구분 패널 렌더링 */}
        {isMultiSectionFurniture() && getSectionHeights().length > 1 && (
          <>
            {moduleData?.id?.includes('4drawer-hanging') ? (
              // Type4 전용 (Single + Dual): 하부 섹션 상판 + 상부 섹션 바닥판 (18mm 아래로)
              (() => {
                // 하부 측판이 1000mm, 상판을 18mm 아래로
                const drawerSectionHeight = mmToThreeUnits(1000);
                const lowerTopPanelY = -height/2 + drawerSectionHeight - basicThickness/2;
                const actualThickness = basicThickness * 100;

                return (
                  <>
                    {/* 하부 섹션 상판 (18mm 아래) */}
                    <BoxWithEdges
                      args={[innerWidth, basicThickness, adjustedDepthForShelves - basicThickness]}
                      position={[0, lowerTopPanelY, basicThickness/2 + shelfZOffset]}
                      material={material}
                      renderMode={renderMode}
                      isDragging={isDragging}
                    />

                    {/* 상부 섹션 바닥판 - 하부 섹션 상판 바로 위 */}
                    <BoxWithEdges
                      args={[innerWidth, basicThickness, adjustedDepthForShelves - basicThickness]}
                      position={[0, lowerTopPanelY + basicThickness, basicThickness/2 + shelfZOffset]}
                      material={material}
                      renderMode={renderMode}
                      isDragging={isDragging}
                    />
                  </>
                );
              })()
            ) : moduleData?.id?.includes('2drawer-hanging') || moduleData?.id?.includes('2hanging') ? (
              // 2drawer-hanging, 2hanging: 하부 섹션 상판 + 상부 섹션 바닥판
              (() => {
                return getSectionHeights().map((sectionHeight: number, index: number) => {
                  if (index >= getSectionHeights().length - 1) return null;

                  let currentYPosition = -height/2 + basicThickness;

                  // 현재 섹션까지의 Y 위치 계산
                  for (let i = 0; i <= index; i++) {
                    currentYPosition += getSectionHeights()[i];
                  }

                  // 두 패널 모두 18mm(basicThickness) 위로 이동
                  const middlePanelY = currentYPosition - basicThickness/2 + basicThickness;
                  const lowerTopPanelY = middlePanelY - basicThickness;

                  return (
                    <React.Fragment key={`divider-${index}`}>
                      {/* 하부 섹션 상판 */}
                      <BoxWithEdges
                        args={[innerWidth, basicThickness, adjustedDepthForShelves - basicThickness]}
                        position={[0, lowerTopPanelY, basicThickness/2 + shelfZOffset]}
                        material={material}
                        renderMode={renderMode}
                        isDragging={isDragging}
                      />

                      {/* 상부 섹션 바닥판 */}
                      <BoxWithEdges
                        args={[innerWidth, basicThickness, adjustedDepthForShelves - basicThickness]}
                        position={[0, middlePanelY, basicThickness/2 + shelfZOffset]}
                        material={material}
                        renderMode={renderMode}
                        isDragging={isDragging}
                      />
                    </React.Fragment>
                  );
                });
              })()
            ) : (
              // 기존 로직 (다른 가구들)
              (() => {
                return getSectionHeights().map((sectionHeight: number, index: number) => {
                  if (index >= getSectionHeights().length - 1) return null;

                let currentYPosition = -height/2 + basicThickness;

                // 현재 섹션까지의 Y 위치 계산
                for (let i = 0; i <= index; i++) {
                  currentYPosition += getSectionHeights()[i];
                }

                const dividerY = currentYPosition - basicThickness/2;

                return (
                  <BoxWithEdges
                    key={`divider-${index}`}
                    args={[innerWidth, basicThickness, adjustedDepthForShelves - basicThickness]}
                    position={[0, dividerY, basicThickness/2 + shelfZOffset]}
                    material={material}
                    renderMode={renderMode}
                    isDragging={isDragging}
                  />
                );
              });
              })()
            )}
          </>
        )}
      </>
      
      {/* 상단 판재 */}
      <BoxWithEdges
        args={[innerWidth, basicThickness, depth]}
        position={[0, height/2 - basicThickness/2, 0]}
        material={material}
        renderMode={renderMode}
        isDragging={isDragging}
      />
      
      {/* Type4 상단 상판 두께 치수 표시 */}
      {(moduleData?.id?.includes('4drawer-hanging') || moduleData?.id?.includes('2drawer-hanging')) && showDimensions && showDimensionsText && (
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
      />
      
      {/* 뒷면 판재 (9mm 얇은 백패널, 상하좌우 각 5mm 확장) - hasBackPanel이 true일 때만 렌더링 */}
      {hasBackPanel && (
        <BoxWithEdges
          args={[innerWidth + mmToThreeUnits(10), innerHeight + mmToThreeUnits(10), backPanelThickness]}
          position={[0, 0, -depth/2 + backPanelThickness/2 + mmToThreeUnits(17)]}
          material={material}
          renderMode={renderMode}
          isDragging={isDragging}
          isBackPanel={true} // 백패널임을 표시
        />
      )}
      
      {/* 내부 구조 (타입별로 다른 내용) */}
      {children}
      
      {/* 조절발통 (네 모서리) - 띄움배치가 아닐 때만 */}
      <AdjustableFootsRenderer
        width={width}
        depth={depth}
        yOffset={-height / 2}
        material={material}
        renderMode={renderMode}
        isHighlighted={isHighlighted}
        isFloating={isFloating}
        baseHeight={spaceInfo?.baseConfig?.height || 65}
        viewMode={viewMode}
        view2DDirection={view2DDirection}
      />
    </group>
  );
};

export default BaseFurnitureShell; 