import React from 'react';
import { useCNCStore } from '../store';
import { exportPanelsCsv, exportStockCsv } from '../../../utils/cutlist/export';
import { PDFExporter } from '../utils/pdfExporter';
import { DXFExporter } from '../utils/dxfExporter';
import { OptimizedResult } from '../types';
import { FileDown, Download, FileText } from 'lucide-react';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useProjectStore } from '@/store/core/projectStore';
import styles from './ExportBar.module.css';

interface ExportBarProps {
  optimizationResults: OptimizedResult[];
}

export default function ExportBar({ optimizationResults }: ExportBarProps){
  const { panels, stock } = useCNCStore();
  const placedModules = useFurnitureStore((state) => state.placedModules);
  const spaceInfo = useSpaceConfigStore((state) => state.spaceInfo);
  const basicInfo = useProjectStore((state) => state.basicInfo);
  
  const handleExportPanels = () => {
    if (panels.length === 0) {
      alert('No panels to export');
      return;
    }
    exportPanelsCsv(panels, 'project');
  };

  const handleExportStock = () => {
    if (stock.length === 0) {
      alert('No stock sheets to export');
      return;
    }
    exportStockCsv(stock, 'project');
  };

  const handleExportBoth = () => {
    if (panels.length === 0 || stock.length === 0) {
      alert('Please define both panels and stock sheets');
      return;
    }
    handleExportPanels();
    setTimeout(handleExportStock, 500);
  };

  const handleExportPDF = () => {
    if (optimizationResults.length === 0) {
      alert('최적화 결과가 없습니다. 먼저 최적화를 실행하세요.');
      return;
    }
    
    // Create filename with timestamp
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `cutting_layout_${timestamp}.pdf`;
    
    // Prepare furniture data for PDF
    const furnitureData = {
      projectName: basicInfo?.title || 'Project',
      spaceInfo: spaceInfo,
      placedModules: placedModules,
      panels: panels
    };
    
    // Export PDF with panel and furniture details
    PDFExporter.exportToPDF(optimizationResults, furnitureData, filename);
  };

  const handleExportDXF = () => {
    if (optimizationResults.length === 0) {
      alert('최적화 결과가 없습니다. 먼저 최적화를 실행하세요.');
      return;
    }
    
    const dxfContent = DXFExporter.exportToDXF(optimizationResults);
    const blob = new Blob([dxfContent], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date().toISOString().slice(0, 10);
    a.download = `cutting_layout_${timestamp}.dxf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <button 
        className={styles.exportButton}
        onClick={handleExportPanels}
        disabled={panels.length === 0}
        title="Export Panels as CSV"
      >
        <Download size={14} />
        Panels
      </button>
      
      <button 
        className={styles.exportButton}
        onClick={handleExportStock}
        disabled={stock.length === 0}
        title="Export Stock as CSV"
      >
        <Download size={14} />
        Stock
      </button>
      
      <button 
        className={styles.exportButton}
        onClick={handleExportDXF}
        disabled={optimizationResults.length === 0}
        title="Export as DXF (AutoCAD)"
      >
        <FileDown size={14} />
        DXF
      </button>
      
      <button 
        className={`${styles.exportButton} ${styles.pdf}`}
        onClick={handleExportPDF}
        disabled={optimizationResults.length === 0}
        title="Download PDF Report"
      >
        <FileText size={14} />
        PDF
      </button>
    </>
  );
}