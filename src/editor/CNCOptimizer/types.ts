// CNC 옵티마이저 타입 정의
export interface GroovePosition {
  y: number;       // 홈 Y 위치 (패널 하단 기준 mm)
  height: number;  // 홈 높이 (mm)
  depth: number;   // 홈 깊이 (mm)
}

export interface Panel {
  id: string;
  name: string;
  width: number;
  height: number;
  thickness?: number;
  material: string;
  color: string;
  quantity: number;
  grain?: 'NONE' | 'LENGTH' | 'WIDTH' | 'HORIZONTAL' | 'VERTICAL';
  boringPositions?: number[]; // 해당 패널의 보링 Y위치 (패널 기준 mm, height 기준 상중하)
  boringDepthPositions?: number[]; // 해당 패널의 보링 X위치 (패널 기준 mm, width 기준 앞뒤)
  groovePositions?: GroovePosition[]; // 바닥판 끼우는 홈 위치
  // 도어 힌지 보링 전용 필드
  screwPositions?: number[]; // 나사홀 Y위치 (힌지컵 상하 각 22.5mm)
  screwDepthPositions?: number[]; // 나사홀 X위치
  isDoor?: boolean; // 도어 패널 여부
  isLeftHinge?: boolean; // 힌지 방향 (left=true)
}

export interface StockPanel {
  id: string;
  width: number;
  height: number;
  material: string;
  color: string;
  price: number;
  stock: number;
  thickness?: number;
}

export interface OptimizedResult {
  stockPanel: StockPanel;
  panels: PlacedPanel[];
  efficiency: number;
  wasteArea: number;
  usedArea: number;
}

export interface PlacedPanel extends Panel {
  x: number;
  y: number;
  rotated: boolean;
  grain?: 'NONE' | 'LENGTH' | 'WIDTH' | 'HORIZONTAL' | 'VERTICAL';
  thickness?: number;
  label?: string;
  boringDepthPositions?: number[]; // 서랍 측판 보링 X위치 (width 기준)
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