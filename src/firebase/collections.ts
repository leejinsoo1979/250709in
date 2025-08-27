/**
 * Firebase collection path helpers for team-scoped data
 */

import { FLAGS } from '@/flags';
import { db } from './config';
import { doc, collection } from 'firebase/firestore';

/**
 * Get the projects collection path for a team
 */
export function getTeamProjectsPath(teamId: string): string {
  return `teams/${teamId}/projects`;
}

/**
 * Get the designs collection path for a team
 */
export function getTeamDesignsPath(teamId: string): string {
  return `teams/${teamId}/designs`;
}

/**
 * Get the design versions collection path
 */
export function getDesignVersionsPath(teamId: string, designId: string): string {
  return `teams/${teamId}/designs/${designId}/versions`;
}

// ============= NEW: Collection helpers with Firestore references =============

// Team collections
export const teamDoc = (t: string) => doc(db, `teams/${t}`);
export const projectsCol = (t: string) => collection(db, `teams/${t}/projects`);
export const projectDoc = (t: string, p: string) => doc(db, `teams/${t}/projects/${p}`);

// ✅ NEW: Nested design paths (under projects)
export const projectDesignsCol = (t: string, p: string) => 
  collection(db, `teams/${t}/projects/${p}/designs`);
export const projectDesignDoc = (t: string, p: string, d: string) => 
  doc(db, `teams/${t}/projects/${p}/designs/${d}`);
export const projectVersionsCol = (t: string, p: string, d: string) => 
  collection(db, `teams/${t}/projects/${p}/designs/${d}/versions`);
export const projectVersionDoc = (t: string, p: string, d: string, v: string) => 
  doc(db, `teams/${t}/projects/${p}/designs/${d}/versions/${v}`);

// Legacy design paths (team root - for fallback)
export const designsCol = (t: string) => collection(db, `teams/${t}/designs`);
export const designDoc = (t: string, d: string) => doc(db, `teams/${t}/designs/${d}`);
export const versionsCol = (t: string, d: string) => 
  collection(db, `teams/${t}/designs/${d}/versions`);
export const versionDoc = (t: string, d: string, v: string) => 
  doc(db, `teams/${t}/designs/${d}/versions/${v}`);

/**
 * Get the assets collection path for a team
 */
export function getTeamAssetsPath(teamId: string): string {
  return `teams/${teamId}/assets`;
}

/**
 * Get the asset path in Storage
 */
export function getAssetStoragePath(teamId: string, assetId: string): string {
  return `teams/${teamId}/assets/${assetId}`;
}

/**
 * Legacy collection paths (for fallback)
 */
export const LEGACY_COLLECTIONS = {
  projects: 'projects',
  designs: 'designs',
  designFiles: 'designFiles',
  folders: 'folders'
} as const;

/**
 * Determine if team scope should be used
 */
export function shouldUseTeamScope(): boolean {
  return FLAGS.teamScope && FLAGS.newReadsFirst;
}

/**
 * Get active team ID - async version for better reliability
 */
export async function getActiveTeamId(): Promise<string | null> {
  if (!FLAGS.teamScope) return null;
  
  // 1. Firebase Auth에서 직접 가져오기
  try {
    const { getCurrentUserAsync } = await import('@/firebase/auth');
    const user = await getCurrentUserAsync();
    if (user?.uid) {
      return `personal_${user.uid}`;
    }
  } catch (e) {
    console.log('Firebase Auth 확인 실패, fallback 사용');
  }
  
  // 2. localStorage fallback (동기 호출을 위해 유지)
  const storedTeamId = localStorage.getItem('activeTeamId');
  if (storedTeamId) return storedTeamId;
  
  const userId = localStorage.getItem('userId');
  if (userId) return `personal_${userId}`;
  
  return null;
}