export type CutAxis = 'x' | 'y';

export interface Size { 
  w: number; 
  l: number; 
}

export interface CutStep {
  id: string;
  sheetId: string;
  order: number; // order within sheet
  axis: CutAxis;
  pos: number;
  spanStart: number;
  spanEnd: number; // for preview
  before: Size; // workpiece BEFORE this cut
  made?: Size | null; // panel produced by this cut (if any)
  surplus?: Size | null; // leftover piece produced by this cut (if any)
  kerf?: number;
  source: 'engine' | 'derived';
}