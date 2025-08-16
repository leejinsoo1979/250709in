import { Panel, StockPanel, OptimizedResult, PlacedPanel } from '../types';
import { SimplePacker, Rect, packIntoBins } from './simpleBinPacking';
import { AlignedPacker, packWithAlignment } from './alignedPacking';
import { ImprovedPacker, packWithImprovedAlgorithm } from './improvedPacking';
import { packSimple } from './simplePacking';
import { packColumns } from './columnPacking';

// SimplePacker 알고리즘을 사용한 최적화 (안정적이고 겹침 없음)
export const optimizePanels = async (
  panels: Panel[],
  stockPanel: StockPanel,
  kerf: number = 5  // 톱날 두께 매개변수 추가
): Promise<OptimizedResult | null> => {
  // 모든 패널을 Rect 형식으로 변환
  const rectangles: Rect[] = [];
  const panelMap = new Map<string, Panel>();
  
  panels.forEach(panel => {
    for (let i = 0; i < panel.quantity; i++) {
      const id = `${panel.id}-${i}`;
      const canRotate = panel.grain && panel.grain !== 'NONE' ? false : (panel.canRotate !== false);
      rectangles.push({
        id,
        width: panel.width,
        height: panel.height,
        // 패널의 추가 정보를 저장
        grain: panel.grain || 'NONE',
        material: panel.material,
        color: panel.color,
        name: panel.name,
        canRotate: canRotate
      });
      panelMap.set(id, panel);
    }
  });

  // SimplePacker 생성
  const packer = new SimplePacker(
    stockPanel.width,
    stockPanel.height,
    kerf // 전달받은 톱날 두께 사용
  );

  // 크기 순으로 정렬 (큰 것부터) + 세로로 긴 패널 우선
  rectangles.sort((a, b) => {
    // 먼저 면적으로 정렬
    const areaA = a.width * a.height;
    const areaB = b.width * b.height;
    if (areaA !== areaB) {
      return areaB - areaA; // 큰 것부터
    }
    
    // 면적이 같으면 세로로 긴 패널 우선 (height가 더 큰 것)
    const aspectA = a.height / a.width;
    const aspectB = b.height / b.width;
    return aspectB - aspectA;
  });

  // 패널 배치
  const placedPanels: PlacedPanel[] = [];
  const unplacedPanels: Rect[] = [];

  for (const rect of rectangles) {
    const result = packer.pack(rect); // pack 함수 내부에서 canRotate 확인
    if (result) {
      const originalPanel = panelMap.get(rect.id!)!;
      
      placedPanels.push({
        ...originalPanel,
        x: result.x || 0,
        y: result.y || 0,
        // 원래 패널 크기를 반드시 유지
        width: originalPanel.width,
        height: originalPanel.height,
        rotated: result.rotated || false,
        quantity: 1,
        grain: originalPanel.grain || 'NONE',
        material: originalPanel.material,
        color: originalPanel.color,
        name: originalPanel.name
      });
    } else {
      unplacedPanels.push(rect);
    }
  }

  if (placedPanels.length === 0) {
    return null;
  }

  // 효율 계산
  const packingResult = packer.getResult();
  
  return {
    stockPanel,
    panels: placedPanels,
    efficiency: packingResult.efficiency,
    wasteArea: packingResult.width * packingResult.height - packingResult.usedArea
  };
};

// 개선된 알고리즘을 사용한 최적화 (BFDH - Best Fit Decreasing Height)
export const optimizePanelsImproved = async (
  panels: Panel[],
  stockPanel: StockPanel
): Promise<OptimizedResult | null> => {
  // 모든 패널을 Rect 형식으로 변환
  const rectangles: Rect[] = [];
  const panelMap = new Map<string, Panel>();
  
  panels.forEach(panel => {
    for (let i = 0; i < panel.quantity; i++) {
      const id = `${panel.id}-${i}`;
      const canRotate = panel.grain && panel.grain !== 'NONE' ? false : (panel.canRotate !== false);
      rectangles.push({
        id,
        width: panel.width,
        height: panel.height,
        grain: panel.grain || 'NONE',
        material: panel.material,
        color: panel.color,
        name: panel.name,
        canRotate: canRotate
      });
      panelMap.set(id, panel);
    }
  });

  // ImprovedPacker 생성
  const packer = new ImprovedPacker(
    stockPanel.width,
    stockPanel.height,
    5 // 톱날 두께 (5mm로 증가)
  );

  // 높이순으로 정렬 (큰 것부터)
  rectangles.sort((a, b) => {
    const heightDiff = b.height - a.height;
    if (heightDiff !== 0) return heightDiff;
    return b.width - a.width;
  });

  // 패널 배치
  const placedPanels: PlacedPanel[] = [];

  for (const rect of rectangles) {
    const result = packer.pack(rect);
    if (result) {
      const originalPanel = panelMap.get(rect.id!)!;
      
      placedPanels.push({
        ...originalPanel,
        x: result.x || 0,
        y: result.y || 0,
        width: originalPanel.width,
        height: originalPanel.height,
        rotated: result.rotated || false,
        quantity: 1,
        grain: originalPanel.grain || 'NONE',
        material: originalPanel.material,
        color: originalPanel.color,
        name: originalPanel.name
      });
    }
  }

  if (placedPanels.length === 0) {
    return null;
  }

  // 효율 계산
  const packingResult = packer.getResult();
  
  return {
    stockPanel,
    panels: placedPanels,
    efficiency: packingResult.efficiency,
    wasteArea: packingResult.width * packingResult.height - packingResult.usedArea
  };
};

// 여러 원장에 최적화 (멀티 빈 패킹 - 정렬된 알고리즘 사용)
export const optimizePanelsMultiple = async (
  panels: Panel[],
  stockPanel: StockPanel,
  maxSheets: number = 999,  // 제한 없음
  useAlignedPacking: boolean = true,
  kerf: number = 5  // 톱날 두께 매개변수 추가
): Promise<OptimizedResult[]> => {
  // 모든 패널을 Rect 형식으로 변환
  const rectangles: Rect[] = [];
  const panelMap = new Map<string, Panel>();
  
  panels.forEach(panel => {
    for (let i = 0; i < panel.quantity; i++) {
      const id = `${panel.id}-${i}`;
      const canRotate = panel.grain && panel.grain !== 'NONE' ? false : (panel.canRotate !== false);
      rectangles.push({
        id,
        width: panel.width,
        height: panel.height,
        // 패널의 추가 정보를 저장
        grain: panel.grain || 'NONE',
        material: panel.material,
        color: panel.color,
        name: panel.name,
        canRotate: canRotate
      });
      panelMap.set(id, panel);
    }
  });

  // 안정적인 Simple 패킹 알고리즘 사용
  const bins = packSimple(
    rectangles,
    stockPanel.width,
    stockPanel.height,
    kerf, // 전달받은 톱날 두께 사용
    maxSheets // 최대 시트 수
  );

  // 결과 변환
  const results: OptimizedResult[] = [];
  
  bins.slice(0, maxSheets).forEach((bin, index) => {
    const placedPanels: PlacedPanel[] = bin.panels.map(rect => {
      const originalPanel = panelMap.get(rect.id!)!;
      return {
        ...originalPanel,
        x: rect.x || 0,
        y: rect.y || 0,
        // 원래 패널 크기를 유지 (회전해도 크기는 변경하지 않음)
        width: originalPanel.width,
        height: originalPanel.height,
        rotated: rect.rotated || false,
        quantity: 1,
        grain: originalPanel.grain || 'NONE',
        material: originalPanel.material,
        color: originalPanel.color,
        name: originalPanel.name
      };
    });

    results.push({
      stockPanel: { ...stockPanel, id: `${stockPanel.id}-${index}` },
      panels: placedPanels,
      efficiency: bin.efficiency,
      wasteArea: bin.width * bin.height - bin.usedArea
    });
  });

  return results;
};

// 개선된 알고리즘으로 여러 원장에 최적화
export const optimizePanelsMultipleImproved = async (
  panels: Panel[],
  stockPanel: StockPanel,
  maxSheets: number = 999  // 제한 없음
): Promise<OptimizedResult[]> => {
  // 모든 패널을 Rect 형식으로 변환
  const rectangles: Rect[] = [];
  const panelMap = new Map<string, Panel>();
  
  panels.forEach(panel => {
    for (let i = 0; i < panel.quantity; i++) {
      const id = `${panel.id}-${i}`;
      const canRotate = panel.grain && panel.grain !== 'NONE' ? false : (panel.canRotate !== false);
      rectangles.push({
        id,
        width: panel.width,
        height: panel.height,
        grain: panel.grain || 'NONE',
        material: panel.material,
        color: panel.color,
        name: panel.name,
        canRotate: canRotate
      });
      panelMap.set(id, panel);
    }
  });

  // 개선된 알고리즘으로 패킹
  const bins = packWithImprovedAlgorithm(
    rectangles,
    stockPanel.width,
    stockPanel.height,
    5, // 톱날 두께 (5mm로 증가)
    maxSheets
  );

  // 결과 변환
  const results: OptimizedResult[] = [];
  
  bins.forEach((bin, index) => {
    const placedPanels: PlacedPanel[] = bin.panels.map(rect => {
      const originalPanel = panelMap.get(rect.id!)!;
      return {
        ...originalPanel,
        x: rect.x || 0,
        y: rect.y || 0,
        width: originalPanel.width,
        height: originalPanel.height,
        rotated: rect.rotated || false,
        quantity: 1,
        grain: originalPanel.grain || 'NONE',
        material: originalPanel.material,
        color: originalPanel.color,
        name: originalPanel.name
      };
    });

    results.push({
      stockPanel: { ...stockPanel, id: `${stockPanel.id}-${index}` },
      panels: placedPanels,
      efficiency: bin.efficiency,
      wasteArea: bin.width * bin.height - bin.usedArea
    });
  });

  return results;
};