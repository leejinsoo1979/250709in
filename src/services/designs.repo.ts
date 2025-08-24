/**
 * Designs repository - handles team-scoped and legacy design data access
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
  getTeamDesignsPath,
  getDesignVersionsPath,
  LEGACY_COLLECTIONS,
  shouldUseTeamScope,
  getActiveTeamId,
  projectDesignsCol,
  projectDesignDoc,
  projectVersionsCol,
  designsCol,
  designDoc
} from '@/firebase/collections';
import { DesignFile, DesignFileSummary } from '@/firebase/types';
import { saveDesignSnapshot } from '@/firebase/designs';

/**
 * List design files with nested project priority, team-scope, and legacy fallback
 */
export async function listDesignFiles(
  projectId: string,
  userId: string,
  teamId?: string
): Promise<{ designs: DesignFileSummary[]; error: string | null }> {
  try {
    console.log('📂 [listDesignFiles] 시작:', {
      projectId,
      userId,
      teamId,
      FLAGS,
      activeTeamId: teamId || await getActiveTeamId()
    });
    
    const designs: DesignFileSummary[] = [];
    const activeTeamId = teamId || await getActiveTeamId();
    
    // nested path 스킵
    if (false) {  // nested path 비활성화
      try {
        const nestedPath = `teams/${activeTeamId}/projects/${projectId}/designs`;
        console.log('📂 Trying nested path:', nestedPath);
        
        const nestedQuery = query(
          projectDesignsCol(activeTeamId, projectId),
          orderBy('updatedAt', 'desc')
        );
        
        const nestedSnapshot = await getDocs(nestedQuery);
        console.log('📂 Nested snapshot empty?', nestedSnapshot.empty, 'size:', nestedSnapshot.size);
        
        if (!nestedSnapshot.empty) {
          nestedSnapshot.forEach((doc) => {
            const data = doc.data();
            console.log('📂 Found design in nested:', { id: doc.id, name: data.name });
            designs.push({
              id: doc.id,
              name: data.name,
              projectId: data.projectId,
              folderId: data.folderId,
              updatedAt: data.updatedAt,
              spaceSize: {
                width: data.spaceConfig?.width || 0,
                height: data.spaceConfig?.height || 0,
                depth: data.spaceConfig?.depth || 0,
              },
              furnitureCount: data.furniture?.placedModules?.length || 0,
              thumbnail: data.thumbnail,
              spaceConfig: data.spaceConfig,
              furniture: data.furniture
            });
          });
          
          console.log('🎨 Found designs in nested project path:', designs.length);
          return { designs, error: null };
        }
      } catch (error) {
        console.log('Nested project designs error:', error);
      }
    }
    
    // Team-scoped path 스킵
    if (false) {  // team scope 비활성화
      try {
        const teamPath = getTeamDesignsPath(activeTeamId);
        console.log('📂 Trying team-scoped path:', teamPath);
        
        const teamQuery = query(
          collection(db, teamPath),
          where('projectId', '==', projectId),
          orderBy('updatedAt', 'desc')
        );
        
        const teamSnapshot = await getDocs(teamQuery);
        console.log('📂 Team snapshot empty?', teamSnapshot.empty, 'size:', teamSnapshot.size);
        
        if (!teamSnapshot.empty) {
          teamSnapshot.forEach((doc) => {
            const data = doc.data();
            console.log('📂 Found design in team-scoped:', { id: doc.id, name: data.name });
            designs.push({
              id: doc.id,
              name: data.name,
              projectId: data.projectId,
              folderId: data.folderId,
              updatedAt: data.updatedAt,
              spaceSize: {
                width: data.spaceConfig?.width || 0,
                height: data.spaceConfig?.height || 0,
                depth: data.spaceConfig?.depth || 0,
              },
              furnitureCount: data.furniture?.placedModules?.length || 0,
              thumbnail: data.thumbnail,
              spaceConfig: data.spaceConfig,
              furniture: data.furniture
            });
          });
          
          console.log('🎨 Found designs in team scope:', designs.length);
          return { designs, error: null };
        }
      } catch (error) {
        console.log('Team-scoped designs error:', error);
      }
    }
    
    // Fallback 2: Legacy path (designFiles collection)
    console.log('📂 Trying legacy path: designFiles collection');
    const legacyQuery = query(
      collection(db, LEGACY_COLLECTIONS.designFiles),
      where('projectId', '==', projectId),
      orderBy('updatedAt', 'desc')
    );
    
    const legacySnapshot = await getDocs(legacyQuery);
    console.log('📂 Legacy snapshot empty?', legacySnapshot.empty, 'size:', legacySnapshot.size);
    
    legacySnapshot.forEach((doc) => {
      const data = doc.data();
      console.log('📂 Found design in legacy:', { 
        id: doc.id, 
        name: data.name, 
        projectId: data.projectId,
        furniture: data.furniture?.placedModules?.length || 0
      });
      designs.push({
        id: doc.id,
        name: data.name,
        projectId: data.projectId,
        folderId: data.folderId,
        updatedAt: data.updatedAt,
        spaceSize: {
          width: data.spaceConfig?.width || 0,
          height: data.spaceConfig?.height || 0,
          depth: data.spaceConfig?.depth || 0,
        },
        furnitureCount: data.furniture?.placedModules?.length || 0,
        thumbnail: data.thumbnail,
        spaceConfig: data.spaceConfig,
        furniture: data.furniture
      });
    });
    
    console.log('🎨 Found designs in legacy:', designs.length);
    return { designs, error: null };
    
  } catch (error) {
    console.error('Error listing design files:', error);
    return { 
      designs: [], 
      error: error instanceof Error ? error.message : 'Failed to list designs' 
    };
  }
}

/**
 * Get a single design file with nested project priority, team-scope, and legacy fallback
 */
export async function getDesignFile(
  designId: string,
  projectId: string,
  teamId?: string
): Promise<{ design: DesignFile | null; error: string | null }> {
  try {
    const activeTeamId = teamId || getActiveTeamId();
    
    // Try nested project path first if enabled
    if (FLAGS.nestedDesigns && FLAGS.newReadsFirst && activeTeamId && projectId) {
      try {
        const nestedDesignRef = projectDesignDoc(activeTeamId, projectId, designId);
        const nestedDoc = await getDoc(nestedDesignRef);
        
        if (nestedDoc.exists()) {
          console.log('🎨 Found design in nested project path');
          return {
            design: { id: nestedDoc.id, ...nestedDoc.data() } as DesignFile,
            error: null
          };
        }
      } catch (error) {
        console.log('Nested project design not found, falling back to team scope');
      }
    }
    
    // Fallback 1: Team-scoped path
    if (shouldUseTeamScope() && activeTeamId) {
      try {
        const teamPath = getTeamDesignsPath(activeTeamId);
        const designRef = doc(db, teamPath, designId);
        const teamDoc = await getDoc(designRef);
        
        if (teamDoc.exists()) {
          const data = teamDoc.data();
          // Verify project ID matches
          if (data.projectId === projectId) {
            console.log('🎨 Found design in team scope');
            return {
              design: { id: teamDoc.id, ...data } as DesignFile,
              error: null
            };
          }
        }
      } catch (error) {
        console.log('Team-scoped design not found, falling back to legacy');
      }
    }
    
    // Fallback 2: Legacy path
    const legacyRef = doc(db, LEGACY_COLLECTIONS.designFiles, designId);
    const legacyDoc = await getDoc(legacyRef);
    
    if (legacyDoc.exists()) {
      const data = legacyDoc.data();
      // Verify project ID matches
      if (data.projectId === projectId) {
        console.log('🎨 Found design in legacy');
        return {
          design: { id: legacyDoc.id, ...data } as DesignFile,
          error: null
        };
      }
    }
    
    return { design: null, error: 'Design not found' };
    
  } catch (error) {
    console.error('Error getting design file:', error);
    return { 
      design: null, 
      error: error instanceof Error ? error.message : 'Failed to get design' 
    };
  }
}

/**
 * List design versions (team-scoped only, no legacy fallback)
 */
export async function listDesignVersions(
  designId: string,
  teamId?: string
): Promise<{ versions: any[]; error: string | null }> {
  try {
    const versions: any[] = [];
    
    if (!shouldUseTeamScope()) {
      // Versions are only supported in team scope
      return { versions: [], error: null };
    }
    
    const activeTeamId = teamId || getActiveTeamId();
    if (!activeTeamId) {
      return { versions: [], error: 'No active team' };
    }
    
    const versionsPath = getDesignVersionsPath(activeTeamId, designId);
    const versionsQuery = query(
      collection(db, versionsPath),
      orderBy('createdAt', 'desc')
    );
    
    const snapshot = await getDocs(versionsQuery);
    
    snapshot.forEach((doc) => {
      versions.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    console.log('📚 Found versions:', versions.length);
    return { versions, error: null };
    
  } catch (error) {
    console.error('Error listing versions:', error);
    return { 
      versions: [], 
      error: error instanceof Error ? error.message : 'Failed to list versions' 
    };
  }
}

/**
 * Get current version ID for a design
 */
export async function getCurrentVersionId(
  teamId: string,
  designId: string
): Promise<string | null> {
  try {
    const designPath = getTeamDesignsPath(teamId);
    const designRef = doc(db, designPath, designId);
    const designDoc = await getDoc(designRef);
    
    if (designDoc.exists()) {
      const data = designDoc.data();
      return data.current_version_id || null;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting current version ID:', error);
    return null;
  }
}

/**
 * Save design with nested project paths and dual-write support
 */
export async function saveDesign({ 
  teamId, 
  userId, 
  projectId,
  id, 
  data 
}: {
  teamId: string;
  userId: string;
  projectId?: string;
  id: string;
  data: any;
}): Promise<{ success: boolean; error?: string; pathUsed?: 'nested' | 'legacy' }> {
  // HOTFIX: Enforce projectId requirement
  if (!projectId) {
    throw new Error('projectId required');
  }
  
  try {
    const now = serverTimestamp();
    const designData = { 
      ...data, 
      userId, 
      teamId, 
      projectId,
      updatedAt: now 
    };
    
    // Create immutable version snapshot before saving
    // TODO: Update saveDesignSnapshot to support nested paths
    await saveDesignSnapshot({
      teamId,
      designId: id,
      userId,
      state: data,
      options: data.options || {},
      bom: data.bom || {},
      cutList: data.cutList || {}
    });
    
    let pathUsed: 'nested' | 'legacy' = 'nested';
    
    // Primary save: Always use nested path when projectId exists
    if (FLAGS.nestedDesigns) {
      await setDoc(
        projectDesignDoc(teamId, projectId, id), 
        designData, 
        { merge: true }
      );
      console.log('✅ Saved to nested project path:', `teams/${teamId}/projects/${projectId}/designs/${id}`);
      pathUsed = 'nested';
    } else {
      // Fallback to team-level designs
      const teamPath = getTeamDesignsPath(teamId);
      await setDoc(
        doc(db, teamPath, id), 
        designData, 
        { merge: true }
      );
      console.log('✅ Saved to team path:', `${teamPath}/${id}`);
      pathUsed = 'legacy';
    }
    
    // Dual-write if enabled
    if (FLAGS.dualWrite) {
      // Write to team-level designs for backward compatibility
      const teamPath = getTeamDesignsPath(teamId);
      await setDoc(
        doc(db, teamPath, id), 
        designData, 
        { merge: true }
      );
      console.log('✅ Dual-write to team path:', `${teamPath}/${id}`);
      
      // Write to legacy designFiles collection
      await setDoc(
        doc(db, LEGACY_COLLECTIONS.designFiles, id), 
        { ...data, userId, projectId, updatedAt: now }, 
        { merge: true }
      );
      console.log('✅ Dual-write to legacy path:', `${LEGACY_COLLECTIONS.designFiles}/${id}`);
    }
    
    return { success: true, pathUsed };
  } catch (error) {
    console.error('Error saving design:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to save design' 
    };
  }
}