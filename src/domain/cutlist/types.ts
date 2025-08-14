/**
 * CutList Optimizer 연동을 위한 타입 정의
 */

export type Grain = 'H' | 'V' | 'NONE';
export type Unit = 'mm' | 'cm' | 'in';
export type Material = 'PB' | 'MDF' | 'PLY' | 'HPL' | 'LPM';

/**
 * 패널 인터페이스 - CutList Optimizer 형식
 */
export interface CutListPanel {
  id: string;
  label: string;
  length: number;  // 세로 (Y축)
  width: number;   // 가로 (X축)
  thickness: number;
  quantity: number;
  material: Material;
  grain: Grain;
  enabled: boolean;
  canRotate: boolean;
}

/**
 * 재고 시트 인터페이스
 */
export interface CutListStock {
  id: string;
  label: string;
  length: number;  // 세로 (Y축)
  width: number;   // 가로 (X축)
  thickness: number;
  quantity: number;
  material: Material;
  price?: number;
}

/**
 * 절단 설정 인터페이스
 */
export interface CutSettings {
  unit: Unit;
  kerf: number;           // 톱날 두께
  trimTop: number;        // 상단 트리밍
  trimBottom: number;     // 하단 트리밍
  trimLeft: number;       // 좌측 트리밍
  trimRight: number;      // 우측 트리밍
  allowGrainRotation: boolean;  // 결 방향 무시 허용
  edgeBanding: boolean;   // 엣지밴딩 고려
  minimizeWaste: boolean; // 폐기물 최소화 우선
}

/**
 * 최적화 알고리즘 옵션
 */
export type OptimizationAlgorithm = 'FFD' | 'BFD' | 'GUILLOTINE' | 'MAXRECT';

/**
 * 최적화 설정
 */
export interface OptimizationSettings {
  algorithm: OptimizationAlgorithm;
  priority: 'WASTE' | 'CUTS' | 'SHEETS';
  maxIterations?: number;
  timeLimit?: number; // seconds
}

/**
 * 내보내기 옵션
 */
export interface ExportOptions {
  includeSettings: boolean;
  includeStock: boolean;
  includePanels: boolean;
  fileName?: string;
  separateFiles: boolean;
}

/**
 * 변환 결과
 */
export interface ConversionResult {
  panelsCSV: string;
  stockCSV: string;
  settingsINI: string;
  summary: {
    totalPanels: number;
    totalArea: number;
    materials: string[];
    estimatedSheets: number;
  };
}