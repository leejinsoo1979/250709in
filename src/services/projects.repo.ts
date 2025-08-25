/**
 * Projects repository - handles team-scoped and legacy project data access
 */

import { 
  collection, 
  query, 
  where, 
  orderBy, 
  getDocs,
  getDoc,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import { FLAGS } from '@/flags';
import { 
  getTeamProjectsPath, 
  LEGACY_COLLECTIONS,
  shouldUseTeamScope,
  getActiveTeamId
} from '@/firebase/collections';
import { FirebaseProject, ProjectSummary } from '@/firebase/types';

/**
 * List projects with team-scope priority and legacy fallback
 */
export async function listProjects(
  userId: string, 
  teamId?: string
): Promise<{ projects: ProjectSummary[]; error: string | null }> {
  try {
    const projects: ProjectSummary[] = [];
    
    // Try team-scoped path first if enabled
    if (shouldUseTeamScope()) {
      const activeTeamId = teamId || getActiveTeamId();
      
      if (activeTeamId) {
        try {
          const teamPath = getTeamProjectsPath(activeTeamId);
          // orderBy를 제거하여 인덱스 문제 해결
          const teamQuery = query(
            collection(db, teamPath),
            where('userId', '==', userId)
          );
          
          const teamSnapshot = await getDocs(teamQuery);
          
          teamSnapshot.forEach((doc) => {
            const data = doc.data();
            projects.push({
              id: doc.id,
              title: data.title,
              createdAt: data.createdAt,
              updatedAt: data.updatedAt,
              furnitureCount: data.furniture?.placedModules?.length || 0,
              spaceSize: {
                width: data.spaceConfig?.width || 0,
                height: data.spaceConfig?.height || 0,
                depth: data.spaceConfig?.depth || 0,
              },
              thumbnail: data.thumbnail,
              spaceInfo: data.spaceConfig,
              placedModules: data.furniture?.placedModules || [],
            });
          });
          
          // If we found projects in team scope, return them
          if (projects.length > 0) {
            console.log('📦 Found projects in team scope:', projects.length);
            return { projects, error: null };
          }
        } catch (error) {
          console.log('Team-scoped path not found or error, falling back to legacy');
        }
      }
    }
    
    // Fallback to legacy path
    // orderBy를 제거하여 인덱스 문제 해결
    const legacyQuery = query(
      collection(db, LEGACY_COLLECTIONS.projects),
      where('userId', '==', userId)
    );
    
    const legacySnapshot = await getDocs(legacyQuery);
    
    legacySnapshot.forEach((doc) => {
      const data = doc.data();
      projects.push({
        id: doc.id,
        title: data.title,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        furnitureCount: data.stats?.furnitureCount || 0,
        spaceSize: {
          width: data.spaceConfig?.width || 0,
          height: data.spaceConfig?.height || 0,
          depth: data.spaceConfig?.depth || 0,
        },
        thumbnail: data.thumbnail,
        folderId: data.folderId,
        spaceInfo: data.spaceConfig,
        placedModules: data.furniture?.placedModules || [],
      });
    });
    
    // 클라이언트 측에서 정렬 수행
    projects.sort((a, b) => {
      // updatedAt으로 정렬 (최신 순)
      const timeA = a.updatedAt?.toMillis() || 0;
      const timeB = b.updatedAt?.toMillis() || 0;
      return timeB - timeA;
    });
    
    console.log('📦 Found projects in legacy:', projects.length);
    return { projects, error: null };
    
  } catch (error) {
    console.error('Error listing projects:', error);
    return { 
      projects: [], 
      error: error instanceof Error ? error.message : 'Failed to list projects' 
    };
  }
}

/**
 * Get a single project with team-scope priority and legacy fallback
 */
export async function getProject(
  projectId: string,
  userId: string,
  teamId?: string
): Promise<{ project: FirebaseProject | null; error: string | null }> {
  try {
    // Try team-scoped path first
    if (shouldUseTeamScope()) {
      const activeTeamId = teamId || getActiveTeamId();
      
      if (activeTeamId) {
        try {
          const teamPath = getTeamProjectsPath(activeTeamId);
          const projectRef = doc(db, teamPath, projectId);
          const projectDoc = await getDoc(projectRef);
          
          if (projectDoc.exists()) {
            const data = projectDoc.data();
            // Verify user has access
            if (data.userId === userId) {
              console.log('📦 Found project in team scope');
              return {
                project: { id: projectDoc.id, ...data } as FirebaseProject,
                error: null
              };
            }
          }
        } catch (error) {
          console.log('Team-scoped project not found, falling back to legacy');
        }
      }
    }
    
    // Fallback to legacy path
    const legacyRef = doc(db, LEGACY_COLLECTIONS.projects, projectId);
    const legacyDoc = await getDoc(legacyRef);
    
    if (legacyDoc.exists()) {
      const data = legacyDoc.data();
      // Verify user has access
      if (data.userId === userId) {
        console.log('📦 Found project in legacy');
        return {
          project: { id: legacyDoc.id, ...data } as FirebaseProject,
          error: null
        };
      }
    }
    
    return { project: null, error: 'Project not found' };
    
  } catch (error) {
    console.error('Error getting project:', error);
    return { 
      project: null, 
      error: error instanceof Error ? error.message : 'Failed to get project' 
    };
  }
}

/**
 * Save project with dual-write support
 */
export async function saveProject({ 
  teamId, 
  userId, 
  id, 
  data 
}: {
  teamId: string;
  userId: string;
  id: string;
  data: any;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const now = serverTimestamp();
    
    // Team path save
    const teamPath = getTeamProjectsPath(teamId);
    await setDoc(
      doc(db, teamPath, id), 
      { ...data, userId, teamId, updatedAt: now }, 
      { merge: true }
    );
    
    console.log('✅ Saved to team path:', `${teamPath}/${id}`);
    
    // Legacy dual-write if enabled
    if (FLAGS.dualWrite) {
      await setDoc(
        doc(db, LEGACY_COLLECTIONS.projects, id), 
        { ...data, userId, updatedAt: now }, 
        { merge: true }
      );
      console.log('✅ Dual-write to legacy path:', `${LEGACY_COLLECTIONS.projects}/${id}`);
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error saving project:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to save project' 
    };
  }
}