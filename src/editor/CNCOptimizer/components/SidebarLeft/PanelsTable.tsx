import React from 'react';
import { useCNCStore } from '../../store';
import type { Panel } from '../../../../types/cutlist';
import { Package, Plus, Trash2 } from 'lucide-react';
import styles from './SidebarLeft.module.css';

export default function PanelsTable(){
  const { panels, setPanels, selectedPanelId, setSelectedPanelId } = useCNCStore();

  const onChange = (i:number, key: keyof Panel, val:any) => {
    const next = panels.slice();
    // @ts-ignore
    next[i][key] = key==='quantity' || key==='width' || key==='length' || key==='thickness' ? Number(val) : val;
    setPanels(next);
  };

  const addRow = () => {
    const newPanel: Panel = {
      id: String(Date.now()),
      label: `Panel_${panels.length + 1}`,
      width: 600,
      length: 800,
      thickness: 18,
      quantity: 1,
      material: 'PB',
      grain: 'NONE'
    };
    setPanels([...panels, newPanel]);
  };

  const delRow = (i:number) => { 
    const next = panels.slice(); 
    next.splice(i,1); 
    setPanels(next); 
  };

  const selectPanel = (id: string) => {
    setSelectedPanelId(selectedPanelId === id ? null : id);
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <Package size={16} />
        <h3>패널 목록 ({panels.length})</h3>
        <button className={styles.addButton} onClick={addRow}>
          <Plus size={14} />
          추가
        </button>
      </div>
      
      <div className={styles.tableContainer}>
        {panels.length === 0 ? (
          <div className={styles.empty}>
            패널이 없습니다. "추가" 버튼을 클릭하여 생성하세요.
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>이름</th>
                <th>길이×폭</th>
                <th>수량</th>
                <th>재질</th>
                <th>결방향</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {panels.map((p, i) => (
                <tr 
                  key={p.id} 
                  className={selectedPanelId === p.id ? styles.selected : ''}
                  onClick={() => selectPanel(p.id)}
                >
                  <td>
                    <input 
                      value={p.label} 
                      onChange={e => onChange(i, 'label', e.target.value)}
                      onClick={e => e.stopPropagation()}
                      className={styles.input}
                    />
                  </td>
                  <td>
                    <div className={styles.dimensions}>
                      <input 
                        type="number"
                        value={p.length} 
                        onChange={e => onChange(i, 'length', e.target.value)}
                        onClick={e => e.stopPropagation()}
                        className={styles.inputSmall}
                      />
                      ×
                      <input 
                        type="number"
                        value={p.width} 
                        onChange={e => onChange(i, 'width', e.target.value)}
                        onClick={e => e.stopPropagation()}
                        className={styles.inputSmall}
                      />
                    </div>
                  </td>
                  <td>
                    <input 
                      type="number"
                      value={p.quantity} 
                      onChange={e => onChange(i, 'quantity', e.target.value)}
                      onClick={e => e.stopPropagation()}
                      className={styles.inputTiny}
                    />
                  </td>
                  <td>
                    <select 
                      value={p.material} 
                      onChange={e => onChange(i, 'material', e.target.value)}
                      onClick={e => e.stopPropagation()}
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
                    <select 
                      value={p.grain || 'NONE'} 
                      onChange={e => onChange(i, 'grain', e.target.value)}
                      onClick={e => e.stopPropagation()}
                      className={styles.select}
                    >
                      <option value="NONE">-</option>
                      <option value="H">H</option>
                      <option value="V">V</option>
                    </select>
                  </td>
                  <td>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        delRow(i);
                      }}
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