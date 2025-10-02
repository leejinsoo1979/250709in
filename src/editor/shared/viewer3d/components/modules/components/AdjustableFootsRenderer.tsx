import React from 'react';
import * as THREE from 'three';
import { AdjustableFoot } from './AdjustableFoot';

interface AdjustableFootsRendererProps {
  width: number; // 가구 폭 (Three.js units)
  depth: number; // 가구 깊이 (Three.js units)
  yOffset?: number; // Y축 오프셋 (가구 하단 위치)
  material?: THREE.Material;
  renderMode?: 'solid' | 'wireframe';
  isHighlighted?: boolean;
  isFloating?: boolean; // 띄움배치 여부
  baseHeight?: number; // 받침대 높이 (mm)
}

/**
 * 가구 네 모서리에 조절발통 렌더링
 * - 각 모서리(좌측앞, 좌측뒤, 우측앞, 우측뒤)에 1개씩
 * - 앞쪽: 앞면에서 27mm 안쪽
 * - 뒤쪽: 뒷면에서 20mm 안쪽
 */
export const AdjustableFootsRenderer: React.FC<AdjustableFootsRendererProps> = ({
  width,
  depth,
  yOffset = 0,
  material,
  renderMode = 'solid',
  isHighlighted = false,
  isFloating = false,
  baseHeight = 65, // 기본값 65mm
}) => {
  // 띄움배치일 때는 발통 렌더링 안 함
  if (isFloating) {
    return null;
  }
  const mmToThreeUnits = (mm: number) => mm * 0.01;
  
  // width, depth는 이미 Three.js units
  const furnitureWidth = width;
  const furnitureDepth = depth;
  
  // Z축 위치 계산
  const frontOffset = mmToThreeUnits(27); // 앞면에서 27mm 안쪽
  const backOffset = mmToThreeUnits(20);  // 뒷면에서 20mm 안쪽
  
  const frontZ = furnitureDepth / 2 - frontOffset;
  const backZ = -furnitureDepth / 2 + backOffset;
  
  console.log('🦶 조절발통 위치 계산:', {
    'width(units)': width.toFixed(2),
    'depth(units)': depth.toFixed(2),
    'width(mm)': (width * 100).toFixed(0) + 'mm',
    'depth(mm)': (depth * 100).toFixed(0) + 'mm',
    frontOffset: frontOffset.toFixed(2) + ' units (27mm)',
    backOffset: backOffset.toFixed(2) + ' units (20mm)',
    frontZ: frontZ.toFixed(2) + ' units',
    backZ: backZ.toFixed(2) + ' units',
  });
  
  // X축 위치 (좌우 모서리)
  const leftX = -furnitureWidth / 2;
  const rightX = furnitureWidth / 2;
  
  // 발통 위치 배열 (네 모서리)
  const footPositions: [number, number, number][] = [
    [leftX, yOffset, frontZ],   // 좌측 앞
    [rightX, yOffset, frontZ],  // 우측 앞
    [leftX, yOffset, backZ],    // 좌측 뒤
    [rightX, yOffset, backZ],   // 우측 뒤
  ];
  
  return (
    <group>
      {footPositions.map((position, index) => (
        <AdjustableFoot
          key={`foot-${index}`}
          position={position}
          material={material}
          renderMode={renderMode}
          isHighlighted={isHighlighted}
          baseHeight={baseHeight}
        />
      ))}
    </group>
  );
};

export default AdjustableFootsRenderer;
