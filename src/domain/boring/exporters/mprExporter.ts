/**
 * MPR 내보내기 (imos 포맷)
 * imos CNC 프로그램 형식 (.mpr)
 */

import type {
  PanelBoringData,
  Boring,
  MPRExportSettings,
  BoringExportResult,
  BoringType,
} from '../types';
import { DEFAULT_MPR_EXPORT_SETTINGS } from '../constants';
import { encodeCp949 } from './cp949Encoder';

const BACK_PANEL_GROOVE_REAR_OFFSET_MM = 16;
const BACK_PANEL_GROOVE_WIDTH_MM = 10;
const BACK_PANEL_GROOVE_CUT_DEPTH_MM = 7.5;

// ============================================
// imos MPR 블록 생성
// ============================================

/**
 * [H 헤더 블록 생성
 */
function generateIMOSHeader(panel: PanelBoringData, version: string = '4.0 Alpha'): string {
  return `[H
VERSION="${version}"
UP="0"
DW="0"
OP="2"
INCH="0"
_BSX=${panel.width.toFixed(4)}
_BSY=${panel.height.toFixed(4)}
_BSZ=${panel.thickness.toFixed(4)}
`;
}

/**
 * [001 패널 변수 블록 생성
 */
function generateIMOSVariables(panel: PanelBoringData): string {
  return `[001
L="${panel.width}"
KM="길이 (X)"
B="${panel.height}"
KM="폭 (Y)"
T="${panel.thickness}"
KM="두께 (Z)"
RL_VAR="L"
KM=""
RB_VAR="B"
KM=""
FNX_EXP="0"
KM=""
FNY_EXP="0"
KM=""
RNX_VAR="0"
KM=""
RNY_VAR="0"
KM=""
RNZ_VAR="0"
KM=""
bohrver="1"
KM=""
bohrhor="1"
KM=""
bohruni="1"
KM=""
bohren="1"
KM=""
fraesen="1"
KM=""
fsaegen="1"
KM=""
saegen="1"
KM=""
nuten="1"
KM=""
ktasche="1"
KM=""
rtasche="1"
KM=""
abblas="1"
KM=""
leimen="1"
KM=""
kappen="1"
KM=""
bfraesen="1"
KM=""
runden="1"
KM=""
ziehkl="1"
KM=""
`;
}

/**
 * <100 \Werkstck\ 워크피스 블록 생성
 */
function generateWerkstck(): string {
  return `
<100 \\Werkstck\\
LA="L"
BR="B"
DI="T"
FNX="FNX_EXP"
FNY="FNY_EXP"

RL="RL_VAR"
RB="RB_VAR"
RNX="RNX_VAR"
RNY="RNY_VAR"
RNZ="RNZ_VAR"

`;
}

/**
 * <101 \Kommentar\ 주석 블록 생성
 */
function generateKommentar(panel: PanelBoringData, projectName: string = ''): string {
  const now = new Date();
  const dateStr = now.toISOString().replace('T', ' ').slice(0, 19);

  const materialName = panel.material || 'PB_18T';

  return `<101 \\Kommentar\\
KM="오더:   ${projectName}"
KM="조각:   ${panel.panelName}"
KM="측정 단위:   mm"
KM="마감 치수:   ${panel.width} x ${panel.height} x ${panel.thickness}"
KM="자재:   ${materialName}"
KM="바코드:   ${panel.panelId}"
KM="생성 시간:   ${dateStr}"
KAT="Kommentar"
MNM="파트 정보"
ORI=""

`;
}

/**
 * <102 \BohrVert\ 수직 보링 블록 생성
 */
function formatMprNumber(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function formatMprCoordinate(value: number): string {
  if (Number.isInteger(value)) return `${value}`;
  return value.toFixed(2).replace(/\.?0+$/, '');
}

function formatMprDecimal4(value: number): string {
  return value.toFixed(4);
}

function isFixedPanelThroughBoring(boring: Boring): boolean {
  return boring.note === 'fixed-panel-through';
}

function generateBohrVert(boring: Boring, panel: PanelBoringData): string {
  // 보링 타입별 기본값 설정
  let ti = boring.depth;        // 깊이
  let du = boring.diameter;      // 직경
  let bm = 'LS';                // 보링 모드 (LS=단일)
  let wi = '';                  // 각도 (생략 가능)

  if (isFixedPanelThroughBoring(boring)) {
    ti = panel.thickness;
    du = 6;
    bm = 'LSL';
  } else if (boring.type === 'hinge-screw') {
    ti = 3;
    du = 3;
  }

  // 관통 보링 (depth >= thickness 또는 cam-bolt 등)
  if (boring.type === 'cam-bolt' || ti >= panel.thickness) {
    bm = 'LSL';  // 관통
  }

  // 각도 설정
  if (boring.angle !== undefined) {
    wi = `\nWI="${boring.angle}"`;
  }

  return `<102 \\BohrVert\\
XA="${boring.x.toFixed(1)}"
YA="${boring.y.toFixed(1)}"
ZA="T"
TI="${formatMprNumber(ti)}"
AB="32"
BM="${bm}"
DU="${formatMprNumber(du)}"
AN="1"
MI="0"${wi}
??="bohrver=1  "

`;
}

function getHorizontalBoringAngle(boring: Boring): number {
  switch (boring.face) {
    case 'right':
      return 180;
    case 'front':
      return 90;
    case 'back':
      return -90;
    case 'left':
    default:
      return 0;
  }
}

/**
 * <103 \BohrHoriz\ 수평/측면 보링 블록 생성
 */
function generateBohrHoriz(boring: Boring, panel: PanelBoringData): string {
  const wi = boring.angle ?? getHorizontalBoringAngle(boring);
  const ti = boring.depth;
  const du = boring.diameter;
  const za = panel.thickness / 2;

  if (boring.note === 'fixed-panel-side-bore') {
    const bm = boring.face === 'right' ? 'XM' : 'XP';
    return `<103 \\BohrHoriz\\
XA="${formatMprDecimal4(boring.x)}"
YA="${formatMprDecimal4(boring.y)}"
ZA="${formatMprDecimal4(za)}"
TI="${formatMprDecimal4(ti)}"
DU="${formatMprDecimal4(du)}"
BM="${bm}"
F_="STANDARD"
AN="1"
WI="${formatMprDecimal4(wi)}"

`;
  }

  return `<103 \\BohrHoriz\\
XA="${boring.x.toFixed(1)}"
YA="${boring.y.toFixed(1)}"
ZA="${formatMprCoordinate(za)}"
TI="${formatMprNumber(ti)}"
AB="32"
BM="LS"
DU="${formatMprNumber(du)}"
AN="1"
MI="0"
WI="${wi}"
??="bohrhor=1  "

`;
}

function isRightSidePanel(panel: PanelBoringData): boolean {
  return panel.panelType === 'side-right'
    || panel.panelName.includes('우측판')
    || panel.panelName.includes('우측');
}

function isLeftSidePanel(panel: PanelBoringData): boolean {
  return panel.panelType === 'side-left'
    || panel.panelName.includes('좌측판')
    || panel.panelName.includes('좌측');
}

function isFurnitureSidePanelForBackPanelGroove(panel: PanelBoringData): boolean {
  const name = panel.panelName || '';
  if (panel.panelType !== 'side-left' && panel.panelType !== 'side-right') return false;
  if (name.includes('서랍') || name.includes('도어') || name.includes('Door')) return false;
  if (name.includes('서라운드') || name.includes('커튼박스')) return false;
  return isLeftSidePanel(panel) || isRightSidePanel(panel) || name.includes('측판');
}

interface SideNotchRect {
  startX: number;
  startY: number;
  width: number;
  height: number;
}

function resolveSideNotchRect(
  panel: PanelBoringData,
  notch: { y: number; z: number; fromBottom: number }
): SideNotchRect | null {
  const notchHeight = Math.max(0, Math.min(notch.y, panel.height));
  const notchDepth = Math.max(0, Math.min(notch.z, panel.width));
  if (notchHeight <= 0 || notchDepth <= 0) return null;

  const isRight = isRightSidePanel(panel);
  const startX = isRight ? Math.max(0, panel.width - notchDepth) : 0;
  const startY = Math.max(0, Math.min(notch.fromBottom, panel.height - notchHeight));

  return {
    startX,
    startY,
    width: notchDepth,
    height: notchHeight,
  };
}

function resolveBackPanelGrooveRect(panel: PanelBoringData): SideNotchRect | null {
  if (!isFurnitureSidePanelForBackPanelGroove(panel)) return null;
  if (panel.width <= BACK_PANEL_GROOVE_REAR_OFFSET_MM + BACK_PANEL_GROOVE_WIDTH_MM || panel.height <= 0) return null;

  const startX = isLeftSidePanel(panel)
    ? panel.width - BACK_PANEL_GROOVE_REAR_OFFSET_MM - BACK_PANEL_GROOVE_WIDTH_MM
    : BACK_PANEL_GROOVE_REAR_OFFSET_MM;

  return {
    startX,
    startY: 0,
    width: BACK_PANEL_GROOVE_WIDTH_MM,
    height: panel.height,
  };
}

function generateContourBlock(
  blockNumber: number,
  name: string,
  points: Array<{ x: number; y: number }>
): string {
  if (points.length < 2) return '';

  const [start, ...rest] = points;
  const lines = rest.map((point, index) => `$E${index + 1}
KL
X=${formatMprDecimal4(point.x)}
Y=${formatMprDecimal4(point.y)}
Z=0.0000
`).join('\n');

  return `
]${blockNumber}
$E0
KP ${name}
X=${formatMprDecimal4(start.x)}
Y=${formatMprDecimal4(start.y)}
Z=0.0000
KO=00

${lines}`;
}

function generatePanelDisplayGeometry(panel: PanelBoringData): string {
  const sideNotches = panel.sideNotches ?? [];
  const backPanelGrooveRect = resolveBackPanelGrooveRect(panel);
  if (sideNotches.length === 0 && !backPanelGrooveRect) return '';

  let geometry = generateContourBlock(1, 'NEST', [
    { x: 0, y: 0 },
    { x: panel.width, y: 0 },
    { x: panel.width, y: panel.height },
    { x: 0, y: panel.height },
    { x: 0, y: 0 },
  ]);

  sideNotches.forEach((notch, index) => {
    const rect = resolveSideNotchRect(panel, notch);
    if (!rect) return;

    const endX = rect.startX + rect.width;
    const endY = rect.startY + rect.height;
    geometry += generateContourBlock(index + 2, `SIDE_NOTCH_${index + 1}`, [
      { x: rect.startX, y: rect.startY },
      { x: endX, y: rect.startY },
      { x: endX, y: endY },
      { x: rect.startX, y: endY },
      { x: rect.startX, y: rect.startY },
    ]);
  });

  if (backPanelGrooveRect) {
    const blockNumber = sideNotches.length + 2;
    const endX = backPanelGrooveRect.startX + backPanelGrooveRect.width;
    const endY = backPanelGrooveRect.startY + backPanelGrooveRect.height;
    geometry += generateContourBlock(blockNumber, 'BACK_PANEL_GROOVE', [
      { x: backPanelGrooveRect.startX, y: backPanelGrooveRect.startY },
      { x: endX, y: backPanelGrooveRect.startY },
      { x: endX, y: endY },
      { x: backPanelGrooveRect.startX, y: endY },
      { x: backPanelGrooveRect.startX, y: backPanelGrooveRect.startY },
    ]);
  }

  return geometry;
}

function generateSideNotchPocket(
  panel: PanelBoringData,
  notch: { y: number; z: number; fromBottom: number },
  index: number
): string {
  const rect = resolveSideNotchRect(panel, notch);
  if (!rect) return '';

  return `<105 \\Ktasche\\
KM="측판 따내기 ${index + 1}: ${formatMprNumber(rect.width)} x ${formatMprNumber(rect.height)}, 바닥기준 ${formatMprNumber(notch.fromBottom)}"
XA="${rect.startX.toFixed(1)}"
YA="${rect.startY.toFixed(1)}"
ZA="T"
LA="${formatMprNumber(rect.width)}"
BR="${formatMprNumber(rect.height)}"
TI="T"
AN="1"
MI="0"
??="ktasche=1  "

`;
}

function generateBackPanelGroovePocket(panel: PanelBoringData): string {
  const rect = resolveBackPanelGrooveRect(panel);
  if (!rect) return '';

  return `<105 \\Ktasche\\
KM="백패널 홈: ${formatMprNumber(rect.width)} x ${formatMprNumber(rect.height)}, 뒤기준 ${formatMprNumber(BACK_PANEL_GROOVE_REAR_OFFSET_MM)}"
XA="${rect.startX.toFixed(1)}"
YA="${rect.startY.toFixed(1)}"
ZA="T"
LA="${formatMprNumber(rect.width)}"
BR="${formatMprNumber(rect.height)}"
TI="${formatMprNumber(BACK_PANEL_GROOVE_CUT_DEPTH_MM)}"
AN="1"
MI="0"
??="ktasche=1  "

`;
}

function generateDrawerBottomGroovePocket(
  panel: PanelBoringData,
  groove: { y: number; height: number; depth: number },
  index: number
): string {
  const grooveStartY = Math.max(0, Math.min(groove.y, panel.height));
  const grooveWidth = Math.max(0, Math.min(groove.height, panel.height - grooveStartY));
  const grooveDepth = Math.max(0, Math.min(groove.depth, panel.thickness));
  if (panel.width <= 0 || grooveWidth <= 0 || grooveDepth <= 0) return '';

  return `<105 \\Ktasche\\
KM="서랍 바닥홈 ${index + 1}: L ${formatMprNumber(panel.width)} x W ${formatMprNumber(grooveWidth)}, 바닥기준 ${formatMprNumber(groove.y)}, 깊이 ${formatMprNumber(grooveDepth)}"
XA="0.0"
YA="${grooveStartY.toFixed(1)}"
ZA="T"
LA="${formatMprNumber(panel.width)}"
BR="${formatMprNumber(grooveWidth)}"
TI="${formatMprNumber(grooveDepth)}"
AN="1"
MI="0"
??="ktasche=1  "

`;
}

// ============================================
// 메인 내보내기 함수
// ============================================

/**
 * 단일 패널 imos MPR 생성
 */
export function generateSinglePanelMPR(
  panel: PanelBoringData,
  settings: MPRExportSettings = DEFAULT_MPR_EXPORT_SETTINGS,
  projectName: string = ''
): string {
  let mpr = '';

  // [H 헤더
  mpr += generateIMOSHeader(panel, settings.version || '4.0 Alpha');

  // [001 변수
  mpr += generateIMOSVariables(panel);

  // 목찬넬/백패널 홈 위치 표시용 윤곽선
  mpr += generatePanelDisplayGeometry(panel);

  // <100 워크피스
  mpr += generateWerkstck();

  // <101 주석
  mpr += generateKommentar(panel, projectName);

  // <102 보링들
  panel.borings.forEach((boring) => {
    if (boring.face === 'top' || boring.face === 'bottom') {
      mpr += generateBohrVert(boring, panel);
    } else {
      mpr += generateBohrHoriz(boring, panel);
    }
  });

  panel.sideNotches?.forEach((notch, index) => {
    mpr += generateSideNotchPocket(panel, notch, index);
  });

  mpr += generateBackPanelGroovePocket(panel);

  panel.groovePositions?.forEach((groove, index) => {
    mpr += generateDrawerBottomGroovePocket(panel, groove, index);
  });

  // 파일 끝 마커
  mpr += '!\n';

  return mpr;
}

/**
 * imos MPR 내보내기 실행
 */
export function exportToMPR(
  panels: PanelBoringData[],
  settings?: Partial<MPRExportSettings>,
  projectName?: string
): BoringExportResult {
  const finalSettings = { ...DEFAULT_MPR_EXPORT_SETTINGS, ...settings };

  try {
    const files: Array<{ filename: string; content: string; size: number }> = [];

    // MPR은 패널별 개별 파일
    panels.forEach((panel) => {
      const content = generateSinglePanelMPR(panel, finalSettings, projectName);
      // 파일명: panelName으로 (특수문자 제거)
      const safeName = panel.panelName.replace(/[/\\:*?"<>|]/g, '_');
      files.push({
        filename: `${safeName}.mpr`,
        content,
        size: new Blob([encodeMPRContent(content)]).size,
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
export function encodeMPRContent(content: string): Uint8Array {
  return encodeCp949(content);
}

export function encodeMPRZipFileName(filename: string): string {
  return String.fromCharCode(...encodeCp949(filename));
}

export function downloadMPR(content: string, filename: string): void {
  const blob = new Blob([encodeMPRContent(content)], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function downloadMPRAsZip(
  files: Array<{ filename: string; content: string }>,
  zipFilename: string = 'mpr_data.zip'
): Promise<void> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  files.forEach((file) => {
    zip.file(file.filename, encodeMPRContent(file.content), { binary: true });
  });

  const blob = await zip.generateAsync({
    type: 'blob',
    encodeFileName: encodeMPRZipFileName,
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = zipFilename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default {
  generateSinglePanelMPR,
  exportToMPR,
  downloadMPR,
  downloadMPRAsZip,
};
