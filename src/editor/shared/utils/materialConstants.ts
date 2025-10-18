import * as THREE from 'three';

export type PanelGrainMap = { [panelName: string]: 'horizontal' | 'vertical' };

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
  if (!panelName) {
    return 'vertical';
  }

  // 백패널과 캐비넷 측판: vertical (L 방향) = 0도
  const isFurnitureSidePanel = !panelName.includes('서랍') &&
    (panelName.includes('측판') || panelName.includes('좌측') || panelName.includes('우측'));
  const isBackPanel = panelName.includes('백패널');

  if (isFurnitureSidePanel || isBackPanel) {
    return 'vertical'; // 0도
  }

  // 나머지 모든 패널 (상판, 하판, 선반, 서랍 마이다 등): horizontal (W 방향) = 0도
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

const normalizePanelNameForCompare = (name: string) => {
  return name
    .replace(/\s+/g, '')
    .replace(/[\(\)\[\]]/g, '')
    .replace(/상부/g, '상')
    .replace(/하부/g, '하')
    .replace(/좌측/g, '좌')
    .replace(/우측/g, '우')
    .replace(/왼쪽/g, '좌')
    .replace(/오른쪽/g, '우')
    .replace(/-/g, '')
    .toLowerCase();
};

const extractDoorInfo = (name: string) => {
  if (!name.includes('도어')) {
    return null;
  }

  const normalized = normalizePanelNameForCompare(name);
  const hasLeft = normalized.includes('좌');
  const hasRight = normalized.includes('우');
  const hasUpper = normalized.includes('상');
  const hasLower = normalized.includes('하');

  return {
    hasLeft,
    hasRight,
    hasUpper,
    hasLower
  };
};

export const resolvePanelGrainDirection = (
  panelName?: string,
  directions?: PanelGrainMap
): 'horizontal' | 'vertical' | undefined => {
  if (!panelName || !directions) {
    return undefined;
  }

  if (directions[panelName]) {
    return directions[panelName];
  }

  const entries = Object.entries(directions);

  const directInclude = entries.find(([key]) => panelName.includes(key) || key.includes(panelName));
  if (directInclude) {
    return directInclude[1];
  }

  const normalizedPanel = normalizePanelNameForCompare(panelName);
  const normalizedInclude = entries.find(([key]) => {
    const normalizedKey = normalizePanelNameForCompare(key);
    return normalizedPanel.includes(normalizedKey) || normalizedKey.includes(normalizedPanel);
  });
  if (normalizedInclude) {
    return normalizedInclude[1];
  }

  if (panelName.includes('도어')) {
    const panelDoorInfo = extractDoorInfo(panelName);
    for (const [key, value] of entries) {
      if (!key.includes('도어')) continue;
      const keyDoorInfo = extractDoorInfo(key);
      if (!panelDoorInfo || !keyDoorInfo) continue;

      if (panelDoorInfo.hasLeft !== keyDoorInfo.hasLeft && (panelDoorInfo.hasLeft || keyDoorInfo.hasLeft)) {
        continue;
      }
      if (panelDoorInfo.hasRight !== keyDoorInfo.hasRight && (panelDoorInfo.hasRight || keyDoorInfo.hasRight)) {
        continue;
      }
      if (panelDoorInfo.hasUpper && keyDoorInfo.hasLower) {
        continue;
      }
      if (panelDoorInfo.hasLower && keyDoorInfo.hasUpper) {
        continue;
      }
      return value;
    }
  }

  return undefined;
};
