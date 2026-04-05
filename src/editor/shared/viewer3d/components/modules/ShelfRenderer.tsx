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
  shelfFrontInsetMm?: number; // 선반 앞면 들여쓰기 (mm, 다보 선반용 - 기본: 0)
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
  shelfFrontInsetMm = 0,
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

  // 18.5/15.5mm는 양면 접합 두께이므로 좌우 이격 불필요
  const basicThicknessMm = basicThickness / 0.01;
  const sidePanelGap = (basicThicknessMm === 18.5 || basicThicknessMm === 15.5) ? 0 : mmToThreeUnits(1);

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

// console.log('📏 ShelfRenderer getDimensionXPosition:',
        // `viewMode=${viewMode}`,
        // `view2DDirection=${view2DDirection}`,
        // `innerWidth=${innerWidth}`,
        // `forText=${forText}`,
        // `textOffset=${textOffset}`,
        // `xPos=${xPos}`,
        // `furnitureId=${furnitureId}`
      // );

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
// console.log('🔥 isTopFinishPanel 상판 렌더링:', { furnitureId, sectionType, innerHeight, yOffset });

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
          args={[innerWidth - sidePanelGap, basicThickness, depth - basicThickness - mmToThreeUnits(1)]}
          position={[0, topPosition, basicThickness/2 + zOffset - mmToThreeUnits(0.5)]}
          material={topFinishMat}
          renderMode={renderMode}
          isHighlighted={isHighlighted}
          panelName={panelName}
          textureUrl={textureUrl}
          panelGrainDirections={panelGrainDirections}
              furnitureId={furnitureId}
        />
        
        {/* 상판 두께 치수 표시 - 제거됨 (2D에서 18mm 두께 표시 불필요) */}
      </group>
    );
  }
  
  if (shelfPositions && shelfPositions.length === shelfCount) {
    // 절대 위치 모드: 지정된 위치에 선반 배치
    // positionMm === 0인 항목은 스킵되므로, CNC 패널 이름과 일치시키기 위해
    // 실제 렌더링되는 선반만 카운트하는 별도 인덱스 사용
    let shelfRenderIndex = 0;
    return (
      <group position={[0, yOffset, 0]}>
        {shelfPositions.map((positionMm, i) => {
          // positionMm === 0인 경우는 치수만 표시하고 패널은 렌더링하지 않음 (BaseFurnitureShell에서 렌더링)
          if (positionMm === 0) {
            return null;
          }

          // 실제 렌더링되는 선반의 1-based 인덱스 (CNC 패널 이름과 일치)
          shelfRenderIndex++;

          // 섹션 하단 기준 위치를 Three.js 좌표로 변환
          const relativeYPosition = (-innerHeight / 2) + mmToThreeUnits(positionMm);

          // 스타일러장 우측 섹션의 안전선반: 앞에서 8mm 줄이고 뒤로 5mm 이동
          const isStylerRightSection = furnitureId && furnitureId.includes('-right-section');
          const frontInset = mmToThreeUnits(shelfFrontInsetMm);
          const backGap = mmToThreeUnits(1); // 백패널 앞면과 1mm 이격
          const shelfDepth = isStylerRightSection
            ? depth - basicThickness - mmToThreeUnits(8) // 앞에서 8mm 줄임
            : depth - basicThickness - backGap - frontInset; // 다보 선반: 백패널 1mm 이격 + 앞면 들여쓰기
          const shelfZPosition = isStylerRightSection
            ? basicThickness/2 + zOffset - mmToThreeUnits(5) // 뒤로 5mm 이동 (백패널에 붙임)
            : basicThickness/2 + zOffset - backGap/2 - frontInset / 2; // 백패널 이격 + 앞면 들여쓰기

          const panelName = sectionName ? `${sectionName}선반 ${shelfRenderIndex}` : `선반 ${shelfRenderIndex}`;
          const shelfMat = getPanelMaterial(panelName);
          return (
            <BoxWithEdges
              key={`shelf-${i}-${shelfMat.uuid}`}
              args={[innerWidth - sidePanelGap, basicThickness, shelfDepth]}
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
            args={[innerWidth - sidePanelGap, basicThickness, depth - basicThickness - mmToThreeUnits(1) - mmToThreeUnits(shelfFrontInsetMm)]}
            position={[0, relativeYPosition, basicThickness/2 + zOffset - mmToThreeUnits(0.5) - mmToThreeUnits(shelfFrontInsetMm) / 2]}
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
    </group>
  );
};

export default ShelfRenderer; 
