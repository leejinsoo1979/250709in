import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Upload, RotateCcw, Edit2, Trash2 } from 'lucide-react';
import { Panel, StockPanel } from '../types';
import styles from './LeftSidebar.module.css';

interface LeftSidebarProps {
  panels: Panel[];
  stockPanels: StockPanel[];
  settings: {
    kerf: number;
    labelsOnPanels: boolean;
    singleSheetOnly: boolean;
    considerMaterial: boolean;
    edgeBanding: boolean;
    considerGrain: boolean;
  };
  onPanelAdd: () => void;
  onStockAdd: () => void;
  onStockUpdate: (id: string, updates: Partial<StockPanel>) => void;
  onStockDelete: (id: string) => void;
  onSettingsChange: (updates: Partial<typeof settings>) => void;
  onImportCSV: () => void;
}

const LeftSidebar: React.FC<LeftSidebarProps> = ({
  panels,
  stockPanels,
  settings,
  onPanelAdd,
  onStockAdd,
  onStockUpdate,
  onStockDelete,
  onSettingsChange,
  onImportCSV
}) => {
  const [expandedSections, setExpandedSections] = useState({
    panels: true,
    stock: true,
    options: true
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  return (
    <div className={styles.sidebar}>
      {/* Panels Section */}
      <div className={styles.section}>
        <div 
          className={styles.sectionHeader}
          onClick={() => toggleSection('panels')}
        >
          {expandedSections.panels ? <ChevronDown /> : <ChevronRight />}
          <h3>Panels</h3>
          <div className={styles.actions}>
            <button 
              className={styles.actionButton}
              onClick={(e) => {
                e.stopPropagation();
                onPanelAdd();
              }}
              title="Add Row"
            >
              <Plus />
            </button>
            <button 
              className={styles.actionButton}
              onClick={(e) => {
                e.stopPropagation();
                onImportCSV();
              }}
              title="Import CSV"
            >
              <Upload />
            </button>
          </div>
        </div>
        
        {expandedSections.panels && (
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Length</th>
                  <th>Width</th>
                  <th>Qty</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {panels.map((panel) => (
                  <tr key={panel.id}>
                    <td>{panel.height}</td>
                    <td>{panel.width}</td>
                    <td>{panel.quantity}</td>
                    <td className={styles.rowActions}>
                      <button className={styles.rowAction} title="Duplicate">
                        <Edit2 />
                      </button>
                      <button className={styles.rowAction} title="Delete">
                        <Trash2 />
                      </button>
                    </td>
                  </tr>
                ))}
                {panels.length === 0 && (
                  <tr>
                    <td colSpan={4} className={styles.empty}>
                      No panels (add from Configurator)
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Stock Sheets Section */}
      <div className={styles.section}>
        <div 
          className={styles.sectionHeader}
          onClick={() => toggleSection('stock')}
        >
          {expandedSections.stock ? <ChevronDown /> : <ChevronRight />}
          <h3>Stock sheets</h3>
          <div className={styles.actions}>
            <button 
              className={styles.actionButton}
              onClick={(e) => {
                e.stopPropagation();
                onStockAdd();
              }}
              title="Add Row"
            >
              <Plus />
            </button>
            <button 
              className={styles.actionButton}
              onClick={(e) => {
                e.stopPropagation();
                onImportCSV();
              }}
              title="Import CSV"
            >
              <Upload />
            </button>
          </div>
        </div>
        
        {expandedSections.stock && (
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Length</th>
                  <th>Width</th>
                  <th>Qty</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {stockPanels.map((stock) => (
                  <tr key={stock.id}>
                    <td>
                      <input 
                        type="number" 
                        value={stock.height} 
                        onChange={(e) => onStockUpdate(stock.id, { height: Number(e.target.value) })}
                        className={styles.input}
                      />
                    </td>
                    <td>
                      <input 
                        type="number" 
                        value={stock.width} 
                        onChange={(e) => onStockUpdate(stock.id, { width: Number(e.target.value) })}
                        className={styles.input}
                      />
                    </td>
                    <td>
                      <input 
                        type="number" 
                        value={stock.stock} 
                        onChange={(e) => onStockUpdate(stock.id, { stock: Number(e.target.value) })}
                        className={styles.input}
                      />
                    </td>
                    <td className={styles.rowActions}>
                      <button 
                        className={styles.rowAction} 
                        onClick={() => onStockDelete(stock.id)}
                        title="Delete"
                      >
                        <Trash2 />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Options Section */}
      <div className={styles.section}>
        <div 
          className={styles.sectionHeader}
          onClick={() => toggleSection('options')}
        >
          {expandedSections.options ? <ChevronDown /> : <ChevronRight />}
          <h3>Options</h3>
        </div>
        
        {expandedSections.options && (
          <div className={styles.options}>
            <div className={styles.optionGroup}>
              <label>
                <span>Kerf (mm)</span>
                <input 
                  type="number" 
                  value={settings.kerf} 
                  onChange={(e) => onSettingsChange({ kerf: Number(e.target.value) })}
                  className={styles.input}
                />
              </label>
            </div>
            
            <div className={styles.optionGroup}>
              <label className={styles.toggle}>
                <input 
                  type="checkbox" 
                  checked={settings.labelsOnPanels}
                  onChange={(e) => onSettingsChange({ labelsOnPanels: e.target.checked })}
                />
                <span>Labels on panels</span>
              </label>
            </div>
            
            <div className={styles.optionGroup}>
              <label className={styles.toggle}>
                <input 
                  type="checkbox" 
                  checked={settings.singleSheetOnly}
                  onChange={(e) => onSettingsChange({ singleSheetOnly: e.target.checked })}
                />
                <span>Use only one sheet from stock</span>
              </label>
            </div>
            
            <div className={styles.optionGroup}>
              <label className={styles.toggle}>
                <input 
                  type="checkbox" 
                  checked={settings.considerMaterial}
                  onChange={(e) => onSettingsChange({ considerMaterial: e.target.checked })}
                />
                <span>Consider material</span>
              </label>
            </div>
            
            <div className={styles.optionGroup}>
              <label className={styles.toggle}>
                <input 
                  type="checkbox" 
                  checked={settings.edgeBanding}
                  onChange={(e) => onSettingsChange({ edgeBanding: e.target.checked })}
                />
                <span>Edge banding</span>
              </label>
            </div>
            
            <div className={styles.optionGroup}>
              <label className={styles.toggle}>
                <input 
                  type="checkbox" 
                  checked={settings.considerGrain}
                  onChange={(e) => onSettingsChange({ considerGrain: e.target.checked })}
                />
                <span>Consider grain direction</span>
              </label>
            </div>
            
            <div className={styles.resetLink}>
              <button 
                className={styles.link}
                onClick={() => onSettingsChange({
                  kerf: 3,
                  labelsOnPanels: true,
                  singleSheetOnly: false,
                  considerMaterial: true,
                  edgeBanding: false,
                  considerGrain: true
                })}
              >
                <RotateCcw />
                Reset to defaults
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LeftSidebar;