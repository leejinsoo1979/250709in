/**
 * Firebase collection path helpers for team-scoped data
 */

import { FLAGS } from '@/flags';

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
 * Get active team ID from localStorage
 */
export function getActiveTeamId(): string | null {
  if (!FLAGS.teamScope) return null;
  
  // Get from localStorage
  const storedTeamId = localStorage.getItem('activeTeamId');
  if (storedTeamId) return storedTeamId;
  
  // Fallback to personal team
  const userId = localStorage.getItem('userId');
  if (userId) return `personal_${userId}`;
  
  return null;
}