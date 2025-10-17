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

// Oak 재질 설정
export const OAK_TEXTURE_SETTINGS = {
  name: 'oak',
  rgb: [0.6, 0.5, 0.4] as const, // 나무결이 잘 보이도록 어둡게
  toneMapped: true,
  envMapIntensity: 0.2,
  emissive: 0x000000,
  roughness: 0.7,
  metalness: 0.0
} as const;

/**
 * Cabinet Texture1인지 확인
 */
export const isCabinetTexture1 = (textureUrl?: string): boolean => {
  return textureUrl?.toLowerCase().includes(CABINET_TEXTURE1_SETTINGS.name) ?? false;
};

/**
 * Oak 텍스처인지 확인
 */
export const isOakTexture = (textureUrl?: string): boolean => {
  return textureUrl?.toLowerCase().includes(OAK_TEXTURE_SETTINGS.name) ?? false;
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

/**
 * 패널 이름으로 기본 결 방향 판단
 * @param panelName - 패널 이름
 * @returns 'horizontal' | 'vertical'
 */
export const getDefaultGrainDirection = (panelName?: string): 'horizontal' | 'vertical' => {
  if (!panelName) return 'horizontal';

  const name = panelName.toLowerCase();

  // 세로 결이 필요한 패널들: 측판, 백패널, 도어
  if (name.includes('측판') ||
      name.includes('side') ||
      name.includes('백패널') ||
      name.includes('back') ||
      name.includes('뒷판') ||
      name.includes('도어') ||
      name.includes('door')) {
    return 'vertical';
  }

  // 나머지는 기본적으로 가로 결
  return 'horizontal';
};

/**
 * Oak 재질 속성을 적용
 * @param material - 적용할 재질
 * @param rotateTexture - 텍스처를 90도 회전할지 여부 (기본: true, 가로 결 방향)
 */
export const applyOakTextureSettings = (
  material: THREE.MeshStandardMaterial,
  rotateTexture: boolean = true
): void => {
  const settings = OAK_TEXTURE_SETTINGS;
  material.color.setRGB(...settings.rgb);
  material.toneMapped = settings.toneMapped;
  material.envMapIntensity = settings.envMapIntensity;
  material.emissive.setHex(settings.emissive);
  material.roughness = settings.roughness;
  material.metalness = settings.metalness;

  // Oak 텍스처 회전 설정 (기본: 가로 결 방향)
  if (material.map && rotateTexture) {
    material.map.rotation = Math.PI / 2; // 90도 회전
    material.map.center.set(0.5, 0.5); // 중심점 기준 회전
  }

  material.needsUpdate = true;
}; 