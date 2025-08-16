/**
 * Simple and reliable packing algorithm for CNC cutting
 * 간단하고 신뢰할 수 있는 패킹 알고리즘
 */

import { Rect, PackedBin } from './simpleBinPacking';

export class SimplePacker {
  private binWidth: number;
  private binHeight: number;
  private kerf: number;
  private panels: Rect[] = [];
  
  constructor(width: number, height: number, kerf: number = 5) {
    this.binWidth = width;
    this.binHeight = height;
    this.kerf = kerf;
  }
  
  /**
   * Bottom-Left 알고리즘으로 패널 배치
   */
  pack(panel: Rect): Rect | null {
    // 가능한 모든 위치 찾기
    const positions = this.getPossiblePositions();
    
    // 원래 방향으로 배치 시도
    for (const pos of positions) {
      if (this.canPlacePanel(panel.width, panel.height, pos.x, pos.y)) {
        const packed: Rect = {
          ...panel,
          x: pos.x,
          y: pos.y,
          width: panel.width,
          height: panel.height,
          rotated: false
        };
        this.panels.push(packed);
        // console.log(`Placed panel ${panel.id} at (${pos.x}, ${pos.y}) size: ${panel.width}x${panel.height}`);
        return packed;
      }
    }
    
    // 회전 가능하면 회전해서 시도
    if (panel.canRotate === true) {
      for (const pos of positions) {
        if (this.canPlacePanel(panel.height, panel.width, pos.x, pos.y)) {
          const packed: Rect = {
            ...panel,
            x: pos.x,
            y: pos.y,
            width: panel.width,  // 원본 크기 유지
            height: panel.height,  // 원본 크기 유지
            rotated: true
          };
          this.panels.push(packed);
          // console.log(`Placed rotated panel ${panel.id} at (${pos.x}, ${pos.y}) size: ${panel.height}x${panel.width}`);
          return packed;
        }
      }
    }
    
    // console.log(`Could not place panel ${panel.id} (${panel.width}x${panel.height})`);
    return null;
  }
  
  /**
   * 가능한 배치 위치들을 찾기
   */
  private getPossiblePositions(): { x: number; y: number }[] {
    const positions: { x: number; y: number }[] = [];
    
    // 시작 위치 (왼쪽 아래)
    positions.push({ x: 0, y: 0 });
    
    // 기존 패널들의 모서리 위치들
    for (const panel of this.panels) {
      const actualWidth = panel.rotated ? panel.height : panel.width;
      const actualHeight = panel.rotated ? panel.width : panel.height;
      
      // 패널 오른쪽
      positions.push({ 
        x: panel.x + actualWidth + this.kerf, 
        y: panel.y 
      });
      
      // 패널 위쪽
      positions.push({ 
        x: panel.x, 
        y: panel.y + actualHeight + this.kerf 
      });
      
      // 패널 오른쪽 위
      positions.push({ 
        x: panel.x + actualWidth + this.kerf, 
        y: panel.y + actualHeight + this.kerf 
      });
      
      // 새로운 행 시작점
      positions.push({ 
        x: 0, 
        y: panel.y + actualHeight + this.kerf 
      });
    }
    
    // 중복 제거하고 정렬 (아래쪽 우선, 그 다음 왼쪽)
    const uniquePositions = Array.from(new Set(positions.map(p => `${p.x},${p.y}`)))
      .map(str => {
        const [x, y] = str.split(',').map(Number);
        return { x, y };
      })
      .filter(pos => {
        // 원장 범위 안에 있는 위치만
        return pos.x >= 0 && pos.y >= 0 && 
               pos.x < this.binWidth && pos.y < this.binHeight;
      })
      .sort((a, b) => {
        // y가 작은 것 우선 (아래쪽)
        if (a.y !== b.y) return a.y - b.y;
        // 같은 y라면 x가 작은 것 우선 (왼쪽)
        return a.x - b.x;
      });
    
    return uniquePositions;
  }
  
  /**
   * 주어진 위치에 패널을 놓을 수 있는지 확인
   */
  private canPlacePanel(width: number, height: number, x: number, y: number): boolean {
    // 위치가 음수면 불가
    if (x < 0 || y < 0) {
      return false;
    }
    
    // 원장 범위를 벗어나면 불가
    if (x + width > this.binWidth || y + height > this.binHeight) {
      return false;
    }
    
    // 다른 패널과 겹치는지 확인
    for (const panel of this.panels) {
      const actualWidth = panel.rotated ? panel.height : panel.width;
      const actualHeight = panel.rotated ? panel.width : panel.height;
      
      // 두 사각형이 겹치는지 확인 (kerf 포함)
      const overlap = !(
        x >= panel.x + actualWidth + this.kerf ||  // 새 패널이 오른쪽에
        panel.x >= x + width + this.kerf ||         // 새 패널이 왼쪽에
        y >= panel.y + actualHeight + this.kerf ||  // 새 패널이 위쪽에
        panel.y >= y + height + this.kerf           // 새 패널이 아래쪽에
      );
      
      if (overlap) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * 패킹 결과 반환
   */
  getResult(): PackedBin {
    let usedArea = 0;
    let maxX = 0;
    let maxY = 0;
    
    for (const panel of this.panels) {
      // 면적은 원본 크기로 계산
      usedArea += panel.width * panel.height;
      
      // 실제 차지하는 공간으로 경계 계산
      const actualWidth = panel.rotated ? panel.height : panel.width;
      const actualHeight = panel.rotated ? panel.width : panel.height;
      
      maxX = Math.max(maxX, panel.x + actualWidth);
      maxY = Math.max(maxY, panel.y + actualHeight);
    }
    
    const totalArea = this.binWidth * this.binHeight;
    const efficiency = totalArea > 0 ? (usedArea / totalArea) * 100 : 0;
    
    // console.log(`Bin result: ${this.panels.length} panels, efficiency: ${efficiency.toFixed(1)}%, bounds: ${maxX}x${maxY}`);
    
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
 * 간단한 패킹 함수 - 멀티 빈 패킹
 */
export function packSimple(
  panels: Rect[],
  binWidth: number,
  binHeight: number,
  kerf: number = 5,
  maxBins: number = 999
): PackedBin[] {
  // console.log(`\n=== Starting Multi-Bin Packing ===`);
  // console.log(`Total panels: ${panels.length}`);
  // console.log(`Bin size: ${binWidth}x${binHeight}mm`);
  // console.log(`Kerf: ${kerf}mm`);
  // console.log(`Max bins: ${maxBins}`);
  
  // 패널을 정렬 - 세로로 긴 패널 우선, 그 다음 면적 순
  const sortedPanels = [...panels].sort((a, b) => {
    // 먼저 높이(세로 길이)가 긴 것 우선
    const heightDiff = b.height - a.height;
    if (heightDiff !== 0) return heightDiff;
    
    // 높이가 같으면 면적이 큰 것 우선
    return b.width * b.height - a.width * a.height;
  });
  
  const bins: PackedBin[] = [];
  let currentBin = 0;
  let remainingPanels = [...sortedPanels];
  
  // 모든 패널을 배치할 때까지 반복
  while (remainingPanels.length > 0 && currentBin < maxBins) {
    // console.log(`\n--- Creating Bin ${currentBin + 1} ---`);
    // console.log(`Remaining panels: ${remainingPanels.length}`);
    
    // 새 빈 생성
    const packer = new SimplePacker(binWidth, binHeight, kerf);
    const placedInThisBin: number[] = [];
    
    // 현재 빈에 가능한 많은 패널 배치
    for (let i = 0; i < remainingPanels.length; i++) {
      const panel = remainingPanels[i];
      const packed = packer.pack(panel);
      
      if (packed) {
        placedInThisBin.push(i);
        // console.log(`  ✓ Placed panel ${panel.id || i}: ${panel.width}x${panel.height}mm at (${packed.x}, ${packed.y})`;
      } else {
        // console.log(`  ✗ Could not place panel ${panel.id || i}: ${panel.width}x${panel.height}mm`);
      }
    }
    
    // 이 빈에 하나도 배치하지 못했으면 원장보다 큰 패널이 있음
    if (placedInThisBin.length === 0) {
      // 원장보다 큰 패널이 있는지 확인
      const oversizedPanels = remainingPanels.filter(p => 
        (p.width > binWidth || p.height > binHeight) && 
        (!p.canRotate || (p.height > binWidth || p.width > binHeight))
      );
      
      if (oversizedPanels.length > 0) {
        console.warn('Some panels are too large for the stock sheet size');
        // 더 이상 진행할 수 없으므로 중단
        break;
      }
      
      // 모든 패널이 원장에 맞는 크기인데도 배치하지 못했다면 다른 문제
      console.warn('Unable to place remaining panels - may need more sheets');
      break;
    }
    
    // 배치된 패널들을 remainingPanels에서 제거 (뒤에서부터)
    placedInThisBin.sort((a, b) => b - a);
    for (const idx of placedInThisBin) {
      remainingPanels.splice(idx, 1);
    }
    
    // 이 빈의 결과 저장
    const result = packer.getResult();
    if (result.panels.length > 0) {
      bins.push(result);
      // console.log(`Bin ${currentBin + 1} complete:`);
      // console.log(`  - Panels: ${result.panels.length}`);
      // console.log(`  - Efficiency: ${result.efficiency.toFixed(1)}%`);
      // console.log(`  - Used area: ${(result.usedArea / 1000000).toFixed(2)}m²`);
    }
    
    currentBin++;
  }
  
  // 최종 결과 출력
  // console.log(`\n=== Packing Complete ===`);
  // console.log(`Total bins used: ${bins.length}`);
  // console.log(`Total panels placed: ${panels.length - remainingPanels.length}`);
  // console.log(`Unpacked panels: ${remainingPanels.length}`);
  
  // 배치되지 못한 패널이 있으면 조용히 처리 (이미 오류 콘솔에 기록됨)
  // if (remainingPanels.length > 0) {
  //   console.warn('\nWarning: Some panels could not be packed:');
  //   remainingPanels.forEach((p, i) => {
  //     console.warn(`  Panel ${i}: ${p.width}x${p.height}mm`);
  //   });
  // }
  
  return bins;
}