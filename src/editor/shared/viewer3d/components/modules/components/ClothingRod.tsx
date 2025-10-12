import React from 'react';
import { BoxWithEdges } from './BoxWithEdges';
import { Text, Line } from '@react-three/drei';
import { useUIStore } from '@/store/uiStore';
import { useSpace3DView } from '../../../context/useSpace3DView';

interface ClothingRodProps {
  innerWidth: number;
  yPosition: number;
  zPosition?: number;
  renderMode: '2d' | '3d';
  isDragging?: boolean;
  isEditMode?: boolean;
  adjustedDepthForShelves: number;
  depth: number;
}

/**
 * ClothingRod 컴포넌트
 * 옷걸이 봉 시스템: 좌우 브라켓 + 중앙 봉
 *
 * 구조:
 * - 브라켓: W12 x D12 x H75mm (고정 크기, 좌우 배치)
 * - 봉: 직경은 가구 내경에 따라 변경, 길이는 innerWidth
 */
export const ClothingRod: React.FC<ClothingRodProps> = ({
  innerWidth,
  yPosition,
  zPosition = 0,
  renderMode,
  isDragging = false,
  isEditMode = false,
  adjustedDepthForShelves,
  depth,
}) => {
  const { showDimensions, showDimensionsText, view2DDirection, view2DTheme } = useUIStore();
  const { viewMode } = useSpace3DView();

  // 단위 변환 함수
  const mmToThreeUnits = (mm: number): number => mm * 0.01;

  // 2D 도면 치수 색상
  const dimensionColor = view2DTheme === 'light' ? '#000000' : '#FFFFFF';
  const baseFontSize = 0.15;

  // 브라켓 크기 (고정)
  const bracketWidth = mmToThreeUnits(12);
  const bracketDepth = mmToThreeUnits(12);
  const bracketHeight = mmToThreeUnits(75);

  // 봉 크기
  const rodWidth = innerWidth; // 가구 내경 전체
  const rodDepth = mmToThreeUnits(10);
  const rodHeight = mmToThreeUnits(30);

  // 브라켓 X 위치 (좌우 끝)
  const leftBracketX = -innerWidth / 2 + bracketWidth / 2;
  const rightBracketX = innerWidth / 2 - bracketWidth / 2;

  // 옷봉 Y 위치: 브라켓 하단에서 5mm 위에 옷봉 하단
  // 브라켓 중심(Y=0) 기준, 브라켓 하단은 -bracketHeight/2
  // 옷봉 하단 = 브라켓 하단 + 5mm = -bracketHeight/2 + mmToThreeUnits(5)
  // 옷봉 중심 = 옷봉 하단 + rodHeight/2
  const rodYOffset = -bracketHeight / 2 + mmToThreeUnits(5) + rodHeight / 2;

  // 크롬 재질
  const chromeMaterial = (
    <meshStandardMaterial
      color="#C0C0C0"
      metalness={0.9}
      roughness={0.1}
    />
  );

  return (
    <group position={[0, yPosition, zPosition]}>
      {/* 좌측 브라켓 */}
      <BoxWithEdges
        args={[bracketWidth, bracketHeight, bracketDepth]}
        position={[leftBracketX, 0, 0]}
        material={chromeMaterial}
        renderMode={renderMode}
        isDragging={isDragging}
        isEditMode={isEditMode}
      />

      {/* 우측 브라켓 */}
      <BoxWithEdges
        args={[bracketWidth, bracketHeight, bracketDepth]}
        position={[rightBracketX, 0, 0]}
        material={chromeMaterial}
        renderMode={renderMode}
        isDragging={isDragging}
        isEditMode={isEditMode}
      />

      {/* 중앙 옷봉 (박스) */}
      <BoxWithEdges
        args={[rodWidth, rodHeight, rodDepth]}
        position={[0, rodYOffset, 0]}
        material={chromeMaterial}
        renderMode={renderMode}
        isDragging={isDragging}
        isEditMode={isEditMode}
      />

      {/* 옷봉 치수 표시 - 정면도/측면도에서만 */}
      {showDimensions && showDimensionsText && (viewMode === '3D' || view2DDirection === 'front' || view2DDirection === 'left' || view2DDirection === 'right') && (
        <group>
          {/* 옷봉 높이 치수 (H30) */}
          <Text
            position={[
              innerWidth / 2 + 0.3,
              rodYOffset,
              viewMode === '3D' ? adjustedDepthForShelves / 2 + 0.1 : depth / 2 + 1.0
            ]}
            fontSize={baseFontSize}
            color={dimensionColor}
            anchorX="left"
            anchorY="middle"
          >
            H30
          </Text>

          {/* 옷봉 높이 수직선 */}
          <Line
            points={[
              [innerWidth / 2 + 0.2, rodYOffset - rodHeight / 2, viewMode === '3D' ? adjustedDepthForShelves / 2 + 0.1 : depth / 2 + 1.0],
              [innerWidth / 2 + 0.2, rodYOffset + rodHeight / 2, viewMode === '3D' ? adjustedDepthForShelves / 2 + 0.1 : depth / 2 + 1.0]
            ]}
            color={dimensionColor}
            lineWidth={1}
          />

          {/* 브라켓 높이 치수 (H75) */}
          <Text
            position={[
              -innerWidth / 2 - 0.3,
              0,
              viewMode === '3D' ? adjustedDepthForShelves / 2 + 0.1 : depth / 2 + 1.0
            ]}
            fontSize={baseFontSize}
            color={dimensionColor}
            anchorX="right"
            anchorY="middle"
          >
            H75
          </Text>

          {/* 브라켓 높이 수직선 */}
          <Line
            points={[
              [-innerWidth / 2 - 0.2, -bracketHeight / 2, viewMode === '3D' ? adjustedDepthForShelves / 2 + 0.1 : depth / 2 + 1.0],
              [-innerWidth / 2 - 0.2, bracketHeight / 2, viewMode === '3D' ? adjustedDepthForShelves / 2 + 0.1 : depth / 2 + 1.0]
            ]}
            color={dimensionColor}
            lineWidth={1}
          />
        </group>
      )}
    </group>
  );
};
