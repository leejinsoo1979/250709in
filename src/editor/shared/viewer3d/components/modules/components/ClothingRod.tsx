import React from 'react';
import * as THREE from 'three';
import BoxWithEdges from './BoxWithEdges';

interface ClothingRodProps {
  innerWidth: number;
  yPosition: number;
  zPosition?: number;
  renderMode: '2d' | '3d';
  isDragging?: boolean;
  isEditMode?: boolean;
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
}) => {
  // 단위 변환 함수
  const mmToThreeUnits = (mm: number): number => mm * 0.01;

  // 브라켓 크기 (고정)
  const bracketWidth = mmToThreeUnits(12);
  const bracketDepth = mmToThreeUnits(12);
  const bracketHeight = mmToThreeUnits(75);

  // 봉 크기
  const rodWidth = innerWidth; // 가구 내경 전체
  const rodDepth = mmToThreeUnits(10);
  const rodHeight = mmToThreeUnits(30);

  // 브라켓 X 위치 (가구 내부 양 끝)
  const leftBracketX = -innerWidth / 2 + bracketWidth / 2;
  const rightBracketX = innerWidth / 2 - bracketWidth / 2;

  // 옷봉 Y 위치: 브라켓 하단에서 5mm 위에 옷봉 하단
  // 브라켓 중심(Y=0) 기준, 브라켓 하단은 -bracketHeight/2
  // 옷봉 하단 = 브라켓 하단 + 5mm = -bracketHeight/2 + mmToThreeUnits(5)
  // 옷봉 중심 = 옷봉 하단 + rodHeight/2
  const rodYOffset = -bracketHeight / 2 + mmToThreeUnits(5) + rodHeight / 2;

  // 옷봉 Z 위치: 브라켓 안쪽에 배치 (브라켓은 D12, 옷봉은 D10)
  // 브라켓 중심에서 옷봉이 안쪽으로 1mm 들어감
  const rodZOffset = -mmToThreeUnits(1);

  // 옷봉 재질: 크롬 재질
  const rodMaterial = React.useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: '#C0C0C0',
      metalness: 0.9,
      roughness: 0.1
    });
  }, []);

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

      {/* 중앙 옷봉 (박스) - 브라켓 안쪽에 배치 */}
      <BoxWithEdges
        args={[rodWidth, rodHeight, rodDepth]}
        position={[0, rodYOffset, rodZOffset]}
        material={rodMaterial}
        renderMode={renderMode}
        isDragging={isDragging}
        isEditMode={isEditMode}
        isClothingRod={true}
      />
    </group>
  );
};
