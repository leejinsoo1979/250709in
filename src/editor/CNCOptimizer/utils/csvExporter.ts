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

// 보링 CSV 헤더 (별도 파일)
const BORING_CSV_HEADERS = 'Panel_Name,Hole_No,X,Y,Z,Diameter';

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
    let grain = 'V';
    if (panel.grain) {
      grain = panel.grain === 'VERTICAL' || panel.grain === 'WIDTH' ? 'V' :
              panel.grain === 'HORIZONTAL' || panel.grain === 'LENGTH' ? 'H' : 'V';
    } else {
      grain = panel.height > panel.width ? 'V' : 'H';
    }

    const line = [
      panel.height,
      panel.width,
      panel.quantity,
      panel.name.replace(/,/g, '_'),
      'TRUE',
      settings.allowGrainRotation ? 'NONE' : grain
    ].join(',');

    lines.push(line);
  });

  return lines.join('\n');
};

/**
 * 패널별 보링 좌표 CSV 생성
 * 각 보링 홀: Panel_Name, Hole_No, X, Y, Z(타공깊이), Diameter
 *
 * 측판 보링 좌표 기준 (CNC 테이블에 패널을 놓았을 때):
 * - X: 깊이 방향 (앞쪽 50mm, 중앙, 뒤쪽 50mm - 백패널 18mm 제외)
 * - Y: 높이 방향 (패널 하단 = 0)
 * - Z: 타공 깊이 (관통홀이므로 패널 두께 = 18mm)
 * - Diameter: 3mm
 */
export const exportBoringToCSV = (panels: Panel[]): string => {
  const lines: string[] = [BORING_CSV_HEADERS];

  const HOLE_DIAMETER = 3; // mm
  const HOLE_DEPTH = 18; // mm (관통홀 = 패널 두께)
  const EDGE_OFFSET = 50; // mm (앞/뒤 끝에서 50mm)
  const BACK_PANEL_THICKNESS = 18; // mm

  let holeNo = 1;

  panels.forEach(panel => {
    // 보링 위치가 있는 패널만 처리 (측판)
    if (!panel.boringPositions || panel.boringPositions.length === 0) {
      return;
    }

    // 패널 너비 = 가구 깊이 방향
    const panelWidth = panel.width;

    // X 위치 3개 (깊이 방향)
    const frontX = EDGE_OFFSET; // 50mm
    const backX = panelWidth - BACK_PANEL_THICKNESS - EDGE_OFFSET;
    const safeBackX = Math.max(backX, frontX + 40);
    const centerX = (frontX + safeBackX) / 2;
    const xPositions = [frontX, centerX, safeBackX];

    // 각 Y 위치에 대해 3개의 X 위치
    panel.boringPositions.forEach(yPos => {
      xPositions.forEach(xPos => {
        const line = [
          panel.name.replace(/,/g, '_'),
          holeNo,
          Math.round(xPos),
          Math.round(yPos),
          HOLE_DEPTH,
          HOLE_DIAMETER
        ].join(',');
        lines.push(line);
        holeNo++;
      });
    });
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

  // 잠시 대기
  await new Promise(resolve => setTimeout(resolve, 100));

  // 보링 CSV 다운로드 (측판에 보링이 있는 경우만)
  const boringCSV = exportBoringToCSV(panels);
  const boringLines = boringCSV.split('\n');
  if (boringLines.length > 1) { // 헤더 외에 데이터가 있으면
    const boringBlob = new Blob(['\uFEFF' + boringCSV], { type: 'text/csv;charset=utf-8;' }); // BOM 추가
    const boringUrl = URL.createObjectURL(boringBlob);
    const boringLink = document.createElement('a');
    boringLink.href = boringUrl;
    boringLink.download = `${projectName}_boring.csv`;
    boringLink.click();
    URL.revokeObjectURL(boringUrl);
  }
};