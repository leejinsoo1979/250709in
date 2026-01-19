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

// ============================================
// 보링 좌표 CSV 내보내기
// ============================================

/**
 * 보링 좌표 인터페이스
 */
export interface BoringCoordinate {
  panelId: string;
  panelName: string;
  boringType: string;
  x: number;          // X 좌표 (mm) - 깊이 방향
  y: number;          // Y 좌표 (mm) - 높이 방향
  diameter: number;   // 직경 (mm)
  depth: number;      // 깊이 (mm)
  face: string;       // 가공면 (top, bottom, left, right, front, back)
}

/**
 * 측판 보링 좌표 데이터 생성 (관통홀 - CNC 테이블 기준)
 *
 * 측판 보링은 관통홀입니다. CNC 테이블에 측판을 평평하게 놓고 위에서 관통 가공합니다.
 * 패널 배치: 측판을 CNC 테이블에 놓을 때
 *   - X축 = 패널의 깊이 방향 (가구 깊이)
 *   - Y축 = 패널의 높이 방향 (측판 높이)
 *
 * @param panelId 패널 ID
 * @param panelName 패널 이름
 * @param panelWidth 패널 너비 (= 가구 깊이, mm) - CNC X축
 * @param panelHeight 패널 높이 (mm) - CNC Y축
 * @param boringYPositions 보링 Y 위치 배열 (패널 높이 방향 기준 mm)
 * @param panelThickness 패널 두께 (mm) - 관통 깊이
 */
export const generateSidePanelBoringCoordinates = (
  panelId: string,
  panelName: string,
  panelWidth: number,
  panelHeight: number,
  boringYPositions: number[],
  panelThickness: number = 18
): BoringCoordinate[] => {
  const coordinates: BoringCoordinate[] = [];

  // 설정값
  const backPanelThickness = 18; // 백패널 두께
  const edgeOffset = 50; // 끝에서 50mm
  const boringDiameter = 5; // 선반핀홀 직경

  // 깊이 방향 3개의 X 위치 (2D 뷰어와 동일)
  // CNC 테이블에서 X축 = 패널의 깊이 방향
  const frontX = edgeOffset; // 앞쪽에서 50mm
  const backX = panelWidth - backPanelThickness - edgeOffset; // 뒤쪽에서 50mm (백패널 고려)
  const centerX = (frontX + backX) / 2; // 가운데

  const depthPositions = [frontX, centerX, backX];
  const depthNames = ['전면', '중앙', '후면'];

  // 관통홀: 위에서 아래로 가공, 깊이 = 패널 두께 (관통)
  const face = 'top'; // 패널 상면에서 관통
  const boringDepth = panelThickness; // 관통이므로 패널 두께

  // 패널 높이 범위 내의 유효한 보링 위치만 사용
  const validYPositions = boringYPositions.filter(y => y > 0 && y < panelHeight);

  let boringIndex = 1;
  validYPositions.forEach((yPos) => {
    depthPositions.forEach((xPos, xIndex) => {
      coordinates.push({
        panelId: `${panelId}_boring_${boringIndex}`,
        panelName: panelName,
        boringType: `shelf-pin-${depthNames[xIndex]}`,
        x: Math.round(xPos * 10) / 10,  // CNC X = 깊이 방향
        y: Math.round(yPos * 10) / 10,  // CNC Y = 높이 방향
        diameter: boringDiameter,
        depth: boringDepth, // 관통
        face: face
      });
      boringIndex++;
    });
  });

  return coordinates;
};

/**
 * 보링 좌표 CSV 헤더
 */
const BORING_CSV_HEADERS = 'Panel_ID,Panel_Name,Boring_Type,X_mm,Y_mm,Diameter_mm,Depth_mm,Face';

/**
 * 보링 좌표를 CSV 형식으로 내보내기
 */
export const exportBoringCoordinatesToCSV = (
  coordinates: BoringCoordinate[]
): string => {
  const lines: string[] = [BORING_CSV_HEADERS];

  coordinates.forEach(coord => {
    const line = [
      coord.panelId,
      coord.panelName.replace(/,/g, '_'), // 콤마 제거
      coord.boringType,
      coord.x.toFixed(1),
      coord.y.toFixed(1),
      coord.diameter.toFixed(1),
      coord.depth.toFixed(1),
      coord.face
    ].join(',');

    lines.push(line);
  });

  return lines.join('\n');
};

/**
 * 전체 패널에 대한 보링 좌표 생성 및 CSV 내보내기
 *
 * @param sidePanels 측판 정보 배열 [{id, name, width, height, boringPositions, isLeft}, ...]
 */
export interface SidePanelBoringInfo {
  id: string;
  name: string;
  width: number;          // 패널 너비 (= 가구 깊이)
  height: number;         // 패널 높이
  boringPositions: number[]; // 보링 Y 위치들 (패널 기준)
  isLeft: boolean;        // 좌측판 여부
}

export const exportAllBoringCoordinatesToCSV = (
  sidePanels: SidePanelBoringInfo[],
  panelThickness: number = 18
): string => {
  const allCoordinates: BoringCoordinate[] = [];

  sidePanels.forEach(panel => {
    const coordinates = generateSidePanelBoringCoordinates(
      panel.id,
      panel.name,
      panel.width,
      panel.height,
      panel.boringPositions,
      panelThickness // 관통홀이므로 패널 두께 전달
    );
    allCoordinates.push(...coordinates);
  });

  return exportBoringCoordinatesToCSV(allCoordinates);
};

/**
 * 보링 좌표 CSV 파일 다운로드
 *
 * @param sidePanels 측판 정보 배열
 * @param fileName 파일명 (확장자 제외)
 * @param panelThickness 패널 두께 (mm) - 관통홀 깊이, 기본 18mm
 */
export const downloadBoringCoordinatesCSV = (
  sidePanels: SidePanelBoringInfo[],
  fileName: string = 'boring_coordinates',
  panelThickness: number = 18
) => {
  const csvContent = exportAllBoringCoordinatesToCSV(sidePanels, panelThickness);

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' }); // BOM 추가
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};