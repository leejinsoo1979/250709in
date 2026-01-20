/**
 * 개선된 2D 빈 패킹 알고리즘 - MaxRects 방식
 * 빈 공간을 더 효율적으로 활용하는 알고리즘
 */

import { Rect, PackedBin } from './simpleBinPacking';

interface FreeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class MaxRectsPacker {
  private binWidth: number;
  private binHeight: number;
  private kerf: number;
  private freeRects: FreeRect[] = [];
  private placedPanels: Rect[] = [];
  
  constructor(width: number, height: number, kerf: number = 5) {
    this.binWidth = width;
    this.binHeight = height;
    this.kerf = kerf;
    // 초기에는 전체 빈이 하나의 자유 공간
    this.freeRects = [{
      x: 0,
      y: 0,
      width: width,
      height: height
    }];
  }
  
  /**
   * Best Area Fit (BAF) + Best Short Side Fit (BSSF) 조합 휴리스틱으로 패널 배치
   * 테트리스처럼 빈 공간을 최대한 효율적으로 채우기 위해 개선
   */
  pack(panel: Rect): Rect | null {
    let bestAreaFit = Infinity;
    let bestShortSideFit = Infinity;
    let bestFreeRect: FreeRect | null = null;
    let bestRotated = false;
    let bestFitIndex = -1;
    
    // 모든 자유 공간에 대해 시도
    for (let i = 0; i < this.freeRects.length; i++) {
      const freeRect = this.freeRects[i];
      
      // 원래 방향으로 맞는지 확인
      if (panel.width + this.kerf <= freeRect.width && 
          panel.height + this.kerf <= freeRect.height) {
        // Area fit과 short side fit 모두 계산
        const leftoverX = freeRect.width - panel.width - this.kerf;
        const leftoverY = freeRect.height - panel.height - this.kerf;
        const areaFit = freeRect.width * freeRect.height - panel.width * panel.height;
        const shortSideFit = Math.min(leftoverX, leftoverY);
        
        // 더 적은 면적 낭비를 우선시 (테트리스처럼 꽉 채우기)
        if (areaFit < bestAreaFit || (areaFit === bestAreaFit && shortSideFit < bestShortSideFit)) {
          bestAreaFit = areaFit;
          bestShortSideFit = shortSideFit;
          bestFreeRect = freeRect;
          bestRotated = false;
          bestFitIndex = i;
        }
      }
      
      // 회전 가능하면 회전해서도 시도 (CNC 최적화에서는 항상 true)
      if (panel.canRotate !== false) {
        if (panel.height + this.kerf <= freeRect.width && 
            panel.width + this.kerf <= freeRect.height) {
          const leftoverX = freeRect.width - panel.height - this.kerf;
          const leftoverY = freeRect.height - panel.width - this.kerf;
          const areaFit = freeRect.width * freeRect.height - panel.width * panel.height;
          const shortSideFit = Math.min(leftoverX, leftoverY);
          
          // 더 적은 면적 낭비를 우선시
          if (areaFit < bestAreaFit || (areaFit === bestAreaFit && shortSideFit < bestShortSideFit)) {
            bestAreaFit = areaFit;
            bestShortSideFit = shortSideFit;
            bestFreeRect = freeRect;
            bestRotated = true;
            bestFitIndex = i;
          }
        }
      }
    }
    
    // 최적 위치에 배치
    if (bestFreeRect && bestFitIndex >= 0) {
      const actualWidth = bestRotated ? panel.height : panel.width;
      const actualHeight = bestRotated ? panel.width : panel.height;
      
      const placed: Rect = {
        ...panel,
        x: bestFreeRect.x,
        y: bestFreeRect.y,
        width: panel.width,
        height: panel.height,
        rotated: bestRotated
      };
      
      this.placedPanels.push(placed);

      // 자유 공간 업데이트 - 표준 MaxRects 방식
      // 배치된 패널 영역 (kerf 포함)
      const placedRect: FreeRect = {
        x: bestFreeRect.x,
        y: bestFreeRect.y,
        width: actualWidth + this.kerf,
        height: actualHeight + this.kerf
      };

      // 모든 자유 공간에 대해 배치된 영역과 겹치는 부분 분할
      this.splitAllFreeRects(placedRect);
      this.pruneFreeRects();

      return placed;
    }
    
    return null;
  }
  
  /**
   * 두 사각형이 겹치는지 확인
   */
  private rectsIntersect(a: FreeRect, b: FreeRect): boolean {
    return !(a.x >= b.x + b.width ||
             a.x + a.width <= b.x ||
             a.y >= b.y + b.height ||
             a.y + a.height <= b.y);
  }

  /**
   * 표준 MaxRects 알고리즘 - 모든 자유 공간에 대해 배치된 영역과 겹치는 부분 분할
   */
  private splitAllFreeRects(placedRect: FreeRect) {
    const newFreeRects: FreeRect[] = [];

    for (const freeRect of this.freeRects) {
      // 겹치지 않으면 그대로 유지
      if (!this.rectsIntersect(freeRect, placedRect)) {
        newFreeRects.push(freeRect);
        continue;
      }

      // 겹치는 경우: 최대 4개의 새 사각형으로 분할

      // 왼쪽 부분 (placedRect 왼쪽에 남는 공간)
      if (placedRect.x > freeRect.x) {
        newFreeRects.push({
          x: freeRect.x,
          y: freeRect.y,
          width: placedRect.x - freeRect.x,
          height: freeRect.height
        });
      }

      // 오른쪽 부분 (placedRect 오른쪽에 남는 공간)
      if (placedRect.x + placedRect.width < freeRect.x + freeRect.width) {
        newFreeRects.push({
          x: placedRect.x + placedRect.width,
          y: freeRect.y,
          width: (freeRect.x + freeRect.width) - (placedRect.x + placedRect.width),
          height: freeRect.height
        });
      }

      // 아래쪽 부분 (placedRect 아래에 남는 공간)
      if (placedRect.y > freeRect.y) {
        newFreeRects.push({
          x: freeRect.x,
          y: freeRect.y,
          width: freeRect.width,
          height: placedRect.y - freeRect.y
        });
      }

      // 위쪽 부분 (placedRect 위에 남는 공간)
      if (placedRect.y + placedRect.height < freeRect.y + freeRect.height) {
        newFreeRects.push({
          x: freeRect.x,
          y: placedRect.y + placedRect.height,
          width: freeRect.width,
          height: (freeRect.y + freeRect.height) - (placedRect.y + placedRect.height)
        });
      }
    }

    this.freeRects = newFreeRects;
  }
  
  /**
   * 중복되거나 포함된 자유 공간 제거
   */
  private pruneFreeRects() {
    const newFreeRects: FreeRect[] = [];
    
    for (let i = 0; i < this.freeRects.length; i++) {
      const rect1 = this.freeRects[i];
      let isContained = false;
      
      for (let j = 0; j < this.freeRects.length; j++) {
        if (i === j) continue;
        const rect2 = this.freeRects[j];
        
        // rect1이 rect2에 완전히 포함되는지 확인
        if (rect1.x >= rect2.x && 
            rect1.y >= rect2.y &&
            rect1.x + rect1.width <= rect2.x + rect2.width &&
            rect1.y + rect1.height <= rect2.y + rect2.height) {
          isContained = true;
          break;
        }
      }
      
      if (!isContained) {
        newFreeRects.push(rect1);
      }
    }
    
    this.freeRects = newFreeRects;
  }
  
  /**
   * 결과 반환
   */
  getResult(): PackedBin {
    let usedArea = 0;
    
    for (const panel of this.placedPanels) {
      // 회전 여부와 관계없이 원본 크기로 면적 계산
      usedArea += panel.width * panel.height;
    }
    
    const totalArea = this.binWidth * this.binHeight;
    const efficiency = totalArea > 0 ? (usedArea / totalArea) * 100 : 0;
    
    // 효율이 이상하게 높은 경우 디버깅
    if (efficiency > 95 && this.placedPanels.length <= 3) {
      console.warn('Suspicious high efficiency detected:');
      console.warn('Sheet size:', this.binWidth, 'x', this.binHeight, '=', totalArea);
      console.warn('Used area:', usedArea);
      console.warn('Efficiency:', efficiency.toFixed(2) + '%');
      console.warn('Panels:', this.placedPanels.map(p => ({
        id: p.id,
        size: `${p.width}x${p.height}`,
        pos: `(${p.x},${p.y})`,
        rotated: p.rotated
      })));
    }
    
    return {
      width: this.binWidth,
      height: this.binHeight,
      panels: this.placedPanels,
      efficiency,
      usedArea
    };
  }
}

/**
 * MaxRects 알고리즘으로 멀티 빈 패킹 - 테트리스처럼 효율적으로 배치
 */
export function packMaxRects(
  panels: Rect[],
  binWidth: number,
  binHeight: number,
  kerf: number = 5,
  maxBins: number = 999
): PackedBin[] {
  
  // 패널 정렬 - 더 나은 패킹을 위한 다양한 정렬 방식 시도
  // 1. 먼저 면적이 큰 것부터 (Large First)
  // 2. 그 다음 긴 변 기준으로 정렬 (테트리스처럼 긴 조각 먼저)
  const sortedPanels = [...panels].sort((a, b) => {
    const areaA = a.width * a.height;
    const areaB = b.width * b.height;
    if (Math.abs(areaA - areaB) > 10000) {
      return areaB - areaA; // 면적 차이가 크면 면적 우선
    }
    // 면적이 비슷하면 긴 변 우선
    const maxA = Math.max(a.width, a.height);
    const maxB = Math.max(b.width, b.height);
    return maxB - maxA;
  });
  
  const bins: PackedBin[] = [];
  let currentBin = 0;
  const remainingPanels = [...sortedPanels];
  
  while (remainingPanels.length > 0 && currentBin < maxBins) {
    
    const packer = new MaxRectsPacker(binWidth, binHeight, kerf);
    const placedInThisBin: number[] = [];
    
    // 현재 빈에 가능한 많은 패널 배치
    for (let i = 0; i < remainingPanels.length; i++) {
      const panel = remainingPanels[i];
      const placed = packer.pack(panel);
      
      if (placed) {
        placedInThisBin.push(i);
      }
    }
    
    if (placedInThisBin.length === 0) {
      console.warn('[packMaxRects] Cannot place any more panels!');
      console.warn(`[packMaxRects] Remaining ${remainingPanels.length} panels:`);
      remainingPanels.forEach(p => {
        console.warn(`  - ${p.name || p.id}: ${p.width}x${p.height}mm, canRotate=${p.canRotate}`);
      });
      console.warn(`[packMaxRects] Bin size: ${binWidth}x${binHeight}mm, kerf: ${kerf}mm`);
      break;
    }
    
    // 배치된 패널들 제거
    placedInThisBin.reverse().forEach(index => {
      remainingPanels.splice(index, 1);
    });
    
    const result = packer.getResult();
    bins.push(result);
    
    currentBin++;
  }
  
  return bins;
}