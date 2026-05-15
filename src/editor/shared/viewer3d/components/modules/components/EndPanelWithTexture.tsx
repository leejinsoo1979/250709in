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
  
  // L자 분절 여부: 사용자가 EP 두께값을 기본 보드 두께(18mm)보다 크게 늘렸을 때만 적용
  //   기본값(18 또는 18.5)에서는 분절 없이 단일 보드로 렌더링
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

  // ㄷ자 EP: 사용자가 EP 두께값을 18 초과로 늘렸을 때만 적용 (키큰장 찬넬과 동일 구조)
  //   패널은 규격 18mm으로 두께 고정.
  //   - 측면 ep (바깥): 18 × (depth-18), EP 그룹 바깥쪽 끝
  //   - 측면 ep (안쪽): 18 × (depth-18), EP 그룹 안쪽 끝 (가구 본체 라인)
  //   - 전면 ep: 입력값 × 18, 양 측면 ep 앞쪽 잘린 자리까지 모두 덮음
  //
  // 평면도(top view, 우측 EP, 입력 51mm):
  //                                  ┌─────┐
  //                                  │측면 │ 18 × (depth-18) — 바깥
  //                                  │  ep │
  //   가구내경 ┤    전면 ep (51 × 18)            │
  //           ├─────┐                          │
  //           │측면 │ 18 × (depth-18) — 안쪽
  //           │  ep │
  //           └─────┘
  // 인접 가구가 있으면 바깥쪽 측면 ep 생략 → 전면 ep + 안쪽 측면 ep만 렌더링.
  const boardThickness = 18 * 0.01;     // 규격 보드 두께 18mm → Three.js 단위
  const frontEpDepthZ = boardThickness; // 전면 ep Z 두께 = 18mm
  const totalWidth = width;             // 사용자 입력 EP 두께값 = 전체 X 공간
  const sideEpWidth = boardThickness;   // 측면 ep X 폭: 18mm 고정
  const frontEpWidth = totalWidth;      // 전면 ep X 폭: 입력값 전체
  const showOuterSidePanel = !adjacentFurniture; // 인접 가구 없으면 바깥쪽 측면 ep 표시

  // 좌측 EP: 부모 좌표에서 가구 본체는 +X 쪽, 바깥은 -X 쪽 → outward=-1
  // 우측 EP: 가구 본체는 -X 쪽, 바깥은 +X 쪽 → outward=+1
  const outward = side === 'left' ? -1 : 1;
  // 바깥쪽 측면 ep X 중심: EP 그룹 바깥쪽 끝
  const outerSideEpX = outward * (totalWidth / 2 - sideEpWidth / 2);
  // 안쪽 측면 ep X 중심: EP 그룹 안쪽 끝 (가구 본체 라인 쪽)
  const innerSideEpX = -outward * (totalWidth / 2 - sideEpWidth / 2);
  // 전면 ep X 중심: EP 그룹 중심 (입력값 전체 폭이므로 0)
  const frontEpX = 0;
  // 측면 ep Z 깊이: 앞쪽 18mm 잘림 (전면 ep가 덮음)
  const sideEpDepth = Math.max(0, depth - boardThickness);
  // 측면 ep Z 중심: 잘린 만큼 뒤로 이동
  const sideEpZ = -boardThickness / 2;
  // 전면 ep Z 중심: EP 그룹 앞면(=depth/2) 안쪽에 위치
  const frontEpZ = depth / 2 - frontEpDepthZ / 2;

  return (
    <group position={position}>
      {/* 바깥쪽 측면 ep — 인접 가구 없을 때만 */}
      {showOuterSidePanel && sideEpDepth > 0 && (
        <BoxWithEdges
          isEndPanel={true}
          args={[sideEpWidth, height, sideEpDepth]}
          position={[outerSideEpX, 0, sideEpZ]}
          material={endPanelMaterial}
          renderMode={renderMode}
          furnitureId={furnitureId}
        />
      )}
      {/* 안쪽 측면 ep — 가구 본체 라인 쪽 (키큰장 찬넬과 동일 구조) */}
      {sideEpDepth > 0 && (
        <BoxWithEdges
          isEndPanel={true}
          args={[sideEpWidth, height, sideEpDepth]}
          position={[innerSideEpX, 0, sideEpZ]}
          material={endPanelMaterial}
          renderMode={renderMode}
          furnitureId={furnitureId}
        />
      )}
      {/* 전면 ep — 양 측면 ep 앞쪽 잘린 자리까지 모두 덮음 */}
      {frontEpWidth > 0 && (
        <BoxWithEdges
          isEndPanel={true}
          args={[frontEpWidth, height, frontEpDepthZ]}
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