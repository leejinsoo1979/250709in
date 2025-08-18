import type { Sheet, PanelReq, Placement, CutStep, CNCStats } from '../../types/cut';

/** Improved 2D bin packing with better space utilization */
export function planOptimalCNC(sheet:Sheet, kerf:number, panels:PanelReq[]):{placements:Placement[]; cuts:CutStep[]; cnc:CNCStats}{ 
  // 1) Improved 2D packing with rotation support
  const PADX=sheet.trim.left, PADY=sheet.trim.top; 
  const usableW=sheet.width-PADX-sheet.trim.right; 
  const usableL=sheet.length-PADY-sheet.trim.bottom; 
  
  // Expand panels with rotation options
  const items: {id:string;w:number;l:number;rotated:boolean;area:number}[]=[]; 
  
  panels.forEach(p=>{ 
    for(let i=0;i<p.qty;i++){ 
      // Try both orientations if rotation is allowed and grain permits
      if(p.canRotate && p.grain === 'none') {
        // Choose best orientation based on sheet dimensions
        const normal = {id:p.id,w:p.width,l:p.length,rotated:false,area:p.width*p.length};
        const rotated = {id:p.id,w:p.length,l:p.width,rotated:true,area:p.width*p.length};
        
        // Prefer orientation that fits better with sheet aspect ratio
        const sheetRatio = usableW / usableL;
        const normalRatio = normal.w / normal.l;
        const rotatedRatio = rotated.w / rotated.l;
        
        const normalDiff = Math.abs(sheetRatio - normalRatio);
        const rotatedDiff = Math.abs(sheetRatio - rotatedRatio);
        
        items.push(normalDiff <= rotatedDiff ? normal : rotated);
      } else {
        items.push({id:p.id,w:p.width,l:p.length,rotated:false,area:p.width*p.length});
      }
    } 
  }); 
  
  // Sort by area (largest first) then by max dimension
  items.sort((a,b)=> {
    if(Math.abs(b.area - a.area) > 1) return b.area - a.area;
    return Math.max(b.w,b.l) - Math.max(a.w,a.l);
  });
  
  const placements:Placement[]=[]; 
  const gap=kerf;
  
  // Track free rectangles for better packing
  type FreeRect = {x:number; y:number; w:number; h:number};
  let freeRects:FreeRect[] = [{x:PADX, y:PADY, w:usableW, h:usableL}];
  
  for(const item of items){ 
    // Find best fitting free rectangle
    let bestFit:FreeRect|null = null;
    let bestScore = Infinity;
    let bestIndex = -1;
    
    for(let i = 0; i < freeRects.length; i++) {
      const rect = freeRects[i];
      
      // Check if item fits
      if(item.w + gap <= rect.w && item.l + gap <= rect.h) {
        // Score based on wasted space (lower is better)
        const leftoverX = rect.w - item.w - gap;
        const leftoverY = rect.h - item.l - gap;
        const score = Math.min(leftoverX, leftoverY); // Best short side fit
        
        if(score < bestScore) {
          bestScore = score;
          bestFit = rect;
          bestIndex = i;
        }
      }
    }
    
    if(!bestFit) continue; // Item doesn't fit
    
    // Place the item
    placements.push({
      sheetId:sheet.id, 
      panelId:item.id, 
      x:bestFit.x, 
      y:bestFit.y, 
      width:item.w, 
      length:item.l,
      rotated:item.rotated
    });
    
    // Split the free rectangle
    freeRects.splice(bestIndex, 1);
    
    // Create new free rectangles from the split
    const itemRight = bestFit.x + item.w + gap;
    const itemBottom = bestFit.y + item.l + gap;
    
    // Right remainder
    if(itemRight < bestFit.x + bestFit.w) {
      freeRects.push({
        x: itemRight,
        y: bestFit.y,
        w: bestFit.x + bestFit.w - itemRight,
        h: item.l + gap
      });
    }
    
    // Bottom remainder
    if(itemBottom < bestFit.y + bestFit.h) {
      freeRects.push({
        x: bestFit.x,
        y: itemBottom,
        w: bestFit.w,
        h: bestFit.y + bestFit.h - itemBottom
      });
    }
    
    // Merge overlapping free rectangles to reduce fragmentation
    freeRects = mergeRects(freeRects);
  }
  
  // Helper function to merge overlapping rectangles
  function mergeRects(rects: FreeRect[]): FreeRect[] {
    // Simple merge - could be optimized further
    return rects.filter(r => r.w > gap && r.h > gap);
  }
  
  // 2) derive guillotine-like sequence from placement grid (x/y breakpoints)
  const cuts:CutStep[]=[]; 
  let order=1; 
  const xs=new Set<number>(), ys=new Set<number>(); 
  
  for(const p of placements){ 
    xs.add(p.x); 
    xs.add(p.x+p.width); 
    ys.add(p.y); 
    ys.add(p.y+p.length); 
  } 
  
  const X0=PADX, X1=PADX+usableW, Y0=PADY, Y1=PADY+usableL; 
  
  [...xs].sort((a,b)=>a-b).forEach(xv=> 
    cuts.push({id:`c${order}`,sheetId:sheet.id,order:order++,axis:'x',pos:xv,spanStart:Y0,spanEnd:Y1,source:'derived'})
  ); 
  
  [...ys].sort((a,b)=>a-b).forEach(yv=> 
    cuts.push({id:`c${order}`,sheetId:sheet.id,order:order++,axis:'y',pos:yv,spanStart:X0,spanEnd:X1,source:'derived'})
  );
  
  // 3) rough CNC stats (절삭길이=unionCutLength, 에어무브는 간단 추정)
  const cutLenMm = cuts.reduce((a,c)=> a + Math.abs(c.spanEnd-c.spanStart), 0); 
  const airLenMm = cuts.length * 50; 
  const toolChanges=1; 
  const feed=12000; 
  const rapid=24000; 
  const cycleTimeSec = cutLenMm/feed + airLenMm/rapid; 
  
  return {placements,cuts,cnc:{cycleTimeSec, cutLenMm, airLenMm, toolChanges}}; 
}