import React, { useMemo } from 'react';
import { useCNCOptimizerStore } from '../cncStore';
import { computeSawStats, wasteRatio } from '../../../utils/geom/stats';
import styles from './StatsCard.module.css';

export default function StatsCard(){ 
  const { cuts, placements, sheets, mode, cncStats } = useCNCOptimizerStore(); 
  
  const saw = useMemo(()=> computeSawStats(cuts,'m'), [cuts]); 
  const waste = useMemo(()=> (wasteRatio(placements, sheets)*100), [placements,sheets]); 
  
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3>통계</h3>
      </div>
      <div className={styles.stats}>
        <div className={styles.statItem}>
          <span className={styles.label}>폐기율</span>
          <span className={styles.value}>{waste.toFixed(1)}%</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.label}>Used Sheets</span>
          <span className={styles.value}>{new Set(placements.map(p=>p.sheetId)).size}</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.label}>절단 수</span>
          <span className={styles.value}>{cuts.length}</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.label}>총 절단 길이</span>
          <span className={styles.value}>{saw.total.toFixed(2)} {saw.unit}</span>
        </div>
        {mode==='OPTIMAL_CNC' && (
          <>
            <div className={styles.statItem}>
              <span className={styles.label}>예상 가공 시간</span>
              <span className={styles.value}>{cncStats.cycleTimeSec.toFixed(1)} 초</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.label}>공구 교체</span>
              <span className={styles.value}>{cncStats.toolChanges}</span>
            </div>
          </>
        )}
      </div>
    </div>
  ); 
}