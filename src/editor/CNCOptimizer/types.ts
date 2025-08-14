// CNC 옵티마이저 타입 정의
export interface Panel {
  id: string;
  name: string;
  width: number;
  height: number;
  material: string;
  color: string;
  quantity: number;
  grain?: 'NONE' | 'LENGTH' | 'WIDTH' | 'HORIZONTAL' | 'VERTICAL';
}

export interface StockPanel {
  id: string;
  width: number;
  height: number;
  material: string;
  color: string;
  price: number;
  stock: number;
}

export interface OptimizedResult {
  stockPanel: StockPanel;
  panels: PlacedPanel[];
  efficiency: number;
  wasteArea: number;
}

export interface PlacedPanel extends Panel {
  x: number;
  y: number;
  rotated: boolean;
  grain?: 'NONE' | 'LENGTH' | 'WIDTH' | 'HORIZONTAL' | 'VERTICAL';
}

export interface CuttingGuide {
  type: 'horizontal' | 'vertical';
  position: number;
  start: number;
  end: number;
}

export interface PanelGroup {
  material: string;
  color: string;
  panels: Panel[];
  totalArea: number;
  totalQuantity: number;
}