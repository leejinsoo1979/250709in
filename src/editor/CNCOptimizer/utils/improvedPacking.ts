/**
 * Improved 2D Bin Packing Algorithm with Better Efficiency
 * Best Fit Decreasing Height (BFDH) 알고리즘 구현
 */

import { Rect, PackedBin } from './simpleBinPacking';

interface Shelf {
  y: number;
  height: number;
  remainingWidth: number;
  panels: Rect[];
}

export class ImprovedPacker {
  private binWidth: number;
  private binHeight: number;
  private kerf: number;
  private shelves: Shelf[] = [];
  private panels: Rect[] = [];
  
  constructor(width: number, height: number, kerf: number = 3) {
    this.binWidth = width;
    this.binHeight = height;
    this.kerf = kerf;
  }
  
  /**
   * Pack a panel using Best Fit Decreasing Height algorithm
   */
  pack(panel: Rect): Rect | null {
    const actualWidth = panel.width + this.kerf;
    const actualHeight = panel.height + this.kerf;
    
    // Try normal orientation
    let bestShelf = this.findBestShelf(actualWidth, actualHeight);
    if (bestShelf !== null) {
      return this.addToShelf(panel, bestShelf, false);
    }
    
    // Try rotated if allowed
    if (panel.canRotate !== false) {
      const rotatedWidth = panel.height + this.kerf;
      const rotatedHeight = panel.width + this.kerf;
      bestShelf = this.findBestShelf(rotatedWidth, rotatedHeight);
      if (bestShelf !== null) {
        return this.addToShelf(panel, bestShelf, true);
      }
    }
    
    // Create new shelf if possible
    const newShelfY = this.shelves.length > 0 
      ? this.shelves[this.shelves.length - 1].y + this.shelves[this.shelves.length - 1].height
      : 0;
      
    if (newShelfY + actualHeight <= this.binHeight) {
      const newShelf: Shelf = {
        y: newShelfY,
        height: actualHeight,
        remainingWidth: this.binWidth - actualWidth,
        panels: []
      };
      this.shelves.push(newShelf);
      return this.addToShelf(panel, this.shelves.length - 1, false);
    }
    
    // Try rotated for new shelf
    if (panel.canRotate !== false) {
      const rotatedHeight = panel.width + this.kerf;
      if (newShelfY + rotatedHeight <= this.binHeight) {
        const newShelf: Shelf = {
          y: newShelfY,
          height: rotatedHeight,
          remainingWidth: this.binWidth - (panel.height + this.kerf),
          panels: []
        };
        this.shelves.push(newShelf);
        return this.addToShelf(panel, this.shelves.length - 1, true);
      }
    }
    
    return null;
  }
  
  /**
   * Find the best fitting shelf for a panel
   */
  private findBestShelf(width: number, height: number): number | null {
    let bestShelf = -1;
    let bestWaste = Number.MAX_VALUE;
    
    for (let i = 0; i < this.shelves.length; i++) {
      const shelf = this.shelves[i];
      if (shelf.remainingWidth >= width && shelf.height >= height) {
        const waste = shelf.remainingWidth - width;
        if (waste < bestWaste) {
          bestWaste = waste;
          bestShelf = i;
        }
      }
    }
    
    return bestShelf >= 0 ? bestShelf : null;
  }
  
  /**
   * Add panel to a specific shelf
   */
  private addToShelf(panel: Rect, shelfIndex: number, rotated: boolean): Rect {
    const shelf = this.shelves[shelfIndex];
    const x = this.binWidth - shelf.remainingWidth;
    
    const packed: Rect = {
      ...panel,
      x: x,
      y: shelf.y,
      width: panel.width,  // 원래 크기 유지
      height: panel.height, // 원래 크기 유지
      rotated: rotated
    };
    
    shelf.panels.push(packed);
    this.panels.push(packed);
    
    const actualWidth = (rotated ? panel.height : panel.width) + this.kerf;
    shelf.remainingWidth -= actualWidth;
    
    return packed;
  }
  
  /**
   * Get packing result
   */
  getResult(): PackedBin {
    let usedArea = 0;
    for (const panel of this.panels) {
      // 실제 배치된 크기로 면적 계산 (회전 고려)
      const actualWidth = panel.rotated ? panel.height : panel.width;
      const actualHeight = panel.rotated ? panel.width : panel.height;
      usedArea += actualWidth * actualHeight;
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
}

/**
 * Pack panels using improved algorithm with multi-sheet support
 */
export function packWithImprovedAlgorithm(
  panels: Rect[],
  binWidth: number,
  binHeight: number,
  kerf: number = 3,
  maxBins: number = 20
): PackedBin[] {
  // Sort by height (tallest first), then by width
  const sortedPanels = [...panels].sort((a, b) => {
    const heightDiff = b.height - a.height;
    if (heightDiff !== 0) return heightDiff;
    return b.width - a.width;
  });
  
  const bins: PackedBin[] = [];
  const remainingPanels = [...sortedPanels];
  
  while (remainingPanels.length > 0 && bins.length < maxBins) {
    const packer = new ImprovedPacker(binWidth, binHeight, kerf);
    const panelsToRemove: number[] = [];
    
    // Try to pack each remaining panel
    for (let i = 0; i < remainingPanels.length; i++) {
      const panel = remainingPanels[i];
      const packed = packer.pack(panel);
      if (packed) {
        panelsToRemove.push(i);
      }
    }
    
    // If no panels could be packed, something is wrong
    if (panelsToRemove.length === 0) {
      console.warn('Cannot pack remaining panels - they might be too large');
      break;
    }
    
    // Remove packed panels
    for (let i = panelsToRemove.length - 1; i >= 0; i--) {
      remainingPanels.splice(panelsToRemove[i], 1);
    }
    
    // Add bin
    const result = packer.getResult();
    if (result.panels.length > 0) {
      bins.push(result);
    }
  }
  
  // Report if panels couldn't be packed
  if (remainingPanels.length > 0) {
    console.warn(`${remainingPanels.length} panels could not be packed within ${maxBins} sheets`);
  }
  
  return bins;
}