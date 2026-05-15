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

  // L자 EP: 사용자가 EP 두께를 18.5 초과로 늘렸을 때만 적용
  //   측면 ep: 사용자 입력 두께(X) × 원래 깊이(Z) 그대로 — 변형 없음
  //   전면 ep: 측면 ep의 앞면을 덮는 마감 보드, 폭(X)=측면 ep와 동일, 두께(Z)=18.5mm
  //            측면 ep 앞면(Z=depth/2)에 덧대어 +Z 방향으로 18.5mm 튀어나옴
  // 평면도(top view, 우측 EP 예시, 입력 51mm):
  //   가구내경 ┤   측면 ep (51 × depth)   │  ← 측면 ep 그대로
  //           ├──────────────────────────┤
  //           │   전면 ep (51 × 18.5)    │  ← 측면 ep 앞쪽에 덧댐
  //           └──────────────────────────┘
  // 인접 가구가 있으면 측면 ep 생략 → 전면 ep만 렌더링.
  const boardThickness = 18.5 * 0.01;   // PET 18.5mm → Three.js 단위
  const frontEpDepthZ = boardThickness; // 전면 ep Z 두께 = 18.5mm
  const totalWidth = width;             // 사용자 입력 EP 두께(이미 Three.js 단위)
  const showSidePanel = !adjacentFurniture; // 인접 가구 없으면 측면 ep 표시

  // 측면 ep, 전면 ep 모두 X 폭과 X 중심 동일 (EP 그룹 중심에 그대로)
  const sideEpX = 0;
  const frontEpX = 0;
  // 측면 ep: 깊이 그대로, Z 중심도 0 (EP 그룹 중심)
  const sideEpZ = 0;
  // 전면 ep: 측면 ep 앞면(=depth/2)에 뒷면이 닿고 +Z 방향으로 18.5mm 튀어나옴
  //   전면 ep 뒷면 = depth/2, 전면 ep 중심 = depth/2 + frontEpDepthZ/2
  const frontEpZ = depth / 2 + frontEpDepthZ / 2;

  return (
    <group position={position}>
      {/* 측면 ep — 사용자 입력 두께 × 원래 깊이 그대로, 인접 가구 없을 때만 */}
      {showSidePanel && depth > 0 && (
        <BoxWithEdges
          isEndPanel={true}
          args={[totalWidth, height, depth]}
          position={[sideEpX, 0, sideEpZ]}
          material={endPanelMaterial}
          renderMode={renderMode}
          furnitureId={furnitureId}
        />
      )}
      {/* 전면 ep — 측면 ep 앞면을 덮는 마감 보드 (폭 동일, Z 두께 18.5mm) */}
      {totalWidth > 0 && (
        <BoxWithEdges
          isEndPanel={true}
          args={[totalWidth, height, frontEpDepthZ]}
          position={[frontEpX, 0, frontEpZ]}
          material={endPanelMaterial}
          renderMode={renderMode}
          furnitureId={furnitureId}
        />
      )}
    </group>
  );
};

export default EndPanelWithTexture;