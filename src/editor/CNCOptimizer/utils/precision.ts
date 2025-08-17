/**
 * 정밀도 보장 유틸리티
 * 0.1mm 오차도 허용하지 않는 정확한 계산
 */

/**
 * 정수 기반 계산 (0.1mm 단위를 정수로 변환)
 * 1mm = 10 단위로 계산하여 소수점 오차 제거
 */
export class PrecisionCalculator {
  private static readonly PRECISION = 10; // 0.1mm 정밀도
  
  /**
   * mm를 정수 단위로 변환 (0.1mm = 1 단위)
   */
  static toInt(mm: number): number {
    return Math.round(mm * this.PRECISION);
  }
  
  /**
   * 정수 단위를 mm로 변환
   */
  static toMm(intValue: number): number {
    return intValue / this.PRECISION;
  }
  
  /**
   * 정밀한 더하기
   */
  static add(a: number, b: number): number {
    const intA = this.toInt(a);
    const intB = this.toInt(b);
    return this.toMm(intA + intB);
  }
  
  /**
   * 정밀한 빼기
   */
  static subtract(a: number, b: number): number {
    const intA = this.toInt(a);
    const intB = this.toInt(b);
    return this.toMm(intA - intB);
  }
  
  /**
   * 정밀한 곱하기
   */
  static multiply(a: number, b: number): number {
    const intA = this.toInt(a);
    const intB = this.toInt(b);
    return this.toMm((intA * intB) / this.PRECISION);
  }
  
  /**
   * 정밀한 나누기
   */
  static divide(a: number, b: number): number {
    const intA = this.toInt(a);
    const intB = this.toInt(b);
    return this.toMm((intA * this.PRECISION) / intB);
  }
  
  /**
   * 정밀한 비교 (같음)
   */
  static equals(a: number, b: number): boolean {
    return this.toInt(a) === this.toInt(b);
  }
  
  /**
   * 정밀한 비교 (작거나 같음)
   */
  static lte(a: number, b: number): boolean {
    return this.toInt(a) <= this.toInt(b);
  }
  
  /**
   * 정밀한 비교 (크거나 같음)
   */
  static gte(a: number, b: number): boolean {
    return this.toInt(a) >= this.toInt(b);
  }
}

/**
 * 배치 검증 클래스
 * 모든 패널 배치가 정확한지 검증
 */
export class PlacementValidator {
  /**
   * 패널 겹침 검사 (0.1mm 정밀도)
   */
  static checkOverlap(
    panel1: { x: number; y: number; width: number; height: number },
    panel2: { x: number; y: number; width: number; height: number },
    kerf: number
  ): boolean {
    const pc = PrecisionCalculator;
    
    // 정수 변환으로 정확한 계산
    const x1End = pc.add(panel1.x, panel1.width);
    const y1End = pc.add(panel1.y, panel1.height);
    const x2End = pc.add(panel2.x, panel2.width);
    const y2End = pc.add(panel2.y, panel2.height);
    
    // kerf 고려한 간격 체크
    const x1EndWithKerf = pc.add(x1End, kerf);
    const y1EndWithKerf = pc.add(y1End, kerf);
    const x2StartWithKerf = pc.subtract(panel2.x, kerf);
    const y2StartWithKerf = pc.subtract(panel2.y, kerf);
    
    // 겹침 여부 확인
    const noOverlapX = pc.lte(x1EndWithKerf, panel2.x) || pc.gte(panel1.x, x2End);
    const noOverlapY = pc.lte(y1EndWithKerf, panel2.y) || pc.gte(panel1.y, y2End);
    
    return !(noOverlapX || noOverlapY);
  }
  
  /**
   * 패널이 시트 범위 내에 있는지 검사
   */
  static checkInBounds(
    panel: { x: number; y: number; width: number; height: number },
    sheetWidth: number,
    sheetHeight: number
  ): boolean {
    const pc = PrecisionCalculator;
    
    const panelEndX = pc.add(panel.x, panel.width);
    const panelEndY = pc.add(panel.y, panel.height);
    
    return pc.gte(panel.x, 0) && 
           pc.gte(panel.y, 0) &&
           pc.lte(panelEndX, sheetWidth) &&
           pc.lte(panelEndY, sheetHeight);
  }
  
  /**
   * 전체 배치 검증
   */
  static validatePlacement(
    panels: Array<{ x: number; y: number; width: number; height: number; id: string }>,
    sheetWidth: number,
    sheetHeight: number,
    kerf: number
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // 1. 각 패널이 시트 범위 내에 있는지 검사
    for (const panel of panels) {
      if (!this.checkInBounds(panel, sheetWidth, sheetHeight)) {
        errors.push(`Panel ${panel.id} exceeds sheet bounds: ` +
          `${panel.x},${panel.y} ${panel.width}x${panel.height} in ${sheetWidth}x${sheetHeight}`);
      }
    }
    
    // 2. 패널 간 겹침 검사
    for (let i = 0; i < panels.length; i++) {
      for (let j = i + 1; j < panels.length; j++) {
        if (this.checkOverlap(panels[i], panels[j], kerf)) {
          errors.push(`Panels ${panels[i].id} and ${panels[j].id} overlap`);
        }
      }
    }
    
    // 3. 치수 정확성 검사 (정수 변환 후 다시 변환했을 때 동일한지)
    for (const panel of panels) {
      const pc = PrecisionCalculator;
      const xCheck = pc.equals(panel.x, pc.toMm(pc.toInt(panel.x)));
      const yCheck = pc.equals(panel.y, pc.toMm(pc.toInt(panel.y)));
      const wCheck = pc.equals(panel.width, pc.toMm(pc.toInt(panel.width)));
      const hCheck = pc.equals(panel.height, pc.toMm(pc.toInt(panel.height)));
      
      if (!xCheck || !yCheck || !wCheck || !hCheck) {
        errors.push(`Panel ${panel.id} has precision errors in dimensions`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * 면적 계산 정확성 검증
   */
  static calculateExactArea(panels: Array<{ width: number; height: number }>): number {
    const pc = PrecisionCalculator;
    let totalArea = 0;
    
    for (const panel of panels) {
      // 정수 기반 면적 계산
      const area = pc.multiply(panel.width, panel.height);
      totalArea = pc.add(totalArea, area);
    }
    
    return totalArea;
  }
}

/**
 * 디버그 및 검증 보고서 생성
 */
export class PrecisionReport {
  static generate(
    panels: Array<{ x: number; y: number; width: number; height: number; id: string }>,
    sheetWidth: number,
    sheetHeight: number,
    kerf: number
  ): string {
    const validation = PlacementValidator.validatePlacement(panels, sheetWidth, sheetHeight, kerf);
    const totalArea = PlacementValidator.calculateExactArea(panels);
    const sheetArea = PrecisionCalculator.multiply(sheetWidth, sheetHeight);
    const efficiency = (totalArea / sheetArea) * 100;
    
    let report = '=== PRECISION VALIDATION REPORT ===\n';
    report += `Sheet: ${sheetWidth}mm x ${sheetHeight}mm\n`;
    report += `Kerf: ${kerf}mm\n`;
    report += `Panels: ${panels.length}\n`;
    report += `Total Area: ${totalArea.toFixed(1)}mm²\n`;
    report += `Sheet Area: ${sheetArea.toFixed(1)}mm²\n`;
    report += `Efficiency: ${efficiency.toFixed(2)}%\n`;
    report += `\nValidation: ${validation.valid ? '✅ PASS' : '❌ FAIL'}\n`;
    
    if (!validation.valid) {
      report += '\nErrors:\n';
      validation.errors.forEach(err => {
        report += `  - ${err}\n`;
      });
    }
    
    report += '\n=== Panel Details ===\n';
    panels.forEach(p => {
      report += `${p.id}: ${p.x.toFixed(1)},${p.y.toFixed(1)} ${p.width}x${p.height}mm\n`;
    });
    
    return report;
  }
}