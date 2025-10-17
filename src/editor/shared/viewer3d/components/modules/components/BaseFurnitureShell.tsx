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
import { VentilationCap } from './VentilationCap';

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

  // 배치된 가구 ID (섹션 강조용)
  placedFurnitureId?: string;

  // 띄움배치 여부
  isFloating?: boolean;

  // 공간 정보 (받침대 높이 확인용)
  spaceInfo?: SpaceInfo;

  // 가구 본체 표시 여부
  showFurniture?: boolean;

  // 백패널 설정 (하드코딩 제거)
  backPanelConfig?: {
    widthExtension: number;      // 백패널 너비 연장 (mm) - 기본 10
    heightExtension: number;      // 백패널 기본 높이 연장 (mm) - 기본 10
    lowerHeightBonus: number;     // 하부 백패널 추가 높이 (mm) - 기본 18
    depthOffset: number;          // 백패널 깊이 오프셋 (mm) - 기본 17
    yOffsetFor4Drawer: number;    // 4단서랍장 Y축 오프셋 (mm) - 기본 9
    yOffsetFor2Drawer: number;    // 2단서랍장 Y축 오프셋 (mm) - 기본 9
    lowerYAdjustment: number;     // 하부 백패널 미세 조정 (mm) - 기본 0.05
  };

  // 섹션별 깊이 (mm)
  lowerSectionDepthMm?: number;
  upperSectionDepthMm?: number;

  // 텍스처 URL과 패널별 결 방향
  textureUrl?: string;
  panelGrainDirections?: { [panelName: string]: 'horizontal' | 'vertical' };

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
  placedFurnitureId,
  isFloating = false, // 기본값은 false (바닥 배치)
  spaceInfo,
  showFurniture = true, // 기본값은 true (가구 본체 표시)
  backPanelConfig = {
    widthExtension: 10,
    heightExtension: 10,
    lowerHeightBonus: 18,
    depthOffset: 17,
    yOffsetFor4Drawer: 9,
    yOffsetFor2Drawer: 9,
    lowerYAdjustment: 0.05
  },
  lowerSectionDepthMm,
  upperSectionDepthMm,
  textureUrl,
  panelGrainDirections,
  children
}) => {
  const { renderMode, viewMode } = useSpace3DView(); // context에서 renderMode와 viewMode 가져오기
  const { gl } = useThree(); // Three.js renderer 가져오기
  const { theme } = useTheme(); // 테마 정보 가져오기
  const { view2DDirection, showDimensions, showDimensionsText } = useUIStore(); // UI 스토어에서 view2DDirection 가져오기
  const highlightedSection = useUIStore(state => state.highlightedSection);
  const { dimensionColor, baseFontSize } = useDimensionColor();

  // 디버깅: BaseFurnitureShell이 받은 props 확인
  React.useEffect(() => {
    if (panelGrainDirections && Object.keys(panelGrainDirections).length > 0) {
      console.log('🏗️ BaseFurnitureShell - panelGrainDirections 받음:', {
        moduleId: moduleData?.id,
        textureUrl,
        panelGrainDirections: JSON.stringify(panelGrainDirections),
        timestamp: Date.now()
      });
    }
  }, [panelGrainDirections, textureUrl, moduleData?.id]);

  // BaseFurnitureShell을 사용하는 가구들의 그림자 업데이트 - 제거
  // 그림자 자동 업데이트가 활성화되어 있으므로 수동 업데이트 불필요

  // 2D 정면뷰에서 좌우 프레임 형광색 material (BoxWithEdges 엣지 색상과 통일)
  const highlightMaterial = useMemo(() =>
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#FF4500'), // 붉은 주황색 (reddish-orange)
      transparent: true,
      opacity: 0.8
    }),
  []);

  // 좌우 프레임에 사용할 material 결정
  const sidePanelMaterial = (viewMode === '2D' && view2DDirection === 'front')
    ? highlightMaterial
    : material;

  return (
    <group>
      {/* 가구 본체는 showFurniture가 true일 때만 렌더링 */}
      {showFurniture && (
        <>
          {/* 좌우 측면 판재 - 다중 섹션은 상하 분할, 나머지는 통짜 */}
          {(moduleData?.id?.includes('4drawer-hanging') || moduleData?.id?.includes('2drawer-hanging') || moduleData?.id?.includes('2hanging')) && isMultiSectionFurniture() && getSectionHeights().length === 2 ? (
          // 다중 섹션: 좌우 측판을 상부/하부로 분할
          <>
            {(() => {
              const lowerSectionHeight = getSectionHeights()[0];
              const upperSectionHeight = getSectionHeights()[1];

              // 4drawer-hanging: 하부 측판 조정 없음, 상부 측판 원래 높이 그대로, Y축만 조정
              // 2drawer-hanging, 2hanging: 하부 측판 +18mm, 상부 측판 원래 높이 유지
              const is4Drawer = moduleData?.id?.includes('4drawer-hanging');

              const adjustedLowerHeight = is4Drawer
                ? lowerSectionHeight  // 4단: 하부 조정 없음
                : lowerSectionHeight + basicThickness; // 2단: 하부 18mm 늘림
              const lowerPanelY = -height/2 + adjustedLowerHeight/2;

              const adjustedUpperHeight = is4Drawer
                ? upperSectionHeight  // 4단: 상부 원래 높이
                : upperSectionHeight - basicThickness; // 2단: 상부 18mm 줄임
              const upperPanelY = is4Drawer
                ? -height/2 + lowerSectionHeight + adjustedUpperHeight/2  // 4단: 하부 바로 위
                : -height/2 + lowerSectionHeight + basicThickness + adjustedUpperHeight/2; // 2단: 하부 위 + 18mm 올림

              // 섹션 강조 확인 (placedFurnitureId 사용)
              const isLowerHighlighted = highlightedSection === `${placedFurnitureId}-0`;
              const isUpperHighlighted = highlightedSection === `${placedFurnitureId}-1`;

              // 섹션별 깊이 가져오기
              const lowerDepth = lowerSectionDepthMm !== undefined ? mmToThreeUnits(lowerSectionDepthMm) : depth;
              const upperDepth = upperSectionDepthMm !== undefined ? mmToThreeUnits(upperSectionDepthMm) : depth;

              // 깊이 차이 계산 (뒤쪽으로만 줄어들도록)
              const lowerDepthDiff = depth - lowerDepth;
              const upperDepthDiff = depth - upperDepth;
              const lowerZOffset = lowerDepthDiff / 2; // 양수: 앞쪽 고정, 뒤쪽 줄어듦
              const upperZOffset = upperDepthDiff / 2; // 양수: 앞쪽 고정, 뒤쪽 줄어듦

              return (
                <>
                  {/* 왼쪽 하부 측판 */}
                  <BoxWithEdges
                    args={[basicThickness, adjustedLowerHeight, lowerDepth]}
                    position={[-innerWidth/2 - basicThickness/2, lowerPanelY, lowerZOffset]}
                    material={sidePanelMaterial}
                    renderMode={renderMode}
                    isDragging={isDragging}
                    isHighlighted={isLowerHighlighted}
                    panelName="하부장 좌측판"
                    panelGrainDirections={panelGrainDirections}
                    furnitureId={placedFurnitureId}
                    textureUrl={textureUrl}
                  />

                  {/* 왼쪽 상부 측판 */}
                  <BoxWithEdges
                    args={[basicThickness, adjustedUpperHeight, upperDepth]}
                    position={[-innerWidth/2 - basicThickness/2, upperPanelY, upperZOffset]}
                    material={sidePanelMaterial}
                    renderMode={renderMode}
                    isDragging={isDragging}
                    isHighlighted={isUpperHighlighted}
                    panelName="상부장 좌측판"
                    panelGrainDirections={panelGrainDirections}
                    furnitureId={placedFurnitureId}
                    textureUrl={textureUrl}
                  />

                  {/* 오른쪽 하부 측판 */}
                  <BoxWithEdges
                    args={[basicThickness, adjustedLowerHeight, lowerDepth]}
                    position={[innerWidth/2 + basicThickness/2, lowerPanelY, lowerZOffset]}
                    material={sidePanelMaterial}
                    renderMode={renderMode}
                    isDragging={isDragging}
                    isHighlighted={isLowerHighlighted}
                    panelName="하부장 우측판"
                    panelGrainDirections={panelGrainDirections}
                    furnitureId={placedFurnitureId}
                    textureUrl={textureUrl}
                  />

                  {/* 오른쪽 상부 측판 */}
                  <BoxWithEdges
                    args={[basicThickness, adjustedUpperHeight, upperDepth]}
                    position={[innerWidth/2 + basicThickness/2, upperPanelY, upperZOffset]}
                    material={sidePanelMaterial}
                    renderMode={renderMode}
                    isDragging={isDragging}
                    isHighlighted={isUpperHighlighted}
                    panelName="상부장 우측판"
                    panelGrainDirections={panelGrainDirections}
                    furnitureId={placedFurnitureId}
                    textureUrl={textureUrl}
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
              material={sidePanelMaterial}
              renderMode={renderMode}
              isDragging={isDragging}
              panelName="좌측판"
              panelGrainDirections={panelGrainDirections}
                    furnitureId={placedFurnitureId}
              textureUrl={textureUrl}
            />

            {/* 오른쪽 측면 판재 */}
            <BoxWithEdges
              args={[basicThickness, height, depth]}
              position={[innerWidth/2 + basicThickness/2, 0, 0]}
              material={sidePanelMaterial}
              renderMode={renderMode}
              isDragging={isDragging}
              panelName="우측판"
              panelGrainDirections={panelGrainDirections}
                    furnitureId={placedFurnitureId}
              textureUrl={textureUrl}
            />
          </>
        )}

        {/* 다중 섹션 가구인 경우 중간 구분 패널 렌더링 */}
        {isMultiSectionFurniture() && getSectionHeights().length > 1 && (
          <>
            {(() => {
              console.log('🟢 중간 패널 렌더링 체크:', {
                moduleId: moduleData?.id,
                isMultiSection: isMultiSectionFurniture(),
                sectionLengths: getSectionHeights().length,
                includes4Drawer: moduleData?.id?.includes('4drawer-hanging'),
                includes2Drawer: moduleData?.id?.includes('2drawer-hanging'),
                includes2Hanging: moduleData?.id?.includes('2hanging')
              });
              return null;
            })()}
            {moduleData?.id?.includes('4drawer-hanging') ? (
              // 4drawer-hanging: 상부 바닥판 18mm 위로, 하부 상판 18mm 위로
              (() => {
                return getSectionHeights().map((sectionHeight: number, index: number) => {
                  if (index >= getSectionHeights().length - 1) return null;

                  let currentYPosition = -height/2 + basicThickness;

                  // 현재 섹션까지의 Y 위치 계산
                  for (let i = 0; i <= index; i++) {
                    currentYPosition += getSectionHeights()[i];
                  }

                  // 4drawer: 원래 위치
                  const middlePanelY = currentYPosition - basicThickness/2;
                  const lowerTopPanelY = currentYPosition - basicThickness - basicThickness/2;

                  // 섹션 강조 확인 (placedFurnitureId 사용)
                  const isLowerHighlighted = highlightedSection === `${placedFurnitureId}-0`;
                  const isUpperHighlighted = highlightedSection === `${placedFurnitureId}-1`;

                  // 섹션별 깊이 가져오기
                  const lowerSectionDepth = lowerSectionDepthMm !== undefined ? mmToThreeUnits(lowerSectionDepthMm) : depth;
                  const upperSectionDepth = upperSectionDepthMm !== undefined ? mmToThreeUnits(upperSectionDepthMm) : depth;

                  // 하부 섹션 깊이 차이 (뒤쪽으로만 줄어듦)
                  const lowerDepthDiff = depth - lowerSectionDepth;
                  const lowerZOffset = lowerDepthDiff / 2; // 양수: 앞쪽 고정, 뒤쪽 줄어듦

                  // 상부 섹션 깊이 차이
                  const upperDepthDiff = depth - upperSectionDepth;
                  const upperZOffset = upperDepthDiff / 2; // 양수: 앞쪽 고정, 뒤쪽 줄어듦

                  // 백패널 두께
                  const backPanelThickness = depth - adjustedDepthForShelves;

                  // 하부 섹션 조정된 깊이
                  const lowerAdjustedDepth = lowerSectionDepth - backPanelThickness;

                  // 상부 섹션 조정된 깊이
                  const upperAdjustedDepth = upperSectionDepth - backPanelThickness;

                  return (
                    <React.Fragment key={`divider-${index}`}>
                      {/* 상부 섹션 바닥판 - 백패널 방향으로 26mm 늘림 */}
                      <BoxWithEdges
                        args={[innerWidth, basicThickness, upperAdjustedDepth - basicThickness + mmToThreeUnits(26)]}
                        position={[0, middlePanelY, basicThickness/2 + shelfZOffset - mmToThreeUnits(26)/2 + upperZOffset]}
                        material={material}
                        renderMode={renderMode}
                        isDragging={isDragging}
                        isHighlighted={isUpperHighlighted}
                        panelName="상부장 바닥판"
                        panelGrainDirections={panelGrainDirections}
                    furnitureId={placedFurnitureId}
                        textureUrl={textureUrl}
                      />

                      {/* 하부 섹션 상판 - 백패널 방향으로 26mm 늘림, 앞에서 85mm 줄임 */}
                      <BoxWithEdges
                        args={[innerWidth, basicThickness - mmToThreeUnits(0.1), lowerAdjustedDepth - basicThickness + mmToThreeUnits(26) - mmToThreeUnits(85)]}
                        position={[0, lowerTopPanelY - mmToThreeUnits(0.05), basicThickness/2 + shelfZOffset - mmToThreeUnits(26)/2 - mmToThreeUnits(85)/2 + lowerZOffset]}
                        material={material}
                        renderMode={renderMode}
                        isDragging={isDragging}
                        isHighlighted={isLowerHighlighted}
                        panelName="하부장 상판"
                        panelGrainDirections={panelGrainDirections}
                    furnitureId={placedFurnitureId}
                        textureUrl={textureUrl}
                      />
                    </React.Fragment>
                  );
                });
              })()
            ) : moduleData?.id?.includes('2drawer-hanging') ? (
              // 2drawer-hanging: 각각 18mm씩 위로, 중간 패널은 백패널 방향으로만 26mm 늘림
              (() => {
                return getSectionHeights().map((sectionHeight: number, index: number) => {
                  if (index >= getSectionHeights().length - 1) return null;

                  let currentYPosition = -height/2 + basicThickness;

                  // 현재 섹션까지의 Y 위치 계산
                  for (let i = 0; i <= index; i++) {
                    currentYPosition += getSectionHeights()[i];
                  }

                  // 2drawer: 각각 18mm씩 위로
                  const middlePanelY = currentYPosition - basicThickness/2 + mmToThreeUnits(18);
                  const lowerTopPanelY = currentYPosition - basicThickness - basicThickness/2 + mmToThreeUnits(18);

                  // 섹션 강조 확인 (placedFurnitureId 사용)
                  const isLowerHighlighted = highlightedSection === `${placedFurnitureId}-0`;
                  const isUpperHighlighted = highlightedSection === `${placedFurnitureId}-1`;

                  return (
                    <React.Fragment key={`divider-${index}`}>
                      {/* 하부 섹션 상판 - 백패널 방향으로 26mm 늘림, 앞에서 85mm 줄임 */}
                      <BoxWithEdges
                        args={[innerWidth, basicThickness - mmToThreeUnits(0.1), adjustedDepthForShelves - basicThickness + mmToThreeUnits(26) - mmToThreeUnits(85)]}
                        position={[0, lowerTopPanelY - mmToThreeUnits(0.05), basicThickness/2 + shelfZOffset - mmToThreeUnits(26)/2 - mmToThreeUnits(85)/2]}
                        material={material}
                        renderMode={renderMode}
                        isDragging={isDragging}
                        isHighlighted={isLowerHighlighted}
                        panelName="하부장 상판"
                        panelGrainDirections={panelGrainDirections}
                    furnitureId={placedFurnitureId}
                        textureUrl={textureUrl}
                      />

                      {/* 상부 섹션 바닥판 - 백패널 방향으로 26mm 늘림만 적용 (앞에서 줄이지 않음) */}
                      <BoxWithEdges
                        args={[innerWidth, basicThickness, adjustedDepthForShelves - basicThickness + mmToThreeUnits(26)]}
                        position={[0, middlePanelY, basicThickness/2 + shelfZOffset - mmToThreeUnits(26)/2]}
                        material={material}
                        renderMode={renderMode}
                        isDragging={isDragging}
                        isHighlighted={isUpperHighlighted}
                        panelName="상부장 바닥판"
                        panelGrainDirections={panelGrainDirections}
                    furnitureId={placedFurnitureId}
                        textureUrl={textureUrl}
                      />
                    </React.Fragment>
                  );
                });
              })()
            ) : moduleData?.id?.includes('2hanging') ? (
              // 2hanging: SingleType2.tsx에서 직접 렌더링하므로 여기서는 렌더링하지 않음
              null
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

                // 섹션 강조 확인 - 중간판은 하부 섹션에 속함
                const isLowerHighlighted = highlightedSection === `${placedFurnitureId}-0`;

                return (
                  <BoxWithEdges
                    key={`divider-${index}`}
                    args={[innerWidth, basicThickness, adjustedDepthForShelves - basicThickness]}
                    position={[0, dividerY, basicThickness/2 + shelfZOffset]}
                    material={material}
                    renderMode={renderMode}
                    isDragging={isDragging}
                    isHighlighted={isLowerHighlighted}
                    panelName="중간판"
                    panelGrainDirections={panelGrainDirections}
                    furnitureId={placedFurnitureId}
                    textureUrl={textureUrl}
                  />
                );
              });
              })()
            )}
          </>
        )}

        {/* 상단 판재 */}
        <BoxWithEdges
          args={[innerWidth, basicThickness, (() => {
            // 다중 섹션이고 상부 깊이가 있으면 상부 섹션 깊이 사용
            if (isMultiSectionFurniture() && upperSectionDepthMm !== undefined) {
              return mmToThreeUnits(upperSectionDepthMm);
            }
            return depth;
          })()]}
          position={[0, height/2 - basicThickness/2, (() => {
            // 다중 섹션이고 상부 깊이가 있으면 Z 오프셋 적용
            if (isMultiSectionFurniture() && upperSectionDepthMm !== undefined) {
              const upperDepth = mmToThreeUnits(upperSectionDepthMm);
              const depthDiff = depth - upperDepth;
              return depthDiff / 2; // 양수: 앞쪽 고정, 뒤쪽 줄어듦
            }
            return 0;
          })()]}
          material={material}
          renderMode={renderMode}
          isDragging={isDragging}
          isHighlighted={isMultiSectionFurniture() ? highlightedSection === `${placedFurnitureId}-1` : false}
          panelName="상판"
          panelGrainDirections={panelGrainDirections}
                    furnitureId={placedFurnitureId}
          textureUrl={textureUrl}
        />

        {/* Type4 상단 상판 두께 치수 표시 - 정면도에서만 */}
        {(moduleData?.id?.includes('4drawer-hanging') || moduleData?.id?.includes('2drawer-hanging')) && showDimensions && showDimensionsText && (viewMode === '3D' || view2DDirection === 'front') && !(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
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
          {/* 수직선 양끝 점 - 측면뷰에서 숨김 */}
          {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
            <>
              <mesh position={[-innerWidth/2 * 0.3, height/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
                <sphereGeometry args={[0.05, 8, 8]} />
                <meshBasicMaterial color={dimensionColor} />
              </mesh>
              <mesh position={[-innerWidth/2 * 0.3, height/2 - basicThickness, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
                <sphereGeometry args={[0.05, 8, 8]} />
                <meshBasicMaterial color={dimensionColor} />
              </mesh>
            </>
          )}
        </group>
        )}

        {/* 하단 판재 */}
        <BoxWithEdges
          args={[innerWidth, basicThickness, (() => {
            // 다중 섹션이고 하부 깊이가 있으면 하부 섹션 깊이 사용
            if (isMultiSectionFurniture() && lowerSectionDepthMm !== undefined) {
              return mmToThreeUnits(lowerSectionDepthMm);
            }
            return depth;
          })()]}
          position={[0, -height/2 + basicThickness/2, (() => {
            // 다중 섹션이고 하부 깊이가 있으면 Z 오프셋 적용
            if (isMultiSectionFurniture() && lowerSectionDepthMm !== undefined) {
              const lowerDepth = mmToThreeUnits(lowerSectionDepthMm);
              const depthDiff = depth - lowerDepth;
              return depthDiff / 2; // 양수: 앞쪽 고정, 뒤쪽 줄어듦
            }
            return 0;
          })()]}
          material={material}
          renderMode={renderMode}
          isDragging={isDragging}
          isHighlighted={isMultiSectionFurniture() ? highlightedSection === `${placedFurnitureId}-0` : false}
          panelName="바닥판"
          panelGrainDirections={panelGrainDirections}
                    furnitureId={placedFurnitureId}
          textureUrl={textureUrl}
        />

        {/* 뒷면 판재 (9mm 백패널) - hasBackPanel이 true일 때만 렌더링 */}
        {hasBackPanel && (
        <>
          {isMultiSectionFurniture() && getSectionHeights().length === 2 ? (
            // 다중 섹션: 하부/상부 백패널 분리
            <>
              {(() => {
                const sectionHeights = getSectionHeights();
                const lowerSectionHeight = sectionHeights[0];
                const upperSectionHeight = sectionHeights[1];

                console.log('🔍🔍🔍 섹션 높이:', {
                  lowerSectionHeightMm: lowerSectionHeight / 0.01,
                  upperSectionHeightMm: upperSectionHeight / 0.01,
                  totalHeightMm: height / 0.01,
                  basicThicknessMm: basicThickness / 0.01
                });

                // 백패널 높이 계산
                // 하부: 2단만 위로 lowerHeightBonus만큼 늘림, 4단은 기본 높이
                const is4Drawer = moduleData?.id?.includes('4drawer-hanging');
                const lowerBackPanelHeight = is4Drawer
                  ? lowerSectionHeight - basicThickness * 2 + mmToThreeUnits(backPanelConfig.heightExtension)
                  : lowerSectionHeight - basicThickness * 2 + mmToThreeUnits(backPanelConfig.heightExtension) + mmToThreeUnits(backPanelConfig.lowerHeightBonus);
                // 상부: 기본 높이 (heightExtension만) - 2drawer는 18mm 줄임
                const upperBackPanelHeight = (moduleData?.id?.includes('2drawer-hanging') || moduleData?.id?.includes('2hanging'))
                  ? upperSectionHeight - basicThickness * 2 + mmToThreeUnits(backPanelConfig.heightExtension) - basicThickness
                  : upperSectionHeight - basicThickness * 2 + mmToThreeUnits(backPanelConfig.heightExtension);

                console.log('🔍🔍🔍 백패널 높이:', {
                  lowerBackPanelHeightMm: lowerBackPanelHeight / 0.01,
                  upperBackPanelHeightMm: upperBackPanelHeight / 0.01,
                  expected_lower: lowerSectionHeight / 0.01 - basicThickness * 2 / 0.01 + 10,
                  expected_upper: upperSectionHeight / 0.01 - basicThickness * 2 / 0.01 + 10
                });

                // 백패널 Y 위치 조정
                // 4drawer: 하부 yOffset 적용 안함 (기본 위치)
                // 2drawer: yOffsetFor2Drawer만큼 위로
                const yOffset = moduleData?.id?.includes('4drawer-hanging')
                  ? 0
                  : mmToThreeUnits(backPanelConfig.yOffsetFor2Drawer);
                const lowerBackPanelY = -height/2 + lowerSectionHeight/2 + yOffset - mmToThreeUnits(backPanelConfig.lowerYAdjustment);
                // 4drawer-hanging의 상부는 yOffset 적용 안함
                const upperBackPanelY = moduleData?.id?.includes('4drawer-hanging')
                  ? -height/2 + lowerSectionHeight + upperSectionHeight/2
                  : -height/2 + lowerSectionHeight + upperSectionHeight/2 + yOffset;

                console.log('🔍🔍🔍 백패널 Y 위치:', {
                  lowerBackPanelYMm: lowerBackPanelY / 0.01,
                  upperBackPanelYMm: upperBackPanelY / 0.01
                });

                // 섹션별 백패널 Z 위치 계산
                const lowerSectionDepth = lowerSectionDepthMm !== undefined ? mmToThreeUnits(lowerSectionDepthMm) : depth;
                const upperSectionDepth = upperSectionDepthMm !== undefined ? mmToThreeUnits(upperSectionDepthMm) : depth;

                // 깊이 차이에 따른 Z 오프셋 (앞쪽 고정, 뒤쪽 줄어듦)
                const lowerDepthDiff = depth - lowerSectionDepth;
                const upperDepthDiff = depth - upperSectionDepth;
                const lowerZOffset = lowerDepthDiff / 2;
                const upperZOffset = upperDepthDiff / 2;

                const lowerBackPanelZ = -lowerSectionDepth/2 + backPanelThickness/2 + mmToThreeUnits(backPanelConfig.depthOffset) + lowerZOffset;
                const upperBackPanelZ = -upperSectionDepth/2 + backPanelThickness/2 + mmToThreeUnits(backPanelConfig.depthOffset) + upperZOffset;

                return (
                  <>
                    {/* 하부 섹션 백패널 */}
                    <BoxWithEdges
                      args={[innerWidth + mmToThreeUnits(backPanelConfig.widthExtension), lowerBackPanelHeight, backPanelThickness]}
                      position={[0, lowerBackPanelY, lowerBackPanelZ]}
                      material={material}
                      renderMode={renderMode}
                      isDragging={isDragging}
                      isBackPanel={true}
                      isHighlighted={highlightedSection === `${placedFurnitureId}-0`}
                      panelName="하부장 백패널"
                      panelGrainDirections={panelGrainDirections}
                    furnitureId={placedFurnitureId}
                      textureUrl={textureUrl}
                    />

                    {/* 상부 섹션 백패널 */}
                    <BoxWithEdges
                      args={[innerWidth + mmToThreeUnits(backPanelConfig.widthExtension), upperBackPanelHeight, backPanelThickness]}
                      position={[0, upperBackPanelY, upperBackPanelZ]}
                      material={material}
                      renderMode={renderMode}
                      isDragging={isDragging}
                      isBackPanel={true}
                      isHighlighted={highlightedSection === `${placedFurnitureId}-1`}
                      panelName="상부장 백패널"
                      panelGrainDirections={panelGrainDirections}
                    furnitureId={placedFurnitureId}
                      textureUrl={textureUrl}
                    />
                  </>
                );
              })()}
            </>
          ) : (
            // 단일 섹션: 기존 통짜 백패널
            <BoxWithEdges
              args={[innerWidth + mmToThreeUnits(backPanelConfig.widthExtension), innerHeight + mmToThreeUnits(backPanelConfig.heightExtension), backPanelThickness]}
              position={[0, 0, -depth/2 + backPanelThickness/2 + mmToThreeUnits(backPanelConfig.depthOffset)]}
              material={material}
              renderMode={renderMode}
              isDragging={isDragging}
              isBackPanel={true}
              panelName="백패널"
              panelGrainDirections={panelGrainDirections}
                    furnitureId={placedFurnitureId}
              textureUrl={textureUrl}
            />
          )}
        </>
        )}

        {/* 환기캡 렌더링 - 백패널이 있을 때만 */}
        {hasBackPanel && !isDragging && (
          <VentilationCap
            position={[
              innerWidth/2 - mmToThreeUnits(132),  // 우측 패널 안쪽으로 132mm
              height/2 - basicThickness - mmToThreeUnits(115),  // 상단 패널 아래로 115mm
              -depth/2 + backPanelThickness + mmToThreeUnits(backPanelConfig.depthOffset) + 0.01  // 백패널 앞쪽에 살짝 앞으로
            ]}
            diameter={98}
            renderMode={renderMode}
          />
        )}

        {/* 내부 구조 (타입별로 다른 내용) */}
        {children}

        {/* 조절발통 (네 모서리) - 띄움배치가 아닐 때만 */}
        {(() => {
          const baseDepthValue = spaceInfo?.baseConfig?.depth || 0;
          console.log('🏠 BaseFurnitureShell - baseDepth 전달:', {
            spaceInfoExists: !!spaceInfo,
            baseConfigExists: !!spaceInfo?.baseConfig,
            baseDepthValue,
            fullBaseConfig: spaceInfo?.baseConfig
          });
          // 다중 섹션이면 뒤쪽 조절발 Z 오프셋 계산
          // 앞면 고정, 뒷면만 이동하므로 전체 차이만큼 이동
          const backZOffset = isMultiSectionFurniture() && lowerSectionDepthMm !== undefined
            ? (depth - mmToThreeUnits(lowerSectionDepthMm))
            : 0;

          return (
            <AdjustableFootsRenderer
              width={width}
              depth={depth}
              yOffset={-height / 2}
              backZOffset={backZOffset}
              material={material}
              renderMode={renderMode}
              isHighlighted={isHighlighted}
              isFloating={isFloating}
              baseHeight={spaceInfo?.baseConfig?.height || 65}
              baseDepth={baseDepthValue}
              viewMode={viewMode}
              view2DDirection={view2DDirection}
            />
          );
        })()}
      </>
      )}
    </group>
  );
};

export default BaseFurnitureShell; 