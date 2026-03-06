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

  // L방향 우선: 세로 스트립. 같은 width끼리 그룹핑
  const groups = new Map<number, typeof items>();
  for (const it of items) {
    const key = Math.round(it.w);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  }

  // 그룹을 width 내림차순으로 정렬
  const sortedWidths = [...groups.keys()].sort((a, b) => b - a);

  // 각 그룹 내에서 length 내림차순 정렬
  for (const [, groupItems] of groups) {
    groupItems.sort((a, b) => b.l - a.l);
  }

  type Strip={ x:number; w:number; usedL:number; rows:{ id:string;y:number;l:number;w:number; }[] };
  const strips:Strip[]=[];
  const gap=kerf;
  let currentX = PADX;

  for (const w of sortedWidths) {
    const groupItems = groups.get(w)!;
    if (groupItems.length === 0) continue;

    // 이 width가 시트에 들어가는지 확인
    if (currentX - PADX + w > usableW + 1e-6) continue;

    let currentY = PADY;
    let currentStrip: Strip | null = null;

    for (const it of groupItems) {
      if (!currentStrip) {
        if (currentX - PADX + it.w > usableW + 1e-6) break;
        currentStrip = { x: currentX, w: it.w, usedL: 0, rows: [] };
      }

      const y = PADY + currentStrip.usedL + (currentStrip.rows.length ? kerf : 0);
      if (y - PADY + it.l <= usableL + 1e-6) {
        currentStrip.rows.push({ id: it.id, y, l: it.l, w: it.w });
        currentStrip.usedL = (y - PADY) + it.l;
      } else {
        // 현재 스트립 꽉 참 → 저장하고 새 스트립
        if (currentStrip.rows.length > 0) {
          strips.push(currentStrip);
          currentX += currentStrip.w + gap;
        }

        if (currentX - PADX + it.w > usableW + 1e-6) {
          currentStrip = null;
          break;
        }

        currentStrip = { x: currentX, w: it.w, usedL: 0, rows: [] };
        currentStrip.rows.push({ id: it.id, y: PADY, l: it.l, w: it.w });
        currentStrip.usedL = it.l;
      }
    }

    // 마지막 스트립 저장
    if (currentStrip && currentStrip.rows.length > 0) {
      strips.push(currentStrip);
      currentX += currentStrip.w + gap;
    }
  }

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
