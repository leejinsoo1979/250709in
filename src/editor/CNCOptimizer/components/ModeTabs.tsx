import React from 'react';
import { useCNCStore } from '../store';
import { OptimizationType } from '../../../types/cutlist';
import { ArrowDownToLine, ArrowRightToLine, Cpu } from 'lucide-react';
import styles from './ModeTabs.module.css';

export default function ModeTabs(){ 
  const { settings, setSettings } = useCNCStore();
  const mode = settings.optimizationType || 'OPTIMAL_CNC';
  
  const click=(m: OptimizationType)=>{ 
    console.log('Switching to mode:', m);
    setSettings({ optimizationType: m });
  }; 
  
  return (
    <div className={styles.container}> 
      {(['BY_LENGTH','BY_WIDTH','OPTIMAL_CNC'] as OptimizationType[]).map(m=> (
        <button 
          key={m} 
          onClick={()=>click(m)} 
          className={`${styles.tab} ${mode===m ? styles.active : ''}`}
        >
          {m==='BY_LENGTH' ? (
            <>
              <ArrowRightToLine size={14} />
              L방향 우선
            </>
          ) : m==='BY_WIDTH' ? (
            <>
              <ArrowDownToLine size={14} />
              W방향 우선
            </>
          ) : (
            <>
              <Cpu size={14} />
              Nesting
            </>
          )}
        </button>
      ))}
    </div>
  ); 
}