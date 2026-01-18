import React from 'react';
import { useCNCStore } from '../store';
import { OptimizationType } from '../../../types/cutlist';
import { ArrowDownToLine, ArrowRightToLine, Cpu } from 'lucide-react';
import styles from './ModeTabs.module.css';

interface ModeTabsProps {
  onModeChange?: () => void;
}

export default function ModeTabs({ onModeChange }: ModeTabsProps = {}){
  const { settings, setSettings } = useCNCStore();
  const mode = settings.optimizationType || 'OPTIMAL_CNC';

  const click=(m: OptimizationType)=>{
    console.log('Switching to mode:', m);
    setSettings({ optimizationType: m });
    // 모드 변경 시 자동으로 최적화 실행
    if (onModeChange) {
      setTimeout(() => {
        onModeChange();
      }, 50);
    }
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
              CNC Optimizer
            </>
          )}
        </button>
      ))}
    </div>
  ); 
}