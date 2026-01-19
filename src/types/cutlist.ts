export type Grain = 'H' | 'V' | 'NONE';
export type Unit = 'mm' | 'cm' | 'in';

export interface Panel {
  id: string;
  label: string;
  width: number;   // short side
  length: number;  // long side
  thickness: number;
  quantity: number;
  material?: string;
  grain?: Grain;
  canRotate?: boolean;
  boringPositions?: number[];  // 측판 보링 Y위치 (패널 기준 mm)
}

export interface StockSheet {
  label?: string;
  width: number;
  length: number;
  thickness?: number;
  quantity: number;
  material?: string;
}

export type OptimizationType = 'BY_LENGTH' | 'BY_WIDTH' | 'OPTIMAL_CNC';

export interface CutSettings {
  unit: Unit;
  kerf: number;
  trimTop?: number;
  trimBottom?: number;
  trimLeft?: number;
  trimRight?: number;
  labelsOnPanels?: boolean;
  singleSheetOnly?: boolean;
  considerMaterial?: boolean;
  edgeBanding?: boolean;
  considerGrain?: boolean;
  alignVerticalCuts?: boolean;
  optimizationType?: OptimizationType;
}

// Cutting simulation types
export type CutAxis = 'x' | 'y';

export interface WorkPiece {
  width: number;
  length: number;
}

export interface Placement {
  sheetId: string;
  panelId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotated?: boolean;
}

export interface CutStep {
  id: string;
  order: number;
  sheetId: string;
  panelId?: string;
  axis: CutAxis;
  pos: number;
  spanStart: number;
  spanEnd: number;
  before: WorkPiece;      // 재단 전 워크피스 크기
  result: WorkPiece;      // 재단 결과물 크기
  yieldsPanelId?: string; // 이 재단으로 완성되는 패널 ID
  kerf?: number;
  label?: string;
  source: 'engine' | 'derived';
}

export interface SawStats {
  bySheet: Record<string, number>;  // 시트별 톱날 이동 길이
  total: number;                    // 전체 톱날 이동 길이
  unit: 'mm' | 'm';                // 단위
  totalCuts?: number;              // 총 절단 횟수
  avgKerf?: number;                // 평균 kerf 두께
  details?: Record<string, {       // 시트별 상세 통계
    horizontal: number;            // 가로 절단 길이
    vertical: number;              // 세로 절단 길이
    cuts: number;                  // 절단 횟수
  }>;
}