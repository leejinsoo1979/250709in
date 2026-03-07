/**
 * 자유배치 모드 걸래받이 스트립 렌더러
 * 하부/키큰장이 있는 구간에만 걸래받이 박스를 렌더링한다.
 * 인접한 가구들은 하나의 연속 스트립으로 병합된다.
 */

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { computeBaseStripGroups } from '@/editor/shared/utils/baseStripUtils';

interface FreeBaseStripRendererProps {
  viewMode: '2D' | '3D';
  renderMode: 'solid' | 'wireframe';
}

const FreeBaseStripRenderer: React.FC<FreeBaseStripRendererProps> = ({ viewMode, renderMode }) => {
  const { spaceInfo } = useSpaceConfigStore();
  const placedModules = useFurnitureStore(state => state.placedModules);

  const baseHeightMM = spaceInfo.baseConfig?.height || 65;
  const floorFinishMM = spaceInfo.hasFloorFinish && spaceInfo.floorFinish
    ? spaceInfo.floorFinish.height : 0;

  // 스트립 그룹 계산
  const stripGroups = useMemo(
    () => computeBaseStripGroups(placedModules),
    [placedModules],
  );

  // 프레임 재질 생성 (Room.tsx의 frameColor/frameTexture 패턴 재사용)
  const material = useMemo(() => {
    const frameColor = spaceInfo.materialConfig?.frameColor || '#E0E0E0';
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(frameColor),
      metalness: 0.0,
      roughness: 0.6,
      envMapIntensity: 0.0,
      transparent: renderMode === 'wireframe',
      opacity: renderMode === 'wireframe' ? 0.3 : 1.0,
    });

    // 텍스처가 있으면 로드
    const textureUrl = spaceInfo.materialConfig?.frameTexture;
    if (textureUrl) {
      const loader = new THREE.TextureLoader();
      loader.load(textureUrl, (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        mat.map = texture;
        mat.needsUpdate = true;
      });
    }

    return mat;
  }, [spaceInfo.materialConfig?.frameColor, spaceInfo.materialConfig?.frameTexture, renderMode]);

  if (stripGroups.length === 0) return null;

  return (
    <group name="FreeBaseStrips">
      {stripGroups.map((group) => {
        const widthMM = group.rightMM - group.leftMM;
        const centerXmm = (group.leftMM + group.rightMM) / 2;
        const depthMM = group.depthMM;

        // Three.js 단위 변환 (mm * 0.01)
        const width = widthMM * 0.01;
        const height = baseHeightMM * 0.01;
        const depth = depthMM * 0.01;

        const posX = centerXmm * 0.01;
        const posY = (floorFinishMM + baseHeightMM / 2) * 0.01;
        const posZ = 0;

        return (
          <mesh
            key={group.id}
            position={[posX, posY, posZ]}
            material={material}
          >
            <boxGeometry args={[width, height, depth]} />
          </mesh>
        );
      })}
    </group>
  );
};

export default FreeBaseStripRenderer;
