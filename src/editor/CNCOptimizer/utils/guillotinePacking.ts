/**
 * 길로틴 컷(Guillotine Cut) 최적화 알고리즘
 * 한 방향으로 먼저 전체를 자른 후 다른 방향으로 자르는 방식
 * 실제 컷쏘 작업 방식을 반영한 최적화
 */

import { Rect, PackedBin } from './simpleBinPacking';

interface Strip {
  x: number;
  y: number;
  width: number;
  height: number;
  panels: PlacedRect[];
  horizontal: boolean; // true: 가로 스트립, false: 세로 스트립
}

interface PlacedRect extends Rect {
  stripIndex?: number;
}

export class GuillotinePacker {
  private binWidth: number;
  private binHeight: number;
  private kerf: number;
  private strips: Strip[] = [];
  private bestLayout: { strips: Strip[], efficiency: number } | null = null;
  
  constructor(width: number, height: number, kerf: number = 5) {
    this.binWidth = width;
    this.binHeight = height;
    this.kerf = kerf;
  }
  
  /**
   * 길로틴 방식으로 패널 배치
   * stripDirection이 지정되면 해당 방향만, auto면 모든 방법 시도
   */
  packAll(panels: Rect[], stripDirection: 'horizontal' | 'vertical' | 'auto' = 'auto'): PackedBin {
    // 더 큰 패널들을 먼저 배치하기 위해 정렬
    const sortedPanels = [...panels].sort((a, b) => {
      const areaA = a.width * a.height;
      const areaB = b.width * b.height;
      return areaB - areaA;
    });
    
    let bestResult, bestEfficiency, bestStrategy;
    
    if (stripDirection === 'horizontal') {
      // 가로 스트립 = 가로로 먼저 자름 = BY_LENGTH (L방향 우선)
      bestResult = this.packWithStrips(sortedPanels, true);
      bestEfficiency = this.calculateEfficiency(bestResult);
      bestStrategy = 'horizontal';
    } else if (stripDirection === 'vertical') {
      // 세로 스트립 = 세로로 먼저 자름 = BY_WIDTH (W방향 우선)
      bestResult = this.packWithStrips(sortedPanels, false);
      bestEfficiency = this.calculateEfficiency(bestResult);
      bestStrategy = 'vertical';
    } else {
      // auto: 모든 방법 시도하고 최적 선택
      const horizontalResult = this.packWithStrips(sortedPanels, true);
      const horizontalEfficiency = this.calculateEfficiency(horizontalResult);
      
      const verticalResult = this.packWithStrips(sortedPanels, false);
      const verticalEfficiency = this.calculateEfficiency(verticalResult);
      
      const mixedResult = this.packWithMixedStrategy(sortedPanels);
      const mixedEfficiency = this.calculateEfficiency(mixedResult);
      
      // 가장 효율적인 레이아웃 선택
      bestResult = horizontalResult;
      bestEfficiency = horizontalEfficiency;
      bestStrategy = 'horizontal';
      
      if (verticalEfficiency > bestEfficiency) {
        bestResult = verticalResult;
        bestEfficiency = verticalEfficiency;
        bestStrategy = 'vertical';
      }
      
      if (mixedEfficiency > bestEfficiency) {
        bestResult = mixedResult;
        bestEfficiency = mixedEfficiency;
        bestStrategy = 'mixed';
      }
    }
    
    this.strips = bestResult;
    this.bestLayout = { strips: bestResult, efficiency: bestEfficiency };
    
    return this.getResult();
  }
  
  /**
   * 혼합 전략으로 패널 배치 (큰 패널은 가로, 작은 패널은 세로)
   */
  private packWithMixedStrategy(panels: Rect[]): Strip[] {
    const strips: Strip[] = [];
    const remainingPanels = [...panels];
    
    // 패널을 크기별로 분류
    const totalArea = panels.reduce((sum, p) => sum + p.width * p.height, 0);
    const avgArea = totalArea / panels.length;
    
    const largePanels = remainingPanels.filter(p => p.width * p.height > avgArea * 1.5);
    const smallPanels = remainingPanels.filter(p => p.width * p.height <= avgArea * 1.5);
    
    let currentY = 0;
    
    // 큰 패널들은 가로 스트립으로 배치
    if (largePanels.length > 0) {
      const largeStrips = this.packWithStrips(largePanels, true);
      for (const strip of largeStrips) {
        if (currentY + strip.height <= this.binHeight) {
          // 스트립 내 패널들의 좌표도 조정
          const adjustedPanels = strip.panels.map(panel => ({
            ...panel,
            y: currentY
          }));
          const adjustedStrip: Strip = { 
            ...strip, 
            y: currentY,
            panels: adjustedPanels 
          };
          strips.push(adjustedStrip);
          currentY += strip.height + this.kerf;
        }
      }
    }
    
    // 남은 공간에 작은 패널들을 세로 스트립으로 배치
    if (smallPanels.length > 0 && currentY < this.binHeight) {
      const remainingHeight = this.binHeight - currentY;
      const tempPacker = new GuillotinePacker(this.binWidth, remainingHeight, this.kerf);
      const smallStrips = tempPacker.packWithStrips(smallPanels, false);
      
      for (const strip of smallStrips) {
        // 스트립 내 패널들의 좌표도 조정
        const adjustedPanels = strip.panels.map(panel => ({
          ...panel,
          y: panel.y + currentY
        }));
        const adjustedStrip: Strip = { 
          ...strip, 
          y: strip.y + currentY,
          panels: adjustedPanels 
        };
        strips.push(adjustedStrip);
      }
    }
    
    return strips;
  }
  
  /**
   * 지정된 방향의 스트립으로 패널 배치
   */
  private packWithStrips(panels: Rect[], horizontal: boolean): Strip[] {
    const strips: Strip[] = [];
    const sortedPanels = this.sortPanels(panels, horizontal);
    const remainingPanels = [...sortedPanels];
    
    let currentPos = 0;
    
    while (remainingPanels.length > 0) {
      // 새 스트립 생성
      const strip = this.createStrip(remainingPanels, currentPos, horizontal);
      
      if (!strip || strip.panels.length === 0) {
        break;
      }
      
      strips.push(strip);
      
      // 배치된 패널 제거
      strip.panels.forEach(placedPanel => {
        const index = remainingPanels.findIndex(p => 
          p.id === placedPanel.id && 
          p.width === placedPanel.width && 
          p.height === placedPanel.height
        );
        if (index !== -1) {
          remainingPanels.splice(index, 1);
        }
      });
      
      // 다음 스트립 위치 계산
      if (horizontal) {
        currentPos = strip.y + strip.height + this.kerf;
      } else {
        currentPos = strip.x + strip.width + this.kerf;
      }
      
      // 공간 초과 체크
      if ((horizontal && currentPos >= this.binHeight) || 
          (!horizontal && currentPos >= this.binWidth)) {
        break;
      }
    }
    
    return strips;
  }
  
  /**
   * 새 스트립 생성 및 패널 배치
   */
  private createStrip(panels: Rect[], position: number, horizontal: boolean): Strip | null {
    if (panels.length === 0) return null;
    
    const strip: Strip = {
      x: horizontal ? 0 : position,
      y: horizontal ? position : 0,
      width: horizontal ? this.binWidth : 0,
      height: horizontal ? 0 : this.binHeight,
      panels: [],
      horizontal
    };
    
    if (horizontal) {
      // 가로 스트립: 가장 적합한 높이 찾기
      // 첫 번째 패널의 높이를 기준으로 시작
      let stripHeight = 0;
      let bestFit = 0;
      
      // 남은 공간 확인
      const remainingHeight = this.binHeight - position;
      if (remainingHeight <= 0) return null;
      
      // 패널들의 높이 분포 분석
      const heights = panels.map(p => p.height);
      const rotatedHeights = panels.filter(p => p.canRotate).map(p => p.width);
      const allHeights = [...heights, ...rotatedHeights].sort((a, b) => b - a);
      
      // 가장 큰 높이부터 시도
      for (const h of allHeights) {
        if (h <= remainingHeight) {
          // 이 높이로 얼마나 많은 패널을 배치할 수 있는지 계산
          let testWidth = 0;
          let testCount = 0;
          
          for (const panel of panels) {
            const tolerance = 0.1; // 10% 허용 오차로 줄임
            const heightMatch = Math.abs(panel.height - h) / h <= tolerance;
            const rotatedMatch = panel.canRotate && Math.abs(panel.width - h) / h <= tolerance;
            
            if ((heightMatch || rotatedMatch) && testWidth + panel.width <= this.binWidth) {
              testWidth += (heightMatch ? panel.width : panel.height) + this.kerf;
              testCount++;
            }
          }
          
          // 공간 활용도 계산
          const utilization = (testWidth / this.binWidth) * testCount;
          if (utilization > bestFit) {
            stripHeight = h;
            bestFit = utilization;
          }
        }
      }
      
      if (stripHeight === 0) return null;
      
      strip.height = stripHeight;
      
      // 스트립이 빈 영역을 벗어나는지 체크
      if (strip.y + strip.height > this.binHeight) {
        return null;
      }
      
      // 높이가 맞는 패널들을 가로로 배치
      let currentX = 0;
      const placedSet = new Set<Rect>();

      // 1차: 정확히 같은 높이의 패널 배치 (오차 2% 이내)
      for (const panel of panels) {
        if (placedSet.has(panel)) continue;

        const heightDiff = Math.abs(panel.height - strip.height) / strip.height;

        if (heightDiff <= 0.02 && currentX + panel.width <= this.binWidth) {
          const placedPanel: PlacedRect = {
            ...panel,
            x: currentX,
            y: strip.y,
            stripIndex: this.strips.length
          };
          strip.panels.push(placedPanel);
          currentX += panel.width + this.kerf;
          placedSet.add(panel);
        }
      }

      // 2차: 유사한 높이의 패널 배치 (오차 10% 이내)
      for (const panel of panels) {
        if (placedSet.has(panel)) continue;

        const heightDiff = Math.abs(panel.height - strip.height) / strip.height;

        if (heightDiff <= 0.1 && currentX + panel.width <= this.binWidth) {
          const placedPanel: PlacedRect = {
            ...panel,
            x: currentX,
            y: strip.y,
            stripIndex: this.strips.length
          };
          strip.panels.push(placedPanel);
          currentX += panel.width + this.kerf;
          placedSet.add(panel);
        }
      }

      // 3차: 회전 가능한 패널 중 맞는 것 배치
      for (const panel of panels) {
        if (placedSet.has(panel) || !panel.canRotate) continue;

        const rotatedHeightDiff = Math.abs(panel.width - strip.height) / strip.height;
        if (rotatedHeightDiff <= 0.1 && currentX + panel.height <= this.binWidth) {
          const placedPanel: PlacedRect = {
            ...panel,
            x: currentX,
            y: strip.y,
            rotated: true,
            stripIndex: this.strips.length
          };
          strip.panels.push(placedPanel);
          currentX += panel.height + this.kerf;
          placedSet.add(panel);
        }
      }
    } else {
      // 세로 스트립: 너비가 비슷한 패널들을 묶음
      let stripWidth = 0;
      let bestFit = 0;
      
      // 남은 공간 확인
      const remainingWidth = this.binWidth - position;
      if (remainingWidth <= 0) return null;
      
      // 패널들의 너비 분포 분석
      const widths = panels.map(p => p.width);
      const rotatedWidths = panels.filter(p => p.canRotate).map(p => p.height);
      const allWidths = [...widths, ...rotatedWidths].sort((a, b) => b - a);
      
      // 가장 큰 너비부터 시도
      for (const w of allWidths) {
        if (w <= remainingWidth) {
          // 이 너비로 얼마나 많은 패널을 배치할 수 있는지 계산
          let testHeight = 0;
          let testCount = 0;
          
          for (const panel of panels) {
            const tolerance = 0.1; // 10% 허용 오차로 줄임
            const widthMatch = Math.abs(panel.width - w) / w <= tolerance;
            const rotatedMatch = panel.canRotate && Math.abs(panel.height - w) / w <= tolerance;
            
            if ((widthMatch || rotatedMatch) && testHeight + panel.height <= this.binHeight) {
              testHeight += (widthMatch ? panel.height : panel.width) + this.kerf;
              testCount++;
            }
          }
          
          // 공간 활용도 계산
          const utilization = (testHeight / this.binHeight) * testCount;
          if (utilization > bestFit) {
            stripWidth = w;
            bestFit = utilization;
          }
        }
      }
      
      if (stripWidth === 0) return null;
      
      strip.width = stripWidth;
      
      // 스트립이 빈 영역을 벗어나는지 체크
      if (strip.x + strip.width > this.binWidth) {
        return null;
      }
      
      // 너비가 맞는 패널들을 세로로 배치
      let currentY = 0;
      const placedSet = new Set<Rect>();

      // 1차: 정확히 같은 너비의 패널 배치 (오차 2% 이내)
      for (const panel of panels) {
        if (placedSet.has(panel)) continue;

        const widthDiff = Math.abs(panel.width - strip.width) / strip.width;

        if (widthDiff <= 0.02 && currentY + panel.height <= this.binHeight) {
          const placedPanel: PlacedRect = {
            ...panel,
            x: strip.x,
            y: currentY,
            stripIndex: this.strips.length
          };
          strip.panels.push(placedPanel);
          currentY += panel.height + this.kerf;
          placedSet.add(panel);
        }
      }

      // 2차: 유사한 너비의 패널 배치 (오차 10% 이내)
      for (const panel of panels) {
        if (placedSet.has(panel)) continue;

        const widthDiff = Math.abs(panel.width - strip.width) / strip.width;

        if (widthDiff <= 0.1 && currentY + panel.height <= this.binHeight) {
          const placedPanel: PlacedRect = {
            ...panel,
            x: strip.x,
            y: currentY,
            stripIndex: this.strips.length
          };
          strip.panels.push(placedPanel);
          currentY += panel.height + this.kerf;
          placedSet.add(panel);
        }
      }

      // 3차: 회전 가능한 패널 중 맞는 것 배치
      for (const panel of panels) {
        if (placedSet.has(panel) || !panel.canRotate) continue;

        const rotatedWidthDiff = Math.abs(panel.height - strip.width) / strip.width;
        if (rotatedWidthDiff <= 0.1 && currentY + panel.width <= this.binHeight) {
          const placedPanel: PlacedRect = {
            ...panel,
            x: strip.x,
            y: currentY,
            rotated: true,
            stripIndex: this.strips.length
          };
          strip.panels.push(placedPanel);
          currentY += panel.width + this.kerf;
          placedSet.add(panel);
        }
      }
    }
    
    return strip.panels.length > 0 ? strip : null;
  }
  
  /**
   * 패널 정렬 (스트립 방향에 따라)
   * 같은 크기의 패널들을 그룹화하여 효율적인 배치 유도
   */
  private sortPanels(panels: Rect[], horizontal: boolean): Rect[] {
    // 1단계: 크기별로 패널 그룹화 (정확히 같은 크기끼리)
    const sizeGroups = new Map<string, Rect[]>();

    for (const panel of panels) {
      // 크기 기준 키 생성 (소수점 반올림)
      const key = `${Math.round(panel.width)}_${Math.round(panel.height)}`;
      if (!sizeGroups.has(key)) {
        sizeGroups.set(key, []);
      }
      sizeGroups.get(key)!.push(panel);
    }

    // 2단계: 그룹을 스트립 방향에 따라 정렬
    const sortedGroups = [...sizeGroups.entries()].sort((a, b) => {
      const [keyA] = a;
      const [keyB] = b;
      const [widthA, heightA] = keyA.split('_').map(Number);
      const [widthB, heightB] = keyB.split('_').map(Number);

      if (horizontal) {
        // 가로 스트립: 높이 기준 정렬 (큰 것 먼저), 그 다음 개수 (많은 것 먼저)
        const heightDiff = heightB - heightA;
        if (heightDiff !== 0) return heightDiff;
        return b[1].length - a[1].length;
      } else {
        // 세로 스트립: 너비 기준 정렬 (큰 것 먼저), 그 다음 개수 (많은 것 먼저)
        const widthDiff = widthB - widthA;
        if (widthDiff !== 0) return widthDiff;
        return b[1].length - a[1].length;
      }
    });

    // 3단계: 정렬된 그룹들을 순서대로 펼침
    const result: Rect[] = [];
    for (const [, group] of sortedGroups) {
      result.push(...group);
    }

    return result;
  }
  
  /**
   * 레이아웃 효율 계산
   */
  private calculateEfficiency(strips: Strip[]): number {
    let usedArea = 0;
    
    for (const strip of strips) {
      for (const panel of strip.panels) {
        // 회전 여부와 관계없이 원본 크기로 면적 계산
        usedArea += panel.width * panel.height;
      }
    }
    
    const totalArea = this.binWidth * this.binHeight;
    return totalArea > 0 ? (usedArea / totalArea) * 100 : 0;
  }
  
  /**
   * 패킹 결과 반환
   */
  getResult(): PackedBin {
    const panels: Rect[] = [];
    let usedArea = 0;
    const placedPanels = new Set<string>();
    
    for (const strip of this.strips) {
      for (const panel of strip.panels) {
        // 중복 패널 방지
        const panelKey = `${panel.id}-${panel.x}-${panel.y}`;
        if (placedPanels.has(panelKey)) {
          console.warn(`Duplicate panel detected: ${panelKey}`);
          continue;
        }
        placedPanels.add(panelKey);
        
        // 패널이 스트립 경계를 벗어나지 않도록 검증
        const finalPanel = { ...panel };
        
        // 좌표가 음수가 되지 않도록 보장
        if (finalPanel.x < 0) finalPanel.x = 0;
        if (finalPanel.y < 0) finalPanel.y = 0;
        
        // 패널이 빈 영역을 벗어나지 않도록 보장
        const actualWidth = finalPanel.rotated ? finalPanel.height : finalPanel.width;
        const actualHeight = finalPanel.rotated ? finalPanel.width : finalPanel.height;
        
        if (finalPanel.x + actualWidth > this.binWidth) {
          console.warn(`Panel extends beyond bin width: ${finalPanel.x + actualWidth} > ${this.binWidth}`);
          continue;
        }
        if (finalPanel.y + actualHeight > this.binHeight) {
          console.warn(`Panel extends beyond bin height: ${finalPanel.y + actualHeight} > ${this.binHeight}`);
          continue;
        }
        
        panels.push(finalPanel);
        // 회전 여부와 관계없이 원본 크기로 면적 계산
        usedArea += finalPanel.width * finalPanel.height;
      }
    }
    
    const efficiency = this.bestLayout?.efficiency || 0;
    
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
 * 길로틴 방식 멀티 빈 패킹
 */
export function packGuillotine(
  panels: Rect[],
  binWidth: number,
  binHeight: number,
  kerf: number = 5,
  maxBins: number = 999,
  stripDirection: 'horizontal' | 'vertical' | 'auto' = 'auto'
): PackedBin[] {
  
  const bins: PackedBin[] = [];
  let currentBin = 0;
  const remainingPanels = [...panels];
  
  while (remainingPanels.length > 0 && currentBin < maxBins) {
    
    const packer = new GuillotinePacker(binWidth, binHeight, kerf);
    const result = packer.packAll(remainingPanels, stripDirection);
    
    if (result.panels.length === 0) {
      console.warn('Cannot place any more panels in guillotine mode');
      break;
    }
    
    // 배치된 패널들을 제거
    // ID가 같은 패널이 여러 개 있을 수 있으므로 개수를 세어야 함
    for (const placedPanel of result.panels) {
      const index = remainingPanels.findIndex(p => 
        p.id === placedPanel.id && 
        p.width === placedPanel.width && 
        p.height === placedPanel.height
      );
      if (index !== -1) {
        remainingPanels.splice(index, 1);
      }
    }
    
    bins.push(result);
    
    currentBin++;
  }
  
  return bins;
}