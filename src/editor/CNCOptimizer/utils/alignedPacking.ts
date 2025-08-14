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
  private findOrCreateColumn(width: number): Column | null {
    // Try to find existing column with same width
    for (const column of this.columns) {
      if (Math.abs(column.width - width) < 1) { // Allow 1mm tolerance
        if (column.height + this.kerf < this.binHeight) {
          return column;
        }
      }
    }
    
    // Calculate total width used
    let totalWidth = 0;
    for (const column of this.columns) {
      totalWidth += column.width + this.kerf;
    }
    
    // Check if we can add new column
    if (totalWidth + width + this.kerf <= this.binWidth) {
      const newColumn: Column = {
        x: totalWidth,
        width: width,
        height: 0,
        panels: []
      };
      this.columns.push(newColumn);
      return newColumn;
    }
    
    return null;
  }
  
  /**
   * Pack panel with column alignment
   */
  pack(panel: Rect): Rect | null {
    // Try normal orientation first
    let column = this.findOrCreateColumn(panel.width);
    if (column && column.height + panel.height + this.kerf <= this.binHeight) {
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
    
    // Try rotated if allowed
    const canRotate = panel.canRotate !== false;
    if (canRotate) {
      column = this.findOrCreateColumn(panel.height);
      if (column && column.height + panel.width + this.kerf <= this.binHeight) {
        const packed: Rect = {
          ...panel,
          x: column.x,
          y: column.height,
          width: panel.height,
          height: panel.width,
          rotated: true
        };
        
        column.panels.push(packed);
        column.height += panel.width + this.kerf;
        this.panels.push(packed);
        return packed;
      }
    }
    
    // Try to fit in any available space in existing columns
    for (const column of this.columns) {
      const remainingHeight = this.binHeight - column.height;
      
      // Try normal orientation
      if (panel.width <= column.width && panel.height <= remainingHeight) {
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
      
      // Try rotated
      if (canRotate && panel.height <= column.width && panel.width <= remainingHeight) {
        const packed: Rect = {
          ...panel,
          x: column.x,
          y: column.height,
          width: panel.height,
          height: panel.width,
          rotated: true
        };
        
        column.panels.push(packed);
        column.height += panel.width + this.kerf;
        this.panels.push(packed);
        return packed;
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
      const w = panel.rotated ? panel.height : panel.width;
      const h = panel.rotated ? panel.width : panel.height;
      usedArea += w * h;
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
  kerf: number = 3
): PackedBin[] {
  // Group panels by width for better column utilization
  const panelsByWidth = new Map<number, Rect[]>();
  
  panels.forEach(panel => {
    const width = Math.round(panel.width);
    if (!panelsByWidth.has(width)) {
      panelsByWidth.set(width, []);
    }
    panelsByWidth.get(width)!.push(panel);
  });
  
  // Sort width groups by total area (largest first)
  const sortedGroups = Array.from(panelsByWidth.entries()).sort((a, b) => {
    const areaA = a[1].reduce((sum, p) => sum + p.width * p.height, 0);
    const areaB = b[1].reduce((sum, p) => sum + p.width * p.height, 0);
    return areaB - areaA;
  });
  
  const bins: PackedBin[] = [];
  const remainingPanels: Rect[] = [];
  
  // Flatten sorted groups back to panel list
  const sortedPanels: Rect[] = [];
  sortedGroups.forEach(([_, groupPanels]) => {
    // Sort panels within group by height (tallest first)
    groupPanels.sort((a, b) => b.height - a.height);
    sortedPanels.push(...groupPanels);
  });
  
  // Pack panels into bins
  let currentBin = 0;
  const unpacked = [...sortedPanels];
  
  while (unpacked.length > 0 && currentBin < 10) {
    const packer = new AlignedPacker(binWidth, binHeight, kerf);
    const panelsToRemove: number[] = [];
    
    // Try to pack each remaining panel
    for (let i = 0; i < unpacked.length; i++) {
      const panel = unpacked[i];
      const packed = packer.pack(panel);
      if (packed) {
        panelsToRemove.push(i);
      }
    }
    
    // Remove packed panels
    for (let i = panelsToRemove.length - 1; i >= 0; i--) {
      unpacked.splice(panelsToRemove[i], 1);
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