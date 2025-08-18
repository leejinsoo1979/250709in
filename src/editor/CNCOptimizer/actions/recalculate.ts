import { planByLength } from '../../../engine/plan/byLength';
import { planByWidth } from '../../../engine/plan/byWidth';
import { planOptimalCNC } from '../../../engine/plan/optimalCNC';
import { computeSawStats, wasteRatio } from '../../../utils/geom/stats';
import { useCNCOptimizerStore } from '../cncStore';

export function recalc(){ 
  const s = useCNCOptimizerStore.getState(); 
  console.log('Recalc called with mode:', s.mode);
  console.log('Panels:', s.panels);
  console.log('Sheets:', s.sheets);
  if(s.sheets.length === 0) return; 
  
  let allPlacements = [];
  let allCuts = [];
  let remainingPanels = [...s.panels];
  let totalCncStats = { cycleTimeSec: 0, cutLenMm: 0, airLenMm: 0, toolChanges: 0 };
  
  // Process each sheet until all panels are placed
  for(const sheet of s.sheets) {
    if(remainingPanels.length === 0) break;
    
    let placements = [];
    let cuts = [];
    let cnc;
    
    if(s.mode==='BY_LENGTH'){ 
      console.log('Using BY_LENGTH for sheet', sheet.id);
      const r=planByLength(sheet, s.kerfMm, remainingPanels); 
      placements=r.placements; 
      cuts=r.cuts;
      console.log('BY_LENGTH placements:', placements); 
    } else if(s.mode==='BY_WIDTH'){ 
      const r=planByWidth(sheet, s.kerfMm, remainingPanels); 
      placements=r.placements; 
      cuts=r.cuts; 
    } else { 
      const r=planOptimalCNC(sheet, s.kerfMm, remainingPanels); 
      placements=r.placements; 
      cuts=r.cuts; 
      cnc=r.cnc;
      if(cnc) {
        totalCncStats.cycleTimeSec += cnc.cycleTimeSec;
        totalCncStats.cutLenMm += cnc.cutLenMm;
        totalCncStats.airLenMm += cnc.airLenMm;
        totalCncStats.toolChanges += cnc.toolChanges;
      }
    }
    
    // Add to total results
    allPlacements.push(...placements);
    allCuts.push(...cuts);
    
    // Remove placed panels from remaining list
    const placedPanelIds = new Map<string, number>();
    placements.forEach(p => {
      placedPanelIds.set(p.panelId, (placedPanelIds.get(p.panelId) || 0) + 1);
    });
    
    remainingPanels = remainingPanels.reduce((acc, panel) => {
      const placedCount = placedPanelIds.get(panel.id) || 0;
      const remaining = panel.qty - placedCount;
      if(remaining > 0) {
        acc.push({ ...panel, qty: remaining });
      }
      return acc;
    }, []);
  }
  
  useCNCOptimizerStore.setState({ placements: allPlacements, cuts: allCuts }); 
  useCNCOptimizerStore.getState().setSawStats(computeSawStats(allCuts,'m')); 
  if(s.mode === 'OPTIMAL_CNC') {
    useCNCOptimizerStore.getState().setCNCStats(totalCncStats);
  }
  
  const waste = wasteRatio(allPlacements, s.sheets); 
  console.log('Final placements:', allPlacements);
  console.log('Final cuts:', allCuts);
  console.log('waste', waste); 
}