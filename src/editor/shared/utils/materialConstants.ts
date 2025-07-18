import * as THREE from 'three';

/**
 * 재질 처리 관련 공통 상수
 */

// Cabinet Texture1 재질 설정
export const CABINET_TEXTURE1_SETTINGS = {
  name: 'cabinet texture1',
  rgb: [0.12, 0.12, 0.12] as const,
  toneMapped: false,
  envMapIntensity: 0.0,
  emissive: 0x000000,
  roughness: 0.8
} as const;

/**
 * Cabinet Texture1인지 확인
 */
export const isCabinetTexture1 = (textureUrl?: string): boolean => {
  return textureUrl?.toLowerCase().includes(CABINET_TEXTURE1_SETTINGS.name) ?? false;
};

/**
 * Cabinet Texture1 재질 속성을 적용
 */
export const applyCabinetTexture1Settings = (material: THREE.MeshStandardMaterial): void => {
  const settings = CABINET_TEXTURE1_SETTINGS;
  material.color.setRGB(...settings.rgb);
  material.toneMapped = settings.toneMapped;
  material.envMapIntensity = settings.envMapIntensity;
  material.emissive.setHex(settings.emissive);
  material.roughness = settings.roughness;
  material.needsUpdate = true;
}; 