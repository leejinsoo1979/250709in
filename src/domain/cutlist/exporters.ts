/**
 * CutList Optimizer 익스포터
 */

import { CutListPanel, CutListStock, CutSettings, ConversionResult } from './types';
import { arrayToCSVRow } from './csvUtils';
import { normalizePanelList, sanitizeLabel, roundToDecimals } from './normalizers';

/**
 * 패널을 CutList Optimizer CSV 형식으로 변환
 * 형식: Length,Width,Qty,Label,Enabled,Grain
 */
export function panelsToCutListCSV(
  panels: CutListPanel[],
  settings?: CutSettings
): string {
  const headers = ['Length', 'Width', 'Qty', 'Label', 'Enabled', 'Grain'];
  const lines: string[] = [arrayToCSVRow(headers)];
  
  panels.forEach(panel => {
    const row = [
      roundToDecimals(panel.length, 1),    // Length (세로)
      roundToDecimals(panel.width, 1),     // Width (가로)
      panel.quantity,                      // Qty
      sanitizeLabel(panel.label),          // Label
      panel.enabled ? 'TRUE' : 'FALSE',    // Enabled
      settings?.allowGrainRotation ? 'NONE' : panel.grain  // Grain
    ];
    lines.push(arrayToCSVRow(row));
  });
  
  return lines.join('\n');
}

/**
 * 재고를 CutList Optimizer CSV 형식으로 변환
 * 형식: Length,Width,Qty,Label
 */
export function stockToCutListCSV(stocks: CutListStock[]): string {
  const headers = ['Length', 'Width', 'Qty', 'Label'];
  const lines: string[] = [arrayToCSVRow(headers)];
  
  stocks.forEach(stock => {
    const row = [
      roundToDecimals(stock.length, 1),    // Length (세로)
      roundToDecimals(stock.width, 1),     // Width (가로)
      stock.quantity || 999,                // Qty (무제한이면 999)
      sanitizeLabel(stock.label)           // Label
    ];
    lines.push(arrayToCSVRow(row));
  });
  
  return lines.join('\n');
}

/**
 * 설정을 INI 형식으로 변환
 */
export function settingsToINI(settings: CutSettings): string {
  const lines: string[] = [];
  
  // [General] 섹션
  lines.push('[General]');
  lines.push(`Unit=${settings.unit}`);
  lines.push(`CutBlade=${settings.kerf}`);
  lines.push('');
  
  // [Optimization] 섹션
  lines.push('[Optimization]');
  lines.push(`Algorithm=FFD`);
  lines.push(`MinimizeWaste=${settings.minimizeWaste ? 'true' : 'false'}`);
  lines.push(`AllowRotation=${settings.allowGrainRotation ? 'true' : 'false'}`);
  lines.push(`EdgeBanding=${settings.edgeBanding ? 'true' : 'false'}`);
  lines.push('');
  
  // [Trim] 섹션
  lines.push('[Trim]');
  lines.push(`Top=${settings.trimTop}`);
  lines.push(`Bottom=${settings.trimBottom}`);
  lines.push(`Left=${settings.trimLeft}`);
  lines.push(`Right=${settings.trimRight}`);
  lines.push('');
  
  // [Display] 섹션
  lines.push('[Display]');
  lines.push('ShowLabels=true');
  lines.push('ShowDimensions=true');
  lines.push('ShowGrain=true');
  lines.push('ShowCuts=true');
  
  return lines.join('\n');
}

/**
 * 전체 프로젝트를 CutList Optimizer 형식으로 변환
 */
export function convertToCutListFormat(
  panels: any[],
  stocks: any[],
  settings: CutSettings
): ConversionResult {
  // 패널 정규화
  const normalizedPanels = normalizePanelList(panels, settings.unit);
  
  // 재고 정규화
  const normalizedStocks: CutListStock[] = stocks.map((stock, index) => ({
    id: stock.id || `stock-${index + 1}`,
    label: sanitizeLabel(`${stock.material}_${stock.color}` || `Stock ${index + 1}`),
    length: stock.height || 1220,  // 기본값 1220mm
    width: stock.width || 2440,    // 기본값 2440mm
    thickness: stock.thickness || 18,
    quantity: stock.stock || stock.quantity || 999,
    material: stock.material || 'PB',
    price: stock.price
  }));
  
  // CSV 생성
  const panelsCSV = panelsToCutListCSV(normalizedPanels, settings);
  const stockCSV = stockToCutListCSV(normalizedStocks);
  const settingsINI = settingsToINI(settings);
  
  // 요약 정보 계산
  const totalArea = normalizedPanels.reduce((sum, panel) => {
    return sum + (panel.length * panel.width * panel.quantity) / 1000000; // m²
  }, 0);
  
  const materials = [...new Set(normalizedPanels.map(p => p.material))];
  
  // 대략적인 필요 시트 수 계산 (간단한 추정)
  const stockArea = normalizedStocks[0] ? 
    (normalizedStocks[0].length * normalizedStocks[0].width) / 1000000 : 2.98; // 기본 2440×1220
  const estimatedSheets = Math.ceil(totalArea / stockArea);
  
  return {
    panelsCSV,
    stockCSV,
    settingsINI,
    summary: {
      totalPanels: normalizedPanels.reduce((sum, p) => sum + p.quantity, 0),
      totalArea: roundToDecimals(totalArea, 2),
      materials,
      estimatedSheets
    }
  };
}

/**
 * 빠른 내보내기 - 기본 설정 사용
 */
export function quickExport(panels: any[], stocks: any[]): ConversionResult {
  const defaultSettings: CutSettings = {
    unit: 'mm',
    kerf: 5,
    trimTop: 0,
    trimBottom: 0,
    trimLeft: 0,
    trimRight: 0,
    allowGrainRotation: false,
    edgeBanding: false,
    minimizeWaste: true
  };
  
  return convertToCutListFormat(panels, stocks, defaultSettings);
}