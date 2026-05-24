import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useCNCStore } from '../store';
import { exportPanelsCsv, exportStockCsv } from '../../../utils/cutlist/export';
import { PDFExporter } from '../utils/pdfExporter';
import { SimpleDXFExporter } from '../utils/simpleDxfExporter';
import {
  exportBoringToCSV
} from '../utils/csvExporter';
import {
  exportToMPR,
  exportToCIX,
  encodeMPRContent,
  encodeMPRZipFileName,
} from '@/domain/boring/exporters';
import JSZip from 'jszip';
import { OptimizedResult, PlacedPanel, Panel } from '../types';
import { Download, FileText, FileDown, Package, Layers, ChevronDown, Circle, Cpu } from 'lucide-react';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useProjectStore } from '@/store/core/projectStore';
import { convertPlacedPanelToMprBoringData } from '../utils/mprPanelConversion';
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

  // 보링이 있는 패널 수 계산 (패널에 직접 boringPositions가 포함됨)
  const panelsWithBoring = useMemo(() => {
    const allPanels: PlacedPanel[] = [];
    optimizationResults.forEach(result => {
      result.panels.forEach(panel => {
        if ((panel.boringPositions && panel.boringPositions.length > 0) ||
            (panel.sideBoringPositions && panel.sideBoringPositions.length > 0)) {
          allPanels.push(panel);
        }
      });
    });
    return allPanels;
  }, [optimizationResults]);

  const optimizedPanels = useMemo(() => {
    const allPanels: PlacedPanel[] = [];
    optimizationResults.forEach(result => {
      result.panels.forEach(panel => allPanels.push(panel));
    });
    return allPanels;
  }, [optimizationResults]);
  
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

  // 보링 좌표 CSV 내보내기
  const handleExportBoringCSV = () => {
    if (panelsWithBoring.length === 0) {
      alert('내보낼 보링 데이터가 없습니다. 측판이 있는 가구를 배치하세요.');
      return;
    }

    // 최적화 결과에서 모든 패널 추출
    const allPanels: Panel[] = [];
    optimizationResults.forEach(result => {
      result.panels.forEach(panel => {
        allPanels.push(panel);
      });
    });

    const boringCSV = exportBoringToCSV(allPanels, spaceInfo.panelThickness ?? 18);
    const timestamp = new Date().toISOString().slice(0, 10);
    const projectName = basicInfo?.title || 'project';

    // BOM 추가하여 한글 인코딩 지원
    const blob = new Blob(['\uFEFF' + boringCSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName}_boring_${timestamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setIsOpen(false);
  };

  // imos MPR 내보내기
  const handleExportMPR = async () => {
    // 모든 패널 수집 (보링 유무와 무관하게 재단 데이터 필요)
    if (optimizedPanels.length === 0) {
      alert('내보낼 패널 데이터가 없습니다.');
      return;
    }

    const panelBoringData = optimizedPanels.map(convertPlacedPanelToMprBoringData);
    const projectName = basicInfo?.title || 'project';
    const timestamp = new Date().toISOString().slice(0, 10);

    // exportToMPR로 imos MPR 콘텐츠 생성
    const result = exportToMPR(panelBoringData, undefined, projectName);

    if (!result.success || result.files.length === 0) {
      alert('MPR 파일 생성에 실패했습니다: ' + (result.error || '보링 데이터 없음'));
      return;
    }

    // 패널별 개별 MPR 파일을 ZIP으로 묶어서 다운로드
    const zip = new JSZip();
    result.files.forEach(file => {
      zip.file(file.filename, encodeMPRContent(file.content), { binary: true });
    });

    const blob = await zip.generateAsync({
      type: 'blob',
      encodeFileName: encodeMPRZipFileName,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName}_mpr_${timestamp}.zip`;
    a.click();
    URL.revokeObjectURL(url);

    setIsOpen(false);
  };

  // Biesse CIX 내보내기
  const handleExportCIX = async () => {
    if (optimizedPanels.length === 0) {
      alert('내보낼 패널 데이터가 없습니다.');
      return;
    }

    const panelBoringData = optimizedPanels.map(convertPlacedPanelToMprBoringData);
    const projectName = basicInfo?.title || 'project';
    const timestamp = new Date().toISOString().slice(0, 10);

    // exportToCIX로 CIX 콘텐츠 생성
    const result = exportToCIX(panelBoringData);

    if (!result.success || result.files.length === 0) {
      alert('CIX 파일 생성에 실패했습니다: ' + (result.error || '보링 데이터 없음'));
      return;
    }

    // 패널별 개별 CIX 파일을 ZIP으로 묶어서 다운로드
    const zip = new JSZip();
    result.files.forEach(file => {
      zip.file(file.filename, file.content);
    });

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName}_cix_${timestamp}.zip`;
    a.click();
    URL.revokeObjectURL(url);

    setIsOpen(false);
  };

  const hasData = panels.length > 0 || stock.length > 0 || optimizationResults.length > 0;
  const hasBoringData = panelsWithBoring.length > 0;
  const hasOptimizedPanelData = optimizedPanels.length > 0;

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

          <button
            className={styles.menuItem}
            onClick={handleExportBoringCSV}
            disabled={!hasBoringData}
          >
            <Circle size={16} />
            <div className={styles.menuItemContent}>
              <span className={styles.menuItemTitle}>보링 좌표 (CSV)</span>
              <span className={styles.menuItemDesc}>측판 선반핀 보링 X, Y, 직경, 깊이</span>
            </div>
          </button>

          <div className={styles.menuDivider} />

          <div className={styles.menuHeader}>CNC 제조사별 내보내기</div>

          <button
            className={styles.menuItem}
            onClick={handleExportMPR}
            disabled={!hasOptimizedPanelData}
          >
            <Cpu size={16} />
            <div className={styles.menuItemContent}>
              <span className={styles.menuItemTitle}>HOMAG (MPR)</span>
              <span className={styles.menuItemDesc}>woodWOP 네이티브 형식</span>
            </div>
          </button>

          <button
            className={styles.menuItem}
            onClick={handleExportCIX}
            disabled={!hasOptimizedPanelData}
          >
            <Cpu size={16} />
            <div className={styles.menuItemContent}>
              <span className={styles.menuItemTitle}>Biesse (CIX)</span>
              <span className={styles.menuItemDesc}>bSolid XML 형식</span>
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
