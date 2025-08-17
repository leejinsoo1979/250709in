import React, { useEffect, useRef } from 'react';
import { useCNCStore } from '../../store';
import type { Panel } from '../../../../types/cutlist';
import { Package, Plus, Trash2, Upload } from 'lucide-react';
import styles from './SidebarLeft.module.css';

export default function PanelsTable(){
  const { panels, setPanels, selectedPanelId, setSelectedPanelId } = useCNCStore();
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const selectedRowRef = useRef<HTMLTableRowElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // 마우스 휠 스크롤 이벤트 추가
  useEffect(() => {
    const container = tableContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // 컨테이너가 스크롤 가능한 경우에만 기본 동작 방지
      const hasVerticalScroll = container.scrollHeight > container.clientHeight;
      
      if (hasVerticalScroll) {
        // 이미 맨 위나 맨 아래에 있을 때 페이지 스크롤 방지
        const isAtTop = container.scrollTop === 0 && e.deltaY < 0;
        const isAtBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 1 && e.deltaY > 0;
        
        if (!isAtTop && !isAtBottom) {
          e.preventDefault();
          e.stopPropagation();
        }
        
        // 부드러운 스크롤
        const scrollSpeed = 0.8; // 스크롤 속도 조절 (더 부드럽게)
        container.scrollTop += e.deltaY * scrollSpeed;
      }
    };

    // passive: false로 설정하여 preventDefault가 작동하도록 함
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, []);

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

  // CSV 파일 업로드 처리
  const handleCSVUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      parseCSV(text);
    };
    reader.readAsText(file);
    
    // 같은 파일을 다시 선택할 수 있도록 리셋
    event.target.value = '';
  };

  // CSV 파싱 함수
  const parseCSV = (csvText: string) => {
    try {
      const lines = csvText.split('\n').filter(line => line.trim());
      
      // 첫 줄은 헤더로 가정
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      
      // 필요한 컬럼 인덱스 찾기
      const nameIndex = headers.findIndex(h => h.includes('이름') || h.includes('name') || h.includes('label') || h.includes('품명'));
      const widthIndex = headers.findIndex(h => h.includes('가로') || h.includes('width') || h === 'w');
      const lengthIndex = headers.findIndex(h => h.includes('세로') || h.includes('length') || h.includes('높이') || h === 'l');
      const thicknessIndex = headers.findIndex(h => h.includes('두께') || h.includes('thickness') || h === 't');
      const quantityIndex = headers.findIndex(h => h.includes('수량') || h.includes('quantity') || h.includes('qty'));
      const materialIndex = headers.findIndex(h => h.includes('재질') || h.includes('material') || h.includes('재료'));
      const grainIndex = headers.findIndex(h => h.includes('결') || h.includes('grain') || h.includes('방향'));

      const newPanels: Panel[] = [];
      
      // 데이터 라인 파싱
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // CSV 값 파싱 (콤마 내부의 따옴표 처리)
        const values = line.match(/(".*?"|[^,]+)/g)?.map(v => v.replace(/^"(.*)"$/, '$1').trim()) || [];
        
        if (values.length < 2) continue; // 최소한 가로, 세로는 있어야 함
        
        // 가로, 세로 값 추출
        let width = parseFloat(values[widthIndex] || '600') || 600;
        let length = parseFloat(values[lengthIndex] || '800') || 800;
        
        // 항상 length가 더 크도록 조정
        if (width > length) {
          [width, length] = [length, width];
        }
        
        const panel: Panel = {
          id: `csv_${Date.now()}_${i}`,
          label: values[nameIndex] || `Panel_${i}`,
          width: width,
          length: length,
          thickness: parseFloat(values[thicknessIndex] || '18') || 18,
          quantity: parseInt(values[quantityIndex] || '1') || 1,
          material: values[materialIndex]?.toUpperCase() || 'PB',
          grain: values[grainIndex]?.toUpperCase() === 'H' ? 'H' : 'V'
        };
        
        // 재질 검증
        const validMaterials = ['PB', 'MDF', 'PET', 'PLY', 'HPL', 'LPM'];
        if (!validMaterials.includes(panel.material)) {
          panel.material = 'PB';
        }
        
        newPanels.push(panel);
      }
      
      if (newPanels.length > 0) {
        // 기존 패널에 추가할지 대체할지 확인
        const shouldReplace = panels.length === 0 || 
          confirm(`기존 패널 ${panels.length}개가 있습니다. 대체하시겠습니까?\n\n'확인': CSV 파일로 대체\n'취소': 기존 패널에 추가`);
        
        if (shouldReplace) {
          setPanels(newPanels);
          alert(`${newPanels.length}개의 패널을 CSV 파일에서 가져왔습니다.`);
        } else {
          setPanels([...panels, ...newPanels]);
          alert(`${newPanels.length}개의 패널을 추가했습니다.`);
        }
      } else {
        alert('CSV 파일에서 유효한 패널 데이터를 찾을 수 없습니다.');
      }
    } catch (error) {
      alert('CSV 파일을 읽는 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <Package size={16} />
        <h3>패널 목록 ({panels.length})</h3>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button 
            className={styles.addButton} 
            onClick={() => fileInputRef.current?.click()}
            title="CSV 파일 업로드"
          >
            <Upload size={14} />
            CSV
          </button>
          <button className={styles.addButton} onClick={addRow}>
            <Plus size={14} />
            추가
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleCSVUpload}
          style={{ display: 'none' }}
        />
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
                      <option value="PET">PET</option>
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
                        
                        // 결방향이 변경되면 width와 length를 바꿈
                        const currentWidth = p.width;
                        const currentLength = p.length;
                        
                        // 패널을 업데이트
                        const next = panels.map((panel, index) => {
                          if (index === i) {
                            return {
                              ...panel,
                              grain: newGrain,
                              width: currentLength, // width와 length를 바꿈
                              length: currentWidth
                            };
                          }
                          return panel;
                        });
                        setPanels(next);
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