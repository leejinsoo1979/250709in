import React from 'react';
import * as THREE from 'three';
import { useSpace3DView } from '../../context/useSpace3DView';
import { Text, Line } from '@react-three/drei';
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
  originalDepth?: number; // 치수 표시용 원래 가구 깊이 (섹션별 깊이가 다를 때 사용)
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
  sectionType?: 'shelf' | 'hanging' | 'drawer' | 'open'; // 섹션 타입
  allowSideViewDimensions?: boolean; // 측면뷰에서 치수 표시 허용 (듀얼 가구용)
  sideViewTextX?: number; // 측면뷰 텍스트용 X 좌표 오버라이드
  sideViewLineX?: number; // 측면뷰 라인용 X 좌표 오버라이드
  textureUrl?: string; // 텍스처 URL
  panelGrainDirections?: { [panelName: string]: 'horizontal' | 'vertical' }; // 패널별 개별 결 방향
  sectionName?: string; // 섹션 이름 (예: "(상)", "(하)")
  sectionIndex?: number; // 섹션 인덱스 (상부 섹션 바닥판 위치 조정용)
  floatOffsetMm?: number; // 띄움 배치 시 치수 가이드 Y 오프셋 보정용 (mm)
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
  originalDepth,
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
  sectionType,
  allowSideViewDimensions = false,
  sideViewTextX,
  sideViewLineX,
  textureUrl,
  panelGrainDirections,
  sectionName = '',
  sectionIndex,
  floatOffsetMm = 0,
}) => {
  const showDimensions = useUIStore(state => state.showDimensions);
  const showDimensionsText = useUIStore(state => state.showDimensionsText);
  const view2DDirection = useUIStore(state => state.view2DDirection);
  const highlightedCompartment = useUIStore(state => state.highlightedCompartment);
  const setHighlightedCompartment = useUIStore(state => state.setHighlightedCompartment);
  const highlightedPanel = useUIStore(state => state.highlightedPanel);
  const { dimensionColor, baseFontSize, viewMode } = useDimensionColor();
  const textColor = dimensionColor;
  const mmToThreeUnits = (mm: number) => mm / 100;

  // 2D 측면뷰에서 치수 가이드 Y 오프셋 보정 (띄움 배치 시 바닥 기준 유지)
  const dimensionYOffset = (viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right'))
    ? -mmToThreeUnits(floatOffsetMm)
    : 0;

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

  // 패널 강조용 material (형광색)
  const highlightMaterial = React.useMemo(() =>
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#00FF00'), // 형광 녹색
      transparent: true,
      opacity: 1.0
    }),
  []);

  // 패널용 material 결정 - useCallback로 최적화
  const getPanelMaterial = React.useCallback((panelName: string) => {
    // 패널 ID 생성
    const panelId = `${furnitureId}-${panelName}`;

    // 패널이 강조되어야 하는지 확인
    const isHighlighted = highlightedPanel === panelId;

    // 선택된 패널은 형광색으로 강조, 나머지는 원래대로
    if (isHighlighted) {
      return highlightMaterial;
    }
    return material;
  }, [highlightedPanel, furnitureId, material, highlightMaterial]);

  // 측면뷰에서 치수 X 위치 계산: 좌측뷰는 왼쪽에, 우측뷰는 오른쪽에 표시
  const getDimensionXPosition = (forText: boolean = false) => {
    if (viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) {
      if (forText && sideViewTextX !== undefined) {
        return sideViewTextX;
      }
      if (!forText && sideViewLineX !== undefined) {
        return sideViewLineX;
      }
      const textOffset = forText ? 0.3 : 0;
      const xPos = view2DDirection === 'left'
        ? -innerWidth/2 - textOffset  // 좌측뷰: 가구 좌측 끝 밖으로
        : innerWidth/2 + textOffset;  // 우측뷰: 가구 우측 끝 밖으로

      console.log('📏 ShelfRenderer getDimensionXPosition:',
        `viewMode=${viewMode}`,
        `view2DDirection=${view2DDirection}`,
        `innerWidth=${innerWidth}`,
        `forText=${forText}`,
        `textOffset=${textOffset}`,
        `xPos=${xPos}`,
        `furnitureId=${furnitureId}`
      );

      return xPos;
    }
    // 3D 또는 정면뷰: 기본 왼쪽 위치
    return forText ? -innerWidth/2 * 0.3 - 0.8 : -innerWidth/2 * 0.3;
  };

  // 측면뷰에서 치수 Z 위치 계산 함수 (통일된 Z 위치)
  const getDimensionZPosition = () => {
    // 치수 표시용 깊이: originalDepth가 있으면 사용, 없으면 depth 사용
    const depthForDimension = originalDepth !== undefined ? originalDepth : depth;

    if (viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) {
      // 측면뷰: Z축 오른쪽으로 324mm (3.24) 이동
      return depthForDimension/2 + 1.0 + 3.24;
    }
    // 3D 모드: 스타일러장 우측 섹션은 zOffset + depth/2 (다른 모듈과 동일)
    if (viewMode === '3D' && furnitureId && furnitureId.includes('-right-section')) {
      return zOffset + depthForDimension/2;
    }
    // 3D 또는 정면뷰: 원래 가구 깊이 기준으로 고정
    return depthForDimension/2 + 0.1;
  };
  
  if (shelfCount <= 0) {
    return null;
  }

  // 절대 위치 모드: 마감 패널 또는 절대 위치 지정
  if (isTopFinishPanel && shelfCount === 1) {
    console.log('🔥 isTopFinishPanel 상판 렌더링:', { furnitureId, sectionType, innerHeight, yOffset });

    // 2hanging 가구는 SingleType2에서 직접 렌더링하므로 여기서는 렌더링하지 않음
    const is2Hanging = furnitureId?.includes('2hanging');
    if (is2Hanging) {
      return null;
    }

    // 최상단 마감 패널 모드
    // 상부 섹션(sectionIndex > 0)인 경우 바닥판이 섹션 하단에 위치
    // 하부 섹션이거나 단일 섹션인 경우 기존대로 상단에 위치
    const topPosition = sectionIndex && sectionIndex > 0
      ? -innerHeight / 2 + basicThickness / 2  // 상부 섹션: 섹션 하단에 바닥판
      : innerHeight / 2 - basicThickness / 2;  // 하부/단일 섹션: 섹션 상단에 상판

    const panelName = sectionName ? `${sectionName}선반 1` : `선반 1`;
    const topFinishMat = getPanelMaterial(panelName);
    return (
      <group position={[0, yOffset, 0]}>
        <BoxWithEdges
          key={`top-finish-${topFinishMat.uuid}`}
          args={[innerWidth, basicThickness, depth - basicThickness]}
          position={[0, topPosition, basicThickness/2 + zOffset]}
          material={topFinishMat}
          renderMode={renderMode}
          isHighlighted={isHighlighted}
          panelName={panelName}
          textureUrl={textureUrl}
          panelGrainDirections={panelGrainDirections}
              furnitureId={furnitureId}
        />
        
        {/* 상판 두께 치수 표시 */}
        {showDimensions && showDimensionsText && (
          <group>
            {/* 상판 두께 텍스트 */}
            <Text
              position={[
                getDimensionXPosition(true),
                topPosition + dimensionYOffset,
                getDimensionZPosition()
              ]}
              fontSize={baseFontSize}
              color={viewMode === '3D' ? '#000000' : dimensionColor}
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
                [getDimensionXPosition(false), topPosition - basicThickness/2 + dimensionYOffset, getDimensionZPosition()],
                [getDimensionXPosition(false), topPosition + basicThickness/2 + dimensionYOffset, getDimensionZPosition()]
              ]}
              color={viewMode === '3D' ? '#000000' : dimensionColor}
              lineWidth={1}
            />
            {/* 수직선 양끝 점 - 측면뷰에서 숨김 */}
            {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right' || view2DDirection === 'top')) && (
              <>
                <mesh position={[getDimensionXPosition(false), topPosition - basicThickness/2 + dimensionYOffset, getDimensionZPosition()]}>
                  <sphereGeometry args={[0.05, 8, 8]} />
                  <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                </mesh>
                <mesh position={[getDimensionXPosition(false), topPosition + basicThickness/2 + dimensionYOffset, getDimensionZPosition()]}>
                  <sphereGeometry args={[0.05, 8, 8]} />
                  <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                </mesh>
              </>
            )}
          </group>
        )}
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

          // 스타일러장 우측 섹션의 안전선반: 앞에서 8mm 줄이고 뒤로 5mm 이동
          const isStylerRightSection = furnitureId && furnitureId.includes('-right-section');
          const shelfDepth = isStylerRightSection
            ? depth - basicThickness - mmToThreeUnits(8) // 앞에서 8mm 줄임
            : depth - basicThickness;
          const shelfZPosition = isStylerRightSection
            ? basicThickness/2 + zOffset - mmToThreeUnits(5) // 뒤로 5mm 이동 (백패널에 붙임)
            : basicThickness/2 + zOffset;

          const panelName = sectionName ? `${sectionName}선반 ${i + 1}` : `선반 ${i + 1}`;
          const shelfMat = getPanelMaterial(panelName);
          return (
            <BoxWithEdges
              key={`shelf-${i}-${shelfMat.uuid}`}
              args={[innerWidth, basicThickness, shelfDepth]}
              position={[0, relativeYPosition, shelfZPosition]}
              material={shelfMat}
              renderMode={renderMode}
              isHighlighted={isHighlighted}
              panelName={panelName}
              textureUrl={textureUrl}
              panelGrainDirections={panelGrainDirections}
              furnitureId={furnitureId}
            />
          );
        })}
        
        {/* 치수 표시 - showDimensions와 showDimensionsText가 모두 true이고 상단 마감 패널이 아닐 때 표시 */}
        {/* Type2의 하단 섹션처럼 선반이 1개이고 상단 근처에만 있는 경우는 제외 */}
        {/* 단, 첫 번째 칸의 높이가 100mm 이상이면 표시 */}
        {/* 듀얼 가구(allowSideViewDimensions=true)는 측면뷰에서도 치수 표시 허용 */}
        {showDimensions && showDimensionsText && !isTopFinishPanel &&
         !(viewMode === '2D' && view2DDirection === 'top') &&
         !(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right') && !allowSideViewDimensions) && (
          <group>
            {(() => {
              const compartmentHeights: Array<{ height: number; centerY: number }> = [];

              // 첫 번째 칸의 높이를 미리 계산하여 표시 여부 결정
              let shouldShowDimensions = true;
              let firstCompartmentHeightMm = 0;

              // 측면뷰(allowSideViewDimensions=true)에서는 섹션 전체 높이만 표시
              const isSideViewForDual = allowSideViewDimensions && viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right');

              if (isSideViewForDual) {
                // 듀얼 가구 측면뷰: 섹션 전체 높이를 하나의 치수로 표시
                // innerHeight는 이미 섹션 내부 높이이므로 그대로 사용
                compartmentHeights.push({
                  height: innerHeight,
                  centerY: 0 // 섹션 중앙
                });

                console.log('🔵 ShelfRenderer 듀얼 측면뷰 - 섹션 전체 높이:', {
                  furnitureId,
                  viewMode,
                  view2DDirection,
                  innerHeight,
                  innerHeight_mm: innerHeight * 100,
                  basicThickness,
                  basicThickness_mm: basicThickness * 100,
                  표시될값: Math.round(innerHeight * 100)
                });
              } else {
                // 기존 로직: 개별 칸 높이 계산

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
                  // shelfPositions[i] === 0인 경우(바닥판) 다음 칸은 표시하지 않음
                  if (shelfPositions[i] === 0) {
                    continue;
                  }
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
                const isDualType5Right = furnitureId && furnitureId.includes('dual-2drawer-styler') && innerHeight > 2000;
                if (shelfPositions.length > 0 && !(shelfPositions.length === 1 && shelfPositions[0] > (innerHeight / 0.01) * 0.9)) {
                  // 스타일러장 우측이 아닌 경우에만 마지막 칸 추가
                  if (!isDualType5Right) {
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
              }
              
              // 선반 프레임 두께 치수 추가
              const shelfThicknessElements = [];

              // 측면뷰/탑뷰에서는 선반 두께 표시 안함 (섹션 외경 치수만 표시)
              const isSideView = viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right');
              const isTopView = viewMode === '2D' && view2DDirection === 'top';

              // 각 선반의 두께 표시
              shelfPositions.forEach((shelfPos, i) => {
                // 측면뷰/탑뷰에서는 선반 두께 표시 안함
                if (isSideView || isTopView) {
                  return;
                }

                // drawer 섹션의 바닥판 두께는 표시하지 않음 (전체적으로 제거)
                if (sectionType === 'drawer') {
                  return;
                }

                // 모든 섹션의 바닥판(shelfPos === 0) 두께는 표시하지 않음
                if (shelfPos === 0) {
                  return;
                }
                
                // shelfPos === 0인 경우 바닥판: 섹션 하단에서 basicThickness/2 위
                const shelfY = shelfPos === 0 
                  ? (-innerHeight / 2) + basicThickness / 2
                  : (-innerHeight / 2) + mmToThreeUnits(shelfPos);
                const shelfTopY = shelfY + basicThickness / 2;
                const shelfBottomY = shelfY - basicThickness / 2;
                
                shelfThicknessElements.push(
                  <group key={`shelf-thickness-${i}`}>
                    {/* 선반 두께 치수 텍스트 - 수직선 좌측에 표시 */}
                    <Text
                      position={[
                        getDimensionXPosition(true),
                        shelfY + dimensionYOffset,
                        getDimensionZPosition()
                      ]}
                      fontSize={baseFontSize}
                      color={viewMode === '3D' ? '#000000' : dimensionColor}
                      anchorX="center"
                      anchorY="middle"
                      rotation={[0, 0, Math.PI / 2]}
                      renderOrder={1000}
                      depthTest={false}
                    >
                      {Math.round((basicThickness > 0 ? basicThickness : 0.18) * 100)}
                    </Text>

                    {/* 선반 두께 수직선 */}
                    <NativeLine name="dimension_line"
                      points={[
                        [getDimensionXPosition(false), shelfTopY + dimensionYOffset, getDimensionZPosition()],
                        [getDimensionXPosition(false), shelfBottomY + dimensionYOffset, getDimensionZPosition()]
                      ]}
                      color={viewMode === '3D' ? '#000000' : dimensionColor}
                      lineWidth={1}
                      dashed={false}
                    />
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

              // 상단 프레임 치수는 showTopFrameDimension이 true이고 측면뷰/탑뷰가 아닐 때만 표시
              if (showTopFrameDimension && !isSideView && !isTopView) {
                console.log('🟣 상단 프레임 엔드포인트:', {
                  'topFrameTopY_mm': topFrameTopY * 100,
                  'topFrameBottomY_mm': topFrameBottomY * 100,
                  '위점렌더링': 'O',
                  '아래점렌더링': 'O'
                });
                shelfThicknessElements.push(
                <group key="top-frame-thickness">
                  {/* 상단 프레임 두께 치수 텍스트 - 수직선 좌측에 표시 */}
                  <Text
                    position={[
                      getDimensionXPosition(true),
                      topFrameY + dimensionYOffset,
                      getDimensionZPosition()
                    ]}
                    fontSize={baseFontSize}
                    color={viewMode === '3D' ? '#000000' : dimensionColor}
                    anchorX="center"
                    anchorY="middle"
                    rotation={[0, 0, Math.PI / 2]}
                    renderOrder={1000}
                    depthTest={false}
                  >
                    {Math.round((basicThickness > 0 ? basicThickness : 0.18) * 100)}
                  </Text>

                  {/* 상단 프레임 두께 수직선 */}
                  <NativeLine name="dimension_line"
                    points={[
                      [getDimensionXPosition(false), topFrameTopY + dimensionYOffset, getDimensionZPosition()],
                      [getDimensionXPosition(false), topFrameBottomY + dimensionYOffset, getDimensionZPosition()]
                    ]}
                    color={viewMode === '3D' ? '#000000' : dimensionColor}
                    lineWidth={1}
                    dashed={false}
                  />
                  {/* 상단 프레임 두께 수직선 양끝 점 - 측면뷰에서 숨김 */}
                  {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right' || view2DDirection === 'top')) && (
                    <>
                      <mesh position={[getDimensionXPosition(false), topFrameTopY + dimensionYOffset, getDimensionZPosition()]}>
                        <sphereGeometry args={[0.05, 8, 8]} />
                        <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                      </mesh>
                      <mesh position={[getDimensionXPosition(false), topFrameBottomY + dimensionYOffset, getDimensionZPosition()]}>
                        <sphereGeometry args={[0.05, 8, 8]} />
                        <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
                      </mesh>
                    </>
                  )}
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
                    // Type4 상부섹션(hanging)만: 첫 번째 칸(바닥판~안전선반)만 제외, 두 번째 칸(안전선반~상판)은 표시
                    const isType4Hanging = furnitureId && (furnitureId.includes('4drawer-hanging') || furnitureId.includes('dual-4drawer-hanging')) && sectionType === 'hanging';
                    
                    // 안전선반이 있는 경우(칸이 2개 이상) 마지막 칸은 치수 표시 안함
                    if (isDualType5Right && compartmentHeights.length >= 2 && i === compartmentHeights.length - 1) {
                      return null;
                    }
                    
                    // Type4 상부섹션: 첫 번째 칸(바닥판~안전선반)은 제외
                    if (isType4Hanging && i === 0) {
                      return null;
                    }
                    
                    // Type2 hanging 섹션: 첫 번째 칸(섹션 하단~안전선반)은 제거, 마지막 칸(안전선반~상단)만 표시
                    const isType2Hanging = furnitureId && (furnitureId.includes('2hanging') || furnitureId.includes('2drawer-hanging')) && sectionType === 'hanging';
                    if (isType2Hanging && i !== compartmentHeights.length - 1) {
                      return null;
                    }
                    // shelfPos === 0인 바닥판이 있을 때는 compartmentHeights 배열에 포함되지 않으므로
                    // i === 0이더라도 실제로는 바닥판 다음 칸을 의미함
                    // 하지만 배열이 비어있지 않다면 첫 번째 요소는 바닥~첫선반 또는 첫선반~두번째선반

                    // 각 칸의 상단과 하단 Y 좌표 계산
                    let compartmentTop, compartmentBottom;

                    // 듀얼 가구 측면뷰인 경우: compartmentHeights에 저장된 height 값을 그대로 사용
                    if (isSideViewForDual) {
                      const compartmentHeight = compartment.height;
                      compartmentBottom = -compartmentHeight / 2;
                      compartmentTop = compartmentHeight / 2;
                    } else if (i === 0) {
                      // 첫 번째 칸: 바닥판이 있으면(shelfPositions[0] === 0) 이 칸은 추가되지 않음
                      // 바닥판이 없으면 바닥부터 첫 선반 하단까지
                      // 상부섹션 (sectionIndex > 0)인 경우 바닥판(중간 분리판) 두께만큼 올려서 시작
                      const bottomOffset = (sectionIndex && sectionIndex > 0) ? basicThickness : 0;
                      compartmentBottom = -innerHeight / 2 + bottomOffset; // 바닥 (상부섹션은 바닥판 윗면)
                      compartmentTop = (-innerHeight / 2) + mmToThreeUnits(shelfPositions[0]) - basicThickness / 2; // 첫 선반 하단
                    } else if (i === compartmentHeights.length - 1 && shelfPositions.length > 0) {
                      // 마지막 칸: 마지막 선반 상단부터 상단 프레임 하단까지
                      const lastShelfPos = shelfPositions[shelfPositions.length - 1];
                      compartmentBottom = (-innerHeight / 2) + mmToThreeUnits(lastShelfPos) + basicThickness / 2; // 마지막 선반 상단
                      // 상단 프레임 하단까지만 (섹션 상단에서 프레임 두께 뺀 위치)
                      compartmentTop = (innerHeight / 2) - basicThickness; // 상단 프레임 하단

                      // 디버깅: 상부섹션 높이 계산 로그
                      console.log('🔍 ShelfRenderer 상부섹션 높이 계산:', {
                        furnitureId,
                        viewMode,
                        view2DDirection,
                        innerHeight,
                        innerHeight_mm: innerHeight * 100,
                        basicThickness,
                        basicThickness_mm: basicThickness * 100,
                        lastShelfPos,
                        compartmentBottom,
                        compartmentTop,
                        compartmentHeight_mm: (compartmentTop - compartmentBottom) * 100,
                        표시될값: Math.round((compartmentTop - compartmentBottom) * 100)
                      });
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
                    {/* 치수 텍스트 - 비활성화 (SectionsRenderer의 EditableDimensionText와 중복) */}
                    {false && viewMode === '3D' && (
                      <Text
                        renderOrder={1000}
                        depthTest={false}
                        position={[
                          -innerWidth/2 * 0.3 - 0.8 + 0.01,
                          compartment.centerY - 0.01 + dimensionYOffset,
                          (furnitureId && furnitureId.includes('-right-section') ? zOffset + depth/2 : depth/2 + 0.1) - 0.01
                        ]}
                        fontSize={baseFontSize}
                        color="rgba(0, 0, 0, 0.3)"
                        anchorX="center"
                        anchorY="middle"
                        rotation={[0, 0, Math.PI / 2]}
                      >
                        {Math.round(compartment.height * 100)}
                      </Text>
                    )}
                    {false && <Text
                        renderOrder={1000}
                        depthTest={false}
                      position={[
                        getDimensionXPosition(true),
                        compartment.centerY + dimensionYOffset,
                        getDimensionZPosition()
                      ]}
                      fontSize={baseFontSize}
                      color={isHighlighted ? "#FFD700" : textColor}
                      anchorX="center"
                      anchorY="middle"
                      rotation={[0, 0, Math.PI / 2]} // 텍스트를 270도 회전하여 세로로 표시 (읽기 쉽게)
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
                    </Text>}

                    {/* 수직 연결선 (치수선) - SectionsRenderer의 EditableDimensionText와 중복으로 비활성화 */}
                    {false && <NativeLine name="dimension_line"
                      points={[
                        [getDimensionXPosition(false), compartmentTop + dimensionYOffset, getDimensionZPosition()],
                        [getDimensionXPosition(false), compartmentBottom + dimensionYOffset, getDimensionZPosition()]
                      ]}
                      color={isHighlighted ? "#FFD700" : dimensionColor}
                      lineWidth={isHighlighted ? 2 : 1}
                      dashed={false}
                    />}
                    {/* 칸 높이 치수선 엔드포인트는 모두 제거 (중복) */}
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
        const panelName = sectionName ? `${sectionName}선반 ${i + 1}` : `선반 ${i + 1}`;
        const shelfMat = getPanelMaterial(panelName);
        return (
          <BoxWithEdges
            key={`shelf-${i}-${shelfMat.uuid}`}
            args={[innerWidth, basicThickness, depth - basicThickness]}
            position={[0, relativeYPosition, basicThickness/2 + zOffset]}
            material={shelfMat}
            renderMode={renderMode}
            isHighlighted={isHighlighted}
            panelName={panelName}
            textureUrl={textureUrl}
            panelGrainDirections={panelGrainDirections}
              furnitureId={furnitureId}
          />
        );
      })}
      
      {/* 치수 표시 - showDimensions와 showDimensionsText가 모두 true일 때 표시 */}
      {/* 듀얼 가구(allowSideViewDimensions=true)는 측면뷰에서도 치수 표시 허용 */}
      {showDimensions && showDimensionsText &&
       !(viewMode === '2D' && view2DDirection === 'top') &&
       !(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right') && !allowSideViewDimensions) && (
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
                {/* 치수 텍스트 - 비활성화 (SectionsRenderer의 EditableDimensionText와 중복) */}
                {false && viewMode === '3D' && (
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
                  >
                    {compartmentHeightMm}
                  </Text>
                )}
                {false && <Text
                        renderOrder={1000}
                        depthTest={false}
                  position={[
                    getDimensionXPosition(true),
                    compartmentCenterY,
                    getDimensionZPosition()
                  ]}
                  fontSize={baseFontSize}
                  color={isHighlighted ? "#FFD700" : textColor}
                  anchorX="center"
                  anchorY="middle"
                  rotation={[0, 0, Math.PI / 2]} // 텍스트를 270도 회전하여 세로로 표시
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
                </Text>}

                {/* 위쪽 가이드 보조선 */}
                <NativeLine name="dimension_line"
                  points={[
                    [-innerWidth/2 * 0.8, compartmentTopY, (furnitureId && furnitureId.includes('-right-section') && viewMode === '3D') ? zOffset + depth/2 : basicThickness + zOffset + 0.1],
                    [innerWidth/2 * 0.8, compartmentTopY, (furnitureId && furnitureId.includes('-right-section') && viewMode === '3D') ? zOffset + depth/2 : basicThickness + zOffset + 0.1]
                  ]}
                  color={isHighlighted ? "#FFD700" : dimensionColor}
                  lineWidth={isHighlighted ? 2 : 1}
                  dashed
                  dashSize={0.02}
                  gapSize={0.01}
                />

                {/* 아래쪽 가이드 보조선 */}
                <NativeLine name="dimension_line"
                  points={[
                    [-innerWidth/2 * 0.8, compartmentBottomY, (furnitureId && furnitureId.includes('-right-section') && viewMode === '3D') ? zOffset + depth/2 : basicThickness + zOffset + 0.1],
                    [innerWidth/2 * 0.8, compartmentBottomY, (furnitureId && furnitureId.includes('-right-section') && viewMode === '3D') ? zOffset + depth/2 : basicThickness + zOffset + 0.1]
                  ]}
                  color={isHighlighted ? "#FFD700" : dimensionColor}
                  lineWidth={isHighlighted ? 2 : 1}
                  dashed
                  dashSize={0.02}
                  gapSize={0.01}
                />

                {/* 수직 연결선 (치수선) */}
                <NativeLine name="dimension_line"
                  points={[
                    [0, compartmentTopY, (furnitureId && furnitureId.includes('-right-section') && viewMode === '3D') ? zOffset + depth/2 + 0.05 : basicThickness + zOffset + 0.15],
                    [0, compartmentBottomY, (furnitureId && furnitureId.includes('-right-section') && viewMode === '3D') ? zOffset + depth/2 + 0.05 : basicThickness + zOffset + 0.15]
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
