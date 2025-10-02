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
  
  // 64×64mm 정사각형 플레이트의 바깥쪽 모서리가 가구 모서리에 맞도록
  const plateSize = mmToThreeUnits(64);
  const plateHalf = plateSize / 2; // 플레이트 크기의 절반 (32mm)
  
  // X축 위치 (플레이트 바깥쪽 모서리가 가구 모서리에 맞도록)
  const leftX = -furnitureWidth / 2 + plateHalf;
  const rightX = furnitureWidth / 2 - plateHalf;
  
  // Z축 위치
  // 앞쪽: 하부프레임 뒷면과 맞닿도록 20mm 뒤로
  // 뒤쪽: 뒷부분 꼭지점과 맞닿도록 plateHalf만큼 안쪽
  const frontZ = furnitureDepth / 2 - plateHalf - mmToThreeUnits(20);
  const backZ = -furnitureDepth / 2 + plateHalf;
  
  console.log('🦶 조절발통 위치 계산:', {
    'width(units)': width.toFixed(2),
    'depth(units)': depth.toFixed(2),
    'width(mm)': (width * 100).toFixed(0) + 'mm',
    'depth(mm)': (depth * 100).toFixed(0) + 'mm',
    'plateHalf': plateHalf.toFixed(2) + ' units (32mm)',
    leftX: leftX.toFixed(2) + ' units',
    rightX: rightX.toFixed(2) + ' units',
    frontZ: frontZ.toFixed(2) + ' units',
    backZ: backZ.toFixed(2) + ' units',
  });
  
  // 발통 위치 배열 (네 모서리, 회전 없음)
  const footPositions: Array<{pos: [number, number, number], rot: number}> = [
    { pos: [leftX, yOffset, frontZ], rot: 0 },   // 좌측 앞
    { pos: [rightX, yOffset, frontZ], rot: 0 },  // 우측 앞
    { pos: [leftX, yOffset, backZ], rot: 0 },    // 좌측 뒤
    { pos: [rightX, yOffset, backZ], rot: 0 },   // 우측 뒤
  ];
  
  return (
    <group>
      {footPositions.map((item, index) => (
        <AdjustableFoot
          key={`foot-${index}`}
          position={item.pos}
          rotation={item.rot}
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
