/**
 * 보링 데이터 타입 정의
 * Blum CLIP top BLUMOTION / Full Overlay / 나사고정 / 캠락 Ø15mm 기준
 */

// ============================================
// 기본 타입
// ============================================

/**
 * 보링 타입
 */
export type BoringType =
  | 'hinge-cup'        // 힌지 컵홀 Ø35mm
  | 'hinge-screw'      // 힌지 마운팅 나사홀 Ø2.5mm
  | 'cam-housing'      // 캠 하우징 Ø15mm
  | 'cam-bolt'         // 캠 볼트홀 Ø5mm
  | 'shelf-pin'        // 선반핀홀 Ø5mm
  | 'adjustable-foot'  // 조절발 Ø10mm
  | 'drawer-rail'      // 서랍레일 원형홀
  | 'drawer-rail-slot' // 서랍레일 장공 (TANDEM/MOVENTO)
  | 'custom';          // 사용자 정의

/**
 * 보링 가공면
 */
export type BoringFace =
  | 'top'      // 상면
  | 'bottom'   // 하면
  | 'front'    // 전면
  | 'back'     // 후면
  | 'left'     // 좌측면
  | 'right';   // 우측면

/**
 * 패널 타입
 */
export type PanelType =
  | 'side-left'    // 좌측판
  | 'side-right'   // 우측판
  | 'top'          // 상판
  | 'bottom'       // 하판
  | 'shelf'        // 선반
  | 'door'         // 도어
  | 'drawer-front' // 서랍 전판
  | 'back-panel'   // 백패널
  | 'partition';   // 칸막이

/**
 * 서랍 레일 타입 (Blum)
 */
export type DrawerRailType = 'tandem' | 'movento' | 'legrabox' | 'metabox';

/**
 * 가구 타입
 */
export type CabinetType =
  | 'lower'      // 하부장
  | 'upper'      // 상부장
  | 'drawer'     // 서랍장
  | 'tall';      // 장신장

// ============================================
// 보링 데이터
// ============================================

/**
 * 단일 보링 데이터
 */
export interface Boring {
  id: string;
  type: BoringType;
  face: BoringFace;
  x: number;           // X 위치 (mm)
  y: number;           // Y 위치 (mm)
  diameter: number;    // 직경 (mm)
  depth: number;       // 깊이 (mm)
  slotWidth?: number;  // 장공 가로 (mm) - drawer-rail-slot용
  slotHeight?: number; // 장공 세로 (mm) - drawer-rail-slot용
  angle?: number;      // 각도 (기본 90도)
  toolNumber?: number; // 공구 번호
  note?: string;       // 비고
}

/**
 * 패널 보링 데이터
 */
export interface PanelBoringData {
  panelId: string;
  furnitureId: string;
  furnitureName: string;
  panelType: PanelType;
  panelName: string;
  width: number;       // 패널 너비 (mm)
  height: number;      // 패널 높이 (mm)
  thickness: number;   // 패널 두께 (mm)
  material: string;    // 재질
  grain: 'H' | 'V' | 'N';  // 결방향 (H=가로, V=세로, N=없음)
  borings: Boring[];
  isMirrored?: boolean;    // 미러링 여부
  mirrorSourceId?: string; // 미러링 원본 ID
}

// ============================================
// 하드웨어 설정
// ============================================

/**
 * Blum CLIP top BLUMOTION 힌지 설정
 */
export interface BlumClipTopSettings {
  // 컵홀 설정
  cupDiameter: number;        // 컵홀 직경 (35mm)
  cupDepth: number;           // 컵홀 깊이 (13mm)
  cupEdgeDistance: number;    // 도어 가장자리에서 컵 중심까지 (3mm)

  // 마운팅 플레이트 나사홀 설정
  screwDiameter: number;      // 나사홀 직경 (2.5mm)
  screwDepth: number;         // 나사홀 깊이 (12mm)
  screwHoleSpacing: number;   // 나사홀 간격 (32mm, 32mm 시스템)
  screwRowDistance: number;   // 전면에서 나사열까지 거리 (37mm)

  // 힌지 위치 설정
  topBottomMargin: number;    // 상/하단 마진 (100mm)

  // 문 높이별 힌지 개수 기준
  minDoorHeightFor3Hinges: number;  // 3개 힌지 최소 높이 (1400mm)
  minDoorHeightFor4Hinges: number;  // 4개 힌지 최소 높이 (2000mm)
  minDoorHeightFor5Hinges: number;  // 5개 힌지 최소 높이 (2600mm)
}

/**
 * 캠락 설정
 */
export interface CamLockSettings {
  housingDiameter: number;    // 캠 하우징 직경 (15mm)
  housingDepth: number;       // 캠 하우징 깊이 (12mm)
  boltDiameter: number;       // 캠 볼트홀 직경 (5mm)
  boltDepth: number;          // 캠 볼트홀 깊이 (34mm)
  boltEdgeDistance: number;   // 측면에서 볼트홀 중심까지 (8mm)
  edgeDistance: number;       // 패널 가장자리에서 중심까지 (37mm, 69mm)
  positions: number[];        // 캠 하우징 Y 위치들 [37, 69] 등
}

/**
 * 선반핀 설정
 */
export interface ShelfPinSettings {
  diameter: number;           // 선반핀홀 직경 (5mm)
  depth: number;              // 선반핀홀 깊이 (12mm)
  pitch: number;              // 홀 간격 (32mm)
  startHeight: number;        // 시작 높이 (37mm)
  endMargin: number;          // 상단 마진 (37mm)
  frontRowPosition: number;   // 전면열 위치 (37mm)
  backRowPosition: number;    // 후면열 위치 (패널 깊이에서 뺀 값)
  rowCount: 2 | 4;            // 열 개수 (2열 또는 4열)
}

/**
 * 조절발 설정
 */
export interface AdjustableFootSettings {
  diameter: number;           // 조절발홀 직경 (10mm)
  depth: number;              // 조절발홀 깊이 (15mm)
  insetFromEdge: number;      // 가장자리에서 안쪽으로 (50mm)
  count: 4 | 6;               // 개수 (4개 또는 6개)
}

/**
 * 서랍레일 설정 (Blum)
 */
export interface DrawerRailSettings {
  type: DrawerRailType;
  // 공통 설정
  frontHoleDiameter: number;      // 전면 홀 직경 (5mm)
  frontHoleDepth: number;         // 전면 홀 깊이 (12mm)
  frontHoleDistance: number;      // 전면에서 거리 (37mm)

  // 타입별 설정
  rearHoleType: 'round' | 'slot'; // 후면 홀 타입
  rearHoleDiameter: number;       // 후면 홀 직경
  rearHoleDepth: number;          // 후면 홀 깊이
  rearHoleDistance: number;       // 전면에서 후면홀까지 거리 (69mm)

  // 장공 설정 (TANDEM/MOVENTO)
  slotWidth?: number;             // 장공 가로 (10mm)
  slotHeight?: number;            // 장공 세로 (5mm)
}

// ============================================
// 내보내기 설정
// ============================================

/**
 * 내보내기 형식
 */
export type ExportFormat = 'csv' | 'dxf' | 'mpr' | 'cix';

/**
 * 기본 내보내기 설정
 */
export interface BaseExportSettings {
  format: ExportFormat;
  filePerPanel: boolean;      // 패널당 개별 파일
  includeDimensions: boolean; // 치수 포함
  separateMirrored: boolean;  // 미러링 패널 구분
  compressToZip: boolean;     // ZIP 압축
}

/**
 * CSV 내보내기 설정
 */
export interface CSVExportSettings extends BaseExportSettings {
  format: 'csv';
  delimiter: ',' | ';' | '\t';
  includeHeader: boolean;
  encoding: 'utf-8' | 'euc-kr';
}

/**
 * DXF 내보내기 설정
 */
export interface DXFExportSettings extends BaseExportSettings {
  format: 'dxf';
  version: 'AC1015' | 'AC1018' | 'AC1021'; // AutoCAD 버전
  usePolylineForSlots: boolean;            // 장공에 LWPOLYLINE 사용
  layerColors: Record<string, number>;     // 레이어별 색상
}

/**
 * MPR 내보내기 설정 (HOMAG woodWOP)
 */
export interface MPRExportSettings extends BaseExportSettings {
  format: 'mpr';
  version: '4.0' | '5.0';
  toolMapping: {
    hingeCup: number;
    hingeScrew: number;
    camHousing: number;
    camBolt: number;
    shelfPin: number;
    drawerRail: number;
    adjustableFoot: number;
  };
  useAbsoluteCoordinates: boolean;
  includeComments: boolean;
}

/**
 * CIX 내보내기 설정 (Biesse bSolid)
 */
export interface CIXExportSettings extends BaseExportSettings {
  format: 'cix';
  version: '3.0' | '4.0' | '5.0';
  toolMapping: {
    hingeCup: number;
    hingeScrew: number;
    camHousing: number;
    camBolt: number;
    shelfPin: number;
    drawerRail: number;
    adjustableFoot: number;
  };
  machineParams: {
    spindleSpeed: number;
    feedRate: number;
  };
  includeComments: boolean;
}

/**
 * 통합 내보내기 설정
 */
export type ExportSettings =
  | CSVExportSettings
  | DXFExportSettings
  | MPRExportSettings
  | CIXExportSettings;

// ============================================
// 전체 보링 설정
// ============================================

/**
 * 보링 설정 전체
 */
export interface BoringSettings {
  // 하드웨어 설정
  hinge: BlumClipTopSettings;
  camLock: CamLockSettings;
  shelfPin: ShelfPinSettings;
  adjustableFoot: AdjustableFootSettings;
  drawerRail: DrawerRailSettings;

  // 32mm 시스템 설정
  systemPitch: number;        // 32mm
  startOffset: number;        // 37mm

  // 내보내기 설정
  export: ExportSettings;
}

// ============================================
// 보링 결과
// ============================================

/**
 * 보링 내보내기 결과
 */
export interface BoringExportResult {
  success: boolean;
  format: ExportFormat;
  files: Array<{
    filename: string;
    content: string | Blob;
    size: number;
  }>;
  summary: {
    totalPanels: number;
    totalBorings: number;
    boringsByType: Record<BoringType, number>;
  };
  error?: string;
}
