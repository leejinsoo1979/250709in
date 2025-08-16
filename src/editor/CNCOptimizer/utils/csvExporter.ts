import { Panel, StockPanel } from '../types';

export type Grain = 'H' | 'V' | 'NONE';
export type Unit = 'mm' | 'cm' | 'in';

export interface CutListPanel {
  id: string;
  label: string;
  width: number;
  length: number;
  thickness: number;
  quantity: number;
  material: string;
  grain: Grain;
  canRotate: boolean;
}

export interface CutListStock {
  label: string;
  width: number;
  length: number;
  thickness: number;
  quantity: number;
  material: string;
}

export interface CutSettings {
  unit: Unit;
  kerf: number; // 톱날 두께
  trimTop: number; // 상단 트리밍
  trimBottom: number; // 하단 트리밍
  trimLeft: number; // 좌측 트리밍
  trimRight: number; // 우측 트리밍
  allowGrainRotation: boolean;
}

// CutList Optimizer CSV 헤더
const PANEL_CSV_HEADERS = 'Length,Width,Qty,Label,Enabled,Grain';
const STOCK_CSV_HEADERS = 'Length,Width,Qty,Label';

// 패널 데이터를 CutList Optimizer CSV 형식으로 변환
export const exportPanelsToCSV = (panels: Panel[], settings: CutSettings = {
  unit: 'mm',
  kerf: 5,
  trimTop: 0,
  trimBottom: 0,
  trimLeft: 0,
  trimRight: 0,
  allowGrainRotation: false
}): string => {
  const lines: string[] = [PANEL_CSV_HEADERS];
  
  panels.forEach(panel => {
    // 결 방향 결정
    // 1. panel에 이미 grain이 있으면 그것을 사용
    // 2. 없으면 세로가 기본 (height > width면 V, 아니면 H)
    let grain = 'V'; // 기본값은 세로
    if (panel.grain) {
      // 이미 설정된 grain 값 사용
      grain = panel.grain === 'VERTICAL' || panel.grain === 'WIDTH' ? 'V' : 
              panel.grain === 'HORIZONTAL' || panel.grain === 'LENGTH' ? 'H' : 'V';
    } else {
      // grain이 없으면 세로가 긴 경우 V, 가로가 긴 경우 H
      grain = panel.height > panel.width ? 'V' : 'H';
    }
    
    // CutList Optimizer는 Length가 세로, Width가 가로
    const line = [
      panel.height, // Length (세로)
      panel.width,  // Width (가로)
      panel.quantity,
      panel.name.replace(/,/g, '_'), // 콤마 제거
      'TRUE', // Enabled
      settings.allowGrainRotation ? 'NONE' : grain
    ].join(',');
    
    lines.push(line);
  });
  
  return lines.join('\n');
};

// 재고 시트를 CutList Optimizer CSV 형식으로 변환
export const exportStockToCSV = (stockPanels: StockPanel[]): string => {
  const lines: string[] = [STOCK_CSV_HEADERS];
  
  stockPanels.forEach(stock => {
    const line = [
      stock.height, // Length (세로)
      stock.width,  // Width (가로)
      stock.stock || 999, // 재고 수량 (무제한이면 999)
      `${stock.material}_${stock.color}` // 라벨
    ].join(',');
    
    lines.push(line);
  });
  
  return lines.join('\n');
};

// 설정을 INI 형식으로 내보내기 (CutList Optimizer Settings)
export const exportSettingsToINI = (settings: CutSettings): string => {
  const lines = [
    '[Settings]',
    `Unit=${settings.unit}`,
    `Kerf=${settings.kerf}`,
    `TrimTop=${settings.trimTop}`,
    `TrimBottom=${settings.trimBottom}`,
    `TrimLeft=${settings.trimLeft}`,
    `TrimRight=${settings.trimRight}`,
    `AllowGrainRotation=${settings.allowGrainRotation}`,
    '',
    '[Optimization]',
    'Algorithm=FFD', // First Fit Decreasing
    'Minimize=Waste',
    'EdgeBanding=false',
    'ConsiderGrainDirection=true'
  ];
  
  return lines.join('\n');
};

// 전체 프로젝트를 CutList Optimizer 형식으로 내보내기
export const exportToCutListOptimizer = (
  panels: Panel[],
  stockPanels: StockPanel[],
  settings: CutSettings,
  projectName: string = 'project'
): { panelsCSV: string; stockCSV: string; settingsINI: string; } => {
  const panelsCSV = exportPanelsToCSV(panels, settings);
  const stockCSV = exportStockToCSV(stockPanels);
  const settingsINI = exportSettingsToINI(settings);
  
  return {
    panelsCSV,
    stockCSV,
    settingsINI
  };
};

// ZIP 파일로 묶어서 다운로드
export const downloadCutListFiles = async (
  panels: Panel[],
  stockPanels: StockPanel[],
  settings: CutSettings,
  projectName: string = 'cutlist'
) => {
  const { panelsCSV, stockCSV, settingsINI } = exportToCutListOptimizer(
    panels,
    stockPanels,
    settings,
    projectName
  );
  
  // 패널 CSV 다운로드
  const panelBlob = new Blob([panelsCSV], { type: 'text/csv;charset=utf-8;' });
  const panelUrl = URL.createObjectURL(panelBlob);
  const panelLink = document.createElement('a');
  panelLink.href = panelUrl;
  panelLink.download = `${projectName}_panels.csv`;
  panelLink.click();
  URL.revokeObjectURL(panelUrl);
  
  // 잠시 대기
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // 재고 CSV 다운로드
  const stockBlob = new Blob([stockCSV], { type: 'text/csv;charset=utf-8;' });
  const stockUrl = URL.createObjectURL(stockBlob);
  const stockLink = document.createElement('a');
  stockLink.href = stockUrl;
  stockLink.download = `${projectName}_stock.csv`;
  stockLink.click();
  URL.revokeObjectURL(stockUrl);
  
  // 잠시 대기
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // 설정 INI 다운로드
  const settingsBlob = new Blob([settingsINI], { type: 'text/plain;charset=utf-8;' });
  const settingsUrl = URL.createObjectURL(settingsBlob);
  const settingsLink = document.createElement('a');
  settingsLink.href = settingsUrl;
  settingsLink.download = `${projectName}_settings.ini`;
  settingsLink.click();
  URL.revokeObjectURL(settingsUrl);
};