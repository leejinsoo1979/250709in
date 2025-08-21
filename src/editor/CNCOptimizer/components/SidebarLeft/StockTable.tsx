import React, { useRef } from 'react';
import { useCNCStore } from '../../store';
import type { StockSheet } from '../../../../types/cutlist';
import { Layers, Plus, Trash2, Upload } from 'lucide-react';
import { useTranslation } from '@/i18n/useTranslation';
import styles from './SidebarLeft.module.css';
import { showToast } from '@/utils/cutlist/csv';

export default function StockTable(){
  const { t } = useTranslation();
  const { stock, setStock, settings } = useCNCStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onChange = (i:number, key: keyof StockSheet, val:any) => {
    const next = stock.slice();
    // @ts-ignore
    next[i][key] = key==='quantity' || key==='width' || key==='length' || key==='thickness' ? Number(val) : val;
    setStock(next);
  };

  const addRow = () => {
    const newStock: StockSheet = {
      label: `Stock_${stock.length + 1}`,
      width: 1220,
      length: 2440,
      thickness: 18,
      quantity: 10,
      material: 'PB'
    };
    setStock([...stock, newStock]);
  };

  const delRow = (i:number) => { 
    const next = stock.slice(); 
    next.splice(i,1); 
    setStock(next); 
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());
        
        if (lines.length < 2) {
          showToast(t('cnc.csvNoData'), 'error', t('common.confirm'));
          return;
        }

        const newStock: StockSheet[] = [];
        
        // Skip header row and parse data
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim());
          
          if (values.length >= 5) {
            newStock.push({
              label: values[0] || `Stock_${i}`,
              length: parseInt(values[1]) || 2440,
              width: parseInt(values[2]) || 1220,
              thickness: parseInt(values[3]) || 18,
              quantity: parseInt(values[4]) || 10,
              material: values[5] || 'PB'
            });
          }
        }

        if (newStock.length > 0) {
          setStock([...stock, ...newStock]);
          showToast(t('cnc.stockAddSuccess', { count: newStock.length }), 'success', t('common.confirm'));
        }
      } catch (error) {
        showToast(t('cnc.csvReadError'), 'error', t('common.confirm'));
      }
    };
    
    reader.readAsText(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <Layers size={16} />
        <h3>{t('cnc.stock')} ({stock.length})</h3>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleCSVUpload}
          style={{ display: 'none' }}
        />
        <button 
          className={styles.addButton} 
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={14} />
          CSV
        </button>
        <button className={styles.addButton} onClick={addRow}>
          <Plus size={14} />
          {t('common.add')}
        </button>
      </div>
      
      <div className={styles.stockTableContainer}>
        {stock.length === 0 ? (
          <div className={styles.empty}>
            {t('cnc.noStockMessage')}
          </div>
        ) : (
          <table className={`${styles.table} ${styles.stockTable}`}>
            <thead>
              <tr>
                <th style={{ width: '28%', textAlign: 'center' }}>{t('cnc.name')}</th>
                <th style={{ width: '22%', textAlign: 'center' }}>{t('cnc.dimensions')}</th>
                <th style={{ width: '8%', textAlign: 'center', paddingLeft: '18px' }}>{t('cnc.thickness')}</th>
                <th style={{ width: '8%', textAlign: 'center', paddingLeft: '20px' }}>{t('cnc.quantity')}</th>
                <th style={{ width: '21%', textAlign: 'center' }}>{t('cnc.material')}</th>
                <th style={{ width: '7%', textAlign: 'center' }}></th>
              </tr>
            </thead>
            <tbody>
              {stock.map((s, i) => (
                <tr key={i}>
                  <td>
                    <input 
                      value={s.label || ''} 
                      onChange={e => onChange(i, 'label', e.target.value)}
                      className={styles.input}
                      placeholder={t('cnc.stockNamePlaceholder')}
                    />
                  </td>
                  <td>
                    <div className={styles.dimensions}>
                      <input 
                        type="number"
                        value={s.length} 
                        onChange={e => {
                          const val = Number(e.target.value);
                          const maxLength = 2440 - (settings.trimTop || 0) - (settings.trimBottom || 0);
                          if (val <= maxLength) {
                            onChange(i, 'length', e.target.value);
                          }
                        }}
                        className={styles.inputSmall}
                        max={2440 - (settings.trimTop || 0) - (settings.trimBottom || 0)}
                        title={t('cnc.maxValue', { value: 2440 - (settings.trimTop || 0) - (settings.trimBottom || 0) })}
                      />
                      ×
                      <input 
                        type="number"
                        value={s.width} 
                        onChange={e => {
                          const val = Number(e.target.value);
                          const maxWidth = 1220 - (settings.trimLeft || 0) - (settings.trimRight || 0);
                          if (val <= maxWidth) {
                            onChange(i, 'width', e.target.value);
                          }
                        }}
                        className={styles.inputSmall}
                        max={1220 - (settings.trimLeft || 0) - (settings.trimRight || 0)}
                        title={t('cnc.maxValue', { value: 1220 - (settings.trimLeft || 0) - (settings.trimRight || 0) })}
                      />
                    </div>
                  </td>
                  <td>
                    <input 
                      type="number"
                      value={s.thickness || 18} 
                      onChange={e => onChange(i, 'thickness', e.target.value)}
                      className={styles.inputTiny}
                      placeholder="18"
                    />
                  </td>
                  <td style={{ paddingLeft: '15px' }}>
                    <input 
                      type="number"
                      value={s.quantity} 
                      onChange={e => onChange(i, 'quantity', e.target.value)}
                      className={styles.inputTiny}
                    />
                  </td>
                  <td style={{ paddingLeft: '20px', paddingRight: '4px' }}>
                    <select 
                      value={s.material || 'PB'} 
                      onChange={e => onChange(i, 'material', e.target.value)}
                      className={styles.select}
                    >
                      <option value="PB">PB</option>
                      <option value="MDF">MDF</option>
                      <option value="PET">PET</option>
                      <option value="PLY">PLY</option>
                      <option value="HPL">HPL</option>
                      <option value="LPM">LPM</option>
                    </select>
                  </td>
                  <td style={{ padding: '6px 6px 6px 0', textAlign: 'center' }}>
                    <button 
                      onClick={() => delRow(i)}
                      className={styles.deleteButton}
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}