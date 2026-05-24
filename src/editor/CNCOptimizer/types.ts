// CNC 옵티마이저 타입 정의
export interface GroovePosition {
  y: number;       // 홈 Y 위치 (패널 하단 기준 mm)
  height: number;  // 홈 높이 (mm)
  depth: number;   // 홈 깊이 (mm)
}

export interface BoringDepthGroup {
  y: number;
  depthPositions: number[];
  boringType?: 'fixed-panel' | 'movable-shelf';
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
  boringDepthGroups?: BoringDepthGroup[]; // Y 위치별 보링 X위치 (고정패널 3공/이동선반 2공 혼합용)
  sideBoringPositions?: number[]; // 천지판/고정선반 측면 피스 유도보링 위치 (패널 height/depth 기준)
  sideBoringDiameter?: number; // 측면 피스 유도보링 직경
  sideBoringDepth?: number; // 측면 피스 유도보링 깊이
  groovePositions?: GroovePosition[]; // 바닥판 끼우는 홈 위치
  // 도어 힌지 보링 전용 필드
  screwPositions?: number[]; // 나사홀 Y위치 (힌지컵 상하 각 22.5mm)
  screwDepthPositions?: number[]; // 나사홀 X위치
  isDoor?: boolean; // 도어 패널 여부
  isLeftHinge?: boolean; // 힌지 방향 (left=true)
  screwHoleSpacing?: number; // 나사홀 간격 (45mm 또는 48mm)
  // 측판 힌지 브라켓 타공 전용 필드
  bracketBoringPositions?: number[];      // 브라켓 타공 Y좌표 (힌지 Y위치와 동일)
  bracketBoringDepthPositions?: number[]; // 브라켓 타공 X좌표 [20, 52]
  isBracketSide?: boolean;                // 브라켓 타공 대상 측판 여부
  // 따내기 (노치) 정보
  cornerNotch?: { width: number; depth: number; side: 'left' | 'right' };  // 상판 따내기
  sideNotches?: Array<{ y: number; z: number; fromBottom: number }>;       // 측판 따내기
  rebate?: { width: number; height: number; position: string };            // 반턱 따내기
  // 3D 뷰어 패널 하이라이트용
  meshName?: string;                       // 3D mesh 매칭용 패널 이름 (예: "좌측판", "선반 1")
  furnitureId?: string;                    // 해당 패널이 속한 가구 ID
  sourceFurnitureIds?: string[];            // 병합 패널이 실제로 포함하는 가구 ID들
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
  // 비규격: 1220×2440 원장 초과 패널들을 모은 시트 (별도 표시용)
  isOversized?: boolean;
}

export interface PlacedPanel extends Panel {
  x: number;
  y: number;
  rotated: boolean;
  grain?: 'NONE' | 'LENGTH' | 'WIDTH' | 'HORIZONTAL' | 'VERTICAL';
  thickness?: number;
  label?: string;
  boringDepthPositions?: number[]; // 서랍 측판 보링 X위치 (width 기준)
  boringDepthGroups?: BoringDepthGroup[];
  sideBoringPositions?: number[];
  sideBoringDiameter?: number;
  sideBoringDepth?: number;
  // 측판 힌지 브라켓 타공 전용 필드
  bracketBoringPositions?: number[];
  bracketBoringDepthPositions?: number[];
  isBracketSide?: boolean;
  // 따내기 (노치) 정보 — Panel에서 상속되지만 PlacedPanel에서도 명시
  cornerNotch?: { width: number; depth: number; side: 'left' | 'right' };
  sideNotches?: Array<{ y: number; z: number; fromBottom: number }>;
  rebate?: { width: number; height: number; position: string };
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
