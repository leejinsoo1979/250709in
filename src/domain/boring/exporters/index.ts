/**
 * 보링 내보내기 모듈 통합
 */

// CSV 내보내기
export {
  generatePanelCSV,
  generateBoringCSV,
  generateDrawerBoringCSV,
  generatePerPanelCSV,
  exportToCSV,
  downloadCSV,
  downloadCSVAsZip,
  type CSVExportParams,
} from './csvExporter';

// DXF 내보내기
export {
  generateSinglePanelDXF,
  generateMultiplePanelDXF,
  exportToDXF,
  downloadDXF,
} from './dxfExporter';

// MPR 내보내기 (HOMAG woodWOP)
export {
  generateSinglePanelMPR,
  exportToMPR,
  downloadMPR,
} from './mprExporter';

// CIX 내보내기 (Biesse bSolid)
export {
  generateSinglePanelCIX,
  exportToCIX,
  downloadCIX,
} from './cixExporter';

// ============================================
// 통합 내보내기 함수
// ============================================

import type {
  PanelBoringData,
  BoringExportResult,
  CSVExportSettings,
  DXFExportSettings,
  MPRExportSettings,
  CIXExportSettings,
  ExportFormat,
} from '../types';

import { exportToCSV } from './csvExporter';
import { exportToDXF } from './dxfExporter';
import { exportToMPR } from './mprExporter';
import { exportToCIX } from './cixExporter';

export type ExportSettings =
  | Partial<CSVExportSettings>
  | Partial<DXFExportSettings>
  | Partial<MPRExportSettings>
  | Partial<CIXExportSettings>;

/**
 * 포맷에 따른 내보내기 실행
 */
export function exportBoringData(
  panels: PanelBoringData[],
  format: ExportFormat,
  settings?: ExportSettings
): BoringExportResult {
  switch (format) {
    case 'csv':
      return exportToCSV({ panels, settings: settings as Partial<CSVExportSettings> });

    case 'dxf':
      return exportToDXF(panels, settings as Partial<DXFExportSettings>);

    case 'mpr':
      return exportToMPR(panels, settings as Partial<MPRExportSettings>);

    case 'cix':
      return exportToCIX(panels, settings as Partial<CIXExportSettings>);

    default:
      return {
        success: false,
        format,
        files: [],
        summary: {
          totalPanels: 0,
          totalBorings: 0,
          boringsByType: {},
        },
        error: `Unknown export format: ${format}`,
      };
  }
}

/**
 * 지원하는 내보내기 포맷 목록
 */
export const SUPPORTED_EXPORT_FORMATS: Array<{
  format: ExportFormat;
  name: string;
  description: string;
  extension: string;
  software: string[];
}> = [
  {
    format: 'csv',
    name: 'CSV',
    description: '범용 스프레드시트 형식',
    extension: '.csv',
    software: ['Excel', 'Cabinet Vision', 'Microvellum', 'imos', 'ARDIS'],
  },
  {
    format: 'dxf',
    name: 'DXF',
    description: 'AutoCAD 호환 도면 형식',
    extension: '.dxf',
    software: ['AutoCAD', 'Cabinet Vision', 'Microvellum', 'imos'],
  },
  {
    format: 'mpr',
    name: 'MPR',
    description: 'HOMAG woodWOP 네이티브 형식',
    extension: '.mpr',
    software: ['HOMAG woodWOP'],
  },
  {
    format: 'cix',
    name: 'CIX',
    description: 'Biesse bSolid XML 형식',
    extension: '.cix',
    software: ['Biesse bSolid'],
  },
];

/**
 * 포맷별 파일 확장자 반환
 */
export function getFileExtension(format: ExportFormat): string {
  const formatInfo = SUPPORTED_EXPORT_FORMATS.find((f) => f.format === format);
  return formatInfo?.extension || '.txt';
}

/**
 * 포맷별 MIME 타입 반환
 */
export function getMimeType(format: ExportFormat): string {
  switch (format) {
    case 'csv':
      return 'text/csv';
    case 'dxf':
      return 'application/dxf';
    case 'mpr':
      return 'application/octet-stream';
    case 'cix':
      return 'application/xml';
    default:
      return 'application/octet-stream';
  }
}
