import type { Sheet, PanelReq, Placement, CutStep } from '../../types/cut';

export function planByWidth(sheet:Sheet, kerf:number, panels:PanelReq[]):{placements:Placement[]; cuts:CutStep[]}{ 
  const PADX=sheet.trim.left, PADY=sheet.trim.top; 
  const usableW=sheet.width-PADX-sheet.trim.right; 
  const usableL=sheet.length-PADY-sheet.trim.bottom; 
  const items: {id:string;w:number;l:number;canRotate:boolean;grain?:'length'|'width'|'none'}[]=[]; 
  
  panels.forEach(p=>{ 
    for(let i=0;i<p.qty;i++){ 
      let w=p.width,l=p.length; 
      const forceLen=p.grain==='length', forceWid=p.grain==='width'; 
      const can=p.canRotate && !forceLen && !forceWid; 
      if(can && l>w){ const t=w; w=l; l=t; } 
      if(forceLen && w>l){ const t=w; w=l; l=t; } 
      if(forceWid && l>w){ const t=w; w=l; l=t; } 
      items.push({id:p.id,w,l,canRotate:p.canRotate,grain:p.grain}); 
    }
  });
  
  items.sort((a,b)=> b.l-a.l || b.w-a.w);
  
  type Band={ y:number; h:number; usedW:number; cells:{ id:string;x:number;w:number;h:number; }[] };
  const bands:Band[]=[]; 
  const gap=kerf;
  
  const tryPlace=(it:{id:string;w:number;h:number})=>{ 
    for(const b of bands){ 
      if(it.h<=b.h){ 
        const x=PADX + b.usedW + (b.cells.length? kerf:0); 
        if(x-PADX + it.w <= usableW + 1e-6){ 
          b.cells.push({id:it.id,x,w:it.w,h:it.h}); 
          b.usedW = (x-PADX)+it.w; 
          return true; 
        } 
      } 
    } 
    const y=PADY + bands.reduce((a,b)=>a+b.h+gap,0); 
    if(y-PADY + it.h > usableL + 1e-6) return false; 
    const nb:Band={y, h:it.h, usedW:0, cells:[]}; 
    nb.cells.push({id:it.id,x:PADX,w:it.w,h:it.h}); 
    nb.usedW=it.w; 
    bands.push(nb); 
    return true; 
  };
  
  items.forEach(({id,w,l})=> tryPlace({id, w, h:l}));
  
  const placements:Placement[]=[]; 
  for(const b of bands){ 
    for(const c of b.cells){ 
      placements.push({sheetId:sheet.id, panelId:c.id, x:c.x, y:b.y, width:c.w, length:b.h}); 
    } 
  }
  
  const cuts:CutStep[]=[]; 
  let order=1;
  
  for(const b of bands){ 
    const X=PADX, X2=PADX+usableW; 
    cuts.push({id:`c${order}`,sheetId:sheet.id,order:order++,axis:'y',pos:b.y,spanStart:X,spanEnd:X2,source:'derived'}); 
    cuts.push({id:`c${order}`,sheetId:sheet.id,order:order++,axis:'y',pos:b.y+b.h,spanStart:X,spanEnd:X2,source:'derived'}); 
  }
  
  const xSet=new Set<number>(); 
  for(const b of bands){ 
    for(const c of b.cells){ 
      xSet.add(c.x); 
      xSet.add(c.x+c.w); 
    } 
  } 
  const xs=[...xSet].sort((a,b)=>a-b); 
  const Y0=PADY, Y1=PADY+usableL; 
  for(const x of xs){ 
    cuts.push({id:`c${order}`,sheetId:sheet.id,order:order++,axis:'x',pos:x,spanStart:Y0,spanEnd:Y1,source:'derived'}); 
  }
  
  return {placements,cuts}; 
}