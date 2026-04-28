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

  // 인조대리석 상판 두께 (상판내림 측판 상단 깊이 조정용)
  stoneTopThickness?: number;

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
  lowerSectionDepthDirection?: 'front' | 'back';
  upperSectionDepthDirection?: 'front' | 'back';

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

  // 환기캡 숨김 (하부장용)
  hideVentilationCap?: boolean;

  // 상판 숨김 (하부장용)
  hideTopPanel?: boolean;

  // 상판 앞쪽 깊이 감소 (상판내림: 전대 뒤에 맞닿도록 40mm 줄임)
  topPanelFrontReduction?: number;

  // 상단 가로전대 (상판내림: 상판이 있으면서도 상단에 가로전대 필요, 측판 따내기 없음)
  topStretcher?: { heightMm: number; depthMm: number };

  // 측판 추가 노치 (하부장 2단용 — fromBottom: mm, y: mm, z: mm)
  sideNotches?: Array<{ y: number; z: number; fromBottom: number }>;

  // 상판 코너 따내기 (상부장용)
  topPanelNotchSize?: '680x140' | '340x140';
  topPanelNotchSide?: 'left' | 'right';

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
  stoneTopThickness = 0,
  isFloating = false, // 기본값은 false (바닥 배치)
  spaceInfo,
  showFurniture = true, // 기본값은 true (가구 본체 표시)
  backPanelConfig: backPanelConfigProp,
  lowerSectionDepthMm,
  upperSectionDepthMm,
  lowerSectionDepthDirection = 'front',
  upperSectionDepthDirection = 'front',
  lowerSectionTopOffsetMm,
  isLeftEndPanel = false,
  isRightEndPanel = false,
  textureUrl,
  panelGrainDirections,
  hideVentilationCap = true,
  hideTopPanel = false,
  topPanelFrontReduction = 0,
  topStretcher,
  sideNotches,
  topPanelNotchSize,
  topPanelNotchSide = 'right',
  renderMode: renderModeProp,
  children
}) => {
  // backPanelConfig 기본값: depthOffset과 lowerHeightBonus를 basicThickness 기반으로 동적 설정
  const basicThicknessMm = basicThickness / 0.01; // Three.js → mm 변환
  const backPanelConfig = {
    widthExtension: 10,
    heightExtension: 10,
    lowerHeightBonus: basicThicknessMm, // 가구재 두께 (18 또는 15)
    depthOffset: basicThicknessMm - 1, // 가구재 두께 - 1mm (17 또는 14)
    yOffsetFor4Drawer: 9,
    yOffsetFor2Drawer: 9,
    lowerYAdjustment: 0.05,
    ...backPanelConfigProp // 외부에서 전달된 값이 있으면 오버라이드
  };

  const { renderMode: contextRenderMode, viewMode } = useSpace3DView(); // context에서 renderMode와 viewMode 가져오기
  const renderMode = renderModeProp || contextRenderMode; // prop 우선, 없으면 context 사용
  const { gl } = useThree(); // Three.js renderer 가져오기
  const { theme } = useTheme(); // 테마 정보 가져오기
  const { view2DDirection, showDimensions, showDimensionsText } = useUIStore(); // UI 스토어에서 view2DDirection 가져오기
  const highlightedSection = useUIStore(state => state.highlightedSection);
  const highlightedPanel = useUIStore(state => state.highlightedPanel);
  const { dimensionColor, baseFontSize } = useDimensionColor();

  // 18.5/15.5mm는 양면 접합 두께이므로 좌우 이격 불필요 (0mm)
  // 18/15mm는 기존대로 좌우 0.5mm씩 총 1mm 이격
  const sidePanelGapMm = (basicThicknessMm === 18.5 || basicThicknessMm === 15.5) ? 0 : 1;
  const sidePanelGap = mmToThreeUnits(sidePanelGapMm);

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

  // 백패널 두께 기반 상/하판/선반 깊이 줄임량 (백패널 + (가구재두께 - 1mm) 오프셋)
  const backReductionForPanels = backPanelThickness + basicThickness - mmToThreeUnits(1);
  // 상/하판/칸막이 Z축 오프셋 (backReduction의 절반 = 앞쪽 고정, 뒤에서 줄임)
  const panelZOffset = backReductionForPanels / 2;

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
          {(moduleData?.id?.includes('4drawer-hanging') || moduleData?.id?.includes('2drawer-hanging') || moduleData?.id?.includes('2hanging') || moduleData?.id?.includes('entryway-h') || moduleData?.id?.includes('-shelf-') || moduleData?.id?.includes('-4drawer-shelf-') || moduleData?.id?.includes('-2drawer-shelf-') || moduleData?.id?.includes('built-in-fridge')) && isMultiSectionFurniture() && getSectionHeights().length === 2 ? (
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
              const lowerZOffset = lowerDepthDiff === 0 ? 0 : lowerSectionDepthDirection === 'back' ? lowerDepthDiff / 2 : -lowerDepthDiff / 2;
              const upperZOffset = upperDepthDiff === 0 ? 0 : upperSectionDepthDirection === 'back' ? upperDepthDiff / 2 : -upperDepthDiff / 2;

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
                    isEditMode={isEditMode}
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
                    isEditMode={isEditMode}
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
                    isEditMode={isEditMode}
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
                    isEditMode={isEditMode}
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
          // 기존: 통짜 측판 (하부장은 앞쪽 상단 노치 적용)
          <>
            {(hideTopPanel || sideNotches) ? (
              // 하부장: 측판 앞쪽 따내기 — L자형 단일 메시
              (() => {
                const notchYmm = 60;
                const notchZmm = 40;
                const notchY = mmToThreeUnits(notchYmm);
                const notchZ = mmToThreeUnits(notchZmm);

                // 상판내림: 상판 두께별 계단형 따내기 (측판 본체는 항상 600, 윗부분만 변함)
                // 10mm: 측판 본체 600, 윗부분(전대 55mm 구간)만 앞으로 +13mm 돌출 → 원장 613
                // 20mm: 측판 600, 따내기 없음
                // 30mm: 측판 본체 600, 윗부분 앞쪽 10mm 따내기 → 윗부분 590
                const isTopDownShell = !!topStretcher && (moduleData?.id?.includes('lower-top-down-') || moduleData?.id?.includes('dual-lower-top-down-'));
                let topDownTopExtensionMm = 0;
                let topDownTopRecessMm = 0;    // 상단 앞쪽 따내기 깊이 (10mm→8, 30mm→10)
                if (isTopDownShell) {
                  if (stoneTopThickness === 10) topDownTopRecessMm = 8;
                  else if (stoneTopThickness === 30) topDownTopRecessMm = 10;
                }
                // 측판 본체는 항상 원장 depth(600) 그대로, 평행이동 없음
                const sideDepth = depth;
                const sideZOffset = 0;
                // topStretcher Z 위치: 10mm→13 앞, 30mm→10 뒤
                const topStretcherZRecess = mmToThreeUnits(topDownTopRecessMm) - mmToThreeUnits(topDownTopExtensionMm);
                if (isTopDownShell) {
                  console.log('🔧 상판내림 측판 원장 깊이 계산:', {
                    moduleId: moduleData?.id,
                    stoneTopThickness,
                    topDownTopExtensionMm,
                    topDownTopRecessMm,
                    depth,
                    sideDepth,
                    sideZOffset
                  });
                }

                // 상판내림: 상단 전대 영역에 앞쪽 따내기 (10mm→8, 30mm→10)
                const topDownNotches: Array<{ y: number; z: number; fromBottom: number }> = [];
                if (isTopDownShell) {
                  const stretcherH = mmToThreeUnits(topStretcher!.heightMm); // 55mm
                  if (stoneTopThickness === 10) {
                    topDownNotches.push({ y: stretcherH, z: mmToThreeUnits(8), fromBottom: height - stretcherH });
                  } else if (stoneTopThickness === 30) {
                    topDownNotches.push({ y: stretcherH, z: mmToThreeUnits(10), fromBottom: height - stretcherH });
                  }
                }

                // 다중 노치 (sideNotches가 있으면 추가 노치 포함)
                const allNotches = (sideNotches || topDownNotches.length > 0) ? [
                  // 상단 노치: hideTopPanel일 때만 (도어올림은 상판이 있으므로 상단 따내기 없음)
                  ...(hideTopPanel ? [{ y: notchY, z: notchZ, fromBottom: height - notchY }] : []),
                  // 추가 노치들 (mm → Three.js 단위 변환)
                  ...(sideNotches || []).map(n => ({
                    y: mmToThreeUnits(n.y),
                    z: mmToThreeUnits(n.z),
                    fromBottom: mmToThreeUnits(n.fromBottom)
                  })),
                  // 상판내림 계단형 따내기 (앞으로 평행이동된 좌표계 기준 — notch는 패널 앞면 기준이므로 그대로)
                  ...topDownNotches
                ] : undefined;

                return (
                  <>
                    {/* 좌측판 - L자형 단일 메시 (따내기 포함) */}
                    <BoxWithEdges
                      key={`left-panel-notch-${getSidePanelMaterial('좌측판').uuid}`}
                      args={[basicThickness, height, sideDepth]}
                      position={[-innerWidth/2 - basicThickness/2, 0, sideZOffset]}
                      material={getSidePanelMaterial('좌측판')}
                      renderMode={renderMode}
                      isDragging={isDragging}
                      isEditMode={isEditMode}
                      isEndPanel={isLeftEndPanel}
                      panelName="좌측판"
                      panelGrainDirections={panelGrainDirections}
                      furnitureId={placedFurnitureId}
                      textureUrl={textureUrl}
                      {...(allNotches ? { notches: allNotches } : { notch: { y: notchY, z: notchZ } })}
                    />

                    {/* 우측판 - L자형 단일 메시 (따내기 포함) */}
                    <BoxWithEdges
                      key={`right-panel-notch-${getSidePanelMaterial('우측판').uuid}`}
                      args={[basicThickness, height, sideDepth]}
                      position={[innerWidth/2 + basicThickness/2, 0, sideZOffset]}
                      material={getSidePanelMaterial('우측판')}
                      renderMode={renderMode}
                      isDragging={isDragging}
                      isEditMode={isEditMode}
                      isEndPanel={isRightEndPanel}
                      panelName="우측판"
                      panelGrainDirections={panelGrainDirections}
                      furnitureId={placedFurnitureId}
                      textureUrl={textureUrl}
                      {...(allNotches ? { notches: allNotches } : { notch: { y: notchY, z: notchZ } })}
                    />

                    {/* 가로전대 (상단) - 상판이 없는 하부장만 (도어올림은 상판이 있으므로 제외) */}
                    {hideTopPanel && (
                      <BoxWithEdges
                        key={`front-stretcher-${material instanceof THREE.Material ? material.uuid : 'mat'}`}
                        args={[innerWidth, notchY, basicThickness]}
                        position={[0, height/2 - notchY/2, depth/2 - notchZ - basicThickness/2]}
                        material={material}
                        renderMode={renderMode}
                        isDragging={isDragging}
                        isEditMode={isEditMode}
                        panelName="가로전대"
                        panelGrainDirections={panelGrainDirections}
                        furnitureId={placedFurnitureId}
                        textureUrl={textureUrl}
                      />
                    )}

                    {/* 상단 가로전대 (상판내림: 캐비넷 앞면에 부착, 30mm 상판 시 7mm 뒤로 후퇴) — 10mm는 외경 전대로 대체 */}
                    {topStretcher && stoneTopThickness !== 10 && (
                      <BoxWithEdges
                        key={`front-stretcher-top-${material instanceof THREE.Material ? material.uuid : 'mat'}`}
                        args={[innerWidth, mmToThreeUnits(topStretcher.heightMm), basicThickness]}
                        position={[0, height/2 - mmToThreeUnits(topStretcher.heightMm)/2, depth/2 - basicThickness/2 - topStretcherZRecess]}
                        material={material}
                        renderMode={renderMode}
                        isDragging={isDragging}
                        isEditMode={isEditMode}
                        panelName="가로전대(상)"
                        panelGrainDirections={panelGrainDirections}
                        furnitureId={placedFurnitureId}
                        textureUrl={textureUrl}
                      />
                    )}

                    {/* 상판내림 10mm 전용: 외경 전대 (가구 전체 폭, 기존 전대 바로 앞면에 부착) */}
                    {isTopDownShell && stoneTopThickness === 10 && topStretcher && (
                      <BoxWithEdges
                        key={`front-stretcher-outer-${material instanceof THREE.Material ? material.uuid : 'mat'}`}
                        args={[innerWidth + basicThickness * 2, mmToThreeUnits(topStretcher.heightMm), basicThickness]}
                        position={[0, height/2 - mmToThreeUnits(topStretcher.heightMm)/2, depth/2 + basicThickness/2 - topStretcherZRecess]}
                        material={material}
                        renderMode={renderMode}
                        isDragging={isDragging}
                        isEditMode={isEditMode}
                        panelName="가로전대(외경)"
                        panelGrainDirections={panelGrainDirections}
                        furnitureId={placedFurnitureId}
                        textureUrl={textureUrl}
                      />
                    )}

                    {/* 하단 가로전대 (sideNotches가 있을 때) - 하단 노치 위치에 가로 부재 */}
                    {sideNotches && sideNotches.map((n, idx) => {
                      const lowerNotchY = mmToThreeUnits(n.y);
                      const lowerNotchZ = mmToThreeUnits(n.z);
                      const lowerFromBottom = mmToThreeUnits(n.fromBottom);
                      // Y 위치: 패널 중심 기준으로 계산 (바닥 = -height/2)
                      const stretcherCenterY = -height/2 + lowerFromBottom + lowerNotchY/2;
                      return (
                        <BoxWithEdges
                          key={`front-stretcher-lower-${idx}-${material instanceof THREE.Material ? material.uuid : 'mat'}`}
                          args={[innerWidth, lowerNotchY, basicThickness]}
                          position={[0, stretcherCenterY, depth/2 - lowerNotchZ - basicThickness/2]}
                          material={material}
                          renderMode={renderMode}
                          isDragging={isDragging}
                          isEditMode={isEditMode}
                          panelName={`가로전대(하${idx + 1})`}
                          panelGrainDirections={panelGrainDirections}
                          furnitureId={placedFurnitureId}
                          textureUrl={textureUrl}
                        />
                      );
                    })}
                  </>
                );
              })()
            ) : (moduleData?.id?.includes('pull-out-cabinet') || moduleData?.id?.includes('pantry-cabinet')) && isMultiSectionFurniture() && getSectionHeights().length >= 2 ? (
              // 인출장/팬트리장: N섹션 측판 분할 (각 섹션 외경 높이만큼, 각 섹션 깊이 적용)
              (() => {
                const sectionHeights = getSectionHeights();
                // placedModule.sectionDepths 가져오기
                const placedMod = placedFurnitureId
                  ? require('@/store/core/furnitureStore').useFurnitureStore.getState().placedModules.find((m: any) => m.id === placedFurnitureId)
                  : null;
                const sectionDepthsArr = placedMod?.sectionDepths as number[] | undefined;
                const sectionDirArr = placedMod?.sectionDepthDirections as ('front'|'back')[] | undefined;
                const moduleDepthMm = depth / mmToThreeUnits(1);
                let cursorY = -height / 2;
                return sectionHeights.map((sh: number, idx: number) => {
                  const panelY = cursorY + sh / 2;
                  cursorY += sh;
                  // 섹션별 깊이 (mm → Three.js 단위)
                  const secDepthMm = sectionDepthsArr?.[idx] ?? moduleDepthMm;
                  const secDepth = mmToThreeUnits(secDepthMm);
                  const dir = sectionDirArr?.[idx] ?? 'front';
                  // 깊이 차이에 따른 Z 오프셋 (front=뒤로 정렬, back=앞으로 정렬)
                  const depthDiff = depth - secDepth;
                  const sectionZOffset = depthDiff === 0 ? 0 : dir === 'back' ? depthDiff / 2 : -depthDiff / 2;
                  return (
                    <React.Fragment key={`side-panel-section-${idx}`}>
                      <BoxWithEdges
                        key={`left-panel-sec-${idx}-${getSidePanelMaterial('좌측판').uuid}`}
                        args={[basicThickness, sh, secDepth]}
                        position={[-innerWidth / 2 - basicThickness / 2, panelY, sectionZOffset]}
                        material={getSidePanelMaterial('좌측판')}
                        renderMode={renderMode}
                        isDragging={isDragging}
                        isEditMode={isEditMode}
                        isEndPanel={isLeftEndPanel}
                        panelName={`좌측판${idx + 1}`}
                        panelGrainDirections={panelGrainDirections}
                        furnitureId={placedFurnitureId}
                        textureUrl={textureUrl}
                      />
                      <BoxWithEdges
                        key={`right-panel-sec-${idx}-${getSidePanelMaterial('우측판').uuid}`}
                        args={[basicThickness, sh, secDepth]}
                        position={[innerWidth / 2 + basicThickness / 2, panelY, sectionZOffset]}
                        material={getSidePanelMaterial('우측판')}
                        renderMode={renderMode}
                        isDragging={isDragging}
                        isEditMode={isEditMode}
                        isEndPanel={isRightEndPanel}
                        panelName={`우측판${idx + 1}`}
                        panelGrainDirections={panelGrainDirections}
                        furnitureId={placedFurnitureId}
                        textureUrl={textureUrl}
                      />
                    </React.Fragment>
                  );
                });
              })()
            ) : (
              <>
                {/* 왼쪽 측면 판재 */}
                <BoxWithEdges
                  key={`left-panel-${getSidePanelMaterial('좌측판').uuid}`}
                  args={[basicThickness, height, depth]}
                  position={[-innerWidth/2 - basicThickness/2, 0, 0]}
                  material={getSidePanelMaterial('좌측판')}
                  renderMode={renderMode}
                  isDragging={isDragging}
                  isEditMode={isEditMode}
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
                  isEditMode={isEditMode}
                  isEndPanel={isRightEndPanel}
                  panelName="우측판"
                  panelGrainDirections={panelGrainDirections}
                  furnitureId={placedFurnitureId}
                  textureUrl={textureUrl}
                />
              </>
            )}
          </>
        )}

        {/* 다중 섹션 가구인 경우 중간 구분 패널 렌더링 */}
        {isMultiSectionFurniture() && getSectionHeights().length > 1 && (
          <>
            {(moduleData?.id?.includes('4drawer-hanging') || moduleData?.id?.includes('4drawer-shelf') || moduleData?.id?.includes('single-shelf-') || moduleData?.id?.includes('dual-shelf-') || moduleData?.id?.includes('built-in-fridge') || moduleData?.id?.includes('pull-out-cabinet') || moduleData?.id?.includes('pantry-cabinet')) ? (
              // 4drawer-hanging/4drawer-shelf: 상부 바닥판 18mm 위로, 하부 상판 18mm 위로
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

                  // 하부 섹션 깊이 차이 (방향에 따라 줄어듦)
                  const lowerDepthDiff = depth - lowerSectionDepth;
                  const lowerZOffset = lowerDepthDiff === 0 ? 0 : lowerSectionDepthDirection === 'back' ? lowerDepthDiff / 2 : -lowerDepthDiff / 2;

                  // 상부 섹션 깊이 차이
                  const upperDepthDiff = depth - upperSectionDepth;
                  const upperZOffset = upperDepthDiff === 0 ? 0 : upperSectionDepthDirection === 'back' ? upperDepthDiff / 2 : -upperDepthDiff / 2;

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
                        args={[innerWidth - sidePanelGap, basicThickness, upperSectionDepth - backReductionForPanels]}
                        position={[0, middlePanelY, upperZOffset + panelZOffset]}
                        material={getPanelMaterial('(상)바닥')}
                        renderMode={renderMode}
                        isDragging={isDragging}
                        isEditMode={isEditMode}
                        isHighlighted={isUpperHighlighted}
                        panelName="(상)바닥"
                        panelGrainDirections={panelGrainDirections}
                        furnitureId={placedFurnitureId}
                        textureUrl={textureUrl}
                      />

                      {/* 하부 섹션 상판 - 뒤에서 26mm 줄여서 백패널과 맞닿게 + 사용자 오프셋 적용 (앞에서 줄어듦), 좌우 각 0.5mm씩 줄임 */}
                      {/* 빌트인 냉장고장: 하부섹션 백패널 없음 → 상판은 측판과 동일한 풀 깊이 + 뒷면 가운데 따내기(31.5mm 띠, 40mm 깊이) */}
                      {(() => {
                        const isBuiltInFridge = !!moduleData?.id?.includes('built-in-fridge');
                        const lowerTopDepth = isBuiltInFridge
                          ? lowerSectionDepth - mmToThreeUnits(lowerSectionTopOffsetMm || 0)
                          : lowerSectionDepth - backReductionForPanels - mmToThreeUnits(lowerSectionTopOffsetMm || 0);
                        const lowerTopZ = isBuiltInFridge
                          ? lowerZOffset - mmToThreeUnits(lowerSectionTopOffsetMm || 0)/2
                          : lowerZOffset + panelZOffset - mmToThreeUnits(lowerSectionTopOffsetMm || 0)/2;
                        const panelW = innerWidth - sidePanelGap;
                        const panelH = basicThickness - mmToThreeUnits(0.1);
                        const panelY = lowerTopPanelY - mmToThreeUnits(0.05);
                        return (
                          <BoxWithEdges
                            key={`lower-top-${getPanelMaterial('(하)상판').uuid}`}
                            args={[panelW, panelH, lowerTopDepth]}
                            position={[0, panelY, lowerTopZ]}
                            material={getPanelMaterial('(하)상판')}
                            renderMode={renderMode}
                            isDragging={isDragging}
                            isEditMode={isEditMode}
                            isHighlighted={isLowerTopPanelHighlighted || isLowerSectionHighlighted}
                            panelName="(하)상판"
                            panelGrainDirections={panelGrainDirections}
                            furnitureId={placedFurnitureId}
                            textureUrl={textureUrl}
                            backCenterNotch={isBuiltInFridge ? {
                              sideStrip: mmToThreeUnits(31.5),
                              depth: mmToThreeUnits(40),
                            } : undefined}
                          />
                        );
                      })()}
                    </React.Fragment>
                  );
                });
              })()
            ) : (moduleData?.id?.includes('dual-2drawer-hanging') || moduleData?.id?.includes('dual-2drawer-shelf')) ? (
              // dual-2drawer-hanging/dual-2drawer-shelf: 듀얼장 전용 처리
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

                  // 깊이 차이 계산 (방향에 따라 줄어듦)
                  const lowerDepthDiff = depth - lowerSectionDepth;
                  const upperDepthDiff = depth - upperSectionDepth;
                  const lowerZOffset = lowerDepthDiff === 0 ? 0 : lowerSectionDepthDirection === 'back' ? lowerDepthDiff / 2 : -lowerDepthDiff / 2;
                  const upperZOffset = upperDepthDiff === 0 ? 0 : upperSectionDepthDirection === 'back' ? upperDepthDiff / 2 : -upperDepthDiff / 2;

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
                        args={[innerWidth - sidePanelGap, basicThickness - mmToThreeUnits(0.1), lowerSectionDepth - backReductionForPanels - mmToThreeUnits(lowerSectionTopOffsetMm || 0)]}
                        position={[0, lowerTopPanelY, lowerZOffset + panelZOffset - mmToThreeUnits(lowerSectionTopOffsetMm || 0)/2]}
                        material={getPanelMaterial('(하)상판')}
                        renderMode={renderMode}
                        isDragging={isDragging}
                        isEditMode={isEditMode}
                        isHighlighted={isLowerTopPanelHighlighted || isLowerSectionHighlighted}
                        panelName="(하)상판"
                        panelGrainDirections={panelGrainDirections}
                        furnitureId={placedFurnitureId}
                        textureUrl={textureUrl}
                      />

                      {/* 상부 섹션 바닥판 - 뒤에서 26mm 줄여서 백패널과 맞닿게, 좌우 각 0.5mm씩 줄임 */}
                      <BoxWithEdges
                        key={`upper-floor-dual-2drawer-${getPanelMaterial('(상)바닥').uuid}`}
                        args={[innerWidth - sidePanelGap, basicThickness, upperSectionDepth - backReductionForPanels]}
                        position={[0, upperFloorY, upperZOffset + panelZOffset]}
                        material={getPanelMaterial('(상)바닥')}
                        renderMode={renderMode}
                        isDragging={isDragging}
                        isEditMode={isEditMode}
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
            ) : (moduleData?.id?.includes('2drawer-hanging') || moduleData?.id?.includes('2drawer-shelf') || moduleData?.id?.includes('entryway-h')) ? (
              // 2drawer-hanging / 2drawer-shelf / entryway-h: 싱글장 처리
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

                  // 깊이 차이 계산 (방향에 따라 줄어듦)
                  const lowerDepthDiff = depth - lowerSectionDepth;
                  const upperDepthDiff = depth - upperSectionDepth;
                  const lowerZOffset = lowerDepthDiff === 0 ? 0 : lowerSectionDepthDirection === 'back' ? lowerDepthDiff / 2 : -lowerDepthDiff / 2;
                  const upperZOffset = upperDepthDiff === 0 ? 0 : upperSectionDepthDirection === 'back' ? upperDepthDiff / 2 : -upperDepthDiff / 2;

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
                        args={[innerWidth - sidePanelGap, basicThickness - mmToThreeUnits(0.1), lowerSectionDepth - backReductionForPanels - mmToThreeUnits(lowerSectionTopOffsetMm || 0)]}
                        position={[0, lowerTopPanelY, lowerZOffset + panelZOffset - mmToThreeUnits(lowerSectionTopOffsetMm || 0)/2]}
                        material={getPanelMaterial('(하)상판')}
                        renderMode={renderMode}
                        isDragging={isDragging}
                        isEditMode={isEditMode}
                        isHighlighted={isLowerTopPanelHighlighted || isLowerSectionHighlighted}
                        panelName="(하)상판"
                        panelGrainDirections={panelGrainDirections}
                        furnitureId={placedFurnitureId}
                        textureUrl={textureUrl}
                      />

                      {/* 현관장 H: 서랍 받침대 - 하부 상판 아래 188mm 간격, 동일 사이즈 */}
                      {moduleData?.id?.includes('entryway-h') && (
                        <BoxWithEdges
                          key={`drawer-support-${getPanelMaterial('(하)상판').uuid}`}
                          args={[innerWidth - sidePanelGap, basicThickness - mmToThreeUnits(0.1), lowerSectionDepth - backReductionForPanels - mmToThreeUnits(lowerSectionTopOffsetMm || 0)]}
                          position={[0, lowerTopPanelY - basicThickness/2 - mmToThreeUnits(188) - (basicThickness - mmToThreeUnits(0.1))/2, lowerZOffset + panelZOffset - mmToThreeUnits(lowerSectionTopOffsetMm || 0)/2]}
                          material={getPanelMaterial('(하)상판')}
                          renderMode={renderMode}
                          isDragging={isDragging}
                          isEditMode={isEditMode}
                          isHighlighted={isLowerTopPanelHighlighted || isLowerSectionHighlighted}
                          panelName="서랍받침대"
                          panelGrainDirections={panelGrainDirections}
                          furnitureId={placedFurnitureId}
                          textureUrl={textureUrl}
                        />
                      )}

                      {/* 현관장 H: 서랍속장 ㄷ자 프레임 - 하부 상판과 서랍 받침대 사이 */}
                      {moduleData?.id?.includes('entryway-h') && (() => {
                        const drawerFrameH = mmToThreeUnits(188); // 내경 188mm
                        const drawerFrameCenterY = lowerTopPanelY - basicThickness/2 - drawerFrameH/2;
                        const halfInnerW = (innerWidth - sidePanelGap) / 2;

                        // 수직 패널: 측판에서 27mm 안쪽, 레일 부착용
                        const vertXOffset = mmToThreeUnits(27);
                        // 전면 수평 패널: 앞에서 85mm 위치
                        const frontHorizZ = depth/2 - mmToThreeUnits(85) - basicThickness/2;
                        // 후면 수평 패널: 백패널 앞면에 맞닿음
                        // backPanelThickness는 line 727에서 8mm로 shadowing됨 → backReductionForPanels(26mm) 사용
                        const bpFrontFace = -depth/2 + backReductionForPanels;
                        const backHorizZ = bpFrontFace + basicThickness/2;
                        // 수직 패널 깊이: 전면~후면 수평 패널 사이
                        const vertFrontEdge = frontHorizZ - basicThickness/2;
                        const vertBackEdge = backHorizZ + basicThickness/2;
                        const vertDepth = vertFrontEdge - vertBackEdge;
                        const vertZ = (vertFrontEdge + vertBackEdge) / 2;
                        // 수평 패널 폭: 27mm + basicThickness
                        const horizWidth = vertXOffset + basicThickness;

                        return (
                          <>
                            {/* 좌측 수직 패널 (레일 부착) */}
                            <BoxWithEdges
                              key={`drawer-frame-left-vert-${getPanelMaterial('서랍속장(좌)').uuid}`}
                              args={[basicThickness, drawerFrameH, vertDepth]}
                              position={[-halfInnerW + vertXOffset + basicThickness/2 + mmToThreeUnits(0.5), drawerFrameCenterY, vertZ]}
                              material={getPanelMaterial('서랍속장(좌)')}
                              renderMode={renderMode}
                              isDragging={isDragging}
                              isEditMode={isEditMode}
                              isHighlighted={isLowerSectionHighlighted}
                              panelName="서랍속장(좌)"
                              panelGrainDirections={panelGrainDirections}
                              furnitureId={placedFurnitureId}
                              textureUrl={textureUrl}
                            />
                            {/* 우측 수직 패널 (레일 부착) */}
                            <BoxWithEdges
                              key={`drawer-frame-right-vert-${getPanelMaterial('서랍속장(우)').uuid}`}
                              args={[basicThickness, drawerFrameH, vertDepth]}
                              position={[halfInnerW - vertXOffset - basicThickness/2 - mmToThreeUnits(0.5), drawerFrameCenterY, vertZ]}
                              material={getPanelMaterial('서랍속장(우)')}
                              renderMode={renderMode}
                              isDragging={isDragging}
                              isEditMode={isEditMode}
                              isHighlighted={isLowerSectionHighlighted}
                              panelName="서랍속장(우)"
                              panelGrainDirections={panelGrainDirections}
                              furnitureId={placedFurnitureId}
                              textureUrl={textureUrl}
                            />
                            {/* 좌측 전면 수평 패널 */}
                            <BoxWithEdges
                              key={`drawer-frame-left-front-${getPanelMaterial('서랍속장(좌) 전면').uuid}`}
                              args={[horizWidth, drawerFrameH, basicThickness]}
                              position={[-halfInnerW + horizWidth/2 + mmToThreeUnits(0.5), drawerFrameCenterY, frontHorizZ]}
                              material={getPanelMaterial('서랍속장(좌) 전면')}
                              renderMode={renderMode}
                              isDragging={isDragging}
                              isEditMode={isEditMode}
                              isHighlighted={isLowerSectionHighlighted}
                              panelName="서랍속장(좌) 전면"
                              panelGrainDirections={panelGrainDirections}
                              furnitureId={placedFurnitureId}
                              textureUrl={textureUrl}
                            />
                            {/* 우측 전면 수평 패널 */}
                            <BoxWithEdges
                              key={`drawer-frame-right-front-${getPanelMaterial('서랍속장(우) 전면').uuid}`}
                              args={[horizWidth, drawerFrameH, basicThickness]}
                              position={[halfInnerW - horizWidth/2 - mmToThreeUnits(0.5), drawerFrameCenterY, frontHorizZ]}
                              material={getPanelMaterial('서랍속장(우) 전면')}
                              renderMode={renderMode}
                              isDragging={isDragging}
                              isEditMode={isEditMode}
                              isHighlighted={isLowerSectionHighlighted}
                              panelName="서랍속장(우) 전면"
                              panelGrainDirections={panelGrainDirections}
                              furnitureId={placedFurnitureId}
                              textureUrl={textureUrl}
                            />
                            {/* 좌측 후면 수평 패널 */}
                            <BoxWithEdges
                              key={`drawer-frame-left-back-${getPanelMaterial('서랍속장(좌) 후면').uuid}`}
                              args={[horizWidth, drawerFrameH, basicThickness]}
                              position={[-halfInnerW + horizWidth/2 + mmToThreeUnits(0.5), drawerFrameCenterY, backHorizZ]}
                              material={getPanelMaterial('서랍속장(좌) 후면')}
                              renderMode={renderMode}
                              isDragging={isDragging}
                              isEditMode={isEditMode}
                              isHighlighted={isLowerSectionHighlighted}
                              panelName="서랍속장(좌) 후면"
                              panelGrainDirections={panelGrainDirections}
                              furnitureId={placedFurnitureId}
                              textureUrl={textureUrl}
                            />
                            {/* 우측 후면 수평 패널 */}
                            <BoxWithEdges
                              key={`drawer-frame-right-back-${getPanelMaterial('서랍속장(우) 후면').uuid}`}
                              args={[horizWidth, drawerFrameH, basicThickness]}
                              position={[halfInnerW - horizWidth/2 - mmToThreeUnits(0.5), drawerFrameCenterY, backHorizZ]}
                              material={getPanelMaterial('서랍속장(우) 후면')}
                              renderMode={renderMode}
                              isDragging={isDragging}
                              isEditMode={isEditMode}
                              isHighlighted={isLowerSectionHighlighted}
                              panelName="서랍속장(우) 후면"
                              panelGrainDirections={panelGrainDirections}
                              furnitureId={placedFurnitureId}
                              textureUrl={textureUrl}
                            />
                          </>
                        );
                      })()}

                      {/* 현관장 H: 속서랍 - 서랍받침대 위 12mm 간격 */}
                      {moduleData?.id?.includes('entryway-h') && (() => {
                        // 서랍 받침대 상단 Y
                        const supportTopY = lowerTopPanelY - basicThickness/2 - mmToThreeUnits(188);
                        // 서랍 drawerHeight = 155mm (측판 기준 높이)
                        const drawerH = mmToThreeUnits(155);
                        // 측판 하단 = 받침대 상단 + 12mm (측판 155mm 전체 높이, 유격 없음)
                        const drawerRegionBottom = supportTopY + mmToThreeUnits(12);
                        // 서랍 중심 Y (DrawerRenderer 동일: centerY 기준으로 모든 부품 배치)
                        const drawerCenterY = drawerRegionBottom + drawerH / 2;
                        // DrawerRenderer 호환 alias
                        const drawerSideH = drawerH;

                        // 서랍 패널 두께
                        const basicThicknessMm = basicThickness / 0.01;
                        const drawerPanelThicknessMm = (basicThicknessMm === 18.5 || basicThicknessMm === 15.5) ? 15.5 : 15;
                        const drawerSideT = mmToThreeUnits(drawerPanelThicknessMm);
                        const maidaT = mmToThreeUnits(drawerPanelThicknessMm);
                        const bottomT = mmToThreeUnits(9); // 바닥판 두께 = 백패널 두께 (9mm 고정)

                        // 서랍 영역: 날개벽 수직패널 안쪽면 사이에서 좌우 5mm 갭
                        const vertXOff = mmToThreeUnits(27);
                        const frameT = basicThickness;
                        const wingInnerWidth = innerWidth - sidePanelGap - (vertXOff + frameT) * 2;
                        const drawerAreaWidth = wingInnerWidth - mmToThreeUnits(5) * 2;

                        // 날개벽 수직패널 앞쪽 끝 = 전면 수평패널 안쪽면
                        // 날개벽 전면 앞면 Z (마이다/앞판 기준)
                        const wingFrontFaceZ = depth/2 - mmToThreeUnits(85);
                        // 서랍 뒷판 뒷면 Z: 백패널 앞면 + 12mm
                        const drawerBackZ = -depth/2 + backReductionForPanels + mmToThreeUnits(12);
                        // 측판 깊이 = 앞판 앞면 ~ 뒷판 뒷면 (측판이 가장 길고 앞판/뒷판이 측판 안에 끼임)
                        const drawerSideDepth = wingFrontFaceZ - drawerBackZ;
                        const drawerSideCenterZ = (wingFrontFaceZ + drawerBackZ) / 2;

                        return (
                          <>
                            {/* 서랍 좌측판 */}
                            {(() => {
                              const pn = '서랍1 좌측판';
                              const mat = getPanelMaterial(pn);
                              return (
                                <BoxWithEdges
                                  key={`entryway-drawer-left-${mat.uuid}`}
                                  args={[drawerSideT, drawerSideH, drawerSideDepth]}
                                  position={[-drawerAreaWidth/2 + drawerSideT/2, drawerCenterY, drawerSideCenterZ]}
                                  material={mat}
                                  renderMode={renderMode}
                                  isDragging={isDragging}
                                  isEditMode={isEditMode}
                                  isHighlighted={isLowerSectionHighlighted}
                                  panelName={pn}
                                  panelGrainDirections={panelGrainDirections}
                                  furnitureId={placedFurnitureId}
                                  textureUrl={textureUrl}
                                />
                              );
                            })()}
                            {/* 서랍 우측판 */}
                            {(() => {
                              const pn = '서랍1 우측판';
                              const mat = getPanelMaterial(pn);
                              return (
                                <BoxWithEdges
                                  key={`entryway-drawer-right-${mat.uuid}`}
                                  args={[drawerSideT, drawerSideH, drawerSideDepth]}
                                  position={[drawerAreaWidth/2 - drawerSideT/2, drawerCenterY, drawerSideCenterZ]}
                                  material={mat}
                                  renderMode={renderMode}
                                  isDragging={isDragging}
                                  isEditMode={isEditMode}
                                  isHighlighted={isLowerSectionHighlighted}
                                  panelName={pn}
                                  panelGrainDirections={panelGrainDirections}
                                  furnitureId={placedFurnitureId}
                                  textureUrl={textureUrl}
                                />
                              );
                            })()}
                            {/* 서랍 앞판 */}
                            {(() => {
                              const pn = '서랍1 앞판';
                              const mat = getPanelMaterial(pn);
                              return (
                                <BoxWithEdges
                                  key={`entryway-drawer-front-${mat.uuid}`}
                                  args={[drawerAreaWidth - drawerSideT * 2, drawerSideH, drawerSideT]}
                                  position={[0, drawerCenterY, wingFrontFaceZ - drawerSideT/2]}
                                  material={mat}
                                  renderMode={renderMode}
                                  isDragging={isDragging}
                                  isEditMode={isEditMode}
                                  isHighlighted={isLowerSectionHighlighted}
                                  panelName={pn}
                                  panelGrainDirections={panelGrainDirections}
                                  furnitureId={placedFurnitureId}
                                  textureUrl={textureUrl}
                                />
                              );
                            })()}
                            {/* 서랍 뒷판 */}
                            {(() => {
                              const pn = '서랍1 뒷판';
                              const mat = getPanelMaterial(pn);
                              // 뒷판 하단 = 바닥판 윗면
                              const sidePanelBottom2 = drawerCenterY - drawerSideH / 2;
                              const bottomTopY2 = sidePanelBottom2 + mmToThreeUnits(18) + bottomT;
                              const origBackTop = drawerCenterY + drawerSideH / 2;
                              const backH = origBackTop - bottomTopY2;
                              const backCY = (origBackTop + bottomTopY2) / 2;
                              return (
                                <BoxWithEdges
                                  key={`entryway-drawer-back-${mat.uuid}`}
                                  args={[drawerAreaWidth - drawerSideT * 2, backH, drawerSideT]}
                                  position={[0, backCY, drawerBackZ + drawerSideT/2]}
                                  material={mat}
                                  renderMode={renderMode}
                                  isDragging={isDragging}
                                  isEditMode={isEditMode}
                                  isHighlighted={isLowerSectionHighlighted}
                                  panelName={pn}
                                  panelGrainDirections={panelGrainDirections}
                                  furnitureId={placedFurnitureId}
                                  textureUrl={textureUrl}
                                />
                              );
                            })()}
                            {/* 서랍 바닥판 */}
                            {(() => {
                              const pn = '서랍1 바닥';
                              const mat = getPanelMaterial(pn);
                              // 바닥판 깊이: 측판 깊이 - 앞쪽 10mm 홈 여유
                              const bottomDepth2 = drawerSideDepth - mmToThreeUnits(10);
                              const bottomZ2 = drawerSideCenterZ - mmToThreeUnits(5);
                              // 바닥판 폭: 서랍 좌우측판 안쪽 간격
                              const bottomWidth = drawerAreaWidth - drawerSideT * 2;
                              // 바닥판 Y: 측판 하단에서 18mm 위
                              const sidePanelBottom = drawerCenterY - drawerSideH / 2;
                              const bottomY = sidePanelBottom + mmToThreeUnits(18) + bottomT / 2;
                              return (
                                <BoxWithEdges
                                  key={`entryway-drawer-bottom-${mat.uuid}`}
                                  args={[bottomWidth, bottomT, bottomDepth2]}
                                  position={[0, bottomY, bottomZ2]}
                                  material={mat}
                                  renderMode={renderMode}
                                  isDragging={isDragging}
                                  isEditMode={isEditMode}
                                  isHighlighted={isLowerSectionHighlighted}
                                  panelName={pn}
                                  panelGrainDirections={panelGrainDirections}
                                  furnitureId={placedFurnitureId}
                                  textureUrl={textureUrl}
                                />
                              );
                            })()}
                            {/* 서랍 마이다: 상단=하부상판 윗면-12mm, 하단=받침대 하단, 높이=212mm */}
                            {(() => {
                              const pn = '서랍1(마이다)';
                              const mat = getPanelMaterial(pn);
                              const maidaH = mmToThreeUnits(212);
                              const maidaTopY = lowerTopPanelY + basicThickness / 2 - mmToThreeUnits(12);
                              const maidaCenterY = maidaTopY - maidaH / 2;
                              return (
                                <BoxWithEdges
                                  key={`entryway-drawer-maida-${mat.uuid}`}
                                  args={[innerWidth - sidePanelGap - mmToThreeUnits(12) * 2, maidaH, maidaT]}
                                  position={[0, maidaCenterY, wingFrontFaceZ + maidaT/2]}
                                  material={mat}
                                  renderMode={renderMode}
                                  isDragging={isDragging}
                                  isEditMode={isEditMode}
                                  isHighlighted={isLowerSectionHighlighted}
                                  panelName={pn}
                                  panelGrainDirections={panelGrainDirections}
                                  furnitureId={placedFurnitureId}
                                  textureUrl={textureUrl}
                                />
                              );
                            })()}
                          </>
                        );
                      })()}

                      {/* 상부 섹션 바닥판 - 뒤에서 26mm 줄여서 백패널과 맞닿게, 좌우 각 0.5mm씩 줄임 */}
                      <BoxWithEdges
                        key={`upper-floor-2drawer-${getPanelMaterial('(상)바닥').uuid}`}
                        args={[innerWidth - sidePanelGap, basicThickness, upperSectionDepth - backReductionForPanels]}
                        position={[0, upperFloorY, upperZOffset + panelZOffset]}
                        material={getPanelMaterial('(상)바닥')}
                        renderMode={renderMode}
                        isDragging={isDragging}
                        isEditMode={isEditMode}
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
                    args={[innerWidth - sidePanelGap, basicThickness, depth - backReductionForPanels]}
                    position={[0, dividerY, panelZOffset]}
                    material={panelMat}
                    renderMode={renderMode}
                    isDragging={isDragging}
                    isEditMode={isEditMode}
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
        {!hideTopPanel && (() => {
          const panelName = isMultiSectionFurniture() ? '(상)상판' : '상판';
          const topPanelMat = getPanelMaterial(panelName);
          const backReduction = backReductionForPanels; // 뒤에서 26mm 줄임
          const frontReduction = topPanelFrontReduction ? mmToThreeUnits(topPanelFrontReduction) : 0; // 앞쪽 감소 (상판내림: 전대 뒤로)
          const widthReduction = sidePanelGap; // 좌우 각 0.5mm씩 총 1mm 줄임 (18.5/15.5mm는 0)
          return (
            <BoxWithEdges
              key={`top-panel-${topPanelMat.uuid}`}
              args={[innerWidth - widthReduction, basicThickness, (() => {
                // 다중 섹션이고 상부 깊이가 있으면 상부 섹션 깊이 사용
                if (isMultiSectionFurniture() && upperSectionDepthMm !== undefined) {
                  return mmToThreeUnits(upperSectionDepthMm) - backReduction - frontReduction;
                }
                return depth - backReduction - frontReduction;
              })()]}
              position={[0, height/2 - basicThickness/2, (() => {
                // 다중 섹션이고 상부 깊이가 있으면 Z 오프셋 적용
                if (isMultiSectionFurniture() && upperSectionDepthMm !== undefined) {
                  const upperDepth = mmToThreeUnits(upperSectionDepthMm);
                  const depthDiff = depth - upperDepth;
                  const dirOffset = upperSectionDepthDirection === 'back' ? depthDiff / 2 : -depthDiff / 2;
                  return dirOffset + (backReduction - frontReduction) / 2; // 방향에 따른 오프셋 + 백패널/전대 맞춤
                }
                return (backReduction - frontReduction) / 2; // 뒤에서 26mm 줄임 + 앞에서 전대만큼 줄임
              })()]}
              material={topPanelMat}
              renderMode={renderMode}
              isDragging={isDragging}
              isEditMode={isEditMode}
              isHighlighted={isMultiSectionFurniture() ? highlightedSection === `${placedFurnitureId}-1` : false}
              panelName={panelName}
              panelGrainDirections={panelGrainDirections}
              furnitureId={placedFurnitureId}
              textureUrl={textureUrl}
              cornerNotch={topPanelNotchSize ? (() => {
                const [wStr, dStr] = topPanelNotchSize.split('x');
                return {
                  width: mmToThreeUnits(Number(wStr)),
                  depth: mmToThreeUnits(Number(dStr)),
                  side: topPanelNotchSide || 'right'
                };
              })() : undefined}
            />
          );
        })()}

        {/* Type4 상단 상판 두께 치수 표시 - 제거됨 (2D에서 18mm 두께 표시 불필요) */}

        {/* 하단 판재 - 뒤에서 26mm 줄여서 백패널과 맞닿게, 좌우 각 0.5mm씩 줄임 */}
        {/* 빌트인 냉장고장: 하부섹션 백패널 없음 → 풀깊이 (측판과 동일) */}
        {(() => {
          const panelName = isMultiSectionFurniture() ? '(하)바닥' : '바닥판';
          const bottomPanelMat = getPanelMaterial(panelName);
          const isBuiltInFridge = !!moduleData?.id?.includes('built-in-fridge');
          const backReduction = isBuiltInFridge ? 0 : backReductionForPanels;
          const widthReduction = sidePanelGap;
          const panelW = innerWidth - widthReduction;
          const panelH = basicThickness;
          const panelD = (isMultiSectionFurniture() && lowerSectionDepthMm !== undefined)
            ? mmToThreeUnits(lowerSectionDepthMm) - backReduction
            : depth - backReduction;
          const panelY = -height/2 + basicThickness/2;
          const panelZ = (() => {
            if (isMultiSectionFurniture() && lowerSectionDepthMm !== undefined) {
              const lowerDepth = mmToThreeUnits(lowerSectionDepthMm);
              const depthDiff = depth - lowerDepth;
              const dirOffset = lowerSectionDepthDirection === 'back' ? depthDiff / 2 : -depthDiff / 2;
              return dirOffset + backReduction / 2;
            }
            return backReduction / 2;
          })();
          const isHighlightedBottom = isMultiSectionFurniture() ? highlightedSection === `${placedFurnitureId}-0` : false;

          return (
            <BoxWithEdges
              key={`bottom-panel-${bottomPanelMat.uuid}`}
              args={[panelW, panelH, panelD]}
              position={[0, panelY, panelZ]}
              material={bottomPanelMat}
              renderMode={renderMode}
              isDragging={isDragging}
              isEditMode={isEditMode}
              isHighlighted={isHighlightedBottom}
              panelName={panelName}
              panelGrainDirections={panelGrainDirections}
              furnitureId={placedFurnitureId}
              textureUrl={textureUrl}
              backCenterNotch={isBuiltInFridge ? {
                sideStrip: mmToThreeUnits(31.5),
                depth: mmToThreeUnits(40),
              } : undefined}
            />
          );
        })()}

        {/* Type4 하부섹션 바닥판 두께 치수 표시 - 제거됨 (2D에서 18mm 두께 표시 불필요) */}

        {/* 뒷면 판재 (9mm 백패널) - hasBackPanel이 true일 때만 렌더링 */}
        {hasBackPanel && (
        <>
          {(moduleData?.id?.includes('pull-out-cabinet') || moduleData?.id?.includes('pantry-cabinet')) && isMultiSectionFurniture() && getSectionHeights().length >= 2 ? (
            // 인출장/팬트리장: N섹션 백패널 분할 + 후면 보강대 (각 섹션 위/아래)
            (() => {
              const sectionHeights = getSectionHeights();
              const reinforcementHeight = mmToThreeUnits(60);
              const reinforcementDepth = mmToThreeUnits((basicThicknessMm === 18.5 || basicThicknessMm === 15.5) ? 15.5 : 15);
              const reinforcementWidth = innerWidth - sidePanelGap;
              const elements: React.ReactNode[] = [];
              let cursorY = -height / 2;
              sectionHeights.forEach((sh: number, idx: number) => {
                // 백패널 높이 = 섹션 외경 높이 그대로 (측판과 동일)
                const backPanelHeight = sh;
                const backPanelY = cursorY + sh / 2;
                const backPanelZ = -depth / 2 + backPanelThickness / 2 + mmToThreeUnits(backPanelConfig.depthOffset);
                const reinforcementZ = backPanelZ - backPanelThickness / 2 - reinforcementDepth / 2;
                // 백패널 상/하단에 정렬 (다른 가구와 동일 패턴)
                const lowerReinforcementY = backPanelY - backPanelHeight / 2 + reinforcementHeight / 2;
                const upperReinforcementY = backPanelY + backPanelHeight / 2 - reinforcementHeight / 2;

                elements.push(
                  <BoxWithEdges
                    key={`back-panel-sec-${idx}-${getPanelMaterial(`(${idx + 1}단)백패널`).uuid}`}
                    args={[innerWidth + mmToThreeUnits(backPanelConfig.widthExtension), backPanelHeight, backPanelThickness]}
                    position={[0, backPanelY, backPanelZ]}
                    material={getPanelMaterial(`(${idx + 1}단)백패널`)}
                    renderMode={renderMode}
                    isDragging={isDragging}
                    isEditMode={isEditMode}
                    isBackPanel={true}
                    isHighlighted={highlightedSection === `${placedFurnitureId}-${idx}`}
                    panelName={`(${idx + 1}단)백패널`}
                    panelGrainDirections={panelGrainDirections}
                    furnitureId={placedFurnitureId}
                    textureUrl={textureUrl}
                  />
                );
                // 후면 보강대 (하단 + 상단)
                if (!(viewMode === '2D' && view2DDirection === 'front')) {
                  elements.push(
                    <BoxWithEdges
                      key={`reinforcement-bottom-sec-${idx}`}
                      args={[reinforcementWidth, reinforcementHeight, reinforcementDepth]}
                      position={[0, lowerReinforcementY, reinforcementZ]}
                      material={material}
                      renderMode={renderMode}
                      isDragging={isDragging}
                      isEditMode={isEditMode}
                      isHighlighted={highlightedSection === `${placedFurnitureId}-${idx}`}
                      panelName={`(${idx + 1}단)보강대 1`}
                      furnitureId={placedFurnitureId}
                    />
                  );
                  elements.push(
                    <BoxWithEdges
                      key={`reinforcement-top-sec-${idx}`}
                      args={[reinforcementWidth, reinforcementHeight, reinforcementDepth]}
                      position={[0, upperReinforcementY, reinforcementZ]}
                      material={material}
                      renderMode={renderMode}
                      isDragging={isDragging}
                      isEditMode={isEditMode}
                      isHighlighted={highlightedSection === `${placedFurnitureId}-${idx}`}
                      panelName={`(${idx + 1}단)보강대 2`}
                      furnitureId={placedFurnitureId}
                    />
                  );
                }
                cursorY += sh;
              });
              return <>{elements}</>;
            })()
          ) : isMultiSectionFurniture() && getSectionHeights().length === 2 ? (
            // 다중 섹션: 하부/상부 백패널 분리
            <>
              {(() => {
                const sectionHeights = getSectionHeights();
                const lowerSectionHeight = sectionHeights[0];
                const upperSectionHeight = sectionHeights[1];

                // 가구 타입 확인
                const is4Drawer = moduleData?.id?.includes('4drawer-hanging');
                const isTwoDrawer = moduleData?.id?.includes('2drawer-hanging');
                const isTwoHanging = moduleData?.id?.includes('2hanging');

                // 백패널 높이 확장값: basicThickness에 따라 동적 계산
                // 각 측 확장 = basicThickness - 5mm, 총 확장 = 2*basicThickness - 10mm
                const totalHeightExtension = basicThickness * 2 - mmToThreeUnits(10);

                // 측판과 동일한 높이 계산 로직 사용 (2단 행잉만 오프셋 적용)
                const applyOffset = isTwoHanging && !isTwoDrawer;

                // 원본 백패널 높이 (섹션 높이 - 상하판 두께×2 + 기본 확장값 10mm)
                const originalLowerBackPanelHeight = lowerSectionHeight - basicThickness * 2 + mmToThreeUnits(backPanelConfig.heightExtension);
                const originalUpperBackPanelHeight = upperSectionHeight - basicThickness * 2 + mmToThreeUnits(backPanelConfig.heightExtension);

                // 백패널 높이 = 원본 + 확장 (측판과 동일하게)
                const lowerBackPanelHeight = applyOffset
                  ? originalLowerBackPanelHeight + totalHeightExtension + basicThickness
                  : originalLowerBackPanelHeight + totalHeightExtension;

                const upperBackPanelHeight = applyOffset
                  ? originalUpperBackPanelHeight + totalHeightExtension - basicThickness
                  : originalUpperBackPanelHeight + totalHeightExtension;

                // 백패널 Y 위치 조정 (상하 확장 동일하므로 오프셋 없음)
                const lowerBackPanelY = -height/2 + lowerSectionHeight/2;
                const upperOffset = applyOffset ? basicThickness : 0;
                const upperBackPanelY = -height/2 + lowerSectionHeight + upperOffset + upperSectionHeight/2;

                // 섹션별 백패널 Z 위치 계산
                const lowerSectionDepth = lowerSectionDepthMm !== undefined ? mmToThreeUnits(lowerSectionDepthMm) : depth;
                const upperSectionDepth = upperSectionDepthMm !== undefined ? mmToThreeUnits(upperSectionDepthMm) : depth;

                // 깊이 차이에 따른 Z 오프셋 (방향에 따라 앞/뒤에서 줄어듦)
                const lowerDepthDiff = depth - lowerSectionDepth;
                const upperDepthDiff = depth - upperSectionDepth;
                const lowerZOffset = lowerDepthDiff === 0 ? 0 : lowerSectionDepthDirection === 'back' ? lowerDepthDiff / 2 : -lowerDepthDiff / 2;
                const upperZOffset = upperDepthDiff === 0 ? 0 : upperSectionDepthDirection === 'back' ? upperDepthDiff / 2 : -upperDepthDiff / 2;

                const lowerBackPanelZ = -lowerSectionDepth/2 + backPanelThickness/2 + mmToThreeUnits(backPanelConfig.depthOffset) + lowerZOffset;
                const upperBackPanelZ = -upperSectionDepth/2 + backPanelThickness/2 + mmToThreeUnits(backPanelConfig.depthOffset) + upperZOffset;

                // 환기캡 Z 위치 계산 (상부 백패널 앞쪽 표면에 붙음)
                const ventCapZ = upperBackPanelZ + backPanelThickness/2 + 0.01;

                // 섹션별 백패널 유무 (sections[0]=하부, sections[1]=상부)
                // hasBackPanel이 명시적으로 false인 섹션만 백패널을 안 그림 (기본값은 true 유지)
                // moduleData 타입이 { id: string }로 좁아 modelConfig 직접 접근 불가 → 모듈 ID 패턴으로 분기
                const isBuiltInFridge = moduleData?.id?.includes('built-in-fridge');
                // 빌트인 냉장고장: 하부섹션(인덱스 0) = 백패널 없음, 상부섹션(인덱스 1) = 백패널 있음
                const lowerHasBackPanel = !isBuiltInFridge;
                const upperHasBackPanel = true;

                return (
                  <>
                    {/* 하부 섹션 백패널 */}
                    {lowerHasBackPanel && (
                    <BoxWithEdges
                      key={`lower-back-${getPanelMaterial('(하)백패널').uuid}`}
                      args={[innerWidth + mmToThreeUnits(backPanelConfig.widthExtension), lowerBackPanelHeight, backPanelThickness]}
                      position={[0, lowerBackPanelY, lowerBackPanelZ]}
                      material={getPanelMaterial('(하)백패널')}
                      renderMode={renderMode}
                      isDragging={isDragging}
                      isEditMode={isEditMode}
                      isBackPanel={true}
                      isHighlighted={highlightedSection === `${placedFurnitureId}-0`}
                      panelName="(하)백패널"
                      panelGrainDirections={panelGrainDirections}
                      furnitureId={placedFurnitureId}
                      textureUrl={textureUrl}
                    />
                    )}

                    {/* 상부 섹션 백패널 */}
                    {upperHasBackPanel && (
                    <BoxWithEdges
                      key={`upper-back-${getPanelMaterial('(상)백패널').uuid}`}
                      args={[innerWidth + mmToThreeUnits(backPanelConfig.widthExtension), upperBackPanelHeight, backPanelThickness]}
                      position={[0, upperBackPanelY, upperBackPanelZ]}
                      material={getPanelMaterial('(상)백패널')}
                      renderMode={renderMode}
                      isDragging={isDragging}
                      isEditMode={isEditMode}
                      isBackPanel={true}
                      isHighlighted={highlightedSection === `${placedFurnitureId}-1`}
                      panelName="(상)백패널"
                      panelGrainDirections={panelGrainDirections}
                      furnitureId={placedFurnitureId}
                      textureUrl={textureUrl}
                    />
                    )}

                    {/* 보강대 (각 섹션 백패널 상/하단) - 60mm 높이, 15.5mm 두께
                        2D 정면도에서는 숨김 (백패널 뒤에 위치하지만 선 렌더링으로 보임)
                        상부/측면 뷰에서만 표시됨 */}
                    {!(viewMode === '2D' && view2DDirection === 'front') && (() => {
                      const reinforcementHeight = mmToThreeUnits(60);
                      const reinforcementDepth = mmToThreeUnits((basicThicknessMm === 18.5 || basicThicknessMm === 15.5) ? 15.5 : 15);
                      // 양쪽 0.5mm씩 축소 (총 1mm)
                      const reinforcementWidth = innerWidth - sidePanelGap;
                      // 보강대 Z 위치: 백패널 뒤쪽
                      const lowerReinforcementZ = lowerBackPanelZ - backPanelThickness/2 - reinforcementDepth/2;
                      const upperReinforcementZ = upperBackPanelZ - backPanelThickness/2 - reinforcementDepth/2;

                      // 하부장 모듈은 하단 보강대 생략 (상단만 유지)
                      const isLowerModule = moduleData?.id?.includes('lower-');
                      return (
                        <>
                          {/* 하부 섹션 보강대 — 백패널 없는 섹션은 보강대도 없음 */}
                          {lowerHasBackPanel && (
                            <>
                              {/* 하부 섹션 하단 보강대 — 하부장은 생략 */}
                              {!isLowerModule && (
                                <BoxWithEdges
                                  key="lower-reinforcement-bottom"
                                  args={[reinforcementWidth, reinforcementHeight, reinforcementDepth]}
                                  position={[0, lowerBackPanelY - lowerBackPanelHeight/2 + reinforcementHeight/2, lowerReinforcementZ]}
                                  material={material}
                                  renderMode={renderMode}
                                  isDragging={isDragging}
                                  isEditMode={isEditMode}
                                  isHighlighted={highlightedSection === `${placedFurnitureId}-0`}
                                  panelName="(하)보강대 1"
                                  furnitureId={placedFurnitureId}
                                />
                              )}
                              {/* 하부 섹션 상단 보강대 */}
                              <BoxWithEdges
                                key="lower-reinforcement-top"
                                args={[reinforcementWidth, reinforcementHeight, reinforcementDepth]}
                                position={[0, lowerBackPanelY + lowerBackPanelHeight/2 - reinforcementHeight/2, lowerReinforcementZ]}
                                material={material}
                                renderMode={renderMode}
                                isDragging={isDragging}
                                isEditMode={isEditMode}
                                isHighlighted={highlightedSection === `${placedFurnitureId}-0`}
                                panelName="(하)보강대 2"
                                furnitureId={placedFurnitureId}
                              />
                            </>
                          )}
                          {/* 상부 섹션 보강대 — 백패널 없는 섹션은 보강대도 없음 */}
                          {upperHasBackPanel && (
                            <>
                              {/* 상부 섹션 하단 보강대 — 하부장은 생략 */}
                              {!isLowerModule && (
                                <BoxWithEdges
                                  key="upper-reinforcement-bottom"
                                  args={[reinforcementWidth, reinforcementHeight, reinforcementDepth]}
                                  position={[0, upperBackPanelY - upperBackPanelHeight/2 + reinforcementHeight/2, upperReinforcementZ]}
                                  material={material}
                                  renderMode={renderMode}
                                  isDragging={isDragging}
                                  isEditMode={isEditMode}
                                  isHighlighted={highlightedSection === `${placedFurnitureId}-1`}
                                  panelName="(상)보강대 1"
                                  furnitureId={placedFurnitureId}
                                />
                              )}
                              {/* 상부 섹션 상단 보강대 */}
                              <BoxWithEdges
                                key="upper-reinforcement-top"
                                args={[reinforcementWidth, reinforcementHeight, reinforcementDepth]}
                                position={[0, upperBackPanelY + upperBackPanelHeight/2 - reinforcementHeight/2, upperReinforcementZ]}
                                material={material}
                                renderMode={renderMode}
                                isDragging={isDragging}
                                isEditMode={isEditMode}
                                isHighlighted={highlightedSection === `${placedFurnitureId}-1`}
                                panelName="(상)보강대 2"
                                furnitureId={placedFurnitureId}
                              />
                            </>
                          )}
                        </>
                      );
                    })()}

                    {/* 환기캡 - 상부 백패널과 같은 Z 위치 */}
                    {!isDragging && !hideVentilationCap && (
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
              {/* 단일 섹션 백패널 - basicThickness에 맞춰 동적 확장하여 측판과 동일 높이 */}
              {(() => {
                // 백패널 높이 확장값: basicThickness에 따라 동적 계산
                const totalHeightExtension = basicThickness * 2 - mmToThreeUnits(10);

                // 원본 백패널 높이 + 동적 확장 = 측판 높이와 동일
                const singleBackPanelHeight = innerHeight + mmToThreeUnits(backPanelConfig.heightExtension) + totalHeightExtension;

                console.log('🔍 단일 섹션 백패널 높이:', {
                  innerHeightMm: innerHeight / 0.01,
                  originalExtensionMm: backPanelConfig.heightExtension,
                  totalHeightExtensionMm: totalHeightExtension / 0.01,
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
                      isEditMode={isEditMode}
                      isBackPanel={true}
                      panelName="백패널"
                      panelGrainDirections={panelGrainDirections}
                      furnitureId={placedFurnitureId}
                      textureUrl={textureUrl}
                    />

                    {/* 보강대 (단일 섹션 백패널 상/하단) - 60mm 높이, 15.5mm 두께
                        2D 정면도에서는 숨김 (백패널 뒤에 위치하지만 선 렌더링으로 보임)
                        상부/측면 뷰에서만 표시됨 */}
                    {!(viewMode === '2D' && view2DDirection === 'front') && (() => {
                      const reinforcementHeight = mmToThreeUnits(60);
                      const reinforcementDepth = mmToThreeUnits((basicThicknessMm === 18.5 || basicThicknessMm === 15.5) ? 15.5 : 15);
                      // 양쪽 0.5mm씩 축소 (총 1mm)
                      const reinforcementWidth = innerWidth - sidePanelGap;
                      const backPanelZ = -depth/2 + backPanelThickness/2 + mmToThreeUnits(backPanelConfig.depthOffset);
                      const reinforcementZ = backPanelZ - backPanelThickness/2 - reinforcementDepth/2;

                      // 하부장 모듈은 하단 보강대 생략 (상단만 유지)
                      const isLowerModuleSingle = moduleData?.id?.includes('lower-');
                      return (
                        <>
                          {/* 하단 보강대 — 하부장은 생략 */}
                          {!isLowerModuleSingle && (
                            <BoxWithEdges
                              key="reinforcement-bottom"
                              args={[reinforcementWidth, reinforcementHeight, reinforcementDepth]}
                              position={[0, -singleBackPanelHeight/2 + reinforcementHeight/2, reinforcementZ]}
                              material={material}
                              renderMode={renderMode}
                              furnitureId={placedFurnitureId}
                              isDragging={isDragging}
                              isEditMode={isEditMode}
                              panelName="보강대 1"
                            />
                          )}
                          {/* 상단 보강대 */}
                          <BoxWithEdges
                            key="reinforcement-top"
                            args={[reinforcementWidth, reinforcementHeight, reinforcementDepth]}
                            position={[0, singleBackPanelHeight/2 - reinforcementHeight/2, reinforcementZ]}
                            material={material}
                            renderMode={renderMode}
                            furnitureId={placedFurnitureId}
                            isDragging={isDragging}
                            isEditMode={isEditMode}
                            panelName="보강대 2"
                          />
                        </>
                      );
                    })()}

                    {/* 환기캡 - 백패널과 같은 Z 위치 */}
                    {!isDragging && !hideVentilationCap && (
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

        {/* 빌트인 냉장고장 후면 보강대 3개 (하부섹션 백패널 없는 구간) */}
        {/* - 위: (하)상판 아랫면에서 435mm 아래에 보강대 윗면
            - 아래: (하)바닥 윗면에서 435mm 위에 보강대 아랫면
            - 가운데: 위 둘 사이 정중앙
           사이즈: 폭=내경, 높이=80mm, 두께=18mm. Z=가구 후면(측판 뒷면 안쪽). */}
        {moduleData?.id?.includes('built-in-fridge') && showFurniture && isMultiSectionFurniture() && (() => {
          const lowerSectionHeight = getSectionHeights()[0]; // 1838mm
          // (하)바닥 윗면 Y (가구 좌표계, 가구 중심 기준)
          const lowerBottomTopY = -height/2 + basicThickness;
          // (하)상판 아랫면 Y = 하부섹션 시작점(=lowerBottomTopY) + 하부섹션 외경 - 상판두께*2
          //                   = (-height/2 + basicThickness) + lowerSectionHeight - basicThickness*2
          //                   = -height/2 + lowerSectionHeight - basicThickness
          const lowerTopBottomY = -height/2 + lowerSectionHeight - basicThickness;

          const offset = mmToThreeUnits(435);
          const braceThickness = basicThickness;     // 18mm 두께
          const braceHeight = mmToThreeUnits(60);     // 60mm 높이
          const braceWidth = innerWidth - sidePanelGap;

          // 보강대 1: 위 (윗면이 (하)상판 아랫면에서 435mm 아래)
          const topBraceTopY = lowerTopBottomY - offset;
          const topBraceCenterY = topBraceTopY - braceHeight/2;
          // 보강대 3: 아래 (아랫면이 (하)바닥 윗면에서 435mm 위)
          const bottomBraceBottomY = lowerBottomTopY + offset;
          const bottomBraceCenterY = bottomBraceBottomY + braceHeight/2;
          // 보강대 2: 가운데 (위 둘의 정중앙)
          const middleBraceCenterY = (topBraceCenterY + bottomBraceCenterY) / 2;

          // Z 위치: 가구 후면 (측판 뒷면 = -depth/2 + braceThickness/2, 보강대 뒷면이 측판 뒷면과 일치)
          const braceZ = -depth/2 + braceThickness/2;

          const braceMat = getPanelMaterial('(하)후면보강대');

          return (
            <>
              <BoxWithEdges
                key={`fridge-brace-top-${braceMat.uuid}`}
                args={[braceWidth, braceHeight, braceThickness]}
                position={[0, topBraceCenterY, braceZ]}
                material={braceMat}
                renderMode={renderMode}
                isDragging={isDragging}
                isEditMode={isEditMode}
                panelName="(하)후면보강대상"
                panelGrainDirections={panelGrainDirections}
                furnitureId={placedFurnitureId}
                textureUrl={textureUrl}
              />
              <BoxWithEdges
                key={`fridge-brace-mid-${braceMat.uuid}`}
                args={[braceWidth, braceHeight, braceThickness]}
                position={[0, middleBraceCenterY, braceZ]}
                material={braceMat}
                renderMode={renderMode}
                isDragging={isDragging}
                isEditMode={isEditMode}
                panelName="(하)후면보강대중"
                panelGrainDirections={panelGrainDirections}
                furnitureId={placedFurnitureId}
                textureUrl={textureUrl}
              />
              <BoxWithEdges
                key={`fridge-brace-bot-${braceMat.uuid}`}
                args={[braceWidth, braceHeight, braceThickness]}
                position={[0, bottomBraceCenterY, braceZ]}
                material={braceMat}
                renderMode={renderMode}
                isDragging={isDragging}
                isEditMode={isEditMode}
                panelName="(하)후면보강대하"
                panelGrainDirections={panelGrainDirections}
                furnitureId={placedFurnitureId}
                textureUrl={textureUrl}
              />
            </>
          );
        })()}

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
    prevProps.backPanelThickness === nextProps.backPanelThickness &&
    prevProps.topPanelNotchSize === nextProps.topPanelNotchSize &&
    prevProps.topPanelNotchSide === nextProps.topPanelNotchSide &&
    prevProps.stoneTopThickness === nextProps.stoneTopThickness &&
    prevProps.topPanelFrontReduction === nextProps.topPanelFrontReduction &&
    prevProps.hideTopPanel === nextProps.hideTopPanel &&
    JSON.stringify(prevProps.topStretcher) === JSON.stringify(nextProps.topStretcher) &&
    JSON.stringify(prevProps.sideNotches) === JSON.stringify(nextProps.sideNotches) &&
    JSON.stringify(prevProps.panelGrainDirections) === JSON.stringify(nextProps.panelGrainDirections);

  // 모든 중요 props가 같으면 true 반환 (리렌더링 방지)
  return materialPropsEqual && otherPropsEqual;
}); 
