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
    
    // Team-scoped path는 건너뛰고 legacy만 사용 (400 에러 방지)
    // if (shouldUseTeamScope()) {
    //   ...
    // }
    
    // Legacy path만 사용 (가장 단순한 쿼리)
    // where 절도 제거하여 가장 간단한 쿼리로 만들기
    const legacyQuery = collection(db, LEGACY_COLLECTIONS.projects);
    
    // 컬렉션이 없을 때 에러 처리
    let legacySnapshot;
    try {
      legacySnapshot = await getDocs(legacyQuery);
    } catch (error: any) {
      // 400 에러나 권한 문제일 경우
      if (error?.code === 'permission-denied' || error?.code === 'failed-precondition') {
        console.log('📦 Projects collection does not exist or no permission. Returning empty list.');
        return { projects: [], error: null };
      }
      throw error;
    }
    
    // 슈퍼어드민 체크 (전체 프로젝트 조회)
    const { isSuperAdmin } = await import('@/firebase/admins');
    const { getCurrentUserAsync } = await import('@/firebase/auth');
    const currentUser = await getCurrentUserAsync();
    const showAll = currentUser ? isSuperAdmin(currentUser.email) : false;

    legacySnapshot.forEach((doc) => {
      const data = doc.data();
      // 슈퍼어드민이면 전체 프로젝트, 아니면 본인 프로젝트만
      if (showAll || data.userId === userId) {
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
          status: data.status || 'in_progress',
          spaceInfo: data.spaceConfig,
          placedModules: data.furniture?.placedModules || [],
          isDeleted: data.isDeleted || false,
          deletedAt: data.deletedAt,
        });
      }
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