import React, { useMemo, useRef, useEffect, useState } from 'react';
import { useCNCOptimizerStore } from '../cncStore';
import styles from './SheetPreview.module.css';

export default function SheetPreview() {
  const { sheets, cuts, selectedSheetId, selectedCutId, kerfMm, placements, setSelectedSheetId } = useCNCOptimizerStore();
  const [activeTab, setActiveTab] = useState(0);
  
  const sheet = useMemo(
    () => sheets[activeTab] || sheets[0],
    [sheets, activeTab]
  );
  
  const visible = useMemo(
    () => (selectedSheetId ? cuts.filter(c => c.sheetId === selectedSheetId) : cuts).sort((a, b) => a.order - b.order),
    [cuts, selectedSheetId]
  );
  
  const sel = useMemo(() => visible.find(c => c.id === selectedCutId), [visible, selectedCutId]);
  
  const ref = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  
  useEffect(() => {
    if (!ref.current || !sheet) return;
    const pad = 20;
    const w = ref.current.clientWidth - pad * 2;
    const h = ref.current.clientHeight - pad * 2;
    setScale(Math.min(w / (sheet.width || 1), h / (sheet.length || 1)));
  }, [sheet]);
  
  const PAD = 20;
  const toVX = (mm: number) => Math.round(mm * scale) + PAD;
  const toVY = (mm: number) => Math.round(mm * scale) + PAD;
  
  // Get placements for this sheet
  const sheetPlacements = useMemo(
    () => sheet ? placements.filter(p => p.sheetId === sheet.id) : [],
    [placements, sheet]
  );
  
  // Get sheets that have placements
  const usedSheets = useMemo(() => {
    const usedIds = new Set(placements.map(p => p.sheetId));
    return sheets.filter(s => usedIds.has(s.id));
  }, [sheets, placements]);
  
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3>Sheet Preview</h3>
        <div className={styles.tabs}>
          {usedSheets.map((s, idx) => (
            <button
              key={s.id}
              className={`${styles.tab} ${sheets[activeTab]?.id === s.id ? styles.activeTab : ''}`}
              onClick={() => {
                const tabIndex = sheets.findIndex(sheet => sheet.id === s.id);
                setActiveTab(tabIndex);
              }}
            >
              Sheet {idx + 1}
            </button>
          ))}
        </div>
        {sheet && <span className={styles.sheetInfo}>{sheet.width} × {sheet.length}mm</span>}
      </div>
      <div ref={ref} className={styles.preview}>
        {/* Sheet background */}
        {sheet && (
          <div
            className={styles.sheet}
            style={{
              left: PAD,
              top: PAD,
              width: toVX(sheet.width) - PAD,
              height: toVY(sheet.length) - PAD,
            }}
          />
        )}
        
        {/* Render placements */}
        {sheetPlacements.map((p, i) => (
          <div
            key={`${p.panelId}-${i}`}
            className={styles.panel}
            style={{
              left: toVX(p.x),
              top: toVY(p.y),
              width: toVX(p.x + p.width) - toVX(p.x),
              height: toVY(p.y + p.length) - toVY(p.y),
            }}
            title={`${p.panelId}: ${p.width}×${p.length}mm`}
          />
        ))}
        
        {/* Render all cuts with lower opacity */}
        {visible.map((cut) => {
          const kerfPx = Math.max(1, kerfMm * scale);
          const a = Math.min(cut.spanStart, cut.spanEnd);
          const b = Math.max(cut.spanStart, cut.spanEnd);
          
          if (cut.axis === 'x') {
            const x = toVX(cut.pos);
            const y0 = toVY(a);
            const y1 = toVY(b);
            return (
              <div
                key={cut.id}
                className={`${styles.cut} ${styles.cutX} ${cut.id === selectedCutId ? styles.selected : ''}`}
                style={{
                  left: x - Math.floor(kerfPx / 2),
                  top: y0,
                  width: kerfPx,
                  height: y1 - y0,
                }}
                title={`x=${cut.pos}`}
              />
            );
          } else {
            const y = toVY(cut.pos);
            const x0 = toVX(a);
            const x1 = toVX(b);
            return (
              <div
                key={cut.id}
                className={`${styles.cut} ${styles.cutY} ${cut.id === selectedCutId ? styles.selected : ''}`}
                style={{
                  top: y - Math.floor(kerfPx / 2),
                  left: x0,
                  height: kerfPx,
                  width: x1 - x0,
                }}
                title={`y=${cut.pos}`}
              />
            );
          }
        })}
        
        {/* Highlight selected cut */}
        {sel && sheet && (() => {
          const kerfPx = Math.max(2, kerfMm * scale);
          const a = Math.min(sel.spanStart, sel.spanEnd);
          const b = Math.max(sel.spanStart, sel.spanEnd);
          
          if (sel.axis === 'x') {
            const x = toVX(sel.pos);
            const y0 = toVY(a);
            const y1 = toVY(b);
            return (
              <div
                className={styles.selectedCut}
                style={{
                  left: x - Math.floor(kerfPx / 2),
                  top: y0,
                  width: kerfPx,
                  height: y1 - y0,
                }}
                title={`x=${sel.pos}`}
              />
            );
          } else {
            const y = toVY(sel.pos);
            const x0 = toVX(a);
            const x1 = toVX(b);
            return (
              <div
                className={styles.selectedCut}
                style={{
                  top: y - Math.floor(kerfPx / 2),
                  left: x0,
                  height: kerfPx,
                  width: x1 - x0,
                }}
                title={`y=${sel.pos}`}
              />
            );
          }
        })()}
      </div>
    </div>
  );
}