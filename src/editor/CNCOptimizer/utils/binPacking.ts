/**
 * 2D Bin Packing Algorithm - Guillotine & MaxRects
 * 실제 컷팅 옵티마이저처럼 작동하는 알고리즘
 */

export interface Rectangle {
  width: number;
  height: number;
  x?: number;
  y?: number;
  rotated?: boolean;
  id?: string;
}

export interface Bin {
  width: number;
  height: number;
  rects: Rectangle[];
  freeRects: Rectangle[];
  usedArea: number;
  efficiency: number;
}

export class GuillotinePacker {
  private binWidth: number;
  private binHeight: number;
  private freeRects: Rectangle[];
  private packedRects: Rectangle[];
  private allowRotation: boolean;
  private padding: number;

  constructor(
    width: number, 
    height: number, 
    allowRotation: boolean = true,
    padding: number = 3 // 톱날 두께
  ) {
    this.binWidth = width;
    this.binHeight = height;
    this.allowRotation = allowRotation;
    this.padding = padding;
    this.freeRects = [{
      x: 0,
      y: 0,
      width: width,
      height: height
    }];
    this.packedRects = [];
  }

  pack(rect: Rectangle): Rectangle | null {
    let bestScore = Number.MAX_VALUE;
    let bestRect: Rectangle | null = null;
    let bestFreeRectIndex = -1;
    let bestRotated = false;

    // 모든 자유 공간에서 최적의 위치 찾기
    for (let i = 0; i < this.freeRects.length; i++) {
      const freeRect = this.freeRects[i];
      
      // 정상 방향으로 시도
      if (rect.width + this.padding <= freeRect.width && 
          rect.height + this.padding <= freeRect.height) {
        const leftoverX = freeRect.width - rect.width - this.padding;
        const leftoverY = freeRect.height - rect.height - this.padding;
        const score = Math.min(leftoverX, leftoverY); // Best Short Side Fit
        
        if (score < bestScore) {
          bestScore = score;
          bestRect = {
            ...rect,
            x: freeRect.x!,
            y: freeRect.y!,
            rotated: false
          };
          bestFreeRectIndex = i;
          bestRotated = false;
        }
      }
      
      // 회전해서 시도
      if (this.allowRotation && 
          rect.height + this.padding <= freeRect.width && 
          rect.width + this.padding <= freeRect.height) {
        const leftoverX = freeRect.width - rect.height - this.padding;
        const leftoverY = freeRect.height - rect.width - this.padding;
        const score = Math.min(leftoverX, leftoverY);
        
        if (score < bestScore) {
          bestScore = score;
          bestRect = {
            ...rect,
            x: freeRect.x!,
            y: freeRect.y!,
            width: rect.height,
            height: rect.width,
            rotated: true
          };
          bestFreeRectIndex = i;
          bestRotated = true;
        }
      }
    }

    if (bestRect && bestFreeRectIndex >= 0) {
      // 자유 공간 분할 (Guillotine Split)
      this.splitFreeRect(this.freeRects[bestFreeRectIndex], bestRect);
      this.freeRects.splice(bestFreeRectIndex, 1);
      
      // 패킹된 사각형 추가
      this.packedRects.push(bestRect);
      
      return bestRect;
    }
    
    return null;
  }

  private splitFreeRect(freeRect: Rectangle, usedRect: Rectangle): void {
    const usedWidth = usedRect.width + this.padding;
    const usedHeight = usedRect.height + this.padding;
    
    // 수평 분할
    if (freeRect.width - usedWidth > 0) {
      this.freeRects.push({
        x: freeRect.x! + usedWidth,
        y: freeRect.y!,
        width: freeRect.width - usedWidth,
        height: usedHeight
      });
    }
    
    // 수직 분할
    if (freeRect.height - usedHeight > 0) {
      this.freeRects.push({
        x: freeRect.x!,
        y: freeRect.y! + usedHeight,
        width: freeRect.width,
        height: freeRect.height - usedHeight
      });
    }
    
    // 겹치는 자유 공간 제거
    this.pruneFreeRects();
  }

  private pruneFreeRects(): void {
    for (let i = 0; i < this.freeRects.length; i++) {
      for (let j = i + 1; j < this.freeRects.length; j++) {
        if (this.isContainedIn(this.freeRects[i], this.freeRects[j])) {
          this.freeRects.splice(i, 1);
          i--;
          break;
        }
        if (this.isContainedIn(this.freeRects[j], this.freeRects[i])) {
          this.freeRects.splice(j, 1);
          j--;
        }
      }
    }
  }

  private isContainedIn(rect1: Rectangle, rect2: Rectangle): boolean {
    return rect1.x! >= rect2.x! &&
           rect1.y! >= rect2.y! &&
           rect1.x! + rect1.width <= rect2.x! + rect2.width &&
           rect1.y! + rect1.height <= rect2.y! + rect2.height;
  }

  getResult(): Bin {
    const usedArea = this.packedRects.reduce((sum, rect) => 
      sum + rect.width * rect.height, 0
    );
    const totalArea = this.binWidth * this.binHeight;
    
    return {
      width: this.binWidth,
      height: this.binHeight,
      rects: this.packedRects,
      freeRects: this.freeRects,
      usedArea,
      efficiency: (usedArea / totalArea) * 100
    };
  }
}

/**
 * MaxRects 알고리즘 - 더 효율적인 패킹
 */
export class MaxRectsPacker {
  private binWidth: number;
  private binHeight: number;
  private freeRects: Rectangle[];
  private packedRects: Rectangle[];
  private allowRotation: boolean;
  private padding: number;

  constructor(
    width: number,
    height: number,
    allowRotation: boolean = true,
    padding: number = 3
  ) {
    this.binWidth = width;
    this.binHeight = height;
    this.allowRotation = allowRotation;
    this.padding = padding;
    this.freeRects = [{
      x: 0,
      y: 0,
      width: width,
      height: height
    }];
    this.packedRects = [];
  }

  pack(rect: Rectangle): Rectangle | null {
    let bestRect: Rectangle | null = null;
    let bestShortSideFit = Number.MAX_VALUE;
    let bestLongSideFit = Number.MAX_VALUE;
    let bestFreeRectIndex = -1;

    for (let i = 0; i < this.freeRects.length; i++) {
      const freeRect = this.freeRects[i];
      
      // 정상 방향
      if (rect.width + this.padding <= freeRect.width && 
          rect.height + this.padding <= freeRect.height) {
        const leftX = freeRect.width - rect.width - this.padding;
        const leftY = freeRect.height - rect.height - this.padding;
        const shortSideFit = Math.min(leftX, leftY);
        const longSideFit = Math.max(leftX, leftY);
        
        if (shortSideFit < bestShortSideFit || 
            (shortSideFit === bestShortSideFit && longSideFit < bestLongSideFit)) {
          bestRect = {
            ...rect,
            x: freeRect.x!,
            y: freeRect.y!,
            rotated: false
          };
          bestShortSideFit = shortSideFit;
          bestLongSideFit = longSideFit;
          bestFreeRectIndex = i;
        }
      }
      
      // 회전
      if (this.allowRotation && 
          rect.height + this.padding <= freeRect.width && 
          rect.width + this.padding <= freeRect.height) {
        const leftX = freeRect.width - rect.height - this.padding;
        const leftY = freeRect.height - rect.width - this.padding;
        const shortSideFit = Math.min(leftX, leftY);
        const longSideFit = Math.max(leftX, leftY);
        
        if (shortSideFit < bestShortSideFit || 
            (shortSideFit === bestShortSideFit && longSideFit < bestLongSideFit)) {
          bestRect = {
            ...rect,
            x: freeRect.x!,
            y: freeRect.y!,
            width: rect.height,
            height: rect.width,
            rotated: true
          };
          bestShortSideFit = shortSideFit;
          bestLongSideFit = longSideFit;
          bestFreeRectIndex = i;
        }
      }
    }

    if (bestRect) {
      this.placeRect(bestRect);
      return bestRect;
    }
    
    return null;
  }

  private placeRect(rect: Rectangle): void {
    const newFreeRects: Rectangle[] = [];
    
    for (let i = 0; i < this.freeRects.length; i++) {
      const freeRect = this.freeRects[i];
      
      if (this.intersects(rect, freeRect)) {
        // 자유 공간을 4개로 분할
        const rects = this.splitFreeRect(freeRect, rect);
        newFreeRects.push(...rects);
      } else {
        newFreeRects.push(freeRect);
      }
    }
    
    this.freeRects = newFreeRects;
    this.pruneFreeRects();
    this.packedRects.push(rect);
  }

  private splitFreeRect(freeRect: Rectangle, usedRect: Rectangle): Rectangle[] {
    const rects: Rectangle[] = [];
    const usedWidth = usedRect.width + this.padding;
    const usedHeight = usedRect.height + this.padding;
    
    // 왼쪽
    if (usedRect.x! > freeRect.x!) {
      rects.push({
        x: freeRect.x!,
        y: freeRect.y!,
        width: usedRect.x! - freeRect.x!,
        height: freeRect.height
      });
    }
    
    // 오른쪽
    if (usedRect.x! + usedWidth < freeRect.x! + freeRect.width) {
      rects.push({
        x: usedRect.x! + usedWidth,
        y: freeRect.y!,
        width: freeRect.x! + freeRect.width - usedRect.x! - usedWidth,
        height: freeRect.height
      });
    }
    
    // 위
    if (usedRect.y! > freeRect.y!) {
      rects.push({
        x: freeRect.x!,
        y: freeRect.y!,
        width: freeRect.width,
        height: usedRect.y! - freeRect.y!
      });
    }
    
    // 아래
    if (usedRect.y! + usedHeight < freeRect.y! + freeRect.height) {
      rects.push({
        x: freeRect.x!,
        y: usedRect.y! + usedHeight,
        width: freeRect.width,
        height: freeRect.y! + freeRect.height - usedRect.y! - usedHeight
      });
    }
    
    return rects;
  }

  private intersects(rect1: Rectangle, rect2: Rectangle): boolean {
    return !(rect1.x! >= rect2.x! + rect2.width ||
             rect1.x! + rect1.width + this.padding <= rect2.x! ||
             rect1.y! >= rect2.y! + rect2.height ||
             rect1.y! + rect1.height + this.padding <= rect2.y!);
  }

  private pruneFreeRects(): void {
    for (let i = 0; i < this.freeRects.length; i++) {
      for (let j = i + 1; j < this.freeRects.length; j++) {
        if (this.isContainedIn(this.freeRects[i], this.freeRects[j])) {
          this.freeRects.splice(i, 1);
          i--;
          break;
        }
        if (this.isContainedIn(this.freeRects[j], this.freeRects[i])) {
          this.freeRects.splice(j, 1);
          j--;
        }
      }
    }
  }

  private isContainedIn(rect1: Rectangle, rect2: Rectangle): boolean {
    return rect1.x! >= rect2.x! &&
           rect1.y! >= rect2.y! &&
           rect1.x! + rect1.width <= rect2.x! + rect2.width &&
           rect1.y! + rect1.height <= rect2.y! + rect2.height;
  }

  getResult(): Bin {
    const usedArea = this.packedRects.reduce((sum, rect) => 
      sum + rect.width * rect.height, 0
    );
    const totalArea = this.binWidth * this.binHeight;
    
    return {
      width: this.binWidth,
      height: this.binHeight,
      rects: this.packedRects,
      freeRects: this.freeRects,
      usedArea,
      efficiency: (usedArea / totalArea) * 100
    };
  }
}

/**
 * 멀티 빈 패킹 - 여러 원장에 패널 배치
 */
export function packPanelsIntoBins(
  panels: Rectangle[],
  binWidth: number,
  binHeight: number,
  algorithm: 'guillotine' | 'maxrects' = 'maxrects',
  allowRotation: boolean = true,
  padding: number = 3
): Bin[] {
  // 패널을 크기 순으로 정렬 (큰 것부터)
  const sortedPanels = [...panels].sort((a, b) => 
    b.width * b.height - a.width * a.height
  );
  
  const bins: Bin[] = [];
  const unpacked: Rectangle[] = [];
  
  for (const panel of sortedPanels) {
    let packed = false;
    
    // 기존 빈에 배치 시도
    for (const bin of bins) {
      const packer = algorithm === 'guillotine' 
        ? new GuillotinePacker(binWidth, binHeight, allowRotation, padding)
        : new MaxRectsPacker(binWidth, binHeight, allowRotation, padding);
      
      // 기존 패킹된 패널들 재배치
      let canPack = true;
      for (const rect of bin.rects) {
        if (!packer.pack(rect)) {
          canPack = false;
          break;
        }
      }
      
      if (canPack && packer.pack(panel)) {
        bin.rects.push(panel);
        packed = true;
        break;
      }
    }
    
    // 새 빈 생성
    if (!packed) {
      const packer = algorithm === 'guillotine'
        ? new GuillotinePacker(binWidth, binHeight, allowRotation, padding)
        : new MaxRectsPacker(binWidth, binHeight, allowRotation, padding);
      
      const packedPanel = packer.pack(panel);
      if (packedPanel) {
        bins.push(packer.getResult());
        packed = true;
      }
    }
    
    if (!packed) {
      unpacked.push(panel);
    }
  }
  
  // 효율성 재계산
  bins.forEach(bin => {
    const usedArea = bin.rects.reduce((sum, rect) => 
      sum + rect.width * rect.height, 0
    );
    bin.efficiency = (usedArea / (binWidth * binHeight)) * 100;
    bin.usedArea = usedArea;
  });
  
  return bins;
}