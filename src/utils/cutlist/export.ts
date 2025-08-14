/**
 * CutList export functions
 */

import { NormalizedPanel } from './normalize';
import { toCsv, downloadCsv, showToast } from './csv';
import type { Panel, StockSheet } from '../../types/cutlist';

/**
 * Export panels to CSV for CutList Optimizer (works with Panel type)
 */
export function exportPanelsCsv(panels: Panel[], projectName: string = 'project'): void {
  if (!panels || panels.length === 0) {
    showToast('No panels to export', 'error');
    return;
  }
  
  // Headers for CutList Optimizer
  const headers = ['Label', 'Qty', 'Width', 'Length', 'Thickness', 'Material', 'Grain'];
  
  // Convert panels to rows
  const rows = panels.map(panel => [
    panel.label,
    panel.quantity,
    panel.width,
    panel.length,
    panel.thickness,
    panel.material || '',
    panel.grain === 'NONE' ? '' : panel.grain // Empty for NONE
  ]);
  
  // Generate CSV
  const csv = toCsv(headers, rows);
  
  // Download with timestamp
  const timestamp = new Date().toISOString().split('T')[0];
  downloadCsv(csv, `${projectName}_panels_${timestamp}.csv`);
  showToast(`Exported ${panels.length} panels`, 'success');
}

/**
 * Export normalized panels to CSV for CutList Optimizer
 * Format: Label, Qty, Width, Length, Thickness, Material, Grain
 */
export function exportNormalizedPanelsCsv(panels: NormalizedPanel[], filename: string = 'panels_cutlist.csv'): void {
  if (!panels || panels.length === 0) {
    showToast('No panels to export', 'error');
    return;
  }
  
  // Headers for CutList Optimizer
  const headers = ['Label', 'Qty', 'Width', 'Length', 'Thickness', 'Material', 'Grain'];
  
  // Convert panels to rows
  const rows = panels.map(panel => [
    panel.label,
    panel.quantity,
    panel.width,
    panel.length,
    panel.thickness,
    panel.material,
    panel.grain === 'NONE' ? '' : panel.grain // Empty for NONE
  ]);
  
  // Generate CSV
  const csv = toCsv(headers, rows);
  
  // Download
  downloadCsv(csv, filename);
  showToast(`Exported ${panels.length} panels`, 'success');
}

/**
 * Export stock sheets to CSV for CutList Optimizer
 * Format: Label, Qty, Width, Length, Thickness, Material
 */
export function exportStockCsv(stock: StockSheet[], projectName: string = 'project'): void {
  if (!stock || stock.length === 0) {
    showToast('No stock sheets to export', 'error');
    return;
  }
  
  // Headers for CutList Optimizer
  const headers = ['Label', 'Qty', 'Width', 'Length', 'Thickness', 'Material'];
  
  // Convert stock to rows
  const rows = stock.map(sheet => [
    sheet.label || `${sheet.material}_Stock`,
    sheet.quantity || 999, // Default to unlimited
    sheet.width,
    sheet.length,
    sheet.thickness || 18,
    sheet.material || ''
  ]);
  
  // Generate CSV
  const csv = toCsv(headers, rows);
  
  // Download with timestamp
  const timestamp = new Date().toISOString().split('T')[0];
  downloadCsv(csv, `${projectName}_stock_${timestamp}.csv`);
  showToast(`Exported ${stock.length} stock sheets`, 'success');
}

/**
 * Export both panels and stock
 */
export function exportCutList(
  panels: NormalizedPanel[], 
  stock: StockSheet[],
  projectName: string = 'project'
): void {
  // Export panels
  exportPanelsCsv(panels, `${projectName}_panels.csv`);
  
  // Export stock after a small delay to avoid browser blocking multiple downloads
  setTimeout(() => {
    exportStockCsv(stock, `${projectName}_stock.csv`);
  }, 500);
}