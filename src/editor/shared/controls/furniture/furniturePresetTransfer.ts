import type { PlacedModule } from '@/editor/shared/furniture/types';
import {
  findDoorHingeGeometry,
  type DoorHingeGeometryField
} from '@/editor/shared/utils/doorHingeGeometryRegistry';

export type FurniturePresetCategory = 'full' | 'upper' | 'lower';

export interface FurniturePresetGroup {
  id: string;
  label: string;
  fields: string[];
}

// 같은 카테고리(full/upper/lower)끼리만 프리셋 주입 허용.
//   - 가구 폭/슬롯/위치 등 가구별로 달라야 할 필드는 제외.
//   - 그룹별로 묶어서 사용자가 체크박스로 선택해 주입.
export const FURNITURE_PRESET_FIELD_GROUPS: FurniturePresetGroup[] = [
  {
    id: 'depth',
    label: '깊이 (가구 깊이, 상/하부 깊이, 앞고정/뒤고정)',
    fields: [
      'customDepth', 'freeDepth',
      'lowerSectionDepth', 'upperSectionDepth',
      'lowerSectionDepthDirection', 'upperSectionDepthDirection',
      'sectionDepths', 'sectionDepthDirections',
    ],
  },
  {
    id: 'door',
    label: '도어 설정 (갭, 확장량, 경첩, 도어 분할/확장)',
    fields: [
      'hasDoor',
      'doorTopGap', 'doorBottomGap',
      'upperDoorTopGap', 'upperDoorBottomGap',
      'lowerDoorTopGap', 'lowerDoorBottomGap',
      'doorWidthAdjustEnabled', 'doorWidthAdjustMm',
      'hingePosition', 'hingeType',
      'cornerFrontHingePosition', 'cornerSideHingePosition',
      'hingePositionsMm', 'upperDoorHingePositionsMm', 'lowerDoorHingePositionsMm',
      'doorSettingMode', 'doorOverlayLeft', 'doorOverlayRight', 'doorOverlayTop', 'doorOverlayBottom',
      'doorSplit',
    ],
  },
  {
    id: 'drawer',
    label: '마이다 / 서랍 (개별 높이, 레그라 종류)',
    fields: [
      'maidaWidthAdjustEnabled', 'maidaWidthAdjustMm',
      'customMaidaHeights',
      'legraDrawerTypes',
      'glassDrawerOffsetMm',
    ],
  },
  {
    id: 'topBottom',
    label: '높이 / 상부몰딩 / 걸레받이 (사이즈, 옵셋, 갭, 띄움)',
    fields: [
      'freeHeight', 'customHeight',
      'hasTopFrame', 'topFrameThickness', 'topFrameOffset', 'topFrameGap',
      'hasBase', 'hasBottomFrame', 'baseFrameHeight', 'baseFrameOffset', 'baseFrameGap',
      'hasTopEndPanel', 'topEndPanelOffset', 'topEndPanelBackOffset',
      'topEndPanelBackLip', 'topEndPanelBackLipThickness',
      'hasBottomEndPanel', 'bottomEndPanelOffset', 'bottomEndPanelBackOffset',
      'individualFloatHeight',
      'cabinetBodyHeight',
    ],
  },
  {
    id: 'backPanel',
    label: '백패널 (두께, 갭 백패널, 뒷벽 이격)',
    fields: [
      'backPanelThickness',
      'hasBackPanel', 'hasGapBackPanel',
      'backWallGap',
    ],
  },
  {
    id: 'endPanel',
    label: '엔드패널 (좌/우 EP, 두께, 깊이, 옵셋, 높이 모드)',
    fields: [
      'hasLeftEndPanel', 'hasRightEndPanel',
      'endPanelThickness', 'endPanelDepth', 'endPanelDepthDirection',
      'endPanelOffset',
      'leftEndPanelOffset', 'rightEndPanelOffset',
      'leftEndPanelBackOffset', 'rightEndPanelBackOffset',
      'endPanelHeightMode', 'endPanelTopOffset', 'endPanelBottomOffset',
    ],
  },
  {
    id: 'shelfRod',
    label: '섹션 / 선반 / 내부 구성 (섹션 높이, 선반 갯수, 내부 구성)',
    fields: [
      'customConfig', 'customSections',
      'lowerSectionTopOffset', 'sectionTopOffsets',
      'lowerSectionWidth', 'upperSectionWidth',
      'lowerSectionWidthDirection', 'upperSectionWidthDirection',
      'lowerLeftSectionDepth', 'lowerRightSectionDepth',
    ],
  },
  {
    id: 'rodShelf',
    label: '옷봉선반 옵션 (안전선반 제거, 상부 선반 갭)',
    fields: [
      'removeUpperSafetyShelf',
      'upperShelfTopGap',
      'insertFrontInsetMm',
    ],
  },
  {
    id: 'topNotch',
    label: '상판 따내기 / 상판설치 (인조대리석)',
    fields: [
      'topPanelNotchSize', 'topPanelNotchSide',
      'stoneTopMaterial', 'stoneTopThickness',
      'stoneTopFrontOffset', 'stoneTopBackOffset', 'stoneTopLeftOffset', 'stoneTopRightOffset',
      'stoneTopBackLip', 'stoneTopBackLipThickness',
      'stoneTopBackLipDepthOffset', 'stoneTopBackLipTopOffset', 'stoneTopBackLipTopBackOffset',
      'stoneTopBackLipFullFill', 'stoneTopBackLipFillHeight',
    ],
  },
  {
    id: 'materialColor',
    label: '재질 / 색상 (속장/도어/엣지/결방향)',
    fields: [
      'doorColor', 'doorTextureUrl', 'doorMaterial',
      'bodyColor', 'bodyTextureUrl', 'bodyMaterial',
      'interiorEdgeColor', 'doorEdgeColor', 'doorEdgeBandingWidthMm',
      'panelGrainDirections',
      'panelExclusions',
    ],
  },
];

export const getFurniturePresetCategory = (
  m: PlacedModule | undefined,
  fallbackCategory?: string,
): FurniturePresetCategory | null => {
  if (!m) return null;
  const id = m.moduleId || '';
  if (fallbackCategory === 'upper' || id.includes('upper')) return 'upper';
  if (fallbackCategory === 'lower' || id.includes('lower')) return 'lower';
  if (fallbackCategory === 'full' || id.startsWith('dual-') || id.startsWith('single-') || id.includes('full')) return 'full';
  return 'full';
};

export const getFurniturePresetCategoryLabel = (category: FurniturePresetCategory | null): string => (
  category === 'full' ? '키큰장' : category === 'upper' ? '상부장' : category === 'lower' ? '하부장' : ''
);

const isLowerDrawer2Tier = (moduleId?: string): boolean => {
  const id = moduleId || '';
  return id.includes('lower-drawer-2tier') || id.includes('dual-lower-drawer-2tier');
};

export const clonePresetValue = <T,>(value: T): T => {
  if (value === undefined || value === null) return value;
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  if (typeof value === 'object') {
    return JSON.parse(JSON.stringify(value));
  }
  return value;
};

// 그룹별로 현재 가구에 적용 가능한지 판단 (가구 종류 기반).
//   - 프리셋에 해당 필드가 없어도 가구가 이 옵션을 가질 수 있으면 표시 (적용 가능).
//   - 저장 시점에 사용자가 어떤 값이든 변경했을 수 있으므로 너무 엄격하게 판단하면 안 됨.
export const isFurniturePresetGroupApplicable = (
  groupId: string,
  _presetProps: Record<string, any> | undefined,
  targetModule: PlacedModule,
  category: FurniturePresetCategory | null,
): boolean => {
  const id = (targetModule.moduleId || '').toLowerCase();
  const mod = targetModule as any;

  switch (groupId) {
    case 'depth':
      return !id.includes('insert-frame');
    case 'door': {
      // 도어 가질 수 있는 가구만 (insert-frame 같은 채움재는 제외)
      if (id.includes('insert-frame')) return false;
      return mod.hasDoor !== false; // hasDoor가 명시적 false가 아니면 표시
    }
    case 'drawer': {
      // 마이다/서랍 가구만
      return /lower-drawer-|lower-induction-cabinet-|lower-door-lift-touch|lower-top-down-touch/.test(id);
    }
    case 'topBottom': {
      // 상부장도 높이(freeHeight/customHeight)는 이식 대상이다.
      // 상부몰딩/걸레받이 필드는 값이 있는 경우에만 함께 전달된다.
      return true;
    }
    case 'backPanel':
      // 거의 모든 가구가 가짐
      return !id.includes('insert-frame');
    case 'endPanel':
      // 자유배치이거나 EP 옵션이 있는 가구 (사실상 모든 가구)
      return !id.includes('insert-frame');
    case 'shelfRod': {
      // 섹션 높이/선반 갯수는 저장 전에는 필드가 없어도 이식 대상이 될 수 있다.
      return !id.includes('insert-frame');
    }
    case 'rodShelf': {
      // 옷봉/선반 있는 가구 (코트장, 붙박이장 시리즈, 키큰장 일부) — 상부 안전선반 옵션
      // 너무 엄격하지 않게: 상부장 제외하고 표시
      return category !== 'upper' && !id.includes('insert-frame');
    }
    case 'topNotch': {
      // 상부장 코너 노치, 하부장 상판설치
      return category === 'upper' || category === 'lower';
    }
    case 'materialColor':
      // 모든 가구
      return true;
    default:
      return false;
  }
};

export const getApplicableFurniturePresetGroups = (
  presetProps: Record<string, any> | undefined,
  targetModule: PlacedModule,
  category: FurniturePresetCategory | null,
): FurniturePresetGroup[] => (
  FURNITURE_PRESET_FIELD_GROUPS.filter(g =>
    isFurniturePresetGroupApplicable(g.id, presetProps, targetModule, category)
  )
);

const HINGE_POSITION_FIELDS: DoorHingeGeometryField[] = [
  'hingePositionsMm',
  'upperDoorHingePositionsMm',
  'lowerDoorHingePositionsMm',
];

export const collectFurniturePresetProps = (placedModule: PlacedModule): Record<string, any> => {
  const allFields = FURNITURE_PRESET_FIELD_GROUPS.flatMap(g => g.fields);
  const props: Record<string, any> = {};
  const mod = placedModule as any;
  for (const f of allFields) {
    if (mod[f] !== undefined) props[f] = clonePresetValue(mod[f]);
  }
  // 경첩 상/하 좌표: 사용자가 직접 수정하지 않으면 store에 없으므로(기본값은 뷰어만 계산)
  // 뷰어가 실제 표시 중인 경첩 지오메트리를 측판 좌표로 변환해 함께 저장한다.
  for (const field of HINGE_POSITION_FIELDS) {
    if (props[field] !== undefined) continue;
    const geometry = findDoorHingeGeometry(placedModule.id, field);
    if (!geometry || geometry.doorPositionsMm.length === 0) continue;
    props[field] = geometry.doorPositionsMm.map(positionMm =>
      Math.round((geometry.doorBottomOnSideMm + positionMm) * 1000) / 1000
    );
  }
  return props;
};

export const buildFurniturePresetUpdates = (
  presetProps: Record<string, any>,
  selectedGroups: string[],
  placedModule: PlacedModule,
): Record<string, any> => {
  const allowedFields = new Set(
    FURNITURE_PRESET_FIELD_GROUPS
      .filter(g => selectedGroups.includes(g.id))
      .flatMap(g => g.fields)
  );
  const updates: Record<string, any> = {};
  for (const [k, v] of Object.entries(presetProps)) {
    if (allowedFields.has(k)) updates[k] = clonePresetValue(v);
  }
  const injectedHeight = typeof updates.freeHeight === 'number'
    ? updates.freeHeight
    : typeof updates.customHeight === 'number'
      ? updates.customHeight
      : typeof updates.cabinetBodyHeight === 'number'
        ? updates.cabinetBodyHeight
        : undefined;
  if (injectedHeight !== undefined) {
    if (isLowerDrawer2Tier(placedModule.moduleId)) {
      updates.cabinetBodyHeight = injectedHeight;
      updates.freeHeight = injectedHeight;
    } else if (updates.cabinetBodyHeight !== undefined && updates.freeHeight === undefined && updates.customHeight === undefined) {
      updates.freeHeight = injectedHeight;
    }
  }
  return updates;
};
