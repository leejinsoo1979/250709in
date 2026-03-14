/**
 * 서라운드 패널 3D 메시 렌더링
 * PlacedModule로 배치된 서라운드 패널을 BoxWithEdges로 렌더링
 */
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { PlacedModule } from '@/editor/shared/furniture/types';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useUIStore } from '@/store/uiStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import BoxWithEdges from './components/BoxWithEdges';
import { SURROUND_PANEL_THICKNESS } from '@/data/modules/surroundPanels';
import { MaterialFactory } from '../../utils/materials/MaterialFactory';

const mmToThree = (mm: number) => mm * 0.01;

interface SurroundPanelMeshProps {
  placedModule: PlacedModule;
  renderMode?: 'solid' | 'wireframe';
  viewMode?: '2D' | '3D';
}

const SurroundPanelMesh: React.FC<SurroundPanelMeshProps> = ({
  placedModule,
  renderMode = 'solid',
  viewMode = '3D',
}) => {
  const { spaceInfo } = useSpaceConfigStore();
  const selectedFurnitureId = useUIStore(state => state.selectedFurnitureId);
  const isSelected = selectedFurnitureId === placedModule.id;

  const panelType = placedModule.surroundPanelType;
  const panelWidth = placedModule.surroundPanelWidth || 40;

  // 패널 치수 (Three.js 단위)
  const { args, position } = useMemo(() => {
    const thickness = mmToThree(SURROUND_PANEL_THICKNESS);
    const height = mmToThree(placedModule.freeHeight || spaceInfo.height);
    const depth = mmToThree(placedModule.freeDepth || spaceInfo.depth);
    const width = mmToThree(panelWidth);

    if (panelType === 'left' || panelType === 'right') {
      // 좌/우 패널: 두께(X) × 높이(Y) × 깊이(Z)
      // 실제 폭은 surroundPanelWidth이지만 패널 자체의 두께는 18mm
      return {
        args: [thickness, height, depth] as [number, number, number],
        position: [0, 0, 0] as [number, number, number],
      };
    } else {
      // 상단 패널: 너비(X) × 두께(Y) × 깊이(Z)
      const topWidth = mmToThree(placedModule.freeWidth || 0);
      return {
        args: [topWidth, thickness, depth] as [number, number, number],
        position: [0, 0, 0] as [number, number, number],
      };
    }
  }, [panelType, panelWidth, placedModule, spaceInfo]);

  // 재질: 프레임 재질 사용
  const material = useMemo(() => {
    const materialConfig = spaceInfo.materialConfig;
    const color = materialConfig?.frameColor || '#D4C5A9';
    const textureUrl = materialConfig?.frameTexture;

    if (textureUrl) {
      return MaterialFactory.createTexturedMaterial(textureUrl, color);
    }
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.6,
      metalness: 0.1,
    });
  }, [spaceInfo.materialConfig]);

  return (
    <group>
      <BoxWithEdges
        args={args}
        position={position}
        material={material}
        renderMode={renderMode}
        isHighlighted={isSelected}
        isEndPanel={true}
      />
    </group>
  );
};

export default SurroundPanelMesh;
