import React, { useMemo, useEffect, useState } from 'react';
import * as THREE from 'three';
import BoxWithEdges from './BoxWithEdges';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { isCabinetTexture1, applyCabinetTexture1Settings, isOakTexture, applyOakTextureSettings } from '@/editor/shared/utils/materialConstants';

interface FinishingPanelWithTextureProps {
  width: number;
  height: number;
  depth: number;
  position: [number, number, number];
  spaceInfo?: SpaceInfo;
  doorColor: string;
  renderMode?: 'solid' | 'wireframe';
  isDragging?: boolean;
}

/**
 * 텍스처가 적용된 마감재 패널 컴포넌트 (상하부장용)
 * 텍스처를 캐싱하여 깜빡임 문제 해결
 */
const FinishingPanelWithTexture: React.FC<FinishingPanelWithTextureProps> = ({
  width,
  height,
  depth,
  position,
  spaceInfo,
  doorColor,
  renderMode = 'solid',
  isDragging = false
}) => {
  const [textureLoaded, setTextureLoaded] = useState(false);

  // 재질을 useMemo로 캐싱
  const panelMaterial = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({
      color: doorColor,
      metalness: 0.0,
      roughness: 0.6,
      transparent: renderMode === 'wireframe' || isDragging,
      opacity: renderMode === 'wireframe' ? 0.3 : isDragging ? 0.15 : 1.0,
      wireframe: renderMode === 'wireframe'
    });
    
    const textureUrl = spaceInfo?.materialConfig?.interiorTexture || spaceInfo?.materialConfig?.doorTexture;
    
    if (textureUrl) {
      // Cabinet Texture1인 경우 먼저 색상 설정
      if (isCabinetTexture1(textureUrl)) {
        applyCabinetTexture1Settings(material);
      }
      
      // 텍스처 로드 및 적용
      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(
        textureUrl,
        (texture) => {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(1, 1);

          // 마감재 패널은 세로 결 방향 유지 - Oak 텍스처 회전 안함
          material.map = texture;

          // Oak 텍스처인 경우: 마감재 패널은 세로 결이므로 회전 안함
          if (isOakTexture(textureUrl)) {
            applyOakTextureSettings(material, false); // rotateTexture = false
          }

          material.needsUpdate = true;
          setTextureLoaded(true);
        },
        undefined,
        (error) => {
          console.error('마감재 텍스처 로드 실패:', error);
        }
      );
    }
    
    return material;
  }, [doorColor, renderMode, isDragging, spaceInfo?.materialConfig?.interiorTexture, spaceInfo?.materialConfig?.doorTexture]);
  
  // 컴포넌트 언마운트 시 재질 정리
  useEffect(() => {
    return () => {
      if (panelMaterial.map) {
        panelMaterial.map.dispose();
      }
      panelMaterial.dispose();
    };
  }, [panelMaterial]);
  
  return (
    <BoxWithEdges
      args={[width, height, depth]}
      position={position}
      material={panelMaterial}
      renderMode={renderMode}
      hideEdges={false}
    />
  );
};

export default FinishingPanelWithTexture;