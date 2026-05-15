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
  
  // ㄷ자 프레임 여부: EP 두께 > 18mm
  const isCFrame = endPanelThicknessMm > 18;

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

  // ㄱ자 프레임: EP 본체(앞쪽 18mm 잘림) + 전면 프레임(EP 폭 + 바깥쪽 18mm 확장)
  // 평면도(top view)에서 본 단면:
  //     ━━━━━━━━━━  ← 전면 프레임 (가구 본체 라인 ~ EP 바깥쪽 + 18mm)
  //          ┃   ┃ ← EP 본체 (앞쪽 18mm 잘린 만큼 뒤로 위치)
  //          ┃   ┃
  //          ┃   ┃
  // 인접 가구가 있으면 EP 본체 생략 → 전면 프레임만 렌더링
  const boardThickness = 18.5 * 0.01; // PET 18.5mm → Three.js 단위
  const connectorDepthZ = boardThickness; // 전면 프레임 Z축 깊이 = 18.5mm
  const totalWidth = width;            // 전체 EP 두께 (이미 Three.js 단위)
  const showSidePanel = !adjacentFurniture; // 인접 가구 없을 때만 EP 본체 표시

  // 전면 프레임 폭: EP 두께 + 바깥쪽 18mm (가구 본체 라인 안쪽으로는 안 들어감)
  //   인접 가구 있으면 EP가 안 그려지므로 폭 = 사용자 지정 EP 두께만 (확장 안 함)
  const frontFrameWidth = showSidePanel
    ? totalWidth + boardThickness
    : totalWidth;

  // 좌측 EP (dir=-1): EP 본체가 +X(가구 본체 라인 쪽), 전면 프레임은 EP 본체 + 바깥쪽 18mm 확장
  // 우측 EP (dir=+1): 거울 대칭
  const dir = side === 'left' ? -1 : 1;
  // 전면 프레임 X 중심: 측판이 있으면 EP 바깥쪽으로 18mm 만큼 더 차지 → 중심이 바깥쪽으로 boardThickness/2 이동
  const frontFrameX = showSidePanel
    ? dir * (-boardThickness / 2)  // 바깥쪽으로 boardThickness/2 이동
    : 0;
  // EP 본체 Z 중심: 앞쪽 boardThickness 만큼 잘려서 뒤로 이동 (앞면이 원래보다 18.5mm 뒤로)
  const sideEpDepth = Math.max(0, depth - boardThickness);
  const sideEpZ = -boardThickness / 2;

  return (
    <group position={position}>
      {/* EP 본체 (전면 프레임만큼 앞쪽 잘림) — 인접 가구 없을 때만 */}
      {showSidePanel && sideEpDepth > 0 && (
        <BoxWithEdges
          isEndPanel={true}
          args={[totalWidth, height, sideEpDepth]}
          position={[0, 0, sideEpZ]}
          material={endPanelMaterial}
          renderMode={renderMode}
          furnitureId={furnitureId}
        />
      )}
      {/* 전면 프레임 (EP 앞면) — 바깥쪽으로 18mm 확장 */}
      {frontFrameWidth > 0 && (
        <BoxWithEdges
          isEndPanel={true}
          args={[frontFrameWidth, height, connectorDepthZ]}
          position={[frontFrameX, 0, depth / 2 - connectorDepthZ / 2]}
          material={endPanelMaterial}
          renderMode={renderMode}
          furnitureId={furnitureId}
        />
      )}
    </group>
  );
};

export default EndPanelWithTexture;