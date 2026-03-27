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
import { isCabinetTexture1, applyCabinetTexture1Settings, isOakTexture, applyOakTextureSettings, applyDefaultImageTextureSettings } from '@/editor/shared/utils/materialConstants';

const mmToThree = (mm: number) => mm * 0.01;

interface SurroundPanelMeshProps {
  placedModule: PlacedModule;
  renderMode?: 'solid' | 'wireframe';
  viewMode?: '2D' | '3D';
  furnitureId?: string;
}

const SurroundPanelMesh: React.FC<SurroundPanelMeshProps> = ({
  placedModule,
  renderMode = 'solid',
  viewMode = '3D',
  furnitureId,
}) => {
  const { spaceInfo } = useSpaceConfigStore();
  const selectedFurnitureId = useUIStore(state => state.selectedFurnitureId);
  const view2DTheme = useUIStore(state => state.view2DTheme);
  const view2DDirection = useUIStore(state => state.view2DDirection);
  const isSelected = selectedFurnitureId === placedModule.id;

  const panelType = placedModule.surroundPanelType;
  const panelWidth = placedModule.surroundPanelWidth || 40;

  // 패널 치수 (Three.js 단위)
  const { args, position } = useMemo(() => {
    const thickness = mmToThree(SURROUND_PANEL_THICKNESS);
    const height = mmToThree(placedModule.freeHeight || spaceInfo.height);
    const depth = mmToThree(placedModule.freeDepth || spaceInfo.depth);
    const width = mmToThree(panelWidth);

    // 옵셋 값 (mm → Three.js 단위)
    const offsetLeft = mmToThree(placedModule.surroundOffsetLeft ?? 0);
    const offsetRight = mmToThree(placedModule.surroundOffsetRight ?? 0);
    const offsetTop = mmToThree(placedModule.surroundOffsetTop ?? 0);
    const offsetBottom = mmToThree(placedModule.surroundOffsetBottom ?? 0);
    const offsetDepth = mmToThree(placedModule.surroundOffsetDepth ?? 0);

    // 옵셋 적용: left→-X, right→+X, top→+Y, bottom→-Y, depth→-Z
    const posX = -offsetLeft + offsetRight;
    const posY = offsetTop - offsetBottom;
    const posZ = -offsetDepth;

    if (panelType === 'left' || panelType === 'right') {
      // 좌/우 패널: 두께(X) × 높이(Y) × 깊이(Z)
      // 실제 폭은 surroundPanelWidth이지만 패널 자체의 두께는 18mm
      return {
        args: [thickness, height, depth] as [number, number, number],
        position: [posX, posY, posZ] as [number, number, number],
      };
    } else {
      // 상단 패널: 너비(X) × 두께(Y) × 깊이(Z)
      const topWidth = mmToThree(placedModule.freeWidth || 0);
      return {
        args: [topWidth, thickness, depth] as [number, number, number],
        position: [posX, posY, posZ] as [number, number, number],
      };
    }
  }, [panelType, panelWidth, placedModule, spaceInfo]);

  // 재질: 프레임 재질 사용
  const material = useMemo(() => {
    const materialConfig = spaceInfo.materialConfig;
    const color = materialConfig?.doorColor || materialConfig?.frameColor || '#D4C5A9';
    const textureUrl = materialConfig?.doorTexture || materialConfig?.frameTexture;

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: 0.6,
      metalness: 0.0,
      envMapIntensity: 0.0,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0.0,
    });

    if (textureUrl) {
      if (isCabinetTexture1(textureUrl)) {
        applyCabinetTexture1Settings(material);
      }
      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(textureUrl, (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1);
        material.map = texture;
        if (isOakTexture(textureUrl)) {
          applyOakTextureSettings(material, false);
        } else if (!isCabinetTexture1(textureUrl)) {
          applyDefaultImageTextureSettings(material);
        }
        material.needsUpdate = true;
      });
    }

    return material;
  }, [spaceInfo.materialConfig]);

  // 2D 뷰: 도어와 동일한 반투명 오버레이
  const showOverlay = viewMode === '2D' && (view2DDirection === 'front' || view2DDirection === 'left' || view2DDirection === 'right');
  const overlayColor = view2DTheme === 'dark' ? '#3a5a7a' : '#a0b8d0';

  return (
    <group>
      <BoxWithEdges
        args={args}
        position={position}
        material={material}
        renderMode={renderMode}
        furnitureId={furnitureId}
        isHighlighted={isSelected}
        isEndPanel={true}
      />
      {/* 2D 뷰: 서라운드 패널 반투명 overlay (도어와 동일한 스타일) */}
      {showOverlay && (
        <mesh position={[position[0], position[1], position[2] + args[2] / 2 + 0.001]} renderOrder={9999}>
          <planeGeometry args={[args[0], args[1]]} />
          <meshBasicMaterial color={overlayColor} transparent opacity={0.2} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
};

export default SurroundPanelMesh;
