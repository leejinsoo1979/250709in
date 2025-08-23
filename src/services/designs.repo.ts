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
  getActiveTeamId
} from '@/firebase/collections';
import { DesignFile, DesignFileSummary } from '@/firebase/types';
import { saveDesignSnapshot } from '@/firebase/designs';

/**
 * List design files with team-scope priority and legacy fallback
 */
export async function listDesignFiles(
  projectId: string,
  userId: string,
  teamId?: string
): Promise<{ designs: DesignFileSummary[]; error: string | null }> {
  try {
    const designs: DesignFileSummary[] = [];
    
    // Try team-scoped path first if enabled
    if (shouldUseTeamScope()) {
      const activeTeamId = teamId || getActiveTeamId();
      
      if (activeTeamId) {
        try {
          const teamPath = getTeamDesignsPath(activeTeamId);
          const teamQuery = query(
            collection(db, teamPath),
            where('projectId', '==', projectId),
            orderBy('updatedAt', 'desc')
          );
          
          const teamSnapshot = await getDocs(teamQuery);
          
          teamSnapshot.forEach((doc) => {
            const data = doc.data();
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
          
          // If we found designs in team scope, return them
          if (designs.length > 0) {
            console.log('🎨 Found designs in team scope:', designs.length);
            return { designs, error: null };
          }
        } catch (error) {
          console.log('Team-scoped designs not found, falling back to legacy');
        }
      }
    }
    
    // Fallback to legacy path (designFiles collection)
    const legacyQuery = query(
      collection(db, LEGACY_COLLECTIONS.designFiles),
      where('projectId', '==', projectId),
      orderBy('updatedAt', 'desc')
    );
    
    const legacySnapshot = await getDocs(legacyQuery);
    
    legacySnapshot.forEach((doc) => {
      const data = doc.data();
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
 * Get a single design file with team-scope priority and legacy fallback
 */
export async function getDesignFile(
  designId: string,
  projectId: string,
  teamId?: string
): Promise<{ design: DesignFile | null; error: string | null }> {
  try {
    // Try team-scoped path first
    if (shouldUseTeamScope()) {
      const activeTeamId = teamId || getActiveTeamId();
      
      if (activeTeamId) {
        try {
          const teamPath = getTeamDesignsPath(activeTeamId);
          const designRef = doc(db, teamPath, designId);
          const designDoc = await getDoc(designRef);
          
          if (designDoc.exists()) {
            const data = designDoc.data();
            // Verify project ID matches
            if (data.projectId === projectId) {
              console.log('🎨 Found design in team scope');
              return {
                design: { id: designDoc.id, ...data } as DesignFile,
                error: null
              };
            }
          }
        } catch (error) {
          console.log('Team-scoped design not found, falling back to legacy');
        }
      }
    }
    
    // Fallback to legacy path
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
 * Save design with dual-write support
 */
export async function saveDesign({ 
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
    
    // Create immutable version snapshot before saving
    await saveDesignSnapshot({
      teamId,
      designId: id,
      userId,
      state: data,
      options: data.options || {},
      bom: data.bom || {},
      cutList: data.cutList || {}
    });
    
    // Team path save
    const teamPath = getTeamDesignsPath(teamId);
    await setDoc(
      doc(db, teamPath, id), 
      { ...data, userId, teamId, updatedAt: now }, 
      { merge: true }
    );
    
    console.log('✅ Saved to team path:', `${teamPath}/${id}`);
    
    // Legacy dual-write if enabled
    if (FLAGS.dualWrite) {
      await setDoc(
        doc(db, LEGACY_COLLECTIONS.designFiles, id), 
        { ...data, userId, updatedAt: now }, 
        { merge: true }
      );
      console.log('✅ Dual-write to legacy path:', `${LEGACY_COLLECTIONS.designFiles}/${id}`);
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error saving design:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to save design' 
    };
  }
}