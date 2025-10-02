import React from 'react';
import * as THREE from 'three';
import { useSpace3DView } from '../../context/useSpace3DView';
import { Text } from '@react-three/drei';
import { NativeLine } from '@/editor/shared/viewer3d/components/elements/NativeLine';
import { useUIStore } from '@/store/uiStore';
import { ThreeEvent } from '@react-three/fiber';
import BoxWithEdges from './components/BoxWithEdges';
import { useDimensionColor } from './hooks/useDimensionColor';


interface ShelfRendererProps {
  shelfCount: number;
  innerWidth: number;
  innerHeight: number;
  depth: number;
  basicThickness: number;
  material: THREE.Material;
  yOffset?: number; // 전체 선반 그룹의 Y축 오프셋
  zOffset?: number; // 선반의 Z축 위치 조정 (백패널 전진 대응)
  // 절대 위치 지정 (DrawerRenderer 스타일)
  shelfPositions?: number[]; // 각 선반의 Y 위치 (mm, 섹션 하단 기준)
  isTopFinishPanel?: boolean; // 최상단 마감 패널 여부
  renderMode: 'solid' | 'wireframe'; // 렌더 모드 추가
  furnitureId?: string; // 가구 ID (칸 강조용)
  showTopFrameDimension?: boolean; // 상단 프레임 치수 표시 여부
  isHighlighted?: boolean; // 가구 강조 여부
}

/**
 * ShelfRenderer 컴포넌트 (범용적으로 개선)
 * 
 * 임의의 선반 개수에 대응하여 선반을 렌더링합니다.
 * yOffset을 통해 특정 구역(section) 내에서 위치 조정 가능합니다.
 */
export const ShelfRenderer: React.FC<ShelfRendererProps> = ({
  shelfCount,
  innerWidth,
  innerHeight,
  depth,
  basicThickness,
  material,
  yOffset = 0,
  zOffset = 0,
  shelfPositions,
  isTopFinishPanel,
  renderMode,
  furnitureId,
  showTopFrameDimension = false,
  isHighlighted = false,
}) => {
  const showDimensions = useUIStore(state => state.showDimensions);
  const showDimensionsText = useUIStore(state => state.showDimensionsText);
  const view2DDirection = useUIStore(state => state.view2DDirection);
  const highlightedCompartment = useUIStore(state => state.highlightedCompartment);
  const setHighlightedCompartment = useUIStore(state => state.setHighlightedCompartment);
  const { dimensionColor, baseFontSize, viewMode } = useDimensionColor();
  const textColor = dimensionColor;
  const mmToThreeUnits = (mm: number) => mm / 100;
  
  if (shelfCount <= 0) {
    return null;
  }

  // 절대 위치 모드: 마감 패널 또는 절대 위치 지정
  if (isTopFinishPanel && shelfCount === 1) {
    // 최상단 마감 패널 모드 (기존 18mm에서 추가로 18mm 위로, 총 0mm)
    const topPosition = innerHeight / 2 - basicThickness / 2;
    
    return (
      <group position={[0, yOffset, 0]}>
        <BoxWithEdges
          args={[innerWidth, basicThickness, depth - basicThickness]}
          position={[0, topPosition, basicThickness/2 + zOffset]}
          material={material}
          renderMode={renderMode}
          isHighlighted={isHighlighted}
        />
      </group>
    );
  }
  
  if (shelfPositions && shelfPositions.length === shelfCount) {
    // 절대 위치 모드: 지정된 위치에 선반 배치
    return (
      <group position={[0, yOffset, 0]}>
        {shelfPositions.map((positionMm, i) => {
          // positionMm === 0인 경우는 치수만 표시하고 패널은 렌더링하지 않음 (BaseFurnitureShell에서 렌더링)
          if (positionMm === 0) {
            return null;
          }
          
          // 섹션 하단 기준 위치를 Three.js 좌표로 변환
          const relativeYPosition = (-innerHeight / 2) + mmToThreeUnits(positionMm);
          
          return (
            <BoxWithEdges
              key={`shelf-${i}`}
              args={[innerWidth, basicThickness, depth - basicThickness]}
              position={[0, relativeYPosition, basicThickness/2 + zOffset]}
              material={material}
              renderMode={renderMode}
              isHighlighted={isHighlighted}
            />
          );
        })}
        
        {/* 치수 표시 - showDimensions와 showDimensionsText가 모두 true이고 상단 마감 패널이 아닐 때 표시 */}
        {/* Type2의 하단 섹션처럼 선반이 1개이고 상단 근처에만 있는 경우는 제외 */}
        {/* 단, 첫 번째 칸의 높이가 100mm 이상이면 표시 */}
        {showDimensions && showDimensionsText && !isTopFinishPanel && !(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right' || view2DDirection === 'top')) && (
          <group>
            {(() => {
              const compartmentHeights: Array<{ height: number; centerY: number }> = [];
              
              // 첫 번째 칸의 높이를 미리 계산하여 표시 여부 결정
              let shouldShowDimensions = true;
              let firstCompartmentHeightMm = 0;
              
              // 첫 번째 칸 (맨 아래) - 바닥부터 첫 번째 선반 하단까지
              if (shelfPositions.length > 0) {
                // positionMm === 0인 경우 (바닥판) - 칸 높이 치수는 표시하지 않음 (선반 두께만 표시)
                if (shelfPositions[0] === 0) {
                  // 바닥판은 shelfThicknessElements에서 처리
                } else {
                  const firstShelfBottomMm = shelfPositions[0] - basicThickness / 0.01 / 2; // 첫 번째 선반의 하단
                  firstCompartmentHeightMm = firstShelfBottomMm;
                  
                  // 선반이 1개이고 상단 근처에 있으며, 첫 번째 칸이 100mm 미만인 경우만 제외
                  if (shelfPositions.length === 1 && shelfPositions[0] > (innerHeight / 0.01) * 0.9 && firstCompartmentHeightMm < 100) {
                    shouldShowDimensions = false;
                  }
                  
                  if (shouldShowDimensions) {
                    const height = mmToThreeUnits(firstShelfBottomMm); // 바닥(0)부터 선반 하단까지 (Three.js 단위로 변환)
                    const centerY = (-innerHeight / 2) + height / 2;
                  
                  console.log('🔴 절대위치모드 - 첫 번째 칸:', {
                    shelfPositions_0: shelfPositions[0],
                    basicThickness,
                    basicThickness_mm: basicThickness * 100,
                    firstShelfBottomMm,
                    height,
                    height_mm: height * 100,
                    표시될값: Math.round(height * 100)
                  });
                  
                    compartmentHeights.push({
                      height,
                      centerY
                    });
                  }
                }
              }
              
              // 중간 칸들 - 현재 선반 상단부터 다음 선반 하단까지
              for (let i = 0; i < shelfPositions.length - 1; i++) {
                const currentShelfTopMm = shelfPositions[i] + basicThickness / 0.01 / 2; // 현재 선반의 상단
                const nextShelfBottomMm = shelfPositions[i + 1] - basicThickness / 0.01 / 2; // 다음 선반의 하단
                const heightMm = nextShelfBottomMm - currentShelfTopMm;
                const height = mmToThreeUnits(heightMm); // Three.js 단위로 변환
                const centerY = (-innerHeight / 2) + mmToThreeUnits(currentShelfTopMm + heightMm / 2);
                compartmentHeights.push({ height, centerY });
              }
              
              // 마지막 칸은 일반적인 선반 구성에서만 계산
              // Type2의 하단 섹션처럼 상단 마감 패널만 있는 경우는 제외
              // DualType5 스타일러장 우측의 경우도 상단 칸 치수 제외
              // Type4(4drawer-hanging)의 경우도 안전선반까지만 표시하고 상단 칸 치수 제외
              const isDualType5Right = furnitureId && furnitureId.includes('dual-2drawer-styler') && innerHeight > 2000;
              const isType4 = furnitureId && furnitureId.includes('4drawer-hanging');
              if (shelfPositions.length > 0 && !(shelfPositions.length === 1 && shelfPositions[0] > (innerHeight / 0.01) * 0.9)) {
                // 스타일러장 우측과 Type4가 아닌 경우에만 마지막 칸 추가
                if (!isDualType5Right && !isType4) {
                  const lastShelfPos = shelfPositions[shelfPositions.length - 1];
                  const lastShelfTopMm = lastShelfPos + basicThickness / 0.01 / 2; // 선반 상단 위치
                  // 섹션의 상단에서 프레임 두께의 2배만큼 아래가 정확한 위치
                  // innerHeight는 섹션의 높이이고, 상단 프레임은 섹션 위에 있음
                  // 프레임 두께를 2번 빼면 정확한 프레임 하단 위치
                  const topFrameBottomMm = (innerHeight / 0.01) - (basicThickness / 0.01) * 2;
                  const heightMm = topFrameBottomMm - lastShelfTopMm; // 선반 상단부터 상단 프레임 하단까지
                  const height = mmToThreeUnits(heightMm); // Three.js 단위로 변환
                  const centerY = (-innerHeight / 2) + mmToThreeUnits(lastShelfTopMm + heightMm / 2);
                  compartmentHeights.push({ height, centerY });
                }
              }
              
              // 선반 프레임 두께 치수 추가
              const shelfThicknessElements = [];
              
              // 각 선반의 두께 표시
              shelfPositions.forEach((shelfPos, i) => {
                // shelfPos === 0인 경우 바닥판: 섹션 하단에서 basicThickness/2 위
                const shelfY = shelfPos === 0 
                  ? (-innerHeight / 2) + basicThickness / 2
                  : (-innerHeight / 2) + mmToThreeUnits(shelfPos);
                const shelfTopY = shelfY + basicThickness / 2;
                const shelfBottomY = shelfY - basicThickness / 2;
                
                console.log(`🟣 선반 ${i} 엔드포인트 (shelfPos=${shelfPos}):`, {
                  'shelfTopY_mm': shelfTopY * 100,
                  'shelfBottomY_mm': shelfBottomY * 100,
                  '위점렌더링': 'O',
                  '아래점렌더링': shelfPos !== 0 ? 'O' : 'X'
                });
                
                shelfThicknessElements.push(
                  <group key={`shelf-thickness-${i}`}>
                    {/* 선반 두께 치수 텍스트 - 수직선 좌측에 표시 (3D 그림자) */}
                    {viewMode === '3D' && (
                      <Text
                        position={[
                          -innerWidth/2 * 0.3 - 0.8 + 0.01, 
                          shelfY - 0.01, 
                          (furnitureId && furnitureId.includes('-right-section') ? 3.01 : depth/2 + 0.1) - 0.01
                        ]}
                        fontSize={baseFontSize}
                        color="rgba(0, 0, 0, 0.3)"
                        anchorX="center"
                        anchorY="middle"
                        rotation={[0, 0, Math.PI / 2]}
                        renderOrder={998}
                        depthTest={false}
                      >
                        {Math.round((basicThickness > 0 ? basicThickness : 0.18) * 100)}
                      </Text>
                    )}
                    <Text
                      position={[
                        viewMode === '3D' ? -innerWidth/2 * 0.3 - 0.8 : -innerWidth/2 * 0.3 - 0.5, 
                        shelfY, 
                        viewMode === '3D' ? (furnitureId && furnitureId.includes('-right-section') ? 3.01 : depth/2 + 0.1) : depth/2 + 1.0
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
                    
                    {/* 선반 두께 수직선 - 왼쪽으로 이동 */}
                    <NativeLine
                      points={[
                        [-innerWidth/2 * 0.3, shelfTopY, viewMode === '3D' ? (furnitureId && furnitureId.includes('-right-section') ? 3.01 : depth/2 + 0.1) : depth/2 + 1.0],
                        [-innerWidth/2 * 0.3, shelfBottomY, viewMode === '3D' ? (furnitureId && furnitureId.includes('-right-section') ? 3.01 : depth/2 + 0.1) : depth/2 + 1.0]
                      ]}
                      color={dimensionColor}
                      lineWidth={1}
                      dashed={false}
                    />
                    {/* 선반 두께 수직선 양끝 점 - 바닥판(position 0)은 위쪽 점 제외 */}
                    {shelfPos !== 0 && (
                      <mesh position={[-innerWidth/2 * 0.3, shelfTopY, viewMode === '3D' ? (furnitureId && furnitureId.includes('-right-section') ? 3.01 : depth/2 + 0.1) : depth/2 + 1.0]}>
                        <sphereGeometry args={[0.05, 8, 8]} />
                        <meshBasicMaterial color={dimensionColor} />
                      </mesh>
                    )}
                    {shelfPos !== 0 && (
                      <mesh position={[-innerWidth/2 * 0.3, shelfBottomY, viewMode === '3D' ? (furnitureId && furnitureId.includes('-right-section') ? 3.01 : depth/2 + 0.1) : depth/2 + 1.0]}>
                        <sphereGeometry args={[0.05, 8, 8]} />
                        <meshBasicMaterial color={dimensionColor} />
                      </mesh>
                    )}
                  </group>
                );
              });
              
              // 상단 프레임 두께 표시 추가
              // BaseFurnitureShell에서 상단 프레임은 height/2 - basicThickness/2 위치에 있음
              // height = innerHeight + 2 * basicThickness
              // 상단 프레임 중심 = height/2 - basicThickness/2
              //                 = (innerHeight + 2*basicThickness)/2 - basicThickness/2
              //                 = innerHeight/2 + basicThickness - basicThickness/2
              //                 = innerHeight/2 + basicThickness/2
              
              // 상단 프레임의 위치 계산
              // ShelfRenderer는 섹션 내부에서 작동하므로, 섹션 좌표계에서의 상단 프레임 위치를 계산해야 함
              // 섹션의 innerHeight는 섹션의 높이이고, 상단 프레임은 전체 가구의 상단에 있음
              // 전체 가구에서 상단 프레임은 height/2 - basicThickness/2 위치
              // 섹션은 -height/2 + basicThickness에서 시작하므로
              // 섹션 좌표계에서 상단 프레임까지의 거리를 계산해야 함
              
              // 상단 프레임 위치 공식:
              // ShelfRenderer는 섹션 내부에서 작동하며, 섹션은 가구 내부 공간에 배치됨
              // 섹션의 innerHeight는 섹션의 실제 내부 높이 (상하 프레임 제외)
              // 가구 전체에서 상단 프레임은 가구 상단에서 basicThickness/2 아래에 있음
              // 섹션 좌표계에서는 섹션 상단(innerHeight/2)에서 basicThickness만큼 위에 있음
              // 하지만 섹션 자체가 상하에 basicThickness만큼 프레임을 가지므로
              // 실제로는 innerHeight/2 - basicThickness * 1.5가 정확한 위치
              // 상단 프레임 위치 계산
              // DualType5 스타일러장 우측의 경우 특별 처리
              const isDualType5RightSection = furnitureId && furnitureId.includes('-right-section');
              const topFrameY = isDualType5RightSection 
                ? innerHeight/2 - basicThickness/2 + basicThickness  // 스타일러장 우측: 18mm 위로
                : innerHeight/2 - basicThickness * 1.5; // 일반 가구: 섹션 위에 프레임
              const topFrameTopY = topFrameY + basicThickness / 2; // 상단 프레임의 상단
              const topFrameBottomY = topFrameY - basicThickness / 2; // 상단 프레임의 하단
              
              // 상단 프레임 치수는 showTopFrameDimension이 true일 때만 표시
              if (showTopFrameDimension) {
                console.log('🟣 상단 프레임 엔드포인트:', {
                  'topFrameTopY_mm': topFrameTopY * 100,
                  'topFrameBottomY_mm': topFrameBottomY * 100,
                  '위점렌더링': 'O',
                  '아래점렌더링': 'O'
                });
                shelfThicknessElements.push(
                <group key="top-frame-thickness">
                  {/* 상단 프레임 두께 치수 텍스트 - 수직선 좌측에 표시 (3D 그림자) */}
                  {viewMode === '3D' && (
                    <Text
                      position={[
                        -innerWidth/2 * 0.3 - 0.8 + 0.01, 
                        topFrameY - 0.01, 
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
                      {Math.round((basicThickness > 0 ? basicThickness : 0.18) * 100)}
                    </Text>
                  )}
                  <Text
                    position={[
                      viewMode === '3D' ? -innerWidth/2 * 0.3 - 0.8 : -innerWidth/2 * 0.3 - 0.5, 
                      topFrameY, 
                      viewMode === '3D' ? (furnitureId && furnitureId.includes('-right-section') ? 3.01 : depth/2 + 0.1) : depth/2 + 1.0
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
                  
                  {/* 상단 프레임 두께 수직선 - 왼쪽으로 이동 */}
                  <NativeLine
                    points={[
                      [-innerWidth/2 * 0.3, topFrameTopY, viewMode === '3D' ? (furnitureId && furnitureId.includes('-right-section') ? 3.01 : depth/2 + 0.1) : depth/2 + 1.0],
                      [-innerWidth/2 * 0.3, topFrameBottomY, viewMode === '3D' ? (furnitureId && furnitureId.includes('-right-section') ? 3.01 : depth/2 + 0.1) : depth/2 + 1.0]
                    ]}
                    color={dimensionColor}
                    lineWidth={1}
                    dashed={false}
                  />
                  {/* 상단 프레임 두께 수직선 양끝 점 */}
                  <mesh position={[-innerWidth/2 * 0.3, topFrameTopY, viewMode === '3D' ? (furnitureId && furnitureId.includes('-right-section') ? 3.01 : depth/2 + 0.1) : depth/2 + 1.0]}>
                    <sphereGeometry args={[0.05, 8, 8]} />
                    <meshBasicMaterial color={dimensionColor} />
                  </mesh>
                  <mesh position={[-innerWidth/2 * 0.3, topFrameBottomY, viewMode === '3D' ? (furnitureId && furnitureId.includes('-right-section') ? 3.01 : depth/2 + 0.1) : depth/2 + 1.0]}>
                    <sphereGeometry args={[0.05, 8, 8]} />
                    <meshBasicMaterial color={dimensionColor} />
                  </mesh>
                </group>
                );
              }
              
              // shouldShowDimensions가 false면 빈 요소 반환
              if (!shouldShowDimensions) {
                return null;
              }
              
              return (
                <>
                  {compartmentHeights.map((compartment, i) => {
                    // DualType5 스타일러장 우측의 마지막 칸(상단)은 치수 표시 제외
                    const isDualType5Right = furnitureId && furnitureId.includes('-right-section');
                    
                    // 안전선반이 있는 경우(칸이 2개 이상) 마지막 칸은 치수 표시 안함
                    if (isDualType5Right && compartmentHeights.length >= 2 && i === compartmentHeights.length - 1) {
                      return null;
                    }
                    // 각 칸의 상단과 하단 Y 좌표 계산
                    let compartmentTop, compartmentBottom;
                    
                    // 각 칸의 정확한 위치 계산
                    if (i === 0) {
                      // 첫 번째 칸: 바닥부터 첫 선반 하단까지
                      compartmentBottom = -innerHeight / 2; // 바닥
                      compartmentTop = (-innerHeight / 2) + mmToThreeUnits(shelfPositions[0]) - basicThickness / 2; // 첫 선반 하단
                    } else if (i === compartmentHeights.length - 1 && shelfPositions.length > 0) {
                      // 마지막 칸: 마지막 선반 상단부터 상단 프레임 하단까지
                      const lastShelfPos = shelfPositions[shelfPositions.length - 1];
                      compartmentBottom = (-innerHeight / 2) + mmToThreeUnits(lastShelfPos) + basicThickness / 2; // 마지막 선반 상단
                      // 상단 프레임 하단까지만 (섹션 상단에서 프레임 두께의 2배만큼 아래)
                      const topFrameBottomMm = (innerHeight / 0.01) - (basicThickness / 0.01) * 2;
                      compartmentTop = (-innerHeight / 2) + mmToThreeUnits(topFrameBottomMm); // 상단 프레임 하단
                    } else {
                      // 중간 칸: 현재 선반 상단부터 다음 선반 하단까지
                      const currentShelfPos = shelfPositions[i - 1];
                      const nextShelfPos = shelfPositions[i];
                      compartmentBottom = (-innerHeight / 2) + mmToThreeUnits(currentShelfPos) + basicThickness / 2; // 현재 선반 상단
                      compartmentTop = (-innerHeight / 2) + mmToThreeUnits(nextShelfPos) - basicThickness / 2; // 다음 선반 하단
                    }
                    
                    // 현재 칸이 강조되어야 하는지 확인
                    const compartmentId = furnitureId ? `${furnitureId}-${i}` : null;
                    const isHighlighted = compartmentId && highlightedCompartment === compartmentId;
                    
                    return (
                      <group key={`dimension-${i}`}>
                    {/* 치수 텍스트 - 수직 가이드선 좌측에 표시 */}
                    {viewMode === '3D' && (
                      <Text
                        renderOrder={1000}
                        depthTest={false}
                        position={[
                          -innerWidth/2 * 0.3 - 0.8 + 0.01, 
                          compartment.centerY - 0.01, 
                          (furnitureId && furnitureId.includes('-right-section') ? 3.01 : depth/2 + 0.1) - 0.01
                        ]}
                        fontSize={baseFontSize}
                        color="rgba(0, 0, 0, 0.3)"
                        anchorX="center"
                        anchorY="middle"
                        rotation={[0, 0, Math.PI / 2]}
                        renderOrder={998}
                      >
                        {Math.round(compartment.height * 100)}
                      </Text>
                    )}
                    <Text
                        renderOrder={1000}
                        depthTest={false}
                      position={[
                        viewMode === '3D' ? -innerWidth/2 * 0.3 - 0.8 : -innerWidth/2 * 0.3 - 0.5, 
                        compartment.centerY, 
                        viewMode === '3D' ? (furnitureId && furnitureId.includes('-right-section') ? 3.01 : depth/2 + 0.1) : basicThickness + zOffset + 0.2
                      ]}
                      fontSize={baseFontSize}
                      color={isHighlighted ? "#FFD700" : textColor}
                      anchorX="center"
                      anchorY="middle"
                      rotation={[0, 0, Math.PI / 2]} // 텍스트를 270도 회전하여 세로로 표시 (읽기 쉽게)
                      renderOrder={999}
                      onClick={(e: ThreeEvent<MouseEvent>) => {
                        e.stopPropagation();
                        if (compartmentId) {
                          setHighlightedCompartment(highlightedCompartment === compartmentId ? null : compartmentId);
                        }
                      }}
                      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
                        e.stopPropagation();
                        document.body.style.cursor = 'pointer';
                      }}
                      onPointerOut={(e: ThreeEvent<PointerEvent>) => {
                        e.stopPropagation();
                        document.body.style.cursor = 'auto';
                      }}
                    >
                      {Math.round(compartment.height * 100)}
                    </Text>
                    
                    {/* 수직 연결선 (치수선) - 왼쪽으로 이동 */}
                    <NativeLine
                      points={[
                        [-innerWidth/2 * 0.3, compartmentTop, viewMode === '3D' ? (furnitureId && furnitureId.includes('-right-section') ? 3.01 : depth/2 + 0.1) : basicThickness + zOffset + 0.15],
                        [-innerWidth/2 * 0.3, compartmentBottom, viewMode === '3D' ? (furnitureId && furnitureId.includes('-right-section') ? 3.01 : depth/2 + 0.1) : basicThickness + zOffset + 0.15]
                      ]}
                      color={isHighlighted ? "#FFD700" : dimensionColor}
                      lineWidth={isHighlighted ? 2 : 1}
                      dashed={false}
                    />
                    {/* 수직 연결선 양끝 점 */}
                    <mesh position={[-innerWidth/2 * 0.3, compartmentTop, viewMode === '3D' ? (furnitureId && furnitureId.includes('-right-section') ? 3.01 : depth/2 + 0.1) : basicThickness + zOffset + 0.15]}>
                      <sphereGeometry args={[0.05, 8, 8]} />
                      <meshBasicMaterial color={isHighlighted ? "#FFD700" : dimensionColor} />
                    </mesh>
                    <mesh position={[-innerWidth/2 * 0.3, compartmentBottom, viewMode === '3D' ? (furnitureId && furnitureId.includes('-right-section') ? 3.01 : depth/2 + 0.1) : basicThickness + zOffset + 0.15]}>
                      <sphereGeometry args={[0.05, 8, 8]} />
                      <meshBasicMaterial color={isHighlighted ? "#FFD700" : dimensionColor} />
                    </mesh>
                  </group>
                    );
                  })}
                  {shelfThicknessElements}
                </>
              );
            })()}
          </group>
        )}
      </group>
    );
  }
  
  // 기존 균등 분할 모드 (하위 호환성)
  const shelfSpacing = innerHeight / (shelfCount + 1);
  
  return (
    <group position={[0, yOffset, 0]}>
      {Array.from({ length: shelfCount }, (_, i) => {
        // 섹션 내에서의 상대적 Y 위치 계산
        const relativeYPosition = (-innerHeight / 2) + shelfSpacing * (i + 1);
        return (
          <BoxWithEdges
            key={`shelf-${i}`}
            args={[innerWidth, basicThickness, depth - basicThickness]}
            position={[0, relativeYPosition, basicThickness/2 + zOffset]}
            material={material}
            renderMode={renderMode}
            isHighlighted={isHighlighted}
          />
        );
      })}
      
      {/* 치수 표시 - showDimensions와 showDimensionsText가 모두 true일 때 표시 */}
      {showDimensions && showDimensionsText && !(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right' || view2DDirection === 'top')) && (
        <group>
          {Array.from({ length: shelfCount + 1 }, (_, i) => {
            // 각 칸의 높이 계산
            let compartmentHeight: number;
            let compartmentBottomY: number;
            let compartmentCenterY: number;
            
            if (i === 0) {
              // 첫 번째 칸 (하단)
              compartmentBottomY = -innerHeight / 2;
              const firstShelfY = (-innerHeight / 2) + shelfSpacing;
              compartmentHeight = firstShelfY - compartmentBottomY;
              compartmentCenterY = compartmentBottomY + compartmentHeight / 2;
            } else if (i === shelfCount) {
              // 마지막 칸 (상단)
              const lastShelfY = (-innerHeight / 2) + shelfSpacing * shelfCount;
              compartmentBottomY = lastShelfY;
              // 섹션의 상단까지
              compartmentHeight = (innerHeight / 2) - lastShelfY;
              compartmentCenterY = compartmentBottomY + compartmentHeight / 2;
            } else {
              // 중간 칸들
              const currentShelfY = (-innerHeight / 2) + shelfSpacing * i;
              const nextShelfY = (-innerHeight / 2) + shelfSpacing * (i + 1);
              compartmentBottomY = currentShelfY;
              compartmentHeight = nextShelfY - currentShelfY;
              compartmentCenterY = compartmentBottomY + compartmentHeight / 2;
            }
            
            // compartmentHeight를 mm로 변환 (Three.js 단위 * 100)
            const compartmentHeightMm = Math.round(compartmentHeight * 100);
            
            // 디버깅
            console.log('🟢 균등분할모드 - 칸 높이:', {
              i,
              innerHeight,
              innerHeight_mm: innerHeight * 100,
              shelfSpacing,
              shelfSpacing_mm: shelfSpacing * 100,
              compartmentHeight,
              compartmentHeight_mm: compartmentHeight * 100,
              compartmentHeightMm,
              표시될값: compartmentHeightMm
            });
            
            // 각 칸의 상단 Y 좌표 계산
            const compartmentTopY = compartmentBottomY + compartmentHeight;
            
            // 현재 칸이 강조되어야 하는지 확인
            const compartmentId = furnitureId ? `${furnitureId}-${i}` : null;
            const isHighlighted = compartmentId && highlightedCompartment === compartmentId;
            
            return (
              <group key={`dimension-${i}`}>
                {/* 치수 텍스트 - CleanCAD2D 스타일로 칸 중앙에 표시 */}
                {viewMode === '3D' && (
                  <Text
                        renderOrder={1000}
                        depthTest={false}
                    position={[
                      -innerWidth/2 * 0.3 - 0.8 + 0.01, 
                      compartmentCenterY - 0.01, 
                      depth/2 + 0.1 - 0.01
                    ]}
                    fontSize={baseFontSize}
                    color="rgba(0, 0, 0, 0.3)"
                    anchorX="center"
                    anchorY="middle"
                    rotation={[0, 0, Math.PI / 2]}
                    renderOrder={998}
                  >
                    {compartmentHeightMm}
                  </Text>
                )}
                <Text
                        renderOrder={1000}
                        depthTest={false}
                  position={[
                    viewMode === '3D' ? -innerWidth/2 * 0.3 - 0.8 : 0, 
                    compartmentCenterY, 
                    viewMode === '3D' ? depth/2 + 0.1 : basicThickness + zOffset + 0.2
                  ]}
                  fontSize={baseFontSize}
                  color={isHighlighted ? "#FFD700" : textColor}
                  anchorX="center"
                  anchorY="middle"
                  rotation={[0, 0, viewMode === '3D' ? Math.PI / 2 : -Math.PI / 2]} // 3D에서는 270도, 2D에서는 90도 회전
                  onClick={(e: ThreeEvent<MouseEvent>) => {
                    e.stopPropagation();
                    if (compartmentId) {
                      setHighlightedCompartment(highlightedCompartment === compartmentId ? null : compartmentId);
                    }
                  }}
                  onPointerOver={(e: ThreeEvent<PointerEvent>) => {
                    e.stopPropagation();
                    document.body.style.cursor = 'pointer';
                  }}
                  onPointerOut={(e: ThreeEvent<PointerEvent>) => {
                    e.stopPropagation();
                    document.body.style.cursor = 'auto';
                  }}
                >
                  {compartmentHeightMm}
                </Text>
                
                {/* 위쪽 가이드 보조선 */}
                <NativeLine
                  points={[
                    [-innerWidth/2 * 0.8, compartmentTopY, basicThickness + zOffset + 0.1],
                    [innerWidth/2 * 0.8, compartmentTopY, basicThickness + zOffset + 0.1]
                  ]}
                  color={isHighlighted ? "#FFD700" : dimensionColor}
                  lineWidth={isHighlighted ? 2 : 1}
                  dashed
                  dashSize={0.02}
                  gapSize={0.01}
                />
                
                {/* 아래쪽 가이드 보조선 */}
                <NativeLine
                  points={[
                    [-innerWidth/2 * 0.8, compartmentBottomY, basicThickness + zOffset + 0.1],
                    [innerWidth/2 * 0.8, compartmentBottomY, basicThickness + zOffset + 0.1]
                  ]}
                  color={isHighlighted ? "#FFD700" : dimensionColor}
                  lineWidth={isHighlighted ? 2 : 1}
                  dashed
                  dashSize={0.02}
                  gapSize={0.01}
                />
                
                {/* 수직 연결선 (치수선) */}
                <NativeLine
                  points={[
                    [0, compartmentTopY, basicThickness + zOffset + 0.15],
                    [0, compartmentBottomY, basicThickness + zOffset + 0.15]
                  ]}
                  color={isHighlighted ? "#FFD700" : dimensionColor}
                  lineWidth={isHighlighted ? 2 : 1}
                />
              </group>
            );
          })}
        </group>
      )}
    </group>
  );
};

export default ShelfRenderer; 