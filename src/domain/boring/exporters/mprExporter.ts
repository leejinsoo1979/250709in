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

const BACK_PANEL_GROOVE_REAR_OFFSET_MM = 17;
const BACK_PANEL_GROOVE_WIDTH_MM = 3;
const BACK_PANEL_GROOVE_CUT_DEPTH_MM = 7.5;
const CONTOUR_CUT_DEPTH_MM = -2;

// ============================================
// imos MPR 블록 생성
// ============================================

/**
 * [H 헤더 블록 생성
 */
function generateIMOSHeader(panel: PanelBoringData, version: string = '4.0 Alpha'): string {
  return `[H
VERSION="${version}"
OP="2"
INCH="0"

`;
}

/**
 * [001 패널 변수 블록 생성
 */
function generateIMOSVariables(panel: PanelBoringData): string {
  return `[001
l="${formatMprDecimal4(panel.width)}"
KM="length"
w="${formatMprDecimal4(panel.height)}"
KM="width"
t="${formatMprDecimal4(panel.thickness)}"
KM="thickness"
L="l"
KM="length"
B="w"
KM="width"
D="t"
KM="thickness"


`;
}

/**
 * <100 \Werkstck\ 워크피스 블록 생성
 */
function generateWerkstck(): string {
  return `
<100 \\Werkstck\\
LA="l"
BR="w"
DI="t"
AX="0.0000"
AY="0.0000"
FNX="0.0000"
FNY="0.0000"

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
  let wi = '';                  // 각도 (생략 가능)

  if (isFixedPanelThroughBoring(boring)) {
    ti = panel.thickness;
    du = 6;
  } else if (boring.type === 'hinge-screw') {
    ti = 3;
    du = 3;
  }

  // 각도 설정
  if (boring.angle !== undefined) {
    wi = `\nWI="${formatMprDecimal4(boring.angle)}"`;
  }

  return `<102 \\BohrVert\\
XA="${formatMprDecimal4(boring.x)}"
YA="${formatMprDecimal4(boring.y)}"
TI="${formatMprDecimal4(ti)}"
DU="${formatMprDecimal4(du)}"
F_="STANDARD"
AN="1"
${wi ? `${wi}\n` : ''}

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
  return name.includes('좌측') || name.includes('우측') || name.includes('측판');
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
  if (isFurnitureSidePanelForBackPanelGroove(panel)) {
    const notchWidth = Math.max(0, Math.min(notch.y, panel.width));
    const notchHeight = Math.max(0, Math.min(notch.z, panel.height));
    if (notchWidth <= 0 || notchHeight <= 0) return null;

    return {
      startX: Math.max(0, Math.min(notch.fromBottom, panel.width - notchWidth)),
      startY: 0,
      width: notchWidth,
      height: notchHeight,
    };
  }

  const notchLength = Math.max(0, Math.min(notch.y, panel.width));
  const notchDepth = Math.max(0, Math.min(notch.z, panel.height));
  if (notchLength <= 0 || notchDepth <= 0) return null;

  const startX = Math.max(0, Math.min(notch.fromBottom, panel.width - notchLength));

  return {
    startX,
    startY: 0,
    width: notchLength,
    height: notchDepth,
  };
}

interface BackPanelGrooveLine {
  y: number;
  centerY: number;
  width: number;
  depth: number;
}

function resolveBackPanelGrooveLine(panel: PanelBoringData): BackPanelGrooveLine | null {
  if (!isFurnitureSidePanelForBackPanelGroove(panel)) return null;
  if (panel.height <= BACK_PANEL_GROOVE_REAR_OFFSET_MM + BACK_PANEL_GROOVE_WIDTH_MM || panel.width <= 0) return null;
  const y = panel.height - BACK_PANEL_GROOVE_REAR_OFFSET_MM - BACK_PANEL_GROOVE_WIDTH_MM;

  return {
    y,
    centerY: y + BACK_PANEL_GROOVE_WIDTH_MM / 2,
    width: BACK_PANEL_GROOVE_WIDTH_MM,
    depth: BACK_PANEL_GROOVE_CUT_DEPTH_MM,
  };
}

function generateContourBlock(
  blockNumber: number,
  name: string,
  points: Array<{ x: number; y: number }>,
  z: number = 0
): string {
  if (points.length < 2) return '';

  const [start, ...rest] = points;
  const lines = rest.map((point, index) => `$E${index + 1}
KL
X=${formatMprDecimal4(point.x)}
Y=${formatMprDecimal4(point.y)}
Z=${formatMprDecimal4(z)}
`).join('\n');

  const startFields = name === 'NEST'
    ? `X=${formatMprDecimal4(start.x)}
Y=${formatMprDecimal4(start.y)}
Z=${formatMprDecimal4(z)}
KO=00`
    : `KO=00
X=${formatMprDecimal4(start.x)}
Y=${formatMprDecimal4(start.y)}
Z=${formatMprDecimal4(z)}`;

  return `
]${blockNumber}
$E0
KP${name ? ` ${name}` : ''}
${startFields}

${lines}`;
}

function getBackPanelGrooveBlockNumber(panel: PanelBoringData): number | null {
  return resolveBackPanelGrooveLine(panel) ? 2 : null;
}

function getSideNotchBlockNumber(panel: PanelBoringData, index: number): number {
  return (getBackPanelGrooveBlockNumber(panel) ? 3 : 2) + index;
}

function getSideNotchContourPoints(panel: PanelBoringData, notch: { y: number; z: number; fromBottom: number }): Array<{ x: number; y: number }> {
  const rect = resolveSideNotchRect(panel, notch);
  if (!rect) return [];

  const endX = rect.startX + rect.width;
  const endY = rect.startY + rect.height;
  const isFurnitureSide = isFurnitureSidePanelForBackPanelGroove(panel);
  const onTopEdge = isFurnitureSide
    ? Math.abs(endY - panel.height) < 0.001
    : Math.abs(endX - panel.width) < 0.001;
  const onBottomEdge = isFurnitureSide
    ? rect.startY <= 0.001
    : rect.startX <= 0.001;

  if (onTopEdge) {
    if (isFurnitureSide) {
      return [
        { x: endX, y: endY },
        { x: rect.startX, y: endY },
        { x: rect.startX, y: rect.startY },
      ];
    }

    return [
      { x: endX, y: endY },
      { x: rect.startX, y: endY },
      { x: rect.startX, y: rect.startY },
    ];
  }

  if (onBottomEdge) {
    if (isFurnitureSide) {
      return [
        { x: rect.startX, y: rect.startY },
        { x: endX, y: rect.startY },
        { x: endX, y: endY },
      ];
    }

    return [
      { x: rect.startX, y: rect.startY },
      { x: rect.startX, y: endY },
      { x: endX, y: endY },
    ];
  }

  return [
    { x: rect.startX, y: rect.startY },
    { x: rect.startX, y: endY },
    { x: endX, y: endY },
    { x: endX, y: rect.startY },
  ];
}

function generatePanelDisplayGeometry(panel: PanelBoringData): string {
  const sideNotches = panel.sideNotches ?? [];
  const backPanelGrooveLine = resolveBackPanelGrooveLine(panel);
  if (sideNotches.length === 0 && !backPanelGrooveLine) return '';

  let geometry = generateContourBlock(1, 'NEST', [
    { x: 0, y: 0 },
    { x: panel.width, y: 0 },
    { x: panel.width, y: panel.height },
    { x: 0, y: panel.height },
    { x: 0, y: 0 },
  ]);

  if (backPanelGrooveLine) {
    geometry += generateContourBlock(2, '', [
      { x: 0, y: backPanelGrooveLine.y },
      { x: panel.width, y: backPanelGrooveLine.y },
    ], CONTOUR_CUT_DEPTH_MM);
  }

  sideNotches.forEach((notch, index) => {
    const points = getSideNotchContourPoints(panel, notch);
    if (points.length < 2) return;
    geometry += generateContourBlock(getSideNotchBlockNumber(panel, index), '', points, CONTOUR_CUT_DEPTH_MM);
  });

  return geometry;
}

function generateContourMilling(blockNumber: number, endIndex: number): string {
  return `<105 \\Konturfraesen\\
EA="${blockNumber}:0"
EE="${blockNumber}:${endIndex}"
TNO="-1"
F_="STANDARD"
RK="WRKR"
MDA="TAN"
MDE="TAN_AB"
AB="0"
ZA="${formatMprDecimal4(CONTOUR_CUT_DEPTH_MM)}"

`;
}

function generateSideNotchPocket(
  panel: PanelBoringData,
  notch: { y: number; z: number; fromBottom: number },
  index: number
): string {
  const points = getSideNotchContourPoints(panel, notch);
  if (points.length < 2) return '';
  return generateContourMilling(getSideNotchBlockNumber(panel, index), points.length - 1);
}

function generateBackPanelGroovePocket(panel: PanelBoringData): string {
  const groove = resolveBackPanelGrooveLine(panel);
  if (!groove) return '';

  return `<109 \\Nuten\\
XA="${formatMprDecimal4(-1)}"
YA="${formatMprDecimal4(groove.centerY)}"
XE="${formatMprDecimal4(panel.width + 1)}"
YE="${formatMprDecimal4(groove.centerY)}"
AN="0"
NB="${formatMprDecimal4(groove.width)}"
RK="NOWRK"
EM="MOD0"
TI="${formatMprDecimal4(groove.depth)}"
XY="50.0000"
F_="STANDARD"
KO="00"

`;
}

function generateBackPanelGrooveContourMilling(panel: PanelBoringData): string {
  const blockNumber = getBackPanelGrooveBlockNumber(panel);
  if (!blockNumber) return '';
  return generateContourMilling(blockNumber, 1);
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

  // 샘플 MPR 기준: 윤곽/따내기 경로 가공(Konturfraesen)을 보링보다 먼저 출력
  mpr += generateBackPanelGrooveContourMilling(panel);

  panel.sideNotches?.forEach((notch, index) => {
    mpr += generateSideNotchPocket(panel, notch, index);
  });

  // <102 보링들
  panel.borings.forEach((boring) => {
    if (boring.face === 'top' || boring.face === 'bottom') {
      mpr += generateBohrVert(boring, panel);
    } else {
      mpr += generateBohrHoriz(boring, panel);
    }
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
