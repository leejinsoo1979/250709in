import React, { useMemo, useEffect, useState } from 'react';
import * as THREE from 'three';
import BoxWithEdges from './BoxWithEdges';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { isCabinetTexture1, applyCabinetTexture1Settings, isOakTexture, applyOakTextureSettings, applyDefaultImageTextureSettings } from '@/editor/shared/utils/materialConstants';

interface EndPanelWithTextureProps {
  width: number;
  height: number;
  depth: number;
  position: [number, number, number];
  spaceInfo: SpaceInfo;
  renderMode?: 'solid' | 'wireframe';
  useFrameColor?: boolean; // true면 프레임 색상 사용 (자유배치 EP)
  furnitureId?: string;
  endPanelThicknessMm?: number; // EP 물리적 두께 (mm) — >18mm이면 ㄷ자 프레임
  side?: 'left' | 'right'; // EP 위치 (ㄷ자 프레임 방향 결정)
  adjacentFurniture?: boolean; // 이 EP 방향에 인접 가구 있으면 측판 생략
}

/**
 * 텍스처가 적용된 엔드패널 컴포넌트
 * 텍스처를 캐싱하여 깜빡임 문제 해결
 */
const EndPanelWithTexture: React.FC<EndPanelWithTextureProps> = ({
  width,
  height,
  depth,
  position,
  spaceInfo,
  renderMode = 'solid',
  useFrameColor = false,
  furnitureId,
  endPanelThicknessMm = 18,
  side = 'left',
  adjacentFurniture = false
}) => {
  const [textureLoaded, setTextureLoaded] = useState(false);

  // 재질을 useMemo로 캐싱
  const endPanelMaterial = useMemo(() => {
    // 프레임 색상 사용 시 doorColor 우선 (도어=프레임 통일), 아니면 doorColor/doorTexture
    const baseColor = useFrameColor
      ? (spaceInfo.materialConfig?.doorColor || spaceInfo.materialConfig?.frameColor || '#E0E0E0')
      : (spaceInfo.materialConfig?.doorColor || '#E0E0E0');
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(baseColor),
      metalness: 0.0,
      roughness: 0.6,
      envMapIntensity: 0.0,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0.0
    });

    const textureUrl = useFrameColor
      ? (spaceInfo.materialConfig?.doorTexture || spaceInfo.materialConfig?.frameTexture)
      : (spaceInfo.materialConfig?.interiorTexture || spaceInfo.materialConfig?.doorTexture);
    
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

          // 측판(EndPanel)은 세로 결 방향 유지 - Oak 텍스처 회전 안함
          material.map = texture;

          // Oak 텍스처인 경우: 측판은 세로 결이므로 회전 안함
          if (isOakTexture(textureUrl)) {
            applyOakTextureSettings(material, false); // rotateTexture = false
          } else if (!isCabinetTexture1(textureUrl)) {
            applyDefaultImageTextureSettings(material);
          }

          material.needsUpdate = true;
          setTextureLoaded(true);
        },
        undefined,
        (error) => {
          console.error('엔드패널 텍스처 로드 실패:', error);
        }
      );
    }
    
    return material;
  }, [useFrameColor, spaceInfo.materialConfig?.doorColor, spaceInfo.materialConfig?.frameColor, spaceInfo.materialConfig?.frameTexture, spaceInfo.materialConfig?.interiorTexture, spaceInfo.materialConfig?.doorTexture]);
  
  // 컴포넌트 언마운트 시 재질 정리
  useEffect(() => {
    return () => {
      if (endPanelMaterial.map) {
        endPanelMaterial.map.dispose();
      }
      endPanelMaterial.dispose();
    };
  }, [endPanelMaterial]);
  
  // L자 분절 여부: 사용자가 EP 두께를 기본값(18.5mm)보다 크게 늘렸을 때만 적용
  //   기본값(18.5)에서는 분절 없이 단일 보드로 렌더링
  const isCFrame = endPanelThicknessMm > 18.5;

  if (!isCFrame) {
    // 기존: 단일 보드
    return (
      <BoxWithEdges
        isEndPanel={true}
        args={[width, height, depth]}
        position={position}
        material={endPanelMaterial}
        renderMode={renderMode}
        furnitureId={furnitureId}
      />
    );
  }

  // L자 EP: 사용자가 EP 두께를 18 초과로 늘렸을 때만 적용
  //   측면 ep(원래 EP, 두께는 사용자 입력값 그대로) +
  //   전면 ep(측면 ep의 안쪽 가구 본체 라인에 추가로 붙는 보드, 두께 18.5mm)
  // 평면도(top view, 우측 EP 예시):
  //   가구내경 ┤전면ep│  측면 ep(사용자 입력 두께)  │
  //           │      │                            │
  //           └──────┤  ←측면 ep는 전면 ep 뒷면부터 뒤끝까지
  //   ↑18.5mm│
  //  (전면 ep만 앞쪽 18.5mm 차지)
  // 인접 가구가 있으면 측면 ep 생략 → 전면 ep만 렌더링.
  const boardThickness = 18.5 * 0.01; // PET 18.5mm → Three.js 단위
  const frontEpDepthZ = boardThickness; // 전면 ep Z 두께 = 18.5mm
  const totalWidth = width;             // 사용자 입력 EP 두께(측면 ep 폭, 이미 Three.js 단위)
  const showSidePanel = !adjacentFurniture; // 인접 가구 없으면 측면 ep 표시

  // 측면 ep 깊이(Z): 원래 EP 깊이 - 전면 ep 두께 (앞 18.5mm는 전면 ep가 차지)
  const sideEpDepth = Math.max(0, depth - boardThickness);

  // 좌측 EP: 부모 좌표에서 가구 본체는 +X 쪽, 바깥은 -X 쪽 → outward=-1
  // 우측 EP: 가구 본체는 -X 쪽, 바깥은 +X 쪽 → outward=+1
  const outward = side === 'left' ? -1 : 1;
  // 측면 ep X 중심: EP 그룹 중심에 그대로 (사용자 입력 두께 = 그룹 폭)
  const sideEpX = 0;
  // 전면 ep X 중심: 측면 ep의 안쪽(가구 본체 쪽) 면에 바로 붙음
  //   측면 ep 안쪽 면 = -outward × totalWidth/2
  //   전면 ep 중심 = 측면 ep 안쪽 면 + (-outward × boardThickness/2)
  //              = -outward × (totalWidth/2 + boardThickness/2)
  const frontEpX = -outward * (totalWidth / 2 + boardThickness / 2);
  // Z 위치: 전면 ep는 EP 그룹의 앞면(=depth/2)에 붙음
  const frontEpZ = depth / 2 - frontEpDepthZ / 2;
  // 측면 ep는 앞면이 전면 ep 뒷면(=depth/2 - boardThickness)과 맞닿음
  const sideEpZ = (depth / 2 - boardThickness) - sideEpDepth / 2;

  return (
    <group position={position}>
      {/* 측면 ep — 사용자 입력 두께 그대로, 인접 가구 없을 때만 */}
      {showSidePanel && sideEpDepth > 0 && (
        <BoxWithEdges
          isEndPanel={true}
          args={[totalWidth, height, sideEpDepth]}
          position={[sideEpX, 0, sideEpZ]}
          material={endPanelMaterial}
          renderMode={renderMode}
          furnitureId={furnitureId}
        />
      )}
      {/* 전면 ep — 측면 ep의 안쪽(가구 본체 쪽)에 보드 두께만큼 추가로 붙음 */}
      <BoxWithEdges
        isEndPanel={true}
        args={[boardThickness, height, frontEpDepthZ]}
        position={[frontEpX, 0, frontEpZ]}
        material={endPanelMaterial}
        renderMode={renderMode}
        furnitureId={furnitureId}
      />
    </group>
  );
};

export default EndPanelWithTexture;