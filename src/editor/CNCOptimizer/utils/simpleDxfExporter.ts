import { OptimizedResult } from '../types';

export class SimpleDXFExporter {
  
  public static exportToDXF(results: OptimizedResult[]): string {
    const lines: string[] = [];
    
    // DXF header with layer definitions for colors
    lines.push('0');
    lines.push('SECTION');
    lines.push('2');
    lines.push('TABLES');
    
    // Layer table
    lines.push('0');
    lines.push('TABLE');
    lines.push('2');
    lines.push('LAYER');
    lines.push('70');
    lines.push('4'); // Number of layers (including default)
    
    // Default layer (black for text)
    lines.push('0');
    lines.push('LAYER');
    lines.push('2');
    lines.push('0'); // Default layer name
    lines.push('70');
    lines.push('0');
    lines.push('62');
    lines.push('0'); // Black color
    
    // Stock layer (white)
    lines.push('0');
    lines.push('LAYER');
    lines.push('2');
    lines.push('STOCK');
    lines.push('70');
    lines.push('0');
    lines.push('62');
    lines.push('7'); // White color
    
    // Panel outline layer (orange)
    lines.push('0');
    lines.push('LAYER');
    lines.push('2');
    lines.push('PANEL_OUTLINE');
    lines.push('70');
    lines.push('0');
    lines.push('62');
    lines.push('30'); // Orange color
    
    // Panel fill layer (orange)
    lines.push('0');
    lines.push('LAYER');
    lines.push('2');
    lines.push('PANEL_FILL');
    lines.push('70');
    lines.push('0');
    lines.push('62');
    lines.push('30'); // Orange color
    
    lines.push('0');
    lines.push('ENDTAB');
    lines.push('0');
    lines.push('ENDSEC');
    
    // Start entities section
    lines.push('0');
    lines.push('SECTION');
    lines.push('2');
    lines.push('ENTITIES');
    
    // Process each sheet - 가로로 배열
    results.forEach((result, sheetIndex) => {
      const offsetX = sheetIndex * (result.stockPanel.width + 200);
      const offsetY = 0; // Y 오프셋은 0으로 고정
      
      // Stock panel fill - white SOLID (two triangles to make rectangle)
      // First triangle
      lines.push('0');
      lines.push('SOLID');
      lines.push('8');
      lines.push('STOCK');
      lines.push('62');
      lines.push('7'); // White color
      lines.push('10'); // First corner
      lines.push(String(offsetX));
      lines.push('20');
      lines.push(String(offsetY));
      lines.push('11'); // Second corner
      lines.push(String(offsetX + result.stockPanel.width));
      lines.push('21');
      lines.push(String(offsetY));
      lines.push('12'); // Third corner
      lines.push(String(offsetX + result.stockPanel.width));
      lines.push('22');
      lines.push(String(offsetY + result.stockPanel.height));
      lines.push('13'); // Fourth corner (same as first for quad)
      lines.push(String(offsetX));
      lines.push('23');
      lines.push(String(offsetY + result.stockPanel.height));
      
      // Second triangle to complete the rectangle
      lines.push('0');
      lines.push('SOLID');
      lines.push('8');
      lines.push('STOCK');
      lines.push('62');
      lines.push('7'); // White color
      lines.push('10'); // First corner
      lines.push(String(offsetX));
      lines.push('20');
      lines.push(String(offsetY));
      lines.push('11'); // Second corner
      lines.push(String(offsetX));
      lines.push('21');
      lines.push(String(offsetY + result.stockPanel.height));
      lines.push('12'); // Third corner
      lines.push(String(offsetX + result.stockPanel.width));
      lines.push('22');
      lines.push(String(offsetY + result.stockPanel.height));
      lines.push('13'); // Fourth corner
      lines.push(String(offsetX + result.stockPanel.width));
      lines.push('23');
      lines.push(String(offsetY));
      
      // Stock panel outline - white color
      // Top line
      lines.push('0');
      lines.push('LINE');
      lines.push('8'); // Layer
      lines.push('STOCK');
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
      lines.push('STOCK');
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
      lines.push('STOCK');
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
      lines.push('STOCK');
      lines.push('10');
      lines.push(String(offsetX));
      lines.push('20');
      lines.push(String(offsetY + result.stockPanel.height));
      lines.push('11');
      lines.push(String(offsetX));
      lines.push('21');
      lines.push(String(offsetY));
      
      // Draw each panel
      result.panels.forEach(panel => {
        const panelX = offsetX + panel.x;
        const panelY = offsetY + panel.y;
        
        // Simple diagonal lines - one direction only
        const hatchSpacing = 20; // 사선 간격 (mm)
        
        // Draw parallel diagonal lines from bottom-left to top-right
        const numLines = Math.ceil((panel.width + panel.height) / hatchSpacing);
        
        for (let i = 0; i <= numLines; i++) {
          const offset = i * hatchSpacing;
          
          let x1, y1, x2, y2;
          
          // Start point
          if (offset <= panel.width) {
            x1 = panelX + offset;
            y1 = panelY;
          } else {
            x1 = panelX + panel.width;
            y1 = panelY + (offset - panel.width);
          }
          
          // End point
          if (offset <= panel.height) {
            x2 = panelX;
            y2 = panelY + offset;
          } else {
            x2 = panelX + (offset - panel.height);
            y2 = panelY + panel.height;
          }
          
          // Skip if line is completely outside panel
          if (x1 > panelX + panel.width || y1 > panelY + panel.height) continue;
          if (x2 > panelX + panel.width || y2 > panelY + panel.height) continue;
          
          // Draw the diagonal line
          lines.push('0');
          lines.push('LINE');
          lines.push('8');
          lines.push('PANEL_FILL');
          lines.push('62');
          lines.push('30'); // Orange color
          lines.push('10');
          lines.push(String(x1));
          lines.push('20');
          lines.push(String(y1));
          lines.push('11');
          lines.push(String(x2));
          lines.push('21');
          lines.push(String(y2));
        }
        
        // Also draw opposite diagonal lines for cross-hatch effect (optional)
        // Uncomment if you want cross-hatch pattern
        /*
        for (let i = 0; i < numLines; i++) {
          const offset = i * hatchSpacing;
          
          let x1, y1, x2, y2;
          
          // Lines from top-left to bottom-right
          if (offset <= panel.width) {
            x1 = panelX + offset;
            y1 = panelY + panel.height;
            const diag = Math.min(offset, panel.height);
            x2 = panelX + offset - diag;
            y2 = panelY + panel.height - diag;
          } else {
            const startOffset = offset - panel.width;
            if (startOffset >= panel.height) continue;
            x1 = panelX + panel.width;
            y1 = panelY + panel.height - startOffset;
            const diag = Math.min(panel.width, panel.height - startOffset);
            x2 = panelX + panel.width - diag;
            y2 = panelY + panel.height - startOffset - diag;
          }
          
          lines.push('0');
          lines.push('LINE');
          lines.push('8');
          lines.push('PANEL_FILL');
          lines.push('62');
          lines.push('30');
          lines.push('10');
          lines.push(String(x1));
          lines.push('20');
          lines.push(String(y1));
          lines.push('11');
          lines.push(String(x2));
          lines.push('21');
          lines.push(String(y2));
        }
        */
        
        // Panel outline - orange
        // Top
        lines.push('0');
        lines.push('LINE');
        lines.push('8');
        lines.push('PANEL_OUTLINE');
        lines.push('10');
        lines.push(String(panelX));
        lines.push('20');
        lines.push(String(panelY));
        lines.push('11');
        lines.push(String(panelX + panel.width));
        lines.push('21');
        lines.push(String(panelY));
        
        // Right
        lines.push('0');
        lines.push('LINE');
        lines.push('8');
        lines.push('PANEL_OUTLINE');
        lines.push('10');
        lines.push(String(panelX + panel.width));
        lines.push('20');
        lines.push(String(panelY));
        lines.push('11');
        lines.push(String(panelX + panel.width));
        lines.push('21');
        lines.push(String(panelY + panel.height));
        
        // Bottom
        lines.push('0');
        lines.push('LINE');
        lines.push('8');
        lines.push('PANEL_OUTLINE');
        lines.push('10');
        lines.push(String(panelX + panel.width));
        lines.push('20');
        lines.push(String(panelY + panel.height));
        lines.push('11');
        lines.push(String(panelX));
        lines.push('21');
        lines.push(String(panelY + panel.height));
        
        // Left
        lines.push('0');
        lines.push('LINE');
        lines.push('8');
        lines.push('PANEL_OUTLINE');
        lines.push('10');
        lines.push(String(panelX));
        lines.push('20');
        lines.push(String(panelY + panel.height));
        lines.push('11');
        lines.push(String(panelX));
        lines.push('21');
        lines.push(String(panelY));
        
        // Add text label - black color
        lines.push('0');
        lines.push('TEXT');
        lines.push('8');
        lines.push('0'); // Default layer (black)
        lines.push('62');
        lines.push('0'); // Black color explicitly
        lines.push('10');
        lines.push(String(panelX + panel.width / 2));
        lines.push('20');
        lines.push(String(panelY + panel.height / 2));
        lines.push('40');
        lines.push('20'); // Text height
        lines.push('1');
        lines.push(`${Math.round(panel.width)}x${Math.round(panel.height)}`);
      });
    });
    
    // End of entities
    lines.push('0');
    lines.push('ENDSEC');
    lines.push('0');
    lines.push('EOF');
    
    return lines.join('\r\n');
  }
}