import React, { useRef } from 'react';
import { useCNCStore } from '../../store';
import type { StockSheet } from '../../../../types/cutlist';
import { Layers, Plus, Trash2, Upload } from 'lucide-react';
import styles from './SidebarLeft.module.css';
import { showToast } from '@/utils/cutlist/csv';

export default function StockTable(){
  const { stock, setStock } = useCNCStore();
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
          showToast('CSV 파일에 데이터가 없습니다', 'error');
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
          showToast(`${newStock.length}개의 원자재를 추가했습니다`, 'success');
        }
      } catch (error) {
        showToast('CSV 파일 읽기 실패', 'error');
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
        <h3>원자재 ({stock.length})</h3>
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
          추가
        </button>
      </div>
      
      <div className={styles.stockTableContainer}>
        {stock.length === 0 ? (
          <div className={styles.empty}>
            원자재가 없습니다. "추가" 버튼을 클릭하여 생성하세요.
          </div>
        ) : (
          <table className={`${styles.table} ${styles.stockTable}`}>
            <thead>
              <tr>
                <th>이름</th>
                <th>치수 (L×W)</th>
                <th>수량</th>
                <th>재질</th>
                <th></th>
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
                      placeholder="원자재 이름"
                    />
                  </td>
                  <td>
                    <div className={styles.dimensions}>
                      <input 
                        type="number"
                        value={s.length} 
                        onChange={e => onChange(i, 'length', e.target.value)}
                        className={styles.inputSmall}
                      />
                      ×
                      <input 
                        type="number"
                        value={s.width} 
                        onChange={e => onChange(i, 'width', e.target.value)}
                        className={styles.inputSmall}
                      />
                    </div>
                  </td>
                  <td>
                    <input 
                      type="number"
                      value={s.quantity} 
                      onChange={e => onChange(i, 'quantity', e.target.value)}
                      className={styles.inputTiny}
                    />
                  </td>
                  <td>
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
                  <td>
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