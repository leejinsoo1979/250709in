import type { CutStep, SawStats } from '../../types/cut';

export function unionCutLength(cuts:CutStep[]):number{ 
  const map=new Map<string,[number,number][]>(); 
  for(const c of cuts){
    const k=`${c.sheetId}|${c.axis}|${c.pos.toFixed(3)}`; 
    const a=Math.min(c.spanStart,c.spanEnd), b=Math.max(c.spanStart,c.spanEnd); 
    if(!map.has(k)) map.set(k,[]); 
    map.get(k)!.push([a,b]);
  } 
  let total=0; 
  for(const [,arr] of map){
    arr.sort((A,B)=>A[0]-B[0]); 
    let [s,e]=arr[0]; 
    for(let i=1;i<arr.length;i++){
      const [ns,ne]=arr[i]; 
      if(ns<=e) e=Math.max(e,ne); 
      else {total+=e-s; s=ns; e=ne;}
    } 
    total+=e-s;
  } 
  return total;
}

export function computeSawStats(cuts:CutStep[], unit:'m'|'mm'='m'):SawStats{ 
  const bySheet:Record<string,number>={}; 
  const groups=new Map<string,CutStep[]>(); 
  for(const c of cuts){ 
    if(!groups.has(c.sheetId)) groups.set(c.sheetId,[]); 
    groups.get(c.sheetId)!.push(c);
  } 
  let sum=0; 
  for(const [sid,arr] of groups){
    const mm=unionCutLength(arr); 
    bySheet[sid]=unit==='m'? mm/1000 : mm; 
    sum+=mm;
  } 
  return { bySheet, total: unit==='m'? sum/1000 : sum, unit }; 
}

export function wasteRatio(placements:{width:number;length:number}[], sheets:{width:number;length:number;trim:{left:number;right:number;top:number;bottom:number}}[]):number{ 
  const used=placements.reduce((a,p)=>a+p.width*p.length,0); 
  const avail=sheets.reduce((a,s)=>a+(s.width-s.trim.left-s.trim.right)*(s.length-s.trim.top-s.trim.bottom),0); 
  return avail>0? Math.max(0,1-used/avail):0; 
}