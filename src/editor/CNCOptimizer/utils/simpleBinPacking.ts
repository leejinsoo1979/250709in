/**
 * Simple and Reliable 2D Bin Packing Algorithm
 * 간단하고 확실하게 작동하는 2D 빈 패킹 알고리즘
 */

export interface Rect {
  id: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
  rotated?: boolean;
  canRotate?: boolean;
  // Additional panel info
  name?: string;
  material?: string;
  color?: string;
  grain?: string;
}

export interface PackedBin {
  width: number;
  height: number;
  panels: Rect[];
  efficiency: number;
  usedArea: number;
}

/**
 * Simple Bottom-Left Algorithm with proper boundary checking
 * 단순하지만 확실한 Bottom-Left 알고리즘
 */
export class SimplePacker {
  private binWidth: number;
  private binHeight: number;
  private kerf: number; // 톱날 두께
  private panels: Rect[] = [];
  
  constructor(width: number, height: number, kerf: number = 3) {
    this.binWidth = width;
    this.binHeight = height;
    this.kerf = kerf;
  }
  
  /**
   * Try to pack a panel into the bin
   */
  pack(panel: Rect): Rect | null {
    // Try normal orientation first
    let position = this.findPosition(panel.width, panel.height);
    if (position) {
      const packed: Rect = {
        ...panel,
        x: position.x,
        y: position.y,
        rotated: false
      };
      this.panels.push(packed);
      return packed;
    }
    
    // Try rotated if allowed (check panel-specific setting)
    const canRotate = panel.canRotate !== false;
    if (canRotate) {
      position = this.findPosition(panel.height, panel.width);
      if (position) {
        const packed: Rect = {
          ...panel,
          x: position.x,
          y: position.y,
          // 원래 크기를 유지하고 rotated 플래그만 설정
          width: panel.width,
          height: panel.height,
          rotated: true
        };
        this.panels.push(packed);
        return packed;
      }
    }
    
    return null;
  }
  
  /**
   * Find the bottom-left position where the panel can fit
   */
  private findPosition(width: number, height: number): { x: number; y: number } | null {
    const actualWidth = width + this.kerf;
    const actualHeight = height + this.kerf;
    
    // Check if panel is too big for the bin
    if (actualWidth > this.binWidth || actualHeight > this.binHeight) {
      return null;
    }
    
    // Try positions from bottom-left
    for (let y = 0; y <= this.binHeight - actualHeight; y += 10) {
      for (let x = 0; x <= this.binWidth - actualWidth; x += 10) {
        if (this.canPlace(x, y, actualWidth, actualHeight)) {
          return { x, y };
        }
      }
    }
    
    return null;
  }
  
  /**
   * Check if a panel can be placed at the given position
   */
  private canPlace(x: number, y: number, width: number, height: number): boolean {
    // Check boundaries
    if (x + width > this.binWidth || y + height > this.binHeight) {
      return false;
    }
    
    // Check overlap with existing panels
    for (const panel of this.panels) {
      const panelWidth = (panel.rotated ? panel.height : panel.width) + this.kerf;
      const panelHeight = (panel.rotated ? panel.width : panel.height) + this.kerf;
      
      // Check if rectangles overlap
      if (!(x >= panel.x! + panelWidth ||
            x + width <= panel.x! ||
            y >= panel.y! + panelHeight ||
            y + height <= panel.y!)) {
        return false;
      }
    }
    
    return true;
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
}

/**
 * Pack multiple panels into multiple bins
 */
export function packIntoBins(
  panels: Rect[],
  binWidth: number,
  binHeight: number,
  kerf: number = 3,
  allowRotation: boolean = true,
  maxBins: number = 20
): PackedBin[] {
  // Sort panels by area (largest first)
  const sortedPanels = [...panels].sort((a, b) => 
    (b.width * b.height) - (a.width * a.height)
  );
  
  const bins: PackedBin[] = [];
  const remainingPanels = [...sortedPanels];
  
  while (remainingPanels.length > 0 && bins.length < maxBins) {
    const packer = new SimplePacker(binWidth, binHeight, kerf);
    const panelsToRemove: number[] = [];
    
    // Try to pack each remaining panel
    for (let i = 0; i < remainingPanels.length; i++) {
      const panel = remainingPanels[i];
      // Apply rotation setting to panel
      if (!allowRotation) {
        panel.canRotate = false;
      }
      const packed = packer.pack(panel);
      if (packed) {
        panelsToRemove.push(i);
      }
    }
    
    // Remove packed panels
    for (let i = panelsToRemove.length - 1; i >= 0; i--) {
      remainingPanels.splice(panelsToRemove[i], 1);
    }
    
    // Add bin if it has panels
    const result = packer.getResult();
    if (result.panels.length > 0) {
      bins.push(result);
    } else {
      // No panels could be packed, break to avoid infinite loop
      console.warn('Could not pack remaining panels:', remainingPanels);
      break;
    }
    
    // Safety check: limit number of bins
    if (bins.length >= 10) {
      console.warn('Reached maximum bin limit');
      break;
    }
  }
  
  return bins;
}