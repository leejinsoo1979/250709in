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
function generateBohrVert(boring: Boring): string {
  // 보링 타입별 기본값 설정
  let ti = boring.depth;        // 깊이
  let bm = 'LS';                // 보링 모드 (LS=단일)
  let wi = '';                  // 각도 (생략 가능)

  // 관통 보링 (depth >= thickness 또는 cam-bolt 등)
  if (boring.type === 'cam-bolt') {
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
TI="${ti}"
AB="32"
BM="${bm}"
DU="${boring.diameter}"
AN="1"
MI="0"${wi}
??="bohrver=1  "

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

  // <100 워크피스
  mpr += generateWerkstck();

  // <101 주석
  mpr += generateKommentar(panel, projectName);

  // <102 보링들
  panel.borings.forEach((boring) => {
    mpr += generateBohrVert(boring);
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
      const safeName = panel.panelName.replace(/[\/\\:*?"<>|]/g, '_');
      files.push({
        filename: `${safeName}.mpr`,
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
