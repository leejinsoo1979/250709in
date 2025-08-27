/**
 * 컷쏘(Cut-saw) 최적화 알고리즘
 * L방향(세로) 우선 컷팅으로 한 줄씩 길게 자르는 방식
 * 계단식 배치가 아닌 열(Column) 단위 배치
 */

import { Rect, PackedBin } from './simpleBinPacking';

// 컬럼 타입 정의
interface Column {
  x: number;
  width: number;
  panels: Rect[];
  remainingHeight: number;
}

export class CutsawPacker {
  private binWidth: number;
  private binHeight: number;
  private kerf: number;
  private columns: Column[] = [];
  
  constructor(width: number, height: number, kerf: number = 5) {
    this.binWidth = width;
    this.binHeight = height;
    this.kerf = kerf;
  }
  
  /**
   * 컷쏘 방식으로 패널 배치 (세로 컬럼 우선)
   */
  pack(panel: Rect): Rect | null {
    // 기존 컬럼에 배치 시도
    for (const column of this.columns) {
      if (this.canPlaceInColumn(panel, column)) {
        return this.placeInColumn(panel, column);
      }
    }
    
    // 새 컬럼 생성 시도
    const newColumnX = this.getNextColumnX();
    
    // 원래 방향으로 새 컬럼 생성 가능한지 확인
    if (newColumnX + panel.width + this.kerf <= this.binWidth) {
      const newColumn: Column = {
        x: newColumnX,
        width: panel.width,
        panels: [],
        remainingHeight: this.binHeight
      };
      
      this.columns.push(newColumn);
      return this.placeInColumn(panel, newColumn);
    }
    
    // 회전해서 새 컬럼 생성 시도
    if (panel.canRotate && newColumnX + panel.height + this.kerf <= this.binWidth) {
      const newColumn: Column = {
        x: newColumnX,
        width: panel.height, // 회전된 너비
        panels: [],
        remainingHeight: this.binHeight
      };
      
      this.columns.push(newColumn);
      
      // 회전된 패널 배치
      const rotatedPanel = { ...panel, rotated: true };
      return this.placeInColumn(rotatedPanel, newColumn);
    }
    
    return null;
  }
  
  /**
   * 컬럼에 패널 배치 가능 여부 확인
   */
  private canPlaceInColumn(panel: Rect, column: Column): boolean {
    // 같은 너비의 컬럼에만 배치 (컷쏘 특성상 같은 너비끼리 묶음)
    const panelWidth = panel.rotated ? panel.height : panel.width;
    const panelHeight = panel.rotated ? panel.width : panel.height;
    
    // 너비가 같거나 비슷한 경우 (±5mm 허용)
    const widthMatch = Math.abs(column.width - panelWidth) <= 5;
    
    // 높이가 남아있는지 확인
    const heightFits = panelHeight + this.kerf <= column.remainingHeight;
    
    return widthMatch && heightFits;
  }
  
  /**
   * 컬럼에 패널 배치
   */
  private placeInColumn(panel: Rect, column: Column): Rect {
    const y = this.binHeight - column.remainingHeight;
    
    const placedPanel: Rect = {
      ...panel,
      x: column.x,
      y: y,
      width: panel.width,
      height: panel.height
    };
    
    column.panels.push(placedPanel);
    
    // 회전 여부에 따른 실제 높이 계산
    const actualHeight = panel.rotated ? panel.width : panel.height;
    column.remainingHeight -= actualHeight + this.kerf;
    
    return placedPanel;
  }
  
  /**
   * 다음 컬럼의 X 위치 계산
   */
  private getNextColumnX(): number {
    if (this.columns.length === 0) {
      return 0;
    }
    
    const lastColumn = this.columns[this.columns.length - 1];
    return lastColumn.x + lastColumn.width + this.kerf;
  }
  
  /**
   * 패킹 결과 반환
   */
  getResult(): PackedBin {
    const panels: Rect[] = [];
    let usedArea = 0;
    let maxX = 0;
    let maxY = 0;
    
    for (const column of this.columns) {
      for (const panel of column.panels) {
        panels.push(panel);
        
        const actualWidth = panel.rotated ? panel.height : panel.width;
        const actualHeight = panel.rotated ? panel.width : panel.height;
        
        usedArea += actualWidth * actualHeight;
        maxX = Math.max(maxX, panel.x + actualWidth);
        maxY = Math.max(maxY, panel.y + actualHeight);
      }
    }
    
    const totalArea = this.binWidth * this.binHeight;
    const efficiency = totalArea > 0 ? (usedArea / totalArea) * 100 : 0;
    
    console.log(`Cutsaw packing result: ${panels.length} panels in ${this.columns.length} columns, efficiency: ${efficiency.toFixed(1)}%`);
    
    return {
      width: this.binWidth,
      height: this.binHeight,
      panels,
      efficiency,
      usedArea
    };
  }
}

/**
 * 컷쏘 방식 멀티 빈 패킹
 */
export function packCutsaw(
  panels: Rect[],
  binWidth: number,
  binHeight: number,
  kerf: number = 5,
  maxBins: number = 999
): PackedBin[] {
  console.log(`\n=== Starting Cutsaw Packing (L-direction priority) ===`);
  console.log(`Total panels: ${panels.length}`);
  console.log(`Bin size: ${binWidth}x${binHeight}mm`);
  
  // 패널을 높이순으로 정렬 (세로로 긴 패널 우선)
  const sortedPanels = [...panels].sort((a, b) => {
    // 먼저 높이로 정렬
    const heightDiff = b.height - a.height;
    if (heightDiff !== 0) return heightDiff;
    
    // 높이가 같으면 너비로 정렬
    return b.width - a.width;
  });
  
  const bins: PackedBin[] = [];
  let currentBin = 0;
  const remainingPanels = [...sortedPanels];
  
  while (remainingPanels.length > 0 && currentBin < maxBins) {
    console.log(`\n--- Creating Cutsaw Bin ${currentBin + 1} ---`);
    
    const packer = new CutsawPacker(binWidth, binHeight, kerf);
    const placedInThisBin: number[] = [];
    
    // 컷쏘 방식으로 패널 배치
    for (let i = 0; i < remainingPanels.length; i++) {
      const panel = remainingPanels[i];
      const packed = packer.pack(panel);
      
      if (packed) {
        placedInThisBin.push(i);
        console.log(`  ✓ Placed panel in column: ${panel.width}x${panel.height}mm`);
      }
    }
    
    if (placedInThisBin.length === 0) {
      console.warn('Cannot place remaining panels in cutsaw mode');
      break;
    }
    
    // 배치된 패널들을 제거
    placedInThisBin.sort((a, b) => b - a);
    for (const idx of placedInThisBin) {
      remainingPanels.splice(idx, 1);
    }
    
    const result = packer.getResult();
    if (result.panels.length > 0) {
      bins.push(result);
      console.log(`Cutsaw Bin ${currentBin + 1}: ${result.panels.length} panels, ${result.efficiency.toFixed(1)}% efficiency`);
    }
    
    currentBin++;
  }
  
  console.log(`\n=== Cutsaw Packing Complete ===`);
  console.log(`Total bins: ${bins.length}`);
  console.log(`Unpacked panels: ${remainingPanels.length}`);
  
  return bins;
}