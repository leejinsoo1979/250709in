import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useCNCStore } from '../../store';
import type { Panel } from '../../../../types/cutlist';
import { Package, Plus, Upload } from 'lucide-react';
import { useTranslation } from '@/i18n/useTranslation';
import { useLivePanelData } from '../../hooks/useLivePanelData';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import styles from './SidebarLeft.module.css';

/**
 * 패널 이름에서 가구번호 추출: "[N]..." → N, 없으면 0
 */
function extractFurnitureNumber(label: string): number {
  const m = label.match(/^\[(\d+)\]/);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * 섹션 우선순위: 하부(하) → 상부(상) → 기타
 */
function sectionPriority(label: string): number {
  if (label.includes('(하)')) return 0;
  if (label.includes('(상)')) return 1;
  return 0; // 분리되지 않은 패널은 하부와 같은 순서
}

/**
 * 패널 유형 우선순위 (낮을수록 먼저)
 * 본체 → 서랍 → 상하부프레임 → 서라운드 → 도어
 */
function panelTypePriority(label: string, material?: string): number {
  const name = label.toLowerCase();
  // 하단 분리: 상부프레임 → 좌우서라운드/커튼박스 → 하부프레임 → 기타서라운드 → 도어(맨 마지막)
  if (name.includes('도어') || name.includes('door')) return 99;
  if ((name.includes('상부프레임') || name.includes('상부 프레임') || name.includes('상부프래임')) && material === 'PET') return 90;
  // 좌서라운드 측면판 → 전면판 → 우서라운드 측면판 → 전면판
  if (name.includes('좌측') && (name.includes('서라운드') || name.includes('커튼박스')) && name.includes('측면판')) return 91;
  if (name.includes('좌측') && (name.includes('서라운드') || name.includes('커튼박스')) && name.includes('전면판')) return 91.1;
  if (name.includes('좌측') && (name.includes('서라운드') || name.includes('프레임') || name.includes('커튼박스'))) return 91.2;
  if (name.includes('우측') && (name.includes('서라운드') || name.includes('커튼박스')) && name.includes('측면판')) return 92;
  if (name.includes('우측') && (name.includes('서라운드') || name.includes('커튼박스')) && name.includes('전면판')) return 92.1;
  if (name.includes('우측') && (name.includes('서라운드') || name.includes('프레임') || name.includes('커튼박스'))) return 92.2;
  if ((name.includes('하부프레임') || name.includes('하부 프레임') || name.includes('하부프래임')) && material === 'PET') return 93;
  if (name.includes('서라운드') || name.includes('surround') || name.includes('커튼박스')) return 94;
  if ((name.includes('프레임') || name.includes('프래임')) && material === 'PET') return 95;
  // 서랍속장(날개벽)은 서랍보다 위 (본체 뒤, 서랍 앞)
  if (name.includes('서랍속장')) return 10;
  // 서랍 세부 유형 (본체보다 먼저 체크 — '좌측판' 등이 본체 좌측과 겹침 방지)
  // 좌우측판 → 바닥판 → 뒷판 → 앞판 (서랍번호 우선 그룹: 11~15)
  // 마이다는 모든 서랍 다음에 별도 (16)
  if (name.includes('마이다')) return 16;
  if (name.includes('서랍') && (name.includes('좌측판') || name.includes('우측판'))) return 11;
  if (name.includes('서랍') && name.includes('바닥')) return 12;
  if (name.includes('서랍') && name.includes('뒷판')) return 13;
  if (name.includes('서랍') && name.includes('앞판')) return 14;
  if (name.includes('서랍')) return 15;
  // 본체 패널: 바닥판 → 좌우측판 → 백패널 → 상판 → 선반/칸막이 → 보강 → 프레임
  if (name.includes('바닥')) return 1;
  if (name.includes('좌측') || name.includes('left')) return 2;
  if (name.includes('우측') || name.includes('right')) return 3;
  if (name.includes('측판')) return 4;
  if (name.includes('백패널') || name.includes('뒷판')) return 5;
  if (name.includes('상판')) return 6;
  if (name.includes('선반') || name.includes('칸막이') || name.includes('분할')) return 7;
  if (name.includes('보강')) return 8;
  if (name.includes('프레임') || name.includes('프래임')) return 9;
  return 17;
}

/**
 * 좌우 우선순위: 좌측(0) → 우측(1) → 기타(2)
 */
function leftRightPriority(label: string): number {
  const name = label.toLowerCase();
  if (name.includes('좌측') || name.includes('left') || name.includes('좌측면')) return 0;
  if (name.includes('우측') || name.includes('right') || name.includes('우측면')) return 1;
  return 2;
}

/**
 * 서랍 번호 추출: "서랍3 앞판" → 3, 서랍이 아니면 0
 */
function extractDrawerNumber(label: string): number {
  const m = label.match(/서랍(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

export default function PanelsTable(){
  const { t } = useTranslation();
  const { panels, setPanels, selectedPanelId, setSelectedPanelId, setUserHasModifiedPanels, settings, setHoveredPanel, excludedPanelIds, togglePanelExclusion, setExcludedPanelIds, assemblyPlaying, setAssemblyPlaying, placements, setCurrentSheetIndex, setSelectedSheetId, stock } = useCNCStore();
  const { panels: livePanels } = useLivePanelData();
  const placedModules = useFurnitureStore((s) => s.placedModules);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const selectedRowRef = useRef<HTMLTableRowElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newlyAddedPanelId, setNewlyAddedPanelId] = useState<string | null>(null);

  // 조립 애니메이션 refs
  const assemblyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const assemblyStepRef = useRef<number>(0);

  // 가구 ID → slotIndex 매핑 (왼쪽부터 배치 순서)
  const furnitureSlotMap = useMemo(() => {
    const map = new Map<string, number>();
    placedModules.forEach((pm) => {
      map.set(pm.id, pm.slotIndex ?? 0);
    });
    return map;
  }, [placedModules]);

  // 패널 ID → furnitureId 매핑
  const panelFurnitureMap = useMemo(() => {
    const map = new Map<string, string>();
    livePanels.forEach((lp) => {
      if ((lp as any).furnitureId) {
        map.set(lp.id, (lp as any).furnitureId);
      }
    });
    return map;
  }, [livePanels]);

  // 패널 정렬: 왼쪽 가구(slotIndex) → 상부/하부 섹션 → 패널유형 순서
  const sortedPanelIndices = useMemo(() => {
    return panels
      .map((p, i) => {
        const furnitureId = panelFurnitureMap.get(p.id);
        const slot = furnitureId ? (furnitureSlotMap.get(furnitureId) ?? 999) : 999;
        return {
          index: i,
          slot,
          section: sectionPriority(p.label),
          tp: panelTypePriority(p.label, p.material),
          lr: leftRightPriority(p.label),
          drawerNum: extractDrawerNumber(p.label),
          label: p.label,
        };
      })
      .sort((a, b) => {
        // 하단 그룹(tp>=90): tp 우선 정렬 (상부프레임→서라운드→하부프레임→도어)
        const aBottom = a.tp >= 90 ? 1 : 0;
        const bBottom = b.tp >= 90 ? 1 : 0;
        if (aBottom !== bBottom) return aBottom - bBottom;
        if (aBottom && bBottom) {
          if (a.tp !== b.tp) return a.tp - b.tp;
          if (a.slot !== b.slot) return a.slot - b.slot;
          if (a.lr !== b.lr) return a.lr - b.lr;
          return a.label.localeCompare(b.label, 'ko');
        }
        if (a.slot !== b.slot) return a.slot - b.slot;       // 왼쪽 가구부터
        if (a.section !== b.section) return a.section - b.section; // 하부 → 상부
        // 서랍 그룹(tp 11~15)은 서랍번호 우선: 서랍4 → 서랍3 → 서랍2 → 서랍1, 날개벽(10)·마이다(16)는 별도
        const aDrawer = a.tp >= 11 && a.tp <= 15;
        const bDrawer = b.tp >= 11 && b.tp <= 15;
        if (aDrawer && bDrawer) {
          if (a.drawerNum !== b.drawerNum) return b.drawerNum - a.drawerNum;
          if (a.tp !== b.tp) return a.tp - b.tp;
          if (a.lr !== b.lr) return a.lr - b.lr;
          return a.label.localeCompare(b.label, 'ko');
        }
        if (a.tp !== b.tp) return a.tp - b.tp;               // 패널유형 순서
        if (a.lr !== b.lr) return a.lr - b.lr;               // 좌측 → 우측
        return a.label.localeCompare(b.label, 'ko');
      })
      .map(item => item.index);
  }, [panels, panelFurnitureMap, furnitureSlotMap]);

  // 조립 애니메이션 시작
  const startAssembly = useCallback(() => {
    setAssemblyPlaying(true);
    assemblyStepRef.current = 0;
  }, [setAssemblyPlaying]);

  // 조립 애니메이션 중지
  const stopAssembly = useCallback(() => {
    setAssemblyPlaying(false);
    if (assemblyTimerRef.current) {
      clearInterval(assemblyTimerRef.current);
      assemblyTimerRef.current = null;
    }
  }, [setAssemblyPlaying]);

  // 조립 애니메이션 루프
  useEffect(() => {
    if (!assemblyPlaying) return;

    assemblyTimerRef.current = setInterval(() => {
      const step = assemblyStepRef.current;
      if (step >= sortedPanelIndices.length) {
        stopAssembly();
        return;
      }
      const panelIdx = sortedPanelIndices[step];
      const panelId = panels[panelIdx].id;
      setExcludedPanelIds(prev => {
        const next = new Set(prev);
        next.delete(panelId);
        return next;
      });
      assemblyStepRef.current = step + 1;
    }, 200);

    return () => {
      if (assemblyTimerRef.current) {
        clearInterval(assemblyTimerRef.current);
      }
    };
  }, [assemblyPlaying, sortedPanelIndices, panels, stopAssembly, setExcludedPanelIds]);

  // 패널 ID → meshName/furnitureId 매핑 (3D 하이라이트용)
  const panelHighlightMap = useMemo(() => {
    const map = new Map<string, { meshName: string; furnitureId: string }>();
    panels.forEach(p => {
      if (p.meshName && p.furnitureId) {
        map.set(p.id, { meshName: p.meshName, furnitureId: p.furnitureId });
      }
    });
    return map;
  }, [panels]);

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

  // 키보드 방향키로 패널 선택 이동
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    // 포커스된 input blur → 테두리가 이전 위치에 남지 않도록
    if (document.activeElement && document.activeElement !== tableContainerRef.current) {
      (document.activeElement as HTMLElement).blur();
      tableContainerRef.current?.focus();
    }

    const currentIdx = selectedPanelId
      ? sortedPanelIndices.findIndex(i => panels[i].id === selectedPanelId)
      : -1;

    let nextIdx: number;
    if (e.key === 'ArrowDown') {
      nextIdx = currentIdx < sortedPanelIndices.length - 1 ? currentIdx + 1 : 0;
    } else {
      nextIdx = currentIdx > 0 ? currentIdx - 1 : sortedPanelIndices.length - 1;
    }

    const nextPanel = panels[sortedPanelIndices[nextIdx]];
    if (nextPanel) {
      setSelectedPanelId(nextPanel.id);
      const info = panelHighlightMap.get(nextPanel.id);
      if (info) {
        setHoveredPanel(info.meshName, info.furnitureId);
      }
      // 시트 이동
      if (placements.length > 0) {
        const placement = placements.find(pl => pl.panelId.startsWith(nextPanel.id + '-') || pl.panelId === nextPanel.id);
        if (placement) {
          const uniqueSheetIds = [...new Set(placements.map(pl => pl.sheetId))];
          const sheetIdx = uniqueSheetIds.indexOf(placement.sheetId);
          if (sheetIdx >= 0) {
            setCurrentSheetIndex(sheetIdx);
            setSelectedSheetId(placement.sheetId);
          }
        }
      }
    }
  };

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
        const updatedPanel = {
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
    const newId = selectedPanelId === id ? null : id;
    setSelectedPanelId(newId);

    // 패널이 선택되면 해당 패널이 배치된 시트로 이동
    if (newId && placements.length > 0) {
      // placements의 panelId는 "{panel.id}-{index}" 형식
      const placement = placements.find(pl => pl.panelId.startsWith(id + '-') || pl.panelId === id);
      if (placement) {
        // sheetId로 시트 인덱스 찾기
        const uniqueSheetIds = [...new Set(placements.map(pl => pl.sheetId))];
        const sheetIdx = uniqueSheetIds.indexOf(placement.sheetId);
        if (sheetIdx >= 0) {
          setCurrentSheetIndex(sheetIdx);
          setSelectedSheetId(placement.sheetId);
        }
      }
    }
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
          {panels.length > 0 && (assemblyPlaying || excludedPanelIds.size === panels.length) && (
            <button
              className={styles.addButton}
              onClick={assemblyPlaying ? stopAssembly : startAssembly}
              title={assemblyPlaying ? '조립 중지' : '조립 애니메이션'}
              style={{ color: assemblyPlaying ? '#ef4444' : '#22c55e', minWidth: '28px' }}
            >
              {assemblyPlaying ? '■' : '▶'}
            </button>
          )}
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
      
      <div className={styles.tableContainer} ref={tableContainerRef} tabIndex={0} onKeyDown={handleKeyDown} style={{ outline: 'none' }}>
        {panels.length === 0 ? (
          <div className={styles.empty}>
            {t('cnc.noPanelsMessage')}
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    className={styles.panelCheckbox}
                    checked={panels.length > 0 && excludedPanelIds.size === 0}
                    ref={(el) => {
                      if (el) {
                        el.indeterminate = excludedPanelIds.size > 0 && excludedPanelIds.size < panels.length;
                      }
                    }}
                    onChange={() => {
                      if (excludedPanelIds.size === 0) {
                        // 모두 체크됨 → 모두 해제
                        panels.forEach(p => togglePanelExclusion(p.id));
                      } else {
                        // 일부/전부 해제 → 모두 체크 (제외된 것만 토글)
                        panels.forEach(p => {
                          if (excludedPanelIds.has(p.id)) {
                            togglePanelExclusion(p.id);
                          }
                        });
                      }
                    }}
                    title="전체 선택/해제"
                  />
                </th>
                <th>{t('cnc.name')}</th>
                <th>{t('cnc.dimensions')}</th>
                <th>{t('cnc.thickness')}</th>
                <th>{t('cnc.material')}</th>
                <th>{t('cnc.grain')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedPanelIndices.map((i, sortIdx) => {
                const p = panels[i];
                const isNewPanel = p.label === '' && p.width === 0 && p.length === 0;

                // 가구 그룹 구분: 이전 패널과 가구(slotIndex)가 다르면 구분선 표시
                const currentFid = panelFurnitureMap.get(p.id);
                const currentSlot = currentFid ? (furnitureSlotMap.get(currentFid) ?? -1) : -1;
                const prevP = sortIdx > 0 ? panels[sortedPanelIndices[sortIdx - 1]] : null;
                const prevFid = prevP ? panelFurnitureMap.get(prevP.id) : undefined;
                const prevSlot = prevFid ? (furnitureSlotMap.get(prevFid) ?? -1) : -1;
                const showGroupSeparator = sortIdx > 0 && currentSlot !== prevSlot;

                return (
                <React.Fragment key={p.id}>
                {showGroupSeparator && (
                  <tr className={styles.groupSeparator}>
                    <td colSpan={6} style={{ padding: 0, height: '2px', background: 'var(--border-color, #e5e7eb)' }}></td>
                  </tr>
                )}
                <tr
                  key={p.id}
                  ref={selectedPanelId === p.id ? selectedRowRef : null}
                  className={`panel-clickable ${selectedPanelId === p.id ? styles.selected : ''} ${isNewPanel ? styles.newPanel : ''} ${excludedPanelIds.has(p.id) ? styles.excludedRow : ''}`}
                  onClick={() => {
                    selectPanel(p.id);
                    const info = panelHighlightMap.get(p.id);
                    if (info) {
                      setHoveredPanel(info.meshName, info.furnitureId);
                    }
                  }}
                  onMouseEnter={() => {}}
                  onMouseLeave={() => {}}
                  data-panel-id={p.id}
                >
                  <td>
                    <input
                      type="checkbox"
                      className={styles.panelCheckbox}
                      checked={!excludedPanelIds.has(p.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        togglePanelExclusion(p.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      title={excludedPanelIds.has(p.id) ? '패널 포함' : '패널 제외'}
                    />
                  </td>
                  <td>
                    <input
                      value={p.label}
                      readOnly
                      className={styles.input}
                      title={p.label}
                      data-panel-id={p.id}
                      style={{ cursor: 'pointer', userSelect: 'none' }}
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
                      className={`${styles.grainToggle} ${p.grain === 'V' ? styles.grainToggleV : styles.grainToggleH}`}
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
                </tr>
                </React.Fragment>
              );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}