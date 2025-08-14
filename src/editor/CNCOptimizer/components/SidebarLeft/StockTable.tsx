import React from 'react';
import { useCNCStore } from '../../store';
import type { StockSheet } from '../../../../types/cutlist';
import { Layers, Plus, Trash2 } from 'lucide-react';
import styles from './SidebarLeft.module.css';

export default function StockTable(){
  const { stock, setStock } = useCNCStore();

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

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <Layers size={16} />
        <h3>원자재 ({stock.length})</h3>
        <button className={styles.addButton} onClick={addRow}>
          <Plus size={14} />
          추가
        </button>
      </div>
      
      <div className={styles.tableContainer}>
        {stock.length === 0 ? (
          <div className={styles.empty}>
            원자재가 없습니다. "추가" 버튼을 클릭하여 생성하세요.
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>이름</th>
                <th>길이×폭</th>
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