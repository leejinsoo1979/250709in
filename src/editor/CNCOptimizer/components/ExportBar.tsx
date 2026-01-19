import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useCNCStore } from '../store';
import { exportPanelsCsv, exportStockCsv } from '../../../utils/cutlist/export';
import { PDFExporter } from '../utils/pdfExporter';
import { DXFExporter } from '../utils/dxfExporter';
import { SimpleDXFExporter } from '../utils/simpleDxfExporter';
import {
  downloadBoringCoordinatesCSV,
  SidePanelBoringInfo
} from '../utils/csvExporter';
import { OptimizedResult, PlacedPanel } from '../types';
import { Download, FileText, FileDown, Package, Layers, ChevronDown, Circle } from 'lucide-react';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useProjectStore } from '@/store/core/projectStore';
import styles from './ExportBar.module.css';

interface ExportBarProps {
  optimizationResults: OptimizedResult[];
  shelfBoringPositions?: Record<string, number[]>; // 가구별 보링 위치 (moduleKey -> positions)
}

export default function ExportBar({ optimizationResults }: ExportBarProps){
  const { panels, stock } = useCNCStore();
  const placedModules = useFurnitureStore((state) => state.placedModules);
  const spaceInfo = useSpaceConfigStore((state) => state.spaceInfo);
  const basicInfo = useProjectStore((state) => state.basicInfo);
  
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  const handleExportPanels = () => {
    if (panels.length === 0) {
      alert('내보낼 패널이 없습니다.');
      return;
    }
    exportPanelsCsv(panels, 'project');
    setIsOpen(false);
  };

  const handleExportStock = () => {
    if (stock.length === 0) {
      alert('내보낼 원자재가 없습니다.');
      return;
    }
    exportStockCsv(stock, 'project');
    setIsOpen(false);
  };

  const handleExportPDF = async () => {
    if (optimizationResults.length === 0) {
      alert('최적화 결과가 없습니다. 먼저 최적화를 실행하세요.');
      return;
    }
    
    const panelsArray = Array.isArray(panels) ? panels : [];
    
    const furnitureData = {
      projectName: basicInfo?.title || 'Project',
      spaceInfo: spaceInfo,
      placedModules: placedModules,
      panels: panelsArray,
      needsConfiguratorView: true
    };
    
    // ZIP 파일로 내보내기 (전체 PDF + 개별 시트 PDF들)
    await PDFExporter.exportToZIP(optimizationResults, furnitureData);
    setIsOpen(false);
  };

  const handleExportDXF = () => {
    if (optimizationResults.length === 0) {
      alert('최적화 결과가 없습니다. 먼저 최적화를 실행하세요.');
      return;
    }
    
    const dxfContent = SimpleDXFExporter.exportToDXF(optimizationResults);
    
    const blob = new Blob([dxfContent], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date().toISOString().slice(0, 10);
    a.download = `cutting_layout_${timestamp}.dxf`;
    a.click();
    URL.revokeObjectURL(url);
    setIsOpen(false);
  };

  const hasData = panels.length > 0 || stock.length > 0 || optimizationResults.length > 0;

  return (
    <div className={styles.exportDropdown} ref={dropdownRef}>
      <button 
        className={styles.exportMainButton}
        onClick={() => setIsOpen(!isOpen)}
        disabled={!hasData}
      >
        <Download size={16} />
        <span>Export</span>
        <ChevronDown size={14} className={`${styles.chevron} ${isOpen ? styles.open : ''}`} />
      </button>
      
      {isOpen && (
        <div className={styles.dropdownMenu}>
          <div className={styles.menuHeader}>내보내기 형식 선택</div>
          
          <button 
            className={styles.menuItem}
            onClick={handleExportPanels}
            disabled={panels.length === 0}
          >
            <Package size={16} />
            <div className={styles.menuItemContent}>
              <span className={styles.menuItemTitle}>패널 목록 (CSV)</span>
              <span className={styles.menuItemDesc}>패널 치수 및 수량 데이터</span>
            </div>
          </button>
          
          <button 
            className={styles.menuItem}
            onClick={handleExportStock}
            disabled={stock.length === 0}
          >
            <Layers size={16} />
            <div className={styles.menuItemContent}>
              <span className={styles.menuItemTitle}>원자재 목록 (CSV)</span>
              <span className={styles.menuItemDesc}>원자재 규격 및 수량</span>
            </div>
          </button>
          
          <div className={styles.menuDivider} />
          
          <button 
            className={styles.menuItem}
            onClick={handleExportDXF}
            disabled={optimizationResults.length === 0}
          >
            <FileDown size={16} />
            <div className={styles.menuItemContent}>
              <span className={styles.menuItemTitle}>CAD 도면 (DXF)</span>
              <span className={styles.menuItemDesc}>AutoCAD 호환 컷팅 레이아웃</span>
            </div>
          </button>
          
          <button 
            className={`${styles.menuItem} ${styles.recommended}`}
            onClick={handleExportPDF}
            disabled={optimizationResults.length === 0}
          >
            <FileText size={16} />
            <div className={styles.menuItemContent}>
              <span className={styles.menuItemTitle}>종합 리포트 (ZIP)</span>
              <span className={styles.menuItemDesc}>전체 PDF + 개별 시트 PDF + CSV + 요약</span>
            </div>
            <span className={styles.badge}>추천</span>
          </button>
        </div>
      )}
    </div>
  );
}