import type { CutStep, Size } from '../../types/cut';

const sz=(z?:Size|null)=> z? `${Math.round(z.w)}×${Math.round(z.l)}`:'-';
export const fmtCut = (c:CutStep)=> `${c.axis}=${Math.round(c.pos)}`;
export const fmtResult = (c:CutStep)=> `${sz(c.made)} \\ ${c.surplus? `surplus ${sz(c.surplus)}`: '-'}`;