import React, { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useSpace3DView } from '../../../context/useSpace3DView';
import { useThree } from '@react-three/fiber';
import { useTheme } from '@/contexts/ThemeContext';
import { useUIStore } from '@/store/uiStore';
import BoxWithEdges from './BoxWithEdges';
import { AdjustableFootsRenderer } from './AdjustableFootsRenderer';

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
  
  // 띄움배치 여부
  isFloating?: boolean;
  
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
  isFloating = false, // 기본값은 false (바닥 배치)
  children
}) => {
  const { renderMode, viewMode } = useSpace3DView(); // context에서 renderMode와 viewMode 가져오기
  const { gl } = useThree(); // Three.js renderer 가져오기
  const { theme } = useTheme(); // 테마 정보 가져오기
  const { view2DDirection } = useUIStore(); // UI 스토어에서 view2DDirection 가져오기
  
  // 디버깅용 로그
  console.log('🔍🔍🔍 BaseFurnitureShell 실제 렌더링:', {
    width: width * 100 + 'mm',
    innerWidth: innerWidth * 100 + 'mm',
    basicThickness: basicThickness * 100 + 'mm',
    '계산식': `${width * 100} - ${basicThickness * 100 * 2} = ${innerWidth * 100}`,
    '최종가구너비': (innerWidth + basicThickness * 2) * 100 + 'mm',
    '왼쪽패널X': (-innerWidth/2 - basicThickness/2) * 100 + 'mm',
    '오른쪽패널X': (innerWidth/2 + basicThickness/2) * 100 + 'mm',
    '⚠️': '이 값으로 실제 3D 렌더링됨',
    '측면패널_좌': `x: ${(-innerWidth/2 - basicThickness/2) * 100}mm`,
    '측면패널_우': `x: ${(innerWidth/2 + basicThickness/2) * 100}mm`,
    '전체너비': `${((innerWidth/2 + basicThickness/2) - (-innerWidth/2 - basicThickness/2)) * 100}mm`,
    isDragging,
    isEditMode,
    renderMode,
    viewMode
  });
  
  // BaseFurnitureShell을 사용하는 가구들의 그림자 업데이트 - 제거
  // 그림자 자동 업데이트가 활성화되어 있으므로 수동 업데이트 불필요
  
  return (
    <group>
      {/* 좌우 측면 판재 - 항상 통짜로 렌더링 (좌/우측 뷰에서는 숨김) */}
      <>
        {/* 왼쪽 측면 판재 - 좌/우측 뷰에서 숨김 */}
        {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
          <BoxWithEdges
            args={[basicThickness, height, viewMode === '3D' ? depth : adjustedDepthForShelves - basicThickness]}
            position={[
              -innerWidth/2 - basicThickness/2, 
              0, 
              viewMode === '3D' ? 0 : -depth/2 + (adjustedDepthForShelves - basicThickness)/2 + basicThickness
            ]}
            material={material}
            renderMode={renderMode}
            isDragging={isDragging}
          />
        )}
        
        {/* 오른쪽 측면 판재 - 좌/우측 뷰에서 숨김 */}
        {!(viewMode === '2D' && (view2DDirection === 'left' || view2DDirection === 'right')) && (
          <BoxWithEdges
            args={[basicThickness, height, viewMode === '3D' ? depth : adjustedDepthForShelves - basicThickness]}
            position={[
              innerWidth/2 + basicThickness/2, 
              0, 
              viewMode === '3D' ? 0 : -depth/2 + (adjustedDepthForShelves - basicThickness)/2 + basicThickness
            ]}
            material={material}
            renderMode={renderMode}
            isDragging={isDragging}
          />
        )}
        
        {/* 다중 섹션 가구인 경우 중간 구분 패널 렌더링 */}
        {isMultiSectionFurniture() && getSectionHeights().length > 1 && (
          <>
            {getSectionHeights().map((sectionHeight: number, index: number) => {
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
            })}
          </>
        )}
      </>
      
      {/* 상단 판재 */}
      <BoxWithEdges
        args={[innerWidth, basicThickness, viewMode === '3D' ? depth : adjustedDepthForShelves - basicThickness]}
        position={[
          0, 
          height/2 - basicThickness/2, 
          viewMode === '3D' ? 0 : -depth/2 + (adjustedDepthForShelves - basicThickness)/2 + basicThickness
        ]}
        material={material}
        renderMode={renderMode}
        isDragging={isDragging}
      />
      
      {/* 하단 판재 */}
      <BoxWithEdges
        args={[innerWidth, basicThickness, viewMode === '3D' ? depth : adjustedDepthForShelves - basicThickness]}
        position={[
          0, 
          -height/2 + basicThickness/2, 
          viewMode === '3D' ? 0 : -depth/2 + (adjustedDepthForShelves - basicThickness)/2 + basicThickness
        ]}
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
      />
    </group>
  );
};

export default BaseFurnitureShell; 