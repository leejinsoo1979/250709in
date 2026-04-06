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

// 기본 이미지 텍스처 재질 설정 (메라톤, 한솔, 예림 등)
export const DEFAULT_IMAGE_TEXTURE_SETTINGS = {
  rgb: [0.35, 0.35, 0.35] as const, // 썸네일과 유사한 밝기로 조정
  toneMapped: true,
  envMapIntensity: 0.15,
  emissive: 0x000000,
  roughness: 0.75,
  metalness: 0.0
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
 * 기본 이미지 텍스처 재질 속성을 적용 (메라톤, 한솔, 예림 등)
 */
export const applyDefaultImageTextureSettings = (material: THREE.MeshStandardMaterial): void => {
  const settings = DEFAULT_IMAGE_TEXTURE_SETTINGS;
  material.color.setRGB(...settings.rgb);
  material.toneMapped = settings.toneMapped;
  material.envMapIntensity = settings.envMapIntensity;
  material.emissive.setHex(settings.emissive);
  material.roughness = settings.roughness;
  material.metalness = settings.metalness;
  material.needsUpdate = true;
};

/**
 * 패널 이름으로 기본 결 방향 판단 (단일 기준 — CNC 옵티마이저와 팝업 패널목록 공통)
 *
 * 규칙:
 * - VERTICAL (결이 높이 방향, L=Y축): 백패널, 측판, 칸막이, 도어, 서랍속장, 커튼박스, 목찬넬프레임수직, 좌우 분할판
 * - HORIZONTAL (결이 너비 방향, L=X축): 상판, 바닥, 선반, 분할판, 보강대, 마이다, 서랍 앞판·뒷판·측판, 목찬넬프레임수평
 *
 * 주의: 백패널은 MDF 무결이지만 2440방향 고정 → VERTICAL로 취급(회전 불가).
 *
 * @param panelName - 패널 이름
 * @returns 'horizontal' | 'vertical'
 */
export const getDefaultGrainDirection = (panelName?: string): 'horizontal' | 'vertical' => {
  if (!panelName) {
    return 'vertical';
  }

  // 백패널: MDF 무결이지만 무조건 높이(Y축)=Length 고정 → vertical (회전 불가)
  if (panelName.includes('백패널')) return 'vertical';

  // 서랍 바닥 (MDF): 폭(L)방향 고정, 회전 불가
  if (panelName.includes('바닥') && panelName.includes('서랍')) return 'horizontal';

  // ── 서랍 부품 ────────────────────────────────
  if (panelName.includes('마이다')) return 'horizontal'; // 서랍 손잡이판
  if (panelName.includes('서랍') && panelName.includes('앞판')) return 'horizontal';
  if (panelName.includes('서랍') && panelName.includes('뒷판')) return 'horizontal';
  if (panelName.includes('서랍') && (panelName.includes('좌측판') || panelName.includes('우측판'))) {
    return 'horizontal'; // 서랍 측판: L=깊이(Z축)
  }

  // 서랍속장 (날개벽) - 세로 방향
  if (panelName.includes('서랍속장')) return 'vertical';

  // ── 프레임류 ──────────────────────────────────
  if (panelName.includes('커튼박스')) return 'vertical';
  if (panelName.includes('목찬넬프레임수평')) return 'horizontal';
  if (panelName.includes('목찬넬프레임수직')) return 'vertical';

  // ── 가구 구조 패널 (세로 방향) ─────────────────
  if (panelName.includes('좌측') || panelName.includes('우측') || panelName.includes('측판')) {
    return 'vertical';
  }
  if (panelName.includes('칸막이')) return 'vertical';
  if (panelName.includes('좌우 분할판')) return 'vertical'; // horizontalSplit 분할판
  if (panelName.includes('도어') || panelName.includes('Door')) return 'vertical';

  // ── 가구 구조 패널 (가로 방향) ─────────────────
  if (panelName.includes('상판') || panelName.includes('바닥')) return 'horizontal';
  if (panelName.includes('선반')) return 'horizontal';
  if (panelName.includes('분할판')) return 'horizontal'; // areaSubSplit 수평 분할판
  if (panelName.includes('보강대')) return 'horizontal';

  // 기본값: horizontal (가로 결)
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
