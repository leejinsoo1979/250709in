import { OptimizedResult } from '../types';

export class SimpleDXFExporter {
  
  public static exportToDXF(results: OptimizedResult[]): string {
    const lines: string[] = [];
    
    // Minimal DXF header for maximum compatibility
    lines.push('0');
    lines.push('SECTION');
    lines.push('2');
    lines.push('ENTITIES');
    
    // Process each sheet
    results.forEach((result, sheetIndex) => {
      const offsetY = sheetIndex * (result.stockPanel.height + 200);
      
      // Stock panel outline - using simple LINE entities
      // Top line
      lines.push('0');
      lines.push('LINE');
      lines.push('10');
      lines.push('0');
      lines.push('20');
      lines.push(String(offsetY));
      lines.push('11');
      lines.push(String(result.stockPanel.width));
      lines.push('21');
      lines.push(String(offsetY));
      
      // Right line
      lines.push('0');
      lines.push('LINE');
      lines.push('10');
      lines.push(String(result.stockPanel.width));
      lines.push('20');
      lines.push(String(offsetY));
      lines.push('11');
      lines.push(String(result.stockPanel.width));
      lines.push('21');
      lines.push(String(offsetY + result.stockPanel.height));
      
      // Bottom line
      lines.push('0');
      lines.push('LINE');
      lines.push('10');
      lines.push(String(result.stockPanel.width));
      lines.push('20');
      lines.push(String(offsetY + result.stockPanel.height));
      lines.push('11');
      lines.push('0');
      lines.push('21');
      lines.push(String(offsetY + result.stockPanel.height));
      
      // Left line
      lines.push('0');
      lines.push('LINE');
      lines.push('10');
      lines.push('0');
      lines.push('20');
      lines.push(String(offsetY + result.stockPanel.height));
      lines.push('11');
      lines.push('0');
      lines.push('21');
      lines.push(String(offsetY));
      
      // Draw each panel
      result.panels.forEach(panel => {
        const panelY = offsetY + panel.y;
        
        // Panel outline
        // Top
        lines.push('0');
        lines.push('LINE');
        lines.push('10');
        lines.push(String(panel.x));
        lines.push('20');
        lines.push(String(panelY));
        lines.push('11');
        lines.push(String(panel.x + panel.width));
        lines.push('21');
        lines.push(String(panelY));
        
        // Right
        lines.push('0');
        lines.push('LINE');
        lines.push('10');
        lines.push(String(panel.x + panel.width));
        lines.push('20');
        lines.push(String(panelY));
        lines.push('11');
        lines.push(String(panel.x + panel.width));
        lines.push('21');
        lines.push(String(panelY + panel.height));
        
        // Bottom
        lines.push('0');
        lines.push('LINE');
        lines.push('10');
        lines.push(String(panel.x + panel.width));
        lines.push('20');
        lines.push(String(panelY + panel.height));
        lines.push('11');
        lines.push(String(panel.x));
        lines.push('21');
        lines.push(String(panelY + panel.height));
        
        // Left
        lines.push('0');
        lines.push('LINE');
        lines.push('10');
        lines.push(String(panel.x));
        lines.push('20');
        lines.push(String(panelY + panel.height));
        lines.push('11');
        lines.push(String(panel.x));
        lines.push('21');
        lines.push(String(panelY));
        
        // Add text label
        lines.push('0');
        lines.push('TEXT');
        lines.push('10');
        lines.push(String(panel.x + panel.width / 2));
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