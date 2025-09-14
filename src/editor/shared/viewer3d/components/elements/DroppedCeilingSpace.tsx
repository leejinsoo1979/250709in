import React, { useMemo } from 'react';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { getDroppedZoneBounds } from '@/editor/shared/utils/space/droppedCeilingUtils';
import { mmToThreeUnits } from '../base/utils/threeUtils';
import * as THREE from 'three';
import { Box } from '@react-three/drei';
import { MaterialFactory } from '../../utils/materials/MaterialFactory';

interface DroppedCeilingSpaceProps {
  spaceInfo: SpaceInfo;
}

const DroppedCeilingSpace: React.FC<DroppedCeilingSpaceProps> = ({ spaceInfo }) => {
  if (!spaceInfo.droppedCeiling?.enabled) return null;

  const bounds = getDroppedZoneBounds(spaceInfo);
  if (!bounds) return null;

  const { position } = spaceInfo.droppedCeiling;
  const depth = spaceInfo.depth || 600;
  const dropHeight = spaceInfo.droppedCeiling.dropHeight || 200;
  
  console.log('🏗️ DroppedCeilingSpace 디버그:', {
    bounds,
    position,
    dropHeight,
    depth,
    spaceHeight: spaceInfo.height
  });
  
  // Three.js 단위로 변환
  const threeStartX = mmToThreeUnits(bounds.startX);
  const threeWidth = mmToThreeUnits(bounds.width);
  const threeHeight = mmToThreeUnits(bounds.height);
  const threeDropHeight = mmToThreeUnits(dropHeight);
  const threeDepth = mmToThreeUnits(depth);
  const threeSpaceHeight = mmToThreeUnits(spaceInfo.height);
  
  // NaN 체크
  if (isNaN(threeWidth) || isNaN(threeHeight) || isNaN(threeDepth) || 
      isNaN(threeDropHeight) || isNaN(threeStartX) || isNaN(threeSpaceHeight)) {
    console.error('🚨 DroppedCeilingSpace - NaN 값 감지:', {
      threeStartX,
      threeWidth,
      threeHeight,
      threeDropHeight,
      threeDepth,
      threeSpaceHeight,
      bounds,
      dropHeight,
      depth
    });
    return null;
  }
  
  // 단내림 영역의 중심 X 좌표 계산
  const centerX = threeStartX + threeWidth / 2;

  // 프레임 두께 (50mm)
  const frameThickness = mmToThreeUnits(50);
  
  // 단내림 영역의 높이 = 전체 높이 - 드롭 높이
  const droppedAreaHeight = threeSpaceHeight - threeDropHeight;
  
  // 벽 두께 (임시로 10mm 설정)
  const wallThickness = mmToThreeUnits(10);
  
  // 프레임 위치 계산
  const frameY = (droppedAreaHeight - frameThickness) / 2;
  const wallY = droppedAreaHeight / 2;
  
  // 그라데이션 재질 생성
  const wallMaterial = useMemo(() => {
    const mat = MaterialFactory.createShaderGradientWallMaterial('vertical', '3D');
    if (mat.uniforms) {
      mat.uniforms.opacity.value = 1.0;
    }
    mat.transparent = false;
    mat.depthWrite = true;
    return mat;
  }, []);
  
  const ceilingMaterial = useMemo(() => {
    const mat = MaterialFactory.createShaderGradientCeilingMaterial('3D');
    if (mat.uniforms) {
      mat.uniforms.opacity.value = 1.0;
    }
    mat.transparent = false;
    mat.depthWrite = true;
    return mat;
  }, []);

  return (
    <group>
      {/* 단내림 구간 내부 벽 (그라데이션) */}
      <mesh
        position={[
          position === 'left' ? threeStartX + threeWidth : threeStartX,
          wallY,
          0
        ]}
        material={wallMaterial}
        renderOrder={10}
      >
        <boxGeometry args={[wallThickness, droppedAreaHeight, threeDepth]} />
      </mesh>

      {/* 단내림 천장 (그라데이션) */}
      <mesh
        position={[
          centerX,
          droppedAreaHeight,
          0
        ]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={ceilingMaterial}
        renderOrder={10}
      >
        <planeGeometry args={[threeWidth, threeDepth]} />
      </mesh>
    </group>
  );
};

export default React.memo(DroppedCeilingSpace);