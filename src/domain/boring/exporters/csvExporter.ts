/**
 * CSV 내보내기
 * panels.csv + borings.csv 형식
 */

import type {
  PanelBoringData,
  Boring,
  CSVExportSettings,
  BoringExportResult,
  BoringType,
} from '../types';
import { DEFAULT_CSV_EXPORT_SETTINGS } from '../constants';

// ============================================
// 타입
// ============================================

export interface CSVExportParams {
  panels: PanelBoringData[];
  settings?: Partial<CSVExportSettings>;
}

// ============================================
// CSV 행 생성
// ============================================

/**
 * 패널 CSV 헤더
 */
const PANEL_CSV_HEADER = [
  'PanelID',
  'FurnitureID',
  'FurnitureName',
  'PanelType',
  'PanelName',
  'Width',
  'Height',
  'Thickness',
  'Material',
  'Grain',
  'IsMirrored',
  'MirrorSourceID',
];

/**
 * 보링 CSV 헤더
 */
const BORING_CSV_HEADER = [
  'PanelID',
  'BoringID',
  'Type',
  'Face',
  'X',
  'Y',
  'Diameter',
  'Depth',
  'Angle',
  'SlotWidth',
  'SlotHeight',
  'ToolNumber',
  'Note',
];

/**
 * 패널 데이터를 CSV 행으로 변환
 */
function panelToCSVRow(panel: PanelBoringData): string[] {
  return [
    panel.panelId,
    panel.furnitureId,
    panel.furnitureName,
    panel.panelType,
    panel.panelName,
    panel.width.toString(),
    panel.height.toString(),
    panel.thickness.toString(),
    panel.material,
    panel.grain,
    panel.isMirrored ? 'Y' : 'N',
    panel.mirrorSourceId || '',
  ];
}

/**
 * 보링 데이터를 CSV 행으로 변환
 */
function boringToCSVRow(panelId: string, boring: Boring): string[] {
  return [
    panelId,
    boring.id,
    boring.type,
    boring.face,
    boring.x.toFixed(2),
    boring.y.toFixed(2),
    boring.diameter.toFixed(1),
    boring.depth.toFixed(1),
    (boring.angle || 90).toString(),
    boring.slotWidth?.toFixed(1) || '',
    boring.slotHeight?.toFixed(1) || '',
    boring.toolNumber?.toString() || '',
    boring.note || '',
  ];
}

// ============================================
// CSV 생성
// ============================================

/**
 * CSV 문자열 생성
 */
function generateCSV(
  header: string[],
  rows: string[][],
  delimiter: string = ','
): string {
  const escapeValue = (value: string): string => {
    // 값에 구분자, 큰따옴표, 줄바꿈이 포함되면 따옴표로 감싸기
    if (value.includes(delimiter) || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const headerLine = header.map(escapeValue).join(delimiter);
  const dataLines = rows.map((row) =>
    row.map(escapeValue).join(delimiter)
  );

  return [headerLine, ...dataLines].join('\n');
}

/**
 * 패널 CSV 생성
 */
export function generatePanelCSV(
  panels: PanelBoringData[],
  delimiter: string = ','
): string {
  const rows = panels.map(panelToCSVRow);
  return generateCSV(PANEL_CSV_HEADER, rows, delimiter);
}

/**
 * 보링 CSV 생성
 */
export function generateBoringCSV(
  panels: PanelBoringData[],
  delimiter: string = ','
): string {
  const rows: string[][] = [];

  panels.forEach((panel) => {
    panel.borings.forEach((boring) => {
      rows.push(boringToCSVRow(panel.panelId, boring));
    });
  });

  return generateCSV(BORING_CSV_HEADER, rows, delimiter);
}

/**
 * 서랍 보링 CSV 생성 (장공 포함)
 */
export function generateDrawerBoringCSV(
  panels: PanelBoringData[],
  delimiter: string = ','
): string {
  const rows: string[][] = [];

  panels.forEach((panel) => {
    // 서랍 관련 보링만 필터링
    const drawerBorings = panel.borings.filter(
      (b) => b.type === 'drawer-rail' || b.type === 'drawer-rail-slot'
    );

    drawerBorings.forEach((boring) => {
      rows.push(boringToCSVRow(panel.panelId, boring));
    });
  });

  return generateCSV(BORING_CSV_HEADER, rows, delimiter);
}

// ============================================
// 패널별 개별 CSV 생성
// ============================================

/**
 * 패널별 개별 CSV 파일 생성
 */
export function generatePerPanelCSV(
  panels: PanelBoringData[],
  delimiter: string = ','
): Array<{ filename: string; content: string }> {
  return panels.map((panel) => {
    const header = BORING_CSV_HEADER;
    const rows = panel.borings.map((boring) =>
      boringToCSVRow(panel.panelId, boring)
    );
    const content = generateCSV(header, rows, delimiter);

    return {
      filename: `${panel.panelId}_borings.csv`,
      content,
    };
  });
}

// ============================================
// 메인 내보내기 함수
// ============================================

/**
 * CSV 내보내기 실행
 */
export function exportToCSV(params: CSVExportParams): BoringExportResult {
  const settings = { ...DEFAULT_CSV_EXPORT_SETTINGS, ...params.settings };

  try {
    const files: Array<{ filename: string; content: string; size: number }> = [];

    if (settings.filePerPanel) {
      // 패널별 개별 파일
      const perPanelFiles = generatePerPanelCSV(params.panels, settings.delimiter);
      perPanelFiles.forEach((file) => {
        files.push({
          filename: file.filename,
          content: file.content,
          size: new Blob([file.content]).size,
        });
      });

      // 패널 목록 파일도 추가
      const panelCSV = generatePanelCSV(params.panels, settings.delimiter);
      files.push({
        filename: 'panels.csv',
        content: panelCSV,
        size: new Blob([panelCSV]).size,
      });
    } else {
      // 통합 파일
      const panelCSV = generatePanelCSV(params.panels, settings.delimiter);
      const boringCSV = generateBoringCSV(params.panels, settings.delimiter);

      files.push({
        filename: 'panels.csv',
        content: panelCSV,
        size: new Blob([panelCSV]).size,
      });

      files.push({
        filename: 'borings.csv',
        content: boringCSV,
        size: new Blob([boringCSV]).size,
      });

      // 서랍 보링이 있는 경우 별도 파일 생성
      const hasDrawerBorings = params.panels.some((p) =>
        p.borings.some((b) => b.type.startsWith('drawer-rail'))
      );

      if (hasDrawerBorings) {
        const drawerCSV = generateDrawerBoringCSV(params.panels, settings.delimiter);
        files.push({
          filename: 'drawer_borings.csv',
          content: drawerCSV,
          size: new Blob([drawerCSV]).size,
        });
      }
    }

    // 보링 타입별 개수 집계
    const boringsByType: Record<BoringType, number> = {} as Record<BoringType, number>;
    let totalBorings = 0;

    params.panels.forEach((panel) => {
      panel.borings.forEach((boring) => {
        boringsByType[boring.type] = (boringsByType[boring.type] || 0) + 1;
        totalBorings++;
      });
    });

    return {
      success: true,
      format: 'csv',
      files,
      summary: {
        totalPanels: params.panels.length,
        totalBorings,
        boringsByType,
      },
    };
  } catch (error) {
    return {
      success: false,
      format: 'csv',
      files: [],
      summary: {
        totalPanels: 0,
        totalBorings: 0,
        boringsByType: {} as Record<BoringType, number>,
      },
      error: error instanceof Error ? error.message : 'CSV 내보내기 실패',
    };
  }
}

// ============================================
// 다운로드 헬퍼
// ============================================

/**
 * CSV 파일 다운로드
 */
export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 여러 CSV 파일을 ZIP으로 다운로드
 */
export async function downloadCSVAsZip(
  files: Array<{ filename: string; content: string }>,
  zipFilename: string = 'boring_data.zip'
): Promise<void> {
  // JSZip 라이브러리 사용 (동적 import)
  try {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    files.forEach((file) => {
      zip.file(file.filename, '\ufeff' + file.content);
    });

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = zipFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('ZIP 생성 실패:', error);
    // ZIP 실패 시 개별 파일로 다운로드
    files.forEach((file) => {
      downloadCSV(file.content, file.filename);
    });
  }
}

export default {
  generatePanelCSV,
  generateBoringCSV,
  generateDrawerBoringCSV,
  generatePerPanelCSV,
  exportToCSV,
  downloadCSV,
  downloadCSVAsZip,
};
