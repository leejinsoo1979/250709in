import React from 'react';
import { BoxWithEdges } from '../../elements/BoxWithEdges';
import { mmToThreeUnits } from '../../../utils/conversionUtils';

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
  // 브라켓 크기 (고정)
  const bracketWidth = mmToThreeUnits(12);
  const bracketDepth = mmToThreeUnits(12);
  const bracketHeight = mmToThreeUnits(75);

  // 봉 크기 (직경은 가구 내경에 반응)
  const rodLength = innerWidth - bracketWidth * 2; // 좌우 브라켓 제외
  const rodDiameter = mmToThreeUnits(12); // 기본 직경

  // 브라켓 X 위치 (좌우 끝)
  const leftBracketX = -innerWidth / 2 + bracketWidth / 2;
  const rightBracketX = innerWidth / 2 - bracketWidth / 2;

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

      {/* 중앙 봉 (원기둥) */}
      <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[rodDiameter / 2, rodDiameter / 2, rodLength, 32]} />
        <meshStandardMaterial
          color="#C0C0C0"
          metalness={0.9}
          roughness={0.1}
        />
      </mesh>
    </group>
  );
};
