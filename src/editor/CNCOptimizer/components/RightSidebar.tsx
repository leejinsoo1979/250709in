import React from 'react';
import { ChevronLeft, ChevronRight, Package, TrendingUp, Scissors } from 'lucide-react';
import { OptimizedResult } from '../types';
import styles from './RightSidebar.module.css';

interface RightSidebarProps {
  optimizationResults: OptimizedResult[];
  currentSheetIndex: number;
  onSheetIndexChange: (index: number) => void;
}

const RightSidebar: React.FC<RightSidebarProps> = ({
  optimizationResults,
  currentSheetIndex,
  onSheetIndexChange
}) => {
  const currentSheet = optimizationResults[currentSheetIndex];
  const totalSheets = optimizationResults.length;

  // Calculate global statistics
  const globalStats = React.useMemo(() => {
    if (optimizationResults.length === 0) {
      return {
        usedSheets: 0,
        totalArea: 0,
        usedArea: 0,
        wastedArea: 0,
        usedPercent: 0,
        wastedPercent: 0,
        totalCuts: 0,
        cutLength: 0,
        kerf: 3,
        priority: 'Area'
      };
    }

    const totalArea = optimizationResults.reduce((sum, result) => 
      sum + (result.stockPanel.width * result.stockPanel.height), 0
    );
    const usedArea = optimizationResults.reduce((sum, result) => 
      sum + result.panels.reduce((panelSum, panel) => 
        panelSum + (panel.width * panel.height), 0
      ), 0
    );
    const wastedArea = totalArea - usedArea;

    // Approximate cuts calculation
    const totalCuts = optimizationResults.reduce((sum, result) => 
      sum + result.panels.length * 2, 0 // Rough estimate: 2 cuts per panel
    );
    
    const cutLength = totalCuts * 1000; // Rough estimate

    return {
      usedSheets: optimizationResults.length,
      totalArea,
      usedArea,
      wastedArea,
      usedPercent: totalArea > 0 ? (usedArea / totalArea) * 100 : 0,
      wastedPercent: totalArea > 0 ? (wastedArea / totalArea) * 100 : 0,
      totalCuts,
      cutLength,
      kerf: 3,
      priority: 'Area'
    };
  }, [optimizationResults]);

  // Calculate sheet statistics
  const sheetStats = React.useMemo(() => {
    if (!currentSheet) {
      return {
        usedArea: 0,
        wastedArea: 0,
        usedPercent: 0,
        wastedPercent: 0,
        cuts: 0,
        cutLength: 0,
        panels: 0,
        wastedPanels: 0
      };
    }

    const totalArea = currentSheet.stockPanel.width * currentSheet.stockPanel.height;
    const usedArea = currentSheet.panels.reduce((sum, panel) => 
      sum + (panel.width * panel.height), 0
    );
    const wastedArea = totalArea - usedArea;

    return {
      usedArea,
      wastedArea,
      usedPercent: totalArea > 0 ? (usedArea / totalArea) * 100 : 0,
      wastedPercent: totalArea > 0 ? (wastedArea / totalArea) * 100 : 0,
      cuts: currentSheet.panels.length * 2, // Rough estimate
      cutLength: currentSheet.panels.length * 1000, // Rough estimate
      panels: currentSheet.panels.length,
      wastedPanels: 0
    };
  }, [currentSheet]);

  // Generate cuts list
  const cutsList = React.useMemo(() => {
    if (!currentSheet) return [];
    
    return currentSheet.panels.map((panel, index) => ({
      id: index + 1,
      panel: panel.name || `Panel ${index + 1}`,
      cut: `${panel.width} x ${panel.height}`,
      result: panel.rotated ? 'Rotated' : 'Normal'
    }));
  }, [currentSheet]);

  return (
    <div className={styles.sidebar}>
      {/* Global Statistics */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <TrendingUp className={styles.icon} />
          <h3>Global statistics</h3>
        </div>
        <div className={styles.statsGrid}>
          <div className={styles.statItem}>
            <span className={styles.label}>Used sheets</span>
            <span className={styles.value}>{globalStats.usedSheets}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.label}>Used area</span>
            <span className={styles.value}>{globalStats.usedPercent.toFixed(1)}%</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.label}>Wasted area</span>
            <span className={styles.value}>{globalStats.wastedPercent.toFixed(1)}%</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.label}>Total cuts</span>
            <span className={styles.value}>{globalStats.totalCuts}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.label}>Cut length</span>
            <span className={styles.value}>{(globalStats.cutLength / 1000).toFixed(1)}m</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.label}>Kerf</span>
            <span className={styles.value}>{globalStats.kerf}mm</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.label}>Priority</span>
            <span className={styles.value}>{globalStats.priority}</span>
          </div>
        </div>
      </div>

      {/* Sheet Statistics */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <Package className={styles.icon} />
          <h3>Sheet statistics</h3>
          {totalSheets > 0 && (
            <div className={styles.pager}>
              <button 
                onClick={() => onSheetIndexChange(Math.max(0, currentSheetIndex - 1))}
                disabled={currentSheetIndex === 0}
                className={styles.pagerButton}
              >
                <ChevronLeft />
              </button>
              <span className={styles.pagerText}>
                {currentSheetIndex + 1} / {totalSheets}
              </span>
              <button 
                onClick={() => onSheetIndexChange(Math.min(totalSheets - 1, currentSheetIndex + 1))}
                disabled={currentSheetIndex === totalSheets - 1}
                className={styles.pagerButton}
              >
                <ChevronRight />
              </button>
            </div>
          )}
        </div>
        <div className={styles.statsGrid}>
          <div className={styles.statItem}>
            <span className={styles.label}>Used area</span>
            <span className={styles.value}>{sheetStats.usedPercent.toFixed(1)}%</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.label}>Wasted area</span>
            <span className={styles.value}>{sheetStats.wastedPercent.toFixed(1)}%</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.label}>Cuts</span>
            <span className={styles.value}>{sheetStats.cuts}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.label}>Cut length</span>
            <span className={styles.value}>{(sheetStats.cutLength / 1000).toFixed(1)}m</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.label}>Panels</span>
            <span className={styles.value}>{sheetStats.panels}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.label}>Wasted panels</span>
            <span className={styles.value}>{sheetStats.wastedPanels}</span>
          </div>
        </div>
      </div>

      {/* Cuts List */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <Scissors className={styles.icon} />
          <h3>Cuts</h3>
        </div>
        <div className={styles.cutsTable}>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Panel</th>
                <th>Cut</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {cutsList.map((cut) => (
                <tr key={cut.id}>
                  <td>{cut.id}</td>
                  <td className={styles.panelName}>{cut.panel}</td>
                  <td>{cut.cut}</td>
                  <td className={styles.result}>{cut.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default RightSidebar;