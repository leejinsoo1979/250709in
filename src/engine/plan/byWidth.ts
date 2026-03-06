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

  // W방향 우선: 가로 밴드. 같은 length(height)끼리 그룹핑
  const groups = new Map<number, {id:string;w:number;h:number}[]>();
  for (const it of items) {
    const key = Math.round(it.l);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({id: it.id, w: it.w, h: it.l});
  }

  // 그룹을 height 내림차순으로 정렬
  const sortedHeights = [...groups.keys()].sort((a, b) => b - a);

  // 각 그룹 내에서 width 내림차순 정렬
  for (const [, groupItems] of groups) {
    groupItems.sort((a, b) => b.w - a.w);
  }

  type Band={ y:number; h:number; usedW:number; cells:{ id:string;x:number;w:number;h:number; }[] };
  const bands:Band[]=[];
  const gap=kerf;
  let currentY = PADY;

  for (const h of sortedHeights) {
    const groupItems = groups.get(h)!;
    if (groupItems.length === 0) continue;

    // 이 height가 시트에 들어가는지 확인
    if (currentY - PADY + h > usableL + 1e-6) continue;

    let currentBand: Band | null = null;

    for (const it of groupItems) {
      if (!currentBand) {
        if (currentY - PADY + it.h > usableL + 1e-6) break;
        currentBand = { y: currentY, h: it.h, usedW: 0, cells: [] };
      }

      const x = PADX + currentBand.usedW + (currentBand.cells.length ? kerf : 0);
      if (x - PADX + it.w <= usableW + 1e-6) {
        currentBand.cells.push({ id: it.id, x, w: it.w, h: it.h });
        currentBand.usedW = (x - PADX) + it.w;
      } else {
        // 현재 밴드 꽉 참 → 저장하고 새 밴드
        if (currentBand.cells.length > 0) {
          bands.push(currentBand);
          currentY += currentBand.h + gap;
        }

        if (currentY - PADY + it.h > usableL + 1e-6) {
          currentBand = null;
          break;
        }

        currentBand = { y: currentY, h: it.h, usedW: 0, cells: [] };
        currentBand.cells.push({ id: it.id, x: PADX, w: it.w, h: it.h });
        currentBand.usedW = it.w;
      }
    }

    // 마지막 밴드 저장
    if (currentBand && currentBand.cells.length > 0) {
      bands.push(currentBand);
      currentY += currentBand.h + gap;
    }
  }

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
