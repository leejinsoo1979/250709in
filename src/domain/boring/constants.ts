/**
 * 보링 데이터 기본 설정값
 * Blum CLIP top BLUMOTION / Full Overlay / 나사고정 / 캠락 Ø15mm 기준
 */

import type {
  BlumClipTopSettings,
  CamLockSettings,
  ShelfPinSettings,
  AdjustableFootSettings,
  DrawerRailSettings,
  BoringSettings,
  CSVExportSettings,
  DXFExportSettings,
  MPRExportSettings,
  CIXExportSettings,
} from './types';

// ============================================
// 32mm 시스템 상수
// ============================================

export const SYSTEM_32MM = {
  PITCH: 32,           // 기본 피치 (mm)
  START_OFFSET: 37,    // 시작 오프셋 (mm)
  HALF_PITCH: 16,      // 반 피치 (mm)
} as const;

// ============================================
// Blum CLIP top BLUMOTION 힌지 기본 설정
// ============================================

export const DEFAULT_HINGE_SETTINGS: BlumClipTopSettings = {
  // 컵홀 설정
  cupDiameter: 35,
  cupDepth: 13,
  cupEdgeDistance: 3,

  // 마운팅 플레이트 나사홀 설정
  screwDiameter: 2.5,
  screwDepth: 12,
  screwHoleSpacing: 32,
  screwRowDistance: 37,

  // 힌지 위치 설정
  topBottomMargin: 100,

  // 문 높이별 힌지 개수 기준
  minDoorHeightFor3Hinges: 1400,
  minDoorHeightFor4Hinges: 2000,
  minDoorHeightFor5Hinges: 2600,
};

// ============================================
// 캠락 기본 설정 (Ø15mm)
// ============================================

export const DEFAULT_CAM_LOCK_SETTINGS: CamLockSettings = {
  housingDiameter: 15,
  housingDepth: 12,
  boltDiameter: 5,
  boltDepth: 34,
  boltEdgeDistance: 8,
  edgeDistance: 37,
  positions: [37, 69],
};

// ============================================
// 선반핀 기본 설정
// ============================================

export const DEFAULT_SHELF_PIN_SETTINGS: ShelfPinSettings = {
  diameter: 5,
  depth: 12,
  pitch: 32,
  startHeight: 37,
  endMargin: 37,
  frontRowPosition: 37,
  backRowPosition: 37,
  rowCount: 2,
};

// ============================================
// 조절발 기본 설정
// ============================================

export const DEFAULT_ADJUSTABLE_FOOT_SETTINGS: AdjustableFootSettings = {
  diameter: 10,
  depth: 15,
  insetFromEdge: 50,
  count: 4,
};

// ============================================
// Blum 서랍 레일 설정
// ============================================

export const DRAWER_RAIL_SETTINGS: Record<string, DrawerRailSettings> = {
  tandem: {
    type: 'tandem',
    frontHoleDiameter: 5,
    frontHoleDepth: 12,
    frontHoleDistance: 37,
    rearHoleType: 'slot',
    rearHoleDiameter: 5,
    rearHoleDepth: 12,
    rearHoleDistance: 69,
    slotWidth: 10,
    slotHeight: 5,
  },
  movento: {
    type: 'movento',
    frontHoleDiameter: 5,
    frontHoleDepth: 12,
    frontHoleDistance: 37,
    rearHoleType: 'slot',
    rearHoleDiameter: 5,
    rearHoleDepth: 12,
    rearHoleDistance: 69,
    slotWidth: 10,
    slotHeight: 5,
  },
  legrabox: {
    type: 'legrabox',
    frontHoleDiameter: 5,
    frontHoleDepth: 12,
    frontHoleDistance: 37,
    rearHoleType: 'round',
    rearHoleDiameter: 5,
    rearHoleDepth: 12,
    rearHoleDistance: 69,
  },
  metabox: {
    type: 'metabox',
    frontHoleDiameter: 3.5,
    frontHoleDepth: 12,
    frontHoleDistance: 37,
    rearHoleType: 'round',
    rearHoleDiameter: 3.5,
    rearHoleDepth: 12,
    rearHoleDistance: 69,
  },
};

export const DEFAULT_DRAWER_RAIL_SETTINGS: DrawerRailSettings = DRAWER_RAIL_SETTINGS.tandem;

// ============================================
// 내보내기 기본 설정
// ============================================

export const DEFAULT_CSV_EXPORT_SETTINGS: CSVExportSettings = {
  format: 'csv',
  filePerPanel: true,
  includeDimensions: true,
  separateMirrored: false,
  compressToZip: false,
  delimiter: ',',
  includeHeader: true,
  encoding: 'utf-8',
};

export const DEFAULT_DXF_EXPORT_SETTINGS: DXFExportSettings = {
  format: 'dxf',
  filePerPanel: true,
  includeDimensions: true,
  separateMirrored: false,
  compressToZip: false,
  version: 'AC1015',
  usePolylineForSlots: true,
  layerColors: {
    '0_OUTLINE': 7,        // White
    '1_HINGE_CUP': 1,      // Red
    '2_HINGE_SCREW': 1,    // Red
    '3_CAM_HOUSING': 5,    // Blue
    '4_CAM_BOLT': 5,       // Blue
    '5_SHELF_PIN': 2,      // Yellow
    '6_DRAWER_RAIL': 3,    // Green
    '7_ADJUSTABLE_FOOT': 7, // White
    '8_DIMENSIONS': 4,     // Cyan
    '9_LABELS': 6,         // Magenta
  },
};

export const DEFAULT_MPR_EXPORT_SETTINGS: MPRExportSettings = {
  format: 'mpr',
  filePerPanel: true,
  includeDimensions: false,
  separateMirrored: true,
  compressToZip: false,
  version: '4.0',
  toolMapping: {
    hingeCup: 1,
    hingeScrew: 2,
    camHousing: 3,
    camBolt: 4,
    shelfPin: 4,
    drawerRail: 4,
    adjustableFoot: 5,
  },
  useAbsoluteCoordinates: true,
  includeComments: true,
};

export const DEFAULT_CIX_EXPORT_SETTINGS: CIXExportSettings = {
  format: 'cix',
  filePerPanel: true,
  includeDimensions: false,
  separateMirrored: true,
  compressToZip: false,
  version: '4.0',
  toolMapping: {
    hingeCup: 1,
    hingeScrew: 2,
    camHousing: 3,
    camBolt: 4,
    shelfPin: 4,
    drawerRail: 4,
    adjustableFoot: 5,
  },
  machineParams: {
    spindleSpeed: 6000,
    feedRate: 3,
  },
  includeComments: true,
};

// ============================================
// 전체 기본 설정
// ============================================

export const DEFAULT_BORING_SETTINGS: BoringSettings = {
  hinge: DEFAULT_HINGE_SETTINGS,
  camLock: DEFAULT_CAM_LOCK_SETTINGS,
  shelfPin: DEFAULT_SHELF_PIN_SETTINGS,
  adjustableFoot: DEFAULT_ADJUSTABLE_FOOT_SETTINGS,
  drawerRail: DEFAULT_DRAWER_RAIL_SETTINGS,
  systemPitch: SYSTEM_32MM.PITCH,
  startOffset: SYSTEM_32MM.START_OFFSET,
  export: DEFAULT_CSV_EXPORT_SETTINGS,
};

// ============================================
// DXF 레이어 정보
// ============================================

export const DXF_LAYERS = {
  OUTLINE: '0_OUTLINE',
  HINGE_CUP: '1_HINGE_CUP',
  HINGE_SCREW: '2_HINGE_SCREW',
  CAM_HOUSING: '3_CAM_HOUSING',
  CAM_BOLT: '4_CAM_BOLT',
  SHELF_PIN: '5_SHELF_PIN',
  DRAWER_RAIL: '6_DRAWER_RAIL',
  ADJUSTABLE_FOOT: '7_ADJUSTABLE_FOOT',
  DIMENSIONS: '8_DIMENSIONS',
  LABELS: '9_LABELS',
} as const;

// ============================================
// 보링 타입별 기본 직경
// ============================================

export const BORING_DIAMETERS = {
  'hinge-cup': 35,
  'hinge-screw': 2.5,
  'cam-housing': 15,
  'cam-bolt': 5,
  'shelf-pin': 5,
  'adjustable-foot': 10,
  'drawer-rail': 5,
  'drawer-rail-slot': 5,
  'custom': 5,
} as const;

// ============================================
// 보링 타입별 기본 깊이
// ============================================

export const BORING_DEPTHS = {
  'hinge-cup': 13,
  'hinge-screw': 12,
  'cam-housing': 12,
  'cam-bolt': 34,
  'shelf-pin': 12,
  'adjustable-foot': 15,
  'drawer-rail': 12,
  'drawer-rail-slot': 12,
  'custom': 10,
} as const;

// ============================================
// 보링 타입별 DXF 레이어 매핑
// ============================================

export const BORING_TYPE_TO_LAYER = {
  'hinge-cup': DXF_LAYERS.HINGE_CUP,
  'hinge-screw': DXF_LAYERS.HINGE_SCREW,
  'cam-housing': DXF_LAYERS.CAM_HOUSING,
  'cam-bolt': DXF_LAYERS.CAM_BOLT,
  'shelf-pin': DXF_LAYERS.SHELF_PIN,
  'adjustable-foot': DXF_LAYERS.ADJUSTABLE_FOOT,
  'drawer-rail': DXF_LAYERS.DRAWER_RAIL,
  'drawer-rail-slot': DXF_LAYERS.DRAWER_RAIL,
  'custom': DXF_LAYERS.LABELS,
} as const;
