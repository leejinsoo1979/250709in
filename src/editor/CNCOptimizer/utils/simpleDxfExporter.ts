import { OptimizedResult } from '../types';

export class SimpleDXFExporter {
  
  public static exportToDXF(results: OptimizedResult[]): string {
    const lines: string[] = [];
    
    // DXF Header section - Minimal for compatibility
    lines.push('0');
    lines.push('SECTION');
    lines.push('2');
    lines.push('HEADER');
    lines.push('9');
    lines.push('$ACADVER');
    lines.push('1');
    lines.push('AC1009'); // AutoCAD R12 - most compatible
    lines.push('0');
    lines.push('ENDSEC');
    
    // Entities section
    lines.push('0');
    lines.push('SECTION');
    lines.push('2');
    lines.push('ENTITIES');
    
    // Process each sheet
    results.forEach((result, sheetIndex) => {
      const offsetX = sheetIndex * (result.stockPanel.width + 200);
      const offsetY = 0;
      
      // Draw stock panel outline (white - color 7)
      // Top line
      lines.push('0');
      lines.push('LINE');
      lines.push('8');
      lines.push('0'); // Layer
      lines.push('62');
      lines.push('7'); // White color
      lines.push('10');
      lines.push(String(offsetX));
      lines.push('20');
      lines.push(String(offsetY));
      lines.push('11');
      lines.push(String(offsetX + result.stockPanel.width));
      lines.push('21');
      lines.push(String(offsetY));
      
      // Right line
      lines.push('0');
      lines.push('LINE');
      lines.push('8');
      lines.push('0');
      lines.push('62');
      lines.push('7'); // White color
      lines.push('10');
      lines.push(String(offsetX + result.stockPanel.width));
      lines.push('20');
      lines.push(String(offsetY));
      lines.push('11');
      lines.push(String(offsetX + result.stockPanel.width));
      lines.push('21');
      lines.push(String(offsetY + result.stockPanel.height));
      
      // Bottom line
      lines.push('0');
      lines.push('LINE');
      lines.push('8');
      lines.push('0');
      lines.push('62');
      lines.push('7'); // White color
      lines.push('10');
      lines.push(String(offsetX + result.stockPanel.width));
      lines.push('20');
      lines.push(String(offsetY + result.stockPanel.height));
      lines.push('11');
      lines.push(String(offsetX));
      lines.push('21');
      lines.push(String(offsetY + result.stockPanel.height));
      
      // Left line
      lines.push('0');
      lines.push('LINE');
      lines.push('8');
      lines.push('0');
      lines.push('62');
      lines.push('7'); // White color
      lines.push('10');
      lines.push(String(offsetX));
      lines.push('20');
      lines.push(String(offsetY + result.stockPanel.height));
      lines.push('11');
      lines.push(String(offsetX));
      lines.push('21');
      lines.push(String(offsetY));
      
      // Draw panels
      result.panels.forEach(panel => {
        const panelX = offsetX + panel.x;
        const panelY = offsetY + panel.y;
        
        // 회전 여부에 따른 실제 크기 (뷰어와 동일하게)
        const displayWidth = panel.rotated ? panel.height : panel.width;
        const displayHeight = panel.rotated ? panel.width : panel.height;
        
        // Panel outline (orange - color 30)
        // Top line
        lines.push('0');
        lines.push('LINE');
        lines.push('8');
        lines.push('0');
        lines.push('62');
        lines.push('30'); // Orange color
        lines.push('10');
        lines.push(String(panelX));
        lines.push('20');
        lines.push(String(panelY));
        lines.push('11');
        lines.push(String(panelX + displayWidth));
        lines.push('21');
        lines.push(String(panelY));
        
        // Right line
        lines.push('0');
        lines.push('LINE');
        lines.push('8');
        lines.push('0');
        lines.push('62');
        lines.push('30'); // Orange color
        lines.push('10');
        lines.push(String(panelX + displayWidth));
        lines.push('20');
        lines.push(String(panelY));
        lines.push('11');
        lines.push(String(panelX + displayWidth));
        lines.push('21');
        lines.push(String(panelY + displayHeight));
        
        // Bottom line
        lines.push('0');
        lines.push('LINE');
        lines.push('8');
        lines.push('0');
        lines.push('62');
        lines.push('30'); // Orange color
        lines.push('10');
        lines.push(String(panelX + displayWidth));
        lines.push('20');
        lines.push(String(panelY + displayHeight));
        lines.push('11');
        lines.push(String(panelX));
        lines.push('21');
        lines.push(String(panelY + displayHeight));
        
        // Left line
        lines.push('0');
        lines.push('LINE');
        lines.push('8');
        lines.push('0');
        lines.push('62');
        lines.push('30'); // Orange color
        lines.push('10');
        lines.push(String(panelX));
        lines.push('20');
        lines.push(String(panelY + displayHeight));
        lines.push('11');
        lines.push(String(panelX));
        lines.push('21');
        lines.push(String(panelY));
        
        // Panel ID text (center)
        lines.push('0');
        lines.push('TEXT');
        lines.push('8');
        lines.push('0');
        lines.push('10');
        lines.push(String(panelX + displayWidth / 2));
        lines.push('20');
        lines.push(String(panelY + displayHeight / 2));
        lines.push('40');
        lines.push('12'); // Text height for ID
        lines.push('1');
        lines.push(panel.id);
        lines.push('72');
        lines.push('1'); // Center horizontally
        lines.push('73');
        lines.push('2'); // Center vertically
        lines.push('11');
        lines.push(String(panelX + displayWidth / 2));
        lines.push('21');
        lines.push(String(panelY + displayHeight / 2));
        
        // 치수 표시 - 뷰어와 동일하게 (화면에 표시된 크기를 그대로 표시)
        // DXF는 패널 외부에 치수 표시
        
        // L방향 치수 (가로 치수) - 하단 외부에 가로로 표시
        lines.push('0');
        lines.push('TEXT');
        lines.push('8');
        lines.push('0');
        lines.push('10');
        lines.push(String(panelX + displayWidth / 2));
        lines.push('20');
        lines.push(String(panelY - 15)); // 패널 하단 외부
        lines.push('40');
        lines.push('20'); // 더 큰 텍스트 높이
        lines.push('1');
        lines.push(String(Math.round(displayWidth))); // 화면에 표시된 가로 크기
        lines.push('72');
        lines.push('1'); // Center horizontally
        lines.push('73');
        lines.push('3'); // Top aligned
        lines.push('11');
        lines.push(String(panelX + displayWidth / 2));
        lines.push('21');
        lines.push(String(panelY - 15));
        
        // W방향 치수 (세로 치수) - 좌측 외부에 세로로 표시 (90도 회전)
        lines.push('0');
        lines.push('TEXT');
        lines.push('8');
        lines.push('0');
        lines.push('10');
        lines.push(String(panelX - 15)); // 패널 좌측 외부
        lines.push('20');
        lines.push(String(panelY + displayHeight / 2));
        lines.push('40');
        lines.push('20'); // 더 큰 텍스트 높이
        lines.push('1');
        lines.push(String(Math.round(displayHeight))); // 화면에 표시된 세로 크기
        lines.push('50');
        lines.push('90'); // 90도 회전
        lines.push('72');
        lines.push('2'); // Center vertically
        lines.push('73');
        lines.push('0'); // Left aligned
        lines.push('11');
        lines.push(String(panelX - 15));
        lines.push('21');
        lines.push(String(panelY + displayHeight / 2));
      });
      
      // Sheet label
      lines.push('0');
      lines.push('TEXT');
      lines.push('8');
      lines.push('0');
      lines.push('10');
      lines.push(String(offsetX + 10));
      lines.push('20');
      lines.push(String(offsetY - 30));
      lines.push('40');
      lines.push('15'); // Text height
      lines.push('1');
      lines.push(`Sheet ${sheetIndex + 1}`);
    });
    
    // End entities
    lines.push('0');
    lines.push('ENDSEC');
    lines.push('0');
    lines.push('EOF');
    
    return lines.join('\r\n');
  }
}