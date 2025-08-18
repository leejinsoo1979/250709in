import type { Sheet, PanelReq, Placement, CutStep } from '../../types/cut';

export function planByLength(sheet:Sheet, kerf:number, panels:PanelReq[]):{placements:Placement[]; cuts:CutStep[]}{ 
  const PADX=sheet.trim.left, PADY=sheet.trim.top; 
  const usableW=sheet.width-PADX-sheet.trim.right; 
  const usableL=sheet.length-PADY-sheet.trim.bottom; 
  const items: {id:string;w:number;l:number;canRotate:boolean;grain?:'length'|'width'|'none'}[]=[]; 
  
  panels.forEach(p=>{ 
    for(let i=0;i<p.qty;i++){ 
      let w=p.width,l=p.length; 
      const forceLen=p.grain==='length', forceWid=p.grain==='width'; 
      const can=p.canRotate && !forceLen && !forceWid; 
      if(can && w>l){ const t=w; w=l; l=t; } 
      if(forceLen && w>l){ const t=w; w=l; l=t; } 
      if(forceWid && l>w){ const t=w; w=l; l=t; } 
      items.push({id:p.id,w,l,canRotate:p.canRotate,grain:p.grain}); 
    }
  });
  
  items.sort((a,b)=> b.w-a.w || b.l-a.l);
  
  type Strip={ x:number; w:number; usedL:number; rows:{ id:string;y:number;l:number;w:number; }[] };
  const strips:Strip[]=[]; 
  const gap=kerf;
  
  const tryPlace=(it:{id:string;w:number;l:number})=>{ 
    for(const s of strips){ 
      if(it.w<=s.w){ 
        const y=PADY + s.usedL + (s.rows.length? kerf:0); 
        if(y-PADY + it.l <= usableL + 1e-6){ 
          s.rows.push({id:it.id,y,l:it.l,w:it.w}); 
          s.usedL=(y-PADY)+it.l; 
          return true; 
        } 
      } 
    } 
    const x=PADX + strips.reduce((a,s)=>a+s.w+gap,0); 
    if(x-PADX + it.w > usableW + 1e-6) return false; 
    const ns:Strip={x, w:it.w, usedL:0, rows:[]}; 
    ns.rows.push({id:it.id,y:PADY,l:it.l,w:it.w}); 
    ns.usedL=it.l; 
    strips.push(ns); 
    return true; 
  };
  
  items.forEach(tryPlace);
  
  const placements:Placement[]=[]; 
  for(const s of strips){ 
    for(const r of s.rows){ 
      placements.push({sheetId:sheet.id, panelId:r.id, x:s.x, y:r.y, width:s.w, length:r.l}); 
    } 
  }
  
  const cuts:CutStep[]=[]; 
  let order=1;
  
  for(const s of strips){ 
    const L=PADY, R=PADY+usableL; 
    cuts.push({id:`c${order}`,sheetId:sheet.id,order:order++,axis:'x',pos:s.x,spanStart:L,spanEnd:R,source:'derived'}); 
    cuts.push({id:`c${order}`,sheetId:sheet.id,order:order++,axis:'x',pos:s.x+s.w,spanStart:L,spanEnd:R,source:'derived'}); 
  }
  
  const ySet=new Set<number>(); 
  for(const s of strips){ 
    for(const r of s.rows){ 
      ySet.add(r.y); 
      ySet.add(r.y+r.l); 
    } 
  } 
  const ys=[...ySet].sort((a,b)=>a-b); 
  const X0=PADX, X1=PADX+usableW; 
  for(const y of ys){ 
    cuts.push({id:`c${order}`,sheetId:sheet.id,order:order++,axis:'y',pos:y,spanStart:X0,spanEnd:X1,source:'derived'}); 
  }
  
  return {placements,cuts}; 
}