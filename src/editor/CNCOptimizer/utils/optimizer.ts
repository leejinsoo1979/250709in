import { Panel, StockPanel, OptimizedResult, PlacedPanel } from '../types';
import { SimplePacker, Rect, packIntoBins, PackedBin } from './simpleBinPacking';
import { AlignedPacker, packWithAlignment } from './alignedPacking';
import { ImprovedPacker, packWithImprovedAlgorithm } from './improvedPacking';
import { packSimple, SimplePacker as SimplePackerClass } from './simplePacking';
import { packColumns } from './columnPacking';
import { packCutsaw } from './cutsawPacking';
import { packGuillotine } from './guillotinePacking';

/**
 * 시트 간 재최적화 함수
 * 모든 패널을 수집하여 완전히 다시 패킹
 */
function optimizeBins(bins: PackedBin[], binWidth: number, binHeight: number, kerf: number): PackedBin[] {
  console.log(`\n=== Starting Bin Redistribution ===`);
  console.log(`Initial bins: ${bins.length}`);
  
  // 효율 분석
  bins.forEach((bin, index) => {
    console.log(`Bin ${index + 1}: ${bin.panels.length} panels, ${bin.efficiency.toFixed(1)}% efficiency`);
  });
  
  // 효율이 낮은 시트 감지 (20% 미만이거나 패널이 2개 이하)
  const hasLowEfficiencyBin = bins.some(bin => 
    (bin.efficiency < 20 && bin.panels.length <= 2) || 
    (bin.efficiency < 15)
  );
  
  if (!hasLowEfficiencyBin) {
    console.log('No low efficiency bins detected, keeping original layout');
    return bins;
  }
  
  console.log('Low efficiency bins detected, starting complete redistribution...');
  
  // 모든 패널을 수집
  const allPanels: Rect[] = [];
  bins.forEach(bin => {
    allPanels.push(...bin.panels);
  });
  
  console.log(`Total panels to redistribute: ${allPanels.length}`);
  
  // 패널을 크기별로 그룹화
  const largePanels: Rect[] = [];
  const mediumPanels: Rect[] = [];
  const smallPanels: Rect[] = [];
  
  allPanels.forEach(panel => {
    const area = panel.width * panel.height;
    const maxDimension = Math.max(panel.width, panel.height);
    
    if (area > 500000 || maxDimension > 1000) {
      largePanels.push(panel);
    } else if (area > 200000 || maxDimension > 600) {
      mediumPanels.push(panel);
    } else {
      smallPanels.push(panel);
    }
  });
  
  console.log(`Panel distribution: ${largePanels.length} large, ${mediumPanels.length} medium, ${smallPanels.length} small`);
  
  // 새로운 빈 생성 및 패널 재배치
  const newBins: PackedBin[] = [];
  let currentBinIndex = 0;
  
  // 재정렬된 패널 리스트 (큰 것부터 작은 것 순서로)
  const sortedPanels = [
    ...largePanels.sort((a, b) => b.height * b.width - a.height * a.width),
    ...mediumPanels.sort((a, b) => b.height * b.width - a.height * a.width),
    ...smallPanels.sort((a, b) => b.height * b.width - a.height * a.width)
  ];
  
  // First Fit Decreasing with backtracking
  const remainingPanels = [...sortedPanels];
  
  while (remainingPanels.length > 0) {
    const packer = new SimplePackerClass(binWidth, binHeight, kerf);
    const placedInThisBin: number[] = [];
    
    // 첫 번째 패스: 큰 패널부터 배치
    for (let i = 0; i < remainingPanels.length; i++) {
      const panel = remainingPanels[i];
      const packed = packer.pack(panel);
      
      if (packed) {
        placedInThisBin.push(i);
      }
    }
    
    // 두 번째 패스: 남은 공간에 작은 패널 채우기
    for (let i = 0; i < remainingPanels.length; i++) {
      if (placedInThisBin.includes(i)) continue;
      
      const panel = remainingPanels[i];
      const packed = packer.pack(panel);
      
      if (packed) {
        placedInThisBin.push(i);
      }
    }
    
    if (placedInThisBin.length === 0) {
      console.warn('Cannot place remaining panels, keeping them in separate bin');
      break;
    }
    
    // 배치된 패널들을 제거
    placedInThisBin.sort((a, b) => b - a);
    for (const idx of placedInThisBin) {
      remainingPanels.splice(idx, 1);
    }
    
    const result = packer.getResult();
    newBins.push(result);
    console.log(`New bin ${newBins.length}: ${result.panels.length} panels, ${result.efficiency.toFixed(1)}% efficiency`);
    
    currentBinIndex++;
    if (currentBinIndex >= 10) {
      console.warn('Maximum bins reached');
      break;
    }
  }
  
  // 남은 패널이 있다면 마지막 빈에 추가
  if (remainingPanels.length > 0) {
    const finalBins = packSimple(remainingPanels, binWidth, binHeight, kerf, 1);
    if (finalBins.length > 0) {
      newBins.push(...finalBins);
    }
  }
  
  console.log(`\n=== Redistribution Complete ===`);
  console.log(`Result: ${bins.length} bins → ${newBins.length} bins`);
  
  // 효율이 개선되었는지 확인
  const oldTotalEfficiency = bins.reduce((sum, bin) => sum + bin.efficiency, 0) / bins.length;
  const newTotalEfficiency = newBins.reduce((sum, bin) => sum + bin.efficiency, 0) / newBins.length;
  
  console.log(`Average efficiency: ${oldTotalEfficiency.toFixed(1)}% → ${newTotalEfficiency.toFixed(1)}%`);
  
  // 개선되었거나 빈 수가 줄었으면 새 레이아웃 사용
  if (newBins.length < bins.length || newTotalEfficiency > oldTotalEfficiency + 5) {
    console.log('Using optimized layout');
    return newBins;
  } else {
    console.log('Keeping original layout (no significant improvement)');
    return bins;
  }
}

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
  kerf: number = 5,  // 톱날 두께 매개변수 추가
  optimizationType: 'cnc' | 'cutsaw' = 'cnc'  // 최적화 타입 추가
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

  // 최적화 타입에 따라 다른 알고리즘 사용
  let bins: PackedBin[];
  
  if (optimizationType === 'cutsaw') {
    console.log('Using Guillotine Cut optimization (horizontal/vertical strips)');
    bins = packGuillotine(
      rectangles,
      stockPanel.width,
      stockPanel.height,
      kerf,
      maxSheets
    );
  } else {
    console.log('Using CNC optimization (free placement)');
    bins = packSimple(
      rectangles,
      stockPanel.width,
      stockPanel.height,
      kerf,
      maxSheets
    );
    
    // CNC 모드에서만 재최적화 수행
    bins = optimizeBins(bins, stockPanel.width, stockPanel.height, kerf);
  }

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