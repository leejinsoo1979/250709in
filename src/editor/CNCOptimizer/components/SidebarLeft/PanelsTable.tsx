import React, { useEffect, useRef, useState } from 'react';
import { useCNCStore } from '../../store';
import type { Panel } from '../../../../types/cutlist';
import { Package, Plus, Trash2, Upload } from 'lucide-react';
import { useTranslation } from '@/i18n/useTranslation';
import styles from './SidebarLeft.module.css';

export default function PanelsTable(){
  const { t } = useTranslation();
  const { panels, setPanels, selectedPanelId, setSelectedPanelId, setUserHasModifiedPanels, settings } = useCNCStore();
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const selectedRowRef = useRef<HTMLTableRowElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newlyAddedPanelId, setNewlyAddedPanelId] = useState<string | null>(null);

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

  // Auto-focus on name input when a new panel is added
  useEffect(() => {
    if (newlyAddedPanelId) {
      // Small delay to ensure the DOM is updated
      setTimeout(() => {
        // Scroll to the new panel
        const newRow = document.querySelector(`tr[data-panel-id="${newlyAddedPanelId}"]`) as HTMLElement;
        if (newRow) {
          newRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        
        // Focus on the name input
        const nameInput = document.querySelector(`input[data-panel-id="${newlyAddedPanelId}"][data-field="label"]`) as HTMLInputElement;
        if (nameInput) {
          nameInput.focus();
          nameInput.select();
        }
        setNewlyAddedPanelId(null);
      }, 100);
    }
  }, [newlyAddedPanelId]);

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
        
        // 자동 조정 로직 제거 - 사용자가 입력한 값 그대로 유지
        // 필요한 경우 onBlur 이벤트에서 처리하도록 변경
        
        return updatedPanel;
      }
      return panel;
    });
    setPanels(next, true); // Mark as user modified
    setUserHasModifiedPanels(true);
  };

  // 입력 완료 시 가로/세로 검증 (선택적으로 사용)
  const onBlurDimension = (i: number) => {
    const panel = panels[i];
    if (panel && panel.width > 0 && panel.length > 0 && panel.width > panel.length) {
      // 사용자에게 알림 (선택사항)
      // console.log('참고: 일반적으로 세로(L)가 가로(W)보다 큽니다.');
      // 자동 조정을 원한다면 아래 코드 활성화
      /*
      const next = panels.map((p, index) => {
        if (index === i) {
          return {
            ...p,
            width: panel.length,
            length: panel.width
          };
        }
        return p;
      });
      setPanels(next, true);
      */
    }
  };

  const addRow = () => {
    const newPanel: Panel = {
      id: String(Date.now()),
      label: '',  // 빈 이름
      width: 0,   // 빈 가로
      length: 0,  // 빈 세로
      thickness: 18,  // 기본 두께만 설정
      quantity: 1,    // 기본 수량 1
      material: 'PB', // 기본 재질
      grain: 'V'      // 기본 결방향
    };
    setPanels([...panels, newPanel], true); // Mark as user modified
    setUserHasModifiedPanels(true);
    // 새로 추가된 패널을 자동으로 선택하여 편집하기 쉽게 함
    setSelectedPanelId(newPanel.id);
    setNewlyAddedPanelId(newPanel.id);
  };

  const delRow = (i:number) => { 
    const next = panels.slice(); 
    next.splice(i,1); 
    setPanels(next, true); // Mark as user modified
    setUserHasModifiedPanels(true);
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
          confirm(t('cnc.csvReplaceConfirm', { count: panels.length }));
        
        if (shouldReplace) {
          setPanels(newPanels, true); // Mark as user modified
          setUserHasModifiedPanels(true);
          alert(t('cnc.csvImportSuccess', { count: newPanels.length }));
        } else {
          setPanels([...panels, ...newPanels], true); // Mark as user modified
          setUserHasModifiedPanels(true);
          alert(t('cnc.csvAddSuccess', { count: newPanels.length }));
        }
      } else {
        alert(t('cnc.csvNoValidData'));
      }
    } catch (error) {
      alert(t('cnc.csvReadError'));
    }
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <Package size={16} />
        <h3>{t('cnc.panelList')} ({panels.length})</h3>
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
            {t('common.add')}
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
            {t('cnc.noPanelsMessage')}
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: '28%', textAlign: 'center' }}>{t('cnc.name')}</th>
                <th style={{ width: '20%', textAlign: 'center' }}>{t('cnc.dimensions')}</th>
                <th style={{ width: '8%', textAlign: 'center', paddingLeft: '18px' }}>{t('cnc.thickness')}</th>
                <th style={{ width: '8%', textAlign: 'center', paddingLeft: '20px' }}>{t('cnc.quantity')}</th>
                <th style={{ width: '21%', textAlign: 'center' }}>{t('cnc.material')}</th>
                <th style={{ width: '8%', textAlign: 'center', paddingRight: '3px' }}>{t('cnc.grain')}</th>
                <th style={{ width: '7%', textAlign: 'center' }}></th>
              </tr>
            </thead>
            <tbody>
              {panels.map((p, i) => {
                const isNewPanel = p.label === '' && p.width === 0 && p.length === 0;
                return (
                <tr 
                  key={p.id} 
                  ref={selectedPanelId === p.id ? selectedRowRef : null}
                  className={`panel-clickable ${selectedPanelId === p.id ? styles.selected : ''} ${isNewPanel ? styles.newPanel : ''}`}
                  onClick={() => selectPanel(p.id)}
                  data-panel-id={p.id}
                >
                  <td>
                    <input 
                      value={p.label} 
                      onChange={e => onChange(i, 'label', e.target.value)}
                      onClick={e => e.stopPropagation()}
                      className={styles.input}
                      title={p.label}  // 툴팁으로 전체 이름 표시
                      data-panel-id={p.id}
                      data-field="label"
                      placeholder={t('cnc.panelNamePlaceholder')}
                    />
                  </td>
                  <td>
                    <div className={styles.dimensions}>
                      <input 
                        type="number"
                        value={p.length === 0 ? '' : p.length} 
                        onChange={e => {
                          const val = Number(e.target.value);
                          const maxLength = 2440 - (settings.trimTop || 0) - (settings.trimBottom || 0);
                          if (val <= maxLength) {
                            onChange(i, 'length', e.target.value);
                          }
                        }}
                        onClick={e => e.stopPropagation()}
                        className={styles.inputSmall}
                        placeholder={t('cnc.lengthPlaceholder')}
                        max={2440 - (settings.trimTop || 0) - (settings.trimBottom || 0)}
                        title={`최대 ${2440 - (settings.trimTop || 0) - (settings.trimBottom || 0)}mm`}
                      />
                      ×
                      <input 
                        type="number"
                        value={p.width === 0 ? '' : p.width} 
                        onChange={e => {
                          const val = Number(e.target.value);
                          const maxWidth = 1220 - (settings.trimLeft || 0) - (settings.trimRight || 0);
                          if (val <= maxWidth) {
                            onChange(i, 'width', e.target.value);
                          }
                        }}
                        onClick={e => e.stopPropagation()}
                        className={styles.inputSmall}
                        placeholder={t('cnc.widthPlaceholder')}
                        max={1220 - (settings.trimLeft || 0) - (settings.trimRight || 0)}
                        title={`최대 ${1220 - (settings.trimLeft || 0) - (settings.trimRight || 0)}mm`}
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
                  <td style={{ paddingLeft: '15px' }}>
                    <input 
                      type="number"
                      value={p.quantity} 
                      onChange={e => onChange(i, 'quantity', e.target.value)}
                      onClick={e => e.stopPropagation()}
                      className={styles.inputTiny}
                    />
                  </td>
                  <td style={{ paddingLeft: '20px', paddingRight: '2px' }}>
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
                  <td style={{ paddingLeft: '2px' }}>
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
                        setPanels(next, true); // Mark as user modified
                        setUserHasModifiedPanels(true);
                      }}
                      title={p.grain === 'V' ? t('cnc.grainVerticalTooltip') : t('cnc.grainHorizontalTooltip')}
                    >
                      {p.grain === 'V' ? '↑' : '→'}
                    </button>
                  </td>
                  <td style={{ padding: '6px 6px 6px 0', textAlign: 'center' }}>
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
              );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}