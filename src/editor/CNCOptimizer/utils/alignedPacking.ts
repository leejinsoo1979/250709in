/**
 * Aligned Packing Algorithm for CNC Cutting
 * 세로 컷팅 라인을 정렬하여 한 줄로 만드는 알고리즘
 */

import { Rect, PackedBin } from './simpleBinPacking';

interface Column {
  x: number;
  width: number;
  height: number;
  panels: Rect[];
  maxWidth: number; // Track the maximum width used in this column
}

export class AlignedPacker {
  private binWidth: number;
  private binHeight: number;
  private kerf: number;
  private columns: Column[] = [];
  private panels: Rect[] = [];
  
  constructor(width: number, height: number, kerf: number = 3) {
    this.binWidth = width;
    this.binHeight = height;
    this.kerf = kerf;
  }
  
  /**
   * Find or create a column for the panel
   */
  private findOrCreateColumn(width: number, height: number): Column | null {
    // 먼저 기존 컬럼에서 맞는 것 찾기
    for (const column of this.columns) {
      // 컬럼에 패널이 들어갈 수 있는지 확인
      if (width <= column.maxWidth) {
        const remainingHeight = this.binHeight - column.height;
        if (height + this.kerf <= remainingHeight) {
          // 원장 범위 내에 있는지 확인
          if (column.x + width <= this.binWidth) {
            return column;
          }
        }
      }
    }
    
    // 새 컬럼을 만들 수 있는지 확인
    // 현재 사용된 너비 계산
    let totalWidth = this.kerf;
    for (const column of this.columns) {
      totalWidth += column.maxWidth + this.kerf;
    }
    
    // 새 컬럼이 원장 너비를 초과하지 않는지 확인
    if (totalWidth + width + this.kerf <= this.binWidth) {
      const newColumn: Column = {
        x: totalWidth,
        width: width,
        height: this.kerf,
        panels: [],
        maxWidth: width
      };
      this.columns.push(newColumn);
      return newColumn;
    }
    
    return null;  // 패널을 배치할 수 없음
  }
  
  /**
   * Pack panel with column alignment
   */
  pack(panel: Rect): Rect | null {
    // Try normal orientation first
    let column = this.findOrCreateColumn(panel.width, panel.height);
    if (column) {
      // 패널이 원장을 벗어나지 않는지 확인
      if (column.x + panel.width <= this.binWidth && 
          column.height + panel.height <= this.binHeight) {
        const packed: Rect = {
          ...panel,
          x: column.x,
          y: column.height,
          rotated: false
        };
        
        column.panels.push(packed);
        column.height += panel.height + this.kerf;
        this.panels.push(packed);
        return packed;
      }
    }
    
    // Try rotated if allowed
    const canRotate = panel.canRotate !== false;
    if (canRotate) {
      // 회전한 크기로 컬럼 찾기
      column = this.findOrCreateColumn(panel.height, panel.width);
      if (column) {
        // 회전된 패널이 원장을 벗어나지 않는지 확인
        if (column.x + panel.height <= this.binWidth && 
            column.height + panel.width <= this.binHeight) {
          const packed: Rect = {
            ...panel,
            x: column.x,
            y: column.height,
            width: panel.height,  // 회전 시 width와 height 교체
            height: panel.width,  // 회전 시 width와 height 교체
            rotated: true
          };
          
          column.panels.push(packed);
          column.height += packed.height + this.kerf;  // 회전된 패널의 실제 높이
          this.panels.push(packed);
          return packed;
        }
      }
    }
    
    // Try to fit in any available space in existing columns
    for (const column of this.columns) {
      const remainingHeight = this.binHeight - column.height;
      
      // Try normal orientation
      if (panel.width <= column.maxWidth && 
          panel.height + this.kerf <= remainingHeight) {
        // 패널이 원장을 벗어나지 않는지 확인
        if (column.x + panel.width <= this.binWidth && 
            column.height + panel.height <= this.binHeight) {
          const packed: Rect = {
            ...panel,
            x: column.x,
            y: column.height,
            rotated: false
          };
          
          column.panels.push(packed);
          column.height += panel.height + this.kerf;
          // 컬럼의 최대 너비 업데이트
          if (panel.width > column.maxWidth) {
            column.maxWidth = panel.width;
          }
          this.panels.push(packed);
          return packed;
        }
      }
      
      // Try rotated
      if (canRotate && 
          panel.height <= column.maxWidth && 
          panel.width + this.kerf <= remainingHeight) {
        // 회전된 패널이 원장을 벗어나지 않는지 확인
        if (column.x + panel.height <= this.binWidth && 
            column.height + panel.width <= this.binHeight) {
          const packed: Rect = {
            ...panel,
            x: column.x,
            y: column.height,
            width: panel.height,  // 회전 시 width와 height 교체
            height: panel.width,  // 회전 시 width와 height 교체
            rotated: true
          };
          
          column.panels.push(packed);
          column.height += packed.height + this.kerf;  // 회전된 패널의 실제 높이
          // 컬럼의 최대 너비 업데이트
          if (packed.width > column.maxWidth) {
            column.maxWidth = packed.width;
          }
          this.panels.push(packed);
          return packed;
        }
      }
    }
    
    return null;
  }
  
  /**
   * Get packing result
   */
  getResult(): PackedBin {
    let usedArea = 0;
    for (const panel of this.panels) {
      // 패널의 실제 크기로 면적 계산
      usedArea += panel.width * panel.height;
    }
    
    const totalArea = this.binWidth * this.binHeight;
    const efficiency = totalArea > 0 ? (usedArea / totalArea) * 100 : 0;
    
    return {
      width: this.binWidth,
      height: this.binHeight,
      panels: this.panels,
      efficiency,
      usedArea
    };
  }
  
  /**
   * Get column information for debugging/visualization
   */
  getColumns(): Column[] {
    return this.columns;
  }
}

/**
 * Pack panels with vertical cut alignment
 */
export function packWithAlignment(
  panels: Rect[],
  binWidth: number,
  binHeight: number,
  kerf: number = 3,
  maxBins: number = 20
): PackedBin[] {
  // Enhanced sorting strategy: prioritize by width first for column alignment
  const sortedPanels = [...panels].sort((a, b) => {
    // First sort by width (for column grouping)
    const widthDiff = b.width - a.width;
    if (Math.abs(widthDiff) > 50) {
      return widthDiff;
    }
    // Then by area for efficient packing
    return b.width * b.height - a.width * a.height;
  });
  
  // Group panels by similar width for better column alignment
  const widthGroups = new Map<number, Rect[]>();
  const snapGrid = 10;
  
  sortedPanels.forEach(panel => {
    const snappedWidth = Math.ceil(panel.width / snapGrid) * snapGrid;
    if (!widthGroups.has(snappedWidth)) {
      widthGroups.set(snappedWidth, []);
    }
    widthGroups.get(snappedWidth)!.push(panel);
  });
  
  // Sort groups by width (largest first) and flatten
  const finalPanels: Rect[] = [];
  const sortedWidths = Array.from(widthGroups.keys()).sort((a, b) => b - a);
  
  for (const width of sortedWidths) {
    const group = widthGroups.get(width)!;
    // Sort within group by height for better stacking
    group.sort((a, b) => b.height - a.height);
    finalPanels.push(...group);
  }
  
  // Pack panels into bins
  const bins: PackedBin[] = [];
  let currentBin = 0;
  const unpacked = [...finalPanels];
  
  while (unpacked.length > 0 && currentBin < maxBins) {
    const packer = new AlignedPacker(binWidth, binHeight, kerf);
    const panelsToRemove: number[] = [];
    
    // Pack all panels in order (already sorted optimally)
    for (let i = 0; i < unpacked.length; i++) {
      const panel = unpacked[i];
      const packed = packer.pack(panel);
      if (packed) {
        panelsToRemove.push(i);
      }
    }
    
    // Remove packed panels
    panelsToRemove.sort((a, b) => b - a); // Sort descending to remove from end first
    for (const idx of panelsToRemove) {
      unpacked.splice(idx, 1);
    }
    
    // Add bin if it has panels
    const result = packer.getResult();
    if (result.panels.length > 0) {
      bins.push(result);
    } else {
      break; // No panels could be packed
    }
    
    currentBin++;
  }
  
  return bins;
}