import jsPDF from 'jspdf';
import { OptimizedResult, Panel } from '../types';

interface FurnitureData {
  projectName: string;
  spaceInfo: any;
  placedModules: any[];
  panels: Panel[];
}

export class PDFExporter {
  private pdf: jsPDF;
  private pageWidth: number;
  private pageHeight: number;
  private margin: number = 20;
  private panelDetails: Map<string, Panel> = new Map();
  private furnitureData: FurnitureData | undefined;
  
  constructor(panels?: Panel[]) {
    this.pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a3'
    });
    
    this.pageWidth = this.pdf.internal.pageSize.getWidth();
    this.pageHeight = this.pdf.internal.pageSize.getHeight();
    
    // Store panel details for reference
    if (panels) {
      panels.forEach(panel => {
        this.panelDetails.set(panel.id, panel);
      });
    }
  }
  
  private drawSheet(result: OptimizedResult, sheetNumber: number) {
    if (sheetNumber > 0) {
      this.pdf.addPage();
    }
    
    // Title
    this.pdf.setFontSize(16);
    this.pdf.text(`Cutting Layout - Sheet ${sheetNumber + 1}`, this.margin, this.margin);
    
    // Sheet info
    this.pdf.setFontSize(10);
    this.pdf.text(
      `Stock: ${result.stockPanel.width} x ${result.stockPanel.height} mm | ` +
      `Panels: ${result.panels.length} | ` +
      `Efficiency: ${result.efficiency.toFixed(1)}%`,
      this.margin,
      this.margin + 10
    );
    
    // Calculate scale to fit the sheet on the page
    const drawableWidth = this.pageWidth - (this.margin * 2);
    const drawableHeight = this.pageHeight - (this.margin * 2) - 20;
    
    const scaleX = drawableWidth / result.stockPanel.width;
    const scaleY = drawableHeight / result.stockPanel.height;
    const scale = Math.min(scaleX, scaleY, 0.2); // Max scale 0.2 for readability
    
    const offsetX = this.margin;
    const offsetY = this.margin + 20;
    
    // Draw stock panel outline
    this.pdf.setDrawColor(200, 200, 200);
    this.pdf.setLineWidth(0.5);
    this.pdf.rect(
      offsetX,
      offsetY,
      result.stockPanel.width * scale,
      result.stockPanel.height * scale
    );
    
    // Draw grid
    this.pdf.setDrawColor(240, 240, 240);
    this.pdf.setLineWidth(0.1);
    
    // Vertical grid lines (every 100mm)
    for (let x = 100; x < result.stockPanel.width; x += 100) {
      this.pdf.line(
        offsetX + (x * scale),
        offsetY,
        offsetX + (x * scale),
        offsetY + (result.stockPanel.height * scale)
      );
    }
    
    // Horizontal grid lines (every 100mm)
    for (let y = 100; y < result.stockPanel.height; y += 100) {
      this.pdf.line(
        offsetX,
        offsetY + (y * scale),
        offsetX + (result.stockPanel.width * scale),
        offsetY + (y * scale)
      );
    }
    
    // Material colors
    const materialColors: { [key: string]: [number, number, number] } = {
      'PB': [232, 245, 233],    // Light green
      'MDF': [255, 243, 224],   // Light orange
      'PLY': [227, 242, 253],   // Light blue
      'HPL': [243, 229, 245],   // Light purple
      'LPM': [252, 228, 236]    // Light pink
    };
    
    // Draw panels
    result.panels.forEach((panel, index) => {
      const x = offsetX + (panel.x * scale);
      const y = offsetY + (panel.y * scale);
      const width = panel.width * scale;
      const height = panel.height * scale;
      
      // Panel fill
      const color = materialColors[panel.material] || [243, 244, 246];
      this.pdf.setFillColor(color[0], color[1], color[2]);
      this.pdf.rect(x, y, width, height, 'F');
      
      // Panel border
      this.pdf.setDrawColor(100, 100, 100);
      this.pdf.setLineWidth(0.2);
      this.pdf.rect(x, y, width, height, 'S');
      
      // Panel info (if space allows)
      if (width > 15 && height > 10) {
        this.pdf.setFontSize(6);
        this.pdf.setTextColor(50, 50, 50);
        
        // Panel name (if available)
        if (panel.name) {
          const nameText = panel.name.length > 20 ? panel.name.substring(0, 17) + '...' : panel.name;
          const nameWidth = this.pdf.getTextWidth(nameText);
          this.pdf.text(
            nameText,
            x + (width - nameWidth) / 2,
            y + height / 2 - 2
          );
        }
        
        // Panel dimensions
        this.pdf.setFontSize(7);
        this.pdf.setTextColor(100, 100, 100);
        const dimText = `${Math.round(panel.width)} × ${Math.round(panel.height)}`;
        const dimWidth = this.pdf.getTextWidth(dimText);
        this.pdf.text(
          dimText,
          x + (width - dimWidth) / 2,
          y + height / 2 + (panel.name ? 2 : 0)
        );
        
        // Material label in corner
        if (width > 25) {
          this.pdf.setFontSize(5);
          this.pdf.setTextColor(150, 150, 150);
          this.pdf.text(panel.material, x + 2, y + height - 2);
        }
      }
    });
    
    // Draw dimensions
    this.pdf.setFontSize(9);
    this.pdf.setTextColor(100, 100, 100);
    
    // Width dimension
    this.pdf.text(
      `${result.stockPanel.width} mm`,
      offsetX + (result.stockPanel.width * scale) / 2 - 10,
      offsetY - 5
    );
    
    // Height dimension
    this.pdf.save();
    this.pdf.text(
      `${result.stockPanel.height} mm`,
      offsetX - 5,
      offsetY + (result.stockPanel.height * scale) / 2,
      { angle: 90 }
    );
    this.pdf.restore();
    
    // Statistics at bottom
    this.pdf.setFontSize(8);
    this.pdf.setTextColor(0, 0, 0);
    let statsY = offsetY + (result.stockPanel.height * scale) + 10;
    
    // Calculate areas if not provided
    const totalArea = result.stockPanel.width * result.stockPanel.height;
    const usedArea = result.panels.reduce((sum, p) => sum + (p.width * p.height), 0);
    const wasteArea = totalArea - usedArea;
    
    this.pdf.text(
      `Used Area: ${(usedArea / 1000000).toFixed(2)} m² | ` +
      `Waste Area: ${(wasteArea / 1000000).toFixed(2)} m²`,
      offsetX,
      statsY
    );
    
    // Add panel list for this sheet
    statsY += 10;
    this.pdf.setFontSize(10);
    this.pdf.setTextColor(0, 0, 0);
    this.pdf.text('Panels in this sheet:', offsetX, statsY);
    
    statsY += 7;
    this.pdf.setFontSize(8);
    
    // Create panel summary with quantities
    const panelSummary = new Map<string, {count: number, width: number, height: number, material: string}>();
    result.panels.forEach(panel => {
      const key = `${panel.name || panel.id}_${panel.width}_${panel.height}_${panel.material}`;
      if (!panelSummary.has(key)) {
        panelSummary.set(key, {
          count: 0,
          width: panel.width,
          height: panel.height,
          material: panel.material
        });
      }
      panelSummary.get(key)!.count++;
    });
    
    // Draw panel list table
    const tableStartY = statsY;
    const colWidths = [8, 60, 25, 25, 20]; // No, Name, Width, Height, Material
    const headers = ['#', 'Panel Name', 'Width', 'Height', 'Material'];
    
    // Draw table header
    this.pdf.setFillColor(240, 240, 240);
    this.pdf.rect(offsetX, tableStartY - 4, colWidths.reduce((a, b) => a + b, 0), 7, 'F');
    
    this.pdf.setFontSize(8);
    this.pdf.setTextColor(0, 0, 0);
    let xPos = offsetX;
    headers.forEach((header, i) => {
      this.pdf.text(header, xPos + 2, tableStartY);
      xPos += colWidths[i];
    });
    
    statsY = tableStartY + 8;
    
    // Draw panel rows
    let rowIndex = 1;
    Array.from(panelSummary.entries()).forEach(([key, data]) => {
      // Check if we need to wrap to next column or page
      if (statsY > this.pageHeight - 30) {
        // Continue in next column or page if needed
        return;
      }
      
      const panelName = key.split('_')[0];
      
      xPos = offsetX;
      const rowData = [
        data.count.toString(),
        panelName.length > 25 ? panelName.substring(0, 22) + '...' : panelName,
        Math.round(data.width).toString(),
        Math.round(data.height).toString(),
        data.material
      ];
      
      // Alternate row background
      if (rowIndex % 2 === 0) {
        this.pdf.setFillColor(250, 250, 250);
        this.pdf.rect(offsetX, statsY - 4, colWidths.reduce((a, b) => a + b, 0), 6, 'F');
      }
      
      this.pdf.setTextColor(0, 0, 0);
      rowData.forEach((text, i) => {
        this.pdf.text(text, xPos + 2, statsY);
        xPos += colWidths[i];
      });
      
      statsY += 6;
      rowIndex++;
    });
  }
  
  private addPanelDetailsPage(results: OptimizedResult[]) {
    this.pdf.addPage();
    
    // Title
    this.pdf.setFontSize(16);
    this.pdf.setTextColor(0, 0, 0);
    this.pdf.text('Panel Details Summary', this.margin, this.margin);
    
    // Collect all unique panels
    const panelMap = new Map<string, {panel: Panel, totalQty: number, sheets: number[]}>();
    
    results.forEach((result, sheetIndex) => {
      result.panels.forEach(panel => {
        const key = `${panel.id}_${panel.width}_${panel.height}`;
        if (!panelMap.has(key)) {
          panelMap.set(key, {
            panel: panel,
            totalQty: 0,
            sheets: []
          });
        }
        const data = panelMap.get(key)!;
        data.totalQty += 1;
        if (!data.sheets.includes(sheetIndex + 1)) {
          data.sheets.push(sheetIndex + 1);
        }
      });
    });
    
    // Table headers
    let yPos = this.margin + 15;
    this.pdf.setFontSize(10);
    this.pdf.setTextColor(0, 0, 0);
    
    // Draw table header
    const colWidths = [60, 30, 30, 25, 20, 40];
    const headers = ['Furniture/Panel Name', 'Width (mm)', 'Height (mm)', 'Material', 'Qty', 'Sheet(s)'];
    
    // Header background
    this.pdf.setFillColor(240, 240, 240);
    this.pdf.rect(this.margin, yPos - 5, colWidths.reduce((a, b) => a + b, 0), 8, 'F');
    
    // Header text
    this.pdf.setFontSize(9);
    this.pdf.setTextColor(0, 0, 0);
    let xPos = this.margin;
    headers.forEach((header, i) => {
      this.pdf.text(header, xPos + 2, yPos);
      xPos += colWidths[i];
    });
    
    yPos += 10;
    
    // Draw table rows
    this.pdf.setFontSize(8);
    Array.from(panelMap.values())
      .sort((a, b) => a.panel.name.localeCompare(b.panel.name))
      .forEach((data, index) => {
        // Check if we need a new page
        if (yPos > this.pageHeight - 30) {
          this.pdf.addPage();
          yPos = this.margin;
          
          // Redraw header on new page
          this.pdf.setFillColor(240, 240, 240);
          this.pdf.rect(this.margin, yPos - 5, colWidths.reduce((a, b) => a + b, 0), 8, 'F');
          
          this.pdf.setFontSize(9);
          this.pdf.setTextColor(0, 0, 0);
          xPos = this.margin;
          headers.forEach((header, i) => {
            this.pdf.text(header, xPos + 2, yPos);
            xPos += colWidths[i];
          });
          yPos += 10;
          this.pdf.setFontSize(8);
        }
        
        // Alternate row background
        if (index % 2 === 0) {
          this.pdf.setFillColor(250, 250, 250);
          this.pdf.rect(this.margin, yPos - 4, colWidths.reduce((a, b) => a + b, 0), 7, 'F');
        }
        
        // Row data
        xPos = this.margin;
        const rowData = [
          data.panel.name || `Panel ${data.panel.id}`,
          data.panel.width.toString(),
          data.panel.height.toString(),
          data.panel.material,
          data.totalQty.toString(),
          data.sheets.join(', ')
        ];
        
        this.pdf.setTextColor(0, 0, 0);
        rowData.forEach((text, i) => {
          // Truncate long text
          let displayText = text;
          if (i === 0 && text.length > 30) {
            displayText = text.substring(0, 27) + '...';
          }
          this.pdf.text(displayText, xPos + 2, yPos);
          xPos += colWidths[i];
        });
        
        yPos += 7;
      });
    
    // Summary statistics
    yPos += 10;
    if (yPos > this.pageHeight - 40) {
      this.pdf.addPage();
      yPos = this.margin;
    }
    
    this.pdf.setFontSize(10);
    this.pdf.setTextColor(0, 0, 0);
    this.pdf.text('Summary', this.margin, yPos);
    
    yPos += 7;
    this.pdf.setFontSize(9);
    const totalPanels = Array.from(panelMap.values()).reduce((sum, data) => sum + data.totalQty, 0);
    const totalSheets = results.length;
    const avgEfficiency = results.reduce((sum, r) => sum + r.efficiency, 0) / results.length;
    
    this.pdf.text(`Total Panels: ${totalPanels}`, this.margin, yPos);
    yPos += 6;
    this.pdf.text(`Total Sheets: ${totalSheets}`, this.margin, yPos);
    yPos += 6;
    this.pdf.text(`Average Efficiency: ${avgEfficiency.toFixed(1)}%`, this.margin, yPos);
  }

  public addSheets(results: OptimizedResult[]) {
    // Add panel details page first
    this.addPanelDetailsPage(results);
    
    // Then add cutting layout sheets
    results.forEach((result, index) => {
      this.drawSheet(result, index);
    });
  }
  
  public save(filename: string = 'cutting_layout.pdf') {
    this.pdf.save(filename);
  }
  
  public static exportToPDF(results: OptimizedResult[], panels?: Panel[], filename?: string) {
    const exporter = new PDFExporter(panels);
    exporter.addSheets(results);
    exporter.save(filename);
  }
}