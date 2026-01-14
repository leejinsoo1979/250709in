/**
 * MPR 내보내기 (HOMAG woodWOP)
 * 네이티브 CNC 프로그램 형식
 */

import type {
  PanelBoringData,
  Boring,
  MPRExportSettings,
  BoringExportResult,
  BoringType,
  BoringFace,
} from '../types';
import { DEFAULT_MPR_EXPORT_SETTINGS } from '../constants';

// ============================================
// MPR 좌표계 변환
// ============================================

/**
 * 내부 면(face)을 woodWOP KA 코드로 변환
 * KA="1": 전면 (Front)
 * KA="2": 후면 (Back)
 * KA="3": 좌측 (Left)
 * KA="4": 우측 (Right)
 */
function faceToKA(face: BoringFace): number | null {
  switch (face) {
    case 'front':
      return 1;
    case 'back':
      return 2;
    case 'left':
      return 3;
    case 'right':
      return 4;
    default:
      return null;  // 상면/하면은 수평 보링이 아님
  }
}

/**
 * 내부 면(face)을 woodWOP BO 코드로 변환
 * BO="0": 상면 (Top)
 * BO="1": 하면 (Bottom)
 */
function faceToBO(face: BoringFace): number | null {
  switch (face) {
    case 'top':
      return 0;
    case 'bottom':
      return 1;
    default:
      return null;  // 측면은 수직 보링이 아님
  }
}

/**
 * 보링 타입에 따른 공구 번호 반환
 */
function getToolNumber(type: BoringType, toolMapping: MPRExportSettings['toolMapping']): number {
  switch (type) {
    case 'hinge-cup':
      return toolMapping.hingeCup;
    case 'hinge-screw':
      return toolMapping.hingeScrew;
    case 'cam-housing':
      return toolMapping.camHousing;
    case 'cam-bolt':
      return toolMapping.camBolt;
    case 'shelf-pin':
      return toolMapping.shelfPin;
    case 'drawer-rail':
    case 'drawer-rail-slot':
      return toolMapping.drawerRail;
    case 'adjustable-foot':
      return toolMapping.adjustableFoot;
    default:
      return 4;  // 기본값
  }
}

// ============================================
// MPR 생성
// ============================================

/**
 * MPR 헤더 생성
 */
function generateMPRHeader(version: string = '4.0'): string {
  return `[H
VERSION="${version}"
HP="1"
]

`;
}

/**
 * MPR 패널 정보 생성
 */
function generateMPRPanelInfo(panel: PanelBoringData): string {
  return `[001
LA="${panel.panelName}"
L="${panel.width}"
B="${panel.height}"
D="${panel.thickness}"
MAT="${panel.material}"
]

`;
}

/**
 * 수직 보링 명령 생성 (\BO\)
 */
function generateVerticalBoring(
  id: number,
  boring: Boring,
  toolNumber: number,
  includeComments: boolean
): string {
  const bo = faceToBO(boring.face);
  if (bo === null) return '';

  let mpr = `<${id} \\BO\\
XA="${boring.x.toFixed(2)}"
YA="${boring.y.toFixed(2)}"
DU="${boring.diameter.toFixed(1)}"
TI="${boring.depth.toFixed(1)}"
TNO="${toolNumber}"
BO="${bo}"
AN="0"
]
`;

  if (includeComments && boring.note) {
    mpr = `// ${boring.note}\n` + mpr;
  }

  return mpr + '\n';
}

/**
 * 수평 보링 명령 생성 (\HO\)
 */
function generateHorizontalBoring(
  id: number,
  boring: Boring,
  toolNumber: number,
  panelThickness: number,
  includeComments: boolean
): string {
  const ka = faceToKA(boring.face);
  if (ka === null) return '';

  // Z 위치: 패널 두께 방향 중심
  const z = panelThickness / 2;

  // Y 시작점: 음수로 측면 진입
  const ys = -boring.depth;

  let mpr = `<${id} \\HO\\
XA="${boring.x.toFixed(2)}"
ZA="${z.toFixed(2)}"
YS="${ys.toFixed(2)}"
DU="${boring.diameter.toFixed(1)}"
TI="${boring.depth.toFixed(1)}"
KA="${ka}"
TNO="${toolNumber}"
]
`;

  if (includeComments && boring.note) {
    mpr = `// ${boring.note}\n` + mpr;
  }

  return mpr + '\n';
}

/**
 * 슬롯 가공 명령 생성 (\SL\)
 */
function generateSlotBoring(
  id: number,
  boring: Boring,
  toolNumber: number,
  panelThickness: number,
  includeComments: boolean
): string {
  if (!boring.slotWidth || !boring.slotHeight) return '';

  const ka = faceToKA(boring.face);
  if (ka === null) return '';

  // 슬롯 시작점과 끝점 계산
  const halfWidth = (boring.slotWidth - boring.diameter) / 2;
  const xStart = boring.x - halfWidth;
  const xEnd = boring.x + halfWidth;
  const z = panelThickness / 2;

  let mpr = `<${id} \\SL\\
XA="${xStart.toFixed(2)}"
YA="${boring.y.toFixed(2)}"
XE="${xEnd.toFixed(2)}"
YE="${boring.y.toFixed(2)}"
ZA="${z.toFixed(2)}"
DU="${boring.diameter.toFixed(1)}"
TI="${boring.depth.toFixed(1)}"
KA="${ka}"
TNO="${toolNumber}"
]
`;

  if (includeComments && boring.note) {
    mpr = `// ${boring.note}\n` + mpr;
  }

  return mpr + '\n';
}

/**
 * 보링을 MPR 명령으로 변환
 */
function boringToMPR(
  id: number,
  boring: Boring,
  settings: MPRExportSettings,
  panelThickness: number
): string {
  const toolNumber = getToolNumber(boring.type, settings.toolMapping);

  // 장공인 경우
  if (boring.type === 'drawer-rail-slot') {
    return generateSlotBoring(id, boring, toolNumber, panelThickness, settings.includeComments);
  }

  // 수직 보링 (상면/하면)
  if (boring.face === 'top' || boring.face === 'bottom') {
    return generateVerticalBoring(id, boring, toolNumber, settings.includeComments);
  }

  // 수평 보링 (측면)
  return generateHorizontalBoring(id, boring, toolNumber, panelThickness, settings.includeComments);
}

// ============================================
// 메인 내보내기 함수
// ============================================

/**
 * 단일 패널 MPR 생성
 */
export function generateSinglePanelMPR(
  panel: PanelBoringData,
  settings: MPRExportSettings = DEFAULT_MPR_EXPORT_SETTINGS
): string {
  let mpr = '';

  // 헤더
  mpr += generateMPRHeader(settings.version);

  // 패널 정보
  mpr += generateMPRPanelInfo(panel);

  // 보링들
  panel.borings.forEach((boring, index) => {
    const id = 100 + index;
    mpr += boringToMPR(id, boring, settings, panel.thickness);
  });

  return mpr;
}

/**
 * MPR 내보내기 실행
 */
export function exportToMPR(
  panels: PanelBoringData[],
  settings?: Partial<MPRExportSettings>
): BoringExportResult {
  const finalSettings = { ...DEFAULT_MPR_EXPORT_SETTINGS, ...settings };

  try {
    const files: Array<{ filename: string; content: string; size: number }> = [];

    // MPR은 항상 패널별 개별 파일
    panels.forEach((panel) => {
      const content = generateSinglePanelMPR(panel, finalSettings);
      files.push({
        filename: `${panel.panelId}.mpr`,
        content,
        size: new Blob([content]).size,
      });
    });

    // 보링 타입별 개수 집계
    const boringsByType: Record<BoringType, number> = {} as Record<BoringType, number>;
    let totalBorings = 0;

    panels.forEach((panel) => {
      panel.borings.forEach((boring) => {
        boringsByType[boring.type] = (boringsByType[boring.type] || 0) + 1;
        totalBorings++;
      });
    });

    return {
      success: true,
      format: 'mpr',
      files,
      summary: {
        totalPanels: panels.length,
        totalBorings,
        boringsByType,
      },
    };
  } catch (error) {
    return {
      success: false,
      format: 'mpr',
      files: [],
      summary: {
        totalPanels: 0,
        totalBorings: 0,
        boringsByType: {} as Record<BoringType, number>,
      },
      error: error instanceof Error ? error.message : 'MPR 내보내기 실패',
    };
  }
}

// ============================================
// 다운로드 헬퍼
// ============================================

/**
 * MPR 파일 다운로드
 */
export function downloadMPR(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default {
  generateSinglePanelMPR,
  exportToMPR,
  downloadMPR,
};
