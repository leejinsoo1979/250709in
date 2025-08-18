export type CutAxis = 'x'|'y';
export type CutMode = 'BY_LENGTH'|'BY_WIDTH'|'OPTIMAL_CNC';
export interface Size { w:number; l:number; }
export interface Sheet { id:string; width:number; length:number; trim:{left:number;right:number;top:number;bottom:number}; }
export interface PanelReq { id:string; width:number; length:number; qty:number; canRotate:boolean; grain?:'length'|'width'|'none'; }
export interface Placement { sheetId:string; panelId:string; x:number; y:number; width:number; length:number; rotated?:boolean; }
export interface CutStep { id:string; sheetId:string; order:number; axis:CutAxis; pos:number; spanStart:number; spanEnd:number; kerf?:number; before?:Size; made?:Size|null; surplus?:Size|null; source:'engine'|'derived'; }
export interface SawStats { bySheet:Record<string,number>; total:number; unit:'m'|'mm'; }
export interface CNCStats { cycleTimeSec:number; cutLenMm:number; airLenMm:number; toolChanges:number; }