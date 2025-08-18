import React, { useMemo } from 'react';
import { useCNCOptimizerStore } from '../../cncStore';
import { fmtCut, fmtResult } from '../../../../utils/format/cut';
import styles from './CutsTable.module.css';

export default function CutsTable(){ 
  const { cuts, selectedSheetId, selectedCutId, selectCutId, setSelectedSheetId } = useCNCOptimizerStore(); 
  
  const rows = useMemo(()=> 
    (selectedSheetId? cuts.filter(c=>c.sheetId===selectedSheetId):cuts)
      .sort((a,b)=> a.order-b.order), 
    [cuts, selectedSheetId]
  ); 
  
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3>절단 목록</h3>
      </div>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>#</th>
              <th>패널</th>
              <th>절단</th>
              <th>결과</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c,i)=> (
              <tr 
                key={c.id} 
                onClick={()=>{ 
                  setSelectedSheetId(c.sheetId); 
                  selectCutId(c.id); 
                }} 
                className={c.id===selectedCutId ? styles.selected : ''}
              >
                <td>{i+1}</td>
                <td>{c.before? `${Math.round(c.before.w)}×${Math.round(c.before.l)}`:'-'}</td>
                <td>{fmtCut(c)}</td>
                <td className={styles.result}>{fmtResult(c)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  ); 
}