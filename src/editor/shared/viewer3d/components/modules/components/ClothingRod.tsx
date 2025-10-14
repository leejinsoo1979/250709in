import React from 'react';
import * as THREE from 'three';
import BoxWithEdges from './BoxWithEdges';
import { Line } from '@react-three/drei';
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
  const { view2DTheme, view2DDirection } = useUIStore();
  const { viewMode } = useSpace3DView();

  // 탑뷰에서는 렌더링하지 않음
  if (viewMode === '2D' && view2DDirection === 'top') {
    return null;
  }

  // 단위 변환 함수
  const mmToThreeUnits = (mm: number): number => mm * 0.01;

  // 브라켓 크기 (고정)
  const bracketWidth = mmToThreeUnits(12);
  const bracketDepth = mmToThreeUnits(12);
  const bracketHeight = mmToThreeUnits(75);

  // 브라켓 X 위치 (가구 내부 양 끝)
  const leftBracketX = -innerWidth / 2 + bracketWidth / 2;
  const rightBracketX = innerWidth / 2 - bracketWidth / 2;

  // 옷봉 크기 및 위치: 브라켓 안쪽에서 안쪽까지
  // 옷봉 시작 = 좌측 브라켓 안쪽 (leftBracketX + bracketWidth/2)
  // 옷봉 끝 = 우측 브라켓 안쪽 (rightBracketX - bracketWidth/2)
  const rodStartX = leftBracketX + bracketWidth / 2;
  const rodEndX = rightBracketX - bracketWidth / 2;
  const rodWidth = rodEndX - rodStartX; // 브라켓 안쪽 사이 거리
  const rodCenterX = (rodStartX + rodEndX) / 2; // 옷봉 중심 X
  const rodDepth = mmToThreeUnits(10);
  const rodHeight = mmToThreeUnits(30);

  console.log('🎽 ClothingRod 렌더링:', {
    innerWidth: innerWidth * 100,
    leftBracketX: leftBracketX * 100,
    rightBracketX: rightBracketX * 100,
    rodWidth: rodWidth * 100,
    yPosition: yPosition * 100
  });

  // 옷봉 Y 위치: 브라켓 하단에서 5mm 위에 옷봉 하단
  // 브라켓 중심(Y=0) 기준, 브라켓 하단은 -bracketHeight/2
  // 옷봉 하단 = 브라켓 하단 + 5mm = -bracketHeight/2 + mmToThreeUnits(5)
  // 옷봉 중심 = 옷봉 하단 + rodHeight/2
  const rodYOffset = -bracketHeight / 2 + mmToThreeUnits(5) + rodHeight / 2;

  // 옷봉 Z 위치: 브라켓 안쪽에 배치 (브라켓은 D12, 옷봉은 D10)
  // 브라켓 중심에서 옷봉이 안쪽으로 1mm 들어감
  const rodZOffset = -mmToThreeUnits(1);

  // 옷봉 재질: 3D 모드에서는 밝은 은색 금속, 2D 모드에서는 회색
  const rodMaterial = React.useMemo(() => {
    if (viewMode === '3D') {
      // 크롬 금속 재질 - MeshPhongMaterial로 specular 하이라이트 구현
      return new THREE.MeshPhongMaterial({
        color: '#C0C0C0',      // 은색
        specular: '#FFFFFF',   // 흰색 하이라이트
        shininess: 200,        // 매우 높은 광택 (0-1000, 기본값 30)
        reflectivity: 0.9      // 높은 반사율
      });
    } else {
      return new THREE.MeshStandardMaterial({
        color: '#808080',
        roughness: 0.8,
        metalness: 0.1
      });
    }
  }, [viewMode]);

  // 2D 도면용 선 색상
  const lineColor = view2DTheme === 'light' ? '#808080' : '#FFFFFF';

  // cleanup
  React.useEffect(() => {
    return () => {
      rodMaterial.dispose();
    };
  }, [rodMaterial]);

  return (
    <group position={[0, yPosition, zPosition]}>
      {/* 좌측 브라켓 */}
      <BoxWithEdges
        args={[bracketWidth, bracketHeight, bracketDepth]}
        position={[leftBracketX, 0, 0]}
        material={rodMaterial}
        renderMode={renderMode}
        isDragging={isDragging}
        isEditMode={isEditMode}
        isClothingRod={true}
      />

      {/* 우측 브라켓 */}
      <BoxWithEdges
        args={[bracketWidth, bracketHeight, bracketDepth]}
        position={[rightBracketX, 0, 0]}
        material={rodMaterial}
        renderMode={renderMode}
        isDragging={isDragging}
        isEditMode={isEditMode}
        isClothingRod={true}
      />

      {/* 옷봉 렌더링: 2D는 가로선 3줄 + 중간선, 3D는 박스 */}
      {viewMode === '2D' ? (
        // 2D 모드: CAD 표준 방식 - 가로선 3줄과 중간 추가선
        <>
          {/* 옷봉 상단선 */}
          <Line
            points={[
              [rodStartX, rodYOffset + rodHeight / 2, rodZOffset],
              [rodEndX, rodYOffset + rodHeight / 2, rodZOffset]
            ]}
            color={lineColor}
            lineWidth={0.5}
          />
          {/* 옷봉 중간선 */}
          <Line
            points={[
              [rodStartX, rodYOffset, rodZOffset],
              [rodEndX, rodYOffset, rodZOffset]
            ]}
            color={lineColor}
            lineWidth={0.5}
          />
          {/* 옷봉 하단선 */}
          <Line
            points={[
              [rodStartX, rodYOffset - rodHeight / 2, rodZOffset],
              [rodEndX, rodYOffset - rodHeight / 2, rodZOffset]
            ]}
            color={lineColor}
            lineWidth={0.5}
          />
          {/* 중간선 위 5mm */}
          <Line
            points={[
              [rodStartX, rodYOffset + mmToThreeUnits(5), rodZOffset],
              [rodEndX, rodYOffset + mmToThreeUnits(5), rodZOffset]
            ]}
            color={lineColor}
            lineWidth={0.5}
          />
          {/* 중간선 아래 5mm */}
          <Line
            points={[
              [rodStartX, rodYOffset - mmToThreeUnits(5), rodZOffset],
              [rodEndX, rodYOffset - mmToThreeUnits(5), rodZOffset]
            ]}
            color={lineColor}
            lineWidth={0.5}
          />
        </>
      ) : (
        // 3D 모드: 박스로 렌더링 - 브라켓 안쪽에서 안쪽까지
        <BoxWithEdges
          args={[rodWidth, rodHeight, rodDepth]}
          position={[rodCenterX, rodYOffset, rodZOffset]}
          material={rodMaterial}
          renderMode={renderMode}
          isDragging={isDragging}
          isEditMode={isEditMode}
          isClothingRod={true}
        />
      )}
    </group>
  );
};
