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
}

export interface StockSheet {
  label?: string;
  width: number;
  length: number;
  thickness?: number;
  quantity: number;
  material?: string;
}

export interface CutSettings {
  unit: Unit;
  kerf: number;
  trimTop?: number;
  trimLeft?: number;
  labelsOnPanels?: boolean;
  singleSheetOnly?: boolean;
  considerMaterial?: boolean;
  edgeBanding?: boolean;
  considerGrain?: boolean;
  alignVerticalCuts?: boolean;
}