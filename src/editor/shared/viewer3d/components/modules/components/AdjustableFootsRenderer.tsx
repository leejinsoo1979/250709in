import React from 'react';
import * as THREE from 'three';
import { AdjustableFoot } from './AdjustableFoot';

interface AdjustableFootsRendererProps {
  width: number; // 가구 폭 (mm)
  depth: number; // 가구 깊이 (mm)
  yOffset?: number; // Y축 오프셋 (가구 하단 위치)
  material?: THREE.Material;
  renderMode?: 'solid' | 'wireframe';
  isHighlighted?: boolean;
  isFloating?: boolean; // 띄움배치 여부
  baseHeight?: number; // 받침대 높이 (mm)
}

/**
 * 가구 양끝(좌우)에 조절발통 렌더링
 * - 좌측 끝과 우측 끝에 각각 1개씩
 * - 앞뒤 중앙에 위치
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
  
  const furnitureWidth = mmToThreeUnits(width);
  
  // X축 위치 (좌우 끝)
  const leftX = -furnitureWidth / 2;
  const rightX = furnitureWidth / 2;
  
  // Z축 위치 (앞뒤 중앙)
  const centerZ = 0;
  
  // 발통 위치 배열 (양끝 2개)
  const footPositions: [number, number, number][] = [
    [leftX, yOffset, centerZ],   // 좌측
    [rightX, yOffset, centerZ],  // 우측
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
