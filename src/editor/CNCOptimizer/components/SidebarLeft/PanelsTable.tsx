import React, { useEffect, useRef } from 'react';
import { useCNCStore } from '../../store';
import type { Panel } from '../../../../types/cutlist';
import { Package, Plus, Trash2 } from 'lucide-react';
import styles from './SidebarLeft.module.css';

export default function PanelsTable(){
  const { panels, setPanels, selectedPanelId, setSelectedPanelId } = useCNCStore();
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const selectedRowRef = useRef<HTMLTableRowElement>(null);

  // Auto-scroll to selected panel
  useEffect(() => {
    if (selectedPanelId && selectedRowRef.current && tableContainerRef.current) {
      const container = tableContainerRef.current;
      const row = selectedRowRef.current;
      
      // Check if row is out of view
      const rowTop = row.offsetTop;
      const rowBottom = rowTop + row.offsetHeight;
      const containerTop = container.scrollTop;
      const containerBottom = containerTop + container.clientHeight;
      
      if (rowTop < containerTop || rowBottom > containerBottom) {
        // Scroll the row into view
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [selectedPanelId]);

  const onChange = (i:number, key: keyof Panel, val:any) => {
    const next = panels.map((panel, index) => {
      if (index === i) {
        let updatedPanel = {
          ...panel,
          [key]: key==='quantity' || key==='width' || key==='length' || key==='thickness' ? Number(val) : val
        };
        
        // width나 length가 변경되면 긴 쪽이 length가 되도록 자동 조정
        if (key === 'width' || key === 'length') {
          const newWidth = key === 'width' ? Number(val) : updatedPanel.width;
          const newLength = key === 'length' ? Number(val) : updatedPanel.length;
          
          // 가로가 더 길면 값을 바꿔서 세로가 더 길게
          if (newWidth > newLength) {
            updatedPanel.width = newLength;
            updatedPanel.length = newWidth;
          }
        }
        
        return updatedPanel;
      }
      return panel;
    });
    setPanels(next);
  };

  const addRow = () => {
    const newPanel: Panel = {
      id: String(Date.now()),
      label: `Panel_${panels.length + 1}`,
      width: 600,  // 짧은 쪽 (W)
      length: 800, // 긴 쪽 (L) - 항상 더 큰 값
      thickness: 18,
      quantity: 1,
      material: 'PB',
      grain: 'V'  // 세로 결방향 (긴 방향이 결방향)
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
      
      <div className={styles.tableContainer} ref={tableContainerRef}>
        {panels.length === 0 ? (
          <div className={styles.empty}>
            패널이 없습니다. "추가" 버튼을 클릭하여 생성하세요.
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>이름</th>
                <th>치수 (L×W)</th>
                <th>두께</th>
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
                  ref={selectedPanelId === p.id ? selectedRowRef : null}
                  className={`panel-clickable ${selectedPanelId === p.id ? styles.selected : ''}`}
                  onClick={() => selectPanel(p.id)}
                >
                  <td>
                    <input 
                      value={p.label} 
                      onChange={e => onChange(i, 'label', e.target.value)}
                      onClick={e => e.stopPropagation()}
                      className={styles.input}
                      title={p.label}  // 툴팁으로 전체 이름 표시
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
                      value={p.thickness} 
                      onChange={e => onChange(i, 'thickness', e.target.value)}
                      onClick={e => e.stopPropagation()}
                      className={styles.inputTiny}
                    />
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
                    <button
                      className={styles.grainToggle}
                      onClick={(e) => {
                        e.stopPropagation();
                        // 현재 값이 V면 H로, 그 외에는 V로 토글
                        const newGrain = p.grain === 'V' ? 'H' : 'V';
                        onChange(i, 'grain', newGrain);
                      }}
                      title={p.grain === 'V' ? '세로 결방향 (클릭하여 가로로 변경)' : '가로 결방향 (클릭하여 세로로 변경)'}
                    >
                      {p.grain === 'V' ? '↑' : '→'}
                    </button>
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