import { Panel, StockPanel, OptimizedResult, PlacedPanel } from '../types';
import { SimplePacker, Rect, packIntoBins } from './simpleBinPacking';
import { AlignedPacker, packWithAlignment } from './alignedPacking';

// SimplePacker 알고리즘을 사용한 최적화 (안정적이고 겹침 없음)
export const optimizePanels = async (
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
    3 // 톱날 두께
  );

  // 크기 순으로 정렬 (큰 것부터)
  rectangles.sort((a, b) => b.width * b.height - a.width * a.height);

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
        width: result.width,
        height: result.height,
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

// 여러 원장에 최적화 (멀티 빈 패킹 - 정렬된 알고리즘 사용)
export const optimizePanelsMultiple = async (
  panels: Panel[],
  stockPanel: StockPanel,
  maxSheets: number = 10,
  useAlignedPacking: boolean = true
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

  // 정렬된 패킹 또는 일반 패킹 실행
  const bins = useAlignedPacking 
    ? packWithAlignment(
        rectangles,
        stockPanel.width,
        stockPanel.height,
        3 // 톱날 두께
      )
    : packIntoBins(
        rectangles,
        stockPanel.width,
        stockPanel.height,
        3, // 톱날 두께
        true // 회전 허용
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
        width: rect.width,
        height: rect.height,
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