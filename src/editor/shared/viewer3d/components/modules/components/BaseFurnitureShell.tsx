import React, { useMemo, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useThree } from '@react-three/fiber';
import { useTheme } from '@/contexts/ThemeContext';
import { useUIStore } from '@/store/uiStore';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import BoxWithEdges from './BoxWithEdges';
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

  // 하부장 상부패널 오프셋 (mm)
  lowerSectionTopOffsetMm?: number;

  // 텍스처 URL과 패널별 결 방향
  textureUrl?: string;
  panelGrainDirections?: { [panelName: string]: 'horizontal' | 'vertical' };

  // 렌더 모드
  renderMode?: 'solid' | 'wireframe';

  // 엔드패널 여부
  isLeftEndPanel?: boolean;
  isRightEndPanel?: boolean;

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
  lowerSectionTopOffsetMm,
  isLeftEndPanel = false,
  isRightEndPanel = false,
  textureUrl,
  panelGrainDirections,
  renderMode: renderModeProp,
  children
}) => {
  const { renderMode: contextRenderMode, viewMode } = useSpace3DView(); // context에서 renderMode와 viewMode 가져오기
  const renderMode = renderModeProp || contextRenderMode; // prop 우선, 없으면 context 사용
  const { gl } = useThree(); // Three.js renderer 가져오기
  const { theme } = useTheme(); // 테마 정보 가져오기
  const { view2DDirection, showDimensions, showDimensionsText } = useUIStore(); // UI 스토어에서 view2DDirection 가져오기
  const highlightedSection = useUIStore(state => state.highlightedSection);
  const highlightedPanel = useUIStore(state => state.highlightedPanel);
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
      color: new THREE.Color('#00FF00'), // 형광 녹색
      transparent: true,
      opacity: 1.0
    }),
  []);

  // 패널 비활성화용 material - 한 번만 생성하고 재사용
  const panelDimmedMaterial = useMemo(() => {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#666666'),
      transparent: true,
      opacity: 0.1
    });
    mat.needsUpdate = true;
    return mat;
  }, []); // 한 번만 생성

  // 패널용 material 결정 함수 - useCallback로 최적화
  const getPanelMaterial = useCallback((panelName: string) => {
    // 패널 ID 생성
    const panelId = `${placedFurnitureId}-${panelName}`;

    // 패널이 강조되어야 하는지 확인
    const isHighlighted = highlightedPanel === panelId;

    if (highlightedPanel) {
      console.log('🔍 패널 material 체크:', {
        panelName,
        placedFurnitureId,
        highlightedPanel,
        panelId,
        isHighlighted,
        returningMaterial: isHighlighted ? 'highlight' : 'normal'
      });
    }

    // 선택된 패널만 형광색으로 강조, 나머지는 원래대로
    if (isHighlighted) {
      return highlightMaterial;
    }
    return material;
  }, [highlightedPanel, placedFurnitureId, material, highlightMaterial]);

  // 좌우 프레임에 사용할 material 결정 함수
  const getSidePanelMaterial = (panelName: string) => {
    // 2D 정면뷰에서는 엔드패널 여부와 관계없이 일반 재질 사용
    // 엔드패널은 BoxWithEdges의 isHighlighted prop으로 별도 처리됨
    return getPanelMaterial(panelName);
  };

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

              const isTwoDrawer = moduleData?.id?.includes('2drawer-hanging');
              const isTwoHanging = moduleData?.id?.includes('2hanging');

              // 2단 행잉 타입만 기존 오프셋 유지, 2단 서랍은 섹션 높이를 그대로 사용
              const applyOffset = isTwoHanging && !isTwoDrawer;

              const adjustedLowerHeight = applyOffset
                ? lowerSectionHeight + basicThickness
                : lowerSectionHeight;
              const lowerPanelY = -height/2 + adjustedLowerHeight/2;

              const adjustedUpperHeight = applyOffset
                ? upperSectionHeight - basicThickness
                : upperSectionHeight;
              const upperOffset = applyOffset ? basicThickness : 0;
              const upperPanelY = -height/2 + lowerSectionHeight + upperOffset + adjustedUpperHeight/2;

              // 섹션 강조 확인 (placedFurnitureId 사용)
              const isLowerSectionHighlighted = highlightedSection === `${placedFurnitureId}-0`;
              const isLowerTopPanelHighlighted = highlightedPanel === `${placedFurnitureId}-(하)상판`;
              const isLowerHighlighted = isLowerSectionHighlighted || isLowerTopPanelHighlighted;
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
                    key={`lower-left-panel-${getSidePanelMaterial('(하)좌측').uuid}`}
                    args={[basicThickness, adjustedLowerHeight, lowerDepth]}
                    position={[-innerWidth/2 - basicThickness/2, lowerPanelY, lowerZOffset]}
                    material={getSidePanelMaterial('(하)좌측')}
                    renderMode={renderMode}
                    isDragging={isDragging}
                    isHighlighted={isLowerSectionHighlighted}
                    isEndPanel={isLeftEndPanel}
                    panelName="(하)좌측"
                    panelGrainDirections={panelGrainDirections}
                    furnitureId={placedFurnitureId}
                    textureUrl={textureUrl}
                  />

                  {/* 왼쪽 상부 측판 */}
                  <BoxWithEdges
                    key={`upper-left-panel-${getSidePanelMaterial('(상)좌측').uuid}`}
                    args={[basicThickness, adjustedUpperHeight, upperDepth]}
                    position={[-innerWidth/2 - basicThickness/2, upperPanelY, upperZOffset]}
                    material={getSidePanelMaterial('(상)좌측')}
                    renderMode={renderMode}
                    isDragging={isDragging}
                    isHighlighted={isUpperHighlighted}
                    isEndPanel={isLeftEndPanel}
                    panelName="(상)좌측"
                    panelGrainDirections={panelGrainDirections}
                    furnitureId={placedFurnitureId}
                    textureUrl={textureUrl}
                  />

                  {/* 오른쪽 하부 측판 */}
                  <BoxWithEdges
                    key={`lower-right-panel-${getSidePanelMaterial('(하)우측').uuid}`}
                    args={[basicThickness, adjustedLowerHeight, lowerDepth]}
                    position={[innerWidth/2 + basicThickness/2, lowerPanelY, lowerZOffset]}
                    material={getSidePanelMaterial('(하)우측')}
                    renderMode={renderMode}
                    isDragging={isDragging}
                    isHighlighted={isLowerSectionHighlighted}
                    isEndPanel={isRightEndPanel}
                    panelName="(하)우측"
                    panelGrainDirections={panelGrainDirections}
                    furnitureId={placedFurnitureId}
                    textureUrl={textureUrl}
                  />

                  {/* 오른쪽 상부 측판 */}
                  <BoxWithEdges
                    key={`upper-right-panel-${getSidePanelMaterial('(상)우측').uuid}`}
                    args={[basicThickness, adjustedUpperHeight, upperDepth]}
                    position={[innerWidth/2 + basicThickness/2, upperPanelY, upperZOffset]}
                    material={getSidePanelMaterial('(상)우측')}
                    renderMode={renderMode}
                    isDragging={isDragging}
                    isEndPanel={isRightEndPanel}
                    isHighlighted={isUpperHighlighted}
                    panelName="(상)우측"
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
              key={`left-panel-${getSidePanelMaterial('좌측판').uuid}`}
              args={[basicThickness, height, depth]}
              position={[-innerWidth/2 - basicThickness/2, 0, 0]}
              material={getSidePanelMaterial('좌측판')}
              renderMode={renderMode}
              isDragging={isDragging}
              isEndPanel={isLeftEndPanel}
              panelName="좌측판"
              panelGrainDirections={panelGrainDirections}
                    furnitureId={placedFurnitureId}
              textureUrl={textureUrl}
            />

            {/* 오른쪽 측면 판재 */}
            <BoxWithEdges
              key={`right-panel-${getSidePanelMaterial('우측판').uuid}`}
              args={[basicThickness, height, depth]}
              position={[innerWidth/2 + basicThickness/2, 0, 0]}
              material={getSidePanelMaterial('우측판')}
              renderMode={renderMode}
              isDragging={isDragging}
              isEndPanel={isRightEndPanel}
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
                  const isLowerSectionHighlighted = highlightedSection === `${placedFurnitureId}-0`;
                  const isLowerTopPanelHighlighted = highlightedPanel === `${placedFurnitureId}-(하)상판`;
                  const isLowerHighlighted = isLowerSectionHighlighted || isLowerTopPanelHighlighted;
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
                      {/* 상부 섹션 바닥판 - 뒤에서 26mm 줄여서 백패널과 맞닿게, 좌우 각 0.5mm씩 줄임 */}
                      <BoxWithEdges
                        key={`upper-floor-${getPanelMaterial('(상)바닥').uuid}`}
                        args={[innerWidth - mmToThreeUnits(1), basicThickness, upperSectionDepth - mmToThreeUnits(26)]}
                        position={[0, middlePanelY, upperZOffset + mmToThreeUnits(13)]}
                        material={getPanelMaterial('(상)바닥')}
                        renderMode={renderMode}
                        isDragging={isDragging}
                        isHighlighted={isUpperHighlighted}
                        panelName="(상)바닥"
                        panelGrainDirections={panelGrainDirections}
                        furnitureId={placedFurnitureId}
                        textureUrl={textureUrl}
                      />

                      {/* 하부 섹션 상판 - 뒤에서 26mm 줄여서 백패널과 맞닿게 + 사용자 오프셋 적용 (앞에서 줄어듦), 좌우 각 0.5mm씩 줄임 */}
                      <BoxWithEdges
                        key={`lower-top-${getPanelMaterial('(하)상판').uuid}`}
                        args={[innerWidth - mmToThreeUnits(1), basicThickness - mmToThreeUnits(0.1), lowerSectionDepth - mmToThreeUnits(26) - mmToThreeUnits(lowerSectionTopOffsetMm || 0)]}
                        position={[0, lowerTopPanelY - mmToThreeUnits(0.05), lowerZOffset + mmToThreeUnits(13) - mmToThreeUnits(lowerSectionTopOffsetMm || 0)/2]}
                        material={getPanelMaterial('(하)상판')}
                        renderMode={renderMode}
                        isDragging={isDragging}
                        isHighlighted={isLowerTopPanelHighlighted || isLowerSectionHighlighted}
                        panelName="(하)상판"
                        panelGrainDirections={panelGrainDirections}
                        furnitureId={placedFurnitureId}
                        textureUrl={textureUrl}
                      />
                    </React.Fragment>
                  );
                });
              })()
            ) : moduleData?.id?.includes('dual-2drawer-hanging') ? (
              // dual-2drawer-hanging: 듀얼장 전용 처리
              (() => {
                return getSectionHeights().map((sectionHeight: number, index: number) => {
                  if (index >= getSectionHeights().length - 1) return null;

                  let currentYPosition = -height/2 + basicThickness;

                  // 현재 섹션까지의 Y 위치 계산
                  for (let i = 0; i <= index; i++) {
                    currentYPosition += getSectionHeights()[i];
                  }

                  // 섹션 경계 지점 계산
                  const sectionBoundaryY = currentYPosition - basicThickness;

                  // 하부 섹션 상판: 경계 바로 아래에 위치 (경계와 0.05mm 이격)
                  const lowerTopPanelY = sectionBoundaryY - basicThickness/2 - mmToThreeUnits(0.05);

                  // 상부 섹션 바닥판: 경계 바로 위에 위치 (경계와 0.05mm 이격)
                  const upperFloorY = sectionBoundaryY + basicThickness/2 + mmToThreeUnits(0.05);

                  // 섹션 강조 확인 (placedFurnitureId 사용)
                  const isLowerSectionHighlighted = highlightedSection === `${placedFurnitureId}-0`;
                  const isLowerTopPanelHighlighted = highlightedPanel === `${placedFurnitureId}-(하)상판`;
                  const isLowerHighlighted = isLowerSectionHighlighted || isLowerTopPanelHighlighted;
                  const isUpperHighlighted = highlightedSection === `${placedFurnitureId}-1`;

                  // 섹션별 깊이 가져오기
                  const lowerSectionDepth = lowerSectionDepthMm !== undefined ? mmToThreeUnits(lowerSectionDepthMm) : depth;
                  const upperSectionDepth = upperSectionDepthMm !== undefined ? mmToThreeUnits(upperSectionDepthMm) : depth;

                  // 깊이 차이 계산 (뒤쪽으로만 줄어들도록)
                  const lowerDepthDiff = depth - lowerSectionDepth;
                  const upperDepthDiff = depth - upperSectionDepth;
                  const lowerZOffset = lowerDepthDiff / 2; // 양수: 앞쪽 고정, 뒤쪽 줄어듦
                  const upperZOffset = upperDepthDiff / 2; // 양수: 앞쪽 고정, 뒤쪽 줄어듦

                  // 백패널 두께
                  const backPanelThickness = depth - adjustedDepthForShelves;

                  // 하부 섹션 조정된 깊이
                  const lowerAdjustedDepth = lowerSectionDepth - backPanelThickness;

                  // 상부 섹션 조정된 깊이
                  const upperAdjustedDepth = upperSectionDepth - backPanelThickness;

                  console.log('🔍 듀얼장 중간판 깊이 계산:', {
                    moduleId: moduleData.id,
                    lowerSectionDepthMm,
                    upperSectionDepthMm,
                    lowerSectionDepth: lowerSectionDepth / 0.01,
                    upperSectionDepth: upperSectionDepth / 0.01,
                    lowerAdjustedDepth: lowerAdjustedDepth / 0.01,
                    upperAdjustedDepth: upperAdjustedDepth / 0.01,
                    lowerZOffset: lowerZOffset / 0.01,
                    upperZOffset: upperZOffset / 0.01,
                    depth: depth / 0.01,
                    adjustedDepthForShelves: adjustedDepthForShelves / 0.01
                  });

                  return (
                    <React.Fragment key={`divider-${index}`}>
                      {/* 하부 섹션 상판 - 뒤에서 26mm 줄여서 백패널과 맞닿게 + 사용자 오프셋 적용 (앞에서 줄어듦), 좌우 각 0.5mm씩 줄임 */}
                      <BoxWithEdges
                        key={`lower-top-dual-2drawer-${getPanelMaterial('(하)상판').uuid}`}
                        args={[innerWidth - mmToThreeUnits(1), basicThickness - mmToThreeUnits(0.1), lowerSectionDepth - mmToThreeUnits(26) - mmToThreeUnits(lowerSectionTopOffsetMm || 0)]}
                        position={[0, lowerTopPanelY, lowerZOffset + mmToThreeUnits(13) - mmToThreeUnits(lowerSectionTopOffsetMm || 0)/2]}
                        material={getPanelMaterial('(하)상판')}
                        renderMode={renderMode}
                        isDragging={isDragging}
                        isHighlighted={isLowerTopPanelHighlighted || isLowerSectionHighlighted}
                        panelName="(하)상판"
                        panelGrainDirections={panelGrainDirections}
                        furnitureId={placedFurnitureId}
                        textureUrl={textureUrl}
                      />

                      {/* 상부 섹션 바닥판 - 뒤에서 26mm 줄여서 백패널과 맞닿게, 좌우 각 0.5mm씩 줄임 */}
                      <BoxWithEdges
                        key={`upper-floor-dual-2drawer-${getPanelMaterial('(상)바닥').uuid}`}
                        args={[innerWidth - mmToThreeUnits(1), basicThickness, upperSectionDepth - mmToThreeUnits(26)]}
                        position={[0, upperFloorY, upperZOffset + mmToThreeUnits(13)]}
                        material={getPanelMaterial('(상)바닥')}
                        renderMode={renderMode}
                        isDragging={isDragging}
                        isHighlighted={isUpperHighlighted}
                        panelName="(상)바닥"
                        panelGrainDirections={panelGrainDirections}
                        furnitureId={placedFurnitureId}
                        textureUrl={textureUrl}
                      />
                    </React.Fragment>
                  );
                });
              })()
            ) : moduleData?.id?.includes('2drawer-hanging') ? (
              // 2drawer-hanging: 싱글장 처리
              (() => {
                return getSectionHeights().map((sectionHeight: number, index: number) => {
                  if (index >= getSectionHeights().length - 1) return null;

                  let currentYPosition = -height/2 + basicThickness;

                  // 현재 섹션까지의 Y 위치 계산
                  for (let i = 0; i <= index; i++) {
                    currentYPosition += getSectionHeights()[i];
                  }

                  // 섹션 경계 지점 계산
                  const sectionBoundaryY = currentYPosition - basicThickness;

                  // 하부 섹션 상판: 경계 바로 아래에 위치 (경계와 0.05mm 이격)
                  const lowerTopPanelY = sectionBoundaryY - basicThickness/2 - mmToThreeUnits(0.05);

                  // 상부 섹션 바닥판: 경계 바로 위에 위치 (경계와 0.05mm 이격)
                  const upperFloorY = sectionBoundaryY + basicThickness/2 + mmToThreeUnits(0.05);

                  // 섹션 강조 확인 (placedFurnitureId 사용)
                  const isLowerSectionHighlighted = highlightedSection === `${placedFurnitureId}-0`;
                  const isLowerTopPanelHighlighted = highlightedPanel === `${placedFurnitureId}-(하)상판`;
                  const isLowerHighlighted = isLowerSectionHighlighted || isLowerTopPanelHighlighted;
                  const isUpperHighlighted = highlightedSection === `${placedFurnitureId}-1`;

                  // 섹션별 깊이 가져오기
                  const lowerSectionDepth = lowerSectionDepthMm !== undefined ? mmToThreeUnits(lowerSectionDepthMm) : depth;
                  const upperSectionDepth = upperSectionDepthMm !== undefined ? mmToThreeUnits(upperSectionDepthMm) : depth;

                  // 깊이 차이 계산 (뒤쪽으로만 줄어들도록)
                  const lowerDepthDiff = depth - lowerSectionDepth;
                  const upperDepthDiff = depth - upperSectionDepth;
                  const lowerZOffset = lowerDepthDiff / 2; // 양수: 앞쪽 고정, 뒤쪽 줄어듦
                  const upperZOffset = upperDepthDiff / 2; // 양수: 앞쪽 고정, 뒤쪽 줄어듦

                  // 백패널 두께
                  const backPanelThickness = depth - adjustedDepthForShelves;

                  // 하부 섹션 조정된 깊이
                  const lowerAdjustedDepth = lowerSectionDepth - backPanelThickness;

                  // 상부 섹션 조정된 깊이
                  const upperAdjustedDepth = upperSectionDepth - backPanelThickness;

                  return (
                    <React.Fragment key={`divider-${index}`}>
                      {/* 하부 섹션 상판 - 뒤에서 26mm 줄여서 백패널과 맞닿게 + 사용자 오프셋 적용 (앞에서 줄어듦), 좌우 각 0.5mm씩 줄임 */}
                      <BoxWithEdges
                        key={`lower-top-2drawer-${getPanelMaterial('(하)상판').uuid}`}
                        args={[innerWidth - mmToThreeUnits(1), basicThickness - mmToThreeUnits(0.1), lowerSectionDepth - mmToThreeUnits(26) - mmToThreeUnits(lowerSectionTopOffsetMm || 0)]}
                        position={[0, lowerTopPanelY, lowerZOffset + mmToThreeUnits(13) - mmToThreeUnits(lowerSectionTopOffsetMm || 0)/2]}
                        material={getPanelMaterial('(하)상판')}
                        renderMode={renderMode}
                        isDragging={isDragging}
                        isHighlighted={isLowerTopPanelHighlighted || isLowerSectionHighlighted}
                        panelName="(하)상판"
                        panelGrainDirections={panelGrainDirections}
                        furnitureId={placedFurnitureId}
                        textureUrl={textureUrl}
                      />

                      {/* 상부 섹션 바닥판 - 뒤에서 26mm 줄여서 백패널과 맞닿게, 좌우 각 0.5mm씩 줄임 */}
                      <BoxWithEdges
                        key={`upper-floor-2drawer-${getPanelMaterial('(상)바닥').uuid}`}
                        args={[innerWidth - mmToThreeUnits(1), basicThickness, upperSectionDepth - mmToThreeUnits(26)]}
                        position={[0, upperFloorY, upperZOffset + mmToThreeUnits(13)]}
                        material={getPanelMaterial('(상)바닥')}
                        renderMode={renderMode}
                        isDragging={isDragging}
                        isHighlighted={isUpperHighlighted}
                        panelName="(상)바닥"
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
                const isLowerSectionHighlighted = highlightedSection === `${placedFurnitureId}-0`;
                const isLowerTopPanelHighlighted = highlightedPanel === `${placedFurnitureId}-(하)상판`;
                const isLowerHighlighted = isLowerSectionHighlighted || isLowerTopPanelHighlighted;

                const panelName = index === 0 ? '(하)상판' : '(상)바닥';
                const isPanelHighlighted = panelName === '(하)상판'
                  ? (isLowerTopPanelHighlighted || isLowerSectionHighlighted)
                  : isLowerSectionHighlighted;
                const panelMat = getPanelMaterial(panelName);
                return (
                  <BoxWithEdges
                    key={`divider-${index}-${panelMat.uuid}`}
                    args={[innerWidth - mmToThreeUnits(1), basicThickness, depth - mmToThreeUnits(26)]}
                    position={[0, dividerY, mmToThreeUnits(13)]}
                    material={panelMat}
                    renderMode={renderMode}
                    isDragging={isDragging}
                    isHighlighted={isPanelHighlighted}
                    panelName={panelName}
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

        {/* 상단 판재 - 뒤에서 26mm 줄여서 백패널과 맞닿게, 좌우 각 0.5mm씩 줄임 */}
        {(() => {
          const panelName = isMultiSectionFurniture() ? '(상)상판' : '상판';
          const topPanelMat = getPanelMaterial(panelName);
          const backReduction = mmToThreeUnits(26); // 뒤에서 26mm 줄임
          const widthReduction = mmToThreeUnits(1); // 좌우 각 0.5mm씩 총 1mm 줄임
          return (
            <BoxWithEdges
              key={`top-panel-${topPanelMat.uuid}`}
              args={[innerWidth - widthReduction, basicThickness, (() => {
                // 다중 섹션이고 상부 깊이가 있으면 상부 섹션 깊이 사용
                if (isMultiSectionFurniture() && upperSectionDepthMm !== undefined) {
                  return mmToThreeUnits(upperSectionDepthMm) - backReduction;
                }
                return depth - backReduction;
              })()]}
              position={[0, height/2 - basicThickness/2, (() => {
                // 다중 섹션이고 상부 깊이가 있으면 Z 오프셋 적용
                if (isMultiSectionFurniture() && upperSectionDepthMm !== undefined) {
                  const upperDepth = mmToThreeUnits(upperSectionDepthMm);
                  const depthDiff = depth - upperDepth;
                  return depthDiff / 2 + backReduction / 2; // 앞쪽 고정, 뒤쪽 줄어듦 + 백패널 맞춤
                }
                return backReduction / 2; // 앞쪽 고정, 뒤에서 26mm 줄임
              })()]}
              material={topPanelMat}
              renderMode={renderMode}
              isDragging={isDragging}
              isHighlighted={isMultiSectionFurniture() ? highlightedSection === `${placedFurnitureId}-1` : false}
              panelName="상판"
              panelGrainDirections={panelGrainDirections}
              furnitureId={placedFurnitureId}
              textureUrl={textureUrl}
            />
          );
        })()}

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
              [-innerWidth/2 * 0.3, height/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0],
              [-innerWidth/2 * 0.3, height/2 - basicThickness, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]
            ]}
            color={viewMode === '3D' ? '#000000' : dimensionColor}
            lineWidth={1}
          />
          {/* 수직선 양끝 점 - 측면뷰/탑뷰와 드래그 중에는 숨김 */}
          {!isDragging && !(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right' || view2DDirection === 'top')) && (
            <>
              <mesh position={[-innerWidth/2 * 0.3, height/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
                <sphereGeometry args={[0.05, 8, 8]} />
                <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
              </mesh>
              <mesh position={[-innerWidth/2 * 0.3, height/2 - basicThickness, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
                <sphereGeometry args={[0.05, 8, 8]} />
                <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
              </mesh>
            </>
          )}
        </group>
        )}

        {/* 하단 판재 - 뒤에서 26mm 줄여서 백패널과 맞닿게, 좌우 각 0.5mm씩 줄임 */}
        {(() => {
          const panelName = isMultiSectionFurniture() ? '(하)바닥' : '바닥판';
          const bottomPanelMat = getPanelMaterial(panelName);
          const backReduction = mmToThreeUnits(26); // 뒤에서 26mm 줄임
          const widthReduction = mmToThreeUnits(1); // 좌우 각 0.5mm씩 총 1mm 줄임
          return (
            <BoxWithEdges
              key={`bottom-panel-${bottomPanelMat.uuid}`}
              args={[innerWidth - widthReduction, basicThickness, (() => {
                // 다중 섹션이고 하부 깊이가 있으면 하부 섹션 깊이 사용
                if (isMultiSectionFurniture() && lowerSectionDepthMm !== undefined) {
                  return mmToThreeUnits(lowerSectionDepthMm) - backReduction;
                }
                return depth - backReduction;
              })()]}
              position={[0, -height/2 + basicThickness/2, (() => {
                // 다중 섹션이고 하부 깊이가 있으면 Z 오프셋 적용
                if (isMultiSectionFurniture() && lowerSectionDepthMm !== undefined) {
                  const lowerDepth = mmToThreeUnits(lowerSectionDepthMm);
                  const depthDiff = depth - lowerDepth;
                  return depthDiff / 2 + backReduction / 2; // 앞쪽 고정, 뒤쪽 줄어듦 + 백패널 맞춤
                }
                return backReduction / 2; // 앞쪽 고정, 뒤에서 26mm 줄임
              })()]}
              material={bottomPanelMat}
              renderMode={renderMode}
              isDragging={isDragging}
              isHighlighted={isMultiSectionFurniture() ? highlightedSection === `${placedFurnitureId}-0` : false}
              panelName="바닥판"
              panelGrainDirections={panelGrainDirections}
              furnitureId={placedFurnitureId}
              textureUrl={textureUrl}
            />
          );
        })()}

        {/* Type4 하부섹션 바닥판 두께 치수 표시 - 정면도에서만 */}
        {(moduleData?.id?.includes('4drawer-hanging') || moduleData?.id?.includes('2drawer-hanging')) && showDimensions && showDimensionsText && (viewMode === '3D' || view2DDirection === 'front') && !(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
        <group>
          {/* 바닥판 두께 텍스트 */}
          <Text
            position={[
              viewMode === '3D' ? -innerWidth/2 * 0.3 - 0.8 : -innerWidth/2 * 0.3 - 0.5,
              -height/2 + basicThickness/2,
              viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0
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

          {/* 바닥판 두께 수직선 */}
          <Line
            points={[
              [-innerWidth/2 * 0.3, -height/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0],
              [-innerWidth/2 * 0.3, -height/2 + basicThickness, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]
            ]}
            color={viewMode === '3D' ? '#000000' : dimensionColor}
            lineWidth={1}
          />
          {/* 수직선 양끝 점 - 측면뷰/탑뷰와 드래그 중에는 숨김 */}
          {!isDragging && !(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right' || view2DDirection === 'top')) && (
            <>
              <mesh position={[-innerWidth/2 * 0.3, -height/2, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
                <sphereGeometry args={[0.05, 8, 8]} />
                <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
              </mesh>
              <mesh position={[-innerWidth/2 * 0.3, -height/2 + basicThickness, viewMode === '3D' ? adjustedDepthForShelves/2 + 0.1 : depth/2 + 1.0]}>
                <sphereGeometry args={[0.05, 8, 8]} />
                <meshBasicMaterial color={viewMode === '3D' ? '#000000' : dimensionColor} />
              </mesh>
            </>
          )}
        </group>
        )}

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

                // 가구 타입 확인
                const is4Drawer = moduleData?.id?.includes('4drawer-hanging');
                const isTwoDrawer = moduleData?.id?.includes('2drawer-hanging');
                const isTwoHanging = moduleData?.id?.includes('2hanging');

                // 백패널 높이 확장값 (위아래 각각 13mm씩 = 총 26mm)
                const backPanelTopExtension = 13; // mm
                const backPanelBottomExtension = 13; // mm
                const totalHeightExtension = mmToThreeUnits(backPanelTopExtension + backPanelBottomExtension);

                // 측판과 동일한 높이 계산 로직 사용 (2단 행잉만 오프셋 적용)
                const applyOffset = isTwoHanging && !isTwoDrawer;

                // 원본 백패널 높이 (섹션 높이 - 상하판 두께×2 + 기본 확장값 10mm)
                const originalLowerBackPanelHeight = lowerSectionHeight - basicThickness * 2 + mmToThreeUnits(backPanelConfig.heightExtension);
                const originalUpperBackPanelHeight = upperSectionHeight - basicThickness * 2 + mmToThreeUnits(backPanelConfig.heightExtension);

                // 백패널 높이 = 원본 + 위아래 13mm씩 확장 (측판과 동일하게)
                const lowerBackPanelHeight = applyOffset
                  ? originalLowerBackPanelHeight + totalHeightExtension + mmToThreeUnits(backPanelConfig.lowerHeightBonus)
                  : originalLowerBackPanelHeight + totalHeightExtension;

                const upperBackPanelHeight = applyOffset
                  ? originalUpperBackPanelHeight + totalHeightExtension - basicThickness
                  : originalUpperBackPanelHeight + totalHeightExtension;

                console.log('🔍🔍🔍 백패널 높이 (13mm씩 확장):', {
                  lowerBackPanelHeightMm: lowerBackPanelHeight / 0.01,
                  upperBackPanelHeightMm: upperBackPanelHeight / 0.01,
                  originalLowerMm: originalLowerBackPanelHeight / 0.01,
                  originalUpperMm: originalUpperBackPanelHeight / 0.01,
                  extensionMm: backPanelTopExtension + backPanelBottomExtension,
                  applyOffset,
                  isTwoHanging
                });

                // 백패널 Y 위치 조정 (하단 13mm 확장분만큼 아래로 이동)
                const lowerBackPanelY = -height/2 + lowerSectionHeight/2 - mmToThreeUnits(backPanelBottomExtension - backPanelTopExtension)/2;
                const upperOffset = applyOffset ? basicThickness : 0;
                const upperBackPanelY = -height/2 + lowerSectionHeight + upperOffset + upperSectionHeight/2;

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

                // 환기캡 Z 위치 계산 (상부 백패널 앞쪽 표면에 붙음)
                const ventCapZ = upperBackPanelZ + backPanelThickness/2 + 0.01;

                console.log('🔧 백패널 Z 위치 계산:', {
                  depthMm: depth / 0.01,
                  upperSectionDepthMm: upperSectionDepth / 0.01,
                  upperDepthDiffMm: upperDepthDiff / 0.01,
                  upperZOffsetMm: upperZOffset / 0.01,
                  backPanelThicknessMm: backPanelThickness / 0.01,
                  depthOffsetMm: backPanelConfig.depthOffset,
                  계산식: '-upperSectionDepth/2 + backPanelThickness/2 + depthOffset + upperZOffset',
                  upperBackPanelZMm: upperBackPanelZ / 0.01,
                  ventCapZMm: ventCapZ / 0.01
                });

                return (
                  <>
                    {/* 하부 섹션 백패널 */}
                    <BoxWithEdges
                      key={`lower-back-${getPanelMaterial('(하)백패널').uuid}`}
                      args={[innerWidth + mmToThreeUnits(backPanelConfig.widthExtension), lowerBackPanelHeight, backPanelThickness]}
                      position={[0, lowerBackPanelY, lowerBackPanelZ]}
                      material={getPanelMaterial('(하)백패널')}
                      renderMode={renderMode}
                      isDragging={isDragging}
                      isBackPanel={true}
                      isHighlighted={highlightedSection === `${placedFurnitureId}-0`}
                      panelName="(하)백패널"
                      panelGrainDirections={panelGrainDirections}
                      furnitureId={placedFurnitureId}
                      textureUrl={textureUrl}
                    />

                    {/* 상부 섹션 백패널 */}
                    <BoxWithEdges
                      key={`upper-back-${getPanelMaterial('(상)백패널').uuid}`}
                      args={[innerWidth + mmToThreeUnits(backPanelConfig.widthExtension), upperBackPanelHeight, backPanelThickness]}
                      position={[0, upperBackPanelY, upperBackPanelZ]}
                      material={getPanelMaterial('(상)백패널')}
                      renderMode={renderMode}
                      isDragging={isDragging}
                      isBackPanel={true}
                      isHighlighted={highlightedSection === `${placedFurnitureId}-1`}
                      panelName="(상)백패널"
                      panelGrainDirections={panelGrainDirections}
                      furnitureId={placedFurnitureId}
                      textureUrl={textureUrl}
                    />

                    {/* 보강대 (각 섹션 백패널 상/하단) - 60mm 높이, 15.5mm 두께 - 2D 정면도에서는 숨김 */}
                    {!(viewMode === '2D' && view2DDirection === 'front') && (() => {
                      const reinforcementHeight = mmToThreeUnits(60);
                      const reinforcementDepth = mmToThreeUnits(15);
                      // 보강대 Z 위치: 백패널 뒤쪽
                      const lowerReinforcementZ = lowerBackPanelZ - backPanelThickness/2 - reinforcementDepth/2;
                      const upperReinforcementZ = upperBackPanelZ - backPanelThickness/2 - reinforcementDepth/2;

                      return (
                        <>
                          {/* 하부 섹션 하단 보강대 */}
                          <BoxWithEdges
                            key="lower-reinforcement-bottom"
                            args={[innerWidth, reinforcementHeight, reinforcementDepth]}
                            position={[0, lowerBackPanelY - lowerBackPanelHeight/2 + reinforcementHeight/2, lowerReinforcementZ]}
                            material={material}
                            renderMode={renderMode}
                            isDragging={isDragging}
                            isHighlighted={highlightedSection === `${placedFurnitureId}-0`}
                            panelName="(하)하단보강대"
                          />
                          {/* 하부 섹션 상단 보강대 */}
                          <BoxWithEdges
                            key="lower-reinforcement-top"
                            args={[innerWidth, reinforcementHeight, reinforcementDepth]}
                            position={[0, lowerBackPanelY + lowerBackPanelHeight/2 - reinforcementHeight/2, lowerReinforcementZ]}
                            material={material}
                            renderMode={renderMode}
                            isDragging={isDragging}
                            isHighlighted={highlightedSection === `${placedFurnitureId}-0`}
                            panelName="(하)상단보강대"
                          />
                          {/* 상부 섹션 하단 보강대 */}
                          <BoxWithEdges
                            key="upper-reinforcement-bottom"
                            args={[innerWidth, reinforcementHeight, reinforcementDepth]}
                            position={[0, upperBackPanelY - upperBackPanelHeight/2 + reinforcementHeight/2, upperReinforcementZ]}
                            material={material}
                            renderMode={renderMode}
                            isDragging={isDragging}
                            isHighlighted={highlightedSection === `${placedFurnitureId}-1`}
                            panelName="(상)하단보강대"
                          />
                          {/* 상부 섹션 상단 보강대 */}
                          <BoxWithEdges
                            key="upper-reinforcement-top"
                            args={[innerWidth, reinforcementHeight, reinforcementDepth]}
                            position={[0, upperBackPanelY + upperBackPanelHeight/2 - reinforcementHeight/2, upperReinforcementZ]}
                            material={material}
                            renderMode={renderMode}
                            isDragging={isDragging}
                            isHighlighted={highlightedSection === `${placedFurnitureId}-1`}
                            panelName="(상)상단보강대"
                          />
                        </>
                      );
                    })()}

                    {/* 환기캡 - 상부 백패널과 같은 Z 위치 */}
                    {!isDragging && (
                      <VentilationCap
                        position={[
                          innerWidth/2 - mmToThreeUnits(132),  // 우측 패널 안쪽으로 132mm
                          height/2 - basicThickness - mmToThreeUnits(115),  // 상단 패널 아래로 115mm
                          ventCapZ  // 백패널 앞쪽 표면에 붙음
                        ]}
                        diameter={98}
                        renderMode={renderMode}
                      />
                    )}
                  </>
                );
              })()}
            </>
          ) : (
            <>
              {/* 단일 섹션 백패널 - 위아래 각각 13mm씩 확장하여 측판과 동일 높이 */}
              {(() => {
                // 백패널 높이 확장값 (위아래 각각 13mm씩 = 총 26mm)
                const backPanelTopExtension = 13; // mm
                const backPanelBottomExtension = 13; // mm
                const totalHeightExtension = mmToThreeUnits(backPanelTopExtension + backPanelBottomExtension);

                // 원본 백패널 높이 + 26mm 확장 = 측판 높이와 동일
                const singleBackPanelHeight = innerHeight + mmToThreeUnits(backPanelConfig.heightExtension) + totalHeightExtension;

                console.log('🔍 단일 섹션 백패널 높이:', {
                  innerHeightMm: innerHeight / 0.01,
                  originalExtensionMm: backPanelConfig.heightExtension,
                  additionalExtensionMm: backPanelTopExtension + backPanelBottomExtension,
                  finalHeightMm: singleBackPanelHeight / 0.01,
                  sidePanel_heightMm: height / 0.01
                });

                return (
                  <>
                    <BoxWithEdges
                      key={`back-panel-${getPanelMaterial('백패널').uuid}`}
                      args={[innerWidth + mmToThreeUnits(backPanelConfig.widthExtension), singleBackPanelHeight, backPanelThickness]}
                      position={[0, 0, -depth/2 + backPanelThickness/2 + mmToThreeUnits(backPanelConfig.depthOffset)]}
                      material={getPanelMaterial('백패널')}
                      renderMode={renderMode}
                      isDragging={isDragging}
                      isBackPanel={true}
                      panelName="백패널"
                      panelGrainDirections={panelGrainDirections}
                      furnitureId={placedFurnitureId}
                      textureUrl={textureUrl}
                    />

                    {/* 보강대 (단일 섹션 백패널 상/하단) - 60mm 높이, 15.5mm 두께 - 2D 정면도에서는 숨김 */}
                    {!(viewMode === '2D' && view2DDirection === 'front') && (() => {
                      const reinforcementHeight = mmToThreeUnits(60);
                      const reinforcementDepth = mmToThreeUnits(15);
                      const backPanelZ = -depth/2 + backPanelThickness/2 + mmToThreeUnits(backPanelConfig.depthOffset);
                      const reinforcementZ = backPanelZ - backPanelThickness/2 - reinforcementDepth/2;

                      return (
                        <>
                          {/* 하단 보강대 */}
                          <BoxWithEdges
                            key="reinforcement-bottom"
                            args={[innerWidth, reinforcementHeight, reinforcementDepth]}
                            position={[0, -singleBackPanelHeight/2 + reinforcementHeight/2, reinforcementZ]}
                            material={material}
                            renderMode={renderMode}
                            isDragging={isDragging}
                            panelName="하단보강대"
                          />
                          {/* 상단 보강대 */}
                          <BoxWithEdges
                            key="reinforcement-top"
                            args={[innerWidth, reinforcementHeight, reinforcementDepth]}
                            position={[0, singleBackPanelHeight/2 - reinforcementHeight/2, reinforcementZ]}
                            material={material}
                            renderMode={renderMode}
                            isDragging={isDragging}
                            panelName="상단보강대"
                          />
                        </>
                      );
                    })()}

                    {/* 환기캡 - 백패널과 같은 Z 위치 */}
                    {!isDragging && (
                      <VentilationCap
                        position={[
                          innerWidth/2 - mmToThreeUnits(132),  // 우측 패널 안쪽으로 132mm
                          height/2 - basicThickness - mmToThreeUnits(115),  // 상단 패널 아래로 115mm
                          -depth/2 + backPanelThickness + mmToThreeUnits(backPanelConfig.depthOffset) + 0.01  // 백패널 앞쪽 표면에 붙음
                        ]}
                        diameter={98}
                        renderMode={renderMode}
                      />
                    )}
                  </>
                );
              })()}
            </>
          )}
        </>
        )}

        {/* 내부 구조 (타입별로 다른 내용) */}
        {showFurniture ? children : null}
      </>
      )}
    </group>
  );
};

// React.memo로 최적화: materialConfig 변경 시 불필요한 리렌더링 방지
export default React.memo(BaseFurnitureShell, (prevProps, nextProps) => {
  // spaceInfo의 materialConfig가 변경되어도 interiorColor/interiorTexture만 관련 있음
  const prevMaterialConfig = prevProps.spaceInfo?.materialConfig;
  const nextMaterialConfig = nextProps.spaceInfo?.materialConfig;

  // 가구 본체 관련 속성만 비교
  const materialPropsEqual =
    prevMaterialConfig?.interiorColor === nextMaterialConfig?.interiorColor &&
    prevMaterialConfig?.interiorTexture === nextMaterialConfig?.interiorTexture;

  // 기타 중요 props 비교 (textureUrl은 이미 interiorTexture로 비교했으므로 제외)
  const otherPropsEqual =
    prevProps.width === nextProps.width &&
    prevProps.height === nextProps.height &&
    prevProps.depth === nextProps.depth &&
    prevProps.innerWidth === nextProps.innerWidth &&
    prevProps.innerHeight === nextProps.innerHeight &&
    prevProps.basicThickness === nextProps.basicThickness &&
    prevProps.isDragging === nextProps.isDragging &&
    prevProps.isEditMode === nextProps.isEditMode &&
    prevProps.placedFurnitureId === nextProps.placedFurnitureId &&
    prevProps.lowerSectionTopOffsetMm === nextProps.lowerSectionTopOffsetMm &&
    prevProps.showFurniture === nextProps.showFurniture &&
    prevProps.lowerSectionDepthMm === nextProps.lowerSectionDepthMm &&
    prevProps.upperSectionDepthMm === nextProps.upperSectionDepthMm &&
    JSON.stringify(prevProps.panelGrainDirections) === JSON.stringify(nextProps.panelGrainDirections);

  console.log('🏠 BaseFurnitureShell React.memo 비교:', {
    materialPropsEqual,
    otherPropsEqual,
    prevInteriorTexture: prevMaterialConfig?.interiorTexture,
    nextInteriorTexture: nextMaterialConfig?.interiorTexture,
    prevDoorTexture: prevMaterialConfig?.doorTexture,
    nextDoorTexture: nextMaterialConfig?.doorTexture,
    willRerender: !(materialPropsEqual && otherPropsEqual)
  });

  // 모든 중요 props가 같으면 true 반환 (리렌더링 방지)
  return materialPropsEqual && otherPropsEqual;
}); 
